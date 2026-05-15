"use client";

import React, { useCallback, useEffect, useState } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import type { AuditLogRecord } from "@drts/contracts";
import {
  buildCanvasTheme,
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  type CanvasTone,
} from "@drts/ui-web";

const AUDIT_THEME = buildCanvasTheme({
  surface: "platform",
  dark: true,
  density: "compact",
});

const AUDIT_ACTOR_TYPES = [
  "system",
  "platform_admin",
  "tenant_admin",
  "ops_user",
  "partner_api_key",
] as const satisfies readonly AuditLogRecord["actorType"][];

const chipButtonStyle: React.CSSProperties = {
  appearance: "none",
  background: "transparent",
  border: 0,
  padding: 0,
  margin: 0,
  cursor: "pointer",
};

type AuditActorFilter = "all" | AuditLogRecord["actorType"];

type AuditTableRow = {
  when: string;
  actorType: AuditLogRecord["actorType"];
  actor: string;
  module: string;
  action: string;
  resource: string;
  request: string;
};

type AuditPageCopy = {
  title: string;
  subtitle: string;
  loading: string;
  empty: string;
  filterToggle: string;
  hideFilters: string;
  exportCsv: string;
  clearFilters: string;
  allChip: string;
  allModules: string;
  allActors: string;
  noActor: string;
  noModule: string;
  noResource: string;
  noRequest: string;
  bannerTitle: string;
  bannerBody: string;
  filterPanelTitle: string;
  filterPanelSubtitle: string;
  moduleField: string;
  actorField: string;
  rowsLabel: string;
  moduleGroupsLabel: string;
  actorTypesLabel: string;
  requestCoverageLabel: string;
  exportFormatLabel: string;
  currentModuleLabel: string;
  currentActorLabel: string;
  requestScopeLabel: string;
  exportFormatValue: string;
  requestCoverageHint: string;
  modulesHint: string;
  actorHint: string;
  rowsHint: string;
  tabs: [string, string, string, string];
};

function normalizeActorType(value: unknown): AuditLogRecord["actorType"] {
  return typeof value === "string" &&
    (AUDIT_ACTOR_TYPES as readonly string[]).includes(value)
    ? (value as AuditLogRecord["actorType"])
    : "system";
}

function normalizeAuditRecord(
  record: Partial<AuditLogRecord> & Record<string, unknown>,
): AuditLogRecord {
  const normalized: AuditLogRecord = {
    auditId: String(record.auditId ?? record.id ?? ""),
    actorId: typeof record.actorId === "string" ? record.actorId : null,
    actorType: normalizeActorType(record.actorType),
    tenantId: typeof record.tenantId === "string" ? record.tenantId : null,
    moduleName:
      typeof record.moduleName === "string"
        ? record.moduleName
        : typeof record.module === "string"
          ? record.module
          : "",
    actionName:
      typeof record.actionName === "string"
        ? record.actionName
        : typeof record.action === "string"
          ? record.action
          : "",
    resourceType:
      typeof record.resourceType === "string" ? record.resourceType : "",
    resourceId:
      typeof record.resourceId === "string" ? record.resourceId : null,
    requestId: typeof record.requestId === "string" ? record.requestId : "",
    createdAt: typeof record.createdAt === "string" ? record.createdAt : "",
  };

  if (
    record.oldValuesSummary &&
    typeof record.oldValuesSummary === "object" &&
    !Array.isArray(record.oldValuesSummary)
  ) {
    normalized.oldValuesSummary = record.oldValuesSummary as Record<
      string,
      unknown
    >;
  }

  if (
    record.newValuesSummary &&
    typeof record.newValuesSummary === "object" &&
    !Array.isArray(record.newValuesSummary)
  ) {
    normalized.newValuesSummary = record.newValuesSummary as Record<
      string,
      unknown
    >;
  }

  return normalized;
}

function formatCount(value: number, locale: "en" | "zh") {
  return value.toLocaleString(locale === "zh" ? "zh-Hant" : "en-US");
}

