import { notFound } from "next/navigation";
import { PassengerEmbed } from "@/components/passenger-embed";
import {
  getReferralActiveTripServer,
  getReferralTripHistoryServer,
  getReferralTripReceiptServer,
} from "@/lib/embed-booking-api";
import { resolveEmbedContext } from "@/lib/embed-context";
import { isPublicPartnerEntryNotFoundError } from "@/lib/embed-api";

export default async function PassengerEmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ entrySlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { entrySlug } = await params;
  const query = await searchParams;
  // Only authority-confirmed missing/revoked/inactive entries become a 404.
  // Connectivity, gateway, and other upstream failures must reach error.tsx so
  // operators and riders do not receive a misleading "entry missing" result.
  // Auth/handoff failures for a valid entry remain explicit reauth/fallback
  // states inside resolveEmbedContext.
  let context: Awaited<ReturnType<typeof resolveEmbedContext>>;
  try {
    context = await resolveEmbedContext(
      Object.assign(
        { entrySlug },
        typeof query.state === "string" ? { state: query.state } : null,
        typeof query.screen === "string" ? { screen: query.screen } : null,
        typeof query.entryHost === "string"
          ? { entryHost: query.entryHost }
          : null,
      ),
    );
  } catch (error) {
    if (isPublicPartnerEntryNotFoundError(error)) {
      notFound();
    }
    throw error;
  }

  let liveData: Parameters<typeof PassengerEmbed>[0]["liveData"] = null;

  if (context.state === "handoff") {
    const screen = typeof query.screen === "string" ? query.screen : "book";
    const shouldLoadActive =
      screen === "trip" ||
      screen === "receipt" ||
      screen === "completed" ||
      screen === "cancelled";
    const shouldLoadHistory =
      screen === "trips" ||
      screen === "receipt" ||
      screen === "completed" ||
      screen === "cancelled";

    const activeTrip = shouldLoadActive
      ? await getReferralActiveTripServer().catch(() => null)
      : null;
    const history = shouldLoadHistory
      ? await getReferralTripHistoryServer().catch(() => null)
      : null;
    const selectedOrderId =
      typeof query.orderId === "string" ? query.orderId : null;
    const receiptOrderId =
      selectedOrderId ?? activeTrip?.trip?.orderId ?? history?.items?.[0]?.orderId ?? null;
    const receipt =
      screen === "receipt" && receiptOrderId
        ? await getReferralTripReceiptServer(receiptOrderId).catch(() => null)
        : null;

    liveData = { activeTrip, history, receipt, selectedOrderId };
  }

  return <PassengerEmbed context={context} liveData={liveData} />;
}
