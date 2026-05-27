"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ActionReceipt,
  BookingRecord,
  ResourceActionDescriptor,
  UpdateTenantBookingCommand,
} from "@drts/contracts";
import { formatDateTime } from "@/lib/formatters";

type Mode = "update" | "cancel" | null;

type BookingCommandPanelProps = {
  availableActions: ResourceActionDescriptor[];
  booking: BookingRecord;
  editableUntil: string | null;
  readOnlyReasonCode: string | null;
};

type CommandResponseEnvelope = {
  bookingId?: string;
  error?: string;
  ok?: boolean;
  result?: unknown;
};

function getActionLabel(action: string) {
  switch (action) {
    case "update":
      return "Update booking";
    case "cancel":
      return "Cancel booking";
    case "resubmit_approval":
      return "Resubmit approval";
    default:
      return action.replaceAll("_", " ");
  }
}

function getActionSupportCopy(action: string) {
  switch (action) {
    case "update":
      return "Medium-risk update command against the tenant booking record.";
    case "cancel":
      return "High-risk command. A reason is required whenever cancellation is available.";
    case "resubmit_approval":
      return "Re-open the approval path when the backend republishes this action for the booking.";
    default:
      return "Additional action published by the backend descriptor set for this booking.";
  }
}

function getDisabledReasonText(
  code: string | null | undefined,
  editableUntil: string | null,
) {
  switch (code) {
    case "past_editable_until":
      return editableUntil
        ? `Edit window closed at ${formatDateTime(editableUntil)}.`
        : "Edit window has already closed.";
    case "past_cancelable_until":
      return "Cancellation window has already closed.";
    case "terminal_order":
      return "Completed and cancelled bookings cannot be changed here.";
    case "in_fulfillment":
      return "Dispatch execution is active, so tenant edits are locked.";
    default:
      return code ? code.replaceAll("_", " ") : null;
  }
}

function buildFallbackReceipt(
  action: string,
  bookingId: string,
  status: ActionReceipt["status"] = "completed",
): ActionReceipt {
  return {
    actionId: `${action}-${bookingId}`,
    auditId: `${action}-audit-${bookingId}`,
    resourceType: "booking",
    resourceId: bookingId,
    status,
    message:
      status === "accepted"
        ? `${getActionLabel(action)} accepted and is waiting on external confirmation.`
        : `${getActionLabel(action)} completed.`,
  };
}

function parseActionReceipt(
  payload: unknown,
  action: string,
  bookingId: string,
): ActionReceipt {
  if (
    payload &&
    typeof payload === "object" &&
    "status" in payload &&
    "message" in payload &&
    "resourceId" in payload &&
    "resourceType" in payload &&
    "actionId" in payload &&
    "auditId" in payload
  ) {
    return payload as ActionReceipt;
  }

  return buildFallbackReceipt(action, bookingId);
}

