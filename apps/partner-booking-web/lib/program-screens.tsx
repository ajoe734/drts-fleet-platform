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
export type PartnerProgramSurfaceKind = "site" | "embed";

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
  surface: PartnerProgramSurfaceKind = "site",
): ReadonlyArray<ProgramScreenMeta> {
  if (surface === "embed") {
    if (theme.kind !== "card") {
      return [];
    }
    return PARTNER_PROGRAM_SCREENS.filter((screen) =>
      CARD_ONLY_SCREEN_IDS.has(screen.id),
    );
  }

  if (theme.kind === "insurance") {
    return PARTNER_PROGRAM_SCREENS.filter(
      (screen) => !CARD_ONLY_SCREEN_IDS.has(screen.id),
    );
  }
  if (theme.kind === "card") {
    return PARTNER_PROGRAM_SCREENS.filter(
      (screen) =>
        !INSURANCE_ONLY_SCREEN_IDS.has(screen.id) &&
        !CARD_ONLY_SCREEN_IDS.has(screen.id),
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

function getLocalizedProgramTheme(
  theme: PartnerProgramTheme,
  locale: Locale,
): PartnerProgramTheme {
  if (locale === "zh") {
    return theme;
  }

  const copy: Record<
    PartnerProgramTheme["kind"],
    Pick<
      PartnerProgramTheme,
      | "issuerName"
      | "programLabel"
      | "programName"
      | "landingSubtitle"
      | "benefitNoun"
      | "ctaLabel"
    >
  > = {
    card: {
      issuerName: theme.issuerLabel + " Bank",
      programLabel: "Credit-card airport transfer",
      programName: "Cardholder airport concierge",
      landingSubtitle: "Exclusive airport transfer benefit",
      benefitNoun: "included rides",
      ctaLabel: "Book airport transfer",
    },
    insurance: {
      issuerName: "Fubon Insurance",
      programLabel: "Insurance replacement mobility",
      programName: "Claim replacement ride",
      landingSubtitle: "Replacement mobility during claim handling",
      benefitNoun: "claim allowance",
      ctaLabel: "Request replacement ride",
    },
    travel: {
      issuerName: "Lion Travel",
      programLabel: "Travel agency group transfer",
      programName: "Group transfer",
      landingSubtitle: "Airport and hotel transfer for tour groups",
      benefitNoun: "group seats",
      ctaLabel: "Confirm seats and book",
    },
  };

  return {
    ...theme,
    ...copy[theme.kind],
    hotline: {
      ...theme.hotline,
      label: "Hotline",
      note: "Partner support desk",
    },
  };
}

function programDemo(theme: PartnerProgramTheme, locale: Locale = "zh") {
  if (theme.kind === "travel") {
    const remaining = 12;
    const total = 12;
    return {
      remaining,
      total,
      used: total - remaining,
      riderName: locale === "zh" ? "林〇雄" : "Lin H.",
      pickup:
        locale === "zh" ? "桃園機場 第一航廈" : "Taoyuan Airport Terminal 1",
      pickupDetail:
        locale === "zh"
          ? "入境大廳北側遊覽車上車處"
          : "North coach pickup zone, arrivals hall",
      dropoff:
        locale === "zh"
          ? "台北車站 -> 西門商旅"
          : "Taipei Main Station -> Ximen hotel",
      dropoffDetail:
        locale === "zh" ? "第 1 批團體接駁" : "Batch 1 group shuttle",
      departureTime: "2026-06-28 14:20",
      bookingRef: "LION-TPE-0628",
      driverName: locale === "zh" ? "黃建宏" : "Huang J.",
      vehicle:
        locale === "zh" ? "中型巴士 · ARJ-9920" : "Medium bus · ARJ-9920",
    };
  }

  const remaining = 9;
  const total = 12;
  return {
    remaining,
    total,
    used: total - remaining,
    riderName:
      locale === "zh"
        ? theme.kind === "insurance"
          ? "王〇華"
          : "陳〇明"
        : theme.kind === "insurance"
          ? "Wang H."
          : "Chen M.",
    pickup:
      locale === "zh"
        ? "台北市信義區松仁路 100 號"
        : "100 Songren Rd, Xinyi District, Taipei",
    pickupDetail: locale === "zh" ? "1 樓大廳" : "Lobby, 1F",
    dropoff:
      locale === "zh" ? "桃園機場 第二航廈" : "Taoyuan Airport Terminal 2",
    dropoffDetail:
      locale === "zh" ? "出境大廳 7 號門" : "Departure Hall Gate 7",
    departureTime: "2026-05-08 17:30",
    bookingRef: theme.issuerLabel.toUpperCase() + "-2026-0004",
    driverName: locale === "zh" ? "陳俊宏" : "Chen J.",
    vehicle:
      locale === "zh"
        ? "Toyota Prius alpha · ARJ-3120"
        : "Toyota Prius alpha · ARJ-3120",
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
  locale = "zh",
}: {
  theme: PartnerProgramTheme;
  remaining: number;
  total: number;
  locale?: Locale;
}) {
  const s = (zh: string, en: string) => (locale === "zh" ? zh : en);
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
          {s("本年度剩餘", "Remaining ") +
            theme.benefitNoun +
            s("", " this year")}
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
  rawTheme: PartnerProgramTheme,
  screen: PartnerProgramScreenId,
  basePath: string,
  locale: Locale,
): ReactNode {
  const t = (key: string, params?: Record<string, string | number>) =>
    translate(key, params, locale);
  const theme = getLocalizedProgramTheme(rawTheme, locale);
  const demo = programDemo(theme, locale);
  const s = (zh: string, en: string) => (locale === "zh" ? zh : en);
  const siteBasePath = basePath.endsWith("/embed")
    ? `${basePath.slice(0, -"/embed".length)}/site`
    : basePath;
  const reviewHref = getProgramScreenHref(siteBasePath, "review");
  const successHref = getProgramScreenHref(siteBasePath, "success");
  const trackingHref = getProgramScreenHref(siteBasePath, "tracking");
  const landingHref = getProgramScreenHref(siteBasePath, "landing");
  const eligibilityHref = getProgramScreenHref(siteBasePath, "eligibility");

  if (screen === "landing") {
    if (theme.kind === "travel") {
      const roster = [
        [
          s("林〇雄", "Lin H."),
          s("領隊 · guide", "Tour guide"),
          s("舉牌聯絡", "Signboard contact"),
        ],
        [
          s("陳〇如", "Chen R."),
          s("旅客", "Traveler"),
          s("輪椅", "Wheelchair"),
        ],
        [
          s("吳〇翰 +2", "Wu H. +2"),
          s("家庭 3 人", "Family of 3"),
          s("兒童座椅 ×1", "Child seat x1"),
        ],
        [s("其餘 6 名旅客", "Remaining 6 travelers"), "roster", ""],
      ] as const;
      const batches = [
        [
          s("第 1 批 · 入境接機", "Batch 1 · arrival pickup"),
          "06-28 14:20",
          s("中型巴士 ×1 · 12 / 12 席", "Medium bus x1 · 12 / 12 seats"),
        ],
        [
          s("第 2 批 · 飯店接駁", "Batch 2 · hotel shuttle"),
          "06-28 16:00",
          s("商務車 ×2 · 8 席", "Business cars x2 · 8 seats"),
        ],
      ] as const;

      return (
        <>
          <Band
            theme={theme}
            title={s("團體席次與分批", "Group seats and batching")}
            subtitle={s(
              "旅行社接送 · roster + batching",
              "Travel transfer · roster + batching",
            )}
            trailing="GROUP"
          />
          <Card
            title={s("本團席次", "Group seats")}
            style={{
              borderColor: theme.surface.border,
              background: theme.surface.bg,
            }}
          >
            <Row
              label={s("團體 / 訂單參照", "Group / booking ref")}
              value={demo.bookingRef}
              mono
            />
            <Row
              label={s("行程連結", "Itinerary link")}
              value={s(
                "LION 日本關西 5 日 → 查看",
                "LION Japan Kansai 5 days -> View",
              )}
            />
            <Row
              label={s("接送段數", "Transfer segments")}
              value={s("4 段 · 第 1 段", "4 segments · segment 1")}
              mono
            />
            <div style={{ marginTop: "12px" }}>
              <BenefitMeter
                theme={theme}
                remaining={demo.remaining}
                total={demo.total}
                locale={locale}
              />
            </div>
          </Card>
          <Card title={s("乘客名單 · roster (12)", "Passenger roster (12)")}>
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
          <Card title={s("分批接送 · pickup batching", "Pickup batching")}>
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
            label={s("確認席次並前往預約", "Confirm seats and continue")}
            href={reviewHref}
            primary
          />
          <Button
            theme={theme}
            label={s("查看資格確認", "View eligibility")}
            href={eligibilityHref}
          />
        </>
      );
    }

    const services: ReadonlyArray<readonly [string, string, string]> =
      theme.kind === "insurance"
        ? [
            [
              s("理賠代步", "Claim replacement ride"),
              s(
                "一般 / 商務車型 · 額度內派車",
                "Standard / business class within approved allowance",
              ),
              "CLAIM",
            ],
            [
              s("醫院往返", "Hospital transfer"),
              s(
                "回診、返家或維修代步",
                "Follow-up visits, return home, or repair mobility",
              ),
              "MEDICAL",
            ],
            [
              s("保障視窗", "Coverage window"),
              s(
                "依核定期間與車型額度",
                "Based on approved dates and vehicle allowance",
              ),
              "WINDOW",
            ],
          ]
        : [
            [
              s("機場接送", "Airport transfer"),
              s("桃園 / 松山 · 商務車", "Taoyuan / Songshan · business car"),
              "AIRPORT",
            ],
            [
              s("優先派車", "Priority dispatch"),
              s(
                "都會區 · 8 分鐘內到車",
                "Metro areas · car arrives within 8 minutes",
              ),
              "PRIORITY",
            ],
            [
              s("指定時段", "Scheduled window"),
              s("平日 07:00-22:00", "Weekdays 07:00-22:00"),
              "SCHEDULE",
            ],
          ];
    return (
      <>
        <Band
          theme={theme}
          title={theme.programLabel}
          subtitle={theme.landingSubtitle}
          trailing={
            theme.kind === "insurance" ? s("理賠額度", "CLAIM") : "EXCLUSIVE"
          }
        />
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "13px", fontWeight: 700 }}>
                {theme.kind === "insurance"
                  ? demo.riderName + " · " + theme.issuerName
                  : `${demo.riderName} · ${theme.programName}`}
              </div>
              <div style={{ fontSize: "11px", color: theme.chrome.pageMuted }}>
                {theme.kind === "insurance"
                  ? s("理賠號", "Claim") + " CLM-2026-88142"
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
                    {s("本案", "This claim ") + theme.benefitNoun}
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
                  <span>
                    {s(
                      "已用 NT$ 9,600 · 8 趟代步",
                      "Used NT$ 9,600 · 8 replacement rides",
                    )}
                  </span>
                  <span>
                    {s("代步期間剩 14 天", "14 days left in coverage")}
                  </span>
                </div>
              </Card>
            ) : (
              <BenefitMeter
                theme={theme}
                remaining={demo.remaining}
                total={demo.total}
                locale={locale}
              />
            )}
          </div>
        </Card>
        <Card title={s("可使用的服務", "Available services")}>
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
        <Button
          theme={theme}
          label={s("查看資格確認", "View eligibility")}
          href={eligibilityHref}
        />
      </>
    );
  }

  if (screen === "eligibility") {
    if (theme.kind === "insurance") {
      const checks = [
        {
          title: s("保單有效", "Policy valid"),
          code: "insurance_policy",
          detail: s(
            "POL-558-22019 · 富邦產險",
            "POL-558-22019 · Fubon Insurance",
          ),
          note: s(
            "保單於保障期間內 · 含代步附約",
            "Policy is in coverage · replacement rider included",
          ),
        },
        {
          title: s("代步車輛權益", "Replacement vehicle benefit"),
          code: "insurance_replacement_vehicle",
          detail: s(
            "一般 / 商務車型 · 每日上限 NT$ 1,600",
            "Standard / business class · daily cap NT$ 1,600",
          ),
          note: s(
            "代步期間 2026-06-01 ~ 06-30（剩 14 天）",
            "Replacement period 2026-06-01 ~ 06-30 (14 days left)",
          ),
        },
        {
          title: s("乘客名單", "Passenger roster"),
          code: "insurance_roster",
          detail: s(
            "理賠申請人 王〇華 +1 名陪同",
            "Claimant Wang H. +1 companion",
          ),
          note: s("名單須與理賠案件一致", "Roster must match the claim case"),
        },
      ] as const;
      return (
        <>
          <Band
            theme={theme}
            title={s("資格驗證", "Eligibility verification")}
            subtitle={s(
              "保險理賠代步 · 依理賠案件核定",
              "Insurance replacement ride · approved by claim case",
            )}
            trailing={s("理賠額度", "CLAIM")}
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
                {s("本案理賠額度 · claim allowance", "This claim allowance")}
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
              <span>
                {s(
                  "已用 NT$ 9,600 · 8 趟代步",
                  "Used NT$ 9,600 · 8 replacement rides",
                )}
              </span>
              <span>{s("代步期間剩 14 天", "14 days left in coverage")}</span>
            </div>
          </Card>
          <Card
            title={s("核定項目 · eligibility checks", "Eligibility checks")}
          >
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
                {s(
                  "三項核定通過 · eligibility_verified",
                  "Three checks passed · eligibility_verified",
                )}
              </span>
            </div>
          </Card>
          <Button
            theme={theme}
            label={s(
              "確認並建立代步行程",
              "Confirm and create replacement ride",
            )}
            href={getProgramScreenHref(basePath, "review")}
            primary
          />
          <Button
            theme={theme}
            label={s("返回入口", "Back to entry")}
            href={landingHref}
          />
        </>
      );
    }

    const consents = [
      s("使用 ", "Use ") +
        theme.issuerName +
        s(" 身份識別建立 DRTS 帳號", " identity to create a DRTS account"),
      s("與 DRTS 共享行程必要資訊", "Share required trip details with DRTS"),
      s("同意《", "Agree to ") +
        theme.issuerName +
        " x DRTS " +
        theme.programName +
        s("服務條款 v3》", " terms v3"),
    ];
    return (
      <>
        <Band
          theme={theme}
          title={s("資格確認", "Eligibility check")}
          subtitle={s(
            "首次使用 · 一次性確認",
            "First use · one-time confirmation",
          )}
        />
        <Card title={s("您的權益", "Your benefits")}>
          <Row label={s("方案", "Program")} value={theme.programLabel} />
          <Row label={s("提供單位", "Provider")} value={theme.issuerName} />
          <Row
            label={s("本年度", "This year ") + theme.benefitNoun}
            value={demo.total + s(" 趟", " rides")}
            mono
          />
          <Row
            label={s("服務範圍", "Service area")}
            value={s("台北 · 桃園 · 新竹", "Taipei · Taoyuan · Hsinchu")}
          />
        </Card>
        <Card title={s("授權同意", "Consent")}>
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
          label={s("確認並繼續", "Confirm and continue")}
          href={getProgramScreenHref(basePath, "review")}
          primary
        />
        <Button
          theme={theme}
          label={s("返回入口", "Back to entry")}
          href={landingHref}
        />
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
              value={s("未授權", "Unauthorized")}
              ok={false}
            />
            <TokenRow
              label={t("program.embed.unsupported.signature")}
              code="issuer_signature"
              value={s("缺少", "Missing")}
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
        title: s("保單資格不符", "Policy eligibility failed"),
        subtitle: s("保單或附約未通過驗證", "Policy or rider did not verify"),
        badge: s(
          "insurance_policy · 保單封鎖",
          "insurance_policy · policy blocked",
        ),
        tone: "danger" as const,
        glyph: "policy" as const,
        reason: s(
          "保單 POL-558-22019 未包含有效的代步附約，或保障期間已不涵蓋本次理賠代步需求。",
          "Policy POL-558-22019 does not include a valid replacement-ride rider, or the coverage period does not cover this request.",
        ),
        rows: [
          [s("保單號", "Policy No."), "POL-558-22019"],
          [
            s("保單狀態", "Policy status"),
            s("附約不符 / 需人工覆核", "Rider mismatch / needs manual review"),
          ],
          [s("保障期間", "Coverage period"), "2026-01-01 ~ 2026-12-31"],
          [
            s("下一步", "Next step"),
            s("請聯絡富邦產險承辦人", "Contact the Fubon Insurance handler"),
          ],
        ],
        primaryLabel: s("聯絡富邦產險", "Contact Fubon Insurance"),
        primaryHref: landingHref,
        secondaryLabel: s("返回入口", "Back to entry"),
        secondaryHref: landingHref,
      },
      insurance_replacement_vehicle: {
        title: s(
          "代步車權益未核定",
          "Replacement vehicle benefit not approved",
        ),
        subtitle: s(
          "車型或代步期間尚未核准",
          "Vehicle class or replacement period is not approved",
        ),
        badge: s(
          "insurance_replacement_vehicle · 權益未核定",
          "insurance_replacement_vehicle · benefit pending",
        ),
        tone: "warn" as const,
        glyph: "car" as const,
        reason: s(
          "理賠案件尚未核定可使用的代步車型或額度上限。需等待承辦人確認一般 / 商務車型與可用天數。",
          "The claim has not approved a replacement vehicle class or allowance cap yet. Wait for the handler to confirm standard / business class and eligible days.",
        ),
        rows: [
          [s("理賠號", "Claim No."), "CLM-2026-88142"],
          [
            s("目前車型", "Current vehicle class"),
            s("待核定", "Pending approval"),
          ],
          [
            s("代步期間", "Replacement period"),
            s("待富邦產險確認", "Awaiting Fubon confirmation"),
          ],
          [
            s("建議", "Recommendation"),
            s("查看理賠進度", "Check claim progress"),
          ],
        ],
        primaryLabel: s("查看理賠進度", "Check claim progress"),
        primaryHref: eligibilityHref,
        secondaryLabel: s("聯絡承辦人", "Contact handler"),
        secondaryHref: landingHref,
      },
      insurance_roster: {
        title: s("乘客名單不一致", "Passenger roster mismatch"),
        subtitle: s(
          "申請人與搭乘名單未對齊",
          "Claimant and rider list do not match",
        ),
        badge: s(
          "insurance_roster · 名單待修正",
          "insurance_roster · roster needs update",
        ),
        tone: "danger" as const,
        glyph: "roster" as const,
        reason: s(
          "目前輸入的乘客資料與理賠案件名單不一致。代步服務僅能提供給已核定的申請人與陪同名單。",
          "The submitted passenger details do not match the claim roster. Replacement rides can only serve approved claimants and companions.",
        ),
        rows: [
          [s("理賠申請人", "Claimant"), s("王〇華", "Wang H.")],
          [
            s("目前搭乘名單", "Current rider list"),
            s(
              "2 人 · 含未授權乘客",
              "2 people · includes unauthorized passenger",
            ),
          ],
          [s("名單狀態", "Roster status"), s("需重新比對", "Needs recheck")],
          [
            s("建議", "Recommendation"),
            s("請修正乘客名單", "Update passenger roster"),
          ],
        ],
        primaryLabel: s("重新輸入名單", "Re-enter roster"),
        primaryHref: eligibilityHref,
        secondaryLabel: s("聯絡承辦人", "Contact handler"),
        secondaryHref: landingHref,
      },
      insurance_pending: {
        title: s("理賠審核中", "Claim under review"),
        subtitle: s(
          "代步權益尚未核定",
          "Replacement benefit is not approved yet",
        ),
        badge: s(
          "insurance_pending · 審核中",
          "insurance_pending · under review",
        ),
        tone: "warn" as const,
        glyph: "clock" as const,
        reason: s(
          "理賠案件 CLM-2026-88142 仍在富邦產險審核流程中，代步權益需理賠核定後才能啟用。",
          "Claim CLM-2026-88142 is still under Fubon Insurance review. Replacement mobility unlocks after the claim is approved.",
        ),
        rows: [
          [s("理賠號", "Claim No."), "CLM-2026-88142"],
          [
            s("目前狀態", "Current status"),
            s("理賠審核中", "Claim under review"),
          ],
          [
            s("預計核定", "Estimated approval"),
            s("1-2 個工作日", "1-2 business days"),
          ],
          [s("通知方式", "Notification method"), "SMS + Email"],
        ],
        primaryLabel: s("查看理賠進度", "Check claim progress"),
        primaryHref: eligibilityHref,
        secondaryLabel: s("聯絡承辦人", "Contact handler"),
        secondaryHref: landingHref,
      },
      insurance_missing: {
        title: s("查無理賠案件", "No claim found"),
        subtitle: s(
          "保單或理賠編號有誤",
          "Policy or claim reference is incorrect",
        ),
        badge: s(
          "insurance_missing · 查無資料",
          "insurance_missing · no matching case",
        ),
        tone: "danger" as const,
        glyph: "search" as const,
        reason: s(
          "依您提供的保單號 / 理賠參照查無對應案件。請確認號碼是否正確，或聯絡富邦產險確認案件已建立。",
          "No matching case was found for the policy / claim reference provided. Confirm the numbers or contact Fubon Insurance to verify the case has been created.",
        ),
        rows: [
          [s("輸入保單號", "Entered policy No."), "POL-558-2201X"],
          [s("輸入理賠號", "Entered claim No."), "CLM-2026-8814X"],
          [
            s("比對結果", "Match result"),
            s("查無對應案件", "No matching case"),
          ],
          [
            s("建議", "Recommendation"),
            s("重新輸入或洽承辦", "Re-enter details or contact handler"),
          ],
        ],
        primaryLabel: s("重新輸入", "Re-enter details"),
        primaryHref: eligibilityHref,
        secondaryLabel: s("聯絡富邦產險", "Contact Fubon Insurance"),
        secondaryHref: landingHref,
      },
      insurance_expired: {
        title: s("代步期間已結束", "Replacement period ended"),
        subtitle: s("保障窗口已逾期", "Coverage window has expired"),
        badge: s("insurance_expired · 已逾期", "insurance_expired · expired"),
        tone: "danger" as const,
        glyph: "alert" as const,
        reason: s(
          "本理賠案件的代步期間（2026-05-01 ~ 05-31）已結束，無法再建立代步行程。如有特殊情形請洽承辦人申請延長。",
          "The replacement period for this claim (2026-05-01 ~ 05-31) has ended, so no new replacement ride can be created. Contact the handler to request an extension for exceptional cases.",
        ),
        rows: [
          [s("理賠號", "Claim No."), "CLM-2026-77013"],
          [s("代步期間", "Replacement period"), "2026-05-01 ~ 2026-05-31"],
          [s("到期日", "Expiry"), s("已逾期 10 天", "Expired 10 days ago")],
          [s("剩餘額度", "Remaining allowance"), s("已關閉", "Closed")],
        ],
        primaryLabel: s("申請延長代步", "Request extension"),
        primaryHref: landingHref,
        secondaryLabel: s("返回入口", "Back to entry"),
        secondaryHref: landingHref,
      },
      insurance_cancelled: {
        title: s("理賠案件已結案", "Claim case closed"),
        subtitle: s("案件取消 / 已結清", "Case cancelled / settled"),
        badge: s(
          "insurance_cancelled · 已結案",
          "insurance_cancelled · closed",
        ),
        tone: "danger" as const,
        glyph: "ban" as const,
        reason: s(
          "理賠案件 CLM-2026-66200 已結案或取消，代步權益隨之關閉。若為誤判，請聯絡富邦產險重啟案件。",
          "Claim CLM-2026-66200 has been closed or cancelled, so the replacement benefit is closed. If this is incorrect, contact Fubon Insurance to reopen the case.",
        ),
        rows: [
          [s("理賠號", "Claim No."), "CLM-2026-66200"],
          [
            s("案件狀態", "Case status"),
            s("已結案 / 取消", "Closed / cancelled"),
          ],
          [s("關閉日", "Closed date"), "2026-06-02"],
          [s("代步權益", "Replacement benefit"), s("已停用", "Disabled")],
        ],
        primaryLabel: s("聯絡富邦產險", "Contact Fubon Insurance"),
        primaryHref: landingHref,
        secondaryLabel: s("返回入口", "Back to entry"),
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
        <Card title={s("原因", "Reason")}>
          <div style={{ fontSize: "13px", color: "#0e1424", lineHeight: 1.65 }}>
            {state.reason}
          </div>
        </Card>
        <Card title={s("案件資訊", "Case information")}>
          <Row
            label={s("權益類型", "Entitlement type")}
            value={theme.benefitNoun}
          />
          {state.rows.map(([label, value]) => (
            <Row
              key={label}
              label={label}
              value={value}
              mono={label.includes("號") || label.includes("No.")}
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
          {s(
            "此狀態由理賠系統判定，接送無法在此狀態下派車。本頁不會擷取任何卡片或付款資料。",
            "This state is determined by the claim system. Dispatch is blocked in this state, and this page does not collect any card or payment data.",
          )}
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
            title={s("下單前確認", "Review before booking")}
            subtitle={s("團體接送 · 第 1 段", "Group transfer · segment 1")}
          />
          <Card>
            <Row label={s("上車", "Pickup")} value={demo.pickup} />
            <Row label="" value={demo.pickupDetail} />
            <Row label={s("下車", "Drop-off")} value={demo.dropoff} />
            <Row label="" value={demo.dropoffDetail} />
          </Card>
          <Card title={s("團體與 roster", "Group and roster")}>
            <Row
              label={s("團體 / 訂單參照", "Group / booking ref")}
              value={demo.bookingRef}
              mono
            />
            <Row
              label={s("團體席次", "Group seats")}
              value={s("12 / 12 席", "12 / 12 seats")}
              mono
            />
            <Row label={s("行李", "Luggage")} value={s("18 件", "18 bags")} />
            <Row
              label={s("集合點", "Meeting point")}
              value={s(
                "入境大廳北側遊覽車上車處",
                "North coach pickup area in arrivals hall",
              )}
            />
            <Row label={s("時間", "Time")} value={demo.departureTime} mono />
          </Card>
          <Card
            title={s("車輛配置與費用", "Vehicle assignment and fees")}
            style={{
              borderColor: theme.surface.border,
              background: theme.surface.bg,
            }}
          >
            <Row
              label={s("車輛配置", "Vehicle assignment")}
              value={s("中型巴士 ×1", "Medium bus x1")}
            />
            <Row
              label={s("接送段數", "Transfer segment")}
              value={s("第 1 / 4 段", "Segment 1 / 4")}
              mono
            />
            <Row
              label={s("費用", "Fee")}
              value={s("已含團費", "Included in group fee")}
            />
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
                {s(
                  "roster 與團體席次已對齊，可直接送出派車。",
                  "Roster and group seats are aligned, so dispatch can be submitted.",
                )}
              </span>
            </div>
          </Card>
          <Button
            theme={theme}
            label={s("確認預約", "Confirm booking")}
            href={successHref}
            primary
          />
          <Button
            theme={theme}
            label={s("返回修改", "Back to edit")}
            href={landingHref}
          />
        </>
      );
    }

    return (
      <>
        <Band
          theme={theme}
          title={s("下單前確認", "Review before booking")}
          subtitle={theme.programName}
        />
        <Card>
          <Row label={s("上車", "Pickup")} value={demo.pickup} />
          <Row label="" value={demo.pickupDetail} />
          <Row label={s("下車", "Drop-off")} value={demo.dropoff} />
          <Row label="" value={demo.dropoffDetail} />
        </Card>
        <Card title={s("行程資訊", "Trip details")}>
          <Row
            label={s("出發時間", "Departure time")}
            value={demo.departureTime}
            mono
          />
          <Row
            label={s("人數", "Passengers")}
            value={s("1 位", "1 passenger")}
          />
          <Row label={s("行李", "Luggage")} value={s("2 件", "2 bags")} />
          <Row
            label={s("車型", "Vehicle class")}
            value={s("商務車 (升級)", "Business car (upgrade)")}
          />
        </Card>
        <Card
          title={s("費用與", "Fees and ") + theme.benefitNoun}
          style={{
            borderColor: theme.surface.border,
            background: theme.surface.bg,
          }}
        >
          <Row label={s("基本費用", "Base fare")} value="NT$ 1,580" mono />
          <Row
            label={theme.programName + s("折抵", " offset")}
            value="-NT$ 1,580"
            mono
          />
          <Row label={s("您將支付", "You pay")} value={s("免費", "Free")} />
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
              label={demo.remaining + " / " + demo.total + s(" 趟", " rides")}
            />
            <span style={{ fontSize: "11px", color: theme.chrome.pageMuted }}>
              {s("本年度剩餘", "Remaining ") +
                theme.benefitNoun +
                s("", " this year")}
            </span>
          </div>
        </Card>
        <Button
          theme={theme}
          label={s("確認預約", "Confirm booking")}
          href={successHref}
          primary
        />
        <Button
          theme={theme}
          label={s("返回修改", "Back to edit")}
          href={landingHref}
        />
      </>
    );
  }

  if (screen === "success") {
    const steps = [
      s("我們已將您的需求送至派車中心。", "We sent your request to dispatch."),
      s(
        "媒合駕駛後將以簡訊與 App 通知您。",
        "You will be notified by SMS and app after driver matching.",
      ),
      s(
        "可隨時於「行程追蹤」查看即時狀態。",
        "Track live status from trip tracking at any time.",
      ),
    ];
    return (
      <>
        <Band
          theme={theme}
          title={s("預約成功", "Booking confirmed")}
          subtitle={s("我們已收到您的需求", "We have received your request")}
        />
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
                {s("預約已成立", "Booking created")}
              </div>
              <div style={{ fontSize: "11px", color: theme.chrome.pageMuted }}>
                {theme.programName}
              </div>
            </div>
          </div>
          <div style={{ paddingTop: "12px" }}>
            <Row
              label={s("訂單編號", "Booking ref")}
              value={demo.bookingRef}
              mono
            />
            <Row
              label={s("預估出發", "Estimated departure")}
              value={demo.departureTime}
              mono
            />
            <Row label={s("您將支付", "You pay")} value={s("免費", "Free")} />
          </div>
        </Card>
        <Card title={s("接下來", "Next steps")}>
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
          label={s("查看行程追蹤", "View trip tracking")}
          href={trackingHref}
          primary
        />
        <Button
          theme={theme}
          label={s("返回入口", "Back to entry")}
          href={landingHref}
        />
      </>
    );
  }

  if (screen === "tracking") {
    return (
      <>
        <Band
          theme={theme}
          title={s("行程追蹤", "Trip tracking")}
          subtitle={s("駕駛將於 8 分鐘後抵達", "Driver arrives in 8 minutes")}
        />
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
              {s("陳", "C")}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "14px", fontWeight: 800 }}>
                {demo.driverName}
              </div>
              <div style={{ fontSize: "11px", color: theme.chrome.pageMuted }}>
                {s("1,243 趟 · 4.86 ★", "1,243 trips · 4.86 ★")}
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
            <Chip
              theme={theme}
              tone="success"
              label={s("已派車", "Dispatched")}
            />
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
            <Row label={s("預計抵達", "ETA")} value="8 min" mono />
            <Row label={s("距離", "Distance")} value="2.4 km" mono />
          </div>
        </Card>
        <Card title={s("行程資訊", "Trip details")}>
          <Row
            label={s("訂單編號", "Booking ref")}
            value={demo.bookingRef}
            mono
          />
          <Row label={s("方案", "Program")} value={theme.programLabel} />
          <Row label={s("您將支付", "You pay")} value={s("免費", "Free")} />
        </Card>
        <Button
          theme={theme}
          label={s("聯絡客服", "Contact support")}
          href={getProgramScreenHref(basePath, "error")}
        />
      </>
    );
  }

  if (screen === "error") {
    return (
      <>
        <Band
          theme={theme}
          title={s("發生錯誤", "Something went wrong")}
          subtitle={s(
            "請稍後再試或聯絡客服",
            "Try again later or contact support",
          )}
        />
        <Card>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <Chip theme={theme} tone="danger" label="SERVICE_ERROR" />
            <div
              style={{ fontSize: "13px", lineHeight: 1.7, color: "#0e1424" }}
            >
              {s(
                "系統暫時無法處理您的請求。您的",
                "We cannot process this request right now. Your ",
              ) +
                theme.benefitNoun +
                s(
                  "並未被扣除，請稍後再試。",
                  " was not deducted. Please try again later.",
                )}
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
        <Button
          theme={theme}
          label={s("重新嘗試", "Try again")}
          href={landingHref}
          primary
        />
      </>
    );
  }

  // manual_review
  const guidance = [
    s(
      "您的資格已送交人工審查，暫時無法立即派車。",
      "Your eligibility was sent to manual review, so dispatch is temporarily paused.",
    ),
    s("審查結果將由 ", "Review results will be sent by ") +
      theme.issuerName +
      s(" 與 DRTS 平台客服通知您。", " and DRTS platform support."),
    s(
      "此為暫停狀態，並非預約失敗。",
      "This is a paused state, not a booking failure.",
    ),
  ];
  return (
    <>
      <Band
        theme={theme}
        title={s("人工審查中", "Manual review in progress")}
        subtitle={s("您的申請正在審查", "Your request is under review")}
      />
      <Card>
        <Row
          label={s("權益類型", "Entitlement type")}
          value={theme.benefitNoun}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginTop: "8px",
          }}
        >
          <Chip theme={theme} tone="primary" label="manual_review" />
          <span style={{ fontSize: "13px", color: theme.chrome.pageMuted }}>
            {s("預計 1 個工作天內回覆", "Expected reply within 1 business day")}
          </span>
        </div>
      </Card>
      <Card title={s("處理方式", "What happens next")}>
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
        label={s("聯絡客服", "Contact support")}
        href={getProgramScreenHref(basePath, "error")}
      />
      <Button
        theme={theme}
        label={s("返回入口", "Back to entry")}
        href={landingHref}
      />
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
  surface = "site",
}: {
  theme: PartnerProgramTheme;
  screen: PartnerProgramScreenId;
  basePath: string;
  locale: Locale;
  surface?: PartnerProgramSurfaceKind;
}) {
  const localizedTheme = getLocalizedProgramTheme(theme, locale);
  const visibleScreens = listProgramScreensForTheme(localizedTheme, surface);
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
      data-program-surface={surface}
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
          {localizedTheme.programLabel}
        </div>
        <Chip
          theme={theme}
          tone="primary"
          label={`program: ${theme.kind} · ${surface}`}
        />
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
        {renderScreen(localizedTheme, screen, basePath, locale)}
      </div>
    </div>
  );
}
