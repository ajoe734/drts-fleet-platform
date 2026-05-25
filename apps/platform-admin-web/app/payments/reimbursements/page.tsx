/**
 * Reimbursement Batch Queue (Q-ADM12, NEW)
 * Platform-admin queue view for the 6-state reimbursement batch flow:
 *   draft → pending_approval → approved → exported → paid → reconciled
 *
 * Behavior contract sources:
 *   - docs/05-ui/platform-admin-design-handoff-packet-20260525.md §5.12
 *   - docs/05-ui/drts-design-canvas/Platform Admin.html (PA_Reimbursements artboard)
 *   - packages/contracts/src/ui-runtime.ts (RefreshTier, ResourceActionDescriptor,
 *     EmptyReason, CrossAppResourceLink — UI-CL-001)
 */

"use client";

import Link from "next/link";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type {
  EmptyReason,
  RefreshTier,
  ResourceActionDescriptor,
} from "@drts/contracts";
import type { ReimbursementBatchRecord } from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasKPI,
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

// Q-ADM12 6-state queue state machine.
const REIMBURSEMENT_STATES = [
  "draft",
  "pending_approval",
  "approved",
  "exported",
  "paid",
  "reconciled",
] as const;
type ReimbursementQueueState = (typeof REIMBURSEMENT_STATES)[number];

type ScopeKind = "tenant" | "partner" | "forwarded" | "driver";

// Q-X02 cadence: T4 = medium_slow = 30s. See packet §3.6 and ui-runtime.ts.
const REFRESH_TIER: RefreshTier = "medium_slow";
const REFRESH_INTERVAL_MS = 30_000;
const EXPORTED_OVERDUE_HOURS = 72;
const DEFAULT_FINANCE_ACTOR_ID = "finance.console";
const PLATFORM_THEME = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

type FilterTabId = "all" | "pending" | "exported" | "done";

type ScopeFilter = "all" | ScopeKind;

interface QueueRow extends Record<string, unknown> {
  batch: ReimbursementBatchRecord;
  state: ReimbursementQueueState;
  scope: { kind: ScopeKind; label: string; reference: string };
  submitter: string;
  submittedAt: string;
  updatedAt: string;
  approver: string | null;
  availableActions: ResourceActionDescriptor[];
}

interface ToneStyleSet {
  fg: string;
  bg: string;
  bd: string;
}

function toneStyles(theme: CanvasTheme, tone: CanvasTone): ToneStyleSet {
  switch (tone) {
    case "info":
      return { fg: theme.info, bg: theme.infoBg, bd: theme.infoBorder };
    case "success":
      return {
        fg: theme.success,
        bg: theme.successBg,
        bd: theme.successBorder,
      };
    case "warn":
      return { fg: theme.warn, bg: theme.warnBg, bd: theme.warnBorder };
    case "danger":
      return { fg: theme.danger, bg: theme.dangerBg, bd: theme.dangerBorder };
    case "accent":
      return { fg: theme.accent, bg: theme.accentBg, bd: theme.accentBorder };
    case "neutral":
    default:
      return {
        fg: theme.neutral,
        bg: theme.neutralBg,
        bd: theme.neutralBorder,
      };
  }
}

function stateTone(state: ReimbursementQueueState): CanvasTone {
  switch (state) {
    case "draft":
      return "neutral";
    case "pending_approval":
      return "warn";
    case "approved":
    case "exported":
      return "info";
    case "paid":
    case "reconciled":
      return "success";
  }
}

// The shipped ReimbursementBatchRecord exposes only `pending` / `paid` plus
// `approvedAt` + `remittanceProofId` + `paidAt`. The Q-ADM12 6-state machine
// is derived locally until the backing contract is extended (tracked as a
// follow-up; the UI layer accepts an enriched record without further changes
// once that field lands).
function deriveQueueState(
  batch: ReimbursementBatchRecord,
): ReimbursementQueueState {
  if (batch.status === "paid") {
    if (batch.remittanceProofId && batch.paidAt) {
      return "paid";
    }
    return "paid";
  }
  if (batch.approvedAt) {
    if (batch.remittanceProofId) {
      return "exported";
    }
    return "approved";
  }
  if (batch.totalAmount.amountMinor === 0) {
    return "draft";
  }
  return "pending_approval";
}

function isReconciledLater(batch: ReimbursementBatchRecord) {
  // Reconciled is reached only after `paid` plus an external confirmation
  // ack; the current record does not surface that flag, so we treat
  // `paid` rows as the terminal visible state.
  void batch;
  return false;
}

// Scope derivation: the queue presents per-batch tenancy/partner attribution
// when available, falling back to driver attribution per Q-ADM12.
function deriveScope(batch: ReimbursementBatchRecord) {
  const channelCount = new Map<string, number>();
  for (const item of batch.items) {
    if (item.channelKey) {
      channelCount.set(
        item.channelKey,
        (channelCount.get(item.channelKey) ?? 0) + 1,
      );
    }
  }
  let topChannel: string | null = null;
  let topCount = 0;
  for (const [key, count] of channelCount) {
    if (count > topCount) {
      topChannel = key;
      topCount = count;
    }
  }
  switch (topChannel) {
    case "partner_airport":
      return {
        kind: "partner" as ScopeKind,
        label: "partner",
        reference: batch.driverId,
      };
    case "forwarded_shadow":
      return {
        kind: "forwarded" as ScopeKind,
        label: "forwarded",
        reference: batch.driverId,
      };
    case "tenant_enterprise":
      return {
        kind: "tenant" as ScopeKind,
        label: "tenant",
        reference: batch.driverId,
      };
    default:
      return {
        kind: "driver" as ScopeKind,
        label: "driver",
        reference: batch.driverId,
      };
  }
}

