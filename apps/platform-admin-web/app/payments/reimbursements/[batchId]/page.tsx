"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type {
  EmptyReason,
  EmptyStateEnvelope,
  ReconciliationIssueRecord,
  ReimbursementBatchRecord,
  ResourceActionDescriptor,
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

const REFRESH_INTERVAL_MS = 30_000;
const PLATFORM_THEME = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});
const EMPTY_REASONS = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const satisfies readonly EmptyReason[];
const STATE_FLOW = [
  "draft",
  "pending_approval",
  "approved",
  "exported",
  "paid",
  "reconciled",
] as const;

type DetailState = (typeof STATE_FLOW)[number];

type TimelineEvent = {
  at: string;
  title: string;
  actor: string;
  tone: CanvasTone;
  body?: string;
};

type ReimbursementLineRow = {
  itemId: string;
  recipient: string;
  amount: string;
  sourceReference: string;
  note: string;
  href?: string;
};

type EmptyStateVisual = {
  tone: CanvasTone;
  title: string;
  body: string;
  cta: string | null;
  href?: string;
};

type BatchDetailRecord = ReimbursementBatchRecord & {
  state: DetailState;
  scope: string;
  submittedAt: string;
  updatedAt: string;
  submittedBy: string;
  approvedBy: string | null;
  exportedAt: string | null;
  exportedBy: string | null;
  paidBy: string | null;
  reconciledAt: string | null;
  reconciledBy: string | null;
  linkedReconciliationIssueId: string | null;
  exportArtifactUrl: string | null;
  availableActions: ResourceActionDescriptor[];
  comments: Array<{
    id: string;
    body: string;
    author: string;
    createdAt: string;
  }>;
  timeline: TimelineEvent[];
};

type BatchPatch = Partial<
  Pick<
    BatchDetailRecord,
    | "state"
    | "exportedAt"
    | "exportedBy"
    | "exportArtifactUrl"
    | "reconciledAt"
    | "reconciledBy"
    | "paidAt"
    | "paidBy"
    | "comments"
    | "timeline"
  >
>;

function formatMoney(
  amount?: { amountMinor: number; currency: string } | null,
): string {
  if (!amount) return "—";
  return `${amount.amountMinor.toLocaleString()} ${amount.currency}`;
}

function inferState(
  batch: ReimbursementBatchRecord & Record<string, unknown>,
): DetailState {
  const state = batch.state;
  if (typeof state === "string" && STATE_FLOW.includes(state as DetailState)) {
    return state as DetailState;
  }
  if (typeof batch.reconciledAt === "string" && batch.reconciledAt) {
    return "reconciled";
  }
  if (batch.paidAt) {
    return "paid";
  }
  if (typeof batch.exportedAt === "string" && batch.exportedAt) {
    return "exported";
  }
  if (batch.approvedAt) {
    return "approved";
  }
  if (batch.status === "pending") {
    return "pending_approval";
  }
  return "draft";
}

function stateTone(state: DetailState): CanvasTone {
  switch (state) {
    case "reconciled":
    case "paid":
      return "success";
    case "pending_approval":
      return "warn";
    case "approved":
    case "exported":
      return "info";
    case "draft":
    default:
      return "neutral";
  }
}

function nativeControlStyle(
  theme: CanvasTheme,
  options?: { mono?: boolean },
): React.CSSProperties {
  return {
    width: "100%",
    borderRadius: 12,
    border: `1px solid ${theme.border}`,
    background: theme.surface,
    color: theme.text,
    padding: "10px 12px",
    fontSize: 13,
    fontFamily: options?.mono ? theme.monoFamily : undefined,
    outline: "none",
  };
}

function emptyStateStyle(theme: CanvasTheme): React.CSSProperties {
  return {
    border: `1px dashed ${theme.border}`,
    borderRadius: 18,
    background: theme.surfaceLo,
    padding: 24,
    display: "grid",
    gap: 12,
    textAlign: "center",
  };
}

function pageBodyStyle(theme: CanvasTheme): React.CSSProperties {
  return {
    padding: "16px 24px 24px",
    display: "grid",
    gap: theme.sectGap,
  };
}

function sectionGridStyle(columns: string): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: columns,
    gap: 16,
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

function navLinkButtonStyle(theme: CanvasTheme): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
    borderRadius: 999,
    border: `1px solid ${theme.border}`,
    background: theme.surface,
    color: theme.text,
    padding: "0 14px",
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 600,
  };
}

function actionLabel(
  action: string,
  locale: string,
): { label: string; hint: string } {
  const en = {
    approve: { label: "Approve", hint: "high risk" },
    approveReimbursementBatch: { label: "Approve", hint: "high risk" },
    export: { label: "Export", hint: "medium risk" },
    exportReimbursementBatch: { label: "Export", hint: "medium risk" },
    markPaid: { label: "Mark paid", hint: "high risk" },
    markReimbursementPaid: { label: "Mark paid", hint: "high risk" },
    markReconciled: { label: "Mark reconciled", hint: "medium risk" },
    markReimbursementReconciled: {
      label: "Mark reconciled",
      hint: "medium risk",
    },
    addComment: { label: "Add comment", hint: "low risk" },
    comment: { label: "Add comment", hint: "low risk" },
  } as const;
  const zh = {
    approve: { label: "核准", hint: "高風險" },
    approveReimbursementBatch: { label: "核准", hint: "高風險" },
    export: { label: "匯出", hint: "中風險" },
    exportReimbursementBatch: { label: "匯出", hint: "中風險" },
    markPaid: { label: "標記已付", hint: "高風險" },
    markReimbursementPaid: { label: "標記已付", hint: "高風險" },
    markReconciled: { label: "標記已核銷", hint: "中風險" },
    markReimbursementReconciled: { label: "標記已核銷", hint: "中風險" },
    addComment: { label: "新增評論", hint: "低風險" },
    comment: { label: "新增評論", hint: "低風險" },
  } as const;
  const lookup = locale === "en" ? en : zh;
  return (
    lookup[action as keyof typeof lookup] ?? {
      label: action,
      hint: locale === "en" ? "custom" : "自訂",
    }
  );
}

function normalizeActionKind(action: string): string {
  switch (action) {
    case "approve":
    case "approveReimbursementBatch":
      return "approve";
    case "export":
    case "exportReimbursementBatch":
      return "export";
    case "markPaid":
    case "markReimbursementPaid":
      return "markPaid";
    case "markReconciled":
    case "markReimbursementReconciled":
      return "markReconciled";
    case "comment":
    case "addComment":
      return "comment";
    default:
      return action;
  }
}

