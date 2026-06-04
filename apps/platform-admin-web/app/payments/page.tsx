/**
 * Finance Console
 * Platform-admin surface for invoice, statement, and reimbursement flows.
 */

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AssistantEntityRef } from "@/components/assistant/assistant-types";
import { usePlatformAdminAssistantPage } from "@/components/assistant/route-context";
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
  DriverStatementRecord,
  ReconciliationIssueRecord,
  ReimbursementBatchRecord,
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
  CanvasTable,
  buildCanvasTheme,
} from "@drts/ui-web";
import type { CanvasTableColumn, CanvasTheme, CanvasTone } from "@drts/ui-web";

const DEMO_TENANT_ID = "tenant-demo-001";
const DEFAULT_FINANCE_ACTOR_ID = "finance.console";
const REOPEN_WARN_THRESHOLD = 5;
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

// /payments stays focused on settlement + reconciliation. The reimbursement
// batch queue/detail live behind a dedicated route per the canvas Q-ADM12
// split; the "Reimbursements →" tab navigates there instead of embedding it.
const REIMBURSEMENTS_ROUTE = "/payments/reimbursements";

type PaymentsTabId = "matrix" | "invoices" | "statements" | "recon";

// Reconciliation mutations (create / assign / resolve / reopen) are surfaced as
// canvas action buttons that open a modal confirm, replacing the old always-on
// inline forms. resolve/reopen are high-risk and require a reason.
type ActiveModal =
  | { kind: "create" }
  | { kind: "assign"; issueId: string }
  | { kind: "resolve"; issueId: string }
  | { kind: "reopen"; issueId: string };

function formatMoney(
  amount?: { amountMinor: number; currency: string } | null,
) {
  if (!amount) return "—";
  return `${amount.amountMinor.toLocaleString()} ${amount.currency}`;
}

