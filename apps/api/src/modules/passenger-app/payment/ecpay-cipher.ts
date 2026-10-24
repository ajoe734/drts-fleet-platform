import { createCipheriv, createDecipheriv, createHash } from "node:crypto";

export const ECPAY_TIMESTAMP_WINDOW_SECONDS = 600;
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

function cipherError(): never {
  throw new Error("ECPay payload decryption or envelope verification failed.");
}

export function assertEcpayHashMaterial(
  hashKey: unknown,
  hashIv: unknown,
): { key: Buffer; iv: Buffer } {
  if (typeof hashKey !== "string" || typeof hashIv !== "string") {
    throw new Error("ECPay HashKey and HashIV must be 16-byte strings.");
  }
  const key = Buffer.from(hashKey, "utf8");
  const iv = Buffer.from(hashIv, "utf8");
  if (
    key.byteLength !== 16 ||
    iv.byteLength !== 16 ||
    !/^[\x21-\x7e]{16}$/.test(hashKey) ||
    !/^[\x21-\x7e]{16}$/.test(hashIv)
  ) {
    throw new Error("ECPay HashKey and HashIV must be 16-byte ASCII strings.");
  }
  return { key, iv };
}

/**
 * ECPay 站內付 2.0 (ECPG) encryption:
 * 1. JSON.stringify(payload)
 * 2. URL-encode (encodeURIComponent)
 * 3. AES-128-CBC (PKCS7 padding) with HashKey and HashIV
 * 4. Base64 encode
 */
export function encryptEcpayData(
  payload: Record<string, unknown>,
  hashKey: string,
  hashIv: string,
): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    cipherError();
  }
  const { key, iv } = assertEcpayHashMaterial(hashKey, hashIv);
  try {
    const json = JSON.stringify(payload);
    const urlEncoded = encodeURIComponent(json);
    const cipher = createCipheriv("aes-128-cbc", key, iv);
    const encrypted = Buffer.concat([
      cipher.update(urlEncoded, "utf8"),
      cipher.final(),
    ]);
    return encrypted.toString("base64");
  } catch {
    cipherError();
  }
}

/**
 * ECPay 站內付 2.0 (ECPG) decryption:
 * 1. Base64 decode
 * 2. AES-128-CBC (PKCS7 padding) decrypt with HashKey and HashIV
 * 3. URL-decode (+ normalized to %20 before decodeURIComponent)
 * 4. JSON.parse to plain object
 */
export function decryptEcpayData(
  cipherTextBase64: unknown,
  hashKey: string,
  hashIv: string,
): Record<string, unknown> {
  if (
    typeof cipherTextBase64 !== "string" ||
    cipherTextBase64.trim().length === 0 ||
    cipherTextBase64.length > 65536 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(cipherTextBase64.trim())
  ) {
    cipherError();
  }
  const { key, iv } = assertEcpayHashMaterial(hashKey, hashIv);
  try {
    const clean = cipherTextBase64.trim();
    const raw = Buffer.from(clean, "base64");
    if (
      raw.byteLength === 0 ||
      raw.byteLength % 16 !== 0 ||
      raw.toString("base64") !== clean
    ) {
      cipherError();
    }
    const decipher = createDecipheriv("aes-128-cbc", key, iv);
    const decryptedUtf8 = Buffer.concat([
      decipher.update(raw),
      decipher.final(),
    ]).toString("utf8");
    const decoded = decodeURIComponent(decryptedUtf8.replace(/\+/g, "%20"));
    const parsed: unknown = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      cipherError();
    }
    return parsed as Record<string, unknown>;
  } catch {
    cipherError();
  }
}

export interface EcpayRequestEnvelope {
  MerchantID: string;
  RqHeader: {
    Timestamp: number;
  };
  Data: string;
}

export function buildEcpayEnvelope(params: {
  merchantId: string;
  hashKey: string;
  hashIv: string;
  data: Record<string, unknown>;
  timestamp?: number;
}): EcpayRequestEnvelope {
  const merchantId = params.merchantId?.trim();
  if (!merchantId || !/^[A-Za-z0-9_-]{1,20}$/.test(merchantId)) {
    throw new Error("ECPay MerchantID is invalid.");
  }
  const timestamp =
    params.timestamp ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new Error("ECPay Timestamp is invalid.");
  }
  return {
    MerchantID: merchantId,
    RqHeader: { Timestamp: timestamp },
    Data: encryptEcpayData(params.data, params.hashKey, params.hashIv),
  };
}

