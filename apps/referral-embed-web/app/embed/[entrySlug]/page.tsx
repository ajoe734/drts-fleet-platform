import { notFound } from "next/navigation";
import { PassengerEmbed } from "@/components/passenger-embed";
import { resolveEmbedContext } from "@/lib/embed-context";

export default async function PassengerEmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ entrySlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { entrySlug } = await params;
  const query = await searchParams;
  // resolveEmbedContext resolves the partner entry by slug; an unknown/invalid
  // entrySlug means there is no such referral channel → 404, not a 500. (The
  // embed component hard-depends on a present entry, so it cannot render a
  // degraded state without one.) Auth/handoff failures for a VALID entry are
  // already handled inside resolveEmbedContext as reauth/fallback states.
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
        typeof query.apiKey === "string" ? { apiKey: query.apiKey } : null,
        typeof query.partnerUserRef === "string"
          ? { partnerUserRef: query.partnerUserRef }
          : null,
      ),
    );
  } catch {
    notFound();
  }

  return <PassengerEmbed context={context} />;
}
