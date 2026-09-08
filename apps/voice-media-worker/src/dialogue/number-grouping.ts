/**
 * Number grouping and correction utilities for voice dialogue (Acceptance §2):
 * "電話、門牌、時間數字分組讀回與更正"
 */

const CHINESE_DIGIT_MAP: Record<string, string> = {
  "零": "0",
  "O": "0",
  "o": "0",
  "一": "1",
  "二": "2",
  "兩": "2",
  "三": "3",
  "四": "4",
  "五": "5",
  "六": "6",
  "七": "7",
  "八": "8",
  "九": "9",
};

/**
 * Normalizes mixed Chinese/Arabic digit utterances into pure digits.
 */
export function normalizeSpokenDigits(raw: string): string {
  let result = "";
  for (const char of raw) {
    if (/\d/.test(char)) {
      result += char;
    } else if (CHINESE_DIGIT_MAP[char]) {
      result += CHINESE_DIGIT_MAP[char];
    }
  }
  return result;
}

export interface GroupedPhoneNumber {
  raw: string;
  normalized: string;
  groups: string[];
  spokenReadback: string;
  isValid: boolean;
}

/**
 * Groups a phone number into spoken chunks (4-3-3 for mobile, 2-4-4 for landline)
 * for unambiguous TTS readback and verification.
 */
export function groupPhoneNumber(input: string): GroupedPhoneNumber {
  const digits = normalizeSpokenDigits(input);

  // Taiwan 10-digit mobile (09xx-xxx-xxx): 4-3-3 grouping
  if (digits.length === 10 && digits.startsWith("09")) {
    const g1 = digits.slice(0, 4);
    const g2 = digits.slice(4, 7);
    const g3 = digits.slice(7, 10);
    return {
      raw: input,
      normalized: digits,
      groups: [g1, g2, g3],
      spokenReadback: `${g1}、${g2}、${g3}`,
      isValid: true,
    };
  }

  // Taiwan 10-digit landline (e.g. 02-xxxx-xxxx): 2-4-4 grouping
  if (digits.length === 10 && digits.startsWith("0")) {
    const g1 = digits.slice(0, 2);
    const g2 = digits.slice(2, 6);
    const g3 = digits.slice(6, 10);
    return {
      raw: input,
      normalized: digits,
      groups: [g1, g2, g3],
      spokenReadback: `${g1}、${g2}、${g3}`,
      isValid: true,
    };
  }

  // Generic grouping into chunks of 3-4
  const groups: string[] = [];
  for (let i = 0; i < digits.length; i += 4) {
    groups.push(digits.slice(i, i + 4));
  }

  return {
    raw: input,
    normalized: digits,
    groups,
    spokenReadback: groups.join("、"),
    isValid: digits.length >= 7 && digits.length <= 11,
  };
}

/**
 * Handles telephone number correction utterances (e.g. "不對，後面三碼是 789", "改 0987654321").
 */
