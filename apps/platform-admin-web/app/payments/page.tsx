/**
 * Finance Console
 * Platform-admin surface for invoice, statement, and reimbursement flows.
 */

"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  actionButtonStyle,
  emptyStateStyle,
  inputStyle,
} from "@/components/platform-ui";
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
  CalloutBanner,
  DataCellStack,
  DataFilterBar,
  DataTable,
  DataViewCard,
  DetailMetadataGrid,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Td,
  Tr,
  WorkflowPanel,
  WorkflowSplitLayout,
} from "@drts/ui-web";

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

function issueStatusTone(status: ReconciliationIssueRecord["status"]) {
  switch (status) {
    case "resolved":
      return "success" as const;
    case "reopened":
      return "danger" as const;
    case "assigned":
      return "info" as const;
    case "open":
    default:
      return "warning" as const;
  }
}

function reimbursementTone(status: ReimbursementBatchRecord["status"]) {
  switch (status) {
    case "paid":
      return "success" as const;
    case "pending":
      return "info" as const;
    default:
      return "warning" as const;
  }
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
  const filteredReconciliationIssues = useMemo(
    () =>
      reconciliationIssues.filter((issue) => {
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
      }),
    [
      issueChannelFilter,
      issueStatusFilter,
      issueTypeFilter,
      reconciliationIssues,
    ],
  );

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
  const reopenedCount = reconciliationIssues.filter(
    (issue) => issue.status === "reopened",
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
  const publishedInvoices = invoices.filter(
    (invoice) => invoice.status === "paid",
  );
  const issuedInvoices = invoices.filter(
    (invoice) => invoice.status === "issued",
  );
  const settlementRows = sortSettlementMatrix(settlementMatrix);
  const pendingReimbursements = reimbursements.filter(
    (batch) => batch.status !== "paid",
  );

  const copy =
    locale === "en"
      ? {
          eyebrow: "Settlement governance",
          title: "Payments",
          subtitle:
            "tenant invoices · driver statements · reimbursements · settlement matrix · reconciliation issues",
          export: "Export queue",
          openIssue: "Open issue",
          authorityTitle:
            "Platform finance keeps the operator queue, not the accounting truth.",
          authorityDescription:
            "Use this surface to stage invoices, statements, reimbursement evidence, and reconciliation routing while canonical pricing, payout, and forwarder state remain contract-owned.",
          authorityFooter:
            "Forwarded shadow orders need explicit reconciliation before remittance can be treated as complete.",
          workflowTitle: "Reconciliation workflow",
          workflowDescription:
            "Open, assign, and close exceptions from one queue, then drill into the detail surface for the full evidence trail.",
          workflowFooter:
            "The queue stays biased toward unresolved issues so reopened items stay visible.",
          releaseTitle: "Release controls",
          releaseDescription:
            "Generate invoices and statements without leaving the finance governance route.",
          releaseFooter:
            "Generation actions refresh the same dataset used by the tables below.",
          reimbursementTitle: "Reimbursement batches",
          reimbursementDescription:
            "Approval and remittance proof stay coupled to the driver statement record.",
          reimbursementFooter: (count: number) =>
            `${count} reimbursement batch row(s) currently need operator attention.`,
          matrixTitle: "Settlement matrix",
          matrixDescription:
            "Each channel keeps payer, invoice, payout, and reconciliation ownership visible in one grid.",
          matrixFooter:
            "Matrix rows are ordered by tenant, partner, phone, then forwarded shadow channels.",
          invoiceTitle: "Tenant invoices",
          invoiceDescription: (count: number) =>
            `${count} invoice row(s) visible for the current status filter.`,
          invoiceFooter:
            "Channel mix stays visible so tenant, partner, and forwarded lines can be audited without opening each record.",
          statementTitle: "Driver statements",
          statementDescription: (count: number) =>
            `${count} driver statement snapshot(s) are loaded for this period set.`,
          statementFooter:
            "Shadow-only statements should be rare and usually imply forwarded payout follow-up.",
          createIssueTitle: "Open reconciliation issue",
          createIssueDescription:
            "Seed the detail workflow with the actor, finance context, and the first evidence note.",
          createIssueFooter:
            "Issue creation stays lightweight; assignment notes and resolution codes live in the detail route.",
          filtered: "Filtered queue",
          backlog: "Open backlog",
          none: "None",
        }
      : {
          eyebrow: "結算治理",
          title: "Payments",
          subtitle:
            "tenant invoices · driver statements · reimbursements · settlement matrix · reconciliation issues",
          export: "匯出佇列",
          openIssue: "開立 issue",
          authorityTitle: "平台財務在這裡治理待辦，但不改寫會計真值。",
          authorityDescription:
            "此頁負責開立 invoice、statement、報銷證據與對帳路由；pricing、payout 與 forwarder 狀態仍由既有 authority 持有。",
          authorityFooter:
            "轉送 shadow 訂單必須先完成 reconciliation，remittance 才能視為正式結案。",
          workflowTitle: "對帳處理流程",
          workflowDescription:
            "在同一個 queue 內開立、指派與追蹤例外，再進 detail 頁補齊完整證據鏈。",
          workflowFooter: "列表預設偏向未解決 issue，reopened 項目不會被埋掉。",
          releaseTitle: "產出控制",
          releaseDescription:
            "直接在 finance 治理路徑內產 invoice 與 driver statements。",
          releaseFooter: "所有產出動作都會回刷同一份治理資料集。",
          reimbursementTitle: "報銷批次",
          reimbursementDescription:
            "核准與 remittance proof 與司機 statement 綁定檢視。",
          reimbursementFooter: (count: number) =>
            `目前有 ${count} 筆報銷批次仍需要治理人處理。`,
          matrixTitle: "Settlement matrix",
          matrixDescription:
            "各通路的 payer、invoice、payout 與 reconciliation ownership 在同一張矩陣內對齊。",
          matrixFooter:
            "矩陣依 tenant、partner、電話派遣、forwarded shadow 的順序排列。",
          invoiceTitle: "租戶 invoices",
          invoiceDescription: (count: number) =>
            `依目前狀態篩選顯示 ${count} 筆 invoice。`,
          invoiceFooter:
            "保留 channel mix，讓租戶、合作夥伴與 forwarded lines 不用逐筆點開就能先做稽核。",
          statementTitle: "司機 statements",
          statementDescription: (count: number) =>
            `已載入 ${count} 筆司機 statement snapshot。`,
          statementFooter:
            "如果 statement 幾乎只含 shadow lines，通常代表 forwarded payout 還有後續處理。",
          createIssueTitle: "開立 reconciliation issue",
          createIssueDescription:
            "先建立 actor、財務關聯與第一筆 evidence note，再交給 detail workflow 深入處理。",
          createIssueFooter:
            "建立 issue 維持輕量；指派備註與 resolution code 留在 detail route 處理。",
          filtered: "目前顯示",
          backlog: "未結 backlog",
          none: "無",
        };

  const invoiceFilters = [
    {
      value: "all",
      label: locale === "en" ? "All" : "全部",
      count: invoices.length,
    },
    {
      value: "draft",
      label: locale === "en" ? "Draft" : "草稿",
      count: invoices.filter((invoice) => invoice.status === "draft").length,
      tone: "warning" as const,
    },
    {
      value: "issued",
      label: locale === "en" ? "Issued" : "已開立",
      count: issuedInvoices.length,
      tone: "info" as const,
    },
    {
      value: "paid",
      label: locale === "en" ? "Paid" : "已付款",
      count: publishedInvoices.length,
      tone: "success" as const,
    },
  ] as const;

  const issueStatusFilters = [
    {
      value: "all",
      label: locale === "en" ? "All" : "全部",
      count: reconciliationIssues.length,
    },
    {
      value: "open",
      label: locale === "en" ? "Open" : "Open",
      count: reconciliationIssues.filter((issue) => issue.status === "open")
        .length,
      tone: "warning" as const,
    },
    {
      value: "assigned",
      label: locale === "en" ? "Assigned" : "Assigned",
      count: reconciliationIssues.filter((issue) => issue.status === "assigned")
        .length,
      tone: "info" as const,
    },
    {
      value: "reopened",
      label: locale === "en" ? "Reopened" : "Reopened",
      count: reopenedCount,
      tone: "danger" as const,
    },
    {
      value: "resolved",
      label: locale === "en" ? "Resolved" : "Resolved",
      count: reconciliationIssues.filter((issue) => issue.status === "resolved")
        .length,
      tone: "success" as const,
    },
  ] as const;

  const issueTypeFilters = [
    { value: "all", label: locale === "en" ? "All types" : "全部類型" },
    ...RECONCILIATION_ISSUE_TYPE_OPTIONS.map((issueType) => ({
      value: issueType,
      label: formatPlatformCodeLabel(locale, issueType),
      count: reconciliationIssues.filter(
        (issue) => issue.issueType === issueType,
      ).length,
    })),
  ] as const;

  const issueChannelFilters = [
    { value: "all", label: locale === "en" ? "All channels" : "全部渠道" },
    ...RECONCILIATION_CHANNEL_OPTIONS.map((channelKey) => ({
      value: channelKey,
      label: describeMatrixChannel(channelKey),
      count: reconciliationIssues.filter(
        (issue) => issue.channelKey === channelKey,
      ).length,
    })),
  ] as const;

  if (loading) {
    return <div style={emptyStateStyle}>{t("payments.loading")}</div>;
  }

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <PageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        subtitle={copy.subtitle}
        meta={[
          {
            label: t("payments.reconciliation.openCount"),
            value: String(openReconciliationCount),
            tone: openReconciliationCount > 0 ? "warning" : "success",
          },
          {
            label: t("payments.shadow.summaryTitle"),
            value: String(forwardedShadowIssues.length),
            tone: forwardedShadowIssues.length > 0 ? "info" : "neutral",
          },
          {
            label: t("payments.pendingReimbursements"),
            value: pendingReimbursements.length.toString(),
            tone: pendingReimbursements.length > 0 ? "warning" : "success",
          },
        ]}
        actions={
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <button
              type="button"
              style={actionButtonStyle()}
              onClick={() => void loadFinance()}
            >
              {copy.export}
            </button>
            <button
              type="button"
              style={actionButtonStyle({ tone: "primary" })}
              onClick={() =>
                document
                  .getElementById("payments-create-issue")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              {copy.openIssue}
            </button>
          </div>
        }
      />

      {error ? (
        <CalloutBanner
          tone="danger"
          title={`${getPlatformLabel(locale, "error")}: ${error}`}
          description={copy.workflowFooter}
        />
      ) : null}

      <CalloutBanner
        tone="platform"
        eyebrow={copy.eyebrow}
        title={copy.authorityTitle}
        description={copy.authorityDescription}
        meta={
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <StatusChip
              tone={openReconciliationCount > 0 ? "warning" : "success"}
              label={`${copy.backlog} · ${openReconciliationCount}`}
            />
            <StatusChip
              tone={forwardedShadowIssues.length > 0 ? "platform" : "neutral"}
              label={`shadow · ${forwardedShadowIssues.length}`}
            />
            <StatusChip
              tone={pendingReimbursements.length > 0 ? "warning" : "success"}
              label={`remittance · ${pendingReimbursements.length}`}
            />
          </div>
        }
        footer={copy.authorityFooter}
      />

      <KpiRow minWidth="170px">
        <KpiCard
          label={t("payments.invoiceTotal")}
          value={`${totalInvoiceAmountMinor.toLocaleString()} minor`}
          detail={`${filteredInvoices.length} invoice row(s)`}
          tone="info"
        />
        <KpiCard
          label={t("payments.statementNet")}
          value={`${totalStatementNetMinor.toLocaleString()} minor`}
          detail={`${statements.length} statement snapshot(s)`}
          tone="platform"
        />
        <KpiCard
          label={t("payments.pendingReimbursements")}
          value={`${pendingReimbursementMinor.toLocaleString()} minor`}
          detail={t("payments.pendingReimbNote")}
          tone="warning"
        />
        <KpiCard
          label={t("payments.paidReimbursements")}
          value={`${paidReimbursementMinor.toLocaleString()} minor`}
          detail={t("payments.invoiceTotalNote")}
          tone="success"
        />
        <KpiCard
          label={t("payments.payable.summaryTitle")}
          value={String(drtsPayableLineCount)}
          detail={t("payments.payable.summaryNote")}
          tone="neutral"
        />
        <KpiCard
          label={t("payments.shadow.summaryTitle")}
          value={String(shadowLineCount)}
          detail={t("payments.shadow.summaryNote")}
          tone={shadowLineCount > 0 ? "info" : "neutral"}
        />
      </KpiRow>

      <WorkflowSplitLayout
        ariaLabel={copy.title}
        main={
          <>
            <DataViewCard
              title={copy.workflowTitle}
              subtitle={copy.workflowDescription}
              tone="warning"
              summary={`${copy.filtered}: ${filteredReconciliationIssues.length}`}
              footer={copy.workflowFooter}
              filters={
                <div style={{ display: "grid", gap: "10px" }}>
                  <DataFilterBar
                    value={issueStatusFilter}
                    onChange={(value) => setIssueStatusFilter(value)}
                    filters={issueStatusFilters}
                    ariaLabel={copy.workflowTitle}
                  />
                  <DataFilterBar
                    value={issueTypeFilter}
                    onChange={(value) => setIssueTypeFilter(value)}
                    filters={issueTypeFilters}
                    ariaLabel={
                      locale === "en" ? "Issue type filter" : "問題類型篩選"
                    }
                  />
                  <DataFilterBar
                    value={issueChannelFilter}
                    onChange={(value) => setIssueChannelFilter(value)}
                    filters={issueChannelFilters}
                    ariaLabel={
                      locale === "en" ? "Issue channel filter" : "渠道篩選"
                    }
                  />
                </div>
              }
            >
              <DetailMetadataGrid
                minColumnWidth="180px"
                items={[
                  {
                    id: "finance-actor",
                    label: t("payments.reconciliation.actorId"),
                    value: financeActorId,
                  },
                  {
                    id: "filtered",
                    label: copy.filtered,
                    value: String(filteredReconciliationIssues.length),
                    tone: "warning",
                  },
                  {
                    id: "open",
                    label: copy.backlog,
                    value: String(openReconciliationCount),
                    tone: openReconciliationCount > 0 ? "warning" : "success",
                  },
                  {
                    id: "reopened",
                    label: locale === "en" ? "Reopened" : "Reopened",
                    value: String(reopenedCount),
                    tone: reopenedCount > 0 ? "danger" : "neutral",
                  },
                ]}
              />
              <DataTable
                tone="warning"
                minWidth={1120}
                empty={
                  locale === "en"
                    ? "No reconciliation issues."
                    : "目前沒有 reconciliation issue。"
                }
                columns={[
                  { label: "Issue", width: "16%" },
                  { label: "Summary", width: "24%" },
                  { label: "Owner", width: "14%" },
                  { label: "Context", width: "20%" },
                  { label: "Status", width: "12%" },
                  { label: "Action", width: "14%" },
                ]}
              >
                {filteredReconciliationIssues.map((issue) => (
                  <Tr
                    key={issue.issueId}
                    highlighted={
                      issue.status !== "resolved" || issue.reopenCount > 0
                    }
                  >
                    <Td mono>
                      <DataCellStack
                        primary={<strong>{issue.issueId}</strong>}
                        secondary={formatPlatformCodeLabel(
                          locale,
                          issue.issueType,
                        )}
                        tertiary={formatDateTime(issue.updatedAt)}
                      />
                    </Td>
                    <Td>
                      <DataCellStack
                        primary={issue.summary}
                        secondary={
                          issue.channelKey
                            ? describeMatrixChannel(issue.channelKey)
                            : copy.none
                        }
                        tertiary={
                          issue.forwardedFinanceContext
                            ? `shadow · ${formatPlatformCodeLabel(
                                locale,
                                issue.forwardedFinanceContext.platformCode,
                              )}`
                            : undefined
                        }
                      />
                    </Td>
                    <Td>
                      <DataCellStack
                        primary={issue.ownerId ?? copy.none}
                        secondary={issue.openedBy}
                        tertiary={
                          issue.resolutionCode
                            ? formatPlatformCodeLabel(
                                locale,
                                issue.resolutionCode,
                              )
                            : undefined
                        }
                      />
                    </Td>
                    <Td>
                      <DataCellStack
                        primary={
                          issue.externalOrderId ?? issue.orderId ?? copy.none
                        }
                        secondary={
                          issue.partnerId ?? issue.tenantId ?? copy.none
                        }
                        tertiary={
                          issue.linkedReconciliationJobId ??
                          issue.mirrorOrderId ??
                          undefined
                        }
                      />
                    </Td>
                    <Td>
                      <div style={{ display: "grid", gap: "8px" }}>
                        <StatusChip
                          tone={issueStatusTone(issue.status)}
                          label={formatPlatformCodeLabel(locale, issue.status)}
                        />
                        <span style={{ fontSize: "12px", color: "#64748b" }}>
                          {t("payments.reconciliation.evidenceCount", {
                            count: issue.evidenceArtifactIds.length,
                          })}
                        </span>
                      </div>
                    </Td>
                    <Td align="right">
                      <Link
                        href={`/payments/reconciliation/${encodeURIComponent(issue.issueId)}`}
                        style={actionButtonStyle({ size: "sm" })}
                      >
                        {locale === "en" ? "Open detail" : "查看詳情"}
                      </Link>
                    </Td>
                  </Tr>
                ))}
              </DataTable>
            </DataViewCard>

            <DataViewCard
              title={copy.matrixTitle}
              subtitle={copy.matrixDescription}
              tone="info"
              summary={`${settlementRows.length} matrix row(s)`}
              footer={copy.matrixFooter}
            >
              <DataTable
                tone="info"
                minWidth={980}
                empty={
                  locale === "en"
                    ? "No settlement matrix rows."
                    : "目前沒有 settlement matrix。"
                }
                columns={[
                  { label: t("payments.matrix.col.channel"), width: "16%" },
                  { label: t("payments.matrix.col.payer"), width: "16%" },
                  { label: t("payments.matrix.col.invoice"), width: "17%" },
                  { label: t("payments.matrix.col.payout"), width: "17%" },
                  {
                    label: t("payments.matrix.col.reconciliation"),
                    width: "17%",
                  },
                  { label: t("payments.matrix.col.ledger"), width: "17%" },
                ]}
              >
                {settlementRows.map((row) => (
                  <Tr
                    key={row.channelKey}
                    highlighted={row.channelKey === "forwarded_shadow"}
                  >
                    <Td>
                      <DataCellStack
                        primary={
                          <strong>
                            {describeMatrixChannel(row.channelKey)}
                          </strong>
                        }
                        secondary={row.channelKey}
                      />
                    </Td>
                    <Td>{describeMatrixField("payer", row, row.payerType)}</Td>
                    <Td>
                      {describeMatrixField("invoice", row, row.invoicePath)}
                    </Td>
                    <Td>
                      {describeMatrixField(
                        "payout",
                        row,
                        row.driverPayoutAuthority,
                      )}
                    </Td>
                    <Td>
                      {describeMatrixField(
                        "reconciliation",
                        row,
                        row.reconciliationPath,
                      )}
                    </Td>
                    <Td>
                      <DataCellStack
                        primary={formatPlatformCodeLabel(
                          locale,
                          row.localLedgerMode,
                        )}
                        secondary={formatPlatformCodeLabel(
                          locale,
                          row.driverPayoutAuthority,
                        )}
                      />
                    </Td>
                  </Tr>
                ))}
              </DataTable>
            </DataViewCard>

            <div
              style={{
                display: "grid",
                gap: "16px",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              }}
            >
              <DataViewCard
                title={copy.invoiceTitle}
                subtitle={copy.invoiceDescription(filteredInvoices.length)}
                tone="neutral"
                footer={copy.invoiceFooter}
                filters={
                  <DataFilterBar
                    value={invoiceFilter}
                    onChange={(value) => setInvoiceFilter(value)}
                    filters={invoiceFilters}
                    ariaLabel={copy.invoiceTitle}
                  />
                }
              >
                <div style={{ display: "grid", gap: "10px" }}>
                  {filteredInvoices.slice(0, 4).map((invoice) => (
                    <div
                      key={invoice.invoiceId}
                      style={{
                        padding: "12px 14px",
                        borderRadius: "16px",
                        border: "1px solid rgba(148,163,184,0.22)",
                        background: "#f8fafc",
                      }}
                    >
                      <DataCellStack
                        primary={<strong>{invoice.invoiceId}</strong>}
                        secondary={formatMoney(invoice.amount)}
                        tertiary={describeInvoiceChannelMix(invoice)}
                      />
                    </div>
                  ))}
                  {filteredInvoices.length === 0 ? (
                    <div style={emptyStateStyle}>
                      {locale === "en"
                        ? "No invoices in this filter."
                        : "目前篩選沒有 invoice。"}
                    </div>
                  ) : null}
                </div>
              </DataViewCard>

              <DataViewCard
                title={copy.statementTitle}
                subtitle={copy.statementDescription(statements.length)}
                tone="platform"
                footer={copy.statementFooter}
              >
                <div style={{ display: "grid", gap: "10px" }}>
                  {statements.slice(0, 4).map((statement) => (
                    <div
                      key={statement.statementId}
                      style={{
                        padding: "12px 14px",
                        borderRadius: "16px",
                        border: "1px solid rgba(30,64,175,0.18)",
                        background: "rgba(239,246,255,0.72)",
                      }}
                    >
                      <DataCellStack
                        primary={<strong>{statement.statementId}</strong>}
                        secondary={formatMoney(statement.netAmount)}
                        tertiary={describeStatementChannelMix(statement)}
                      />
                      <div style={{ marginTop: "8px" }}>
                        <StatusChip
                          tone={
                            hasOnlyShadowLines(statement.lines)
                              ? "warning"
                              : hasShadowLines(statement.lines)
                                ? "platform"
                                : "success"
                          }
                          label={
                            hasOnlyShadowLines(statement.lines)
                              ? locale === "en"
                                ? "shadow only"
                                : "shadow only"
                              : hasShadowLines(statement.lines)
                                ? locale === "en"
                                  ? "mixed channels"
                                  : "mixed channels"
                                : locale === "en"
                                  ? "drts payable"
                                  : "drts payable"
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </DataViewCard>
            </div>
          </>
        }
        side={
          <>
            <WorkflowPanel
              title={copy.releaseTitle}
              description={copy.releaseDescription}
              footer={copy.releaseFooter}
            >
              <div style={{ display: "grid", gap: "16px" }}>
                <form onSubmit={handleGenerateInvoice} style={panelFormStyle}>
                  <strong>{t("payments.generateInvoiceTitle")}</strong>
                  <Field
                    label={t("payments.form.tenantId")}
                    value={invoiceTenantId}
                    onChange={setInvoiceTenantId}
                  />
                  <div style={fieldGridStyle}>
                    <Field
                      label={t("payments.form.periodStart")}
                      value={invoicePeriodStart}
                      onChange={setInvoicePeriodStart}
                      type="date"
                    />
                    <Field
                      label={t("payments.form.periodEnd")}
                      value={invoicePeriodEnd}
                      onChange={setInvoicePeriodEnd}
                      type="date"
                    />
                  </div>
                  <button
                    type="submit"
                    style={actionButtonStyle({ tone: "primary" })}
                    disabled={invoicePending}
                  >
                    {invoicePending
                      ? t("payments.generating")
                      : t("payments.generateInvoice")}
                  </button>
                </form>

                <form
                  onSubmit={handleGenerateStatements}
                  style={panelFormStyle}
                >
                  <strong>{t("payments.generateStatementsTitle")}</strong>
                  <Field
                    label={t("payments.form.periodMonth")}
                    value={statementPeriodMonth}
                    onChange={setStatementPeriodMonth}
                    placeholder="2026-03"
                  />
                  <button
                    type="submit"
                    style={actionButtonStyle({ tone: "primary" })}
                    disabled={statementPending}
                  >
                    {statementPending
                      ? t("payments.generating")
                      : t("payments.generateStatements")}
                  </button>
                </form>
              </div>
            </WorkflowPanel>

            <DataViewCard
              title={copy.reimbursementTitle}
              subtitle={copy.reimbursementDescription}
              tone="platform"
              footer={copy.reimbursementFooter(pendingReimbursements.length)}
            >
              <div style={{ display: "grid", gap: "12px" }}>
                {reimbursements.map((batch) => (
                  <div
                    key={batch.batchId}
                    style={{
                      display: "grid",
                      gap: "10px",
                      padding: "14px",
                      borderRadius: "16px",
                      border: "1px solid rgba(148,163,184,0.22)",
                      background: "#f8fafc",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: "10px",
                      }}
                    >
                      <DataCellStack
                        primary={<strong>{batch.batchId}</strong>}
                        secondary={formatMoney(batch.totalAmount)}
                        tertiary={batch.statementId}
                      />
                      <StatusChip
                        tone={reimbursementTone(batch.status)}
                        label={formatPlatformCodeLabel(locale, batch.status)}
                      />
                    </div>

                    <DetailMetadataGrid
                      columns={2}
                      minColumnWidth="140px"
                      items={[
                        {
                          id: `${batch.batchId}-workflow`,
                          label: locale === "en" ? "Workflow" : "流程",
                          value: reimbursementWorkflow(
                            batch,
                            locale === "en" ? "Awaiting approval" : "待核准",
                            locale === "en" ? "Paid" : "已付款",
                            locale === "en" ? "Approved" : "已核准",
                          ),
                        },
                        {
                          id: `${batch.batchId}-updated`,
                          label: getPlatformLabel(locale, "updated"),
                          value: formatDateTime(
                            batch.paidAt ??
                              batch.approvedAt ??
                              `${batch.periodMonth}-01T00:00:00.000Z`,
                          ),
                        },
                      ]}
                    />

                    <Field
                      label={
                        locale === "en"
                          ? "Remittance proof ID"
                          : "Remittance proof ID"
                      }
                      value={remittanceProofs[batch.batchId] ?? ""}
                      onChange={(value) =>
                        setRemittanceProofs((current) => ({
                          ...current,
                          [batch.batchId]: value,
                        }))
                      }
                      placeholder={`remit-${batch.batchId.slice(-8)}`}
                    />

                    <div
                      style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}
                    >
                      {batch.status === "pending" ? (
                        <button
                          type="button"
                          style={actionButtonStyle()}
                          onClick={() => void handleApproveBatch(batch)}
                          disabled={batchActionId === batch.batchId}
                        >
                          {locale === "en" ? "Approve batch" : "核准批次"}
                        </button>
                      ) : null}
                      {batch.status !== "paid" ? (
                        <button
                          type="button"
                          style={actionButtonStyle({ tone: "primary" })}
                          onClick={() => void handleMarkPaid(batch)}
                          disabled={batchActionId === batch.batchId}
                        >
                          {locale === "en" ? "Mark paid" : "標記已付款"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </DataViewCard>

            <WorkflowPanel
              title={copy.createIssueTitle}
              description={copy.createIssueDescription}
              footer={copy.createIssueFooter}
            >
              <form
                id="payments-create-issue"
                onSubmit={handleCreateReconciliationIssue}
                style={panelFormStyle}
              >
                <Field
                  label={t("payments.reconciliation.actorId")}
                  value={financeActorId}
                  onChange={setFinanceActorId}
                />
                <div style={fieldGridStyle}>
                  <SelectField
                    label={t("payments.reconciliation.issueType")}
                    value={newIssue.issueType}
                    options={RECONCILIATION_ISSUE_TYPE_OPTIONS.map(
                      (issueType) => ({
                        value: issueType,
                        label: formatPlatformCodeLabel(locale, issueType),
                      }),
                    )}
                    onChange={(value) =>
                      setNewIssue((current) => ({
                        ...current,
                        issueType:
                          value as ReconciliationIssueRecord["issueType"],
                        channelKey:
                          value === "forwarder_status_mismatch"
                            ? "forwarded_shadow"
                            : "partner_airport",
                      }))
                    }
                  />
                  <SelectField
                    label={t("payments.reconciliation.channel")}
                    value={newIssue.channelKey}
                    options={RECONCILIATION_CHANNEL_OPTIONS.map(
                      (channelKey) => ({
                        value: channelKey,
                        label: describeMatrixChannel(channelKey),
                      }),
                    )}
                    onChange={(value) =>
                      setNewIssue((current) => ({
                        ...current,
                        channelKey: value,
                      }))
                    }
                  />
                </div>
                <Field
                  label={t("payments.reconciliation.assignee")}
                  value={newIssue.assigneeId}
                  onChange={(value) =>
                    setNewIssue((current) => ({
                      ...current,
                      assigneeId: value,
                    }))
                  }
                  placeholder="finance.lead"
                />
                <Field
                  label={t("payments.reconciliation.summary")}
                  value={newIssue.summary}
                  onChange={(value) =>
                    setNewIssue((current) => ({
                      ...current,
                      summary: value,
                    }))
                  }
                />
                <div style={fieldGridStyle}>
                  <Field
                    label={t("payments.reconciliation.orderId")}
                    value={newIssue.orderId}
                    onChange={(value) =>
                      setNewIssue((current) => ({
                        ...current,
                        orderId: value,
                      }))
                    }
                  />
                  <Field
                    label={locale === "en" ? "Tenant ID" : "租戶 ID"}
                    value={newIssue.tenantId}
                    onChange={(value) =>
                      setNewIssue((current) => ({
                        ...current,
                        tenantId: value,
                      }))
                    }
                  />
                  <Field
                    label={t("payments.reconciliation.partnerId")}
                    value={newIssue.partnerId}
                    onChange={(value) =>
                      setNewIssue((current) => ({
                        ...current,
                        partnerId: value,
                      }))
                    }
                  />
                  <Field
                    label={t("payments.reconciliation.partnerProgramId")}
                    value={newIssue.partnerProgramId}
                    onChange={(value) =>
                      setNewIssue((current) => ({
                        ...current,
                        partnerProgramId: value,
                      }))
                    }
                  />
                  <Field
                    label={t("payments.reconciliation.sponsorReference")}
                    value={newIssue.sponsorReference}
                    onChange={(value) =>
                      setNewIssue((current) => ({
                        ...current,
                        sponsorReference: value,
                      }))
                    }
                  />
                  <Field
                    label={t("payments.reconciliation.externalOrderId")}
                    value={newIssue.externalOrderId}
                    onChange={(value) =>
                      setNewIssue((current) => ({
                        ...current,
                        externalOrderId: value,
                      }))
                    }
                  />
                  <Field
                    label={t("payments.reconciliation.mirrorOrderId")}
                    value={newIssue.mirrorOrderId}
                    onChange={(value) =>
                      setNewIssue((current) => ({
                        ...current,
                        mirrorOrderId: value,
                      }))
                    }
                  />
                  <Field
                    label={t("payments.reconciliation.linkedJobId")}
                    value={newIssue.linkedReconciliationJobId}
                    onChange={(value) =>
                      setNewIssue((current) => ({
                        ...current,
                        linkedReconciliationJobId: value,
                      }))
                    }
                  />
                </div>
                <TextAreaField
                  label={t("payments.reconciliation.comment")}
                  value={newIssue.comment}
                  onChange={(value) =>
                    setNewIssue((current) => ({
                      ...current,
                      comment: value,
                    }))
                  }
                />
                <Field
                  label={t("payments.reconciliation.artifactIds")}
                  value={newIssue.artifactIds}
                  onChange={(value) =>
                    setNewIssue((current) => ({
                      ...current,
                      artifactIds: value,
                    }))
                  }
                  placeholder={t("payments.reconciliation.artifactPlaceholder")}
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {RECONCILIATION_RESOLUTION_OPTIONS.slice(0, 3).map((code) => (
                    <StatusChip
                      key={code}
                      tone="neutral"
                      label={formatPlatformCodeLabel(locale, code)}
                    />
                  ))}
                </div>
                <button
                  type="submit"
                  style={actionButtonStyle({ tone: "primary" })}
                  disabled={issueDraftPending}
                >
                  {issueDraftPending
                    ? t("payments.reconciliation.opening")
                    : t("payments.reconciliation.open")}
                </button>
              </form>
            </WorkflowPanel>
          </>
        }
      />
    </div>
  );

  function describeInvoiceChannelMix(invoice: TenantInvoiceRecord) {
    return summarizeChannelMix(
      invoice.lines.map((line) => line.channelKey),
      describeMatrixChannel,
    );
  }

  function describeStatementChannelMix(statement: DriverStatementRecord) {
    return summarizeChannelMix(
      statement.lines.map((line) => line.channelKey),
      describeMatrixChannel,
    );
  }
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "date";
  placeholder?: string;
}) {
  return (
    <label style={fieldLabelStyle}>
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label style={fieldLabelStyle}>
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={fieldLabelStyle}>
      <span>{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={textAreaStyle}
      />
    </label>
  );
}

const fieldGridStyle: React.CSSProperties = {
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
};

const panelFormStyle: React.CSSProperties = {
  display: "grid",
  gap: "12px",
};

const fieldLabelStyle: React.CSSProperties = {
  display: "grid",
  gap: "6px",
  fontSize: "12px",
  fontWeight: 700,
  color: "#475569",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const textAreaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: "92px",
  resize: "vertical",
};
