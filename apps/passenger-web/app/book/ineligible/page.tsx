"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n";

export default function BookingIneligiblePage() {
  const { t } = useTranslation();
  const eligibilityGates = [
    {
      name: t("ineligible.gate1.name"),
      state: t("ineligible.gate1.state"),
      body: t("ineligible.gate1.body"),
    },
    {
      name: t("ineligible.gate2.name"),
      state: t("ineligible.gate2.state"),
      body: t("ineligible.gate2.body"),
    },
    {
      name: t("ineligible.gate3.name"),
      state: t("ineligible.gate3.state"),
      body: t("ineligible.gate3.body"),
    },
  ];

  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow state-pill state-pill-negative">
          {t("ineligible.eyebrow")}
        </span>
        <h1>{t("ineligible.title")}</h1>
        <p>{t("ineligible.body")}</p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">{t("ineligible.kicker")}</span>
        <h3>{t("ineligible.listTitle")}</h3>
        <ul className="check-list">
          {eligibilityGates.map((gate) => (
            <li
              key={gate.name}
              className={`check-item check-${gate.state.replace(/\s+/g, "-")}`}
            >
              <strong>{gate.name}</strong>
              <span className="check-state">{gate.state}</span>
              <p>{gate.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>{t("ineligible.callout.payment.title")}</strong>
          <p>{t("ineligible.callout.payment.body")}</p>
        </article>
        <article className="callout-card">
          <strong>{t("ineligible.callout.program.title")}</strong>
          <p>{t("ineligible.callout.program.body")}</p>
          <Link className="text-link" href="/unsupported">
            {t("ineligible.callout.program.cta")}
          </Link>
        </article>
        <article className="callout-card warning">
          <strong>{t("ineligible.callout.downgrade.title")}</strong>
          <p>{t("ineligible.callout.downgrade.body")}</p>
        </article>
      </section>

      <section className="hero-actions">
        <Link className="primary-link" href="/auth">
          {t("ineligible.cta.auth")}
        </Link>
        <Link className="secondary-link" href="/book">
          {t("ineligible.cta.book")}
        </Link>
      </section>
    </div>
  );
}
