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

export function parseArtifactExpiry(
  artifactUrl: string | null | undefined,
): string | null {
  if (!artifactUrl) return null;
  try {
    const parsed = new URL(artifactUrl, "http://controlled-download.invalid");
    const expiresAt = parsed.searchParams.get("expires_at");
    if (!expiresAt) return null;
    return Number.isFinite(Date.parse(expiresAt)) ? expiresAt : null;
  } catch {
    return null;
  }
}

export function isArtifactExpired(
  artifactUrl: string | null | undefined,
): boolean {
  const expiresAt = parseArtifactExpiry(artifactUrl);
  if (!expiresAt) return false;
  return Date.parse(expiresAt) <= Date.now();
}

export function getPreferredLivePlacard<
  T extends { publishedAt: string | null; publicInfoVersionId: string },
>(
  placards: readonly T[],
  publicInfoById: Record<string, Pick<PublicInfoVersionRecord, "status"> | undefined>,
): T | null {
  // Prefer published placard whose public info source is active (not retired)
  const activePublished = placards.find((placard) => {
    if (placard.publishedAt == null) return false;
    const source = publicInfoById[placard.publicInfoVersionId];
    return source ? source.status !== "retired" : true;
  });

  return (
    activePublished ??
    placards.find((placard) => placard.publishedAt != null) ??
    placards[0] ??
    null
  );
}
