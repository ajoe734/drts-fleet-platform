"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { EmbedContext } from "@/lib/embed-context";
import {
  EMBED_TRIP_FALLBACK_PROGRESS,
  type EmbedTripFallbackProgressStage,
  type EmbedTripFallbackScreen,
  embedReceipt,
  embedResident,
  embedSavedPlaces,
  embedTrip,
  embedTripFallbackStates,
  embedTripHistory,
  embedVehicles,
} from "@/lib/embed-fixtures";
import { useTranslation } from "@/lib/i18n";
import {
  type EmbedTheme,
  buildEmbedTheme,
  getEntryHost,
} from "@/lib/embed-presentation";

const ICONS: Record<string, string> = {
  arrowLeft: "M15 6l-6 6 6 6",
  lock: "M7 10V7a5 5 0 0110 0v3 M5 10h14v9H5z",
  check: "M5 12l4 4 10-10",
  x: "M6 6l12 12 M18 6L6 18",
  refresh: "M3 12a9 9 0 0115.3-6.36L21 8 M21 3v5h-5 M21 12a9 9 0 01-15.3 6.36L3 16 M3 21v-5h5",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8z M5.5 20a6.5 6.5 0 0113 0",
  car: "M5 16l1.5-5a2 2 0 011.93-1.43h7.14A2 2 0 0117.5 11L19 16 M6 16h12 M7 18.5h.01 M17 18.5h.01 M8 16v2 M16 16v2",
  clock: "M12 7v5l3 2 M12 21a9 9 0 100-18 9 9 0 000 18z",
  ban: "M6 6l12 12 M12 21a9 9 0 100-18 9 9 0 000 18z",
  ext: "M14 4h6v6 M20 4l-8 8 M18 13v6H5V6h6",
  shield: "M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z",
  bolt: "M13 3L5 13h6l-1 8 8-10h-6z",
  info: "M12 8h.02 M11 12h1v5h1 M12 21a9 9 0 100-18 9 9 0 000 18z",
  alert: "M12 3l9.5 17H2.5z M12 10v4 M12 17.5v.5",
  pin: "M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z M12 12a2 2 0 100-4 2 2 0 000 4z",
  phone: "M4 5h4l2 5-2.5 1.5a11 11 0 005 5L20 14l1 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 011-1z",
};

const NEGATIVE_META = {
  denied: {
    icon: "x",
    tone: "danger",
    title: "叫車未能建立",
    posture: "denied",
    body: "此次叫車請求未通過。請確認上下車地點是否在服務範圍內，或稍後再試。",
    primary: "重新叫車",
    secondary: "聯絡社區客服",
  },
  ineligible: {
    icon: "ban",
    tone: "warn",
    title: "目前不符叫車資格",
    posture: "ineligible",
    body: "您的住戶身分目前未開通叫車服務，可能因社區方案尚未生效。請洽社區管理中心確認。",
    primary: "洽社區管理中心",
    secondary: "返回",
  },
  nosupply: {
    icon: "car",
    tone: "warn",
    title: "附近暫無可派車輛",
    posture: "no_supply",
    body: "此時段與地點暫無可派車。請稍後重試或改約時間，系統也會嘗試自動為您補派。",
    primary: "稍後重試",
    secondary: "改約時間",
  },
  degraded: {
    icon: "alert",
    tone: "warn",
    title: "服務暫時不穩定",
    posture: "degraded",
    body: "叫車服務目前回應較慢。您的請求已安全受理，恢復後會自動繼續，無需重複送出。",
    primary: "重試",
    secondary: "查看狀態",
  },
} as const;

type NegativeKind = keyof typeof NEGATIVE_META;

function embedThemeVars(theme: EmbedTheme): CSSProperties {
  return {
    ["--app-bg" as string]: theme.pageBg,
    ["--app-fg" as string]: theme.text,
    ["--app-font-sans" as string]: theme.typography.sans,
    ["--app-font-mono" as string]: theme.typography.mono,
    ["--embed-brand" as string]: theme.brand.fg,
    ["--embed-brand-hi" as string]: theme.brand.hi,
    ["--embed-brand-soft" as string]: theme.brand.bg,
    ["--embed-brand-border" as string]: theme.brand.border,
    ["--embed-host" as string]: theme.hostChrome.bg,
    ["--embed-host-fg" as string]: theme.hostChrome.fg,
    ["--embed-host-chip" as string]: theme.hostChrome.chipBg,
    ["--embed-host-button" as string]: theme.hostChrome.buttonBg,
    ["--embed-page-bg" as string]: theme.pageBg,
    ["--embed-shell-bg" as string]: theme.shellBg,
    ["--embed-surface" as string]: theme.surface,
    ["--embed-surface-lo" as string]: theme.surfaceLo,
    ["--embed-line" as string]: theme.line,
    ["--embed-line-soft" as string]: theme.lineSoft,
    ["--embed-text" as string]: theme.text,
    ["--embed-text-muted" as string]: theme.textMuted,
    ["--embed-text-dim" as string]: theme.textDim,
    ["--embed-text-faint" as string]: theme.textFaint,
    ["--embed-invert" as string]: theme.invert,
    ["--embed-frame-border" as string]: theme.frameBorder,
    ["--embed-frame-shadow" as string]: theme.frameShadow,
    ["--embed-card-shadow" as string]: theme.cardShadow,
    ["--embed-button-shadow" as string]: theme.buttonShadow,
    ["--embed-status-info-fg" as string]: theme.status.info.fg,
    ["--embed-status-info-bg" as string]: theme.status.info.bg,
    ["--embed-status-info-border" as string]: theme.status.info.border,
    ["--embed-status-warn-fg" as string]: theme.status.warn.fg,
    ["--embed-status-warn-bg" as string]: theme.status.warn.bg,
    ["--embed-status-warn-border" as string]: theme.status.warn.border,
    ["--embed-status-danger-fg" as string]: theme.status.danger.fg,
    ["--embed-status-danger-bg" as string]: theme.status.danger.bg,
    ["--embed-status-danger-border" as string]: theme.status.danger.border,
    ["--embed-status-success-fg" as string]: theme.status.success.fg,
    ["--embed-status-success-bg" as string]: theme.status.success.bg,
    ["--embed-status-success-border" as string]: theme.status.success.border,
    ["--embed-status-neutral-fg" as string]: theme.status.neutral.fg,
    ["--embed-status-neutral-bg" as string]: theme.status.neutral.bg,
    ["--embed-status-neutral-border" as string]: theme.status.neutral.border,
  };
}

