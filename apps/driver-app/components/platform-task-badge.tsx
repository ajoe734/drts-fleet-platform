import React from "react";
import { AuthorityBanner, PlatformBadge } from "@/components/ui";

const PLATFORM_LABELS: Record<string, string> = {
  direct: "自營派單",
  owned: "自營派單",
  uber: "Uber",
  lyft: "Lyft",
  grab: "Grab",
  gojek: "Gojek",
  bolt: "Bolt",
  didi: "DiDi",
};

function humanizePlatformCode(platformCode: string) {
  return platformCode
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function normalizePlatformCode(platformCode: string | null | undefined) {
  const normalizedCode = platformCode?.trim().toLowerCase() ?? "owned";
  return normalizedCode.length > 0 ? normalizedCode : "owned";
}

export function isOwnedPlatformCode(code: string) {
  return code === "owned" || code === "direct";
}

export function getPlatformDisplayLabel(
  platformCode: string | null | undefined,
) {
  const code = normalizePlatformCode(platformCode);
  return PLATFORM_LABELS[code] ?? humanizePlatformCode(code);
}

export function PlatformTaskBadge({
  platformCode,
}: {
  platformCode: string | null;
}) {
  const code = normalizePlatformCode(platformCode);
  const label = getPlatformDisplayLabel(code);

  return (
    <PlatformBadge
      code={code}
      name={label}
      forwarded={!isOwnedPlatformCode(code)}
      size="sm"
    />
  );
}

export function PlatformAuthorityBanner({
  platformCode,
  description,
}: {
  platformCode: string | null;
  description: string;
}) {
  const code = normalizePlatformCode(platformCode);
  const label = getPlatformDisplayLabel(code);

  if (isOwnedPlatformCode(code)) {
    return (
      <AuthorityBanner
        title="自營派單 · DRTS"
        authorityLabel="本地可操作"
        description={description}
        tone="owned"
        icon="shield-checkmark"
      />
    );
  }

  return (
    <AuthorityBanner
      title={`平台主導 · ${label}`}
      authorityLabel="來源平台規則生效"
      description={description}
      tone="platform"
      icon="swap-horizontal"
    />
  );
}

export default PlatformTaskBadge;
