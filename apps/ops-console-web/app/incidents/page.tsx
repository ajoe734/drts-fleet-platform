"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  type CSSProperties,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
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
  type CanvasTableColumn,
  type CanvasTheme,
} from "@drts/ui-web";
import type {
  CreateIncidentCommand,
  IncidentCategory,
  IncidentEscalationTarget,
  IncidentRecord,
  IncidentSeverity,
  IncidentStatus,
  IncidentTimelineEntry,
  RecordServiceRecoveryActionCommand,
  ServiceRecoveryActionRecord,
  UpdateIncidentCommand,
} from "@drts/contracts";
import {
  INCIDENT_CATEGORIES,
  INCIDENT_ESCALATION_TARGETS,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
} from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const STATUSES: IncidentStatus[] = [...INCIDENT_STATUSES];
const SEVERITIES: IncidentSeverity[] = [...INCIDENT_SEVERITIES];
const CATEGORIES: IncidentCategory[] = [...INCIDENT_CATEGORIES];
const ESCALATION_TARGETS: IncidentEscalationTarget[] = [
  ...INCIDENT_ESCALATION_TARGETS,
];

const SERVICE_RECOVERY_TYPES = [
  "passenger_recontact",
  "fare_adjustment",
  "redispatch_ordered",
  "voucher_issued",
  "apology_sent",
  "driver_reassigned",
  "other",
] as const;

type IncidentTab = "active" | "resolved" | "closed";

type IncidentTableRow = Record<string, unknown> &
  IncidentRecord & {
    _selected?: boolean;
  };

type IncidentFormInitialValues = {
  title?: string;
  description?: string;
  category?: IncidentCategory;
  severity?: IncidentSeverity;
  complaintCaseNo?: string;
  relatedOrderId?: string;
  relatedVehicleId?: string;
  relatedDriverId?: string;
  reportedBy?: string;
  occurredAt?: string;
  location?: string;
};

function formatDateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

function formatIncidentAge(
  value: string | null | undefined,
  locale: "en" | "zh",
) {
  if (!value) {
    return locale === "en" ? "Time not recorded" : "尚未記錄時間";
  }

  const deltaMinutes = Math.round(
    (Date.now() - new Date(value).getTime()) / (1000 * 60),
  );
  if (deltaMinutes < 60) {
    return locale === "en"
      ? `${deltaMinutes} min ago`
      : `${deltaMinutes} 分鐘前`;
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  return locale === "en" ? `${deltaHours} hr ago` : `${deltaHours} 小時前`;
}

function controlStyle(themeToken: CanvasTheme, mono = false): CSSProperties {
  return {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 7,
    border: `1px solid ${themeToken.border}`,
    background: themeToken.surfaceLo,
    color: themeToken.text,
    fontSize: 12.5,
    fontFamily: mono ? themeToken.monoFamily : themeToken.fontFamily,
    boxSizing: "border-box",
  };
}

function textAreaStyle(themeToken: CanvasTheme): CSSProperties {
  return {
    ...controlStyle(themeToken),
    minHeight: 108,
    resize: "vertical",
  };
}

function inlineLinkStyle(themeToken: CanvasTheme): CSSProperties {
  return {
    color: themeToken.accent,
    textDecoration: "none",
    fontWeight: 600,
  };
}

function backLinkStyle(themeToken: CanvasTheme): CSSProperties {
  return {
    display: "inline-flex",
    flexDirection: "column",
    gap: 4,
    padding: "10px 12px",
    borderRadius: 8,
    border: `1px solid ${themeToken.border}`,
    background: themeToken.surface,
    color: themeToken.text,
    textDecoration: "none",
    alignSelf: "flex-start",
  };
}

function primaryButtonStyle(themeToken: CanvasTheme): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "5px 10px",
    height: 28,
    borderRadius: 7,
    border: `1px solid ${themeToken.accent}`,
    background: themeToken.accent,
    color: "#ffffff",
    fontSize: 12,
    fontWeight: 500,
    fontFamily: themeToken.fontFamily,
    cursor: "pointer",
  };
}

function accentTextButtonStyle(themeToken: CanvasTheme): CSSProperties {
  return {
    padding: 0,
    border: "none",
    background: "transparent",
    color: themeToken.accent,
    fontFamily: themeToken.monoFamily,
    fontSize: 11.5,
    fontWeight: 700,
    cursor: "pointer",
  };
}

function timelineItemStyle(themeToken: CanvasTheme): CSSProperties {
  return {
    display: "grid",
    gap: 6,
    padding: "12px 14px",
    borderRadius: 8,
    border: `1px solid ${themeToken.border}`,
    background: themeToken.surfaceLo,
  };
}

function emptyStateStyle(themeToken: CanvasTheme): CSSProperties {
  return {
    padding: "18px 14px",
    color: themeToken.textMuted,
    fontSize: 12.5,
  };
}

