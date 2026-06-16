import Link from "next/link";
import { getDeskById, localizeDeskRecord } from "@/lib/desk-catalog";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

function getQueryValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function IneligiblePage({
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
  const reason = getQueryValue(query.reason) ?? "product_not_authorized";

  return (
    <div className="page-shell">
      <section className="hero-card tone-warning">
        <span className="section-kicker">
          {t("ineligible.eyebrow", locale)}
        </span>
        <h1>{t("ineligible.title", locale)}</h1>
        <p>{t("ineligible.body", locale)}</p>
      </section>

      <section className="panel-card tone-warning">
        <span className="section-kicker">
          {t("ineligible.result.eyebrow", locale)}
        </span>
        <h2>{desk ? desk.deskName : t("ineligible.result.empty", locale)}</h2>
        <p>{t(`ineligible.reason.${reason}`, locale)}</p>
        {desk ? (
          <p>{t("ineligible.zone", locale, { zoneLabel: desk.zoneLabel })}</p>
        ) : null}
        <div className="inline-actions">
          <Link className="primary-link" href="/bookings/new">
            {t("common.returnToBooking", locale)}
          </Link>
          <Link className="secondary-link" href="/callbacks">
            {t("common.offerCallback", locale)}
          </Link>
        </div>
      </section>
    </div>
  );
}
