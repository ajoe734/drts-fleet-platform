"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n";

export default function TripReadOnlyPage() {
  const { t } = useTranslation();
  const ownership = [
    {
      label: t("tripReadOnly.row1.label"),
      value: t("tripReadOnly.row1.value"),
      note: t("tripReadOnly.row1.note"),
    },
    {
      label: t("tripReadOnly.row2.label"),
      value: t("tripReadOnly.row2.value"),
      note: t("tripReadOnly.row2.note"),
    },
    {
      label: t("tripReadOnly.row3.label"),
      value: t("tripReadOnly.row3.value"),
      note: t("tripReadOnly.row3.note"),
    },
  ];
  const ownershipMatrix = ["case1", "case2", "case3", "case4"] as const;

  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="eyebrow state-pill state-pill-positive">
          {t("tripReadOnly.eyebrow")}
        </span>
        <h1>{t("tripReadOnly.title")}</h1>
        <p>{t("tripReadOnly.body")}</p>
      </section>

      <section className="surface-card">
        <span className="surface-kicker">{t("tripReadOnly.kicker")}</span>
        <h3>{t("tripReadOnly.snapshotTitle")}</h3>
        <dl className="kv-grid">
          {ownership.map((row) => (
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
        <span className="surface-kicker">{t("tripReadOnly.matrixKicker")}</span>
        <h3>{t("tripReadOnly.matrixTitle")}</h3>
        <table className="matrix-table">
          <thead>
            <tr>
              <th>{t("tripReadOnly.table.source")}</th>
              <th>{t("tripReadOnly.table.authority")}</th>
              <th>{t("tripReadOnly.table.visibility")}</th>
              <th>{t("tripReadOnly.table.notes")}</th>
            </tr>
          </thead>
          <tbody>
            {ownershipMatrix.map((key) => (
              <tr key={key}>
                <td>
                  <strong>{t(`tripReadOnly.${key}.source`)}</strong>
                </td>
                <td>{t(`tripReadOnly.${key}.mutate`)}</td>
                <td>{t(`tripReadOnly.${key}.view`)}</td>
                <td>{t(`tripReadOnly.${key}.note`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="callout-row">
        <article className="callout-card warning">
          <strong>{t("tripReadOnly.callout.fake.title")}</strong>
          <p>{t("tripReadOnly.callout.fake.body")}</p>
        </article>
        <article className="callout-card">
          <strong>{t("tripReadOnly.callout.act.title")}</strong>
          <p>{t("tripReadOnly.callout.act.body")}</p>
          <Link className="text-link" href="/unsupported">
            {t("tripReadOnly.callout.act.cta")}
          </Link>
        </article>
      </section>
    </div>
  );
}
