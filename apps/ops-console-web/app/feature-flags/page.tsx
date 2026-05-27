import type { CSSProperties, ReactNode } from "react";
import type {
  CrossAppResourceLink,
  EmptyStateEnvelope,
  FeatureFlagVisibilityListResponse,
  FeatureFlagVisibilityRecord,
  FeatureFlagVisibilityScope,
  ResourceActionDescriptor,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasField as Field,
  CanvasIcon,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

export const dynamic = "force-dynamic";

type FeatureFlagsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type FeatureFlagScopeFilter = "all" | FeatureFlagVisibilityScope;

type FeatureFlagFilters = {
  q: string;
  scope: FeatureFlagScopeFilter;
};

type OpsFeatureFlagEmptyReason =
  | "no_data"
  | "not_provisioned"
  | "fetch_failed"
  | "permission_denied"
  | "external_unavailable"
  | "filtered_empty";

type OpsFeatureFlagEmptyState = Omit<EmptyStateEnvelope, "reason"> & {
  reason: OpsFeatureFlagEmptyReason;
};

type FeatureFlagTableRow = Record<string, unknown> & {
  rowKey: string;
  keyCell: ReactNode;
  scopeCell: ReactNode;
  currentValueCell: ReactNode;
  stateCell: ReactNode;
  updatedByCell: ReactNode;
  atCell: ReactNode;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const pageBodyStyle = {
  padding: 24,
  display: "grid",
  gap: 16,
} satisfies CSSProperties;

const toolbarStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 16,
  alignItems: "flex-end",
  justifyContent: "space-between",
  padding: "14px 16px",
  borderBottom: `1px solid ${theme.border}`,
} satisfies CSSProperties;

const searchPanelStyle = {
  display: "grid",
  gap: 12,
  flex: "1 1 420px",
  minWidth: 0,
} satisfies CSSProperties;

const searchFormStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "flex-end",
} satisfies CSSProperties;

const searchInputStyle = {
  width: "100%",
  minWidth: 220,
  boxSizing: "border-box" as const,
  borderRadius: 7,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontFamily: theme.fontFamily,
  fontSize: 12.5,
  padding: "8px 10px",
  outline: "none",
} satisfies CSSProperties;

const scopeRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
} satisfies CSSProperties;

const scopeLabelStyle = {
  fontSize: 11.5,
  fontWeight: 600,
  color: theme.textMuted,
  textTransform: "uppercase" as const,
  letterSpacing: 0.4,
} satisfies CSSProperties;

const snapshotPanelStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
  justifyContent: "flex-end",
} satisfies CSSProperties;

const snapshotMetaStyle = {
  fontSize: 11.5,
  color: theme.textMuted,
  lineHeight: 1.45,
} satisfies CSSProperties;

const registryMetaStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
  padding: "10px 16px",
  borderBottom: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
} satisfies CSSProperties;

const registryMetaTextStyle = {
  fontSize: 11.5,
  color: theme.textMuted,
} satisfies CSSProperties;

const codeStyle = {
  fontFamily: theme.monoFamily,
  fontSize: 11,
  color: theme.textDim,
} satisfies CSSProperties;

const keyCellStyle = {
  display: "grid",
  gap: 5,
  minWidth: 0,
  whiteSpace: "normal" as const,
} satisfies CSSProperties;

const keyTextStyle = {
  display: "inline-flex",
  width: "fit-content",
  padding: "2px 7px",
  borderRadius: 6,
  background: theme.surfaceLo,
  border: `1px solid ${theme.border}`,
  color: theme.text,
  fontFamily: theme.monoFamily,
  fontSize: 11.5,
  lineHeight: 1.35,
} satisfies CSSProperties;

const secondaryTextStyle = {
  fontSize: 11.5,
  color: theme.textMuted,
  lineHeight: 1.45,
  whiteSpace: "normal" as const,
} satisfies CSSProperties;

const scopeCellStyle = {
  display: "grid",
  gap: 5,
  minWidth: 0,
  whiteSpace: "normal" as const,
} satisfies CSSProperties;

const stateCellStyle = {
  display: "grid",
  gap: 6,
  minWidth: 0,
  whiteSpace: "normal" as const,
} satisfies CSSProperties;

const pillRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
} satisfies CSSProperties;

const updatedByCellStyle = {
  display: "grid",
  gap: 5,
  minWidth: 0,
  whiteSpace: "normal" as const,
} satisfies CSSProperties;

const timeCellStyle = {
  display: "grid",
  gap: 5,
  minWidth: 0,
  whiteSpace: "normal" as const,
} satisfies CSSProperties;

const boundaryPanelStyle = {
  display: "grid",
  gap: 6,
  padding: "14px 16px",
  borderTop: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
} satisfies CSSProperties;

const boundaryTitleStyle = {
  fontSize: 12,
  fontWeight: 700,
  color: theme.text,
  textTransform: "uppercase" as const,
  letterSpacing: 0.4,
} satisfies CSSProperties;

const emptyStateStyle = {
  padding: "28px 24px 32px",
  display: "grid",
  gap: 14,
  justifyItems: "center",
  textAlign: "center" as const,
} satisfies CSSProperties;

