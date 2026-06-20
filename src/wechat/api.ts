import { TIMEOUTS } from "../constants.js";
import { randomWechatUin } from "./crypto.js";
import { postJson } from "./http.js";
import type {
  Account,
  GetConfigResponse,
  GetUpdatesResponse,
  GetUploadUrlResponse,
  MediaType,
  OutboundMessage,
  SendMessageResponse,
  TypingStatus,
} from "./types.js";
import { CHANNEL_VERSION } from "../constants.js";

/**
 * Client for the authenticated ilink Bot endpoints (everything after login).
 * Headers + body shapes are reverse-engineered from the wire format.
 */
export class IlinkApi {
  constructor(private account: Account) {}

  get userId() {
    return this.account.userId;
  }
  get accountId() {
    return this.account.accountId;
  }

  private url(endpoint: string): string {
    const base = this.account.baseUrl.replace(/\/+$/, "");
    return `${base}/${endpoint}`;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.account.token}`,
      AuthorizationType: "ilink_bot_token",
      "X-WECHAT-UIN": randomWechatUin(),
    };
  }

  /** Long-poll for new messages. `getUpdatesBuf` is the opaque sync cursor. */
  async getUpdates(getUpdatesBuf: string | undefined, signal?: AbortSignal): Promise<GetUpdatesResponse> {
    return postJson<GetUpdatesResponse>(
      this.url("ilink/bot/getupdates"),
      { get_updates_buf: getUpdatesBuf ?? "", base_info: { channel_version: CHANNEL_VERSION } },
      { headers: this.headers(), timeoutMs: TIMEOUTS.getUpdates, signal },
    );
  }

  /** Send a fully-formed outbound message. */
  async sendMessage(msg: OutboundMessage): Promise<SendMessageResponse> {
    return postJson<SendMessageResponse>(
      this.url("ilink/bot/sendmessage"),
      { msg, base_info: { channel_version: CHANNEL_VERSION } },
      { headers: this.headers(), timeoutMs: TIMEOUTS.sendMessage },
    );
  }

  /** Fetch a typing ticket required by sendTyping. */
  async getConfig(contextToken?: string): Promise<GetConfigResponse> {
    return postJson<GetConfigResponse>(
      this.url("ilink/bot/getconfig"),
      { ilink_user_id: this.account.userId, context_token: contextToken, base_info: { channel_version: CHANNEL_VERSION } },
      { headers: this.headers(), timeoutMs: TIMEOUTS.getConfig },
    );
  }

  /** Show/hide the "bot is typing" indicator. Fire-and-forget. */
  async sendTyping(typingTicket: string, status: TypingStatus): Promise<void> {
    await postJson(
      this.url("ilink/bot/sendtyping"),
      {
        ilink_user_id: this.account.userId,
        typing_ticket: typingTicket,
        status,
        base_info: { channel_version: CHANNEL_VERSION },
      },
      { headers: this.headers(), timeoutMs: TIMEOUTS.sendTyping },
    );
  }

  /** Request a pre-signed CDN upload URL for an encrypted media file. */
  async getUploadUrl(params: {
    filekey: string;
    mediaType: MediaType;
    toUserId: string;
    rawsize: number;
    rawfilemd5: string;
    filesize: number;
    aeskey: string;
  }): Promise<GetUploadUrlResponse> {
    return postJson<GetUploadUrlResponse>(
      this.url("ilink/bot/getuploadurl"),
      {
        filekey: params.filekey,
        media_type: params.mediaType,
        to_user_id: params.toUserId,
        rawsize: params.rawsize,
        rawfilemd5: params.rawfilemd5,
        filesize: params.filesize,
        no_need_thumb: true,
        aeskey: params.aeskey,
        base_info: { channel_version: CHANNEL_VERSION, bot_agent: "hybridbox" },
      },
      { headers: this.headers(), timeoutMs: TIMEOUTS.getUploadUrl },
    );
  }
}

export function createApi(account: Account): IlinkApi {
  return new IlinkApi(account);
}
