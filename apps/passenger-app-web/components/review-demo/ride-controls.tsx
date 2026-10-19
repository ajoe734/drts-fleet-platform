"use client";
import { t } from "./translations";

import { useState } from "react";
import Link from "next/link";
import { useReviewDemo } from "./review-context";
import { passengerPaymentDisplay } from "../../../../packages/passenger-client/src/payment/state";

export function ReviewRideControls({ orderId }: { orderId: string }) {
  const review = useReviewDemo();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
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
          try {
            const response = await fetch(
              `/api/passenger-app/review-demo/rides/${encodeURIComponent(orderId)}/retry-payment`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              },
            );
            if (!response.ok) throw new Error("retry_failed");
            const body = await response.json().catch(() => null);
            const payment = (body?.data?.payment ?? null) as
              | { status?: string }
              | null;
            // Show the authoritative same-order payment state the retry call
            // just read back, not a stale "queued" message after it resolves.
            setMessage(passengerPaymentDisplay(payment?.status).label);
          } catch {
            setMessage(t.retryFailed);
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
