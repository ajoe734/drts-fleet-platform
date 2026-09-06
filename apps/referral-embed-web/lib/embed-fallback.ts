import type {
  PartnerChannelEntryRecord,
  ReferralEmbedSession,
} from "@drts/contracts";

export function buildStandaloneFallbackUrl(context: {
  entry: PartnerChannelEntryRecord;
  session?: ReferralEmbedSession | null;
  handoff: { partnerUserRef?: string | null };
}): string | null {
  const branding = context.entry.brandingMetadata as
    | { fallbackUrl?: string | null }
    | null
    | undefined;
  const configuredBase =
    process.env.NEXT_PUBLIC_REFERRAL_FALLBACK_URL?.trim() ||
    process.env.REFERRAL_FALLBACK_URL?.trim() ||
    branding?.fallbackUrl?.trim();

  if (!configuredBase) {
    return null;
  }

  try {
    const url = new URL(configuredBase);
    url.searchParams.set("source", "referral_embed");
    url.searchParams.set("entrySlug", context.entry.entrySlug);
    url.searchParams.set("partnerCode", context.entry.partnerCode);
    if (context.handoff.partnerUserRef) {
      url.searchParams.set("partnerUserRef", context.handoff.partnerUserRef);
    }
    if (context.session?.drtsPassengerId) {
      url.searchParams.set("drtsPassengerId", context.session.drtsPassengerId);
    }
    return url.toString();
  } catch {
    return null;
  }
}
