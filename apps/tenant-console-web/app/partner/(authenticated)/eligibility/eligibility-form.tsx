"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  PartnerEligibilityMode,
  PartnerEligibilityVerificationRecord,
} from "@drts/contracts";
import { useTranslation } from "@/lib/i18n";

type Verification = PartnerEligibilityVerificationRecord;

const STATUS_TONE: Record<Verification["verificationStatus"], string> = {
  eligible: "is-success",
  ineligible: "is-error",
  manual_review: "is-warning",
};

const STATUS_HEADING_KEY: Record<Verification["verificationStatus"], string> = {
  eligible: "partner.eligibility.status.eligible.heading",
  ineligible: "partner.eligibility.status.ineligible.heading",
  manual_review: "partner.eligibility.status.manualReview.heading",
};

const STATUS_GUIDANCE_KEY: Record<Verification["verificationStatus"], string> =
  {
    eligible: "partner.eligibility.status.eligible.guidance",
    ineligible: "partner.eligibility.status.ineligible.guidance",
    manual_review: "partner.eligibility.status.manualReview.guidance",
  };

function formatDateTime(value: string, locale: "en" | "zh") {
  return new Date(value).toLocaleString(locale === "zh" ? "zh-TW" : "en-US");
}

export function PartnerEligibilityForm({
  mode,
}: {
  mode: PartnerEligibilityMode;
}) {
  const { locale, t } = useTranslation();
  const [referenceToken, setReferenceToken] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [cardholderName, setCardholderName] = useState("");
  const [benefitReference, setBenefitReference] = useState("");
  const [flightNo, setFlightNo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    setVerification(null);
    try {
      const response = await fetch("/api/partner/eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceToken: referenceToken || undefined,
          cardLast4: cardLast4 || undefined,
          cardholderName: cardholderName || undefined,
          benefitReference: benefitReference || undefined,
          flightNo: flightNo || undefined,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        verification?: Verification;
        error?: string;
      } | null;

      if (!response.ok || !payload?.verification) {
        setError(
          payload?.error ??
            t("partner.eligibility.form.errorFailed", {
              status: response.status,
            }),
        );
        return;
      }

      setVerification(payload.verification);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t("partner.eligibility.form.errorUnknown"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="form-stack">
      <form
        aria-label={t("partner.eligibility.formAria")}
        className="form-stack"
        onSubmit={handleSubmit}
      >
        {error ? (
          <div className="form-error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="form-grid">
          {mode === "bank_card_inline" ? (
            <>
              <label className="field-stack">
                <span>{t("partner.eligibility.form.cardLast4")}</span>
                <input
                  inputMode="numeric"
                  maxLength={4}
                  onChange={(event) =>
                    setCardLast4(event.target.value.replace(/\D/g, ""))
                  }
                  pattern="[0-9]{4}"
                  required
                  value={cardLast4}
                />
              </label>
              <label className="field-stack">
                <span>{t("partner.eligibility.form.cardholderName")}</span>
                <input
                  onChange={(event) => setCardholderName(event.target.value)}
                  required
                  type="text"
                  value={cardholderName}
                />
              </label>
            </>
          ) : null}

          {mode === "reference_required" ? (
            <>
              <label className="field-stack">
                <span>{t("partner.eligibility.form.referenceToken")}</span>
                <input
                  onChange={(event) => setReferenceToken(event.target.value)}
                  required
                  type="text"
                  value={referenceToken}
                />
              </label>
              <label className="field-stack">
                <span>{t("partner.eligibility.form.benefitReference")}</span>
                <input
                  onChange={(event) => setBenefitReference(event.target.value)}
                  required
                  type="text"
                  value={benefitReference}
                />
              </label>
              <label className="field-stack">
                <span>{t("partner.eligibility.form.flightNoOptional")}</span>
                <input
                  onChange={(event) => setFlightNo(event.target.value)}
                  type="text"
                  value={flightNo}
                />
              </label>
            </>
          ) : null}
        </div>

        <div className="form-actions">
          <button
            className="action-button action-button-primary"
            disabled={submitting}
            type="submit"
          >
            {submitting
              ? t("partner.eligibility.form.submitting")
              : t("partner.eligibility.form.submit")}
          </button>
        </div>
      </form>

      {verification ? (
        <div
          className={`partner-verification-result ${
            STATUS_TONE[verification.verificationStatus]
          }`}
          role="status"
        >
          <strong>
            {t(STATUS_HEADING_KEY[verification.verificationStatus])}
          </strong>
          <p>{t(STATUS_GUIDANCE_KEY[verification.verificationStatus])}</p>
          <dl className="definition-grid">
            <div>
              <dt>{t("partner.eligibility.result.verificationId")}</dt>
              <dd>
                <code>{verification.eligibilityVerificationId}</code>
              </dd>
            </div>
            <div>
              <dt>{t("partner.eligibility.result.decisionSource")}</dt>
              <dd>
                <code>{verification.decisionSource}</code>
              </dd>
            </div>
            <div>
              <dt>{t("partner.eligibility.result.reasonCode")}</dt>
              <dd>
                <code>{verification.verificationReasonCode}</code>
              </dd>
            </div>
            <div>
              <dt>{t("partner.eligibility.result.adapter")}</dt>
              <dd>
                {verification.adapterCode ? (
                  <code>{verification.adapterCode}</code>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt>{t("partner.eligibility.result.attempts")}</dt>
              <dd>{verification.attempts.length}</dd>
            </div>
            <div>
              <dt>{t("partner.eligibility.result.verifiedAt")}</dt>
              <dd>
                <time dateTime={verification.verifiedAt}>
                  {formatDateTime(verification.verifiedAt, locale)}
                </time>
              </dd>
            </div>
          </dl>
          {verification.verificationStatus === "eligible" ? (
            <Link
              className="action-button action-button-primary"
              href={`/partner/booking/new?eligibilityVerificationId=${encodeURIComponent(
                verification.eligibilityVerificationId,
              )}`}
            >
              {t("partner.eligibility.result.continue")}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
