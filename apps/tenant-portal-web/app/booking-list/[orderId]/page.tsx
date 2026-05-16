import Link from "next/link";
import { notFound } from "next/navigation";
import type { BookingRecord, TenantInvoiceRecord } from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { BookingCommandPanel } from "@/components/booking-command-panel";
import { getTenantClient } from "@/lib/api-client";
import { getTenantRoleSnapshot } from "@/lib/rbac";
import {
  buildBookingTimeline,
  describeManualFareOverride,
  findInvoicesForOrder,
  formatDateTime,
  formatMoney,
  summarizeComplianceGates,
} from "@/lib/booking-domain";
import {
  getBookingSourceVisibility,
  getSourceToneClassName,
} from "@/lib/source-domain";

export const dynamic = "force-dynamic";

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const client = await getTenantClient();
  const roleSnapshot = await getTenantRoleSnapshot();
  const { orderId: bookingId } = await params;

  const [bookingResult, invoicesResult] = await Promise.allSettled([
    client.getTenantBooking(bookingId) as Promise<BookingRecord>,
    client.listInvoices(),
  ]);

  if (bookingResult.status === "rejected") {
    notFound();
  }

  const booking = bookingResult.value;
  const source = getBookingSourceVisibility(booking);
  const timeline = buildBookingTimeline(booking);
  const relatedInvoices: TenantInvoiceRecord[] =
    invoicesResult.status === "fulfilled"
      ? findInvoicesForOrder(invoicesResult.value, booking.orderId)
      : [];
  const invoiceWarning =
    invoicesResult.status === "rejected"
      ? invoicesResult.reason instanceof Error
        ? invoicesResult.reason.message
        : "Invoice context unavailable"
      : null;

  return (
    <main className="app-grid">
      <AppShellCard
        title={`Booking ${booking.bookingId}`}
        description="Productized tenant booking detail: lifecycle timeline, route and passenger context, fulfillment summary, fare and invoice context, and allowed tenant actions only."
      >
        <section className="surface-grid surface-grid-wide">
          <article className="surface-card">
            <span className="surface-kicker">Overview</span>
            <h3>Workflow and fulfillment summary</h3>
            <p>
              Booking and order state remain distinct: tenant booking status
              describes the business record, while order status reflects
              dispatch execution.
            </p>
            <div className="chip-row">
              <span className={`status-badge status-${booking.orderStatus}`}>
                {booking.orderStatus}
              </span>
              <span className="status-chip">Booking {booking.status}</span>
              <span className={getSourceToneClassName(source.tone)}>
                {source.badge}
              </span>
            </div>
            <dl className="definition-grid">
              <div>
                <dt>Order ID</dt>
                <dd>{booking.orderId}</dd>
              </div>
              <div>
                <dt>Service bucket</dt>
                <dd>{booking.serviceBucket}</dd>
              </div>
              <div>
                <dt>Dispatch subtype</dt>
                <dd>{booking.businessDispatchSubtype}</dd>
              </div>
              <div>
                <dt>Booking type</dt>
                <dd>{booking.bookingType}</dd>
              </div>
              <div>
                <dt>Fulfillment path</dt>
                <dd>{source.summary}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDateTime(booking.createdAt)}</dd>
              </div>
            </dl>
            <p className="source-note">{source.detail}</p>
          </article>

          <article className="surface-card">
            <span className="surface-kicker">Timeline</span>
            <h3>Booking lifecycle checkpoints</h3>
            <p>
              Tenant detail surfaces published booking checkpoints. Low-level
              dispatch trace and driver task projection remain on the ops
              console authority lane until a tenant-projected timeline endpoint
              ships (XS-UI-001 BD-1).
            </p>
            <ol className="booking-timeline">
              {timeline.map((point) => (
                <li className="booking-timeline-item" key={point.key}>
                  <strong>{point.label}</strong>
                  <span>
                    {point.at ? formatDateTime(point.at) : "Not published"}
                  </span>
                  <p className="muted-copy">{point.detail}</p>
                </li>
              ))}
            </ol>
          </article>
        </section>

        <section className="surface-grid surface-grid-wide">
          <article className="surface-card">
            <span className="surface-kicker">Passenger and route</span>
            <h3>Rider context</h3>
            <p>
              Passenger and route context stay together so tenant users can
              confirm the business reservation without opening a dispatch-only
              screen.
            </p>
            <dl className="definition-grid">
              <div>
                <dt>Passenger</dt>
                <dd>{booking.passenger.name}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{booking.passenger.phone || "Not provided"}</dd>
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
                <dt>Direction</dt>
                <dd>{booking.direction ?? "Not specified"}</dd>
              </div>
              <div>
                <dt>Recurrence</dt>
                <dd>{booking.recurrenceRule ?? "Single trip"}</dd>
              </div>
            </dl>
          </article>

          <article className="surface-card">
            <span className="surface-kicker">Fulfillment</span>
            <h3>Authority-safe fulfillment summary</h3>
            <p>
              Fulfillment ownership is summarized from the booking record.
              Driver identity, vehicle assignment, and live dispatch candidate
              state remain outside tenant authority unless a dedicated
              tenant-projected read model is added later (XS-UI-001 BD-2).
            </p>
            <dl className="definition-grid">
              <div>
                <dt>Source domain</dt>
                <dd>{source.badge}</dd>
              </div>
              <div>
                <dt>Partner program</dt>
                <dd>{booking.partnerProgramId ?? "Not applicable"}</dd>
              </div>
              <div>
                <dt>Partner entry</dt>
                <dd>{booking.partnerEntrySlug ?? "Not applicable"}</dd>
              </div>
              <div>
                <dt>Eligibility</dt>
                <dd>{booking.eligibilityVerificationId ?? "Not applicable"}</dd>
              </div>
              <div>
                <dt>Issuer authorization</dt>
                <dd>{booking.issuerAuthorizationRef ?? "Not applicable"}</dd>
              </div>
              <div>
                <dt>Compliance</dt>
                <dd>{summarizeComplianceGates(booking.complianceGates)}</dd>
              </div>
            </dl>
            <p className="muted-copy">
              Driver, vehicle, and live ETA detail are intentionally suppressed
              until a tenant-cleared fulfillment projection is published.
            </p>
          </article>
        </section>

        <section className="surface-grid surface-grid-wide">
          <article className="surface-card">
            <span className="surface-kicker">Fare and invoice</span>
            <h3>Tenant-visible finance context</h3>
            <p>
              The detail surface shows quoted fare authority and invoice linkage
              when the backend already publishes them.
            </p>
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
                  {describeManualFareOverride(booking.manualFareOverride)}
                </dd>
              </div>
            </dl>
            {invoiceWarning ? (
              <p className="muted-copy">
                Invoice context unavailable: {invoiceWarning}
              </p>
            ) : null}
            {relatedInvoices.length > 0 ? (
              <ul className="panel-list">
                {relatedInvoices.map((invoice) => (
                  <li key={invoice.invoiceId}>
                    <strong>{invoice.invoiceId}</strong>
                    <span className="list-note">
                      {invoice.status} · {formatMoney(invoice.amount)} · period{" "}
                      {formatDateTime(invoice.periodStart)} →{" "}
                      {formatDateTime(invoice.periodEnd)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : invoiceWarning ? null : (
              <p className="muted-copy">
                No tenant invoice row is currently linked to this order. Invoice
                linkage is period-based today (XS-UI-001 BD-3).
              </p>
            )}
          </article>

          <article className="surface-card">
            <span className="surface-kicker">Business context</span>
            <h3>Reservation attributes</h3>
            <p>
              Optional business-travel fields stay readable here so tenant users
              can confirm the reservation payload without mutating workflow
              state.
            </p>
            <dl className="definition-grid">
              <div>
                <dt>Cost center</dt>
                <dd>{booking.costCenter ?? "Not provided"}</dd>
              </div>
              <div>
                <dt>Vehicle preference</dt>
                <dd>{booking.vehiclePreference ?? "Not provided"}</dd>
              </div>
              <div>
                <dt>Benefit reference</dt>
                <dd>{booking.benefitReference ?? "Not provided"}</dd>
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
                <dt>Booked by</dt>
                <dd>
                  {booking.bookedBy
                    ? `${booking.bookedBy.name} · ${booking.bookedBy.email}`
                    : "Not provided"}
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
              <div>
                <dt>Notes</dt>
                <dd>{booking.notes ?? "Not provided"}</dd>
              </div>
            </dl>
          </article>
        </section>

        <article className="surface-card">
          <span className="surface-kicker">Allowed actions</span>
          <h3>Tenant command lane</h3>
          <p>
            Only supported tenant commands appear here. Update routes through
            <code> PUT /api/tenant/bookings/:bookingId </code>and cancel routes
            through <code> POST /api/tenant/bookings/:bookingId/cancel </code>
            via the canonical api-client.
          </p>
          <BookingCommandPanel
            booking={booking}
            allowMutations={roleSnapshot.capabilities.canWriteTenant}
          />
        </article>

        <section className="callout-panel">
          <strong>Authority boundary</strong>
          <p>
            Driver assignment, dispatch override, manual fare override, and
            external settlement actions are not exposed on the tenant surface.
            Refer to the cross-system command-action matrix (XS-UI-003) and the
            route-to-endpoint map (XS-UI-001) for the full authority partition.
          </p>
        </section>

        <Link className="route-link" href="/booking-list">
          <strong>Back to booking list</strong>
          Return to the productized booking oversight surface.
        </Link>
      </AppShellCard>
    </main>
  );
}
