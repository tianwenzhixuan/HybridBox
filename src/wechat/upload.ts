import { createHash, randomBytes } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";
import { CDN_BASE_URL, MAX_SEND_FILE_BYTES } from "../constants.js";
import { log } from "../logger.js";
import { aesEcbEncrypt } from "./crypto.js";
import type { IlinkApi } from "./api.js";
import { MediaType } from "./types.js";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".ico"]);

export function isImageFile(p: string): boolean {
  return IMAGE_EXT.has(extname(p).toLowerCase());
}

export interface UploadedMedia {
  isImage: boolean;
  encryptQueryParam: string;
  aesKeyHex: string;
  fileName: string;
  rawSize: number;
}

/**
 * Encrypt a local file (AES-128-ECB), upload to the WeChat CDN via POST, and
 * return the descriptor needed to reference it in a message. The download
 * credential is returned in the `x-encrypted-param` response header.
 */
export async function uploadFile(api: IlinkApi, toUserId: string, filePath: string): Promise<UploadedMedia> {
  const stat = statSync(filePath);
  if (stat.size > MAX_SEND_FILE_BYTES) {
    throw new Error(`文件过大（${(stat.size / 1048576).toFixed(1)}MB），上限 25MB`);
  }

  const fileName = basename(filePath);
  const isImage = isImageFile(filePath);
  const plaintext = readFileSync(filePath);
  const rawSize = plaintext.length;
  const rawFileMd5 = createHash("md5").update(plaintext).digest("hex");
  const fileKey = randomBytes(16).toString("hex");
  const aesKey = randomBytes(16);
  const aesKeyHex = aesKey.toString("hex");
  const encrypted = aesEcbEncrypt(plaintext, aesKey);

  const resp = await api.getUploadUrl({
    filekey: fileKey,
    mediaType: isImage ? MediaType.IMAGE : MediaType.FILE,
    toUserId,
    rawsize: rawSize,
    rawfilemd5: rawFileMd5,
    filesize: encrypted.length,
    aeskey: aesKeyHex,
  });

  if (!resp.upload_full_url && !resp.upload_param) {
    throw new Error(`获取上传地址失败: ${JSON.stringify(resp)}`);
  }

  // Newer servers return only `upload_param`; build the CDN upload URL ourselves.
  const uploadUrl =
    resp.upload_full_url ??
    `${CDN_BASE_URL}/upload?encrypted_query_param=${encodeURIComponent(resp.upload_param!)}&filekey=${fileKey}`;

  const encryptQueryParam = await uploadToCdn(uploadUrl, encrypted);
  log.info(`Uploaded ${fileName} (${rawSize} bytes) to CDN`);

  return { isImage, encryptQueryParam, aesKeyHex, fileName, rawSize };
}

/** POST the encrypted bytes to the CDN; the download param comes back as a header. */
async function uploadToCdn(url: string, encrypted: Buffer): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      const res = await fetch(url, {
        method: "POST",
        body: new Uint8Array(encrypted),
        headers: { "Content-Type": "application/octet-stream" },
        signal: controller.signal,
      });
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`CDN 上传失败(${res.status}): ${(await res.text()).slice(0, 200)}`);
      }
      if (res.status >= 500) {
        log.warn(`CDN upload 5xx (status ${res.status}), retry ${attempt + 1}`);
        continue;
      }
      const param = res.headers.get("x-encrypted-param");
      if (!param) throw new Error("CDN 上传成功但未返回 x-encrypted-param");
      return param;
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new Error("CDN 上传超时");
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("CDN 上传失败：多次重试仍失败");
}
