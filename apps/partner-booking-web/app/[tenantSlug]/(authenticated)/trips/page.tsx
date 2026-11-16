import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PartnerAuthorityError } from "@/lib/api-client";
import {
  loadPartnerBookingHistory,
  type PartnerReadSearch,
} from "@/lib/partner-booking-read-model";
import { partnerBookingReadHref } from "@/lib/partner-booking-form";
import {
  PartnerBookingReadError,
  PartnerPrincipalSummary,
} from "@/components/partner-booking-record";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
  searchParams?: Promise<PartnerReadSearch>;
};

export default async function PartnerTripsPage({
  params,
  searchParams,
}: PageProps) {
  const { tenantSlug } = await params;
  const query = (await searchParams) ?? {};
  const locale = await getServerLocale();
  try {
    const model = await loadPartnerBookingHistory(tenantSlug, query);
    const { items, pagination } = model.bookings;
    const href = (page: number) =>
      partnerBookingReadHref(
        model.entry.entrySlug,
        "trips",
        model.partnerUserRef,
        { page },
      );
    return (
      <section data-testid="partner-persisted-history">
        <h1>{t("read.history", undefined, locale)}</h1>
        <PartnerPrincipalSummary principal={model.principal} />
        <p>{t("read.historyScope", undefined, locale)}</p>
        {items.length === 0 ? (
          <div>
            <p>
              {t(
                pagination.totalItems === 0 ? "read.empty" : "read.emptyPage",
                undefined,
                locale,
              )}
            </p>
            {pagination.totalItems > 0 ? (
              <Link href={href(1)} prefetch={false}>
                {t("read.first", undefined, locale)}
              </Link>
            ) : null}
          </div>
        ) : (
          <ul>
            {items.map((booking) => (
              <li key={booking.bookingId} data-booking-id={booking.bookingId}>
                <Link
                  href={partnerBookingReadHref(
                    model.entry.entrySlug,
                    "confirmed",
                    model.partnerUserRef,
                    { bookingId: booking.bookingId, orderId: booking.orderId },
                  )}
                  prefetch={false}
                >
                  {booking.bookingId}
                </Link>
                <p>
                  {booking.pickup.address} → {booking.dropoff.address}
                </p>
                <p>
                  {booking.reservationWindowStart} · {booking.orderStatus}
                </p>
              </li>
            ))}
          </ul>
        )}
        {pagination.totalPages > 0 &&
        pagination.page <= pagination.totalPages ? (
          <p>
            {t(
              "read.page",
              { page: pagination.page, total: pagination.totalPages },
              locale,
            )}
          </p>
        ) : null}
        <nav aria-label={t("read.navigation", undefined, locale)}>
          {pagination.page > 1 && items.length > 0 ? (
            <Link href={href(pagination.page - 1)} prefetch={false}>
              {t("read.previous", undefined, locale)}
            </Link>
          ) : null}{" "}
          {pagination.page < pagination.totalPages ? (
            <Link href={href(pagination.page + 1)} prefetch={false}>
              {t("read.next", undefined, locale)}
            </Link>
          ) : null}
        </nav>
      </section>
    );
  } catch (error) {
    if (error instanceof PartnerAuthorityError) {
      if (error.code === "PARTNER_ENTRY_NOT_FOUND") notFound();
      if (error.code === "PARTNER_ENTRY_INACTIVE")
        redirect("/" + encodeURIComponent(tenantSlug) + "/inactive");
      return <PartnerBookingReadError locale={locale} code={error.code} />;
    }
    throw error;
  }
}
