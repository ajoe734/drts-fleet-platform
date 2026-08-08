"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type {
  SupplySubmissionRecord,
  SupplySubmissionStatus,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasEmptyState,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  buildCanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import {
  classifySupplyReviewFailure,
  getSupplyReviewSubmission,
  mutateSupplyReview,
  type SupplyReviewAction,
} from "../supply-review-client";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });
const statusText: Record<SupplySubmissionStatus, string> = {
  draft: "草稿",
  submitted: "待受理",
  in_review: "審核中",
  needs_revision: "已退補正",
  approved: "已核可",
  rejected: "已駁回",
  withdrawn: "已撤回",
};
const statusTone: Record<SupplySubmissionStatus, CanvasTone> = {
  draft: "neutral",
  submitted: "info",
  in_review: "accent",
  needs_revision: "warn",
  approved: "success",
  rejected: "danger",
  withdrawn: "neutral",
};
const mono = { fontFamily: theme.monoFamily, fontSize: 11.5 } as const;

export default function SupplyReviewDetailPage() {
  const client = usePlatformAdminClient();
  const params = useParams<{ submissionId: string }>();
  const submissionId = Array.isArray(params.submissionId)
    ? params.submissionId[0]
    : params.submissionId;
  const [detail, setDetail] = useState<SupplySubmissionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [reasonCode, setReasonCode] = useState("profile_clarification");
  const [comment, setComment] = useState("");
  const [mutating, setMutating] = useState<SupplyReviewAction | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const load = useCallback(async () => {
    if (!submissionId) return;
    setLoading(true);
    setFailure(null);
    try {
      setDetail(await getSupplyReviewSubmission(client, submissionId));
    } catch (error) {
      setFailure(classifySupplyReviewFailure(error));
    } finally {
      setLoading(false);
    }
  }, [client, submissionId]);
  useEffect(() => {
    void load();
  }, [load]);
  const mutate = async (action: SupplyReviewAction) => {
    if (!detail) return;
    if (
      ["request-revision", "reject"].includes(action) &&
      (!reasonCode.trim() || !comment.trim())
    ) {
      setFailure("reason_required");
      return;
    }
    setMutating(action);
    setFailure(null);
    try {
      const updated = await mutateSupplyReview(
        client,
        detail.submissionId,
        action,
        {
          expectedRevisionNo: detail.revisionNo,
          reasonCode: action === "approve" ? "all_documents_valid" : reasonCode,
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        },
      );
      setDetail(updated);
      setConfirmApprove(false);
    } catch (error) {
      setFailure(classifySupplyReviewFailure(error));
    } finally {
      setMutating(null);
    }
  };
  const actionable = detail?.status === "in_review";
  const failureMessage =
    failure === "revision_conflict"
      ? "此 submission 已被更新。請重新載入後再審；系統不允許盲蓋。"
      : failure === "incomplete"
        ? "文件或完整性檢核未通過，伺服器拒絕核可。請退回補正。"
        : failure === "forbidden"
          ? "此帳號或範圍沒有此審核動作權限，伺服器已拒絕請求。"
          : failure === "reason_required"
            ? "退回補正與駁回都必須填寫 reason code 與審核說明。"
            : "操作未完成，請重新載入後再試。";
  return (
    <div style={{ padding: 24, display: "grid", gap: 16 }}>
      <CanvasPageHeader
        title={detail ? `${detail.submissionId} · 供給審核` : "供給審核"}
        subtitle={
          detail
            ? `${detail.fleetPartnerId} · revision ${detail.revisionNo} · expectedRevisionNo=${detail.revisionNo}`
            : "讀取送件詳情"
        }
        actions={
          <>
            <Link href="/supply-review">
              <CanvasBtn>返回佇列</CanvasBtn>
            </Link>
            <CanvasBtn onClick={() => void load()} disabled={loading}>
              重新載入
            </CanvasBtn>
            {actionable ? (
              <>
                <CanvasBtn
                  variant="secondary"
                  disabled={Boolean(mutating)}
                  onClick={() => void mutate("request-revision")}
                >
                  退回補正
                </CanvasBtn>
                <CanvasBtn
                  variant="secondary"
                  danger
                  disabled={Boolean(mutating)}
                  onClick={() => void mutate("reject")}
                >
                  駁回
                </CanvasBtn>
                <CanvasBtn
                  variant="primary"
                  disabled={Boolean(mutating)}
                  onClick={() => setConfirmApprove(true)}
                >
                  核可 · provision
                </CanvasBtn>
              </>
            ) : null}
          </>
        }
      />
      {failure ? (
        <CanvasBanner
          tone="danger"
          title={
            failure === "revision_conflict"
              ? "SUBMISSION_REVISION_CONFLICT · 409"
              : "審核動作未完成"
          }
          body={failureMessage}
          actions={
            <CanvasBtn size="xs" onClick={() => void load()}>
              重新載入
            </CanvasBtn>
          }
        />
      ) : null}
      {loading ? <p>正在載入 submission…</p> : null}
      {!loading && !failure && !detail ? (
        <CanvasEmptyState
          title="找不到供給送件"
          body="送件可能已移除或目前帳號沒有存取權限。"
        />
      ) : null}
      {detail ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.6fr) minmax(280px, 1fr)",
            gap: 16,
          }}
        >
          <div style={{ display: "grid", gap: 16 }}>
            <CanvasCard
              title="逐欄位對照 · submission vs canonical"
              subtitle="後端詳情目前提供送件與核可後 canonical IDs；沒有可比較欄位時不以 fixture 補值。"
            >
              <CanvasDL
                cols={2}
                items={[
                  { k: "送件類型", v: detail.submissionType },
                  {
                    k: "狀態",
                    v: (
                      <CanvasPill tone={statusTone[detail.status]} dot>
                        {statusText[detail.status]}
                      </CanvasPill>
                    ),
                  },
                  {
                    k: "提交 subject",
                    v: (
                      <span style={mono}>
                        {detail.subjectDriverId ??
                          detail.subjectVehicleId ??
                          "新建 subject"}
                      </span>
                    ),
                  },
                  {
                    k: "canonical subject",
                    v: (
                      <span style={mono}>
                        {detail.canonicalDriverId ??
                          detail.canonicalVehicleId ??
                          "核可後回讀"}
                      </span>
                    ),
                  },
                  { k: "revision", v: detail.revisionNo },
                  { k: "更新時間", v: formatDateTime(detail.updatedAt) },
                ]}
              />
            </CanvasCard>
            <CanvasCard
              title="文件檢視 · documents"
              subtitle="文件狀態由後端完整性檢核執行；目前 detail API 未回傳文件清單。"
            >
              <CanvasBanner
                tone="info"
                body="核可時伺服器會驗證必填文件與效期。若不通過，會回傳 SUBMISSION_INCOMPLETE、DOCUMENT_REQUIRED 或 DOCUMENT_EXPIRED，且不會 provision canonical registry。"
              />
            </CanvasCard>
            <CanvasCard title="審核軌跡 · actor / reason / result">
              <CanvasDL
                cols={2}
                items={[
                  {
                    k: "提交人",
                    v: <span style={mono}>{detail.submittedBy ?? "—"}</span>,
                  },
                  {
                    k: "送審",
                    v: detail.submittedAt
                      ? formatDateTime(detail.submittedAt)
                      : "—",
                  },
                  {
                    k: "受理審核人",
                    v: (
                      <span style={mono}>{detail.reviewStartedBy ?? "—"}</span>
                    ),
                  },
                  {
                    k: "審核人",
                    v: <span style={mono}>{detail.reviewedBy ?? "—"}</span>,
                  },
                  {
                    k: "reason code",
                    v: (
                      <span style={mono}>{detail.reviewReasonCode ?? "—"}</span>
                    ),
                  },
                  { k: "comment", v: detail.reviewComment ?? "—" },
                ]}
              />
            </CanvasCard>
          </div>
          <aside style={{ display: "grid", gap: 16, alignContent: "start" }}>
            <CanvasCard
              title="審核意見 · reviewer note"
              subtitle="退補與駁回必填 reason code + comment。"
            >
              <CanvasField label="reason code">
                <select
                  value={reasonCode}
                  onChange={(event) => setReasonCode(event.target.value)}
                  disabled={!actionable}
                  style={{
                    width: "100%",
                    border: `1px solid ${theme.border}`,
                    borderRadius: 7,
                    padding: "8px 10px",
                    background: theme.bgRaised,
                    color: theme.text,
                  }}
                >
                  <option value="profile_clarification">
                    profile_clarification
                  </option>
                  <option value="document_required">document_required</option>
                  <option value="document_expired">document_expired</option>
                  <option value="other">other</option>
                </select>
              </CanvasField>
              <CanvasField label="comment">
                <input
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  disabled={!actionable}
                  placeholder="輸入給車行的審核說明…"
                  style={{
                    boxSizing: "border-box",
                    width: "100%",
                    border: `1px solid ${theme.border}`,
                    borderRadius: 7,
                    padding: "8px 10px",
                    background: theme.bgRaised,
                    color: theme.text,
                  }}
                />
              </CanvasField>
            </CanvasCard>
            <CanvasCard
              title="核可將寫入 · canonical preview"
              subtitle="approve 是唯一會 provision canonical registry 的 transition。"
            >
              <CanvasDL
                cols={1}
                items={[
                  {
                    k: "driver",
                    v: (
                      <span style={mono}>
                        {detail.canonicalDriverId ?? "核可後建立／更新"}
                      </span>
                    ),
                  },
                  {
                    k: "vehicle",
                    v: (
                      <span style={mono}>
                        {detail.canonicalVehicleId ?? "核可後建立／更新"}
                      </span>
                    ),
                  },
                  {
                    k: "contract / policy",
                    v: (
                      <span style={mono}>
                        {detail.canonicalContractId ??
                          detail.canonicalPolicyId ??
                          "依 submission 類型 provision"}
                      </span>
                    ),
                  },
                  { k: "readiness", v: "核可後以後端結果回讀" },
                ]}
              />
              <div style={{ marginTop: 12 }}>
                <CanvasBanner
                  tone="warn"
                  body="確認核可會在單一交易內 provision canonical registry、affiliation、readiness 與 audit；退補或駁回不會 provision。"
                />
              </div>
            </CanvasCard>
            {detail.status === "approved" ? (
              <CanvasCard title="核可收據 · audit receipt">
                <CanvasBanner
                  tone="success"
                  body="已核可。此畫面顯示後端回讀的 canonical IDs；如需 readiness 詳情，請從受影響 fleet partner 的 readiness read model 查閱。"
                />
              </CanvasCard>
            ) : null}
          </aside>
        </div>
      ) : null}
      {confirmApprove && detail ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            border: `1px solid ${theme.accentBorder}`,
            background: theme.surface,
            padding: 20,
            borderRadius: 10,
            boxShadow: theme.shadow,
          }}
        >
          <h2 style={{ marginTop: 0 }}>確認核可並寫入 canonical？</h2>
          <p>
            此動作將在單一交易內 provision canonical
            registry、affiliation、readiness 與
            audit。核可後不可用退補或駁回取代。
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <CanvasBtn
              onClick={() => setConfirmApprove(false)}
              disabled={Boolean(mutating)}
            >
              取消
            </CanvasBtn>
            <CanvasBtn
              variant="primary"
              onClick={() => void mutate("approve")}
              disabled={Boolean(mutating)}
            >
              {mutating === "approve" ? "核可中…" : "確認核可 · provision"}
            </CanvasBtn>
          </div>
        </div>
      ) : null}
    </div>
  );
}
