import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  EmptyReason,
  IdentityContext,
  ResourceActionDescriptor,
  TenantIntegrationGovernancePackage,
  TenantNotificationPreferences,
  TenantWebhookEndpoint,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasDL,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { NotificationPreferencesEditor } from "./notification-preferences-editor";
import {
  buildMatrixRows,
  buildNotificationLinks,
  countCustomSubscriptions,
  createRefreshMetadata,
  deriveEmptyReason,
  EMPTY_REASON_META,
  NOTIFICATION_EMPTY_REASONS,
  resolveNotificationAction,
} from "./notification-preferences-model";

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
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

type NotificationsPageData = {
  identity: IdentityContext | null;
  preferences: NotificationPreferencesRecord | null;
  governance: TenantIntegrationGovernancePackage | null;
  webhooks: TenantWebhookEndpoint[];
  errors: string[];
  generatedAt: string;
};

type NotificationPreferencesRecord = TenantNotificationPreferences & {
  availableActions?: ResourceActionDescriptor[];
};

async function loadNotificationsPageData(): Promise<NotificationsPageData> {
  const client = getTenantClient();
  const [identityResult, preferencesResult, governanceResult, webhooksResult] =
    await Promise.allSettled([
      client.getIdentityContext() as Promise<IdentityContext>,
      client.getNotificationPreferences() as Promise<NotificationPreferencesRecord>,
      client.getTenantIntegrationGovernancePackage() as Promise<TenantIntegrationGovernancePackage>,
      client.listWebhooks() as Promise<TenantWebhookEndpoint[]>,
    ]);

  const errors: string[] = [];

  for (const [label, result] of [
    ["Identity", identityResult],
    ["Notification preferences", preferencesResult],
    ["Integration governance", governanceResult],
    ["Webhooks", webhooksResult],
  ] as const) {
    if (result.status === "rejected") {
      errors.push(
        `${label}: ${result.reason instanceof Error ? result.reason.message : "Unknown error"}`,
      );
    }
  }

  return {
    identity:
      identityResult.status === "fulfilled" ? identityResult.value : null,
    preferences:
      preferencesResult.status === "fulfilled" ? preferencesResult.value : null,
    governance:
      governanceResult.status === "fulfilled" ? governanceResult.value : null,
    webhooks: webhooksResult.status === "fulfilled" ? webhooksResult.value : [],
    errors,
    generatedAt:
      (preferencesResult.status === "fulfilled"
        ? preferencesResult.value.updatedAt
        : null) ??
      (governanceResult.status === "fulfilled"
        ? governanceResult.value.generatedAt
        : null) ??
      new Date().toISOString(),
  };
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await loadNotificationsPageData();
  const params = (await searchParams) ?? {};
  const requestedEmptyReason = parseEmptyReason(params.empty);
  const query = getSingleParam(params.q)?.trim().toLowerCase() ?? "";
  const tenantId =
    data.identity?.tenantId ?? data.preferences?.tenantId ?? "tenant-demo-001";
  const canUpdate =
    data.identity?.actorType === "tenant_admin" ||
    data.identity?.roles?.includes("tc_admin") ||
    data.identity?.roles?.includes("tc_integration_mgr") ||
    false;
  const action = resolveNotificationAction(data.preferences, canUpdate);
  const baselineSubscriptions =
    data.governance?.baselineNotificationSubscriptions ?? [];
  const hasExplicitPreferences =
    (data.preferences?.subscriptions.length ?? 0) > 0;
  const currentSubscriptions = hasExplicitPreferences
    ? (data.preferences?.subscriptions ?? [])
    : baselineSubscriptions;
  const matrixRows = buildMatrixRows(currentSubscriptions);
  const filteredRows = matrixRows.filter((row) =>
    query.length === 0
      ? true
      : `${row.eventType} ${row.description} ${row.defaultAudience}`
          .toLowerCase()
          .includes(query),
  );
  const refreshMetadata = createRefreshMetadata(
    data.generatedAt,
    data.errors.length > 0 ? "degraded" : "fresh",
  );
  const customCount = countCustomSubscriptions(
    currentSubscriptions,
    baselineSubscriptions,
  );
  const availability = {
    email: {
      ready: true,
      label: "ready",
      detail: "Email 為 baseline channel，直接依租戶收件設定送出。",
    },
    webhook: {
      ready: data.webhooks.length > 0,
      label: data.webhooks.length > 0 ? "ready" : "not_provisioned",
      detail:
        data.webhooks.length > 0
          ? `${data.webhooks.length} 個 endpoint 已可接收事件。`
          : "尚未建立任何 webhook endpoint，因此矩陣中的 webhook 欄位不可啟用。",
    },
    ops_console: {
      ready: true,
      label: "read_scoped",
      detail: "供 ops/dispatch 追蹤 tenant 相關事件，不等於 tenant inbox。",
    },
  };
  const activeEmptyReason = deriveEmptyReason({
    requestedReason: requestedEmptyReason,
    hasFetchError: data.errors.length > 0,
    action,
    hasWebhookChannel: availability.webhook.ready,
    hasFilteredRows: filteredRows.length > 0,
    usesBaselineDefaults:
      !hasExplicitPreferences && baselineSubscriptions.length > 0,
  });
  const deepLinks = buildNotificationLinks(tenantId);

  return (
    <>
      <CanvasPageHeader
        theme={th}
        title="通知偏好"
        subtitle="決定哪些 event 經由哪些 channel 送出，並清楚區分 baseline defaults、custom overrides 與未佈建 channel。"
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link
              href="/webhooks"
              style={{
                color: th.text,
                border: `1px solid ${th.border}`,
                background: th.surface,
                borderRadius: 7,
                padding: "7px 11px",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              webhook setup
            </Link>
            <Link
              href={deepLinks[1]?.href ?? "/audit"}
              target="_blank"
              rel="noreferrer noopener"
              style={{
                color: "#fff",
                border: `1px solid ${th.accent}`,
                background: th.accent,
                borderRadius: 7,
                padding: "7px 11px",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              delivery trace
            </Link>
          </div>
        }
      />

      <div style={pageBodyStyle}>
        {data.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="Page-critical dependencies degraded"
            body={data.errors.join(" | ")}
          />
        ) : null}

        {activeEmptyReason ? (
          <CanvasBanner
            theme={th}
            tone={
              EMPTY_REASON_META[activeEmptyReason]?.tone === "neutral"
                ? "info"
                : (EMPTY_REASON_META[activeEmptyReason]?.tone ?? "info")
            }
            icon="info"
            title={`EmptyReason preview · ${activeEmptyReason}`}
            body={EMPTY_REASON_META[activeEmptyReason]?.body ?? ""}
          />
        ) : null}

        <section style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="refresh tier"
            value="T5"
            sub="30s cadence"
            hint="UiRefreshMetadata"
          />
          <CanvasKPI
            theme={th}
            label="custom overrides"
            value={String(customCount)}
            sub="vs governance baseline"
            hint={`${currentSubscriptions.filter((item) => item.enabled).length} enabled routes`}
          />
          <CanvasKPI
            theme={th}
            label="channels ready"
            value={`${
              Object.values(availability).filter(
                (item: (typeof availability)[keyof typeof availability]) =>
                  item.ready,
              ).length
            }/3`}
            sub="email / webhook / ops_console"
            hint={availability.webhook.label}
          />
          <CanvasKPI
            theme={th}
            label="actor / realm"
            value={data.identity?.actorType ?? "unknown"}
            sub={data.identity?.realm ?? "tenant"}
            hint={tenantId}
          />
        </section>

        <CanvasCard
          theme={th}
          title="Current state"
          subtitle="Spec-driven state treatment for defaults, permission, provisioning, fetch health, and filter empties."
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(220px, 0.8fr) minmax(0, 1.2fr)",
              gap: 16,
            }}
          >
            <div style={{ display: "grid", gap: 8 }}>
              <CanvasPill
                theme={th}
                tone={
                  activeEmptyReason
                    ? EMPTY_REASON_META[activeEmptyReason]?.tone === "neutral"
                      ? "info"
                      : (EMPTY_REASON_META[activeEmptyReason]?.tone ?? "info")
                    : customCount > 0
                      ? "accent"
                      : "success"
                }
              >
                {activeEmptyReason ??
                  (customCount > 0 ? "custom_configuration" : "all_defaults")}
              </CanvasPill>
              <strong style={{ fontSize: 14 }}>
                {activeEmptyReason
                  ? EMPTY_REASON_META[activeEmptyReason]?.title
                  : customCount > 0
                    ? "Custom configuration active"
                    : "All defaults from governance baseline"}
              </strong>
              <span style={{ color: th.textMuted, fontSize: 12.5 }}>
                {activeEmptyReason
                  ? EMPTY_REASON_META[activeEmptyReason]?.body
                  : customCount > 0
                    ? `${customCount} 個 route 已偏離 baseline，儲存時會產生 tenant_notifications audit receipt。`
                    : "目前沒有 tenant-specific override；矩陣直接反映 integration governance baseline。"}
              </span>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <CanvasPill theme={th} tone="neutral">
                  query: {query || "none"}
                </CanvasPill>
                <CanvasPill theme={th} tone="neutral">
                  rows: {filteredRows.length}/{matrixRows.length}
                </CanvasPill>
                <CanvasPill
                  theme={th}
                  tone={action.enabled ? "success" : "warn"}
                >
                  {action.enabled
                    ? "availableActions.update_subscription"
                    : `disabled:${action.disabledReasonCode ?? "permission_denied"}`}
                </CanvasPill>
              </div>
              <span style={{ color: th.textDim, fontSize: 12 }}>
                Entry follows packet §5.8: sidebar and `/integration-governance`
                adjacency. This page keeps the nearby webhook setup and audit
                investigation links visible even when the upstream route is
                owned by another task.
              </span>
            </div>
          </div>
        </CanvasCard>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.5fr) minmax(300px, 0.9fr)",
            gap: 16,
          }}
        >
          <CanvasCard
            theme={th}
            title="Notification matrix"
            subtitle="Per event type × channel matrix, aligned to the canvas artboard and packet §5.8."
          >
            <NotificationPreferencesEditor
              initialRows={matrixRows}
              visibleEventTypes={filteredRows.map((row) => row.eventType)}
              availability={availability}
              action={action}
              refreshMetadata={refreshMetadata}
              deepLinks={deepLinks}
              activeEmptyReason={activeEmptyReason}
            />
          </CanvasCard>

          <div style={{ display: "grid", gap: 16 }}>
            <CanvasCard
              theme={th}
              title="Current posture"
              subtitle="This side rail keeps must-show context visible while users tune the matrix."
            >
              <CanvasDL
                theme={th}
                cols={1}
                items={[
                  {
                    k: "tenant",
                    v: tenantId,
                    mono: true,
                  },
                  {
                    k: "updatedAt",
                    v: data.preferences?.updatedAt ?? "baseline defaults",
                    mono: true,
                  },
                  {
                    k: "generatedAt",
                    v: refreshMetadata.generatedAt,
                    mono: true,
                  },
                  {
                    k: "baseline subscriptions",
                    v: `${baselineSubscriptions.length} routes`,
                  },
                  {
                    k: "availableActions",
                    v: action.enabled
                      ? "update_subscription (medium)"
                      : `disabled · ${action.disabledReasonCode ?? "permission_denied"}`,
                  },
                  {
                    k: "entry",
                    v: "sidebar / integration-governance link",
                  },
                ]}
              />
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="Adjacencies"
              subtitle="Packet-required nearby flows and audit trace links."
            >
              <div style={{ display: "grid", gap: 10 }}>
                <CanvasPill theme={th} tone="accent">
                  /integration-governance → notification setup posture
                </CanvasPill>
                <CanvasPill theme={th} tone="info">
                  /webhooks → provision webhook channel
                </CanvasPill>
                <CanvasPill theme={th} tone="neutral">
                  /audit?resourceType=tenant_notifications
                </CanvasPill>
              </div>
            </CanvasCard>
          </div>
        </div>
      </div>
    </>
  );
}

function parseEmptyReason(
  value: string | string[] | undefined,
): EmptyReason | null {
  const raw = getSingleParam(value);
  return NOTIFICATION_EMPTY_REASONS.find((reason) => reason === raw) ?? null;
}

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
