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

export function getPlacardVersionCodePrecheckMessage(
  versionCode: string,
  placards: readonly Pick<
    PlacardVersionRecord,
    "placardVersionId" | "versionCode"
  >[],
) {
  const conflict = findPlacardVersionCodeConflict(versionCode, placards);
  if (!conflict) {
    return null;
  }

  return `Version code already exists in placard ${conflict.placardVersionId}. Choose a unique code before generating.`;
}
