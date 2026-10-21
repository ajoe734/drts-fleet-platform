"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import type {
  ResourceActionDescriptor,
  TenantPassengerRecord,
} from "@drts/contracts";
import { buildCanvasTheme } from "@drts/ui-web";
import { t, type Locale } from "../../lib/translations";
import { savePassengerAction, type PassengerActionResult } from "./actions";

const theme = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});
const buttonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 28,
  padding: "0 8px",
  borderRadius: 7,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
};
const fieldStyle: CSSProperties = {
  width: "100%",
  minHeight: 36,
  padding: "6px 10px",
  boxSizing: "border-box",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  font: "inherit",
};
const fields = [
  ["fullName", "passengers.column.name", "text"],
  ["employeeNo", "passengers.column.employeeNo", "text"],
  ["departmentName", "passengers.column.department", "text"],
  ["mobile", "passengers.column.mobile", "tel"],
  ["email", "passengers.column.email", "email"],
] as const;

export function PassengerActionControl({
  descriptor,
  label,
  helper,
  locale,
  passenger,
}: {
  descriptor: ResourceActionDescriptor;
  label: string;
  helper: string;
  locale: Locale;
  passenger?: TenantPassengerRecord;
}) {
  const router = useRouter();
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<PassengerActionResult | null>(null);
  const changesDetails =
    descriptor.action === "create" || descriptor.action === "edit";

  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);

  return (
    <>
      <button
        type="button"
        title={helper}
        disabled={!descriptor.enabled}
        style={buttonStyle}
        onClick={() => {
          setResult(null);
          setOpen(true);
        }}
      >
        {label}
      </button>
      {open ? (
        <dialog
          ref={dialog}
          aria-labelledby={titleId}
          onCancel={(event) => {
            if (pending) event.preventDefault();
            else setOpen(false);
          }}
          style={{
            width: "min(480px, calc(100vw - 32px))",
            maxHeight: "calc(100dvh - 32px)",
            overflow: "auto",
            boxSizing: "border-box",
            borderRadius: 12,
            border: `1px solid ${theme.border}`,
            padding: 24,
            background: theme.bgRaised,
            color: theme.text,
            fontFamily: theme.fontFamily,
          }}
        >
          <h2 id={titleId} style={{ margin: "0 0 16px", fontSize: 18 }}>
            {label}
            {passenger ? ` · ${passenger.fullName}` : ""}
          </h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (pending || result?.ok) return;
              const formData = new FormData(event.currentTarget);
              setResult(null);
              startTransition(async () => {
                try {
                  const saved = await savePassengerAction(formData);
                  setResult(saved);
                  if (saved.ok) router.refresh();
                } catch {
                  setResult({
                    ok: false,
                    message: t("passengers.form.failed", locale),
                  });
                }
              });
            }}
          >
            <input type="hidden" name="action" value={descriptor.action} />
            <input
              type="hidden"
              name="passengerId"
              value={passenger?.passengerId ?? ""}
            />
            <fieldset
              disabled={pending || result?.ok}
              style={{
                border: 0,
                padding: 0,
                margin: 0,
                display: "grid",
                gap: 12,
              }}
            >
              {changesDetails ? (
                fields.map(([name, key, type]) => (
                  <label
                    key={name}
                    style={{ display: "grid", gap: 6, fontSize: 12.5 }}
                  >
                    {t(key, locale)}
                    {name === "fullName" ? " *" : ""}
                    <input
                      name={name}
                      type={type}
                      required={name === "fullName"}
                      defaultValue={passenger?.[name] ?? ""}
                      style={fieldStyle}
                    />
                  </label>
                ))
              ) : (
                <p style={{ margin: 0, lineHeight: 1.6, fontSize: 13 }}>
                  {t(`passengers.form.confirm.${descriptor.action}`, locale)}
                </p>
              )}
              {descriptor.requiresReason ? (
                <label style={{ display: "grid", gap: 6, fontSize: 12.5 }}>
                  {t("passengers.form.reason", locale)} *
                  <textarea
                    name="reason"
                    required
                    rows={3}
                    style={fieldStyle}
                  />
                </label>
              ) : null}
            </fieldset>
            {result ? (
              <p
                role={result.ok ? "status" : "alert"}
                style={{ lineHeight: 1.6, fontSize: 13 }}
              >
                {result.message}
              </p>
            ) : null}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 20,
              }}
            >
              <button
                type="button"
                disabled={pending}
                style={buttonStyle}
                onClick={() => setOpen(false)}
              >
                {t(
                  result?.ok
                    ? "passengers.form.close"
                    : "passengers.form.cancel",
                  locale,
                )}
              </button>
              {!result?.ok ? (
                <button
                  type="submit"
                  disabled={pending}
                  style={{
                    ...buttonStyle,
                    background: theme.accent,
                    color: theme.bgRaised,
                  }}
                >
                  {t(
                    pending ? "passengers.form.saving" : "passengers.form.save",
                    locale,
                  )}
                </button>
              ) : null}
            </div>
          </form>
        </dialog>
      ) : null}
    </>
  );
}