function buildOpsNav(locale: "en" | "zh") {
  return [
    { divider: locale === "en" ? "Workspace" : "工作面" },
    {
      key: "dashboard",
      href: "/dashboard",
      icon: "dashboard" as const,
      label: locale === "en" ? "Dashboard" : "營運總覽",
    },
    { divider: locale === "en" ? "Dispatch" : "即時派遣" },
    {
      key: "dispatch",
      href: "/dispatch",
      icon: "dispatch" as const,
      label: locale === "en" ? "Dispatch" : "派遣",
    },
    {
      key: "callcenter",
      href: "/callcenter",
      icon: "callcenter" as const,
      label: locale === "en" ? "Callcenter" : "客服中心",
    },
    { divider: locale === "en" ? "Casework" : "案件處理" },
    {
      key: "complaints",
      href: "/complaints",
      icon: "complaints" as const,
      label: locale === "en" ? "Complaints" : "客訴",
    },
    {
      key: "incidents",
      href: "/incidents",
      icon: "incidents" as const,
      label: locale === "en" ? "Incidents" : "事故",
      badge: "1",
      badgeTone: "danger" as const,
    },
    { divider: locale === "en" ? "Monitoring" : "營運監控" },
    {
      key: "reports",
      href: "/reports",
      icon: "reports" as const,
      label: locale === "en" ? "Reports" : "報表",
    },
    {
      key: "revenue",
      href: "/revenue",
      icon: "revenue" as const,
      label: locale === "en" ? "Revenue" : "收益審視",
    },
    {
      key: "attendance",
      href: "/attendance",
      icon: "attendance" as const,
      label: locale === "en" ? "Attendance" : "班次出勤",
    },
    {
      key: "maintenance",
      href: "/maintenance",
      icon: "maintenance" as const,
      label: locale === "en" ? "Maintenance" : "車輛保修",
    },
    { divider: locale === "en" ? "Registry" : "主資料" },
    {
      key: "drivers",
      href: "/drivers",
      icon: "fleet" as const,
      label: locale === "en" ? "Drivers" : "司機",
    },
    {
      key: "vehicles",
      href: "/vehicles",
      icon: "vehicles" as const,
      label: locale === "en" ? "Vehicles" : "車輛",
    },
    {
      key: "contracts",
      href: "/contracts",
      icon: "contracts" as const,
      label: locale === "en" ? "Contracts" : "合約",
    },
    {
      key: "flags",
      href: "/feature-flags",
      icon: "flags" as const,
      label: locale === "en" ? "Feature Flags" : "功能旗標",
    },
  ];
}

function matchesIncidentTab(status: IncidentStatus, tab: IncidentTab) {
  if (tab === "active") {
    return status === "open" || status === "investigating";
  }
  if (tab === "resolved") {
    return status === "resolved";
  }
  return status === "closed";
}

function incidentSeverityTone(severity: IncidentSeverity) {
  if (severity === "critical" || severity === "high") {
    return "danger" as const;
  }
  if (severity === "medium") {
    return "warn" as const;
  }
  return "neutral" as const;
}

function incidentStatusTone(status: IncidentStatus) {
  if (status === "investigating") {
    return "danger" as const;
  }
  if (status === "resolved") {
    return "success" as const;
  }
  if (status === "closed") {
    return "neutral" as const;
  }
  return "warn" as const;
}

function renderSeverityPill(severity: IncidentSeverity) {
  return (
    <Pill theme={theme} tone={incidentSeverityTone(severity)} dot>
      {severity}
    </Pill>
  );
}

function renderStatusPill(status: IncidentStatus) {
  return (
    <Pill theme={theme} tone={incidentStatusTone(status)} dot>
      {status}
    </Pill>
  );
}

function buildCriticalBannerBody(record: IncidentRecord, locale: "en" | "zh") {
  const driverLabel = record.relatedDriverId
    ? locale === "en"
      ? `Driver ${record.relatedDriverId}`
      : `司機 ${record.relatedDriverId}`
    : locale === "en"
      ? "Driver not linked"
      : "未連結司機";
  const locationLabel = record.location
    ? locale === "en"
      ? `at ${record.location}`
      : `於 ${record.location}`
    : locale === "en"
      ? "location pending"
      : "地點待補";
  const ownerLabel = record.assignedTo
    ? locale === "en"
      ? `${record.assignedTo} now owns the response.`
      : `目前由 ${record.assignedTo} 接手處理。`
    : locale === "en"
      ? "Ownership not assigned yet."
      : "目前尚未指派 owner。";

  return `${driverLabel} ${locationLabel}. ${record.description} ${ownerLabel}`;
}

function compareIncidentPriority(a: IncidentRecord, b: IncidentRecord) {
  const severityWeight =
    incidentSeverityWeight(b.severity) - incidentSeverityWeight(a.severity);
  if (severityWeight !== 0) return severityWeight;

  return (
    new Date(b.occurredAt ?? b.createdAt).getTime() -
    new Date(a.occurredAt ?? a.createdAt).getTime()
  );
}

function incidentSeverityWeight(severity: IncidentSeverity) {
  switch (severity) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
    default:
      return 1;
  }
}

