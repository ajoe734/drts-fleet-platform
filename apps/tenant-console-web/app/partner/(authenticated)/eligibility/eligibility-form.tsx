"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  PartnerEligibilityMode,
  PartnerEligibilityVerificationRecord,
} from "@drts/contracts";

type Verification = PartnerEligibilityVerificationRecord;

const STATUS_TONE: Record<Verification["verificationStatus"], string> = {
  eligible: "is-success",
  ineligible: "is-error",
  manual_review: "is-warning",
};

const STATUS_HEADING: Record<Verification["verificationStatus"], string> = {
  eligible: "Eligibility approved",
  ineligible: "Eligibility denied",
  manual_review: "Manual review required",
};

const STATUS_GUIDANCE: Record<Verification["verificationStatus"], string> = {
  eligible:
    "Booking creation is unlocked. The verification id will be stamped on the booking automatically.",
  ineligible:
    "Booking creation stays blocked. Ask the rider to provide a valid reference or contact partner support.",
  manual_review:
    "Booking creation stays blocked until ops resolves the manual review queue item for this verification.",
};

export function PartnerEligibilityForm({
  mode,
}: {
  mode: PartnerEligibilityMode;
}) {
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
          payload?.error ?? `Verification failed (HTTP ${response.status}).`,
        );
        return;
      }

      setVerification(payload.verification);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unknown verification failure.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="form-stack">
      <form
        aria-label="Partner eligibility verification"
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
                <span>Card last 4</span>
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
                <span>Cardholder name</span>
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
                <span>Reference token</span>
                <input
                  onChange={(event) => setReferenceToken(event.target.value)}
                  required
                  type="text"
                  value={referenceToken}
                />
              </label>
              <label className="field-stack">
                <span>Benefit reference</span>
                <input
                  onChange={(event) => setBenefitReference(event.target.value)}
                  required
                  type="text"
                  value={benefitReference}
                />
              </label>
              <label className="field-stack">
                <span>Flight no. (optional)</span>
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
            {submitting ? "Verifying eligibility..." : "Verify eligibility"}
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
          <strong>{STATUS_HEADING[verification.verificationStatus]}</strong>
          <p>{STATUS_GUIDANCE[verification.verificationStatus]}</p>
          <dl className="definition-grid">
            <div>
              <dt>Verification id</dt>
              <dd>
                <code>{verification.eligibilityVerificationId}</code>
              </dd>
            </div>
            <div>
              <dt>Decision source</dt>
              <dd>
                <code>{verification.decisionSource}</code>
              </dd>
            </div>
            <div>
              <dt>Reason code</dt>
              <dd>
                <code>{verification.verificationReasonCode}</code>
              </dd>
            </div>
            <div>
              <dt>Adapter</dt>
              <dd>
                {verification.adapterCode ? (
                  <code>{verification.adapterCode}</code>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt>Attempts</dt>
              <dd>{verification.attempts.length}</dd>
            </div>
            <div>
              <dt>Verified at</dt>
              <dd>
                <time dateTime={verification.verifiedAt}>
                  {new Date(verification.verifiedAt).toLocaleString()}
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
              Continue to booking create
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
