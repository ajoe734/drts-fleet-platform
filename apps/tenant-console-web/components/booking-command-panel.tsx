"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  BookingRecord,
  ResourceActionDescriptor,
  UpdateTenantBookingCommand,
} from "@drts/contracts";
import { formatDateTime, isFutureIso } from "@/lib/formatters";

type Mode = "update" | "cancel" | null;

type BookingCommandPanelProps = {
  booking: BookingRecord;
  actions?: ResourceActionDescriptor[];
  readOnlyReasonCode?: string | null;
  auditHref?: string;
  approvalHref?: string;
};

function getActionDescriptor(
  actions: ResourceActionDescriptor[],
  action: string,
): ResourceActionDescriptor | null {
  return actions.find((descriptor) => descriptor.action === action) ?? null;
}

function describeReason(reasonCode: string | null | undefined) {
  switch (reasonCode) {
    case "past_editable_until":
      return "The tenant edit window has already closed.";
    case "past_cancelable_until":
      return "The tenant cancellation window has already closed.";
    case "booking_terminal":
      return "Completed or cancelled bookings are read-only.";
    case "on_trip_locked":
      return "On-trip bookings cannot be changed from tenant control.";
    case "approval_pending":
      return "The booking is waiting on approval resolution before it can change again.";
    case "approval_not_retryable":
      return "There is no approval workflow step that can be retried from this detail page.";
    default:
      return reasonCode ? `Backend reason: ${reasonCode}` : null;
  }
}

export function BookingCommandPanel({
  booking,
  actions,
  readOnlyReasonCode,
  auditHref = "/audit",
  approvalHref = "/rules",
}: BookingCommandPanelProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [pickupAddress, setPickupAddress] = useState(booking.pickup.address);
  const [dropoffAddress, setDropoffAddress] = useState(booking.dropoff.address);
  const [notes, setNotes] = useState(booking.notes ?? "");
  const [costCenter, setCostCenter] = useState(booking.costCenter ?? "");
  const [vehiclePreference, setVehiclePreference] = useState(
    booking.vehiclePreference ?? "",
  );
  const [cancelReason, setCancelReason] = useState("");

  const fallbackActions = useMemo<ResourceActionDescriptor[]>(() => {
    const isTerminal =
      booking.orderStatus === "completed" ||
      booking.orderStatus === "cancelled";
    const isOnTrip = booking.orderStatus === "on_trip";
    const withinUpdateWindow =
      booking.modifiableUntil == null || isFutureIso(booking.modifiableUntil);
    const withinCancelWindow =
      booking.cancelableUntil == null || isFutureIso(booking.cancelableUntil);

    return [
      {
        action: "update",
        enabled: !isTerminal && !isOnTrip && withinUpdateWindow,
        disabledReasonCode: isTerminal
          ? "booking_terminal"
          : isOnTrip
            ? "on_trip_locked"
            : withinUpdateWindow
              ? undefined
              : "past_editable_until",
        riskLevel: "medium",
      },
      {
        action: "cancel",
        enabled: !isTerminal && withinCancelWindow,
        disabledReasonCode: isTerminal
          ? "booking_terminal"
          : withinCancelWindow
            ? undefined
            : "past_cancelable_until",
        requiresReason: true,
        riskLevel: "high",
      },
    ];
  }, [booking]);
  const effectiveActions =
    actions && actions.length > 0 ? actions : fallbackActions;
  const updateAction = getActionDescriptor(effectiveActions, "update");
  const cancelAction = getActionDescriptor(effectiveActions, "cancel");
  const resubmitAction = getActionDescriptor(
    effectiveActions,
    "resubmit_approval",
  );
  const notesList = [
    updateAction?.disabledReasonCode
      ? describeReason(updateAction.disabledReasonCode)
      : null,
    cancelAction?.disabledReasonCode
      ? describeReason(cancelAction.disabledReasonCode)
      : null,
    readOnlyReasonCode ? describeReason(readOnlyReasonCode) : null,
  ].filter(
    (value, index, list): value is string =>
      Boolean(value) && list.indexOf(value) === index,
  );

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
      setReceipt(
        `Update accepted at ${new Date().toLocaleTimeString()} · audit visible from the tenant audit lane.`,
      );
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
      setReceipt(
        `Cancellation accepted at ${new Date().toLocaleTimeString()} · audit visible from the tenant audit lane.`,
      );
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
            Every CTA on this panel is driven by the booking action descriptors.
            Disabled actions stay visible with a reason instead of disappearing.
          </p>
        </div>
        <div className="action-row">
          {updateAction ? (
            <button
              className="action-button action-button-secondary"
              disabled={!updateAction.enabled}
              type="button"
              onClick={() => {
                setError(null);
                setReceipt(null);
                setMode("update");
              }}
            >
              Update booking
            </button>
          ) : null}
          {cancelAction ? (
            <button
              className="action-button action-button-danger"
              disabled={!cancelAction.enabled}
              type="button"
              onClick={() => {
                setError(null);
                setReceipt(null);
                setMode("cancel");
              }}
            >
              Cancel booking
            </button>
          ) : null}
          {resubmitAction ? (
            <Link
              className={`action-button action-button-secondary${!resubmitAction.enabled ? " is-disabled-link" : ""}`}
              href={approvalHref}
              aria-disabled={!resubmitAction.enabled}
              onClick={(event) => {
                if (!resubmitAction.enabled) {
                  event.preventDefault();
                }
              }}
            >
              Resubmit approval
            </Link>
          ) : null}
          <Link
            className="action-button action-button-secondary"
            href={auditHref}
          >
            View audit
          </Link>
        </div>
        {receipt ? <div className="booking-receipt">{receipt}</div> : null}
        {notesList.length > 0 ? (
          <div className="booking-action-notes">
            {notesList.map((note) => (
              <p className="action-note" key={note}>
                {note}
              </p>
            ))}
          </div>
        ) : null}
        {updateAction?.disabledReasonCode === "past_editable_until" ? (
          <p className="action-note">
            Editable until {formatDateTime(booking.modifiableUntil)}.
          </p>
        ) : null}
        {cancelAction?.disabledReasonCode === "past_cancelable_until" ? (
          <p className="action-note">
            Cancelable until {formatDateTime(booking.cancelableUntil)}.
          </p>
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