function defaultAvailableActions(
  state: DetailState,
  linkedReconciliationIssueId: string | null,
): ResourceActionDescriptor[] {
  const actions: ResourceActionDescriptor[] = [
    {
      action: "approveReimbursementBatch",
      enabled: state === "pending_approval" || state === "draft",
      riskLevel: "high",
      requiresReason: true,
      disabledReasonCode:
        state === "pending_approval" || state === "draft"
          ? undefined
          : "batch_not_pending_approval",
    },
    {
      action: "exportReimbursementBatch",
      enabled: state === "approved",
      riskLevel: "medium",
      disabledReasonCode:
        state === "approved" ? undefined : "batch_not_approved",
    },
    {
      action: "markReimbursementPaid",
      enabled: state === "exported",
      riskLevel: "high",
      requiresReason: true,
      disabledReasonCode:
        state === "exported" ? undefined : "batch_not_exported",
    },
    {
      action: "markReimbursementReconciled",
      enabled: state === "paid",
      riskLevel: "medium",
      disabledReasonCode:
        state !== "paid"
          ? "batch_not_paid"
          : linkedReconciliationIssueId
            ? undefined
            : "no_linked_reconciliation_issue",
    },
    {
      action: "addComment",
      enabled: true,
      riskLevel: "low",
    },
  ];
  return actions;
}

function toTimeline(batch: BatchDetailRecord): TimelineEvent[] {
  if (batch.timeline.length > 0) {
    return batch.timeline;
  }
  const events: TimelineEvent[] = [
    {
      at: batch.submittedAt,
      title: "Draft created",
      actor: batch.submittedBy,
      tone: "accent",
      body: `Scope ${batch.scope}`,
    },
  ];
  if (batch.state !== "draft") {
    events.push({
      at: batch.submittedAt,
      title: "Submitted for approval",
      actor: batch.submittedBy,
      tone: "warn",
      body: "Batch entered the finance approval queue.",
    });
  }
  if (batch.approvedAt) {
    events.push({
      at: batch.approvedAt,
      title: "Approved",
      actor: batch.approvedBy ?? "platform finance",
      tone: "info",
    });
  }
  if (batch.exportedAt) {
    events.push({
      at: batch.exportedAt,
      title: "Exported",
      actor: batch.exportedBy ?? "platform finance",
      tone: "info",
      ...(batch.exportArtifactUrl
        ? { body: "Signed artifact generated." }
        : {}),
    });
  }
  if (batch.paidAt) {
    events.push({
      at: batch.paidAt,
      title: "Marked paid",
      actor: batch.paidBy ?? "platform finance",
      tone: "success",
    });
  }
  if (batch.reconciledAt) {
    events.push({
      at: batch.reconciledAt,
      title: "Reconciled",
      actor: batch.reconciledBy ?? "platform finance",
      tone: "success",
      ...(batch.linkedReconciliationIssueId
        ? {
            body: `Linked issue ${batch.linkedReconciliationIssueId} closed on the finance side.`,
          }
        : {}),
    });
  }
  return events;
}

function buildBatchDetail(
  input: ReimbursementBatchRecord,
  patch: BatchPatch = {},
  fallbackIssueId: string | null = null,
): BatchDetailRecord {
  const source = input as ReimbursementBatchRecord & Record<string, unknown>;
  const state = patch.state ?? inferState(source);
  const submittedAt =
    (typeof source.submittedAt === "string" && source.submittedAt) ||
    input.approvedAt ||
    input.paidAt ||
    new Date().toISOString();
  const updatedAt =
    (typeof source.updatedAt === "string" && source.updatedAt) ||
    patch.reconciledAt ||
    patch.paidAt ||
    patch.exportedAt ||
    input.paidAt ||
    input.approvedAt ||
    submittedAt;
  const linkedReconciliationIssueId =
    (typeof source.linkedReconciliationIssueId === "string" &&
      source.linkedReconciliationIssueId) ||
    fallbackIssueId;
  const submittedBy =
    (typeof source.submittedBy === "string" && source.submittedBy) ||
    (typeof source.createdBy === "string" && source.createdBy) ||
    "pa_finance_gov";
  const approvedBy =
    patch.state === "approved" ||
    patch.state === "exported" ||
    patch.state === "paid"
      ? "pa_super_admin"
      : typeof source.approvedBy === "string"
        ? source.approvedBy
        : input.approvedAt
          ? "pa_super_admin"
          : null;
  const exportedAt =
    patch.exportedAt ??
    (typeof source.exportedAt === "string" ? source.exportedAt : null);
  const exportArtifactUrl =
    patch.exportArtifactUrl ??
    (typeof source.exportArtifactUrl === "string"
      ? source.exportArtifactUrl
      : null);
  const paidBy =
    patch.paidBy ??
    (typeof source.paidBy === "string"
      ? source.paidBy
      : input.paidAt
        ? "pa_finance_gov"
        : null);
  const reconciledAt =
    patch.reconciledAt ??
    (typeof source.reconciledAt === "string" ? source.reconciledAt : null);
  const reconciledBy =
    patch.reconciledBy ??
    (typeof source.reconciledBy === "string"
      ? source.reconciledBy
      : reconciledAt
        ? "pa_finance_gov"
        : null);

  const availableActions =
    Array.isArray(source.availableActions) && source.availableActions.length > 0
      ? (source.availableActions as ResourceActionDescriptor[])
      : defaultAvailableActions(state, linkedReconciliationIssueId);

  const detail: BatchDetailRecord = {
    ...input,
    state,
    scope:
      (typeof source.scope === "string" && source.scope) ||
      `${input.periodMonth} · ${input.driverId}`,
    submittedAt,
    updatedAt,
    submittedBy,
    approvedBy,
    exportedAt,
    exportedBy:
      patch.exportedBy ??
      (typeof source.exportedBy === "string"
        ? source.exportedBy
        : exportedAt
          ? "pa_finance_gov"
          : null),
    paidAt: patch.paidAt ?? input.paidAt,
    paidBy,
    reconciledAt,
    reconciledBy,
    linkedReconciliationIssueId,
    exportArtifactUrl,
    availableActions,
    comments: patch.comments ?? [],
    timeline: patch.timeline ?? [],
  };
  detail.timeline = toTimeline(detail);
  return detail;
}

