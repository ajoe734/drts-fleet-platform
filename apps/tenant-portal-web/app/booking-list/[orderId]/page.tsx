import Link from "next/link";
import { notFound } from "next/navigation";
import type { OwnedOrderRecord } from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { BookingDetailActions } from "@/components/booking-detail-actions";

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const client = getTenantClient();
  const { orderId } = await params;

  let order: OwnedOrderRecord;
  let error: string | null = null;

  try {
    order = (await client.getOrder(orderId)) as OwnedOrderRecord;
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
    notFound();
  }

  return (
    <main className="app-grid">
      <AppShellCard
        title={`Booking ${order.orderNo}`}
        description={`Order details for ${order.orderId}`}
      >
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="booking-detail" style={{ maxWidth: "800px" }}>
          {/* Status */}
          <section style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ marginBottom: "0.5rem" }}>Status</h3>
            <span
              className={`status-badge status-${order.status}`}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "4px",
                fontSize: "1rem",
                backgroundColor:
                  order.status === "completed"
                    ? "#d4edda"
                    : order.status === "cancelled"
                      ? "#f8d7da"
                      : order.status.includes("pending") ||
                          order.status.includes("required")
                        ? "#fff3cd"
                        : "#cce5ff",
              }}
            >
              {order.status}
            </span>
          </section>

          {/* Basic Info */}
          <section style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ marginBottom: "0.5rem" }}>Basic Information</h3>
            <table style={{ width: "100%" }}>
              <tbody>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Order ID
                  </td>
                  <td>{order.orderId}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Order No
                  </td>
                  <td>{order.orderNo}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Service Bucket
                  </td>
                  <td>{order.serviceBucket}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Dispatch Semantics
                  </td>
                  <td>{order.dispatchSemantics}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Booking Type
                  </td>
                  <td>{order.bookingType || "-"}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Created At
                  </td>
                  <td>{new Date(order.createdAt).toLocaleString()}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Updated At
                  </td>
                  <td>{new Date(order.updatedAt).toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Route */}
          <section style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ marginBottom: "0.5rem" }}>Route</h3>
            <table style={{ width: "100%" }}>
              <tbody>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Pickup
                  </td>
                  <td>{order.pickup.address}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Dropoff
                  </td>
                  <td>{order.dropoff.address}</td>
                </tr>
                {order.etaSnapshot && (
                  <tr>
                    <td
                      style={{ fontWeight: "bold", paddingRight: "1rem" }}
                    >
                      ETA
                    </td>
                    <td>
                      {order.etaSnapshot.etaMinutes} min (calculated at{" "}
                      {new Date(order.etaSnapshot.calculatedAt).toLocaleString()}
                      )
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          {/* Passenger */}
          <section style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ marginBottom: "0.5rem" }}>Passenger</h3>
            <table style={{ width: "100%" }}>
              <tbody>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Name
                  </td>
                  <td>{order.passenger.name}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Phone
                  </td>
                  <td>{order.passenger.phone}</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Additional Details */}
          {(order.flightNo ||
            order.terminal ||
            order.luggageCount ||
            order.notes ||
            order.costCenter ||
            order.quotedFare) && (
            <section style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ marginBottom: "0.5rem" }}>Additional Details</h3>
              <table style={{ width: "100%" }}>
                <tbody>
                  {order.flightNo && (
                    <tr>
                      <td
                        style={{ fontWeight: "bold", paddingRight: "1rem" }}
                      >
                        Flight No
                      </td>
                      <td>{order.flightNo}</td>
                    </tr>
                  )}
                  {order.terminal && (
                    <tr>
                      <td
                        style={{ fontWeight: "bold", paddingRight: "1rem" }}
                      >
                        Terminal
                      </td>
                      <td>{order.terminal}</td>
                    </tr>
                  )}
                  {order.luggageCount != null && (
                    <tr>
                      <td
                        style={{ fontWeight: "bold", paddingRight: "1rem" }}
                      >
                        Luggage Count
                      </td>
                      <td>{order.luggageCount}</td>
                    </tr>
                  )}
                  {order.notes && (
                    <tr>
                      <td
                        style={{ fontWeight: "bold", paddingRight: "1rem" }}
                      >
                        Notes
                      </td>
                      <td>{order.notes}</td>
                    </tr>
                  )}
                  {order.costCenter && (
                    <tr>
                      <td
                        style={{ fontWeight: "bold", paddingRight: "1rem" }}
                      >
                        Cost Center
                      </td>
                      <td>{order.costCenter}</td>
                    </tr>
                  )}
                  {order.quotedFare && (
                    <tr>
                      <td
                        style={{ fontWeight: "bold", paddingRight: "1rem" }}
                      >
                        Quoted Fare
                      </td>
                      <td>
                        {order.quotedFare.currency}{" "}
                        {(order.quotedFare.amountMinor / 100).toFixed(2)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          )}

          {/* Actions */}
          <section style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ marginBottom: "0.5rem" }}>Actions</h3>
            <BookingDetailActions order={order} />
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