export interface VerifiedEcpayEnvelope {
  timestamp: number;
  transCode: number;
  transMsg: string;
  data: Record<string, unknown>;
}

/**
 * Verifies outer MerchantID, Timestamp freshness (<= 10 minutes), and AES-128-CBC
 * encrypted Data / ResultData payload integrity.
 */
export function verifyAndUnwrapEcpayEnvelope(params: {
  envelope: unknown;
  merchantId: string;
  hashKey: string;
  hashIv: string;
  nowSeconds?: number;
  maxSkewSeconds?: number;
}): VerifiedEcpayEnvelope {
  const {
    envelope,
    merchantId,
    hashKey,
    hashIv,
    nowSeconds = Math.floor(Date.now() / 1000),
    maxSkewSeconds = ECPAY_TIMESTAMP_WINDOW_SECONDS,
  } = params;
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    cipherError();
  }
  const record = envelope as Record<string, unknown>;
  if (
    typeof record.MerchantID !== "string" ||
    record.MerchantID.trim() !== merchantId.trim()
  ) {
    cipherError();
  }
  const headerRaw = record.RpHeader ?? record.RqHeader;
  if (!headerRaw || typeof headerRaw !== "object" || Array.isArray(headerRaw)) {
    cipherError();
  }
  const timestamp = Number(
    (headerRaw as Record<string, unknown>).Timestamp,
  );
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp <= 0 ||
    Math.abs(nowSeconds - timestamp) > maxSkewSeconds
  ) {
    cipherError();
  }
  const transCode =
    record.TransCode === undefined ? 1 : Number(record.TransCode);
  if (!Number.isSafeInteger(transCode)) {
    cipherError();
  }
  const transMsg =
    typeof record.TransMsg === "string" ? record.TransMsg : "";
  const cipherText = record.Data ?? record.ResultData;
  const data = decryptEcpayData(cipherText, hashKey, hashIv);
  if (
    data.MerchantID !== undefined &&
    String(data.MerchantID).trim() !== merchantId.trim()
  ) {
    cipherError();
  }
  return {
    timestamp,
    transCode,
    transMsg,
    data,
  };
}

/**
 * Derives an irreversible, deterministic ECPay MerchantMemberID (<= 60 chars,
 * alphanumeric/underscore) from the passenger account ID and merchant ID.
 * Rejects phone numbers or email addresses as input.
 */
export function deriveEcpayMerchantMemberId(
  passengerId: string,
  merchantId: string,
): string {
  const cleanPassenger = passengerId?.trim();
  const cleanMerchant = merchantId?.trim();
  if (
    !cleanPassenger ||
    !cleanMerchant ||
    cleanPassenger.includes("@") ||
    /^\+?[0-9-]{8,15}$/.test(cleanPassenger)
  ) {
    throw new Error(
      "MerchantMemberID source must be an account identifier, never phone or email.",
    );
  }
  const digest = createHash("sha256")
    .update(`drts-ecpay-member:v1:${cleanMerchant}:${cleanPassenger}`)
    .digest("hex")
    .slice(0, 32);
  return `mbr_${digest}`;
}

/**
 * Derives a deterministic 20-character alphanumeric MerchantTradeNo from an
 * idempotency key so capture and readback (QueryTrade) reference the exact same trade.
 */
export function deriveEcpayMerchantTradeNo(idempotencyKey: string): string {
  const clean = idempotencyKey?.trim();
  if (!clean) {
    throw new Error("ECPay idempotencyKey is required.");
  }
  const hex = createHash("sha256")
    .update(`drts-ecpay-trade:v1:${clean}`)
    .digest("hex")
    .slice(0, 18)
    .toUpperCase();
  return `DR${hex}`;
}

/** Formats a Date as GMT+8 `yyyy/MM/dd HH:mm:ss` per ECPay specification. */
export function formatEcpayTradeDate(date: Date = new Date()): string {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error("Invalid trade date.");
  }
  const taipei = new Date(date.getTime() + TAIPEI_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = taipei.getUTCFullYear();
  const mm = pad(taipei.getUTCMonth() + 1);
  const dd = pad(taipei.getUTCDate());
  const hh = pad(taipei.getUTCHours());
  const mi = pad(taipei.getUTCMinutes());
  const ss = pad(taipei.getUTCSeconds());
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}:${ss}`;
}
