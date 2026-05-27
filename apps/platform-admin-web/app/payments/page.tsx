/**
 * Finance Console
 * Platform-admin surface for invoice, statement, and reimbursement flows.
 */

"use client";

import { useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
import {
  RECONCILIATION_ISSUE_RESOLUTION_CODES,
  RECONCILIATION_ISSUE_TYPES,
} from "@drts/contracts";
import type {
  CrossAppResourceLink,
  DriverStatementRecord,
  EmptyReason,
  RefreshTier,
  ReconciliationIssueRecord,
  ReimbursementBatchRecord,
  ResourceActionDescriptor,
  SettlementMatrixRecord,
  TenantInvoiceRecord,
} from "@drts/contracts";
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

const DEMO_TENANT_ID = "tenant-demo-001";
const DEFAULT_FINANCE_ACTOR_ID = "finance.console";
const REOPEN_WARN_THRESHOLD = 5;
const PAYMENTS_REFRESH_TIER: RefreshTier = "medium_slow";
const PLATFORM_THEME = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});
const MATRIX_CHANNEL_ORDER = [
  "tenant_enterprise",
  "partner_airport",
  "phone_dispatch",
  "forwarded_shadow",
];
const RECONCILIATION_CHANNEL_OPTIONS = [
  "partner_airport",
  "forwarded_shadow",
  "tenant_enterprise",
  "phone_dispatch",
] as const;
const RECONCILIATION_ISSUE_TYPE_OPTIONS: (typeof RECONCILIATION_ISSUE_TYPES)[number][] =
  ["partner_sponsor_mismatch", "forwarder_status_mismatch"];
const RECONCILIATION_RESOLUTION_OPTIONS: (typeof RECONCILIATION_ISSUE_RESOLUTION_CODES)[number][] =
  [
    "sponsor_corrected",
    "mirror_resynced",
    "external_owner_confirmed",
    "writeoff_approved",
    "duplicate_closed",
    "no_action_required",
    "resolved_other",
  ];
const ISSUE_STATUS_PRIORITY: Record<
  ReconciliationIssueRecord["status"],
  number
> = {
  reopened: 0,
  open: 1,
  assigned: 2,
  resolved: 3,
};
type IssueTableRow = ReconciliationIssueRecord & Record<string, unknown>;
type MatrixTableRow = SettlementMatrixRecord & Record<string, unknown>;
type InvoiceTableRow = TenantInvoiceRecord & Record<string, unknown>;
type StatementTableRow = DriverStatementRecord & Record<string, unknown>;
type RuntimeActionedResource = {
  availableActions?: ResourceActionDescriptor[];
  crossAppLinks?: CrossAppResourceLink[];
};
type RuntimeIssueRecord = ReconciliationIssueRecord & RuntimeActionedResource;
type RuntimeInvoiceRecord = TenantInvoiceRecord & RuntimeActionedResource;
type RuntimeStatementRecord = DriverStatementRecord & RuntimeActionedResource;
type RuntimeReimbursementRecord = ReimbursementBatchRecord &
  RuntimeActionedResource;
type RuntimeSettlementMatrixRecord = SettlementMatrixRecord &
  RuntimeActionedResource;
type ReimbursementTableRow = RuntimeReimbursementRecord &
  Record<string, unknown>;
type EmptyStateConfig = {
  reason: EmptyReason;
  message: string;
  nextAction?: ResourceActionDescriptor;
};
type EmptyStateToneConfig = {
  icon: string;
  tone: CanvasTone;
  background: string;
  border: string;
};

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getPreviousMonthDefaults() {
  const now = new Date();
  const firstDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
  const lastDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0),
  );
  return {
    periodStart: toDateInputValue(firstDay),
    periodEnd: toDateInputValue(lastDay),
    periodMonth: `${firstDay.getUTCFullYear()}-${String(
      firstDay.getUTCMonth() + 1,
    ).padStart(2, "0")}`,
  };
}

function toPeriodStartIso(value: string) {
  return `${value}T00:00:00.000Z`;
}

function toPeriodEndIso(value: string) {
  return `${value}T23:59:59.000Z`;
}

function refreshIntervalForTier(tier: RefreshTier) {
  switch (tier) {
    case "urgent":
      return 5_000;
    case "fast":
      return 3_000;
    case "dispatch":
      return 5_000;
    case "medium":
      return 15_000;
    case "medium_slow":
    case "slow":
      return 30_000;
    case "manual":
    default:
      return null;
  }
}

function formatMoney(
  amount?: { amountMinor: number; currency: string } | null,
) {
  if (!amount) return "—";
  return `${amount.amountMinor.toLocaleString()} ${amount.currency}`;
}

function formatMinorMoney(amountMinor: number, currency: string) {
  return `${amountMinor.toLocaleString()} ${currency}`;
}

function reimbursementWorkflow(
  batch: ReimbursementBatchRecord,
  awaitingApproval: string,
  paid: string,
  approved: string,
) {
  if (batch.status === "paid") return paid;
  if (batch.approvedAt) return approved;
  return awaitingApproval;
}

function sortSettlementMatrix(rows: SettlementMatrixRecord[]) {
  const priority = new Map(
    MATRIX_CHANNEL_ORDER.map((channelKey, index) => [channelKey, index]),
  );
  return [...rows].sort(
    (left, right) =>
      (priority.get(left.channelKey) ?? Number.MAX_SAFE_INTEGER) -
      (priority.get(right.channelKey) ?? Number.MAX_SAFE_INTEGER),
  );
}

