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
  const tourCopy =
    locale === "en"
      ? {
          heading: "Tour legs, batches and vehicles",
          current:
            "Current orders from all history pages; each order keeps its own status.",
          partial:
            "History could not be read completely. Refresh before checking the whole tour.",
          completed: "All declared slots completed",
          open: "Tour has outstanding or conflicting slots",
          missing: "No active order for this slot",
          duplicate: "Multiple active orders for this slot",
          inconsistent:
            "Plan counts or slot indices disagree; whole-tour completion is unconfirmed.",
          missingLegs: "Legs without orders",
          missingBatches:
            "Additional batches without orders in the listed legs",
          missingVehicles:
            "Vehicle slots without active orders in the listed batches",
          unknown:
            "Bookings without a full source / revision / leg / batch / vehicle identity remain in ordinary history.",
          source: "Source",
        }
      : {
          heading: "團體分段、批次與車輛",
          current: "彙整所有歷史分頁的目前訂單，各單保留自己的實際狀態。",
          partial: "未能完整讀取歷史清單，請重新整理後再核對全團。",
          completed: "所有已宣告車位均已完成",
          open: "全團仍有未完成或衝突的車位",
          missing: "此車位沒有有效訂單",
          duplicate: "此車位有多張有效訂單",
          inconsistent: "計畫數量或車位索引不一致，尚無法確認全團完成。",
          missingLegs: "尚無訂單的段數",
          missingBatches: "已列各段內尚無訂單的其他批次數",
          missingVehicles: "已列各批次內尚無有效訂單的車位數",
          unknown:
            "未具完整來源、版本、段、批次與車位識別的訂單仍列在一般歷史中。",
          source: "來源",
        };
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
        {model.travel ? (
          <section data-testid="partner-tour-booking-groups">
            <h2>{tourCopy.heading}</h2>
            <p>{tourCopy.current}</p>
            {!model.travel.complete ? (
              <p role="status">{tourCopy.partial}</p>
            ) : null}
            {model.travel.groups.map((group) => (
              <article
                key={group.key}
                data-plan-source-id={group.sourceId}
                data-plan-source-revision={group.sourceRevision}
              >
                <h3>{group.groupCode}</h3>
                <p>
                  {tourCopy.source}: {group.sourceLabel} ({group.sourceKind} /{" "}
                  {group.sourceId} / {group.sourceRevision})
                </p>
                <p>{group.completed ? tourCopy.completed : tourCopy.open}</p>
                {!group.metadataConsistent ? (
                  <p>{tourCopy.inconsistent}</p>
                ) : null}
                <p>
                  {tourCopy.missingLegs}: {group.missingLegCount}
                </p>
                <p>
                  {tourCopy.missingBatches}: {group.missingBatchCount}
                </p>
                <p>
                  {tourCopy.missingVehicles}: {group.missingVehicleCount}
                </p>
                <ul>
                  {group.slots.map((slot) => (
                    <li
                      key={slot.key}
                      data-plan-leg-id={slot.legId}
                      data-plan-batch-id={slot.batchId}
                      data-plan-vehicle-id={slot.vehicleId}
                    >
                      <h4>
                        {slot.legLabel} / {slot.batchLabel} /{" "}
                        {slot.vehicleLabel}
                      </h4>
                      <p>
                        {slot.legId} / {slot.batchId} / {slot.vehicleId}
                      </p>
                      {slot.missing ? <p>{tourCopy.missing}</p> : null}
                      {slot.duplicate ? <p>{tourCopy.duplicate}</p> : null}
                      <ul>
                        {slot.bookings.map((booking) => (
                          <li key={booking.bookingId}>
                            <Link
                              href={partnerBookingReadHref(
                                model.entry.entrySlug,
                                "confirmed",
                                model.partnerUserRef,
                                {
                                  bookingId: booking.bookingId,
                                  orderId: booking.orderId,
                                },
                              )}
                              prefetch={false}
                            >
                              {booking.bookingId} / {booking.orderId}
                            </Link>
                            <p>
                              {booking.status} / {booking.orderStatus} ·{" "}
                              {booking.reservationWindowStart}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
            {model.travel.ungroupedTravelBookings > 0 ? (
              <p>
                {tourCopy.unknown} ({model.travel.ungroupedTravelBookings})
              </p>
            ) : null}
          </section>
        ) : null}
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
