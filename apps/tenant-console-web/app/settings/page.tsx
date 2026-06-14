import type { CSSProperties } from "react";
import type {
  ApiSuccessEnvelope,
  AuditLogRecord,
  CrossAppResourceLink,
  EmptyStateEnvelope,
  EmptyReason,
  IdentityContext,
  ResourceActionDescriptor,
  TenantApiKeyRecord,
  TenantBillingProfile,
  TenantIntegrationGovernancePackage,
  TenantNotificationPreferences,
  TenantNotificationSubscription,
  TenantQuotaSummary,
  TenantSlaProfile,
  TenantUserRoleRecord,
  TenantWebhookEndpoint,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasInput,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasSelect,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { API_URL, DEMO_ACTOR_ID, DEMO_TENANT_ID } from "@/lib/api-client";
import { TENANT_CONSOLE_ENV } from "@/lib/navigation";
import { getRefreshTierDefinition } from "@/lib/ui-runtime";
import { getServerLocale } from "@/lib/server-locale";
import { type Locale, t } from "@/lib/translations";
import {
  SettingsNotificationTable,
  type SettingsNotificationRow,
} from "./settings-notification-table";
import { SettingsRefreshButton } from "./settings-refresh-button";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const SETTINGS_PAGE_TIER = getRefreshTierDefinition("slow");
const APP_BASE_URLS: Record<CrossAppResourceLink["targetApp"], string> = {
  "ops-console": "http://localhost:3003",
  "platform-admin": "http://localhost:3002",
  "tenant-console": "http://localhost:3004",
  "fleet-partner-portal": "http://localhost:3007",
  "bank-console": "http://localhost:3009",
};
const LOCAL_TENANT_ROUTES = new Set([
  "/settings",
  "/users",
  "/audit",
  "/api-keys",
  "/webhooks",
]);

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const topCanvasGridStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 16,
};

const splitGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
};

const generalGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const generalCardStyle: CSSProperties = {
  minWidth: 0,
};

const statusCardStyle: CSSProperties = {
  minWidth: 0,
};

const settingsLaneStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
  marginBottom: 16,
};

const capabilityStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const sectionLabelStyle: CSSProperties = {
  marginBottom: 8,
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: th.textMuted,
};

const chipRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const mutedFootnoteStyle: CSSProperties = {
  fontSize: 11,
  color: th.textDim,
};

const runtimeStripStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
};

const runtimeChipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  minHeight: 32,
  padding: "6px 10px",
  borderRadius: 999,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
  fontSize: 11.5,
  color: th.textMuted,
};

const runtimeLabelStyle: CSSProperties = {
  fontFamily: th.monoFamily,
  fontSize: 10.5,
  letterSpacing: 0.3,
  textTransform: "uppercase",
  color: th.textDim,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
};

const summaryStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const actionPanelStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
};

const checklistStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: "none",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const checklistItemStyle: CSSProperties = {
  fontSize: 12,
  color: th.text,
  display: "flex",
  gap: 8,
  alignItems: "flex-start",
};

const checklistBulletStyle: CSSProperties = {
  color: th.accent,
  fontFamily: th.monoFamily,
  flexShrink: 0,
};

const emptyStateStyle: CSSProperties = {
  fontSize: 12,
  color: th.textMuted,
  textAlign: "center",
  padding: "20px 16px",
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const sitemapListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const sitemapItemStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
};

const sitemapRouteStyle: CSSProperties = {
  fontSize: 11,
  fontFamily: th.monoFamily,
  color: th.textDim,
};

const linkStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const linkRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
};

const emptyReasonGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const numberFormatter = new Intl.NumberFormat("en");
const dateFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
});
const dateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "short",
});

type RuntimeListEnvelope<T> = {
  items: T[];
  refresh: UiRefreshMetadata;
  availableActions?: ResourceActionDescriptor[];
  emptyState?: EmptyStateEnvelope;
};

type RuntimeResourceEnvelope<T> = {
  item: T;
  refresh: UiRefreshMetadata;
  availableActions?: ResourceActionDescriptor[];
  emptyState?: EmptyStateEnvelope;
};

type RuntimeResourceSurface<T> = {
  item: T | null;
  refresh: UiRefreshMetadata | null;
  availableActions: ResourceActionDescriptor[];
  emptyState: EmptyStateEnvelope | null;
  legacy: boolean;
};

type RuntimeListSurface<T> = {
  items: T[];
  refresh: UiRefreshMetadata | null;
  availableActions: ResourceActionDescriptor[];
  emptyState: EmptyStateEnvelope | null;
  legacy: boolean;
};

type SettingsData = {
  identity: RuntimeResourceSurface<IdentityContext>;
  billingProfile: RuntimeResourceSurface<TenantBillingProfile>;
  preferences: RuntimeResourceSurface<TenantNotificationPreferences>;
  sla: RuntimeResourceSurface<TenantSlaProfile>;
  governance: RuntimeResourceSurface<TenantIntegrationGovernancePackage>;
  quotaSummary: RuntimeResourceSurface<TenantQuotaSummary>;
  users: RuntimeListSurface<TenantUserRoleRecord>;
  apiKeys: RuntimeListSurface<TenantApiKeyRecord>;
  webhooks: RuntimeListSurface<TenantWebhookEndpoint>;
  auditLogs: RuntimeListSurface<AuditLogRecord>;
  errors: string[];
};

type ActionLinkKind = "link" | "refresh" | "unresolved";

type ActionLink = {
  descriptor: ResourceActionDescriptor;
  label: string;
  kind: ActionLinkKind;
  surfaceLabel?: string;
  href?: string;
  link?: CrossAppResourceLink;
  note?: string;
};

type ActionTarget = {
  href?: string;
  link?: CrossAppResourceLink;
  note?: string;
};

type ActionSurface = ActionTarget & {
  label: string;
};

type SettingsSitemapEntry = {
  title: string;
  route: string;
  detail: string;
  actions: ActionLink[];
};

type EmptyStateSurface = {
  key: string;
  title: string;
  route: string;
  envelope: EmptyStateEnvelope;
  actions: ActionLink[];
};

type EmptyStateSurfaceCandidate = Omit<EmptyStateSurface, "envelope"> & {
  envelope: EmptyStateEnvelope | null;
};

type RuntimeChip =
  | {
      label: string;
      value: string;
      mono?: true;
    }
  | {
      label: string;
      value: string;
      tone: CanvasTone;
    };

type ActionSource = {
  surface: ActionSurface;
  descriptors: ResourceActionDescriptor[];
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateFormatter.format(parsed);
}

function formatUpdated(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateTimeFormatter.format(parsed);
}

function formatCount(value: number) {
  return numberFormatter.format(value);
}

function formatQuotaLimit(summary: TenantQuotaSummary | null, locale: Locale) {
  if (!summary) return "—";

  if (summary.limit.bookingCountLimit !== null) {
    return t("settings.quota.perMonthTrips", locale, {
      count: formatCount(summary.limit.bookingCountLimit),
    });
  }

  if (summary.limit.amountMinorLimit !== null) {
    return t("settings.quota.perMonthAmount", locale, {
      currency: summary.limit.currency,
      amount: formatCount(summary.limit.amountMinorLimit / 100),
    });
  }

  return t("settings.value.unlimited", locale);
}

function formatQuotaRemaining(
  summary: TenantQuotaSummary | null,
  locale: Locale,
) {
  if (!summary) return "—";

  if (summary.usage.bookingCountRemaining !== null) {
    return t("settings.quota.tripsRemaining", locale, {
      count: formatCount(summary.usage.bookingCountRemaining),
    });
  }

  if (summary.usage.amountMinorRemaining !== null) {
    return t("settings.quota.amountRemaining", locale, {
      currency: summary.limit.currency,
      amount: formatCount(summary.usage.amountMinorRemaining / 100),
    });
  }

  return t("settings.value.unlimited", locale);
}

