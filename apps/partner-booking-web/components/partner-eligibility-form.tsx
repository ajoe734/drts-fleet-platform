"use client";

import Link from "next/link";
import { startTransition, useState } from "react";
import type { PartnerEligibilityMode } from "@drts/contracts";
import type { PartnerBrandTemplate } from "@drts/ui-tokens";
import { buildCanvasTheme, CanvasCard, CanvasBanner } from "@drts/ui-web";
import type {
  PartnerEligibilityActionResult,
  PartnerEligibilitySubmission,
} from "@/lib/partner-booking-form";
import { useTranslation } from "@/lib/i18n";

export function PartnerEligibilityForm({
  brand,
  entrySlug,
  partnerUserRef,
  eligibilityMode,
  hasReferenceToken,
  verifyEligibilityAction,
}: {
  brand: PartnerBrandTemplate;
  entrySlug: string;
  partnerUserRef: string | null;
  eligibilityMode: PartnerEligibilityMode;
  hasReferenceToken: boolean;
  verifyEligibilityAction: (
    submission: PartnerEligibilitySubmission,
  ) => Promise<PartnerEligibilityActionResult>;
}) {
  const { t } = useTranslation();
  const theme = buildCanvasTheme({ surface: "partner", density: "compact" });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PartnerEligibilityActionResult | null>(
    null,
  );
  const [cardLast4, setCardLast4] = useState("");
  const [cardholderName, setCardholderName] = useState("");
  const [referenceToken, setReferenceToken] = useState("");
  const [benefitReference, setBenefitReference] = useState("");
  const [flightNo, setFlightNo] = useState("");
  const fieldStyle = { display: "grid", gap: 6 };
  const verification = result?.ok ? result.verification : null;
  const bookQuery = new URLSearchParams();
  if (partnerUserRef) bookQuery.set("partnerUserRef", partnerUserRef);
  if (verification?.verificationStatus === "eligible")
    bookQuery.set(
      "eligibilityVerificationId",
      verification.eligibilityVerificationId,
    );
  return (
    <CanvasCard theme={theme} title={t("eligibility.verify.title")}>
      <h1>{brand.displayName}</h1>
      <p>{t("eligibility.verify.body")}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (submitting) return;
          setSubmitting(true);
          setResult(null);
          startTransition(async () => {
            try {
              setResult(
                await verifyEligibilityAction({
                  ...(cardLast4.trim() ? { cardLast4: cardLast4.trim() } : {}),
                  ...(cardholderName.trim()
                    ? { cardholderName: cardholderName.trim() }
                    : {}),
                  ...(referenceToken.trim()
                    ? { referenceToken: referenceToken.trim() }
                    : {}),
                  ...(benefitReference.trim()
                    ? { benefitReference: benefitReference.trim() }
                    : {}),
                  ...(flightNo.trim() ? { flightNo: flightNo.trim() } : {}),
                }),
              );
            } catch {
              setResult({
                ok: false,
                errorCode: "PARTNER_ELIGIBILITY_UNAVAILABLE",
                errorMessage: t("eligibility.verify.failed"),
              });
            } finally {
              setSubmitting(false);
            }
          });
        }}
        style={{ display: "grid", gap: 14 }}
      >
        {eligibilityMode === "bank_card_inline" ? (
          <>
            <label style={fieldStyle}>
              {t("eligibility.verify.cardLast4")}
              <input
                name="cardLast4"
                inputMode="numeric"
                maxLength={4}
                required
                value={cardLast4}
                onChange={(event) => {
                  setCardLast4(event.target.value);
                  setResult(null);
                }}
              />
            </label>
            <label style={fieldStyle}>
              {t("eligibility.verify.cardholderName")}
              <input
                name="cardholderName"
                value={cardholderName}
                onChange={(event) => {
                  setCardholderName(event.target.value);
                  setResult(null);
                }}
              />
            </label>
          </>
        ) : null}
        {eligibilityMode === "reference_required" && !hasReferenceToken ? (
          <label style={fieldStyle}>
            {t("eligibility.verify.reference")}
            <input
              name="referenceToken"
              required
              value={referenceToken}
              onChange={(event) => {
                setReferenceToken(event.target.value);
                setResult(null);
              }}
            />
          </label>
        ) : null}
        <label style={fieldStyle}>
          {t("eligibility.verify.benefit")}
          <input
            name="benefitReference"
            value={benefitReference}
            onChange={(event) => {
              setBenefitReference(event.target.value);
              setResult(null);
            }}
          />
        </label>
        <label style={fieldStyle}>
          {t("field.flightNo")}
          <input
            name="flightNo"
            value={flightNo}
            onChange={(event) => {
              setFlightNo(event.target.value);
              setResult(null);
            }}
          />
        </label>
        <button type="submit" disabled={submitting}>
          {t(
            submitting
              ? "eligibility.verify.submitting"
              : "eligibility.verify.submit",
          )}
        </button>
      </form>
      {result && !result.ok ? (
        <div role="alert" data-error-code={result.errorCode}>
          {result.errorMessage}
        </div>
      ) : null}
      {verification ? (
        <div
          role="status"
          data-verification-status={verification.verificationStatus}
        >
          <CanvasBanner
            theme={theme}
            tone={
              verification.verificationStatus === "eligible"
                ? "success"
                : "warn"
            }
            title={t("eligibility.verify." + verification.verificationStatus)}
            body={t("eligibility.verify.result")}
          />
          <p>
            {t("book.eligibility.referenceId")}：
            <span data-testid="partner-eligibility-verification-id">
              {verification.eligibilityVerificationId}
            </span>
          </p>
          {verification.verificationStatus === "eligible" ? (
            <Link
              href={
                "/" +
                encodeURIComponent(entrySlug) +
                "/book?" +
                bookQuery.toString()
              }
              prefetch={false}
            >
              {t("eligibility.verify.continue")}
            </Link>
          ) : null}
        </div>
      ) : null}
    </CanvasCard>
  );
}