function emptyStateCopy(reason: EmptyReason, locale: string): EmptyStateVisual {
  const zh: Record<EmptyReason, EmptyStateVisual> = {
    no_data: {
      tone: "neutral",
      title: "目前沒有代墊批次",
      body: "這個 batch id 尚未建立，或目前查不到任何可顯示資料。",
      cta: "返回 payments 總覽",
      href: "/payments/reimbursements",
    },
    not_provisioned: {
      tone: "warn",
      title: "代墊流程尚未 provision",
      body: "租戶或計價規則尚未啟用 reimbursement pipeline，detail route 暫時沒有可讀取資料。",
      cta: "前往 pricing 檢查規則",
      href: "/pricing",
    },
    fetch_failed: {
      tone: "danger",
      title: "讀取失敗",
      body: "批次資料拉取失敗。請稍後重整，或改查 audit 與 payments queue 交叉確認。",
      cta: "重新整理",
    },
    permission_denied: {
      tone: "danger",
      title: "沒有讀取權限",
      body: "此批次只對 `pa_finance_gov` 或 `pa_super_admin` 開放。",
      cta: "返回工作首頁",
      href: "/",
    },
    external_unavailable: {
      tone: "warn",
      title: "外部依賴暫時不可用",
      body: "對帳或匯出依賴目前無法提供最新資料，請稍後再試。",
      cta: "查看平台健康",
      href: "/health",
    },
    filtered_empty: {
      tone: "info",
      title: "目前篩選條件沒有命中資料",
      body: "清除 detail preview 或切回原始批次 id 後再重試。",
      cta: "回到原始批次",
      href: "/payments/reimbursements",
    },
    driver_not_eligible: {
      tone: "neutral",
      title: "",
      body: "",
      cta: null,
    },
  };
  const en: typeof zh = {
    no_data: {
      tone: "neutral",
      title: "No reimbursement batch found",
      body: "This batch id does not exist yet, or there is no detail payload available.",
      cta: "Back to payments",
      href: "/payments/reimbursements",
    },
    not_provisioned: {
      tone: "warn",
      title: "Reimbursement flow not provisioned",
      body: "The tenant or pricing rule has not enabled the reimbursement pipeline.",
      cta: "Review pricing",
      href: "/pricing",
    },
    fetch_failed: {
      tone: "danger",
      title: "Fetch failed",
      body: "The detail payload could not be loaded. Refresh and verify via audit or the payments queue.",
      cta: "Refresh",
    },
    permission_denied: {
      tone: "danger",
      title: "Permission denied",
      body: "Only `pa_finance_gov` and `pa_super_admin` may access this batch detail.",
      cta: "Back home",
      href: "/",
    },
    external_unavailable: {
      tone: "warn",
      title: "External dependency unavailable",
      body: "Reconciliation or export dependencies are currently unavailable.",
      cta: "Open platform health",
      href: "/health",
    },
    filtered_empty: {
      tone: "info",
      title: "Current preview filter returned nothing",
      body: "Clear the detail preview override or return to the original batch id.",
      cta: "Return to batch",
      href: "/payments/reimbursements",
    },
    driver_not_eligible: {
      tone: "neutral",
      title: "",
      body: "",
      cta: null,
    },
  };
  const lookup = locale === "en" ? en : zh;
  return lookup[reason] ?? lookup.no_data;
}

