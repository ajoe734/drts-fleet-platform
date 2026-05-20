"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type {
  ComplaintCaseRecord,
  ComplaintCaseStatus,
  ComplaintCategory,
  ComplaintExportViewRecord,
  ComplaintResolutionCode,
  ComplaintTimelineEntry,
  CreateComplaintCaseCommand,
  EscalateComplaintToIncidentCommand,
} from "@drts/contracts";
import {
  COMPLAINT_CASE_STATUSES,
  COMPLAINT_CATEGORIES,
  COMPLAINT_CATEGORY_VALID_RESOLUTIONS,
} from "@drts/contracts";
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
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";
import type { Locale } from "@/lib/translations";
import { t as translate } from "@/lib/translations";

const STATUS_OPTIONS: ComplaintCaseStatus[] = [...COMPLAINT_CASE_STATUSES];
const CATEGORY_OPTIONS: ComplaintCategory[] = [...COMPLAINT_CATEGORIES];
const CURRENT_OPERATOR_ID = "AGENT-OPS-002";
const ESCALATION_SEVERITY_OPTIONS = [
  "low",
  "medium",
  "high",
  "critical",
] as const;

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

const shellFrameStyle: CSSProperties = {
  minHeight: "calc(100vh - 48px)",
  borderRadius: 24,
  overflow: "hidden",
  border: `1px solid ${theme.border}`,
  boxShadow: "0 20px 44px rgba(2, 6, 23, 0.42)",
};

const pageStackStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const workspaceGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)",
  gap: 16,
  alignItems: "start",
};

const actionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 16,
};

const detailStackStyle: CSSProperties = {
  display: "grid",
  gap: 16,
};

const pillRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const timelineListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const emptyStateStyle: CSSProperties = {
  padding: "14px 16px",
  borderRadius: 10,
  border: `1px dashed ${theme.border}`,
  background: theme.surfaceLo,
  color: theme.textMuted,
  fontSize: 12.5,
  lineHeight: 1.5,
};

function copy(locale: Locale, en: string, zh: string) {
  return locale === "en" ? en : zh;
}

function formatDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "-";
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

function formatDateTimeWithSeconds(
  locale: Locale,
  value: string | null | undefined,
) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

function isComplaintActive(status: ComplaintCaseStatus) {
  return ["new", "assigned", "under_investigation", "reopened"].includes(
    status,
  );
}

function compareComplaintPriority(
  a: ComplaintCaseRecord,
  b: ComplaintCaseRecord,
) {
  if (a.slaBreach !== b.slaBreach) {
    return a.slaBreach ? -1 : 1;
  }

  if (a.relatedIncidentId !== b.relatedIncidentId) {
    return a.relatedIncidentId ? 1 : -1;
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

function formatRelativeSla(value: string, locale: Locale) {
  const deltaMinutes = Math.round(
    (new Date(value).getTime() - Date.now()) / (1000 * 60),
  );

  if (deltaMinutes >= 0) {
    return copy(locale, `due in ${deltaMinutes}m`, `還有 ${deltaMinutes} 分鐘`);
  }

  return copy(
    locale,
    `breached by ${Math.abs(deltaMinutes)}m`,
    `已逾期 ${Math.abs(deltaMinutes)} 分鐘`,
  );
}

function resolveSelectedComplaintCaseNo(
  records: ComplaintCaseRecord[],
  preferredCaseNo: string | null,
) {
  if (
    preferredCaseNo &&
    records.some((record) => record.caseNo === preferredCaseNo)
  ) {
    return preferredCaseNo;
  }

  return records[0]?.caseNo ?? null;
}

function getSeverityTone(record: ComplaintCaseRecord): CanvasTone {
  if (record.slaBreach) {
    return "danger";
  }
  if (record.severity === "high") {
    return "warn";
  }
  return "neutral";
}

function getStatusTone(record: ComplaintCaseRecord): CanvasTone {
  if (record.relatedIncidentId) {
    return "danger";
  }
  if (record.status === "closed" || record.status === "resolved") {
    return "success";
  }
  if (record.slaBreach) {
    return "danger";
  }
  if (
    record.status === "assigned" ||
    record.status === "under_investigation" ||
    record.status === "reopened"
  ) {
    return "info";
  }
  return "neutral";
}

function formatAverageHandleValue(records: ComplaintCaseRecord[]) {
  const handledRecords = records.filter(
    (record) => record.status === "resolved" || record.status === "closed",
  );

  if (handledRecords.length === 0) {
    return "0h";
  }

  const averageMinutes = Math.round(
    handledRecords.reduce((total, record) => {
      return (
        total +
        Math.max(
          0,
          (new Date(record.updatedAt).getTime() -
            new Date(record.createdAt).getTime()) /
            (1000 * 60),
        )
      );
    }, 0) / handledRecords.length,
  );

  if (averageMinutes >= 60) {
    return `${Math.round(averageMinutes / 60)}h`;
  }

  return `${averageMinutes}m`;
}

function formatReopenRate(records: ComplaintCaseRecord[]) {
  if (records.length === 0) {
    return "0%";
  }

  const reopened = records.filter((record) => record.reopenCount > 0).length;
  return `${Math.round((reopened / records.length) * 100)}%`;
}

function controlStyle(
  canvasTheme: CanvasTheme,
  options?: { mono?: boolean; minHeight?: number },
): CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 7,
    border: `1px solid ${canvasTheme.border}`,
    background: canvasTheme.bgRaised,
    color: canvasTheme.text,
    padding: "8px 10px",
    fontSize: 12.5,
    lineHeight: 1.4,
    fontFamily: options?.mono ? canvasTheme.monoFamily : canvasTheme.fontFamily,
    minHeight: options?.minHeight,
  };
}

