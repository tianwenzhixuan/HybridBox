import fs from "node:fs";
import { KEEPALIVE_CHECK_MS, KEEPALIVE_IDLE_MS, MAX_SEND_FILE_BYTES } from "./constants.js";
import { getOwnerId, loadConfig } from "./config.js";
import { log } from "./logger.js";
import { runClaude } from "./claude/provider.js";
import { SessionStore } from "./session.js";
import { StreamFlusher } from "./stream.js";
import { dispatchCommand, isKnownCommand, parseCommand } from "./commands/router.js";
import type { CommandContext } from "./commands/handlers.js";
import { renderQrPng } from "./qr.js";
import { startQrLogin, waitForQrScan } from "./wechat/login.js";
import { saveAccount } from "./wechat/accounts.js";
import type { AccountManager } from "./account-manager.js";
import type { Sender } from "./wechat/sender.js";
import { extractInbound } from "./wechat/media.js";
import type { Account, InboundMessage, WeixinMessage } from "./wechat/types.js";

const WAIT_MESSAGES = [
  "⏳ 还在处理中，请稍候…",
  "🔧 正在干活，马上好…",
  "🤔 思考中，再等我一下…",
  "⚙️ 任务执行中，请耐心等待…",
  "📡 仍在运行，稍等片刻…",
];

interface UserContext {
  account: Account;
  sender: Sender;
  store: SessionStore;
  queue: WeixinMessage[];
  draining: boolean;
  activeAbort: AbortController | null;
}

/**
 * The heart of HybridBox. In the multi-account model, every WeChat user binds
 * their own ClawBot (their own token); all of those funnel into this single
 * engine. Each user gets an isolated session + queue and is replied to through
 * *their own* account's sender, so 2–5 users can talk to Claude Code in
 * parallel without crossing wires.
 */
export class Engine {
  private users = new Map<string, UserContext>();
  private accountManager: AccountManager | null = null;

  /** Wire up the account manager so /adduser and /kick can take effect live. */
  attachAccountManager(am: AccountManager): void {
    this.accountManager = am;
  }

  private getOrCreate(account: Account, sender: Sender): UserContext {
    const key = account.userId || account.accountId;
    let uctx = this.users.get(key);
    if (!uctx) {
      uctx = {
        account,
        sender,
        store: new SessionStore(key),
        queue: [],
        draining: false,
        activeAbort: null,
      };
      this.users.set(key, uctx);
      log.info(`New user context: ${key}`);
    } else {
      uctx.sender = sender; // refresh in case the token/sender rotated
    }
    return uctx;
  }

  /** Called by each account's monitor for every inbound message. */
  enqueue(account: Account, sender: Sender, msg: WeixinMessage): void {
    const key = account.userId || account.accountId;
    if (!key) return;
    const uctx = this.getOrCreate(account, sender);

    // Priority interrupt: /stop and /clear shouldn't wait behind a long task.
    const quickText = firstText(msg);
    const cmd = quickText ? parseCommand(quickText) : null;
    if (cmd && (cmd.name === "stop" || cmd.name === "clear") && uctx.store.get().state === "processing") {
      void this.handlePriority(uctx, msg, cmd.name);
      return;
    }
    uctx.queue.push(msg);
    void this.drain(uctx);
  }

  private async handlePriority(uctx: UserContext, msg: WeixinMessage, name: string): Promise<void> {
    const to = msg.from_user_id ?? uctx.account.userId;
    const ctxToken = msg.context_token;
    this.requestStop(uctx);
    if (name === "clear") uctx.store.clear();
    uctx.queue = [];
    await uctx.sender
      .sendText(to, name === "clear" ? "✅ 已中断并开启新会话。" : "🛑 已中断当前任务。", ctxToken)
      .catch((e) => log.error(e));
  }

  private async drain(uctx: UserContext): Promise<void> {
    if (uctx.draining) return;
    uctx.draining = true;
    try {
      while (uctx.queue.length) {
        const msg = uctx.queue.shift()!;
        try {
          await this.handle(uctx, msg);
        } catch (e) {
          log.error("Message handling failed:", (e as Error).message);
          await uctx.sender
            .sendText(msg.from_user_id ?? uctx.account.userId, `❌ 处理出错：${(e as Error).message}`, msg.context_token)
            .catch(() => {});
        }
      }
    } finally {
      uctx.draining = false;
    }
  }

