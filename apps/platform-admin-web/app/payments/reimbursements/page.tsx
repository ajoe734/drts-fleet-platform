"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatDateTime } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  formatDateTimeLocalInputValue,
  normalizeDateTimeLocalValue,
} from "@/app/switchboard/datetime-local";
import type {
  ActionReceipt,
  ApiListData,
  ApiSuccessEnvelope,
  CrossAppResourceLink,
  EmptyStateEnvelope,
  MoneyAmount,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasField,
  CanvasIcon,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  CanvasTable,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";

const PLATFORM_THEME = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});
const API_PREFIX = "/__drts_api__/api";
const REFRESH_INTERVAL_MS = 30_000;
const STALE_AFTER_MS = 30_000;
const EXPORT_OVERDUE_MS = 48 * 60 * 60 * 1000;
const DEFAULT_ACTOR_ID = "finance.queue";
const QUEUE_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "exported",
  "paid",
  "reconciled",
] as const;
const EMPTY_REASONS = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const;
const ACTION_ORDER = {
  approve: 0,
  export_artifact: 1,
  mark_paid: 2,
  mark_reconciled: 3,
  unknown: 4,
} as const;
const STATUS_PRIORITY: Record<QueueStatus, number> = {
  pending_approval: 0,
  exported: 1,
  approved: 2,
  draft: 3,
  paid: 4,
  reconciled: 5,
};

type Locale = "en" | "zh";
type QueueStatus = (typeof QUEUE_STATUSES)[number];
type QueueEmptyReason = (typeof EMPTY_REASONS)[number];
type QueueActionKind =
  | "approve"
  | "export_artifact"
  | "mark_paid"
  | "mark_reconciled"
  | "unknown";
type QueueTab = "all" | "pending" | "exported" | "done";
type CanvasIconKey = React.ComponentProps<typeof CanvasIcon>["name"];
type QueueAction = {
  kind: QueueActionKind;
  descriptor: ResourceActionDescriptor;
  label: string;
  endpoint?: string | undefined;
  method?: "GET" | "POST" | undefined;
  href?: string | undefined;
  openMode?: "new_tab" | "same_tab" | undefined;
};
type QueueRow = {
  batchId: string;
  status: QueueStatus;
  scopeKind: string;
  scopeLabel: string;
  amount: MoneyAmount | null;
  submitter: string;
  submittedAt: string | null;
  approver: string | null;
  updatedAt: string | null;
  periodMonth: string | null;
  statementId: string | null;
  remittanceProofId: string | null;
  artifactLink: string | null;
  detailHref: string;
  linkedReconciliationHref: string | null;
  crossAppLinks: CrossAppResourceLink[];
  actions: QueueAction[];
  readOnly: boolean;
  raw: Record<string, unknown>;
};
type QueueTableRow = QueueRow & Record<string, unknown>;
type QueueResponse = {
  items: QueueRow[];
  emptyState: EmptyStateEnvelope | null;
  refresh: UiRefreshMetadata;
};
type FeedbackTone = "success" | "warn" | "danger" | "info";
type EmptyStateTone = FeedbackTone | "neutral";
type FeedbackState = {
  tone: FeedbackTone;
  title: string;
  body?: string | undefined;
  href?: string | undefined;
  hrefLabel?: string | undefined;
};
type ActionModalState = {
  action: QueueAction;
  row: QueueRow;
  reason: string;
  remittanceProofId: string;
  paidAt: string;
  error: string | null;
};
type QueueCopy = ReturnType<typeof getQueueCopy>;

type RequestError = Error & {
  status?: number | undefined;
  code?: string | undefined;
  retryable?: boolean | undefined;
  details?: Record<string, unknown> | undefined;
};

function viewportStyle(theme: CanvasTheme): React.CSSProperties {
  return {
    position: "fixed",
    inset: 0,
    zIndex: 10,
    background: theme.bg,
  };
}

function pageBodyStyle(): React.CSSProperties {
  return {
    padding: "16px 24px 24px",
    display: "grid",
    gap: 16,
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

function nativeTextAreaStyle(theme: CanvasTheme): React.CSSProperties {
  return {
    ...nativeControlStyle(theme),
    minHeight: 92,
    resize: "vertical",
  };
}

function filterGridStyle(): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    alignItems: "end",
  };
}

function cellStackStyle(
  theme: CanvasTheme,
  options?: { mono?: boolean },
): React.CSSProperties {
  return {
    display: "grid",
    gap: 4,
    minWidth: 0,
    whiteSpace: "normal",
    fontFamily: options?.mono ? theme.monoFamily : theme.fontFamily,
  };
}

function actionGridStyle(): React.CSSProperties {
  return {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    minWidth: 164,
  };
}

function tabBadgeStyle(
  theme: CanvasTheme,
  tone: CanvasTone = "neutral",
): React.CSSProperties {
  const tones: Record<CanvasTone, { background: string; color: string }> = {
    accent: {
      background: theme.accentBg,
      color: theme.accent,
    },
    danger: {
      background: theme.dangerBg,
      color: theme.danger,
    },
    info: {
      background: theme.infoBg,
      color: theme.info,
    },
    neutral: {
      background: theme.neutralBg,
      color: theme.textMuted,
    },
    success: {
      background: theme.successBg,
      color: theme.success,
    },
    warn: {
      background: theme.warnBg,
      color: theme.warn,
    },
  };

  return {
    marginLeft: 8,
    padding: "1px 6px",
    borderRadius: 999,
    fontSize: 10.5,
    fontWeight: 700,
    ...tones[tone],
  };
}

function linkStyle(theme: CanvasTheme): React.CSSProperties {
  return {
    color: theme.accent,
    textDecoration: "underline",
    textUnderlineOffset: "3px",
  };
}

function modalBackdropStyle(): React.CSSProperties {
  return {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.46)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 40,
  };
}

function modalCardStyle(theme: CanvasTheme): React.CSSProperties {
  return {
    width: "min(560px, 100%)",
    borderRadius: 16,
    border: `1px solid ${theme.border}`,
    background: theme.surface,
    boxShadow: "0 24px 80px rgba(15, 23, 42, 0.24)",
    padding: 20,
    display: "grid",
    gap: 14,
  };
}

