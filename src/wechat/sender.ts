import path from "node:path";
import { SEND_MIN_INTERVAL_MS } from "../constants.js";
import { log } from "../logger.js";
import type { IlinkApi } from "./api.js";
import { randomHex } from "./crypto.js";
import { splitMessage } from "./split.js";
import { uploadFile } from "./upload.js";
import { guessMediaType } from "./media.js";
import {
  MessageItemType,
  MessageState,
  MessageType,
  TypingStatus,
  type MessageItem,
  type OutboundMessage,
} from "./types.js";

const RATE_LIMITED = -2;

interface TypingTicket {
  ticket: string;
  expiresAt: number;
}

/**
 * Outbound message sender: handles client_id generation, per-user rate
 * limiting, retry-on-throttle, text splitting, typing indicator, and files.
 */
export class Sender {
  private lastSentAt = new Map<string, number>();
  private counter = 0;
  private typingCache = new Map<string, TypingTicket>();

  constructor(private api: IlinkApi) {}

  private nextClientId(): string {
    return `hybridbox:${Date.now()}-${this.counter++}-${randomHex(2)}`;
  }

  private async respectRate(userId: string): Promise<void> {
    const last = this.lastSentAt.get(userId) ?? 0;
    const wait = SEND_MIN_INTERVAL_MS - (Date.now() - last);
    if (wait > 0) await sleep(wait);
    this.lastSentAt.set(userId, Date.now());
  }

  /** Send one message envelope, retrying on rate-limit (ret -2). */
  private async sendOne(toUserId: string, items: MessageItem[], contextToken?: string): Promise<void> {
    const msg: OutboundMessage = {
      from_user_id: this.api.accountId,
      to_user_id: toUserId,
      client_id: this.nextClientId(),
      message_type: MessageType.BOT,
      message_state: MessageState.FINISH,
      context_token: contextToken,
      item_list: items,
    };

    let attempt = 0;
    while (true) {
      await this.respectRate(toUserId);
      const res = await this.api.sendMessage(msg);
      const ret = res.ret ?? 0;
      if (ret === 0) return;
      if (ret === RATE_LIMITED && attempt < 2) {
        attempt++;
        const backoff = Math.min(15_000, 2500 * 2 ** attempt);
        log.warn(`sendMessage throttled (ret -2), retry ${attempt} in ${backoff}ms`);
        await sleep(backoff);
        continue;
      }
      throw new Error(`sendMessage failed: ret=${ret} ${res.errmsg ?? ""}`);
    }
  }

  /** Send text, auto-splitting into WeChat-sized chunks. */
  async sendText(toUserId: string, text: string, contextToken?: string): Promise<void> {
    const chunks = splitMessage(text);
    for (const chunk of chunks) {
      await this.sendOne(toUserId, [{ type: MessageItemType.TEXT, text_item: { text: chunk } }], contextToken);
    }
  }

  /** Upload + send a local file (image/file/voice/video auto-detected). */
  async sendFile(toUserId: string, filePath: string, contextToken?: string): Promise<void> {
    const mediaType = guessMediaType(filePath);
    const item = await uploadFile(this.api, filePath, toUserId, mediaType, path.basename(filePath));
    await this.sendOne(toUserId, [item], contextToken);
  }

  // ---- Typing indicator ----

  private async ticketFor(contextToken?: string): Promise<string | null> {
    const key = contextToken ?? "default";
    const cached = this.typingCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.ticket;
    try {
      const res = await this.api.getConfig(contextToken);
      if (res.typing_ticket) {
        this.typingCache.set(key, { ticket: res.typing_ticket, expiresAt: Date.now() + 24 * 3600_000 });
        return res.typing_ticket;
      }
    } catch (e) {
      log.debug("getConfig (typing ticket) failed:", (e as Error).message);
    }
    return null;
  }

  /** Begin a typing indicator that refreshes every 5s until stopped. */
  startTyping(contextToken?: string): () => void {
    let stopped = false;
    const tick = async (status: TypingStatus) => {
      const ticket = await this.ticketFor(contextToken);
      if (!ticket || stopped) return;
      try {
        await this.api.sendTyping(ticket, status);
      } catch {
        /* fire-and-forget */
      }
    };
    void tick(TypingStatus.TYPING);
    const interval = setInterval(() => void tick(TypingStatus.TYPING), 5000);
    return () => {
      stopped = true;
      clearInterval(interval);
      void tick(TypingStatus.CANCEL);
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
