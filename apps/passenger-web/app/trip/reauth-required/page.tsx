"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n";

export default function TripReauthRequiredPage() {
  const { t } = useTranslation();
  const reauthCauses = [
    { code: t("tripReauth.cause1.code"), body: t("tripReauth.cause1") },
    { code: t("tripReauth.cause2.code"), body: t("tripReauth.cause2") },
    { code: t("tripReauth.cause3.code"), body: t("tripReauth.cause3") },
  ];

  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow state-pill state-pill-negative">
          {t("tripReauth.eyebrow")}
        </span>
        <h1>{t("tripReauth.title")}</h1>
        <p>{t("tripReauth.body")}</p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">{t("tripReauth.kicker")}</span>
        <h3>{t("tripReauth.listTitle")}</h3>
        <ul className="check-list">
          {reauthCauses.map((cause) => (
            <li className="check-item check-blocked" key={cause.code}>
              <strong>{cause.code}</strong>
              <span className="check-state">{t("tripReauth.state")}</span>
              <p>{cause.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>{t("tripReauth.callout.verify.title")}</strong>
          <p>{t("tripReauth.callout.verify.body")}</p>
          <Link className="text-link" href="/auth">
            {t("tripReauth.callout.verify.cta")}
          </Link>
        </article>
        <article className="callout-card warning">
          <strong>{t("tripReauth.callout.hidden.title")}</strong>
          <p>{t("tripReauth.callout.hidden.body")}</p>
          <Link className="text-link" href="/unauthenticated">
            {t("tripReauth.callout.hidden.cta")}
          </Link>
        </article>
      </section>
    </div>
  );
}
