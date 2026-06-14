"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n";

export default function ReceiptCenterPage() {
  const { t } = useTranslation();
  const receiptStates = [
    {
      title: t("receipts.card1.title"),
      status: t("receipts.card1.status"),
      body: t("receipts.card1.body"),
      href: "/trip/completed",
      cta: t("receipts.card1.cta"),
    },
    {
      title: t("receipts.card2.title"),
      status: t("receipts.card2.status"),
      body: t("receipts.card2.body"),
      href: "/trip/read-only",
      cta: t("receipts.card2.cta"),
    },
    {
      title: t("receipts.card3.title"),
      status: t("receipts.card3.status"),
      body: t("receipts.card3.body"),
      href: "/unsupported",
      cta: t("receipts.card3.cta"),
    },
  ];

  return (
    <div className="page-shell">
      <section className="hero-card hero-gradient">
        <span className="eyebrow">{t("receipts.eyebrow")}</span>
        <h1>{t("receipts.title")}</h1>
        <p>{t("receipts.body")}</p>
      </section>

      <section className="content-grid">
        {receiptStates.map((state) => (
          <article className="surface-card" key={state.title}>
            <span className="surface-kicker">{state.status}</span>
            <h3>{state.title}</h3>
            <p>{state.body}</p>
            <Link className="text-link" href={state.href}>
              {state.cta}
            </Link>
          </article>
        ))}
      </section>

      <section className="callout-row">
        <article className="callout-card warning">
          <strong>{t("receipts.callout.title")}</strong>
          <p>{t("receipts.callout.body")}</p>
        </article>
      </section>
    </div>
  );
}
