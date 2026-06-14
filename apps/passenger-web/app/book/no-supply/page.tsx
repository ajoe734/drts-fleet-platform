"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n";

export default function BookingNoSupplyPage() {
  const { t } = useTranslation();
  const supplyContext = [
    {
      label: t("noSupply.row1.label"),
      value: t("noSupply.row1.value"),
      note: t("noSupply.row1.note"),
    },
    {
      label: t("noSupply.row2.label"),
      value: t("noSupply.row2.value"),
      note: t("noSupply.row2.note"),
    },
    {
      label: t("noSupply.row3.label"),
      value: t("noSupply.row3.value"),
      note: t("noSupply.row3.note"),
    },
  ];

  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow state-pill state-pill-negative">
          {t("noSupply.eyebrow")}
        </span>
        <h1>{t("noSupply.title")}</h1>
        <p>{t("noSupply.body")}</p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">{t("noSupply.kicker")}</span>
        <h3>{t("noSupply.listTitle")}</h3>
        <dl className="kv-grid">
          {supplyContext.map((row) => (
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
          <strong>{t("noSupply.callout.retry.title")}</strong>
          <p>{t("noSupply.callout.retry.body")}</p>
          <Link className="text-link" href="/book">
            {t("noSupply.callout.retry.cta")}
          </Link>
        </article>
        <article className="callout-card">
          <strong>{t("noSupply.callout.schedule.title")}</strong>
          <p>{t("noSupply.callout.schedule.body")}</p>
        </article>
        <article className="callout-card warning">
          <strong>{t("noSupply.callout.match.title")}</strong>
          <p>{t("noSupply.callout.match.body")}</p>
        </article>
      </section>
    </div>
  );
}
