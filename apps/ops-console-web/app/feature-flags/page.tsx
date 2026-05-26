import Link from "next/link";
import type { ReactNode } from "react";
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
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasIcon,
  CanvasKPI as KPI,
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
  notes?: string[];
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
  notes: string[];
  refresh: UiRefreshMetadata;
  refreshTier: RefreshTier;
  emptyState?: EmptyStateEnvelopeLike;
};

type FlagTableRow = Record<string, unknown> & {
  key: string;
  keyCell: ReactNode;
  scopeCell: ReactNode;
  stateCell: ReactNode;
  updatedByCell: ReactNode;
  updatedAt: string;
  description: string;
  actionsCell: ReactNode;
  _selected?: boolean;
};

type EmptyStateIconName =
  | "flags"
  | "audit"
  | "reports"
  | "search"
  | "warn";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const REFRESH_TIER: RefreshTier = "manual";

const EMPTY_REASON_VALUES = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const satisfies readonly EmptyReason[];

const pageBodyStyle = {
  padding: 24,
  display: "flex",
  flexDirection: "column" as const,
  gap: 16,
};

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const splitGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.8fr) minmax(260px, 0.9fr)",
  gap: 16,
  alignItems: "start",
};

const tableColumns: CanvasTableColumn<FlagTableRow>[] = [
  { h: "KEY", k: "keyCell", w: 320, mono: true },
  { h: "SCOPE", k: "scopeCell", w: 120 },
  { h: "STATE", k: "stateCell", w: 180 },
  { h: "UPDATED BY", k: "updatedByCell", w: 180 },
  { h: "AT", k: "updatedAt", w: 160, mono: true },
  { h: "DESCRIPTION", k: "description" },
  { h: "ACTIONS", k: "actionsCell", w: 220 },
];

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

