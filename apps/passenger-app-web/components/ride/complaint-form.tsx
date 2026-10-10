import { useState } from "react";
import { passengerChrome } from "@/lib/passenger-presentation";
import { requestPassengerRideAction } from "@/lib/ride/passenger-live";

export function ComplaintForm({
  token,
  authMode,
}: {
  token: string;
  authMode?: "id" | "token" | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        style={{
          marginTop: 12,
          width: "100%",
          padding: "12px",
          border: `1px solid \${passengerChrome.border}`,
          borderRadius: 8,
          background: "transparent",
          cursor: "pointer",
        }}
        onClick={() => setOpen(true)}
      >
        客訴與遺失物表單
      </button>
    );
  }

  if (submitted) {
    return (
      <div
        style={{
          marginTop: 12,
          border: `1px solid \${passengerChrome.border}`,
          borderRadius: 8,
          padding: 16,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 12 }}>
          客訴與遺失物表單
        </div>
        <div
          style={{
            color: passengerChrome.success.fg,
            textAlign: "center",
            padding: "12px 0",
          }}
        >
          表單已送出，客服將盡速與您聯繫。
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
        "contact",
        { body: content },
        authMode === "token",
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
        marginTop: 12,
        border: `1px solid \${passengerChrome.border}`,
        borderRadius: 8,
        padding: 16,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 12 }}>客訴與遺失物表單</div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="請描述您的問題或遺失物品..."
        style={{
          width: "100%",
          height: 100,
          padding: 8,
          fontSize: 13,
          borderRadius: 8,
          border: `1px solid \${passengerChrome.border}`,
          resize: "none",
          marginTop: 8,
        }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          type="button"
          style={{
            flex: 1,
            padding: "12px",
            borderRadius: 8,
            border: `1px solid \${passengerChrome.border}`,
            background: "transparent",
            cursor: "pointer",
          }}
          onClick={() => setOpen(false)}
          disabled={submitting}
        >
          取消
        </button>
        <button
          type="button"
          style={{
            flex: 1,
            padding: "12px",
            borderRadius: 8,
            border: "none",
            background: passengerChrome.driverRealm.bg,
            color: passengerChrome.driverRealm.fg,
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
