"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n";

export default function UnauthenticatedPage() {
  const { t } = useTranslation();

  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow">{t("unauth.eyebrow")}</span>
        <h1>{t("unauth.title")}</h1>
        <p>{t("unauth.body")}</p>
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>{t("unauth.callout.next.title")}</strong>
          <p>{t("unauth.callout.next.body")}</p>
          <Link className="text-link" href="/auth">
            {t("unauth.callout.next.cta")}
          </Link>
        </article>
        <article className="callout-card warning">
          <strong>{t("unauth.callout.notdo.title")}</strong>
          <p>{t("unauth.callout.notdo.body")}</p>
        </article>
      </section>
    </div>
  );
}
