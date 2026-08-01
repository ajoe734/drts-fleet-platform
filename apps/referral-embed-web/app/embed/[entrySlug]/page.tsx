import { notFound } from "next/navigation";
import { PassengerEmbed } from "@/components/passenger-embed";
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

  return <PassengerEmbed context={context} />;
}
