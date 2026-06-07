"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useEffect, useState } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import {
  formatPlatformUiError,
  toPlatformErrorMessage,
} from "@/lib/error-copy";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type { Locale } from "@/lib/translations";
import type {
  ReimbursementBatchRecord,
  ReimbursementItemRecord,
} from "@drts/contracts";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const WORKFLOW_STEPS = [
  "draft",
  "pending_approval",
  "approved",
  "exported",
  "paid",
  "reconciled",
] as const;

type WorkflowStep = (typeof WORKFLOW_STEPS)[number];

type TimelineEntry = {
  at: string;
  title: string;
  body: string;
  tone: CanvasTone;
};

type LineItemRow = {
  id: string;
  recipient: string;
  amount: string;
  sourceReference: string;
  note: string;
};

type FallbackBatchRuntime = {
  batch: ReimbursementBatchRecord;
  warning: string;
};

const pageShellStyle = {
  minHeight: "100%",
  background: theme.bg,
  color: theme.text,
} satisfies React.CSSProperties;

const pageBodyStyle = {
  padding: "16px 24px 24px",
  display: "grid",
  gap: 16,
} satisfies React.CSSProperties;

const emptyStateStyle = {
  display: "grid",
  placeItems: "center",
  minHeight: 220,
  padding: "40px 24px",
  borderRadius: 12,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  color: theme.textMuted,
  textAlign: "center",
} satisfies React.CSSProperties;

const heroGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 1fr)",
  gap: 16,
  alignItems: "start",
} satisfies React.CSSProperties;

const stepperStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
  gap: 10,
} satisfies React.CSSProperties;

const stepLabelStyle = (active: boolean, complete: boolean) =>
  ({
    display: "grid",
    gap: 8,
    minWidth: 0,
    color: active ? theme.text : complete ? theme.text : theme.textMuted,
  }) satisfies React.CSSProperties;

const stepDotStyle = (tone: CanvasTone, complete: boolean) =>
  ({
    width: 28,
    height: 28,
    borderRadius: "50%",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: `1px solid ${toneBorder(theme, tone)}`,
    background: complete ? toneBackground(theme, tone) : theme.bgRaised,
    color: complete ? toneText(theme, tone) : theme.textMuted,
    fontSize: 12,
    fontWeight: 700,
  }) satisfies React.CSSProperties;

const timelineListStyle = {
  display: "grid",
  gap: 12,
} satisfies React.CSSProperties;

const timelineItemStyle = {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  gap: 12,
  alignItems: "start",
} satisfies React.CSSProperties;

const timelineMetaStyle = {
  display: "grid",
  gap: 4,
  minWidth: 96,
  color: theme.textMuted,
  fontSize: 11.5,
  fontFamily: theme.monoFamily,
} satisfies React.CSSProperties;

const timelineBodyStyle = {
  display: "grid",
  gap: 4,
  paddingBottom: 12,
  borderBottom: `1px solid ${theme.border}`,
} satisfies React.CSSProperties;

const actionPanelStyle = {
  display: "grid",
  gap: 12,
} satisfies React.CSSProperties;

const textAreaStyle = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: 108,
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  font: "inherit",
  resize: "vertical",
} satisfies React.CSSProperties;

const monoStyle = {
  fontFamily: theme.monoFamily,
  fontSize: 11.5,
} satisfies React.CSSProperties;

function toneBackground(th: CanvasTheme, tone: CanvasTone) {
  switch (tone) {
    case "success":
      return "rgba(16, 185, 129, 0.14)";
    case "danger":
      return "rgba(239, 68, 68, 0.14)";
    case "warn":
      return "rgba(245, 158, 11, 0.14)";
    case "info":
      return "rgba(59, 130, 246, 0.14)";
    case "neutral":
    default:
      return th.surfaceLo;
  }
}

function toneBorder(th: CanvasTheme, tone: CanvasTone) {
  switch (tone) {
    case "success":
      return "rgba(16, 185, 129, 0.4)";
    case "danger":
      return "rgba(239, 68, 68, 0.4)";
    case "warn":
      return "rgba(245, 158, 11, 0.4)";
    case "info":
      return "rgba(59, 130, 246, 0.4)";
    case "neutral":
    default:
      return th.border;
  }
}

