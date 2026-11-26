import { PLATFORM_CODE_REGISTRY, type PlatformCode } from "@drts/contracts";

// Driver-facing platform names. The registry display names are operator-facing:
// some are English descriptions rather than brands ("Forwarder Sandbox"), and a
// code the app does not know has no name at all. Drivers see brand names, a
// Chinese name for everything else, and never a raw platform code.

export const OTHER_PLATFORM_NAME = "其他平台";
export const FLEET_OWN_PLATFORM_NAME = "自營派單";

const DRIVER_PLATFORM_NAMES: Partial<Record<PlatformCode, string>> = {
  grab_taiwan: "Grab 台灣",
  forwarder_sandbox: "測試平台",
};

/**
 * The fleet's own dispatch source. Only these explicit codes count as the
 * fleet's own; an unknown code is another platform, never the fleet's own.
 */
export function isFleetOwnPlatformCode(platformCode: string): boolean {
  const normalized = platformCode.trim().toLowerCase();
  return (
    normalized === "drts" ||
    normalized === "owned" ||
    normalized.startsWith("drts-")
  );
}

export function isKnownPlatformCode(
  platformCode: string,
): platformCode is PlatformCode {
  return Object.prototype.hasOwnProperty.call(
    PLATFORM_CODE_REGISTRY,
    platformCode,
  );
}

/** A forwarder stub mirrors another platform's amounts for reference only. */
export function isReferenceOnlyPlatformCode(platformCode: string): boolean {
  return (
    isKnownPlatformCode(platformCode) &&
    PLATFORM_CODE_REGISTRY[platformCode].status === "forwarder_stub"
  );
}

export function getDriverPlatformName(platformCode: string): string {
  if (isFleetOwnPlatformCode(platformCode)) {
    return FLEET_OWN_PLATFORM_NAME;
  }
  if (!isKnownPlatformCode(platformCode)) {
    return OTHER_PLATFORM_NAME;
  }
  return (
    DRIVER_PLATFORM_NAMES[platformCode] ??
    PLATFORM_CODE_REGISTRY[platformCode].displayName
  );
}

/**
 * Names for a list of platform codes. Several unknown codes would otherwise
 * all read "其他平台", so they are numbered in a stable (sorted-code) order.
 */
export function getDriverPlatformNames(
  platformCodes: readonly string[],
): Map<string, string> {
  const unknown = Array.from(
    new Set(
      platformCodes.filter(
        (code) => !isFleetOwnPlatformCode(code) && !isKnownPlatformCode(code),
      ),
    ),
  ).sort();
  const names = new Map<string, string>();
  for (const code of platformCodes) {
    const unknownIndex = unknown.indexOf(code);
    names.set(
      code,
      unknownIndex >= 0 && unknown.length > 1
        ? `${OTHER_PLATFORM_NAME} ${unknownIndex + 1}`
        : getDriverPlatformName(code),
    );
  }
  return names;
}
