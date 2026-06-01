"use client";

import type { CSSProperties } from "react";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  ActionReceipt,
  EmptyStateEnvelope,
  RefreshTier,
  ResourceActionDescriptor,
  TenantSlaProfileView,
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

type LinkItem = {
  href: string;
  label: string;
};

type CrossAppLinkItem = {
  href: string;
  label: string;
};

type EmptyStateConfig = {
  reason: TenantSlaEmptyReason;
  title: string;
  body: string;
  tone: "warn" | "danger" | "info" | "success" | "accent";
};

type TenantSlaEmptyReason = Exclude<
  EmptyStateEnvelope["reason"],
  "driver_not_eligible"
>;

type SlaManagerProps = {
  view: TenantSlaProfileView | null;
  loadErrorMessage: string | null;
  links: LinkItem[];
  crossAppLinks: CrossAppLinkItem[];
};

const th = buildCanvasTheme({
  surface: "tenant",
  dark: false,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  maxWidth: 1180,
  margin: "0 auto",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.45fr) minmax(280px, 1fr)",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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
  padding: "32px 28px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  alignItems: "flex-start",
};

const emptyStateHeroStyle: CSSProperties = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "minmax(0, 132px) minmax(0, 1fr)",
  gap: 20,
  alignItems: "center",
};

const emptyStateBadgeStyle: CSSProperties = {
  minHeight: 132,
  borderRadius: 24,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 34,
  fontWeight: 700,
  letterSpacing: 1.6,
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

const sectionStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const summaryCardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 18,
};

const statListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const statRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  paddingBottom: 10,
  borderBottom: `1px solid ${th.border}`,
};

const statKeyStyle: CSSProperties = {
  fontSize: 12,
  color: th.textMuted,
};

const statValueStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: th.text,
  fontFamily: th.monoFamily,
  textAlign: "right",
};

const inputShellStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const inputMetaStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  fontSize: 11,
  color: th.textMuted,
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
  filtered_empty: {
    reason: "filtered_empty",
    title: "目前篩選條件下沒有結果",
    body: "目前套用的 preview state 不會顯示 SLA profile。本頁保留 distinct empty-state render 以符合 Q-X15。",
    tone: "info",
  },
};

const EMPTY_STATE_MONOGRAM: Record<TenantSlaEmptyReason, string> = {
  no_data: "ND",
  not_provisioned: "NP",
  fetch_failed: "FF",
  permission_denied: "PD",
  external_unavailable: "EU",
  filtered_empty: "FE",
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
      return "儲存設定";
    case "recalculate_sla_bookings":
      return "重算既有訂單";
    default:
      return action.replaceAll("_", " ");
  }
}

const REFRESH_TIER_CODE: Record<RefreshTier, string> = {
  urgent: "T0",
  fast: "T1",
  dispatch: "T2",
  medium: "T3",
  medium_slow: "T4",
  slow: "T5",
  manual: "T6",
};

const REFRESH_TIER_LABEL: Record<RefreshTier, string> = {
  urgent: "即時推播 · 5s 後援輪詢",
  fast: "3s 自動更新",
  dispatch: "5s 自動更新",
  medium: "15s 自動更新",
  medium_slow: "30s 自動更新",
  slow: "30s 自動更新",
  manual: "手動更新",
};

const REFRESH_TIER_INTERVAL_MS: Record<RefreshTier, number | null> = {
  urgent: 5000,
  fast: 3000,
  dispatch: 5000,
  medium: 15000,
  medium_slow: 30000,
  slow: 30000,
  manual: null,
};

function formatActionCaption(action: ResourceActionDescriptor) {
  if (action.enabled) return `${actionLabel(action.action)} 可直接執行`;
  return `${actionLabel(action.action)} 目前不可執行：${disabledReasonLabel(action.disabledReasonCode)}`;
}

function buildAuditHref(receipt: ActionReceipt) {
  return `/audit?auditId=${encodeURIComponent(receipt.auditId)}`;
}

function formatThresholdInput(value: number | null | undefined) {
  return typeof value === "number" ? String(value) : "";
}

function getActiveEmptyState(
  emptyState: EmptyStateEnvelope | null,
  loadErrorMessage: string | null,
) {
  if (emptyState?.reason && emptyState.reason in EMPTY_STATE_CONFIG) {
    return EMPTY_STATE_CONFIG[emptyState.reason as TenantSlaEmptyReason];
  }
  if (!emptyState && loadErrorMessage) {
    return EMPTY_STATE_CONFIG.fetch_failed;
  }
  return null;
}

