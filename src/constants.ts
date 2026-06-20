import os from "node:os";
import path from "node:path";

/** HybridBox version. */
export const VERSION = "0.1.0";

/** WeChat ilink Bot API base. Reverse-engineered, may change. */
export const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";

/** CDN host used for C2C encrypted media transfer. */
export const CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";

/** Bot type used by the ClawBot QR login + message endpoints. */
export const BOT_TYPE = "3";

/** Channel version reported in API request bodies. */
export const CHANNEL_VERSION = "0.2.0";

/** User-Agent / bot agent tag reported during uploads. */
export const BOT_AGENT = "hybridbox";

/** Root data directory: %USERPROFILE%\.hybridbox on Windows. */
export const DATA_DIR = path.join(os.homedir(), ".hybridbox");

export const ACCOUNTS_DIR = path.join(DATA_DIR, "accounts");
export const SESSIONS_DIR = path.join(DATA_DIR, "sessions");
export const LOGS_DIR = path.join(DATA_DIR, "logs");
export const TMP_DIR = path.join(DATA_DIR, "tmp");

export const CONFIG_FILE = path.join(DATA_DIR, "config.json");
export const SYNC_BUF_FILE = path.join(DATA_DIR, "get_updates_buf.json");

/** Default working directory for Claude Code when none configured. */
export const DEFAULT_WORKING_DIR = os.homedir();

/** Timeouts (ms) for the various ilink endpoints. */
export const TIMEOUTS = {
  getUpdates: 35_000,
  sendMessage: 15_000,
  getConfig: 10_000,
  sendTyping: 10_000,
  getUploadUrl: 15_000,
  qrStatus: 60_000,
  default: 20_000,
};

/** WeChat single-message text limit. We stay safely below it. */
export const WECHAT_TEXT_LIMIT = 4000;

/** Flush streamed text to WeChat once the buffer crosses this soft cap. */
export const FLUSH_SOFT_LIMIT = 3800;

/** Don't flush tiny fragments on structural boundaries below this size. */
export const FLUSH_MIN_CHARS = 30;

/** Minimum gap between two sends to the same user (rate-limit guard). */
export const SEND_MIN_INTERVAL_MS = 2500;

/** Claude Code subprocess hard timeout. */
export const CLAUDE_TIMEOUT_MS = 60 * 60_000;

/** Max file size we will push to WeChat. */
export const MAX_SEND_FILE_BYTES = 25 * 1024 * 1024;

/** Keepalive: if nothing sent for this long during processing, nudge user. */
export const KEEPALIVE_IDLE_MS = 5 * 60_000;
export const KEEPALIVE_CHECK_MS = 2_000;
