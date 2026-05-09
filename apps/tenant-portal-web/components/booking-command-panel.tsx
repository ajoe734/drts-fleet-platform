"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  BookingRecord,
  UpdateTenantBookingCommand,
} from "@drts/contracts";
import {
  formatDateTime,
  getBookingActionCapabilities,
} from "@/lib/booking-domain";

type Mode = "update" | "cancel" | null;

export function BookingCommandPanel({ booking }: { booking: BookingRecord }) {
  const router = useRouter();
  const capabilities = getBookingActionCapabilities(booking);
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
        `/api/bookings/${encodeURIComponent(booking.bookingId)}/update`,
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
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
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
        `/api/bookings/${encodeURIComponent(booking.bookingId)}/cancel`,
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
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unknown cancel failure.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="booking-action-panel">
      <div className="booking-action-stack">
        <div>
          <strong>Allowed tenant actions</strong>
          <p className="muted-copy">
            Tenant users can only call supported booking commands. Driver
            assignment, dispatch override, manual fare override, and external
            settlement actions stay on the ops console authority lane and never
            surface here.
          </p>
        </div>

        <div className="booking-action-row">
          <button
            className="action-button-secondary"
            disabled={!capabilities.canUpdate}
            onClick={() => {
              setError(null);
              setMode("update");
            }}
            type="button"
          >
            Update booking
          </button>
          <button
            className="action-button-danger"
            disabled={!capabilities.canCancel}
            onClick={() => {
              setError(null);
              setMode("cancel");
            }}
            type="button"
          >
            Cancel booking
          </button>
        </div>

        {capabilities.updateReason ? (
          <p className="booking-action-note">
            Update unavailable: {capabilities.updateReason}
            {booking.modifiableUntil
              ? ` (cutoff ${formatDateTime(booking.modifiableUntil)})`
              : ""}
          </p>
        ) : null}
        {capabilities.cancelReason ? (
          <p className="booking-action-note">
            Cancel unavailable: {capabilities.cancelReason}
            {booking.cancelableUntil
              ? ` (cutoff ${formatDateTime(booking.cancelableUntil)})`
              : ""}
          </p>
        ) : null}
      </div>

      {mode ? (
        <div className="booking-modal-overlay" role="presentation">
          <div
            aria-modal="true"
            className="booking-modal-panel"
            role="dialog"
            aria-label={mode === "update" ? "Update booking" : "Cancel booking"}
          >
            <div className="booking-modal-header">
              <div>
                <strong>
                  {mode === "update" ? "Update booking" : "Cancel booking"}
                </strong>
                <p className="muted-copy">{booking.bookingId}</p>
              </div>
              <button
                className="booking-modal-close"
                onClick={() => setMode(null)}
                type="button"
              >
                Close
              </button>
            </div>

            {error ? <div className="error-banner">{error}</div> : null}

            {mode === "update" ? (
              <div className="booking-form-stack">
                <label className="booking-field">
                  <span>Pickup address</span>
                  <input
                    onChange={(event) => setPickupAddress(event.target.value)}
                    type="text"
                    value={pickupAddress}
                  />
                </label>
                <label className="booking-field">
                  <span>Dropoff address</span>
                  <input
                    onChange={(event) => setDropoffAddress(event.target.value)}
                    type="text"
                    value={dropoffAddress}
                  />
                </label>
                <label className="booking-field">
                  <span>Notes</span>
                  <textarea
                    onChange={(event) => setNotes(event.target.value)}
                    rows={3}
                    value={notes}
                  />
                </label>
                <label className="booking-field">
                  <span>Cost center</span>
                  <input
                    onChange={(event) => setCostCenter(event.target.value)}
                    type="text"
                    value={costCenter}
                  />
                </label>
                <label className="booking-field">
                  <span>Vehicle preference</span>
                  <input
                    onChange={(event) =>
                      setVehiclePreference(event.target.value)
                    }
                    type="text"
                    value={vehiclePreference}
                  />
                </label>
                <div className="booking-action-row">
                  <button
                    className="action-button-primary"
                    disabled={loading}
                    onClick={() => void submitUpdate()}
                    type="button"
                  >
                    {loading ? "Saving..." : "Save changes"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="booking-form-stack">
                <label className="booking-field">
                  <span>Cancellation reason (optional)</span>
                  <textarea
                    onChange={(event) => setCancelReason(event.target.value)}
                    rows={4}
                    value={cancelReason}
                  />
                </label>
                <div className="booking-action-row">
                  <button
                    className="action-button-danger"
                    disabled={loading}
                    onClick={() => void submitCancel()}
                    type="button"
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
