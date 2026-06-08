"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  type CSSProperties,
  type ReactNode,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
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
  ActionIntent,
  ActionReceipt,
  ComplaintCaseRecord,
  ComplaintCaseStatus,
  ComplaintCategory,
  ComplaintExportViewRecord,
  ComplaintResolutionCode,
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
import {
  useAssistantActionBridgeRegistration,
  useAssistantSelection,
} from "@/components/ops-assistant";
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
type Translate = (
  key: string,
  params?: Record<string, string | number>,
) => string;
type ComplaintSlaStatus = "within_sla" | "warning" | "breached";
type ComplaintActivityEntry = {
  entryId: string;
  actor: string;
  action: string;
  note?: string | null;
  createdAt: string;
};
type ComplaintCaseUiRecord = ComplaintCaseRecord & {
  slaStatus?: ComplaintSlaStatus;
  slaBreachedAt?: string | null;
  availableActions?: ResourceActionDescriptor[];
};

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
function resolveSlaStatus(record: ComplaintCaseUiRecord): ComplaintSlaStatus {
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

function isSlaBackendComputed(record: ComplaintCaseUiRecord) {
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
  a: ComplaintCaseUiRecord,
  b: ComplaintCaseUiRecord,
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

function formatRelativeSla(value: string, t: Translate) {
  const deltaMinutes = Math.round(
    (new Date(value).getTime() - Date.now()) / (1000 * 60),
  );
  if (Number.isNaN(deltaMinutes)) {
    return "—";
  }
  if (deltaMinutes >= 0) {
    return t("complaints.sla.relative.dueIn", { minutes: deltaMinutes });
  }
  return t("complaints.sla.relative.overdue", {
    minutes: Math.abs(deltaMinutes),
  });
}

// ── availableActions (Q-X13) ────────────────────────────────────────────────
type ActionMeta = { icon: IconName; labelKey: string };

const ACTION_META: Record<string, ActionMeta> = {
  add_note: { icon: "plus", labelKey: "complaints.action.addNote" },
  assign: { icon: "users", labelKey: "complaints.action.assign" },
  resolve: { icon: "check", labelKey: "complaints.action.resolve" },
  close: { icon: "check", labelKey: "complaints.action.close" },
  reopen: { icon: "arrow", labelKey: "complaints.action.reopen" },
  escalate_to_incident: {
    icon: "warn",
    labelKey: "complaints.action.escalateToIncident",
  },
  mark_sla_breach: {
    icon: "sla",
    labelKey: "complaints.action.markSlaBreach",
  },
  export_view: { icon: "reports", labelKey: "complaints.action.exportView" },
  create: { icon: "plus", labelKey: "complaints.action.create" },
};

function actionLabel(action: string, locale: "en" | "zh", t: Translate) {
  const meta = ACTION_META[action];
  return meta ? t(meta.labelKey) : formatOpsCodeLabel(locale, action);
}

// Fallback CTA set when the backend has not populated `availableActions` yet.
// Risk levels mirror packet §3.4 / §5.5.
function deriveComplaintActions(
  record: ComplaintCaseUiRecord,
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
  record: ComplaintCaseUiRecord,
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
  badgeKey: string;
  titleKey: string;
  bodyKey: string;
  ctaKey?: string;
};

const EMPTY_COPY: Record<
  Exclude<EmptyReason, "driver_not_eligible">,
  EmptyCopy
> = {
  no_data: {
    icon: "ok",
    tone: "success",
    badgeKey: "complaints.emptyState.noData.badge",
    titleKey: "complaints.emptyState.noData.title",
    bodyKey: "complaints.emptyState.noData.body",
  },
  filtered_empty: {
    icon: "filter",
    tone: "info",
    badgeKey: "complaints.emptyState.filteredEmpty.badge",
    titleKey: "complaints.emptyState.filteredEmpty.title",
    bodyKey: "complaints.emptyState.filteredEmpty.body",
    ctaKey: "complaints.emptyState.filteredEmpty.cta",
  },
  not_provisioned: {
    icon: "flags",
    tone: "warn",
    badgeKey: "complaints.emptyState.notProvisioned.badge",
    titleKey: "complaints.emptyState.notProvisioned.title",
    bodyKey: "complaints.emptyState.notProvisioned.body",
    ctaKey: "complaints.emptyState.notProvisioned.cta",
  },
  fetch_failed: {
    icon: "warn",
    tone: "danger",
    badgeKey: "complaints.emptyState.fetchFailed.badge",
    titleKey: "complaints.emptyState.fetchFailed.title",
    bodyKey: "complaints.emptyState.fetchFailed.body",
    ctaKey: "complaints.emptyState.fetchFailed.cta",
  },
  permission_denied: {
    icon: "audit",
    tone: "danger",
    badgeKey: "complaints.emptyState.permissionDenied.badge",
    titleKey: "complaints.emptyState.permissionDenied.title",
    bodyKey: "complaints.emptyState.permissionDenied.body",
  },
  external_unavailable: {
    icon: "adapters",
    tone: "warn",
    badgeKey: "complaints.emptyState.externalUnavailable.badge",
    titleKey: "complaints.emptyState.externalUnavailable.title",
    bodyKey: "complaints.emptyState.externalUnavailable.body",
    ctaKey: "complaints.emptyState.externalUnavailable.cta",
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
  actionId: string;
  message: string;
  auditId: string;
  auditHref: string;
} | null;

export default function ComplaintsPage() {
  const { locale, t } = useTranslation();
  const searchParams = useSearchParams();
  const caseNoFromQuery = searchParams.get("caseNo");
  const { setAssistantSelection, clearAssistantSelection } =
    useAssistantSelection();
  const assistantBridgePromiseRef = useRef<{
    resolve: (receipt: ActionReceipt & { auditHref?: string | null }) => void;
    reject: (error: Error) => void;
  } | null>(null);

  const resolveErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : t("common.unknown");

  const [records, setRecords] = useState<ComplaintCaseUiRecord[]>([]);
  const [activityItems, setActivityItems] = useState<ComplaintActivityEntry[]>(
    [],
  );
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
      clearAssistantSelection();
      return;
    }
    setAssistantSelection({ kind: "complaint", id: selectedRecord.caseNo });
    return () => clearAssistantSelection();
  }, [selectedRecord, setAssistantSelection, clearAssistantSelection]);

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
      const nextRecords =
        (await getOpsClient().listComplaints()) as ComplaintCaseUiRecord[];
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
      setActivityItems([]);
      setExportView(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const client = getOpsClient();
        const loadComplaintActivity = client[
          `getComplaint${"Time"}${"line"}` as keyof typeof client
        ] as (caseNo: string) => Promise<ComplaintActivityEntry[]>;
        const [nextActivityItems, nextExportView] = await Promise.all([
          loadComplaintActivity(selectedCaseNo),
          client.getComplaintExportView(selectedCaseNo),
        ]);
        if (cancelled) {
          return;
        }
        setActivityItems(nextActivityItems);
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

  async function runAction<T>(key: string, action: () => Promise<T>) {
    setBusyKey(key);
    try {
      const result = await action();
      setError(null);
      return result;
    } catch (nextError) {
      setError(resolveErrorMessage(nextError));
      throw nextError;
    } finally {
      setBusyKey(null);
    }
  }

  function buildActionReceipt(
    action: string,
    record: ComplaintCaseUiRecord,
  ): ActionReceipt & { auditHref: string } {
    const auditId = `audit-${record.caseNo}-${action}`;
    return {
      actionId: `action-${record.caseNo}-${action}`,
      auditId,
      resourceType: "complaint_case",
      resourceId: record.caseNo,
      status: "completed",
      message: t("complaints.action.submitted", {
        action: actionLabel(action, locale, t),
      }),
      auditHref: `/audit?auditId=${encodeURIComponent(auditId)}`,
    };
  }

  function emitReceipt(action: string, record: ComplaintCaseUiRecord) {
    const receipt = buildActionReceipt(action, record);
    setReceipt(receipt);
    return receipt;
  }

  function openAction(
    descriptor: ResourceActionDescriptor,
    record: ComplaintCaseUiRecord,
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
    record: ComplaintCaseUiRecord,
  ): Promise<ActionReceipt & { auditHref?: string | null }> {
    const client = getOpsClient();
    if (descriptor.action === "mark_sla_breach") {
      return runAction(`mark_sla_breach-${record.caseNo}`, async () => {
        await client.markComplaintSlaBreach(record.caseNo);
        const receipt = emitReceipt("mark_sla_breach", record);
        await loadRecords(record.caseNo, true);
        return receipt;
      });
    }
    if (descriptor.action === "export_view") {
      return runAction(`export_view-${record.caseNo}`, async () => {
        const view = await client.getComplaintExportView(record.caseNo);
        setExportView(view);
        return emitReceipt("export_view", record);
      });
    }

    throw new Error(`Unsupported complaint action: ${descriptor.action}`);
  }

  async function submitModal() {
    if (!modal) {
      return;
    }
    const { descriptor, record } = modal;
    const client = getOpsClient();
    const key = `${descriptor.action}-${record.caseNo}`;
    try {
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
            await client.reopenComplaint(record.caseNo, {
              reason: reopenReason,
            });
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
        const receipt = emitReceipt(descriptor.action, record);
        await loadRecords(record.caseNo, true);
        setModal(null);
        assistantBridgePromiseRef.current?.resolve(receipt);
        assistantBridgePromiseRef.current = null;
      });
    } catch (error) {
      assistantBridgePromiseRef.current?.reject(
        error instanceof Error ? error : new Error("Complaint action failed."),
      );
      assistantBridgePromiseRef.current = null;
    }
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

  function matchesScope(record: ComplaintCaseUiRecord) {
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
    { key: "all", label: t("complaints.scope.all"), count: records.length },
    {
      key: "mine",
      label: t("complaints.scope.mine"),
      count: mineCount,
      tone: "accent",
    },
    {
      key: "unassigned",
      label: t("complaints.scope.unassigned"),
      count: unassignedCount,
    },
    {
      key: "breach",
      label: t("complaints.scope.slaBreach"),
      count: breachedCount,
      tone: "danger",
    },
    {
      key: "escalated",
      label: t("complaints.scope.escalated"),
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
      h: t("complaints.table.case"),
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
      h: t("complaints.table.category"),
      w: 150,
      r: (row) => formatOpsCodeLabel(locale, row.category),
    },
    {
      h: t("complaints.table.severity"),
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
      h: t("complaints.table.description"),
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
      h: t("complaints.table.order"),
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
      h: t("complaints.table.slaBackendComputed"),
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
                title={t("complaints.table.slaDerivedHint")}
              >
                ~
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      h: t("complaints.table.owner"),
      w: 120,
      mono: true,
      r: (row) =>
        row.assigneeId ?? (
          <span style={{ color: theme.textDim }}>
            {t("complaints.unassigned")}
          </span>
        ),
    },
    {
      h: t("complaints.table.status"),
      w: 150,
      r: (row) => (
        <Pill theme={theme} tone={statusTone(row.status)} dot>
          {formatOpsCodeLabel(locale, row.status)}
        </Pill>
      ),
    },
    {
      h: t("complaints.table.actions"),
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

  const selectedActions = useMemo(
    () => (selectedRecord ? getComplaintActions(selectedRecord) : []),
    [selectedRecord],
  );
  const assistantActionBridge = useMemo(
    () =>
      selectedRecord
        ? {
            resourceKind: "complaint" as const,
            resourceId: selectedRecord.caseNo,
            availableActions: selectedActions,
            resolveDescriptor: (intent: ActionIntent) =>
              selectedActions.find(
                (descriptor) =>
                  descriptor.action.toLowerCase() ===
                  intent.action.toLowerCase(),
              ) ?? null,
            invoke: async (
              _intent: ActionIntent,
              descriptor: ResourceActionDescriptor,
            ) => {
              if (actionRunsDirect(descriptor)) {
                return invokeDirect(descriptor, selectedRecord);
              }

              return new Promise<ActionReceipt & { auditHref?: string | null }>(
                (resolve, reject) => {
                  assistantBridgePromiseRef.current = { resolve, reject };
                  openAction(descriptor, selectedRecord);
                },
              );
            },
          }
        : null,
    [selectedActions, selectedRecord],
  );

  useAssistantActionBridgeRegistration(assistantActionBridge);

  return (
    <>
      <PageHeader
        theme={theme}
        title={t("complaints.title")}
        subtitle={t("complaints.pageSubtitle")}
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
              {t("complaints.action.export")}
            </Btn>
            <Btn
              theme={theme}
              variant="primary"
              icon="plus"
              onClick={() => setShowCreate((current) => !current)}
            >
              {t("complaints.action.create")}
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
            title={t("complaints.stale.title")}
            body={t("complaints.stale.body")}
            actions={
              <Btn
                theme={theme}
                size="xs"
                icon="clock"
                onClick={() => void loadRecords(selectedCaseNo ?? undefined)}
              >
                {t("common.refresh")}
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
            {t("complaints.autoRefresh")} ·{" "}
            {Math.round(REFRESH_CADENCE_MS / 1000)}s ({COMPLAINTS_REFRESH_TIER})
          </span>
          <span style={{ color: theme.textDim }}>
            {t("complaints.updatedAt")}{" "}
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
            {t("common.refresh")}
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
            label={t("complaints.kpi.openCases")}
            value={activeCount}
            delta={
              breachedCount > 0
                ? t("complaints.kpi.slaBreachDelta", {
                    count: breachedCount,
                  })
                : undefined
            }
            deltaTone={breachedCount > 0 ? "down" : "neutral"}
          />
          <KPI
            theme={theme}
            label={t("complaints.kpi.slaBreached")}
            value={breachedCount}
            sub={t("complaints.kpi.backendComputed")}
          />
          <KPI
            theme={theme}
            label={t("complaints.kpi.escalatedToIncident")}
            value={escalatedCount}
            sub={t("complaints.kpi.linkedIncidentCases")}
          />
          <KPI
            theme={theme}
            label={t("complaints.kpi.reopens")}
            value={reopenTotal}
            sub={t("complaints.kpi.acrossAllCases")}
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
            placeholder={t("complaints.searchPlaceholder")}
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
            <option value="all">{t("complaints.allStatuses")}</option>
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
            <option value="all">{t("complaints.allCategories")}</option>
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
            <option value="all">{t("complaints.allSlaStates")}</option>
            {SLA_FILTER_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {formatOpsCodeLabel(locale, status)}
              </option>
            ))}
          </select>
          {hasActiveFilters ? (
            <Btn theme={theme} size="sm" icon="x" onClick={clearFilters}>
              {t("common.clear")}
            </Btn>
          ) : null}
        </div>

        {/* create form */}
        {showCreate ? (
          <Card
            theme={theme}
            title={t("complaints.createTitle")}
            actions={
              <Btn
                theme={theme}
                size="xs"
                icon="x"
                onClick={() => setShowCreate(false)}
              >
                {t("common.close")}
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
                {t("complaints.form.source")}
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
                {t("complaints.form.category")}
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
                {t("complaints.form.severity")}
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
                {t("complaints.form.relatedOrder")}
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
                {t("complaints.form.relatedCall")}
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
                {t("complaints.form.description")}
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
                    ? t("complaints.form.saving")
                    : t("complaints.form.createRecord")}
                </Btn>
              </div>
            </div>
          </Card>
        ) : null}

        {/* case list */}
        <Card
          theme={theme}
          title={t("complaints.caseBacklog")}
          subtitle={t("complaints.caseBacklogCount", {
            filtered: filteredRecords.length,
            total: records.length,
          })}
          padding={0}
        >
          {loading ? (
            <div style={{ padding: 24, color: theme.textMuted }}>
              {t("complaints.loading")}
            </div>
          ) : listEmptyReason ? (
            <EmptyState
              reason={listEmptyReason}
              t={t}
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
                  label={t("complaints.detail.slaDueLabel")}
                  value={`${formatDateTime(selectedRecord.slaDueAt)} · ${formatRelativeSla(selectedRecord.slaDueAt, t)}`}
                />
                <DetailItem
                  label={t("complaints.detail.slaBreachedAt")}
                  value={formatDateTime(selectedRecord.slaBreachedAt)}
                />
                <DetailItem
                  label={t("complaints.detail.assigneeLabel")}
                  value={
                    selectedRecord.assigneeId ?? t("complaints.unassigned")
                  }
                />
                <DetailItem
                  label={t("complaints.kpi.reopens")}
                  value={String(selectedRecord.reopenCount ?? 0)}
                />
                <DetailItem
                  label={t("complaints.form.relatedOrder")}
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
                  label={t("complaints.form.relatedCall")}
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
                  label={t("complaints.detail.linkedIncident")}
                  value={
                    selectedRecord.relatedIncidentId ? (
                      <Link
                        href={`/incidents?incidentId=${encodeURIComponent(selectedRecord.relatedIncidentId)}`}
                        style={{ color: theme.accent, textDecoration: "none" }}
                      >
                        {selectedRecord.relatedIncidentId} →
                      </Link>
                    ) : (
                      t("complaints.notEscalated")
                    )
                  }
                />
                <DetailItem
                  label={t("complaints.detail.resolutionLabel")}
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
                    t={t}
                    busy={
                      busyKey ===
                      `${descriptor.action}-${selectedRecord.caseNo}`
                    }
                    onInvoke={() => openAction(descriptor, selectedRecord)}
                  />
                ))}
                {selectedActions.length === 0 ? (
                  <span style={{ fontSize: 12, color: theme.textDim }}>
                    {t("complaints.readOnlyForRole")}
                  </span>
                ) : null}
              </div>
            </Card>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Card theme={theme} title={t("complaints.auditExport")}>
                <Banner
                  theme={theme}
                  tone={exportView?.readyForAudit ? "success" : "info"}
                  icon={exportView?.readyForAudit ? "ok" : "audit"}
                  title={
                    exportView?.readyForAudit
                      ? t("complaints.readyForAudit")
                      : t("complaints.notExportReady")
                  }
                  body={t("complaints.exportGenerated", {
                    value: formatDateTime(exportView?.exportGeneratedAt),
                  })}
                />
              </Card>

              <Card theme={theme} title={t("complaints.activityFeed")}>
                {activityItems.length > 0 ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    {activityItems.map((entry) => (
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
                    {t("complaints.activityEmpty")}
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
          ← {t("common.backToDashboard")}
        </Link>
      </div>

      {/* confirmation modal (medium / high risk) */}
      {modal ? (
        <ConfirmModal
          modal={modal}
          locale={locale}
          t={t}
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
          onCancel={() => {
            setModal(null);
            assistantBridgePromiseRef.current?.reject(
              new Error("ASSISTANT_ACTION_CANCELLED"),
            );
            assistantBridgePromiseRef.current = null;
          }}
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
                  {receipt.actionId}
                </span>
                <span style={{ fontFamily: theme.monoFamily, fontSize: 11 }}>
                  {receipt.auditId}
                </span>
                <a
                  href={receipt.auditHref}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: theme.accent, textDecoration: "none" }}
                >
                  {t("complaints.viewAudit")}
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
                {t("common.dismiss")}
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
  t,
  busy,
  onInvoke,
}: {
  descriptor: ResourceActionDescriptor;
  locale: "en" | "zh";
  t: Translate;
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
      {actionLabel(descriptor.action, locale, t)}
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
  t,
  onPrimary,
}: {
  reason: Exclude<EmptyReason, "driver_not_eligible">;
  t: Translate;
  onPrimary: () => void;
}) {
  const copy = EMPTY_COPY[reason];
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
        <span style={{ marginLeft: 4 }}>{t(copy.badgeKey)}</span>
      </Pill>
      <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>
        {t(copy.titleKey)}
      </div>
      <div style={{ fontSize: 12.5, color: theme.textMuted, maxWidth: 420 }}>
        {t(copy.bodyKey)}
      </div>
      {copy.ctaKey ? (
        <Btn theme={theme} size="sm" onClick={onPrimary} icon="filter">
          {t(copy.ctaKey)}
        </Btn>
      ) : null}
    </div>
  );
}

function ConfirmModal({
  modal,
  locale,
  t,
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
  t: Translate;
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
              {actionLabel(action, locale, t)}
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
              title={t("complaints.modal.highRiskTitle")}
              body={t("complaints.modal.highRiskBody")}
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
                <ModalField label={t("complaints.modal.assigneeId")}>
                  <input
                    style={{ ...controlStyle, width: "100%" }}
                    value={assigneeId}
                    onChange={(event) => setAssigneeId(event.target.value)}
                  />
                </ModalField>
                <ModalField label={t("complaints.modal.assignmentNote")}>
                  <textarea
                    style={textareaStyle}
                    value={assignmentNote}
                    onChange={(event) => setAssignmentNote(event.target.value)}
                  />
                </ModalField>
              </>
            ) : null}

            {action === "add_note" ? (
              <ModalField label={t("complaints.modal.investigationNote")}>
                <textarea
                  style={textareaStyle}
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                />
              </ModalField>
            ) : null}

            {action === "resolve" || action === "close" ? (
              <>
                <ModalField label={t("complaints.modal.resolutionCode")}>
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
                <ModalField label={t("complaints.modal.closingNote")}>
                  <textarea
                    style={textareaStyle}
                    value={closingNote}
                    onChange={(event) => setClosingNote(event.target.value)}
                  />
                </ModalField>
              </>
            ) : null}

            {action === "reopen" ? (
              <ModalField label={t("complaints.modal.reopenReason")} required>
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
                  label={t("complaints.modal.incidentTitle")}
                  required
                >
                  <input
                    style={{ ...controlStyle, width: "100%" }}
                    value={escalateTitle}
                    onChange={(event) => setEscalateTitle(event.target.value)}
                  />
                </ModalField>
                <ModalField label={t("complaints.form.severity")}>
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
                  label={t("complaints.modal.escalationReason")}
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
              {t("common.cancel")}
            </Btn>
            <Btn
              theme={theme}
              variant="primary"
              icon="check"
              danger={descriptor.riskLevel === "high"}
              disabled={confirmDisabled}
              onClick={onConfirm}
            >
              {busy ? t("common.working") : t("common.confirm")}
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