function formatRemainingPercent(summary: TenantQuotaSummary | null) {
  if (summary?.usage.remainingPercent === null || !summary) {
    return "—";
  }

  return `${summary.usage.remainingPercent}%`;
}

function getConsentValue(
  preferences: TenantNotificationPreferences | null,
  locale: Locale,
) {
  if (!preferences?.updatedAt) {
    return t("settings.consent.notConfigured", locale);
  }

  return `pp · ${formatDate(preferences.updatedAt)}`;
}

function compareSubscriptions(
  left: TenantNotificationSubscription,
  right: TenantNotificationSubscription,
) {
  if (left.enabled !== right.enabled) {
    return left.enabled ? -1 : 1;
  }

  if (left.channel !== right.channel) {
    return getChannelRank(left.channel) - getChannelRank(right.channel);
  }

  return left.eventType.localeCompare(right.eventType, "en");
}

function normalizeSubscription(
  value: unknown,
): TenantNotificationSubscription | null {
  if (!isObject(value)) return null;
  const eventType = getStringMember(value, "eventType", "event_type");
  const channel = getStringMember(value, "channel", "channel");
  const enabled = getRecordMember(value, "enabled", "enabled");
  if (!eventType || !channel || typeof enabled !== "boolean") {
    return null;
  }

  return {
    eventType,
    channel: channel as TenantNotificationSubscription["channel"],
    enabled,
  };
}

function normalizeSubscriptions(
  values: unknown[] | undefined,
): TenantNotificationSubscription[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.flatMap((value) => {
    const subscription = normalizeSubscription(value);
    return subscription ? [subscription] : [];
  });
}

function getChannelRank(channel: TenantNotificationSubscription["channel"]) {
  switch (channel) {
    case "ops_console":
      return 0;
    case "webhook":
      return 1;
    case "email":
      return 2;
  }
}

async function fetchTenantRuntime<T>(
  path: string,
): Promise<ApiSuccessEnvelope<T>> {
  const response = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
    headers: {
      "x-actor-type": "tenant_admin",
      "x-actor-id": DEMO_ACTOR_ID,
      "x-realm": "tenant",
      "x-tenant-id": DEMO_TENANT_ID,
    },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return (await response.json()) as ApiSuccessEnvelope<T>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function parseRefreshMetadata(value: unknown): UiRefreshMetadata | null {
  if (!isObject(value)) return null;
  const generatedAt =
    typeof value.generatedAt === "string"
      ? value.generatedAt
      : typeof value.generated_at === "string"
        ? value.generated_at
        : null;
  const staleAfterMs =
    typeof value.staleAfterMs === "number"
      ? value.staleAfterMs
      : typeof value.stale_after_ms === "number"
        ? value.stale_after_ms
        : null;
  const dataFreshness =
    typeof value.dataFreshness === "string"
      ? value.dataFreshness
      : typeof value.data_freshness === "string"
        ? value.data_freshness
        : null;

  if (
    generatedAt === null ||
    staleAfterMs === null ||
    dataFreshness === null ||
    typeof value.source !== "string"
  ) {
    return null;
  }

  return {
    generatedAt,
    staleAfterMs,
    dataFreshness: dataFreshness as UiRefreshMetadata["dataFreshness"],
    source: value.source as UiRefreshMetadata["source"],
  };
}

function parseEmptyStateEnvelope(value: unknown): EmptyStateEnvelope | null {
  if (
    !isObject(value) ||
    typeof value.reason !== "string" ||
    typeof value.messageCode !== "string"
  ) {
    return null;
  }

  return {
    reason: value.reason as EmptyReason,
    messageCode: value.messageCode,
    ...(function () {
      const nextAction = parseActionDescriptor(value.nextAction);
      return nextAction ? { nextAction } : {};
    })(),
  };
}

function parseAvailableActions(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as ResourceActionDescriptor[];
  }

  return value.flatMap((item) => {
    const descriptor = parseActionDescriptor(item);
    return descriptor ? [descriptor] : [];
  });
}

function parseActionDescriptor(
  value: unknown,
): ResourceActionDescriptor | null {
  if (
    !isObject(value) ||
    typeof value.action !== "string" ||
    typeof value.enabled !== "boolean" ||
    typeof value.riskLevel !== "string"
  ) {
    return null;
  }

  return {
    action: value.action,
    enabled: value.enabled,
    riskLevel: value.riskLevel as ResourceActionDescriptor["riskLevel"],
    ...(typeof value.disabledReasonCode === "string"
      ? { disabledReasonCode: value.disabledReasonCode }
      : {}),
    ...(typeof value.requiresReason === "boolean"
      ? { requiresReason: value.requiresReason }
      : {}),
  };
}

function parseResourceSurface<T>(payload: unknown): RuntimeResourceSurface<T> {
  if (isObject(payload) && "item" in payload) {
    const envelope = payload as RuntimeResourceEnvelope<T>;
    const refresh = parseRefreshMetadata(envelope.refresh);
    return {
      item: envelope.item ?? null,
      refresh,
      availableActions: parseAvailableActions(envelope.availableActions),
      emptyState: parseEmptyStateEnvelope(envelope.emptyState),
      legacy: refresh === null,
    };
  }

  if (isObject(payload)) {
    return {
      item: payload as T,
      refresh: null,
      availableActions: [],
      emptyState: null,
      legacy: true,
    };
  }

  return {
    item: null,
    refresh: null,
    availableActions: [],
    emptyState: null,
    legacy: true,
  };
}

function parseListSurface<T>(payload: unknown): RuntimeListSurface<T> {
  if (isObject(payload) && Array.isArray(payload.items)) {
    const envelope = payload as RuntimeListEnvelope<T>;
    const refresh = parseRefreshMetadata(envelope.refresh);
    return {
      items: envelope.items,
      refresh,
      availableActions: parseAvailableActions(envelope.availableActions),
      emptyState: parseEmptyStateEnvelope(envelope.emptyState),
      legacy: refresh === null,
    };
  }

  return {
    items: [],
    refresh: null,
    availableActions: [],
    emptyState: null,
    legacy: true,
  };
}

function formatActionLabel(action: string) {
  return action.replaceAll("_", " ");
}

function buildActionLink(
  descriptor: ResourceActionDescriptor,
  surface: ActionSurface,
): ActionLink {
  const href = sanitizeLocalHref(surface.href);
  const link = surface.link;
  const note =
    descriptor.action === "refresh_snapshot"
      ? "refresh-runtime"
      : (surface.note ??
        (!href && surface.href && isTenantConsoleLocalRoute(surface.href)
          ? "route-pending"
          : undefined));
  const kind =
    descriptor.action === "refresh_snapshot"
      ? "refresh"
      : href || link
        ? "link"
        : "unresolved";

  const actionLink: ActionLink = {
    descriptor,
    label: formatActionLabel(descriptor.action),
    kind,
  };

  actionLink.surfaceLabel = surface.label;

  if (href) {
    actionLink.href = href;
  }
  if (link) {
    actionLink.link = link;
  }
  if (note) {
    actionLink.note = note;
  }
  return actionLink;
}

