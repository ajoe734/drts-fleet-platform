import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero, SurfaceCard } from "@/components/page-primitives";
import { IssuerBrandPill, ReadOnlyPanel } from "@/components/contracts-ui";
import { formatDateTime, getContractBookingDetail } from "@/lib/contracts-data";
import { t } from "@/lib/translations";

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const booking = getContractBookingDetail(bookingId);

  if (!booking) {
    notFound();
  }

  const bookingDetail = booking;

  return (
    <div className="page-shell">
      <Link
        className="text-link"
        href={`/contracts/${bookingDetail.contractId}`}
      >
        {t("booking.detail.back")}
      </Link>

      <PageHero
        eyebrow={t("booking.detail.eyebrow")}
        title={
          <span className="pending-title">
            {bookingDetail.bookingId}
            <span className="status-chip">{t("booking.detail.readOnly")}</span>
            <IssuerBrandPill />
          </span>
        }
        description={t("booking.detail.summary")}
      />

      <ReadOnlyPanel
        title={t("booking.detail.title")}
        description={t("contracts.detail.readOnlyBody")}
      />

      <section className="surface-grid">
        <SurfaceCard
          kicker={t("booking.detail.cardholder")}
          title={bookingDetail.cardholderRefMasked}
          description={`${t("booking.detail.card")} ${bookingDetail.cardMasked}`}
        />
        <SurfaceCard
          kicker={t("booking.detail.program")}
          title={bookingDetail.programLabel}
          description={`${t("booking.detail.direction")} ${bookingDetail.directionLabel}`}
        />
        <SurfaceCard
          kicker={t("booking.detail.flight")}
          title={`${bookingDetail.flightNumber} / ${bookingDetail.terminal}`}
          description={`${t("booking.detail.dispatchState")} ${bookingDetail.dispatchStateLabel}`}
        />
      </section>

      <section className="contracts-table-card">
        <div className="contracts-detail-grid">
          <div className="contracts-detail-item">
            <span>{t("booking.detail.route")}</span>
            <strong>
              {bookingDetail.pickupLabel} → {bookingDetail.dropoffLabel}
            </strong>
          </div>
          <div className="contracts-detail-item">
            <span>{t("booking.detail.scheduledAt")}</span>
            <strong>{formatDateTime(bookingDetail.scheduledAt)}</strong>
          </div>
          <div className="contracts-detail-item">
            <span>{t("booking.detail.benefitRef")}</span>
            <strong>{bookingDetail.benefitReferenceMasked}</strong>
          </div>
          <div className="contracts-detail-item">
            <span>{t("booking.detail.issuerAuthRef")}</span>
            <strong>{bookingDetail.issuerAuthorizationRefMasked}</strong>
          </div>
        </div>
      </section>

      <section className="contracts-table-card">
        <div className="contracts-inline-header">
          <h2>{t("booking.detail.timeline")}</h2>
          <span className="status-chip">{t("booking.detail.readOnly")}</span>
        </div>

        <div className="booking-timeline">
          {bookingDetail.timeline.map((entry) => (
            <article
              className="booking-timeline-item"
              key={`${entry.label}-${entry.at}`}
            >
              <div className="booking-timeline-dot" />
              <div className="booking-timeline-body">
                <div className="contracts-inline-header">
                  <strong>{entry.label}</strong>
                  <span>{formatDateTime(entry.at)}</span>
                </div>
                <p>{entry.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