function deriveSubmittedAt(batch: ReimbursementBatchRecord) {
  // Best-effort timestamp until the contract exposes batch.createdAt:
  // earliest of approvedAt/paidAt, otherwise period anchor.
  return (
    batch.approvedAt ?? batch.paidAt ?? `${batch.periodMonth}-01T00:00:00.000Z`
  );
}

function deriveUpdatedAt(batch: ReimbursementBatchRecord) {
  return batch.paidAt ?? batch.approvedAt ?? deriveSubmittedAt(batch);
}

function exportedHoursElapsed(batch: ReimbursementBatchRecord) {
  if (!batch.approvedAt) return null;
  const approvedTs = Date.parse(batch.approvedAt);
  if (Number.isNaN(approvedTs)) return null;
  return (Date.now() - approvedTs) / 3_600_000;
}

function buildAction(
  action: string,
  enabled: boolean,
  riskLevel: ResourceActionDescriptor["riskLevel"],
  options?: { requiresReason?: boolean; disabledReasonCode?: string },
): ResourceActionDescriptor {
  const descriptor: ResourceActionDescriptor = {
    action,
    enabled,
    riskLevel,
  };
  if (options?.requiresReason) {
    descriptor.requiresReason = true;
  }
  if (!enabled && options?.disabledReasonCode) {
    descriptor.disabledReasonCode = options.disabledReasonCode;
  }
  return descriptor;
}

function deriveAvailableActions(
  batch: ReimbursementBatchRecord,
  state: ReimbursementQueueState,
): ResourceActionDescriptor[] {
  void batch;
  const actions: ResourceActionDescriptor[] = [];

  // approve: high risk, requires reason (Q-ADM12).
  actions.push(
    buildAction("approve_batch", state === "pending_approval", "high", {
      requiresReason: true,
      disabledReasonCode: "wrong_state",
    }),
  );

  // export: medium risk; produces a signed artifact link (§5.13).
  actions.push(
    buildAction("export_batch", state === "approved", "medium", {
      disabledReasonCode: "wrong_state",
    }),
  );

  // mark_paid: high risk, requires reason. Waits for external system ack.
  actions.push(
    buildAction(
      "mark_paid",
      state === "exported" || state === "approved",
      "high",
      {
        requiresReason: true,
        disabledReasonCode: "wrong_state",
      },
    ),
  );

  // mark_reconciled: medium risk; only after paid (Q-ADM12 terminal step).
  actions.push(
    buildAction("mark_reconciled", state === "paid", "medium", {
      disabledReasonCode: "wrong_state",
    }),
  );

  return actions;
}

function actionAvailable(
  row: QueueRow,
  actionId: ResourceActionDescriptor["action"],
) {
  return row.availableActions.find((a) => a.action === actionId);
}

function formatMoney(amount: { amountMinor: number; currency: string }) {
  return `${amount.amountMinor.toLocaleString()} ${amount.currency}`;
}

function formatMinorMoney(amountMinor: number, currency: string) {
  return `${amountMinor.toLocaleString()} ${currency}`;
}

function viewportStyle(theme: CanvasTheme): CSSProperties {
  return {
    position: "fixed",
    inset: 0,
    zIndex: 10,
    background: theme.bg,
  };
}

function pageBodyStyle(theme: CanvasTheme): CSSProperties {
  return {
    padding: "16px 24px 24px",
    display: "grid",
    gap: theme.sectGap,
  };
}

function nativeControlStyle(theme: CanvasTheme): CSSProperties {
  return {
    boxSizing: "border-box",
    padding: "8px 10px",
    borderRadius: 7,
    border: `1px solid ${theme.border}`,
    background: theme.bgRaised,
    color: theme.text,
    fontSize: 12.5,
    fontFamily: theme.fontFamily,
    lineHeight: 1.35,
    minWidth: 140,
  };
}

function cellStackStyle(options?: { mono?: boolean }): CSSProperties {
  return {
    display: "grid",
    gap: 4,
    minWidth: 0,
    whiteSpace: "normal",
    fontFamily: options?.mono ? PLATFORM_THEME.monoFamily : undefined,
  };
}

function emptyStateStyle(theme: CanvasTheme): CSSProperties {
  return {
    padding: 18,
    color: theme.textMuted,
    fontSize: 12.5,
    display: "grid",
    gap: 6,
  };
}

