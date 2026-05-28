import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  ApiErrorEnvelope,
  ApiListData,
  ApiSuccessEnvelope,
  BookingRecord,
  BusinessDispatchSubtype,
  CrossAppResourceLink,
  EmptyReason,
  Phase1ServiceBucket,
  RefreshTier,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  BUSINESS_DISPATCH_SUBTYPES,
  OWNED_ORDER_STATUSES,
  PHASE1_SERVICE_BUCKETS,
  CanvasBanner,
  CanvasCard,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { RefreshTierControl } from "@/app/bookings/refresh-tier-control";
import {
  applyBookingListQuery,
  buildBookingListQueryString,
  hasActiveBookingFilters,
  parseBookingListQuery,
  toggleStatus,
} from "@/lib/booking-list";
import { API_URL, DEMO_ACTOR_ID, DEMO_TENANT_ID } from "@/lib/api-client";
import { formatDateTime, formatMoney } from "@/lib/formatters";
import {
  getBookingSourceVisibility,
  getSourceToneClassName,
} from "@/lib/source-domain";

export const dynamic = "force-dynamic";

const theme = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const BOOKING_REFRESH_TIER: RefreshTier = "slow";
const BOOKING_STALE_AFTER_MS = 30_000;
const OPS_CONSOLE_ORIGIN =
  process.env.NEXT_PUBLIC_OPS_CONSOLE_ORIGIN ?? "http://localhost:3103";

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const contentGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.65fr) minmax(300px, 0.95fr)",
  gap: 16,
  alignItems: "start",
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const fieldLabelStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 11.5,
  fontWeight: 700,
  color: theme.textMuted,
  letterSpacing: 0.24,
  textTransform: "uppercase",
};

const inputStyle: CSSProperties = {
  width: "100%",
  height: 34,
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  color: theme.text,
  padding: "0 10px",
  fontSize: 12.5,
  fontFamily: theme.fontFamily,
};

const summaryListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const summaryRowStyle: CSSProperties = {
  display: "grid",
  gap: 4,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const actionLinkStyle = (variant: "primary" | "secondary" = "secondary") =>
  ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 28,
    padding: "0 10px",
    borderRadius: 8,
    border: `1px solid ${variant === "primary" ? theme.accent : theme.border}`,
    background: variant === "primary" ? theme.accent : theme.surface,
    color: variant === "primary" ? "#ffffff" : theme.text,
    fontSize: 12,
    fontWeight: 600,
    textDecoration: "none",
    whiteSpace: "nowrap",
  }) satisfies CSSProperties;

const disabledActionStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 28,
  padding: "0 10px",
  borderRadius: 8,
  border: `1px dashed ${theme.border}`,
  color: theme.textMuted,
  fontSize: 12,
  whiteSpace: "nowrap",
};

const primaryTextStyle: CSSProperties = {
  color: theme.text,
  fontWeight: 600,
};

const secondaryTextStyle: CSSProperties = {
  color: theme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
};

type SearchParamValue = string | string[] | undefined;
type BookingEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;

type BookingSlaStatus = {
  label: string;
  tone: CanvasTone;
  detail: string;
};

type BookingListRecord = BookingRecord & {
  availableActions: ResourceActionDescriptor[];
  editableUntil: string | null;
  crossAppLinks: CrossAppResourceLink[];
  slaStatus: BookingSlaStatus | null;
};

type BookingRow = Record<string, unknown> & {
  bookingCell: ReactNode;
  passengerCell: ReactNode;
  scheduleCell: ReactNode;
  routeCell: ReactNode;
  statusCell: ReactNode;
  fulfillmentCell: ReactNode;
  fareCell: ReactNode;
  actionCell: ReactNode;
  _selected?: boolean;
};

type BookingListPageData = {
  bookings: BookingListRecord[];
  pageInfo: ApiListData<BookingRecord>["pageInfo"];
  refresh: UiRefreshMetadata;
  emptyReason: BookingEmptyReason | null;
  errorMessage: string | null;
};

function first(value: SearchParamValue) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function parseEmptyReason(value: string): BookingEmptyReason | null {
  switch (value) {
    case "no_data":
    case "not_provisioned":
    case "fetch_failed":
    case "permission_denied":
    case "external_unavailable":
    case "filtered_empty":
      return value;
    default:
      return null;
  }
}

function parseDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatMinutes(minutes: number) {
  return `${new Intl.NumberFormat("en").format(minutes)}m`;
}

function formatRelativeDuration(value: string | null | undefined) {
  const parsed = parseDate(value);
  if (!parsed) {
    return "Not available";
  }

  const diffMs = Date.now() - parsed.getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));

  if (diffMinutes < 60) {
    return `${formatMinutes(diffMinutes)} old`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h old`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d old`;
}

