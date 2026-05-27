import Link from "next/link";
import type {
  BookingRecord,
  CrossAppResourceLink,
  EmptyReason,
  FeatureFlagSummary,
  IdentityContext,
  NotificationRecord,
  ResourceActionDescriptor,
  TenantIntegrationGovernancePackage,
  TenantIntegrationReadinessItem,
  TenantIntegrationReadinessSummary,
  TenantInvoiceRecord,
  UiRefreshMetadata,
} from "@drts/contracts";
import { PageHero, SurfaceCard } from "@/components/page-primitives";
import { DEMO_TENANT_ID, getTenantClient } from "@/lib/api-client";
import { formatCount, formatDateTime, formatMoney } from "@/lib/formatters";
import { TENANT_CONSOLE_ENV, tenantNavItems } from "@/lib/navigation";

const ATTENTION_STATUSES = new Set([
  "dispatch_failed",
  "dispatch_timeout",
  "exception_hold",
  "no_supply",
  "proof_pending",
  "redispatch_required",
]);

const REFRESH_TIER_LABEL = "T5 Tenant slow";
const REFRESH_STALE_AFTER_MS = 30_000;

export const dynamic = "force-dynamic";

type WorkspaceAction = {
  label: string;
  href: string;
  description: string;
  descriptor: ResourceActionDescriptor;
};

type WorkspaceModule = {
  key: string;
  title: string;
  href: string;
  description: string;
  status: "ready" | "attention" | "not_provisioned";
  meta: string;
};

type DashboardData = {
  identity: IdentityContext | null;
  featureFlags: FeatureFlagSummary | null;
  bookings: BookingRecord[];
  invoices: TenantInvoiceRecord[];
  notifications: NotificationRecord[];
  governance: TenantIntegrationGovernancePackage | null;
  readiness: TenantIntegrationReadinessSummary | null;
  errors: string[];
};

async function loadDashboardData(): Promise<DashboardData> {
  const client = getTenantClient();
  const [
    identityResult,
    flagsResult,
    bookingsResult,
    invoicesResult,
    notificationsResult,
    governanceResult,
    readinessResult,
  ] = await Promise.allSettled([
    client.getIdentityContext() as Promise<IdentityContext>,
    client.getFeatureFlags({ tenantId: DEMO_TENANT_ID }),
    client.listTenantBookings(),
    client.listInvoices(),
    client.listTenantNotificationFeed(),
    client.getTenantIntegrationGovernancePackage(),
    client.getTenantIntegrationReadinessSummary(),
  ]);

  const errors: string[] = [];
  const collectError = (
    label: string,
    result: PromiseSettledResult<unknown>,
  ) => {
    if (result.status === "rejected") {
      errors.push(
        `${label}: ${result.reason instanceof Error ? result.reason.message : "Unknown error"}`,
      );
    }
  };

  collectError("Identity", identityResult);
  collectError("Feature flags", flagsResult);
  collectError("Bookings", bookingsResult);
  collectError("Invoices", invoicesResult);
  collectError("Notifications", notificationsResult);
  collectError("Integration governance", governanceResult);
  collectError("Integration readiness", readinessResult);

  return {
    identity:
      identityResult.status === "fulfilled" ? identityResult.value : null,
    featureFlags: flagsResult.status === "fulfilled" ? flagsResult.value : null,
    bookings: bookingsResult.status === "fulfilled" ? bookingsResult.value : [],
    invoices: invoicesResult.status === "fulfilled" ? invoicesResult.value : [],
    notifications:
      notificationsResult.status === "fulfilled"
        ? notificationsResult.value
        : [],
    governance:
      governanceResult.status === "fulfilled" ? governanceResult.value : null,
    readiness:
      readinessResult.status === "fulfilled" ? readinessResult.value : null,
    errors,
  };
}

function buildRefreshMetadata(data: DashboardData): UiRefreshMetadata {
  const snapshots = [
    data.governance?.generatedAt,
    data.readiness?.computedAt,
    ...data.bookings.slice(0, 8).map((booking) => booking.updatedAt),
    ...data.invoices.slice(0, 4).map((invoice) => invoice.updatedAt),
    ...data.notifications
      .slice(0, 4)
      .map((notification) => notification.createdAt),
  ].filter(Boolean);

  const generatedAt = snapshots.sort().at(-1) ?? new Date().toISOString();

  return {
    generatedAt,
    staleAfterMs: REFRESH_STALE_AFTER_MS,
    dataFreshness: data.errors.length > 0 ? "degraded" : "fresh",
    source: "live",
  };
}

