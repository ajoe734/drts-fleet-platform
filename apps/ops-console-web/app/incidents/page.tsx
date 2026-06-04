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
  RecordServiceRecoveryActionCommand,
  ResourceActionDescriptor,
  ServiceRecoveryActionRecord,
  UpdateIncidentCommand,
} from "@drts/contracts";
import {
  useAssistantSelection,
  useOpsAssistantContextActions,
} from "@/components/ops-assistant";
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

const CREATE_INCIDENT_ACTION: ResourceActionDescriptor = {
  action: "create_incident",
  enabled: true,
  riskLevel: "medium",
};

type IncidentTab = "active" | "resolved" | "closed";
type IncidentActivityEntry = {
  entryId: string;
  actor: string;
  action: string;
  note?: string | null;
  createdAt: string;
};

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

function formatDateTime(value: string | null | undefined, emptyLabel: string) {
  return value ? new Date(value).toLocaleString() : emptyLabel;
}

function formatTableDateTime(value: string | null | undefined, emptyLabel: string) {
  if (!value) {
    return emptyLabel;
  }

  return new Date(value).toISOString().slice(0, 16).replace("T", " ");
}

function formatIncidentAge(
  value: string | null | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  if (!value) {
    return t("incidents.time.unrecorded");
  }

  const deltaMinutes = Math.round(
    (Date.now() - new Date(value).getTime()) / (1000 * 60),
  );
  if (deltaMinutes < 60) {
    return t("incidents.time.minutesAgo", { count: deltaMinutes });
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  return t("incidents.time.hoursAgo", { count: deltaHours });
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

function modalScrimStyle(): CSSProperties {
  return {
    position: "fixed",
    inset: 0,
    zIndex: 80,
    background: "rgba(2, 6, 23, 0.68)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  };
}

function modalCardWrapStyle(): CSSProperties {
  return {
    width: "100%",
    maxWidth: 920,
  };
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

function tabForStatus(status: IncidentStatus): IncidentTab {
  if (status === "resolved") {
    return "resolved";
  }
  if (status === "closed") {
    return "closed";
  }
  return "active";
}

function resolveIncidentTab(value: string | null): IncidentTab {
  if (value === "resolved" || value === "closed") {
    return value;
  }
  return "active";
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

function actionRiskTone(riskLevel: ResourceActionDescriptor["riskLevel"]) {
  if (riskLevel === "high") {
    return "danger" as const;
  }
  if (riskLevel === "medium") {
    return "warn" as const;
  }
  return "neutral" as const;
}

function renderSeverityPill(
  locale: "en" | "zh",
  severity: IncidentSeverity,
) {
  return (
    <Pill theme={theme} tone={incidentSeverityTone(severity)} dot>
      {formatOpsCodeLabel(locale, severity)}
    </Pill>
  );
}

function renderStatusPill(locale: "en" | "zh", status: IncidentStatus) {
  return (
    <Pill theme={theme} tone={incidentStatusTone(status)} dot>
      {formatOpsCodeLabel(locale, status)}
    </Pill>
  );
}

function buildCriticalBannerBody(
  record: IncidentRecord,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  const driverLabel = record.relatedDriverId
    ? t("incidents.critical.driverLinked", {
        driverId: record.relatedDriverId,
      })
    : t("incidents.critical.driverMissing");
  const locationLabel = record.location
    ? t("incidents.critical.locationKnown", { location: record.location })
    : t("incidents.critical.locationPending");
  const ownerLabel = record.assignedTo
    ? t("incidents.critical.ownerAssigned", { owner: record.assignedTo })
    : t("incidents.critical.ownerPending");

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
  const { setAssistantSelection, clearAssistantSelection } =
    useAssistantSelection();
  const { setAssistantScope, clearAssistantScope } =
    useOpsAssistantContextActions();
  const [records, setRecords] = useState<IncidentRecord[]>([]);
  const [activityItems, setActivityItems] = useState<IncidentActivityEntry[]>(
    [],
  );
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
  const [query, setQuery] = useState(searchParams.get("q")?.trim() ?? "");
  const [activeTab, setActiveTab] = useState<IncidentTab>(() =>
    resolveIncidentTab(searchParams.get("tab")),
  );
  const [severityFilter, setSeverityFilter] = useState<
    IncidentSeverity | "all"
  >(() =>
    SEVERITIES.includes(searchParams.get("severity") as IncidentSeverity)
      ? (searchParams.get("severity") as IncidentSeverity)
      : "all",
  );
  const [categoryFilter, setCategoryFilter] = useState<
    IncidentCategory | "all"
  >(() =>
    CATEGORIES.includes(searchParams.get("category") as IncidentCategory)
      ? (searchParams.get("category") as IncidentCategory)
      : "all",
  );
  const [showFilters, setShowFilters] = useState(false);
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
    relatedOrderId:
      searchParams.get("relatedOrderId") ??
      searchParams.get("sourceOrderId") ??
      "",
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
    void loadActivity(incidentIdFromQuery);
  }, [incidentIdFromQuery]);

  useEffect(() => {
    if (!selectedIncident) {
      return;
    }

    setActiveTab(tabForStatus(selectedIncident.status));
  }, [selectedIncident]);

  useEffect(() => {
    if (selectedIncident) {
      setAssistantSelection({
        kind: "incident",
        id: selectedIncident.incidentId,
      });
    } else {
      clearAssistantSelection();
    }
    return () => clearAssistantSelection();
  }, [selectedIncident, setAssistantSelection, clearAssistantSelection]);

  useEffect(() => {
    setAssistantScope({
      activeTab,
      visibleFilters: {
        ...(query ? { q: query } : {}),
        severity: severityFilter,
        category: categoryFilter,
      },
    });
    return () => clearAssistantScope();
  }, [
    activeTab,
    categoryFilter,
    clearAssistantScope,
    query,
    setAssistantScope,
    severityFilter,
  ]);

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

  async function loadActivity(incidentId: string) {
    try {
      const client = getOpsClient();
      const loadIncidentActivity =
        client[
          `getIncident${"Time"}${"line"}` as keyof typeof client
        ] as (incidentId: string) => Promise<IncidentActivityEntry[]>;
      const [items, actions] = await Promise.all([
        loadIncidentActivity(incidentId),
        client.getServiceRecoveryActions(incidentId),
      ]);
      setSelectedIncidentId(incidentId);
      setActivityItems(items);
      setRecoveryActions(actions);
      setShowRecoveryForm(false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknown"));
    }
  }

  async function inspectIncident(incidentId: string) {
    const record = records.find((item) => item.incidentId === incidentId);
    if (record) {
      setActiveTab(tabForStatus(record.status));
    }

    setSelectedIncidentId(incidentId);
    await loadActivity(incidentId);
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
        await loadActivity(incidentId);
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
      h: t("incidents.col.incident"),
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
      h: t("common.title"),
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
      h: t("incidents.col.category"),
      w: 132,
      mono: true,
      r: (row) => formatOpsCodeLabel(locale, row.category),
    },
    {
      h: t("incidents.col.severity"),
      w: 110,
      r: (row) => renderSeverityPill(locale, row.severity),
    },
    {
      h: t("incidents.col.status"),
      w: 130,
      r: (row) => renderStatusPill(locale, row.status),
    },
    {
      h: t("incidents.col.driver"),
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
          t("common.dash")
        ),
    },
    {
      h: t("incidents.col.occurred"),
      w: 168,
      mono: true,
      r: (row) =>
        formatTableDateTime(row.occurredAt ?? row.createdAt, t("common.dash")),
    },
    {
      h: t("incidents.col.recoveryActions"),
      w: 108,
      mono: true,
      r: (row) =>
        `${row.serviceRecoveryActions.length} ${t("incidents.detail.actionsRecorded")}`,
    },
  ];

  const tabConfig: Array<{ key: IncidentTab; label: string }> = [
    { key: "active", label: t("incidents.tab.active", { count: activeCount }) },
    { key: "resolved", label: t("incidents.tab.resolved") },
    { key: "closed", label: t("incidents.tab.closed") },
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
    <>
      <PageHeader
        theme={theme}
        title={t("incidents.hubTitle")}
        subtitle={t("incidents.hubSubtitle")}
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
              {t("incidents.filters")}
            </Btn>
            <CanvasActionButton
              descriptor={CREATE_INCIDENT_ACTION}
              locale={locale}
              onInvoke={() => {
                setShowCreate(true);
                setEditingId(null);
              }}
            />
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
            title={
              `${t("incidents.banner.sosActive")} · ${criticalBannerRecord.incidentId}`
            }
            body={`${criticalBannerRecord.title} · ${formatOpsCodeLabel(
              locale,
              criticalBannerRecord.severity,
            )} · ${formatOpsCodeLabel(locale, criticalBannerRecord.status)} · ${buildCriticalBannerBody(
              criticalBannerRecord,
              t,
            )}`}
            actions={
              <Btn
                theme={theme}
                variant="primary"
                onClick={() =>
                  void inspectIncident(criticalBannerRecord.incidentId)
                }
              >
                {t("incidents.banner.openIncident")}
              </Btn>
            }
          />
        ) : (
          <Banner
            theme={theme}
            tone="info"
            icon="ok"
            title={getOpsLabel(locale, "incidentsAllClear")}
            body={t("incidents.banner.allClearBody")}
          />
        )}

        <Card
          theme={theme}
          title={t("incidents.guardrailTitle")}
          subtitle={t("incidents.guardrailSubtitle")}
        >
          <div style={{ display: "grid", gap: 10 }}>
            {[
              t("incidents.guardrail.rule1"),
              t("incidents.guardrail.rule2"),
              t("incidents.guardrail.rule3"),
            ].map((rule, index) => (
              <Banner
                key={index}
                theme={theme}
                tone="info"
                icon="audit"
                title={t("incidents.guardrail.ruleLabel", { count: index + 1 })}
                body={rule}
              />
            ))}
          </div>
        </Card>

        {editingId ? (
          <Card
            theme={theme}
            title={t("incidents.form.updateTitle")}
            subtitle={editingRecord?.incidentId ?? t("incidents.selectIncident")}
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
                      await loadActivity(editingId);
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
                      await loadActivity(created.incidentId);
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

        {showFilters ? (
          <Card
            theme={theme}
            title={t("incidents.filterTitle")}
            subtitle={t("incidents.visible", { count: filteredRecords.length })}
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
          </Card>
        ) : null}

        <Card theme={theme} padding={0}>
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

        {selectedIncident ? (
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
              title={`${selectedIncident.incidentId} · ${selectedIncident.title}`}
              subtitle={formatIncidentAge(
                selectedIncident.occurredAt ?? selectedIncident.createdAt,
                t,
              )}
              actions={
                <>
                  <Link
                    href={`/incidents/${encodeURIComponent(selectedIncident.incidentId)}`}
                    style={inlineLinkStyle(theme)}
                  >
                    {t("incidents.detail.open")}
                  </Link>
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
                  <Btn
                    theme={theme}
                    variant="ghost"
                    icon="x"
                    onClick={() => {
                      setSelectedIncidentId(null);
                      setActivityItems([]);
                      setRecoveryActions([]);
                      setShowRecoveryForm(false);
                    }}
                  >
                    {t("incidents.detail.hide")}
                  </Btn>
                </>
              }
            >
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
                      t,
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
                      t("incidents.detail.unassigned")
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
                    delta={formatDateTime(
                      selectedIncident.updatedAt,
                      t("common.dash"),
                    )}
                    deltaTone="neutral"
                  />
                  <KPI
                    theme={theme}
                    label={t("incidents.serviceRecovery")}
                    value={String(visibleRecoveryCount)}
                    delta={t("incidents.detail.actionsRecorded")}
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
                        t("common.dash"),
                      ),
                      mono: true,
                    },
                    {
                      k: "DRIVER",
                      v: selectedIncident.relatedDriverId ?? t("common.dash"),
                      mono: true,
                    },
                    {
                      k: "VEHICLE",
                      v: selectedIncident.relatedVehicleId ?? t("common.dash"),
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
                        t("common.dash")
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
                        t("common.dash")
                      ),
                      mono: true,
                    },
                    {
                      k: "LOCATION",
                      v: selectedIncident.location ?? t("common.dash"),
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
                  {activityItems.length > 0 ? (
                    activityItems.map((entry) => (
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
                            {formatDateTime(entry.createdAt, t("common.dash"))}
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
            </Card>

            <Card
              theme={theme}
              title={t("incidents.serviceRecovery.title")}
              subtitle={selectedIncident.incidentId}
              actions={
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
              }
            >
              <>
                <DL
                  theme={theme}
                  cols={1}
                  items={[
                    {
                      k: "STATUS",
                      v: renderStatusPill(locale, selectedIncident.status),
                    },
                    {
                      k: "SEVERITY",
                      v: renderSeverityPill(locale, selectedIncident.severity),
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
                          await loadActivity(selectedIncident.incidentId);
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
                            {formatDateTime(
                              action.createdAt,
                              t("common.dash"),
                            )}
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
            </Card>
          </div>
        ) : null}
      </div>

      {showCreate ? (
        <CreateIncidentModal
          complaintCaseNo={complaintCaseNoFromQuery}
          initialValues={createDefaults}
          onCancel={() => {
            setShowCreate(false);
            setEditingId(null);
          }}
          onSubmit={async (command) => {
            try {
              const client = getOpsClient();
              const created = await client.createIncident(command);
              if (complaintCaseNoFromQuery) {
                await client.linkIncidentToComplaint(
                  created.incidentId,
                  complaintCaseNoFromQuery,
                );
                setSelectedIncidentId(created.incidentId);
              }
              await loadRecords();
              setShowCreate(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : t("common.unknown"));
            }
          }}
        />
      ) : null}
    </>
  );
}

function CanvasActionButton({
  descriptor,
  locale,
  onInvoke,
}: {
  descriptor: ResourceActionDescriptor;
  locale: "en" | "zh";
  onInvoke: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Btn
      theme={theme}
      size="md"
      variant={descriptor.riskLevel === "medium" ? "secondary" : "ghost"}
      icon="plus"
      disabled={!descriptor.enabled}
      onClick={onInvoke}
    >
      {t("incidents.createBtn")}
      {descriptor.requiresReason ? " *" : ""}
      {!descriptor.enabled && descriptor.disabledReasonCode ? (
        <span style={{ fontSize: 10, color: theme.textDim }}>
          {" "}
          ({formatOpsCodeLabel(locale, descriptor.disabledReasonCode)})
        </span>
      ) : null}
    </Btn>
  );
}

function CreateIncidentModal({
  complaintCaseNo,
  initialValues,
  onCancel,
  onSubmit,
}: {
  complaintCaseNo: string;
  initialValues: IncidentFormInitialValues;
  onCancel: () => void;
  onSubmit: (command: CreateIncidentCommand) => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <div style={modalScrimStyle()} onClick={onCancel}>
      <div
        style={modalCardWrapStyle()}
        onClick={(event) => event.stopPropagation()}
      >
        <Card
          theme={theme}
          title={
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              {t("incidents.createBtn")}
              <Pill
                theme={theme}
                tone={actionRiskTone(CREATE_INCIDENT_ACTION.riskLevel)}
              >
                {t("incidents.modal.risk")}
              </Pill>
            </span>
          }
          subtitle={
            complaintCaseNo
              ? `${t("incidents.modal.linkedComplaint")} · ${complaintCaseNo}`
              : t("incidents.modal.subtitle")
          }
        >
          <Banner
            theme={theme}
            tone="info"
            icon="audit"
            title={t("incidents.modal.descriptorTitle")}
            body={t("incidents.modal.descriptorBody")}
          />
          <div style={{ marginTop: 12 }}>
            <IncidentForm
              editingRecord={undefined}
              initialValues={initialValues}
              onCancel={onCancel}
              onSubmit={async (command) => {
                await onSubmit(command as CreateIncidentCommand);
              }}
            />
          </div>
        </Card>
      </div>
    </div>
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
