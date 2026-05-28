/**
 * Reimbursement batch queue.
 *
 * Q-ADM12 promotes batches to a dedicated route with a 6-state state machine:
 *   draft → pending_approval → approved → exported → paid → reconciled
 *
 * The page consumes the raw list envelope directly so it can adopt the
 * UI-BE-006 runtime fields (`state`, `availableActions`, `emptyState`,
 * `refreshMetadata`) as soon as they appear, while still falling back to the
 * current `ReimbursementBatchRecord` shape.
 */

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { getRuntimeApiBaseUrl } from "@/lib/runtime-config";
import type {
  ApiListData,
  ApiSuccessEnvelope,
  CrossAppResourceLink,
  EmptyReason,
  EmptyStateEnvelope,
  MoneyAmount,
  ReimbursementBatchRecord,
  RefreshTier,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  CanvasTable,
  buildCanvasTheme,
} from "@drts/ui-web";
import type {
  CanvasShellNavItem,
  CanvasTableColumn,
  CanvasTheme,
  CanvasTone,
} from "@drts/ui-web";

const PLATFORM_THEME = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});
const REFRESH_TIER: RefreshTier = "medium_slow";
const REFRESH_CADENCE_MS: Record<RefreshTier, number> = {
  urgent: 5_000,
  fast: 3_000,
  dispatch: 5_000,
  medium: 15_000,
  medium_slow: 30_000,
  slow: 30_000,
  manual: 0,
};
const POLL_INTERVAL_MS = REFRESH_CADENCE_MS[REFRESH_TIER];
const STALE_AFTER_MS = POLL_INTERVAL_MS * 2;
const PENDING_BACKLOG_WARN_THRESHOLD = 3;
const EXPORT_STUCK_HOURS = 48;
const REIMBURSEMENT_STATES = [
  "draft",
  "pending_approval",
  "approved",
  "exported",
  "paid",
  "reconciled",
] as const;
type ReimbursementState = (typeof REIMBURSEMENT_STATES)[number];

const TAB_KEYS = ["all", "pending", "exported", "done"] as const;
type TabKey = (typeof TAB_KEYS)[number];

type BatchRow = ReimbursementBatchRecord & {
  derivedState: ReimbursementState;
  derivedScope: string;
  derivedScopeKind: "partner" | "tenant" | "forwarded" | "driver";
  submittedAt: string;
  updatedAt: string;
  availableActions: ResourceActionDescriptor[];
  approverLabel: string | null;
  exportArtifactUrl: string | null;
  opsMirrorLink: CrossAppResourceLink | null;
};

type TableRowBag = BatchRow & Record<string, unknown>;
type RawBatchRecord = ReimbursementBatchRecord &
  Partial<{
    state: ReimbursementState;
    availableActions: ResourceActionDescriptor[];
    submittedAt: string;
    updatedAt: string;
    approvedByActorId: string | null;
    approverActorId: string | null;
    exportArtifactUrl: string | null;
    opsMirrorLink: CrossAppResourceLink | null;
  }>;
type ListEnvelopeWithRuntime = ApiListData<RawBatchRecord> &
  Partial<{
    emptyState: EmptyStateEnvelope;
    refreshMetadata: UiRefreshMetadata;
  }>;

function deriveBatchState(batch: ReimbursementBatchRecord): ReimbursementState {
  if (batch.status === "paid") {
    return "paid";
  }
  if (batch.approvedAt) {
    return batch.remittanceProofId ? "exported" : "approved";
  }
  return batch.items.length === 0 ? "draft" : "pending_approval";
}

function deriveScope(batch: ReimbursementBatchRecord): {
  scope: string;
  kind: BatchRow["derivedScopeKind"];
} {
  const channel = batch.items.find((item) => item.channelKey)?.channelKey;
  if (channel === "partner_airport") {
    return {
      scope: `partner:${batch.items[0]?.orderId ?? batch.driverId}`,
      kind: "partner",
    };
  }
  if (channel === "forwarded_shadow") {
    return {
      scope: `forwarded:${batch.items[0]?.orderId ?? batch.driverId}`,
      kind: "forwarded",
    };
  }
  if (channel === "tenant_enterprise") {
    return {
      scope: `tenant:${batch.items[0]?.orderId ?? batch.driverId}`,
      kind: "tenant",
    };
  }
  return { scope: `driver:${batch.driverId}`, kind: "driver" };
}

function deriveAvailableActions(
  state: ReimbursementState,
): ResourceActionDescriptor[] {
  switch (state) {
    case "draft":
      return [
        {
          action: "submit_for_approval",
          enabled: false,
          riskLevel: "medium",
          disabledReasonCode: "pending_backend_support",
        },
      ];
    case "pending_approval":
      return [
        {
          action: "approve",
          enabled: true,
          riskLevel: "high",
          requiresReason: true,
        },
        {
          action: "export",
          enabled: false,
          riskLevel: "low",
          disabledReasonCode: "awaiting_approval",
        },
      ];
    case "approved":
      return [
        {
          action: "export",
          enabled: false,
          riskLevel: "low",
          disabledReasonCode: "pending_backend_support",
        },
        {
          action: "mark_paid",
          enabled: false,
          riskLevel: "high",
          requiresReason: true,
          disabledReasonCode: "export_required",
        },
      ];
    case "exported":
      return [
        {
          action: "mark_paid",
          enabled: true,
          riskLevel: "high",
          requiresReason: true,
        },
        {
          action: "mark_reconciled",
          enabled: false,
          riskLevel: "medium",
          disabledReasonCode: "pending_backend_support",
        },
      ];
    case "paid":
      return [
        {
          action: "mark_reconciled",
          enabled: false,
          riskLevel: "medium",
          disabledReasonCode: "pending_backend_support",
        },
      ];
    case "reconciled":
    default:
      return [];
  }
}

function isReimbursementState(value: unknown): value is ReimbursementState {
  return (
    typeof value === "string" &&
    REIMBURSEMENT_STATES.includes(value as ReimbursementState)
  );
}

function batchSubmittedAt(batch: ReimbursementBatchRecord): string {
  return batch.approvedAt ?? batch.paidAt ?? new Date(Date.now()).toISOString();
}