function getQueueCopy(locale: Locale) {
  if (locale === "en") {
    return {
      breadcrumbParent: "Pricing & Settlement",
      pageTitle: "Reimbursement batches",
      pageSubtitle:
        "draft → pending_approval → approved → exported → paid → reconciled",
      searchPlaceholder: "Search batches, scopes, reconciliation links...",
      queueTitle: "Batch queue",
      queueSubtitle: (shown: number, total: number) =>
        `${shown} visible / ${total} total batches`,
      filtersTitle: "Queue filters",
      refreshTier: "T4 admin medium-slow · every 30s",
      refreshNow: "Refresh",
      viewPayments: "Open /payments",
      clearFilters: "Clear filters",
      tabAll: "All",
      tabPending: "Pending approval",
      tabExported: "Exported",
      tabDone: "Done",
      fieldScope: "Scope",
      fieldPeriod: "Period",
      fieldState: "State",
      fieldActor: "Actor ID",
      fieldReason: "Reason",
      fieldRemittanceProof: "Remittance proof ID",
      fieldPaidAt: "Paid at",
      stateLegend: "State machine",
      colBatch: "Batch",
      colScope: "Scope",
      colAmount: "Amount",
      colState: "State",
      colSubmitter: "Submitter",
      colSubmittedAt: "Submitted",
      colApprover: "Approver",
      colUpdatedAt: "Updated",
      colActions: "Actions",
      status: {
        draft: "Draft",
        pending_approval: "Pending approval",
        approved: "Approved",
        exported: "Exported",
        paid: "Paid",
        reconciled: "Reconciled",
      },
      scopeKinds: {
        all: "All scopes",
        partner: "Partner scope",
        tenant: "Tenant scope",
        forwarded: "Forwarded scope",
        driver: "Driver scope",
        statement: "Statement scope",
        platform: "Platform scope",
        unknown: "Unclassified scope",
      },
      pendingBannerTitle: "Approval backlog needs attention",
      pendingBannerBody: (count: number) =>
        `${count} batch(es) are waiting for approval. Queue order now follows the Q-ADM12 six-state flow.`,
      exportedBannerTitle:
        "Exported batches are waiting for payment confirmation",
      exportedBannerBody: (count: number) =>
        `${count} batch(es) have stayed in exported longer than 48 hours. Confirm the external remittance before switching them to paid.`,
      staleBannerTitle: "Snapshot is stale",
      staleBannerBody:
        "This route polls on the T4 cadence, but the latest queue snapshot is now outside the freshness window.",
      previewBannerTitle: "Empty-state preview mode",
      previewBannerBody:
        "The queue is intentionally rendering the requested EmptyReason preview from the query string.",
      readOnly: "Read-only",
      actionApprove: "Approve",
      actionExport: "Export",
      actionMarkPaid: "Mark paid",
      actionMarkReconciled: "Mark reconciled",
      disabledReasons: {
        backend_pending:
          "Backend action is not available in this environment yet.",
        awaiting_approval: "Batch must be approved before export.",
        awaiting_export: "Batch must be exported before payment is confirmed.",
        awaiting_payment:
          "Batch must be paid before reconciliation is completed.",
        already_paid: "Batch is already marked as paid.",
        already_reconciled: "Batch is already reconciled.",
        not_ready: "Batch is not in a state that supports this action.",
        missing_statement: "Statement id is required for approval.",
      },
      modalRisk: {
        low: "Low risk",
        medium: "Medium risk",
        high: "High risk",
      },
      confirmAction: "Confirm action",
      cancelAction: "Cancel",
      submitting: "Submitting...",
      genericActionError: "The action could not be completed.",
      approveTitle: "Approve reimbursement batch",
      approveBody:
        "Approval is a high-risk action in Q-ADM12. Provide a reason before the batch moves into the approved state.",
      exportTitle: "Export reimbursement artifact",
      exportBody:
        "This produces the remittance artifact used by downstream finance operators.",
      markPaidTitle: "Mark reimbursement paid",
      markPaidBody:
        "Only do this after the external remittance is confirmed. The payment proof id is required on the current API surface.",
      markReconciledTitle: "Mark batch reconciled",
      markReconciledBody:
        "Use this only after finance truth and external settlement truth match.",
      paymentProofPlaceholder: "proof-2026-05-001",
      actionSucceeded: {
        approve: "Batch approved.",
        export_artifact: "Export artifact opened.",
        mark_paid: "Batch marked as paid.",
        mark_reconciled: "Batch marked as reconciled.",
        unknown: "Action completed.",
      },
      viewAudit: "View audit",
      linkedReconciliation: "Linked reconciliation",
      externalLinks: "Cross-app links",
      noValue: "—",
      loading: "Loading reimbursement queue...",
      noRowsAfterLoad: "No batches are currently visible.",
      emptyStates: {
        no_data: {
          icon: "billing" as CanvasIconKey,
          tone: "neutral" as EmptyStateTone,
          title: "No reimbursement batches yet",
          body: "The queue has no rows for the current environment.",
          actionLabel: "Open /payments",
        },
        not_provisioned: {
          icon: "switchboard" as CanvasIconKey,
          tone: "info" as FeedbackTone,
          title: "Queue is not provisioned",
          body: "The reimbursement queue surface exists, but its upstream read model is not provisioned for this environment.",
          actionLabel: "Refresh",
        },
        fetch_failed: {
          icon: "warn" as CanvasIconKey,
          tone: "danger" as FeedbackTone,
          title: "Queue fetch failed",
          body: "The route could not load reimbursement batches from the control-plane proxy.",
          actionLabel: "Retry",
        },
        permission_denied: {
          icon: "users" as CanvasIconKey,
          tone: "danger" as FeedbackTone,
          title: "Permission denied",
          body: "This actor can see the route shell but does not have queue read access.",
          actionLabel: "Refresh",
        },
        external_unavailable: {
          icon: "adapters" as CanvasIconKey,
          tone: "warn" as FeedbackTone,
          title: "External dependency unavailable",
          body: "The queue depends on an upstream settlement dependency that is currently unavailable.",
          actionLabel: "Retry",
        },
        filtered_empty: {
          icon: "filter" as CanvasIconKey,
          tone: "info" as FeedbackTone,
          title: "No batches match the current filters",
          body: "Clear one or more filters to bring batches back into view.",
          actionLabel: "Clear filters",
        },
      },
      freshness: {
        fresh: "Fresh",
        stale: "Stale",
        degraded: "Degraded",
        unknown: "Unknown",
      },
      source: {
        live: "live",
        cache: "cache",
        sandbox: "sandbox",
        static: "static",
      },
      unknownAction: "Unavailable action",
    };
  }

  return {
    breadcrumbParent: "計價與結算",
    pageTitle: "代墊批次",
    pageSubtitle:
      "draft → pending_approval → approved → exported → paid → reconciled",
    searchPlaceholder: "搜尋批次、scope、對帳連結...",
    queueTitle: "批次佇列",
    queueSubtitle: (shown: number, total: number) =>
      `顯示 ${shown} 筆 / 全部 ${total} 筆批次`,
    filtersTitle: "Queue 篩選",
    refreshTier: "T4 管理頁中慢速刷新 · 每 30 秒",
    refreshNow: "重整",
    viewPayments: "開啟 /payments",
    clearFilters: "清除篩選",
    tabAll: "全部",
    tabPending: "待核准",
    tabExported: "已匯出",
    tabDone: "已完成",
    fieldScope: "Scope",
    fieldPeriod: "期間",
    fieldState: "狀態",
    fieldActor: "操作人 ID",
    fieldReason: "原因",
    fieldRemittanceProof: "匯款憑證 ID",
    fieldPaidAt: "付款時間",
    stateLegend: "State machine",
    colBatch: "批次",
    colScope: "Scope",
    colAmount: "金額",
    colState: "狀態",
    colSubmitter: "提交人",
    colSubmittedAt: "提交時間",
    colApprover: "核准人",
    colUpdatedAt: "更新時間",
    colActions: "操作",
    status: {
      draft: "草稿",
      pending_approval: "待核准",
      approved: "已核准",
      exported: "已匯出",
      paid: "已付款",
      reconciled: "已核銷",
    },
    scopeKinds: {
      all: "全部 scope",
      partner: "合作夥伴 scope",
      tenant: "租戶 scope",
      forwarded: "轉送 scope",
      driver: "司機 scope",
      statement: "結算單 scope",
      platform: "平台 scope",
      unknown: "未分類 scope",
    },
    pendingBannerTitle: "待核准 backlog 需要處理",
    pendingBannerBody: (count: number) =>
      `目前有 ${count} 筆批次停在待核准。佇列排序已依 Q-ADM12 的六狀態流程重整。`,
    exportedBannerTitle: "已匯出批次等待付款確認",
    exportedBannerBody: (count: number) =>
      `有 ${count} 筆批次在 exported 停留超過 48 小時。切到 paid 前，先確認外部匯款已完成。`,
    staleBannerTitle: "快照已過期",
    staleBannerBody:
      "這個路由依 T4 cadence 輪詢，但目前批次快照已超出 freshness window。",
    previewBannerTitle: "EmptyReason 預覽模式",
    previewBannerBody:
      "目前是依 query string 強制渲染指定的 EmptyReason 狀態，方便驗收六種空態。",
    readOnly: "唯讀",
    actionApprove: "核准",
    actionExport: "匯出",
    actionMarkPaid: "標記已付",
    actionMarkReconciled: "標記已核銷",
    disabledReasons: {
      backend_pending: "這個環境尚未提供對應 backend action。",
      awaiting_approval: "批次要先核准才能匯出。",
      awaiting_export: "批次要先匯出才能確認付款。",
      awaiting_payment: "批次要先付款完成才能核銷。",
      already_paid: "這筆批次已經標記為已付。",
      already_reconciled: "這筆批次已經完成核銷。",
      not_ready: "這個狀態目前不支援該操作。",
      missing_statement: "核准前必須帶 statement id。",
    },
    modalRisk: {
      low: "低風險",
      medium: "中風險",
      high: "高風險",
    },
    confirmAction: "確認操作",
    cancelAction: "取消",
    submitting: "送出中...",
    genericActionError: "操作失敗，請稍後再試。",
    approveTitle: "核准代墊批次",
    approveBody:
      "依 Q-ADM12，核准屬於高風險動作。送出前必須填寫原因，批次才會進入 approved。",
    exportTitle: "匯出代墊檔案",
    exportBody: "這個動作會產出提供下游財務作業使用的 remittance artifact。",
    markPaidTitle: "標記代墊已付",
    markPaidBody:
      "只有在外部匯款確認完成後才能執行。現行 API surface 仍要求填入 payment proof id。",
    markReconciledTitle: "標記批次已核銷",
    markReconciledBody: "只有在平台財務真相與外部結算真相一致後才能核銷。",
    paymentProofPlaceholder: "proof-2026-05-001",
    actionSucceeded: {
      approve: "批次已核准。",
      export_artifact: "匯出檔已開啟。",
      mark_paid: "批次已標記為已付。",
      mark_reconciled: "批次已標記為已核銷。",
      unknown: "操作完成。",
    },
    viewAudit: "查看 audit",
    linkedReconciliation: "關聯對帳",
    externalLinks: "跨系統連結",
    noValue: "—",
    loading: "載入代墊批次中...",
    noRowsAfterLoad: "目前沒有可顯示的批次。",
    emptyStates: {
      no_data: {
        icon: "billing" as CanvasIconKey,
        tone: "neutral" as EmptyStateTone,
        title: "目前沒有代墊批次",
        body: "這個環境目前尚未產生任何代墊批次。",
        actionLabel: "開啟 /payments",
      },
      not_provisioned: {
        icon: "switchboard" as CanvasIconKey,
        tone: "info" as FeedbackTone,
        title: "佇列尚未 provision",
        body: "代墊批次路由已存在，但上游 read model 尚未為這個環境 provision。",
        actionLabel: "重整",
      },
      fetch_failed: {
        icon: "warn" as CanvasIconKey,
        tone: "danger" as FeedbackTone,
        title: "讀取佇列失敗",
        body: "控制平面 proxy 目前無法成功載入代墊批次資料。",
        actionLabel: "重試",
      },
      permission_denied: {
        icon: "users" as CanvasIconKey,
        tone: "danger" as FeedbackTone,
        title: "權限不足",
        body: "目前 actor 可以進入 route shell，但沒有批次佇列的讀取權限。",
        actionLabel: "重整",
      },
      external_unavailable: {
        icon: "adapters" as CanvasIconKey,
        tone: "warn" as FeedbackTone,
        title: "外部依賴不可用",
        body: "這個佇列依賴的上游結算服務目前不可用。",
        actionLabel: "重試",
      },
      filtered_empty: {
        icon: "filter" as CanvasIconKey,
        tone: "info" as FeedbackTone,
        title: "目前篩選沒有符合的批次",
        body: "請清除部分篩選條件，讓批次重新回到畫面。",
        actionLabel: "清除篩選",
      },
    },
    freshness: {
      fresh: "Fresh",
      stale: "Stale",
      degraded: "Degraded",
      unknown: "Unknown",
    },
    source: {
      live: "live",
      cache: "cache",
      sandbox: "sandbox",
      static: "static",
    },
    unknownAction: "無法操作",
  };
}

