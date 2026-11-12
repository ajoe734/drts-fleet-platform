import Link from "next/link";
import {
  normalisePlatformCurrency,
  type BookingRecord,
  type OwnedOrderRecord,
  type PartnerOrderProgressRecord,
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
  order: OwnedOrderRecord & { progress?: PartnerOrderProgressRecord };
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
  const progress =
    order.progress?.orderId === order.orderId ? order.progress : null;
  const task = progress?.currentTask;
  const progressRows = [
    [
      label("progress.stage"),
      progress?.availability === "available"
        ? task
          ? label("progress.task." + task.status)
          : label("progress.noTask")
        : label("progress.unavailable"),
    ],
    [
      label("progress.driverSurname"),
      progress?.driver?.driverSurname || label("receipt.notProvided"),
    ],
    [
      label("progress.plate"),
      progress?.vehicle?.plateNo || label("receipt.notProvided"),
    ],
    ...(
      [
        "acceptedAt",
        "departedAt",
        "arrivedPickupAt",
        "startedAt",
        "completedAt",
      ] as const
    ).map((key) => [
      label("progress." + key),
      task?.[key] || label("receipt.notProvided"),
    ]),
    [
      label("progress.gps"),
      label(
        "progress.location." + (progress?.location?.status ?? "unavailable"),
      ),
    ],
    [
      label("progress.sampleAt"),
      progress?.location?.recordedAt || label("receipt.notProvided"),
    ],
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
      <section
        aria-label={label("progress.title")}
        data-testid="partner-trip-progress"
        data-order-id={order.orderId}
        data-task-id={task?.taskId}
        data-driver-id={task?.driverId}
        data-vehicle-id={task?.vehicleId}
      >
        <h2>{label("progress.title")}</h2>
        <dl>
          {progressRows.map(([name, value]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p>{label("progress.declaredScope")}</p>
        <p>{label("progress.manualUpdate")}</p>
        <a
          href={partnerBookingReadHref(entrySlug, screen, partnerUserRef, {
            bookingId: booking.bookingId,
            orderId: order.orderId,
          })}
        >
          {label("progress.refresh")}
        </a>
      </section>
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
