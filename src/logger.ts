import fs from "node:fs";
import path from "node:path";
import { LOGS_DIR } from "./constants.js";

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL: Level = (process.env.HYBRIDBOX_LOG_LEVEL as Level) || "info";

let currentDay = "";
let stream: fs.WriteStream | null = null;

function ensureDir() {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

/** UTC+8 timestamp, so logs read naturally for CN users. */
function nowParts() {
  const d = new Date(Date.now() + 8 * 3600_000);
  const iso = d.toISOString().replace("T", " ").replace("Z", "");
  return { day: iso.slice(0, 10), full: iso.slice(0, 19) };
}

function rotate(day: string) {
  if (day === currentDay && stream) return;
  ensureDir();
  if (stream) stream.end();
  currentDay = day;
  stream = fs.createWriteStream(path.join(LOGS_DIR, `hybridbox-${day}.log`), { flags: "a" });
  pruneOld();
}

/** Keep 30 days of logs. */
function pruneOld() {
  try {
    const files = fs.readdirSync(LOGS_DIR).filter((f) => f.startsWith("hybridbox-") && f.endsWith(".log"));
    const cutoff = Date.now() - 30 * 24 * 3600_000;
    for (const f of files) {
      const full = path.join(LOGS_DIR, f);
      if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
    }
  } catch {
    /* best-effort */
  }
}

/** Redact bearer tokens and obvious secrets from log lines. */
function redact(s: string): string {
  return s
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/g, "Bearer ***")
    .replace(/"token"\s*:\s*"[^"]+"/g, '"token":"***"')
    .replace(/bot_token"\s*:\s*"[^"]+"/g, 'bot_token":"***"');
}

function write(level: Level, args: unknown[]) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;
  const { day, full } = nowParts();
  rotate(day);
  const msg = args
    .map((a) => (typeof a === "string" ? a : safeStringify(a)))
    .join(" ");
  const line = `${full} [${level.toUpperCase()}] ${redact(msg)}`;
  stream?.write(line + "\n");
  const consoleFn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  consoleFn(line);
}

function safeStringify(a: unknown): string {
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

export const log = {
  debug: (...a: unknown[]) => write("debug", a),
  info: (...a: unknown[]) => write("info", a),
  warn: (...a: unknown[]) => write("warn", a),
  error: (...a: unknown[]) => write("error", a),
};
