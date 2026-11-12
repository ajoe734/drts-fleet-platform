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
import type { ResourceActionDescriptor } from "@drts/contracts";
import { CanvasBtn, buildCanvasTheme } from "@drts/ui-web";
import { t, type Locale } from "../../lib/translations";
import {
  generateInvoiceFromBilling,
  type InvoiceGenerationResult,
} from "./actions";

const theme = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});
const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 36,
  padding: "7px 10px",
  boxSizing: "border-box",
  borderRadius: 7,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  font: "inherit",
};

type InvoiceGenerationFormProps = {
  descriptor: ResourceActionDescriptor | null;
  locale: Locale;
};

export function InvoiceGenerationForm({
  descriptor,
  locale,
}: InvoiceGenerationFormProps) {
  const router = useRouter();
  const id = useId();
  const active = useRef(true);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<InvoiceGenerationResult | null>(null);
  const enabled = descriptor?.enabled === true;
  const helpId = `${id}-period-help`;

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  return (
    <form
      aria-label={t("billing.generate.title", locale)}
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || !enabled) return;
        const data = new FormData(event.currentTarget);
        setResult(null);
        startTransition(async () => {
          try {
            const generated = await generateInvoiceFromBilling(data);
            if (!active.current) return;
            setResult(generated);
            if (generated.ok) router.push(generated.href);
          } catch {
            if (!active.current) return;
            setResult({
              ok: false,
              message: t("billing.generate.failed", locale),
            });
          }
        });
      }}
    >
      <p id={helpId}>{t("billing.generate.periodHelp", locale)}</p>
      <fieldset
        disabled={pending || !enabled}
        style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 12 }}
      >
        <label htmlFor={`${id}-start`}>
          {t("billing.generate.start", locale)}
        </label>
        <input
          id={`${id}-start`}
          name="periodStart"
          type="datetime-local"
          step="0.001"
          required
          aria-describedby={helpId}
          value={periodStart}
          onChange={(event) => {
            setPeriodStart(event.target.value);
            setResult(null);
          }}
          style={inputStyle}
        />
        <label htmlFor={`${id}-end`}>{t("billing.generate.end", locale)}</label>
        <input
          id={`${id}-end`}
          name="periodEnd"
          type="datetime-local"
          step="0.001"
          required
          aria-describedby={helpId}
          value={periodEnd}
          onChange={(event) => {
            setPeriodEnd(event.target.value);
            setResult(null);
          }}
          style={inputStyle}
        />
        <CanvasBtn
          theme={theme}
          type="submit"
          variant="primary"
          disabled={pending || !enabled}
        >
          {t(
            pending ? "billing.generate.pending" : "billing.generate.submit",
            locale,
          )}
        </CanvasBtn>
      </fieldset>
      {!enabled ? <p>{t("billing.generate.unavailable", locale)}</p> : null}
      {result ? (
        <p role={result.ok ? "status" : "alert"}>{result.message}</p>
      ) : null}
      {result?.ok ? (
        <a href={result.href}>{t("billing.generate.open", locale)}</a>
      ) : null}
      <p>{t("billing.generate.boundary", locale)}</p>
    </form>
  );
}
