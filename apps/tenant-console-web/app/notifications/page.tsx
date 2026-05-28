import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  EmptyReason,
  ResourceActionDescriptor,
  TenantIntegrationGovernancePackage,
  TenantNotificationPreferences,
  TenantWebhookEndpoint,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
  CanvasPill,
  buildCanvasTheme,
} from "@drts/ui-web";
import { DEMO_TENANT_ID, getTenantClient } from "@/lib/api-client";
import {
  EMPTY_REASON_COPY,
  NOTIFICATION_EVENT_CATALOG,
  type NotificationChannel,
} from "./constants";
import {
  NotificationMatrixForm,
  type NotificationMatrixRow,
} from "./notification-matrix-form";
import { updateNotificationPreferencesAction } from "./actions";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const linkRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const linkChipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
  color: th.text,
  fontSize: 12,
  textDecoration: "none",
};

const helperTextStyle: CSSProperties = {
  fontSize: 11.5,
  lineHeight: 1.5,
  color: th.textMuted,
};

const monoStyle: CSSProperties = {
  fontFamily: th.monoFamily,
};

const metaRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const supportGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
  gap: 16,
};

const emptyStateCardStyle: CSSProperties = {
  padding: "28px 20px",
  display: "grid",
  gap: 12,
  justifyItems: "start",
};

const emptyStateBodyStyle: CSSProperties = {
  fontSize: 12.5,
  lineHeight: 1.6,
  color: th.textMuted,
};

const emptyReasonKeys = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const satisfies Exclude<EmptyReason, "driver_not_eligible">[];

type NotificationEmptyReason = (typeof emptyReasonKeys)[number];

const notificationLookup = new Map<
  string,
  (typeof NOTIFICATION_EVENT_CATALOG)[number]
>(NOTIFICATION_EVENT_CATALOG.map((item) => [item.eventType, item]));

type NotificationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type NotificationsPageData = {
  preferences: TenantNotificationPreferences | null;
  governance: TenantIntegrationGovernancePackage | null;
  webhooks: TenantWebhookEndpoint[];
  errors: string[];
};

type NotificationPageActions = {
  saveAction: ResourceActionDescriptor;
  deepLinks: NotificationPageLink[];
};

type NotificationPreferencesRuntime = TenantNotificationPreferences & {
  availableActions?: ResourceActionDescriptor[];
  emptyState?: {
    reason: EmptyReason;
    nextAction?: ResourceActionDescriptor | null;
  } | null;
  refresh?: {
    dataFreshness?: "fresh" | "stale" | "degraded" | "unknown";
    generatedAt?: string;
  } | null;
  dataFreshness?: "fresh" | "stale" | "degraded" | "unknown";
  generatedAt?: string;
};

