import type { CSSProperties, ReactNode } from "react";
import {
  getProgramChromeVars,
  type PartnerProgramTheme,
} from "@/lib/program-theme";

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
] as const;

export type PartnerProgramScreenId =
  (typeof PARTNER_PROGRAM_SCREENS)[number]["id"];

type ProgramScreenMeta = (typeof PARTNER_PROGRAM_SCREENS)[number];

const screenById = Object.fromEntries(
  PARTNER_PROGRAM_SCREENS.map((screen) => [screen.id, screen]),
) as Record<PartnerProgramScreenId, ProgramScreenMeta>;

const screenBySegment = Object.fromEntries(
  PARTNER_PROGRAM_SCREENS.map((screen) => [screen.segment, screen]),
) as Record<string, ProgramScreenMeta>;

export function listProgramScreens(): ReadonlyArray<ProgramScreenMeta> {
  return PARTNER_PROGRAM_SCREENS;
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

function programDemo(theme: PartnerProgramTheme) {
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

function toneStyle(theme: PartnerProgramTheme, tone: ScreenTone): CSSProperties {
  switch (tone) {
    case "success":
      return { color: "#166534", background: "#f0fdf4", border: "1px solid #bbf7d0" };
    case "danger":
      return { color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca" };
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
      return { color: "#56657f", background: "#f1f3f8", border: "1px solid #dde3ec" };
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
          fontFamily: mono ? '"JetBrains Mono", ui-monospace, monospace' : "inherit",
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

function renderScreen(
  theme: PartnerProgramTheme,
  screen: PartnerProgramScreenId,
  basePath: string,
): ReactNode {
  const demo = programDemo(theme);
  const reviewHref = getProgramScreenHref(basePath, "review");
  const successHref = getProgramScreenHref(basePath, "success");
  const trackingHref = getProgramScreenHref(basePath, "tracking");
  const landingHref = getProgramScreenHref(basePath, "landing");
  const eligibilityHref = getProgramScreenHref(basePath, "eligibility");

  if (screen === "landing") {
    const services: ReadonlyArray<readonly [string, string, string]> = [
      ["機場接送", "桃園 / 松山 · 商務車", "AIRPORT"],
      ["優先派車", "都會區 · 8 分鐘內到車", "PRIORITY"],
      ["指定時段", "平日 07:00-22:00", "SCHEDULE"],
    ];
    return (
      <>
        <Band
          theme={theme}
          title={theme.programLabel}
          subtitle={theme.tagline}
          trailing="EXCLUSIVE"
        />
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "13px", fontWeight: 700 }}>
                {demo.riderName} · {theme.programName}
              </div>
              <div style={{ fontSize: "11px", color: theme.chrome.pageMuted }}>
                {theme.issuerName}
              </div>
            </div>
            <Chip theme={theme} tone="success" label="eligible" />
          </div>
          <div style={{ marginTop: "12px" }}>
            <BenefitMeter
              theme={theme}
              remaining={demo.remaining}
              total={demo.total}
            />
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
                <div style={{ fontSize: "11px", color: theme.chrome.pageMuted }}>
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
          <Row label={`本年度${theme.benefitNoun}`} value={`${demo.total} 趟`} mono />
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

  if (screen === "review") {
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
          style={{ borderColor: theme.surface.border, background: theme.surface.bg }}
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
              <div style={{ fontSize: "14px", fontWeight: 800 }}>預約已成立</div>
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
              <div style={{ fontSize: "12px", lineHeight: 1.6, color: "#0e1424" }}>
                {step}
              </div>
            </div>
          ))}
        </Card>
        <Button theme={theme} label="查看行程追蹤" href={trackingHref} primary />
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
        <Button theme={theme} label="聯絡客服" href={getProgramScreenHref(basePath, "error")} />
      </>
    );
  }

  if (screen === "error") {
    return (
      <>
        <Band theme={theme} title="發生錯誤" subtitle="請稍後再試或聯絡客服" />
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <Chip theme={theme} tone="danger" label="SERVICE_ERROR" />
            <div style={{ fontSize: "13px", lineHeight: 1.7, color: "#0e1424" }}>
              系統暫時無法處理您的請求。您的{theme.benefitNoun}並未被扣除，請稍後再試。
            </div>
          </div>
        </Card>
        <Card
          title={theme.hotline.label}
          style={{ borderColor: theme.surface.border, background: theme.surface.bg }}
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
          <div style={{ marginTop: "6px", fontSize: "11px", color: theme.chrome.pageMuted }}>
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
            <div style={{ fontSize: "13px", lineHeight: 1.65, color: "#0e1424" }}>
              {item}
            </div>
          </div>
        ))}
      </Card>
      <Button theme={theme} label="聯絡客服" href={getProgramScreenHref(basePath, "error")} />
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
}: {
  theme: PartnerProgramTheme;
  screen: PartnerProgramScreenId;
  basePath: string;
}) {
  const activeMeta = getProgramScreenMeta(screen);

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
        {PARTNER_PROGRAM_SCREENS.map((meta) => {
          const isActive = meta.id === screen;
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
                {meta.label}
              </span>
            </a>
          );
        })}
      </nav>

      <div style={{ fontSize: "13px", lineHeight: 1.6, color: theme.chrome.pageMuted }}>
        {activeMeta.summary}
      </div>

      <div
        style={{
          display: "grid",
          gap: "12px",
          maxWidth: "420px",
          width: "100%",
        }}
      >
        {renderScreen(theme, screen, basePath)}
      </div>
    </div>
  );
}
