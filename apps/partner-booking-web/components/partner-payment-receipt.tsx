import {
  normalisePlatformCurrency,
  type MoneyAmount,
  type PartnerOrderReceiptRecord,
} from "@drts/contracts";
import { type Locale, t } from "@/lib/translations";

/** Read-only task fare and passenger ledger; partner invoice settlement is separate. */
export function PartnerPaymentReceipt({
  receipt,
  locale,
}: {
  receipt: PartnerOrderReceiptRecord;
  locale: Locale;
}) {
  const label = (key: string) => t(key, undefined, locale);
  const money = (amount: MoneyAmount | null) =>
    amount === null
      ? label("receipt.notProvided")
      : new Intl.NumberFormat(locale === "zh" ? "zh-TW" : "en-US", {
          style: "currency",
          currency: normalisePlatformCurrency(amount.currency),
        }).format(amount.amountMinor / 100);
  const completion = receipt.completion;
  const payment = receipt.payment;
  const breakdown = completion?.actualFareBreakdown;
  const actual = completion?.actualFare;
  const parts = [
    ["startMinor", "receipt.start"],
    ["distanceMinor", "receipt.distanceFare"],
    ["delayMinor", "receipt.delay"],
    ["nightMinor", "receipt.night"],
  ] as const;
  return (
    <section
      data-testid="partner-payment-receipt"
      data-order-id={receipt.orderId}
      data-booking-id={receipt.bookingId ?? undefined}
    >
      <section
        aria-label={label("receipt.actualTrip")}
        data-testid="partner-task-fare"
        data-task-id={completion?.taskId}
      >
        <h2>{label("receipt.actualTrip")}</h2>
        {completion ? (
          <dl>
            <div>
              <dt>{label("receipt.taskId")}</dt>
              <dd>{completion.taskId}</dd>
            </div>
            <div>
              <dt>{label("receipt.completedAt")}</dt>
              <dd>{completion.completedAt ?? label("receipt.notProvided")}</dd>
            </div>
            <div>
              <dt>{label("receipt.actualFare")}</dt>
              <dd data-testid="partner-actual-fare">{money(actual ?? null)}</dd>
            </div>
            {breakdown && actual ? (
              parts.map(([key, title]) => (
                <div key={key}>
                  <dt>{label(title)}</dt>
                  <dd>
                    {money({
                      currency: actual.currency,
                      amountMinor: breakdown[key],
                    })}
                  </dd>
                </div>
              ))
            ) : (
              <div>
                <dt>{label("receipt.breakdown")}</dt>
                <dd>{label("receipt.notProvided")}</dd>
              </div>
            )}
            <div>
              <dt>{label("receipt.distanceKm")}</dt>
              <dd>
                {completion.actualDistanceKm ?? label("receipt.notProvided")}
              </dd>
            </div>
            <div>
              <dt>{label("receipt.durationSec")}</dt>
              <dd>
                {completion.actualDurationSec ?? label("receipt.notProvided")}
              </dd>
            </div>
          </dl>
        ) : (
          <p>{label("receipt.noCompletion")}</p>
        )}
      </section>
      <section
        aria-label={label("receipt.passengerPayment")}
        data-testid="partner-passenger-payment"
        data-payment-availability={payment.availability}
        data-payment-status={payment.status ?? undefined}
      >
        <h2>{label("receipt.passengerPayment")}</h2>
        <p>{label("receipt.paymentScope")}</p>
        {payment.availability === "available" ? (
          <dl>
            <div>
              <dt>{label("receipt.paymentStatus")}</dt>
              <dd>
                {payment.status === null
                  ? label("receipt.notProvided")
                  : label("receipt.status." + payment.status)}
              </dd>
            </div>
            <div>
              <dt>{label("receipt.transactionAmount")}</dt>
              <dd data-testid="partner-payment-amount">
                {money(payment.amount)}
              </dd>
            </div>
          </dl>
        ) : (
          <p>
            {label(
              payment.availability === "not_recorded"
                ? "receipt.noPassengerPayment"
                : "receipt.passengerPaymentUnavailable",
            )}
          </p>
        )}
        <p>{label("receipt.notTaxReceipt")}</p>
      </section>
    </section>
  );
}
