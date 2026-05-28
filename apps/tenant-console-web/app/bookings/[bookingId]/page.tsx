import Link from "next/link";
import { notFound } from "next/navigation";
import type {
  BookingRecord,
  EmptyReason,
  ResourceActionDescriptor,
  TenantInvoiceRecord,
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

type BookingEvent = {
  actor: string;
  detail: string;
  label: string;
  realm: "tenant" | "ops" | "platform" | "system";
  tone: "default" | "warning" | "success";
  at: string | null;
};

type EmptyStateCopy = {
  body: string;
  ctaHref: string;
  ctaLabel: string;
  title: string;
  tone: "default" | "warning";
};

type DerivedBookingView = {
  acceptedPending: boolean;
  actions: ResourceActionDescriptor[];
  deepLinks: Array<{
    href: string;
    label: string;
    note: string;
    external?: boolean;
  }>;
  editableUntil: string | null;
  events: BookingEvent[];
  generatedAt: string;
  readOnlyReasonCode: string | null;
};

const ACTIVE_ORDER_STATUSES = new Set([
  "assigned",
  "driver_accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
]);

const ACCEPTED_PENDING_STATUSES = new Set([
  "created",
  "ready_for_dispatch",
  "preassigned",
]);

const EMPTY_REASON_COPY: Record<EmptyReason, EmptyStateCopy> = {
  no_data: {
    title: "No booking data exists yet",
    body: "This tenant has booking access, but no booking record exists in the current workspace snapshot.",
    ctaLabel: "Create a booking",
    ctaHref: "/bookings/new",
    tone: "default",
  },
  not_provisioned: {
    title: "Booking module is not provisioned",
    body: "Tenant setup is incomplete, so booking detail cannot be hydrated until provisioning finishes.",
    ctaLabel: "Open settings",
    ctaHref: "/settings",
    tone: "warning",
  },
  fetch_failed: {
    title: "The booking snapshot could not be loaded",
    body: "The backend request failed before a usable read model was returned. Retry or inspect the audit lane for the last successful mutation.",
    ctaLabel: "Back to bookings",
    ctaHref: "/bookings",
    tone: "warning",
  },
  permission_denied: {
    title: "This actor cannot read the booking detail",
    body: "The booking exists, but the current tenant actor does not have read scope for this record.",
    ctaLabel: "Back to bookings",
    ctaHref: "/bookings",
    tone: "warning",
  },
  external_unavailable: {
    title: "The linked external system is unavailable",
    body: "Tenant truth is still readable, but one or more external dispatch details cannot be refreshed right now.",
    ctaLabel: "Open audit",
    ctaHref: "/audit",
    tone: "warning",
  },
  filtered_empty: {
    title: "This deep link no longer matches the current filters",
    body: "The booking detail route is valid, but the surrounding filtered context no longer contains the record you expected.",
    ctaLabel: "Reset booking filters",
    ctaHref: "/bookings",
    tone: "default",
  },
};

function buildBookingActions(
  booking: BookingRecord,
): ResourceActionDescriptor[] {
  const isTerminal =
    booking.orderStatus === "completed" || booking.orderStatus === "cancelled";
  const isOnTrip = booking.orderStatus === "on_trip";
  const approvalPending = booking.approvalState === "pending";
  const canUpdateWindow =
    booking.modifiableUntil == null || isFutureIso(booking.modifiableUntil);
  const canCancelWindow =
    booking.cancelableUntil == null || isFutureIso(booking.cancelableUntil);
  const actions: ResourceActionDescriptor[] = [
    {
      action: "update",
      enabled: !isTerminal && !isOnTrip && !approvalPending && canUpdateWindow,
      disabledReasonCode: isTerminal
        ? "booking_terminal"
        : isOnTrip
          ? "on_trip_locked"
          : approvalPending
            ? "approval_pending"
            : canUpdateWindow
              ? undefined
              : "past_editable_until",
      riskLevel: "medium",
    },
    {
      action: "cancel",
      enabled: !isTerminal && canCancelWindow,
      disabledReasonCode: isTerminal
        ? "booking_terminal"
        : canCancelWindow
          ? undefined
          : "past_cancelable_until",
      requiresReason: true,
      riskLevel: "high",
    },
  ];

  if (
    booking.approvalState === "rejected" ||
    booking.approvalState === "blocked" ||
    booking.approvalState === "cancelled_by_re_evaluation"
  ) {
    actions.push({
      action: "resubmit_approval",
      enabled: true,
      riskLevel: "medium",
    });
  }

  return actions;
}

function buildBookingEvents(booking: BookingRecord): BookingEvent[] {
  const events: BookingEvent[] = [
    {
      label: "Booking created",
      at: booking.createdAt,
      actor: booking.bookedBy?.name ?? "Tenant intake",
      realm: "tenant",
      tone: "default",
      detail: `Reservation window ${formatDateTime(booking.reservationWindowStart)} to ${formatDateTime(booking.reservationWindowEnd)}.`,
    },
  ];

  if (booking.approvalState !== "not_required") {
    events.push({
      label: "Approval workflow",
      at: booking.updatedAt,
      actor: "tenant.approval",
      realm: "system",
      tone: booking.approvalState === "approved" ? "success" : "warning",
      detail: `Approval state is ${booking.approvalState}. Related request count: ${booking.approvalRequestIds.length}.`,
    });
  }

  if (ACTIVE_ORDER_STATUSES.has(booking.orderStatus)) {
    events.push({
      label: "Driver assignment active",
      at: booking.updatedAt,
      actor: "dispatch.engine",
      realm: "ops",
      tone: "success",
      detail:
        "The booking is currently attached to an active fulfillment leg. Live ETA is not published by the current read model.",
    });
  }

  if (booking.orderStatus === "cancelled") {
    events.push({
      label: "Booking cancelled",
      at: booking.updatedAt,
      actor: "tenant command",
      realm: "tenant",
      tone: "warning",
      detail:
        "Tenant cancellation completed. Audit retains the reason and actor attribution.",
    });
  } else if (booking.orderStatus === "completed") {
    events.push({
      label: "Trip completed",
      at: booking.updatedAt,
      actor: "driver workflow",
      realm: "system",
      tone: "success",
      detail:
        "Fulfillment completed. Billing and audit remain accessible from tenant-owned routes.",
    });
  } else {
    events.push({
      label: "Workflow snapshot updated",
      at: booking.updatedAt,
      actor: "booking.readmodel",
      realm: "system",
      tone: "default",
      detail: `Current order status is ${booking.orderStatus}.`,
    });
  }

  return events;
}

function findRelatedInvoices(
  invoices: TenantInvoiceRecord[],
  orderId: string,
): TenantInvoiceRecord[] {
  return invoices.filter((invoice) =>
    invoice.lines.some(
      (line: TenantInvoiceRecord["lines"][number]) => line.orderId === orderId,
    ),
  );
}

function deriveBookingView(booking: BookingRecord): DerivedBookingView {
  const source = getBookingSourceVisibility(booking);
  const actions = buildBookingActions(booking);
  const updateAction = actions.find((action) => action.action === "update");
  const opsConsoleBase =
    process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003";
  const auditBase = "/audit";
  const deepLinks = [
    {
      href: `${auditBase}?bookingId=${encodeURIComponent(booking.bookingId)}`,
      label: "View audit subset",
      note: "Tenant audit includes actor realm chips for tenant, ops, platform, and system actions.",
    },
    {
      href: `/rules?bookingId=${encodeURIComponent(booking.bookingId)}`,
      label: "Open approval rules",
      note: "Use the tenant rules lane to inspect the approval logic that currently applies to this booking.",
    },
    ...(source.domain === "forwarded_authority"
      ? [
          {
            href: `${opsConsoleBase}/dispatch?orderId=${encodeURIComponent(booking.orderId)}`,
            label: "Open ops console detail",
            note: "Forwarded-authority bookings escalate to the ops app in a new tab when dispatch recovery is needed.",
            external: true,
          },
        ]
      : []),
  ];

  return {
    actions,
    acceptedPending:
      ACCEPTED_PENDING_STATUSES.has(booking.orderStatus) &&
      booking.approvalState !== "pending",
    deepLinks,
    editableUntil: booking.modifiableUntil,
    events: buildBookingEvents(booking),
    generatedAt: new Date().toISOString(),
    readOnlyReasonCode:
      updateAction && !updateAction.enabled
        ? (updateAction.disabledReasonCode ?? null)
        : null,
  };
}

function describeReadOnlyReason(reasonCode: string | null) {
  switch (reasonCode) {
    case "past_editable_until":
      return "The tenant edit window has passed, so the detail is now read-only for update commands.";
    case "booking_terminal":
      return "The trip is already closed. Tenant users can review context and audit, but no longer mutate the booking.";
    case "on_trip_locked":
      return "The driver workflow is already in progress. Follow-up should happen through cancellation policy or ops escalation, not inline edits.";
    case "approval_pending":
      return "The booking is waiting on approval resolution before another update command can be accepted.";
    default:
      return "This booking currently exposes no tenant update command.";
  }
}

function describeApprovalState(state: BookingRecord["approvalState"]) {
  switch (state) {
    case "not_required":
      return "No approval gate is active for this booking.";
    case "pending":
      return "Approval is required before dispatch can continue.";
    case "approved":
      return "The approval gate cleared and the booking can continue.";
    case "rejected":
      return "Approval was rejected. Review the rule lane before resubmitting.";
    case "blocked":
      return "A policy block currently prevents the booking from proceeding.";
    case "cancelled_by_re_evaluation":
      return "A prior approval request was invalidated by a later booking change.";
    default:
      return state;
  }
}

function renderEmptyState(reason: EmptyReason, bookingId: string) {
  const copy = EMPTY_REASON_COPY[reason] ?? EMPTY_REASON_COPY.fetch_failed;
  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Booking detail"
        title={`${bookingId} unavailable`}
        description="The tenant detail route implements all six shared EmptyReason treatments so the UI does not collapse every empty/not-ready case into the same message."
      />
      <SurfaceCard
        kicker="EmptyReason"
        title={copy.title}
        description={copy.body}
      >
        <div className="booking-empty-state">
          <span
            className={`status-chip${copy.tone === "warning" ? " booking-pill-warning" : ""}`}
          >
            {reason}
          </span>
          <div className="link-row">
            <Link
              className="action-button action-button-primary"
              href={copy.ctaHref}
            >
              {copy.ctaLabel}
            </Link>
            <Link
              className="action-button action-button-secondary"
              href={`/bookings/${bookingId}`}
            >
              Restore live detail
            </Link>
          </div>
        </div>
      </SurfaceCard>
    </div>
  );
}

