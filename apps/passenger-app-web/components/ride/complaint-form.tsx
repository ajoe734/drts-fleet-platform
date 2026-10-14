import { t } from "./translations";
import { useState, useRef } from "react";
import { CORE_FOREGROUNDS } from "@drts/ui-tokens";
import { passengerChrome } from "../../lib/passenger-presentation";
import { requestPassengerRideAction } from "../../lib/ride/passenger-live";

const shellInset = 14;

export function ComplaintForm({
  token,
  authMode,
}: {
  token: string;
  authMode?: "id" | "token" | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<
    "service" | "fare" | "lost_item" | "other"
  >("service");
  const [content, setContent] = useState("");
  const [lostItemDescription, setLostItemDescription] = useState("");
  const [contactConsent, setContactConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const idempotencyKeyRef = useRef<string>("");
  if (!idempotencyKeyRef.current) {
    idempotencyKeyRef.current =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? `complaint-${crypto.randomUUID()}`
        : `complaint-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  if (authMode === "token") return null;

  if (!open) {
    return (
      <div style={{ margin: `0 ${shellInset}px 12px`, textAlign: "center" }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            background: "none",
            border: "none",
            color: passengerChrome.shell,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "underline",
            cursor: "pointer",
          }}
        >
          {t.ComplaintAndLostFound}
        </button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div
        style={{
          margin: `0 ${shellInset}px 12px`,
          padding: "32px 14px",
          background: passengerChrome.card,
          border: `1px solid ${passengerChrome.border}`,
          borderRadius: 14,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            background: passengerChrome.success.bg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: passengerChrome.success.fg,
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12l5 5L20 7" />
          </svg>
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: passengerChrome.text,
          }}
        >
          {t.ComplaintReceived}
        </div>
        <div
          style={{
            fontSize: 13.5,
            color: passengerChrome.muted,
            lineHeight: 1.6,
          }}
        >
          <span style={{ fontWeight: 600, color: passengerChrome.success.fg }}>
            {t.FormSubmitted}
          </span>
          <div style={{ marginTop: 4 }}>
            {t.ComplaintProcessingNotice}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setSubmitted(false);
            setOpen(false);
            setContent("");
            setLostItemDescription("");
            idempotencyKeyRef.current = "";
          }}
          style={{
            marginTop: 12,
            padding: "10px 24px",
            borderRadius: 12,
            background: passengerChrome.background,
            border: `1px solid ${passengerChrome.border}`,
            color: passengerChrome.text,
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {t.BackToRide}
        </button>
      </div>
    );
  }

  const submit = async () => {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      await requestPassengerRideAction(
        token,
        "complaints",
        {
          rideId: token,
          category,
          content,
          contactConsent,
          ...(category === "lost_item" ? { lostItemDescription } : {}),
        },
        false,
        idempotencyKeyRef.current,
      );
      setSubmitted(true);
      idempotencyKeyRef.current = "";
    } catch (e: unknown) {
      window.alert(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        margin: `0 ${shellInset}px 12px`,
        border: `1px solid ${passengerChrome.border}`,
        borderRadius: 14,
        padding: 16,
        background: passengerChrome.card,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <div>
          <h3
            style={{
              fontSize: 16,
              fontWeight: 700,
              margin: 0,
              color: passengerChrome.text,
            }}
          >
            {t.ComplaintAndLostFound}
          </h3>
          <div
            style={{
              fontSize: 11.5,
              color: passengerChrome.muted,
              fontFamily: passengerChrome.monoFont,
              marginTop: 2,
            }}
          >
            {token}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            background: "none",
            border: "none",
            color: passengerChrome.muted,
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          {t.Cancel}
        </button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            marginBottom: 6,
            color: passengerChrome.text,
          }}
        >
          {t.IssueCategory}
        </div>
        <select
          value={category}
          onChange={(e) => {
            const nextCat = e.target.value as
              | "service"
              | "fare"
              | "lost_item"
              | "other";
            setCategory(nextCat);
            idempotencyKeyRef.current = "";
          }}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: `1px solid ${passengerChrome.border}`,
            background: passengerChrome.card,
            color: passengerChrome.text,
            fontSize: 14,
          }}
        >
          <option value="service">{t.ComplaintServiceIssue}</option>
          <option value="fare">{t.ComplaintFareIssue}</option>
          <option value="lost_item">{t.ComplaintLostItem}</option>
          <option value="other">{t.ComplaintOther}</option>
        </select>
      </div>

      {category === "lost_item" && (
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              marginBottom: 6,
              color: passengerChrome.text,
            }}
          >
            {t.LostItemDesc}
          </div>
          <input
            type="text"
            placeholder={t.LostItemPlaceholder}
            value={lostItemDescription}
            onChange={(e) => {
              setLostItemDescription(e.target.value);
              idempotencyKeyRef.current = "";
            }}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: `1px solid ${passengerChrome.border}`,
              background: passengerChrome.card,
              color: passengerChrome.text,
              fontSize: 14,
              boxSizing: "border-box",
            }}
          />
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            marginBottom: 6,
            color: passengerChrome.text,
          }}
        >
          {t.DetailDescription}
        </div>
        <textarea
          placeholder={t.ComplaintPlaceholder}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            idempotencyKeyRef.current = "";
          }}
          rows={4}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: `1px solid ${passengerChrome.border}`,
            background: passengerChrome.card,
            color: passengerChrome.text,
            fontSize: 14,
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            fontSize: 13,
            color: passengerChrome.text,
            cursor: "pointer",
            lineHeight: 1.45,
          }}
        >
          <input
            type="checkbox"
            checked={contactConsent}
            onChange={(e) => {
              setContactConsent(e.target.checked);
              idempotencyKeyRef.current = "";
            }}
            style={{ marginTop: 2 }}
          />
          {t.AgreeToContact}
        </label>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={submitting || !content.trim()}
        style={{
          width: "100%",
          minHeight: 46,
          padding: "10px 16px",
          borderRadius: 12,
          background: passengerChrome.shell,
          color: CORE_FOREGROUNDS.foregroundInvert,
          border: "none",
          fontWeight: 700,
          fontSize: 14,
          cursor: submitting || !content.trim() ? "not-allowed" : "pointer",
          opacity: submitting || !content.trim() ? 0.6 : 1,
        }}
      >
        {submitting ? "送出中..." : "確認送出"}
      </button>
    </div>
  );
}
