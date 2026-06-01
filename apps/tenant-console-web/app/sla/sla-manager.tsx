"use client";

import type { CSSProperties } from "react";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  ActionReceipt,
  EmptyStateEnvelope,
  RefreshTier,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  buildCanvasTheme,
} from "@drts/ui-web";
import {
  recalculateTenantSlaBookingsAction,
  updateTenantSlaProfileAction,
} from "./actions";

type SlaSnapshot = {
  waitThresholdMin: number;
  arrivalThresholdMin: number;
  completionThresholdMin: number;
  updatedAt: string;
};

type LinkItem = {
  href: string;
  label: string;
};

type CrossAppLinkItem = {
  href: string;
  label: string;
};

type EmptyStateConfig = {
  reason: EmptyStateEnvelope["reason"];
  title: string;
  body: string;
  tone: "warn" | "danger" | "info" | "success" | "accent";
};

type TenantSlaEmptyReason = EmptyStateEnvelope["reason"];

type SlaManagerProps = {
  profile: SlaSnapshot | null;
  updatedBy: string | null;
  lastRecalculationAt: string | null;
  availableActions: ResourceActionDescriptor[];
  emptyState: EmptyStateEnvelope | null;
  refreshTier: RefreshTier | null;
  refreshMetadata: UiRefreshMetadata | null;
  loadErrorMessage: string | null;
  links: LinkItem[];
  crossAppLinks: CrossAppLinkItem[];
};

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.45fr) minmax(280px, 1fr)",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
};

const nativeInputStyle: CSSProperties = {
  width: "100%",
  background: th.bgRaised,
  border: `1px solid ${th.border}`,
  borderRadius: 7,
  padding: "8px 10px",
  fontSize: 12.5,
  color: th.text,
  outline: "none",
  fontFamily: th.monoFamily,
  boxSizing: "border-box",
};

const nativeTextAreaStyle: CSSProperties = {
  ...nativeInputStyle,
  minHeight: 86,
  resize: "vertical",
  fontFamily: th.fontFamily,
  lineHeight: 1.45,
};

const footerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginTop: 14,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const noteStyle: CSSProperties = {
  fontSize: 11.5,
  color: th.textMuted,
  lineHeight: 1.5,
};

const emptyStateStyle: CSSProperties = {
  padding: "36px 28px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  alignItems: "flex-start",
};

const linkRowStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const linkStyle: CSSProperties = {
  color: th.accent,
  fontSize: 12.5,
  textDecoration: "none",
};

const summaryListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const summaryLabelStyle: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: th.textMuted,
};

const summaryValueStyle: CSSProperties = {
  fontFamily: th.monoFamily,
  fontSize: 12.5,
  color: th.text,
};

const emptyActionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "12px 14px",
  borderRadius: 10,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  maxWidth: 420,
};

const actionHintStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  marginTop: 12,
};

const EMPTY_STATE_CONFIG: Record<TenantSlaEmptyReason, EmptyStateConfig> = {
  no_data: {
    reason: "no_data",
    title: "尚無 SLA 資料",
    body: "租戶尚未寫入任何 SLA threshold。先建立初始 wait / arrival / completion 分鐘門檻。",
    tone: "info",
  },
  not_provisioned: {
    reason: "not_provisioned",
    title: "SLA profile 尚未 provision",
    body: "此租戶還沒有 SLA profile。完成初始設定後，整合治理頁才會把 SLA 標為 ready。",
    tone: "warn",
  },
  fetch_failed: {
    reason: "fetch_failed",
    title: "SLA profile 讀取失敗",
    body: "目前無法取得 SLA profile。重新整理後若仍失敗，請查看 audit / integration governance 追查 request。",
    tone: "danger",
  },
  permission_denied: {
    reason: "permission_denied",
    title: "沒有權限變更 SLA",
    body: "只有 tenant admin 可維護 SLA profile。若你是只讀角色，請聯絡租戶管理員代為更新。",
    tone: "warn",
  },
  external_unavailable: {
    reason: "external_unavailable",
    title: "SLA 依賴服務暫時不可用",
    body: "SLA profile 目前受外部計算或同步服務影響而不可用。請稍後重試並留意平台公告。",
    tone: "danger",
  },
  driver_not_eligible: {
    reason: "driver_not_eligible",
    title: "資料狀態不適用於租戶主控台",
    body: "後端回傳了 driver-app 專用的 empty reason。此 SLA profile 應由後端改正 tenant-scoped 狀態後再顯示。",
    tone: "danger",
  },
  filtered_empty: {
    reason: "filtered_empty",
    title: "目前篩選條件下沒有結果",
    body: "目前套用的 preview state 不會顯示 SLA profile。本頁保留 distinct empty-state render 以符合 Q-X15。",
    tone: "info",
  },
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(parsed)
    .replace(",", "");
}

