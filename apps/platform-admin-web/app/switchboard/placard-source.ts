import type { PublicInfoVersionRecord } from "@drts/contracts";
import type { Locale } from "../../lib/translations";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "../../lib/localized-labels";

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
  locale: Locale,
) {
  if (version.status === "retired") {
    return getPlatformLabel(locale, "placardRetiredSourceUnavailable", {
      title: version.title,
    });
  }

  return `${version.title} (${formatPlatformCodeLabel(locale, version.status)})`;
}

export function getPlacardSourceSelectionHint(
  version: PlacardSourceVersion,
  locale: Locale,
) {
  if (!version) {
    return getPlatformLabel(locale, "placardSourceNone");
  }

  if (version.status === "published") {
    return getPlatformLabel(locale, "placardSourcePublished");
  }

  if (version.status === "retired") {
    return getPlatformLabel(locale, "placardSourceRetired");
  }

  return getPlatformLabel(locale, "placardSourceDraft");
}

export function getPlacardRetiredSourceAuditNote(locale: Locale) {
  return getPlatformLabel(locale, "placardRetiredSourceAuditNote");
}
