"use client";

import Link from "next/link";
import { FlowRouteCards } from "@/components/flow-route-cards";
import { useTranslation } from "@/lib/i18n";
import { getTripFlowRoutes } from "@/lib/navigation";

export default function TripStatusPage() {
  const { locale, t } = useTranslation();
  const subRoutes = getTripFlowRoutes(locale).filter(
    (route) => route.href !== "/trip",
  );
  const lifecycle = [
    {
      phase: t("trip.lifecycle.requested.phase"),
      state: t("trip.lifecycle.requested.state"),
      body: t("trip.lifecycle.requested.body"),
    },
    {
      phase: t("trip.lifecycle.matched.phase"),
      state: t("trip.lifecycle.matched.state"),
      body: t("trip.lifecycle.matched.body"),
    },
    {
      phase: t("trip.lifecycle.pickup.phase"),
      state: t("trip.lifecycle.pickup.state"),
      body: t("trip.lifecycle.pickup.body"),
    },
    {
      phase: t("trip.lifecycle.boarded.phase"),
      state: t("trip.lifecycle.boarded.state"),
      body: t("trip.lifecycle.boarded.body"),
    },
    {
      phase: t("trip.lifecycle.dropoff.phase"),
      state: t("trip.lifecycle.dropoff.state"),
      body: t("trip.lifecycle.dropoff.body"),
    },
  ];

  return (
    <div className="page-shell">
      <section className="hero-card hero-gradient">
        <span className="eyebrow">{t("trip.eyebrow")}</span>
        <h1>{t("trip.title")}</h1>
        <p>{t("trip.body")}</p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">
          {t("trip.snapshot.kicker", { id: "trp_8FQ12X" })}
        </span>
        <h3>{t("trip.snapshot.title")}</h3>
        <dl className="kv-grid">
          {[
            {
              label: t("trip.snapshot.eta.label"),
              value: t("trip.snapshot.eta.value"),
              note: t("trip.snapshot.eta.note"),
            },
            {
              label: t("trip.snapshot.vehicle.label"),
              value: t("trip.snapshot.vehicle.value"),
              note: t("trip.snapshot.vehicle.note"),
            },
            {
              label: t("trip.snapshot.driver.label"),
              value: t("trip.snapshot.driver.value"),
              note: t("trip.snapshot.driver.note"),
            },
            {
              label: t("trip.snapshot.authority.label"),
              value: t("trip.snapshot.authority.value"),
              note: t("trip.snapshot.authority.note"),
            },
            {
              label: t("trip.snapshot.cancel.label"),
              value: t("trip.snapshot.cancel.value"),
              note: t("trip.snapshot.cancel.note"),
            },
          ].map((row) => (
            <div className="kv-row" key={row.label}>
              <dt>{row.label}</dt>
              <dd>
                <strong>{row.value}</strong>
                <span>{row.note}</span>
              </dd>
            </div>
          ))}
        </dl>
        <div className="hero-actions">
          <Link className="primary-link" href="/trip/cancel">
            {t("trip.cta.cancel")}
          </Link>
          <Link className="secondary-link" href="/trip/completed">
            {t("trip.cta.completed")}
          </Link>
        </div>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">{t("trip.lifecycle.kicker")}</span>
        <h3>{t("trip.lifecycle.title")}</h3>
        <ul className="check-list">
          {lifecycle.map((phase) => (
            <li className={`check-item check-${phase.state}`} key={phase.phase}>
              <strong>{phase.phase}</strong>
              <span className="check-state">{phase.state}</span>
              <p>{phase.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="page-shell-block">
        <header className="block-header">
          <span className="eyebrow">{t("trip.routes.eyebrow")}</span>
          <h2>{t("trip.routes.title")}</h2>
          <p>{t("trip.routes.body")}</p>
        </header>
        <FlowRouteCards routes={subRoutes} />
      </section>
    </div>
  );
}
