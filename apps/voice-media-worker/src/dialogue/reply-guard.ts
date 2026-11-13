/**
 * CALLCENTER-AI-ASSIST-20261111 (owner decision 2026-11-11, option A): the
 * AI speaks its own words in ordinary conversation turns -- asking for what
 * is missing, clarifying, reassuring -- instead of a handful of fixed
 * sentences. Facts and commitments stay controlled:
 *
 * - Booking confirmation keeps the verified read-back script (SD §6.2/§249);
 *   this guard never runs for it.
 * - A reply may only mention numbers, prices and street addresses the caller
 *   said this call or a tool returned this turn.
 * - A reply may not claim the booking is done, a driver is coming, a price,
 *   a refund or anything else only the system can decide.
 *
 * A reply that fails any rule is not spoken; the caller hears the fixed
 * fallback prompt for that state instead.
 */

export const MAX_SPOKEN_REPLY_CHARS = 120;

export type ReplyRejection =
  | "empty"
  | "too_long"
  | "link"
  | "commitment"
  | "unverified_number"
  | "unverified_address";

export type ReplyGuardResult =
  | { ok: true; text: string }
  | { ok: false; reason: ReplyRejection };

export interface ReplyGuardEvidence {
  /** What the caller said in this turn. */
  transcript: string;
  /** Values the caller gave earlier in this call (slot raw text/candidates). */
  heard: readonly string[];
  /** Strings returned by tools in this turn (labels, statuses). */
  toolFacts: readonly string[];
}

/** Statements only the booking system may make, never the model. */
const COMMITMENT_PATTERNS: readonly RegExp[] = [
  /(已|已經)(經)?(幫您|為您|替您)?(叫到|叫好|派|派好|派車|安排好|預約好|預訂好|完成叫車|成立|下單)/,
  /(訂單|車子|司機)(已|已經)(成立|出發|到|派出|接單)/,
  /司機(會|將|大約|約)?(在)?\s*[0-9０-９一二兩三四五六七八九十]+\s*分(鐘)?/,
  /保證|一定會到|免費|折扣|優惠|打折|退款|退費|賠償/,
  /(車資|費用|價格|價錢|收費).{0,8}[0-9０-９一二兩三四五六七八九十百千]+\s*(元|塊)/,
  /[0-9０-９]+\s*(元|塊錢|塊)/,
];

const LINK_PATTERN = /https?:\/\/|www\.|[\w.+-]+@[\w-]+\.[\w.]+/i;

/** Street-level address fragments: 中山北路二段45巷3號, 民生東路 … */
const ADDRESS_PATTERN =
  /[一-鿿0-9]{1,12}(路|街|大道)(?:[一-鿿0-9]{0,12}?(段|巷|弄|號))*/g;

function compact(value: string) {
  return value
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[\s，,。.、！!？?「」『』()（）-]/g, "")
    .replace(/臺/g, "台");
}

const CHINESE_DIGIT: Record<string, string> = {
  零: "0",
  〇: "0",
  一: "1",
  么: "1",
  二: "2",
  兩: "2",
  三: "3",
  四: "4",
  五: "5",
  六: "6",
  七: "7",
  八: "8",
  九: "9",
};

/** Digit strings in a text, spoken digit runs (零九一二…) included. */
function digitRuns(value: string): string[] {
  const ascii = compact(value).replace(
    /[零〇一么二兩三四五六七八九]{3,}/g,
    (run) => [...run].map((ch) => CHINESE_DIGIT[ch] ?? ch).join(""),
  );
  return ascii.match(/\d+/g) ?? [];
}

export function guardSpokenReply(
  raw: string | null | undefined,
  evidence: ReplyGuardEvidence,
): ReplyGuardResult {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, reason: "empty" };
  if (text.length > MAX_SPOKEN_REPLY_CHARS) {
    return { ok: false, reason: "too_long" };
  }
  if (LINK_PATTERN.test(text)) return { ok: false, reason: "link" };
  if (COMMITMENT_PATTERNS.some((pattern) => pattern.test(text))) {
    return { ok: false, reason: "commitment" };
  }

  const sources = [
    evidence.transcript,
    ...evidence.heard,
    ...evidence.toolFacts,
  ];
  const knownDigits = sources.flatMap(digitRuns).join(" ");
  // Two or more digits (door numbers, phone numbers, times, amounts) must
  // have been said by the caller or returned by a tool.
  for (const digits of digitRuns(text)) {
    if (digits.length >= 2 && !knownDigits.includes(digits)) {
      return { ok: false, reason: "unverified_number" };
    }
  }

  const knownText = sources.map(compact).join("|");
  for (const match of text.matchAll(ADDRESS_PATTERN)) {
    if (!isKnownAddress(compact(match[0]), knownText)) {
      return { ok: false, reason: "unverified_address" };
    }
  }
  return { ok: true, text };
}

/**
 * The match may start with words around the address ("從", "請問是"), so
 * leading characters are dropped one by one; the address is known when
 * what remains -- still at least a two-character road name -- was said.
 */
function isKnownAddress(address: string, knownText: string) {
  for (let start = 0; start < address.length; start += 1) {
    const rest = address.slice(start);
    const road = rest.search(/路|街|大道/);
    if (road < 2) return false;
    if (knownText.includes(rest)) return true;
  }
  return false;
}

/** What the caller already gave this call, as evidence for the guard. */
export function heardFromSlots(
  slots: Readonly<
    Record<string, { rawText: string; candidate: string } | undefined>
  >,
): string[] {
  return Object.values(slots).flatMap((slot) =>
    slot ? [slot.rawText, slot.candidate] : [],
  );
}
