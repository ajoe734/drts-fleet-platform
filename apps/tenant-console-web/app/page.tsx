import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  BookingRecord,
  CrossAppResourceLink,
  EmptyReason,
  FeatureFlagSummary,
  IdentityContext,
  NotificationRecord,
  RefreshTier,
  ResourceActionDescriptor,
  TenantIntegrationGovernancePackage,
  TenantIntegrationReadinessItem,
  TenantIntegrationReadinessSummary,
  TenantInvoiceRecord,
  TenantQuotaSummary,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasDL,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { DEMO_TENANT_ID, getTenantClient } from "@/lib/api-client";
import { formatCount, formatDateTime, formatMoney } from "@/lib/formatters";
import { TENANT_CONSOLE_ENV, tenantNavItems } from "@/lib/navigation";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const ATTENTION_STATUSES = new Set([
  "dispatch_failed",
  "dispatch_timeout",
  "exception_hold",
  "no_supply",
  "proof_pending",
  "redispatch_required",
]);

const REFRESH_TIER: RefreshTier = "slow";
const REFRESH_STALE_AFTER_MS = 30_000;
const EXISTING_APP_ROUTES = new Set([
  "/",
  "/api-keys",
  "/audit",
  "/bookings",
  "/cost-centers",
  "/invoices",
  "/passengers",
  "/rules",
  "/settings",
  "/users",
  "/webhooks",
]);

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const actionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const topGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.45fr 1fr",
  gap: 16,
  alignItems: "start",
};

const bottomGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.15fr 0.95fr",
  gap: 16,
  alignItems: "start",
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const cardStackStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const moduleSummaryStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const moduleTileStyle: CSSProperties = {
  border: `1px solid ${th.border}`,
  borderRadius: 16,
  padding: 12,
  background: "rgba(255,255,255,0.02)",
  display: "grid",
  gap: 8,
};

const navChipWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const navChipStyle: CSSProperties = {
  border: `1px solid ${th.border}`,
  borderRadius: 999,
  padding: "6px 10px",
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.1,
};

const emptyPanelStyle: CSSProperties = {
  border: `1px dashed ${th.border}`,
  borderRadius: 16,
  padding: 16,
  background: "rgba(255,255,255,0.02)",
  display: "grid",
  gap: 10,
};

const actionTileBaseStyle: CSSProperties = {
  border: `1px solid ${th.border}`,
  borderRadius: 18,
  padding: 14,
  background: "rgba(255,255,255,0.03)",
  display: "grid",
  gap: 10,
  textDecoration: "none",
  color: th.text,
};

const actionTileDisabledStyle: CSSProperties = {
  ...actionTileBaseStyle,
  opacity: 0.54,
};

const actionMetaStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const emptyActionStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  width: "fit-content",
  borderRadius: 999,
  padding: "8px 12px",
  background: th.accent,
  color: th.bg,
  fontWeight: 600,
  fontSize: 12,
  textDecoration: "none",
};

const secondaryActionStyle: CSSProperties = {
  ...emptyActionStyle,
  background: "rgba(255,255,255,0.08)",
  color: th.text,
};

const externalLinkStyle: CSSProperties = {
  border: `1px solid ${th.border}`,
  borderRadius: 16,
  padding: 12,
  background: "rgba(255,255,255,0.02)",
  display: "grid",
  gap: 6,
  textDecoration: "none",
  color: th.text,
};

const statusCopyStyle: CSSProperties = {
  fontFamily: th.monoFamily,
  color: th.textMuted,
  fontSize: 11.5,
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 600,
  color: th.text,
};

const sectionBodyStyle: CSSProperties = {
  margin: 0,
  fontSize: 12.5,
  color: th.textMuted,
  lineHeight: 1.5,
};

type DashboardData = {
  identity: IdentityContext | null;
  featureFlags: FeatureFlagSummary | null;
  bookings: BookingRecord[];
  invoices: TenantInvoiceRecord[];
  notifications: NotificationRecord[];
  governance: TenantIntegrationGovernancePackage | null;
  readiness: TenantIntegrationReadinessSummary | null;
  quotaSummary: TenantQuotaSummary | null;
  errors: string[];
};

type AvailableAction = {
  label: string;
  href: string;
  description: string;
  descriptor: ResourceActionDescriptor;
};

type WorkspaceShortcut = {
  key: string;
  label: string;
  href: string;
  description: string;
};

type WorkspaceModule = {
  key: string;
  title: string;
  href: string;
  status: "ready" | "attention" | "not_provisioned";
  body: string;
  meta: string;
};

