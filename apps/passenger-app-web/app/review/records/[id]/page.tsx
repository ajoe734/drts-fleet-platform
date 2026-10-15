"use client";
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
          if (active) setError("無法讀取本人同單演練紀錄，請重新登入後重試。");
        });
    return () => {
      active = false;
    };
  }, [enabled, id]);
  return (
    <main style={{ padding: 18 }}>
      <h1>演練紀錄・非正式憑證</h1>
      <p>訂單 UUID：{id}</p>
      <p role="alert">{error}</p>
      {record && (
        <>
          <p>{record.notice}</p>
          <p>
            狀態：{record.ride.order.status}；付款：
            {record.ride.payment?.status ?? "未扣款"}；扣款次數：
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
            下載演練紀錄 HTML
          </button>
        </>
      )}
      <p>
        <a href={`/rides/${encodeURIComponent(id)}`}>回同單行程</a>
      </p>
    </main>
  );
}
