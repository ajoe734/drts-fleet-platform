"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import React, { useEffect, useState, type CSSProperties } from "react";
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
  type CanvasTableColumn,
} from "@drts/ui-web";
import {
  PSR_REVIEWER,
  PSR_SUB_STATUS,
  approveSubmissionAction,
  fetchSupplyReviewDetail,
  rejectSubmissionAction,
  requestRevisionAction,
  startReviewAction,
  type SupplyReviewDetailData,
  type SupplyReviewDocItem,
} from "@/lib/supply-review-client";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

type DetailMode = "review" | "approve_confirm" | "revision_modal" | "reject_modal";

const selectStyle: CSSProperties = {
  width: "100%",
  background: theme.bgRaised,
  border: `1px solid ${theme.border}`,
  borderRadius: 7,
  padding: "8px 10px",
  fontSize: 12.5,
  color: theme.text,
  outline: "none",
  cursor: "pointer",
};

export default function SupplyReviewDetailPage() {
  const params = useParams();
  const router = useRouter();
  const client = usePlatformAdminClient();

  const rawSubmissionId = params?.submissionId;
  const submissionId = typeof rawSubmissionId === "string"
    ? rawSubmissionId
    : Array.isArray(rawSubmissionId)
      ? rawSubmissionId[0]
      : "sub_s39";

  const [data, setData] = useState<SupplyReviewDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<DetailMode>("review");
  const [onlyDiff, setOnlyDiff] = useState(false);

  // Form State
  const [reasonCode, setReasonCode] = useState<string>("all_documents_valid");
  const [comment, setComment] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<{ code: string; message: string } | null>(null);
  const [previewDoc, setPreviewDoc] = useState<SupplyReviewDocItem | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    setApiError(null);
    try {
      const targetId = submissionId || "sub_s39";
      const detail = await fetchSupplyReviewDetail(client, targetId);
      setData(detail);
      if (detail.submission.reviewReasonCode) {
        setReasonCode(detail.submission.reviewReasonCode);
      }
      if (detail.submission.reviewComment) {
        setComment(detail.submission.reviewComment);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load submission detail";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [client, submissionId]);

  if (loading || !data) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: theme.textMuted }}>
        {error || "載入審核詳情中…"}
      </div>
    );
  }

  const sub = data.submission;
  const statusInfo = PSR_SUB_STATUS[sub.status] || PSR_SUB_STATUS.submitted;

  const filteredDiff = onlyDiff ? data.diff.filter((d) => d.isChanged) : data.diff;

  const handleStartReview = async () => {
    setSubmitting(true);
    setApiError(null);
    try {
      const res = await startReviewAction(client, sub.submissionId, sub.rev);
      setData((prev) =>
        prev
          ? {
              ...prev,
              submission: {
                ...prev.submission,
                status: res.status,
                rev: res.revisionNo,
                revisionNo: res.revisionNo,
                lockedBy: res.reviewStartedBy || PSR_REVIEWER.display,
              },
            }
          : null,
      );
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { code?: string } } }; code?: string; message?: string };
      const code = e?.response?.data?.error?.code || e?.code || "START_REVIEW_FAILED";
      setApiError({ code, message: e?.message || "無法開始審核" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async () => {
    setSubmitting(true);
    setApiError(null);
    try {
      const res = await approveSubmissionAction(client, sub.submissionId, sub.rev, comment);
      setData((prev) =>
        prev
          ? {
              ...prev,
              submission: {
                ...prev.submission,
                status: res.status,
                rev: res.revisionNo,
                revisionNo: res.revisionNo,
                canonicalVehicleId: res.canonicalVehicleId,
                canonicalDriverId: res.canonicalDriverId,
              },
              canonicalPreview: {
                ...prev.canonicalPreview,
                vehicleOrDriver: res.canonicalVehicleId || res.canonicalDriverId || prev.canonicalPreview.vehicleOrDriver,
              },
            }
          : null,
      );
      setMode("review");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { code?: string } } }; code?: string; message?: string };
      const code = e?.response?.data?.error?.code || e?.code || "APPROVE_FAILED";
      setApiError({ code, message: e?.message || "核可失敗" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestRevision = async () => {
    if (!reasonCode || reasonCode === "all_documents_valid") {
      setApiError({
        code: "REASON_CODE_REQUIRED",
        message: "退回補正需選擇具體的 reason code (例如：document_expired, document_missing)。",
      });
      return;
    }

    setSubmitting(true);
    setApiError(null);
    try {
      const res = await requestRevisionAction(client, sub.submissionId, sub.rev, reasonCode, comment);
      setData((prev) =>
        prev
          ? {
              ...prev,
              submission: {
                ...prev.submission,
                status: res.status,
                rev: res.revisionNo,
                revisionNo: res.revisionNo,
              },
            }
          : null,
      );
      setMode("review");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { code?: string } } }; code?: string; message?: string };
      const code = e?.response?.data?.error?.code || e?.code || "REVISION_FAILED";
      setApiError({ code, message: e?.message || "退回補正失敗" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!reasonCode || reasonCode === "all_documents_valid") {
      setApiError({
        code: "REASON_CODE_REQUIRED",
        message: "駁回需選擇具體的 reason code。",
      });
      return;
    }

    setSubmitting(true);
    setApiError(null);
    try {
      const res = await rejectSubmissionAction(client, sub.submissionId, sub.rev, reasonCode, comment);
      setData((prev) =>
        prev
          ? {
              ...prev,
              submission: {
                ...prev.submission,
                status: res.status,
                rev: res.revisionNo,
                revisionNo: res.revisionNo,
              },
            }
          : null,
      );
      setMode("review");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { code?: string } } }; code?: string; message?: string };
      const code = e?.response?.data?.error?.code || e?.code || "REJECT_FAILED";
      setApiError({ code, message: e?.message || "駁回失敗" });
    } finally {
      setSubmitting(false);
    }
  };

  const docColumns: CanvasTableColumn<SupplyReviewDocItem>[] = [
    { h: "類型", w: 150, r: (r) => r.zh },
    { h: "檔名", k: "file", w: 170, mono: true },
    { h: "生效起迄", w: 170, mono: true, r: (r) => `${r.from} ~ ${r.until}` },
    { h: "狀態", w: 100, r: (r) => <CanvasPill theme={theme} tone={r.tone} dot>{r.s}</CanvasPill> },
    {
      h: "",
      w: 80,
      r: (r) => (
        <CanvasBtn
          theme={theme}
          size="xs"
          variant="ghost"
          onClick={() => setPreviewDoc(r)}
        >
          預覽
        </CanvasBtn>
      ),
    },
  ];

  return (
    <div style={{ background: theme.bg, minHeight: "100vh" }}>
      <CanvasPageHeader
        theme={theme}
        title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            {sub.id} · {sub.type}審核{" "}
            <CanvasPill theme={theme} tone={statusInfo.tone} dot>
              {statusInfo.zh}
            </CanvasPill>
          </span>
        }
        subtitle={`${sub.fleet} · ${sub.subject} · revision ${sub.rev} · expectedRevisionNo=${sub.rev}`}
        actions={
          <>
            <CanvasBtn
              theme={theme}
              variant="secondary"
              onClick={() => router.push("/supply-review")}
            >
              返回佇列
            </CanvasBtn>
            {sub.status === "submitted" && (
              <CanvasBtn
                theme={theme}
                variant="primary"
                disabled={submitting}
                onClick={() => void handleStartReview()}
              >
                {submitting ? "受理中..." : "受理審核"}
              </CanvasBtn>
            )}
            {sub.status === "in_review" && (
              <>
                <CanvasBtn
                  theme={theme}
                  variant="secondary"
                  onClick={() => {
                    setReasonCode("document_expired");
                    setMode("revision_modal");
                  }}
                >
                  退回補正
                </CanvasBtn>
                <CanvasBtn
                  theme={theme}
                  variant="secondary"
                  danger
                  icon="x"
                  onClick={() => {
                    setReasonCode("invalid_format");
                    setMode("reject_modal");
                  }}
                >
                  駁回
                </CanvasBtn>
                <CanvasBtn
                  theme={theme}
                  variant="primary"
                  icon="check"
                  onClick={() => {
                    setReasonCode("all_documents_valid");
                    setMode("approve_confirm");
                  }}
                >
                  核可 · provision
                </CanvasBtn>
              </>
            )}
          </>
        }
      />

      {/* Error Banners */}
      {apiError?.code === "SUBMISSION_REVISION_CONFLICT" && (
        <div style={{ padding: "16px 24px 0" }}>
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title="SUBMISSION_REVISION_CONFLICT · 409"
            body="此 submission 已被更新（revision conflict）。請重新載入後再審，系統不允許盲蓋。"
            actions={
              <CanvasBtn theme={theme} variant="primary" onClick={() => void loadData()}>
                重新載入
              </CanvasBtn>
            }
          />
        </div>
      )}

      {apiError?.code === "REVIEWER_SELF_APPROVAL_DENIED" && (
        <div style={{ padding: "16px 24px 0" }}>
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title="REVIEWER_SELF_APPROVAL_DENIED · 403"
            body="審核人不得核可自己以車行身分提交的資料。權限與職責分離原則拒絕此請求。"
          />
        </div>
      )}

      {apiError &&
        apiError.code !== "SUBMISSION_REVISION_CONFLICT" &&
        apiError.code !== "REVIEWER_SELF_APPROVAL_DENIED" && (
          <div style={{ padding: "16px 24px 0" }}>
            <CanvasBanner
              theme={theme}
              tone="danger"
              icon="warn"
              title={`${apiError.code} 錯誤`}
              body={apiError.message}
            />
          </div>
        )}

      {/* Detail Layout */}
      <div
        style={{
          padding: 24,
          display: "grid",
          gridTemplateColumns: "1.6fr 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* Left Column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* VQ-1 Side-by-side Diff */}
          <CanvasCard
            theme={theme}
            title="逐欄位對照 · submission vs canonical"
            subtitle="VQ-1 · 變更欄位以強調色標示"
            actions={
              <div style={{ display: "flex", gap: 6 }}>
                <span
                  style={{ cursor: "pointer" }}
                  onClick={() => setOnlyDiff(false)}
                >
                  <CanvasPill theme={theme} tone={onlyDiff ? "neutral" : "accent"}>
                    看全部
                  </CanvasPill>
                </span>
                <span
                  style={{ cursor: "pointer" }}
                  onClick={() => setOnlyDiff(true)}
                >
                  <CanvasPill theme={theme} tone={onlyDiff ? "accent" : "neutral"}>
                    只看差異
                  </CanvasPill>
                </span>
              </div>
            }
          >
            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", fontSize: 12.5 }}>
              <div
                style={{
                  fontWeight: 700,
                  color: theme.textMuted,
                  padding: "8px 10px",
                  borderBottom: `1px solid ${theme.border}`,
                }}
              >
                欄位
              </div>
              <div
                style={{
                  fontWeight: 700,
                  color: theme.accent,
                  padding: "8px 10px",
                  borderBottom: `1px solid ${theme.border}`,
                }}
              >
                提交值 · submission
              </div>
              <div
                style={{
                  fontWeight: 700,
                  color: theme.textMuted,
                  padding: "8px 10px",
                  borderBottom: `1px solid ${theme.border}`,
                }}
              >
                目前 · canonical
              </div>
              {filteredDiff.map((r, i) => (
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
                    {r.isChanged && (
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          background: theme.accent,
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
                      background: r.isChanged ? theme.accentBg : "transparent",
                      fontWeight: r.isChanged ? 700 : 400,
                    }}
                  >
                    {r.submissionValue}
                  </div>
                  <div
                    style={{
                      padding: "9px 10px",
                      borderBottom: `1px solid ${theme.border}`,
                      fontFamily: theme.monoFamily,
                      color: theme.textMuted,
                    }}
                  >
                    {r.canonicalValue}
                  </div>
                </React.Fragment>
              ))}
            </div>
          </CanvasCard>

          {/* Document Review */}
          <CanvasCard
            theme={theme}
            title="文件檢視 · documents"
            subtitle="VQ-2 · 類型 / 檔名 / 生效 / 審核狀態"
          >
            <CanvasTable<SupplyReviewDocItem>
              theme={theme}
              columns={docColumns}
              rows={data.documents}
            />
          </CanvasCard>

          {/* Document Preview Modal Banner */}
          {previewDoc && (
            <CanvasBanner
              theme={theme}
              tone="info"
              icon="info"
              title={`文件預覽 · ${previewDoc.zh}`}
              body={`檔名：${previewDoc.file} | 有效期限：${previewDoc.from} ~ ${previewDoc.until} | 審核狀態：${previewDoc.s}`}
              actions={
                <CanvasBtn theme={theme} size="xs" variant="secondary" onClick={() => setPreviewDoc(null)}>
                  關閉預覽
                </CanvasBtn>
              }
            />
          )}

          {/* Validation Warnings */}
          <CanvasCard theme={theme} title="完整性檢核 · validation">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <CanvasBanner
                theme={theme}
                tone="success"
                icon="check"
                body="必填欄位齊全 · 文件類型完整 · 無重複車牌。"
              />
              <CanvasBanner
                theme={theme}
                tone="info"
                icon="info"
                body="保險保單為新附件，核可後將同步更新 canonical 保險到期日。"
              />
            </div>
          </CanvasCard>
        </div>

        {/* Right Column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Reviewer Note + Reason Code */}
          <CanvasCard
            theme={theme}
            title="審核意見 · reviewer note"
            subtitle="VQ-3 · 退補/駁回需填 reason code"
          >
            <CanvasField theme={theme} label="reason code（退補 / 駁回必填）">
              <select
                style={selectStyle}
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
              >
                <option value="all_documents_valid">all_documents_valid（核可免填）</option>
                <option value="document_expired">document_expired（保單/證件過期）</option>
                <option value="document_missing">document_missing（缺少必填文件）</option>
                <option value="invalid_format">invalid_format（格式不符）</option>
                <option value="manual_screening">manual_screening（人工抽查）</option>
                <option value="other">other（其他）</option>
              </select>
            </CanvasField>

            <CanvasField theme={theme} label="comment">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="輸入給車行的審核說明…"
                style={{
                  width: "100%",
                  minHeight: 64,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  fontSize: 12.5,
                  fontFamily: "inherit",
                  color: theme.text,
                  background: theme.surface,
                  boxSizing: "border-box",
                }}
              />
            </CanvasField>
          </CanvasCard>

          {/* Canonical Write Preview / Audit Receipt */}
          <CanvasCard
            theme={theme}
            title={sub.status === "approved" ? "核可完成憑證 · audit receipt" : "核可將寫入 · canonical preview"}
            subtitle={
              sub.status === "approved"
                ? "VQ-6 · 單一交易 canonical provisioning 已完成"
                : "VQ-4 · approve 會改動 registry（不可逆）"
            }
            style={{ borderTop: `2px solid ${theme.accent}` }}
          >
            <CanvasDL
              theme={theme}
              cols={1}
              items={[
                {
                  k: "建立 / 更新 vehicle/driver",
                  v: sub.canonicalVehicleId || sub.canonicalDriverId || data.canonicalPreview.vehicleOrDriver,
                  mono: true,
                },
                {
                  k: "affiliation",
                  v: data.canonicalPreview.affiliation,
                  mono: true,
                },
                {
                  k: "重算 readiness",
                  v: (
                    <CanvasPill theme={theme} tone="success" dot>
                      {data.canonicalPreview.readiness}
                    </CanvasPill>
                  ),
                },
                {
                  k: "通知",
                  v: data.canonicalPreview.notification,
                  mono: false,
                },
              ]}
            />
            <div style={{ marginTop: 10 }}>
              <CanvasBanner
                theme={theme}
                tone={sub.status === "approved" ? "success" : "warn"}
                icon={sub.status === "approved" ? "check" : "warn"}
                body={
                  sub.status === "approved"
                    ? "單一交易已完成 canonical provisioning + affiliation + readiness + audit 日誌。"
                    : "核可為單一交易：provision canonical + affiliation + readiness + audit。完整性未過則 SUBMISSION_INCOMPLETE，不可核可。"
                }
              />
            </div>
          </CanvasCard>

          {/* Self-approval Guardrail */}
          <CanvasCard theme={theme} title="把關 · guardrail">
            <CanvasBanner
              theme={theme}
              tone="info"
              icon="warn"
              body="審核人不得核可自己以車行身分提交的資料（REVIEWER_SELF_APPROVAL_DENIED），不得繞過必填文件。"
            />
          </CanvasCard>
        </div>
      </div>

      {/* Confirmation Modals */}
      {mode === "approve_confirm" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: theme.surface,
              borderRadius: 12,
              padding: 24,
              maxWidth: 480,
              width: "90%",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>
              確認核可並寫入 canonical？
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: theme.textMuted }}>
              此動作將在單一交易內建立/更新 canonical vehicle/driver 紀錄、建立 affiliation、重算 readiness 並寫入 audit。動作具不可逆語意。
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <CanvasBtn theme={theme} variant="secondary" onClick={() => setMode("review")}>
                取消
              </CanvasBtn>
              <CanvasBtn
                theme={theme}
                variant="primary"
                disabled={submitting}
                onClick={() => void handleApprove()}
              >
                {submitting ? "寫入中..." : "確認核可 · provision"}
              </CanvasBtn>
            </div>
          </div>
        </div>
      )}

      {mode === "revision_modal" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: theme.surface,
              borderRadius: 12,
              padding: 24,
              maxWidth: 480,
              width: "90%",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>
              退回車行補正
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: theme.textMuted }}>
              請選擇原因並填寫說明。提交後狀態將轉為 needs_revision 並通知車行。
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <CanvasBtn theme={theme} variant="secondary" onClick={() => setMode("review")}>
                取消
              </CanvasBtn>
              <CanvasBtn
                theme={theme}
                variant="primary"
                disabled={submitting}
                onClick={() => void handleRequestRevision()}
              >
                {submitting ? "送出中..." : "確認退回補正"}
              </CanvasBtn>
            </div>
          </div>
        </div>
      )}

      {mode === "reject_modal" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: theme.surface,
              borderRadius: 12,
              padding: 24,
              maxWidth: 480,
              width: "90%",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: theme.danger }}>
              確認駁回此 Submission？
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: theme.textMuted }}>
              駁回為最終狀態 (rejected)。請確定此 submission 不合規且無法補正。
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <CanvasBtn theme={theme} variant="secondary" onClick={() => setMode("review")}>
                取消
              </CanvasBtn>
              <CanvasBtn
                theme={theme}
                variant="primary"
                danger
                disabled={submitting}
                onClick={() => void handleReject()}
              >
                {submitting ? "處理中..." : "確認駁回"}
              </CanvasBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
