"use client";

import Link from "next/link";
import {
  type ChangeEvent,
  type ReactNode,
  useEffect,
  useState,
  useTransition,
} from "react";
import type {
  CreateReferralPassengerBookingCommand,
  ReferralPassengerActiveTripResult,
  ReferralPassengerHistoryItem,
  ReferralPassengerReceipt,
} from "@drts/contracts";
import type { EmbedContext } from "@/lib/embed-context";
import {
  EMBED_TRIP_FALLBACK_PROGRESS,
  EMBED_TRIP_FALLBACK_SCREENS,
  embedResident,
  embedSavedPlaces,
  embedTrip,
  embedTripFallbackStates,
  embedVehicles,
  type EmbedTripFallbackScreen,
} from "@/lib/embed-fixtures";
import { buildEmbedTheme, getEntryHost } from "@/lib/embed-presentation";

export type PassengerEmbedLiveData = {
  activeTrip: ReferralPassengerActiveTripResult | null;
  history: { items: ReferralPassengerHistoryItem[] } | null;
  receipt: ReferralPassengerReceipt | null;
  selectedOrderId: string | null;
} | null;

type BookingFormState = {
  passengerName: string;
  passengerPhone: string;
  pickupAddress: string;
  dropoffAddress: string;
  scheduledAt: string;
  vehicleType: string;
};

const DEMO_PASSENGER_PHONE = "0912345820";

function createInitialBookingForm(): BookingFormState {
  return {
    passengerName: embedResident.name,
    passengerPhone: DEMO_PASSENGER_PHONE,
    pickupAddress: embedTrip.from,
    dropoffAddress: embedTrip.to,
    scheduledAt: "現在出發",
    vehicleType: embedVehicles[1]?.code ?? embedVehicles[0]?.code ?? "standard",
  };
}

function formatShortDateTime(value: string | null | undefined) {
  if (!value) return "時間待更新";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hours}:${minutes}`;
}

function formatFare(amount: number | null | undefined) {
  return amount === null || amount === undefined ? "—" : `NT$ ${amount}`;
}

function normalizeTripState(state: string | null | undefined) {
  const value = state?.toLowerCase() ?? "";
  if (value === "in_progress") return "inprogress";
  return value || "matching";
}

function parseScheduledAt(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "現在出發") {
    return undefined;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
}

function buildBookingCommand(
  context: EmbedContext,
  form: BookingFormState,
): CreateReferralPassengerBookingCommand {
  const sanitizedPhone = form.passengerPhone.replace(/[^\d+]/g, "");
  const command: CreateReferralPassengerBookingCommand = {
    entrySlug: context.entry.entrySlug,
    pickupAddress: form.pickupAddress.trim(),
    dropoffAddress: form.dropoffAddress.trim(),
    vehicleType: form.vehicleType,
    idempotencyKey:
      globalThis.crypto?.randomUUID?.() ??
      `referral-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
  const passengerName = form.passengerName.trim();
  const scheduledAt = parseScheduledAt(form.scheduledAt);
  if (passengerName) {
    command.passengerName = passengerName;
  }
  if (sanitizedPhone) {
    command.passengerPhone = sanitizedPhone;
  }
  if (scheduledAt) {
    command.scheduledAt = scheduledAt;
  }
  return command;
}

function createIdempotencyKey(prefix: string) {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

function buildHref(context: EmbedContext, next: Record<string, string>) {
  const params = new URLSearchParams({
    entryHost:
      context.decision.requestedEntryHost ||
      context.session?.entryHost ||
      getEntryHost(context.entry),
  });

  for (const [key, value] of Object.entries(next)) {
    params.set(key, value);
  }

  return `/embed/${context.entry.entrySlug}?${params.toString()}`;
}

function toPhoneHref(phone: string) {
  const normalized = phone.replace(/[^\d+]/g, "");
  return `tel:${normalized || phone}`;
}

function statusDotColor(
  theme: ReturnType<typeof buildEmbedTheme>,
  state: string,
) {
  if (state === "unsupported") return theme.dangerFg;
  if (state === "reauth") return theme.warnFg;
  if (state === "fallback") return theme.neutralFg;
  return theme.successFg;
}

const GLYPHS: Record<string, string> = {
  alert: "M12 9v4 M12 17h.01 M12 3l9 16H3z",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  ban: "M6 6l12 12 M12 21a9 9 0 100-18 9 9 0 000 18z",
  bolt: "M13 3L5 13h6l-1 8 8-10h-6z",
  building:
    "M4 21V5a1 1 0 011-1h9a1 1 0 011 1v16 M15 21V9h4a1 1 0 011 1v11 M7 8h2 M7 12h2 M7 16h2 M18 13h1 M18 17h1",
  car: "M5 16l1.5-5a2 2 0 011.93-1.43h7.14A2 2 0 0117.5 11L19 16 M6 16h12 M7 18.5h.01 M17 18.5h.01 M8 16v2 M16 16v2",
  check: "M5 12l4 4 10-10",
  chevL: "M15 6l-6 6 6 6",
  clock: "M12 7v5l3 2 M12 21a9 9 0 100-18 9 9 0 000 18z",
  download: "M12 3v12 M7 11l5 5 5-5 M5 21h14",
  ext: "M14 4h6v6 M20 4l-8 8 M18 13v6H5V6h6",
  info: "M12 8h.02 M11 12h1v5h1 M12 21a9 9 0 100-18 9 9 0 000 18z",
  lock: "M7 10V7a5 5 0 0110 0v3 M5 10h14v9H5z",
  phone:
    "M5 4h4l2 5-2.5 2.5a16 16 0 006 6L17 15l5 2v4a2 2 0 01-2 2C10.6 23 1 13.4 1 2a2 2 0 012-2h2z",
  pin: "M12 21s6-5.33 6-11a6 6 0 10-12 0c0 5.67 6 11 6 11z M12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  refresh:
    "M3 12a9 9 0 0115.3-6.36L21 8 M21 3v5h-5 M21 12a9 9 0 01-15.3 6.36L3 16 M3 21v-5h5",
  receipt: "M5 3h14v18l-3-2-3 2-3-2-3 2z M8 8h8 M8 12h8 M8 16h5",
  shield: "M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z",
  spark: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z",
  star: "M12 17.2l-5.3 2.8 1-5.9-4.3-4.2 6-.9L12 3.5l2.6 5.5 6 .9-4.3 4.2 1 5.9z",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8z M5.5 20a6.5 6.5 0 0113 0",
  x: "M6 6l12 12 M18 6L6 18",
};

function Icon({
  name,
  size = 16,
  stroke = 2,
  style,
}: {
  name: string;
  size?: number;
  stroke?: number;
  style?: Record<string, string | number>;
}) {
  const d = GLYPHS[name] || GLYPHS.info || "";
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

function buttonPalette(
  theme: ReturnType<typeof buildEmbedTheme>,
  variant: "primary" | "ghost" | "default" | "danger",
) {
  switch (variant) {
    case "ghost":
      return {
        background: theme.surface,
        color: theme.primary,
        border: `1px solid ${theme.line}`,
      };
    case "default":
      return {
        background: theme.surface,
        color: theme.ink,
        border: `1px solid ${theme.line}`,
      };
    case "danger":
      return {
        background: theme.dangerFg,
        color: theme.surface,
        border: `1px solid ${theme.dangerFg}`,
      };
    default:
      return {
        background: theme.primary,
        color: theme.surface,
        border: `1px solid ${theme.primary}`,
      };
  }
}

function ActionButton({
  href,
  label,
  theme,
  variant = "primary",
  icon,
  iconRight,
  onClick,
  disabled = false,
  type = "button",
  dataDrtOperation,
}: {
  href?: string;
  label: string;
  theme: ReturnType<typeof buildEmbedTheme>;
  variant?: "primary" | "ghost" | "default" | "danger";
  icon?: string;
  iconRight?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  dataDrtOperation?: string;
}) {
  const palette = buttonPalette(theme, variant);
  const content = (
    <>
      {icon ? <Icon name={icon} size={14} /> : null}
      <span>{label}</span>
      {iconRight ? <Icon name={iconRight} size={14} /> : null}
    </>
  );
  const style = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    minHeight: 44,
    borderRadius: 12,
    padding: "11px 14px",
    fontFamily: theme.sans,
    fontSize: 14,
    fontWeight: 700,
    textDecoration: "none",
    opacity: disabled ? 0.75 : 1,
    ...palette,
  } as const;

  if (onClick || disabled || !href) {
    return (
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        data-drt-operation={dataDrtOperation}
        style={{
          ...style,
          cursor: disabled ? "progress" : "pointer",
        }}
      >
        {content}
      </button>
    );
  }

  return href.startsWith("tel:") ? (
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
  theme,
  title,
  subtitle,
  accent,
  children,
}: {
  theme: ReturnType<typeof buildEmbedTheme>;
  title?: string;
  subtitle?: string;
  accent?: string;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        display: "grid",
        gap: 10,
        padding: 15,
        borderRadius: 16,
        background: theme.surface,
        border: `1px solid ${accent ? accent : theme.line}`,
      }}
    >
      {title ? (
        <div style={{ display: "grid", gap: 3 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: theme.ink }}>
            {title}
          </div>
          {subtitle ? (
            <div style={{ fontSize: 11.5, color: theme.muted }}>{subtitle}</div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function Pill({
  theme,
  tone,
  children,
  dot = false,
}: {
  theme: ReturnType<typeof buildEmbedTheme>;
  tone: "primary" | "success" | "warn" | "danger" | "neutral" | "info";
  children: ReactNode;
  dot?: boolean;
}) {
  const palette =
    tone === "primary"
      ? { fg: theme.primary, bg: theme.primaryBg, bd: theme.primaryBd }
      : tone === "success"
        ? { fg: theme.successFg, bg: theme.successBg, bd: theme.successBorder }
        : tone === "warn"
          ? { fg: theme.warnFg, bg: theme.warnBg, bd: theme.warnBorder }
          : tone === "danger"
            ? { fg: theme.dangerFg, bg: theme.dangerBg, bd: theme.dangerBorder }
            : tone === "info"
              ? { fg: theme.infoFg, bg: theme.infoBg, bd: theme.infoBorder }
              : {
                  fg: theme.neutralFg,
                  bg: theme.neutralBg,
                  bd: theme.neutralBorder,
                };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        width: "fit-content",
        borderRadius: 999,
        padding: "4px 10px",
        fontSize: 11,
        fontWeight: 700,
        color: palette.fg,
        background: palette.bg,
        border: `1px solid ${palette.bd}`,
      }}
    >
      {dot ? (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: palette.fg,
            flexShrink: 0,
          }}
        />
      ) : null}
      {children}
    </span>
  );
}

