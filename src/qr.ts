import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { TMP_DIR } from "./constants.js";

/** Open a file with the OS default app (best-effort, non-blocking). */
export function openFile(p: string): void {
  try {
    if (process.platform === "win32") spawn("cmd", ["/c", "start", "", p], { detached: true });
    else if (process.platform === "darwin") spawn("open", [p], { detached: true });
    else spawn("xdg-open", [p], { detached: true });
  } catch {
    /* best-effort */
  }
}

/** Render QR content to a PNG file and return its path. */
export async function renderQrPng(content: string, name = "login-qr"): Promise<string> {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const pngPath = path.join(TMP_DIR, `${name}-${Date.now()}.png`);
  await QRCode.toFile(pngPath, content, { width: 400 });
  return pngPath;
}
