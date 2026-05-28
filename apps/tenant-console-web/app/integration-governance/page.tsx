import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  CrossAppResourceLink,
  EmptyReason,
  ResourceActionDescriptor,
  TenantIntegrationReadinessItem,
  TenantIntegrationReadinessSummary,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const PLATFORM_ADMIN_URL = process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL;
const OPS_CONSOLE_URL = process.env.NEXT_PUBLIC_OPS_CONSOLE_URL;

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const panelGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: 16,
};

const readinessGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 12,
};

const secondaryGridStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
};

const emptyGalleryStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 12,
};

const monoStyle: CSSProperties = {
  fontFamily: th.monoFamily,
};

const mutedCopyStyle: CSSProperties = {
  margin: 0,
  color: th.textMuted,
  fontSize: 12.5,
  lineHeight: 1.55,
};

const cardFooterStyle: CSSProperties = {
  marginTop: 10,
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
};

const pillToneByStatus: Record<
  TenantIntegrationReadinessItem["status"],
  CanvasTone
> = {
  ready: "success",
  partial: "warn",
  blocked: "danger",
  not_provisioned: "neutral",
};

const subsystemOrder: TenantIntegrationReadinessItem["subSystem"][] = [
  "api_keys",
  "webhooks",
  "notifications",
  "sla",
  "reports",
  "modules",
  "partner_entries",
];

const subSystemMeta: Record<
  TenantIntegrationReadinessItem["subSystem"],
  {
    label: string;
    code: string;
    href: string;
    description: string;
    emptyReason?: EmptyReason;
  }
> = {
  api_keys: {
    label: "API keys",
    code: "api_keys",
    href: "/api-keys",
    description: "Active keys, expiry exposure, and scope coverage.",
  },
  webhooks: {
    label: "Webhooks",
    code: "webhooks",
    href: "/webhooks",
    description: "Endpoint health, delivery posture, and engine availability.",
  },
  notifications: {
    label: "Notifications routing",
    code: "notifications",
    href: "/settings#notifications",
    description: "Configured channels for inbox, email, and webhook routing.",
  },
  sla: {
    label: "SLA profile",
    code: "sla",
    href: "/settings#sla",
    description:
      "Wait, arrival, and completion thresholds published to the tenant.",
  },
  reports: {
    label: "Reports availability",
    code: "reports",
    href: "/reports",
    description: "Runnable jobs and artifact lane readiness.",
  },
  modules: {
    label: "Module enablement",
    code: "modules",
    href: "/settings",
    description: "Feature posture and module visibility for this tenant.",
  },
  partner_entries: {
    label: "Partner entries",
    code: "partner_entries",
    href: "/partner",
    description:
      "Partner-facing ingress posture when tenant-linked entries exist.",
    emptyReason: "not_provisioned",
  },
};

const emptyReasonMeta: Record<
  EmptyReason,
  {
    title: string;
    body: string;
    glyph: string;
    tone: CanvasTone;
    href: string;
    actionLabel: string;
  }
