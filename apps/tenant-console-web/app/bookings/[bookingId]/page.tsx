import Link from "next/link";
import { notFound } from "next/navigation";
import type {
  BookingRecord,
  EmptyReason,
  ResourceActionDescriptor,
  TenantInvoiceRecord,
  UiRefreshMetadata,
} from "@drts/contracts";
import { BookingCommandPanel } from "@/components/booking-command-panel";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { getTenantClient } from "@/lib/api-client";
import { formatDateTime, formatMoney, isFutureIso } from "@/lib/formatters";
import {
  getBookingSourceVisibility,
  getSourceToneClassName,
} from "@/lib/source-domain";

export const dynamic = "force-dynamic";

type BookingDetailRecord = BookingRecord & {
  editableUntil?: string | null;
  readOnlyReasonCode?: string | null;
  availableActions?: ResourceActionDescriptor[];
  refreshMetadata?: UiRefreshMetadata | null;
  assignment?: {
    driverName?: string | null;
    driverId?: string | null;
    vehicleLabel?: string | null;
    etaMinutes?: number | null;
    contactMode?: string | null;
  } | null;
};

type TimelineRow = {
  label: string;
  at: string | null;
  detail: string;
};

type BookingActivityRow = {
  label: string;
  at: string | null;
  detail: string;
  realm: "tenant" | "system" | "ops" | "driver";
};

type RefreshSummary = {
  tierLabel: string;
  tierCode: string;
  cadenceLabel: string;
  freshness: NonNullable<UiRefreshMetadata["dataFreshness"]>;
  generatedAt: string;
  source: NonNullable<UiRefreshMetadata["source"]>;
  staleAfterMs: number;
};

type TenantEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;

type DetailRouteLink = {
  href: string;
  label: string;
  app: "tenant-console" | "ops-console" | "platform-admin";
  external?: boolean;
  note: string;
};

type EmptyReasonCard = {
  reason: TenantEmptyReason;
  lane: string;
  title: string;
  description: string;
  active: boolean;
};

function getEditableUntil(booking: BookingDetailRecord) {
  return booking.editableUntil ?? booking.modifiableUntil ?? null;
}

function getReadOnlyReasonCode(booking: BookingDetailRecord) {
  if (booking.readOnlyReasonCode) {
    return booking.readOnlyReasonCode;
  }

  const editableUntil = getEditableUntil(booking);
  if (editableUntil && !isFutureIso(editableUntil)) {
    return "past_editable_until";
  }

  if (
    booking.orderStatus === "completed" ||
    booking.orderStatus === "cancelled"
  ) {
    return "terminal_order";
  }

  if (booking.orderStatus === "on_trip") {
    return "in_fulfillment";
  }

  return null;
}

function getFallbackActions(
  booking: BookingDetailRecord,
): ResourceActionDescriptor[] {
  const editableUntil = getEditableUntil(booking);
  const canUpdate =
    booking.orderStatus !== "completed" &&
    booking.orderStatus !== "cancelled" &&
    booking.orderStatus !== "on_trip" &&
    (editableUntil == null || isFutureIso(editableUntil));
  const canCancel =
    booking.orderStatus !== "completed" &&
    booking.orderStatus !== "cancelled" &&
    (booking.cancelableUntil == null || isFutureIso(booking.cancelableUntil));

  return [
    {
      action: "update",
      enabled: canUpdate,
      disabledReasonCode: canUpdate
        ? undefined
        : getReadOnlyReasonCode(booking),
      riskLevel: "medium",
    },
    {
      action: "cancel",
      enabled: canCancel,
      disabledReasonCode: canCancel
        ? undefined
        : booking.cancelableUntil && !isFutureIso(booking.cancelableUntil)
          ? "past_cancelable_until"
          : "terminal_order",
      requiresReason: true,
      riskLevel: "high",
    },
  ];
}

function getAvailableActions(booking: BookingDetailRecord) {
  return booking.availableActions?.length
    ? booking.availableActions
    : getFallbackActions(booking);
}