function batchUpdatedAt(batch: ReimbursementBatchRecord): string {
  return batch.paidAt ?? batch.approvedAt ?? batchSubmittedAt(batch);
}

function expandBatch(batch: RawBatchRecord): BatchRow {
  const derivedState = isReimbursementState(batch.state)
    ? batch.state
    : deriveBatchState(batch);
  const { scope, kind } = deriveScope(batch);
  return {
    ...batch,
    derivedState,
    derivedScope: scope,
    derivedScopeKind: kind,
    submittedAt: batch.submittedAt ?? batchSubmittedAt(batch),
    updatedAt: batch.updatedAt ?? batchUpdatedAt(batch),
    availableActions:
      batch.availableActions?.length !== undefined
        ? batch.availableActions
        : deriveAvailableActions(derivedState),
    approverLabel: batch.approvedByActorId ?? batch.approverActorId ?? null,
    exportArtifactUrl: batch.exportArtifactUrl ?? null,
    opsMirrorLink: batch.opsMirrorLink ?? null,
  };
}

function stateTone(state: ReimbursementState): CanvasTone {
  switch (state) {
    case "paid":
    case "reconciled":
      return "success";
    case "pending_approval":
      return "warn";
    case "draft":
      return "neutral";
    case "exported":
      return "accent";
    case "approved":
    default:
      return "info";
  }
}

function tabMatches(state: ReimbursementState, tab: TabKey): boolean {
  switch (tab) {
    case "all":
      return true;
    case "pending":
      return state === "pending_approval";
    case "exported":
      return state === "approved" || state === "exported";
    case "done":
      return state === "paid" || state === "reconciled";
  }
}

function formatMoney(money?: MoneyAmount | null) {
  if (!money) return "—";
  return `${money.amountMinor.toLocaleString()} ${money.currency}`;
}

function hoursSince(iso?: string | null) {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  return (Date.now() - time) / 3_600_000;
}

function viewportStyle(theme: CanvasTheme): React.CSSProperties {
  return { position: "fixed", inset: 0, zIndex: 10, background: theme.bg };
}

function pageBodyStyle(theme: CanvasTheme): React.CSSProperties {
  return {
    padding: "16px 24px 24px",
    display: "grid",
    gap: theme.sectGap,
  };
}

function nativeControlStyle(
  theme: CanvasTheme,
  options?: { mono?: boolean },
): React.CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 10px",
    borderRadius: 7,
    border: `1px solid ${theme.border}`,
    background: theme.bgRaised,
    color: theme.text,
    fontSize: 12.5,
    fontFamily: options?.mono ? theme.monoFamily : theme.fontFamily,
    lineHeight: 1.35,
  };
}

function emptyStateStyle(theme: CanvasTheme): React.CSSProperties {
  return {
    padding: 22,
    display: "grid",
    gap: 10,
    color: theme.textMuted,
    fontSize: 12.5,
  };
}

function cellStackStyle(options?: {
  mono?: boolean;
  align?: "left" | "right";
}): React.CSSProperties {
  return {
    display: "grid",
    gap: 4,
    minWidth: 0,
    whiteSpace: "normal",
    textAlign: options?.align ?? "left",
    fontFamily: options?.mono ? PLATFORM_THEME.monoFamily : undefined,
  };
}

function linkButtonStyle(
  theme: CanvasTheme,
  variant: "primary" | "secondary",
): React.CSSProperties {
  const primary = variant === "primary";
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 10px",
    fontSize: 12,
    height: 28,
    fontWeight: 500,
    background: primary ? theme.accent : theme.surface,
    color: primary ? "#fff" : theme.text,
    border: `1px solid ${primary ? theme.accent : theme.border}`,
    borderRadius: 7,
    lineHeight: 1,
    fontFamily: theme.fontFamily,
    textDecoration: "none",
    whiteSpace: "nowrap",
  };
}

type CopyBundle = {
  breadcrumbParent: string;
  pageTitle: string;
  pageSubtitle: string;
  backToPayments: string;
  refresh: string;
  refreshHint: (seconds: number) => string;
  freshness: {
    fresh: string;
    stale: string;
    degraded: string;
    unknown: string;
  };
  filtersTitle: string;
  filtersSubtitle: string;
  scopeLabel: string;
  scopePlaceholder: string;
  periodLabel: string;
  periodPlaceholder: string;
  resetFilters: string;
  filtersHint: string;
  tabAll: string;
  tabPending: string;
  tabExported: string;
  tabDone: string;
  state: Record<ReimbursementState, string>;
  scope: Record<BatchRow["derivedScopeKind"], string>;
  actionLabels: Record<string, string>;
  riskHint: Record<"low" | "medium" | "high", string>;
  disabledReason: Record<string, string>;
  pendingBacklog: { title: string; body: (count: number) => string };
  stuckExported: { title: string; body: (count: number) => string };
  fetchFailed: { title: string; body: string };
  empty: Record<EmptyReason, { title: string; body: string }>;
  kpi: {
    totalLabel: string;
    pendingLabel: string;
    exportedLabel: string;
    settledLabel: string;
    pendingAmount: string;
    settledAmount: string;
  };
  columns: {
    batch: string;
    scope: string;
    amount: string;
    state: string;
    submitter: string;
    approver: string;
    submitted: string;
    updated: string;
    actions: string;
    view: string;
  };
  defaultSubmitter: string;
  pendingActionLabel: string;
  opsRevenueLink: string;
  approveModalTitle: string;
  markPaidModalTitle: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  cancel: string;
  confirm: string;
  saving: string;
  remittanceLabel: string;
  remittancePlaceholder: string;
};

