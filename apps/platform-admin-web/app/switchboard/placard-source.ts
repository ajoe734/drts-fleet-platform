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