function sortReconciliationIssues(rows: ReconciliationIssueRecord[]) {
  return [...rows].sort((left, right) => {
    const statusDelta =
      ISSUE_STATUS_PRIORITY[left.status] - ISSUE_STATUS_PRIORITY[right.status];
    if (statusDelta !== 0) {
      return statusDelta;
    }
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}

function settlementMatrixKey(
  category:
    | "channel"
    | "payer"
    | "sponsor"
    | "invoiceOwner"
    | "invoice"
    | "receipt"
    | "payout"
    | "discount"
    | "reimbursement"
    | "reconciliation",
  channelKey: string,
) {
  return `payments.matrix.${category}.${channelKey}`;
}

function summarizeChannelMix(
  keys: readonly (string | null | undefined)[],
  labelForChannel: (channelKey: string) => string,
) {
  const counts = new Map<string, number>();
  for (const key of keys) {
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  if (counts.size === 0) {
    return "—";
  }

  return [...counts.entries()]
    .sort(
      ([left], [right]) =>
        MATRIX_CHANNEL_ORDER.indexOf(left) -
        MATRIX_CHANNEL_ORDER.indexOf(right),
    )
    .map(([channelKey, count]) => `${labelForChannel(channelKey)} × ${count}`)
    .join(", ");
}

function parseArtifactIds(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function issueStatusTone(
  status: ReconciliationIssueRecord["status"],
): CanvasTone {
  switch (status) {
    case "resolved":
      return "success";
    case "reopened":
      return "danger";
    case "assigned":
      return "info";
    case "open":
    default:
      return "warn";
  }
}

function invoiceStatusTone(status: TenantInvoiceRecord["status"]): CanvasTone {
  switch (status) {
    case "paid":
      return "success";
    case "draft":
      return "neutral";
    case "issued":
    default:
      return "warn";
  }
}

function reimbursementStatusTone(
  status: ReimbursementBatchRecord["status"],
): CanvasTone {
  switch (status) {
    case "paid":
      return "success";
    case "pending":
      return "info";
    default:
      return "warn";
  }
}

function payoutStatusTone(
  status: DriverStatementRecord["payoutStatus"],
): CanvasTone {
  return status === "paid" ? "success" : "warn";
}

function ledgerModeTone(
  mode: SettlementMatrixRecord["localLedgerMode"],
): CanvasTone {
  return mode === "shadow_only" ? "info" : "success";
}

function hoursBetween(startAt?: string | null, endAt?: string | null) {
  const start = startAt ? Date.parse(startAt) : Number.NaN;
  const end = endAt ? Date.parse(endAt) : Number.NaN;
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return null;
  }
  return (end - start) / 3_600_000;
}

function average(values: Array<number | null>) {
  const list = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );
  if (list.length === 0) {
    return null;
  }
  return list.reduce((sum, value) => sum + value, 0) / list.length;
}

function formatHours(value: number | null) {
  if (value === null) {
    return "—";
  }
  if (value >= 72) {
    return `${(value / 24).toFixed(1)}d`;
  }
  return `${Math.max(1, Math.round(value))}h`;
}

function withinDays(value: string, days: number) {
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    return false;
  }
  return Date.now() - time <= days * 24 * 3_600_000;
}

function viewportStyle(theme: CanvasTheme): React.CSSProperties {
  return {
    position: "fixed",
    inset: 0,
    zIndex: 10,
    background: theme.bg,
  };
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

function nativeTextAreaStyle(theme: CanvasTheme): React.CSSProperties {
  return {
    ...nativeControlStyle(theme),
    minHeight: 92,
    resize: "vertical",
  };
}

function nativeSubmitStyle(
  theme: CanvasTheme,
  options?: {
    primary?: boolean;
    disabled?: boolean;
  },
): React.CSSProperties {
  const primary = options?.primary ?? false;
  const disabled = options?.disabled ?? false;
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "7px 12px",
    minHeight: 30,
    borderRadius: 7,
    border: `1px solid ${primary ? theme.accent : theme.border}`,
    background: primary ? theme.accent : theme.surface,
    color: primary ? "#fff" : theme.text,
    fontSize: 12.5,
    fontWeight: 600,
    fontFamily: theme.fontFamily,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
  };
}

function sectionGridStyle(columns: string): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: columns,
    gap: 16,
    alignItems: "start",
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

function listAction(
  action: string,
  riskLevel: ResourceActionDescriptor["riskLevel"],
  options?: {
    enabled?: boolean;
    disabledReasonCode?: string;
    requiresReason?: boolean;
  },
): ResourceActionDescriptor {
  return {
    action,
    enabled: options?.enabled ?? true,
    riskLevel,
    ...(options?.disabledReasonCode
      ? { disabledReasonCode: options.disabledReasonCode }
      : {}),
    ...(options?.requiresReason ? { requiresReason: true } : {}),
  };
}

function getActionDescriptor(
  actions: ResourceActionDescriptor[],
  action: string,
): ResourceActionDescriptor | null {
  return actions.find((descriptor) => descriptor.action === action) ?? null;
}

function resourceActions(
  record: RuntimeActionedResource | null | undefined,
  fallbackActions: ResourceActionDescriptor[],
) {
  return record?.availableActions?.length
    ? record.availableActions
    : fallbackActions;
}

function detectEmptyReason(error: string | null): EmptyReason | null {
  if (!error) {
    return null;
  }
  const normalized = error.toLowerCase();
  if (
    normalized.includes("403") ||
    normalized.includes("permission") ||
    normalized.includes("forbidden")
  ) {
    return "permission_denied";
  }
  if (
    normalized.includes("provision") ||
    normalized.includes("not configured") ||
    normalized.includes("not setup")
  ) {
    return "not_provisioned";
  }
  if (
    normalized.includes("eligible") ||
    normalized.includes("driver_not_eligible")
  ) {
    return "driver_not_eligible";
  }
  if (
    normalized.includes("external") ||
    normalized.includes("dependency") ||
    normalized.includes("unavailable")
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

function emptyStateTone(
  theme: CanvasTheme,
  reason: EmptyReason,
): EmptyStateToneConfig {
  switch (reason) {
    case "not_provisioned":
      return {
        icon: "info",
        tone: "info",
        background: theme.infoBg,
        border: theme.infoBorder,
      };
    case "fetch_failed":
      return {
        icon: "warning",
        tone: "danger",
        background: theme.dangerBg,
        border: theme.dangerBorder,
      };
    case "permission_denied":
      return {
        icon: "lock",
        tone: "warn",
        background: theme.warnBg,
        border: theme.warnBorder,
      };
    case "external_unavailable":
      return {
        icon: "warning",
        tone: "warn",
        background: theme.warnBg,
        border: theme.warnBorder,
      };
    case "filtered_empty":
      return {
        icon: "search",
        tone: "neutral",
        background: theme.surface,
        border: theme.border,
      };
    case "driver_not_eligible":
      return {
        icon: "lock",
        tone: "warn",
        background: theme.warnBg,
        border: theme.warnBorder,
      };
    case "no_data":
    default:
      return {
        icon: "check",
        tone: "neutral",
        background: theme.surface,
        border: theme.border,
      };
  }
}

function defaultEmptyMessage(
  locale: string,
  reason: EmptyReason,
  fallback: string,
): string {
  if (locale === "en") {
    switch (reason) {
      case "not_provisioned":
        return "This finance surface is not provisioned yet. Complete setup before retrying.";
      case "fetch_failed":
        return "The latest settlement data could not be loaded. Retry or check upstream health.";
      case "permission_denied":
        return "Your current role can view this screen but cannot access this dataset.";
      case "external_unavailable":
        return "An upstream settlement dependency is unavailable. Retry after the external system recovers.";
      case "filtered_empty":
        return "No rows match the current filter slice. Adjust filters or broaden the period.";
      case "driver_not_eligible":
        return "This dataset is currently blocked by an eligibility or authority gate.";
      case "no_data":
      default:
        return fallback;
    }
  }

  switch (reason) {
    case "not_provisioned":
      return "這個 finance surface 尚未完成 provision，需先完成設定後再重試。";
    case "fetch_failed":
      return "目前無法載入最新結算資料，請重試或先確認上游健康狀態。";
    case "permission_denied":
      return "你目前的角色可見此頁，但無權讀取這組資料。";
    case "external_unavailable":
      return "上游結算相依服務暫時不可用，需等外部系統恢復後再試。";
    case "filtered_empty":
      return "目前篩選條件沒有符合資料，請調整 filter 或放寬期間。";
    case "driver_not_eligible":
      return "目前資料受到 eligibility 或 authority gate 限制，暫時不可用。";
    case "no_data":
    default:
      return fallback;
  }
}

export default function PaymentsPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const searchParams = useSearchParams();
  const defaults = getPreviousMonthDefaults();
  const theme = PLATFORM_THEME;
  const refreshIntervalMs = refreshIntervalForTier(PAYMENTS_REFRESH_TIER);
  const focusedIssueId = searchParams.get("issueId");
  const focusedBatchId = searchParams.get("batchId");
  const sourceApp = searchParams.get("fromApp");
  const [financeActorId, setFinanceActorId] = useState(
    DEFAULT_FINANCE_ACTOR_ID,
  );
  const [invoices, setInvoices] = useState<RuntimeInvoiceRecord[]>([]);
  const [statements, setStatements] = useState<RuntimeStatementRecord[]>([]);
  const [reimbursements, setReimbursements] = useState<
    RuntimeReimbursementRecord[]
  >([]);
  const [reconciliationIssues, setReconciliationIssues] = useState<
    RuntimeIssueRecord[]
  >([]);
  const [settlementMatrix, setSettlementMatrix] = useState<
    RuntimeSettlementMatrixRecord[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [invoiceFilter, setInvoiceFilter] = useState<
    "all" | "paid" | "draft" | "issued"
  >("all");
  const [invoiceTenantId, setInvoiceTenantId] = useState(DEMO_TENANT_ID);
  const [invoicePeriodStart, setInvoicePeriodStart] = useState(
    defaults.periodStart,
  );
  const [invoicePeriodEnd, setInvoicePeriodEnd] = useState(defaults.periodEnd);
  const [statementPeriodMonth, setStatementPeriodMonth] = useState(
    defaults.periodMonth,
  );
  const [invoicePending, setInvoicePending] = useState(false);
  const [statementPending, setStatementPending] = useState(false);
  const [batchActionId, setBatchActionId] = useState<string | null>(null);
  const [batchActionReasons, setBatchActionReasons] = useState<
    Record<string, string>
  >({});
  const [issueActionId, setIssueActionId] = useState<string | null>(null);
  const [issueDraftPending, setIssueDraftPending] = useState(false);
  const [remittanceProofs, setRemittanceProofs] = useState<
    Record<string, string>
  >({});
  const [issueAssignments, setIssueAssignments] = useState<
    Record<string, string>
  >({});
  const [issueComments, setIssueComments] = useState<Record<string, string>>(
    {},
  );
  const [issueCommentArtifactIds, setIssueCommentArtifactIds] = useState<
    Record<string, string>
  >({});
  const [issueResolutionSummaries, setIssueResolutionSummaries] = useState<
    Record<string, string>
  >({});
  const [issueResolutionArtifactIds, setIssueResolutionArtifactIds] = useState<
    Record<string, string>
  >({});
  const [issueResolutionCodes, setIssueResolutionCodes] = useState<
    Record<string, ReconciliationIssueRecord["resolutionCode"] | "">
  >({});
  const [issueReopenReasons, setIssueReopenReasons] = useState<
    Record<string, string>
  >({});
  const [issueReopenArtifactIds, setIssueReopenArtifactIds] = useState<
    Record<string, string>
  >({});
  const [newIssue, setNewIssue] = useState({
    issueType:
      "partner_sponsor_mismatch" as ReconciliationIssueRecord["issueType"],
    assigneeId: "",
    channelKey: "partner_airport",
    summary: "",
    orderId: "",
    tenantId: DEMO_TENANT_ID,
    partnerId: "",
    partnerProgramId: "",
    sponsorReference: "",
    mirrorOrderId: "",
    externalOrderId: "",
    linkedReconciliationJobId: "",
    comment: "",
    artifactIds: "",
  });

  const loadFinance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        invoiceRecords,
        statementRecords,
        reimbursementRecords,
        issueRecords,
        settlementMatrixRecords,
      ] = await Promise.all([
        client.listPlatformInvoices(),
        client.listDriverStatements(),
        client.listReimbursementBatches(),
        client.listReconciliationIssues(),
        client.listSettlementMatrix(),
      ]);
      setInvoices(invoiceRecords ?? []);
      setStatements(statementRecords ?? []);
      setReimbursements(reimbursementRecords ?? []);
      setReconciliationIssues(issueRecords ?? []);
      setSettlementMatrix(settlementMatrixRecords ?? []);
      setLastRefreshedAt(new Date().toISOString());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  const describeMatrixChannel = useCallback(
    (channelKey: string) => {
      const key = settlementMatrixKey("channel", channelKey);
      const value = t(key);
      return value === key ? channelKey : value;
    },
    [t],
  );

  const describeMatrixField = useCallback(
    (
      category:
        | "payer"
        | "sponsor"
        | "invoiceOwner"
        | "invoice"
        | "receipt"
        | "payout"
        | "discount"
        | "reimbursement"
        | "reconciliation",
      row: SettlementMatrixRecord,
      fallback: string,
    ) => {
      const key = settlementMatrixKey(category, row.channelKey);
      const value = t(key);
      return value === key ? fallback : value;
    },
    [t],
  );

  useEffect(() => {
    void loadFinance();
  }, [loadFinance]);

  useEffect(() => {
    if (refreshIntervalMs === null) {
      return;
    }
    const timer = window.setInterval(() => {
      void loadFinance();
    }, refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, [loadFinance, refreshIntervalMs]);

  useEffect(() => {
    const targetId = focusedIssueId
      ? "payments-reconciliation-queue"
      : focusedBatchId
        ? "payments-reimbursements"
        : null;
    if (!targetId) {
      return;
    }
    document.getElementById(targetId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [focusedBatchId, focusedIssueId]);

  async function handleGenerateInvoice(event: React.FormEvent) {
    event.preventDefault();
    setInvoicePending(true);
    setError(null);
    try {
      const tenantId = invoiceTenantId.trim() || DEMO_TENANT_ID;
      await client.post("/api/tenant/invoices/generate", {
        headers: {
          "x-tenant-id": tenantId,
        },
        body: {
          tenantId,
          periodStart: toPeriodStartIso(invoicePeriodStart),
          periodEnd: toPeriodEndIso(invoicePeriodEnd),
        },
      });
      await loadFinance();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInvoicePending(false);
    }
  }

  async function handleGenerateStatements(event: React.FormEvent) {
    event.preventDefault();
    setStatementPending(true);
    setError(null);
    try {
      await client.generateDriverStatements({
        periodMonth: statementPeriodMonth.trim(),
      });
      await loadFinance();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatementPending(false);
    }
  }

  async function handleCreateReconciliationIssue(event: React.FormEvent) {
    event.preventDefault();
    setIssueDraftPending(true);
    setError(null);
    try {
      await client.createReconciliationIssue({
        issueType: newIssue.issueType,
        summary: newIssue.summary,
        openedBy: financeActorId.trim() || DEFAULT_FINANCE_ACTOR_ID,
        assigneeId: newIssue.assigneeId.trim() || null,
        channelKey: newIssue.channelKey.trim() || null,
        orderId: newIssue.orderId.trim() || null,
        tenantId: newIssue.tenantId.trim() || null,
        partnerId: newIssue.partnerId.trim() || null,
        partnerProgramId: newIssue.partnerProgramId.trim() || null,
        sponsorReference: newIssue.sponsorReference.trim() || null,
        mirrorOrderId: newIssue.mirrorOrderId.trim() || null,
        externalOrderId: newIssue.externalOrderId.trim() || null,
        linkedReconciliationJobId:
          newIssue.linkedReconciliationJobId.trim() || null,
        comment: newIssue.comment.trim() || null,
        artifactIds: parseArtifactIds(newIssue.artifactIds),
      });
      setNewIssue((current) => ({
        ...current,
        assigneeId: "",
        summary: "",
        orderId: "",
        partnerId: "",
        partnerProgramId: "",
        sponsorReference: "",
        mirrorOrderId: "",
        externalOrderId: "",
        linkedReconciliationJobId: "",
        comment: "",
        artifactIds: "",
      }));
      await loadFinance();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIssueDraftPending(false);
    }
  }

  async function handleAssignIssue(issue: ReconciliationIssueRecord) {
    const assigneeId =
      issueAssignments[issue.issueId]?.trim() || issue.ownerId || "";
    if (!assigneeId) {
      setError(t("payments.reconciliation.assigneeRequired"));
      return;
    }

    setIssueActionId(issue.issueId);
    setError(null);
    try {
      await client.assignReconciliationIssue(issue.issueId, {
        assigneeId,
        actorId: financeActorId.trim() || DEFAULT_FINANCE_ACTOR_ID,
        note: issueComments[issue.issueId]?.trim() || null,
      });
      await loadFinance();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIssueActionId(null);
    }
  }

  async function handleCommentIssue(issue: ReconciliationIssueRecord) {
    const message = issueComments[issue.issueId]?.trim() || "";
    if (!message) {
      setError(t("payments.reconciliation.commentRequired"));
      return;
    }
    const artifactIds = parseArtifactIds(
      issueCommentArtifactIds[issue.issueId] ?? "",
    );

    setIssueActionId(issue.issueId);
    setError(null);
    try {
      await client.addReconciliationIssueComment(issue.issueId, {
        actorId: financeActorId.trim() || DEFAULT_FINANCE_ACTOR_ID,
        message,
        artifactIds,
      });
      setIssueComments((current) => ({ ...current, [issue.issueId]: "" }));
      setIssueCommentArtifactIds((current) => ({
        ...current,
        [issue.issueId]: "",
      }));
      await loadFinance();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIssueActionId(null);
    }
  }

  async function handleResolveIssue(issue: ReconciliationIssueRecord) {
    const resolutionSummary =
      issueResolutionSummaries[issue.issueId]?.trim() || "";
    if (!resolutionSummary) {
      setError(t("payments.reconciliation.resolveSummaryRequired"));
      return;
    }
    const artifactIds = parseArtifactIds(
      issueResolutionArtifactIds[issue.issueId] ?? "",
    );

    setIssueActionId(issue.issueId);
    setError(null);
    try {
      await client.resolveReconciliationIssue(issue.issueId, {
        actorId: financeActorId.trim() || DEFAULT_FINANCE_ACTOR_ID,
        resolutionCode:
          (issueResolutionCodes[issue.issueId] as NonNullable<
            ReconciliationIssueRecord["resolutionCode"]
          >) || "resolved_other",
        resolutionSummary,
        artifactIds,
      });
      setIssueResolutionSummaries((current) => ({
        ...current,
        [issue.issueId]: "",
      }));
      setIssueResolutionCodes((current) => ({
        ...current,
        [issue.issueId]: "",
      }));
      setIssueResolutionArtifactIds((current) => ({
        ...current,
        [issue.issueId]: "",
      }));
      await loadFinance();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIssueActionId(null);
    }
  }

  async function handleReopenIssue(issue: ReconciliationIssueRecord) {
    const reason = issueReopenReasons[issue.issueId]?.trim() || "";
    if (!reason) {
      setError(t("payments.reconciliation.reopenReasonRequired"));
      return;
    }
    const artifactIds = parseArtifactIds(
      issueReopenArtifactIds[issue.issueId] ?? "",
    );

    setIssueActionId(issue.issueId);
    setError(null);
    try {
      await client.reopenReconciliationIssue(issue.issueId, {
        actorId: financeActorId.trim() || DEFAULT_FINANCE_ACTOR_ID,
        reason,
        artifactIds,
      });
      setIssueReopenReasons((current) => ({
        ...current,
        [issue.issueId]: "",
      }));
      setIssueReopenArtifactIds((current) => ({
        ...current,
        [issue.issueId]: "",
      }));
      await loadFinance();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIssueActionId(null);
    }
  }

  async function handleApproveBatch(batch: ReimbursementBatchRecord) {
    const descriptor = getActionDescriptor(
      [
        listAction("approve_batch", "high", {
          enabled: !batch.approvedAt,
          disabledReasonCode: "already_approved",
          requiresReason: true,
        }),
      ],
      "approve_batch",
    );
    const reason = batchActionReasons[batch.batchId]?.trim() ?? "";
    if (descriptor?.requiresReason && !reason) {
      setError(
        locale === "en"
          ? "Approval reason is required."
          : "核准代墊批次前必須填寫原因。",
      );
      return;
    }
    setBatchActionId(batch.batchId);
    setError(null);
    try {
      await client.approveReimbursementBatch(batch.batchId, {
        statementId: batch.statementId,
      });
      await loadFinance();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBatchActionId(null);
    }
  }

  async function handleMarkPaid(batch: ReimbursementBatchRecord) {
    const descriptor = getActionDescriptor(
      [
        listAction("mark_paid", "high", {
          enabled: batch.status !== "paid",
          disabledReasonCode: "already_paid",
          requiresReason: true,
        }),
      ],
      "mark_paid",
    );
    const reason = batchActionReasons[batch.batchId]?.trim() ?? "";
    if (descriptor?.requiresReason && !reason) {
      setError(
        locale === "en"
          ? "Paid confirmation reason is required."
          : "標記已付款前必須填寫確認原因。",
      );
      return;
    }
    setBatchActionId(batch.batchId);
    setError(null);
    try {
      const proofId =
        remittanceProofs[batch.batchId]?.trim() ||
        `remit-${batch.batchId.slice(-8)}`;
      await client.markReimbursementPaid(batch.batchId, {
        remittanceProofId: proofId,
        paidAt: new Date().toISOString(),
      });
      setRemittanceProofs((current) => ({
        ...current,
        [batch.batchId]: proofId,
      }));
      await loadFinance();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBatchActionId(null);
    }
  }

  const filteredInvoices =
    invoiceFilter === "all"
      ? invoices
      : invoices.filter((invoice) => invoice.status === invoiceFilter);
  const totalInvoiceAmountMinor = filteredInvoices.reduce(
    (sum, invoice) => sum + (invoice.amount?.amountMinor ?? 0),
    0,
  );
  const totalStatementNetMinor = statements.reduce(
    (sum, statement) => sum + statement.netAmount.amountMinor,
    0,
  );
  const pendingReimbursementMinor = reimbursements
    .filter((batch) => batch.status !== "paid")
    .reduce((sum, batch) => sum + batch.totalAmount.amountMinor, 0);
  const paidReimbursementMinor = reimbursements
    .filter((batch) => batch.status === "paid")
    .reduce((sum, batch) => sum + batch.totalAmount.amountMinor, 0);
  const openIssues = reconciliationIssues.filter(
    (issue) => issue.status !== "resolved",
  );
  const openReconciliationCount = openIssues.length;
  const sortedIssues = sortReconciliationIssues(reconciliationIssues);
  const sortedMatrix = sortSettlementMatrix(settlementMatrix);
  const pendingReimbursements = reimbursements.filter(
    (batch) => batch.status !== "paid",
  );
  const recentIssues = reconciliationIssues.filter((issue) =>
    withinDays(issue.updatedAt || issue.createdAt, 30),
  );
  const issueWindow =
    recentIssues.length > 0 ? recentIssues : reconciliationIssues;
  const reopenedWindowCount = issueWindow.filter(
    (issue) => issue.reopenCount > 0 || issue.status === "reopened",
  ).length;
  const reopenRate =
    issueWindow.length > 0
      ? (reopenedWindowCount / issueWindow.length) * 100
      : 0;
  const reopenRateWarning = reopenRate >= REOPEN_WARN_THRESHOLD;
  const resolvedWindow = issueWindow.filter((issue) => issue.resolvedAt);
  const handlingWindow =
    resolvedWindow.length > 0 ? resolvedWindow : openIssues;
  const averageHandlingHours = average(
    handlingWindow.map((issue) =>
      hoursBetween(issue.createdAt, issue.resolvedAt ?? issue.updatedAt),
    ),
  );
  const openIssueMix = summarizeChannelMix(
    openIssues.map((issue) => issue.channelKey),
    describeMatrixChannel,
  );
  const shadowIssueCount = reconciliationIssues.filter(
    (issue) =>
      issue.channelKey === "forwarded_shadow" ||
      issue.forwardedFinanceContext != null,
  ).length;
  const partnerIssueCount = openIssues.filter(
    (issue) => issue.channelKey === "partner_airport",
  ).length;
  const forwardedIssueCount = openIssues.filter(
    (issue) => issue.channelKey === "forwarded_shadow",
  ).length;
  const tenantIssueCount = openIssues.filter(
    (issue) => issue.channelKey === "tenant_enterprise",
  ).length;
  const phoneIssueCount = openIssues.filter(
    (issue) => issue.channelKey === "phone_dispatch",
  ).length;

  const invoicesById = new Map(
    invoices.map((invoice) => [invoice.invoiceId, invoice]),
  );
  const reimbursementsById = new Map(
    reimbursements.map((batch) => [batch.batchId, batch]),
  );
  let exposureMinor = 0;
  let exposureCurrency = "TWD";
  let linkedExposureCount = 0;
  for (const issue of openIssues) {
    const linkedInvoice = issue.linkedInvoiceId
      ? invoicesById.get(issue.linkedInvoiceId)
      : undefined;
    const linkedBatch = issue.linkedReimbursementBatchId
      ? reimbursementsById.get(issue.linkedReimbursementBatchId)
      : undefined;
    if (linkedInvoice) {
      exposureMinor += linkedInvoice.amount?.amountMinor ?? 0;
      exposureCurrency = linkedInvoice.amount?.currency ?? exposureCurrency;
      linkedExposureCount += 1;
    }
    if (linkedBatch) {
      exposureMinor += linkedBatch.totalAmount.amountMinor;
      exposureCurrency = linkedBatch.totalAmount.currency ?? exposureCurrency;
      linkedExposureCount += 1;
    }
  }

  const describeLedgerMode = (
    mode: SettlementMatrixRecord["localLedgerMode"],
  ) =>
    mode === "shadow_only"
      ? t("payments.matrix.ledger.shadow_only")
      : t("payments.matrix.ledger.full_service");

  const describeInvoiceChannelMix = (invoice: TenantInvoiceRecord) =>
    summarizeChannelMix(
      invoice.lines.map((line) => line.channelKey),
      describeMatrixChannel,
    );

  const describeStatementChannelMix = (statement: DriverStatementRecord) =>
    summarizeChannelMix(
      statement.lines.map((line) => line.channelKey),
      describeMatrixChannel,
    );

  const paymentsPageActions: ResourceActionDescriptor[] = [
    listAction("generate_invoices", "medium"),
    listAction("generate_driver_statements", "medium"),
    listAction("create_reconciliation_issue", "medium"),
  ];

  const issueActionsFor = (
    issue: ReconciliationIssueRecord,
  ): ResourceActionDescriptor[] => [
    listAction("assign_issue", "medium", {
      enabled: issue.status !== "resolved",
      disabledReasonCode: "already_resolved",
    }),
    listAction("comment_with_artifacts", "medium", {
      enabled: issue.status !== "resolved",
      disabledReasonCode: "already_resolved",
    }),
    listAction(
      "resolve_issue",
      issue.status === "reopened" ? "high" : "medium",
      {
        enabled: issue.status !== "resolved",
        disabledReasonCode: "already_resolved",
        requiresReason: issue.status === "reopened",
      },
    ),
    listAction("reopen_issue", "high", {
      enabled: issue.status === "resolved",
      disabledReasonCode: "issue_not_resolved",
      requiresReason: true,
    }),
  ];

  const reimbursementActionsFor = (
    batch: ReimbursementBatchRecord,
  ): ResourceActionDescriptor[] => [
    listAction("approve_batch", "high", {
      enabled: !batch.approvedAt,
      disabledReasonCode: "already_approved",
      requiresReason: true,
    }),
    listAction("mark_paid", "high", {
      enabled: batch.status !== "paid",
      disabledReasonCode: "already_paid",
      requiresReason: true,
    }),
  ];

  const issueOpsLinkFor = (
    issue: ReconciliationIssueRecord,
  ): CrossAppResourceLink => ({
    targetApp: "ops-console",
    route: `/revenue?issueId=${encodeURIComponent(issue.issueId)}`,
    resourceType: "reconciliation_issue",
    resourceId: issue.issueId,
    openMode: "new_tab",
    label: locale === "en" ? "Open ops mirror" : "開啟 ops mirror",
  });

  const rootEmptyReason = detectEmptyReason(error);
  const issueEmptyConfig: EmptyStateConfig = {
    reason: rootEmptyReason ?? "no_data",
    message: defaultEmptyMessage(
      locale,
      rootEmptyReason ?? "no_data",
      t("payments.reconciliation.empty"),
    ),
    ...((
      rootEmptyReason === "fetch_failed"
        ? listAction("retry_refresh", "low")
        : getActionDescriptor(
            paymentsPageActions,
            "create_reconciliation_issue",
          )
    )
      ? {
          nextAction:
            rootEmptyReason === "fetch_failed"
              ? listAction("retry_refresh", "low")
              : getActionDescriptor(
                  paymentsPageActions,
                  "create_reconciliation_issue",
                )!,
        }
      : {}),
  };
  const matrixEmptyConfig: EmptyStateConfig = {
    reason: rootEmptyReason ?? "no_data",
    message: defaultEmptyMessage(
      locale,
      rootEmptyReason ?? "no_data",
      t("payments.matrix.empty"),
    ),
  };
  const invoiceEmptyConfig: EmptyStateConfig = {
    reason:
      filteredInvoices.length === 0 && invoices.length > 0
        ? "filtered_empty"
        : (rootEmptyReason ?? "no_data"),
    message: defaultEmptyMessage(
      locale,
      filteredInvoices.length === 0 && invoices.length > 0
        ? "filtered_empty"
        : (rootEmptyReason ?? "no_data"),
      t("payments.noInvoices"),
    ),
    ...((
      filteredInvoices.length === 0 && invoices.length > 0
        ? listAction("clear_invoice_filter", "low")
        : getActionDescriptor(paymentsPageActions, "generate_invoices")
    )
      ? {
          nextAction:
            filteredInvoices.length === 0 && invoices.length > 0
              ? listAction("clear_invoice_filter", "low")
              : getActionDescriptor(paymentsPageActions, "generate_invoices")!,
        }
      : {}),
  };
  const statementEmptyConfig: EmptyStateConfig = {
    reason: rootEmptyReason ?? "no_data",
    message: defaultEmptyMessage(
      locale,
      rootEmptyReason ?? "no_data",
      t("payments.noStatements"),
    ),
    ...(getActionDescriptor(paymentsPageActions, "generate_driver_statements")
      ? {
          nextAction: getActionDescriptor(
            paymentsPageActions,
            "generate_driver_statements",
          )!,
        }
      : {}),
  };
  const reimbursementEmptyConfig: EmptyStateConfig = {
    reason: rootEmptyReason ?? "no_data",
    message: defaultEmptyMessage(
      locale,
      rootEmptyReason ?? "no_data",
      t("payments.noReimbursements"),
    ),
  };

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

  const copy =
    locale === "en"
      ? {
          breadcrumbParent: "Pricing & Settlement",
          pageTitle: "Settlement governance",
          pageSubtitle:
            "invoices · driver statements · reimbursement batches · settlement matrix · reconciliation issues",
          export: "Export",
          openIssue: "Open issue",
          searchPlaceholder: "Search orders, tenants, drivers...",
          queueSubtitle:
            "Track finance exceptions before drilling into detailed evidence handling.",
          queueProfileTitle: "Queue profile",
          queueProfileSubtitle: "Current operator slice",
          releaseControlsTitle: "Release controls",
          releaseControlsSubtitle:
            "Generate invoices and statements without leaving the payments route.",
          issueActionsTitle: "Reconciliation workflow actions",
          issueActionsSubtitle:
            "Assignment, evidence, resolve, and reopen stay on the same control plane.",
          createIssueTitle: "Open reconciliation issue",
          createIssueSubtitle:
            "Seed actor, context, and the first evidence note in one pass.",
          outstandingLabel: "Current outstanding",
          exposureLabel: "Cumulative exposure",
          handlingLabel: "Average handling time",
          reopenRateLabel: "Reopen rate",
          reopenDeltaWarn: `warn threshold ${REOPEN_WARN_THRESHOLD}%`,
          reopenDeltaOk: `ok < ${REOPEN_WARN_THRESHOLD}%`,
          reopenBannerTitle: "Reopen rate exceeded threshold",
          reopenBannerBody: (rate: string, count: number) =>
            `${rate} of the current 30-day issue window has already been reopened. ${count} row(s) need closer queue hygiene before they recycle again.`,
          queueWindow: "Recent issue window",
          linkedExposure: "Linked exposure",
          shadowIssues: "Shadow issues",
          openMix: "Open mix",
          actorLabel: "Finance actor ID",
          loading: t("payments.loading"),
        }
      : {
          breadcrumbParent: "計價與結算",
          pageTitle: "結算治理",
          pageSubtitle:
            "invoices · driver statements · reimbursement batches · settlement matrix · reconciliation issues",
          export: "匯出",
          openIssue: "開立 issue",
          searchPlaceholder: "搜尋訂單、租戶、司機...",
          queueSubtitle: "先在總表追蹤財務例外，再往下做證據與狀態處理。",
          queueProfileTitle: "Queue 總覽",
          queueProfileSubtitle: "目前治理切面",
          releaseControlsTitle: "產出控制",
          releaseControlsSubtitle:
            "不離開 payments route 直接產 invoice 與 statements。",
          issueActionsTitle: "Reconciliation workflow actions",
          issueActionsSubtitle:
            "指派、補 evidence、結案與重開都維持在同一個 control plane。",
          createIssueTitle: "開立 reconciliation issue",
          createIssueSubtitle:
            "一次補齊 actor、context 與第一筆 evidence note。",
          outstandingLabel: "當期 outstanding",
          exposureLabel: "差額累計",
          handlingLabel: "平均處理時間",
          reopenRateLabel: "reopen 率",
          reopenDeltaWarn: `warn 閾值 ${REOPEN_WARN_THRESHOLD}%`,
          reopenDeltaOk: `ok < ${REOPEN_WARN_THRESHOLD}%`,
          reopenBannerTitle: "Reopen 率超過警戒值",
          reopenBannerBody: (rate: string, count: number) =>
            `最近 30 天 issue 視窗中已有 ${rate} 項目曾被重開。至少 ${count} 筆需要提高 queue hygiene，避免再次循環。`,
          queueWindow: "近 30 天 issue 視窗",
          linkedExposure: "關聯金額",
          shadowIssues: "Shadow issues",
          openMix: "Open mix",
          actorLabel: "財務操作人 ID",
          loading: t("payments.loading"),
        };
  const freshnessLabel = lastRefreshedAt
    ? locale === "en"
      ? `T4 · ${PAYMENTS_REFRESH_TIER} · ${refreshIntervalMs ? `${Math.round(refreshIntervalMs / 1000)}s` : "manual"} · ${formatDateTime(lastRefreshedAt)}`
      : `T4 · ${PAYMENTS_REFRESH_TIER} · ${refreshIntervalMs ? `${Math.round(refreshIntervalMs / 1000)} 秒` : "手動"} · ${formatDateTime(lastRefreshedAt)}`
    : locale === "en"
      ? `T4 · ${PAYMENTS_REFRESH_TIER} · ${refreshIntervalMs ? `${Math.round(refreshIntervalMs / 1000)}s` : "manual"}`
      : `T4 · ${PAYMENTS_REFRESH_TIER} · ${refreshIntervalMs ? `${Math.round(refreshIntervalMs / 1000)} 秒` : "手動"}`;

  const tabs = [
    t("payments.matrix.title"),
    t("payments.invoicesTitle"),
    t("payments.statementsTitle"),
    t("payments.tab.reimbursements"),
    t("payments.reconciliation.title"),
  ];
  const generateInvoicesAction = getActionDescriptor(
    paymentsPageActions,
    "generate_invoices",
  );
  const generateStatementsAction = getActionDescriptor(
    paymentsPageActions,
    "generate_driver_statements",
  );

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
      badge:
        openReconciliationCount > 0
          ? String(openReconciliationCount)
          : undefined,
      badgeTone: openReconciliationCount > 0 ? "danger" : "neutral",
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

  const issueColumns: CanvasTableColumn<IssueTableRow>[] = [
    {
      h: "Issue",
      w: 116,
      mono: true,
      r: (issue) => (
        <div style={cellStackStyle({ mono: true })}>
          <span style={{ color: theme.accent, fontWeight: 700 }}>
            {issue.issueId}
          </span>
          {focusedIssueId === issue.issueId ? (
            <span style={{ color: theme.warn, fontSize: 11, fontWeight: 600 }}>
              {locale === "en"
                ? "Deep-linked from ops"
                : "由 ops deep link 進入"}
            </span>
          ) : null}
          {issue.reopenCount > 0 ? (
            <span style={{ color: theme.textMuted, fontSize: 11 }}>
              {t("payments.reconciliation.reopenCount", {
                count: String(issue.reopenCount),
              })}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      h: "Source",
      w: 132,
      r: (issue) => (
        <CanvasPill
          theme={theme}
          tone={issue.source === "forwarder_auto" ? "accent" : "neutral"}
        >
          {formatPlatformCodeLabel(locale, issue.source)}
        </CanvasPill>
      ),
    },
    {
      h: "Type",
      w: 200,
      mono: true,
      r: (issue) => (
        <div style={cellStackStyle({ mono: true })}>
          <span>{issue.issueType}</span>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {describeMatrixChannel(issue.channelKey)}
          </span>
        </div>
      ),
    },
    {
      h: "Tenant",
      w: 128,
      mono: true,
      r: (issue) => issue.tenantId ?? "—",
    },
    {
      h: "External order",
      w: 164,
      mono: true,
      r: (issue) =>
        issue.externalOrderId ?? issue.mirrorOrderId ?? issue.orderId ?? "—",
    },
    {
      h: "Context",
      w: 236,
      mono: true,
      r: (issue) => (
        <div style={cellStackStyle({ mono: true })}>
          <span>{issue.partnerProgramId ?? issue.partnerId ?? "—"}</span>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {issue.sponsorReference ?? issue.linkedReconciliationJobId ?? "—"}
          </span>
        </div>
      ),
    },
    {
      h: "Owner",
      w: 120,
      r: (issue) => issue.ownerId ?? "—",
    },
    {
      h: "Status",
      w: 126,
      r: (issue) => (
        <div style={cellStackStyle()}>
          <CanvasPill theme={theme} tone={issueStatusTone(issue.status)} dot>
            {formatPlatformCodeLabel(locale, issue.status)}
          </CanvasPill>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {t("payments.reconciliation.evidenceCount", {
              count: String(issue.evidenceArtifactIds.length),
            })}
          </span>
          {issue.resolutionSummary ? (
            <span style={{ color: theme.textMuted, fontSize: 11 }}>
              {issue.resolutionSummary}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      h: "Updated",
      w: 156,
      mono: true,
      r: (issue) => formatDateTime(issue.updatedAt),
    },
  ];

  const actionColumns: CanvasTableColumn<IssueTableRow>[] = [
    {
      h: "Issue",
      w: 150,
      r: (issue) => (
        <div style={cellStackStyle()}>
          <CanvasPill theme={theme} tone={issueStatusTone(issue.status)} dot>
            {issue.issueId}
          </CanvasPill>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {issue.summary}
          </span>
        </div>
      ),
    },
    {
      h: "Assignment",
      w: 220,
      r: (issue) =>
        issue.status === "resolved" ? (
          <div style={cellStackStyle()}>
            <span>{issue.ownerId ?? "—"}</span>
            <span style={{ color: theme.textMuted, fontSize: 11 }}>
              {formatDateTime(issue.updatedAt)}
            </span>
          </div>
        ) : (
          <input
            value={issueAssignments[issue.issueId] ?? issue.ownerId ?? ""}
            onChange={(event) =>
              setIssueAssignments((current) => ({
                ...current,
                [issue.issueId]: event.target.value,
              }))
            }
            placeholder={t("payments.reconciliation.assignee")}
            style={nativeControlStyle(theme)}
          />
        ),
    },
    {
      h: "Evidence note",
      w: 320,
      r: (issue) =>
        issue.status === "resolved" ? (
          <div style={cellStackStyle()}>
            <span>
              {issue.resolutionSummary ?? issue.comments.at(-1)?.message ?? "—"}
            </span>
            <span style={{ color: theme.textMuted, fontSize: 11 }}>
              {t("payments.reconciliation.commentCount", {
                count: String(issue.comments.length),
              })}
            </span>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
            <input
              value={issueComments[issue.issueId] ?? ""}
              onChange={(event) =>
                setIssueComments((current) => ({
                  ...current,
                  [issue.issueId]: event.target.value,
                }))
              }
              placeholder={t("payments.reconciliation.comment")}
              style={nativeControlStyle(theme)}
            />
            <input
              value={issueCommentArtifactIds[issue.issueId] ?? ""}
              onChange={(event) =>
                setIssueCommentArtifactIds((current) => ({
                  ...current,
                  [issue.issueId]: event.target.value,
                }))
              }
              placeholder={t("payments.reconciliation.artifactIds")}
              style={nativeControlStyle(theme)}
            />
          </div>
        ),
    },
    {
      h: "Resolution / reopen",
      w: 360,
      r: (issue) =>
        issue.status === "resolved" ? (
          <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
            <input
              value={issueReopenReasons[issue.issueId] ?? ""}
              onChange={(event) =>
                setIssueReopenReasons((current) => ({
                  ...current,
                  [issue.issueId]: event.target.value,
                }))
              }
              placeholder={t("payments.reconciliation.reopenReason")}
              style={nativeControlStyle(theme)}
            />
            <input
              value={issueReopenArtifactIds[issue.issueId] ?? ""}
              onChange={(event) =>
                setIssueReopenArtifactIds((current) => ({
                  ...current,
                  [issue.issueId]: event.target.value,
                }))
              }
              placeholder={t("payments.reconciliation.artifactIds")}
              style={nativeControlStyle(theme)}
            />
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
            <select
              value={issueResolutionCodes[issue.issueId] ?? ""}
              onChange={(event) =>
                setIssueResolutionCodes((current) => ({
                  ...current,
                  [issue.issueId]: event.target
                    .value as ReconciliationIssueRecord["resolutionCode"],
                }))
              }
              style={nativeControlStyle(theme)}
            >
              <option value="">
                {t("payments.reconciliation.resolveCode")}
              </option>
              {RECONCILIATION_RESOLUTION_OPTIONS.map((code) => (
                <option key={code} value={code}>
                  {formatPlatformCodeLabel(locale, code)}
                </option>
              ))}
            </select>
            <input
              value={issueResolutionSummaries[issue.issueId] ?? ""}
              onChange={(event) =>
                setIssueResolutionSummaries((current) => ({
                  ...current,
                  [issue.issueId]: event.target.value,
                }))
              }
              placeholder={t("payments.reconciliation.resolveSummary")}
              style={nativeControlStyle(theme)}
            />
            <input
              value={issueResolutionArtifactIds[issue.issueId] ?? ""}
              onChange={(event) =>
                setIssueResolutionArtifactIds((current) => ({
                  ...current,
                  [issue.issueId]: event.target.value,
                }))
              }
              placeholder={t("payments.reconciliation.artifactIds")}
              style={nativeControlStyle(theme)}
            />
          </div>
        ),
    },
    {
      h: "Actions",
      w: 206,
      r: (issue) => {
        const issueActions = resourceActions(
          issue as RuntimeIssueRecord,
          issueActionsFor(issue),
        );
        const assignAction = getActionDescriptor(issueActions, "assign_issue");
        const commentAction = getActionDescriptor(
          issueActions,
          "comment_with_artifacts",
        );
        const resolveAction = getActionDescriptor(
          issueActions,
          "resolve_issue",
        );
        const reopenAction = getActionDescriptor(issueActions, "reopen_issue");
        const opsLink = issueOpsLinkFor(issue);

        return (
          <div style={{ display: "grid", gap: 8, minWidth: 180 }}>
            {issue.status !== "resolved"
              ? renderContractAction(assignAction, {
                  label: t("payments.reconciliation.assign"),
                  icon: "copy",
                  disabled: issueActionId === issue.issueId,
                  onClick: () => void handleAssignIssue(issue),
                })
              : null}
            {issue.status !== "resolved"
              ? renderContractAction(commentAction, {
                  label: t("payments.reconciliation.addComment"),
                  icon: "plus",
                  disabled: issueActionId === issue.issueId,
                  onClick: () => void handleCommentIssue(issue),
                })
              : null}
            {issue.status !== "resolved"
              ? renderContractAction(resolveAction, {
                  label: t("payments.reconciliation.resolve"),
                  icon: "check",
                  primary: true,
                  disabled: issueActionId === issue.issueId,
                  onClick: () => void handleResolveIssue(issue),
                })
              : null}
            {issue.status === "resolved"
              ? renderContractAction(reopenAction, {
                  label: t("payments.reconciliation.reopen"),
                  icon: "arrow",
                  danger: true,
                  disabled: issueActionId === issue.issueId,
                  onClick: () => void handleReopenIssue(issue),
                })
              : null}
            <a
              href={opsLink.route}
              target="_blank"
              rel="noreferrer"
              style={{
                color: theme.accent,
                textDecoration: "none",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {opsLink.label}
            </a>
          </div>
        );
      },
    },
  ];

  const settlementColumns: CanvasTableColumn<MatrixTableRow>[] = [
    {
      h: t("payments.matrix.col.channel"),
      w: 172,
      r: (row) => (
        <div style={cellStackStyle()}>
          <span>{describeMatrixChannel(row.channelKey)}</span>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {row.orderDomain} · {row.orderSources.join(" / ")}
          </span>
        </div>
      ),
    },
    {
      h: t("payments.matrix.col.payer"),
      w: 168,
      r: (row) => describeMatrixField("payer", row, row.payerType),
    },
    {
      h: t("payments.matrix.col.sponsor"),
      w: 168,
      r: (row) => describeMatrixField("sponsor", row, row.sponsorType),
    },
    {
      h: t("payments.matrix.col.invoice"),
      w: 216,
      r: (row) => (
        <div style={cellStackStyle()}>
          <span>
            {describeMatrixField("invoiceOwner", row, row.invoiceOwner)}
          </span>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {describeMatrixField("invoice", row, row.invoicePath)}
          </span>
        </div>
      ),
    },
    {
      h: t("payments.matrix.col.receipt"),
      w: 168,
      r: (row) => describeMatrixField("receipt", row, row.receiptOwner),
    },
    {
      h: t("payments.matrix.col.payout"),
      w: 172,
      r: (row) => describeMatrixField("payout", row, row.driverPayoutAuthority),
    },
    {
      h: t("payments.matrix.col.discount"),
      w: 220,
      r: (row) => (
        <div style={cellStackStyle()}>
          <span>
            {describeMatrixField("discount", row, row.discountFundingSource)}
          </span>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {describeMatrixField("reimbursement", row, row.reimbursementRule)}
          </span>
        </div>
      ),
    },
    {
      h: t("payments.matrix.col.reconciliation"),
      w: 176,
      r: (row) => (
        <div style={cellStackStyle()}>
          <span>
            {describeMatrixField("reconciliation", row, row.reconciliationPath)}
          </span>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {row.reportingArtifacts.join(", ") || row.notes || "—"}
          </span>
        </div>
      ),
    },
    {
      h: t("payments.matrix.col.ledger"),
      w: 112,
      r: (row) => (
        <CanvasPill
          theme={theme}
          tone={ledgerModeTone(row.localLedgerMode)}
          dot
        >
          {describeLedgerMode(row.localLedgerMode)}
        </CanvasPill>
      ),
    },
  ];

  const invoiceColumns: CanvasTableColumn<InvoiceTableRow>[] = [
    {
      h: t("payments.col.invoice"),
      w: 148,
      mono: true,
      r: (invoice) => (
        <div style={cellStackStyle({ mono: true })}>
          <span>{invoice.invoiceId}</span>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {formatDateTime(invoice.createdAt)}
          </span>
        </div>
      ),
    },
    {
      h: t("payments.col.tenant"),
      w: 128,
      mono: true,
      r: (invoice) => invoice.tenantId,
    },
    {
      h: t("payments.col.channelMix"),
      w: 220,
      r: (invoice) => (
        <div style={{ ...cellStackStyle(), maxWidth: 220 }}>
          {describeInvoiceChannelMix(invoice)}
        </div>
      ),
    },
    {
      h: t("payments.col.amount"),
      w: 130,
      mono: true,
      r: (invoice) => formatMoney(invoice.amount),
    },
    {
      h: t("payments.col.status"),
      w: 108,
      r: (invoice) => (
        <CanvasPill theme={theme} tone={invoiceStatusTone(invoice.status)} dot>
          {formatPlatformCodeLabel(locale, invoice.status)}
        </CanvasPill>
      ),
    },
    {
      h: getPlatformLabel(locale, "pricingSnapshot"),
      w: 148,
      mono: true,
      r: (invoice) => invoice.pricingVersionSnapshot,
    },
    {
      h: t("payments.col.period"),
      w: 200,
      r: (invoice) => (
        <div style={{ ...cellStackStyle(), maxWidth: 200 }}>
          {formatDateTime(invoice.periodStart)} -{" "}
          {formatDateTime(invoice.periodEnd)}
        </div>
      ),
    },
    {
      h: getPlatformLabel(locale, "artifact"),
      w: 130,
      r: (invoice) =>
        invoice.artifactUrl ? (
          <a
            href={invoice.artifactUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              color: theme.accent,
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            {t("payments.downloadPdf")}
          </a>
        ) : (
          "—"
        ),
    },
  ];

  const statementColumns: CanvasTableColumn<StatementTableRow>[] = [
    {
      h: t("payments.col.statement"),
      w: 148,
      mono: true,
      r: (statement) => (
        <div style={cellStackStyle({ mono: true })}>
          <span>{statement.receiptNo}</span>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {statement.statementId}
          </span>
        </div>
      ),
    },
    {
      h: t("payments.col.driver"),
      w: 128,
      mono: true,
      r: (statement) => statement.driverId,
    },
    {
      h: t("payments.col.channelMix"),
      w: 220,
      r: (statement) => (
        <div style={{ ...cellStackStyle(), maxWidth: 220 }}>
          {describeStatementChannelMix(statement)}
        </div>
      ),
    },
    {
      h: t("payments.col.period"),
      w: 112,
      mono: true,
      r: (statement) => statement.periodMonth,
    },
    {
      h: getPlatformLabel(locale, "feePlan"),
      w: 140,
      mono: true,
      r: (statement) => statement.feePlanVersion,
    },
    {
      h: getPlatformLabel(locale, "gross"),
      w: 128,
      mono: true,
      r: (statement) => formatMoney(statement.grossEarning),
    },
    {
      h: getPlatformLabel(locale, "serviceFee"),
      w: 128,
      mono: true,
      r: (statement) => formatMoney(statement.serviceFee),
    },
    {
      h: getPlatformLabel(locale, "subsidy"),
      w: 128,
      mono: true,
      r: (statement) => formatMoney(statement.subsidy),
    },
    {
      h: t("payments.col.net"),
      w: 128,
      mono: true,
      r: (statement) => formatMoney(statement.netAmount),
    },
    {
      h: getPlatformLabel(locale, "payout"),
      w: 108,
      r: (statement) => (
        <CanvasPill
          theme={theme}
          tone={payoutStatusTone(statement.payoutStatus)}
          dot
        >
          {formatPlatformCodeLabel(locale, statement.payoutStatus)}
        </CanvasPill>
      ),
    },
  ];

  const reimbursementColumns: CanvasTableColumn<ReimbursementTableRow>[] = [
    {
      h: t("payments.col.batch"),
      w: 152,
      mono: true,
      r: (batch) => (
        <div style={cellStackStyle({ mono: true })}>
          <span>{batch.batchId}</span>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {batch.periodMonth}
          </span>
        </div>
      ),
    },
    {
      h: t("payments.col.driver"),
      w: 128,
      mono: true,
      r: (batch) => batch.driverId,
    },
    {
      h: getPlatformLabel(locale, "statement"),
      w: 160,
      mono: true,
      r: (batch) => batch.statementId,
    },
    {
      h: getPlatformLabel(locale, "total"),
      w: 128,
      mono: true,
      r: (batch) => formatMoney(batch.totalAmount),
    },
    {
      h: getPlatformLabel(locale, "workflow"),
      w: 168,
      r: (batch) => (
        <div style={cellStackStyle()}>
          <CanvasPill
            theme={theme}
            tone={reimbursementStatusTone(batch.status)}
            dot
          >
            {reimbursementWorkflow(
              batch,
              t("payments.awaitingApproval"),
              formatPlatformCodeLabel(locale, "paid"),
              t("payments.col.approved"),
            )}
          </CanvasPill>
          <span style={{ color: theme.textMuted, fontSize: 11 }}>
            {batch.approvedAt
              ? formatDateTime(batch.approvedAt)
              : t("payments.awaitingApproval")}
          </span>
        </div>
      ),
    },
    {
      h: getPlatformLabel(locale, "remittance"),
      w: 220,
      r: (batch) => (
        <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
          <input
            value={
              remittanceProofs[batch.batchId] ?? batch.remittanceProofId ?? ""
            }
            onChange={(event) =>
              setRemittanceProofs((current) => ({
                ...current,
                [batch.batchId]: event.target.value,
              }))
            }
            placeholder={getPlatformLabel(locale, "remittanceProofExample")}
            style={nativeControlStyle(theme)}
            disabled={batch.status === "paid"}
          />
          <input
            value={batchActionReasons[batch.batchId] ?? ""}
            onChange={(event) =>
              setBatchActionReasons((current) => ({
                ...current,
                [batch.batchId]: event.target.value,
              }))
            }
            placeholder={
              locale === "en" ? "Reason for state change" : "狀態異動原因"
            }
            style={nativeControlStyle(theme)}
          />
        </div>
      ),
    },
    {
      h: getPlatformLabel(locale, "items"),
      w: 220,
      r: (batch) => (
        <div style={{ ...cellStackStyle(), maxWidth: 220 }}>
          {batch.items.map((item) => item.orderId).join(", ")}
        </div>
      ),
    },
    {
      h: t("common.actions"),
      w: 160,
      r: (batch) => {
        const batchActions = resourceActions(
          batch as RuntimeReimbursementRecord,
          reimbursementActionsFor(batch),
        );
        const approveAction = getActionDescriptor(
          batchActions,
          "approve_batch",
        );
        const markPaidAction = getActionDescriptor(batchActions, "mark_paid");
        return (
          <div style={{ display: "grid", gap: 8, minWidth: 140 }}>
            {!batch.approvedAt
              ? renderContractAction(approveAction, {
                  label: t("payments.approve"),
                  icon: "check",
                  disabled: batchActionId === batch.batchId,
                  onClick: () => void handleApproveBatch(batch),
                })
              : null}
            {batch.status !== "paid"
              ? renderContractAction(markPaidAction, {
                  label:
                    batchActionId === batch.batchId
                      ? t("payments.saving")
                      : t("payments.markPaid"),
                  icon: "billing",
                  primary: true,
                  danger: true,
                  disabled: batchActionId === batch.batchId,
                  onClick: () => void handleMarkPaid(batch),
                })
              : null}
            <a
              href={`/payments?batchId=${encodeURIComponent(batch.batchId)}#payments-reimbursements`}
              style={{
                color: theme.accent,
                textDecoration: "none",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {locale === "en" ? "Open batch queue" : "開啟批次佇列"}
            </a>
          </div>
        );
      },
    },
  ];

  function renderContractAction(
    descriptor: ResourceActionDescriptor | null,
    options: {
      label: string;
      icon?: React.ReactNode | string;
      onClick?: () => void;
      danger?: boolean;
      primary?: boolean;
      disabled?: boolean;
      size?: "xs" | "sm" | "md";
    },
  ) {
    if (!descriptor) {
      return null;
    }
    const disabled = options.disabled || !descriptor.enabled;
    const tooltip = !descriptor.enabled
      ? (descriptor.disabledReasonCode ?? descriptor.action)
      : descriptor.requiresReason
        ? locale === "en"
          ? "Reason required"
          : "需填原因"
        : undefined;
    return (
      <span title={tooltip}>
        <CanvasBtn
          theme={theme}
          variant={options.primary ? "primary" : "secondary"}
          disabled={disabled}
          {...(options.size ? { size: options.size } : {})}
          {...(options.danger ? { danger: true } : {})}
          {...(options.icon ? { icon: options.icon } : {})}
          {...(options.onClick ? { onClick: options.onClick } : {})}
        >
          {options.label}
        </CanvasBtn>
      </span>
    );
  }

  function renderEmptyState(config: EmptyStateConfig) {
    const tone = emptyStateTone(theme, config.reason);
    return (
      <div
        style={{
          padding: 18,
          display: "grid",
          gap: 12,
          justifyItems: "start",
          border: `1px dashed ${tone.border}`,
          background: tone.background,
          borderRadius: 10,
          margin: 14,
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              color: theme.text,
              fontWeight: 600,
            }}
          >
            <CanvasPill theme={theme} tone={tone.tone}>
              {config.reason}
            </CanvasPill>
          </div>
          <div
            style={{ color: theme.textMuted, fontSize: 12.5, lineHeight: 1.5 }}
          >
            {config.message}
          </div>
        </div>
        {config.nextAction
          ? renderContractAction(config.nextAction, {
              label:
                config.nextAction.action === "retry_refresh"
                  ? t("common.refresh")
                  : config.nextAction.action === "clear_invoice_filter"
                    ? locale === "en"
                      ? "Clear filter"
                      : "清除篩選"
                    : formatPlatformCodeLabel(locale, config.nextAction.action),
              icon:
                config.nextAction.action === "retry_refresh"
                  ? "arrow"
                  : config.nextAction.action === "clear_invoice_filter"
                    ? "arrow"
                    : "plus",
              ...(config.nextAction.action === "retry_refresh"
                ? { onClick: () => void loadFinance() }
                : {}),
              ...(config.nextAction.action === "clear_invoice_filter"
                ? { onClick: () => setInvoiceFilter("all") }
                : {}),
            })
          : null}
      </div>
    );
  }

  return (
    <div style={viewportStyle(theme)}>
      <CanvasShell
        theme={theme}
        nav={shellNav}
        active="payments"
        brandLabel={t("app.name")}
        brandSubLabel={t("app.sub")}
        breadcrumb={[copy.breadcrumbParent, copy.pageTitle]}
        env="production"
        versionLabel="canvas"
        searchPlaceholder={copy.searchPlaceholder}
        avatarLabel={locale === "en" ? "FA" : "財務"}
        style={{ height: "100%" }}
      >
        <CanvasPageHeader
          theme={theme}
          title={copy.pageTitle}
          subtitle={`${copy.pageSubtitle} · ${freshnessLabel}`}
          tabs={tabs}
          activeTab={tabs[4]}
          actions={
            <>
              <CanvasBtn theme={theme} icon="reports" disabled>
                {copy.export}
              </CanvasBtn>
              {renderContractAction(
                getActionDescriptor(
                  paymentsPageActions,
                  "create_reconciliation_issue",
                ),
                {
                  label: copy.openIssue,
                  icon: "plus",
                  primary: true,
                  onClick: () =>
                    document
                      .getElementById("payments-create-issue")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                },
              )}
            </>
          }
        />

        <div style={pageBodyStyle(theme)}>
          {loading ? (
            <CanvasCard
              theme={theme}
              title={copy.pageTitle}
              subtitle={copy.loading}
            >
              <div style={{ color: theme.textMuted, fontSize: 12.5 }}>
                {copy.loading}
              </div>
            </CanvasCard>
          ) : (
            <>
              {error ? (
                <CanvasBanner
                  theme={theme}
                  tone={
                    rootEmptyReason === "permission_denied" ? "warn" : "danger"
                  }
                  title={`${getPlatformLabel(locale, "error")}: ${error}`}
                  body={copy.queueSubtitle}
                />
              ) : null}

              {sourceApp === "ops-console" && focusedIssueId ? (
                <CanvasBanner
                  theme={theme}
                  tone="info"
                  title={
                    locale === "en"
                      ? `Ops mirror opened ${focusedIssueId}`
                      : `已從 ops mirror 開啟 ${focusedIssueId}`
                  }
                  body={
                    locale === "en"
                      ? "This route owns reconciliation mutation. Review evidence and resolve or reopen from this control plane."
                      : "這個 route 擁有 reconciliation mutation 權限；請在這個 control plane 補證據、結案或重開。"
                  }
                />
              ) : null}

              {reopenRateWarning ? (
                <CanvasBanner
                  theme={theme}
                  tone="warn"
                  title={copy.reopenBannerTitle}
                  body={copy.reopenBannerBody(
                    `${reopenRate.toFixed(1)}%`,
                    reopenedWindowCount,
                  )}
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
                  label={copy.outstandingLabel}
                  value={String(openReconciliationCount)}
                  sub={
                    openIssueMix !== "—"
                      ? openIssueMix
                      : `${partnerIssueCount} partner · ${forwardedIssueCount} forwarded`
                  }
                />
                <CanvasKPI
                  theme={theme}
                  label={copy.exposureLabel}
                  value={formatMinorMoney(exposureMinor, exposureCurrency)}
                  delta={
                    linkedExposureCount > 0
                      ? `${linkedExposureCount} linked`
                      : locale === "en"
                        ? "no linked docs"
                        : "無關聯單據"
                  }
                  sub={copy.linkedExposure}
                />
                <CanvasKPI
                  theme={theme}
                  label={copy.handlingLabel}
                  value={formatHours(averageHandlingHours)}
                  delta={
                    resolvedWindow.length > 0
                      ? `${resolvedWindow.length} resolved`
                      : `${openIssues.length} active`
                  }
                  sub={
                    resolvedWindow.length > 0
                      ? locale === "en"
                        ? "resolved issue window"
                        : "resolved issue 視窗"
                      : locale === "en"
                        ? "active queue age fallback"
                        : "以 active queue age 補位"
                  }
                />
                <CanvasKPI
                  theme={theme}
                  label={copy.reopenRateLabel}
                  value={`${reopenRate.toFixed(1)}%`}
                  delta={
                    reopenRateWarning
                      ? copy.reopenDeltaWarn
                      : copy.reopenDeltaOk
                  }
                  deltaTone={reopenRateWarning ? "down" : "up"}
                  sub={`${copy.queueWindow} · ${issueWindow.length}`}
                />
              </div>

              <div
                style={sectionGridStyle("minmax(0, 2.1fr) minmax(280px, 1fr)")}
              >
                <div id="payments-reconciliation-queue">
                  <CanvasCard
                    theme={theme}
                    title={t("payments.reconciliation.title")}
                    subtitle={copy.queueSubtitle}
                    padding={0}
                    actions={
                      <CanvasBtn
                        theme={theme}
                        variant="secondary"
                        icon="arrow"
                        onClick={() => void loadFinance()}
                      >
                        {t("common.refresh")}
                      </CanvasBtn>
                    }
                  >
                    {sortedIssues.length > 0 ? (
                      <CanvasTable
                        theme={theme}
                        columns={issueColumns}
                        rows={sortedIssues as IssueTableRow[]}
                      />
                    ) : (
                      renderEmptyState(issueEmptyConfig)
                    )}
                  </CanvasCard>
                </div>

                <CanvasCard
                  theme={theme}
                  title={copy.queueProfileTitle}
                  subtitle={copy.queueProfileSubtitle}
                >
                  <CanvasDL
                    theme={theme}
                    cols={1}
                    items={[
                      {
                        k: t("payments.reconciliation.openCount"),
                        v: String(openReconciliationCount),
                        mono: true,
                      },
                      {
                        k: copy.shadowIssues,
                        v: String(shadowIssueCount),
                        mono: true,
                      },
                      {
                        k: copy.queueWindow,
                        v: `${issueWindow.length} / ${reopenedWindowCount}`,
                        mono: true,
                      },
                      {
                        k: copy.linkedExposure,
                        v: formatMinorMoney(exposureMinor, exposureCurrency),
                        mono: true,
                      },
                      {
                        k: copy.openMix,
                        v:
                          openIssueMix !== "—"
                            ? openIssueMix
                            : `${partnerIssueCount} partner · ${tenantIssueCount} tenant · ${phoneIssueCount} phone · ${forwardedIssueCount} forwarded`,
                      },
                      {
                        k: t("payments.pendingReimbursements"),
                        v: `${pendingReimbursements.length} / ${formatMinorMoney(
                          pendingReimbursementMinor,
                          exposureCurrency,
                        )}`,
                        mono: true,
                      },
                    ]}
                  />

                  <div style={{ marginTop: 14 }}>
                    <CanvasField theme={theme} label={copy.actorLabel}>
                      <input
                        value={financeActorId}
                        onChange={(event) =>
                          setFinanceActorId(event.target.value)
                        }
                        style={nativeControlStyle(theme, { mono: true })}
                      />
                    </CanvasField>
                  </div>
                </CanvasCard>
              </div>

              <div
                style={sectionGridStyle("minmax(0, 1.7fr) minmax(320px, 1fr)")}
              >
                <div id="payments-create-issue">
                  <CanvasCard
                    theme={theme}
                    title={copy.createIssueTitle}
                    subtitle={copy.createIssueSubtitle}
                  >
                    <form onSubmit={handleCreateReconciliationIssue}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(180px, 1fr))",
                          gap: 12,
                        }}
                      >
                        <CanvasField
                          theme={theme}
                          label={t("payments.reconciliation.issueType")}
                          required
                        >
                          <select
                            value={newIssue.issueType}
                            onChange={(event) =>
                              setNewIssue((current) => ({
                                ...current,
                                issueType: event.target
                                  .value as ReconciliationIssueRecord["issueType"],
                                channelKey:
                                  event.target.value ===
                                  "forwarder_status_mismatch"
                                    ? "forwarded_shadow"
                                    : "partner_airport",
                              }))
                            }
                            style={nativeControlStyle(theme)}
                          >
                            {RECONCILIATION_ISSUE_TYPE_OPTIONS.map(
                              (issueType) => (
                                <option key={issueType} value={issueType}>
                                  {formatPlatformCodeLabel(locale, issueType)}
                                </option>
                              ),
                            )}
                          </select>
                        </CanvasField>
                        <CanvasField
                          theme={theme}
                          label={t("payments.reconciliation.channel")}
                          required
                        >
                          <select
                            value={newIssue.channelKey}
                            onChange={(event) =>
                              setNewIssue((current) => ({
                                ...current,
                                channelKey: event.target.value,
                              }))
                            }
                            style={nativeControlStyle(theme)}
                          >
                            {RECONCILIATION_CHANNEL_OPTIONS.map(
                              (channelKey) => (
                                <option key={channelKey} value={channelKey}>
                                  {describeMatrixChannel(channelKey)}
                                </option>
                              ),
                            )}
                          </select>
                        </CanvasField>
                        <CanvasField
                          theme={theme}
                          label={t("payments.reconciliation.assignee")}
                        >
                          <input
                            value={newIssue.assigneeId}
                            onChange={(event) =>
                              setNewIssue((current) => ({
                                ...current,
                                assigneeId: event.target.value,
                              }))
                            }
                            style={nativeControlStyle(theme)}
                          />
                        </CanvasField>
                        <CanvasField
                          theme={theme}
                          label={t("payments.reconciliation.orderId")}
                        >
                          <input
                            value={newIssue.orderId}
                            onChange={(event) =>
                              setNewIssue((current) => ({
                                ...current,
                                orderId: event.target.value,
                              }))
                            }
                            style={nativeControlStyle(theme, { mono: true })}
                          />
                        </CanvasField>
                        <CanvasField
                          theme={theme}
                          label={t("payments.reconciliation.partnerId")}
                        >
                          <input
                            value={newIssue.partnerId}
                            onChange={(event) =>
                              setNewIssue((current) => ({
                                ...current,
                                partnerId: event.target.value,
                              }))
                            }
                            style={nativeControlStyle(theme, { mono: true })}
                          />
                        </CanvasField>
                        <CanvasField
                          theme={theme}
                          label={t("payments.reconciliation.partnerProgramId")}
                        >
                          <input
                            value={newIssue.partnerProgramId}
                            onChange={(event) =>
                              setNewIssue((current) => ({
                                ...current,
                                partnerProgramId: event.target.value,
                              }))
                            }
                            style={nativeControlStyle(theme, { mono: true })}
                          />
                        </CanvasField>
                        <CanvasField
                          theme={theme}
                          label={t("payments.reconciliation.sponsorReference")}
                        >
                          <input
                            value={newIssue.sponsorReference}
                            onChange={(event) =>
                              setNewIssue((current) => ({
                                ...current,
                                sponsorReference: event.target.value,
                              }))
                            }
                            style={nativeControlStyle(theme, { mono: true })}
                          />
                        </CanvasField>
                        <CanvasField
                          theme={theme}
                          label={t("payments.reconciliation.mirrorOrderId")}
                        >
                          <input
                            value={newIssue.mirrorOrderId}
                            onChange={(event) =>
                              setNewIssue((current) => ({
                                ...current,
                                mirrorOrderId: event.target.value,
                              }))
                            }
                            style={nativeControlStyle(theme, { mono: true })}
                          />
                        </CanvasField>
                        <CanvasField
                          theme={theme}
                          label={t("payments.reconciliation.externalOrderId")}
                        >
                          <input
                            value={newIssue.externalOrderId}
                            onChange={(event) =>
                              setNewIssue((current) => ({
                                ...current,
                                externalOrderId: event.target.value,
                              }))
                            }
                            style={nativeControlStyle(theme, { mono: true })}
                          />
                        </CanvasField>
                        <CanvasField
                          theme={theme}
                          label={t("payments.reconciliation.linkedJobId")}
                        >
                          <input
                            value={newIssue.linkedReconciliationJobId}
                            onChange={(event) =>
                              setNewIssue((current) => ({
                                ...current,
                                linkedReconciliationJobId: event.target.value,
                              }))
                            }
                            style={nativeControlStyle(theme, { mono: true })}
                          />
                        </CanvasField>
                        <CanvasField
                          theme={theme}
                          label={t("payments.form.tenantId")}
                        >
                          <input
                            value={newIssue.tenantId}
                            onChange={(event) =>
                              setNewIssue((current) => ({
                                ...current,
                                tenantId: event.target.value,
                              }))
                            }
                            style={nativeControlStyle(theme, { mono: true })}
                          />
                        </CanvasField>
                        <div style={{ gridColumn: "1 / -1" }}>
                          <CanvasField
                            theme={theme}
                            label={t("payments.reconciliation.summary")}
                            required
                          >
                            <textarea
                              value={newIssue.summary}
                              onChange={(event) =>
                                setNewIssue((current) => ({
                                  ...current,
                                  summary: event.target.value,
                                }))
                              }
                              style={nativeTextAreaStyle(theme)}
                            />
                          </CanvasField>
                        </div>
                        <div style={{ gridColumn: "1 / -1" }}>
                          <CanvasField
                            theme={theme}
                            label={t("payments.reconciliation.comment")}
                          >
                            <textarea
                              value={newIssue.comment}
                              onChange={(event) =>
                                setNewIssue((current) => ({
                                  ...current,
                                  comment: event.target.value,
                                }))
                              }
                              style={nativeTextAreaStyle(theme)}
                            />
                          </CanvasField>
                        </div>
                        <div style={{ gridColumn: "1 / -1" }}>
                          <CanvasField
                            theme={theme}
                            label={t("payments.reconciliation.artifactIds")}
                            hint={t(
                              "payments.reconciliation.artifactPlaceholder",
                            )}
                          >
                            <input
                              value={newIssue.artifactIds}
                              onChange={(event) =>
                                setNewIssue((current) => ({
                                  ...current,
                                  artifactIds: event.target.value,
                                }))
                              }
                              style={nativeControlStyle(theme, { mono: true })}
                            />
                          </CanvasField>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={issueDraftPending || !newIssue.summary.trim()}
                        style={nativeSubmitStyle(theme, {
                          primary: true,
                          disabled:
                            issueDraftPending || !newIssue.summary.trim(),
                        })}
                      >
                        {issueDraftPending
                          ? t("payments.reconciliation.opening")
                          : t("payments.reconciliation.open")}
                      </button>
                    </form>
                  </CanvasCard>
                </div>

                <CanvasCard
                  theme={theme}
                  title={copy.releaseControlsTitle}
                  subtitle={copy.releaseControlsSubtitle}
                >
                  <form onSubmit={handleGenerateInvoice}>
                    <CanvasField
                      theme={theme}
                      label={t("payments.form.tenantId")}
                    >
                      <input
                        value={invoiceTenantId}
                        onChange={(event) =>
                          setInvoiceTenantId(event.target.value)
                        }
                        style={nativeControlStyle(theme, { mono: true })}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={theme}
                      label={t("payments.form.periodStart")}
                    >
                      <input
                        type="date"
                        value={invoicePeriodStart}
                        onChange={(event) =>
                          setInvoicePeriodStart(event.target.value)
                        }
                        style={nativeControlStyle(theme)}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={theme}
                      label={t("payments.form.periodEnd")}
                    >
                      <input
                        type="date"
                        value={invoicePeriodEnd}
                        onChange={(event) =>
                          setInvoicePeriodEnd(event.target.value)
                        }
                        style={nativeControlStyle(theme)}
                      />
                    </CanvasField>
                    <button
                      type="submit"
                      title={
                        !generateInvoicesAction?.enabled
                          ? generateInvoicesAction?.disabledReasonCode
                          : generateInvoicesAction?.requiresReason
                            ? locale === "en"
                              ? "Reason required"
                              : "需填原因"
                            : undefined
                      }
                      disabled={
                        invoicePending ||
                        generateInvoicesAction?.enabled === false
                      }
                      style={nativeSubmitStyle(theme, {
                        primary: true,
                        disabled:
                          invoicePending ||
                          generateInvoicesAction?.enabled === false,
                      })}
                    >
                      {invoicePending
                        ? t("payments.generating")
                        : t("payments.generateInvoice")}
                    </button>
                  </form>

                  <div
                    style={{
                      height: 1,
                      background: theme.border,
                      margin: "16px 0",
                    }}
                  />

                  <form onSubmit={handleGenerateStatements}>
                    <CanvasField
                      theme={theme}
                      label={t("payments.form.periodMonth")}
                    >
                      <input
                        value={statementPeriodMonth}
                        onChange={(event) =>
                          setStatementPeriodMonth(event.target.value)
                        }
                        placeholder="2026-03"
                        style={nativeControlStyle(theme, { mono: true })}
                      />
                    </CanvasField>
                    <button
                      type="submit"
                      title={
                        !generateStatementsAction?.enabled
                          ? generateStatementsAction?.disabledReasonCode
                          : generateStatementsAction?.requiresReason
                            ? locale === "en"
                              ? "Reason required"
                              : "需填原因"
                            : undefined
                      }
                      disabled={
                        statementPending ||
                        generateStatementsAction?.enabled === false
                      }
                      style={nativeSubmitStyle(theme, {
                        primary: true,
                        disabled:
                          statementPending ||
                          generateStatementsAction?.enabled === false,
                      })}
                    >
                      {statementPending
                        ? t("payments.generating")
                        : t("payments.generateStatements")}
                    </button>
                  </form>
                </CanvasCard>
              </div>

              <CanvasCard
                theme={theme}
                title={copy.issueActionsTitle}
                subtitle={copy.issueActionsSubtitle}
                padding={0}
              >
                {sortedIssues.length > 0 ? (
                  <CanvasTable
                    theme={theme}
                    columns={actionColumns}
                    rows={sortedIssues as IssueTableRow[]}
                  />
                ) : (
                  renderEmptyState(issueEmptyConfig)
                )}
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={t("payments.matrix.title")}
                subtitle={t("payments.matrix.subtitle")}
                padding={0}
              >
                {sortedMatrix.length > 0 ? (
                  <CanvasTable
                    theme={theme}
                    columns={settlementColumns}
                    rows={sortedMatrix as MatrixTableRow[]}
                  />
                ) : (
                  renderEmptyState(matrixEmptyConfig)
                )}
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={t("payments.invoicesTitle")}
                subtitle={`${filteredInvoices.length} / ${invoices.length}`}
                padding={0}
                actions={
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(["all", "paid", "issued", "draft"] as const).map(
                      (value) => (
                        <CanvasBtn
                          key={value}
                          theme={theme}
                          size="xs"
                          variant={
                            invoiceFilter === value ? "primary" : "secondary"
                          }
                          onClick={() => setInvoiceFilter(value)}
                        >
                          {formatPlatformCodeLabel(locale, value)}
                        </CanvasBtn>
                      ),
                    )}
                  </div>
                }
              >
                {filteredInvoices.length > 0 ? (
                  <CanvasTable
                    theme={theme}
                    columns={invoiceColumns}
                    rows={filteredInvoices as InvoiceTableRow[]}
                  />
                ) : (
                  renderEmptyState(invoiceEmptyConfig)
                )}
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={t("payments.statementsTitle")}
                subtitle={`${statements.length}`}
                padding={0}
              >
                {statements.length > 0 ? (
                  <CanvasTable
                    theme={theme}
                    columns={statementColumns}
                    rows={statements as StatementTableRow[]}
                  />
                ) : (
                  renderEmptyState(statementEmptyConfig)
                )}
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={t("payments.reimbursementsTitle")}
                subtitle={`${pendingReimbursements.length} pending · ${paidReimbursementMinor.toLocaleString()} settled`}
                padding={0}
                actions={
                  <a
                    href="/payments#payments-reimbursements"
                    style={{
                      color: theme.accent,
                      textDecoration: "none",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {locale === "en"
                      ? "Open reimbursement queue"
                      : "開啟 reimbursement queue"}
                  </a>
                }
              >
                <div id="payments-reimbursements">
                  {reimbursements.length > 0 ? (
                    <CanvasTable
                      theme={theme}
                      columns={reimbursementColumns}
                      rows={reimbursements as ReimbursementTableRow[]}
                    />
                  ) : (
                    renderEmptyState(reimbursementEmptyConfig)
                  )}
                </div>
              </CanvasCard>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 12,
                }}
              >
                <CanvasCard theme={theme} title={t("payments.invoiceTotal")}>
                  <CanvasDL
                    theme={theme}
                    cols={1}
                    items={[
                      {
                        k: t("payments.invoiceTotal"),
                        v: formatMinorMoney(
                          totalInvoiceAmountMinor,
                          exposureCurrency,
                        ),
                        mono: true,
                      },
                      {
                        k: t("payments.statementNet"),
                        v: formatMinorMoney(
                          totalStatementNetMinor,
                          exposureCurrency,
                        ),
                        mono: true,
                      },
                    ]}
                  />
                </CanvasCard>
                <CanvasCard
                  theme={theme}
                  title={t("payments.pendingReimbursements")}
                >
                  <CanvasDL
                    theme={theme}
                    cols={1}
                    items={[
                      {
                        k: t("payments.pendingReimbursements"),
                        v: formatMinorMoney(
                          pendingReimbursementMinor,
                          exposureCurrency,
                        ),
                        mono: true,
                      },
                      {
                        k: t("payments.paidReimbursements"),
                        v: formatMinorMoney(
                          paidReimbursementMinor,
                          exposureCurrency,
                        ),
                        mono: true,
                      },
                    ]}
                  />
                </CanvasCard>
              </div>
            </>
          )}
        </div>
      </CanvasShell>
    </div>
  );
}