function hasWriteAccess(identity: IdentityContext | null) {
  if (!identity) {
    return false;
  }

  if (identity.actorType === "tenant_admin") {
    return true;
  }

  return identity.roles.some((role) =>
    ["tc_admin", "tc_operator", "tc_integration_mgr"].includes(role),
  );
}

function getReadinessItem(
  readiness: TenantIntegrationReadinessSummary | null,
  subSystem: TenantIntegrationReadinessItem["subSystem"],
) {
  return readiness?.items.find((item) => item.subSystem === subSystem) ?? null;
}

function buildWorkspaceActions(data: DashboardData): WorkspaceAction[] {
  const writable = hasWriteAccess(data.identity);
  const integrationAction = getReadinessItem(data.readiness, "api_keys")
    ?.nextAction ??
    getReadinessItem(data.readiness, "webhooks")?.nextAction ??
    getReadinessItem(data.readiness, "notifications")?.nextAction ??
    getReadinessItem(data.readiness, "sla")?.nextAction ?? {
      action: "integration.open_governance",
      enabled: true,
      riskLevel: "low",
    };

  return [
    {
      label: "New booking",
      href: "/bookings/new",
      description: "Open the command-based booking flow from the workspace.",
      descriptor: writable
        ? {
            action: "booking.create",
            enabled: true,
            riskLevel: "medium",
          }
        : {
            action: "booking.create",
            enabled: false,
            disabledReasonCode: "permission_denied",
            riskLevel: "medium",
          },
    },
    {
      label: "View today's bookings",
      href: "/bookings",
      description:
        "Jump into the current tenant booking queue and recent changes.",
      descriptor: {
        action: "booking.list_today",
        enabled: true,
        riskLevel: "low",
      },
    },
    {
      label: "Open integration governance",
      href: "/integration-governance",
      description: integrationAction.action,
      descriptor: integrationAction,
    },
  ];
}

function mapReadinessStatus(
  item: TenantIntegrationReadinessItem | null,
): WorkspaceModule["status"] {
  if (!item) {
    return "not_provisioned";
  }

  if (item.status === "ready") {
    return "ready";
  }

  if (item.status === "partial") {
    return "attention";
  }

  return "not_provisioned";
}

function isModuleFlagEnabled(flags: FeatureFlagSummary["flags"], key: string) {
  const related = flags.filter((flag) => flag.key.includes(key));
  if (related.length === 0) {
    return true;
  }

  return related.some((flag) => flag.enabled);
}

function buildWorkspaceModules(data: DashboardData): WorkspaceModule[] {
  const flags = data.featureFlags?.flags ?? [];
  const activeBookings = data.bookings.filter(
    (booking) =>
      booking.orderStatus !== "completed" &&
      booking.orderStatus !== "cancelled",
  );
  const attentionBookings = activeBookings.filter((booking) =>
    ATTENTION_STATUSES.has(booking.orderStatus),
  );
  const openInvoices = data.invoices.filter(
    (invoice) => invoice.status !== "paid",
  );

  const modules = [
    {
      key: "bookings",
      title: "Bookings",
      href: "/bookings",
      description:
        "Current queue, accepted changes, and follow-up from dispatch.",
      status:
        attentionBookings.length > 0
          ? "attention"
          : activeBookings.length > 0
            ? "ready"
            : "not_provisioned",
      meta:
        activeBookings.length > 0
          ? `${formatCount(activeBookings.length)} active / ${formatCount(attentionBookings.length)} attention`
          : "No active bookings in the current snapshot.",
    },
    {
      key: "integration",
      title: "Integration governance",
      href: "/integration-governance",
      description:
        "Aggregated readiness across API keys, webhooks, notifications, and SLA.",
      status: mapReadinessStatus(getReadinessItem(data.readiness, "modules")),
      meta:
        getReadinessItem(data.readiness, "modules")?.detail ??
        "Readiness endpoint did not provide a module-level summary.",
    },
    {
      key: "billing",
      title: "Billing and invoices",
      href: "/billing",
      description: "Current invoice posture and finance-oriented follow-up.",
      status:
        openInvoices.length > 0
          ? "attention"
          : data.invoices.length > 0
            ? "ready"
            : "not_provisioned",
      meta:
        data.invoices.length > 0
          ? `${formatCount(openInvoices.length)} invoice(s) still open`
          : "No invoice artifacts available yet.",
    },
    {
      key: "users",
      title: "Users and roles",
      href: "/users",
      description: "Tenant-scoped authority, permissions, and visible modules.",
      status: data.identity?.tenantId ? "ready" : "not_provisioned",
      meta: data.identity?.roles.length
        ? data.identity.roles.join(" / ")
        : "Role context unavailable.",
    },
  ] satisfies WorkspaceModule[];

  return modules.filter((module) => isModuleFlagEnabled(flags, module.key));
}

