"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useEffect, useState } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { createIdempotencyKey } from "@drts/api-client";
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

type TranslateFn = (
  key: string,
  params?: Record<string, string | number>,
) => string;

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

function workflowLabel(step: WorkflowStep, t: TranslateFn) {
  switch (step) {
    case "pending_approval":
      return t("payments.reimbursements.status.pendingApproval");
    case "approved":
      return t("payments.reimbursements.status.approved");
    case "exported":
      return t("payments.reimbursements.status.exported");
    case "paid":
      return t("payments.reimbursements.status.paid");
    case "reconciled":
      return t("payments.reimbursements.status.reconciled");
    case "draft":
    default:
      return t("payments.reimbursements.status.draft");
  }
}

function buildTimeline(
  batch: ReimbursementBatchRecord,
  t: TranslateFn,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    {
      at: batch.periodMonth,
      title: t("payments.reimbursements.timeline.batchCreated"),
      body: t("payments.reimbursements.timeline.batchCreatedBody", {
        statementId: batch.statementId,
        driverId: batch.driverId,
      }),
      tone: "neutral",
    },
  ];

  if (batch.items.length > 0) {
    entries.push({
      at: batch.periodMonth,
      title: t("payments.reimbursements.timeline.submittedForApproval"),
      body: t("payments.reimbursements.timeline.submittedForApprovalBody", {
        count: batch.items.length,
      }),
      tone: "warn",
    });
  }

  if (batch.approvedAt) {
    entries.push({
      at: batch.approvedAt,
      title: t("payments.reimbursements.timeline.approved"),
      body: t("payments.reimbursements.timeline.approvedBody"),
      tone: "info",
    });
  }

  if (batch.remittanceProofId) {
    entries.push({
      at: batch.paidAt ?? batch.approvedAt ?? batch.periodMonth,
      title: t("payments.reimbursements.timeline.remittanceProofAttached"),
      body: t("payments.reimbursements.timeline.remittanceProofAttachedBody", {
        proofId: batch.remittanceProofId,
      }),
      tone: "info",
    });
  }

  if (batch.paidAt) {
    entries.push({
      at: batch.paidAt,
      title: t("payments.reimbursements.timeline.markedPaid"),
      body: t("payments.reimbursements.timeline.markedPaidBody"),
      tone: "success",
    });
  }

  if (!batch.approvedAt) {
    entries.push({
      at: batch.periodMonth,
      title: t("payments.reimbursements.timeline.waitingApproval"),
      body: t("payments.reimbursements.timeline.waitingApprovalBody"),
      tone: "warn",
    });
  }

  return entries;
}

