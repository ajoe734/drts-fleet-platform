import { notFound } from "next/navigation";
import {
  AirportTransferSite,
  type AirportTransferBookingSubmission,
} from "@/components/airport-transfer-site";
import {
  loadEmbeddedAirportTracking,
  submitEmbeddedAirportBooking,
} from "@/lib/embed-airport-booking";
import { getTenantProgramRouteContext } from "@/lib/program-route-context";
import { getAirportBank } from "@/lib/airport-site-data";
import { ProgramBookingFlow } from "@/lib/program-screens";
import { getServerLocale } from "@/lib/server-locale";

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
  const locale = await getServerLocale();
  const resolvedSearchParams = await searchParams;
  const { entry, inactive, theme } =
    await getTenantProgramRouteContext(tenantSlug);
  const bank = getAirportBank(tenantSlug);

  if (theme.kind !== "card" || !bank) {
    notFound();
  }

  const partnerUserRef =
    getSingleValue(resolvedSearchParams.partnerUserRef)?.trim() ?? null;
  const apiKey = getSingleValue(resolvedSearchParams.apiKey)?.trim() ?? null;
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
  const embedSessionReady = Boolean(partnerUserRef);

  if (!entry || inactive) {
    notFound();
  }

  if (!embedSessionReady) {
    return (
      <ProgramBookingFlow
        theme={theme}
        screen="embed_fallback"
        basePath={`/${tenantSlug}/program/embed`}
        locale={locale}
        surface="embed"
      />
    );
  }

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
      locale,
      submission,
    });
  }

  async function loadTracking(orderId: string) {
    "use server";

    return loadEmbeddedAirportTracking({
      tenantSlug,
      partnerEntry: entry,
      apiKey,
      partnerUserRef,
      locale,
      orderId,
    });
  }

  return (
    <AirportTransferSite
      bank={bank}
      mode="embed"
      onSubmitBooking={submitBooking}
      onLoadTracking={loadTracking}
      embedSessionReady={embedSessionReady}
      embeddedPassengerName={cardholderName ?? partnerUserRef}
      embeddedCardLast4={cardLast4}
      initialFlightNo={flightNo}
      embedReferenceToken={referenceToken}
      embedBenefitReference={benefitReference}
      defaultRideDate={new Date(Date.now() + 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)}
    />
  );
}
