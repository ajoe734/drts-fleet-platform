"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useEffect, useMemo, useState, type CSSProperties } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasDLItem,
} from "@drts/ui-web";
import type {
  DriverSupplyDraft,
  SupplyDocumentRecord,
  SupplySubmissionRecord,
  VehicleSupplyDraft,
} from "@drts/contracts";
import {
  PSR_SUB_STATUS,
  buildDocumentRows,
  buildSideBySideDiff,
  classifySupplyReviewError,
  getReasonCodes,
  mapSubmissionToTypeZh,
  type DiffRow,
  type DocumentRow,
} from "../supply-review-shared";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const pageContainerStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gridTemplateColumns: "1.6fr 1fr",
  gap: 16,
  alignItems: "start",
};

const subMonoStyle: CSSProperties = {
  marginLeft: 4,
  opacity: 0.6,
  fontFamily: theme.monoFamily,
  fontSize: 9.5,
};

const diffGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.3fr 1fr 1fr",
  fontSize: 12.5,
};

const diffHeaderStyle: CSSProperties = {
  fontWeight: 700,
  color: theme.textMuted,
  padding: "8px 10px",
  borderBottom: `1px solid ${theme.border}`,
};

const selectStyle: CSSProperties = {
  width: "100%",
  backgroundColor: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: 7,
  padding: "7px 10px",
  fontSize: 12.5,
  color: theme.text,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: `${theme.text}80`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: 16,
};

const modalContainerStyle: CSSProperties = {
  backgroundColor: theme.surface,
  borderRadius: 12,
  maxWidth: 520,
  width: "100%",
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  boxShadow:
    "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
  border: `1px solid ${theme.border}`,
};

