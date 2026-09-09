"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
  EBanner,
  EBtnContent,
  ECard,
  EIcon,
  EPill,
  entBtnStyle,
} from "@/components/ent-kit";
import { EntPageHead } from "@/components/enterprise-shell";
import {
  getAuthorizedSupportContact,
  getTripSupportCopy,
  submitTripSupportInquiry,
  type SupportApiSubmitFn,
  type TripSupportInquiryResult,
} from "@/lib/enterprise-fixtures";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
import { useTranslation } from "@/lib/i18n";

export function TripSupportContent({
  apiSubmitFn,
}: {
  apiSubmitFn?: SupportApiSubmitFn;
} = {}) {
  const { locale } = useTranslation();
  const searchParams = useSearchParams();
  const initialTopic = searchParams.get("topic") || "driver";

  const supportContact = getAuthorizedSupportContact(locale);
  const copy = getTripSupportCopy(locale);

  const [selectedTopic, setSelectedTopic] = useState(initialTopic);
  const [notes, setNotes] = useState("");
  const [submissionResult, setSubmissionResult] =
    useState<TripSupportInquiryResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const result = await submitTripSupportInquiry(
        {
          topic: selectedTopic,
          notes,
        },
        locale,
        apiSubmitFn,
      );
      setSubmissionResult(result);
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : copy.inquiryErrorTitle;
      setSubmissionResult({
        status: "error",
        message: errMsg,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div data-testid="trip-support-container" style={{ maxWidth: 760, margin: "0 auto" }}>
      <EntPageHead
        back={copy.backTrip}
        title={copy.pageTitle}
        sub={copy.pageSubtitle}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Link
              href="/trip"
              data-testid="support-back-trip"
              style={entBtnStyle(t, { variant: "default", size: "sm" })}
            >
              <EBtnContent iconR="arrow" size="sm">
                {copy.backTrip}
              </EBtnContent>
            </Link>
            <Link
              href="/bookings"
              data-testid="support-back-bookings"
              style={entBtnStyle(t, { variant: "default", size: "sm" })}
            >
              <EBtnContent size="sm">{copy.backBookings}</EBtnContent>
            </Link>
          </div>
        }
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Support Phone Section */}
        <ECard
          t={t}
          accent={supportContact.isAuthorized ? t.primary : t.warn}
          title={copy.phoneTitle}
          sub={copy.phoneChannelLabel}
        >
          {supportContact.isAuthorized && supportContact.phone ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    background: t.primaryBg,
                    color: t.primary,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <EIcon name="phone" size={20} />
                </span>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, fontFamily: t.mono, color: t.ink }}>
                    {supportContact.phone}
                  </div>
                  <div style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>
                    {supportContact.notice}
                  </div>
                </div>
              </div>
              <a
                href={supportContact.href}
                data-testid="support-call-action"
                style={entBtnStyle(t, { variant: "primary" })}
              >
                <EBtnContent icon="phone">{copy.callAction}</EBtnContent>
              </a>
            </div>
          ) : (
            <div data-testid="support-unauthorized-notice">
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <EPill t={t} tone="warn" dot>
                  {copy.unauthorizedTag}
                </EPill>
              </div>
              <p style={{ color: t.ink2, fontSize: 13, lineHeight: 1.6, margin: "0 0 6px" }}>
                {copy.unauthorizedNotice}
              </p>
              <p style={{ color: t.muted, fontSize: 12, margin: 0 }}>
                {copy.unauthorizedHelp}
              </p>
            </div>
          )}
        </ECard>

        {/* Driver Coordination Section */}
        <ECard t={t} title={copy.driverTitle} sub="dispatch coordination">
          <div data-testid="support-driver-guidance">
            <p style={{ color: t.ink2, fontSize: 13, lineHeight: 1.6, margin: "0 0 8px" }}>
              {copy.driverDesc}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
              <EIcon name="info" size={14} style={{ color: t.primary }} />
              <span style={{ fontSize: 12, color: t.muted }}>
                {copy.driverEscalationNotice}
              </span>
            </div>
          </div>
        </ECard>

        {/* Online Support Inquiry / Channel Status */}
        <ECard
          t={t}
          title={copy.inquiryTitle}
          sub={copy.inquirySubtitle}
        >
          {!apiSubmitFn ? (
            <div data-testid="support-inquiry-unavailable">
              <EBanner
                t={t}
                tone="warn"
                icon="alert"
                title={copy.inquiryUnavailableTitle}
                body={copy.inquiryUnavailableBody}
              />
              <div style={{ marginTop: 14 }}>
                <p style={{ color: t.muted, fontSize: 12.5, lineHeight: 1.6, margin: 0 }}>
                  {copy.inquiryChannelStatusBody}
                </p>
              </div>
            </div>
          ) : submissionResult ? (
            <div>
              {submissionResult.status === "success" && (
                <div data-testid="support-inquiry-success">
                  <EBanner
                    t={t}
                    tone="success"
                    icon="check"
                    title={copy.inquirySuccessTitle}
                    body={submissionResult.message}
                  />
                </div>
              )}
              {submissionResult.status === "unavailable" && (
                <div data-testid="support-inquiry-unavailable">
                  <EBanner
                    t={t}
                    tone="warn"
                    icon="alert"
                    title={copy.inquiryUnavailableTitle}
                    body={submissionResult.message}
                  />
                </div>
              )}
              {submissionResult.status === "error" && (
                <div data-testid="support-inquiry-error">
                  <EBanner
                    t={t}
                    tone="danger"
                    icon="alert"
                    title={copy.inquiryErrorTitle}
                    body={submissionResult.message}
                  />
                </div>
              )}
              <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => {
                    setSubmissionResult(null);
                    if (submissionResult.status === "success") {
                      setNotes("");
                    }
                  }}
                  style={entBtnStyle(t, { variant: "default", size: "sm" })}
                >
                  <EBtnContent size="sm">{copy.inquiryTitle}</EBtnContent>
                </button>
                <Link
                  href="/trip"
                  style={entBtnStyle(t, { variant: "primary", size: "sm" })}
                >
                  <EBtnContent iconR="arrow" size="sm">
                    {copy.backTrip}
                  </EBtnContent>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <EBanner
                t={t}
                tone="info"
                icon="info"
                title={copy.inquiryChannelStatusTitle}
                body={copy.inquiryChannelStatusBody}
              />

              <div>
                <label
                  htmlFor="topic-select"
                  style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: t.ink, marginBottom: 6 }}
                >
                  {copy.topicSelectLabel}
                </label>
                <select
                  id="topic-select"
                  data-testid="support-topic-select"
                  value={selectedTopic}
                  onChange={(e) => setSelectedTopic(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 8,
                    border: "1px solid " + t.line,
                    background: t.surface,
                    color: t.ink,
                    fontSize: 13.5,
                  }}
                >
                  {copy.topicOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="inquiry-notes"
                  style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: t.ink, marginBottom: 6 }}
                >
                  {copy.messageLabel}
                </label>
                <textarea
                  id="inquiry-notes"
                  data-testid="support-inquiry-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={copy.messagePlaceholder}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 8,
                    border: "1px solid " + t.line,
                    background: t.surface,
                    color: t.ink,
                    fontSize: 13.5,
                    fontFamily: t.sans,
                    resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <button
                  type="submit"
                  data-testid="support-submit-inquiry"
                  disabled={isSubmitting}
                  style={entBtnStyle(t, { variant: "primary", disabled: isSubmitting })}
                >
                  <EBtnContent icon="check">
                    {isSubmitting ? copy.submitting : copy.submitInquiry}
                  </EBtnContent>
                </button>
              </div>
            </form>
          )}
        </ECard>
      </div>
    </div>
  );
}

export default function TripSupportPage() {
  return (
    <Suspense fallback={null}>
      <TripSupportContent />
    </Suspense>
  );
}
