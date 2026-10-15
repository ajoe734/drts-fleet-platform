"use client";
import { useState } from "react";
import Link from "next/link";
import { useReviewDemo } from "./review-context";

export function ReviewRideControls({ orderId }: { orderId: string }) {
  const review = useReviewDemo();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (!review) return null;
  return (
    <section aria-label="演練同單核對" style={{ padding: 12 }}>
      <p>
        真實訂單 UUID：<output data-testid="review-order-id">{orderId}</output>
      </p>
      <p>
        調度與司機視窗必須核對同一 UUID。付款結果由模擬 PSP
        寫入真實演練付款紀錄。
      </p>
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
            setMessage(
              "已交由原付款程序處理；未到重試時間不會提早扣款。請等待行程付款狀態更新。",
            );
          } catch {
            setMessage("補繳未完成，請確認登入與付款配置後重試。");
          } finally {
            setBusy(false);
          }
        }}
      >
        依既有政策重試演練付款
      </button>
      <p role="status">{message}</p>
      <Link href={`/review/records/${encodeURIComponent(orderId)}`}>
        下載同單演練紀錄（非正式憑證）
      </Link>
    </section>
  );
}