function buildHref(context: EmbedContext, next: Record<string, string>) {
  const params = new URLSearchParams();
  const entryHost = context.entry.entryHost?.trim();
  if (entryHost) params.set("entryHost", entryHost);
  if (context.handoff.apiKey) params.set("apiKey", context.handoff.apiKey);
  if (context.handoff.partnerUserRef) {
    params.set("partnerUserRef", context.handoff.partnerUserRef);
  }
  for (const [key, value] of Object.entries(next)) {
    params.set(key, value);
  }
  const query = params.toString();
  return `/embed/${context.entry.entrySlug}${query ? `?${query}` : ""}`;
}

function toPhoneHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function Icon({
  name,
  size = 16,
  stroke = 2,
  style,
}: {
  name: string;
  size?: number;
  stroke?: number;
  style?: CSSProperties;
}) {
  const d = ICONS[name] ?? ICONS.info ?? "";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden
    >
      {d.split(" M").map((segment, index) => (
        <path key={index} d={index === 0 ? segment : `M${segment}`} />
      ))}
    </svg>
  );
}

function ActionButton({
  children,
  href,
  tone = "default",
  size = "md",
  icon,
  iconRight,
}: {
  children: ReactNode;
  href?: string;
  tone?: "primary" | "default" | "ghost" | "danger";
  size?: "md" | "sm";
  icon?: string;
  iconRight?: string;
}) {
  const style: CSSProperties = {
    width: "100%",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: size === "sm" ? 40 : 46,
    borderRadius: 12,
    padding: size === "sm" ? "8px 14px" : "11px 16px",
    fontFamily: "var(--app-font-sans)",
    fontSize: size === "sm" ? 13 : 14,
    fontWeight: 700,
    textDecoration: "none",
    border:
      tone === "primary"
        ? "1px solid transparent"
        : tone === "danger"
          ? "1px solid var(--embed-status-danger-border)"
          : tone === "ghost"
            ? "1px solid transparent"
            : "1px solid var(--embed-line)",
    background:
      tone === "primary"
        ? "var(--embed-brand)"
        : tone === "danger"
          ? "var(--embed-surface)"
          : tone === "ghost"
            ? "transparent"
            : "var(--embed-surface)",
    color:
      tone === "primary"
        ? "var(--embed-invert)"
        : tone === "danger"
          ? "var(--embed-status-danger-fg)"
          : tone === "ghost"
            ? "var(--embed-brand)"
            : "var(--embed-text)",
    boxShadow: tone === "primary" ? "var(--embed-button-shadow)" : "none",
  };

  const content = (
    <>
      {icon ? <Icon name={icon} size={16} /> : null}
      <span>{children}</span>
      {iconRight ? <Icon name={iconRight} size={16} /> : null}
    </>
  );

  if (!href) {
    return <span style={style}>{content}</span>;
  }

  const external = href.startsWith("tel:");
  return external ? (
    <a href={href} style={style}>
      {content}
    </a>
  ) : (
    <Link href={href} style={style}>
      {content}
    </Link>
  );
}

function Card({
  children,
  title,
  sub,
  accent,
}: {
  children: ReactNode;
  title?: ReactNode;
  sub?: ReactNode;
  accent?: string;
}) {
  return (
    <section
      style={{
        background: "var(--embed-surface)",
        border: "1px solid var(--embed-line)",
        borderTop: accent ? `2px solid ${accent}` : "1px solid var(--embed-line)",
        borderRadius: 16,
        boxShadow: "var(--embed-card-shadow)",
        overflow: "hidden",
      }}
    >
      {title || sub ? (
        <div style={{ padding: "15px 15px 0" }}>
          {title ? (
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--embed-text)" }}>
              {title}
            </div>
          ) : null}
          {sub ? (
            <div
              style={{ fontSize: 12, color: "var(--embed-text-muted)", marginTop: 2 }}
            >
              {sub}
            </div>
          ) : null}
        </div>
      ) : null}
      <div style={{ padding: 15 }}>{children}</div>
    </section>
  );
}

