"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
import type {
  CrossAppResourceLink,
  EmptyReason,
  EmptyStateEnvelope,
  PlatformAdapter,
  ResourceActionDescriptor,
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
  CanvasShell,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const REFRESH_INTERVAL_MS = 30_000;
const REFRESH_TIER_LABEL = "T4";

const shellStyle = {
  margin: "-32px",
  minHeight: "calc(100vh - 64px)",
} satisfies CSSProperties;

const bodyStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const controlsGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)",
} satisfies CSSProperties;

const mainGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.45fr) minmax(320px, 0.95fr)",
  alignItems: "start",
} satisfies CSSProperties;

const listGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
} satisfies CSSProperties;

const controlRowStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "minmax(0, 1.5fr) repeat(2, minmax(120px, 0.7fr))",
} satisfies CSSProperties;

const fieldHintStyle = {
  marginTop: 6,
  color: theme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
} satisfies CSSProperties;

const inputStyle = (th: CanvasTheme): CSSProperties => ({
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontFamily: th.fontFamily,
  fontSize: 12.5,
  padding: "8px 10px",
  outline: "none",
});

const textareaStyle = (th: CanvasTheme): CSSProperties => ({
  width: "100%",
  minHeight: 90,
  resize: "vertical",
  boxSizing: "border-box",
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontFamily: th.fontFamily,
  fontSize: 12.5,
  padding: "10px 12px",
  outline: "none",
});

const sectionLabelStyle = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.3,
  textTransform: "uppercase",
  color: theme.textMuted,
} satisfies CSSProperties;

const bodyCopyStyle = {
  color: theme.textMuted,
  fontSize: 12.5,
  lineHeight: 1.5,
} satisfies CSSProperties;

const pillRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
} satisfies CSSProperties;

const detailStackStyle = {
  display: "grid",
  gap: 12,
} satisfies CSSProperties;

const featureGridStyle = {
  display: "grid",
  gap: 8,
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
} satisfies CSSProperties;

const emptyStateBodyStyle = {
  display: "grid",
  gap: 12,
} satisfies CSSProperties;

const linkListStyle = {
  display: "grid",
  gap: 8,
} satisfies CSSProperties;

const cardTitleRowStyle = {
  display: "inline-flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8,
} satisfies CSSProperties;

const cardMetaStyle = {
  marginTop: 10,
  color: theme.textMuted,
  fontSize: 12,
  lineHeight: 1.5,
} satisfies CSSProperties;

const cardSectionStyle = {
  display: "grid",
  gap: 8,
} satisfies CSSProperties;

const cardActionRailStyle = {
  marginTop: 12,
  paddingTop: 12,
  borderTop: `1px solid ${theme.border}`,
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
} satisfies CSSProperties;

const detailColumnStyle = {
  display: "grid",
  gap: 14,
  minWidth: 0,
} satisfies CSSProperties;

const textLinkStyle = (th: CanvasTheme): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  color: th.accent,
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 600,
});

type RegistryFilter = "all" | "attention" | "enabled" | "paused";
type ActionOwner = "platform" | "ops";
type FreshnessState = UiRefreshMetadata["dataFreshness"] | "stale";

interface AdapterRegistryItem {
  id: string;
  platformCode: string;
  displayName: string;
  description: string;
  environment: string;
  rolloutStage: string;
  enabled: boolean;
  adapterType: string;
  webhookUrlStatus: string;
  webhookUrl: string | null;
  webhookLastEventAt: string | null;
  credentialStatus: string;
  credentialTone: CanvasTone;
  credentialSummary: string;
  credentialRotatedAt: string | null;
  credentialRotationOwner: string | null;
  credentialExpiresAt: string | null;
  lastHealthCheck: string | null;
  health: "healthy" | "degraded" | "down" | "unknown";
  healthMessage: string | null;
  supportedActions: string[];
  availableActions: ResourceActionDescriptor[];
  configMetadata: {
    allowedServiceBuckets: string[];
    driverEligibilityRules: string[];
    maxCandidates: number | null;
    acceptTimeoutSeconds: number | null;
    manualFallbackThresholdSeconds: number | null;
    financeAuthorityMode: string;
  };
  capabilityFlags: {
    canRelayAccept: boolean;
    canRelayReject: boolean;
  };
  featureFlags: {
    externalOrderAccept: boolean;
    externalOrderReject: boolean;
    platformEarnings: boolean;
    platformPresence: boolean;
  };
  operationalPauseState: {
    active: boolean;
    owner: string | null;
    ttlExpiresAt: string | null;
    reason: string | null;
  };
  links: CrossAppResourceLink[];
  createdAt: string | null;
  updatedAt: string | null;
}

interface RegistryPayload {
  items: AdapterRegistryItem[];
  refresh: UiRefreshMetadata;
  emptyState: EmptyStateEnvelope | null;
  pageActions: ResourceActionDescriptor[];
}

interface PendingAction {
  descriptor: ResourceActionDescriptor;
  adapterId: string | null;
  source: "page" | "adapter" | "empty";
}

interface ActionReceiptState {
  tone: "info" | "success" | "warn";
  title: string;
  body: string;
  link?: CrossAppResourceLink | null;
}

function buildPlatformNav(locale: string): CanvasShellNavItem[] {
  const labels =
    locale === "en"
      ? {
          workspace: "Workspace",
          home: "Governance Home",
          health: "Platform Health",
          tenantGroup: "Tenant Governance",
          tenants: "Tenants",
          partners: "Partner entry",
          users: "Platform staff",
          fleetGroup: "Fleet & Compliance",
          fleet: "Fleet & compliance",
          switchboard: "Public info & placards",
          pricingGroup: "Pricing & Settlement",
          pricing: "Pricing",
          payments: "Settlement governance",
          platformGroup: "Platform Layer",
          notices: "Notices & maintenance",
          audit: "Audit & evidence",
          flags: "Feature flags",
          adapters: "Adapter registry",
        }
      : {
          workspace: "工作面",
          home: "工作首頁",
          health: "平台健康",
          tenantGroup: "租戶治理",
          tenants: "租戶",
          partners: "合作夥伴 entry",
          users: "平台人員",
          fleetGroup: "車隊與法遵",
          fleet: "車隊與合規",
          switchboard: "法定資訊與牌貼",
          pricingGroup: "計價與結算",
          pricing: "計價",
          payments: "結算治理",
          platformGroup: "平台層",
          notices: "公告與維護",
          audit: "稽核與證據",
          flags: "功能旗標",
          adapters: "介接登錄",
        };

  return [
    { divider: labels.workspace },
    { key: "home", href: "/", label: labels.home, icon: "dashboard" },
    { key: "health", href: "/health", label: labels.health, icon: "health" },
    { divider: labels.tenantGroup },
    {
      key: "tenants",
      href: "/tenants",
      label: labels.tenants,
      icon: "tenants",
    },
    {
      key: "partners",
      href: "/partners",
      label: labels.partners,
      icon: "partners",
    },
    { key: "users", href: "/users", label: labels.users, icon: "users" },
    { divider: labels.fleetGroup },
    { key: "fleet", href: "/fleet", label: labels.fleet, icon: "fleet" },
    {
      key: "switchboard",
      href: "/switchboard",
      label: labels.switchboard,
      icon: "switchboard",
    },
    { divider: labels.pricingGroup },
    {
      key: "pricing",
      href: "/pricing",
      label: labels.pricing,
      icon: "pricing",
    },
    {
      key: "payments",
      href: "/payments",
      label: labels.payments,
      icon: "payments",
    },
    { divider: labels.platformGroup },
    {
      key: "notices",
      href: "/notices",
      label: labels.notices,
      icon: "notices",
    },
    { key: "audit", href: "/audit", label: labels.audit, icon: "audit" },
    {
      key: "flags",
      href: "/feature-flags",
      label: labels.flags,
      icon: "flags",
      matchPaths: ["/feature-flags"],
    },
    {
      key: "adapters",
      href: "/adapter-registry",
      label: labels.adapters,
      icon: "adapters",
      matchPaths: ["/adapter-registry"],
    },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

function humanizeToken(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function canonicalAction(action: string) {
  switch (action.trim().toLowerCase()) {
    case "create":
    case "create_adapter":
    case "create_config":
    case "create_adapter_config":
      return "create_config";
    case "edit":
    case "edit_adapter":
    case "edit_config":
      return "edit_config";
    case "edit_credential":
    case "edit_credentials":
      return "edit_credentials";
    case "rotate":
    case "rotate_credential":
    case "rotate_credentials":
      return "rotate_credentials";
    case "enable":
    case "enable_adapter":
      return "enable_adapter";
    case "disable":
    case "disable_adapter":
      return "disable_adapter";
    case "pause":
    case "ops_pause":
    case "pause_operational_traffic":
      return "pause_operational_traffic";
    case "retry":
    case "retry_callback":
    case "retry_failed_callback":
      return "retry_failed_callback";
    case "clear_filters":
      return "clear_filters";
    default:
      return action.trim().toLowerCase().replace(/\s+/g, "_");
  }
}

function actionOwner(action: string): ActionOwner {
  switch (canonicalAction(action)) {
    case "pause_operational_traffic":
    case "retry_failed_callback":
      return "ops";
    default:
      return "platform";
  }
}

function actionLabel(action: string, locale: string) {
  const normalized = canonicalAction(action);
  const labels =
    locale === "en"
      ? {
          create_config: "Register adapter",
          edit_config: "Edit config",
          edit_credentials: "Edit credentials",
          rotate_credentials: "Rotate credentials",
          enable_adapter: "Enable adapter",
          disable_adapter: "Disable adapter",
          pause_operational_traffic: "Pause traffic (TTL)",
          retry_failed_callback: "Retry callback",
          clear_filters: "Clear filters",
        }
      : {
          create_config: "註冊 adapter",
          edit_config: "編輯設定",
          edit_credentials: "編輯 credential",
          rotate_credentials: "輪替 credential",
          enable_adapter: "啟用 adapter",
          disable_adapter: "停用 adapter",
          pause_operational_traffic: "暫停流量（TTL）",
          retry_failed_callback: "重試 callback",
          clear_filters: "清除篩選",
        };

  return labels[normalized as keyof typeof labels] ?? humanizeToken(normalized);
}

function disabledReasonLabel(code: string | undefined, locale: string) {
  if (!code) {
    return locale === "en" ? "Currently unavailable" : "目前不可用";
  }

  const labels =
    locale === "en"
      ? {
          already_degraded: "Blocked while the adapter is degraded.",
          terminal: "This record is already in a terminal state.",
          wrong_state: "Current state does not allow this action.",
          permission_denied: "Your authority scope does not allow this action.",
          credential_missing: "Credentials must be configured first.",
          rollout_guard:
            "Rollout guard blocks this mutation until readiness is met.",
        }
      : {
          already_degraded: "adapter 已 degraded，暫不允許此操作。",
          terminal: "目前狀態已終止，不可再次操作。",
          wrong_state: "當前狀態不允許此操作。",
          permission_denied: "你的 authority scope 不允許此操作。",
          credential_missing: "需先完成 credential 設定。",
          rollout_guard: "readiness 尚未達標，rollout guard 阻擋此變更。",
        };

  return (
    labels[code as keyof typeof labels] ??
    (locale === "en"
      ? `Blocked: ${humanizeToken(code)}`
      : `受阻：${humanizeToken(code)}`)
  );
}

function defaultPageActions(): ResourceActionDescriptor[] {
  return [
    {
      action: "create_config",
      enabled: true,
      requiresReason: true,
      riskLevel: "high",
    },
  ];
}

function normalizeActionList(
  value: unknown,
  fallback: ResourceActionDescriptor[] = [],
): ResourceActionDescriptor[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value
    .map<ResourceActionDescriptor | null>((entry) => {
      if (!isRecord(entry)) {
        return null;
      }

      const action = asString(entry.action);
      if (!action) {
        return null;
      }

      const riskLevel = asString(entry.riskLevel, "medium");
      const normalizedRisk =
        riskLevel === "low" || riskLevel === "medium" || riskLevel === "high"
          ? riskLevel
          : "medium";

      const descriptor: ResourceActionDescriptor = {
        action,
        enabled: typeof entry.enabled === "boolean" ? entry.enabled : true,
        requiresReason: entry.requiresReason === true,
        riskLevel: normalizedRisk,
      };

      const disabledReasonCode = asNullableString(entry.disabledReasonCode);
      if (disabledReasonCode) {
        descriptor.disabledReasonCode = disabledReasonCode;
      }

      return descriptor;
    })
    .filter((entry): entry is ResourceActionDescriptor => entry !== null);

  return normalized.length > 0 ? normalized : fallback;
}

function normalizeCrossAppLinks(
  value: unknown,
  fallback: CrossAppResourceLink[],
): CrossAppResourceLink[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }

      const targetApp = asString(entry.targetApp);
      if (
        targetApp !== "ops-console" &&
        targetApp !== "platform-admin" &&
        targetApp !== "tenant-console"
      ) {
        return null;
      }

      return {
        targetApp,
        route: asString(entry.route, "/"),
        resourceType: asString(entry.resourceType, "adapter"),
        resourceId: asString(entry.resourceId, ""),
        openMode:
          asString(entry.openMode) === "same_tab" ? "same_tab" : "new_tab",
        label: asString(
          entry.label,
          humanizeToken(asString(entry.resourceType)),
        ),
      } satisfies CrossAppResourceLink;
    })
    .filter((entry): entry is CrossAppResourceLink => Boolean(entry));

  return normalized.length > 0 ? normalized : fallback;
}

