import Link from "next/link";
import type {
  CrossAppResourceLink,
  EmptyReason,
  FeatureFlag,
  RefreshTier,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import {
  DataCellStack,
  DataTable,
  DataViewCard,
  PageHeader,
  StatusChip,
  Td,
  Tr,
} from "@drts/ui-web";

export const dynamic = "force-dynamic";

type FeatureFlagsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type Locale = "en" | "zh";
type ScopeFilter = "all" | "global" | "tenant";
type FlagScope = Exclude<ScopeFilter, "all">;
type FlagState = "enabled" | "disabled" | "partial";

type LegacyFeatureFlagRecord = FeatureFlag & {
  scope?: FlagScope;
  currentValue?: string;
  updatedBy?: string;
  changedBy?: string;
  lastChangedBy?: string;
  availableActions?: ResourceActionDescriptor[];
  historyLink?: CrossAppResourceLink | null;
};

type EmptyStateEnvelopeLike = {
  reason: EmptyReason;
  messageCode?: string;
  nextAction?: ResourceActionDescriptor;
};

type FeatureFlagPayloadLike = {
  flags?: LegacyFeatureFlagRecord[];
  refresh?: UiRefreshMetadata;
  refreshTier?: RefreshTier;
  emptyState?: EmptyStateEnvelopeLike;
};

type NormalizedFlag = {
  key: string;
  description: string;
  scope: FlagScope;
  state: FlagState;
  currentValue: string;
  lastChangedAt: string | null;
  lastChangedBy: string | null;
  availableActions: ResourceActionDescriptor[];
  historyLink: CrossAppResourceLink | null;
  tenantIds: string[];
};

type NormalizedFlagsPayload = {
  flags: NormalizedFlag[];
  refresh: UiRefreshMetadata;
  refreshTier: RefreshTier;
  emptyState?: EmptyStateEnvelopeLike;
};

const REFRESH_TIER: RefreshTier = "manual";

const EMPTY_REASON_VALUES = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const satisfies readonly EmptyReason[];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isEmptyReason(value: string | undefined): value is EmptyReason {
  return value !== undefined &&
    EMPTY_REASON_VALUES.includes(value as (typeof EMPTY_REASON_VALUES)[number]);
}

function resolveScope(value: string | undefined): ScopeFilter {
  return value === "global" || value === "tenant" ? value : "all";
}

function buildPageHref(
  query: string,
  scope: ScopeFilter,
  emptyReason?: EmptyReason,
) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (scope !== "all") params.set("scope", scope);
  if (emptyReason) params.set("emptyReason", emptyReason);
  const serialized = params.toString();
  return serialized ? `/feature-flags?${serialized}` : "/feature-flags";
}

function buildRefreshHref(
  query: string,
  scope: ScopeFilter,
  emptyReason?: EmptyReason,
) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (scope !== "all") params.set("scope", scope);
  if (emptyReason) params.set("emptyReason", emptyReason);
  params.set("refresh", String(Date.now()));
  return `/feature-flags?${params.toString()}`;
}

function fallbackRefreshMetadata(): UiRefreshMetadata {
  return {
    generatedAt: new Date().toISOString(),
    staleAfterMs: 0,
    dataFreshness: "unknown",
    source: "static",
  };
}

function fallbackHistoryAction(
  availableActions: ResourceActionDescriptor[] | undefined,
): ResourceActionDescriptor[] {
  if (Array.isArray(availableActions)) {
    return availableActions;
  }
  return [
    {
      action: "view_change_history",
      enabled: false,
      disabledReasonCode: "history_unavailable",
      riskLevel: "low",
    },
  ];
}