function fallbackHistoryActions(
  availableActions: ResourceActionDescriptor[] | undefined,
): ResourceActionDescriptor[] {
  if (Array.isArray(availableActions) && availableActions.length > 0) {
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
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
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

      return {
        key,
        description:
          featureFlagDescription(locale, globalRecord) || t("common.dash", locale),
        scope,
        state,
        currentValue,
        lastChangedAt: latestRecord?.updatedAt ?? null,
        lastChangedBy:
          latestRecord?.lastChangedBy ??
          latestRecord?.updatedBy ??
          latestRecord?.changedBy ??
          null,
        availableActions: fallbackHistoryActions(globalRecord.availableActions),
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
    notes: Array.isArray(maybePayload.notes) ? maybePayload.notes : [],
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

function refreshTone(
  freshness: UiRefreshMetadata["dataFreshness"],
): Exclude<CanvasTone, "accent"> {
  if (freshness === "fresh") return "success";
  if (freshness === "stale") return "warn";
  if (freshness === "degraded") return "danger";
  return "neutral";
}

function stateTone(state: FlagState): Exclude<CanvasTone, "accent"> {
  if (state === "enabled") return "success";
  if (state === "partial") return "warn";
  return "neutral";
}

function actionTone(
  riskLevel: ResourceActionDescriptor["riskLevel"],
): Exclude<CanvasTone, "accent"> {
  if (riskLevel === "high") return "danger";
  if (riskLevel === "medium") return "warn";
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

function renderStack(
  primary: ReactNode,
  secondary?: ReactNode,
  tertiary?: ReactNode,
) {
  return (
    <div
      style={{
        display: "grid",
        gap: 4,
        whiteSpace: "normal",
      }}
    >
      <div>{primary}</div>
      {secondary ? (
        <div style={{ color: theme.textMuted, fontSize: 11.5 }}>{secondary}</div>
      ) : null}
      {tertiary ? (
        <div style={{ color: theme.textDim, fontSize: 11 }}>{tertiary}</div>
      ) : null}
    </div>
  );
}

function ActionLink({
  href,
  children,
  target,
  tone = "neutral",
}: {
  href: string;
  children: ReactNode;
  target?: "_blank";
  tone?: CanvasTone;
}) {
  const palette =
    tone === "danger"
      ? { fg: theme.danger, bg: theme.dangerBg, bd: theme.dangerBorder }
      : tone === "warn"
        ? { fg: theme.warn, bg: theme.warnBg, bd: theme.warnBorder }
        : tone === "accent"
          ? { fg: "#ffffff", bg: theme.accent, bd: theme.accent }
          : { fg: theme.text, bg: theme.surface, bd: theme.border };

  return (
    <Link
      href={href}
      target={target}
      rel={target === "_blank" ? "noreferrer" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        minHeight: 28,
        padding: "0 10px",
        borderRadius: 7,
        border: `1px solid ${palette.bd}`,
        background: palette.bg,
        color: palette.fg,
        fontSize: 12,
        fontWeight: 500,
        textDecoration: "none",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </Link>
  );
}

function ScopeLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        minHeight: 28,
        padding: "0 10px",
        borderRadius: 999,
        border: `1px solid ${active ? theme.accent : theme.border}`,
        background: active ? theme.accentBg : theme.surface,
        color: active ? theme.accent : theme.textMuted,
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        textDecoration: "none",
      }}
    >
      {children}
    </Link>
  );
}

function buildEmptyState(
  locale: Locale,
  reason: EmptyReason,
  query: string,
  scope: ScopeFilter,
): {
  icon: EmptyStateIconName;
  tone: Exclude<CanvasTone, "accent">;
  label: string;
  title: string;
  body: string;
  actionLabel: string;
  actionHref: string;
  actionTarget?: "_blank";
} {
  switch (reason) {
    case "not_provisioned":
      return {
        icon: "flags",
        tone: "warn",
        label: "NOT PROVISIONED",
        title: t("flags.emptyState.notProvisioned.title", locale),
        body: t("flags.emptyState.notProvisioned.body", locale),
        actionLabel: t("flags.platformAdminLink", locale),
        actionHref: resolvePlatformAdminFlagsHref(),
        actionTarget: "_blank",
      };
    case "permission_denied":
      return {
        icon: "audit",
        tone: "danger",
        label: "PERMISSION DENIED",
        title: t("flags.emptyState.permissionDenied.title", locale),
        body: t("flags.emptyState.permissionDenied.body", locale),
        actionLabel: t("common.refresh", locale),
        actionHref: buildRefreshHref(query, scope),
      };
    case "external_unavailable":
      return {
        icon: "reports",
        tone: "warn",
        label: "EXTERNAL UNAVAILABLE",
        title: t("flags.emptyState.externalUnavailable.title", locale),
        body: t("flags.emptyState.externalUnavailable.body", locale),
        actionLabel: t("common.tryAgain", locale),
        actionHref: buildRefreshHref(query, scope),
      };
    case "filtered_empty":
      return {
        icon: "search",
        tone: "neutral",
        label: "FILTERED EMPTY",
        title: t("flags.emptyState.filteredEmpty.title", locale),
        body: t("flags.emptyState.filteredEmpty.body", locale),
        actionLabel: t("flags.clearFilters", locale),
        actionHref: "/feature-flags",
      };
    case "fetch_failed":
      return {
        icon: "warn",
        tone: "danger",
        label: "FETCH FAILED",
        title: t("flags.emptyState.fetchFailed.title", locale),
        body: t("flags.emptyState.fetchFailed.body", locale),
        actionLabel: t("common.tryAgain", locale),
        actionHref: buildRefreshHref(query, scope),
      };
    case "no_data":
    default:
      return {
        icon: "flags",
        tone: "neutral",
        label: "NO DATA",
        title: t("flags.emptyState.noData.title", locale),
        body: t("flags.emptyState.noData.body", locale),
        actionLabel: t("common.refresh", locale),
        actionHref: buildRefreshHref(query, scope),
      };
  }
}

function EmptyStateCard({
  locale,
  reason,
  query,
  scope,
  messageCode,
}: {
  locale: Locale;
  reason: EmptyReason;
  query: string;
  scope: ScopeFilter;
  messageCode?: string;
}) {
  const emptyState = buildEmptyState(locale, reason, query, scope);

  return (
    <Card
      theme={theme}
      padding={18}
      style={{
        background: theme.surfaceLo,
        borderColor:
          emptyState.tone === "danger"
            ? theme.dangerBorder
            : emptyState.tone === "warn"
              ? theme.warnBorder
              : theme.border,
      }}
    >
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "auto minmax(0, 1fr)",
          alignItems: "start",
        }}
      >
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            display: "grid",
            placeItems: "center",
            background:
              emptyState.tone === "danger"
                ? theme.dangerBg
                : emptyState.tone === "warn"
                  ? theme.warnBg
                  : theme.neutralBg,
            border: `1px solid ${
              emptyState.tone === "danger"
                ? theme.dangerBorder
                : emptyState.tone === "warn"
                  ? theme.warnBorder
                  : theme.neutralBorder
            }`,
            color:
              emptyState.tone === "danger"
                ? theme.danger
                : emptyState.tone === "warn"
                  ? theme.warn
                  : theme.textMuted,
          }}
        >
          <CanvasIcon name={emptyState.icon} size={18} stroke={1.7} />
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Pill theme={theme} tone={emptyState.tone}>
              {emptyState.label}
            </Pill>
            <Pill theme={theme} tone="neutral">
              {reason}
            </Pill>
            {messageCode ? (
              <Pill theme={theme} tone="neutral">
                {messageCode}
              </Pill>
            ) : null}
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <strong style={{ color: theme.text, fontSize: 16 }}>
              {emptyState.title}
            </strong>
            <span
              style={{
                color: theme.textMuted,
                lineHeight: 1.5,
                fontSize: 12.5,
              }}
            >
              {emptyState.body}
            </span>
          </div>
          <div>
            <ActionLink
              href={emptyState.actionHref}
              tone={emptyState.tone === "neutral" ? "accent" : emptyState.tone}
              {...(emptyState.actionTarget
                ? { target: emptyState.actionTarget }
                : {})}
            >
              {emptyState.actionLabel}
            </ActionLink>
          </div>
        </div>
      </div>
    </Card>
  );
}

