import Link from "next/link";
import { notFound } from "next/navigation";
import type {
  ActionReceipt,
  AuditLogRecord,
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
import {
  formatDateTime,
  formatMoney,
  formatRelativeTime,
  isFutureIso,
} from "@/lib/formatters";
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
  detail: string;
  title: string;
  tone: "default" | "warning";
};

type DerivedBookingView = {
  acceptedPending: boolean;
  actions: ResourceActionDescriptor[];
  commandReceipt: ActionReceipt | null;
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
  timelineStep: number;
};

type BookingDetailRecord = BookingRecord & {
  availableActions?: ResourceActionDescriptor[];
  editableUntil?: string | null;
  readOnlyReasonCode?: string | null;
  lastActionReceipt?: ActionReceipt | null;
};

const ACTIVE_ORDER_STATUSES = new Set([
  "assigned",
  "driver_accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
]);

const BOOKING_TIMELINE_STEPS = [
  "created",
  "queued",
  "assigned",
  "enroute",
  "on_trip",
  "completed",
] as const;

const EMPTY_REASON_COPY: Record<EmptyReason, EmptyStateCopy> = {
  no_data: {
    title: "No booking data exists yet",
    body: "This tenant has booking access, but no booking record exists in the current workspace snapshot.",
    detail:
      "Use the booking creation flow if this link came from a stale notification or a list row that no longer points to a created booking.",
    ctaLabel: "Create a booking",
    ctaHref: "/bookings/new",
    tone: "default",
  },
  not_provisioned: {
    title: "Booking module is not provisioned",
    body: "Tenant setup is incomplete, so booking detail cannot be hydrated until provisioning finishes.",
    detail:
      "Provisioning is a tenant setup dependency rather than a route failure, so this state stays distinct from transient load errors.",
    ctaLabel: "Open settings",
    ctaHref: "/settings",
    tone: "warning",
  },
  fetch_failed: {
    title: "The booking snapshot could not be loaded",
    body: "The backend request failed before a usable read model was returned. Retry or inspect the audit lane for the last successful mutation.",
    detail:
      "Treat this as a temporary transport or server problem until a later refresh proves otherwise.",
    ctaLabel: "Back to bookings",
    ctaHref: "/bookings",
    tone: "warning",
  },
  permission_denied: {
    title: "This actor cannot read the booking detail",
    body: "The booking exists, but the current tenant actor does not have read scope for this record.",
    detail:
      "The route is valid, but the current actor is outside the allowed read scope for the tenant-owned record.",
    ctaLabel: "Back to bookings",
    ctaHref: "/bookings",
    tone: "warning",
  },
  external_unavailable: {
    title: "The linked external system is unavailable",
    body: "Tenant truth is still readable, but one or more external dispatch details cannot be refreshed right now.",
    detail:
      "Keep the tenant record visible and surface the degraded external dependency explicitly instead of blanking the whole page.",
    ctaLabel: "Open audit",
    ctaHref: "/audit",
    tone: "warning",
  },
  filtered_empty: {
    title: "This deep link no longer matches the current filters",
    body: "The booking detail route is valid, but the surrounding filtered context no longer contains the record you expected.",
    detail:
      "This is a navigation-context mismatch, not a missing booking. Reset the list context and reopen the detail from a live row.",
    ctaLabel: "Reset booking filters",
    ctaHref: "/bookings",
    tone: "default",
  },
};

