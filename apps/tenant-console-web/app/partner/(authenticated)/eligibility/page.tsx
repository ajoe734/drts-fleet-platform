import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { PartnerEligibilityForm } from "@/app/partner/(authenticated)/eligibility/eligibility-form";
import { requirePartnerSession } from "@/lib/partner-session";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function PartnerEligibilityPage() {
  const session = await requirePartnerSession();
  const locale = await getServerLocale();
  const mode = session.partnerEntry.eligibilityMode;

  return (
    <div className="page-shell">
      <PageHero
        eyebrow={t("partner.eligibility.hero.eyebrow", locale)}
        title={t("partner.eligibility.hero.title", locale)}
        description={t("partner.eligibility.hero.description", locale)}
      />

      {mode === "none" ? (
        <CalloutPanel
          title={t("partner.eligibility.none.title", locale)}
          description={t("partner.eligibility.none.description", locale)}
        />
      ) : (
        <SurfaceCard
          kicker={mode}
          title={
            mode === "bank_card_inline"
              ? t("partner.eligibility.inline.title", locale)
              : t("partner.eligibility.reference.title", locale)
          }
          description={
            mode === "bank_card_inline"
              ? t("partner.eligibility.inline.description", locale)
              : t("partner.eligibility.reference.description", locale)
          }
        >
          <PartnerEligibilityForm mode={mode} />
        </SurfaceCard>
      )}

      <CalloutPanel
        title={t("partner.eligibility.negative.title", locale)}
        description={t("partner.eligibility.negative.description", locale)}
      >
        <ul className="panel-list">
          <li>{t("partner.eligibility.negative.eligible", locale)}</li>
          <li>{t("partner.eligibility.negative.ineligible", locale)}</li>
          <li>{t("partner.eligibility.negative.manualReview", locale)}</li>
        </ul>
      </CalloutPanel>
    </div>
  );
}