export function BookingCommandPanel({
  availableActions,
  booking,
  editableUntil,
  readOnlyReasonCode,
}: BookingCommandPanelProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ActionReceipt | null>(null);
  const [pickupAddress, setPickupAddress] = useState(booking.pickup.address);
  const [dropoffAddress, setDropoffAddress] = useState(booking.dropoff.address);
  const [notes, setNotes] = useState(booking.notes ?? "");
  const [costCenter, setCostCenter] = useState(booking.costCenter ?? "");
  const [vehiclePreference, setVehiclePreference] = useState(
    booking.vehiclePreference ?? "",
  );
  const [cancelReason, setCancelReason] = useState("");

  const updateAction =
    availableActions.find((item) => item.action === "update") ?? null;
  const cancelAction =
    availableActions.find((item) => item.action === "cancel") ?? null;
  const additionalActions = availableActions.filter(
    (item) => item.action !== "update" && item.action !== "cancel",
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
      const result = (await response.json()) as CommandResponseEnvelope;
      if (!response.ok) {
        throw new Error(result.error ?? "Unknown update failure.");
      }

      setReceipt(
        parseActionReceipt(result.result, "update", booking.bookingId),
      );
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
      const result = (await response.json()) as CommandResponseEnvelope;
      if (!response.ok) {
        throw new Error(result.error ?? "Unknown cancel failure.");
      }

      setReceipt(
        parseActionReceipt(result.result, "cancel", booking.bookingId),
      );
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
    <div className="booking-command-stack">
      <div className="action-copy">
        <strong>Command pattern</strong>
        <p>
          Booking detail honors backend-provided action descriptors. Disabled
          affordances remain visible with reasons; tenant role alone does not
          decide CTA visibility.
        </p>
      </div>

      {receipt ? (
        <div
          className={`booking-command-receipt booking-command-receipt-${receipt.status}`}
        >
          <div className="booking-command-receipt-header">
            <strong>
              {receipt.status === "accepted"
                ? "Command accepted + pending"
                : "Command completed"}
            </strong>
            <span>{receipt.actionId}</span>
          </div>
          <p>{receipt.message}</p>
          {receipt.status === "accepted" ? (
            <p>
              The command reached the backend, but the tenant snapshot is still
              waiting on downstream confirmation before the lifecycle settles.
            </p>
          ) : null}
          <div className="booking-command-receipt-links">
            <Link
              className="text-link"
              href={`/audit?resourceId=${booking.orderId}`}
            >
              View audit trail
            </Link>
          </div>
        </div>
      ) : null}

      <div className="booking-action-group">
        {updateAction ? (
          <div className="booking-action-card">
            <div className="booking-action-card-copy">
              <strong>{getActionLabel(updateAction.action)}</strong>
              <p>{getActionSupportCopy(updateAction.action)}</p>
            </div>
            <button
              className="action-button action-button-secondary"
              disabled={!updateAction.enabled}
              type="button"
              onClick={() => {
                setError(null);
                setMode("update");
              }}
            >
              {getActionLabel(updateAction.action)}
            </button>
            {!updateAction.enabled ? (
              <p className="action-note">
                {getDisabledReasonText(
                  updateAction.disabledReasonCode ?? readOnlyReasonCode,
                  editableUntil,
                )}
              </p>
            ) : editableUntil ? (
              <p className="action-note">
                Editable until {formatDateTime(editableUntil)}.
              </p>
            ) : null}
          </div>
        ) : null}

        {cancelAction ? (
          <div className="booking-action-card">
            <div className="booking-action-card-copy">
              <strong>{getActionLabel(cancelAction.action)}</strong>
              <p>{getActionSupportCopy(cancelAction.action)}</p>
            </div>
            <button
              className="action-button action-button-danger"
              disabled={!cancelAction.enabled}
              type="button"
              onClick={() => {
                setError(null);
                setMode("cancel");
              }}
            >
              {getActionLabel(cancelAction.action)}
            </button>
            {!cancelAction.enabled ? (
              <p className="action-note">
                {getDisabledReasonText(
                  cancelAction.disabledReasonCode ?? readOnlyReasonCode,
                  editableUntil,
                )}
              </p>
            ) : null}
          </div>
        ) : null}

        {additionalActions.map((action) => (
          <div className="booking-action-card" key={action.action}>
            <div className="booking-action-card-copy">
              <strong>{getActionLabel(action.action)}</strong>
              <p>{getActionSupportCopy(action.action)}</p>
            </div>
            {action.action === "resubmit_approval" ? (
              <Link
                className="action-button action-button-secondary"
                href="/rules"
              >
                Review approval rules
              </Link>
            ) : (
              <button
                className="action-button action-button-secondary"
                disabled
                type="button"
              >
                {getActionLabel(action.action)}
              </button>
            )}
            <p className="action-note">
              {action.enabled
                ? action.action === "resubmit_approval"
                  ? booking.approvalRequestIds.length > 0
                    ? `Published request ids: ${booking.approvalRequestIds.join(", ")}.`
                    : "Approval is waiting on a republished request identifier."
                  : "This route surfaces the published descriptor but does not yet invoke the command directly."
                : getDisabledReasonText(
                    action.disabledReasonCode ?? readOnlyReasonCode,
                    editableUntil,
                  )}
            </p>
          </div>
        ))}
      </div>

      {error ? <div className="form-error">{error}</div> : null}

      {mode ? (
        <div className="modal-overlay" role="presentation">
          <div
            aria-label={mode === "update" ? "Update booking" : "Cancel booking"}
            aria-modal="true"
            className="modal-panel"
            role="dialog"
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
                    {loading ? "Saving..." : "Submit update"}
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
                    disabled={loading || cancelReason.trim().length === 0}
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
