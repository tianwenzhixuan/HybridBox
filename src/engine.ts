import fs from "node:fs";
import { KEEPALIVE_CHECK_MS, KEEPALIVE_IDLE_MS, MAX_SEND_FILE_BYTES } from "./constants.js";
import { log } from "./logger.js";
import { runClaude } from "./claude/provider.js";
import { SessionStore } from "./session.js";
import { StreamFlusher } from "./stream.js";
import { dispatchCommand, isKnownCommand, parseCommand } from "./commands/router.js";
import type { CommandContext } from "./commands/handlers.js";
import type { IlinkApi } from "./wechat/api.js";
import type { Sender } from "./wechat/sender.js";
import { extractInbound } from "./wechat/media.js";
import type { InboundMessage, WeixinMessage } from "./wechat/types.js";

const WAIT_MESSAGES = [
  "⏳ 还在处理中，请稍候…",
  "🔧 正在干活，马上好…",
  "🤔 思考中，再等我一下…",
  "⚙️ 任务执行中，请耐心等待…",
  "📡 仍在运行，稍等片刻…",
];

/**
 * The heart of HybridBox: serialises inbound messages, routes commands,
 * drives Claude Code, streams output back, and auto-pushes generated files.
 */
export class Engine {
  private queue: WeixinMessage[] = [];
  private draining = false;
  private activeAbort: AbortController | null = null;

  constructor(
    private api: IlinkApi,
    private sender: Sender,
    private store: SessionStore,
  ) {}

  /** Called by the monitor for each inbound user message. */
  enqueue(msg: WeixinMessage): void {
    // Priority interrupt: /stop and /clear should not wait behind a long task.
    const quickText = firstText(msg);
    const cmd = quickText ? parseCommand(quickText) : null;
    if (cmd && (cmd.name === "stop" || cmd.name === "clear") && this.store.get().state === "processing") {
      void this.handlePriority(msg, cmd.name);
      return;
    }
    this.queue.push(msg);
    void this.drain();
  }

  private async handlePriority(msg: WeixinMessage, name: string): Promise<void> {
    const userId = msg.from_user_id ?? "";
    const ctxToken = msg.context_token;
    this.requestStop();
    if (name === "clear") this.store.clear();
    this.queue = [];
    await this.sender
      .sendText(userId, name === "clear" ? "✅ 已中断并开启新会话。" : "🛑 已中断当前任务。", ctxToken)
      .catch((e) => log.error(e));
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length) {
        const msg = this.queue.shift()!;
        try {
          await this.handle(msg);
        } catch (e) {
          log.error("Message handling failed:", (e as Error).message);
          await this.sender
            .sendText(msg.from_user_id ?? "", `❌ 处理出错：${(e as Error).message}`, msg.context_token)
            .catch(() => {});
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private async handle(msg: WeixinMessage): Promise<void> {
    const inbound = await extractInbound(msg);
    log.info(`Inbound [${inbound.kind}] from ${inbound.fromUserId}: ${inbound.text.slice(0, 80)}`);

    const cmd = parseCommand(inbound.text);
    if (cmd && isKnownCommand(cmd.name)) {
      const ctx: CommandContext = {
        store: this.store,
        args: cmd.args,
        requestStop: () => this.requestStop(),
        sendLocalFile: (p) => this.sender.sendFile(inbound.fromUserId, p, inbound.contextToken),
      };
      const { reply } = await dispatchCommand(cmd, ctx);
      if (reply) await this.sender.sendText(inbound.fromUserId, reply, inbound.contextToken);
      return;
    }

    if (!inbound.text && inbound.attachments.length === 0) return;
    await this.runClaudeFor(inbound);
  }

  private async runClaudeFor(inbound: InboundMessage): Promise<void> {
    this.store.setState("processing");
    this.store.addHistory("user", inbound.text || `[${inbound.kind}]`);

    const abort = new AbortController();
    this.activeAbort = abort;
    const stopTyping = this.sender.startTyping(inbound.contextToken);
    const flusher = new StreamFlusher(this.sender, inbound.fromUserId, inbound.contextToken);

    const keepalive = setInterval(() => {
      if (flusher.idleMs() > KEEPALIVE_IDLE_MS) {
        flusher.noteActivity();
        void this.sender
          .sendText(inbound.fromUserId, pick(WAIT_MESSAGES), inbound.contextToken)
          .catch(() => {});
      }
    }, KEEPALIVE_CHECK_MS);

    let full = "";
    try {
      const usedResume = this.store.get().sdkSessionId;
      let result = await this.invoke(inbound, flusher, abort.signal, (t) => (full += t));

      // Resume fallback: a corrupted session id can fail the first run.
      if (result.error && result.error !== "__ABORTED__" && usedResume) {
        log.warn("Claude run failed with --resume; retrying with a fresh session.");
        this.store.patch({ sdkSessionId: undefined });
        full = "";
        result = await this.invoke(inbound, flusher, abort.signal, (t) => (full += t));
      }

      await flusher.flushAll();

      if (result.sessionId) this.store.patch({ sdkSessionId: result.sessionId });

      if (result.error === "__ABORTED__") {
        // handlePriority already messaged the user.
      } else if (result.error) {
        await this.sender.sendText(inbound.fromUserId, `❌ ${result.error}`, inbound.contextToken);
      } else {
        this.store.addHistory("assistant", full);
        await this.autoPushFiles(full, inbound);
      }
    } finally {
      clearInterval(keepalive);
      stopTyping();
      this.activeAbort = null;
      this.store.setState("idle");
    }
  }

  private invoke(
    inbound: InboundMessage,
    flusher: StreamFlusher,
    signal: AbortSignal,
    collect: (t: string) => void,
  ) {
    const s = this.store.get();
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
        autoApprove: true,
        imagePaths: images,
        signal,
      },
      {
        onText: (t) => {
          collect(t);
          flusher.push(t);
        },
        onSessionId: (id) => this.store.patch({ sdkSessionId: id }),
        onBlockEnd: () => flusher.flushOnBoundary(),
      },
    );
  }

  /** Abort the running Claude query, if any. */
  requestStop(): boolean {
    if (this.activeAbort) {
      this.activeAbort.abort();
      return true;
    }
    return false;
  }

  /** Detect local file paths in Claude's reply and push them to WeChat. */
  private async autoPushFiles(text: string, inbound: InboundMessage): Promise<void> {
    const paths = detectFilePaths(text);
    for (const p of paths) {
      try {
        if (fs.existsSync(p) && fs.statSync(p).isFile() && fs.statSync(p).size <= MAX_SEND_FILE_BYTES) {
          await this.sender.sendFile(inbound.fromUserId, p, inbound.contextToken);
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

/** Extract `file://...` URLs and Windows absolute paths that exist on disk. */
export function detectFilePaths(text: string): string[] {
  const found = new Set<string>();
  const fileUrl = /file:\/\/\/?([A-Za-z]:[\\/][^\s"'`<>|*?\n]+\.[A-Za-z0-9]{1,8})/g;
  const winPath = /(?<![\w/])([A-Za-z]:\\(?:[^\s"'`<>|*?\n\\]+\\)*[^\s"'`<>|*?\n\\]+\.[A-Za-z0-9]{1,8})/g;
  for (const m of text.matchAll(fileUrl)) found.add(m[1].replace(/\//g, "\\"));
  for (const m of text.matchAll(winPath)) found.add(m[1]);
  return [...found];
}