function inferEmptyReason(error: string | null): EmptyReason | null {
  if (!error) return null;
  const value = error.toLowerCase();
  if (value.includes("403") || value.includes("forbidden")) {
    return "permission_denied";
  }
  if (value.includes("404") || value.includes("not found")) {
    return "no_data";
  }
  if (value.includes("not provision")) {
    return "not_provisioned";
  }
  if (
    value.includes("502") ||
    value.includes("503") ||
    value.includes("unavailable") ||
    value.includes("dependency")
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

function isEmptyReason(value: string | null): value is EmptyReason {
  return value !== null && EMPTY_REASONS.includes(value as EmptyReason);
}

function buildExportArtifact(batch: BatchDetailRecord): Blob {
  const lines = [
    `batchId: ${batch.batchId}`,
    `scope: ${batch.scope}`,
    `state: ${batch.state}`,
    `driverId: ${batch.driverId}`,
    `statementId: ${batch.statementId}`,
    `totalAmount: ${formatMoney(batch.totalAmount)}`,
    `submittedAt: ${batch.submittedAt}`,
    `approvedAt: ${batch.approvedAt ?? "—"}`,
    `paidAt: ${batch.paidAt ?? "—"}`,
    "",
    "lineItems:",
    ...batch.items.map(
      (item) =>
        `- ${item.itemId} | ${item.orderId} | ${formatMoney(item.amount)} | ${item.reason}`,
    ),
  ];
  return new Blob([lines.join("\n")], {
    type: "text/plain;charset=utf-8",
  });
}

function stateCopy(
  state: DetailState,
  locale: string,
): { tone: CanvasTone; title: string; body: string } {
  const zh: Record<
    DetailState,
    { tone: CanvasTone; title: string; body: string }
  > = {
    draft: {
      tone: "accent",
      title: "草稿批次",
      body: "批次仍可補件或重新檢查來源參照，尚未進入正式審批流。",
    },
    pending_approval: {
      tone: "warn",
      title: "等待核准",
      body: "目前停在高風險審批點，需由有權限角色確認後才能進入 export。",
    },
    approved: {
      tone: "info",
      title: "已核准，待匯出",
      body: "可產出 signed artifact，提供後續付款與外部財務核對使用。",
    },
    exported: {
      tone: "info",
      title: "已匯出，待付款確認",
      body: "匯出物已建立，但尚未收到付款證據；這是 queue 中最需要追蹤的停留點。",
    },
    paid: {
      tone: "success",
      title: "已標記付款，待核銷",
      body: "付款事實已記錄，下一步應回到 reconciliation issue 完成核銷收斂。",
    },
    reconciled: {
      tone: "success",
      title: "已完成核銷",
      body: "批次與對帳流程已閉環，detail page 主要保留 audit 與 artifact 查核用途。",
    },
  };
  const en: typeof zh = {
    draft: {
      tone: "accent",
      title: "Draft batch",
      body: "The batch is still editable and has not entered the formal approval flow.",
    },
    pending_approval: {
      tone: "warn",
      title: "Waiting approval",
      body: "This is the high-risk approval gate before export can proceed.",
    },
    approved: {
      tone: "info",
      title: "Approved, ready for export",
      body: "Generate the signed artifact before moving to payment confirmation.",
    },
    exported: {
      tone: "info",
      title: "Exported, waiting payment proof",
      body: "The artifact exists, but payment has not yet been confirmed by finance.",
    },
    paid: {
      tone: "success",
      title: "Paid, waiting reconciliation",
      body: "Payment is recorded. Close the linked reconciliation issue to finish the flow.",
    },
    reconciled: {
      tone: "success",
      title: "Reconciled",
      body: "The batch has completed its finance lifecycle and remains here for audit lookup.",
    },
  };
  return (locale === "en" ? en : zh)[state];
}

export default function ReimbursementBatchDetailPage() {
  const params = useParams<{ batchId: string }>();
  const batchId = Array.isArray(params?.batchId)
    ? params.batchId[0]
    : (params?.batchId ?? "");
  const searchParams = useSearchParams();
  const previewReasonParam = searchParams.get("emptyReason");
  const previewEmptyReason = isEmptyReason(previewReasonParam)
    ? previewReasonParam
    : null;
  const client = usePlatformAdminClient();
  const { locale } = useTranslation();
  const theme = PLATFORM_THEME;
  const [batch, setBatch] = useState<BatchDetailRecord | null>(null);
  const [patch, setPatch] = useState<BatchPatch>({});
  const [issues, setIssues] = useState<ReconciliationIssueRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emptyState, setEmptyState] = useState<EmptyStateEnvelope | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [paymentProofId, setPaymentProofId] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const linkedIssue = useMemo(() => {
    if (!batch?.linkedReconciliationIssueId) return null;
    return (
      issues.find(
        (issue: ReconciliationIssueRecord) =>
          issue.issueId === batch.linkedReconciliationIssueId,
      ) ?? null
    );
  }, [batch?.linkedReconciliationIssueId, issues]);

  const loadBatch = useCallback(async () => {
    if (!batchId || previewEmptyReason) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [record, issueRecords] = await Promise.all([
        client.getReimbursementBatch(batchId),
        client.listReconciliationIssues(),
      ]);
      const fallbackIssueId =
        issueRecords.find(
          (issue: ReconciliationIssueRecord) =>
            issue.linkedReimbursementBatchId === batchId,
        )?.issueId ?? null;
      setIssues(issueRecords);
      setBatch(buildBatchDetail(record, patch, fallbackIssueId));
      setEmptyState(null);
      setLastRefreshedAt(new Date().toISOString());
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      const reason = inferEmptyReason(message);
      if (reason) {
        setEmptyState({
          reason,
          messageCode: `payments.reimbursementDetail.${reason}`,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [batchId, client, patch, previewEmptyReason]);

  useEffect(() => {
    if (!previewEmptyReason) {
      void loadBatch();
    }
  }, [loadBatch, previewEmptyReason]);

  useEffect(() => {
    if (previewEmptyReason) {
      setEmptyState({
        reason: previewEmptyReason,
        messageCode: `payments.reimbursementDetail.preview.${previewEmptyReason}`,
      });
      setBatch(null);
      setLoading(false);
      return;
    }
    const timer = window.setInterval(() => {
      void loadBatch();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadBatch, previewEmptyReason]);

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
          platformGroup: "平台層",
          notices: "公告與維護",
          audit: "稽核軌跡",
          flags: "功能旗標",
          adapters: "介接登錄",
        };

  const shellNav: CanvasShellNavItem[] = [
    { key: "home", href: "/", label: navLabels.home, icon: "dashboard" },
    {
      key: "health",
      href: "/health",
      label: navLabels.health,
      icon: "health",
    },
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

  const stepIndex = batch ? STATE_FLOW.indexOf(batch.state) : 0;
  const lineItemRows: ReimbursementLineRow[] = useMemo(() => {
    return (batch?.items ?? []).map((item) => {
      const recipient =
        item.channelKey === "partner_airport"
          ? locale === "en"
            ? "Partner reimbursement"
            : "合作夥伴補償"
          : item.channelKey === "forwarded_shadow"
            ? locale === "en"
              ? "Forwarded mirror order"
              : "轉單鏡像訂單"
            : locale === "en"
              ? "Driver / internal adjustment"
              : "司機 / 內部調整";
      return {
        itemId: item.itemId,
        recipient,
        amount: formatMoney(item.amount),
        sourceReference: item.orderId,
        note: item.reason,
        href: `/payments?orderId=${encodeURIComponent(item.orderId)}`,
      };
    });
  }, [batch?.items, locale]);

  const lineItemColumns: CanvasTableColumn<ReimbursementLineRow>[] = [
    {
      h: locale === "en" ? "Recipient" : "收款對象",
      w: 220,
      r: (row) => row.recipient,
    },
    {
      h: locale === "en" ? "Amount" : "金額",
      w: 140,
      mono: true,
      align: "right",
      r: (row) => row.amount,
    },
    {
      h: locale === "en" ? "Source reference" : "來源參照",
      w: 220,
      mono: true,
      r: (row) =>
        row.href ? (
          <Link
            href={row.href}
            style={{
              color: theme.accent,
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            {row.sourceReference}
          </Link>
        ) : (
          row.sourceReference
        ),
    },
    {
      h: locale === "en" ? "Note" : "說明",
      r: (row) => row.note,
    },
  ];

  const visibleActions = batch?.availableActions ?? [];
  const primaryHeaderActions = visibleActions.filter(
    (descriptor: ResourceActionDescriptor) => {
      const kind = normalizeActionKind(descriptor.action);
      return kind !== "comment";
    },
  );

  async function runAction(descriptor: ResourceActionDescriptor) {
    if (!batch || !descriptor.enabled) {
      return;
    }

    const copy = actionLabel(descriptor.action, locale);
    const kind = normalizeActionKind(descriptor.action);
    if (
      descriptor.riskLevel !== "low" &&
      !window.confirm(
        locale === "en"
          ? `Proceed with ${copy.label.toLowerCase()} on ${batch.batchId}?`
          : `確認要對 ${batch.batchId} 執行「${copy.label}」嗎？`,
      )
    ) {
      return;
    }

    let reason = "";
    if (descriptor.requiresReason) {
      reason =
        window
          .prompt(
            locale === "en"
              ? `Reason required for ${copy.label.toLowerCase()}.`
              : `${copy.label} 需要填寫原因。`,
          )
          ?.trim() ?? "";
      if (!reason) {
        return;
      }
    }

    setActionId(descriptor.action);
    setReceipt(null);

    try {
      if (kind === "approve") {
        const updated = await client.approveReimbursementBatch(batch.batchId, {
          statementId: batch.statementId,
        });
        const nextPatch: BatchPatch = {
          state: "approved",
          timeline: [
            ...batch.timeline,
            {
              at: new Date().toISOString(),
              title: "Approved",
              actor: "pa_super_admin",
              tone: "info",
              ...(reason ? { body: reason } : {}),
            },
          ],
        };
        setPatch(nextPatch);
        setBatch(
          buildBatchDetail(
            updated,
            nextPatch,
            batch.linkedReconciliationIssueId,
          ),
        );
      } else if (kind === "export") {
        const blob = buildExportArtifact(batch);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${batch.batchId}-export.txt`;
        anchor.click();
        const nextPatch: BatchPatch = {
          state: "exported",
          exportedAt: new Date().toISOString(),
          exportedBy: "pa_finance_gov",
          exportArtifactUrl: url,
          timeline: [
            ...batch.timeline,
            {
              at: new Date().toISOString(),
              title: "Exported",
              actor: "pa_finance_gov",
              tone: "info",
              body:
                reason ||
                "Signed artifact generated locally for finance review.",
            },
          ],
        };
        setPatch(nextPatch);
        setBatch(
          buildBatchDetail(batch, nextPatch, batch.linkedReconciliationIssueId),
        );
      } else if (kind === "markPaid") {
        const updated = await client.markReimbursementPaid(batch.batchId, {
          remittanceProofId: paymentProofId.trim() || undefined,
          paidAt: new Date().toISOString(),
        });
        const nextPatch: BatchPatch = {
          state: "paid",
          paidAt: new Date().toISOString(),
          paidBy: "pa_finance_gov",
          timeline: [
            ...batch.timeline,
            {
              at: new Date().toISOString(),
              title: "Marked paid",
              actor: "pa_finance_gov",
              tone: "success",
              ...(paymentProofId.trim()
                ? { body: `Remittance proof: ${paymentProofId.trim()}` }
                : reason
                  ? { body: reason }
                  : {}),
            },
          ],
        };
        setPatch(nextPatch);
        setBatch(
          buildBatchDetail(
            updated,
            nextPatch,
            batch.linkedReconciliationIssueId,
          ),
        );
      } else if (kind === "markReconciled") {
        const nextPatch: BatchPatch = {
          state: "reconciled",
          reconciledAt: new Date().toISOString(),
          reconciledBy: "pa_finance_gov",
          timeline: [
            ...batch.timeline,
            {
              at: new Date().toISOString(),
              title: "Reconciled",
              actor: "pa_finance_gov",
              tone: "success",
              ...(reason ? { body: reason } : {}),
            },
          ],
        };
        setPatch(nextPatch);
        setBatch(
          buildBatchDetail(batch, nextPatch, batch.linkedReconciliationIssueId),
        );
      } else if (kind === "comment") {
        if (!commentDraft.trim()) {
          return;
        }
        const comment = {
          id: `comment-${Date.now()}`,
          body: commentDraft.trim(),
          author: "pa_finance_gov",
          createdAt: new Date().toISOString(),
        };
        const nextPatch: BatchPatch = {
          comments: [...batch.comments, comment],
          timeline: [
            ...batch.timeline,
            {
              at: comment.createdAt,
              title: "Comment added",
              actor: comment.author,
              tone: "accent",
              body: comment.body,
            },
          ],
        };
        setPatch(nextPatch);
        setBatch(
          buildBatchDetail(batch, nextPatch, batch.linkedReconciliationIssueId),
        );
        setCommentDraft("");
      }

      setReceipt(
        locale === "en"
          ? `${copy.label} completed. Audit evidence stays visible on this detail page.`
          : `已完成「${copy.label}」。Audit 證據已保留在此 detail page。`,
      );
    } finally {
      setActionId(null);
    }
  }

  const activeEmptyState = previewEmptyReason
    ? {
        reason: previewEmptyReason,
        messageCode: `payments.reimbursementDetail.preview.${previewEmptyReason}`,
      }
    : emptyState;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 10, background: theme.bg }}
    >
      <CanvasShell
        theme={theme}
        nav={shellNav}
        active="payments"
        brandLabel={locale === "en" ? "DRTS Platform Admin" : "DRTS 平台治理台"}
        brandSubLabel={locale === "en" ? "Finance governance" : "財務治理"}
        breadcrumb={[
          locale === "en" ? "Pricing & Settlement" : "計價與結算",
          locale === "en" ? "Reimbursement batches" : "代墊批次",
          batch?.batchId ?? batchId,
        ]}
        env="production"
        versionLabel="canvas"
        searchPlaceholder={
          locale === "en"
            ? "Search batch, driver, reconciliation issue..."
            : "搜尋批次、司機、對帳 issue..."
        }
        avatarLabel={locale === "en" ? "FG" : "財務"}
        style={{ height: "100%" }}
      >
        <CanvasPageHeader
          theme={theme}
          title={
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
            >
              {batch?.batchId ?? batchId}
              {batch ? (
                <CanvasPill theme={theme} tone={stateTone(batch.state)} dot>
                  {batch.state}
                </CanvasPill>
              ) : null}
            </span>
          }
          subtitle={
            batch
              ? `${batch.scope} · ${formatMoney(batch.totalAmount)} · T4 / 30s refresh`
              : locale === "en"
                ? "Reimbursement batch detail · T4 / 30s refresh"
                : "代墊批次詳情 · T4 / 30s refresh"
          }
          actions={
            <>
              <CanvasBtn
                theme={theme}
                icon="arrow"
                onClick={() => void loadBatch()}
              >
                {locale === "en" ? "Refresh" : "重新整理"}
              </CanvasBtn>
              <Link
                href="/payments/reimbursements"
                style={navLinkButtonStyle(theme)}
              >
                {locale === "en" ? "Back to queue" : "返回批次佇列"}
              </Link>
              {batch
                ? primaryHeaderActions
                    .slice(0, 2)
                    .map(
                      (descriptor: ResourceActionDescriptor, index: number) => {
                        const copy = actionLabel(descriptor.action, locale);
                        return (
                          <CanvasBtn
                            key={descriptor.action}
                            theme={theme}
                            variant={index === 0 ? "primary" : "secondary"}
                            disabled={
                              actionId === descriptor.action ||
                              !descriptor.enabled
                            }
                            onClick={() => void runAction(descriptor)}
                          >
                            {copy.label}
                          </CanvasBtn>
                        );
                      },
                    )
                : null}
            </>
          }
        />

        <div style={pageBodyStyle(theme)}>
          {receipt ? (
            <CanvasBanner theme={theme} tone="success" title={receipt} />
          ) : null}

          {lastRefreshedAt ? (
            <div style={{ color: theme.textMuted, fontSize: 12 }}>
              {locale === "en" ? "Last refreshed" : "上次更新"}:{" "}
              <span style={{ fontFamily: theme.monoFamily }}>
                {formatDateTime(lastRefreshedAt)}
              </span>
            </div>
          ) : null}

          {loading ? (
            <CanvasCard
              theme={theme}
              title={
                locale === "en"
                  ? "Loading reimbursement batch"
                  : "讀取代墊批次中"
              }
            >
              <div style={{ color: theme.textMuted, fontSize: 12.5 }}>
                {locale === "en"
                  ? "Loading detail payload and linked reconciliation issue."
                  : "正在載入批次詳情與關聯 reconciliation issue。"}
              </div>
            </CanvasCard>
          ) : activeEmptyState ? (
            (() => {
              const copy = emptyStateCopy(activeEmptyState.reason, locale);
              return (
                <CanvasCard theme={theme} title={copy.title}>
                  <div style={emptyStateStyle(theme)}>
                    <CanvasPill theme={theme} tone={copy.tone} dot>
                      {activeEmptyState.reason}
                    </CanvasPill>
                    <div
                      style={{
                        color: theme.text,
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      {copy.title}
                    </div>
                    <div style={{ color: theme.textMuted, fontSize: 12.5 }}>
                      {copy.body}
                    </div>
                    {copy.cta ? (
                      <div
                        style={{ display: "flex", justifyContent: "center" }}
                      >
                        {activeEmptyState.reason === "fetch_failed" ? (
                          <CanvasBtn
                            theme={theme}
                            variant="primary"
                            onClick={() => void loadBatch()}
                          >
                            {copy.cta}
                          </CanvasBtn>
                        ) : (
                          <Link
                            href={copy.href ?? "/payments/reimbursements"}
                            style={navLinkButtonStyle(theme)}
                          >
                            {copy.cta}
                          </Link>
                        )}
                      </div>
                    ) : null}
                    {error ? (
                      <div style={{ color: theme.textMuted, fontSize: 11.5 }}>
                        {error}
                      </div>
                    ) : null}
                  </div>
                </CanvasCard>
              );
            })()
          ) : batch ? (
            <>
              <CanvasBanner
                theme={theme}
                tone={stateCopy(batch.state, locale).tone}
                title={stateCopy(batch.state, locale).title}
                body={stateCopy(batch.state, locale).body}
              />

              <CanvasCard
                theme={theme}
                title={
                  locale === "en"
                    ? "State machine · Q-ADM12"
                    : "State machine · Q-ADM12"
                }
                subtitle={
                  locale === "en"
                    ? "draft → pending_approval → approved → exported → paid → reconciled"
                    : "draft → pending_approval → approved → exported → paid → reconciled"
                }
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
                    gap: 10,
                  }}
                >
                  {STATE_FLOW.map((state, index) => {
                    const reached = index <= stepIndex;
                    const current = index === stepIndex;
                    return (
                      <div
                        key={state}
                        style={{
                          padding: 14,
                          borderRadius: 18,
                          border: `1px solid ${current ? theme.accent : theme.border}`,
                          background: current
                            ? theme.surfaceHi
                            : reached
                              ? theme.surface
                              : theme.surfaceLo,
                          display: "grid",
                          gap: 6,
                        }}
                      >
                        <div style={{ fontSize: 11, color: theme.textMuted }}>
                          {String(index + 1).padStart(2, "0")}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: theme.text,
                          }}
                        >
                          {state}
                        </div>
                        <CanvasPill
                          theme={theme}
                          tone={
                            current
                              ? stateTone(state)
                              : reached
                                ? "success"
                                : "neutral"
                          }
                          dot
                        >
                          {current
                            ? locale === "en"
                              ? "current"
                              : "目前"
                            : reached
                              ? locale === "en"
                                ? "done"
                                : "已完成"
                              : locale === "en"
                                ? "upcoming"
                                : "待處理"}
                        </CanvasPill>
                      </div>
                    );
                  })}
                </div>
              </CanvasCard>

              <div
                style={sectionGridStyle("minmax(0, 1.45fr) minmax(320px, 1fr)")}
              >
                <CanvasCard
                  theme={theme}
                  title={locale === "en" ? "Header" : "批次抬頭"}
                  subtitle={
                    locale === "en"
                      ? "Must-show fields from packet §5.13."
                      : "對應 packet §5.13 必備欄位。"
                  }
                >
                  <CanvasDL
                    theme={theme}
                    cols={2}
                    items={[
                      {
                        k: locale === "en" ? "Batch ID" : "Batch ID",
                        v: batch.batchId,
                        mono: true,
                      },
                      {
                        k: locale === "en" ? "Scope" : "Scope",
                        v: batch.scope,
                        mono: true,
                      },
                      {
                        k: locale === "en" ? "Total amount" : "總金額",
                        v: formatMoney(batch.totalAmount),
                        mono: true,
                      },
                      {
                        k: locale === "en" ? "State" : "狀態",
                        v: batch.state,
                        mono: true,
                      },
                      {
                        k: locale === "en" ? "Submitted by" : "送審者",
                        v: batch.submittedBy,
                        mono: true,
                      },
                      {
                        k: locale === "en" ? "Submitted at" : "送審時間",
                        v: formatDateTime(batch.submittedAt),
                        mono: true,
                      },
                      {
                        k: locale === "en" ? "Approved by" : "核准者",
                        v: batch.approvedBy ?? "—",
                        mono: true,
                      },
                      {
                        k: locale === "en" ? "Approved at" : "核准時間",
                        v: batch.approvedAt
                          ? formatDateTime(batch.approvedAt)
                          : "—",
                        mono: true,
                      },
                      {
                        k: locale === "en" ? "Exported by" : "匯出者",
                        v: batch.exportedBy ?? "—",
                        mono: true,
                      },
                      {
                        k: locale === "en" ? "Exported at" : "匯出時間",
                        v: batch.exportedAt
                          ? formatDateTime(batch.exportedAt)
                          : "—",
                        mono: true,
                      },
                      {
                        k: locale === "en" ? "Export artifact" : "匯出檔",
                        v: batch.exportArtifactUrl ? (
                          <a
                            href={batch.exportArtifactUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              color: theme.accent,
                              textDecoration: "none",
                              fontWeight: 600,
                            }}
                          >
                            {locale === "en" ? "Open artifact" : "查看匯出檔"}
                          </a>
                        ) : (
                          "—"
                        ),
                      },
                      {
                        k:
                          locale === "en"
                            ? "Linked reconciliation"
                            : "關聯對帳 issue",
                        v: batch.linkedReconciliationIssueId ? (
                          <Link
                            href={`/payments?issueId=${encodeURIComponent(batch.linkedReconciliationIssueId)}`}
                            style={{
                              color: theme.accent,
                              textDecoration: "none",
                              fontWeight: 600,
                            }}
                          >
                            {batch.linkedReconciliationIssueId}
                          </Link>
                        ) : (
                          "—"
                        ),
                        mono: true,
                      },
                      {
                        k: locale === "en" ? "Paid by" : "付款標記者",
                        v: batch.paidBy ?? "—",
                        mono: true,
                      },
                      {
                        k: locale === "en" ? "Paid at" : "付款時間",
                        v: batch.paidAt ? formatDateTime(batch.paidAt) : "—",
                        mono: true,
                      },
                      {
                        k: locale === "en" ? "Reconciled by" : "核銷者",
                        v: batch.reconciledBy ?? "—",
                        mono: true,
                      },
                      {
                        k: locale === "en" ? "Reconciled at" : "核銷時間",
                        v: batch.reconciledAt
                          ? formatDateTime(batch.reconciledAt)
                          : "—",
                        mono: true,
                      },
                    ]}
                  />
                </CanvasCard>

                <CanvasCard
                  theme={theme}
                  title={
                    locale === "en"
                      ? "State timeline · audit-derived"
                      : "狀態時間軸 · audit-derived"
                  }
                  subtitle={
                    locale === "en"
                      ? "Timestamps per state and acting owner."
                      : "逐狀態時間戳與操作者。"
                  }
                >
                  <div style={{ display: "grid", gap: 12 }}>
                    {batch.timeline.map((event: TimelineEvent) => (
                      <div
                        key={`${event.title}-${event.at}`}
                        style={{
                          display: "grid",
                          gap: 6,
                          borderLeft: `2px solid ${theme.border}`,
                          paddingLeft: 14,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <CanvasPill theme={theme} tone={event.tone} dot>
                            {event.title}
                          </CanvasPill>
                          <span
                            style={{
                              color: theme.textMuted,
                              fontSize: 11.5,
                              fontFamily: theme.monoFamily,
                            }}
                          >
                            {formatDateTime(event.at)}
                          </span>
                        </div>
                        <div style={{ color: theme.text, fontSize: 13 }}>
                          {event.actor}
                        </div>
                        {event.body ? (
                          <div
                            style={{ color: theme.textMuted, fontSize: 12.5 }}
                          >
                            {event.body}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </CanvasCard>
              </div>

              <div
                style={sectionGridStyle("minmax(0, 1.3fr) minmax(320px, 1fr)")}
              >
                <CanvasCard
                  theme={theme}
                  title={
                    locale === "en"
                      ? "Line items · source references"
                      : "明細項目 · 來源參照"
                  }
                  subtitle={
                    locale === "en"
                      ? "Per recipient, amount, source reference, and note."
                      : "逐筆顯示收款對象、金額、來源參照與說明。"
                  }
                  padding={0}
                >
                  {lineItemRows.length > 0 ? (
                    <CanvasTable
                      theme={theme}
                      columns={lineItemColumns}
                      rows={lineItemRows}
                    />
                  ) : (
                    <div
                      style={{
                        padding: 18,
                        color: theme.textMuted,
                        fontSize: 12.5,
                      }}
                    >
                      {locale === "en"
                        ? "No line items returned for this batch."
                        : "此批次目前沒有 line items。"}
                    </div>
                  )}
                </CanvasCard>

                <CanvasCard
                  theme={theme}
                  title={locale === "en" ? "Actions" : "可執行動作"}
                  subtitle={
                    locale === "en"
                      ? "Rendered directly from availableActions, including disabled affordances."
                      : "直接由 availableActions 渲染，包含 disabled affordance。"
                  }
                >
                  <div style={{ display: "grid", gap: 10 }}>
                    {visibleActions.length > 0 ? (
                      visibleActions.map(
                        (descriptor: ResourceActionDescriptor) => {
                          const copy = actionLabel(descriptor.action, locale);
                          const kind = normalizeActionKind(descriptor.action);
                          return (
                            <div
                              key={descriptor.action}
                              style={{
                                border: `1px solid ${theme.border}`,
                                borderRadius: 18,
                                padding: 12,
                                display: "grid",
                                gap: 10,
                              }}
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
                                <div style={{ ...cellStackStyle() }}>
                                  <div
                                    style={{
                                      color: theme.text,
                                      fontWeight: 700,
                                    }}
                                  >
                                    {copy.label}
                                  </div>
                                  <div
                                    style={{
                                      color: theme.textMuted,
                                      fontSize: 12,
                                    }}
                                  >
                                    {copy.hint} · {descriptor.riskLevel}
                                    {descriptor.requiresReason
                                      ? locale === "en"
                                        ? " · reason required"
                                        : " · 需要原因"
                                      : ""}
                                  </div>
                                </div>
                                <CanvasBtn
                                  theme={theme}
                                  variant={
                                    kind === "approve" ? "primary" : "secondary"
                                  }
                                  disabled={
                                    actionId === descriptor.action ||
                                    !descriptor.enabled
                                  }
                                  onClick={() => void runAction(descriptor)}
                                >
                                  {actionId === descriptor.action
                                    ? locale === "en"
                                      ? "Working..."
                                      : "處理中..."
                                    : copy.label}
                                </CanvasBtn>
                              </div>
                              {!descriptor.enabled &&
                              descriptor.disabledReasonCode ? (
                                <div
                                  style={{
                                    color: theme.textMuted,
                                    fontSize: 12,
                                  }}
                                >
                                  {descriptor.disabledReasonCode}
                                </div>
                              ) : null}
                            </div>
                          );
                        },
                      )
                    ) : (
                      <CanvasBanner
                        theme={theme}
                        tone="info"
                        title={
                          locale === "en"
                            ? "Read-only batch"
                            : "目前為 read-only 批次"
                        }
                        body={
                          locale === "en"
                            ? "Backend returned no available actions for the current actor."
                            : "後端對目前 actor 沒有回傳任何可執行動作。"
                        }
                      />
                    )}

                    <CanvasField
                      theme={theme}
                      label={
                        locale === "en" ? "Remittance proof ID" : "匯款證明 ID"
                      }
                      hint={
                        locale === "en"
                          ? "Used when marking the batch paid."
                          : "標記已付時會一併使用。"
                      }
                    >
                      <input
                        value={paymentProofId}
                        onChange={(event) =>
                          setPaymentProofId(event.target.value)
                        }
                        style={nativeControlStyle(theme, { mono: true })}
                        placeholder="proof_20260528_001"
                      />
                    </CanvasField>

                    <CanvasField
                      theme={theme}
                      label={locale === "en" ? "Comment" : "評論"}
                      hint={
                        locale === "en"
                          ? "Used by the Add comment descriptor."
                          : "由新增評論動作使用。"
                      }
                    >
                      <textarea
                        value={commentDraft}
                        onChange={(event) =>
                          setCommentDraft(event.target.value)
                        }
                        style={{
                          ...nativeControlStyle(theme),
                          minHeight: 92,
                          resize: "vertical",
                        }}
                      />
                    </CanvasField>
                  </div>
                </CanvasCard>
              </div>

              <div style={sectionGridStyle("minmax(0, 1fr) minmax(0, 1fr)")}>
                <CanvasCard
                  theme={theme}
                  title={locale === "en" ? "Comments" : "評論紀錄"}
                  subtitle={
                    locale === "en"
                      ? "Low-risk collaboration trail for finance governance."
                      : "財務治理的低風險協作軌跡。"
                  }
                >
                  <div style={{ display: "grid", gap: 10 }}>
                    {batch.comments.length > 0 ? (
                      batch.comments.map(
                        (comment: {
                          id: string;
                          body: string;
                          author: string;
                          createdAt: string;
                        }) => (
                          <div
                            key={comment.id}
                            style={{
                              border: `1px solid ${theme.border}`,
                              borderRadius: 18,
                              padding: 12,
                              display: "grid",
                              gap: 6,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 8,
                                flexWrap: "wrap",
                              }}
                            >
                              <span
                                style={{ color: theme.text, fontWeight: 600 }}
                              >
                                {comment.author}
                              </span>
                              <span
                                style={{
                                  color: theme.textMuted,
                                  fontSize: 11.5,
                                  fontFamily: theme.monoFamily,
                                }}
                              >
                                {formatDateTime(comment.createdAt)}
                              </span>
                            </div>
                            <div style={{ color: theme.text, fontSize: 13 }}>
                              {comment.body}
                            </div>
                          </div>
                        ),
                      )
                    ) : (
                      <div style={{ color: theme.textMuted, fontSize: 12.5 }}>
                        {locale === "en"
                          ? "No comments yet."
                          : "目前還沒有評論。"}
                      </div>
                    )}
                  </div>
                </CanvasCard>

                <CanvasCard
                  theme={theme}
                  title={locale === "en" ? "Deep links" : "Deep links"}
                  subtitle={
                    locale === "en"
                      ? "Cross-app and intra-app drilldowns from this batch."
                      : "從此批次延伸的同 app / cross-app drilldown。"
                  }
                >
                  <div style={{ display: "grid", gap: 10 }}>
                    <Link
                      href="/payments/reimbursements"
                      style={{
                        color: theme.accent,
                        textDecoration: "none",
                        fontWeight: 600,
                      }}
                    >
                      {locale === "en"
                        ? "Open reimbursement queue"
                        : "打開代墊批次佇列"}
                    </Link>
                    {batch.linkedReconciliationIssueId ? (
                      <Link
                        href={`/payments?issueId=${encodeURIComponent(batch.linkedReconciliationIssueId)}`}
                        style={{
                          color: theme.accent,
                          textDecoration: "none",
                          fontWeight: 600,
                        }}
                      >
                        {locale === "en"
                          ? `Open reconciliation issue ${batch.linkedReconciliationIssueId}`
                          : `打開 reconciliation issue ${batch.linkedReconciliationIssueId}`}
                      </Link>
                    ) : null}
                    {batch.linkedReconciliationIssueId ? (
                      <a
                        href={`/revenue?issueId=${encodeURIComponent(batch.linkedReconciliationIssueId)}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          color: theme.accent,
                          textDecoration: "none",
                          fontWeight: 600,
                        }}
                      >
                        {locale === "en"
                          ? "Open ops-console revenue mirror"
                          : "在新分頁打開 ops-console revenue mirror"}
                      </a>
                    ) : null}
                    <a
                      href={`/audit?resourceType=reimbursement_batch&resourceId=${encodeURIComponent(batch.batchId)}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        color: theme.accent,
                        textDecoration: "none",
                        fontWeight: 600,
                      }}
                    >
                      {locale === "en"
                        ? "Open audit filtered to this batch"
                        : "在新分頁打開此批次的 audit 篩選"}
                    </a>
                    {linkedIssue ? (
                      <div style={{ color: theme.textMuted, fontSize: 12.5 }}>
                        {locale === "en"
                          ? `Linked issue status: ${formatPlatformCodeLabel(locale, linkedIssue.status)}`
                          : `關聯 issue 狀態：${formatPlatformCodeLabel(locale, linkedIssue.status)}`}
                      </div>
                    ) : null}
                  </div>
                </CanvasCard>
              </div>
            </>
          ) : (
            <CanvasCard
              theme={theme}
              title={locale === "en" ? "Batch unavailable" : "批次暫時不可用"}
            >
              <div style={{ color: theme.textMuted, fontSize: 12.5 }}>
                {locale === "en"
                  ? "No detail payload is currently available."
                  : "目前沒有可顯示的 detail payload。"}
              </div>
            </CanvasCard>
          )}
        </div>
      </CanvasShell>
    </div>
  );
}
