import { BOT_TYPE, DEFAULT_BASE_URL, TIMEOUTS } from "../constants.js";
import { log } from "../logger.js";
import { randomWechatUin } from "./crypto.js";
import { getJson } from "./http.js";
import type { Account, QrCodeResponse, QrStatusResponse } from "./types.js";

export interface QrLogin {
  /** The string to encode in the QR / show as a fallback URL. */
  qrContent: string;
  /** Opaque id used to poll scan status. */
  qrcodeId: string;
}

function loginHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-WECHAT-UIN": randomWechatUin(),
    "iLink-App-ClientVersion": "1",
  };
}

/** Step 1: ask the server for a fresh login QR code. */
export async function startQrLogin(baseUrl = DEFAULT_BASE_URL): Promise<QrLogin> {
  const url = `${baseUrl.replace(/\/+$/, "")}/ilink/bot/get_bot_qrcode?bot_type=${BOT_TYPE}`;
  const res = await getJson<QrCodeResponse>(url, { headers: loginHeaders(), timeoutMs: TIMEOUTS.default });
  const qrcodeId = res.qrcode ?? "";
  const qrContent = res.qrcode_img_content ?? qrcodeId;
  if (!qrcodeId) throw new Error("Failed to obtain QR code id from server");
  return { qrContent, qrcodeId };
}

/** Step 2: poll until the user scans + confirms (or it expires). */
export async function waitForQrScan(
  qrcodeId: string,
  baseUrl = DEFAULT_BASE_URL,
  opts: { intervalMs?: number; timeoutMs?: number; onScanned?: () => void } = {},
): Promise<Account> {
  const interval = opts.intervalMs ?? 2000;
  const deadline = Date.now() + (opts.timeoutMs ?? 8 * 60_000);
  const statusUrl = `${baseUrl.replace(/\/+$/, "")}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcodeId)}`;
  let scannedLogged = false;

  while (Date.now() < deadline) {
    let res: QrStatusResponse;
    try {
      res = await getJson<QrStatusResponse>(statusUrl, { headers: loginHeaders(), timeoutMs: TIMEOUTS.qrStatus });
    } catch (e) {
      log.warn("QR status poll failed, retrying:", (e as Error).message);
      await sleep(interval);
      continue;
    }

    switch (res.status) {
      case "confirmed": {
        if (!res.bot_token || !res.ilink_bot_id) throw new Error("Confirmed but missing credentials in response");
        return {
          token: res.bot_token,
          baseUrl: res.baseurl || baseUrl,
          accountId: res.ilink_bot_id,
          userId: res.ilink_user_id ?? "",
          savedAt: new Date().toISOString(),
        };
      }
      case "scaned":
        if (!scannedLogged) {
          scannedLogged = true;
          opts.onScanned?.();
        }
        break;
      case "expired":
        throw new Error("QR code expired");
      case "wait":
      default:
        break;
    }
    await sleep(interval);
  }
  throw new Error("QR login timed out");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