const emptyIconStyle = {
  width: 52,
  height: 52,
  borderRadius: 16,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
} satisfies CSSProperties;

const emptyBodyStyle = {
  display: "grid",
  gap: 6,
  maxWidth: 540,
} satisfies CSSProperties;

const emptyTitleStyle = {
  fontSize: 16,
  fontWeight: 700,
  color: theme.text,
} satisfies CSSProperties;

const emptyMessageStyle = {
  fontSize: 12.5,
  lineHeight: 1.55,
  color: theme.textMuted,
} satisfies CSSProperties;

const emptyActionsStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  justifyContent: "center",
} satisfies CSSProperties;

function buttonStyle(
  variant: "primary" | "secondary" | "ghost" = "secondary",
  disabled = false,
): CSSProperties {
  const styles =
    variant === "primary"
      ? {
          background: theme.accent,
          color: "#ffffff",
          border: theme.accent,
        }
      : variant === "ghost"
        ? {
            background: "transparent",
            color: theme.textMuted,
            border: "transparent",
          }
        : {
            background: theme.surface,
            color: theme.text,
            border: theme.border,
          };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 32,
    padding: "0 12px",
    borderRadius: 7,
    border: `1px solid ${styles.border}`,
    background: styles.background,
    color: styles.color,
    fontFamily: theme.fontFamily,
    fontSize: 12,
    fontWeight: 500,
    textDecoration: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    whiteSpace: "nowrap",
  };
}

function filterChipStyle(active: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 10px",
    borderRadius: 999,
    border: `1px solid ${active ? theme.accent : theme.border}`,
    background: active ? theme.accentBg : theme.surface,
    color: active ? theme.accentHi : theme.textMuted,
    fontSize: 11.5,
    fontWeight: active ? 700 : 500,
    textDecoration: "none",
    whiteSpace: "nowrap",
  };
}

function inlineLinkStyle(tone: CanvasTone = "accent"): CSSProperties {
  const colorMap: Record<CanvasTone, string> = {
    neutral: theme.textMuted,
    info: theme.info,
    success: theme.success,
    warn: theme.warn,
    danger: theme.danger,
    accent: theme.accent,
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    color: colorMap[tone],
    textDecoration: "none",
    fontSize: 11.5,
    fontWeight: 600,
    whiteSpace: "nowrap",
  };
}

function copy(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveFilters(
  searchParams?: Record<string, string | string[] | undefined>,
): FeatureFlagFilters {
  const rawScope = firstParam(searchParams?.scope);
  const scope: FeatureFlagScopeFilter =
    rawScope === "global" || rawScope === "tenant" ? rawScope : "all";

  return {
    q: (firstParam(searchParams?.q) ?? "").trim(),
    scope,
  };
}

function buildPageHref(
  filters: FeatureFlagFilters,
  overrides: Partial<FeatureFlagFilters> = {},
  extras?: Record<string, string>,
) {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams();

  if (next.q) {
    params.set("q", next.q);
  }
  if (next.scope !== "all") {
    params.set("scope", next.scope);
  }
  Object.entries(extras ?? {}).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const query = params.toString();
  return query ? `/feature-flags?${query}` : "/feature-flags";
}

function formatDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return `${new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(date)
    .replace(",", "")} UTC`;
}

function dataFreshnessTone(
  freshness: FeatureFlagVisibilityListResponse["refresh"]["dataFreshness"],
): CanvasTone {
  switch (freshness) {
    case "fresh":
      return "success";
    case "stale":
      return "warn";
    case "degraded":
      return "danger";
    default:
      return "info";
  }
}

function searchActionLabel(locale: Locale) {
  return copy(locale, "Search", "搜尋");
}

function viewHistoryLabel(locale: Locale) {
  return copy(locale, "View history", "檢視變更紀錄");
}

function platformAdminLabel(locale: Locale) {
  return copy(
    locale,
    "Open Platform Admin /feature-flags",
    "前往 Platform Admin /feature-flags",
  );
}

function clearFiltersLabel(locale: Locale) {
  return copy(locale, "Clear filters", "清除篩選");
}

function normalizeAppBaseUrl(value: string | undefined, fallback: string) {
  const resolved = (value ?? fallback).trim();
  return resolved.replace(/\/+$/, "");
}

function appBaseUrl(targetApp: CrossAppResourceLink["targetApp"]) {
  switch (targetApp) {
    case "platform-admin":
      return normalizeAppBaseUrl(
        process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ??
          process.env.PLATFORM_ADMIN_URL,
        "http://localhost:3002",
      );
    case "tenant-console":
      return normalizeAppBaseUrl(
        process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL ??
          process.env.TENANT_CONSOLE_URL,
        "http://localhost:3004",
      );
    case "ops-console":
    default:
      return normalizeAppBaseUrl(
        process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? process.env.OPS_CONSOLE_URL,
        "http://localhost:3003",
      );
  }
}

function resolveCrossAppHref(link: CrossAppResourceLink) {
  if (/^https?:\/\//i.test(link.route)) {
    return link.route;
  }

  return new URL(link.route, `${appBaseUrl(link.targetApp)}/`).toString();
}

