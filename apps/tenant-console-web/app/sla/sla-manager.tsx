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
import {
  recalculateTenantSlaBookingsAction,
  updateTenantSlaProfileAction,
} from "./actions";
import { useTranslation } from "@/lib/i18n";

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
  transportErrorMessage: string | null;
};

type Translator = (
  key: string,
  params?: Record<string, string | number>,
) => string;

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

function getEmptyStateConfig(
  t: Translator,
): Record<TenantSlaEmptyReason, EmptyStateConfig> {
  return {
    no_data: {
      reason: "no_data",
      title: t("sla.empty.noData.title"),
      body: t("sla.empty.noData.body"),
      tone: "info",
    },
    not_provisioned: {
      reason: "not_provisioned",
      title: t("sla.empty.notProvisioned.title"),
      body: t("sla.empty.notProvisioned.body"),
      tone: "warn",
    },
    fetch_failed: {
      reason: "fetch_failed",
      title: t("sla.empty.fetchFailed.title"),
      body: t("sla.empty.fetchFailed.body"),
      tone: "danger",
    },
    permission_denied: {
      reason: "permission_denied",
      title: t("sla.empty.permissionDenied.title"),
      body: t("sla.empty.permissionDenied.body"),
      tone: "warn",
    },
    external_unavailable: {
      reason: "external_unavailable",
      title: t("sla.empty.externalUnavailable.title"),
      body: t("sla.empty.externalUnavailable.body"),
      tone: "danger",
    },
    filtered_empty: {
      reason: "filtered_empty",
      title: t("sla.empty.filteredEmpty.title"),
      body: t("sla.empty.filteredEmpty.body"),
      tone: "info",
    },
  };
}

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

function disabledReasonLabel(reason: string | undefined, t: Translator) {
  if (!reason) return t("sla.action.missingData");
  return reason.replaceAll("_", " ");
}

