"use client";
import {
  ReferralFirstFeeDisclosure,
  ReferralOrderFeeDisclosure,
  ReferralFeeDisclosureReader,
} from "./referral-fee-disclosure";
import {
  PASSENGER_FEE_DISCLOSURE_VERSION,
  PASSENGER_FEE_CONTENT_HASH,
  PASSENGER_FEE_ROWS,
  PASSENGER_FREE_CANCELLATION_NOTICE,
  type ReferralFeeStatus,
} from "@drts/contracts";
import { ReferralComplaintPanel } from "./referral-complaint-panel";
import { ReferralPlaceField } from "./referral-place-field";
import { ReferralReceiptDocumentActions } from "./referral-receipt-document-actions";
import { useReferralLiveTrip } from "./use-referral-live-trip";
import {
  ReferralLiveTrackingPanel,
  referralLiveArrival,
  referralLiveMinutes,
} from "./referral-live-tracking";

import Link from "next/link";
import { ExternalPaymentSim } from "./external-payment-sim";
import {
  type ChangeEvent,
  type ReactNode,
  useEffect,
  useState,
  useRef,
  useTransition,
} from "react";
import type {
  CreateReferralPassengerBookingCommand,
  ReferralPassengerActiveTripResult,
  ReferralPassengerHistoryItem,
  ReferralPassengerReceipt,
  ReferralPassengerFareQuote,
  ReferralPassengerRatingResult,
  SubmitReferralPassengerRatingCommand,
} from "@drts/contracts";
import type { EmbedContext } from "../lib/embed-context";
import { useTranslation } from "../lib/i18n";
import {
  EMBED_TRIP_FALLBACK_PROGRESS,
  EMBED_TRIP_FALLBACK_SCREENS,
  embedResident,
  embedSavedPlaces,
  embedTrip,
  embedTripFallbackStates,
  embedVehicles,
  type EmbedTripFallbackScreen,
} from "../lib/embed-fixtures";
import { buildEmbedTheme, getEntryHost } from "../lib/embed-presentation";

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

const [REFERRAL_CANCELLATION_FEE_LABEL, REFERRAL_CANCELLATION_FEE_VALUE] =
  PASSENGER_FEE_ROWS[2];
const REFERRAL_SUPPORT_PHONE = "02-2944-0985";
const REFERRAL_AUTHORITY_PHONE = "1999";
const DEMO_PASSENGER_PHONE = "0912345820";

class ReferralUiError extends Error {}
function referralUiMessage(code: unknown, booking = false) {
  if (["FARE_QUOTE_EXPIRED", "FARE_QUOTE_NOT_FOUND"].includes(String(code)))
    return "原車資試算已失效，請重新試算後確認叫車。";
  if (code === "FARE_QUOTE_MISMATCH")
    return "行程內容已變更，請重新試算後確認叫車。";
  if (
    [
      "UNAUTHORIZED",
      "REFERRAL_SESSION_INVALID",
      "REFERRAL_SESSION_REQUIRED",
      "REFERRAL_SESSION_EXPIRED",
      "REFERRAL_HANDOFF_REVOKED",
      "REFERRAL_CONSENT_REQUIRED",
    ].includes(String(code))
  )
    return booking
      ? "請重新驗證身分，再重送原叫車要求；原要求已保留。"
      : "請重新驗證身分及同意事項後再試算。";
  if (code === "SERVICE_AREA_NOT_SERVICEABLE")
    return "目前無法提供這段路線的服務，請調整上下車地點後重新試算。";
  if (code === "VALIDATION_ERROR")
    return "請檢查行程、用車時間與聯絡資料後再試一次。";
  return booking
    ? "尚未確認叫車結果，請重送原叫車要求；系統會保留原要求以避免重複叫車。"
    : "目前無法試算車資，請稍後點選重新試算。";
}
function validRecovery(saved: any, scope: string, entrySlug: string) {
  const fields = [
    "passengerName",
    "passengerPhone",
    "pickupAddress",
    "dropoffAddress",
    "scheduledAt",
    "vehicleType",
  ];
  const command = saved?.command;
  return (
    saved?.scope === scope &&
    saved?.form &&
    fields.every(
      (k) => typeof saved.form[k] === "string" && saved.form[k].length <= 500,
    ) &&
    command?.entrySlug === entrySlug &&
    typeof command.quoteId === "string" &&
    command.quoteId.length > 0 &&
    command.quoteId.length <= 100 &&
    typeof command.idempotencyKey === "string" &&
    command.idempotencyKey.trim().length > 0 &&
    command.idempotencyKey.length <= 255 &&
    ["pickupAddress", "dropoffAddress"].every(
      (k) =>
        typeof command[k] === "string" &&
        command[k].trim().length > 0 &&
        command[k].length <= 500,
    ) &&
    [
      "vehicleType",
      "scheduledAt",
      "passengerName",
      "passengerPhone",
      "partnerUserRef",
    ].every(
      (k) =>
        command[k] === undefined ||
        (typeof command[k] === "string" && command[k].length <= 500),
    ) &&
    (command.feeDisclosureVersion === undefined ||
      (typeof command.feeDisclosureVersion === "string" &&
        command.feeDisclosureVersion.length <= 100)) &&
    (command.feeConfirmed === undefined ||
      typeof command.feeConfirmed === "boolean") &&
    Object.keys(command).every((k) =>
      [
        "entrySlug",
        "quoteId",
        "idempotencyKey",
        "pickupAddress",
        "dropoffAddress",
        "vehicleType",
        "scheduledAt",
        "passengerName",
        "passengerPhone",
        "partnerUserRef",
        "feeDisclosureVersion",
        "feeConfirmed",
      ].includes(k),
    )
  );
}

function createInitialBookingForm(): BookingFormState {
  return {
    passengerName: embedResident.name,
    passengerPhone: DEMO_PASSENGER_PHONE,
    pickupAddress: "新北市板橋區縣民大道二段7號",
    dropoffAddress: "臺北市信義區市府路1號",
    scheduledAt: "現在出發",
    vehicleType: embedVehicles[1]?.code ?? embedVehicles[0]?.code ?? "standard",
  };
}

function formatShortDateTime(
  value: string | null | undefined,
  timeZone?: "Asia/Taipei",
) {
  if (!value) return "時間待更新";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (timeZone) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((value) => value.type === type)!.value;
    return `${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
  }
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hours}:${minutes}`;
}

function formatFare(amount: number | null | undefined) {
  return amount === null || amount === undefined ? "—" : `NT$ ${amount}`;
}

/**
 * The passenger's chosen vehicle class (from the trip's quote) rather than
 * the service product code the trip APIs report as vehicleType.
 */
