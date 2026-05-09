import Link from "next/link";
import { notFound } from "next/navigation";
import type { BookingRecord } from "@drts/contracts";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import {
  buildPartnerClient,
  requirePartnerSession,
} from "@/lib/partner-session";

export const dynamic = "force-dynamic";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export default async function PartnerBookingConfirmationPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const session = await requirePartnerSession();
  const client = buildPartnerClient(session);

  let booking: BookingRecord;
  try {
    booking = (await client.getTenantBooking(bookingId)) as BookingRecord;
  } catch {
    notFound();
  }

  const isPartnerBooking =
    booking.businessDispatchSubtype ===
    session.partnerEntry.businessDispatchSubtype;

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Booking confirmed"
        title={`Booking ${booking.bookingId} created.`}
        description="The partner caller can use this confirmation as proof of intake. Mutations from this surface go through tenant-allowed commands only."
      />

      <SurfaceCard
        kicker="Identity"
        title="Partner provenance recorded"
        description="The booking now carries partner provenance. Downstream audit, billing, and reporting will keep the entry slug attached."
      >
        <dl className="definition-grid">
          <div>
            <dt>Booking id</dt>
            <dd>
              <code>{booking.bookingId}</code>
            </dd>
          </div>
          <div>
            <dt>Order id</dt>
            <dd>
              <code>{booking.orderId}</code>
            </dd>
          </div>
          <div>
            <dt>Order status</dt>
            <dd>
              <span className="status-badge">{booking.orderStatus}</span>
            </dd>
          </div>
          <div>
            <dt>Service subtype</dt>
            <dd>
              <code>{booking.businessDispatchSubtype}</code>
              {!isPartnerBooking ? (
                <span className="status-chip is-warning">subtype mismatch</span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>Reservation window</dt>
            <dd>
              {formatDateTime(booking.reservationWindowStart)} →{" "}
              {formatDateTime(booking.reservationWindowEnd)}
            </dd>
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
            <dt>Passenger</dt>
            <dd>
              {booking.passenger.name}
              <span className="table-secondary">
                {" "}
                · {booking.passenger.phone}
              </span>
            </dd>
          </div>
        </dl>
      </SurfaceCard>

      <CalloutPanel
        title="What partner mode can and cannot do next"
        description="The partner surface stops at booking creation. Update / cancel commands belong to tenant-admin or ops authority."
      >
        <ul className="panel-list">
          <li>Partner can present this confirmation to the rider.</li>
          <li>
            Partner cannot edit, cancel, or override the booking from this
            surface.
          </li>
          <li>For changes, contact tenant admin or ops with the booking id.</li>
        </ul>
        <div className="link-row">
          <Link className="text-link" href="/partner/booking/new">
            Create another booking
          </Link>
          <Link className="text-link" href="/partner/start">
            Back to partner workspace
          </Link>
        </div>
      </CalloutPanel>
    </div>
  );
}
