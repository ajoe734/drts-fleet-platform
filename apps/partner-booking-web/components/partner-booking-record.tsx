import Link from "next/link";
import {
  normalisePlatformCurrency,
  type BookingRecord,
  type OwnedOrderRecord,
} from "@drts/contracts";
import { partnerBookingReadHref } from "@/lib/partner-booking-form";
import { type Locale, t } from "@/lib/translations";

export function PartnerBookingReadError({
  locale,
  code,
}: {
  locale: Locale;
  code: string;
}) {
  return (
    <p role="alert" data-read-error={code}>
      {t("read.error", undefined, locale)}
    </p>
  );
}

export function PartnerBookingRecord({
  booking,
  order,
  entrySlug,
  partnerUserRef,
  locale,
  screen,
}: {
  booking: BookingRecord;
  order: OwnedOrderRecord;
  entrySlug: string;
  partnerUserRef: string;
  locale: Locale;
  screen: "confirmed" | "receipt";
}) {
  const label = (key: string) => t(key, undefined, locale);
  const rows = [
    [label("book.create.bookingId"), booking.bookingId],
    [label("book.create.orderId"), order.orderId],
    [label("read.status"), order.status],
    [label("field.reservationWindowStart"), booking.reservationWindowStart],
    [label("field.reservationWindowEnd"), booking.reservationWindowEnd],
    [label("field.pickupAddress"), order.pickup.address],
    [label("field.dropoffAddress"), order.dropoff.address],
    [label("field.passengerName"), order.passenger.name],
    [label("field.passengerPhone"), order.passenger.phone],
    ...(booking.flightNo ? [[label("field.flightNo"), booking.flightNo]] : []),
    ...(booking.terminal ? [[label("field.terminal"), booking.terminal]] : []),
    ...(booking.direction
      ? [[label("field.direction"), booking.direction]]
      : []),
  ];
  const quotation = order.quotedFare;
  const money = quotation
    ? new Intl.NumberFormat(locale === "zh" ? "zh-TW" : "en-US", {
        style: "currency",
        currency: normalisePlatformCurrency(quotation.currency),
      }).format(quotation.amountMinor / 100)
    : label("read.noQuotation");
  return (
    <section
      data-testid="partner-persisted-booking"
      data-booking-id={booking.bookingId}
      data-order-id={order.orderId}
    >
      <h1>
        {label(screen === "confirmed" ? "read.confirmation" : "read.record")}
      </h1>
      <dl>
        {rows.map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {booking.partnerBookingDetails ? (
        <section aria-label={label("read.details")}>
          <h2>{label("read.details")}</h2>
          <dl>
            {Object.entries(booking.partnerBookingDetails)
              .filter(([key]) => key !== "subtype")
              .map(([key, value]) => (
                <div key={key}>
                  <dt>{label("field." + key)}</dt>
                  <dd>
                    {Array.isArray(value) ? value.join(" · ") : String(value)}
                  </dd>
                </div>
              ))}
          </dl>
        </section>
      ) : null}
      <h2>{label("read.quotation")}</h2>
      <p>{money}</p>
      {order.quotedFareSource ? (
        <p>
          {label("read.quotationSource")}: {order.quotedFareSource}
        </p>
      ) : null}
      <p>{label("read.notPaidReceipt")}</p>
      <nav aria-label={label("read.navigation")}>
        <Link
          href={partnerBookingReadHref(entrySlug, "confirmed", partnerUserRef, {
            bookingId: booking.bookingId,
            orderId: order.orderId,
          })}
          prefetch={false}
        >
          {label("read.confirmation")}
        </Link>
        {" · "}
        <Link
          href={partnerBookingReadHref(entrySlug, "receipt", partnerUserRef, {
            bookingId: booking.bookingId,
            orderId: order.orderId,
          })}
          prefetch={false}
        >
          {label("read.record")}
        </Link>
        {" · "}
        <Link
          href={partnerBookingReadHref(entrySlug, "trips", partnerUserRef)}
          prefetch={false}
        >
          {label("read.history")}
        </Link>
      </nav>
    </section>
  );
}
