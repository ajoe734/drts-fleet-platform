"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n";

export default function TripCompletedPage() {
  const { t } = useTranslation();
  const completionSummary = [
    {
      label: t("tripCompleted.row1.label"),
      value: t("tripCompleted.row1.value"),
      note: t("tripCompleted.row1.note"),
    },
    {
      label: t("tripCompleted.row2.label"),
      value: t("tripCompleted.row2.value"),
      note: t("tripCompleted.row2.note"),
    },
    {
      label: t("tripCompleted.row3.label"),
      value: t("tripCompleted.row3.value"),
      note: t("tripCompleted.row3.note"),
    },
    {
      label: t("tripCompleted.row4.label"),
      value: t("tripCompleted.row4.value"),
      note: t("tripCompleted.row4.note"),
    },
    {
      label: t("tripCompleted.row5.label"),
      value: t("tripCompleted.row5.value"),
      note: t("tripCompleted.row5.note"),
    },
  ];

  return (
    <div className="page-shell">
      <section className="hero-card hero-gradient">
        <span className="eyebrow state-pill state-pill-positive">
          {t("tripCompleted.eyebrow")}
        </span>
        <h1>{t("tripCompleted.title")}</h1>
        <p>{t("tripCompleted.body")}</p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">{t("tripCompleted.kicker")}</span>
        <h3>{t("tripCompleted.listTitle")}</h3>
        <dl className="kv-grid">
          {completionSummary.map((row) => (
            <div className="kv-row" key={row.label}>
              <dt>{row.label}</dt>
              <dd>
                <strong>{row.value}</strong>
                <span>{row.note}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>{t("tripCompleted.callout.receipt.title")}</strong>
          <p>{t("tripCompleted.callout.receipt.body")}</p>
          <Link className="text-link" href="/receipts">
            {t("tripCompleted.callout.receipt.cta")}
          </Link>
        </article>
        <article className="callout-card">
          <strong>{t("tripCompleted.callout.history.title")}</strong>
          <p>{t("tripCompleted.callout.history.body")}</p>
          <Link className="text-link" href="/trips">
            {t("tripCompleted.callout.history.cta")}
          </Link>
        </article>
        <article className="callout-card warning">
          <strong>{t("tripCompleted.callout.scope.title")}</strong>
          <p>{t("tripCompleted.callout.scope.body")}</p>
        </article>
      </section>
    </div>
  );
}