function Banner({
  theme,
  tone,
  icon,
  children,
}: {
  theme: ReturnType<typeof buildEmbedTheme>;
  tone: "primary" | "success" | "warn" | "danger" | "neutral";
  icon: string;
  children: ReactNode;
}) {
  const palette =
    tone === "primary"
      ? { fg: theme.primary, bg: theme.primaryBg, bd: theme.primaryBd }
      : tone === "success"
        ? { fg: theme.successFg, bg: theme.successBg, bd: theme.successBorder }
        : tone === "warn"
          ? { fg: theme.warnFg, bg: theme.warnBg, bd: theme.warnBorder }
          : tone === "danger"
            ? { fg: theme.dangerFg, bg: theme.dangerBg, bd: theme.dangerBorder }
            : {
                fg: theme.neutralFg,
                bg: theme.neutralBg,
                bd: theme.neutralBorder,
              };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "12px 14px",
        borderRadius: 14,
        color: palette.fg,
        background: palette.bg,
        border: `1px solid ${palette.bd}`,
      }}
    >
      <Icon name={icon} size={16} />
      <div style={{ fontSize: 12.5, lineHeight: 1.55, color: theme.ink2 }}>
        {children}
      </div>
    </div>
  );
}

function TokenRow({
  theme,
  ok,
  label,
  code,
  value,
}: {
  theme: ReturnType<typeof buildEmbedTheme>;
  ok: boolean;
  label: string;
  code?: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 0",
        borderBottom: `1px solid ${theme.lineSoft}`,
      }}
    >
      <span
        style={{
          width: 19,
          height: 19,
          borderRadius: 999,
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: ok ? theme.successFg : theme.dangerFg,
          background: ok ? theme.successBg : theme.dangerBg,
        }}
      >
        <Icon name={ok ? "check" : "x"} size={11} stroke={3} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: theme.ink }}>
          {label}
        </div>
        {code ? (
          <div
            style={{
              fontSize: 9.5,
              color: theme.faint,
              fontFamily: theme.mono,
            }}
          >
            {code}
          </div>
        ) : null}
      </div>
      <span
        style={{
          fontSize: 12,
          color: ok ? theme.ink : theme.dangerFg,
          fontFamily: theme.mono,
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function DetailRow({
  theme,
  label,
  value,
  mono = false,
  strong = false,
  last = false,
}: {
  theme: ReturnType<typeof buildEmbedTheme>;
  label: string;
  value: string;
  mono?: boolean;
  strong?: boolean;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "9px 0",
        borderBottom: last ? "none" : `1px solid ${theme.lineSoft}`,
      }}
    >
      <span style={{ fontSize: 12.5, color: theme.muted }}>{label}</span>
      <span
        style={{
          fontSize: 12.5,
          color: theme.ink,
          fontWeight: strong ? 700 : 500,
          fontFamily: mono ? theme.mono : theme.sans,
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function EditableField({
  theme,
  label,
  icon,
  name,
  value,
  onChange,
  type = "text",
  inputMode,
  autoComplete,
}: {
  theme: ReturnType<typeof buildEmbedTheme>;
  label: string;
  icon: string;
  name: keyof BookingFormState;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  type?: "text" | "tel";
  inputMode?:
    | "text"
    | "tel"
    | "search"
    | "email"
    | "url"
    | "numeric"
    | "decimal"
    | "none";
  autoComplete?: string;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 11.5, color: theme.muted, fontWeight: 600 }}>
        {label}
      </span>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          minHeight: 42,
          borderRadius: 12,
          padding: "0 12px",
          background: theme.surface,
          border: `1px solid ${theme.line}`,
          color: theme.ink2,
        }}
      >
        <Icon name={icon} size={15} />
        <input
          aria-label={label}
          name={name}
          value={value}
          onChange={onChange}
          type={type}
          inputMode={inputMode}
          autoComplete={autoComplete}
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            color: theme.ink,
            fontFamily: theme.sans,
            fontSize: 14,
            padding: "11px 0",
          }}
        />
      </span>
    </label>
  );
}

function BrandMark({
  theme,
  entryName,
  size = 40,
}: {
  theme: ReturnType<typeof buildEmbedTheme>;
  entryName: string;
  size?: number;
}) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: size / 3.2,
        background: `linear-gradient(150deg, ${theme.primary}, ${theme.primaryHi})`,
        color: theme.surface,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.42,
        fontWeight: 800,
        flexShrink: 0,
      }}
    >
      {entryName.slice(0, 1)}
    </span>
  );
}