type RecentBookingRow = {
  bookingId: string;
  passenger: string;
  route: string;
  window: string;
  status: BookingRecord["orderStatus"];
  updatedAt: string;
};

type HomeEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;

type EmptyPresentation = {
  tone: "info" | "warn" | "danger";
  icon: "warn" | "info" | "clock" | "ok";
  title: string;
  body: string;
  nextAction?: AvailableAction;
};

async function loadDashboardData(): Promise<DashboardData> {
  const client = getTenantClient();
  const [
    identity,
    featureFlags,
    bookings,
    invoices,
    notifications,
    governance,
    readiness,
    quotaSummary,
  ] = await Promise.allSettled([
    client.getIdentityContext() as Promise<IdentityContext>,
    client.getFeatureFlags({
      tenantId: DEMO_TENANT_ID,
    }) as Promise<FeatureFlagSummary>,
    client.listTenantBookings() as Promise<BookingRecord[]>,
    client.listInvoices() as Promise<TenantInvoiceRecord[]>,
    client.listTenantNotificationFeed() as Promise<NotificationRecord[]>,
    client.getTenantIntegrationGovernancePackage() as Promise<TenantIntegrationGovernancePackage>,
    client.getTenantIntegrationReadinessSummary() as Promise<TenantIntegrationReadinessSummary>,
    client.getTenantQuotaSummary() as Promise<TenantQuotaSummary>,
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

  collectError("Identity", identity);
  collectError("Feature flags", featureFlags);
  collectError("Bookings", bookings);
  collectError("Invoices", invoices);
  collectError("Notifications", notifications);
  collectError("Integration governance", governance);
  collectError("Integration readiness", readiness);
  collectError("Tenant quota", quotaSummary);

  return {
    identity: identity.status === "fulfilled" ? identity.value : null,
    featureFlags:
      featureFlags.status === "fulfilled" ? featureFlags.value : null,
    bookings: bookings.status === "fulfilled" ? bookings.value : [],
    invoices: invoices.status === "fulfilled" ? invoices.value : [],
    notifications:
      notifications.status === "fulfilled" ? notifications.value : [],
    governance: governance.status === "fulfilled" ? governance.value : null,
    readiness: readiness.status === "fulfilled" ? readiness.value : null,
    quotaSummary:
      quotaSummary.status === "fulfilled" ? quotaSummary.value : null,
    errors,
  };
}

function buildRefreshMetadata(data: DashboardData): UiRefreshMetadata {
  const generatedAt =
    [
      data.quotaSummary?.refreshedAt,
      data.readiness?.computedAt,
      data.governance?.generatedAt,
      ...data.bookings.slice(0, 8).map((booking) => booking.updatedAt),
      ...data.invoices.slice(0, 4).map((invoice) => invoice.periodEnd),
      ...data.notifications
        .slice(0, 4)
        .map((notification) => notification.createdAt),
    ]
      .filter(Boolean)
      .sort()
      .at(-1) ?? new Date().toISOString();

  return {
    generatedAt,
    staleAfterMs: REFRESH_STALE_AFTER_MS,
    dataFreshness: data.errors.length > 0 ? "degraded" : "fresh",
    source: "live",
  };
}

function getRefreshLabel(refresh: UiRefreshMetadata) {
  return `T5 · ${REFRESH_TIER} · ${refresh.dataFreshness}`;
}

function getReadinessItem(
  readiness: TenantIntegrationReadinessSummary | null,
  subSystem: TenantIntegrationReadinessItem["subSystem"],
) {
  return readiness?.items.find((item) => item.subSystem === subSystem) ?? null;
}

function getActionRoute(action: string) {
  const directRoutes: Record<string, string> = {
    "booking.create": "/bookings/new",
    "booking.list_today": "/bookings",
    "integration.open_governance": "/integration-governance",
  };

  if (directRoutes[action]) {
    return directRoutes[action];
  }

  if (action.includes("api_key")) {
    return "/api-keys";
  }

  if (action.includes("webhook")) {
    return "/webhooks";
  }

  if (action.includes("notification")) {
    return "/notifications";
  }

  if (action.includes("sla")) {
    return "/sla";
  }

  if (action.includes("billing") || action.includes("invoice")) {
    return "/billing";
  }

  if (action.includes("report")) {
    return "/reports";
  }

  if (action.includes("user")) {
    return "/users";
  }

  return "/integration-governance";
}

function getActionLabel(action: string) {
  switch (action) {
    case "booking.create":
      return "New booking";
    case "booking.list_today":
      return "View today's bookings";
    case "issue_api_key":
      return "Issue API key";
    case "integration.open_governance":
      return "Open integration governance";
    default:
      if (action.includes("webhook")) {
        return "Set up webhook";
      }
      if (action.includes("notification")) {
        return "Configure notifications";
      }
      if (action.includes("sla")) {
        return "Configure SLA";
      }
      return action.replaceAll("_", " ");
  }
}

function getActionDescription(action: string) {
  if (action === "booking.create") {
    return "Open the command-based booking flow directly from workspace home.";
  }

  if (action === "booking.list_today") {
    return "Jump into the live queue and review today’s booking changes.";
  }

  if (action.includes("api_key")) {
    return "Resolve tenant integration onboarding by issuing or rotating an API credential.";
  }

  if (action.includes("webhook")) {
    return "Connect delivery events and verify the endpoint before cutover.";
  }

  if (action.includes("notification")) {
    return "Review baseline subscriptions and tenant-specific notification overrides.";
  }

  if (action.includes("sla")) {
    return "Inspect the SLA profile and close any remaining governance gap.";
  }

  return "Follow the backend-supplied action descriptor from the current readiness state.";
}

function toAvailableAction(
  descriptor: ResourceActionDescriptor,
): AvailableAction {
  return {
    label: getActionLabel(descriptor.action),
    href: getActionRoute(descriptor.action),
    description: getActionDescription(descriptor.action),
    descriptor,
  };
}

function dedupeAvailableActions(actions: ResourceActionDescriptor[]) {
  const seen = new Set<string>();

  return actions.filter((descriptor) => {
    const key = `${descriptor.action}:${descriptor.enabled}:${descriptor.disabledReasonCode ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildAvailableActions(data: DashboardData): AvailableAction[] {
  const readinessActions =
    data.readiness?.items
      .map((item) => item.nextAction)
      .filter((action): action is ResourceActionDescriptor =>
        Boolean(action),
      ) ?? [];

  return dedupeAvailableActions(readinessActions).map(toAvailableAction);
}

function buildWorkspaceShortcuts(
  identity: IdentityContext | null,
): WorkspaceShortcut[] {
  const tenantId = identity?.tenantId ?? DEMO_TENANT_ID;

  return [
    {
      key: "bookings-new",
      label: "New booking",
      href: "/bookings/new",
      description:
        "Open the booking command flow directly from workspace home.",
    },
    {
      key: "bookings-today",
      label: "View today's bookings",
      href: "/bookings",
      description:
        "Jump to the live tenant queue and review today’s booking changes.",
    },
    {
      key: "integration-governance",
      label: "Open integration governance",
      href: "/integration-governance",
      description:
        "Inspect aggregated readiness and drill into onboarding blockers.",
    },
    {
      key: "ops-audit",
      label: "Ops complaints for this tenant",
      href: `${getExternalAppBaseUrl("ops-console")}/complaints?tenantId=${encodeURIComponent(tenantId)}`,
      description: "Open the tenant-scoped ops complaint queue in a new tab.",
    },
  ];
}

function isModuleFlagEnabled(flags: FeatureFlagSummary["flags"], key: string) {
  const related = flags.filter((flag) => flag.key.includes(key));
  if (related.length === 0) {
    return true;
  }

  return related.some((flag) => flag.enabled);
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

function buildModuleSummary(data: DashboardData): WorkspaceModule[] {
  const flags = data.featureFlags?.flags ?? [];
  const activeBookings = getActiveBookings(data.bookings);
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
      status:
        attentionBookings.length > 0
          ? "attention"
          : activeBookings.length > 0
            ? "ready"
            : "not_provisioned",
      body: "Current queue, recent status changes, and today’s operator follow-up.",
      meta:
        activeBookings.length > 0
          ? `${formatCount(activeBookings.length)} active · ${formatCount(attentionBookings.length)} attention`
          : "No active booking rows returned.",
    },
    {
      key: "integration",
      title: "Integration",
      href: "/integration-governance",
      status: mapReadinessStatus(getReadinessItem(data.readiness, "modules")),
      body: "Aggregated API key, webhook, notification, SLA, and module readiness.",
      meta:
        getReadinessItem(data.readiness, "modules")?.detail ??
        "No module-level readiness detail returned.",
    },
    {
      key: "billing",
      title: "Billing",
      href: "/billing",
      status:
        openInvoices.length > 0
          ? "attention"
          : data.invoices.length > 0
            ? "ready"
            : "not_provisioned",
      body: "Invoice posture, current period visibility, and finance-facing follow-up.",
      meta:
        data.invoices.length > 0
          ? `${formatCount(openInvoices.length)} invoice(s) not paid`
          : "No invoice artifacts visible yet.",
    },
    {
      key: "users",
      title: "Access",
      href: "/users",
      status: data.identity?.tenantId ? "ready" : "not_provisioned",
      body: "Tenant roles, actor context, and module visibility guardrails.",
      meta: data.identity?.roles.length
        ? data.identity.roles.join(" / ")
        : "Role context unavailable.",
    },
  ] satisfies WorkspaceModule[];

  return modules.filter((module) => isModuleFlagEnabled(flags, module.key));
}

function getActiveBookings(bookings: BookingRecord[]) {
  return bookings.filter(
    (booking) =>
      booking.orderStatus !== "completed" &&
      booking.orderStatus !== "cancelled",
  );
}

function getVisibleNavItems(data: DashboardData) {
  const flags = data.featureFlags?.flags ?? [];
  return tenantNavItems.filter((item) => isModuleFlagEnabled(flags, item.key));
}

function getTenantSuspendedSignal(data: DashboardData) {
  const sources = [
    ...data.errors,
    ...(data.featureFlags?.notes ?? []),
    ...(data.governance?.onboardingChecklist ?? []),
  ].join(" ");

  return /\bsuspend(ed)?\b/i.test(sources);
}

function getWorkspaceEmptyReason(
  data: DashboardData,
  visibleModules: WorkspaceModule[],
): HomeEmptyReason | null {
  if (!data.identity?.tenantId) {
    return "permission_denied";
  }

  if (data.errors.some((error) => error.startsWith("Bookings:"))) {
    return "fetch_failed";
  }

  if (
    data.readiness?.items.some((item) => item.status === "blocked") ||
    data.notifications.length === 0
  ) {
    return "external_unavailable";
  }

  if (
    data.readiness?.items.some((item) => item.status === "not_provisioned") ||
    (data.governance?.onboardingChecklist.length ?? 0) > 0
  ) {
    return "not_provisioned";
  }

  if (data.bookings.length === 0) {
    return "no_data";
  }

  if (visibleModules.length === 0) {
    return "filtered_empty";
  }

  return null;
}

function getEmptyPresentation(
  reason: HomeEmptyReason,
  availableActions: AvailableAction[],
): EmptyPresentation {
  const integrationAction =
    availableActions.find((action) =>
      [
        "integration.open_governance",
        "issue_api_key",
        "create_webhook",
        "configure_notifications",
        "configure_sla",
      ].includes(action.descriptor.action),
    ) ?? availableActions[0];

  switch (reason) {
    case "no_data":
      return {
        tone: "info",
        icon: "info",
        title: "No tenant activity yet",
        body: "This tenant has no recent bookings, so workspace home stays focused on entry actions and visible modules.",
      };
    case "not_provisioned":
      return {
        tone: "warn",
        icon: "warn",
        title: "Provisioning is still incomplete",
        body: "At least one subsystem still needs onboarding across API keys, webhooks, notifications, or SLA.",
        ...(integrationAction ? { nextAction: integrationAction } : {}),
      };
    case "fetch_failed":
      return {
        tone: "warn",
        icon: "clock",
        title: "Some workspace data failed to load",
        body: "The current snapshot is partial. Refresh and drill into the affected module for more detail.",
      };
    case "permission_denied":
      return {
        tone: "warn",
        icon: "warn",
        title: "Tenant context is unavailable for this actor",
        body: "Workspace home cannot render tenant-scoped actions without a valid tenant identity context.",
      };
    case "external_unavailable":
      return {
        tone: "warn",
        icon: "clock",
        title: "An external dependency is unavailable",
        body: "At least one upstream integration or notification dependency is currently degraded.",
        ...(integrationAction ? { nextAction: integrationAction } : {}),
      };
    case "filtered_empty":
      return {
        tone: "info",
        icon: "info",
        title: "Visible modules are fully filtered out",
        body: "Feature visibility and module gating currently hide every workspace entry point for this actor.",
      };
  }
}

function getStatusTone(
  status: WorkspaceModule["status"] | TenantIntegrationReadinessItem["status"],
): CanvasTone {
  switch (status) {
    case "ready":
      return "success";
    case "attention":
    case "partial":
      return "warn";
    case "blocked":
      return "danger";
    default:
      return "neutral";
  }
}

function getBookingStatusTone(
  status: BookingRecord["orderStatus"],
): CanvasTone {
  if (ATTENTION_STATUSES.has(status)) {
    return "warn";
  }

  if (
    status === "assigned" ||
    status === "driver_accepted" ||
    status === "enroute_pickup" ||
    status === "arrived_pickup" ||
    status === "on_trip"
  ) {
    return "success";
  }

  return "info";
}

function formatQuotaValue(data: DashboardData) {
  const quota = data.quotaSummary;
  if (!quota) {
    return "—";
  }

  const used =
    quota.usage.pendingReservedBookingCount + quota.usage.confirmedBookingCount;
  const limit = quota.limit.bookingCountLimit;

  return limit === null
    ? `${formatCount(used)} used`
    : `${formatCount(used)} / ${formatCount(limit)}`;
}

function formatQuotaSubline(data: DashboardData) {
  const quota = data.quotaSummary;
  if (!quota) {
    return "Tenant quota summary unavailable";
  }

  if (quota.usage.remainingPercent === null) {
    return `${quota.periodKey} · unlimited`;
  }

  return `${quota.periodKey} · ${quota.usage.remainingPercent}% remaining`;
}

function getLatestInvoice(invoices: TenantInvoiceRecord[]) {
  return (
    [...invoices].sort((left, right) =>
      right.periodEnd.localeCompare(left.periodEnd),
    )[0] ?? null
  );
}

function buildRecentBookingRows(bookings: BookingRecord[]): RecentBookingRow[] {
  return getActiveBookings(bookings)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 5)
    .map((booking) => ({
      bookingId: booking.bookingId,
      passenger: booking.passenger.name,
      route: `${booking.pickup.address} → ${booking.dropoff.address}`,
      window: `${formatDateTime(booking.reservationWindowStart)} to ${formatDateTime(booking.reservationWindowEnd)}`,
      status: booking.orderStatus,
      updatedAt: booking.updatedAt,
    }));
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

function renderActionTile(action: AvailableAction) {
  const content = (
    <>
      <div style={cardStackStyle}>
        <p style={sectionTitleStyle}>{action.label}</p>
        <p style={sectionBodyStyle}>{action.description}</p>
      </div>
      <div style={actionMetaStyle}>
        <CanvasPill
          theme={th}
          tone={action.descriptor.enabled ? "accent" : "neutral"}
        >
          {action.descriptor.riskLevel}
        </CanvasPill>
        <span style={statusCopyStyle}>
          {action.descriptor.enabled
            ? action.descriptor.action
            : (action.descriptor.disabledReasonCode ?? "disabled")}
        </span>
        {!EXISTING_APP_ROUTES.has(action.href) ? (
          <CanvasPill theme={th} tone="warn">
            spec route
          </CanvasPill>
        ) : null}
      </div>
    </>
  );

  if (!action.descriptor.enabled) {
    return (
      <div key={action.label} style={actionTileDisabledStyle}>
        {content}
      </div>
    );
  }

  return (
    <Link href={action.href} key={action.label} style={actionTileBaseStyle}>
      {content}
    </Link>
  );
}

function renderEmptyAction(
  action: AvailableAction | undefined,
  variant = "primary",
) {
  if (!action) {
    return null;
  }

  const style = variant === "primary" ? emptyActionStyle : secondaryActionStyle;

  if (!action.descriptor.enabled) {
    return (
      <span style={style}>
        {action.label} · {action.descriptor.disabledReasonCode ?? "disabled"}
      </span>
    );
  }

  return (
    <Link href={action.href} style={style}>
      {action.label}
    </Link>
  );
}

function renderShortcutTile(shortcut: WorkspaceShortcut) {
  const isExternal =
    shortcut.href.startsWith("http://") || shortcut.href.startsWith("https://");

  if (isExternal) {
    return (
      <a
        href={shortcut.href}
        key={shortcut.key}
        rel="noreferrer"
        style={actionTileBaseStyle}
        target="_blank"
      >
        <div style={cardStackStyle}>
          <p style={sectionTitleStyle}>{shortcut.label}</p>
          <p style={sectionBodyStyle}>{shortcut.description}</p>
        </div>
        <div style={actionMetaStyle}>
          <CanvasPill theme={th} tone="info">
            shortcut
          </CanvasPill>
          <span style={statusCopyStyle}>new_tab</span>
        </div>
      </a>
    );
  }

  return (
    <Link href={shortcut.href} key={shortcut.key} style={actionTileBaseStyle}>
      <div style={cardStackStyle}>
        <p style={sectionTitleStyle}>{shortcut.label}</p>
        <p style={sectionBodyStyle}>{shortcut.description}</p>
      </div>
      <div style={actionMetaStyle}>
        <CanvasPill theme={th} tone="neutral">
          shortcut
        </CanvasPill>
        <span style={statusCopyStyle}>{shortcut.href}</span>
        {!EXISTING_APP_ROUTES.has(shortcut.href) ? (
          <CanvasPill theme={th} tone="warn">
            spec route
          </CanvasPill>
        ) : null}
      </div>
    </Link>
  );
}

function renderNavChip(label: ReactNode, href: string) {
  if (EXISTING_APP_ROUTES.has(href)) {
    return (
      <Link href={href} key={href} style={navChipStyle}>
        {label}
      </Link>
    );
  }

  return (
    <span key={href} style={navChipStyle}>
      {label}
    </span>
  );
}

export default async function HomePage() {
  const data = await loadDashboardData();
  const refresh = buildRefreshMetadata(data);
  const availableActions = buildAvailableActions(data);
  const workspaceShortcuts = buildWorkspaceShortcuts(data.identity);
  const visibleNavItems = getVisibleNavItems(data);
  const modules = buildModuleSummary(data);
  const emptyReason = getWorkspaceEmptyReason(data, modules);
  const emptyPresentation = emptyReason
    ? getEmptyPresentation(emptyReason, availableActions)
    : null;
  const isSuspended = getTenantSuspendedSignal(data);
  const activeBookings = getActiveBookings(data.bookings);
  const attentionBookings = activeBookings.filter((booking) =>
    ATTENTION_STATUSES.has(booking.orderStatus),
  );
  const recentRows = buildRecentBookingRows(data.bookings);
  const latestInvoice = getLatestInvoice(data.invoices);
  const externalLinks = buildCrossAppLinks(
    data.identity?.tenantId ?? DEMO_TENANT_ID,
  );
  const readinessItems = data.readiness?.items ?? [];

  const recentBookingColumns: CanvasTableColumn<RecentBookingRow>[] = [
    {
      h: "BOOKING",
      w: 120,
      mono: true,
      r: (row) => (
        <span style={{ color: th.accent, fontWeight: 600 }}>
          {row.bookingId}
        </span>
      ),
    },
    {
      h: "PASSENGER",
      w: 120,
      r: (row) => row.passenger,
    },
    {
      h: "ROUTE",
      r: (row) => row.route,
    },
    {
      h: "WINDOW",
      w: 200,
      mono: true,
      r: (row) => row.window,
    },
    {
      h: "STATE",
      w: 150,
      r: (row) => (
        <CanvasPill theme={th} tone={getBookingStatusTone(row.status)} dot>
          {row.status}
        </CanvasPill>
      ),
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title={
          data.identity?.tenantId
            ? `Workspace for ${data.identity.tenantId}`
            : "Tenant workspace"
        }
        subtitle="Identity context, module capability, integration health, and quick action entry points."
        actions={
          <CanvasPill
            theme={th}
            tone={refresh.dataFreshness === "degraded" ? "warn" : "info"}
          >
            {getRefreshLabel(refresh)}
          </CanvasPill>
        }
      />

      <div style={pageBodyStyle}>
        {isSuspended ? (
          <CanvasBanner
            theme={th}
            tone="danger"
            icon="warn"
            title="Tenant is currently suspended"
            body="Workspace home stays visible for inspection, but some actions may remain blocked until the lifecycle suspension is cleared."
          />
        ) : null}

        {refresh.dataFreshness === "degraded" ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="clock"
            title="Workspace home is rendering a degraded snapshot"
            body={`Generated ${formatDateTime(refresh.generatedAt)} · poll tier ${REFRESH_TIER} · one or more slices failed to load.`}
          />
        ) : null}

        {emptyPresentation ? (
          <CanvasBanner
            theme={th}
            tone={emptyPresentation.tone}
            icon={emptyPresentation.icon}
            title={`${emptyReason} · ${emptyPresentation.title}`}
            body={emptyPresentation.body}
          />
        ) : null}

        {availableActions.length > 0 ? (
          <CanvasCard
            theme={th}
            title="Backend-owned available actions"
            subtitle="Home renders only authoritative action descriptors returned by tenant read models."
          >
            <div style={actionGridStyle}>
              {availableActions.map(renderActionTile)}
            </div>
          </CanvasCard>
        ) : (
          <CanvasCard
            theme={th}
            title="Backend-owned available actions"
            subtitle="No authoritative action descriptor was returned for the current tenant snapshot."
          >
            <div style={emptyPanelStyle}>
              <strong style={sectionTitleStyle}>availableActions</strong>
              <p style={sectionBodyStyle}>
                Workspace home falls back to navigation shortcuts below instead
                of fabricating write CTAs in the UI.
              </p>
            </div>
          </CanvasCard>
        )}

        <CanvasCard
          theme={th}
          title="Workspace shortcuts"
          subtitle="Packet-required entry points that remain stable even when no backend action descriptor is returned."
        >
          <div style={actionGridStyle}>
            {workspaceShortcuts.map(renderShortcutTile)}
          </div>
        </CanvasCard>

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="進行中"
            value={formatCount(activeBookings.length)}
            sub={
              attentionBookings.length > 0
                ? `${formatCount(attentionBookings.length)} require follow-up`
                : "No active attention queue"
            }
          />
          <CanvasKPI
            theme={th}
            label="本月配額"
            value={formatQuotaValue(data)}
            sub={formatQuotaSubline(data)}
          />
          <CanvasKPI
            theme={th}
            label="當期帳單"
            value={
              latestInvoice?.amount ? formatMoney(latestInvoice.amount) : "—"
            }
            sub={
              latestInvoice
                ? latestInvoice.invoiceId
                : "No visible invoice artifact"
            }
          />
          <CanvasKPI
            theme={th}
            label="可見模組"
            value={formatCount(modules.length)}
            sub={`${formatCount(visibleNavItems.length)} nav entries after feature gating`}
          />
        </div>

        <div style={topGridStyle}>
          <CanvasCard
            theme={th}
            title="Current bookings and recent updates"
            subtitle="Workspace answers whether anything urgent needs attention today."
          >
            {recentRows.length > 0 ? (
              <CanvasTable<RecentBookingRow>
                theme={th}
                rows={recentRows}
                columns={recentBookingColumns}
              />
            ) : (
              <div style={emptyPanelStyle}>
                <strong style={sectionTitleStyle}>no_data</strong>
                <p style={sectionBodyStyle}>
                  No active booking rows are available for the current tenant
                  snapshot.
                </p>
                <Link href="/bookings/new" style={emptyActionStyle}>
                  New booking
                </Link>
              </div>
            )}
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="Identity, environment, and visible modules"
            subtitle="Module and nav visibility stay feature-flag aware."
          >
            <CanvasDL
              theme={th}
              cols={2}
              items={[
                {
                  k: "Tenant",
                  v: data.identity?.tenantId ?? DEMO_TENANT_ID,
                  mono: true,
                },
                {
                  k: "Environment",
                  v: TENANT_CONSOLE_ENV,
                  mono: true,
                },
                {
                  k: "Actor type",
                  v: data.identity?.actorType ?? "unknown",
                  mono: true,
                },
                {
                  k: "Realm",
                  v: data.identity?.realm ?? "unknown",
                  mono: true,
                },
                {
                  k: "Auth mode",
                  v: data.identity?.authMode ?? "unknown",
                  mono: true,
                },
                {
                  k: "Refresh",
                  v: `${REFRESH_TIER} · ${formatDateTime(refresh.generatedAt)}`,
                  mono: true,
                },
              ]}
            />

            <div style={cardStackStyle}>
              <p style={sectionTitleStyle}>Visible module nav</p>
              <div style={navChipWrapStyle}>
                {visibleNavItems.map((item) =>
                  renderNavChip(item.label, item.href),
                )}
              </div>
            </div>
          </CanvasCard>
        </div>

        <div style={bottomGridStyle}>
          <div style={cardStackStyle}>
            <CanvasCard
              theme={th}
              title="Module enablement summary"
              subtitle="Per-spec module capability stays visible on the landing page."
            >
              {modules.length > 0 ? (
                <div style={moduleSummaryStyle}>
                  {modules.map((module) => (
                    <Link
                      href={module.href}
                      key={module.key}
                      style={moduleTileStyle}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <p style={sectionTitleStyle}>{module.title}</p>
                        <CanvasPill
                          theme={th}
                          tone={getStatusTone(module.status)}
                        >
                          {module.status}
                        </CanvasPill>
                      </div>
                      <p style={sectionBodyStyle}>{module.body}</p>
                      <span style={statusCopyStyle}>{module.meta}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div style={emptyPanelStyle}>
                  <strong style={sectionTitleStyle}>filtered_empty</strong>
                  <p style={sectionBodyStyle}>
                    No module is currently visible after feature and role
                    gating.
                  </p>
                </div>
              )}
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="Integration health"
              subtitle="Aggregated readiness and governance checklist follow packet §5 behaviour."
            >
              <div style={cardStackStyle}>
                {readinessItems.length > 0 ? (
                  readinessItems.map((item) => (
                    <div key={item.subSystem} style={moduleTileStyle}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <p style={sectionTitleStyle}>{item.subSystem}</p>
                        <CanvasPill
                          theme={th}
                          tone={getStatusTone(item.status)}
                        >
                          {item.status}
                        </CanvasPill>
                      </div>
                      <p style={sectionBodyStyle}>
                        {item.detail ?? "No additional detail was returned."}
                      </p>
                      <div style={actionMetaStyle}>
                        <span style={statusCopyStyle}>
                          {item.nextAction?.action ?? "no nextAction"}
                        </span>
                        {item.nextAction ? (
                          <Link
                            href={getActionRoute(item.nextAction.action)}
                            style={secondaryActionStyle}
                          >
                            {getActionLabel(item.nextAction.action)}
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={emptyPanelStyle}>
                    <strong style={sectionTitleStyle}>fetch_failed</strong>
                    <p style={sectionBodyStyle}>
                      Aggregated readiness is unavailable, so only
                      governance-based fallback messaging can render.
                    </p>
                  </div>
                )}

                <div style={emptyPanelStyle}>
                  <strong style={sectionTitleStyle}>
                    Governance checklist
                  </strong>
                  {(data.governance?.onboardingChecklist.length ?? 0) > 0 ? (
                    <div style={cardStackStyle}>
                      {data.governance?.onboardingChecklist
                        .slice(0, 5)
                        .map((item) => (
                          <span key={item} style={sectionBodyStyle}>
                            • {item}
                          </span>
                        ))}
                    </div>
                  ) : (
                    <p style={sectionBodyStyle}>
                      No open onboarding checklist item was returned.
                    </p>
                  )}
                </div>
              </div>
            </CanvasCard>
          </div>

          <div style={cardStackStyle}>
            <CanvasCard
              theme={th}
              title="Cross-app deep links"
              subtitle="Ops and platform references open in a new tab and stay tenant-scoped."
            >
              <div style={cardStackStyle}>
                {externalLinks.map((link) => (
                  <a
                    href={toExternalHref(link)}
                    key={`${link.targetApp}-${link.route}`}
                    rel="noreferrer"
                    style={externalLinkStyle}
                    target={link.openMode === "new_tab" ? "_blank" : undefined}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <p style={sectionTitleStyle}>{link.label}</p>
                      <CanvasPill theme={th} tone="info">
                        {link.targetApp}
                      </CanvasPill>
                    </div>
                    <p style={sectionBodyStyle}>{link.route}</p>
                  </a>
                ))}
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="Notices and empty-state outcomes"
              subtitle="Distinct `EmptyReason` branches and current tenant notices are visible from home."
            >
              <div style={cardStackStyle}>
                {data.notifications.length > 0 ? (
                  data.notifications.slice(0, 4).map((notification) => (
                    <div
                      key={notification.notificationId}
                      style={moduleTileStyle}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <p style={sectionTitleStyle}>{notification.title}</p>
                        <CanvasPill theme={th} tone="neutral">
                          {notification.channel}
                        </CanvasPill>
                      </div>
                      <p style={sectionBodyStyle}>{notification.message}</p>
                      <span style={statusCopyStyle}>
                        {formatDateTime(notification.createdAt)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={emptyPanelStyle}>
                    <strong style={sectionTitleStyle}>
                      external_unavailable
                    </strong>
                    <p style={sectionBodyStyle}>
                      No notification feed item is currently available.
                    </p>
                  </div>
                )}

                {emptyPresentation ? (
                  <div style={emptyPanelStyle}>
                    <strong style={sectionTitleStyle}>
                      Current empty-state branch: {emptyReason}
                    </strong>
                    <p style={sectionBodyStyle}>{emptyPresentation.body}</p>
                    {renderEmptyAction(emptyPresentation.nextAction)}
                  </div>
                ) : (
                  <div style={emptyPanelStyle}>
                    <strong style={sectionTitleStyle}>Normal state</strong>
                    <p style={sectionBodyStyle}>
                      Current tenant snapshot is not in one of the six home
                      empty-state branches.
                    </p>
                    {renderEmptyAction(
                      availableActions.find(
                        (action) =>
                          action.descriptor.action === "booking.list_today",
                      ),
                      "secondary",
                    )}
                  </div>
                )}
              </div>
            </CanvasCard>
          </div>
        </div>

        {data.errors.length > 0 ? (
          <CanvasCard
            theme={th}
            title="Partial data warnings"
            subtitle="Machine-visible fetch failures remain explicit on the page."
          >
            <div style={cardStackStyle}>
              {data.errors.map((error) => (
                <span key={error} style={sectionBodyStyle}>
                  • {error}
                </span>
              ))}
            </div>
          </CanvasCard>
        ) : null}
      </div>
    </div>
  );
}
