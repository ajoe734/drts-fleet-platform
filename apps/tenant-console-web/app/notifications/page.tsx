import type { CSSProperties, ReactNode } from "react";
import type {
  ResourceActionDescriptor,
  TenantIntegrationGovernancePackage,
  TenantNotificationPreferences,
  TenantNotificationSubscription,
  TenantWebhookEndpoint,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasIcon,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import {
  CANVAS_REFRESH_TIERS,
  CanvasToggle,
  type CanvasEmptyReason,
} from "@/lib/notification-canvas";
import { getTenantClient } from "@/lib/api-client";
import { getServerLocale } from "@/lib/server-locale";
import { type Locale, t } from "@/lib/translations";
import { NOTIFICATION_EVENT_CATALOG } from "./constants";

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

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

const contentGridStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 16,
  alignItems: "flex-start",
};

const matrixCardStyle: CSSProperties = {
  flex: "1.6 1 680px",
  minWidth: 0,
};

const sideCardStyle: CSSProperties = {
  flex: "1 1 320px",
  minWidth: 0,
};

const emptyCatalogStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};

const emptyCardStyle: CSSProperties = {
  border: `1px solid ${th.border}`,
  borderRadius: 8,
  padding: 12,
  background: th.bgRaised,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const emptyHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const emptyLabelStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
  fontSize: 12,
};

const emptyCodeStyle: CSSProperties = {
  color: th.textMuted,
  fontFamily: th.monoFamily,
  fontSize: 10.5,
};

const emptyHintStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
};

const tableEmptyStateStyle: CSSProperties = {
  padding: 24,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
};

const crossAppListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const crossAppItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  border: `1px solid ${th.border}`,
  borderRadius: 7,
  background: th.bgRaised,
  color: th.text,
  fontSize: 12,
  textDecoration: "none",
};

const matrixEventCellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const matrixEventCodeStyle: CSSProperties = {
  color: th.accent,
  fontFamily: th.monoFamily,
  fontWeight: 600,
  fontSize: 12,
};

const matrixEventDescStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.4,
};

const matrixCellStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const matrixNoteStyle: CSSProperties = {
  padding: "10px 14px 14px",
  color: th.textMuted,
  fontSize: 11.5,
};

const T5_TIER = CANVAS_REFRESH_TIERS.slow;

const NOTIFICATION_CHANNELS = ["email", "webhook", "ops_console"] as const;
type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

const EVENT_ORDER = [
  "booking.created",
  "booking.confirmed",
  "booking.cancelled",
  "booking.approval_required",
  "booking.approval_approved",
  "booking.approval_rejected",
  "invoice.ready",
  "webhook.delivery_failed",
  "quota.threshold_warning",
] as const;

type CrossAppLink = {
  labelKey: string;
  hintKey: string;
  href: string;
  targetApp: "tenant-console" | "ops-console" | "platform-admin";
  openMode: "new_tab" | "same_tab";
};

const CROSS_APP_LINKS: CrossAppLink[] = [
  {
    labelKey: "notifications.crossApp.integrationGovernance.label",
    hintKey: "notifications.crossApp.integrationGovernance.hint",
    href: "/integration-governance",
    targetApp: "tenant-console",
    openMode: "same_tab",
  },
  {
    labelKey: "notifications.crossApp.webhooks.label",
    hintKey: "notifications.crossApp.webhooks.hint",
    href: "/webhooks",
    targetApp: "tenant-console",
    openMode: "same_tab",
  },
  {
    labelKey: "notifications.crossApp.webhookDeliveries.label",
    hintKey: "notifications.crossApp.webhookDeliveries.hint",
    href: "/integrations/webhooks",
    targetApp: "platform-admin",
    openMode: "new_tab",
  },
];

type NotificationsPageData = {
  preferences: TenantNotificationPreferences | null;
  governance: TenantIntegrationGovernancePackage | null;
  webhookEndpoints: TenantWebhookEndpoint[];
  errors: string[];
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function formatUpdated(value: string | null | undefined, locale: Locale) {
  if (!value) return t("notifications.common.none", locale);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    return t("notifications.common.none", locale);
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-Hant" : "en", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function formatCount(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "zh" ? "zh-Hant" : "en").format(
    value,
  );
}

