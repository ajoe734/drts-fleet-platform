import {
  classifyDriverRequestFailure,
  recordDriverDiagnostic,
} from "@/lib/driver-diagnostics";

/**
 * Fail-open feature flag reads for the driver app.
 *
 * IMPORTANT — why this module exists:
 *
 * The flag endpoints behind `ApiClient.getFeatureFlags()` and
 * `ApiClient.isFeatureEnabled()` are administrative endpoints. They are guarded
 * by `@RequireRealms("system", "platform")` plus `@RequireScopes("foundation:read")`
 * (apps/api/src/modules/feature-flags/feature-flags.controller.ts:17-24), while a
 * driver's device-bound session is issued in the `driver` realm
 * (apps/api/src/modules/auth/driver-device-session.service.ts).
 *
 * A real driver token therefore *always* gets rejected by those endpoints. That
 * is expected behaviour, not an outage, and it must never be treated as a
 * degraded workspace. Every read here resolves; it never rejects. On failure we
 * fall back to the last known good value, then to the built-in default (enabled),
 * so a driver keeps full functionality when flags cannot be read.
 */

export type DriverFeatureSource = "remote" | "cache" | "default";

export type DriverFeatureReadResult = {
  enabled: boolean;
  source: DriverFeatureSource;
};

export type DriverFeatureSummaryResult = {
  available: boolean;
  source: DriverFeatureSource;
  enabledKeys: string[];
};

/** Minimal structural client shape, so callers can pass `null` safely. */
export type DriverFeatureFlagClient = {
  isFeatureEnabled?: (key: string) => Promise<boolean>;
  getFeatureFlags?: (query?: {
    tenantId?: string;
  }) => Promise<{ flags?: Array<{ key: string; enabled: boolean }> }>;
};

/**
 * Driver-facing capabilities default to ON. The driver app has no
 * driver-realm flag endpoint to consult, so withholding a screen because a flag
 * could not be read would break the app for every real driver.
 */
export const DRIVER_FEATURE_DEFAULTS: Record<string, boolean> = {
  "driver-app.shift": true,
  "driver-app.tasks": true,
  "driver-app.earnings": true,
};

const lastKnownGood = new Map<string, boolean>();

/** Default for a key that has never been read successfully. */
export function getDriverFeatureDefault(key: string): boolean {
  return DRIVER_FEATURE_DEFAULTS[key] ?? true;
}

/** Test helper: drops every cached flag value. */
export function resetDriverFeatureCache(): void {
  lastKnownGood.clear();
}

/** Current last-known-good cache snapshot. For tests and internal inspection. */
export function getDriverFeatureCacheSnapshot(): Record<string, boolean> {
  return Object.fromEntries(lastKnownGood.entries());
}

function fallbackFor(key: string, reason: string): DriverFeatureReadResult {
  const cached = lastKnownGood.get(key);
  recordDriverDiagnostic({
    kind: "feature_flag_fallback",
    reason,
    requestResults: { feature_flags: "failed" },
  });

  if (cached !== undefined) {
    return { enabled: cached, source: "cache" };
  }

  return { enabled: getDriverFeatureDefault(key), source: "default" };
}

/**
 * Reads a single feature flag. Always resolves — never rejects — so callers can
 * `await` it directly without a try/catch and without it ever contributing to a
 * degraded-workspace decision.
 */
export async function readDriverFeature(
  client: DriverFeatureFlagClient | null | undefined,
  key: string,
): Promise<DriverFeatureReadResult> {
  if (!client || typeof client.isFeatureEnabled !== "function") {
    const cached = lastKnownGood.get(key);
    return cached !== undefined
      ? { enabled: cached, source: "cache" }
      : { enabled: getDriverFeatureDefault(key), source: "default" };
  }

  try {
    const enabled = await client.isFeatureEnabled(key);
    const normalized = enabled !== false;
    lastKnownGood.set(key, normalized);
    return { enabled: normalized, source: "remote" };
  } catch (error: unknown) {
    return fallbackFor(
      key,
      `feature_flag_read_failed:${key}:${classifyDriverRequestFailure(error)}`,
    );
  }
}

/**
 * Reads the whole flag summary and warms the last-known-good cache from it.
 * Always resolves. `available: false` simply means "the driver realm cannot see
 * the admin flag list", which is the normal production case.
 */
export async function readDriverFeatureSummary(
  client: DriverFeatureFlagClient | null | undefined,
): Promise<DriverFeatureSummaryResult> {
  if (!client || typeof client.getFeatureFlags !== "function") {
    return {
      available: false,
      source: "default",
      enabledKeys: Object.keys(DRIVER_FEATURE_DEFAULTS).filter((key) =>
        getDriverFeatureDefault(key),
      ),
    };
  }

  try {
    const summary = await client.getFeatureFlags();
    const flags = Array.isArray(summary?.flags) ? summary.flags : [];
    for (const flag of flags) {
      if (flag && typeof flag.key === "string") {
        lastKnownGood.set(flag.key, flag.enabled !== false);
      }
    }

    return {
      available: true,
      source: "remote",
      enabledKeys: flags
        .filter((flag) => flag.enabled !== false)
        .map((flag) => flag.key),
    };
  } catch (error: unknown) {
    recordDriverDiagnostic({
      kind: "feature_flag_fallback",
      reason: `feature_flag_summary_failed:${classifyDriverRequestFailure(error)}`,
      requestResults: { feature_flags: "failed" },
    });

    const cachedKeys = [...lastKnownGood.entries()]
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);

    return {
      available: false,
      source: lastKnownGood.size > 0 ? "cache" : "default",
      enabledKeys:
        cachedKeys.length > 0
          ? cachedKeys
          : Object.keys(DRIVER_FEATURE_DEFAULTS).filter((key) =>
              getDriverFeatureDefault(key),
            ),
    };
  }
}
