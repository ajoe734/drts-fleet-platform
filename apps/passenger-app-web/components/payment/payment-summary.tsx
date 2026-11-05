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
import { BOOK_T } from "../../lib/booking/translations";

/** Passenger-facing card name: the nonproduction PSP's internal card type
 * "synthetic" reads 測試卡 and a brandless card reads 信用卡; real brands
 * (VISA, JCB…) and the demo's 示意卡 are shown as issued. */
export function passengerCardLabel(method: PassengerPaymentMethod): string {
  const type = method.cardType.trim();
  const cardType = /^synthetic$/i.test(type)
    ? BOOK_T.testCard
    : !type || /^credit$/i.test(type)
      ? T.creditCards
      : type;
  return paymentMethodLabel({ ...method, cardType });
}

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
    <fieldset
      disabled={disabled}
      style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
    >
      <legend
        style={{ padding: 0, marginBottom: 8, fontSize: 13, fontWeight: 700 }}
      >
        {T.choose}
      </legend>
      {methods.length === 0 ? (
        <AuthAlert kind="info">{T.noCard}</AuthAlert>
      ) : (
        methods.map((method) => {
          const selected = selectedId === method.paymentMethodId;
          const expired = paymentMethodExpired(method);
          return (
            <label
              key={method.paymentMethodId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                border: `${selected ? 2 : 1}px solid ${selected ? P5.brand : P5.line}`,
                borderRadius: 12,
                padding: selected ? "11px 13px" : "12px 14px",
                marginBottom: 8,
                background: selected ? P5.brandBg : P5.surface,
                cursor: disabled || expired ? "default" : "pointer",
              }}
            >
              <input
                type="radio"
                name="passenger-payment-method"
                value={method.paymentMethodId}
                checked={selected}
                disabled={disabled || expired}
                onChange={() => onSelect(method)}
                style={{
                  accentColor: P5.brand,
                  width: 18,
                  height: 18,
                  margin: 0,
                }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{ fontFamily: P5.mono, fontWeight: 700, fontSize: 14 }}
                >
                  {passengerCardLabel(method)}
                </span>
                {expired && (
                  <span
                    style={{ display: "block", fontSize: 12, color: P5.danger }}
                  >
                    {T.expired}
                  </span>
                )}
              </span>
              {selected && (
                <span
                  style={{ fontSize: 12, fontWeight: 700, color: P5.brand }}
                >
                  {T.selected}
                </span>
              )}
            </label>
          );
        })
      )}
      <div style={{ marginTop: 4 }}>
        <P5Btn
          disabled={disabled}
          onClick={() => router.push("/account/payment-methods")}
        >
          {T.add}
        </P5Btn>
      </div>
      <p
        style={{
          fontSize: 11.5,
          color: P5.mut,
          textAlign: "center",
          margin: "8px 0 0",
        }}
      >
        {T.afterTrip}
      </p>
    </fieldset>
  );
}
