import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { t } from "@/lib/translations";

// Honest placeholder for a route whose visual design canvas has not been
// delivered. It states intent (from the screen-requirements hand-off) without
// inventing a final screen — the realm chrome and routing are real, the screen
// body is explicitly pending design.
export function PendingScreen({
  title,
  purpose,
}: {
  title: string;
  purpose: string;
}) {
  return (
    <div className="page-shell">
      <PageHero
        eyebrow={t("pending.eyebrow")}
        title={
          <span className="pending-title">
            {title}
            <span className="status-chip">{t("pending.badge")}</span>
          </span>
        }
        description={purpose}
      />

      <CalloutPanel
        title={t("pending.heading")}
        description={t("pending.lead")}
        tone="warning"
      />

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker={t("pending.eyebrow")}
          title={t("pending.authorityTitle")}
          description={t("pending.authorityBody")}
        />
        <SurfaceCard
          kicker={t("pending.eyebrow")}
          title={t("pending.referenceTitle")}
          description={t("pending.referenceBody")}
        />
      </section>
    </div>
  );
}
