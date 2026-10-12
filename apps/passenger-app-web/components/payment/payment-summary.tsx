"use client";
import { useRouter } from "next/navigation";
import type { PassengerPaymentMethod } from "@drts/contracts";
import {
  paymentMethodLabel,
  paymentMethodExpired,
  passengerPaymentDisplay,
} from "../../../../packages/passenger-client/src/payment/state";
import { AuthAlert, P5Btn, P5 } from "../auth/ui";
import { PAY_T as T } from "../../lib/payment/translations";

export function UnpaidPaymentNotice() {
  return (
    <AuthAlert>
      <p>{T.unpaid}</p>
      <p>{T.unpaidHelp}</p>
      <a href="tel:02-2944-0985">{T.support}</a>
    </AuthAlert>
  );
}
/** Actual consumers provide their authoritative status; missing is unavailable. */
export function PassengerPaymentStatus({ status }: { status?: string }) {
  const display = passengerPaymentDisplay(status);
  const color =
    display.tone === "success"
      ? P5.ok
      : display.tone === "danger"
        ? P5.danger
        : display.tone === "warn"
          ? P5.warn
          : P5.brand;
  return (
    <span role="status" aria-label={T.paymentStatus} style={{ color }}>
      {display.label}
    </span>
  );
}
export function PaymentMethodChoice({
  methods,
  selectedId,
  onSelect,
  disabled = false,
}: {
  methods: readonly PassengerPaymentMethod[];
  selectedId?: string | undefined;
  onSelect: (method: PassengerPaymentMethod) => void;
  disabled?: boolean;
}) {
  const router = useRouter();
  return (
    <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0 }}>
      <legend>{T.choose}</legend>
      {methods.length === 0 ? (
        <AuthAlert kind="info">{T.noCard}</AuthAlert>
      ) : (
        methods.map((method) => {
          const selected = selectedId === method.paymentMethodId;
          return (
            <label
              key={method.paymentMethodId}
              style={{
                display: "flex",
                gap: 12,
                border: `${selected ? 2 : 1}px solid ${selected ? P5.brand : P5.line}`,
                borderRadius: 12,
                padding: 16,
                marginBottom: 12,
                background: selected ? P5.brandBg : P5.surface,
              }}
            >
              <input
                type="radio"
                name="passenger-payment-method"
                value={method.paymentMethodId}
                checked={selected}
                disabled={disabled || paymentMethodExpired(method)}
                onChange={() => onSelect(method)}
                style={{ accentColor: P5.brand }}
              />
              <span>
                <span style={{ fontFamily: P5.mono, fontWeight: 700 }}>
                  {paymentMethodLabel(method)}
                </span>
                {selected && (
                  <span
                    style={{ display: "block", fontSize: 12, color: P5.brand }}
                  >
                    {T.selected}
                  </span>
                )}
                {paymentMethodExpired(method) && <span>{T.expired}</span>}
              </span>
            </label>
          );
        })
      )}
      <P5Btn
        disabled={disabled}
        icon="doc"
        onClick={() => router.push("/account/payment-methods")}
      >
        {T.add}
      </P5Btn>
      <p style={{ fontSize: 13, color: P5.mut, textAlign: "center" }}>
        {T.afterTrip}
      </p>
    </fieldset>
  );
}