function buildCrossAppLinks(tenantId: string): CrossAppResourceLink[] {
  return [
    {
      targetApp: "ops-console",
      route: `/complaints?tenantId=${encodeURIComponent(tenantId)}`,
      resourceType: "complaint_case",
      resourceId: tenantId,
      openMode: "new_tab",
      label: "Ops complaints for this tenant",
    },
    {
      targetApp: "ops-console",
      route: `/audit?tenantId=${encodeURIComponent(tenantId)}`,
      resourceType: "audit_log",
      resourceId: tenantId,
      openMode: "new_tab",
      label: "Ops-side execution audit",
    },
    {
      targetApp: "platform-admin",
      route: `/tenants/${encodeURIComponent(tenantId)}`,
      resourceType: "platform_tenant",
      resourceId: tenantId,
      openMode: "new_tab",
      label: "Platform governance for this tenant",
    },
  ];
}

function getExternalAppBaseUrl(targetApp: CrossAppResourceLink["targetApp"]) {
  if (targetApp === "ops-console") {
    return process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003";
  }

  if (targetApp === "platform-admin") {
    return (
      process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3002"
    );
  }

  return process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL ?? "http://localhost:3000";
}

function toExternalHref(link: CrossAppResourceLink) {
  return `${getExternalAppBaseUrl(link.targetApp)}${link.route}`;
}

function getWorkspaceEmptyReason(
  data: DashboardData,
  visibleModuleCount: number,
): EmptyReason | null {
  if (!data.identity?.tenantId) {
    return "permission_denied";
  }

  if (data.errors.some((error) => error.startsWith("Bookings:"))) {
    return "fetch_failed";
  }

  if (
    data.readiness?.items.some((item) => item.status === "not_provisioned") ||
    (data.governance?.onboardingChecklist.length ?? 0) > 0
  ) {
    return "not_provisioned";
  }

  if (data.readiness?.items.some((item) => item.status === "blocked")) {
    return "external_unavailable";
  }

  if (data.bookings.length === 0) {
    return "no_data";
  }

  if (visibleModuleCount === 0) {
    return "filtered_empty";
  }

  return null;
}

function getEmptyStateCopy(reason: EmptyReason) {
  switch (reason) {
    case "no_data":
      return {
        title: "No tenant activity yet",
        description:
          "This tenant has no current bookings or recent work items, so the workspace stays focused on entry points.",
      };
    case "not_provisioned":
      return {
        title: "Provisioning is still incomplete",
        description:
          "At least one subsystem still needs onboarding across API keys, webhooks, notifications, or SLA.",
      };
    case "fetch_failed":
      return {
        title: "Some workspace data failed to load",
        description:
          "The current snapshot is partial. Use the refresh affordance and drill into the affected module for details.",
      };
    case "permission_denied":
      return {
        title: "Tenant context is unavailable for this actor",
        description:
          "The workspace cannot render tenant-scoped actions without a valid tenant identity context.",
      };
    case "external_unavailable":
      return {
        title: "An external dependency is unavailable",
        description:
          "At least one readiness dependency is blocked upstream, so integration health is degraded.",
      };
    case "filtered_empty":
      return {
        title: "Visible modules are fully filtered out",
        description:
          "Feature visibility and module gating currently hide every workspace entry point for this actor.",
      };
  }
}

