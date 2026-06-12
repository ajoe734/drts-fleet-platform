import type { CSSProperties, ReactNode } from "react";
import {
  getProgramChromeVars,
  type PartnerProgramTheme,
} from "@/lib/program-theme";
import { t as translate, type Locale } from "@/lib/translations";

/**
 * Shared partner-booking screens that render themed per program.
 *
 * The screen set is fixed across all programs (信用卡 / 保險 / 旅行社); only the
 * palette and brand wording switch via {@link PartnerProgramTheme}. Program
 * specific *forms* are layered on top by DH-PB-PROGRAM-FORMS.
 */

export const PARTNER_PROGRAM_SCREENS = [
  {
    id: "landing",
    segment: "landing",
    label: "入口",
    eyebrow: "PB_Landing",
    summary: "品牌入口 hero、額度餘額與服務選單。",
  },
  {
    id: "eligibility",
    segment: "eligibility",
    label: "資格確認",
    eyebrow: "PB_Eligibility",
    summary: "首次使用的權益確認與授權同意。",
  },
  {
    id: "insurance_policy",
    segment: "insurance_policy",
    label: "保單驗證",
    eyebrow: "PB_InsBlocked",
    summary: "保單未通過核驗，理賠代步仍維持封鎖。",
  },
  {
    id: "insurance_replacement_vehicle",
    segment: "insurance_replacement_vehicle",
    label: "代步車權益",
    eyebrow: "PB_InsBlocked",
    summary: "代步車型或保障窗未核定，無法建立代步行程。",
  },
  {
    id: "insurance_roster",
    segment: "insurance_roster",
    label: "乘客名單",
    eyebrow: "PB_InsBlocked",
    summary: "理賠案件乘客名單未對齊，需先修正保險名單資料。",
  },
  {
    id: "insurance_pending",
    segment: "insurance_pending",
    label: "理賠審核中",
    eyebrow: "PB_InsBlocked",
    summary: "理賠案件尚在審核流程，代步權益未開通。",
  },
  {
    id: "insurance_missing",
    segment: "insurance_missing",
    label: "查無案件",
    eyebrow: "PB_InsBlocked",
    summary: "保單或理賠參照查無對應案件，需重新確認資料。",
  },
  {
    id: "insurance_expired",
    segment: "insurance_expired",
    label: "保障已逾期",
    eyebrow: "PB_InsBlocked",
    summary: "代步保障期間已結束，本案無法再建立新行程。",
  },
  {
    id: "insurance_cancelled",
    segment: "insurance_cancelled",
    label: "案件已結案",
    eyebrow: "PB_InsBlocked",
    summary: "理賠案件已取消或結清，代步權益同步關閉。",
  },
  {
    id: "review",
    segment: "review",
    label: "下單前確認",
    eyebrow: "PB_Review",
    summary: "上下車、時間、服務與費用 / 額度彙整。",
  },
  {
    id: "success",
    segment: "success",
    label: "預約成功",
    eyebrow: "PB_Success",
    summary: "預約成立、訂單編號與後續指引。",
  },
  {
    id: "tracking",
    segment: "tracking",
    label: "行程追蹤",
    eyebrow: "PB_Tracking",
    summary: "駕駛資訊、即時位置與行程明細。",
  },
  {
    id: "error",
    segment: "error",
    label: "發生錯誤",
    eyebrow: "PB_Error",
    summary: "可重試的錯誤狀態與客服入口。",
  },
  {
    id: "manual_review",
    segment: "manual-review",
    label: "人工審查",
    eyebrow: "PB_ManualReview",
    summary: "資格送人工審查的等待狀態。",
  },
  {
    id: "embed_handoff",
    segment: "embed-handoff",
    label: translate("program.screen.embed_handoff.label"),
    eyebrow: "PB_EmbedHandoff",
    summary: translate("program.screen.embed_handoff.summary"),
  },
  {
    id: "embed_reauth",
    segment: "embed-reauth",
    label: translate("program.screen.embed_reauth.label"),
    eyebrow: "PB_EmbedReauth",
    summary: translate("program.screen.embed_reauth.summary"),
  },
  {
    id: "embed_unsupported",
    segment: "embed-unsupported",
    label: translate("program.screen.embed_unsupported.label"),
    eyebrow: "PB_EmbedUnsupported",
    summary: translate("program.screen.embed_unsupported.summary"),
  },
  {
    id: "embed_consent",
    segment: "embed-consent",
    label: translate("program.screen.embed_consent.label"),
    eyebrow: "PB_EmbedConsent",
    summary: translate("program.screen.embed_consent.summary"),
  },
  {
    id: "embed_fallback",
    segment: "embed-fallback",
    label: translate("program.screen.embed_fallback.label"),
    eyebrow: "PB_EmbedFallback",
    summary: translate("program.screen.embed_fallback.summary"),
  },
] as const;

export type PartnerProgramScreenId =
  (typeof PARTNER_PROGRAM_SCREENS)[number]["id"];

type ProgramScreenMeta = (typeof PARTNER_PROGRAM_SCREENS)[number];
type ProgramScreenCopy = {
  label: string;
  summary: string;
};

const PROGRAM_SCREEN_COPY: Record<
  PartnerProgramScreenId,
  Record<Locale, ProgramScreenCopy>
> = {
  landing: {
    zh: { label: "入口", summary: "品牌入口 hero、額度餘額與服務選單。" },
    en: {
      label: "Landing",
      summary: "Branded entry hero, benefit balance, and service menu.",
    },
  },
  eligibility: {
    zh: { label: "資格確認", summary: "首次使用的權益確認與授權同意。" },
    en: {
      label: "Eligibility",
      summary: "First-use benefit confirmation and consent.",
    },
  },
  insurance_policy: {
    zh: { label: "保單驗證", summary: "保單未通過核驗，理賠代步仍維持封鎖。" },
    en: {
      label: "Policy check",
      summary:
        "Replacement mobility remains blocked until policy verification passes.",
    },
  },
  insurance_replacement_vehicle: {
    zh: {
      label: "代步車權益",
      summary: "代步車型或保障窗未核定，無法建立代步行程。",
    },
    en: {
      label: "Replacement benefit",
      summary: "Vehicle class or coverage window is not approved yet.",
    },
  },
  insurance_roster: {
    zh: {
      label: "乘客名單",
      summary: "理賠案件乘客名單未對齊，需先修正保險名單資料。",
    },
    en: {
      label: "Passenger roster",
      summary: "Insurance passenger roster must be corrected before booking.",
    },
  },
  insurance_pending: {
    zh: {
      label: "理賠審核中",
      summary: "理賠案件尚在審核流程，代步權益未開通。",
    },
    en: {
      label: "Claim pending",
      summary:
        "The claim is still under review, so mobility benefit is not open.",
    },
  },
  insurance_missing: {
    zh: {
      label: "查無案件",
      summary: "保單或理賠參照查無對應案件，需重新確認資料。",
    },
    en: {
      label: "Claim not found",
      summary: "No matching policy or claim reference was found.",
    },
  },
  insurance_expired: {
    zh: {
      label: "保障已逾期",
      summary: "代步保障期間已結束，本案無法再建立新行程。",
    },
    en: {
      label: "Coverage expired",
      summary: "The replacement-vehicle coverage window has ended.",
    },
  },
  insurance_cancelled: {
    zh: {
      label: "案件已結案",
      summary: "理賠案件已取消或結清，代步權益同步關閉。",
    },
    en: {
      label: "Claim closed",
      summary:
        "The claim is cancelled or settled, so mobility benefit is closed.",
    },
  },
  review: {
    zh: {
      label: "下單前確認",
      summary: "上下車、時間、服務與費用 / 額度彙整。",
    },
    en: {
      label: "Review",
      summary: "Pickup, drop-off, time, service, fee, and benefit summary.",
    },
  },
  success: {
    zh: { label: "預約成功", summary: "預約成立、訂單編號與後續指引。" },
    en: {
      label: "Booked",
      summary: "Booking confirmation, reference number, and next steps.",
    },
  },
  tracking: {
    zh: { label: "行程追蹤", summary: "駕駛資訊、即時位置與行程明細。" },
    en: {
      label: "Tracking",
      summary: "Driver details, live location, and trip information.",
    },
  },
  error: {
    zh: { label: "發生錯誤", summary: "可重試的錯誤狀態與客服入口。" },
    en: {
      label: "Error",
      summary: "Retryable error state and support entry point.",
    },
  },
  manual_review: {
    zh: { label: "人工審查", summary: "資格送人工審查的等待狀態。" },
    en: {
      label: "Manual review",
      summary: "Waiting state while eligibility is under manual review.",
    },
  },
  embed_handoff: {
    zh: {
      label: translate("program.screen.embed_handoff.label", undefined, "zh"),
      summary: translate(
        "program.screen.embed_handoff.summary",
        undefined,
        "zh",
      ),
    },
    en: {
      label: translate("program.screen.embed_handoff.label", undefined, "en"),
      summary: translate(
        "program.screen.embed_handoff.summary",
        undefined,
        "en",
      ),
    },
  },
  embed_reauth: {
    zh: {
      label: translate("program.screen.embed_reauth.label", undefined, "zh"),
      summary: translate(
        "program.screen.embed_reauth.summary",
        undefined,
        "zh",
      ),
    },
    en: {
      label: translate("program.screen.embed_reauth.label", undefined, "en"),
      summary: translate(
        "program.screen.embed_reauth.summary",
        undefined,
        "en",
      ),
    },
  },
  embed_unsupported: {
    zh: {
      label: translate(
        "program.screen.embed_unsupported.label",
        undefined,
        "zh",
      ),
      summary: translate(
        "program.screen.embed_unsupported.summary",
        undefined,
        "zh",
      ),
    },
    en: {
      label: translate(
        "program.screen.embed_unsupported.label",
        undefined,
        "en",
      ),
      summary: translate(
        "program.screen.embed_unsupported.summary",
        undefined,
        "en",
      ),
    },
  },
  embed_consent: {
    zh: {
      label: translate("program.screen.embed_consent.label", undefined, "zh"),
      summary: translate(
        "program.screen.embed_consent.summary",
        undefined,
        "zh",
      ),
    },
    en: {
      label: translate("program.screen.embed_consent.label", undefined, "en"),
      summary: translate(
        "program.screen.embed_consent.summary",
        undefined,
        "en",
      ),
    },
  },
  embed_fallback: {
    zh: {
      label: translate("program.screen.embed_fallback.label", undefined, "zh"),
      summary: translate(
        "program.screen.embed_fallback.summary",
        undefined,
        "zh",
      ),
    },
    en: {
      label: translate("program.screen.embed_fallback.label", undefined, "en"),
      summary: translate(
        "program.screen.embed_fallback.summary",
        undefined,
        "en",
      ),
    },
  },
};

