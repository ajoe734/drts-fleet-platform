import Link from "next/link";
import {
  formatDeskMode,
  getDeskById,
  localizeDeskRecord,
} from "@/lib/desk-catalog";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

function getQueryValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function DeniedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getServerLocale();
  const query = await searchParams;
  const desk = localizeDeskRecord(
    getDeskById(getQueryValue(query.desk)),
    (key, params) => t(key, locale, params),
  );
  const mode = getQueryValue(query.mode);

  return (
    <div className="page-shell">
      <section className="hero-card tone-warning">
        <span className="section-kicker">{t("denied.eyebrow", locale)}</span>
        <h1>{t("denied.title", locale)}</h1>
        <p>{t("denied.body", locale)}</p>
      </section>

      <section className="panel-card tone-warning">
        <span className="section-kicker">
          {t("denied.reason.eyebrow", locale)}
        </span>
        <h2>{desk ? desk.deskName : t("denied.reason.empty", locale)}</h2>
        <p>
          {desk && mode
            ? t("denied.reason.body", locale, {
                mode: formatDeskMode(
                  mode as "concierge_operator" | "call_point_operator",
                  (key, params) => t(key, locale, params),
                ),
                deskName: desk.deskName,
              })
            : t("denied.reason.fallback", locale)}
        </p>
        <div className="inline-actions">
          <Link className="primary-link" href="/start">
            {t("denied.cta.pickDesk", locale)}
          </Link>
          <Link className="secondary-link" href="/login">
            {t("denied.cta.rebootstrap", locale)}
          </Link>
        </div>
      </section>
    </div>
  );
}