function buildTimeline(booking: BookingDetailRecord): TimelineRow[] {
  return [
    {
      label: "Booking created",
      at: booking.createdAt,
      detail: "Tenant intake entered the owned-mobility booking ledger.",
    },
    {
      label: "Reservation window opens",
      at: booking.reservationWindowStart,
      detail: "Primary service commitment window begins.",
    },
    {
      label: "Reservation window closes",
      at: booking.reservationWindowEnd,
      detail: "Requested pickup or dropoff commitment window ends.",
    },
    {
      label: "Workflow last updated",
      at: booking.updatedAt,
      detail: `Current order status is ${booking.orderStatus}.`,
    },
    {
      label: "Tenant edit cutoff",
      at: getEditableUntil(booking),
      detail: getEditableUntil(booking)
        ? "Further tenant edits follow this backend-driven cutoff."
        : "No explicit tenant edit cutoff was published.",
    },
    {
      label: "Tenant cancellation cutoff",
      at: booking.cancelableUntil,
      detail: booking.cancelableUntil
        ? "Further tenant cancellation follows this cutoff."
        : "No explicit tenant cancellation cutoff was published.",
    },
  ];
}

function buildActivity(booking: BookingDetailRecord): BookingActivityRow[] {
  return [
    {
      label: "Booking created",
      at: booking.createdAt,
      detail: booking.bookedBy
        ? `${booking.bookedBy.name} created the booking from tenant console.`
        : "Tenant console created the booking.",
      realm: "tenant",
    },
    {
      label: "Policy and approval evaluation",
      at: booking.createdAt,
      detail:
        booking.approvalState === "not_required"
          ? "No tenant approval gate blocked creation."
          : `Approval state is ${booking.approvalState}.`,
      realm: "system",
    },
    {
      label: "Dispatch execution",
      at: booking.updatedAt,
      detail:
        booking.orderStatus === "assigned" || booking.orderStatus === "on_trip"
          ? "Driver assignment is active; tenant surface shows only published summary."
          : "Dispatch state remains readable without exposing ops-only trace internals.",
      realm: booking.orderStatus === "assigned" ? "driver" : "ops",
    },
  ];
}

function findRelatedInvoices(
  invoices: TenantInvoiceRecord[],
  orderId: string,
): TenantInvoiceRecord[] {
  return invoices.filter((invoice) =>
    invoice.lines.some(
      (line: { orderId?: string | null }) => line.orderId === orderId,
    ),
  );
}