function buildFlagTableRows(
  flags: NormalizedFlag[],
  locale: Locale,
): FlagTableRow[] {
  return flags.map((flag) => {
    const historyHref =
      resolveCrossAppHref(flag.historyLink) ?? resolvePlatformAdminFlagsHref(flag.key);
    const hasEnabledAction = flag.availableActions.some((action) => action.enabled);

    return {
      key: flag.key,
      keyCell: renderStack(
        <span style={{ color: theme.text, fontFamily: theme.monoFamily }}>
          {flag.key}
        </span>,
        flag.state === "partial"
          ? t("flags.midRollout", locale)
          : flag.tenantIds.length > 0
            ? t("flags.tenantOverrideCount", locale, {
                count: flag.tenantIds.length,
              })
            : t("flags.opsReadOnly", locale),
      ),
      scopeCell: (
        <Pill theme={theme} tone={flag.scope === "tenant" ? "warn" : "info"}>
          {t(`flags.scope.${flag.scope}`, locale)}
        </Pill>
      ),
      stateCell: renderStack(
        <Pill theme={theme} tone={stateTone(flag.state)} dot>
          {t(`flags.state.${flag.state}`, locale)}
        </Pill>,
        flag.currentValue !== flag.state ? flag.currentValue : undefined,
        flag.state === "partial" ? t("flags.partialStateHelp", locale) : undefined,
      ),
      updatedByCell: renderStack(
        flag.lastChangedBy ?? t("common.dash", locale),
        flag.historyLink ? t("flags.crossAppHint", locale) : undefined,
      ),
      updatedAt: formatDateTime(flag.lastChangedAt, locale),
      description: flag.description,
      actionsCell: (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {!hasEnabledAction ? (
            <Pill theme={theme} tone="neutral">
              {t("flags.readOnly", locale)}
            </Pill>
          ) : null}
          {flag.availableActions.map((action) =>
            action.enabled ? (
              <ActionLink
                key={`${flag.key}-${action.action}`}
                href={historyHref}
                tone="accent"
                {...(flag.historyLink?.openMode === "new_tab"
                  ? { target: "_blank" as const }
                  : {})}
              >
                {formatActionLabel(locale, action.action)}
              </ActionLink>
            ) : (
              <div
                key={`${flag.key}-${action.action}`}
                style={{ display: "grid", gap: 4 }}
              >
                <Pill theme={theme} tone={actionTone(action.riskLevel)}>
                  {formatActionLabel(locale, action.action)}
                </Pill>
                {action.disabledReasonCode ? (
                  <span style={{ color: theme.textDim, fontSize: 11 }}>
                    {formatDisabledReason(locale, action.disabledReasonCode)}
                  </span>
                ) : null}
              </div>
            ),
          )}
        </div>
      ),
      _selected: flag.state === "partial",
    };
  });
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
    notes: [],
    refresh: fallbackRefreshMetadata(),
    refreshTier: REFRESH_TIER,
  };
  let errorMessage: string | null = null;

  try {
    const response = await client.getOpsFeatureFlags();
    payload = normalizeFeatureFlags(response, locale);
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : t("common.unknown", locale);
    payload = {
      flags: [],
      notes: [],
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
  const platformAdminFlagsHref = resolvePlatformAdminFlagsHref();
  const rows = buildFlagTableRows(visibleFlags, locale);

  return (
    <>
      <PageHeader
        theme={theme}
        title={locale === "zh" ? "功能旗標 · read only" : "Feature Flags · read only"}
        subtitle={t("flags.subtitleReadOnly", locale)}
        actions={
          <>
            <ActionLink href={refreshHref}>{t("common.refresh", locale)}</ActionLink>
            <ActionLink
              href={platformAdminFlagsHref}
              target="_blank"
              tone="accent"
            >
              {t("flags.platformAdminLink", locale)}
            </ActionLink>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {errorMessage ? (
          <Banner
            theme={theme}
            tone="danger"
            title={t("common.somethingWrong", locale)}
            body={errorMessage}
          />
        ) : null}

        {payload.refresh.dataFreshness !== "fresh" ? (
          <Banner
            theme={theme}
            tone={
              payload.refresh.dataFreshness === "degraded" ? "danger" : "warn"
            }
            title={t("flags.staleBanner.title", locale)}
            body={t("flags.staleBanner.body", locale, {
              freshness: t(
                `flags.freshness.${payload.refresh.dataFreshness}`,
                locale,
              ),
              generatedAt: formatDateTime(payload.refresh.generatedAt, locale),
            })}
            actions={
              <ActionLink href={refreshHref} tone="accent">
                {t("common.refresh", locale)}
              </ActionLink>
            }
          />
        ) : null}

        <div style={kpiGridStyle}>
          <KPI
            theme={theme}
            label={locale === "zh" ? "可見旗標" : "Visible flags"}
            value={payload.flags.length}
            sub={locale === "zh" ? "目前快照總數" : "Current snapshot total"}
          />
          <KPI
            theme={theme}
            label={locale === "zh" ? "已啟用" : "Enabled"}
            value={enabledCount}
            sub={locale === "zh" ? "營運可見 enabled" : "Operationally enabled"}
          />
          <KPI
            theme={theme}
            label={locale === "zh" ? "進行中 rollout" : "Mid-rollout"}
            value={partialCount}
            sub={locale === "zh" ? "跨租戶值不一致" : "Tenant values diverge"}
          />
          <KPI
            theme={theme}
            label={locale === "zh" ? "租戶層級" : "Tenant-scoped"}
            value={tenantScopedCount}
            sub={locale === "zh" ? "有 override 足跡" : "Overrides are present"}
          />
        </div>

        <div style={splitGridStyle}>
          <Card
            theme={theme}
            title={t("flags.registryTitle", locale)}
            subtitle={t("flags.registrySubtitle", locale)}
            padding={18}
          >
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <ScopeLink
                  href={buildPageHref(query, "all", emptyReasonOverride)}
                  active={scope === "all"}
                >
                  {t("flags.scope.all", locale)}
                </ScopeLink>
                <ScopeLink
                  href={buildPageHref(query, "global", emptyReasonOverride)}
                  active={scope === "global"}
                >
                  {t("flags.scope.global", locale)}
                </ScopeLink>
                <ScopeLink
                  href={buildPageHref(query, "tenant", emptyReasonOverride)}
                  active={scope === "tenant"}
                >
                  {t("flags.scope.tenant", locale)}
                </ScopeLink>
              </div>

              <form
                action="/feature-flags"
                method="get"
                style={{
                  display: "grid",
                  gap: 10,
                  gridTemplateColumns: "minmax(0, 1fr) auto auto",
                }}
              >
                <input type="hidden" name="scope" value={scope} />
                <input
                  name="q"
                  defaultValue={query}
                  placeholder={t("flags.searchPlaceholder", locale)}
                  style={{
                    minHeight: 34,
                    borderRadius: 8,
                    border: `1px solid ${theme.border}`,
                    background: theme.surface,
                    color: theme.text,
                    padding: "0 12px",
                    fontSize: 12.5,
                    fontFamily: theme.fontFamily,
                  }}
                />
                <button
                  type="submit"
                  style={{
                    minHeight: 34,
                    padding: "0 12px",
                    borderRadius: 8,
                    border: `1px solid ${theme.accent}`,
                    background: theme.accentBg,
                    color: theme.accent,
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: theme.fontFamily,
                    cursor: "pointer",
                  }}
                >
                  {t("common.search", locale)}
                </button>
                <ActionLink href={pageHref}>{t("flags.keepFilters", locale)}</ActionLink>
              </form>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <Pill theme={theme} tone="accent">
                  {t(`flags.refreshTier.${payload.refreshTier}`, locale)}
                </Pill>
                <Pill theme={theme} tone={refreshTone(payload.refresh.dataFreshness)} dot>
                  {t(`flags.freshness.${payload.refresh.dataFreshness}`, locale)}
                </Pill>
                <Pill theme={theme} tone="neutral">
                  {payload.refresh.source}
                </Pill>
                <Pill theme={theme} tone="neutral">
                  {formatDateTime(payload.refresh.generatedAt, locale)}
                </Pill>
              </div>
            </div>
          </Card>

          <Card
            theme={theme}
            title={locale === "zh" ? "治理邊界" : "Governance boundary"}
            subtitle={
              locale === "zh"
                ? "ops 只做 read-only 可見性與交叉 app 深連結。"
                : "Ops stays read-only and links to the owner app for governance."
            }
            padding={18}
          >
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <Pill theme={theme} tone="neutral">
                  GET /api/ops/feature-flags
                </Pill>
                <Pill theme={theme} tone="neutral">
                  availableActions
                </Pill>
                <Pill theme={theme} tone="neutral">
                  EmptyReason x6
                </Pill>
              </div>
              <div
                style={{
                  color: theme.textMuted,
                  fontSize: 12.5,
                  lineHeight: 1.55,
                }}
              >
                {t("flags.registryFooterV2", locale)}
              </div>
              {payload.notes.length > 0 ? (
                <div style={{ display: "grid", gap: 6 }}>
                  {payload.notes.map((note) => (
                    <div
                      key={note}
                      style={{
                        color: theme.textDim,
                        fontSize: 11.5,
                        borderTop: `1px solid ${theme.border}`,
                        paddingTop: 8,
                      }}
                    >
                      {note}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </Card>
        </div>

        {effectiveEmptyReason ? (
          <EmptyStateCard
            locale={locale}
            reason={effectiveEmptyReason}
            query={query}
            scope={scope}
            {...(payload.emptyState?.messageCode
              ? { messageCode: payload.emptyState.messageCode }
              : {})}
          />
        ) : (
          <Card
            theme={theme}
            title={locale === "zh" ? "Operational flag registry" : "Operational flag registry"}
            subtitle={t("flags.registrySummaryV2", locale, {
              total: payload.flags.length,
              enabled: enabledCount,
              partial: partialCount,
              tenant: tenantScopedCount,
            })}
            padding={0}
          >
            <Table theme={theme} columns={tableColumns} rows={rows} />
          </Card>
        )}
      </div>
    </>
  );
}
