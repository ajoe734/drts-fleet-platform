import { notFound, redirect } from "next/navigation";
import { PartnerBookingForm } from "@/components/partner-booking-form";
import {
  PartnerAuthorityError,
  getPartnerRouteContext,
} from "@/lib/api-client";
import { createDefaultPartnerBookingDraft } from "@/lib/partner-booking-form";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{
    eligibilityVerificationId?: string | string[];
  }>;
};

export default async function PartnerBookPage({
  params,
  searchParams,
}: PageProps) {
  const { tenantSlug } = await params;
  const resolvedSearchParams = await searchParams;
  try {
    const { brand, entry } = await getPartnerRouteContext(tenantSlug);
    const eligibilityVerificationId =
      (Array.isArray(resolvedSearchParams.eligibilityVerificationId)
        ? resolvedSearchParams.eligibilityVerificationId[0]
        : resolvedSearchParams.eligibilityVerificationId) ?? null;

    if (!entry) {
      redirect(`/${tenantSlug}/inactive`);
    }

    return (
      <PartnerBookingForm
        brand={brand}
        entry={entry}
        eligibilityVerificationId={eligibilityVerificationId}
        initialDraft={createDefaultPartnerBookingDraft()}
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
