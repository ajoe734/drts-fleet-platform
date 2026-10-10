"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { passengerClient } from "@/lib/client";
import type { PassengerRideAuthorityView } from "@drts/contracts";

export default function RidesListPage() {
  const [active, setActive] = useState<PassengerRideAuthorityView[]>([]);
  const [history, setHistory] = useState<PassengerRideAuthorityView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [activeRes, historyRes] = await Promise.all([
          passengerClient.getActiveRides(),
          passengerClient.getRides({ limit: 20 }),
        ]);
        setActive(activeRes.rides || []);
        setHistory(historyRes.rides || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return <div style={{ padding: 20 }}>載入中...</div>;
  }

  return (
    <main style={{ padding: "16px", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 24, fontWeight: "bold", marginBottom: 16 }}>
        我的行程
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
            進行中
          </h2>
          {active.map((ride) => (
            <Link
              href={`/rides/${ride.order.orderNo}`}
              key={ride.order.orderNo}
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
          歷史紀錄
        </h2>
        {history.length === 0 ? (
          <div style={{ color: "#475569" }}>尚無行程紀錄</div>
        ) : (
          history.map((ride) => {
            const isRecent =
              Date.now() - new Date(ride.order.requestedPickupAt).getTime() <
              24 * 60 * 60 * 1000;
            const needsRating = ride.order.status === "completed" && isRecent;
            return (
              <Link
                href={`/rides/${ride.order.orderNo}`}
                key={ride.order.orderNo}
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
                        : "進行中"}
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
      </section>
    </main>
  );
}
