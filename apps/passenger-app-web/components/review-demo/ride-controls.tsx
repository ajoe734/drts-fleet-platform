"use client";
import { t } from "./translations";

import { useState } from "react";
import Link from "next/link";
import { useReviewDemo } from "./review-context";

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
            setMessage(t.retryQueued);
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
