import fs from "node:fs";
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
  /** The WeChat userId this session belongs to. */
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

/** Sanitize a userId for safe use in file/dir names. */
function sanitize(id: string): string {
  return id.replace(/[^A-Za-z0-9_.-]/g, "_") || "user";
}

function sessionFile(userId: string): string {
  return path.join(SESSIONS_DIR, `${sanitize(userId)}.json`);
}

function freshSession(userId: string): Session {
  const cfg = loadConfig();
  // Each user gets their own working directory so parallel sessions don't
  // clobber each other's files. Users can still /cwd into a shared project.
  const dir = path.join(cfg.workingDirectory, sanitize(userId));
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* fall back to whatever exists */
  }
  return {
    accountId: userId,
    workingDirectory: dir,
    model: cfg.model,
    systemPrompt: cfg.systemPrompt,
    state: "idle",
    chatHistory: [],
  };
}

export class SessionStore {
  private session: Session;

  // `userId` is the WeChat user this store belongs to.
  constructor(private userId: string) {
    const loaded = readJson<Session | null>(sessionFile(userId), null);
    this.session = loaded ?? freshSession(userId);
    // Recover from a crash mid-processing.
    if (this.session.state !== "idle") this.session.state = "idle";
    this.persist();
  }

  get(): Session {
    return this.session;
  }

  private persist() {
    writeJson(sessionFile(this.userId), this.session);
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
    this.session = freshSession(this.userId);
    this.persist();
  }
}