function createRefreshMetadata(
  value?: Partial<UiRefreshMetadata>,
): UiRefreshMetadata {
  const freshness = value?.dataFreshness;
  const source = value?.source;

  return {
    generatedAt:
      typeof value?.generatedAt === "string"
        ? value.generatedAt
        : new Date().toISOString(),
    staleAfterMs:
      typeof value?.staleAfterMs === "number"
        ? value.staleAfterMs
        : REFRESH_INTERVAL_MS,
    dataFreshness:
      freshness === "fresh" ||
      freshness === "stale" ||
      freshness === "degraded" ||
      freshness === "unknown"
        ? freshness
        : "fresh",
    source:
      source === "live" ||
      source === "cache" ||
      source === "sandbox" ||
      source === "static"
        ? source
        : "live",
  };
}

function createEmptyState(reason: EmptyReason): EmptyStateEnvelope {
  return {
    reason,
    messageCode: `adapter_registry.${reason}`,
  };
}

function deriveLegacyActions(
  adapter: Partial<PlatformAdapter> & Record<string, unknown>,
): ResourceActionDescriptor[] {
  const actions: ResourceActionDescriptor[] = [
    {
      action: adapter.config?.isEnabled ? "disable_adapter" : "enable_adapter",
      enabled: true,
      requiresReason: true,
      riskLevel: "high",
    },
    {
      action: "edit_config",
      enabled: true,
      riskLevel: "medium",
    },
    {
      action: "edit_credentials",
      enabled: true,
      requiresReason: true,
      riskLevel: "high",
    },
    {
      action: "rotate_credentials",
      enabled: true,
      requiresReason: true,
      riskLevel: "high",
    },
  ];

  const adapterType = asString(adapter.adapterType);
  if (adapter.isForwarded || adapterType.startsWith("EXTERNAL")) {
    actions.push(
      {
        action: "pause_operational_traffic",
        enabled: true,
        requiresReason: true,
        riskLevel: "high",
      },
      {
        action: "retry_failed_callback",
        enabled: true,
        riskLevel: "medium",
      },
    );
  }

  return actions;
}

function normalizeCredentialState(
  adapter: Partial<PlatformAdapter> & Record<string, unknown>,
) {
  const credentialState = isRecord(adapter.credentialState)
    ? adapter.credentialState
    : null;
  const rawStatus = asString(
    credentialState?.status ?? adapter.credentialStatus,
    "UNKNOWN",
  ).toUpperCase();
  const rotatedAt = asNullableString(
    credentialState?.rotatedAt ?? adapter.updatedAt,
  );
  const rotationOwner = asNullableString(
    credentialState?.rotationOwner ?? "platform-admin",
  );
  const expiresAt = asNullableString(credentialState?.expiresAt);

  switch (rawStatus) {
    case "VALID":
    case "CONFIGURED":
      return {
        status: "configured",
        tone: "success" as const,
        summary: "Configured",
        rotatedAt,
        rotationOwner,
        expiresAt,
      };
    case "PENDING":
    case "EXPIRING":
      return {
        status: "expiring",
        tone: "warn" as const,
        summary: "Expiring soon",
        rotatedAt,
        rotationOwner,
        expiresAt,
      };
    case "EXPIRED":
      return {
        status: "expired",
        tone: "danger" as const,
        summary: "Expired",
        rotatedAt,
        rotationOwner,
        expiresAt,
      };
    case "INVALID":
    case "NOT_CONFIGURED":
    case "MISSING":
      return {
        status: "missing",
        tone: "danger" as const,
        summary: "Missing or invalid",
        rotatedAt,
        rotationOwner,
        expiresAt,
      };
    default:
      return {
        status: humanizeToken(rawStatus.toLowerCase()),
        tone: "neutral" as const,
        summary: "Unknown status",
        rotatedAt,
        rotationOwner,
        expiresAt,
      };
  }
}

function normalizeWebhookState(
  adapter: Partial<PlatformAdapter> & Record<string, unknown>,
) {
  const webhook = isRecord(adapter.webhookStatus)
    ? adapter.webhookStatus
    : null;
  const webhookUrl = asNullableString(adapter.webhookUrl ?? webhook?.url);
  const explicitStatus = asNullableString(adapter.webhookUrlStatus);
  const lastStatus = asString(webhook?.lastStatus).toUpperCase();

  let status = explicitStatus;
  if (!status) {
    if (!webhookUrl) {
      status = "missing";
    } else if (lastStatus === "FAILURE") {
      status = "failing";
    } else if (webhook?.isEnabled === false) {
      status = "disabled";
    } else {
      status = "ready";
    }
  }

  return {
    status,
    url: webhookUrl,
    lastEventAt: asNullableString(webhook?.lastEventTimestamp),
  };
}

function normalizeFeatureFlags(
  adapter: Partial<PlatformAdapter> & Record<string, unknown>,
  supportedActions: string[],
) {
  const flags = isRecord(adapter.featureFlags) ? adapter.featureFlags : {};

  return {
    externalOrderAccept: asBoolean(
      flags.driverExternalOrderAcceptEnabled ??
        flags.externalOrderAccept ??
        flags.driverSafeActions,
      supportedActions.includes("accept"),
    ),
    externalOrderReject: asBoolean(
      flags.driverExternalOrderRejectEnabled ?? flags.externalOrderReject,
      supportedActions.includes("reject"),
    ),
    platformEarnings: asBoolean(
      flags.platformEarningsEnabled ?? flags.platformEarnings,
      false,
    ),
    platformPresence: asBoolean(
      flags.platformPresenceEnabled ?? flags.platformPresence,
      false,
    ),
  };
}

function defaultCrossAppLinks(
  adapterId: string,
  platformCode: string,
  locale: string,
): CrossAppResourceLink[] {
  return [
    {
      targetApp: "ops-console",
      route: `/dispatch?adapter=${encodeURIComponent(platformCode)}`,
      resourceType: "adapter",
      resourceId: adapterId,
      openMode: "new_tab",
      label:
        locale === "en"
          ? "Open forwarded board in ops-console"
          : "在 ops-console 開啟 forwarded board",
    },
    {
      targetApp: "platform-admin",
      route: `/health?adapter=${encodeURIComponent(platformCode)}`,
      resourceType: "health",
      resourceId: adapterId,
      openMode: "same_tab",
      label: locale === "en" ? "Open platform health" : "開啟平台健康",
    },
    {
      targetApp: "platform-admin",
      route: `/audit?resourceType=adapter&resourceId=${encodeURIComponent(adapterId)}`,
      resourceType: "audit",
      resourceId: adapterId,
      openMode: "same_tab",
      label: locale === "en" ? "Open audit trail" : "開啟稽核軌跡",
    },
  ];
}

