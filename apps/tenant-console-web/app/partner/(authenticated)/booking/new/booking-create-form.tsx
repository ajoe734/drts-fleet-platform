"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { BookingRecord } from "@drts/contracts";

function defaultStartIso(offsetMinutes: number): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() + offsetMinutes);
  now.setSeconds(0, 0);
  return now.toISOString().slice(0, 16);
}

export function PartnerBookingCreateForm({
  canSubmit,
  eligibilityRequired,
  eligibilityVerificationId,
}: {
  canSubmit: boolean;
  eligibilityRequired: boolean;
  eligibilityVerificationId: string;
}) {
  const router = useRouter();
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupLat, setPickupLat] = useState("");
  const [pickupLng, setPickupLng] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [dropoffLat, setDropoffLat] = useState("");
  const [dropoffLng, setDropoffLng] = useState("");
  const [reservationStart, setReservationStart] = useState(defaultStartIso(30));
  const [reservationEnd, setReservationEnd] = useState(defaultStartIso(60));
  const [passengerName, setPassengerName] = useState("");
  const [passengerPhone, setPassengerPhone] = useState("");
  const [benefitReference, setBenefitReference] = useState("");
  const [flightNo, setFlightNo] = useState("");
  const [terminal, setTerminal] = useState("");
  const [notes, setNotes] = useState("");
  const [verificationId, setVerificationId] = useState(
    eligibilityVerificationId,
  );
  const [submitting, setSubmitting] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        pickup: {
          address: pickupAddress.trim(),
          lat: Number.parseFloat(pickupLat),
          lng: Number.parseFloat(pickupLng),
        },
        dropoff: {
          address: dropoffAddress.trim(),
          lat: Number.parseFloat(dropoffLat),
          lng: Number.parseFloat(dropoffLng),
        },
        reservationWindowStart: new Date(reservationStart).toISOString(),
        reservationWindowEnd: new Date(reservationEnd).toISOString(),
        passenger: {
          name: passengerName.trim(),
          phone: passengerPhone.trim(),
        },
        eligibilityVerificationId: verificationId.trim() || undefined,
        benefitReference: benefitReference.trim() || undefined,
        flightNo: flightNo.trim() || undefined,
        terminal: terminal.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      const response = await fetch("/api/partner/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as {
        booking?: BookingRecord;
        error?: string;
      } | null;

      if (!response.ok || !result?.booking) {
        setError(
          result?.error ?? `Booking create failed (HTTP ${response.status}).`,
        );
        return;
      }

      startTransition(() => {
        router.push(`/partner/booking/${result.booking!.bookingId}`);
        router.refresh();
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unknown booking failure.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const disabled = !canSubmit || submitting || pending;

  return (
    <form
      aria-label="Partner booking create"
      className="form-stack"
      onSubmit={handleSubmit}
    >
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}

      <fieldset className="form-stack">
        <legend className="surface-kicker">Pickup</legend>
        <label className="field-stack">
          <span>Pickup address</span>
          <input
            onChange={(event) => setPickupAddress(event.target.value)}
            required
            type="text"
            value={pickupAddress}
          />
        </label>
        <div className="form-grid">
          <label className="field-stack">
            <span>Pickup lat</span>
            <input
              inputMode="decimal"
              onChange={(event) => setPickupLat(event.target.value)}
              required
              type="text"
              value={pickupLat}
            />
          </label>
          <label className="field-stack">
            <span>Pickup lng</span>
            <input
              inputMode="decimal"
              onChange={(event) => setPickupLng(event.target.value)}
              required
              type="text"
              value={pickupLng}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="form-stack">
        <legend className="surface-kicker">Dropoff</legend>
        <label className="field-stack">
          <span>Dropoff address</span>
          <input
            onChange={(event) => setDropoffAddress(event.target.value)}
            required
            type="text"
            value={dropoffAddress}
          />
        </label>
        <div className="form-grid">
          <label className="field-stack">
            <span>Dropoff lat</span>
            <input
              inputMode="decimal"
              onChange={(event) => setDropoffLat(event.target.value)}
              required
              type="text"
              value={dropoffLat}
            />
          </label>
          <label className="field-stack">
            <span>Dropoff lng</span>
            <input
              inputMode="decimal"
              onChange={(event) => setDropoffLng(event.target.value)}
              required
              type="text"
              value={dropoffLng}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="form-stack">
        <legend className="surface-kicker">Reservation window</legend>
        <div className="form-grid">
          <label className="field-stack">
            <span>Window start</span>
            <input
              onChange={(event) => setReservationStart(event.target.value)}
              required
              type="datetime-local"
              value={reservationStart}
            />
          </label>
          <label className="field-stack">
            <span>Window end</span>
            <input
              onChange={(event) => setReservationEnd(event.target.value)}
              required
              type="datetime-local"
              value={reservationEnd}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="form-stack">
        <legend className="surface-kicker">Passenger</legend>
        <div className="form-grid">
          <label className="field-stack">
            <span>Passenger name</span>
            <input
              onChange={(event) => setPassengerName(event.target.value)}
              required
              type="text"
              value={passengerName}
            />
          </label>
          <label className="field-stack">
            <span>Passenger phone</span>
            <input
              onChange={(event) => setPassengerPhone(event.target.value)}
              required
              type="tel"
              value={passengerPhone}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="form-stack">
        <legend className="surface-kicker">Optional context</legend>
        <div className="form-grid">
          <label className="field-stack">
            <span>Benefit reference</span>
            <input
              onChange={(event) => setBenefitReference(event.target.value)}
              type="text"
              value={benefitReference}
            />
          </label>
          <label className="field-stack">
            <span>Flight no.</span>
            <input
              onChange={(event) => setFlightNo(event.target.value)}
              type="text"
              value={flightNo}
            />
          </label>
          <label className="field-stack">
            <span>Terminal</span>
            <input
              onChange={(event) => setTerminal(event.target.value)}
              type="text"
              value={terminal}
            />
          </label>
        </div>
        <label className="field-stack">
          <span>Notes</span>
          <textarea
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            value={notes}
          />
        </label>
      </fieldset>

      <fieldset className="form-stack">
        <legend className="surface-kicker">Eligibility binding</legend>
        <label className="field-stack">
          <span>
            {eligibilityRequired
              ? "Eligibility verification id (required)"
              : "Eligibility verification id (optional)"}
          </span>
          <input
            onChange={(event) => setVerificationId(event.target.value)}
            placeholder="ev_..."
            required={eligibilityRequired}
            type="text"
            value={verificationId}
          />
        </label>
      </fieldset>

      <div className="form-actions">
        <button
          className="action-button action-button-primary"
          disabled={disabled}
          type="submit"
        >
          {submitting || pending ? "Creating booking..." : "Create booking"}
        </button>
      </div>
    </form>
  );
}
