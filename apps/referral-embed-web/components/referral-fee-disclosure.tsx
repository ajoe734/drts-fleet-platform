"use client";
import {
  PASSENGER_FEE_ROWS,
  PASSENGER_CONFIRMATION_ROWS,
  PASSENGER_FREE_CANCELLATION_NOTICE,
  PASSENGER_SUPPORT_PHONE,
  type ReferralFeeStatus,
  type ReferralPassengerFareQuote,
} from "@drts/contracts";
import { useTranslation } from "../lib/i18n";

function ReferralFeeDisclosureContent() {
  const { t } = useTranslation();
  return (
    <>
      <dl>
        {PASSENGER_FEE_ROWS.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p>{PASSENGER_FREE_CANCELLATION_NOTICE}</p>
      <p>{t("fees.support", { phone: PASSENGER_SUPPORT_PHONE })}</p>
    </>
  );
}

export function ReferralFeeDisclosureReader() {
  const { t } = useTranslation();
  return (
    <details data-drt-operation="referral-fee-read">
      <summary>{t("fees.read")}</summary>
      <ReferralFeeDisclosureContent />
    </details>
  );
}

export function ReferralFirstFeeDisclosure({
  status,
  busy,
  error,
  onAgree,
}: {
  status: ReferralFeeStatus | null;
  busy: boolean;
  error: string | null;
  onAgree: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section aria-label={t("fees.first")}>
      <h2>{t("fees.title")}</h2>
      <ReferralFeeDisclosureContent />
      {error ? <p role="alert">{error}</p> : null}
      <button
        type="button"
        data-drt-operation="referral-fee-agree"
        disabled={busy || !status}
        onClick={onAgree}
      >
        {t(busy ? "fees.saving" : "fees.agree")}
      </button>
    </section>
  );
}

export function ReferralOrderFeeDisclosure({
  quote,
  checked,
  disabled,
  onChange,
}: {
  quote: ReferralPassengerFareQuote;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <section aria-label={t("fees.order")}>
      <h2>{t("fees.order")}</h2>
      <p>
        {quote.pickupAddress} → {quote.dropoffAddress}
      </p>
      <p>
        {t("fees.schedule", {
          time: quote.requestedScheduledAt ?? t("fees.now"),
          vehicle: quote.vehicleType ?? t("fees.unspecified"),
        })}
      </p>
      <p>
        {t("fees.estimate", {
          min: quote.estimatedMin,
          max: quote.estimatedMax,
        })}
      </p>
      <ul>
        {PASSENGER_CONFIRMATION_ROWS.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
      <p>{t("fees.tariff", { version: quote.quotedFareRuleVersion })}</p>
      <label>
        <input
          type="checkbox"
          aria-label={t("fees.checkbox")}
          data-drt-operation="referral-fee-confirm"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        {t("fees.checkbox")}
      </label>
    </section>
  );
}
