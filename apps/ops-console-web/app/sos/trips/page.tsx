"use client";

import { useEffect, useState } from "react";
import {
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
} from "@drts/ui-web";
import {
  getOpsClient,
  createOpsDispatchEventSource,
} from "../../../lib/api-client";
import { useTranslation } from "../../../lib/i18n";

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
  const { locale, t } = useTranslation();
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const intlLocale = (locale ?? "zh") === "en" ? "en-US" : "zh-TW";

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

  const renderedTrips = trips.map((trip) => ({
    ...trip,
    time: new Date(trip.createdAt).toLocaleTimeString(intlLocale),
  }));

  return (
    <div style={{ background: theme.bg, minHeight: "100%" }}>
      <PageHeader
        theme={theme}
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span>{t("sos.trips.title")}</span>
            <Pill theme={theme} tone="accent">
              {t("sos.trips.badge")}
            </Pill>
          </div>
        }
        subtitle={t("sos.trips.subtitle", { appName: t("app.name") })}
      />

      <div style={{ padding: 24 }}>
        <Card
          theme={theme}
          padding={0}
          title={loading ? t("sos.common.loading") : t("sos.trips.tableTitle")}
        >
          <Table
            theme={theme}
            columns={[
              { h: t("sos.field.tripId"), k: "id", w: 150, mono: true },
              { h: t("sos.field.orderId"), k: "orderId", w: 160, mono: true },
              { h: t("sos.field.status"), k: "status", w: 110 },
              { h: t("sos.field.pickup"), k: "start", w: 220 },
              { h: t("sos.field.dropoff"), k: "end", w: 220 },
              { h: t("sos.field.triggeredAt"), k: "time", w: 120, mono: true },
            ]}
            rows={renderedTrips}
          />
        </Card>
      </div>
    </div>
  );
}