function buildBookingActions(
  booking: BookingDetailRecord,
): ResourceActionDescriptor[] {
  const isTerminal =
    booking.orderStatus === "completed" || booking.orderStatus === "cancelled";
  const isOnTrip = booking.orderStatus === "on_trip";
  const approvalPending = booking.approvalState === "pending";
  const canUpdateWindow =
    booking.editableUntil == null || isFutureIso(booking.editableUntil);
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

function mapAuditRealm(
  actorType: AuditLogRecord["actorType"],
): BookingEvent["realm"] {
  switch (actorType) {
    case "tenant_admin":
      return "tenant";
    case "ops_user":
      return "ops";
    case "platform_admin":
      return "platform";
    default:
      return "system";
  }
}

function buildAuditSubsetEvents(
  logs: AuditLogRecord[],
  booking: BookingDetailRecord,
  commandReceipt: ActionReceipt | null,
): BookingEvent[] {
  const relatedIds = new Set(
    [booking.bookingId, booking.orderId, commandReceipt?.auditId].filter(
      (value): value is string => Boolean(value),
    ),
  );

  return logs
    .filter(
      (log) =>
        (log.resourceId ? relatedIds.has(log.resourceId) : false) ||
        relatedIds.has(log.auditId),
    )
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    )
    .slice(0, 6)
    .map((log) => ({
      actor: log.actorId ?? log.actorType,
      at: log.createdAt,
      detail: `${log.moduleName} · ${log.actionName} · ${log.resourceType}${log.resourceId ? ` ${log.resourceId}` : ""}`,
      label: log.actionName,
      realm: mapAuditRealm(log.actorType),
      tone:
        log.actorType === "ops_user" || log.actorType === "platform_admin"
          ? "warning"
          : "default",
    }));
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

function deriveTimelineStep(orderStatus: BookingRecord["orderStatus"]) {
  switch (orderStatus) {
    case "created":
      return 0;
    case "ready_for_dispatch":
    case "preassigned":
      return 1;
    case "assigned":
    case "driver_accepted":
      return 2;
    case "enroute_pickup":
    case "arrived_pickup":
      return 3;
    case "on_trip":
      return 4;
    case "completed":
    case "cancelled":
      return 5;
    default:
      return 0;
  }
}

function deriveBookingView(
  booking: BookingDetailRecord,
  commandReceipt: ActionReceipt | null,
): DerivedBookingView {
  const source = getBookingSourceVisibility(booking);
  const actions =
    booking.availableActions && booking.availableActions.length > 0
      ? booking.availableActions
      : buildBookingActions(booking);
  const updateAction = actions.find(
    (action: ResourceActionDescriptor) => action.action === "update",
  );
  const opsConsoleBase =
    process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003";
  const auditBase = "/audit";
  const deepLinks = [
    {
      href: commandReceipt?.auditId
        ? `${auditBase}?auditId=${encodeURIComponent(commandReceipt.auditId)}`
        : `${auditBase}?bookingId=${encodeURIComponent(booking.bookingId)}`,
      label: "View audit subset",
      note: commandReceipt?.auditId
        ? "Open the action receipt audit trail directly when a command has already been accepted."
        : "Tenant audit includes actor realm chips for tenant, ops, platform, and system actions.",
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
    acceptedPending: commandReceipt?.status === "accepted",
    commandReceipt,
    deepLinks,
    editableUntil: booking.editableUntil ?? booking.modifiableUntil,
    events: buildBookingEvents(booking),
    generatedAt: new Date().toISOString(),
    readOnlyReasonCode:
      booking.readOnlyReasonCode ??
      (updateAction && !updateAction.enabled
        ? (updateAction.disabledReasonCode ?? null)
        : null),
    timelineStep: deriveTimelineStep(booking.orderStatus),
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

function describeEditableWindow(
  editableUntil: string | null,
  editable: boolean,
) {
  const relativeWindow = formatRelativeTime(editableUntil);
  if (!editableUntil) {
    return editable
      ? "The backend currently exposes no edit deadline for this booking."
      : "The booking is read-only even though no edit deadline was published.";
  }

  return editable
    ? `The tenant edit window remains open until ${formatDateTime(editableUntil)}${relativeWindow ? ` (${relativeWindow})` : ""}.`
    : `The tenant edit window closed at ${formatDateTime(editableUntil)}${relativeWindow ? ` (${relativeWindow})` : ""}.`;
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

function formatActionLabel(action: ResourceActionDescriptor["action"]) {
  switch (action) {
    case "update":
      return "Update booking";
    case "cancel":
      return "Cancel booking";
    case "resubmit_approval":
      return "Resubmit approval";
    default:
      return action;
  }
}

function describeActionDescriptor(action: ResourceActionDescriptor) {
  switch (action.action) {
    case "update":
      return action.enabled
        ? "Tenant-safe field edits are currently allowed."
        : `Disabled: ${describeReadOnlyReason(action.disabledReasonCode ?? null)}`;
    case "cancel":
      return action.enabled
        ? action.requiresReason
          ? "Cancellation is available and requires an explicit reason."
          : "Cancellation is available."
        : `Disabled: ${describeReadOnlyReason(action.disabledReasonCode ?? null)}`;
    case "resubmit_approval":
      return action.enabled
        ? "A prior approval outcome can be resubmitted from the rules lane."
        : "Approval resubmission is currently unavailable.";
    default:
      return action.enabled
        ? "This action is currently available."
        : `Disabled: ${action.disabledReasonCode ?? "unavailable"}`;
  }
}

function getEmptyStateToneClassName(
  reason: EmptyReason,
  tone: EmptyStateCopy["tone"],
) {
  if (tone === "warning") {
    return "booking-empty-state-warning";
  }

  if (reason === "filtered_empty") {
    return "booking-empty-state-muted";
  }

  return "booking-empty-state-default";
}

function renderEmptyState(reason: EmptyReason, bookingId: string) {
  let copy: EmptyStateCopy;
  switch (reason) {
    case "no_data":
      copy = EMPTY_REASON_COPY.no_data as EmptyStateCopy;
      break;
    case "not_provisioned":
      copy = EMPTY_REASON_COPY.not_provisioned as EmptyStateCopy;
      break;
    case "fetch_failed":
      copy = EMPTY_REASON_COPY.fetch_failed as EmptyStateCopy;
      break;
    case "permission_denied":
      copy = EMPTY_REASON_COPY.permission_denied as EmptyStateCopy;
      break;
    case "external_unavailable":
      copy = EMPTY_REASON_COPY.external_unavailable as EmptyStateCopy;
      break;
    case "filtered_empty":
      copy = EMPTY_REASON_COPY.filtered_empty as EmptyStateCopy;
      break;
    default:
      copy = EMPTY_REASON_COPY.fetch_failed as EmptyStateCopy;
      break;
  }
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
        <div
          className={`booking-empty-state ${getEmptyStateToneClassName(reason, copy.tone)}`}
        >
          <div className="booking-empty-state-head">
            <span
              className={`status-chip${copy.tone === "warning" ? " booking-pill-warning" : " booking-pill-accent"}`}
            >
              {reason}
            </span>
            <span className="status-chip">Booking detail</span>
          </div>
          <p className="booking-empty-state-detail">{copy.detail}</p>
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

function parseCommandReceipt(
  query: Record<string, string | string[] | undefined>,
  bookingId: string,
): ActionReceipt | null {
  const status =
    typeof query.commandStatus === "string" ? query.commandStatus : null;
  if (status !== "accepted") {
    return null;
  }

  return {
    actionId:
      typeof query.commandId === "string"
        ? query.commandId
        : `cmd-${bookingId}`,
    auditId:
      typeof query.auditId === "string"
        ? query.auditId
        : `audit-${bookingId.toLowerCase()}`,
    resourceType: "booking",
    resourceId: bookingId,
    status: "accepted",
    message:
      typeof query.commandMessage === "string"
        ? query.commandMessage
        : "The tenant command was accepted and is waiting on external dispatch confirmation.",
  };
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
  const [bookingResult, invoicesResult, auditLogsResult] =
    await Promise.allSettled([
      client.getTenantBooking(bookingId) as Promise<BookingDetailRecord>,
      client.listInvoices(),
      client.listTenantAuditLogs(),
    ]);

  if (bookingResult.status === "rejected") {
    notFound();
  }

  const booking = bookingResult.value;
  const commandReceipt =
    booking.lastActionReceipt ?? parseCommandReceipt(query, bookingId);
  const bookingView = deriveBookingView(booking, commandReceipt);
  const source = getBookingSourceVisibility(booking);
  const relatedInvoices =
    invoicesResult.status === "fulfilled"
      ? findRelatedInvoices(invoicesResult.value, booking.orderId)
      : [];
  const recentEvents =
    auditLogsResult.status === "fulfilled"
      ? buildAuditSubsetEvents(auditLogsResult.value, booking, commandReceipt)
      : [];
  const editable =
    bookingView.actions.find((action) => action.action === "update")?.enabled ??
    false;
  const auditHref = bookingView.commandReceipt?.auditId
    ? `/audit?auditId=${encodeURIComponent(bookingView.commandReceipt.auditId)}`
    : `/audit?bookingId=${encodeURIComponent(booking.bookingId)}`;
  const bookingFiltersHref = `/bookings?bookingId=${encodeURIComponent(
    booking.bookingId,
  )}`;
  const passengerHref = `/passengers?bookingId=${encodeURIComponent(
    booking.bookingId,
  )}`;
  const pickupAddressHref = `/addresses?query=${encodeURIComponent(
    booking.pickup.address,
  )}`;
  const dropoffAddressHref = `/addresses?query=${encodeURIComponent(
    booking.dropoff.address,
  )}`;
  const costCenterHref = booking.costCenter
    ? `/cost-centers?code=${encodeURIComponent(booking.costCenter)}`
    : "/cost-centers";
  const actionSummary = bookingView.actions.map((action) => ({
    action,
    detail: describeActionDescriptor(action),
    label: formatActionLabel(action.action),
  }));
  const activeAssignment = ACTIVE_ORDER_STATUSES.has(booking.orderStatus);
  const relatedContextLinks = [
    {
      href: passengerHref,
      label: "Passenger profile",
      note: "Linked rider directory record.",
    },
    {
      href: pickupAddressHref,
      label: "Pickup address",
      note: "Open the address lane with the pickup query prefilled.",
    },
    {
      href: dropoffAddressHref,
      label: "Dropoff address",
      note: "Open the address lane with the destination query prefilled.",
    },
    {
      href: costCenterHref,
      label: "Cost center",
      note: booking.costCenter
        ? "Review the linked finance governance context."
        : "No cost center is attached, but the governance lane remains available.",
    },
  ];

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Booking detail"
        title={
          <span className="booking-hero-title">
            <span>{`${booking.bookingId} · ${booking.businessDispatchSubtype}`}</span>
            <span
              className={`status-chip ${
                bookingView.acceptedPending
                  ? "booking-pill-warning"
                  : booking.orderStatus === "completed"
                    ? "booking-pill-success"
                    : "booking-pill-accent"
              }`}
            >
              {bookingView.acceptedPending
                ? "accepted_pending"
                : booking.orderStatus}
            </span>
          </span>
        }
        description="Booking detail now follows the Tenant Console canvas: editable-until visibility, approval context, driver-assignment state, audit subset, refresh tier, and action descriptors all sit on one tenant-owned screen."
      />

      {bookingView.acceptedPending && bookingView.commandReceipt ? (
        <CalloutPanel
          title={`Command accepted · awaiting external confirmation · ${bookingView.commandReceipt.actionId}`}
          description={bookingView.commandReceipt.message}
          tone="warning"
        >
          <p>
            Audit link {bookingView.commandReceipt.auditId} is already assigned.
            Keep this detail open or refresh after the next T5 cycle if the
            status has not advanced.
          </p>
        </CalloutPanel>
      ) : null}

      <section className="booking-summary-grid">
        <SurfaceCard
          kicker="Snapshot"
          title="Editability, approval, and refresh posture"
          description="The canvas keeps the operational summary above the fold so tenant users can see whether they can act before reading the full record."
        >
          <div className="booking-summary-card">
            <div className="chip-row">
              <span className="status-badge">{booking.orderStatus}</span>
              <span className="status-chip">Booking {booking.status}</span>
              <span
                className={`status-chip${editable ? " booking-pill-success" : " booking-pill-warning"}`}
              >
                {editable ? "Editable now" : "Read only"}
              </span>
              <span className={getSourceToneClassName(source.tone)}>
                {source.badge}
              </span>
            </div>
            <div className="booking-summary-highlights">
              <article className="booking-highlight-card">
                <span className="booking-highlight-label">editableUntil</span>
                <strong>{formatDateTime(bookingView.editableUntil)}</strong>
                <p>
                  {describeEditableWindow(bookingView.editableUntil, editable)}
                </p>
              </article>
              <article className="booking-highlight-card">
                <span className="booking-highlight-label">
                  Approval posture
                </span>
                <strong>{booking.approvalState}</strong>
                <p>{describeApprovalState(booking.approvalState)}</p>
              </article>
              <article className="booking-highlight-card">
                <span className="booking-highlight-label">Refresh tier</span>
                <strong>T5</strong>
                <p>
                  Generated {formatDateTime(bookingView.generatedAt)}. Refresh
                  manually when stale or after an accepted command.
                </p>
              </article>
            </div>
            {!editable ? (
              <div className="booking-inline-note">
                <strong>readOnlyReasonCode</strong>
                <span>{bookingView.readOnlyReasonCode ?? "None"}</span>
                <p>{describeReadOnlyReason(bookingView.readOnlyReasonCode)}</p>
              </div>
            ) : null}
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker="Actions"
          title="Backend-driven action availability"
          description="Every CTA on this page is derived from `availableActions`, with disabled states preserved and explained instead of hidden."
        >
          <div className="booking-action-summary-list">
            {actionSummary.map(({ action, detail, label }) => (
              <article className="booking-action-summary" key={action.action}>
                <div className="booking-action-summary-head">
                  <strong>{label}</strong>
                  <div className="chip-row">
                    <span
                      className={`status-chip${action.enabled ? " booking-pill-success" : " booking-pill-warning"}`}
                    >
                      {action.enabled ? "Enabled" : "Disabled"}
                    </span>
                    <span className="status-chip">{action.riskLevel} risk</span>
                  </div>
                </div>
                <p>{detail}</p>
              </article>
            ))}
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
            <div
              className="booking-stepper"
              aria-label="Booking workflow state"
            >
              {BOOKING_TIMELINE_STEPS.map((step, index) => {
                const isActive = index === bookingView.timelineStep;
                const isComplete = index < bookingView.timelineStep;
                const isTerminalCancelled =
                  booking.orderStatus === "cancelled" &&
                  step ===
                    BOOKING_TIMELINE_STEPS[BOOKING_TIMELINE_STEPS.length - 1];
                const stepLabel =
                  isTerminalCancelled && step === "completed"
                    ? "cancelled"
                    : step;

                return (
                  <div
                    className={`booking-step${isActive ? " is-active" : ""}${isComplete ? " is-complete" : ""}${isTerminalCancelled ? " is-cancelled" : ""}`}
                    key={step}
                  >
                    <span className="booking-step-dot" />
                    <span>{stepLabel}</span>
                  </div>
                );
              })}
            </div>
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
                <dd>
                  <Link className="text-link" href={passengerHref}>
                    {booking.passenger.name}
                  </Link>
                </dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{booking.passenger.phone}</dd>
              </div>
              <div>
                <dt>Pickup</dt>
                <dd>
                  <Link className="text-link" href={pickupAddressHref}>
                    {booking.pickup.address}
                  </Link>
                </dd>
              </div>
              <div>
                <dt>Dropoff</dt>
                <dd>
                  <Link className="text-link" href={dropoffAddressHref}>
                    {booking.dropoff.address}
                  </Link>
                </dd>
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
                <dt>Booked by</dt>
                <dd>{booking.bookedBy?.name ?? "Tenant intake"}</dd>
              </div>
              <div>
                <dt>Onsite contact</dt>
                <dd>{booking.onsiteContact?.name ?? "Not published"}</dd>
              </div>
              <div>
                <dt>Cost center</dt>
                <dd>
                  {booking.costCenter ? (
                    <Link className="text-link" href={costCenterHref}>
                      {booking.costCenter}
                    </Link>
                  ) : (
                    "Not published"
                  )}
                </dd>
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
            <div className="booking-reference-links">
              {relatedContextLinks.map((link) => (
                <div className="booking-reference-link" key={link.label}>
                  <Link className="text-link" href={link.href}>
                    {link.label}
                  </Link>
                  <span className="list-note">{link.note}</span>
                </div>
              ))}
              <div className="booking-reference-link">
                <Link className="text-link" href={bookingFiltersHref}>
                  Booking list context
                </Link>
                <span className="list-note">
                  Return to the filtered booking oversight route.
                </span>
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard
            kicker="Lifecycle"
            title="Timeline and recent updates"
            description="Tenant audit visibility includes cross-actor changes on tenant-owned resources, so the recent update lane must not pretend every event came from the tenant actor."
          >
            <ol className="booking-event-list">
              {(recentEvents.length > 0
                ? recentEvents
                : bookingView.events
              ).map((event) => (
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
            <div className="booking-assignment-panel">
              <div className="chip-row">
                <span
                  className={`status-chip${activeAssignment ? " booking-pill-success" : ""}`}
                >
                  {activeAssignment
                    ? "Active assignment"
                    : "No live assignment"}
                </span>
                <span className="status-chip">
                  {activeAssignment ? "ETA visible when published" : "ETA idle"}
                </span>
              </div>
              <dl className="definition-grid">
                <div>
                  <dt>Assignment state</dt>
                  <dd>
                    {activeAssignment
                      ? "Dispatch has an active fulfillment leg in progress."
                      : "No active driver assignment is published on the tenant read model."}
                  </dd>
                </div>
                <div>
                  <dt>ETA</dt>
                  <dd>
                    {activeAssignment
                      ? "Live ETA pending from dispatch read model"
                      : "Not active"}
                  </dd>
                </div>
                <div>
                  <dt>Escalation</dt>
                  <dd>
                    {source.domain === "forwarded_authority"
                      ? "Ops console deep link available"
                      : "Tenant detail remains the primary owner view"}
                  </dd>
                </div>
                <div>
                  <dt>Command receipt</dt>
                  <dd>
                    {bookingView.commandReceipt
                      ? `${bookingView.commandReceipt.status} · ${bookingView.commandReceipt.actionId}`
                      : "No pending receipt"}
                  </dd>
                </div>
              </dl>
            </div>
          </SurfaceCard>

          <SurfaceCard
            kicker="Actions"
            title="Available actions"
            description="The command panel renders enabled, disabled, and hidden states from the action descriptor set for this booking."
          >
            <BookingCommandPanel
              actions={bookingView.actions}
              approvalHref={`/rules?bookingId=${encodeURIComponent(booking.bookingId)}`}
              auditHref={auditHref}
              booking={booking}
              readOnlyReasonCode={bookingView.readOnlyReasonCode}
            />
          </SurfaceCard>

          <SurfaceCard
            kicker="Deep links"
            title="Cross-app and follow-up links"
            description="Phase 1 keeps the apps separate, so follow-up routes stay explicit instead of masquerading as one runtime shell."
          >
            <div className="booking-deep-link-list">
              {bookingView.deepLinks.map((link) => (
                <article className="booking-deep-link-card" key={link.label}>
                  <div className="booking-deep-link-head">
                    <Link
                      className="text-link"
                      href={link.href}
                      target={link.external ? "_blank" : undefined}
                      rel={link.external ? "noreferrer" : undefined}
                    >
                      {link.label}
                    </Link>
                    {link.external ? (
                      <span className="status-chip">Cross-app</span>
                    ) : (
                      <span className="status-chip">In app</span>
                    )}
                  </div>
                  <p className="list-note">{link.note}</p>
                </article>
              ))}
            </div>
            <p className="muted-copy">
              Cross-app routes open in a new tab when authority belongs to ops
              or another deployment.
            </p>
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
