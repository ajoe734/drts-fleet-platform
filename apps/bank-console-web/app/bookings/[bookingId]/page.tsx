import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { REALM_COLORS } from "@drts/ui-tokens";
import { CanvasPill } from "@drts/ui-web";
import { CalloutPanel, PageHero } from "@/components/page-primitives";
import { resolveBankDemoTenant, resolveLocale } from "@/lib/demo-tenants";
import { loadBankBookingsData } from "@/lib/bank-dev-read-models";
import { bankConsoleHref, getBankConsoleSession } from "@/lib/session";
import { tenantDisplayText, tenantIssuerVars } from "@/lib/tenant-display";
import {
  type BookingActorRealm,
  type BookingDirection,
  type BookingOpsLinkState,
  type BookingState,
} from "@/lib/bookings";
import { t, type Locale } from "@/lib/translations";

const bookingPillTone: Record<
  BookingState,
  "info" | "warn" | "success" | "danger"
> = {
  assigned: "info",
  en_route: "warn",
  completed: "success",
  cancelled: "danger",
};

const directionLabelKey: Record<
  BookingDirection,
  "bookings.direction.outbound" | "bookings.direction.inbound"
> = {
  outbound: "bookings.direction.outbound",
  inbound: "bookings.direction.inbound",
};

const stateLabelKey: Record<
  BookingState,
  | "bookings.state.assigned"
  | "bookings.state.en_route"
  | "bookings.state.completed"
  | "bookings.state.cancelled"
> = {
  assigned: "bookings.state.assigned",
  en_route: "bookings.state.en_route",
  completed: "bookings.state.completed",
  cancelled: "bookings.state.cancelled",
};

const timelineStepKeys = [
  "bookings.detail.timeline.created",
  "bookings.detail.timeline.approved",
  "bookings.detail.timeline.assigned",
  "bookings.detail.timeline.enRoute",
  "bookings.detail.timeline.done",
] as const;

