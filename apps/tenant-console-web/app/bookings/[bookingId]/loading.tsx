import { PageHero, SurfaceCard } from "@/components/page-primitives";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export default async function BookingDetailLoading() {
  const locale = await getServerLocale();

  return (
    <div className="page-shell">
      <PageHero
        eyebrow={t("bookingDetail.hero.eyebrow", locale)}
        title={t("bookingDetail.loading.title", locale)}
        description={t("bookingDetail.loading.description", locale)}
      />

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker={t("bookingDetail.refresh.kicker", locale)}
          title={t("bookingDetail.loading.refreshTitle", locale)}
          description={t("bookingDetail.loading.refreshDescription", locale)}
        />
        <SurfaceCard
          kicker={t("bookingDetail.status.kicker", locale)}
          title={t("bookingDetail.loading.statusTitle", locale)}
          description={t("bookingDetail.loading.statusDescription", locale)}
        />
      </section>
    </div>
  );
}
