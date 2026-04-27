import type { PlacardVersionRecord } from "@drts/contracts";
import type { Locale } from "@/lib/translations";
import { getPlatformLabel } from "@/lib/localized-labels";

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
  locale: Locale,
) {
  const conflict = findPlacardVersionCodeConflict(versionCode, placards);
  if (!conflict) {
    return null;
  }

  return getPlatformLabel(locale, "placardVersionCodeConflict", {
    placardId: conflict.placardVersionId,
  });
}
