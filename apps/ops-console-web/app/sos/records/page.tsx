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

interface AuditLogRow {
  id: string;
  actorId: string | null;
  operator: string;
  action: string;
  target: string;
  time: string;
  createdAt: string;
}

export default function SosRecordsPage() {
  const { locale, t } = useTranslation();
  const [records, setRecords] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const intlLocale = (locale ?? "zh") === "en" ? "en-US" : "zh-TW";

  const fetchRecords = async () => {
    try {
      const client = getOpsClient();
      const res = await client.get<any>("/api/audit");
      const items = Array.isArray(res) ? res : res?.items || [];
      const mapped: AuditLogRow[] = items.map((audit: any) => ({
        id: audit.auditId,
        actorId: audit.actorId || null,
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

  const renderedRecords = records.map((record) => ({
    ...record,
    operator: record.actorId || t("sos.records.system"),
    time: new Date(record.createdAt).toLocaleTimeString(intlLocale),
  }));

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
        subtitle={t("sos.records.subtitle")}
      />

      <div style={{ padding: 24 }}>
        <Card
          theme={theme}
          padding={0}
          title={
            loading ? t("sos.common.loading") : t("sos.records.tableTitle")
          }
        >
          <Table
            theme={theme}
            columns={[
              { h: t("sos.field.auditId"), k: "id", w: 140, mono: true },
              { h: t("sos.field.operator"), k: "operator", w: 120 },
              { h: t("sos.field.action"), k: "action", w: 180, mono: true },
              { h: t("sos.field.target"), k: "target", w: 160, mono: true },
              { h: t("sos.field.time"), k: "time", w: 120, mono: true },
            ]}
            rows={renderedRecords}
          />
        </Card>
      </div>
    </div>
  );
}
