import { CONFIG_FILE, DEFAULT_WORKING_DIR } from "./constants.js";
import { readJson, writeJson } from "./store.js";
import { loadAccount } from "./wechat/accounts.js";

export interface Config {
  /** Default working *root*; each user gets a subfolder under it. */
  workingDirectory: string;
  /** Optional default model (e.g. "claude-opus-4-8"). */
  model?: string;
  /** Optional extra system prompt appended to every Claude session. */
  systemPrompt?: string;
  /** Auto-approve Claude tool calls (passes --dangerously-skip-permissions). */
  autoApprove: boolean;
  /**
   * The bot owner's WeChat user ID — the first user to bind. The owner is the
   * only user allowed to add/remove other users. Seeded on first login,
   * never hardcoded.
   */
  owner?: string;
}

const DEFAULT_CONFIG: Config = {
  workingDirectory: DEFAULT_WORKING_DIR,
  autoApprove: true,
};

export function loadConfig(): Config {
  return { ...DEFAULT_CONFIG, ...readJson<Partial<Config>>(CONFIG_FILE, {}) };
}

export function saveConfig(cfg: Config): void {
  writeJson(CONFIG_FILE, cfg);
}

export function updateConfig(patch: Partial<Config>): Config {
  const next = { ...loadConfig(), ...patch };
  saveConfig(next);
  return next;
}

/**
 * The effective owner ID: an explicit config.owner, otherwise the first bound
 * account's user ID. Undefined only when no account is bound yet.
 */
export function getOwnerId(): string | undefined {
  return loadConfig().owner ?? loadAccount()?.userId;
}

/** Record the owner if not already set (first user to bind becomes owner). */
export function ensureOwnerSeeded(ownerId: string): Config {
  const cfg = loadConfig();
  if (!cfg.owner && ownerId) return updateConfig({ owner: ownerId });
  return cfg;
}