const screenById = Object.fromEntries(
  PARTNER_PROGRAM_SCREENS.map((screen) => [screen.id, screen]),
) as Record<PartnerProgramScreenId, ProgramScreenMeta>;

const screenBySegment = Object.fromEntries(
  PARTNER_PROGRAM_SCREENS.map((screen) => [screen.segment, screen]),
) as Record<string, ProgramScreenMeta>;

export function listProgramScreens(): ReadonlyArray<ProgramScreenMeta> {
  return PARTNER_PROGRAM_SCREENS;
}

const INSURANCE_ONLY_SCREEN_IDS = new Set<PartnerProgramScreenId>([
  "insurance_policy",
  "insurance_replacement_vehicle",
  "insurance_roster",
  "insurance_pending",
  "insurance_missing",
  "insurance_expired",
  "insurance_cancelled",
]);

const CARD_ONLY_SCREEN_IDS = new Set<PartnerProgramScreenId>([
  "embed_handoff",
  "embed_reauth",
  "embed_unsupported",
  "embed_consent",
  "embed_fallback",
]);

export function listProgramScreensForTheme(
  theme: PartnerProgramTheme,
): ReadonlyArray<ProgramScreenMeta> {
  if (theme.kind === "insurance") {
    return PARTNER_PROGRAM_SCREENS.filter(
      (screen) => !CARD_ONLY_SCREEN_IDS.has(screen.id),
    );
  }
  if (theme.kind === "card") {
    return PARTNER_PROGRAM_SCREENS.filter(
      (screen) => !INSURANCE_ONLY_SCREEN_IDS.has(screen.id),
    );
  }
  return PARTNER_PROGRAM_SCREENS.filter(
    (screen) =>
      !INSURANCE_ONLY_SCREEN_IDS.has(screen.id) &&
      !CARD_ONLY_SCREEN_IDS.has(screen.id),
  );
}

export function isPartnerProgramScreenId(
  value: string,
): value is PartnerProgramScreenId {
  return value in screenById;
}

export function getProgramScreenMeta(
  screen: PartnerProgramScreenId,
): ProgramScreenMeta {
  return screenById[screen];
}

function getProgramScreenCopy(
  screen: PartnerProgramScreenId,
  locale: Locale,
): ProgramScreenCopy {
  return PROGRAM_SCREEN_COPY[screen][locale] ?? PROGRAM_SCREEN_COPY[screen].zh;
}

/** Resolve a URL segment (e.g. `manual-review`) to a screen id. */
export function resolveProgramScreenSegment(
  segment: string,
): PartnerProgramScreenId | undefined {
  return screenBySegment[segment]?.id;
}

export function getProgramScreenHref(
  basePath: string,
  screen: PartnerProgramScreenId,
): string {
  return `${basePath}/${getProgramScreenMeta(screen).segment}`;
}

type ScreenTone = "neutral" | "primary" | "accent" | "success" | "danger";
type InsuranceStateId = Extract<
  PartnerProgramScreenId,
  | "insurance_policy"
  | "insurance_replacement_vehicle"
  | "insurance_roster"
  | "insurance_pending"
  | "insurance_missing"
  | "insurance_expired"
  | "insurance_cancelled"
>;

type CardEmbedScreenId = Extract<
  PartnerProgramScreenId,
  | "embed_handoff"
  | "embed_reauth"
  | "embed_unsupported"
  | "embed_consent"
  | "embed_fallback"
>;

function programDemo(theme: PartnerProgramTheme) {
  if (theme.kind === "travel") {
    const remaining = 12;
    const total = 12;
    return {
      remaining,
      total,
      used: total - remaining,
      riderName: "林〇雄",
      pickup: "桃園機場 第一航廈",
      pickupDetail: "入境大廳北側遊覽車上車處",
      dropoff: "台北車站 → 西門商旅",
      dropoffDetail: "第 1 批團體接駁",
      departureTime: "2026-06-28 14:20",
      bookingRef: "LION-TPE-0628",
      driverName: "黃建宏",
      vehicle: "中型巴士 · ARJ-9920",
    };
  }

  const remaining = 9;
  const total = 12;
  return {
    remaining,
    total,
    used: total - remaining,
    riderName: "陳〇明",
    pickup: "台北市信義區松仁路 100 號",
    pickupDetail: "1 樓大廳",
    dropoff: "桃園機場 第二航廈",
    dropoffDetail: "出境大廳 7 號門",
    departureTime: "2026-05-08 17:30",
    bookingRef: `${theme.issuerLabel.toUpperCase()}-2026-0004`,
    driverName: "陳俊宏",
    vehicle: "Toyota Prius α · ARJ-3120",
  };
}

function toneStyle(
  theme: PartnerProgramTheme,
  tone: ScreenTone,
): CSSProperties {
  switch (tone) {
    case "success":
      return {
        color: "#166534",
        background: "#f0fdf4",
        border: "1px solid #bbf7d0",
      };
    case "danger":
      return {
        color: "#b91c1c",
        background: "#fef2f2",
        border: "1px solid #fecaca",
      };
    case "accent":
      return {
        color: theme.primaryDark,
        background: theme.surface.bg,
        border: `1px solid ${theme.surface.border}`,
      };
    case "primary":
      return {
        color: theme.primary,
        background: theme.surface.bg,
        border: `1px solid ${theme.surface.border}`,
      };
    default:
      return {
        color: "#56657f",
        background: "#f1f3f8",
        border: "1px solid #dde3ec",
      };
  }
}