function getEmptyReasonTone(reason: CanvasEmptyReason): CanvasTone {
  switch (reason) {
    case "no_data":
      return "neutral";
    case "not_provisioned":
      return "warn";
    case "fetch_failed":
      return "danger";
    case "permission_denied":
      return "danger";
    case "external_unavailable":
      return "warn";
    case "filtered_empty":
      return "info";
    case "driver_not_eligible":
      return "neutral";
  }
}

function getEmptyReasonMeta(reason: CanvasEmptyReason, locale: Locale) {
  return {
    label: t(`notifications.emptyReason.${reason}.label`, locale),
    pill: t(`notifications.emptyReason.${reason}.pill`, locale),
    hint: t(`notifications.emptyReason.${reason}.hint`, locale),
  };
}

function getRefreshTierLabel(locale: Locale) {
  return t("notifications.refreshTier.slow.label", locale);
}

function getRefreshTierNote(locale: Locale) {
  return t("notifications.refreshTier.slow.note", locale);
}

function getRiskLabel(locale: Locale) {
  return t("notifications.risk.medium.label", locale);
}

function getRiskPattern(locale: Locale) {
  return t("notifications.risk.medium.pattern", locale);
}

async function loadNotificationsData(
  locale: Locale,
): Promise<NotificationsPageData> {
  const client = getTenantClient();
  const [preferencesResult, governanceResult, webhooksResult] =
    await Promise.allSettled([
      client.getNotificationPreferences() as Promise<TenantNotificationPreferences>,
      client.getTenantIntegrationGovernancePackage() as Promise<TenantIntegrationGovernancePackage>,
      client.listWebhooks() as Promise<TenantWebhookEndpoint[]>,
    ]);

  const errors: string[] = [];

  if (preferencesResult.status === "rejected") {
    errors.push(
      t("notifications.error.preferences", locale, {
        message: toErrorMessage(preferencesResult.reason),
      }),
    );
  }
  if (governanceResult.status === "rejected") {
    errors.push(
      t("notifications.error.governance", locale, {
        message: toErrorMessage(governanceResult.reason),
      }),
    );
  }
  if (webhooksResult.status === "rejected") {
    errors.push(
      t("notifications.error.webhooks", locale, {
        message: toErrorMessage(webhooksResult.reason),
      }),
    );
  }

  return {
    preferences:
      preferencesResult.status === "fulfilled" ? preferencesResult.value : null,
    governance:
      governanceResult.status === "fulfilled" ? governanceResult.value : null,
    webhookEndpoints:
      webhooksResult.status === "fulfilled" ? webhooksResult.value : [],
    errors,
  };
}

function buildSubscriptionIndex(
  subscriptions: TenantNotificationSubscription[],
) {
  const index = new Map<string, Map<NotificationChannel, boolean>>();
  for (const subscription of subscriptions) {
    if (
      !(NOTIFICATION_CHANNELS as readonly string[]).includes(
        subscription.channel,
      )
    ) {
      continue;
    }
    if (!index.has(subscription.eventType)) {
      index.set(subscription.eventType, new Map());
    }
    index
      .get(subscription.eventType)
      ?.set(subscription.channel as NotificationChannel, subscription.enabled);
  }
  return index;
}

type MatrixRow = Record<string, unknown> & {
  eventType: string;
  description: string;
  cells: Record<
    NotificationChannel,
    "enabled" | "disabled" | "not_provisioned"
  >;
};

function buildMatrixRows(
  primary: Map<string, Map<NotificationChannel, boolean>>,
  fallback: Map<string, Map<NotificationChannel, boolean>>,
  unavailableChannels: Set<NotificationChannel>,
  locale: Locale,
): MatrixRow[] {
  const eventTypes = new Set<string>(EVENT_ORDER);
  for (const eventType of primary.keys()) eventTypes.add(eventType);
  for (const eventType of fallback.keys()) eventTypes.add(eventType);

  const order = (eventType: string) => {
    const idx = (EVENT_ORDER as readonly string[]).indexOf(eventType);
    return idx === -1 ? EVENT_ORDER.length : idx;
  };

  return Array.from(eventTypes)
    .sort((left, right) => {
      const cmp = order(left) - order(right);
      if (cmp !== 0) return cmp;
      return left.localeCompare(right, "en");
    })
    .map((eventType) => {
      const cells = {} as MatrixRow["cells"];
      for (const channel of NOTIFICATION_CHANNELS) {
        if (unavailableChannels.has(channel)) {
          cells[channel] = "not_provisioned";
          continue;
        }
        const value =
          primary.get(eventType)?.get(channel) ??
          fallback.get(eventType)?.get(channel) ??
          false;
        cells[channel] = value ? "enabled" : "disabled";
      }
      return {
        eventType,
        description:
          t(
            NOTIFICATION_EVENT_CATALOG.find(
              (item) => item.eventType === eventType,
            )?.descriptionKey ?? "notifications.common.none",
            locale,
          ) ?? t("notifications.common.none", locale),
        cells,
      };
    });
}

