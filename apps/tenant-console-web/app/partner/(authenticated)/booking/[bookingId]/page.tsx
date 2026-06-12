import Link from "next/link";
import { notFound } from "next/navigation";
import type { BookingRecord } from "@drts/contracts";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import {
  buildPartnerClient,
  requirePartnerSession,
} from "@/lib/partner-session";
import { getServerLocale } from "@/lib/server-locale";
import { type Locale, t } from "@/lib/translations";

export const dynamic = "force-dynamic";

function formatDateTime(value: string | null, locale: Locale): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(locale === "zh" ? "zh-TW" : "en-US");
}

export default async function PartnerBookingConfirmationPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const session = await requirePartnerSession();
  const locale = await getServerLocale();
  const client = buildPartnerClient(session);

  let booking: BookingRecord;
  try {
    booking = (await client.getTenantBooking(bookingId)) as BookingRecord;
  } catch {
    notFound();
  }

  const isPartnerBooking =
    booking.businessDispatchSubtype ===
    session.partnerEntry.businessDispatchSubtype;

  return (
    <div className="page-shell">
      <PageHero
        eyebrow={t("partner.bookingConfirm.hero.eyebrow", locale)}
        title={t("partner.bookingConfirm.hero.title", locale, {
          bookingId: booking.bookingId,
        })}
        description={t("partner.bookingConfirm.hero.description", locale)}
      />

      <SurfaceCard
        kicker={t("partner.bookingConfirm.identity.kicker", locale)}
        title={t("partner.bookingConfirm.identity.title", locale)}
        description={t("partner.bookingConfirm.identity.description", locale)}
      >
        <dl className="definition-grid">
          <div>
            <dt>{t("partner.bookingConfirm.field.bookingId", locale)}</dt>
            <dd>
              <code>{booking.bookingId}</code>
            </dd>
          </div>
          <div>
            <dt>{t("partner.bookingConfirm.field.orderId", locale)}</dt>
            <dd>
              <code>{booking.orderId}</code>
            </dd>
          </div>
          <div>
            <dt>{t("partner.bookingConfirm.field.status", locale)}</dt>
            <dd>
              <span className="status-badge">{booking.orderStatus}</span>
            </dd>
          </div>
          <div>
            <dt>{t("partner.bookingConfirm.field.subtype", locale)}</dt>
            <dd>
              <code>{booking.businessDispatchSubtype}</code>
              {!isPartnerBooking ? (
                <span className="status-chip is-warning">
                  {t("partner.bookingConfirm.subtypeMismatch", locale)}
                </span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>{t("partner.bookingConfirm.field.window", locale)}</dt>
            <dd>
              {formatDateTime(booking.reservationWindowStart, locale)} →{" "}
              {formatDateTime(booking.reservationWindowEnd, locale)}
            </dd>
          </div>
          <div>
            <dt>{t("partner.bookingConfirm.field.pickup", locale)}</dt>
            <dd>{booking.pickup.address}</dd>
          </div>
          <div>
            <dt>{t("partner.bookingConfirm.field.dropoff", locale)}</dt>
            <dd>{booking.dropoff.address}</dd>
          </div>
          <div>
            <dt>{t("partner.bookingConfirm.field.passenger", locale)}</dt>
            <dd>
              {booking.passenger.name}
              <span className="table-secondary">
                {" "}
                · {booking.passenger.phone}
              </span>
            </dd>
          </div>
        </dl>
      </SurfaceCard>

      <CalloutPanel
        title={t("partner.bookingConfirm.callout.title", locale)}
        description={t("partner.bookingConfirm.callout.description", locale)}
      >
        <ul className="panel-list">
          <li>
            {t("partner.bookingConfirm.callout.showConfirmation", locale)}
          </li>
          <li>{t("partner.bookingConfirm.callout.noEdit", locale)}</li>
          <li>{t("partner.bookingConfirm.callout.contact", locale)}</li>
        </ul>
        <div className="link-row">
          <Link className="text-link" href="/partner/booking/new">
            {t("partner.bookingConfirm.createAnother", locale)}
          </Link>
          <Link className="text-link" href="/partner/start">
            {t("partner.bookingConfirm.backWorkspace", locale)}
          </Link>
        </div>
      </CalloutPanel>
    </div>
  );
}
