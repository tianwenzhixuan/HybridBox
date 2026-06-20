import { spawn } from "node:child_process";
import { CLAUDE_TIMEOUT_MS } from "../constants.js";
import { log } from "../logger.js";
import { createLineBuffer, parseLine } from "./parser.js";

export interface ClaudeOptions {
  prompt: string;
  workingDirectory: string;
  model?: string;
  systemPrompt?: string;
  resumeSessionId?: string;
  autoApprove: boolean;
  /** Local image paths to attach to the prompt. */
  imagePaths?: string[];
  signal: AbortSignal;
}

export interface ClaudeCallbacks {
  onText: (delta: string) => void;
  onSessionId?: (id: string) => void;
  onBlockEnd?: () => void;
}

export interface ClaudeResult {
  sessionId?: string;
  error?: string;
}

const DEFAULT_SYSTEM_PROMPT =
  "你正在通过微信与用户对话，不是在终端里。不要让用户去终端操作。" +
  "如果用户需要文件，直接输出文件的本地绝对路径，HybridBox 会自动识别并把文件推送到微信。";

/**
 * Windows can't spawn a `.cmd` shim without a shell, and shell:true means we
 * must quote arguments ourselves. We keep the heavy/complex prompt on stdin and
 * only put simple flags on the command line.
 */
function quoteWinArg(arg: string): string {
  if (!/[\s"]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '""').replace(/[\r\n]+/g, " ")}"`;
}

export async function runClaude(opts: ClaudeOptions, cb: ClaudeCallbacks): Promise<ClaudeResult> {
  const args = ["-p", "-", "--output-format", "stream-json", "--verbose", "--include-partial-messages"];
  if (opts.autoApprove) args.push("--dangerously-skip-permissions");
  if (opts.resumeSessionId) args.push("--resume", opts.resumeSessionId);
  if (opts.model) args.push("--model", opts.model);
  args.push("--append-system-prompt", opts.systemPrompt || DEFAULT_SYSTEM_PROMPT);

  const isWin = process.platform === "win32";
  const child = isWin
    ? spawn(`claude ${args.map(quoteWinArg).join(" ")}`, {
        cwd: opts.workingDirectory,
        shell: true,
        env: process.env,
      })
    : spawn("claude", args, { cwd: opts.workingDirectory, env: process.env });

  const result: ClaudeResult = {};
  const lineBuf = createLineBuffer();
  let resultText = "";
  let lastFullText = "";
  let sawStreamText = false;

  const onAbort = () => {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  };
  opts.signal.addEventListener("abort", onAbort, { once: true });

  const hardTimeout = setTimeout(() => {
    log.warn("Claude subprocess hit hard timeout; killing.");
    onAbort();
  }, CLAUDE_TIMEOUT_MS);

  function handleLine(line: string) {
    const ev = parseLine(line);
    switch (ev.kind) {
      case "session":
        result.sessionId = ev.sessionId;
        cb.onSessionId?.(ev.sessionId);
        break;
      case "text":
        sawStreamText = true;
        cb.onText(ev.text);
        break;
      case "fullText":
        // Snapshot of the latest full assistant message; fallback only.
        lastFullText = ev.text;
        break;
      case "blockEnd":
        cb.onBlockEnd?.();
        break;
      case "result":
        if (ev.error) result.error = ev.error;
        if (ev.text) resultText = ev.text;
        break;
    }
  }

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    for (const line of lineBuf.push(chunk)) handleLine(line);
  });

  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  // Build the prompt (attach images as markdown file links).
  let prompt = opts.prompt;
  for (const img of opts.imagePaths ?? []) {
    prompt += `\n\n![image](file://${img.replace(/\\/g, "/")})`;
  }

  child.stdin.write(prompt);
  child.stdin.end();

  const exitCode: number = await new Promise((resolve) => {
    child.on("close", (code) => resolve(code ?? 0));
    child.on("error", (err) => {
      result.error = `Failed to launch Claude Code: ${err.message}. Is 'claude' on PATH?`;
      resolve(-1);
    });
  });

  clearTimeout(hardTimeout);
  opts.signal.removeEventListener("abort", onAbort);
  for (const line of lineBuf.flush()) handleLine(line);

  // If streaming produced nothing, fall back to the final result text,
  // or the last full assistant message if even that is absent.
  if (!sawStreamText && !result.error) {
    const fallback = resultText || lastFullText;
    if (fallback) cb.onText(fallback);
  }

  if (exitCode !== 0 && !result.error) {
    if (opts.signal.aborted) {
      result.error = "__ABORTED__";
    } else {
      result.error = stderr.trim().slice(-500) || `Claude exited with code ${exitCode}`;
    }
  }

  return result;
}