const UPDATE_SUBSCRIPTION_ACTION = "update_subscription";

/**
 * Resolve the save CTA descriptor strictly from the backend-provided
 * `availableActions` (Q-X13 / packet §5.8). The UI must never synthesize an
 * enabled write affordance from role or data presence — when the backend does
 * not grant `update_subscription`, the CTA stays disabled with a reason code so
 * the screen cannot expose an unauthorized write path.
 */
function deriveUpdateAction(
  preferences: TenantNotificationPreferences | null,
  hasError: boolean,
): ResourceActionDescriptor {
  if (hasError) {
    return {
      action: UPDATE_SUBSCRIPTION_ACTION,
      enabled: false,
      disabledReasonCode: "fetch_failed",
      riskLevel: "medium",
    };
  }
  if (preferences === null) {
    return {
      action: UPDATE_SUBSCRIPTION_ACTION,
      enabled: false,
      disabledReasonCode: "not_provisioned",
      riskLevel: "medium",
    };
  }
  const granted = preferences.availableActions?.find(
    (descriptor) => descriptor.action === UPDATE_SUBSCRIPTION_ACTION,
  );
  if (!granted) {
    // No descriptor → actor is not authorized to write. Show the affordance
    // disabled rather than hidden, per Q-X13 disabled-with-reason guidance.
    return {
      action: UPDATE_SUBSCRIPTION_ACTION,
      enabled: false,
      disabledReasonCode: "permission_denied",
      riskLevel: "medium",
    };
  }
  return {
    ...granted,
    riskLevel: granted.riskLevel ?? "medium",
  };
}

/**
 * The active empty-state is derived from the page's own load outcome, returning
 * only a fixed set of contract literals ("fetch_failed" | "not_provisioned" |
 * "no_data"). It never casts a raw backend `emptyState.reason` into the tenant
 * enum, so no out-of-set value (e.g. a driver-app `driver_not_eligible`) can
 * reach an unguarded lookup.
 */
function deriveActiveEmptyReason(
  data: NotificationsPageData,
  locale: Locale,
): {
  reason: CanvasEmptyReason;
  detail: string;
} | null {
  if (data.errors.length > 0 && data.preferences === null) {
    return {
      reason: "fetch_failed",
      detail: t("notifications.activeState.fetchFailed", locale),
    };
  }
  if (data.preferences === null && data.governance === null) {
    return {
      reason: "not_provisioned",
      detail: t("notifications.activeState.notProvisioned", locale),
    };
  }
  if (
    data.preferences === null &&
    (data.governance?.baselineNotificationSubscriptions?.length ?? 0) === 0
  ) {
    return {
      reason: "no_data",
      detail: t("notifications.activeState.noData", locale),
    };
  }
  return null;
}

