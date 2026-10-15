"use client";
import { t } from "../../../../components/review-demo/translations";

import { useEffect, useState, use } from "react";
import {
  PassengerClient,
  renderPassengerReviewRecord,
  type PassengerReviewRecord,
} from "@drts/passenger-client";
import { useReviewDemo } from "../../../../components/review-demo/review-context";

export default function ReviewRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const enabled = useReviewDemo();
  const [record, setRecord] = useState<PassengerReviewRecord>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (enabled)
      void new PassengerClient({ baseUrl: "", fetchFn: fetch })
        .getReviewRecord(id)
        .then((result) => {
          if (active) setRecord(result);
        })
        .catch(() => {
          if (active) setError(t.recordFailed);
        });
    return () => {
      active = false;
    };
  }, [enabled, id]);
  return (
    <main style={{ padding: 18 }}>
      <h1>{t.recordTitle}</h1>
      <p>
        {t.recordOrderId}
        {id}
      </p>
      <p role="alert">{error}</p>
      {record && (
        <>
          <p>{record.notice}</p>
          <p>
            {t.recordStatus}
            {record.ride.order.status}
            {t.recordPayment}
            {record.ride.payment?.status ?? t.notCharged}
            {t.recordAttempts}
            {record.charge?.attemptCount ?? 0}
          </p>
          <p>
            {record.ride.order.pickup.address} →{" "}
            {record.ride.order.dropoff.address}
          </p>
          <button
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([renderPassengerReviewRecord(record)], {
                  type: "text/html;charset=utf-8",
                }),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = `review-${id}.html`;
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            {t.downloadHtml}
          </button>
        </>
      )}
      <p>
        <a href={`/rides/${encodeURIComponent(id)}`}>{t.backToRide}</a>
      </p>
    </main>
  );
}