function normalizeAdapterRecord(
  value: unknown,
  index: number,
  locale: string,
): AdapterRegistryItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const adapter = value as Partial<PlatformAdapter> & Record<string, unknown>;
  const supportedActions = Array.isArray(adapter.supportedActions)
    ? adapter.supportedActions
        .map((entry) =>
          isRecord(entry) ? asString(entry.name || entry.action) : "",
        )
        .filter((entry): entry is string => entry.length > 0)
    : [];

  const credential = normalizeCredentialState(adapter);
  const webhook = normalizeWebhookState(adapter);
  const featureFlags = normalizeFeatureFlags(adapter, supportedActions);
  const healthStatus = isRecord(adapter.healthStatus)
    ? adapter.healthStatus
    : null;
  const pauseState = isRecord(adapter.operationalPauseState)
    ? adapter.operationalPauseState
    : isRecord(adapter.pauseState)
      ? adapter.pauseState
      : null;

  const rawHealth = asString(
    adapter.health ?? healthStatus?.status,
    "UNKNOWN",
  ).toUpperCase();
  const normalizedHealth =
    rawHealth === "HEALTHY"
      ? "healthy"
      : rawHealth === "DEGRADED"
        ? "degraded"
        : rawHealth === "UNHEALTHY" || rawHealth === "DOWN"
          ? "down"
          : "unknown";

  const configMetadata: Record<string, unknown> = isRecord(
    adapter.configMetadata,
  )
    ? adapter.configMetadata
    : {};
  const policies: Record<string, unknown> = isRecord(adapter.policies)
    ? adapter.policies
    : {};
  const capabilityFlags: Record<string, unknown> = isRecord(
    adapter.capabilityFlags,
  )
    ? adapter.capabilityFlags
    : {};
  const links = normalizeCrossAppLinks(
    adapter.links,
    defaultCrossAppLinks(
      asString(adapter.id, `adapter-${index + 1}`),
      asString(adapter.platformCode, `adapter-${index + 1}`),
      locale,
    ),
  );

  const availableActions = normalizeActionList(
    adapter.availableActions,
    deriveLegacyActions(adapter),
  );

  return {
    id: asString(adapter.id, `adapter-${index + 1}`),
    platformCode: asString(adapter.platformCode, `ADP-${index + 1}`),
    displayName: asString(
      adapter.displayName ?? adapter.name,
      "Unnamed adapter",
    ),
    description: asString(adapter.description),
    environment: asString(adapter.environment, "unknown"),
    rolloutStage: asString(
      adapter.rolloutStage,
      asString(adapter.environment, "unknown"),
    ),
    enabled: asBoolean(adapter.enabled ?? adapter.config?.isEnabled, false),
    adapterType: asString(adapter.adapterType, "unknown"),
    webhookUrlStatus: webhook.status,
    webhookUrl: webhook.url,
    webhookLastEventAt: webhook.lastEventAt,
    credentialStatus: credential.status,
    credentialTone: credential.tone,
    credentialSummary: credential.summary,
    credentialRotatedAt: credential.rotatedAt,
    credentialRotationOwner: credential.rotationOwner,
    credentialExpiresAt: credential.expiresAt,
    lastHealthCheck: asNullableString(
      adapter.lastHealthCheck ??
        healthStatus?.lastCheckTimestamp ??
        adapter.updatedAt,
    ),
    health: normalizedHealth,
    healthMessage: asNullableString(
      adapter.healthMessage ?? healthStatus?.message,
    ),
    supportedActions,
    availableActions,
    configMetadata: {
      allowedServiceBuckets: asStringArray(
        configMetadata.allowedServiceBuckets ?? policies.serviceBuckets,
      ),
      driverEligibilityRules: asStringArray(
        configMetadata.driverEligibilityRules,
      ),
      maxCandidates: asNumber(
        configMetadata.maxCandidates ?? policies.maxCandidates,
      ),
      acceptTimeoutSeconds: asNumber(
        configMetadata.acceptTimeoutSeconds ?? policies.acceptTimeoutSeconds,
      ),
      manualFallbackThresholdSeconds: asNumber(
        configMetadata.manualFallbackThresholdSeconds ??
          policies.manualFallbackThresholdSeconds,
      ),
      financeAuthorityMode: asString(
        configMetadata.financeAuthorityMode ?? policies.financeAuthorityMode,
        "unknown",
      ),
    },
    capabilityFlags: {
      canRelayAccept: asBoolean(
        adapter.canRelayAccept ?? capabilityFlags.canRelayAccept,
        supportedActions.includes("accept"),
      ),
      canRelayReject: asBoolean(
        adapter.canRelayReject ?? capabilityFlags.canRelayReject,
        supportedActions.includes("reject"),
      ),
    },
    featureFlags,
    operationalPauseState: {
      active: asBoolean(pauseState?.active, false),
      owner: asNullableString(pauseState?.owner ?? pauseState?.pauseOwner),
      ttlExpiresAt: asNullableString(
        pauseState?.ttlExpiresAt ?? pauseState?.expiresAt,
      ),
      reason: asNullableString(pauseState?.reason),
    },
    links,
    createdAt: asNullableString(adapter.createdAt),
    updatedAt: asNullableString(adapter.updatedAt),
  };
}

function normalizePayload(payload: unknown, locale: string): RegistryPayload {
  const container = isRecord(payload) ? payload : null;
  const emptyStateRecord: Record<string, unknown> | null = isRecord(
    container?.emptyState,
  )
    ? container.emptyState
    : null;
  const rawItems = Array.isArray(payload)
    ? payload
    : Array.isArray(container?.items)
      ? container.items
      : [];
  const items = rawItems
    .map((entry, index) => normalizeAdapterRecord(entry, index, locale))
    .filter((entry): entry is AdapterRegistryItem => Boolean(entry))
    .sort((left, right) => left.platformCode.localeCompare(right.platformCode));

  const emptyStateNextAction = normalizeActionList(
    isRecord(emptyStateRecord?.nextAction) ? [emptyStateRecord.nextAction] : [],
  )[0];

  return {
    items,
    refresh: createRefreshMetadata(
      isRecord(container?.refresh)
        ? (container?.refresh as Partial<UiRefreshMetadata>)
        : undefined,
    ),
    emptyState:
      items.length === 0
        ? emptyStateRecord
          ? {
              reason: asString(
                emptyStateRecord.reason,
                "no_data",
              ) as EmptyReason,
              messageCode: asString(
                emptyStateRecord.messageCode,
                "adapter_registry.no_data",
              ),
              ...(emptyStateNextAction
                ? { nextAction: emptyStateNextAction }
                : {}),
            }
          : createEmptyState("no_data")
        : null,
    pageActions: normalizeActionList(
      container?.availableActions,
      defaultPageActions(),
    ),
  };
}

function getEffectiveFreshness(
  refresh: UiRefreshMetadata,
  now: number,
): FreshnessState {
  if (
    refresh.dataFreshness === "degraded" ||
    refresh.dataFreshness === "unknown"
  ) {
    return refresh.dataFreshness;
  }

  const generatedAt = Date.parse(refresh.generatedAt);
  if (!Number.isFinite(generatedAt)) {
    return refresh.dataFreshness;
  }

  return now - generatedAt > refresh.staleAfterMs
    ? "stale"
    : refresh.dataFreshness;
}

function freshnessTone(
  value: FreshnessState,
): "info" | "success" | "warn" | "danger" {
  switch (value) {
    case "fresh":
      return "success";
    case "stale":
      return "warn";
    case "degraded":
      return "danger";
    case "unknown":
    default:
      return "info";
  }
}

function freshnessLabel(value: FreshnessState, locale: string) {
  const labels =
    locale === "en"
      ? {
          fresh: "Fresh",
          stale: "Stale",
          degraded: "Degraded",
          unknown: "Unknown",
        }
      : {
          fresh: "Fresh",
          stale: "Stale",
          degraded: "Degraded",
          unknown: "Unknown",
        };

  return labels[value];
}

function adapterTypeTone(value: string): CanvasTone {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("webhook") || normalized.includes("forward")) {
    return "info";
  }
  if (normalized.includes("combined") || normalized.includes("auth")) {
    return "accent";
  }
  if (normalized.includes("rest")) {
    return "success";
  }
  return "neutral";
}

function environmentTone(value: string): CanvasTone {
  switch (value.trim().toLowerCase()) {
    case "production":
      return "success";
    case "pilot":
    case "staging":
      return "accent";
    case "sandbox":
    case "development":
      return "info";
    case "rollback_hold":
      return "danger";
    default:
      return "neutral";
  }
}

function healthTone(value: AdapterRegistryItem["health"]): CanvasTone {
  switch (value) {
    case "healthy":
      return "success";
    case "degraded":
      return "warn";
    case "down":
      return "danger";
    default:
      return "neutral";
  }
}

function isAttentionAdapter(item: AdapterRegistryItem) {
  return (
    item.health !== "healthy" ||
    item.credentialTone === "warn" ||
    item.credentialTone === "danger" ||
    item.operationalPauseState.active ||
    !item.enabled ||
    item.webhookUrlStatus === "failing"
  );
}

function isUrgentAdapter(item: AdapterRegistryItem) {
  return (
    item.health === "down" ||
    item.health === "degraded" ||
    item.credentialStatus === "expiring" ||
    item.credentialStatus === "expired" ||
    item.credentialStatus === "missing"
  );
}