function Band({
  theme,
  title,
  subtitle,
  trailing,
}: {
  theme: PartnerProgramTheme;
  title: string;
  subtitle: string;
  trailing?: string;
}) {
  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${theme.primaryDark} 0%, ${theme.primary} 72%)`,
        color: "#ffffff",
        padding: "22px 24px 24px",
        borderRadius: "18px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          right: "-48px",
          top: "-36px",
          width: "220px",
          height: "220px",
          borderRadius: "999px",
          background: `radial-gradient(circle, ${theme.accent}55 0%, transparent 62%)`,
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "11px",
          letterSpacing: "0.16em",
          opacity: 0.86,
          fontWeight: 700,
          textTransform: "uppercase",
        }}
      >
        <span
          style={{
            width: "22px",
            height: "22px",
            borderRadius: "6px",
            background: theme.accent,
            color: theme.primaryDark,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: "12px",
          }}
        >
          {theme.badgeText}
        </span>
        {theme.issuerName} x DRTS
      </div>
      <div style={{ marginTop: "16px", fontSize: "24px", fontWeight: 800 }}>
        {title}
      </div>
      <div style={{ marginTop: "6px", fontSize: "13px", opacity: 0.84 }}>
        {subtitle}
      </div>
      {trailing ? (
        <div
          style={{
            position: "absolute",
            right: "24px",
            top: "24px",
            padding: "4px 10px",
            borderRadius: "999px",
            border: "1px solid rgba(255, 255, 255, 0.24)",
            background: "rgba(255, 255, 255, 0.12)",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.08em",
          }}
        >
          {trailing}
        </div>
      ) : null}
    </div>
  );
}

function Card({
  title,
  children,
  style,
}: {
  title?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section
      style={{
        borderRadius: "16px",
        border: "1px solid #e5e7eb",
        background: "#ffffff",
        overflow: "hidden",
        ...style,
      }}
    >
      {title ? (
        <header
          style={{
            padding: "12px 16px 10px",
            borderBottom: "1px solid #f1f3f8",
            fontSize: "13px",
            fontWeight: 700,
            color: "#0e1424",
          }}
        >
          {title}
        </header>
      ) : null}
      <div style={{ padding: "16px" }}>{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "12px",
        padding: "8px 0",
        borderBottom: "1px dashed #f1f3f8",
        fontSize: "13px",
      }}
    >
      <span style={{ color: "#56657f" }}>{label}</span>
      <span
        style={{
          color: "#0e1424",
          fontFamily: mono
            ? '"JetBrains Mono", ui-monospace, monospace'
            : "inherit",
          fontWeight: mono ? 600 : 500,
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Button({
  theme,
  label,
  href,
  primary,
}: {
  theme: PartnerProgramTheme;
  label: string;
  href?: string;
  primary?: boolean;
}) {
  const style: CSSProperties = {
    width: "100%",
    minHeight: "46px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "12px",
    border: primary ? `1px solid ${theme.primary}` : "1px solid #d2d8e2",
    background: primary ? theme.primary : "#ffffff",
    color: primary ? "#ffffff" : "#0e1424",
    fontSize: "14px",
    fontWeight: 700,
    textDecoration: "none",
  };
  if (href) {
    return (
      <a href={href} style={style}>
        {label}
      </a>
    );
  }
  return <div style={style}>{label}</div>;
}

function Chip({
  theme,
  tone,
  label,
}: {
  theme: PartnerProgramTheme;
  tone: ScreenTone;
  label: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 9px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 700,
        ...toneStyle(theme, tone),
      }}
    >
      {label}
    </span>
  );
}

function BenefitMeter({
  theme,
  remaining,
  total,
}: {
  theme: PartnerProgramTheme;
  remaining: number;
  total: number;
}) {
  const width = `${(remaining / total) * 100}%`;
  return (
    <div
      style={{
        borderRadius: "12px",
        background: theme.surface.bg,
        padding: "12px",
        border: `1px solid ${theme.surface.border}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <span style={{ fontSize: "11px", color: theme.chrome.pageMuted }}>
          本年度剩餘{theme.benefitNoun}
        </span>
        <span
          style={{
            fontSize: "13px",
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            color: theme.primaryDark,
          }}
        >
          <b style={{ fontSize: "18px" }}>{remaining}</b> / {total}
        </span>
      </div>
      <div
        style={{
          height: "5px",
          marginTop: "8px",
          borderRadius: "999px",
          background: "#ffffff",
          overflow: "hidden",
        }}
      >
        <div style={{ width, height: "100%", background: theme.accent }} />
      </div>
    </div>
  );
}

function CheckMark() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#15803d"
      strokeWidth="3"
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

function InsuranceStateIcon({
  tone,
  glyph,
}: {
  tone: "warn" | "danger";
  glyph: "clock" | "search" | "ban" | "alert" | "roster" | "policy" | "car";
}) {
  const stroke = tone === "warn" ? "#b45309" : "#b42318";
  if (glyph === "clock") {
    return (
      <svg
        width="30"
        height="30"
        viewBox="0 0 24 24"
        fill="none"
        stroke={stroke}
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }
  if (glyph === "search") {
    return (
      <svg
        width="30"
        height="30"
        viewBox="0 0 24 24"
        fill="none"
        stroke={stroke}
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
    );
  }
  if (glyph === "ban") {
    return (
      <svg
        width="30"
        height="30"
        viewBox="0 0 24 24"
        fill="none"
        stroke={stroke}
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M6 6l12 12" />
      </svg>
    );
  }
  if (glyph === "policy") {
    return (
      <svg
        width="30"
        height="30"
        viewBox="0 0 24 24"
        fill="none"
        stroke={stroke}
        strokeWidth="2"
      >
        <path d="M7 4h8l4 4v12H7z" />
        <path d="M15 4v4h4M10 12h6M10 16h4" />
      </svg>
    );
  }
  if (glyph === "car") {
    return (
      <svg
        width="30"
        height="30"
        viewBox="0 0 24 24"
        fill="none"
        stroke={stroke}
        strokeWidth="2"
      >
        <path d="M3 13l2-5h14l2 5M5 13h14v4H5zM7 17v2M17 17v2" />
      </svg>
    );
  }
  if (glyph === "roster") {
    return (
      <svg
        width="30"
        height="30"
        viewBox="0 0 24 24"
        fill="none"
        stroke={stroke}
        strokeWidth="2"
      >
        <circle cx="9" cy="8" r="2.5" />
        <circle cx="16.5" cy="9.5" r="2" />
        <path d="M4.5 18c0-2.5 2.5-4 4.5-4s4.5 1.5 4.5 4M14 18c.2-1.8 1.8-3 3.6-3 1.1 0 2.2.4 2.9 1.2" />
      </svg>
    );
  }
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="2"
    >
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v5M12 17v.01" />
    </svg>
  );
}