function Avatar({
  theme,
  name,
  size = 34,
}: {
  theme: ReturnType<typeof buildEmbedTheme>;
  name: string;
  size?: number;
}) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: size / 2.6,
        background: theme.primaryBg,
        color: theme.primary,
        border: `1px solid ${theme.primaryBd}`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {name.slice(0, 1)}
    </span>
  );
}

function StateHero({
  theme,
  tone,
  icon,
  title,
  posture,
}: {
  theme: ReturnType<typeof buildEmbedTheme>;
  tone: "success" | "warn" | "danger" | "neutral";
  icon: string;
  title: ReactNode;
  posture?: ReactNode;
}) {
  const palette =
    tone === "success"
      ? { fg: theme.successFg, bg: theme.successBg, pill: "success" as const }
      : tone === "warn"
        ? { fg: theme.warnFg, bg: theme.warnBg, pill: "warn" as const }
        : tone === "danger"
          ? { fg: theme.dangerFg, bg: theme.dangerBg, pill: "danger" as const }
          : {
              fg: theme.neutralFg,
              bg: theme.neutralBg,
              pill: "neutral" as const,
            };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 9,
        padding: "14px 0 4px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 58,
          height: 58,
          borderRadius: 29,
          background: palette.bg,
          color: palette.fg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} size={28} />
      </div>
      <div style={{ fontSize: 16.5, fontWeight: 800, color: theme.ink }}>
        {title}
      </div>
      {posture ? (
        <Pill theme={theme} tone={palette.pill} dot>
          {posture}
        </Pill>
      ) : null}
    </div>
  );
}

