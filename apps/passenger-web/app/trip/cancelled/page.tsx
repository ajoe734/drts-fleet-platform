"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n";

export default function TripCancelledPage() {
  const { t } = useTranslation();
  const cancellationCases = [
    {
      actor: t("tripCancelled.case1.actor"),
      body: t("tripCancelled.case1.body"),
      next: t("tripCancelled.case1.next"),
    },
    {
      actor: t("tripCancelled.case2.actor"),
      body: t("tripCancelled.case2.body"),
      next: t("tripCancelled.case2.next"),
    },
    {
      actor: t("tripCancelled.case3.actor"),
      body: t("tripCancelled.case3.body"),
      next: t("tripCancelled.case3.next"),
    },
  ];

  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow state-pill state-pill-negative">
          {t("tripCancelled.eyebrow")}
        </span>
        <h1>{t("tripCancelled.title")}</h1>
        <p>{t("tripCancelled.body")}</p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">{t("tripCancelled.kicker")}</span>
        <h3>{t("tripCancelled.listTitle")}</h3>
        <ul className="check-list">
          {cancellationCases.map((row) => (
            <li className="check-item check-cancelled" key={row.actor}>
              <strong>{row.actor}</strong>
              <span className="check-state">{t("tripCancelled.state")}</span>
              <p>{row.body}</p>
              <p className="check-next">
                {t("tripCancelled.nextValue", { value: row.next })}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="callout-row">
        <article className="callout-card">
          <strong>{t("tripCancelled.callout.receipt.title")}</strong>
          <p>{t("tripCancelled.callout.receipt.body")}</p>
          <Link className="text-link" href="/receipts">
            {t("tripCancelled.callout.receipt.cta")}
          </Link>
        </article>
        <article className="callout-card">
          <strong>{t("tripCancelled.callout.retry.title")}</strong>
          <p>{t("tripCancelled.callout.retry.body")}</p>
          <Link className="text-link" href="/book">
            {t("tripCancelled.callout.retry.cta")}
          </Link>
        </article>
        <article className="callout-card warning">
          <strong>{t("tripCancelled.callout.notdo.title")}</strong>
          <p>{t("tripCancelled.callout.notdo.body")}</p>
        </article>
      </section>
    </div>
  );
}