function EmbedStateIcon({
  kind,
  theme,
}: {
  kind: "shield" | "clock" | "blocked" | "link";
  theme: PartnerProgramTheme;
}) {
  if (kind === "shield") {
    return (
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke={theme.primary}
        strokeWidth="2"
      >
        <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    );
  }
  if (kind === "clock") {
    return (
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#b45309"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }
  if (kind === "blocked") {
    return (
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#b42318"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M6 6l12 12" />
      </svg>
    );
  }
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#56657f"
      strokeWidth="2"
    >
      <path d="M10 14L21 3M21 3h-6M21 3v6" />
      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
    </svg>
  );
}

function EmbedChrome({
  theme,
  locale,
  host,
  state,
  children,
  footer,
}: {
  theme: PartnerProgramTheme;
  locale: Locale;
  host?: string;
  state: "live" | "warn" | "err" | "neutral";
  children: ReactNode;
  footer?: ReactNode;
}) {
  const dot =
    state === "live"
      ? "#16a34a"
      : state === "warn"
        ? "#d97706"
        : state === "err"
          ? "#dc2626"
          : "#94a3b8";

  return (
    <div
      style={{
        borderRadius: "18px",
        overflow: "hidden",
        border: "1px solid #d8dee8",
        background: "#eef1f7",
      }}
    >
      <div
        style={{
          background: theme.primaryDark,
          color: "#ffffff",
          padding: "10px 14px 11px",
          display: "flex",
          alignItems: "center",
          gap: "9px",
        }}
      >
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "999px",
            background: "rgba(255,255,255,.14)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </div>
        <div style={{ flex: 1, lineHeight: 1.2 }}>
          <div style={{ fontSize: "13.5px", fontWeight: 700 }}>
            {translate("program.embed.chrome.title", undefined, locale)}
          </div>
          <div style={{ fontSize: "10px", opacity: 0.72 }}>
            {translate(
              "program.embed.chrome.subtitle",
              { issuer: theme.issuerName },
              locale,
            )}
          </div>
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "9.5px",
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            opacity: 0.72,
            background: "rgba(255,255,255,.1)",
            padding: "4px 8px",
            borderRadius: "999px",
          }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
          >
            <rect x="4" y="11" width="16" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          {host ?? theme.host}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px 14px",
          background: "#ffffff",
          borderBottom: "1px solid #e8ecf3",
          fontSize: "10.5px",
          color: "#56657f",
        }}
      >
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "999px",
            background: dot,
          }}
        />
        <span
          style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}
        >
          {translate("program.embed.chrome.webview", undefined, locale)}
        </span>
        <span style={{ color: "#9ca3af" }}>
          {translate(
            "program.embed.chrome.embeddedIn",
            { issuer: theme.issuerLabel },
            locale,
          )}
        </span>
      </div>
      <div style={{ display: "grid", gap: "12px", padding: "16px" }}>
        {children}
      </div>
      {footer ? (
        <div
          style={{
            display: "grid",
            gap: "10px",
            padding: "0 16px 16px",
            background: "#eef1f7",
          }}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}

function TokenRow({
  label,
  code,
  value,
  ok,
}: {
  label: string;
  code: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "9px 0",
        borderBottom: "1px dashed #f1f3f8",
      }}
    >
      <div
        style={{
          width: "18px",
          height: "18px",
          borderRadius: "999px",
          background: ok ? "#f0fdf4" : "#fef2f2",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {ok ? (
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#15803d"
            strokeWidth="3"
          >
            <path d="M5 12l5 5L20 7" />
          </svg>
        ) : (
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#dc2626"
            strokeWidth="3"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        )}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "12.5px", color: "#0e1424", fontWeight: 500 }}>
          {label}
        </div>
        <div
          style={{
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: "9.5px",
            color: "#9ca3af",
          }}
        >
          {code}
        </div>
      </div>
      <span
        style={{
          fontSize: "12px",
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          color: ok ? "#0e1424" : "#dc2626",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function renderScreen(
  theme: PartnerProgramTheme,
  screen: PartnerProgramScreenId,
  basePath: string,
  locale: Locale,
): ReactNode {
  const t = (key: string, params?: Record<string, string | number>) =>
    translate(key, params, locale);
  const demo = programDemo(theme);
  const reviewHref = getProgramScreenHref(basePath, "review");
  const successHref = getProgramScreenHref(basePath, "success");
  const trackingHref = getProgramScreenHref(basePath, "tracking");
  const landingHref = getProgramScreenHref(basePath, "landing");
  const eligibilityHref = getProgramScreenHref(basePath, "eligibility");

  if (screen === "landing") {
    if (theme.kind === "travel") {
      const roster = [
        ["林〇雄", "領隊 · guide", "舉牌聯絡"],
        ["陳〇如", "旅客", "輪椅"],
        ["吳〇翰 +2", "家庭 3 人", "兒童座椅 ×1"],
        ["其餘 6 名旅客", "roster", ""],
      ] as const;
      const batches = [
        ["第 1 批 · 入境接機", "06-28 14:20", "中型巴士 ×1 · 12 / 12 席"],
        ["第 2 批 · 飯店接駁", "06-28 16:00", "商務車 ×2 · 8 席"],
      ] as const;

      return (
        <>
          <Band
            theme={theme}
            title="團體席次與分批"
            subtitle="旅行社接送 · roster + batching"
            trailing="GROUP"
          />
          <Card
            title="本團席次"
            style={{
              borderColor: theme.surface.border,
              background: theme.surface.bg,
            }}
          >
            <Row label="團體 / 訂單參照" value={demo.bookingRef} mono />
            <Row label="行程連結" value="LION 日本關西 5 日 → 查看" />
            <Row label="接送段數" value="4 段 · 第 1 段" mono />
            <div style={{ marginTop: "12px" }}>
              <BenefitMeter
                theme={theme}
                remaining={demo.remaining}
                total={demo.total}
              />
            </div>
          </Card>
          <Card title="乘客名單 · roster (12)">
            {roster.map(([name, role, tag], index) => (
              <div
                key={name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 0",
                  borderBottom:
                    index < roster.length - 1
                      ? "1px dashed #f1f3f8"
                      : "1px solid transparent",
                }}
              >
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "9px",
                    background: theme.surface.bg,
                    color: theme.primary,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "12px",
                    fontWeight: 800,
                  }}
                >
                  {name.slice(0, 1)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 700 }}>
                    {name}
                  </div>
                  <div
                    style={{ fontSize: "11px", color: theme.chrome.pageMuted }}
                  >
                    {role}
                  </div>
                </div>
                {tag ? <Chip theme={theme} tone="neutral" label={tag} /> : null}
              </div>
            ))}
          </Card>
          <Card title="分批接送 · pickup batching">
            {batches.map(([title, time, detail], index) => (
              <div
                key={title}
                style={{
                  display: "grid",
                  gap: "4px",
                  padding: "10px 0",
                  borderBottom:
                    index < batches.length - 1
                      ? "1px dashed #f1f3f8"
                      : "1px solid transparent",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <strong style={{ fontSize: "13px", color: "#0e1424" }}>
                    {title}
                  </strong>
                  <Chip theme={theme} tone="accent" label={time} />
                </div>
                <div
                  style={{ fontSize: "12px", color: theme.chrome.pageMuted }}
                >
                  {detail}
                </div>
              </div>
            ))}
          </Card>
          <Button
            theme={theme}
            label="確認席次並前往預約"
            href={reviewHref}
            primary
          />
          <Button theme={theme} label="查看資格確認" href={eligibilityHref} />
        </>
      );
    }

    const services: ReadonlyArray<readonly [string, string, string]> =
      theme.kind === "insurance"
        ? [
            ["理賠代步", "一般 / 商務車型 · 額度內派車", "CLAIM"],
            ["醫院往返", "回診、返家或維修代步", "MEDICAL"],
            ["保障視窗", "依核定期間與車型額度", "WINDOW"],
          ]
        : [
            ["機場接送", "桃園 / 松山 · 商務車", "AIRPORT"],
            ["優先派車", "都會區 · 8 分鐘內到車", "PRIORITY"],
            ["指定時段", "平日 07:00-22:00", "SCHEDULE"],
          ];
    return (
      <>
        <Band
          theme={theme}
          title={theme.programLabel}
          subtitle={theme.landingSubtitle}
          trailing={theme.kind === "insurance" ? "理賠額度" : "EXCLUSIVE"}
        />
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "13px", fontWeight: 700 }}>
                {theme.kind === "insurance"
                  ? "王〇華 · 富邦產險"
                  : `${demo.riderName} · ${theme.programName}`}
              </div>
              <div style={{ fontSize: "11px", color: theme.chrome.pageMuted }}>
                {theme.kind === "insurance"
                  ? "理賠號 CLM-2026-88142"
                  : theme.issuerName}
              </div>
            </div>
            <Chip theme={theme} tone="success" label="eligible" />
          </div>
          <div style={{ marginTop: "12px" }}>
            {theme.kind === "insurance" ? (
              <Card
                style={{
                  borderColor: theme.surface.border,
                  background: theme.surface.bg,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                  }}
                >
                  <span
                    style={{ fontSize: "11px", color: theme.chrome.pageMuted }}
                  >
                    本案{theme.benefitNoun}
                  </span>
                  <span
                    style={{
                      fontSize: "13px",
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      color: theme.primaryDark,
                    }}
                  >
                    <b style={{ fontSize: "18px" }}>NT$ 12,800</b> / 22,400
                  </span>
                </div>
                <div
                  style={{
                    height: "5px",
                    marginTop: "8px",
                    borderRadius: "999px",
                    background: "#ffffff",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: "57%",
                      height: "100%",
                      background: theme.accent,
                    }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: "8px",
                    fontSize: "11px",
                    color: theme.chrome.pageMuted,
                  }}
                >
                  <span>已用 NT$ 9,600 · 8 趟代步</span>
                  <span>代步期間剩 14 天</span>
                </div>
              </Card>
            ) : (
              <BenefitMeter
                theme={theme}
                remaining={demo.remaining}
                total={demo.total}
              />
            )}
          </div>
        </Card>
        <Card title="可使用的服務">
          {services.map(([title, detail, tag], index) => (
            <div
              key={title}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "10px 0",
                borderBottom:
                  index < services.length - 1
                    ? "1px dashed #f1f3f8"
                    : "1px solid transparent",
              }}
            >
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  background: theme.surface.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    width: "14px",
                    height: "14px",
                    borderRadius: "4px",
                    background: theme.primary,
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "13px", fontWeight: 700 }}>{title}</div>
                <div
                  style={{ fontSize: "11px", color: theme.chrome.pageMuted }}
                >
                  {detail}
                </div>
              </div>
              <Chip theme={theme} tone="primary" label={tag} />
            </div>
          ))}
        </Card>
        <Button
          theme={theme}
          label={theme.ctaLabel}
          href={reviewHref}
          primary
        />
        <Button theme={theme} label="查看資格確認" href={eligibilityHref} />
      </>
    );
  }

  if (screen === "eligibility") {
    if (theme.kind === "insurance") {
      const checks = [
        {
          title: "保單有效",
          code: "insurance_policy",
          detail: "POL-558-22019 · 富邦產險",
          note: "保單於保障期間內 · 含代步附約",
        },
        {
          title: "代步車輛權益",
          code: "insurance_replacement_vehicle",
          detail: "一般 / 商務車型 · 每日上限 NT$ 1,600",
          note: "代步期間 2026-06-01 ~ 06-30（剩 14 天）",
        },
        {
          title: "乘客名單",
          code: "insurance_roster",
          detail: "理賠申請人 王〇華 +1 名陪同",
          note: "名單須與理賠案件一致",
        },
      ] as const;
      return (
        <>
          <Band
            theme={theme}
            title="資格驗證"
            subtitle="保險理賠代步 · 依理賠案件核定"
            trailing="理賠額度"
          />
          <Card
            style={{
              borderColor: theme.surface.border,
              background: theme.surface.bg,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
              }}
            >
              <span style={{ fontSize: "11px", color: theme.chrome.pageMuted }}>
                本案理賠額度 · claim allowance
              </span>
              <span
                style={{
                  fontSize: "13px",
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                }}
              >
                <b style={{ fontSize: "19px", color: theme.primary }}>
                  NT$ 12,800
                </b>{" "}
                / 22,400
              </span>
            </div>
            <div
              style={{
                height: "5px",
                marginTop: "8px",
                borderRadius: "999px",
                background: "#dde3ec",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: "57%",
                  height: "100%",
                  background: theme.accent,
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "8px",
                fontSize: "11px",
                color: theme.chrome.pageMuted,
              }}
            >
              <span>已用 NT$ 9,600 · 8 趟代步</span>
              <span>代步期間剩 14 天</span>
            </div>
          </Card>
          <Card title="核定項目 · eligibility checks">
            {checks.map((item, index) => (
              <div
                key={item.code}
                style={{
                  display: "flex",
                  gap: "12px",
                  padding: "11px 0",
                  borderBottom:
                    index < checks.length - 1
                      ? "1px dashed #f1f3f8"
                      : "1px solid transparent",
                }}
              >
                <div
                  style={{
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "#f0fdf4",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: "1px",
                  }}
                >
                  <CheckMark />
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "7px",
                    }}
                  >
                    <span style={{ fontSize: "13.5px", fontWeight: 700 }}>
                      {item.title}
                    </span>
                    <span
                      style={{
                        fontSize: "10px",
                        color: "#9ca3af",
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      }}
                    >
                      {item.code}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#0e1424",
                      marginTop: "2px",
                    }}
                  >
                    {item.detail}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: theme.chrome.pageMuted,
                      marginTop: "2px",
                    }}
                  >
                    {item.note}
                  </div>
                </div>
              </div>
            ))}
          </Card>
          <Card
            style={{
              borderColor: "#bbf7d0",
              background: "#f0fdf4",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <CheckMark />
              <span
                style={{
                  fontSize: "12.5px",
                  color: "#15803d",
                  fontWeight: 700,
                }}
              >
                三項核定通過 · eligibility_verified
              </span>
            </div>
          </Card>
          <Button
            theme={theme}
            label="確認並建立代步行程"
            href={getProgramScreenHref(basePath, "review")}
            primary
          />
          <Button theme={theme} label="返回入口" href={landingHref} />
        </>
      );
    }

    const consents = [
      `使用 ${theme.issuerName} 身份識別建立 DRTS 帳號`,
      "與 DRTS 共享行程必要資訊",
      `同意《${theme.issuerName} x DRTS ${theme.programName}服務條款 v3》`,
    ];
    return (
      <>
        <Band theme={theme} title="資格確認" subtitle="首次使用 · 一次性確認" />
        <Card title="您的權益">
          <Row label="方案" value={theme.programLabel} />
          <Row label="提供單位" value={theme.issuerName} />
          <Row
            label={`本年度${theme.benefitNoun}`}
            value={`${demo.total} 趟`}
            mono
          />
          <Row label="服務範圍" value="台北 · 桃園 · 新竹" />
        </Card>
        <Card title="授權同意">
          {consents.map((item, index) => (
            <div
              key={item}
              style={{
                display: "flex",
                gap: "12px",
                padding: "10px 0",
                borderBottom:
                  index < consents.length - 1
                    ? "1px dashed #f1f3f8"
                    : "1px solid transparent",
              }}
            >
              <div
                style={{
                  width: "18px",
                  height: "18px",
                  marginTop: "2px",
                  borderRadius: "5px",
                  background: theme.primary,
                  flexShrink: 0,
                }}
              />
              <div style={{ fontSize: "12px", fontWeight: 700 }}>{item}</div>
            </div>
          ))}
        </Card>
        <Button
          theme={theme}
          label="確認並繼續"
          href={getProgramScreenHref(basePath, "review")}
          primary
        />
        <Button theme={theme} label="返回入口" href={landingHref} />
      </>
    );
  }

  if (CARD_ONLY_SCREEN_IDS.has(screen) && theme.kind === "card") {
    const embedScreen = screen as CardEmbedScreenId;
    const officialSite = `https://${theme.host}`;

    if (embedScreen === "embed_handoff") {
      return (
        <EmbedChrome
          theme={theme}
          locale={locale}
          state="live"
          footer={
            <Button
              theme={theme}
              label={t("program.embed.handoff.cta")}
              href={reviewHref}
              primary
            />
          }
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "10px",
              padding: "10px 0 2px",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "999px",
                background: `${theme.primary}14`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <EmbedStateIcon kind="shield" theme={theme} />
            </div>
            <div style={{ fontSize: "16px", fontWeight: 700 }}>
              {t("program.embed.handoff.title")}
            </div>
            <Chip
              theme={theme}
              tone="success"
              label={t("program.embed.handoff.badge")}
            />
          </div>
          <Card title={t("program.embed.handoff.cardTitle")}>
            <TokenRow
              label={t("program.embed.handoff.signature")}
              code="issuer_signature"
              value="valid"
              ok
            />
            <TokenRow
              label={t("program.embed.handoff.identity")}
              code="cardholder_resolved"
              value={demo.riderName}
              ok
            />
            <TokenRow
              label={t("program.embed.handoff.token")}
              code="ref_token"
              value="tok_••••_9F2"
              ok
            />
            <div style={{ marginTop: "4px" }}>
              <Row
                label={t("program.embed.handoff.benefit")}
                value={t("program.embed.handoff.benefitValue")}
              />
            </div>
          </Card>
          <Card
            style={{
              borderColor: theme.surface.border,
              background: theme.surface.bg,
            }}
          >
            <div
              style={{ fontSize: "11.5px", color: "#0e1424", lineHeight: 1.5 }}
            >
              {t("program.embed.handoff.note")}
            </div>
          </Card>
        </EmbedChrome>
      );
    }

    if (embedScreen === "embed_reauth") {
      return (
        <EmbedChrome
          theme={theme}
          locale={locale}
          state="warn"
          footer={
            <>
              <Button
                theme={theme}
                label={t("program.embed.reauth.primary")}
                href={landingHref}
                primary
              />
              <Button
                theme={theme}
                label={t("program.embed.reauth.secondary")}
                href={landingHref}
              />
            </>
          }
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "10px",
              padding: "10px 0 2px",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "999px",
                background: "#fffbeb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <EmbedStateIcon kind="clock" theme={theme} />
            </div>
            <div style={{ fontSize: "16px", fontWeight: 700 }}>
              {t("program.embed.reauth.title")}
            </div>
            <Chip
              theme={theme}
              tone="accent"
              label={t("program.embed.reauth.badge")}
            />
          </div>
          <Card title={t("program.embed.reauth.cardTitle")}>
            <TokenRow
              label={t("program.embed.reauth.session")}
              code="issuer_session"
              value="expired"
              ok={false}
            />
            <TokenRow
              label={t("program.embed.reauth.token")}
              code="ref_token"
              value="stale"
              ok={false}
            />
          </Card>
          <Card style={{ borderColor: theme.surface.border }}>
            <div
              style={{ fontSize: "12.5px", color: "#0e1424", lineHeight: 1.6 }}
            >
              {t("program.embed.reauth.message", { issuer: theme.issuerName })}
            </div>
          </Card>
        </EmbedChrome>
      );
    }

    if (embedScreen === "embed_unsupported") {
      return (
        <EmbedChrome
          theme={theme}
          locale={locale}
          host="unknown-host.example"
          state="err"
          footer={
            <Button
              theme={theme}
              label={t("program.embed.unsupported.primary")}
              href={officialSite}
              primary
            />
          }
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "10px",
              padding: "10px 0 2px",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "999px",
                background: "#fee4e2",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <EmbedStateIcon kind="blocked" theme={theme} />
            </div>
            <div style={{ fontSize: "16px", fontWeight: 700 }}>
              {t("program.embed.unsupported.title")}
            </div>
            <Chip
              theme={theme}
              tone="danger"
              label={t("program.embed.unsupported.badge")}
            />
          </div>
          <Card title={t("program.embed.unsupported.reasonTitle")}>
            <div
              style={{ fontSize: "13px", color: "#0e1424", lineHeight: 1.6 }}
            >
              {t("program.embed.unsupported.reason")}
            </div>
          </Card>
          <Card title={t("program.embed.unsupported.detectTitle")}>
            <TokenRow
              label={t("program.embed.unsupported.host")}
              code="origin_host"
              value="未授權"
              ok={false}
            />
            <TokenRow
              label={t("program.embed.unsupported.signature")}
              code="issuer_signature"
              value="缺少"
              ok={false}
            />
          </Card>
          <div
            style={{ fontSize: "11.5px", color: "#56657f", lineHeight: 1.55 }}
          >
            {t("program.embed.unsupported.note", { issuer: theme.issuerName })}
          </div>
        </EmbedChrome>
      );
    }

    if (embedScreen === "embed_consent") {
      const scopes = [
        {
          title: t("program.embed.consent.scope.identity.title"),
          body: t("program.embed.consent.scope.identity.body"),
          code: "identity.read",
        },
        {
          title: t("program.embed.consent.scope.trip.title"),
          body: t("program.embed.consent.scope.trip.body"),
          code: "trip.share",
        },
        {
          title: t("program.embed.consent.scope.billing.title"),
          body: t("program.embed.consent.scope.billing.body"),
          code: "billing.link",
        },
      ] as const;

      return (
        <EmbedChrome
          theme={theme}
          locale={locale}
          state="live"
          footer={
            <>
              <Button
                theme={theme}
                label={t("program.embed.consent.primary")}
                href={reviewHref}
                primary
              />
              <Button
                theme={theme}
                label={t("program.embed.consent.secondary")}
                href={landingHref}
              />
            </>
          }
        >
          <div style={{ padding: "6px 0 2px" }}>
            <div style={{ fontSize: "17px", fontWeight: 700 }}>
              {t("program.embed.consent.title")}
            </div>
            <div
              style={{ fontSize: "12.5px", color: "#56657f", marginTop: "4px" }}
            >
              {t("program.embed.consent.subtitle")}
            </div>
          </div>
          <Card>
            {scopes.map((scope, index) => (
              <div
                key={scope.code}
                style={{
                  display: "flex",
                  gap: "12px",
                  padding: "11px 0",
                  borderBottom:
                    index < scopes.length - 1
                      ? "1px dashed #f1f3f8"
                      : "1px solid transparent",
                }}
              >
                <div
                  style={{
                    width: "20px",
                    height: "20px",
                    borderRadius: "5px",
                    background: theme.primary,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: "1px",
                  }}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="3"
                  >
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "7px",
                    }}
                  >
                    <span style={{ fontSize: "13px", fontWeight: 600 }}>
                      {scope.title}
                    </span>
                    <span
                      style={{
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                        fontSize: "9.5px",
                        color: "#9ca3af",
                      }}
                    >
                      {scope.code}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "11.5px",
                      color: "#56657f",
                      marginTop: "2px",
                    }}
                  >
                    {scope.body}
                  </div>
                </div>
              </div>
            ))}
          </Card>
          <Card
            style={{
              borderColor: theme.surface.border,
              background: theme.surface.bg,
            }}
          >
            <div
              style={{ fontSize: "11.5px", color: "#0e1424", lineHeight: 1.5 }}
            >
              {t("program.embed.consent.note", { issuer: theme.issuerName })}
            </div>
          </Card>
        </EmbedChrome>
      );
    }

    return (
      <EmbedChrome
        theme={theme}
        locale={locale}
        state="neutral"
        footer={
          <>
            <Button
              theme={theme}
              label={t("program.embed.fallback.primary")}
              href={officialSite}
              primary
            />
            <Button
              theme={theme}
              label={t("program.embed.fallback.secondary")}
              href={landingHref}
            />
          </>
        }
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px",
            padding: "10px 0 2px",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "999px",
              background: "#f1f3f8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <EmbedStateIcon kind="link" theme={theme} />
          </div>
          <div style={{ fontSize: "16px", fontWeight: 700 }}>
            {t("program.embed.fallback.title")}
          </div>
          <Chip
            theme={theme}
            tone="neutral"
            label={t("program.embed.fallback.badge")}
          />
        </div>
        <Card title={t("program.embed.fallback.nextTitle")}>
          <div style={{ fontSize: "13px", color: "#0e1424", lineHeight: 1.6 }}>
            {t("program.embed.fallback.nextBody")}
          </div>
        </Card>
        <Card>
          <Row
            label={t("program.embed.fallback.site")}
            value={theme.host}
            mono
          />
          <Row
            label={t("program.embed.fallback.method")}
            value={t("program.embed.fallback.methodValue")}
          />
          <Row
            label={t("program.embed.fallback.security")}
            value={t("program.embed.fallback.securityValue")}
          />
        </Card>
      </EmbedChrome>
    );
  }

  if (INSURANCE_ONLY_SCREEN_IDS.has(screen)) {
    const insuranceState = {
      insurance_policy: {
        title: "保單資格不符",
        subtitle: "保單或附約未通過驗證",
        badge: "insurance_policy · 保單封鎖",
        tone: "danger" as const,
        glyph: "policy" as const,
        reason:
          "保單 POL-558-22019 未包含有效的代步附約，或保障期間已不涵蓋本次理賠代步需求。",
        rows: [
          ["保單號", "POL-558-22019"],
          ["保單狀態", "附約不符 / 需人工覆核"],
          ["保障期間", "2026-01-01 ~ 2026-12-31"],
          ["下一步", "請聯絡富邦產險承辦人"],
        ],
        primaryLabel: "聯絡富邦產險",
        primaryHref: landingHref,
        secondaryLabel: "返回入口",
        secondaryHref: landingHref,
      },
      insurance_replacement_vehicle: {
        title: "代步車權益未核定",
        subtitle: "車型或代步期間尚未核准",
        badge: "insurance_replacement_vehicle · 權益未核定",
        tone: "warn" as const,
        glyph: "car" as const,
        reason:
          "理賠案件尚未核定可使用的代步車型或額度上限。需等待承辦人確認一般 / 商務車型與可用天數。",
        rows: [
          ["理賠號", "CLM-2026-88142"],
          ["目前車型", "待核定"],
          ["代步期間", "待富邦產險確認"],
          ["建議", "查看理賠進度"],
        ],
        primaryLabel: "查看理賠進度",
        primaryHref: eligibilityHref,
        secondaryLabel: "聯絡承辦人",
        secondaryHref: landingHref,
      },
      insurance_roster: {
        title: "乘客名單不一致",
        subtitle: "申請人與搭乘名單未對齊",
        badge: "insurance_roster · 名單待修正",
        tone: "danger" as const,
        glyph: "roster" as const,
        reason:
          "目前輸入的乘客資料與理賠案件名單不一致。代步服務僅能提供給已核定的申請人與陪同名單。",
        rows: [
          ["理賠申請人", "王〇華"],
          ["目前搭乘名單", "2 人 · 含未授權乘客"],
          ["名單狀態", "需重新比對"],
          ["建議", "請修正乘客名單"],
        ],
        primaryLabel: "重新輸入名單",
        primaryHref: eligibilityHref,
        secondaryLabel: "聯絡承辦人",
        secondaryHref: landingHref,
      },
      insurance_pending: {
        title: "理賠審核中",
        subtitle: "代步權益尚未核定",
        badge: "insurance_pending · 審核中",
        tone: "warn" as const,
        glyph: "clock" as const,
        reason:
          "理賠案件 CLM-2026-88142 仍在富邦產險審核流程中，代步權益需理賠核定後才能啟用。",
        rows: [
          ["理賠號", "CLM-2026-88142"],
          ["目前狀態", "理賠審核中"],
          ["預計核定", "1-2 個工作日"],
          ["通知方式", "簡訊 + Email"],
        ],
        primaryLabel: "查看理賠進度",
        primaryHref: eligibilityHref,
        secondaryLabel: "聯絡承辦人",
        secondaryHref: landingHref,
      },
      insurance_missing: {
        title: "查無理賠案件",
        subtitle: "保單或理賠編號有誤",
        badge: "insurance_missing · 查無資料",
        tone: "danger" as const,
        glyph: "search" as const,
        reason:
          "依您提供的保單號 / 理賠參照查無對應案件。請確認號碼是否正確，或聯絡富邦產險確認案件已建立。",
        rows: [
          ["輸入保單號", "POL-558-2201X"],
          ["輸入理賠號", "CLM-2026-8814X"],
          ["比對結果", "查無對應案件"],
          ["建議", "重新輸入或洽承辦"],
        ],
        primaryLabel: "重新輸入",
        primaryHref: eligibilityHref,
        secondaryLabel: "聯絡富邦產險",
        secondaryHref: landingHref,
      },
      insurance_expired: {
        title: "代步期間已結束",
        subtitle: "保障窗口已逾期",
        badge: "insurance_expired · 已逾期",
        tone: "danger" as const,
        glyph: "alert" as const,
        reason:
          "本理賠案件的代步期間（2026-05-01 ~ 05-31）已結束，無法再建立代步行程。如有特殊情形請洽承辦人申請延長。",
        rows: [
          ["理賠號", "CLM-2026-77013"],
          ["代步期間", "2026-05-01 ~ 2026-05-31"],
          ["到期日", "已逾期 10 天"],
          ["剩餘額度", "已關閉"],
        ],
        primaryLabel: "申請延長代步",
        primaryHref: landingHref,
        secondaryLabel: "返回入口",
        secondaryHref: landingHref,
      },
      insurance_cancelled: {
        title: "理賠案件已結案",
        subtitle: "案件取消 / 已結清",
        badge: "insurance_cancelled · 已結案",
        tone: "danger" as const,
        glyph: "ban" as const,
        reason:
          "理賠案件 CLM-2026-66200 已結案或取消，代步權益隨之關閉。若為誤判，請聯絡富邦產險重啟案件。",
        rows: [
          ["理賠號", "CLM-2026-66200"],
          ["案件狀態", "已結案 / 取消"],
          ["關閉日", "2026-06-02"],
          ["代步權益", "已停用"],
        ],
        primaryLabel: "聯絡富邦產險",
        primaryHref: landingHref,
        secondaryLabel: "返回入口",
        secondaryHref: landingHref,
      },
    } as const satisfies Record<
      InsuranceStateId,
      {
        title: string;
        subtitle: string;
        badge: string;
        tone: "warn" | "danger";
        glyph:
          | "clock"
          | "search"
          | "ban"
          | "alert"
          | "roster"
          | "policy"
          | "car";
        reason: string;
        rows: ReadonlyArray<readonly [string, string]>;
        primaryLabel: string;
        primaryHref: string;
        secondaryLabel: string;
        secondaryHref: string;
      }
    >;
    const state = insuranceState[screen as InsuranceStateId];
    const tone = state.tone === "warn" ? "accent" : "danger";
    return (
      <>
        <Band theme={theme} title={state.title} subtitle={state.subtitle} />
        <Card>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "10px",
              padding: "8px 0 2px",
            }}
          >
            <div
              style={{
                width: "60px",
                height: "60px",
                borderRadius: "999px",
                background: state.tone === "warn" ? "#fffbeb" : "#fee4e2",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <InsuranceStateIcon tone={state.tone} glyph={state.glyph} />
            </div>
            <Chip theme={theme} tone={tone} label={state.badge} />
          </div>
        </Card>
        <Card title="原因">
          <div style={{ fontSize: "13px", color: "#0e1424", lineHeight: 1.65 }}>
            {state.reason}
          </div>
        </Card>
        <Card title="案件資訊">
          {state.rows.map(([label, value]) => (
            <Row
              key={label}
              label={label}
              value={value}
              mono={label.includes("號")}
            />
          ))}
        </Card>
        <div
          style={{
            fontSize: "11.5px",
            color: theme.chrome.pageMuted,
            lineHeight: 1.55,
          }}
        >
          此狀態由理賠系統判定，接送無法在此狀態下派車。本頁不會擷取任何卡片或付款資料。
        </div>
        <Button
          theme={theme}
          label={state.primaryLabel}
          href={state.primaryHref}
          primary
        />
        <Button
          theme={theme}
          label={state.secondaryLabel}
          href={state.secondaryHref}
        />
      </>
    );
  }

  if (screen === "review") {
    if (theme.kind === "travel") {
      return (
        <>
          <Band
            theme={theme}
            title="下單前確認"
            subtitle="團體接送 · 第 1 段"
          />
          <Card>
            <Row label="上車" value={demo.pickup} />
            <Row label="" value={demo.pickupDetail} />
            <Row label="下車" value={demo.dropoff} />
            <Row label="" value={demo.dropoffDetail} />
          </Card>
          <Card title="團體與 roster">
            <Row label="團體 / 訂單參照" value={demo.bookingRef} mono />
            <Row label="團體席次" value="12 / 12 席" mono />
            <Row label="行李" value="18 件" />
            <Row label="集合點" value="入境大廳北側遊覽車上車處" />
            <Row label="時間" value={demo.departureTime} mono />
          </Card>
          <Card
            title="車輛配置與費用"
            style={{
              borderColor: theme.surface.border,
              background: theme.surface.bg,
            }}
          >
            <Row label="車輛配置" value="中型巴士 ×1" />
            <Row label="接送段數" value="第 1 / 4 段" mono />
            <Row label="費用" value="已含團費" />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginTop: "10px",
                borderRadius: "10px",
                background: "#ffffff",
                padding: "10px",
              }}
            >
              <Chip theme={theme} tone="accent" label="roster verified" />
              <span style={{ fontSize: "11px", color: theme.chrome.pageMuted }}>
                roster 與團體席次已對齊，可直接送出派車。
              </span>
            </div>
          </Card>
          <Button theme={theme} label="確認預約" href={successHref} primary />
          <Button theme={theme} label="返回修改" href={landingHref} />
        </>
      );
    }

    return (
      <>
        <Band theme={theme} title="下單前確認" subtitle={theme.programName} />
        <Card>
          <Row label="上車" value={demo.pickup} />
          <Row label="" value={demo.pickupDetail} />
          <Row label="下車" value={demo.dropoff} />
          <Row label="" value={demo.dropoffDetail} />
        </Card>
        <Card title="行程資訊">
          <Row label="出發時間" value={demo.departureTime} mono />
          <Row label="人數" value="1 位" />
          <Row label="行李" value="2 件" />
          <Row label="車型" value="商務車 (升級)" />
        </Card>
        <Card
          title={`費用與${theme.benefitNoun}`}
          style={{
            borderColor: theme.surface.border,
            background: theme.surface.bg,
          }}
        >
          <Row label="基本費用" value="NT$ 1,580" mono />
          <Row label={`${theme.programName}折抵`} value="-NT$ 1,580" mono />
          <Row label="您將支付" value="免費" />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginTop: "10px",
              borderRadius: "10px",
              background: "#ffffff",
              padding: "10px",
            }}
          >
            <Chip
              theme={theme}
              tone="accent"
              label={`${demo.remaining} / ${demo.total} 趟`}
            />
            <span style={{ fontSize: "11px", color: theme.chrome.pageMuted }}>
              本年度剩餘{theme.benefitNoun}
            </span>
          </div>
        </Card>
        <Button theme={theme} label="確認預約" href={successHref} primary />
        <Button theme={theme} label="返回修改" href={landingHref} />
      </>
    );
  }

  if (screen === "success") {
    const steps = [
      "我們已將您的需求送至派車中心。",
      "媒合駕駛後將以簡訊與 App 通知您。",
      "可隨時於「行程追蹤」查看即時狀態。",
    ];
    return (
      <>
        <Band theme={theme} title="預約成功" subtitle="我們已收到您的需求" />
        <Card>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              paddingBottom: "12px",
              borderBottom: "1px dashed #f1f3f8",
            }}
          >
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "999px",
                background: theme.surface.bg,
                color: theme.primary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "20px",
                fontWeight: 800,
              }}
            >
              ✓
            </div>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 800 }}>
                預約已成立
              </div>
              <div style={{ fontSize: "11px", color: theme.chrome.pageMuted }}>
                {theme.programName}
              </div>
            </div>
          </div>
          <div style={{ paddingTop: "12px" }}>
            <Row label="訂單編號" value={demo.bookingRef} mono />
            <Row label="預估出發" value={demo.departureTime} mono />
            <Row label="您將支付" value="免費" />
          </div>
        </Card>
        <Card title="接下來">
          {steps.map((step, index) => (
            <div
              key={step}
              style={{
                display: "flex",
                gap: "12px",
                padding: "10px 0",
                borderBottom:
                  index < steps.length - 1
                    ? "1px dashed #f1f3f8"
                    : "1px solid transparent",
              }}
            >
              <div
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "999px",
                  background: theme.primary,
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "11px",
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {index + 1}
              </div>
              <div
                style={{ fontSize: "12px", lineHeight: 1.6, color: "#0e1424" }}
              >
                {step}
              </div>
            </div>
          ))}
        </Card>
        <Button
          theme={theme}
          label="查看行程追蹤"
          href={trackingHref}
          primary
        />
        <Button theme={theme} label="返回入口" href={landingHref} />
      </>
    );
  }

  if (screen === "tracking") {
    return (
      <>
        <Band theme={theme} title="行程追蹤" subtitle="駕駛將於 8 分鐘後抵達" />
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "52px",
                height: "52px",
                borderRadius: "999px",
                background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
                fontWeight: 800,
              }}
            >
              陳
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "14px", fontWeight: 800 }}>
                {demo.driverName}
              </div>
              <div style={{ fontSize: "11px", color: theme.chrome.pageMuted }}>
                1,243 趟 · 4.86 ★
              </div>
              <div
                style={{
                  marginTop: "2px",
                  fontSize: "11px",
                  color: theme.primary,
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                }}
              >
                {demo.vehicle}
              </div>
            </div>
            <Chip theme={theme} tone="success" label="已派車" />
          </div>
        </Card>
        <Card style={{ padding: 0 }}>
          <div
            style={{
              height: "160px",
              background: theme.surface.bg,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 360 160"
              style={{ position: "absolute", inset: 0 }}
            >
              <path
                d="M40,130 L100,96 L180,84 L260,64 L320,36"
                stroke={theme.primary}
                strokeWidth="3"
                fill="none"
              />
              <circle cx="40" cy="130" r="6" fill={theme.primary} />
              <circle
                cx="320"
                cy="36"
                r="6"
                fill={theme.accent}
                stroke="#ffffff"
                strokeWidth="2"
              />
            </svg>
          </div>
          <div style={{ padding: "16px" }}>
            <Row label="預計抵達" value="8 min" mono />
            <Row label="距離" value="2.4 km" mono />
          </div>
        </Card>
        <Card title="行程資訊">
          <Row label="訂單編號" value={demo.bookingRef} mono />
          <Row label="方案" value={theme.programLabel} />
          <Row label="您將支付" value="免費" />
        </Card>
        <Button
          theme={theme}
          label="聯絡客服"
          href={getProgramScreenHref(basePath, "error")}
        />
      </>
    );
  }

  if (screen === "error") {
    return (
      <>
        <Band theme={theme} title="發生錯誤" subtitle="請稍後再試或聯絡客服" />
        <Card>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <Chip theme={theme} tone="danger" label="SERVICE_ERROR" />
            <div
              style={{ fontSize: "13px", lineHeight: 1.7, color: "#0e1424" }}
            >
              系統暫時無法處理您的請求。您的{theme.benefitNoun}
              並未被扣除，請稍後再試。
            </div>
          </div>
        </Card>
        <Card
          title={theme.hotline.label}
          style={{
            borderColor: theme.surface.border,
            background: theme.surface.bg,
          }}
        >
          <div
            style={{
              fontSize: "20px",
              fontWeight: 800,
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              color: theme.primaryDark,
            }}
          >
            {theme.hotline.phone}
          </div>
          <div
            style={{
              marginTop: "6px",
              fontSize: "11px",
              color: theme.chrome.pageMuted,
            }}
          >
            {theme.hotline.note}
          </div>
        </Card>
        <Button theme={theme} label="重新嘗試" href={landingHref} primary />
      </>
    );
  }

  // manual_review
  const guidance = [
    "您的資格已送交人工審查，暫時無法立即派車。",
    `審查結果將由 ${theme.issuerName} 與 DRTS 平台客服通知您。`,
    "此為暫停狀態，並非預約失敗。",
  ];
  return (
    <>
      <Band theme={theme} title="人工審查中" subtitle="您的申請正在審查" />
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Chip theme={theme} tone="primary" label="manual_review" />
          <span style={{ fontSize: "13px", color: theme.chrome.pageMuted }}>
            預計 1 個工作天內回覆
          </span>
        </div>
      </Card>
      <Card title="處理方式">
        {guidance.map((item, index) => (
          <div
            key={item}
            style={{
              display: "flex",
              gap: "12px",
              padding: "10px 0",
              borderBottom:
                index < guidance.length - 1
                  ? "1px dashed #f1f3f8"
                  : "1px solid transparent",
            }}
          >
            <div
              style={{
                width: "8px",
                height: "8px",
                marginTop: "6px",
                borderRadius: "999px",
                background: theme.primary,
                flexShrink: 0,
              }}
            />
            <div
              style={{ fontSize: "13px", lineHeight: 1.65, color: "#0e1424" }}
            >
              {item}
            </div>
          </div>
        ))}
      </Card>
      <Button
        theme={theme}
        label="聯絡客服"
        href={getProgramScreenHref(basePath, "error")}
      />
      <Button theme={theme} label="返回入口" href={landingHref} />
    </>
  );
}

