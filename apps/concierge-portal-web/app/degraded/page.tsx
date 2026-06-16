import Link from "next/link";
import { OPS_CALLCENTER_URL } from "@/lib/api-client";
import { getDeskById, localizeDeskRecord } from "@/lib/desk-catalog";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

function getQueryValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function DegradedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getServerLocale();
  const desk = localizeDeskRecord(
    getDeskById(getQueryValue((await searchParams).desk)),
    (key, params) => t(key, locale, params),
  );

  return (
    <div className="page-shell">
      <section className="hero-card tone-warning">
        <span className="section-kicker">{t("degraded.eyebrow", locale)}</span>
        <h1>{t("degraded.title", locale)}</h1>
        <p>{t("degraded.body", locale)}</p>
      </section>

      <section className="detail-grid">
        <article className="panel-card tone-warning">
          <span className="section-kicker">
            {t("degraded.health.eyebrow", locale)}
          </span>
          <h2>{desk ? desk.deskName : t("degraded.health.empty", locale)}</h2>
          <p>
            {desk
              ? t("degraded.health.body", locale, {
                  siteName: desk.siteName,
                })
              : t("degraded.health.emptyBody", locale)}
          </p>
          <div className="inline-actions">
            <Link className="primary-link" href="/lookup">
              {t("degraded.health.lookup", locale)}
            </Link>
            <Link className="secondary-link" href="/callbacks">
              {t("degraded.health.callbacks", locale)}
            </Link>
          </div>
        </article>

        <article className="panel-card">
          <span className="section-kicker">
            {t("degraded.escalation.eyebrow", locale)}
          </span>
          <h2>{t("degraded.escalation.title", locale)}</h2>
          <p>{t("degraded.escalation.body", locale)}</p>
          <div className="inline-actions">
            <a
              className="secondary-link"
              href={OPS_CALLCENTER_URL}
              rel="noreferrer"
              target="_blank"
            >
              {t("common.openOpsCallcenter", locale)}
            </a>
            <Link className="secondary-link" href="/start">
              {t("degraded.escalation.pickAnother", locale)}
            </Link>
          </div>
        </article>
      </section>
    </div>
  );
}
