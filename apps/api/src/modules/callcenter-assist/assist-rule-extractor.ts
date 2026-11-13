import {
  type AssistField,
  type AssistFieldMap,
  type AssistFieldValue,
  type AssistTranscriptSegment,
  clampConfidence,
  mergeCandidates,
  statusForConfidence,
} from "./assist-fields";

/**
 * Deterministic extraction of booking fields from a Taiwanese phone-booking
 * conversation (Mandarin text as produced by ASR). It is the baseline that
 * always runs; an optional LLM pass may refine it. Later segments win over
 * earlier ones (callers correct themselves, agents read back), and the
 * superseded values stay visible as candidates for the agent.
 */

interface Hit {
  field: AssistField;
  value: string;
  rawText: string;
  confidence: number;
  segment: AssistTranscriptSegment;
}

const CHINESE_DIGITS: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  么: 1,
  二: 2,
  兩: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

const NUMBER_CHARS = "0-9零〇一么二兩两三四五六七八九十";

/** Full-width digits/letters and punctuation to ASCII, collapse spaces. */
export function normalizeTranscriptText(text: string): string {
  return text
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
    )
    .replace(/[－—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** "十二" → 12, "二十" → 20, "兩" → 2, "35" → 35. Null when not a number. */
export function parseChineseNumber(text: string): number | null {
  const trimmed = text.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  if (!trimmed || !/^[零〇一么二兩两三四五六七八九十百]+$/.test(trimmed)) {
    return null;
  }
  let total = 0;
  let current = 0;
  for (const ch of trimmed) {
    if (ch === "百") {
      total += (current || 1) * 100;
      current = 0;
    } else if (ch === "十") {
      total += (current || 1) * 10;
      current = 0;
    } else {
      current = CHINESE_DIGITS[ch] ?? 0;
    }
  }
  return total + current;
}

/** Spoken digit runs ("零九一二…") become ASCII digits so phone patterns match. */
function digitizeSpokenRuns(text: string): string {
  return text.replace(
    /[零〇一么二兩两三四五六七八九\d][零〇一么二兩两三四五六七八九\d\s-]{6,}/g,
    (run) =>
      [...run]
        .map((ch) =>
          CHINESE_DIGITS[ch] !== undefined ? String(CHINESE_DIGITS[ch]) : ch,
        )
        .join(""),
  );
}

// ---------------------------------------------------------------- phone ---

const PHONE_PATTERN =
  /(?<!\d)(09\d{2}[-\s]?\d{3}[-\s]?\d{3}|0[2-8][-\s]?\d{3,4}[-\s]?\d{4})(?!\d)/g;

function extractPhones(segment: AssistTranscriptSegment, text: string): Hit[] {
  const hits: Hit[] = [];
  for (const match of digitizeSpokenRuns(text).matchAll(PHONE_PATTERN)) {
    const digits = match[1]!.replace(/\D/g, "");
    hits.push({
      field: "passengerPhone",
      value: digits,
      rawText: match[0],
      confidence: digits.startsWith("09") && digits.length === 10 ? 0.95 : 0.85,
      segment,
    });
  }
  return hits;
}

// ----------------------------------------------------------------- name ---

const NAME_STOP_FIRST_CHARS = new Set([..."車一台輛計個部幾要想在從到去叫找"]);
const HONORIFIC = "先生|小姐|太太|女士|阿姨|伯伯|奶奶|爺爺";

function extractNames(segment: AssistTranscriptSegment, text: string): Hit[] {
  const hits: Hit[] = [];
  const patterns: Array<{ re: RegExp; confidence: number; speaker?: string }> =
    [
      // 我姓王 / 敝姓王 / 我是王先生
      {
        re: new RegExp(`(?:我|敝)姓([\\u4e00-\\u9fff])(${HONORIFIC})?`, "g"),
        confidence: 0.8,
      },
      {
        re: new RegExp(`我是([\\u4e00-\\u9fff]{1,2})(${HONORIFIC})`, "g"),
        confidence: 0.85,
      },
      // 我叫王小明 / 我的名字是王小明
      {
        re: /(?:我叫做?|我的名字(?:是|叫))([一-鿿]{2,3})/g,
        confidence: 0.8,
      },
      // Agent read-back: 王先生您好 / 好的王小姐
      {
        re: new RegExp(
          `(?:^|[，,。好的您是請問\\s])([\\u4e00-\\u9fff])(${HONORIFIC})(?=[，,。您你請嗎\\s]|$)`,
          "g",
        ),
        confidence: 0.75,
        speaker: "agent",
      },
    ];
  for (const { re, confidence, speaker } of patterns) {
    if (speaker && segment.speaker !== speaker) {
      continue;
    }
    for (const match of text.matchAll(re)) {
      const name = match[1]!;
      if (NAME_STOP_FIRST_CHARS.has(name[0]!)) {
        continue;
      }
      const honorific = match[2] ?? "";
      const value = `${name}${honorific}`;
      hits.push({
        field: "passengerName",
        value,
        rawText: match[0].replace(/^[，,。好的您是請問\s]+/, ""),
        // A bare surname without 先生/小姐 is a guess the agent should check.
        confidence: name.length === 1 && !honorific ? 0.6 : confidence,
        segment,
      });
    }
  }
  return hits;
}

// --------------------------------------------------------------- places ---

/** Longest cues first so "目的地是" wins over "是", "要到" over "到". */
const DROPOFF_CUES = [
  "目的地是",
  "目的地在",
  "下車地點是",
  "下車地點在",
  "下車的地方是",
  "載我到",
  "載我去",
  "送我到",
  "送我去",
  "我要到",
  "我要去",
  "要到",
  "要去",
  "回去",
  "前往",
  "載到",
  "送到",
  "到",
  "去",
  "往",
];
const PICKUP_CUES = [
  "上車地點是",
  "上車地點在",
  "上車的地方是",
  "上車在",
  "地址是",
  "地址在",
  "我人在",
  "我現在在",
  "我在",
  "人在",
  "從",
  "在",
  "來",
];
/** Multi-character cues are explicit enough to trust a phrase without a
 * place-like suffix; single characters are too common in ordinary speech. */
const STRONG_CUE_MIN_LENGTH = 2;

const CUE_PREFIX_EXCLUSIONS: Record<string, string> = {
  在: "現正存實還不自好都也就",
  到: "收聽看找遲想做得等拿買辦",
  去: "過出進上下回失",
  來: "起出進上下回過原後本看",
  往: "以來交",
};

const PLACE_STOP =
  /[，,。.!！?？；;]|上車|下車|要|叫|搭|坐|嗎|喔|哦|啊|呢|吧|好的|謝謝|麻煩|然後|的話|等|到|去|從|接我|載我|那邊|這邊|這裡|那裡|附近/;

const PLACE_HINT =
  /(路|街|大道|段|巷|弄|號|區|里|村|站|機場|醫院|診所|學校|大學|國小|國中|高中|公園|市場|夜市|百貨|商場|大樓|中心|廣場|宮|廟|寺|教會|飯店|酒店|旅館|公所|郵局|銀行|門口|路口|捷運|高鐵|火車|客運|超商|全家|7-11|小七|家樂福|全聯|好市多|市|縣|鄉|鎮|橋|港|館|店)/;

const LEADING_FILLER = /^(我|人|現在|這邊|那邊|一下|就是|那個|嗯|呃|是|在)+/;

function placeConfidence(place: string, strongCue: boolean): number {
  if (/[0-9一二三四五六七八九十]+號/.test(place)) {
    return 0.9;
  }
  if (/(路|街|大道)/.test(place) && /(段|巷|弄)/.test(place)) {
    return 0.8;
  }
  if (PLACE_HINT.test(place)) {
    return /(路|街|大道)$/.test(place) ? 0.7 : 0.8;
  }
  return strongCue ? 0.6 : 0.4;
}

function cleanPlace(phrase: string): string {
  return phrase
    .replace(LEADING_FILLER, "")
    .replace(/(這邊|那邊|這裡|那裡|附近|一下)+$/, "")
    .trim();
}

function findCueAt(
  text: string,
  index: number,
): { cue: string; kind: "pickup" | "dropoff" } | null {
  const candidates: Array<{ cue: string; kind: "pickup" | "dropoff" }> = [
    ...DROPOFF_CUES.map((cue) => ({ cue, kind: "dropoff" as const })),
    ...PICKUP_CUES.map((cue) => ({ cue, kind: "pickup" as const })),
  ].sort((a, b) => b.cue.length - a.cue.length);
  for (const candidate of candidates) {
    if (!text.startsWith(candidate.cue, index)) {
      continue;
    }
    const excluded = CUE_PREFIX_EXCLUSIONS[candidate.cue];
    if (excluded && index > 0 && excluded.includes(text[index - 1]!)) {
      continue;
    }
    return candidate;
  }
  return null;
}

function extractPlaces(segment: AssistTranscriptSegment, text: string): Hit[] {
  const hits: Hit[] = [];
  const claimed: Array<[number, number]> = [];
  let index = 0;
  while (index < text.length) {
    const cue = findCueAt(text, index);
    if (!cue) {
      index += 1;
      continue;
    }
    const start = index + cue.cue.length;
    const rest = text.slice(start);
    const stop = rest.search(PLACE_STOP);
    const phrase = stop === -1 ? rest : rest.slice(0, stop);
    const place = cleanPlace(phrase);
    const strong = cue.cue.length >= STRONG_CUE_MIN_LENGTH;
    if (
      place.length >= 2 &&
      place.length <= 40 &&
      (strong || PLACE_HINT.test(place))
    ) {
      // "台北車站上車" / "在醫院下車" restate the role after the place.
      const after = rest.slice(phrase.length);
      const kind = after.startsWith("下車")
        ? "dropoff"
        : after.startsWith("上車")
          ? "pickup"
          : cue.kind;
      hits.push({
        field: kind,
        value: place,
        rawText: `${cue.cue}${phrase}`,
        confidence: placeConfidence(place, strong),
        segment,
      });
      claimed.push([start, start + phrase.length]);
      index = start + phrase.length;
      continue;
    }
    index = start;
  }

  // "台北車站上車" with no leading cue.
  for (const match of text.matchAll(
    /([^，,。.!！?？；;\s]{2,30}?)(上車|下車)/g,
  )) {
    const begin = match.index ?? 0;
    if (claimed.some(([s, e]) => begin < e && begin + match[0].length > s)) {
      continue;
    }
    const place = cleanPlace(match[1]!);
    if (place.length < 2 || !PLACE_HINT.test(place)) {
      continue;
    }
    hits.push({
      field: match[2] === "上車" ? "pickup" : "dropoff",
      value: place,
      rawText: match[0],
      confidence: placeConfidence(place, false),
      segment,
    });
  }

  // A full street address said without any cue (e.g. answering "地址呢？").
  if (hits.length === 0) {
    const bare = text.match(
      new RegExp(
        `([\\u4e00-\\u9fff]{0,6}(?:路|街|大道)(?:[${NUMBER_CHARS}]+段)?(?:[${NUMBER_CHARS}]+巷)?(?:[${NUMBER_CHARS}]+弄)?[${NUMBER_CHARS}之-]+號(?:[${NUMBER_CHARS}]+樓)?)`,
      ),
    );
    if (bare) {
      hits.push({
        field: "pickup",
        value: cleanPlace(bare[1]!),
        rawText: bare[0],
        // Role is a guess: a street address alone does not say pickup or drop-off.
        confidence: 0.6,
        segment,
      });
    }
  }
  return hits;
}

// ----------------------------------------------------------------- time ---

function extractTimes(segment: AssistTranscriptSegment, text: string): Hit[] {
  const hits: Hit[] = [];
  const now =
    text.match(/馬上|立刻|盡快|越快越好|愈快愈好/) ??
    (/叫車|要車|派車|派一台|來接|過來載/.test(text)
      ? text.match(/現在/)
      : null);
  if (now) {
    hits.push({
      field: "pickupTime",
      value: "現在（即時叫車）",
      rawText: now[0],
      confidence: 0.85,
      segment,
    });
  }
  const minutes = text.match(
    new RegExp(`([${NUMBER_CHARS}]{1,3})\\s*分鐘(?:之|以)?後`),
  );
  if (minutes) {
    const value = parseChineseNumber(minutes[1]!);
    if (value !== null) {
      hits.push({
        field: "pickupTime",
        value: `${value} 分鐘後`,
        rawText: minutes[0],
        confidence: 0.8,
        segment,
      });
    }
  }
  const clock = text.match(
    new RegExp(
      `(今天|明天|後天)?\\s*(早上|上午|中午|下午|傍晚|晚上|凌晨)?\\s*([${NUMBER_CHARS}]{1,3})\\s*(?:點|:|：)\\s*(半|[${NUMBER_CHARS}]{1,3}\\s*分?)?`,
    ),
  );
  // "快一點" / "多一點" mean "a bit faster/more", not 1 o'clock.
  const degreeWord =
    clock &&
    !clock[1] &&
    !clock[2] &&
    /[快多少近遠慢早晚好大小高低差點有]$/.test(text.slice(0, clock.index ?? 0));
  if (
    clock &&
    !degreeWord &&
    (clock[1] || clock[2] || /點/.test(clock[0]) || clock[4])
  ) {
    const hour = parseChineseNumber(clock[3]!);
    const minuteText = clock[4]?.replace(/分|\s/g, "");
    const minute =
      minuteText === "半"
        ? 30
        : minuteText
          ? parseChineseNumber(minuteText)
          : 0;
    if (hour !== null && hour <= 24 && minute !== null && minute < 60) {
      const parts = [clock[1], clock[2]].filter(Boolean).join(" ");
      const hhmm = `${hour}:${String(minute).padStart(2, "0")}`;
      hits.push({
        field: "pickupTime",
        value: parts ? `${parts} ${hhmm}` : hhmm,
        rawText: clock[0].trim(),
        // Without 上午/下午 a bare "3點" is ambiguous (03:00 or 15:00).
        confidence: clock[2] || hour > 12 ? 0.85 : 0.65,
        segment,
      });
    }
  }
  return hits;
}

// ----------------------------------------------- passengers and luggage ---

function extractCounts(segment: AssistTranscriptSegment, text: string): Hit[] {
  const hits: Hit[] = [];
  const passenger = text.match(
    new RegExp(
      `([${NUMBER_CHARS}]{1,2})\\s*(?:位|個人|個乘客|名乘客|人)(?!民|員|家|行李)`,
    ),
  );
  const alone = /就?我一個人|只有我一個|一個人而已/.exec(text);
  if (passenger) {
    const value = parseChineseNumber(passenger[1]!);
    if (value !== null && value >= 1 && value <= 20) {
      hits.push({
        field: "passengerCount",
        value: String(value),
        rawText: passenger[0],
        confidence: 0.85,
        segment,
      });
    }
  } else if (alone) {
    hits.push({
      field: "passengerCount",
      value: "1",
      rawText: alone[0],
      confidence: 0.8,
      segment,
    });
  }

  const luggage = text.match(
    new RegExp(
      `([${NUMBER_CHARS}]{1,2})\\s*(?:件|個|箱|咖|顆)\\s*(大|小)?\\s*(?:型)?(?:行李箱?|箱子|皮箱)`,
    ),
  );
  if (luggage) {
    const count = parseChineseNumber(luggage[1]!);
    if (count !== null && count <= 20) {
      hits.push({
        field: "luggage",
        value: `${count} 件${luggage[2] === "大" ? "（大型）" : ""}`,
        rawText: luggage[0],
        confidence: 0.85,
        segment,
      });
    }
  } else if (/(沒有|不用|免|無)\s*行李/.test(text)) {
    hits.push({
      field: "luggage",
      value: "0 件",
      rawText: text.match(/(沒有|不用|免|無)\s*行李/)![0],
      confidence: 0.8,
      segment,
    });
  } else if (/(有|帶|拿)[^，,。]{0,4}行李/.test(text)) {
    hits.push({
      field: "luggage",
      value: "有行李（件數未說）",
      rawText: text.match(/(有|帶|拿)[^，,。]{0,4}行李/)![0],
      confidence: 0.5,
      segment,
    });
  }
  return hits;
}

// --------------------------------------------- needs and free-form notes ---

const NEGATION = /(不用|不需要|不必|沒有|免|無)\s*$/;

function extractNeeds(segment: AssistTranscriptSegment, text: string): Hit[] {
  const needs: string[] = [];
  const raw: string[] = [];
  const check = (pattern: RegExp, need: string) => {
    const match = pattern.exec(text);
    if (match && !NEGATION.test(text.slice(0, match.index))) {
      needs.push(need);
      raw.push(match[0]);
    }
  };
  check(/輪椅/, "wheelchair");
  check(/(兒童|嬰兒|安全)座椅|汽座/, "child_seat");
  const hits: Hit[] = [];
  if (needs.length) {
    hits.push({
      field: "requiredCapabilities",
      value: needs.join(","),
      rawText: raw.join("、"),
      confidence: 0.9,
      segment,
    });
  }

  const notes: string[] = [];
  const notePatterns: Array<[RegExp, string]> = [
    [/寵物|狗狗?|貓咪?/, "帶寵物"],
    [/孕婦|懷孕/, "孕婦"],
    [/行動不便|拐杖|助行器|走路不方便/, "行動不便"],
    [/嬰兒車|推車/, "嬰兒車"],
    [/刷卡|信用卡/, "要刷卡"],
    [/統編|統一編號|收據|發票/, "要收據／統編"],
  ];
  for (const [pattern, label] of notePatterns) {
    const match = pattern.exec(text);
    if (match && !NEGATION.test(text.slice(0, match.index))) {
      notes.push(label);
    }
  }
  if (notes.length) {
    hits.push({
      field: "notes",
      value: notes.join("、"),
      rawText: text,
      confidence: 0.8,
      segment,
    });
  }
  return hits;
}

// ------------------------------------------------------------- assembly ---

export function extractHitsFromSegment(segment: AssistTranscriptSegment) {
  const text = normalizeTranscriptText(segment.text);
  if (!text) {
    return [] as Hit[];
  }
  return [
    ...extractPhones(segment, text),
    ...extractNames(segment, text),
    ...extractPlaces(segment, text),
    ...extractTimes(segment, text),
    ...extractCounts(segment, text),
    ...extractNeeds(segment, text),
  ];
}

/**
 * Run all rules over the whole transcript. Notes accumulate across segments;
 * every other field takes its most recent value and keeps earlier distinct
 * values as candidates.
 */
export function extractAssistFieldsByRules(
  segments: readonly AssistTranscriptSegment[],
  now: string = new Date().toISOString(),
): AssistFieldMap {
  const fields: AssistFieldMap = {};
  const noteLabels: string[] = [];
  const noteSegments: string[] = [];
  for (const segment of segments) {
    for (const hit of extractHitsFromSegment(segment)) {
      if (hit.field === "notes") {
        for (const label of hit.value.split("、")) {
          if (!noteLabels.includes(label)) noteLabels.push(label);
        }
        noteSegments.push(segment.segmentId);
        continue;
      }
      const previous = fields[hit.field];
      if (previous && previous.value === hit.value) {
        // Repetition (e.g. the agent's read-back) raises confidence.
        const confidence = clampConfidence(
          Math.max(previous.confidence ?? 0, hit.confidence) + 0.05,
        );
        fields[hit.field] = {
          ...previous,
          confidence,
          status: statusForConfidence(confidence),
          sourceSegmentIds: [
            ...new Set([...previous.sourceSegmentIds, segment.segmentId]),
          ],
        };
        continue;
      }
      const confidence = clampConfidence(hit.confidence);
      const value: AssistFieldValue = {
        value: hit.value,
        rawText: hit.rawText,
        confidence,
        status: statusForConfidence(confidence),
        candidates: previous
          ? mergeCandidates(previous.candidates, previous.value).filter(
              (candidate) => candidate !== hit.value,
            )
          : [],
        origin: "rules",
        sourceSegmentIds: [segment.segmentId],
        updatedAt: now,
      };
      fields[hit.field] = value;
    }
  }
  if (noteLabels.length) {
    fields.notes = {
      value: noteLabels.join("、"),
      rawText: null,
      confidence: 0.8,
      status: "filled",
      candidates: [],
      origin: "rules",
      sourceSegmentIds: [...new Set(noteSegments)],
      updatedAt: now,
    };
  }
  return fields;
}
