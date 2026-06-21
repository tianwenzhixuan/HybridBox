// Type definitions for the WeChat ilink Bot API.
// Reverse-engineered from open-source projects; field names match the wire format.

export enum MessageType {
  USER = 1,
  BOT = 2,
}

export enum MessageState {
  NEW = 0,
  GENERATING = 1,
  FINISH = 2,
}

export enum MessageItemType {
  TEXT = 1,
  IMAGE = 2,
  VOICE = 3,
  FILE = 4,
  VIDEO = 5,
}

export enum MediaType {
  IMAGE = 1,
  VIDEO = 2,
  FILE = 3,
  VOICE = 4,
}

export enum TypingStatus {
  TYPING = 1,
  CANCEL = 2,
}

/** Encrypted media descriptor returned/sent through the CDN. */
export interface CDNMedia {
  aes_key?: string;
  encrypt_query_param?: string;
  cdn_url?: string;
}

/** Media descriptor we SEND when pushing a file/image (post-CDN-upload). */
export interface UploadMedia {
  encrypt_query_param?: string;
  aes_key?: string;
  encrypt_type?: number;
}

export interface MessageItem {
  type: MessageItemType;
  text_item?: { text: string };
  image_item?: {
    cdn_media?: CDNMedia;
    media?: UploadMedia;
    aeskey?: string;
    url?: string;
    media_id?: string;
    aes_key?: string;
    mid_size?: number;
    hd_size?: number;
  };
  voice_item?: { media?: CDNMedia; text?: string };
  file_item?: {
    cdn_media?: CDNMedia;
    media?: UploadMedia;
    file_name?: string;
    len?: string;
  };
  video_item?: { cdn_media?: CDNMedia };
}

export interface WeixinMessage {
  seq?: number;
  message_id?: number;
  from_user_id?: string;
  to_user_id?: string;
  create_time_ms?: number;
  message_type?: MessageType;
  message_state?: MessageState;
  item_list?: MessageItem[];
  context_token?: string;
}

export interface OutboundMessage {
  from_user_id: string;
  to_user_id: string;
  client_id: string;
  message_type: MessageType;
  message_state: MessageState;
  context_token?: string;
  item_list: MessageItem[];
}

// ---- API response shapes ----

export interface GetUpdatesResponse {
  ret?: number;
  errcode?: number;
  retmsg?: string;
  errmsg?: string;
  sync_buf?: string;
  get_updates_buf?: string;
  msgs?: WeixinMessage[];
  longpolling_timeout_ms?: number;
}

export interface SendMessageResponse {
  ret?: number;
  errmsg?: string;
}

export interface GetConfigResponse {
  ret?: number;
  errmsg?: string;
  typing_ticket?: string;
}

export interface GetUploadUrlResponse {
  ret?: number;
  errmsg?: string;
  upload_param?: string;
  upload_full_url?: string;
  media_id?: string;
}

export interface QrCodeResponse {
  ret?: number;
  qrcode?: string;
  qrcode_img_content?: string;
}

export type QrStatus = "wait" | "scaned" | "confirmed" | "expired";

export interface QrStatusResponse {
  ret?: number;
  status?: QrStatus;
  bot_token?: string;
  ilink_bot_id?: string;
  baseurl?: string;
  ilink_user_id?: string;
}

/** Persisted bot credentials. */
export interface Account {
  token: string;
  baseUrl: string;
  accountId: string;
  userId: string;
  savedAt: string;
}

/** Normalised inbound message after extraction. */
export interface InboundMessage {
  messageId: number;
  fromUserId: string;
  contextToken?: string;
  text: string;
  /** Local file paths of any downloaded attachments (images/files/voice). */
  attachments: string[];
  /** Human description of non-text content for logging. */
  kind: "text" | "image" | "file" | "voice" | "video" | "unknown";
}