function getAction(
  actions: ResourceActionDescriptor[],
  expectedAction: string,
) {
  return actions.find((action) => action.action === expectedAction) ?? null;
}

function disabledReasonLabel(reason: string | undefined) {
  if (!reason) return "Unavailable";
  return reason.replaceAll("_", " ");
}

function actionLabel(action: string) {
  switch (action) {
    case "update_sla_profile":
    case "save":
      return "儲存設定";
    case "recalculate_sla_bookings":
    case "recalculate":
      return "重算既有訂單";
    default:
      return action.replaceAll("_", " ");
  }
}

function buildFeedback(payload: {
  tone: "success" | "danger" | "warn" | "info";
  title: string;
  message: string;
  receipt?: ActionReceipt;
}) {
  return payload.receipt
    ? payload
    : {
        tone: payload.tone,
        title: payload.title,
        message: payload.message,
      };
}

const REFRESH_TIER_LABEL: Record<RefreshTier, string> = {
  urgent: "即時推播 · 5s 後援輪詢",
  fast: "3s 自動更新",
  dispatch: "5s 自動更新",
  medium: "15s 自動更新",
  medium_slow: "30s 自動更新",
  slow: "30s 自動更新",
  manual: "手動更新",
};

function formatActionCaption(action: ResourceActionDescriptor) {
  if (action.enabled) return `${actionLabel(action.action)} 可直接執行`;
  return `${actionLabel(action.action)} 目前不可執行：${disabledReasonLabel(action.disabledReasonCode)}`;
}

function buildAuditHref(receipt: ActionReceipt) {
  return `/audit?auditId=${encodeURIComponent(receipt.auditId)}`;
}

