"use client";

import { useEffect, useState } from "react";
import type { TenantInvoiceMailView } from "@drts/contracts";
import { readInvoiceMail, sendInvoiceMail } from "./mail-actions";
import { invoiceMailCopy } from "./mail-translations";

export function InvoiceMailPanel({
  invoiceId,
  locale,
}: {
  invoiceId: string;
  locale: "en" | "zh";
}) {
  const copy = invoiceMailCopy[locale];
  const [view, setView] = useState<TenantInvoiceMailView | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setView(null);
    setFailed(false);
    void readInvoiceMail(invoiceId)
      .then((result) => {
        if (!active) return;
        if (result.ok) setView(result.view);
        else setFailed(true);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [invoiceId]);

  async function act(send: boolean) {
    setBusy(true);
    setFailed(false);
    try {
      const result = await (send
        ? sendInvoiceMail(invoiceId)
        : readInvoiceMail(invoiceId));
      if (result.ok) setView(result.view);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const terminal =
    view?.status === "sent" ||
    (view?.status === "failed" && !view.nextAttemptAt);
  return (
    <section aria-label={copy.title}>
      <h3>{copy.title}</h3>
      <p>{copy.recipient}</p>
      <p role="status">{view ? copy.status[view.status] : copy.loading}</p>
      {failed && <p role="alert">{copy.error}</p>}
      {view?.sentAt && (
        <p>
          {copy.acceptedAt}: {view.sentAt}
        </p>
      )}
      {view?.nextAttemptAt && (
        <p>
          {copy.nextAttempt}: {view.nextAttemptAt}
        </p>
      )}
      {view && (
        <ol>
          {view.attempts.map((attempt) => (
            <li key={attempt.attemptNo}>
              {attempt.startedAt} — {copy.outcome[attempt.outcome]}
              {attempt.errorCode ? ` (${attempt.errorCode})` : ""}
            </li>
          ))}
        </ol>
      )}
      <button
        type="button"
        disabled={busy || !view || !view?.canSend || terminal}
        onClick={() => void act(true)}
      >
        {view?.status === "not_requested" ? copy.send : copy.retry}
      </button>{" "}
      <button type="button" disabled={busy} onClick={() => void act(false)}>
        {copy.refresh}
      </button>
      {!view?.canSend && <p>{copy.readOnly}</p>}
    </section>
  );
}
