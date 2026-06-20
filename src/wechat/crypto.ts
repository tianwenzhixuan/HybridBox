import crypto from "node:crypto";

/** AES-128-ECB encrypt with PKCS7 padding. Key must be 16 bytes. */
export function aesEcbEncrypt(data: Buffer, key: Buffer): Buffer {
  const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

/** AES-128-ECB decrypt with PKCS7 padding. Key must be 16 bytes. */
export function aesEcbDecrypt(data: Buffer, key: Buffer): Buffer {
  const decipher = crypto.createDecipheriv("aes-128-ecb", key, null);
  decipher.setAutoPadding(true);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function md5Hex(data: Buffer): string {
  return crypto.createHash("md5").update(data).digest("hex");
}

/** N random bytes as lowercase hex. */
export function randomHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString("hex");
}

/** 16 random bytes — used as AES-128 key material. */
export function randomAesKey(): Buffer {
  return crypto.randomBytes(16);
}

/** X-WECHAT-UIN header value: random uint32 -> string -> base64. */
export function randomWechatUin(): string {
  const n = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(n)).toString("base64");
}