function Banner({
  tone,
  icon,
  children,
}: {
  tone: "primary" | "warn" | "danger" | "success";
  icon: string;
  children: ReactNode;
}) {
  const palette = {
    primary: { fg: "var(--embed-brand)", bg: "var(--embed-brand-soft)", bd: "var(--embed-brand-border)" },
    warn: { fg: "var(--embed-status-warn-fg)", bg: "var(--embed-status-warn-bg)", bd: "var(--embed-status-warn-border)" },
    danger: { fg: "var(--embed-status-danger-fg)", bg: "var(--embed-status-danger-bg)", bd: "var(--embed-status-danger-border)" },
    success: { fg: "var(--embed-status-success-fg)", bg: "var(--embed-status-success-bg)", bd: "var(--embed-status-success-border)" },
  }[tone];
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "12px 14px",
        background: palette.bg,
        border: `1px solid ${palette.bd}`,
        borderRadius: 12,
      }}
    >
      <span style={{ color: palette.fg, marginTop: 1 }}>
        <Icon name={icon} size={16} />
      </span>
      <div style={{ fontSize: 12.5, color: "var(--embed-text-dim)", lineHeight: 1.55 }}>
        {children}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  strong,
  last,
}: {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
  strong?: boolean;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 16,
        padding: "9px 0",
        borderBottom: last ? "none" : "1px solid var(--embed-line-soft)",
      }}
    >
      <span style={{ fontSize: 12.5, color: "var(--embed-text-muted)", flexShrink: 0 }}>
        {label}
      </span>
      <span
        style={{
          fontSize: 13.5,
          color: strong ? "var(--embed-brand)" : "var(--embed-text)",
          fontWeight: strong ? 700 : 500,
          textAlign: "right",
          fontFamily: mono ? "var(--app-font-mono)" : "var(--app-font-sans)",
        }}
      >
        {value}
      </span>
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
        gap: 10,
        padding: "9px 0",
        borderBottom: "1px solid var(--embed-line-soft)",
      }}
    >
      <span
        style={{
          width: 19,
          height: 19,
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          background: ok ? "var(--embed-status-success-bg)" : "var(--embed-status-danger-bg)",
          color: ok ? "var(--embed-status-success-fg)" : "var(--embed-status-danger-fg)",
        }}
      >
        <Icon name={ok ? "check" : "x"} size={11} stroke={3} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: "var(--embed-text)", fontWeight: 500 }}>
          {label}
        </div>
        <div style={{ fontSize: 9.5, color: "var(--embed-text-faint)", fontFamily: "var(--app-font-mono)" }}>
          {code}
        </div>
      </div>
      <span style={{ fontSize: 12, fontFamily: "var(--app-font-mono)", color: "var(--embed-text)" }}>
        {value}
      </span>
    </div>
  );
}

function BrandMark({ context, size = 40 }: { context: EmbedContext; size?: number }) {
  const mark = (context.strings.displayName || "?").slice(0, 1);
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: size / 3.2,
        background:
          "linear-gradient(150deg, var(--embed-brand), var(--embed-host))",
        color: "var(--embed-invert)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 800,
        fontSize: size * 0.42,
        flexShrink: 0,
      }}
    >
      {mark}
    </span>
  );
}

function StatusPill({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "success" | "warn" | "danger" | "neutral" | "primary" | "info";
}) {
  const palette = {
    success: { fg: "var(--embed-status-success-fg)", bg: "var(--embed-status-success-bg)", bd: "var(--embed-status-success-border)" },
    warn: { fg: "var(--embed-status-warn-fg)", bg: "var(--embed-status-warn-bg)", bd: "var(--embed-status-warn-border)" },
    danger: { fg: "var(--embed-status-danger-fg)", bg: "var(--embed-status-danger-bg)", bd: "var(--embed-status-danger-border)" },
    neutral: { fg: "var(--embed-status-neutral-fg)", bg: "var(--embed-status-neutral-bg)", bd: "var(--embed-status-neutral-border)" },
    primary: { fg: "var(--embed-brand)", bg: "var(--embed-brand-soft)", bd: "var(--embed-brand-border)" },
    info: { fg: "var(--embed-status-info-fg)", bg: "var(--embed-status-info-bg)", bd: "var(--embed-status-info-border)" },
  }[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        width: "fit-content",
        padding: "3px 9px",
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 700,
        color: palette.fg,
        background: palette.bg,
        border: `1px solid ${palette.bd}`,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: palette.fg,
        }}
      />
      {children}
    </span>
  );
}

function Hero({
  icon,
  tone,
  title,
  posture,
}: {
  icon: string;
  tone: "success" | "warn" | "danger" | "neutral" | "primary";
  title: ReactNode;
  posture?: ReactNode;
}) {
  const palette = {
    success: { fg: "var(--embed-status-success-fg)", bg: "var(--embed-status-success-bg)" },
    warn: { fg: "var(--embed-status-warn-fg)", bg: "var(--embed-status-warn-bg)" },
    danger: { fg: "var(--embed-status-danger-fg)", bg: "var(--embed-status-danger-bg)" },
    neutral: { fg: "var(--embed-status-neutral-fg)", bg: "var(--embed-status-neutral-bg)" },
    primary: { fg: "var(--embed-brand)", bg: "var(--embed-brand-soft)" },
  }[tone];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 9,
        padding: "14px 0 4px",
      }}
    >
      <div
        style={{
          width: 58,
          height: 58,
          borderRadius: 29,
          background: palette.bg,
          color: palette.fg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} size={28} />
      </div>
      <div
        style={{
          fontSize: 16.5,
          lineHeight: 1.35,
          fontWeight: 800,
          textAlign: "center",
        }}
      >
        {title}
      </div>
      {posture ? <StatusPill tone={tone === "neutral" ? "neutral" : tone}>{posture}</StatusPill> : null}
    </div>
  );
}

function SurfaceField({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: string;
}) {
  return (
    <div>
      <div
        style={{
          display: "block",
          fontSize: 12.5,
          fontWeight: 600,
          color: "var(--embed-text-dim)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "11px 13px",
          background: "var(--embed-surface)",
          border: "1px solid var(--embed-line)",
          borderRadius: 11,
          fontSize: 14,
          color: "var(--embed-text)",
        }}
      >
        {icon ? (
          <span style={{ color: "var(--embed-text-faint)", display: "flex" }}>
            <Icon name={icon} size={16} />
          </span>
        ) : null}
        <span>{value}</span>
      </div>
    </div>
  );
}

