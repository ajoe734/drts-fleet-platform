"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type {
  ComplaintCaseRecord,
  ComplaintCaseStatus,
  ComplaintCategory,
} from "@drts/contracts";
import {
  COMPLAINT_CASE_STATUSES,
  COMPLAINT_CATEGORIES,
} from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasShell as Shell,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

type Locale = "en" | "zh";
type ComplaintTab = "all" | "mine" | "breach" | "escalated";

type ComplaintRow = {
  caseNo: string;
  category: ComplaintCategory;
  description: string;
  orderId: string;
  assignee: string;
  status: ComplaintCaseStatus;
  severity: ComplaintCaseRecord["severity"];
  slaDueAt: string;
  slaBreach: boolean;
  relatedIncidentId: string | null;
};

const STATUS_OPTIONS: ComplaintCaseStatus[] = [...COMPLAINT_CASE_STATUSES];
const CATEGORY_OPTIONS: ComplaintCategory[] = [...COMPLAINT_CATEGORIES];

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const pageStackStyle = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
};

const inputStyle = {
  width: "100%",
  minHeight: 34,
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  padding: "7px 10px",
  fontSize: 12.5,
  fontFamily: theme.fontFamily,
  boxSizing: "border-box" as const,
};

function buildShellNav(locale: Locale): CanvasShellNavItem[] {
  return [
    { divider: locale === "en" ? "Workspaces" : "工作面" },
    {
      key: "dashboard",
      href: "/dashboard",
      icon: "dashboard",
      label: locale === "en" ? "Dashboard" : "總覽",
    },
    { divider: locale === "en" ? "Live Ops" : "即時派遣" },
    {
      key: "dispatch",
      href: "/dispatch",
      icon: "dispatch",
      label: locale === "en" ? "Dispatch" : "派遣",
      matchPaths: ["/dispatch"],
    },
    {
      key: "callcenter",
      href: "/callcenter",
      icon: "callcenter",
      label: locale === "en" ? "Call Center" : "客服中心",
    },
    { divider: locale === "en" ? "Casework" : "案件處理" },
    {
      key: "complaints",
      href: "/complaints",
      icon: "complaints",
      label: locale === "en" ? "Complaints" : "客訴",
    },
    {
      key: "incidents",
      href: "/incidents",
      icon: "incidents",
      label: locale === "en" ? "Incidents" : "事故",
      matchPaths: ["/incidents"],
    },
    { divider: locale === "en" ? "Monitoring" : "營運監控" },
    {
      key: "reports",
      href: "/reports",
      icon: "reports",
      label: locale === "en" ? "Reports" : "報表",
    },
    {
      key: "revenue",
      href: "/revenue",
      icon: "revenue",
      label: locale === "en" ? "Revenue" : "收益",
    },
    {
      key: "attendance",
      href: "/attendance",
      icon: "attendance",
      label: locale === "en" ? "Attendance" : "出勤",
    },
  ];
}

function formatDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

function formatOpsDate(locale: Locale, value: string | null | undefined) {
  return formatDateTime(locale, value).replace(" ", "\u00a0");
}

function isComplaintActive(status: ComplaintCaseStatus) {
  return ["new", "assigned", "under_investigation", "reopened"].includes(
    status,
  );
}

