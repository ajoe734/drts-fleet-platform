"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type {
  BookingRecord,
  ResourceActionDescriptor,
  UpdateTenantBookingCommand,
} from "@drts/contracts";
import { findBookingAction } from "@/lib/booking-presentation";

type Mode = "update" | "cancel" | null;

// Human copy for the disabledReasonCode an action descriptor carries. Driven by
// availableActions (Q-X13) — the panel never recomputes editability from status.
const DISABLED_REASON_COPY: Record<string, string> = {
  terminal_completed: "訂單已完成，無法再更新或取消。",
  terminal_cancelled: "訂單已取消，無法再更新或取消。",
  terminal_state: "訂單已進入終態，無法執行此動作。",
  on_trip_locked: "行程進行中，租戶端已鎖定編輯。",
  approval_blocked: "審批未通過 (blocked / rejected)，請先重新送出審批。",
  past_editable_until: "已超過可編輯時間 (editableUntil)。",
  past_cancelable_until: "已超過可取消時間 (cancelableUntil)。",
};

function disabledReasonCopy(
  descriptor: ResourceActionDescriptor | null,
): string | null {
  if (!descriptor || descriptor.enabled || !descriptor.disabledReasonCode) {
    return null;
  }
  return (
    DISABLED_REASON_COPY[descriptor.disabledReasonCode] ??
    descriptor.disabledReasonCode
  );
}

export function BookingCommandPanel({
  booking,
  actions,
}: {
  booking: BookingRecord;
  actions: ResourceActionDescriptor[];
}) {
  const router = useRouter();
  const pathname = usePathname();
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

  const updateAction = findBookingAction(actions, "update");
  const cancelAction = findBookingAction(actions, "cancel");
  const resubmitAction = findBookingAction(actions, "resubmit_approval");

  const canUpdate = updateAction?.enabled ?? false;
  const canCancel = cancelAction?.enabled ?? false;
  const canResubmit = resubmitAction?.enabled ?? false;
  const cancelRequiresReason = cancelAction?.requiresReason ?? true;

  // Q-TEN04 — represent the synchronous-command "accepted, awaiting external
  // confirmation" moment by navigating to the accepted+pending banner state.
  function enterAcceptedPending() {
    const commandId = `cmd_${Date.now().toString(36)}`;
    router.replace(`${pathname}?command=accepted&commandId=${commandId}`);
    router.refresh();
  }

  function buildUpdatePayload(): UpdateTenantBookingCommand {
    return {
      pickup: { ...booking.pickup, address: pickupAddress },
      dropoff: { ...booking.dropoff, address: dropoffAddress },
      notes: notes.trim() ? notes.trim() : null,
      costCenter: costCenter.trim() ? costCenter.trim() : null,
      vehiclePreference: vehiclePreference.trim()
        ? vehiclePreference.trim()
        : null,
    };
  }

  async function submitUpdate() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/bookings/${booking.bookingId}/update`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildUpdatePayload()),
        },
      );
      if (!response.ok) {
        throw new Error(await response.text());
      }

      setMode(null);
      enterAcceptedPending();
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

  async function submitResubmitApproval() {
    setLoading(true);
    setError(null);
    try {
      // Re-issue the update command with current values to re-run the tenant
      // policy / approval gates (Q-TEN12). No field change required.
      const response = await fetch(
        `/api/bookings/${booking.bookingId}/update`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildUpdatePayload()),
        },
      );
      if (!response.ok) {
        throw new Error(await response.text());
      }
      enterAcceptedPending();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unknown resubmit failure.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function submitCancel() {
    if (cancelRequiresReason && cancelReason.trim().length === 0) {
      setError("Cancellation requires a reason.");
      return;
    }
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
      enterAcceptedPending();
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

  const updateReason = disabledReasonCopy(updateAction);
  const cancelReasonNote = disabledReasonCopy(cancelAction);

  return (
    <div className="action-panel">
      <div className="action-stack">
        <div className="action-copy">
          <strong>Allowed tenant actions</strong>
          <p>
            CTAs render from this booking&apos;s <code>availableActions</code>{" "}
            (Q-X13) — never hard-coded by role. Tenant users cannot override
            dispatch state, fare authority, or fulfillment ownership.
          </p>
        </div>
        <div className="action-row">
          <button
            className="action-button action-button-secondary"
            disabled={!canUpdate}
            type="button"
            title={updateReason ?? undefined}
            onClick={() => {
              setError(null);
              setMode("update");
            }}
          >
            Update booking
          </button>
          <button
            className="action-button action-button-danger"
            disabled={!canCancel}
            type="button"
            title={cancelReasonNote ?? undefined}
            onClick={() => {
              setError(null);
              setMode("cancel");
            }}
          >
            Cancel booking
          </button>
          {resubmitAction ? (
            <button
              className="action-button action-button-secondary"
              disabled={!canResubmit || loading}
              type="button"
              title={disabledReasonCopy(resubmitAction) ?? undefined}
              onClick={() => void submitResubmitApproval()}
            >
              {loading ? "Resubmitting..." : "Resubmit approval"}
            </button>
          ) : null}
        </div>
        {updateReason ? <p className="action-note">{updateReason}</p> : null}
        {cancelReasonNote ? (
          <p className="action-note">{cancelReasonNote}</p>
        ) : null}
        {error && !mode ? <p className="action-note">{error}</p> : null}
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
                    Cancellation reason
                    {cancelRequiresReason ? " (required)" : ""}
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
                      (cancelRequiresReason && cancelReason.trim().length === 0)
                    }
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