export default function SupplyReviewDetailPage() {
  const { t } = useTranslation();
  const params = useParams();
  const client = usePlatformAdminClient();

  const reasonCodes = useMemo(() => getReasonCodes(t), [t]);

  const rawId = params?.submissionId;
  const submissionId: string =
    typeof rawId === "string"
      ? rawId
      : Array.isArray(rawId) && rawId[0]
        ? rawId[0]
        : "";

  const [loading, setLoading] = useState<boolean>(true);
  const [record, setRecord] = useState<
    (Partial<SupplySubmissionRecord> & Record<string, any>) | null
  >(null);

  const [driverDraft, setDriverDraft] = useState<DriverSupplyDraft | null>(
    null,
  );
  const [vehicleDraft, setVehicleDraft] = useState<VehicleSupplyDraft | null>(
    null,
  );
  const [documents, setDocuments] = useState<SupplyDocumentRecord[]>([]);
  const [canonicalDriver, setCanonicalDriver] = useState<Record<
    string,
    any
  > | null>(null);
  const [canonicalVehicle, setCanonicalVehicle] = useState<Record<
    string,
    any
  > | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<boolean>(false);
  const [selfApprovalError, setSelfApprovalError] = useState<boolean>(false);

  const [onlyDiff, setOnlyDiff] = useState(false);
  const [reasonCode, setReasonCode] = useState<string>("manual_screening");
  const [comment, setComment] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showActionModal, setShowActionModal] = useState<
    "request_revision" | "reject" | null
  >(null);

  const [previewDoc, setPreviewDoc] = useState<SupplyDocumentRecord | null>(
    null,
  );

  const loadDetail = async () => {
    if (!submissionId) {
      setLoading(false);
      setErrorMsg(t("supplyReview.err.invalidId"));
      setRecord(null);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setConflictError(false);
    setSelfApprovalError(false);

    try {
      const data = await client.getAdminSupplyReviewSubmission(submissionId);
      if (data) {
        const rawData = data as any;
        const subRecord = data.submission || data;
        setRecord(subRecord);
        setDriverDraft(data.driverDraft || null);
        setVehicleDraft(data.vehicleDraft || null);
        setDocuments(data.documents || []);
        setCanonicalDriver(rawData.canonicalDriver || null);
        setCanonicalVehicle(rawData.canonicalVehicle || null);
      } else {
        setRecord(null);
        setErrorMsg(t("supplyReview.err.notFound"));
      }
    } catch (e: any) {
      const info = classifySupplyReviewError(e, t);
      setRecord(null);
      setDriverDraft(null);
      setVehicleDraft(null);
      setDocuments([]);
      setCanonicalDriver(null);
      setCanonicalVehicle(null);
      setErrorMsg(
        t("supplyReview.err.loadDetailFailed", { msg: info.message }),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [submissionId, t]);

  const currentStatus = record?.status || "submitted";
  const statusMeta = PSR_SUB_STATUS[currentStatus] || PSR_SUB_STATUS.submitted;
  const revisionNo = record?.revisionNo || 1;
  const typeZh = mapSubmissionToTypeZh(record?.submissionType, t);
  const fleetName =
    record?.fleetPartnerName ||
    (record?.fleetPartnerId
      ? t("supplyReview.fleetWithId", { id: record.fleetPartnerId })
      : t("supplyReview.unspecifiedFleet"));
  const subjectStr =
    record?.subject ||
    (vehicleDraft
      ? `${vehicleDraft.plateNo} · ${vehicleDraft.brand} ${vehicleDraft.model}`
      : driverDraft
        ? driverDraft.name
        : "—");

  // VQ-1 Side-by-side diff generated strictly from server payload
  const diffRows: DiffRow[] = useMemo(
    () =>
      buildSideBySideDiff(
        submissionId,
        record?.submissionType || "",
        vehicleDraft,
        driverDraft,
        canonicalVehicle,
        canonicalDriver,
        documents,
        t,
      ),
    [
      submissionId,
      record?.submissionType,
      vehicleDraft,
      driverDraft,
      canonicalVehicle,
      canonicalDriver,
      documents,
      t,
    ],
  );

  const displayedDiffRows = useMemo(() => {
    if (onlyDiff) {
      return diffRows.filter((r) => r.changed);
    }
    return diffRows;
  }, [diffRows, onlyDiff]);

  // VQ-2 Documents table generated strictly from server payload
  const docRows: DocumentRow[] = useMemo(
    () => buildDocumentRows(documents, t),
    [documents, t],
  );

  // Dynamic VQ-3 Validation check
  const validationInfo = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const expiredDocs = documents.filter(
      (d) => d.effectiveUntil && d.effectiveUntil < today,
    );
    const hasMissingDocs =
      record?.submissionType === "vehicle_onboarding" && documents.length === 0;

    return {
      isComplete: expiredDocs.length === 0 && !hasMissingDocs,
      expiredDocs,
      hasMissingDocs,
    };
  }, [documents, record?.submissionType]);

  const handleApproveSubmit = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    setConflictError(false);
    setSelfApprovalError(false);

    try {
      const updated = await client.approveAdminSupplySubmission(submissionId, {
        expectedRevisionNo: revisionNo,
        reasonCode: reasonCode || "all_documents_valid",
        comment: comment || t("supplyReview.defaultCommentApprove"),
      });
      setRecord(updated);
      setShowApproveConfirm(false);
    } catch (e: any) {
      const info = classifySupplyReviewError(e, t);
      if (info.isConflict) {
        setConflictError(true);
      } else if (info.isSelfApprovalDenied) {
        setSelfApprovalError(true);
      } else {
        setErrorMsg(info.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestRevisionSubmit = async () => {
    if (!reasonCode) {
      setErrorMsg(t("supplyReview.err.selectReasonRequired"));
      return;
    }
    if (!comment || !comment.trim()) {
      setErrorMsg(t("supplyReview.err.commentRequired"));
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    setConflictError(false);

    try {
      const updated = await client.requestAdminSupplyRevision(submissionId, {
        expectedRevisionNo: revisionNo,
        reasonCode,
        comment: comment.trim(),
      });
      setRecord(updated);
      setShowActionModal(null);
    } catch (e: any) {
      const info = classifySupplyReviewError(e, t);
      if (info.isConflict) {
        setConflictError(true);
      } else {
        setErrorMsg(info.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectSubmit = async () => {
    if (!reasonCode) {
      setErrorMsg(t("supplyReview.err.rejectReasonRequired"));
      return;
    }
    if (!comment || !comment.trim()) {
      setErrorMsg(t("supplyReview.err.rejectCommentRequired"));
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    setConflictError(false);

    try {
      const updated = await client.rejectAdminSupplySubmission(submissionId, {
        expectedRevisionNo: revisionNo,
        reasonCode,
        comment: comment.trim(),
      });
      setRecord(updated);
      setShowActionModal(null);
    } catch (e: any) {
      const info = classifySupplyReviewError(e, t);
      if (info.isConflict) {
        setConflictError(true);
      } else {
        setErrorMsg(info.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canonicalDlItems: CanvasDLItem[] = [
    {
      k: record?.canonicalVehicleId
        ? t("supplyReview.dl.createUpdateVehicle")
        : t("supplyReview.dl.createUpdateDriver"),
      v: record?.canonicalVehicleId
        ? `${record.canonicalVehicleId} (created)`
        : record?.canonicalDriverId
          ? `${record.canonicalDriverId} (created)`
          : t("supplyReview.diff.notCreated"),
      mono: true,
    },
    {
      k: t("supplyReview.dl.affiliation"),
      v: record?.fleetPartnerId
        ? `${record.fleetPartnerId} ↔ ${record.canonicalVehicleId || record.canonicalDriverId || "canonical"}`
        : "—",
      mono: true,
    },
    {
      k: t("supplyReview.dl.recalcReadiness"),
      v: (
        <CanvasPill
          tone={currentStatus === "approved" ? "success" : "neutral"}
          dot
        >
          {currentStatus === "approved" ? "ready" : "pending"}
        </CanvasPill>
      ),
    },
    {
      k: t("supplyReview.dl.notifications"),
      v: t("supplyReview.dl.notifyTargets"),
      mono: false,
    },
  ];

  const isSubmitted = currentStatus === "submitted";
  const isEditable = ["submitted", "in_review"].includes(currentStatus);

  const handleStartReview = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const updated = await client.startAdminSupplyReview(submissionId, {
        expectedRevisionNo: revisionNo,
        reasonCode: "manual_screening",
        comment: t("supplyReview.defaultCommentStart"),
      });
      setRecord(updated);
    } catch (e: any) {
      const info = classifySupplyReviewError(e, t);
      setErrorMsg(info.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div data-screen-id="PSR-DETAIL-01">
        <CanvasPageHeader
          title={`${submissionId || "Detail"} · ${t("supplyReview.detail.loadingTitle")}...`}
          subtitle={t("supplyReview.banner.loadingBody")}
        />
        <div style={{ padding: 24 }}>
          <CanvasBanner
            tone="info"
            icon="info"
            title={t("supplyReview.detail.loadingTitle")}
            body={t("supplyReview.banner.processing")}
          />
        </div>
      </div>
    );
  }

  if (errorMsg || !record) {
    return (
      <div data-screen-id="PSR-DETAIL-01">
        <CanvasPageHeader
          title={`${submissionId || "Detail"} · ${t("supplyReview.detail.loadFailedTitle")}`}
          subtitle={t("supplyReview.banner.loadDetailFailedSubtitle")}
          actions={
            <Link href="/supply-review" style={{ textDecoration: "none" }}>
              <CanvasBtn variant="secondary">
                {t("supplyReview.detail.backToQueue")}
              </CanvasBtn>
            </Link>
          }
        />
        <div style={{ padding: 24 }}>
          <CanvasBanner
            tone="danger"
            icon="warn"
            title={t("supplyReview.detail.loadFailedTitle")}
            body={errorMsg || t("supplyReview.err.notFound")}
            actions={
              <CanvasBtn variant="primary" icon="refresh" onClick={loadDetail}>
                {t("supplyReview.detail.retry")}
              </CanvasBtn>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div data-screen-id="PSR-DETAIL-01">
      <CanvasPageHeader
        title={
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
          >
            {submissionId} ·{" "}
            {t("supplyReview.detail.reviewHeader", { type: typeZh })}
            <CanvasPill tone={statusMeta.tone} dot>
              {t(statusMeta.key)}
              <span style={subMonoStyle}>{statusMeta.code}</span>
            </CanvasPill>
          </span>
        }
        subtitle={`${fleetName} · ${subjectStr} · revision ${revisionNo} · expectedRevisionNo=${revisionNo}`}
        actions={
          isSubmitted ? (
            <>
              <CanvasBtn
                variant="primary"
                icon="check"
                disabled={submitting}
                onClick={handleStartReview}
              >
                {t("supplyReview.detail.startReview")}
              </CanvasBtn>
            </>
          ) : isEditable ? (
            <>
              <CanvasBtn
                variant="secondary"
                icon="edit"
                onClick={() => setShowActionModal("request_revision")}
              >
                {t("supplyReview.detail.requestRevision")}
              </CanvasBtn>
              <CanvasBtn
                variant="secondary"
                danger
                icon="x"
                onClick={() => setShowActionModal("reject")}
              >
                {t("supplyReview.detail.reject")}
              </CanvasBtn>
              <CanvasBtn
                variant="primary"
                icon="check"
                onClick={() => setShowApproveConfirm(true)}
              >
                {t("supplyReview.detail.approveProvision")}
              </CanvasBtn>
            </>
          ) : (
            <Link href="/supply-review" style={{ textDecoration: "none" }}>
              <CanvasBtn variant="secondary">
                {t("supplyReview.detail.backToQueue")}
              </CanvasBtn>
            </Link>
          )
        }
      />

      {conflictError && (
        <div style={{ padding: "16px 24px 0" }}>
          <CanvasBanner
            tone="danger"
            icon="warn"
            title={t("supplyReview.banner.conflictTitle")}
            body={t("supplyReview.banner.conflictBody", { rev: revisionNo })}
            actions={
              <CanvasBtn variant="primary" icon="refresh" onClick={loadDetail}>
                {t("supplyReview.detail.reload")}
              </CanvasBtn>
            }
          />
        </div>
      )}

      {selfApprovalError && (
        <div style={{ padding: "16px 24px 0" }}>
          <CanvasBanner
            tone="danger"
            icon="warn"
            title={t("supplyReview.banner.selfApprovalTitle")}
            body={t("supplyReview.banner.selfApprovalBody")}
          />
        </div>
      )}

      {errorMsg && !conflictError && !selfApprovalError && (
        <div style={{ padding: "16px 24px 0" }}>
          <CanvasBanner
            tone="danger"
            icon="warn"
            title={t("supplyReview.detail.opError")}
            body={errorMsg}
          />
        </div>
      )}

      <div style={pageContainerStyle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* VQ-1 Side-by-side diff */}
          <CanvasCard
            title={t("supplyReview.detail.diffTitle")}
            subtitle={t("supplyReview.detail.diffSubtitle")}
            actions={
              <div style={{ display: "flex", gap: 6 }}>
                <span
                  onClick={() => setOnlyDiff(false)}
                  style={{ cursor: "pointer" }}
                >
                  <CanvasPill tone={!onlyDiff ? "accent" : "neutral"}>
                    {t("supplyReview.detail.viewAll")}
                  </CanvasPill>
                </span>
                <span
                  onClick={() => setOnlyDiff(true)}
                  style={{ cursor: "pointer" }}
                >
                  <CanvasPill tone={onlyDiff ? "accent" : "neutral"}>
                    {t("supplyReview.detail.viewDiffOnly")}
                  </CanvasPill>
                </span>
              </div>
            }
          >
            {displayedDiffRows.length === 0 ? (
              <div
                style={{
                  padding: "16px 20px",
                  color: theme.textMuted,
                  fontSize: 13,
                }}
              >
                {t("supplyReview.detail.noDiffData")}
              </div>
            ) : (
              <div style={diffGridStyle}>
                <div style={diffHeaderStyle}>
                  {t("supplyReview.detail.colField")}
                </div>
                <div style={{ ...diffHeaderStyle, color: theme.accent }}>
                  {t("supplyReview.detail.colSubmitted")}
                </div>
                <div style={diffHeaderStyle}>
                  {t("supplyReview.detail.colCanonical")}
                </div>

                {displayedDiffRows.map((r, i) => (
                  <React.Fragment key={i}>
                    <div
                      style={{
                        padding: "9px 10px",
                        borderBottom: `1px solid ${theme.border}`,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {r.changed && (
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: theme.accent,
                          }}
                        />
                      )}
                      {r.label}
                    </div>
                    <div
                      style={{
                        padding: "9px 10px",
                        borderBottom: `1px solid ${theme.border}`,
                        fontFamily: theme.monoFamily,
                        backgroundColor: r.changed
                          ? theme.accentBg
                          : "transparent",
                        fontWeight: r.changed ? 700 : 400,
                      }}
                    >
                      {r.submitted}
                    </div>
                    <div
                      style={{
                        padding: "9px 10px",
                        borderBottom: `1px solid ${theme.border}`,
                        fontFamily: theme.monoFamily,
                        color: theme.textMuted,
                      }}
                    >
                      {r.canonical}
                    </div>
                  </React.Fragment>
                ))}
              </div>
            )}
          </CanvasCard>

          {/* VQ-2 Document review */}
          <CanvasCard
            title={t("supplyReview.detail.docTitle")}
            subtitle={t("supplyReview.detail.docSubtitle")}
          >
            {docRows.length === 0 ? (
              <div
                style={{
                  padding: "16px 20px",
                  color: theme.textMuted,
                  fontSize: 13,
                }}
              >
                {t("supplyReview.detail.noDocuments")}
              </div>
            ) : (
              <CanvasTable
                columns={[
                  {
                    h: t("supplyReview.docCol.type"),
                    w: 150,
                    r: (r) => String(r.zh),
                  },
                  {
                    h: t("supplyReview.docCol.filename"),
                    k: "file",
                    w: 170,
                    mono: true,
                  },
                  {
                    h: t("supplyReview.docCol.period"),
                    w: 170,
                    mono: true,
                    r: (r) => `${r.from} ~ ${r.until}`,
                  },
                  {
                    h: t("supplyReview.docCol.status"),
                    w: 100,
                    r: (r) => (
                      <CanvasPill tone={r.tone as any} dot>
                        {String(r.s)}
                      </CanvasPill>
                    ),
                  },
                  {
                    h: "",
                    w: 80,
                    r: (r) => {
                      const rawDoc = (r as unknown as DocumentRow).rawDoc;
                      if (!rawDoc) return null;
                      return (
                        <CanvasBtn
                          size="xs"
                          variant="ghost"
                          icon="eye"
                          onClick={() => setPreviewDoc(rawDoc)}
                        >
                          {t("supplyReview.detail.docPreview")}
                        </CanvasBtn>
                      );
                    },
                  },
                ]}
                rows={docRows as unknown as Record<string, unknown>[]}
              />
            )}
          </CanvasCard>

          {/* VQ-3 Dynamic Validation warnings */}
          <CanvasCard title={t("supplyReview.detail.validationTitle")}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {validationInfo.isComplete ? (
                <>
                  <CanvasBanner
                    tone="success"
                    icon="check"
                    body={t("supplyReview.validation.completeBody")}
                  />
                  <CanvasBanner
                    tone="info"
                    icon="info"
                    body={t("supplyReview.validation.completeInfo")}
                  />
                </>
              ) : (
                <>
                  {validationInfo.hasMissingDocs && (
                    <CanvasBanner
                      tone="danger"
                      icon="warn"
                      body={t("supplyReview.validation.missingDocs")}
                    />
                  )}
                  {validationInfo.expiredDocs.map((doc) => (
                    <CanvasBanner
                      key={doc.documentId}
                      tone="danger"
                      icon="warn"
                      body={t("supplyReview.validation.docExpired", {
                        name: doc.originalFileName || doc.documentType,
                        until: doc.effectiveUntil || "—",
                      })}
                    />
                  ))}
                </>
              )}
            </div>
          </CanvasCard>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Reviewer note + Reason code (VQ-3) */}
          <CanvasCard
            title={t("supplyReview.detail.reviewerNoteTitle")}
            subtitle={t("supplyReview.detail.noteSubtitle")}
          >
            <CanvasField label={t("supplyReview.modal.reasonLabel")}>
              <select
                style={selectStyle}
                value={reasonCode}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setReasonCode(e.target.value)
                }
              >
                <option value="">
                  {t("supplyReview.detail.approveNoNote")}
                </option>
                {reasonCodes.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </CanvasField>

            <CanvasField label={t("supplyReview.modal.commentLabel")}>
              <textarea
                value={comment}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setComment(e.target.value)
                }
                placeholder={t("supplyReview.detail.commentPlaceholder")}
                style={{
                  width: "100%",
                  border: `1px solid ${theme.border}`,
                  borderRadius: 8,
                  padding: "10px 12px",
                  minHeight: 80,
                  fontSize: 12.5,
                  color: theme.text,
                  backgroundColor: theme.surface,
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
              />
            </CanvasField>
          </CanvasCard>

          {/* VQ-4 Canonical preview */}
          <CanvasCard
            title={t("supplyReview.detail.canonicalPreviewTitle")}
            subtitle={t("supplyReview.detail.previewSubtitle")}
            style={{ borderTop: `2px solid ${theme.accent}` }}
          >
            <CanvasDL cols={1} items={canonicalDlItems} />
            <div style={{ marginTop: 10 }}>
              <CanvasBanner
                tone="warn"
                icon="warn"
                body={t("supplyReview.detail.previewWarn")}
              />
            </div>
          </CanvasCard>

          {/* Guardrail */}
          <CanvasCard title={t("supplyReview.detail.guardrailTitle")}>
            <CanvasBanner
              tone="info"
              icon="lock"
              body={t("supplyReview.detail.guardrailBody")}
            />
          </CanvasCard>

          {/* VQ-6 Audit Receipt (when approved) */}
          {currentStatus === "approved" && (
            <CanvasCard title={t("supplyReview.detail.auditReceiptTitle")}>
              <CanvasDL
                cols={1}
                items={[
                  {
                    k: "canonicalDriverId",
                    v: record.canonicalDriverId || "—",
                    mono: true,
                  },
                  {
                    k: "canonicalVehicleId",
                    v: record.canonicalVehicleId || "—",
                    mono: true,
                  },
                  {
                    k: "canonicalContractId",
                    v: record.canonicalContractId || "—",
                    mono: true,
                  },
                  {
                    k: "canonicalPolicyId",
                    v: record.canonicalPolicyId || "—",
                    mono: true,
                  },
                  {
                    k: "readiness",
                    v: (
                      <CanvasPill tone="success" dot>
                        ready
                      </CanvasPill>
                    ),
                  },
                  {
                    k: "reviewedBy",
                    v: record.reviewedBy || record.reviewStartedBy || "—",
                    mono: false,
                  },
                ]}
              />
            </CanvasCard>
          )}
        </div>
      </div>

      {/* Confirmation Modals */}
      {showApproveConfirm && (
        <div style={modalOverlayStyle}>
          <div style={modalContainerStyle}>
            <div style={{ fontWeight: 700, fontSize: 16, color: theme.text }}>
              {t("supplyReview.detail.confirmApproveTitle")}
            </div>
            <div
              style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.5 }}
            >
              {t("supplyReview.detail.confirmApproveIntro", { submissionId })}
              <br />
              {t("supplyReview.detail.confirmApproveStep1")}
              <br />
              {t("supplyReview.detail.confirmApproveStep2")}
              <br />
              {t("supplyReview.detail.confirmApproveStep3")}
              <br />
              {t("supplyReview.detail.confirmApproveStep4")}
            </div>
            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
            >
              <CanvasBtn
                variant="secondary"
                onClick={() => setShowApproveConfirm(false)}
                disabled={submitting}
              >
                {t("supplyReview.detail.cancel")}
              </CanvasBtn>
              <CanvasBtn
                variant="primary"
                onClick={handleApproveSubmit}
                disabled={submitting}
              >
                {submitting
                  ? t("supplyReview.modal.processing")
                  : t("supplyReview.modal.confirmApproveBtn")}
              </CanvasBtn>
            </div>
          </div>
        </div>
      )}

      {showActionModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContainerStyle}>
            <div style={{ fontWeight: 700, fontSize: 16, color: theme.text }}>
              {showActionModal === "request_revision"
                ? t("supplyReview.modal.confirmRevisionTitle")
                : t("supplyReview.modal.confirmRejectTitle")}
            </div>

            <CanvasField label={t("supplyReview.modal.reasonLabel")}>
              <select
                style={selectStyle}
                value={reasonCode}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setReasonCode(e.target.value)
                }
              >
                <option value="">
                  {t("supplyReview.detail.selectReason")}
                </option>
                {reasonCodes.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </CanvasField>

            <CanvasField label={t("supplyReview.modal.commentLabel")}>
              <textarea
                value={comment}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setComment(e.target.value)
                }
                placeholder={t("supplyReview.detail.actionCommentPlaceholder")}
                style={{
                  width: "100%",
                  border: `1px solid ${theme.border}`,
                  borderRadius: 8,
                  padding: "10px 12px",
                  minHeight: 80,
                  fontSize: 12.5,
                  color: theme.text,
                  backgroundColor: theme.surface,
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
              />
            </CanvasField>

            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
            >
              <CanvasBtn
                variant="secondary"
                onClick={() => setShowActionModal(null)}
                disabled={submitting}
              >
                {t("supplyReview.detail.cancel")}
              </CanvasBtn>
              <CanvasBtn
                variant="primary"
                danger={showActionModal === "reject"}
                onClick={
                  showActionModal === "request_revision"
                    ? handleRequestRevisionSubmit
                    : handleRejectSubmit
                }
                disabled={submitting}
              >
                {submitting
                  ? t("supplyReview.modal.processing")
                  : showActionModal === "request_revision"
                    ? t("supplyReview.modal.confirmRevisionBtn")
                    : t("supplyReview.modal.confirmRejectBtn")}
              </CanvasBtn>
            </div>
          </div>
        </div>
      )}

      {/* VQ-2 Preview Document Modal */}
      {previewDoc && (
        <div style={modalOverlayStyle}>
          <div style={modalContainerStyle}>
            <div style={{ fontWeight: 700, fontSize: 16, color: theme.text }}>
              {t("supplyReview.detail.previewDocTitle")}{" "}
              {previewDoc.originalFileName || previewDoc.documentType}
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: theme.textMuted,
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: 12,
                backgroundColor: theme.accentBg,
                borderRadius: 8,
                fontFamily: theme.monoFamily,
              }}
            >
              <div>
                {t("supplyReview.detail.docId")}
                {previewDoc.documentId}
              </div>
              <div>
                {t("supplyReview.detail.fileKey")}
                {previewDoc.fileObjectKey}
              </div>
              <div>
                {t("supplyReview.detail.contentType")}
                {previewDoc.contentType}
              </div>
              <div>
                {t("supplyReview.detail.fileSize")}
                {previewDoc.fileSize} bytes
              </div>
              <div>
                {t("supplyReview.detail.checksum")}
                {previewDoc.checksumSha256}
              </div>
              <div>
                {t("supplyReview.detail.effectivePeriod")}
                {previewDoc.effectiveFrom} ~ {previewDoc.effectiveUntil}
              </div>
              <div>
                {t("supplyReview.detail.reviewStatus")}
                {previewDoc.reviewStatus}
              </div>
            </div>
            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
            >
              <CanvasBtn
                variant="secondary"
                onClick={() => setPreviewDoc(null)}
              >
                {t("supplyReview.detail.closePreview")}
              </CanvasBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