function formatMinorMoney(amountMinor: number, currency: string) {
  return `${amountMinor.toLocaleString()} ${currency}`;
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
      (ISSUE_STATUS_PRIORITY[left.status] ?? Number.MAX_SAFE_INTEGER) -
      (ISSUE_STATUS_PRIORITY[right.status] ?? Number.MAX_SAFE_INTEGER);
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
    minHeight: "100%",
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

function emptyStateStyle(theme: CanvasTheme): React.CSSProperties {
  return {
    padding: 18,
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

export default function PaymentsPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const router = useRouter();
  const theme = PLATFORM_THEME;
  const [activeTab, setActiveTab] = useState<PaymentsTabId>("recon");
  const [activeModal, setActiveModal] = useState<ActiveModal | null>(null);
  const [financeActorId, setFinanceActorId] = useState(
    DEFAULT_FINANCE_ACTOR_ID,
  );
  const [invoices, setInvoices] = useState<TenantInvoiceRecord[]>([]);
  const [statements, setStatements] = useState<DriverStatementRecord[]>([]);
  const [reimbursements, setReimbursements] = useState<
    ReimbursementBatchRecord[]
  >([]);
  const [reconciliationIssues, setReconciliationIssues] = useState<
    ReconciliationIssueRecord[]
  >([]);
  const [settlementMatrix, setSettlementMatrix] = useState<
    SettlementMatrixRecord[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoiceFilter, setInvoiceFilter] = useState<
    "all" | "paid" | "draft" | "issued"
  >("all");
  const [issueActionId, setIssueActionId] = useState<string | null>(null);
  const [issueDraftPending, setIssueDraftPending] = useState(false);
  const [issueAssignments, setIssueAssignments] = useState<
    Record<string, string>
  >({});
  const [issueComments, setIssueComments] = useState<Record<string, string>>(
    {},
  );
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
      setActiveModal(null);
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
      setIssueComments((current) => ({ ...current, [issue.issueId]: "" }));
      setActiveModal(null);
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
      setActiveModal(null);
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
      setActiveModal(null);
      await loadFinance();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIssueActionId(null);
    }
  }

  const filteredInvoices =
    invoiceFilter === "all"
      ? invoices
      : invoices.filter((invoice) => invoice.status === invoiceFilter);
  const openIssues = reconciliationIssues.filter(
    (issue) => issue.status !== "resolved",
  );
  const openReconciliationCount = openIssues.length;
  const sortedIssues = sortReconciliationIssues(reconciliationIssues);
  const sortedMatrix = sortSettlementMatrix(settlementMatrix);
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
  const partnerIssueCount = openIssues.filter(
    (issue) => issue.channelKey === "partner_airport",
  ).length;
  const forwardedIssueCount = openIssues.filter(
    (issue) => issue.channelKey === "forwarded_shadow",
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

  const loadingLabel = t("payments.loading");
  const openIssueLabel = t("payments.reconciliation.open");
  const actorLabel = t("payments.reconciliation.actorId");

  const issueColumns: CanvasTableColumn<IssueTableRow>[] = [
    {
      h: t("payments.reconciliation.col.issue"),
      w: 116,
      mono: true,
      r: (issue) => (
        <div style={cellStackStyle({ mono: true })}>
          <span style={{ color: theme.accent, fontWeight: 700 }}>
            {issue.issueId}
          </span>
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
      h: t("payments.reconciliation.col.source"),
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
      h: t("payments.reconciliation.col.type"),
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
      h: t("payments.reconciliation.col.tenant"),
      w: 128,
      mono: true,
      r: (issue) => issue.tenantId ?? "—",
    },
    {
      h: t("payments.reconciliation.col.externalOrder"),
      w: 164,
      mono: true,
      r: (issue) =>
        issue.externalOrderId ?? issue.mirrorOrderId ?? issue.orderId ?? "—",
    },
    {
      h: t("payments.reconciliation.col.owner"),
      w: 120,
      r: (issue) => issue.ownerId ?? "—",
    },
    {
      h: t("payments.reconciliation.col.status"),
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
        </div>
      ),
    },
    {
      h: t("payments.reconciliation.col.updated"),
      w: 156,
      mono: true,
      r: (issue) => formatDateTime(issue.updatedAt),
    },
    {
      h: t("payments.reconciliation.col.actions"),
      w: 184,
      r: (issue) => (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {issue.status === "resolved" ? (
            <CanvasBtn
              theme={theme}
              size="xs"
              variant="secondary"
              icon="arrow"
              disabled={issueActionId === issue.issueId}
              onClick={() =>
                setActiveModal({ kind: "reopen", issueId: issue.issueId })
              }
            >
              {t("payments.reconciliation.reopen")}
            </CanvasBtn>
          ) : (
            <>
              <CanvasBtn
                theme={theme}
                size="xs"
                variant="secondary"
                icon="copy"
                disabled={issueActionId === issue.issueId}
                onClick={() =>
                  setActiveModal({ kind: "assign", issueId: issue.issueId })
                }
              >
                {t("payments.reconciliation.assign")}
              </CanvasBtn>
              <CanvasBtn
                theme={theme}
                size="xs"
                variant="primary"
                danger
                icon="check"
                disabled={issueActionId === issue.issueId}
                onClick={() =>
                  setActiveModal({ kind: "resolve", issueId: issue.issueId })
                }
              >
                {t("payments.reconciliation.resolve")}
              </CanvasBtn>
            </>
          )}
        </div>
      ),
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
      r: (row) =>
        describeMatrixField("reconciliation", row, row.reconciliationPath),
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

  const modalIssue =
    activeModal && "issueId" in activeModal
      ? (reconciliationIssues.find(
          (issue) => issue.issueId === activeModal.issueId,
        ) ?? null)
      : null;

  const assistantBridge = useMemo(() => {
    const assistantInvoiceFilters: Array<{
      value: "all" | "issued" | "paid" | "draft";
      label: string;
    }> = [
      { value: "all", label: t("common.all") },
      { value: "issued", label: formatPlatformCodeLabel(locale, "issued") },
      { value: "paid", label: formatPlatformCodeLabel(locale, "paid") },
      { value: "draft", label: formatPlatformCodeLabel(locale, "draft") },
    ];
    const selectedIssueRecords: AssistantEntityRef[] = modalIssue
      ? [
          {
            kind: "reconciliation-issue",
            id: modalIssue.issueId,
            source: "page-selection",
          },
        ]
      : [];
    const visibleTables =
      activeTab === "matrix"
        ? [
            {
              tableId: "settlement-matrix",
              title: t("payments.matrix.title"),
              visibleRowCount: sortedMatrix.length,
              visibleRowIds: sortedMatrix
                .slice(0, 5)
                .map((row) => row.channelKey),
              availableActions: [
                { actionId: "refresh_payments", label: loadingLabel },
                {
                  actionId: "open_reconciliation_issue",
                  label: openIssueLabel,
                  riskLevel: "medium" as const,
                },
              ],
            },
          ]
        : activeTab === "invoices"
          ? [
              {
                tableId: "tenant-invoices",
                title: t("payments.invoicesTitle"),
                visibleRowCount: filteredInvoices.length,
                visibleRowIds: filteredInvoices
                  .slice(0, 5)
                  .map((row) => row.invoiceId),
                availableActions: assistantInvoiceFilters.map((filter) => ({
                  actionId: `set_invoice_filter:${filter.value}`,
                  label: filter.label,
                })),
              },
            ]
          : activeTab === "statements"
            ? [
                {
                  tableId: "driver-statements",
                  title: t("payments.statementsTitle"),
                  visibleRowCount: statements.length,
                  visibleRowIds: statements
                    .slice(0, 5)
                    .map((row) => row.statementId),
                },
              ]
            : [
                {
                  tableId: "reconciliation-issues",
                  title: t("payments.reconciliation.title"),
                  visibleRowCount: sortedIssues.length,
                  visibleRowIds: sortedIssues
                    .slice(0, 5)
                    .map((row) => row.issueId),
                  selectedRowIds: modalIssue ? [modalIssue.issueId] : [],
                  availableActions: [
                    {
                      actionId: "open_reconciliation_issue",
                      label: openIssueLabel,
                      riskLevel: "medium" as const,
                    },
                    {
                      actionId: "assign_issue",
                      label: t("payments.reconciliation.assign"),
                      riskLevel: "medium" as const,
                    },
                    {
                      actionId: "resolve_issue",
                      label: t("payments.reconciliation.resolve"),
                      riskLevel: "high" as const,
                    },
                    {
                      actionId: "reopen_issue",
                      label: t("payments.reconciliation.reopen"),
                      riskLevel: "high" as const,
                    },
                  ],
                },
              ];

    const forms =
      activeModal?.kind === "create"
        ? [
            {
              formId: "reconciliation-issue-create",
              title: t("payments.page.createIssueTitle"),
              dirty:
                financeActorId !== DEFAULT_FINANCE_ACTOR_ID ||
                newIssue.summary.trim().length > 0 ||
                newIssue.externalOrderId.trim().length > 0 ||
                newIssue.artifactIds.trim().length > 0,
              fields: [
                {
                  fieldId: "financeActorId",
                  label: actorLabel,
                  valueSummary: financeActorId,
                  required: true,
                  dirty: financeActorId !== DEFAULT_FINANCE_ACTOR_ID,
                },
                {
                  fieldId: "issueType",
                  label: t("payments.reconciliation.issueType"),
                  valueSummary: newIssue.issueType,
                  required: true,
                },
                {
                  fieldId: "channelKey",
                  label: t("payments.matrix.col.channel"),
                  valueSummary: newIssue.channelKey,
                },
                {
                  fieldId: "summary",
                  label: t("payments.reconciliation.summary"),
                  valueSummary: newIssue.summary,
                  required: true,
                  dirty: newIssue.summary.trim().length > 0,
                },
                {
                  fieldId: "tenantId",
                  label: t("payments.col.tenant"),
                  valueSummary: newIssue.tenantId,
                },
                {
                  fieldId: "externalOrderId",
                  label: t("payments.page.externalOrder"),
                  valueSummary: newIssue.externalOrderId,
                  dirty: newIssue.externalOrderId.trim().length > 0,
                },
                {
                  fieldId: "artifactIds",
                  label: t("payments.reconciliation.artifactIds"),
                  valueSummary: newIssue.artifactIds,
                  dirty: newIssue.artifactIds.trim().length > 0,
                },
              ],
              validationErrors: [
                ...(financeActorId.trim()
                  ? []
                  : [
                      {
                        fieldId: "financeActorId",
                        code: "required",
                        message: t("payments.page.financeActorIdRequired"),
                      },
                    ]),
                ...(newIssue.summary.trim()
                  ? []
                  : [
                      {
                        fieldId: "summary",
                        code: "required",
                        message: t("payments.page.issueSummaryRequired"),
                      },
                    ]),
              ],
              availableActions: [
                {
                  actionId: "submit_create_issue",
                  label: openIssueLabel,
                  riskLevel: "medium" as const,
                },
              ],
            },
          ]
        : activeModal?.kind === "assign" && modalIssue
          ? [
              {
                formId: "reconciliation-issue-assign",
                title: t("payments.reconciliation.assign"),
                dirty:
                  (
                    issueAssignments[modalIssue.issueId] ??
                    modalIssue.ownerId ??
                    ""
                  ).trim().length > 0 ||
                  (issueComments[modalIssue.issueId] ?? "").trim().length > 0,
                fields: [
                  {
                    fieldId: "assigneeId",
                    label: t("payments.reconciliation.assignee"),
                    valueSummary:
                      issueAssignments[modalIssue.issueId] ??
                      modalIssue.ownerId ??
                      "",
                    required: true,
                  },
                  {
                    fieldId: "comment",
                    label: t("payments.reconciliation.comment"),
                    valueSummary: issueComments[modalIssue.issueId] ?? "",
                    dirty:
                      (issueComments[modalIssue.issueId] ?? "").trim().length >
                      0,
                  },
                ],
                validationErrors:
                  (
                    issueAssignments[modalIssue.issueId] ??
                    modalIssue.ownerId ??
                    ""
                  ).trim().length > 0
                    ? []
                    : [
                        {
                          fieldId: "assigneeId",
                          code: "required",
                          message: t(
                            "payments.reconciliation.assigneeRequired",
                          ),
                        },
                      ],
                availableActions: [
                  {
                    actionId: "submit_assign_issue",
                    label: t("payments.reconciliation.assign"),
                    riskLevel: "medium" as const,
                  },
                ],
              },
            ]
          : activeModal?.kind === "resolve" && modalIssue
            ? [
                {
                  formId: "reconciliation-issue-resolve",
                  title: t("payments.reconciliation.resolve"),
                  dirty:
                    (issueResolutionCodes[modalIssue.issueId] ?? "").trim()
                      .length > 0 ||
                    (issueResolutionSummaries[modalIssue.issueId] ?? "").trim()
                      .length > 0 ||
                    (
                      issueResolutionArtifactIds[modalIssue.issueId] ?? ""
                    ).trim().length > 0,
                  fields: [
                    {
                      fieldId: "resolutionCode",
                      label: t("payments.reconciliation.resolveCode"),
                      valueSummary:
                        issueResolutionCodes[modalIssue.issueId] ?? "",
                      required: true,
                    },
                    {
                      fieldId: "resolutionSummary",
                      label: t("payments.reconciliation.resolveSummary"),
                      valueSummary:
                        issueResolutionSummaries[modalIssue.issueId] ?? "",
                      required: true,
                    },
                    {
                      fieldId: "artifactIds",
                      label: t("payments.reconciliation.artifactIds"),
                      valueSummary:
                        issueResolutionArtifactIds[modalIssue.issueId] ?? "",
                    },
                  ],
                  validationErrors: [
                    ...((issueResolutionCodes[modalIssue.issueId] ?? "").trim()
                      ? []
                      : [
                          {
                            fieldId: "resolutionCode",
                            code: "required",
                            message: t("payments.page.resolutionCodeRequired"),
                          },
                        ]),
                    ...((
                      issueResolutionSummaries[modalIssue.issueId] ?? ""
                    ).trim()
                      ? []
                      : [
                          {
                            fieldId: "resolutionSummary",
                            code: "required",
                            message: t(
                              "payments.reconciliation.resolveSummaryRequired",
                            ),
                          },
                        ]),
                  ],
                  availableActions: [
                    {
                      actionId: "submit_resolve_issue",
                      label: t("payments.reconciliation.resolve"),
                      riskLevel: "high" as const,
                    },
                  ],
                },
              ]
            : activeModal?.kind === "reopen" && modalIssue
              ? [
                  {
                    formId: "reconciliation-issue-reopen",
                    title: t("payments.reconciliation.reopen"),
                    dirty:
                      (issueReopenReasons[modalIssue.issueId] ?? "").trim()
                        .length > 0 ||
                      (issueReopenArtifactIds[modalIssue.issueId] ?? "").trim()
                        .length > 0,
                    fields: [
                      {
                        fieldId: "reopenReason",
                        label: t("payments.reconciliation.reopenReason"),
                        valueSummary:
                          issueReopenReasons[modalIssue.issueId] ?? "",
                        required: true,
                      },
                      {
                        fieldId: "artifactIds",
                        label: t("payments.reconciliation.artifactIds"),
                        valueSummary:
                          issueReopenArtifactIds[modalIssue.issueId] ?? "",
                      },
                    ],
                    validationErrors: (
                      issueReopenReasons[modalIssue.issueId] ?? ""
                    ).trim()
                      ? []
                      : [
                          {
                            fieldId: "reopenReason",
                            code: "required",
                            message: t(
                              "payments.reconciliation.reopenReasonRequired",
                            ),
                          },
                        ],
                    availableActions: [
                      {
                        actionId: "submit_reopen_issue",
                        label: t("payments.reconciliation.reopen"),
                        riskLevel: "high" as const,
                      },
                    ],
                  },
                ]
              : [];

    return {
      pageId: "payments",
      contextSnapshot: {
        activeTab,
        selection: selectedIssueRecords,
        selectedRecords: selectedIssueRecords,
        warnings: [
          ...(error
            ? [
                {
                  code: "payments_data_error",
                  severity: "warning" as const,
                  message: {
                    zh: `Payments 資料載入異常：${error}`,
                    en: `Payments data load error: ${error}`,
                  },
                },
              ]
            : []),
          ...(reopenRateWarning
            ? [
                {
                  code: "payments_reopen_rate_warning",
                  severity: "warning" as const,
                  message: {
                    zh: `Reopen 率 ${reopenRate.toFixed(1)}% 超過警戒值。`,
                    en: `Reopen rate ${reopenRate.toFixed(1)}% exceeds the warning threshold.`,
                  },
                },
              ]
            : []),
        ],
        visibleTables,
        availableActions: [
          { actionId: "refresh_payments", label: loadingLabel },
          {
            actionId: "open_reconciliation_issue",
            label: openIssueLabel,
            riskLevel: "medium" as const,
          },
          {
            actionId: "go_to_reimbursements",
            label: t("payments.tab.reimbursements"),
          },
        ],
        forms,
      },
    };
  }, [
    activeModal,
    activeTab,
    actorLabel,
    error,
    filteredInvoices,
    financeActorId,
    issueAssignments,
    issueComments,
    issueReopenArtifactIds,
    issueReopenReasons,
    issueResolutionArtifactIds,
    issueResolutionCodes,
    issueResolutionSummaries,
    locale,
    modalIssue,
    newIssue,
    openIssueLabel,
    reopenRate,
    reopenRateWarning,
    sortedIssues,
    sortedMatrix,
    statements,
    t,
    loadingLabel,
  ]);

  usePlatformAdminAssistantPage(assistantBridge);

  // The canvas tab strip is non-interactive by default, so we render clickable
  // tab nodes and feed back the exact active node reference for the accent
  // underline. The Reimbursements tab navigates to its dedicated route rather
  // than swapping local body content.
  const tabStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    cursor: "pointer",
  };
  let activeTabNode: React.ReactNode = null;
  const registerTab = (id: PaymentsTabId, label: React.ReactNode) => {
    const node = (
      <span
        key={id}
        role="tab"
        aria-selected={activeTab === id}
        onClick={() => setActiveTab(id)}
        style={tabStyle}
      >
        {label}
      </span>
    );
    if (activeTab === id) {
      activeTabNode = node;
    }
    return node;
  };

  const tabs: React.ReactNode[] = [
    registerTab("matrix", t("payments.matrix.title")),
    registerTab("invoices", t("payments.invoicesTitle")),
    registerTab("statements", t("payments.statementsTitle")),
    <span
      key="reimburse"
      role="tab"
      aria-selected={false}
      onClick={() => router.push(REIMBURSEMENTS_ROUTE)}
      style={tabStyle}
    >
      {`${t("payments.tab.reimbursements")} →`}
      <CanvasPill theme={theme} tone="accent">
        {String(reimbursements.length)}
      </CanvasPill>
    </span>,
    registerTab(
      "recon",
      <>
        {t("payments.reconciliation.title")}
        <CanvasPill theme={theme} tone="warn">
          {String(openReconciliationCount)}
        </CanvasPill>
      </>,
    ),
  ];

  const invoiceFilters: Array<{
    value: "all" | "issued" | "paid" | "draft";
    label: string;
  }> = [
    { value: "all", label: t("common.all") },
    { value: "issued", label: formatPlatformCodeLabel(locale, "issued") },
    { value: "paid", label: formatPlatformCodeLabel(locale, "paid") },
    { value: "draft", label: formatPlatformCodeLabel(locale, "draft") },
  ];

  let activeTable: React.ReactNode;
  if (activeTab === "matrix") {
    activeTable =
      sortedMatrix.length > 0 ? (
        <CanvasTable
          theme={theme}
          columns={settlementColumns}
          rows={sortedMatrix as MatrixTableRow[]}
        />
      ) : (
        <div style={emptyStateStyle(theme)}>
          {t("payments.page.emptyMatrix")}
        </div>
      );
  } else if (activeTab === "invoices") {
    activeTable = (
      <div>
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: "10px 12px",
            flexWrap: "wrap",
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          {invoiceFilters.map((filter) => (
            <CanvasBtn
              key={filter.value}
              theme={theme}
              size="xs"
              variant={invoiceFilter === filter.value ? "primary" : "secondary"}
              onClick={() => setInvoiceFilter(filter.value)}
            >
              {filter.label}
            </CanvasBtn>
          ))}
        </div>
        {filteredInvoices.length > 0 ? (
          <CanvasTable
            theme={theme}
            columns={invoiceColumns}
            rows={filteredInvoices as InvoiceTableRow[]}
          />
        ) : (
          <div style={emptyStateStyle(theme)}>
            {t("payments.page.emptyInvoices")}
          </div>
        )}
      </div>
    );
  } else if (activeTab === "statements") {
    activeTable =
      statements.length > 0 ? (
        <CanvasTable
          theme={theme}
          columns={statementColumns}
          rows={statements as StatementTableRow[]}
        />
      ) : (
        <div style={emptyStateStyle(theme)}>
          {t("payments.page.emptyStatements")}
        </div>
      );
  } else {
    activeTable =
      sortedIssues.length > 0 ? (
        <CanvasTable
          theme={theme}
          columns={issueColumns}
          rows={sortedIssues as IssueTableRow[]}
        />
      ) : (
        <div style={emptyStateStyle(theme)}>
          {t("payments.reconciliation.empty")}
        </div>
      );
  }

  const closeModalButton = (
    <CanvasBtn
      theme={theme}
      size="xs"
      variant="ghost"
      icon="x"
      onClick={() => setActiveModal(null)}
    >
      {t("common.close")}
    </CanvasBtn>
  );
  const cancelLabel = t("common.cancel");

  return (
    <div style={viewportStyle(theme)}>
      <CanvasPageHeader
        theme={theme}
        title={t("payments.page.title")}
        subtitle={t("payments.page.subtitle")}
        tabs={tabs}
        activeTab={activeTabNode}
        actions={
          <>
            <CanvasBtn theme={theme} icon="reports" disabled>
              {t("payments.page.export")}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant="primary"
              icon="plus"
              onClick={() => setActiveModal({ kind: "create" })}
            >
              {openIssueLabel}
            </CanvasBtn>
          </>
        }
      />

      <div style={pageBodyStyle(theme)}>
        {loading ? (
          <CanvasCard
            theme={theme}
            title={t("payments.page.title")}
            subtitle={loadingLabel}
          >
            <div style={{ color: theme.textMuted, fontSize: 12.5 }}>
              {loadingLabel}
            </div>
          </CanvasCard>
        ) : (
          <>
            {error ? (
              <CanvasBanner
                theme={theme}
                tone="danger"
                title={`${getPlatformLabel(locale, "error")}: ${error}`}
                body={t("payments.page.queueSubtitle")}
              />
            ) : null}

            {reopenRateWarning ? (
              <CanvasBanner
                theme={theme}
                tone="warn"
                title={t("payments.page.reopenBannerTitle")}
                body={t("payments.page.reopenBannerBody", {
                  rate: `${reopenRate.toFixed(1)}%`,
                  count: reopenedWindowCount,
                })}
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
                label={t("payments.page.outstandingLabel")}
                value={String(openReconciliationCount)}
                sub={
                  openIssueMix !== "—"
                    ? openIssueMix
                    : `${partnerIssueCount} partner · ${forwardedIssueCount} forwarded`
                }
              />
              <CanvasKPI
                theme={theme}
                label={t("payments.page.exposureLabel")}
                value={formatMinorMoney(exposureMinor, exposureCurrency)}
                delta={
                  linkedExposureCount > 0
                    ? `${linkedExposureCount} linked`
                    : t("payments.page.noLinkedDocs")
                }
                sub={t("payments.page.linkedExposure")}
              />
              <CanvasKPI
                theme={theme}
                label={t("payments.page.handlingLabel")}
                value={formatHours(averageHandlingHours)}
                delta={
                  resolvedWindow.length > 0
                    ? `${resolvedWindow.length} resolved`
                    : `${openIssues.length} active`
                }
                sub={
                  resolvedWindow.length > 0
                    ? t("payments.page.handlingResolvedWindow")
                    : t("payments.page.handlingActiveFallback")
                }
              />
              <CanvasKPI
                theme={theme}
                label={t("payments.page.reopenRateLabel")}
                value={`${reopenRate.toFixed(1)}%`}
                delta={
                  reopenRateWarning
                    ? t("payments.page.reopenDeltaWarn", {
                        threshold: REOPEN_WARN_THRESHOLD,
                      })
                    : t("payments.page.reopenDeltaOk", {
                        threshold: REOPEN_WARN_THRESHOLD,
                      })
                }
                deltaTone={reopenRateWarning ? "down" : "up"}
                sub={t("payments.page.queueWindow")}
              />
            </div>

            <CanvasCard theme={theme} padding={0}>
              {activeTable}
            </CanvasCard>
          </>
        )}
      </div>

      {activeModal ? (
        <div
          onClick={() => setActiveModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(3, 7, 14, 0.62)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "64px 16px",
            zIndex: 60,
            overflowY: "auto",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{ width: "100%", maxWidth: 560 }}
          >
            {activeModal.kind === "create" ? (
              <CanvasCard
                theme={theme}
                title={t("payments.page.createIssueTitle")}
                subtitle={t("payments.page.createIssueSubtitle")}
                actions={closeModalButton}
              >
                <form
                  onSubmit={(event) =>
                    void handleCreateReconciliationIssue(event)
                  }
                  style={{ display: "grid", gap: 2 }}
                >
                  <CanvasField theme={theme} label={actorLabel} required>
                    <input
                      value={financeActorId}
                      onChange={(event) =>
                        setFinanceActorId(event.target.value)
                      }
                      style={nativeControlStyle(theme, { mono: true })}
                    />
                  </CanvasField>
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
                        }))
                      }
                      style={nativeControlStyle(theme)}
                    >
                      {RECONCILIATION_ISSUE_TYPE_OPTIONS.map((type) => (
                        <option key={type} value={type}>
                          {formatPlatformCodeLabel(locale, type)}
                        </option>
                      ))}
                    </select>
                  </CanvasField>
                  <CanvasField
                    theme={theme}
                    label={t("payments.matrix.col.channel")}
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
                      {RECONCILIATION_CHANNEL_OPTIONS.map((channel) => (
                        <option key={channel} value={channel}>
                          {describeMatrixChannel(channel)}
                        </option>
                      ))}
                    </select>
                  </CanvasField>
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
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                    }}
                  >
                    <CanvasField theme={theme} label={t("payments.col.tenant")}>
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
                    <CanvasField
                      theme={theme}
                      label={t("payments.page.externalOrder")}
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
                  </div>
                  <CanvasField
                    theme={theme}
                    label={t("payments.reconciliation.artifactIds")}
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
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: 8,
                      marginTop: 6,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveModal(null)}
                      style={nativeSubmitStyle(theme)}
                    >
                      {cancelLabel}
                    </button>
                    <button
                      type="submit"
                      disabled={issueDraftPending}
                      style={nativeSubmitStyle(theme, {
                        primary: true,
                        disabled: issueDraftPending,
                      })}
                    >
                      {issueDraftPending
                        ? t("payments.saving")
                        : openIssueLabel}
                    </button>
                  </div>
                </form>
              </CanvasCard>
            ) : null}

            {modalIssue && activeModal.kind === "assign" ? (
              <CanvasCard
                theme={theme}
                title={t("payments.reconciliation.assign")}
                subtitle={modalIssue.issueId}
                actions={closeModalButton}
              >
                <CanvasDL
                  theme={theme}
                  cols={2}
                  items={[
                    {
                      k: t("payments.page.issueLabel"),
                      v: modalIssue.issueId,
                      mono: true,
                    },
                    {
                      k: t("payments.page.statusLabel"),
                      v: formatPlatformCodeLabel(locale, modalIssue.status),
                    },
                    {
                      k: t("payments.page.ownerLabel"),
                      v: modalIssue.ownerId ?? "—",
                    },
                    {
                      k: t("payments.page.summaryLabel"),
                      v: modalIssue.summary,
                    },
                  ]}
                />
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleAssignIssue(modalIssue);
                  }}
                  style={{ display: "grid", gap: 2, marginTop: 14 }}
                >
                  <CanvasField
                    theme={theme}
                    label={t("payments.reconciliation.assignee")}
                    required
                  >
                    <input
                      value={
                        issueAssignments[modalIssue.issueId] ??
                        modalIssue.ownerId ??
                        ""
                      }
                      onChange={(event) =>
                        setIssueAssignments((current) => ({
                          ...current,
                          [modalIssue.issueId]: event.target.value,
                        }))
                      }
                      style={nativeControlStyle(theme, { mono: true })}
                    />
                  </CanvasField>
                  <CanvasField
                    theme={theme}
                    label={t("payments.reconciliation.comment")}
                  >
                    <input
                      value={issueComments[modalIssue.issueId] ?? ""}
                      onChange={(event) =>
                        setIssueComments((current) => ({
                          ...current,
                          [modalIssue.issueId]: event.target.value,
                        }))
                      }
                      style={nativeControlStyle(theme)}
                    />
                  </CanvasField>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: 8,
                      marginTop: 6,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveModal(null)}
                      style={nativeSubmitStyle(theme)}
                    >
                      {cancelLabel}
                    </button>
                    <button
                      type="submit"
                      disabled={issueActionId === modalIssue.issueId}
                      style={nativeSubmitStyle(theme, {
                        primary: true,
                        disabled: issueActionId === modalIssue.issueId,
                      })}
                    >
                      {t("payments.reconciliation.assign")}
                    </button>
                  </div>
                </form>
              </CanvasCard>
            ) : null}

            {modalIssue && activeModal.kind === "resolve" ? (
              <CanvasCard
                theme={theme}
                title={t("payments.reconciliation.resolve")}
                subtitle={modalIssue.issueId}
                actions={closeModalButton}
              >
                <CanvasDL
                  theme={theme}
                  cols={2}
                  items={[
                    {
                      k: t("payments.page.issueLabel"),
                      v: modalIssue.issueId,
                      mono: true,
                    },
                    {
                      k: t("payments.page.statusLabel"),
                      v: formatPlatformCodeLabel(locale, modalIssue.status),
                    },
                    {
                      k: t("payments.page.summaryLabel"),
                      v: modalIssue.summary,
                    },
                  ]}
                />
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleResolveIssue(modalIssue);
                  }}
                  style={{ display: "grid", gap: 2, marginTop: 14 }}
                >
                  <CanvasField
                    theme={theme}
                    label={t("payments.reconciliation.resolveCode")}
                    required
                  >
                    <select
                      value={issueResolutionCodes[modalIssue.issueId] ?? ""}
                      onChange={(event) =>
                        setIssueResolutionCodes((current) => ({
                          ...current,
                          [modalIssue.issueId]: event.target
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
                  </CanvasField>
                  <CanvasField
                    theme={theme}
                    label={t("payments.reconciliation.resolveSummary")}
                    required
                  >
                    <textarea
                      value={issueResolutionSummaries[modalIssue.issueId] ?? ""}
                      onChange={(event) =>
                        setIssueResolutionSummaries((current) => ({
                          ...current,
                          [modalIssue.issueId]: event.target.value,
                        }))
                      }
                      style={nativeTextAreaStyle(theme)}
                    />
                  </CanvasField>
                  <CanvasField
                    theme={theme}
                    label={t("payments.reconciliation.artifactIds")}
                  >
                    <input
                      value={
                        issueResolutionArtifactIds[modalIssue.issueId] ?? ""
                      }
                      onChange={(event) =>
                        setIssueResolutionArtifactIds((current) => ({
                          ...current,
                          [modalIssue.issueId]: event.target.value,
                        }))
                      }
                      style={nativeControlStyle(theme, { mono: true })}
                    />
                  </CanvasField>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: 8,
                      marginTop: 6,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveModal(null)}
                      style={nativeSubmitStyle(theme)}
                    >
                      {cancelLabel}
                    </button>
                    <button
                      type="submit"
                      disabled={issueActionId === modalIssue.issueId}
                      style={nativeSubmitStyle(theme, {
                        primary: true,
                        disabled: issueActionId === modalIssue.issueId,
                      })}
                    >
                      {t("payments.reconciliation.resolve")}
                    </button>
                  </div>
                </form>
              </CanvasCard>
            ) : null}

            {modalIssue && activeModal.kind === "reopen" ? (
              <CanvasCard
                theme={theme}
                title={t("payments.reconciliation.reopen")}
                subtitle={modalIssue.issueId}
                actions={closeModalButton}
              >
                <CanvasDL
                  theme={theme}
                  cols={2}
                  items={[
                    {
                      k: t("payments.page.issueLabel"),
                      v: modalIssue.issueId,
                      mono: true,
                    },
                    {
                      k: t("payments.page.statusLabel"),
                      v: formatPlatformCodeLabel(locale, modalIssue.status),
                    },
                    {
                      k: t("payments.page.resolutionLabel"),
                      v: modalIssue.resolutionSummary ?? "—",
                    },
                  ]}
                />
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleReopenIssue(modalIssue);
                  }}
                  style={{ display: "grid", gap: 2, marginTop: 14 }}
                >
                  <CanvasField
                    theme={theme}
                    label={t("payments.reconciliation.reopenReason")}
                    required
                  >
                    <textarea
                      value={issueReopenReasons[modalIssue.issueId] ?? ""}
                      onChange={(event) =>
                        setIssueReopenReasons((current) => ({
                          ...current,
                          [modalIssue.issueId]: event.target.value,
                        }))
                      }
                      style={nativeTextAreaStyle(theme)}
                    />
                  </CanvasField>
                  <CanvasField
                    theme={theme}
                    label={t("payments.reconciliation.artifactIds")}
                  >
                    <input
                      value={issueReopenArtifactIds[modalIssue.issueId] ?? ""}
                      onChange={(event) =>
                        setIssueReopenArtifactIds((current) => ({
                          ...current,
                          [modalIssue.issueId]: event.target.value,
                        }))
                      }
                      style={nativeControlStyle(theme, { mono: true })}
                    />
                  </CanvasField>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: 8,
                      marginTop: 6,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveModal(null)}
                      style={nativeSubmitStyle(theme)}
                    >
                      {cancelLabel}
                    </button>
                    <button
                      type="submit"
                      disabled={issueActionId === modalIssue.issueId}
                      style={nativeSubmitStyle(theme, {
                        primary: true,
                        disabled: issueActionId === modalIssue.issueId,
                      })}
                    >
                      {t("payments.reconciliation.reopen")}
                    </button>
                  </div>
                </form>
              </CanvasCard>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
