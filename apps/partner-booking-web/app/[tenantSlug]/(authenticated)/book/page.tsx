import { notFound, redirect } from "next/navigation";
import { PartnerBookingForm } from "@/components/partner-booking-form";
import {
  PartnerAuthorityError,
  getPartnerRouteContext,
} from "@/lib/api-client";
import {
  createDefaultPartnerBookingDraft,
  type PartnerBookingSubmission,
  type PartnerBookingActionResult,
} from "@/lib/partner-booking-form";
import { submitPartnerProgramBooking } from "@/lib/submit-partner-booking";
import { getServerLocale } from "@/lib/server-locale";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{
    eligibilityVerificationId?: string | string[];
    partnerUserRef?: string | string[];
    referenceToken?: string | string[];
  }>;
};

export default async function PartnerBookPage({
  params,
  searchParams,
}: PageProps) {
  const { tenantSlug } = await params;
  const resolvedSearchParams = await searchParams;
  const eligibilityVerificationId =
    (Array.isArray(resolvedSearchParams.eligibilityVerificationId)
      ? resolvedSearchParams.eligibilityVerificationId[0]
      : resolvedSearchParams.eligibilityVerificationId) ?? null;
  const single = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value)?.trim() || null;
  const partnerUserRef = single(resolvedSearchParams.partnerUserRef);
  const referenceToken = single(resolvedSearchParams.referenceToken);
  const locale = await getServerLocale();

  async function submitBooking(
    submission: PartnerBookingSubmission,
  ): Promise<PartnerBookingActionResult> {
    "use server";
    return submitPartnerProgramBooking({
      tenantSlug,
      partnerUserRef,
      referenceToken,
      eligibilityVerificationId,
      submission,
      locale,
    });
  }

  try {
    const { brand, entry, provenance } = await getPartnerRouteContext(
      tenantSlug,
      {
        allowAuthorityOutage: true,
      },
    );

    if (!entry) {
      const persistentQuery = eligibilityVerificationId
        ? `?${new URLSearchParams({
            eligibilityVerificationId,
          }).toString()}`
        : "";
      if (provenance.fallbackCode) {
        redirect(`/${tenantSlug}/manual_review${persistentQuery}`);
      }
      redirect(`/${tenantSlug}/inactive${persistentQuery}`);
    }

    const isNoncore =
      entry.businessDispatchSubtype === "travel_agency_transfer" ||
      entry.businessDispatchSubtype === "insurance_replacement_vehicle";
    const initialDraft = createDefaultPartnerBookingDraft();
    if (isNoncore) {
      // These defaults were produced in the BFF's timezone. Carry the instant,
      // then let the browser format its datetime-local fields after hydration.
      initialDraft.reservationWindowStart = new Date(
        initialDraft.reservationWindowStart,
      ).toISOString();
      initialDraft.reservationWindowEnd = new Date(
        initialDraft.reservationWindowEnd,
      ).toISOString();
      initialDraft.replacementStart = new Date(
        initialDraft.replacementStart,
      ).toISOString();
      initialDraft.replacementEnd = new Date(
        initialDraft.replacementEnd,
      ).toISOString();
    }
    return (
      <PartnerBookingForm
        brand={brand}
        entry={entry}
        eligibilityVerificationId={eligibilityVerificationId}
        initialDraft={initialDraft}
        {...(isNoncore ? { submitBookingAction: submitBooking } : {})}
      />
    );
  } catch (error) {
    if (error instanceof PartnerAuthorityError) {
      if (error.code === "PARTNER_ENTRY_NOT_FOUND") {
        notFound();
      }
      if (error.code === "PARTNER_ENTRY_INACTIVE") {
        redirect(`/${tenantSlug}/inactive`);
      }
    }
    throw error;
  }
}
