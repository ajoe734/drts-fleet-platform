import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { t } from "@/lib/translations";

const ROUTES: {
  key: "bookings" | "contracts" | "statements" | "programs" | "users" | "audit";
}[] = [
  { key: "bookings" },
  { key: "contracts" },
  { key: "statements" },
  { key: "programs" },
  { key: "users" },
  { key: "audit" },
];

export default function HomePage() {
  return (
    <div className="page-shell">
      <PageHero
        eyebrow={t("home.eyebrow")}
        title={
          <span className="pending-title">
            {t("home.title")}
            <span className="status-chip">{t("pending.badge")}</span>
          </span>
        }
        description={t("home.lead")}
      />

      <CalloutPanel
        title={t("pending.heading")}
        description={t("home.purpose")}
        tone="warning"
      />

      <section className="surface-grid surface-grid-wide">
        {ROUTES.map((route) => (
          <SurfaceCard
            key={route.key}
            kicker={t("pending.badge")}
            title={t(`${route.key}.title`)}
            description={t(`${route.key}.purpose`)}
          />
        ))}
      </section>
    </div>
  );
}