function resolveCrossAppHref(link: CrossAppResourceLink) {
  const baseMap = {
    "ops-console":
      process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003",
    "platform-admin":
      process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3002",
    "tenant-console":
      process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL ?? "http://localhost:3004",
  } as const;

  const route = link.route.startsWith("/") ? link.route : `/${link.route}`;
  const base = baseMap[link.targetApp];
  return /^https?:\/\//.test(link.route)
    ? link.route
    : `${base.replace(/\/$/, "")}${route}`;
}

function openCrossAppLink(link: CrossAppResourceLink) {
  const href = resolveCrossAppHref(link);
  if (link.openMode === "same_tab") {
    window.location.assign(href);
    return;
  }
  window.open(href, "_blank", "noopener,noreferrer");
}

function actionButtonPalette(
  th: CanvasTheme,
  descriptor: ResourceActionDescriptor,
  owner: ActionOwner,
  emphasis = false,
) {
  if (!descriptor.enabled) {
    return {
      background: th.surfaceLo,
      border: th.border,
      color: th.textMuted,
      ownerBg: th.neutralBg,
      ownerBd: th.neutralBorder,
      ownerFg: th.textMuted,
    };
  }

  if (descriptor.riskLevel === "high") {
    return owner === "ops"
      ? {
          background: emphasis ? th.warn : th.warnBg,
          border: emphasis ? th.warn : th.warnBorder,
          color: emphasis ? "#ffffff" : th.warn,
          ownerBg: th.infoBg,
          ownerBd: th.infoBorder,
          ownerFg: th.info,
        }
      : {
          background: emphasis ? th.danger : th.dangerBg,
          border: emphasis ? th.danger : th.dangerBorder,
          color: emphasis ? "#ffffff" : th.danger,
          ownerBg: th.accentBg,
          ownerBd: th.accentBorder,
          ownerFg: th.accent,
        };
  }

  if (descriptor.riskLevel === "medium") {
    return owner === "ops"
      ? {
          background: emphasis ? th.info : th.infoBg,
          border: emphasis ? th.info : th.infoBorder,
          color: emphasis ? "#ffffff" : th.info,
          ownerBg: th.infoBg,
          ownerBd: th.infoBorder,
          ownerFg: th.info,
        }
      : {
          background: emphasis ? th.accent : th.accentBg,
          border: emphasis ? th.accent : th.accentBorder,
          color: emphasis ? "#ffffff" : th.accent,
          ownerBg: th.accentBg,
          ownerBd: th.accentBorder,
          ownerFg: th.accent,
        };
  }

  return {
    background: th.surface,
    border: th.border,
    color: th.text,
    ownerBg: owner === "ops" ? th.infoBg : th.neutralBg,
    ownerBd: owner === "ops" ? th.infoBorder : th.neutralBorder,
    ownerFg: owner === "ops" ? th.info : th.textMuted,
  };
}

function ActionButton({
  descriptor,
  locale,
  onPress,
  emphasis = false,
  size = "compact",
}: {
  descriptor: ResourceActionDescriptor;
  locale: string;
  onPress: () => void;
  emphasis?: boolean;
  size?: "compact" | "regular";
}) {
  const owner = actionOwner(descriptor.action);
  const palette = actionButtonPalette(theme, descriptor, owner, emphasis);
  const disabledReason = descriptor.enabled
    ? undefined
    : disabledReasonLabel(descriptor.disabledReasonCode, locale);

  return (
    <button
      type="button"
      disabled={!descriptor.enabled}
      onClick={onPress}
      title={disabledReason}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: size === "compact" ? "6px 9px" : "7px 11px",
        borderRadius: 999,
        border: `1px solid ${palette.border}`,
        background: palette.background,
        color: palette.color,
        fontFamily: theme.fontFamily,
        fontSize: size === "compact" ? 11.5 : 12,
        fontWeight: 600,
        cursor: descriptor.enabled ? "pointer" : "not-allowed",
        opacity: descriptor.enabled ? 1 : 0.55,
        lineHeight: 1.2,
      }}
    >
      <span>{actionLabel(descriptor.action, locale)}</span>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "1px 6px",
          borderRadius: 999,
          background: palette.ownerBg,
          border: `1px solid ${palette.ownerBd}`,
          color: palette.ownerFg,
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.3,
        }}
      >
        {owner === "ops" ? "OPS" : "PA"}
      </span>
    </button>
  );
}