function buildCopy(locale: "en" | "zh"): CopyBundle {
  if (locale === "en") {
    return {
      breadcrumbParent: "Settlement & Reconciliation",
      pageTitle: "Reimbursement batches",
      pageSubtitle:
        "draft → pending_approval → approved → exported → paid → reconciled (Q-ADM12, 6-state machine)",
      backToPayments: "Back to settlement",
      refresh: "Refresh",
      refreshHint: (seconds) =>
        `auto refresh every ${seconds}s · T4 medium-slow`,
      freshness: {
        fresh: "fresh",
        stale: "stale",
        degraded: "degraded",
        unknown: "unknown",
      },
      filtersTitle: "Queue filters",
      filtersSubtitle:
        "Scope and period stay in the URL for shareable triage views.",
      scopeLabel: "Scope filter",
      scopePlaceholder: "partner:CTBC / tenant:tenant-001 / driver:drv-…",
      periodLabel: "Period (YYYY-MM)",
      periodPlaceholder: "2026-05",
      resetFilters: "Clear filters",
      filtersHint:
        "Tab + filter chips combine; clearing filters keeps the active tab.",
      tabAll: "All",
      tabPending: "Pending approval",
      tabExported: "Awaiting paid",
      tabDone: "Settled",
      state: {
        draft: "draft",
        pending_approval: "pending approval",
        approved: "approved",
        exported: "exported",
        paid: "paid",
        reconciled: "reconciled",
      },
      scope: {
        partner: "Partner",
        tenant: "Tenant",
        forwarded: "Forwarded",
        driver: "Driver",
      },
      actionLabels: {
        submit_for_approval: "Submit",
        approve: "Approve",
        export: "Export artifact",
        mark_paid: "Mark paid",
        mark_reconciled: "Mark reconciled",
      },
      riskHint: {
        low: "low risk · direct action",
        medium: "medium risk · confirm modal",
        high: "high risk · reason required",
      },
      disabledReason: {
        awaiting_approval: "blocked: needs approval first",
        export_required: "blocked: export artifact before marking paid",
        pending_backend_support: "waiting on runtime support",
      },
      pendingBacklog: {
        title: "Pending-approval backlog above threshold",
        body: (count) =>
          `${count} batch(es) waiting for an approver. Triage now or escalate so the queue does not stall.`,
      },
      stuckExported: {
        title: "Exported batches awaiting paid confirmation",
        body: (count) =>
          `${count} batch(es) have been in exported state for over ${EXPORT_STUCK_HOURS}h. Confirm external remittance before flipping the state.`,
      },
      fetchFailed: {
        title: "Could not load reimbursement batches",
        body: "Showing the last successful response if any. Retry to refresh.",
      },
      empty: {
        no_data: {
          title: "No reimbursement batches yet",
          body: "Once finance generates a batch from the reconciliation queue it will show up here.",
        },
        not_provisioned: {
          title: "Reimbursement workflow not provisioned",
          body: "This tenant has not opted into reimbursements. Configure in tenant settings before triaging here.",
        },
        fetch_failed: {
          title: "Could not load reimbursement batches",
          body: "The settlement service is unreachable. Retry, or check platform health.",
        },
        permission_denied: {
          title: "You do not have access to reimbursement batches",
          body: "Ask a super admin to grant pa_finance_gov before continuing.",
        },
        external_unavailable: {
          title: "External payout system unavailable",
          body: "Batches cannot be approved or exported until the external partner system recovers.",
        },
        driver_not_eligible: {
          title: "No driver-eligible batches",
          body: "This shouldn't appear in platform admin; surfacing it preserves the EmptyReason taxonomy.",
        },
        filtered_empty: {
          title: "No batches match the current filters",
          body: "Adjust scope, period, or tab to widen the result set.",
        },
      },
      kpi: {
        totalLabel: "Total batches",
        pendingLabel: "Pending approval",
        exportedLabel: "Awaiting paid",
        settledLabel: "Settled",
        pendingAmount: "pending amount",
        settledAmount: "settled amount",
      },
      columns: {
        batch: "Batch",
        scope: "Scope",
        amount: "Amount",
        state: "State",
        submitter: "Submitter",
        approver: "Approver",
        submitted: "Submitted",
        updated: "Updated",
        actions: "Actions",
        view: "Open",
      },
      defaultSubmitter: "finance.console (pa_finance_gov)",
      pendingActionLabel: "no actions",
      opsRevenueLink: "View ops mirror (new tab)",
      approveModalTitle: "Approve reimbursement batch",
      markPaidModalTitle: "Mark batch paid",
      reasonLabel: "Reason (required for high-risk action)",
      reasonPlaceholder: "Why is this safe to proceed?",
      cancel: "Cancel",
      confirm: "Confirm",
      saving: "Saving…",
      remittanceLabel: "Remittance proof id (optional)",
      remittancePlaceholder: "remit-2026-05-…",
    };
  }
  return {
    breadcrumbParent: "結算與帳務",
    pageTitle: "代墊批次 · Reimbursement batches",
    pageSubtitle:
      "draft → pending_approval → approved → exported → paid → reconciled (Q-ADM12 6 狀態 state machine)",
    backToPayments: "回結算治理",
    refresh: "重新整理",
    refreshHint: (seconds) => `每 ${seconds} 秒自動更新 · T4 medium-slow`,
    freshness: {
      fresh: "fresh",
      stale: "stale",
      degraded: "degraded",
      unknown: "未知",
    },
    filtersTitle: "Queue filters",
    filtersSubtitle: "篩選 scope 與 period；切換 tab 不會清掉這些 chip。",
    scopeLabel: "Scope 篩選",
    scopePlaceholder: "partner:CTBC / tenant:tenant-001 / driver:drv-…",
    periodLabel: "期間 (YYYY-MM)",
    periodPlaceholder: "2026-05",
    resetFilters: "清除篩選",
    filtersHint: "Tab + filter chip 會組合篩選；清除篩選不會切換 tab。",
    tabAll: "全部",
    tabPending: "Pending approval",
    tabExported: "Awaiting paid",
    tabDone: "已結清",
    state: {
      draft: "draft",
      pending_approval: "pending_approval",
      approved: "approved",
      exported: "exported",
      paid: "paid",
      reconciled: "reconciled",
    },
    scope: {
      partner: "Partner",
      tenant: "Tenant",
      forwarded: "Forwarded",
      driver: "Driver",
    },
    actionLabels: {
      submit_for_approval: "送審",
      approve: "核准",
      export: "匯出檔案",
      mark_paid: "標記已付",
      mark_reconciled: "標記已對帳",
    },
    riskHint: {
      low: "low · 直接執行",
      medium: "medium · 需確認",
      high: "high · 需填理由",
    },
    disabledReason: {
      awaiting_approval: "blocked: 需先核准",
      export_required: "blocked: 需先匯出批次",
      pending_backend_support: "等待後端支援",
    },
    pendingBacklog: {
      title: "Pending-approval 積壓過高",
      body: (count) =>
        `${count} 筆批次等候核准；請即時處理或向上呈報，避免隊列停滯。`,
    },
    stuckExported: {
      title: "Exported 狀態待付款卡關",
      body: (count) =>
        `${count} 筆批次已進入 exported 超過 ${EXPORT_STUCK_HOURS} 小時，請確認外部匯款後再切換狀態。`,
    },
    fetchFailed: {
      title: "無法載入代墊批次",
      body: "顯示上一次成功的快照(若有)。請重試或檢查平台健康。",
    },
    empty: {
      no_data: {
        title: "尚無代墊批次",
        body: "財務在 reconciliation queue 產生批次後會出現在這裡。",
      },
      not_provisioned: {
        title: "尚未啟用代墊流程",
        body: "此租戶尚未啟用代墊作業，請於 tenant 設定啟用後再進行 triage。",
      },
      fetch_failed: {
        title: "無法載入代墊批次",
        body: "結算服務不可用，請重試或檢查平台健康。",
      },
      permission_denied: {
        title: "未授權檢視代墊批次",
        body: "請洽 super admin 授予 pa_finance_gov 後再操作。",
      },
      external_unavailable: {
        title: "外部支付系統不可用",
        body: "在外部 partner 系統恢復前，批次無法核准或匯出。",
      },
      driver_not_eligible: {
        title: "無 driver-eligible 批次",
        body: "Platform admin 不應出現此狀態；此卡片保留 EmptyReason 完整 6 態。",
      },
      filtered_empty: {
        title: "目前篩選條件下沒有批次",
        body: "請調整 scope / period 或切換 tab 擴大結果集。",
      },
    },
    kpi: {
      totalLabel: "全部批次",
      pendingLabel: "待核准",
      exportedLabel: "待付款",
      settledLabel: "已結清",
      pendingAmount: "待付金額",
      settledAmount: "已結金額",
    },
    columns: {
      batch: "BATCH",
      scope: "SCOPE",
      amount: "AMOUNT",
      state: "STATE",
      submitter: "SUBMITTER",
      approver: "APPROVER",
      submitted: "SUBMITTED",
      updated: "UPDATED",
      actions: "ACTIONS",
      view: "查看",
    },
    defaultSubmitter: "finance.console (pa_finance_gov)",
    pendingActionLabel: "無可用動作",
    opsRevenueLink: "在 ops mirror 開啟 (new tab)",
    approveModalTitle: "核准代墊批次",
    markPaidModalTitle: "標記批次已付",
    reasonLabel: "原因 (high-risk 操作必填)",
    reasonPlaceholder: "為何此操作可放行？",
    cancel: "取消",
    confirm: "確認",
    saving: "處理中…",
    remittanceLabel: "Remittance proof id (選填)",
    remittancePlaceholder: "remit-2026-05-…",
  };
}

