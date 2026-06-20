import { CONFIG_FILE, DEFAULT_WORKING_DIR } from "./constants.js";
import { readJson, writeJson } from "./store.js";

export interface Config {
  /** Default working directory for Claude Code sessions. */
  workingDirectory: string;
  /** Optional default model (e.g. "claude-opus-4-8"). */
  model?: string;
  /** Optional extra system prompt appended to every Claude session. */
  systemPrompt?: string;
  /** Auto-approve Claude tool calls (passes --dangerously-skip-permissions). */
  autoApprove: boolean;
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
