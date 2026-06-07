"use client";

import type { CSSProperties } from "react";
import { useEffect, useState, useTransition } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  ActionReceipt,
  CrossAppResourceLink,
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
import { formatTenantCodeLabel } from "@/lib/localized-labels";
import {
  recalculateTenantSlaBookingsAction,
  updateTenantSlaProfileAction,
} from "./actions";

type SlaActionKey = "update_sla_profile" | "recalculate_sla_bookings";

type ActionReceiptState = {
  actionKey: SlaActionKey;
  receipt: ActionReceipt;
};

type EmptyStateConfig = {
  reason: TenantSlaEmptyReason;
  badgeLabel: string;
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
  transportErrorMessage: string | null;
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
    badgeLabel: "尚無資料",
    title: "尚無服務時限資料",
    body: "租戶尚未寫入任何服務時限門檻。先建立初始等待、到達與完成分鐘門檻。",
    tone: "info",
  },
  not_provisioned: {
    reason: "not_provisioned",
    badgeLabel: "尚未建置",
    title: "服務時限設定尚未完成建置",
    body: "此租戶還沒有服務時限設定。完成初始設定後，整合治理頁才會把這個模組標為就緒。",
    tone: "warn",
  },
  fetch_failed: {
    reason: "fetch_failed",
    badgeLabel: "讀取失敗",
    title: "服務時限設定讀取失敗",
    body: "目前無法取得服務時限設定。重新整理後若仍失敗，請查看稽核或整合治理頁追查請求。",
    tone: "danger",
  },
  permission_denied: {
    reason: "permission_denied",
    badgeLabel: "權限不足",
    title: "沒有權限變更服務時限",
    body: "只有租戶管理員可維護服務時限設定。若你是只讀角色，請聯絡租戶管理員代為更新。",
    tone: "warn",
  },
  external_unavailable: {
    reason: "external_unavailable",
    badgeLabel: "服務異常",
    title: "服務時限相依服務暫時不可用",
    body: "服務時限設定目前受外部計算或同步服務影響而不可用。請稍後重試並留意平台公告。",
    tone: "danger",
  },
  filtered_empty: {
    reason: "filtered_empty",
    badgeLabel: "目前無結果",
    title: "目前篩選條件下沒有結果",
    body: "目前檢視條件下沒有可顯示的服務時限設定。請清除外部篩選條件，或從整合就緒度重新進入本頁。",
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
  return formatTenantCodeLabel(reason, "目前不可用");
}

function actionLabel(action: string) {
  switch (action) {
    case "update_sla_profile":
      return "儲存設定";
    case "recalculate_sla_bookings":
      return "重算既有訂單";
    default:
      return formatTenantCodeLabel(action, "未知動作");
  }
}

