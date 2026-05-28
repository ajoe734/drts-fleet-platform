import type { CSSProperties, ReactNode } from "react";
import type {
  CrossAppResourceLink,
  EmptyStateEnvelope,
  FeatureFlagSummary,
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

function defaultSearchAction(): ResourceActionDescriptor {
  return {
    action: "search",
    enabled: true,
    riskLevel: "low",
  };
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

function isOperationalLegacyFlag(key: string) {
  return !key.startsWith("driver-app.") && !key.startsWith("tenant-portal.");
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

function mapLegacySummary(
  summary: FeatureFlagSummary,
  locale: Locale,
): FeatureFlagVisibilityListResponse {
  const ownerAppLink = defaultOwnerAppLink(locale);

  const items: FeatureFlagVisibilityRecord[] = summary.flags
    .filter((flag) => isOperationalLegacyFlag(flag.key))
    .map((flag) => ({
      key: flag.key,
      description: flag.description || "—",
      enabled: Boolean(flag.enabled),
      scope: flag.tenantId ? "tenant" : "global",
      tenantId: flag.tenantId ?? null,
      tenantLabel: flag.tenantId ?? null,
      rolloutState: "uniform",
      rolloutSummary: null,
      lastChangedAt: flag.updatedAt,
      lastChangedBy: copy(
        locale,
        "Contract not exposed",
        "contract 尚未帶出操作者",
      ),
      availableActions: [],
      historyLink: null,
      ownerLink: ownerAppLink,
    }));

  return {
    items,
    refresh: {
      generatedAt: new Date().toISOString(),
      staleAfterMs: 0,
      dataFreshness: "unknown",
      source: "cache",
    },
    ...(items.length === 0
      ? {
          emptyState: {
            reason: "no_data",
            messageCode: "flags.empty",
          } satisfies EmptyStateEnvelope,
        }
      : {}),
    availableActions: [defaultSearchAction()],
    ownerAppLink,
  };
}

function normalizeResponse(
  response: FeatureFlagVisibilityListResponse,
  locale: Locale,
): FeatureFlagVisibilityListResponse {
  const ownerAppLink = response.ownerAppLink ?? defaultOwnerAppLink(locale);
  const pageActions = [...(response.availableActions ?? [])];
  const normalizedEmptyState = normalizeFeatureFlagsEmptyState(
    response.emptyState,
  );

  if (!pageActions.some((action) => action.action === "search")) {
    pageActions.push(defaultSearchAction());
  }

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
    availableActions: pageActions,
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
      fallbackNotice: null as string | null,
    };
  } catch (opsError) {
    try {
      const legacySummary = await client.getFeatureFlags();
      return {
        response: mapLegacySummary(legacySummary, locale),
        fallbackNotice: copy(
          locale,
          "Using legacy admin flag summary until the actor-filtered ops endpoint is available.",
          "目前先以 legacy admin flag summary 呈現，直到 actor-filtered 的 ops endpoint 完成對接。",
        ),
      };
    } catch (legacyError) {
      const message =
        legacyError instanceof Error
          ? legacyError.message
          : opsError instanceof Error
            ? opsError.message
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
            availableActions: [defaultSearchAction()],
            ownerAppLink: defaultOwnerAppLink(locale),
          },
          locale,
        ),
        fallbackNotice: null,
      };
    }
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

function searchAction(actions: ResourceActionDescriptor[]) {
  return (
    findAction(actions, ["search", "search_by_key", "filter"]) ??
    defaultSearchAction()
  );
}

