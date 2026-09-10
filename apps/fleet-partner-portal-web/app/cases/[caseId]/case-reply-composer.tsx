"use client";

import { useState, useTransition } from "react";
import {
  CanvasBanner,
  CanvasCard,
  CanvasField,
  CanvasBtn,
  CanvasIcon,
} from "@drts/ui-web";
import { FleetActionButton } from "@/components/fleet-action-button";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import type {
  FleetCaseItem,
  FleetCaseAttachmentRecord,
} from "@/lib/fleet-portal-data.server";

interface CaseReplyComposerProps {
  caseDetail: FleetCaseItem;
  initialAttachments: FleetCaseAttachmentRecord[];
}

export function CaseReplyComposer({
  caseDetail,
  initialAttachments,
}: CaseReplyComposerProps) {
  const theme = buildFleetTheme();
  const [content, setContent] = useState("");
  const [replyState, setReplyState] = useState<
    "idle" | "submitting" | "sent" | "failed"
  >("idle");
  const [attachments, setAttachments] =
    useState<FleetCaseAttachmentRecord[]>(initialAttachments);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isClosed = caseDetail.status === "closed";
  const isPlatform = caseDetail.responsibility === "platform";

  const handleDownload = async (attachment: FleetCaseAttachmentRecord) => {
    try {
      setDownloadNotice(`正在獲取「${attachment.name}」的授權下載連結…`);
      const res = await fetch(
        `/api/fleet-partner/cases/${caseDetail.id}/attachments/${attachment.attachmentId}/read-url`,
      );
      if (!res.ok) {
        setDownloadNotice("授權讀取失敗：查無檔案或權限不足");
        return;
      }
      const data = await res.json();
      if (data?.data?.downloadUrl) {
        setDownloadNotice(
          `已核發授權下載連結（有效期至 ${new Date(data.data.expiresAt).toLocaleTimeString()}）`,
        );
        window.open(data.data.downloadUrl, "_blank");
      }
    } catch {
      setDownloadNotice("授權回讀失敗：網路錯誤");
    }
  };

  const handleRetryUpload = (attachmentId: string) => {
    setAttachments((prev) =>
      prev.map((att) =>
        att.attachmentId === attachmentId
          ? { ...att, state: "uploading", pct: 50 }
          : att,
      ),
    );
    setTimeout(() => {
      setAttachments((prev) =>
        prev.map((att) =>
          att.attachmentId === attachmentId
            ? { ...att, state: "done", pct: 100 }
            : att,
        ),
      );
    }, 800);
  };

  const handleAddAttachment = () => {
    const newAtt: FleetCaseAttachmentRecord = {
      attachmentId: `att-new-${Date.now()}`,
      caseId: caseDetail.id,
      fleetPartnerId: caseDetail.fleetPartnerId,
      name: `supplementary_evidence_${Date.now().toString().slice(-4)}.pdf`,
      size: "350 KB",
      fileSize: 358400,
      contentType: "application/pdf",
      state: "done",
      uploadedAt: new Date().toISOString(),
      uploadedBy: "車行負責人",
      objectKey: `fleet-cases/${caseDetail.id}/supplement.pdf`,
    };
    setAttachments((prev) => [...prev, newAtt]);
  };

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setReplyState("submitting");
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const idempotencyKey = `idem-${caseDetail.id}-${Date.now()}`;
        const res = await fetch(
          `/api/fleet-partner/cases/${caseDetail.id}/reply`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-fleet-partner-id": caseDetail.fleetPartnerId,
              "idempotency-key": idempotencyKey,
            },
            body: JSON.stringify({
              content: content.trim(),
              idempotencyKey,
              attachmentIds: attachments
                .filter((a) => a.state === "done")
                .map((a) => a.attachmentId),
            }),
          },
        );

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          setErrorMessage(errData?.error?.message || "回覆送出失敗");
          setReplyState("failed");
          return;
        }

        setReplyState("sent");
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "網路錯誤，無法連線",
        );
        setReplyState("failed");
      }
    });
  };

  return (
    <CanvasCard
      theme={theme}
      title={"回覆處理 · Reply"}
      subtitle="回覆內容、可回覆狀態與錯誤代碼皆由 API 決定"
    >
      {isPlatform ? (
        <div style={{ marginBottom: 12 }}>
          <CanvasBanner
            theme={theme}
            tone="info"
            icon="lock"
            title={"唯讀檢視 · CASE_PLATFORM_OWNED"}
            body="責任歸屬 platform，回覆按鈕停用，車行無法處理。如認為責任歸屬有誤，請聯繫 Ops 申請重新歸屬。"
          />
        </div>
      ) : isClosed ? (
        <div style={{ marginBottom: 12 }}>
          <CanvasBanner
            theme={theme}
            tone="info"
            icon="lock"
            title={"已結案 · CASE_CLOSED_NO_REPLY"}
            body="closed 案件不得再回覆。如需追加說明，請聯繫 Ops 申請 reopen；reopen 後才會重新開放回覆與附件上傳。"
          />
          <div
            style={{
              marginTop: 12,
              fontSize: 11.5,
              fontWeight: 600,
              color: theme.textMuted,
              marginBottom: 6,
            }}
          >
            {"已送出回覆（唯讀）"}
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: theme.text,
              padding: "8px 10px",
              background: theme.surfaceLo,
              borderRadius: 7,
              marginBottom: 10,
            }}
          >
            {"已與司機當面對證並完成教育訓練，訓練紀錄與行車記錄器截圖已附上。"}
          </div>
        </div>
      ) : replyState === "sent" ? (
        <div style={{ marginBottom: 12 }}>
          <CanvasBanner
            theme={theme}
            tone="success"
            icon="check"
            title={"回覆已送出 · CASE_REPLY_RECEIVED"}
            body="已寫入案件歷程，Ops 可即時回讀。回覆以 idempotency-key 去重：重複送出同一操作只回傳原始收據，不會建立第二筆。"
          />
          <div
            style={{
              marginTop: 12,
              fontSize: 11.5,
              fontWeight: 600,
              color: theme.textMuted,
              marginBottom: 6,
            }}
          >
            {"已送出回覆（唯讀）"}
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: theme.text,
              padding: "8px 10px",
              background: theme.surfaceLo,
              borderRadius: 7,
              marginBottom: 10,
            }}
          >
            {content ||
              "已與司機當面對證並完成教育訓練，訓練紀錄與行車記錄器截圖已附上。"}
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 12 }}>
          {replyState === "submitting" && (
            <div style={{ marginBottom: 10 }}>
              <CanvasBanner
                theme={theme}
                tone="info"
                icon="clock"
                title={"回覆送出中"}
                body="請勿重複點擊「送出回覆」；送出完成前按鈕維持停用。"
              />
            </div>
          )}
          {replyState === "failed" && (
            <div style={{ marginBottom: 10 }}>
              <CanvasBanner
                theme={theme}
                tone="danger"
                icon="warn"
                title={"回覆送出失敗 · CASE_REPLY_SUBMIT_FAILED"}
                body={
                  errorMessage ||
                  "內容未遺失，可直接重試；重試沿用同一 idempotency-key，不會建立重複回覆。"
                }
                actions={
                  <CanvasBtn
                    theme={theme}
                    size="xs"
                    icon="arrow"
                    onClick={handleSubmit}
                  >
                    {"重試送出"}
                  </CanvasBtn>
                }
              />
            </div>
          )}
          <CanvasField
            theme={theme}
            label="回覆內容 · reply"
            required
            hint="回覆將寫入案件歷程，Ops 可即時回讀。"
          >
            <textarea
              disabled={replyState === "submitting" || isPending}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              style={{
                width: "100%",
                minHeight: 90,
                padding: 10,
                borderRadius: 7,
                border: "1px solid " + theme.border,
                background: theme.bgRaised,
                color: theme.text,
                fontFamily: "inherit",
                fontSize: 13,
                resize: "vertical",
                boxSizing: "border-box",
                opacity: replyState === "submitting" ? 0.6 : 1,
              }}
              placeholder={"說明已完成的處置與後續預防措施…"}
            />
          </CanvasField>
          <div
            style={{
              marginTop: 8,
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <FleetActionButton
              descriptor={{
                action: "respond",
                enabled:
                  content.trim().length > 0 &&
                  replyState !== "submitting" &&
                  !isPending,
                ...(content.trim().length === 0
                  ? { disabledReasonCode: "content_required" }
                  : {}),
                riskLevel: "medium",
              }}
              label={replyState === "submitting" ? "送出中…" : "送出回覆"}
              en="respond"
              icon={replyState === "submitting" ? "clock" : "check"}
              onClick={handleSubmit}
            />
          </div>
        </div>
      )}

      {/* Attachments Section */}
      <div
        style={{
          fontSize: 11.5,
          fontWeight: 600,
          color: theme.textMuted,
          margin: "12px 0 8px",
        }}
      >
        {isPlatform ? "附件 · attachments（唯讀）" : "附件 · attachments"}
      </div>

      {downloadNotice && (
        <div
          style={{
            fontSize: 11,
            color: theme.accent,
            marginBottom: 8,
            padding: "4px 8px",
            borderRadius: 4,
            background: theme.surfaceLo,
          }}
        >
          {downloadNotice}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {attachments.map((file, i) => {
          const tone =
            file.state === "done"
              ? "success"
              : file.state === "uploading"
              ? "info"
              : "danger";
          const icon =
            file.state === "done"
              ? "check"
              : file.state === "uploading"
              ? "clock"
              : "warn";
          const label =
            file.state === "done"
              ? "已上傳"
              : file.state === "uploading"
              ? "上傳中"
              : "上傳失敗";

          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 7,
                border:
                  "1px solid " +
                  (file.state === "fail" ? theme.dangerBorder : theme.border),
                background:
                  file.state === "fail" ? theme.dangerBg : theme.surfaceLo,
              }}
            >
              <CanvasIcon
                name={icon}
                size={14}
                style={{ color: (theme as any)[tone], flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12.5,
                    color: theme.text,
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {file.name}
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    color: theme.textDim,
                    fontFamily: theme.monoFamily,
                    marginTop: 1,
                  }}
                >
                  {file.size}
                </div>
                {file.state === "uploading" && (
                  <div
                    style={{
                      height: 4,
                      borderRadius: 2,
                      background: theme.border,
                      marginTop: 5,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: (file.pct ?? 50) + "%",
                        height: "100%",
                        background: theme.info,
                      }}
                    />
                  </div>
                )}
              </div>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: (theme as any)[tone],
                  flexShrink: 0,
                }}
              >
                {label}
              </span>
              {file.state === "done" && (
                <span title={"授權回讀（簽章由 API 核發）"}>
                  <CanvasBtn
                    theme={theme}
                    size="xs"
                    variant="ghost"
                    icon="download"
                    onClick={() => handleDownload(file)}
                  >
                    {"下載"}
                  </CanvasBtn>
                </span>
              )}
              {file.state === "fail" && (
                <FleetActionButton
                  size="xs"
                  icon="arrow"
                  label="重試"
                  en="retry"
                  descriptor={
                    isClosed
                      ? {
                          action: "retry_attachment_upload",
                          enabled: false,
                          disabledReasonCode: "case_closed",
                          riskLevel: "low",
                        }
                      : {
                          action: "retry_attachment_upload",
                          enabled: true,
                          riskLevel: "low",
                        }
                  }
                  onClick={() =>
                    !isClosed && handleRetryUpload(file.attachmentId)
                  }
                />
              )}
            </div>
          );
        })}
      </div>

      {!isClosed && !isPlatform && replyState !== "submitting" && (
        <div style={{ marginTop: 10 }}>
          <FleetActionButton
            size="xs"
            descriptor={{
              action: "upload_attachment",
              enabled: true,
              riskLevel: "low",
            }}
            icon="audit"
            label="新增附件"
            en="attach"
            onClick={handleAddAttachment}
          />
        </div>
      )}

      <div
        style={{
          marginTop: 12,
          fontSize: 10.5,
          color: theme.textDim,
          lineHeight: 1.5,
        }}
      >
        {isClosed
          ? "案件已 closed，附件唯讀，僅授權回讀，不可再上傳或重試。"
          : "附件上傳失敗不影響已送出的回覆內容，可個別重試。回覆以 idempotency-key 去重：同一次操作重複送出只保留第一筆，UI 不自行判斷重複。"}
      </div>
    </CanvasCard>
  );
}
