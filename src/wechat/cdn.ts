import { CDN_BASE_URL } from "../constants.js";
import { aesEcbDecrypt } from "./crypto.js";
import { httpGetBuffer } from "./http.js";
import type { CDNMedia } from "./types.js";

/** Interpret a key that may be hex (32 chars) or base64. */
export function parseKey(key: string): Buffer {
  if (/^[0-9a-fA-F]{32}$/.test(key)) return Buffer.from(key, "hex");
  return Buffer.from(key, "base64");
}

export function buildDownloadUrl(media: CDNMedia): string {
  if (media.cdn_url) return media.cdn_url;
  if (media.encrypt_query_param) {
    const sep = media.encrypt_query_param.startsWith("?") ? "" : "?";
    return `${CDN_BASE_URL}${sep}${media.encrypt_query_param}`;
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