function formatDateTime(value: string) {
  const date = new Date(value);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function getCurrentStep(state: BookingState) {
  if (state === "assigned") {
    return 2;
  }
  if (state === "en_route") {
    return 3;
  }
  return 4;
}

function getOpsLinkCopy(state: BookingOpsLinkState, locale: Locale) {
  if (state === "allowed") {
    return {
      label: t("bookings.detail.opsLink.allowed", locale),
      hint: t("bookings.detail.opsLink.allowedHint", locale),
    };
  }
  if (state === "unavailable") {
    return {
      label: t("bookings.detail.opsLink.unavailable", locale),
      hint: t("bookings.detail.opsLink.unavailableHint", locale),
    };
  }
  if (state === "stale") {
    return {
      label: t("bookings.detail.opsLink.stale", locale),
      hint: t("bookings.detail.opsLink.staleHint", locale),
    };
  }
  return {
    label: t("bookings.detail.opsLink.forbidden", locale),
    hint: t("bookings.detail.opsLink.forbiddenHint", locale),
  };
}

function RealmChip({
  realm,
  label,
}: {
  realm: BookingActorRealm;
  label: string;
}) {
  const colors = REALM_COLORS[realm].dark;

  return (
    <span
      className="booking-realm-chip"
      style={{
        color: colors.fg,
        background: colors.bg,
        borderColor: colors.border,
      }}
    >
      {label}
    </span>
  );
}

export default async function BookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { bookingId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const locale = resolveLocale(resolvedSearchParams.locale);
  const tenant = resolveBankDemoTenant(resolvedSearchParams.bank);
  const session = getBankConsoleSession(
    tenant,
    locale,
    resolvedSearchParams.role,
  );
  const bookingData = await loadBankBookingsData(tenant.tenantId, session.role);
  const booking = bookingData.data.detailById.get(bookingId);

  if (!booking) {
    notFound();
  }

  const stepIndex = getCurrentStep(booking.state);
  const opsLinkCopy = getOpsLinkCopy(booking.opsLink.state, locale);
  const issuerVars = tenantIssuerVars(tenant) as CSSProperties;

  return (
    <div className="page-shell bank-booking-detail-page" style={issuerVars}>
      <Link
        className="text-link"
        href={bankConsoleHref("/bookings", tenant, locale, session.role)}
      >
        {t("bookings.detail.back", locale)}
      </Link>

      <PageHero
        eyebrow={t("bookings.detail.eyebrow", locale)}
        title={
          <span className="bank-title-block">
            {booking.orderNo}
            <CanvasPill tone={bookingPillTone[booking.state]} dot>
              {t(stateLabelKey[booking.state], locale)}
            </CanvasPill>
          </span>
        }
        description={`${t(directionLabelKey[booking.direction], locale)} · ${booking.flightNo} · ${booking.terminal} · ${formatDateTime(booking.scheduledAt)}`}
      />

      <section className="issuer-strip">
        <div>
          <span className="eyebrow">
            {t("bookings.detail.header.order", locale)}
          </span>
          <strong>{tenantDisplayText(booking.orderId, tenant)}</strong>
        </div>
        <div>
          <span className="eyebrow">
            {t("bookings.detail.header.program", locale)}
          </span>
          <strong>
            {tenantDisplayText(booking.programLabel, tenant)} ·{" "}
            {tenantDisplayText(booking.programCode, tenant)}
          </strong>
        </div>
        <div>
          <span className="eyebrow">
            {t("bookings.detail.header.cardholder", locale)}
          </span>
          <strong>{booking.cardholderRefMasked}</strong>
        </div>
      </section>

      <section className="booking-detail-topbar">
        <CalloutPanel
          title={t("bookings.detail.readonlyTitle", locale)}
          description={t("bookings.detail.readonlyBody", locale)}
        />
        {bookingData.degradedMessage ? (
          <CalloutPanel
            title="API degraded"
            description={bookingData.degradedMessage}
            tone="warning"
          />
        ) : null}

        <div className="booking-ops-card">
          <span className="surface-kicker">
            {t("bookings.detail.opsLink.kicker", locale)}
          </span>
          {booking.opsLink.state === "allowed" ? (
            <Link className="ops-link-button" href={booking.opsLink.href}>
              {opsLinkCopy.label}
            </Link>
          ) : (
            <button
              className="ops-link-button is-disabled"
              disabled
              type="button"
            >
              {opsLinkCopy.label}
            </button>
          )}
          <p>{opsLinkCopy.hint}</p>
        </div>
      </section>

      {booking.opsLink.state === "unavailable" ? (
        <CalloutPanel
          tone="warning"
          title={t("bookings.detail.notice.opsUnavailableTitle", locale)}
          description={t("bookings.detail.notice.opsUnavailableBody", locale)}
        />
      ) : null}

      {booking.opsLink.state === "stale" ? (
        <CalloutPanel
          tone="warning"
          title={t("bookings.detail.notice.opsStaleTitle", locale)}
          description={t("bookings.detail.notice.opsStaleBody", locale)}
        />
      ) : null}

      {booking.driverEligibilityNote ? (
        <CalloutPanel
          tone="warning"
          title={t("bookings.detail.notice.driverTitle", locale)}
          description={booking.driverEligibilityNote}
        />
      ) : null}

      <section className="booking-detail-layout">
        <div className="booking-detail-stack">
          <article className="surface-card bookings-detail-card">
            <div className="bank-section-head">
              <div>
                <span className="surface-kicker">
                  {t("bookings.detail.timeline.kicker", locale)}
                </span>
                <h3>{t("bookings.detail.timeline.title", locale)}</h3>
                <p>{t("bookings.detail.timeline.description", locale)}</p>
              </div>
            </div>

            <div className="booking-stage-strip">
              {timelineStepKeys.map((key, index) => {
                const isCurrent = index === stepIndex;
                const isCompleted = index < stepIndex;
                const isFinalCancelled =
                  booking.state === "cancelled" && index === stepIndex;

                return (
                  <span
                    className={`booking-stage-pill${isCurrent ? " is-current" : ""}${isCompleted ? " is-completed" : ""}${isFinalCancelled ? " is-danger" : ""}`}
                    key={key}
                  >
                    {index === 4 && booking.state === "cancelled"
                      ? t("bookings.detail.timeline.cancelled", locale)
                      : t(key, locale)}
                  </span>
                );
              })}
            </div>

            <div className="booking-timeline">
              {booking.timeline.map((event) => (
                <div className="booking-timeline-item" key={event.occurredAt}>
                  <span className="booking-timeline-dot" />
                  <div className="booking-timeline-body">
                    <div className="booking-timeline-row">
                      <strong>{event.title}</strong>
                      <span>{formatDateTime(event.occurredAt)}</span>
                    </div>
                    <div className="booking-timeline-row booking-timeline-row--meta">
                      <RealmChip realm={event.actorRealm} label={event.actor} />
                      {event.current ? (
                        <span className="booking-current-flag">
                          {t("bookings.detail.timeline.current", locale)}
                        </span>
                      ) : null}
                    </div>
                    <p>{event.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="surface-card bookings-detail-card">
            <div className="bank-section-head">
              <div>
                <span className="surface-kicker">
                  {t("bookings.detail.airport.kicker", locale)}
                </span>
                <h3>{t("bookings.detail.airport.title", locale)}</h3>
              </div>
            </div>

            <dl className="booking-meta-grid">
              <div className="booking-meta-item">
                <dt>{t("bookings.detail.airport.direction", locale)}</dt>
                <dd>{t(directionLabelKey[booking.direction], locale)}</dd>
              </div>
              <div className="booking-meta-item">
                <dt>{t("bookings.detail.airport.flight", locale)}</dt>
                <dd>{booking.flightNo}</dd>
              </div>
              <div className="booking-meta-item">
                <dt>{t("bookings.detail.airport.terminal", locale)}</dt>
                <dd>{booking.terminal}</dd>
              </div>
              <div className="booking-meta-item">
                <dt>{t("bookings.detail.airport.tolerance", locale)}</dt>
                <dd>{booking.flightDelayToleranceLabel}</dd>
              </div>
              <div className="booking-meta-item">
                <dt>{t("bookings.detail.airport.pickup", locale)}</dt>
                <dd>{booking.pickupLabel}</dd>
              </div>
              <div className="booking-meta-item">
                <dt>{t("bookings.detail.airport.dropoff", locale)}</dt>
                <dd>{booking.dropoffLabel}</dd>
              </div>
              <div className="booking-meta-item">
                <dt>{t("bookings.detail.airport.window", locale)}</dt>
                <dd>{formatDateTime(booking.scheduledAt)}</dd>
              </div>
              <div className="booking-meta-item">
                <dt>{t("bookings.detail.airport.greeting", locale)}</dt>
                <dd>{booking.greetingLabel}</dd>
              </div>
            </dl>
          </article>
        </div>

        <div className="booking-detail-stack">
          <article className="surface-card bookings-detail-card">
            <div className="bank-section-head">
              <div>
                <span className="surface-kicker">
                  {t("bookings.detail.header.kicker", locale)}
                </span>
                <h3>{t("bookings.detail.header.title", locale)}</h3>
              </div>
            </div>

            <dl className="booking-summary-list">
              <div className="booking-summary-item">
                <dt>{t("bookings.detail.header.order", locale)}</dt>
                <dd>{tenantDisplayText(booking.orderId, tenant)}</dd>
              </div>
              <div className="booking-summary-item">
                <dt>{t("bookings.detail.header.program", locale)}</dt>
                <dd>
                  {tenantDisplayText(booking.programLabel, tenant)} ·{" "}
                  {tenantDisplayText(booking.programCode, tenant)}
                </dd>
              </div>
              <div className="booking-summary-item">
                <dt>{t("bookings.detail.header.cardholder", locale)}</dt>
                <dd>{booking.cardholderRefMasked}</dd>
              </div>
              <div className="booking-summary-item">
                <dt>{t("bookings.detail.header.state", locale)}</dt>
                <dd>
                  <CanvasPill tone={bookingPillTone[booking.state]} dot>
                    {t(stateLabelKey[booking.state], locale)}
                  </CanvasPill>
                </dd>
              </div>
            </dl>
          </article>

          <article className="surface-card bookings-detail-card bookings-benefit-card">
            <div className="bank-section-head">
              <div>
                <span className="surface-kicker">
                  {t("bookings.detail.benefit.kicker", locale)}
                </span>
                <h3>{t("bookings.detail.benefit.title", locale)}</h3>
              </div>
            </div>

            <dl className="booking-summary-list">
              <div className="booking-summary-item">
                <dt>{t("bookings.detail.benefit.program", locale)}</dt>
                <dd>
                  {tenantDisplayText(booking.programLabel, tenant)} ·{" "}
                  {tenantDisplayText(booking.programCode, tenant)}
                </dd>
              </div>
              <div className="booking-summary-item">
                <dt>{t("bookings.detail.benefit.benefitRef", locale)}</dt>
                <dd>{booking.benefitReferenceMasked}</dd>
              </div>
              <div className="booking-summary-item">
                <dt>{t("bookings.detail.benefit.authRef", locale)}</dt>
                <dd>{booking.authorizationReferenceMasked}</dd>
              </div>
            </dl>

            <div className="booking-impact-banner">
              <strong>
                {t("bookings.detail.benefit.quotaImpact", locale)}
              </strong>
              <span>
                {booking.quotaImpactLabel} · {booking.quotaPolicyLabel}
              </span>
            </div>
          </article>

          <article className="surface-card bookings-detail-card">
            <div className="bank-section-head">
              <div>
                <span className="surface-kicker">
                  {t("bookings.detail.fulfilment.kicker", locale)}
                </span>
                <h3>{t("bookings.detail.fulfilment.title", locale)}</h3>
              </div>
            </div>

            <dl className="booking-summary-list">
              <div className="booking-summary-item">
                <dt>{t("bookings.detail.fulfilment.driver", locale)}</dt>
                <dd>{booking.driverReferenceMasked}</dd>
              </div>
              <div className="booking-summary-item">
                <dt>{t("bookings.detail.fulfilment.vehicle", locale)}</dt>
                <dd>{booking.vehicleReferenceMasked}</dd>
              </div>
            </dl>
          </article>

          <article className="surface-card bookings-detail-card">
            <div className="bank-section-head">
              <div>
                <span className="surface-kicker">
                  {t("bookings.detail.constraints.kicker", locale)}
                </span>
                <h3>{t("bookings.detail.constraints.title", locale)}</h3>
              </div>
            </div>
            <p>{t("bookings.detail.constraints.body", locale)}</p>
          </article>
        </div>
      </section>
    </div>
  );
}