function historyAction(record: FeatureFlagVisibilityRecord) {
  return findAction(record.availableActions, [
    "view_change_history",
    "view_history",
    "audit_history",
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

function stateSummary(record: FeatureFlagVisibilityRecord, locale: Locale) {
  const stateLabel = record.enabled
    ? t("common.enabled", locale)
    : t("common.disabled", locale);
  const stateTone: CanvasTone = record.enabled ? "success" : "neutral";

  return (
    <div style={stateCellStyle}>
      <div style={pillRowStyle}>
        <Pill theme={theme} tone={stateTone} dot>
          {stateLabel}
        </Pill>
        {record.rolloutState === "partial" ? (
          <Pill theme={theme} tone="warn">
            {copy(locale, "Mid-rollout", "進行中 rollout")}
          </Pill>
        ) : null}
      </div>
      {record.rolloutSummary ? (
        <span style={secondaryTextStyle}>{record.rolloutSummary}</span>
      ) : record.rolloutState === "partial" ? (
        <span style={secondaryTextStyle}>
          {copy(
            locale,
            "Visible scopes diverge from the platform default.",
            "可見範圍內仍有 tenant override 與平台預設不一致。",
          )}
        </span>
      ) : null}
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
            {copy(
              locale,
              record.scope === "tenant" ? "Tenant" : "Global",
              record.scope === "tenant" ? "租戶" : "全域",
            )}
          </Pill>
          {record.rolloutState === "partial" ? (
            <Pill theme={theme} tone="warn">
              {copy(locale, "Mid-rollout", "進行中 rollout")}
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

function resolveEmptyStateActionTarget(
  action: ResourceActionDescriptor,
  filters: FeatureFlagFilters,
  ownerAppLink: CrossAppResourceLink,
): ResolvedActionTarget | null {
  const normalizedAction = action.action.toLowerCase();

  if (
    normalizedAction === "search" ||
    normalizedAction === "search_by_key" ||
    normalizedAction === "filter"
  ) {
    return {
      href: `${buildPageHref(filters)}#feature-flag-search`,
    };
  }

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

function renderEmptyState(
  locale: Locale,
  state: OpsFeatureFlagEmptyState,
  filters: FeatureFlagFilters,
  ownerAppLink: CrossAppResourceLink,
) {
  const copyBlock = emptyStateCopy(locale, state);
  const resetHref = "/feature-flags";
  const ownerHref = resolveCrossAppHref(ownerAppLink);
  const nextActionTarget = state.nextAction
    ? resolveEmptyStateActionTarget(state.nextAction, filters, ownerAppLink)
    : null;
  const nextActionHref = nextActionTarget?.href;
  const showResetButton =
    state.reason === "filtered_empty" &&
    nextActionHref !== "/feature-flags#feature-flag-search";
  const showOwnerAppButton =
    (state.reason === "fetch_failed" ||
      state.reason === "not_provisioned" ||
      state.reason === "permission_denied") &&
    nextActionHref !== ownerHref;

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
          <a href={resetHref} style={buttonStyle("secondary")}>
            {clearFiltersLabel(locale)}
          </a>
        ) : null}
        {showOwnerAppButton ? (
          <a
            href={ownerHref}
            style={buttonStyle("primary")}
            {...externalAnchorProps(ownerAppLink)}
          >
            {platformAdminLabel(locale)}
          </a>
        ) : null}
        {state.nextAction ? (
          nextActionTarget && state.nextAction.enabled ? (
            <a
              href={nextActionTarget.href}
              style={buttonStyle("secondary")}
              title={actionTooltip(locale, state.nextAction)}
              {...(nextActionTarget.link
                ? externalAnchorProps(nextActionTarget.link)
                : {})}
            >
              {actionLabel(locale, state.nextAction)}
            </a>
          ) : (
            <span
              style={buttonStyle("secondary", !state.nextAction.enabled)}
              title={actionTooltip(locale, state.nextAction)}
            >
              {actionLabel(locale, state.nextAction)}
            </span>
          )
        ) : null}
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
  const { response, fallbackNotice } = await loadFeatureFlags(locale);
  const ownerAppLink = response.ownerAppLink ?? defaultOwnerAppLink(locale);
  const refreshHref = buildPageHref(
    filters,
    {},
    { refresh: String(Date.now()) },
  );
  const visibleItems = sortItems(filterItems(response.items, filters));
  const emptyState = resolveEmptyState(response, visibleItems, filters);
  const searchDescriptor = searchAction(response.availableActions);

  const visibleEnabledCount = visibleItems.filter(
    (item) => item.enabled,
  ).length;
  const partialCount = visibleItems.filter(
    (item) => item.rolloutState === "partial",
  ).length;
  const tenantScopedCount = visibleItems.filter(
    (item) => item.scope === "tenant",
  ).length;

  const rows = visibleItems.map((record) => rowForRecord(record, locale));
  const columns: CanvasTableColumn<FeatureFlagTableRow>[] = [
    {
      h: "KEY",
      w: 380,
      r: (row) => row.keyCell as ReactNode,
    },
    {
      h: copy(locale, "Scope", "範圍"),
      w: 190,
      r: (row) => row.scopeCell as ReactNode,
    },
    {
      h: copy(locale, "State", "狀態"),
      w: 230,
      r: (row) => row.stateCell as ReactNode,
    },
    {
      h: copy(locale, "Updated by", "更新者"),
      w: 240,
      r: (row) => row.updatedByCell as ReactNode,
    },
    {
      h: "AT",
      w: 220,
      r: (row) => row.atCell as ReactNode,
    },
  ];

  return (
    <>
      <PageHeader
        theme={theme}
        title={copy(
          locale,
          "Feature Flags · read only",
          "功能旗標 · read only",
        )}
        subtitle={copy(
          locale,
          "Ops sees operational flags only. Write authority stays in Platform Admin. Endpoint: GET /api/ops/feature-flags",
          "ops 只看 operational flags。完整寫入權限在 Platform Admin。endpoint：GET /api/ops/feature-flags",
        )}
        actions={
          <a
            href={resolveCrossAppHref(ownerAppLink)}
            style={buttonStyle("primary")}
            {...externalAnchorProps(ownerAppLink)}
          >
            <span>{platformAdminLabel(locale)}</span>
            {shouldOpenInNewTab(ownerAppLink) ? (
              <CanvasIcon name="ext" size={12} />
            ) : null}
          </a>
        }
      />

      <div style={pageBodyStyle}>
        {fallbackNotice ? (
          <Banner
            theme={theme}
            tone="info"
            icon="flags"
            title={copy(
              locale,
              "Legacy fallback in use",
              "目前使用 legacy fallback",
            )}
            body={fallbackNotice}
          />
        ) : null}

        {bannerForFreshness(locale, response.refresh)}

        <Card theme={theme} padding={0}>
          <div style={toolbarStyle}>
            <div style={searchPanelStyle}>
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
                    label={copy(locale, "Search by key", "依 key 搜尋")}
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
                      placeholder={copy(
                        locale,
                        "dispatch., forwarder., partner...",
                        "dispatch.、forwarder.、partner…",
                      )}
                      aria-label={copy(locale, "Search by key", "依 key 搜尋")}
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

              <div style={scopeRowStyle}>
                <span style={scopeLabelStyle}>
                  {copy(locale, "Scope", "範圍")}
                </span>
                {(["all", "global", "tenant"] as const).map((scope) => (
                  <a
                    key={scope}
                    href={buildPageHref(filters, { scope })}
                    style={filterChipStyle(scope === filters.scope)}
                  >
                    {scope === "all"
                      ? copy(locale, "All visible", "全部可見")
                      : copy(
                          locale,
                          scope === "global" ? "Global" : "Tenant",
                          scope === "global" ? "全域" : "租戶",
                        )}
                  </a>
                ))}
              </div>
            </div>

            <div style={snapshotPanelStyle}>
              <Pill theme={theme} tone="info">
                T6 · manual
              </Pill>
              <Pill
                theme={theme}
                tone={dataFreshnessTone(response.refresh.dataFreshness)}
              >
                {formatOpsCodeLabel(locale, response.refresh.dataFreshness)}
              </Pill>
              <span style={snapshotMetaStyle}>
                {copy(
                  locale,
                  `Snapshot ${formatDateTime(locale, response.refresh.generatedAt)} · ${formatOpsCodeLabel(
                    locale,
                    response.refresh.source,
                  )}`,
                  `快照 ${formatDateTime(locale, response.refresh.generatedAt)} · ${formatOpsCodeLabel(
                    locale,
                    response.refresh.source,
                  )}`,
                )}
              </span>
              <a href={refreshHref} style={buttonStyle("secondary")}>
                {t("common.refresh", locale)}
              </a>
            </div>
          </div>

          <div style={registryMetaStyle}>
            <span style={registryMetaTextStyle}>
              {copy(
                locale,
                `${visibleItems.length} visible / ${response.items.length} total`,
                `${visibleItems.length} 筆可見 / 共 ${response.items.length} 筆`,
              )}
            </span>
            <Pill theme={theme} tone="success">
              {copy(
                locale,
                `${visibleEnabledCount} enabled`,
                `${visibleEnabledCount} 個已啟用`,
              )}
            </Pill>
            <Pill theme={theme} tone="warn">
              {copy(
                locale,
                `${partialCount} mid-rollout`,
                `${partialCount} 筆 mid-rollout`,
              )}
            </Pill>
            <Pill theme={theme} tone="info">
              {copy(
                locale,
                `${tenantScopedCount} tenant rows`,
                `${tenantScopedCount} 筆租戶列`,
              )}
            </Pill>
            <span style={codeStyle}>GET /api/ops/feature-flags</span>
          </div>

          {emptyState ? (
            renderEmptyState(locale, emptyState, filters, ownerAppLink)
          ) : (
            <Table theme={theme} columns={columns} rows={rows} />
          )}
        </Card>
      </div>
    </>
  );
}