type PendingActionState =
  | { action: "approve"; batch: BatchRow }
  | { action: "mark_paid"; batch: BatchRow }
  | { action: "export"; batch: BatchRow }
  | { action: "mark_reconciled"; batch: BatchRow }
  | { action: "submit_for_approval"; batch: BatchRow }
  | null;

export default function ReimbursementBatchQueuePage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const apiBaseUrl = getRuntimeApiBaseUrl();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const theme = PLATFORM_THEME;
  const copy = useMemo(() => buildCopy(locale), [locale]);

  const [batches, setBatches] = useState<RawBatchRecord[]>([]);
  const [refreshMetadata, setRefreshMetadata] = useState<UiRefreshMetadata>({
    generatedAt: new Date().toISOString(),
    staleAfterMs: STALE_AFTER_MS,
    dataFreshness: "unknown",
    source: "live",
  });
  const [tab, setTab] = useState<TabKey>(
    TAB_KEYS.includes((searchParams.get("tab") as TabKey) ?? "all")
      ? ((searchParams.get("tab") as TabKey) ?? "all")
      : "all",
  );
  const [scopeFilter, setScopeFilter] = useState(
    searchParams.get("scope") ?? "",
  );
  const [periodFilter, setPeriodFilter] = useState(
    searchParams.get("period") ?? "",
  );
  const [stateFilter, setStateFilter] = useState<ReimbursementState | "">(
    (() => {
      const initialState = searchParams.get("state");
      return isReimbursementState(initialState) ? initialState : "";
    })(),
  );
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<EmptyReason | null>(null);
  const [emptyReasonFromServer, setEmptyReasonFromServer] =
    useState<EmptyReason | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingActionState>(null);
  const [actionReason, setActionReason] = useState("");
  const [remittanceProofId, setRemittanceProofId] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadBatches = useCallback(async () => {
    setLoading((current) => current || batches.length === 0);
    try {
      const params = new URLSearchParams();
      if (periodFilter) params.set("periodMonth", periodFilter);
      const url = `${apiBaseUrl}/api/reimbursements${
        params.toString() ? `?${params.toString()}` : ""
      }`;
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const payload =
        (await response.json()) as ApiSuccessEnvelope<ListEnvelopeWithRuntime>;
      if (!response.ok) {
        const errorBody = payload as unknown as {
          error?: { message?: string; code?: string };
        };
        throw new Error(errorBody.error?.message ?? `HTTP ${response.status}`);
      }
      const listData = payload.data;
      setBatches(listData?.items ?? []);
      setEmptyReasonFromServer(listData?.emptyState?.reason ?? null);
      setRefreshMetadata(
        listData?.refreshMetadata ?? {
          generatedAt: new Date().toISOString(),
          staleAfterMs: STALE_AFTER_MS,
          dataFreshness: "fresh",
          source: "live",
        },
      );
      setFetchError(null);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      const reason: EmptyReason = /401|403|forbidden/i.test(message)
        ? "permission_denied"
        : /503|unavailable/i.test(message)
          ? "external_unavailable"
          : "fetch_failed";
      setFetchError(reason);
      setEmptyReasonFromServer(null);
      setRefreshMetadata((current) => ({
        ...current,
        dataFreshness: "degraded",
      }));
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, batches.length, periodFilter]);

  useEffect(() => {
    void loadBatches();
    if (POLL_INTERVAL_MS <= 0) {
      return;
    }
    const id = window.setInterval(() => {
      void loadBatches();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [loadBatches]);

  useEffect(() => {
    const query = new URLSearchParams(searchParams.toString());
    if (tab === "all") query.delete("tab");
    else query.set("tab", tab);
    if (scopeFilter) query.set("scope", scopeFilter);
    else query.delete("scope");
    if (periodFilter) query.set("period", periodFilter);
    else query.delete("period");
    if (stateFilter) query.set("state", stateFilter);
    else query.delete("state");
    const next = query.toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(next ? `${pathname}?${next}` : pathname, {
        scroll: false,
      });
    }
  }, [
    pathname,
    periodFilter,
    router,
    scopeFilter,
    searchParams,
    stateFilter,
    tab,
  ]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setRefreshMetadata((current) => {
        if (!current.generatedAt || current.dataFreshness === "degraded") {
          return current;
        }
        const ageMs = Date.now() - Date.parse(current.generatedAt);
        if (Number.isNaN(ageMs) || ageMs < current.staleAfterMs) {
          return current;
        }
        if (current.dataFreshness === "stale") {
          return current;
        }
        return { ...current, dataFreshness: "stale" };
      });
    }, 1_000);
    return () => window.clearInterval(id);
  }, []);

  const rows = useMemo(() => batches.map(expandBatch), [batches]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (!tabMatches(row.derivedState, tab)) return false;
      if (stateFilter && row.derivedState !== stateFilter) return false;
      if (
        scopeFilter &&
        !row.derivedScope.toLowerCase().includes(scopeFilter.toLowerCase())
      ) {
        return false;
      }
      if (periodFilter && !row.periodMonth.startsWith(periodFilter)) {
        return false;
      }
      return true;
    });
  }, [rows, tab, scopeFilter, periodFilter]);

  const counts = useMemo(() => {
    const result: Record<TabKey, number> = {
      all: rows.length,
      pending: 0,
      exported: 0,
      done: 0,
    };
    for (const row of rows) {
      if (row.derivedState === "pending_approval") result.pending += 1;
      if (row.derivedState === "exported") result.exported += 1;
      if (row.derivedState === "paid" || row.derivedState === "reconciled")
        result.done += 1;
    }
    return result;
  }, [rows]);

  const pendingBacklogCount = counts.pending;
  const stuckExportedCount = rows.filter((row) => {
    if (row.derivedState !== "exported") return false;
    const age = hoursSince(row.approvedAt);
    return age !== null && age >= EXPORT_STUCK_HOURS;
  }).length;

  const navLabels =
    locale === "en"
      ? {
          home: "Home",
          health: "Health & Alerts",
          tenantGroup: "Tenant Governance",
          tenants: "Tenants",
          partners: "Partners",
          users: "Users",
          fleetGroup: "Fleet & Compliance",
          fleet: "Fleet & Devices",
          switchboard: "Switchboard",
          pricingGroup: "Pricing & Settlement",
          pricing: "Pricing",
          payments: "Payments",
          reimbursements: "Reimbursements",
          platformGroup: "Platform Layer",
          notices: "Notices",
          audit: "Audit Trail",
          flags: "Feature Flags",
          adapters: "Adapter Registry",
        }
      : {
          home: "工作首頁",
          health: "平台健康",
          tenantGroup: "租戶治理",
          tenants: "租戶",
          partners: "合作夥伴",
          users: "平台人員",
          fleetGroup: "車隊與合規",
          fleet: "車隊與設備",
          switchboard: "法定資訊與牌貼",
          pricingGroup: "計價與結算",
          pricing: "計價",
          payments: "結算治理",
          reimbursements: "代墊批次",
          platformGroup: "平台層",
          notices: "公告與維護",
          audit: "稽核軌跡",
          flags: "功能旗標",
          adapters: "介接登錄",
        };

  const shellNav: CanvasShellNavItem[] = [
    { key: "home", href: "/", label: navLabels.home, icon: "dashboard" },
    { key: "health", href: "/health", label: navLabels.health, icon: "health" },
    { divider: navLabels.tenantGroup },
    {
      key: "tenants",
      href: "/tenants",
      label: navLabels.tenants,
      icon: "tenants",
    },
    {
      key: "partners",
      href: "/partners",
      label: navLabels.partners,
      icon: "partners",
    },
    { key: "users", href: "/users", label: navLabels.users, icon: "users" },
    { divider: navLabels.fleetGroup },
    { key: "fleet", href: "/fleet", label: navLabels.fleet, icon: "fleet" },
    {
      key: "switchboard",
      href: "/switchboard",
      label: navLabels.switchboard,
      icon: "switchboard",
    },
    { divider: navLabels.pricingGroup },
    {
      key: "pricing",
      href: "/pricing",
      label: navLabels.pricing,
      icon: "pricing",
    },
    {
      key: "payments",
      href: "/payments",
      label: navLabels.payments,
      icon: "payments",
      matchPaths: ["/payments"],
    },
    {
      key: "reimbursements",
      href: "/payments/reimbursements",
      label: navLabels.reimbursements,
      icon: "billing",
      badge: counts.pending > 0 ? String(counts.pending) : undefined,
      badgeTone: counts.pending > 0 ? "warn" : "neutral",
      matchPaths: ["/payments/reimbursements"],
    },
    { divider: navLabels.platformGroup },
    {
      key: "notices",
      href: "/notices",
      label: navLabels.notices,
      icon: "notices",
    },
    { key: "audit", href: "/audit", label: navLabels.audit, icon: "audit" },
    {
      key: "flags",
      href: "/feature-flags",
      label: navLabels.flags,
      icon: "flags",
    },
    {
      key: "adapters",
      href: "/adapter-registry",
      label: navLabels.adapters,
      icon: "adapters",
    },
  ];

  const tabs: ReactTabEntry[] = [
    { key: "all", label: copy.tabAll, badge: counts.all },
    {
      key: "pending",
      label: copy.tabPending,
      badge: counts.pending,
      tone: counts.pending > 0 ? "warn" : "neutral",
    },
    {
      key: "exported",
      label: copy.tabExported,
      badge: counts.exported,
      tone: counts.exported > 0 ? "accent" : "neutral",
    },
    { key: "done", label: copy.tabDone, badge: counts.done, tone: "success" },
  ];

  const renderedTabs = tabs.map((entry) => (
    <button
      key={entry.key}
      type="button"
      onClick={() => setTab(entry.key)}
      style={{
        display: "inline-flex",
        gap: 6,
        alignItems: "center",
        background: "transparent",
        border: "none",
        padding: 0,
        margin: 0,
        cursor: "pointer",
        color: tab === entry.key ? theme.accent : theme.text,
        fontWeight: tab === entry.key ? 700 : 500,
      }}
    >
      <span>{entry.label}</span>
      <CanvasPill theme={theme} tone={entry.tone ?? "neutral"}>
        {String(entry.badge)}
      </CanvasPill>
    </button>
  ));
  const activeTabNode = renderedTabs[TAB_KEYS.indexOf(tab)];

  function openAction(action: ResourceActionDescriptor, batch: BatchRow) {
    if (!action.enabled) return;
    setActionReason("");
    setRemittanceProofId(batch.remittanceProofId ?? "");
    setActionError(null);
    if (
      action.action === "approve" ||
      action.action === "mark_paid" ||
      action.action === "export" ||
      action.action === "mark_reconciled" ||
      action.action === "submit_for_approval"
    ) {
      setPendingAction({ action: action.action, batch });
    }
  }

  function closeAction() {
    if (actionBusy) return;
    setPendingAction(null);
    setActionReason("");
    setRemittanceProofId("");
    setActionError(null);
  }

  async function runAction() {
    if (!pendingAction) return;
    setActionBusy(true);
    setActionError(null);
    try {
      if (pendingAction.action === "approve") {
        if (!actionReason.trim()) {
          throw new Error(copy.reasonLabel);
        }
        await client.approveReimbursementBatch(pendingAction.batch.batchId, {
          statementId: pendingAction.batch.statementId,
        });
      } else if (pendingAction.action === "mark_paid") {
        if (!actionReason.trim()) {
          throw new Error(copy.reasonLabel);
        }
        await client.markReimbursementPaid(pendingAction.batch.batchId, {
          remittanceProofId:
            remittanceProofId.trim() ||
            `remit-${pendingAction.batch.batchId.slice(-8)}`,
          paidAt: new Date().toISOString(),
        });
      } else {
        throw new Error(
          locale === "en"
            ? "Action not wired to backend yet; waiting on UI-BE-006 follow-up."
            : "後端尚未支援此動作，等待 UI-BE-006 後續實作。",
        );
      }
      await loadBatches();
      setPendingAction(null);
      setActionReason("");
      setRemittanceProofId("");
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  }

  const columns: CanvasTableColumn<TableRowBag>[] = [
    {
      h: copy.columns.batch,
      w: 220,
      mono: true,
      r: (row) => (
        <div style={cellStackStyle({ mono: true })}>
          <Link
            href={`/payments/reimbursements/${encodeURIComponent(row.batchId)}`}
            style={{
              color: theme.accent,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            {row.batchId}
          </Link>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {row.periodMonth}
          </span>
        </div>
      ),
    },
    {
      h: copy.columns.scope,
      w: 200,
      mono: true,
      r: (row) => (
        <div style={cellStackStyle({ mono: true })}>
          <CanvasPill theme={theme} tone="info">
            {copy.scope[row.derivedScopeKind]}
          </CanvasPill>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {row.derivedScope}
          </span>
        </div>
      ),
    },
    {
      h: copy.columns.amount,
      w: 160,
      mono: true,
      r: (row) => formatMoney(row.totalAmount),
    },
    {
      h: copy.columns.state,
      w: 170,
      r: (row) => (
        <CanvasPill theme={theme} tone={stateTone(row.derivedState)} dot>
          {copy.state[row.derivedState]}
        </CanvasPill>
      ),
    },
    {
      h: copy.columns.submitter,
      w: 180,
      r: (row) => (
        <div style={cellStackStyle()}>
          <span>{copy.defaultSubmitter}</span>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            driver:{row.driverId}
          </span>
        </div>
      ),
    },
    {
      h: copy.columns.approver,
      w: 150,
      r: (row) => (
        <div style={cellStackStyle()}>
          <span>{row.approverLabel ?? "—"}</span>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {row.approvedAt ? formatDateTime(row.approvedAt) : "pending"}
          </span>
        </div>
      ),
    },
    {
      h: copy.columns.submitted,
      w: 160,
      mono: true,
      r: (row) => formatDateTime(row.submittedAt),
    },
    {
      h: copy.columns.updated,
      w: 160,
      mono: true,
      r: (row) => formatDateTime(row.updatedAt),
    },
    {
      h: copy.columns.actions,
      w: 230,
      r: (row) => (
        <div style={{ display: "grid", gap: 6, minWidth: 180 }}>
          {row.availableActions.length === 0 ? (
            <span style={{ color: theme.textMuted, fontSize: 11 }}>
              {copy.pendingActionLabel}
            </span>
          ) : (
            row.availableActions.map((descriptor) => {
              const tooltip = descriptor.enabled
                ? copy.riskHint[descriptor.riskLevel]
                : (copy.disabledReason[descriptor.disabledReasonCode ?? ""] ??
                  copy.disabledReason.awaiting_approval);
              return (
                <span
                  key={`${row.batchId}:${descriptor.action}`}
                  title={tooltip}
                  style={{ display: "inline-flex" }}
                >
                  <CanvasBtn
                    theme={theme}
                    size="xs"
                    variant={
                      descriptor.riskLevel === "high" ? "primary" : "secondary"
                    }
                    disabled={!descriptor.enabled}
                    onClick={() => openAction(descriptor, row)}
                  >
                    {copy.actionLabels[descriptor.action] ?? descriptor.action}
                  </CanvasBtn>
                </span>
              );
            })
          )}
          <Link
            href={`/payments/reimbursements/${encodeURIComponent(row.batchId)}`}
            style={{
              color: theme.accent,
              fontSize: 11,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            {copy.columns.view} →
          </Link>
          {row.exportArtifactUrl ? (
            <a
              href={row.exportArtifactUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                color: theme.textMuted,
                fontSize: 11,
                textDecoration: "none",
              }}
            >
              artifact ↗
            </a>
          ) : null}
        </div>
      ),
    },
  ];

  const emptyReason: EmptyReason = (() => {
    if (fetchError) return fetchError;
    if (rows.length === 0) return emptyReasonFromServer ?? "no_data";
    if (filteredRows.length === 0) return "filtered_empty";
    return "no_data";
  })();

  const refreshSeconds = Math.round(POLL_INTERVAL_MS / 1000);
  const freshnessLabel = copy.freshness[refreshMetadata.dataFreshness];
  const lastGenerated = formatDateTime(refreshMetadata.generatedAt);

  return (
    <div style={viewportStyle(theme)}>
      <CanvasShell
        theme={theme}
        nav={shellNav}
        active="reimbursements"
        brandLabel={t("app.name")}
        brandSubLabel={t("app.sub")}
        breadcrumb={[copy.breadcrumbParent, copy.pageTitle]}
        env="production"
        versionLabel="canvas"
        searchPlaceholder={locale === "en" ? "Search batches…" : "搜尋批次…"}
        avatarLabel={locale === "en" ? "FA" : "財務"}
        style={{ height: "100%" }}
      >
        <CanvasPageHeader
          theme={theme}
          title={copy.pageTitle}
          subtitle={copy.pageSubtitle}
          tabs={renderedTabs}
          activeTab={activeTabNode}
          actions={
            <>
              <Link
                href="/payments"
                style={linkButtonStyle(theme, "secondary")}
              >
                {copy.backToPayments}
              </Link>
              <a
                href="https://ops.drts.io/revenue"
                target="_blank"
                rel="noreferrer"
                style={linkButtonStyle(theme, "secondary")}
              >
                {copy.opsRevenueLink}
              </a>
              <CanvasBtn
                theme={theme}
                variant="primary"
                icon="refresh"
                onClick={() => void loadBatches()}
                disabled={loading}
              >
                {copy.refresh}
              </CanvasBtn>
            </>
          }
        />

        <div style={pageBodyStyle(theme)}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 10,
              color: theme.textMuted,
              fontSize: 12,
            }}
          >
            <CanvasPill
              theme={theme}
              tone={
                refreshMetadata.dataFreshness === "fresh"
                  ? "success"
                  : refreshMetadata.dataFreshness === "stale"
                    ? "warn"
                    : refreshMetadata.dataFreshness === "degraded"
                      ? "danger"
                      : "neutral"
              }
              dot
            >
              {freshnessLabel}
            </CanvasPill>
            <span>{copy.refreshHint(refreshSeconds)}</span>
            <span style={{ fontFamily: theme.monoFamily }}>
              · {lastGenerated}
            </span>
            <CanvasPill theme={theme} tone="warn">
              {copy.tabPending}: {counts.pending}
            </CanvasPill>
            <CanvasPill theme={theme} tone="accent">
              {copy.tabExported}: {counts.exported}
            </CanvasPill>
            <CanvasPill theme={theme} tone="success">
              {copy.tabDone}: {counts.done}
            </CanvasPill>
          </div>

          {fetchError ? (
            <CanvasBanner
              theme={theme}
              tone="danger"
              title={copy.fetchFailed.title}
              body={copy.fetchFailed.body}
            />
          ) : null}

          {pendingBacklogCount >= PENDING_BACKLOG_WARN_THRESHOLD ? (
            <CanvasBanner
              theme={theme}
              tone="warn"
              title={copy.pendingBacklog.title}
              body={copy.pendingBacklog.body(pendingBacklogCount)}
            />
          ) : null}

          {stuckExportedCount > 0 ? (
            <CanvasBanner
              theme={theme}
              tone="warn"
              title={copy.stuckExported.title}
              body={copy.stuckExported.body(stuckExportedCount)}
            />
          ) : null}

          <CanvasCard
            theme={theme}
            title={copy.pageTitle}
            subtitle={`${filteredRows.length} / ${rows.length}`}
            padding={0}
          >
            <div
              style={{ padding: 16, borderBottom: `1px solid ${theme.border}` }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 12,
                  alignItems: "end",
                }}
              >
                <CanvasField theme={theme} label={copy.scopeLabel}>
                  <input
                    value={scopeFilter}
                    onChange={(event) => setScopeFilter(event.target.value)}
                    placeholder={copy.scopePlaceholder}
                    style={nativeControlStyle(theme, { mono: true })}
                  />
                </CanvasField>
                <CanvasField theme={theme} label={copy.periodLabel}>
                  <input
                    value={periodFilter}
                    onChange={(event) => setPeriodFilter(event.target.value)}
                    placeholder={copy.periodPlaceholder}
                    style={nativeControlStyle(theme, { mono: true })}
                  />
                </CanvasField>
                <CanvasField
                  theme={theme}
                  label={locale === "en" ? "Exact state" : "狀態篩選"}
                >
                  <select
                    value={stateFilter}
                    onChange={(event) =>
                      setStateFilter(
                        isReimbursementState(event.target.value)
                          ? event.target.value
                          : "",
                      )
                    }
                    style={nativeControlStyle(theme, { mono: true })}
                  >
                    <option value="">
                      {locale === "en" ? "All states" : "全部狀態"}
                    </option>
                    {REIMBURSEMENT_STATES.map((state) => (
                      <option key={state} value={state}>
                        {copy.state[state]}
                      </option>
                    ))}
                  </select>
                </CanvasField>
                <div style={{ display: "flex", gap: 8 }}>
                  <CanvasBtn
                    theme={theme}
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setTab("all");
                      setStateFilter("");
                      setScopeFilter("");
                      setPeriodFilter("");
                    }}
                  >
                    {copy.resetFilters}
                  </CanvasBtn>
                </div>
              </div>
              <p
                style={{
                  margin: "10px 0 0",
                  color: theme.textMuted,
                  fontSize: 11.5,
                  lineHeight: 1.5,
                }}
              >
                {copy.filtersHint}
              </p>
            </div>
            {filteredRows.length > 0 ? (
              <CanvasTable
                theme={theme}
                columns={columns}
                rows={filteredRows as TableRowBag[]}
              />
            ) : (
              <EmptyState
                theme={theme}
                copy={copy}
                reason={emptyReason}
                onReset={() => {
                  setTab("all");
                  setStateFilter("");
                  setScopeFilter("");
                  setPeriodFilter("");
                }}
                onRetry={() => void loadBatches()}
                locale={locale}
              />
            )}
          </CanvasCard>
        </div>

        {pendingAction ? (
          <ActionModal
            theme={theme}
            copy={copy}
            pendingAction={pendingAction}
            actionReason={actionReason}
            onReasonChange={setActionReason}
            remittanceProofId={remittanceProofId}
            onRemittanceChange={setRemittanceProofId}
            actionBusy={actionBusy}
            actionError={actionError}
            onCancel={closeAction}
            onConfirm={() => void runAction()}
            locale={locale}
          />
        ) : null}
      </CanvasShell>
    </div>
  );
}

