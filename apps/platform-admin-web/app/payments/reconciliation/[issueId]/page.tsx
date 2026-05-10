"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePlatformAdminClient, formatDateTime } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
import { RECONCILIATION_ISSUE_RESOLUTION_CODES } from "@drts/contracts";
import type {
  DriverStatementRecord,
  ReconciliationIssueRecord,
  ReimbursementBatchRecord,
  SettlementMatrixRecord,
  TenantInvoiceRecord,
} from "@drts/contracts";
import {
  ArtifactChipList,
  DetailMetadataGrid,
  KpiCard,
  KpiRow,
  Timeline,
  WorkflowPanel,
  WorkflowSplitLayout,
  type DetailListItem,
  type ManagementTone,
  type TimelineItem,
} from "@drts/ui-web";

const DEFAULT_FINANCE_ACTOR_ID = "finance.console";
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

function parseArtifactIds(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function ReconciliationIssueDetailPage() {
  const params = useParams<{ issueId: string }>();
  const issueId = Array.isArray(params?.issueId)
    ? params.issueId[0]
    : (params?.issueId ?? "");
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [financeActorId, setFinanceActorId] = useState(
    DEFAULT_FINANCE_ACTOR_ID,
  );
  const [issues, setIssues] = useState<ReconciliationIssueRecord[]>([]);
  const [invoices, setInvoices] = useState<TenantInvoiceRecord[]>([]);
  const [statements, setStatements] = useState<DriverStatementRecord[]>([]);
  const [reimbursements, setReimbursements] = useState<
    ReimbursementBatchRecord[]
  >([]);
  const [settlementMatrix, setSettlementMatrix] = useState<
    SettlementMatrixRecord[]
  >([]);
  const [issueActionId, setIssueActionId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState("");
  const [commentMessage, setCommentMessage] = useState("");
  const [commentArtifactIds, setCommentArtifactIds] = useState("");
  const [resolutionCode, setResolutionCode] = useState<
    NonNullable<ReconciliationIssueRecord["resolutionCode"]> | ""
  >("");
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [resolutionArtifactIds, setResolutionArtifactIds] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [reopenArtifactIds, setReopenArtifactIds] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        issueRecords,
        invoiceRecords,
        statementRecords,
        reimbursementRecords,
        settlementMatrixRecords,
      ] = await Promise.all([
        client.listReconciliationIssues(),
        client.listPlatformInvoices(),
        client.listDriverStatements(),
        client.listReimbursementBatches(),
        client.listSettlementMatrix(),
      ]);
      setIssues(issueRecords ?? []);
      setInvoices(invoiceRecords ?? []);
      setStatements(statementRecords ?? []);
      setReimbursements(reimbursementRecords ?? []);
      setSettlementMatrix(settlementMatrixRecords ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const issue = useMemo(
    () => issues.find((entry) => entry.issueId === issueId) ?? null,
    [issueId, issues],
  );

  useEffect(() => {
    if (!issue) {
      return;
    }
    setAssigneeId(issue.ownerId ?? "");
    setResolutionCode(issue.resolutionCode ?? "");
  }, [issue]);

  const detailCopy =
    locale === "en"
      ? {
          back: "Back to payments",
          title: "Reconciliation issue detail",
          subtitle:
            "Review linked finance references, evidence, and workflow actions for this issue.",
          notFound:
            "Issue not found. It may have been resolved or filtered out upstream.",
          summary: "Summary",
          linkedRefs: "Linked references",
          timeline: "Timeline",
          evidence: "Evidence",
          workflow: "Resolution workflow",
          settlement: "Settlement linkage",
          shadow: "Forwarded shadow context",
          openEvent: "Issue opened",
          resolvedEvent: "Issue resolved",
          reopenedEvent: "Issue reopened",
          currentState: "Current state",
          currentStateNote:
            "Available actions change by status so assignment, resolution, and reopen stay aligned with the audit workflow.",
          none: "None",
        }
      : {
          back: "返回 payments",
          title: "對帳 issue 詳情",
          subtitle: "檢視此 issue 的財務關聯、證據、時間線與處理動作。",
          notFound: "找不到此 issue，可能已被解決或上游狀態已變更。",
          summary: "摘要",
          linkedRefs: "關聯參照",
          timeline: "時間線",
          evidence: "證據",
          workflow: "處理流程",
          settlement: "結算關聯",
          shadow: "轉送 shadow 情境",
          openEvent: "建立 issue",
          resolvedEvent: "已結案",
          reopenedEvent: "重新開啟",
          currentState: "目前狀態",
          currentStateNote:
            "可執行的動作會隨狀態切換，讓指派、結案與 reopen 與 audit workflow 對齊。",
          none: "無",
        };

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

  const matchingSettlementRow = issue
    ? (settlementMatrix.find((row) => row.channelKey === issue.channelKey) ??
      null)
    : null;
  const linkedInvoice = issue?.linkedInvoiceId
    ? (invoices.find((record) => record.invoiceId === issue.linkedInvoiceId) ??
      null)
    : null;
  const linkedReimbursement = issue?.linkedReimbursementBatchId
    ? (reimbursements.find(
        (record) => record.batchId === issue.linkedReimbursementBatchId,
      ) ?? null)
    : null;
  const linkedStatement =
    linkedReimbursement?.statementId != null
      ? (statements.find(
          (record) => record.statementId === linkedReimbursement.statementId,
        ) ?? null)
      : null;
  const canAssignOrResolve = issue?.status !== "resolved";
  const canReopen = issue?.status === "resolved";

  const timelineItems = useMemo<TimelineItem[]>(() => {
    if (!issue) {
      return [];
    }
    type Entry = {
      id: string;
      timestamp: string;
      title: string;
      detail: string;
      tone: ManagementTone;
      eyebrow: string;
      artifacts?: readonly string[];
    };
    const entries: Entry[] = [
      {
        id: `${issue.issueId}:opened`,
        timestamp: issue.createdAt,
        title: detailCopy.openEvent,
        detail: `${issue.openedBy} · ${issue.summary}`,
        tone: "info",
        eyebrow: issue.openedBy,
        artifacts: issue.evidenceArtifactIds,
      },
      ...issue.comments.map<Entry>((comment) => ({
        id: comment.commentId,
        timestamp: comment.createdAt,
        title: comment.actorId,
        detail: comment.message,
        tone: "neutral",
        eyebrow: comment.actorId,
        artifacts: comment.artifactIds,
      })),
    ];

    if (issue.resolvedAt) {
      entries.push({
        id: `${issue.issueId}:resolved`,
        timestamp: issue.resolvedAt,
        title: detailCopy.resolvedEvent,
        detail:
          issue.resolutionSummary ??
          formatPlatformCodeLabel(
            locale,
            issue.resolutionCode ?? "resolved_other",
          ),
        tone: "success",
        eyebrow: formatPlatformCodeLabel(
          locale,
          issue.resolutionCode ?? "resolved_other",
        ),
        artifacts: issue.evidenceArtifactIds,
      });
    }

    if (issue.status === "reopened" && issue.reopenCount > 0) {
      entries.push({
        id: `${issue.issueId}:reopened`,
        timestamp: issue.updatedAt,
        title: detailCopy.reopenedEvent,
        detail: `${issue.reopenCount}×`,
        tone: "warning",
        eyebrow: detailCopy.reopenedEvent,
      });
    }

    entries.sort(
      (left, right) =>
        new Date(left.timestamp).getTime() -
        new Date(right.timestamp).getTime(),
    );

    return entries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      detail: entry.detail,
      tone: entry.tone,
      eyebrow: entry.eyebrow,
      timestamp: formatDateTime(entry.timestamp),
      ...(entry.artifacts && entry.artifacts.length > 0
        ? {
            supportingContent: (
              <ArtifactChipList
                artifactIds={entry.artifacts}
                tone={entry.tone}
              />
            ),
          }
        : {}),
    }));
  }, [
    detailCopy.openEvent,
    detailCopy.reopenedEvent,
    detailCopy.resolvedEvent,
    issue,
    locale,
  ]);

  async function handleAssignIssue() {
    if (!issue) {
      return;
    }
    if (!canAssignOrResolve) {
      return;
    }
    const nextAssigneeId = assigneeId.trim() || issue.ownerId || "";
    if (!nextAssigneeId) {
      setError(t("payments.reconciliation.assigneeRequired"));
      return;
    }
    setIssueActionId(issue.issueId);
    setError(null);
    try {
      await client.assignReconciliationIssue(issue.issueId, {
        assigneeId: nextAssigneeId,
        actorId: financeActorId.trim() || DEFAULT_FINANCE_ACTOR_ID,
        note: commentMessage.trim() || null,
      });
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIssueActionId(null);
    }
  }

  async function handleCommentIssue() {
    if (!issue) {
      return;
    }
    const message = commentMessage.trim();
    if (!message) {
      setError(t("payments.reconciliation.commentRequired"));
      return;
    }
    setIssueActionId(issue.issueId);
    setError(null);
    try {
      await client.addReconciliationIssueComment(issue.issueId, {
        actorId: financeActorId.trim() || DEFAULT_FINANCE_ACTOR_ID,
        message,
        artifactIds: parseArtifactIds(commentArtifactIds),
      });
      setCommentMessage("");
      setCommentArtifactIds("");
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIssueActionId(null);
    }
  }

  async function handleResolveIssue() {
    if (!issue) {
      return;
    }
    if (!canAssignOrResolve) {
      return;
    }
    if (!resolutionSummary.trim()) {
      setError(t("payments.reconciliation.resolveSummaryRequired"));
      return;
    }
    setIssueActionId(issue.issueId);
    setError(null);
    try {
      await client.resolveReconciliationIssue(issue.issueId, {
        actorId: financeActorId.trim() || DEFAULT_FINANCE_ACTOR_ID,
        resolutionCode: resolutionCode || "resolved_other",
        resolutionSummary: resolutionSummary.trim(),
        artifactIds: parseArtifactIds(resolutionArtifactIds),
      });
      setResolutionSummary("");
      setResolutionArtifactIds("");
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIssueActionId(null);
    }
  }

  async function handleReopenIssue() {
    if (!issue) {
      return;
    }
    if (!canReopen) {
      return;
    }
    if (!reopenReason.trim()) {
      setError(t("payments.reconciliation.reopenReasonRequired"));
      return;
    }
    setIssueActionId(issue.issueId);
    setError(null);
    try {
      await client.reopenReconciliationIssue(issue.issueId, {
        actorId: financeActorId.trim() || DEFAULT_FINANCE_ACTOR_ID,
        reason: reopenReason.trim(),
        artifactIds: parseArtifactIds(reopenArtifactIds),
      });
      setReopenReason("");
      setReopenArtifactIds("");
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIssueActionId(null);
    }
  }

  if (loading) {
    return <div className="platform-ui-empty">{t("payments.loading")}</div>;
  }

  if (!issue) {
    return (
      <div>
        <div className="platform-ui-page-header">
          <h1>{detailCopy.title}</h1>
          <p>{detailCopy.notFound}</p>
        </div>
        <Link
          href="/payments"
          className="platform-ui-btn platform-ui-btn--secondary"
        >
          {detailCopy.back}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="platform-ui-page-header">
        <h1>{detailCopy.title}</h1>
        <p>{detailCopy.subtitle}</p>
      </div>

      <div className="platform-ui-toolbar">
        <Link
          href="/payments"
          className="platform-ui-btn platform-ui-btn--secondary"
        >
          {detailCopy.back}
        </Link>
        <button
          className="platform-ui-btn platform-ui-btn--secondary"
          onClick={() => void loadData()}
        >
          {t("common.refresh")}
        </button>
      </div>

      {error && (
        <div
          className="platform-ui-card"
          style={{ borderColor: "rgba(239,68,68,0.3)" }}
        >
          <p style={{ color: "#dc2626", margin: 0 }}>
            {getPlatformLabel(locale, "error")}: {error}
          </p>
        </div>
      )}

      <KpiRow minWidth="220px">
        <KpiCard
          label={detailCopy.currentState}
          value={formatPlatformCodeLabel(locale, issue.status)}
          detail={detailCopy.currentStateNote}
          tone={statusTone(issue.status)}
        />
        <KpiCard
          label={t("payments.reconciliation.assignee")}
          value={issue.ownerId ?? detailCopy.none}
          detail={issue.issueId}
        />
        <KpiCard
          label={t("payments.reconciliation.channel")}
          value={describeMatrixChannel(issue.channelKey)}
          detail={formatPlatformCodeLabel(locale, issue.issueType)}
        />
      </KpiRow>

      <WorkflowSplitLayout
        ariaLabel={detailCopy.title}
        main={
          <>
            <WorkflowPanel title={detailCopy.summary}>
              <DetailMetadataGrid
                minColumnWidth="200px"
                items={[
                  {
                    id: "summary",
                    label: t("payments.reconciliation.summary"),
                    value: issue.summary,
                    columnSpan: 2,
                  },
                  {
                    id: "issueType",
                    label: t("payments.reconciliation.issueType"),
                    value: formatPlatformCodeLabel(locale, issue.issueType),
                  },
                  {
                    id: "actorId",
                    label: t("payments.reconciliation.actorId"),
                    value: issue.openedBy,
                  },
                  {
                    id: "updated",
                    label: getPlatformLabel(locale, "updated"),
                    value: formatDateTime(issue.updatedAt),
                  },
                ]}
              />
              {issue.resolutionSummary ? (
                <DetailMetadataGrid
                  minColumnWidth="240px"
                  items={[
                    {
                      id: "resolution",
                      label: formatPlatformCodeLabel(
                        locale,
                        issue.resolutionCode ?? "resolved_other",
                      ),
                      value: issue.resolutionSummary,
                      tone: "success",
                      columnSpan: 2,
                    },
                  ]}
                />
              ) : null}
            </WorkflowPanel>

            <WorkflowPanel title={detailCopy.linkedRefs}>
              <DetailMetadataGrid
                minColumnWidth="200px"
                items={linkedReferenceItems(
                  issue,
                  t,
                  detailCopy.none,
                  linkedInvoice,
                  linkedReimbursement,
                  linkedStatement,
                  matchingSettlementRow,
                  detailCopy.settlement,
                )}
              />
            </WorkflowPanel>

            <WorkflowPanel
              title={detailCopy.timeline}
              description={
                timelineItems.length === 0 ? detailCopy.none : undefined
              }
            >
              <Timeline items={timelineItems} emptyState={detailCopy.none} />
            </WorkflowPanel>
          </>
        }
        side={
          <>
            <WorkflowPanel title={detailCopy.workflow}>
              <div
                style={{
                  ...formGridStyle,
                  marginBottom: canAssignOrResolve ? 12 : 0,
                }}
              >
                <label style={labelStyle}>
                  {t("payments.reconciliation.actorId")}
                  <input
                    value={financeActorId}
                    onChange={(event) => setFinanceActorId(event.target.value)}
                    style={inputStyle}
                  />
                </label>
              </div>
              {canAssignOrResolve && (
                <>
                  <label style={labelStyle}>
                    {t("payments.reconciliation.assignee")}
                    <input
                      value={assigneeId}
                      onChange={(event) => setAssigneeId(event.target.value)}
                      style={inputStyle}
                      placeholder="finance.lead"
                    />
                  </label>
                  <button
                    className="platform-ui-btn platform-ui-btn--secondary"
                    onClick={() => void handleAssignIssue()}
                    disabled={issueActionId === issue.issueId}
                    style={{ marginTop: 12 }}
                  >
                    {t("payments.reconciliation.assign")}
                  </button>

                  <div style={{ marginTop: 16 }}>
                    <label style={{ ...labelStyle, marginBottom: 8 }}>
                      {t("payments.reconciliation.comment")}
                      <textarea
                        value={commentMessage}
                        onChange={(event) =>
                          setCommentMessage(event.target.value)
                        }
                        style={textAreaStyle}
                      />
                    </label>
                    <label style={labelStyle}>
                      {t("payments.reconciliation.artifactIds")}
                      <input
                        value={commentArtifactIds}
                        onChange={(event) =>
                          setCommentArtifactIds(event.target.value)
                        }
                        style={inputStyle}
                        placeholder={t(
                          "payments.reconciliation.artifactPlaceholder",
                        )}
                      />
                    </label>
                    <button
                      className="platform-ui-btn platform-ui-btn--secondary"
                      onClick={() => void handleCommentIssue()}
                      disabled={issueActionId === issue.issueId}
                      style={{ marginTop: 8 }}
                    >
                      {t("payments.reconciliation.addComment")}
                    </button>
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <label style={labelStyle}>
                      {t("payments.reconciliation.resolveCode")}
                      <select
                        value={resolutionCode}
                        onChange={(event) =>
                          setResolutionCode(
                            event.target.value as
                              | ""
                              | NonNullable<
                                  ReconciliationIssueRecord["resolutionCode"]
                                >,
                          )
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
                    </label>
                    <label style={{ ...labelStyle, marginTop: 8 }}>
                      {t("payments.reconciliation.resolveSummary")}
                      <textarea
                        value={resolutionSummary}
                        onChange={(event) =>
                          setResolutionSummary(event.target.value)
                        }
                        style={textAreaStyle}
                      />
                    </label>
                    <label style={{ ...labelStyle, marginTop: 8 }}>
                      {t("payments.reconciliation.artifactIds")}
                      <input
                        value={resolutionArtifactIds}
                        onChange={(event) =>
                          setResolutionArtifactIds(event.target.value)
                        }
                        style={inputStyle}
                        placeholder={t(
                          "payments.reconciliation.artifactPlaceholder",
                        )}
                      />
                    </label>
                    <button
                      className="platform-ui-btn platform-ui-btn--primary"
                      onClick={() => void handleResolveIssue()}
                      disabled={issueActionId === issue.issueId}
                      style={{ marginTop: 8 }}
                    >
                      {t("payments.reconciliation.resolve")}
                    </button>
                  </div>
                </>
              )}
              {canReopen && (
                <div style={{ marginTop: 16 }}>
                  <label style={labelStyle}>
                    {t("payments.reconciliation.reopen")}
                    <textarea
                      value={reopenReason}
                      onChange={(event) => setReopenReason(event.target.value)}
                      style={textAreaStyle}
                    />
                  </label>
                  <label style={{ ...labelStyle, marginTop: 8 }}>
                    {t("payments.reconciliation.artifactIds")}
                    <input
                      value={reopenArtifactIds}
                      onChange={(event) =>
                        setReopenArtifactIds(event.target.value)
                      }
                      style={inputStyle}
                      placeholder={t(
                        "payments.reconciliation.artifactPlaceholder",
                      )}
                    />
                  </label>
                  <button
                    className="platform-ui-btn platform-ui-btn--secondary"
                    onClick={() => void handleReopenIssue()}
                    disabled={issueActionId === issue.issueId}
                    style={{ marginTop: 8 }}
                  >
                    {t("payments.reconciliation.reopen")}
                  </button>
                </div>
              )}
            </WorkflowPanel>

            <WorkflowPanel title={detailCopy.evidence}>
              <ArtifactChipList
                artifactIds={issue.evidenceArtifactIds}
                emptyState={detailCopy.none}
                tone="success"
                ariaLabel={detailCopy.evidence}
              />
            </WorkflowPanel>

            {matchingSettlementRow ? (
              <WorkflowPanel title={detailCopy.settlement}>
                <DetailMetadataGrid
                  minColumnWidth="180px"
                  items={[
                    {
                      id: "channel",
                      label: t("payments.matrix.col.channel"),
                      value: describeMatrixChannel(
                        matchingSettlementRow.channelKey,
                      ),
                    },
                    {
                      id: "payer",
                      label: t("payments.matrix.col.payer"),
                      value: describeMatrixField(
                        "payer",
                        matchingSettlementRow,
                        matchingSettlementRow.payerType,
                      ),
                    },
                    {
                      id: "invoice",
                      label: t("payments.matrix.col.invoice"),
                      value: describeMatrixField(
                        "invoice",
                        matchingSettlementRow,
                        matchingSettlementRow.invoicePath,
                      ),
                    },
                    {
                      id: "reconciliation",
                      label: t("payments.matrix.col.reconciliation"),
                      value: describeMatrixField(
                        "reconciliation",
                        matchingSettlementRow,
                        matchingSettlementRow.reconciliationPath,
                      ),
                    },
                  ]}
                />
              </WorkflowPanel>
            ) : null}

            {issue.forwardedFinanceContext ? (
              <WorkflowPanel title={detailCopy.shadow} tone="info">
                <DetailMetadataGrid
                  minColumnWidth="180px"
                  items={[
                    {
                      id: "platform",
                      label: locale === "en" ? "Platform" : "平台",
                      value: formatPlatformCodeLabel(
                        locale,
                        issue.forwardedFinanceContext.platformCode,
                      ),
                    },
                    {
                      id: "ledger",
                      label: t("payments.matrix.col.ledger"),
                      value: t(
                        `payments.matrix.ledger.${issue.forwardedFinanceContext.localLedgerMode}`,
                      ),
                    },
                    {
                      id: "payoutAuthority",
                      label: t("payments.shadow.payoutAuthority"),
                      value: t(
                        `payments.shadow.authority.${issue.forwardedFinanceContext.driverPayoutAuthority}`,
                      ),
                    },
                    {
                      id: "note",
                      label: t("payments.col.status"),
                      value:
                        issue.forwardedFinanceContext.note ?? detailCopy.none,
                    },
                  ]}
                />
              </WorkflowPanel>
            ) : null}
          </>
        }
      />
    </div>
  );
}

function statusTone(
  status: ReconciliationIssueRecord["status"],
): ManagementTone {
  switch (status) {
    case "resolved":
      return "success";
    case "reopened":
      return "warning";
    case "assigned":
      return "info";
    case "open":
    default:
      return "danger";
  }
}

function linkedReferenceItems(
  issue: ReconciliationIssueRecord,
  t: (key: string) => string,
  none: string,
  linkedInvoice: TenantInvoiceRecord | null,
  linkedReimbursement: ReimbursementBatchRecord | null,
  linkedStatement: DriverStatementRecord | null,
  matchingSettlementRow: SettlementMatrixRecord | null,
  settlementLabel: string,
): DetailListItem[] {
  const referenceFields: ReadonlyArray<
    readonly [string, string | null | undefined]
  > = [
    ["Issue ID", issue.issueId],
    [t("payments.reconciliation.orderId"), issue.orderId],
    [t("payments.reconciliation.partnerId"), issue.partnerId],
    [t("payments.reconciliation.partnerProgramId"), issue.partnerProgramId],
    [t("payments.reconciliation.sponsorReference"), issue.sponsorReference],
    [t("payments.reconciliation.mirrorOrderId"), issue.mirrorOrderId],
    [t("payments.reconciliation.externalOrderId"), issue.externalOrderId],
    [t("payments.reconciliation.linkedJobId"), issue.linkedReconciliationJobId],
    [
      t("payments.invoicesTitle"),
      linkedInvoice?.invoiceId ?? issue.linkedInvoiceId,
    ],
    [
      t("payments.reimbursementsTitle"),
      linkedReimbursement?.batchId ?? issue.linkedReimbursementBatchId,
    ],
    [t("payments.statementsTitle"), linkedStatement?.statementId ?? null],
    [settlementLabel, matchingSettlementRow?.channelKey ?? null],
  ];

  return referenceFields.map(([label, value], index) => ({
    id: `${label}-${index}`,
    label,
    value: value && value.length > 0 ? value : none,
  }));
}

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
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
