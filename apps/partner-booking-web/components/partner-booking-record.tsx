import Link from "next/link";
import {
  AddressMapPreviewSurface,
  type AddressMapPin,
  type MapBounds,
} from "@drts/ui-web";
import {
  normalisePlatformCurrency,
  type BookingRecord,
  type OwnedOrderRecord,
  type PartnerOrderProgressRecord,
} from "@drts/contracts";
import type { PartnerPrincipalReadback } from "@/lib/api-client";
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

/** Same-request identity observation; it adds no visible or announced UI. */
export function PartnerPrincipalSummary({
  principal,
}: {
  principal: PartnerPrincipalReadback;
}) {
  if (principal.availability === "unavailable")
    return (
      <span
        hidden
        data-partner-principal="api_auth_session"
        data-principal-availability="unavailable"
        data-principal-reason={principal.reason}
      />
    );
  return (
    <span
      hidden
      data-partner-principal="api_auth_session"
      data-principal-availability="available"
      data-principal-subject={principal.actorId}
      data-principal-actor-type={principal.actorType}
      data-principal-realm={principal.realm}
      data-principal-roles={JSON.stringify(principal.roles)}
      data-principal-tenant-id={principal.tenantId ?? undefined}
      data-principal-partner-id={principal.partnerId ?? undefined}
      data-principal-program-id={principal.partnerProgramId ?? undefined}
      data-principal-entry-slug={principal.partnerEntrySlug}
      data-principal-api-request-id={principal.requestId ?? undefined}
    />
  );
}

function coordinatePoint(
  value: { lat?: unknown; lng?: unknown } | null | undefined,
) {
  if (
    typeof value?.lat !== "number" ||
    typeof value.lng !== "number" ||
    !Number.isFinite(value.lat) ||
    !Number.isFinite(value.lng) ||
    Math.abs(value.lat) > 90 ||
    Math.abs(value.lng) > 180
  )
    return null;
  return { lat: value.lat, lng: value.lng };
}

export function PartnerBookingRecord({
  booking,
  order,
  entrySlug,
  partnerUserRef,
  locale,
  screen,
  principal,
}: {
  booking: BookingRecord;
  order: OwnedOrderRecord & { progress?: PartnerOrderProgressRecord };
  entrySlug: string;
  partnerUserRef: string;
  locale: Locale;
  screen: "confirmed" | "receipt";
  principal?: PartnerPrincipalReadback;
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
    ...(booking.luggageCount != null
      ? [[label("field.luggageCount"), String(booking.luggageCount)]]
      : []),
    ...(booking.flightNo ? [[label("field.flightNo"), booking.flightNo]] : []),
    ...(booking.terminal ? [[label("field.terminal"), booking.terminal]] : []),
    ...(booking.direction
      ? [
          [
            label("field.direction"),
            label("field.direction." + booking.direction),
          ],
        ]
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
  const position =
    progress?.availability === "available" &&
    task &&
    !["completed", "cancelled", "rejected"].includes(task.status) &&
    order.status !== "completed" &&
    order.status !== "cancelled" &&
    progress.location.status === "fresh"
      ? coordinatePoint(progress.location.position)
      : null;
  const pins: AddressMapPin[] = position
    ? [
        {
          id: "driver",
          point: position,
          label: label("progress.positionDriver"),
          tone: "success",
        },
      ]
    : [];
  if (position) {
    for (const [id, address, title] of [
      ["pickup", order.pickup, "progress.positionPickup"],
      ["dropoff", order.dropoff, "progress.positionDropoff"],
    ] as const) {
      const point = coordinatePoint(address);
      if (point) pins.push({ id, point, label: label(title), tone: "neutral" });
    }
  }
  let bounds: MapBounds | undefined;
  if (pins.length) {
    const latitudes = pins.map((pin) => pin.point.lat);
    const longitudes = pins.map((pin) => pin.point.lng);
    const minLat = Math.min(...latitudes),
      maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes),
      maxLng = Math.max(...longitudes);
    // Padding frames only known points; it never creates a substitute location.
    const latPadding = Math.max((maxLat - minLat) * 0.1, 0.0001);
    const lngPadding = Math.max((maxLng - minLng) * 0.1, 0.0001);
    bounds = {
      minLat: minLat - latPadding,
      maxLat: maxLat + latPadding,
      minLng: minLng - lngPadding,
      maxLng: maxLng + lngPadding,
    };
  }
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
      {principal ? <PartnerPrincipalSummary principal={principal} /> : null}
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
        <section
          aria-label={label("progress.positionTitle")}
          data-testid="partner-position-snapshot"
          data-position-recorded-at={
            position ? (progress?.location.recordedAt ?? undefined) : undefined
          }
          data-position-read-at={progress?.readAt}
          data-position-lat={position?.lat}
          data-position-lng={position?.lng}
        >
          <h3>{label("progress.positionTitle")}</h3>
          <p>{label("progress.positionSnapshot")}</p>
          <dl>
            <div>
              <dt>{label("progress.positionReadAt")}</dt>
              <dd>{progress?.readAt || label("receipt.notProvided")}</dd>
            </div>
          </dl>
          {position && bounds ? (
            <>
              <AddressMapPreviewSurface
                pins={pins}
                bounds={bounds}
                ariaLabel={label("progress.positionDiagram")}
                caption={label("progress.positionNotRoute")}
              />
              <p data-testid="partner-driver-coordinate">
                {position.lat}, {position.lng}
              </p>
            </>
          ) : (
            <p>{label("progress.positionUnavailable")}</p>
          )}
        </section>
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
