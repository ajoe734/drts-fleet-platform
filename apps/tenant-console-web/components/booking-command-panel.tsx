"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import type {
  BookingRecord,
  ResourceActionDescriptor,
  UpdateTenantBookingCommand,
} from "@drts/contracts";
import { CanvasBanner, CanvasBtn, CanvasField, buildCanvasTheme } from "@drts/ui-web";
import { formatDateTime } from "@/lib/formatters";

const th = buildCanvasTheme({ surface: "tenant", dark: true, density: "compact" });

type Mode = "update" | "cancel" | null;

type CommandReceiptState = {
  status: "accepted" | "completed";
  commandId: string | null;
  action: "update" | "cancel";
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const noteStyle: CSSProperties = {
  marginTop: 10,
  fontSize: 11.5,
  lineHeight: 1.5,
  color: th.textMuted,
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(2, 6, 12, 0.62)",
  display: "grid",
  placeItems: "center",
  padding: 24,
  zIndex: 60,
};

const modalPanelStyle: CSSProperties = {
  width: "min(520px, 100%)",
  background: th.bgRaised,
  border: `1px solid ${th.border}`,
  borderRadius: 12,
  padding: 18,
  display: "grid",
  gap: 14,
  boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
};

const modalHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};

const fieldStackStyle: CSSProperties = { display: "grid", gap: 12 };

const inputStyle: CSSProperties = {
  background: th.bgRaised,
  border: `1px solid ${th.border}`,
  borderRadius: 7,
  padding: "7px 10px",
  fontSize: 12.5,
  color: th.text,
  fontFamily: th.fontFamily,
  width: "100%",
  boxSizing: "border-box",
};

const monoInputStyle: CSSProperties = {
  ...inputStyle,
  fontFamily: th.monoFamily,
};

const errorStyle: CSSProperties = {
  fontSize: 12,
  color: th.danger,
  background: "rgba(220, 38, 38, 0.12)",
  border: `1px solid ${th.danger}`,
  borderRadius: 8,
  padding: "8px 10px",
};

function findDescriptor(
  actions: ResourceActionDescriptor[],
  predicate: (descriptor: ResourceActionDescriptor) => boolean,
): ResourceActionDescriptor | null {
  return actions.find(predicate) ?? null;
}

function disabledTitle(descriptor: ResourceActionDescriptor | null): string | undefined {
  if (!descriptor || descriptor.enabled) {
    return undefined;
  }
  return descriptor.disabledReasonCode ?? descriptor.action;
}

