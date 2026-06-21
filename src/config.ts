import { CONFIG_FILE, DEFAULT_WORKING_DIR } from "./constants.js";
import { readJson, writeJson } from "./store.js";
import { loadAccount } from "./wechat/accounts.js";

export interface Config {
  /** Default working directory for Claude Code sessions. */
  workingDirectory: string;
  /** Optional default model (e.g. "claude-opus-4-8"). */
  model?: string;
  /** Optional extra system prompt appended to every Claude session. */
  systemPrompt?: string;
  /** Auto-approve Claude tool calls (passes --dangerously-skip-permissions). */
  autoApprove: boolean;
  /** Allowed user IDs. Empty array = allow everyone (no whitelist). */
  whitelist?: string[];
  /**
   * The bot owner's WeChat user ID. The owner is always allowed and is the
   * only user permitted to modify the whitelist. Seeded automatically from the
   * bound account on first run — never hardcoded.
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
 * The effective owner ID: an explicit config.owner, otherwise the bound
 * account's user ID (whoever scanned the QR during setup). Returns undefined
 * only when no account is bound yet.
 */
export function getOwnerId(): string | undefined {
  return loadConfig().owner ?? loadAccount()?.userId;
}

/**
 * Ensure the owner is recorded and present in the whitelist. Called once on
 * daemon start so the bot defaults to "only the owner may use it".
 */
export function ensureOwnerSeeded(ownerId: string): Config {
  const cfg = loadConfig();
  const patch: Partial<Config> = {};
  if (!cfg.owner) patch.owner = ownerId;
  const wl = cfg.whitelist ?? [];
  if (!wl.includes(ownerId)) patch.whitelist = [...wl, ownerId];
  return Object.keys(patch).length ? updateConfig(patch) : cfg;
}
