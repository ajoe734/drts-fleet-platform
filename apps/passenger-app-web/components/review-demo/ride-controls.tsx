"use client";
import { t } from "./translations";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useReviewDemo, useTrialMode } from "./review-context";
import { passengerPaymentDisplay } from "../../../../packages/passenger-client/src/payment/state";

// Re-read cadence for the same-order payment authority while it can still
// move (failed/authorized/manual_recovery/captured/no charge yet). Async paths
// such as the scheduled retry executor, a PSP callback or a completed refund
// (captured -> refunded) change it without this page, and this control does
// not subscribe to the ride SSE stream.
export const REVIEW_PAYMENT_SYNC_INTERVAL_MS = 10_000;
// Only refunded is terminal: no charge or refund write path leaves it.
const TERMINAL_PAYMENT_STATUSES = new Set(["refunded"]);

type PaymentRead = { status?: string } | null;

export function ReviewRideControls({ orderId }: { orderId: string }) {
  // The trial shows its own test-driver controls without the rehearsal UUID.
  const trial = useTrialMode();
  const review = useReviewDemo() && !trial;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<string | undefined>();
  // Every authority read gets a sequence number; only the newest one may
  // write, so a slow earlier read never overwrites a later captured state.
  const requestSeq = useRef(0);
  const appliedSeq = useRef(0);
  const orderRef = useRef(orderId);
  orderRef.current = orderId;

  const applyPayment = useCallback(
    (seq: number, forOrder: string, payment: PaymentRead) => {
      if (forOrder !== orderRef.current || seq < appliedSeq.current) return;
      appliedSeq.current = seq;
      if (!payment) return;
      setPaymentStatus(payment.status);
      setMessage(passengerPaymentDisplay(payment.status).label);
    },
    [],
  );

  const readAuthority = useCallback(async () => {
    const forOrder = orderRef.current;
    const seq = ++requestSeq.current;
    try {
      const response = await fetch(
        `/api/passenger-app/review-demo/rides/${encodeURIComponent(forOrder)}/record`,
        { cache: "no-store" },
      );
      if (!response.ok) return;
      const body = await response.json().catch(() => null);
      // Same getPassengerRideById authority view the ride page renders.
      applyPayment(
        seq,
        forOrder,
        (body?.data?.ride?.payment ?? null) as PaymentRead,
      );
    } catch {
      // A failed background read keeps the last authoritative message.
    }
  }, [applyPayment]);

  useEffect(() => {
    // Never carry order A's payment message onto order B.
    setMessage("");
    setPaymentStatus(undefined);
    appliedSeq.current = requestSeq.current;
    if (!review) return;
    void readAuthority();
    const onVisible = () => {
      if (document.visibilityState === "visible") void readAuthority();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [orderId, review, readAuthority]);

  const terminal =
    paymentStatus !== undefined && TERMINAL_PAYMENT_STATUSES.has(paymentStatus);
  useEffect(() => {
    if (!review || terminal) return;
    const timer = setInterval(() => {
      void readAuthority();
    }, REVIEW_PAYMENT_SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [orderId, review, terminal, readAuthority]);

  if (!review) return null;
  return (
    <section aria-label={t.rideLabel} style={{ padding: 12 }}>
      <p>
        {t.realOrderId}
        <output data-testid="review-order-id">{orderId}</output>
      </p>
      <p>{t.rideNotice}</p>
      <button
        disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          const forOrder = orderId;
          const seq = ++requestSeq.current;
          try {
            const response = await fetch(
              `/api/passenger-app/review-demo/rides/${encodeURIComponent(forOrder)}/retry-payment`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              },
            );
            if (!response.ok) throw new Error("retry_failed");
            const body = await response.json().catch(() => null);
            const payment = (body?.data?.payment ?? null) as PaymentRead;
            // Show the authoritative same-order payment state the retry call
            // just read back, not a stale "queued" message after it resolves.
            if (forOrder !== orderRef.current || seq < appliedSeq.current)
              return;
            appliedSeq.current = seq;
            setPaymentStatus(payment?.status);
            setMessage(passengerPaymentDisplay(payment?.status).label);
          } catch {
            if (forOrder === orderRef.current && seq >= appliedSeq.current) {
              appliedSeq.current = seq;
              setMessage(t.retryFailed);
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        {t.retryPayment}
      </button>
      <p role="status">{message}</p>
      <Link href={`/review/records/${encodeURIComponent(orderId)}`}>
        {t.downloadRecord}
      </Link>
    </section>
  );
}