function formatDurationMinutes(minutes: number) {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

function describeReadOnlyReason(
  code: string | null,
  booking: BookingDetailRecord,
) {
  if (!code) {
    return "Editing remains available while the backend keeps update action enabled.";
  }

  switch (code) {
    case "past_editable_until":
      return getEditableUntil(booking)
        ? `Editing window closed at ${formatDateTime(getEditableUntil(booking))}.`
        : "Editing window is no longer open.";
    case "past_cancelable_until":
      return booking.cancelableUntil
        ? `Cancellation window closed at ${formatDateTime(booking.cancelableUntil)}.`
        : "Cancellation window is no longer open.";
    case "terminal_order":
      return "Completed and cancelled bookings are read-only.";
    case "in_fulfillment":
      return "Active fulfillment keeps tenant edits locked while dispatch execution is underway.";
    default:
      return code.replaceAll("_", " ");
  }
}

function describeApprovalState(approvalState: BookingRecord["approvalState"]) {
  switch (approvalState) {
    case "approved":
      return "Approved";
    case "pending":
      return "Pending approval";
    case "rejected":
      return "Rejected";
    case "blocked":
      return "Blocked";
    case "cancelled_by_re_evaluation":
      return "Cancelled by re-evaluation";
    case "not_required":
    default:
      return "No approval required";
  }
}

function buildRefreshSummary(booking: BookingDetailRecord): RefreshSummary {
  const refreshMetadata = booking.refreshMetadata ?? {
    generatedAt: booking.updatedAt,
    staleAfterMs: 30_000,
    dataFreshness: "fresh" as const,
    source: "live" as const,
  };

  return {
    tierLabel: "T5",
    tierCode: "medium_slow",
    cadenceLabel: "slow / 30s cadence",
    freshness: refreshMetadata.dataFreshness,
    generatedAt: refreshMetadata.generatedAt,
    source: refreshMetadata.source,
    staleAfterMs: refreshMetadata.staleAfterMs,
  };
}

function getEditableCountdownLabel(editableUntil: string | null) {
  if (!editableUntil) {
    return "No published tenant cutoff";
  }

  const deltaMs = new Date(editableUntil).getTime() - Date.now();
  if (deltaMs <= 0) {
    return "Edit window closed";
  }

  const totalMinutes = Math.ceil(deltaMs / 60_000);
  if (totalMinutes < 60) {
    return `${totalMinutes} min left`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m left` : `${hours}h left`;
}

function getRefreshTone(
  freshness: RefreshSummary["freshness"],
): "fresh" | "stale" | "warning" {
  switch (freshness) {
    case "fresh":
      return "fresh";
    case "stale":
      return "stale";
    default:
      return "warning";
  }
}

function buildConsoleHref(
  targetApp: DetailRouteLink["app"],
  route: string,
): string {
  const baseByApp: Record<
    Exclude<DetailRouteLink["app"], "tenant-console">,
    string | undefined
  > = {
    "ops-console": process.env.NEXT_PUBLIC_OPS_CONSOLE_URL,
    "platform-admin": process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL,
  };

  if (targetApp === "tenant-console") {
    return route;
  }

  const base = baseByApp[targetApp];
  if (base && /^https?:\/\//.test(base)) {
    return new URL(route, base.endsWith("/") ? base : `${base}/`).toString();
  }

  return `/${targetApp}${route}`;
}

function buildDetailRouteLinks(
  booking: BookingDetailRecord,
  source: ReturnType<typeof getBookingSourceVisibility>,
): DetailRouteLink[] {
  const links: DetailRouteLink[] = [
    {
      href: `/audit?resourceId=${encodeURIComponent(booking.orderId)}`,
      label: "Tenant audit trail",
      app: "tenant-console",
      note: "Audit subset for this booking and tenant-visible follow-up.",
    },
    {
      href: `/passengers?query=${encodeURIComponent(booking.passenger.name)}`,
      label: "Passenger directory",
      app: "tenant-console",
      note: "Re-open the linked passenger directory context.",
    },
    {
      href: `/cost-centers?query=${encodeURIComponent(booking.costCenter ?? "")}`,
      label: "Cost center policy",
      app: "tenant-console",
      note: "Inspect quota and approval context for this booking.",
    },
  ];

  if (booking.partnerEntrySlug) {
    links.push({
      href: buildConsoleHref(
        "ops-console",
        `/partners/entries/${encodeURIComponent(booking.partnerEntrySlug)}`,
      ),
      label: "Partner fulfillment lane",
      app: "ops-console",
      external: true,
      note: "Cross-app read path for partner entry and dispatch provenance.",
    });
  }

  if (
    source.domain === "forwarded_authority" ||
    booking.orderStatus === "assigned"
  ) {
    links.push({
      href: buildConsoleHref(
        "ops-console",
        `/orders/${encodeURIComponent(booking.orderId)}`,
      ),
      label: "Ops order lane",
      app: "ops-console",
      external: true,
      note: "Deep link to ops-only execution details in a new tab.",
    });
  }

  if (booking.approvalRequestIds.length > 0) {
    links.push({
      href: buildConsoleHref(
        "platform-admin",
        `/tenants/${encodeURIComponent(booking.tenantId)}/approval-requests?bookingId=${encodeURIComponent(booking.bookingId)}`,
      ),
      label: "Approval governance",
      app: "platform-admin",
      external: true,
      note: "Cross-app approval trail for tenant-affecting admin or ops actions.",
    });
  }

  return links;
}

function buildEmptyReasonCards(
  booking: BookingDetailRecord,
  source: ReturnType<typeof getBookingSourceVisibility>,
  invoicesFailed: boolean,
  relatedInvoices: TenantInvoiceRecord[],
): EmptyReasonCard[] {
  const assignmentActive =
    booking.orderStatus === "assigned" ||
    booking.orderStatus === "driver_accepted" ||
    booking.orderStatus === "enroute_pickup" ||
    booking.orderStatus === "arrived_pickup" ||
    booking.orderStatus === "on_trip";

  return [
    {
      reason: "no_data",
      lane: "Finance",
      title: "No downstream invoice yet",
      description:
        "The booking exists, but no tenant-visible invoice row has been linked to this order.",
      active: relatedInvoices.length === 0 && !invoicesFailed,
    },
    {
      reason: "not_provisioned",
      lane: "Policy",
      title: "Tenant policy metadata not provisioned",
      description:
        "Cost-center or compliance metadata was not published for this booking slice.",
      active:
        booking.costCenter == null &&
        (booking.complianceGates == null ||
          booking.complianceGates.length === 0),
    },
    {
      reason: "fetch_failed",
      lane: "Finance",
      title: "Related ledger fetch failed",
      description:
        "A supporting tenant ledger read failed, so the page keeps the booking snapshot visible and marks the auxiliary lane degraded.",
      active: invoicesFailed,
    },
    {
      reason: "permission_denied",
      lane: "Execution",
      title: "Ops-only trace hidden",
      description:
        "Tenant detail can reference execution progress, but driver / adapter internals remain masked on this authority boundary.",
      active: source.domain === "forwarded_authority",
    },
    {
      reason: "external_unavailable",
      lane: "Execution",
      title: "External confirmation still pending",
      description:
        "Execution is active but the external or partner lane has not published fresh assignment detail into the tenant-safe snapshot.",
      active:
        assignmentActive &&
        booking.assignment?.driverName == null &&
        source.domain !== "owned",
    },
    {
      reason: "filtered_empty",
      lane: "Approval",
      title: "Approval subset filtered empty",
      description:
        "Approval is pending, but no request identifiers were published into this tenant detail snapshot yet.",
      active:
        booking.approvalState === "pending" &&
        booking.approvalRequestIds.length === 0,
    },
  ];
}

function getEmptyReasonTone(reason: TenantEmptyReason) {
  switch (reason) {
    case "fetch_failed":
    case "permission_denied":
      return "warning";
    case "external_unavailable":
      return "attention";
    default:
      return "neutral";
  }
}

function getActivityToneClassName(realm: BookingActivityRow["realm"]) {
  switch (realm) {
    case "tenant":
      return "booking-activity-tone booking-activity-tone-tenant";
    case "driver":
      return "booking-activity-tone booking-activity-tone-driver";
    case "ops":
      return "booking-activity-tone booking-activity-tone-ops";
    default:
      return "booking-activity-tone booking-activity-tone-system";
  }
}

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const client = getTenantClient();
  const [bookingResult, invoicesResult] = await Promise.allSettled([
    client.getTenantBooking(bookingId) as Promise<BookingDetailRecord>,
    client.listInvoices(),
  ]);

  if (bookingResult.status === "rejected") {
    notFound();
  }

  const booking = bookingResult.value;
  const source = getBookingSourceVisibility(booking);
  const timeline = buildTimeline(booking);
  const activity = buildActivity(booking);
  const availableActions = getAvailableActions(booking);
  const editableUntil = getEditableUntil(booking);
  const readOnlyReasonCode = getReadOnlyReasonCode(booking);
  const refreshSummary = buildRefreshSummary(booking);
  const refreshTone = getRefreshTone(refreshSummary.freshness);
  const relatedInvoices =
    invoicesResult.status === "fulfilled"
      ? findRelatedInvoices(invoicesResult.value, booking.orderId)
      : [];
  const detailRouteLinks = buildDetailRouteLinks(booking, source);
  const emptyReasonCards = buildEmptyReasonCards(
    booking,
    source,
    invoicesResult.status === "rejected",
    relatedInvoices,
  );
  const assignment = booking.assignment ?? null;
  const approvalState = describeApprovalState(booking.approvalState);
  const isApprovalWaiting = booking.approvalState === "pending";
  const editableCountdownLabel = getEditableCountdownLabel(editableUntil);

  return (
    <div className="page-shell">
      <div className="booking-detail-breadcrumbs">
        <Link className="text-link" href="/">
          Home
        </Link>
        <span>/</span>
        <Link className="text-link" href="/bookings">
          Bookings
        </Link>
        <span>/</span>
        <span>{booking.bookingId}</span>
      </div>

      <PageHero
        eyebrow="Booking detail"
        title={`${booking.bookingId} · ${booking.businessDispatchSubtype}`}
        description={`${booking.pickup.address} -> ${booking.dropoff.address} · ${formatDateTime(booking.reservationWindowStart)} to ${formatDateTime(booking.reservationWindowEnd)}`}
      />

      <section className="booking-detail-hero">
        <div className="booking-detail-title-row">
          <div className="chip-row">
            <span className="status-badge">{booking.orderStatus}</span>
            <span
              className={`status-chip${readOnlyReasonCode ? " is-warning" : ""}`}
            >
              {readOnlyReasonCode ? "Read-only" : "Editable"}
            </span>
            <span className="status-chip">{approvalState}</span>
            <span className={getSourceToneClassName(source.tone)}>
              {source.badge}
            </span>
          </div>
          <div className="booking-detail-meta-row">
            <span className="metric-label">
              Refresh {refreshSummary.tierLabel}
            </span>
            <span
              className={`booking-refresh-pill booking-refresh-pill-${refreshTone}`}
            >
              {refreshSummary.tierCode} · {refreshSummary.cadenceLabel} ·{" "}
              {refreshSummary.freshness} · {refreshSummary.source}
            </span>
            <span className="booking-deadline-chip">
              Editable window · {editableCountdownLabel}
            </span>
          </div>
        </div>
        <div className="booking-detail-highlights">
          <div className="booking-highlight-card">
            <span className="booking-highlight-label">Editable until</span>
            <strong>
              {editableUntil ? formatDateTime(editableUntil) : "Not published"}
            </strong>
            <p>{editableCountdownLabel}</p>
          </div>
          <div className="booking-highlight-card">
            <span className="booking-highlight-label">Approval state</span>
            <strong>{approvalState}</strong>
            <p>
              {booking.approvalRequestIds.length > 0
                ? `${booking.approvalRequestIds.length} request id(s) published`
                : "No request identifiers published"}
            </p>
          </div>
          <div className="booking-highlight-card">
            <span className="booking-highlight-label">Dispatch state</span>
            <strong>{booking.orderStatus}</strong>
            <p>{source.statusBoundary}</p>
          </div>
        </div>
        <div className="booking-detail-link-row">
          {detailRouteLinks.map((link) => (
            <Link
              className="booking-link-chip"
              href={link.href}
              key={`${link.app}-${link.label}`}
              target={link.external ? "_blank" : undefined}
            >
              <span>{link.app}</span>
              {link.label}
            </Link>
          ))}
        </div>
      </section>

      {source.domain === "forwarded_authority" ? (
        <CalloutPanel
          title="Forwarded-authority boundary"
          description={source.statusBoundary}
          tone="warning"
        >
          <p>{source.escalationHint}</p>
        </CalloutPanel>
      ) : null}

      {readOnlyReasonCode ? (
        <CalloutPanel
          title="Read-only reason"
          description={describeReadOnlyReason(readOnlyReasonCode, booking)}
          tone="warning"
        />
      ) : null}

      {isApprovalWaiting ? (
        <CalloutPanel
          title="Approval gate still open"
          description="This booking is waiting on the tenant approval flow; action availability still comes from backend descriptors."
        >
          <p>
            Approval request IDs:{" "}
            {booking.approvalRequestIds.length > 0
              ? booking.approvalRequestIds.join(", ")
              : "Not published"}
          </p>
        </CalloutPanel>
      ) : null}

      <section className="booking-detail-layout">
        <div className="booking-detail-main">
          <SurfaceCard
            kicker="Booking facts"
            title="Full booking context and editability"
            description="Q-TEN05 keeps this page availability-first: CTAs come from backend descriptors and the published cutoff window, never from status text alone."
          >
            <dl className="definition-grid booking-detail-grid">
              <div>
                <dt>Booking ID</dt>
                <dd>{booking.bookingId}</dd>
              </div>
              <div>
                <dt>Order ID</dt>
                <dd>{booking.orderId}</dd>
              </div>
              <div>
                <dt>Passenger</dt>
                <dd>
                  <Link
                    className="text-link"
                    href={`/passengers?query=${encodeURIComponent(booking.passenger.name)}`}
                  >
                    {booking.passenger.name}
                  </Link>
                </dd>
              </div>
              <div>
                <dt>Passenger phone</dt>
                <dd>{booking.passenger.phone}</dd>
              </div>
              <div>
                <dt>Pickup</dt>
                <dd>{booking.pickup.address}</dd>
              </div>
              <div>
                <dt>Dropoff</dt>
                <dd>{booking.dropoff.address}</dd>
              </div>
              <div>
                <dt>Window</dt>
                <dd>
                  {formatDateTime(booking.reservationWindowStart)} to{" "}
                  {formatDateTime(booking.reservationWindowEnd)}
                </dd>
              </div>
              <div>
                <dt>Subtype</dt>
                <dd>{booking.businessDispatchSubtype}</dd>
              </div>
              <div>
                <dt>Editable until</dt>
                <dd>
                  {editableUntil
                    ? formatDateTime(editableUntil)
                    : "Not published"}
                </dd>
              </div>
              <div>
                <dt>Read-only reason</dt>
                <dd>{readOnlyReasonCode ?? "Active action window"}</dd>
              </div>
              <div>
                <dt>Cost center</dt>
                <dd>
                  {booking.costCenter ? (
                    <Link
                      className="text-link"
                      href={`/cost-centers?query=${encodeURIComponent(booking.costCenter)}`}
                    >
                      {booking.costCenter}
                    </Link>
                  ) : (
                    "Not provided"
                  )}
                </dd>
              </div>
              <div>
                <dt>Onsite contact</dt>
                <dd>
                  {booking.onsiteContact
                    ? `${booking.onsiteContact.name} · ${booking.onsiteContact.phone}`
                    : "Not provided"}
                </dd>
              </div>
            </dl>
          </SurfaceCard>

          <SurfaceCard
            kicker="Lifecycle"
            title="Current state and timeline"
            description="The tenant surface shows published milestones, approval state, and recent booking updates without leaking dispatch-only traces."
          >
            <ol className="timeline-list">
              {timeline.map((item) => (
                <li className="timeline-item" key={item.label}>
                  <strong>{item.label}</strong>
                  <span>
                    {item.at ? formatDateTime(item.at) : "Not published"}
                  </span>
                  <p>{item.detail}</p>
                </li>
              ))}
            </ol>
          </SurfaceCard>

          <SurfaceCard
            kicker="Audit subset"
            title="Recent booking updates"
            description="Q-TEN13 keeps actor realm visible inside the tenant-safe audit subset so follow-up stays anchored when actions cross tenant, ops, platform, and system lanes."
          >
            <ul className="booking-activity-list">
              {activity.map((item) => (
                <li
                  className="booking-activity-item"
                  key={`${item.label}-${item.at}`}
                >
                  <div className="booking-activity-header">
                    <span className={getActivityToneClassName(item.realm)}>
                      {item.realm}
                    </span>
                    <strong>{item.label}</strong>
                    <span className="muted-copy">
                      {item.at ? formatDateTime(item.at) : "Not published"}
                    </span>
                  </div>
                  <p>{item.detail}</p>
                </li>
              ))}
            </ul>
          </SurfaceCard>
        </div>

        <div className="booking-detail-side">
          <SurfaceCard
            kicker="Commands"
            title="Available actions"
            description="CTAs stay backend-driven. Disabled actions remain visible with a reason instead of disappearing by role."
          >
            <BookingCommandPanel
              availableActions={availableActions}
              booking={booking}
              editableUntil={editableUntil}
              readOnlyReasonCode={readOnlyReasonCode}
            />
          </SurfaceCard>

          <SurfaceCard
            kicker="Assignment"
            title="Driver and service execution"
            description="Driver and vehicle details remain tenant-safe summaries only when the read model publishes them."
          >
            <dl className="definition-grid">
              <div>
                <dt>Driver</dt>
                <dd>
                  {assignment?.driverName
                    ? `${assignment.driverName}${assignment.driverId ? ` · ${assignment.driverId}` : ""}`
                    : "Not published"}
                </dd>
              </div>
              <div>
                <dt>Vehicle</dt>
                <dd>{assignment?.vehicleLabel ?? "Not published"}</dd>
              </div>
              <div>
                <dt>ETA</dt>
                <dd>
                  {assignment?.etaMinutes != null
                    ? formatDurationMinutes(assignment.etaMinutes)
                    : booking.orderStatus === "assigned" ||
                        booking.orderStatus === "on_trip"
                      ? "Live ETA not published"
                      : "Not active"}
                </dd>
              </div>
              <div>
                <dt>Contact mode</dt>
                <dd>{assignment?.contactMode ?? "Platform-mediated only"}</dd>
              </div>
            </dl>
            {assignment == null ? (
              <div className="empty-panel booking-inline-empty">
                Assignment summary is not published for this snapshot yet.
              </div>
            ) : null}
          </SurfaceCard>

          <SurfaceCard
            kicker="Finance"
            title="Fare, invoice, and governance"
            description="Quoted fare authority and invoice linkage stay adjacent so a tenant user can reconcile the booking without leaving the detail flow."
          >
            <dl className="definition-grid">
              <div>
                <dt>Quoted fare</dt>
                <dd>{formatMoney(booking.quotedFare)}</dd>
              </div>
              <div>
                <dt>Fare source</dt>
                <dd>{booking.quotedFareSource ?? "Not published"}</dd>
              </div>
              <div>
                <dt>Pricing version</dt>
                <dd>{booking.quotedFareRuleVersion ?? "Not published"}</dd>
              </div>
              <div>
                <dt>Finance authority</dt>
                <dd>{source.financeAuthority}</dd>
              </div>
            </dl>
            {relatedInvoices.length > 0 ? (
              <ul className="panel-list">
                {relatedInvoices.map((invoice) => (
                  <li key={invoice.invoiceId}>
                    <strong>{invoice.invoiceId}</strong>
                    <span className="list-note">
                      {invoice.status} · {formatMoney(invoice.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-panel booking-inline-empty">
                No tenant invoice row is currently linked to this order.
              </div>
            )}
          </SurfaceCard>

          <SurfaceCard
            kicker="Routing"
            title="Refresh and cross-app deep links"
            description="Q-X01 freshness metadata and Q-X03 deep links keep this tenant detail honest about both data age and the lane that owns the next action."
          >
            <dl className="definition-grid">
              <div>
                <dt>Generated at</dt>
                <dd>{formatDateTime(refreshSummary.generatedAt)}</dd>
              </div>
              <div>
                <dt>Stale after</dt>
                <dd>
                  {formatDurationMinutes(
                    Math.max(
                      1,
                      Math.floor(refreshSummary.staleAfterMs / 60_000),
                    ),
                  )}
                </dd>
              </div>
              <div>
                <dt>Freshness</dt>
                <dd>{refreshSummary.freshness}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{refreshSummary.source}</dd>
              </div>
            </dl>
            <div className="booking-route-link-list">
              {detailRouteLinks.map((link) => (
                <div className="booking-route-link-card" key={link.label}>
                  <div className="booking-route-link-header">
                    <span className="metric-label">{link.app}</span>
                    {link.external ? (
                      <span className="status-chip">new tab</span>
                    ) : null}
                  </div>
                  <strong>{link.label}</strong>
                  <p>{link.note}</p>
                  <Link
                    className="text-link"
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                  >
                    Open route
                  </Link>
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard
            kicker="Empty states"
            title="Tenant empty-reason handling"
            description="Q-X15 requires tenant detail to distinguish why a support lane is blank or degraded. Active reasons are highlighted; the rest stay documented for this route."
          >
            <div className="booking-empty-reason-grid">
              {emptyReasonCards.map((card) => (
                <div
                  className={`booking-empty-reason-card booking-empty-reason-card-${getEmptyReasonTone(card.reason)}${card.active ? " is-active" : ""}`}
                  key={card.reason}
                >
                  <div className="booking-empty-reason-header">
                    <span className="metric-label">{card.reason}</span>
                    <span className="status-chip">{card.lane}</span>
                  </div>
                  <strong>{card.title}</strong>
                  <p>{card.description}</p>
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>
      </section>

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="Business fields"
          title="Additional reservation context"
          description="Optional business-travel fields remain visible here so tenant users can inspect the full reservation payload without mutating workflow state directly."
        >
          <dl className="definition-grid">
            <div>
              <dt>Vehicle preference</dt>
              <dd>{booking.vehiclePreference ?? "Not provided"}</dd>
            </div>
            <div>
              <dt>Benefit reference</dt>
              <dd>{booking.benefitReference ?? "Not provided"}</dd>
            </div>
            <div>
              <dt>Direction</dt>
              <dd>{booking.direction ?? "Not provided"}</dd>
            </div>
            <div>
              <dt>Flight</dt>
              <dd>{booking.flightNo ?? "Not provided"}</dd>
            </div>
            <div>
              <dt>Terminal</dt>
              <dd>{booking.terminal ?? "Not provided"}</dd>
            </div>
            <div>
              <dt>Luggage</dt>
              <dd>
                {booking.luggageCount == null
                  ? "Not provided"
                  : `${booking.luggageCount} bag(s)`}
              </dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd>{booking.notes ?? "Not provided"}</dd>
            </div>
            <div>
              <dt>Compliance gates</dt>
              <dd>
                {booking.complianceGates?.length
                  ? `${booking.complianceGates.length} published`
                  : "None published"}
              </dd>
            </div>
          </dl>
        </SurfaceCard>
      </section>

      <div className="link-row">
        <Link className="text-link" href="/bookings">
          Back to booking list
        </Link>
      </div>
    </div>
  );
}
