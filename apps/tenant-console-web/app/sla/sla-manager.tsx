"use client";

import type { CSSProperties } from "react";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  ActionReceipt,
  EmptyReason,
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

type SlaActionKey = "update_sla_profile" | "recalculate_sla_bookings";

type ActionReceiptState = {
  actionKey: SlaActionKey;
  receipt: ActionReceipt;
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
  previewEmptyReason: EmptyReason | null;
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

const modalScrimStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.42)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 50,
};

const modalCardStyle: CSSProperties = {
  width: "min(100%, 540px)",
  background: th.bg,
  border: `1px solid ${th.border}`,
  borderRadius: 16,
  boxShadow: "0 28px 70px rgba(15, 23, 42, 0.22)",
  padding: 20,
  display: "grid",
  gap: 16,
};

const modalHeaderStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const modalFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
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

const inlineLinkRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
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
  gap: 14,
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
    body: "目前檢視條件下沒有可顯示的 SLA profile。請清除外部篩選條件，或從整合就緒度重新進入本頁。",
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

function formatUpdatedByLine(
  updatedAt: string | null | undefined,
  updatedBy: string | null,
) {
  const dateLabel = formatDateTime(updatedAt);
  if (dateLabel === "—") {
    return "—";
  }

  return updatedBy ? `${dateLabel} · ${updatedBy}` : dateLabel;
}

function getRecalculationStatus(
  receiptState: ActionReceiptState | null,
  lastRecalculationAt: string | null,
) {
  const receipt =
    receiptState?.actionKey === "recalculate_sla_bookings"
      ? receiptState.receipt
      : null;

  if (receipt?.actionId && receipt.resourceType === "tenant_sla") {
    if (receipt.status === "accepted") {
      return "queued";
    }
    if (receipt.status === "completed") {
      return "completed";
    }
    if (receipt.status === "failed") {
      return "failed";
    }
  }

  return lastRecalculationAt ? "history" : "idle";
}

function getActiveEmptyState(
  previewEmptyReason: TenantSlaEmptyReason | null,
  emptyState: EmptyStateEnvelope | null,
  loadErrorMessage: string | null,
) {
  if (previewEmptyReason) {
    return EMPTY_STATE_CONFIG[previewEmptyReason];
  }
  if (emptyState?.reason && emptyState.reason in EMPTY_STATE_CONFIG) {
    return EMPTY_STATE_CONFIG[emptyState.reason as TenantSlaEmptyReason];
  }
  if (!emptyState && loadErrorMessage) {
    return EMPTY_STATE_CONFIG.fetch_failed;
  }
  return null;
}

