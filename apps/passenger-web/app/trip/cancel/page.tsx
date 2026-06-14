"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n";

export default function TripCancelPage() {
  const { t } = useTranslation();
  const policyDetails = [
    {
      label: t("tripCancel.policy1.label"),
      value: t("tripCancel.policy1.value"),
      note: t("tripCancel.policy1.note"),
    },
    {
      label: t("tripCancel.policy2.label"),
      value: t("tripCancel.policy2.value"),
      note: t("tripCancel.policy2.note"),
    },
    {
      label: t("tripCancel.policy3.label"),
      value: t("tripCancel.policy3.value"),
      note: t("tripCancel.policy3.note"),
    },
  ];
  const reasonOptions = [
    t("tripCancel.reason1"),
    t("tripCancel.reason2"),
    t("tripCancel.reason3"),
    t("tripCancel.reason4"),
  ];

  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow state-pill state-pill-positive">
          {t("tripCancel.eyebrow")}
        </span>
        <h1>{t("tripCancel.title")}</h1>
        <p>{t("tripCancel.body")}</p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">{t("tripCancel.kicker")}</span>
        <h3>{t("tripCancel.policyTitle")}</h3>
        <dl className="kv-grid">
          {policyDetails.map((row) => (
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

      <section className="surface-card">
        <span className="surface-kicker">{t("tripCancel.reason.kicker")}</span>
        <h3>{t("tripCancel.reason.title")}</h3>
        <ul className="check-list">
          {reasonOptions.map((reason) => (
            <li className="check-item check-available" key={reason}>
              <strong>{reason}</strong>
              <span className="check-state">{t("tripCancel.reasonState")}</span>
              <p>{t("tripCancel.reasonBody")}</p>
            </li>
          ))}
        </ul>
        <p className="surface-footnote">{t("tripCancel.reasonFootnote")}</p>
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>{t("tripCancel.callout.after.title")}</strong>
          <p>{t("tripCancel.callout.after.body")}</p>
          <Link className="text-link" href="/trip/cancelled">
            {t("tripCancel.callout.after.cta")}
          </Link>
        </article>
        <article className="callout-card warning">
          <strong>{t("tripCancel.callout.window.title")}</strong>
          <p>{t("tripCancel.callout.window.body")}</p>
        </article>
      </section>

      <section className="hero-actions">
        <Link className="primary-link" href="/trip/cancelled">
          {t("tripCancel.cta.confirm")}
        </Link>
        <Link className="secondary-link" href="/trip">
          {t("tripCancel.cta.keep")}
        </Link>
      </section>
    </div>
  );
}