function formatAuditTimestamp(value: string, locale: "en" | "zh") {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(parsed)
    .replace(",", "");
}

function actorLabel(record: AuditLogRecord, copy: AuditPageCopy) {
  return record.actorId?.trim() || copy.noActor;
}

function resourceLabel(record: AuditLogRecord, copy: AuditPageCopy) {
  if (record.resourceType && record.resourceId) {
    return `${record.resourceType}/${record.resourceId}`;
  }
  if (record.resourceType) {
    return record.resourceType;
  }
  if (record.resourceId) {
    return record.resourceId;
  }
  return copy.noResource;
}

function actorFilterLabel(actorType: AuditActorFilter, copy: AuditPageCopy) {
  return actorType === "all" ? copy.allActors : actorType;
}

function csvCell(value: string | null | undefined) {
  const text = value ?? "";
  return `"${text.replace(/"/g, '""')}"`;
}

function exportAuditCsv(
  records: AuditLogRecord[],
  filename: string,
  copy: AuditPageCopy,
) {
  const lines = [
    [
      "audit_id",
      "created_at",
      "actor_type",
      "actor",
      "tenant_id",
      "module",
      "action",
      "resource",
      "request_id",
    ].join(","),
    ...records.map((record) =>
      [
        csvCell(record.auditId),
        csvCell(record.createdAt),
        csvCell(record.actorType),
        csvCell(actorLabel(record, copy)),
        csvCell(record.tenantId ?? ""),
        csvCell(record.moduleName),
        csvCell(record.actionName),
        csvCell(resourceLabel(record, copy)),
        csvCell(record.requestId),
      ].join(","),
    ),
  ];

  const blob = new Blob([`\uFEFF${lines.join("\n")}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function filterSelectStyle(theme = AUDIT_THEME): React.CSSProperties {
  return {
    width: "100%",
    borderRadius: 7,
    border: `1px solid ${theme.border}`,
    background: theme.bgRaised,
    color: theme.text,
    padding: "7px 10px",
    fontSize: 12.5,
    fontFamily: theme.fontFamily,
    outline: "none",
  };
}

function toneForActorType(actorType: AuditLogRecord["actorType"]): CanvasTone {
  switch (actorType) {
    case "platform_admin":
      return "accent";
    case "tenant_admin":
      return "info";
    case "ops_user":
      return "warn";
    case "partner_api_key":
      return "danger";
    case "system":
    default:
      return "neutral";
  }
}

export default function AuditPage() {
  const { locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [records, setRecords] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedModule, setSelectedModule] = useState("all");
  const [actorFilter, setActorFilter] = useState<AuditActorFilter>("all");
  const [showFilters, setShowFilters] = useState(false);

  const copy: AuditPageCopy =
    locale === "en"
      ? {
          title: "Audit & Evidence",
          subtitle: "append-only · review surface · not mutable from frontend",
          loading: "Loading audit records...",
          empty: "No audit rows match the current filter scope.",
          filterToggle: "Filter",
          hideFilters: "Hide filters",
          exportCsv: "Export csv",
          clearFilters: "Clear filters",
          allChip: "All",
          allModules: "All modules",
          allActors: "All actor types",
          noActor: "system",
          noModule: "general",
          noResource: "—",
          noRequest: "—",
          bannerTitle: "Frontend review stays append-only and export-only.",
          bannerBody:
            "Use the chips for module narrowing, then refine actor type before exporting the visible ledger.",
          filterPanelTitle: "Filter & export scope",
          filterPanelSubtitle:
            "Keep the canvas chip row as the main affordance, and use the detailed panel only when you need a tighter CSV scope.",
          moduleField: "Module",
          actorField: "Actor type",
          rowsLabel: "Visible rows",
          moduleGroupsLabel: "Module groups",
          actorTypesLabel: "Actor types",
          requestCoverageLabel: "Request coverage",
          exportFormatLabel: "Export format",
          currentModuleLabel: "Current module",
          currentActorLabel: "Current actor type",
          requestScopeLabel: "Request-linked rows",
          exportFormatValue: "csv · utf-8",
          requestCoverageHint: "rows with request id",
          modulesHint: "chip counts",
          actorHint: "system / platform / tenant / ops / partner",
          rowsHint: "after chip + actor filters",
          tabs: [
            "Audit log",
            "Retention policies",
            "Legal holds",
            "Deletion exceptions",
          ],
        }
      : {
          title: "稽核與證據",
          subtitle: "append-only · 觀察面 · 不可被前端竄改",
          loading: "載入稽核記錄中...",
          empty: "目前沒有符合篩選條件的 audit log。",
          filterToggle: "篩選",
          hideFilters: "收合篩選",
          exportCsv: "匯出 csv",
          clearFilters: "清除篩選",
          allChip: "全部",
          allModules: "全部模組",
          allActors: "全部操作者類型",
          noActor: "system",
          noModule: "general",
          noResource: "—",
          noRequest: "—",
          bannerTitle: "前端只負責檢視與匯出，不會修改 audit evidence。",
          bannerBody:
            "先用 module chips 鎖定主視圖，再用 actor type 收斂匯出範圍，維持 append-only 的審查姿態。",
          filterPanelTitle: "篩選與匯出範圍",
          filterPanelSubtitle:
            "主視圖維持 PA_Audit 的 chip + dense table；需要更細匯出時再展開詳細面板。",
          moduleField: "模組",
          actorField: "操作者類型",
          rowsLabel: "目前筆數",
          moduleGroupsLabel: "模組群組",
          actorTypesLabel: "操作者類型",
          requestCoverageLabel: "Request coverage",
          exportFormatLabel: "匯出格式",
          currentModuleLabel: "目前 module",
          currentActorLabel: "目前 actor type",
          requestScopeLabel: "有 request id 的列數",
          exportFormatValue: "csv · utf-8",
          requestCoverageHint: "目前可追到 request 的比例",
          modulesHint: "chip 顯示的 module 群組數",
          actorHint: "system / platform / tenant / ops / partner",
          rowsHint: "套用 chip 與 actor type 後",
          tabs: [
            "Audit log",
            "Retention policies",
            "Legal holds",
            "Deletion exceptions",
          ],
        };

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await client.listAuditLogs();
      const normalized = (result ?? [])
        .map((record) =>
          normalizeAuditRecord(
            record as AuditLogRecord & Record<string, unknown>,
          ),
        )
        .sort((left, right) => {
          const leftAt = Date.parse(left.createdAt);
          const rightAt = Date.parse(right.createdAt);
          return (
            (Number.isNaN(rightAt) ? 0 : rightAt) -
            (Number.isNaN(leftAt) ? 0 : leftAt)
          );
        });

      setRecords(normalized);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const moduleCountMap = new Map<string, number>();
  for (const record of records) {
    const moduleName = record.moduleName || copy.noModule;
    moduleCountMap.set(moduleName, (moduleCountMap.get(moduleName) ?? 0) + 1);
  }

  const sortedModules = [...moduleCountMap.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }
    return left[0].localeCompare(right[0]);
  });

  const chipModules = sortedModules.slice(0, 5);
  if (
    selectedModule !== "all" &&
    !chipModules.some(([moduleName]) => moduleName === selectedModule)
  ) {
    const selectedEntry = sortedModules.find(
      ([moduleName]) => moduleName === selectedModule,
    );
    if (selectedEntry) {
      chipModules.push(selectedEntry);
    }
  }

  const actorOptions = AUDIT_ACTOR_TYPES.filter((actorType) =>
    records.some((record) => record.actorType === actorType),
  );

  const filteredRecords = records.filter((record) => {
    const recordModule = record.moduleName || copy.noModule;
    if (selectedModule !== "all" && recordModule !== selectedModule) {
      return false;
    }
    if (actorFilter !== "all" && record.actorType !== actorFilter) {
      return false;
    }
    return true;
  });

  const requestLinkedCount = filteredRecords.filter(
    (record) => record.requestId.trim().length > 0,
  ).length;
  const requestCoverage =
    filteredRecords.length === 0
      ? "0%"
      : `${Math.round((requestLinkedCount / filteredRecords.length) * 100)}%`;

  const tableRows: AuditTableRow[] = filteredRecords.map((record) => ({
    when: formatAuditTimestamp(record.createdAt, locale),
    actorType: record.actorType,
    actor: actorLabel(record, copy),
    module: record.moduleName || copy.noModule,
    action: record.actionName || "—",
    resource: resourceLabel(record, copy),
    request: record.requestId || copy.noRequest,
  }));

  const exportFilename = `platform-audit-${new Date()
    .toISOString()
    .replace(/[:]/g, "-")
    .replace(/\..+$/, "")}.csv`;

  return (
    <div
      style={{
        minHeight: "100%",
        background: AUDIT_THEME.bg,
        color: AUDIT_THEME.text,
      }}
    >
      <PageHeader
        theme={AUDIT_THEME}
        title={copy.title}
        subtitle={copy.subtitle}
        tabs={copy.tabs}
        activeTab={copy.tabs[0]}
        actions={
          <>
            <Btn
              theme={AUDIT_THEME}
              icon="filter"
              onClick={() => setShowFilters((current) => !current)}
            >
              {showFilters ? copy.hideFilters : copy.filterToggle}
            </Btn>
            <Btn
              theme={AUDIT_THEME}
              icon="export"
              onClick={() =>
                exportAuditCsv(filteredRecords, exportFilename, copy)
              }
              disabled={loading || filteredRecords.length === 0}
            >
              {copy.exportCsv}
            </Btn>
          </>
        }
      />

      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {error ? (
          <Banner
            theme={AUDIT_THEME}
            tone="danger"
            icon="warn"
            title={error}
            body={
              locale === "en"
                ? "Audit data could not be loaded from the control plane."
                : "無法從 control plane 載入 audit 資料。"
            }
          />
        ) : null}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setSelectedModule("all")}
            style={chipButtonStyle}
          >
            <Pill
              theme={AUDIT_THEME}
              tone={selectedModule === "all" ? "accent" : "neutral"}
              dot
            >
              {copy.allChip} {formatCount(records.length, locale)}
            </Pill>
          </button>

          {chipModules.map(([moduleName, count]) => (
            <button
              key={moduleName}
              type="button"
              onClick={() => setSelectedModule(moduleName)}
              style={chipButtonStyle}
            >
              <Pill
                theme={AUDIT_THEME}
                tone={selectedModule === moduleName ? "accent" : "neutral"}
                dot
              >
                {moduleName} {formatCount(count, locale)}
              </Pill>
            </button>
          ))}
        </div>

        <Card theme={AUDIT_THEME} padding={0}>
          {loading ? (
            <div
              style={{
                padding: 24,
                color: AUDIT_THEME.textMuted,
                fontSize: 12.5,
              }}
            >
              {copy.loading}
            </div>
          ) : tableRows.length === 0 ? (
            <div
              style={{
                padding: 24,
                color: AUDIT_THEME.textMuted,
                fontSize: 12.5,
              }}
            >
              {copy.empty}
            </div>
          ) : (
            <Table
              theme={AUDIT_THEME}
              columns={[
                { h: "WHEN", k: "when", w: 170, mono: true },
                {
                  h: "ACTOR TYPE",
                  w: 130,
                  mono: true,
                  r: (row) => (
                    <Pill
                      theme={AUDIT_THEME}
                      tone={toneForActorType(row.actorType)}
                      dot
                    >
                      {row.actorType}
                    </Pill>
                  ),
                },
                { h: "ACTOR", k: "actor", w: 220 },
                { h: "MODULE", k: "module", w: 150, mono: true },
                {
                  h: "ACTION",
                  w: 190,
                  mono: true,
                  r: (row) => (
                    <span
                      style={{
                        color: AUDIT_THEME.accent,
                        fontFamily: AUDIT_THEME.monoFamily,
                        fontSize: 11.5,
                      }}
                    >
                      {row.action}
                    </span>
                  ),
                },
                { h: "RESOURCE", k: "resource", w: 220, mono: true },
                { h: "REQUEST", k: "request", w: 150, mono: true },
              ]}
              rows={tableRows}
            />
          )}
        </Card>

        {showFilters ? (
          <div
            style={{
              display: "grid",
              gap: 16,
              gridTemplateColumns: "minmax(0, 1.35fr) minmax(280px, 360px)",
              alignItems: "start",
            }}
          >
            <Card
              theme={AUDIT_THEME}
              title={copy.filterPanelTitle}
              subtitle={copy.filterPanelSubtitle}
              actions={
                <Btn
                  theme={AUDIT_THEME}
                  variant="ghost"
                  onClick={() => {
                    setSelectedModule("all");
                    setActorFilter("all");
                  }}
                >
                  {copy.clearFilters}
                </Btn>
              }
            >
              <div style={{ display: "grid", gap: 16 }}>
                <Banner
                  theme={AUDIT_THEME}
                  tone="info"
                  icon="audit"
                  title={copy.bannerTitle}
                  body={copy.bannerBody}
                  actions={
                    <Pill theme={AUDIT_THEME} tone="accent" dot>
                      {copy.requestCoverageLabel} {requestCoverage}
                    </Pill>
                  }
                />

                <div
                  style={{
                    display: "grid",
                    gap: 12,
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  }}
                >
                  <Field theme={AUDIT_THEME} label={copy.moduleField}>
                    <select
                      value={selectedModule}
                      onChange={(event) =>
                        setSelectedModule(event.target.value)
                      }
                      style={filterSelectStyle()}
                    >
                      <option value="all">{copy.allModules}</option>
                      {sortedModules.map(([moduleName]) => (
                        <option key={moduleName} value={moduleName}>
                          {moduleName}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field theme={AUDIT_THEME} label={copy.actorField}>
                    <select
                      value={actorFilter}
                      onChange={(event) =>
                        setActorFilter(event.target.value as AuditActorFilter)
                      }
                      style={filterSelectStyle()}
                    >
                      <option value="all">{copy.allActors}</option>
                      {actorOptions.map((actorType) => (
                        <option key={actorType} value={actorType}>
                          {actorType}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <DL
                  theme={AUDIT_THEME}
                  cols={2}
                  items={[
                    {
                      k: copy.currentModuleLabel,
                      v:
                        selectedModule === "all"
                          ? copy.allModules
                          : selectedModule,
                      mono: selectedModule !== "all",
                    },
                    {
                      k: copy.currentActorLabel,
                      v: actorFilterLabel(actorFilter, copy),
                      mono: actorFilter !== "all",
                    },
                    {
                      k: copy.requestScopeLabel,
                      v: `${formatCount(requestLinkedCount, locale)} / ${formatCount(
                        filteredRecords.length,
                        locale,
                      )}`,
                      mono: true,
                    },
                    {
                      k: copy.exportFormatLabel,
                      v: copy.exportFormatValue,
                      mono: true,
                    },
                  ]}
                />
              </div>
            </Card>

            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              }}
            >
              <KPI
                theme={AUDIT_THEME}
                label={copy.rowsLabel}
                value={formatCount(filteredRecords.length, locale)}
                sub={copy.rowsHint}
              />
              <KPI
                theme={AUDIT_THEME}
                label={copy.moduleGroupsLabel}
                value={formatCount(sortedModules.length, locale)}
                sub={copy.modulesHint}
              />
              <KPI
                theme={AUDIT_THEME}
                label={copy.actorTypesLabel}
                value={formatCount(actorOptions.length, locale)}
                sub={copy.actorHint}
              />
              <KPI
                theme={AUDIT_THEME}
                label={copy.requestCoverageLabel}
                value={requestCoverage}
                hint={copy.requestCoverageHint}
                sub={`${formatCount(requestLinkedCount, locale)} / ${formatCount(
                  filteredRecords.length,
                  locale,
                )}`}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