const REFRESH_TIER_LABEL: Record<RefreshTier, string> = {
  urgent: "即時推播 · 5 秒後援輪詢",
  fast: "3 秒自動更新",
  dispatch: "5 秒自動更新",
  medium: "15 秒自動更新",
  medium_slow: "30 秒自動更新",
  slow: "30 秒自動更新",
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

function formatRecalculationStateLabel(state: string) {
  switch (state) {
    case "history":
      return "已有歷史紀錄";
    case "idle":
      return "尚未執行";
    default:
      return formatTenantCodeLabel(state, state);
  }
}

function formatRiskLabel(riskLevel: ResourceActionDescriptor["riskLevel"]) {
  switch (riskLevel) {
    case "high":
      return "高風險";
    case "medium":
      return "中風險";
    case "low":
    default:
      return "低風險";
  }
}

function resolveResourceHref(link: CrossAppResourceLink) {
  return resolveResourceHrefWithRoute(link, link.route);
}

function resolveResourceHrefWithRoute(
  link: CrossAppResourceLink,
  route: string,
) {
  if (link.targetApp === "tenant-console") {
    return route;
  }

  const appBaseUrl =
    link.targetApp === "ops-console"
      ? (process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3002")
      : (process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3003");

  return `${appBaseUrl}${route}`;
}

function withLinkSearchParams(
  link: CrossAppResourceLink,
  entries: Array<[string, string | null | undefined]>,
) {
  const [rawPathname, rawSearch] = link.route.split("?");
  const pathname = rawPathname || link.route;
  const params = new URLSearchParams(rawSearch ?? "");

  for (const [key, value] of entries) {
    if (!value) {
      continue;
    }
    params.set(key, value);
  }

  const nextSearch = params.toString();
  const nextRoute: string = nextSearch ? `${pathname}?${nextSearch}` : pathname;
  return resolveResourceHrefWithRoute(link, nextRoute);
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

function getActiveEmptyState(emptyState: EmptyStateEnvelope | null) {
  if (emptyState?.reason && emptyState.reason in EMPTY_STATE_CONFIG) {
    return EMPTY_STATE_CONFIG[emptyState.reason as TenantSlaEmptyReason];
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

function isSameTabLink(link: CrossAppResourceLink) {
  return link.openMode === "same_tab" && link.targetApp === "tenant-console";
}

function renderResourceLink(
  link: CrossAppResourceLink,
  key: string,
  suffix?: ReactNode,
  hrefOverride?: string,
  labelOverride?: string,
) {
  const href = hrefOverride ?? resolveResourceHref(link);
  const content = (
    <>
      {labelOverride ?? link.label}
      {suffix ?? (isSameTabLink(link) ? " →" : " ↗")}
    </>
  );

  if (isSameTabLink(link)) {
    return (
      <Link key={key} href={href} style={linkStyle}>
        {content}
      </Link>
    );
  }

  return (
    <a key={key} href={href} style={linkStyle} target="_blank" rel="noreferrer">
      {content}
    </a>
  );
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
        title: "確認更新服務時限設定",
        body: "門檻變更會影響新建立的訂單，以及之後重新計算的服務時限事件。確認後會寫入稽核軌跡。",
        confirmLabel: "確認儲存",
      };
    case "recalculate_sla_bookings":
      return {
        title: "確認重算既有訂單",
        body: "此操作會對既有訂單送出服務時限重算請求，收據會回傳已受理或已完成狀態，並可追蹤稽核紀錄。",
        confirmLabel: "確認重算",
      };
    default:
      return {
        title: "確認操作",
        body: "此操作會留下稽核軌跡。",
        confirmLabel: "確認",
      };
  }
}

export function SlaManager({ view, transportErrorMessage }: SlaManagerProps) {
  const router = useRouter();
  const profile = view?.profile ?? null;
  const updatedBy = view?.updatedBy ?? null;
  const lastRecalculationAt = view?.lastRecalculationAt ?? null;
  const availableActions = view?.availableActions ?? [];
  const emptyState = view?.emptyState ?? null;
  const refreshTier = view?.refreshTier ?? null;
  const refreshMetadata = view?.refreshMetadata ?? null;
  const resourceLinks = view?.resourceLinks ?? [];
  const sameAppLinks = resourceLinks.filter((link) => isSameTabLink(link));
  const crossAppLinks = resourceLinks.filter((link) => !isSameTabLink(link));
  const auditResourceLink =
    resourceLinks.find((link) => link.resourceType === "tenant_sla_audit") ??
    null;
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
  const effectiveEmptyReason = getTenantSlaEmptyReason(emptyState?.reason);
  const activeEmptyState = getActiveEmptyState(emptyState);
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
  const pendingRecalculation = recalculationStatus === "queued";
  const receiptAuditHref =
    auditResourceLink && receiptState?.receipt.auditId
      ? withLinkSearchParams(auditResourceLink, [
          ["auditId", receiptState.receipt.auditId],
        ])
      : null;
  const summaryItems = [
    {
      k: "最近更新",
      v: formatDateTime(profile?.updatedAt),
      mono: true,
    },
    {
      k: "更新人",
      v: updatedBy ?? "—",
      mono: true,
    },
    {
      k: "設定狀態",
      v: profile
        ? "已設定"
        : formatTenantCodeLabel(emptyState?.reason, emptyState?.reason ?? "—"),
      mono: true,
    },
    {
      k: "重算狀態",
      v: formatRecalculationStateLabel(recalculationStatus),
      mono: true,
    },
    {
      k: "最近重算",
      v: lastRecalculationAt ? formatDateTime(lastRecalculationAt) : "尚未執行",
      mono: true,
    },
    {
      k: "更新頻率",
      v: refreshTier ? REFRESH_TIER_LABEL[refreshTier] : "—",
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
          ? "更新服務時限設定前必須填寫變更原因。"
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
                  "等候門檻",
                );
                if (!waitValue.ok) {
                  throw new Error(waitValue.message);
                }

                const arrivalValue = parseThresholdValue(
                  arrivalThresholdMin,
                  "抵達門檻",
                );
                if (!arrivalValue.ok) {
                  throw new Error(arrivalValue.message);
                }

                const completionValue = parseThresholdValue(
                  completionThresholdMin,
                  "完成門檻",
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
              ? "更新服務時限設定失敗。"
              : "重算服務時限請求失敗。",
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
          {activeEmptyState.badgeLabel}
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
          </div>
        </div>
        {nextAction ? (
          <div style={emptyActionStyle}>
            <div style={summaryLabelStyle}>建議操作</div>
            <div style={summaryValueStyle}>
              {actionLabel(nextAction.action)}
            </div>
            <div style={noteStyle}>{formatActionCaption(nextAction)}</div>
          </div>
        ) : null}
        <div style={linkRowStyle}>
          {sameAppLinks.map((link) => (
            <Link
              key={`${link.targetApp}:${link.route}`}
              href={resolveResourceHref(link)}
              style={linkStyle}
            >
              {link.label} →
            </Link>
          ))}
          {crossAppLinks.map((link) => (
            <a
              key={`${link.targetApp}:${link.route}`}
              href={resolveResourceHref(link)}
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
        title="服務時限設定"
        subtitle="等候、抵達、完成三個門檻設定，單位皆為分鐘"
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
              更新頻率 · {refreshTier ? REFRESH_TIER_LABEL[refreshTier] : "—"}
            </CanvasPill>
            {refreshMetadataAvailable ? (
              <CanvasPill theme={th} tone={getRefreshTone(refreshMetadata)}>
                資料狀態 ·{" "}
                {formatTenantCodeLabel(
                  refreshMetadata!.dataFreshness,
                  refreshMetadata!.dataFreshness,
                )}
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

        {transportErrorMessage && !view ? (
          <CanvasCard theme={th}>
            <div style={emptyStateStyle}>
              <CanvasPill theme={th} tone="danger">
                傳輸失敗
              </CanvasPill>
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontSize: 22, fontWeight: 700 }}>
                  服務時限檢視暫時無法載入
                </div>
                <div style={{ ...noteStyle, maxWidth: 560 }}>
                  這是傳輸或請求失敗，不屬於六種預設空狀態原因。請重新整理，或改從整合就緒度與稽核頁追查。
                </div>
                <div style={noteStyle}>錯誤 · {transportErrorMessage}</div>
              </div>
              <div style={linkRowStyle}>
                {sameAppLinks.map((link) => (
                  <Link
                    key={`${link.targetApp}:${link.route}`}
                    href={resolveResourceHref(link)}
                    style={linkStyle}
                  >
                    {link.label} →
                  </Link>
                ))}
                {crossAppLinks.map((link) => (
                  <a
                    key={`${link.targetApp}:${link.route}`}
                    href={resolveResourceHref(link)}
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
        ) : null}

        {receiptState ? (
          <CanvasCard theme={th} title="操作收據">
            <CanvasBanner
              theme={th}
              tone={getReceiptTone(receiptState.receipt)}
              title={`狀態 · ${formatTenantCodeLabel(
                receiptState.receipt.status,
                receiptState.receipt.status,
              )}`}
              body={receiptState.receipt.message}
            />
            <div style={{ height: 12 }} />
            <CanvasDL
              theme={th}
              cols={1}
              items={[
                {
                  k: "狀態",
                  v: formatTenantCodeLabel(
                    receiptState.receipt.status,
                    receiptState.receipt.status,
                  ),
                  mono: true,
                },
                {
                  k: "操作",
                  v: actionLabel(receiptState.actionKey),
                  mono: true,
                },
                {
                  k: "操作編號",
                  v: receiptState.receipt.actionId,
                  mono: true,
                },
                {
                  k: "稽核編號",
                  v: receiptState.receipt.auditId,
                  mono: true,
                },
                {
                  k: "資源",
                  v: receiptState.receipt.resourceId,
                  mono: true,
                },
              ]}
            />
            <div style={{ height: 12 }} />
            {auditResourceLink ? (
              renderResourceLink(
                auditResourceLink,
                `${auditResourceLink.targetApp}:${auditResourceLink.route}:receipt`,
                <>
                  {" "}
                  · 稽核編號={receiptState.receipt.auditId}
                  {isSameTabLink(auditResourceLink) ? " →" : " ↗"}
                </>,
                receiptAuditHref ?? undefined,
                "查看稽核",
              )
            ) : (
              <div style={noteStyle}>
                本次操作收據未附可用稽核深連結；稽核編號{" "}
                {receiptState.receipt.auditId}
              </div>
            )}
          </CanvasCard>
        ) : null}

        {lastRecalculationAt || pendingRecalculation ? (
          <CanvasBanner
            theme={th}
            tone={pendingRecalculation ? "warn" : "info"}
            title={
              pendingRecalculation
                ? "既有訂單服務時限重算已排入佇列"
                : "最近一次既有訂單重算請求"
            }
            body={
              pendingRecalculation
                ? `本次重算請求已接受，稽核編號 ${receiptState?.receipt.auditId ?? "—"}。既有訂單在背景重算完成前，仍保留建立時快照。`
                : `最近一次重算請求於 ${formatDateTime(lastRecalculationAt)} 送出。既有訂單會保留建立時快照，直到該次重算將新的服務時限設定套用完成。`
            }
          />
        ) : null}

        {refreshMetadataAvailable ? (
          <CanvasBanner
            theme={th}
            tone={getRefreshTone(refreshMetadata)}
            title={`更新節奏 · ${REFRESH_TIER_LABEL[refreshTier!]}`}
            body={`資料來源：${formatTenantCodeLabel(
              refreshMetadata!.source,
              refreshMetadata!.source,
            )} · 產生時間：${formatDateTime(refreshMetadata!.generatedAt)} · 過舊時限：${Math.round(
              refreshMetadata!.staleAfterMs / 1000,
            )} 秒${
              refreshDeadline
                ? ` · 下次同步：${formatDateTime(
                    new Date(refreshDeadline).toISOString(),
                  )}`
                : ""
            }`}
          />
        ) : null}

        {emptyState?.reason === "driver_not_eligible" ? (
          <CanvasBanner
            theme={th}
            tone="danger"
            title="收到不支援的空狀態原因"
            body="後端回傳了不屬於本頁支援範圍的空狀態原因。這個頁面只接受租戶後台定義的六種空狀態原因。"
          />
        ) : null}

        {!view && transportErrorMessage ? null : !showEditor ? (
          emptyStateCard
        ) : (
          <div style={sectionStackStyle}>
            {emptyStateCard}
            <div style={gridStyle}>
              <CanvasCard theme={th} title="目前門檻">
                <CanvasBanner
                  theme={th}
                  tone="info"
                  title="變更影響範圍"
                  body="門檻變更會影響新建立的訂單，以及後續重新計算的服務時限事件。既有訂單會保留建立當下的設定快照，除非另行送出重算指令。"
                />

                <div style={{ height: 14 }} />

                <div style={kpiGridStyle}>
                  <CanvasField
                    theme={th}
                    label="等候門檻"
                    hint="超過此分鐘數就會標記為等候違規"
                  >
                    <div style={inputShellStyle}>
                      <input
                        value={waitThresholdMin}
                        onChange={(event) =>
                          setWaitThresholdMin(event.target.value)
                        }
                        inputMode="numeric"
                        style={nativeInputStyle}
                        aria-label="等候門檻"
                        disabled={isPending || !updateAction?.enabled}
                        placeholder="分鐘"
                      />
                      <div style={inputMetaStyle}>
                        <span>單位</span>
                        <span>分鐘</span>
                      </div>
                    </div>
                  </CanvasField>
                  <CanvasField
                    theme={th}
                    label="抵達門檻"
                    hint="預估抵達時間與實際抵達之間的差異上限"
                  >
                    <div style={inputShellStyle}>
                      <input
                        value={arrivalThresholdMin}
                        onChange={(event) =>
                          setArrivalThresholdMin(event.target.value)
                        }
                        inputMode="numeric"
                        style={nativeInputStyle}
                        aria-label="抵達門檻"
                        disabled={isPending || !updateAction?.enabled}
                        placeholder="分鐘"
                      />
                      <div style={inputMetaStyle}>
                        <span>單位</span>
                        <span>分鐘</span>
                      </div>
                    </div>
                  </CanvasField>
                  <CanvasField
                    theme={th}
                    label="完成門檻"
                    hint="預估行車時間與實際完成時間的差異上限"
                  >
                    <div style={inputShellStyle}>
                      <input
                        value={completionThresholdMin}
                        onChange={(event) =>
                          setCompletionThresholdMin(event.target.value)
                        }
                        inputMode="numeric"
                        style={nativeInputStyle}
                        aria-label="完成門檻"
                        disabled={isPending || !updateAction?.enabled}
                        placeholder="分鐘"
                      />
                      <div style={inputMetaStyle}>
                        <span>單位</span>
                        <span>分鐘</span>
                      </div>
                    </div>
                  </CanvasField>
                </div>

                <div style={footerStyle}>
                  <div style={noteStyle}>
                    {updateAction || recalcAction
                      ? "後端回傳的可用操作會決定按鈕顯示；高風險動作會在確認視窗收集原因，送出後刷新本頁與相關深連結。"
                      : "目前後端沒有回傳可操作的服務時限動作。"}
                    {nextAction ? (
                      <div style={actionHintStyle}>
                        <span>
                          建議下一步 · {actionLabel(nextAction.action)}
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

              <CanvasCard theme={th} title="設定摘要">
                <div style={summaryCardStyle}>
                  <CanvasDL theme={th} cols={1} items={summaryItems} />
                  <div style={noteStyle}>
                    版面右側原本保留服務時限
                    達成率區塊；目前契約僅提供設定檔、刷新與重算中繼資料，因此這裡只呈現已回傳欄位，不自行推估達成率。
                  </div>
                  <div style={summaryListStyle}>
                    <div>
                      <div style={summaryLabelStyle}>資料來源</div>
                      <div style={summaryValueStyle}>
                        {formatUpdatedByLine(profile?.updatedAt, updatedBy)}
                      </div>
                    </div>
                    <div>
                      <div style={summaryLabelStyle}>重算狀態</div>
                      <div style={summaryValueStyle}>{recalculationStatus}</div>
                    </div>
                    <div>
                      <div style={summaryLabelStyle}>跨應用連結</div>
                      <div style={{ ...summaryValueStyle, ...linkRowStyle }}>
                        {resourceLinks.length > 0 ? (
                          resourceLinks.map((link) =>
                            renderResourceLink(
                              link,
                              `${link.targetApp}:${link.route}:summary`,
                            ),
                          )
                        ) : (
                          <span>—</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CanvasCard>
            </div>
            <CanvasCard theme={th} title="深連結與後續追蹤">
              <div style={summaryCardStyle}>
                <div style={noteStyle}>
                  下列深連結全數直接使用服務時限
                  檢視回傳的深連結中繼資料，不在前端額外拼接路由。
                </div>
                <div style={inlineLinkRowStyle}>
                  {sameAppLinks.map((link) =>
                    renderResourceLink(
                      link,
                      `${link.targetApp}:${link.route}:follow-up`,
                    ),
                  )}
                  {crossAppLinks.map((link) =>
                    renderResourceLink(
                      link,
                      `${link.targetApp}:${link.route}:follow-up`,
                    ),
                  )}
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
                {formatRiskLabel(pendingAction.riskLevel)}
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
                hint="此欄位為必填，提交後會寫入稽核軌跡。"
              >
                <textarea
                  value={pendingReason}
                  onChange={(event) => setPendingReason(event.target.value)}
                  style={nativeTextAreaStyle}
                  disabled={isPending}
                  aria-label="操作原因"
                  placeholder="請填寫原因，說明這次門檻變更或重算目的"
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