function AppShell({
  context,
  badgeTone,
  children,
  footer,
}: {
  context: EmbedContext;
  badgeTone?: "live" | "warn" | "err" | "neutral";
  children: ReactNode;
  footer?: ReactNode;
}) {
  const theme = buildEmbedTheme(context.accent);
  const dot =
    badgeTone === "warn"
      ? theme.warnFg
      : badgeTone === "err"
        ? theme.dangerFg
        : badgeTone === "neutral"
          ? theme.neutralFg
          : statusDotColor(theme, context.state);

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: theme.pageBg,
        display: "flex",
        justifyContent: "center",
        padding: "0 0 24px",
        fontFamily: theme.sans,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 392,
          minHeight: 812,
          background: theme.bg,
          color: theme.ink,
          display: "flex",
          flexDirection: "column",
          boxShadow: theme.shadow,
        }}
      >
        <div
          style={{
            height: 44,
            background: theme.primaryHi,
            color: theme.surface,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            padding: "0 22px 6px",
            fontSize: 12.5,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          <span>9:41</span>
          <span
            style={{
              display: "inline-flex",
              gap: 5,
              alignItems: "center",
              opacity: 0.9,
            }}
          >
            <Icon name="bolt" size={12} />
            <Icon name="shield" size={12} />
          </span>
        </div>

        <div
          style={{
            background: theme.primaryHi,
            color: theme.surface,
            padding: "4px 12px 12px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              background: "rgba(255,255,255,.16)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="chevL" size={16} />
          </span>
          <div style={{ flex: 1, lineHeight: 1.2 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>社區叫車</div>
            <div style={{ fontSize: 10, opacity: 0.78 }}>
              {context.strings.appName} · {context.strings.displayName}
            </div>
          </div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 9.5,
              fontFamily: theme.mono,
              opacity: 0.78,
              background: "rgba(255,255,255,.14)",
              padding: "4px 8px",
              borderRadius: 999,
              maxWidth: 150,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            <Icon name="lock" size={10} />
            {getEntryHost(context.entry)}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            background: theme.surface,
            borderBottom: `1px solid ${theme.line}`,
            fontSize: 10.5,
            color: theme.muted,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: dot,
              flexShrink: 0,
            }}
          />
          <span style={{ fontFamily: theme.mono }}>webview</span>
          <span style={{ color: theme.faint }}>
            · embedded · /embed/{context.entry.entrySlug}
          </span>
        </div>

        <div style={{ flex: 1, display: "grid", gap: 13, padding: 16 }}>
          {children}
        </div>

        {footer ? (
          <div
            style={{
              display: "grid",
              gap: 9,
              padding: 14,
              background: theme.surface,
              borderTop: `1px solid ${theme.line}`,
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </main>
  );
}

function HandoffScreen({ context }: { context: EmbedContext }) {
  const theme = buildEmbedTheme(context.accent);
  return (
    <AppShell
      context={context}
      badgeTone="live"
      footer={
        <ActionButton
          href={buildHref(context, { screen: "book", state: "handoff" })}
          label="開始叫車"
          theme={theme}
          variant="primary"
          iconRight="arrow"
        />
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
        <BrandMark
          theme={theme}
          entryName={context.strings.displayName}
          size={56}
        />
        <div style={{ fontSize: 16.5, fontWeight: 800, textAlign: "center" }}>
          以 {context.strings.displayName} 身分
          <br />
          為您準備叫車
        </div>
        <Pill theme={theme} tone="success" dot>
          handoff · 已交接
        </Pill>
      </div>

      <Card
        theme={theme}
        title="身分由社區 App 帶入"
        subtitle="signed hand-off token"
      >
        <TokenRow
          theme={theme}
          ok
          label="社區簽章有效"
          code="partner_signature"
          value="valid"
        />
        <TokenRow
          theme={theme}
          ok
          label="住戶身分已解析"
          code="resident_resolved"
          value={embedResident.name}
        />
        <TokenRow
          theme={theme}
          ok
          label="社區 / 戶別"
          code="community_unit"
          value={embedResident.unit}
        />
        <DetailRow
          theme={theme}
          label="參照"
          value={embedResident.ref}
          mono
          strong
          last
        />
      </Card>

      <Banner theme={theme} tone="primary" icon="bolt">
        免再登入 · 由 {context.strings.appName}{" "}
        安全帶入住戶身分，直接開始叫車。內嵌頁不會要求輸入帳號密碼。
      </Banner>
    </AppShell>
  );
}

function ReauthScreen({ context }: { context: EmbedContext }) {
  const theme = buildEmbedTheme(context.accent);
  return (
    <AppShell
      context={context}
      badgeTone="warn"
      footer={
        <>
          <ActionButton
            href={buildHref(context, { state: "handoff" })}
            label={`回 ${context.strings.appName} 重新進入`}
            theme={theme}
          />
          <ActionButton
            href={buildHref(context, { state: "fallback" })}
            label="稍後再試"
            theme={theme}
            variant="ghost"
          />
        </>
      }
    >
      <StateHero
        theme={theme}
        tone="warn"
        icon="clock"
        title="登入狀態已逾時"
        posture="reauth_required"
      />
      <Card theme={theme} title="連線狀態">
        <TokenRow
          theme={theme}
          ok={false}
          label="社區工作階段過期"
          code="partner_session"
          value="expired"
        />
        <TokenRow
          theme={theme}
          ok={false}
          label="交付權杖逾時"
          code="handoff_token"
          value="stale"
        />
      </Card>
      <Banner theme={theme} tone="warn" icon="shield">
        為保護您的住戶帳號，請回到 <b>{context.strings.appName}</b>{" "}
        重新進入「叫車」。此頁不會要求輸入帳號或密碼。
      </Banner>
    </AppShell>
  );
}

function UnsupportedScreen({ context }: { context: EmbedContext }) {
  const theme = buildEmbedTheme(context.accent);
  return (
    <AppShell
      context={context}
      badgeTone="err"
      footer={
        <ActionButton
          href={buildHref(context, { state: "fallback" })}
          label="前往獨立叫車網站"
          theme={theme}
          iconRight="ext"
        />
      }
    >
      <StateHero
        theme={theme}
        tone="danger"
        icon="ban"
        title="無法在此環境開啟"
        posture="unsupported_host · 已封鎖"
      />
      <Card theme={theme} title="原因">
        <div style={{ fontSize: 13, lineHeight: 1.6, color: theme.ink2 }}>
          叫車服務僅能於授權的社區 App
          內開啟。目前來源不在白名單宿主（entryHost），基於安全考量已封鎖載入，未傳送任何個資。
        </div>
      </Card>
      <Card theme={theme} title="偵測結果">
        <TokenRow
          theme={theme}
          ok={false}
          label="來源宿主未授權"
          code="origin_host"
          value="未授權"
        />
        <TokenRow
          theme={theme}
          ok={false}
          label="社區簽章"
          code="partner_signature"
          value="缺少"
        />
      </Card>
    </AppShell>
  );
}

function ConsentScreen({ context }: { context: EmbedContext }) {
  const theme = buildEmbedTheme(context.accent);
  const scopes = [
    ["建立與管理叫車行程", "為您下單、查詢與取消行程", "trip.manage"],
    ["使用必要個資", "上下車地址、聯絡電話以完成媒合與聯繫", "pii.trip"],
    [
      "行程綁定住戶身分",
      "讓您重開 App 後仍能找回進行中行程與收據",
      "identity.bind",
    ],
  ] as const;

  return (
    <AppShell
      context={context}
      badgeTone="live"
      footer={
        <>
          <ActionButton
            href={buildHref(context, { state: "handoff", screen: "book" })}
            label="同意並開始"
            theme={theme}
          />
          <ActionButton
            href={buildHref(context, { state: "fallback" })}
            label="暫不使用"
            theme={theme}
            variant="ghost"
          />
        </>
      }
    >
      <div style={{ display: "grid", gap: 4, padding: "6px 0 2px" }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: theme.ink }}>
          授權使用叫車服務
        </div>
        <div style={{ fontSize: 12.5, color: theme.muted }}>
          首次使用 · 請確認以下同意範圍 · consent_required
        </div>
      </div>
      <Card theme={theme}>
        {scopes.map(([title, body, code], index) => (
          <div
            key={code}
            style={{
              display: "flex",
              gap: 11,
              padding: "11px 0",
              borderBottom:
                index < scopes.length - 1
                  ? `1px solid ${theme.lineSoft}`
                  : "none",
            }}
          >
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: 5,
                background: theme.primary,
                color: theme.surface,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 1,
              }}
            >
              <Icon name="check" size={12} stroke={3} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{title}</span>
                <span
                  style={{
                    fontSize: 9.5,
                    color: theme.faint,
                    fontFamily: theme.mono,
                  }}
                >
                  {code}
                </span>
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 11.5,
                  color: theme.muted,
                  lineHeight: 1.45,
                }}
              >
                {body}
              </div>
            </div>
          </div>
        ))}
      </Card>
      <Banner theme={theme} tone="primary" icon="lock">
        由智慧運輸科技 DRTS 提供接送 · 個資僅用於完成本次行程，可於社區 App
        設定撤回授權。
      </Banner>
    </AppShell>
  );
}

function FallbackScreen({ context }: { context: EmbedContext }) {
  const theme = buildEmbedTheme(context.accent);
  return (
    <AppShell
      context={context}
      badgeTone="neutral"
      footer={
        <>
          <ActionButton
            href={buildHref(context, { state: "fallback" })}
            label="前往獨立叫車網站"
            theme={theme}
            iconRight="ext"
          />
          <ActionButton
            href={buildHref(context, { state: "handoff" })}
            label="回社區 App"
            theme={theme}
            variant="ghost"
          />
        </>
      }
    >
      <StateHero
        theme={theme}
        tone="neutral"
        icon="ext"
        title="內嵌服務暫時無法使用"
        posture="fallback_to_web · 改用網站"
      />
      <Card theme={theme} title="接下來">
        <div style={{ fontSize: 13, lineHeight: 1.6, color: theme.ink2 }}>
          目前無法在社區 App 內完成叫車。您可改用 <b>獨立叫車網站</b>
          ，以手機號碼驗證後繼續，行程與收據仍會綁定您的身分。
        </div>
      </Card>
      <Card theme={theme}>
        <DetailRow
          theme={theme}
          label="獨立網站"
          value="ride.drts.com.tw"
          mono
        />
        <DetailRow theme={theme} label="驗證方式" value="手機簡訊 OTP" />
        <DetailRow theme={theme} label="行程資料" value="重開後仍可找回" last />
      </Card>
    </AppShell>
  );
}

async function bootstrapDemoSession(context: EmbedContext) {
  const response = await fetch("/api/referral/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "demo-bootstrap",
      entrySlug: context.entry.entrySlug,
      entryHost:
        context.decision.requestedEntryHost ||
        context.session?.entryHost ||
        getEntryHost(context.entry),
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(
      payload?.message ||
        payload?.error?.message ||
        "Demo session bootstrap failed",
    );
  }
}

function BookScreen({ context }: { context: EmbedContext }) {
  const theme = buildEmbedTheme(context.accent);
  const [form, setForm] = useState<BookingFormState>(createInitialBookingForm);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(Boolean(context.session));
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (context.session || bootstrapped) {
      return;
    }

    let active = true;
    void bootstrapDemoSession(context)
      .then(() => {
        if (!active) return;
        setBootstrapped(true);
        setBootstrapError(null);
      })
      .catch((cause) => {
        if (!active) return;
        setBootstrapError(
          cause instanceof Error ? cause.message : "無法建立 demo 工作階段",
        );
      });

    return () => {
      active = false;
    };
  }, [bootstrapped, context]);

  function updateField(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.currentTarget;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function handleSubmit() {
    startTransition(async () => {
      try {
        setError(null);

        if (!form.pickupAddress.trim() || !form.dropoffAddress.trim()) {
          setError("請先填寫上下車地點。");
          return;
        }

        if (!context.session && !bootstrapped) {
          await bootstrapDemoSession(context);
          setBootstrapped(true);
        }

        const response = await fetch("/api/referral/booking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildBookingCommand(context, form)),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          throw new Error(
            payload?.error?.message || payload?.message || "建立叫車失敗",
          );
        }

        window.location.assign(
          buildHref(context, { screen: "trip", state: "handoff" }),
        );
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "建立叫車失敗");
      }
    });
  }

  return (
    <AppShell
      context={context}
      badgeTone="live"
      footer={
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 12,
            }}
          >
            <span style={{ color: theme.muted }}>預估車資</span>
            <span
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: theme.ink,
                fontFamily: theme.mono,
              }}
            >
              約 NT$ 290
            </span>
          </div>
          <ActionButton
            label={isPending ? "送出中…" : "確認叫車"}
            theme={theme}
            variant="primary"
            iconRight="arrow"
            onClick={handleSubmit}
            disabled={isPending}
            dataDrtOperation="referral-create"
          />
        </>
      }
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 11,
          padding: "10px 12px",
          background: theme.surface,
          border: `1px solid ${theme.line}`,
          borderRadius: 12,
        }}
      >
        <BrandMark
          theme={theme}
          entryName={context.strings.displayName}
          size={34}
        />
        <div style={{ flex: 1, lineHeight: 1.25 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>
            {embedResident.name} · {embedResident.unit}
          </div>
          <div style={{ fontSize: 11, color: theme.muted }}>
            {context.strings.displayName}
          </div>
        </div>
        <Pill theme={theme} tone="success" dot>
          已驗證
        </Pill>
      </div>

      {bootstrapError ? (
        <Banner theme={theme} tone="warn" icon="clock">
          Demo 身分工作階段尚未建立完成。{bootstrapError}
        </Banner>
      ) : null}
      {error ? (
        <Banner theme={theme} tone="danger" icon="alert">
          {error}
        </Banner>
      ) : null}

      <Card theme={theme} title="行程" subtitle="上車 · 下車 · 時間">
        <div style={{ display: "grid", gap: 10 }}>
          <EditableField
            theme={theme}
            label="上車地點"
            icon="pin"
            name="pickupAddress"
            value={form.pickupAddress}
            onChange={updateField}
          />
          <EditableField
            theme={theme}
            label="下車地點"
            icon="pin"
            name="dropoffAddress"
            value={form.dropoffAddress}
            onChange={updateField}
          />
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
          >
            <EditableField
              theme={theme}
              label="用車時間"
              icon="clock"
              name="scheduledAt"
              value={form.scheduledAt}
              onChange={updateField}
            />
            <EditableField
              theme={theme}
              label="聯絡電話"
              icon="phone"
              name="passengerPhone"
              value={form.passengerPhone}
              onChange={updateField}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
            />
          </div>
        </div>
        <div
          style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 11 }}
        >
          {embedSavedPlaces.map((place) => (
            <span
              key={place.label}
              style={{
                fontSize: 11.5,
                color: theme.muted,
                background: theme.surfaceLo,
                border: `1px solid ${theme.line}`,
                padding: "4px 9px",
                borderRadius: 999,
              }}
            >
              {place.label}
            </span>
          ))}
        </div>
      </Card>

      <Card theme={theme} title="車種" subtitle="owned mobility">
        <div style={{ display: "grid", gap: 8 }}>
          {embedVehicles.map((vehicle) => {
            const selected = form.vehicleType === vehicle.code;
            return (
              <label
                key={vehicle.id}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "10px 12px",
                  borderRadius: 11,
                  border: `1px solid ${selected ? theme.primary : theme.line}`,
                  background: selected ? theme.primaryBg : theme.surface,
                }}
              >
                <input
                  type="radio"
                  name="vehicleType"
                  aria-label={vehicle.name}
                  checked={selected}
                  onChange={() =>
                    setForm((current) => ({
                      ...current,
                      vehicleType: vehicle.code,
                    }))
                  }
                  style={{
                    position: "absolute",
                    inset: 0,
                    margin: 0,
                    opacity: 0,
                    cursor: "pointer",
                  }}
                />
                <span style={{ color: selected ? theme.primary : theme.muted }}>
                  <Icon name="car" size={20} />
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                    {vehicle.name}
                  </div>
                  <div style={{ fontSize: 11, color: theme.muted }}>
                    {vehicle.sub}
                  </div>
                </div>
                {selected ? (
                  <Icon
                    name="check"
                    size={17}
                    style={{ color: theme.primary }}
                  />
                ) : null}
              </label>
            );
          })}
        </div>
      </Card>
    </AppShell>
  );
}

