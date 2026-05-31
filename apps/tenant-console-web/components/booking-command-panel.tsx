"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  BookingRecord,
  UpdateTenantBookingCommand,
} from "@drts/contracts";
import { resolveBookingEditability } from "@/lib/booking-actions";

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

  // CTAs are driven by `availableActions` + `editableUntil` per Q-TEN05, not
  // by status — see lib/booking-actions.ts. Falls back to the legacy
  // modify/cancel windows only when the backend has not populated the field.
  const editability = useMemo(
    () => resolveBookingEditability(booking),
    [booking],
  );
  const commandState = {
    canUpdate: editability.update.enabled,
    canCancel: editability.cancel.enabled,
    updateReason: editability.update.reason,
    cancelReason: editability.cancel.reason,
    cancelRequiresReason: editability.cancel.requiresReason,
    acceptedPending: editability.acceptedPending,
  };

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
          <strong>租戶可用操作</strong>
          <p>
            CTA 由後端 <code>availableActions</code> + <code>editableUntil</code>{" "}
            決定（Q-TEN05），不由前端依狀態硬編碼。租戶僅能呼叫受支援的 booking
            command，無法覆寫派遣狀態、計價權責或履約歸屬。
          </p>
        </div>
        {commandState.acceptedPending ? (
          <p className="action-note">
            上一個 command 已受理、等待外部確認中，期間暫不開放新的變更。
          </p>
        ) : null}
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
                  <span>
                    取消原因
                    {commandState.cancelRequiresReason ? " （必填）" : ""}
                  </span>
                  <textarea
                    rows={4}
                    value={cancelReason}
                    onChange={(event) => setCancelReason(event.target.value)}
                  />
                </label>
                <div className="action-row">
                  <button
                    className="action-button action-button-danger"
                    disabled={
                      loading ||
                      (commandState.cancelRequiresReason &&
                        !cancelReason.trim())
                    }
                    type="button"
                    onClick={() => void submitCancel()}
                  >
                    {loading ? "取消處理中…" : "確認取消"}
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
