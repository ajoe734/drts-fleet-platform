// S3-FIX-DRIVER-SOS-VOCAB-001 — driver-side runtime profile capability gate.
//
// Source of truth:
//   docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/source_specs/
//     02_ui_visual_design_team_brief_20260720.md §1.2 (runtime profile) / §1.3
//   packages/contracts/src/phase1-p5-s3-multi-taxi.ts (capability contract)
//   apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts
//     GET /regulatory-registry/passenger-runtime-profiles/:code
//
// The forbidden-capability list is imported from @drts/contracts rather than
// re-declared here, so a change to MULTI_TAXI_FORBIDDEN_CAPABILITIES reaches
// every screen gate without a second edit site.
//
// Why this resolves synchronously and never awaits the API: the first consumer
// is the S-3 SOS surface, which must render with no network (§ "撥號功能不依賴
// 行動網路"). A capability gate that resolved over HTTP would either block the
// SOS screen or briefly render the forbidden UI before the response landed.
// The profile is a build-time property of the shipped app, so it is read from
// the Expo public env at module scope.

import {
  MULTI_TAXI_FORBIDDEN_CAPABILITIES,
  RUNTIME_PROFILE_CODES,
  type MultiTaxiForbiddenCapability,
  type RuntimeProfileCode,
} from "@drts/contracts";

// §1.2: the P-5 / S-3 product ships as multi_taxi_direct. Any other profile is
// an explicit opt-out, never a default.
export const DEFAULT_DRIVER_RUNTIME_PROFILE_CODE: RuntimeProfileCode =
  "multi_taxi_direct";

// Mirrors the regulatory-registry runtime-profile endpoint. Only
// multi_taxi_direct declares forbidden capabilities; ordinary_taxi and
// business_dispatch are the aggregating profiles whose driver surfaces
// legitimately show cross-platform order state.
const FORBIDDEN_CAPABILITIES_BY_PROFILE: Record<
  RuntimeProfileCode,
  readonly MultiTaxiForbiddenCapability[]
> = {
  multi_taxi_direct: MULTI_TAXI_FORBIDDEN_CAPABILITIES,
  ordinary_taxi: [],
  business_dispatch: [],
};

function isRuntimeProfileCode(value: string): value is RuntimeProfileCode {
  return (RUNTIME_PROFILE_CODES as readonly string[]).includes(value);
}

/**
 * Resolve the runtime profile this driver build operates under.
 *
 * Fails closed: an unset, empty, or unrecognised override resolves to
 * multi_taxi_direct — the most restrictive profile — so a typo in the build
 * env can never unlock a forbidden surface.
 */
export function getDriverRuntimeProfileCode(): RuntimeProfileCode {
  const configured = process.env.EXPO_PUBLIC_DRTS_RUNTIME_PROFILE?.trim();
  if (configured && isRuntimeProfileCode(configured)) {
    return configured;
  }

  return DEFAULT_DRIVER_RUNTIME_PROFILE_CODE;
}

export function getDriverForbiddenCapabilities(): readonly MultiTaxiForbiddenCapability[] {
  return FORBIDDEN_CAPABILITIES_BY_PROFILE[getDriverRuntimeProfileCode()];
}

/**
 * True when the active runtime profile forbids the capability, meaning the
 * corresponding UI must be absent from the component tree.
 *
 * §1.3: "不得以 CSS 隱藏既有多平台元件後交稿" — callers must not render the
 * element and hide it; they must not construct it at all.
 */
export function isDriverCapabilityForbidden(
  capability: MultiTaxiForbiddenCapability,
): boolean {
  return getDriverForbiddenCapabilities().includes(capability);
}