function formatRemainingWindow(value: string | null | undefined) {
  const parsed = parseDate(value);
  if (!parsed) {
    return null;
  }

  const diffMs = parsed.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes <= 0) {
    return "Closed";
  }
  if (diffMinutes < 60) {
    return `${formatMinutes(diffMinutes)} left`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  const remainderMinutes = diffMinutes % 60;
  return `${diffHours}h ${remainderMinutes}m left`;
}

function getCanvasToneFromSource(
  tone: ReturnType<typeof getBookingSourceVisibility>["tone"],
): CanvasTone {
  switch (tone) {
    case "owned":
      return "success";
    case "external":
    default:
      return "warn";
  }
}

function getStatusTone(status: BookingRecord["orderStatus"]): CanvasTone {
  switch (status) {
    case "completed":
      return "success";
    case "cancelled":
      return "neutral";
    case "dispatch_failed":
    case "dispatch_timeout":
    case "exception_hold":
    case "no_supply":
    case "redispatch_required":
      return "warn";
    default:
      return "info";
  }
}

function getApprovalTone(
  approvalState: BookingRecord["approvalState"],
): CanvasTone {
  switch (approvalState) {
    case "approved":
      return "success";
    case "pending":
      return "warn";
    case "blocked":
    case "rejected":
      return "warn";
    default:
      return "neutral";
  }
}

function isActionableStatus(status: BookingRecord["orderStatus"]) {
  return status !== "completed" && status !== "cancelled";
}

function getActionDisabledReason(reasonCode?: string) {
  switch (reasonCode) {
    case "editable_window_passed":
      return "Edit window closed";
    case "cancel_window_passed":
      return "Cancellation window closed";
    case "workflow_locked":
      return "Workflow no longer accepts tenant changes";
    default:
      return "Unavailable";
  }
}

function getActionLabel(action: string) {
  switch (action) {
    case "open_detail":
      return "Open detail";
    case "update_booking":
      return "Edit";
    case "cancel_booking":
      return "Cancel";
    case "create_booking":
      return "Create booking";
    case "open_ops_approval":
      return "Ops approvals";
    case "open_ops_dispatch":
      return "Ops dispatch";
    case "open_integration_governance":
      return "Open integration";
    case "reset_filters":
      return "Clear filters";
    default:
      return action;
  }
}

function buildCrossAppHref(link: CrossAppResourceLink) {
  const origin = link.targetApp === "ops-console" ? OPS_CONSOLE_ORIGIN : "";

  return origin ? `${origin}${link.route}` : link.route;
}

function buildBookingCrossAppLinks(
  booking: BookingRecord,
): CrossAppResourceLink[] {
  const links: CrossAppResourceLink[] = [];

  if (
    booking.approvalState === "pending" ||
    booking.approvalState === "blocked"
  ) {
    links.push({
      targetApp: "ops-console",
      route: `/approval-requests?tenantId=${encodeURIComponent(
        booking.tenantId,
      )}&status=pending`,
      resourceType: "tenant_booking_approval_request",
      resourceId: booking.bookingId,
      openMode: "new_tab",
      label: "Open ops approval queue",
    });
  }

  if (
    booking.orderStatus === "dispatch_failed" ||
    booking.orderStatus === "dispatch_timeout" ||
    booking.orderStatus === "exception_hold" ||
    booking.orderStatus === "redispatch_required"
  ) {
    links.push({
      targetApp: "ops-console",
      route: `/dispatch?bookingId=${encodeURIComponent(booking.bookingId)}`,
      resourceType: "dispatch_queue_item",
      resourceId: booking.bookingId,
      openMode: "new_tab",
      label: "Open ops dispatch queue",
    });
  }

  return links;
}

function buildBookingActions(
  booking: BookingRecord,
): ResourceActionDescriptor[] {
  const canEdit =
    isActionableStatus(booking.orderStatus) &&
    Boolean(booking.modifiableUntil) &&
    new Date(booking.modifiableUntil).getTime() > Date.now();
  const canCancel =
    isActionableStatus(booking.orderStatus) &&
    Boolean(booking.cancelableUntil) &&
    new Date(booking.cancelableUntil).getTime() > Date.now();

  const actions: ResourceActionDescriptor[] = [
    {
      action: "open_detail",
      enabled: true,
      riskLevel: "low",
    },
    {
      action: "update_booking",
      enabled: canEdit,
      disabledReasonCode: canEdit
        ? undefined
        : booking.modifiableUntil
          ? "editable_window_passed"
          : "workflow_locked",
      riskLevel: "medium",
    },
    {
      action: "cancel_booking",
      enabled: canCancel,
      disabledReasonCode: canCancel
        ? undefined
        : booking.cancelableUntil
          ? "cancel_window_passed"
          : "workflow_locked",
      requiresReason: true,
      riskLevel: "high",
    },
  ];

  if (
    booking.approvalState === "pending" ||
    booking.approvalState === "blocked"
  ) {
    actions.push({
      action: "open_ops_approval",
      enabled: true,
      riskLevel: "low",
    });
  }

  if (
    buildBookingCrossAppLinks(booking).some(
      (link) => link.resourceType === "dispatch_queue_item",
    )
  ) {
    actions.push({
      action: "open_ops_dispatch",
      enabled: true,
      riskLevel: "low",
    });
  }

  return actions;
}

