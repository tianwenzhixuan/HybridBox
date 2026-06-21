import { CDN_BASE_URL } from "../constants.js";
import { aesEcbDecrypt } from "./crypto.js";
import { httpGetBuffer } from "./http.js";
import type { CDNMedia } from "./types.js";

/**
 * Decode an aes_key that may arrive in three shapes:
 *  - 32-char hex string (raw hex)
 *  - base64 of 16 raw bytes
 *  - base64 of a 32-char hex string ("base64-of-hex" — the newer wire format)
 */
export function parseKey(key: string): Buffer {
  if (/^[0-9a-fA-F]{32}$/.test(key)) return Buffer.from(key, "hex");
  const decoded = Buffer.from(key, "base64");
  if (decoded.length === 16) return decoded;
  const asText = decoded.toString("utf8");
  if (/^[0-9a-fA-F]{32}$/.test(asText)) return Buffer.from(asText, "hex");
  return decoded;
}

export function buildDownloadUrl(media: CDNMedia): string {
  if (media.cdn_url) return media.cdn_url;
  if (media.encrypt_query_param) {
    return `${CDN_BASE_URL}/download?encrypted_query_param=${encodeURIComponent(media.encrypt_query_param)}`;
  }
  throw new Error("CDNMedia has no downloadable URL");
}

/** Download encrypted media from the CDN and decrypt with its aes_key. */
export async function downloadAndDecrypt(media: CDNMedia): Promise<Buffer> {
  const url = buildDownloadUrl(media);
  const encrypted = await httpGetBuffer(url, { timeoutMs: 60_000 });
  if (!media.aes_key) return encrypted; // some media may be unencrypted
  return aesEcbDecrypt(encrypted, parseKey(media.aes_key));
}
