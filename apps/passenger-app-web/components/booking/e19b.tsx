import React from "react";
import { P5Phone, P5Header, P5Btn, P5 } from "../p5-ui";
import { bookingTranslations as t } from "../../lib/booking/translations";

interface P5E19bProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  originTitle: string;
  destinationTitle: string;
  scheduledAt: string;
  quoteMin: number;
  quoteMax: number;
  paymentMethod: string;
  fareVersion?: string;
  feeVersionUrl?: string; // Optional URL for "查看完整費用與優惠說明"
}

export function P5E19b({
  checked,
  onCheckedChange,
  onConfirm,
  onCancel,
  originTitle,
  destinationTitle,
  scheduledAt,
  quoteMin,
  quoteMax,
  paymentMethod,
  fareVersion,
}: P5E19bProps) {
  const R = (k: string, v: string, mono?: boolean) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "6px 0",
        fontSize: 12.5,
      }}
    >
      <span style={{ color: P5.mut }}>{k}</span>
      <span
        style={{
          fontWeight: 600,
          fontFamily: mono ? P5.mono : "inherit",
          textAlign: "right",
        }}
      >
        {v}
      </span>
    </div>
  );

  return (
    <P5Phone url="ride.smarttransport.tw">
      <P5Header status={t.e19b.headerTitle} />
      <div
        style={{
          flex: 1,
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ flex: 1, background: "rgba(22,33,44,.45)" }} />
        <div
          style={{
            background: P5.surface,
            borderRadius: "20px 20px 0 0",
            padding: "10px 14px 14px",
            boxShadow: "0 -8px 30px rgba(0,0,0,.18)",
          }}
        >
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              background: P5.line,
              margin: "0 auto 10px",
            }}
          />
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
            {t.e19b.title}
          </div>
          <div
            style={{
              border: "1px solid " + P5.line,
              borderRadius: 12,
              padding: "8px 14px",
              marginBottom: 10,
            }}
          >
            {R(t.e19b.origin, originTitle)}
            {R(t.e19b.destination, destinationTitle)}
            {R(t.e19b.scheduledAt, scheduledAt, true)}
            {R(t.e19b.quote, `NT$ ${quoteMin}–${quoteMax}`, true)}
            {R(t.e19b.paymentMethod, paymentMethod, true)}
          </div>
          <div
            style={{
              border: "1px solid " + P5.line,
              borderRadius: 12,
              padding: "10px 14px",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {t.e19b.feeRulesTitle}
              </div>
              {fareVersion && (
                <div style={{ fontSize: 11, color: P5.mut }}>
                  {t.common.version}
                  {fareVersion}
                </div>
              )}
            </div>
            {[
              t.e19b.feeRule1,
              t.e19b.feeRule2,
              t.e19b.feeRule3,
              t.e19b.feeRule4,
            ].map((text) => (
              <div
                key={text}
                style={{
                  display: "flex",
                  gap: 7,
                  fontSize: 12,
                  color: P5.ink,
                  padding: "3px 0",
                }}
              >
                <span style={{ color: P5.ok }}>✓</span>
                <span>{text}</span>
              </div>
            ))}
            <div style={{ textAlign: "right", marginTop: 4 }}>
              <span
                style={{ fontSize: 11.5, color: P5.brand, fontWeight: 700 }}
              >
                {t.e19b.feeDetailsLink}
              </span>
            </div>
          </div>
          {/* Native label for proper accessibility and interaction tracking */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              fontSize: 12.5,
              fontWeight: 600,
              marginBottom: 10,
              cursor: "pointer",
            }}
          >
            {/* We hide the actual native checkbox visually, but keep it accessible for standard interaction tracking */}
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => onCheckedChange(e.target.checked)}
              style={{
                position: "absolute",
                opacity: 0,
                width: 0,
                height: 0,
              }}
              data-testid="e19b-checkbox"
            />
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: 5,
                border: "1.5px solid " + (checked ? P5.brand : P5.line),
                background: checked ? P5.brand : P5.surface,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
              }}
            >
              {checked ? "✓" : ""}
            </span>
            {t.e19b.agreeCheckbox}
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              onClick={onConfirm}
              disabled={!checked}
              data-testid="e19b-confirm-btn"
              style={{
                width: "100%",
                minHeight: 46,
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 700,
                border: "none",
                background: checked ? P5.brand : P5.line,
                color: checked ? "#fff" : P5.dim,
                cursor: checked ? "pointer" : "not-allowed",
                fontFamily: "inherit",
              }}
            >
              {t.e19b.confirmButton}
            </button>
            <P5Btn onClick={onCancel}>{t.e19b.backButton}</P5Btn>
          </div>
          {!checked && (
            <div
              style={{
                fontSize: 10.5,
                color: P5.warn,
                textAlign: "center",
                marginTop: 6,
              }}
            >
              {t.e19b.checkboxRequired}
            </div>
          )}
          <div
            style={{
              fontSize: 10.5,
              color: P5.dim,
              textAlign: "center",
              marginTop: 8,
            }}
          >
            {t.e19b.disclaimer}
          </div>
        </div>
      </div>
    </P5Phone>
  );
}