> = {
  no_data: {
    title: "No readiness data yet",
    body: "The tenant exists, but no readiness evidence has been published for this view yet.",
    glyph: "00",
    tone: "neutral",
    href: "/api-keys",
    actionLabel: "Start with API keys",
  },
  not_provisioned: {
    title: "First-time setup required",
    body: "This tenant has not been provisioned for one or more integration lanes yet.",
    glyph: "NP",
    tone: "warn",
    href: "/webhooks",
    actionLabel: "Set up first integration",
  },
  fetch_failed: {
    title: "Snapshot fetch failed",
    body: "The aggregated readiness endpoint did not return a usable snapshot for this request.",
    glyph: "FF",
    tone: "danger",
    href: "/integration-governance",
    actionLabel: "Retry snapshot",
  },
  permission_denied: {
    title: "Access is read-restricted",
    body: "The current actor can see the route shell but cannot read the readiness payload for this tenant.",
    glyph: "PD",
    tone: "danger",
    href: "/users",
    actionLabel: "Review tenant roles",
  },
  external_unavailable: {
    title: "External dependency unavailable",
    body: "One or more upstream services that feed the aggregated summary are degraded or offline.",
    glyph: "EX",
    tone: "warn",
    href: "/webhooks",
    actionLabel: "Inspect delivery posture",
  },
  filtered_empty: {
    title: "Current filter returns nothing",
    body: "The view is healthy, but the active filter leaves no subsystem cards in the result set.",
    glyph: "FX",
    tone: "info",
    href: "/integration-governance",
    actionLabel: "Clear filters",
  },
  driver_not_eligible: {
    title: "Driver-only reason not used here",
    body: "This reason exists globally but should never drive tenant integration governance.",
    glyph: "DN",
    tone: "neutral",
    href: "/integration-governance",
    actionLabel: "Back to readiness",
  },
};

type PageData = {
  summary: TenantIntegrationReadinessSummary | null;
  errors: string[];
};

function normalizeQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isEmptyReason(value: string | undefined): value is EmptyReason {
  return Boolean(
    value && value in emptyReasonMeta && value !== "driver_not_eligible",
  );
}

function toErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unknown integration readiness error.";
}

function getSubSystemMeta(
  subSystem: TenantIntegrationReadinessItem["subSystem"],
) {
  return subSystemMeta[subSystem]!;
}

function getEmptyReasonMeta(reason: EmptyReason) {
  return emptyReasonMeta[reason]!;
}

async function loadPageData(): Promise<PageData> {
  const client = getTenantClient();

  try {
    return {
      summary:
        (await client.getTenantIntegrationReadinessSummary()) as TenantIntegrationReadinessSummary,
      errors: [],
    };
  } catch (error) {
    return {
      summary: null,
      errors: [toErrorMessage(error)],
    };
  }
}

function getStatusLabel(status: TenantIntegrationReadinessItem["status"]) {
  return status.replace("_", " ");
}

function getStatusAccent(status: TenantIntegrationReadinessItem["status"]) {
  switch (status) {
    case "ready":
      return { background: th.successBg, color: th.success, glyph: "OK" };
    case "partial":
      return { background: th.warnBg, color: th.warn, glyph: "!" };
    case "blocked":
      return { background: th.dangerBg, color: th.danger, glyph: "X" };
    case "not_provisioned":
    default:
      return { background: th.surfaceLo, color: th.textMuted, glyph: "?" };
  }
}

function getStatusTone(
  status: TenantIntegrationReadinessItem["status"],
): CanvasTone {
  return pillToneByStatus[status] ?? "neutral";
}

function getActionHref(action: string, fallbackHref: string) {
  switch (action) {
    case "issue_api_key":
      return "/api-keys";
    case "create_webhook_endpoint":
      return "/webhooks";
    case "update_notifications":
      return "/settings#notifications";
    case "update_sla_profile":
      return "/settings#sla";
    case "create_report_job":
      return "/reports";
    default:
      return fallbackHref;
  }
}

function getActionLabel(action: string) {
  switch (action) {
    case "issue_api_key":
      return "Issue API key";
    case "create_webhook_endpoint":
      return "Set up webhook";
    case "update_notifications":
      return "Configure notifications";
    case "update_sla_profile":
      return "Configure SLA";
    case "create_report_job":
      return "Open reports";
    default:
      return action.replaceAll("_", " ");
  }
}

function actionButtonStyle(enabled: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 26,
    padding: "4px 10px",
    borderRadius: 999,
    border: `1px solid ${enabled ? th.accent : th.border}`,
    color: enabled ? "#ffffff" : th.textMuted,
    background: enabled ? th.accent : th.surface,
    textDecoration: "none",
    fontSize: 11.5,
    fontWeight: 600,
    pointerEvents: enabled ? "auto" : "none",
    opacity: enabled ? 1 : 0.78,
  };
}