function shouldOpenInNewTab(link: CrossAppResourceLink) {
  return link.openMode === "new_tab" || link.targetApp !== "ops-console";
}

function defaultOwnerAppLink(locale: Locale): CrossAppResourceLink {
  return {
    targetApp: "platform-admin",
    route: "/feature-flags",
    resourceType: "feature_flag_registry",
    resourceId: "platform-defaults",
    openMode: "new_tab",
    label: platformAdminLabel(locale),
  };
}

function normalizeFeatureFlagsEmptyState(
  emptyState: EmptyStateEnvelope | null | undefined,
): OpsFeatureFlagEmptyState | undefined {
  if (!emptyState) {
    return undefined;
  }

  const reason: OpsFeatureFlagEmptyReason = (() => {
    switch (emptyState.reason) {
      case "no_data":
      case "not_provisioned":
      case "fetch_failed":
      case "permission_denied":
      case "external_unavailable":
      case "filtered_empty":
        return emptyState.reason;
      case "driver_not_eligible":
        // Driver-only empty state is outside the ops packet surface; collapse
        // it into an existing management-app treatment instead of adding a
        // seventh visual branch on this page.
        return "permission_denied";
    }
  })();

  return {
    ...emptyState,
    reason,
  };
}

function normalizeResponse(
  response: FeatureFlagVisibilityListResponse,
  locale: Locale,
): FeatureFlagVisibilityListResponse {
  const ownerAppLink = response.ownerAppLink ?? defaultOwnerAppLink(locale);
  const normalizedEmptyState = normalizeFeatureFlagsEmptyState(
    response.emptyState,
  );

  return {
    items: (response.items ?? []).map((item) => ({
      ...item,
      description: item.description || "—",
      scope: item.scope === "tenant" ? "tenant" : "global",
      rolloutState: item.rolloutState === "partial" ? "partial" : "uniform",
      availableActions: item.availableActions ?? [],
      ownerLink: item.ownerLink ?? ownerAppLink,
      historyLink: item.historyLink ?? null,
    })),
    refresh: response.refresh ?? {
      generatedAt: new Date().toISOString(),
      staleAfterMs: 0,
      dataFreshness: "unknown",
      source: "static",
    },
    availableActions: response.availableActions ?? [],
    ...(normalizedEmptyState ? { emptyState: normalizedEmptyState } : {}),
    ...(ownerAppLink ? { ownerAppLink } : {}),
  };
}

