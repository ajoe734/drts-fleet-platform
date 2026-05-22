import type { CSSProperties } from "react";
import type { AuditLogRecord } from "@drts/contracts";
import {
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
  CanvasTable,
  type CanvasTableColumn,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const emptyStateStyle: CSSProperties = {
  padding: 24,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
};

const auditDateFormatter = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatAuditAt(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return auditDateFormatter.format(parsed);
}

function formatActor(log: AuditLogRecord) {
  if (log.actorId) return log.actorId;
  if (log.actorType === "system") return "system";
  return "—";
}

function formatResource(log: AuditLogRecord) {
  return log.resourceId ?? log.resourceType ?? "—";
}

type AuditRow = {
  at: string;
  actor: string;
  actorType: AuditLogRecord["actorType"];
  module: string;
  action: string;
  resource: string;
  req: string;
};

export default async function AuditPage() {
  const client = getTenantClient();
  const logs = (await client.listTenantAuditLogs()) as AuditLogRecord[];

  const rows: AuditRow[] = logs.slice(0, 20).map((log) => ({
    at: formatAuditAt(log.createdAt),
    actor: formatActor(log),
    actorType: log.actorType,
    module: log.moduleName,
    action: log.actionName,
    resource: formatResource(log),
    req: log.requestId || "—",
  }));

  const columns: CanvasTableColumn<AuditRow>[] = [
    { h: "AT", k: "at", w: 170, mono: true },
    { h: "ACTOR", k: "actor", w: 200 },
    { h: "TYPE", k: "actorType", w: 120, mono: true },
    { h: "MODULE", k: "module", w: 140, mono: true },
    { h: "ACTION", k: "action", w: 200, mono: true },
    { h: "RESOURCE", k: "resource", w: 150, mono: true },
    { h: "REQ", k: "req", w: 170, mono: true },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="稽核紀錄"
        subtitle="不可變 · 7 年保存 · 含 request_id 對應"
        actions={
          <CanvasBtn theme={th} icon="export" size="sm">
            匯出
          </CanvasBtn>
        }
      />

      <div style={pageBodyStyle}>
        <CanvasCard theme={th} padding={0}>
          {rows.length > 0 ? (
            <CanvasTable<AuditRow> theme={th} columns={columns} rows={rows} />
          ) : (
            <div style={emptyStateStyle}>目前沒有任何稽核紀錄。</div>
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