const negativeScreens = {
  denied: {
    icon: "x",
    tone: "danger" as const,
    title: "叫車未能建立",
    posture: "denied",
    body: "此次叫車請求未通過。請確認上下車地點是否在服務範圍內，或稍後再試。",
    primary: "重新叫車",
    secondary: "聯絡社區客服",
  },
  ineligible: {
    icon: "ban",
    tone: "warn" as const,
    title: "目前不符叫車資格",
    posture: "ineligible",
    body: "您的住戶身分目前未開通叫車服務，可能因社區方案尚未生效。請洽社區管理中心確認。",
    primary: "洽社區管理中心",
    secondary: "返回",
  },
  nosupply: {
    icon: "car",
    tone: "warn" as const,
    title: "附近暫無可派車輛",
    posture: "no_supply",
    body: "此時段與地點暫無可派車。請稍後重試或改約時間，系統也會嘗試自動為您補派。",
    primary: "稍後重試",
    secondary: "改約時間",
  },
  degraded: {
    icon: "alert",
    tone: "warn" as const,
    title: "服務暫時不穩定",
    posture: "degraded",
    body: "叫車服務目前回應較慢。您的請求已安全受理，恢復後會自動繼續，無需重複送出。",
    primary: "重試",
    secondary: "查看狀態",
  },
};

function NegativeScreen({
  context,
  kind,
}: {
  context: EmbedContext;
  kind: keyof typeof negativeScreens;
}) {
  const theme = buildEmbedTheme(context.accent);
  const screen = negativeScreens[kind];
  return (
    <AppShell
      context={context}
      badgeTone={screen.tone === "danger" ? "err" : "warn"}
      footer={
        <>
          <ActionButton
            href={buildHref(context, { screen: "book", state: "handoff" })}
            label={screen.primary}
            theme={theme}
          />
          <ActionButton
            href={toPhoneHref(context.strings.supportPhone)}
            label={screen.secondary}
            theme={theme}
            variant="ghost"
          />
        </>
      }
    >
      <StateHero
        theme={theme}
        tone={screen.tone}
        icon={screen.icon}
        title={screen.title}
        posture={screen.posture}
      />
      <Card theme={theme}>
        <div style={{ fontSize: 13, lineHeight: 1.65, color: theme.ink2 }}>
          {screen.body}
        </div>
      </Card>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          fontSize: 11.5,
          color: theme.muted,
        }}
      >
        <Icon name="phone" size={13} />
        社區叫車客服 {context.strings.supportPhone}
      </div>
    </AppShell>
  );
}

const tripStateLabel: Record<
  string,
  { zh: string; tone: "warn" | "primary" | "info" | "success" | "neutral" }
> = {
  matching: { zh: "媒合中", tone: "warn" },
  assigned: { zh: "已派車", tone: "primary" },
  enroute: { zh: "前往上車", tone: "info" },
  inprogress: { zh: "行程中", tone: "info" },
  completed: { zh: "已完成", tone: "success" },
  cancelled: { zh: "已取消", tone: "neutral" },
};