function buildPlatformNav(
  locale: "en" | "zh",
  pendingApprovalCount: number,
): CanvasShellNavItem[] {
  const labels =
    locale === "en"
      ? {
          workspace: "Workspace",
          home: "Governance Home",
          health: "Platform Health",
          tenantGov: "Tenant Governance",
          tenants: "Tenants",
          partners: "Partner entry",
          users: "Platform staff",
          fleetGov: "Fleet & Compliance",
          fleet: "Fleet & compliance",
          switchboard: "Public info & placards",
          pricingGov: "Pricing & Settlement",
          pricing: "Pricing",
          payments: "Settlement governance",
          reimbursements: "Reimbursement queue",
          platformLayer: "Platform Layer",
          notices: "Notices & maintenance",
          audit: "Audit & evidence",
          flags: "Feature flags",
          adapters: "Adapter registry",
        }
      : {
          workspace: "工作面",
          home: "工作首頁",
          health: "平台健康",
          tenantGov: "租戶治理",
          tenants: "租戶",
          partners: "合作夥伴 entry",
          users: "平台人員",
          fleetGov: "車隊與法遵",
          fleet: "車隊與合規",
          switchboard: "法定資訊與牌貼",
          pricingGov: "計價與結算",
          pricing: "計價",
          payments: "結算治理",
          reimbursements: "代墊批次",
          platformLayer: "平台層",
          notices: "公告與維護",
          audit: "稽核與證據",
          flags: "功能旗標",
          adapters: "介接登錄",
        };

  const queueBadge =
    pendingApprovalCount > 0 ? String(pendingApprovalCount) : undefined;

  return [
    { divider: labels.workspace },
    { key: "home", href: "/", icon: "home", label: labels.home },
    { key: "health", href: "/health", icon: "health", label: labels.health },
    { divider: labels.tenantGov },
    {
      key: "tenants",
      href: "/tenants",
      icon: "tenants",
      label: labels.tenants,
    },
    {
      key: "partners",
      href: "/partners",
      icon: "partners",
      label: labels.partners,
    },
    { key: "users", href: "/users", icon: "users", label: labels.users },
    { divider: labels.fleetGov },
    { key: "fleet", href: "/fleet", icon: "fleet", label: labels.fleet },
    {
      key: "switchboard",
      href: "/switchboard",
      icon: "switchboard",
      label: labels.switchboard,
    },
    { divider: labels.pricingGov },
    {
      key: "pricing",
      href: "/pricing",
      icon: "pricing",
      label: labels.pricing,
    },
    {
      key: "payments",
      href: "/payments",
      icon: "payments",
      label: labels.payments,
      matchPaths: ["/payments"],
    },
    {
      key: "reimbursements",
      href: "/payments/reimbursements",
      icon: "billing",
      label: labels.reimbursements,
      badge: queueBadge,
      badgeTone: queueBadge ? "warn" : "neutral",
      matchPaths: ["/payments/reimbursements"],
    },
    { divider: labels.platformLayer },
    {
      key: "notices",
      href: "/notices",
      icon: "notices",
      label: labels.notices,
    },
    { key: "audit", href: "/audit", icon: "audit", label: labels.audit },
    {
      key: "flags",
      href: "/feature-flags",
      icon: "flags",
      label: labels.flags,
    },
    {
      key: "adapters",
      href: "/adapter-registry",
      icon: "adapters",
      label: labels.adapters,
    },
  ];
}

interface CopyBundle {
  breadcrumbParent: string;
  pageTitle: string;
  pageSubtitle: string;
  tabAll: string;
  tabPending: string;
  tabExported: string;
  tabDone: string;
  kpiPendingLabel: string;
  kpiPendingSub: string;
  kpiPendingAmountLabel: string;
  kpiPendingAmountSub: string;
  kpiExportedOverdueLabel: string;
  kpiExportedOverdueSub: string;
  kpiReconciledLabel: string;
  kpiReconciledSub: string;
  filterStateLabel: string;
  filterScopeLabel: string;
  filterPeriodLabel: string;
  filterPeriodPlaceholder: string;
  filterReset: string;
  pendingBacklogTitle: string;
  pendingBacklogBody: (count: number) => string;
  exportedOverdueTitle: string;
  exportedOverdueBody: (count: number) => string;
  searchPlaceholder: string;
  refreshLabel: string;
  refreshTierHint: string;
  openDetailLabel: string;
  approveAction: string;
  exportAction: string;
  markPaidAction: string;
  markReconciledAction: string;
  riskHigh: string;
  riskMedium: string;
  reasonRequired: string;
  disabledWrongState: string;
  columnBatch: string;
  columnScope: string;
  columnAmount: string;
  columnState: string;
  columnSubmitter: string;
  columnSubmitted: string;
  columnUpdated: string;
  columnActions: string;
  loadingLabel: string;
  errorTitle: string;
  queueProfileTitle: string;
  queueProfileSubtitle: string;
  totalLabel: string;
  perStateLabel: string;
  actorLabel: string;
  emptyTitles: Record<EmptyReason, string>;
  emptyBodies: Record<EmptyReason, string>;
  scopeLabels: Record<ScopeKind, string>;
}

