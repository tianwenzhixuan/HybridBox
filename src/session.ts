import path from "node:path";
import { SESSIONS_DIR } from "./constants.js";
import { loadConfig } from "./config.js";
import { readJson, writeJson } from "./store.js";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  ts: number;
}

export interface Session {
  accountId: string;
  sdkSessionId?: string;
  previousSdkSessionId?: string;
  workingDirectory: string;
  model?: string;
  systemPrompt?: string;
  state: "idle" | "processing";
  chatHistory: ChatMessage[];
}

const MAX_HISTORY = 100;

function sessionFile(accountId: string): string {
  return path.join(SESSIONS_DIR, `${accountId}.json`);
}

function freshSession(accountId: string): Session {
  const cfg = loadConfig();
  return {
    accountId,
    workingDirectory: cfg.workingDirectory,
    model: cfg.model,
    systemPrompt: cfg.systemPrompt,
    state: "idle",
    chatHistory: [],
  };
}

export class SessionStore {
  private session: Session;

  constructor(private accountId: string) {
    const loaded = readJson<Session | null>(sessionFile(accountId), null);
    this.session = loaded ?? freshSession(accountId);
    // Recover from a crash mid-processing.
    if (this.session.state !== "idle") this.session.state = "idle";
    this.persist();
  }

  get(): Session {
    return this.session;
  }

  private persist() {
    writeJson(sessionFile(this.accountId), this.session);
  }

  patch(partial: Partial<Session>): Session {
    this.session = { ...this.session, ...partial };
    this.persist();
    return this.session;
  }

  setState(state: Session["state"]) {
    this.session.state = state;
    this.persist();
  }

  addHistory(role: ChatMessage["role"], text: string) {
    this.session.chatHistory.push({ role, text, ts: Date.now() });
    if (this.session.chatHistory.length > MAX_HISTORY) {
      this.session.chatHistory = this.session.chatHistory.slice(-MAX_HISTORY);
    }
    this.persist();
  }

  /** New Claude session, but keep working dir / model / prompt. */
  clear() {
    this.session.previousSdkSessionId = this.session.sdkSessionId;
    this.session.sdkSessionId = undefined;
    this.session.chatHistory = [];
    this.persist();
  }

  /** Full reset back to config defaults. */
  reset() {
    this.session = freshSession(this.accountId);
    this.persist();
  }
}
