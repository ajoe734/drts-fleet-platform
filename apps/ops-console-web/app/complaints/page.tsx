"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type {
  ComplaintCaseRecord,
  ComplaintCaseStatus,
  ComplaintCategory,
  CreateComplaintCaseCommand,
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

type ComplaintTableRow = {
  caseNo: string;
  category: ComplaintCategory;
  severity: ComplaintCaseRecord["severity"];
  description: string;
  orderId: string;
  slaDueAt: string;
  slaBreach: boolean;
  assignee: string;
  status: ComplaintCaseStatus;
  relatedIncidentId: string | null;
};

const STATUS_OPTIONS: ComplaintCaseStatus[] = [...COMPLAINT_CASE_STATUSES];
const CATEGORY_OPTIONS: ComplaintCategory[] = [...COMPLAINT_CATEGORIES];

const INITIAL_CREATE_FORM: CreateComplaintCaseCommand = {
  caseSource: "ops",
  category: "fare_dispute",
  severity: "normal",
  description: "",
  relatedOrderId: "",
  relatedCallId: "",
};

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

const controlGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(240px, 1.4fr) repeat(2, minmax(180px, 0.85fr))",
  gap: 12,
};

const createGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, min(100%, 1fr)))",
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

const textAreaStyle = {
  ...inputStyle,
  minHeight: 92,
  resize: "vertical" as const,
};

function actionButtonStyle(variant: "primary" | "secondary" = "secondary") {
  const palette =
    variant === "primary"
      ? {
          background: theme.accent,
          color: "#fff",
          border: theme.accent,
        }
      : {
          background: theme.surface,
          color: theme.text,
          border: theme.border,
        };

  return {
    minHeight: 32,
    padding: "7px 12px",
    borderRadius: 8,
    border: `1px solid ${palette.border}`,
    background: palette.background,
    color: palette.color,
    fontSize: 12.5,
    fontFamily: theme.fontFamily,
    fontWeight: 600,
    cursor: "pointer",
  };
}

function buildShellNav(
  locale: Locale,
  t: (key: string, params?: Record<string, string | number>) => string,
): CanvasShellNavItem[] {
  return [
    { divider: locale === "en" ? "Workspaces" : "工作面" },
    {
      key: "dashboard",
      href: "/dashboard",
      icon: "dashboard",
      label: t("nav.dashboard"),
    },
    { divider: locale === "en" ? "Live Ops" : "即時派遣" },
    {
      key: "dispatch",
      href: "/dispatch",
      icon: "dispatch",
      label: t("nav.dispatch"),
      matchPaths: ["/dispatch"],
    },
    {
      key: "callcenter",
      href: "/callcenter",
      icon: "callcenter",
      label: t("nav.callcenter"),
    },
    { divider: locale === "en" ? "Casework" : "案件處理" },
    {
      key: "complaints",
      href: "/complaints",
      icon: "complaints",
      label: t("nav.complaints"),
    },
    {
      key: "incidents",
      href: "/incidents",
      icon: "incidents",
      label: t("nav.incidents"),
      matchPaths: ["/incidents"],
    },
    { divider: locale === "en" ? "Monitoring" : "營運監控" },
    {
      key: "reports",
      href: "/reports",
      icon: "reports",
      label: t("nav.reports"),
    },
    {
      key: "revenue",
      href: "/revenue",
      icon: "revenue",
      label: t("nav.revenue"),
    },
    {
      key: "attendance",
      href: "/attendance",
      icon: "attendance",
      label: t("nav.attendance"),
    },
  ];
}

function formatDurationHours(locale: Locale, hours: number) {
  const rounded = Math.max(0, Math.round(hours));
  return locale === "en" ? `${rounded}h` : `${rounded} 小時`;
}

function formatPercent(value: number, total: number) {
  if (total === 0) {
    return "0%";
  }

  return `${Math.round((value / total) * 100)}%`;
}

