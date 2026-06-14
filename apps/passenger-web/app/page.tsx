"use client";

import Link from "next/link";
import { FlowRouteCards } from "@/components/flow-route-cards";
import { useTranslation } from "@/lib/i18n";
import { getBookingFlowRoutes, getTripFlowRoutes } from "@/lib/navigation";

export default function HomePage() {
  const { locale, t } = useTranslation();
  const bookingFlowRoutes = getBookingFlowRoutes(locale);
  const tripFlowRoutes = getTripFlowRoutes(locale);
  const statusLanes = [
    {
      title: t("home.lane.current.title"),
      body: t("home.lane.current.body"),
    },
    {
      title: t("home.lane.history.title"),
      body: t("home.lane.history.body"),
    },
    {
      title: t("home.lane.negative.title"),
      body: t("home.lane.negative.body"),
    },
  ];

  return (
    <div className="page-shell">
      <section className="hero-card hero-gradient">
        <span className="eyebrow">{t("home.eyebrow")}</span>
        <h1>{t("home.title")}</h1>
        <p>{t("home.body")}</p>
        <div className="hero-actions">
          <Link className="primary-link" href="/book">
            {t("home.cta.book")}
          </Link>
          <Link className="secondary-link" href="/trip">
            {t("home.cta.trip")}
          </Link>
          <Link className="text-link" href="/trips">
            {t("home.cta.history")}
          </Link>
        </div>
      </section>

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">{t("home.metric.trip")}</span>
          <strong>{t("home.metric.status")}</strong>
          <p>{t("home.metric.ride")}</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">{t("home.metric.eta")}</span>
          <strong>{t("home.metric.etaValue")}</strong>
          <p>{t("home.metric.etaNote")}</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">{t("home.metric.next")}</span>
          <strong>{t("home.metric.nextValue")}</strong>
          <p>{t("home.metric.nextNote")}</p>
        </article>
      </section>

      <section className="content-grid">
        {statusLanes.map((lane) => (
          <article className="surface-card" key={lane.title}>
            <span className="surface-kicker">{t("home.lane.baseline")}</span>
            <h3>{lane.title}</h3>
            <p>{lane.body}</p>
          </article>
        ))}
      </section>

      <section className="page-shell-block">
        <header className="block-header">
          <span className="eyebrow">{t("home.bookingInventory.eyebrow")}</span>
          <h2>{t("home.bookingInventory.title")}</h2>
          <p>{t("home.bookingInventory.body")}</p>
        </header>
        <FlowRouteCards routes={bookingFlowRoutes} />
      </section>

      <section className="page-shell-block">
        <header className="block-header">
          <span className="eyebrow">{t("home.tripInventory.eyebrow")}</span>
          <h2>{t("home.tripInventory.title")}</h2>
          <p>{t("home.tripInventory.body")}</p>
        </header>
        <FlowRouteCards routes={tripFlowRoutes} />
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>{t("home.callout.empty.title")}</strong>
          <p>{t("home.callout.empty.body")}</p>
        </article>
        <article className="callout-card warning">
          <strong>{t("home.callout.backend.title")}</strong>
          <p>{t("home.callout.backend.body")}</p>
        </article>
      </section>
    </div>
  );
}