function getTenantSlaEmptyReason(
  reason: EmptyReason | null | undefined,
): TenantSlaEmptyReason | null {
  if (!reason || reason === "driver_not_eligible") {
    return null;
  }

  return reason;
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

function resolveActionVariant(action: ResourceActionDescriptor | null) {
  if (action?.riskLevel === "high" || action?.riskLevel === "medium") {
    return "primary" as const;
  }
  return "secondary" as const;
}

function buildActionPrompt(action: ResourceActionDescriptor | null) {
  switch (action?.action) {
    case "update_sla_profile":
      return {
        title: "確認更新 SLA Profile",
        body: "Threshold 變更會影響新建立的訂單，以及之後重新計算的 SLA event。確認後會寫入 audit trail。",
        confirmLabel: "確認儲存",
      };
    case "recalculate_sla_bookings":
      return {
        title: "確認重算既有訂單",
        body: "此操作會對既有訂單送出 SLA 重算請求，receipt 會回傳 accepted/completed 狀態並可追蹤 audit。",
        confirmLabel: "確認重算",
      };
    default:
      return {
        title: "確認操作",
        body: "此操作會留下 audit trail。",
        confirmLabel: "確認",
      };
  }
}

export function SlaManager({
  view,
  loadErrorMessage,
  previewEmptyReason,
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
  const [pendingActionKey, setPendingActionKey] = useState<SlaActionKey | null>(
    null,
  );
  const [pendingReason, setPendingReason] = useState("");
  const [receiptState, setReceiptState] = useState<ActionReceiptState | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const updateAction = getAction(availableActions, "update_sla_profile");
  const recalcAction = getAction(availableActions, "recalculate_sla_bookings");
  const nextAction = emptyState?.nextAction ?? null;
  const effectiveEmptyReason = getTenantSlaEmptyReason(
    previewEmptyReason ?? emptyState?.reason,
  );
  const activeEmptyState = getActiveEmptyState(
    effectiveEmptyReason,
    emptyState,
    loadErrorMessage,
  );
  const showEditor =
    Boolean(profile) ||
    ((effectiveEmptyReason === "not_provisioned" ||
      effectiveEmptyReason === "no_data") &&
      Boolean(updateAction));
  const refreshMetadataAvailable = Boolean(
    refreshTier && refreshMetadata?.generatedAt,
  );
  const refreshDeadline = getRefreshDeadline(refreshMetadata);
  const pendingAction =
    pendingActionKey === "update_sla_profile"
      ? updateAction
      : pendingActionKey === "recalculate_sla_bookings"
        ? recalcAction
        : null;
  const pendingActionPrompt = buildActionPrompt(pendingAction);
  const recalculationStatus = getRecalculationStatus(
    receiptState,
    lastRecalculationAt,
  );
  const attainmentUnavailableLabel =
    profile && !activeEmptyState ? "待 SLA attainment read model" : "—";
  const attainmentItems = [
    {
      k: "總 SLA 評估趟次",
      v: attainmentUnavailableLabel,
      mono: true,
    },
    {
      k: "達標",
      v: attainmentUnavailableLabel,
      mono: true,
    },
    {
      k: "wait 違規",
      v: attainmentUnavailableLabel,
      mono: true,
    },
    {
      k: "arrival 違規",
      v: attainmentUnavailableLabel,
      mono: true,
    },
    {
      k: "completion 違規",
      v: attainmentUnavailableLabel,
      mono: true,
    },
    {
      k: "updatedAt",
      v: formatDateTime(profile?.updatedAt),
      mono: true,
    },
    {
      k: "updatedBy",
      v: updatedBy ?? "—",
      mono: true,
    },
  ];

  useEffect(() => {
    setWaitThresholdMin(formatThresholdInput(profile?.waitThresholdMin));
    setArrivalThresholdMin(formatThresholdInput(profile?.arrivalThresholdMin));
    setCompletionThresholdMin(
      formatThresholdInput(profile?.completionThresholdMin),
    );
    setPendingActionKey(null);
    setPendingReason("");
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

  const executeAction = (actionKey: SlaActionKey, reason: string) => {
    const selectedAction =
      actionKey === "update_sla_profile" ? updateAction : recalcAction;
    if (requiresReasonForAction(selectedAction) && !reason.trim()) {
      setActionError(
        actionKey === "update_sla_profile"
          ? "更新 SLA profile 前必須填寫變更原因。"
          : "重算既有訂單前必須填寫操作原因。",
      );
      setReceiptState(null);
      return;
    }

    startTransition(async () => {
      setActionError(null);
      setReceiptState(null);
      try {
        const nextReceipt =
          actionKey === "update_sla_profile"
            ? await (async () => {
                const waitValue = parseThresholdValue(
                  waitThresholdMin,
                  "waitThresholdMin",
                );
                if (!waitValue.ok) {
                  throw new Error(waitValue.message);
                }

                const arrivalValue = parseThresholdValue(
                  arrivalThresholdMin,
                  "arrivalThresholdMin",
                );
                if (!arrivalValue.ok) {
                  throw new Error(arrivalValue.message);
                }

                const completionValue = parseThresholdValue(
                  completionThresholdMin,
                  "completionThresholdMin",
                );
                if (!completionValue.ok) {
                  throw new Error(completionValue.message);
                }

                return updateTenantSlaProfileAction({
                  waitThresholdMin: waitValue.value,
                  arrivalThresholdMin: arrivalValue.value,
                  completionThresholdMin: completionValue.value,
                  reason: reason.trim(),
                });
              })()
            : await recalculateTenantSlaBookingsAction(reason.trim());
        setReceiptState({ actionKey, receipt: nextReceipt });
        setPendingActionKey(null);
        setPendingReason("");
        router.refresh();
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : actionKey === "update_sla_profile"
              ? "SLA update failed."
              : "SLA recalculation request failed.",
        );
      }
    });
  };

  const openActionConfirm = (actionKey: SlaActionKey) => {
    const selectedAction =
      actionKey === "update_sla_profile" ? updateAction : recalcAction;
    if (!selectedAction?.enabled || isPending) {
      return;
    }
    setActionError(null);
    setPendingActionKey(actionKey);
    setPendingReason("");
  };

  const closeActionConfirm = () => {
    if (isPending) {
      return;
    }
    setPendingActionKey(null);
    setPendingReason("");
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
          messageCode ·{" "}
          {previewEmptyReason
            ? `preview.${previewEmptyReason}`
            : (emptyState?.messageCode ?? "—")}
        </div>
        {!previewEmptyReason && nextAction ? (
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
        subtitle="wait · arrival · completion 三個門檻 · 單位 = 分鐘 (Q-TEN07)"
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

        {receiptState ? (
          <CanvasCard theme={th} title="Action receipt">
            <CanvasBanner
              theme={th}
              tone={getReceiptTone(receiptState.receipt)}
              title={`status · ${receiptState.receipt.status}`}
              body={receiptState.receipt.message}
            />
            <div style={{ height: 12 }} />
            <CanvasDL
              theme={th}
              cols={1}
              items={[
                {
                  k: "status",
                  v: receiptState.receipt.status,
                  mono: true,
                },
                { k: "action", v: receiptState.actionKey, mono: true },
                {
                  k: "actionId",
                  v: receiptState.receipt.actionId,
                  mono: true,
                },
                {
                  k: "auditId",
                  v: receiptState.receipt.auditId,
                  mono: true,
                },
                {
                  k: "resource",
                  v: receiptState.receipt.resourceId,
                  mono: true,
                },
              ]}
            />
            <div style={{ height: 12 }} />
            <Link href={buildAuditHref(receiptState.receipt)} style={linkStyle}>
              查看對應 audit →
            </Link>
          </CanvasCard>
        ) : null}

        {lastRecalculationAt || recalculationStatus === "queued" ? (
          <CanvasBanner
            theme={th}
            tone={recalculationStatus === "queued" ? "warn" : "info"}
            title={
              recalculationStatus === "queued"
                ? "既有訂單 SLA 重算已排入佇列"
                : "最近一次既有訂單重算請求"
            }
            body={
              recalculationStatus === "queued"
                ? `本次重算請求已 accepted，auditId=${receiptState?.receipt.auditId ?? "—"}。既有訂單在背景重算完成前，仍保留建立時 snapshot。`
                : `最近一次重算請求於 ${formatDateTime(lastRecalculationAt)} 送出。既有訂單會保留建立時 snapshot，直到該次重算將新的 SLA profile 套用完成。`
            }
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

                <div style={footerStyle}>
                  <div style={noteStyle}>
                    {updateAction || recalcAction
                      ? "availableActions 決定 CTA 顯示；高風險動作會在確認視窗收集 reason，送出後刷新本頁與相關 deep links。"
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
                        variant={resolveActionVariant(recalcAction)}
                        onClick={() =>
                          openActionConfirm("recalculate_sla_bookings")
                        }
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
                        variant={resolveActionVariant(updateAction)}
                        onClick={() => openActionConfirm("update_sla_profile")}
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

              <CanvasCard theme={th} title="效益 · 上月 SLA 達成率">
                <div style={summaryCardStyle}>
                  <CanvasDL theme={th} cols={1} items={attainmentItems} />
                  <div style={noteStyle}>
                    此卡片依照設計稿保留 SLA 達成率位置；目前 read model
                    尚未回傳上月統計，因此先顯示 profile provenance
                    與最近一次重算時間。
                  </div>
                  <div style={summaryListStyle}>
                    <div>
                      <div style={summaryLabelStyle}>profile state</div>
                      <div style={summaryValueStyle}>
                        {profile ? "configured" : (emptyState?.reason ?? "—")}
                      </div>
                    </div>
                    <div>
                      <div style={summaryLabelStyle}>provenance</div>
                      <div style={summaryValueStyle}>
                        {formatUpdatedByLine(profile?.updatedAt, updatedBy)}
                      </div>
                    </div>
                    <div>
                      <div style={summaryLabelStyle}>recalculation state</div>
                      <div style={summaryValueStyle}>{recalculationStatus}</div>
                    </div>
                    <div>
                      <div style={summaryLabelStyle}>last recalculation</div>
                      <div style={summaryValueStyle}>
                        {lastRecalculationAt
                          ? formatDateTime(lastRecalculationAt)
                          : "idle"}
                      </div>
                    </div>
                  </div>
                </div>
              </CanvasCard>
            </div>
            <CanvasCard theme={th} title="深連結與後續追蹤">
              <div style={summaryCardStyle}>
                <div style={noteStyle}>
                  Tenant Console 內部追蹤維持同站導覽；跨 app 追蹤依 Q-X03
                  以新分頁開啟。
                </div>
                <div style={inlineLinkRowStyle}>
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
        )}
      </div>
      {pendingAction ? (
        <div style={modalScrimStyle}>
          <div style={modalCardStyle} role="dialog" aria-modal="true">
            <div style={modalHeaderStyle}>
              <CanvasPill
                theme={th}
                tone={pendingAction.riskLevel === "high" ? "danger" : "accent"}
              >
                {pendingAction.riskLevel} risk
              </CanvasPill>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {pendingActionPrompt.title}
              </div>
              <div style={noteStyle}>{pendingActionPrompt.body}</div>
            </div>
            {pendingAction.requiresReason ? (
              <CanvasField
                theme={th}
                label="操作原因"
                hint="此欄位為必填，提交後會寫入 audit trail。"
              >
                <textarea
                  value={pendingReason}
                  onChange={(event) => setPendingReason(event.target.value)}
                  style={nativeTextAreaStyle}
                  disabled={isPending}
                  aria-label="pending-action-reason"
                  placeholder="請填寫原因，說明這次 threshold 變更或重算目的"
                />
              </CanvasField>
            ) : null}
            <div style={modalFooterStyle}>
              <CanvasBtn
                theme={th}
                onClick={closeActionConfirm}
                disabled={isPending}
              >
                取消
              </CanvasBtn>
              <CanvasBtn
                theme={th}
                variant={resolveActionVariant(pendingAction)}
                onClick={() =>
                  executeAction(
                    pendingAction.action as SlaActionKey,
                    pendingReason,
                  )
                }
                disabled={Boolean(
                  isPending ||
                  (pendingAction.requiresReason && !pendingReason.trim()),
                )}
              >
                {pendingActionPrompt.confirmLabel}
              </CanvasBtn>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
