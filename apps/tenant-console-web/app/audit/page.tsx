import type { CSSProperties } from "react";
import Link from "next/link";
import type { AuditLogRecord } from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: false,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  maxWidth: 1280,
  margin: "0 auto",
};

const filterRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const emptyStateStyle: CSSProperties = {
  padding: 24,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
};

const noteStyle: CSSProperties = {
  fontSize: 12,
  color: th.textMuted,
  lineHeight: 1.5,
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

type AuditPageProps = {
  searchParams?: Promise<{
    auditId?: string;
    requestId?: string;
    resourceType?: string;
    resourceId?: string;
    actorType?: string;
    module?: string;
  }>;
};

type AuditFilters = {
  auditId: string | null;
  requestId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  actorType: string | null;
  module: string | null;
};

type AuditRow = {
  at: string;
  auditId: string;
  actor: string;
  actorType: AuditLogRecord["actorType"];
  module: string;
  action: string;
  resource: string;
  req: string;
};

function normalizeFilterValue(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

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

function matchesFilters(log: AuditLogRecord, filters: AuditFilters) {
  if (filters.auditId && log.auditId !== filters.auditId) return false;
  if (filters.requestId && log.requestId !== filters.requestId) return false;
  if (filters.resourceType && log.resourceType !== filters.resourceType) {
    return false;
  }
  if (filters.resourceId && (log.resourceId ?? "") !== filters.resourceId) {
    return false;
  }
  if (filters.actorType && log.actorType !== filters.actorType) return false;
  if (filters.module && log.moduleName !== filters.module) return false;
  return true;
}

function summarizeFilters(filters: AuditFilters) {
  return [
    { k: "auditId", v: filters.auditId ?? "—", mono: true },
    { k: "requestId", v: filters.requestId ?? "—", mono: true },
    { k: "resourceType", v: filters.resourceType ?? "—", mono: true },
    { k: "resourceId", v: filters.resourceId ?? "—", mono: true },
    { k: "actorType", v: filters.actorType ?? "—", mono: true },
    { k: "module", v: filters.module ?? "—", mono: true },
  ];
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const filters: AuditFilters = {
    auditId: normalizeFilterValue(resolvedSearchParams?.auditId),
    requestId: normalizeFilterValue(resolvedSearchParams?.requestId),
    resourceType: normalizeFilterValue(resolvedSearchParams?.resourceType),
    resourceId: normalizeFilterValue(resolvedSearchParams?.resourceId),
    actorType: normalizeFilterValue(resolvedSearchParams?.actorType),
    module: normalizeFilterValue(resolvedSearchParams?.module),
  };
  const hasFilters = Object.values(filters).some(Boolean);
  const client = getTenantClient();
  const logs = (await client.listTenantAuditLogs()) as AuditLogRecord[];
  const filteredLogs = logs.filter((log) => matchesFilters(log, filters));

  const rows: AuditRow[] = filteredLogs.slice(0, 50).map((log) => ({
    at: formatAuditAt(log.createdAt),
    auditId: log.auditId,
    actor: formatActor(log),
    actorType: log.actorType,
    module: log.moduleName,
    action: log.actionName,
    resource: formatResource(log),
    req: log.requestId || "—",
  }));

  const columns: CanvasTableColumn<AuditRow>[] = [
    { h: "AT", k: "at", w: 170, mono: true },
    { h: "AUDIT", k: "auditId", w: 170, mono: true },
    { h: "ACTOR", k: "actor", w: 180 },
    { h: "TYPE", k: "actorType", w: 130, mono: true },
    { h: "MODULE", k: "module", w: 150, mono: true },
    { h: "ACTION", k: "action", w: 210, mono: true },
    { h: "RESOURCE", k: "resource", w: 180, mono: true },
    { h: "REQ", k: "req", w: 170, mono: true },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="稽核紀錄"
        subtitle="不可變 · 7 年保存 · cross-actor tenant visibility"
        actions={
          <div style={filterRowStyle}>
            {hasFilters ? (
              <Link href="/audit" style={{ textDecoration: "none" }}>
                <CanvasBtn theme={th}>清除篩選</CanvasBtn>
              </Link>
            ) : null}
            <CanvasBtn theme={th} icon="export" size="sm">
              匯出
            </CanvasBtn>
          </div>
        }
      />

      <div style={pageBodyStyle}>
        {hasFilters ? (
          <CanvasCard theme={th} title="目前 deep-link 篩選">
            <CanvasBanner
              theme={th}
              tone="info"
              title="Action receipt / cross-app deep link filter active"
              body="此頁會直接尊重 query filters；同一個 /audit route 可由 receipt、通知、或 cross-app 入口帶入 auditId / resource / request 條件。"
            />
            <div style={{ height: 12 }} />
            <CanvasDL theme={th} cols={3} items={summarizeFilters(filters)} />
            <div style={{ height: 12 }} />
            <div style={filterRowStyle}>
              {filters.auditId ? (
                <CanvasPill theme={th} tone="accent">
                  auditId · {filters.auditId}
                </CanvasPill>
              ) : null}
              {filters.requestId ? (
                <CanvasPill theme={th} tone="accent">
                  requestId · {filters.requestId}
                </CanvasPill>
              ) : null}
              {filters.resourceType ? (
                <CanvasPill theme={th} tone="accent">
                  resourceType · {filters.resourceType}
                </CanvasPill>
              ) : null}
              {filters.resourceId ? (
                <CanvasPill theme={th} tone="accent">
                  resourceId · {filters.resourceId}
                </CanvasPill>
              ) : null}
              {filters.actorType ? (
                <CanvasPill theme={th} tone="accent">
                  actorType · {filters.actorType}
                </CanvasPill>
              ) : null}
              {filters.module ? (
                <CanvasPill theme={th} tone="accent">
                  module · {filters.module}
                </CanvasPill>
              ) : null}
            </div>
          </CanvasCard>
        ) : null}

        <CanvasCard theme={th} padding={0}>
          {rows.length > 0 ? (
            <CanvasTable<AuditRow> theme={th} columns={columns} rows={rows} />
          ) : (
            <div style={emptyStateStyle}>
              {hasFilters
                ? "目前篩選條件下沒有符合的稽核紀錄。請檢查 deep link 參數，或清除篩選後查看完整 audit trail。"
                : "目前沒有任何稽核紀錄。"}
            </div>
          )}
        </CanvasCard>

        <div style={noteStyle}>
          {hasFilters
            ? `Showing ${rows.length} / ${filteredLogs.length} filtered rows from ${logs.length} tenant-visible audit records.`
            : `Showing ${rows.length} / ${logs.length} tenant-visible audit records.`}
        </div>
      </div>
    </div>
  );
}
