"use client";

import { useEffect, useState } from "react";
import {
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getOpsClient, createOpsDispatchEventSource } from "@/lib/api-client";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

interface TripRow {
  id: string;
  orderId: string;
  status: string;
  start: string;
  end: string;
  time: string;
  createdAt: string;
}

export default function SosTripsPage() {
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchTrips = async () => {
    try {
      const client = getOpsClient();
      const res = await client.get<any>("/api/orders");
      const items = Array.isArray(res) ? res : res?.items || [];
      const mapped: TripRow[] = items.map((order: any) => ({
        id: `TRP-${order.orderId}`,
        orderId: order.orderId,
        status: order.status,
        start: order.pickup?.address || "—",
        end: order.dropoff?.address || "—",
        time: new Date(order.createdAt).toLocaleTimeString("zh-TW"),
        createdAt: order.createdAt,
      }));

      // Sort descending by creation date
      mapped.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setTrips(mapped);
    } catch (err) {
      console.error("Failed to fetch trips:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchTrips();

    let sse: EventSource | null = null;
    try {
      sse = createOpsDispatchEventSource();
      sse.addEventListener("message", () => {
        void fetchTrips();
      });
      sse.addEventListener("order_updated", () => {
        void fetchTrips();
      });
    } catch (e) {
      console.error("SSE connection error in trips:", e);
    }

    return () => {
      if (sse) sse.close();
    };
  }, []);

  return (
    <div style={{ background: theme.bg, minHeight: "100%" }}>
      <PageHeader
        theme={theme}
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span>行程</span>
            <Pill theme={theme} tone="accent">
              行程管理
            </Pill>
          </div>
        }
        subtitle="智行叫車 · 預約制多元計程車歷史行程"
      />

      <div style={{ padding: 24 }}>
        <Card
          theme={theme}
          padding={0}
          title={loading ? "載入中..." : "多元計程車行程清單"}
        >
          <Table
            theme={theme}
            columns={[
              { h: "行程編號", k: "id", w: 150, mono: true },
              { h: "原始訂單", k: "orderId", w: 160, mono: true },
              { h: "狀態", k: "status", w: 110 },
              { h: "起點", k: "start", w: 220 },
              { h: "終點", k: "end", w: 220 },
              { h: "觸發時間", k: "time", w: 120, mono: true },
            ]}
            rows={trips}
          />
        </Card>
      </div>
    </div>
  );
}
