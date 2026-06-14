import Link from "next/link";
import { notFound } from "next/navigation";
import type { BookingRecord, TenantInvoiceRecord } from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { BookingCommandPanel } from "@/components/booking-command-panel";
import { getTenantClient } from "@/lib/api-client";
import { getTenantRoleSnapshot } from "@/lib/rbac";
import {
  buildBookingTimeline,
  describeManualFareOverride,
  findInvoicesForOrder,
  formatDateTime,
  formatMoney,
  summarizeComplianceGates,
} from "@/lib/booking-domain";
import {
  getBookingSourceVisibility,
  getSourceToneClassName,
} from "@/lib/source-domain";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const locale = await getServerLocale();
  const client = await getTenantClient();
  const roleSnapshot = await getTenantRoleSnapshot();
  const { orderId: bookingId } = await params;

  const [bookingResult, invoicesResult] = await Promise.allSettled([
    client.getTenantBooking(bookingId) as Promise<BookingRecord>,
    client.listInvoices(),
  ]);

  if (bookingResult.status === "rejected") {
    notFound();
  }

  const booking = bookingResult.value;
  const source = getBookingSourceVisibility(booking, locale);
  const timeline = buildBookingTimeline(booking, locale);
  const relatedInvoices: TenantInvoiceRecord[] =
    invoicesResult.status === "fulfilled"
      ? findInvoicesForOrder(invoicesResult.value, booking.orderId)
      : [];
  const invoiceWarning =
    invoicesResult.status === "rejected"
      ? invoicesResult.reason instanceof Error
        ? invoicesResult.reason.message
        : t("bookingList.detail.invoiceUnavailable", locale)
      : null;

  return (
    <main className="app-grid">
      <AppShellCard
        title={t("bookingList.detail.title", locale, {
          bookingId: booking.bookingId,
        })}
        description={t("bookingList.detail.description", locale)}
      >
        <section className="surface-grid surface-grid-wide">
          <article className="surface-card">
            <span className="surface-kicker">{t("bookingList.detail.overview.kicker", locale)}</span>
            <h3>{t("bookingList.detail.overview.heading", locale)}</h3>
            <p>{t("bookingList.detail.overview.body", locale)}</p>
            <div className="chip-row">
              <span className={`status-badge status-${booking.orderStatus}`}>
                {booking.orderStatus}
              </span>
              <span className="status-chip">
                {t("bookingList.cell.booking", locale, {
                  status: booking.status,
                })}
              </span>
              <span className={getSourceToneClassName(source.tone)}>
                {source.badge}
              </span>
            </div>
            <dl className="definition-grid">
              <div>
                <dt>{t("bookingList.detail.orderId", locale)}</dt>
                <dd>{booking.orderId}</dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.serviceBucket", locale)}</dt>
                <dd>{booking.serviceBucket}</dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.dispatchSubtype", locale)}</dt>
                <dd>{booking.businessDispatchSubtype}</dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.bookingType", locale)}</dt>
                <dd>{booking.bookingType}</dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.fulfillmentPath", locale)}</dt>
                <dd>{source.summary}</dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.authorityOwner", locale)}</dt>
                <dd>{source.badge}</dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.created", locale)}</dt>
                <dd>{formatDateTime(booking.createdAt, locale)}</dd>
              </div>
            </dl>
            <p className="source-note">{source.detail}</p>
            {source.domain === "forwarded_authority" ? (
              <article className="callout-panel is-warning">
                <strong>{t("bookingList.detail.forwardedBoundary", locale)}</strong>
                <p>{source.statusBoundary}</p>
                <p>{source.escalationHint}</p>
              </article>
            ) : null}
          </article>

          <article className="surface-card">
            <span className="surface-kicker">{t("bookingList.detail.timeline.kicker", locale)}</span>
            <h3>{t("bookingList.detail.timeline.heading", locale)}</h3>
            <p>{t("bookingList.detail.timeline.body", locale)}</p>
            <ol className="booking-timeline">
              {timeline.map((point) => (
                <li className="booking-timeline-item" key={point.key}>
                  <strong>{point.label}</strong>
                  <span>
                    {point.at
                      ? formatDateTime(point.at, locale)
                      : t("bookingList.detail.notPublished", locale)}
                  </span>
                  <p className="muted-copy">{point.detail}</p>
                </li>
              ))}
            </ol>
          </article>
        </section>

        <section className="surface-grid surface-grid-wide">
          <article className="surface-card">
            <span className="surface-kicker">{t("bookingList.detail.passengerRoute.kicker", locale)}</span>
            <h3>{t("bookingList.detail.passengerRoute.heading", locale)}</h3>
            <p>{t("bookingList.detail.passengerRoute.body", locale)}</p>
            <dl className="definition-grid">
              <div>
                <dt>{t("bookingList.detail.passenger", locale)}</dt>
                <dd>{booking.passenger.name}</dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.phone", locale)}</dt>
                <dd>
                  {booking.passenger.phone ||
                    t("bookingList.value.notProvided", locale)}
                </dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.pickup", locale)}</dt>
                <dd>{booking.pickup.address}</dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.dropoff", locale)}</dt>
                <dd>{booking.dropoff.address}</dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.windowStart", locale)}</dt>
                <dd>{formatDateTime(booking.reservationWindowStart, locale)}</dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.windowEnd", locale)}</dt>
                <dd>{formatDateTime(booking.reservationWindowEnd, locale)}</dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.direction", locale)}</dt>
                <dd>
                  {booking.direction ??
                    t("bookingList.value.notSpecified", locale)}
                </dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.recurrence", locale)}</dt>
                <dd>
                  {booking.recurrenceRule ??
                    t("bookingList.value.singleTrip", locale)}
                </dd>
              </div>
            </dl>
          </article>

          <article className="surface-card">
            <span className="surface-kicker">{t("bookingList.detail.fulfillment.kicker", locale)}</span>
            <h3>{t("bookingList.detail.fulfillment.heading", locale)}</h3>
            <p>{t("bookingList.detail.fulfillment.body", locale)}</p>
            <dl className="definition-grid">
              <div>
                <dt>{t("bookingList.detail.sourceDomain", locale)}</dt>
                <dd>{source.badge}</dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.partnerProgram", locale)}</dt>
                <dd>
                  {booking.partnerProgramId ??
                    t("bookingList.value.notApplicable", locale)}
                </dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.partnerEntry", locale)}</dt>
                <dd>
                  {booking.partnerEntrySlug ??
                    t("bookingList.value.notApplicable", locale)}
                </dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.eligibility", locale)}</dt>
                <dd>
                  {booking.eligibilityVerificationId ??
                    t("bookingList.value.notApplicable", locale)}
                </dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.issuerAuthorization", locale)}</dt>
                <dd>
                  {booking.issuerAuthorizationRef ??
                    t("bookingList.value.notApplicable", locale)}
                </dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.compliance", locale)}</dt>
                <dd>{summarizeComplianceGates(booking.complianceGates, locale)}</dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.financeAuthority", locale)}</dt>
                <dd>{source.financeAuthority}</dd>
              </div>
            </dl>
            <p className="muted-copy">
              {t("bookingList.detail.fulfillment.note", locale)}
            </p>
          </article>
        </section>

        <section className="surface-grid surface-grid-wide">
          <article className="surface-card">
            <span className="surface-kicker">{t("bookingList.detail.fareInvoice.kicker", locale)}</span>
            <h3>{t("bookingList.detail.fareInvoice.heading", locale)}</h3>
            <p>{t("bookingList.detail.fareInvoice.body", locale)}</p>
            <dl className="definition-grid">
              <div>
                <dt>{t("bookingList.detail.quotedFare", locale)}</dt>
                <dd>{formatMoney(booking.quotedFare, locale)}</dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.fareSource", locale)}</dt>
                <dd>
                  {booking.quotedFareSource ??
                    t("bookingList.value.notPublished", locale)}
                </dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.pricingVersion", locale)}</dt>
                <dd>
                  {booking.quotedFareRuleVersion ??
                    t("bookingList.value.notPublished", locale)}
                </dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.manualOverride", locale)}</dt>
                <dd>
                  {describeManualFareOverride(booking.manualFareOverride, locale)}
                </dd>
              </div>
            </dl>
            {invoiceWarning ? (
              <p className="muted-copy">
                {t("bookingList.detail.invoiceWarning", locale, {
                  message: invoiceWarning,
                })}
              </p>
            ) : null}
            {relatedInvoices.length > 0 ? (
              <ul className="panel-list">
                {relatedInvoices.map((invoice) => (
                  <li key={invoice.invoiceId}>
                    <strong>{invoice.invoiceId}</strong>
                    <span className="list-note">
                      {invoice.status} · {formatMoney(invoice.amount, locale)} ·{" "}
                      {t("bookingList.detail.invoicePeriod", locale, {
                        start: formatDateTime(invoice.periodStart, locale),
                        end: formatDateTime(invoice.periodEnd, locale),
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : invoiceWarning ? null : (
              <p className="muted-copy">
                {t("bookingList.detail.noInvoiceLinked", locale)}
              </p>
            )}
          </article>

          <article className="surface-card">
            <span className="surface-kicker">{t("bookingList.detail.businessContext.kicker", locale)}</span>
            <h3>{t("bookingList.detail.businessContext.heading", locale)}</h3>
            <p>{t("bookingList.detail.businessContext.body", locale)}</p>
            <dl className="definition-grid">
              <div>
                <dt>{t("bookingList.detail.costCenter", locale)}</dt>
                <dd>
                  {booking.costCenter ??
                    t("bookingList.value.notProvided", locale)}
                </dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.vehiclePreference", locale)}</dt>
                <dd>
                  {booking.vehiclePreference ??
                    t("bookingList.value.notProvided", locale)}
                </dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.benefitReference", locale)}</dt>
                <dd>
                  {booking.benefitReference ??
                    t("bookingList.value.notProvided", locale)}
                </dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.flight", locale)}</dt>
                <dd>
                  {booking.flightNo ??
                    t("bookingList.value.notProvided", locale)}
                </dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.terminal", locale)}</dt>
                <dd>
                  {booking.terminal ??
                    t("bookingList.value.notProvided", locale)}
                </dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.luggage", locale)}</dt>
                <dd>
                  {booking.luggageCount == null
                    ? t("bookingList.value.notProvided", locale)
                    : t("bookingList.value.luggageBags", locale, {
                        count: booking.luggageCount,
                      })}
                </dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.bookedBy", locale)}</dt>
                <dd>
                  {booking.bookedBy
                    ? `${booking.bookedBy.name} · ${booking.bookedBy.email}`
                    : t("bookingList.value.notProvided", locale)}
                </dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.onsiteContact", locale)}</dt>
                <dd>
                  {booking.onsiteContact
                    ? `${booking.onsiteContact.name} · ${booking.onsiteContact.phone}`
                    : t("bookingList.value.notProvided", locale)}
                </dd>
              </div>
              <div>
                <dt>{t("bookingList.detail.notes", locale)}</dt>
                <dd>
                  {booking.notes ??
                    t("bookingList.value.notProvided", locale)}
                </dd>
              </div>
            </dl>
          </article>
        </section>

        <article className="surface-card">
          <span className="surface-kicker">{t("bookingList.detail.allowedActions.kicker", locale)}</span>
          <h3>{t("bookingList.detail.allowedActions.heading", locale)}</h3>
          <p>
            {t("bookingList.detail.allowedActions.bodyPrefix", locale)}
            <code> PUT /api/tenant/bookings/:bookingId </code>
            {t("bookingList.detail.allowedActions.bodyMiddle", locale)}
            <code> POST /api/tenant/bookings/:bookingId/cancel </code>
            {t("bookingList.detail.allowedActions.bodySuffix", locale)}
          </p>
          <BookingCommandPanel
            booking={booking}
            allowMutations={roleSnapshot.capabilities.canWriteTenant}
          />
        </article>

        <section className="callout-panel">
          <strong>{t("bookingList.authority.title", locale)}</strong>
          <p>{t("bookingList.detail.authority.body", locale)}</p>
        </section>

        <Link className="route-link" href="/booking-list">
          <strong>{t("bookingList.detail.backToList.title", locale)}</strong>
          {t("bookingList.detail.backToList.body", locale)}
        </Link>
      </AppShellCard>
    </main>
  );
}