export default async function NotificationsPage() {
  const locale = await getServerLocale();
  const data = await loadNotificationsData(locale);
  const subscriptions = data.preferences?.subscriptions ?? [];
  const baselineSubscriptions =
    data.governance?.baselineNotificationSubscriptions ?? [];

  const primaryIndex = buildSubscriptionIndex(subscriptions);
  const baselineIndex = buildSubscriptionIndex(baselineSubscriptions);

  const webhookEndpoints = data.webhookEndpoints;
  const activeWebhookEndpoints = webhookEndpoints.filter(
    (endpoint) => endpoint.status === "active",
  ).length;
  const webhookChannelProvisioned = webhookEndpoints.length > 0;
  const unavailableChannels = new Set<NotificationChannel>();
  if (!webhookChannelProvisioned) {
    unavailableChannels.add("webhook");
  }

  const matrixRows = buildMatrixRows(
    primaryIndex,
    baselineIndex,
    unavailableChannels,
    locale,
  );

  const enabledCount = matrixRows.reduce(
    (total, row) =>
      total +
      NOTIFICATION_CHANNELS.reduce(
        (cellTotal, channel) =>
          cellTotal + (row.cells[channel] === "enabled" ? 1 : 0),
        0,
      ),
    0,
  );
  const totalCells = matrixRows.length * NOTIFICATION_CHANNELS.length;
  const overridesCount = subscriptions.length;
  const hasCustomConfiguration = overridesCount > 0;

  const updateAction = deriveUpdateAction(
    data.preferences,
    data.errors.length > 0,
  );
  const activeEmptyReason = deriveActiveEmptyReason(data, locale);

  const headerSubtitle = t("notifications.header.subtitle", locale, {
    code: T5_TIER.code,
    note: getRefreshTierNote(locale),
  });

  const channelEnabledByChannel: Record<NotificationChannel, number> = {
    email: 0,
    webhook: 0,
    ops_console: 0,
  };
  for (const row of matrixRows) {
    for (const channel of NOTIFICATION_CHANNELS) {
      if (row.cells[channel] === "enabled") {
        channelEnabledByChannel[channel] += 1;
      }
    }
  }

  // CanvasTable is a "use client" component, so columns must reference cells by
  // key (`k`) rather than carry `r:` render functions — functions cannot cross
  // the server→client boundary. Pre-render each cell into the row data below.
  const matrixColumns: CanvasTableColumn<MatrixRow>[] = [
    {
      h: t("notifications.table.column.eventType", locale),
      w: 240,
      k: "c_event",
    },
    ...NOTIFICATION_CHANNELS.map<CanvasTableColumn<MatrixRow>>((channel) => ({
      h: t(`notifications.channel.${channel}` as const, locale),
      w: 160,
      k: `c_${channel}`,
    })),
  ];
  const displayRows: MatrixRow[] = matrixRows.map((row) => {
    const cellNodes: Record<string, ReactNode> = {
      c_event: (
        <div style={matrixEventCellStyle}>
          <span style={matrixEventCodeStyle}>{row.eventType}</span>
          <span style={matrixEventDescStyle}>{row.description}</span>
        </div>
      ),
    };
    for (const channel of NOTIFICATION_CHANNELS) {
      const cell = row.cells[channel];
      cellNodes[`c_${channel}`] =
        cell === "not_provisioned" ? (
          <CanvasPill theme={th} tone="neutral">
            <CanvasIcon name="x" size={10} />
            {t("notifications.channel.notProvisioned", locale)}
          </CanvasPill>
        ) : (
          <span style={matrixCellStyle}>
            <CanvasToggle
              theme={th}
              on={cell === "enabled"}
              label={t(
                cell === "enabled"
                  ? "notifications.toggle.on"
                  : "notifications.toggle.off",
                locale,
              )}
            />
          </span>
        );
    }
    return { ...row, ...cellNodes };
  });

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title={t("notifications.header.title", locale)}
        subtitle={headerSubtitle}
        actions={
          <>
            <CanvasBtn theme={th} icon="ext" size="sm">
              {t("notifications.header.schema", locale)}
            </CanvasBtn>
            <CanvasBtn
              theme={th}
              variant="primary"
              icon="check"
              size="sm"
              disabled={!updateAction.enabled}
            >
              {t("notifications.header.save", locale)}
            </CanvasBtn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {data.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title={t("notifications.banner.partialFailure.title", locale)}
            body={data.errors.join(" · ")}
          />
        ) : null}

        {!webhookChannelProvisioned ? (
          <CanvasBanner
            theme={th}
            tone="info"
            icon="info"
            title={t(
              "notifications.banner.webhookNotProvisioned.title",
              locale,
            )}
            body={t("notifications.banner.webhookNotProvisioned.body", locale)}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label={t("notifications.kpi.events.label", locale)}
            value={formatCount(matrixRows.length, locale)}
            sub={t("notifications.kpi.events.sub", locale)}
          />
          <CanvasKPI
            theme={th}
            label={t("notifications.kpi.subscriptions.label", locale)}
            value={`${formatCount(enabledCount, locale)} / ${formatCount(totalCells, locale)}`}
            sub={
              hasCustomConfiguration
                ? t("notifications.kpi.subscriptions.custom", locale, {
                    count: formatCount(overridesCount, locale),
                  })
                : t("notifications.kpi.subscriptions.baseline", locale)
            }
          />
          <CanvasKPI
            theme={th}
            label={t("notifications.kpi.webhooks.label", locale)}
            value={formatCount(activeWebhookEndpoints, locale)}
            sub={
              webhookChannelProvisioned
                ? t("notifications.kpi.webhooks.active", locale)
                : t("notifications.kpi.webhooks.notProvisioned", locale)
            }
          />
          <CanvasKPI
            theme={th}
            label={t("notifications.kpi.updated.label", locale)}
            value={formatUpdated(data.preferences?.updatedAt, locale)}
            sub={
              hasCustomConfiguration
                ? t("notifications.state.customConfiguration", locale)
                : t("notifications.state.allDefaults", locale)
            }
          />
        </div>

        <div style={contentGridStyle}>
          <CanvasCard
            theme={th}
            title={t("notifications.matrix.title", locale)}
            subtitle={t("notifications.matrix.subtitle", locale, {
              count: NOTIFICATION_CHANNELS.length,
              risk: getRiskLabel(locale),
              pattern: getRiskPattern(locale),
            })}
            padding={0}
            style={matrixCardStyle}
          >
            {matrixRows.length > 0 ? (
              <>
                <CanvasTable<MatrixRow>
                  theme={th}
                  columns={matrixColumns}
                  rows={displayRows}
                />
                <div style={matrixNoteStyle}>
                  {hasCustomConfiguration
                    ? t("notifications.matrix.note.custom", locale, {
                        count: formatCount(overridesCount, locale),
                        updatedAt: formatUpdated(
                          data.preferences?.updatedAt,
                          locale,
                        ),
                      })
                    : t("notifications.matrix.note.baseline", locale, {
                        generatedAt: formatUpdated(
                          data.governance?.generatedAt,
                          locale,
                        ),
                      })}
                </div>
              </>
            ) : (
              <div style={tableEmptyStateStyle}>
                {t("notifications.matrix.empty", locale)}
              </div>
            )}
          </CanvasCard>

          <CanvasCard
            theme={th}
            title={t("notifications.summary.title", locale)}
            subtitle={t("notifications.summary.subtitle", locale)}
            style={sideCardStyle}
          >
            <CanvasDL
              theme={th}
              cols={1}
              items={[
                {
                  k: t("notifications.summary.variant", locale),
                  v: hasCustomConfiguration
                    ? t("notifications.state.customConfiguration", locale)
                    : t("notifications.state.allDefaults", locale),
                  mono: true,
                },
                {
                  k: t("notifications.summary.refreshTier", locale),
                  v: `${T5_TIER.code} · ${getRefreshTierLabel(locale)}`,
                  mono: true,
                },
                {
                  k: t("notifications.summary.specRef", locale),
                  v: t("notifications.summary.specRefValue", locale),
                  mono: true,
                },
                {
                  k: t("notifications.summary.risk", locale),
                  v: `${getRiskLabel(locale)} · ${getRiskPattern(locale)}`,
                  mono: true,
                },
                {
                  k: t("notifications.summary.action", locale),
                  v: updateAction.enabled
                    ? t("notifications.summary.actionEnabled", locale)
                    : t("notifications.summary.actionDisabled", locale, {
                        code:
                          updateAction.disabledReasonCode ??
                          t("notifications.summary.blocked", locale),
                      }),
                  mono: true,
                },
                {
                  k: t("notifications.summary.emailSubscriptions", locale),
                  v: `${formatCount(channelEnabledByChannel.email, locale)} / ${formatCount(matrixRows.length, locale)}`,
                  mono: true,
                },
                {
                  k: t("notifications.summary.webhookSubscriptions", locale),
                  v: webhookChannelProvisioned
                    ? `${formatCount(channelEnabledByChannel.webhook, locale)} / ${formatCount(matrixRows.length, locale)}`
                    : t("notifications.channel.notProvisioned", locale),
                  mono: true,
                },
                {
                  k: t("notifications.summary.opsConsoleSubscriptions", locale),
                  v: `${formatCount(channelEnabledByChannel.ops_console, locale)} / ${formatCount(matrixRows.length, locale)}`,
                  mono: true,
                },
              ]}
            />
            {activeEmptyReason ? (
              <div style={{ marginTop: 12 }}>
                <CanvasBanner
                  theme={th}
                  tone={
                    getEmptyReasonTone(activeEmptyReason.reason) === "neutral"
                      ? "info"
                      : (getEmptyReasonTone(
                          activeEmptyReason.reason,
                        ) as Exclude<CanvasTone, "neutral">)
                  }
                  icon={
                    activeEmptyReason.reason === "fetch_failed"
                      ? "warn"
                      : activeEmptyReason.reason === "permission_denied"
                        ? "lock"
                        : "info"
                  }
                  title={t("notifications.summary.currentState", locale, {
                    state: getEmptyReasonMeta(activeEmptyReason.reason, locale)
                      .label,
                  })}
                  body={activeEmptyReason.detail}
                />
              </div>
            ) : null}
          </CanvasCard>
        </div>

        <CanvasCard
          theme={th}
          title={t("notifications.emptyCatalog.title", locale)}
          subtitle={t("notifications.emptyCatalog.subtitle", locale)}
        >
          <div style={emptyCatalogStyle}>
            {/*
             * Tenant-console catalog renders 6 EmptyReason states per acceptance.
             * The 7th contract value, `driver_not_eligible`, is a driver-app-only
             * state and is intentionally omitted here. The display map
             * (`CANVAS_EMPTY_REASONS`) is still a complete `Record<EmptyReason,…>`
             * so any reason key resolves safely; nothing casts a runtime value
             * into this list, so there is no out-of-range / crash path.
             */}
            {(
              [
                "no_data",
                "not_provisioned",
                "fetch_failed",
                "permission_denied",
                "external_unavailable",
                "filtered_empty",
              ] as const
            ).map((reason) => {
              const meta = getEmptyReasonMeta(reason, locale);
              const tone = getEmptyReasonTone(reason);
              const isActive = activeEmptyReason?.reason === reason;
              return (
                <div
                  key={reason}
                  style={{
                    ...emptyCardStyle,
                    borderColor: isActive ? th.accent : th.border,
                    boxShadow: isActive ? `0 0 0 1px ${th.accent}` : undefined,
                  }}
                >
                  <div style={emptyHeaderStyle}>
                    <CanvasPill theme={th} tone={tone} dot>
                      {meta.pill}
                    </CanvasPill>
                    {isActive ? (
                      <CanvasPill theme={th} tone="accent">
                        {t("notifications.emptyCatalog.active", locale)}
                      </CanvasPill>
                    ) : null}
                  </div>
                  <span style={emptyLabelStyle}>{meta.label}</span>
                  <span style={emptyCodeStyle}>{reason}</span>
                  <span style={emptyHintStyle}>{meta.hint}</span>
                </div>
              );
            })}
          </div>
        </CanvasCard>

        <CanvasCard
          theme={th}
          title={t("notifications.crossApp.title", locale)}
          subtitle={t("notifications.crossApp.subtitle", locale)}
        >
          <div style={crossAppListStyle}>
            {CROSS_APP_LINKS.map((link) => (
              <a
                key={`${link.targetApp}:${link.href}`}
                href={link.href}
                style={crossAppItemStyle}
                {...(link.openMode === "new_tab"
                  ? { target: "_blank", rel: "noreferrer noopener" }
                  : {})}
              >
                <CanvasIcon
                  name={link.openMode === "new_tab" ? "ext" : "arrow"}
                  size={13}
                />
                <span style={{ fontWeight: 600 }}>
                  {t(link.labelKey, locale)}
                </span>
                <CanvasPill theme={th} tone="neutral">
                  {link.targetApp}
                </CanvasPill>
                <span style={{ color: th.textMuted, fontSize: 11.5 }}>
                  {t(link.hintKey, locale)}
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontFamily: th.monoFamily,
                    color: th.textMuted,
                    fontSize: 11,
                  }}
                >
                  {t(
                    link.openMode === "new_tab"
                      ? "notifications.crossApp.newTab"
                      : "notifications.crossApp.inApp",
                    locale,
                  )}
                </span>
              </a>
            ))}
          </div>
        </CanvasCard>
      </div>
    </div>
  );
}