function parseString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseMoney(value: unknown): MoneyAmount | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const amountMinor = candidate.amountMinor;
  const currency = candidate.currency;
  if (typeof amountMinor !== "number" || typeof currency !== "string") {
    return null;
  }
  return {
    amountMinor,
    currency,
  };
}

function formatMoney(amount: MoneyAmount | null, locale: Locale): string {
  if (!amount) {
    return locale === "en" ? "—" : "—";
  }
  return `${amount.amountMinor.toLocaleString(locale === "en" ? "en-US" : "zh-TW")} ${amount.currency}`;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value as Record<string, unknown>;
}

function hasOwn(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isQueueStatus(value: string | null): value is QueueStatus {
  return !!value && (QUEUE_STATUSES as readonly string[]).includes(value);
}

function isQueueEmptyReason(value: string | null): value is QueueEmptyReason {
  return !!value && (EMPTY_REASONS as readonly string[]).includes(value);
}

function normalizeStatus(record: Record<string, unknown>): QueueStatus {
  const raw =
    parseString(record.currentState) ??
    parseString(record.state) ??
    parseString(record.status);
  if (raw === "pending") {
    return parseString(record.approvedAt) ? "approved" : "pending_approval";
  }
  if (isQueueStatus(raw)) {
    return raw;
  }
  if (parseString(record.reconciledAt)) {
    return "reconciled";
  }
  if (parseString(record.paidAt)) {
    return "paid";
  }
  if (parseString(record.exportedAt) || parseString(record.remittanceProofId)) {
    return "exported";
  }
  if (parseString(record.approvedAt)) {
    return "approved";
  }
  return "pending_approval";
}

function scopeKindFromChannel(channelKey: string | null): string | null {
  switch (channelKey) {
    case "partner_airport":
      return "partner";
    case "tenant_enterprise":
      return "tenant";
    case "forwarded_shadow":
      return "forwarded";
    case "phone_dispatch":
      return "platform";
    default:
      return null;
  }
}

function deriveScope(record: Record<string, unknown>) {
  const scopeValue =
    parseString(record.scopeLabel) ??
    parseString(record.scope) ??
    parseString(record.scopeDisplay);
  const scopeType =
    parseString(record.scopeKind) ??
    parseString(record.scopeType) ??
    parseString(record.scopeCategory);
  if (scopeValue) {
    return {
      scopeKind: scopeType ?? "unknown",
      scopeLabel: scopeValue,
    };
  }

  const partnerId =
    parseString(record.partnerProgramId) ?? parseString(record.partnerId);
  const tenantId = parseString(record.tenantId);
  const statementId = parseString(record.statementId);
  const driverId = parseString(record.driverId);
  const channelKey =
    parseString(record.channelKey) ??
    parseString(toRecord(record.primaryItem).channelKey);
  const scopedByChannel = scopeKindFromChannel(channelKey);

  if (partnerId) {
    return {
      scopeKind: scopedByChannel ?? "partner",
      scopeLabel: `partner:${partnerId}`,
    };
  }
  if (tenantId) {
    return {
      scopeKind: scopedByChannel ?? "tenant",
      scopeLabel: `tenant:${tenantId}`,
    };
  }
  if (scopedByChannel === "forwarded") {
    return {
      scopeKind: "forwarded",
      scopeLabel: driverId ? `forwarded:${driverId}` : "forwarded",
    };
  }
  if (driverId) {
    return {
      scopeKind: "driver",
      scopeLabel: `driver:${driverId}`,
    };
  }
  if (statementId) {
    return {
      scopeKind: "statement",
      scopeLabel: `statement:${statementId}`,
    };
  }
  return {
    scopeKind: "unknown",
    scopeLabel: "unclassified",
  };
}

function normalizeActionKind(action: string): QueueActionKind {
  const normalized = action.toLowerCase().replace(/[^a-z]/g, "");
  if (
    normalized.includes("approvereimbursementbatch") ||
    normalized === "approve" ||
    normalized.includes("approvebatch")
  ) {
    return "approve";
  }
  if (normalized.includes("export")) {
    return "export_artifact";
  }
  if (
    normalized.includes("markreimbursementpaid") ||
    normalized.includes("markpaid") ||
    normalized === "pay"
  ) {
    return "mark_paid";
  }
  if (
    normalized.includes("markreconciled") ||
    normalized.includes("reconcile")
  ) {
    return "mark_reconciled";
  }
  return "unknown";
}

function conventionalEndpoint(batchId: string, kind: QueueActionKind) {
  const base = `${API_PREFIX}/reimbursements/${encodeURIComponent(batchId)}`;
  switch (kind) {
    case "approve":
      return { endpoint: `${base}/approve`, method: "POST" as const };
    case "export_artifact":
      return { endpoint: `${base}/export`, method: "GET" as const };
    case "mark_paid":
      return { endpoint: `${base}/pay`, method: "POST" as const };
    case "mark_reconciled":
      return { endpoint: `${base}/reconcile`, method: "POST" as const };
    case "unknown":
    default:
      return {};
  }
}

function buildActionLabel(
  copy: QueueCopy,
  kind: QueueActionKind,
  action: string,
) {
  switch (kind) {
    case "approve":
      return copy.actionApprove;
    case "export_artifact":
      return copy.actionExport;
    case "mark_paid":
      return copy.actionMarkPaid;
    case "mark_reconciled":
      return copy.actionMarkReconciled;
    case "unknown":
    default:
      return action || copy.unknownAction;
  }
}

function normalizeActionDescriptor(
  batchId: string,
  copy: QueueCopy,
  input: Record<string, unknown>,
): QueueAction {
  const action = parseString(input.action) ?? "";
  const kind = normalizeActionKind(action);
  const explicitHref =
    parseString(input.href) ??
    parseString(input.url) ??
    parseString(input.link) ??
    parseString(input.endpoint);
  const explicitMethod = parseString(input.method)?.toUpperCase();
  const fallback = conventionalEndpoint(batchId, kind);
  const href =
    explicitMethod === "GET" && explicitHref
      ? explicitHref
      : kind === "export_artifact" && explicitHref
        ? explicitHref
        : undefined;
  const endpoint =
    explicitMethod === "GET" ? undefined : (explicitHref ?? fallback.endpoint);
  const descriptor: ResourceActionDescriptor = {
    action,
    enabled: input.enabled !== false,
    requiresReason: input.requiresReason === true,
    riskLevel:
      input.riskLevel === "low" ||
      input.riskLevel === "medium" ||
      input.riskLevel === "high"
        ? input.riskLevel
        : "medium",
    ...(parseString(input.disabledReasonCode)
      ? { disabledReasonCode: parseString(input.disabledReasonCode)! }
      : {}),
  };
  return {
    kind,
    descriptor,
    label: buildActionLabel(copy, kind, action),
    endpoint,
    method:
      explicitMethod === "GET" || explicitMethod === "POST"
        ? explicitMethod
        : fallback.method,
    href,
    openMode:
      input.openMode === "same_tab" || input.openMode === "new_tab"
        ? input.openMode
        : "new_tab",
  };
}

function fallbackActions(
  row: Pick<QueueRow, "batchId" | "status" | "artifactLink" | "statementId">,
  copy: QueueCopy,
): QueueAction[] {
  const actions: QueueAction[] = [];

  if (row.status === "pending_approval") {
    actions.push({
      kind: "approve",
      descriptor: {
        action: "approveReimbursementBatch",
        enabled: !!row.statementId,
        requiresReason: true,
        riskLevel: "high",
        ...(row.statementId ? {} : { disabledReasonCode: "missing_statement" }),
      },
      label: copy.actionApprove,
      endpoint: conventionalEndpoint(row.batchId, "approve").endpoint,
      method: "POST",
    });
  }

  if (
    row.status === "approved" ||
    row.status === "exported" ||
    row.status === "paid" ||
    row.status === "reconciled"
  ) {
    actions.push({
      kind: "export_artifact",
      descriptor: {
        action: "exportBatchArtifact",
        enabled: true,
        riskLevel: "low",
      },
      label: copy.actionExport,
      href: row.artifactLink ?? undefined,
      endpoint: row.artifactLink
        ? undefined
        : conventionalEndpoint(row.batchId, "export_artifact").endpoint,
      method: row.artifactLink ? "GET" : "GET",
      openMode: "new_tab",
    });
  }

  if (row.status === "exported") {
    actions.push({
      kind: "mark_paid",
      descriptor: {
        action: "markReimbursementPaid",
        enabled: true,
        requiresReason: true,
        riskLevel: "high",
      },
      label: copy.actionMarkPaid,
      endpoint: conventionalEndpoint(row.batchId, "mark_paid").endpoint,
      method: "POST",
    });
  }

  if (row.status === "paid") {
    actions.push({
      kind: "mark_reconciled",
      descriptor: {
        action: "markReconciled",
        enabled: true,
        riskLevel: "medium",
      },
      label: copy.actionMarkReconciled,
      endpoint: conventionalEndpoint(row.batchId, "mark_reconciled").endpoint,
      method: "POST",
    });
  }

  return actions;
}

function parseCrossAppLinks(record: Record<string, unknown>) {
  const raw =
    record.crossAppLinks ??
    record.resourceLinks ??
    record.links ??
    record.relatedLinks;
  if (!Array.isArray(raw)) {
    return [] as CrossAppResourceLink[];
  }
  return raw
    .map((value) => toRecord(value))
    .map((value) => {
      const route = parseString(value.route);
      const label = parseString(value.label);
      const targetApp = parseString(value.targetApp);
      const resourceType = parseString(value.resourceType);
      const resourceId = parseString(value.resourceId);
      const openMode =
        value.openMode === "same_tab" || value.openMode === "new_tab"
          ? value.openMode
          : "new_tab";
      if (!route || !label || !targetApp || !resourceType || !resourceId) {
        return null;
      }
      return {
        targetApp: targetApp as CrossAppResourceLink["targetApp"],
        route,
        resourceType,
        resourceId,
        openMode,
        label,
      };
    })
    .filter((value): value is CrossAppResourceLink => value !== null);
}

function normalizeQueueRow(rawValue: unknown, copy: QueueCopy): QueueRow {
  const record = toRecord(rawValue);
  const batchId = parseString(record.batchId) ?? parseString(record.id) ?? "—";
  const status = normalizeStatus(record);
  const { scopeKind, scopeLabel } = deriveScope(record);
  const submittedAt =
    parseString(record.submittedAt) ??
    parseString(record.createdAt) ??
    parseString(record.queuedAt);
  const updatedAt =
    parseString(record.updatedAt) ??
    parseString(record.reconciledAt) ??
    parseString(record.paidAt) ??
    parseString(record.exportedAt) ??
    parseString(record.approvedAt) ??
    submittedAt;
  const approver =
    parseString(record.approverDisplayName) ??
    parseString(record.approver) ??
    parseString(record.approvedBy);
  const statementId = parseString(record.statementId);
  const artifactRecord = toRecord(record.artifact);
  const artifactLink =
    parseString(record.exportArtifactLink) ??
    parseString(record.artifactLink) ??
    parseString(record.artifactUrl) ??
    parseString(artifactRecord.href) ??
    parseString(artifactRecord.url);
  const linkedReconciliationId =
    parseString(record.linkedReconciliationIssueId) ??
    parseString(record.linkedReconciliationId) ??
    parseString(record.reconciliationIssueId);
  const rawActionList = hasOwn(record, "availableActions")
    ? record.availableActions
    : undefined;

  const rowBase = {
    batchId,
    status,
    artifactLink,
    statementId,
  };
  const actions = Array.isArray(rawActionList)
    ? rawActionList
        .map((value) =>
          normalizeActionDescriptor(batchId, copy, toRecord(value)),
        )
        .sort(
          (left, right) => ACTION_ORDER[left.kind] - ACTION_ORDER[right.kind],
        )
    : fallbackActions(rowBase, copy);

  return {
    batchId,
    status,
    scopeKind,
    scopeLabel,
    amount: parseMoney(record.totalAmount) ?? parseMoney(record.amount),
    submitter:
      parseString(record.submitterDisplayName) ??
      parseString(record.submitter) ??
      parseString(record.submittedBy) ??
      parseString(record.driverId) ??
      copy.noValue,
    submittedAt,
    approver,
    updatedAt,
    periodMonth: parseString(record.periodMonth),
    statementId,
    remittanceProofId: parseString(record.remittanceProofId),
    artifactLink,
    detailHref: `/payments/reimbursements/${encodeURIComponent(batchId)}`,
    linkedReconciliationHref: linkedReconciliationId
      ? `/payments?issueId=${encodeURIComponent(linkedReconciliationId)}`
      : null,
    crossAppLinks: parseCrossAppLinks(record),
    actions,
    readOnly: Array.isArray(rawActionList)
      ? rawActionList.length === 0
      : actions.length === 0,
    raw: record,
  };
}

function toRefreshMetadata(
  payload: Record<string, unknown>,
  metaTimestamp: string | null,
): UiRefreshMetadata {
  const candidate = hasOwn(payload, "refresh")
    ? toRecord(payload.refresh)
    : hasOwn(payload, "refreshMetadata")
      ? toRecord(payload.refreshMetadata)
      : toRecord(payload.uiRefresh);
  const generatedAt =
    parseString(candidate.generatedAt) ??
    metaTimestamp ??
    new Date().toISOString();
  const staleAfterMs =
    typeof candidate.staleAfterMs === "number"
      ? candidate.staleAfterMs
      : STALE_AFTER_MS;
  const dataFreshness =
    candidate.dataFreshness === "fresh" ||
    candidate.dataFreshness === "stale" ||
    candidate.dataFreshness === "degraded" ||
    candidate.dataFreshness === "unknown"
      ? candidate.dataFreshness
      : "fresh";
  const source =
    candidate.source === "live" ||
    candidate.source === "cache" ||
    candidate.source === "sandbox" ||
    candidate.source === "static"
      ? candidate.source
      : "live";

  return {
    generatedAt,
    staleAfterMs,
    dataFreshness,
    source,
  };
}

function toEmptyState(
  payload: Record<string, unknown>,
  reasonOverride: QueueEmptyReason | null,
): EmptyStateEnvelope | null {
  if (reasonOverride) {
    return {
      reason: reasonOverride,
      messageCode: `preview.${reasonOverride}`,
    };
  }

  const candidate = toRecord(payload.emptyState);
  const reason = parseString(candidate.reason);
  if (!isQueueEmptyReason(reason)) {
    return null;
  }
  return {
    reason,
    messageCode: parseString(candidate.messageCode) ?? `queue.${reason}`,
  };
}

function normalizeApiPayload(
  raw: unknown,
  reasonOverride: QueueEmptyReason | null,
  copy: QueueCopy,
): QueueResponse {
  const envelope = toRecord(raw) as ApiSuccessEnvelope<unknown> &
    Record<string, unknown>;
  const meta = toRecord(envelope.meta);
  const data = toRecord(envelope.data);
  const listData = Array.isArray(data.items)
    ? (data as ApiListData<unknown> & Record<string, unknown>)
    : Array.isArray(envelope.data)
      ? ({ items: envelope.data } as ApiListData<unknown> &
          Record<string, unknown>)
      : ({ items: [] } as unknown as ApiListData<unknown> &
          Record<string, unknown>);
  const items = Array.isArray(listData.items)
    ? (listData.items as unknown[]).map((item) => normalizeQueueRow(item, copy))
    : [];

  return {
    items,
    emptyState: toEmptyState(data, reasonOverride),
    refresh: toRefreshMetadata(data, parseString(meta.timestamp)),
  };
}

async function parseResponseJson(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }
  return response.json();
}

