/**
 * Reimbursement Batch Detail (NEW per Q-ADM12)
 *
 * Route: /payments/reimbursements/[batchId]
 * Packet: docs/05-ui/platform-admin-design-handoff-packet-20260525.md §5.13
 * Canvas: docs/05-ui/drts-design-canvas/Platform Admin.html → PA_ReimbursementDetail
 *
 * Visual follows the canvas artboard (state-machine stepper + header DL +
 * audit-derived timeline + line-item table). Behaviour follows packet §5.13:
 *   - `availableActions[]` (ResourceActionDescriptor) drives every CTA — no
 *     role hard-coding (§3.5).
 *   - Risk-classified confirmation per action (§3.4): low = direct + toast,
 *     medium = modal confirm + toast, high = modal + required reason + toast.
 *   - All six `EmptyReason` states render distinctly (§3.6).
 *   - Refresh tier T4 (`medium_slow`, 30s) wired with stale affordance (§3.2).
 *   - Cross-app / cross-page deep links via `CrossAppResourceLink` (§3.10).
 *
 * Data contract is `@drts/contracts` ui-runtime. The batch-detail read method
 * is still TBD in the API client (packet §6 engineering follow-up), so this
 * page loads through a local resolver that returns the same envelope shape the
 * backend will emit; swap `loadReimbursementBatchDetail` for the real client
 * call once `getReimbursementBatchDetail` lands.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { formatDateTime } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import type { Locale } from "@/lib/translations";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  CanvasTable,
  Stepper,
  Timeline,
  buildCanvasTheme,
} from "@drts/ui-web";
import type {
  CanvasShellNavItem,
  CanvasTableColumn,
  CanvasTheme,
  CanvasTone,
  ManagementTone,
  StepperItem,
  TimelineItem,
} from "@drts/ui-web";
import type {
  CrossAppResourceLink,
  EmptyReason,
  EmptyStateEnvelope,
  RefreshTier,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";

// ─────────────────────────────────────────────────────────────────────────────
// Theme + refresh tier
// ─────────────────────────────────────────────────────────────────────────────

const PLATFORM_THEME = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

/** Q-X02 fixed cadences (ms). This surface is T4 `medium_slow` per packet §3.2. */
const REFRESH_TIER_CADENCE_MS: Record<RefreshTier, number> = {
  urgent: 5_000,
  fast: 3_000,
  dispatch: 5_000,
  medium: 15_000,
  medium_slow: 30_000,
  slow: 30_000,
  manual: 0,
};

const PAGE_REFRESH_TIER: RefreshTier = "medium_slow";

// ─────────────────────────────────────────────────────────────────────────────
// View model (ui-runtime shaped — see file header)
// ─────────────────────────────────────────────────────────────────────────────

const BATCH_STATES = [
  "draft",
  "pending_approval",
  "approved",
  "exported",
  "paid",
  "reconciled",
] as const;

type ReimbursementBatchState = (typeof BATCH_STATES)[number];

type LineItemSource = "mirror_order" | "external_order" | "driver" | "recon";

interface BatchLineItem {
  itemId: string;
  recipient: string;
  amountLabel: string;
  sourceType: LineItemSource;
  sourceRef: string;
  note?: string;
}

interface BatchTimelineEvent {
  id: string;
  at: string;
  title: string;
  actor: string;
  actorRealm: string;
  tone: CanvasTone;
  body?: string;
}

interface BatchStateStamp {
  at: string;
  actor: string;
}

interface ExportArtifact {
  artifactId: string;
  url: string;
  generatedAt: string;
}

interface ReimbursementBatchDetailView {
  batchId: string;
  scopeLabel: string;
  totalAmountLabel: string;
  state: ReimbursementBatchState;
  submitter: string;
  submitterRole: string;
  approver?: string;
  approverRole?: string;
  stamps: Partial<Record<ReimbursementBatchState, BatchStateStamp>>;
  lineItems: BatchLineItem[];
  timeline: BatchTimelineEvent[];
  exportArtifact: ExportArtifact | null;
  reconciliationMismatch: boolean;
  reconciliationLink: CrossAppResourceLink | null;
  availableActions: ResourceActionDescriptor[];
  refresh: UiRefreshMetadata;
}

/** Either the resource, or an empty-state envelope explaining its absence. */
type BatchDetailResult =
  | { kind: "ok"; view: ReimbursementBatchDetailView }
  | { kind: "empty"; empty: EmptyStateEnvelope };

// ─────────────────────────────────────────────────────────────────────────────
// availableActions — backend-derived per §3.5; computed here from the state
// machine so CTAs stay truthful to the batch's lifecycle position.
// ─────────────────────────────────────────────────────────────────────────────

type BatchAction =
  | "approve"
  | "export"
  | "mark_paid"
  | "mark_reconciled"
  | "comment";