function actionLinkStyle(
  canvasTheme: CanvasTheme,
  variant: "primary" | "secondary" = "secondary",
): CSSProperties {
  if (variant === "primary") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      height: 28,
      padding: "5px 10px",
      borderRadius: 7,
      background: canvasTheme.accent,
      color: "#ffffff",
      border: `1px solid ${canvasTheme.accent}`,
      fontSize: 12,
      fontWeight: 500,
      lineHeight: 1,
      textDecoration: "none",
    };
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 28,
    padding: "5px 10px",
    borderRadius: 7,
    background: canvasTheme.surface,
    color: canvasTheme.text,
    border: `1px solid ${canvasTheme.border}`,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1,
    textDecoration: "none",
  };
}

function caseLinkStyle(canvasTheme: CanvasTheme): CSSProperties {
  return {
    background: "transparent",
    border: "none",
    color: canvasTheme.accent,
    padding: 0,
    font: "inherit",
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
  };
}

function buildShellNav(locale: Locale): CanvasShellNavItem[] {
  return [
    {
      divider: locale === "en" ? "Workspaces" : "工作面",
    },
    {
      key: "dashboard",
      href: "/dashboard",
      icon: "dashboard",
      label: translate("nav.dashboard", locale),
    },
    {
      divider: locale === "en" ? "Live Ops" : "即時派遣",
    },
    {
      key: "dispatch",
      href: "/dispatch",
      icon: "dispatch",
      label: translate("nav.dispatch", locale),
      matchPaths: ["/dispatch"],
    },
    {
      key: "callcenter",
      href: "/callcenter",
      icon: "callcenter",
      label: translate("nav.callcenter", locale),
    },
    {
      divider: locale === "en" ? "Casework" : "案件處理",
    },
    {
      key: "complaints",
      href: "/complaints",
      icon: "complaints",
      label: translate("nav.complaints", locale),
    },
    {
      key: "incidents",
      href: "/incidents",
      icon: "incidents",
      label: translate("nav.incidents", locale),
      matchPaths: ["/incidents"],
    },
    {
      divider: locale === "en" ? "Monitoring" : "營運監控",
    },
    {
      key: "reports",
      href: "/reports",
      icon: "reports",
      label: translate("nav.reports", locale),
    },
    {
      key: "revenue",
      href: "/revenue",
      icon: "revenue",
      label: translate("nav.revenue", locale),
    },
    {
      key: "attendance",
      href: "/attendance",
      icon: "attendance",
      label: translate("nav.attendance", locale),
    },
    {
      divider: locale === "en" ? "Registry" : "主資料",
    },
    {
      key: "drivers",
      href: "/drivers",
      icon: "fleet",
      label: translate("nav.drivers", locale),
    },
    {
      key: "vehicles",
      href: "/vehicles",
      icon: "vehicles",
      label: translate("nav.vehicles", locale),
    },
    {
      key: "contracts",
      href: "/contracts",
      icon: "contracts",
      label: translate("nav.contracts", locale),
    },
    {
      key: "feature-flags",
      href: "/feature-flags",
      icon: "flags",
      label: translate("nav.featureFlags", locale),
    },
  ];
}

function buildIncidentHandoffHref(record: ComplaintCaseRecord) {
  const params = new URLSearchParams();
  params.set("create", "1");
  params.set("complaintCaseNo", record.caseNo);
  params.set("title", record.caseNo);
  params.set("description", record.description);
  params.set("severity", record.slaBreach ? "high" : "medium");
  if (record.relatedOrderId) {
    params.set("relatedOrderId", record.relatedOrderId);
  }
  return `/incidents?${params.toString()}`;
}

type ComplaintTableRow = ComplaintCaseRecord &
  Record<string, unknown> & {
    _selected?: boolean;
  };

