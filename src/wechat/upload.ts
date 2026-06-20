import fs from "node:fs";
import { log } from "../logger.js";
import type { IlinkApi } from "./api.js";
import { aesEcbEncrypt, md5Hex, randomAesKey, randomHex } from "./crypto.js";
import { httpPutBuffer } from "./http.js";
import { MediaType, MessageItemType, type MessageItem } from "./types.js";

/** Map a media type to the outbound message item type. */
function itemTypeFor(media: MediaType): MessageItemType {
  switch (media) {
    case MediaType.IMAGE:
      return MessageItemType.IMAGE;
    case MediaType.VIDEO:
      return MessageItemType.VIDEO;
    case MediaType.VOICE:
      return MessageItemType.VOICE;
    default:
      return MessageItemType.FILE;
  }
}

/**
 * Encrypt a local file, upload to the WeChat CDN, and return a ready-to-send
 * MessageItem describing it. Used to push images/files back to the user.
 */
export async function uploadFile(
  api: IlinkApi,
  filePath: string,
  toUserId: string,
  mediaType: MediaType,
  fileName?: string,
): Promise<MessageItem> {
  const raw = fs.readFileSync(filePath);
  const aesKey = randomAesKey();
  const encrypted = aesEcbEncrypt(raw, aesKey);

  const aeskeyHex = aesKey.toString("hex");
  const filekey = randomHex(16);

  const res = await api.getUploadUrl({
    filekey,
    mediaType,
    toUserId,
    rawsize: raw.length,
    rawfilemd5: md5Hex(raw),
    filesize: encrypted.length,
    aeskey: aeskeyHex,
  });

  if (!res.upload_full_url) {
    throw new Error(`getUploadUrl failed: ret=${res.ret} ${res.errmsg ?? ""}`);
  }

  await httpPutBuffer(res.upload_full_url, encrypted, { timeoutMs: 120_000 });
  log.info(`Uploaded ${filePath} (${raw.length} bytes) to CDN`);

  const cdnMedia = {
    aes_key: aeskeyHex,
    encrypt_query_param: res.upload_param,
  };

  const item: MessageItem = { type: itemTypeFor(mediaType) };
  switch (mediaType) {
    case MediaType.IMAGE:
      item.image_item = { cdn_media: cdnMedia, aeskey: aeskeyHex, media_id: res.media_id };
      break;
    case MediaType.VIDEO:
      item.video_item = { cdn_media: cdnMedia };
      break;
    case MediaType.VOICE:
      item.voice_item = { media: cdnMedia };
      break;
    default:
      item.file_item = { cdn_media: cdnMedia, file_name: fileName, len: String(raw.length) };
      break;
  }
  return item;
}
