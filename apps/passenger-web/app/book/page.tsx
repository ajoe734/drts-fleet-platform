"use client";

import Link from "next/link";
import { FlowRouteCards } from "@/components/flow-route-cards";
import { useTranslation } from "@/lib/i18n";
import { getBookingFlowRoutes } from "@/lib/navigation";

export default function BookingRequestPage() {
  const { locale, t } = useTranslation();
  const negativeRoutes = getBookingFlowRoutes(locale).filter(
    (route) => route.kind === "negative",
  );
  const requestSummary = [
    {
      label: t("book.summary.pickup.label"),
      value: t("book.summary.pickup.value"),
      note: t("book.summary.pickup.note"),
    },
    {
      label: t("book.summary.dropoff.label"),
      value: t("book.summary.dropoff.value"),
      note: t("book.summary.dropoff.note"),
    },
    {
      label: t("book.summary.window.label"),
      value: t("book.summary.window.value"),
      note: t("book.summary.window.note"),
    },
    {
      label: t("book.summary.service.label"),
      value: t("book.summary.service.value"),
      note: t("book.summary.service.note"),
    },
  ];

  return (
    <div className="page-shell">
      <section className="hero-card hero-gradient">
        <span className="eyebrow">{t("book.eyebrow")}</span>
        <h1>{t("book.title")}</h1>
        <p>{t("book.body")}</p>
        <div className="hero-actions">
          <Link className="primary-link" href="/trip">
            {t("book.cta.trip")}
          </Link>
          <Link className="secondary-link" href="/auth">
            {t("book.cta.auth")}
          </Link>
        </div>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">{t("book.summary.kicker")}</span>
        <h3>{t("book.summary.title")}</h3>
        <dl className="kv-grid">
          {requestSummary.map((row) => (
            <div className="kv-row" key={row.label}>
              <dt>{row.label}</dt>
              <dd>
                <strong>{row.value}</strong>
                <span>{row.note}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="surface-footnote">{t("book.summary.footnote")}</p>
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>{t("book.callout.authority.title")}</strong>
          <p>{t("book.callout.authority.body")}</p>
        </article>
        <article className="callout-card warning">
          <strong>{t("book.callout.eta.title")}</strong>
          <p>{t("book.callout.eta.body")}</p>
        </article>
      </section>

      <section className="page-shell-block">
        <header className="block-header">
          <span className="eyebrow">{t("book.negative.eyebrow")}</span>
          <h2>{t("book.negative.title")}</h2>
          <p>{t("book.negative.body")}</p>
        </header>
        <FlowRouteCards routes={negativeRoutes} emphasizeKind="negative" />
      </section>
    </div>
  );
}