export default function IncidentsPage() {
  const { t, locale } = useTranslation();
  const searchParams = useSearchParams();
  const [records, setRecords] = useState<IncidentRecord[]>([]);
  const [timeline, setTimeline] = useState<IncidentTimelineEntry[]>([]);
  const [recoveryActions, setRecoveryActions] = useState<
    ServiceRecoveryActionRecord[]
  >([]);
  const [showRecoveryForm, setShowRecoveryForm] = useState(false);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<IncidentTab>("active");
  const [severityFilter, setSeverityFilter] = useState<
    IncidentSeverity | "all"
  >("all");
  const [categoryFilter, setCategoryFilter] = useState<
    IncidentCategory | "all"
  >("all");
  const [showFilters, setShowFilters] = useState(true);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const createFromQuery = searchParams.get("create") === "1";
  const incidentIdFromQuery = searchParams.get("incidentId");
  const complaintCaseNoFromQuery =
    searchParams.get("complaintCaseNo")?.trim() ?? "";
  const createDefaults: IncidentFormInitialValues = {
    title: searchParams.get("title") ?? "",
    description: searchParams.get("description") ?? "",
    category: CATEGORIES.includes(
      searchParams.get("category") as IncidentCategory,
    )
      ? (searchParams.get("category") as IncidentCategory)
      : "operational",
    severity: SEVERITIES.includes(
      searchParams.get("severity") as IncidentSeverity,
    )
      ? (searchParams.get("severity") as IncidentSeverity)
      : "medium",
    complaintCaseNo: complaintCaseNoFromQuery,
    relatedOrderId: searchParams.get("relatedOrderId") ?? "",
    relatedVehicleId: searchParams.get("relatedVehicleId") ?? "",
    relatedDriverId: searchParams.get("relatedDriverId") ?? "",
    reportedBy: searchParams.get("reportedBy") ?? "ops-user-001",
    location: searchParams.get("location") ?? "",
  };
  const selectedIncident = useMemo(
    () =>
      records.find((record) => record.incidentId === selectedIncidentId) ??
      null,
    [records, selectedIncidentId],
  );
  const editingRecord = editingId
    ? records.find((record) => record.incidentId === editingId)
    : undefined;

  useEffect(() => {
    void loadRecords();
  }, []);

  useEffect(() => {
    if (!createFromQuery) {
      return;
    }
    setShowCreate(true);
    setEditingId(null);
  }, [createFromQuery]);

  useEffect(() => {
    if (!incidentIdFromQuery) {
      return;
    }

    setSelectedIncidentId(incidentIdFromQuery);
    void loadTimeline(incidentIdFromQuery);
  }, [incidentIdFromQuery]);

  async function loadRecords() {
    setLoading(true);
    try {
      const client = getOpsClient();
      const result = await client.listIncidents();
      setRecords(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknown"));
    } finally {
      setLoading(false);
    }
  }

  async function loadTimeline(incidentId: string) {
    try {
      const client = getOpsClient();
      const [items, actions] = await Promise.all([
        client.getIncidentTimeline(incidentId),
        client.getServiceRecoveryActions(incidentId),
      ]);
      setSelectedIncidentId(incidentId);
      setTimeline(items);
      setRecoveryActions(actions);
      setShowRecoveryForm(false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknown"));
    }
  }

  async function inspectIncident(incidentId: string) {
    setSelectedIncidentId(incidentId);
    await loadTimeline(incidentId);
    document
      .getElementById("incident-detail-section")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function resolveIncident(incidentId: string) {
    try {
      const client = getOpsClient();
      await client.updateIncident(incidentId, { status: "resolved" });
      await loadRecords();
      if (selectedIncidentId === incidentId) {
        await loadTimeline(incidentId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknown"));
    }
  }

  const filteredRecords = records
    .filter((record) => {
      if (!matchesIncidentTab(record.status, activeTab)) return false;
      if (severityFilter !== "all" && record.severity !== severityFilter) {
        return false;
      }
      if (categoryFilter !== "all" && record.category !== categoryFilter) {
        return false;
      }
      if (!deferredQuery) return true;
      const haystack = [
        record.incidentId,
        record.title,
        record.description,
        record.category,
        record.severity,
        record.status,
        record.relatedOrderId ?? "",
        record.relatedVehicleId ?? "",
        record.relatedDriverId ?? "",
        record.relatedComplaintCaseNo ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(deferredQuery);
    })
    .sort(compareIncidentPriority);

  const criticalQueue = records
    .filter(
      (record) =>
        matchesIncidentTab(record.status, "active") &&
        record.severity === "critical",
    )
    .sort(compareIncidentPriority);
  const criticalBannerRecord = criticalQueue[0] ?? null;

  const activeCount = records.filter((record) =>
    matchesIncidentTab(record.status, "active"),
  ).length;
  const visibleRecoveryCount = selectedIncident
    ? Math.max(
        recoveryActions.length,
        selectedIncident.serviceRecoveryActions.length,
      )
    : 0;

  const tableRows: IncidentTableRow[] = filteredRecords.map((record) => ({
    ...record,
    _selected: record.incidentId === selectedIncidentId,
  }));

  const columns: CanvasTableColumn<IncidentTableRow>[] = [
    {
      h: "INC",
      w: 104,
      mono: true,
      r: (row) => (
        <button
          type="button"
          onClick={() => void inspectIncident(row.incidentId)}
          style={accentTextButtonStyle(theme)}
        >
          {row.incidentId}
        </button>
      ),
    },
    {
      h: "TITLE",
      w: 300,
      r: (row) => (
        <div
          style={{
            display: "grid",
            gap: 4,
            minWidth: 0,
            whiteSpace: "normal",
          }}
        >
          <span style={{ fontWeight: 600 }}>{row.title}</span>
          <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
            {row.description}
          </span>
          {row.sourceDispatchExceptionOrderId ? (
            <div>
              <Pill theme={theme} tone="warn">
                {t("incidents.dispatchException")}
              </Pill>
            </div>
          ) : null}
        </div>
      ),
    },
    {
      h: "CAT",
      k: "category",
      w: 132,
      mono: true,
    },
    {
      h: "SEV",
      w: 110,
      r: (row) => renderSeverityPill(row.severity),
    },
    {
      h: "STATUS",
      w: 130,
      r: (row) => renderStatusPill(row.status),
    },
    {
      h: "DRIVER",
      w: 110,
      mono: true,
      r: (row) =>
        row.relatedDriverId ? (
          <div style={{ whiteSpace: "normal" }}>
            <div>{row.relatedDriverId}</div>
            {row.relatedVehicleId ? (
              <div style={{ color: theme.textDim, fontSize: 10.5 }}>
                {row.relatedVehicleId}
              </div>
            ) : null}
          </div>
        ) : (
          "—"
        ),
    },
    {
      h: "OCCURRED",
      w: 168,
      mono: true,
      r: (row) => formatDateTime(row.occurredAt ?? row.createdAt),
    },
    {
      h: "RECOVERY",
      w: 108,
      mono: true,
      r: (row) => `${row.serviceRecoveryActions.length} actions`,
    },
  ];

  const nav = buildOpsNav(locale);
  const tabConfig: Array<{ key: IncidentTab; label: string }> = [
    { key: "active", label: `Active ${activeCount}` },
    { key: "resolved", label: "Resolved" },
    { key: "closed", label: "Closed" },
  ];
  const tabNodes = tabConfig.map((tab) => (
    <button
      key={tab.key}
      type="button"
      onClick={() => setActiveTab(tab.key)}
      style={{
        padding: 0,
        border: "none",
        background: "transparent",
        color: "inherit",
        font: "inherit",
        cursor: "pointer",
      }}
    >
      {tab.label}
    </button>
  ));
  const activeTabNode =
    tabNodes[tabConfig.findIndex((tab) => tab.key === activeTab)] ??
    tabNodes[0];

  return (
    <Shell
      theme={theme}
      nav={nav}
      active="incidents"
      currentPath="/incidents"
      breadcrumb={[locale === "en" ? "Incidents" : "事故"]}
      brandLabel="DRTS Fleet"
      brandSubLabel={locale === "en" ? "Operations Console" : "營運控制台"}
      brandMark="OC"
      searchPlaceholder={t("incidents.search")}
      avatarLabel="OC"
      style={{ minHeight: "100vh" }}
    >
      <PageHeader
        theme={theme}
        title={t("incidents.title")}
        subtitle={t("incidents.subtitle")}
        tabs={tabNodes}
        activeTab={activeTabNode}
        actions={
          <>
            <Btn
              theme={theme}
              icon="filter"
              variant={showFilters ? "primary" : "secondary"}
              onClick={() => setShowFilters((value) => !value)}
            >
              {locale === "en" ? "Filters" : "類別"}
            </Btn>
            <Btn
              theme={theme}
              variant="primary"
              icon="plus"
              onClick={() => {
                setShowCreate(true);
                setEditingId(null);
              }}
            >
              {t("incidents.createBtn")}
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
            theme={theme}
            tone="danger"
            title={getOpsLabel(locale, "error")}
            body={error}
          />
        ) : null}

        {criticalBannerRecord ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={`${criticalBannerRecord.incidentId} · ${criticalBannerRecord.title} · ${criticalBannerRecord.severity} · ${criticalBannerRecord.status}`}
            body={buildCriticalBannerBody(criticalBannerRecord, locale)}
            actions={
              <Btn
                theme={theme}
                variant="primary"
                onClick={() =>
                  void inspectIncident(criticalBannerRecord.incidentId)
                }
              >
                {locale === "en" ? "Open incident" : "前往事件"}
              </Btn>
            }
          />
        ) : (
          <Banner
            theme={theme}
            tone="info"
            icon="ok"
            title={getOpsLabel(locale, "incidentsAllClear")}
            body={
              locale === "en"
                ? "No critical incidents are waiting in the active queue."
                : "目前沒有重大事故待處理。"
            }
          />
        )}

        {showCreate || editingId ? (
          <Card
            theme={theme}
            title={
              editingId
                ? t("incidents.form.updateTitle")
                : t("incidents.form.createTitle")
            }
            subtitle={
              editingId
                ? (editingRecord?.incidentId ?? t("incidents.selectIncident"))
                : complaintCaseNoFromQuery
                  ? `${t("incidents.linkComplaintTitle")} · ${complaintCaseNoFromQuery}`
                  : t("incidents.subtitle")
            }
          >
            <IncidentForm
              editingRecord={editingRecord}
              {...(!editingId ? { initialValues: createDefaults } : {})}
              onCancel={() => {
                setShowCreate(false);
                setEditingId(null);
              }}
              onSubmit={async (command) => {
                try {
                  const client = getOpsClient();
                  if (editingId) {
                    await client.updateIncident(
                      editingId,
                      command as UpdateIncidentCommand,
                    );
                    await loadRecords();
                    if (selectedIncidentId === editingId) {
                      await loadTimeline(editingId);
                    }
                  } else {
                    const created = await client.createIncident(
                      command as CreateIncidentCommand,
                    );
                    if (complaintCaseNoFromQuery) {
                      await client.linkIncidentToComplaint(
                        created.incidentId,
                        complaintCaseNoFromQuery,
                      );
                      setSelectedIncidentId(created.incidentId);
                      await loadTimeline(created.incidentId);
                    }
                    await loadRecords();
                  }
                  setShowCreate(false);
                  setEditingId(null);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : t("common.unknown"),
                  );
                }
              }}
            />
          </Card>
        ) : null}

        <Card theme={theme} padding={0}>
          <div
            style={{
              padding: "12px 14px",
              borderBottom: `1px solid ${theme.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <Pill theme={theme} tone="accent" dot>
                {tabConfig.find((tab) => tab.key === activeTab)?.label}
              </Pill>
              <span style={{ fontSize: 11.5, color: theme.textMuted }}>
                {t("incidents.visible", { count: filteredRecords.length })}
              </span>
            </div>
            <Btn
              theme={theme}
              icon="refresh"
              onClick={() => void loadRecords()}
            >
              {t("common.refresh")}
            </Btn>
          </div>

          {showFilters ? (
            <div
              style={{
                padding: "14px 14px 0",
                borderBottom: `1px solid ${theme.border}`,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 12,
                }}
              >
                <Field theme={theme} label={t("common.search")}>
                  <input
                    type="search"
                    style={controlStyle(theme)}
                    placeholder={t("incidents.search")}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </Field>
                <Field theme={theme} label={t("incidents.allCategories")}>
                  <select
                    style={controlStyle(theme)}
                    value={categoryFilter}
                    onChange={(event) =>
                      setCategoryFilter(
                        event.target.value as IncidentCategory | "all",
                      )
                    }
                  >
                    <option value="all">{t("incidents.allCategories")}</option>
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {formatOpsCodeLabel(locale, category)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field theme={theme} label={t("incidents.allSeverities")}>
                  <select
                    style={controlStyle(theme)}
                    value={severityFilter}
                    onChange={(event) =>
                      setSeverityFilter(
                        event.target.value as IncidentSeverity | "all",
                      )
                    }
                  >
                    <option value="all">{t("incidents.allSeverities")}</option>
                    {SEVERITIES.map((severity) => (
                      <option key={severity} value={severity}>
                        {formatOpsCodeLabel(locale, severity)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          ) : null}

          {loading ? (
            <div style={emptyStateStyle(theme)}>
              {getOpsLabel(locale, "incidentsLoading")}
            </div>
          ) : tableRows.length > 0 ? (
            <Table theme={theme} columns={columns} rows={tableRows} />
          ) : (
            <div style={emptyStateStyle(theme)}>{t("incidents.empty")}</div>
          )}
        </Card>

        <div
          id="incident-detail-section"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          <Card
            theme={theme}
            title={
              selectedIncident
                ? `${selectedIncident.incidentId} · ${selectedIncident.title}`
                : t("incidents.timeline")
            }
            subtitle={
              selectedIncident
                ? formatIncidentAge(
                    selectedIncident.occurredAt ?? selectedIncident.createdAt,
                    locale,
                  )
                : getOpsLabel(locale, "incidentsSelectHint")
            }
            actions={
              selectedIncident ? (
                <>
                  <Btn
                    theme={theme}
                    onClick={() => setEditingId(selectedIncident.incidentId)}
                  >
                    {t("common.edit")}
                  </Btn>
                  {selectedIncident.status !== "resolved" &&
                  selectedIncident.status !== "closed" ? (
                    <Btn
                      theme={theme}
                      danger
                      onClick={() =>
                        void resolveIncident(selectedIncident.incidentId)
                      }
                    >
                      {t("incidents.resolve")}
                    </Btn>
                  ) : null}
                </>
              ) : undefined
            }
          >
            {selectedIncident ? (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: 10,
                    marginBottom: 14,
                  }}
                >
                  <KPI
                    theme={theme}
                    label={t("common.status")}
                    value={formatOpsCodeLabel(locale, selectedIncident.status)}
                    delta={formatIncidentAge(
                      selectedIncident.occurredAt ?? selectedIncident.createdAt,
                      locale,
                    )}
                    deltaTone="neutral"
                  />
                  <KPI
                    theme={theme}
                    label={t("incidents.col.severity")}
                    value={formatOpsCodeLabel(
                      locale,
                      selectedIncident.severity,
                    )}
                    delta={
                      selectedIncident.assignedTo ??
                      (locale === "en" ? "Unassigned" : "未指派")
                    }
                    deltaTone={
                      selectedIncident.severity === "critical" ||
                      selectedIncident.severity === "high"
                        ? "down"
                        : "neutral"
                    }
                  />
                  <KPI
                    theme={theme}
                    label={t("incidents.col.escalation")}
                    value={
                      selectedIncident.escalationTarget
                        ? t(
                            `incidents.escalationBadge.${selectedIncident.escalationTarget}` as any,
                          )
                        : t("incidents.form.escalationNone")
                    }
                    delta={formatDateTime(selectedIncident.updatedAt)}
                    deltaTone="neutral"
                  />
                  <KPI
                    theme={theme}
                    label={t("incidents.serviceRecovery")}
                    value={String(visibleRecoveryCount)}
                    delta={
                      locale === "en" ? "actions recorded" : "筆行動已記錄"
                    }
                    deltaTone="neutral"
                  />
                </div>

                <DL
                  theme={theme}
                  cols={2}
                  items={[
                    { k: "CATEGORY", v: selectedIncident.category, mono: true },
                    {
                      k: "OCCURRED",
                      v: formatDateTime(
                        selectedIncident.occurredAt ??
                          selectedIncident.createdAt,
                      ),
                      mono: true,
                    },
                    {
                      k: "DRIVER",
                      v: selectedIncident.relatedDriverId ?? "—",
                      mono: true,
                    },
                    {
                      k: "VEHICLE",
                      v: selectedIncident.relatedVehicleId ?? "—",
                      mono: true,
                    },
                    {
                      k: "ORDER",
                      v: selectedIncident.relatedOrderId ? (
                        <Link
                          href={`/dispatch?orderId=${encodeURIComponent(selectedIncident.relatedOrderId)}`}
                          style={inlineLinkStyle(theme)}
                        >
                          {selectedIncident.relatedOrderId}
                        </Link>
                      ) : (
                        "—"
                      ),
                      mono: true,
                    },
                    {
                      k: "COMPLAINT",
                      v: selectedIncident.relatedComplaintCaseNo ? (
                        <Link
                          href={`/complaints?caseNo=${encodeURIComponent(selectedIncident.relatedComplaintCaseNo)}`}
                          style={inlineLinkStyle(theme)}
                        >
                          {selectedIncident.relatedComplaintCaseNo}
                        </Link>
                      ) : (
                        "—"
                      ),
                      mono: true,
                    },
                    {
                      k: "LOCATION",
                      v: selectedIncident.location ?? "—",
                    },
                    {
                      k: "REPORTED BY",
                      v: selectedIncident.reportedBy,
                      mono: true,
                    },
                  ]}
                />

                <div
                  style={{
                    marginTop: 14,
                    color: theme.textMuted,
                    lineHeight: 1.5,
                    fontSize: 12.5,
                  }}
                >
                  {selectedIncident.description}
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    marginTop: 14,
                  }}
                >
                  {timeline.length > 0 ? (
                    timeline.map((entry) => (
                      <div key={entry.entryId} style={timelineItemStyle(theme)}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                            flexWrap: "wrap",
                          }}
                        >
                          <strong style={{ fontSize: 12.5 }}>
                            {formatOpsCodeLabel(locale, entry.action)}
                          </strong>
                          <span
                            style={{
                              fontSize: 10.5,
                              color: theme.textDim,
                              fontFamily: theme.monoFamily,
                            }}
                          >
                            {formatDateTime(entry.createdAt)}
                          </span>
                        </div>
                        <div style={{ color: theme.text, lineHeight: 1.45 }}>
                          {entry.note}
                        </div>
                        <div style={{ fontSize: 11, color: theme.textMuted }}>
                          {entry.actor}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={emptyStateStyle(theme)}>
                      {t("incidents.timelineEmpty")}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={emptyStateStyle(theme)}>
                {getOpsLabel(locale, "incidentsSelectHint")}
              </div>
            )}
          </Card>

          <Card
            theme={theme}
            title={t("incidents.serviceRecovery.title")}
            subtitle={
              selectedIncident
                ? selectedIncident.incidentId
                : t("incidents.selectIncident")
            }
            actions={
              selectedIncident ? (
                <Btn
                  theme={theme}
                  variant={showRecoveryForm ? "secondary" : "primary"}
                  icon={showRecoveryForm ? "x" : "plus"}
                  onClick={() => setShowRecoveryForm((value) => !value)}
                >
                  {showRecoveryForm
                    ? t("common.cancel")
                    : t("incidents.serviceRecovery.add")}
                </Btn>
              ) : undefined
            }
          >
            {selectedIncident ? (
              <>
                <DL
                  theme={theme}
                  cols={1}
                  items={[
                    {
                      k: "STATUS",
                      v: renderStatusPill(selectedIncident.status),
                    },
                    {
                      k: "SEVERITY",
                      v: renderSeverityPill(selectedIncident.severity),
                    },
                    {
                      k: "ESCALATION",
                      v: selectedIncident.escalationTarget
                        ? t(
                            `incidents.escalationBadge.${selectedIncident.escalationTarget}` as any,
                          )
                        : t("incidents.form.escalationNone"),
                    },
                    {
                      k: "LINKS",
                      v: (
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 10,
                          }}
                        >
                          {selectedIncident.relatedOrderId ? (
                            <Link
                              href={`/dispatch?orderId=${encodeURIComponent(selectedIncident.relatedOrderId)}`}
                              style={inlineLinkStyle(theme)}
                            >
                              {getOpsLabel(locale, "order")}
                            </Link>
                          ) : null}
                          {selectedIncident.relatedComplaintCaseNo ? (
                            <Link
                              href={`/complaints?caseNo=${encodeURIComponent(selectedIncident.relatedComplaintCaseNo)}`}
                              style={inlineLinkStyle(theme)}
                            >
                              {getOpsLabel(locale, "complaint")}
                            </Link>
                          ) : null}
                          {selectedIncident.relatedOrderId ||
                          selectedIncident.relatedComplaintCaseNo ? null : (
                            <span>
                              {getOpsLabel(locale, "incidentsNoLinkedEntities")}
                            </span>
                          )}
                        </div>
                      ),
                    },
                  ]}
                />

                {showRecoveryForm ? (
                  <div style={{ marginTop: 14 }}>
                    <ServiceRecoveryForm
                      onSubmit={async (command) => {
                        try {
                          const client = getOpsClient();
                          await client.recordServiceRecoveryAction(
                            selectedIncident.incidentId,
                            command,
                          );
                          await loadTimeline(selectedIncident.incidentId);
                          await loadRecords();
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : t("common.unknown"),
                          );
                        }
                      }}
                      onCancel={() => setShowRecoveryForm(false)}
                    />
                  </div>
                ) : null}

                <div
                  style={{
                    marginTop: 14,
                    display: "grid",
                    gap: 10,
                  }}
                >
                  {recoveryActions.length > 0 ? (
                    recoveryActions.map((action) => (
                      <div
                        key={action.actionId}
                        style={timelineItemStyle(theme)}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                            flexWrap: "wrap",
                          }}
                        >
                          <strong style={{ fontSize: 12.5 }}>
                            {t(
                              `incidents.serviceRecovery.${action.actionType}` as any,
                            )}
                          </strong>
                          <span
                            style={{
                              fontSize: 10.5,
                              color: theme.textDim,
                              fontFamily: theme.monoFamily,
                            }}
                          >
                            {formatDateTime(action.createdAt)}
                          </span>
                        </div>
                        <div style={{ color: theme.text, lineHeight: 1.45 }}>
                          {action.note}
                        </div>
                        <div style={{ fontSize: 11, color: theme.textMuted }}>
                          {action.actor}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={emptyStateStyle(theme)}>
                      {t("incidents.serviceRecovery.empty")}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={emptyStateStyle(theme)}>
                {t("incidents.selectIncident")}
              </div>
            )}
          </Card>
        </div>

        <Link href="/dashboard" style={backLinkStyle(theme)}>
          <span style={{ fontWeight: 600 }}>{t("common.backToDashboard")}</span>
          <span style={{ fontSize: 11.5, color: theme.textMuted }}>
            {t("common.backToDashboardSub")}
          </span>
        </Link>
      </div>
    </Shell>
  );
}

function ServiceRecoveryForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (command: RecordServiceRecoveryActionCommand) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [pending, startTransition] = useTransition();
  const [actionType, setActionType] = useState<string>("passenger_recontact");
  const [note, setNote] = useState("");
  const [actor, setActor] = useState("ops-user-001");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(() => {
      void onSubmit({
        actionType:
          actionType as RecordServiceRecoveryActionCommand["actionType"],
        note: note.trim(),
        actor: actor.trim() || "ops-user-001",
      });
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        <Field
          theme={theme}
          label={t("incidents.serviceRecovery.type")}
          required
        >
          <select
            style={controlStyle(theme)}
            value={actionType}
            onChange={(event) => setActionType(event.target.value)}
          >
            {SERVICE_RECOVERY_TYPES.map((value) => (
              <option key={value} value={value}>
                {t(`incidents.serviceRecovery.${value}` as any)}
              </option>
            ))}
          </select>
        </Field>

        <Field
          theme={theme}
          label={t("incidents.serviceRecovery.actor")}
          required
        >
          <input
            style={controlStyle(theme)}
            value={actor}
            onChange={(event) => setActor(event.target.value)}
            required
          />
        </Field>

        <div style={{ gridColumn: "1 / -1" }}>
          <Field
            theme={theme}
            label={t("incidents.serviceRecovery.note")}
            required
          >
            <textarea
              style={textAreaStyle(theme)}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              required
            />
          </Field>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          type="submit"
          disabled={pending}
          style={primaryButtonStyle(theme)}
        >
          {t("incidents.serviceRecovery.submit")}
        </button>
        <Btn theme={theme} onClick={onCancel}>
          {t("common.cancel")}
        </Btn>
      </div>
    </form>
  );
}

function IncidentForm({
  editingRecord,
  initialValues,
  onCancel,
  onSubmit,
}: {
  editingRecord: IncidentRecord | undefined;
  initialValues?: IncidentFormInitialValues;
  onCancel: () => void;
  onSubmit: (
    command: CreateIncidentCommand | UpdateIncidentCommand,
  ) => Promise<void>;
}) {
  const { t, locale } = useTranslation();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(
    editingRecord?.title ?? initialValues?.title ?? "",
  );
  const [description, setDescription] = useState(
    editingRecord?.description ?? initialValues?.description ?? "",
  );
  const [category, setCategory] = useState<IncidentCategory>(
    editingRecord?.category ?? initialValues?.category ?? "operational",
  );
  const [severity, setSeverity] = useState<IncidentSeverity>(
    editingRecord?.severity ?? initialValues?.severity ?? "medium",
  );
  const [relatedOrderId, setRelatedOrderId] = useState(
    editingRecord?.relatedOrderId ?? initialValues?.relatedOrderId ?? "",
  );
  const [relatedVehicleId, setRelatedVehicleId] = useState(
    editingRecord?.relatedVehicleId ?? initialValues?.relatedVehicleId ?? "",
  );
  const [relatedDriverId, setRelatedDriverId] = useState(
    editingRecord?.relatedDriverId ?? initialValues?.relatedDriverId ?? "",
  );
  const [reportedBy, setReportedBy] = useState(
    editingRecord?.reportedBy ?? initialValues?.reportedBy ?? "ops-user-001",
  );
  const [occurredAt, setOccurredAt] = useState(
    editingRecord?.occurredAt
      ? new Date(editingRecord.occurredAt).toISOString().slice(0, 16)
      : (initialValues?.occurredAt ?? ""),
  );
  const [location, setLocation] = useState(
    editingRecord?.location ?? initialValues?.location ?? "",
  );
  const [status, setStatus] = useState<IncidentStatus>(
    editingRecord?.status ?? "open",
  );
  const [assignedTo, setAssignedTo] = useState(editingRecord?.assignedTo ?? "");
  const [resolutionNote, setResolutionNote] = useState(
    editingRecord?.resolutionNote ?? "",
  );
  const [escalationTarget, setEscalationTarget] = useState<
    IncidentEscalationTarget | ""
  >(editingRecord?.escalationTarget ?? "");

  const isEditing = Boolean(editingRecord);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(() => {
      if (isEditing) {
        const command: UpdateIncidentCommand = {
          status,
          severity,
          ...(assignedTo.trim() ? { assignedTo: assignedTo.trim() } : {}),
          ...(resolutionNote.trim()
            ? { resolutionNote: resolutionNote.trim() }
            : {}),
          escalationTarget: escalationTarget || null,
        };
        void onSubmit(command);
        return;
      }

      const command: CreateIncidentCommand = {
        title: title.trim(),
        description: description.trim(),
        category,
        severity,
        reportedBy: reportedBy.trim() || "ops-user-001",
        ...(relatedOrderId.trim()
          ? { relatedOrderId: relatedOrderId.trim() }
          : {}),
        ...(relatedVehicleId.trim()
          ? { relatedVehicleId: relatedVehicleId.trim() }
          : {}),
        ...(relatedDriverId.trim()
          ? { relatedDriverId: relatedDriverId.trim() }
          : {}),
        ...(occurredAt
          ? { occurredAt: new Date(occurredAt).toISOString() }
          : {}),
        ...(location.trim() ? { location: location.trim() } : {}),
      };
      void onSubmit(command);
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      {!isEditing ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          <Field theme={theme} label={t("incidents.form.title")} required>
            <input
              style={controlStyle(theme)}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </Field>
          <Field theme={theme} label={t("incidents.form.reportedBy")} required>
            <input
              style={controlStyle(theme)}
              value={reportedBy}
              onChange={(event) => setReportedBy(event.target.value)}
              required
            />
          </Field>
          <Field theme={theme} label={t("incidents.form.category")}>
            <select
              style={controlStyle(theme)}
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as IncidentCategory)
              }
            >
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {formatOpsCodeLabel(locale, value)}
                </option>
              ))}
            </select>
          </Field>
          <Field theme={theme} label={t("incidents.form.severity")}>
            <select
              style={controlStyle(theme)}
              value={severity}
              onChange={(event) =>
                setSeverity(event.target.value as IncidentSeverity)
              }
            >
              {SEVERITIES.map((value) => (
                <option key={value} value={value}>
                  {formatOpsCodeLabel(locale, value)}
                </option>
              ))}
            </select>
          </Field>
          <Field theme={theme} label={t("incidents.form.relatedOrder")}>
            <input
              style={controlStyle(theme, true)}
              value={relatedOrderId}
              onChange={(event) => setRelatedOrderId(event.target.value)}
            />
          </Field>
          <Field theme={theme} label={t("incidents.form.relatedVehicle")}>
            <input
              style={controlStyle(theme, true)}
              value={relatedVehicleId}
              onChange={(event) => setRelatedVehicleId(event.target.value)}
            />
          </Field>
          <Field theme={theme} label={t("incidents.form.relatedDriver")}>
            <input
              style={controlStyle(theme, true)}
              value={relatedDriverId}
              onChange={(event) => setRelatedDriverId(event.target.value)}
            />
          </Field>
          <Field theme={theme} label={t("incidents.form.occurredAt")}>
            <input
              type="datetime-local"
              style={controlStyle(theme, true)}
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
            />
          </Field>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field theme={theme} label={t("incidents.form.location")}>
              <input
                style={controlStyle(theme)}
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
            </Field>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field
              theme={theme}
              label={t("incidents.form.description")}
              required
            >
              <textarea
                style={textAreaStyle(theme)}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                required
              />
            </Field>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          <Field theme={theme} label={t("incidents.form.status")}>
            <select
              style={controlStyle(theme)}
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as IncidentStatus)
              }
            >
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {formatOpsCodeLabel(locale, value)}
                </option>
              ))}
            </select>
          </Field>
          <Field theme={theme} label={t("incidents.form.severity")}>
            <select
              style={controlStyle(theme)}
              value={severity}
              onChange={(event) =>
                setSeverity(event.target.value as IncidentSeverity)
              }
            >
              {SEVERITIES.map((value) => (
                <option key={value} value={value}>
                  {formatOpsCodeLabel(locale, value)}
                </option>
              ))}
            </select>
          </Field>
          <Field theme={theme} label={t("incidents.form.assignedTo")}>
            <input
              style={controlStyle(theme)}
              value={assignedTo}
              onChange={(event) => setAssignedTo(event.target.value)}
            />
          </Field>
          <Field theme={theme} label={t("incidents.form.escalationTarget")}>
            <select
              style={controlStyle(theme)}
              value={escalationTarget}
              onChange={(event) =>
                setEscalationTarget(
                  event.target.value as IncidentEscalationTarget | "",
                )
              }
            >
              <option value="">{t("incidents.form.escalationNone")}</option>
              {ESCALATION_TARGETS.map((value) => (
                <option key={value} value={value}>
                  {t(`incidents.escalationBadge.${value}` as any)}
                </option>
              ))}
            </select>
          </Field>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field theme={theme} label={t("incidents.form.resolutionNote")}>
              <textarea
                style={textAreaStyle(theme)}
                value={resolutionNote}
                onChange={(event) => setResolutionNote(event.target.value)}
                rows={4}
              />
            </Field>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          type="submit"
          disabled={pending}
          style={primaryButtonStyle(theme)}
        >
          {pending
            ? t("incidents.form.saving")
            : isEditing
              ? t("incidents.form.saveChanges")
              : t("incidents.form.createRecord")}
        </button>
        <Btn theme={theme} onClick={onCancel}>
          {t("common.cancel")}
        </Btn>
      </div>
    </form>
  );
}
