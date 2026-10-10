"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { PassengerClient } from "@drts/passenger-client";
import {
  P5Phone,
  P5Header,
  P5Card,
  P5,
  P5Btn,
  P5Notice,
} from "../components/p5-ui";
import { P5E19a } from "../components/booking/e19a";
import { P5E19b } from "../components/booking/e19b";
import { BookingForm } from "../components/booking/BookingForm";
import type { FareQuoteResponse, FaresResponse } from "@drts/contracts";
import type { AddressPayload } from "@drts/ui-web";
import { bookingTranslations as t } from "../lib/booking/translations";

export default function BookingPage() {
  const router = useRouter();
  const [client] = useState(() => new PassengerClient({ baseUrl: "" }));
  const [status, setStatus] = useState<
    "loading" | "e19a" | "form" | "confirm" | "p5a04"
  >("loading");

  // Account state not needed currently
  const [fares, setFares] = useState<FaresResponse | null>(null);
  const [settings, setSettings] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Quote State
  const [quoteData, setQuoteData] = useState<{
    origin: AddressPayload;
    destination: AddressPayload;
    scheduledAt: string;
    quote: FareQuoteResponse;
  } | null>(null);

  const [draft, setDraft] = useState<{
    origin: AddressPayload | null;
    destination: AddressPayload | null;
    scheduledAt: string | null;
  }>({ origin: null, destination: null, scheduledAt: null });

  const [e19bChecked, setE19bChecked] = useState(false);

  // Expiration handling
  const quoteTimerRef = useRef<NodeJS.Timeout | null>(null);

  const init = async () => {
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
      let currentSettings: any = null;
      try {
        currentSettings = await client.getSettings();
      } catch (err: any) {
        console.warn("Settings fetch failed:", err.message);
      }

      setFares(currentFares);
      setSettings(currentSettings);

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
  };

  useEffect(() => {
    init();

    return () => {
      if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);
    };
  }, [client, router]);

  const handleAgreeE19a = async () => {
    if (!fares) return;
    try {
      await client.updateAccount({
        feeAcknowledgementVersion: fares.currentVersion.version,
      });
      setStatus("form");
    } catch (err: any) {
      setError(t.error.updateFeeFailed + err.message);
    }
  };

  const handleQuoteReady = async (data: {
    origin: AddressPayload;
    destination: AddressPayload;
    scheduledAt: string;
  }) => {
    setError(null);
    setDraft(data);
    const selectedTime = new Date(data.scheduledAt).getTime();
    const minLeadTime = settings?.booking?.minLeadTimeMinutes;
    if (typeof minLeadTime !== "number" || isNaN(minLeadTime) || minLeadTime < 0) {
      setError("無法取得預約設定，請稍後重試");
      return;
    }
    const minTime = Date.now() + minLeadTime * 60000;
    if (selectedTime < minTime) {
      setError("預約時間不符合最短前置時間規定");
      return;
    }

    try {
      const quote = await client.getFareQuote({
        originLat: data.origin.lat!,
        originLng: data.origin.lng!,
        destinationLat: data.destination.lat!,
        destinationLng: data.destination.lng!,
        scheduledAt: data.scheduledAt,
      });

      if (quote.serviceAreaResult === "not_serviceable") {
        setError(t.error.notServiceable);
        return;
      }

      setQuoteData({ ...data, quote });
      setStatus("confirm");
      setE19bChecked(false);

      if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);
      const expiresMs = new Date(quote.expiresAt).getTime() - Date.now();
      if (expiresMs > 0) {
        quoteTimerRef.current = setTimeout(() => {
          setError(t.error.quoteExpired);
          setStatus("form");
        }, expiresMs);
      } else {
        // handle expired immediately
        setError(t.error.quoteExpired);
        setStatus("form");
      }
    } catch (err: any) {
      if (err.status === 401) {
        router.push("/login");
        return;
      }
      // Handle P5-A04 case (Quote failed)
      if (err.status === 404 || err.status === 503) {
        setStatus("p5a04");
      } else {
        setError(t.error.quoteFailedGeneric + err.message);
      }
    }
  };

  const handleConfirmOrder = async () => {
    if (!quoteData) return;
    if (quoteData.quote.serviceAreaResult === "not_serviceable") return;

    // Check expiration on submit (R6 fix part 1)
    if (new Date(quoteData.quote.expiresAt).getTime() <= Date.now()) {
      setError(t.error.quoteExpired);
      setStatus("form");
      return;
    }

    const selectedTime = new Date(quoteData.scheduledAt).getTime();
    const minLeadTime = settings?.booking?.minLeadTimeMinutes;
    if (typeof minLeadTime !== "number" || isNaN(minLeadTime) || minLeadTime < 0) {
      setError("無法取得預約設定，請稍後重試");
      setStatus("form");
      return;
    }
    const minTime = Date.now() + minLeadTime * 60000;
    if (selectedTime < minTime) {
      setError("預約時間不符合最短前置時間規定");
      setStatus("form");
      return;
    }

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
        let domainCode = undefined;
        try {
          const body = await res.json();
          if (body?.error && typeof body.error === 'object') {
            domainCode = body.error.code;
          } else {
            domainCode = body?.error || body?.domainCode || body?.code;
          }
        } catch {
          // ignore json parse error
        }
        const errorMsg = domainCode
          ? `API error: ${res.status} (${domainCode})`
          : `API error: ${res.status}`;
        const err = new Error(errorMsg) as any;
        err.status = res.status;
        err.domainCode = domainCode;
        throw err;
      }

      // 送出後進入行程頁
      router.push("/ride");
    } catch (err: any) {
      if (err.status === 401) {
        router.push("/login");
        return;
      }
      if (err.status === 409 && err.domainCode === "quote_expired") {
        setError(t.error.quoteExpired);
        setStatus("form");
      } else if (err.status === 404 || err.status === 503) {
        setStatus("p5a04");
      } else {
        setError(t.error.orderFailed + err.message);
        setStatus("form");
      }
    }
  };

  if (status === "loading") {
    return (
      <P5Phone url="ride.smarttransport.tw">
        <P5Header status={t.fares.loading} />
        <div style={{ padding: 14 }}>
          {error ? (
            <P5Card title={t.error.systemError}>
              <div style={{ color: P5.danger, marginBottom: 12 }}>{error}</div>
              <div onClick={() => { setError(null); init(); }}>
                <P5Btn kind="primary" icon="refresh">重試</P5Btn>
              </div>
            </P5Card>
          ) : (
            <P5Card title={t.systemInit.title}>
              <div style={{ color: P5.mut, fontSize: 12 }}>
                {t.systemInit.loadingSession}
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
        error={error}
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
        paymentMethod={t.e19b.paymentMethod}
        fareVersion={q.fareVersion}
      />
    );
  }

  if (status === "p5a04") {
    return (
      <P5Phone>
        <P5Header status="正在確認預約" />
        <P5Map state="missing" />
        <P5RouteFare
          mode="anomaly"
          pickup={quoteData?.origin.address}
          dropoff={quoteData?.destination.address}
        />
        <div
          style={{
            margin: "0 14px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            onClick={() => {
              if (draft.origin && draft.destination && draft.scheduledAt) {
                handleQuoteReady(draft as any);
              } else {
                setStatus("form");
              }
            }}
          >
            <P5Btn kind="primary" icon="refresh" disabled={false}>
              重新取得報價
            </P5Btn>
          </div>
          <a href="tel:02-2944-0985" style={{ textDecoration: "none" }}>
            <P5Btn icon="phone" disabled={false}>
              聯絡客服
            </P5Btn>
          </a>
        </div>
        <div
          style={{
            margin: "0 14px",
            fontSize: 10.5,
            color: P5.dim,
            textAlign: "center",
          }}
        >
          正式報價完成前不會為您確認訂單
        </div>
        <P5Notice />
      </P5Phone>
    );
  }

  return (
    <BookingForm
      onQuoteReady={handleQuoteReady}
      error={error}
      onClearError={() => setError(null)}
      minLeadTimeMinutes={settings?.booking?.minLeadTimeMinutes ?? 0}
      initialDraft={draft}
    />
  );
}