  private async handle(uctx: UserContext, msg: WeixinMessage): Promise<void> {
    const inbound = await extractInbound(msg);
    log.info(`Inbound [${inbound.kind}] from ${inbound.fromUserId}: ${inbound.text.slice(0, 80)}`);

    const cmd = parseCommand(inbound.text);
    if (cmd && isKnownCommand(cmd.name)) {
      const ctx: CommandContext = {
        store: uctx.store,
        args: cmd.args,
        userId: inbound.fromUserId,
        isOwner: inbound.fromUserId === getOwnerId(),
        requestStop: () => this.requestStop(uctx),
        sendLocalFile: (p) => uctx.sender.sendFile(inbound.fromUserId, p, inbound.contextToken),
        addUser: () => this.startAddUserFlow(uctx, inbound),
        listUsers: () => this.listUsers(),
        kickUser: (sel) => this.kickUser(sel),
      };
      const { reply } = await dispatchCommand(cmd, ctx);
      if (reply) await uctx.sender.sendText(inbound.fromUserId, reply, inbound.contextToken);
      return;
    }

    if (!inbound.text && inbound.attachments.length === 0) return;
    await this.runClaudeFor(uctx, inbound);
  }

  private async runClaudeFor(uctx: UserContext, inbound: InboundMessage): Promise<void> {
    uctx.store.setState("processing");
    uctx.store.addHistory("user", inbound.text || `[${inbound.kind}]`);

    const abort = new AbortController();
    uctx.activeAbort = abort;
    const stopTyping = uctx.sender.startTyping(inbound.contextToken);
    const flusher = new StreamFlusher(uctx.sender, inbound.fromUserId, inbound.contextToken);

    const keepalive = setInterval(() => {
      if (flusher.idleMs() > KEEPALIVE_IDLE_MS) {
        flusher.noteActivity();
        void uctx.sender.sendText(inbound.fromUserId, pick(WAIT_MESSAGES), inbound.contextToken).catch(() => {});
      }
    }, KEEPALIVE_CHECK_MS);

    let full = "";
    try {
      const usedResume = uctx.store.get().sdkSessionId;
      let result = await this.invoke(uctx, inbound, flusher, abort.signal, (t) => (full += t));

      // Resume fallback: a corrupted session id can fail the first run.
      if (result.error && result.error !== "__ABORTED__" && usedResume) {
        log.warn("Claude run failed with --resume; retrying with a fresh session.");
        uctx.store.patch({ sdkSessionId: undefined });
        full = "";
        result = await this.invoke(uctx, inbound, flusher, abort.signal, (t) => (full += t));
      }

      await flusher.flushAll();

      if (result.sessionId) uctx.store.patch({ sdkSessionId: result.sessionId });

      if (result.error === "__ABORTED__") {
        // handlePriority already messaged the user.
      } else if (result.error) {
        await uctx.sender.sendText(inbound.fromUserId, `❌ ${result.error}`, inbound.contextToken);
      } else {
        uctx.store.addHistory("assistant", full);
        await this.autoPushFiles(uctx, full, inbound);
      }
    } finally {
      clearInterval(keepalive);
      stopTyping();
      uctx.activeAbort = null;
      uctx.store.setState("idle");
    }
  }

  private invoke(
    uctx: UserContext,
    inbound: InboundMessage,
    flusher: StreamFlusher,
    signal: AbortSignal,
    collect: (t: string) => void,
  ) {
    const s = uctx.store.get();
    const images = inbound.attachments.filter((p) => /\.(png|jpe?g|gif|webp|bmp)$/i.test(p));
    const otherFiles = inbound.attachments.filter((p) => !images.includes(p));

    let prompt = inbound.text;
    if (otherFiles.length) {
      prompt += `\n\n[用户发来文件，已保存到本地：${otherFiles.join(", ")}]`;
    }
    if (!prompt.trim() && images.length) prompt = "请查看我发送的图片。";

    return runClaude(
      {
        prompt,
        workingDirectory: s.workingDirectory,
        model: s.model,
        systemPrompt: s.systemPrompt,
        resumeSessionId: s.sdkSessionId,
        autoApprove: loadConfig().autoApprove,
        imagePaths: images,
        signal,
      },
      {
        onText: (t) => {
          collect(t);
          flusher.push(t);
        },
        onSessionId: (id) => uctx.store.patch({ sdkSessionId: id }),
        onBlockEnd: () => flusher.flushOnBoundary(),
      },
    );
  }

  /** Abort the running Claude query for this user, if any. */
  requestStop(uctx: UserContext): boolean {
    if (uctx.activeAbort) {
      uctx.activeAbort.abort();
      return true;
    }
    return false;
  }