function vehicleClassLabel(
  t: (key: string) => string,
  reported: string | null | undefined,
  quoted: string | null | undefined,
) {
  const known = (code: string | null | undefined) =>
    code && embedVehicles.some((vehicle) => vehicle.code === code)
      ? t(`embed.vehicle.${code}.name`)
      : null;
  return (
    known(quoted) ??
    known(reported) ??
    (reported === "enterprise_dispatch" ? "商務派車" : (reported ?? ""))
  );
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
  bookingIntentKey?: string,
): Omit<CreateReferralPassengerBookingCommand, "quoteId"> {
  const sanitizedPhone = form.passengerPhone.replace(/[^\d+]/g, "");
  const command: Omit<CreateReferralPassengerBookingCommand, "quoteId"> = {
    entrySlug: context.entry.entrySlug,
    pickupAddress: form.pickupAddress.trim(),
    dropoffAddress: form.dropoffAddress.trim(),
    vehicleType: form.vehicleType,
    idempotencyKey:
      bookingIntentKey ?? createIdempotencyKey("referral-booking"),
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
    <a href={href} data-drt-operation={dataDrtOperation} style={style}>
      {content}
    </a>
  ) : (
    <Link href={href} data-drt-operation={dataDrtOperation} style={style}>
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
  disabled = false,
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
  disabled?: boolean;
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
    <label style={{ display: "grid", gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 11.5, color: theme.muted, fontWeight: 600 }}>
        {label}
      </span>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          minWidth: 0,
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
          disabled={disabled}
          type={type}
          inputMode={inputMode}
          autoComplete={autoComplete}
          style={{
            flex: 1,
            minWidth: 0,
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
          {context.session?.identityActive
            ? "工作階段已驗證"
            : "請建立叫車工作階段"}
        </Pill>
      </div>

      <Card
        theme={theme}
        title="合作入口與叫車身分"
        subtitle="身分以目前已驗證工作階段為準"
      >
        <TokenRow
          theme={theme}
          ok={Boolean(context.session?.identityActive)}
          label="叫車身分"
          code="partner_session"
          value={
            context.session?.identityActive ? "已驗證" : "待建立或重新驗證"
          }
        />
        <TokenRow
          theme={theme}
          ok
          label="合作入口"
          code="partner_entry"
          value={context.strings.displayName}
        />
        <TokenRow
          theme={theme}
          ok
          label="入口宿主"
          code="entry_host"
          value={getEntryHost(context.entry)}
        />
        <DetailRow
          theme={theme}
          label="參照"
          value={context.session?.handoffId ?? "尚未建立"}
          mono
          strong
          last
        />
      </Card>

      <Banner theme={theme} tone="primary" icon="bolt">
        由 {context.strings.appName}{" "}
        安全帶入叫車身分；首次使用仍須確認同意事項。內嵌頁不會要求輸入帳號密碼。
      </Banner>
      <Card theme={theme}>
        <ReferralFeeDisclosureReader />
      </Card>
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
        <form
          action="/api/referral/session"
          method="POST"
          style={{ display: "contents" }}
        >
          <input type="hidden" name="action" value="grant-consent" />
          {context.session && (
            <input
              type="hidden"
              name="handoffId"
              value={context.session.handoffId}
            />
          )}
          <input
            type="hidden"
            name="entrySlug"
            value={context.entry.entrySlug}
          />
          <input
            type="hidden"
            name="entryHost"
            value={
              context.decision.requestedEntryHost ||
              context.session?.entryHost ||
              getEntryHost(context.entry)
            }
          />
          <input
            type="hidden"
            name="returnTo"
            value={buildHref(context, {
              state: "handoff",
              screen: context.session?.navigationContext?.screen ?? "book",
              ...(context.session?.navigationContext?.orderId
                ? { orderId: context.session.navigationContext.orderId }
                : {}),
            })}
          />
          <ActionButton type="submit" label="同意並開始" theme={theme} />
          <ActionButton
            href={buildHref(context, { state: "fallback" })}
            label="暫不使用"
            theme={theme}
            variant="ghost"
          />
        </form>
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
  const fallbackEntry = context.fallbackEntry;
  const sourceLabel = `${context.strings.displayName} · ${context.entry.entrySlug}`;

  return (
    <AppShell
      context={context}
      badgeTone="neutral"
      footer={
        <>
          {fallbackEntry ? (
            <ActionButton
              href={fallbackEntry.url}
              label="前往獨立叫車網站"
              theme={theme}
              iconRight="ext"
            />
          ) : null}
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
        posture={
          fallbackEntry
            ? "fallback_to_web · 改用網站"
            : "fallback_unavailable · 尚無替代入口"
        }
      />
      {fallbackEntry ? (
        <>
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
              value={fallbackEntry.hostLabel}
              mono
            />
            <DetailRow theme={theme} label="驗證方式" value="手機簡訊 OTP" />
            <DetailRow theme={theme} label="來源" value={sourceLabel} last />
          </Card>
        </>
      ) : (
        <Card theme={theme} title="目前沒有可用的替代入口">
          <div style={{ fontSize: 13, lineHeight: 1.6, color: theme.ink2 }}>
            此入口尚未設定可用的獨立叫車網站，暫時無法在此完成叫車。請透過{" "}
            <b>{context.strings.displayName}</b>{" "}
            的社區窗口協助，或稍後點選「回社區 App」再試一次。
          </div>
          <DetailRow
            theme={theme}
            label="來源入口"
            value={sourceLabel}
            mono
            last
          />
        </Card>
      )}
      <Card theme={theme}>
        <DetailRow
          theme={theme}
          label="客服專線"
          value={REFERRAL_SUPPORT_PHONE}
          mono
          last
        />
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
  if (
    !response.ok ||
    !payload?.ok ||
    (payload.session?.identityActive !== true &&
      typeof payload.nextPath !== "string")
  )
    throw new Error("無法建立安全叫車工作階段，請重新從合作入口進入。");
  return {
    nextPath: typeof payload.nextPath === "string" ? payload.nextPath : null,
    ready: payload.session?.identityActive === true,
  };
}

export function BookScreen({ context }: { context: EmbedContext }) {
  const scope =
    context.session?.recoveryScope ??
    context.session?.handoffId ??
    `unverified:${context.entry.entrySlug}`;
  return <ReferralBookingForm key={scope} context={context} />;
}

function ReferralBookingForm({ context }: { context: EmbedContext }) {
  const theme = buildEmbedTheme(context.accent);
  const { t } = useTranslation();
  const scope =
    context.session?.recoveryScope ??
    context.session?.handoffId ??
    `unverified:${context.entry.entrySlug}`;
  const [storedForm, setForm] = useState<BookingFormState>(
    createInitialBookingForm,
  );
  const [formScope, setFormScope] = useState(scope);
  const form = formScope === scope ? storedForm : createInitialBookingForm();
  const [error, setError] = useState<string | null>(null);
  const [readyScope, setReadyScope] = useState(
    context.session?.identityActive ? scope : null,
  );
  const bootstrapped = readyScope === scope;
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inFlightForScope = useRef(false);
  const mountedUi = useRef(false);
  const [isMounted, setIsMounted] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [quote, setQuote] = useState<ReferralPassengerFareQuote | null>(null);
  const mapConfig = context.map ?? null;
  const [quoteState, setQuoteState] = useState<
    "idle" | "loading" | "quoted" | "expired" | "error"
  >("idle");
  const [refreshQuote, setRefreshQuote] = useState(0);
  const [feeStatus, setFeeStatus] = useState<ReferralFeeStatus | null>(null);
  const [feeError, setFeeError] = useState<string | null>(null);
  const [feeBusy, setFeeBusy] = useState(false);
  const [feeRefresh, setFeeRefresh] = useState(0);
  const [confirmedQuoteId, setConfirmedQuoteId] = useState<string | null>(null);
  const feeReady =
    feeStatus?.disclosureVersion === PASSENGER_FEE_DISCLOSURE_VERSION &&
    feeStatus.contentHash === PASSENGER_FEE_CONTENT_HASH &&
    !!feeStatus.acknowledgedAt;

  const [recovery, setRecovery] = useState<{
    scope: string;
    command: CreateReferralPassengerBookingCommand;
    form: BookingFormState;
  } | null>(null);
  const intentKey = useRef(createIdempotencyKey("referral-booking")),
    quotedIntent = useRef(""),
    quotedScope = useRef("");
  const storageKey = `referral.booking.recovery.v1:${scope}`;
  const pendingCommand = recovery?.scope === scope ? recovery.command : null;
  const normalizedScheduledAt = parseScheduledAt(form.scheduledAt);
  const validTime =
    !normalizedScheduledAt ||
    Number.isFinite(Date.parse(normalizedScheduledAt));
  const quoteIntent = JSON.stringify([
    context.entry.entrySlug,
    form.pickupAddress.trim(),
    form.dropoffAddress.trim(),
    normalizedScheduledAt ?? null,
    form.vehicleType,
  ]);

  useEffect(() => {
    mountedUi.current = true;
    setIsMounted(true);
    return () => {
      mountedUi.current = false;
    };
  }, []);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      const saved = raw ? JSON.parse(raw) : null;
      if (validRecovery(saved, scope, context.entry.entrySlug)) {
        setRecovery(saved);
        setForm(saved.form);
      } else {
        setRecovery(null);
        setForm(createInitialBookingForm());
      }
    } catch {
      setRecovery(null);
      setForm(createInitialBookingForm());
    }
    setFormScope(scope);
    setRecoveryReady(true);
  }, [storageKey, scope, context.entry.entrySlug]);
  useEffect(() => {
    if (context.session?.identityActive) {
      setReadyScope(scope);
      return;
    }
    if (bootstrapped) return;
    let active = true;
    void bootstrapDemoSession(context)
      .then((result) => {
        if (!active) return;
        if (result.nextPath) {
          window.location.assign(result.nextPath);
        } else if (result.ready) {
          // A new server cookie is not this form's canonical public context.
          // Re-read SSR before quote/create so an unknown ACK is always stored
          // under the authenticated recovery scope, never unverified:entry.
          window.location.assign(
            buildHref(context, { screen: "book", state: "handoff" }),
          );
        }
      })
      .catch((cause) => {
        if (active)
          setBootstrapError(
            cause instanceof Error ? cause.message : "無法建立工作階段",
          );
      });
    return () => {
      active = false;
    };
  }, [bootstrapped, context, scope]);
  useEffect(() => {
    if (!bootstrapped) return;
    let current = true;
    const controller = new AbortController();
    void fetch("/api/referral/fees", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        const status = body?.data;
        if (
          !response.ok ||
          !body?.ok ||
          status?.disclosureVersion !== PASSENGER_FEE_DISCLOSURE_VERSION ||
          status?.contentHash !== PASSENGER_FEE_CONTENT_HASH ||
          !(
            status.acknowledgedAt === null ||
            (typeof status.acknowledgedAt === "string" &&
              Number.isFinite(Date.parse(status.acknowledgedAt)))
          )
        )
          throw new Error("無法讀取目前費用同意紀錄，請重新讀取。");
        if (current) {
          setFeeStatus(status);
          setFeeError(null);
        }
      })
      .catch(() => {
        if (current) setFeeError("無法讀取目前費用同意紀錄，請重新讀取。");
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [bootstrapped, scope, feeRefresh]);

  async function agreeFees() {
    if (!feeStatus || feeBusy) return;
    setFeeBusy(true);
    setFeeError(null);
    try {
      const response = await fetch("/api/referral/fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          disclosureVersion: feeStatus.disclosureVersion,
          acknowledged: true,
        }),
      });
      const ack = await response.json();
      if (
        !response.ok ||
        !ack?.ok ||
        ack.data?.disclosureVersion !== PASSENGER_FEE_DISCLOSURE_VERSION ||
        ack.data?.contentHash !== PASSENGER_FEE_CONTENT_HASH ||
        !Number.isFinite(Date.parse(ack.data?.acknowledgedAt))
      )
        throw new Error("費用同意尚未確認，請以原版本重新確認。");
      const read = await fetch("/api/referral/fees", { cache: "no-store" });
      const body = await read.json();
      if (
        !read.ok ||
        !body?.ok ||
        body.data?.disclosureVersion !== ack.data.disclosureVersion ||
        body.data?.contentHash !== ack.data.contentHash ||
        body.data?.acknowledgedAt !== ack.data.acknowledgedAt
      )
        throw new Error("費用同意回讀尚未確認，請重新讀取。");
      if (mountedUi.current) setFeeStatus(body.data);
    } catch (cause) {
      if (mountedUi.current)
        setFeeError(
          cause instanceof Error ? cause.message : "費用同意尚未確認。",
        );
    } finally {
      if (mountedUi.current) setFeeBusy(false);
    }
  }

  useEffect(() => {
    setQuote(null);
    setConfirmedQuoteId(null);
    if (
      !feeReady ||
      !bootstrapped ||
      !recoveryReady ||
      pendingCommand ||
      !validTime ||
      !form.pickupAddress.trim() ||
      !form.dropoffAddress.trim()
    ) {
      setQuoteState("idle");
      return;
    }
    const controller = new AbortController();
    let active = true;
    setQuoteState("loading");
    void fetch("/api/referral/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        entrySlug: context.entry.entrySlug,
        pickupAddress: form.pickupAddress.trim(),
        dropoffAddress: form.dropoffAddress.trim(),
        vehicleType: form.vehicleType,
        ...(normalizedScheduledAt
          ? { scheduledAt: normalizedScheduledAt }
          : {}),
      }),
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body?.ok)
          throw new Error(
            String(body?.error?.code || "FARE_QUOTE_UNAVAILABLE"),
          );
        return body.data as ReferralPassengerFareQuote;
      })
      .then((result) => {
        if (!active) return;
        if (
          !result?.quoteId ||
          result.feeDisclosureVersion !== PASSENGER_FEE_DISCLOSURE_VERSION ||
          result.feeContentHash !== PASSENGER_FEE_CONTENT_HASH ||
          result.fixedPrice !== false ||
          result.isGuaranteed !== false ||
          !Number.isSafeInteger(result.estimatedMin) ||
          !Number.isSafeInteger(result.estimatedMax) ||
          result.estimatedMin < 0 ||
          result.estimatedMax < result.estimatedMin ||
          !Number.isFinite(Date.parse(result.expiresAt))
        )
          throw new Error("FARE_QUOTE_UNAVAILABLE");
        quotedIntent.current = quoteIntent;
        quotedScope.current = scope;
        setQuote(result);
        setQuoteState(
          Date.parse(result.expiresAt) > Date.now() ? "quoted" : "expired",
        );
        intentKey.current = createIdempotencyKey("referral-booking");
        setError(null);
      })
      .catch((cause) => {
        if (active) {
          setQuoteState("error");
          setError(
            referralUiMessage(cause instanceof Error ? cause.message : null),
          );
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    quoteIntent,
    scope,
    bootstrapped,
    recoveryReady,
    pendingCommand,
    refreshQuote,
    feeReady,
  ]);
  useEffect(() => {
    if (!quote || quoteState !== "quoted") return;
    const timer = setTimeout(
      () => setQuoteState("expired"),
      Math.max(0, Date.parse(quote.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [quote, quoteState]);

  function setAddressField(
    name: "pickupAddress" | "dropoffAddress",
    value: string,
  ) {
    setQuote(null);
    setQuoteState("idle");
    setForm((current) => ({ ...current, [name]: value }));
  }
  function updateField(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.currentTarget;
    if (["pickupAddress", "dropoffAddress", "scheduledAt"].includes(name)) {
      setQuote(null);
      setQuoteState("idle");
    }
    setForm((current) => ({ ...current, [name]: value }));
  }
  function handleSubmit() {
    if (
      !isMounted ||
      !recoveryReady ||
      inFlightForScope.current ||
      (!pendingCommand &&
        (!feeReady ||
          !quote ||
          confirmedQuoteId !== quote.quoteId ||
          quoteState !== "quoted" ||
          quotedIntent.current !== quoteIntent ||
          quotedScope.current !== scope ||
          Date.parse(quote.expiresAt) <= Date.now()))
    )
      return;
    const command = pendingCommand ?? {
      ...buildBookingCommand(context, form, intentKey.current),
      quoteId: quote!.quoteId,
      feeDisclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
      feeConfirmed: true,
    };
    const saved = { scope, command, form };
    setRecovery(saved);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(saved));
    } catch {
      /* Keep this exact intent in memory if storage is unavailable. */
    }
    // A new account/entry gets a keyed form instance; late replies belong only
    // to this mounted original instance and cannot settle a later screen.
    const ownsCurrentUi = () => mountedUi.current;
    inFlightForScope.current = true;
    startTransition(async () => {
      try {
        setError(null);
        const response = await fetch("/api/referral/booking", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": command.idempotencyKey!,
          },
          body: JSON.stringify(command),
        });
        const payload = await response.json().catch(() => null);
        if (!ownsCurrentUi()) return; // Keep original stored intent for its original owner; never redirect a new screen.
        if (!response.ok || !payload?.ok) {
          const code = payload?.error?.code;
          // Only definite pre-commit input/quote rejection permits a new intent.
          if (
            [
              "FARE_QUOTE_EXPIRED",
              "FARE_QUOTE_MISMATCH",
              "FEE_DISCLOSURE_CHANGED",
              "FEE_CONFIRMATION_REQUIRED",
              "FEE_DISCLOSURE_REQUIRED",
              "VALIDATION_ERROR",
            ].includes(code)
          ) {
            try {
              sessionStorage.removeItem(storageKey);
            } catch {
              /* Retain the in-memory result when per-tab storage is unavailable. */
            }
            setRecovery(null);
            setQuote(null);
            setQuoteState("expired");
          }
          throw new ReferralUiError(referralUiMessage(code, true));
        }
        if (
          typeof payload.data?.orderId !== "string" ||
          payload.data?.quote?.quoteId !== command.quoteId ||
          !payload.data.confirmedAt ||
          (command.feeConfirmed === true &&
            (payload.data.quote?.feeDisclosureVersion !==
              command.feeDisclosureVersion ||
              typeof payload.data.quote?.feeContentHash !== "string" ||
              !/^[a-f0-9]{64}$/.test(payload.data.quote.feeContentHash) ||
              (command.feeDisclosureVersion ===
                PASSENGER_FEE_DISCLOSURE_VERSION &&
                payload.data.quote.feeContentHash !==
                  PASSENGER_FEE_CONTENT_HASH) ||
              payload.data.feeConfirmation?.orderId !== payload.data.orderId ||
              payload.data.feeConfirmation?.quoteId !== command.quoteId ||
              payload.data.feeConfirmation?.disclosureVersion !==
                command.feeDisclosureVersion ||
              payload.data.feeConfirmation?.contentHash !==
                payload.data.quote.feeContentHash ||
              !Number.isFinite(
                Date.parse(payload.data.feeConfirmation?.feeConfirmedAt),
              )))
        )
          throw new ReferralUiError(referralUiMessage(null, true));
        try {
          sessionStorage.removeItem(storageKey);
        } catch {
          /* Retain the in-memory result when per-tab storage is unavailable. */
        }
        window.location.assign(
          buildHref(context, {
            screen: "trip",
            state: "handoff",
            orderId: payload.data.orderId,
          }),
        );
      } catch (cause) {
        if (!ownsCurrentUi()) return;
        setError(
          cause instanceof ReferralUiError
            ? cause.message
            : referralUiMessage(null, true),
        );
      } finally {
        if (ownsCurrentUi()) {
          inFlightForScope.current = false;
        }
      }
    });
  }
  const bookingControlsDisabled =
    !isMounted || isPending || Boolean(pendingCommand);
  const bookingSubmitDisabled =
    !isMounted ||
    !recoveryReady ||
    isPending ||
    (!pendingCommand &&
      (!feeReady ||
        !quote ||
        confirmedQuoteId !== quote.quoteId ||
        quoteState !== "quoted" ||
        quotedIntent.current !== quoteIntent ||
        quotedScope.current !== scope));
  const estimateLabel =
    quote && quoteState === "quoted"
      ? `約 NT$ ${quote.estimatedMin}–${quote.estimatedMax}（試算，非保證價）`
      : quoteState === "loading"
        ? "車資試算中"
        : quoteState === "expired"
          ? "試算已過期，請重新試算"
          : "車資尚未確認";
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
              {estimateLabel}
            </span>
          </div>
          {!pendingCommand &&
          (quoteState === "error" || quoteState === "expired") ? (
            <ActionButton
              label="重新試算"
              theme={theme}
              onClick={() => setRefreshQuote((n) => n + 1)}
            />
          ) : null}
          {pendingCommand ? (
            <p role="status">
              尚未確認叫車結果；重送將保留原要求，避免重複叫車。
            </p>
          ) : null}
          <ActionButton
            label={
              isPending
                ? "送出中…"
                : pendingCommand
                  ? "重送原叫車要求"
                  : "確認叫車"
            }
            theme={theme}
            variant="primary"
            iconRight="arrow"
            onClick={handleSubmit}
            disabled={bookingSubmitDisabled}
            dataDrtOperation="referral-create"
          />
        </>
      }
    >
      {!feeReady && !pendingCommand ? (
        <Card theme={theme}>
          <ReferralFirstFeeDisclosure
            status={feeStatus}
            busy={feeBusy}
            error={feeError}
            onAgree={() => {
              void agreeFees();
            }}
          />
          {feeError ? (
            <button type="button" onClick={() => setFeeRefresh((n) => n + 1)}>
              重新讀取費用同意紀錄
            </button>
          ) : null}
        </Card>
      ) : null}
      <Card theme={theme}>
        <ReferralFeeDisclosureReader />
      </Card>
      {feeReady && quote && !pendingCommand ? (
        <Card theme={theme}>
          <ReferralOrderFeeDisclosure
            quote={quote}
            pickupTimeLabel={
              quote.requestedScheduledAt
                ? Number.isFinite(Date.parse(quote.requestedScheduledAt))
                  ? t("fees.scheduledTaipei", {
                      time: formatShortDateTime(
                        quote.requestedScheduledAt,
                        "Asia/Taipei",
                      ),
                    })
                  : t("fees.timePending")
                : t("fees.now")
            }
            vehicleLabel={
              quote.vehicleType
                ? embedVehicles.some(
                    (vehicle) => vehicle.code === quote.vehicleType,
                  )
                  ? t(`embed.vehicle.${quote.vehicleType}.name`)
                  : t("fees.vehiclePending")
                : t("fees.unspecified")
            }
            checked={confirmedQuoteId === quote.quoteId}
            disabled={isPending || quoteState !== "quoted"}
            onChange={(checked) =>
              setConfirmedQuoteId(checked ? quote.quoteId : null)
            }
          />
        </Card>
      ) : null}
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
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>乘客資料</div>
          <div style={{ fontSize: 11, color: theme.muted }}>
            {context.strings.displayName}
          </div>
        </div>
        <Pill theme={theme} tone={bootstrapped ? "success" : "neutral"} dot>
          {bootstrapped ? "已驗證" : "待驗證"}
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
          <ReferralPlaceField
            theme={theme}
            label="上車地點"
            icon={<Icon name="pin" size={15} />}
            name="pickupAddress"
            value={form.pickupAddress}
            onChange={(value) => setAddressField("pickupAddress", value)}
            disabled={bookingControlsDisabled}
            allowCurrentLocation
            mapConfig={mapConfig}
          />
          <ReferralPlaceField
            theme={theme}
            label="下車地點"
            icon={<Icon name="pin" size={15} />}
            name="dropoffAddress"
            value={form.dropoffAddress}
            onChange={(value) => setAddressField("dropoffAddress", value)}
            disabled={bookingControlsDisabled}
            mapConfig={mapConfig}
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              gap: 10,
            }}
          >
            <EditableField
              theme={theme}
              label="用車時間"
              icon="clock"
              name="scheduledAt"
              value={form.scheduledAt}
              onChange={updateField}
              disabled={bookingControlsDisabled}
            />
            <EditableField
              theme={theme}
              label="乘客姓名"
              icon="user"
              name="passengerName"
              value={form.passengerName}
              onChange={updateField}
              disabled={bookingControlsDisabled}
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
              disabled={bookingControlsDisabled}
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
                  disabled={bookingControlsDisabled}
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
            href={toPhoneHref(REFERRAL_SUPPORT_PHONE)}
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
        社區叫車客服 {REFERRAL_SUPPORT_PHONE}
      </div>
    </AppShell>
  );
}