interface ReactTabEntry {
  key: TabKey;
  label: string;
  badge: number;
  tone?: CanvasTone;
}

function EmptyState({
  theme,
  copy,
  reason,
  onReset,
  onRetry,
  locale,
}: {
  theme: CanvasTheme;
  copy: CopyBundle;
  reason: EmptyReason;
  onReset: () => void;
  onRetry: () => void;
  locale: "en" | "zh";
}) {
  const meta = copy.empty[reason];
  const tone: CanvasTone =
    reason === "no_data" || reason === "filtered_empty"
      ? "neutral"
      : reason === "fetch_failed" || reason === "external_unavailable"
        ? "danger"
        : reason === "permission_denied"
          ? "warn"
          : reason === "not_provisioned"
            ? "info"
            : "neutral";
  const showRetry =
    reason === "fetch_failed" || reason === "external_unavailable";
  const showReset = reason === "filtered_empty";

  return (
    <div style={emptyStateStyle(theme)}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <CanvasPill theme={theme} tone={tone} dot>
          {reason}
        </CanvasPill>
        <strong style={{ fontSize: 13, color: theme.text }}>
          {meta.title}
        </strong>
      </div>
      <p style={{ margin: 0, lineHeight: 1.5 }}>{meta.body}</p>
      <div style={{ display: "flex", gap: 8 }}>
        {showRetry ? (
          <CanvasBtn
            theme={theme}
            variant="primary"
            icon="refresh"
            onClick={onRetry}
          >
            {locale === "en" ? "Retry" : "重試"}
          </CanvasBtn>
        ) : null}
        {showReset ? (
          <CanvasBtn
            theme={theme}
            variant="secondary"
            icon="x"
            onClick={onReset}
          >
            {copy.resetFilters}
          </CanvasBtn>
        ) : null}
      </div>
    </div>
  );
}

