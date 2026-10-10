import { t } from "./translations";
import { useState } from "react";
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
          客訴與遺失物表單
        </button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div
        style={{
          margin: `0 ${shellInset}px 12px`,
          padding: 16,
          background: passengerChrome.card,
          border: `1px solid ${passengerChrome.border}`,
          borderRadius: 12,
        }}
      >
        <div
          style={{
            fontWeight: 600,
            marginBottom: 8,
            color: passengerChrome.text,
          }}
        >
          客訴與遺失物表單
        </div>
        <div
          style={{
            color: passengerChrome.success.fg,
            textAlign: "center",
            padding: "12px 0",
          }}
        >
          {t.FormSubmitted}
        </div>
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
      );
      setSubmitted(true);
    } catch (e: any) {
      window.alert(e.message || "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        margin: `0 ${shellInset}px 12px`,
        border: `1px solid ${passengerChrome.border}`,
        borderRadius: 12,
        padding: 16,
        background: passengerChrome.card,
      }}
    >
      <div
        style={{
          fontWeight: 600,
          marginBottom: 12,
          color: passengerChrome.text,
        }}
      >
        {t.ComplaintAndLostFound}
      </div>
      <div style={{ marginBottom: 8 }}>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as any)}
          style={{
            width: "100%",
            padding: 8,
            borderRadius: 8,
            border: `1px solid ${passengerChrome.border}`,
          }}
        >
          <option value="service">服務問題</option>
          <option value="fare">車資問題</option>
          <option value="lost_item">遺失物</option>
          <option value="other">其他</option>
        </select>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={t.ComplaintPlaceholder || "請描述您的問題"}
        style={{
          width: "100%",
          height: 80,
          padding: 8,
          fontSize: 13,
          borderRadius: 8,
          border: `1px solid ${passengerChrome.border}`,
          resize: "none",
          marginBottom: 8,
        }}
      />
      {category === "lost_item" && (
        <input
          type="text"
          value={lostItemDescription}
          onChange={(e) => setLostItemDescription(e.target.value)}
          placeholder="遺失物描述"
          style={{
            width: "100%",
            padding: 8,
            fontSize: 13,
            borderRadius: 8,
            border: `1px solid ${passengerChrome.border}`,
            marginBottom: 8,
          }}
        />
      )}
      <div
        style={{
          marginBottom: 12,
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <input
          type="checkbox"
          checked={contactConsent}
          onChange={(e) => setContactConsent(e.target.checked)}
          id="contactConsent"
        />
        <label htmlFor="contactConsent" style={{ color: passengerChrome.text }}>
          同意客服與我聯繫
        </label>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          style={{
            flex: 1,
            padding: "12px",
            borderRadius: 8,
            border: `1px solid ${passengerChrome.border}`,
            background: "transparent",
            cursor: "pointer",
            color: passengerChrome.text,
          }}
          onClick={() => setOpen(false)}
          disabled={submitting}
        >
          {t.Cancel}
        </button>
        <button
          type="button"
          style={{
            flex: 1,
            padding: "12px",
            borderRadius: 8,
            border: "none",
            background: passengerChrome.shell,
            color: passengerChrome.invert,
            cursor: "pointer",
            opacity: submitting || !content.trim() ? 0.6 : 1,
          }}
          onClick={submit}
          disabled={!content.trim() || submitting}
        >
          {submitting ? "送出中..." : "確認送出"}
        </button>
      </div>
    </div>
  );
}