function linkStyle(emphasis = false): CSSProperties {
  return {
    color: emphasis ? th.accentHi : th.accent,
    textDecoration: "none",
    fontSize: 12.5,
    fontWeight: emphasis ? 600 : 500,
  };
}

function buildCrossAppHref(link: CrossAppResourceLink) {
  const baseUrl =
    link.targetApp === "platform-admin" ? PLATFORM_ADMIN_URL : OPS_CONSOLE_URL;

  if (!baseUrl) {
    return null;
  }

  return `${baseUrl.replace(/\/$/, "")}${link.route}`;
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(parsed)
    .replace(",", "");
}

function dedupeActions(items: TenantIntegrationReadinessItem[]) {
  const seen = new Set<string>();
  const actions: Array<
    TenantIntegrationReadinessItem["nextAction"] & {
      href: string;
      source: string;
    }
  > = [];

  for (const item of items) {
    if (!item.nextAction || seen.has(item.nextAction.action)) {
      continue;
    }

    seen.add(item.nextAction.action);
    const meta = getSubSystemMeta(item.subSystem);
    actions.push({
      ...item.nextAction,
      href: getActionHref(item.nextAction.action, meta.href),
      source: meta.label,
    });
  }

  return actions;
}

function buildDisplayItems(items: TenantIntegrationReadinessItem[]) {
  const itemMap = new Map(items.map((item) => [item.subSystem, item]));

  return subsystemOrder.map((subSystem) => {
    const item = itemMap.get(subSystem);
    if (item) {
      return item;
    }

    const meta = getSubSystemMeta(subSystem);
    return {
      subSystem,
      status:
        meta.emptyReason === "not_provisioned" ? "not_provisioned" : "blocked",
      detail:
        meta.emptyReason === "not_provisioned"
          ? "No tenant-linked resource has been provisioned for this subsystem yet."
          : "The aggregated payload did not return this subsystem. Verify upstream readiness evidence.",
    } satisfies TenantIntegrationReadinessItem;
  });
}

function EmptyReasonCard({
  reason,
  selected = false,
}: {
  reason: EmptyReason;
  selected?: boolean;
}) {
  const meta = getEmptyReasonMeta(reason);

  return (
    <CanvasCard
      theme={th}
      style={{
        borderColor: selected ? th.accent : th.border,
        background: selected ? "rgba(20, 184, 166, 0.08)" : th.surface,
      }}
    >
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 12,
              border: `1px solid ${selected ? th.accentBorder : th.border}`,
              background:
                meta.tone === "danger"
                  ? th.dangerBg
                  : meta.tone === "warn"
                    ? th.warnBg
                    : meta.tone === "info"
                      ? "rgba(56, 189, 248, 0.12)"
                      : th.surfaceLo,
              color:
                meta.tone === "danger"
                  ? th.danger
                  : meta.tone === "warn"
                    ? th.warn
                    : meta.tone === "info"
                      ? "#38bdf8"
                      : th.textMuted,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              ...monoStyle,
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            {meta.glyph}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{meta.title}</div>
            <div style={{ fontSize: 10.5, color: th.textDim, ...monoStyle }}>
              {reason}
            </div>
          </div>
        </div>
        <p style={mutedCopyStyle}>{meta.body}</p>
        <Link href={`?emptyReason=${reason}`} style={linkStyle(true)}>
          {selected ? "Current variant" : "Preview this empty state"}
        </Link>
      </div>
    </CanvasCard>
  );
}

function renderActionLink(
  action: ResourceActionDescriptor,
  href: string,
  children: ReactNode,
) {
  return (
    <Link
      href={href}
      aria-disabled={!action.enabled}
      style={actionButtonStyle(action.enabled)}
    >
      {children}
    </Link>
  );
}

