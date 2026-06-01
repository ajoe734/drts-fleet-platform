import Link from "next/link";
import type {
  ActionRiskLevel,
  BookingRecord,
  EmptyReason,
  FeatureFlagSummary,
  IdentityContext,
  NotificationRecord,
  RefreshTier,
  ResourceActionDescriptor,
  TenantApiKeyRecord,
  TenantIntegrationGovernancePackage,
  TenantIntegrationReadinessItem,
  TenantInvoiceRecord,
  TenantQuotaSummary,
  TenantWebhookEndpoint,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { DEMO_TENANT_ID, getTenantClient } from "@/lib/api-client";
import { formatCount, formatDateTime, formatMoney } from "@/lib/formatters";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Workspace Home — packet §5.1 + canvas `Tenant Console.html` TN_Home.
//
// Visual mirrors the canvas Home artboard (greeting hero, KPI grid, in-progress
// booking table, reminders rail). Behaviour follows packet §5.1: identity
// context, module enablement, aggregated integration readiness (Q-TEN10),
// pending-booking summary, quick actions. CTAs are driven by an
// `availableActions[]` (Q-X13), every empty section renders a distinct
// `EmptyReason` (Q-X15), and the page is wired to the T5 Tenant-slow refresh
// tier (Q-X02) with a freshness affordance.
// ---------------------------------------------------------------------------

// Q-X15 — driver_not_eligible is driver-app-specific; tenant-console handles
// the 6 tenant-relevant empty reasons.
type TenantEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;

type Slice<T> = {
  value: T;
  emptyReason: TenantEmptyReason | null;
};

type DashboardData = {
  identity: Slice<IdentityContext | null>;
  featureFlags: Slice<FeatureFlagSummary | null>;
  bookings: Slice<BookingRecord[]>;
  invoices: Slice<TenantInvoiceRecord[]>;
  notifications: Slice<NotificationRecord[]>;
  governance: Slice<TenantIntegrationGovernancePackage | null>;
  quota: Slice<TenantQuotaSummary | null>;
  apiKeys: Slice<TenantApiKeyRecord[]>;
  webhooks: Slice<TenantWebhookEndpoint[]>;
  degradedSlices: string[];
};

// Map a rejected read to the honest empty/degraded reason instead of a silent
// empty card (Q-X15: distinguish fetch_failed / permission_denied /
// external_unavailable rather than faking `no_data`).
function classifyError(reason: unknown): TenantEmptyReason {
  const message = reason instanceof Error ? reason.message : String(reason);
  const lower = message.toLowerCase();
  if (
    lower.includes("403") ||
    lower.includes("401") ||
    lower.includes("forbidden") ||
    lower.includes("permission") ||
    lower.includes("unauthor")
  ) {
    return "permission_denied";
  }
  if (
    lower.includes("503") ||
    lower.includes("502") ||
    lower.includes("504") ||
    lower.includes("timeout") ||
    lower.includes("unavailable") ||
    lower.includes("upstream") ||
    lower.includes("econnrefused") ||
    lower.includes("fetch failed")
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

function toSlice<T>(
  label: string,
  result: PromiseSettledResult<T>,
  fallback: T,
  degraded: string[],
): Slice<T> {
  if (result.status === "fulfilled") {
    return { value: result.value, emptyReason: null };
  }
  degraded.push(label);
  return { value: fallback, emptyReason: classifyError(result.reason) };
}

async function loadDashboardData(): Promise<DashboardData> {
  const client = getTenantClient();
  const degradedSlices: string[] = [];

  // Identity must resolve before feature flags are fetched so module
  // visibility is scoped to the *current* tenant (packet §5.1) rather than a
  // hard-coded demo tenant. The demo tenant is only a fallback when identity
  // itself is unavailable.
  const [identityResult] = await Promise.allSettled([
    client.getIdentityContext() as Promise<IdentityContext>,
  ]);
  const identity = toSlice("Identity", identityResult, null, degradedSlices);
  const resolvedTenantId = identity.value?.tenantId ?? DEMO_TENANT_ID;

  const [
    flagsResult,
    bookingsResult,
    invoicesResult,
    notificationsResult,
    governanceResult,
    quotaResult,
    apiKeysResult,
    webhooksResult,
  ] = await Promise.allSettled([
    client.getFeatureFlags({ tenantId: resolvedTenantId }),
    client.listTenantBookings(),
    client.listInvoices(),
    client.listTenantNotificationFeed(),
    client.getTenantIntegrationGovernancePackage(),
    client.getTenantQuotaSummary(),
    client.listApiKeys(),
    client.listWebhooks(),
  ]);

  return {
    identity,
    featureFlags: toSlice("Feature flags", flagsResult, null, degradedSlices),
    bookings: toSlice("Bookings", bookingsResult, [], degradedSlices),
    invoices: toSlice("Invoices", invoicesResult, [], degradedSlices),
    notifications: toSlice(
      "Notifications",
      notificationsResult,
      [],
      degradedSlices,
    ),
    governance: toSlice(
      "Integration governance",
      governanceResult,
      null,
      degradedSlices,
    ),
    quota: toSlice("Quota", quotaResult, null, degradedSlices),
    apiKeys: toSlice("API keys", apiKeysResult, [], degradedSlices),
    webhooks: toSlice("Webhooks", webhooksResult, [], degradedSlices),
    degradedSlices,
  };
}

// ---------------------------------------------------------------------------
// Refresh tier (Q-X01 / Q-X02). Workspace home is T5 Tenant-slow (30s).
// ---------------------------------------------------------------------------

const REFRESH_TIER_CADENCE: Record<RefreshTier, string> = {
  urgent: "push + 5s fallback",
  fast: "3s",
  dispatch: "5s",
  medium: "15s",
  medium_slow: "30s",
  slow: "30s",
  manual: "manual only",
};

function FreshnessBar({
  tier,
  metadata,
}: {
  tier: RefreshTier;
  metadata: UiRefreshMetadata;
}) {
  const freshnessTone =
    metadata.dataFreshness === "fresh"
      ? "status-chip"
      : "status-chip is-warning";
  return (
    <div className="link-row" style={{ alignItems: "center", flexWrap: "wrap" }}>
      <span className="meta-pill">
        T5 · Tenant slow · {REFRESH_TIER_CADENCE[tier]}
      </span>
      <span className={freshnessTone}>{metadata.dataFreshness}</span>
      <span className="list-note">
        Snapshot {formatDateTime(metadata.generatedAt)} · source{" "}
        {metadata.source}
      </span>
      <Link className="text-link" href="/">
        Refresh now
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// availableActions-driven CTAs (Q-X13 / packet §3.5).
// ---------------------------------------------------------------------------

const RISK_VARIANT: Record<ActionRiskLevel, string> = {
  low: "action-button-secondary",
  medium: "action-button-primary",
  high: "action-button-danger",
};

const ACTION_PRESENTATION: Record<string, { label: string; href: string }> = {
  create_booking: { label: "New booking", href: "/bookings/new" },
  view_todays_bookings: {
    label: "View today's bookings",
    href: "/bookings?dateField=reservationStart",
  },
  open_integration_governance: {
    label: "Open integration governance",
    href: "/integration-governance",
  },
  issue_api_key: { label: "Issue API key", href: "/api-keys" },
};

function ActionCta({ descriptor }: { descriptor: ResourceActionDescriptor }) {
  const meta = ACTION_PRESENTATION[descriptor.action];
  const label = meta?.label ?? descriptor.action;
  const className = `action-button ${RISK_VARIANT[descriptor.riskLevel]}`;
  if (!descriptor.enabled || !meta) {
    return (
      <span
        aria-disabled="true"
        className={className}
        style={{ opacity: 0.45, pointerEvents: "none" }}
        title={descriptor.disabledReasonCode ?? "unavailable"}
      >
        {label}
      </span>
    );
  }
  return (
    <Link className={className} href={meta.href}>
      {label}
    </Link>
  );
}

// `exactOptionalPropertyTypes` is on, so an optional field must be omitted
// rather than set to `undefined`.
function makeAction(
  action: string,
  enabled: boolean,
  riskLevel: ActionRiskLevel,
  disabledReasonCode?: string,
  requiresReason?: boolean,
): ResourceActionDescriptor {
  return {
    action,
    enabled,
    riskLevel,
    ...(disabledReasonCode ? { disabledReasonCode } : {}),
    ...(requiresReason ? { requiresReason } : {}),
  };
}

// Derive the workspace action set from authority context (scopes / module
// flags) — never hard-coded by role label (Q-X13).
function deriveWorkspaceActions(
  identity: IdentityContext | null,
  enabledFlagKeys: Set<string>,
): ResourceActionDescriptor[] {
  const scopes = new Set(identity?.scopes ?? []);
  const canWrite = scopes.has("tenant:write");
  const bookingsModuleEnabled =
    enabledFlagKeys.size === 0 || enabledFlagKeys.has("tenant_bookings");
  const canSeeIntegration =
    scopes.size === 0 || scopes.has("tenant:read") || scopes.has("tenant:write");

  return [
    makeAction(
      "create_booking",
      canWrite && bookingsModuleEnabled,
      "medium",
      !canWrite
        ? "missing_tenant_write_scope"
        : !bookingsModuleEnabled
          ? "bookings_module_disabled"
          : undefined,
    ),
    makeAction("view_todays_bookings", true, "low"),
    makeAction(
      "open_integration_governance",
      canSeeIntegration,
      "low",
      canSeeIntegration ? undefined : "missing_tenant_read_scope",
    ),
  ];
}

// ---------------------------------------------------------------------------
// Empty / not-ready states (Q-X15) — all 6 tenant reasons rendered distinctly.
// ---------------------------------------------------------------------------

const EMPTY_REASON_PRESENTATION: Record<
  TenantEmptyReason,
  { title: string; body: string; tone: "default" | "warning"; code: string }
> = {
  no_data: {
    title: "Nothing here yet",
    body: "This surface is provisioned and reachable; there is simply no record in the current snapshot.",
    tone: "default",
    code: "no_data",
  },
  not_provisioned: {
    title: "Not provisioned",
    body: "This sub-system is not configured for the tenant yet. Complete onboarding to activate it — this is not mock data.",
    tone: "warning",
    code: "not_provisioned",
  },
  fetch_failed: {
    title: "Could not load",
    body: "The read failed unexpectedly. The data is hidden rather than shown as empty so the snapshot is not mistaken for the truth.",
    tone: "warning",
    code: "fetch_failed",
  },
  permission_denied: {
    title: "Not visible to your role",
    body: "The current authority context is not permitted to read this surface. Ask a tenant administrator for access.",
    tone: "warning",
    code: "permission_denied",
  },
  external_unavailable: {
    title: "Upstream unavailable",
    body: "A dependency this surface relies on is degraded or unreachable. It should recover on the next poll.",
    tone: "warning",
    code: "external_unavailable",
  },
  filtered_empty: {
    title: "No match for the active filter",
    body: "Records exist, but none match the current filter. Broaden or clear the filter to see more.",
    tone: "warning",
    code: "filtered_empty",
  },
};

function EmptyState({
  reason,
  nextAction,
}: {
  reason: TenantEmptyReason;
  nextAction?: ResourceActionDescriptor;
}) {
  const presentation = EMPTY_REASON_PRESENTATION[reason];
  return (
    <div
      className={`empty-panel${presentation.tone === "warning" ? " is-warning" : ""}`}
    >
      <div className="link-row" style={{ alignItems: "center" }}>
        <strong>{presentation.title}</strong>
        <span className="meta-pill">{presentation.code}</span>
      </div>
      <p className="muted-copy">{presentation.body}</p>
      {nextAction ? (
        <div className="action-row">
          <ActionCta descriptor={nextAction} />
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Integration readiness (Q-TEN10). The aggregated readiness endpoint is not
// yet wired into the tenant client, so the summary is derived from the
// governance package + module flags + key/webhook presence, typed against the
// ui-runtime `TenantIntegrationReadinessItem` contract.
// ---------------------------------------------------------------------------

const READINESS_DRILL: Record<
  TenantIntegrationReadinessItem["subSystem"],
  { label: string; href: string }
> = {
  api_keys: { label: "API keys", href: "/api-keys" },
  webhooks: { label: "Webhooks", href: "/webhooks" },
  notifications: { label: "Notifications", href: "/notifications" },
  sla: { label: "SLA", href: "/sla" },
  reports: { label: "Reports", href: "/reports" },
  modules: { label: "Modules", href: "/feature-flags" },
  partner_entries: { label: "Partner entries", href: "/settings" },
};

const READINESS_TONE: Record<
  TenantIntegrationReadinessItem["status"],
  string
> = {
  ready: "status-chip is-success",
  partial: "status-chip is-warning",
  not_provisioned: "status-chip is-warning",
  blocked: "status-chip is-error",
};

function deriveReadiness(data: DashboardData): TenantIntegrationReadinessItem[] {
  const activeApiKeys = data.apiKeys.value.filter((key) => !key.revokedAt);
  const activeWebhooks = data.webhooks.value.filter(
    (hook) => hook.status === "active",
  );
  const subscriptions =
    data.governance.value?.baselineNotificationSubscriptions ?? [];
  const enabledModuleCount =
    data.featureFlags.value?.flags.filter((flag) => flag.enabled).length ?? 0;

  const apiKeyStatus: TenantIntegrationReadinessItem["status"] =
    data.apiKeys.emptyReason === "fetch_failed"
      ? "blocked"
      : activeApiKeys.length > 0
        ? "ready"
        : "not_provisioned";

  const webhookStatus: TenantIntegrationReadinessItem["status"] =
    data.webhooks.emptyReason === "fetch_failed"
      ? "blocked"
      : activeWebhooks.length > 0
        ? "ready"
        : data.webhooks.value.length > 0
          ? "partial"
          : "not_provisioned";

  return [
    {
      subSystem: "modules",
      status: enabledModuleCount > 0 ? "ready" : "not_provisioned",
      detail:
        enabledModuleCount > 0
          ? `${formatCount(enabledModuleCount)} module flag(s) enabled`
          : "No tenant module flag resolved enabled",
    },
    {
      subSystem: "api_keys",
      status: apiKeyStatus,
      detail:
        apiKeyStatus === "ready"
          ? `${formatCount(activeApiKeys.length)} active key(s)`
          : apiKeyStatus === "blocked"
            ? "Key inventory failed to load"
            : "No active API key issued",
      ...(apiKeyStatus === "not_provisioned"
        ? { nextAction: makeAction("issue_api_key", true, "medium") }
        : {}),
    },
    {
      subSystem: "webhooks",
      status: webhookStatus,
      detail:
        webhookStatus === "ready"
          ? `${formatCount(activeWebhooks.length)} active endpoint(s)`
          : webhookStatus === "partial"
            ? "Endpoints configured but none active"
            : webhookStatus === "blocked"
              ? "Delivery inventory failed to load"
              : "Delivery engine not provisioned",
    },
    {
      subSystem: "notifications",
      status: subscriptions.length > 0 ? "ready" : "not_provisioned",
      detail:
        subscriptions.length > 0
          ? `${formatCount(subscriptions.length)} baseline subscription(s)`
          : "No baseline notification routing configured",
    },
  ];
}

// ---------------------------------------------------------------------------
// Reminders rail — derived honestly from health, webhook state, notifications.
// ---------------------------------------------------------------------------

type Reminder = {
  id: string;
  tone: "default" | "warning";
  title: string;
  body: string;
};

function deriveReminders(data: DashboardData): Reminder[] {
  const reminders: Reminder[] = [];

  const suspendedWebhooks = data.webhooks.value.filter(
    (hook) => hook.status !== "active",
  );
  for (const hook of suspendedWebhooks) {
    reminders.push({
      id: `webhook-${hook.webhookId}`,
      tone: "warning",
      title: `Webhook ${hook.webhookId} is ${hook.status}`,
      body: `${hook.url} will not receive events until it returns to active.`,
    });
  }

  for (const notification of data.notifications.value.slice(0, 3)) {
    reminders.push({
      id: notification.notificationId,
      tone: notification.channel === "tenant_approval" ? "warning" : "default",
      title: notification.title,
      body: `${notification.message} · ${formatDateTime(notification.createdAt)}`,
    });
  }

  return reminders;
}

// ---------------------------------------------------------------------------
// KPI helpers.
// ---------------------------------------------------------------------------

const ATTENTION_STATUSES = new Set([
  "dispatch_failed",
  "dispatch_timeout",
  "exception_hold",
  "no_supply",
  "proof_pending",
  "redispatch_required",
]);

function isToday(iso: string): boolean {
  const date = new Date(iso);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function bookingTone(status: BookingRecord["orderStatus"]): string {
  if (status === "completed") {
    return "status-badge is-success";
  }
  if (status === "cancelled") {
    return "status-badge is-error";
  }
  if (ATTENTION_STATUSES.has(status)) {
    return "status-badge is-warning";
  }
  return "status-badge";
}

export default async function HomePage() {
  const data = await loadDashboardData();

  const identity = data.identity.value;
  const enabledFlags =
    data.featureFlags.value?.flags.filter((flag) => flag.enabled) ?? [];
  const enabledFlagKeys = new Set(enabledFlags.map((flag) => flag.key));

  const activeBookings = data.bookings.value.filter(
    (booking) => booking.status === "active",
  );
  const attentionBookings = activeBookings.filter((booking) =>
    ATTENTION_STATUSES.has(booking.orderStatus),
  );
  const completedToday = data.bookings.value.filter(
    (booking) =>
      booking.orderStatus === "completed" && isToday(booking.updatedAt),
  );

  const quota = data.quota.value;
  const usedBookings = quota?.usage.confirmedBookingCount ?? null;
  const bookingLimit = quota?.limit.bookingCountLimit ?? null;
  const usedPercent =
    quota?.usage.remainingPercent != null
      ? Math.max(0, Math.round(100 - quota.usage.remainingPercent))
      : null;

  const latestInvoice = [...data.invoices.value].sort(
    (a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime(),
  )[0];

  const workspaceActions = deriveWorkspaceActions(identity, enabledFlagKeys);
  const createBookingAction = workspaceActions.find(
    (action) => action.action === "create_booking",
  );
  const readiness = deriveReadiness(data);
  const reminders = deriveReminders(data);
  const unhealthy = data.degradedSlices.length > 0;

  const refreshMetadata: UiRefreshMetadata = {
    generatedAt: new Date().toISOString(),
    staleAfterMs: 30_000,
    dataFreshness: unhealthy ? "degraded" : "fresh",
    source: "live",
  };

  const tenantLabel = identity?.tenantId ?? "Unavailable";

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Workspace"
        title={
          identity?.tenantId
            ? `Welcome back — ${tenantLabel} workspace`
            : "Tenant workspace"
        }
        description="Your operating context, today's booking load, billing posture, and integration readiness — anchored to authority-driven data, not a launcher."
      />

      <FreshnessBar tier="slow" metadata={refreshMetadata} />

      {unhealthy ? (
        <CalloutPanel
          title="Some data is degraded"
          description={`The following read(s) fell back this cycle and the snapshot is marked degraded: ${data.degradedSlices.join(", ")}. The dispatcher may have already acted; values should reconcile on the next poll.`}
          tone="warning"
        />
      ) : null}

      <section className="action-row" aria-label="Quick actions">
        {workspaceActions.map((descriptor) => (
          <ActionCta descriptor={descriptor} key={descriptor.action} />
        ))}
      </section>

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">In progress</span>
          <strong>{formatCount(activeBookings.length)}</strong>
          <p>
            {attentionBookings.length > 0
              ? `${formatCount(attentionBookings.length)} booking(s) need tenant follow-up across dispatch or proof states.`
              : "No active bookings currently need tenant-side follow-up."}
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Completed today</span>
          <strong>{formatCount(completedToday.length)}</strong>
          <p>
            {completedToday.length > 0
              ? "Trips that reached a completed order status during today's window."
              : "No trips have reached completion in today's window yet."}
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Month-to-date usage</span>
          <strong>
            {usedBookings != null ? formatCount(usedBookings) : "—"}
            {bookingLimit != null ? ` / ${formatCount(bookingLimit)}` : ""}
          </strong>
          <p>
            {usedPercent != null
              ? `${usedPercent}% of the monthly booking quota consumed.`
              : "Quota usage is not currently available for this tenant context."}
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Current invoice</span>
          <strong>
            {latestInvoice ? formatMoney(latestInvoice.amount) : "—"}
          </strong>
          <p>
            {latestInvoice
              ? `Period ending ${formatDateTime(latestInvoice.periodEnd)} · ${latestInvoice.status}.`
              : "No invoice artifact is currently visible from tenant billing authority."}
          </p>
        </article>
      </section>

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="Bookings"
          title="In-progress bookings"
          description="A quick read of the active booking load before drilling into the full `/bookings` oversight surface."
        >
          {data.bookings.emptyReason ? (
            <EmptyState reason={data.bookings.emptyReason} />
          ) : activeBookings.length === 0 ? (
            <EmptyState
              reason={
                data.bookings.value.length === 0 ? "no_data" : "filtered_empty"
              }
              {...(createBookingAction
                ? { nextAction: createBookingAction }
                : {})}
            />
          ) : (
            <div className="table-wrap">
              <table className="data-grid">
                <thead>
                  <tr>
                    <th>Booking</th>
                    <th>Passenger</th>
                    <th>Route</th>
                    <th>Window</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activeBookings.slice(0, 5).map((booking) => (
                    <tr key={booking.bookingId}>
                      <td>
                        <Link
                          className="text-link"
                          href={`/bookings/${booking.bookingId}`}
                        >
                          {booking.bookingId}
                        </Link>
                      </td>
                      <td>
                        <div className="table-primary">
                          {booking.passenger.name}
                          <span className="table-secondary">
                            {booking.passenger.phone}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="table-primary">
                          {booking.pickup.address}
                          <span className="table-secondary">
                            ↓ {booking.dropoff.address}
                          </span>
                        </div>
                      </td>
                      <td>{formatDateTime(booking.reservationWindowStart)}</td>
                      <td>
                        <span className={bookingTone(booking.orderStatus)}>
                          {booking.orderStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="link-row">
            <Link className="text-link" href="/bookings">
              Open booking oversight
            </Link>
            <Link className="text-link" href="/bookings/new">
              Start new booking intake
            </Link>
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker="Reminders"
          title="Needs your attention"
          description="Webhook posture, approval prompts, and recent tenant notices surface here before a user drills into settings."
        >
          {reminders.length > 0 ? (
            <ul className="panel-list">
              {reminders.map((reminder) => (
                <li key={reminder.id}>
                  <strong>{reminder.title}</strong>
                  <span
                    className={
                      reminder.tone === "warning"
                        ? "list-note is-warning"
                        : "list-note"
                    }
                  >
                    {reminder.body}
                  </span>
                </li>
              ))}
            </ul>
          ) : data.notifications.emptyReason ? (
            <EmptyState reason={data.notifications.emptyReason} />
          ) : (
            <EmptyState reason="no_data" />
          )}
        </SurfaceCard>
      </section>

      <SurfaceCard
        kicker="Identity"
        title="Tenant authority context"
        description="Role, realm, and tenant ownership stay authority-driven — read straight from the backend identity context."
      >
        {data.identity.emptyReason ? (
          <EmptyState reason={data.identity.emptyReason} />
        ) : (
          <dl className="definition-grid">
            <div>
              <dt>Tenant</dt>
              <dd>{identity?.tenantId ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Realm</dt>
              <dd>{identity?.realm ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Actor</dt>
              <dd>{identity?.actorType ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Auth mode</dt>
              <dd>{identity?.authMode ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Roles</dt>
              <dd>{identity?.roles.length ? identity.roles.join(", ") : "—"}</dd>
            </div>
          </dl>
        )}
      </SurfaceCard>

      <SurfaceCard
        kicker="Integration"
        title="Integration readiness"
        description="Aggregated sub-system readiness (Q-TEN10). Each tile drills into the owning surface; `not_provisioned` is shown honestly, never as mock-ready."
      >
        <div className="surface-grid">
          {readiness.map((item) => {
            const drill = READINESS_DRILL[item.subSystem];
            return (
              <article className="subsurface-card" key={item.subSystem}>
                <div className="link-row" style={{ alignItems: "center" }}>
                  <strong>{drill.label}</strong>
                  <span className={READINESS_TONE[item.status]}>
                    {item.status}
                  </span>
                </div>
                <p className="muted-copy">{item.detail}</p>
                {item.nextAction ? (
                  <div className="action-row">
                    <ActionCta descriptor={item.nextAction} />
                  </div>
                ) : (
                  <Link className="text-link" href={drill.href}>
                    Open {drill.label}
                  </Link>
                )}
              </article>
            );
          })}
        </div>
        <div className="link-row">
          <Link className="text-link" href="/integration-governance">
            Open integration governance
          </Link>
        </div>
      </SurfaceCard>

      <CalloutPanel
        title="Enabled module snapshot"
        description={
          data.featureFlags.emptyReason
            ? "Module enablement could not be read this cycle."
            : enabledFlags.length > 0
              ? `${formatCount(enabledFlags.length)} feature flag(s) currently resolve enabled for this tenant context.`
              : "No tenant-specific module flag resolved enabled."
        }
      >
        {data.featureFlags.emptyReason ? (
          <EmptyState reason={data.featureFlags.emptyReason} />
        ) : enabledFlags.length > 0 ? (
          <div className="chip-row">
            {enabledFlags.slice(0, 8).map((flag) => (
              <span className="status-chip" key={flag.key}>
                {flag.key}
              </span>
            ))}
          </div>
        ) : (
          <EmptyState reason="not_provisioned" />
        )}
      </CalloutPanel>

      <CalloutPanel
        title="Partner mode runs in a constrained shell"
        description="Partner booking lives at `/partner/*` with its own bootstrap session, partner-only navigation, and no tenant-admin governance exposure. Booking creation requires entry-scoped eligibility verification unless the entry is configured with `eligibility_mode = none`."
        tone="warning"
      >
        <div className="link-row">
          <Link className="text-link" href="/partner/login">
            Open partner sign-in
          </Link>
        </div>
      </CalloutPanel>
    </div>
  );
}
