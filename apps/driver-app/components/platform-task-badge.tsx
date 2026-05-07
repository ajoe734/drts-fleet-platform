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

function isOwnedPlatform(code: string) {
  return code === "owned" || code === "direct";
}

export function PlatformTaskBadge({
  platformCode,
}: {
  platformCode: string | null;
}) {
  const normalizedCode = platformCode?.trim().toLowerCase() ?? "owned";
  const code = normalizedCode.length > 0 ? normalizedCode : "owned";
  const label = PLATFORM_LABELS[code] ?? humanizePlatformCode(code);

  return (
    <PlatformBadge
      code={code}
      name={label}
      forwarded={!isOwnedPlatform(code)}
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
  const normalizedCode = platformCode?.trim().toLowerCase() ?? "owned";
  const code = normalizedCode.length > 0 ? normalizedCode : "owned";
  const label = PLATFORM_LABELS[code] ?? humanizePlatformCode(code);

  if (isOwnedPlatform(code)) {
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