export default function AdapterRegistryPage() {
  const { locale, t } = useTranslation();
  const client = usePlatformAdminClient();
  const [registry, setRegistry] = useState<RegistryPayload>(() => ({
    items: [],
    refresh: createRefreshMetadata({
      dataFreshness: "unknown",
      source: "static",
    }),
    emptyState: createEmptyState("no_data"),
    pageActions: defaultPageActions(),
  }));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RegistryFilter>("all");
  const [environmentFilter, setEnvironmentFilter] = useState("all");
  const [selectedAdapterId, setSelectedAdapterId] = useState<string | null>(
    null,
  );
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [actionReason, setActionReason] = useState("");
  const [executingAction, setExecutingAction] = useState(false);
  const [receipt, setReceipt] = useState<ActionReceiptState | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const copy =
    locale === "en"
      ? {
          breadcrumbParent: "Platform & Commerce",
          pageTitle: "External Platform Adapter Registry",
          pageSubtitle:
            "Split authority surface for adapter config, credential ceremonies, enablement, and ops handoffs.",
          refresh: "Refresh",
          refreshing: "Refreshing…",
          searchLabel: "Search adapters",
          searchPlaceholder:
            "Search by platform code, display name, or action…",
          filterLabel: "Focus",
          envLabel: "Environment",
          filters: {
            all: "All adapters",
            attention: "Needs attention",
            enabled: "Enabled only",
            paused: "Ops paused",
          },
          allEnvironments: "All environments",
          controlTitle: "Registry filters",
          controlSubtitle:
            "Search + focus controls are local; CTA visibility still comes from availableActions.",
          controlHint:
            "Rows with zero actions stay visible as read-only mirrors instead of disappearing.",
          splitTitle: "Authority split",
          splitBody:
            "Platform Admin owns config, credentials, enable/disable. Ops authority owns pause/retry workflows and is deep-linked when needed.",
          secretTitle: "Secret material is plaintext-once",
          secretBody:
            "Credential rotation may return a secret only at creation time. The registry shows status, rotation owner, and timestamps only.",
          refreshTitle: "Refresh cadence",
          refreshBody:
            "Adapter registry is T4 medium-slow. The page auto-refreshes every 30s and surfaces stale/degraded snapshots instead of inventing liveness.",
          listTitle: "Adapter inventory",
          listSubtitle:
            "Cards keep the canvas two-column rhythm while exposing the packet-required readiness data.",
          emptySelection:
            "Pick an adapter card to inspect detail, flags, and deep links.",
          detailTitle: "Adapter detail",
          detailSubtitle:
            "Capability flags, config metadata, operational pause, and cross-app exits.",
          quickActions: "Quick actions",
          supportedActions: "Supported actions",
          capabilityFlags: "Capability flags",
          configMetadata: "Config metadata",
          featureFlags: "Feature flags",
          pauseState: "Operational pause",
          crossAppLinks: "Cross-app links",
          platformAuthority: "Platform Admin authority",
          opsAuthority: "Ops authority",
          readOnly: "Read-only mirror",
          readOnlyBody:
            "This adapter currently has no availableActions for the active actor. Data remains visible by design.",
          guardrailTitle: "Change confirmation required",
          reasonLabel: "Reason",
          reasonPlaceholder:
            "Provide the audit reason required for this action.",
          reasonHint:
            "High-risk actions must capture a non-empty reason before execution.",
          confirm: "Confirm",
          cancel: "Cancel",
          receiptLink: "Open linked context",
          staleTitle: "Snapshot is no longer fresh",
          staleBody:
            "The page keeps the last known snapshot visible and highlights staleness rather than silently clearing data.",
          errorGuardrail:
            "The registry will preserve the last good payload when possible and fall back to a fetch_failed empty state when no snapshot exists.",
          filterCleared: "Filters reset to show the full registry.",
          envSummary: "Environments visible",
          noAdapters: "Adapters",
          urgency: "Urgent",
          paused: "Paused",
          readOnlyMeta: "read-only",
          sourcedFrom: "Source",
          generatedAt: "Generated",
          freshness: "Freshness",
          cadence: "Cadence",
          lastCheck: "Last check",
          enabled: "Enabled",
          webhook: "Webhook",
          credential: "Credential",
          rollout: "Rollout",
          env: "Env",
          adapterType: "Adapter type",
          serviceBuckets: "Service buckets",
          eligibility: "Eligibility rules",
          maxCandidates: "Max candidates",
          acceptTimeout: "Accept timeout",
          fallbackThreshold: "Manual fallback",
          financeMode: "Finance authority",
          pauseOwner: "Pause owner",
          pauseTtl: "TTL",
          pauseReason: "Reason",
          none: "None",
          noneConfigured: "No adapter is selected.",
          noDescription: "No description provided.",
          focusDetail: "Inspect detail",
          detailSelected: "Detail selected",
          visibleCount: "Visible adapters",
          healthLabel: "Health",
          rotatedAt: "Rotated",
          expiresAt: "Expires",
          rotationOwner: "Rotation owner",
        }
      : {
          breadcrumbParent: "平台與商務",
          pageTitle: "External Platform Adapter Registry",
          pageSubtitle:
            "依 split authority 管理 adapter 設定、credential ceremony、enablement 與 ops handoff。",
          refresh: "Refresh",
          refreshing: "Refreshing…",
          searchLabel: "搜尋 adapter",
          searchPlaceholder: "依 platform code、display name 或 action 搜尋…",
          filterLabel: "Focus",
          envLabel: "Environment",
          filters: {
            all: "全部 adapter",
            attention: "需關注",
            enabled: "僅已啟用",
            paused: "ops 已暫停",
          },
          allEnvironments: "全部 environment",
          controlTitle: "Registry 篩選",
          controlSubtitle:
            "搜尋與 focus 只影響前端視圖；CTA 是否可見仍由 availableActions 決定。",
          controlHint:
            "沒有 actions 的列仍以 read-only mirror 保留，不會因權限不足而直接消失。",
          splitTitle: "Authority split",
          splitBody:
            "Platform Admin 擁有 config、credentials、enable/disable；Ops authority 擁有 pause/retry workflow，必要時以 deep link 交接。",
          secretTitle: "Secret material 只會 plaintext-once",
          secretBody:
            "credential 輪替後不會再次顯示 secret；registry 只顯示狀態、rotation owner 與時間戳。",
          refreshTitle: "Refresh cadence",
          refreshBody:
            "adapter registry 屬於 T4 medium-slow。頁面每 30 秒自動 refresh，並明確顯示 stale/degraded snapshot。",
          listTitle: "Adapter inventory",
          listSubtitle:
            "維持 canvas 的雙欄節奏，同時補齊 packet 要求的 readiness 與治理資訊。",
          emptySelection:
            "選一張 adapter 卡片，即可查看 detail、flags 與 deep links。",
          detailTitle: "Adapter detail",
          detailSubtitle:
            "capability flags、config metadata、operational pause 與 cross-app exits。",
          quickActions: "Quick actions",
          supportedActions: "Supported actions",
          capabilityFlags: "Capability flags",
          configMetadata: "Config metadata",
          featureFlags: "Feature flags",
          pauseState: "Operational pause",
          crossAppLinks: "Cross-app links",
          platformAuthority: "Platform Admin authority",
          opsAuthority: "Ops authority",
          readOnly: "Read-only mirror",
          readOnlyBody:
            "這個 adapter 目前對當前 actor 沒有 availableActions；資料仍按 spec 保持可見。",
          guardrailTitle: "需要變更確認",
          reasonLabel: "Reason",
          reasonPlaceholder: "填寫此動作需要記錄的 audit reason。",
          reasonHint: "高風險動作必須收集非空白 reason 才能執行。",
          confirm: "確認",
          cancel: "取消",
          receiptLink: "開啟 linked context",
          staleTitle: "目前 snapshot 已不再 fresh",
          staleBody:
            "頁面會保留最後一份可用 snapshot，並誠實標示 stale，而不是把資料清空。",
          errorGuardrail:
            "只要還有上一份成功 payload，就保留顯示；若完全取不到資料，才切到 fetch_failed empty state。",
          filterCleared: "已清除篩選並恢復完整 registry。",
          envSummary: "目前顯示 environment",
          noAdapters: "Adapters",
          urgency: "Urgent",
          paused: "Paused",
          readOnlyMeta: "read-only",
          sourcedFrom: "Source",
          generatedAt: "Generated",
          freshness: "Freshness",
          cadence: "Cadence",
          lastCheck: "Last check",
          enabled: "Enabled",
          webhook: "Webhook",
          credential: "Credential",
          rollout: "Rollout",
          env: "Env",
          adapterType: "Adapter type",
          serviceBuckets: "Service buckets",
          eligibility: "Eligibility rules",
          maxCandidates: "Max candidates",
          acceptTimeout: "Accept timeout",
          fallbackThreshold: "Manual fallback",
          financeMode: "Finance authority",
          pauseOwner: "Pause owner",
          pauseTtl: "TTL",
          pauseReason: "Reason",
          none: "None",
          noneConfigured: "尚未選擇 adapter。",
          noDescription: "目前沒有 description。",
          focusDetail: "查看 detail",
          detailSelected: "已選取 detail",
          visibleCount: "目前可見 adapter",
          healthLabel: "Health",
          rotatedAt: "Rotated",
          expiresAt: "Expires",
          rotationOwner: "Rotation owner",
        };

  const loadRegistry = useCallback(
    async (mode: "initial" | "auto" | "manual" = "manual") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError(null);
      try {
        const payload = await client.get<unknown>(
          "/api/platform-admin/adapters",
        );
        setRegistry(normalizePayload(payload, locale));
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : String(caught);
        setError(message);
        setRegistry((previous) => {
          if (previous.items.length > 0) {
            return {
              ...previous,
              refresh: createRefreshMetadata({
                ...previous.refresh,
                generatedAt: new Date().toISOString(),
                dataFreshness: "degraded",
              }),
            };
          }

          return {
            items: [],
            refresh: createRefreshMetadata({
              generatedAt: new Date().toISOString(),
              dataFreshness: "degraded",
            }),
            emptyState: {
              reason: "fetch_failed",
              messageCode: "adapter_registry.fetch_failed",
              nextAction: {
                action: "create_config",
                enabled: false,
                disabledReasonCode: "permission_denied",
                requiresReason: true,
                riskLevel: "high",
              },
            },
            pageActions: defaultPageActions(),
          };
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [client, locale],
  );

  useEffect(() => {
    void loadRegistry("initial");
  }, [loadRegistry]);

  useEffect(() => {
    const refreshTimer = window.setInterval(() => {
      void loadRegistry("auto");
    }, REFRESH_INTERVAL_MS);
    const freshnessTimer = window.setInterval(() => {
      setNow(Date.now());
    }, 5_000);
    return () => {
      window.clearInterval(refreshTimer);
      window.clearInterval(freshnessTimer);
    };
  }, [loadRegistry]);

  const environmentOptions = useMemo(() => {
    return [...new Set(registry.items.map((item) => item.environment))].sort();
  }, [registry.items]);

  const visibleAdapters = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return registry.items.filter((item) => {
      if (
        normalizedQuery &&
        ![
          item.platformCode,
          item.displayName,
          item.description,
          ...item.supportedActions,
          ...item.configMetadata.allowedServiceBuckets,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      ) {
        return false;
      }

      if (
        environmentFilter !== "all" &&
        item.environment.toLowerCase() !== environmentFilter.toLowerCase()
      ) {
        return false;
      }

      switch (filter) {
        case "attention":
          return isAttentionAdapter(item);
        case "enabled":
          return item.enabled;
        case "paused":
          return item.operationalPauseState.active;
        case "all":
        default:
          return true;
      }
    });
  }, [environmentFilter, filter, query, registry.items]);

  useEffect(() => {
    const firstVisible = visibleAdapters[0];
    if (!firstVisible) {
      setSelectedAdapterId(null);
      return;
    }

    if (!selectedAdapterId) {
      setSelectedAdapterId(firstVisible.id);
      return;
    }

    if (!visibleAdapters.some((item) => item.id === selectedAdapterId)) {
      setSelectedAdapterId(firstVisible.id);
    }
  }, [selectedAdapterId, visibleAdapters]);

  const selectedAdapter =
    visibleAdapters.find((item) => item.id === selectedAdapterId) ?? null;

  const effectiveFreshness = useMemo(
    () => getEffectiveFreshness(registry.refresh, now),
    [now, registry.refresh],
  );

  const activeEmptyState = useMemo(() => {
    if (loading && registry.items.length === 0) {
      return null;
    }

    if (visibleAdapters.length > 0) {
      return null;
    }

    if (registry.items.length > 0) {
      return {
        reason: "filtered_empty" as const,
        messageCode: "adapter_registry.filtered_empty",
        nextAction: {
          action: "clear_filters",
          enabled: true,
          riskLevel: "low",
        },
      } satisfies EmptyStateEnvelope;
    }

    return registry.emptyState ?? createEmptyState("no_data");
  }, [
    loading,
    registry.emptyState,
    registry.items.length,
    visibleAdapters.length,
  ]);

  const stats = useMemo(
    () => ({
      total: registry.items.length,
      urgent: registry.items.filter(isUrgentAdapter).length,
      paused: registry.items.filter((item) => item.operationalPauseState.active)
        .length,
      readOnly: registry.items.filter(
        (item) => item.availableActions.length === 0,
      ).length,
    }),
    [registry.items],
  );

  const urgentAdapter = useMemo(
    () => registry.items.find(isUrgentAdapter) ?? null,
    [registry.items],
  );

  const platformActions =
    selectedAdapter?.availableActions.filter(
      (descriptor) => actionOwner(descriptor.action) === "platform",
    ) ?? [];
  const opsActions =
    selectedAdapter?.availableActions.filter(
      (descriptor) => actionOwner(descriptor.action) === "ops",
    ) ?? [];

  function clearFilters() {
    setQuery("");
    setFilter("all");
    setEnvironmentFilter("all");
    setReceipt({
      tone: "info",
      title: actionLabel("clear_filters", locale),
      body: copy.filterCleared,
    });
  }

  function stageAction(
    descriptor: ResourceActionDescriptor,
    adapterId: string | null,
    source: PendingAction["source"],
  ) {
    if (!descriptor.enabled) {
      return;
    }

    if (canonicalAction(descriptor.action) === "clear_filters") {
      clearFilters();
      return;
    }

    if (descriptor.riskLevel === "low" && !descriptor.requiresReason) {
      void executeAction({ descriptor, adapterId, source }, "");
      return;
    }

    setPendingAction({ descriptor, adapterId, source });
    setActionReason("");
  }

  async function executeAction(action: PendingAction, reason: string) {
    const adapter =
      action.adapterId == null
        ? null
        : (registry.items.find((item) => item.id === action.adapterId) ?? null);
    const normalizedAction = canonicalAction(action.descriptor.action);
    setExecutingAction(true);
    setError(null);

    try {
      if (adapter && normalizedAction === "enable_adapter") {
        await client.updatePlatformAdapter(adapter.id, {
          config: { isEnabled: true },
        });
        setReceipt({
          tone: "success",
          title: actionLabel(normalizedAction, locale),
          body:
            locale === "en"
              ? `${adapter.displayName} was enabled and queued for the next T4 refresh cycle.`
              : `${adapter.displayName} 已啟用，將在下一個 T4 refresh 週期反映。`,
        });
        await loadRegistry("manual");
      } else if (adapter && normalizedAction === "disable_adapter") {
        await client.updatePlatformAdapter(adapter.id, {
          config: { isEnabled: false },
        });
        setReceipt({
          tone: "warn",
          title: actionLabel(normalizedAction, locale),
          body:
            locale === "en"
              ? `${adapter.displayName} was disabled. Reason recorded for audit: ${reason || "n/a"}.`
              : `${adapter.displayName} 已停用。audit reason：${reason || "n/a"}。`,
        });
        await loadRegistry("manual");
      } else if (
        adapter &&
        (normalizedAction === "pause_operational_traffic" ||
          normalizedAction === "retry_failed_callback")
      ) {
        const link =
          adapter.links.find((entry) => entry.targetApp === "ops-console") ??
          null;
        if (link) {
          openCrossAppLink(link);
        }
        setReceipt({
          tone: "info",
          title: actionLabel(normalizedAction, locale),
          body:
            locale === "en"
              ? "Ops-owned workflow opened in a linked context. Platform Admin remains the read surface for readiness."
              : "已開啟 ops 擁有的 workflow；Platform Admin 仍保留 readiness 讀取視圖。",
          link,
        });
      } else {
        setReceipt({
          tone: action.descriptor.riskLevel === "high" ? "warn" : "info",
          title: actionLabel(normalizedAction, locale),
          body:
            locale === "en"
              ? `The UI captured the action intent${
                  reason ? ` with reason: ${reason}.` : "."
                }`
              : `UI 已記錄動作意圖${reason ? `，reason：${reason}。` : "。"}`,
          link:
            adapter?.links.find((entry) => entry.resourceType === "audit") ??
            null,
        });
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
    } finally {
      setExecutingAction(false);
      setPendingAction(null);
      setActionReason("");
    }
  }

  const pendingActionLabel = pendingAction
    ? actionLabel(pendingAction.descriptor.action, locale)
    : "";

  const emptyStateContent = (() => {
    if (!activeEmptyState) {
      return null;
    }

    const reason =
      activeEmptyState.reason === "driver_not_eligible"
        ? "no_data"
        : activeEmptyState.reason;
    const map =
      locale === "en"
        ? {
            no_data: {
              tone: "neutral" as const,
              title: "No adapters registered yet",
              body: "Create the first adapter config before rollout can progress.",
            },
            not_provisioned: {
              tone: "accent" as const,
              title: "Registry not provisioned",
              body: "The backend says this environment is not provisioned yet.",
            },
            fetch_failed: {
              tone: "danger" as const,
              title: "Registry fetch failed",
              body: "No usable snapshot is available. Retry or inspect platform health.",
            },
            permission_denied: {
              tone: "warn" as const,
              title: "Read scope denied",
              body: "This actor cannot read the adapter registry payload for the current authority boundary.",
            },
            external_unavailable: {
              tone: "warn" as const,
              title: "Upstream platform unavailable",
              body: "The owner system is unavailable. Refresh later or inspect linked ops context.",
            },
            filtered_empty: {
              tone: "info" as const,
              title: "No adapters match the current filters",
              body: "Clear the local search/filter state to reveal the registry again.",
            },
          }
        : {
            no_data: {
              tone: "neutral" as const,
              title: "目前尚未註冊任何 adapter",
              body: "先建立第一筆 adapter config，後續 rollout 才能推進。",
            },
            not_provisioned: {
              tone: "accent" as const,
              title: "Registry 尚未 provision",
              body: "後端回報此環境尚未 provision 完成。",
            },
            fetch_failed: {
              tone: "danger" as const,
              title: "Registry 讀取失敗",
              body: "目前沒有可用 snapshot；請重試或先查看 platform health。",
            },
            permission_denied: {
              tone: "warn" as const,
              title: "讀取權限被拒",
              body: "當前 actor 不具備此 authority boundary 的 registry 讀取權限。",
            },
            external_unavailable: {
              tone: "warn" as const,
              title: "上游平台暫時不可用",
              body: "owner system 不可用；請稍後 refresh 或改走 linked ops context。",
            },
            filtered_empty: {
              tone: "info" as const,
              title: "目前沒有符合篩選條件的 adapter",
              body: "清除本地 search/filter 狀態後即可重新看到完整 registry。",
            },
          };

    return map[reason];
  })();

  const urgentAction =
    urgentAdapter?.availableActions.find((descriptor) =>
      [
        "rotate_credentials",
        "disable_adapter",
        "pause_operational_traffic",
      ].includes(canonicalAction(descriptor.action)),
    ) ??
    urgentAdapter?.availableActions[0] ??
    null;

  return (
    <CanvasShell
      theme={theme}
      nav={buildPlatformNav(locale)}
      active="adapters"
      brandLabel={t("app.name")}
      brandSubLabel={t("app.sub")}
      breadcrumb={[copy.breadcrumbParent, copy.pageTitle]}
      env="production"
      versionLabel="canvas"
      searchPlaceholder={copy.searchPlaceholder}
      avatarLabel={locale === "en" ? "PA" : "平台"}
      style={shellStyle}
    >
      <CanvasPageHeader
        theme={theme}
        title={copy.pageTitle}
        subtitle={copy.pageSubtitle}
        actions={
          <>
            {registry.pageActions.map((descriptor, index) => (
              <ActionButton
                key={`${descriptor.action}-${index}`}
                descriptor={descriptor}
                locale={locale}
                emphasis
                size="regular"
                onPress={() => stageAction(descriptor, null, "page")}
              />
            ))}
            <CanvasBtn
              theme={theme}
              variant="secondary"
              icon="arrow"
              onClick={() => void loadRegistry("manual")}
              disabled={refreshing}
            >
              {refreshing ? copy.refreshing : copy.refresh}
            </CanvasBtn>
          </>
        }
      />

      <div style={bodyStyle}>
        {error && registry.items.length > 0 ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={`${getPlatformLabel(locale, "error")}: ${error}`}
            body={copy.errorGuardrail}
          />
        ) : null}

        {pendingAction ? (
          <CanvasBanner
            theme={theme}
            tone={
              pendingAction.descriptor.riskLevel === "high" ? "warn" : "info"
            }
            title={`${copy.guardrailTitle}: ${pendingActionLabel}`}
            body={
              <div style={{ display: "grid", gap: 12 }}>
                <div style={bodyCopyStyle}>
                  {pendingAction.descriptor.requiresReason
                    ? copy.reasonHint
                    : copy.splitBody}
                </div>
                {pendingAction.descriptor.requiresReason ? (
                  <CanvasField theme={theme} label={copy.reasonLabel}>
                    <textarea
                      value={actionReason}
                      onChange={(event) => setActionReason(event.target.value)}
                      placeholder={copy.reasonPlaceholder}
                      style={textareaStyle(theme)}
                    />
                  </CanvasField>
                ) : null}
              </div>
            }
            actions={
              <>
                <CanvasBtn
                  theme={theme}
                  variant="secondary"
                  onClick={() => {
                    setPendingAction(null);
                    setActionReason("");
                  }}
                  disabled={executingAction}
                >
                  {copy.cancel}
                </CanvasBtn>
                <CanvasBtn
                  theme={theme}
                  variant="primary"
                  onClick={() =>
                    void executeAction(pendingAction, actionReason.trim())
                  }
                  disabled={
                    executingAction ||
                    (pendingAction.descriptor.requiresReason === true &&
                      actionReason.trim().length === 0)
                  }
                >
                  {copy.confirm}
                </CanvasBtn>
              </>
            }
          />
        ) : null}

        {receipt ? (
          <CanvasBanner
            theme={theme}
            tone={receipt.tone}
            title={receipt.title}
            body={receipt.body}
            actions={
              receipt.link ? (
                <CanvasBtn
                  theme={theme}
                  variant="secondary"
                  onClick={() => openCrossAppLink(receipt.link!)}
                >
                  {copy.receiptLink}
                </CanvasBtn>
              ) : null
            }
          />
        ) : null}

        {effectiveFreshness !== "fresh" ? (
          <CanvasBanner
            theme={theme}
            tone={freshnessTone(effectiveFreshness)}
            title={`${copy.staleTitle} · ${freshnessLabel(
              effectiveFreshness,
              locale,
            )}`}
            body={copy.staleBody}
          />
        ) : null}

        {urgentAdapter ? (
          <CanvasBanner
            theme={theme}
            tone={urgentAdapter.health === "down" ? "danger" : "warn"}
            title={`${urgentAdapter.platformCode} · ${urgentAdapter.displayName}`}
            body={`${
              urgentAdapter.healthMessage || urgentAdapter.credentialSummary
            } · ${copy.lastCheck}: ${formatDateTime(
              urgentAdapter.lastHealthCheck || urgentAdapter.updatedAt || "",
            )}`}
            actions={
              urgentAction ? (
                <ActionButton
                  descriptor={urgentAction}
                  locale={locale}
                  emphasis
                  onPress={() =>
                    stageAction(urgentAction, urgentAdapter.id, "adapter")
                  }
                />
              ) : null
            }
          />
        ) : null}

        <div style={controlsGridStyle}>
          <CanvasCard
            theme={theme}
            title={copy.controlTitle}
            subtitle={copy.controlSubtitle}
          >
            <div style={controlRowStyle}>
              <CanvasField theme={theme} label={copy.searchLabel}>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={copy.searchPlaceholder}
                  style={inputStyle(theme)}
                />
              </CanvasField>
              <CanvasField theme={theme} label={copy.filterLabel}>
                <select
                  value={filter}
                  onChange={(event) =>
                    setFilter(event.target.value as RegistryFilter)
                  }
                  style={inputStyle(theme)}
                >
                  <option value="all">{copy.filters.all}</option>
                  <option value="attention">{copy.filters.attention}</option>
                  <option value="enabled">{copy.filters.enabled}</option>
                  <option value="paused">{copy.filters.paused}</option>
                </select>
              </CanvasField>
              <CanvasField theme={theme} label={copy.envLabel}>
                <select
                  value={environmentFilter}
                  onChange={(event) => setEnvironmentFilter(event.target.value)}
                  style={inputStyle(theme)}
                >
                  <option value="all">{copy.allEnvironments}</option>
                  {environmentOptions.map((value) => (
                    <option key={value} value={value}>
                      {formatPlatformCodeLabel(locale as "en" | "zh", value)}
                    </option>
                  ))}
                </select>
              </CanvasField>
            </div>
            <div style={fieldHintStyle}>{copy.controlHint}</div>
            <div style={{ ...pillRowStyle, marginTop: 12 }}>
              <CanvasPill theme={theme} tone="neutral">
                {`${copy.visibleCount}: ${visibleAdapters.length}`}
              </CanvasPill>
              <CanvasPill
                theme={theme}
                tone={stats.urgent > 0 ? "warn" : "success"}
              >
                {`${copy.urgency}: ${stats.urgent}`}
              </CanvasPill>
              <CanvasPill
                theme={theme}
                tone={stats.paused > 0 ? "warn" : "neutral"}
              >
                {`${copy.paused}: ${stats.paused}`}
              </CanvasPill>
              <CanvasPill
                theme={theme}
                tone={stats.readOnly > 0 ? "neutral" : "success"}
              >
                {`${copy.readOnly}: ${stats.readOnly}`}
              </CanvasPill>
            </div>
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title={copy.refreshTitle}
            subtitle={copy.splitBody}
          >
            <CanvasDL
              theme={theme}
              cols={2}
              items={[
                { label: copy.cadence, value: `${REFRESH_TIER_LABEL} · 30s` },
                {
                  label: copy.freshness,
                  value: (
                    <CanvasPill
                      theme={theme}
                      tone={freshnessTone(effectiveFreshness)}
                    >
                      {freshnessLabel(effectiveFreshness, locale)}
                    </CanvasPill>
                  ),
                },
                {
                  label: copy.generatedAt,
                  value: formatDateTime(registry.refresh.generatedAt),
                  mono: true,
                },
                {
                  label: copy.sourcedFrom,
                  value: registry.refresh.source,
                  mono: true,
                },
                {
                  label: copy.noAdapters,
                  value: stats.total,
                  mono: true,
                },
                {
                  label: copy.readOnly,
                  value: stats.readOnly,
                  mono: true,
                },
              ]}
            />
          </CanvasCard>
        </div>

        {loading && registry.items.length === 0 ? (
          <CanvasCard
            theme={theme}
            title={copy.listTitle}
            subtitle={copy.refreshing}
          >
            <div style={bodyCopyStyle}>{copy.refreshing}</div>
          </CanvasCard>
        ) : activeEmptyState && emptyStateContent ? (
          <CanvasCard
            theme={theme}
            title={emptyStateContent.title}
            subtitle={copy.listTitle}
          >
            <div style={emptyStateBodyStyle}>
              <CanvasPill theme={theme} tone={emptyStateContent.tone}>
                {activeEmptyState.reason}
              </CanvasPill>
              <div style={bodyCopyStyle}>{emptyStateContent.body}</div>
              {activeEmptyState.nextAction ? (
                <div>
                  <ActionButton
                    descriptor={activeEmptyState.nextAction}
                    locale={locale}
                    emphasis
                    onPress={() =>
                      stageAction(activeEmptyState.nextAction!, null, "empty")
                    }
                  />
                </div>
              ) : null}
            </div>
          </CanvasCard>
        ) : (
          <>
            <div style={listGridStyle}>
              {visibleAdapters.map((item) => {
                const selected = item.id === selectedAdapterId;
                const attention = isAttentionAdapter(item);
                const quickActions = item.availableActions.slice(0, 4);

                return (
                  <CanvasCard
                    key={item.id}
                    theme={theme}
                    title={
                      <span style={cardTitleRowStyle}>
                        <span>{item.displayName}</span>
                        <CanvasPill
                          theme={theme}
                          tone={adapterTypeTone(item.adapterType)}
                        >
                          {formatPlatformCodeLabel(
                            locale as "en" | "zh",
                            item.adapterType,
                          )}
                        </CanvasPill>
                      </span>
                    }
                    subtitle={item.platformCode}
                    actions={
                      <CanvasPill
                        theme={theme}
                        tone={healthTone(item.health)}
                        dot
                      >
                        {item.health}
                      </CanvasPill>
                    }
                    style={{
                      borderColor: selected
                        ? theme.accentBorder
                        : attention
                          ? theme.warnBorder
                          : theme.border,
                      background: selected ? theme.accentBg : theme.surface,
                      boxShadow: selected ? theme.shadowSm : "none",
                    }}
                  >
                    <div style={cardMetaStyle}>
                      {item.description || copy.noDescription}
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <CanvasDL
                        theme={theme}
                        cols={3}
                        items={[
                          {
                            label: copy.env,
                            value: formatPlatformCodeLabel(
                              locale as "en" | "zh",
                              item.environment,
                            ),
                          },
                          {
                            label: copy.enabled,
                            value: item.enabled ? copy.enabled : "Disabled",
                          },
                          {
                            label: copy.rollout,
                            value: formatPlatformCodeLabel(
                              locale as "en" | "zh",
                              item.rolloutStage,
                            ),
                          },
                          { label: copy.webhook, value: item.webhookUrlStatus },
                          {
                            label: copy.credential,
                            value: item.credentialSummary,
                          },
                          {
                            label: copy.lastCheck,
                            value: formatDateTime(
                              item.lastHealthCheck || item.updatedAt || "",
                            ),
                            mono: true,
                          },
                        ]}
                      />
                    </div>

                    <div style={{ ...cardSectionStyle, marginTop: 12 }}>
                      <div style={pillRowStyle}>
                        <CanvasPill
                          theme={theme}
                          tone={environmentTone(item.environment)}
                        >
                          {formatPlatformCodeLabel(
                            locale as "en" | "zh",
                            item.environment,
                          )}
                        </CanvasPill>
                        <CanvasPill theme={theme} tone={item.credentialTone}>
                          {item.credentialStatus}
                        </CanvasPill>
                        {item.operationalPauseState.active ? (
                          <CanvasPill theme={theme} tone="warn">
                            {copy.paused}
                          </CanvasPill>
                        ) : null}
                        {item.availableActions.length === 0 ? (
                          <CanvasPill theme={theme} tone="neutral">
                            {copy.readOnlyMeta}
                          </CanvasPill>
                        ) : null}
                      </div>
                    </div>

                    <div style={{ ...cardSectionStyle, marginTop: 12 }}>
                      <div style={sectionLabelStyle}>
                        {copy.supportedActions}
                      </div>
                      <div style={pillRowStyle}>
                        {item.supportedActions.length > 0 ? (
                          item.supportedActions.map((action) => (
                            <CanvasPill
                              key={`${item.id}-${action}`}
                              theme={theme}
                              tone="neutral"
                            >
                              {action}
                            </CanvasPill>
                          ))
                        ) : (
                          <span style={bodyCopyStyle}>{copy.none}</span>
                        )}
                      </div>
                    </div>

                    <div style={cardActionRailStyle}>
                      <button
                        type="button"
                        onClick={() => setSelectedAdapterId(item.id)}
                        style={{
                          borderRadius: 999,
                          border: `1px solid ${
                            selected ? theme.accent : theme.border
                          }`,
                          background: selected ? theme.accent : theme.surfaceLo,
                          color: selected ? "#ffffff" : theme.text,
                          fontFamily: theme.fontFamily,
                          fontSize: 11.5,
                          fontWeight: 700,
                          padding: "6px 10px",
                          cursor: "pointer",
                        }}
                      >
                        {selected ? copy.detailSelected : copy.focusDetail}
                      </button>
                      {quickActions.length > 0 ? (
                        quickActions.map((descriptor, index) => (
                          <ActionButton
                            key={`${item.id}-${descriptor.action}-${index}`}
                            descriptor={descriptor}
                            locale={locale}
                            onPress={() =>
                              stageAction(descriptor, item.id, "adapter")
                            }
                          />
                        ))
                      ) : (
                        <span style={bodyCopyStyle}>{copy.readOnlyBody}</span>
                      )}
                    </div>
                  </CanvasCard>
                );
              })}
            </div>

            <CanvasCard
              theme={theme}
              title={copy.detailTitle}
              subtitle={
                selectedAdapter ? copy.detailSubtitle : copy.noneConfigured
              }
            >
              {selectedAdapter ? (
                <div style={mainGridStyle}>
                  <div style={detailColumnStyle}>
                    <div style={detailStackStyle}>
                      <div>
                        <div style={cardTitleRowStyle}>
                          <span
                            style={{
                              fontSize: 15,
                              fontWeight: 700,
                              color: theme.text,
                            }}
                          >
                            {selectedAdapter.displayName}
                          </span>
                          <CanvasPill
                            theme={theme}
                            tone={adapterTypeTone(selectedAdapter.adapterType)}
                          >
                            {formatPlatformCodeLabel(
                              locale as "en" | "zh",
                              selectedAdapter.adapterType,
                            )}
                          </CanvasPill>
                          <CanvasPill
                            theme={theme}
                            tone={healthTone(selectedAdapter.health)}
                            dot
                          >
                            {selectedAdapter.health}
                          </CanvasPill>
                          {selectedAdapter.operationalPauseState.active ? (
                            <CanvasPill theme={theme} tone="warn">
                              {copy.paused}
                            </CanvasPill>
                          ) : null}
                        </div>
                        <div style={cardMetaStyle}>
                          {selectedAdapter.description || copy.noDescription}
                        </div>
                      </div>

                      <CanvasDL
                        theme={theme}
                        cols={2}
                        items={[
                          {
                            label: copy.env,
                            value: formatPlatformCodeLabel(
                              locale as "en" | "zh",
                              selectedAdapter.environment,
                            ),
                          },
                          {
                            label: copy.healthLabel,
                            value: (
                              <CanvasPill
                                theme={theme}
                                tone={healthTone(selectedAdapter.health)}
                                dot
                              >
                                {selectedAdapter.health}
                              </CanvasPill>
                            ),
                          },
                          {
                            label: copy.credential,
                            value: selectedAdapter.credentialSummary,
                          },
                          {
                            label: copy.webhook,
                            value: selectedAdapter.webhookUrlStatus,
                          },
                          {
                            label: copy.lastCheck,
                            value: formatDateTime(
                              selectedAdapter.lastHealthCheck ||
                                selectedAdapter.updatedAt ||
                                "",
                            ),
                            mono: true,
                          },
                          {
                            label: copy.rotatedAt,
                            value: formatDateTime(
                              selectedAdapter.credentialRotatedAt ||
                                selectedAdapter.updatedAt ||
                                "",
                            ),
                            mono: true,
                          },
                          {
                            label: copy.expiresAt,
                            value: selectedAdapter.credentialExpiresAt
                              ? formatDateTime(
                                  selectedAdapter.credentialExpiresAt,
                                )
                              : copy.none,
                            mono: Boolean(selectedAdapter.credentialExpiresAt),
                          },
                          {
                            label: copy.rotationOwner,
                            value:
                              selectedAdapter.credentialRotationOwner ??
                              copy.none,
                          },
                        ]}
                      />

                      <div style={detailStackStyle}>
                        <div style={sectionLabelStyle}>
                          {copy.capabilityFlags}
                        </div>
                        <div style={featureGridStyle}>
                          <CanvasPill
                            theme={theme}
                            tone={
                              selectedAdapter.capabilityFlags.canRelayAccept
                                ? "success"
                                : "neutral"
                            }
                          >
                            canRelayAccept:{" "}
                            {selectedAdapter.capabilityFlags.canRelayAccept
                              ? "true"
                              : "false"}
                          </CanvasPill>
                          <CanvasPill
                            theme={theme}
                            tone={
                              selectedAdapter.capabilityFlags.canRelayReject
                                ? "success"
                                : "neutral"
                            }
                          >
                            canRelayReject:{" "}
                            {selectedAdapter.capabilityFlags.canRelayReject
                              ? "true"
                              : "false"}
                          </CanvasPill>
                        </div>
                      </div>

                      <div style={detailStackStyle}>
                        <div style={sectionLabelStyle}>{copy.featureFlags}</div>
                        <div style={featureGridStyle}>
                          {[
                            [
                              "driver external order accept",
                              selectedAdapter.featureFlags.externalOrderAccept,
                            ],
                            [
                              "driver external order reject",
                              selectedAdapter.featureFlags.externalOrderReject,
                            ],
                            [
                              "platform earnings",
                              selectedAdapter.featureFlags.platformEarnings,
                            ],
                            [
                              "platform presence",
                              selectedAdapter.featureFlags.platformPresence,
                            ],
                          ].map(([label, enabled]) => (
                            <CanvasPill
                              key={`${selectedAdapter.id}-${label}`}
                              theme={theme}
                              tone={enabled ? "accent" : "neutral"}
                            >
                              {label}: {enabled ? "on" : "off"}
                            </CanvasPill>
                          ))}
                        </div>
                      </div>

                      <div style={detailStackStyle}>
                        <div style={sectionLabelStyle}>
                          {copy.configMetadata}
                        </div>
                        <CanvasDL
                          theme={theme}
                          cols={2}
                          items={[
                            {
                              label: copy.serviceBuckets,
                              value:
                                selectedAdapter.configMetadata.allowedServiceBuckets.join(
                                  ", ",
                                ) || copy.none,
                            },
                            {
                              label: copy.eligibility,
                              value:
                                selectedAdapter.configMetadata.driverEligibilityRules.join(
                                  ", ",
                                ) || copy.none,
                            },
                            {
                              label: copy.maxCandidates,
                              value:
                                selectedAdapter.configMetadata.maxCandidates ??
                                "—",
                              mono: true,
                            },
                            {
                              label: copy.acceptTimeout,
                              value:
                                selectedAdapter.configMetadata
                                  .acceptTimeoutSeconds != null
                                  ? `${selectedAdapter.configMetadata.acceptTimeoutSeconds}s`
                                  : "—",
                              mono: true,
                            },
                            {
                              label: copy.fallbackThreshold,
                              value:
                                selectedAdapter.configMetadata
                                  .manualFallbackThresholdSeconds != null
                                  ? `${selectedAdapter.configMetadata.manualFallbackThresholdSeconds}s`
                                  : "—",
                              mono: true,
                            },
                            {
                              label: copy.financeMode,
                              value: formatPlatformCodeLabel(
                                locale as "en" | "zh",
                                selectedAdapter.configMetadata
                                  .financeAuthorityMode,
                              ),
                            },
                          ]}
                        />
                      </div>

                      <div style={detailStackStyle}>
                        <div style={sectionLabelStyle}>{copy.pauseState}</div>
                        <CanvasDL
                          theme={theme}
                          cols={2}
                          items={[
                            {
                              label: copy.pauseOwner,
                              value:
                                selectedAdapter.operationalPauseState.owner ??
                                copy.none,
                            },
                            {
                              label: copy.pauseTtl,
                              value: selectedAdapter.operationalPauseState
                                .ttlExpiresAt
                                ? formatDateTime(
                                    selectedAdapter.operationalPauseState
                                      .ttlExpiresAt,
                                  )
                                : copy.none,
                              mono: Boolean(
                                selectedAdapter.operationalPauseState
                                  .ttlExpiresAt,
                              ),
                            },
                            {
                              label: copy.pauseReason,
                              value:
                                selectedAdapter.operationalPauseState.reason ??
                                copy.none,
                            },
                            {
                              label: copy.enabled,
                              value: selectedAdapter.operationalPauseState
                                .active
                                ? copy.paused
                                : copy.none,
                            },
                          ]}
                        />
                      </div>
                    </div>
                  </div>

                  <div style={detailColumnStyle}>
                    <div style={detailStackStyle}>
                      <div style={sectionLabelStyle}>
                        {copy.platformAuthority}
                      </div>
                      <div style={pillRowStyle}>
                        {platformActions.length > 0 ? (
                          platformActions.map((descriptor, index) => (
                            <ActionButton
                              key={`${selectedAdapter.id}-pa-${descriptor.action}-${index}`}
                              descriptor={descriptor}
                              locale={locale}
                              onPress={() =>
                                stageAction(
                                  descriptor,
                                  selectedAdapter.id,
                                  "adapter",
                                )
                              }
                            />
                          ))
                        ) : (
                          <span style={bodyCopyStyle}>{copy.readOnlyBody}</span>
                        )}
                      </div>
                    </div>

                    <div style={detailStackStyle}>
                      <div style={sectionLabelStyle}>{copy.opsAuthority}</div>
                      <div style={pillRowStyle}>
                        {opsActions.length > 0 ? (
                          opsActions.map((descriptor, index) => (
                            <ActionButton
                              key={`${selectedAdapter.id}-ops-${descriptor.action}-${index}`}
                              descriptor={descriptor}
                              locale={locale}
                              onPress={() =>
                                stageAction(
                                  descriptor,
                                  selectedAdapter.id,
                                  "adapter",
                                )
                              }
                            />
                          ))
                        ) : (
                          <span style={bodyCopyStyle}>{copy.none}</span>
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        border: `1px solid ${theme.border}`,
                        borderRadius: 10,
                        background: theme.surfaceLo,
                        padding: 14,
                        display: "grid",
                        gap: 10,
                      }}
                    >
                      <div style={sectionLabelStyle}>{copy.secretTitle}</div>
                      <div style={bodyCopyStyle}>{copy.secretBody}</div>
                      <CanvasDL
                        theme={theme}
                        cols={1}
                        items={[
                          {
                            label: copy.credential,
                            value: selectedAdapter.credentialSummary,
                          },
                          {
                            label: copy.rotatedAt,
                            value: formatDateTime(
                              selectedAdapter.credentialRotatedAt ||
                                selectedAdapter.updatedAt ||
                                "",
                            ),
                            mono: true,
                          },
                          {
                            label: copy.rotationOwner,
                            value:
                              selectedAdapter.credentialRotationOwner ??
                              copy.none,
                          },
                          {
                            label: copy.expiresAt,
                            value: selectedAdapter.credentialExpiresAt
                              ? formatDateTime(
                                  selectedAdapter.credentialExpiresAt,
                                )
                              : copy.none,
                            mono: Boolean(selectedAdapter.credentialExpiresAt),
                          },
                        ]}
                      />
                    </div>

                    <div style={detailStackStyle}>
                      <div style={sectionLabelStyle}>{copy.crossAppLinks}</div>
                      <div style={linkListStyle}>
                        {selectedAdapter.links.map((link) => (
                          <button
                            key={`${selectedAdapter.id}-${link.targetApp}-${link.route}`}
                            type="button"
                            onClick={() => openCrossAppLink(link)}
                            style={{
                              border: `1px solid ${theme.border}`,
                              background: theme.surfaceLo,
                              borderRadius: 8,
                              padding: "9px 10px",
                              textAlign: "left",
                              cursor: "pointer",
                            }}
                          >
                            <div style={textLinkStyle(theme)}>{link.label}</div>
                            <div
                              style={{
                                marginTop: 4,
                                fontSize: 11,
                                color: theme.textDim,
                                fontFamily: theme.monoFamily,
                              }}
                            >
                              {link.targetApp} · {link.openMode}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={bodyCopyStyle}>{copy.noneConfigured}</div>
              )}
            </CanvasCard>
          </>
        )}
      </div>
    </CanvasShell>
  );
}