/**
 * Themed shared partner-booking flow. Applies the program chrome and renders
 * the active screen plus a screen-switch nav, all driven by the program theme.
 */
export function ProgramBookingFlow({
  theme,
  screen,
  basePath,
  locale,
}: {
  theme: PartnerProgramTheme;
  screen: PartnerProgramScreenId;
  basePath: string;
  locale: Locale;
}) {
  const visibleScreens = listProgramScreensForTheme(theme);
  const activeCopy = getProgramScreenCopy(screen, locale);

  return (
    <div
      style={{
        ...getProgramChromeVars(theme),
        display: "grid",
        gap: "18px",
        background: theme.chrome.pageBackground,
        color: theme.chrome.pageForeground,
        borderRadius: "20px",
        padding: "20px",
        border: `1px solid ${theme.chrome.panelBorder}`,
      }}
      data-program-kind={theme.kind}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontSize: "12px",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: theme.primary,
            fontWeight: 800,
          }}
        >
          {theme.programLabel}
        </div>
        <Chip theme={theme} tone="primary" label={`program: ${theme.kind}`} />
      </div>

      <nav style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {visibleScreens.map((meta) => {
          const isActive = meta.id === screen;
          const copy = getProgramScreenCopy(meta.id, locale);
          return (
            <a
              key={meta.id}
              href={getProgramScreenHref(basePath, meta.id)}
              style={{
                textDecoration: "none",
                display: "grid",
                gap: "2px",
                minWidth: "104px",
                padding: "8px 12px",
                borderRadius: "12px",
                border: isActive
                  ? `1px solid ${theme.primary}`
                  : "1px solid rgba(15, 23, 42, 0.10)",
                background: isActive ? theme.surface.bg : "#ffffff",
                color: "#0e1424",
              }}
            >
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: isActive ? theme.primary : "#64748b",
                }}
              >
                {meta.eyebrow}
              </span>
              <span style={{ fontSize: "13px", fontWeight: 800 }}>
                {copy.label}
              </span>
            </a>
          );
        })}
      </nav>

      <div
        style={{
          fontSize: "13px",
          lineHeight: 1.6,
          color: theme.chrome.pageMuted,
        }}
      >
        {activeCopy.summary}
      </div>

      <div
        style={{
          display: "grid",
          gap: "12px",
          maxWidth: "420px",
          width: "100%",
        }}
      >
        {renderScreen(theme, screen, basePath, locale)}
      </div>
    </div>
  );
}
