import type { PublicInfoVersionRecord } from "@drts/contracts";

type Locale = "en" | "zh";

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
  locale: Locale,
  version: Pick<PublicInfoVersionRecord, "status" | "title">,
) {
  if (version.status === "retired") {
    return locale === "zh"
      ? `${version.title}（已退役，無法作為來源）`
      : `${version.title} (retired source unavailable)`;
  }

  if (locale === "zh") {
    const statusLabel =
      version.status === "published"
        ? "已發布"
        : version.status === "draft"
          ? "草稿"
          : version.status;
    return `${version.title}（${statusLabel}）`;
  }

  return `${version.title} (${version.status})`;
}

export function getPlacardSourceSelectionHint(
  locale: Locale,
  version: PlacardSourceVersion,
) {
  if (!version) {
    return locale === "zh"
      ? "請先選擇來源公開資訊版本，以維持提示牌來源可追溯。"
      : "Select a source public info version to keep placard lineage traceable.";
  }

  if (version.status === "published") {
    return locale === "zh"
      ? "已選擇已發布來源：新提示牌會沿用即時揭露時間戳。"
      : "Published source selected: generated placard will inherit the live disclosure timestamp.";
  }

  if (version.status === "retired") {
    return locale === "zh"
      ? "已選擇退役來源：無法產生，因為提示牌必須綁定至有效草稿或已發布揭露版本。"
      : "Retired source selected: generate is blocked because placards must be linked to an active draft or published disclosure version.";
  }

  return locale === "zh"
    ? "已選擇草稿來源：在關聯公開資訊發布前，提示牌會維持草稿狀態。"
    : "Draft source selected: generated placard stays draft until the linked public info is published.";
}

export function getPlacardRetiredSourceAuditNote(locale: Locale) {
  return locale === "zh"
    ? "退役公開資訊版本仍會保留於稽核歷史中，但不可再用來產生新的提示牌。"
    : "Retired public info versions remain visible for audit history, but cannot be used to generate new placards.";
}
