"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { createIdempotencyKey } from "@drts/api-client";
import { useTranslation } from "@/lib/i18n";
import type {
  ReimbursementBatchExportReceipt,
  ReimbursementBatchRecord,
  ReimbursementItemRecord,
  RemittanceProofReadbackGrant,
  RemittanceProofRecord,
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
import {
  REIMBURSEMENT_WORKFLOW_STEPS,
  deriveReimbursementWorkflowState,
  formatReimbursementMoney,
  type ReimbursementWorkflowState,
} from "../reimbursement-readback";
import { proofT } from "../translations";
import {
  exportReimbursementBatch,
  markReimbursementBatchReconciled,
} from "../reimbursement-workflow-client";
import {
  financeStageRemittanceProofContent,
  financeUploadRemittanceProof,
} from "../remittance-finance-proof-client";

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const WORKFLOW_STEPS = REIMBURSEMENT_WORKFLOW_STEPS;

type WorkflowStep = ReimbursementWorkflowState;

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

function GateRow({
  theme: th,
  ok,
  label,
  sub,
}: {
  theme: CanvasTheme;
  ok: boolean;
  label: string;
  sub?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      <span
        aria-hidden
        style={{
          width: 14,
          height: 14,
          marginTop: 2,
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          color: ok ? toneText(th, "success") : toneText(th, "danger"),
        }}
      >
        {ok ? "✓" : "✕"}
      </span>
      <div>
        <div style={{ fontSize: 12.5, color: th.text, fontWeight: 600 }}>
          {label}
        </div>
        {sub ? (
          <div style={{ fontSize: 11, color: th.textMuted, marginTop: 1 }}>
            {sub}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const formatMoney = formatReimbursementMoney;

/**
 * The backend now persists an authoritative `workflowState` (C080); prefer
 * it over the display-task's derivation heuristic, which infers "exported"
 * from `remittanceProofId` (the driver's own remittance-proof upload, a
 * different object -- see `../reimbursement-workflow-client`) and has no
 * notion of this task's real export/reconcile actions. Falls back to the
 * heuristic only for a record that genuinely has no backend state yet.
 */
function getWorkflowState(batch: ReimbursementBatchRecord): WorkflowStep {
  return batch.workflowState ?? deriveReimbursementWorkflowState(batch);
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read the selected file."));
    reader.onload = () => {
      const result = reader.result as string;
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.readAsDataURL(file);
  });
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
  const { t, locale } = useTranslation();
  const batchId = Array.isArray(params.batchId)
    ? params.batchId[0]
    : params.batchId;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState<ReimbursementBatchRecord | null>(null);
  const [approveReason, setApproveReason] = useState("");
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalReceipt, setApprovalReceipt] = useState<string | null>(null);
  const [savingAction, setSavingAction] = useState<
    "approve" | "paid" | "export" | "reconcile" | null
  >(null);
  const [approvalKey, setApprovalKey] = useState(() =>
    createIdempotencyKey("reimbursement-approve"),
  );
  const [payWithProofKey, setPayWithProofKey] = useState(() =>
    createIdempotencyKey("reimbursement-pay-with-proof"),
  );
  const [exportKey, setExportKey] = useState(() =>
    createIdempotencyKey("reimbursement-export"),
  );
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportReceipt, setExportReceipt] =
    useState<ReimbursementBatchExportReceipt | null>(null);
  const [reconcileReason, setReconcileReason] = useState("");
  const [reconcileKey, setReconcileKey] = useState(() =>
    createIdempotencyKey("reimbursement-reconcile"),
  );
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [proof, setProof] = useState<RemittanceProofRecord | null>(null);
  const [proofLoading, setProofLoading] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);
  const [readbackGrant, setReadbackGrant] =
    useState<RemittanceProofReadbackGrant | null>(null);
  const [readbackLoading, setReadbackLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [readbackError, setReadbackError] = useState<string | null>(null);
  const [payWithProofError, setPayWithProofError] = useState<string | null>(
    null,
  );
  const [financeUploadFile, setFinanceUploadFile] = useState<File | null>(null);
  const [financeUploading, setFinanceUploading] = useState(false);
  const [financeUploadError, setFinanceUploadError] = useState<string | null>(
    null,
  );
  const financeUploadAttempt = useRef<{
    contentBase64: string;
    contentType: string;
    batchId: string;
    originalFilename: string;
    stageKey: string;
    uploadKey: string;
  } | null>(null);

  const loadBatch = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const batches = await client.listReimbursementBatches();
      const nextBatch =
        batches.find(
          (item: ReimbursementBatchRecord) => item.batchId === batchId,
        ) ?? null;
      setBatch(nextBatch);
      if (!nextBatch) {
        setError(null);
      }
    } catch (nextError: any) {
      setBatch(null);
      setError(nextError?.message ?? String(nextError));
    } finally {
      setLoading(false);
    }
  }, [batchId, client]);

  useEffect(() => {
    void loadBatch();
  }, [loadBatch]);

  useEffect(() => {
    let active = true;

    async function loadProof() {
      const proofBatchId = batch?.batchId;
      if (!proofBatchId) {
        setProof(null);
        setProofError(null);
        return;
      }
      setProofLoading(true);
      setProofError(null);
      try {
        const record = await client.getReimbursementProof(proofBatchId);
        if (active) {
          setProof(record);
        }
      } catch (nextError: any) {
        if (active) {
          setProof(null);
          setProofError(nextError?.message ?? String(nextError));
        }
      } finally {
        if (active) {
          setProofLoading(false);
        }
      }
    }

    void loadProof();

    return () => {
      active = false;
    };
  }, [batch?.batchId, batch?.remittanceProofId, client]);

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

  async function handleRetryScan() {
    if (!proof) return;
    setScanLoading(true);
    setReadbackError(null);
    try {
      setProof(await client.scanRemittanceProof(proof.proofId));
    } catch (nextError: any) {
      setReadbackError(nextError?.message ?? String(nextError));
    } finally {
      setScanLoading(false);
    }
  }

  async function handleRequestReadback() {
    if (!proof) {
      return;
    }
    setReadbackLoading(true);
    setReadbackError(null);
    try {
      const grant = await client.requestRemittanceProofReadback({
        proofId: proof.proofId,
      });
      const content = await client.downloadRemittanceProof(grant);
      const objectUrl = URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download =
        proof.originalFilename.replace(/[\\/\r\n]/g, "_") || "remittance-proof";
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Let the browser consume the Blob before revoking its local handle.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      setReadbackGrant(grant);
    } catch (nextError: any) {
      setReadbackError(nextError?.message ?? String(nextError));
    } finally {
      setReadbackLoading(false);
    }
  }

  async function handleMarkPaidWithProof() {
    if (!batch || !proof) {
      return;
    }

    setSavingAction("paid");
    setPayWithProofError(null);

    try {
      const receipt = await client.markReimbursementPaidWithProof({
        batchId: batch.batchId,
        proofId: proof.proofId,
        idempotencyKey: payWithProofKey,
      });
      setApprovalReceipt(
        proofT("payWithProof.success", locale, {
          proofId: receipt.proofId,
          receiptId: receipt.receiptId,
        }),
      );
      setPayWithProofKey(createIdempotencyKey("reimbursement-pay-with-proof"));
      await loadBatch();
    } catch (nextError: any) {
      setPayWithProofError(nextError?.message ?? String(nextError));
    } finally {
      setSavingAction(null);
    }
  }

  async function handleFinanceUpload() {
    if (!batch) {
      return;
    }
    if (!financeUploadFile) {
      setFinanceUploadError(proofT("proof.financeUploadNoFile", locale));
      return;
    }
    setFinanceUploading(true);
    setFinanceUploadError(null);
    try {
      const contentBase64 = await fileToBase64(financeUploadFile);
      const contentType = financeUploadFile.type || "application/octet-stream";
      const previous = financeUploadAttempt.current;
      const sameStagedContent =
        previous?.contentBase64 === contentBase64 &&
        previous.contentType === contentType;
      // A failed/unknown ACK keeps the same command identity. A newly selected
      // payload must not reuse a key already bound to different file content.
      // A changed upload also needs a fresh stage: its previous reference may
      // already have been consumed by an upload whose response was lost.
      if (
        !sameStagedContent ||
        previous.batchId !== batch.batchId ||
        previous.originalFilename !== financeUploadFile.name
      ) {
        financeUploadAttempt.current = {
          contentBase64,
          contentType,
          batchId: batch.batchId,
          originalFilename: financeUploadFile.name,
          stageKey: createIdempotencyKey("reimbursement-finance-stage"),
          uploadKey: createIdempotencyKey("reimbursement-finance-upload"),
        };
      }
      const attempt = financeUploadAttempt.current!;
      const staged = await financeStageRemittanceProofContent(
        client,
        { contentBase64, contentType },
        { idempotencyKey: attempt.stageKey },
      );
      const uploaded = await financeUploadRemittanceProof(
        client,
        {
          batchId: batch.batchId,
          originalFilename: financeUploadFile.name,
          contentType,
          sizeBytes: financeUploadFile.size,
          stagedContentRef: staged.stagedContentRef,
        },
        { idempotencyKey: attempt.uploadKey },
      );
      setProof(uploaded);
      setFinanceUploadFile(null);
      financeUploadAttempt.current = null;
    } catch (nextError: any) {
      setFinanceUploadError(nextError?.message ?? String(nextError));
    } finally {
      setFinanceUploading(false);
    }
  }

  async function handleExport() {
    if (!batch) {
      return;
    }
    if (!window.confirm(proofT("export.confirmMessage", locale))) {
      return;
    }

    setSavingAction("export");
    setExportError(null);

    try {
      const receipt = await exportReimbursementBatch(client, batch.batchId, {
        idempotencyKey: exportKey,
      });
      setExportReceipt(receipt);
      setApprovalReceipt(
        proofT("export.success", locale, {
          manifestHash: receipt.manifestHash.slice(0, 16),
          receiptId: receipt.receiptId,
        }),
      );
      setExportKey(createIdempotencyKey("reimbursement-export"));
      await loadBatch();
    } catch (nextError: any) {
      setExportError(nextError?.message ?? String(nextError));
    } finally {
      setSavingAction(null);
    }
  }

  async function handleReconcile() {
    if (!batch) {
      return;
    }
    const reason = reconcileReason.trim();
    if (!reason) {
      setReconcileError(proofT("reconcile.reasonRequired", locale));
      return;
    }
    if (!window.confirm(proofT("reconcile.confirmMessage", locale))) {
      return;
    }

    setSavingAction("reconcile");
    setReconcileError(null);

    try {
      const receipt = await markReimbursementBatchReconciled(
        client,
        batch.batchId,
        { reason },
        { idempotencyKey: reconcileKey },
      );
      setApprovalReceipt(
        proofT("reconcile.success", locale, {
          receiptId: receipt.receiptId,
        }),
      );
      setReconcileReason("");
      setReconcileKey(createIdempotencyKey("reimbursement-reconcile"));
      await loadBatch();
    } catch (nextError: any) {
      setReconcileError(nextError?.message ?? String(nextError));
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
              </div>
            </div>
          </Card>
        </div>

        <Card
          theme={theme}
          title={proofT("export.cardTitle", locale)}
          subtitle={proofT("export.cardSubtitle", locale)}
        >
          <div style={actionPanelStyle}>
            {exportError ? (
              <Banner
                theme={theme}
                tone="danger"
                title={proofT("export.error", locale)}
                body={exportError}
              />
            ) : null}
            {batch.exportedAt ? (
              <div
                style={{
                  fontSize: 11,
                  color: theme.textMuted,
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span>
                  {proofT("export.metaExportedAt", locale)}:{" "}
                  <b style={{ color: theme.text, fontWeight: 600 }}>
                    {formatDateTime(batch.exportedAt)}
                  </b>
                </span>
                <span>
                  {proofT("export.metaExportedBy", locale)}:{" "}
                  <b style={{ color: theme.text, fontWeight: 600 }}>
                    {batch.exportedByActorId ?? "—"}
                  </b>
                </span>
                {batch.exportManifestHash ? (
                  <span>
                    {proofT("export.metaManifestHash", locale)}:{" "}
                    <b style={{ color: theme.text, fontWeight: 600 }}>
                      {batch.exportManifestHash.slice(0, 16)}…
                    </b>
                  </span>
                ) : null}
              </div>
            ) : (
              <div style={{ fontSize: 11.5, color: theme.textMuted }}>
                {proofT("export.notApprovedHint", locale)}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn
                theme={theme}
                variant="primary"
                icon="download"
                disabled={!batch.approvedAt || savingAction !== null}
                onClick={() => void handleExport()}
              >
                {savingAction === "export"
                  ? proofT("export.saving", locale)
                  : proofT("export.button", locale)}
              </Btn>
              {(exportReceipt?.download.downloadUrl ??
              batch.exportDownloadMetadata?.downloadUrl) ? (
                <a
                  href={
                    exportReceipt?.download.downloadUrl ??
                    batch.exportDownloadMetadata!.downloadUrl
                  }
                  target="_blank"
                  rel="noreferrer"
                  style={actionButtonLinkStyle()}
                >
                  {proofT("export.downloadButton", locale)}
                </a>
              ) : null}
            </div>
          </div>
        </Card>

        <Card
          theme={theme}
          title={proofT("proof.cardTitle", locale)}
          subtitle={proofT("proof.cardSubtitle", locale)}
        >
          {proofError ? (
            <Banner
              theme={theme}
              tone="danger"
              title={proofT("proof.loadError", locale)}
              body={proofError}
            />
          ) : proofLoading ? (
            <div
              style={{
                padding: "10px 0",
                color: theme.textMuted,
                fontSize: 12.5,
              }}
            >
              {t("payments.reimbursements.detail.loading")}
            </div>
          ) : proof ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    ...monoStyle,
                    color: theme.text,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {proof.originalFilename}
                </span>
                <span style={{ fontSize: 10.5, color: theme.textMuted }}>
                  {proof.content.sizeBytes.toLocaleString()} bytes
                </span>
                <Pill
                  theme={theme}
                  tone={
                    proof.scanState === "clean"
                      ? "success"
                      : proof.scanState === "rejected"
                        ? "danger"
                        : "warn"
                  }
                  dot
                >
                  {proofT(`proof.scanState.${proof.scanState}`, locale)}
                </Pill>
                <Btn
                  theme={theme}
                  size="sm"
                  icon="eye"
                  disabled={readbackLoading || proof.scanState !== "clean"}
                  onClick={() => void handleRequestReadback()}
                >
                  {readbackLoading
                    ? proofT("proof.viewing", locale)
                    : proofT("proof.viewButton", locale)}
                </Btn>
                {proof.scanState === "pending_scan" ? (
                  <Btn
                    theme={theme}
                    size="sm"
                    icon="refresh"
                    disabled={scanLoading}
                    onClick={() => void handleRetryScan()}
                  >
                    {proofT(
                      scanLoading ? "proof.scanning" : "proof.retryScan",
                      locale,
                    )}
                  </Btn>
                ) : null}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: theme.textMuted,
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span>
                  {proofT("proof.metaBatch", locale)}:{" "}
                  <b style={{ color: theme.text, fontWeight: 600 }}>
                    {proof.batchId}
                  </b>
                </span>
                <span>
                  {proofT("proof.metaHash", locale)}:{" "}
                  <b style={{ color: theme.text, fontWeight: 600 }}>
                    {proof.content.contentHash.slice(0, 16)}…
                  </b>
                </span>
                <span>
                  {proofT("proof.metaUploadedBy", locale)}:{" "}
                  <b style={{ color: theme.text, fontWeight: 600 }}>
                    {proof.uploadedByActorId ?? "—"}
                  </b>
                </span>
                <span>
                  {proofT("proof.metaUploadedAt", locale)}:{" "}
                  <b style={{ color: theme.text, fontWeight: 600 }}>
                    {formatDateTime(proof.createdAt)}
                  </b>
                </span>
              </div>
              {proof.scanState === "rejected" && proof.rejectionReason ? (
                <div style={{ fontSize: 11, color: toneText(theme, "danger") }}>
                  {proofT("proof.rejectionReason", locale)}:{" "}
                  {proof.rejectionReason}
                </div>
              ) : null}

              {readbackError ? (
                <Banner
                  theme={theme}
                  tone="danger"
                  title={proofT("proof.readbackError", locale)}
                  body={readbackError}
                />
              ) : readbackGrant ? (
                (() => {
                  const expired =
                    Date.parse(readbackGrant.expiresAt) <= Date.now();
                  return (
                    <Banner
                      theme={theme}
                      tone={expired ? "warn" : "info"}
                      title={proofT(
                        expired
                          ? "proof.readbackExpiredTitle"
                          : "proof.readbackAuthorizedTitle",
                        locale,
                      )}
                      body={proofT(
                        expired
                          ? "proof.readbackExpiredBody"
                          : "proof.readbackAuthorizedBody",
                        locale,
                        { expiresAt: formatDateTime(readbackGrant.expiresAt) },
                      )}
                      actions={
                        <Btn
                          theme={theme}
                          size="sm"
                          icon="refresh"
                          disabled={readbackLoading}
                          onClick={() => void handleRequestReadback()}
                        >
                          {proofT("proof.reauthorizeButton", locale)}
                        </Btn>
                      }
                    />
                  );
                })()
              ) : null}
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <Pill theme={theme} tone="neutral" dot>
                {proofT("proof.notUploadedTitle", locale)}
              </Pill>
              <div style={{ fontSize: 11.5, color: theme.textMuted }}>
                {proofT("proof.notUploadedBody", locale)}
              </div>
              <div
                style={{
                  marginTop: 4,
                  paddingTop: 10,
                  borderTop: `1px solid ${theme.border}`,
                  display: "grid",
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700 }}>
                  {proofT("proof.financeUploadTitle", locale)}
                </span>
                <div style={{ fontSize: 11.5, color: theme.textMuted }}>
                  {proofT("proof.financeUploadBody", locale)}
                </div>
                {financeUploadError ? (
                  <Banner
                    theme={theme}
                    tone="danger"
                    title={proofT("proof.financeUploadError", locale)}
                    body={financeUploadError}
                  />
                ) : null}
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 12,
                    }}
                  >
                    <input
                      type="file"
                      disabled={financeUploading}
                      onChange={(event) =>
                        setFinanceUploadFile(event.target.files?.[0] ?? null)
                      }
                      style={{ fontSize: 12 }}
                    />
                  </label>
                  <Btn
                    theme={theme}
                    size="sm"
                    icon="plus"
                    disabled={financeUploading || !financeUploadFile}
                    onClick={() => void handleFinanceUpload()}
                  >
                    {financeUploading
                      ? proofT("proof.financeUploadSaving", locale)
                      : proofT("proof.financeUploadButton", locale)}
                  </Btn>
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card
          theme={theme}
          title={proofT("gate.title", locale)}
          subtitle={proofT("gate.subtitle", locale)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <GateRow
              theme={theme}
              ok={Boolean(batch.approvedAt)}
              label={proofT("gate.batchApproved", locale)}
              sub={
                batch.approvedAt
                  ? proofT("gate.batchApprovedSub", locale, {
                      status: workflowLabel(workflowState, t),
                    })
                  : proofT("gate.batchNotApprovedSub", locale)
              }
            />
            <GateRow
              theme={theme}
              ok={proof?.scanState === "clean"}
              label={proofT("gate.proofClean", locale)}
              sub={
                proof
                  ? proofT("gate.proofReadySub", locale, {
                      filename: proof.originalFilename,
                      scanState: proof.scanState,
                    })
                  : proofT("gate.proofNotReadySub", locale)
              }
            />
          </div>
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {payWithProofError ? (
              <Banner
                theme={theme}
                tone="danger"
                title={proofT("payWithProof.error", locale)}
                body={payWithProofError}
              />
            ) : null}
            <Btn
              theme={theme}
              variant="primary"
              icon="check"
              disabled={
                !batch.approvedAt ||
                batch.status === "paid" ||
                proof?.scanState !== "clean" ||
                savingAction !== null
              }
              onClick={() => void handleMarkPaidWithProof()}
            >
              {savingAction === "paid"
                ? proofT("payWithProof.saving", locale)
                : proofT("payWithProof.button", locale)}
            </Btn>
          </div>
        </Card>

        <Card
          theme={theme}
          title={proofT("reconcile.cardTitle", locale)}
          subtitle={proofT("reconcile.cardSubtitle", locale)}
        >
          <div style={actionPanelStyle}>
            {batch.reconciledAt ? (
              <Banner
                theme={theme}
                tone="success"
                title={proofT("reconcile.cardTitle", locale)}
                body={proofT("reconcile.alreadyReconciledHint", locale, {
                  reconciledAt: formatDateTime(batch.reconciledAt),
                  reason: batch.reconciliationReason ?? "",
                })}
              />
            ) : (
              <>
                <label style={{ display: "grid", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>
                    {proofT("reconcile.reasonLabel", locale)}
                  </span>
                  <textarea
                    value={reconcileReason}
                    onChange={(event) => setReconcileReason(event.target.value)}
                    placeholder={proofT("reconcile.reasonPlaceholder", locale)}
                    style={textAreaStyle}
                  />
                </label>
                {reconcileError ? (
                  <Banner
                    theme={theme}
                    tone="danger"
                    title={proofT("reconcile.error", locale)}
                    body={reconcileError}
                  />
                ) : batch.status !== "paid" ? (
                  <div style={{ fontSize: 11.5, color: theme.textMuted }}>
                    {proofT("reconcile.notPaidHint", locale)}
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Btn
                    theme={theme}
                    variant="primary"
                    icon="check"
                    disabled={batch.status !== "paid" || savingAction !== null}
                    onClick={() => void handleReconcile()}
                  >
                    {savingAction === "reconcile"
                      ? proofT("reconcile.saving", locale)
                      : proofT("reconcile.button", locale)}
                  </Btn>
                </div>
              </>
            )}
          </div>
        </Card>

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
