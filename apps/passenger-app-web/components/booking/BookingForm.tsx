import React, { useState, useEffect } from "react";
import { P5Phone, P5Header, P5Card, P5Btn, P5Notice, P5 } from "../p5-ui";
import { AddressMapPicker, type AddressPayload, buildCanvasTheme } from "@drts/ui-web";
import { createPassengerGeoProvider } from "../../lib/booking/passenger-geo-provider";
import { bookingTranslations as t } from "../../lib/booking/translations";

import { REALM_COLORS } from "@drts/ui-tokens";

const baseTheme = buildCanvasTheme({ surface: "platform" });
const passengerTheme = {
  ...baseTheme,
  accent: REALM_COLORS.passenger.light.fg,
  accentHi: REALM_COLORS.passenger.light.headerBg,
  accentBg: REALM_COLORS.passenger.light.bg,
  surfaceName: "Passenger",
};

interface BookingFormProps {
  onQuoteReady: (data: {
    origin: AddressPayload;
    destination: AddressPayload;
    scheduledAt: string;
  }) => void;
  error?: string | null;
  onClearError?: () => void;
  minLeadTimeMinutes?: number;
  initialDraft?: {
    origin: AddressPayload | null;
    destination: AddressPayload | null;
    scheduledAt: string | null;
  };
}

const geoProvider = createPassengerGeoProvider();

export function BookingForm({
  onQuoteReady,
  error,
  onClearError,
  minLeadTimeMinutes,
  initialDraft,
}: BookingFormProps) {
  const [origin, setOrigin] = useState<AddressPayload | null>(
    initialDraft?.origin ?? null,
  );
  const [destination, setDestination] = useState<AddressPayload | null>(
    initialDraft?.destination ?? null,
  );
  const [scheduledAt, setScheduledAt] = useState<string>(() => {
    if (!initialDraft?.scheduledAt) return "";
    const d = new Date(initialDraft.scheduledAt);
    if (isNaN(d.getTime())) return "";
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  });
  const [minLocalTime, setMinLocalTime] = useState<string>("");

  const [pickerMode, setPickerMode] = useState<"origin" | "destination" | null>(
    null,
  );

  useEffect(() => {
    const d = new Date();
    if (d.getSeconds() > 0 || d.getMilliseconds() > 0) {
      d.setSeconds(0, 0);
      d.setMinutes(d.getMinutes() + 1);
    }
    d.setMinutes(d.getMinutes() + minLeadTimeMinutes);
    const tzOffset = d.getTimezoneOffset() * 60000;
    const localISOTime = new Date(d.getTime() - tzOffset)
      .toISOString()
      .slice(0, 16);
    if (!initialDraft?.scheduledAt) {
      setScheduledAt(localISOTime);
    }
    setMinLocalTime(localISOTime);
  }, [minLeadTimeMinutes, initialDraft?.scheduledAt]);

  if (pickerMode) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 100,
          background: P5.bg,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "14px",
            borderBottom: `1px solid ${P5.line}`,
            display: "flex",
            alignItems: "center",
          }}
        >
          <div
            onClick={() => setPickerMode(null)}
            style={{
              padding: "8px",
              cursor: "pointer",
              color: P5.brand,
              fontWeight: "bold",
            }}
          >
            {t.form.back}
          </div>
          <div style={{ flex: 1, textAlign: "center", fontWeight: "bold" }}>
            {pickerMode === "origin"
              ? t.form.selectOriginTitle
              : t.form.selectDestinationTitle}
          </div>
          <div style={{ width: 40 }} />
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "14px" }}>
          <AddressMapPicker
            provider={geoProvider}
            surface="passenger_entry"
            theme={passengerTheme}
            labels={{
              searchPlaceholder: "請輸入地址或地標",
              searchLabel: pickerMode === "origin" ? "上車地點" : "下車地點",
              searching: "搜尋中...",
              noMatchTitle: "找不到相符的地址",
              noMatchBody: "請嘗試使用不同的關鍵字",
              providerOutageTitle: "無法連線至地圖服務",
              providerOutageBody: "請稍後重試"
            }}
            value={pickerMode === "origin" ? origin : destination}
            onChange={(change) => {
              if (change.status === "selected" && change.address) {
                if (pickerMode === "origin") setOrigin(change.address);
                else setDestination(change.address);
                setPickerMode(null);
                onClearError?.();
              }
            }}
          />
        </div>
      </div>
    );
  }

  const isFormValid = origin && destination && scheduledAt;

  return (
    <P5Phone url="ride.smarttransport.tw/booking">
      <P5Header status="預約叫車" />
      <div style={{ flex: 1, padding: "14px" }}>
        {error && (
          <div
            style={{
              background: P5.dangerBg,
              color: P5.danger,
              padding: "10px",
              borderRadius: "8px",
              marginBottom: "14px",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
        <P5Card title={t.form.tripInfo}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              onClick={() => setPickerMode("origin")}
              style={{
                cursor: "pointer",
                border: `1px solid ${P5.line}`,
                padding: "12px",
                borderRadius: "8px",
              }}
            >
              <div style={{ fontSize: 12, color: P5.mut, marginBottom: 4 }}>
                {t.form.originLabel}
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: origin ? 600 : 400,
                  color: origin ? P5.ink : P5.dim,
                }}
              >
                {origin
                  ? origin.addressName || origin.address
                  : t.form.selectOriginPlaceholder}
              </div>
            </div>

            <div
              onClick={() => setPickerMode("destination")}
              style={{
                cursor: "pointer",
                border: `1px solid ${P5.line}`,
                padding: "12px",
                borderRadius: "8px",
              }}
            >
              <div style={{ fontSize: 12, color: P5.mut, marginBottom: 4 }}>
                {t.form.destinationLabel}
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: destination ? 600 : 400,
                  color: destination ? P5.ink : P5.dim,
                }}
              >
                {destination
                  ? destination.addressName || destination.address
                  : t.form.selectDestinationPlaceholder}
              </div>
            </div>

            <div
              style={{
                border: `1px solid ${P5.line}`,
                padding: "12px",
                borderRadius: "8px",
              }}
            >
              <div style={{ fontSize: 12, color: P5.mut, marginBottom: 4 }}>
                {t.form.scheduledAtLabel}
              </div>
              <input
                type="datetime-local"
                value={scheduledAt}
                min={minLocalTime}
                onChange={(e) => {
                  setScheduledAt(e.target.value);
                  onClearError?.();
                }}
                style={{
                  width: "100%",
                  border: "none",
                  outline: "none",
                  fontSize: 14,
                  fontWeight: 600,
                  color: P5.ink,
                  background: "transparent",
                  fontFamily: P5.mono,
                }}
              />
            </div>
          </div>
        </P5Card>
      </div>

      <div style={{ margin: "0 14px 12px" }}>
        <div
          onClick={() => {
            if (isFormValid) {
              const dateStr = new Date(scheduledAt).toISOString();
              onQuoteReady({ origin, destination, scheduledAt: dateStr });
            }
          }}
        >
          <P5Btn kind="primary" icon="check" disabled={!isFormValid}>
            {t.form.quoteButton}
          </P5Btn>
        </div>
      </div>
      <P5Notice />
    </P5Phone>
  );
}