export default async function IntegrationGovernancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const forcedEmptyReason = normalizeQueryValue(
    resolvedSearchParams.emptyReason,
  );
  const previewEmptyReason = isEmptyReason(forcedEmptyReason)
    ? forcedEmptyReason
    : null;
  const data = previewEmptyReason
    ? { summary: null, errors: [] }
    : await loadPageData();
  const summary = data.summary;
  const items = buildDisplayItems(summary?.items ?? []);
  const readyCount = items.filter((item) => item.status === "ready").length;
  const gapCount = items.filter((item) => item.status !== "ready").length;
  const enabledActions = dedupeActions(items);
  const crossAppLinks: CrossAppResourceLink[] = summary
    ? [
        {
          targetApp: "platform-admin",
          route: `/tenant-governance?tenantId=${encodeURIComponent(summary.tenantId)}`,
          resourceType: "tenant",
          resourceId: summary.tenantId,
          openMode: "new_tab",
          label: "Open tenant governance in Platform Admin",
        },
        {
          targetApp: "ops-console",
          route: `/audit?tenantId=${encodeURIComponent(summary.tenantId)}&module=webhooks`,
          resourceType: "tenant_audit",
          resourceId: summary.tenantId,
          openMode: "new_tab",
          label: "Open webhook-linked audit lane in Ops Console",
        },
      ]
    : [];
  const selectedEmptyReason =
    previewEmptyReason ??
    (summary || data.errors.length === 0 ? null : "fetch_failed");
  const selectedEmptyMeta = getEmptyReasonMeta(
    selectedEmptyReason ?? "fetch_failed",
  );

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="Integration Governance"
        subtitle="aggregated readiness · 來自 GET /api/tenant/integration-governance/readiness (Q-TEN10 · 單一聚合 endpoint，非 6+ 個查詢)"
        actions={
          <>
            <CanvasPill theme={th} tone="success" dot>
              T5 slow
            </CanvasPill>
            <CanvasPill theme={th} tone={summary ? "success" : "neutral"} dot>
              {summary
                ? `${readyCount} of ${items.length} ready`
                : "Waiting for snapshot"}
            </CanvasPill>
          </>
        }
      />

      <div style={pageBodyStyle}>
        <CanvasBanner
          theme={th}
          tone="info"
          title="本頁只吃 1 個 aggregated endpoint"
          body="可操作 CTA 來自 aggregated readiness payload，頁面不自行 orchestrate 6+ 無關查詢。Refresh tier 採 tenant slow cadence，並保留明確 snapshot 時間。"
        />

        <div style={summaryGridStyle}>
          <CanvasKPI
            theme={th}
            label="Readiness"
            value={`${readyCount}/${items.length}`}
            delta={gapCount > 0 ? `${gapCount} gap` : "all green"}
            deltaTone={gapCount > 0 ? "down" : "up"}
            sub="Aggregated subsystem posture"
          />
          <CanvasKPI
            theme={th}
            label="Next actions"
            value={enabledActions.length}
            delta={enabledActions.length > 0 ? "availableActions" : "none"}
            deltaTone={enabledActions.length > 0 ? "neutral" : "up"}
            sub="Authority-driven drill targets"
          />
          <CanvasKPI
            theme={th}
            label="Refresh"
            value="T5"
            delta={summary ? "tenant slow" : "manual retry"}
            deltaTone="neutral"
            sub={
              summary
                ? formatDateTime(summary.computedAt)
                : "No snapshot loaded"
            }
          />
          <CanvasKPI
            theme={th}
            label="Partner entries"
            value={
              items.find((item) => item.subSystem === "partner_entries")
                ?.status === "not_provisioned"
                ? "none"
                : "tracked"
            }
            delta="cross-app aware"
            deltaTone="neutral"
            sub="Platform-admin handoff when needed"
          />
        </div>

        {selectedEmptyReason ? (
          <div style={panelGridStyle}>
            <CanvasCard theme={th}>
              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 16,
                      background:
                        selectedEmptyMeta.tone === "danger"
                          ? th.dangerBg
                          : selectedEmptyMeta.tone === "warn"
                            ? th.warnBg
                            : selectedEmptyMeta.tone === "info"
                              ? "rgba(56, 189, 248, 0.12)"
                              : th.surfaceLo,
                      color:
                        selectedEmptyMeta.tone === "danger"
                          ? th.danger
                          : selectedEmptyMeta.tone === "warn"
                            ? th.warn
                            : selectedEmptyMeta.tone === "info"
                              ? "#38bdf8"
                              : th.textMuted,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      ...monoStyle,
                      fontWeight: 700,
                    }}
                  >
                    {selectedEmptyMeta.glyph}
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                      {selectedEmptyMeta.title}
                    </h2>
                    <p style={{ margin: "6px 0 0", ...mutedCopyStyle }}>
                      {selectedEmptyMeta.body}
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <Link
                    href={selectedEmptyMeta.href}
                    style={actionButtonStyle(true)}
                  >
                    {selectedEmptyMeta.actionLabel}
                  </Link>
                  <Link href="/integration-governance" style={linkStyle()}>
                    Return to live snapshot
                  </Link>
                </div>

                {data.errors.length > 0 ? (
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: 12,
                      background: th.surfaceLo,
                      border: `1px solid ${th.border}`,
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    {data.errors.map((error) => (
                      <div
                        key={error}
                        style={{ ...mutedCopyStyle, ...monoStyle }}
                      >
                        {error}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </CanvasCard>

            <div style={secondaryGridStyle}>
              <CanvasCard theme={th}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    EmptyReason coverage
                  </div>
                  <p style={mutedCopyStyle}>
                    This route can preview all six tenant-relevant empty reasons
                    with
                    <span style={monoStyle}> ?emptyReason=&lt;reason&gt;</span>.
                  </p>
                </div>
              </CanvasCard>
              <div style={emptyGalleryStyle}>
                {(
                  [
                    "no_data",
                    "not_provisioned",
                    "fetch_failed",
                    "permission_denied",
                    "external_unavailable",
                    "filtered_empty",
                  ] as EmptyReason[]
                ).map((reason) => (
                  <EmptyReasonCard
                    key={reason}
                    reason={reason}
                    selected={reason === selectedEmptyReason}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div style={panelGridStyle}>
            <CanvasCard theme={th}>
              <div style={{ display: "grid", gap: 14 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      Readiness overview
                    </div>
                    <p style={{ marginTop: 6, ...mutedCopyStyle }}>
                      One aggregated payload renders all seven integration
                      lanes. The UI does not invent role authority and only
                      exposes follow-up CTAs when the backend returns an action
                      descriptor.
                    </p>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {enabledActions.length > 0 ? (
                      enabledActions.slice(0, 4).map((action) => (
                        <div
                          key={action.action}
                          style={{ display: "grid", gap: 4 }}
                        >
                          {renderActionLink(
                            action,
                            action.href,
                            getActionLabel(action.action),
                          )}
                          <span style={{ fontSize: 10.5, color: th.textDim }}>
                            {action.source}
                          </span>
                        </div>
                      ))
                    ) : (
                      <CanvasPill theme={th} tone="success" dot>
                        No follow-up action
                      </CanvasPill>
                    )}
                  </div>
                </div>

                <div style={readinessGridStyle}>
                  {items.map((item) => {
                    const meta = getSubSystemMeta(item.subSystem);
                    const accent = getStatusAccent(item.status);
                    const action = item.nextAction;
                    const href = action
                      ? getActionHref(action.action, meta.href)
                      : meta.href;

                    return (
                      <CanvasCard theme={th} key={item.subSystem}>
                        <div style={{ display: "grid", gap: 12 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 10,
                            }}
                          >
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 999,
                                background: accent.background,
                                color: accent.color,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 11.5,
                                fontWeight: 700,
                                ...monoStyle,
                                flexShrink: 0,
                              }}
                            >
                              {accent.glyph}
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>
                                {meta.label}
                              </div>
                              <div
                                style={{
                                  fontSize: 10.5,
                                  color: th.textDim,
                                  ...monoStyle,
                                }}
                              >
                                {meta.code}
                              </div>
                            </div>
                            <CanvasPill
                              theme={th}
                              tone={getStatusTone(item.status)}
                              dot
                            >
                              {getStatusLabel(item.status)}
                            </CanvasPill>
                          </div>

                          <p style={mutedCopyStyle}>
                            {item.detail ?? meta.description}
                          </p>

                          <div style={cardFooterStyle}>
                            <Link href={meta.href} style={linkStyle()}>
                              Open module
                            </Link>
                            {action
                              ? renderActionLink(
                                  action,
                                  href,
                                  `${getActionLabel(action.action)} ->`,
                                )
                              : null}
                          </div>

                          {!action?.enabled && action?.disabledReasonCode ? (
                            <div style={{ fontSize: 10.5, color: th.textDim }}>
                              disabled · {action.disabledReasonCode}
                            </div>
                          ) : null}
                        </div>
                      </CanvasCard>
                    );
                  })}
                </div>
              </div>
            </CanvasCard>

            <div style={secondaryGridStyle}>
              <CanvasCard theme={th}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    Refresh tier
                  </div>
                  <p style={mutedCopyStyle}>
                    Tenant slow cadence applies here. The UI keeps the tier
                    explicit instead of pretending state changes are instant.
                  </p>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ ...mutedCopyStyle, ...monoStyle }}>
                      cadence · T5 / tenant slow
                    </div>
                    <div style={{ ...mutedCopyStyle, ...monoStyle }}>
                      snapshot ·{" "}
                      {summary ? formatDateTime(summary.computedAt) : "—"}
                    </div>
                  </div>
                </div>
              </CanvasCard>

              <CanvasCard theme={th}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    Cross-app drill targets
                  </div>
                  <p style={mutedCopyStyle}>
                    Deep links leave tenant-console in a new tab when platform
                    or ops context owns the next investigation step.
                  </p>
                  <div style={{ display: "grid", gap: 8 }}>
                    {crossAppLinks.map((link) => {
                      const href = buildCrossAppHref(link);

                      return href ? (
                        <a
                          key={`${link.targetApp}-${link.route}`}
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          style={linkStyle(true)}
                        >
                          {link.label}
                        </a>
                      ) : (
                        <div
                          key={`${link.targetApp}-${link.route}`}
                          style={{ display: "grid", gap: 4 }}
                        >
                          <span style={linkStyle(true)}>{link.label}</span>
                          <span style={{ fontSize: 10.5, color: th.textDim }}>
                            Configure
                            <span style={monoStyle}>
                              {" "}
                              NEXT_PUBLIC_
                              {link.targetApp === "platform-admin"
                                ? "PLATFORM_ADMIN"
                                : "OPS_CONSOLE"}
                              _URL
                            </span>{" "}
                            to activate this deep link.
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CanvasCard>

              <CanvasCard theme={th}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    Empty-state QA
                  </div>
                  <p style={mutedCopyStyle}>
                    Reviewer can verify the six tenant-relevant empty variants
                    directly from this route.
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {(
                      [
                        "no_data",
                        "not_provisioned",
                        "fetch_failed",
                        "permission_denied",
                        "external_unavailable",
                        "filtered_empty",
                      ] as EmptyReason[]
                    ).map((reason) => (
                      <Link
                        key={reason}
                        href={`?emptyReason=${reason}`}
                        style={linkStyle()}
                      >
                        {reason}
                      </Link>
                    ))}
                  </div>
                </div>
              </CanvasCard>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