type NotificationPageLink = ResourceActionDescriptor & {
  label: string;
  href?: string;
  target?: "_blank" | "_self";
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const dateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatDateTime(value: string | null | undefined) {
  const parsed = parseDate(value);
  return parsed ? dateTimeFormatter.format(parsed) : "—";
}

function loadChannelState(
  channel: NotificationChannel,
  subscriptionMap: Map<string, boolean>,
  webhookProvisioned: boolean,
) {
  if (channel === "webhook" && !webhookProvisioned) {
    return {
      channel,
      enabled: false,
      provisioned: false,
      disabledReason: "未建立 endpoint",
    };
  }

  return {
    channel,
    enabled: subscriptionMap.get(channel) ?? false,
    provisioned: true,
  };
}

function isNotificationPreferencesRuntime(
  value: TenantNotificationPreferences | null,
): value is NotificationPreferencesRuntime {
  return Boolean(value && typeof value === "object");
}

function resolveActionLabel(action: string) {
  switch (action) {
    case "update_subscription":
      return "儲存設定";
    case "open_webhook_audit":
      return "Ops Console 稽核";
    case "open_platform_webhook_debug":
      return "Platform Admin delivery debug";
    case "open_webhooks":
    case "configure_webhook":
      return "Webhook 管理";
    case "open_integration_governance":
      return "整合就緒度";
    default:
      return action;
  }
}

function resolveActionHref(action: string) {
  switch (action) {
    case "open_webhook_audit":
      return `${
        process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3103"
      }/audit?tenantId=${encodeURIComponent(DEMO_TENANT_ID)}&resourceType=tenant_notifications`;
    case "open_platform_webhook_debug":
      return `${
        process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3102"
      }/tenants?tenantId=${encodeURIComponent(DEMO_TENANT_ID)}`;
    case "open_webhooks":
    case "configure_webhook":
      return "/webhooks";
    case "open_integration_governance":
      return "/integration-governance";
    default:
      return undefined;
  }
}

function toBannerTone(tone: "neutral" | "info" | "warn" | "danger") {
  return tone === "neutral" ? "info" : tone;
}

function toPillTone(tone: "neutral" | "info" | "warn" | "danger") {
  return tone === "neutral" ? "accent" : tone;
}

function buildNotificationActions(
  data: NotificationsPageData,
  rowCount: number,
): NotificationPageActions {
  const runtimeActions =
    isNotificationPreferencesRuntime(data.preferences) &&
    Array.isArray(data.preferences.availableActions)
      ? data.preferences.availableActions
      : [];

  const saveAction =
    runtimeActions.find((action) => action.action === "update_subscription") ??
    ({
      action: "update_subscription",
      enabled: rowCount > 0,
      riskLevel: "medium",
    } satisfies ResourceActionDescriptor);

  const fallbackDeepLinks = [
    {
      action: "open_integration_governance",
      enabled: true,
      riskLevel: "low",
    },
    {
      action: "open_webhook_audit",
      enabled: true,
      riskLevel: "low",
    },
    {
      action: "open_platform_webhook_debug",
      enabled: true,
      riskLevel: "low",
    },
    {
      action: "open_webhooks",
      enabled: true,
      riskLevel: "low",
    },
  ] satisfies ResourceActionDescriptor[];

  const supportedDeepLinkActions = new Set([
    "open_integration_governance",
    "open_webhook_audit",
    "open_platform_webhook_debug",
    "open_webhooks",
    "configure_webhook",
  ]);

  const linkDescriptors =
    runtimeActions.filter((action) =>
      supportedDeepLinkActions.has(action.action),
    ).length > 0
      ? runtimeActions.filter((action) =>
          supportedDeepLinkActions.has(action.action),
        )
      : fallbackDeepLinks;

  const deepLinks = linkDescriptors.map((action) => {
    const href = resolveActionHref(action.action);
    const target =
      action.action === "open_webhook_audit" ||
      action.action === "open_platform_webhook_debug"
        ? ("_blank" as const)
        : ("_self" as const);

    return {
      ...action,
      label: resolveActionLabel(action.action),
      ...(href ? { href } : {}),
      ...(href ? { target } : {}),
    };
  });

  return { saveAction, deepLinks };
}

function buildRows(data: NotificationsPageData): NotificationMatrixRow[] {
  const webhookProvisioned = data.webhooks.length > 0;
  const matrixSource = data.preferences?.subscriptions.length
    ? data.preferences.subscriptions
    : (data.governance?.baselineNotificationSubscriptions ?? []);

  const byEvent = new Map<string, Map<NotificationChannel, boolean>>();
  for (const subscription of matrixSource) {
    const eventMap =
      byEvent.get(subscription.eventType) ??
      new Map<NotificationChannel, boolean>();
    eventMap.set(subscription.channel, subscription.enabled);
    byEvent.set(subscription.eventType, eventMap);
  }

  const eventTypes = new Set<string>([
    ...NOTIFICATION_EVENT_CATALOG.map((item) => item.eventType),
    ...byEvent.keys(),
  ]);

  return [...eventTypes].map((eventType) => {
    const meta = notificationLookup.get(eventType) ?? {
      eventType,
      description: "未在 handoff packet 建立說明，沿用 API 回傳事件碼。",
      defaultAudience: "review in ops / audit",
    };
    const eventMap = byEvent.get(eventType) ?? new Map();

    return {
      eventType,
      description: meta.description,
      defaultAudience: meta.defaultAudience,
      channels: {
        email: loadChannelState("email", eventMap, webhookProvisioned),
        webhook: loadChannelState("webhook", eventMap, webhookProvisioned),
        ops_console: loadChannelState(
          "ops_console",
          eventMap,
          webhookProvisioned,
        ),
      },
    };
  });
}

async function loadPageData(): Promise<NotificationsPageData> {
  const client = getTenantClient();
  const [preferences, governance, webhooks] = await Promise.allSettled([
    client.getNotificationPreferences() as Promise<TenantNotificationPreferences>,
    client.getTenantIntegrationGovernancePackage() as Promise<TenantIntegrationGovernancePackage>,
    client.listWebhooks() as Promise<TenantWebhookEndpoint[]>,
  ]);

  const errors: string[] = [];
  if (preferences.status === "rejected") {
    errors.push(`通知偏好: ${toErrorMessage(preferences.reason)}`);
  }
  if (governance.status === "rejected") {
    errors.push(`治理基線: ${toErrorMessage(governance.reason)}`);
  }
  if (webhooks.status === "rejected") {
    errors.push(`Webhook 端點: ${toErrorMessage(webhooks.reason)}`);
  }

  return {
    preferences: preferences.status === "fulfilled" ? preferences.value : null,
    governance: governance.status === "fulfilled" ? governance.value : null,
    webhooks: webhooks.status === "fulfilled" ? webhooks.value : [],
    errors,
  };
}

function renderActionLink(action: NotificationPageLink) {
  if (!action.href) {
    return (
      <span style={linkChipStyle}>
        {action.label}
        {!action.enabled && action.disabledReasonCode
          ? ` · ${action.disabledReasonCode}`
          : ""}
      </span>
    );
  }

  return (
    <Link
      href={action.href}
      target={action.target}
      rel={action.target === "_blank" ? "noreferrer" : undefined}
      style={{
        ...linkChipStyle,
        opacity: action.enabled ? 1 : 0.6,
        pointerEvents: action.enabled ? "auto" : "none",
      }}
    >
      {action.label}
    </Link>
  );
}

function toNotificationPageLink(
  action: ResourceActionDescriptor & {
    label?: string;
    href?: string;
    target?: "_blank" | "_self";
  },
): NotificationPageLink {
  const href = action.href ?? resolveActionHref(action.action);
  const target =
    action.target ??
    (action.action === "open_webhook_audit" ||
    action.action === "open_platform_webhook_debug"
      ? "_blank"
      : "_self");

  return {
    ...action,
    label: action.label ?? resolveActionLabel(action.action),
    ...(href ? { href } : {}),
    ...(href ? { target } : {}),
  };
}

export default async function NotificationsPage({
  searchParams,
}: NotificationsPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const previewReasonValue = resolvedSearchParams.emptyReason;
  const previewReason =
    typeof previewReasonValue === "string" &&
    emptyReasonKeys.includes(previewReasonValue as NotificationEmptyReason)
      ? (previewReasonValue as NotificationEmptyReason)
      : null;
  const data = await loadPageData();
  const rows = buildRows(data);
  const webhookProvisioned = data.webhooks.length > 0;
  const baselineCount =
    data.governance?.baselineNotificationSubscriptions.length ?? 0;
  const customRouteCount = data.preferences?.subscriptions.length ?? 0;
  const usesBaseline = customRouteCount === 0;
  const { saveAction, deepLinks } = buildNotificationActions(data, rows.length);
  const runtimePreferences = isNotificationPreferencesRuntime(data.preferences)
    ? data.preferences
    : null;
  const freshness =
    typeof resolvedSearchParams.freshness === "string"
      ? resolvedSearchParams.freshness
      : (runtimePreferences?.refresh?.dataFreshness ??
        runtimePreferences?.dataFreshness ??
        "fresh");

  const derivedEmptyReason: NotificationEmptyReason | null =
    previewReason ??
    (runtimePreferences?.emptyState
      ?.reason as NotificationEmptyReason | null) ??
    (data.errors.length > 0 && rows.length === 0
      ? "fetch_failed"
      : rows.length === 0
        ? "no_data"
        : !webhookProvisioned
          ? "not_provisioned"
          : !saveAction.enabled && saveAction.disabledReasonCode
            ? "permission_denied"
            : null);
  const emptyStateAction = derivedEmptyReason
    ? runtimePreferences?.emptyState?.nextAction
      ? toNotificationPageLink(runtimePreferences.emptyState.nextAction)
      : EMPTY_REASON_COPY[derivedEmptyReason].action
        ? toNotificationPageLink(EMPTY_REASON_COPY[derivedEmptyReason].action)
        : null
    : null;
  const effectiveUpdatedAt =
    data.preferences?.updatedAt ??
    runtimePreferences?.refresh?.generatedAt ??
    runtimePreferences?.generatedAt ??
    data.governance?.generatedAt;
  const shouldRenderEmptyBody =
    rows.length === 0 &&
    derivedEmptyReason !== null &&
    derivedEmptyReason !== "not_provisioned" &&
    derivedEmptyReason !== "permission_denied";

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="通知偏好"
        subtitle="決定哪些 event 經由哪些 channel 送出 · per-event × per-channel 矩陣"
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <CanvasPill theme={th} tone="accent">
              T5 · slow refresh
            </CanvasPill>
            <CanvasPill
              theme={th}
              tone={freshness === "fresh" ? "success" : "warn"}
              dot
            >
              dataFreshness={freshness}
            </CanvasPill>
          </div>
        }
      />

      <div style={pageBodyStyle}>
        {freshness !== "fresh" ? (
          <CanvasBanner
            theme={th}
            tone={freshness === "degraded" ? "danger" : "warn"}
            icon="clock"
            title={freshness === "degraded" ? "資料來源降級" : "資料已過時"}
            body={`Refresh tier = T5。請以 /audit 與跨 app delivery trace 為準。`}
          />
        ) : null}

        {data.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分通知資料無法載入"
            body={data.errors.join(" · ")}
          />
        ) : null}

        {derivedEmptyReason ? (
          <CanvasBanner
            theme={th}
            tone={toBannerTone(EMPTY_REASON_COPY[derivedEmptyReason].tone)}
            icon={
              derivedEmptyReason === "fetch_failed"
                ? "warn"
                : derivedEmptyReason === "not_provisioned"
                  ? "warn"
                  : "info"
            }
            title={EMPTY_REASON_COPY[derivedEmptyReason].title}
            body={
              emptyStateAction
                ? `${EMPTY_REASON_COPY[derivedEmptyReason].body} · 下一步：${emptyStateAction.label}`
                : EMPTY_REASON_COPY[derivedEmptyReason].body
            }
          />
        ) : null}

        <div style={metaRowStyle}>
          <CanvasPill theme={th} tone={usesBaseline ? "neutral" : "accent"} dot>
            {usesBaseline ? "all_defaults" : "custom_configuration"}
          </CanvasPill>
          <CanvasPill
            theme={th}
            tone={webhookProvisioned ? "success" : "warn"}
            dot
          >
            webhook {webhookProvisioned ? "provisioned" : "not_provisioned"}
          </CanvasPill>
          <CanvasPill
            theme={th}
            tone={saveAction.enabled ? "success" : "warn"}
            dot
          >
            update_subscription {saveAction.enabled ? "enabled" : "disabled"}
          </CanvasPill>
        </div>

        <CanvasCard theme={th} title="通知矩陣" subtitle="event type × channel">
          <CanvasDL
            theme={th}
            cols={4}
            items={[
              { k: "Tenant", v: DEMO_TENANT_ID, mono: true },
              {
                k: "Last updated",
                v: formatDateTime(effectiveUpdatedAt),
              },
              { k: "Custom routes", v: String(customRouteCount), mono: true },
              { k: "Baseline routes", v: String(baselineCount), mono: true },
            ]}
          />
          <div style={{ height: 12 }} />
          {shouldRenderEmptyBody ? (
            <div style={emptyStateCardStyle}>
              <CanvasPill
                theme={th}
                tone={toPillTone(EMPTY_REASON_COPY[derivedEmptyReason].tone)}
                dot
              >
                {derivedEmptyReason}
              </CanvasPill>
              <div style={{ fontSize: 15, fontWeight: 600 }}>
                {EMPTY_REASON_COPY[derivedEmptyReason].title}
              </div>
              <div style={emptyStateBodyStyle}>
                {EMPTY_REASON_COPY[derivedEmptyReason].body}
              </div>
              {emptyStateAction ? renderActionLink(emptyStateAction) : null}
            </div>
          ) : (
            <NotificationMatrixForm
              rows={rows}
              saveAction={saveAction}
              action={updateNotificationPreferencesAction}
            />
          )}
        </CanvasCard>

        <div style={supportGridStyle}>
          <CanvasCard
            theme={th}
            title="Cross-app deep links"
            subtitle="delivery trace opens in authority lane"
          >
            <div style={linkRowStyle}>
              {deepLinks.map((action) => (
                <div key={action.action}>{renderActionLink(action)}</div>
              ))}
            </div>
            <div style={{ ...helperTextStyle, marginTop: 12 }}>
              `webhook.delivery_failed` 與 degraded trace 需直接跳到 ops /
              platform authority，不在 tenant-console 混做調查。
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="State contract"
            subtitle="Q-X15 empty reasons + tenant notification posture"
          >
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <div style={{ ...helperTextStyle, marginBottom: 8 }}>
                  Supported EmptyReason values
                </div>
                <div style={linkRowStyle}>
                  {emptyReasonKeys.map((reason) => (
                    <CanvasPill
                      key={reason}
                      theme={th}
                      tone={
                        derivedEmptyReason === reason
                          ? toPillTone(EMPTY_REASON_COPY[reason].tone)
                          : "neutral"
                      }
                      dot={derivedEmptyReason === reason}
                    >
                      {reason}
                    </CanvasPill>
                  ))}
                </div>
              </div>
              <div style={helperTextStyle}>
                Entry from sidebar or `/integration-governance`. Custom routes
                stay machine-driven by `availableActions`; webhook authority and
                degraded delivery investigation always deep-link out of this
                page.
              </div>
              <div style={{ ...helperTextStyle, ...monoStyle }}>
                Preview override:
                /notifications?emptyReason=no_data&freshness=stale
              </div>
            </div>
          </CanvasCard>
        </div>
      </div>
    </div>
  );
}
