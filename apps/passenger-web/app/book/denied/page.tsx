"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n";

export default function BookingDeniedPage() {
  const { t } = useTranslation();
  const denialReasons = [
    { code: "policy.safety_hold", body: t("denied.reason1") },
    { code: "policy.fraud_review", body: t("denied.reason2") },
    { code: "policy.unsupported_destination", body: t("denied.reason3") },
  ];

  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow state-pill state-pill-negative">
          {t("denied.eyebrow")}
        </span>
        <h1>{t("denied.title")}</h1>
        <p>{t("denied.body")}</p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">{t("denied.sampleKicker")}</span>
        <h3>{t("denied.sampleTitle")}</h3>
        <p>{t("denied.sampleBody")}</p>
        <p className="surface-footnote">{t("denied.sampleNote")}</p>
      </section>

      <section className="content-grid">
        {denialReasons.map((reason) => (
          <article className="surface-card" key={reason.code}>
            <span className="surface-kicker">{reason.code}</span>
            <p>{reason.body}</p>
          </article>
        ))}
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>{t("denied.callout.allowed.title")}</strong>
          <p>{t("denied.callout.allowed.body")}</p>
          <Link className="text-link" href="/unsupported">
            {t("denied.callout.allowed.cta")}
          </Link>
        </article>
        <article className="callout-card warning">
          <strong>{t("denied.callout.notdo.title")}</strong>
          <p>{t("denied.callout.notdo.body")}</p>
        </article>
      </section>

      <section className="hero-actions">
        <Link className="primary-link" href="/auth">
          {t("denied.cta.auth")}
        </Link>
        <Link className="secondary-link" href="/book">
          {t("denied.cta.book")}
        </Link>
      </section>
    </div>
  );
}