function TripScreen({
  context,
  liveData,
}: {
  context: EmbedContext;
  liveData: PassengerEmbedLiveData;
}) {
  const theme = buildEmbedTheme(context.accent);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const activeTrip = liveData?.activeTrip?.trip;
  const trip = activeTrip
    ? {
        id: activeTrip.orderNo,
        orderId: activeTrip.orderId,
        state: normalizeTripState(activeTrip.statusCode || activeTrip.status),
        from: activeTrip.pickupAddress,
        to: activeTrip.dropoffAddress,
        win: formatShortDateTime(activeTrip.createdAt),
        vehicle: activeTrip.vehicleType,
        driver: activeTrip.driverName || "媒合中",
        plate: activeTrip.plateNumber || "待更新",
        rating: activeTrip.driverName ? 4.9 : 0,
        etaMin: activeTrip.etaMin ?? 5,
        cancelWindowMin: activeTrip.cancelWindowMin,
        driverPhoneMasked: activeTrip.driverPhoneMasked,
        estimatedFare: activeTrip.estimatedFare,
      }
    : null;

  function handleCancel() {
    if (!trip) return;
    startTransition(async () => {
      try {
        setError(null);
        const response = await fetch(
          `/api/referral/cancel/${encodeURIComponent(trip.orderId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              idempotencyKey: createIdempotencyKey("referral-cancel"),
            }),
          },
        );
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error?.message || "取消行程失敗");
        }
        window.location.assign(
          buildHref(context, {
            screen: "cancelled",
            state: "handoff",
            orderId: trip.orderId,
          }),
        );
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "取消行程失敗");
      }
    });
  }

  if (!trip) {
    return <BookScreen context={context} />;
  }
  const state = tripStateLabel[trip.state] || {
    zh: "媒合中",
    tone: "warn" as const,
  };
  return (
    <AppShell
      context={context}
      badgeTone="live"
      footer={
        <>
          <ActionButton
            href={toPhoneHref(context.strings.supportPhone)}
            label="聯絡司機"
            theme={theme}
            variant="default"
            icon="phone"
          />
          <ActionButton
            label={
              isPending
                ? "取消中…"
                : `取消行程 · 剩 ${trip.cancelWindowMin} 分鐘可免費取消`
            }
            theme={theme}
            variant="danger"
            onClick={handleCancel}
            disabled={isPending}
            dataDrtOperation="referral-cancel"
          />
        </>
      }
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 11px",
          background: theme.primaryBg,
          border: `1px solid ${theme.primaryBd}`,
          borderRadius: 10,
        }}
      >
        <Icon
          name="shield"
          size={14}
          style={{ color: theme.primary, flexShrink: 0 }}
        />
        <span style={{ fontSize: 11.5, color: theme.ink2, lineHeight: 1.4 }}>
          此行程已綁定您的身分 · <b>重開 App 仍可找回</b>
        </span>
      </div>

      <Card theme={theme} accent={theme.primary}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <Pill theme={theme} tone={state.tone} dot>
            {state.zh}
          </Pill>
          <span
            style={{ fontSize: 11, color: theme.faint, fontFamily: theme.mono }}
          >
            {trip.id} · {trip.orderId}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <Avatar theme={theme} name={trip.driver} size={50} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              {trip.driver}
              {trip.rating ? ` · ${trip.rating} ★` : ""}
            </div>
            <div
              style={{
                fontSize: 12,
                color: theme.muted,
                fontFamily: theme.mono,
              }}
            >
              {trip.vehicle} · {trip.plate}
            </div>
          </div>
          <div
            style={{
              textAlign: "center",
              background: theme.primaryBg,
              border: `1px solid ${theme.primaryBd}`,
              borderRadius: 12,
              padding: "8px 16px",
            }}
          >
            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: theme.primary,
                fontFamily: theme.mono,
                lineHeight: 1,
              }}
            >
              {trip.etaMin}
            </div>
            <div style={{ fontSize: 10, color: theme.muted, marginTop: 3 }}>
              分鐘 · 估計
            </div>
          </div>
        </div>
      </Card>

      {error ? (
        <Banner theme={theme} tone="danger" icon="alert">
          {error}
        </Banner>
      ) : null}

      <Card theme={theme}>
        <div style={{ display: "flex", gap: 11 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              paddingTop: 4,
            }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: 5,
                border: `2px solid ${theme.primary}`,
              }}
            />
            <span
              style={{
                flex: 1,
                width: 2,
                background: theme.line,
                margin: "3px 0",
                minHeight: 22,
              }}
            />
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: 2,
                background: theme.primary,
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 18 }}>
              {trip.from}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{trip.to}</div>
          </div>
        </div>
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${theme.lineSoft}`,
          }}
        >
          <DetailRow
            theme={theme}
            label="預計上車"
            value={trip.win}
            mono
            last
          />
        </div>
      </Card>

      <div
        style={{
          fontSize: 11,
          color: theme.faint,
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        抵達時間為估計值，非保證 · 接送由智慧運輸科技 DRTS 提供
      </div>
    </AppShell>
  );
}

function TripsScreen({
  context,
  liveData,
}: {
  context: EmbedContext;
  liveData: PassengerEmbedLiveData;
}) {
  const theme = buildEmbedTheme(context.accent);
  const historyItems =
    liveData?.history?.items.map((trip) => ({
      id: trip.orderNo,
      orderId: trip.orderId,
      date: formatShortDateTime(trip.completedAt || trip.createdAt),
      from: trip.pickupAddress,
      to: trip.dropoffAddress,
      state: normalizeTripState(trip.status),
      fare: trip.formattedFare || formatFare(trip.fareTotal),
    })) ?? [];
  return (
    <AppShell context={context} badgeTone="live">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 800 }}>我的行程</div>
        <Pill theme={theme} tone="neutral">
          綁定 {embedResident.name}
        </Pill>
      </div>
      <div
        style={{
          fontSize: 11.5,
          color: theme.muted,
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginTop: -4,
        }}
      >
        <Icon name="shield" size={13} style={{ color: theme.primary }} />
        重開 App 後行程與收據仍可找回
      </div>
      {historyItems.length === 0 ? (
        <Card theme={theme}>
          <div style={{ fontSize: 13, color: theme.ink2, lineHeight: 1.65 }}>
            尚無可顯示的行程紀錄。
          </div>
        </Card>
      ) : null}
      {historyItems.map((trip) => {
        const tripState = tripStateLabel[trip.state] || {
          zh: trip.state,
          tone: "neutral" as const,
        };
        const tone =
          trip.state === "completed"
            ? "success"
            : trip.state === "cancelled"
              ? "neutral"
              : "info";
        return (
          <Link
            href={buildHref(context, {
              screen: trip.state === "completed" ? "completed" : "cancelled",
              state: "handoff",
              orderId: trip.orderId,
            })}
            key={trip.id}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <Card theme={theme}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: theme.surfaceLo,
                    color: theme.muted,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon
                    name={
                      trip.state === "cancelled"
                        ? "x"
                        : trip.state === "completed"
                          ? "check"
                          : "car"
                    }
                    size={18}
                  />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {trip.from} → {trip.to}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: theme.muted,
                      fontFamily: theme.mono,
                      marginTop: 2,
                    }}
                  >
                    {trip.date} · {trip.id}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <Pill theme={theme} tone={tone} dot>
                    {tripState.zh}
                  </Pill>
                  <div
                    style={{
                      fontSize: 12.5,
                      fontFamily: theme.mono,
                      color: theme.ink,
                      marginTop: 5,
                      fontWeight: 600,
                    }}
                  >
                    {trip.fare}
                  </div>
                </div>
              </div>
            </Card>
          </Link>
        );
      })}
    </AppShell>
  );
}

