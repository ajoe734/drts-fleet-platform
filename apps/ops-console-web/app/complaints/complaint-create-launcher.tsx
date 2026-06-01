"use client";

import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  type FormEvent,
  useState,
  useTransition,
} from "react";
import { COMPLAINT_CATEGORIES } from "@drts/contracts";
import type {
  ComplaintCategory,
  CreateComplaintCaseCommand,
} from "@drts/contracts";
import { CanvasIcon, buildCanvasTheme } from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import type { Locale } from "@/lib/translations";

// Client island for the canvas "建立客訴 / Create complaint" header CTA
// (availableActions descriptor: { action: "create", enabled: true,
// riskLevel: "medium" }). The list page itself is a server component; this is
// the single interactive surface it composes so the snapshot/triage path stays
// server-rendered.

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const CASE_SOURCES: CreateComplaintCaseCommand["caseSource"][] = [
  "ops",
  "phone",
  "web",
  "app",
];

const INITIAL_FORM: CreateComplaintCaseCommand = {
  caseSource: "ops",
  category: "fare_dispute",
  severity: "normal",
  description: "",
  relatedOrderId: "",
  relatedCallId: "",
};

function copy(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  height: 34,
  padding: "0 12px",
  borderRadius: 8,
  border: `1px solid ${theme.accent}`,
  background: theme.accent,
  color: "#ffffff",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: theme.fontFamily,
};

const secondaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  height: 34,
  padding: "0 12px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  color: theme.text,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: theme.fontFamily,
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(8, 10, 16, 0.62)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "8vh 16px 16px",
  zIndex: 80,
};

const dialogStyle: CSSProperties = {
  width: "min(560px, 100%)",
  borderRadius: 12,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  boxShadow: "0 24px 60px rgba(0, 0, 0, 0.45)",
  display: "grid",
  gap: 14,
  padding: 20,
};

const fieldStackStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const fieldLabelStyle: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  color: theme.textMuted,
};

const fieldStyle: CSSProperties = {
  width: "100%",
  minHeight: 34,
  padding: "8px 10px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontSize: 12.5,
  fontFamily: theme.fontFamily,
  boxSizing: "border-box",
};

export function ComplaintCreateLauncher({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateComplaintCaseCommand>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setError(null);
    setForm(INITIAL_FORM);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          await getOpsClient().createComplaint({
            ...form,
            description: form.description.trim(),
            relatedOrderId: form.relatedOrderId?.trim() || null,
            relatedCallId: form.relatedCallId?.trim() || null,
          });
          close();
          router.refresh();
        } catch (nextError) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : copy(locale, "Create failed", "建立失敗"),
          );
        }
      })();
    });
  }

  return (
    <>
      <button
        type="button"
        style={primaryButtonStyle}
        onClick={() => setOpen(true)}
      >
        <CanvasIcon name="plus" size={12} />
        {copy(locale, "Create complaint", "建立客訴")}
      </button>

      {open ? (
        <div
          style={overlayStyle}
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              close();
            }
          }}
        >
          <form
            style={dialogStyle}
            onSubmit={handleSubmit}
            role="dialog"
            aria-modal="true"
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div style={{ display: "grid", gap: 2 }}>
                <strong style={{ color: theme.text, fontSize: 15 }}>
                  {copy(locale, "Create complaint", "建立客訴")}
                </strong>
                <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                  {copy(
                    locale,
                    "medium risk · audit receipt issued on submit",
                    "中風險 · 送出後產生稽核回執",
                  )}
                </span>
              </div>
              <button
                type="button"
                style={{
                  ...secondaryButtonStyle,
                  height: 28,
                  padding: "0 8px",
                }}
                onClick={close}
              >
                <CanvasIcon name="x" size={12} />
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>
                  {copy(locale, "Source", "來源")}
                </span>
                <select
                  style={fieldStyle}
                  value={form.caseSource}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      caseSource: event.target
                        .value as CreateComplaintCaseCommand["caseSource"],
                    }))
                  }
                >
                  {CASE_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {formatOpsCodeLabel(locale, source)}
                    </option>
                  ))}
                </select>
              </label>

              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>
                  {copy(locale, "Category", "類別")}
                </span>
                <select
                  style={fieldStyle}
                  value={form.category}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      category: event.target.value as ComplaintCategory,
                    }))
                  }
                >
                  {COMPLAINT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {formatOpsCodeLabel(locale, category)}
                    </option>
                  ))}
                </select>
              </label>

              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>
                  {copy(locale, "Severity", "嚴重度")}
                </span>
                <select
                  style={fieldStyle}
                  value={form.severity}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      severity: event.target
                        .value as CreateComplaintCaseCommand["severity"],
                    }))
                  }
                >
                  <option value="normal">
                    {formatOpsCodeLabel(locale, "normal")}
                  </option>
                  <option value="high">
                    {formatOpsCodeLabel(locale, "high")}
                  </option>
                </select>
              </label>

              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>
                  {copy(locale, "Related order", "關聯訂單")}
                </span>
                <input
                  style={fieldStyle}
                  value={form.relatedOrderId ?? ""}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      relatedOrderId: event.target.value,
                    }))
                  }
                />
              </label>

              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>
                  {copy(locale, "Related call", "關聯來電")}
                </span>
                <input
                  style={fieldStyle}
                  value={form.relatedCallId ?? ""}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      relatedCallId: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <label style={fieldStackStyle}>
              <span style={fieldLabelStyle}>
                {copy(locale, "Description", "案件描述")}
              </span>
              <textarea
                style={{ ...fieldStyle, minHeight: 96, resize: "vertical" }}
                value={form.description}
                rows={3}
                required
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </label>

            {error ? (
              <span style={{ color: theme.danger, fontSize: 12 }}>{error}</span>
            ) : null}

            <div
              style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
            >
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={close}
              >
                {copy(locale, "Cancel", "取消")}
              </button>
              <button
                type="submit"
                style={primaryButtonStyle}
                disabled={pending}
              >
                {pending
                  ? copy(locale, "Saving…", "儲存中…")
                  : copy(locale, "Create complaint", "建立客訴")}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
