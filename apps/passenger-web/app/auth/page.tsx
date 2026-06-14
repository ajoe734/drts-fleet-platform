"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n";

export default function AuthEntryPage() {
  const { t } = useTranslation();
  const entryOptions = [
    { title: t("auth.option1.title"), body: t("auth.option1.body") },
    { title: t("auth.option2.title"), body: t("auth.option2.body") },
    { title: t("auth.option3.title"), body: t("auth.option3.body") },
  ];

  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow">{t("auth.eyebrow")}</span>
        <h1>{t("auth.title")}</h1>
        <p>{t("auth.body")}</p>
      </section>

      <section className="content-grid">
        {entryOptions.map((option) => (
          <article className="surface-card" key={option.title}>
            <span className="surface-kicker">{t("auth.entryLane")}</span>
            <h3>{option.title}</h3>
            <p>{option.body}</p>
          </article>
        ))}
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>{t("auth.callout.title")}</strong>
          <p>{t("auth.callout.body")}</p>
          <Link className="text-link" href="/unauthenticated">
            {t("auth.callout.cta")}
          </Link>
        </article>
      </section>
    </div>
  );
}
