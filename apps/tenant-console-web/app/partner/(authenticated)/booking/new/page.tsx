import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { PartnerBookingCreateForm } from "@/app/partner/(authenticated)/booking/new/booking-create-form";
import { requirePartnerSession } from "@/lib/partner-session";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function PartnerBookingCreatePage({
  searchParams,
}: {
  searchParams: Promise<{ eligibilityVerificationId?: string }>;
}) {
  const session = await requirePartnerSession();
  const locale = await getServerLocale();
  const resolvedSearchParams = (await searchParams) ?? {};
  const eligibilityVerificationId =
    typeof resolvedSearchParams.eligibilityVerificationId === "string"
      ? resolvedSearchParams.eligibilityVerificationId
      : "";
  const requiresEligibility = session.partnerEntry.eligibilityMode !== "none";
  const isActive = session.partnerEntry.status === "active";

  return (
    <div className="page-shell">
      <PageHero
        eyebrow={t("partner.bookingNew.hero.eyebrow", locale)}
        title={t("partner.bookingNew.hero.title", locale)}
        description={t("partner.bookingNew.hero.description", locale)}
      />

      {!isActive ? (
        <CalloutPanel
          title={t("partner.bookingNew.blocked.title", locale)}
          description={t("partner.bookingNew.blocked.description", locale, {
            status: session.partnerEntry.status,
          })}
          tone="warning"
        />
      ) : null}

      {requiresEligibility && !eligibilityVerificationId ? (
        <CalloutPanel
          title={t("partner.bookingNew.requiresEligibility.title", locale)}
          description={t(
            "partner.bookingNew.requiresEligibility.description",
            locale,
          )}
          tone="warning"
        />
      ) : null}

      <SurfaceCard
        kicker={t("partner.bookingNew.service.kicker", locale)}
        title={t("partner.bookingNew.service.title", locale, {
          subtype: session.partnerEntry.businessDispatchSubtype,
        })}
        description={t("partner.bookingNew.service.description", locale)}
      >
        <PartnerBookingCreateForm
          canSubmit={
            isActive &&
            (!requiresEligibility ||
              eligibilityVerificationId.trim().length > 0)
          }
          eligibilityRequired={requiresEligibility}
          eligibilityVerificationId={eligibilityVerificationId}
        />
      </SurfaceCard>

      <CalloutPanel
        title={t("partner.bookingNew.negative.title", locale)}
        description={t("partner.bookingNew.negative.description", locale)}
      />
    </div>
  );
}
