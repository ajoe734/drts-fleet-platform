"use client";

import { useState } from "react";
import type { PartnerProgramTheme } from "@/lib/program-theme";

type Props = {
  theme: PartnerProgramTheme;
  tenantSlug: string;
  successHref: string;
  label: string;
  eligibilityVerificationId?: string | null;
  pickup?: { address: string; lat?: number | null; lng?: number | null };
  dropoff?: { address: string; lat?: number | null; lng?: number | null };
  reservationWindowStart?: string;
  reservationWindowEnd?: string | null;
  passenger?: { name: string; phone: string; email?: string | null };
  flightNumber?: string | null;
};

export function EmbedBookingSubmitButton({
  theme,
  tenantSlug,
  successHref,
  label,
  eligibilityVerificationId,
  pickup,
  dropoff,
  reservationWindowStart,
  reservationWindowEnd,
  passenger,
  flightNumber,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    try {
      setSubmitting(true);
      setError(null);

      const defaultStart = new Date(Date.now() + 86400000).toISOString();
      const defaultEnd = new Date(Date.now() + 90000000).toISOString();

      const payload: Record<string, unknown> = {
        tenantSlug,
        ...(eligibilityVerificationId ? { eligibilityVerificationId } : {}),
        pickup: pickup ?? {
          address: "台北市信義區市府路1號",
          lat: 25.0378,
          lng: 121.5649,
        },
        dropoff: dropoff ?? {
          address: "桃園國際機場第一航廈",
          lat: 25.0792,
          lng: 121.2342,
        },
        reservationWindowStart: reservationWindowStart ?? defaultStart,
        reservationWindowEnd: reservationWindowEnd ?? defaultEnd,
        passenger: passenger ?? {
          name: "預約乘客",
          phone: "0900000000",
        },
        ...(flightNumber ? { flightNumber } : {}),
      };

      const response = await fetch("/api/embed-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "EMBED_BOOKING_CREATE_FAILED");
      }

      const data = await response.json();
      if (data.success && data.bookingId) {
        const delimiter = successHref.includes("?") ? "&" : "?";
        const target = `${successHref}${delimiter}bookingId=${encodeURIComponent(data.bookingId)}`;
        if (typeof window !== "undefined") {
          window.location.href = target;
        }
      } else {
        throw new Error("Missing bookingId in response");
      }
    } catch (err) {
      setSubmitting(false);
      setError(
        err instanceof Error ? err.message : "Booking submission failed",
      );
    }
  }

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      {error ? (
        <div
          style={{
            fontSize: "12px",
            color: theme.chrome.accentText,
            background: theme.chrome.accentSoft,
            padding: "8px 12px",
            borderRadius: "8px",
            border: `1px solid ${theme.surface.border}`,
          }}
        >
          {error}
        </div>
      ) : null}
      <button
        type="button"
        data-testid="embed-booking-submit-button"
        onClick={handleSubmit}
        disabled={submitting}
        style={{
          width: "100%",
          minHeight: "46px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "12px",
          border: `1px solid ${theme.primary}`,
          background: theme.primary,
          color: "#ffffff",
          fontSize: "14px",
          fontWeight: 700,
          cursor: submitting ? "not-allowed" : "pointer",
          opacity: submitting ? 0.7 : 1,
        }}
      >
        {submitting ? "建單處理中..." : label}
      </button>
    </div>
  );
}
