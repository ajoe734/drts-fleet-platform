import type { CSSProperties } from "react";
import type {
  AuditLogRecord,
  CrossAppResourceLink,
  EmptyStateEnvelope,
  EmptyReason,
  IdentityContext,
  RefreshTier,
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
import {
  SettingsNotificationTable,
  type SettingsNotificationRow,
} from "./settings-notification-table";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const SETTINGS_REFRESH_TIER: RefreshTier = "slow";
const SETTINGS_REFRESH = getRefreshTierDefinition(SETTINGS_REFRESH_TIER);
const APP_BASE_URLS: Record<CrossAppResourceLink["targetApp"], string> = {
  "ops-console": "http://localhost:3003",
  "platform-admin": "http://localhost:3002",
  "tenant-console": "http://localhost:3004",
};

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

type RuntimeRecord<T> = T & {
  availableActions?: ResourceActionDescriptor[];
  emptyState?: EmptyStateEnvelope;
};

type RuntimeListEnvelope<T> = {
  items: T[];
  availableActions?: ResourceActionDescriptor[];
  emptyState?: EmptyStateEnvelope;
};

type SettingsData = {
  identity: RuntimeRecord<IdentityContext> | null;
  billingProfile: RuntimeRecord<TenantBillingProfile> | null;
  preferences: RuntimeRecord<TenantNotificationPreferences> | null;
  sla: RuntimeRecord<TenantSlaProfile> | null;
  governance: RuntimeRecord<TenantIntegrationGovernancePackage> | null;
  quotaSummary: RuntimeRecord<TenantQuotaSummary> | null;
  users: RuntimeListEnvelope<TenantUserRoleRecord> | null;
  apiKeys: RuntimeListEnvelope<TenantApiKeyRecord> | null;
  webhooks: RuntimeListEnvelope<TenantWebhookEndpoint> | null;
  auditLogs: RuntimeListEnvelope<AuditLogRecord> | null;
  availableActions: ResourceActionDescriptor[];
  unsupportedActions: ResourceActionDescriptor[];
  errors: string[];
  refresh: UiRefreshMetadata;
};

type ActionLink = {
  descriptor: ResourceActionDescriptor;
  label: string;
  href?: string;
  link?: CrossAppResourceLink;
  note?: string;
};

type SettingsSitemapEntry = {
  title: string;
  route: string;
  detail: string;
  actions: ActionLink[];
};

type EmptyReasonCard = {
  reason: EmptyReason;
  title: string;
  body: string;
  nextAction?: ActionLink;
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
  availableActions?: ResourceActionDescriptor[];
};

type RuntimeEnvelope<T> = {
  data: T;
  refresh?: UiRefreshMetadata;
  meta?: {
    timestamp?: string;
  };
};

type FallbackActionConfig = Omit<ResourceActionDescriptor, "action">;

type SettingsModuleKey =
  | "billing"
  | "notifications"
  | "sla"
  | "apiKeys"
  | "webhooks"
  | "users"
  | "audit";

type SearchParamRecord = Record<string, string | string[] | undefined>;

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

function formatQuotaLimit(summary: TenantQuotaSummary | null) {
  if (!summary) return "—";

  if (summary.limit.bookingCountLimit !== null) {
    return `${formatCount(summary.limit.bookingCountLimit)} 趟 / 月`;
  }

  if (summary.limit.amountMinorLimit !== null) {
    return `${summary.limit.currency} ${formatCount(summary.limit.amountMinorLimit / 100)} / 月`;
  }

  return "無上限";
}

function formatQuotaRemaining(summary: TenantQuotaSummary | null) {
  if (!summary) return "—";

  if (summary.usage.bookingCountRemaining !== null) {
    return `${formatCount(summary.usage.bookingCountRemaining)} 趟剩餘`;
  }

  if (summary.usage.amountMinorRemaining !== null) {
    return `${summary.limit.currency} ${formatCount(summary.usage.amountMinorRemaining / 100)} 剩餘`;
  }

  return "無上限";
}

function formatRemainingPercent(summary: TenantQuotaSummary | null) {
  if (summary?.usage.remainingPercent === null || !summary) {
    return "—";
  }

  return `${summary.usage.remainingPercent}%`;
}

function getConsentValue(preferences: TenantNotificationPreferences | null) {
  if (!preferences?.updatedAt) {
    return "尚未設定";
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

function parseTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toFreshness(latestTimestamp: Date | null, errors: string[]) {
  if (latestTimestamp === null) {
    return errors.length > 0 ? "degraded" : "unknown";
  }

  const ageMs = Date.now() - latestTimestamp.getTime();
  if (errors.length > 0) return "degraded";
  return ageMs > SETTINGS_REFRESH.staleAfterMs ? "stale" : "fresh";
}

function buildFallbackRefresh(
  generatedAt: string | null | undefined,
  errors: string[],
): UiRefreshMetadata {
  const resolvedGeneratedAt = generatedAt ?? new Date().toISOString();
  return {
    generatedAt: resolvedGeneratedAt,
    staleAfterMs: SETTINGS_REFRESH.staleAfterMs,
    dataFreshness: toFreshness(parseTimestamp(resolvedGeneratedAt), errors),
    source: "live",
  };
}

function mergeRefreshMetadata(
  refreshes: Array<UiRefreshMetadata | null | undefined>,
  errors: string[],
): UiRefreshMetadata {
  const resolvedRefreshes = refreshes.filter(
    (refresh): refresh is UiRefreshMetadata =>
      refresh !== null && refresh !== undefined,
  );

  if (resolvedRefreshes.length === 0) {
    return buildFallbackRefresh(null, errors);
  }

  const freshest = resolvedRefreshes.reduce((latest, current) => {
    const latestTs = parseTimestamp(latest.generatedAt)?.getTime() ?? 0;
    const currentTs = parseTimestamp(current.generatedAt)?.getTime() ?? 0;
    return currentTs > latestTs ? current : latest;
  });

  const dataFreshness =
    errors.length > 0
      ? "degraded"
      : resolvedRefreshes.some(
            (refresh) => refresh.dataFreshness === "degraded",
          )
        ? "degraded"
        : resolvedRefreshes.some((refresh) => refresh.dataFreshness === "stale")
          ? "stale"
          : resolvedRefreshes.some(
                (refresh) => refresh.dataFreshness === "unknown",
              )
            ? "unknown"
            : "fresh";

  return {
    generatedAt: freshest.generatedAt,
    staleAfterMs: SETTINGS_REFRESH.staleAfterMs,
    dataFreshness,
    source: freshest.source,
  };
}

function buildFallbackAction(
  action: string,
  config: FallbackActionConfig,
): ResourceActionDescriptor {
  return {
    action,
    enabled: config.enabled,
    riskLevel: config.riskLevel,
    ...(config.disabledReasonCode
      ? { disabledReasonCode: config.disabledReasonCode }
      : {}),
    ...(config.requiresReason ? { requiresReason: true } : {}),
  };
}

function hasRole(identity: IdentityContext | null, roleCode: string) {
  return identity?.roles.includes(roleCode) ?? false;
}

function canManageBilling(identity: IdentityContext | null) {
  return (
    hasRole(identity, "tenant_admin") ||
    hasRole(identity, "tenant_finance_admin")
  );
}

function canManageTenantSettings(identity: IdentityContext | null) {
  return hasRole(identity, "tenant_admin");
}

function getFallbackActionConfig(
  identity: IdentityContext | null,
  module: SettingsModuleKey,
): Partial<Record<string, FallbackActionConfig>> {
  const canManageGeneral = canManageTenantSettings(identity);
  const canManageFinance = canManageBilling(identity);
  const manageDisabledReason = "backend_runtime_actions_pending";
  const tenantReadDisabledReason = "tenant_read_only";

  switch (module) {
    case "billing":
      return {
        update_tenant_billing_profile: canManageFinance
          ? {
              enabled: true,
              riskLevel: "medium",
            }
          : {
              enabled: false,
              riskLevel: "medium",
              disabledReasonCode: tenantReadDisabledReason,
            },
      };
    case "notifications":
      return {
        update_notification_subscription: canManageGeneral
          ? {
              enabled: true,
              riskLevel: "medium",
            }
          : {
              enabled: false,
              riskLevel: "medium",
              disabledReasonCode: tenantReadDisabledReason,
            },
        update_notification_preferences: canManageGeneral
          ? {
              enabled: true,
              riskLevel: "medium",
            }
          : {
              enabled: false,
              riskLevel: "medium",
              disabledReasonCode: tenantReadDisabledReason,
            },
      };
    case "sla":
      return {
        update_sla_profile: canManageGeneral
          ? {
              enabled: true,
              riskLevel: "medium",
            }
          : {
              enabled: false,
              riskLevel: "medium",
              disabledReasonCode: tenantReadDisabledReason,
            },
      };
    case "apiKeys":
      return {
        issue_api_key: canManageGeneral
          ? {
              enabled: true,
              riskLevel: "medium",
            }
          : {
              enabled: false,
              riskLevel: "medium",
              disabledReasonCode: tenantReadDisabledReason,
            },
        rotate_api_key: canManageGeneral
          ? {
              enabled: true,
              riskLevel: "high",
              requiresReason: true,
            }
          : {
              enabled: false,
              riskLevel: "high",
              disabledReasonCode: tenantReadDisabledReason,
              requiresReason: true,
            },
        revoke_api_key: canManageGeneral
          ? {
              enabled: true,
              riskLevel: "high",
              requiresReason: true,
            }
          : {
              enabled: false,
              riskLevel: "high",
              disabledReasonCode: tenantReadDisabledReason,
              requiresReason: true,
            },
      };
    case "webhooks":
      return {
        create_webhook_endpoint: canManageGeneral
          ? {
              enabled: true,
              riskLevel: "medium",
            }
          : {
              enabled: false,
              riskLevel: "medium",
              disabledReasonCode: tenantReadDisabledReason,
            },
        update_webhook_endpoint: canManageGeneral
          ? {
              enabled: true,
              riskLevel: "medium",
            }
          : {
              enabled: false,
              riskLevel: "medium",
              disabledReasonCode: tenantReadDisabledReason,
            },
        rotate_webhook_secret: canManageGeneral
          ? {
              enabled: true,
              riskLevel: "high",
              requiresReason: true,
            }
          : {
              enabled: false,
              riskLevel: "high",
              disabledReasonCode: tenantReadDisabledReason,
              requiresReason: true,
            },
        disable_webhook_endpoint: canManageGeneral
          ? {
              enabled: true,
              riskLevel: "high",
              requiresReason: true,
            }
          : {
              enabled: false,
              riskLevel: "high",
              disabledReasonCode: tenantReadDisabledReason,
              requiresReason: true,
            },
        activate_webhook_endpoint: canManageGeneral
          ? {
              enabled: true,
              riskLevel: "medium",
            }
          : {
              enabled: false,
              riskLevel: "medium",
              disabledReasonCode: tenantReadDisabledReason,
            },
        send_test_webhook: canManageGeneral
          ? {
              enabled: true,
              riskLevel: "low",
            }
          : {
              enabled: false,
              riskLevel: "low",
              disabledReasonCode: tenantReadDisabledReason,
            },
      };
    case "users":
      return {
        create_tenant_user: canManageGeneral
          ? {
              enabled: true,
              riskLevel: "medium",
            }
          : {
              enabled: false,
              riskLevel: "medium",
              disabledReasonCode: tenantReadDisabledReason,
            },
        update_tenant_role: canManageGeneral
          ? {
              enabled: true,
              riskLevel: "medium",
            }
          : {
              enabled: false,
              riskLevel: "medium",
              disabledReasonCode: tenantReadDisabledReason,
            },
      };
    case "audit":
      return {
        view_tenant_audit_evidence: canManageGeneral
          ? {
              enabled: true,
              riskLevel: "low",
            }
          : {
              enabled: true,
              riskLevel: "low",
              disabledReasonCode: manageDisabledReason,
            },
      };
  }
}

function withFallbackActions<T extends ActionSource>(
  resource: T | null,
  fallbackActions: ResourceActionDescriptor[],
): T | null {
  if (!resource) return null;
  if (resource.availableActions && resource.availableActions.length > 0) {
    return resource;
  }
  return {
    ...resource,
    availableActions: fallbackActions,
  };
}

function buildEmptyState(
  reason: EmptyReason,
  messageCode: string,
  nextAction?: ResourceActionDescriptor,
): EmptyStateEnvelope {
  return {
    reason,
    messageCode,
    ...(nextAction ? { nextAction } : {}),
  };
}

function withFallbackListRuntime<T>(
  resource: RuntimeListEnvelope<T> | null,
  fallbackActions: ResourceActionDescriptor[],
  emptyState: EmptyStateEnvelope | null,
): RuntimeListEnvelope<T> | null {
  if (!resource) return null;
  const resolvedEmptyState =
    resource.items.length === 0
      ? (resource.emptyState ?? emptyState ?? undefined)
      : resource.emptyState;

  return {
    ...resource,
    availableActions:
      resource.availableActions && resource.availableActions.length > 0
        ? resource.availableActions
        : fallbackActions,
    ...(resolvedEmptyState ? { emptyState: resolvedEmptyState } : {}),
  };
}

function createFallbackActionsForModule(
  identity: IdentityContext | null,
  module: SettingsModuleKey,
) {
  return Object.entries(getFallbackActionConfig(identity, module)).flatMap(
    ([action, config]) => (config ? [buildFallbackAction(action, config)] : []),
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function fetchTenantRuntime<T>(
  path: string,
): Promise<RuntimeEnvelope<T>> {
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

  return (await response.json()) as RuntimeEnvelope<T>;
}

function flattenAvailableActions(
  ...sources: Array<ActionSource | null | undefined>
) {
  return sources.flatMap((source) => source?.availableActions ?? []);
}

type ActionLinkOverride = {
  label?: string;
  href?: string;
  link?: CrossAppResourceLink;
  note?: string;
};

type ActionRegistryEntry = ActionLinkOverride;

const SETTINGS_ACTION_REGISTRY: Record<string, ActionRegistryEntry> = {
  view_tenant_audit_evidence: {
    label: "租戶稽核",
    note: "same-tab",
  },
  update_tenant_billing_profile: {
    label: "計費資料",
    href: "/billing",
    note: "module-owned",
  },
  update_notification_subscription: {
    label: "通知偏好",
    href: "/notifications",
  },
  update_notification_preferences: {
    label: "通知偏好",
    href: "/notifications",
  },
  update_sla_profile: {
    label: "SLA 設定",
    href: "/sla",
  },
  issue_api_key: {
    label: "API 金鑰",
    href: "/api-keys",
    note: "module-owned",
  },
  rotate_api_key: {
    label: "API 金鑰",
    href: "/api-keys",
    note: "module-owned",
  },
  revoke_api_key: {
    label: "API 金鑰",
    href: "/api-keys",
    note: "module-owned",
  },
  create_webhook_endpoint: {
    label: "Webhook",
    href: "/webhooks",
    note: "module-owned",
  },
  update_webhook_endpoint: {
    label: "Webhook",
    href: "/webhooks",
    note: "module-owned",
  },
  rotate_webhook_secret: {
    label: "Webhook",
    href: "/webhooks",
    note: "module-owned",
  },
  disable_webhook_endpoint: {
    label: "Webhook",
    href: "/webhooks",
    note: "module-owned",
  },
  activate_webhook_endpoint: {
    label: "Webhook",
    href: "/webhooks",
    note: "module-owned",
  },
  send_test_webhook: {
    label: "Webhook",
    href: "/webhooks",
    note: "module-owned",
  },
  create_tenant_user: {
    label: "人員與角色",
    href: "/users",
  },
  update_tenant_role: {
    label: "人員與角色",
    href: "/users",
  },
};

function buildActionLink(
  descriptor: ResourceActionDescriptor,
  tenantCode: string,
  overrides?: ActionLinkOverride,
): ActionLink | null {
  const resolved = SETTINGS_ACTION_REGISTRY[descriptor.action];
  const resolvedHref =
    descriptor.action === "view_tenant_audit_evidence"
      ? "/audit"
      : resolved?.href;

  if (!resolved && !overrides) {
    return null;
  }

  const href = overrides?.href ?? resolvedHref;
  const link = overrides?.link ?? resolved?.link;
  const note = overrides?.note ?? resolved?.note;

  const actionLink: ActionLink = {
    descriptor,
    label: overrides?.label ?? resolved?.label ?? descriptor.action,
  };

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

function mapActionLinks(
  actions: ResourceActionDescriptor[] | undefined,
  tenantCode: string,
  overrides: Partial<Record<string, ActionLinkOverride>> = {},
) {
  if (!actions || actions.length === 0) return [];

  return actions.flatMap((descriptor) => {
    const actionLink = buildActionLink(
      descriptor,
      tenantCode,
      overrides[descriptor.action],
    );
    return actionLink ? [actionLink] : [];
  });
}

function dedupeActionLinks(actions: ActionLink[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.descriptor.action}:${resolveActionHref(action) ?? action.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolveActionHref(action: ActionLink) {
  if (action.href) return action.href;
  if (!action.link) return null;

  const base = APP_BASE_URLS[action.link.targetApp];
  return action.link.targetApp === "tenant-console"
    ? action.link.route
    : `${base}${action.link.route}`;
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

function renderActionLink(action: ActionLink, key: string) {
  const href = resolveActionHref(action);
  const variant = getActionVariant(action.descriptor);
  const tooltip = !action.descriptor.enabled
    ? (action.descriptor.disabledReasonCode ?? "disabled")
    : (action.note ?? null);
  const content = (
    <>
      <span>{action.label}</span>
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

async function loadSettingsData(): Promise<SettingsData> {
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
    fetchTenantRuntime<RuntimeRecord<IdentityContext>>("/api/identity/context"),
    fetchTenantRuntime<RuntimeRecord<TenantBillingProfile>>(
      "/api/tenant/billing/profile",
    ),
    fetchTenantRuntime<RuntimeRecord<TenantNotificationPreferences>>(
      "/api/tenant/notifications",
    ),
    fetchTenantRuntime<RuntimeRecord<TenantSlaProfile>>("/api/tenant/sla"),
    fetchTenantRuntime<RuntimeRecord<TenantIntegrationGovernancePackage>>(
      "/api/tenant/integration-governance",
    ),
    fetchTenantRuntime<RuntimeRecord<TenantQuotaSummary>>("/api/tenant/quotas"),
    fetchTenantRuntime<RuntimeListEnvelope<TenantUserRoleRecord>>(
      "/api/tenant/users",
    ),
    fetchTenantRuntime<RuntimeListEnvelope<TenantApiKeyRecord>>(
      "/api/tenant/api-keys",
    ),
    fetchTenantRuntime<RuntimeListEnvelope<TenantWebhookEndpoint>>(
      "/api/tenant/webhooks",
    ),
    fetchTenantRuntime<RuntimeListEnvelope<AuditLogRecord>>(
      "/api/tenant/audit",
    ),
  ]);

  const errors: string[] = [];
  const tag = (label: string, reason: unknown) =>
    `${label}: ${reason instanceof Error ? reason.message : "未知錯誤"}`;

  if (identity.status === "rejected")
    errors.push(tag("租戶身分", identity.reason));
  if (billingProfile.status === "rejected")
    errors.push(tag("計費設定", billingProfile.reason));
  if (preferences.status === "rejected")
    errors.push(tag("通知訂閱", preferences.reason));
  if (sla.status === "rejected") errors.push(tag("SLA 門檻", sla.reason));
  if (governance.status === "rejected")
    errors.push(tag("整合治理", governance.reason));
  if (quotaSummary.status === "rejected")
    errors.push(tag("租戶配額", quotaSummary.reason));
  if (users.status === "rejected") errors.push(tag("租戶人員", users.reason));
  if (apiKeys.status === "rejected")
    errors.push(tag("API 金鑰", apiKeys.reason));
  if (webhooks.status === "rejected")
    errors.push(tag("Webhook", webhooks.reason));
  if (auditLogs.status === "rejected")
    errors.push(tag("租戶稽核", auditLogs.reason));

  const identityValue =
    identity.status === "fulfilled" ? identity.value.data : null;
  const billingValue =
    billingProfile.status === "fulfilled" ? billingProfile.value.data : null;
  const preferenceValue =
    preferences.status === "fulfilled" ? preferences.value.data : null;
  const slaValue = sla.status === "fulfilled" ? sla.value.data : null;
  const governanceValue =
    governance.status === "fulfilled" ? governance.value.data : null;
  const quotaValue =
    quotaSummary.status === "fulfilled" ? quotaSummary.value.data : null;
  const usersValue = users.status === "fulfilled" ? users.value.data : null;
  const apiKeysValue =
    apiKeys.status === "fulfilled" ? apiKeys.value.data : null;
  const webhooksValue =
    webhooks.status === "fulfilled" ? webhooks.value.data : null;
  const auditLogsValue =
    auditLogs.status === "fulfilled" ? auditLogs.value.data : null;
  const fallbackBillingActions = createFallbackActionsForModule(
    identityValue,
    "billing",
  );
  const fallbackNotificationActions = createFallbackActionsForModule(
    identityValue,
    "notifications",
  );
  const fallbackSlaActions = createFallbackActionsForModule(
    identityValue,
    "sla",
  );
  const fallbackApiKeyActions = createFallbackActionsForModule(
    identityValue,
    "apiKeys",
  );
  const fallbackWebhookActions = createFallbackActionsForModule(
    identityValue,
    "webhooks",
  );
  const fallbackUserActions = createFallbackActionsForModule(
    identityValue,
    "users",
  );
  const fallbackAuditActions = createFallbackActionsForModule(
    identityValue,
    "audit",
  );
  const normalizedBillingValue = withFallbackActions(
    billingValue,
    fallbackBillingActions,
  );
  const normalizedPreferenceValue = withFallbackActions(
    preferenceValue,
    fallbackNotificationActions,
  );
  const normalizedSlaValue = withFallbackActions(slaValue, fallbackSlaActions);
  const normalizedUsersValue = withFallbackListRuntime(
    usersValue,
    fallbackUserActions,
    usersValue && usersValue.items.length === 0
      ? buildEmptyState(
          "no_data",
          "tenant_users_empty",
          fallbackUserActions.find(
            (action) => action.action === "create_tenant_user",
          ),
        )
      : null,
  );
  const normalizedApiKeysValue = withFallbackListRuntime(
    apiKeysValue,
    fallbackApiKeyActions,
    apiKeysValue && apiKeysValue.items.length === 0
      ? buildEmptyState(
          "no_data",
          "tenant_api_keys_empty",
          fallbackApiKeyActions.find(
            (action) => action.action === "issue_api_key",
          ),
        )
      : null,
  );
  const normalizedWebhooksValue = withFallbackListRuntime(
    webhooksValue,
    fallbackWebhookActions,
    webhooksValue && webhooksValue.items.length === 0
      ? buildEmptyState(
          "not_provisioned",
          "tenant_webhooks_not_provisioned",
          fallbackWebhookActions.find(
            (action) => action.action === "create_webhook_endpoint",
          ),
        )
      : null,
  );
  const normalizedAuditLogsValue = withFallbackListRuntime(
    auditLogsValue,
    fallbackAuditActions,
    auditLogsValue && auditLogsValue.items.length === 0
      ? buildEmptyState("no_data", "tenant_audit_empty")
      : null,
  );
  const availableActions = flattenAvailableActions(
    identityValue,
    normalizedBillingValue,
    normalizedPreferenceValue,
    normalizedSlaValue,
    governanceValue,
    quotaValue,
    normalizedUsersValue,
    normalizedApiKeysValue,
    normalizedWebhooksValue,
    normalizedAuditLogsValue,
  );
  const supportedActions = new Set(Object.keys(SETTINGS_ACTION_REGISTRY));
  const unsupportedActions = availableActions.filter(
    (descriptor) => !supportedActions.has(descriptor.action),
  );
  const refresh = mergeRefreshMetadata(
    [
      identity.status === "fulfilled"
        ? (identity.value.refresh ??
          buildFallbackRefresh(identity.value.meta?.timestamp, errors))
        : null,
      billingProfile.status === "fulfilled"
        ? (billingProfile.value.refresh ??
          buildFallbackRefresh(billingProfile.value.meta?.timestamp, errors))
        : null,
      preferences.status === "fulfilled"
        ? (preferences.value.refresh ??
          buildFallbackRefresh(preferences.value.meta?.timestamp, errors))
        : null,
      sla.status === "fulfilled"
        ? (sla.value.refresh ??
          buildFallbackRefresh(sla.value.meta?.timestamp, errors))
        : null,
      governance.status === "fulfilled"
        ? (governance.value.refresh ??
          buildFallbackRefresh(governance.value.meta?.timestamp, errors))
        : null,
      quotaSummary.status === "fulfilled"
        ? (quotaSummary.value.refresh ??
          buildFallbackRefresh(quotaSummary.value.meta?.timestamp, errors))
        : null,
      users.status === "fulfilled"
        ? (users.value.refresh ??
          buildFallbackRefresh(users.value.meta?.timestamp, errors))
        : null,
      apiKeys.status === "fulfilled"
        ? (apiKeys.value.refresh ??
          buildFallbackRefresh(apiKeys.value.meta?.timestamp, errors))
        : null,
      webhooks.status === "fulfilled"
        ? (webhooks.value.refresh ??
          buildFallbackRefresh(webhooks.value.meta?.timestamp, errors))
        : null,
      auditLogs.status === "fulfilled"
        ? (auditLogs.value.refresh ??
          buildFallbackRefresh(auditLogs.value.meta?.timestamp, errors))
        : null,
    ],
    errors,
  );

  return {
    identity: identityValue,
    billingProfile: normalizedBillingValue,
    preferences: normalizedPreferenceValue,
    sla: normalizedSlaValue,
    governance: governanceValue,
    quotaSummary: quotaValue,
    users: normalizedUsersValue,
    apiKeys: normalizedApiKeysValue,
    webhooks: normalizedWebhooksValue,
    auditLogs: normalizedAuditLogsValue,
    availableActions,
    unsupportedActions,
    errors,
    refresh,
  };
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParamRecord>;
}) {
  const data = await loadSettingsData();
  const resolvedSearchParams: SearchParamRecord = await (searchParams ??
    Promise.resolve({} as SearchParamRecord));
  const activeEmptyReason = firstParam(resolvedSearchParams.emptyReason);

  const tenantCode = data.identity?.tenantId ?? DEMO_TENANT_ID;
  const displayName = data.billingProfile?.invoiceTitle ?? "未設定";
  const taxId = data.billingProfile?.taxId ?? "未設定";
  const billingContact = data.billingProfile
    ? `${data.billingProfile.contactName ?? "未指派"} · ${data.billingProfile.email}`
    : "未設定";
  const billingAddress = data.billingProfile?.address ?? "未設定";
  const authMode = data.identity?.authMode ?? "—";
  const roleSummary =
    data.identity?.roles
      .slice(0, 3)
      .map((role) => role.replace(/^tc_/, ""))
      .join(" · ") ?? "—";

  const apiKeyLifetime = data.governance
    ? `${data.governance.apiKeyPolicy.defaultLifetimeDays} 天 (最長 ${data.governance.apiKeyPolicy.maxLifetimeDays} 天)`
    : "—";
  const webhookRetry = data.governance
    ? `${data.governance.webhookPolicy.retryPolicy.maxAttempts} 次重送`
    : "—";
  const subscriptions =
    data.preferences?.subscriptions?.slice().sort(compareSubscriptions) ?? [];
  const baselineSubscriptions =
    data.governance?.baselineNotificationSubscriptions
      ?.slice()
      .sort(compareSubscriptions) ?? [];
  const checklist = data.governance?.onboardingChecklist ?? [];
  const baselineEvents = data.governance?.baselineWebhookEvents ?? [];
  const notificationRows: SettingsNotificationRow[] = (
    subscriptions.length > 0 ? subscriptions : baselineSubscriptions
  ).map((subscription) => ({
    ...subscription,
    updatedAt:
      subscriptions.length > 0
        ? (data.preferences?.updatedAt ?? null)
        : (data.governance?.generatedAt ?? null),
  }));
  const notificationFootnote =
    subscriptions.length > 0
      ? `最後更新 ${formatUpdated(data.preferences?.updatedAt)}`
      : baselineSubscriptions.length > 0
        ? `尚未覆寫租戶訂閱，顯示治理基線 ${formatUpdated(data.governance?.generatedAt)}`
        : "尚未設定任何通知事件";
  const quotaSummary = data.quotaSummary;
  const currentStageValue = TENANT_CONSOLE_ENV;
  const consentValue = getConsentValue(data.preferences);
  const settingsModuleRoutes = [
    "/settings",
    "/users",
    "/audit",
    "/api-keys",
    "/webhooks",
  ];
  const deferredModuleRoutes = ["/notifications", "/sla", "/feature-flags"];
  const localModuleCount = settingsModuleRoutes.length;
  const moduleCatalogCount =
    settingsModuleRoutes.length + deferredModuleRoutes.length;
  const capabilityChips = [
    {
      label: "billing_profile",
      tone: "accent" as const,
    },
    {
      label: "notification_baseline",
      tone: "info" as const,
    },
    {
      label: "sla_thresholds",
      tone: "accent" as const,
    },
    {
      label: "api_key_policy",
      tone: "info" as const,
    },
    {
      label: "webhook_governance",
      tone: "info" as const,
    },
  ];

  const generalActions = dedupeActionLinks([
    ...mapActionLinks(data.billingProfile?.availableActions, tenantCode),
    ...mapActionLinks(data.auditLogs?.availableActions, tenantCode, {
      view_tenant_audit_evidence: {
        label: "檢視稽核",
        href: "/audit",
        note: "same-tab",
      },
    }),
  ]);
  const notificationActions = dedupeActionLinks([
    ...mapActionLinks(data.preferences?.availableActions, tenantCode),
    ...mapActionLinks(data.sla?.availableActions, tenantCode),
  ]);
  const integrationActions = dedupeActionLinks([
    ...mapActionLinks(data.apiKeys?.availableActions, tenantCode),
    ...mapActionLinks(data.webhooks?.availableActions, tenantCode),
  ]);
  const peopleActions = dedupeActionLinks(
    mapActionLinks(data.users?.availableActions, tenantCode),
  );
  const pageActions = dedupeActionLinks([
    ...generalActions,
    ...notificationActions,
    ...integrationActions,
    ...peopleActions,
  ]);
  const runtimeChips: RuntimeChip[] = [
    {
      label: "refresh tier",
      value: SETTINGS_REFRESH.label,
      mono: true,
    },
    {
      label: "freshness",
      value: data.refresh.dataFreshness,
      tone: getFreshnessTone(data.refresh),
    },
    {
      label: "generated",
      value: formatUpdated(data.refresh.generatedAt),
      mono: true,
    },
    {
      label: "source",
      value: data.refresh.source,
      mono: true,
    },
  ];

  const sitemapEntries: SettingsSitemapEntry[] = [
    {
      title: "一般資料",
      route: "/settings",
      detail: "租戶代碼、計費資料、身分與預設 posture 留在此頁總覽。",
      actions: generalActions,
    },
    {
      title: "通知與 SLA",
      route: "/notifications · /sla",
      detail:
        "通知事件矩陣與 SLA 門檻屬獨立 module route；此頁只顯示 posture。",
      actions: notificationActions,
    },
    {
      title: "整合預設",
      route: "/api-keys · /webhooks · platform-admin /audit",
      detail:
        "API key / webhook 治理留在 tenant app；feature rollout 與 platform-owned 變更從 cross-app trace 解釋。",
      actions: integrationActions,
    },
    {
      title: "人員、隱私、跨 app",
      route: "/users · /audit · platform-admin /audit",
      detail:
        "權限、隱私同意與 platform-owned 設定變更用 cross-app audit trace 串起來。",
      actions: peopleActions,
    },
  ];

  const deepLinks: Array<{
    title: string;
    detail: string;
    link: CrossAppResourceLink;
  }> = [
    {
      title: "平台稽核",
      detail:
        "平台管理員變更 feature rollout、billing governance 或 rollout gate 時，trace 回 platform-owned audit。",
      link: {
        targetApp: "platform-admin",
        route: `/audit?tenantId=${encodeURIComponent(tenantCode)}`,
        resourceType: "tenant",
        resourceId: tenantCode,
        openMode: "new_tab",
        label: "前往 platform-admin /audit",
      },
    },
    {
      title: "營運客訴/事件",
      detail:
        "若設定變更影響現場訂單或 webhook 投遞，cross-app 到 ops-console 追事故與人工處置。",
      link: {
        targetApp: "ops-console",
        route: "/complaints",
        resourceType: "complaint_case",
        resourceId: tenantCode,
        openMode: "new_tab",
        label: "前往 ops-console /complaints",
      },
    },
    {
      title: "平台 rollout trace",
      detail:
        "功能可見性是 platform-owned surface；本頁只保留 posture，若需追 tenant override 或 rollout gate，從 platform-admin 查看。",
      link: {
        targetApp: "platform-admin",
        route: "/feature-flags",
        resourceType: "tenant",
        resourceId: tenantCode,
        openMode: "new_tab",
        label: "前往 platform-admin feature trace",
      },
    },
  ];

  const notProvisionedWebhookAction = mapActionLinks(
    data.webhooks?.emptyState?.nextAction
      ? [data.webhooks.emptyState.nextAction]
      : (data.webhooks?.availableActions ?? data.availableActions),
    tenantCode,
    {
      create_webhook_endpoint: {
        label: "檢查 Webhook",
        href: "/webhooks",
      },
    },
  )[0];

  const emptyReasonCards: EmptyReasonCard[] = [
    {
      reason: "no_data",
      title: "尚無租戶覆寫",
      body: "新租戶尚未建立自訂通知與治理覆寫時，這是合法空狀態。",
    },
    {
      reason: "not_provisioned",
      title: "模組未開通",
      body: "例如 webhook engine 或專屬通知 channel 尚未為此 tenant provision。",
      ...(notProvisionedWebhookAction
        ? { nextAction: notProvisionedWebhookAction }
        : {}),
    },
    {
      reason: "fetch_failed",
      title: "讀取失敗",
      body: "讀 billing / SLA / notification snapshot 時後端回應失敗，需明確展示而不是假空白。",
    },
    {
      reason: "permission_denied",
      title: "權限不足",
      body: "非 `tc_admin` 只能看到受限 posture，不能進行跨模組設定變更。",
    },
    {
      reason: "external_unavailable",
      title: "外部依賴降級",
      body: "若身分、通知或第三方 delivery 供應商失聯，設定頁要保留降級說明。",
      nextAction: {
        descriptor: {
          action: "open_ops_trace",
          enabled: true,
          riskLevel: "low",
        },
        label: "看營運 trace",
        link: {
          targetApp: "ops-console",
          route: "/complaints",
          resourceType: "incident",
          resourceId: tenantCode,
          openMode: "new_tab",
          label: "前往 ops-console /complaints",
        },
      },
    },
    {
      reason: "filtered_empty",
      title: "篩選後無結果",
      body: "通知事件 key / scope 篩選過窄時，應和真正沒資料分開處理。",
    },
  ];
  const observedEmptyReasons = new Set<EmptyReason>();

  if (data.errors.length > 0) {
    observedEmptyReasons.add("fetch_failed");
  }
  if (
    pageActions.length > 0 &&
    pageActions.every((action) => !action.descriptor.enabled)
  ) {
    observedEmptyReasons.add("permission_denied");
  }
  if (data.webhooks?.emptyState) {
    observedEmptyReasons.add(data.webhooks.emptyState.reason);
  }
  if (data.apiKeys?.emptyState) {
    observedEmptyReasons.add(data.apiKeys.emptyState.reason);
  }
  if (data.users?.emptyState) {
    observedEmptyReasons.add(data.users.emptyState.reason);
  }
  if (
    data.preferences &&
    data.preferences.subscriptions.length === 0 &&
    baselineSubscriptions.length === 0
  ) {
    observedEmptyReasons.add("no_data");
  }
  if (activeEmptyReason === "filtered_empty") {
    observedEmptyReasons.add("filtered_empty");
  }

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="租戶設定"
        subtitle="一般 · 通知預設 · 隱私 · 整合預設"
        tabs={["一般", "通知", "隱私", "整合"]}
        activeTab="一般"
        actions={
          <div style={actionRowStyle}>
            {pageActions.map((action, index) =>
              renderActionLink(action, `header-${index}`),
            )}
          </div>
        }
      />

      <div style={pageBodyStyle}>
        {data.refresh.dataFreshness !== "fresh" ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="設定快照不是 fresh"
            body={`refresh tier ${SETTINGS_REFRESH.label} · generated ${formatUpdated(data.refresh.generatedAt)} · source ${data.refresh.source}`}
          />
        ) : null}

        {data.availableActions.length === 0 ? (
          <CanvasBanner
            theme={th}
            tone="info"
            icon="warn"
            title="目前 actor 沒有 backend 可用動作"
            body="settings CTA 直接取自各 module/list envelope 的 availableActions；若後端未提供，畫面會保守顯示 read-only。"
          />
        ) : null}

        {data.unsupportedActions.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分 backend actions 尚未對應到 settings CTA"
            body={data.unsupportedActions
              .map((descriptor) => descriptor.action)
              .join(" · ")}
          />
        ) : null}

        {data.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分設定資料無法載入"
            body={data.errors.join(" · ")}
          />
        ) : null}

        <div style={runtimeStripStyle}>
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
          <CanvasCard theme={th} title="一般" style={generalCardStyle}>
            <div style={generalGridStyle}>
              <CanvasField theme={th} label="租戶代碼 · tenant_code">
                <CanvasInput theme={th} value={tenantCode} mono />
              </CanvasField>
              <CanvasField theme={th} label="顯示名稱 · display_name">
                <CanvasInput theme={th} value={displayName} />
              </CanvasField>
              <CanvasField theme={th} label="統一編號 · tax_id">
                <CanvasInput theme={th} value={taxId} mono />
              </CanvasField>
              <CanvasField theme={th} label="計費聯絡人">
                <CanvasInput theme={th} value={billingContact} />
              </CanvasField>
              <CanvasField theme={th} label="預設語系 · default_locale">
                <CanvasSelect theme={th} value="zh-Hant" />
              </CanvasField>
              <CanvasField theme={th} label="預設時區 · timezone">
                <CanvasSelect theme={th} value="Asia/Taipei" />
              </CanvasField>
            </div>
          </CanvasCard>

          <CanvasCard theme={th} title="當期狀態" style={statusCardStyle}>
            <CanvasDL
              theme={th}
              cols={1}
              items={[
                { k: "STAGE", v: currentStageValue, mono: true },
                {
                  k: "啟用模組",
                  v: `${localModuleCount} / ${moduleCatalogCount}`,
                  mono: true,
                },
                {
                  k: "配額",
                  v: formatQuotaLimit(quotaSummary),
                  mono: true,
                },
                {
                  k: "webhook 簽章",
                  v: "sha256-hmac",
                  mono: true,
                },
                { k: "隱私", v: "電話遮罩 · 中介轉接" },
                {
                  k: "同意書版本",
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
            title="設定 sitemap"
            subtitle="`/settings` 保留總覽；可變更的設定折回各 module route。"
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
                      renderActionLink(action, `${entry.title}-${index}`),
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="可用動作與 posture"
            subtitle="header CTA 與下列模組捷徑全部取自 runtime `availableActions`。"
          >
            <div style={summaryStackStyle}>
              <div style={actionPanelStyle}>
                <div style={sectionLabelStyle}>availableActions</div>
                {pageActions.length > 0 ? (
                  <div style={actionRowStyle}>
                    {pageActions.map((action, index) =>
                      renderActionLink(action, `page-action-${index}`),
                    )}
                  </div>
                ) : (
                  <div style={emptyStateStyle}>
                    目前 actor 沒有 backend 可用動作
                  </div>
                )}
              </div>

              <CanvasDL
                theme={th}
                cols={2}
                items={[
                  {
                    k: "realm",
                    v: data.identity?.realm ?? "tenant",
                    mono: true,
                  },
                  { k: "auth mode", v: authMode, mono: true },
                  { k: "角色摘要", v: roleSummary, mono: true },
                  {
                    k: "billing email",
                    v: data.billingProfile?.email ?? "—",
                    mono: true,
                  },
                  {
                    k: "billing address",
                    v: billingAddress,
                  },
                  {
                    k: "last snapshot",
                    v: formatUpdated(data.refresh.generatedAt),
                    mono: true,
                  },
                ]}
              />
            </div>
          </CanvasCard>
        </div>

        <div style={settingsLaneStyle}>
          <CanvasCard
            theme={th}
            title="通知訂閱"
            subtitle="事件代碼 · 路由 · 狀態"
            padding={0}
          >
            {notificationRows.length > 0 ? (
              <SettingsNotificationTable rows={notificationRows} />
            ) : (
              <div style={emptyStateStyle}>尚未訂閱任何事件通知</div>
            )}
            <div style={{ ...mutedFootnoteStyle, padding: "10px 14px 14px" }}>
              {notificationFootnote}
            </div>
          </CanvasCard>

          <div style={splitGridStyle}>
            <CanvasCard
              theme={th}
              title="SLA 與整合姿態"
              subtitle="等待 / 抵達 / 完成門檻 · 月配額姿態 · 治理預設"
            >
              <div style={kpiGridStyle}>
                <CanvasKPI
                  theme={th}
                  label="等候"
                  value={data.sla ? `${data.sla.waitThresholdMin}m` : "—"}
                  sub="等候門檻"
                />
                <CanvasKPI
                  theme={th}
                  label="抵達"
                  value={data.sla ? `${data.sla.arrivalThresholdMin}m` : "—"}
                  sub="抵達門檻"
                />
                <CanvasKPI
                  theme={th}
                  label="完成"
                  value={data.sla ? `${data.sla.completionThresholdMin}m` : "—"}
                  sub="完成門檻"
                />
                <CanvasKPI
                  theme={th}
                  label="剩餘配額"
                  value={formatRemainingPercent(quotaSummary)}
                  sub={formatQuotaRemaining(quotaSummary)}
                />
              </div>

              <CanvasDL
                theme={th}
                cols={2}
                items={[
                  {
                    k: "API key 壽命",
                    v: apiKeyLifetime,
                    mono: true,
                  },
                  {
                    k: "webhook 重送",
                    v: webhookRetry,
                    mono: true,
                  },
                  {
                    k: "Webhook 基線",
                    v: `${baselineEvents.length} 項`,
                    mono: true,
                  },
                  {
                    k: "強制模式",
                    v: quotaSummary?.limit.enforcementMode ?? "—",
                    mono: true,
                  },
                  {
                    k: "已確認趟次",
                    v: quotaSummary
                      ? formatCount(quotaSummary.usage.confirmedBookingCount)
                      : "—",
                    mono: true,
                  },
                  {
                    k: "更新時間",
                    v: formatUpdated(
                      quotaSummary?.refreshedAt ?? data.sla?.updatedAt,
                    ),
                    mono: true,
                  },
                ]}
              />
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="Cross-app deep links"
              subtitle="platform-owned / ops-owned trace 一律 new tab；settings 保留 owner app 指向。"
            >
              <div style={linkStackStyle}>
                {deepLinks.map((item) => {
                  const href = resolveActionHref({
                    descriptor: {
                      action: "open_link",
                      enabled: true,
                      riskLevel: "low",
                    },
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
              title="能力與整合準備"
              subtitle="租戶可用設定面 · webhook 基線 · onboarding checklist"
            >
              <div style={capabilityStackStyle}>
                <div>
                  <div style={sectionLabelStyle}>可用設定面</div>
                  <div style={chipRowStyle}>
                    {settingsModuleRoutes.map((route) => (
                      <CanvasPill key={route} theme={th} tone="accent">
                        {route}
                      </CanvasPill>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={sectionLabelStyle}>Tenant posture</div>
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
                      目前沒有可揭露的 posture 項目
                    </div>
                  )}
                </div>

                <div>
                  <div style={sectionLabelStyle}>Webhook 基線事件</div>
                  {baselineEvents.length > 0 ? (
                    <div style={chipRowStyle}>
                      {baselineEvents.slice(0, 8).map((eventType) => (
                        <CanvasPill key={eventType} theme={th} tone="info">
                          {eventType}
                        </CanvasPill>
                      ))}
                    </div>
                  ) : (
                    <div style={emptyStateStyle}>尚未發佈事件基線</div>
                  )}
                </div>

                {checklist.length > 0 ? (
                  <>
                    <CanvasBanner
                      theme={th}
                      tone="info"
                      icon="warn"
                      title="整合準備仍有待辦"
                      body={`${checklist.length} 項檢查仍需確認，保留 cutover 前的 capability framing。`}
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
                  <div style={emptyStateStyle}>目前沒有額外切換前檢查項目</div>
                )}
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="EmptyReason contract coverage"
              subtitle="`/settings` 本身沒有單一後端 endpoint，因此用 shared contract 說明六種空狀態如何落地。"
            >
              <div style={emptyReasonGridStyle}>
                {emptyReasonCards.map((card) => (
                  <div
                    key={card.reason}
                    style={getEmptyReasonCardStyle(card.reason)}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <CanvasPill
                        theme={th}
                        tone={getEmptyReasonTone(card.reason)}
                      >
                        {card.title}
                      </CanvasPill>
                      <span style={sitemapRouteStyle}>{card.reason}</span>
                      {observedEmptyReasons.has(card.reason) ? (
                        <CanvasPill theme={th} tone="accent">
                          active
                        </CanvasPill>
                      ) : null}
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 12,
                        color: th.textMuted,
                        lineHeight: 1.5,
                      }}
                    >
                      {card.body}
                    </div>
                    {card.nextAction ? (
                      <div style={{ marginTop: 10 }}>
                        {renderActionLink(
                          card.nextAction,
                          `empty-${card.reason}`,
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </CanvasCard>
          </div>
        </div>
      </div>
    </div>
  );
}
