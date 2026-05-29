"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  type CSSProperties,
  type ReactNode,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasIcon,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";
import type {
  ComplaintCaseRecord,
  ComplaintCaseStatus,
  ComplaintCategory,
  ComplaintExportViewRecord,
  ComplaintResolutionCode,
  ComplaintSlaStatus,
  ComplaintTimelineEntry,
  CreateComplaintCaseCommand,
  EscalateComplaintToIncidentCommand,
  EmptyReason,
  RefreshTier,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  COMPLAINT_CASE_STATUSES,
  COMPLAINT_CATEGORIES,
  COMPLAINT_CATEGORY_VALID_RESOLUTIONS,
} from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";

// ── canvas theme + per-page operating context ──────────────────────────────
const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

// §5.5 refresh tier — T3 Ops medium (15s). Driven off the shared RefreshTier
// enum so the cadence is not a free-floating magic number.
const COMPLAINTS_REFRESH_TIER: RefreshTier = "medium";
const REFRESH_CADENCE_MS = 15_000;

// Icon-name type derived from the CanvasIcon component so we stay aligned with
// the shared icon set without importing a non-exported type alias.
type IconName = Parameters<typeof CanvasIcon>[0]["name"];

// Demo identity binding for the "assigned to me" scope filter (§5.5 — assignee
// filter me / unassigned / all). Real deployments resolve this from the
// IdentityContext; the demo client posts as a single ops compliance actor.
const CURRENT_AGENT_ID = "AGENT-OPS-002";

const STATUS_OPTIONS: ComplaintCaseStatus[] = [...COMPLAINT_CASE_STATUSES];
const CATEGORY_OPTIONS: ComplaintCategory[] = [...COMPLAINT_CATEGORIES];
const SLA_FILTER_OPTIONS: ComplaintSlaStatus[] = [
  "within_sla",
  "warning",
  "breached",
];

type ScopeKey = "all" | "mine" | "unassigned" | "breach" | "escalated";
type SlaFilter = ComplaintSlaStatus | "all";

const INITIAL_CREATE_FORM: CreateComplaintCaseCommand = {
  caseSource: "ops",
  category: "fare_dispute",
  severity: "normal",
  description: "",
  relatedOrderId: "",
  relatedCallId: "",
};

const ESCALATE_SEVERITIES = ["low", "medium", "high", "critical"] as const;

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const controlStyle: CSSProperties = {
  background: theme.bgRaised,
  color: theme.text,
  border: `1px solid ${theme.border}`,
  borderRadius: 7,
  padding: "6px 9px",
  fontSize: 12.5,
  fontFamily: theme.fontFamily,
  minWidth: 0,
};

const textareaStyle: CSSProperties = {
  ...controlStyle,
  width: "100%",
  resize: "vertical",
  minHeight: 64,
};

// ── small helpers ──────────────────────────────────────────────────────────
function tx(locale: "en" | "zh", en: string, zh: string) {
  return locale === "en" ? en : zh;
}

function formatDateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

function isComplaintActive(status: ComplaintCaseStatus) {
  return ["new", "assigned", "under_investigation", "reopened"].includes(
    status,
  );
}

// Backend-computed SLA tri-state is authoritative (Q-OPS13). We only fall back
// to a derived value while a backend has not yet started emitting `slaStatus`.
function resolveSlaStatus(record: ComplaintCaseRecord): ComplaintSlaStatus {
  if (record.slaStatus) {
    return record.slaStatus;
  }
  if (record.slaBreach) {
    return "breached";
  }
  const msToDue = new Date(record.slaDueAt).getTime() - Date.now();
  if (Number.isFinite(msToDue) && msToDue <= 60 * 60 * 1000) {
    return "warning";
  }
  return "within_sla";
}

function isSlaBackendComputed(record: ComplaintCaseRecord) {
  return record.slaStatus !== undefined;
}

function slaTone(status: ComplaintSlaStatus): CanvasTone {
  if (status === "breached") {
    return "danger";
  }
  if (status === "warning") {
    return "warn";
  }
  return "success";
}

function statusTone(status: ComplaintCaseStatus): CanvasTone {
  switch (status) {
    case "resolved":
      return "success";
    case "closed":
      return "neutral";
    case "reopened":
      return "warn";
    default:
      return "info";
  }
}

function slaRank(status: ComplaintSlaStatus) {
  return status === "breached" ? 0 : status === "warning" ? 1 : 2;
}