function deriveSlaStatus(booking: BookingRecord): BookingSlaStatus | null {
  if (
    booking.orderStatus === "dispatch_failed" ||
    booking.orderStatus === "dispatch_timeout" ||
    booking.orderStatus === "no_supply" ||
    booking.orderStatus === "exception_hold"
  ) {
    return {
      label: "SLA at risk",
      tone: "warn",
      detail:
        "Dispatch recovery is needed before the booking misses its service target.",
    };
  }

  const reservationStart = parseDate(booking.reservationWindowStart);
  if (!reservationStart) {
    return null;
  }

  const minutesUntilStart = Math.round(
    (reservationStart.getTime() - Date.now()) / 60000,
  );

  if (
    minutesUntilStart > 0 &&
    minutesUntilStart <= 45 &&
    isActionableStatus(booking.orderStatus)
  ) {
    return {
      label: "SLA watch",
      tone: "info",
      detail: `Pickup window opens in ${formatMinutes(minutesUntilStart)}.`,
    };
  }

  return null;
}

function toBookingListRecord(booking: BookingRecord): BookingListRecord {
  return {
    ...booking,
    availableActions: buildBookingActions(booking),
    editableUntil: booking.modifiableUntil,
    crossAppLinks: buildBookingCrossAppLinks(booking),
    slaStatus: deriveSlaStatus(booking),
  };
}

function getActionHref(action: string, booking: BookingListRecord) {
  switch (action) {
    case "open_detail":
    case "update_booking":
    case "cancel_booking":
      return `/bookings/${booking.bookingId}`;
    case "open_ops_approval":
      return booking.crossAppLinks.find(
        (link) => link.resourceType === "tenant_booking_approval_request",
      );
    case "open_ops_dispatch":
      return booking.crossAppLinks.find(
        (link) => link.resourceType === "dispatch_queue_item",
      );
    default:
      return null;
  }
}

function getSubtypeLabel(subtype: BusinessDispatchSubtype | "all") {
  switch (subtype) {
    case "credit_card_airport_transfer":
      return "Airport transfer";
    case "enterprise_dispatch":
      return "Enterprise dispatch";
    case "all":
    default:
      return "All subtypes";
  }
}

function getServiceBucketLabel(bucket: Phase1ServiceBucket | "all") {
  switch (bucket) {
    case "business_dispatch":
      return "Business dispatch";
    case "standard_taxi":
      return "Standard taxi";
    case "all":
    default:
      return "All buckets";
  }
}

function mapErrorToEmptyReason(
  status: number,
  errorCode?: string,
): BookingEmptyReason {
  if (status === 401 || status === 403) {
    return "permission_denied";
  }

  if (
    errorCode === "TENANT_NOT_FOUND" ||
    errorCode?.includes("NOT_CONFIGURED") ||
    errorCode?.includes("NOT_PROVISIONED")
  ) {
    return "not_provisioned";
  }

  if (status === 502 || status === 503 || status === 504) {
    return "external_unavailable";
  }

  return "fetch_failed";
}

function getEmptyStateContent(
  reason: BookingEmptyReason,
  queryString: string,
): {
  title: string;
  description: string;
  nextAction?: {
    descriptor: ResourceActionDescriptor;
    href: string;
  };
} {
  switch (reason) {
    case "not_provisioned":
      return {
        title: "Tenant setup is not provisioned yet",
        description:
          "Bookings cannot load until tenant governance and downstream integrations are configured for this workspace.",
        nextAction: {
          descriptor: {
            action: "open_integration_governance",
            enabled: true,
            riskLevel: "medium",
          },
          href: "/integration-governance",
        },
      };
    case "permission_denied":
      return {
        title: "You do not have permission to see bookings",
        description:
          "This tenant role can open the console shell but the booking ledger is not readable for the current actor context.",
      };
    case "external_unavailable":
      return {
        title: "Booking data is temporarily unavailable",
        description:
          "An upstream dependency did not respond in time. Tenant operators should retry, then escalate through ops if the stale window persists.",
      };
    case "fetch_failed":
      return {
        title: "The booking list failed to load",
        description:
          "The page could not retrieve a valid tenant booking snapshot. Retry the page and check service health if this repeats.",
      };
    case "filtered_empty":
      return {
        title: "No bookings match these filters",
        description:
          "Try widening the reservation window, clearing status chips, or moving back to all service subtypes.",
        nextAction: {
          descriptor: {
            action: "reset_filters",
            enabled: true,
            riskLevel: "low",
          },
          href: queryString ? "/bookings" : "/bookings",
        },
      };
    case "no_data":
    default:
      return {
        title: "No bookings exist for this tenant yet",
        description:
          "This looks like a brand-new tenant workspace. Create the first booking or wait for external booking ingestion to publish data here.",
        nextAction: {
          descriptor: {
            action: "create_booking",
            enabled: true,
            riskLevel: "medium",
          },
          href: "/bookings/new",
        },
      };
  }
}

