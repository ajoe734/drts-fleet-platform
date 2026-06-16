"use client";

import Link from "next/link";
import { OPS_CALLCENTER_URL } from "@/lib/api-client";
import { formatDeskMode, localizeDeskRecord } from "@/lib/desk-catalog";
import { useTranslation } from "@/lib/i18n";
import { useConciergePortal, useSelectedDesk } from "@/lib/portal-state";

export default function HomePage() {
  const { ready, session } = useConciergePortal();
  const { t } = useTranslation();
  const desk = localizeDeskRecord(useSelectedDesk(), t);

  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="section-kicker">{t("home.eyebrow")}</span>
        <h1>{t("home.title")}</h1>
        <p>{t("home.body")}</p>
        <div className="hero-actions">
          <Link
            className="primary-link"
            href={session ? "/bookings/new" : "/login"}
          >
            {session ? t("home.primary.signedIn") : t("home.primary.signedOut")}
          </Link>
          <Link className="secondary-link" href="/lookup">
            {t("home.secondary")}
          </Link>
        </div>
      </section>

      <section className="metric-grid">
        <article className="metric-card">
          <span className="section-kicker">{t("home.metric.bootstrap")}</span>
          <strong>
            {ready && session
              ? t("home.metric.bootstrapReady")
              : t("home.metric.bootstrapPending")}
          </strong>
          <p>
            {session
              ? t("home.metric.bootstrapBody", {
                  operatorName: session.operatorName,
                  mode: formatDeskMode(session.mode, t),
                })
              : t("home.metric.bootstrapEmpty")}
          </p>
        </article>
        <article className="metric-card">
          <span className="section-kicker">{t("home.metric.desk")}</span>
          <strong>{desk ? desk.deskName : t("home.metric.deskEmpty")}</strong>
          <p>
            {desk
              ? t("home.metric.deskBody", {
                  siteName: desk.siteName,
                  zoneLabel: desk.zoneLabel,
                })
              : t("home.metric.deskEmptyBody")}
          </p>
        </article>
        <article className="metric-card">
          <span className="section-kicker">{t("home.metric.activity")}</span>
          <strong>
            {t("home.metric.activityCount", {
              count: session?.recentOrderIds.length ?? 0,
            })}
          </strong>
          <p>
            {session
              ? t("home.metric.activityBody", {
                  sessionCount: session.recentCallIds.length,
                  callbackCount: session.recentCallbackTaskIds.length,
                })
              : t("home.metric.activityEmpty")}
          </p>
        </article>
      </section>

      <section className="grid-columns">
        <article className="panel-card">
          <span className="section-kicker">{t("home.next.eyebrow")}</span>
          <h2>
            {session
              ? desk
                ? t("home.next.title.ready")
                : t("home.next.title.pickDesk")
              : t("home.next.title.signIn")}
          </h2>
          <p>{t("home.next.body")}</p>
          <div className="inline-actions">
            {!session ? (
              <Link className="primary-link" href="/login">
                {t("home.next.cta.signIn")}
              </Link>
            ) : !desk ? (
              <Link className="primary-link" href="/start">
                {t("home.next.cta.pickDesk")}
              </Link>
            ) : (
              <>
                <Link className="primary-link" href="/bookings/new">
                  {t("home.next.cta.booking")}
                </Link>
                <Link className="secondary-link" href="/callbacks">
                  {t("home.next.cta.callbacks")}
                </Link>
              </>
            )}
          </div>
        </article>

        <article className="panel-card">
          <span className="section-kicker">{t("home.seam.eyebrow")}</span>
          <h2>{t("home.seam.title")}</h2>
          <p>{t("home.seam.body")}</p>
          <div className="inline-actions">
            <a
              className="secondary-link"
              href={OPS_CALLCENTER_URL}
              rel="noreferrer"
              target="_blank"
            >
              {t("common.openOpsCallcenter")}
            </a>
            <Link className="secondary-link" href="/recording-unavailable">
              {t("common.reviewRecordingGate")}
            </Link>
          </div>
        </article>
      </section>

      <section className="grid-columns">
        <article className="info-card">
          <span className="section-kicker">{t("home.positive.eyebrow")}</span>
          <h3>{t("home.positive.title")}</h3>
          <p>{t("home.positive.body")}</p>
          <div className="inline-actions">
            <Link className="secondary-link" href="/start">
              {t("common.viewDeskCatalog")}
            </Link>
          </div>
        </article>

        <article className="info-card tone-warning">
          <span className="section-kicker">{t("home.negative.eyebrow")}</span>
          <h3>{t("home.negative.title")}</h3>
          <p>{t("home.negative.body")}</p>
          <div className="inline-actions">
            <Link className="secondary-link" href="/denied">
              {t("home.negative.denied")}
            </Link>
            <Link className="secondary-link" href="/ineligible">
              {t("home.negative.ineligible")}
            </Link>
            <Link className="secondary-link" href="/degraded">
              {t("home.negative.degraded")}
            </Link>
          </div>
        </article>
      </section>
    </div>
  );
}
