import Link from "next/link";
import { notFound } from "next/navigation";
import type { BookingRecord } from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { BookingDetailActions } from "@/components/booking-detail-actions";
import {
  getBookingSourceVisibility,
  getSourceToneClassName,
} from "@/lib/source-domain";

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const client = getTenantClient();
  const { orderId: bookingId } = await params;

  let booking: BookingRecord;
  let error: string | null = null;

  try {
    booking = (await client.getTenantBooking(bookingId)) as BookingRecord;
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
    notFound();
  }

  const source = getBookingSourceVisibility(booking);

  return (
    <main className="app-grid">
      <AppShellCard
        title={`Booking ${booking.bookingId}`}
        description={`Tenant booking details for ${booking.bookingId}`}
      >
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="booking-detail" style={{ maxWidth: "800px" }}>
          <section style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ marginBottom: "0.5rem" }}>Status</h3>
            <span
              className={`status-badge status-${booking.orderStatus}`}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "4px",
                fontSize: "1rem",
                backgroundColor:
                  booking.orderStatus === "completed"
                    ? "#d4edda"
                    : booking.orderStatus === "cancelled"
                      ? "#f8d7da"
                      : booking.orderStatus.includes("pending") ||
                          booking.orderStatus.includes("required")
                        ? "#fff3cd"
                        : "#cce5ff",
              }}
            >
              {booking.orderStatus}
            </span>
            <div style={{ marginTop: "0.75rem" }}>
              <span className={getSourceToneClassName(source.tone)}>
                {source.badge}
              </span>
              <p className="source-note">{source.detail}</p>
            </div>
          </section>

          <section style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ marginBottom: "0.5rem" }}>Basic Information</h3>
            <table style={{ width: "100%" }}>
              <tbody>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Booking ID
                  </td>
                  <td>{booking.bookingId}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Order ID
                  </td>
                  <td>{booking.orderId}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Service Bucket
                  </td>
                  <td>{booking.serviceBucket}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Fulfillment Source
                  </td>
                  <td>{source.summary}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Booking Type
                  </td>
                  <td>{booking.bookingType || "-"}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Reservation Window
                  </td>
                  <td>
                    {new Date(booking.reservationWindowStart).toLocaleString()}{" "}
                    - {new Date(booking.reservationWindowEnd).toLocaleString()}
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Created At
                  </td>
                  <td>{new Date(booking.createdAt).toLocaleString()}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Updated At
                  </td>
                  <td>{new Date(booking.updatedAt).toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ marginBottom: "0.5rem" }}>Route</h3>
            <table style={{ width: "100%" }}>
              <tbody>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Pickup
                  </td>
                  <td>{booking.pickup.address}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Dropoff
                  </td>
                  <td>{booking.dropoff.address}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ marginBottom: "0.5rem" }}>Passenger</h3>
            <table style={{ width: "100%" }}>
              <tbody>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Name
                  </td>
                  <td>{booking.passenger.name}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Phone
                  </td>
                  <td>{booking.passenger.phone}</td>
                </tr>
              </tbody>
            </table>
          </section>

          {(booking.flightNo ||
            booking.terminal ||
            booking.luggageCount ||
            booking.notes ||
            booking.costCenter ||
            booking.vehiclePreference ||
            booking.bookedBy ||
            booking.onsiteContact) && (
            <section style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ marginBottom: "0.5rem" }}>Additional Details</h3>
              <table style={{ width: "100%" }}>
                <tbody>
                  {booking.flightNo && (
                    <tr>
                      <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                        Flight No
                      </td>
                      <td>{booking.flightNo}</td>
                    </tr>
                  )}
                  {booking.terminal && (
                    <tr>
                      <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                        Terminal
                      </td>
                      <td>{booking.terminal}</td>
                    </tr>
                  )}
                  {booking.luggageCount != null && (
                    <tr>
                      <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                        Luggage Count
                      </td>
                      <td>{booking.luggageCount}</td>
                    </tr>
                  )}
                  {booking.notes && (
                    <tr>
                      <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                        Notes
                      </td>
                      <td>{booking.notes}</td>
                    </tr>
                  )}
                  {booking.costCenter && (
                    <tr>
                      <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                        Cost Center
                      </td>
                      <td>{booking.costCenter}</td>
                    </tr>
                  )}
                  {booking.vehiclePreference && (
                    <tr>
                      <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                        Vehicle Preference
                      </td>
                      <td>{booking.vehiclePreference}</td>
                    </tr>
                  )}
                  {booking.bookedBy && (
                    <tr>
                      <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                        Booked By
                      </td>
                      <td>
                        {booking.bookedBy.name} ({booking.bookedBy.email})
                      </td>
                    </tr>
                  )}
                  {booking.onsiteContact && (
                    <tr>
                      <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                        Onsite Contact
                      </td>
                      <td>
                        {booking.onsiteContact.name} (
                        {booking.onsiteContact.phone})
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          )}

          <section style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ marginBottom: "0.5rem" }}>Actions</h3>
            <BookingDetailActions booking={booking} />
          </section>

          <Link className="route-link" href="/booking-list">
            <strong>Back to booking list</strong>
            Return to the booking overview.
          </Link>
        </div>
      </AppShellCard>
    </main>
  );
}