function dedupeActionLinks(actions: ActionLink[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.descriptor.action}:${action.kind}:${resolveActionHref(action) ?? action.label}:${action.surfaceLabel ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function flattenActionLinks(
  ...sources: Array<ActionSource | null | undefined>
) {
  return dedupeActionLinks(
    sources.flatMap((source) => {
      if (!source || source.descriptors.length === 0) return [];
      return source.descriptors.map((descriptor) =>
        buildActionLink(descriptor, source.surface),
      );
    }),
  );
}

function resolveActionHref(action: ActionLink) {
  if (action.href) return action.href;
  if (!action.link) return null;

  const base = APP_BASE_URLS[action.link.targetApp];
  return action.link.targetApp === "tenant-console"
    ? action.link.route
    : `${base}${action.link.route}`;
}

function isTenantConsoleLocalRoute(href: string) {
  return href.startsWith("/") && !href.startsWith("//");
}

function sanitizeLocalHref(href: string | undefined) {
  if (!href || href.startsWith("#")) return href;
  if (!isTenantConsoleLocalRoute(href)) return href;
  return LOCAL_TENANT_ROUTES.has(href) ? href : undefined;
}

function getActionVariant(descriptor: ResourceActionDescriptor) {
  if (descriptor.riskLevel === "high") {
    return {
      background: th.danger,
      borderColor: th.danger,
      color: "#fff",
    };
  }

  if (descriptor.riskLevel === "medium") {
    return {
      background: th.accent,
      borderColor: th.accent,
      color: "#fff",
    };
  }

  return {
    background: th.surface,
    borderColor: th.border,
    color: th.text,
  };
}

function renderActionLink(action: ActionLink, key: string, locale: Locale) {
  const href = resolveActionHref(action);
  const variant = getActionVariant(action.descriptor);
  const tooltip = formatActionTooltip(action, locale);
  const content = (
    <>
      <span>{action.label}</span>
      {action.surfaceLabel ? (
        <span style={{ fontFamily: th.monoFamily, fontSize: 10, opacity: 0.8 }}>
          {action.surfaceLabel}
        </span>
      ) : null}
      {action.link?.openMode === "new_tab" ? (
        <span style={{ fontFamily: th.monoFamily, fontSize: 10 }}>↗</span>
      ) : null}
      {action.descriptor.requiresReason ? (
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: 999,
            background: "currentColor",
            opacity: 0.7,
          }}
        />
      ) : null}
    </>
  );

  const sharedStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 10px",
    minHeight: 28,
    borderRadius: 7,
    border: `1px solid ${variant.borderColor}`,
    background: variant.background,
    color: variant.color,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1,
    textDecoration: "none",
    opacity: action.descriptor.enabled ? 1 : 0.5,
    cursor: action.descriptor.enabled && href ? "pointer" : "not-allowed",
  };

  if (action.kind === "refresh") {
    return (
      <SettingsRefreshButton
        key={key}
        label={action.label}
        disabled={!action.descriptor.enabled}
        style={{
          ...sharedStyle,
          cursor: action.descriptor.enabled ? "pointer" : "not-allowed",
        }}
        {...(action.surfaceLabel ? { surfaceLabel: action.surfaceLabel } : {})}
        {...(tooltip ? { title: tooltip } : {})}
      />
    );
  }

  if (!action.descriptor.enabled || !href) {
    return (
      <span key={key} title={tooltip ?? undefined} style={sharedStyle}>
        {content}
      </span>
    );
  }

  return (
    <a
      key={key}
      href={href}
      target={action.link?.openMode === "new_tab" ? "_blank" : undefined}
      rel={
        action.link?.openMode === "new_tab" ? "noreferrer noopener" : undefined
      }
      title={tooltip ?? undefined}
      style={sharedStyle}
    >
      {content}
    </a>
  );
}

function getFreshnessTone(refresh: UiRefreshMetadata): CanvasTone {
  if (refresh.dataFreshness === "fresh") return "success";
  if (refresh.dataFreshness === "stale") return "warn";
  if (refresh.dataFreshness === "degraded") return "warn";
  return "neutral";
}

function formatRefreshChipValue(refresh: UiRefreshMetadata) {
  return `${refresh.dataFreshness} · ${refresh.source}`;
}

function formatActionTooltip(action: ActionLink, locale: Locale) {
  if (!action.descriptor.enabled) {
    return action.descriptor.disabledReasonCode ?? "disabled";
  }
  if (action.note === "refresh-runtime") {
    return t("settings.tooltip.refreshRuntime", locale);
  }
  if (action.note === "module-route-pending") {
    return t("settings.tooltip.moduleRoutePending", locale);
  }
  if (action.note === "route-pending") {
    return t("settings.tooltip.routePending", locale);
  }
  if (action.kind === "unresolved") {
    return t("settings.tooltip.unresolved", locale);
  }
  return action.note ?? null;
}

const TENANT_SETTINGS_EMPTY_REASONS = new Set<EmptyReason>([
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
]);

function isTenantSettingsEmptyReason(
  reason: EmptyReason,
): reason is Exclude<EmptyReason, "driver_not_eligible"> {
  return TENANT_SETTINGS_EMPTY_REASONS.has(reason);
}

function getEmptyReasonTone(reason: EmptyReason): CanvasTone {
  if (reason === "fetch_failed") return "danger";
  if (
    reason === "permission_denied" ||
    reason === "external_unavailable" ||
    reason === "not_provisioned"
  ) {
    return "warn";
  }
  return "neutral";
}

function getEmptyReasonCardStyle(reason: EmptyReason): CSSProperties {
  const shared = {
    padding: "12px 12px 14px",
    borderRadius: 10,
    background: th.surfaceLo,
  } satisfies CSSProperties;

  switch (reason) {
    case "fetch_failed":
      return {
        ...shared,
        border: `1px solid ${th.danger}`,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
      };
    case "permission_denied":
      return {
        ...shared,
        border: `1px solid ${th.warn}`,
        background:
          "linear-gradient(180deg, rgba(245, 158, 11, 0.08), rgba(6, 11, 19, 0.6))",
      };
    case "external_unavailable":
      return {
        ...shared,
        border: `1px dashed ${th.warn}`,
        background:
          "linear-gradient(180deg, rgba(234, 179, 8, 0.08), rgba(6, 11, 19, 0.6))",
      };
    case "not_provisioned":
      return {
        ...shared,
        border: `1px dashed ${th.accent}`,
      };
    case "filtered_empty":
      return {
        ...shared,
        border: `1px solid ${th.border}`,
        background:
          "linear-gradient(180deg, rgba(15, 118, 110, 0.09), rgba(6, 11, 19, 0.62))",
      };
    case "no_data":
    default:
      return {
        ...shared,
        border: `1px solid ${th.border}`,
      };
  }
}

function getEmptyReasonCopy(
  reason: EmptyReason,
  locale: Locale,
): {
  title: string;
  body: string;
} {
  switch (reason) {
    case "no_data":
      return {
        title: t("settings.emptyReason.noData.title", locale),
        body: t("settings.emptyReason.noData.body", locale),
      };
    case "not_provisioned":
      return {
        title: t("settings.emptyReason.notProvisioned.title", locale),
        body: t("settings.emptyReason.notProvisioned.body", locale),
      };
    case "fetch_failed":
      return {
        title: t("settings.emptyReason.fetchFailed.title", locale),
        body: t("settings.emptyReason.fetchFailed.body", locale),
      };
    case "permission_denied":
      return {
        title: t("settings.emptyReason.permissionDenied.title", locale),
        body: t("settings.emptyReason.permissionDenied.body", locale),
      };
    case "external_unavailable":
      return {
        title: t("settings.emptyReason.externalUnavailable.title", locale),
        body: t("settings.emptyReason.externalUnavailable.body", locale),
      };
    case "filtered_empty":
      return {
        title: t("settings.emptyReason.filteredEmpty.title", locale),
        body: t("settings.emptyReason.filteredEmpty.body", locale),
      };
    default:
      return {
        title: t("settings.emptyReason.unsupported.title", locale),
        body: t("settings.emptyReason.unsupported.body", locale),
      };
  }
}

function hasEmptyStateEnvelope(
  surface: EmptyStateSurfaceCandidate,
): surface is EmptyStateSurface {
  return (
    surface.envelope !== null &&
    isTenantSettingsEmptyReason(surface.envelope.reason)
  );
}