export function repairPhoneNumber(
  current: GroupedPhoneNumber,
  correctionUtterance: string,
): {
  repaired: GroupedPhoneNumber;
  isCorrected: boolean;
  correctionType: "full" | "suffix" | "middle" | "none";
} {
  // Strip counter quantifiers like "三碼", "4位", "3個" so the counter is not mistaken for a digit
  const cleanedUtterance = correctionUtterance.replace(
    /[一二兩三四五六七八九十\d]\s*[碼位個]/g,
    "",
  );
  const digitsInCorrection = normalizeSpokenDigits(cleanedUtterance);

  // Full 10-digit replacement
  if (digitsInCorrection.length === 10) {
    return {
      repaired: groupPhoneNumber(digitsInCorrection),
      isCorrected: true,
      correctionType: "full",
    };
  }

  // Suffix correction (e.g. "後面三碼是 789", "末碼是 789", "尾數是 679")
  if (
    /後|末|尾|最後/i.test(correctionUtterance) &&
    digitsInCorrection.length >= 1 &&
    digitsInCorrection.length <= 4
  ) {
    const base = current.normalized;
    if (base.length === 10) {
      const prefix = base.slice(0, 10 - digitsInCorrection.length);
      const newDigits = prefix + digitsInCorrection;
      return {
        repaired: groupPhoneNumber(newDigits),
        isCorrected: true,
        correctionType: "suffix",
      };
    }
  }

  // Middle group correction (e.g. "中間是 888 不是 345")
  if (
    /中/i.test(correctionUtterance) &&
    digitsInCorrection.length === 3 &&
    current.groups.length === 3 &&
    current.groups[0] &&
    current.groups[2]
  ) {
    const newDigits = current.groups[0] + digitsInCorrection + current.groups[2];
    return {
      repaired: groupPhoneNumber(newDigits),
      isCorrected: true,
      correctionType: "middle",
    };
  }

  // Suffix fallback if 3 digits provided with negative cue
  if (
    /不是|不對|改/i.test(correctionUtterance) &&
    digitsInCorrection.length === 3 &&
    current.groups.length === 3 &&
    current.groups[0] &&
    current.groups[1]
  ) {
    const newDigits = current.groups[0] + current.groups[1] + digitsInCorrection;
    return {
      repaired: groupPhoneNumber(newDigits),
      isCorrected: true,
      correctionType: "suffix",
    };
  }

  return {
    repaired: current,
    isCorrected: false,
    correctionType: "none",
  };
}

export interface GroupedHouseNumber {
  raw: string;
  normalized: string;
  digits: string;
  spokenReadback: string;
  isValid: boolean;
}

/**
 * Groups and formats door/house numbers.
 * Reads digits individually (e.g. "1 0 5 號") to prevent ambiguity between
 * "一百零五號" and "一百五十號".
 */
export function groupHouseNumber(input: string): GroupedHouseNumber {
  const digits = normalizeSpokenDigits(input);
  if (!digits) {
    return {
      raw: input,
      normalized: input,
      digits: "",
      spokenReadback: input,
      isValid: false,
    };
  }

  // Read each digit separated by space followed by 號
  const digitChars = digits.split("").join(" ");
  const spoken = `${digitChars} 號`;

  return {
    raw: input,
    normalized: `${digits}號`,
    digits,
    spokenReadback: spoken,
    isValid: true,
  };
}

/**
 * Handles house/door number correction utterances (e.g. "不是 105 號，是 150 號", "門牌改 28 號").
 */
export function repairHouseNumber(
  current: GroupedHouseNumber,
  correctionUtterance: string,
): {
  repaired: GroupedHouseNumber;
  isCorrected: boolean;
} {
  let targetUtterance = correctionUtterance;
  const notPattern = /不是\s*([0-9]+|[零一二兩三四五六七八九]+)\s*號?[，,、\s]+(?:是|改(?:成)?|換成|為)?\s*([0-9]+|[零一二兩三四五六七八九]+)/i.exec(
    correctionUtterance,
  );
  if (notPattern && notPattern[2]) {
    targetUtterance = notPattern[2];
  } else {
    const correctionMatch = /(?<!不)(?:是|改(?:成)?|換成|為)\s*([0-9\s]+|[零一二兩三四五六七八九]+)\s*號?/i.exec(
      correctionUtterance,
    );
    if (correctionMatch && correctionMatch[1]) {
      targetUtterance = correctionMatch[1];
    }
  }

  const digits = normalizeSpokenDigits(targetUtterance);
  if (digits && digits !== current.digits) {
    return {
      repaired: groupHouseNumber(digits),
      isCorrected: true,
    };
  }

  return {
    repaired: current,
    isCorrected: false,
  };
}

export interface GroupedPickupTime {
  raw: string;
  normalized: string; // HH:mm or "immediate"
  hour: number | null;
  minute: number | null;
  spokenReadback: string;
  isValid: boolean;
}

/**
 * Groups and formats booking pickup times.
 */
