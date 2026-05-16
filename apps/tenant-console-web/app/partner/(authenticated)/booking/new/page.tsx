import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { PartnerBookingCreateForm } from "@/app/partner/(authenticated)/booking/new/booking-create-form";
import { requirePartnerSession } from "@/lib/partner-session";

export const dynamic = "force-dynamic";

export default async function PartnerBookingCreatePage({
  searchParams,
}: {
  searchParams: Promise<{ eligibilityVerificationId?: string }>;
}) {
  const session = await requirePartnerSession();
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
        eyebrow="New booking"
        title="Create a partner-tagged booking."
        description="Pickup, dropoff, reservation window, passenger contact, and optional notes are required. The backend stamps `partnerEntrySlug` and (when verified) `eligibilityVerificationId` automatically."
      />

      {!isActive ? (
        <CalloutPanel
          title="Booking creation blocked"
          description={`Entry status is "${session.partnerEntry.status}". Contact platform admin before creating partner bookings.`}
          tone="warning"
        />
      ) : null}

      {requiresEligibility && !eligibilityVerificationId ? (
        <CalloutPanel
          title="Eligibility verification required"
          description="This entry requires an eligibility verification id before booking creation. Run the eligibility step and continue from there."
          tone="warning"
        />
      ) : null}

      <SurfaceCard
        kicker="Service"
        title={`Subtype fixed by entry: ${session.partnerEntry.businessDispatchSubtype}`}
        description="Service subtype is owned by the partner entry registration and is not editable from this surface. Quoted fare authority remains backend-only."
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
        title="Negative paths stop short of create"
        description="If the backend rejects the booking with `partner_entry_inactive`, `eligibility_required`, `eligibility_ineligible`, or `eligibility_manual_review`, the surface returns the rejection reason and never silently falls back to a tenant-admin path."
      />
    </div>
  );
}
