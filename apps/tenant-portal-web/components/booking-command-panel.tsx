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
import { formatPortalUiError, toPortalErrorMessage } from "@/lib/error-copy";

type Mode = "update" | "cancel" | null;

export function BookingCommandPanel({
  booking,
  allowMutations,
}: {
  booking: BookingRecord;
  allowMutations: boolean;
}) {
  const router = useRouter();
  const baseCapabilities = getBookingActionCapabilities(booking);
  const capabilities = {
    canUpdate: allowMutations && baseCapabilities.canUpdate,
    canCancel: allowMutations && baseCapabilities.canCancel,
    updateReason: allowMutations
      ? baseCapabilities.updateReason
      : "目前角色無法修改訂單。",
    cancelReason: allowMutations
      ? baseCapabilities.cancelReason
      : "目前角色無法取消訂單。",
  };
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
        formatPortalUiError(
          toPortalErrorMessage(submitError, "未知的更新失敗。"),
          "無法更新訂單",
        ),
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
        formatPortalUiError(
          toPortalErrorMessage(submitError, "未知的取消失敗。"),
          "無法取消訂單",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="booking-action-panel">
      <div className="booking-action-stack">
        <div>
          <strong>租戶可用操作</strong>
          <p className="muted-copy">
            租戶使用者只能執行支援的訂單指令。司機指派、派遣覆寫、人工車資
            覆寫與外部結算操作仍屬於營運控制台權限路徑，不會出現在這裡。
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
            修改訂單
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
            取消訂單
          </button>
        </div>

        {capabilities.updateReason ? (
          <p className="booking-action-note">
            無法修改：{capabilities.updateReason}
            {booking.modifiableUntil
              ? `（截止 ${formatDateTime(booking.modifiableUntil)}）`
              : ""}
          </p>
        ) : null}
        {capabilities.cancelReason ? (
          <p className="booking-action-note">
            無法取消：{capabilities.cancelReason}
            {booking.cancelableUntil
              ? `（截止 ${formatDateTime(booking.cancelableUntil)}）`
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
            aria-label={mode === "update" ? "修改訂單" : "取消訂單"}
          >
            <div className="booking-modal-header">
              <div>
                <strong>{mode === "update" ? "修改訂單" : "取消訂單"}</strong>
                <p className="muted-copy">{booking.bookingId}</p>
              </div>
              <button
                className="booking-modal-close"
                onClick={() => setMode(null)}
                type="button"
              >
                關閉
              </button>
            </div>

            {error ? <div className="error-banner">{error}</div> : null}

            {mode === "update" ? (
              <div className="booking-form-stack">
                <label className="booking-field">
                  <span>上車地址</span>
                  <input
                    onChange={(event) => setPickupAddress(event.target.value)}
                    type="text"
                    value={pickupAddress}
                  />
                </label>
                <label className="booking-field">
                  <span>下車地址</span>
                  <input
                    onChange={(event) => setDropoffAddress(event.target.value)}
                    type="text"
                    value={dropoffAddress}
                  />
                </label>
                <label className="booking-field">
                  <span>備註</span>
                  <textarea
                    onChange={(event) => setNotes(event.target.value)}
                    rows={3}
                    value={notes}
                  />
                </label>
                <label className="booking-field">
                  <span>成本中心</span>
                  <input
                    onChange={(event) => setCostCenter(event.target.value)}
                    type="text"
                    value={costCenter}
                  />
                </label>
                <label className="booking-field">
                  <span>車型偏好</span>
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
                    {loading ? "儲存中..." : "儲存變更"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="booking-form-stack">
                <label className="booking-field">
                  <span>取消原因（選填）</span>
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
                    {loading ? "取消中..." : "確認取消"}
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