const tripStateLabel: Record<
  string,
  { zh: string; tone: "warn" | "primary" | "info" | "success" | "neutral" }
> = {
  matching: { zh: "媒合中", tone: "warn" },
  created: { zh: "媒合中", tone: "warn" },
  ready_for_dispatch: { zh: "媒合中", tone: "warn" },
  preassigned: { zh: "媒合中", tone: "warn" },
  redispatch_required: { zh: "重新媒合中", tone: "warn" },
  assigned: { zh: "已派車", tone: "primary" },
  driver_accepted: { zh: "已派車", tone: "primary" },
  enroute_pickup: { zh: "前往上車", tone: "info" },
  arrived_pickup: { zh: "司機已抵達", tone: "info" },
  on_trip: { zh: "行程中", tone: "info" },
  proof_pending: { zh: "行程中", tone: "info" },
  enroute: { zh: "前往上車", tone: "info" },
  inprogress: { zh: "行程中", tone: "info" },
  completed: { zh: "已完成", tone: "success" },
  cancelled: { zh: "已取消", tone: "neutral" },
};

const DEMO_TRIP_DISPATCHABLE = [
  "created",
  "ready_for_dispatch",
  "redispatch_required",
  "matching",
];

function demoTripMessage(code: unknown) {
  switch (code) {
    case "REFERRAL_DEMO_TRIP_SUPPLY_BUSY":
      return "測試司機都在服務其他展示行程，請稍後再試。";
    case "REFERRAL_DEMO_TRIP_SUPPLY_UNAVAILABLE":
      return "測試司機暫時無法使用，請稍後再試。";
    case "REFERRAL_DEMO_TRIP_NOT_DISPATCHABLE":
      return "這筆行程目前無法指派測試司機。";
    case "REFERRAL_DEMO_TRIP_NOT_ASSIGNED":
      return "這筆行程不是由測試司機承接，無法用測試按鈕完成。";
    case "not_found":
      return "測試功能目前未開啟。";
    default:
      return "測試操作沒有完成，請重試。";
  }
}

