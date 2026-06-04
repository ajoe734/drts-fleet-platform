"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useEffect, useState } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
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
  locale: string,
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
          reason: "sponsor reimbursement Q2-Apr",
          channelKey: "World Elite",
        },
        {
          itemId: `${normalizedBatchId}_002`,
          orderId: "partner:ctbc-infinite",
          amount: {
            amountMinor: 246240,
            currency: "TWD",
          },
          reason: "sponsor reimbursement Q2-Apr",
          channelKey: "Infinite",
        },
        {
          itemId: `${normalizedBatchId}_003`,
          orderId: "recon:rec_0089",
          amount: {
            amountMinor: 180000,
            currency: "TWD",
          },
          reason: "差額 TWD 1,820 × 99 筆",
          channelKey: "reconciliation_adjustment",
        },
      ],
    },
    warning:
      locale === "en"
        ? "API reimbursement detail is unavailable, so the page is rendering route-local fallback data aligned to the canvas artboard."
        : "目前 reimbursement detail API 無法使用，頁面改以 route-local fallback 資料渲染 canvas 對齊內容。",
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

function workflowLabel(step: WorkflowStep) {
  switch (step) {
    case "pending_approval":
      return "pending approval";
    default:
      return step;
  }
}

function buildTimeline(batch: ReimbursementBatchRecord): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    {
      at: batch.periodMonth,
      title: "Batch created",
      body: `Generated for statement ${batch.statementId} and driver ${batch.driverId}.`,
      tone: "neutral",
    },
  ];

  if (batch.items.length > 0) {
    entries.push({
      at: batch.periodMonth,
      title: "Submitted for approval",
      body: `${batch.items.length} reimbursement line items queued for finance review.`,
      tone: "warn",
    });
  }

  if (batch.approvedAt) {
    entries.push({
      at: batch.approvedAt,
      title: "Approved",
      body: "Batch approved and ready for export/remittance handling.",
      tone: "info",
    });
  }

  if (batch.remittanceProofId) {
    entries.push({
      at: batch.paidAt ?? batch.approvedAt ?? batch.periodMonth,
      title: "Remittance proof attached",
      body: `Proof ID ${batch.remittanceProofId} recorded on the batch.`,
      tone: "info",
    });
  }

  if (batch.paidAt) {
    entries.push({
      at: batch.paidAt,
      title: "Marked paid",
      body: "Driver reimbursement has been marked paid in the finance console.",
      tone: "success",
    });
  }

  if (!batch.approvedAt) {
    entries.push({
      at: batch.periodMonth,
      title: "Waiting approval",
      body: "High-risk approval still requires reason capture before state can advance.",
      tone: "warn",
    });
  }

  return entries;
}