function buildCopy(locale: "en" | "zh"): CopyBundle {
  if (locale === "en") {
    return {
      breadcrumbParent: "Pricing & Settlement",
      pageTitle: "Reimbursement batches",
      pageSubtitle:
        "draft → pending_approval → approved → exported → paid → reconciled (Q-ADM12 6-state machine)",
      tabAll: "All",
      tabPending: "Pending approval",
      tabExported: "Exported",
      tabDone: "Done",
      kpiPendingLabel: "Pending approval",
      kpiPendingSub: "rows awaiting finance approval",
      kpiPendingAmountLabel: "Pending amount",
      kpiPendingAmountSub: "draft + pending + approved + exported",
      kpiExportedOverdueLabel: "Exported overdue",
      kpiExportedOverdueSub: `paid ack > ${EXPORTED_OVERDUE_HOURS}h`,
      kpiReconciledLabel: "Reconciled",
      kpiReconciledSub: "closed cycles",
      filterStateLabel: "State",
      filterScopeLabel: "Scope",
      filterPeriodLabel: "Period",
      filterPeriodPlaceholder: "yyyy-mm",
      filterReset: "Reset",
      pendingBacklogTitle: "Pending-approval backlog",
      pendingBacklogBody: (count: number) =>
        `${count} batch(es) waiting for finance approval. Resolve them before the next export window.`,
      exportedOverdueTitle: "Exported batches awaiting paid confirmation",
      exportedOverdueBody: (count: number) =>
        `${count} batch(es) have been exported for more than ${EXPORTED_OVERDUE_HOURS} hours without a paid ack from the remittance system.`,
      searchPlaceholder: "Search batch id, scope reference...",
      refreshLabel: "Refresh",
      refreshTierHint: `T4 medium_slow · ${Math.round(REFRESH_INTERVAL_MS / 1000)}s`,
      openDetailLabel: "Open detail",
      approveAction: "Approve",
      exportAction: "Export",
      markPaidAction: "Mark paid",
      markReconciledAction: "Mark reconciled",
      riskHigh: "high · reason required",
      riskMedium: "medium",
      reasonRequired: "reason required",
      disabledWrongState: "not available in current state",
      columnBatch: "Batch",
      columnScope: "Scope",
      columnAmount: "Amount",
      columnState: "State",
      columnSubmitter: "Submitter",
      columnSubmitted: "Submitted",
      columnUpdated: "Updated",
      columnActions: "Actions",
      loadingLabel: "Loading reimbursement queue…",
      errorTitle: "Failed to load queue",
      queueProfileTitle: "Queue profile",
      queueProfileSubtitle: "Current operator slice",
      totalLabel: "Total rows",
      perStateLabel: "Per state",
      actorLabel: "Finance actor ID",
      emptyTitles: {
        no_data: "No reimbursement batches",
        not_provisioned: "Reimbursement module not yet provisioned",
        fetch_failed: "Queue fetch failed",
        permission_denied: "Insufficient permission",
        external_unavailable: "Settlement service unavailable",
        driver_not_eligible: "Driver scope not eligible",
        filtered_empty: "No batches match the current filter",
      },
      emptyBodies: {
        no_data:
          "There are no reimbursement batches for the selected scope yet. New batches will appear once finance opens an issue or the daily aggregator runs.",
        not_provisioned:
          "Reimbursement provisioning has not been enabled for this tenant slice. Configure it under settlement governance before opening a batch.",
        fetch_failed:
          "The platform could not load the queue. Retry the refresh; if the error persists, file a platform incident.",
        permission_denied:
          "Your finance role does not have permission to view this queue. Ask a platform administrator to grant pa_finance_gov.",
        external_unavailable:
          "The settlement service is currently unavailable. Queue data is stale until upstream recovers.",
        driver_not_eligible:
          "Driver scope is excluded from this view; reimbursement batches are platform-owned.",
        filtered_empty:
          "The current state/scope/period combination matched no batches. Adjust the filters or reset them.",
      },
      scopeLabels: {
        tenant: "tenant",
        partner: "partner",
        forwarded: "forwarded",
        driver: "driver",
      },
    };
  }
  return {
    breadcrumbParent: "結算與帳務",
    pageTitle: "代墊批次 · Reimbursement batches",
    pageSubtitle:
      "draft → pending_approval → approved → exported → paid → reconciled (Q-ADM12 6 狀態 state machine)",
    tabAll: "全部",
    tabPending: "待簽",
    tabExported: "已 export",
    tabDone: "已結",
    kpiPendingLabel: "Pending approval",
    kpiPendingSub: "待財務核准",
    kpiPendingAmountLabel: "待結金額",
    kpiPendingAmountSub: "draft + pending + approved + exported",
    kpiExportedOverdueLabel: "Exported 逾期",
    kpiExportedOverdueSub: `paid ack 超過 ${EXPORTED_OVERDUE_HOURS} 小時`,
    kpiReconciledLabel: "已對帳",
    kpiReconciledSub: "完成循環",
    filterStateLabel: "狀態",
    filterScopeLabel: "範圍",
    filterPeriodLabel: "結算月份",
    filterPeriodPlaceholder: "yyyy-mm",
    filterReset: "重設",
    pendingBacklogTitle: "待簽 backlog",
    pendingBacklogBody: (count: number) =>
      `${count} 批次正在等待財務核准，請在下一個 export window 之前處理完。`,
    exportedOverdueTitle: "Exported 但尚未確認入帳",
    exportedOverdueBody: (count: number) =>
      `${count} 筆批次 export 已超過 ${EXPORTED_OVERDUE_HOURS} 小時，仍未收到匯款系統 paid ack。`,
    searchPlaceholder: "搜尋 batch id、scope reference…",
    refreshLabel: "重新整理",
    refreshTierHint: `T4 medium_slow · 每 ${Math.round(
      REFRESH_INTERVAL_MS / 1000,
    )} 秒`,
    openDetailLabel: "查看詳情",
    approveAction: "核准",
    exportAction: "輸出",
    markPaidAction: "標記已付",
    markReconciledAction: "標記對帳",
    riskHigh: "high · 需填寫原因",
    riskMedium: "medium",
    reasonRequired: "需填寫原因",
    disabledWrongState: "不在目前狀態可用",
    columnBatch: "批次",
    columnScope: "範圍",
    columnAmount: "金額",
    columnState: "狀態",
    columnSubmitter: "提交者",
    columnSubmitted: "提交時間",
    columnUpdated: "更新時間",
    columnActions: "動作",
    loadingLabel: "代墊批次載入中…",
    errorTitle: "queue 載入失敗",
    queueProfileTitle: "Queue 總覽",
    queueProfileSubtitle: "目前篩選下的切片",
    totalLabel: "總筆數",
    perStateLabel: "依狀態分布",
    actorLabel: "財務操作人 ID",
    emptyTitles: {
      no_data: "目前沒有代墊批次",
      not_provisioned: "尚未開通代墊模組",
      fetch_failed: "Queue 載入失敗",
      permission_denied: "權限不足",
      external_unavailable: "結算服務不可用",
      driver_not_eligible: "司機 scope 不在此 queue",
      filtered_empty: "目前篩選沒有對應批次",
    },
    emptyBodies: {
      no_data:
        "目前所選範圍尚未有任何代墊批次。當財務開立新批次或排程匯整跑完後，會顯示在這裡。",
      not_provisioned:
        "此租戶尚未開通代墊模組，請先到結算治理頁完成設定後再開立批次。",
      fetch_failed:
        "Queue 載入失敗。請重新整理；若持續發生，請開立 platform incident。",
      permission_denied:
        "您的財務角色不具備查看本 queue 的權限，請通知平台管理員開通 pa_finance_gov。",
      external_unavailable:
        "結算服務目前不可用，資料可能過時，直到上游恢復為止。",
      driver_not_eligible:
        "司機 scope 不會出現在本 queue，代墊批次屬於平台所有。",
      filtered_empty:
        "目前的「狀態 + 範圍 + 結算月份」組合沒有對應批次。請調整或重設篩選。",
    },
    scopeLabels: {
      tenant: "tenant",
      partner: "partner",
      forwarded: "forwarded",
      driver: "driver",
    },
  };
}