async function loadFeatureFlags(locale: Locale) {
  const client = await getServerOpsClient();

  try {
    const response = await client.getOpsFeatureFlags();
    return {
      response: normalizeResponse(response, locale),
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : copy(locale, "Unknown error", "未知錯誤");

    return {
      response: normalizeResponse(
        {
          items: [],
          refresh: {
            generatedAt: new Date().toISOString(),
            staleAfterMs: 0,
            dataFreshness: "unknown",
            source: "static",
          },
          emptyState: {
            reason: "fetch_failed",
            messageCode: message,
          },
          availableActions: [],
          ownerAppLink: defaultOwnerAppLink(locale),
        },
        locale,
      ),
    };
  }
}

function filterItems(
  items: FeatureFlagVisibilityRecord[],
  filters: FeatureFlagFilters,
) {
  return items.filter((item) => {
    if (filters.scope !== "all" && item.scope !== filters.scope) {
      return false;
    }

    if (!filters.q) {
      return true;
    }

    return item.key.toLowerCase().includes(filters.q.toLowerCase());
  });
}

function sortItems(items: FeatureFlagVisibilityRecord[]) {
  return [...items].sort((left, right) => {
    const keyCompare = left.key.localeCompare(right.key);
    if (keyCompare !== 0) {
      return keyCompare;
    }

    if (left.scope !== right.scope) {
      return left.scope === "global" ? -1 : 1;
    }

    return (left.tenantLabel ?? left.tenantId ?? "").localeCompare(
      right.tenantLabel ?? right.tenantId ?? "",
    );
  });
}

function actionTooltip(
  locale: Locale,
  descriptor: ResourceActionDescriptor | undefined,
) {
  if (!descriptor?.disabledReasonCode) {
    return undefined;
  }

  return formatOpsCodeLabel(locale, descriptor.disabledReasonCode);
}

function findAction(
  actions: ResourceActionDescriptor[],
  candidates: string[],
): ResourceActionDescriptor | undefined {
  return actions.find((action) => candidates.includes(action.action));
}

function isSearchAction(action: ResourceActionDescriptor) {
  const normalizedAction = action.action.toLowerCase();
  return (
    normalizedAction === "search" ||
    normalizedAction === "search_by_key" ||
    normalizedAction === "filter"
  );
}

function searchAction(actions: ResourceActionDescriptor[]) {
  return findAction(actions, ["search", "search_by_key", "filter"]);
}

function ownerAppAction(actions: ResourceActionDescriptor[]) {
  return findAction(actions, [
    "open_owner_app",
    "view_owner_app",
    "open_platform_admin",
    "manage_feature_flags",
  ]);
}

function historyAction(record: FeatureFlagVisibilityRecord) {
  return findAction(record.availableActions, [
    "view_change_history",
    "view_history",
    "audit_history",
  ]);
}

function refreshAction(actions: ResourceActionDescriptor[]) {
  return findAction(actions, [
    "refresh",
    "manual_refresh",
    "retry",
    "retry_fetch",
  ]);
}

function externalAnchorProps(link: CrossAppResourceLink) {
  return shouldOpenInNewTab(link)
    ? {
        target: "_blank",
        rel: "noreferrer",
      }
    : {};
}

function renderHistoryLink(
  record: FeatureFlagVisibilityRecord,
  locale: Locale,
) {
  const descriptor = historyAction(record);
  if (!descriptor) {
    return (
      <span style={{ ...secondaryTextStyle, color: theme.textDim }}>
        {copy(locale, "History not exposed", "尚未提供歷史紀錄")}
      </span>
    );
  }

  if (!descriptor.enabled) {
    return (
      <span
        style={{ ...secondaryTextStyle, color: theme.textDim }}
        title={actionTooltip(locale, descriptor)}
      >
        {copy(locale, "History unavailable", "歷史紀錄不可用")}
      </span>
    );
  }

  if (!record.historyLink) {
    return (
      <span style={{ ...secondaryTextStyle, color: theme.textDim }}>
        {copy(locale, "History link unavailable", "未提供歷史紀錄連結")}
      </span>
    );
  }

  const link = record.historyLink;
  return (
    <a
      href={resolveCrossAppHref(link)}
      style={inlineLinkStyle("accent")}
      {...externalAnchorProps(link)}
    >
      <span>{link.label || viewHistoryLabel(locale)}</span>
      {shouldOpenInNewTab(link) ? <CanvasIcon name="ext" size={11} /> : null}
    </a>
  );
}

function currentValueSummary(
  record: FeatureFlagVisibilityRecord,
  locale: Locale,
) {
  return (
    <div style={stateCellStyle}>
      <div style={pillRowStyle}>
        <Pill theme={theme} tone={record.enabled ? "success" : "neutral"} dot>
          {record.enabled
            ? t("flags.state.enabled", locale)
            : t("flags.state.disabled", locale)}
        </Pill>
      </div>
      <span style={secondaryTextStyle}>
        {record.enabled
          ? copy(
              locale,
              "Current scope resolves to enabled.",
              "目前此範圍解析為 enabled。",
            )
          : copy(
              locale,
              "Current scope resolves to disabled.",
              "目前此範圍解析為 disabled。",
            )}
      </span>
    </div>
  );
}

function stateSummary(record: FeatureFlagVisibilityRecord, locale: Locale) {
  return (
    <div style={stateCellStyle}>
      <div style={pillRowStyle}>
        {record.rolloutState === "partial" ? (
          <Pill theme={theme} tone="warn">
            {t("flags.midRollout", locale)}
          </Pill>
        ) : (
          <Pill theme={theme} tone="info">
            {copy(locale, "Uniform", "一致")}
          </Pill>
        )}
      </div>
      {record.rolloutSummary ? (
        <span style={secondaryTextStyle}>{record.rolloutSummary}</span>
      ) : record.rolloutState === "partial" ? (
        <span style={secondaryTextStyle}>
          {t("flags.partialStateHelp", locale)}
        </span>
      ) : (
        <span style={secondaryTextStyle}>
          {copy(
            locale,
            "No tenant-visible divergence in this snapshot.",
            "目前快照中沒有 tenant 可見差異。",
          )}
        </span>
      )}
    </div>
  );
}

function rowForRecord(
  record: FeatureFlagVisibilityRecord,
  locale: Locale,
): FeatureFlagTableRow {
  return {
    rowKey: `${record.key}:${record.scope}:${record.tenantId ?? "global"}`,
    keyCell: (
      <div style={keyCellStyle}>
        <span style={keyTextStyle}>{record.key}</span>
        <span style={secondaryTextStyle}>{record.description}</span>
      </div>
    ),
    scopeCell: (
      <div style={scopeCellStyle}>
        <div style={pillRowStyle}>
          <Pill
            theme={theme}
            tone={record.scope === "tenant" ? "warn" : "info"}
          >
            {t(
              record.scope === "tenant"
                ? "flags.scope.tenant"
                : "flags.scope.global",
              locale,
            )}
          </Pill>
          {record.rolloutState === "partial" ? (
            <Pill theme={theme} tone="warn">
              {t("flags.state.partial", locale)}
            </Pill>
          ) : null}
        </div>
        {record.scope === "tenant" ? (
          <span style={secondaryTextStyle}>
            {record.tenantLabel ?? record.tenantId ?? "—"}
          </span>
        ) : (
          <span style={secondaryTextStyle}>
            {copy(
              locale,
              "Platform default visible to ops scopes",
              "ops 可見的 platform default",
            )}
          </span>
        )}
      </div>
    ),
    currentValueCell: currentValueSummary(record, locale),
    stateCell: stateSummary(record, locale),
    updatedByCell: (
      <div style={updatedByCellStyle}>
        <span style={{ fontSize: 12.5, color: theme.text }}>
          {record.lastChangedBy || "—"}
        </span>
        {record.ownerLink ? (
          <a
            href={resolveCrossAppHref(record.ownerLink)}
            style={inlineLinkStyle("info")}
            {...externalAnchorProps(record.ownerLink)}
          >
            <span>{record.ownerLink.label}</span>
            {shouldOpenInNewTab(record.ownerLink) ? (
              <CanvasIcon name="ext" size={11} />
            ) : null}
          </a>
        ) : (
          <span style={secondaryTextStyle}>
            {copy(locale, "Read-only mirror", "唯讀鏡像")}
          </span>
        )}
      </div>
    ),
    atCell: (
      <div style={timeCellStyle}>
        <span style={codeStyle}>
          {formatDateTime(locale, record.lastChangedAt)}
        </span>
        {renderHistoryLink(record, locale)}
      </div>
    ),
  };
}

function bannerForFreshness(
  locale: Locale,
  refresh: FeatureFlagVisibilityListResponse["refresh"],
) {
  if (refresh.dataFreshness === "fresh") {
    return null;
  }

  const title =
    refresh.dataFreshness === "degraded"
      ? copy(locale, "Flag snapshot degraded", "旗標快照已降級")
      : refresh.dataFreshness === "stale"
        ? copy(locale, "Showing a stale snapshot", "目前顯示的是過期快照")
        : copy(locale, "Snapshot freshness unknown", "快照新鮮度未知");

  const body = copy(
    locale,
    `Generated ${formatDateTime(locale, refresh.generatedAt)} from ${formatOpsCodeLabel(
      locale,
      refresh.source,
    )}. Use manual refresh before treating a missing feature as a bug.`,
    `此快照於 ${formatDateTime(locale, refresh.generatedAt)} 自 ${formatOpsCodeLabel(
      locale,
      refresh.source,
    )} 產生。若要判斷功能缺口是否真為 bug，請先手動 refresh。`,
  );

  return (
    <Banner
      theme={theme}
      tone={refresh.dataFreshness === "degraded" ? "danger" : "warn"}
      icon={refresh.dataFreshness === "degraded" ? "warn" : "clock"}
      title={title}
      body={body}
    />
  );
}

function resolveEmptyState(
  response: FeatureFlagVisibilityListResponse,
  visibleItems: FeatureFlagVisibilityRecord[],
  filters: FeatureFlagFilters,
): OpsFeatureFlagEmptyState | null {
  if (visibleItems.length > 0) {
    return null;
  }

  const normalizedEmptyState = normalizeFeatureFlagsEmptyState(
    response.emptyState,
  );

  if (response.items.length === 0) {
    return (
      normalizedEmptyState ?? {
        reason: "no_data",
        messageCode: "flags.empty",
      }
    );
  }

  if (filters.q || filters.scope !== "all") {
    return {
      reason: "filtered_empty",
      messageCode: "flags.empty.filtered",
    };
  }

  return (
    normalizedEmptyState ?? {
      reason: "no_data",
      messageCode: "flags.empty",
    }
  );
}

function emptyStateCopy(
  locale: Locale,
  state: OpsFeatureFlagEmptyState,
): {
  tone: CanvasTone;
  icon: "check" | "flags" | "warn" | "x" | "filter" | "clock";
  title: string;
  body: string;
} {
  const translatedMessage =
    state.messageCode && t(state.messageCode, locale) !== state.messageCode
      ? t(state.messageCode, locale)
      : null;

  switch (state.reason) {
    case "not_provisioned":
      return {
        tone: "info",
        icon: "flags",
        title: copy(
          locale,
          "Feature visibility is not provisioned",
          "功能旗標可見性尚未啟用",
        ),
        body:
          translatedMessage ??
          copy(
            locale,
            "This scope does not have a flag feed yet. Use the write-authority surface to confirm whether provisioning is still pending.",
            "目前這個範圍尚未提供旗標 feed。請到 write-authority surface 確認是否仍在 provisioning 中。",
          ),
      };
    case "fetch_failed":
      return {
        tone: "danger",
        icon: "x",
        title: copy(
          locale,
          "Unable to load the flag registry",
          "無法載入旗標名冊",
        ),
        body:
          translatedMessage ??
          copy(
            locale,
            "The backend did not return a usable snapshot. Retry manual refresh before assuming a feature was removed.",
            "後端沒有回傳可用快照。請先手動 refresh，再判斷功能是否真的被移除。",
          ),
      };
    case "permission_denied":
      return {
        tone: "warn",
        icon: "warn",
        title: copy(
          locale,
          "You do not have scope to inspect these flags",
          "你目前沒有權限檢視這些旗標",
        ),
        body:
          translatedMessage ??
          copy(
            locale,
            "The API recognized your session but refused this view. Switch role or use the owner app if you need a broader audit trail.",
            "API 已辨識目前 session，但拒絕這個檢視。若需要更完整的稽核視角，請切換角色或改到 owner app。",
          ),
      };
    case "external_unavailable":
      return {
        tone: "warn",
        icon: "clock",
        title: copy(
          locale,
          "Upstream flag source is unavailable",
          "上游旗標來源暫時不可用",
        ),
        body:
          translatedMessage ??
          copy(
            locale,
            "The read model depends on an external system that is currently degraded. Treat this as a supply-side visibility issue, not a feature verdict.",
            "此讀模型依賴的外部系統目前降級。請把它視為可見性問題，而不是功能結論。",
          ),
      };
    case "filtered_empty":
      return {
        tone: "info",
        icon: "filter",
        title: copy(
          locale,
          "No flags match the current filters",
          "目前篩選條件下沒有符合的旗標",
        ),
        body:
          translatedMessage ??
          copy(
            locale,
            "Broaden the key search or switch scope back to all visible flags.",
            "放寬 key 搜尋條件，或把 scope 切回全部可見旗標。",
          ),
      };
    case "no_data":
    default:
      return {
        tone: "success",
        icon: "check",
        title: copy(
          locale,
          "No visible flags in this scope",
          "這個範圍目前沒有可見旗標",
        ),
        body:
          translatedMessage ??
          copy(
            locale,
            "This can be a legitimate empty state. Ops should distinguish this from provisioning or backend failure before escalating.",
            "這可能是合法空狀態。升級處理前，請先區分這是否為 provisioning 或 backend failure。",
          ),
      };
  }
}

function actionLabel(locale: Locale, action: ResourceActionDescriptor) {
  const normalizedAction = action.action.toLowerCase();
  if (
    normalizedAction === "open_owner_app" ||
    normalizedAction === "view_owner_app" ||
    normalizedAction === "open_platform_admin" ||
    normalizedAction === "manage_feature_flags"
  ) {
    return platformAdminLabel(locale);
  }
  if (
    normalizedAction === "refresh" ||
    normalizedAction === "manual_refresh" ||
    normalizedAction === "retry" ||
    normalizedAction === "retry_fetch"
  ) {
    return t("common.refresh", locale);
  }
  if (
    normalizedAction === "clear_filters" ||
    normalizedAction === "reset_filters" ||
    normalizedAction === "clear_search" ||
    normalizedAction === "reset_search"
  ) {
    return clearFiltersLabel(locale);
  }
  if (action.action === "search" || action.action === "search_by_key") {
    return searchActionLabel(locale);
  }
  if (
    action.action === "view_change_history" ||
    action.action === "view_history"
  ) {
    return viewHistoryLabel(locale);
  }
  return formatOpsCodeLabel(locale, action.action);
}

type ResolvedActionTarget = {
  href: string;
  link?: CrossAppResourceLink;
};

function resolveActionTarget(
  action: ResourceActionDescriptor,
  filters: FeatureFlagFilters,
  ownerAppLink: CrossAppResourceLink,
): ResolvedActionTarget | null {
  if (isSearchAction(action)) {
    return {
      href: `${buildPageHref(filters)}#feature-flag-search`,
    };
  }

  const normalizedAction = action.action.toLowerCase();
  if (
    normalizedAction === "clear_filters" ||
    normalizedAction === "reset_filters" ||
    normalizedAction === "clear_search" ||
    normalizedAction === "reset_search"
  ) {
    return {
      href: "/feature-flags#feature-flag-search",
    };
  }

  if (
    normalizedAction === "refresh" ||
    normalizedAction === "manual_refresh" ||
    normalizedAction === "retry" ||
    normalizedAction === "retry_fetch"
  ) {
    return {
      href: buildPageHref(filters, {}, { refresh: String(Date.now()) }),
    };
  }

  if (
    normalizedAction === "open_owner_app" ||
    normalizedAction === "view_owner_app" ||
    normalizedAction === "open_platform_admin" ||
    normalizedAction === "manage_feature_flags" ||
    normalizedAction.includes("owner_app") ||
    normalizedAction.includes("platform_admin")
  ) {
    return {
      href: resolveCrossAppHref(ownerAppLink),
      link: ownerAppLink,
    };
  }

  return null;
}

function actionDisplayLabel(
  locale: Locale,
  action: ResourceActionDescriptor,
  target?: ResolvedActionTarget | null,
) {
  if (
    target?.link &&
    ownerAppAction([action]) &&
    target.link.label.trim().length > 0
  ) {
    return target.link.label;
  }

  return actionLabel(locale, action);
}

function renderResolvedAction(
  locale: Locale,
  action: ResourceActionDescriptor,
  filters: FeatureFlagFilters,
  ownerAppLink: CrossAppResourceLink,
  variant: "primary" | "secondary" | "ghost" = "secondary",
) {
  const target = resolveActionTarget(action, filters, ownerAppLink);
  const label = actionDisplayLabel(locale, action, target);

  if (target && action.enabled) {
    return (
      <a
        href={target.href}
        style={buttonStyle(variant)}
        title={actionTooltip(locale, action)}
        {...(target.link ? externalAnchorProps(target.link) : {})}
      >
        <span>{label}</span>
        {target.link && shouldOpenInNewTab(target.link) ? (
          <CanvasIcon name="ext" size={12} />
        ) : null}
      </a>
    );
  }

  return (
    <span
      style={buttonStyle(variant, !action.enabled)}
      title={actionTooltip(locale, action)}
    >
      {label}
    </span>
  );
}

function renderEmptyState(
  locale: Locale,
  state: OpsFeatureFlagEmptyState,
  filters: FeatureFlagFilters,
  ownerAppLink: CrossAppResourceLink,
) {
  const copyBlock = emptyStateCopy(locale, state);
  const nextActionTarget = state.nextAction
    ? resolveActionTarget(state.nextAction, filters, ownerAppLink)
    : null;
  const showResetButton =
    state.reason === "filtered_empty" &&
    nextActionTarget?.href !== "/feature-flags#feature-flag-search";

  return (
    <div style={emptyStateStyle}>
      <div
        style={{
          ...emptyIconStyle,
          color:
            copyBlock.tone === "danger"
              ? theme.danger
              : copyBlock.tone === "warn"
                ? theme.warn
                : copyBlock.tone === "success"
                  ? theme.success
                  : theme.info,
        }}
      >
        <CanvasIcon name={copyBlock.icon} size={24} />
      </div>
      <div style={emptyBodyStyle}>
        <div style={emptyTitleStyle}>{copyBlock.title}</div>
        <div style={emptyMessageStyle}>{copyBlock.body}</div>
      </div>
      <div style={emptyActionsStyle}>
        {showResetButton ? (
          <a href="/feature-flags" style={buttonStyle("secondary")}>
            {clearFiltersLabel(locale)}
          </a>
        ) : null}
        {state.nextAction
          ? renderResolvedAction(
              locale,
              state.nextAction,
              filters,
              ownerAppLink,
            )
          : null}
      </div>
      {filters.q || filters.scope !== "all" ? (
        <span style={secondaryTextStyle}>
          {copy(
            locale,
            `Current filters: ${filters.q || "—"} / ${filters.scope}`,
            `目前篩選：${filters.q || "—"} / ${filters.scope}`,
          )}
        </span>
      ) : null}
    </div>
  );
}

export default async function FeatureFlagsPage({
  searchParams,
}: FeatureFlagsPageProps) {
  const [locale, resolvedSearchParams] = await Promise.all([
    getServerLocale(),
    searchParams ?? Promise.resolve({}),
  ]);

  const filters = resolveFilters(resolvedSearchParams);
  const { response } = await loadFeatureFlags(locale);
  const ownerAppLink = response.ownerAppLink ?? defaultOwnerAppLink(locale);
  const visibleItems = sortItems(filterItems(response.items, filters));
  const emptyState = resolveEmptyState(response, visibleItems, filters);
  const searchDescriptor = searchAction(response.availableActions);
  const ownerDescriptor = ownerAppAction(response.availableActions);
  const refreshDescriptor = refreshAction(response.availableActions);

  const visibleEnabledCount = visibleItems.filter(
    (item) => item.enabled,
  ).length;
  const visibleDisabledCount = visibleItems.length - visibleEnabledCount;
  const partialCount = visibleItems.filter(
    (item) => item.rolloutState === "partial",
  ).length;
  const tenantScopedCount = visibleItems.filter(
    (item) => item.scope === "tenant",
  ).length;

  const rows = visibleItems.map((record) => rowForRecord(record, locale));
  const columns: CanvasTableColumn<FeatureFlagTableRow>[] = [
    {
      h: t("flags.col.key", locale).toUpperCase(),
      w: 340,
      r: (row) => row.keyCell as ReactNode,
    },
    {
      h: t("flags.col.scope", locale),
      w: 180,
      r: (row) => row.scopeCell as ReactNode,
    },
    {
      h: t("flags.col.currentValue", locale),
      w: 180,
      r: (row) => row.currentValueCell as ReactNode,
    },
    {
      h: t("flags.col.state", locale),
      w: 210,
      r: (row) => row.stateCell as ReactNode,
    },
    {
      h: t("flags.col.updatedBy", locale),
      w: 240,
      r: (row) => row.updatedByCell as ReactNode,
    },
    {
      h: t("flags.col.updatedAt", locale),
      w: 220,
      r: (row) => row.atCell as ReactNode,
    },
  ];

  return (
    <>
      <PageHeader
        theme={theme}
        title={t("flags.title", locale)}
        subtitle={t("flags.subtitleReadOnly", locale)}
        actions={
          ownerDescriptor
            ? renderResolvedAction(
                locale,
                ownerDescriptor,
                filters,
                ownerAppLink,
                "primary",
              )
            : null
        }
      />

      <div style={pageBodyStyle}>
        {bannerForFreshness(locale, response.refresh)}

        <Card theme={theme} padding={0}>
          <div style={toolbarStyle}>
            <div style={searchPanelStyle}>
              {searchDescriptor ? (
                <form
                  action="/feature-flags"
                  method="get"
                  style={searchFormStyle}
                >
                  {filters.scope !== "all" ? (
                    <input type="hidden" name="scope" value={filters.scope} />
                  ) : null}
                  <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                    <Field
                      theme={theme}
                      label={t("flags.searchPlaceholder", locale)}
                      hint={copy(
                        locale,
                        "Low-risk local filter. Use exact prefixes like dispatch., forwarder., partner.",
                        "低風險本地篩選。可直接用 dispatch.、forwarder.、partner. 等 prefix。",
                      )}
                    >
                      <input
                        id="feature-flag-search"
                        name="q"
                        defaultValue={filters.q}
                        placeholder={t("flags.searchPlaceholder", locale)}
                        aria-label={t("flags.searchPlaceholder", locale)}
                        style={searchInputStyle}
                      />
                    </Field>
                  </div>
                  <button
                    type="submit"
                    disabled={!searchDescriptor.enabled}
                    title={actionTooltip(locale, searchDescriptor)}
                    style={buttonStyle("secondary", !searchDescriptor.enabled)}
                  >
                    {searchActionLabel(locale)}
                  </button>
                  {(filters.q || filters.scope !== "all") && (
                    <a href="/feature-flags" style={buttonStyle("ghost")}>
                      {clearFiltersLabel(locale)}
                    </a>
                  )}
                </form>
              ) : (
                <div style={searchFormStyle}>
                  <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                    <Field
                      theme={theme}
                      label={t("flags.searchPlaceholder", locale)}
                      hint={copy(
                        locale,
                        "Search is not available for this snapshot. Scope filters remain visible for context only.",
                        "這個快照目前不提供搜尋操作；scope 篩選會保留作為閱讀輔助。",
                      )}
                    >
                      <input
                        id="feature-flag-search"
                        value={filters.q}
                        placeholder={t("flags.searchPlaceholder", locale)}
                        aria-label={t("flags.searchPlaceholder", locale)}
                        style={searchInputStyle}
                        disabled
                        readOnly
                      />
                    </Field>
                  </div>
                  {(filters.q || filters.scope !== "all") && (
                    <a href="/feature-flags" style={buttonStyle("ghost")}>
                      {clearFiltersLabel(locale)}
                    </a>
                  )}
                </div>
              )}

              <div style={scopeRowStyle}>
                <span style={scopeLabelStyle}>
                  {t("flags.col.scope", locale)}
                </span>
                {(["all", "global", "tenant"] as const).map((scope) => (
                  <a
                    key={scope}
                    href={buildPageHref(filters, { scope })}
                    style={filterChipStyle(scope === filters.scope)}
                  >
                    {t(
                      scope === "all"
                        ? "flags.scope.all"
                        : scope === "global"
                          ? "flags.scope.global"
                          : "flags.scope.tenant",
                      locale,
                    )}
                  </a>
                ))}
              </div>
            </div>

            <div style={snapshotPanelStyle}>
              <Pill theme={theme} tone="info">
                {t("flags.refreshTier.manual", locale)}
              </Pill>
              <Pill
                theme={theme}
                tone={dataFreshnessTone(response.refresh.dataFreshness)}
              >
                {t(`flags.freshness.${response.refresh.dataFreshness}`, locale)}
              </Pill>
              <span style={snapshotMetaStyle}>
                {t("flags.staleBanner.body", locale, {
                  freshness: t(
                    `flags.freshness.${response.refresh.dataFreshness}`,
                    locale,
                  ),
                  generatedAt: formatDateTime(
                    locale,
                    response.refresh.generatedAt,
                  ),
                })}
              </span>
              {refreshDescriptor
                ? renderResolvedAction(
                    locale,
                    refreshDescriptor,
                    filters,
                    ownerAppLink,
                  )
                : null}
            </div>
          </div>

          <div style={registryMetaStyle}>
            <span style={registryMetaTextStyle}>
              {t("flags.registrySummaryV2", locale, {
                total: response.items.length,
                enabled: visibleEnabledCount,
                partial: partialCount,
                tenant: tenantScopedCount,
              })}
            </span>
            <Pill theme={theme} tone="success">
              {t("flags.state.enabled", locale)} · {visibleEnabledCount}
            </Pill>
            <Pill theme={theme} tone="neutral">
              {t("flags.state.disabled", locale)} · {visibleDisabledCount}
            </Pill>
            <Pill theme={theme} tone="warn">
              {t("flags.midRollout", locale)} · {partialCount}
            </Pill>
            <span style={codeStyle}>GET /api/ops/feature-flags · T6</span>
          </div>

          {emptyState ? (
            renderEmptyState(locale, emptyState, filters, ownerAppLink)
          ) : (
            <Table theme={theme} columns={columns} rows={rows} />
          )}
          <div style={boundaryPanelStyle}>
            <div style={boundaryTitleStyle}>
              {t("flags.registryTitle", locale)}
            </div>
            <span style={secondaryTextStyle}>
              {t("flags.registrySubtitle", locale)}
            </span>
            <span style={secondaryTextStyle}>
              {t("flags.registryFooterV2", locale)}
            </span>
            <span style={secondaryTextStyle}>
              {t("flags.boundary.readOnly", locale)}
            </span>
            <span style={secondaryTextStyle}>
              {t("flags.boundary.deepLink", locale)}
            </span>
          </div>
        </Card>
      </div>
    </>
  );
}
