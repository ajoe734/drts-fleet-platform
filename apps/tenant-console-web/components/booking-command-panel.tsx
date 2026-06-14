"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ActionReceipt,
  BookingRecord,
  ResourceActionDescriptor,
  UpdateTenantBookingCommand,
} from "@drts/contracts";
import { isFutureIso } from "@/lib/formatters";
import { useTranslation } from "@/lib/i18n";
import type { Locale } from "@/lib/translations";

type Mode = "update" | "cancel" | null;

type BookingCommandPanelProps = {
  booking: BookingRecord & { editableUntil?: string | null };
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

function describeReason(
  reasonCode: string | null | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  switch (reasonCode) {
    case "past_editable_until":
      return t("bookingCommand.reason.pastEditableUntil");
    case "past_cancelable_until":
      return t("bookingCommand.reason.pastCancelableUntil");
    case "booking_terminal":
      return t("bookingCommand.reason.bookingTerminal");
    case "on_trip_locked":
      return t("bookingCommand.reason.onTripLocked");
    case "approval_pending":
      return t("bookingCommand.reason.approvalPending");
    case "approval_not_retryable":
      return t("bookingCommand.reason.approvalNotRetryable");
    default:
      return reasonCode
        ? t("bookingCommand.reason.backend", { code: reasonCode })
        : null;
  }
}

function formatPanelDateTime(value: string | null | undefined, locale: Locale) {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatPanelRelativeTime(
  value: string | null | undefined,
  locale: Locale,
) {
  if (!value) {
    return null;
  }

  const diffMs = new Date(value).getTime() - Date.now();
  if (Number.isNaN(diffMs)) {
    return null;
  }

  const formatter = new Intl.RelativeTimeFormat(
    locale === "zh" ? "zh-TW" : "en-US",
    { numeric: "auto" },
  );
  const diffMinutes = Math.round(diffMs / 60000);
  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 48) {
    return formatter.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  return formatter.format(diffDays, "day");
}

function isActionReceipt(value: unknown): value is ActionReceipt {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ActionReceipt>;
  return (
    typeof candidate.actionId === "string" &&
    typeof candidate.auditId === "string" &&
    typeof candidate.resourceId === "string" &&
    typeof candidate.resourceType === "string" &&
    typeof candidate.message === "string" &&
    (candidate.status === "accepted" ||
      candidate.status === "completed" ||
      candidate.status === "failed")
  );
}

export function BookingCommandPanel({
  booking,
  actions,
  readOnlyReasonCode,
  auditHref = "/audit",
  approvalHref = "/rules",
}: BookingCommandPanelProps) {
  const router = useRouter();
  const { locale, t } = useTranslation();
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
    const approvalPending = booking.approvalState === "pending";
    const withinUpdateWindow =
      booking.editableUntil == null || isFutureIso(booking.editableUntil);
    const withinCancelWindow =
      booking.cancelableUntil == null || isFutureIso(booking.cancelableUntil);

    return [
      {
        action: "update",
        enabled:
          !isTerminal && !isOnTrip && !approvalPending && withinUpdateWindow,
        riskLevel: "medium",
        ...(() => {
          const disabledReasonCode = isTerminal
            ? "booking_terminal"
            : isOnTrip
              ? "on_trip_locked"
              : approvalPending
                ? "approval_pending"
                : withinUpdateWindow
                  ? undefined
                  : "past_editable_until";
          return disabledReasonCode ? { disabledReasonCode } : {};
        })(),
      },
      {
        action: "cancel",
        enabled: !isTerminal && withinCancelWindow,
        requiresReason: true,
        riskLevel: "high",
        ...(() => {
          const disabledReasonCode = isTerminal
            ? "booking_terminal"
            : withinCancelWindow
              ? undefined
              : "past_cancelable_until";
          return disabledReasonCode ? { disabledReasonCode } : {};
        })(),
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
      ? describeReason(updateAction.disabledReasonCode, t)
      : null,
    cancelAction?.disabledReasonCode
      ? describeReason(cancelAction.disabledReasonCode, t)
      : null,
    readOnlyReasonCode ? describeReason(readOnlyReasonCode, t) : null,
  ].filter(
    (value, index, list): value is string =>
      Boolean(value) && list.indexOf(value) === index,
  );

  function buildReceiptHref(receipt: ActionReceipt) {
    const params = new URLSearchParams({
      auditId: receipt.auditId,
      commandId: receipt.actionId,
      commandMessage: receipt.message,
      commandStatus: receipt.status,
    });

    return `/bookings/${booking.bookingId}?${params.toString()}`;
  }

  async function submitUpdate() {
    setLoading(true);
    setError(null);
    try {
      const commandPayload: UpdateTenantBookingCommand = {
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
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(commandPayload),
        },
      );
      const payload = (await response.json()) as unknown;
      if (!response.ok) {
        throw new Error(
          typeof payload === "object" &&
            payload &&
            "error" in payload &&
            typeof payload.error === "string"
            ? payload.error
            : t("bookingCommand.error.unknownUpdate"),
        );
      }

      setMode(null);
      if (isActionReceipt(payload)) {
        setReceipt(
          `${payload.status} · ${payload.actionId} · ${payload.message}`,
        );
        if (payload.status === "accepted") {
          router.push(buildReceiptHref(payload));
          return;
        }
      } else {
        setReceipt(
          t("bookingCommand.receipt.updateCompleted", {
            time: new Date().toLocaleTimeString(
              locale === "zh" ? "zh-TW" : "en-US",
            ),
          }),
        );
      }
      router.refresh();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : t("bookingCommand.error.unknownUpdate"),
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
      const payload = (await response.json()) as unknown;
      if (!response.ok) {
        throw new Error(
          typeof payload === "object" &&
            payload &&
            "error" in payload &&
            typeof payload.error === "string"
            ? payload.error
            : t("bookingCommand.error.unknownCancel"),
        );
      }

      setMode(null);
      if (isActionReceipt(payload)) {
        setReceipt(
          `${payload.status} · ${payload.actionId} · ${payload.message}`,
        );
        if (payload.status === "accepted") {
          router.push(buildReceiptHref(payload));
          return;
        }
      } else {
        setReceipt(
          t("bookingCommand.receipt.cancelCompleted", {
            time: new Date().toLocaleTimeString(
              locale === "zh" ? "zh-TW" : "en-US",
            ),
          }),
        );
      }
      router.refresh();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : t("bookingCommand.error.unknownCancel"),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="action-panel">
      <div className="action-stack">
        <div className="action-copy">
          <strong>{t("bookingCommand.panel.title")}</strong>
          <p>{t("bookingCommand.panel.description")}</p>
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
              {t("bookingCommand.action.update")}
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
              {t("bookingCommand.action.cancel")}
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
              {t("bookingCommand.action.resubmitApproval")}
            </Link>
          ) : null}
          <Link
            className="action-button action-button-secondary"
            href={auditHref}
          >
            {t("bookingCommand.action.viewAudit")}
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
            {t("bookingCommand.note.editableUntil", {
              value: formatPanelDateTime(
                booking.editableUntil ?? booking.modifiableUntil,
                locale,
              ),
              relative: formatPanelRelativeTime(
                booking.editableUntil ?? booking.modifiableUntil,
                locale,
              )
                ? ` (${formatPanelRelativeTime(
                    booking.editableUntil ?? booking.modifiableUntil,
                    locale,
                  )})`
                : "",
            })}
          </p>
        ) : null}
        {cancelAction?.disabledReasonCode === "past_cancelable_until" ? (
          <p className="action-note">
            {t("bookingCommand.note.cancelableUntil", {
              value: formatPanelDateTime(booking.cancelableUntil, locale),
            })}
          </p>
        ) : null}
      </div>

      {mode ? (
        <div className="modal-overlay" role="presentation">
          <div
            aria-modal="true"
            className="modal-panel"
            role="dialog"
            aria-label={
              mode === "update"
                ? t("bookingCommand.action.update")
                : t("bookingCommand.action.cancel")
            }
          >
            <div className="modal-header">
              <div>
                <strong>
                  {mode === "update"
                    ? t("bookingCommand.action.update")
                    : t("bookingCommand.action.cancel")}
                </strong>
                <p>{booking.bookingId}</p>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setMode(null)}
              >
                {t("bookingCommand.modal.close")}
              </button>
            </div>

            {error ? <div className="form-error">{error}</div> : null}

            {mode === "update" ? (
              <div className="form-stack">
                <label className="field-stack">
                  <span>{t("bookingCommand.field.pickupAddress")}</span>
                  <input
                    value={pickupAddress}
                    onChange={(event) => setPickupAddress(event.target.value)}
                    type="text"
                  />
                </label>
                <label className="field-stack">
                  <span>{t("bookingCommand.field.dropoffAddress")}</span>
                  <input
                    value={dropoffAddress}
                    onChange={(event) => setDropoffAddress(event.target.value)}
                    type="text"
                  />
                </label>
                <label className="field-stack">
                  <span>{t("bookingCommand.field.notes")}</span>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </label>
                <div className="form-grid">
                  <label className="field-stack">
                    <span>{t("bookingCommand.field.costCenter")}</span>
                    <input
                      value={costCenter}
                      onChange={(event) => setCostCenter(event.target.value)}
                      type="text"
                    />
                  </label>
                  <label className="field-stack">
                    <span>{t("bookingCommand.field.vehiclePreference")}</span>
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
                    {loading
                      ? t("bookingCommand.submit.saving")
                      : t("bookingCommand.submit.save")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="form-stack">
                <label className="field-stack">
                  <span>{t("bookingCommand.field.cancelReason")}</span>
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
                    {loading
                      ? t("bookingCommand.submit.cancelling")
                      : t("bookingCommand.submit.confirmCancel")}
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
