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
  const context = await resolveEmbedContext(
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

  return <PassengerEmbed context={context} />;
}