/** Dev demo only: drive this trip with the synthetic business test driver. */
function ReferralDemoTripControls({
  context,
  orderId,
  status,
  onAssigned,
}: {
  context: EmbedContext;
  orderId: string;
  status: string;
  onAssigned: () => void;
}) {
  const theme = buildEmbedTheme(context.accent);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = DEMO_TRIP_DISPATCHABLE.includes(status)
    ? "assign"
    : "complete";
  // live.refresh is a new function on every render; keep the latest one in a
  // ref so the heartbeat timer below depends only on the trip, or each
  // refresh-triggered render would restart it and send another heartbeat.
  const onAssignedRef = useRef(onAssigned);
  useEffect(() => {
    onAssignedRef.current = onAssigned;
  }, [onAssigned]);
  // Like the driver app, report the test driver's location every 30 s so the
  // live tracking and pickup ETA stay fresh while this demo trip is open.
  useEffect(() => {
    if (action !== "complete") return;
    let active = true;
    const beat = () =>
      void fetch(
        `/api/referral/demo-trip/${encodeURIComponent(orderId)}/heartbeat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      )
        .then((response) => {
          if (active && response.ok) onAssignedRef.current();
        })
        .catch(() => undefined);
    beat();
    const timer = globalThis.setInterval(beat, 30_000);
    return () => {
      active = false;
      globalThis.clearInterval(timer);
    };
  }, [action, orderId]);

  async function run() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/referral/demo-trip/${encodeURIComponent(orderId)}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok)
        throw new Error(demoTripMessage(payload?.error?.code));
      if (action === "complete") {
        window.location.assign(
          buildHref(context, {
            screen: "completed",
            state: "handoff",
            orderId,
          }),
        );
        return;
      }
      onAssigned();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : demoTripMessage(null));
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      data-drt-operation="referral-demo-trip"
      style={{
        display: "grid",
        gap: 9,
        padding: "12px 13px",
        borderRadius: 12,
        background: theme.warnBg,
        border: `1px dashed ${theme.warnFg}`,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, color: theme.ink }}>
        測試模式（僅供展示）
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.6, color: theme.ink2 }}>
        {action === "assign"
          ? "按下後由虛構的商務測試司機承接這筆行程，用來展示派車後的畫面；不是實際派車。"
          : "按下後以模擬的完程資料（車資依試算下限、合成完程照片）完成這筆行程，接著可展示評分與收據；不是實際載客。"}
      </div>
      <ActionButton
        label={
          pending
            ? "處理中…"
            : action === "assign"
              ? "測試：指派測試司機"
              : "測試：完成行程"
        }
        theme={theme}
        onClick={() => void run()}
        disabled={pending}
        dataDrtOperation={`referral-demo-trip-${action}`}
      />
      {error ? (
        <Banner theme={theme} tone="danger" icon="alert">
          {error}
        </Banner>
      ) : null}
    </div>
  );
}

function TripScreen({
  context,
  liveData,
}: {
  context: EmbedContext;
  liveData: PassengerEmbedLiveData;
}) {
  const { t } = useTranslation();
  const theme = buildEmbedTheme(context.accent);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestedOrderId = liveData?.selectedOrderId;
  const live = useReferralLiveTrip(
    liveData?.activeTrip?.trip,
    context.session?.recoveryScope ?? context.entry.entrySlug,
  );
  const activeTrip = live.trip;
  const isRequestedTripActive =
    !requestedOrderId || activeTrip?.orderId === requestedOrderId;
  const cancellation = activeTrip?.cancellationWindow;
  const asOf = live.cancellationServerNow;
  const deadline =
    typeof cancellation?.cancelableUntil === "string"
      ? Date.parse(cancellation.cancelableUntil)
      : null;
  const windowKnown =
    typeof cancellation?.canCancel === "boolean" &&
    Number.isFinite(asOf) &&
    (cancellation.cancelableUntil === null ||
      (deadline !== null && Number.isFinite(deadline)));
  const windowKey = `${activeTrip?.orderId ?? ""}:${cancellation?.asOf ?? ""}`;
  const [clock, setClock] = useState({ key: windowKey, now: asOf });
  const [rejectedWindow, setRejectedWindow] = useState<string | null>(null);
  const windowAnchor = useRef<{ key: string; startedAt: number } | null>(null);
  useEffect(() => {
    if (!Number.isFinite(asOf)) {
      windowAnchor.current = null;
      return;
    }
    // The snapshot is server time; elapsed time must not use the device wall clock.
    const anchor = { key: windowKey, startedAt: performance.now() };
    windowAnchor.current = anchor;
    const tick = () =>
      setClock((previous) => ({
        key: windowKey,
        now: Math.max(
          asOf + Math.max(0, performance.now() - anchor.startedAt),
          previous.key === windowKey ? previous.now : asOf,
        ),
      }));
    tick();
    const timer = globalThis.setInterval(tick, 1000);
    return () => {
      globalThis.clearInterval(timer);
      if (windowAnchor.current === anchor) windowAnchor.current = null;
    };
  }, [windowKey, asOf]);
  const observedNow = clock.key === windowKey ? clock.now : asOf;
  const isClosed =
    rejectedWindow === windowKey ||
    (windowKnown &&
      (!cancellation!.canCancel ||
        (deadline !== null && observedNow > deadline)));
  const remainingSeconds =
    deadline === null || !Number.isFinite(deadline)
      ? null
      : Math.max(0, Math.ceil((deadline - observedNow) / 1000));
  const deadlineLabel =
    windowKnown && deadline !== null
      ? new Date(deadline).toLocaleString("zh-TW", {
          timeZone: "Asia/Taipei",
          hour12: false,
        })
      : null;

  if (live.ended || (requestedOrderId && !isRequestedTripActive)) {
    return (
      <AppShell context={context} badgeTone="neutral">
        <div style={{ padding: 32, textAlign: "center", color: theme.ink }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            行程已結束或更新
          </div>
          <div style={{ fontSize: 14, color: theme.muted, marginBottom: 24 }}>
            您查詢的行程目前不在進行中，可能已完成或取消。
          </div>
          <ActionButton
            href={buildHref(context, { state: "handoff", screen: "trips" })}
            label="查看歷史行程"
            theme={theme}
          />
        </div>
      </AppShell>
    );
  }

  const trip = activeTrip
    ? {
        id: activeTrip.orderNo,
        orderId: activeTrip.orderId,
        state: normalizeTripState(activeTrip.statusCode || activeTrip.status),
        from: activeTrip.pickupAddress,
        to: activeTrip.dropoffAddress,
        win: referralLiveArrival(activeTrip, t("referralLive.pending")),
        vehicle: vehicleClassLabel(
          t,
          activeTrip.vehicleType,
          activeTrip.quote?.vehicleType,
        ),
        driver: activeTrip.driverName || "媒合中",
        plate: activeTrip.plateNumber || "待更新",
        rating: 0,
        etaMin: referralLiveMinutes(activeTrip),
        cancellationWindow: activeTrip.cancellationWindow,
        driverPhoneMasked: activeTrip.driverPhoneMasked,
        estimatedFare: activeTrip.estimatedFare,
      }
    : null;

  function handleCancel() {
    if (!trip || isClosed) return;
    const anchor = windowAnchor.current;
    const currentWindowTime =
      asOf +
      (anchor?.key === windowKey
        ? Math.max(0, performance.now() - anchor.startedAt)
        : 0);
    // Keep the exact inclusive deadline: only a strictly later instant closes it.
    if (windowKnown && deadline !== null && currentWindowTime > deadline) {
      setClock({ key: windowKey, now: currentWindowTime });
      return;
    }
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
          if (
            response.status === 409 &&
            payload?.error?.code === "ORDER_NOT_CANCELABLE"
          ) {
            setRejectedWindow(windowKey);
          }
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
            href={toPhoneHref(REFERRAL_SUPPORT_PHONE)}
            label="客服協助聯絡司機"
            theme={theme}
            variant="default"
            icon="phone"
          />
          <ActionButton
            label={isPending ? "取消中…" : "取消行程"}
            theme={theme}
            variant="danger"
            onClick={handleCancel}
            disabled={isPending || isClosed}
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

      <Card theme={theme}>
        <DetailRow
          theme={theme}
          label="費用確認時間"
          value={
            activeTrip?.feeConfirmation?.feeConfirmedAt
              ? formatShortDateTime(
                  activeTrip.feeConfirmation.feeConfirmedAt,
                  "Asia/Taipei",
                )
              : "未提供確認紀錄"
          }
          last
        />
      </Card>
      <Card theme={theme} accent={theme.primary}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <span style={{ flexShrink: 0 }}>
            <Pill theme={theme} tone={state.tone} dot>
              {state.zh}
            </Pill>
          </span>
          <span
            style={{
              fontSize: 11,
              color: theme.faint,
              fontFamily: theme.mono,
              minWidth: 0,
              marginLeft: 10,
              textAlign: "right",
              wordBreak: "break-all",
            }}
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
              {trip.etaMin ?? "待更新"}
            </div>
            <div style={{ fontSize: 10, color: theme.muted, marginTop: 3 }}>
              分鐘 · 估計
            </div>
          </div>
        </div>
      </Card>

      {context.demoTrip ? (
        <ReferralDemoTripControls
          context={context}
          orderId={trip.orderId}
          status={trip.state}
          onAssigned={live.refresh}
        />
      ) : null}

      <div
        data-drt-operation="referral-cancellation-window"
        style={{ fontSize: 12, color: theme.muted, lineHeight: 1.6 }}
      >
        {isClosed
          ? "目前已無法取消此行程，請以最新行程狀態為準。"
          : !windowKnown
            ? "目前未提供取消時段資訊，送出後由系統確認。"
            : deadlineLabel
              ? `可取消至 ${deadlineLabel}（台灣時間；剩餘 ${remainingSeconds} 秒）。送出時仍由系統確認行程狀態。`
              : "目前可提出取消，系統未提供固定截止時間；送出時仍由系統確認行程狀態。"}
        {windowKnown ? (
          <div>
            查詢時間：
            <time dateTime={cancellation!.asOf}>
              {new Date(cancellation!.asOf).toLocaleString("zh-TW", {
                timeZone: "Asia/Taipei",
                hour12: false,
              })}
            </time>
            （台灣時間）
          </div>
        ) : null}
      </div>

      <ReferralLiveTrackingPanel
        trip={activeTrip!}
        error={live.error}
        refresh={live.refresh}
        theme={theme}
        mapConfig={context.map}
      />

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
            label={
              ["inprogress", "on_trip", "proof_pending"].includes(trip.state)
                ? "預計抵達"
                : "預計上車"
            }
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

const NON_COMPLETED_TERMINAL_STATUSES = [
  "cancelled",
  "dispatch_failed",
  "dispatch_timeout",
  "no_supply",
];

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
      date: formatShortDateTime(
        trip.status === "cancelled"
          ? trip.cancelledAt
          : trip.completedAt || trip.createdAt,
        "Asia/Taipei",
      ),
      feeConfirmedAt: trip.feeConfirmation?.feeConfirmedAt ?? null,
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
          本工作階段行程
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
              screen:
                trip.state === "completed"
                  ? "completed"
                  : NON_COMPLETED_TERMINAL_STATUSES.includes(trip.state)
                    ? "cancelled"
                    : "trip",
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
                  <div>
                    費用確認時間：
                    {trip.feeConfirmedAt
                      ? formatShortDateTime(trip.feeConfirmedAt, "Asia/Taipei")
                      : "未提供確認紀錄"}
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
  const { t } = useTranslation();
  const theme = buildEmbedTheme(context.accent);
  // Only a genuinely completed trip gets the "trip completed" receipt: the
  // API returns whatever the order's current status is, and this screen must
  // not relabel a cancelled/no-supply/dispatch-failed order as completed just
  // because a receipt object came back.
  const receipt =
    liveData?.receipt && liveData.receipt.status === "completed"
      ? {
          id: liveData.receipt.orderNo,
          orderId: liveData.receipt.orderId,
          date: formatShortDateTime(
            liveData.receipt.completedAt,
            "Asia/Taipei",
          ),
          from: liveData.receipt.pickupAddress,
          to: liveData.receipt.dropoffAddress,
          vehicle: vehicleClassLabel(
            t,
            liveData.receipt.vehicleType,
            liveData.receipt.quote?.vehicleType,
          ),
          driver: liveData.receipt.driverName || "資料未提供",
          plate: liveData.receipt.plateNumber || "待更新",
          passenger: liveData.receipt.passengerNameMasked,
          maskedPhone: liveData.receipt.passengerPhoneMasked,
          fareBase: formatFare(liveData.receipt.fareBase),
          fareDistance: formatFare(liveData.receipt.fareDistance),
          fareTime: formatFare(liveData.receipt.fareTime),
          fareNight: formatFare(liveData.receipt.fareNight),
          total: liveData.receipt.formattedTotal,
          actualFare: liveData.receipt.totalFare,
          payment: liveData.receipt.paymentChannel,
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
      <Card theme={theme}>
        <DetailRow
          theme={theme}
          label="費用確認時間"
          value={
            liveData?.receipt?.feeConfirmation?.feeConfirmedAt
              ? formatShortDateTime(
                  liveData.receipt.feeConfirmation.feeConfirmedAt,
                  "Asia/Taipei",
                )
              : "未提供確認紀錄"
          }
          last
        />
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
        <DetailRow theme={theme} label="客服" value={REFERRAL_SUPPORT_PHONE} />
        <DetailRow
          theme={theme}
          label="主管機關"
          value={REFERRAL_AUTHORITY_PHONE}
        />
      </Card>
      <Banner theme={theme} tone="neutral" icon="info">
        本頁為乘車紀錄，非正式稅務憑證；付款及結算狀態以實際通知為準。
      </Banner>
      <Card
        theme={theme}
        title="已記錄費用分項"
        subtitle="未提供的分項不以估算補齊，合計依實際車資"
      >
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
          label="夜間費"
          value={receipt.fareNight}
          mono
        />
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
      <ReferralReceiptDocumentActions
        key={`referral-pdf:${receipt.orderId}`}
        orderId={receipt.orderId}
      />
      <ExternalPaymentSim
        key={receipt.orderId}
        orderId={receipt.orderId}
        actualFare={receipt.actualFare}
        accent={context.accent}
        returnHref={buildHref(context, {
          screen: "completed",
          state: "handoff",
          orderId: receipt.orderId,
        })}
      />
    </AppShell>
  );
}

// Existing PassengerAPP RatingCard display options, reused as UI labels only.
// These do not define a new backend or business classification policy.
const REFERRAL_RATING_TAG_OPTIONS = [
  "車內整潔",
  "駕駛親切",
  "路線順暢",
  "準時到達",
  "駕駛態度",
  "車內氣味",
  "繞路",
  "遲到",
  "駕駛違規",
] as const;

function OutcomeScreen({
  context,
  kind,
  liveData,
}: {
  context: EmbedContext;
  kind: "completed" | "cancelled";
  liveData: PassengerEmbedLiveData;
}) {
  const mountedRatingUi = useRef(false);
  useEffect(() => {
    mountedRatingUi.current = true;
    return () => {
      mountedRatingUi.current = false;
    };
  }, []);
  const theme = buildEmbedTheme(context.accent);
  const completed = kind === "completed";
  const [score, setScore] = useState<number | null>(null);
  const [ratingMessage, setRatingMessage] = useState<string | null>(null);
  const [contactRequested, setContactRequested] = useState(true);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [ratingReceipt, setRatingReceipt] =
    useState<ReferralPassengerRatingResult | null>(null);
  const [pendingRating, setPendingRating] =
    useState<SubmitReferralPassengerRatingCommand | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const trip = liveData?.history?.items.find(
    (item) =>
      (!liveData.selectedOrderId ||
        item.orderId === liveData.selectedOrderId) &&
      (completed
        ? item.status === "completed"
        : NON_COMPLETED_TERMINAL_STATUSES.includes(item.status)),
  );

  const submitted =
    trip?.rating ??
    (ratingReceipt?.orderId === trip?.orderId ? ratingReceipt : null);
  const ratingStorageKey = `referral.rating.recovery.v1:${context.session?.recoveryScope ?? context.session?.handoffId ?? "unverified"}:${trip?.orderId ?? "none"}`;
  const originalRating =
    pendingRating?.orderId === trip?.orderId ? pendingRating : null;
  useEffect(() => {
    setScore(null);
    setContactRequested(true);
    setSelectedTags([]);
    setComment("");
    setRatingReceipt(null);
    setRatingMessage(null);
    setError(null);
    setPendingRating(null);
    if (!trip) return;
    try {
      if (trip.rating) {
        sessionStorage.removeItem(ratingStorageKey);
        return;
      }
      const saved = JSON.parse(
        sessionStorage.getItem(ratingStorageKey) ?? "null",
      );
      if (
        saved?.orderId === trip.orderId &&
        Number.isInteger(saved.score) &&
        saved.score >= 1 &&
        saved.score <= 5 &&
        typeof saved.contactRequested === "boolean" &&
        typeof saved.idempotencyKey === "string" &&
        saved.idempotencyKey.length <= 255 &&
        (saved.tags === undefined ||
          (Array.isArray(saved.tags) &&
            saved.tags.length <= 10 &&
            saved.tags.every(
              (tag: unknown) => typeof tag === "string" && tag.length <= 100,
            ))) &&
        // Preserve an existing valid original command; the UI's 200-character
        // input does not narrow the existing API's 2000-character contract.
        (saved.comment === undefined ||
          (typeof saved.comment === "string" &&
            saved.comment.length <= 2000)) &&
        Object.keys(saved).every((k) =>
          [
            "orderId",
            "score",
            "contactRequested",
            "idempotencyKey",
            "tags",
            "comment",
          ].includes(k),
        )
      ) {
        setPendingRating(saved);
        setScore(saved.score);
        setContactRequested(saved.contactRequested);
        setSelectedTags(saved.tags ?? []);
        setComment(saved.comment ?? "");
      }
    } catch {
      /* An invalid local draft grants no identity or rating authority. */
    }
  }, [trip?.orderId, trip?.rating, ratingStorageKey]);
  if (!trip) return <TripsScreen context={context} liveData={liveData} />;

  function submitRating(nextScore: number) {
    if (!trip || submitted || isPending) return;
    const command: SubmitReferralPassengerRatingCommand = originalRating ?? {
      orderId: trip.orderId,
      score: nextScore as 1 | 2 | 3 | 4 | 5,
      contactRequested: nextScore <= 2 ? contactRequested : false,
      ...(selectedTags.length ? { tags: [...selectedTags] } : {}),
      ...(comment ? { comment } : {}),
      idempotencyKey: createIdempotencyKey("referral-rating"),
    };
    setPendingRating(command);
    try {
      sessionStorage.setItem(ratingStorageKey, JSON.stringify(command));
    } catch {
      /* Original command remains in memory. */
    }
    startTransition(async () => {
      try {
        setError(null);
        const response = await fetch(
          `/api/referral/rating/${encodeURIComponent(trip.orderId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(command),
          },
        );
        const payload = await response.json().catch(() => null);
        if (!mountedRatingUi.current) return;
        if (!response.ok || !payload?.ok) {
          throw new ReferralUiError(
            payload?.error?.code === "PASSENGER_RATING_ALREADY_SUBMITTED"
              ? "本行程已有評分，請重新讀取本行程確認原評分。"
              : "尚未確認評分結果，請重送原評分或重新讀取本行程。",
          );
        }
        const expectedTags = [
          ...new Set(
            (command.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
          ),
        ].sort();
        if (
          payload.data?.orderId !== trip.orderId ||
          payload.data?.score !== command.score ||
          payload.data?.contactRequested !== command.contactRequested ||
          JSON.stringify([...(payload.data?.tags ?? [])].sort()) !==
            JSON.stringify(expectedTags) ||
          (payload.data?.comment ?? null) !==
            (command.comment?.trim() || null) ||
          (command.score <= 2 && !payload.data.complaintCaseNo)
        )
          throw new ReferralUiError("評分尚未取得同單回執，請重送原評分。");
        setRatingReceipt(payload.data);
        setScore(command.score);
        setPendingRating(null);
        try {
          sessionStorage.removeItem(ratingStorageKey);
        } catch {
          /* Retain the in-memory result when per-tab storage is unavailable. */
        }
        setRatingMessage("已收到您的評分。感謝回饋！");
      } catch (cause) {
        if (!mountedRatingUi.current) return;
        setError(
          cause instanceof ReferralUiError
            ? cause.message
            : "尚未確認評分結果，請重送原評分或重新讀取本行程。",
        );
      }
    });
  }
  return (
    <AppShell
      context={context}
      badgeTone={completed ? "live" : "neutral"}
      footer={
        <>
          {completed ? (
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
          ) : null}
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
        title={
          completed
            ? "行程已完成"
            : trip?.status === "no_supply"
              ? "暫無可用車輛"
              : trip?.status === "dispatch_failed" ||
                  trip?.status === "dispatch_timeout"
                ? "派車失敗"
                : "行程已取消"
        }
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
        <DetailRow
          theme={theme}
          label="付款"
          value="付款及結算狀態未提供"
          last
        />
      </Card>
      {completed ? (
        <Card theme={theme} title="為這趟行程評分">
          <p style={{ fontSize: 12, color: theme.muted, lineHeight: 1.6 }}>
            評價與本行程一併保存；低分評價會建立服務紀錄，並記錄您是否需要客服聯絡。
          </p>
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
                onClick={() => setScore(n)}
                disabled={
                  !trip ||
                  isPending ||
                  Boolean(submitted) ||
                  Boolean(originalRating)
                }
                aria-label={`評分 ${n} 星`}
                style={{
                  border: 0,
                  padding: 0,
                  background: "transparent",
                  color:
                    (submitted?.score ?? score) !== null &&
                    n > (submitted?.score ?? score ?? 0)
                      ? theme.line
                      : theme.warnFg,
                  cursor:
                    !trip ||
                    isPending ||
                    Boolean(submitted) ||
                    Boolean(originalRating)
                      ? "default"
                      : "pointer",
                }}
              >
                <Icon name="spark" size={30} />
              </button>
            ))}
          </div>
          {submitted ? (
            <div aria-label="已送出評分內容">
              <p>
                評價標籤：
                {submitted.tags?.length ? submitted.tags.join("、") : "未選擇"}
              </p>
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                意見：{submitted.comment || "未填寫"}
              </p>
            </div>
          ) : (
            <fieldset
              disabled={isPending || Boolean(originalRating)}
              style={{ border: 0, margin: "12px 0", padding: 0 }}
            >
              <legend>評價標籤（可複選）</legend>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  margin: "8px 0",
                }}
              >
                {REFERRAL_RATING_TAG_OPTIONS.map((tag) => (
                  <label
                    key={tag}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTags.includes(tag)}
                      onChange={() =>
                        setSelectedTags((current) =>
                          current.includes(tag)
                            ? current.filter((selected) => selected !== tag)
                            : [...current, tag],
                        )
                      }
                    />
                    {tag}
                  </label>
                ))}
              </div>
              <label style={{ display: "block" }}>
                意見（最多200字）
                <textarea
                  aria-describedby="referral-rating-comment-count"
                  maxLength={200}
                  value={comment}
                  onChange={(event) =>
                    setComment(event.currentTarget.value.slice(0, 200))
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    minHeight: 80,
                    boxSizing: "border-box",
                  }}
                />
              </label>
              <p id="referral-rating-comment-count" aria-live="polite">
                {comment.length}/200 字
              </p>
            </fieldset>
          )}
          {(submitted?.score ?? score ?? 5) <= 2 ? (
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {submitted?.contactRequested === null ? (
                <span>原評分未記錄聯絡偏好</span>
              ) : (
                <>
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label="需要客服聯絡"
                    checked={submitted?.contactRequested ?? contactRequested}
                    disabled={
                      isPending || Boolean(submitted) || Boolean(originalRating)
                    }
                    onChange={(event) =>
                      setContactRequested(event.currentTarget.checked)
                    }
                  />
                  需要客服聯絡
                </>
              )}
            </label>
          ) : null}
          <ActionButton
            label={
              isPending
                ? "送出中…"
                : submitted
                  ? "評分已送出"
                  : originalRating
                    ? "重送原評分"
                    : "送出評分"
            }
            theme={theme}
            onClick={() => {
              if (score !== null) submitRating(score);
            }}
            disabled={score === null || isPending || Boolean(submitted)}
          />
          {error ? (
            <ActionButton
              label="重新讀取本行程"
              theme={theme}
              href={buildHref(context, {
                screen: "completed",
                state: "handoff",
                orderId: trip.orderId,
              })}
            />
          ) : null}
          {submitted?.complaintCaseNo ? (
            <p role="status">
              客訴案件：{submitted.complaintCaseNo}；
              {submitted.contactRequested
                ? "同意客服聯絡"
                : "不需客服聯絡，僅供內部檢視"}
            </p>
          ) : null}
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
      ) : null}
      {completed && trip ? (
        <ReferralComplaintPanel
          orderId={trip.orderId}
          recoveryScope={
            context.session?.recoveryScope ??
            context.session?.handoffId ??
            "unverified"
          }
          accent={context.accent}
        />
      ) : null}
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
            {trip?.status === "no_supply"
              ? "目前無可用車輛，未產生車資，請稍後再試或重新叫車。"
              : trip?.status === "dispatch_failed" ||
                  trip?.status === "dispatch_timeout"
                ? "本次派車失敗，未產生車資，請重新叫車。"
                : `此行程已取消。${PASSENGER_FREE_CANCELLATION_NOTICE}`}
          </div>
          {trip?.status === "cancelled" ? (
            <DetailRow
              theme={theme}
              label="取消時間"
              value={formatShortDateTime(trip.cancelledAt, "Asia/Taipei")}
              mono
            />
          ) : null}
          <DetailRow
            theme={theme}
            label={
              trip?.status === "cancelled"
                ? REFERRAL_CANCELLATION_FEE_LABEL
                : "費用"
            }
            value={
              trip?.status === "cancelled"
                ? REFERRAL_CANCELLATION_FEE_VALUE
                : (trip?.formattedFare ?? "—")
            }
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
      data-message-code={code}
      style={{
        padding: "11px 13px",
        borderRadius: 10,
        background: theme.surfaceLo,
        border: `1px solid ${theme.line}`,
        fontSize: 13,
        lineHeight: 1.55,
        color: theme.ink2,
      }}
    >
      {sample}
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
        href={toPhoneHref(REFERRAL_SUPPORT_PHONE)}
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
          href={toPhoneHref(REFERRAL_SUPPORT_PHONE)}
          label="客服協助聯絡司機"
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
        title={
          <span data-message-code={fallback.titleCode} style={{ fontSize: 16 }}>
            {fallback.titleSample}
          </span>
        }
      />

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
        <OutcomeScreen
          key={`${context.session?.recoveryScope ?? context.session?.handoffId ?? context.entry.entrySlug}:completed:${liveData?.selectedOrderId ?? liveData?.history?.items[0]?.orderId ?? "none"}`}
          context={context}
          kind="completed"
          liveData={liveData}
        />
      );
    case "cancelled":
      return (
        <OutcomeScreen
          key={`${context.session?.recoveryScope ?? context.session?.handoffId ?? context.entry.entrySlug}:cancelled:${liveData?.selectedOrderId ?? liveData?.history?.items[0]?.orderId ?? "none"}`}
          context={context}
          kind="cancelled"
          liveData={liveData}
        />
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
