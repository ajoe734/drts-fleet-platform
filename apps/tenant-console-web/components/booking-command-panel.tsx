"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  BookingRecord,
  UpdateTenantBookingCommand,
} from "@drts/contracts";
import { formatDateTime, isFutureIso } from "@/lib/formatters";

type Mode = "update" | "cancel" | null;

export function BookingCommandPanel({ booking }: { booking: BookingRecord }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickupAddress, setPickupAddress] = useState(booking.pickup.address);
  const [dropoffAddress, setDropoffAddress] = useState(booking.dropoff.address);
  const [notes, setNotes] = useState(booking.notes ?? "");
  const [costCenter, setCostCenter] = useState(booking.costCenter ?? "");
  const [vehiclePreference, setVehiclePreference] = useState(
    booking.vehiclePreference ?? "",
  );
  const [cancelReason, setCancelReason] = useState("");

  const commandState = useMemo(() => {
    const isTerminal =
      booking.orderStatus === "completed" ||
      booking.orderStatus === "cancelled";
    const isOnTrip = booking.orderStatus === "on_trip";
    const withinUpdateWindow =
      booking.modifiableUntil == null || isFutureIso(booking.modifiableUntil);
    const withinCancelWindow =
      booking.cancelableUntil == null || isFutureIso(booking.cancelableUntil);

    return {
      canUpdate: !isTerminal && !isOnTrip && withinUpdateWindow,
      canCancel: !isTerminal && withinCancelWindow,
      updateReason: isTerminal
        ? "Completed and cancelled bookings are read-only."
        : isOnTrip
          ? "On-trip bookings can no longer be edited from tenant control."
          : withinUpdateWindow
            ? null
            : `Update window closed at ${formatDateTime(booking.modifiableUntil)}.`,
      cancelReason: isTerminal
        ? "Completed and cancelled bookings cannot be cancelled again."
        : withinCancelWindow
          ? null
          : `Cancellation window closed at ${formatDateTime(booking.cancelableUntil)}.`,
    };
  }, [booking]);

  async function submitUpdate() {
    setLoading(true);
    setError(null);
    try {
      const payload: UpdateTenantBookingCommand = {
        pickup: { ...booking.pickup, address: pickupAddress },
        dropoff: { ...booking.dropoff, address: dropoffAddress },
        notes: notes.trim() ? notes.trim() : null,
        costCenter: costCenter.trim() ? costCenter.trim() : null,
        vehiclePreference: vehiclePreference.trim()
          ? vehiclePreference.trim()
          : null,
      };

      const response = await fetch(
        `/api/bookings/${booking.bookingId}/update`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        throw new Error(await response.text());
      }

      setMode(null);
      router.refresh();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unknown update failure.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function submitCancel() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/bookings/${booking.bookingId}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: cancelReason.trim() ? cancelReason.trim() : undefined,
          }),
        },
      );
      if (!response.ok) {
        throw new Error(await response.text());
      }

      setMode(null);
      router.refresh();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unknown cancel failure.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="action-panel">
      <div className="action-stack">
        <div className="action-copy">
          <strong>Allowed tenant actions</strong>
          <p>
            Tenant users can only call supported booking commands. They cannot
            override dispatch state, fare authority, or fulfillment ownership.
          </p>
        </div>
        <div className="action-row">
          <button
            className="action-button action-button-secondary"
            disabled={!commandState.canUpdate}
            type="button"
            onClick={() => {
              setError(null);
              setMode("update");
            }}
          >
            Update booking
          </button>
          <button
            className="action-button action-button-danger"
            disabled={!commandState.canCancel}
            type="button"
            onClick={() => {
              setError(null);
              setMode("cancel");
            }}
          >
            Cancel booking
          </button>
        </div>
        {commandState.updateReason ? (
          <p className="action-note">{commandState.updateReason}</p>
        ) : null}
        {commandState.cancelReason ? (
          <p className="action-note">{commandState.cancelReason}</p>
        ) : null}
      </div>

      {mode ? (
        <div className="modal-overlay" role="presentation">
          <div
            aria-modal="true"
            className="modal-panel"
            role="dialog"
            aria-label={mode === "update" ? "Update booking" : "Cancel booking"}
          >
            <div className="modal-header">
              <div>
                <strong>
                  {mode === "update" ? "Update booking" : "Cancel booking"}
                </strong>
                <p>{booking.bookingId}</p>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setMode(null)}
              >
                Close
              </button>
            </div>

            {error ? <div className="form-error">{error}</div> : null}

            {mode === "update" ? (
              <div className="form-stack">
                <label className="field-stack">
                  <span>Pickup address</span>
                  <input
                    value={pickupAddress}
                    onChange={(event) => setPickupAddress(event.target.value)}
                    type="text"
                  />
                </label>
                <label className="field-stack">
                  <span>Dropoff address</span>
                  <input
                    value={dropoffAddress}
                    onChange={(event) => setDropoffAddress(event.target.value)}
                    type="text"
                  />
                </label>
                <label className="field-stack">
                  <span>Notes</span>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </label>
                <div className="form-grid">
                  <label className="field-stack">
                    <span>Cost center</span>
                    <input
                      value={costCenter}
                      onChange={(event) => setCostCenter(event.target.value)}
                      type="text"
                    />
                  </label>
                  <label className="field-stack">
                    <span>Vehicle preference</span>
                    <input
                      value={vehiclePreference}
                      onChange={(event) =>
                        setVehiclePreference(event.target.value)
                      }
                      type="text"
                    />
                  </label>
                </div>
                <div className="action-row">
                  <button
                    className="action-button action-button-primary"
                    disabled={loading}
                    type="button"
                    onClick={() => void submitUpdate()}
                  >
                    {loading ? "Saving..." : "Save changes"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="form-stack">
                <label className="field-stack">
                  <span>Cancellation reason</span>
                  <textarea
                    rows={4}
                    value={cancelReason}
                    onChange={(event) => setCancelReason(event.target.value)}
                  />
                </label>
                <div className="action-row">
                  <button
                    className="action-button action-button-danger"
                    disabled={loading}
                    type="button"
                    onClick={() => void submitCancel()}
                  >
                    {loading ? "Cancelling..." : "Confirm cancel"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