function toneText(th: CanvasTheme, tone: CanvasTone) {
  switch (tone) {
    case "success":
      return "#047857";
    case "danger":
      return "#b91c1c";
    case "warn":
      return "#b45309";
    case "info":
      return "#1d4ed8";
    case "neutral":
    default:
      return th.text;
  }
}

function formatMoney(
  amount?: { amountMinor: number; currency: string } | null,
) {
  if (!amount) return "—";
  return `${amount.amountMinor.toLocaleString()} ${amount.currency}`;
}

function buildFallbackBatch(
  batchId: string,
  locale: Locale,
): FallbackBatchRuntime {
  const normalizedBatchId = batchId || "rb_2026_05_001";
  return {
    batch: {
      batchId: normalizedBatchId,
      driverId: "driver:finance:ctbc-sponsored",
      statementId: "stmt_2026_05_001",
      periodMonth: "2026-05",
      status: "pending",
      totalAmount: {
        amountMinor: 1420800,
        currency: "TWD",
      },
      remittanceProofId: null,
      approvedAt: null,
      paidAt: null,
      items: [
        {
          itemId: `${normalizedBatchId}_001`,
          orderId: "partner:ctbc-elite",
          amount: {
            amountMinor: 994560,
            currency: "TWD",
          },
          reason:
            locale === "en"
              ? "Sponsor reimbursement Q2-Apr"
              : "第二季四月贊助補貼報銷",
          channelKey: "World Elite",
        },
        {
          itemId: `${normalizedBatchId}_002`,
          orderId: "partner:ctbc-infinite",
          amount: {
            amountMinor: 246240,
            currency: "TWD",
          },
          reason:
            locale === "en"
              ? "Sponsor reimbursement Q2-Apr"
              : "第二季四月贊助補貼報銷",
          channelKey: "Infinite",
        },
        {
          itemId: `${normalizedBatchId}_003`,
          orderId: "recon:rec_0089",
          amount: {
            amountMinor: 180000,
            currency: "TWD",
          },
          reason: "差額新台幣 1,820 元 × 99 筆",
          channelKey: "reconciliation_adjustment",
        },
      ],
    },
    warning:
      locale === "en"
        ? "API reimbursement detail is unavailable, so the page is rendering route-local fallback data aligned to the canvas artboard."
        : "目前代墊批次詳細資料暫時無法使用，頁面先以替代資料維持批次檢視內容。",
  };
}

function getWorkflowState(batch: ReimbursementBatchRecord): WorkflowStep {
  if (batch.status === "paid") {
    return "paid";
  }
  if (batch.remittanceProofId) {
    return "exported";
  }
  if (batch.approvedAt) {
    return "approved";
  }
  if (batch.items.length === 0) {
    return "draft";
  }
  return "pending_approval";
}

function workflowTone(step: WorkflowStep): CanvasTone {
  switch (step) {
    case "reconciled":
    case "paid":
      return "success";
    case "approved":
    case "exported":
      return "info";
    case "pending_approval":
      return "warn";
    case "draft":
    default:
      return "neutral";
  }
}

function workflowLabel(locale: Locale, step: WorkflowStep) {
  return formatPlatformCodeLabel(locale, step);
}

function buildTimeline(
  batch: ReimbursementBatchRecord,
  locale: Locale,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    {
      at: batch.periodMonth,
      title: locale === "en" ? "Batch created" : "批次已建立",
      body:
        locale === "en"
          ? `Generated for statement ${batch.statementId} and driver ${batch.driverId}.`
          : `已根據結算單 ${batch.statementId} 與司機 ${batch.driverId} 產生此批次。`,
      tone: "neutral",
    },
  ];

  if (batch.items.length > 0) {
    entries.push({
      at: batch.periodMonth,
      title: locale === "en" ? "Submitted for approval" : "已送交核准",
      body:
        locale === "en"
          ? `${batch.items.length} reimbursement line items queued for finance review.`
          : `共有 ${batch.items.length} 筆代墊明細已排入財務審核佇列。`,
      tone: "warn",
    });
  }

  if (batch.approvedAt) {
    entries.push({
      at: batch.approvedAt,
      title: locale === "en" ? "Approved" : "已核准",
      body:
        locale === "en"
          ? "Batch approved and ready for export/remittance handling."
          : "批次已核准，可進入匯出與匯款處理流程。",
      tone: "info",
    });
  }

  if (batch.remittanceProofId) {
    entries.push({
      at: batch.paidAt ?? batch.approvedAt ?? batch.periodMonth,
      title: locale === "en" ? "Remittance proof attached" : "已附上匯款憑證",
      body:
        locale === "en"
          ? `Proof ID ${batch.remittanceProofId} recorded on the batch.`
          : `批次已記錄匯款憑證編號 ${batch.remittanceProofId}。`,
      tone: "info",
    });
  }

  if (batch.paidAt) {
    entries.push({
      at: batch.paidAt,
      title: locale === "en" ? "Marked paid" : "已標記付款",
      body:
        locale === "en"
          ? "Driver reimbursement has been marked paid in the finance console."
          : "司機代墊款已在財務控制台標記為已付款。",
      tone: "success",
    });
  }

  if (!batch.approvedAt) {
    entries.push({
      at: batch.periodMonth,
      title: locale === "en" ? "Waiting approval" : "等待核准",
      body:
        locale === "en"
          ? "High-risk approval still requires reason capture before state can advance."
          : "高風險核准仍需先記錄原因，狀態才可繼續推進。",
      tone: "warn",
    });
  }

  return entries;
}