function formatRelativeSla(
  locale: Locale,
  value: string,
  breached = false,
) {
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

function isComplaintActive(status: ComplaintCaseStatus) {
  return ["new", "assigned", "under_investigation", "reopened"].includes(
    status,
  );
}

function compareComplaintPriority(
  left: ComplaintCaseRecord,
  right: ComplaintCaseRecord,
) {
  if (left.slaBreach !== right.slaBreach) {
    return left.slaBreach ? -1 : 1;
  }

  if (Boolean(left.relatedIncidentId) !== Boolean(right.relatedIncidentId)) {
    return left.relatedIncidentId ? -1 : 1;
  }

  if (left.severity !== right.severity) {
    if (left.severity === "high") {
      return -1;
    }
    if (right.severity === "high") {
      return 1;
    }
  }

  if (isComplaintActive(left.status) !== isComplaintActive(right.status)) {
    return isComplaintActive(left.status) ? -1 : 1;
  }

  return (
    new Date(left.slaDueAt).getTime() - new Date(right.slaDueAt).getTime() ||
    new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

function getSeverityTone(severity: ComplaintCaseRecord["severity"]): CanvasTone {
  return severity === "high" ? "danger" : "neutral";
}

function getRowStatusTone(row: ComplaintTableRow): CanvasTone {
  if (row.relatedIncidentId) {
    return "danger";
  }

  if (row.slaBreach) {
    return "danger";
  }

  switch (row.status) {
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

function downloadCsv(rows: ComplaintCaseRecord[]) {
  const header = [
    "case_no",
    "category",
    "severity",
    "description",
    "order_id",
    "sla_due_at",
    "sla_breach",
    "assignee_id",
    "status",
    "related_incident_id",
  ];

  const body = rows.map((row: ComplaintCaseRecord) => [
    row.caseNo,
    row.category,
    row.severity,
    row.description,
    row.relatedOrderId ?? "",
    row.slaDueAt,
    row.slaBreach ? "true" : "false",
    row.assigneeId ?? "",
    row.status,
    row.relatedIncidentId ?? "",
  ]);

  const csv = [header, ...body]
    .map((line) =>
      line
        .map((value) => `"${String(value).replaceAll("\"", "\"\"")}"`)
        .join(","),
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "complaints-export.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatTabLabel(
  label: string,
  count: number,
  active: boolean,
  onClick: () => void,
) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: 0,
        background: "transparent",
        color: active ? theme.text : "inherit",
        padding: 0,
        font: "inherit",
        cursor: "pointer",
      }}
    >
      {`${label} ${count}`}
    </button>
  );
}

export default function ComplaintsPage() {
  const { t, locale } = useTranslation();
  const resolveErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : t("common.unknown");

  const [records, setRecords] = useState<ComplaintCaseRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState<ComplaintTab>("all");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ComplaintCaseStatus | "all">(
    "all",
  );
  const [categoryFilter, setCategoryFilter] = useState<ComplaintCategory | "all">(
    "all",
  );
  const [createForm, setCreateForm] = useState(INITIAL_CREATE_FORM);
  const [busyKey, setBusyKey] = useState<string | null>(null);

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
      setError(resolveErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }

  async function runAction(key: string, action: () => Promise<void>) {
    setBusyKey(key);
    try {
      await action();
      setError(null);
    } catch (nextError) {
      setError(resolveErrorMessage(nextError));
    } finally {
      setBusyKey(null);
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

  const activeCases = useMemo(
    () => records.filter((record) => isComplaintActive(record.status)),
    [records],
  );
  const mineCases = useMemo(
    () =>
      primaryAssigneeId
        ? activeCases.filter((record) => record.assigneeId === primaryAssigneeId)
        : [],
    [activeCases, primaryAssigneeId],
  );
  const breachedCases = useMemo(
    () => records.filter((record) => record.slaBreach),
    [records],
  );
  const escalatedCases = useMemo(
    () => records.filter((record) => Boolean(record.relatedIncidentId)),
    [records],
  );
  const reopenedCases = useMemo(
    () => records.filter((record) => record.reopenCount > 0),
    [records],
  );
  const resolvedCases = useMemo(
    () =>
      records.filter(
        (record) => record.status === "resolved" || record.status === "closed",
      ),
    [records],
  );

  const averageHandlingHours =
    resolvedCases.reduce((sum, record) => {
      const elapsedHours =
        (new Date(record.updatedAt).getTime() - new Date(record.createdAt).getTime()) /
        3_600_000;
      return sum + elapsedHours;
    }, 0) / (resolvedCases.length || 1);

  const latestEscalation = useMemo(
    () => escalatedCases.slice().sort(compareComplaintPriority)[0] ?? null,
    [escalatedCases],
  );

  const nextDueCase = useMemo(
    () =>
      activeCases
        .slice()
        .sort(
          (left, right) =>
            new Date(left.slaDueAt).getTime() - new Date(right.slaDueAt).getTime(),
        )[0] ?? null,
    [activeCases],
  );

  const filteredRecords = useMemo(
    () =>
      records
        .filter((record) => {
          if (activeTab === "mine") {
            return primaryAssigneeId
              ? record.assigneeId === primaryAssigneeId
              : false;
          }

          if (activeTab === "breach") {
            return record.slaBreach;
          }

          if (activeTab === "escalated") {
            return Boolean(record.relatedIncidentId);
          }

          return true;
        })
        .filter((record) => {
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
            record.category,
            record.description,
            record.status,
            record.assigneeId ?? "",
            record.relatedOrderId ?? "",
            record.relatedCallId ?? "",
            record.relatedIncidentId ?? "",
          ]
            .join(" ")
            .toLowerCase();

          return haystack.includes(deferredQuery);
        })
        .sort(compareComplaintPriority),
    [
      activeTab,
      categoryFilter,
      deferredQuery,
      primaryAssigneeId,
      records,
      statusFilter,
    ],
  );

  const tableRows: ComplaintTableRow[] = filteredRecords.map((record) => ({
    caseNo: record.caseNo,
    category: record.category,
    severity: record.severity,
    description: record.description,
    orderId: record.relatedOrderId ?? "—",
    slaDueAt: record.slaDueAt,
    slaBreach: record.slaBreach,
    assignee: record.assigneeId ?? t("complaints.unassigned"),
    status: record.status,
    relatedIncidentId: record.relatedIncidentId,
  }));

  const tableColumns: CanvasTableColumn<ComplaintTableRow>[] = [
    {
      h: "CASE",
      w: 118,
      mono: true,
      r: (row: ComplaintTableRow) => (
        <span style={{ color: theme.accent, fontWeight: 700 }}>{row.caseNo}</span>
      ),
    },
    {
      h: "CATEGORY",
      w: 156,
      mono: true,
      r: (row: ComplaintTableRow) => formatOpsCodeLabel(locale, row.category),
    },
    {
      h: "SEV",
      w: 92,
      r: (row: ComplaintTableRow) => (
        <Pill theme={theme} tone={getSeverityTone(row.severity)} dot>
          {formatOpsCodeLabel(locale, row.severity)}
        </Pill>
      ),
    },
    {
      h: "DESC",
      r: (row: ComplaintTableRow) => (
        <span style={{ whiteSpace: "normal", lineHeight: 1.45 }}>
          {row.description}
        </span>
      ),
    },
    {
      h: "ORDER",
      w: 118,
      mono: true,
      r: (row: ComplaintTableRow) => row.orderId,
    },
    {
      h: "SLA",
      w: 116,
      r: (row: ComplaintTableRow) => (
        <Pill theme={theme} tone={row.slaBreach ? "danger" : "success"} dot>
          {formatRelativeSla(locale, row.slaDueAt, row.slaBreach)}
        </Pill>
      ),
    },
    {
      h: "OWNER",
      w: 110,
      mono: true,
      r: (row: ComplaintTableRow) => row.assignee,
    },
    {
      h: "STATUS",
      w: 170,
      r: (row: ComplaintTableRow) => (
        <div style={{ display: "grid", gap: 6 }}>
          <Pill theme={theme} tone={getRowStatusTone(row)} dot>
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

  const tabCounts: Record<ComplaintTab, number> = {
    all: records.length,
    mine: mineCases.length,
    breach: breachedCases.length,
    escalated: escalatedCases.length,
  };

  const tabLabels: Record<ComplaintTab, string> = {
    all: t("common.all"),
    mine: locale === "en" ? "My Queue" : "我負責",
    breach: locale === "en" ? "SLA breach" : "SLA breach",
    escalated: locale === "en" ? "Escalated incidents" : "已升級事故",
  };

  const tabOrder: ComplaintTab[] = ["all", "mine", "breach", "escalated"];
  const tabNodes: Record<ComplaintTab, ReactNode> = {
    all: formatTabLabel(tabLabels.all, tabCounts.all, activeTab === "all", () =>
      setActiveTab("all"),
    ),
    mine: formatTabLabel(
      tabLabels.mine,
      tabCounts.mine,
      activeTab === "mine",
      () => setActiveTab("mine"),
    ),
    breach: formatTabLabel(
      tabLabels.breach,
      tabCounts.breach,
      activeTab === "breach",
      () => setActiveTab("breach"),
    ),
    escalated: formatTabLabel(
      tabLabels.escalated,
      tabCounts.escalated,
      activeTab === "escalated",
      () => setActiveTab("escalated"),
    ),
  };

  const controlSummary = [
    {
      k: locale === "en" ? "Visible" : "顯示中",
      v: `${filteredRecords.length}`,
      mono: true,
    },
    {
      k: locale === "en" ? "Owner focus" : "負責人焦點",
      v: primaryAssigneeId ?? t("complaints.unassigned"),
      mono: true,
    },
    {
      k: locale === "en" ? "Next SLA" : "下一個 SLA",
      v: nextDueCase
        ? `${nextDueCase.caseNo} · ${formatRelativeSla(locale, nextDueCase.slaDueAt, nextDueCase.slaBreach)}`
        : "—",
      mono: true,
    },
    {
      k: locale === "en" ? "Latest escalation" : "最近升級",
      v: latestEscalation
        ? `${latestEscalation.caseNo} → ${latestEscalation.relatedIncidentId}`
        : "—",
      mono: true,
    },
  ];

  return (
    <Shell
      theme={theme}
      nav={buildShellNav(locale, t)}
      active="complaints"
      brandLabel={t("app.name")}
      brandSubLabel={t("app.sub")}
      breadcrumb={[t("nav.complaints")]}
      searchPlaceholder={t("common.search")}
    >
      <PageHeader
        theme={theme}
        title={t("complaints.title")}
        subtitle={t("complaints.subtitle")}
        tabs={tabOrder.map((tab) => tabNodes[tab])}
        activeTab={tabNodes[activeTab]}
        actions={
          <>
            <Btn
              theme={theme}
              icon="filter"
              onClick={() => setFiltersOpen((current: boolean) => !current)}
            >
              {t("complaints.form.category")}
            </Btn>
            <Btn
              theme={theme}
              icon="export"
              disabled={filteredRecords.length === 0}
              onClick={() => downloadCsv(filteredRecords)}
            >
              {t("complaints.timelineExport")}
            </Btn>
            <Btn
              theme={theme}
              variant="primary"
              icon="plus"
              onClick={() => setShowCreate((current: boolean) => !current)}
            >
              {showCreate ? t("complaints.hideCreate") : t("complaints.createBtn")}
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
            body={t("common.errorMessage")}
            actions={
              <Btn theme={theme} onClick={() => void loadRecords()}>
                {t("common.refresh")}
              </Btn>
            }
          />
        ) : null}

        <div style={kpiGridStyle}>
          <KPI
            theme={theme}
            label={locale === "en" ? "Open complaints" : "未結客訴"}
            value={activeCases.length}
            delta={
              locale === "en"
                ? `${breachedCases.length} SLA breach`
                : `${breachedCases.length} SLA breach`
            }
            deltaTone={breachedCases.length > 0 ? "down" : "neutral"}
          />
          <KPI
            theme={theme}
            label={locale === "en" ? "Avg handling" : "平均處理"}
            value={formatDurationHours(locale, averageHandlingHours)}
            delta={locale === "en" ? "resolved / closed" : "已解決 / 結案"}
            deltaTone="up"
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
                ? `↑ ${reopenedCases.length} reopened`
                : `↑ ${reopenedCases.length} 件重開`
            }
            deltaTone={reopenedCases.length > 0 ? "down" : "neutral"}
          />
        </div>

        {filtersOpen || showCreate ? (
          <Card
            theme={theme}
            title={showCreate ? t("complaints.createTitle") : t("complaints.registry")}
            subtitle={
              showCreate ? t("complaints.createNote") : t("complaints.results", { count: filteredRecords.length })
            }
          >
            <div style={{ display: "grid", gap: 16 }}>
              <DL theme={theme} cols={4} items={controlSummary} />

              {filtersOpen ? (
                <div style={controlGridStyle}>
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
                </div>
              ) : null}

              {showCreate ? (
                <div
                  style={{
                    display: "grid",
                    gap: 12,
                    paddingTop: 16,
                    borderTop: `1px solid ${theme.border}`,
                  }}
                >
                  <div style={createGridStyle}>
                    <Field theme={theme} label={t("complaints.form.source")}>
                      <select
                        value={createForm.caseSource}
                        onChange={(event) =>
                          setCreateForm((current: CreateComplaintCaseCommand) => ({
                            ...current,
                            caseSource: event.target
                              .value as CreateComplaintCaseCommand["caseSource"],
                          }))
                        }
                        style={inputStyle}
                      >
                        {(["ops", "phone", "web", "app"] as const).map((source) => (
                          <option key={source} value={source}>
                            {formatOpsCodeLabel(locale, source)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field theme={theme} label={t("complaints.form.category")}>
                      <select
                        value={createForm.category}
                        onChange={(event) =>
                          setCreateForm((current: CreateComplaintCaseCommand) => ({
                            ...current,
                            category: event.target.value as ComplaintCategory,
                          }))
                        }
                        style={inputStyle}
                      >
                        {CATEGORY_OPTIONS.map((category) => (
                          <option key={category} value={category}>
                            {formatOpsCodeLabel(locale, category)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field theme={theme} label={t("complaints.form.severity")}>
                      <select
                        value={createForm.severity}
                        onChange={(event) =>
                          setCreateForm((current: CreateComplaintCaseCommand) => ({
                            ...current,
                            severity: event.target
                              .value as CreateComplaintCaseCommand["severity"],
                          }))
                        }
                        style={inputStyle}
                      >
                        {(["normal", "high"] as const).map((severity) => (
                          <option key={severity} value={severity}>
                            {formatOpsCodeLabel(locale, severity)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field theme={theme} label={t("complaints.form.relatedOrder")}>
                      <input
                        type="text"
                        value={createForm.relatedOrderId ?? ""}
                        onChange={(event) =>
                          setCreateForm((current: CreateComplaintCaseCommand) => ({
                            ...current,
                            relatedOrderId: event.target.value,
                          }))
                        }
                        style={inputStyle}
                      />
                    </Field>
                    <Field theme={theme} label={t("complaints.form.relatedCall")}>
                      <input
                        type="text"
                        value={createForm.relatedCallId ?? ""}
                        onChange={(event) =>
                          setCreateForm((current: CreateComplaintCaseCommand) => ({
                            ...current,
                            relatedCallId: event.target.value,
                          }))
                        }
                        style={inputStyle}
                      />
                    </Field>
                  </div>

                  <Field theme={theme} label={t("complaints.form.description")}>
                    <textarea
                      rows={4}
                      value={createForm.description}
                      onChange={(event) =>
                        setCreateForm((current: CreateComplaintCaseCommand) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      style={textAreaStyle}
                    />
                  </Field>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      disabled={busyKey === "create-complaint"}
                      style={actionButtonStyle("primary")}
                      onClick={() =>
                        void runAction("create-complaint", async () => {
                          await getOpsClient().createComplaint({
                            ...createForm,
                            relatedOrderId: createForm.relatedOrderId || null,
                            relatedCallId: createForm.relatedCallId || null,
                          });
                          setCreateForm(INITIAL_CREATE_FORM);
                          setShowCreate(false);
                          await loadRecords();
                        })
                      }
                    >
                      {busyKey === "create-complaint"
                        ? t("complaints.form.saving")
                        : t("complaints.form.createRecord")}
                    </button>
                    <button
                      type="button"
                      style={actionButtonStyle()}
                      onClick={() => setShowCreate(false)}
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        ) : null}

        <Card
          theme={theme}
          title={t("complaints.caseList")}
          subtitle={t("complaints.results", { count: filteredRecords.length })}
          padding={0}
          actions={
            <Btn theme={theme} onClick={() => void loadRecords()}>
              {t("common.refresh")}
            </Btn>
          }
        >
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
                body={t("complaints.noSelection")}
              />
            </div>
          ) : (
            <Table theme={theme} columns={tableColumns} rows={tableRows} />
          )}
        </Card>
      </div>
    </Shell>
  );
}
