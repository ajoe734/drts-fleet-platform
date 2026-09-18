import type { CSSProperties } from "react";
import type {
  CrossAppResourceLink,
  EmptyReason,
  ResourceActionDescriptor,
  TenantFeatureFlagRecord,
  TenantFeatureFlagScope,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { getServerLocale } from "@/lib/server-locale";
import { type Locale, t } from "@/lib/translations";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

// Q-X15: the six list-level empty reasons. `driver_not_eligible` is
// driver-app-specific and never applies to a tenant-console read surface.
const EMPTY_REASONS: readonly EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const;

// Q-X13: feature visibility is read-only per Q-X16, so the published actions
// are both low-risk reads. CTAs render from these descriptors instead of
// hard-coding role-to-action mapping.
const ROUTE_ACTIONS: readonly ResourceActionDescriptor[] = [
  { action: "search", enabled: true, riskLevel: "low" },
  { action: "view_change_history", enabled: true, riskLevel: "low" },
] as const;

const SCOPE_FILTERS: readonly ("all" | TenantFeatureFlagScope)[] = [
  "all",
  "tenant_override",
  "global_default",
] as const;

// Q-X03: full feature-flag governance lives in platform-admin. Cross-app
// navigation is a deep link to the separately-deployed admin app.
const DEFAULT_PLATFORM_ADMIN_BASE = "/_apps/platform-admin";

function resolvePlatformAdminBase(): string {
  const envValue =
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ??
    process.env.DRTS_PLATFORM_ADMIN_URL ??
    "";
  const trimmed = envValue.trim().replace(/\/$/, "");
  return trimmed || DEFAULT_PLATFORM_ADMIN_BASE;
}

function platformAdminFlagHistoryLink(
  flagKey: string,
  locale: Locale,
): CrossAppResourceLink {
  return {
    targetApp: "platform-admin",
    route: flagKey
      ? `/feature-flags?flag=${encodeURIComponent(flagKey)}`
      : "/feature-flags",
    resourceType: "feature_flag",
    resourceId: flagKey,
    openMode: "new_tab",
    label: flagKey
      ? t("featureFlags.link.platformAdminHistory", locale, { flagKey })
      : t("featureFlags.link.platformAdminGovernance", locale),
  };
}

function crossAppHref(link: CrossAppResourceLink): string {
  const base = resolvePlatformAdminBase();
  const path = link.route.startsWith("/") ? link.route : `/${link.route}`;
  return `${base}${path}`;
}

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 10,
};

const searchFormStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flex: "1 1 280px",
  minWidth: 0,
};

const searchInputStyle: CSSProperties = {
  flex: "1 1 auto",
  minWidth: 0,
  height: 32,
  padding: "0 10px",
  borderRadius: 6,
  border: `1px solid ${th.border}`,
  background: th.surface,
  color: th.text,
  fontSize: 12.5,
  fontFamily: th.monoFamily,
};

const scopeFilterStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const linkActionStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  height: 32,
  padding: "0 12px",
  borderRadius: 6,
  border: `1px solid ${th.accentBorder}`,
  background: th.accentBg,
  color: th.accentHi,
  fontSize: 12,
  fontWeight: 600,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const disabledLinkActionStyle: CSSProperties = {
  ...linkActionStyle,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
  color: th.textMuted,
  cursor: "not-allowed",
};

const buttonActionStyle: CSSProperties = {
  ...linkActionStyle,
  cursor: "pointer",
};

const chipLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 28,
  padding: "0 12px",
  borderRadius: 999,
  border: `1px solid ${th.border}`,
  background: th.surface,
  color: th.textMuted,
  fontSize: 11.5,
  fontWeight: 600,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const chipLinkActiveStyle: CSSProperties = {
  ...chipLinkStyle,
  border: `1px solid ${th.accentBorder}`,
  background: th.accentBg,
  color: th.accentHi,
};

const keyCellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
};

const keyPrimaryStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
  fontFamily: th.monoFamily,
  fontSize: 11.5,
};

const keyDescriptionStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11,
  lineHeight: 1.4,
  whiteSpace: "normal",
};

const currentCellStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const emptyStateWrapStyle: CSSProperties = {
  padding: "32px 24px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
  textAlign: "center",
};

const emptyStateTitleStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
  fontSize: 13.5,
};

const emptyStateBodyStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 12,
  lineHeight: 1.5,
  maxWidth: 460,
};

function toIntlLocale(locale: Locale) {
  return locale === "zh" ? "zh-Hant" : "en-US";
}

function formatChangedAt(value: string | null, locale: Locale) {
  if (!value) return t("featureFlags.value.empty", locale);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return t("featureFlags.value.empty", locale);
  }
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    dateStyle: "short",
    timeStyle: "short",
  })
    .format(parsed)
    .replace(/[\u00a0\u202f\u2009]/g, " ");
}

function formatCount(value: number, locale: Locale) {
  return new Intl.NumberFormat(toIntlLocale(locale)).format(value);
}

function parseEmptyReason(value: string | undefined): EmptyReason | null {
  if (!value) return null;
  return EMPTY_REASONS.includes(value as EmptyReason)
    ? (value as EmptyReason)
    : null;
}

function parseScope(value: string | undefined): "all" | TenantFeatureFlagScope {
  if (value === "tenant_override" || value === "global_default") {
    return value;
  }
  return "all";
}

// Distinguish the read failure modes so the empty state explains the right
// thing instead of collapsing every error into "no data".
function classifyFetchError(message: string): EmptyReason {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("403") ||
    normalized.includes("permission") ||
    normalized.includes("forbidden") ||
    normalized.includes("unauthor")
  ) {
    return "permission_denied";
  }
  if (
    normalized.includes("503") ||
    normalized.includes("502") ||
    normalized.includes("504") ||
    normalized.includes("unavailable") ||
    normalized.includes("timeout") ||
    normalized.includes("econnrefused") ||
    normalized.includes("fetch failed")
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

type FeatureFlagsPageData = {
  flags: TenantFeatureFlagRecord[];
  totalCount: number;
  errors: string[];
  emptyReason: EmptyReason | null;
  generatedAt: string;
  refreshTier: "slow";
  availableActions: ResourceActionDescriptor[];
  query: string;
  scope: "all" | TenantFeatureFlagScope;
};

function compareFlags(a: TenantFeatureFlagRecord, b: TenantFeatureFlagRecord) {
  // Tenant overrides first (the primary task is confirming this tenant's
  // deviations from platform defaults), then rolling-out, then by key.
  if (a.scope !== b.scope) {
    return a.scope === "tenant_override" ? -1 : 1;
  }
  if (a.rolloutStatus !== b.rolloutStatus) {
    return a.rolloutStatus === "rolling_out" ? -1 : 1;
  }
  return a.key.localeCompare(b.key, "en");
}

// Live data only — there is NO fixture/synthetic fallback. An empty or failed
// backend response is preserved verbatim so the empty state renders the real
// EmptyReason (not_provisioned / no_data / filtered_empty / classified fetch
// error) instead of masking it with placeholder rows. `emptyReasonOverride` is
// a QA-only `?emptyReason=` deep link for previewing each of the six states.
async function loadFeatureFlagsData(
  locale: Locale,
  query: string,
  scope: "all" | TenantFeatureFlagScope,
  emptyReasonOverride: EmptyReason | null,
): Promise<FeatureFlagsPageData> {
  const client = await getTenantClient();
  const errors: string[] = [];
  let rawFlags: TenantFeatureFlagRecord[] = [];
  let fetchErrorReason: EmptyReason | null = null;
  let generatedAt = new Date().toISOString();

  const result = await Promise.allSettled([client.listTenantFeatureFlags()]);
  const [flagsResult] = result;

  if (flagsResult && flagsResult.status === "fulfilled") {
    rawFlags = [...flagsResult.value.flags];
    generatedAt = flagsResult.value.generatedAt || generatedAt;
  } else if (flagsResult && flagsResult.status === "rejected") {
    const message =
      flagsResult.reason instanceof Error
        ? flagsResult.reason.message
        : t("featureFlags.error.loadFailed", locale);
    errors.push(message);
    fetchErrorReason = classifyFetchError(message);
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = rawFlags
    .filter((flag) => (scope === "all" ? true : flag.scope === scope))
    .filter((flag) =>
      normalizedQuery.length === 0
        ? true
        : flag.key.toLowerCase().includes(normalizedQuery) ||
          flag.description.toLowerCase().includes(normalizedQuery),
    )
    .sort(compareFlags);

  const hasFilter = normalizedQuery.length > 0 || scope !== "all";

  let inferredEmptyReason: EmptyReason | null = null;
  if (filtered.length === 0) {
    if (fetchErrorReason) {
      inferredEmptyReason = fetchErrorReason;
    } else if (rawFlags.length === 0) {
      inferredEmptyReason = "not_provisioned";
    } else if (hasFilter) {
      inferredEmptyReason = "filtered_empty";
    } else {
      inferredEmptyReason = "no_data";
    }
  }

  return {
    flags: filtered,
    totalCount: rawFlags.length,
    errors,
    emptyReason: emptyReasonOverride ?? inferredEmptyReason,
    generatedAt,
    refreshTier: "slow",
    availableActions: [...ROUTE_ACTIONS],
    query,
    scope,
  };
}

function getEmptyStateCopy(
  reason: EmptyReason,
  locale: Locale,
): {
  tone: CanvasTone;
  title: string;
  body: string;
} {
  switch (reason) {
    case "not_provisioned":
      return {
        tone: "info",
        title: t("featureFlags.empty.notProvisioned.title", locale),
        body: t("featureFlags.empty.notProvisioned.body", locale),
      };
    case "fetch_failed":
      return {
        tone: "warn",
        title: t("featureFlags.empty.fetchFailed.title", locale),
        body: t("featureFlags.empty.fetchFailed.body", locale),
      };
    case "permission_denied":
      return {
        tone: "danger",
        title: t("featureFlags.empty.permissionDenied.title", locale),
        body: t("featureFlags.empty.permissionDenied.body", locale),
      };
    case "external_unavailable":
      return {
        tone: "warn",
        title: t("featureFlags.empty.externalUnavailable.title", locale),
        body: t("featureFlags.empty.externalUnavailable.body", locale),
      };
    case "filtered_empty":
      return {
        tone: "neutral",
        title: t("featureFlags.empty.filteredEmpty.title", locale),
        body: t("featureFlags.empty.filteredEmpty.body", locale),
      };
    case "driver_not_eligible":
    case "no_data":
    default:
      return {
        tone: "info",
        title: t("featureFlags.empty.noData.title", locale),
        body: t("featureFlags.empty.noData.body", locale),
      };
  }
}

function getScopeTone(scope: TenantFeatureFlagScope): CanvasTone {
  return scope === "tenant_override" ? "accent" : "neutral";
}

function getScopeLabel(scope: TenantFeatureFlagScope, locale: Locale) {
  return scope === "tenant_override"
    ? t("featureFlags.scope.tenantOverride", locale)
    : t("featureFlags.scope.globalDefault", locale);
}

function getScopeFilterLabel(
  scope: "all" | TenantFeatureFlagScope,
  locale: Locale,
) {
  switch (scope) {
    case "tenant_override":
      return t("featureFlags.filter.scope.tenantOverride", locale);
    case "global_default":
      return t("featureFlags.filter.scope.globalDefault", locale);
    case "all":
    default:
      return t("featureFlags.filter.scope.all", locale);
  }
}

function getCurrentValueLabel(enabled: boolean, locale: Locale) {
  return enabled
    ? t("featureFlags.current.enabled", locale)
    : t("featureFlags.current.disabled", locale);
}

function getRolloutStatusLabel(locale: Locale) {
  return t("featureFlags.current.rollingOut", locale);
}

function getRefreshTierLabel(
  refreshTier: FeatureFlagsPageData["refreshTier"],
  locale: Locale,
) {
  switch (refreshTier) {
    case "slow":
    default:
      return t("featureFlags.refreshTier.slow", locale);
  }
}

function getEmptyReasonLabel(reason: EmptyReason, locale: Locale) {
  switch (reason) {
    case "not_provisioned":
      return t("featureFlags.emptyReason.notProvisioned", locale);
    case "fetch_failed":
      return t("featureFlags.emptyReason.fetchFailed", locale);
    case "permission_denied":
      return t("featureFlags.emptyReason.permissionDenied", locale);
    case "external_unavailable":
      return t("featureFlags.emptyReason.externalUnavailable", locale);
    case "filtered_empty":
      return t("featureFlags.emptyReason.filteredEmpty", locale);
    case "driver_not_eligible":
      return t("featureFlags.emptyReason.driverNotEligible", locale);
    case "no_data":
    default:
      return t("featureFlags.emptyReason.noData", locale);
  }
}

type FeatureFlagsPageProps = {
  searchParams?: Promise<{
    q?: string;
    scope?: string;
    emptyReason?: string;
  }>;
};

export default async function FeatureFlagsPage({
  searchParams,
}: FeatureFlagsPageProps) {
  const locale = await getServerLocale();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const query = resolvedSearchParams?.q ?? "";
  const scope = parseScope(resolvedSearchParams?.scope);
  const emptyReasonOverride = parseEmptyReason(
    resolvedSearchParams?.emptyReason,
  );
  const data = await loadFeatureFlagsData(
    locale,
    query,
    scope,
    emptyReasonOverride,
  );

  const searchAction = data.availableActions.find(
    (item) => item.action === "search",
  );
  const historyAction = data.availableActions.find(
    (item) => item.action === "view_change_history",
  );

  const tenantOverrides = data.flags.filter(
    (flag) => flag.scope === "tenant_override",
  ).length;
  const enabledCount = data.flags.filter((flag) => flag.enabled).length;
  const rollingOutCount = data.flags.filter(
    (flag) => flag.rolloutStatus === "rolling_out",
  ).length;

  const governanceLink = platformAdminFlagHistoryLink("", locale);
  const historyEnabled = historyAction?.enabled !== false;

  const columns: CanvasTableColumn<
    TenantFeatureFlagRecord & Record<string, unknown>
  >[] = [
    {
      h: t("featureFlags.table.column.key", locale),
      w: 360,
      r: (row) => (
        <div style={keyCellStyle}>
          <span style={keyPrimaryStyle}>{row.key}</span>
          {row.description ? (
            <span style={keyDescriptionStyle}>{row.description}</span>
          ) : null}
        </div>
      ),
    },
    {
      h: t("featureFlags.table.column.current", locale),
      w: 150,
      r: (row) => (
        <span style={currentCellStyle}>
          <CanvasPill theme={th} tone={row.enabled ? "success" : "neutral"} dot>
            {getCurrentValueLabel(row.enabled, locale)}
          </CanvasPill>
          {row.rolloutStatus === "rolling_out" ? (
            <CanvasPill theme={th} tone="warn">
              {getRolloutStatusLabel(locale)}
            </CanvasPill>
          ) : null}
        </span>
      ),
    },
    {
      h: t("featureFlags.table.column.scope", locale),
      w: 150,
      r: (row) => (
        <CanvasPill theme={th} tone={getScopeTone(row.scope)}>
          {getScopeLabel(row.scope, locale)}
        </CanvasPill>
      ),
    },
    {
      h: t("featureFlags.table.column.updatedBy", locale),
      w: 180,
      r: (row) => row.updatedBy ?? t("featureFlags.value.empty", locale),
    },
    {
      h: t("featureFlags.table.column.updatedAt", locale),
      w: 150,
      mono: true,
      r: (row) => formatChangedAt(row.updatedAt, locale),
    },
    {
      h: t("featureFlags.table.column.history", locale),
      w: 90,
      align: "right",
      r: (row) =>
        historyEnabled ? (
          <a
            href={crossAppHref(platformAdminFlagHistoryLink(row.key, locale))}
            target="_blank"
            rel="noreferrer"
            style={chipLinkStyle}
            title={platformAdminFlagHistoryLink(row.key, locale).label}
          >
            {t("featureFlags.table.historyLink", locale)}
          </a>
        ) : (
          <span style={{ color: th.textMuted, fontSize: 11.5 }}>
            {t("featureFlags.value.empty", locale)}
          </span>
        ),
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title={t("featureFlags.header.title", locale)}
        subtitle={t("featureFlags.header.subtitle", locale)}
        actions={
          <a
            href={crossAppHref(governanceLink)}
            target="_blank"
            rel="noreferrer"
            style={historyEnabled ? linkActionStyle : disabledLinkActionStyle}
            aria-disabled={historyEnabled ? undefined : true}
            title={
              historyEnabled
                ? governanceLink.label
                : historyAction?.disabledReasonCode
            }
          >
            {t("featureFlags.header.governanceAction", locale)}
          </a>
        }
      />

      <div style={pageBodyStyle}>
        <CanvasBanner
          theme={th}
          tone="info"
          icon="clock"
          title={t("featureFlags.banner.refresh.title", locale)}
          body={t("featureFlags.banner.refresh.body", locale, {
            refreshTier: getRefreshTierLabel(data.refreshTier, locale),
            generatedAt: formatChangedAt(data.generatedAt, locale),
          })}
        />

        <CanvasBanner
          theme={th}
          tone="accent"
          icon="flags"
          title={t("featureFlags.banner.readOnly.title", locale)}
          body={t("featureFlags.banner.readOnly.body", locale)}
        />

        {data.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title={t("featureFlags.banner.error.title", locale)}
            body={data.errors.join(" · ")}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label={t("featureFlags.kpi.flags.label", locale)}
            value={formatCount(data.flags.length, locale)}
            sub={
              data.totalCount !== data.flags.length
                ? t("featureFlags.kpi.flags.total", locale, {
                    total: formatCount(data.totalCount, locale),
                  })
                : t("featureFlags.kpi.flags.visible", locale)
            }
          />
          <CanvasKPI
            theme={th}
            label={t("featureFlags.kpi.overrides.label", locale)}
            value={formatCount(tenantOverrides, locale)}
            sub={t("featureFlags.kpi.overrides.sub", locale)}
          />
          <CanvasKPI
            theme={th}
            label={t("featureFlags.kpi.enabled.label", locale)}
            value={formatCount(enabledCount, locale)}
            sub={t("featureFlags.kpi.enabled.sub", locale)}
          />
          <CanvasKPI
            theme={th}
            label={t("featureFlags.kpi.rollingOut.label", locale)}
            value={formatCount(rollingOutCount, locale)}
            sub={t("featureFlags.kpi.rollingOut.sub", locale)}
          />
        </div>

        <div style={toolbarStyle}>
          <form method="get" style={searchFormStyle}>
            <input
              type="search"
              name="q"
              defaultValue={data.query}
              placeholder={t("featureFlags.search.placeholder", locale)}
              aria-label={t("featureFlags.search.aria", locale)}
              style={searchInputStyle}
              disabled={searchAction?.enabled === false}
            />
            {data.scope !== "all" ? (
              <input type="hidden" name="scope" value={data.scope} />
            ) : null}
            <button
              type="submit"
              style={
                searchAction?.enabled === false
                  ? disabledLinkActionStyle
                  : buttonActionStyle
              }
              disabled={searchAction?.enabled === false}
              title={searchAction?.disabledReasonCode}
            >
              {t("featureFlags.search.submit", locale)}
            </button>
          </form>

          <div style={scopeFilterStyle}>
            {SCOPE_FILTERS.map((filter) => {
              const params = new URLSearchParams();
              if (filter !== "all") {
                params.set("scope", filter);
              }
              if (data.query) {
                params.set("q", data.query);
              }
              const queryString = params.toString();
              const href = queryString ? `?${queryString}` : "/feature-flags";
              const active = data.scope === filter;
              return (
                <a
                  key={filter}
                  href={href}
                  style={active ? chipLinkActiveStyle : chipLinkStyle}
                >
                  {getScopeFilterLabel(filter, locale)}
                </a>
              );
            })}
          </div>
        </div>

        <CanvasCard theme={th} padding={0}>
          {data.flags.length > 0 ? (
            <CanvasTable<TenantFeatureFlagRecord & Record<string, unknown>>
              theme={th}
              columns={columns}
              rows={
                data.flags as (TenantFeatureFlagRecord &
                  Record<string, unknown>)[]
              }
            />
          ) : (
            (() => {
              const copy = getEmptyStateCopy(
                data.emptyReason ?? "no_data",
                locale,
              );
              return (
                <div style={emptyStateWrapStyle}>
                  <CanvasPill theme={th} tone={copy.tone} dot>
                    {getEmptyReasonLabel(data.emptyReason ?? "no_data", locale)}
                  </CanvasPill>
                  <div style={emptyStateTitleStyle}>{copy.title}</div>
                  <div style={emptyStateBodyStyle}>{copy.body}</div>
                </div>
              );
            })()
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