async function loadBookingsPageData(): Promise<BookingListPageData> {
  const refresh: UiRefreshMetadata = {
    generatedAt: new Date().toISOString(),
    staleAfterMs: BOOKING_STALE_AFTER_MS,
    dataFreshness: "unknown",
    source: "live",
  };

  try {
    const response = await fetch(`${API_URL}/api/tenant/bookings`, {
      cache: "no-store",
      headers: {
        "x-actor-type": "tenant_admin",
        "x-actor-id": DEMO_ACTOR_ID,
        "x-realm": "tenant",
        "x-tenant-id": DEMO_TENANT_ID,
      },
    });

    if (!response.ok) {
      const errorEnvelope = (await response
        .json()
        .catch(() => null)) as ApiErrorEnvelope | null;

      return {
        bookings: [],
        pageInfo: {
          page: 1,
          pageSize: 25,
          totalItems: 0,
          totalPages: 0,
        },
        refresh: {
          ...refresh,
          dataFreshness: "degraded",
        },
        emptyReason: mapErrorToEmptyReason(
          response.status,
          errorEnvelope?.error.code,
        ),
        errorMessage: errorEnvelope?.error.message ?? "Unknown booking error.",
      };
    }

    const envelope = (await response.json()) as ApiSuccessEnvelope<
      ApiListData<BookingRecord>
    >;
    const items = envelope.data.items.map(toBookingListRecord);

    return {
      bookings: items,
      pageInfo: envelope.data.pageInfo,
      refresh: {
        generatedAt: envelope.meta.timestamp,
        staleAfterMs: BOOKING_STALE_AFTER_MS,
        dataFreshness: "fresh",
        source: "live",
      },
      emptyReason: null,
      errorMessage: null,
    };
  } catch (error) {
    return {
      bookings: [],
      pageInfo: {
        page: 1,
        pageSize: 25,
        totalItems: 0,
        totalPages: 0,
      },
      refresh: {
        ...refresh,
        dataFreshness: "degraded",
      },
      emptyReason: "fetch_failed",
      errorMessage:
        error instanceof Error ? error.message : "Unknown booking error.",
    };
  }
}

function renderActionLink({
  href,
  label,
  external = false,
  variant = "secondary",
}: {
  href: string;
  label: string;
  external?: boolean;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link
      href={href}
      style={actionLinkStyle(variant)}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
    >
      {label}
    </Link>
  );
}

function renderBookingActions(booking: BookingListRecord) {
  return (
    <div style={actionRowStyle}>
      {booking.availableActions.map((action) => {
        const label = getActionLabel(action.action);
        if (!action.enabled) {
          return (
            <span
              key={action.action}
              style={disabledActionStyle}
              title={getActionDisabledReason(action.disabledReasonCode)}
            >
              {label}
            </span>
          );
        }

        const target = getActionHref(action.action, booking);
        if (!target) {
          return null;
        }

        if (typeof target === "string") {
          return (
            <Link
              key={action.action}
              href={target}
              style={actionLinkStyle(
                action.action === "open_detail" ? "primary" : "secondary",
              )}
            >
              {label}
            </Link>
          );
        }

        return renderActionLink({
          href: buildCrossAppHref(target),
          label,
          external: target.openMode === "new_tab",
        });
      })}
    </div>
  );
}