export function SlaManager({
  profile,
  updatedBy,
  lastRecalculationAt,
  availableActions,
  emptyState,
  refreshTier,
  refreshMetadata,
  loadErrorMessage,
  links,
  crossAppLinks,
}: SlaManagerProps) {
  const router = useRouter();
  const [waitThresholdMin, setWaitThresholdMin] = useState(
    profile?.waitThresholdMin ? String(profile.waitThresholdMin) : "",
  );
  const [arrivalThresholdMin, setArrivalThresholdMin] = useState(
    profile?.arrivalThresholdMin ? String(profile.arrivalThresholdMin) : "",
  );
  const [completionThresholdMin, setCompletionThresholdMin] = useState(
    profile?.completionThresholdMin
      ? String(profile.completionThresholdMin)
      : "",
  );
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<{
    tone: "success" | "danger" | "warn" | "info";
    title: string;
    message: string;
    receipt?: ActionReceipt;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const updateAction = getAction(availableActions, "update_sla_profile");
  const recalcAction = getAction(availableActions, "recalculate_sla_bookings");
  const activeEmptyState = emptyState
    ? EMPTY_STATE_CONFIG[emptyState.reason]
    : null;
  const showEditor = Boolean(profile) || Boolean(updateAction);
  const reasonRequired = Boolean(
    updateAction?.requiresReason || recalcAction?.requiresReason,
  );
  const refreshMetadataAvailable = Boolean(
    refreshTier && refreshMetadata?.generatedAt,
  );

  const handleUpdate = () => {
    startTransition(async () => {
      try {
        const result = await updateTenantSlaProfileAction({
          waitThresholdMin: Number(waitThresholdMin),
          arrivalThresholdMin: Number(arrivalThresholdMin),
          completionThresholdMin: Number(completionThresholdMin),
          reason,
        });
        setFeedback(
          result.receipt
            ? buildFeedback({
                tone: "success",
                title: "SLA 已更新",
                message: result.message,
                receipt: result.receipt,
              })
            : buildFeedback({
                tone: "success",
                title: "SLA 已更新",
                message: result.message,
              }),
        );
        setReason("");
        router.refresh();
      } catch (error) {
        setFeedback({
          tone: "danger",
          title: "操作失敗",
          message:
            error instanceof Error ? error.message : "SLA update failed.",
        });
      }
    });
  };

  const handleRecalculate = () => {
    startTransition(async () => {
      try {
        const result = await recalculateTenantSlaBookingsAction(reason);
        setFeedback(
          result.receipt
            ? buildFeedback({
                tone: "info",
                title:
                  result.receipt.status === "accepted"
                    ? "重算已受理"
                    : "重算已送出",
                message: result.message,
                receipt: result.receipt,
              })
            : buildFeedback({
                tone: "info",
                title: "重算已送出",
                message: result.message,
              }),
        );
        setReason("");
        router.refresh();
      } catch (error) {
        setFeedback({
          tone: "danger",
          title: "操作失敗",
          message:
            error instanceof Error
              ? error.message
              : "SLA recalculation request failed.",
        });
      }
    });
  };

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="SLA Profile"
        subtitle="wait · arrival · completion 三個門檻 · 單位 = 分鐘"
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <CanvasPill theme={th} tone="accent">
              refresh tier · T5 / {refreshTier ?? "—"}
            </CanvasPill>
            {refreshMetadataAvailable ? (
              <CanvasPill
                theme={th}
                tone={
                  refreshMetadata!.dataFreshness === "fresh"
                    ? "success"
                    : "warn"
                }
              >
                freshness · {refreshMetadata!.dataFreshness}
              </CanvasPill>
            ) : null}
          </div>
        }
      />

      <div style={pageBodyStyle}>
        {feedback ? (
          <CanvasBanner
            theme={th}
            tone={feedback.tone}
            title={feedback.title}
            body={feedback.message}
          />
        ) : null}

        {feedback?.receipt ? (
          <CanvasCard theme={th} title="Write receipt">
            <CanvasDL
              theme={th}
              cols={1}
              items={[
                { k: "status", v: feedback.receipt.status, mono: true },
                { k: "actionId", v: feedback.receipt.actionId, mono: true },
                { k: "auditId", v: feedback.receipt.auditId, mono: true },
                { k: "resource", v: feedback.receipt.resourceId, mono: true },
              ]}
            />
            <div style={{ height: 12 }} />
            <Link href={buildAuditHref(feedback.receipt)} style={linkStyle}>
              查看對應 audit →
            </Link>
          </CanvasCard>
        ) : null}

        {lastRecalculationAt ? (
          <CanvasBanner
            theme={th}
            tone="info"
            title="既有訂單重算進行中"
            body={`最近一次重算請求於 ${formatDateTime(lastRecalculationAt)} 送出。既有訂單會保留建立時 snapshot，直到重算完成。`}
          />
        ) : null}

        {refreshMetadataAvailable ? (
          <CanvasBanner
            theme={th}
            tone="info"
            title={`Refresh cadence · ${REFRESH_TIER_LABEL[refreshTier!]}`}
            body={`metadata source=${refreshMetadata!.source} · generatedAt=${formatDateTime(
              refreshMetadata!.generatedAt,
            )} · staleAfterMs=${refreshMetadata!.staleAfterMs}`}
          />
        ) : null}

        {activeEmptyState && !showEditor ? (
          <CanvasCard theme={th}>
            <div style={emptyStateStyle}>
              <CanvasPill theme={th} tone={activeEmptyState.tone}>
                {activeEmptyState.reason}
              </CanvasPill>
              <div style={{ fontSize: 18, fontWeight: 600 }}>
                {activeEmptyState.title}
              </div>
              <div style={{ ...noteStyle, maxWidth: 560 }}>
                {activeEmptyState.body}
              </div>
              <div style={noteStyle}>
                messageCode · {emptyState?.messageCode ?? "—"}
              </div>
              {emptyState?.nextAction ? (
                <div style={emptyActionStyle}>
                  <div style={summaryLabelStyle}>recommended action</div>
                  <div style={summaryValueStyle}>
                    {actionLabel(emptyState.nextAction.action)}
                  </div>
                  <div style={noteStyle}>
                    {formatActionCaption(emptyState.nextAction)}
                  </div>
                </div>
              ) : null}
              <div style={linkRowStyle}>
                {links.map((link) => (
                  <Link key={link.href} href={link.href} style={linkStyle}>
                    {link.label} →
                  </Link>
                ))}
                {crossAppLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    style={linkStyle}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {link.label} ↗
                  </a>
                ))}
              </div>
            </div>
          </CanvasCard>
        ) : (
          <div style={gridStyle}>
            <CanvasCard
              theme={th}
              title="當前門檻 · waitThresholdMin / arrivalThresholdMin / completionThresholdMin"
            >
              {activeEmptyState ? (
                <CanvasBanner
                  theme={th}
                  tone={activeEmptyState.tone}
                  title={activeEmptyState.title}
                  body={`${activeEmptyState.body}${emptyState?.nextAction ? ` 建議動作：${actionLabel(emptyState.nextAction.action)}。` : ""}${loadErrorMessage ? ` 錯誤訊息：${loadErrorMessage}` : ""}`}
                />
              ) : null}

              <CanvasBanner
                theme={th}
                tone="info"
                title="變更影響範圍 · Q-TEN07"
                body="Threshold changes affect new bookings and newly computed SLA events. Existing bookings keep SLA profile snapshot at creation unless explicitly recalculated by admin command."
              />

              <div style={{ height: 14 }} />

              <div style={kpiGridStyle}>
                <CanvasField
                  theme={th}
                  label="waitThresholdMin · 等候門檻"
                  hint="超過此分鐘數標記為 wait 違規"
                >
                  <input
                    value={waitThresholdMin}
                    onChange={(event) =>
                      setWaitThresholdMin(event.target.value)
                    }
                    inputMode="numeric"
                    style={nativeInputStyle}
                    aria-label="waitThresholdMin"
                    disabled={isPending || !updateAction?.enabled}
                    placeholder="分鐘"
                  />
                </CanvasField>
                <CanvasField
                  theme={th}
                  label="arrivalThresholdMin · 抵達門檻"
                  hint="ETA 與實際抵達差異上限"
                >
                  <input
                    value={arrivalThresholdMin}
                    onChange={(event) =>
                      setArrivalThresholdMin(event.target.value)
                    }
                    inputMode="numeric"
                    style={nativeInputStyle}
                    aria-label="arrivalThresholdMin"
                    disabled={isPending || !updateAction?.enabled}
                    placeholder="分鐘"
                  />
                </CanvasField>
                <CanvasField
                  theme={th}
                  label="completionThresholdMin · 完成門檻"
                  hint="預估 vs 實際行車時間差異上限"
                >
                  <input
                    value={completionThresholdMin}
                    onChange={(event) =>
                      setCompletionThresholdMin(event.target.value)
                    }
                    inputMode="numeric"
                    style={nativeInputStyle}
                    aria-label="completionThresholdMin"
                    disabled={isPending || !updateAction?.enabled}
                    placeholder="分鐘"
                  />
                </CanvasField>
              </div>

              <div style={{ marginTop: 14 }}>
                <CanvasField
                  theme={th}
                  label="變更原因"
                  hint="High-risk actions require a non-empty reason for audit."
                >
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    style={nativeTextAreaStyle}
                    disabled={isPending || (!updateAction && !recalcAction)}
                    aria-label="reason"
                    placeholder={
                      reasonRequired
                        ? "請填寫操作原因，會寫入 audit trail"
                        : undefined
                    }
                  />
                </CanvasField>
              </div>

              <div style={footerStyle}>
                <div style={noteStyle}>
                  {updateAction || recalcAction
                    ? `availableActions 決定 CTA 顯示；${reasonRequired ? "目前可執行動作需要 reason，送出後會刷新本頁與相關 deep links。" : "送出後會刷新本頁與相關 deep links。"}`
                    : "目前 API 沒有回傳可操作的 SLA 動作。"}
                  {emptyState?.nextAction ? (
                    <div style={actionHintStyle}>
                      <span>
                        emptyState.nextAction ·{" "}
                        {actionLabel(emptyState.nextAction.action)}
                      </span>
                      <span>{formatActionCaption(emptyState.nextAction)}</span>
                    </div>
                  ) : null}
                </div>
                <div style={actionRowStyle}>
                  {recalcAction ? (
                    <CanvasBtn
                      theme={th}
                      onClick={handleRecalculate}
                      disabled={isPending || !recalcAction.enabled}
                    >
                      {recalcAction.enabled
                        ? "重算既有訂單"
                        : `重算既有訂單 · ${disabledReasonLabel(
                            recalcAction.disabledReasonCode,
                          )}`}
                    </CanvasBtn>
                  ) : null}
                  {updateAction ? (
                    <CanvasBtn
                      theme={th}
                      variant="primary"
                      onClick={handleUpdate}
                      disabled={isPending || !updateAction.enabled}
                    >
                      {updateAction.enabled
                        ? "儲存設定"
                        : `儲存設定 · ${disabledReasonLabel(
                            updateAction.disabledReasonCode,
                          )}`}
                    </CanvasBtn>
                  ) : null}
                </div>
              </div>
            </CanvasCard>

            <CanvasCard theme={th} title="治理摘要 · 更新人 / 深連結 / 進度">
              <div style={summaryListStyle}>
                <div>
                  <div style={summaryLabelStyle}>updatedAt</div>
                  <div style={summaryValueStyle}>
                    {formatDateTime(profile?.updatedAt)}
                  </div>
                </div>
                <div>
                  <div style={summaryLabelStyle}>updated by</div>
                  <div style={summaryValueStyle}>{updatedBy ?? "—"}</div>
                </div>
                <div>
                  <div style={summaryLabelStyle}>recalculation</div>
                  <div style={summaryValueStyle}>
                    {lastRecalculationAt
                      ? `pending since ${formatDateTime(lastRecalculationAt)}`
                      : "idle"}
                  </div>
                </div>
              </div>

              <div style={{ height: 16 }} />

              <CanvasDL
                theme={th}
                cols={1}
                items={[
                  {
                    k: "waitThresholdMin",
                    v: profile ? `${profile.waitThresholdMin} min` : "—",
                    mono: true,
                  },
                  {
                    k: "arrivalThresholdMin",
                    v: profile ? `${profile.arrivalThresholdMin} min` : "—",
                    mono: true,
                  },
                  {
                    k: "completionThresholdMin",
                    v: profile ? `${profile.completionThresholdMin} min` : "—",
                    mono: true,
                  },
                ]}
              />

              <div style={{ height: 16 }} />

              <div style={linkRowStyle}>
                {links.map((link) => (
                  <Link key={link.href} href={link.href} style={linkStyle}>
                    {link.label} →
                  </Link>
                ))}
                {crossAppLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    style={linkStyle}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {link.label} ↗
                  </a>
                ))}
              </div>
            </CanvasCard>
          </div>
        )}
      </div>
    </div>
  );
}