function getSurfaceActionDescriptors(surface: {
  availableActions: ResourceActionDescriptor[];
  emptyState: EmptyStateEnvelope | null;
}) {
  const descriptors = [
    ...(surface.emptyState?.nextAction ? [surface.emptyState.nextAction] : []),
    ...surface.availableActions,
  ];
  const seen = new Set<string>();

  return descriptors.filter((descriptor) => {
    const key = [
      descriptor.action,
      descriptor.enabled ? "enabled" : "disabled",
      descriptor.riskLevel,
      descriptor.disabledReasonCode ?? "",
      descriptor.requiresReason ? "reason" : "noreason",
    ].join(":");

    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getRecordMember(
  value: unknown,
  camelKey: string,
  snakeKey: string,
): unknown {
  if (!isObject(value)) return undefined;
  return value[camelKey] ?? value[snakeKey];
}

function getNumberMember(
  value: unknown,
  camelKey: string,
  snakeKey: string,
): number | null {
  const member = getRecordMember(value, camelKey, snakeKey);
  return typeof member === "number" ? member : null;
}

function getStringMember(
  value: unknown,
  camelKey: string,
  snakeKey: string,
): string | null {
  const member = getRecordMember(value, camelKey, snakeKey);
  return typeof member === "string" ? member : null;
}

function getArrayMember<T>(
  value: unknown,
  camelKey: string,
  snakeKey: string,
): T[] {
  const member = getRecordMember(value, camelKey, snakeKey);
  return Array.isArray(member) ? (member as T[]) : [];
}

function getGovernanceApiKeyPolicy(value: unknown) {
  const policy = getRecordMember(value, "apiKeyPolicy", "api_key_policy");
  if (!isObject(policy)) return null;

  return {
    defaultLifetimeDays: getNumberMember(
      policy,
      "defaultLifetimeDays",
      "default_lifetime_days",
    ),
    maxLifetimeDays: getNumberMember(
      policy,
      "maxLifetimeDays",
      "max_lifetime_days",
    ),
  };
}

function getGovernanceWebhookPolicy(value: unknown) {
  const policy = getRecordMember(value, "webhookPolicy", "webhook_policy");
  const retryPolicy = getRecordMember(policy, "retryPolicy", "retry_policy");
  if (!isObject(retryPolicy)) return null;

  return {
    maxAttempts: getNumberMember(retryPolicy, "maxAttempts", "max_attempts"),
  };
}

function renderEmptyStateSurface(surface: EmptyStateSurface, locale: Locale) {
  const copy = getEmptyReasonCopy(surface.envelope.reason, locale);

  return (
    <div
      key={surface.key}
      style={getEmptyReasonCardStyle(surface.envelope.reason)}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
        }}
      >
        <CanvasPill
          theme={th}
          tone={getEmptyReasonTone(surface.envelope.reason)}
        >
          {copy.title}
        </CanvasPill>
        <span style={sitemapRouteStyle}>{surface.title}</span>
        <span style={sitemapRouteStyle}>{surface.route}</span>
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 12,
          color: th.textMuted,
          lineHeight: 1.5,
        }}
      >
        {copy.body}
      </div>
      <div style={{ ...sitemapRouteStyle, marginTop: 8 }}>
        reason={surface.envelope.reason} · messageCode=
        {surface.envelope.messageCode}
      </div>
      {surface.actions.length > 0 ? (
        <div style={{ ...actionRowStyle, marginTop: 10 }}>
          {surface.actions.map((action, index) =>
            renderActionLink(action, `${surface.key}-${index}`, locale),
          )}
        </div>
      ) : null}
    </div>
  );
}

async function loadSettingsData(locale: Locale): Promise<SettingsData> {
  const [
    identity,
    billingProfile,
    preferences,
    sla,
    governance,
    quotaSummary,
    users,
    apiKeys,
    webhooks,
    auditLogs,
  ] = await Promise.allSettled([
    fetchTenantRuntime<unknown>("/api/identity/context"),
    fetchTenantRuntime<unknown>("/api/tenant/billing/profile"),
    fetchTenantRuntime<unknown>("/api/tenant/notifications"),
    fetchTenantRuntime<unknown>("/api/tenant/sla"),
    fetchTenantRuntime<unknown>("/api/tenant/integration-governance"),
    fetchTenantRuntime<unknown>("/api/tenant/quotas"),
    fetchTenantRuntime<unknown>("/api/tenant/users"),
    fetchTenantRuntime<unknown>("/api/tenant/api-keys"),
    fetchTenantRuntime<unknown>("/api/tenant/webhooks"),
    fetchTenantRuntime<unknown>("/api/tenant/audit"),
  ]);

  const moduleLabels = {
    identity: t("settings.tag.identity", locale),
    billing: t("settings.tag.billing", locale),
    notifications: t("settings.tag.notifications", locale),
    sla: t("settings.tag.sla", locale),
    governance: t("settings.tag.governance", locale),
    quota: t("settings.tag.quota", locale),
    users: t("settings.tag.users", locale),
    apiKeys: t("settings.surface.apiKeys", locale),
    webhooks: t("settings.surface.webhooks", locale),
    audit: t("settings.tag.audit", locale),
  };
  const errors: string[] = [];
  const tag = (label: string, reason: unknown) =>
    `${label}: ${reason instanceof Error ? reason.message : t("settings.value.unknownError", locale)}`;
  const missingRuntimeLabels: string[] = [];
  const markRuntimeGap = (
    label: string,
    surface: { legacy: boolean; refresh: UiRefreshMetadata | null },
  ) => {
    if (surface.legacy || surface.refresh === null) {
      missingRuntimeLabels.push(label);
    }
  };

  if (identity.status === "rejected")
    errors.push(tag(moduleLabels.identity, identity.reason));
  if (billingProfile.status === "rejected")
    errors.push(tag(moduleLabels.billing, billingProfile.reason));
  if (preferences.status === "rejected")
    errors.push(tag(moduleLabels.notifications, preferences.reason));
  if (sla.status === "rejected") errors.push(tag(moduleLabels.sla, sla.reason));
  if (governance.status === "rejected")
    errors.push(tag(moduleLabels.governance, governance.reason));
  if (quotaSummary.status === "rejected")
    errors.push(tag(moduleLabels.quota, quotaSummary.reason));
  if (users.status === "rejected")
    errors.push(tag(moduleLabels.users, users.reason));
  if (apiKeys.status === "rejected")
    errors.push(tag(moduleLabels.apiKeys, apiKeys.reason));
  if (webhooks.status === "rejected")
    errors.push(tag(moduleLabels.webhooks, webhooks.reason));
  if (auditLogs.status === "rejected")
    errors.push(tag(moduleLabels.audit, auditLogs.reason));

  const identityValue =
    identity.status === "fulfilled"
      ? parseResourceSurface<IdentityContext>(identity.value.data)
      : parseResourceSurface<IdentityContext>(null);
  const billingValue =
    billingProfile.status === "fulfilled"
      ? parseResourceSurface<TenantBillingProfile>(billingProfile.value.data)
      : parseResourceSurface<TenantBillingProfile>(null);
  const preferenceValue =
    preferences.status === "fulfilled"
      ? parseResourceSurface<TenantNotificationPreferences>(
          preferences.value.data,
        )
      : parseResourceSurface<TenantNotificationPreferences>(null);
  const slaValue =
    sla.status === "fulfilled"
      ? parseResourceSurface<TenantSlaProfile>(sla.value.data)
      : parseResourceSurface<TenantSlaProfile>(null);
  const governanceValue =
    governance.status === "fulfilled"
      ? parseResourceSurface<TenantIntegrationGovernancePackage>(
          governance.value.data,
        )
      : parseResourceSurface<TenantIntegrationGovernancePackage>(null);
  const quotaValue =
    quotaSummary.status === "fulfilled"
      ? parseResourceSurface<TenantQuotaSummary>(quotaSummary.value.data)
      : parseResourceSurface<TenantQuotaSummary>(null);
  const usersValue =
    users.status === "fulfilled"
      ? parseListSurface<TenantUserRoleRecord>(users.value.data)
      : parseListSurface<TenantUserRoleRecord>(null);
  const apiKeysValue =
    apiKeys.status === "fulfilled"
      ? parseListSurface<TenantApiKeyRecord>(apiKeys.value.data)
      : parseListSurface<TenantApiKeyRecord>(null);
  const webhooksValue =
    webhooks.status === "fulfilled"
      ? parseListSurface<TenantWebhookEndpoint>(webhooks.value.data)
      : parseListSurface<TenantWebhookEndpoint>(null);
  const auditLogsValue =
    auditLogs.status === "fulfilled"
      ? parseListSurface<AuditLogRecord>(auditLogs.value.data)
      : parseListSurface<AuditLogRecord>(null);

  markRuntimeGap(moduleLabels.identity, identityValue);
  markRuntimeGap(moduleLabels.billing, billingValue);
  markRuntimeGap(moduleLabels.notifications, preferenceValue);
  markRuntimeGap(moduleLabels.sla, slaValue);
  markRuntimeGap(moduleLabels.governance, governanceValue);
  markRuntimeGap(moduleLabels.quota, quotaValue);
  markRuntimeGap(moduleLabels.users, usersValue);
  markRuntimeGap(moduleLabels.apiKeys, apiKeysValue);
  markRuntimeGap(moduleLabels.webhooks, webhooksValue);
  markRuntimeGap(moduleLabels.audit, auditLogsValue);

  if (missingRuntimeLabels.length > 0) {
    errors.push(
      `legacy payload without UiRefreshMetadata: ${missingRuntimeLabels.join(" · ")}`,
    );
  }

  return {
    identity: identityValue,
    billingProfile: billingValue,
    preferences: preferenceValue,
    sla: slaValue,
    governance: governanceValue,
    quotaSummary: quotaValue,
    users: usersValue,
    apiKeys: apiKeysValue,
    webhooks: webhooksValue,
    auditLogs: auditLogsValue,
    errors,
  };
}

