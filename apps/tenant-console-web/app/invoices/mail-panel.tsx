"use client";

import { useEffect, useRef, useState } from "react";
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
  return (
    <InvoiceMailForInvoice
      key={invoiceId}
      invoiceId={invoiceId}
      locale={locale}
    />
  );
}

function InvoiceMailForInvoice({
  invoiceId,
  locale,
}: {
  invoiceId: string;
  locale: "en" | "zh";
}) {
  const copy = invoiceMailCopy(locale);
  const [view, setView] = useState<TenantInvoiceMailView | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const pendingKey = useRef<string | null>(null);
  const inFlight = useRef(false);
  const readGeneration = useRef(0);

  useEffect(() => {
    let active = true;
    const generation = ++readGeneration.current;
    setView(null);
    setFailed(false);
    void readInvoiceMail(invoiceId)
      .then((result) => {
        if (!active || generation !== readGeneration.current) return;
        if (result.ok) setView(result.view);
        else setFailed(true);
      })
      .catch(() => {
        if (active && generation === readGeneration.current) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [invoiceId]);

  async function act(send: boolean) {
    if (inFlight.current) return;
    if (
      send &&
      !pendingKey.current &&
      view?.status !== "not_requested" &&
      !window.confirm(copy.confirm)
    )
      return;
    inFlight.current = true;
    readGeneration.current += 1;
    setBusy(true);
    setFailed(false);
    try {
      const result = await (send
        ? sendInvoiceMail(
            invoiceId,
            (pendingKey.current ??= crypto.randomUUID()),
          )
        : readInvoiceMail(invoiceId));
      if (result.ok) {
        setView(result.view);
        if (send) {
          pendingKey.current = null;
          setUncertain(false);
        }
      } else {
        setFailed(true);
        if (send) {
          if (result.definitive) pendingKey.current = null;
          setUncertain(!result.definitive);
        }
      }
    } catch {
      setFailed(true);
      if (send) setUncertain(true);
    } finally {
      inFlight.current = false;
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
      {failed && <p role="alert">{uncertain ? copy.uncertain : copy.error}</p>}
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
        disabled={
          busy ||
          !view?.canSend ||
          (!pendingKey.current && view.status !== "not_requested" && !terminal)
        }
        onClick={() => void act(true)}
      >
        {uncertain ? copy.retry : terminal ? copy.resend : copy.send}
      </button>{" "}
      <button type="button" disabled={busy} onClick={() => void act(false)}>
        {copy.refresh}
      </button>
      {view && !view.canSend && <p>{copy.readOnly}</p>}
      {view && view.deliveries.length > 0 && (
        <details>
          <summary>{copy.history}</summary>
          <ol>
            {view.deliveries.map((delivery) => (
              <li key={delivery.deliveryId}>
                {delivery.queuedAt} — {copy.status[delivery.status]}
                <ol>
                  {delivery.attempts.map((attempt) => (
                    <li key={attempt.attemptNo}>
                      {attempt.startedAt} — {copy.outcome[attempt.outcome]}
                      {attempt.errorCode ? ` (${attempt.errorCode})` : ""}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