function getRefreshTone(metadata: UiRefreshMetadata | null) {
  switch (metadata?.dataFreshness) {
    case "fresh":
      return "success";
    case "stale":
      return "warn";
    case "degraded":
    case "unknown":
      return "danger";
    default:
      return "accent";
  }
}

function getRefreshDeadline(metadata: UiRefreshMetadata | null) {
  if (!metadata) return null;
  const generatedAt = new Date(metadata.generatedAt).getTime();
  if (Number.isNaN(generatedAt)) return null;
  return generatedAt + metadata.staleAfterMs;
}

function getReceiptTone(receipt: ActionReceipt) {
  switch (receipt.status) {
    case "completed":
      return "success";
    case "failed":
      return "danger";
    default:
      return "info";
  }
}

function parseThresholdValue(
  value: string,
  fieldLabel: string,
): { ok: true; value: number } | { ok: false; message: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, message: `${fieldLabel} 不能留白。` };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    return {
      ok: false,
      message: `${fieldLabel} 必須是大於等於 0 的整數分鐘。`,
    };
  }

  return { ok: true, value: parsed };
}

function requiresReasonForAction(action: ResourceActionDescriptor | null) {
  return Boolean(action?.enabled && action.requiresReason);
}

export function SlaManager({
  view,
  loadErrorMessage,
  links,
  crossAppLinks,
}: SlaManagerProps) {
  const router = useRouter();
  const profile = view?.profile ?? null;
  const updatedBy = view?.updatedBy ?? null;
  const lastRecalculationAt = view?.lastRecalculationAt ?? null;
  const availableActions = view?.availableActions ?? [];
  const emptyState = view?.emptyState ?? null;
  const refreshTier = view?.refreshTier ?? null;
  const refreshMetadata = view?.refreshMetadata ?? null;
  const [waitThresholdMin, setWaitThresholdMin] = useState(
    formatThresholdInput(profile?.waitThresholdMin),
  );
  const [arrivalThresholdMin, setArrivalThresholdMin] = useState(
    formatThresholdInput(profile?.arrivalThresholdMin),
  );
  const [completionThresholdMin, setCompletionThresholdMin] = useState(
    formatThresholdInput(profile?.completionThresholdMin),
  );
  const [reason, setReason] = useState("");
  const [receipt, setReceipt] = useState<ActionReceipt | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const updateAction = getAction(availableActions, "update_sla_profile");
  const recalcAction = getAction(availableActions, "recalculate_sla_bookings");
  const nextAction = emptyState?.nextAction ?? null;
  const activeEmptyState = getActiveEmptyState(emptyState, loadErrorMessage);
  const showEditor =
    Boolean(profile) ||
    ((emptyState?.reason === "not_provisioned" ||
      emptyState?.reason === "no_data") &&
      Boolean(updateAction));
  const reasonRequired = Boolean(
    updateAction?.requiresReason || recalcAction?.requiresReason,
  );
  const refreshMetadataAvailable = Boolean(
    refreshTier && refreshMetadata?.generatedAt,
  );
  const refreshDeadline = getRefreshDeadline(refreshMetadata);
  const metricRows = [
    {
      label: "profile state",
      value: profile ? "configured" : (emptyState?.reason ?? "unknown"),
    },
    {
      label: "update action",
      value: updateAction
        ? updateAction.enabled
          ? "enabled"
          : `disabled · ${disabledReasonLabel(updateAction.disabledReasonCode)}`
        : "not returned",
    },
    {
      label: "recalculate",
      value: recalcAction
        ? recalcAction.enabled
          ? "enabled"
          : `disabled · ${disabledReasonLabel(recalcAction.disabledReasonCode)}`
        : "not returned",
    },
    {
      label: "last recalc",
      value: lastRecalculationAt ? formatDateTime(lastRecalculationAt) : "idle",
    },
  ];

  useEffect(() => {
    setWaitThresholdMin(formatThresholdInput(profile?.waitThresholdMin));
    setArrivalThresholdMin(formatThresholdInput(profile?.arrivalThresholdMin));
    setCompletionThresholdMin(
      formatThresholdInput(profile?.completionThresholdMin),
    );
  }, [
    profile?.waitThresholdMin,
    profile?.arrivalThresholdMin,
    profile?.completionThresholdMin,
    profile?.updatedAt,
  ]);

  useEffect(() => {
    if (!refreshTier) return;
    const intervalMs = REFRESH_TIER_INTERVAL_MS[refreshTier];
    if (!intervalMs) return;

    const timer = window.setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [refreshTier, router]);

  useEffect(() => {
    if (!refreshDeadline) return;
    const msUntilDeadline = refreshDeadline - Date.now();
    const timer = window.setTimeout(
      () => {
        router.refresh();
      },
      msUntilDeadline > 0 ? msUntilDeadline : 0,
    );
    return () => window.clearTimeout(timer);
  }, [refreshDeadline, router]);

  const handleUpdate = () => {
    const waitValue = parseThresholdValue(waitThresholdMin, "waitThresholdMin");
    if (!waitValue.ok) {
      setActionError(waitValue.message);
      setReceipt(null);
      return;
    }

    const arrivalValue = parseThresholdValue(
      arrivalThresholdMin,
      "arrivalThresholdMin",
    );
    if (!arrivalValue.ok) {
      setActionError(arrivalValue.message);
      setReceipt(null);
      return;
    }

    const completionValue = parseThresholdValue(
      completionThresholdMin,
      "completionThresholdMin",
    );
    if (!completionValue.ok) {
      setActionError(completionValue.message);
      setReceipt(null);
      return;
    }

    if (requiresReasonForAction(updateAction) && !reason.trim()) {
      setActionError("更新 SLA profile 前必須填寫變更原因。");
      setReceipt(null);
      return;
    }

    startTransition(async () => {
      setActionError(null);
      setReceipt(null);
      try {
        const nextReceipt = await updateTenantSlaProfileAction({
          waitThresholdMin: waitValue.value,
          arrivalThresholdMin: arrivalValue.value,
          completionThresholdMin: completionValue.value,
          reason: reason.trim(),
        });
        setReceipt(nextReceipt);
        setReason("");
        router.refresh();
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : "SLA update failed.",
        );
      }
    });
  };

  const handleRecalculate = () => {
    if (requiresReasonForAction(recalcAction) && !reason.trim()) {
      setActionError("重算既有訂單前必須填寫操作原因。");
      setReceipt(null);
      return;
    }

    startTransition(async () => {
      setActionError(null);
      setReceipt(null);
      try {
        const nextReceipt = await recalculateTenantSlaBookingsAction(
          reason.trim(),
        );
        setReceipt(nextReceipt);
        setReason("");
        router.refresh();
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : "SLA recalculation request failed.",
        );
      }
    });
  };

  const emptyStateCard = activeEmptyState ? (
    <CanvasCard theme={th}>
      <div style={emptyStateStyle}>
        <CanvasPill theme={th} tone={activeEmptyState.tone}>
          {activeEmptyState.reason}
        </CanvasPill>
        <div style={emptyStateHeroStyle}>
          <div
            style={{
              ...emptyStateBadgeStyle,
              background:
                activeEmptyState.tone === "danger"
                  ? "#ffe4e6"
                  : activeEmptyState.tone === "warn"
                    ? "#fef3c7"
                    : "#ccfbf1",
              color:
                activeEmptyState.tone === "danger"
                  ? "#be123c"
                  : activeEmptyState.tone === "warn"
                    ? "#b45309"
                    : "#0f766e",
            }}
          >
            {EMPTY_STATE_MONOGRAM[activeEmptyState.reason]}
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>
              {activeEmptyState.title}
            </div>
            <div style={{ ...noteStyle, maxWidth: 560 }}>
              {activeEmptyState.body}
            </div>
            {loadErrorMessage ? (
              <div style={noteStyle}>error · {loadErrorMessage}</div>
            ) : null}
          </div>
        </div>
        <div style={noteStyle}>
          messageCode · {emptyState?.messageCode ?? "—"}
        </div>
        {nextAction ? (
          <div style={emptyActionStyle}>
            <div style={summaryLabelStyle}>recommended action</div>
            <div style={summaryValueStyle}>
              {actionLabel(nextAction.action)}
            </div>
            <div style={noteStyle}>{formatActionCaption(nextAction)}</div>
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
  ) : null;

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="SLA Profile"
        subtitle="wait · arrival · completion 三個門檻 · 單位 = 分鐘"
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <CanvasBtn
              theme={th}
              onClick={() => router.refresh()}
              disabled={isPending}
            >
              重新整理
            </CanvasBtn>
            <CanvasPill theme={th} tone="accent">
              refresh tier ·{" "}
              {refreshTier
                ? `${REFRESH_TIER_CODE[refreshTier]} / ${refreshTier}`
                : "—"}
            </CanvasPill>
            {refreshMetadataAvailable ? (
              <CanvasPill theme={th} tone={getRefreshTone(refreshMetadata)}>
                freshness · {refreshMetadata!.dataFreshness}
              </CanvasPill>
            ) : null}
          </div>
        }
      />

      <div style={pageBodyStyle}>
        {actionError ? (
          <CanvasBanner
            theme={th}
            tone="danger"
            title="操作失敗"
            body={actionError}
          />
        ) : null}

        {receipt ? (
          <CanvasCard theme={th} title="Action receipt">
            <CanvasBanner
              theme={th}
              tone={getReceiptTone(receipt)}
              title={`status · ${receipt.status}`}
              body={receipt.message}
            />
            <div style={{ height: 12 }} />
            <CanvasDL
              theme={th}
              cols={1}
              items={[
                { k: "status", v: receipt.status, mono: true },
                { k: "actionId", v: receipt.actionId, mono: true },
                { k: "auditId", v: receipt.auditId, mono: true },
                { k: "resource", v: receipt.resourceId, mono: true },
              ]}
            />
            <div style={{ height: 12 }} />
            <Link href={buildAuditHref(receipt)} style={linkStyle}>
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
            tone={getRefreshTone(refreshMetadata)}
            title={`Refresh cadence · ${REFRESH_TIER_CODE[refreshTier!]} · ${REFRESH_TIER_LABEL[refreshTier!]}`}
            body={`source=${refreshMetadata!.source} · generatedAt=${formatDateTime(
              refreshMetadata!.generatedAt,
            )} · staleAfterMs=${refreshMetadata!.staleAfterMs}${refreshDeadline ? ` · next resync ${formatDateTime(new Date(refreshDeadline).toISOString())}` : ""}`}
          />
        ) : null}

        {emptyState?.reason === "driver_not_eligible" ? (
          <CanvasBanner
            theme={th}
            tone="danger"
            title="Unsupported empty-state reason"
            body="Backend returned driver_not_eligible for a tenant SLA route. This page only accepts the six tenant-console empty reasons from Q-X15/Q-TEN02."
          />
        ) : null}

        {!showEditor ? (
          emptyStateCard
        ) : (
          <div style={sectionStackStyle}>
            {emptyStateCard}
            <div style={gridStyle}>
              <CanvasCard
                theme={th}
                title="當前門檻 · waitThresholdMin / arrivalThresholdMin / completionThresholdMin"
              >
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
                    <div style={inputShellStyle}>
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
                      <div style={inputMetaStyle}>
                        <span>unit</span>
                        <span>min</span>
                      </div>
                    </div>
                  </CanvasField>
                  <CanvasField
                    theme={th}
                    label="arrivalThresholdMin · 抵達門檻"
                    hint="ETA 與實際抵達差異上限"
                  >
                    <div style={inputShellStyle}>
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
                      <div style={inputMetaStyle}>
                        <span>unit</span>
                        <span>min</span>
                      </div>
                    </div>
                  </CanvasField>
                  <CanvasField
                    theme={th}
                    label="completionThresholdMin · 完成門檻"
                    hint="預估 vs 實際行車時間差異上限"
                  >
                    <div style={inputShellStyle}>
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
                      <div style={inputMetaStyle}>
                        <span>unit</span>
                        <span>min</span>
                      </div>
                    </div>
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
                    {nextAction ? (
                      <div style={actionHintStyle}>
                        <span>
                          emptyState.nextAction ·{" "}
                          {actionLabel(nextAction.action)}
                        </span>
                        <span>{formatActionCaption(nextAction)}</span>
                      </div>
                    ) : null}
                    {availableActions.length > 0 ? (
                      <div style={actionHintStyle}>
                        {availableActions.map((action) => (
                          <span key={action.action}>
                            {formatActionCaption(action)}
                          </span>
                        ))}
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

              <CanvasCard theme={th} title="效益 · SLA 檔案狀態">
                <div style={summaryCardStyle}>
                  <div style={statListStyle}>
                    {metricRows.map((row) => (
                      <div key={row.label} style={statRowStyle}>
                        <div style={statKeyStyle}>{row.label}</div>
                        <div style={statValueStyle}>{row.value}</div>
                      </div>
                    ))}
                  </div>

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
                        v: profile
                          ? `${profile.completionThresholdMin} min`
                          : "—",
                        mono: true,
                      },
                    ]}
                  />

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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
