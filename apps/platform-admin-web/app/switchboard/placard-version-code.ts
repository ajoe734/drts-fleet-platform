import type { PlacardVersionRecord } from "@drts/contracts";

type Locale = "en" | "zh";

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
  locale: Locale,
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

  return locale === "zh"
    ? `版本代碼已存在於提示牌 ${conflict.placardVersionId}，請先改用唯一代碼再產生。`
    : `Version code already exists in placard ${conflict.placardVersionId}. Choose a unique code before generating.`;
}
