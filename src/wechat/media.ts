import fs from "node:fs";
import path from "node:path";
import { TMP_DIR } from "../constants.js";
import { log } from "../logger.js";
import { randomHex } from "./crypto.js";
import { downloadAndDecrypt } from "./cdn.js";
import {
  MediaType,
  MessageItemType,
  type CDNMedia,
  type InboundMessage,
  type MessageItem,
  type WeixinMessage,
} from "./types.js";

/** Detect a file extension from magic bytes; fall back to .bin. */
export function detectExt(buf: Buffer): string {
  if (buf.length >= 4) {
    const b = buf;
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return ".png";
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ".jpg";
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return ".gif";
    if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return ".pdf";
    if (b[0] === 0x50 && b[1] === 0x4b) return ".zip"; // also docx/xlsx/pptx
    if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return ".mp3";
  }
  return ".bin";
}

/** Guess outbound MediaType from a file path's extension. */
export function guessMediaType(filePath: string): MediaType {
  const ext = path.extname(filePath).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"].includes(ext)) return MediaType.IMAGE;
  if ([".mp4", ".mov", ".avi", ".mkv"].includes(ext)) return MediaType.VIDEO;
  if ([".mp3", ".wav", ".amr", ".m4a"].includes(ext)) return MediaType.VOICE;
  return MediaType.FILE;
}

function saveTmp(buf: Buffer, suggestedName?: string): string {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const ext = suggestedName ? path.extname(suggestedName) : detectExt(buf);
  const base = suggestedName ? path.basename(suggestedName, path.extname(suggestedName)) : "media";
  const file = path.join(TMP_DIR, `${base}-${randomHex(4)}${ext || detectExt(buf)}`);
  fs.writeFileSync(file, buf);
  return file;
}

function cdnOf(item: MessageItem): { media?: CDNMedia; name?: string } {
  switch (item.type) {
    case MessageItemType.IMAGE:
      return { media: item.image_item?.cdn_media };
    case MessageItemType.FILE:
      return { media: item.file_item?.cdn_media, name: item.file_item?.file_name };
    case MessageItemType.VOICE:
      return { media: item.voice_item?.media };
    case MessageItemType.VIDEO:
      return { media: item.video_item?.cdn_media };
    default:
      return {};
  }
}

/**
 * Normalise a raw WeChat message into text + downloaded attachment paths.
 * Voice items carry a transcript we fold into the text.
 */
export async function extractInbound(msg: WeixinMessage): Promise<InboundMessage> {
  const parts: string[] = [];
  const attachments: string[] = [];
  let kind: InboundMessage["kind"] = "text";

  for (const item of msg.item_list ?? []) {
    switch (item.type) {
      case MessageItemType.TEXT:
        if (item.text_item?.text) parts.push(item.text_item.text);
        break;
      case MessageItemType.VOICE:
        kind = "voice";
        if (item.voice_item?.text) parts.push(item.voice_item.text);
        await tryDownload(item, attachments);
        break;
      case MessageItemType.IMAGE:
        kind = "image";
        await tryDownload(item, attachments);
        break;
      case MessageItemType.FILE:
        kind = "file";
        await tryDownload(item, attachments);
        break;
      case MessageItemType.VIDEO:
        kind = "video";
        await tryDownload(item, attachments);
        break;
      default:
        kind = "unknown";
    }
  }

  return {
    messageId: msg.message_id ?? msg.seq ?? 0,
    fromUserId: msg.from_user_id ?? "",
    contextToken: msg.context_token,
    text: parts.join("\n").trim(),
    attachments,
    kind,
  };
}

async function tryDownload(item: MessageItem, out: string[]): Promise<void> {
  const { media, name } = cdnOf(item);
  if (!media) return;
  try {
    const buf = await downloadAndDecrypt(media);
    out.push(saveTmp(buf, name));
  } catch (e) {
    log.warn("Failed to download inbound media:", (e as Error).message);
  }
}
