"use client";
import {
  PASSENGER_FEE_ROWS,
  PASSENGER_CONFIRMATION_ROWS,
  PASSENGER_FREE_CANCELLATION_NOTICE,
  PASSENGER_SUPPORT_PHONE,
  type ReferralFeeStatus,
  type ReferralPassengerFareQuote,
} from "@drts/contracts";
import type { buildEmbedTheme } from "../lib/embed-presentation";
import { useTranslation } from "../lib/i18n";

type Theme = ReturnType<typeof buildEmbedTheme>;

function primaryButton(theme: Theme, disabled: boolean) {
  return {
    width: "100%",
    minHeight: 44,
    borderRadius: 12,
    padding: "11px 14px",
    border: `1px solid ${theme.primary}`,
    background: theme.primary,
    color: theme.surface,
    fontFamily: theme.sans,
    fontSize: 14,
    fontWeight: 700,
    opacity: disabled ? 0.6 : 1,
    cursor: disabled ? "default" : "pointer",
  } as const;
}

function ReferralFeeDisclosureContent({ theme }: { theme: Theme }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <dl style={{ margin: 0 }}>
        {PASSENGER_FEE_ROWS.map(([label, value], index) => (
          <div
            key={label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              padding: "8px 0",
              borderBottom:
                index < PASSENGER_FEE_ROWS.length - 1
                  ? `1px solid ${theme.line}`
                  : "none",
              fontSize: 13,
            }}
          >
            <dt style={{ color: theme.muted }}>{label}</dt>
            <dd
              style={{
                margin: 0,
                color: theme.ink,
                fontWeight: 600,
                textAlign: "right",
              }}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p
        style={{
          margin: 0,
          padding: "10px 12px",
          borderRadius: 10,
          background: theme.infoBg,
          border: `1px solid ${theme.infoBorder}`,
          color: theme.infoFg,
          fontSize: 12.5,
          lineHeight: 1.6,
        }}
      >
        {PASSENGER_FREE_CANCELLATION_NOTICE}
      </p>
      <p style={{ margin: 0, fontSize: 12, color: theme.muted }}>
        {t("fees.support", { phone: PASSENGER_SUPPORT_PHONE })}
      </p>
    </div>
  );
}

export function ReferralFeeDisclosureReader({ theme }: { theme: Theme }) {
  const { t } = useTranslation();
  return (
    <details data-drt-operation="referral-fee-read">
      <summary
        style={{
          cursor: "pointer",
          fontSize: 13.5,
          fontWeight: 700,
          color: theme.ink,
        }}
      >
        {t("fees.read")}
      </summary>
      <div style={{ marginTop: 10 }}>
        <ReferralFeeDisclosureContent theme={theme} />
      </div>
    </details>
  );
}

export function ReferralFirstFeeDisclosure({
  theme,
  status,
  busy,
  error,
  onAgree,
}: {
  theme: Theme;
  status: ReferralFeeStatus | null;
  busy: boolean;
  error: string | null;
  onAgree: () => void;
}) {
  const { t } = useTranslation();
  const disabled = busy || !status;
  return (
    <section aria-label={t("fees.first")} style={{ display: "grid", gap: 12 }}>
      <h2
        style={{ margin: 0, fontSize: 15, fontWeight: 800, color: theme.ink }}
      >
        {t("fees.title")}
      </h2>
      <ReferralFeeDisclosureContent theme={theme} />
      {error ? (
        <p
          role="alert"
          style={{ margin: 0, fontSize: 12.5, color: theme.dangerFg }}
        >
          {error}
        </p>
      ) : null}
      <button
        type="button"
        data-drt-operation="referral-fee-agree"
        disabled={disabled}
        onClick={onAgree}
        style={primaryButton(theme, disabled)}
      >
        {t(busy ? "fees.saving" : "fees.agree")}
      </button>
    </section>
  );
}

export function ReferralOrderFeeDisclosure({
  theme,
  quote,
  pickupTimeLabel,
  vehicleLabel,
  checked,
  disabled,
  onChange,
}: {
  theme: Theme;
  quote: ReferralPassengerFareQuote;
  pickupTimeLabel: string;
  vehicleLabel: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <section aria-label={t("fees.order")} style={{ display: "grid", gap: 10 }}>
      <h2
        style={{ margin: 0, fontSize: 14, fontWeight: 700, color: theme.ink }}
      >
        {t("fees.order")}
      </h2>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          fontWeight: 600,
          color: theme.ink,
          lineHeight: 1.5,
          overflowWrap: "anywhere",
        }}
      >
        {quote.pickupAddress} → {quote.dropoffAddress}
      </p>
      <p style={{ margin: 0, fontSize: 12.5, color: theme.ink2 }}>
        {t("fees.schedule", {
          time: pickupTimeLabel,
          vehicle: vehicleLabel,
        })}
      </p>
      <p
        style={{
          margin: 0,
          padding: "10px 12px",
          borderRadius: 10,
          background: theme.primaryBg,
          border: `1px solid ${theme.primaryBd}`,
          color: theme.primary,
          fontSize: 14,
          fontWeight: 700,
          lineHeight: 1.5,
        }}
      >
        {t("fees.estimate", {
          min: quote.estimatedMin,
          max: quote.estimatedMax,
        })}
      </p>
      <ul
        style={{
          margin: 0,
          paddingLeft: 18,
          display: "grid",
          gap: 4,
          fontSize: 12.5,
          color: theme.ink2,
          lineHeight: 1.5,
        }}
      >
        {PASSENGER_CONFIRMATION_ROWS.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
      <p style={{ margin: 0, fontSize: 11.5, color: theme.muted }}>
        {t("fees.tariff", { version: quote.quotedFareRuleVersion })}
      </p>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "11px 12px",
          borderRadius: 12,
          border: `1px solid ${checked ? theme.primary : theme.line}`,
          background: checked ? theme.primaryBg : theme.surface,
          fontSize: 13.5,
          fontWeight: 600,
          color: theme.ink,
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.7 : 1,
        }}
      >
        <input
          type="checkbox"
          aria-label={t("fees.checkbox")}
          data-drt-operation="referral-fee-confirm"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.checked)}
          style={{
            width: 18,
            height: 18,
            margin: 0,
            accentColor: theme.primary,
            flexShrink: 0,
          }}
        />
        {t("fees.checkbox")}
      </label>
    </section>
  );
}
