import type { PublicInfoVersionRecord } from "@drts/contracts";

type PlacardSourceVersion =
  | Pick<PublicInfoVersionRecord, "status" | "title">
  | null
  | undefined;

export function isPlacardSourceSelectionBlocked(version: PlacardSourceVersion) {
  return version?.status === "retired";
}

export function getPreferredPlacardSourceVersion(
  versions: PublicInfoVersionRecord[],
) {
  return (
    versions.find((version) => version.status === "published") ??
    versions.find((version) => version.status === "draft") ??
    null
  );
}

export function formatPlacardSourceOptionLabel(
  version: Pick<PublicInfoVersionRecord, "status" | "title">,
) {
  if (version.status === "retired") {
    return `${version.title} (retired source unavailable)`;
  }

  return `${version.title} (${version.status})`;
}

export function getPlacardSourceSelectionHint(version: PlacardSourceVersion) {
  if (!version) {
    return "Select a source public info version to keep placard lineage traceable.";
  }

  if (version.status === "published") {
    return "Published source selected: generated placard will inherit the live disclosure timestamp.";
  }

  if (version.status === "retired") {
    return "Retired source selected: generate is blocked because placards must be linked to an active draft or published disclosure version.";
  }

  return "Draft source selected: generated placard stays draft until the linked public info is published.";
}

export const PLACARD_RETIRED_SOURCE_AUDIT_NOTE =
  "Retired public info versions remain visible for audit history, but cannot be used to generate new placards.";