async function requestEnvelope(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await parseResponseJson(response);
    const errorRecord = toRecord(toRecord(payload).error);
    const error = new Error(
      parseString(errorRecord.message) ??
        `${response.status} ${response.statusText}`,
    ) as RequestError;
    error.status = response.status;
    const errorCode = parseString(errorRecord.code);
    if (errorCode) {
      error.code = errorCode;
    }
    error.retryable = errorRecord.retryable === true;
    error.details = toRecord(errorRecord.details);
    throw error;
  }

  return parseResponseJson(response);
}

function mapErrorToEmptyState(error: RequestError): EmptyStateEnvelope {
  if (error.status === 401 || error.status === 403) {
    return {
      reason: "permission_denied",
      messageCode: error.code ?? "permission_denied",
    };
  }
  if (error.status === 404 || error.code === "NOT_PROVISIONED") {
    return {
      reason: "not_provisioned",
      messageCode: error.code ?? "not_provisioned",
    };
  }
  if (
    error.status === 502 ||
    error.status === 503 ||
    error.status === 504 ||
    error.code?.includes("EXTERNAL")
  ) {
    return {
      reason: "external_unavailable",
      messageCode: error.code ?? "external_unavailable",
    };
  }
  return {
    reason: "fetch_failed",
    messageCode: error.code ?? "fetch_failed",
  };
}

