import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { REALM_COLORS } from "@drts/ui-tokens";
import { CanvasPill } from "@drts/ui-web";
import { CalloutPanel, PageHero } from "@/components/page-primitives";
import {
  getBookingDetail,
  type BookingActorRealm,
  type BookingDirection,
  type BookingOpsLinkState,
  type BookingState,
} from "@/lib/bookings";
import { resolveBankDemoTenant, resolveLocale } from "@/lib/demo-tenants";
import { bankScopedHref } from "@/lib/issuer-projection";
import { t } from "@/lib/translations";

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

function getOpsLinkCopy(state: BookingOpsLinkState) {
  if (state === "allowed") {
    return {
      label: t("bookings.detail.opsLink.allowed"),
      hint: t("bookings.detail.opsLink.allowedHint"),
    };
  }
  if (state === "unavailable") {
    return {
      label: t("bookings.detail.opsLink.unavailable"),
      hint: t("bookings.detail.opsLink.unavailableHint"),
    };
  }
  if (state === "stale") {
    return {
      label: t("bookings.detail.opsLink.stale"),
      hint: t("bookings.detail.opsLink.staleHint"),
    };
  }
  return {
    label: t("bookings.detail.opsLink.forbidden"),
    hint: t("bookings.detail.opsLink.forbiddenHint"),
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
  const resolvedSearchParams = (await searchParams) ?? {};
  const locale = resolveLocale(resolvedSearchParams.locale);
  const tenant = resolveBankDemoTenant(resolvedSearchParams.bank);
  const issuerBrand = tenant.template.tokens.dark;
  const booking = getBookingDetail(bookingId, tenant, locale);

  if (!booking) {
    notFound();
  }

  const stepIndex = getCurrentStep(booking.state);
  const opsLinkCopy = getOpsLinkCopy(booking.opsLink.state);
  const issuerVars = {
    "--issuer-primary": issuerBrand.primary,
    "--issuer-primary-dark": issuerBrand.primaryDark,
    "--issuer-accent": issuerBrand.accent,
    "--issuer-ink": issuerBrand.ink,
    "--issuer-soft": issuerBrand.theme.accentSoft,
    "--issuer-panel": issuerBrand.theme.panel,
    "--issuer-panel-border": issuerBrand.theme.panelBorder,
  } as CSSProperties;

  return (
    <div className="page-shell bank-booking-detail-page" style={issuerVars}>
      <Link
        className="text-link"
        href={bankScopedHref("/bookings", tenant, locale)}
      >
        {t("bookings.detail.back")}
      </Link>

      <PageHero
        eyebrow={t("bookings.detail.eyebrow")}
        title={
          <span className="bank-title-block">
            {booking.orderNo}
            <CanvasPill tone={bookingPillTone[booking.state]} dot>
              {t(stateLabelKey[booking.state])}
            </CanvasPill>
          </span>
        }
        description={`${t(directionLabelKey[booking.direction])} · ${booking.flightNo} · ${booking.terminal} · ${formatDateTime(booking.scheduledAt)}`}
      />

      <section className="issuer-strip">
        <div>
          <span className="eyebrow">{t("bookings.detail.header.order")}</span>
          <strong>{booking.orderId}</strong>
        </div>
        <div>
          <span className="eyebrow">{t("bookings.detail.header.program")}</span>
          <strong>
            {booking.programLabel} · {booking.programCode}
          </strong>
        </div>
        <div>
          <span className="eyebrow">
            {t("bookings.detail.header.cardholder")}
          </span>
          <strong>{booking.cardholderRefMasked}</strong>
        </div>
      </section>

      <section className="booking-detail-topbar">
        <CalloutPanel
          title={t("bookings.detail.readonlyTitle")}
          description={t("bookings.detail.readonlyBody")}
        />

        <div className="booking-ops-card">
          <span className="surface-kicker">
            {t("bookings.detail.opsLink.kicker")}
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
          title={t("bookings.detail.notice.opsUnavailableTitle")}
          description={t("bookings.detail.notice.opsUnavailableBody")}
        />
      ) : null}

      {booking.opsLink.state === "stale" ? (
        <CalloutPanel
          tone="warning"
          title={t("bookings.detail.notice.opsStaleTitle")}
          description={t("bookings.detail.notice.opsStaleBody")}
        />
      ) : null}

      {booking.driverEligibilityNote ? (
        <CalloutPanel
          tone="warning"
          title={t("bookings.detail.notice.driverTitle")}
          description={booking.driverEligibilityNote}
        />
      ) : null}

      <section className="booking-detail-layout">
        <div className="booking-detail-stack">
          <article className="surface-card bookings-detail-card">
            <div className="bank-section-head">
              <div>
                <span className="surface-kicker">
                  {t("bookings.detail.timeline.kicker")}
                </span>
                <h3>{t("bookings.detail.timeline.title")}</h3>
                <p>{t("bookings.detail.timeline.description")}</p>
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
                      ? t("bookings.detail.timeline.cancelled")
                      : t(key)}
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
                          {t("bookings.detail.timeline.current")}
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
                  {t("bookings.detail.airport.kicker")}
                </span>
                <h3>{t("bookings.detail.airport.title")}</h3>
              </div>
            </div>

            <dl className="booking-meta-grid">
              <div className="booking-meta-item">
                <dt>{t("bookings.detail.airport.direction")}</dt>
                <dd>{t(directionLabelKey[booking.direction])}</dd>
              </div>
              <div className="booking-meta-item">
                <dt>{t("bookings.detail.airport.flight")}</dt>
                <dd>{booking.flightNo}</dd>
              </div>
              <div className="booking-meta-item">
                <dt>{t("bookings.detail.airport.terminal")}</dt>
                <dd>{booking.terminal}</dd>
              </div>
              <div className="booking-meta-item">
                <dt>{t("bookings.detail.airport.tolerance")}</dt>
                <dd>{booking.flightDelayToleranceLabel}</dd>
              </div>
              <div className="booking-meta-item">
                <dt>{t("bookings.detail.airport.pickup")}</dt>
                <dd>{booking.pickupLabel}</dd>
              </div>
              <div className="booking-meta-item">
                <dt>{t("bookings.detail.airport.dropoff")}</dt>
                <dd>{booking.dropoffLabel}</dd>
              </div>
              <div className="booking-meta-item">
                <dt>{t("bookings.detail.airport.window")}</dt>
                <dd>{formatDateTime(booking.scheduledAt)}</dd>
              </div>
              <div className="booking-meta-item">
                <dt>{t("bookings.detail.airport.greeting")}</dt>
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
                  {t("bookings.detail.header.kicker")}
                </span>
                <h3>{t("bookings.detail.header.title")}</h3>
              </div>
            </div>

            <dl className="booking-summary-list">
              <div className="booking-summary-item">
                <dt>{t("bookings.detail.header.order")}</dt>
                <dd>{booking.orderId}</dd>
              </div>
              <div className="booking-summary-item">
                <dt>{t("bookings.detail.header.program")}</dt>
                <dd>
                  {booking.programLabel} · {booking.programCode}
                </dd>
              </div>
              <div className="booking-summary-item">
                <dt>{t("bookings.detail.header.cardholder")}</dt>
                <dd>{booking.cardholderRefMasked}</dd>
              </div>
              <div className="booking-summary-item">
                <dt>{t("bookings.detail.header.state")}</dt>
                <dd>
                  <CanvasPill tone={bookingPillTone[booking.state]} dot>
                    {t(stateLabelKey[booking.state])}
                  </CanvasPill>
                </dd>
              </div>
            </dl>
          </article>

          <article className="surface-card bookings-detail-card bookings-benefit-card">
            <div className="bank-section-head">
              <div>
                <span className="surface-kicker">
                  {t("bookings.detail.benefit.kicker")}
                </span>
                <h3>{t("bookings.detail.benefit.title")}</h3>
              </div>
            </div>

            <dl className="booking-summary-list">
              <div className="booking-summary-item">
                <dt>{t("bookings.detail.benefit.program")}</dt>
                <dd>
                  {booking.programLabel} · {booking.programCode}
                </dd>
              </div>
              <div className="booking-summary-item">
                <dt>{t("bookings.detail.benefit.benefitRef")}</dt>
                <dd>{booking.benefitReferenceMasked}</dd>
              </div>
              <div className="booking-summary-item">
                <dt>{t("bookings.detail.benefit.authRef")}</dt>
                <dd>{booking.authorizationReferenceMasked}</dd>
              </div>
            </dl>

            <div className="booking-impact-banner">
              <strong>{t("bookings.detail.benefit.quotaImpact")}</strong>
              <span>
                {booking.quotaImpactLabel} · {booking.quotaPolicyLabel}
              </span>
            </div>
          </article>

          <article className="surface-card bookings-detail-card">
            <div className="bank-section-head">
              <div>
                <span className="surface-kicker">
                  {t("bookings.detail.fulfilment.kicker")}
                </span>
                <h3>{t("bookings.detail.fulfilment.title")}</h3>
              </div>
            </div>

            <dl className="booking-summary-list">
              <div className="booking-summary-item">
                <dt>{t("bookings.detail.fulfilment.driver")}</dt>
                <dd>{booking.driverReferenceMasked}</dd>
              </div>
              <div className="booking-summary-item">
                <dt>{t("bookings.detail.fulfilment.vehicle")}</dt>
                <dd>{booking.vehicleReferenceMasked}</dd>
              </div>
            </dl>
          </article>

          <article className="surface-card bookings-detail-card">
            <div className="bank-section-head">
              <div>
                <span className="surface-kicker">
                  {t("bookings.detail.constraints.kicker")}
                </span>
                <h3>{t("bookings.detail.constraints.title")}</h3>
              </div>
            </div>
            <p>{t("bookings.detail.constraints.body")}</p>
          </article>
        </div>
      </section>
    </div>
  );
}
