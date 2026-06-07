"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  PartnerEligibilityMode,
  PartnerEligibilityVerificationRecord,
} from "@drts/contracts";
import { formatTenantUiError } from "@/lib/error-copy";

type Verification = PartnerEligibilityVerificationRecord;

const STATUS_TONE: Record<Verification["verificationStatus"], string> = {
  eligible: "is-success",
  ineligible: "is-error",
  manual_review: "is-warning",
};

const STATUS_HEADING: Record<Verification["verificationStatus"], string> = {
  eligible: "資格驗證通過",
  ineligible: "資格驗證未通過",
  manual_review: "需要人工審查",
};

const STATUS_GUIDANCE: Record<Verification["verificationStatus"], string> = {
  eligible: "已開放建立訂單，系統會自動把驗證編號帶進訂單。",
  ineligible:
    "建立訂單仍會被擋下。請請乘客提供正確參考資料，或請合作夥伴客服協助。",
  manual_review: "在營運端完成這筆驗證的人工審查前，建立訂單都會維持關閉。",
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
          formatTenantUiError(
            payload?.error ?? `資格驗證失敗（狀態碼 ${response.status}）。`,
            "資格驗證失敗",
          ),
        );
        return;
      }

      setVerification(payload.verification);
    } catch (caught) {
      setError(
        formatTenantUiError(
          caught instanceof Error ? caught.message : "未知的資格驗證失敗。",
          "資格驗證失敗",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="form-stack">
      <form
        aria-label="合作夥伴資格驗證"
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
                <span>卡號末四碼</span>
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
                <span>持卡人姓名</span>
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
                <span>參考代碼</span>
                <input
                  onChange={(event) => setReferenceToken(event.target.value)}
                  required
                  type="text"
                  value={referenceToken}
                />
              </label>
              <label className="field-stack">
                <span>福利參考編號</span>
                <input
                  onChange={(event) => setBenefitReference(event.target.value)}
                  required
                  type="text"
                  value={benefitReference}
                />
              </label>
              <label className="field-stack">
                <span>航班號（選填）</span>
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
            {submitting ? "正在驗證資格..." : "驗證資格"}
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
              <dt>驗證編號</dt>
              <dd>
                <code>{verification.eligibilityVerificationId}</code>
              </dd>
            </div>
            <div>
              <dt>判定來源</dt>
              <dd>
                <code>{verification.decisionSource}</code>
              </dd>
            </div>
            <div>
              <dt>原因代碼</dt>
              <dd>
                <code>{verification.verificationReasonCode}</code>
              </dd>
            </div>
            <div>
              <dt>介接器</dt>
              <dd>
                {verification.adapterCode ? (
                  <code>{verification.adapterCode}</code>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt>嘗試次數</dt>
              <dd>{verification.attempts.length}</dd>
            </div>
            <div>
              <dt>驗證時間</dt>
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
              前往建立訂單
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
