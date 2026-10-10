import React, { useState, useEffect } from "react";
import { P5Phone, P5Header, P5Card, P5Btn, P5Notice, P5 } from "../p5-ui";
import { AddressMapPicker, type AddressPayload } from "@drts/ui-web";
import { createMockGeoProvider } from "../../lib/booking/mock-geo-provider";
import { bookingTranslations as t } from "../../lib/booking/translations";

interface BookingFormProps {
  onQuoteReady: (data: {
    origin: AddressPayload;
    destination: AddressPayload;
    scheduledAt: string;
  }) => void;
  error?: string | null;
  onClearError?: () => void;
}

const geoProvider = createMockGeoProvider();

export function BookingForm({
  onQuoteReady,
  error,
  onClearError,
}: BookingFormProps) {
  const [origin, setOrigin] = useState<AddressPayload | null>(null);
  const [destination, setDestination] = useState<AddressPayload | null>(null);
  const [scheduledAt, setScheduledAt] = useState<string>("");

  const [pickerMode, setPickerMode] = useState<"origin" | "destination" | null>(
    null,
  );

  useEffect(() => {
    // Default to 15 mins from now - blocked by R5 config requirement from BFF
    const d = new Date();
    d.setMinutes(d.getMinutes() + 15);
    // Format to YYYY-MM-DDTHH:mm
    const tzOffset = d.getTimezoneOffset() * 60000;
    const localISOTime = new Date(d.getTime() - tzOffset)
      .toISOString()
      .slice(0, 16);
    setScheduledAt(localISOTime);
  }, []);

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
        <P5Card title="行程資訊">
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
