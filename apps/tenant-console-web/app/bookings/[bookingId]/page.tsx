import Link from "next/link";
import { notFound } from "next/navigation";
import type { BookingRecord, TenantInvoiceRecord } from "@drts/contracts";
import { BookingCommandPanel } from "@/components/booking-command-panel";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { getTenantClient } from "@/lib/api-client";
import { formatDateTime, formatMoney } from "@/lib/formatters";
import {
  getBookingSourceVisibility,
  getSourceToneClassName,
} from "@/lib/source-domain";

export const dynamic = "force-dynamic";

type TimelineRow = {
  label: string;
  at: string | null;
  detail: string;
};

function buildTimeline(booking: BookingRecord): TimelineRow[] {
  return [
    {
      label: "Booking created",
      at: booking.createdAt,
      detail: "Tenant intake accepted into the booking ledger.",
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
      label: "Current workflow state",
      at: booking.updatedAt,
      detail: `Order status is ${booking.orderStatus}.`,
    },
    {
      label: "Tenant modification cutoff",
      at: booking.modifiableUntil,
      detail: booking.modifiableUntil
        ? "Further tenant edits follow this cutoff."
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

function findRelatedInvoices(
  invoices: TenantInvoiceRecord[],
  orderId: string,
): TenantInvoiceRecord[] {
  return invoices.filter((invoice) =>
    invoice.lines.some((line) => line.orderId === orderId),
  );
}

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const client = getTenantClient();
  const [bookingResult, invoicesResult] = await Promise.allSettled([
    client.getTenantBooking(bookingId) as Promise<BookingRecord>,
    client.listInvoices(),
  ]);

  if (bookingResult.status === "rejected") {
    notFound();
  }

  const booking = bookingResult.value;
  const source = getBookingSourceVisibility(booking);
  const timeline = buildTimeline(booking);
  const relatedInvoices =
    invoicesResult.status === "fulfilled"
      ? findRelatedInvoices(invoicesResult.value, booking.orderId)
      : [];

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Booking detail"
        title={`Booking ${booking.bookingId}`}
        description="The detail surface keeps booking truth, fulfillment framing, fare context, and tenant-allowed commands together without leaking dispatch-only authority."
      />

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="Overview"
          title="Workflow and fulfillment summary"
          description="Booking and order state remain distinct: tenant booking status describes the business record, while order status reflects dispatch execution."
        >
          <div className="detail-stack">
            <div className="chip-row">
              <span className="status-badge">{booking.orderStatus}</span>
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
                <dt>Fulfillment path</dt>
                <dd>{source.summary}</dd>
              </div>
              <div>
                <dt>Authority owner</dt>
                <dd>{source.badge}</dd>
              </div>
            </dl>
            <p className="muted-copy">{source.detail}</p>
            {source.domain === "forwarded_authority" ? (
              <CalloutPanel
                title="Forwarded-authority boundary"
                description={source.statusBoundary}
                tone="warning"
              >
                <p>{source.escalationHint}</p>
              </CalloutPanel>
            ) : null}
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker="Timeline"
          title="Booking lifecycle checkpoints"
          description="Tenant detail shows published booking checkpoints. Low-level dispatch trace stays in the ops console authority lane."
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
      </section>

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="Passenger and route"
          title="Rider context"
          description="Passenger and route context stay adjacent so tenant users can confirm the business reservation without opening a dispatch-only screen."
        >
          <dl className="definition-grid">
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
          </dl>
        </SurfaceCard>

        <SurfaceCard
          kicker="Fare and invoice"
          title="Tenant-visible finance context"
          description="The detail surface shows quoted fare authority and invoice linkage where the backend already publishes it."
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
            <p className="muted-copy">
              No tenant invoice row is currently linked to this order.
            </p>
          )}
        </SurfaceCard>
      </section>

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="Additional detail"
          title="Business context"
          description="Optional business-travel fields remain visible here so tenant users can inspect the full reservation payload without mutating workflow state directly."
        >
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
          </dl>
        </SurfaceCard>

        <SurfaceCard
          kicker="Allowed actions"
          title="Tenant command lane"
          description="Only supported tenant commands appear here. Driver assignment, dispatch override, and external settlement actions remain hidden."
        >
          <BookingCommandPanel booking={booking} />
        </SurfaceCard>
      </section>

      <CalloutPanel
        title="Authority-safe fulfillment summary"
        description="Driver identity, live dispatch candidate state, and adapter internals remain outside tenant authority unless a dedicated backend read model is added later."
      />

      <div className="link-row">
        <Link className="text-link" href="/bookings">
          Back to booking list
        </Link>
      </div>
    </div>
  );
}
