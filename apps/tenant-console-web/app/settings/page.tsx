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
  label: string;
  availableActions?: ResourceActionDescriptor[];
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
  if (
    typeof value.generatedAt !== "string" ||
    typeof value.staleAfterMs !== "number" ||
    typeof value.dataFreshness !== "string" ||
    typeof value.source !== "string"
  ) {
    return null;
  }

  return {
    generatedAt: value.generatedAt,
    staleAfterMs: value.staleAfterMs,
    dataFreshness: value.dataFreshness as UiRefreshMetadata["dataFreshness"],
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

type ActionLinkOverride = {
  kind?: ActionLinkKind;
  surfaceLabel?: string;
  href?: string;
  link?: CrossAppResourceLink;
  note?: string;
};

function formatActionLabel(action: string) {
  return action.replaceAll("_", " ");
}

function resolveSettingsActionOverride(
  action: string,
): ActionLinkOverride | undefined {
  switch (action) {
    case "refresh_snapshot":
      return { kind: "refresh", note: "refresh-runtime" };
    case "create_tenant_user":
    case "update_tenant_role":
      return { href: "/users" };
    case "issue_api_key":
    case "rotate_api_key":
    case "revoke_api_key":
      return { href: "/api-keys" };
    case "create_webhook_endpoint":
    case "update_webhook_endpoint":
    case "delete_webhook_endpoint":
    case "rotate_webhook_secret":
    case "send_test_webhook":
      return { href: "/webhooks" };
    case "view_audit":
    case "export_audit":
    case "list_audit":
      return { href: "/audit", note: "same-tab" };
    case "update_tenant_billing_profile":
    case "update_notification_preferences":
    case "update_notification_subscription":
    case "update_sla_profile":
      return { note: "module-route-pending" };
    default:
      return undefined;
  }
}

function buildActionLink(
  descriptor: ResourceActionDescriptor,
  overrides?: ActionLinkOverride,
): ActionLink {
  const resolved = resolveSettingsActionOverride(descriptor.action);
  const merged = { ...resolved, ...overrides };
  const href = sanitizeLocalHref(merged.href);
  const link = merged.link;
  const kind =
    merged.kind ?? (href || link ? ("link" as const) : ("unresolved" as const));
  const note =
    merged.note ??
    (!href && merged.href && isTenantConsoleLocalRoute(merged.href)
      ? "route-pending"
      : undefined);

  const actionLink: ActionLink = {
    descriptor,
    label: formatActionLabel(descriptor.action),
    kind,
  };

  const surfaceLabel = merged.surfaceLabel;
  if (surfaceLabel) {
    actionLink.surfaceLabel = surfaceLabel;
  }

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
  defaultOverride?: ActionLinkOverride,
  overrides: Partial<Record<string, ActionLinkOverride>> = {},
) {
  if (!actions || actions.length === 0) return [];

  return actions.flatMap((descriptor) => [
    buildActionLink(
      descriptor,
      overrides[descriptor.action] ?? defaultOverride,
    ),
  ]);
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
      const defaultOverride: ActionLinkOverride = {
        ...(source?.label ? { surfaceLabel: source.label } : {}),
      };

      return mapActionLinks(source?.availableActions, defaultOverride).map(
        (action) => {
          const surfaceLabel = action.surfaceLabel ?? source?.label;
          return surfaceLabel ? { ...action, surfaceLabel } : action;
        },
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

function renderActionLink(action: ActionLink, key: string) {
  const href = resolveActionHref(action);
  const variant = getActionVariant(action.descriptor);
  const tooltip = formatActionTooltip(action);
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

function formatActionTooltip(action: ActionLink) {
  if (!action.descriptor.enabled) {
    return action.descriptor.disabledReasonCode ?? "disabled";
  }
  if (action.note === "refresh-runtime") {
    return "重新抓取目前 settings snapshot。";
  }
  if (action.note === "module-route-pending") {
    return "此 module 仍由 settings posture 承接；尚未提供獨立 route。";
  }
  if (action.note === "route-pending") {
    return "此 module route 尚未落地；目前不提供站內跳轉。";
  }
  if (action.kind === "unresolved") {
    return "後端已提供此 action descriptor，但 settings 尚未定義 canonical 導向。";
  }
  return action.note ?? null;
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

function getEmptyReasonCopy(reason: EmptyReason) {
  switch (reason) {
    case "no_data":
      return {
        title: "尚無租戶覆寫",
        body: "新租戶尚未建立自訂通知與治理覆寫時，這是合法空狀態。",
      };
    case "not_provisioned":
      return {
        title: "模組未開通",
        body: "例如 webhook engine 或專屬通知 channel 尚未為此 tenant provision。",
      };
    case "fetch_failed":
      return {
        title: "讀取失敗",
        body: "後端無法提供目前篩選結果，必須顯示失敗原因，而不是假裝沒有資料。",
      };
    case "permission_denied":
      return {
        title: "權限不足",
        body: "當前 actor 只有受限 posture，不能操作這個設定面或資料子集。",
      };
    case "external_unavailable":
      return {
        title: "外部依賴降級",
        body: "上游身分、通知或第三方 delivery 供應商異常時，要保留降級說明與 trace 入口。",
      };
    case "driver_not_eligible":
      return {
        title: "不適用於租戶頁",
        body: "這是 driver app 專用空狀態；若後端誤送到 tenant surface，仍保留顯式標記。",
      };
    case "filtered_empty":
      return {
        title: "篩選後無結果",
        body: "目前篩選條件過窄，因此結果為空；這與真正沒有資料不同。",
      };
  }
}

function hasEmptyStateEnvelope(
  surface: EmptyStateSurfaceCandidate,
): surface is EmptyStateSurface {
  return surface.envelope !== null;
}

function renderEmptyStateSurface(surface: EmptyStateSurface) {
  const copy = getEmptyReasonCopy(surface.envelope.reason);

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
            renderActionLink(action, `${surface.key}-${index}`),
          )}
        </div>
      ) : null}
    </div>
  );
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

  const errors: string[] = [];
  const tag = (label: string, reason: unknown) =>
    `${label}: ${reason instanceof Error ? reason.message : "未知錯誤"}`;
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

  markRuntimeGap("租戶身分", identityValue);
  markRuntimeGap("計費設定", billingValue);
  markRuntimeGap("通知訂閱", preferenceValue);
  markRuntimeGap("SLA 門檻", slaValue);
  markRuntimeGap("整合治理", governanceValue);
  markRuntimeGap("租戶配額", quotaValue);
  markRuntimeGap("租戶人員", usersValue);
  markRuntimeGap("API 金鑰", apiKeysValue);
  markRuntimeGap("Webhook", webhooksValue);
  markRuntimeGap("租戶稽核", auditLogsValue);

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
  const data = await loadSettingsData();

  const tenantCode = data.identity.item?.tenantId ?? DEMO_TENANT_ID;
  const displayName = data.billingProfile.item?.invoiceTitle ?? "未設定";
  const taxId = data.billingProfile.item?.taxId ?? "未設定";
  const billingContact = data.billingProfile.item
    ? `${data.billingProfile.item.contactName ?? "未指派"} · ${data.billingProfile.item.email}`
    : "未設定";
  const billingAddress = data.billingProfile.item?.address ?? "未設定";
  const authMode = data.identity.item?.authMode ?? "—";
  const roleSummary =
    data.identity.item?.roles
      .slice(0, 3)
      .map((role) => role.replace(/^tc_/, ""))
      .join(" · ") ?? "—";

  const apiKeyLifetime = data.governance.item
    ? `${data.governance.item.apiKeyPolicy.defaultLifetimeDays} 天 (最長 ${data.governance.item.apiKeyPolicy.maxLifetimeDays} 天)`
    : "—";
  const webhookRetry = data.governance.item
    ? `${data.governance.item.webhookPolicy.retryPolicy.maxAttempts} 次重送`
    : "—";
  const subscriptions =
    data.preferences.item?.subscriptions?.slice().sort(compareSubscriptions) ??
    [];
  const baselineSubscriptions =
    data.governance.item?.baselineNotificationSubscriptions
      ?.slice()
      .sort(compareSubscriptions) ?? [];
  const checklist = data.governance.item?.onboardingChecklist ?? [];
  const baselineEvents = data.governance.item?.baselineWebhookEvents ?? [];
  const notificationRows: SettingsNotificationRow[] = (
    subscriptions.length > 0 ? subscriptions : baselineSubscriptions
  ).map((subscription) => ({
    ...subscription,
    updatedAt:
      subscriptions.length > 0
        ? (data.preferences.item?.updatedAt ?? null)
        : (data.governance.item?.generatedAt ?? null),
  }));
  const notificationFootnote =
    subscriptions.length > 0
      ? `最後更新 ${formatUpdated(data.preferences.item?.updatedAt)}`
      : baselineSubscriptions.length > 0
        ? `尚未覆寫租戶訂閱，顯示治理基線 ${formatUpdated(data.governance.item?.generatedAt)}`
        : "尚未設定任何通知事件";
  const quotaSummary = data.quotaSummary.item;
  const currentStageValue = TENANT_CONSOLE_ENV;
  const consentValue = getConsentValue(data.preferences.item);
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
    data.governance.item?.apiKeyPolicy
      ? {
          label: "api_key_policy",
          tone: "info" as const,
        }
      : null,
    data.governance.item?.webhookPolicy
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
      label: "計費資料",
      availableActions: data.billingProfile.availableActions,
    },
    { label: "租戶稽核", availableActions: data.auditLogs.availableActions },
  );
  const notificationActions = flattenActionLinks(
    { label: "通知偏好", availableActions: data.preferences.availableActions },
    { label: "SLA 設定", availableActions: data.sla.availableActions },
  );
  const integrationActions = flattenActionLinks(
    { label: "API 金鑰", availableActions: data.apiKeys.availableActions },
    { label: "Webhook", availableActions: data.webhooks.availableActions },
  );
  const peopleActions = flattenActionLinks({
    label: "人員與角色",
    availableActions: data.users.availableActions,
  });
  const headerActions = flattenActionLinks(
    {
      label: "計費資料",
      availableActions: data.billingProfile.availableActions,
    },
    { label: "通知偏好", availableActions: data.preferences.availableActions },
    { label: "SLA 設定", availableActions: data.sla.availableActions },
    { label: "人員與角色", availableActions: data.users.availableActions },
    { label: "API 金鑰", availableActions: data.apiKeys.availableActions },
    { label: "Webhook", availableActions: data.webhooks.availableActions },
    { label: "租戶稽核", availableActions: data.auditLogs.availableActions },
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
      label: "refresh tier",
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
      title: "一般資料",
      route: "/settings · /billing (deferred)",
      detail:
        "租戶代碼、計費資料、身分與預設 posture 留在此頁總覽；計費細節 route 尚未落地前，以本頁摘要承接。",
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
      route:
        "/integration-governance (deferred) · /api-keys · /webhooks · platform-admin /audit",
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
    {
      title: "功能可見性",
      route: "/feature-flags (platform trace)",
      detail:
        "feature visibility 是 read-scoped、platform-owned surface；settings 只保留治理脈絡與 new-tab trace。",
      actions: [],
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

  const emptyStateSurfaceCandidates: EmptyStateSurfaceCandidate[] = [
    {
      key: "notifications",
      title: "通知訂閱",
      route: "/notifications",
      envelope: data.preferences.emptyState,
      actions: dedupeActionLinks(
        mapActionLinks(
          data.preferences.emptyState?.nextAction
            ? [data.preferences.emptyState.nextAction]
            : data.preferences.availableActions,
          {
            surfaceLabel: "通知偏好",
          },
        ),
      ),
    },
    {
      key: "users",
      title: "人員與角色",
      route: "/users",
      envelope: data.users.emptyState,
      actions: dedupeActionLinks(
        mapActionLinks(
          data.users.emptyState?.nextAction
            ? [data.users.emptyState.nextAction]
            : data.users.availableActions,
          {
            surfaceLabel: "人員與角色",
          },
        ),
      ),
    },
    {
      key: "api-keys",
      title: "API 金鑰",
      route: "/api-keys",
      envelope: data.apiKeys.emptyState,
      actions: dedupeActionLinks(
        mapActionLinks(
          data.apiKeys.emptyState?.nextAction
            ? [data.apiKeys.emptyState.nextAction]
            : data.apiKeys.availableActions,
          {
            surfaceLabel: "API 金鑰",
          },
        ),
      ),
    },
    {
      key: "webhooks",
      title: "Webhook",
      route: "/webhooks",
      envelope: data.webhooks.emptyState,
      actions: dedupeActionLinks(
        mapActionLinks(
          data.webhooks.emptyState?.nextAction
            ? [data.webhooks.emptyState.nextAction]
            : data.webhooks.availableActions,
          {
            surfaceLabel: "Webhook",
          },
        ),
      ),
    },
    {
      key: "audit",
      title: "租戶稽核",
      route: "/audit",
      envelope: data.auditLogs.emptyState,
      actions: dedupeActionLinks(
        mapActionLinks(
          data.auditLogs.emptyState?.nextAction
            ? [data.auditLogs.emptyState.nextAction]
            : data.auditLogs.availableActions,
          {
            surfaceLabel: "租戶稽核",
          },
        ),
      ),
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
        title="租戶設定"
        subtitle="一般 · 通知預設 · 隱私 · 整合預設"
        tabs={["一般", "通知", "隱私", "整合"]}
        activeTab="一般"
        actions={
          <div style={actionRowStyle}>
            {headerActions.map((action, index) =>
              renderActionLink(action, `header-${index}`),
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
            title="部分 settings module snapshot 不是 fresh"
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
            title="目前 actor 沒有 backend 可用動作"
            body="settings CTA 直接取自各 module/list envelope 的 availableActions；若後端未提供，畫面會保守顯示 read-only。"
          />
        ) : null}

        {legacyModules.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分 module 仍是 legacy payload"
            body={`缺少 UiRefreshMetadata / ui-runtime envelope：${legacyModules.map((surface) => surface.label).join(" · ")}`}
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
          {!hasRefreshAction ? (
            <SettingsRefreshButton
              label="Refresh snapshot"
              title="重新抓取目前 settings snapshot。"
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
          </div>

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
            subtitle="`/settings` 保留總覽；未落地 module 先回到本頁 posture 或 cross-app trace。"
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
                {headerActions.length > 0 ? (
                  <div style={actionRowStyle}>
                    {headerActions.map((action, index) =>
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
                    v: data.identity.item?.realm ?? "tenant",
                    mono: true,
                  },
                  { k: "auth mode", v: authMode, mono: true },
                  { k: "角色摘要", v: roleSummary, mono: true },
                  {
                    k: "billing email",
                    v: data.billingProfile.item?.email ?? "—",
                    mono: true,
                  },
                  {
                    k: "billing address",
                    v: billingAddress,
                  },
                  {
                    k: "billing snapshot",
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
              title="通知訂閱"
              subtitle="事件代碼 · 路由 · 狀態"
              padding={0}
            >
              {notificationRows.length > 0 ? (
                <SettingsNotificationTable rows={notificationRows} />
              ) : notificationEmptyStateSurface ? (
                <div style={{ padding: "14px" }}>
                  {renderEmptyStateSurface(notificationEmptyStateSurface)}
                </div>
              ) : (
                <div style={emptyStateStyle}>尚未訂閱任何事件通知</div>
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
                title="SLA 與整合姿態"
                subtitle="等待 / 抵達 / 完成門檻 · 月配額姿態 · 治理預設"
              >
                <div style={kpiGridStyle}>
                  <CanvasKPI
                    theme={th}
                    label="等候"
                    value={
                      data.sla.item ? `${data.sla.item.waitThresholdMin}m` : "—"
                    }
                    sub="等候門檻"
                  />
                  <CanvasKPI
                    theme={th}
                    label="抵達"
                    value={
                      data.sla.item
                        ? `${data.sla.item.arrivalThresholdMin}m`
                        : "—"
                    }
                    sub="抵達門檻"
                  />
                  <CanvasKPI
                    theme={th}
                    label="完成"
                    value={
                      data.sla.item
                        ? `${data.sla.item.completionThresholdMin}m`
                        : "—"
                    }
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
              title="Runtime empty states"
              subtitle="各 module 回傳的 `emptyState` 直接映射到畫面，不再用 query param 或本地假資料示範。"
            >
              {emptyStateSurfaces.length > 0 ? (
                <div style={emptyReasonGridStyle}>
                  {emptyStateSurfaces.map((surface) =>
                    renderEmptyStateSurface(surface),
                  )}
                </div>
              ) : (
                <div style={emptyStateStyle}>
                  目前沒有 module 回傳 `emptyState`；此頁維持正常 snapshot
                  posture。
                </div>
              )}
            </CanvasCard>
          </div>
        </div>
      </div>
    </div>
  );
}
