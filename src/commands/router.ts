import {
  handleClear,
  handleCwd,
  handleHelp,
  handleModel,
  handlePrompt,
  handleReset,
  handleSend,
  handleStatus,
  handleStop,
  handleVersion,
  type CommandContext,
  type CommandHandler,
} from "./handlers.js";

export interface ParsedCommand {
  name: string;
  args: string;
}

/** Parse a leading slash command. Returns null for normal chat text. */
export function parseCommand(text: string): ParsedCommand | null {
  const m = text.match(/^\/([a-zA-Z]+)\s*([\s\S]*)$/);
  if (!m) return null;
  return { name: m[1].toLowerCase(), args: m[2] };
}

const COMMANDS: Record<string, CommandHandler> = {
  help: handleHelp,
  h: handleHelp,
  status: handleStatus,
  clear: handleClear,
  reset: handleReset,
  stop: handleStop,
  cwd: handleCwd,
  model: handleModel,
  prompt: handlePrompt,
  send: handleSend,
  version: handleVersion,
  v: handleVersion,
};

export interface DispatchResult {
  /** True if this was a known command (handled here, don't forward to Claude). */
  handled: boolean;
  /** Reply text, or null if the handler responded itself / nothing to say. */
  reply: string | null;
}

/**
 * Dispatch a parsed command. Unknown slash commands are NOT handled here so the
 * caller may forward them to Claude (e.g. to invoke a Skill by name).
 */
export async function dispatchCommand(cmd: ParsedCommand, ctx: CommandContext): Promise<DispatchResult> {
  const handler = COMMANDS[cmd.name];
  if (!handler) return { handled: false, reply: null };
  const reply = await handler(ctx);
  return { handled: true, reply };
}

export function isKnownCommand(name: string): boolean {
  return name in COMMANDS;
}