function normalizeFeatureFlags(
  payload: unknown,
  locale: Locale,
): NormalizedFlagsPayload {
  const maybePayload =
    payload && typeof payload === "object"
      ? (payload as FeatureFlagPayloadLike)
      : ({} as FeatureFlagPayloadLike);
  const flags = Array.isArray(maybePayload.flags) ? maybePayload.flags : [];
  const grouped = new Map<string, LegacyFeatureFlagRecord[]>();

  for (const flag of flags) {
    const key = typeof flag.key === "string" ? flag.key : "";
    if (!key) continue;
    const existing = grouped.get(key);
    if (existing) {
      existing.push(flag);
    } else {
      grouped.set(key, [flag]);
    }
  }

  const normalizedFlags = Array.from(grouped.entries())
    .map(([key, records]) => {
      const globalRecord =
        records.find((record) => !record.tenantId && record.scope !== "tenant") ??
        records[0];
      const tenantRecords = records.filter(
        (record) => record.tenantId || record.scope === "tenant",
      );
      const latestRecord = [...records]
        .filter((record) => record.updatedAt)
        .sort((left, right) =>
          right.updatedAt.localeCompare(left.updatedAt),
        )[0];
      const enabledValues = new Set(
        records
          .map((record) =>
            typeof record.enabled === "boolean" ? String(record.enabled) : null,
          )
          .filter((value): value is string => value !== null),
      );
      const hasPartial =
        (typeof globalRecord.currentValue === "string" &&
          globalRecord.currentValue.toLowerCase().includes("partial")) ||
        enabledValues.size > 1;
      const state: FlagState = hasPartial
        ? "partial"
        : globalRecord.enabled
          ? "enabled"
          : "disabled";
      const currentValue =
        typeof globalRecord.currentValue === "string" &&
          globalRecord.currentValue.trim().length > 0
          ? globalRecord.currentValue
          : state;
      const scope: FlagScope =
        globalRecord.scope ??
        (tenantRecords.length > 0 ? "tenant" : "global");
      const description =
        featureFlagDescription(locale, globalRecord) ||
        t("common.dash", locale);

      return {
        key,
        description,
        scope,
        state,
        currentValue,
        lastChangedAt: latestRecord?.updatedAt ?? null,
        lastChangedBy:
          latestRecord?.lastChangedBy ??
          latestRecord?.updatedBy ??
          latestRecord?.changedBy ??
          null,
        availableActions: fallbackHistoryAction(globalRecord.availableActions),
        historyLink:
          globalRecord.historyLink ??
          {
            targetApp: "platform-admin",
            route: `/feature-flags?flag=${encodeURIComponent(key)}`,
            resourceType: "feature_flag",
            resourceId: key,
            openMode: "new_tab",
            label: t("flags.platformAdminLink", locale),
          },
        tenantIds: tenantRecords
          .map((record) => record.tenantId)
          .filter((value): value is string => Boolean(value)),
      } satisfies NormalizedFlag;
    })
    .sort((left, right) => left.key.localeCompare(right.key));

  return {
    flags: normalizedFlags,
    refresh: maybePayload.refresh ?? fallbackRefreshMetadata(),
    refreshTier: maybePayload.refreshTier ?? REFRESH_TIER,
    ...(maybePayload.emptyState
      ? { emptyState: maybePayload.emptyState }
      : {}),
  };
}

function getCrossAppOrigin(targetApp: CrossAppResourceLink["targetApp"]) {
  switch (targetApp) {
    case "platform-admin":
      return (
        process.env.PLATFORM_ADMIN_ORIGIN?.trim() ??
        process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN?.trim() ??
        ""
      );
    case "tenant-console":
      return (
        process.env.TENANT_CONSOLE_ORIGIN?.trim() ??
        process.env.NEXT_PUBLIC_TENANT_CONSOLE_ORIGIN?.trim() ??
        ""
      );
    case "ops-console":
    default:
      return (
        process.env.OPS_CONSOLE_ORIGIN?.trim() ??
        process.env.NEXT_PUBLIC_OPS_CONSOLE_ORIGIN?.trim() ??
        ""
      );
  }
}

