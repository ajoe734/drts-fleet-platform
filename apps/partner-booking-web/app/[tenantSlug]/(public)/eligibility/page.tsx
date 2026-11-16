import { notFound, redirect } from "next/navigation";
import { PartnerEligibilityForm } from "@/components/partner-eligibility-form";
import {
  PartnerAuthorityError,
  getPartnerRouteContext,
} from "@/lib/api-client";
import { verifyPartnerBookingEligibility } from "@/lib/submit-partner-booking";
import type {
  PartnerEligibilitySubmission,
  PartnerEligibilityActionResult,
} from "@/lib/partner-booking-form";
import { getServerLocale } from "@/lib/server-locale";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
  searchParams?: Promise<{
    partnerUserRef?: string | string[];
    referenceToken?: string | string[];
  }>;
};

export default async function PartnerEligibilityPage({
  params,
  searchParams,
}: PageProps) {
  const { tenantSlug } = await params;
  const query = (await searchParams) ?? {};
  const single = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value)?.trim() || null;
  const partnerUserRef = single(query.partnerUserRef);
  const referenceToken = single(query.referenceToken);
  const locale = await getServerLocale();
  async function verifyEligibility(
    submission: PartnerEligibilitySubmission,
  ): Promise<PartnerEligibilityActionResult> {
    "use server";
    return verifyPartnerBookingEligibility({
      tenantSlug,
      partnerUserRef,
      referenceToken,
      submission,
      locale,
    });
  }
  try {
    const { brand, entry } = await getPartnerRouteContext(tenantSlug);
    if (!entry) notFound();
    return (
      <PartnerEligibilityForm
        brand={brand}
        entrySlug={entry.entrySlug}
        partnerUserRef={partnerUserRef}
        eligibilityMode={entry.eligibilityMode}
        hasReferenceToken={Boolean(referenceToken)}
        verifyEligibilityAction={verifyEligibility}
      />
    );
  } catch (error) {
    if (error instanceof PartnerAuthorityError) {
      if (error.code === "PARTNER_ENTRY_NOT_FOUND") notFound();
      if (error.code === "PARTNER_ENTRY_INACTIVE")
        redirect("/" + encodeURIComponent(tenantSlug) + "/inactive");
    }
    throw error;
  }
}
