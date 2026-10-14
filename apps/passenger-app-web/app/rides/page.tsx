"use client";
import { t } from "../../components/ride/translations";
import { useEffect, useState } from "react";
import Link from "next/link";
import { passengerClient } from "../../lib/client";
import { passengerChrome } from "../../lib/passenger-presentation";
import type { PassengerRideAuthorityView } from "@drts/contracts";
import { HistoryScreen } from "../../components/demo/demo-history-screen";
import { isDemoMode } from "../../lib/demo/store";
import {
  P5Phone,
  P5Header,
  P5Card,
  P5Btn,
  P5Icon,
} from "../../components/p5-ui";

function formatFare(ride: PassengerRideAuthorityView): string {
  const fareMinor =
    ride.assignment?.routeFare?.payableFareMinor ??
    ride.assignment?.routeFare?.estimatedFareMinor ??
    ride.receipt?.amountMinor ??
    (ride.order as any)?.estimatedFareMinor;
  if (fareMinor !== undefined && fareMinor !== null) {
    return `車資 NT$ ${Math.round(fareMinor / 100)}`;
  }
  return "車資 --";
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

export default function RidesListPage() {
  const [isDemo, setIsDemo] = useState(false);
  const [active, setActive] = useState<PassengerRideAuthorityView[]>([]);
  const [history, setHistory] = useState<PassengerRideAuthorityView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadInitial = async () => {
    setLoading(true);
    setError(null);
    try {
      const [activeRes, historyRes] = await Promise.all([
        passengerClient.getActiveRides(),
        passengerClient.getRides({ limit: 20 }),
      ]);
      const activeRides = activeRes.rides || [];
      const activeIds = new Set(activeRides.map((r) => r.order.orderId));

      setActive(activeRides);
      const seen = new Set(activeIds);
      const uniqueHistory: PassengerRideAuthorityView[] = [];
      for (const r of historyRes.rides || []) {
        const id = r?.order?.orderId;
        if (id && !seen.has(id)) {
          seen.add(id);
          uniqueHistory.push(r);
        }
      }
      setHistory(uniqueHistory);
      setNextCursor(historyRes.nextCursor || null);
    } catch (err) {
      console.error(err);
      setError("無法載入行程紀錄，請稍後再試。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined" && isDemoMode()) {
      setIsDemo(true);
      return;
    }
    loadInitial();
  }, []);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await passengerClient.getRides({
        limit: 20,
        cursor: nextCursor,
      });
      setHistory((prev) => {
        const existingIds = new Set([
          ...active.map((r) => r.order.orderId),
          ...prev.map((r) => r.order.orderId),
        ]);
        const next: PassengerRideAuthorityView[] = [];
        for (const ride of res.rides || []) {
          const id = ride?.order?.orderId;
          if (id && !existingIds.has(id)) {
            existingIds.add(id);
            next.push(ride);
          }
        }
        return [...prev, ...next];
      });
      setNextCursor(res.nextCursor || null);
    } catch (err) {
      console.error("載入更多失敗", err);
    } finally {
      setLoadingMore(false);
    }
  };

  if (isDemo) {
    return <HistoryScreen />;
  }

  if (loading) {
    return (
      <div style={{ padding: 20, color: passengerChrome.text }}>
        {t.Loading}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 20, color: passengerChrome.text }}>
        <p>{error}</p>
        <button onClick={loadInitial} style={{ padding: "8px 16px" }}>
          {t.Retry}
        </button>
      </div>
    );
  }

  if (active.length === 0 && history.length === 0) {
    return (
      <main
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100dvh",
          background: passengerChrome.background,
          padding: "20px 12px",
          fontFamily: passengerChrome.fontFamily,
        }}
      >
        <P5Phone url="ride.smarttransport.tw/rides">
          <P5Header status="行程紀錄" order="" />
          <div
            style={{
              padding: "32px 14px",
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <P5Icon
              name="car"
              size={48}
              style={{ color: passengerChrome.border }}
            />
            <div style={{ color: passengerChrome.muted, fontSize: 15 }}>
              {t.NoActiveRides}
            </div>
            <div style={{ marginTop: 16, width: "100%", maxWidth: 200 }}>
              <Link href="/" style={{ textDecoration: "none" }}>
                <P5Btn kind="primary">{t.BookRide}</P5Btn>
              </Link>
            </div>
          </div>
        </P5Phone>
      </main>
    );
  }

  return (
    <main
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100dvh",
        background: passengerChrome.background,
        padding: "20px 12px",
        fontFamily: passengerChrome.fontFamily,
      }}
    >
      <P5Phone url="ride.smarttransport.tw/rides">
        <P5Header status={t.RideHistory} order="" />
        <div style={{ padding: "16px 0", flex: 1, overflowY: "auto" }}>
          {active.map((ride) => (
            <P5Card
              key={ride.order.orderId}
              title={t.ActiveRideTitle}
              tag={
                <span
                  style={{
                    background: passengerChrome.shell,
                    color: passengerChrome.card,
                    padding: "2px 6px",
                    borderRadius: 4,
                    fontSize: 10,
                    marginLeft: 8,
                  }}
                >
                  {t.InProgress}
                </span>
              }
            >
              <div
                style={{
                  fontSize: 12,
                  color: passengerChrome.muted,
                  marginBottom: 4,
                }}
              >
                {formatTime(ride.order.requestedPickupAt)}
              </div>
              <div style={{ fontSize: 14 }}>{ride.order.pickup.address}</div>
              <div style={{ marginTop: 8 }}>
                <Link
                  href={`/rides/${ride.order.orderId}`}
                  style={{ textDecoration: "none" }}
                >
                  <P5Btn kind="secondary">{t.ViewRide}</P5Btn>
                </Link>
              </div>
            </P5Card>
          ))}

          {history.length > 0 && (
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: passengerChrome.muted,
                padding: "8px 14px 4px",
              }}
            >
              {t.History}
            </div>
          )}

          {history.map((ride) => {
            const isCompleted = ride.order.status === "completed";
            const isCancelled = ride.order.status === "cancelled";
            const needsRating = ride.actions?.canRate;

            return (
              <P5Card
                key={ride.order.orderId}
                title={isCompleted ? "已完成" : isCancelled ? "已取消" : "行程"}
                dimmed={isCancelled}
              >
                <Link
                  href={`/rides/${ride.order.orderId}`}
                  style={{
                    textDecoration: "none",
                    color: "inherit",
                    display: "block",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 12,
                          color: passengerChrome.muted,
                          marginBottom: 4,
                        }}
                      >
                        {formatTime(ride.order.requestedPickupAt)}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>
                        {isCompleted
                          ? formatFare(ride)
                          : isCancelled
                            ? "乘客取消"
                            : ride.order.pickup.address}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: passengerChrome.muted,
                          marginTop: 2,
                        }}
                      >
                        {ride.order.pickup.address}
                      </div>
                    </div>
                    {needsRating ? (
                      <div
                        style={{
                          alignSelf: "center",
                          marginLeft: 12,
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            padding: "6px 12px",
                            borderRadius: 8,
                            background: passengerChrome.shell,
                            color: passengerChrome.card,
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {t.WriteReview}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </Link>
              </P5Card>
            );
          })}

          {nextCursor ? (
            <div style={{ padding: "0 14px 16px" }}>
              <button
                type="button"
                onClick={loadingMore ? undefined : loadMore}
                disabled={loadingMore}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  minHeight: 46,
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: loadingMore ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  border: `1px solid ${passengerChrome.border}`,
                  background: passengerChrome.card,
                  color: passengerChrome.text,
                }}
              >
                {loadingMore ? "載入中..." : "載入更多"}
              </button>
            </div>
          ) : null}
        </div>
      </P5Phone>
    </main>
  );
}