function buildBookingRows(bookings: BookingListRecord[]): BookingRow[] {
  return bookings.map((booking) => {
    const source = getBookingSourceVisibility(booking);
    const editWindow = formatRemainingWindow(booking.editableUntil);
    const sourceToneClassName = getSourceToneClassName(source.tone);

    return {
      bookingCell: (
        <div style={{ display: "grid", gap: 4 }}>
          <Link
            href={`/bookings/${booking.bookingId}`}
            style={primaryTextStyle}
          >
            {booking.bookingId}
          </Link>
          <span style={secondaryTextStyle}>
            {booking.orderId} · {booking.serviceBucket} ·{" "}
            {getSubtypeLabel(booking.businessDispatchSubtype)}
          </span>
        </div>
      ),
      passengerCell: (
        <div style={{ display: "grid", gap: 4 }}>
          <span style={primaryTextStyle}>{booking.passenger.name}</span>
          <span style={secondaryTextStyle}>
            {booking.passenger.phone} · {booking.costCenter ?? "No cost center"}
          </span>
        </div>
      ),
      scheduleCell: (
        <div style={{ display: "grid", gap: 6 }}>
          <span style={primaryTextStyle}>
            {formatDateTime(booking.reservationWindowStart)}
          </span>
          <span style={secondaryTextStyle}>
            to {formatDateTime(booking.reservationWindowEnd)}
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <CanvasPill theme={theme} tone="neutral">
              Age {formatRelativeDuration(booking.createdAt)}
            </CanvasPill>
            <CanvasPill theme={theme} tone="info">
              Updated {formatRelativeDuration(booking.updatedAt)}
            </CanvasPill>
            {editWindow ? (
              <CanvasPill
                theme={theme}
                tone={editWindow === "Closed" ? "neutral" : "warn"}
              >
                Editable {editWindow}
              </CanvasPill>
            ) : null}
          </div>
        </div>
      ),
      routeCell: (
        <div style={{ display: "grid", gap: 4 }}>
          <span style={primaryTextStyle}>{booking.pickup.address}</span>
          <span style={secondaryTextStyle}>{booking.dropoff.address}</span>
        </div>
      ),
      statusCell: (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <CanvasPill
              theme={theme}
              tone={getStatusTone(booking.orderStatus)}
              dot
            >
              {booking.orderStatus}
            </CanvasPill>
            <CanvasPill
              theme={theme}
              tone={getApprovalTone(booking.approvalState)}
            >
              approval {booking.approvalState}
            </CanvasPill>
          </div>
          <span style={secondaryTextStyle}>Booking {booking.status}</span>
          {booking.slaStatus ? (
            <span style={secondaryTextStyle}>{booking.slaStatus.detail}</span>
          ) : (
            <span style={secondaryTextStyle}>SLA not published</span>
          )}
        </div>
      ),
      fulfillmentCell: (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <CanvasPill
              theme={theme}
              tone={getCanvasToneFromSource(source.tone)}
            >
              {source.badge}
            </CanvasPill>
            {booking.slaStatus ? (
              <CanvasPill theme={theme} tone={booking.slaStatus.tone}>
                {booking.slaStatus.label}
              </CanvasPill>
            ) : null}
          </div>
          <span className={sourceToneClassName}>{source.summary}</span>
          <span style={secondaryTextStyle}>{source.detail}</span>
        </div>
      ),
      fareCell: (
        <div style={{ display: "grid", gap: 4 }}>
          <span style={primaryTextStyle}>
            {formatMoney(booking.quotedFare)}
          </span>
          <span style={secondaryTextStyle}>
            {booking.bookingType} · {booking.approvalRequestIds.length} approval
            ref(s)
          </span>
        </div>
      ),
      actionCell: renderBookingActions(booking),
      _selected:
        booking.approvalState === "pending" ||
        booking.orderStatus === "dispatch_failed" ||
        booking.orderStatus === "dispatch_timeout" ||
        booking.orderStatus === "exception_hold",
    };
  });
}