function buildAvailableActions(
  state: ReimbursementBatchState,
): ResourceActionDescriptor[] {
  const descriptor = (
    action: BatchAction,
    riskLevel: ResourceActionDescriptor["riskLevel"],
    enabled: boolean,
    requiresReason: boolean,
    disabledReasonCode?: string,
  ): ResourceActionDescriptor => {
    const base: ResourceActionDescriptor = { action, enabled, riskLevel };
    if (requiresReason) base.requiresReason = true;
    if (!enabled && disabledReasonCode)
      base.disabledReasonCode = disabledReasonCode;
    return base;
  };

  return [
    descriptor(
      "approve",
      "high",
      state === "pending_approval",
      true,
      state === "draft" ? "awaiting_submission" : "already_approved",
    ),
    descriptor(
      "export",
      "medium",
      state === "approved",
      false,
      state === "exported" || state === "paid" || state === "reconciled"
        ? "already_exported"
        : "requires_approved_state",
    ),
    descriptor(
      "mark_paid",
      "high",
      state === "exported",
      true,
      state === "paid" || state === "reconciled"
        ? "already_paid"
        : "requires_exported_state",
    ),
    descriptor(
      "mark_reconciled",
      "medium",
      state === "paid",
      false,
      state === "reconciled" ? "already_reconciled" : "requires_paid_state",
    ),
    descriptor("comment", "low", true, false),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Localized copy (zh primary / en secondary per §3.1). Kept page-local so
// generic state codes never bleed labels from unrelated domains.
// ─────────────────────────────────────────────────────────────────────────────

interface PageCopy {
  brand: string;
  brandSub: string;
  breadcrumbParent: string;
  searchPlaceholder: string;
  queueLink: string;
  pageSubtitle: (scope: string, amount: string) => string;
  stateMachineTitle: string;
  headerTitle: string;
  timelineTitle: string;
  lineItemsTitle: (count: number) => string;
  artifactTitle: string;
  artifactOpen: string;
  reconTitle: string;
  reconBody: string;
  reconOpen: string;
  refresh: string;
  lastUpdated: string;
  readOnly: string;
  readOnlyHint: string;
  loading: string;
  copyComment: string;
  commentTitle: string;
  commentPlaceholder: string;
  commentSubmit: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  confirm: string;
  cancel: string;
  viewAudit: string;
  receiptPrefix: string;
  freshness: Record<UiRefreshMetadata["dataFreshness"], string>;
  source: Record<LineItemSource, string>;
  cols: {
    recipient: string;
    amount: string;
    source: string;
    note: string;
  };
  dl: {
    batchId: string;
    scope: string;
    total: string;
    state: string;
    submitter: string;
    submittedAt: string;
    approver: string;
    linkedRecon: string;
    none: string;
    pendingApprover: string;
  };
  states: Record<ReimbursementBatchState, string>;
  actionLabels: Record<BatchAction, string>;
  disabledReasons: Record<string, string>;
}

function getCopy(locale: Locale): PageCopy {
  if (locale === "en") {
    return {
      brand: "DRTS Fleet",
      brandSub: "Platform Admin",
      breadcrumbParent: "Reimbursement batches",
      searchPlaceholder: "Search tenants, partners, audit…",
      queueLink: "Back to queue",
      pageSubtitle: (scope, amount) =>
        `${scope} · ${amount} · 6-state machine (Q-ADM12)`,
      stateMachineTitle: "State machine · Q-ADM12",
      headerTitle: "Header",
      timelineTitle: "State timeline · audit-derived",
      lineItemsTitle: (count) => `Line items · ${count} recipients`,
      artifactTitle: "Export artifact",
      artifactOpen: "Open signed artifact",
      reconTitle: "Reconciliation mismatch",
      reconBody:
        "Totals diverge from the linked reconciliation issue. Resolve on Payments before marking reconciled.",
      reconOpen: "Open reconciliation issue",
      refresh: "Refresh",
      lastUpdated: "Updated",
      readOnly: "Read-only",
      readOnlyHint: "You can view this batch but cannot act on it.",
      loading: "Loading batch…",
      copyComment: "Copy summary",
      commentTitle: "Add comment",
      commentPlaceholder: "Add an internal note for this batch…",
      commentSubmit: "Post comment",
      reasonLabel: "Reason (required)",
      reasonPlaceholder: "Record why you are taking this high-risk action…",
      confirm: "Confirm",
      cancel: "Cancel",
      viewAudit: "View audit",
      receiptPrefix: "Done",
      freshness: {
        fresh: "Fresh",
        stale: "Stale",
        degraded: "Degraded",
        unknown: "Unknown",
      },
      source: {
        mirror_order: "Mirror order",
        external_order: "External order",
        driver: "Driver",
        recon: "Reconciliation",
      },
      cols: {
        recipient: "Recipient",
        amount: "Amount",
        source: "Source reference",
        note: "Note",
      },
      dl: {
        batchId: "Batch ID",
        scope: "Scope",
        total: "Total amount",
        state: "State",
        submitter: "Submitter",
        submittedAt: "Submitted at",
        approver: "Approver",
        linkedRecon: "Linked recon",
        none: "—",
        pendingApprover: "Pending approver",
      },
      states: {
        draft: "Draft",
        pending_approval: "Pending approval",
        approved: "Approved",
        exported: "Exported",
        paid: "Paid",
        reconciled: "Reconciled",
      },
      actionLabels: {
        approve: "Approve",
        export: "Export",
        mark_paid: "Mark paid",
        mark_reconciled: "Mark reconciled",
        comment: "Comment",
      },
      disabledReasons: {
        awaiting_submission: "Batch is still a draft",
        already_approved: "Already past approval",
        requires_approved_state: "Approve the batch first",
        already_exported: "Artifact already generated",
        requires_exported_state: "Export the batch first",
        already_paid: "Already marked paid",
        requires_paid_state: "Mark paid first",
        already_reconciled: "Already reconciled",
      },
    };
  }

  return {
    brand: "DRTS Fleet",
    brandSub: "平台管理",
    breadcrumbParent: "代墊批次",
    searchPlaceholder: "搜尋租戶、夥伴、稽核…",
    queueLink: "返回批次佇列",
    pageSubtitle: (scope, amount) =>
      `${scope} · ${amount} · 6 狀態 state machine (Q-ADM12)`,
    stateMachineTitle: "狀態機 · Q-ADM12",
    headerTitle: "批次資料",
    timelineTitle: "狀態時間軸 · 由稽核衍生",
    lineItemsTitle: (count) => `明細 · ${count} 位受款方`,
    artifactTitle: "匯出產物",
    artifactOpen: "開啟簽章產物",
    reconTitle: "對帳差異",
    reconBody:
      "總額與連結的對帳議題不一致。請先在「結算與帳務」處理，再標記為已對帳。",
    reconOpen: "開啟對帳議題",
    refresh: "重新整理",
    lastUpdated: "更新於",
    readOnly: "唯讀",
    readOnlyHint: "你可檢視此批次，但目前無可執行的動作。",
    loading: "載入批次中…",
    copyComment: "複製摘要",
    commentTitle: "新增評論",
    commentPlaceholder: "為此批次新增內部備註…",
    commentSubmit: "送出評論",
    reasonLabel: "原因（必填）",
    reasonPlaceholder: "記錄執行此高風險動作的原因…",
    confirm: "確認",
    cancel: "取消",
    viewAudit: "檢視稽核",
    receiptPrefix: "已完成",
    freshness: {
      fresh: "最新",
      stale: "過期",
      degraded: "降級",
      unknown: "未知",
    },
    source: {
      mirror_order: "鏡像訂單",
      external_order: "外部訂單",
      driver: "司機",
      recon: "對帳",
    },
    cols: {
      recipient: "受款方",
      amount: "金額",
      source: "來源參照",
      note: "備註",
    },
    dl: {
      batchId: "批次 ID",
      scope: "範圍",
      total: "總金額",
      state: "狀態",
      submitter: "提交人",
      submittedAt: "提交時間",
      approver: "核准人",
      linkedRecon: "連結對帳",
      none: "—",
      pendingApprover: "待簽核",
    },
    states: {
      draft: "草稿",
      pending_approval: "待核准",
      approved: "已核准",
      exported: "已匯出",
      paid: "已付款",
      reconciled: "已對帳",
    },
    actionLabels: {
      approve: "核准",
      export: "匯出",
      mark_paid: "標記已付",
      mark_reconciled: "標記已對帳",
      comment: "評論",
    },
    disabledReasons: {
      awaiting_submission: "批次仍為草稿",
      already_approved: "已通過核准階段",
      requires_approved_state: "請先核准批次",
      already_exported: "產物已生成",
      requires_exported_state: "請先匯出批次",
      already_paid: "已標記為已付",
      requires_paid_state: "請先標記已付",
      already_reconciled: "已完成對帳",
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty-state copy — six distinct treatments per §3.6.
// ─────────────────────────────────────────────────────────────────────────────

interface EmptyTreatment {
  tone: Exclude<CanvasTone, "neutral">;
  title: string;
  body: string;
}

function getEmptyTreatment(
  reason: EmptyReason,
  locale: Locale,
): EmptyTreatment {
  const en: Record<EmptyReason, EmptyTreatment> = {
    no_data: {
      tone: "info",
      title: "Batch not found",
      body: "No reimbursement batch matches this id. It may have been merged or removed.",
    },
    not_provisioned: {
      tone: "warn",
      title: "Reimbursements not provisioned",
      body: "Q-ADM12 reimbursement batches are not enabled for this scope yet.",
    },
    fetch_failed: {
      tone: "danger",
      title: "Could not load batch",
      body: "The batch service did not respond. Retry, or check platform health.",
    },
    permission_denied: {
      tone: "warn",
      title: "No access to this batch",
      body: "Your role lacks finance-governance scope for this reimbursement batch.",
    },
    external_unavailable: {
      tone: "warn",
      title: "External system unavailable",
      body: "The downstream payout/export system is unreachable; data may be incomplete.",
    },
    driver_not_eligible: {
      tone: "info",
      title: "Driver not eligible",
      body: "The recipient driver is not eligible for reimbursement in this period.",
    },
    filtered_empty: {
      tone: "info",
      title: "Nothing matches the filter",
      body: "No batch matches the current filter. Clear filters to see all batches.",
    },
  };

  const zh: Record<EmptyReason, EmptyTreatment> = {
    no_data: {
      tone: "info",
      title: "找不到批次",
      body: "沒有符合此 id 的代墊批次，可能已被合併或移除。",
    },
    not_provisioned: {
      tone: "warn",
      title: "尚未啟用代墊功能",
      body: "此範圍尚未啟用 Q-ADM12 代墊批次。",
    },
    fetch_failed: {
      tone: "danger",
      title: "批次載入失敗",
      body: "批次服務沒有回應，請重試或檢查平台健康狀態。",
    },
    permission_denied: {
      tone: "warn",
      title: "無權檢視此批次",
      body: "你的角色缺少此代墊批次的財務治理權限。",
    },
    external_unavailable: {
      tone: "warn",
      title: "外部系統無法使用",
      body: "下游付款／匯出系統無法連線，資料可能不完整。",
    },
    driver_not_eligible: {
      tone: "info",
      title: "司機不符資格",
      body: "受款司機在此期間不符代墊資格。",
    },
    filtered_empty: {
      tone: "info",
      title: "沒有符合篩選的批次",
      body: "目前篩選條件下沒有批次，清除篩選即可看到全部。",
    },
  };

  return (locale === "en" ? en : zh)[reason];
}

// ─────────────────────────────────────────────────────────────────────────────
// Tone / step helpers
// ─────────────────────────────────────────────────────────────────────────────

function batchStateTone(state: ReimbursementBatchState): CanvasTone {
  switch (state) {
    case "paid":
    case "reconciled":
      return "success";
    case "pending_approval":
      return "warn";
    case "draft":
      return "neutral";
    case "approved":
    case "exported":
    default:
      return "info";
  }
}

function riskTone(risk: ResourceActionDescriptor["riskLevel"]): CanvasTone {
  return risk === "high" ? "danger" : risk === "medium" ? "warn" : "neutral";
}

/** Map a canvas tone onto the management-primitive tone vocabulary. */
function toManagementTone(tone: CanvasTone): ManagementTone {
  return tone === "warn" ? "warning" : tone;
}

// ─────────────────────────────────────────────────────────────────────────────
// Local data resolver (TBD backend — see file header)
// ─────────────────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

function freshRefreshMeta(): UiRefreshMetadata {
  return {
    generatedAt: nowIso(),
    staleAfterMs: REFRESH_TIER_CADENCE_MS[PAGE_REFRESH_TIER],
    dataFreshness: "fresh",
    source: "sandbox",
  };
}

/** Canvas fixture (PA_ReimbursementDetail default: rb_2026_05_001). */
function demoBatch(batchId: string): ReimbursementBatchDetailView {
  const reconLink: CrossAppResourceLink = {
    targetApp: "platform-admin",
    route: "/payments?issue=rec_0089",
    resourceType: "reconciliation_issue",
    resourceId: "rec_0089",
    openMode: "same_tab",
    label: "rec_0089",
  };

  return {
    batchId,
    scopeLabel: "partner:CTBC",
    totalAmountLabel: "NT$ 1,420,800",
    state: "pending_approval",
    submitter: "張薇",
    submitterRole: "pa_finance_gov",
    approver: "林宜君",
    approverRole: "pa_super_admin",
    stamps: {
      draft: { at: "2026-05-24T11:00:00Z", actor: "張薇" },
      pending_approval: { at: "2026-05-24T11:02:00Z", actor: "張薇" },
    },
    lineItems: [
      {
        itemId: "li_001",
        recipient: "CTBC partner program — World Elite",
        amountLabel: "NT$ 994,560",
        sourceType: "external_order",
        sourceRef: "partner:ctbc-elite",
        note: "sponsor reimbursement Q2-Apr",
      },
      {
        itemId: "li_002",
        recipient: "CTBC partner program — Infinite",
        amountLabel: "NT$ 246,240",
        sourceType: "external_order",
        sourceRef: "partner:ctbc-infinite",
        note: "sponsor reimbursement Q2-Apr",
      },
      {
        itemId: "li_003",
        recipient: "CTBC reconciliation adjustment",
        amountLabel: "NT$ 180,000",
        sourceType: "recon",
        sourceRef: "recon:rec_0089",
        note: "差額 NT$ 1,820 × 99 筆",
      },
    ],
    timeline: [
      {
        id: "ev_1",
        at: "2026-05-24T11:00:00Z",
        title: "建立 · created",
        actor: "張薇",
        actorRealm: "platform",
        tone: "accent",
        body: "從 recon issue rec_0089 衍生。",
      },
      {
        id: "ev_2",
        at: "2026-05-24T11:02:00Z",
        title: "submit for approval",
        actor: "張薇",
        actorRealm: "platform",
        tone: "accent",
      },
      {
        id: "ev_3",
        at: "2026-05-25T09:14:00Z",
        title: "waiting approval",
        actor: "system",
        actorRealm: "system",
        tone: "warn",
        body: "pa_super_admin 待簽。",
      },
    ],
    exportArtifact: null,
    reconciliationMismatch: true,
    reconciliationLink: reconLink,
    availableActions: buildAvailableActions("pending_approval"),
    refresh: freshRefreshMeta(),
  };
}

const EMPTY_SENTINELS: Record<string, EmptyReason> = {
  __empty_no_data: "no_data",
  __empty_not_provisioned: "not_provisioned",
  __empty_fetch_failed: "fetch_failed",
  __empty_permission_denied: "permission_denied",
  __empty_external_unavailable: "external_unavailable",
  __empty_filtered_empty: "filtered_empty",
};

/**
 * Stand-in for the TBD `getReimbursementBatchDetail` read. Returns the same
 * envelope contract the backend will emit. Sentinel ids exercise each
 * `EmptyReason` so the six treatments are reachable from the running app.
 */
function loadReimbursementBatchDetail(batchId: string): BatchDetailResult {
  if (!batchId) {
    return {
      kind: "empty",
      empty: {
        reason: "no_data",
        messageCode: "reimbursement.batch.missing_id",
      },
    };
  }

  const sentinel = EMPTY_SENTINELS[batchId];
  if (sentinel) {
    return {
      kind: "empty",
      empty: {
        reason: sentinel,
        messageCode: `reimbursement.batch.${sentinel}`,
      },
    };
  }

  return { kind: "ok", view: demoBatch(batchId) };
}

// ─────────────────────────────────────────────────────────────────────────────
// State-machine transition applied optimistically on a confirmed action
// (mirrors the receipt the backend would return for the TBD write methods).
// ─────────────────────────────────────────────────────────────────────────────

interface ActionReceiptView {
  auditId: string;
  message: string;
}

function applyAction(
  view: ReimbursementBatchDetailView,
  action: BatchAction,
  copy: PageCopy,
  reason: string | null,
  seq: number,
): { view: ReimbursementBatchDetailView; receipt: ActionReceiptView } {
  const auditId = `aud_${view.batchId}_${action}_${seq}`;
  const at = nowIso();
  const actor = view.approver ?? view.submitter;

  const nextStateByAction: Partial<
    Record<BatchAction, ReimbursementBatchState>
  > = {
    approve: "approved",
    export: "exported",
    mark_paid: "paid",
    mark_reconciled: "reconciled",
  };
  const nextState = nextStateByAction[action];

  const timelineEvent: BatchTimelineEvent = {
    id: `ev_${action}_${seq}`,
    at,
    title: copy.actionLabels[action],
    actor,
    actorRealm: "platform",
    tone: action === "comment" ? "neutral" : "accent",
    ...(reason ? { body: reason } : {}),
  };

  const next: ReimbursementBatchDetailView = {
    ...view,
    timeline: [...view.timeline, timelineEvent],
    refresh: freshRefreshMeta(),
  };

  if (nextState) {
    next.state = nextState;
    next.stamps = { ...view.stamps, [nextState]: { at, actor } };
    next.availableActions = buildAvailableActions(nextState);
    if (action === "export") {
      next.exportArtifact = {
        artifactId: `art_${view.batchId}_${seq}`,
        url: `https://artifacts.drts.io/reimbursements/${view.batchId}/${seq}.zip`,
        generatedAt: at,
      };
    }
    if (action === "mark_reconciled") {
      next.reconciliationMismatch = false;
    }
  }

  return {
    view: next,
    receipt: {
      auditId,
      message: `${copy.receiptPrefix}: ${copy.actionLabels[action]}`,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

function viewportStyle(theme: CanvasTheme): CSSProperties {
  return { position: "fixed", inset: 0, zIndex: 10, background: theme.bg };
}

function pageBodyStyle(theme: CanvasTheme): CSSProperties {
  return {
    padding: "16px 24px 24px",
    display: "flex",
    flexDirection: "column",
    gap: theme.sectGap,
  };
}

function modalOverlayStyle(): CSSProperties {
  return {
    position: "fixed",
    inset: 0,
    zIndex: 50,
    background: "rgba(15, 18, 30, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  };
}

function modalCardStyle(theme: CanvasTheme): CSSProperties {
  return {
    width: "min(480px, 100%)",
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 12,
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    boxShadow: "0 18px 48px rgba(0,0,0,0.28)",
  };
}

function textAreaStyle(theme: CanvasTheme): CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 88,
    resize: "vertical",
    padding: "8px 10px",
    borderRadius: 7,
    border: `1px solid ${theme.border}`,
    background: theme.bgRaised,
    color: theme.text,
    fontSize: 12.5,
    fontFamily: theme.fontFamily,
    lineHeight: 1.4,
  };
}

function toastStyle(theme: CanvasTheme): CSSProperties {
  return {
    position: "fixed",
    right: 20,
    bottom: 20,
    zIndex: 60,
    maxWidth: 360,
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 10,
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    boxShadow: "0 12px 32px rgba(0,0,0,0.22)",
    fontSize: 12.5,
    color: theme.text,
  };
}

function freshnessTone(
  freshness: UiRefreshMetadata["dataFreshness"],
): CanvasTone {
  switch (freshness) {
    case "fresh":
      return "success";
    case "stale":
      return "warn";
    case "degraded":
      return "danger";
    case "unknown":
    default:
      return "neutral";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

interface PendingConfirm {
  descriptor: ResourceActionDescriptor;
  action: BatchAction;
}

interface ActiveToast {
  message: string;
  auditId: string;
}

export default function ReimbursementBatchDetailPage() {
  const theme = PLATFORM_THEME;
  const { t, locale } = useTranslation();
  const copy = useMemo(() => getCopy(locale), [locale]);

  const params = useParams<{ batchId: string }>();
  const batchId = Array.isArray(params?.batchId)
    ? (params.batchId[0] ?? "")
    : (params?.batchId ?? "");

  const [result, setResult] = useState<BatchDetailResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [toast, setToast] = useState<ActiveToast | null>(null);
  const seqRef = useRef(0);

  const load = useCallback(() => {
    setLoading(true);
    const next = loadReimbursementBatchDetail(batchId);
    setResult(next);
    setLoading(false);
  }, [batchId]);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh tier T4 (medium_slow) — poll metadata at the fixed cadence (§3.2).
  useEffect(() => {
    const cadence = REFRESH_TIER_CADENCE_MS[PAGE_REFRESH_TIER];
    if (cadence <= 0) return;
    const id = window.setInterval(() => {
      setResult((current) => {
        if (!current || current.kind !== "ok") return current;
        return {
          kind: "ok",
          view: { ...current.view, refresh: freshRefreshMeta() },
        };
      });
    }, cadence);
    return () => window.clearInterval(id);
  }, []);

  const nextSeq = useCallback(() => {
    seqRef.current += 1;
    return seqRef.current;
  }, []);

  const view = result?.kind === "ok" ? result.view : null;

  const runAction = useCallback(
    (action: BatchAction, reason: string | null) => {
      setResult((current) => {
        if (!current || current.kind !== "ok") return current;
        const { view: updated, receipt } = applyAction(
          current.view,
          action,
          copy,
          reason,
          nextSeq(),
        );
        setToast({ message: receipt.message, auditId: receipt.auditId });
        return { kind: "ok", view: updated };
      });
    },
    [copy, nextSeq],
  );

  const onCtaClick = useCallback(
    (descriptor: ResourceActionDescriptor) => {
      const action = descriptor.action as BatchAction;
      if (!descriptor.enabled) return;
      if (action === "comment") {
        setCommentOpen(true);
        return;
      }
      if (descriptor.riskLevel === "low") {
        runAction(action, null);
        return;
      }
      // medium + high → modal confirm (high also collects required reason).
      setReasonText("");
      setPending({ descriptor, action });
    },
    [runAction],
  );

  const confirmPending = useCallback(() => {
    if (!pending) return;
    const requiresReason = pending.descriptor.requiresReason ?? false;
    const reason = reasonText.trim();
    if (requiresReason && !reason) return;
    runAction(pending.action, requiresReason ? reason : null);
    setPending(null);
    setReasonText("");
  }, [pending, reasonText, runAction]);

  const submitComment = useCallback(() => {
    const note = commentText.trim();
    if (!note) return;
    runAction("comment", note);
    setCommentText("");
    setCommentOpen(false);
  }, [commentText, runAction]);

  const copySummary = useCallback(() => {
    if (!view) return;
    const summary = `${view.batchId} · ${copy.states[view.state]} · ${view.totalAmountLabel}`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(summary);
    }
  }, [view, copy]);

  // Faithful nav matching the platform-admin shell ordering.
  const navItems = useMemo<CanvasShellNavItem[]>(() => {
    const en = locale === "en";
    return [
      {
        key: "home",
        href: "/",
        label: en ? "Home" : "首頁",
        icon: "dashboard",
      },
      {
        key: "health",
        href: "/health",
        label: en ? "Health" : "平台健康",
        icon: "health",
      },
      { divider: en ? "Tenant Governance" : "租戶治理" },
      {
        key: "tenants",
        href: "/tenants",
        label: en ? "Tenants" : "租戶",
        icon: "tenants",
      },
      {
        key: "partners",
        href: "/partners",
        label: en ? "Partners" : "合作夥伴",
        icon: "partners",
      },
      {
        key: "users",
        href: "/users",
        label: en ? "Users" : "平台人員",
        icon: "users",
      },
      { divider: en ? "People & Fleet" : "人員與車隊" },
      {
        key: "fleet",
        href: "/fleet",
        label: en ? "Fleet" : "車隊與法遵",
        icon: "fleet",
      },
      { divider: en ? "Platform & Commerce" : "平台與商務" },
      {
        key: "switchboard",
        href: "/switchboard",
        label: en ? "Switchboard" : "公開資訊",
        icon: "switchboard",
      },
      {
        key: "pricing",
        href: "/pricing",
        label: en ? "Pricing" : "費率治理",
        icon: "pricing",
      },
      {
        key: "payments",
        href: "/payments",
        label: en ? "Payments" : "結算與帳務",
        icon: "payments",
        matchPaths: ["/payments"],
      },
      {
        key: "adapters",
        href: "/adapter-registry",
        label: en ? "Adapters" : "平台 Adapter",
        icon: "adapters",
      },
      { divider: en ? "Platform Ops & Risk" : "平台維運" },
      {
        key: "notices",
        href: "/notices",
        label: en ? "Notices" : "公告與維護",
        icon: "notices",
      },
      {
        key: "audit",
        href: "/audit",
        label: en ? "Audit" : "稽核與證據",
        icon: "audit",
      },
      {
        key: "flags",
        href: "/feature-flags",
        label: en ? "Feature Flags" : "功能旗標",
        icon: "flags",
      },
    ];
  }, [locale]);

  const stepperItems: StepperItem[] = useMemo(() => {
    if (!view) return [];
    const currentIdx = BATCH_STATES.indexOf(view.state);
    return BATCH_STATES.map((state, index) => {
      const stamp = view.stamps[state];
      const stepState =
        index < currentIdx
          ? "complete"
          : index === currentIdx
            ? "current"
            : "upcoming";
      const item: StepperItem = {
        id: state,
        title: copy.states[state],
        state: stepState,
      };
      if (stamp) item.timestamp = formatDateTime(stamp.at);
      return item;
    });
  }, [view, copy]);

  const timelineItems: TimelineItem[] = useMemo(() => {
    if (!view) return [];
    return view.timeline.map((event) => {
      const item: TimelineItem = {
        id: event.id,
        title: event.title,
        timestamp: formatDateTime(event.at),
        tone: toManagementTone(event.tone),
        eyebrow: `${event.actor} · ${event.actorRealm}`,
      };
      if (event.body) item.detail = event.body;
      return item;
    });
  }, [view]);

  const lineItemColumns: CanvasTableColumn<
    BatchLineItem & Record<string, unknown>
  >[] = [
    {
      h: copy.cols.recipient,
      w: 260,
      r: (row) => row.recipient,
    },
    {
      h: copy.cols.amount,
      w: 140,
      mono: true,
      align: "right",
      r: (row) => row.amountLabel,
    },
    {
      h: copy.cols.source,
      w: 230,
      mono: true,
      r: (row) => (
        <div style={{ display: "grid", gap: 2 }}>
          <CanvasPill theme={theme} tone="neutral">
            {copy.source[row.sourceType]}
          </CanvasPill>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {row.sourceRef}
          </span>
        </div>
      ),
    },
    {
      h: copy.cols.note,
      r: (row) => row.note ?? copy.dl.none,
    },
  ];

  const renderCta = (descriptor: ResourceActionDescriptor) => {
    const action = descriptor.action as BatchAction;
    const label = copy.actionLabels[action] ?? descriptor.action;
    const isPrimary = descriptor.enabled && descriptor.riskLevel === "high";
    const title =
      !descriptor.enabled && descriptor.disabledReasonCode
        ? copy.disabledReasons[descriptor.disabledReasonCode]
        : undefined;
    return (
      <span key={descriptor.action} title={title}>
        <CanvasBtn
          theme={theme}
          variant={isPrimary ? "primary" : "secondary"}
          disabled={!descriptor.enabled}
          icon={
            action === "approve"
              ? "check"
              : action === "export"
                ? "reports"
                : action === "comment"
                  ? "copy"
                  : "arrow"
          }
          onClick={() => onCtaClick(descriptor)}
        >
          {label}
          {descriptor.riskLevel === "high" ? " ·" : ""}
        </CanvasBtn>
      </span>
    );
  };

  const headerActionDescriptors = view
    ? view.availableActions.filter((d) => d.action !== "comment")
    : [];
  const commentDescriptor = view?.availableActions.find(
    (d) => d.action === "comment",
  );

  const refresh = view?.refresh;
  const isStale =
    refresh != null &&
    (refresh.dataFreshness === "stale" ||
      refresh.dataFreshness === "degraded" ||
      Date.now() - Date.parse(refresh.generatedAt) > refresh.staleAfterMs);
  const freshnessKey: UiRefreshMetadata["dataFreshness"] = refresh
    ? isStale && refresh.dataFreshness === "fresh"
      ? "stale"
      : refresh.dataFreshness
    : "unknown";

  const headerTitle = view ? (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      {view.batchId}
      <CanvasPill theme={theme} tone={batchStateTone(view.state)} dot>
        {copy.states[view.state]}
      </CanvasPill>
    </span>
  ) : (
    batchId || copy.breadcrumbParent
  );

  return (
    <div style={viewportStyle(theme)}>
      <CanvasShell
        theme={theme}
        nav={navItems}
        active="payments"
        brandLabel={copy.brand}
        brandSubLabel={copy.brandSub}
        breadcrumb={[copy.breadcrumbParent, batchId || copy.dl.none]}
        env="production"
        versionLabel="canvas"
        searchPlaceholder={copy.searchPlaceholder}
        avatarLabel={locale === "en" ? "FA" : "財務"}
        style={{ height: "100%" }}
      >
        <CanvasPageHeader
          theme={theme}
          title={headerTitle}
          subtitle={
            view
              ? copy.pageSubtitle(view.scopeLabel, view.totalAmountLabel)
              : copy.loading
          }
          actions={
            <>
              <CanvasBtn theme={theme} icon="copy" onClick={copySummary}>
                {copy.copyComment}
              </CanvasBtn>
              {headerActionDescriptors.map(renderCta)}
            </>
          }
        />

        <div style={pageBodyStyle(theme)}>
          {loading ? (
            <CanvasCard theme={theme} title={copy.breadcrumbParent}>
              <div style={{ color: theme.textMuted, fontSize: 12.5 }}>
                {copy.loading}
              </div>
            </CanvasCard>
          ) : result?.kind === "empty" ? (
            (() => {
              const treatment = getEmptyTreatment(result.empty.reason, locale);
              return (
                <CanvasBanner
                  theme={theme}
                  tone={treatment.tone}
                  icon={
                    result.empty.reason === "fetch_failed" ? "warn" : "notices"
                  }
                  title={treatment.title}
                  body={
                    <span>
                      {treatment.body}
                      <br />
                      <span
                        style={{
                          fontFamily: theme.monoFamily,
                          fontSize: 11,
                          color: theme.textMuted,
                        }}
                      >
                        {result.empty.reason} · {result.empty.messageCode}
                      </span>
                    </span>
                  }
                  actions={
                    <Link
                      href="/payments/reimbursements"
                      style={{ textDecoration: "none" }}
                    >
                      <CanvasBtn theme={theme} icon="arrow">
                        {copy.queueLink}
                      </CanvasBtn>
                    </Link>
                  }
                />
              );
            })()
          ) : view ? (
            <>
              {/* Refresh / freshness affordance (§3.2). */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Link
                    href="/payments/reimbursements"
                    style={{
                      color: theme.accent,
                      fontSize: 12,
                      textDecoration: "none",
                      fontWeight: 600,
                    }}
                  >
                    ← {copy.queueLink}
                  </Link>
                  {headerActionDescriptors.every((d) => !d.enabled) ? (
                    <span title={copy.readOnlyHint}>
                      <CanvasPill theme={theme} tone="neutral">
                        {copy.readOnly}
                      </CanvasPill>
                    </span>
                  ) : null}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <CanvasPill
                    theme={theme}
                    tone={freshnessTone(freshnessKey)}
                    dot
                  >
                    {copy.freshness[freshnessKey]}
                  </CanvasPill>
                  {refresh ? (
                    <span style={{ color: theme.textMuted, fontSize: 11 }}>
                      {copy.lastUpdated} {formatDateTime(refresh.generatedAt)} ·{" "}
                      {REFRESH_TIER_CADENCE_MS[PAGE_REFRESH_TIER] / 1000}s
                    </span>
                  ) : null}
                  <CanvasBtn theme={theme} icon="arrow" onClick={load}>
                    {t("common.refresh")}
                  </CanvasBtn>
                </div>
              </div>

              {view.reconciliationMismatch ? (
                <CanvasBanner
                  theme={theme}
                  tone="danger"
                  icon="warn"
                  title={copy.reconTitle}
                  body={copy.reconBody}
                  actions={
                    view.reconciliationLink ? (
                      <CrossAppLink
                        theme={theme}
                        link={view.reconciliationLink}
                        label={copy.reconOpen}
                      />
                    ) : null
                  }
                />
              ) : null}

              <CanvasCard theme={theme} title={copy.stateMachineTitle}>
                <Stepper
                  items={stepperItems}
                  orientation="horizontal"
                  density="compact"
                />
              </CanvasCard>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
                  gap: 16,
                  alignItems: "start",
                }}
              >
                <CanvasCard theme={theme} title={copy.headerTitle}>
                  <CanvasDL
                    theme={theme}
                    cols={2}
                    items={[
                      { k: copy.dl.batchId, v: view.batchId, mono: true },
                      { k: copy.dl.scope, v: view.scopeLabel, mono: true },
                      {
                        k: copy.dl.total,
                        v: view.totalAmountLabel,
                        mono: true,
                      },
                      {
                        k: copy.dl.state,
                        v: (
                          <CanvasPill
                            theme={theme}
                            tone={batchStateTone(view.state)}
                          >
                            {copy.states[view.state]}
                          </CanvasPill>
                        ),
                      },
                      {
                        k: copy.dl.submitter,
                        v: `${view.submitter} (${view.submitterRole})`,
                      },
                      {
                        k: copy.dl.submittedAt,
                        v: view.stamps.pending_approval
                          ? formatDateTime(view.stamps.pending_approval.at)
                          : view.stamps.draft
                            ? formatDateTime(view.stamps.draft.at)
                            : copy.dl.none,
                        mono: true,
                      },
                      {
                        k:
                          view.state === "pending_approval"
                            ? copy.dl.pendingApprover
                            : copy.dl.approver,
                        v: view.approver
                          ? `${view.approver}${view.approverRole ? ` (${view.approverRole})` : ""}`
                          : copy.dl.none,
                      },
                      {
                        k: copy.dl.linkedRecon,
                        v: view.reconciliationLink ? (
                          <CrossAppLink
                            theme={theme}
                            link={view.reconciliationLink}
                            label={`${view.reconciliationLink.label} →`}
                            inline
                          />
                        ) : (
                          copy.dl.none
                        ),
                        mono: true,
                      },
                    ]}
                  />
                </CanvasCard>

                <CanvasCard theme={theme} title={copy.timelineTitle}>
                  <Timeline items={timelineItems} density="compact" />
                </CanvasCard>
              </div>

              {view.exportArtifact ? (
                <CanvasCard theme={theme} title={copy.artifactTitle}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <CanvasDL
                      theme={theme}
                      cols={2}
                      items={[
                        {
                          k: "ARTIFACT",
                          v: view.exportArtifact.artifactId,
                          mono: true,
                        },
                        {
                          k: copy.lastUpdated,
                          v: formatDateTime(view.exportArtifact.generatedAt),
                          mono: true,
                        },
                      ]}
                    />
                    <a
                      href={view.exportArtifact.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ textDecoration: "none" }}
                    >
                      <CanvasBtn theme={theme} variant="secondary" icon="ext">
                        {copy.artifactOpen}
                      </CanvasBtn>
                    </a>
                  </div>
                </CanvasCard>
              ) : null}

              <CanvasCard
                theme={theme}
                title={copy.lineItemsTitle(view.lineItems.length)}
                padding={0}
                actions={
                  commentDescriptor ? (
                    <CanvasBtn
                      theme={theme}
                      icon="copy"
                      onClick={() => onCtaClick(commentDescriptor)}
                    >
                      {copy.commentTitle}
                    </CanvasBtn>
                  ) : null
                }
              >
                <CanvasTable
                  theme={theme}
                  dense
                  columns={lineItemColumns}
                  rows={
                    view.lineItems as (BatchLineItem &
                      Record<string, unknown>)[]
                  }
                />
              </CanvasCard>
            </>
          ) : null}
        </div>
      </CanvasShell>

      {/* Risk-classified confirmation modal (medium / high per §3.4). */}
      {pending ? (
        <div style={modalOverlayStyle()} role="dialog" aria-modal="true">
          <div style={modalCardStyle(theme)}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CanvasPill
                theme={theme}
                tone={riskTone(pending.descriptor.riskLevel)}
              >
                {pending.descriptor.riskLevel.toUpperCase()}
              </CanvasPill>
              <strong style={{ fontSize: 14, color: theme.text }}>
                {copy.actionLabels[pending.action]}
              </strong>
            </div>
            <div style={{ color: theme.textMuted, fontSize: 12.5 }}>
              {view ? `${view.batchId} · ${view.totalAmountLabel}` : null}
            </div>
            {pending.descriptor.requiresReason ? (
              <label style={{ display: "grid", gap: 6 }}>
                <span
                  style={{ fontSize: 11.5, fontWeight: 600, color: theme.text }}
                >
                  {copy.reasonLabel}
                </span>
                <textarea
                  style={textAreaStyle(theme)}
                  value={reasonText}
                  placeholder={copy.reasonPlaceholder}
                  onChange={(event) => setReasonText(event.target.value)}
                />
              </label>
            ) : null}
            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
            >
              <CanvasBtn
                theme={theme}
                variant="ghost"
                onClick={() => {
                  setPending(null);
                  setReasonText("");
                }}
              >
                {copy.cancel}
              </CanvasBtn>
              <CanvasBtn
                theme={theme}
                variant="primary"
                icon="check"
                disabled={
                  (pending.descriptor.requiresReason ?? false) &&
                  reasonText.trim().length === 0
                }
                onClick={confirmPending}
              >
                {copy.confirm}
              </CanvasBtn>
            </div>
          </div>
        </div>
      ) : null}

      {/* Comment composer (low-risk; direct action + toast per §3.4). */}
      {commentOpen ? (
        <div style={modalOverlayStyle()} role="dialog" aria-modal="true">
          <div style={modalCardStyle(theme)}>
            <strong style={{ fontSize: 14, color: theme.text }}>
              {copy.commentTitle}
            </strong>
            <textarea
              style={textAreaStyle(theme)}
              value={commentText}
              placeholder={copy.commentPlaceholder}
              onChange={(event) => setCommentText(event.target.value)}
            />
            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
            >
              <CanvasBtn
                theme={theme}
                variant="ghost"
                onClick={() => {
                  setCommentOpen(false);
                  setCommentText("");
                }}
              >
                {copy.cancel}
              </CanvasBtn>
              <CanvasBtn
                theme={theme}
                variant="primary"
                icon="copy"
                disabled={commentText.trim().length === 0}
                onClick={submitComment}
              >
                {copy.commentSubmit}
              </CanvasBtn>
            </div>
          </div>
        </div>
      ) : null}

      {/* Action receipt toast with audit deep link (§3.4). */}
      {toast ? (
        <div style={toastStyle(theme)}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CanvasPill theme={theme} tone="success" dot>
              {copy.freshness.fresh}
            </CanvasPill>
            <span>{toast.message}</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <Link
              href={`/audit?auditId=${encodeURIComponent(toast.auditId)}`}
              style={{
                color: theme.accent,
                fontSize: 11.5,
                textDecoration: "none",
              }}
            >
              {copy.viewAudit} · {toast.auditId}
            </Link>
            <CanvasBtn
              theme={theme}
              variant="ghost"
              size="xs"
              onClick={() => setToast(null)}
            >
              ✕
            </CanvasBtn>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-app / cross-page deep link (§3.10) — opens new tab when openMode says so.
// ─────────────────────────────────────────────────────────────────────────────

function CrossAppLink({
  theme,
  link,
  label,
  inline,
}: {
  theme: CanvasTheme;
  link: CrossAppResourceLink;
  label: string;
  inline?: boolean;
}) {
  const newTab = link.openMode === "new_tab";
  const anchorProps = newTab
    ? { target: "_blank", rel: "noopener noreferrer" as const }
    : {};

  if (inline) {
    return (
      <a
        href={link.route}
        {...anchorProps}
        style={{ color: theme.accent, textDecoration: "none", fontWeight: 600 }}
      >
        {label}
      </a>
    );
  }

  return (
    <a href={link.route} {...anchorProps} style={{ textDecoration: "none" }}>
      <CanvasBtn
        theme={theme}
        variant="secondary"
        icon={newTab ? "ext" : "arrow"}
      >
        {label}
      </CanvasBtn>
    </a>
  );
}