function buildLineItemRows(
  batch: ReimbursementBatchRecord,
  t: TranslateFn,
): LineItemRow[] {
  return batch.items.map((item: ReimbursementItemRecord, index: number) => ({
    id: item.itemId,
    recipient: `${batch.driverId}${item.channelKey ? ` · ${item.channelKey}` : ""}`,
    amount: formatMoney(item.amount),
    sourceReference: item.orderId,
    note:
      item.reason ||
      t("payments.reimbursements.detail.lineItemsFallbackNote", {
        index: index + 1,
      }),
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
  const { t } = useTranslation();
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
  const [savingAction, setSavingAction] = useState<"approve" | "paid" | null>(
    null,
  );
  const [approvalKey, setApprovalKey] = useState(() =>
    createIdempotencyKey("reimbursement-approve"),
  );
  const [markPaidKey, setMarkPaidKey] = useState(() =>
    createIdempotencyKey("reimbursement-mark-paid"),
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
          setRemittanceProofId(nextBatch.remittanceProofId ?? "");
          return;
        }

        setBatch(null);
        setRemittanceProofId("");
      } catch (nextError: any) {
        if (!active) {
          return;
        }
        setBatch(null);
        setRemittanceProofId("");
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
  }, [batchId, client, t]);

  async function handleApprove() {
    if (!batch) {
      return;
    }
    const reason = approveReason.trim();
    if (!reason) {
      setApprovalError(
        t("payments.reimbursements.detail.approvalReasonRequired"),
      );
      return;
    }

    setSavingAction("approve");
    setApprovalError(null);

    try {
      const nextBatch = await client.approveReimbursementBatch(
        batch.batchId,
        {
          statementId: batch.statementId,
        },
        {
          idempotencyKey: approvalKey,
        },
      );
      setBatch(nextBatch);
      setApprovalReceipt(
        t("payments.reimbursements.detail.approvalRecorded", { reason }),
      );
      setApproveReason("");
      setApprovalKey(createIdempotencyKey("reimbursement-approve"));
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
      const nextBatch = await client.markReimbursementPaid(
        batch.batchId,
        {
          ...(proofId ? { remittanceProofId: proofId } : {}),
          paidAt: new Date().toISOString(),
        },
        {
          idempotencyKey: markPaidKey,
        },
      );
      setBatch(nextBatch);
      setRemittanceProofId(nextBatch.remittanceProofId ?? remittanceProofId);
      setApprovalReceipt(t("payments.reimbursements.detail.markedPaid"));
      setMarkPaidKey(createIdempotencyKey("reimbursement-mark-paid"));
    } catch (nextError: any) {
      setApprovalError(nextError?.message ?? String(nextError));
    } finally {
      setSavingAction(null);
    }
  }

  if (loading) {
    return (
      <div style={emptyStateStyle}>
        {t("payments.reimbursements.detail.loading")}
      </div>
    );
  }

  if (!batch) {
    return (
      <div style={pageShellStyle}>
        <PageHeader
          theme={theme}
          title={t("payments.reimbursements.detail.pageTitle")}
          subtitle={batchId}
          actions={
            <Link href="/payments" style={actionButtonLinkStyle()}>
              {t("payments.reimbursements.detail.backToPayments")}
            </Link>
          }
        />
        <div style={pageBodyStyle}>
          <Banner
            theme={theme}
            tone="danger"
            title={t("payments.reimbursements.detail.batchUnavailable")}
            body={
              error ?? t("payments.reimbursements.detail.batchUnavailableBody")
            }
          />
        </div>
      </div>
    );
  }

  const workflowState = getWorkflowState(batch);
  const workflowIndex = WORKFLOW_STEPS.indexOf(workflowState);
  const lineItemRows = buildLineItemRows(batch, t);
  const timelineEntries = buildTimeline(batch, t);
  const statusTone = workflowTone(workflowState);
  const lineItemColumns: CanvasTableColumn<LineItemRow>[] = [
    {
      h: t("payments.reimbursements.detail.lineItems.col.recipient"),
      w: 220,
      r: (row: LineItemRow) => row.recipient,
    },
    {
      h: t("payments.reimbursements.detail.lineItems.col.amount"),
      w: 140,
      mono: true,
      align: "right",
      r: (row: LineItemRow) => row.amount,
    },
    {
      h: t("payments.reimbursements.detail.lineItems.col.sourceReference"),
      w: 220,
      mono: true,
      r: (row: LineItemRow) => row.sourceReference,
    },
    {
      h: t("payments.reimbursements.detail.lineItems.col.note"),
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
              {workflowLabel(workflowState, t)}
            </Pill>
          </span>
        }
        subtitle={`${batch.driverId} · ${formatMoney(batch.totalAmount)} · ${t("payments.reimbursements.detail.stateMachineSubtitle")}`}
        actions={
          <>
            <Link
              href="/payments/reimbursements"
              style={actionButtonLinkStyle()}
            >
              {t("payments.reimbursements.detail.queueLink")}
            </Link>
            <Btn
              theme={theme}
              icon="copy"
              onClick={() => setApprovalReceipt(batch.batchId)}
            >
              {t("payments.reimbursements.detail.copyBatchId")}
            </Btn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {error ? (
          <Banner
            theme={theme}
            tone="danger"
            title={t("payments.reimbursements.detail.refreshFailed")}
            body={error}
          />
        ) : null}

        <Banner
          theme={theme}
          tone="info"
          title={t("payments.reimbursements.detail.auditViewTitle")}
          body={t("payments.reimbursements.detail.auditViewBody")}
        />

        {approvalReceipt ? (
          <Banner
            theme={theme}
            tone="success"
            title={t("payments.reimbursements.detail.auditReceipt")}
            body={approvalReceipt}
          />
        ) : null}

        <Card
          theme={theme}
          title={t("payments.reimbursements.detail.stateMachineTitle")}
          subtitle={t("payments.reimbursements.detail.stateMachineSubtitle")}
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
                    {workflowLabel(step, t)}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div style={heroGridStyle}>
          <Card
            theme={theme}
            title={t("payments.reimbursements.detail.headerCardTitle")}
          >
            <DL
              theme={theme}
              cols={2}
              items={[
                {
                  k: t("payments.reimbursements.detail.summary.batchId"),
                  v: batch.batchId,
                  mono: true,
                },
                {
                  k: t("payments.reimbursements.detail.summary.driver"),
                  v: batch.driverId,
                  mono: true,
                },
                {
                  k: t("payments.reimbursements.detail.summary.statement"),
                  v: batch.statementId,
                  mono: true,
                },
                {
                  k: t("payments.reimbursements.detail.summary.period"),
                  v: batch.periodMonth,
                  mono: true,
                },
                {
                  k: t("payments.reimbursements.detail.summary.totalAmount"),
                  v: formatMoney(batch.totalAmount),
                  mono: true,
                },
                {
                  k: t("payments.reimbursements.detail.summary.state"),
                  v: workflowLabel(workflowState, t),
                  mono: true,
                },
                {
                  k: t("payments.reimbursements.detail.summary.approvedAt"),
                  v: batch.approvedAt ? formatDateTime(batch.approvedAt) : "—",
                  mono: true,
                },
                {
                  k: t("payments.reimbursements.detail.summary.paidAt"),
                  v: batch.paidAt ? formatDateTime(batch.paidAt) : "—",
                  mono: true,
                },
                {
                  k: t(
                    "payments.reimbursements.detail.summary.remittanceProof",
                  ),
                  v: batch.remittanceProofId ?? "—",
                  mono: true,
                },
                {
                  k: t("payments.reimbursements.detail.summary.lineItems"),
                  v: String(batch.items.length),
                  mono: true,
                },
              ]}
            />
          </Card>

          <Card
            theme={theme}
            title={t("payments.reimbursements.detail.approveFlowTitle")}
            subtitle={t("payments.reimbursements.detail.approveFlowSubtitle")}
          >
            <div style={actionPanelStyle}>
              <label style={{ display: "grid", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>
                  {t("payments.reimbursements.detail.approvalReason")}
                </span>
                <textarea
                  value={approveReason}
                  onChange={(event) => setApproveReason(event.target.value)}
                  placeholder={t(
                    "payments.reimbursements.detail.approvalReasonPlaceholder",
                  )}
                  style={textAreaStyle}
                />
              </label>

              <label style={{ display: "grid", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>
                  {t("payments.reimbursements.detail.remittanceProof")}
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
                  title={t("payments.reimbursements.detail.actionFailed")}
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
                    ? t("payments.saving")
                    : t("payments.approve")}
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
                    ? t("payments.saving")
                    : t("payments.reimbursements.detail.markPaid")}
                </Btn>
              </div>
            </div>
          </Card>
        </div>

        <div style={heroGridStyle}>
          <Card
            theme={theme}
            title={t("payments.reimbursements.detail.timelineTitle")}
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
            title={t("payments.reimbursements.detail.batchSummaryTitle")}
            subtitle={t(
              "payments.reimbursements.detail.batchSummarySubtitle.live",
            )}
          >
            <div style={{ display: "grid", gap: 10, fontSize: 12.5 }}>
              <div>
                <strong>
                  {t("payments.reimbursements.detail.approvalGate")}
                </strong>{" "}
                {batch.approvedAt
                  ? t("payments.reimbursements.detail.approvalGateCompleted")
                  : t("payments.reimbursements.detail.approvalGatePending")}
              </div>
              <div>
                <strong>
                  {t("payments.reimbursements.detail.exportPosture")}
                </strong>{" "}
                {batch.remittanceProofId
                  ? t("payments.reimbursements.detail.exportPostureAttached")
                  : t("payments.reimbursements.detail.exportPosturePending")}
              </div>
              <div>
                <strong>
                  {t("payments.reimbursements.detail.settlementTarget")}
                </strong>{" "}
                <span style={monoStyle}>{batch.driverId}</span>
              </div>
              <div>
                <strong>
                  {t("payments.reimbursements.detail.evidenceScope")}
                </strong>{" "}
                {t("payments.reimbursements.detail.evidenceScopeCount", {
                  count: lineItemRows.length,
                })}
              </div>
            </div>
          </Card>
        </div>

        <Card
          theme={theme}
          title={t("payments.reimbursements.detail.lineItemsTitle")}
          subtitle={t("payments.reimbursements.detail.lineItemsSubtitle", {
            count: lineItemRows.length,
          })}
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
              {t("payments.reimbursements.detail.lineItemsEmpty")}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
