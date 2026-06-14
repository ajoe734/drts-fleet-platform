"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n";

export default function BookingDegradedPage() {
  const { t } = useTranslation();
  const degradedAffordances = [
    {
      state: t("degraded.row1.state"),
      name: t("degraded.row1.name"),
      body: t("degraded.row1.body"),
    },
    {
      state: t("degraded.row2.state"),
      name: t("degraded.row2.name"),
      body: t("degraded.row2.body"),
    },
    {
      state: t("degraded.row3.state"),
      name: t("degraded.row3.name"),
      body: t("degraded.row3.body"),
    },
    {
      state: t("degraded.row4.state"),
      name: t("degraded.row4.name"),
      body: t("degraded.row4.body"),
    },
  ];

  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow state-pill state-pill-negative">
          {t("degraded.eyebrow")}
        </span>
        <h1>{t("degraded.title")}</h1>
        <p>{t("degraded.body")}</p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">{t("degraded.kicker")}</span>
        <h3>{t("degraded.listTitle")}</h3>
        <ul className="check-list">
          {degradedAffordances.map((row) => (
            <li className={`check-item check-${row.state}`} key={row.name}>
              <strong>{row.name}</strong>
              <span className="check-state">{row.state}</span>
              <p>{row.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>{t("degraded.callout.signal.title")}</strong>
          <p>{t("degraded.callout.signal.body")}</p>
        </article>
        <article className="callout-card warning">
          <strong>{t("degraded.callout.retry.title")}</strong>
          <p>{t("degraded.callout.retry.body")}</p>
        </article>
      </section>

      <section className="hero-actions">
        <Link className="primary-link" href="/trip">
          {t("degraded.cta.trip")}
        </Link>
        <Link className="secondary-link" href="/unsupported">
          {t("degraded.cta.unsupported")}
        </Link>
      </section>
    </div>
  );
}
