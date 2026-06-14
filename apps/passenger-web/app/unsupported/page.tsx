"use client";

import { useTranslation } from "@/lib/i18n";

export default function UnsupportedPage() {
  const { t } = useTranslation();

  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow">{t("unsupported.eyebrow")}</span>
        <h1>{t("unsupported.title")}</h1>
        <p>{t("unsupported.body")}</p>
      </section>

      <section className="content-grid">
        <article className="surface-card">
          <span className="surface-kicker">
            {t("unsupported.card1.kicker")}
          </span>
          <h3>{t("unsupported.card1.title")}</h3>
          <p>{t("unsupported.card1.body")}</p>
        </article>
        <article className="surface-card">
          <span className="surface-kicker">
            {t("unsupported.card2.kicker")}
          </span>
          <h3>{t("unsupported.card2.title")}</h3>
          <p>{t("unsupported.card2.body")}</p>
        </article>
      </section>
    </div>
  );
}
