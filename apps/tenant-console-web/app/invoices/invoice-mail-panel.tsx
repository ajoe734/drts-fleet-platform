"use client";

import { useEffect, useRef, useState } from "react";
import type { TenantInvoiceMailDelivery } from "@drts/contracts";
import { ApiClientError } from "@drts/api-client";
import { createBrowserApiClient } from "../../lib/browser-api-client";

import { t, type Locale } from "../../lib/translations";

function mailLabels(locale: Locale) {
  return {
    title: t("invoices.mail.title", locale),
    send: t("invoices.mail.send", locale),
    resend: t("invoices.mail.resend", locale),
    retry: t("invoices.mail.retry", locale),
    refresh: t("invoices.mail.refresh", locale),
    busy: t("invoices.mail.busy", locale),
    note: t("invoices.mail.note", locale),
    confirm: t("invoices.mail.confirm", locale),
    empty: t("invoices.mail.empty", locale),
    error: t("invoices.mail.error", locale),
    unknown: t("invoices.mail.unknown", locale),
    queued: t("invoices.mail.queued", locale),
    sent: t("invoices.mail.sent", locale),
    failed: t("invoices.mail.failed", locale),
    attempts: t("invoices.mail.attempts", locale),
    next: t("invoices.mail.next", locale),
    reason: t("invoices.mail.reason", locale),
  };
}

export function InvoiceMailPanel({
  invoiceId,
  locale,
}: {
  invoiceId: string;
  locale: Locale;
}) {
  const text = mailLabels(locale);
  const [deliveries, setDeliveries] = useState<TenantInvoiceMailDelivery[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const pendingKey = useRef<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    createBrowserApiClient()
      .listInvoiceMailDeliveries(invoiceId)
      .then(
        (items) => {
          if (active) setDeliveries(items);
        },
        () => {
          if (active) setError(text.error);
        },
      );
    return () => {
      active = false;
    };
  }, [invoiceId, text.error]);

  async function refresh() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      setDeliveries(
        await createBrowserApiClient().listInvoiceMailDeliveries(invoiceId),
      );
      setError("");
    } catch {
      setError(text.error);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function send() {
    if (inFlight.current) return;
    if (
      !pendingKey.current &&
      deliveries.length > 0 &&
      !window.confirm(text.confirm)
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      pendingKey.current ??= crypto.randomUUID();
      const receipt = await createBrowserApiClient().sendInvoiceMail(
        invoiceId,
        pendingKey.current,
      );
      setDeliveries((items) =>
        [
          receipt,
          ...items.filter((item) => item.deliveryId !== receipt.deliveryId),
        ].slice(0, 20),
      );
      pendingKey.current = null;
      setUncertain(false);
    } catch (failure) {
      const rejected =
        failure instanceof ApiClientError &&
        [400, 401, 403, 404, 409].includes(failure.statusCode);
      // A definitive rejection may be corrected with a new intentional send.
      // Keep the key after ambiguous HTTP/network failure. Never auto-resend.
      if (rejected) pendingKey.current = null;
      setUncertain(!rejected);
      setError(rejected ? text.error : text.unknown);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <section aria-label={text.title}>
      <h3>{text.title}</h3>
      <p>{text.note}</p>
      <button type="button" onClick={() => void send()} disabled={busy}>
        {busy
          ? text.busy
          : uncertain
            ? text.retry
            : deliveries.length
              ? text.resend
              : text.send}
      </button>{" "}
      <button type="button" onClick={() => void refresh()} disabled={busy}>
        {text.refresh}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      <div role="status" aria-live="polite">
        {deliveries.length === 0 ? (
          <p>{text.empty}</p>
        ) : (
          <ul>
            {deliveries.map((item) => (
              <li key={item.deliveryId}>
                <time dateTime={item.queuedAt}>{item.queuedAt}</time> —{" "}
                {text[item.status]} · {text.attempts}: {item.attempts.length}
                {item.nextAttemptAt ? (
                  <>
                    {" "}
                    · {text.next}:{" "}
                    <time dateTime={item.nextAttemptAt}>
                      {item.nextAttemptAt}
                    </time>
                  </>
                ) : null}
                {item.status !== "sent" && item.attempts.at(-1)?.errorCode ? (
                  <>
                    {" "}
                    · {text.reason}: {item.attempts.at(-1)?.errorCode}
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
