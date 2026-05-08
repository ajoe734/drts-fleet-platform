/**
 * Finance Console
 * Platform-admin surface for invoice, statement, and reimbursement flows.
 */

"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { usePlatformAdminClient, formatDateTime } from "@/lib/admin-client";
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

const DEMO_TENANT_ID = "tenant-demo-001";
const DEFAULT_FINANCE_ACTOR_ID = "finance.console";
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

function formatMoney(
  amount?: { amountMinor: number; currency: string } | null,
) {
  if (!amount) return "—";
  return `${amount.amountMinor.toLocaleString()} ${amount.currency}`;
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

function isShadowChannel(channelKey?: string | null) {
  return channelKey === "forwarded_shadow";
}

function hasShadowLines(
  lines: readonly { channelKey?: string | null }[] | undefined,
) {
  return (lines ?? []).some((line) => isShadowChannel(line.channelKey));
}

function hasOnlyShadowLines(
  lines: readonly { channelKey?: string | null }[] | undefined,
) {
  const list = lines ?? [];
  if (list.length === 0) return false;
  return list.every((line) => isShadowChannel(line.channelKey));
}

function parseArtifactIds(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function PaymentsPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const defaults = getPreviousMonthDefaults();
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
  const [issueActionId, setIssueActionId] = useState<string | null>(null);
  const [issueDraftPending, setIssueDraftPending] = useState(false);
  const [issueStatusFilter, setIssueStatusFilter] = useState<
    "all" | ReconciliationIssueRecord["status"]
  >("all");
  const [issueTypeFilter, setIssueTypeFilter] = useState<
    "all" | ReconciliationIssueRecord["issueType"]
  >("all");
  const [issueChannelFilter, setIssueChannelFilter] = useState<
    "all" | (typeof RECONCILIATION_CHANNEL_OPTIONS)[number]
  >("all");
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
  const filteredReconciliationIssues = reconciliationIssues.filter((issue) => {
    if (issueStatusFilter !== "all" && issue.status !== issueStatusFilter) {
      return false;
    }
    if (issueTypeFilter !== "all" && issue.issueType !== issueTypeFilter) {
      return false;
    }
    if (
      issueChannelFilter !== "all" &&
      issue.channelKey !== issueChannelFilter
    ) {
      return false;
    }
    return true;
  });
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
  const openReconciliationCount = reconciliationIssues.filter(
    (issue) => issue.status !== "resolved",
  ).length;

  const allLineChannelKeys: (string | null | undefined)[] = [
    ...invoices.flatMap((invoice) =>
      invoice.lines.map((line) => line.channelKey),
    ),
    ...statements.flatMap((statement) =>
      statement.lines.map((line) => line.channelKey),
    ),
  ];
  const shadowLineCount = allLineChannelKeys.filter((key) =>
    isShadowChannel(key),
  ).length;
  const drtsPayableLineCount = allLineChannelKeys.length - shadowLineCount;

  const forwardedShadowIssues = reconciliationIssues.filter(
    (issue) => issue.forwardedFinanceContext != null,
  );
  const reconciliationWorkflowCopy =
    locale === "en"
      ? {
          title: "Resolution workflow",
          subtitle:
            "Open issues here, then drill into detail to assign ownership, capture evidence, and close with an auditable resolution.",
          status: "Status",
          type: "Issue Type",
          channel: "Channel",
          filtered: "Filtered",
          openDetail: "Open detail",
        }
      : {
          title: "對帳處理流程",
          subtitle:
            "先在這裡建立或篩選 issue，再進入 detail 頁完成指派、證據補件與可稽核結案。",
          status: "狀態",
          type: "問題類型",
          channel: "渠道",
          filtered: "目前顯示",
          openDetail: "查看詳情",
        };

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

  if (loading) {
    return <div className="admin-empty">{t("payments.loading")}</div>;
  }

  return (
    <div>
      <div className="admin-page-header">
        <h1>{t("payments.title")}</h1>
        <p>{t("payments.subtitle")}</p>
      </div>

      {error && (
        <div
          className="admin-card"
          style={{ borderColor: "rgba(239,68,68,0.3)" }}
        >
          <p style={{ color: "#dc2626", margin: 0 }}>
            {getPlatformLabel(locale, "error")}: {error}
          </p>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 16,
        }}
      >
        {[
          {
            label: t("payments.invoiceTotal"),
            value: `${totalInvoiceAmountMinor.toLocaleString()} minor`,
            note: `${filteredInvoices.length}`,
          },
          {
            label: t("payments.statementNet"),
            value: `${totalStatementNetMinor.toLocaleString()} minor`,
            note: `${statements.length}`,
          },
          {
            label: t("payments.pendingReimbursements"),
            value: `${pendingReimbursementMinor.toLocaleString()} minor`,
            note: t("payments.pendingReimbNote"),
          },
          {
            label: t("payments.paidReimbursements"),
            value: `${paidReimbursementMinor.toLocaleString()} minor`,
            note: t("payments.invoiceTotalNote"),
          },
          {
            label: t("payments.reconciliation.openCount"),
            value: String(openReconciliationCount),
            note: `${reconciliationIssues.length} ${t("payments.reconciliation.totalIssues")}`,
          },
          {
            label: t("payments.payable.summaryTitle"),
            value: String(drtsPayableLineCount),
            note: t("payments.payable.summaryNote"),
          },
          {
            label: t("payments.shadow.summaryTitle"),
            value: String(shadowLineCount),
            note: t("payments.shadow.summaryNote"),
          },
        ].map((card) => (
          <div key={card.label} className="admin-card">
            <p
              style={{
                margin: "0 0 8px",
                fontSize: 13,
                color: "#6b7280",
              }}
            >
              {card.label}
            </p>
            <strong style={{ display: "block", fontSize: 22 }}>
              {card.value}
            </strong>
            <small style={{ color: "#6b7280" }}>{card.note}</small>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div className="admin-card">
          <h3 style={{ marginTop: 0 }}>{t("payments.generateInvoiceTitle")}</h3>
          <form onSubmit={handleGenerateInvoice}>
            <div style={formGridStyle}>
              <label style={labelStyle}>
                {t("payments.form.tenantId")}
                <input
                  value={invoiceTenantId}
                  onChange={(event) => setInvoiceTenantId(event.target.value)}
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                {t("payments.form.periodStart")}
                <input
                  type="date"
                  value={invoicePeriodStart}
                  onChange={(event) =>
                    setInvoicePeriodStart(event.target.value)
                  }
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                {t("payments.form.periodEnd")}
                <input
                  type="date"
                  value={invoicePeriodEnd}
                  onChange={(event) => setInvoicePeriodEnd(event.target.value)}
                  style={inputStyle}
                />
              </label>
            </div>
            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={invoicePending}
            >
              {invoicePending
                ? t("payments.generating")
                : t("payments.generateInvoice")}
            </button>
          </form>
        </div>

        <div className="admin-card">
          <h3 style={{ marginTop: 0 }}>
            {t("payments.generateStatementsTitle")}
          </h3>
          <form onSubmit={handleGenerateStatements}>
            <div style={formGridStyle}>
              <label style={labelStyle}>
                {t("payments.form.periodMonth")}
                <input
                  value={statementPeriodMonth}
                  onChange={(event) =>
                    setStatementPeriodMonth(event.target.value)
                  }
                  placeholder="2026-03"
                  style={inputStyle}
                />
              </label>
            </div>
            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={statementPending}
            >
              {statementPending
                ? t("payments.generating")
                : t("payments.generateStatements")}
            </button>
          </form>
        </div>
      </div>

      <div
        className="admin-card"
        style={{ overflowX: "auto", marginBottom: 16 }}
      >
        <div style={{ marginBottom: 12 }}>
          <h3 style={{ margin: "0 0 4px" }}>
            {t("payments.reconciliation.title")}
          </h3>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>
            {t("payments.reconciliation.subtitle")}
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div
            className="admin-card"
            style={{ marginBottom: 0, background: "rgba(15,118,110,0.04)" }}
          >
            <p style={{ margin: "0 0 4px", fontSize: 13, color: "#6b7280" }}>
              {reconciliationWorkflowCopy.title}
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "#374151" }}>
              {reconciliationWorkflowCopy.subtitle}
            </p>
          </div>
          <div
            className="admin-card"
            style={{ marginBottom: 0, background: "rgba(59,130,246,0.04)" }}
          >
            <p style={{ margin: "0 0 4px", fontSize: 13, color: "#6b7280" }}>
              {reconciliationWorkflowCopy.filtered}
            </p>
            <strong style={{ display: "block", fontSize: 24 }}>
              {filteredReconciliationIssues.length}
            </strong>
            <small style={{ color: "#6b7280" }}>
              {openReconciliationCount} {t("payments.reconciliation.openCount")}
            </small>
          </div>
        </div>

        <div style={{ ...formGridStyle, marginBottom: 12 }}>
          <label style={labelStyle}>
            {t("payments.reconciliation.actorId")}
            <input
              value={financeActorId}
              onChange={(event) => setFinanceActorId(event.target.value)}
              style={inputStyle}
            />
          </label>
        </div>

        <form onSubmit={handleCreateReconciliationIssue}>
          <div style={formGridStyle}>
            <label style={labelStyle}>
              {t("payments.reconciliation.issueType")}
              <select
                value={newIssue.issueType}
                onChange={(event) =>
                  setNewIssue((current) => ({
                    ...current,
                    issueType: event.target
                      .value as ReconciliationIssueRecord["issueType"],
                    channelKey:
                      event.target.value === "forwarder_status_mismatch"
                        ? "forwarded_shadow"
                        : "partner_airport",
                  }))
                }
                style={inputStyle}
              >
                {RECONCILIATION_ISSUE_TYPE_OPTIONS.map((issueType) => (
                  <option key={issueType} value={issueType}>
                    {formatPlatformCodeLabel(locale, issueType)}
                  </option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              {t("payments.reconciliation.channel")}
              <select
                value={newIssue.channelKey}
                onChange={(event) =>
                  setNewIssue((current) => ({
                    ...current,
                    channelKey: event.target.value,
                  }))
                }
                style={inputStyle}
              >
                {RECONCILIATION_CHANNEL_OPTIONS.map((channelKey) => (
                  <option key={channelKey} value={channelKey}>
                    {describeMatrixChannel(channelKey)}
                  </option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              {t("payments.reconciliation.assignee")}
              <input
                value={newIssue.assigneeId}
                onChange={(event) =>
                  setNewIssue((current) => ({
                    ...current,
                    assigneeId: event.target.value,
                  }))
                }
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              {t("payments.reconciliation.orderId")}
              <input
                value={newIssue.orderId}
                onChange={(event) =>
                  setNewIssue((current) => ({
                    ...current,
                    orderId: event.target.value,
                  }))
                }
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              {t("payments.reconciliation.partnerId")}
              <input
                value={newIssue.partnerId}
                onChange={(event) =>
                  setNewIssue((current) => ({
                    ...current,
                    partnerId: event.target.value,
                  }))
                }
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              {t("payments.reconciliation.partnerProgramId")}
              <input
                value={newIssue.partnerProgramId}
                onChange={(event) =>
                  setNewIssue((current) => ({
                    ...current,
                    partnerProgramId: event.target.value,
                  }))
                }
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              {t("payments.reconciliation.sponsorReference")}
              <input
                value={newIssue.sponsorReference}
                onChange={(event) =>
                  setNewIssue((current) => ({
                    ...current,
                    sponsorReference: event.target.value,
                  }))
                }
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              {t("payments.reconciliation.mirrorOrderId")}
              <input
                value={newIssue.mirrorOrderId}
                onChange={(event) =>
                  setNewIssue((current) => ({
                    ...current,
                    mirrorOrderId: event.target.value,
                  }))
                }
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              {t("payments.reconciliation.externalOrderId")}
              <input
                value={newIssue.externalOrderId}
                onChange={(event) =>
                  setNewIssue((current) => ({
                    ...current,
                    externalOrderId: event.target.value,
                  }))
                }
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              {t("payments.reconciliation.linkedJobId")}
              <input
                value={newIssue.linkedReconciliationJobId}
                onChange={(event) =>
                  setNewIssue((current) => ({
                    ...current,
                    linkedReconciliationJobId: event.target.value,
                  }))
                }
                style={inputStyle}
              />
            </label>
            <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
              {t("payments.reconciliation.summary")}
              <textarea
                value={newIssue.summary}
                onChange={(event) =>
                  setNewIssue((current) => ({
                    ...current,
                    summary: event.target.value,
                  }))
                }
                style={textAreaStyle}
              />
            </label>
            <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
              {t("payments.reconciliation.comment")}
              <textarea
                value={newIssue.comment}
                onChange={(event) =>
                  setNewIssue((current) => ({
                    ...current,
                    comment: event.target.value,
                  }))
                }
                style={textAreaStyle}
              />
            </label>
            <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
              {t("payments.reconciliation.artifactIds")}
              <input
                value={newIssue.artifactIds}
                onChange={(event) =>
                  setNewIssue((current) => ({
                    ...current,
                    artifactIds: event.target.value,
                  }))
                }
                placeholder={t("payments.reconciliation.artifactPlaceholder")}
                style={inputStyle}
              />
            </label>
          </div>
          <button
            type="submit"
            className="admin-btn admin-btn--primary"
            disabled={issueDraftPending}
          >
            {issueDraftPending
              ? t("payments.reconciliation.opening")
              : t("payments.reconciliation.open")}
          </button>
        </form>

        <div
          style={{
            ...formGridStyle,
            marginTop: 16,
            marginBottom: 16,
            alignItems: "end",
          }}
        >
          <label style={labelStyle}>
            {reconciliationWorkflowCopy.status}
            <select
              value={issueStatusFilter}
              onChange={(event) =>
                setIssueStatusFilter(
                  event.target.value as
                    | "all"
                    | ReconciliationIssueRecord["status"],
                )
              }
              style={inputStyle}
            >
              <option value="all">
                {formatPlatformCodeLabel(locale, "all")}
              </option>
              {["open", "assigned", "reopened", "resolved"].map((status) => (
                <option key={status} value={status}>
                  {formatPlatformCodeLabel(locale, status)}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            {reconciliationWorkflowCopy.type}
            <select
              value={issueTypeFilter}
              onChange={(event) =>
                setIssueTypeFilter(
                  event.target.value as
                    | "all"
                    | ReconciliationIssueRecord["issueType"],
                )
              }
              style={inputStyle}
            >
              <option value="all">
                {formatPlatformCodeLabel(locale, "all")}
              </option>
              {RECONCILIATION_ISSUE_TYPE_OPTIONS.map((issueType) => (
                <option key={issueType} value={issueType}>
                  {formatPlatformCodeLabel(locale, issueType)}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            {reconciliationWorkflowCopy.channel}
            <select
              value={issueChannelFilter}
              onChange={(event) =>
                setIssueChannelFilter(
                  event.target.value as
                    | "all"
                    | (typeof RECONCILIATION_CHANNEL_OPTIONS)[number],
                )
              }
              style={inputStyle}
            >
              <option value="all">
                {formatPlatformCodeLabel(locale, "all")}
              </option>
              {RECONCILIATION_CHANNEL_OPTIONS.map((channelKey) => (
                <option key={channelKey} value={channelKey}>
                  {describeMatrixChannel(channelKey)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ marginTop: 16 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("payments.reconciliation.col.issue")}</th>
                <th>{t("payments.reconciliation.col.summary")}</th>
                <th>{t("payments.reconciliation.col.owner")}</th>
                <th>{t("payments.reconciliation.col.context")}</th>
                <th>{t("payments.reconciliation.col.notes")}</th>
                <th>{t("payments.reconciliation.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredReconciliationIssues.length > 0 ? (
                filteredReconciliationIssues.map((issue) => (
                  <tr key={issue.issueId}>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                      <div>{issue.issueId}</div>
                      <div style={{ color: "#6b7280" }}>
                        {formatPlatformCodeLabel(locale, issue.issueType)}
                      </div>
                      <div style={{ color: "#6b7280" }}>
                        {formatPlatformCodeLabel(locale, issue.source)}
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <span
                          className={`admin-badge ${
                            issue.status === "resolved"
                              ? "admin-badge--success"
                              : issue.status === "assigned"
                                ? "admin-badge--warning"
                                : "admin-badge--neutral"
                          }`}
                        >
                          {formatPlatformCodeLabel(locale, issue.status)}
                        </span>
                      </div>
                    </td>
                    <td style={{ minWidth: 260 }}>
                      <div>{issue.summary}</div>
                      <div style={{ color: "#6b7280", fontSize: 12 }}>
                        {describeMatrixChannel(issue.channelKey)}
                      </div>
                      <div style={{ color: "#6b7280", fontSize: 12 }}>
                        {formatDateTime(issue.updatedAt)}
                      </div>
                      {issue.forwardedFinanceContext && (
                        <div
                          style={{
                            marginTop: 6,
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 4,
                          }}
                        >
                          <span className="admin-badge admin-badge--neutral">
                            {formatPlatformCodeLabel(
                              locale,
                              issue.forwardedFinanceContext.platformCode,
                            )}
                          </span>
                          <span className="admin-badge admin-badge--neutral">
                            {t(
                              `payments.matrix.ledger.${issue.forwardedFinanceContext.localLedgerMode}`,
                            )}
                          </span>
                          <span className="admin-badge admin-badge--warning">
                            {t("payments.shadow.payoutAuthority")}:{" "}
                            {t(
                              `payments.shadow.authority.${issue.forwardedFinanceContext.driverPayoutAuthority}`,
                            )}
                          </span>
                        </div>
                      )}
                    </td>
                    <td style={{ minWidth: 180 }}>
                      <div>{issue.ownerId ?? "—"}</div>
                      <div style={{ color: "#6b7280", fontSize: 12 }}>
                        {t("payments.reconciliation.reopenCount", {
                          count: String(issue.reopenCount),
                        })}
                      </div>
                    </td>
                    <td style={{ fontSize: 12, minWidth: 220 }}>
                      <div>{issue.orderId ?? issue.mirrorOrderId ?? "—"}</div>
                      <div style={{ color: "#6b7280" }}>
                        {issue.externalOrderId ?? issue.partnerId ?? "—"}
                      </div>
                      <div style={{ color: "#6b7280" }}>
                        {issue.linkedReconciliationJobId ??
                          issue.sponsorReference ??
                          "—"}
                      </div>
                    </td>
                    <td style={{ fontSize: 12, minWidth: 220 }}>
                      <div>
                        {t("payments.reconciliation.commentCount", {
                          count: String(issue.comments.length),
                        })}
                      </div>
                      <div style={{ color: "#6b7280" }}>
                        {t("payments.reconciliation.evidenceCount", {
                          count: String(issue.evidenceArtifactIds.length),
                        })}
                      </div>
                      <div style={{ color: "#6b7280", marginTop: 6 }}>
                        {issue.comments.at(-1)?.message ?? "—"}
                      </div>
                    </td>
                    <td style={{ minWidth: 320 }}>
                      <div style={{ ...issueActionGridStyle, marginBottom: 8 }}>
                        <Link
                          href={`/payments/reconciliation/${encodeURIComponent(issue.issueId)}`}
                          className="admin-btn admin-btn--secondary"
                        >
                          {reconciliationWorkflowCopy.openDetail}
                        </Link>
                      </div>
                      <div style={issueActionGridStyle}>
                        {issue.status !== "resolved" && (
                          <>
                            <input
                              value={
                                issueAssignments[issue.issueId] ??
                                issue.ownerId ??
                                ""
                              }
                              onChange={(event) =>
                                setIssueAssignments((current) => ({
                                  ...current,
                                  [issue.issueId]: event.target.value,
                                }))
                              }
                              placeholder={t(
                                "payments.reconciliation.assignee",
                              )}
                              style={inputStyle}
                            />
                            <button
                              className="admin-btn admin-btn--secondary"
                              onClick={() => void handleAssignIssue(issue)}
                              disabled={issueActionId === issue.issueId}
                            >
                              {t("payments.reconciliation.assign")}
                            </button>
                            <input
                              value={issueComments[issue.issueId] ?? ""}
                              onChange={(event) =>
                                setIssueComments((current) => ({
                                  ...current,
                                  [issue.issueId]: event.target.value,
                                }))
                              }
                              placeholder={t("payments.reconciliation.comment")}
                              style={inputStyle}
                            />
                            <input
                              value={
                                issueCommentArtifactIds[issue.issueId] ?? ""
                              }
                              onChange={(event) =>
                                setIssueCommentArtifactIds((current) => ({
                                  ...current,
                                  [issue.issueId]: event.target.value,
                                }))
                              }
                              placeholder={`${t("payments.reconciliation.artifactIds")} · ${t("payments.reconciliation.comment")}`}
                              aria-label={`${t("payments.reconciliation.artifactIds")} (${t("payments.reconciliation.comment")})`}
                              style={inputStyle}
                            />
                            <button
                              className="admin-btn admin-btn--secondary"
                              onClick={() => void handleCommentIssue(issue)}
                              disabled={issueActionId === issue.issueId}
                            >
                              {t("payments.reconciliation.addComment")}
                            </button>
                            <select
                              value={issueResolutionCodes[issue.issueId] ?? ""}
                              onChange={(event) =>
                                setIssueResolutionCodes((current) => ({
                                  ...current,
                                  [issue.issueId]: event.target
                                    .value as ReconciliationIssueRecord["resolutionCode"],
                                }))
                              }
                              style={inputStyle}
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
                              value={
                                issueResolutionSummaries[issue.issueId] ?? ""
                              }
                              onChange={(event) =>
                                setIssueResolutionSummaries((current) => ({
                                  ...current,
                                  [issue.issueId]: event.target.value,
                                }))
                              }
                              placeholder={t(
                                "payments.reconciliation.resolveSummary",
                              )}
                              style={inputStyle}
                            />
                            <input
                              value={
                                issueResolutionArtifactIds[issue.issueId] ?? ""
                              }
                              onChange={(event) =>
                                setIssueResolutionArtifactIds((current) => ({
                                  ...current,
                                  [issue.issueId]: event.target.value,
                                }))
                              }
                              placeholder={`${t("payments.reconciliation.artifactIds")} · ${t("payments.reconciliation.resolve")}`}
                              aria-label={`${t("payments.reconciliation.artifactIds")} (${t("payments.reconciliation.resolve")})`}
                              style={inputStyle}
                            />
                            <button
                              className="admin-btn admin-btn--primary"
                              onClick={() => void handleResolveIssue(issue)}
                              disabled={issueActionId === issue.issueId}
                            >
                              {t("payments.reconciliation.resolve")}
                            </button>
                          </>
                        )}
                        {issue.status === "resolved" && (
                          <>
                            <input
                              value={issueReopenReasons[issue.issueId] ?? ""}
                              onChange={(event) =>
                                setIssueReopenReasons((current) => ({
                                  ...current,
                                  [issue.issueId]: event.target.value,
                                }))
                              }
                              placeholder={t(
                                "payments.reconciliation.reopenReason",
                              )}
                              style={inputStyle}
                            />
                            <input
                              value={
                                issueReopenArtifactIds[issue.issueId] ?? ""
                              }
                              onChange={(event) =>
                                setIssueReopenArtifactIds((current) => ({
                                  ...current,
                                  [issue.issueId]: event.target.value,
                                }))
                              }
                              placeholder={`${t("payments.reconciliation.artifactIds")} · ${t("payments.reconciliation.reopen")}`}
                              aria-label={`${t("payments.reconciliation.artifactIds")} (${t("payments.reconciliation.reopen")})`}
                              style={inputStyle}
                            />
                            <button
                              className="admin-btn admin-btn--secondary"
                              onClick={() => void handleReopenIssue(issue)}
                              disabled={issueActionId === issue.issueId}
                            >
                              {t("payments.reconciliation.reopen")}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>{t("payments.reconciliation.empty")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div
        className="admin-card"
        style={{
          overflowX: "auto",
          marginBottom: 16,
          borderColor: "rgba(245,158,11,0.35)",
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <h3 style={{ margin: "0 0 4px" }}>{t("payments.shadow.title")}</h3>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>
            {t("payments.shadow.subtitle")}
          </p>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t("payments.shadow.col.platform")}</th>
              <th>{t("payments.shadow.col.mirrorOrder")}</th>
              <th>{t("payments.shadow.col.reason")}</th>
              <th>{t("payments.shadow.col.authority")}</th>
              <th>{t("payments.shadow.col.ledger")}</th>
              <th>{t("payments.shadow.col.owner")}</th>
              <th>{t("payments.shadow.col.note")}</th>
            </tr>
          </thead>
          <tbody>
            {forwardedShadowIssues.length > 0 ? (
              forwardedShadowIssues.map((issue) => {
                const context = issue.forwardedFinanceContext;
                if (!context) {
                  return null;
                }
                const reasonKey = `payments.shadow.reconciliationReason.${context.reconciliationReason}`;
                const reasonLabel = t(reasonKey);
                return (
                  <tr key={issue.issueId}>
                    <td style={{ minWidth: 160 }}>
                      <div style={{ fontWeight: 600 }}>
                        {formatPlatformCodeLabel(locale, context.platformCode)}
                      </div>
                      <div style={{ color: "#6b7280", fontSize: 12 }}>
                        {context.platformCode}
                      </div>
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                      <div>{issue.mirrorOrderId ?? "—"}</div>
                      <div style={{ color: "#6b7280" }}>
                        {issue.externalOrderId ?? "—"}
                      </div>
                    </td>
                    <td style={{ minWidth: 220, fontSize: 13 }}>
                      <div>
                        {reasonLabel === reasonKey
                          ? context.reconciliationReason
                          : reasonLabel}
                      </div>
                      <div style={{ color: "#6b7280", fontSize: 12 }}>
                        {issue.linkedReconciliationJobId ?? "—"}
                      </div>
                    </td>
                    <td style={{ fontSize: 12, minWidth: 220 }}>
                      <div>
                        {t("payments.shadow.fareAuthority")}:{" "}
                        {t(
                          `payments.shadow.authority.${context.fareAuthority}`,
                        )}
                      </div>
                      <div>
                        {t("payments.shadow.settlementAuthority")}:{" "}
                        {t(
                          `payments.shadow.authority.${context.settlementAuthority}`,
                        )}
                      </div>
                      <div style={{ fontWeight: 600 }}>
                        {t("payments.shadow.payoutAuthority")}:{" "}
                        {t(
                          `payments.shadow.authority.${context.driverPayoutAuthority}`,
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="admin-badge admin-badge--neutral">
                        {t(`payments.matrix.ledger.${context.localLedgerMode}`)}
                      </span>
                    </td>
                    <td style={{ minWidth: 160 }}>
                      <div>{issue.ownerId ?? "—"}</div>
                      <div style={{ marginTop: 6 }}>
                        <span
                          className={`admin-badge ${
                            issue.status === "resolved"
                              ? "admin-badge--success"
                              : issue.status === "assigned"
                                ? "admin-badge--warning"
                                : "admin-badge--neutral"
                          }`}
                        >
                          {formatPlatformCodeLabel(locale, issue.status)}
                        </span>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, minWidth: 220 }}>
                      {context.note ?? issue.summary}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7}>{t("payments.shadow.empty")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div
        className="admin-card"
        style={{ overflowX: "auto", marginBottom: 16 }}
      >
        <div style={{ marginBottom: 12 }}>
          <h3 style={{ margin: "0 0 4px" }}>{t("payments.matrix.title")}</h3>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>
            {t("payments.matrix.subtitle")}
          </p>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t("payments.matrix.col.channel")}</th>
              <th>{t("payments.matrix.col.payer")}</th>
              <th>{t("payments.matrix.col.sponsor")}</th>
              <th>{t("payments.matrix.col.invoice")}</th>
              <th>{t("payments.matrix.col.receipt")}</th>
              <th>{t("payments.matrix.col.payout")}</th>
              <th>{t("payments.matrix.col.discount")}</th>
              <th>{t("payments.matrix.col.reconciliation")}</th>
              <th>{t("payments.matrix.col.ledger")}</th>
            </tr>
          </thead>
          <tbody>
            {settlementMatrix.length > 0 ? (
              sortSettlementMatrix(settlementMatrix).map((row) => (
                <tr key={row.channelKey}>
                  <td>
                    <div>{describeMatrixChannel(row.channelKey)}</div>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>
                      {row.orderDomain} · {row.orderSources.join(" / ")}
                    </div>
                  </td>
                  <td>{describeMatrixField("payer", row, row.payerType)}</td>
                  <td>
                    {describeMatrixField("sponsor", row, row.sponsorType)}
                  </td>
                  <td>
                    <div>
                      {describeMatrixField(
                        "invoiceOwner",
                        row,
                        row.invoiceOwner,
                      )}
                    </div>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>
                      {describeMatrixField("invoice", row, row.invoicePath)}
                    </div>
                  </td>
                  <td>
                    {describeMatrixField("receipt", row, row.receiptOwner)}
                  </td>
                  <td>
                    {describeMatrixField(
                      "payout",
                      row,
                      row.driverPayoutAuthority,
                    )}
                  </td>
                  <td>
                    <div>
                      {describeMatrixField(
                        "discount",
                        row,
                        row.discountFundingSource,
                      )}
                    </div>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>
                      {describeMatrixField(
                        "reimbursement",
                        row,
                        row.reimbursementRule,
                      )}
                    </div>
                  </td>
                  <td>
                    {describeMatrixField(
                      "reconciliation",
                      row,
                      row.reconciliationPath,
                    )}
                  </td>
                  <td>
                    <span
                      className={`admin-badge ${
                        row.localLedgerMode === "shadow_only"
                          ? "admin-badge--neutral"
                          : "admin-badge--success"
                      }`}
                    >
                      {describeLedgerMode(row.localLedgerMode)}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9}>{t("payments.matrix.empty")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="admin-toolbar">
        <div className="admin-toggle-group">
          {(["all", "paid", "issued", "draft"] as const).map((value) => (
            <button
              key={value}
              className={`admin-toggle-btn ${
                invoiceFilter === value ? "active" : ""
              }`}
              onClick={() => setInvoiceFilter(value)}
            >
              {formatPlatformCodeLabel(locale, value)}
            </button>
          ))}
        </div>
        <button
          className="admin-btn admin-btn--secondary"
          onClick={() => void loadFinance()}
        >
          {t("common.refresh")}
        </button>
      </div>

      <div
        className="admin-card"
        style={{ overflowX: "auto", marginBottom: 16 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <h3 style={{ margin: 0 }}>{t("payments.invoicesTitle")}</h3>
          <span style={{ color: "#6b7280", fontSize: 13 }}>
            {filteredInvoices.length}
          </span>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t("payments.col.invoice")}</th>
              <th>{t("payments.col.tenant")}</th>
              <th>{t("payments.col.channelMix")}</th>
              <th>{t("payments.col.amount")}</th>
              <th>{t("payments.col.status")}</th>
              <th>{getPlatformLabel(locale, "pricingSnapshot")}</th>
              <th>{t("payments.col.period")}</th>
              <th>{getPlatformLabel(locale, "artifact")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.length > 0 ? (
              filteredInvoices.map((invoice) => (
                <tr key={invoice.invoiceId}>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    <div>{invoice.invoiceId}</div>
                    <div style={{ color: "#6b7280" }}>
                      {formatDateTime(invoice.createdAt)}
                    </div>
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {invoice.tenantId}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    <div>{describeInvoiceChannelMix(invoice)}</div>
                    <div style={{ marginTop: 6, display: "flex", gap: 4 }}>
                      {hasOnlyShadowLines(invoice.lines) ? (
                        <span className="admin-badge admin-badge--neutral">
                          {t("payments.shadow.badge")}
                        </span>
                      ) : hasShadowLines(invoice.lines) ? (
                        <>
                          <span className="admin-badge admin-badge--success">
                            {t("payments.payable.badge")}
                          </span>
                          <span className="admin-badge admin-badge--neutral">
                            {t("payments.shadow.badge")}
                          </span>
                        </>
                      ) : (
                        <span className="admin-badge admin-badge--success">
                          {t("payments.payable.badge")}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>{formatMoney(invoice.amount)}</td>
                  <td>
                    <span
                      className={`admin-badge ${
                        invoice.status === "paid"
                          ? "admin-badge--success"
                          : invoice.status === "draft"
                            ? "admin-badge--neutral"
                            : "admin-badge--warning"
                      }`}
                    >
                      {formatPlatformCodeLabel(locale, invoice.status)}
                    </span>
                  </td>
                  <td>
                    <code>{invoice.pricingVersionSnapshot}</code>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {formatDateTime(invoice.periodStart)} —{" "}
                    {formatDateTime(invoice.periodEnd)}
                  </td>
                  <td>
                    {invoice.artifactUrl ? (
                      <a
                        href={invoice.artifactUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t("payments.downloadPdf")}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8}>{t("payments.noInvoices")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div
        className="admin-card"
        style={{ overflowX: "auto", marginBottom: 16 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <h3 style={{ margin: 0 }}>{t("payments.statementsTitle")}</h3>
          <span style={{ color: "#6b7280", fontSize: 13 }}>
            {statements.length}
          </span>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t("payments.col.statement")}</th>
              <th>{t("payments.col.driver")}</th>
              <th>{t("payments.col.channelMix")}</th>
              <th>{t("payments.col.period")}</th>
              <th>{getPlatformLabel(locale, "feePlan")}</th>
              <th>{getPlatformLabel(locale, "gross")}</th>
              <th>{getPlatformLabel(locale, "serviceFee")}</th>
              <th>{getPlatformLabel(locale, "subsidy")}</th>
              <th>{t("payments.col.net")}</th>
              <th>{getPlatformLabel(locale, "payout")}</th>
            </tr>
          </thead>
          <tbody>
            {statements.length > 0 ? (
              statements.map((statement) => (
                <tr key={statement.statementId}>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    <div>{statement.receiptNo}</div>
                    <div style={{ color: "#6b7280" }}>
                      {statement.statementId}
                    </div>
                  </td>
                  <td>{statement.driverId}</td>
                  <td style={{ fontSize: 12 }}>
                    <div>{describeStatementChannelMix(statement)}</div>
                    <div style={{ marginTop: 6, display: "flex", gap: 4 }}>
                      {hasOnlyShadowLines(statement.lines) ? (
                        <span className="admin-badge admin-badge--neutral">
                          {t("payments.shadow.badge")}
                        </span>
                      ) : hasShadowLines(statement.lines) ? (
                        <>
                          <span className="admin-badge admin-badge--success">
                            {t("payments.payable.badge")}
                          </span>
                          <span className="admin-badge admin-badge--neutral">
                            {t("payments.shadow.badge")}
                          </span>
                        </>
                      ) : (
                        <span className="admin-badge admin-badge--success">
                          {t("payments.payable.badge")}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>{statement.periodMonth}</td>
                  <td>
                    <code>{statement.feePlanVersion}</code>
                  </td>
                  <td>{formatMoney(statement.grossEarning)}</td>
                  <td>{formatMoney(statement.serviceFee)}</td>
                  <td>{formatMoney(statement.subsidy)}</td>
                  <td>{formatMoney(statement.netAmount)}</td>
                  <td>
                    <span
                      className={`admin-badge ${
                        statement.payoutStatus === "paid"
                          ? "admin-badge--success"
                          : "admin-badge--warning"
                      }`}
                    >
                      {formatPlatformCodeLabel(locale, statement.payoutStatus)}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={10}>{t("payments.noStatements")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="admin-card" style={{ overflowX: "auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <h3 style={{ margin: 0 }}>{t("payments.reimbursementsTitle")}</h3>
          <span style={{ color: "#6b7280", fontSize: 13 }}>
            {reimbursements.length}
          </span>
        </div>
        <p
          style={{
            margin: "0 0 12px",
            padding: "8px 12px",
            background: "rgba(245,158,11,0.08)",
            borderLeft: "3px solid rgba(245,158,11,0.6)",
            color: "#6b7280",
            fontSize: 12,
          }}
        >
          {t("payments.shadow.reimbursementGuardrail")}
        </p>
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t("payments.col.batch")}</th>
              <th>{t("payments.col.driver")}</th>
              <th>{getPlatformLabel(locale, "statement")}</th>
              <th>{getPlatformLabel(locale, "total")}</th>
              <th>{getPlatformLabel(locale, "workflow")}</th>
              <th>{getPlatformLabel(locale, "remittance")}</th>
              <th>{getPlatformLabel(locale, "items")}</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {reimbursements.length > 0 ? (
              reimbursements.map((batch) => (
                <tr key={batch.batchId}>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    <div>{batch.batchId}</div>
                    <div style={{ color: "#6b7280" }}>{batch.periodMonth}</div>
                  </td>
                  <td>{batch.driverId}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {batch.statementId}
                  </td>
                  <td>{formatMoney(batch.totalAmount)}</td>
                  <td>
                    <div>
                      {reimbursementWorkflow(
                        batch,
                        t("payments.awaitingApproval"),
                        formatPlatformCodeLabel(locale, "paid"),
                        t("payments.col.approved"),
                      )}
                    </div>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>
                      {batch.approvedAt
                        ? formatDateTime(batch.approvedAt)
                        : t("payments.awaitingApproval")}
                    </div>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>
                      {batch.paidAt
                        ? formatDateTime(batch.paidAt)
                        : t("payments.awaitingRemittance")}
                    </div>
                  </td>
                  <td>
                    <input
                      value={
                        remittanceProofs[batch.batchId] ??
                        batch.remittanceProofId ??
                        ""
                      }
                      onChange={(event) =>
                        setRemittanceProofs((current) => ({
                          ...current,
                          [batch.batchId]: event.target.value,
                        }))
                      }
                      placeholder={getPlatformLabel(
                        locale,
                        "remittanceProofExample",
                      )}
                      style={{ ...inputStyle, minWidth: 180 }}
                      disabled={batch.status === "paid"}
                    />
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {batch.items.map((item) => item.orderId).join(", ")}
                  </td>
                  <td>
                    <div
                      style={{
                        display: "grid",
                        gap: 8,
                        minWidth: 120,
                      }}
                    >
                      {!batch.approvedAt && (
                        <button
                          className="admin-btn admin-btn--secondary"
                          onClick={() => void handleApproveBatch(batch)}
                          disabled={batchActionId === batch.batchId}
                        >
                          {t("payments.approve")}
                        </button>
                      )}
                      {batch.status !== "paid" && (
                        <button
                          className="admin-btn admin-btn--primary"
                          onClick={() => void handleMarkPaid(batch)}
                          disabled={batchActionId === batch.batchId}
                        >
                          {batchActionId === batch.batchId
                            ? t("payments.saving")
                            : t("payments.markPaid")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8}>{t("payments.noReimbursements")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  marginBottom: 16,
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 13,
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.75rem 0.85rem",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  background: "#fff",
  fontSize: 14,
};

const textAreaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 88,
  resize: "vertical",
};

const issueActionGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
};
