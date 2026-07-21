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
import { useTranslation } from "@/lib/i18n";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

interface DispatchJobRow {
  id: string;
  orderId: string;
  status: string;
  driver: string;
  plate: string;
  time: string;
  eta: string;
  createdAt: string;
}

export default function SosBoardPage() {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<DispatchJobRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchJobs = async () => {
    try {
      const client = getOpsClient();
      const [jobsRes, tasksRes] = await Promise.all([
        client.get<any>("/api/dispatch/tasks"),
        client.get<any>("/api/driver/tasks"),
      ]);

      const jobsItems = Array.isArray(jobsRes) ? jobsRes : jobsRes?.items || [];
      const tasksItems = Array.isArray(tasksRes)
        ? tasksRes
        : tasksRes?.items || [];

      const mapped: DispatchJobRow[] = jobsItems.map((job: any) => {
        const relatedTask = tasksItems.find(
          (t: any) => t.dispatchJobId === job.dispatchJobId,
        );
        return {
          id: job.dispatchJobId,
          orderId: job.orderId,
          status: job.status,
          driver: relatedTask?.driverId || "—",
          plate: relatedTask?.vehicleId || "—",
          time: new Date(job.createdAt).toLocaleTimeString("zh-TW"),
          eta: job.latestEtaMinutes ? `${job.latestEtaMinutes}m` : "—",
          createdAt: job.createdAt,
        };
      });

      // Sort descending by creation date
      mapped.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setJobs(mapped);
    } catch (err) {
      console.error("Failed to fetch dispatch jobs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchJobs();

    let sse: EventSource | null = null;
    try {
      sse = createOpsDispatchEventSource();
      sse.addEventListener("message", () => {
        void fetchJobs();
      });
      sse.addEventListener("task_assigned", () => {
        void fetchJobs();
      });
      sse.addEventListener("task_updated", () => {
        void fetchJobs();
      });
    } catch (e) {
      console.error("SSE connection error in board:", e);
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
            <span>{t("sos.board.title")}</span>
            <Pill theme={theme} tone="accent">
              {t("sos.board.badge")}
            </Pill>
          </div>
        }
        subtitle="智行叫車 · 即時派車調度看板"
      />

      <div style={{ padding: 24 }}>
        <Card
          theme={theme}
          padding={0}
          title={loading ? "載入中..." : "即時派遣狀態"}
        >
          <Table
            theme={theme}
            columns={[
              { h: "任務編號", k: "id", w: 120, mono: true },
              { h: "行程編號", k: "orderId", w: 160, mono: true },
              { h: "狀態", k: "status", w: 130 },
              { h: "駕駛", k: "driver", w: 100 },
              { h: "車牌", k: "plate", w: 100, mono: true },
              { h: "時間", k: "time", w: 120, mono: true },
              { h: "預估到達", k: "eta", w: 90 },
            ]}
            rows={jobs}
          />
        </Card>
      </div>
    </div>
  );
}