export function BookingCommandPanel({
  booking,
  actions,
  editableUntil,
  readOnlyReasonCode,
  externalFulfillment,
}: {
  booking: BookingRecord;
  actions: ResourceActionDescriptor[];
  editableUntil: string | null;
  readOnlyReasonCode: string | null;
  externalFulfillment: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<CommandReceiptState | null>(null);
  const [pickupAddress, setPickupAddress] = useState(booking.pickup.address);
  const [dropoffAddress, setDropoffAddress] = useState(booking.dropoff.address);
  const [notes, setNotes] = useState(booking.notes ?? "");
  const [costCenter, setCostCenter] = useState(booking.costCenter ?? "");
  const [vehiclePreference, setVehiclePreference] = useState(
    booking.vehiclePreference ?? "",
  );
  const [cancelReason, setCancelReason] = useState("");

  const updateDescriptor = useMemo(
    () => findDescriptor(actions, (descriptor) => descriptor.action === "update"),
    [actions],
  );
  const cancelDescriptor = useMemo(
    () => findDescriptor(actions, (descriptor) => descriptor.action === "cancel"),
    [actions],
  );
  const resubmitDescriptor = useMemo(
    () =>
      findDescriptor(actions, (descriptor) =>
        descriptor.action.includes("resubmit"),
      ),
    [actions],
  );

  function settle(action: "update" | "cancel", payload: unknown) {
    // Q-TEN04 — synchronous command pattern. The command is either applied
    // immediately, or accepted with an external dependency pending. We only
    // render the accepted+pending moment when the backend actually reports it
    // (or, as a graceful proxy, when fulfillment authority is external and the
    // backend cannot confirm inline). Never fabricate a commandId.
    const record =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : {};
    const nestedReceipt =
      record.receipt && typeof record.receipt === "object"
        ? (record.receipt as Record<string, unknown>)
        : record;
    const reportedStatus = nestedReceipt.status;
    const commandId =
      typeof nestedReceipt.commandId === "string"
        ? nestedReceipt.commandId
        : typeof record.commandId === "string"
          ? (record.commandId as string)
          : null;
    const accepted = reportedStatus === "accepted" || externalFulfillment;

    setMode(null);
    if (accepted) {
      setReceipt({ status: "accepted", commandId, action });
      // Surface the pending receipt briefly, then pull the refreshed snapshot.
      router.refresh();
    } else {
      setReceipt({ status: "completed", commandId, action });
      router.refresh();
    }
  }

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
      const response = await fetch(`/api/bookings/${booking.bookingId}/update`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        throw new Error(
          (data &&
          typeof data === "object" &&
          typeof (data as Record<string, unknown>).error === "string"
            ? ((data as Record<string, unknown>).error as string)
            : null) ?? "更新失敗",
        );
      }
      settle("update", data);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "未知的更新錯誤。",
      );
    } finally {
      setLoading(false);
    }
  }

  async function submitCancel() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/bookings/${booking.bookingId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: cancelReason.trim() ? cancelReason.trim() : undefined,
        }),
      });
      const data = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        throw new Error(
          (data &&
          typeof data === "object" &&
          typeof (data as Record<string, unknown>).error === "string"
            ? ((data as Record<string, unknown>).error as string)
            : null) ?? "取消失敗",
        );
      }
      settle("cancel", data);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "未知的取消錯誤。",
      );
    } finally {
      setLoading(false);
    }
  }

  const updateEnabled = Boolean(updateDescriptor?.enabled);
  const cancelEnabled = Boolean(cancelDescriptor?.enabled);
  const resubmitEnabled = Boolean(resubmitDescriptor?.enabled);

  return (
    <div>
      {receipt ? (
        <CanvasBanner
          theme={th}
          tone={receipt.status === "accepted" ? "warn" : "success"}
          icon={receipt.status === "accepted" ? "clock" : "check"}
          title={
            receipt.status === "accepted"
              ? "command 已受理 · 等候外部確認"
              : `${receipt.action === "cancel" ? "取消" : "更新"} command 已套用`
          }
          body={
            receipt.status === "accepted"
              ? `Q-TEN04 同步 command 模式：外部 dispatch 引擎正在確認，本頁將於下一次 ${"刷新"}帶回 confirmed 狀態。${
                  receipt.commandId ? ` · commandId ${receipt.commandId}` : ""
                }`
              : "tenant 端已收到結果並重新整理快照。"
          }
        />
      ) : null}

      <div style={actionRowStyle}>
        <span title={disabledTitle(updateDescriptor)}>
          <CanvasBtn
            theme={th}
            icon="more"
            disabled={!updateEnabled}
            onClick={() => {
              setError(null);
              setReceipt(null);
              setMode("update");
            }}
          >
            更新
          </CanvasBtn>
        </span>
        <span title={disabledTitle(cancelDescriptor)}>
          <CanvasBtn
            theme={th}
            icon="x"
            danger
            disabled={!cancelEnabled}
            onClick={() => {
              setError(null);
              setReceipt(null);
              setMode("cancel");
            }}
          >
            取消預約
          </CanvasBtn>
        </span>
        {resubmitDescriptor ? (
          <span title={disabledTitle(resubmitDescriptor)}>
            <CanvasBtn
              theme={th}
              icon="check"
              variant="secondary"
              disabled={!resubmitEnabled}
            >
              重送審批
            </CanvasBtn>
          </span>
        ) : null}
      </div>

      <p style={noteStyle}>
        CTA 由後端 <code>availableActions</code> 驅動（Q-X13），不由前端角色硬編。
        editableUntil：
        <strong>{editableUntil ? formatDateTime(editableUntil) : "已過時 · null"}</strong>
        {readOnlyReasonCode ? (
          <>
            {" "}
            · readOnlyReasonCode：<strong>{readOnlyReasonCode}</strong>
          </>
        ) : null}
      </p>

      {mode ? (
        <div style={modalOverlayStyle} role="presentation">
          <div
            aria-modal="true"
            role="dialog"
            aria-label={mode === "update" ? "更新預約" : "取消預約"}
            style={modalPanelStyle}
          >
            <div style={modalHeaderStyle}>
              <div>
                <strong style={{ color: th.text }}>
                  {mode === "update" ? "更新預約" : "取消預約"}
                </strong>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: th.textMuted }}>
                  {booking.bookingId} ·{" "}
                  {mode === "cancel"
                    ? "高風險 · 需填理由 (Q-X10)"
                    : "中風險 · 需確認 (Q-X09)"}
                </p>
              </div>
              <CanvasBtn
                theme={th}
                variant="ghost"
                icon="x"
                onClick={() => setMode(null)}
              >
                關閉
              </CanvasBtn>
            </div>

            {error ? <div style={errorStyle}>{error}</div> : null}

            {mode === "update" ? (
              <div style={fieldStackStyle}>
                <CanvasField theme={th} label="上車地點 · pickup">
                  <input
                    style={inputStyle}
                    value={pickupAddress}
                    onChange={(event) => setPickupAddress(event.target.value)}
                  />
                </CanvasField>
                <CanvasField theme={th} label="下車地點 · dropoff">
                  <input
                    style={inputStyle}
                    value={dropoffAddress}
                    onChange={(event) => setDropoffAddress(event.target.value)}
                  />
                </CanvasField>
                <CanvasField theme={th} label="備註 · note">
                  <textarea
                    rows={3}
                    style={{ ...inputStyle, resize: "vertical" }}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </CanvasField>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                  }}
                >
                  <CanvasField theme={th} label="成本中心 · cost center">
                    <input
                      style={monoInputStyle}
                      value={costCenter}
                      onChange={(event) => setCostCenter(event.target.value)}
                    />
                  </CanvasField>
                  <CanvasField theme={th} label="偏好車型 · vehicle">
                    <input
                      style={inputStyle}
                      value={vehiclePreference}
                      onChange={(event) =>
                        setVehiclePreference(event.target.value)
                      }
                    />
                  </CanvasField>
                </div>
                <div style={actionRowStyle}>
                  <CanvasBtn
                    theme={th}
                    variant="primary"
                    icon="check"
                    disabled={loading}
                    onClick={() => void submitUpdate()}
                  >
                    {loading ? "送出中…" : "送出 command"}
                  </CanvasBtn>
                </div>
              </div>
            ) : (
              <div style={fieldStackStyle}>
                <CanvasField theme={th} label="取消理由 · reason (必填)" required>
                  <textarea
                    rows={4}
                    style={{ ...inputStyle, resize: "vertical" }}
                    value={cancelReason}
                    onChange={(event) => setCancelReason(event.target.value)}
                  />
                </CanvasField>
                <div style={actionRowStyle}>
                  <CanvasBtn
                    theme={th}
                    danger
                    icon="x"
                    disabled={loading || cancelReason.trim().length === 0}
                    onClick={() => void submitCancel()}
                  >
                    {loading ? "取消中…" : "確認取消 command"}
                  </CanvasBtn>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