function ReceiptScreen({
  context,
  liveData,
}: {
  context: EmbedContext;
  liveData: PassengerEmbedLiveData;
}) {
  const theme = buildEmbedTheme(context.accent);
  const receipt = liveData?.receipt
    ? {
        id: liveData.receipt.orderNo,
        orderId: liveData.receipt.orderId,
        date: formatShortDateTime(
          liveData.receipt.completedAt || liveData.activeTrip?.trip?.createdAt,
        ),
        from: liveData.receipt.pickupAddress,
        to: liveData.receipt.dropoffAddress,
        vehicle: liveData.receipt.vehicleType,
        driver: liveData.receipt.driverName || "媒合中",
        plate: liveData.receipt.plateNumber || "待更新",
        passenger: liveData.receipt.passengerNameMasked,
        maskedPhone: liveData.receipt.passengerPhoneMasked,
        fareBase: formatFare(liveData.receipt.fareBase),
        fareDistance: formatFare(liveData.receipt.fareDistance),
        fareTime: formatFare(liveData.receipt.fareTime),
        total: liveData.receipt.formattedTotal,
        payment: "社區月結 · 綁定住戶帳號",
        channel: context.strings.appName,
        downloadUrl: liveData.receipt.downloadUrl,
      }
    : null;
  if (!receipt) {
    return <TripsScreen context={context} liveData={liveData} />;
  }
  return (
    <AppShell
      context={context}
      badgeTone="live"
      footer={
        <ActionButton
          href={
            receipt.downloadUrl ||
            buildHref(context, { screen: "receipt", state: "handoff" })
          }
          label="下載收據"
          theme={theme}
          icon="download"
        />
      }
    >
      <StateHero theme={theme} tone="success" icon="check" title="行程已完成" />
      <div
        style={{
          textAlign: "center",
          fontSize: 12,
          color: theme.muted,
          fontFamily: theme.mono,
          marginTop: -6,
        }}
      >
        {receipt.id} · {receipt.orderId}
      </div>
      <Card theme={theme} title="行程" subtitle={receipt.date}>
        <div style={{ display: "flex", gap: 11 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              paddingTop: 4,
            }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: 5,
                border: `2px solid ${theme.primary}`,
              }}
            />
            <span
              style={{
                flex: 1,
                width: 2,
                background: theme.line,
                margin: "3px 0",
                minHeight: 16,
              }}
            />
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: 2,
                background: theme.primary,
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>
              {receipt.from}
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{receipt.to}</div>
          </div>
        </div>
      </Card>
      <Card theme={theme} title="乘客與車輛" subtitle="PII 已遮罩">
        <DetailRow theme={theme} label="乘客" value={receipt.passenger} />
        <DetailRow
          theme={theme}
          label="聯絡電話"
          value={receipt.maskedPhone}
          mono
        />
        <DetailRow
          theme={theme}
          label="司機 / 車牌"
          value={`${receipt.driver} · ${receipt.plate}`}
        />
        <DetailRow theme={theme} label="車種" value={receipt.vehicle} last />
      </Card>
      <Card theme={theme} title="費用明細" subtitle="fare breakdown">
        <DetailRow theme={theme} label="起步價" value={receipt.fareBase} mono />
        <DetailRow
          theme={theme}
          label="里程"
          value={receipt.fareDistance}
          mono
        />
        <DetailRow theme={theme} label="時間" value={receipt.fareTime} mono />
        <DetailRow
          theme={theme}
          label="合計"
          value={receipt.total}
          strong
          mono
          last
        />
        <div style={{ marginTop: 12 }}>
          <Banner theme={theme} tone="neutral" icon="building">
            {receipt.payment} · 經 {receipt.channel}
          </Banner>
        </div>
      </Card>
    </AppShell>
  );
}

