import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  EmptyReason,
  IdentityContext,
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
  EMPTY_REASON_META,
  getNotificationAction,
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
  preferences: TenantNotificationPreferences | null;
  governance: TenantIntegrationGovernancePackage | null;
  webhooks: TenantWebhookEndpoint[];
  errors: string[];
  generatedAt: string;
};

async function loadNotificationsPageData(): Promise<NotificationsPageData> {
  const client = getTenantClient();
  const generatedAt = new Date().toISOString();
  const [identityResult, preferencesResult, governanceResult, webhooksResult] =
    await Promise.allSettled([
      client.getIdentityContext() as Promise<IdentityContext>,
      client.getNotificationPreferences() as Promise<TenantNotificationPreferences>,
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
    generatedAt,
  };
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await loadNotificationsPageData();
  const params = (await searchParams) ?? {};
  const activeEmptyReason = parseEmptyReason(params.empty);
  const tenantId =
    data.identity?.tenantId ?? data.preferences?.tenantId ?? "tenant-demo-001";
  const canUpdate =
    data.identity?.actorType === "tenant_admin" ||
    data.identity?.roles.includes("tc_admin") ||
    data.identity?.roles.includes("tc_integration_mgr") ||
    false;
  const action = getNotificationAction(canUpdate);
  const baselineSubscriptions =
    data.governance?.baselineNotificationSubscriptions ?? [];
  const currentSubscriptions = data.preferences?.subscriptions.length
    ? data.preferences.subscriptions
    : baselineSubscriptions;
  const matrixRows = buildMatrixRows(currentSubscriptions);
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
              href="/integration-governance"
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
              integration posture
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
  const raw = Array.isArray(value) ? value[0] : value;
  if (
    raw === "no_data" ||
    raw === "not_provisioned" ||
    raw === "fetch_failed" ||
    raw === "permission_denied" ||
    raw === "external_unavailable" ||
    raw === "filtered_empty"
  ) {
    return raw;
  }

  return null;
}