export default async function SettingsPage() {
  const locale = await getServerLocale();
  const data = await loadSettingsData(locale);

  const tenantCode = data.identity.item?.tenantId ?? DEMO_TENANT_ID;
  const notSet = t("settings.value.notSet", locale);
  const displayName = data.billingProfile.item?.invoiceTitle ?? notSet;
  const taxId = data.billingProfile.item?.taxId ?? notSet;
  const billingContact = data.billingProfile.item
    ? `${data.billingProfile.item.contactName ?? t("settings.value.unassigned", locale)} · ${data.billingProfile.item.email}`
    : notSet;
  const billingAddress = data.billingProfile.item?.address ?? notSet;
  const authMode = data.identity.item?.authMode ?? "—";
  const roleSummary =
    data.identity.item?.roles
      .slice(0, 3)
      .map((role) => role.replace(/^tc_/, ""))
      .join(" · ") ?? "—";
  const governance = data.governance.item;
  const apiKeyPolicy = getGovernanceApiKeyPolicy(governance);
  const webhookPolicy = getGovernanceWebhookPolicy(governance);
  const governanceGeneratedAt = getStringMember(
    governance,
    "generatedAt",
    "generated_at",
  );

  const apiKeyLifetime =
    apiKeyPolicy?.defaultLifetimeDays != null &&
    apiKeyPolicy.maxLifetimeDays != null
      ? t("settings.policy.apiKeyLifetime", locale, {
          days: apiKeyPolicy.defaultLifetimeDays,
          max: apiKeyPolicy.maxLifetimeDays,
        })
      : notSet;
  const webhookRetry =
    webhookPolicy?.maxAttempts != null
      ? t("settings.policy.webhookRetry", locale, {
          count: webhookPolicy.maxAttempts,
        })
      : notSet;
  const subscriptions = normalizeSubscriptions(
    data.preferences.item?.subscriptions,
  )
    .slice()
    .sort(compareSubscriptions);
  const baselineSubscriptions = normalizeSubscriptions(
    getArrayMember<unknown>(
      governance,
      "baselineNotificationSubscriptions",
      "baseline_notification_subscriptions",
    ),
  )
    .slice()
    .sort(compareSubscriptions);
  const checklist = getArrayMember<string>(
    governance,
    "onboardingChecklist",
    "onboarding_checklist",
  );
  const baselineEvents = getArrayMember<string>(
    governance,
    "baselineWebhookEvents",
    "baseline_webhook_events",
  );
  const notificationRows: SettingsNotificationRow[] = (
    subscriptions.length > 0 ? subscriptions : baselineSubscriptions
  ).map((subscription) => ({
    ...subscription,
    updatedAt:
      subscriptions.length > 0
        ? (data.preferences.item?.updatedAt ?? null)
        : governanceGeneratedAt,
  }));
  const notificationFootnote =
    subscriptions.length > 0
      ? t("settings.notifications.lastUpdated", locale, {
          time: formatUpdated(data.preferences.item?.updatedAt),
        })
      : baselineSubscriptions.length > 0
        ? t("settings.notifications.baselineShown", locale, {
            time: formatUpdated(governanceGeneratedAt),
          })
        : t("settings.notifications.noEvents", locale);
  const quotaSummary = data.quotaSummary.item;
  const currentStageValue = TENANT_CONSOLE_ENV;
  const consentValue = getConsentValue(data.preferences.item, locale);
  const settingsModuleRoutes = [
    "/settings",
    "/users",
    "/audit",
    "/api-keys",
    "/webhooks",
  ];
  const deferredModuleRoutes = [
    "/billing",
    "/notifications",
    "/sla",
    "/integration-governance",
    "/feature-flags",
  ];
  const localModuleCount = settingsModuleRoutes.length;
  const moduleCatalogCount =
    settingsModuleRoutes.length + deferredModuleRoutes.length;
  const capabilityChips = [
    data.billingProfile.item
      ? {
          label: "billing_profile",
          tone: "accent" as const,
        }
      : null,
    subscriptions.length > 0 || baselineSubscriptions.length > 0
      ? {
          label: "notification_baseline",
          tone: "info" as const,
        }
      : null,
    data.sla.item
      ? {
          label: "sla_thresholds",
          tone: "accent" as const,
        }
      : null,
    apiKeyPolicy
      ? {
          label: "api_key_policy",
          tone: "info" as const,
        }
      : null,
    webhookPolicy
      ? {
          label: "webhook_governance",
          tone: "info" as const,
        }
      : null,
  ].filter(
    (chip): chip is { label: string; tone: "accent" | "info" } => chip !== null,
  );

  const generalActions = flattenActionLinks(
    {
      surface: {
        label: t("settings.surface.billingData", locale),
        note: "module-route-pending",
      },
      descriptors: getSurfaceActionDescriptors(data.billingProfile),
    },
    {
      surface: {
        label: t("settings.tag.audit", locale),
        href: "/audit",
        note: "same-tab",
      },
      descriptors: getSurfaceActionDescriptors(data.auditLogs),
    },
  );
  const notificationActions = flattenActionLinks(
    {
      surface: {
        label: t("settings.surface.notificationPrefs", locale),
        note: "module-route-pending",
      },
      descriptors: getSurfaceActionDescriptors(data.preferences),
    },
    {
      surface: {
        label: t("settings.surface.sla", locale),
        note: "module-route-pending",
      },
      descriptors: getSurfaceActionDescriptors(data.sla),
    },
  );
  const integrationActions = flattenActionLinks(
    {
      surface: {
        label: t("settings.surface.apiKeys", locale),
        href: "/api-keys",
      },
      descriptors: getSurfaceActionDescriptors(data.apiKeys),
    },
    {
      surface: {
        label: t("settings.surface.webhooks", locale),
        href: "/webhooks",
      },
      descriptors: getSurfaceActionDescriptors(data.webhooks),
    },
  );
  const peopleActions = flattenActionLinks({
    surface: {
      label: t("settings.surface.people", locale),
      href: "/users",
    },
    descriptors: getSurfaceActionDescriptors(data.users),
  });
  const headerActions = flattenActionLinks(
    {
      surface: {
        label: t("settings.surface.billingData", locale),
        note: "module-route-pending",
      },
      descriptors: getSurfaceActionDescriptors(data.billingProfile),
    },
    {
      surface: {
        label: t("settings.surface.notificationPrefs", locale),
        note: "module-route-pending",
      },
      descriptors: getSurfaceActionDescriptors(data.preferences),
    },
    {
      surface: {
        label: t("settings.surface.sla", locale),
        note: "module-route-pending",
      },
      descriptors: getSurfaceActionDescriptors(data.sla),
    },
    {
      surface: {
        label: t("settings.surface.people", locale),
        href: "/users",
      },
      descriptors: getSurfaceActionDescriptors(data.users),
    },
    {
      surface: {
        label: t("settings.surface.apiKeys", locale),
        href: "/api-keys",
      },
      descriptors: getSurfaceActionDescriptors(data.apiKeys),
    },
    {
      surface: {
        label: t("settings.surface.webhooks", locale),
        href: "/webhooks",
      },
      descriptors: getSurfaceActionDescriptors(data.webhooks),
    },
    {
      surface: {
        label: t("settings.tag.audit", locale),
        href: "/audit",
        note: "same-tab",
      },
      descriptors: getSurfaceActionDescriptors(data.auditLogs),
    },
  );
  const runtimeSurfaces = [
    {
      label: "identity",
      refresh: data.identity.refresh,
      legacy: data.identity.legacy,
    },
    {
      label: "billing",
      refresh: data.billingProfile.refresh,
      legacy: data.billingProfile.legacy,
    },
    {
      label: "notifications",
      refresh: data.preferences.refresh,
      legacy: data.preferences.legacy,
    },
    { label: "sla", refresh: data.sla.refresh, legacy: data.sla.legacy },
    {
      label: "governance",
      refresh: data.governance.refresh,
      legacy: data.governance.legacy,
    },
    {
      label: "quota",
      refresh: data.quotaSummary.refresh,
      legacy: data.quotaSummary.legacy,
    },
    { label: "users", refresh: data.users.refresh, legacy: data.users.legacy },
    {
      label: "api_keys",
      refresh: data.apiKeys.refresh,
      legacy: data.apiKeys.legacy,
    },
    {
      label: "webhooks",
      refresh: data.webhooks.refresh,
      legacy: data.webhooks.legacy,
    },
    {
      label: "audit",
      refresh: data.auditLogs.refresh,
      legacy: data.auditLogs.legacy,
    },
  ];
  const degradedModules = runtimeSurfaces.filter(
    (surface) =>
      surface.refresh !== null && surface.refresh.dataFreshness !== "fresh",
  );
  const legacyModules = runtimeSurfaces.filter(
    (surface) => surface.legacy || surface.refresh === null,
  );
  const runtimeChips: RuntimeChip[] = [
    {
      label: t("settings.runtime.refreshTier", locale),
      value: SETTINGS_PAGE_TIER.label,
      mono: true,
    },
    ...runtimeSurfaces.map((surface) =>
      surface.refresh
        ? ({
            label: surface.label,
            value: formatRefreshChipValue(surface.refresh),
            tone: getFreshnessTone(surface.refresh),
          } satisfies RuntimeChip)
        : ({
            label: surface.label,
            value: "legacy",
            mono: true,
          } satisfies RuntimeChip),
    ),
  ];
  const hasRefreshAction = headerActions.some(
    (action) => action.descriptor.action === "refresh_snapshot",
  );

  const sitemapEntries: SettingsSitemapEntry[] = [
    {
      title: t("settings.sitemap.general.title", locale),
      route: "/settings · /billing (deferred)",
      detail: t("settings.sitemap.general.detail", locale),
      actions: generalActions,
    },
    {
      title: t("settings.sitemap.notifications.title", locale),
      route: "/notifications · /sla",
      detail: t("settings.sitemap.notifications.detail", locale),
      actions: notificationActions,
    },
    {
      title: t("settings.sitemap.integration.title", locale),
      route:
        "/integration-governance (deferred) · /api-keys · /webhooks · platform-admin /audit",
      detail: t("settings.sitemap.integration.detail", locale),
      actions: integrationActions,
    },
    {
      title: t("settings.sitemap.people.title", locale),
      route: "/users · /audit · platform-admin /audit",
      detail: t("settings.sitemap.people.detail", locale),
      actions: peopleActions,
    },
    {
      title: t("settings.sitemap.featureVisibility.title", locale),
      route: "/feature-flags (platform trace)",
      detail: t("settings.sitemap.featureVisibility.detail", locale),
      actions: [],
    },
  ];

  const deepLinks: Array<{
    title: string;
    detail: string;
    link: CrossAppResourceLink;
  }> = [
    {
      title: t("settings.deepLink.platformAudit.title", locale),
      detail: t("settings.deepLink.platformAudit.detail", locale),
      link: {
        targetApp: "platform-admin",
        route: `/audit?tenantId=${encodeURIComponent(tenantCode)}`,
        resourceType: "tenant",
        resourceId: tenantCode,
        openMode: "new_tab",
        label: t("settings.deepLink.platformAudit.label", locale),
      },
    },
    {
      title: t("settings.deepLink.opsComplaints.title", locale),
      detail: t("settings.deepLink.opsComplaints.detail", locale),
      link: {
        targetApp: "ops-console",
        route: "/complaints",
        resourceType: "complaint_case",
        resourceId: tenantCode,
        openMode: "new_tab",
        label: t("settings.deepLink.opsComplaints.label", locale),
      },
    },
    {
      title: t("settings.deepLink.rolloutTrace.title", locale),
      detail: t("settings.deepLink.rolloutTrace.detail", locale),
      link: {
        targetApp: "platform-admin",
        route: "/feature-flags",
        resourceType: "tenant",
        resourceId: tenantCode,
        openMode: "new_tab",
        label: t("settings.deepLink.rolloutTrace.label", locale),
      },
    },
  ];

  const emptyStateSurfaceCandidates: EmptyStateSurfaceCandidate[] = [
    {
      key: "notifications",
      title: t("settings.tag.notifications", locale),
      route: "/notifications",
      envelope: data.preferences.emptyState,
      actions: flattenActionLinks({
        surface: {
          label: t("settings.surface.notificationPrefs", locale),
          note: "module-route-pending",
        },
        descriptors: getSurfaceActionDescriptors(data.preferences),
      }),
    },
    {
      key: "users",
      title: t("settings.surface.people", locale),
      route: "/users",
      envelope: data.users.emptyState,
      actions: flattenActionLinks({
        surface: {
          label: t("settings.surface.people", locale),
          href: "/users",
        },
        descriptors: getSurfaceActionDescriptors(data.users),
      }),
    },
    {
      key: "api-keys",
      title: t("settings.surface.apiKeys", locale),
      route: "/api-keys",
      envelope: data.apiKeys.emptyState,
      actions: flattenActionLinks({
        surface: {
          label: t("settings.surface.apiKeys", locale),
          href: "/api-keys",
        },
        descriptors: getSurfaceActionDescriptors(data.apiKeys),
      }),
    },
    {
      key: "webhooks",
      title: t("settings.surface.webhooks", locale),
      route: "/webhooks",
      envelope: data.webhooks.emptyState,
      actions: flattenActionLinks({
        surface: {
          label: t("settings.surface.webhooks", locale),
          href: "/webhooks",
        },
        descriptors: getSurfaceActionDescriptors(data.webhooks),
      }),
    },
    {
      key: "audit",
      title: t("settings.tag.audit", locale),
      route: "/audit",
      envelope: data.auditLogs.emptyState,
      actions: flattenActionLinks({
        surface: {
          label: t("settings.tag.audit", locale),
          href: "/audit",
          note: "same-tab",
        },
        descriptors: getSurfaceActionDescriptors(data.auditLogs),
      }),
    },
  ];
  const notificationEmptyStateSurface =
    emptyStateSurfaceCandidates[0] &&
    hasEmptyStateEnvelope(emptyStateSurfaceCandidates[0])
      ? emptyStateSurfaceCandidates[0]
      : null;
  const emptyStateSurfaces = emptyStateSurfaceCandidates.filter(
    hasEmptyStateEnvelope,
  );

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title={t("settings.header.title", locale)}
        subtitle={t("settings.header.subtitle", locale)}
        tabs={[
          t("settings.tab.general", locale),
          t("settings.tab.notifications", locale),
          t("settings.tab.privacy", locale),
          t("settings.tab.integration", locale),
        ]}
        activeTab={t("settings.tab.general", locale)}
        actions={
          <div style={actionRowStyle}>
            {headerActions.map((action, index) =>
              renderActionLink(action, `header-${index}`, locale),
            )}
          </div>
        }
      />

      <div style={pageBodyStyle}>
        {degradedModules.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title={t("settings.banner.degraded.title", locale)}
            body={degradedModules
              .map((surface) => {
                if (!surface.refresh) return surface.label;
                return `${surface.label}=${surface.refresh.dataFreshness} @ ${formatUpdated(surface.refresh.generatedAt)}`;
              })
              .join(" · ")}
          />
        ) : null}

        {headerActions.length === 0 ? (
          <CanvasBanner
            theme={th}
            tone="info"
            icon="warn"
            title={t("settings.banner.noActions.title", locale)}
            body={t("settings.banner.noActions.body", locale)}
          />
        ) : null}

        {legacyModules.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title={t("settings.banner.legacy.title", locale)}
            body={t("settings.banner.legacy.body", locale, {
              modules: legacyModules
                .map((surface) => surface.label)
                .join(" · "),
            })}
          />
        ) : null}

        {data.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title={t("settings.banner.errors.title", locale)}
            body={data.errors.join(" · ")}
          />
        ) : null}

        <div style={runtimeStripStyle}>
          {!hasRefreshAction ? (
            <SettingsRefreshButton
              label={t("settings.refresh.label", locale)}
              title={t("settings.tooltip.refreshRuntime", locale)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                minHeight: 32,
                padding: "6px 10px",
                borderRadius: 999,
                border: `1px solid ${th.accent}`,
                background: th.surface,
                color: th.text,
                fontSize: 11.5,
                fontWeight: 600,
                lineHeight: 1,
                cursor: "pointer",
              }}
            />
          ) : null}
          {runtimeChips.map((chip) => (
            <div key={chip.label} style={runtimeChipStyle}>
              <span style={runtimeLabelStyle}>{chip.label}</span>
              {"tone" in chip ? (
                <CanvasPill theme={th} tone={chip.tone} dot>
                  {chip.value}
                </CanvasPill>
              ) : (
                <span
                  style={
                    chip.mono
                      ? { fontFamily: th.monoFamily, color: th.text }
                      : { color: th.text }
                  }
                >
                  {chip.value}
                </span>
              )}
            </div>
          ))}
        </div>

        <div style={topCanvasGridStyle}>
          <div id="general-overview">
            <CanvasCard
              theme={th}
              title={t("settings.tab.general", locale)}
              style={generalCardStyle}
            >
              <div style={generalGridStyle}>
                <CanvasField
                  theme={th}
                  label={t("settings.field.tenantCode", locale)}
                >
                  <CanvasInput theme={th} value={tenantCode} mono />
                </CanvasField>
                <CanvasField
                  theme={th}
                  label={t("settings.field.displayName", locale)}
                >
                  <CanvasInput theme={th} value={displayName} />
                </CanvasField>
                <CanvasField
                  theme={th}
                  label={t("settings.field.taxId", locale)}
                >
                  <CanvasInput theme={th} value={taxId} mono />
                </CanvasField>
                <CanvasField
                  theme={th}
                  label={t("settings.field.billingContact", locale)}
                >
                  <CanvasInput theme={th} value={billingContact} />
                </CanvasField>
                <CanvasField
                  theme={th}
                  label={t("settings.field.defaultLocale", locale)}
                >
                  <CanvasSelect theme={th} value="zh-Hant" />
                </CanvasField>
                <CanvasField
                  theme={th}
                  label={t("settings.field.timezone", locale)}
                >
                  <CanvasSelect theme={th} value="Asia/Taipei" />
                </CanvasField>
              </div>
            </CanvasCard>
          </div>

          <CanvasCard
            theme={th}
            title={t("settings.status.cardTitle", locale)}
            style={statusCardStyle}
          >
            <CanvasDL
              theme={th}
              cols={1}
              items={[
                { k: "STAGE", v: currentStageValue, mono: true },
                {
                  k: t("settings.status.enabledModules", locale),
                  v: `${localModuleCount} / ${moduleCatalogCount}`,
                  mono: true,
                },
                {
                  k: t("settings.status.quota", locale),
                  v: formatQuotaLimit(quotaSummary, locale),
                  mono: true,
                },
                {
                  k: t("settings.status.webhookSignature", locale),
                  v: "sha256-hmac",
                  mono: true,
                },
                {
                  k: t("settings.status.privacy", locale),
                  v: t("settings.status.privacyValue", locale),
                },
                {
                  k: t("settings.status.consentVersion", locale),
                  v: consentValue,
                  mono: true,
                },
              ]}
            />
          </CanvasCard>
        </div>

        <div style={summaryGridStyle}>
          <CanvasCard
            theme={th}
            title={t("settings.sitemapCard.title", locale)}
            subtitle={t("settings.sitemapCard.subtitle", locale)}
          >
            <div style={sitemapListStyle}>
              {sitemapEntries.map((entry) => (
                <div key={entry.title} style={sitemapItemStyle}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: th.text,
                        }}
                      >
                        {entry.title}
                      </div>
                      <div style={sitemapRouteStyle}>{entry.route}</div>
                    </div>
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      color: th.textMuted,
                      lineHeight: 1.5,
                    }}
                  >
                    {entry.detail}
                  </div>
                  <div style={{ ...actionRowStyle, marginTop: 10 }}>
                    {entry.actions.map((action, index) =>
                      renderActionLink(
                        action,
                        `${entry.title}-${index}`,
                        locale,
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title={t("settings.actions.cardTitle", locale)}
            subtitle={t("settings.actions.cardSubtitle", locale)}
          >
            <div style={summaryStackStyle}>
              <div style={actionPanelStyle}>
                <div style={sectionLabelStyle}>availableActions</div>
                {headerActions.length > 0 ? (
                  <div style={actionRowStyle}>
                    {headerActions.map((action, index) =>
                      renderActionLink(action, `page-action-${index}`, locale),
                    )}
                  </div>
                ) : (
                  <div style={emptyStateStyle}>
                    {t("settings.banner.noActions.title", locale)}
                  </div>
                )}
              </div>

              <CanvasDL
                theme={th}
                cols={2}
                items={[
                  {
                    k: "realm",
                    v: data.identity.item?.realm ?? "tenant",
                    mono: true,
                  },
                  {
                    k: t("settings.dl.authMode", locale),
                    v: authMode,
                    mono: true,
                  },
                  {
                    k: t("settings.dl.roleSummary", locale),
                    v: roleSummary,
                    mono: true,
                  },
                  {
                    k: t("settings.dl.billingEmail", locale),
                    v: data.billingProfile.item?.email ?? "—",
                    mono: true,
                  },
                  {
                    k: t("settings.dl.billingAddress", locale),
                    v: billingAddress,
                  },
                  {
                    k: t("settings.dl.billingSnapshot", locale),
                    v: formatUpdated(data.billingProfile.refresh?.generatedAt),
                    mono: true,
                  },
                ]}
              />
            </div>
          </CanvasCard>
        </div>

        <div style={settingsLaneStyle}>
          <div id="notification-subscriptions">
            <CanvasCard
              theme={th}
              title={t("settings.tag.notifications", locale)}
              subtitle={t("settings.notifCard.subtitle", locale)}
              padding={0}
            >
              {notificationRows.length > 0 ? (
                <SettingsNotificationTable rows={notificationRows} />
              ) : notificationEmptyStateSurface ? (
                <div style={{ padding: "14px" }}>
                  {renderEmptyStateSurface(
                    notificationEmptyStateSurface,
                    locale,
                  )}
                </div>
              ) : (
                <div style={emptyStateStyle}>
                  {t("settings.notifCard.empty", locale)}
                </div>
              )}
              <div style={{ ...mutedFootnoteStyle, padding: "10px 14px 14px" }}>
                {notificationFootnote}
              </div>
            </CanvasCard>
          </div>

          <div style={splitGridStyle}>
            <div id="sla-governance-posture">
              <CanvasCard
                theme={th}
                title={t("settings.slaCard.title", locale)}
                subtitle={t("settings.slaCard.subtitle", locale)}
              >
                <div style={kpiGridStyle}>
                  <CanvasKPI
                    theme={th}
                    label={t("settings.kpi.wait", locale)}
                    value={
                      data.sla.item ? `${data.sla.item.waitThresholdMin}m` : "—"
                    }
                    sub={t("settings.kpi.waitSub", locale)}
                  />
                  <CanvasKPI
                    theme={th}
                    label={t("settings.kpi.arrival", locale)}
                    value={
                      data.sla.item
                        ? `${data.sla.item.arrivalThresholdMin}m`
                        : "—"
                    }
                    sub={t("settings.kpi.arrivalSub", locale)}
                  />
                  <CanvasKPI
                    theme={th}
                    label={t("settings.kpi.completion", locale)}
                    value={
                      data.sla.item
                        ? `${data.sla.item.completionThresholdMin}m`
                        : "—"
                    }
                    sub={t("settings.kpi.completionSub", locale)}
                  />
                  <CanvasKPI
                    theme={th}
                    label={t("settings.kpi.remainingQuota", locale)}
                    value={formatRemainingPercent(quotaSummary)}
                    sub={formatQuotaRemaining(quotaSummary, locale)}
                  />
                </div>

                <CanvasDL
                  theme={th}
                  cols={2}
                  items={[
                    {
                      k: t("settings.sla.apiKeyLifetimeLabel", locale),
                      v: apiKeyLifetime,
                      mono: true,
                    },
                    {
                      k: t("settings.sla.webhookRetryLabel", locale),
                      v: webhookRetry,
                      mono: true,
                    },
                    {
                      k: t("settings.sla.webhookBaselineLabel", locale),
                      v: t("settings.sla.webhookBaselineValue", locale, {
                        count: baselineEvents.length,
                      }),
                      mono: true,
                    },
                    {
                      k: t("settings.sla.enforcementLabel", locale),
                      v: quotaSummary?.limit.enforcementMode ?? "—",
                      mono: true,
                    },
                    {
                      k: t("settings.sla.confirmedTripsLabel", locale),
                      v: quotaSummary
                        ? formatCount(quotaSummary.usage.confirmedBookingCount)
                        : "—",
                      mono: true,
                    },
                    {
                      k: t("settings.sla.updatedLabel", locale),
                      v: formatUpdated(
                        quotaSummary?.refreshedAt ?? data.sla.item?.updatedAt,
                      ),
                      mono: true,
                    },
                  ]}
                />
              </CanvasCard>
            </div>

            <CanvasCard
              theme={th}
              title={t("settings.deepLinkCard.title", locale)}
              subtitle={t("settings.deepLinkCard.subtitle", locale)}
            >
              <div style={linkStackStyle}>
                {deepLinks.map((item) => {
                  const href = resolveActionHref({
                    descriptor: {
                      action: "open_link",
                      enabled: true,
                      riskLevel: "low",
                    },
                    kind: "link",
                    link: item.link,
                    label: item.link.label,
                  });

                  return (
                    <div key={item.title} style={linkRowStyle}>
                      <div>
                        <div
                          style={{
                            fontSize: 12.5,
                            fontWeight: 600,
                            color: th.text,
                          }}
                        >
                          {item.title}
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 12,
                            color: th.textMuted,
                            lineHeight: 1.5,
                          }}
                        >
                          {item.detail}
                        </div>
                        <div style={{ ...sitemapRouteStyle, marginTop: 6 }}>
                          {item.link.route}
                        </div>
                      </div>
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer noopener"
                          style={{
                            color: th.accent,
                            textDecoration: "none",
                            fontSize: 12,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.link.label} ↗
                        </a>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </CanvasCard>
          </div>

          <div style={splitGridStyle}>
            <CanvasCard
              theme={th}
              title={t("settings.capabilityCard.title", locale)}
              subtitle={t("settings.capabilityCard.subtitle", locale)}
            >
              <div style={capabilityStackStyle}>
                <div>
                  <div style={sectionLabelStyle}>
                    {t("settings.capability.surfacesLabel", locale)}
                  </div>
                  <div style={chipRowStyle}>
                    {settingsModuleRoutes.map((route) => (
                      <CanvasPill key={route} theme={th} tone="accent">
                        {route}
                      </CanvasPill>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={sectionLabelStyle}>
                    {t("settings.capability.tenantStateLabel", locale)}
                  </div>
                  {capabilityChips.length > 0 ? (
                    <div style={chipRowStyle}>
                      {capabilityChips.map((chip) => (
                        <CanvasPill
                          key={chip.label}
                          theme={th}
                          tone={chip.tone}
                        >
                          {chip.label}
                        </CanvasPill>
                      ))}
                    </div>
                  ) : (
                    <div style={emptyStateStyle}>
                      {t("settings.capability.noPosture", locale)}
                    </div>
                  )}
                </div>

                <div>
                  <div style={sectionLabelStyle}>
                    {t("settings.capability.webhookBaselineLabel", locale)}
                  </div>
                  {baselineEvents.length > 0 ? (
                    <div style={chipRowStyle}>
                      {baselineEvents.slice(0, 8).map((eventType) => (
                        <CanvasPill key={eventType} theme={th} tone="info">
                          {eventType}
                        </CanvasPill>
                      ))}
                    </div>
                  ) : (
                    <div style={emptyStateStyle}>
                      {t("settings.capability.noBaseline", locale)}
                    </div>
                  )}
                </div>

                {checklist.length > 0 ? (
                  <>
                    <CanvasBanner
                      theme={th}
                      tone="info"
                      icon="warn"
                      title={t("settings.checklist.bannerTitle", locale)}
                      body={t("settings.checklist.bannerBody", locale, {
                        count: checklist.length,
                      })}
                    />
                    <ul style={checklistStyle}>
                      {checklist.map((item, index) => (
                        <li key={`${item}-${index}`} style={checklistItemStyle}>
                          <span style={checklistBulletStyle}>
                            {(index + 1).toString().padStart(2, "0")}
                          </span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <div style={emptyStateStyle}>
                    {t("settings.checklist.empty", locale)}
                  </div>
                )}
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title={t("settings.emptyStateCard.title", locale)}
              subtitle={t("settings.emptyStateCard.subtitle", locale)}
            >
              {emptyStateSurfaces.length > 0 ? (
                <div style={emptyReasonGridStyle}>
                  {emptyStateSurfaces.map((surface) =>
                    renderEmptyStateSurface(surface, locale),
                  )}
                </div>
              ) : (
                <div style={emptyStateStyle}>
                  {t("settings.emptyStateCard.none", locale)}
                </div>
              )}
            </CanvasCard>
          </div>
        </div>
      </div>
    </div>
  );
}