export default function ComplaintsPage() {
  const { t, locale } = useTranslation();
  const searchParams = useSearchParams();
  const resolveErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : t("common.unknown");
  const [records, setRecords] = useState<ComplaintCaseRecord[]>([]);
  const [timeline, setTimeline] = useState<ComplaintTimelineEntry[]>([]);
  const [exportView, setExportView] =
    useState<ComplaintExportViewRecord | null>(null);
  const [selectedCaseNo, setSelectedCaseNo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ComplaintCaseStatus | "all">(
    "all",
  );
  const [categoryFilter, setCategoryFilter] = useState<
    ComplaintCategory | "all"
  >("all");
  const [createForm, setCreateForm] = useState(INITIAL_CREATE_FORM);
  const [assigneeId, setAssigneeId] = useState(CURRENT_OPERATOR_ID);
  const [assignmentNote, setAssignmentNote] = useState("");
  const [noteText, setNoteText] = useState("");
  const [resolutionCode, setResolutionCode] =
    useState<ComplaintResolutionCode>("resolved_other");
  const [closingNote, setClosingNote] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [escalateTitle, setEscalateTitle] = useState("");
  const [escalateSeverity, setEscalateSeverity] =
    useState<EscalateComplaintToIncidentCommand["severity"]>("medium");
  const [escalateReason, setEscalateReason] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const caseNoFromQuery = searchParams.get("caseNo");

  const selectedRecord = useMemo(
    () => records.find((record) => record.caseNo === selectedCaseNo) ?? null,
    [records, selectedCaseNo],
  );

  const validResolutionCodes = useMemo(
    () =>
      selectedRecord
        ? (COMPLAINT_CATEGORY_VALID_RESOLUTIONS[selectedRecord.category] ?? [])
        : [],
    [selectedRecord],
  );

  useEffect(() => {
    if (!selectedRecord) {
      return;
    }
    setResolutionCode((current) =>
      validResolutionCodes.includes(current)
        ? current
        : (validResolutionCodes[0] ?? "resolved_other"),
    );
  }, [selectedRecord, validResolutionCodes]);

  useEffect(() => {
    if (caseNoFromQuery) {
      setSelectedCaseNo(caseNoFromQuery);
      setShowWorkspace(true);
    }

    void loadRecords(caseNoFromQuery ?? undefined);
  }, [caseNoFromQuery]);

  useEffect(() => {
    if (!selectedCaseNo || !showWorkspace) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const client = getOpsClient();
        const [nextTimeline, nextExportView] = await Promise.all([
          client.getComplaintTimeline(selectedCaseNo),
          client.getComplaintExportView(selectedCaseNo),
        ]);
        if (cancelled) {
          return;
        }
        setTimeline(nextTimeline);
        setExportView(nextExportView);
      } catch (nextError) {
        if (!cancelled) {
          setError(resolveErrorMessage(nextError));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCaseNo, showWorkspace]);

  async function loadRecords(preferredCaseNo?: string) {
    setLoading(true);
    try {
      const nextRecords = await getOpsClient().listComplaints();
      setRecords(nextRecords);
      const nextSelected = resolveSelectedComplaintCaseNo(
        nextRecords,
        preferredCaseNo ?? caseNoFromQuery ?? selectedCaseNo,
      );
      setSelectedCaseNo(nextSelected);
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

  const filteredRecords = useMemo(
    () =>
      records
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
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(deferredQuery);
        })
        .sort(compareComplaintPriority),
    [categoryFilter, deferredQuery, records, statusFilter],
  );

  const activeCases = records.filter((record) =>
    isComplaintActive(record.status),
  ).length;
  const hotlineLinked = records.filter((record) => record.relatedCallId).length;
  const slaBreached = records.filter((record) => record.slaBreach).length;
  const readyForAudit = records.filter(
    (record) => record.status === "closed",
  ).length;
  const escalatedCases = records.filter((record) => record.relatedIncidentId);
  const reopenedCases = records.filter((record) => record.reopenCount > 0);
  const latestEscalatedCase = [...escalatedCases].sort(
    compareComplaintPriority,
  )[0];

  const complaintTabs = [
    copy(locale, "All", "全部"),
    copy(locale, "My queue", "我負責"),
    copy(locale, "SLA breach", "SLA breach"),
    copy(locale, "Escalated incidents", "已升級事故"),
  ];

  const unresolvedDelta =
    slaBreached > 0
      ? copy(
          locale,
          `${slaBreached} SLA breach`,
          `${slaBreached} 筆 SLA breach`,
        )
      : copy(locale, "stable", "穩定");
  const averageHandleValue = formatAverageHandleValue(records);
  const averageHandleDelta = copy(
    locale,
    `${readyForAudit} closed sample`,
    `樣本 ${readyForAudit} 筆`,
  );
  const escalatedSub = latestEscalatedCase?.relatedIncidentId
    ? `${latestEscalatedCase.caseNo} -> ${latestEscalatedCase.relatedIncidentId}`
    : copy(locale, "No linked incident", "尚無 incident 連結");
  const reopenDelta = reopenedCases.length
    ? copy(
        locale,
        `${reopenedCases.length} reopened`,
        `${reopenedCases.length} 筆曾重開`,
      )
    : copy(locale, "No reopen", "暫無重開");

  async function handleCreateComplaint() {
    await runAction("create-complaint", async () => {
      const created = await getOpsClient().createComplaint({
        ...createForm,
        relatedOrderId: createForm.relatedOrderId || null,
        relatedCallId: createForm.relatedCallId || null,
      });
      setCreateForm(INITIAL_CREATE_FORM);
      setShowCreate(false);
      setSelectedCaseNo(created.caseNo);
      setShowWorkspace(true);
      await loadRecords(created.caseNo);
    });
  }

  async function handleAssignCase() {
    if (!selectedRecord) {
      return;
    }

    await runAction("assign-case", async () => {
      await getOpsClient().assignComplaint(selectedRecord.caseNo, {
        assigneeId,
        note: assignmentNote,
      });
      setAssignmentNote("");
      await loadRecords(selectedRecord.caseNo);
    });
  }

  async function handleAddNote() {
    if (!selectedRecord) {
      return;
    }

    await runAction("add-note", async () => {
      await getOpsClient().addComplaintNote(selectedRecord.caseNo, {
        note: noteText,
      });
      setNoteText("");
      await loadRecords(selectedRecord.caseNo);
    });
  }

  async function handleResolveCase(closeCase: boolean) {
    if (!selectedRecord) {
      return;
    }

    await runAction(closeCase ? "close-case" : "resolve-case", async () => {
      if (closeCase) {
        await getOpsClient().closeComplaint(selectedRecord.caseNo, {
          resolutionCode,
          closingNote,
        });
      } else {
        await getOpsClient().resolveComplaint(selectedRecord.caseNo, {
          resolutionCode,
          closingNote,
        });
      }
      await loadRecords(selectedRecord.caseNo);
    });
  }

  async function handleReopenCase() {
    if (!selectedRecord) {
      return;
    }

    await runAction("reopen-case", async () => {
      await getOpsClient().reopenComplaint(selectedRecord.caseNo, {
        reason: reopenReason,
      });
      setReopenReason("");
      await loadRecords(selectedRecord.caseNo);
    });
  }

  async function handleEscalateCase() {
    if (!selectedRecord) {
      return;
    }

    await runAction("escalate-incident", async () => {
      await getOpsClient().escalateComplaintToIncident(selectedRecord.caseNo, {
        title: escalateTitle,
        severity: escalateSeverity,
        reason: escalateReason,
      });
      setEscalateTitle("");
      setEscalateReason("");
      setEscalateSeverity("medium");
      await loadRecords(selectedRecord.caseNo);
    });
  }

  async function handleMarkSlaBreach() {
    if (!selectedRecord) {
      return;
    }

    await runAction("sla-breach", async () => {
      await getOpsClient().markComplaintSlaBreach(selectedRecord.caseNo);
      await loadRecords(selectedRecord.caseNo);
    });
  }

  const tableRows: ComplaintTableRow[] = filteredRecords.map((record) => ({
    ...record,
    _selected: record.caseNo === selectedCaseNo,
  }));

  const tableColumns: CanvasTableColumn<ComplaintTableRow>[] = [
    {
      h: "CASE",
      w: 116,
      mono: true,
      r: (row) => (
        <button
          type="button"
          style={caseLinkStyle(theme)}
          onClick={() => {
            setSelectedCaseNo(row.caseNo);
            setShowWorkspace(true);
          }}
        >
          {row.caseNo}
        </button>
      ),
    },
    {
      h: "CATEGORY",
      w: 150,
      mono: true,
      r: (row) => formatOpsCodeLabel(locale, row.category),
    },
    {
      h: "SEV",
      w: 92,
      r: (row) => (
        <Pill theme={theme} tone={getSeverityTone(row)} dot>
          {formatOpsCodeLabel(locale, row.severity)}
        </Pill>
      ),
    },
    {
      h: "DESC",
      r: (row) => (
        <div
          style={{
            minWidth: 220,
            maxWidth: 360,
            whiteSpace: "normal",
            lineHeight: 1.4,
          }}
        >
          {row.description}
        </div>
      ),
    },
    {
      h: "ORDER",
      w: 128,
      mono: true,
      r: (row) => row.relatedOrderId ?? "-",
    },
    {
      h: "SLA",
      w: 136,
      r: (row) => (
        <Pill theme={theme} tone={row.slaBreach ? "danger" : "success"} dot>
          {row.slaBreach
            ? copy(locale, "breached", "違規")
            : formatRelativeSla(row.slaDueAt, locale)}
        </Pill>
      ),
    },
    {
      h: "OWNER",
      w: 112,
      mono: true,
      r: (row) => row.assigneeId ?? t("complaints.unassigned"),
    },
    {
      h: "STATUS",
      w: 170,
      r: (row) => (
        <Pill theme={theme} tone={getStatusTone(row)} dot>
          {formatOpsCodeLabel(locale, row.status)}
        </Pill>
      ),
    },
  ];

  const canCreate =
    createForm.description.trim().length > 0 && busyKey !== "create-complaint";
  const canAssign = assigneeId.trim().length > 0 && busyKey !== "assign-case";
  const canAddNote = noteText.trim().length > 0 && busyKey !== "add-note";
  const canResolve =
    validResolutionCodes.length > 0 && busyKey !== "resolve-case";
  const canClose = validResolutionCodes.length > 0 && busyKey !== "close-case";
  const canReopen = reopenReason.trim().length > 0 && busyKey !== "reopen-case";
  const canEscalate =
    escalateTitle.trim().length > 0 &&
    escalateReason.trim().length > 0 &&
    busyKey !== "escalate-incident";

  return (
    <Shell
      theme={theme}
      nav={buildShellNav(locale)}
      active="complaints"
      currentPath="/complaints"
      breadcrumb={[copy(locale, "Complaints", "客訴")]}
      searchPlaceholder={t("complaints.search")}
      style={shellFrameStyle}
    >
      <PageHeader
        theme={theme}
        title={t("complaints.title")}
        subtitle={t("complaints.subtitle")}
        tabs={complaintTabs}
        activeTab={complaintTabs[0]}
        actions={
          <>
            <Btn
              theme={theme}
              icon="filter"
              onClick={() => setShowFilters((current) => !current)}
            >
              {copy(locale, "Category", "類別")}
            </Btn>
            <Btn
              theme={theme}
              icon="export"
              onClick={() => {
                if (selectedRecord) {
                  setShowWorkspace(true);
                }
              }}
            >
              {copy(locale, "Export", "匯出")}
            </Btn>
            <Btn
              theme={theme}
              variant="primary"
              icon="plus"
              onClick={() => setShowCreate((current) => !current)}
            >
              {t("complaints.createComplaint")}
            </Btn>
          </>
        }
      />

      <div style={pageStackStyle}>
        {error ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={getOpsLabel(locale, "error")}
            body={error}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <KPI
            theme={theme}
            label={copy(locale, "Open complaints", "未結客訴")}
            value={activeCases}
            delta={unresolvedDelta}
            deltaTone={slaBreached > 0 ? "down" : "neutral"}
          />
          <KPI
            theme={theme}
            label={copy(locale, "Avg handling", "平均處理")}
            value={averageHandleValue}
            delta={averageHandleDelta}
            deltaTone={readyForAudit > 0 ? "up" : "neutral"}
          />
          <KPI
            theme={theme}
            label={copy(locale, "Escalated incidents", "升級事故")}
            value={escalatedCases.length}
            sub={escalatedSub}
          />
          <KPI
            theme={theme}
            label={copy(locale, "Reopen rate", "reopen 率")}
            value={formatReopenRate(records)}
            delta={reopenDelta}
            deltaTone={reopenedCases.length > 0 ? "down" : "neutral"}
          />
        </div>

        <Card theme={theme} padding={0}>
          {loading ? (
            <div style={{ padding: 16, color: theme.textMuted }}>
              {t("complaints.loading")}
            </div>
          ) : filteredRecords.length > 0 ? (
            <Table theme={theme} columns={tableColumns} rows={tableRows} />
          ) : (
            <div style={{ padding: 16 }}>
              <div style={emptyStateStyle}>{t("complaints.empty")}</div>
            </div>
          )}
        </Card>

        {showFilters ? (
          <Card
            theme={theme}
            title={copy(locale, "Registry filters", "案件篩選")}
            subtitle={copy(
              locale,
              "Filter the complaints table without leaving the OC complaints surface.",
              "在不離開客訴面板的前提下過濾 complaints table。",
            )}
          >
            <div style={filterGridStyle}>
              <Field theme={theme} label={t("common.search")}>
                <input
                  type="search"
                  style={controlStyle(theme)}
                  placeholder={t("complaints.search")}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </Field>
              <Field theme={theme} label={t("complaints.allStatuses")}>
                <select
                  style={controlStyle(theme)}
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(
                      event.target.value as ComplaintCaseStatus | "all",
                    )
                  }
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
                  style={controlStyle(theme)}
                  value={categoryFilter}
                  onChange={(event) =>
                    setCategoryFilter(
                      event.target.value as ComplaintCategory | "all",
                    )
                  }
                >
                  <option value="all">{t("complaints.allCategories")}</option>
                  {CATEGORY_OPTIONS.map((category) => (
                    <option key={category} value={category}>
                      {formatOpsCodeLabel(locale, category)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                theme={theme}
                label={copy(locale, "Dataset", "資料集")}
                hint={copy(locale, "Quick queue summary", "目前 table 摘要")}
              >
                <DL
                  theme={theme}
                  cols={2}
                  items={[
                    {
                      label: copy(locale, "Visible", "顯示中"),
                      value: `${filteredRecords.length}`,
                      mono: true,
                    },
                    {
                      label: copy(locale, "Hotline linked", "已連結熱線"),
                      value: `${hotlineLinked}`,
                      mono: true,
                    },
                  ]}
                />
              </Field>
            </div>
            <div style={actionRowStyle}>
              <Btn
                theme={theme}
                onClick={() => void loadRecords(selectedCaseNo ?? undefined)}
              >
                {t("common.refresh")}
              </Btn>
              <Btn
                theme={theme}
                variant="ghost"
                onClick={() => {
                  setQuery("");
                  setStatusFilter("all");
                  setCategoryFilter("all");
                }}
              >
                {copy(locale, "Reset", "重設")}
              </Btn>
            </div>
          </Card>
        ) : null}

        {showCreate ? (
          <Card
            theme={theme}
            title={t("complaints.createTitle")}
            subtitle={t("complaints.createNote")}
          >
            <div style={filterGridStyle}>
              <Field theme={theme} label={t("complaints.form.source")} required>
                <select
                  style={controlStyle(theme)}
                  value={createForm.caseSource}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      caseSource: event.target
                        .value as CreateComplaintCaseCommand["caseSource"],
                    }))
                  }
                >
                  <option value="ops">
                    {formatOpsCodeLabel(locale, "ops")}
                  </option>
                  <option value="phone">
                    {formatOpsCodeLabel(locale, "phone")}
                  </option>
                  <option value="web">
                    {formatOpsCodeLabel(locale, "web")}
                  </option>
                  <option value="app">
                    {formatOpsCodeLabel(locale, "app")}
                  </option>
                </select>
              </Field>
              <Field
                theme={theme}
                label={t("complaints.form.category")}
                required
              >
                <select
                  style={controlStyle(theme)}
                  value={createForm.category}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      category: event.target.value as ComplaintCategory,
                    }))
                  }
                >
                  {CATEGORY_OPTIONS.map((category) => (
                    <option key={category} value={category}>
                      {formatOpsCodeLabel(locale, category)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                theme={theme}
                label={t("complaints.form.severity")}
                required
              >
                <select
                  style={controlStyle(theme)}
                  value={createForm.severity}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      severity: event.target
                        .value as CreateComplaintCaseCommand["severity"],
                    }))
                  }
                >
                  <option value="normal">
                    {formatOpsCodeLabel(locale, "normal")}
                  </option>
                  <option value="high">
                    {formatOpsCodeLabel(locale, "high")}
                  </option>
                </select>
              </Field>
              <Field theme={theme} label={t("complaints.form.relatedOrder")}>
                <input
                  type="text"
                  style={controlStyle(theme, { mono: true })}
                  value={createForm.relatedOrderId ?? ""}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      relatedOrderId: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field theme={theme} label={t("complaints.form.relatedCall")}>
                <input
                  type="text"
                  style={controlStyle(theme, { mono: true })}
                  value={createForm.relatedCallId ?? ""}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      relatedCallId: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field
                theme={theme}
                label={t("complaints.form.description")}
                required
              >
                <textarea
                  rows={4}
                  style={controlStyle(theme, { minHeight: 104 })}
                  value={createForm.description}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>
            <div style={actionRowStyle}>
              <Btn
                theme={theme}
                variant="primary"
                icon="check"
                disabled={!canCreate}
                onClick={() => void handleCreateComplaint()}
              >
                {busyKey === "create-complaint"
                  ? t("complaints.form.saving")
                  : t("complaints.form.createRecord")}
              </Btn>
              <Btn
                theme={theme}
                variant="ghost"
                onClick={() => setShowCreate(false)}
              >
                {t("common.cancel")}
              </Btn>
            </div>
          </Card>
        ) : null}

        {showWorkspace && selectedRecord ? (
          <div style={workspaceGridStyle}>
            <Card
              theme={theme}
              title={`${selectedRecord.caseNo} / ${formatOpsCodeLabel(
                locale,
                selectedRecord.category,
              )}`}
              subtitle={copy(
                locale,
                "Selected complaint workspace",
                "已選客訴 workspace",
              )}
              actions={
                <Btn
                  theme={theme}
                  variant="ghost"
                  onClick={() => setShowWorkspace(false)}
                >
                  {copy(locale, "Hide workspace", "隱藏 workspace")}
                </Btn>
              }
            >
              <div style={detailStackStyle}>
                <div style={pillRowStyle}>
                  <Pill theme={theme} tone={getStatusTone(selectedRecord)} dot>
                    {formatOpsCodeLabel(locale, selectedRecord.status)}
                  </Pill>
                  <Pill
                    theme={theme}
                    tone={getSeverityTone(selectedRecord)}
                    dot
                  >
                    {selectedRecord.slaBreach
                      ? copy(locale, "SLA breach", "SLA 違規")
                      : formatOpsCodeLabel(locale, selectedRecord.severity)}
                  </Pill>
                  {selectedRecord.relatedIncidentId ? (
                    <Pill theme={theme} tone="danger" dot>
                      {copy(locale, "incident linked", "已連結 incident")}
                    </Pill>
                  ) : null}
                </div>

                <DL
                  theme={theme}
                  cols={2}
                  items={[
                    {
                      label: t("common.status"),
                      value: formatOpsCodeLabel(locale, selectedRecord.status),
                    },
                    {
                      label: t("complaints.detail.assignee"),
                      value:
                        selectedRecord.assigneeId ?? t("complaints.unassigned"),
                      mono: true,
                    },
                    {
                      label: copy(locale, "SLA due", "SLA 截止"),
                      value: formatDateTime(locale, selectedRecord.slaDueAt),
                      mono: true,
                    },
                    {
                      label: copy(locale, "SLA breach", "SLA 違規"),
                      value: selectedRecord.slaBreach
                        ? t("common.yes")
                        : t("common.no"),
                    },
                    {
                      label: t("complaints.detail.orderCall"),
                      value: `${selectedRecord.relatedOrderId ?? "-"} / ${
                        selectedRecord.relatedCallId ?? "-"
                      }`,
                      mono: true,
                    },
                    {
                      label: t("complaints.detail.resolution"),
                      value: selectedRecord.resolutionCode
                        ? formatOpsCodeLabel(
                            locale,
                            selectedRecord.resolutionCode,
                          )
                        : "-",
                    },
                    {
                      label: t("complaints.detail.reopenCount"),
                      value: `${selectedRecord.reopenCount ?? 0}`,
                      mono: true,
                    },
                    {
                      label: t("complaints.detail.linkedIncident"),
                      value: selectedRecord.relatedIncidentId ? (
                        <Link
                          href={`/incidents?incidentId=${encodeURIComponent(
                            selectedRecord.relatedIncidentId,
                          )}`}
                          style={actionLinkStyle(theme)}
                        >
                          {selectedRecord.relatedIncidentId}
                        </Link>
                      ) : (
                        "-"
                      ),
                    },
                  ]}
                />

                <div
                  style={{
                    color: theme.text,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {selectedRecord.description}
                </div>

                <div style={actionRowStyle}>
                  {!selectedRecord.slaBreach ? (
                    <Btn
                      theme={theme}
                      danger
                      icon="warn"
                      disabled={busyKey === "sla-breach"}
                      onClick={() => void handleMarkSlaBreach()}
                    >
                      {t("complaints.markSlaBreach")}
                    </Btn>
                  ) : null}
                  {!selectedRecord.relatedIncidentId &&
                  (selectedRecord.slaBreach ||
                    selectedRecord.severity === "high") ? (
                    <Link
                      href={buildIncidentHandoffHref(selectedRecord)}
                      style={actionLinkStyle(theme)}
                    >
                      {copy(
                        locale,
                        "Prepare incident handoff",
                        "準備 incident handoff",
                      )}
                    </Link>
                  ) : null}
                </div>

                <div style={actionGridStyle}>
                  <Card
                    theme={theme}
                    title={t("complaints.assignCase")}
                    subtitle={t("complaints.assignForm.title")}
                  >
                    <Field
                      theme={theme}
                      label={t("complaints.assignForm.agentId")}
                    >
                      <input
                        type="text"
                        style={controlStyle(theme, { mono: true })}
                        value={assigneeId}
                        onChange={(event) => setAssigneeId(event.target.value)}
                      />
                    </Field>
                    <Field theme={theme} label={t("common.notes")}>
                      <textarea
                        rows={3}
                        style={controlStyle(theme, { minHeight: 92 })}
                        placeholder={t("complaints.assignmentNotePlaceholder")}
                        value={assignmentNote}
                        onChange={(event) =>
                          setAssignmentNote(event.target.value)
                        }
                      />
                    </Field>
                    <Btn
                      theme={theme}
                      disabled={!canAssign}
                      onClick={() => void handleAssignCase()}
                    >
                      {t("complaints.assign")}
                    </Btn>
                  </Card>

                  <Card
                    theme={theme}
                    title={t("complaints.addNote")}
                    subtitle={copy(
                      locale,
                      "Append investigation context without replacing history.",
                      "補充調查內容，不覆蓋既有歷史。",
                    )}
                  >
                    <Field theme={theme} label={t("common.notes")}>
                      <textarea
                        rows={4}
                        style={controlStyle(theme, { minHeight: 112 })}
                        placeholder={t(
                          "complaints.investigationNotePlaceholder",
                        )}
                        value={noteText}
                        onChange={(event) => setNoteText(event.target.value)}
                      />
                    </Field>
                    <Btn
                      theme={theme}
                      disabled={!canAddNote}
                      onClick={() => void handleAddNote()}
                    >
                      {t("complaints.saveNote")}
                    </Btn>
                  </Card>

                  <Card
                    theme={theme}
                    title={t("complaints.resolveCase")}
                    subtitle={t("complaints.resolveForm.title")}
                  >
                    <Field
                      theme={theme}
                      label={t("complaints.resolveForm.resolution")}
                    >
                      <select
                        style={controlStyle(theme)}
                        value={resolutionCode}
                        onChange={(event) =>
                          setResolutionCode(
                            event.target.value as ComplaintResolutionCode,
                          )
                        }
                      >
                        {validResolutionCodes.map((code) => (
                          <option key={code} value={code}>
                            {formatOpsCodeLabel(locale, code)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field theme={theme} label={t("common.notes")}>
                      <textarea
                        rows={4}
                        style={controlStyle(theme, { minHeight: 112 })}
                        placeholder={t("complaints.closingNotePlaceholder")}
                        value={closingNote}
                        onChange={(event) => setClosingNote(event.target.value)}
                      />
                    </Field>
                    <div style={actionRowStyle}>
                      <Btn
                        theme={theme}
                        disabled={!canResolve}
                        onClick={() => void handleResolveCase(false)}
                      >
                        {t("complaints.resolve")}
                      </Btn>
                      <Btn
                        theme={theme}
                        variant="primary"
                        disabled={!canClose}
                        onClick={() => void handleResolveCase(true)}
                      >
                        {t("complaints.close")}
                      </Btn>
                    </div>
                  </Card>

                  <Card
                    theme={theme}
                    title={t("complaints.reopenCase")}
                    subtitle={t("complaints.reopenForm.title")}
                  >
                    <Field
                      theme={theme}
                      label={t("complaints.reopenForm.reason")}
                    >
                      <textarea
                        rows={4}
                        style={controlStyle(theme, { minHeight: 112 })}
                        placeholder={t("complaints.reopenReasonPlaceholder")}
                        value={reopenReason}
                        onChange={(event) =>
                          setReopenReason(event.target.value)
                        }
                      />
                    </Field>
                    <Btn
                      theme={theme}
                      disabled={!canReopen}
                      onClick={() => void handleReopenCase()}
                    >
                      {t("complaints.reopen")}
                    </Btn>
                  </Card>

                  {!selectedRecord.relatedIncidentId ? (
                    <Card
                      theme={theme}
                      title={t("complaints.escalateToIncident")}
                      subtitle={t("complaints.escalateForm.title")}
                    >
                      <Field
                        theme={theme}
                        label={t("complaints.escalateTitlePlaceholder")}
                        required
                      >
                        <input
                          type="text"
                          style={controlStyle(theme)}
                          value={escalateTitle}
                          onChange={(event) =>
                            setEscalateTitle(event.target.value)
                          }
                        />
                      </Field>
                      <Field
                        theme={theme}
                        label={t("complaints.form.severity")}
                      >
                        <select
                          style={controlStyle(theme)}
                          value={escalateSeverity}
                          onChange={(event) =>
                            setEscalateSeverity(
                              event.target
                                .value as EscalateComplaintToIncidentCommand["severity"],
                            )
                          }
                        >
                          {ESCALATION_SEVERITY_OPTIONS.map((severity) => (
                            <option key={severity} value={severity}>
                              {formatOpsCodeLabel(locale, severity)}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field
                        theme={theme}
                        label={t("complaints.escalateForm.reason")}
                        required
                      >
                        <textarea
                          rows={4}
                          style={controlStyle(theme, { minHeight: 112 })}
                          placeholder={t(
                            "complaints.escalateReasonPlaceholder",
                          )}
                          value={escalateReason}
                          onChange={(event) =>
                            setEscalateReason(event.target.value)
                          }
                        />
                      </Field>
                      <Btn
                        theme={theme}
                        variant="primary"
                        icon="warn"
                        disabled={!canEscalate}
                        onClick={() => void handleEscalateCase()}
                      >
                        {t("complaints.escalateBtn")}
                      </Btn>
                    </Card>
                  ) : null}
                </div>
              </div>
            </Card>

            <Card
              theme={theme}
              title={t("complaints.timelineExport")}
              subtitle={copy(
                locale,
                "Audit packet readiness and immutable case timeline.",
                "稽核封包就緒狀態與不可覆寫的案件時間軸。",
              )}
            >
              <div style={detailStackStyle}>
                <Banner
                  theme={theme}
                  tone={exportView?.readyForAudit ? "info" : "warn"}
                  icon={exportView?.readyForAudit ? "ok" : "clock"}
                  title={
                    exportView?.readyForAudit
                      ? t("complaints.readyForAudit")
                      : t("complaints.notExportReady")
                  }
                  body={t("complaints.exportGenerated", {
                    value: formatDateTimeWithSeconds(
                      locale,
                      exportView?.exportGeneratedAt,
                    ),
                  })}
                />

                <DL
                  theme={theme}
                  cols={1}
                  items={[
                    {
                      label: copy(locale, "Selected case", "目前案件"),
                      value: selectedRecord.caseNo,
                      mono: true,
                    },
                    {
                      label: copy(locale, "Timeline entries", "時間軸筆數"),
                      value: `${timeline.length}`,
                      mono: true,
                    },
                  ]}
                />

                <div style={timelineListStyle}>
                  {timeline.length > 0 ? (
                    timeline.map((entry) => (
                      <div
                        key={entry.entryId}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 8,
                          border: `1px solid ${theme.border}`,
                          background: theme.surfaceLo,
                          display: "grid",
                          gap: 4,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <strong style={{ fontSize: 12.5 }}>
                            {formatOpsCodeLabel(locale, entry.action)}
                          </strong>
                          <span
                            style={{
                              color: theme.textMuted,
                              fontSize: 11.5,
                              fontFamily: theme.monoFamily,
                            }}
                          >
                            {formatDateTimeWithSeconds(locale, entry.createdAt)}
                          </span>
                        </div>
                        <div
                          style={{
                            color: theme.text,
                            fontSize: 12.5,
                            lineHeight: 1.45,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {entry.note}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={emptyStateStyle}>
                      {t("complaints.timelineEmpty")}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>
        ) : null}
      </div>
    </Shell>
  );
}
