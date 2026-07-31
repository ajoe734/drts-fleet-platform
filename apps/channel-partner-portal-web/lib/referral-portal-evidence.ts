export type DataSource = "live" | "fallback";

export type ReferralPortalEvidence = {
  actorType: string;
  partnerEntrySlug: string;
  scopes: string[];
  source: DataSource;
  sourceDetails?: Record<string, DataSource>;
};

export function formatReferralPortalEvidence(
  evidence: ReferralPortalEvidence,
): string {
  const sourceDetailEntries = Object.entries(evidence.sourceDetails ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `drts-data-source-${key}:${value}`);

  return [
    `drts-data-source:${evidence.source}`,
    ...sourceDetailEntries,
    `drts-e2e-actor-type:${evidence.actorType}`,
    `drts-e2e-entry-slug:${evidence.partnerEntrySlug}`,
    `drts-e2e-scopes:${evidence.scopes.join(",") || "none"}`,
  ].join(" ");
}

export function mergeReferralPortalEvidence(
  ...entries: ReferralPortalEvidence[]
): ReferralPortalEvidence {
  const [first, ...rest] = entries;
  if (!first) {
    return {
      actorType: "unknown",
      partnerEntrySlug: "unknown",
      scopes: [],
      source: "fallback",
    };
  }

  const sourceDetails: Record<string, DataSource> = {
    ...(first.sourceDetails ?? {}),
  };

  let aggregateSource: DataSource = first.source;
  for (const entry of rest) {
    aggregateSource =
      aggregateSource === "live" && entry.source === "live"
        ? "live"
        : "fallback";
    Object.assign(sourceDetails, entry.sourceDetails ?? {});
  }

  if (Object.keys(sourceDetails).length === 0) {
    sourceDetails.aggregate = aggregateSource;
  }

  return {
    actorType: first.actorType,
    partnerEntrySlug: first.partnerEntrySlug,
    scopes: first.scopes,
    source: aggregateSource,
    sourceDetails,
  };
}