function resolveCrossAppHref(link: CrossAppResourceLink | null): string | null {
  if (!link) return null;
  if (/^https?:\/\//.test(link.route)) return link.route;
  const origin = getCrossAppOrigin(link.targetApp);
  if (!origin) return link.route;
  return new URL(link.route, `${origin.replace(/\/$/, "")}/`).toString();
}

function resolvePlatformAdminFlagsHref(flagKey?: string): string {
  const route = flagKey
    ? `/feature-flags?flag=${encodeURIComponent(flagKey)}`
    : "/feature-flags";
  return resolveCrossAppHref({
    targetApp: "platform-admin",
    route,
    resourceType: "feature_flag",
    resourceId: flagKey ?? "feature_flags",
    openMode: "new_tab",
    label: "Platform Admin",
  }) ?? route;
}

function featureFlagDescription(locale: Locale, flag: LegacyFeatureFlagRecord) {
  if (locale !== "zh") return flag.description ?? "—";

  const descriptions: Record<string, string> = {
    "driver-app.earnings": "啟用司機 App 收益讀模型",
    "driver-app.incidents": "啟用司機 App 事故回報",
    "driver-app.shift": "啟用司機 App 班次與出勤追蹤",
    "driver-app.tasks": "啟用司機 App 任務生命週期",
    "ops-console.callcenter": "啟用營運後台客服中心工作階段檢視",
    "ops-console.complaint": "啟用營運後台客訴案件管理",
    "ops-console.dispatch": "啟用營運後台派車調度板",
    "ops-console.reports": "啟用營運後台報表任務管理",
    "phase1.read-models": "啟用 Phase 1 讀模型介面",
    "phase1.smoke-paths": "啟用 Phase 1 smoke test 端點",
    "tenant-portal.billing": "啟用租戶入口帳務檢視",
    "tenant-portal.booking": "啟用租戶入口訂車管理",
    "tenant-portal.reports": "啟用租戶入口報表任務提交",
    "tenant-portal.webhooks": "啟用租戶入口 Webhook 管理",
  };

  return descriptions[flag.key] || flag.description || "—";
}

function formatDateTime(value: string | null, locale: Locale) {
  if (!value) return t("common.dash", locale);
  return new Date(value).toLocaleString(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function freshnessTone(
  value: UiRefreshMetadata["dataFreshness"],
): "success" | "warning" | "danger" | "neutral" {
  if (value === "fresh") return "success";
  if (value === "stale") return "warning";
  if (value === "degraded") return "danger";
  return "neutral";
}

function stateTone(state: FlagState): "success" | "warning" | "neutral" {
  if (state === "enabled") return "success";
  if (state === "partial") return "warning";
  return "neutral";
}

function actionTone(
  riskLevel: ResourceActionDescriptor["riskLevel"],
): "neutral" | "warning" | "danger" {
  if (riskLevel === "high") return "danger";
  if (riskLevel === "medium") return "warning";
  return "neutral";
}

function mapErrorToEmptyReason(error: string): EmptyReason {
  const message = error.toLowerCase();
  if (message.includes("403") || message.includes("forbidden")) {
    return "permission_denied";
  }
  if (
    message.includes("adapter") ||
    message.includes("upstream") ||
    message.includes("503") ||
    message.includes("gateway")
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

function buildEmptyState(
  locale: Locale,
  reason: EmptyReason,
  query: string,
  scope: ScopeFilter,
): {
  title: string;
  body: string;
  tone: "neutral" | "warning" | "danger";
  actionLabel: string;
  actionHref: string;
  actionTarget?: "_blank";
} {
  switch (reason) {
    case "not_provisioned":
      return {
        title: t("flags.emptyState.notProvisioned.title", locale),
        body: t("flags.emptyState.notProvisioned.body", locale),
        tone: "warning",
        actionLabel: t("flags.platformAdminLink", locale),
        actionHref: resolvePlatformAdminFlagsHref(),
        actionTarget: "_blank",
      };
    case "permission_denied":
      return {
        title: t("flags.emptyState.permissionDenied.title", locale),
        body: t("flags.emptyState.permissionDenied.body", locale),
        tone: "danger",
        actionLabel: t("common.refresh", locale),
        actionHref: buildRefreshHref(query, scope),
      };
    case "external_unavailable":
      return {
        title: t("flags.emptyState.externalUnavailable.title", locale),
        body: t("flags.emptyState.externalUnavailable.body", locale),
        tone: "warning",
        actionLabel: t("common.tryAgain", locale),
        actionHref: buildRefreshHref(query, scope),
      };
    case "filtered_empty":
      return {
        title: t("flags.emptyState.filteredEmpty.title", locale),
        body: t("flags.emptyState.filteredEmpty.body", locale),
        tone: "neutral",
        actionLabel: t("flags.clearFilters", locale),
        actionHref: "/feature-flags",
      };
    case "fetch_failed":
      return {
        title: t("flags.emptyState.fetchFailed.title", locale),
        body: t("flags.emptyState.fetchFailed.body", locale),
        tone: "danger",
        actionLabel: t("common.tryAgain", locale),
        actionHref: buildRefreshHref(query, scope),
      };
    case "no_data":
    default:
      return {
        title: t("flags.emptyState.noData.title", locale),
        body: t("flags.emptyState.noData.body", locale),
        tone: "neutral",
        actionLabel: t("common.refresh", locale),
        actionHref: buildRefreshHref(query, scope),
      };
  }
}

function formatActionLabel(locale: Locale, action: string) {
  const key = `flags.action.${action}`;
  const translated = t(key, locale);
  if (translated !== key) return translated;
  return action
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDisabledReason(locale: Locale, reasonCode: string) {
  const key = `flags.disabledReason.${reasonCode}`;
  const translated = t(key, locale);
  if (translated !== key) return translated;
  return reasonCode.replaceAll("_", " ");
}

function ActionLink({
  href,
  children,
  target,
  subdued = false,
}: {
  href: string;
  children: React.ReactNode;
  target?: "_blank";
  subdued?: boolean;
}) {
  return (
    <Link
      href={href}
      target={target}
      rel={target === "_blank" ? "noreferrer" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px",
        minHeight: "34px",
        padding: "0 12px",
        borderRadius: "999px",
        border: `1px solid ${subdued ? "#cbd5e1" : "#fb7185"}`,
        background: subdued ? "#ffffff" : "#fff1f2",
        color: subdued ? "#334155" : "#be123c",
        textDecoration: "none",
        fontSize: "12.5px",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </Link>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 12px",
        borderRadius: "999px",
        border: `1px solid ${active ? "#111827" : "#cbd5e1"}`,
        background: active ? "#111827" : "#ffffff",
        color: active ? "#ffffff" : "#475569",
        textDecoration: "none",
        fontSize: "12px",
        fontWeight: active ? 700 : 500,
      }}
    >
      {children}
    </Link>
  );
}

function EmptyStateCard({
  locale,
  reason,
  query,
  scope,
}: {
  locale: Locale;
  reason: EmptyReason;
  query: string;
  scope: ScopeFilter;
}) {
  const emptyState = buildEmptyState(locale, reason, query, scope);

  return (
    <div
      style={{
        borderRadius: "18px",
        border: `1px solid ${
          emptyState.tone === "danger"
            ? "#fecaca"
            : emptyState.tone === "warning"
              ? "#fde68a"
              : "#cbd5e1"
        }`,
        background:
          emptyState.tone === "danger"
            ? "#fff1f2"
            : emptyState.tone === "warning"
              ? "#fffbeb"
              : "#f8fafc",
        padding: "22px",
        display: "grid",
        gap: "14px",
      }}
    >
      <div style={{ display: "grid", gap: "8px" }}>
        <div
          style={{
            display: "inline-flex",
            width: "fit-content",
            padding: "3px 8px",
            borderRadius: "999px",
            border: "1px solid rgba(15, 23, 42, 0.08)",
            background: "#ffffff",
            color: "#475569",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {reason}
        </div>
        <strong style={{ color: "#0f172a", fontSize: "17px" }}>
          {emptyState.title}
        </strong>
        <p
          style={{
            margin: 0,
            color: "#475569",
            lineHeight: 1.6,
            fontSize: "13px",
          }}
        >
          {emptyState.body}
        </p>
      </div>
      <div>
        <ActionLink
          href={emptyState.actionHref}
          {...(emptyState.actionTarget
            ? { target: emptyState.actionTarget }
            : {})}
        >
          {emptyState.actionLabel}
        </ActionLink>
      </div>
    </div>
  );
}

export default async function FeatureFlagsPage({
  searchParams,
}: FeatureFlagsPageProps) {
  const resolvedSearchParams = await (searchParams ??
    Promise.resolve({} as Record<string, string | string[] | undefined>));
  const query = firstParam(resolvedSearchParams.q)?.trim() ?? "";
  const scope = resolveScope(firstParam(resolvedSearchParams.scope));
  const emptyReasonOverrideParam = firstParam(resolvedSearchParams.emptyReason);
  const emptyReasonOverride = isEmptyReason(emptyReasonOverrideParam)
    ? emptyReasonOverrideParam
    : undefined;

  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);

  let payload: NormalizedFlagsPayload = {
    flags: [],
    refresh: fallbackRefreshMetadata(),
    refreshTier: REFRESH_TIER,
  };
  let errorMessage: string | null = null;

  try {
    const response = await client.getFeatureFlags();
    payload = normalizeFeatureFlags(response, locale);
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : t("common.unknown", locale);
    payload = {
      flags: [],
      refresh: fallbackRefreshMetadata(),
      refreshTier: REFRESH_TIER,
      emptyState: {
        reason: mapErrorToEmptyReason(errorMessage),
        messageCode: "feature_flags.fetch_failed",
      },
    };
  }

  const filteredFlags = payload.flags.filter((flag) => {
    const matchesScope = scope === "all" ? true : flag.scope === scope;
    const matchesQuery = query
      ? flag.key.toLowerCase().includes(query.toLowerCase())
      : true;
    return matchesScope && matchesQuery;
  });

  const effectiveEmptyReason =
    emptyReasonOverride ??
    (filteredFlags.length === 0
      ? payload.flags.length === 0
        ? (payload.emptyState?.reason ?? "no_data")
        : "filtered_empty"
      : null);

  const visibleFlags =
    effectiveEmptyReason === null ? filteredFlags : ([] as NormalizedFlag[]);

  const enabledCount = payload.flags.filter((flag) => flag.state === "enabled")
    .length;
  const partialCount = payload.flags.filter((flag) => flag.state === "partial")
    .length;
  const tenantScopedCount = payload.flags.filter(
    (flag) => flag.scope === "tenant",
  ).length;
  const pageHref = buildPageHref(query, scope, emptyReasonOverride);
  const refreshHref = buildRefreshHref(query, scope, emptyReasonOverride);
  const freshness = payload.refresh.dataFreshness;
  const platformAdminFlagsHref = resolvePlatformAdminFlagsHref();

  return (
    <>
      <PageHeader
        title={t("flags.title", locale)}
        eyebrow={locale === "zh" ? "Ops Console" : "Ops Console"}
        subtitle={t("flags.subtitleReadOnly", locale, {
          total: payload.flags.length,
          enabled: enabledCount,
        })}
        actions={
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            <ActionLink href={refreshHref} subdued>
              {t("common.refresh", locale)}
            </ActionLink>
            <ActionLink
              href={platformAdminFlagsHref}
              target="_blank"
            >
              {t("flags.platformAdminLink", locale)}
            </ActionLink>
          </div>
        }
        meta={[
          {
            label: t("flags.meta.refreshTier", locale),
            value: t(`flags.refreshTier.${payload.refreshTier}`, locale),
          },
          {
            label: t("flags.meta.freshness", locale),
            value: t(`flags.freshness.${freshness}`, locale),
          },
          {
            label: t("flags.meta.generatedAt", locale),
            value: formatDateTime(payload.refresh.generatedAt, locale),
          },
          {
            label: t("flags.meta.source", locale),
            value: payload.refresh.source,
          },
        ]}
      />

      {errorMessage ? (
        <div
          style={{
            background: "#fff1f2",
            border: "1px solid #fecdd3",
            borderRadius: "14px",
            padding: "14px 16px",
            color: "#be123c",
            fontSize: "13px",
            lineHeight: 1.55,
            marginBottom: "20px",
          }}
        >
          {errorMessage}
        </div>
      ) : null}

      {freshness !== "fresh" ? (
        <div
          style={{
            marginBottom: "18px",
            borderRadius: "16px",
            border: `1px solid ${
              freshness === "degraded" ? "#fecaca" : "#fde68a"
            }`,
            background: freshness === "degraded" ? "#fff1f2" : "#fffbeb",
            padding: "14px 16px",
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "grid", gap: "4px" }}>
            <strong style={{ color: "#0f172a", fontSize: "13px" }}>
              {t("flags.staleBanner.title", locale)}
            </strong>
            <span style={{ color: "#475569", fontSize: "12.5px" }}>
              {t("flags.staleBanner.body", locale, {
                freshness: t(`flags.freshness.${freshness}`, locale),
                generatedAt: formatDateTime(payload.refresh.generatedAt, locale),
              })}
            </span>
          </div>
          <StatusChip
            tone={freshnessTone(freshness)}
            authorityLabel={t("flags.meta.freshness", locale)}
            label={t(`flags.freshness.${freshness}`, locale)}
          />
        </div>
      ) : null}

      <DataViewCard
        title={t("flags.registryTitle", locale)}
        subtitle={t("flags.registrySubtitle", locale)}
        tone="info"
        density="compact"
        summary={t("flags.registrySummaryV2", locale, {
          total: payload.flags.length,
          enabled: enabledCount,
          partial: partialCount,
          tenant: tenantScopedCount,
        })}
        footer={t("flags.registryFooterV2", locale)}
        filters={
          <div style={{ display: "grid", gap: "14px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <FilterChip
                href={buildPageHref(query, "all", emptyReasonOverride)}
                active={scope === "all"}
              >
                {t("flags.scope.all", locale)}
              </FilterChip>
              <FilterChip
                href={buildPageHref(query, "global", emptyReasonOverride)}
                active={scope === "global"}
              >
                {t("flags.scope.global", locale)}
              </FilterChip>
              <FilterChip
                href={buildPageHref(query, "tenant", emptyReasonOverride)}
                active={scope === "tenant"}
              >
                {t("flags.scope.tenant", locale)}
              </FilterChip>
            </div>
            <form
              action="/feature-flags"
              method="get"
              style={{
                display: "grid",
                gap: "10px",
                gridTemplateColumns: "minmax(0, 1fr) auto auto",
                alignItems: "center",
              }}
            >
              <input type="hidden" name="scope" value={scope} />
              <input
                name="q"
                defaultValue={query}
                placeholder={t("flags.searchPlaceholder", locale)}
                style={{
                  width: "100%",
                  minHeight: "38px",
                  borderRadius: "12px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  padding: "0 12px",
                  fontSize: "13px",
                  color: "#0f172a",
                }}
              />
              <button
                type="submit"
                style={{
                  minHeight: "38px",
                  padding: "0 14px",
                  borderRadius: "12px",
                  border: "1px solid #fb7185",
                  background: "#fff1f2",
                  color: "#be123c",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {t("common.search", locale)}
              </button>
              <ActionLink href={pageHref} subdued>
                {t("flags.keepFilters", locale)}
              </ActionLink>
            </form>
          </div>
        }
      >
        {effectiveEmptyReason ? (
          <EmptyStateCard
            locale={locale}
            reason={effectiveEmptyReason}
            query={query}
            scope={scope}
          />
        ) : (
          <DataTable
            density="compact"
            tone="info"
            columns={[
              { label: t("flags.col.key", locale), width: "280px" },
              { label: t("flags.col.scope", locale), width: "120px" },
              { label: t("flags.col.currentValue", locale), width: "180px" },
              { label: t("flags.col.updatedBy", locale), width: "180px" },
              { label: t("flags.col.updatedAt", locale), width: "190px" },
              { label: t("flags.col.description", locale) },
              { label: t("flags.col.actions", locale), width: "200px" },
            ]}
          >
            {visibleFlags.map((flag) => (
              <Tr key={flag.key} highlighted={flag.state === "partial"}>
                <Td mono density="compact">
                  <DataCellStack
                    primary={flag.key}
                    secondary={
                      flag.state === "partial"
                        ? t("flags.midRollout", locale)
                        : flag.tenantIds.length > 0
                          ? t("flags.tenantOverrideCount", locale, {
                              count: flag.tenantIds.length,
                            })
                          : t("flags.opsReadOnly", locale)
                    }
                  />
                </Td>
                <Td density="compact">
                  <StatusChip
                    tone={flag.scope === "tenant" ? "warning" : "info"}
                    authorityLabel={t("flags.col.scope", locale)}
                    label={t(`flags.scope.${flag.scope}`, locale)}
                  />
                </Td>
                <Td density="compact">
                  <DataCellStack
                    primary={
                      <StatusChip
                        tone={stateTone(flag.state)}
                        authorityLabel={t("flags.col.currentValue", locale)}
                        label={t(`flags.state.${flag.state}`, locale)}
                      />
                    }
                    secondary={
                      flag.state === "partial"
                        ? t("flags.partialStateHelp", locale)
                        : flag.currentValue !== flag.state
                          ? flag.currentValue
                          : undefined
                    }
                  />
                </Td>
                <Td density="compact">
                  <DataCellStack
                    primary={flag.lastChangedBy ?? t("common.dash", locale)}
                    secondary={
                      flag.historyLink?.targetApp
                        ? t("flags.crossAppHint", locale)
                        : undefined
                    }
                  />
                </Td>
                <Td density="compact" mono>
                  {formatDateTime(flag.lastChangedAt, locale)}
                </Td>
                <Td density="compact" muted>
                  {flag.description}
                </Td>
                <Td density="compact">
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "8px",
                      alignItems: "center",
                    }}
                  >
                    {flag.availableActions.length === 0 ? (
                      <StatusChip
                        tone="neutral"
                        authorityLabel={t("common.actions", locale)}
                        label={t("flags.readOnly", locale)}
                      />
                    ) : null}
                    {flag.availableActions.map((action) =>
                      action.enabled && flag.historyLink ? (
                        <ActionLink
                          key={`${flag.key}-${action.action}`}
                          href={
                            resolveCrossAppHref(flag.historyLink) ??
                            resolvePlatformAdminFlagsHref(flag.key)
                          }
                          {...(flag.historyLink.openMode === "new_tab"
                            ? { target: "_blank" as const }
                            : {})}
                          subdued={action.riskLevel !== "high"}
                        >
                          {formatActionLabel(locale, action.action)}
                        </ActionLink>
                      ) : (
                        <DataCellStack
                          key={`${flag.key}-${action.action}`}
                          primary={
                            <StatusChip
                              tone={actionTone(action.riskLevel)}
                              authorityLabel={t("common.actions", locale)}
                              label={formatActionLabel(locale, action.action)}
                            />
                          }
                          secondary={
                            action.disabledReasonCode
                              ? formatDisabledReason(
                                  locale,
                                  action.disabledReasonCode,
                                )
                              : undefined
                          }
                        />
                      ),
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </DataTable>
        )}
      </DataViewCard>
    </>
  );
}