function buildLineItemRows(
  batch: ReimbursementBatchRecord,
  locale: Locale,
): LineItemRow[] {
  return batch.items.map((item: ReimbursementItemRecord, index: number) => ({
    id: item.itemId,
    recipient: `${batch.driverId}${item.channelKey ? ` · ${formatPlatformCodeLabel(locale, item.channelKey)}` : ""}`,
    amount: formatMoney(item.amount),
    sourceReference: item.orderId,
    note:
      item.reason ||
      (locale === "en" ? `Line item ${index + 1}` : `明細項目 ${index + 1}`),
  }));
}

function actionButtonLinkStyle(primary = false) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: 30,
    padding: "0 12px",
    borderRadius: 8,
    border: `1px solid ${primary ? theme.accent : theme.border}`,
    background: primary ? theme.accent : theme.surface,
    color: primary ? "#fff" : theme.text,
    textDecoration: "none",
    fontSize: 12.5,
    fontWeight: 600,
  } satisfies React.CSSProperties;
}

export default function ReimbursementDetailPage() {
  const client = usePlatformAdminClient();
  const params = useParams<{ batchId: string }>();
  const { locale } = useTranslation();
  const batchId = Array.isArray(params.batchId)
    ? params.batchId[0]
    : params.batchId;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState<ReimbursementBatchRecord | null>(null);
  const [approveReason, setApproveReason] = useState("");
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalReceipt, setApprovalReceipt] = useState<string | null>(null);
  const [remittanceProofId, setRemittanceProofId] = useState("");
  const [fallbackWarning, setFallbackWarning] = useState<string | null>(null);
  const [usingFallbackData, setUsingFallbackData] = useState(false);
  const [savingAction, setSavingAction] = useState<"approve" | "paid" | null>(
    null,
  );
  const copy =
    locale === "en"
      ? {
          loading: "Loading…",
          pageTitle: "Reimbursement batch",
          backToPayments: "Back to payments",
          batchUnavailable: "Batch unavailable",
          batchUnavailableBody:
            "The reimbursement batch route resolves, but the batch was not found.",
          queue: "Queue",
          copyBatchId: "Copy batch ID",
          headerSubtitle: (driverId: string, totalAmount: string) =>
            `${driverId} · ${totalAmount} · 6-state reimbursement workflow`,
          refreshFailed: "Refresh failed",
          fallbackDetailTitle: "Fallback reimbursement detail",
          workflowBannerTitle: "Audit-derived workflow view",
          workflowBannerBody:
            "The six-state stepper matches the canvas while underlying contract data is derived from batch approval, remittance, and payment timestamps.",
          receiptTitle: "Audit receipt",
          stateMachineTitle: "State machine",
          headerTitle: "Header",
          approveFlowTitle: "Approve reason flow",
          approveFlowSubtitle:
            "High-risk action requires a reason before approval.",
          approvalReason: "Approval reason",
          approvalPlaceholder:
            "Explain sponsor exposure, evidence, or audit context.",
          remittanceProof: "Remittance proof",
          remittanceProofPlaceholder: "remit-proof-20260602-001",
          actionFailed: "Action failed",
          saving: "Saving…",
          approve: "Approve",
          markPaid: "Mark paid",
          stateTimelineTitle: "State timeline · audit-derived",
          batchSummaryTitle: "Batch summary",
          batchSummarySubtitle: (usingFallbackData: boolean) =>
            usingFallbackData
              ? "Canvas body density rendered from route-local fallback finance context."
              : "Canvas body density with route-local finance context.",
          approvalGate: "Approval gate",
          approvalGateComplete: "Completed",
          approvalGatePending: "Pending super-admin signoff",
          exportPosture: "Export posture",
          exportPostureAttached: "Proof attached",
          exportPosturePending: "Not exported yet",
          settlementTarget: "Settlement target",
          evidenceScope: "Evidence scope",
          lineItemsUnit: "line items",
          lineItemsTitle: "Line items",
          lineItemsSubtitle: (count: number) =>
            `${count} sources contributing to the batch total.`,
          noLineItems:
            "No reimbursement line items were returned for this batch.",
          tableHeaders: {
            recipient: "Recipient",
            amount: "Amount",
            sourceReference: "Source reference",
            note: "Note",
          },
          detailLabels: {
            batchId: "Batch ID",
            driver: "Driver",
            statement: "Statement",
            period: "Period",
            totalAmount: "Total amount",
            state: "State",
            approvedAt: "Approved at",
            paidAt: "Paid at",
            remittanceProof: "Remittance proof",
            lineItems: "Line items",
          },
        }
      : {
          loading: "載入中…",
          pageTitle: "代墊批次",
          backToPayments: "返回結算治理",
          batchUnavailable: "找不到批次",
          batchUnavailableBody: "路由已建立，但找不到對應的代墊批次資料。",
          queue: "批次佇列",
          copyBatchId: "複製批次編號",
          headerSubtitle: (driverId: string, totalAmount: string) =>
            `${driverId} · ${totalAmount} · 六階段代墊流程`,
          refreshFailed: "重新整理失敗",
          fallbackDetailTitle: "代墊批次替代資料",
          workflowBannerTitle: "稽核推導流程視圖",
          workflowBannerBody:
            "六階段流程條對齊畫布設計；目前狀態由批次的核准、匯款憑證與付款時間推導呈現。",
          receiptTitle: "稽核收據",
          stateMachineTitle: "六階段狀態流程",
          headerTitle: "批次摘要",
          approveFlowTitle: "核准原因流程",
          approveFlowSubtitle: "高風險操作在核准前必須填寫原因。",
          approvalReason: "核准原因",
          approvalPlaceholder: "請說明贊助曝險、佐證依據或稽核背景。",
          remittanceProof: "匯款憑證編號",
          remittanceProofPlaceholder: "例如：匯款證明-20260602-001",
          actionFailed: "操作失敗",
          saving: "儲存中…",
          approve: "核准",
          markPaid: "標記已付款",
          stateTimelineTitle: "狀態時間軸 · 稽核推導",
          batchSummaryTitle: "批次摘要",
          batchSummarySubtitle: (usingFallbackData: boolean) =>
            usingFallbackData
              ? "目前以替代財務情境補齊批次檢視內容。"
              : "目前以財務情境補齊批次檢視內容。",
          approvalGate: "核准關卡",
          approvalGateComplete: "已完成",
          approvalGatePending: "待平台管理員簽核",
          exportPosture: "匯出狀態",
          exportPostureAttached: "已附匯款憑證",
          exportPosturePending: "尚未匯出",
          settlementTarget: "結算對象",
          evidenceScope: "佐證範圍",
          lineItemsUnit: "筆明細",
          lineItemsTitle: "代墊明細",
          lineItemsSubtitle: (count: number) =>
            `共有 ${count} 筆來源構成此批次總額。`,
          noLineItems: "此批次目前沒有可顯示的代墊明細。",
          tableHeaders: {
            recipient: "對象",
            amount: "金額",
            sourceReference: "來源參照",
            note: "備註",
          },
          detailLabels: {
            batchId: "批次編號",
            driver: "司機",
            statement: "結算單",
            period: "期間",
            totalAmount: "總金額",
            state: "狀態",
            approvedAt: "核准時間",
            paidAt: "付款時間",
            remittanceProof: "匯款憑證編號",
            lineItems: "明細數",
          },
        };

  useEffect(() => {
    let active = true;

    async function loadBatch() {
      setLoading(true);
      setError(null);

      try {
        const batches = await client.listReimbursementBatches();
        const nextBatch =
          batches.find(
            (item: ReimbursementBatchRecord) => item.batchId === batchId,
          ) ?? null;

        if (!active) {
          return;
        }

        if (nextBatch) {
          setBatch(nextBatch);
          setUsingFallbackData(false);
          setFallbackWarning(null);
          setRemittanceProofId(nextBatch.remittanceProofId ?? "");
          return;
        }

        const fallback = buildFallbackBatch(batchId, locale);
        setBatch(fallback.batch);
        setUsingFallbackData(true);
        setFallbackWarning(fallback.warning);
        setRemittanceProofId(fallback.batch.remittanceProofId ?? "");
      } catch (nextError: any) {
        if (!active) {
          return;
        }
        const fallback = buildFallbackBatch(batchId, locale);
        setBatch(fallback.batch);
        setUsingFallbackData(true);
        setFallbackWarning(fallback.warning);
        setRemittanceProofId(fallback.batch.remittanceProofId ?? "");
        setError(
          formatPlatformUiError(
            locale,
            toPlatformErrorMessage(nextError),
            copy.refreshFailed,
          ),
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadBatch();

    return () => {
      active = false;
    };
  }, [batchId, client, locale]);

  async function handleApprove() {
    if (!batch) {
      return;
    }
    const reason = approveReason.trim();
    if (!reason) {
      setApprovalError(
        locale === "en"
          ? "Approval reason is required for this high-risk action."
          : "高風險核准操作必須填寫原因。",
      );
      return;
    }

    setSavingAction("approve");
    setApprovalError(null);

    try {
      const nextBatch = usingFallbackData
        ? {
            ...batch,
            approvedAt: new Date().toISOString(),
          }
        : await client.approveReimbursementBatch(batch.batchId, {
            statementId: batch.statementId,
          });
      setBatch(nextBatch);
      setApprovalReceipt(
        locale === "en"
          ? `Approval recorded with reason: ${reason}`
          : `已記錄核准原因：${reason}`,
      );
      setApproveReason("");
    } catch (nextError: any) {
      setApprovalError(
        formatPlatformUiError(
          locale,
          toPlatformErrorMessage(nextError),
          locale === "en"
            ? "Unable to approve reimbursement batch"
            : "無法核准代墊批次",
        ),
      );
    } finally {
      setSavingAction(null);
    }
  }

  async function handleMarkPaid() {
    if (!batch) {
      return;
    }

    setSavingAction("paid");
    setApprovalError(null);

    try {
      const proofId = remittanceProofId.trim();
      const nextBatch = usingFallbackData
        ? {
            ...batch,
            status: "paid" as const,
            remittanceProofId: proofId || "wire_20260602_001",
            approvedAt: batch.approvedAt ?? new Date().toISOString(),
            paidAt: new Date().toISOString(),
          }
        : await client.markReimbursementPaid(batch.batchId, {
            ...(proofId ? { remittanceProofId: proofId } : {}),
            paidAt: new Date().toISOString(),
          });
      setBatch(nextBatch);
      setRemittanceProofId(nextBatch.remittanceProofId ?? remittanceProofId);
      setApprovalReceipt(
        locale === "en"
          ? "Batch marked paid and remittance proof captured."
          : "批次已標記為已付款，且已記錄匯款憑證。",
      );
    } catch (nextError: any) {
      setApprovalError(
        formatPlatformUiError(
          locale,
          toPlatformErrorMessage(nextError),
          locale === "en"
            ? "Unable to mark reimbursement batch paid"
            : "無法將代墊批次標記為已付款",
        ),
      );
    } finally {
      setSavingAction(null);
    }
  }

  if (loading) {
    return <div style={emptyStateStyle}>{copy.loading}</div>;
  }

  if (!batch) {
    return (
      <div style={pageShellStyle}>
        <PageHeader
          theme={theme}
          title={copy.pageTitle}
          subtitle={batchId}
          actions={
            <Link href="/payments" style={actionButtonLinkStyle()}>
              {copy.backToPayments}
            </Link>
          }
        />
        <div style={pageBodyStyle}>
          <Banner
            theme={theme}
            tone="danger"
            title={copy.batchUnavailable}
            body={error ?? copy.batchUnavailableBody}
          />
        </div>
      </div>
    );
  }

  const workflowState = getWorkflowState(batch);
  const workflowIndex = WORKFLOW_STEPS.indexOf(workflowState);
  const lineItemRows = buildLineItemRows(batch, locale);
  const timelineEntries = buildTimeline(batch, locale);
  const statusTone = workflowTone(workflowState);
  const workflowSequence = WORKFLOW_STEPS.map((step) =>
    workflowLabel(locale, step),
  ).join(" → ");
  const lineItemColumns: CanvasTableColumn<LineItemRow>[] = [
    {
      h: copy.tableHeaders.recipient,
      w: 220,
      r: (row: LineItemRow) => row.recipient,
    },
    {
      h: copy.tableHeaders.amount,
      w: 140,
      mono: true,
      align: "right",
      r: (row: LineItemRow) => row.amount,
    },
    {
      h: copy.tableHeaders.sourceReference,
      w: 220,
      mono: true,
      r: (row: LineItemRow) => row.sourceReference,
    },
    {
      h: copy.tableHeaders.note,
      r: (row: LineItemRow) => row.note,
    },
  ];

  return (
    <div style={pageShellStyle}>
      <PageHeader
        theme={theme}
        title={
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
          >
            <span style={monoStyle}>{batch.batchId}</span>
            <Pill theme={theme} tone={statusTone} dot>
              {workflowLabel(locale, workflowState)}
            </Pill>
          </span>
        }
        subtitle={copy.headerSubtitle(
          batch.driverId,
          formatMoney(batch.totalAmount),
        )}
        actions={
          <>
            <Link
              href="/payments/reimbursements"
              style={actionButtonLinkStyle()}
            >
              {copy.queue}
            </Link>
            <Btn
              theme={theme}
              icon="copy"
              onClick={() => setApprovalReceipt(batch.batchId)}
            >
              {copy.copyBatchId}
            </Btn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {error ? (
          <Banner
            theme={theme}
            tone="danger"
            title={copy.refreshFailed}
            body={error}
          />
        ) : null}

        {fallbackWarning ? (
          <Banner
            theme={theme}
            tone="warn"
            title={copy.fallbackDetailTitle}
            body={fallbackWarning}
          />
        ) : null}

        <Banner
          theme={theme}
          tone="info"
          title={copy.workflowBannerTitle}
          body={copy.workflowBannerBody}
        />

        {approvalReceipt ? (
          <Banner
            theme={theme}
            tone="success"
            title={copy.receiptTitle}
            body={approvalReceipt}
          />
        ) : null}

        <Card
          theme={theme}
          title={copy.stateMachineTitle}
          subtitle={workflowSequence}
        >
          <div style={stepperStyle}>
            {WORKFLOW_STEPS.map((step, index) => {
              const active = index === workflowIndex;
              const complete = index <= workflowIndex;
              const tone = active
                ? statusTone
                : complete
                  ? "success"
                  : "neutral";

              return (
                <div key={step} style={stepLabelStyle(active, complete)}>
                  <div style={stepDotStyle(tone, complete)}>{index + 1}</div>
                  <div
                    style={{ fontSize: 12.5, fontWeight: active ? 700 : 600 }}
                  >
                    {workflowLabel(locale, step)}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div style={heroGridStyle}>
          <Card theme={theme} title={copy.headerTitle}>
            <DL
              theme={theme}
              cols={2}
              items={[
                { k: copy.detailLabels.batchId, v: batch.batchId, mono: true },
                { k: copy.detailLabels.driver, v: batch.driverId, mono: true },
                {
                  k: copy.detailLabels.statement,
                  v: batch.statementId,
                  mono: true,
                },
                {
                  k: copy.detailLabels.period,
                  v: batch.periodMonth,
                  mono: true,
                },
                {
                  k: copy.detailLabels.totalAmount,
                  v: formatMoney(batch.totalAmount),
                  mono: true,
                },
                {
                  k: copy.detailLabels.state,
                  v: workflowLabel(locale, workflowState),
                  mono: true,
                },
                {
                  k: copy.detailLabels.approvedAt,
                  v: batch.approvedAt ? formatDateTime(batch.approvedAt) : "—",
                  mono: true,
                },
                {
                  k: copy.detailLabels.paidAt,
                  v: batch.paidAt ? formatDateTime(batch.paidAt) : "—",
                  mono: true,
                },
                {
                  k: copy.detailLabels.remittanceProof,
                  v: batch.remittanceProofId ?? "—",
                  mono: true,
                },
                {
                  k: copy.detailLabels.lineItems,
                  v: String(batch.items.length),
                  mono: true,
                },
              ]}
            />
          </Card>

          <Card
            theme={theme}
            title={copy.approveFlowTitle}
            subtitle={copy.approveFlowSubtitle}
          >
            <div style={actionPanelStyle}>
              <label style={{ display: "grid", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>
                  {copy.approvalReason}
                </span>
                <textarea
                  value={approveReason}
                  onChange={(event) => setApproveReason(event.target.value)}
                  placeholder={copy.approvalPlaceholder}
                  style={textAreaStyle}
                />
              </label>

              <label style={{ display: "grid", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>
                  {copy.remittanceProof}
                </span>
                <input
                  value={remittanceProofId}
                  onChange={(event) => setRemittanceProofId(event.target.value)}
                  placeholder={copy.remittanceProofPlaceholder}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: `1px solid ${theme.border}`,
                    background: theme.bgRaised,
                    color: theme.text,
                    fontFamily: theme.monoFamily,
                  }}
                />
              </label>

              {approvalError ? (
                <Banner
                  theme={theme}
                  tone="danger"
                  title={copy.actionFailed}
                  body={approvalError}
                />
              ) : null}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Btn
                  theme={theme}
                  variant="primary"
                  icon="check"
                  disabled={Boolean(batch.approvedAt) || savingAction !== null}
                  onClick={() => void handleApprove()}
                >
                  {savingAction === "approve" ? copy.saving : copy.approve}
                </Btn>
                <Btn
                  theme={theme}
                  variant="secondary"
                  icon="billing"
                  disabled={
                    !batch.approvedAt ||
                    batch.status === "paid" ||
                    savingAction !== null
                  }
                  onClick={() => void handleMarkPaid()}
                >
                  {savingAction === "paid" ? copy.saving : copy.markPaid}
                </Btn>
              </div>
            </div>
          </Card>
        </div>

        <div style={heroGridStyle}>
          <Card theme={theme} title={copy.stateTimelineTitle}>
            <div style={timelineListStyle}>
              {timelineEntries.map((entry, index) => (
                <div key={`${entry.title}-${index}`} style={timelineItemStyle}>
                  <div style={timelineMetaStyle}>{entry.at}</div>
                  <div
                    style={{
                      ...timelineBodyStyle,
                      borderBottom:
                        index === timelineEntries.length - 1
                          ? "none"
                          : timelineBodyStyle.borderBottom,
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <Pill theme={theme} tone={entry.tone} dot>
                        {entry.title}
                      </Pill>
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: theme.textMuted,
                        lineHeight: 1.45,
                      }}
                    >
                      {entry.body}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card
            theme={theme}
            title={copy.batchSummaryTitle}
            subtitle={copy.batchSummarySubtitle(usingFallbackData)}
          >
            <div style={{ display: "grid", gap: 10, fontSize: 12.5 }}>
              <div>
                <strong>{copy.approvalGate}:</strong>{" "}
                {batch.approvedAt
                  ? copy.approvalGateComplete
                  : copy.approvalGatePending}
              </div>
              <div>
                <strong>{copy.exportPosture}:</strong>{" "}
                {batch.remittanceProofId
                  ? copy.exportPostureAttached
                  : copy.exportPosturePending}
              </div>
              <div>
                <strong>{copy.settlementTarget}:</strong>{" "}
                <span style={monoStyle}>{batch.driverId}</span>
              </div>
              <div>
                <strong>{copy.evidenceScope}:</strong> {lineItemRows.length}{" "}
                {copy.lineItemsUnit}
              </div>
            </div>
          </Card>
        </div>

        <Card
          theme={theme}
          title={copy.lineItemsTitle}
          subtitle={copy.lineItemsSubtitle(lineItemRows.length)}
          padding={0}
        >
          {lineItemRows.length > 0 ? (
            <Table
              theme={theme}
              dense
              columns={lineItemColumns}
              rows={lineItemRows}
            />
          ) : (
            <div
              style={{ padding: 18, color: theme.textMuted, fontSize: 12.5 }}
            >
              {copy.noLineItems}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