function getToneClassName(status: WorkspaceModule["status"]) {
  switch (status) {
    case "ready":
      return "workspace-status workspace-status-ready";
    case "attention":
      return "workspace-status workspace-status-attention";
    default:
      return "workspace-status workspace-status-muted";
  }
}

function getFreshnessLabel(refresh: UiRefreshMetadata) {
  switch (refresh.dataFreshness) {
    case "fresh":
      return `${REFRESH_TIER_LABEL} · fresh`;
    case "degraded":
      return `${REFRESH_TIER_LABEL} · degraded`;
    case "stale":
      return `${REFRESH_TIER_LABEL} · stale`;
    default:
      return `${REFRESH_TIER_LABEL} · unknown`;
  }
}

function getRefreshDetail(refresh: UiRefreshMetadata) {
  return `Generated ${formatDateTime(refresh.generatedAt)} · refresh every 30s`;
}

export default async function HomePage() {
  const data = await loadDashboardData();
  const refresh = buildRefreshMetadata(data);
  const quickActions = buildWorkspaceActions(data);
  const modules = buildWorkspaceModules(data);
  const visibleNavItems = tenantNavItems.filter((item) =>
    isModuleFlagEnabled(data.featureFlags?.flags ?? [], item.key),
  );
  const workspaceEmptyReason = getWorkspaceEmptyReason(data, modules.length);
  const workspaceEmptyState = workspaceEmptyReason
    ? getEmptyStateCopy(workspaceEmptyReason)
    : null;
  const activeBookings = data.bookings.filter(
    (booking) =>
      booking.orderStatus !== "completed" &&
      booking.orderStatus !== "cancelled",
  );
  const attentionBookings = activeBookings.filter((booking) =>
    ATTENTION_STATUSES.has(booking.orderStatus),
  );
  const recentUpdates = [...activeBookings]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 5);
  const readinessItems = data.readiness?.items ?? [];
  const openInvoices = data.invoices.filter(
    (invoice) => invoice.status !== "paid",
  );
  const externalLinks = buildCrossAppLinks(
    data.identity?.tenantId ?? DEMO_TENANT_ID,
  );

  return (
    <div className="page-shell workspace-home">
      <PageHero
        eyebrow="Workspace Home"
        title={
          data.identity?.actorId
            ? `Workspace for ${data.identity.tenantId ?? DEMO_TENANT_ID}`
            : "Tenant workspace"
        }
        description="See tenant identity context, module availability, aggregated integration readiness, pending booking updates, and action-driven entry points from one home surface."
      />

      {refresh.dataFreshness === "degraded" ||
      workspaceEmptyReason === "external_unavailable" ? (
        <section className="workspace-state-banner">
          <div className="workspace-state-icon">degraded</div>
          <div>
            <strong>Page-critical dependencies are degraded</strong>
            <p>
              Workspace home keeps rendering partial data, but the current
              snapshot includes failures or blocked integrations.
            </p>
          </div>
        </section>
      ) : null}

      <section className="workspace-hero-grid">
        <SurfaceCard
          kicker="Context"
          title="Tenant identity and visibility"
          description="Identity context, refresh tier, and visible modules stay explicit so workspace actions do not drift from backend-owned authority."
        >
          <div className="workspace-context-header">
            <div>
              <p className="workspace-context-code">
                {data.identity?.tenantId ?? DEMO_TENANT_ID}
              </p>
              <div className="chip-row">
                <span className="status-chip is-active">tenant</span>
                <span className="status-chip">{TENANT_CONSOLE_ENV}</span>
                <span className="status-chip">
                  {data.identity?.realm ?? "unknown"}
                </span>
                <span className="status-chip">
                  {data.identity?.actorType ?? "unknown"}
                </span>
              </div>
            </div>
            <div className="workspace-refresh">
              <span className="source-pill">{getFreshnessLabel(refresh)}</span>
              <p className="muted-copy">{getRefreshDetail(refresh)}</p>
              <Link className="text-link" href="/">
                Refresh workspace
              </Link>
            </div>
          </div>

          <dl className="definition-grid">
            <div>
              <dt>Tenant</dt>
              <dd>{data.identity?.tenantId ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                {workspaceEmptyReason === "not_provisioned"
                  ? "Provisioning"
                  : "Active"}
              </dd>
            </div>
            <div>
              <dt>Auth mode</dt>
              <dd>{data.identity?.authMode ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Visible modules</dt>
              <dd>
                {formatCount(modules.length)} /{" "}
                {formatCount(visibleNavItems.length)}
              </dd>
            </div>
          </dl>
        </SurfaceCard>

        <SurfaceCard
          kicker="Actions"
          title="Start from available actions"
          description="Workspace CTAs use `ResourceActionDescriptor` semantics so risk level, disabled reasons, and navigation stay consistent."
        >
          <div className="workspace-action-list">
            {quickActions.map((action) => (
              <Link
                aria-disabled={!action.descriptor.enabled}
                className={`workspace-action-tile${action.descriptor.enabled ? "" : " is-disabled"}`}
                href={action.descriptor.enabled ? action.href : "/"}
                key={action.label}
              >
                <div>
                  <p className="workspace-action-label">{action.label}</p>
                  <p className="workspace-action-copy">{action.description}</p>
                </div>
                <div className="workspace-action-meta">
                  <span className="status-chip">
                    {action.descriptor.riskLevel}
                  </span>
                  <span className="muted-copy">
                    {action.descriptor.enabled
                      ? action.descriptor.action
                      : (action.descriptor.disabledReasonCode ?? "disabled")}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </SurfaceCard>
      </section>

      {workspaceEmptyReason && workspaceEmptyState ? (
        <section className="workspace-state-banner">
          <div className="workspace-state-icon">{workspaceEmptyReason}</div>
          <div>
            <strong>{workspaceEmptyState.title}</strong>
            <p>{workspaceEmptyState.description}</p>
          </div>
        </section>
      ) : null}

      <section className="workspace-main-grid">
        <SurfaceCard
          kicker="Modules"
          title="Visible modules and quick entry points"
          description="Home summarizes what this actor can see instead of repeating the sidebar without context."
        >
          <div className="workspace-module-grid">
            {modules.length > 0 ? (
              modules.map((module) => (
                <Link
                  className="workspace-module-card"
                  href={module.href}
                  key={module.key}
                >
                  <div className="workspace-module-head">
                    <p className="workspace-module-title">{module.title}</p>
                    <span className={getToneClassName(module.status)}>
                      {module.status}
                    </span>
                  </div>
                  <p className="workspace-module-copy">{module.description}</p>
                  <p className="workspace-module-meta">{module.meta}</p>
                </Link>
              ))
            ) : (
              <div className="workspace-empty-card">
                <strong>filtered_empty</strong>
                <p>
                  No module is currently visible for this actor and flag set.
                </p>
              </div>
            )}
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker="Bookings"
          title="Pending bookings and recent updates"
          description="Workspace home answers whether anything needs attention today and which booking changed most recently."
        >
          <div className="workspace-summary-grid">
            <div className="workspace-summary-card">
              <span className="metric-label">Active</span>
              <strong>{formatCount(activeBookings.length)}</strong>
              <p>Bookings still in progress or awaiting dispatch progress.</p>
            </div>
            <div className="workspace-summary-card">
              <span className="metric-label">Attention</span>
              <strong>{formatCount(attentionBookings.length)}</strong>
              <p>
                Bookings in failure, proof, exception, or redispatch states.
              </p>
            </div>
            <div className="workspace-summary-card">
              <span className="metric-label">Current invoice</span>
              <strong>
                {openInvoices[0]?.amount
                  ? formatMoney(openInvoices[0].amount)
                  : "Not available"}
              </strong>
              <p>Visible invoice reminder from the finance lane.</p>
            </div>
            <div className="workspace-summary-card">
              <span className="metric-label">Recent updates</span>
              <strong>{formatCount(recentUpdates.length)}</strong>
              <p>Latest booking rows surfaced before drilling into the list.</p>
            </div>
          </div>

          <div className="workspace-timeline">
            {recentUpdates.length > 0 ? (
              recentUpdates.map((booking) => (
                <Link
                  className="workspace-timeline-row"
                  href={`/bookings/${booking.bookingId}`}
                  key={booking.bookingId}
                >
                  <div>
                    <p className="workspace-timeline-title">
                      {booking.bookingId}
                    </p>
                    <p className="workspace-timeline-copy">
                      {booking.passenger.name} · {booking.pickup.address}
                    </p>
                  </div>
                  <div className="workspace-timeline-meta">
                    <span className="status-badge">{booking.orderStatus}</span>
                    <span className="list-note">
                      {formatDateTime(booking.updatedAt)}
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <div className="workspace-empty-card">
                <strong>no_data</strong>
                <p>No recent booking updates are available for this tenant.</p>
              </div>
            )}
          </div>
        </SurfaceCard>
      </section>

      <section className="workspace-main-grid">
        <SurfaceCard
          kicker="Readiness"
          title="Integration health and provisioning gaps"
          description="The workspace consumes the aggregated readiness endpoint directly and only falls back to governance checklist items when needed."
        >
          <div className="workspace-readiness-list">
            {readinessItems.length > 0 ? (
              readinessItems.map((item) => (
                <div className="workspace-readiness-row" key={item.subSystem}>
                  <div>
                    <p className="workspace-readiness-title">
                      {item.subSystem}
                    </p>
                    <p className="workspace-readiness-copy">
                      {item.detail ?? "No additional detail was returned."}
                    </p>
                  </div>
                  <div className="workspace-readiness-meta">
                    <span
                      className={getToneClassName(mapReadinessStatus(item))}
                    >
                      {item.status}
                    </span>
                    {item.nextAction ? (
                      <span className="list-note">
                        {item.nextAction.action}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="workspace-empty-card">
                <strong>fetch_failed</strong>
                <p>
                  Aggregated readiness is unavailable, so only governance
                  checklist data can be shown.
                </p>
              </div>
            )}
          </div>

          <div className="workspace-checklist">
            {(data.governance?.onboardingChecklist ?? [])
              .slice(0, 5)
              .map((item) => (
                <div className="workspace-checklist-row" key={item}>
                  <span className="workspace-checklist-dot" />
                  <span>{item}</span>
                </div>
              ))}
            {!(data.governance?.onboardingChecklist.length ?? 0) ? (
              <div className="workspace-checklist-row">
                <span className="workspace-checklist-dot is-ready" />
                <span>No open governance checklist gaps were returned.</span>
              </div>
            ) : null}
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker="Cross-app"
          title="Cross-system links and notices"
          description="Deep links to ops-console and platform-admin open in new tabs and stay scoped to this tenant."
        >
          <div className="workspace-external-list">
            {externalLinks.map((link) => (
              <a
                className="workspace-external-link"
                href={toExternalHref(link)}
                key={`${link.targetApp}-${link.route}`}
                rel="noreferrer"
                target={link.openMode === "new_tab" ? "_blank" : undefined}
              >
                <div>
                  <p className="workspace-external-title">{link.label}</p>
                  <p className="workspace-external-copy">{link.route}</p>
                </div>
                <span className="source-pill source-pill-external">
                  {link.targetApp}
                </span>
              </a>
            ))}
          </div>

          <div className="workspace-notice-list">
            {data.notifications.length > 0 ? (
              data.notifications.slice(0, 4).map((notification) => (
                <div
                  className="workspace-notice-row"
                  key={notification.notificationId}
                >
                  <div>
                    <p className="workspace-external-title">
                      {notification.title}
                    </p>
                    <p className="workspace-external-copy">
                      {notification.message}
                    </p>
                  </div>
                  <div className="workspace-timeline-meta">
                    <span className="status-chip">{notification.channel}</span>
                    <span className="list-note">
                      {formatDateTime(notification.createdAt)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="workspace-empty-card">
                <strong>external_unavailable</strong>
                <p>No notification feed items are currently available.</p>
              </div>
            )}
          </div>
        </SurfaceCard>
      </section>

      {data.errors.length > 0 ? (
        <section className="workspace-error-list">
          {data.errors.map((error) => (
            <div className="workspace-error-row" key={error}>
              {error}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