  // ---- Owner-only user management ----

  /** Generate an invite QR, send it to the owner, and bring the new user
   *  online live when they scan — no restart. */
  private async startAddUserFlow(uctx: UserContext, inbound: InboundMessage): Promise<void> {
    const { sender } = uctx;
    const to = inbound.fromUserId;
    const ctxToken = inbound.contextToken;
    try {
      await sender.sendText(to, "正在生成邀请二维码，请稍候…", ctxToken);
      const { qrContent, qrcodeId } = await startQrLogin();
      const png = await renderQrPng(qrContent, "invite");
      await sender.sendFile(to, png, ctxToken);
      await sender.sendText(
        to,
        "把这张二维码转发给新成员，用微信「扫一扫」登录即可加入（8 分钟内有效）。",
        ctxToken,
      );

      // Background wait — do NOT block the message queue.
      waitForQrScan(qrcodeId)
        .then((account) => {
          saveAccount(account);
          this.accountManager?.start(account);
          void sender.sendText(to, `✅ 新成员已加入并上线：${shortId(account.userId)}`, ctxToken);
        })
        .catch((e) => {
          void sender.sendText(to, `❌ 邀请未完成：${(e as Error).message}`, ctxToken);
        });
    } catch (e) {
      await sender.sendText(to, `❌ 生成二维码失败：${(e as Error).message}`, ctxToken).catch(() => {});
    }
  }

  private listUsers(): string {
    const accounts = this.accountManager?.list() ?? [];
    if (accounts.length === 0) return "当前没有在线用户。";
    const owner = getOwnerId();
    const lines = accounts.map((a, i) => {
      const tag = a.userId === owner ? "（机主）" : "";
      const busy = this.users.get(a.userId)?.store.get().state === "processing" ? " · 执行中" : "";
      return `${i + 1}. ${shortId(a.userId)}${tag}${busy}`;
    });
    return `👥 在线用户（${accounts.length}）：\n${lines.join("\n")}`;
  }

  private async kickUser(selector: string): Promise<string> {
    const sel = selector.trim();
    if (!sel) return "用法：/kick <序号或用户ID>";
    const accounts = this.accountManager?.list() ?? [];
    const owner = getOwnerId();

    let target: Account | undefined;
    const idx = Number(sel);
    if (Number.isInteger(idx) && idx >= 1 && idx <= accounts.length) {
      target = accounts[idx - 1];
    } else {
      target = accounts.find((a) => a.userId === sel);
    }
    if (!target) return `未找到用户：${sel}`;
    if (target.userId === owner) return "⛔ 不能移除机主自己。";

    const ok = this.accountManager?.remove(target.userId) ?? false;
    this.users.delete(target.userId);
    return ok ? `✅ 已移除用户：${shortId(target.userId)}` : `移除失败：${sel}`;
  }

  /** Detect local file paths in Claude's reply and push them to WeChat. */
  private async autoPushFiles(uctx: UserContext, text: string, inbound: InboundMessage): Promise<void> {
    const paths = detectFilePaths(text);
    for (const p of paths) {
      try {
        if (fs.existsSync(p) && fs.statSync(p).isFile() && fs.statSync(p).size <= MAX_SEND_FILE_BYTES) {
          await uctx.sender.sendFile(inbound.fromUserId, p, inbound.contextToken);
          log.info(`Auto-pushed file: ${p}`);
        }
      } catch (e) {
        log.warn(`Auto-push failed for ${p}:`, (e as Error).message);
      }
    }
  }
}

function firstText(msg: WeixinMessage): string {
  for (const item of msg.item_list ?? []) {
    if (item.text_item?.text) return item.text_item.text;
  }
  return "";
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

/** Extract `file://...` URLs and Windows absolute paths that exist on disk. */
export function detectFilePaths(text: string): string[] {
  const found = new Set<string>();
  const fileUrl = /file:\/\/\/?([A-Za-z]:[\\/][^\s"'`<>|*?\n]+\.[A-Za-z0-9]{1,8})/g;
  const winPath = /(?<![\w/])([A-Za-z]:\\(?:[^\s"'`<>|*?\n\\]+\\)*[^\s"'`<>|*?\n\\]+\.[A-Za-z0-9]{1,8})/g;
  for (const m of text.matchAll(fileUrl)) found.add(m[1].replace(/\//g, "\\"));
  for (const m of text.matchAll(winPath)) found.add(m[1]);
  return [...found];
}
