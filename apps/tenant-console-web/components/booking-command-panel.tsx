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
import {
  formatDateTime,
  formatRelativeTime,
  isFutureIso,
} from "@/lib/formatters";
import { formatTenantUiError } from "@/lib/error-copy";
import { formatTenantCodeLabel } from "@/lib/localized-labels";

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

function describeReason(reasonCode: string | null | undefined) {
  switch (reasonCode) {
    case "past_editable_until":
      return "租戶可編輯時窗已結束。";
    case "past_cancelable_until":
      return "租戶可取消時窗已結束。";
    case "booking_terminal":
      return "已完成或已取消的叫車單為唯讀。";
    case "on_trip_locked":
      return "行程進行中的叫車單不能由租戶端修改。";
    case "approval_pending":
      return "這筆叫車單仍在等待審批，暫時不能再次修改。";
    case "approval_not_retryable":
      return "這個明細頁目前沒有可重新送審的流程節點。";
    default:
      return reasonCode
        ? `後端原因：${formatTenantCodeLabel(reasonCode, reasonCode)}`
        : null;
  }
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

function resolveReceiptMessage(receipt: ActionReceipt): string {
  const message = receipt.message.trim();
  if (
    /[\u3400-\u9fff]/.test(message) &&
    !/permission|forbidden|unauthor|external|upstream|dependency|gateway|timeout|network|adapter|error|exception|status|http/i.test(
      message,
    )
  ) {
    return message;
  }

  switch (receipt.status) {
    case "accepted":
      return "租戶指令已受理，正在等待外部系統確認。";
    case "completed":
      return "租戶指令已完成，請至明細與稽核軌跡確認最新結果。";
    case "failed":
      return "租戶指令未完成，請稍後重試或查看稽核紀錄。";
    default:
      return "租戶指令狀態已更新。";
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

  function buildReceiptHref(receipt: ActionReceipt) {
    const message = resolveReceiptMessage(receipt);
    const params = new URLSearchParams({
      auditId: receipt.auditId,
      commandId: receipt.actionId,
      commandMessage: message,
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
            : "後端未回傳更新失敗原因。",
        );
      }

      setMode(null);
      if (isActionReceipt(payload)) {
        const message = resolveReceiptMessage(payload);
        setReceipt(
          `${formatTenantCodeLabel(payload.status)} · ${payload.actionId} · ${message}`,
        );
        if (payload.status === "accepted") {
          router.push(
            buildReceiptHref({
              ...payload,
              message,
            }),
          );
          return;
        }
      } else {
        setReceipt(
          `更新已完成，時間 ${new Date().toLocaleTimeString("zh-TW")} · 可至租戶稽核軌跡查看紀錄。`,
        );
      }
      router.refresh();
    } catch (submissionError) {
      setError(
        formatTenantUiError(
          submissionError instanceof Error
            ? submissionError.message
            : "更新失敗，原因未知。",
          "更新叫車失敗",
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
            : "後端未回傳取消失敗原因。",
        );
      }

      setMode(null);
      if (isActionReceipt(payload)) {
        const message = resolveReceiptMessage(payload);
        setReceipt(
          `${formatTenantCodeLabel(payload.status)} · ${payload.actionId} · ${message}`,
        );
        if (payload.status === "accepted") {
          router.push(
            buildReceiptHref({
              ...payload,
              message,
            }),
          );
          return;
        }
      } else {
        setReceipt(
          `取消已完成，時間 ${new Date().toLocaleTimeString("zh-TW")} · 可至租戶稽核軌跡查看紀錄。`,
        );
      }
      router.refresh();
    } catch (submissionError) {
      setError(
        formatTenantUiError(
          submissionError instanceof Error
            ? submissionError.message
            : "取消失敗，原因未知。",
          "取消叫車失敗",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="action-panel">
      <div className="action-stack">
        <div className="action-copy">
          <strong>租戶可執行動作</strong>
          <p>
            這個面板上的所有操作都由叫車單的動作描述驅動。即使動作被停用，也會保留在畫面上並附上原因，不會直接消失。
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
              編輯叫車
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
              取消叫車
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
              重新送審
            </Link>
          ) : null}
          <Link
            className="action-button action-button-secondary"
            href={auditHref}
          >
            查看稽核
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
            可編輯截止時間{" "}
            {formatDateTime(booking.editableUntil ?? booking.modifiableUntil)}
            {formatRelativeTime(
              booking.editableUntil ?? booking.modifiableUntil,
            )
              ? `（${formatRelativeTime(booking.editableUntil ?? booking.modifiableUntil)}）`
              : ""}
            。
          </p>
        ) : null}
        {cancelAction?.disabledReasonCode === "past_cancelable_until" ? (
          <p className="action-note">
            可取消截止時間 {formatDateTime(booking.cancelableUntil)}。
          </p>
        ) : null}
      </div>

      {mode ? (
        <div className="modal-overlay" role="presentation">
          <div
            aria-modal="true"
            className="modal-panel"
            role="dialog"
            aria-label={mode === "update" ? "編輯叫車" : "取消叫車"}
          >
            <div className="modal-header">
              <div>
                <strong>{mode === "update" ? "編輯叫車" : "取消叫車"}</strong>
                <p>{booking.bookingId}</p>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setMode(null)}
              >
                關閉
              </button>
            </div>

            {error ? <div className="form-error">{error}</div> : null}

            {mode === "update" ? (
              <div className="form-stack">
                <label className="field-stack">
                  <span>上車地址</span>
                  <input
                    value={pickupAddress}
                    onChange={(event) => setPickupAddress(event.target.value)}
                    type="text"
                  />
                </label>
                <label className="field-stack">
                  <span>下車地址</span>
                  <input
                    value={dropoffAddress}
                    onChange={(event) => setDropoffAddress(event.target.value)}
                    type="text"
                  />
                </label>
                <label className="field-stack">
                  <span>備註</span>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </label>
                <div className="form-grid">
                  <label className="field-stack">
                    <span>成本中心</span>
                    <input
                      value={costCenter}
                      onChange={(event) => setCostCenter(event.target.value)}
                      type="text"
                    />
                  </label>
                  <label className="field-stack">
                    <span>車型偏好</span>
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
                    {loading ? "儲存中..." : "儲存變更"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="form-stack">
                <label className="field-stack">
                  <span>取消原因</span>
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
