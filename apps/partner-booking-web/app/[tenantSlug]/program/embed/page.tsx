import { notFound } from "next/navigation";
import {
  AirportTransferSite,
  type AirportTransferBookingSubmission,
} from "@/components/airport-transfer-site";
import { submitEmbeddedAirportBooking } from "@/lib/embed-airport-booking";
import { getTenantProgramRouteContext } from "@/lib/program-route-context";
import { getAirportBank } from "@/lib/airport-site-data";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{
    apiKey?: string | string[];
    benefitReference?: string | string[];
    cardLast4?: string | string[];
    cardholderName?: string | string[];
    eligibilityVerificationId?: string | string[];
    flightNo?: string | string[];
    partnerUserRef?: string | string[];
    referenceToken?: string | string[];
  }>;
};

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function ProgramEmbedFlowPage({
  params,
  searchParams,
}: PageProps) {
  const { tenantSlug } = await params;
  const resolvedSearchParams = await searchParams;
  const { entry, theme } = await getTenantProgramRouteContext(tenantSlug);
  const bank = getAirportBank(tenantSlug);

  if (theme.kind !== "card" || !bank) {
    notFound();
  }

  const apiKey = getSingleValue(resolvedSearchParams.apiKey)?.trim() ?? null;
  const partnerUserRef =
    getSingleValue(resolvedSearchParams.partnerUserRef)?.trim() ?? null;
  const referenceToken =
    getSingleValue(resolvedSearchParams.referenceToken)?.trim() ?? null;
  const cardLast4 =
    getSingleValue(resolvedSearchParams.cardLast4)?.trim() ?? null;
  const cardholderName =
    getSingleValue(resolvedSearchParams.cardholderName)?.trim() ?? null;
  const benefitReference =
    getSingleValue(resolvedSearchParams.benefitReference)?.trim() ?? null;
  const flightNo =
    getSingleValue(resolvedSearchParams.flightNo)?.trim() ?? null;
  const existingEligibilityVerificationId =
    getSingleValue(resolvedSearchParams.eligibilityVerificationId)?.trim() ??
    null;

  async function submitBooking(submission: AirportTransferBookingSubmission) {
    "use server";

    return submitEmbeddedAirportBooking({
      tenantSlug,
      partnerEntry: entry,
      apiKey,
      partnerUserRef,
      referenceToken,
      cardLast4,
      cardholderName,
      benefitReference,
      flightNo,
      existingEligibilityVerificationId,
      submission,
    });
  }

  return (
    <AirportTransferSite
      bank={bank}
      mode="embed"
      onSubmitBooking={submitBooking}
      embedSessionReady={Boolean(apiKey && partnerUserRef)}
      embeddedPassengerName={cardholderName ?? partnerUserRef}
      embeddedCardLast4={cardLast4}
      initialFlightNo={flightNo}
    />
  );
}