export default async function BookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { bookingId } = await params;
  const query = await searchParams;
  const emptyReason =
    typeof query.emptyReason === "string"
      ? (query.emptyReason as EmptyReason)
      : null;

  if (emptyReason && emptyReason in EMPTY_REASON_COPY) {
    return renderEmptyState(emptyReason, bookingId);
  }

  const client = getTenantClient();
  const [bookingResult, invoicesResult] = await Promise.allSettled([
    client.getTenantBooking(bookingId) as Promise<BookingRecord>,
    client.listInvoices(),
  ]);

  if (bookingResult.status === "rejected") {
    notFound();
  }

  const booking = bookingResult.value;
  const bookingView = deriveBookingView(booking);
  const source = getBookingSourceVisibility(booking);
  const relatedInvoices =
    invoicesResult.status === "fulfilled"
      ? findRelatedInvoices(invoicesResult.value, booking.orderId)
      : [];
  const editable =
    bookingView.actions.find((action) => action.action === "update")?.enabled ??
    false;

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Booking detail"
        title={`${booking.bookingId} · ${booking.businessDispatchSubtype}`}
        description="Booking detail now follows the Tenant Console canvas: editable-until visibility, approval context, driver-assignment state, audit subset, refresh tier, and action descriptors all sit on one tenant-owned screen."
      />

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="Refresh tier"
          title="Tenant booking detail refreshes on T5"
          description="This screen is a tenant slow-lane detail surface: auto refresh is slow, manual review remains available, and stale states must be explicit."
        >
          <div className="booking-refresh-card">
            <div className="chip-row">
              <span className="status-chip booking-pill-accent">T5 slow</span>
              <span className="status-chip">fresh snapshot</span>
            </div>
            <dl className="definition-grid">
              <div>
                <dt>Generated</dt>
                <dd>{formatDateTime(bookingView.generatedAt)}</dd>
              </div>
              <div>
                <dt>Last booking update</dt>
                <dd>{formatDateTime(booking.updatedAt)}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>live tenant API</dd>
              </div>
              <div>
                <dt>Manual refresh</dt>
                <dd>Browser refresh or command receipt refresh</dd>
              </div>
            </dl>
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker="Status"
          title="Editability and approval posture"
          description="Per Q-TEN05, editability is driven by action descriptors plus editableUntil, not by guessing from the status label alone."
        >
          <div className="detail-stack">
            <div className="chip-row">
              <span className="status-badge">{booking.orderStatus}</span>
              <span className="status-chip">Booking {booking.status}</span>
              <span
                className={`status-chip${editable ? " booking-pill-success" : " booking-pill-warning"}`}
              >
                {editable ? "Editable" : "Read only"}
              </span>
              <span className={getSourceToneClassName(source.tone)}>
                {source.badge}
              </span>
            </div>
            <dl className="definition-grid">
              <div>
                <dt>editableUntil</dt>
                <dd>{formatDateTime(bookingView.editableUntil)}</dd>
              </div>
              <div>
                <dt>readOnlyReasonCode</dt>
                <dd>{bookingView.readOnlyReasonCode ?? "None"}</dd>
              </div>
              <div>
                <dt>Approval state</dt>
                <dd>{booking.approvalState}</dd>
              </div>
              <div>
                <dt>Approval requests</dt>
                <dd>{booking.approvalRequestIds.length}</dd>
              </div>
            </dl>
            {bookingView.acceptedPending ? (
              <CalloutPanel
                title="accepted+pending external confirmation"
                description="The last command was accepted into the tenant workflow, but external dispatch confirmation is still settling."
                tone="warning"
              >
                <p>
                  Keep this screen open or refresh the detail if the status has
                  not advanced after the next T5 cycle.
                </p>
              </CalloutPanel>
            ) : null}
            {booking.approvalState === "pending" ? (
              <CalloutPanel
                title="Approval-required state"
                description={describeApprovalState(booking.approvalState)}
                tone="warning"
              >
                <p>
                  This booking should not be treated as editable just because it
                  is not terminal. Wait for approval or use the rules lane.
                </p>
              </CalloutPanel>
            ) : null}
            {!editable ? (
              <p className="muted-copy">
                {describeReadOnlyReason(bookingView.readOnlyReasonCode)}
              </p>
            ) : null}
          </div>
        </SurfaceCard>
      </section>

      <section className="booking-detail-layout">
        <div className="booking-detail-main">
          <SurfaceCard
            kicker="Trip context"
            title="Booking, rider, and routing detail"
            description="The page keeps the full tenant-visible booking payload close to the action lane so a user does not need a separate ops-only surface to validate the reservation."
          >
            <dl className="definition-grid">
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
                <dd>{booking.passenger.name}</dd>
              </div>
              <div>
                <dt>Phone</dt>
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
                <dt>Window start</dt>
                <dd>{formatDateTime(booking.reservationWindowStart)}</dd>
              </div>
              <div>
                <dt>Window end</dt>
                <dd>{formatDateTime(booking.reservationWindowEnd)}</dd>
              </div>
              <div>
                <dt>Cost center</dt>
                <dd>{booking.costCenter ?? "Not published"}</dd>
              </div>
              <div>
                <dt>Vehicle preference</dt>
                <dd>{booking.vehiclePreference ?? "Not published"}</dd>
              </div>
              <div>
                <dt>Flight / terminal</dt>
                <dd>
                  {booking.flightNo ?? "No flight"} /{" "}
                  {booking.terminal ?? "No terminal"}
                </dd>
              </div>
              <div>
                <dt>Notes</dt>
                <dd>{booking.notes ?? "No notes"}</dd>
              </div>
            </dl>
          </SurfaceCard>

          <SurfaceCard
            kicker="Lifecycle"
            title="Timeline and recent updates"
            description="Tenant audit visibility includes cross-actor changes on tenant-owned resources, so the recent update lane must not pretend every event came from the tenant actor."
          >
            <ol className="booking-event-list">
              {bookingView.events.map((event) => (
                <li
                  className={`booking-event booking-event-${event.tone}`}
                  key={`${event.label}-${event.at ?? "none"}`}
                >
                  <div className="booking-event-head">
                    <strong>{event.label}</strong>
                    <span>
                      {event.at
                        ? formatDateTime(event.at)
                        : "Pending timestamp"}
                    </span>
                  </div>
                  <div className="chip-row">
                    <span
                      className={`status-chip booking-realm-${event.realm}`}
                    >
                      {event.realm}
                    </span>
                    <span className="muted-copy">{event.actor}</span>
                  </div>
                  <p>{event.detail}</p>
                </li>
              ))}
            </ol>
          </SurfaceCard>

          <SurfaceCard
            kicker="Finance"
            title="Fare, invoice, and approval context"
            description="Quoted fare, approval posture, and invoice linkage remain tenant-visible while dispatch-only mechanics stay out of band."
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
                <dt>Manual override</dt>
                <dd>
                  {booking.manualFareOverride
                    ? `${booking.manualFareOverride.actorType} · ${booking.manualFareOverride.reason}`
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Approval</dt>
                <dd>{describeApprovalState(booking.approvalState)}</dd>
              </div>
              <div>
                <dt>Benefit ref</dt>
                <dd>{booking.benefitReference ?? "Not published"}</dd>
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
              <p className="muted-copy">
                No tenant invoice row is currently linked to this order.
              </p>
            )}
          </SurfaceCard>
        </div>

        <div className="booking-detail-side">
          <SurfaceCard
            kicker="Assignment"
            title="Driver / vehicle assignment"
            description="If dispatch has already attached a fulfillment leg, tenant users can see the assignment state without gaining dispatch control."
          >
            <dl className="definition-grid">
              <div>
                <dt>Assignment state</dt>
                <dd>
                  {ACTIVE_ORDER_STATUSES.has(booking.orderStatus)
                    ? "Active driver assignment"
                    : "No active assignment published"}
                </dd>
              </div>
              <div>
                <dt>ETA</dt>
                <dd>
                  {ACTIVE_ORDER_STATUSES.has(booking.orderStatus)
                    ? "Live ETA not published by current read model"
                    : "Not active"}
                </dd>
              </div>
              <div>
                <dt>Order status</dt>
                <dd>{booking.orderStatus}</dd>
              </div>
              <div>
                <dt>Escalation</dt>
                <dd>
                  {source.domain === "forwarded_authority"
                    ? "Ops console deep link available"
                    : "Tenant detail remains the primary owner view"}
                </dd>
              </div>
            </dl>
          </SurfaceCard>

          <SurfaceCard
            kicker="Actions"
            title="Available actions"
            description="The command panel renders enabled, disabled, and hidden states from the action descriptor set for this booking."
          >
            <BookingCommandPanel
              actions={bookingView.actions}
              approvalHref={`/rules?bookingId=${encodeURIComponent(booking.bookingId)}`}
              auditHref={`/audit?bookingId=${encodeURIComponent(booking.bookingId)}`}
              booking={booking}
              readOnlyReasonCode={bookingView.readOnlyReasonCode}
            />
          </SurfaceCard>

          <SurfaceCard
            kicker="Deep links"
            title="Cross-app and follow-up links"
            description="Phase 1 keeps the apps separate, so follow-up routes stay explicit instead of masquerading as one runtime shell."
          >
            <ul className="panel-list">
              {bookingView.deepLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    className="text-link"
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noreferrer" : undefined}
                  >
                    {link.label}
                  </Link>
                  <span className="list-note">{link.note}</span>
                </li>
              ))}
            </ul>
          </SurfaceCard>
        </div>
      </section>

      <CalloutPanel
        title="Authority boundary"
        description={source.detail}
        tone={source.domain === "forwarded_authority" ? "warning" : "default"}
      >
        <p>{source.statusBoundary}</p>
      </CalloutPanel>
    </div>
  );
}
