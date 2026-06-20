import { FLUSH_MIN_CHARS, FLUSH_SOFT_LIMIT } from "./constants.js";
import { log } from "./logger.js";
import type { Sender } from "./wechat/sender.js";

/**
 * Buffers Claude's streamed text and flushes it to WeChat at natural
 * boundaries, so the user sees progress without a message per token.
 * Flushes are serialized through a promise chain to preserve order.
 */
export class StreamFlusher {
  private buffer = "";
  private chain: Promise<void> = Promise.resolve();
  private lastActivity = Date.now();

  constructor(
    private sender: Sender,
    private toUserId: string,
    private contextToken?: string,
  ) {}

  push(text: string): void {
    this.buffer += text;
    if (this.shouldFlush()) this.flush();
  }

  private shouldFlush(): boolean {
    if (this.buffer.length >= FLUSH_SOFT_LIMIT) return true;
    if (this.buffer.length >= FLUSH_MIN_CHARS && /(\n\n|---|\* \* \*)\s*$/.test(this.buffer)) return true;
    return false;
  }

  /** Flush on block boundaries if there's substantial content. */
  flushOnBoundary(): void {
    if (this.buffer.trim().length >= FLUSH_MIN_CHARS) this.flush();
  }

  private flush(): void {
    const text = this.buffer;
    this.buffer = "";
    if (!text.trim()) return;
    this.lastActivity = Date.now();
    this.chain = this.chain
      .then(() => this.sender.sendText(this.toUserId, text, this.contextToken))
      .catch((e) => log.error("Flush send failed:", (e as Error).message));
  }

  /** Flush whatever remains and wait for the send chain to drain. */
  async flushAll(): Promise<void> {
    if (this.buffer.trim()) this.flush();
    await this.chain;
  }

  /** ms since the last time we sent something to the user. */
  idleMs(): number {
    return Date.now() - this.lastActivity;
  }

  noteActivity(): void {
    this.lastActivity = Date.now();
  }
}