function compareComplaintPriority(a: ComplaintCaseRecord, b: ComplaintCaseRecord) {
  if (a.slaBreach !== b.slaBreach) {
    return a.slaBreach ? -1 : 1;
  }

  if (Boolean(a.relatedIncidentId) !== Boolean(b.relatedIncidentId)) {
    return a.relatedIncidentId ? -1 : 1;
  }

  if (a.severity !== b.severity) {
    return a.severity === "high" ? -1 : 1;
  }

  if (isComplaintActive(a.status) !== isComplaintActive(b.status)) {
    return isComplaintActive(a.status) ? -1 : 1;
  }

  return (
    new Date(a.slaDueAt).getTime() - new Date(b.slaDueAt).getTime() ||
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function formatRelativeSla(locale: Locale, value: string, breached: boolean) {
  const deltaMinutes = Math.round(
    (new Date(value).getTime() - Date.now()) / 60000,
  );

  if (breached || deltaMinutes < 0) {
    return locale === "en"
      ? `breached ${Math.abs(deltaMinutes)}m`
      : `逾期 ${Math.abs(deltaMinutes)} 分`;
  }

  return locale === "en" ? `due ${deltaMinutes}m` : `${deltaMinutes} 分後`;
}

function formatPercent(value: number, total: number) {
  if (total === 0) {
    return "0%";
  }

  return `${Math.round((value / total) * 100)}%`;
}

function formatDurationHours(locale: Locale, hours: number) {
  const rounded = Math.max(0, Math.round(hours));
  return locale === "en" ? `${rounded}h` : `${rounded} 小時`;
}

function getSeverityTone(severity: ComplaintCaseRecord["severity"]): CanvasTone {
  switch (severity) {
    case "high":
      return "danger";
    case "normal":
    default:
      return "warn";
  }
}

function getStatusTone(record: ComplaintCaseRecord): CanvasTone {
  if (record.slaBreach) {
    return "danger";
  }

  switch (record.status) {
    case "closed":
      return "success";
    case "resolved":
      return "info";
    case "reopened":
      return "warn";
    case "under_investigation":
    case "assigned":
      return "accent";
    case "new":
    default:
      return "neutral";
  }
}

export default function ComplaintsPage() {
  const { t, locale } = useTranslation();
  const [records, setRecords] = useState<ComplaintCaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ComplaintTab>("all");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ComplaintCaseStatus | "all">(
    "all",
  );
  const [categoryFilter, setCategoryFilter] = useState<ComplaintCategory | "all">(
    "all",
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  useEffect(() => {
    void loadRecords();
  }, []);

  async function loadRecords() {
    setLoading(true);

    try {
      const nextRecords = await getOpsClient().listComplaints();
      setRecords(nextRecords);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t("common.unknown"));
    } finally {
      setLoading(false);
    }
  }

  const primaryAssigneeId = useMemo(() => {
    const counts = new Map<string, number>();

    for (const record of records) {
      if (!record.assigneeId) {
        continue;
      }

      counts.set(record.assigneeId, (counts.get(record.assigneeId) ?? 0) + 1);
    }

    return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records
      .filter((record) => {
        if (activeTab === "mine" && primaryAssigneeId && record.assigneeId !== primaryAssigneeId) {
          return false;
        }

        if (activeTab === "breach" && !record.slaBreach) {
          return false;
        }

        if (activeTab === "escalated" && !record.relatedIncidentId) {
          return false;
        }

        if (statusFilter !== "all" && record.status !== statusFilter) {
          return false;
        }

        if (categoryFilter !== "all" && record.category !== categoryFilter) {
          return false;
        }

        if (!deferredQuery) {
          return true;
        }

        const haystack = [
          record.caseNo,
          record.description,
          record.category,
          record.status,
          record.relatedOrderId ?? "",
          record.assigneeId ?? "",
          record.relatedIncidentId ?? "",
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(deferredQuery);
      })
      .sort(compareComplaintPriority);
  }, [activeTab, categoryFilter, deferredQuery, primaryAssigneeId, records, statusFilter]);

  const activeCases = records.filter((record) => isComplaintActive(record.status));
  const breachedCases = records.filter((record) => record.slaBreach);
  const escalatedCases = records.filter((record) => Boolean(record.relatedIncidentId));
  const reopenedCases = records.filter((record) => record.reopenCount > 0);
  const resolvedCases = records.filter(
    (record) => record.status === "resolved" || record.status === "closed",
  );

  const averageHandlingHours =
    resolvedCases.reduce((sum, record) => {
      const elapsedHours =
        (new Date(record.updatedAt).getTime() - new Date(record.createdAt).getTime()) /
        3_600_000;
      return sum + elapsedHours;
    }, 0) / (resolvedCases.length || 1);

  const latestEscalation = escalatedCases
    .slice()
    .sort(compareComplaintPriority)[0];

  const rows: ComplaintRow[] = filteredRecords.map((record) => ({
    caseNo: record.caseNo,
    category: record.category,
    description: record.description,
    orderId: record.relatedOrderId ?? "—",
    assignee: record.assigneeId ?? t("complaints.unassigned"),
    status: record.status,
    severity: record.severity,
    slaDueAt: record.slaDueAt,
    slaBreach: record.slaBreach,
    relatedIncidentId: record.relatedIncidentId,
  }));

  const tableColumns: CanvasTableColumn<ComplaintRow>[] = [
    {
      h: "CASE",
      w: 124,
      mono: true,
      r: (row) => (
        <span style={{ color: theme.accent, fontWeight: 700 }}>{row.caseNo}</span>
      ),
    },
    {
      h: "CATEGORY",
      w: 152,
      mono: true,
      r: (row) => formatOpsCodeLabel(locale, row.category),
    },
    {
      h: "SEV",
      w: 96,
      r: (row) => (
        <Pill theme={theme} tone={getSeverityTone(row.severity)} dot>
          {formatOpsCodeLabel(locale, row.severity)}
        </Pill>
      ),
    },
    {
      h: "DESC",
      r: (row) => (
        <span style={{ whiteSpace: "normal", lineHeight: 1.45 }}>{row.description}</span>
      ),
    },
    {
      h: "ORDER",
      w: 124,
      mono: true,
      r: (row) => row.orderId,
    },
    {
      h: "SLA",
      w: 144,
      r: (row) => (
        <Pill theme={theme} tone={row.slaBreach ? "danger" : "success"} dot>
          {formatRelativeSla(locale, row.slaDueAt, row.slaBreach)}
        </Pill>
      ),
    },
    {
      h: "OWNER",
      w: 120,
      mono: true,
      r: (row) => row.assignee,
    },
    {
      h: "STATUS",
      w: 172,
      r: (row) => (
        <div style={{ display: "grid", gap: 6 }}>
          <Pill
            theme={theme}
            tone={getStatusTone({
              caseNo: row.caseNo,
              caseSource: "ops",
              relatedOrderId: row.orderId === "—" ? null : row.orderId,
              relatedCallId: null,
              relatedIncidentId: row.relatedIncidentId,
              category: row.category,
              severity: row.severity,
              description: row.description,
              assigneeId: row.assignee,
              status: row.status,
              slaDueAt: row.slaDueAt,
              slaBreach: row.slaBreach,
              reopenCount: 0,
              resolutionCode: null,
              closingNote: null,
              createdAt: row.slaDueAt,
              updatedAt: row.slaDueAt,
            })}
            dot
          >
            {formatOpsCodeLabel(locale, row.status)}
          </Pill>
          {row.relatedIncidentId ? (
            <Link
              href={`/incidents?incidentId=${encodeURIComponent(row.relatedIncidentId)}`}
              style={{
                color: theme.accent,
                textDecoration: "none",
                fontSize: 11.5,
                fontFamily: theme.monoFamily,
              }}
            >
              {row.relatedIncidentId}
            </Link>
          ) : null}
        </div>
      ),
    },
  ];

  const tabMeta: Record<ComplaintTab, { label: string; count: number }> = {
    all: {
      label: locale === "en" ? "All" : "全部",
      count: records.length,
    },
    mine: {
      label: locale === "en" ? "My Queue" : "我負責",
      count: primaryAssigneeId
        ? records.filter((record) => record.assigneeId === primaryAssigneeId).length
        : 0,
    },
    breach: {
      label: locale === "en" ? "SLA Breach" : "SLA breach",
      count: breachedCases.length,
    },
    escalated: {
      label: locale === "en" ? "Escalated" : "已升級事故",
      count: escalatedCases.length,
    },
  };

  const tabOrder: ComplaintTab[] = ["all", "mine", "breach", "escalated"];
  const tabs = tabOrder.map((tab) => (
    <button
      key={tab}
      type="button"
      onClick={() => setActiveTab(tab)}
      style={{
        border: 0,
        background: "transparent",
        color: "inherit",
        font: "inherit",
        padding: 0,
        cursor: "pointer",
      }}
    >
      {tabMeta[tab].label}
    </button>
  ));

  const activeTabNode = tabs[tabOrder.indexOf(activeTab)];

  const filterSummary = [
    {
      k: locale === "en" ? "Visible" : "顯示中",
      v: `${filteredRecords.length}`,
      mono: true,
    },
    {
      k: locale === "en" ? "Lead owner" : "主要負責人",
      v: primaryAssigneeId ?? t("complaints.unassigned"),
      mono: true,
    },
    {
      k: locale === "en" ? "Status" : "狀態",
      v:
        statusFilter === "all"
          ? t("complaints.allStatuses")
          : formatOpsCodeLabel(locale, statusFilter),
    },
    {
      k: locale === "en" ? "Category" : "類別",
      v:
        categoryFilter === "all"
          ? t("complaints.allCategories")
          : formatOpsCodeLabel(locale, categoryFilter),
    },
  ];

  return (
    <Shell
      theme={theme}
      nav={buildShellNav(locale)}
      active="complaints"
      breadcrumb={[locale === "en" ? "Complaints" : "客訴"]}
    >
      <PageHeader
        theme={theme}
        title={locale === "en" ? "Complaints Hub" : "客訴中心"}
        subtitle={
          locale === "en"
            ? "Case lifecycle · SLA · escalation · reopen audit trail retained"
            : "案件全流程 · SLA · 升級 · reopen 不覆蓋歷程"
        }
        tabs={tabs}
        activeTab={activeTabNode}
        actions={
          <>
            <Btn
              theme={theme}
              icon="filter"
              onClick={() => setFiltersOpen((current) => !current)}
            >
              {locale === "en" ? "Category" : "類別"}
            </Btn>
            <Btn theme={theme} icon="export" disabled={records.length === 0}>
              {locale === "en" ? "Export" : "匯出"}
            </Btn>
            <Btn theme={theme} variant="primary" icon="plus">
              {t("complaints.createBtn")}
            </Btn>
          </>
        }
      />

      <div style={pageStackStyle}>
        {error ? (
          <Banner
            theme={theme}
            tone="danger"
            title={`${getOpsLabel(locale, "error")}: ${error}`}
            body={
              locale === "en"
                ? "The complaints registry could not be refreshed."
                : "客訴清單重新整理失敗。"
            }
            actions={
              <Btn theme={theme} onClick={() => void loadRecords()}>
                {t("common.refresh")}
              </Btn>
            }
          />
        ) : null}

        {filtersOpen ? (
          <Card
            theme={theme}
            title={locale === "en" ? "Filters" : "篩選"}
            subtitle={t("complaints.results", { count: filteredRecords.length })}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(240px, 1.2fr) repeat(2, minmax(170px, 0.8fr)) minmax(220px, 1fr)",
                gap: 12,
                alignItems: "start",
              }}
            >
              <Field theme={theme} label={t("complaints.search")}>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("complaints.search")}
                  style={inputStyle}
                />
              </Field>
              <Field theme={theme} label={t("complaints.allStatuses")}>
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as ComplaintCaseStatus | "all")
                  }
                  style={inputStyle}
                >
                  <option value="all">{t("complaints.allStatuses")}</option>
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {formatOpsCodeLabel(locale, status)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field theme={theme} label={t("complaints.allCategories")}>
                <select
                  value={categoryFilter}
                  onChange={(event) =>
                    setCategoryFilter(event.target.value as ComplaintCategory | "all")
                  }
                  style={inputStyle}
                >
                  <option value="all">{t("complaints.allCategories")}</option>
                  {CATEGORY_OPTIONS.map((category) => (
                    <option key={category} value={category}>
                      {formatOpsCodeLabel(locale, category)}
                    </option>
                  ))}
                </select>
              </Field>
              <div style={{ paddingTop: 3 }}>
                <DL theme={theme} cols={2} items={filterSummary} />
              </div>
            </div>
          </Card>
        ) : null}

        <div style={kpiGridStyle}>
          <KPI
            theme={theme}
            label={locale === "en" ? "Open complaints" : "未結客訴"}
            value={activeCases.length}
            delta={
              locale === "en"
                ? `${breachedCases.length} SLA breach`
                : `${breachedCases.length} 件 SLA breach`
            }
            deltaTone={breachedCases.length > 0 ? "down" : "neutral"}
          />
          <KPI
            theme={theme}
            label={locale === "en" ? "Avg handling" : "平均處理"}
            value={formatDurationHours(locale, averageHandlingHours)}
            sub={
              locale === "en"
                ? `${resolvedCases.length} resolved / closed`
                : `${resolvedCases.length} 件已解決 / 結案`
            }
          />
          <KPI
            theme={theme}
            label={locale === "en" ? "Escalated incidents" : "升級事故"}
            value={escalatedCases.length}
            sub={
              latestEscalation
                ? `${latestEscalation.caseNo} → ${latestEscalation.relatedIncidentId}`
                : "—"
            }
          />
          <KPI
            theme={theme}
            label={locale === "en" ? "Reopen rate" : "reopen 率"}
            value={formatPercent(reopenedCases.length, records.length)}
            delta={
              locale === "en"
                ? `${reopenedCases.length} reopened`
                : `${reopenedCases.length} 件重開`
            }
            deltaTone={reopenedCases.length > 0 ? "down" : "neutral"}
          />
        </div>

        <Card theme={theme} padding={0}>
          {loading ? (
            <div style={{ padding: 16, color: theme.textDim, fontSize: 12.5 }}>
              {t("complaints.loading")}
            </div>
          ) : filteredRecords.length === 0 ? (
            <div style={{ padding: 16 }}>
              <Banner
                theme={theme}
                tone="info"
                title={t("complaints.empty")}
                body={locale === "en" ? "Adjust tabs or filters." : "請調整 tabs 或篩選條件。"}
              />
            </div>
          ) : (
            <Table theme={theme} columns={tableColumns} rows={rows} />
          )}
        </Card>

        {!loading && filteredRecords.length > 0 ? (
          <div
            style={{
              color: theme.textDim,
              fontSize: 11.5,
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span>{t("complaints.results", { count: filteredRecords.length })}</span>
            <span>
              {locale === "en" ? "Top SLA due" : "最早 SLA"}:{" "}
              {formatOpsDate(locale, filteredRecords[0]?.slaDueAt)}
            </span>
          </div>
        ) : null}
      </div>
    </Shell>
  );
}