function ActionModal({
  theme,
  copy,
  pendingAction,
  actionReason,
  onReasonChange,
  remittanceProofId,
  onRemittanceChange,
  actionBusy,
  actionError,
  onCancel,
  onConfirm,
  locale,
}: {
  theme: CanvasTheme;
  copy: CopyBundle;
  pendingAction: Exclude<PendingActionState, null>;
  actionReason: string;
  onReasonChange: (value: string) => void;
  remittanceProofId: string;
  onRemittanceChange: (value: string) => void;
  actionBusy: boolean;
  actionError: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  locale: "en" | "zh";
}) {
  const isHighRisk =
    pendingAction.action === "approve" || pendingAction.action === "mark_paid";
  const title =
    pendingAction.action === "approve"
      ? copy.approveModalTitle
      : pendingAction.action === "mark_paid"
        ? copy.markPaidModalTitle
        : (copy.actionLabels[pendingAction.action] ?? pendingAction.action);
  const showRemittance = pendingAction.action === "mark_paid";

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 50,
      }}
    >
      <div
        style={{
          width: 460,
          maxWidth: "100%",
          borderRadius: 14,
          border: `1px solid ${theme.border}`,
          background: theme.surface,
          color: theme.text,
          padding: 20,
          boxShadow: "0 30px 60px rgba(15,23,42,0.35)",
          display: "grid",
          gap: 12,
        }}
      >
        <header style={{ display: "grid", gap: 4 }}>
          <strong style={{ fontSize: 15 }}>{title}</strong>
          <span style={{ color: theme.textMuted, fontSize: 12 }}>
            {pendingAction.batch.batchId} · {pendingAction.batch.derivedScope}
          </span>
        </header>
        <CanvasDL
          theme={theme}
          cols={1}
          items={[
            {
              k: copy.columns.amount,
              v: formatMoney(pendingAction.batch.totalAmount),
              mono: true,
            },
            {
              k: copy.columns.state,
              v: copy.state[pendingAction.batch.derivedState],
              mono: true,
            },
            { k: copy.columns.submitter, v: copy.defaultSubmitter },
          ]}
        />
        {showRemittance ? (
          <CanvasField theme={theme} label={copy.remittanceLabel}>
            <input
              value={remittanceProofId}
              onChange={(event) => onRemittanceChange(event.target.value)}
              placeholder={copy.remittancePlaceholder}
              style={nativeControlStyle(theme, { mono: true })}
            />
          </CanvasField>
        ) : null}
        {isHighRisk ? (
          <CanvasField theme={theme} label={copy.reasonLabel} required>
            <textarea
              value={actionReason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder={copy.reasonPlaceholder}
              style={{
                ...nativeControlStyle(theme),
                minHeight: 80,
                resize: "vertical",
              }}
            />
          </CanvasField>
        ) : null}
        {actionError ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={locale === "en" ? "Action failed" : "操作失敗"}
            body={actionError}
          />
        ) : null}
        <footer style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <CanvasBtn
            theme={theme}
            variant="secondary"
            onClick={onCancel}
            disabled={actionBusy}
          >
            {copy.cancel}
          </CanvasBtn>
          <CanvasBtn
            theme={theme}
            variant="primary"
            onClick={onConfirm}
            disabled={actionBusy || (isHighRisk && !actionReason.trim())}
          >
            {actionBusy ? copy.saving : copy.confirm}
          </CanvasBtn>
        </footer>
      </div>
    </div>
  );
}