function actionLabel(action: string, t: Translator) {
  switch (action) {
    case "update_sla_profile":
      return t("sla.action.update");
    case "recalculate_sla_bookings":
      return t("sla.action.recalculate");
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

const REFRESH_TIER_INTERVAL_MS: Record<RefreshTier, number | null> = {
  urgent: 5000,
  fast: 3000,
  dispatch: 5000,
  medium: 15000,
  medium_slow: 30000,
  slow: 30000,
  manual: null,
};

function getRefreshTierLabel(t: Translator, refreshTier: RefreshTier) {
  switch (refreshTier) {
    case "urgent":
      return t("sla.refresh.urgent");
    case "fast":
      return t("sla.refresh.fast");
    case "dispatch":
      return t("sla.refresh.dispatch");
    case "medium":
      return t("sla.refresh.medium");
    case "medium_slow":
      return t("sla.refresh.mediumSlow");
    case "slow":
      return t("sla.refresh.slow");
    case "manual":
      return t("sla.refresh.manual");
  }
}

function formatActionCaption(action: ResourceActionDescriptor, t: Translator) {
  if (action.enabled) {
    return t("sla.action.available", {
      action: actionLabel(action.action, t),
    });
  }
  return t("sla.action.unavailable", {
    action: actionLabel(action.action, t),
    reason: disabledReasonLabel(action.disabledReasonCode, t),
  });
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
  t: Translator,
) {
  const receipt =
    receiptState?.actionKey === "recalculate_sla_bookings"
      ? receiptState.receipt
      : null;

  if (receipt?.actionId && receipt.resourceType === "tenant_sla") {
    if (receipt.status === "accepted") {
      return t("sla.recalculation.queued");
    }
    if (receipt.status === "completed") {
      return t("sla.recalculation.completed");
    }
    if (receipt.status === "failed") {
      return t("sla.recalculation.failed");
    }
  }

  return lastRecalculationAt
    ? t("sla.recalculation.history")
    : t("sla.summary.idle");
}

function getActiveEmptyState(
  emptyState: EmptyStateEnvelope | null,
  t: Translator,
) {
  const emptyStateConfig = getEmptyStateConfig(t);
  if (emptyState?.reason && emptyState.reason in emptyStateConfig) {
    return emptyStateConfig[emptyState.reason as TenantSlaEmptyReason];
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
  t: Translator,
): { ok: true; value: number } | { ok: false; message: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return {
      ok: false,
      message: t("sla.validation.required", { field: fieldLabel }),
    };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    return {
      ok: false,
      message: t("sla.validation.integer", { field: fieldLabel }),
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

function buildActionPrompt(
  action: ResourceActionDescriptor | null,
  t: Translator,
) {
  switch (action?.action) {
    case "update_sla_profile":
      return {
        title: t("sla.modal.update.title"),
        body: t("sla.modal.update.body"),
        confirmLabel: t("sla.modal.update.confirm"),
      };
    case "recalculate_sla_bookings":
      return {
        title: t("sla.modal.recalculate.title"),
        body: t("sla.modal.recalculate.body"),
        confirmLabel: t("sla.modal.recalculate.confirm"),
      };
    default:
      return {
        title: t("sla.modal.default.title"),
        body: t("sla.modal.default.body"),
        confirmLabel: t("sla.modal.default.confirm"),
      };
  }
}

export function SlaManager({ view, transportErrorMessage }: SlaManagerProps) {
  const router = useRouter();
  const { t } = useTranslation();
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
  const activeEmptyState = getActiveEmptyState(emptyState, t);
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
  const pendingActionPrompt = buildActionPrompt(pendingAction, t);
  const recalculationStatus = getRecalculationStatus(
    receiptState,
    lastRecalculationAt,
    t,
  );
  const pendingRecalculation =
    recalculationStatus === t("sla.recalculation.queued");
  const receiptAuditHref =
    auditResourceLink && receiptState?.receipt.auditId
      ? withLinkSearchParams(auditResourceLink, [
          ["auditId", receiptState.receipt.auditId],
        ])
      : null;
  const summaryItems = [
    {
      k: t("sla.summary.updatedAt"),
      v: formatDateTime(profile?.updatedAt),
      mono: true,
    },
    {
      k: t("sla.summary.updatedBy"),
      v: updatedBy ?? "—",
      mono: true,
    },
    {
      k: t("sla.summary.profileState"),
      v: profile
        ? t("sla.summary.profileConfigured")
        : (emptyState?.reason ?? "—"),
      mono: true,
    },
    {
      k: t("sla.summary.recalculationState"),
      v: recalculationStatus,
      mono: true,
    },
    {
      k: t("sla.summary.lastRecalculation"),
      v: lastRecalculationAt
        ? formatDateTime(lastRecalculationAt)
        : t("sla.summary.idle"),
      mono: true,
    },
    {
      k: t("sla.summary.refreshTier"),
      v: refreshTier
        ? `${REFRESH_TIER_CODE[refreshTier]} / ${refreshTier}`
        : "—",
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
          ? t("sla.error.reasonRequiredUpdate")
          : t("sla.error.reasonRequiredRecalculate"),
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
                  t,
                );
                if (!waitValue.ok) {
                  throw new Error(waitValue.message);
                }

                const arrivalValue = parseThresholdValue(
                  arrivalThresholdMin,
                  "arrivalThresholdMin",
                  t,
                );
                if (!arrivalValue.ok) {
                  throw new Error(arrivalValue.message);
                }

                const completionValue = parseThresholdValue(
                  completionThresholdMin,
                  "completionThresholdMin",
                  t,
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
              ? t("sla.error.updateFailed")
              : t("sla.error.recalculateFailed"),
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
          </div>
        </div>
        <div style={noteStyle}>
          {t("sla.empty.messageCode")} · {emptyState?.messageCode ?? "—"}
        </div>
        {nextAction ? (
          <div style={emptyActionStyle}>
            <div style={summaryLabelStyle}>
              {t("sla.empty.recommendedAction")}
            </div>
            <div style={summaryValueStyle}>
              {actionLabel(nextAction.action, t)}
            </div>
            <div style={noteStyle}>{formatActionCaption(nextAction, t)}</div>
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
        title={t("sla.header.title")}
        subtitle={t("sla.header.subtitle")}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <CanvasBtn
              theme={th}
              onClick={() => router.refresh()}
              disabled={isPending}
            >
              {t("sla.header.refresh")}
            </CanvasBtn>
            <CanvasPill theme={th} tone="accent">
              {t("sla.header.refreshTier")} ·{" "}
              {refreshTier
                ? `${REFRESH_TIER_CODE[refreshTier]} / ${refreshTier}`
                : "—"}
            </CanvasPill>
            {refreshMetadataAvailable ? (
              <CanvasPill theme={th} tone={getRefreshTone(refreshMetadata)}>
                {t("sla.header.freshness")} · {refreshMetadata!.dataFreshness}
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
            title={t("sla.banner.actionError")}
            body={actionError}
          />
        ) : null}

        {transportErrorMessage && !view ? (
          <CanvasCard theme={th}>
            <div style={emptyStateStyle}>
              <CanvasPill theme={th} tone="danger">
                {t("sla.empty.transportTone")}
              </CanvasPill>
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontSize: 22, fontWeight: 700 }}>
                  {t("sla.empty.transportTitle")}
                </div>
                <div style={{ ...noteStyle, maxWidth: 560 }}>
                  {t("sla.empty.transportBody")}
                </div>
                <div style={noteStyle}>
                  {t("sla.empty.transportError")} · {transportErrorMessage}
                </div>
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
          <CanvasCard theme={th} title={t("sla.receipt.title")}>
            <CanvasBanner
              theme={th}
              tone={getReceiptTone(receiptState.receipt)}
              title={t("sla.receipt.statusTitle", {
                status: receiptState.receipt.status,
              })}
              body={receiptState.receipt.message}
            />
            <div style={{ height: 12 }} />
            <CanvasDL
              theme={th}
              cols={1}
              items={[
                {
                  k: t("sla.receipt.status"),
                  v: receiptState.receipt.status,
                  mono: true,
                },
                {
                  k: t("sla.receipt.action"),
                  v: receiptState.actionKey,
                  mono: true,
                },
                {
                  k: t("sla.receipt.actionId"),
                  v: receiptState.receipt.actionId,
                  mono: true,
                },
                {
                  k: t("sla.receipt.auditId"),
                  v: receiptState.receipt.auditId,
                  mono: true,
                },
                {
                  k: t("sla.receipt.resource"),
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
                  · auditId={receiptState.receipt.auditId}
                  {isSameTabLink(auditResourceLink) ? " →" : " ↗"}
                </>,
                receiptAuditHref ?? undefined,
                t("sla.receipt.viewAudit"),
              )
            ) : (
              <div style={noteStyle}>
                {t("sla.receipt.auditMissing", {
                  auditId: receiptState.receipt.auditId,
                })}
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
                ? t("sla.banner.recalculationQueuedTitle")
                : t("sla.banner.recalculationHistoryTitle")
            }
            body={
              pendingRecalculation
                ? t("sla.banner.recalculationQueuedBody", {
                    auditId: receiptState?.receipt.auditId ?? "—",
                  })
                : t("sla.banner.recalculationHistoryBody", {
                    time: formatDateTime(lastRecalculationAt),
                  })
            }
          />
        ) : null}

        {refreshMetadataAvailable ? (
          <CanvasBanner
            theme={th}
            tone={getRefreshTone(refreshMetadata)}
            title={t("sla.banner.refreshTitle", {
              code: REFRESH_TIER_CODE[refreshTier!],
              label: getRefreshTierLabel(t, refreshTier!),
            })}
            body={t("sla.banner.refreshBody", {
              source: refreshMetadata!.source,
              generatedAt: formatDateTime(refreshMetadata!.generatedAt),
              staleAfterMs: refreshMetadata!.staleAfterMs,
              nextResync: refreshDeadline
                ? t("sla.banner.refreshNextResync", {
                    time: formatDateTime(
                      new Date(refreshDeadline).toISOString(),
                    ),
                  })
                : "",
            })}
          />
        ) : null}

        {emptyState?.reason === "driver_not_eligible" ? (
          <CanvasBanner
            theme={th}
            tone="danger"
            title={t("sla.banner.unsupportedEmptyTitle")}
            body={t("sla.banner.unsupportedEmptyBody")}
          />
        ) : null}

        {!view && transportErrorMessage ? null : !showEditor ? (
          emptyStateCard
        ) : (
          <div style={sectionStackStyle}>
            {emptyStateCard}
            <div style={gridStyle}>
              <CanvasCard theme={th} title={t("sla.card.thresholds.title")}>
                <CanvasBanner
                  theme={th}
                  tone="info"
                  title={t("sla.card.thresholds.bannerTitle")}
                  body={t("sla.card.thresholds.bannerBody")}
                />

                <div style={{ height: 14 }} />

                <div style={kpiGridStyle}>
                  <CanvasField
                    theme={th}
                    label={t("sla.field.wait.label")}
                    hint={t("sla.field.wait.hint")}
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
                        placeholder={t("sla.field.placeholder")}
                      />
                      <div style={inputMetaStyle}>
                        <span>{t("sla.field.unit")}</span>
                        <span>{t("sla.field.minutes")}</span>
                      </div>
                    </div>
                  </CanvasField>
                  <CanvasField
                    theme={th}
                    label={t("sla.field.arrival.label")}
                    hint={t("sla.field.arrival.hint")}
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
                        placeholder={t("sla.field.placeholder")}
                      />
                      <div style={inputMetaStyle}>
                        <span>{t("sla.field.unit")}</span>
                        <span>{t("sla.field.minutes")}</span>
                      </div>
                    </div>
                  </CanvasField>
                  <CanvasField
                    theme={th}
                    label={t("sla.field.completion.label")}
                    hint={t("sla.field.completion.hint")}
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
                        placeholder={t("sla.field.placeholder")}
                      />
                      <div style={inputMetaStyle}>
                        <span>{t("sla.field.unit")}</span>
                        <span>{t("sla.field.minutes")}</span>
                      </div>
                    </div>
                  </CanvasField>
                </div>

                <div style={footerStyle}>
                  <div style={noteStyle}>
                    {updateAction || recalcAction
                      ? t("sla.footer.actionsAvailable")
                      : t("sla.footer.noActions")}
                    {nextAction ? (
                      <div style={actionHintStyle}>
                        <span>
                          {t("sla.footer.nextAction")} ·{" "}
                          {actionLabel(nextAction.action, t)}
                        </span>
                        <span>{formatActionCaption(nextAction, t)}</span>
                      </div>
                    ) : null}
                    {availableActions.length > 0 ? (
                      <div style={actionHintStyle}>
                        {availableActions.map((action) => (
                          <span key={action.action}>
                            {formatActionCaption(action, t)}
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
                          ? t("sla.action.recalculate")
                          : t("sla.button.recalculateDisabled", {
                              reason: disabledReasonLabel(
                                recalcAction.disabledReasonCode,
                                t,
                              ),
                            })}
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
                          ? t("sla.action.update")
                          : t("sla.button.updateDisabled", {
                              reason: disabledReasonLabel(
                                updateAction.disabledReasonCode,
                                t,
                              ),
                            })}
                      </CanvasBtn>
                    ) : null}
                  </div>
                </div>
              </CanvasCard>

              <CanvasCard theme={th} title={t("sla.card.attainment.title")}>
                <div style={summaryCardStyle}>
                  <CanvasDL theme={th} cols={1} items={summaryItems} />
                  <div style={noteStyle}>{t("sla.card.attainment.body")}</div>
                  <div style={summaryListStyle}>
                    <div>
                      <div style={summaryLabelStyle}>
                        {t("sla.card.attainment.provenance")}
                      </div>
                      <div style={summaryValueStyle}>
                        {formatUpdatedByLine(profile?.updatedAt, updatedBy)}
                      </div>
                    </div>
                    <div>
                      <div style={summaryLabelStyle}>
                        {t("sla.card.attainment.recalculationState")}
                      </div>
                      <div style={summaryValueStyle}>{recalculationStatus}</div>
                    </div>
                    <div>
                      <div style={summaryLabelStyle}>
                        {t("sla.card.attainment.crossAppLinks")}
                      </div>
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
            <CanvasCard theme={th} title={t("sla.card.followUp.title")}>
              <div style={summaryCardStyle}>
                <div style={noteStyle}>{t("sla.card.followUp.body")}</div>
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
                {t("sla.modal.risk", { risk: pendingAction.riskLevel })}
              </CanvasPill>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {pendingActionPrompt.title}
              </div>
              <div style={noteStyle}>{pendingActionPrompt.body}</div>
            </div>
            {pendingAction.requiresReason ? (
              <CanvasField
                theme={th}
                label={t("sla.modal.reasonLabel")}
                hint={t("sla.modal.reasonHint")}
              >
                <textarea
                  value={pendingReason}
                  onChange={(event) => setPendingReason(event.target.value)}
                  style={nativeTextAreaStyle}
                  disabled={isPending}
                  aria-label="pending-action-reason"
                  placeholder={t("sla.modal.reasonPlaceholder")}
                />
              </CanvasField>
            ) : null}
            <div style={modalFooterStyle}>
              <CanvasBtn
                theme={th}
                onClick={closeActionConfirm}
                disabled={isPending}
              >
                {t("sla.modal.cancel")}
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
