import { notFound, redirect } from "next/navigation";
import { PartnerBookingForm } from "@/components/partner-booking-form";
import {
  PartnerAuthorityError,
  buildLocalReferencePartnerEntry,
  getPartnerRouteContext,
} from "@/lib/api-client";
import { resolvePartnerMapProviderMode } from "@/lib/partner-map-provider";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{
    eligibilityVerificationId?: string | string[];
    mapProviderState?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PartnerBookPage({
  params,
  searchParams,
}: PageProps) {
  const { tenantSlug } = await params;
  const resolvedSearchParams = await searchParams;
  try {
    // Degrade to the local reference shell when the authority is unreachable so
    // the assisted-entry map picker still renders during a backend outage. A
    // definitive NOT_FOUND / INACTIVE verdict is still honoured below.
    const { brand, entry } = await getPartnerRouteContext(tenantSlug, {
      allowAuthorityOutage: true,
    });
    const eligibilityVerificationId =
      firstParam(resolvedSearchParams.eligibilityVerificationId) ?? null;
    // The partner funnel picker uses a self-contained mock geo provider whose
    // health is driven per-navigation, so QA can exercise the provider-outage
    // manual-review path without a live geo backend.
    const mapProviderState = resolvePartnerMapProviderMode(
      firstParam(resolvedSearchParams.mapProviderState),
    );

    return (
      <PartnerBookingForm
        brand={brand}
        entry={entry ?? buildLocalReferencePartnerEntry(tenantSlug)}
        eligibilityVerificationId={eligibilityVerificationId}
        mapProviderState={mapProviderState}
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
