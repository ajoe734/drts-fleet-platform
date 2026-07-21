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

interface AuditLogRow {
  id: string;
  operator: string;
  action: string;
  target: string;
  time: string;
  createdAt: string;
}

export default function SosRecordsPage() {
  const { t } = useTranslation();
  const [records, setRecords] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchRecords = async () => {
    try {
      const client = getOpsClient();
      const res = await client.get<any>("/api/audit");
      const items = Array.isArray(res) ? res : res?.items || [];
      const mapped: AuditLogRow[] = items.map((audit: any) => ({
        id: audit.auditId,
        operator: audit.actorId || "系統",
        action: audit.actionName,
        target: audit.resourceId || "—",
        time: new Date(audit.createdAt).toLocaleTimeString("zh-TW"),
        createdAt: audit.createdAt,
      }));

      // Sort descending by creation date
      mapped.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setRecords(mapped);
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRecords();

    let sse: EventSource | null = null;
    try {
      sse = createOpsDispatchEventSource();
      sse.addEventListener("message", () => {
        void fetchRecords();
      });
    } catch (e) {
      console.error("SSE connection error in records:", e);
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
            <span>{t("sos.records.title")}</span>
            <Pill theme={theme} tone="accent">
              {t("sos.records.badge")}
            </Pill>
          </div>
        }
        subtitle="值班安全人員與系統操作稽核紀錄"
      />

      <div style={{ padding: 24 }}>
        <Card
          theme={theme}
          padding={0}
          title={loading ? "載入中..." : "值班室操作日誌"}
        >
          <Table
            theme={theme}
            columns={[
              { h: "日誌編號", k: "id", w: 140, mono: true },
              { h: "操作值班員", k: "operator", w: 120 },
              { h: "動作類型", k: "action", w: 180, mono: true },
              { h: "目標事件", k: "target", w: 160, mono: true },
              { h: "時間", k: "time", w: 120, mono: true },
            ]}
            rows={records}
          />
        </Card>
      </div>
    </div>
  );
}