function OutcomeScreen({
  context,
  kind,
  liveData,
}: {
  context: EmbedContext;
  kind: "completed" | "cancelled";
  liveData: PassengerEmbedLiveData;
}) {
  const theme = buildEmbedTheme(context.accent);
  const completed = kind === "completed";
  const [score, setScore] = useState<number | null>(null);
  const [ratingMessage, setRatingMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const trip =
    liveData?.history?.items.find(
      (item) =>
        (!liveData.selectedOrderId ||
          item.orderId === liveData.selectedOrderId) &&
        (completed ? item.status === "completed" : item.status === "cancelled"),
    ) ??
    (liveData?.selectedOrderId
      ? ({ orderId: liveData.selectedOrderId } as any)
      : undefined);

  function submitRating(nextScore: number) {
    if (!trip) return;
    startTransition(async () => {
      try {
        setError(null);
        const response = await fetch(
          `/api/referral/rating/${encodeURIComponent(trip.orderId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              score: nextScore,
              idempotencyKey: createIdempotencyKey("referral-rating"),
            }),
          },
        );
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error?.message || "送出評分失敗");
        }
        setScore(nextScore);
        setRatingMessage("已收到您的評分。感謝回饋！");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "送出評分失敗");
      }
    });
  }
  return (
    <AppShell
      context={context}
      badgeTone={completed ? "live" : "neutral"}
      footer={
        <>
          <ActionButton
            href={buildHref(context, {
              screen: "receipt",
              state: "handoff",
              ...(trip ? { orderId: trip.orderId } : {}),
            })}
            label="查看收據"
            theme={theme}
            icon="receipt"
            dataDrtOperation="referral-receipt"
          />
          <ActionButton
            href={buildHref(context, { screen: "book", state: "handoff" })}
            label={completed ? "再叫一次" : "重新叫車"}
            theme={theme}
            variant="ghost"
          />
        </>
      }
    >
      <StateHero
        theme={theme}
        tone={completed ? "success" : "neutral"}
        icon={completed ? "check" : "x"}
        title={completed ? "行程已完成" : "行程已取消"}
        posture={completed ? "completed" : "cancelled"}
      />
      <Card theme={theme}>
        <DetailRow
          theme={theme}
          label="行程"
          value={
            trip
              ? `${trip.pickupAddress ?? "約定地點"} → ${trip.dropoffAddress ?? "目的地"}`
              : "行程資料讀取中"
          }
        />
        <DetailRow
          theme={theme}
          label="車資"
          value={trip?.formattedFare ?? "—"}
          strong
        />
        <DetailRow theme={theme} label="付款" value="社區月結" last />
      </Card>
      <Card theme={theme} title="為這趟行程評分">
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 9,
            padding: "4px 0",
          }}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              data-drt-operation="referral-rate"
              onClick={() => submitRating(n)}
              disabled={!trip || isPending || score !== null}
              aria-label={`評分 ${n} 星`}
              style={{
                border: 0,
                padding: 0,
                background: "transparent",
                color: score !== null && n > score ? theme.line : theme.warnFg,
                cursor:
                  !trip || isPending || score !== null ? "default" : "pointer",
              }}
            >
              <Icon name="spark" size={30} />
            </button>
          ))}
        </div>
        {ratingMessage ? (
          <Banner theme={theme} tone="success" icon="check">
            {ratingMessage}
          </Banner>
        ) : null}
        {error ? (
          <Banner theme={theme} tone="danger" icon="alert">
            {error}
          </Banner>
        ) : null}
      </Card>
      {!completed ? (
        <Card theme={theme}>
          <div
            style={{
              fontSize: 13,
              color: theme.ink2,
              lineHeight: 1.65,
              marginBottom: 10,
            }}
          >
            此行程已取消，未產生車資。若於司機抵達後取消可能酌收費用，詳見社區叫車條款。
          </div>
          <DetailRow
            theme={theme}
            label="取消時間"
            value={formatShortDateTime(trip?.completedAt || trip?.createdAt)}
            mono
          />
          <DetailRow
            theme={theme}
            label="費用"
            value={trip?.formattedFare ?? "—"}
            strong
            last
          />
        </Card>
      ) : null}
    </AppShell>
  );
}

function MessageSlot({
  theme,
  code,
  sample,
}: {
  theme: ReturnType<typeof buildEmbedTheme>;
  code: string;
  sample: string;
}) {
  return (
    <div
      style={{
        position: "relative",
        padding: "11px 13px",
        borderRadius: 10,
        background: theme.surfaceLo,
        border: `1px dashed ${theme.line}`,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -8,
          left: 10,
          fontSize: 9,
          fontWeight: 600,
          fontFamily: theme.mono,
          color: theme.muted,
          background: theme.surface,
          padding: "0 5px",
          borderRadius: 4,
        }}
      >
        messageCode · {code}
      </div>
      <div
        style={{
          marginTop: 2,
          fontSize: 13,
          lineHeight: 1.55,
          color: theme.ink2,
        }}
      >
        {sample}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          marginTop: 6,
          fontSize: 10,
          color: theme.faint,
        }}
      >
        <Icon name="info" size={11} />
        文案由後端 messageCode 渲染 · 此為示意
      </div>
    </div>
  );
}

function FallbackProgressRail({
  theme,
  stage,
}: {
  theme: ReturnType<typeof buildEmbedTheme>;
  stage: (typeof EMBED_TRIP_FALLBACK_PROGRESS)[number];
}) {
  const currentIndex = EMBED_TRIP_FALLBACK_PROGRESS.indexOf(stage);

  return (
    <div style={{ display: "flex", alignItems: "flex-start" }}>
      {EMBED_TRIP_FALLBACK_PROGRESS.map((item, index) => {
        const done = index <= currentIndex;
        const label =
          item === "vehicle_change_in_progress"
            ? "重新安排車輛"
            : item === "human_fallback_assigned"
              ? "新車已指派"
              : "行程繼續";

        return (
          <div
            key={item}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              position: "relative",
            }}
          >
            {index < EMBED_TRIP_FALLBACK_PROGRESS.length - 1 ? (
              <span
                style={{
                  position: "absolute",
                  top: 12,
                  left: "50%",
                  right: "-50%",
                  height: 2,
                  background: index < currentIndex ? theme.primary : theme.line,
                }}
              />
            ) : null}
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                zIndex: 1,
                background: done ? theme.primary : theme.surface,
                border: `2px solid ${done ? theme.primary : theme.line}`,
                color: done ? theme.surface : theme.faint,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {done ? <Icon name="check" size={12} stroke={3} /> : index + 1}
            </span>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: index === currentIndex ? 700 : 500,
                color: index === currentIndex ? theme.ink : theme.muted,
                lineHeight: 1.25,
                textAlign: "center",
              }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function FallbackTripScreen({
  context,
  screen,
}: {
  context: EmbedContext;
  screen: EmbedTripFallbackScreen;
}) {
  const theme = buildEmbedTheme(context.accent);
  const fallback = embedTripFallbackStates[screen];
  const footer =
    screen === "vehicle_change_in_progress" ? (
      <ActionButton
        href={toPhoneHref(context.strings.supportPhone)}
        label="聯絡客服"
        theme={theme}
        variant="default"
        icon="phone"
      />
    ) : screen === "human_fallback_assigned" ? (
      <>
        <ActionButton
          href={buildHref(context, { screen: "trip", state: "handoff" })}
          label="查看行程"
          theme={theme}
          icon="car"
        />
        <ActionButton
          href={toPhoneHref(context.strings.supportPhone)}
          label="聯絡司機"
          theme={theme}
          variant="default"
          icon="phone"
        />
      </>
    ) : screen === "service_continuing" ? (
      <ActionButton
        href={buildHref(context, { screen: "trip", state: "handoff" })}
        label="追蹤行程"
        theme={theme}
        icon="car"
      />
    ) : (
      <ActionButton
        href={buildHref(context, { screen: "trip", state: "handoff" })}
        label="查看行程"
        theme={theme}
        icon="car"
      />
    );

  return (
    <AppShell
      context={context}
      badgeTone={fallback.tone === "success" ? "live" : "warn"}
      footer={footer}
    >
      <StateHero
        theme={theme}
        tone={fallback.tone}
        icon={fallback.icon}
        title={<span style={{ fontSize: 16 }}>{fallback.titleSample}</span>}
      />

      <div style={{ marginTop: -2, display: "flex", justifyContent: "center" }}>
        <span
          style={{
            fontSize: 9.5,
            color: theme.faint,
            background: theme.surfaceLo,
            border: `1px dashed ${theme.line}`,
            borderRadius: 999,
            padding: "2px 8px",
            fontFamily: theme.mono,
          }}
        >
          title ← {fallback.titleCode}
        </span>
      </div>

      {fallback.progressStage ? (
        <Card theme={theme}>
          <FallbackProgressRail theme={theme} stage={fallback.progressStage} />
        </Card>
      ) : null}

      {fallback.etaMin !== null ? (
        <Card theme={theme} accent={theme.primary}>
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: theme.primaryBg,
                color: theme.primary,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="car" size={22} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, color: theme.muted }}>
                預計上車 · ETA
              </div>
              <div style={{ fontSize: 11, color: theme.faint }}>
                估計值，非保證
              </div>
            </div>
            <div
              style={{
                textAlign: "center",
                background: theme.primaryBg,
                border: `1px solid ${theme.primaryBd}`,
                borderRadius: 12,
                padding: "8px 16px",
              }}
            >
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  lineHeight: 1,
                  fontFamily: theme.mono,
                  color: theme.primary,
                }}
              >
                {fallback.etaMin}
              </div>
              <div style={{ fontSize: 10, color: theme.muted, marginTop: 3 }}>
                分鐘
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      <MessageSlot
        theme={theme}
        code={fallback.bodyCode}
        sample={fallback.bodySample}
      />

      <Card theme={theme}>
        <DetailRow theme={theme} label="行程編號" value={embedTrip.id} mono />
        <DetailRow theme={theme} label="目的地" value="台北榮民總醫院" />
        <DetailRow
          theme={theme}
          label="費用"
          value="維持原價 · 無額外收費"
          last
        />
      </Card>

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          padding: "9px 11px",
          borderRadius: 10,
          background: theme.successBg,
          border: `1px solid ${theme.successBorder}`,
        }}
      >
        <Icon
          name="check"
          size={14}
          style={{ color: theme.successFg, flexShrink: 0, marginTop: 1 }}
        />
        <span style={{ fontSize: 11, lineHeight: 1.45, color: theme.ink2 }}>
          同一筆行程繼續 · 不會重新下單，也不會加收費用。
        </span>
      </div>

      <div
        style={{
          fontSize: 10,
          color: theme.faint,
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        接送由智慧運輸科技 DRTS 提供 · 服務狀態僅供參考
      </div>
    </AppShell>
  );
}

function renderIdentitySurface(context: EmbedContext) {
  switch (context.state) {
    case "reauth":
      return <ReauthScreen context={context} />;
    case "unsupported":
      return <UnsupportedScreen context={context} />;
    case "consent":
      return <ConsentScreen context={context} />;
    case "fallback":
      return <FallbackScreen context={context} />;
    default:
      return <HandoffScreen context={context} />;
  }
}

function isFallbackScreen(screen: string): screen is EmbedTripFallbackScreen {
  return (EMBED_TRIP_FALLBACK_SCREENS as readonly string[]).includes(screen);
}

export function PassengerEmbed({
  context,
  liveData = null,
}: {
  context: EmbedContext;
  liveData?: PassengerEmbedLiveData;
}) {
  if (context.state !== "handoff") {
    return renderIdentitySurface(context);
  }

  if (
    context.screen === "book" &&
    !context.requestedScreen &&
    !context.handoff.apiKey &&
    !context.handoff.partnerUserRef
  ) {
    return <HandoffScreen context={context} />;
  }

  if (isFallbackScreen(context.screen)) {
    return <FallbackTripScreen context={context} screen={context.screen} />;
  }

  switch (context.screen) {
    case "trip":
      return <TripScreen context={context} liveData={liveData} />;
    case "trips":
      return <TripsScreen context={context} liveData={liveData} />;
    case "receipt":
      return <ReceiptScreen context={context} liveData={liveData} />;
    case "completed":
      return (
        <OutcomeScreen context={context} kind="completed" liveData={liveData} />
      );
    case "cancelled":
      return (
        <OutcomeScreen context={context} kind="cancelled" liveData={liveData} />
      );
    case "nosupply":
    case "ineligible":
    case "denied":
    case "degraded":
      return <NegativeScreen context={context} kind={context.screen} />;
    default:
      return <BookScreen context={context} />;
  }
}