export function groupPickupTime(input: string): GroupedPickupTime {
  const trimmed = input.trim();
  if (/現在|馬上|即時|立刻/i.test(trimmed)) {
    return {
      raw: input,
      normalized: "immediate",
      hour: null,
      minute: null,
      spokenReadback: "現在出發",
      isValid: true,
    };
  }

  // Match HH:mm pattern or Chinese time patterns (e.g. 下午兩點半, 14點30分)
  const colonMatch = /(\d{1,2}):(\d{2})/.exec(trimmed);
  if (colonMatch && colonMatch[1] && colonMatch[2]) {
    const hour = parseInt(colonMatch[1], 10);
    const minute = parseInt(colonMatch[2], 10);
    const period = hour >= 12 ? "下午" : "上午";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    const spoken = `${period} ${displayHour} 點 ${minute === 30 ? "半" : `${minute} 分`}`;
    return {
      raw: input,
      normalized: `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`,
      hour,
      minute,
      spokenReadback: spoken,
      isValid: hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59,
    };
  }

  // Check Chinese patterns (e.g. 下午三點, 3點半, 15點20分)
  const isPm = /下午|晚上/i.test(trimmed);
  const hourMatch = /([一二兩三四五六七八九十\d]+)\s*點/.exec(trimmed);
  if (hourMatch && hourMatch[1]) {
    const rawH = hourMatch[1];
    let h = parseInt(normalizeSpokenDigits(rawH) || "0", 10);
    if (rawH === "十") h = 10;
    if (isPm && h < 12) h += 12;

    let m = 0;
    if (/半/.test(trimmed)) {
      m = 30;
    } else {
      const minMatch = /點\s*([一二兩三四五六七八九十\d]+)\s*分?/.exec(trimmed);
      if (minMatch && minMatch[1]) {
        m = parseInt(normalizeSpokenDigits(minMatch[1]) || "0", 10);
      }
    }

    const period = h >= 12 ? "下午" : "上午";
    const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    const spoken = `${period} ${displayHour} 點 ${m === 30 ? "半" : m === 0 ? "整" : `${m} 分`}`;

    return {
      raw: input,
      normalized: `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`,
      hour: h,
      minute: m,
      spokenReadback: spoken,
      isValid: h >= 0 && h <= 23 && m >= 0 && m <= 59,
    };
  }

  return {
    raw: input,
    normalized: trimmed,
    hour: null,
    minute: null,
    spokenReadback: trimmed,
    isValid: false,
  };
}

/**
 * Handles time correction utterances (e.g. "不是兩點，是三點", "改 15:30", "改下午三點").
 */
export function repairPickupTime(
  current: GroupedPickupTime,
  correctionUtterance: string,
): {
  repaired: GroupedPickupTime;
  isCorrected: boolean;
} {
  // Check if utterance specifies only the hour without specifying minutes (neither "分" nor "半" nor "整")
  const hourOnlyMatch = /(?:改|是)?\s*(上午|下午|晚上)?\s*([一二兩三四五六七八九十\d]+)\s*點(?!\s*([一二兩三四五六七八九十\d]+|半|整))/.exec(
    correctionUtterance,
  );

  if (hourOnlyMatch && hourOnlyMatch[2] && current.minute !== null) {
    const rawPeriod = hourOnlyMatch[1];
    const isPm =
      rawPeriod === "下午" ||
      rawPeriod === "晚上" ||
      (!rawPeriod && current.hour !== null && current.hour >= 12);
    let h = parseInt(normalizeSpokenDigits(hourOnlyMatch[2]) || "0", 10);
    if (hourOnlyMatch[2] === "十") h = 10;
    if (isPm && h < 12) h += 12;

    const m = current.minute;
    const period = h >= 12 ? "下午" : "上午";
    const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    const spoken = `${period} ${displayHour} 點 ${m === 30 ? "半" : m === 0 ? "整" : `${m} 分`}`;
    return {
      repaired: {
        raw: correctionUtterance,
        normalized: `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`,
        hour: h,
        minute: m,
        spokenReadback: spoken,
        isValid: true,
      },
      isCorrected: true,
    };
  }

  const parsed = groupPickupTime(correctionUtterance);
  if (parsed.isValid && parsed.normalized !== current.normalized) {
    return {
      repaired: parsed,
      isCorrected: true,
    };
  }

  return {
    repaired: current,
    isCorrected: false,
  };
}
