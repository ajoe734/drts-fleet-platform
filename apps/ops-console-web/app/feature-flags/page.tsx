import Link from "next/link";
import type { ReactNode } from "react";
import type {
  CrossAppResourceLink,
  EmptyStateEnvelope,
  EmptyReason,
  FeatureFlag,
  FeatureFlagSummary,
  RefreshTier,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import {
  classifyOpsErrorReason,
  formatOpsUiError,
  toOpsErrorMessage,
} from "@/lib/error-copy";
import { getServerLocale } from "@/lib/server-locale";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
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

type FeatureFlagRecordLike = Partial<FeatureFlag> &
  FeatureFlag & {
    scope?: FlagScope;
    currentValue?: string;
    updatedBy?: string;
    changedBy?: string;
    lastChangedBy?: string;
    availableActions?: ResourceActionDescriptor[] | null;
    historyLink?: CrossAppResourceLink | null;
  };

type OpsFeatureFlagSummaryLike = Partial<FeatureFlagSummary> & {
  flags?: FeatureFlagRecordLike[];
  notes?: string[];
  refresh?: UiRefreshMetadata;
  refreshTier?: RefreshTier;
  emptyState?: EmptyStateEnvelope;
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
  emptyState?: EmptyStateEnvelope;
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

function copyText(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

type EmptyStateIconName = "flags" | "audit" | "reports" | "search" | "warn";

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

const overviewCardStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.25fr) minmax(320px, 0.9fr)",
  gap: 16,
  alignItems: "start",
};

const metaGridStyle = {
  display: "grid",
  gap: 12,
};

function buildTableColumns(locale: Locale): CanvasTableColumn<FlagTableRow>[] {
  return [
    { h: copyText(locale, "KEY", "旗標"), k: "keyCell", w: 320, mono: true },
    { h: copyText(locale, "SCOPE", "範圍"), k: "scopeCell", w: 120 },
    { h: copyText(locale, "STATE", "狀態"), k: "stateCell", w: 180 },
    {
      h: copyText(locale, "UPDATED BY", "更新人"),
      k: "updatedByCell",
      w: 180,
    },
    {
      h: copyText(locale, "AT", "更新時間"),
      k: "updatedAt",
      w: 160,
      mono: true,
    },
    { h: copyText(locale, "DESCRIPTION", "說明"), k: "description" },
    { h: copyText(locale, "ACTIONS", "操作"), k: "actionsCell", w: 220 },
  ];
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isEmptyReason(value: string | undefined): value is EmptyReason {
  return (
    value !== undefined &&
    EMPTY_REASON_VALUES.includes(value as (typeof EMPTY_REASON_VALUES)[number])
  );
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

function normalizeAvailableActions(
  availableActions: ResourceActionDescriptor[] | null | undefined,
): ResourceActionDescriptor[] {
  return Array.isArray(availableActions) ? availableActions : [];
}

function normalizeFeatureFlags(
  payload: unknown,
  locale: Locale,
): NormalizedFlagsPayload {
  const maybePayload =
    payload && typeof payload === "object"
      ? (payload as OpsFeatureFlagSummaryLike)
      : ({} as OpsFeatureFlagSummaryLike);
  const flags = Array.isArray(maybePayload.flags) ? maybePayload.flags : [];
  const grouped = new Map<string, FeatureFlagRecordLike[]>();

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

  const normalizedFlags: NormalizedFlag[] = [];

  for (const [key, records] of grouped.entries()) {
    const globalRecord =
      records.find((record) => !record.tenantId && record.scope !== "tenant") ??
      records[0];
    if (!globalRecord) continue;
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
      globalRecord.scope ?? (tenantRecords.length > 0 ? "tenant" : "global");

    normalizedFlags.push({
      key,
      description:
        featureFlagDescription(locale, globalRecord) ||
        t("common.dash", locale),
      scope,
      state,
      currentValue,
      lastChangedAt: latestRecord?.updatedAt ?? null,
      lastChangedBy:
        latestRecord?.lastChangedBy ??
        latestRecord?.updatedBy ??
        latestRecord?.changedBy ??
        null,
      availableActions: normalizeAvailableActions(
        globalRecord.availableActions,
      ),
      historyLink: globalRecord.historyLink ?? null,
      tenantIds: tenantRecords
        .map((record) => record.tenantId)
        .filter((value): value is string => Boolean(value)),
    } satisfies NormalizedFlag);
  }

  normalizedFlags.sort((left, right) => left.key.localeCompare(right.key));

  return {
    flags: normalizedFlags,
    notes: Array.isArray(maybePayload.notes) ? maybePayload.notes : [],
    refresh: maybePayload.refresh ?? fallbackRefreshMetadata(),
    refreshTier: maybePayload.refreshTier ?? REFRESH_TIER,
    ...(maybePayload.emptyState ? { emptyState: maybePayload.emptyState } : {}),
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
  if (!origin) return null;
  return new URL(link.route, `${origin.replace(/\/$/, "")}/`).toString();
}

function resolvePlatformAdminFlagsHref(flagKey?: string): string | null {
  const route = flagKey
    ? `/feature-flags?flag=${encodeURIComponent(flagKey)}`
    : "/feature-flags";
  return (
    resolveCrossAppHref({
      targetApp: "platform-admin",
      route,
      resourceType: "feature_flag",
      resourceId: flagKey ?? "feature_flags",
      openMode: "new_tab",
      label: "平台管理端",
    }) ?? route
  );
}

const FEATURE_FLAG_LABELS: Record<string, Record<Locale, string>> = {
  "driver-app.earnings": {
    en: "Driver app earnings",
    zh: "司機應用程式收益",
  },
  "driver-app.incidents": {
    en: "Driver app incident reports",
    zh: "司機應用程式事故回報",
  },
  "driver-app.shift": {
    en: "Driver app shifts and attendance",
    zh: "司機應用程式班次與出勤",
  },
  "driver-app.tasks": {
    en: "Driver app task lifecycle",
    zh: "司機應用程式任務生命週期",
  },
  "ops-console.callcenter": {
    en: "Ops Console call center",
    zh: "營運控制台客服中心",
  },
  "ops-console.complaint": {
    en: "Ops Console complaint cases",
    zh: "營運控制台客訴案件",
  },
  "ops-console.dispatch": {
    en: "Ops Console dispatch board",
    zh: "營運控制台派車調度板",
  },
  "ops-console.reports": {
    en: "Ops Console reports",
    zh: "營運控制台報表",
  },
  "phase1.read-models": {
    en: "Phase 1 read models",
    zh: "第一階段讀模型",
  },
  "phase1.smoke-paths": {
    en: "Phase 1 smoke-test paths",
    zh: "第一階段冒煙測試路徑",
  },
  "tenant-portal.billing": {
    en: "Tenant portal billing",
    zh: "租戶入口帳務",
  },
  "tenant-portal.booking": {
    en: "Tenant portal bookings",
    zh: "租戶入口訂車",
  },
  "tenant-portal.reports": {
    en: "Tenant portal reports",
    zh: "租戶入口報表",
  },
  "tenant-portal.webhooks": {
    en: "Tenant portal webhooks",
    zh: "租戶入口回呼",
  },
};

function featureFlagDisplayName(locale: Locale, key: string) {
  const label = FEATURE_FLAG_LABELS[key];
  if (label) return label[locale];

  if (locale === "zh") {
    return formatOpsCodeLabel(locale, key);
  }

  return key
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function featureFlagDescription(locale: Locale, flag: FeatureFlagRecordLike) {
  if (locale !== "zh") return flag.description ?? "—";

  const descriptions: Record<string, string> = {
    "driver-app.earnings": "啟用司機應用程式收益讀模型",
    "driver-app.incidents": "啟用司機應用程式事故回報",
    "driver-app.shift": "啟用司機應用程式班次與出勤追蹤",
    "driver-app.tasks": "啟用司機應用程式任務生命週期",
    "ops-console.callcenter": "啟用營運後台客服中心工作階段檢視",
    "ops-console.complaint": "啟用營運後台客訴案件管理",
    "ops-console.dispatch": "啟用營運後台派車調度板",
    "ops-console.reports": "啟用營運後台報表任務管理",
    "phase1.read-models": "啟用第一階段讀模型介面",
    "phase1.smoke-paths": "啟用第一階段冒煙測試端點",
    "tenant-portal.billing": "啟用租戶入口帳務檢視",
    "tenant-portal.booking": "啟用租戶入口訂車管理",
    "tenant-portal.reports": "啟用租戶入口報表任務提交",
    "tenant-portal.webhooks": "啟用租戶入口回呼管理",
  };

  return descriptions[flag.key] || flag.description || "—";
}

function formatFlagActor(locale: Locale, value: string | null) {
  if (!value) return t("common.dash", locale);
  return formatOpsCodeLabel(locale, value);
}

function formatFlagCurrentValue(locale: Locale, value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return t("flags.state.enabled", locale);
  if (normalized === "false") return t("flags.state.disabled", locale);
  if (normalized === "partial") return t("flags.state.partial", locale);
  return formatOpsCodeLabel(locale, value);
}

function formatRefreshSource(
  locale: Locale,
  source: UiRefreshMetadata["source"],
) {
  if (locale === "zh") {
    if (source === "static") return "靜態快照";
    if (source === "cache") return "快取";
    if (source === "live") return "即時來源";
    if (source === "sandbox") return "沙箱";
  }
  return formatOpsCodeLabel(locale, source);
}

function formatFeatureFlagNote(locale: Locale, note: string) {
  if (locale !== "zh") return note;

  const notes: Record<string, string> = {
    "Feature flags control module-level rollout for Phase 1 client surfaces.":
      "功能旗標控制第一階段用戶端模組的推出範圍。",
    "Flags are tenant-scoped; include x-tenant-id header for tenant-specific overrides.":
      "旗標支援租戶範圍；查詢租戶覆寫時需帶入租戶識別標頭。",
    "This endpoint is admin-only; smoke test with x-actor-type=platform_admin.":
      "此端點僅限管理員使用；冒煙測試時使用平台管理員身分。",
  };

  return notes[note] ?? note;
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
  return classifyOpsErrorReason(error);
}

function formatActionLabel(locale: Locale, action: string) {
  const key = `flags.action.${action}`;
  const translated = t(key, locale);
  if (translated !== key) return translated;
  if (locale === "zh") return formatOpsCodeLabel(locale, action);
  return action
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDisabledReason(locale: Locale, reasonCode: string) {
  const key = `flags.disabledReason.${reasonCode}`;
  const translated = t(key, locale);
  if (translated !== key) return translated;
  return formatOpsCodeLabel(locale, reasonCode);
}

function resolveFlagActionHref(
  flag: NormalizedFlag,
  action: ResourceActionDescriptor,
): string | null {
  if (action.action !== "view_change_history") {
    return null;
  }

  return (
    resolveCrossAppHref(flag.historyLink) ??
    resolvePlatformAdminFlagsHref(flag.key)
  );
}

function resolveFlagActionTarget(
  flag: NormalizedFlag,
  action: ResourceActionDescriptor,
): "_blank" | undefined {
  if (action.action !== "view_change_history") {
    return undefined;
  }

  return flag.historyLink?.openMode === "same_tab" ? undefined : "_blank";
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
        <div style={{ color: theme.textMuted, fontSize: 11.5 }}>
          {secondary}
        </div>
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
  actionHref: string | null;
  actionTarget?: "_blank";
} {
  switch (reason) {
    case "not_provisioned":
      return {
        icon: "flags",
        tone: "warn",
        label: copyText(locale, "NOT PROVISIONED", "尚未開通"),
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
        label: copyText(locale, "PERMISSION DENIED", "權限不足"),
        title: t("flags.emptyState.permissionDenied.title", locale),
        body: t("flags.emptyState.permissionDenied.body", locale),
        actionLabel: t("common.refresh", locale),
        actionHref: buildRefreshHref(query, scope),
      };
    case "external_unavailable":
      return {
        icon: "reports",
        tone: "warn",
        label: copyText(locale, "EXTERNAL UNAVAILABLE", "外部依賴異常"),
        title: t("flags.emptyState.externalUnavailable.title", locale),
        body: t("flags.emptyState.externalUnavailable.body", locale),
        actionLabel: t("common.tryAgain", locale),
        actionHref: buildRefreshHref(query, scope),
      };
    case "filtered_empty":
      return {
        icon: "search",
        tone: "neutral",
        label: copyText(locale, "FILTERED EMPTY", "篩選後無結果"),
        title: t("flags.emptyState.filteredEmpty.title", locale),
        body: t("flags.emptyState.filteredEmpty.body", locale),
        actionLabel: t("flags.clearFilters", locale),
        actionHref: "/feature-flags",
      };
    case "fetch_failed":
      return {
        icon: "warn",
        tone: "danger",
        label: copyText(locale, "FETCH FAILED", "載入失敗"),
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
        label: copyText(locale, "NO DATA", "目前無資料"),
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
  nextAction,
}: {
  locale: Locale;
  reason: EmptyReason;
  query: string;
  scope: ScopeFilter;
  messageCode?: string;
  nextAction?: ResourceActionDescriptor;
}) {
  const emptyState = buildEmptyState(locale, reason, query, scope);
  const nextActionLabel = nextAction
    ? formatActionLabel(locale, nextAction.action)
    : emptyState.actionLabel;
  const nextActionHref =
    nextAction?.action === "view_change_history"
      ? resolvePlatformAdminFlagsHref()
      : emptyState.actionHref;

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
              {copyText(
                locale,
                formatOpsCodeLabel(locale, reason),
                reason === "not_provisioned"
                  ? "尚未開通"
                  : reason === "permission_denied"
                    ? "權限不足"
                    : reason === "external_unavailable"
                      ? "外部依賴異常"
                      : reason === "filtered_empty"
                        ? "篩選後無結果"
                        : reason === "fetch_failed"
                          ? "載入失敗"
                          : "目前無資料",
              )}
            </Pill>
            {messageCode ? (
              <Pill theme={theme} tone="neutral">
                {copyText(locale, messageCode, "後端訊息已記錄")}
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
            {nextActionHref ? (
              <ActionLink
                href={nextActionHref}
                tone={
                  emptyState.tone === "neutral" ? "accent" : emptyState.tone
                }
                {...(emptyState.actionTarget
                  ? { target: emptyState.actionTarget }
                  : {})}
              >
                {nextActionLabel}
              </ActionLink>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                <Pill theme={theme} tone="warn">
                  {nextActionLabel}
                </Pill>
                <span style={{ color: theme.textDim, fontSize: 11 }}>
                  {t("flags.platformAdminLinkUnavailable", locale)}
                </span>
              </div>
            )}
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
    const hasHistoryLinkAction = flag.availableActions.some(
      (action) => action.action === "view_change_history",
    );

    return {
      key: flag.key,
      keyCell: renderStack(
        <span style={{ color: theme.text, fontFamily: theme.monoFamily }}>
          {featureFlagDisplayName(locale, flag.key)}
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
        flag.currentValue !== flag.state
          ? formatFlagCurrentValue(locale, flag.currentValue)
          : undefined,
        flag.state === "partial"
          ? t("flags.partialStateHelp", locale)
          : undefined,
      ),
      updatedByCell: renderStack(
        formatFlagActor(locale, flag.lastChangedBy),
        hasHistoryLinkAction ? t("flags.crossAppHint", locale) : undefined,
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
          {flag.availableActions.length === 0 ? (
            <Pill theme={theme} tone="neutral">
              {t("flags.readOnly", locale)}
            </Pill>
          ) : null}
          {flag.availableActions.map((action) => {
            const href = resolveFlagActionHref(flag, action);
            const target = resolveFlagActionTarget(flag, action);
            const disabledReason =
              action.disabledReasonCode ??
              (action.enabled && !href
                ? action.action === "view_change_history"
                  ? "history_link_missing"
                  : "read_only_surface"
                : null);

            return action.enabled && href ? (
              <ActionLink
                key={`${flag.key}-${action.action}`}
                href={href}
                tone="accent"
                {...(target ? { target } : {})}
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
                {disabledReason ? (
                  <span style={{ color: theme.textDim, fontSize: 11 }}>
                    {formatDisabledReason(locale, disabledReason)}
                  </span>
                ) : null}
              </div>
            );
          })}
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
    const response = await client.getFeatureFlags();
    payload = normalizeFeatureFlags(response, locale);
  } catch (error) {
    const rawError = toOpsErrorMessage(error, t("common.unknown", locale));
    errorMessage = formatOpsUiError(
      locale,
      rawError,
      locale === "en"
        ? "Feature flag data unavailable"
        : "功能旗標資料暫時無法載入",
    );
    payload = {
      flags: [],
      notes: [],
      refresh: fallbackRefreshMetadata(),
      refreshTier: REFRESH_TIER,
      emptyState: {
        reason: mapErrorToEmptyReason(rawError),
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
  const enabledCount = payload.flags.filter(
    (flag) => flag.state === "enabled",
  ).length;
  const partialCount = payload.flags.filter(
    (flag) => flag.state === "partial",
  ).length;
  const tenantScopedCount = payload.flags.filter(
    (flag) => flag.scope === "tenant",
  ).length;
  const refreshHref = buildRefreshHref(query, scope, emptyReasonOverride);
  const platformAdminFlagsHref = resolvePlatformAdminFlagsHref();
  const rows = buildFlagTableRows(visibleFlags, locale);
  const tableColumns = buildTableColumns(locale);

  return (
    <>
      <PageHeader
        theme={theme}
        title={
          locale === "zh" ? "功能旗標 · 唯讀" : "Feature Flags · read only"
        }
        subtitle={t("flags.subtitleReadOnly", locale)}
        actions={
          <>
            <ActionLink href={refreshHref}>
              {t("common.refresh", locale)}
            </ActionLink>
            {platformAdminFlagsHref ? (
              <ActionLink
                href={platformAdminFlagsHref}
                target="_blank"
                tone="accent"
              >
                {t("flags.platformAdminLink", locale)}
              </ActionLink>
            ) : (
              <Pill theme={theme} tone="warn">
                {t("flags.platformAdminLinkUnavailable", locale)}
              </Pill>
            )}
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

        <div style={overviewCardStyle}>
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
                <ActionLink href="/feature-flags">
                  {t("flags.clearFilters", locale)}
                </ActionLink>
              </form>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <KPI
                  theme={theme}
                  label={locale === "zh" ? "可見旗標" : "Visible flags"}
                  value={payload.flags.length}
                  sub={
                    locale === "zh" ? "目前快照總數" : "Current snapshot total"
                  }
                />
                <KPI
                  theme={theme}
                  label={locale === "zh" ? "進行中推進" : "Mid-rollout"}
                  value={partialCount}
                  sub={
                    locale === "zh" ? "跨租戶值不一致" : "Tenant values diverge"
                  }
                />
              </div>

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
                <Pill
                  theme={theme}
                  tone={refreshTone(payload.refresh.dataFreshness)}
                  dot
                >
                  {t(
                    `flags.freshness.${payload.refresh.dataFreshness}`,
                    locale,
                  )}
                </Pill>
                <Pill theme={theme} tone="neutral">
                  {formatRefreshSource(locale, payload.refresh.source)}
                </Pill>
                <Pill theme={theme} tone="neutral">
                  {formatDateTime(payload.refresh.generatedAt, locale)}
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
            </div>
          </Card>

          <Card
            theme={theme}
            title={locale === "zh" ? "治理邊界" : "Governance boundary"}
            subtitle={
              locale === "zh"
                ? "營運後台只提供唯讀可見性，以及跨應用深連結。"
                : "Ops stays read-only and links to the owner app for governance."
            }
            padding={18}
          >
            <div style={metaGridStyle}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <Pill theme={theme} tone="accent">
                  {copyText(
                    locale,
                    "GET /api/ops/feature-flags",
                    "營運旗標資料來源",
                  )}
                </Pill>
                <Pill theme={theme} tone="neutral">
                  {copyText(locale, "availableActions", "可用操作")}
                </Pill>
                <Pill theme={theme} tone="neutral">
                  {copyText(locale, "EmptyReason x6", "六種空狀態原因")}
                </Pill>
                <Pill theme={theme} tone="neutral">
                  {copyText(locale, "cross-app deep links", "跨應用深連結")}
                </Pill>
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                <KPI
                  theme={theme}
                  label={locale === "zh" ? "已啟用" : "Enabled"}
                  value={enabledCount}
                  sub={
                    locale === "zh"
                      ? "目前在營運端可見且啟用"
                      : "Operationally enabled"
                  }
                />
                <KPI
                  theme={theme}
                  label={locale === "zh" ? "租戶層級" : "Tenant-scoped"}
                  value={tenantScopedCount}
                  sub={
                    locale === "zh"
                      ? "可見租戶覆寫痕跡"
                      : "Overrides are present"
                  }
                />
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
              <div
                style={{
                  display: "grid",
                  gap: 6,
                  color: theme.textDim,
                  fontSize: 11.5,
                  lineHeight: 1.45,
                }}
              >
                <div>{t("flags.boundary.readOnly", locale)}</div>
                <div>{t("flags.boundary.deepLink", locale)}</div>
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
                      {formatFeatureFlagNote(locale, note)}
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
            {...(payload.emptyState?.nextAction
              ? { nextAction: payload.emptyState.nextAction }
              : {})}
            {...(payload.emptyState?.messageCode
              ? { messageCode: payload.emptyState.messageCode }
              : {})}
          />
        ) : (
          <Card
            theme={theme}
            title={
              locale === "zh" ? "營運旗標總覽" : "Operational flag registry"
            }
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
