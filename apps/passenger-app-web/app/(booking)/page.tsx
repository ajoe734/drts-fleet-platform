"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { PassengerClient } from "@drts/passenger-client";
import { P5Phone, P5Header, P5Card, P5 } from "../../components/p5-ui";
import { P5E19a } from "../../components/booking/e19a";
import { P5E19b } from "../../components/booking/e19b";
import { BookingForm } from "../../components/booking/BookingForm";
import type { FareQuoteResponse, FaresResponse } from "@drts/contracts";
import type { AddressPayload } from "@drts/ui-web";

export default function BookingPage() {
  const router = useRouter();
  const [client] = useState(() => new PassengerClient({ baseUrl: "" }));
  const [status, setStatus] = useState<"loading" | "e19a" | "form" | "confirm">(
    "loading",
  );

  // Account state not needed currently
  const [fares, setFares] = useState<FaresResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Quote State
  const [quoteData, setQuoteData] = useState<{
    origin: AddressPayload;
    destination: AddressPayload;
    scheduledAt: string;
    quote: FareQuoteResponse;
  } | null>(null);

  const [e19bChecked, setE19bChecked] = useState(false);

  // Expiration handling
  const quoteTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const session = await client.getSessionStatus();
        if (!session.isActive) {
          router.push("/login");
          return;
        }

        const [acc, currentFares] = await Promise.all([
          client.getAccount(),
          client.getFares(),
        ]);

        setFares(currentFares);

        if (
          acc.feeAcknowledgementVersion !== currentFares.currentVersion.version
        ) {
          setStatus("e19a");
        } else {
          setStatus("form");
        }
      } catch (err: any) {
        setError(err.message || "Failed to initialize");
      }
    }
    init();
  }, [client, router]);

  const handleAgreeE19a = async () => {
    if (!fares) return;
    try {
      await fetch("/api/passenger-app/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeAcknowledgementVersion: fares.currentVersion.version,
        }),
      });
      setStatus("form");
    } catch (err: any) {
      setError("無法更新費用確認紀錄：" + err.message);
    }
  };

  const handleQuoteReady = async (data: {
    origin: AddressPayload;
    destination: AddressPayload;
    scheduledAt: string;
  }) => {
    setError(null);
    try {
      const quote = await client.getFareQuote({
        originLat: data.origin.lat!,
        originLng: data.origin.lng!,
        destinationLat: data.destination.lat!,
        destinationLng: data.destination.lng!,
        scheduledAt: data.scheduledAt,
      });

      if (quote.serviceAreaResult === "not_serviceable") {
        setError("很抱歉，該地點超出目前服務範圍。");
        return;
      }

      setQuoteData({ ...data, quote });
      setStatus("confirm");
      setE19bChecked(false);

      if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);
      const expiresMs = new Date(quote.expiresAt).getTime() - Date.now();
      if (expiresMs > 0) {
        quoteTimerRef.current = setTimeout(() => {
          setError("報價已過期，請重新試算");
          setStatus("form");
        }, expiresMs);
      }
    } catch (err: any) {
      // Handle P5-A04 case (Quote failed)
      setError(
        err.message === "API error: 404"
          ? "無法取得報價 (P5-A04)"
          : "取得報價失敗：" + err.message,
      );
    }
  };

  const handleConfirmOrder = async () => {
    if (!quoteData) return;
    if (quoteData.quote.serviceAreaResult === "not_serviceable") return;

    try {
      // 依合約發送叫車指令
      // API call to POST /api/passenger-app/rides
      const res = await fetch("/api/passenger-app/rides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledAt: quoteData.scheduledAt,
          origin: {
            lat: quoteData.origin.lat!,
            lng: quoteData.origin.lng!,
            address: quoteData.origin.addressName,
          },
          destination: {
            lat: quoteData.destination.lat!,
            lng: quoteData.destination.lng!,
            address: quoteData.destination.addressName,
          },
          paymentMethodId: "pending_payment_selection", // PAX-WEB-PAYMENT-UI 會補上
          fareSnapshotId: quoteData.quote.fareSnapshotId,
          passengerConfirmedAt: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        throw new Error("API error: " + res.status);
      }

      // 送出後進入行程頁
      router.push("/ride");
    } catch (err: any) {
      setError("建立訂單失敗：" + err.message);
      setStatus("form");
    }
  };

  if (status === "loading") {
    return (
      <P5Phone url="ride.smarttransport.tw">
        <P5Header status="載入中..." />
        <div style={{ padding: 14 }}>
          {error ? (
            <div style={{ color: P5.danger }}>{error}</div>
          ) : (
            <P5Card title="系統初始化">
              <div style={{ color: P5.mut, fontSize: 12 }}>
                Loading session...
              </div>
            </P5Card>
          )}
        </div>
      </P5Phone>
    );
  }

  if (status === "e19a" && fares) {
    return (
      <P5E19a
        fareVersion={fares.currentVersion.version}
        effectiveAt={fares.currentVersion.effectiveAt}
        onAgree={handleAgreeE19a}
      />
    );
  }

  if (
    status === "confirm" &&
    quoteData &&
    quoteData.quote.serviceAreaResult !== "not_serviceable"
  ) {
    const q = quoteData.quote;
    const formatTime = (iso: string) => {
      const d = new Date(iso);
      const isToday = new Date().toDateString() === d.toDateString();
      const HHmm = d.toTimeString().substring(0, 5);
      return isToday
        ? `今日 ${HHmm}`
        : `${d.getMonth() + 1}/${d.getDate()} ${HHmm}`;
    };

    return (
      <P5E19b
        checked={e19bChecked}
        onCheckedChange={setE19bChecked}
        onConfirm={handleConfirmOrder}
        onCancel={() => {
          if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);
          setStatus("form");
        }}
        originTitle={
          quoteData.origin.addressName || quoteData.origin.address || "未知地點"
        }
        destinationTitle={
          quoteData.destination.addressName ||
          quoteData.destination.address ||
          "未知地點"
        }
        scheduledAt={formatTime(quoteData.scheduledAt)}
        quoteMin={q.estimatedMin}
        quoteMax={q.estimatedMax}
        paymentMethod="請至付款設定選擇"
      />
    );
  }

  return (
    <BookingForm
      onQuoteReady={handleQuoteReady}
      error={error}
      onClearError={() => setError(null)}
    />
  );
}
