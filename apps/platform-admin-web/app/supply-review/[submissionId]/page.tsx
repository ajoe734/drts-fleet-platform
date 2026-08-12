"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useEffect, useMemo, useState, type CSSProperties } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
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
  REASON_CODES,
  buildDocumentRows,
  buildSideBySideDiff,
  classifySupplyReviewError,
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
  const params = useParams();
  const client = usePlatformAdminClient();

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
      setErrorMsg("無效的 submissionId");
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
        setErrorMsg("找不到該筆 supply submission 紀錄");
      }
    } catch (e: any) {
      const info = classifySupplyReviewError(e);
      setRecord(null);
      setDriverDraft(null);
      setVehicleDraft(null);
      setDocuments([]);
      setCanonicalDriver(null);
      setCanonicalVehicle(null);
      setErrorMsg(`載入詳情失敗: ${info.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [submissionId]);

  const currentStatus = record?.status || "submitted";
  const statusMeta = PSR_SUB_STATUS[currentStatus] || PSR_SUB_STATUS.submitted;
  const revisionNo = record?.revisionNo || 1;
  const typeZh = mapSubmissionToTypeZh(record?.submissionType);
  const fleetName =
    record?.fleetPartnerName ||
    (record?.fleetPartnerId ? `車行 (${record.fleetPartnerId})` : "未指定車行");
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
      ),
    [
      submissionId,
      record?.submissionType,
      vehicleDraft,
      driverDraft,
      canonicalVehicle,
      canonicalDriver,
      documents,
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
    () => buildDocumentRows(documents),
    [documents],
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
        comment: comment || "核可並寫入 canonical registry",
      });
      setRecord(updated);
      setShowApproveConfirm(false);
    } catch (e: any) {
      const info = classifySupplyReviewError(e);
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
      setErrorMsg("退回補正需選擇 reason code");
      return;
    }
    if (!comment || !comment.trim()) {
      setErrorMsg("退回補正需填寫說明 (comment)");
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
      const info = classifySupplyReviewError(e);
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
      setErrorMsg("駁回需選擇 reason code");
      return;
    }
    if (!comment || !comment.trim()) {
      setErrorMsg("駁回需填寫說明 (comment)");
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
      const info = classifySupplyReviewError(e);
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
      k: "建立 / 更新 vehicle",
      v: record?.canonicalVehicleId
        ? `${record.canonicalVehicleId} (created)`
        : record?.canonicalDriverId
          ? `${record.canonicalDriverId} (created)`
          : "— (未建立)",
      mono: true,
    },
    {
      k: "affiliation",
      v: record?.fleetPartnerId
        ? `${record.fleetPartnerId} ↔ ${record.canonicalVehicleId || record.canonicalDriverId || "canonical"}`
        : "—",
      mono: true,
    },
    {
      k: "重算 readiness",
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
      k: "通知",
      v: "車行 + 司機",
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
        comment: "平台審核人受理審核",
      });
      setRecord(updated);
    } catch (e: any) {
      const info = classifySupplyReviewError(e);
      setErrorMsg(info.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div data-screen-id="PSR-DETAIL-01">
        <CanvasPageHeader
          title={`${submissionId || "Detail"} · 載入中...`}
          subtitle="正在從伺服器載入 supply submission 詳情..."
        />
        <div style={{ padding: 24 }}>
          <CanvasBanner
            tone="info"
            icon="info"
            title="載入中"
            body="正在處理，請稍候..."
          />
        </div>
      </div>
    );
  }

  if (errorMsg || !record) {
    return (
      <div data-screen-id="PSR-DETAIL-01">
        <CanvasPageHeader
          title={`${submissionId || "Detail"} · 載入失敗`}
          subtitle="無法讀取此筆 supply submission 資料"
          actions={
            <Link href="/supply-review" style={{ textDecoration: "none" }}>
              <CanvasBtn variant="secondary">返回佇列</CanvasBtn>
            </Link>
          }
        />
        <div style={{ padding: 24 }}>
          <CanvasBanner
            tone="danger"
            icon="warn"
            title="載入詳情失敗"
            body={errorMsg || "找不到該筆 supply submission 紀錄"}
            actions={
              <CanvasBtn variant="primary" icon="refresh" onClick={loadDetail}>
                重新嘗試
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
            {submissionId} · {typeZh}審核
            <CanvasPill tone={statusMeta.tone} dot>
              {statusMeta.zh}
              <span style={subMonoStyle}>{statusMeta.en}</span>
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
                受理審核 · start review
              </CanvasBtn>
            </>
          ) : isEditable ? (
            <>
              <CanvasBtn
                variant="secondary"
                icon="edit"
                onClick={() => setShowActionModal("request_revision")}
              >
                退回補正
              </CanvasBtn>
              <CanvasBtn
                variant="secondary"
                danger
                icon="x"
                onClick={() => setShowActionModal("reject")}
              >
                駁回
              </CanvasBtn>
              <CanvasBtn
                variant="primary"
                icon="check"
                onClick={() => setShowApproveConfirm(true)}
              >
                核可 · provision
              </CanvasBtn>
            </>
          ) : (
            <Link href="/supply-review" style={{ textDecoration: "none" }}>
              <CanvasBtn variant="secondary">返回佇列</CanvasBtn>
            </Link>
          )
        }
      />

      {conflictError && (
        <div style={{ padding: "16px 24px 0" }}>
          <CanvasBanner
            tone="danger"
            icon="warn"
            title="SUBMISSION_REVISION_CONFLICT · 409"
            body={`此 submission 已被更新（revision ${revisionNo}）。請重新載入後再審，系統不允許盲蓋。`}
            actions={
              <CanvasBtn variant="primary" icon="refresh" onClick={loadDetail}>
                重新載入
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
            title="REVIEWER_SELF_APPROVAL_DENIED"
            body="審核人不得核可自己以車行身分提交的資料（REVIEWER_SELF_APPROVAL_DENIED）。"
          />
        </div>
      )}

      {errorMsg && !conflictError && !selfApprovalError && (
        <div style={{ padding: "16px 24px 0" }}>
          <CanvasBanner
            tone="danger"
            icon="warn"
            title="操作錯誤"
            body={errorMsg}
          />
        </div>
      )}

      <div style={pageContainerStyle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* VQ-1 Side-by-side diff */}
          <CanvasCard
            title="逐欄位對照 · submission vs canonical"
            subtitle="VQ-1 · 變更欄位以強調色標示"
            actions={
              <div style={{ display: "flex", gap: 6 }}>
                <span
                  onClick={() => setOnlyDiff(false)}
                  style={{ cursor: "pointer" }}
                >
                  <CanvasPill tone={!onlyDiff ? "accent" : "neutral"}>
                    看全部
                  </CanvasPill>
                </span>
                <span
                  onClick={() => setOnlyDiff(true)}
                  style={{ cursor: "pointer" }}
                >
                  <CanvasPill tone={onlyDiff ? "accent" : "neutral"}>
                    只看差異
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
                無欄位對照資料
              </div>
            ) : (
              <div style={diffGridStyle}>
                <div style={diffHeaderStyle}>欄位</div>
                <div style={{ ...diffHeaderStyle, color: theme.accent }}>
                  提交值 · submission
                </div>
                <div style={diffHeaderStyle}>目前 · canonical</div>

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
            title="文件檢視 · documents"
            subtitle="VQ-2 · 類型 / 檔名 / 生效 / 審核狀態"
          >
            {docRows.length === 0 ? (
              <div
                style={{
                  padding: "16px 20px",
                  color: theme.textMuted,
                  fontSize: 13,
                }}
              >
                無附隨文件
              </div>
            ) : (
              <CanvasTable
                columns={[
                  { h: "類型", w: 150, r: (r) => String(r.zh) },
                  { h: "檔名", k: "file", w: 170, mono: true },
                  {
                    h: "生效起迄",
                    w: 170,
                    mono: true,
                    r: (r) => `${r.from} ~ ${r.until}`,
                  },
                  {
                    h: "狀態",
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
                          預覽
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
          <CanvasCard title="完整性檢核 · validation">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {validationInfo.isComplete ? (
                <>
                  <CanvasBanner
                    tone="success"
                    icon="check"
                    body="必填欄位齊全 · 文件類型完整 · 無重複標的。"
                  />
                  <CanvasBanner
                    tone="info"
                    icon="info"
                    body="保險保單與加盟合約已完成校對，核可後將同步更新 canonical 紀錄與 readiness。"
                  />
                </>
              ) : (
                <>
                  {validationInfo.hasMissingDocs && (
                    <CanvasBanner
                      tone="danger"
                      icon="warn"
                      body="缺必要文件（行照 / 保險保單），完整性未過，不可核可。"
                    />
                  )}
                  {validationInfo.expiredDocs.map((doc) => (
                    <CanvasBanner
                      key={doc.documentId}
                      tone="danger"
                      icon="warn"
                      body={`文件過期：${doc.originalFileName || doc.documentType} 已於 ${doc.effectiveUntil} 到期，需要求車行補正。`}
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
            title="審核意見 · reviewer note"
            subtitle="VQ-3 · 退補 / 駁回需填 reason code"
          >
            <CanvasField label="reason code（退補 / 駁回必填）">
              <select
                style={selectStyle}
                value={reasonCode}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setReasonCode(e.target.value)
                }
              >
                <option value="">— 核可免填 —</option>
                {REASON_CODES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </CanvasField>

            <CanvasField label="comment">
              <textarea
                value={comment}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setComment(e.target.value)
                }
                placeholder="輸入給車行的審核說明…"
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
            title="核可將寫入 · canonical preview"
            subtitle="VQ-4 · approve 會改動 registry（不可逆）"
            style={{ borderTop: `2px solid ${theme.accent}` }}
          >
            <CanvasDL cols={1} items={canonicalDlItems} />
            <div style={{ marginTop: 10 }}>
              <CanvasBanner
                tone="warn"
                icon="warn"
                body="核可為單一交易：provision canonical + affiliation + readiness + audit。完整性未過則 SUBMISSION_INCOMPLETE，不可核可。"
              />
            </div>
          </CanvasCard>

          {/* Guardrail */}
          <CanvasCard title="把關 · guardrail">
            <CanvasBanner
              tone="info"
              icon="lock"
              body="審核人不得核可自己以車行身分提交的資料（REVIEWER_SELF_APPROVAL_DENIED），不得繞過必填文件。"
            />
          </CanvasCard>

          {/* VQ-6 Audit Receipt (when approved) */}
          {currentStatus === "approved" && (
            <CanvasCard title="審核憑證 · audit receipt">
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
              確認核可並寫入 canonical？
            </div>
            <div
              style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.5 }}
            >
              此動作將把該筆 submission ({submissionId}) 核可，並在單一交易內：
              <br />
              1. Provision / 更新 canonical 紀錄
              <br />
              2. 綁定車行 affiliation 關係
              <br />
              3. 重新計算 readiness
              <br />
              4. 寫入 audit log 並發送通知
            </div>
            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
            >
              <CanvasBtn
                variant="secondary"
                onClick={() => setShowApproveConfirm(false)}
                disabled={submitting}
              >
                取消
              </CanvasBtn>
              <CanvasBtn
                variant="primary"
                onClick={handleApproveSubmit}
                disabled={submitting}
              >
                {submitting ? "處理中…" : "確認核可 · provision"}
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
                ? "確認退回車行補正？"
                : "確認駁回此送審案？"}
            </div>

            <CanvasField label="reason code（必填）">
              <select
                style={selectStyle}
                value={reasonCode}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setReasonCode(e.target.value)
                }
              >
                <option value="">— 請選擇 —</option>
                {REASON_CODES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </CanvasField>

            <CanvasField label="說明 / comment（必填）">
              <textarea
                value={comment}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setComment(e.target.value)
                }
                placeholder="說明具體補正要求或駁回原因…"
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
                取消
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
                  ? "處理中…"
                  : showActionModal === "request_revision"
                    ? "確認退補"
                    : "確認駁回"}
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
              文件預覽 ·{" "}
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
              <div>• Document ID: {previewDoc.documentId}</div>
              <div>• File Key: {previewDoc.fileObjectKey}</div>
              <div>• Content-Type: {previewDoc.contentType}</div>
              <div>• 大小: {previewDoc.fileSize} bytes</div>
              <div>• SHA-256 Checksum: {previewDoc.checksumSha256}</div>
              <div>
                • 生效起迄: {previewDoc.effectiveFrom} ~{" "}
                {previewDoc.effectiveUntil}
              </div>
              <div>• 審核狀態: {previewDoc.reviewStatus}</div>
            </div>
            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
            >
              <CanvasBtn
                variant="secondary"
                onClick={() => setPreviewDoc(null)}
              >
                關閉預覽
              </CanvasBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
