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
  SupplyDocumentRecord,
  SupplySubmissionRecord,
} from "@drts/contracts";
import {
  DEFAULT_DIFF_ROWS,
  DEFAULT_DOCUMENT_ROWS,
  FX_PSR_QUEUE,
  PSR_SUB_STATUS,
  REASON_CODES,
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
  backgroundColor: "rgba(11, 18, 32, 0.5)",
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

  const submissionId: string =
    typeof params?.submissionId === "string" && params.submissionId
      ? params.submissionId
      : Array.isArray(params?.submissionId) && params.submissionId[0]
        ? params.submissionId[0]
        : "sub_s39";

  const seedMatch = useMemo(
    () => FX_PSR_QUEUE.find((x) => x.submissionId === submissionId),
    [submissionId],
  );

  const [record, setRecord] = useState<Partial<SupplySubmissionRecord>>({
    submissionId,
    fleetPartnerId: seedMatch?.fleetPartnerId || "fleet-demo-001",
    submissionType: seedMatch?.submissionType || "vehicle_onboarding",
    status: seedMatch?.status || "in_review",
    revisionNo: seedMatch?.revisionNo || 1,
    submittedBy: "fleet-user-1",
    submittedAt: seedMatch?.submittedAt || "2026-06-18T14:02:00.000Z",
    reviewStartedBy: seedMatch?.lockedBy || "林佩璇",
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<boolean>(false);
  const [selfApprovalError, setSelfApprovalError] = useState<boolean>(false);

  const [diffRows] = useState<DiffRow[]>(DEFAULT_DIFF_ROWS);
  const [docRows, setDocRows] = useState<DocumentRow[]>(DEFAULT_DOCUMENT_ROWS);
  const [onlyDiff, setOnlyDiff] = useState(false);

  const [reasonCode, setReasonCode] = useState<string>("manual_screening");
  const [comment, setComment] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showActionModal, setShowActionModal] = useState<
    "request_revision" | "reject" | null
  >(null);

  const loadDetail = async () => {
    setErrorMsg(null);
    setConflictError(false);
    setSelfApprovalError(false);

    try {
      const data = await client.getAdminSupplyReviewSubmission(submissionId);
      if (data) {
        setRecord(data.submission || data);
        if (data.documents && data.documents.length > 0) {
          const mappedDocs: DocumentRow[] = data.documents.map(
            (doc: SupplyDocumentRecord) => ({
              zh: doc.documentType.replace(/_/g, " "),
              file: doc.originalFileName || `${doc.documentId}.pdf`,
              from: doc.effectiveFrom
                ? doc.effectiveFrom.slice(0, 7)
                : "2024-01",
              until: doc.effectiveUntil
                ? doc.effectiveUntil.slice(0, 7)
                : "2029-01",
              s: doc.reviewStatus === "approved" ? "已核可" : "待審",
              tone: doc.reviewStatus === "approved" ? "success" : "info",
            }),
          );
          setDocRows(mappedDocs);
        }
      }
    } catch (e: any) {
      console.warn(
        "Failed to fetch supply submission detail from server, using canvas fallback:",
        e,
      );
    }
  };

  useEffect(() => {
    loadDetail();
  }, [submissionId]);

  const currentStatus = record.status || "in_review";
  const statusMeta = PSR_SUB_STATUS[currentStatus] || PSR_SUB_STATUS.in_review;
  const revisionNo = record.revisionNo || 1;
  const typeZh = mapSubmissionToTypeZh(record.submissionType);
  const fleetName =
    seedMatch?.fleet || `車行 (${record.fleetPartnerId || "fleet-demo-001"})`;
  const subjectStr = seedMatch?.subject || `KAB-7720 · Hyundai Custo`;

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
    setSubmitting(true);
    setErrorMsg(null);
    setConflictError(false);

    try {
      const updated = await client.requestAdminSupplyRevision(submissionId, {
        expectedRevisionNo: revisionNo,
        reasonCode,
        comment: comment || "請補正缺漏文件",
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
    setSubmitting(true);
    setErrorMsg(null);
    setConflictError(false);

    try {
      const updated = await client.rejectAdminSupplySubmission(submissionId, {
        expectedRevisionNo: revisionNo,
        reasonCode,
        comment: comment || "退件駁回",
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

  const displayedDiffRows = useMemo(() => {
    if (onlyDiff) {
      return diffRows.filter((r) => r.changed);
    }
    return diffRows;
  }, [diffRows, onlyDiff]);

  const canonicalDlItems: CanvasDLItem[] = [
    {
      k: "建立 / 更新 vehicle",
      v: record.canonicalVehicleId
        ? `${record.canonicalVehicleId} (created)`
        : "veh_9120 (update)",
      mono: true,
    },
    {
      k: "affiliation",
      v: `${record.fleetPartnerId || "METRO_FLEET"} ↔ veh_9120`,
      mono: true,
    },
    {
      k: "重算 readiness",
      v: (
        <CanvasPill tone="success" dot>
          ready
        </CanvasPill>
      ),
    },
    {
      k: "通知",
      v: "車行 + 司機",
      mono: false,
    },
  ];

  const isEditable = ["submitted", "in_review"].includes(currentStatus);

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
          isEditable ? (
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
          </CanvasCard>

          {/* Document review */}
          <CanvasCard
            title="文件檢視 · documents"
            subtitle="VQ-2 · 類型 / 檔名 / 生效 / 審核狀態"
          >
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
                  r: () => (
                    <CanvasBtn size="xs" variant="ghost" icon="eye">
                      預覽
                    </CanvasBtn>
                  ),
                },
              ]}
              rows={docRows as unknown as Record<string, unknown>[]}
            />
          </CanvasCard>

          {/* Validation warnings */}
          <CanvasCard title="完整性檢核 · validation">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <CanvasBanner
                tone="success"
                icon="check"
                body="必填欄位齊全 · 文件類型完整 · 無重複車牌。"
              />
              <CanvasBanner
                tone="info"
                icon="info"
                body="保險保單為新附件，核可後將同步更新 canonical 保險到期日。"
              />
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
                    v: record.canonicalDriverId || "drv_9120",
                    mono: true,
                  },
                  {
                    k: "canonicalVehicleId",
                    v: record.canonicalVehicleId || "veh_9120",
                    mono: true,
                  },
                  {
                    k: "canonicalContractId",
                    v: record.canonicalContractId || "contract_9120",
                    mono: true,
                  },
                  {
                    k: "canonicalPolicyId",
                    v: record.canonicalPolicyId || "policy_9120",
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
                ]}
              />
            </CanvasCard>
          )}
        </div>
      </div>

      {/* Action modal for request revision / reject */}
      {showActionModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContainerStyle}>
            <div style={{ fontWeight: 700, fontSize: 16, color: theme.text }}>
              {showActionModal === "request_revision"
                ? "確認退回車行補正？"
                : "確認駁回此送審案？"}
            </div>
            <CanvasBanner
              tone={showActionModal === "request_revision" ? "warn" : "danger"}
              icon="warn"
              body={
                showActionModal === "request_revision"
                  ? "此動作將將狀態變更為 needs_revision，退回車行補充文件或修正資料。"
                  : "此動作將狀態變更為 rejected，終止此次送審。"
              }
            />

            <CanvasField label="reason code (必填)">
              <select
                style={selectStyle}
                value={reasonCode}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setReasonCode(e.target.value)
                }
              >
                {REASON_CODES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </CanvasField>

            <CanvasField label="comment 說明">
              <textarea
                value={comment}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setComment(e.target.value)
                }
                placeholder="請輸入說明..."
                style={{
                  width: "100%",
                  border: `1px solid ${theme.border}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                  minHeight: 60,
                  boxSizing: "border-box",
                }}
              />
            </CanvasField>

            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
            >
              <CanvasBtn
                variant="secondary"
                onClick={() => setShowActionModal(null)}
              >
                取消
              </CanvasBtn>
              <CanvasBtn
                variant="primary"
                danger={showActionModal === "reject"}
                disabled={submitting}
                onClick={
                  showActionModal === "request_revision"
                    ? handleRequestRevisionSubmit
                    : handleRejectSubmit
                }
              >
                {showActionModal === "request_revision"
                  ? "確認退補"
                  : "確認駁回"}
              </CanvasBtn>
            </div>
          </div>
        </div>
      )}

      {/* Approve confirmation modal (VQ-4) */}
      {showApproveConfirm && (
        <div style={modalOverlayStyle}>
          <div style={modalContainerStyle}>
            <div style={{ fontWeight: 700, fontSize: 16, color: theme.text }}>
              確認核可並寫入 canonical？
            </div>
            <CanvasBanner
              tone="warn"
              icon="warn"
              body="此動作將在單一交易內建立/更新 canonical vehicle veh_9120、建立 affiliation、重算 readiness 並寫入 audit。動作具不可逆語意。"
            />

            <div
              style={{
                backgroundColor: theme.neutralBg,
                padding: 12,
                borderRadius: 8,
                fontSize: 12.5,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                將寫入紀錄：
              </div>
              <div>• Canonical Vehicle: veh_9120</div>
              <div>• Affiliation: METRO_FLEET ↔ veh_9120</div>
              <div>• Readiness recalculation: ready</div>
            </div>

            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
            >
              <CanvasBtn
                variant="secondary"
                onClick={() => setShowApproveConfirm(false)}
              >
                取消
              </CanvasBtn>
              <CanvasBtn
                variant="primary"
                disabled={submitting}
                onClick={handleApproveSubmit}
              >
                確認核可 · provision
              </CanvasBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