function compareComplaintPriority(
  a: ComplaintCaseRecord,
  b: ComplaintCaseRecord,
) {
  const slaDelta = slaRank(resolveSlaStatus(a)) - slaRank(resolveSlaStatus(b));
  if (slaDelta !== 0) {
    return slaDelta;
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

function formatRelativeSla(value: string, locale: "en" | "zh") {
  const deltaMinutes = Math.round(
    (new Date(value).getTime() - Date.now()) / (1000 * 60),
  );
  if (Number.isNaN(deltaMinutes)) {
    return "—";
  }
  if (deltaMinutes >= 0) {
    return tx(
      locale,
      `due in ${deltaMinutes} min`,
      `還有 ${deltaMinutes} 分鐘`,
    );
  }
  return tx(
    locale,
    `overdue ${Math.abs(deltaMinutes)} min`,
    `逾期 ${Math.abs(deltaMinutes)} 分鐘`,
  );
}

// ── availableActions (Q-X13) ────────────────────────────────────────────────
type ActionMeta = { icon: IconName; en: string; zh: string };

const ACTION_META: Record<string, ActionMeta> = {
  add_note: { icon: "plus", en: "Add note", zh: "新增備註" },
  assign: { icon: "users", en: "Assign / reassign", zh: "指派 / 重新指派" },
  resolve: { icon: "check", en: "Resolve", zh: "結案處理" },
  close: { icon: "check", en: "Close", zh: "關閉案件" },
  reopen: { icon: "arrow", en: "Reopen", zh: "重啟案件" },
  escalate_to_incident: {
    icon: "warn",
    en: "Escalate to incident",
    zh: "升級事故",
  },
  mark_sla_breach: { icon: "sla", en: "Mark SLA breach", zh: "標記 SLA 違規" },
  export_view: { icon: "reports", en: "Export view", zh: "匯出案件視圖" },
  create: { icon: "plus", en: "Create complaint", zh: "建立客訴" },
};

function actionLabel(action: string, locale: "en" | "zh") {
  const meta = ACTION_META[action];
  return meta
    ? tx(locale, meta.en, meta.zh)
    : formatOpsCodeLabel(locale, action);
}

// Fallback CTA set when the backend has not populated `availableActions` yet.
// Risk levels mirror packet §3.4 / §5.5.
function deriveComplaintActions(
  record: ComplaintCaseRecord,
): ResourceActionDescriptor[] {
  const list: ResourceActionDescriptor[] = [];
  if (isComplaintActive(record.status)) {
    list.push({ action: "add_note", enabled: true, riskLevel: "low" });
    list.push({ action: "assign", enabled: true, riskLevel: "medium" });
    list.push({ action: "resolve", enabled: true, riskLevel: "medium" });
    if (!record.relatedIncidentId) {
      list.push({
        action: "escalate_to_incident",
        enabled: true,
        requiresReason: true,
        riskLevel: "high",
      });
    }
    list.push(
      resolveSlaStatus(record) === "breached"
        ? {
            action: "mark_sla_breach",
            enabled: false,
            disabledReasonCode: "already_breached",
            riskLevel: "low",
          }
        : { action: "mark_sla_breach", enabled: true, riskLevel: "low" },
    );
  } else if (record.status === "resolved") {
    list.push({ action: "add_note", enabled: true, riskLevel: "low" });
    list.push({ action: "close", enabled: true, riskLevel: "medium" });
    list.push({
      action: "reopen",
      enabled: true,
      requiresReason: true,
      riskLevel: "high",
    });
  } else if (record.status === "closed") {
    list.push({
      action: "reopen",
      enabled: true,
      requiresReason: true,
      riskLevel: "high",
    });
  }
  list.push({ action: "export_view", enabled: true, riskLevel: "low" });
  return list;
}

function getComplaintActions(
  record: ComplaintCaseRecord,
): ResourceActionDescriptor[] {
  return record.availableActions && record.availableActions.length > 0
    ? record.availableActions
    : deriveComplaintActions(record);
}

// Low-risk, input-free actions run directly (§3.4 low = direct + toast); every
// other action collects input / confirmation through the modal.
function actionRunsDirect(descriptor: ResourceActionDescriptor) {
  return (
    descriptor.riskLevel === "low" &&
    (descriptor.action === "mark_sla_breach" ||
      descriptor.action === "export_view")
  );
}

// ── empty-state copy (Q-X15) ────────────────────────────────────────────────
type EmptyCopy = {
  icon: IconName;
  tone: CanvasTone;
  en: { title: string; body: string; cta?: string };
  zh: { title: string; body: string; cta?: string };
};

const EMPTY_COPY: Record<
  Exclude<EmptyReason, "driver_not_eligible">,
  EmptyCopy
> = {
  no_data: {
    icon: "ok",
    tone: "success",
    en: {
      title: "No open complaints",
      body: "There are no complaint cases for this realm right now.",
    },
    zh: {
      title: "目前沒有客訴案件",
      body: "此範圍目前沒有任何客訴案件。",
    },
  },
  filtered_empty: {
    icon: "filter",
    tone: "info",
    en: {
      title: "No cases match these filters",
      body: "Loosen the scope, status, severity or SLA filters to see more cases.",
      cta: "Clear filters",
    },
    zh: {
      title: "沒有符合篩選的案件",
      body: "放寬範圍、狀態、嚴重度或 SLA 篩選即可看到更多案件。",
      cta: "清除篩選",
    },
  },
  not_provisioned: {
    icon: "flags",
    tone: "warn",
    en: {
      title: "Complaint center not provisioned",
      body: "The complaint module is not enabled for this tenant / realm yet.",
      cta: "Retry",
    },
    zh: {
      title: "客訴模組尚未啟用",
      body: "此租戶 / 範圍尚未啟用客訴模組。",
      cta: "重試",
    },
  },
  fetch_failed: {
    icon: "warn",
    tone: "danger",
    en: {
      title: "Could not load complaints",
      body: "The backend returned an error while loading cases.",
      cta: "Retry",
    },
    zh: {
      title: "無法載入客訴",
      body: "後端在載入案件時回傳錯誤。",
      cta: "重試",
    },
  },
  permission_denied: {
    icon: "audit",
    tone: "danger",
    en: {
      title: "No access to complaints",
      body: "Your role does not have scope to read complaint cases.",
    },
    zh: {
      title: "無客訴存取權限",
      body: "你的角色沒有讀取客訴案件的權限範圍。",
    },
  },
  external_unavailable: {
    icon: "adapters",
    tone: "warn",
    en: {
      title: "Complaint service unavailable",
      body: "An upstream dependency is degraded. Cases may be temporarily unreadable.",
      cta: "Retry",
    },
    zh: {
      title: "客訴服務暫時無法使用",
      body: "上游依賴目前降級，案件可能暫時無法讀取。",
      cta: "重試",
    },
  },
};

function classifyFetchError(error: unknown): EmptyReason {
  const message = (
    error instanceof Error ? error.message : String(error ?? "")
  ).toLowerCase();
  if (/(\b403\b|forbidden|permission|unauthor|scope)/.test(message)) {
    return "permission_denied";
  }
  if (
    /(\b404\b|\b501\b|not provisioned|not_provisioned|disabled|no module)/.test(
      message,
    )
  ) {
    return "not_provisioned";
  }
  if (
    /(\b50[234]\b|unavailable|adapter|upstream|gateway|timeout|network)/.test(
      message,
    )
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

type ComplaintRow = Record<string, unknown> &
  ComplaintCaseRecord & { _selected?: boolean };

type ModalState = {
  descriptor: ResourceActionDescriptor;
  record: ComplaintCaseRecord;
} | null;

type Receipt = {
  message: string;
  auditId: string;
} | null;

export default function ComplaintsPage() {
  const { locale } = useTranslation();
  const searchParams = useSearchParams();
  const caseNoFromQuery = searchParams.get("caseNo");

  const resolveErrorMessage = (error: unknown) =>
    error instanceof Error
      ? error.message
      : tx(locale, "Unknown error", "未知錯誤");

  const [records, setRecords] = useState<ComplaintCaseRecord[]>([]);
  const [timeline, setTimeline] = useState<ComplaintTimelineEntry[]>([]);
  const [exportView, setExportView] =
    useState<ComplaintExportViewRecord | null>(null);
  const [selectedCaseNo, setSelectedCaseNo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emptyReason, setEmptyReason] = useState<EmptyReason | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [refreshMeta, setRefreshMeta] = useState<UiRefreshMetadata>({
    generatedAt: "",
    staleAfterMs: REFRESH_CADENCE_MS,
    dataFreshness: "unknown",
    source: "live",
  });
  const [nowMs, setNowMs] = useState(0);

  // filters
  const [scope, setScope] = useState<ScopeKey>("all");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ComplaintCaseStatus | "all">(
    "all",
  );
  const [categoryFilter, setCategoryFilter] = useState<
    ComplaintCategory | "all"
  >("all");
  const [slaFilter, setSlaFilter] = useState<SlaFilter>("all");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  // create form
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(INITIAL_CREATE_FORM);

  // modal + receipt
  const [modal, setModal] = useState<ModalState>(null);
  const [receipt, setReceipt] = useState<Receipt>(null);

  // action input fields (shared by the confirmation modal)
  const [assigneeId, setAssigneeId] = useState(CURRENT_AGENT_ID);
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

  async function loadRecords(preferredCaseNo?: string, silent = false) {
    if (!silent) {
      setLoading(true);
    }
    try {
      const nextRecords = await getOpsClient().listComplaints();
      setRecords(nextRecords);
      setEmptyReason(null);
      setError(null);
      setSelectedCaseNo((current) => {
        const preferred = preferredCaseNo ?? caseNoFromQuery ?? current;
        if (preferred && nextRecords.some((r) => r.caseNo === preferred)) {
          return preferred;
        }
        return nextRecords[0]?.caseNo ?? null;
      });
      setRefreshMeta({
        generatedAt: new Date().toISOString(),
        staleAfterMs: REFRESH_CADENCE_MS,
        dataFreshness: "fresh",
        source: "live",
      });
    } catch (nextError) {
      setError(resolveErrorMessage(nextError));
      setEmptyReason(classifyFetchError(nextError));
      setRefreshMeta((current) => ({
        ...current,
        dataFreshness: "degraded",
        source: "cache",
      }));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  // initial load + deep-link entry (callcenter transfer / notification)
  useEffect(() => {
    if (caseNoFromQuery) {
      setSelectedCaseNo(caseNoFromQuery);
    }
    void loadRecords(caseNoFromQuery ?? undefined);
  }, [caseNoFromQuery]);

  // T3 medium refresh tier — silent poll on a fixed cadence
  useEffect(() => {
    const id = setInterval(() => {
      void loadRecords(selectedCaseNo ?? undefined, true);
    }, REFRESH_CADENCE_MS);
    return () => clearInterval(id);
  }, [selectedCaseNo]);

  // staleness ticker (drives the stale affordance between polls)
  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  // selected-case timeline + export view
  useEffect(() => {
    if (!selectedCaseNo) {
      setTimeline([]);
      setExportView(null);
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
  }, [selectedCaseNo]);

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

  function emitReceipt(action: string, record: ComplaintCaseRecord) {
    // Backend ActionReceipt would carry the canonical auditId; until then we
    // surface a deterministic local reference so the receipt + audit deep link
    // pattern (§3.4) is wired and visible.
    const auditId = `audit-${record.caseNo}-${action}`;
    setReceipt({
      message: tx(
        locale,
        `${actionLabel(action, "en")} submitted`,
        `${actionLabel(action, "zh")}已送出`,
      ),
      auditId,
    });
  }

  function openAction(
    descriptor: ResourceActionDescriptor,
    record: ComplaintCaseRecord,
  ) {
    if (!descriptor.enabled) {
      return;
    }
    setSelectedCaseNo(record.caseNo);
    if (actionRunsDirect(descriptor)) {
      void invokeDirect(descriptor, record);
      return;
    }
    // prime inputs for the modal
    if (descriptor.action === "assign") {
      setAssigneeId(record.assigneeId ?? CURRENT_AGENT_ID);
      setAssignmentNote("");
    }
    if (descriptor.action === "add_note") {
      setNoteText("");
    }
    if (descriptor.action === "reopen") {
      setReopenReason("");
    }
    if (descriptor.action === "escalate_to_incident") {
      setEscalateTitle(record.caseNo);
      setEscalateSeverity(
        resolveSlaStatus(record) === "breached" ? "high" : "medium",
      );
      setEscalateReason("");
    }
    setModal({ descriptor, record });
  }

  async function invokeDirect(
    descriptor: ResourceActionDescriptor,
    record: ComplaintCaseRecord,
  ) {
    const client = getOpsClient();
    if (descriptor.action === "mark_sla_breach") {
      await runAction(`mark_sla_breach-${record.caseNo}`, async () => {
        await client.markComplaintSlaBreach(record.caseNo);
        emitReceipt("mark_sla_breach", record);
        await loadRecords(record.caseNo, true);
      });
      return;
    }
    if (descriptor.action === "export_view") {
      await runAction(`export_view-${record.caseNo}`, async () => {
        const view = await client.getComplaintExportView(record.caseNo);
        setExportView(view);
        emitReceipt("export_view", record);
      });
    }
  }

  async function submitModal() {
    if (!modal) {
      return;
    }
    const { descriptor, record } = modal;
    const client = getOpsClient();
    const key = `${descriptor.action}-${record.caseNo}`;

    await runAction(key, async () => {
      switch (descriptor.action) {
        case "assign":
          await client.assignComplaint(record.caseNo, {
            assigneeId,
            note: assignmentNote,
          });
          setAssignmentNote("");
          break;
        case "add_note":
          await client.addComplaintNote(record.caseNo, { note: noteText });
          setNoteText("");
          break;
        case "resolve":
          await client.resolveComplaint(record.caseNo, {
            resolutionCode,
            closingNote,
          });
          break;
        case "close":
          await client.closeComplaint(record.caseNo, {
            resolutionCode,
            closingNote,
          });
          break;
        case "reopen":
          await client.reopenComplaint(record.caseNo, { reason: reopenReason });
          setReopenReason("");
          break;
        case "escalate_to_incident":
          await client.escalateComplaintToIncident(record.caseNo, {
            title: escalateTitle,
            severity: escalateSeverity,
            reason: escalateReason,
          });
          setEscalateTitle("");
          setEscalateReason("");
          setEscalateSeverity("medium");
          break;
        default:
          break;
      }
      emitReceipt(descriptor.action, record);
      await loadRecords(record.caseNo, true);
      setModal(null);
    });
  }

  async function submitCreate() {
    await runAction("create-complaint", async () => {
      const created = await getOpsClient().createComplaint({
        ...createForm,
        relatedOrderId: createForm.relatedOrderId || null,
        relatedCallId: createForm.relatedCallId || null,
      });
      emitReceipt("create", created);
      setCreateForm(INITIAL_CREATE_FORM);
      setShowCreate(false);
      await loadRecords(created.caseNo, true);
    });
  }

  function clearFilters() {
    setScope("all");
    setQuery("");
    setStatusFilter("all");
    setCategoryFilter("all");
    setSlaFilter("all");
  }

  // ── derived data ──────────────────────────────────────────────────────────
  const hasActiveFilters =
    scope !== "all" ||
    statusFilter !== "all" ||
    categoryFilter !== "all" ||
    slaFilter !== "all" ||
    deferredQuery !== "";

  function matchesScope(record: ComplaintCaseRecord) {
    switch (scope) {
      case "mine":
        return record.assigneeId === CURRENT_AGENT_ID;
      case "unassigned":
        return isComplaintActive(record.status) && !record.assigneeId;
      case "breach":
        return resolveSlaStatus(record) === "breached";
      case "escalated":
        return Boolean(record.relatedIncidentId);
      default:
        return true;
    }
  }

  const filteredRecords = records
    .filter((record) => {
      if (!matchesScope(record)) {
        return false;
      }
      if (statusFilter !== "all" && record.status !== statusFilter) {
        return false;
      }
      if (categoryFilter !== "all" && record.category !== categoryFilter) {
        return false;
      }
      if (slaFilter !== "all" && resolveSlaStatus(record) !== slaFilter) {
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
    .sort(compareComplaintPriority);

  const activeCount = records.filter((r) => isComplaintActive(r.status)).length;
  const breachedCount = records.filter(
    (r) => resolveSlaStatus(r) === "breached",
  ).length;
  const escalatedCount = records.filter((r) => r.relatedIncidentId).length;
  const reopenTotal = records.reduce((sum, r) => sum + (r.reopenCount ?? 0), 0);
  const mineCount = records.filter(
    (r) => r.assigneeId === CURRENT_AGENT_ID,
  ).length;
  const unassignedCount = records.filter(
    (r) => isComplaintActive(r.status) && !r.assigneeId,
  ).length;

  const scopeTabs: Array<{
    key: ScopeKey;
    label: string;
    count: number;
    tone?: CanvasTone;
  }> = [
    { key: "all", label: tx(locale, "All", "全部"), count: records.length },
    {
      key: "mine",
      label: tx(locale, "Mine", "我負責"),
      count: mineCount,
      tone: "accent",
    },
    {
      key: "unassigned",
      label: tx(locale, "Unassigned", "未指派"),
      count: unassignedCount,
    },
    {
      key: "breach",
      label: tx(locale, "SLA breach", "SLA 違規"),
      count: breachedCount,
      tone: "danger",
    },
    {
      key: "escalated",
      label: tx(locale, "Escalated", "已升級"),
      count: escalatedCount,
    },
  ];

  // freshness display (stale affordance)
  const generatedMs = refreshMeta.generatedAt
    ? new Date(refreshMeta.generatedAt).getTime()
    : 0;
  const isStale =
    generatedMs > 0 &&
    nowMs > 0 &&
    nowMs - generatedMs > refreshMeta.staleAfterMs;
  const freshness: UiRefreshMetadata["dataFreshness"] = emptyReason
    ? "degraded"
    : isStale
      ? "stale"
      : refreshMeta.dataFreshness;
  const freshnessTone: CanvasTone =
    freshness === "fresh"
      ? "success"
      : freshness === "stale"
        ? "warn"
        : freshness === "degraded"
          ? "danger"
          : "neutral";

  // empty / not-ready resolution
  const listEmptyReason: Exclude<EmptyReason, "driver_not_eligible"> | null =
    emptyReason && emptyReason !== "driver_not_eligible"
      ? (emptyReason as Exclude<EmptyReason, "driver_not_eligible">)
      : records.length === 0
        ? "no_data"
        : filteredRecords.length === 0
          ? "filtered_empty"
          : null;

  // ── table columns ───────────────────────────────────────────────────────
  const columns: CanvasTableColumn<ComplaintRow>[] = [
    {
      h: tx(locale, "CASE", "案件"),
      w: 110,
      mono: true,
      r: (row) => (
        <button
          type="button"
          onClick={() => setSelectedCaseNo(row.caseNo)}
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: theme.accent,
            fontWeight: 600,
            fontFamily: theme.monoFamily,
            fontSize: 11.5,
          }}
        >
          {row.caseNo}
        </button>
      ),
    },
    {
      h: tx(locale, "CATEGORY", "類別"),
      w: 150,
      r: (row) => formatOpsCodeLabel(locale, row.category),
    },
    {
      h: tx(locale, "SEV", "嚴重度"),
      w: 90,
      r: (row) => (
        <Pill
          theme={theme}
          tone={row.severity === "high" ? "danger" : "neutral"}
          dot
        >
          {formatOpsCodeLabel(locale, row.severity)}
        </Pill>
      ),
    },
    {
      h: tx(locale, "DESCRIPTION", "說明"),
      r: (row) => (
        <span
          style={{
            display: "block",
            maxWidth: 320,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: theme.textMuted,
          }}
          title={row.description}
        >
          {row.description}
        </span>
      ),
    },
    {
      h: tx(locale, "ORDER", "訂單"),
      w: 110,
      mono: true,
      r: (row) =>
        row.relatedOrderId ? (
          <Link
            href={`/dispatch?orderId=${encodeURIComponent(row.relatedOrderId)}`}
            style={{ color: theme.accent, textDecoration: "none" }}
          >
            {row.relatedOrderId}
          </Link>
        ) : (
          <span style={{ color: theme.textDim }}>—</span>
        ),
    },
    {
      h: tx(locale, "SLA · backend computed", "SLA · 後端計算"),
      w: 150,
      r: (row) => {
        const status = resolveSlaStatus(row);
        return (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <Pill theme={theme} tone={slaTone(status)} dot>
              {formatOpsCodeLabel(locale, status)}
            </Pill>
            {!isSlaBackendComputed(row) ? (
              <span
                style={{ color: theme.textDim, fontSize: 10 }}
                title={tx(
                  locale,
                  "Derived client-side (backend slaStatus pending)",
                  "前端推導（後端 slaStatus 待補）",
                )}
              >
                ~
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      h: tx(locale, "OWNER", "負責人"),
      w: 120,
      mono: true,
      r: (row) =>
        row.assigneeId ?? (
          <span style={{ color: theme.textDim }}>
            {tx(locale, "unassigned", "未指派")}
          </span>
        ),
    },
    {
      h: tx(locale, "STATUS", "狀態"),
      w: 150,
      r: (row) => (
        <Pill theme={theme} tone={statusTone(row.status)} dot>
          {formatOpsCodeLabel(locale, row.status)}
        </Pill>
      ),
    },
    {
      h: tx(locale, "ACTIONS", "動作"),
      w: 90,
      align: "right",
      r: (row) => {
        const count = getComplaintActions(row).filter((a) => a.enabled).length;
        return (
          <Btn
            theme={theme}
            size="xs"
            variant="ghost"
            icon="chevR"
            onClick={() => setSelectedCaseNo(row.caseNo)}
          >
            {count}
          </Btn>
        );
      },
    },
  ];

  const tableRows: ComplaintRow[] = filteredRecords.map((record) => ({
    ...record,
    _selected: record.caseNo === selectedCaseNo,
  }));

  const selectedActions = selectedRecord
    ? getComplaintActions(selectedRecord)
    : [];

  return (
    <>
      <PageHeader
        theme={theme}
        title={tx(locale, "Complaint Center", "客訴中心")}
        subtitle={tx(
          locale,
          "End-to-end casework · SLA · escalation · reopen must not overwrite the record",
          "案件全流程 · SLA · 升級 · reopen 不得覆蓋紀錄",
        )}
        actions={
          <>
            <Btn
              theme={theme}
              icon="reports"
              disabled={!selectedRecord}
              onClick={() =>
                selectedRecord &&
                void invokeDirect(
                  { action: "export_view", enabled: true, riskLevel: "low" },
                  selectedRecord,
                )
              }
            >
              {tx(locale, "Export", "匯出")}
            </Btn>
            <Btn
              theme={theme}
              variant="primary"
              icon="plus"
              onClick={() => setShowCreate((current) => !current)}
            >
              {tx(locale, "Create complaint", "建立客訴")}
            </Btn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {error ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={getOpsLabel(locale, "error")}
            body={error}
          />
        ) : null}

        {freshness !== "fresh" ? (
          <Banner
            theme={theme}
            tone={freshnessTone === "neutral" ? "info" : freshnessTone}
            icon="clock"
            title={tx(locale, "Data may be stale", "資料可能已過舊")}
            body={tx(
              locale,
              "The live snapshot is older than its refresh window. Refresh to pull the latest cases.",
              "目前快照已超過更新時限，請重新整理以取得最新案件。",
            )}
            actions={
              <Btn
                theme={theme}
                size="xs"
                icon="clock"
                onClick={() => void loadRecords(selectedCaseNo ?? undefined)}
              >
                {tx(locale, "Refresh", "重新整理")}
              </Btn>
            }
          />
        ) : null}

        {/* freshness / refresh-tier strip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            fontSize: 11.5,
            color: theme.textMuted,
          }}
        >
          <Pill theme={theme} tone={freshnessTone} dot>
            {formatOpsCodeLabel(locale, freshness)}
          </Pill>
          <span>
            {tx(locale, "Auto-refresh", "自動更新")} ·{" "}
            {Math.round(REFRESH_CADENCE_MS / 1000)}s ({COMPLAINTS_REFRESH_TIER})
          </span>
          <span style={{ color: theme.textDim }}>
            {tx(locale, "Updated", "更新於")}{" "}
            {refreshMeta.generatedAt
              ? formatDateTime(refreshMeta.generatedAt)
              : "—"}
          </span>
          <span style={{ color: theme.textDim }}>· {refreshMeta.source}</span>
          <Btn
            theme={theme}
            size="xs"
            icon="clock"
            onClick={() => void loadRecords(selectedCaseNo ?? undefined)}
          >
            {tx(locale, "Refresh", "重新整理")}
          </Btn>
        </div>

        {/* KPI grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          <KPI
            theme={theme}
            label={tx(locale, "Open cases", "未結客訴")}
            value={activeCount}
            delta={
              breachedCount > 0
                ? tx(
                    locale,
                    `${breachedCount} SLA breach`,
                    `${breachedCount} 件 SLA 違規`,
                  )
                : undefined
            }
            deltaTone={breachedCount > 0 ? "down" : "neutral"}
          />
          <KPI
            theme={theme}
            label={tx(locale, "SLA breached", "SLA 違規")}
            value={breachedCount}
            sub={tx(locale, "Backend-computed (Q-OPS13)", "後端計算 (Q-OPS13)")}
          />
          <KPI
            theme={theme}
            label={tx(locale, "Escalated to incident", "升級事故")}
            value={escalatedCount}
            sub={tx(locale, "Linked incident cases", "已連結事故案件")}
          />
          <KPI
            theme={theme}
            label={tx(locale, "Reopens", "reopen 次數")}
            value={reopenTotal}
            sub={tx(locale, "Across all cases", "所有案件累計")}
          />
        </div>

        {/* scope tabs */}
        <div
          style={{
            display: "flex",
            gap: 4,
            borderBottom: `1px solid ${theme.border}`,
            flexWrap: "wrap",
          }}
        >
          {scopeTabs.map((tab) => {
            const selected = scope === tab.key;
            const tone = tab.tone ?? "neutral";
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setScope(tab.key)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 12px",
                  fontSize: 12.5,
                  fontWeight: selected ? 600 : 450,
                  color: selected ? theme.text : theme.textMuted,
                  background: "transparent",
                  border: "none",
                  borderBottom: `2px solid ${selected ? theme.accent : "transparent"}`,
                  marginBottom: -1,
                  cursor: "pointer",
                  fontFamily: theme.fontFamily,
                }}
              >
                {tab.label}
                <Pill theme={theme} tone={selected ? tone : "neutral"}>
                  {tab.count}
                </Pill>
              </button>
            );
          })}
        </div>

        {/* filter bar */}
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <input
            style={{ ...controlStyle, flex: 1, minWidth: 220 }}
            type="search"
            placeholder={tx(
              locale,
              "Search case, order, call, assignee…",
              "搜尋案件、訂單、來電、負責人…",
            )}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            style={controlStyle}
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as ComplaintCaseStatus | "all")
            }
          >
            <option value="all">
              {tx(locale, "All statuses", "全部狀態")}
            </option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {formatOpsCodeLabel(locale, status)}
              </option>
            ))}
          </select>
          <select
            style={controlStyle}
            value={categoryFilter}
            onChange={(event) =>
              setCategoryFilter(event.target.value as ComplaintCategory | "all")
            }
          >
            <option value="all">
              {tx(locale, "All categories", "全部類別")}
            </option>
            {CATEGORY_OPTIONS.map((category) => (
              <option key={category} value={category}>
                {formatOpsCodeLabel(locale, category)}
              </option>
            ))}
          </select>
          <select
            style={controlStyle}
            value={slaFilter}
            onChange={(event) => setSlaFilter(event.target.value as SlaFilter)}
          >
            <option value="all">
              {tx(locale, "All SLA states", "全部 SLA 狀態")}
            </option>
            {SLA_FILTER_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {formatOpsCodeLabel(locale, status)}
              </option>
            ))}
          </select>
          {hasActiveFilters ? (
            <Btn theme={theme} size="sm" icon="x" onClick={clearFilters}>
              {tx(locale, "Clear", "清除")}
            </Btn>
          ) : null}
        </div>

        {/* create form */}
        {showCreate ? (
          <Card
            theme={theme}
            title={tx(locale, "New complaint case", "建立客訴案件")}
            actions={
              <Btn
                theme={theme}
                size="xs"
                icon="x"
                onClick={() => setShowCreate(false)}
              >
                {tx(locale, "Close", "關閉")}
              </Btn>
            }
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 12,
              }}
            >
              <label style={{ fontSize: 11.5, color: theme.textMuted }}>
                {tx(locale, "Source", "來源")}
                <select
                  style={{ ...controlStyle, width: "100%", marginTop: 4 }}
                  value={createForm.caseSource}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      caseSource: event.target
                        .value as CreateComplaintCaseCommand["caseSource"],
                    }))
                  }
                >
                  {(["ops", "phone", "web", "app"] as const).map((src) => (
                    <option key={src} value={src}>
                      {formatOpsCodeLabel(locale, src)}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 11.5, color: theme.textMuted }}>
                {tx(locale, "Category", "類別")}
                <select
                  style={{ ...controlStyle, width: "100%", marginTop: 4 }}
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
              </label>
              <label style={{ fontSize: 11.5, color: theme.textMuted }}>
                {tx(locale, "Severity", "嚴重度")}
                <select
                  style={{ ...controlStyle, width: "100%", marginTop: 4 }}
                  value={createForm.severity}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      severity: event.target
                        .value as CreateComplaintCaseCommand["severity"],
                    }))
                  }
                >
                  {(["normal", "high"] as const).map((sev) => (
                    <option key={sev} value={sev}>
                      {formatOpsCodeLabel(locale, sev)}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 11.5, color: theme.textMuted }}>
                {tx(locale, "Related order", "關聯訂單")}
                <input
                  style={{ ...controlStyle, width: "100%", marginTop: 4 }}
                  type="text"
                  value={createForm.relatedOrderId ?? ""}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      relatedOrderId: event.target.value,
                    }))
                  }
                />
              </label>
              <label style={{ fontSize: 11.5, color: theme.textMuted }}>
                {tx(locale, "Related call", "關聯來電")}
                <input
                  style={{ ...controlStyle, width: "100%", marginTop: 4 }}
                  type="text"
                  value={createForm.relatedCallId ?? ""}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      relatedCallId: event.target.value,
                    }))
                  }
                />
              </label>
              <label
                style={{
                  fontSize: 11.5,
                  color: theme.textMuted,
                  gridColumn: "1 / -1",
                }}
              >
                {tx(locale, "Description", "說明")}
                <textarea
                  style={{ ...textareaStyle, marginTop: 4 }}
                  value={createForm.description}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </label>
              <div style={{ gridColumn: "1 / -1" }}>
                <Btn
                  theme={theme}
                  variant="primary"
                  icon="check"
                  disabled={
                    busyKey === "create-complaint" ||
                    createForm.description.trim() === ""
                  }
                  onClick={() => void submitCreate()}
                >
                  {busyKey === "create-complaint"
                    ? tx(locale, "Saving…", "儲存中…")
                    : tx(locale, "Create case", "建立案件")}
                </Btn>
              </div>
            </div>
          </Card>
        ) : null}

        {/* case list */}
        <Card
          theme={theme}
          title={tx(locale, "Case backlog", "客訴佇列")}
          subtitle={tx(
            locale,
            `${filteredRecords.length} of ${records.length} case(s)`,
            `${filteredRecords.length} / ${records.length} 件案件`,
          )}
          padding={0}
        >
          {loading ? (
            <div style={{ padding: 24, color: theme.textMuted }}>
              {tx(locale, "Loading complaints…", "載入客訴中…")}
            </div>
          ) : listEmptyReason ? (
            <EmptyState
              reason={listEmptyReason}
              locale={locale}
              onPrimary={() => {
                if (listEmptyReason === "filtered_empty") {
                  clearFilters();
                } else {
                  void loadRecords(selectedCaseNo ?? undefined);
                }
              }}
            />
          ) : (
            <Table theme={theme} columns={columns} rows={tableRows} />
          )}
        </Card>

        {/* selected-case workspace */}
        {selectedRecord ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 1fr)",
              gap: 16,
              alignItems: "start",
            }}
          >
            <Card
              theme={theme}
              title={
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {selectedRecord.caseNo}
                  <Pill
                    theme={theme}
                    tone={slaTone(resolveSlaStatus(selectedRecord))}
                    dot
                  >
                    {formatOpsCodeLabel(
                      locale,
                      resolveSlaStatus(selectedRecord),
                    )}
                  </Pill>
                  <Pill
                    theme={theme}
                    tone={statusTone(selectedRecord.status)}
                    dot
                  >
                    {formatOpsCodeLabel(locale, selectedRecord.status)}
                  </Pill>
                </span>
              }
              subtitle={`${formatOpsCodeLabel(locale, selectedRecord.category)} · ${formatOpsCodeLabel(locale, selectedRecord.severity)}`}
            >
              <p
                style={{
                  margin: "0 0 12px",
                  color: theme.text,
                  lineHeight: 1.5,
                }}
              >
                {selectedRecord.description}
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: "10px 16px",
                  fontSize: 12.5,
                  marginBottom: 14,
                }}
              >
                <DetailItem
                  label={tx(locale, "SLA due", "SLA 期限")}
                  value={`${formatDateTime(selectedRecord.slaDueAt)} · ${formatRelativeSla(selectedRecord.slaDueAt, locale)}`}
                />
                <DetailItem
                  label={tx(locale, "SLA breached at", "SLA 違規時間")}
                  value={formatDateTime(selectedRecord.slaBreachedAt)}
                />
                <DetailItem
                  label={tx(locale, "Assignee", "負責人")}
                  value={
                    selectedRecord.assigneeId ??
                    tx(locale, "Unassigned", "未指派")
                  }
                />
                <DetailItem
                  label={tx(locale, "Reopens", "reopen 次數")}
                  value={String(selectedRecord.reopenCount ?? 0)}
                />
                <DetailItem
                  label={tx(locale, "Related order", "關聯訂單")}
                  value={
                    selectedRecord.relatedOrderId ? (
                      <Link
                        href={`/dispatch?orderId=${encodeURIComponent(selectedRecord.relatedOrderId)}`}
                        style={{ color: theme.accent, textDecoration: "none" }}
                      >
                        {selectedRecord.relatedOrderId} →
                      </Link>
                    ) : (
                      "—"
                    )
                  }
                />
                <DetailItem
                  label={tx(locale, "Related call", "關聯來電")}
                  value={
                    selectedRecord.relatedCallId ? (
                      <Link
                        href={`/callcenter?callId=${encodeURIComponent(selectedRecord.relatedCallId)}`}
                        style={{ color: theme.accent, textDecoration: "none" }}
                      >
                        {selectedRecord.relatedCallId} →
                      </Link>
                    ) : (
                      "—"
                    )
                  }
                />
                <DetailItem
                  label={tx(locale, "Linked incident", "連結事故")}
                  value={
                    selectedRecord.relatedIncidentId ? (
                      <Link
                        href={`/incidents?incidentId=${encodeURIComponent(selectedRecord.relatedIncidentId)}`}
                        style={{ color: theme.accent, textDecoration: "none" }}
                      >
                        {selectedRecord.relatedIncidentId} →
                      </Link>
                    ) : (
                      tx(locale, "Not escalated", "未升級")
                    )
                  }
                />
                <DetailItem
                  label={tx(locale, "Resolution", "處理結果")}
                  value={
                    selectedRecord.resolutionCode
                      ? formatOpsCodeLabel(
                          locale,
                          selectedRecord.resolutionCode,
                        )
                      : "—"
                  }
                />
              </div>

              {/* availableActions-driven CTAs */}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  paddingTop: 12,
                  borderTop: `1px solid ${theme.border}`,
                }}
              >
                {selectedActions.map((descriptor) => (
                  <ActionButton
                    key={descriptor.action}
                    descriptor={descriptor}
                    locale={locale}
                    busy={
                      busyKey ===
                      `${descriptor.action}-${selectedRecord.caseNo}`
                    }
                    onInvoke={() => openAction(descriptor, selectedRecord)}
                  />
                ))}
                {selectedActions.length === 0 ? (
                  <span style={{ fontSize: 12, color: theme.textDim }}>
                    {tx(
                      locale,
                      "Read-only for your role.",
                      "你的角色僅可檢視。",
                    )}
                  </span>
                ) : null}
              </div>
            </Card>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Card
                theme={theme}
                title={tx(locale, "Audit export", "稽核匯出")}
              >
                <Banner
                  theme={theme}
                  tone={exportView?.readyForAudit ? "success" : "info"}
                  icon={exportView?.readyForAudit ? "ok" : "audit"}
                  title={
                    exportView?.readyForAudit
                      ? tx(locale, "Ready for audit", "可供稽核")
                      : tx(locale, "Not export-ready", "尚未可匯出")
                  }
                  body={tx(
                    locale,
                    `Generated ${formatDateTime(exportView?.exportGeneratedAt)}`,
                    `產生於 ${formatDateTime(exportView?.exportGeneratedAt)}`,
                  )}
                />
              </Card>

              <Card theme={theme} title={tx(locale, "Timeline", "時間軸")}>
                {timeline.length > 0 ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    {timeline.map((entry) => (
                      <div
                        key={entry.entryId}
                        style={{
                          borderLeft: `2px solid ${theme.accent}`,
                          paddingLeft: 10,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: theme.text,
                          }}
                        >
                          {formatOpsCodeLabel(locale, entry.action)}
                        </div>
                        <div style={{ fontSize: 12, color: theme.textMuted }}>
                          {entry.note}
                        </div>
                        <div style={{ fontSize: 10.5, color: theme.textDim }}>
                          {formatDateTime(entry.createdAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, color: theme.textDim, fontSize: 12 }}>
                    {tx(locale, "No timeline entries.", "尚無時間軸紀錄。")}
                  </p>
                )}
              </Card>
            </div>
          </div>
        ) : null}

        <Link
          href="/dashboard"
          style={{
            color: theme.accent,
            textDecoration: "none",
            fontSize: 12.5,
          }}
        >
          ← {tx(locale, "Back to dashboard", "返回儀表板")}
        </Link>
      </div>

      {/* confirmation modal (medium / high risk) */}
      {modal ? (
        <ConfirmModal
          modal={modal}
          locale={locale}
          busy={busyKey === `${modal.descriptor.action}-${modal.record.caseNo}`}
          validResolutionCodes={validResolutionCodes}
          assigneeId={assigneeId}
          setAssigneeId={setAssigneeId}
          assignmentNote={assignmentNote}
          setAssignmentNote={setAssignmentNote}
          noteText={noteText}
          setNoteText={setNoteText}
          resolutionCode={resolutionCode}
          setResolutionCode={setResolutionCode}
          closingNote={closingNote}
          setClosingNote={setClosingNote}
          reopenReason={reopenReason}
          setReopenReason={setReopenReason}
          escalateTitle={escalateTitle}
          setEscalateTitle={setEscalateTitle}
          escalateSeverity={escalateSeverity}
          setEscalateSeverity={setEscalateSeverity}
          escalateReason={escalateReason}
          setEscalateReason={setEscalateReason}
          onCancel={() => setModal(null)}
          onConfirm={() => void submitModal()}
        />
      ) : null}

      {/* action receipt toast (§3.4) */}
      {receipt ? (
        <div
          style={{
            position: "fixed",
            right: 24,
            bottom: 24,
            zIndex: 60,
            maxWidth: 360,
          }}
        >
          <Banner
            theme={theme}
            tone="success"
            icon="ok"
            title={receipt.message}
            body={
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <span style={{ fontFamily: theme.monoFamily, fontSize: 11 }}>
                  {receipt.auditId}
                </span>
                <a
                  href={`/audit?auditId=${encodeURIComponent(receipt.auditId)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: theme.accent, textDecoration: "none" }}
                >
                  {tx(locale, "View audit ↗", "查看稽核 ↗")}
                </a>
              </span>
            }
            actions={
              <Btn
                theme={theme}
                size="xs"
                icon="x"
                onClick={() => setReceipt(null)}
              >
                {tx(locale, "Dismiss", "關閉")}
              </Btn>
            }
          />
        </div>
      ) : null}
    </>
  );
}

// ── sub-components ──────────────────────────────────────────────────────────
function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          color: theme.textMuted,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div style={{ color: theme.text, overflowWrap: "anywhere" }}>{value}</div>
    </div>
  );
}

function ActionButton({
  descriptor,
  locale,
  busy,
  onInvoke,
}: {
  descriptor: ResourceActionDescriptor;
  locale: "en" | "zh";
  busy: boolean;
  onInvoke: () => void;
}) {
  const meta = ACTION_META[descriptor.action];
  const isHigh = descriptor.riskLevel === "high";
  return (
    <Btn
      theme={theme}
      size="sm"
      icon={meta?.icon}
      danger={isHigh}
      variant={descriptor.riskLevel === "medium" ? "secondary" : "ghost"}
      disabled={!descriptor.enabled || busy}
      onClick={onInvoke}
    >
      {actionLabel(descriptor.action, locale)}
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

function EmptyState({
  reason,
  locale,
  onPrimary,
}: {
  reason: Exclude<EmptyReason, "driver_not_eligible">;
  locale: "en" | "zh";
  onPrimary: () => void;
}) {
  const copy = EMPTY_COPY[reason];
  const text = copy[locale];
  return (
    <div
      style={{
        padding: 40,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        textAlign: "center",
      }}
    >
      <Pill theme={theme} tone={copy.tone} dot>
        <CanvasIcon name={copy.icon} size={12} />
        <span style={{ marginLeft: 4 }}>{reason}</span>
      </Pill>
      <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>
        {text.title}
      </div>
      <div style={{ fontSize: 12.5, color: theme.textMuted, maxWidth: 420 }}>
        {text.body}
      </div>
      {text.cta ? (
        <Btn theme={theme} size="sm" onClick={onPrimary} icon="filter">
          {text.cta}
        </Btn>
      ) : null}
    </div>
  );
}

function ConfirmModal({
  modal,
  locale,
  busy,
  validResolutionCodes,
  assigneeId,
  setAssigneeId,
  assignmentNote,
  setAssignmentNote,
  noteText,
  setNoteText,
  resolutionCode,
  setResolutionCode,
  closingNote,
  setClosingNote,
  reopenReason,
  setReopenReason,
  escalateTitle,
  setEscalateTitle,
  escalateSeverity,
  setEscalateSeverity,
  escalateReason,
  setEscalateReason,
  onCancel,
  onConfirm,
}: {
  modal: NonNullable<ModalState>;
  locale: "en" | "zh";
  busy: boolean;
  validResolutionCodes: readonly ComplaintResolutionCode[];
  assigneeId: string;
  setAssigneeId: (value: string) => void;
  assignmentNote: string;
  setAssignmentNote: (value: string) => void;
  noteText: string;
  setNoteText: (value: string) => void;
  resolutionCode: ComplaintResolutionCode;
  setResolutionCode: (value: ComplaintResolutionCode) => void;
  closingNote: string;
  setClosingNote: (value: string) => void;
  reopenReason: string;
  setReopenReason: (value: string) => void;
  escalateTitle: string;
  setEscalateTitle: (value: string) => void;
  escalateSeverity: EscalateComplaintToIncidentCommand["severity"];
  setEscalateSeverity: (
    value: EscalateComplaintToIncidentCommand["severity"],
  ) => void;
  escalateReason: string;
  setEscalateReason: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { descriptor, record } = modal;
  const action = descriptor.action;
  const requiresReason = Boolean(descriptor.requiresReason);

  const reasonValue =
    action === "reopen"
      ? reopenReason
      : action === "escalate_to_incident"
        ? escalateReason
        : "";
  const reasonMissing = requiresReason && reasonValue.trim() === "";
  const escalateTitleMissing =
    action === "escalate_to_incident" && escalateTitle.trim() === "";
  const confirmDisabled = busy || reasonMissing || escalateTitleMissing;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{ width: "100%", maxWidth: 440 }}
      >
        <Card
          theme={theme}
          title={
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              {actionLabel(action, locale)}
              <Pill
                theme={theme}
                tone={
                  descriptor.riskLevel === "high"
                    ? "danger"
                    : descriptor.riskLevel === "medium"
                      ? "warn"
                      : "neutral"
                }
              >
                {formatOpsCodeLabel(locale, descriptor.riskLevel)}
              </Pill>
            </span>
          }
          subtitle={record.caseNo}
        >
          {requiresReason ? (
            <Banner
              theme={theme}
              tone="warn"
              icon="warn"
              title={tx(locale, "High-risk action", "高風險動作")}
              body={tx(
                locale,
                "A reason is required and is written to the immutable case timeline.",
                "必須填寫原因，並會寫入不可竄改的案件時間軸。",
              )}
            />
          ) : null}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginTop: 12,
            }}
          >
            {action === "assign" ? (
              <>
                <ModalField label={tx(locale, "Assignee ID", "負責人 ID")}>
                  <input
                    style={{ ...controlStyle, width: "100%" }}
                    value={assigneeId}
                    onChange={(event) => setAssigneeId(event.target.value)}
                  />
                </ModalField>
                <ModalField label={tx(locale, "Assignment note", "指派備註")}>
                  <textarea
                    style={textareaStyle}
                    value={assignmentNote}
                    onChange={(event) => setAssignmentNote(event.target.value)}
                  />
                </ModalField>
              </>
            ) : null}

            {action === "add_note" ? (
              <ModalField label={tx(locale, "Investigation note", "調查備註")}>
                <textarea
                  style={textareaStyle}
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                />
              </ModalField>
            ) : null}

            {action === "resolve" || action === "close" ? (
              <>
                <ModalField label={tx(locale, "Resolution code", "處理代碼")}>
                  <select
                    style={{ ...controlStyle, width: "100%" }}
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
                </ModalField>
                <ModalField label={tx(locale, "Closing note", "結案備註")}>
                  <textarea
                    style={textareaStyle}
                    value={closingNote}
                    onChange={(event) => setClosingNote(event.target.value)}
                  />
                </ModalField>
              </>
            ) : null}

            {action === "reopen" ? (
              <ModalField
                label={tx(locale, "Reopen reason", "重啟原因")}
                required
              >
                <textarea
                  style={textareaStyle}
                  value={reopenReason}
                  onChange={(event) => setReopenReason(event.target.value)}
                />
              </ModalField>
            ) : null}

            {action === "escalate_to_incident" ? (
              <>
                <ModalField
                  label={tx(locale, "Incident title", "事故標題")}
                  required
                >
                  <input
                    style={{ ...controlStyle, width: "100%" }}
                    value={escalateTitle}
                    onChange={(event) => setEscalateTitle(event.target.value)}
                  />
                </ModalField>
                <ModalField label={tx(locale, "Severity", "嚴重度")}>
                  <select
                    style={{ ...controlStyle, width: "100%" }}
                    value={escalateSeverity}
                    onChange={(event) =>
                      setEscalateSeverity(
                        event.target
                          .value as EscalateComplaintToIncidentCommand["severity"],
                      )
                    }
                  >
                    {ESCALATE_SEVERITIES.map((sev) => (
                      <option key={sev} value={sev}>
                        {formatOpsCodeLabel(locale, sev)}
                      </option>
                    ))}
                  </select>
                </ModalField>
                <ModalField
                  label={tx(locale, "Escalation reason", "升級原因")}
                  required
                >
                  <textarea
                    style={textareaStyle}
                    value={escalateReason}
                    onChange={(event) => setEscalateReason(event.target.value)}
                  />
                </ModalField>
              </>
            ) : null}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginTop: 16,
            }}
          >
            <Btn theme={theme} icon="x" onClick={onCancel}>
              {tx(locale, "Cancel", "取消")}
            </Btn>
            <Btn
              theme={theme}
              variant="primary"
              icon="check"
              danger={descriptor.riskLevel === "high"}
              disabled={confirmDisabled}
              onClick={onConfirm}
            >
              {busy
                ? tx(locale, "Working…", "處理中…")
                : tx(locale, "Confirm", "確認")}
            </Btn>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ModalField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label style={{ display: "block", fontSize: 11.5, color: theme.textMuted }}>
      <span style={{ display: "block", marginBottom: 4 }}>
        {label}
        {required ? <span style={{ color: theme.danger }}> *</span> : null}
      </span>
      {children}
    </label>
  );
}
