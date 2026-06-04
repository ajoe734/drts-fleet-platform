import type { PlacardVersionRecord } from "@drts/contracts";

export function normalizePlacardVersionCode(versionCode: string) {
  return versionCode.trim().toLowerCase();
}

export function findPlacardVersionCodeConflict(
  versionCode: string,
  placards: readonly Pick<
    PlacardVersionRecord,
    "placardVersionId" | "versionCode"
  >[],
) {
  const normalizedVersionCode = normalizePlacardVersionCode(versionCode);
  if (!normalizedVersionCode) {
    return null;
  }

  return (
    placards.find(
      (placard) =>
        normalizePlacardVersionCode(placard.versionCode) ===
        normalizedVersionCode,
    ) ?? null
  );
}
