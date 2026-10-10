"use client";
import { t } from "../../components/ride/translations";
import { useEffect, useState } from "react";
import Link from "next/link";
import { passengerClient } from "@/lib/client";
import type { PassengerRideAuthorityView } from "@drts/contracts";

export default function RidesListPage() {
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
      const activeIds = new Set(activeRides.map(r => r.order.orderId));
      
      setActive(activeRides);
      setHistory((historyRes.rides || []).filter(r => !activeIds.has(r.order.orderId)));
      setNextCursor(historyRes.nextCursor || null);
    } catch (err) {
      console.error(err);
      setError("無法載入行程紀錄，請稍後再試。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitial();
  }, []);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await passengerClient.getRides({ limit: 20, cursor: nextCursor });
      const activeIds = new Set(active.map(r => r.order.orderId));
      setHistory(prev => [...prev, ...(res.rides || []).filter(r => !activeIds.has(r.order.orderId))]);
      setNextCursor(res.nextCursor || null);
    } catch (err) {
      console.error("載入更多失敗", err);
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 20 }}>{t.Loading}</div>;
  }
  
  if (error) {
    return (
      <div style={{ padding: 20 }}>
        <p>{error}</p>
        <button onClick={loadInitial} style={{ padding: "8px 16px" }}>重試</button>
      </div>
    );
  }

  return (
    <main style={{ padding: "16px", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 24, fontWeight: "bold", marginBottom: 16 }}>
        {t.MyRides}
      </h1>

      {active.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2
            style={{
              fontSize: 18,
              fontWeight: "bold",
              marginBottom: 8,
              color: "#1F5DB8",
            }}
          >
            {t.InProgress}
          </h2>
          {active.map((ride) => (
            <Link
              href={`/rides/${ride.order.orderId}`}
              key={ride.order.orderId}
              style={{
                display: "block",
                textDecoration: "none",
                color: "inherit",
                padding: 12,
                border: "1px solid #CBD5E1",
                borderRadius: 8,
                marginBottom: 8,
              }}
            >
              <div style={{ fontWeight: "bold" }}>
                {new Date(ride.order.requestedPickupAt).toLocaleString()}
              </div>
              <div style={{ fontSize: 14, color: "#475569" }}>
                {ride.order.pickup.address}
              </div>
            </Link>
          ))}
        </section>
      )}

      <section>
        <h2 style={{ fontSize: 18, fontWeight: "bold", marginBottom: 8 }}>
          {t.History}
        </h2>
        {history.length === 0 ? (
          <div style={{ color: "#475569" }}>{t.NoRideHistory}</div>
        ) : (
          history.map((ride) => {
            const needsRating = ride.actions.canRate;
            return (
              <Link
                href={`/rides/${ride.order.orderId}`}
                key={ride.order.orderId}
                style={{
                  display: "block",
                  textDecoration: "none",
                  color: "inherit",
                  padding: 12,
                  border: "1px solid #CBD5E1",
                  borderRadius: 8,
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    fontWeight: "bold",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>
                    {new Date(ride.order.requestedPickupAt).toLocaleString()}
                  </span>
                  <span
                    style={{
                      color:
                        ride.order.status === "completed"
                          ? "#0F7B5A"
                          : "#475569",
                    }}
                  >
                    {ride.order.status === "completed"
                      ? "完成"
                      : ride.order.status === "cancelled"
                        ? "已取消"
                        : t.InProgress}
                  </span>
                </div>
                <div style={{ fontSize: 14, color: "#475569", marginTop: 4 }}>
                  {ride.order.pickup.address}
                </div>
                {needsRating && (
                  <div
                    style={{
                      marginTop: 8,
                      color: "#0B5CAB",
                      fontSize: 13,
                      fontWeight: "bold",
                    }}
                  >
                    ⭐ 填寫評價
                  </div>
                )}
              </Link>
            );
          })
        )}
        {nextCursor && (
          <button onClick={loadMore} disabled={loadingMore} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 4, background: "#f1f5f9", border: "1px solid #cbd5e1" }}>
            {loadingMore ? "載入中..." : "載入更多"}
          </button>
        )}
      </section>
    </main>
  );
}
