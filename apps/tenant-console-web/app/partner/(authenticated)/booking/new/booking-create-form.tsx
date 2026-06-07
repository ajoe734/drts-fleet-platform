"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { BookingRecord } from "@drts/contracts";
import { formatTenantUiError } from "@/lib/error-copy";

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
          formatTenantUiError(
            result?.error ?? `建立訂單失敗（狀態碼 ${response.status}）。`,
            "建立訂單失敗",
          ),
        );
        return;
      }

      startTransition(() => {
        router.push(`/partner/booking/${result.booking!.bookingId}`);
        router.refresh();
      });
    } catch (caught) {
      setError(
        formatTenantUiError(
          caught instanceof Error ? caught.message : "未知的建立訂單失敗。",
          "建立訂單失敗",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const disabled = !canSubmit || submitting || pending;

  return (
    <form
      aria-label="合作夥伴建立訂單"
      className="form-stack"
      onSubmit={handleSubmit}
    >
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}

      <fieldset className="form-stack">
        <legend className="surface-kicker">上車資訊</legend>
        <label className="field-stack">
          <span>上車地址</span>
          <input
            onChange={(event) => setPickupAddress(event.target.value)}
            required
            type="text"
            value={pickupAddress}
          />
        </label>
        <div className="form-grid">
          <label className="field-stack">
            <span>上車緯度</span>
            <input
              inputMode="decimal"
              onChange={(event) => setPickupLat(event.target.value)}
              required
              type="text"
              value={pickupLat}
            />
          </label>
          <label className="field-stack">
            <span>上車經度</span>
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
        <legend className="surface-kicker">下車資訊</legend>
        <label className="field-stack">
          <span>下車地址</span>
          <input
            onChange={(event) => setDropoffAddress(event.target.value)}
            required
            type="text"
            value={dropoffAddress}
          />
        </label>
        <div className="form-grid">
          <label className="field-stack">
            <span>下車緯度</span>
            <input
              inputMode="decimal"
              onChange={(event) => setDropoffLat(event.target.value)}
              required
              type="text"
              value={dropoffLat}
            />
          </label>
          <label className="field-stack">
            <span>下車經度</span>
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
        <legend className="surface-kicker">預約時窗</legend>
        <div className="form-grid">
          <label className="field-stack">
            <span>開始時間</span>
            <input
              onChange={(event) => setReservationStart(event.target.value)}
              required
              type="datetime-local"
              value={reservationStart}
            />
          </label>
          <label className="field-stack">
            <span>結束時間</span>
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
        <legend className="surface-kicker">乘客資訊</legend>
        <div className="form-grid">
          <label className="field-stack">
            <span>乘客姓名</span>
            <input
              onChange={(event) => setPassengerName(event.target.value)}
              required
              type="text"
              value={passengerName}
            />
          </label>
          <label className="field-stack">
            <span>乘客電話</span>
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
        <legend className="surface-kicker">補充資訊</legend>
        <div className="form-grid">
          <label className="field-stack">
            <span>福利參考編號</span>
            <input
              onChange={(event) => setBenefitReference(event.target.value)}
              type="text"
              value={benefitReference}
            />
          </label>
          <label className="field-stack">
            <span>航班號</span>
            <input
              onChange={(event) => setFlightNo(event.target.value)}
              type="text"
              value={flightNo}
            />
          </label>
          <label className="field-stack">
            <span>航廈</span>
            <input
              onChange={(event) => setTerminal(event.target.value)}
              type="text"
              value={terminal}
            />
          </label>
        </div>
        <label className="field-stack">
          <span>備註</span>
          <textarea
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            value={notes}
          />
        </label>
      </fieldset>

      <fieldset className="form-stack">
        <legend className="surface-kicker">資格驗證綁定</legend>
        <label className="field-stack">
          <span>
            {eligibilityRequired
              ? "資格驗證編號（必填）"
              : "資格驗證編號（選填）"}
          </span>
          <input
            onChange={(event) => setVerificationId(event.target.value)}
            placeholder="請輸入平台資格驗證編號"
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
          {submitting || pending ? "正在建立訂單..." : "建立訂單"}
        </button>
      </div>
    </form>
  );
}