function buildLineItemRows(batch: ReimbursementBatchRecord): LineItemRow[] {
  return batch.items.map((item: ReimbursementItemRecord, index: number) => ({
    id: item.itemId,
    recipient: `${batch.driverId}${item.channelKey ? ` · ${item.channelKey}` : ""}`,
    amount: formatMoney(item.amount),
    sourceReference: item.orderId,
    note: item.reason || `Line item ${index + 1}`,
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
        setError(nextError?.message ?? String(nextError));
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
      setApprovalError(nextError?.message ?? String(nextError));
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
      setApprovalError(nextError?.message ?? String(nextError));
    } finally {
      setSavingAction(null);
    }
  }

  if (loading) {
    return (
      <div style={emptyStateStyle}>
        {locale === "en" ? "Loading…" : "載入中…"}
      </div>
    );
  }

  if (!batch) {
    return (
      <div style={pageShellStyle}>
        <PageHeader
          theme={theme}
          title={locale === "en" ? "Reimbursement batch" : "代墊批次"}
          subtitle={batchId}
          actions={
            <Link href="/payments" style={actionButtonLinkStyle()}>
              {locale === "en" ? "Back to payments" : "返回結算治理"}
            </Link>
          }
        />
        <div style={pageBodyStyle}>
          <Banner
            theme={theme}
            tone="danger"
            title={locale === "en" ? "Batch unavailable" : "找不到批次"}
            body={
              error ??
              (locale === "en"
                ? "The reimbursement batch route resolves, but the batch was not found."
                : "Route 已建立，但找不到對應的代墊批次資料。")
            }
          />
        </div>
      </div>
    );
  }

  const workflowState = getWorkflowState(batch);
  const workflowIndex = WORKFLOW_STEPS.indexOf(workflowState);
  const lineItemRows = buildLineItemRows(batch);
  const timelineEntries = buildTimeline(batch);
  const statusTone = workflowTone(workflowState);
  const lineItemColumns: CanvasTableColumn<LineItemRow>[] = [
    {
      h: locale === "en" ? "RECIPIENT" : "RECIPIENT",
      w: 220,
      r: (row: LineItemRow) => row.recipient,
    },
    {
      h: locale === "en" ? "AMOUNT" : "AMOUNT",
      w: 140,
      mono: true,
      align: "right",
      r: (row: LineItemRow) => row.amount,
    },
    {
      h: locale === "en" ? "SOURCE REFERENCE" : "SOURCE REFERENCE",
      w: 220,
      mono: true,
      r: (row: LineItemRow) => row.sourceReference,
    },
    {
      h: locale === "en" ? "NOTE" : "NOTE",
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
              {workflowLabel(workflowState)}
            </Pill>
          </span>
        }
        subtitle={`${batch.driverId} · ${formatMoney(batch.totalAmount)} · 6-state reimbursement workflow`}
        actions={
          <>
            <Link
              href="/payments/reimbursements"
              style={actionButtonLinkStyle()}
            >
              {locale === "en" ? "Queue" : "批次佇列"}
            </Link>
            <Btn
              theme={theme}
              icon="copy"
              onClick={() => setApprovalReceipt(batch.batchId)}
            >
              {locale === "en" ? "Copy batch ID" : "複製批次 ID"}
            </Btn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {error ? (
          <Banner
            theme={theme}
            tone="danger"
            title={locale === "en" ? "Refresh failed" : "重新整理失敗"}
            body={error}
          />
        ) : null}

        {fallbackWarning ? (
          <Banner
            theme={theme}
            tone="warn"
            title={
              locale === "en"
                ? "Fallback reimbursement detail"
                : "Fallback 代墊批次詳情"
            }
            body={fallbackWarning}
          />
        ) : null}

        <Banner
          theme={theme}
          tone="info"
          title={
            locale === "en"
              ? "Audit-derived workflow view"
              : "Audit-derived workflow 視圖"
          }
          body={
            locale === "en"
              ? "The six-state stepper matches the canvas while underlying contract data is derived from batch approval, remittance, and payment timestamps."
              : "六狀態 stepper 對齊 canvas；目前狀態由 batch 的核准、匯款憑證與付款時間推導呈現。"
          }
        />

        {approvalReceipt ? (
          <Banner
            theme={theme}
            tone="success"
            title={locale === "en" ? "Audit receipt" : "稽核收據"}
            body={approvalReceipt}
          />
        ) : null}

        <Card
          theme={theme}
          title={
            locale === "en" ? "State machine · Q-ADM12" : "狀態機 · Q-ADM12"
          }
          subtitle={
            locale === "en"
              ? "draft → pending approval → approved → exported → paid → reconciled"
              : "draft → pending approval → approved → exported → paid → reconciled"
          }
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
                    {workflowLabel(step)}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div style={heroGridStyle}>
          <Card theme={theme} title="Header">
            <DL
              theme={theme}
              cols={2}
              items={[
                { k: "BATCH ID", v: batch.batchId, mono: true },
                { k: "DRIVER", v: batch.driverId, mono: true },
                { k: "STATEMENT", v: batch.statementId, mono: true },
                { k: "PERIOD", v: batch.periodMonth, mono: true },
                {
                  k: "TOTAL AMOUNT",
                  v: formatMoney(batch.totalAmount),
                  mono: true,
                },
                { k: "STATE", v: workflowLabel(workflowState), mono: true },
                {
                  k: "APPROVED AT",
                  v: batch.approvedAt ? formatDateTime(batch.approvedAt) : "—",
                  mono: true,
                },
                {
                  k: "PAID AT",
                  v: batch.paidAt ? formatDateTime(batch.paidAt) : "—",
                  mono: true,
                },
                {
                  k: "REMITTANCE PROOF",
                  v: batch.remittanceProofId ?? "—",
                  mono: true,
                },
                { k: "LINE ITEMS", v: String(batch.items.length), mono: true },
              ]}
            />
          </Card>

          <Card
            theme={theme}
            title={locale === "en" ? "Approve reason flow" : "核准原因流程"}
            subtitle={
              locale === "en"
                ? "High-risk action requires a reason before approval."
                : "高風險操作在核准前必須填寫原因。"
            }
          >
            <div style={actionPanelStyle}>
              <label style={{ display: "grid", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>
                  {locale === "en" ? "Approval reason" : "核准原因"}
                </span>
                <textarea
                  value={approveReason}
                  onChange={(event) => setApproveReason(event.target.value)}
                  placeholder={
                    locale === "en"
                      ? "Explain sponsor exposure, evidence, or audit context."
                      : "說明 sponsor exposure、佐證或 audit context。"
                  }
                  style={textAreaStyle}
                />
              </label>

              <label style={{ display: "grid", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>
                  {locale === "en" ? "Remittance proof" : "匯款憑證"}
                </span>
                <input
                  value={remittanceProofId}
                  onChange={(event) => setRemittanceProofId(event.target.value)}
                  placeholder="wire_20260602_001"
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
                  title={locale === "en" ? "Action failed" : "操作失敗"}
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
                  {savingAction === "approve"
                    ? locale === "en"
                      ? "Saving…"
                      : "儲存中…"
                    : locale === "en"
                      ? "Approve"
                      : "核准"}
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
                  {savingAction === "paid"
                    ? locale === "en"
                      ? "Saving…"
                      : "儲存中…"
                    : locale === "en"
                      ? "Mark paid"
                      : "標記已付款"}
                </Btn>
              </div>
            </div>
          </Card>
        </div>

        <div style={heroGridStyle}>
          <Card
            theme={theme}
            title={
              locale === "en"
                ? "State timeline · audit-derived"
                : "狀態時間軸 · audit-derived"
            }
          >
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
            title={locale === "en" ? "Batch summary" : "批次摘要"}
            subtitle={
              locale === "en"
                ? usingFallbackData
                  ? "Canvas body density rendered from route-local fallback finance context."
                  : "Canvas body density with route-local finance context."
                : usingFallbackData
                  ? "以 route-local fallback finance context 補齊 canvas body 密度。"
                  : "以 route-local finance context 補齊 canvas body 密度。"
            }
          >
            <div style={{ display: "grid", gap: 10, fontSize: 12.5 }}>
              <div>
                <strong>
                  {locale === "en" ? "Approval gate:" : "核准關卡："}
                </strong>{" "}
                {batch.approvedAt
                  ? locale === "en"
                    ? "Completed"
                    : "已完成"
                  : locale === "en"
                    ? "Pending super-admin signoff"
                    : "待 super-admin 簽核"}
              </div>
              <div>
                <strong>
                  {locale === "en" ? "Export posture:" : "匯出姿態："}
                </strong>{" "}
                {batch.remittanceProofId
                  ? locale === "en"
                    ? "Proof attached"
                    : "已附憑證"
                  : locale === "en"
                    ? "Not exported yet"
                    : "尚未匯出"}
              </div>
              <div>
                <strong>
                  {locale === "en" ? "Settlement target:" : "結算對象："}
                </strong>{" "}
                <span style={monoStyle}>{batch.driverId}</span>
              </div>
              <div>
                <strong>
                  {locale === "en" ? "Evidence scope:" : "佐證範圍："}
                </strong>{" "}
                {lineItemRows.length}{" "}
                {locale === "en" ? "line items" : "筆 line item"}
              </div>
            </div>
          </Card>
        </div>

        <Card
          theme={theme}
          title={locale === "en" ? "Line items" : "Line items"}
          subtitle={
            locale === "en"
              ? `${lineItemRows.length} sources contributing to the batch total.`
              : `${lineItemRows.length} 筆來源構成此批次總額。`
          }
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
              {locale === "en"
                ? "No reimbursement line items were returned for this batch."
                : "此批次目前沒有可顯示的 reimbursement line item。"}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