function getSubtypeCounts(bookings: BookingListRecord[]) {
  return bookings.reduce(
    (summary, booking) => {
      summary[booking.businessDispatchSubtype] =
        (summary[booking.businessDispatchSubtype] ?? 0) + 1;
      return summary;
    },
    {} as Partial<Record<BusinessDispatchSubtype, number>>,
  );
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchParamValue>>;
}) {
  const resolvedSearchParams = await searchParams;
  const query = parseBookingListQuery(resolvedSearchParams);
  const forcedEmptyReason = parseEmptyReason(
    first(resolvedSearchParams.emptyReason),
  );
  const data = await loadBookingsPageData();
  const baseResult = applyBookingListQuery(data.bookings, query);
  const statusCounts = applyBookingListQuery(data.bookings, {
    ...query,
    statuses: [],
    page: 1,
  }).statusCounts;
  const subtypeCountScope = applyBookingListQuery(data.bookings, {
    ...query,
    subtype: "all",
    page: 1,
    pageSize: Math.max(1, data.bookings.length),
  }).items;
  const subtypeCounts = getSubtypeCounts(subtypeCountScope);
  const serviceBucketCounts = PHASE1_SERVICE_BUCKETS.reduce(
    (summary, bucket) => {
      summary[bucket] = data.bookings.filter(
        (booking) => booking.serviceBucket === bucket,
      ).length;
      return summary;
    },
    {} as Record<Phase1ServiceBucket, number>,
  );

  const activeCount = data.bookings.filter((booking) =>
    isActionableStatus(booking.orderStatus),
  ).length;
  const approvalRequiredCount = data.bookings.filter(
    (booking) => booking.approvalState === "pending",
  ).length;
  const attentionCount = data.bookings.filter(
    (booking) =>
      booking.orderStatus === "dispatch_failed" ||
      booking.orderStatus === "dispatch_timeout" ||
      booking.orderStatus === "exception_hold" ||
      booking.orderStatus === "no_supply",
  ).length;
  const forwardedCount = data.bookings.filter(
    (booking) =>
      getBookingSourceVisibility(booking).domain === "forwarded_authority",
  ).length;

  const computedEmptyReason: BookingEmptyReason | null =
    forcedEmptyReason ??
    data.emptyReason ??
    (baseResult.items.length > 0
      ? null
      : hasActiveBookingFilters(query)
        ? "filtered_empty"
        : "no_data");

  const rows =
    computedEmptyReason === null ? buildBookingRows(baseResult.items) : [];
  const queryString = buildBookingListQueryString(query);
  const emptyState =
    computedEmptyReason !== null
      ? getEmptyStateContent(computedEmptyReason, queryString)
      : null;

  const pageActions: {
    descriptor: ResourceActionDescriptor;
    href: string;
  }[] = [
    {
      descriptor: {
        action: "create_booking",
        enabled: true,
        riskLevel: "medium",
      },
      href: "/bookings/new",
    },
  ];

  if (computedEmptyReason === "not_provisioned") {
    pageActions.push({
      descriptor: {
        action: "open_integration_governance",
        enabled: true,
        riskLevel: "medium",
      },
      href: "/integration-governance",
    });
  }

  const pageDeepLinks: CrossAppResourceLink[] = [];
  if (approvalRequiredCount > 0) {
    pageDeepLinks.push({
      targetApp: "ops-console",
      route: `/approval-requests?tenantId=${encodeURIComponent(DEMO_TENANT_ID)}&status=pending`,
      resourceType: "tenant_booking_approval_queue",
      resourceId: DEMO_TENANT_ID,
      openMode: "new_tab",
      label: "Open ops approval queue",
    });
  }
  if (attentionCount > 0 || forwardedCount > 0) {
    pageDeepLinks.push({
      targetApp: "ops-console",
      route: "/dispatch",
      resourceType: "dispatch_queue",
      resourceId: DEMO_TENANT_ID,
      openMode: "new_tab",
      label: "Open ops dispatch board",
    });
  }

  const headerTabs = [
    { id: "all", label: "All", badge: String(baseResult.total) },
    { id: "live", label: "Live", badge: String(activeCount) },
    { id: "approval", label: "Approval", badge: String(approvalRequiredCount) },
    { id: "attention", label: "Attention", badge: String(attentionCount) },
  ].map((tab) => (
    <span key={tab.id}>
      {tab.label} {tab.badge}
    </span>
  ));
  const activeHeaderTab = headerTabs[0];

  const columns: CanvasTableColumn<BookingRow>[] = [
    { h: "BOOKING", k: "bookingCell", w: 170 },
    { h: "PASSENGER", k: "passengerCell", w: 150 },
    { h: "WINDOW / AGE", k: "scheduleCell", w: 220 },
    { h: "ROUTE", k: "routeCell", w: 240 },
    { h: "STATUS", k: "statusCell", w: 170 },
    { h: "FULFILLMENT", k: "fulfillmentCell", w: 170 },
    { h: "FARE", k: "fareCell", w: 140 },
    { h: "ACTIONS", k: "actionCell", w: 220 },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={theme}
        title="訂單"
        subtitle="本月所有預約，含進行中、待審批與已完成訂單。"
        tabs={headerTabs}
        activeTab={activeHeaderTab}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {pageActions.map(({ descriptor, href }) =>
              renderActionLink({
                href,
                label: getActionLabel(descriptor.action),
                variant:
                  descriptor.action === "create_booking"
                    ? "primary"
                    : "secondary",
              }),
            )}
            <RefreshTierControl
              metadata={data.refresh}
              tier={BOOKING_REFRESH_TIER}
            />
          </div>
        }
      />

      <div style={pageBodyStyle}>
        {data.errorMessage ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            icon="warn"
            title="Tenant booking snapshot degraded"
            body={data.errorMessage}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={theme}
            label="Visible"
            value={new Intl.NumberFormat("en").format(baseResult.total)}
            sub={queryString ? "after filters" : "tenant snapshot"}
          />
          <CanvasKPI
            theme={theme}
            label="Active"
            value={new Intl.NumberFormat("en").format(activeCount)}
            sub="open workflow"
          />
          <CanvasKPI
            theme={theme}
            label="Approval"
            value={new Intl.NumberFormat("en").format(approvalRequiredCount)}
            sub="needs tenant or ops review"
          />
          <CanvasKPI
            theme={theme}
            label="Attention"
            value={new Intl.NumberFormat("en").format(attentionCount)}
            sub={
              forwardedCount > 0
                ? `${forwardedCount} forwarded authority`
                : "no dispatch exception"
            }
          />
        </div>

        <CanvasCard
          theme={theme}
          title="Filters"
          subtitle="Search by booking or passenger, then narrow by canonical status, subtype, and reservation window."
        >
          <form action="/bookings" style={{ display: "grid", gap: 14 }}>
            <div style={filterGridStyle}>
              <label style={fieldLabelStyle}>
                Search
                <input
                  defaultValue={query.q}
                  name="q"
                  placeholder="Booking, order, passenger"
                  style={inputStyle}
                />
              </label>
              <label style={fieldLabelStyle}>
                Service bucket
                <select
                  defaultValue={query.serviceBucket}
                  name="serviceBucket"
                  style={inputStyle}
                >
                  <option value="all">All buckets</option>
                  {PHASE1_SERVICE_BUCKETS.map((bucket) => (
                    <option key={bucket} value={bucket}>
                      {getServiceBucketLabel(bucket)}
                    </option>
                  ))}
                </select>
              </label>
              <label style={fieldLabelStyle}>
                Service subtype
                <select
                  defaultValue={query.subtype}
                  name="subtype"
                  style={inputStyle}
                >
                  <option value="all">All subtypes</option>
                  {BUSINESS_DISPATCH_SUBTYPES.map((subtype) => (
                    <option key={subtype} value={subtype}>
                      {getSubtypeLabel(subtype)}
                    </option>
                  ))}
                </select>
              </label>
              <label style={fieldLabelStyle}>
                Date field
                <select
                  defaultValue={query.dateField}
                  name="dateField"
                  style={inputStyle}
                >
                  <option value="reservationStart">Reservation start</option>
                  <option value="createdAt">Created at</option>
                </select>
              </label>
              <label style={fieldLabelStyle}>
                From
                <input
                  defaultValue={query.dateFrom}
                  name="dateFrom"
                  type="date"
                  style={inputStyle}
                />
              </label>
              <label style={fieldLabelStyle}>
                To
                <input
                  defaultValue={query.dateTo}
                  name="dateTo"
                  type="date"
                  style={inputStyle}
                />
              </label>
              <label style={fieldLabelStyle}>
                Page size
                <select
                  defaultValue={String(query.pageSize)}
                  name="pageSize"
                  style={inputStyle}
                >
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                </select>
              </label>
            </div>

            {query.statuses.length > 0 ? (
              <input
                name="status"
                type="hidden"
                value={query.statuses.join(",")}
              />
            ) : null}

            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {OWNED_ORDER_STATUSES.map((status) => {
                  const nextStatuses = toggleStatus(query.statuses, status);
                  const href = `/bookings?${buildBookingListQueryString(query, {
                    statuses: nextStatuses,
                    page: 1,
                  })}`;
                  const isActive = query.statuses.includes(status);
                  return (
                    <Link
                      href={href}
                      key={status}
                      style={{
                        textDecoration: "none",
                        opacity: isActive ? 1 : 0.94,
                      }}
                    >
                      <CanvasPill
                        theme={theme}
                        tone={isActive ? "accent" : "neutral"}
                      >
                        {status} · {statusCounts[status] ?? 0}
                      </CanvasPill>
                    </Link>
                  );
                })}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <Link href="/bookings" style={{ textDecoration: "none" }}>
                  <CanvasPill
                    theme={theme}
                    tone={query.serviceBucket === "all" ? "accent" : "neutral"}
                  >
                    All buckets · {data.bookings.length}
                  </CanvasPill>
                </Link>
                {PHASE1_SERVICE_BUCKETS.map((bucket) => (
                  <Link
                    href={`/bookings?${buildBookingListQueryString(query, {
                      serviceBucket: bucket,
                      page: 1,
                    })}`}
                    key={bucket}
                    style={{ textDecoration: "none" }}
                  >
                    <CanvasPill
                      theme={theme}
                      tone={
                        query.serviceBucket === bucket ? "accent" : "neutral"
                      }
                    >
                      {getServiceBucketLabel(bucket)} ·{" "}
                      {serviceBucketCounts[bucket] ?? 0}
                    </CanvasPill>
                  </Link>
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <Link href="/bookings" style={{ textDecoration: "none" }}>
                  <CanvasPill
                    theme={theme}
                    tone={query.subtype === "all" ? "accent" : "neutral"}
                  >
                    All subtypes · {data.bookings.length}
                  </CanvasPill>
                </Link>
                {BUSINESS_DISPATCH_SUBTYPES.map((subtype) => (
                  <Link
                    href={`/bookings?${buildBookingListQueryString(query, {
                      subtype,
                      page: 1,
                    })}`}
                    key={subtype}
                    style={{ textDecoration: "none" }}
                  >
                    <CanvasPill
                      theme={theme}
                      tone={query.subtype === subtype ? "accent" : "neutral"}
                    >
                      {getSubtypeLabel(subtype)} · {subtypeCounts[subtype] ?? 0}
                    </CanvasPill>
                  </Link>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="submit" style={actionLinkStyle("primary")}>
                Apply filters
              </button>
              <Link href="/bookings" style={actionLinkStyle("secondary")}>
                Reset
              </Link>
            </div>
          </form>
        </CanvasCard>

        <div style={contentGridStyle}>
          <CanvasCard
            theme={theme}
            title={`Bookings · ${baseResult.items.length} shown / ${baseResult.total} matched`}
            subtitle={`Page ${baseResult.page} of ${baseResult.totalPages} · snapshot ${formatDateTime(
              data.refresh.generatedAt,
            )}`}
            padding={0}
          >
            {computedEmptyReason === null ? (
              <div style={{ display: "grid", gap: 0 }}>
                <CanvasTable<BookingRow>
                  theme={theme}
                  columns={columns}
                  rows={rows}
                />
                <div
                  style={{
                    padding: "12px 14px",
                    borderTop: `1px solid ${theme.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={secondaryTextStyle}>
                    Page {baseResult.page} of {baseResult.totalPages} · API page{" "}
                    {data.pageInfo.page} snapshot size {data.pageInfo.pageSize}
                  </span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {baseResult.page > 1
                      ? renderActionLink({
                          href: `/bookings?${buildBookingListQueryString(
                            query,
                            {
                              page: baseResult.page - 1,
                            },
                          )}`,
                          label: "Previous",
                        })
                      : null}
                    {baseResult.page < baseResult.totalPages
                      ? renderActionLink({
                          href: `/bookings?${buildBookingListQueryString(
                            query,
                            {
                              page: baseResult.page + 1,
                            },
                          )}`,
                          label: "Next",
                        })
                      : null}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: 18, display: "grid", gap: 14 }}>
                <CanvasBanner
                  theme={theme}
                  tone={
                    computedEmptyReason === "permission_denied" ||
                    computedEmptyReason === "fetch_failed"
                      ? "warn"
                      : "info"
                  }
                  icon="warn"
                  title={emptyState?.title}
                  body={emptyState?.description}
                />
                {emptyState?.nextAction
                  ? renderActionLink({
                      href: emptyState.nextAction.href,
                      label: getActionLabel(
                        emptyState.nextAction.descriptor.action,
                      ),
                      variant:
                        emptyState.nextAction.descriptor.action ===
                        "create_booking"
                          ? "primary"
                          : "secondary",
                    })
                  : null}
              </div>
            )}
          </CanvasCard>

          <div style={{ display: "grid", gap: 16 }}>
            <CanvasCard
              theme={theme}
              title="Attention lane"
              subtitle="Approval-required bookings are highlighted, while forwarded or exception states get explicit ops handoff links."
            >
              <div style={summaryListStyle}>
                <div style={summaryRowStyle}>
                  <strong style={primaryTextStyle}>
                    Approval-required bookings
                  </strong>
                  <span style={secondaryTextStyle}>
                    {approvalRequiredCount > 0
                      ? `${approvalRequiredCount} booking(s) are waiting for approval action.`
                      : "No pending approval bookings in this snapshot."}
                  </span>
                </div>
                <div style={summaryRowStyle}>
                  <strong style={primaryTextStyle}>Dispatch attention</strong>
                  <span style={secondaryTextStyle}>
                    {attentionCount > 0
                      ? `${attentionCount} booking(s) are in dispatch recovery or SLA-risk states.`
                      : "No dispatch exceptions are currently visible."}
                  </span>
                </div>
                <div style={summaryRowStyle}>
                  <strong style={primaryTextStyle}>Forwarded authority</strong>
                  <span style={secondaryTextStyle}>
                    {forwardedCount > 0
                      ? `${forwardedCount} booking(s) remain adapter- or platform-authoritative.`
                      : "All visible bookings stay in the tenant-operated lane."}
                  </span>
                </div>
              </div>
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title="Cross-app deep links"
              subtitle="Phase 1 keeps tenant and ops as separate apps, so ops handoffs open in a new tab."
            >
              {pageDeepLinks.length > 0 ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {pageDeepLinks.map((link) =>
                    renderActionLink({
                      href: buildCrossAppHref(link),
                      label: link.label,
                      external: link.openMode === "new_tab",
                    }),
                  )}
                </div>
              ) : (
                <span style={secondaryTextStyle}>
                  No cross-app escalation is needed for the current booking set.
                </span>
              )}
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title="List contract"
              subtitle="Bookings consume UI-runtime semantics even before backend list envelopes publish them directly."
            >
              <div style={summaryListStyle}>
                <span style={secondaryTextStyle}>
                  Refresh tier is wired to T5 / 30s via shared `RefreshTier`.
                </span>
                <span style={secondaryTextStyle}>
                  Empty states distinguish `no_data`, `not_provisioned`,
                  `filtered_empty`, `permission_denied`, `external_unavailable`,
                  and `fetch_failed`.
                </span>
                <span style={secondaryTextStyle}>
                  Row CTAs are rendered from `availableActions`, and ops
                  handoffs are typed as `CrossAppResourceLink`.
                </span>
              </div>
            </CanvasCard>
          </div>
        </div>
      </div>
    </div>
  );
}
