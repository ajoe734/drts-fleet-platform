"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OwnedOrderRecord, UpdateTenantBookingCommand } from "@drts/contracts";

interface UpdateBookingFormProps {
  order: OwnedOrderRecord;
}

export function UpdateBookingForm({ order }: UpdateBookingFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  const [pickupAddress, setPickupAddress] = useState(order.pickup.address);
  const [dropoffAddress, setDropoffAddress] = useState(order.dropoff.address);
  const [notes, setNotes] = useState(order.notes || "");
  const [costCenter, setCostCenter] = useState(order.costCenter || "");
  const [vehiclePreference, setVehiclePreference] = useState(order.vehiclePreference || "");

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const updateCommand: UpdateTenantBookingCommand = {
        pickup: {
          ...order.pickup,
          address: pickupAddress,
        },
        dropoff: {
          ...order.dropoff,
          address: dropoffAddress,
        },
        notes: notes || null,
        costCenter: costCenter || null,
        vehiclePreference: vehiclePreference || null,
      };

      const res = await fetch(`/api/bookings/${order.orderId}/update`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateCommand),
      });

      if (!res.ok) {
        const errText = await res.text();
        setError(`Update failed: ${errText}`);
        return;
      }

      router.refresh();
      setShowDialog(false);
    } catch (e) {
      setError(
        `Update failed: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setShowDialog(true)}
        className="action-button update"
        style={{
          background: "none",
          border: "1px solid #007bff",
          color: "#007bff",
          padding: "0.5rem 1rem",
          cursor: "pointer",
          borderRadius: "4px",
        }}
      >
        Update Booking
      </button>

      {showDialog && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowDialog(false)}
        >
          <div
            className="modal-content"
            style={{
              backgroundColor: "white",
              padding: "2rem",
              borderRadius: "8px",
              maxWidth: "600px",
              width: "90%",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Update Booking</h3>
            <p>Order: {order.orderNo}</p>

            {error && (
              <div
                className="error-banner"
                style={{
                  backgroundColor: "#f8d7da",
                  color: "#721c24",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  marginBottom: "1rem",
                }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleUpdate}>
              <div style={{ marginBottom: "1rem" }}>
                <label htmlFor="pickup-address" style={{ display: "block", marginBottom: "0.5rem" }}>
                  Pickup Address:
                </label>
                <input
                  type="text"
                  id="pickup-address"
                  value={pickupAddress}
                  onChange={(e) => setPickupAddress(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                  }}
                />
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label htmlFor="dropoff-address" style={{ display: "block", marginBottom: "0.5rem" }}>
                  Dropoff Address:
                </label>
                <input
                  type="text"
                  id="dropoff-address"
                  value={dropoffAddress}
                  onChange={(e) => setDropoffAddress(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                  }}
                />
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label htmlFor="notes" style={{ display: "block", marginBottom: "0.5rem" }}>
                  Notes:
                </label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                  }}
                />
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label htmlFor="cost-center" style={{ display: "block", marginBottom: "0.5rem" }}>
                  Cost Center:
                </label>
                <input
                  type="text"
                  id="cost-center"
                  value={costCenter}
                  onChange={(e) => setCostCenter(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                  }}
                />
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label htmlFor="vehicle-pref" style={{ display: "block", marginBottom: "0.5rem" }}>
                  Vehicle Preference:
                </label>
                <input
                  type="text"
                  id="vehicle-pref"
                  value={vehiclePreference}
                  onChange={(e) => setVehiclePreference(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setShowDialog(false)}
                  style={{
                    padding: "0.5rem 1rem",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#007bff",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: loading ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "Updating..." : "Confirm Update"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