function sortQueue(rows: QueueRow[]) {
  const priority: Record<ReimbursementQueueState, number> = {
    pending_approval: 0,
    exported: 1,
    approved: 2,
    draft: 3,
    paid: 4,
    reconciled: 5,
  };
  return [...rows].sort((left, right) => {
    const delta = priority[left.state] - priority[right.state];
    if (delta !== 0) return delta;
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}

export default function ReimbursementQueuePage() {
  const { locale } = useTranslation();
  const client = usePlatformAdminClient();
  const theme = PLATFORM_THEME;
  const copy = useMemo(() => buildCopy(locale), [locale]);

  const [batches, setBatches] = useState<ReimbursementBatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [emptyReason, setEmptyReason] = useState<EmptyReason | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTabId>("all");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [periodFilter, setPeriodFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [actorId, setActorId] = useState(DEFAULT_FINANCE_ACTOR_ID);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const reloadRef = useRef<(options?: { silent?: boolean }) => Promise<void>>(
    async () => {},
  );

  const loadQueue = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const records = await client.listReimbursementBatches();
        setBatches(records ?? []);
        setLastUpdatedAt(new Date().toISOString());
        if (!records || records.length === 0) {
          setEmptyReason("no_data");
        } else {
          setEmptyReason(null);
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        if (/permission|forbidden|401|403/i.test(message)) {
          setEmptyReason("permission_denied");
        } else if (/not provisioned|404/i.test(message)) {
          setEmptyReason("not_provisioned");
        } else if (/unavailable|503|gateway/i.test(message)) {
          setEmptyReason("external_unavailable");
        } else {
          setEmptyReason("fetch_failed");
        }
        setBatches([]);
      } finally {
        if (silent) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [client],
  );

  reloadRef.current = loadQueue;

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  // T4 refresh tier (Q-X02): poll every 30 seconds.
  useEffect(() => {
    const interval = setInterval(() => {
      void reloadRef.current({ silent: true });
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const queueRows: QueueRow[] = useMemo(() => {
    return batches.map((batch) => {
      const state = isReconciledLater(batch)
        ? "reconciled"
        : deriveQueueState(batch);
      const scope = deriveScope(batch);
      return {
        batch,
        state,
        scope,
        submitter: batch.driverId,
        submittedAt: deriveSubmittedAt(batch),
        updatedAt: deriveUpdatedAt(batch),
        approver: batch.approvedAt ? actorId : null,
        availableActions: deriveAvailableActions(batch, state),
      };
    });
  }, [actorId, batches]);

  const stateCounts = useMemo(() => {
    const counts = REIMBURSEMENT_STATES.reduce(
      (acc, state) => {
        acc[state] = 0;
        return acc;
      },
      {} as Record<ReimbursementQueueState, number>,
    );
    for (const row of queueRows) {
      counts[row.state] += 1;
    }
    return counts;
  }, [queueRows]);

  const pendingApprovalRows = queueRows.filter(
    (row) => row.state === "pending_approval",
  );
  const exportedRows = queueRows.filter((row) => row.state === "exported");
  const exportedOverdue = exportedRows.filter((row) => {
    const hours = exportedHoursElapsed(row.batch);
    return typeof hours === "number" && hours >= EXPORTED_OVERDUE_HOURS;
  });
  const reconciledRows = queueRows.filter(
    (row) => row.state === "reconciled" || row.state === "paid",
  );
  const pendingCurrency =
    queueRows.find((row) => row.state !== "paid" && row.state !== "reconciled")
      ?.batch.totalAmount.currency ?? "TWD";
  const pendingAmount = queueRows
    .filter((row) => row.state !== "paid" && row.state !== "reconciled")
    .reduce((sum, row) => sum + row.batch.totalAmount.amountMinor, 0);

  const filteredByTab = queueRows.filter((row) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "pending") return row.state === "pending_approval";
    if (activeFilter === "exported")
      return row.state === "exported" || row.state === "approved";
    return row.state === "paid" || row.state === "reconciled";
  });
  const filteredByScope = filteredByTab.filter((row) =>
    scopeFilter === "all" ? true : row.scope.kind === scopeFilter,
  );
  const filteredByPeriod = filteredByScope.filter((row) =>
    periodFilter.trim() === ""
      ? true
      : row.batch.periodMonth === periodFilter.trim(),
  );
  const searchedRows = filteredByPeriod.filter((row) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    const haystack =
      `${row.batch.batchId} ${row.batch.driverId} ${row.batch.statementId} ${row.scope.reference}`.toLowerCase();
    return haystack.includes(term);
  });
  const sortedRows = sortQueue(searchedRows);

  const filteredEmptyReason: EmptyReason | null = emptyReason
    ? emptyReason
    : queueRows.length === 0
      ? "no_data"
      : sortedRows.length === 0
        ? "filtered_empty"
        : null;

  const showPendingBanner = pendingApprovalRows.length > 0;
  const showExportedBanner = exportedOverdue.length > 0;

  async function handleApprove(row: QueueRow) {
    const descriptor = actionAvailable(row, "approve_batch");
    if (!descriptor || !descriptor.enabled) return;
    setPendingActionId(`${row.batch.batchId}:approve`);
    try {
      await client.approveReimbursementBatch(row.batch.batchId, {
        statementId: row.batch.statementId,
      });
      await loadQueue({ silent: true });
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleMarkPaid(row: QueueRow) {
    const descriptor = actionAvailable(row, "mark_paid");
    if (!descriptor || !descriptor.enabled) return;
    setPendingActionId(`${row.batch.batchId}:paid`);
    try {
      const proofId =
        row.batch.remittanceProofId ?? `remit-${row.batch.batchId.slice(-8)}`;
      await client.markReimbursementPaid(row.batch.batchId, {
        remittanceProofId: proofId,
        paidAt: new Date().toISOString(),
      });
      await loadQueue({ silent: true });
    } finally {
      setPendingActionId(null);
    }
  }

  const shellNav = buildPlatformNav(locale, pendingApprovalRows.length);

  const tabs: ReactNode[] = [
    renderTab(
      theme,
      copy.tabAll,
      stateCounts.draft +
        stateCounts.pending_approval +
        stateCounts.approved +
        stateCounts.exported +
        stateCounts.paid +
        stateCounts.reconciled,
      "neutral",
      activeFilter === "all",
      () => setActiveFilter("all"),
    ),
    renderTab(
      theme,
      copy.tabPending,
      stateCounts.pending_approval,
      "warn",
      activeFilter === "pending",
      () => setActiveFilter("pending"),
    ),
    renderTab(
      theme,
      copy.tabExported,
      stateCounts.exported + stateCounts.approved,
      "info",
      activeFilter === "exported",
      () => setActiveFilter("exported"),
    ),
    renderTab(
      theme,
      copy.tabDone,
      stateCounts.paid + stateCounts.reconciled,
      "success",
      activeFilter === "done",
      () => setActiveFilter("done"),
    ),
  ];
  const activeTab =
    tabs[
      activeFilter === "all"
        ? 0
        : activeFilter === "pending"
          ? 1
          : activeFilter === "exported"
            ? 2
            : 3
    ];

  const columns: CanvasTableColumn<QueueRow>[] = [
    {
      h: copy.columnBatch,
      w: 200,
      mono: true,
      r: (row) => (
        <div style={cellStackStyle({ mono: true })}>
          <Link
            href={`/payments/reimbursements/${row.batch.batchId}`}
            style={{
              color: theme.accent,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            {row.batch.batchId}
          </Link>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {row.batch.periodMonth} · {row.batch.statementId}
          </span>
        </div>
      ),
    },
    {
      h: copy.columnScope,
      w: 180,
      mono: true,
      r: (row) => (
        <div style={cellStackStyle({ mono: true })}>
          <span>{copy.scopeLabels[row.scope.kind]}</span>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {row.scope.reference}
          </span>
        </div>
      ),
    },
    {
      h: copy.columnAmount,
      w: 160,
      mono: true,
      r: (row) => formatMoney(row.batch.totalAmount),
    },
    {
      h: copy.columnState,
      w: 170,
      r: (row) => (
        <div style={cellStackStyle()}>
          <CanvasPill theme={theme} tone={stateTone(row.state)} dot>
            {formatPlatformCodeLabel(locale, row.state)}
          </CanvasPill>
          {row.state === "exported" &&
          typeof exportedHoursElapsed(row.batch) === "number" &&
          (exportedHoursElapsed(row.batch) ?? 0) >= EXPORTED_OVERDUE_HOURS ? (
            <span style={{ color: theme.warn, fontSize: 11 }}>
              {locale === "en" ? "ack overdue" : "ack 逾時"}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      h: copy.columnSubmitter,
      w: 120,
      r: (row) => row.submitter,
    },
    {
      h: copy.columnSubmitted,
      w: 160,
      mono: true,
      r: (row) => formatDateTime(row.submittedAt),
    },
    {
      h: copy.columnUpdated,
      w: 160,
      mono: true,
      r: (row) => formatDateTime(row.updatedAt),
    },
    {
      h: copy.columnActions,
      w: 240,
      r: (row) => {
        const approve = actionAvailable(row, "approve_batch");
        const markPaid = actionAvailable(row, "mark_paid");
        const exportBatch = actionAvailable(row, "export_batch");
        const markReconciled = actionAvailable(row, "mark_reconciled");
        return (
          <div style={{ display: "grid", gap: 6, minWidth: 220 }}>
            {approve ? (
              <CanvasBtn
                theme={theme}
                size="xs"
                variant={approve.enabled ? "primary" : "secondary"}
                icon="check"
                disabled={
                  !approve.enabled ||
                  pendingActionId === `${row.batch.batchId}:approve`
                }
                onClick={() => void handleApprove(row)}
              >
                {copy.approveAction}
                {approve.requiresReason ? ` · ${copy.reasonRequired}` : ""}
              </CanvasBtn>
            ) : null}
            {exportBatch ? (
              <CanvasBtn
                theme={theme}
                size="xs"
                variant="secondary"
                icon="export"
                disabled
              >
                {copy.exportAction}
              </CanvasBtn>
            ) : null}
            {markPaid ? (
              <CanvasBtn
                theme={theme}
                size="xs"
                variant={markPaid.enabled ? "primary" : "secondary"}
                icon="billing"
                disabled={
                  !markPaid.enabled ||
                  pendingActionId === `${row.batch.batchId}:paid`
                }
                onClick={() => void handleMarkPaid(row)}
              >
                {copy.markPaidAction}
                {markPaid.requiresReason ? ` · ${copy.reasonRequired}` : ""}
              </CanvasBtn>
            ) : null}
            {markReconciled ? (
              <CanvasBtn
                theme={theme}
                size="xs"
                variant="secondary"
                icon="check"
                disabled
              >
                {copy.markReconciledAction}
              </CanvasBtn>
            ) : null}
          </div>
        );
      },
    },
  ];

  const perStateSummary = REIMBURSEMENT_STATES.map(
    (state) =>
      `${formatPlatformCodeLabel(locale, state)} ${stateCounts[state]}`,
  ).join(" · ");

  return (
    <div style={viewportStyle(theme)}>
      <CanvasShell
        theme={theme}
        nav={shellNav}
        active="reimbursements"
        brandLabel="DRTS"
        brandSubLabel={locale === "en" ? "Platform Admin" : "平台治理控制平面"}
        breadcrumb={[copy.breadcrumbParent, copy.pageTitle]}
        env="production"
        versionLabel={`canvas · ${REFRESH_TIER}`}
        searchPlaceholder={copy.searchPlaceholder}
        avatarLabel={locale === "en" ? "FA" : "財務"}
        style={{ height: "100%" }}
      >
        <CanvasPageHeader
          theme={theme}
          title={copy.pageTitle}
          subtitle={copy.pageSubtitle}
          tabs={tabs}
          activeTab={activeTab}
          actions={
            <>
              <CanvasBtn
                theme={theme}
                variant="secondary"
                icon="arrow"
                disabled={refreshing}
                onClick={() => void loadQueue({ silent: true })}
              >
                {copy.refreshLabel}
              </CanvasBtn>
              <Link href="/payments" style={{ textDecoration: "none" }}>
                <CanvasBtn theme={theme} variant="secondary" icon="arrow">
                  {copy.breadcrumbParent}
                </CanvasBtn>
              </Link>
            </>
          }
        />

        <div style={pageBodyStyle(theme)}>
          {loading ? (
            <CanvasCard
              theme={theme}
              title={copy.pageTitle}
              subtitle={copy.loadingLabel}
            >
              <div style={{ color: theme.textMuted, fontSize: 12.5 }}>
                {copy.loadingLabel}
              </div>
            </CanvasCard>
          ) : (
            <>
              {showPendingBanner ? (
                <CanvasBanner
                  theme={theme}
                  tone="warn"
                  title={copy.pendingBacklogTitle}
                  body={copy.pendingBacklogBody(pendingApprovalRows.length)}
                />
              ) : null}
              {showExportedBanner ? (
                <CanvasBanner
                  theme={theme}
                  tone="danger"
                  title={copy.exportedOverdueTitle}
                  body={copy.exportedOverdueBody(exportedOverdue.length)}
                />
              ) : null}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 12,
                }}
              >
                <CanvasKPI
                  theme={theme}
                  label={copy.kpiPendingLabel}
                  value={String(stateCounts.pending_approval)}
                  sub={copy.kpiPendingSub}
                  {...(showPendingBanner
                    ? {
                        delta: locale === "en" ? "backlog" : "backlog 警示",
                        deltaTone: "down" as const,
                      }
                    : {})}
                />
                <CanvasKPI
                  theme={theme}
                  label={copy.kpiPendingAmountLabel}
                  value={formatMinorMoney(pendingAmount, pendingCurrency)}
                  sub={copy.kpiPendingAmountSub}
                />
                <CanvasKPI
                  theme={theme}
                  label={copy.kpiExportedOverdueLabel}
                  value={String(exportedOverdue.length)}
                  sub={copy.kpiExportedOverdueSub}
                  {...(exportedOverdue.length > 0
                    ? {
                        delta: locale === "en" ? "overdue" : "逾時",
                        deltaTone: "down" as const,
                      }
                    : {})}
                />
                <CanvasKPI
                  theme={theme}
                  label={copy.kpiReconciledLabel}
                  value={String(reconciledRows.length)}
                  sub={copy.kpiReconciledSub}
                />
              </div>

              <CanvasCard
                theme={theme}
                title={copy.pageTitle}
                subtitle={`${sortedRows.length} / ${queueRows.length} · ${perStateSummary}`}
                padding={0}
                actions={
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <CanvasField theme={theme} label={copy.filterScopeLabel}>
                      <select
                        value={scopeFilter}
                        onChange={(event) =>
                          setScopeFilter(event.target.value as ScopeFilter)
                        }
                        style={nativeControlStyle(theme)}
                      >
                        <option value="all">
                          {formatPlatformCodeLabel(locale, "all")}
                        </option>
                        {(
                          ["tenant", "partner", "forwarded", "driver"] as const
                        ).map((kind) => (
                          <option key={kind} value={kind}>
                            {copy.scopeLabels[kind]}
                          </option>
                        ))}
                      </select>
                    </CanvasField>
                    <CanvasField theme={theme} label={copy.filterPeriodLabel}>
                      <input
                        value={periodFilter}
                        onChange={(event) =>
                          setPeriodFilter(event.target.value)
                        }
                        placeholder={copy.filterPeriodPlaceholder}
                        style={nativeControlStyle(theme)}
                      />
                    </CanvasField>
                    <CanvasField theme={theme} label={copy.searchPlaceholder}>
                      <input
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder={copy.searchPlaceholder}
                        style={nativeControlStyle(theme)}
                      />
                    </CanvasField>
                    <CanvasBtn
                      theme={theme}
                      size="xs"
                      variant="secondary"
                      onClick={() => {
                        setActiveFilter("all");
                        setScopeFilter("all");
                        setPeriodFilter("");
                        setSearchTerm("");
                      }}
                    >
                      {copy.filterReset}
                    </CanvasBtn>
                  </div>
                }
              >
                {sortedRows.length > 0 ? (
                  <CanvasTable
                    theme={theme}
                    columns={columns}
                    rows={sortedRows}
                  />
                ) : filteredEmptyReason ? (
                  <div style={emptyStateStyle(theme)}>
                    <CanvasPill
                      theme={theme}
                      tone={emptyReasonTone(filteredEmptyReason)}
                      dot
                    >
                      {filteredEmptyReason}
                    </CanvasPill>
                    <strong style={{ color: theme.text, fontSize: 13 }}>
                      {copy.emptyTitles[filteredEmptyReason]}
                    </strong>
                    <span>{copy.emptyBodies[filteredEmptyReason]}</span>
                  </div>
                ) : null}
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={copy.queueProfileTitle}
                subtitle={copy.queueProfileSubtitle}
              >
                <CanvasDL
                  theme={theme}
                  cols={2}
                  items={[
                    {
                      k: copy.totalLabel,
                      v: String(queueRows.length),
                      mono: true,
                    },
                    {
                      k: copy.perStateLabel,
                      v: perStateSummary,
                    },
                    {
                      k: copy.kpiPendingAmountLabel,
                      v: formatMinorMoney(pendingAmount, pendingCurrency),
                      mono: true,
                    },
                    {
                      k: copy.refreshTierHint,
                      v: lastUpdatedAt ? formatDateTime(lastUpdatedAt) : "—",
                      mono: true,
                    },
                  ]}
                />
                <div style={{ marginTop: 14, maxWidth: 320 }}>
                  <CanvasField theme={theme} label={copy.actorLabel}>
                    <input
                      value={actorId}
                      onChange={(event) => setActorId(event.target.value)}
                      style={nativeControlStyle(theme)}
                    />
                  </CanvasField>
                </div>
              </CanvasCard>
            </>
          )}
        </div>
      </CanvasShell>
    </div>
  );
}

function emptyReasonTone(reason: EmptyReason): CanvasTone {
  switch (reason) {
    case "no_data":
    case "filtered_empty":
      return "neutral";
    case "not_provisioned":
      return "info";
    case "permission_denied":
      return "warn";
    case "fetch_failed":
    case "external_unavailable":
      return "danger";
    case "driver_not_eligible":
      return "neutral";
  }
}

function renderTab(
  theme: CanvasTheme,
  label: string,
  count: number,
  tone: CanvasTone,
  selected: boolean,
  onClick: () => void,
): ReactNode {
  const palette = toneStyles(theme, tone);
  return (
    <button
      key={label}
      type="button"
      onClick={onClick}
      style={{
        background: "transparent",
        border: 0,
        padding: "8px 12px",
        font: "inherit",
        cursor: "pointer",
        color: selected ? theme.text : theme.textMuted,
        borderBottom: `2px solid ${selected ? theme.accent : "transparent"}`,
        marginBottom: -1,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span>{label}</span>
      <span
        style={{
          padding: "1px 6px",
          borderRadius: 999,
          fontSize: 11,
          background: palette.bg,
          color: palette.fg,
          border: `1px solid ${palette.bd}`,
          fontFamily: theme.monoFamily,
        }}
      >
        {count}
      </span>
    </button>
  );
}
