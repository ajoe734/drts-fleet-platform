"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n";

export default function TripHistoryPage() {
  const { t } = useTranslation();
  const tripCards = [
    {
      title: t("trips.card1.title"),
      note: t("trips.card1.note"),
      detail: t("trips.card1.body"),
      href: "/trip/completed",
      cta: t("trips.card1.cta"),
    },
    {
      title: t("trips.card2.title"),
      note: t("trips.card2.note"),
      detail: t("trips.card2.body"),
      href: "/trip/read-only",
      cta: t("trips.card2.cta"),
    },
    {
      title: t("trips.card3.title"),
      note: t("trips.card3.note"),
      detail: t("trips.card3.body"),
      href: "/trip/cancelled",
      cta: t("trips.card3.cta"),
    },
    {
      title: t("trips.card4.title"),
      note: t("trips.card4.note"),
      detail: t("trips.card4.body"),
      href: "/auth",
      cta: t("trips.card4.cta"),
    },
  ];

  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow">{t("trips.eyebrow")}</span>
        <h1>{t("trips.title")}</h1>
        <p>{t("trips.body")}</p>
      </section>

      <section className="content-grid">
        {tripCards.map((trip) => (
          <article className="surface-card" key={trip.title}>
            <span className="surface-kicker">{trip.note}</span>
            <h3>{trip.title}</h3>
            <p>{trip.detail}</p>
            <Link className="text-link" href={trip.href}>
              {trip.cta}
            </Link>
          </article>
        ))}
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>{t("trips.callout.receipt.title")}</strong>
          <p>{t("trips.callout.receipt.body")}</p>
          <Link className="text-link" href="/receipts">
            {t("trips.callout.receipt.cta")}
          </Link>
        </article>
        <article className="callout-card warning">
          <strong>{t("trips.callout.notdo.title")}</strong>
          <p>{t("trips.callout.notdo.body")}</p>
        </article>
      </section>
    </div>
  );
}