function Shell({
  context,
  badgeTone,
  children,
  footer,
}: {
  context: EmbedContext;
  badgeTone: "live" | "warn" | "err" | "neutral";
  children: ReactNode;
  footer?: ReactNode;
}) {
  const dotColor =
    badgeTone === "live"
      ? "var(--embed-status-success-fg)"
      : badgeTone === "warn"
        ? "var(--embed-status-warn-fg)"
        : badgeTone === "err"
          ? "var(--embed-status-danger-fg)"
          : "var(--embed-text-faint)";
  const theme = buildEmbedTheme(context.accent);

  return (
    <main
      style={{
        ...embedThemeVars(theme),
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "var(--embed-page-bg)",
        padding: "20px 10px",
        fontFamily: "var(--app-font-sans)",
      }}
    >
      <div
        style={{
          width: 392,
          minHeight: 812,
          display: "flex",
          flexDirection: "column",
          background: "var(--embed-shell-bg)",
          borderRadius: 28,
          overflow: "hidden",
          boxShadow: "var(--embed-frame-shadow)",
          border: "1px solid var(--embed-frame-border)",
          color: "var(--embed-text)",
        }}
      >
        <div
          style={{
            height: 44,
            flexShrink: 0,
            background: "var(--embed-host)",
            color: "var(--embed-host-fg)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            padding: "0 22px 6px",
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          <span>9:41</span>
          <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
            <Icon name="bolt" size={12} />
            <Icon name="shield" size={12} />
          </span>
        </div>
        <div
          style={{
            flexShrink: 0,
            background: "var(--embed-host)",
            color: "var(--embed-host-fg)",
            padding: "4px 12px 12px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              background: "var(--embed-host-button)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon name="arrowLeft" size={16} />
          </span>
          <div style={{ flex: 1, lineHeight: 1.2, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>社區叫車</div>
            <div
              style={{
                fontSize: 10,
                opacity: 0.78,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {context.strings.appName} · {context.strings.displayName}
            </div>
          </div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              maxWidth: 150,
              padding: "4px 8px",
              borderRadius: 999,
              background: "var(--embed-host-chip)",
              fontSize: 9.5,
              fontFamily: "var(--app-font-mono)",
              opacity: 0.8,
            }}
          >
            <Icon name="lock" size={10} />
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {getEntryHost(context.entry)}
            </span>
          </span>
        </div>
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            background: "var(--embed-surface)",
            borderBottom: "1px solid var(--embed-line)",
            fontSize: 10.5,
            color: "var(--embed-text-muted)",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              background: dotColor,
            }}
          />
          <span style={{ fontFamily: "var(--app-font-mono)" }}>webview</span>
          <span style={{ color: "var(--embed-text-faint)" }}>
            · embedded · /embed/{context.entry.entrySlug}
          </span>
        </div>
        <div
          style={{
            flex: 1,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 13,
          }}
        >
          {children}
        </div>
        {footer ? (
          <div
            style={{
              flexShrink: 0,
              borderTop: "1px solid var(--embed-line)",
              background: "var(--embed-surface)",
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 9,
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </main>
  );
}

function HandoffView({ context }: { context: EmbedContext }) {
  return (
    <Shell
      context={context}
      badgeTone="live"
      footer={
        <ActionButton
          href={buildHref(context, { state: "handoff", screen: "book" })}
          tone="primary"
          iconRight="car"
        >
          開始叫車
        </ActionButton>
      }
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          padding: "10px 0 2px",
        }}
      >
        <BrandMark context={context} size={56} />
        <div style={{ fontSize: 16.5, fontWeight: 800, textAlign: "center" }}>
          以 {context.strings.displayName} 身分
          <br />
          為您準備叫車
        </div>
        <StatusPill tone="success">handoff · 已交接</StatusPill>
      </div>

      <Card title="身分由社區 App 帶入" sub="signed hand-off token">
        <TokenRow label="社區簽章有效" code="partner_signature" value="valid" ok />
        <TokenRow label="住戶身分已解析" code="resident_resolved" value={embedResident.name} ok />
        <TokenRow label="社區 / 戶別" code="community_unit" value={embedResident.unit} ok />
        <Row label="參照" value={embedResident.ref} mono last />
      </Card>

      <Banner tone="primary" icon="bolt">
        免再登入，由 <b>{context.strings.appName}</b> 安全帶入身分，直接開始叫車。內嵌頁不會要求輸入帳號密碼。
      </Banner>
    </Shell>
  );
}

function ReauthView({ context }: { context: EmbedContext }) {
  return (
    <Shell
      context={context}
      badgeTone="warn"
      footer={
        <>
          <ActionButton href={buildHref(context, { state: "handoff" })} tone="primary">
            回 {context.strings.appName} 重新進入
          </ActionButton>
          <ActionButton href={buildHref(context, { state: "reauth" })} tone="ghost" size="sm">
            稍後再試
          </ActionButton>
        </>
      }
    >
      <Hero icon="clock" tone="warn" title="登入狀態已逾時" posture="reauth_required" />
      <Card title="連線狀態">
        <TokenRow label="社區工作階段過期" code="partner_session" value="expired" ok={false} />
        <TokenRow label="交付權杖逾時" code="handoff_token" value="stale" ok={false} />
      </Card>
      <Banner tone="warn" icon="shield">
        為保護您的住戶帳號，請回到 <b>{context.strings.appName}</b> 重新進入「叫車」。此頁不會要求輸入帳號或密碼。
      </Banner>
    </Shell>
  );
}

function UnsupportedView({ context }: { context: EmbedContext }) {
  return (
    <Shell
      context={{
        ...context,
        entry: { ...context.entry, entryHost: "unknown-host" },
      }}
      badgeTone="err"
      footer={
        <ActionButton href={buildHref(context, { state: "fallback" })} tone="primary" iconRight="ext">
          前往獨立叫車網站
        </ActionButton>
      }
    >
      <Hero icon="ban" tone="danger" title="無法在此環境開啟" posture="unsupported_host · 已封鎖" />
      <Card title="原因">
        <div style={{ fontSize: 13, color: "var(--embed-text-dim)", lineHeight: 1.65 }}>
          叫車服務僅能於授權的社區 App 內開啟。目前來源不在白名單宿主（entryHost），基於安全考量已封鎖載入，未傳送任何個資。
        </div>
      </Card>
      <Card title="偵測結果">
        <TokenRow label="來源宿主未授權" code="origin_host" value="未授權" ok={false} />
        <TokenRow label="社區簽章" code="partner_signature" value="缺少" ok={false} />
      </Card>
    </Shell>
  );
}

function ConsentView({ context }: { context: EmbedContext }) {
  const scopes = [
    ["建立與管理叫車行程", "為您下單、查詢與取消行程", "trip.manage"],
    ["使用必要個資", "上下車地址、聯絡電話以完成媒合與聯繫", "pii.trip"],
    ["行程綁定住戶身分", "讓您重開 App 後仍能找回進行中行程與收據", "identity.bind"],
  ] as const;

  return (
    <Shell
      context={context}
      badgeTone="live"
      footer={
        <>
          <ActionButton href={buildHref(context, { state: "handoff", screen: "book" })} tone="primary">
            同意並開始
          </ActionButton>
          <ActionButton href={buildHref(context, { state: "fallback" })} tone="ghost" size="sm">
            暫不使用
          </ActionButton>
        </>
      }
    >
      <div style={{ padding: "6px 0 2px" }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>授權使用叫車服務</div>
        <div style={{ fontSize: 12.5, color: "var(--embed-text-muted)", marginTop: 4 }}>
          首次使用 · 請確認以下同意範圍 · consent_required
        </div>
      </div>
      <Card>
        {scopes.map(([title, body, code], index) => (
          <div
            key={code}
            style={{
              display: "flex",
              gap: 11,
              padding: "11px 0",
              borderBottom: index < scopes.length - 1 ? "1px solid var(--embed-line-soft)" : "none",
            }}
          >
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: 5,
                background: "var(--embed-brand)",
                color: "var(--embed-invert)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              <Icon name="check" size={12} stroke={3} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{title}</span>
                <span style={{ fontSize: 9.5, color: "var(--embed-text-faint)", fontFamily: "var(--app-font-mono)" }}>
                  {code}
                </span>
              </div>
              <div style={{ marginTop: 2, fontSize: 11.5, color: "var(--embed-text-muted)", lineHeight: 1.45 }}>
                {body}
              </div>
            </div>
          </div>
        ))}
      </Card>
      <Banner tone="primary" icon="lock">
        由 智慧運輸科技 DRTS 提供接送，個資僅用於完成本次行程，可於社區 App 設定撤回授權。
      </Banner>
    </Shell>
  );
}

function FallbackView({ context }: { context: EmbedContext }) {
  return (
    <Shell
      context={context}
      badgeTone="neutral"
      footer={
        <>
          <ActionButton href={buildHref(context, { state: "fallback" })} tone="primary" iconRight="ext">
            前往獨立叫車網站
          </ActionButton>
          <ActionButton href={buildHref(context, { state: "handoff" })} tone="ghost" size="sm">
            回社區 App
          </ActionButton>
        </>
      }
    >
      <Hero icon="ext" tone="neutral" title="內嵌服務暫時無法使用" posture="fallback_to_web · 改用網站" />
      <Card title="接下來">
        <div style={{ fontSize: 13, color: "var(--embed-text-dim)", lineHeight: 1.65 }}>
          目前無法在社區 App 內完成叫車。您可改用 <b>獨立叫車網站</b>，以手機號碼驗證後繼續，行程與收據仍會綁定您的身分。
        </div>
      </Card>
      <Card>
        <Row label="獨立網站" value="ride.drts.com.tw" mono />
        <Row label="驗證方式" value="手機簡訊 OTP" />
        <Row label="行程資料" value="重開後仍可找回" last />
      </Card>
    </Shell>
  );
}

function BookView({ context }: { context: EmbedContext }) {
  const tripHref = buildHref(context, { state: "handoff", screen: "trip" });
  return (
    <Shell
      context={context}
      badgeTone="live"
      footer={
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
            <span style={{ color: "var(--embed-text-muted)" }}>預估車資</span>
            <span style={{ fontFamily: "var(--app-font-mono)", fontWeight: 700, fontSize: 16 }}>約 NT$ 290</span>
          </div>
          <ActionButton href={tripHref} tone="primary" iconRight="car">
            確認叫車
          </ActionButton>
        </>
      }
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 11,
          padding: "10px 12px",
          background: "var(--embed-surface)",
          border: "1px solid var(--embed-line)",
          borderRadius: 12,
        }}
      >
        <BrandMark context={context} size={34} />
        <div style={{ flex: 1, lineHeight: 1.25 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>
            {embedResident.name} · {embedResident.unit}
          </div>
          <div style={{ fontSize: 11, color: "var(--embed-text-muted)" }}>
            {context.strings.displayName}
          </div>
        </div>
        <StatusPill tone="success">已驗證</StatusPill>
      </div>

      <Card title="行程" sub="上車 · 下車 · 時間">
        <div style={{ display: "grid", gap: 10 }}>
          <SurfaceField label="上車地點" value="御和雲峰 A 棟 1F 大廳" icon="pin" />
          <SurfaceField label="下車地點" value="台北榮民總醫院 · 門診大樓" icon="pin" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <SurfaceField label="用車時間" value="現在出發" icon="clock" />
            <SurfaceField label="乘客人數" value="1 人" icon="user" />
          </div>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 11 }}>
          {embedSavedPlaces.map((place) => (
            <span
              key={place}
              style={{
                fontSize: 11.5,
                color: "var(--embed-text-muted)",
                background: "var(--embed-surface-lo)",
                border: "1px solid var(--embed-line)",
                padding: "4px 9px",
                borderRadius: 999,
              }}
            >
              {{
                lobby: "社區大廳",
                station: "台北車站",
                hospital: "榮總醫院",
              }[place]}
            </span>
          ))}
        </div>
      </Card>

      <Card title="車種" sub="owned mobility">
        <div style={{ display: "grid", gap: 8 }}>
          {embedVehicles.map((vehicle, index) => {
            const selected = index === 1;
            const meta = {
              standard: { name: "標準車", note: "1-4 人" },
              comfort: { name: "舒適車", note: "1-4 人 · 大空間" },
              xl: { name: "六人座", note: "5-6 人 · 行李多" },
            }[vehicle.id];
            return (
              <div
                key={vehicle.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "10px 12px",
                  borderRadius: 11,
                  border: selected ? "1px solid var(--embed-brand)" : "1px solid var(--embed-line)",
                  background: selected ? "var(--embed-brand-soft)" : "var(--embed-surface)",
                }}
              >
                <span style={{ color: selected ? "var(--embed-brand)" : "var(--embed-text-muted)" }}>
                  <Icon name="car" size={20} />
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{meta.name}</div>
                  <div style={{ fontSize: 11, color: "var(--embed-text-muted)" }}>{meta.note}</div>
                </div>
                {selected ? (
                  <span style={{ color: "var(--embed-brand)" }}>
                    <Icon name="check" size={17} />
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>
    </Shell>
  );
}

function ActiveView({ context }: { context: EmbedContext }) {
  return (
    <Shell
      context={context}
      badgeTone="live"
      footer={
        <>
          <ActionButton href={toPhoneHref(context.strings.supportPhone)} tone="default" icon="phone">
            聯絡司機
          </ActionButton>
          <ActionButton href={buildHref(context, { state: "handoff", screen: "cancelled" })} tone="danger" size="sm">
            取消行程 · 剩 {embedTrip.cancelWindowMin} 分鐘可免費取消
          </ActionButton>
        </>
      }
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 11px",
          background: "var(--embed-brand-soft)",
          border: "1px solid var(--embed-brand-border)",
          borderRadius: 10,
        }}
      >
        <span style={{ color: "var(--embed-brand)", display: "flex" }}>
          <Icon name="shield" size={14} />
        </span>
        <span style={{ fontSize: 11.5, color: "var(--embed-text-dim)", lineHeight: 1.4 }}>
          此行程已綁定您的身分 · <b>重開 App 仍可找回</b>
        </span>
      </div>

      <Card accent="var(--embed-brand)">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <StatusPill tone="info">前往上車</StatusPill>
          <span style={{ fontSize: 11, color: "var(--embed-text-faint)", fontFamily: "var(--app-font-mono)" }}>
            {embedTrip.id}
          </span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 14,
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 12.5, color: "var(--embed-text-muted)" }}>預計上車 · ETA</div>
            <div style={{ fontSize: 11, color: "var(--embed-text-faint)", marginTop: 2 }}>估計值，非保證</div>
          </div>
          <div
            style={{
              textAlign: "center",
              background: "var(--embed-brand-soft)",
              border: "1px solid var(--embed-brand-border)",
              borderRadius: 12,
              padding: "8px 16px",
            }}
          >
            <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: "var(--embed-brand)", fontFamily: "var(--app-font-mono)" }}>
              {embedTrip.etaMin}
            </div>
            <div style={{ fontSize: 10, color: "var(--embed-text-muted)", marginTop: 3 }}>分鐘</div>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <Row label="上車" value="御和雲峰 A 棟 1F 大廳" />
          <Row label="下車" value="台北榮民總醫院 · 門診大樓" />
          <Row label="司機" value={embedTrip.driver} />
          <Row label="車輛" value={`舒適車 · ${embedTrip.plate}`} last />
        </div>
      </Card>
    </Shell>
  );
}

function TripsView({ context }: { context: EmbedContext }) {
  const labels = {
    inProgress: { text: "進行中", tone: "info" as const },
    completed: { text: "已完成", tone: "success" as const },
    cancelled: { text: "已取消", tone: "neutral" as const },
  };
  return (
    <Shell context={context} badgeTone="live">
      <Card title="歷史行程" sub="持久身分 · reopen safe">
        <div style={{ display: "grid", gap: 12 }}>
          {embedTripHistory.map((trip) => (
            <div
              key={trip.id}
              style={{
                border: "1px solid var(--embed-line)",
                borderRadius: 14,
                padding: 13,
                background: "var(--embed-surface)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{trip.id}</div>
                  <div style={{ fontSize: 11, color: "var(--embed-text-muted)", marginTop: 2 }}>{trip.date}</div>
                </div>
                <StatusPill tone={labels[trip.status].tone}>{labels[trip.status].text}</StatusPill>
              </div>
              <div style={{ marginTop: 10 }}>
                <Row label="路線" value={`${trip.from === "lobby" ? "社區大廳" : "台北車站"} → ${trip.to === "hospital" ? "台北榮總" : trip.to === "station" ? "台北車站" : "社區大廳"}`} />
                <Row label="車資" value={trip.fare} mono last />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </Shell>
  );
}

function ReceiptView({ context }: { context: EmbedContext }) {
  return (
    <Shell context={context} badgeTone="live">
      <Card title="收據" sub="PII 遮罩">
        <Row label="行程編號" value={embedReceipt.id} mono />
        <Row label="完成時間" value={embedReceipt.completedAt} mono />
        <Row label="乘客" value={embedReceipt.passenger} />
        <Row label="聯絡" value={embedReceipt.maskedPhone} mono />
        <Row label="司機" value={embedReceipt.driver} />
        <Row label="車輛" value={embedReceipt.plate} mono />
        <Row label="付款" value="社區月結 · 綁定住戶帳號" />
        <Row label="合計" value={embedReceipt.total} strong mono last />
      </Card>
    </Shell>
  );
}

function OutcomeView({
  context,
  kind,
}: {
  context: EmbedContext;
  kind: "completed" | "cancelled";
}) {
  const completed = kind === "completed";
  return (
    <Shell
      context={context}
      badgeTone={completed ? "live" : "warn"}
      footer={
        completed ? (
          <>
            <ActionButton href={buildHref(context, { state: "handoff", screen: "receipt" })} tone="primary">
              查看收據
            </ActionButton>
            <ActionButton href={buildHref(context, { state: "handoff", screen: "trips" })} tone="ghost" size="sm">
              查看歷史行程
            </ActionButton>
          </>
        ) : (
          <ActionButton href={buildHref(context, { state: "handoff", screen: "book" })} tone="primary">
            重新叫車
          </ActionButton>
        )
      }
    >
      <Hero
        icon={completed ? "check" : "x"}
        tone={completed ? "success" : "warn"}
        title={completed ? "行程已完成，歡迎再次使用" : "此行程已取消"}
        posture={completed ? "completed" : "cancelled"}
      />
      <Card>
        <div style={{ fontSize: 13, color: "var(--embed-text-dim)", lineHeight: 1.65 }}>
          {completed
            ? "本次行程已順利結束，可直接前往收據或歷史行程。"
            : "取消結果與來源脈絡都會被保留，不會遺失既有 handoff 身分。"}
        </div>
      </Card>
    </Shell>
  );
}

function NegativeView({
  context,
  kind,
}: {
  context: EmbedContext;
  kind: NegativeKind;
}) {
  const meta = NEGATIVE_META[kind];
  return (
    <Shell
      context={context}
      badgeTone={meta.tone === "danger" ? "err" : "warn"}
      footer={
        <>
          <ActionButton href={buildHref(context, { state: "handoff", screen: "book" })} tone="primary">
            {meta.primary}
          </ActionButton>
          <ActionButton
            href={kind === "denied" ? toPhoneHref(context.strings.supportPhone) : buildHref(context, { state: "handoff", screen: "book" })}
            tone="ghost"
            size="sm"
          >
            {meta.secondary}
          </ActionButton>
        </>
      }
    >
      <Hero icon={meta.icon} tone={meta.tone} title={meta.title} posture={meta.posture} />
      <Card>
        <div style={{ fontSize: 13, color: "var(--embed-text-dim)", lineHeight: 1.65 }}>
          {meta.body}
        </div>
      </Card>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 7, fontSize: 11.5, color: "var(--embed-text-muted)" }}>
        <Icon name="phone" size={13} />
        社區叫車客服 {context.strings.supportPhone}
      </div>
    </Shell>
  );
}

function ProgressRail({
  stage,
}: {
  stage: EmbedTripFallbackProgressStage;
}) {
  const labels = EMBED_TRIP_FALLBACK_PROGRESS.map((item) => ({
    key: item,
    label:
      item === "vehicle_change_in_progress"
        ? "重新安排車輛"
        : item === "human_fallback_assigned"
          ? "新車已指派"
          : "行程繼續",
  }));
  const activeIndex = labels.findIndex((item) => item.key === stage);

  return (
    <div style={{ display: "flex", alignItems: "flex-start" }}>
      {labels.map((item, index) => {
        const done = index <= activeIndex;
        return (
          <div
            key={item.key}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              position: "relative",
            }}
          >
            {index < labels.length - 1 ? (
              <span
                style={{
                  position: "absolute",
                  top: 12,
                  left: "50%",
                  right: "-50%",
                  height: 2,
                  background: index < activeIndex ? "var(--embed-brand)" : "var(--embed-line)",
                }}
              />
            ) : null}
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                zIndex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: done ? "var(--embed-brand)" : "var(--embed-surface)",
                border: `2px solid ${done ? "var(--embed-brand)" : "var(--embed-line)"}`,
                color: done ? "var(--embed-invert)" : "var(--embed-text-faint)",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {done ? <Icon name="check" size={12} stroke={3} /> : index + 1}
            </span>
            <span
              style={{
                textAlign: "center",
                fontSize: 10.5,
                lineHeight: 1.25,
                fontWeight: index === activeIndex ? 700 : 500,
                color: index === activeIndex ? "var(--embed-text)" : "var(--embed-text-muted)",
              }}
            >
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MessageSlot({
  titleCode,
  bodyCode,
  titleSample,
  bodySample,
}: {
  titleCode: string;
  bodyCode: string;
  titleSample: string;
  bodySample: string;
}) {
  return (
    <>
      <div style={{ marginTop: -2, display: "flex", justifyContent: "center" }}>
        <span
          style={{
            fontSize: 9.5,
            color: "var(--embed-text-faint)",
            fontFamily: "var(--app-font-mono)",
            background: "var(--embed-surface-lo)",
            padding: "2px 8px",
            borderRadius: 999,
            border: "1px dashed var(--embed-frame-border)",
          }}
        >
          title ← {titleCode}
        </span>
      </div>
      <div
        style={{
          position: "relative",
          padding: "11px 13px",
          borderRadius: 10,
          background: "var(--embed-surface-lo)",
          border: "1px dashed var(--embed-frame-border)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -8,
            left: 10,
            fontSize: 9,
            fontFamily: "var(--app-font-mono)",
            fontWeight: 600,
            color: "var(--embed-text-muted)",
            background: "var(--embed-surface)",
            padding: "0 5px",
            borderRadius: 4,
          }}
        >
          messageCode · {bodyCode}
        </div>
        <div style={{ fontSize: 13, color: "var(--embed-text-dim)", lineHeight: 1.55, marginTop: 2 }}>
          {bodySample}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--embed-text-faint)", marginTop: 6 }}>
          <Icon name="info" size={11} />
          文案由後端 messageCode 渲染 · 此為示意
        </div>
      </div>
      <div style={{ display: "none" }}>{titleSample}</div>
    </>
  );
}

function TripFallbackView({
  context,
  screen,
}: {
  context: EmbedContext;
  screen: EmbedTripFallbackScreen;
}) {
  const fallback = embedTripFallbackStates[screen];
  const titleKey = `${fallback.passengerMessageCode}.title`;
  const bodyKey = `${fallback.passengerMessageCode}.body`;
  const { t } = useTranslation();

  const footer =
    screen === "vehicle_change_in_progress" ? (
      <ActionButton href={toPhoneHref(context.strings.supportPhone)} tone="default" icon="phone">
        聯絡客服
      </ActionButton>
    ) : screen === "human_fallback_assigned" ? (
      <>
        <ActionButton href={buildHref(context, { state: "handoff", screen: "trip" })} tone="primary" icon="car">
          查看行程
        </ActionButton>
        <ActionButton href={toPhoneHref(context.strings.supportPhone)} tone="default" size="sm" icon="phone">
          聯絡司機
        </ActionButton>
      </>
    ) : screen === "service_continuing" ? (
      <ActionButton href={buildHref(context, { state: "handoff", screen: "trip" })} tone="primary" icon="car">
        追蹤行程
      </ActionButton>
    ) : (
      <ActionButton href={buildHref(context, { state: "handoff", screen: "trip" })} tone="primary" icon="car">
        查看行程
      </ActionButton>
    );

  return (
    <Shell
      context={context}
      badgeTone={fallback.tone === "success" ? "live" : "warn"}
      footer={footer}
    >
      <Hero
        icon={fallback.icon}
        tone={fallback.tone === "success" ? "success" : "warn"}
        title={t(titleKey)}
      />
      <MessageSlot
        titleCode={titleKey}
        bodyCode={bodyKey}
        titleSample={t(titleKey)}
        bodySample={t(bodyKey)}
      />

      {fallback.progressStage ? (
        <Card>
          <ProgressRail stage={fallback.progressStage} />
        </Card>
      ) : null}

      {fallback.etaMin != null ? (
        <Card accent="var(--embed-brand)">
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "var(--embed-brand-soft)",
                color: "var(--embed-brand)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="car" size={22} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, color: "var(--embed-text-muted)" }}>預計上車 · ETA</div>
              <div style={{ fontSize: 11, color: "var(--embed-text-faint)" }}>估計值，非保證</div>
            </div>
            <div
              style={{
                textAlign: "center",
                background: "var(--embed-brand-soft)",
                border: "1px solid var(--embed-brand-border)",
                borderRadius: 12,
                padding: "8px 16px",
              }}
            >
              <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "var(--app-font-mono)", color: "var(--embed-brand)", lineHeight: 1 }}>
                {fallback.etaMin}
              </div>
              <div style={{ fontSize: 10, color: "var(--embed-text-muted)", marginTop: 3 }}>分鐘</div>
            </div>
          </div>
        </Card>
      ) : null}

      <Card>
        <Row label="行程編號" value={embedTrip.id} mono />
        <Row label="目的地" value="台北榮民總醫院" />
        <Row label="費用" value="維持原價 · 無額外收費" last />
      </Card>

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          padding: "9px 11px",
          background: "var(--embed-status-success-bg)",
          border: "1px solid var(--embed-status-success-border)",
          borderRadius: 10,
        }}
      >
        <span style={{ color: "var(--embed-status-success-fg)", marginTop: 1 }}>
          <Icon name="check" size={14} />
        </span>
        <span style={{ fontSize: 11, lineHeight: 1.45, color: "var(--embed-text-dim)" }}>
          同一筆行程繼續 · 不會重新下單，也不會加收費用。
        </span>
      </div>

      <div style={{ fontSize: 10, color: "var(--embed-text-faint)", textAlign: "center", lineHeight: 1.5 }}>
        接送由 智慧運輸科技 DRTS 提供 · 服務狀態僅供參考
      </div>
    </Shell>
  );
}

function RideSurface({ context }: { context: EmbedContext }) {
  switch (context.screen) {
    case "trip":
      return <ActiveView context={context} />;
    case "trips":
      return <TripsView context={context} />;
    case "receipt":
      return <ReceiptView context={context} />;
    case "completed":
      return <OutcomeView context={context} kind="completed" />;
    case "cancelled":
      return <OutcomeView context={context} kind="cancelled" />;
    case "nosupply":
    case "ineligible":
    case "denied":
    case "degraded":
      return <NegativeView context={context} kind={context.screen} />;
    case "vehicle_change_in_progress":
    case "human_fallback_assigned":
    case "service_continuing":
    case "eta_updated":
      return <TripFallbackView context={context} screen={context.screen} />;
    case "book":
    default:
      return <BookView context={context} />;
  }
}

export function PassengerEmbed({ context }: { context: EmbedContext }) {
  switch (context.state) {
    case "reauth":
      return <ReauthView context={context} />;
    case "unsupported":
      return <UnsupportedView context={context} />;
    case "consent":
      return <ConsentView context={context} />;
    case "fallback":
      return <FallbackView context={context} />;
    case "handoff":
      if (context.screen === "book") {
        return <BookView context={context} />;
      }
      if (context.screen === "trip") {
        return <ActiveView context={context} />;
      }
      if (context.screen === "trips") {
        return <TripsView context={context} />;
      }
      if (context.screen === "receipt") {
        return <ReceiptView context={context} />;
      }
      if (context.screen === "completed") {
        return <OutcomeView context={context} kind="completed" />;
      }
      if (context.screen === "cancelled") {
        return <OutcomeView context={context} kind="cancelled" />;
      }
      if (
        context.screen === "nosupply" ||
        context.screen === "ineligible" ||
        context.screen === "denied" ||
        context.screen === "degraded"
      ) {
        return <NegativeView context={context} kind={context.screen} />;
      }
      if (
        context.screen === "vehicle_change_in_progress" ||
        context.screen === "human_fallback_assigned" ||
        context.screen === "service_continuing" ||
        context.screen === "eta_updated"
      ) {
        return <TripFallbackView context={context} screen={context.screen} />;
      }
      return <HandoffView context={context} />;
    default:
      return <RideSurface context={context} />;
  }
}
