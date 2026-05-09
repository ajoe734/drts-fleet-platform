import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { PartnerEligibilityForm } from "@/app/partner/(authenticated)/eligibility/eligibility-form";
import { requirePartnerSession } from "@/lib/partner-session";

export const dynamic = "force-dynamic";

export default async function PartnerEligibilityPage() {
  const session = await requirePartnerSession();
  const mode = session.partnerEntry.eligibilityMode;

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Eligibility"
        title="Verify rider eligibility for this partner entry."
        description="The verification record returned here is the authoritative gate for partner booking creation. Only an `eligible` decision unlocks the booking surface."
      />

      {mode === "none" ? (
        <CalloutPanel
          title="Eligibility check not required"
          description="This entry is configured with `eligibility_mode = none`. Booking creation accepts the partner caller without verification."
        />
      ) : (
        <SurfaceCard
          kicker={mode}
          title={
            mode === "bank_card_inline"
              ? "Inline card verification"
              : "Reference-token verification"
          }
          description={
            mode === "bank_card_inline"
              ? "Card last 4 and cardholder name are required. The backend hashes the reference; raw card data is never persisted on this surface."
              : "Reference token and benefit reference are required. Optional flight number helps the issuer reference lookup pattern."
          }
        >
          <PartnerEligibilityForm mode={mode} />
        </SurfaceCard>
      )}

      <CalloutPanel
        title="Negative paths are explicit"
        description="The verification record may resolve as `eligible`, `ineligible`, or `manual_review`. The two negative outcomes never silently fall through into booking creation."
      >
        <ul className="panel-list">
          <li>
            <strong>eligible</strong>: booking create unlocks with the
            verification id stamped on the booking.
          </li>
          <li>
            <strong>ineligible</strong>: booking is denied; the partner sees the
            issuer reason code and may not retry without changing inputs.
          </li>
          <li>
            <strong>manual_review</strong>: booking is held in degraded mode;
            ops review is required before the rider can travel under benefit.
          </li>
        </ul>
      </CalloutPanel>
    </div>
  );
}