function readActionReceipt(payload: unknown): ActionReceipt | null {
  const record = toRecord(payload);
  const data = toRecord(record.data);
  const candidate = hasOwn(record, "auditId")
    ? record
    : hasOwn(data, "auditId")
      ? data
      : null;
  if (!candidate) {
    return null;
  }
  const auditId = parseString(candidate.auditId);
  const actionId = parseString(candidate.actionId);
  const resourceId = parseString(candidate.resourceId);
  const resourceType = parseString(candidate.resourceType);
  const status = parseString(candidate.status);
  const message = parseString(candidate.message);
  if (
    !auditId ||
    !actionId ||
    !resourceId ||
    !resourceType ||
    !message ||
    (status !== "accepted" && status !== "completed" && status !== "failed")
  ) {
    return null;
  }
  return {
    actionId,
    auditId,
    resourceType,
    resourceId,
    status,
    message,
  };
}

function downloadTextArtifact(batchId: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${batchId}-reimbursement-export.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatDisabledReason(
  copy: QueueCopy,
  action: QueueAction,
): string | null {
  const code = action.descriptor.disabledReasonCode;
  if (!code) {
    return null;
  }
  return (
    copy.disabledReasons[code as keyof typeof copy.disabledReasons] ??
    code.replace(/_/g, " ")
  );
}

function getStatusTone(status: QueueStatus): CanvasTone {
  switch (status) {
    case "draft":
      return "neutral";
    case "pending_approval":
      return "warn";
    case "approved":
      return "info";
    case "exported":
      return "accent";
    case "paid":
    case "reconciled":
      return "success";
    default:
      return "neutral";
  }
}

function freshnessTone(refresh: UiRefreshMetadata, now: number): CanvasTone {
  if (refresh.dataFreshness === "degraded") {
    return "danger";
  }
  if (
    refresh.dataFreshness === "stale" ||
    Date.parse(refresh.generatedAt) + refresh.staleAfterMs < now
  ) {
    return "warn";
  }
  if (refresh.dataFreshness === "unknown") {
    return "neutral";
  }
  return "success";
}

function buildFreshnessLabel(
  copy: QueueCopy,
  refresh: UiRefreshMetadata,
  now: number,
) {
  if (refresh.dataFreshness === "degraded") {
    return copy.freshness.degraded;
  }
  if (
    refresh.dataFreshness === "stale" ||
    Date.parse(refresh.generatedAt) + refresh.staleAfterMs < now
  ) {
    return copy.freshness.stale;
  }
  if (refresh.dataFreshness === "unknown") {
    return copy.freshness.unknown;
  }
  return copy.freshness.fresh;
}

function buildNav(
  locale: Locale,
  paymentsBadge: string | undefined,
): CanvasShellNavItem[] {
  const labels =
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

  return [
    { key: "home", href: "/", label: labels.home, icon: "dashboard" },
    { key: "health", href: "/health", label: labels.health, icon: "health" },
    { divider: labels.tenantGroup },
    {
      key: "tenants",
      href: "/tenants",
      label: labels.tenants,
      icon: "tenants",
    },
    {
      key: "partners",
      href: "/partners",
      label: labels.partners,
      icon: "partners",
    },
    { key: "users", href: "/users", label: labels.users, icon: "users" },
    { divider: labels.fleetGroup },
    { key: "fleet", href: "/fleet", label: labels.fleet, icon: "fleet" },
    {
      key: "switchboard",
      href: "/switchboard",
      label: labels.switchboard,
      icon: "switchboard",
    },
    { divider: labels.pricingGroup },
    {
      key: "pricing",
      href: "/pricing",
      label: labels.pricing,
      icon: "pricing",
    },
    {
      key: "payments",
      href: "/payments",
      label: labels.payments,
      icon: "payments",
      badge: paymentsBadge,
      badgeTone: paymentsBadge ? "danger" : "neutral",
      matchPaths: ["/payments", "/payments/reimbursements"],
    },
    { divider: labels.platformGroup },
    {
      key: "notices",
      href: "/notices",
      label: labels.notices,
      icon: "notices",
    },
    { key: "audit", href: "/audit", label: labels.audit, icon: "audit" },
    {
      key: "flags",
      href: "/feature-flags",
      label: labels.flags,
      icon: "flags",
    },
    {
      key: "adapters",
      href: "/adapter-registry",
      label: labels.adapters,
      icon: "adapters",
    },
  ];
}

function EmptyStateView({
  copy,
  theme,
  emptyState,
  onRefresh,
  onClearFilters,
}: {
  copy: QueueCopy;
  theme: CanvasTheme;
  emptyState: EmptyStateEnvelope;
  onRefresh: () => void;
  onClearFilters: () => void;
}) {
  const content =
    copy.emptyStates[emptyState.reason as keyof typeof copy.emptyStates];
  const bannerTone: EmptyStateTone = content?.tone ?? "neutral";

  return (
    <div
      style={{
        padding: 24,
        display: "grid",
        gap: 12,
        justifyItems: "center",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 16,
          background:
            bannerTone === "danger"
              ? theme.dangerBg
              : bannerTone === "warn"
                ? theme.warnBg
                : bannerTone === "info"
                  ? theme.infoBg
                  : theme.neutralBg,
          color:
            bannerTone === "danger"
              ? theme.danger
              : bannerTone === "warn"
                ? theme.warn
                : bannerTone === "info"
                  ? theme.info
                  : theme.textMuted,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CanvasIcon name={content.icon} size={22} stroke={1.8} />
      </div>
      <div style={{ display: "grid", gap: 6, maxWidth: 520 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>
          {content.title}
        </div>
        <div
          style={{ fontSize: 12.5, lineHeight: 1.55, color: theme.textMuted }}
        >
          {content.body}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {emptyState.reason === "filtered_empty" ? (
          <CanvasBtn
            theme={theme}
            size="sm"
            icon="filter"
            onClick={onClearFilters}
          >
            {content.actionLabel}
          </CanvasBtn>
        ) : emptyState.reason === "no_data" ? (
          <Link href="/payments" style={linkStyle(theme)}>
            {content.actionLabel}
          </Link>
        ) : (
          <CanvasBtn theme={theme} size="sm" icon="arrow" onClick={onRefresh}>
            {content.actionLabel}
          </CanvasBtn>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: theme.textDim }}>
        {emptyState.messageCode}
      </div>
    </div>
  );
}

function buildModalTitle(copy: QueueCopy, action: QueueAction) {
  switch (action.kind) {
    case "approve":
      return copy.approveTitle;
    case "export_artifact":
      return copy.exportTitle;
    case "mark_paid":
      return copy.markPaidTitle;
    case "mark_reconciled":
      return copy.markReconciledTitle;
    case "unknown":
    default:
      return copy.confirmAction;
  }
}

function buildModalBody(copy: QueueCopy, action: QueueAction) {
  switch (action.kind) {
    case "approve":
      return copy.approveBody;
    case "export_artifact":
      return copy.exportBody;
    case "mark_paid":
      return copy.markPaidBody;
    case "mark_reconciled":
      return copy.markReconciledBody;
    case "unknown":
    default:
      return copy.genericActionError;
  }
}

export default function ReimbursementQueuePage() {
  const { locale, t } = useTranslation();
  const searchParams = useSearchParams();
  const pageLocale: Locale = locale === "en" ? "en" : "zh";
  const copy = getQueueCopy(pageLocale);
  const theme = PLATFORM_THEME;
  const emptyReasonOverride = isQueueEmptyReason(
    searchParams.get("emptyReason"),
  )
    ? (searchParams.get("emptyReason") as QueueEmptyReason)
    : null;

  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshInfo, setRefreshInfo] = useState<UiRefreshMetadata>({
    generatedAt: new Date().toISOString(),
    staleAfterMs: STALE_AFTER_MS,
    dataFreshness: "unknown",
    source: "live",
  });
  const [queueEmptyState, setQueueEmptyState] =
    useState<EmptyStateEnvelope | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [actorId, setActorId] = useState(DEFAULT_ACTOR_ID);
  const [scopeFilter, setScopeFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState<QueueStatus | "all">("all");
  const [tabFilter, setTabFilter] = useState<QueueTab>("all");
  const [nowTick, setNowTick] = useState(Date.now());
  const [reloadToken, setReloadToken] = useState(0);
  const [modal, setModal] = useState<ActionModalState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadQueue() {
      try {
        if (!hasLoadedOnce) {
          setLoading(true);
        } else {
          setRefreshing(true);
        }

        const params = new URLSearchParams();
        const response = await requestEnvelope(
          `${API_PREFIX}/reimbursements${params.toString() ? `?${params.toString()}` : ""}`,
          { signal: controller.signal },
        );
        if (cancelled) {
          return;
        }

        const normalized = normalizeApiPayload(
          response,
          emptyReasonOverride,
          copy,
        );
        setRows(normalized.items);
        setQueueEmptyState(normalized.emptyState);
        setRefreshInfo(normalized.refresh);
      } catch (error) {
        if (cancelled) {
          return;
        }
        const requestError = error as RequestError;
        setRows([]);
        setQueueEmptyState(
          emptyReasonOverride
            ? {
                reason: emptyReasonOverride,
                messageCode: `preview.${emptyReasonOverride}`,
              }
            : mapErrorToEmptyState(requestError),
        );
        setRefreshInfo({
          generatedAt: new Date().toISOString(),
          staleAfterMs: STALE_AFTER_MS,
          dataFreshness: "degraded",
          source: "live",
        });
        setFeedback({
          tone: "danger",
          title: requestError.message,
          body: emptyReasonOverride ? copy.previewBannerBody : undefined,
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
          setHasLoadedOnce(true);
          setNowTick(Date.now());
        }
      }
    }

    void loadQueue();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [emptyReasonOverride, pageLocale, reloadToken]);

  useEffect(() => {
    const pollId = window.setInterval(() => {
      setReloadToken((current) => current + 1);
    }, REFRESH_INTERVAL_MS);
    const freshnessId = window.setInterval(() => {
      setNowTick(Date.now());
    }, 5_000);
    return () => {
      window.clearInterval(pollId);
      window.clearInterval(freshnessId);
    };
  }, []);

  const scopeOptions = ["all", ...new Set(rows.map((row) => row.scopeKind))];
  const periodOptions = [
    "all",
    ...new Set(
      rows
        .map((row) => row.periodMonth)
        .filter(
          (value): value is string =>
            typeof value === "string" && value.length > 0,
        ),
    ),
  ];

  const pendingRows = rows.filter((row) => row.status === "pending_approval");
  const exportedRows = rows.filter((row) => row.status === "exported");
  const doneRows = rows.filter(
    (row) => row.status === "paid" || row.status === "reconciled",
  );
  const stale =
    Date.parse(refreshInfo.generatedAt) + refreshInfo.staleAfterMs < nowTick;
  const overdueExportedRows = exportedRows.filter((row) => {
    const updatedAt = row.updatedAt ? Date.parse(row.updatedAt) : Number.NaN;
    return (
      Number.isFinite(updatedAt) && nowTick - updatedAt > EXPORT_OVERDUE_MS
    );
  });

  const filteredRows = rows
    .filter((row) => {
      if (tabFilter === "pending" && row.status !== "pending_approval") {
        return false;
      }
      if (tabFilter === "exported" && row.status !== "exported") {
        return false;
      }
      if (
        tabFilter === "done" &&
        row.status !== "paid" &&
        row.status !== "reconciled"
      ) {
        return false;
      }
      if (scopeFilter !== "all" && row.scopeKind !== scopeFilter) {
        return false;
      }
      if (periodFilter !== "all" && row.periodMonth !== periodFilter) {
        return false;
      }
      if (stateFilter !== "all" && row.status !== stateFilter) {
        return false;
      }
      return true;
    })
    .sort((left, right) => {
      const statusDelta =
        STATUS_PRIORITY[left.status] - STATUS_PRIORITY[right.status];
      if (statusDelta !== 0) {
        return statusDelta;
      }
      const leftUpdated = left.updatedAt ? Date.parse(left.updatedAt) : 0;
      const rightUpdated = right.updatedAt ? Date.parse(right.updatedAt) : 0;
      return rightUpdated - leftUpdated;
    });

  const effectiveEmptyState: EmptyStateEnvelope | null =
    filteredRows.length === 0 && !loading
      ? rows.length === 0
        ? (queueEmptyState ?? {
            reason: "no_data",
            messageCode: "queue.no_data",
          })
        : {
            reason: "filtered_empty",
            messageCode: "queue.filtered_empty",
          }
      : null;

  const shellNav = buildNav(
    pageLocale,
    pendingRows.length > 0 ? String(pendingRows.length) : undefined,
  );

  const tabNodes = [
    {
      id: "all" as const,
      node: (
        <span>
          {copy.tabAll}
          <span style={tabBadgeStyle(theme)}>{rows.length}</span>
        </span>
      ),
    },
    {
      id: "pending" as const,
      node: (
        <span>
          {copy.tabPending}
          <span style={tabBadgeStyle(theme, "warn")}>{pendingRows.length}</span>
        </span>
      ),
    },
    {
      id: "exported" as const,
      node: (
        <span>
          {copy.tabExported}
          <span style={tabBadgeStyle(theme, "accent")}>
            {exportedRows.length}
          </span>
        </span>
      ),
    },
    {
      id: "done" as const,
      node: (
        <span>
          {copy.tabDone}
          <span style={tabBadgeStyle(theme, "success")}>{doneRows.length}</span>
        </span>
      ),
    },
  ];
  const activeTabNode =
    tabNodes.find((tab) => tab.id === tabFilter)?.node ?? tabNodes[0]!.node;

  const queueColumns: CanvasTableColumn<QueueTableRow>[] = [
    {
      h: copy.colBatch,
      w: 172,
      mono: true,
      r: (row) => (
        <div style={cellStackStyle(theme, { mono: true })}>
          <Link href={row.detailHref} style={linkStyle(theme)}>
            {row.batchId}
          </Link>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {row.periodMonth ?? copy.noValue}
          </span>
          {row.linkedReconciliationHref ? (
            <Link href={row.linkedReconciliationHref} style={linkStyle(theme)}>
              {copy.linkedReconciliation}
            </Link>
          ) : null}
        </div>
      ),
    },
    {
      h: copy.colScope,
      w: 196,
      r: (row) => (
        <div style={cellStackStyle(theme)}>
          <span>{row.scopeLabel}</span>
          <span style={{ color: theme.textDim, fontSize: 11 }}>
            {copy.scopeKinds[row.scopeKind as keyof typeof copy.scopeKinds] ??
              copy.scopeKinds.unknown}
          </span>
          {row.crossAppLinks.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {row.crossAppLinks.slice(0, 2).map((link) => (
                <a
                  key={`${row.batchId}-${link.resourceId}-${link.route}`}
                  href={link.route}
                  target={link.openMode === "new_tab" ? "_blank" : undefined}
                  rel={link.openMode === "new_tab" ? "noreferrer" : undefined}
                  style={linkStyle(theme)}
                >
                  {link.label}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      h: copy.colAmount,
      w: 132,
      mono: true,
      r: (row) => formatMoney(row.amount, pageLocale),
    },
    {
      h: copy.colState,
      w: 150,
      r: (row) => (
        <CanvasPill theme={theme} tone={getStatusTone(row.status)} dot>
          {copy.status[row.status]}
        </CanvasPill>
      ),
    },
    {
      h: copy.colSubmitter,
      w: 124,
      r: (row) => row.submitter,
    },
    {
      h: copy.colSubmittedAt,
      w: 164,
      mono: true,
      r: (row) =>
        row.submittedAt ? formatDateTime(row.submittedAt) : copy.noValue,
    },
    {
      h: copy.colApprover,
      w: 132,
      r: (row) => row.approver ?? copy.noValue,
    },
    {
      h: copy.colUpdatedAt,
      w: 164,
      mono: true,
      r: (row) =>
        row.updatedAt ? formatDateTime(row.updatedAt) : copy.noValue,
    },
    {
      h: copy.colActions,
      w: 218,
      r: (row) => {
        if (row.readOnly) {
          return (
            <CanvasPill theme={theme} tone="neutral">
              {copy.readOnly}
            </CanvasPill>
          );
        }

        return (
          <div style={actionGridStyle()}>
            {row.actions.map((action) => {
              const actionKey = `${row.batchId}:${action.kind}:${action.label}`;
              const disabledReason = formatDisabledReason(copy, action);
              const disabled =
                !action.descriptor.enabled || pendingActionKey === actionKey;

              return (
                <span key={actionKey} title={disabledReason ?? undefined}>
                  <CanvasBtn
                    theme={theme}
                    size="xs"
                    variant={
                      action.kind === "approve" || action.kind === "mark_paid"
                        ? "primary"
                        : "secondary"
                    }
                    disabled={disabled}
                    onClick={() => {
                      if (!action.descriptor.enabled) {
                        setFeedback({
                          tone: "warn",
                          title: disabledReason ?? copy.unknownAction,
                        });
                        return;
                      }
                      if (
                        action.kind === "export_artifact" &&
                        action.descriptor.riskLevel === "low" &&
                        !action.descriptor.requiresReason
                      ) {
                        void handleAction(action, row);
                        return;
                      }
                      setModal({
                        action,
                        row,
                        reason: "",
                        remittanceProofId: row.remittanceProofId ?? "",
                        paidAt: formatDateTimeLocalInputValue(
                          new Date().toISOString(),
                        ),
                        error: null,
                      });
                    }}
                  >
                    {pendingActionKey === actionKey
                      ? copy.submitting
                      : action.label}
                  </CanvasBtn>
                </span>
              );
            })}
          </div>
        );
      },
    },
  ];

  async function handleAction(
    action: QueueAction,
    row: QueueRow,
    overrides?: {
      reason?: string;
      remittanceProofId?: string;
      paidAt?: string;
    },
  ) {
    const actionKey = `${row.batchId}:${action.kind}:${action.label}`;
    setPendingActionKey(actionKey);
    setFeedback(null);

    try {
      if (action.href) {
        window.open(
          action.href,
          action.openMode === "same_tab" ? "_self" : "_blank",
          "noopener,noreferrer",
        );
        setFeedback({
          tone: "info",
          title: copy.actionSucceeded.export_artifact,
        });
        setPendingActionKey(null);
        setModal(null);
        return;
      }

      if (!action.endpoint) {
        throw new Error(copy.disabledReasons.backend_pending);
      }

      if (action.kind === "export_artifact" && action.method === "GET") {
        const response = await requestEnvelope(action.endpoint, {
          method: "GET",
        });
        const record = toRecord(response);
        const data = record.data;
        const link =
          parseString(record.url) ??
          parseString(record.href) ??
          parseString(toRecord(data).url) ??
          parseString(toRecord(data).href) ??
          parseString(data);

        if (link) {
          window.open(link, "_blank", "noopener,noreferrer");
        } else {
          downloadTextArtifact(row.batchId, response);
        }

        setFeedback({
          tone: "info",
          title: copy.actionSucceeded.export_artifact,
        });
        setPendingActionKey(null);
        setModal(null);
        return;
      }

      const body: Record<string, unknown> = {};
      if (actorId.trim()) {
        body.actorId = actorId.trim();
      }
      if (overrides?.reason?.trim()) {
        body.reason = overrides.reason.trim();
      }

      if (action.kind === "approve") {
        if (!row.statementId) {
          throw new Error(copy.disabledReasons.missing_statement);
        }
        body.statementId = row.statementId;
      }

      if (action.kind === "mark_paid") {
        const proofId = overrides?.remittanceProofId?.trim();
        if (!proofId) {
          throw new Error(copy.paymentProofPlaceholder);
        }
        body.remittanceProofId = proofId;
        const paidAt = normalizeDateTimeLocalValue(overrides?.paidAt ?? "");
        if (paidAt.isoValue) {
          body.paidAt = paidAt.isoValue;
        }
      }

      const response = await requestEnvelope(action.endpoint, {
        method: action.method ?? "POST",
        body: JSON.stringify(body),
      });
      const receipt = readActionReceipt(response);

      setFeedback({
        tone: action.kind === "export_artifact" ? "info" : "success",
        title: copy.actionSucceeded[action.kind],
        body: receipt?.message,
        href: receipt?.auditId
          ? `/audit?auditId=${encodeURIComponent(receipt.auditId)}`
          : undefined,
        hrefLabel: receipt?.auditId ? copy.viewAudit : undefined,
      });
      setModal(null);
      setReloadToken((current) => current + 1);
    } catch (error) {
      const requestError = error as RequestError;
      const message =
        requestError.message ||
        copy.disabledReasons.backend_pending ||
        copy.genericActionError;
      if (modal) {
        setModal((current) =>
          current
            ? {
                ...current,
                error: message,
              }
            : current,
        );
      } else {
        setFeedback({
          tone: "danger",
          title: message,
        });
      }
    } finally {
      setPendingActionKey(null);
    }
  }

  function clearFilters() {
    setScopeFilter("all");
    setPeriodFilter("all");
    setStateFilter("all");
    setTabFilter("all");
  }

  return (
    <div style={viewportStyle(theme)}>
      <CanvasShell
        theme={theme}
        nav={shellNav}
        active="payments"
        currentPath="/payments/reimbursements"
        brandLabel={t("app.name")}
        brandSubLabel={t("app.sub")}
        breadcrumb={[copy.breadcrumbParent, copy.pageTitle]}
        env="production"
        versionLabel="canvas"
        searchPlaceholder={copy.searchPlaceholder}
        avatarLabel={pageLocale === "en" ? "FG" : "財務"}
        style={{ height: "100%" }}
      >
        <CanvasPageHeader
          theme={theme}
          title={copy.pageTitle}
          subtitle={copy.pageSubtitle}
          tabs={tabNodes.map((tab) => tab.node)}
          activeTab={activeTabNode}
          actions={
            <>
              <CanvasPill
                theme={theme}
                tone={freshnessTone(refreshInfo, nowTick)}
              >
                {buildFreshnessLabel(copy, refreshInfo, nowTick)}
              </CanvasPill>
              <CanvasBtn
                theme={theme}
                variant="secondary"
                icon="arrow"
                disabled={refreshing}
                onClick={() => setReloadToken((current) => current + 1)}
              >
                {refreshing ? copy.submitting : copy.refreshNow}
              </CanvasBtn>
            </>
          }
        />

        <div style={pageBodyStyle()}>
          {emptyReasonOverride ? (
            <CanvasBanner
              theme={theme}
              tone="info"
              title={copy.previewBannerTitle}
              body={copy.previewBannerBody}
            />
          ) : null}

          {feedback ? (
            <CanvasBanner
              theme={theme}
              tone={feedback.tone}
              title={feedback.title}
              body={
                feedback.href ? (
                  <span>
                    {feedback.body ? `${feedback.body} ` : ""}
                    <Link href={feedback.href} style={linkStyle(theme)}>
                      {feedback.hrefLabel ?? copy.viewAudit}
                    </Link>
                  </span>
                ) : (
                  feedback.body
                )
              }
            />
          ) : null}

          {pendingRows.length > 0 ? (
            <CanvasBanner
              theme={theme}
              tone="warn"
              title={copy.pendingBannerTitle}
              body={copy.pendingBannerBody(pendingRows.length)}
            />
          ) : null}

          {overdueExportedRows.length > 0 ? (
            <CanvasBanner
              theme={theme}
              tone="info"
              title={copy.exportedBannerTitle}
              body={copy.exportedBannerBody(overdueExportedRows.length)}
            />
          ) : null}

          {stale ? (
            <CanvasBanner
              theme={theme}
              tone="warn"
              title={copy.staleBannerTitle}
              body={copy.staleBannerBody}
            />
          ) : null}

          <CanvasCard
            theme={theme}
            title={copy.queueTitle}
            subtitle={copy.queueSubtitle(filteredRows.length, rows.length)}
            padding={0}
            actions={
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CanvasPill theme={theme} tone="neutral">
                  {copy.refreshTier}
                </CanvasPill>
                <CanvasPill theme={theme} tone="neutral">
                  {copy.source[refreshInfo.source as keyof typeof copy.source]}
                </CanvasPill>
              </div>
            }
          >
            <div
              style={{
                padding: "14px 16px 12px",
                display: "grid",
                gap: 12,
                borderBottom: `1px solid ${theme.border}`,
              }}
            >
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <CanvasPill
                  theme={theme}
                  tone={tabFilter === "all" ? "accent" : "neutral"}
                >
                  {copy.tabAll}
                </CanvasPill>
                <CanvasBtn
                  theme={theme}
                  size="xs"
                  variant={tabFilter === "all" ? "primary" : "secondary"}
                  onClick={() => setTabFilter("all")}
                >
                  {copy.tabAll}
                </CanvasBtn>
                <CanvasBtn
                  theme={theme}
                  size="xs"
                  variant={tabFilter === "pending" ? "primary" : "secondary"}
                  onClick={() => setTabFilter("pending")}
                >
                  {copy.tabPending}
                </CanvasBtn>
                <CanvasBtn
                  theme={theme}
                  size="xs"
                  variant={tabFilter === "exported" ? "primary" : "secondary"}
                  onClick={() => setTabFilter("exported")}
                >
                  {copy.tabExported}
                </CanvasBtn>
                <CanvasBtn
                  theme={theme}
                  size="xs"
                  variant={tabFilter === "done" ? "primary" : "secondary"}
                  onClick={() => setTabFilter("done")}
                >
                  {copy.tabDone}
                </CanvasBtn>
              </div>

              <div style={filterGridStyle()}>
                <CanvasField theme={theme} label={copy.fieldScope}>
                  <select
                    value={scopeFilter}
                    onChange={(event) => setScopeFilter(event.target.value)}
                    style={nativeControlStyle(theme)}
                  >
                    {scopeOptions.map((value) => (
                      <option key={value} value={value}>
                        {copy.scopeKinds[
                          value as keyof typeof copy.scopeKinds
                        ] ?? value}
                      </option>
                    ))}
                  </select>
                </CanvasField>

                <CanvasField theme={theme} label={copy.fieldPeriod}>
                  <select
                    value={periodFilter}
                    onChange={(event) => setPeriodFilter(event.target.value)}
                    style={nativeControlStyle(theme)}
                  >
                    <option value="all">{copy.scopeKinds.all}</option>
                    {periodOptions
                      .filter((value): value is string => value !== "all")
                      .map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                  </select>
                </CanvasField>

                <CanvasField theme={theme} label={copy.fieldState}>
                  <select
                    value={stateFilter}
                    onChange={(event) =>
                      setStateFilter(event.target.value as QueueStatus | "all")
                    }
                    style={nativeControlStyle(theme)}
                  >
                    <option value="all">{copy.tabAll}</option>
                    {QUEUE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {copy.status[status]}
                      </option>
                    ))}
                  </select>
                </CanvasField>

                <CanvasField theme={theme} label={copy.fieldActor}>
                  <input
                    value={actorId}
                    onChange={(event) => setActorId(event.target.value)}
                    style={nativeControlStyle(theme, { mono: true })}
                  />
                </CanvasField>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <CanvasBtn
                  theme={theme}
                  size="xs"
                  icon="filter"
                  onClick={clearFilters}
                >
                  {copy.clearFilters}
                </CanvasBtn>
                <Link href="/payments" style={linkStyle(theme)}>
                  {copy.viewPayments}
                </Link>
                <div
                  style={{
                    marginLeft: "auto",
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                  }}
                >
                  {QUEUE_STATUSES.map((status) => (
                    <CanvasPill
                      key={status}
                      theme={theme}
                      tone={getStatusTone(status)}
                      dot
                    >
                      {copy.status[status]}
                    </CanvasPill>
                  ))}
                </div>
              </div>
            </div>

            {loading ? (
              <div
                style={{ padding: 18, color: theme.textMuted, fontSize: 12.5 }}
              >
                {copy.loading}
              </div>
            ) : effectiveEmptyState ? (
              <EmptyStateView
                copy={copy}
                theme={theme}
                emptyState={effectiveEmptyState}
                onRefresh={() => setReloadToken((current) => current + 1)}
                onClearFilters={clearFilters}
              />
            ) : (
              <CanvasTable
                theme={theme}
                columns={queueColumns}
                rows={filteredRows as QueueTableRow[]}
              />
            )}
          </CanvasCard>
        </div>
      </CanvasShell>

      {modal ? (
        <div style={modalBackdropStyle()}>
          <div style={modalCardStyle(theme)}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: theme.text }}>
                {buildModalTitle(copy, modal.action)}
              </div>
              <CanvasPill
                theme={theme}
                tone={
                  modal.action.descriptor.riskLevel === "high"
                    ? "danger"
                    : modal.action.descriptor.riskLevel === "medium"
                      ? "warn"
                      : "info"
                }
              >
                {
                  copy.modalRisk[
                    modal.action.descriptor
                      .riskLevel as keyof typeof copy.modalRisk
                  ]
                }
              </CanvasPill>
            </div>

            <div
              style={{
                fontSize: 12.5,
                lineHeight: 1.55,
                color: theme.textMuted,
              }}
            >
              {buildModalBody(copy, modal.action)}
            </div>

            <div style={{ fontSize: 12, color: theme.textDim }}>
              {modal.row.batchId} · {modal.row.scopeLabel} ·{" "}
              {formatMoney(modal.row.amount, pageLocale)}
            </div>

            {modal.action.descriptor.requiresReason ? (
              <CanvasField theme={theme} label={copy.fieldReason} required>
                <textarea
                  value={modal.reason}
                  onChange={(event) =>
                    setModal((current) =>
                      current
                        ? {
                            ...current,
                            reason: event.target.value,
                            error: null,
                          }
                        : current,
                    )
                  }
                  style={nativeTextAreaStyle(theme)}
                />
              </CanvasField>
            ) : null}

            {modal.action.kind === "mark_paid" ? (
              <>
                <CanvasField
                  theme={theme}
                  label={copy.fieldRemittanceProof}
                  required
                >
                  <input
                    value={modal.remittanceProofId}
                    onChange={(event) =>
                      setModal((current) =>
                        current
                          ? {
                              ...current,
                              remittanceProofId: event.target.value,
                              error: null,
                            }
                          : current,
                      )
                    }
                    placeholder={copy.paymentProofPlaceholder}
                    style={nativeControlStyle(theme, { mono: true })}
                  />
                </CanvasField>

                <CanvasField theme={theme} label={copy.fieldPaidAt}>
                  <input
                    type="datetime-local"
                    value={modal.paidAt}
                    onChange={(event) =>
                      setModal((current) =>
                        current
                          ? {
                              ...current,
                              paidAt: event.target.value,
                              error: null,
                            }
                          : current,
                      )
                    }
                    style={nativeControlStyle(theme)}
                  />
                </CanvasField>
              </>
            ) : null}

            {modal.error ? (
              <div style={{ fontSize: 12.5, color: theme.danger }}>
                {modal.error}
              </div>
            ) : null}

            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
            >
              <CanvasBtn
                theme={theme}
                variant="secondary"
                onClick={() => setModal(null)}
              >
                {copy.cancelAction}
              </CanvasBtn>
              <CanvasBtn
                theme={theme}
                variant="primary"
                onClick={() => {
                  if (
                    modal.action.descriptor.requiresReason &&
                    !modal.reason.trim()
                  ) {
                    setModal((current) =>
                      current
                        ? {
                            ...current,
                            error: copy.genericActionError,
                          }
                        : current,
                    );
                    return;
                  }
                  void handleAction(modal.action, modal.row, {
                    reason: modal.reason,
                    remittanceProofId: modal.remittanceProofId,
                    paidAt: modal.paidAt,
                  });
                }}
              >
                {copy.confirmAction}
              </CanvasBtn>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
