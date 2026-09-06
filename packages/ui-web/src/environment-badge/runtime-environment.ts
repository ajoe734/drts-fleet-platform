import type { StatusToneName } from "@drts/ui-tokens";
import type { LocalizedDisplayString } from "@drts/ui-tokens";

/**
 * Runtime-authoritative environment tiers. This intentionally has no
 * "healthy default" — an app deployed with no recognizable env signal must
 * surface as `unknown`, never silently render as `production` or `local`.
 * Mirrors the precedence used by the API's `detectAuthEnvironment`
 * (apps/api/src/config/auth-startup-config.ts): DRTS_ENV, then APP_ENV, then
 * NODE_ENV as a last resort (NODE_ENV is unreliable on its own because
 * `next build` always bakes in NODE_ENV=production regardless of which real
 * deployment tier consumes that build).
 */
export type RuntimeEnvironmentTier =
  | "production"
  | "staging"
  | "test"
  | "local"
  | "unknown";

export interface RuntimeEnvironmentSource {
  DRTS_ENV?: string;
  APP_ENV?: string;
  NODE_ENV?: string;
  CI?: string;
}

export function resolveRuntimeEnvironmentTier(
  source: RuntimeEnvironmentSource,
): RuntimeEnvironmentTier {
  const raw = (source.DRTS_ENV ?? source.APP_ENV ?? source.NODE_ENV)
    ?.trim()
    .toLowerCase();

  if (raw === "prod" || raw === "production") {
    return "production";
  }
  if (raw === "stage" || raw === "staging") {
    return "staging";
  }
  if (raw === "test" || raw === "testing" || raw === "ci") {
    return "test";
  }
  if (
    raw === "dev" ||
    raw === "development" ||
    raw === "local" ||
    raw === "sandbox"
  ) {
    return "local";
  }

  if (raw) {
    // A value is present but does not match a known tier. Do not guess —
    // an unrecognized signal is not the same thing as a verified tier.
    return "unknown";
  }

  if ((source.CI ?? "").trim().toLowerCase() === "true") {
    return "test";
  }

  return "unknown";
}

export const RUNTIME_ENVIRONMENT_TIERS = [
  "production",
  "staging",
  "test",
  "local",
  "unknown",
] as const satisfies readonly RuntimeEnvironmentTier[];

export const RUNTIME_ENVIRONMENT_TIER_DISPLAY_STRINGS = {
  production: { en: "Production", zhTW: "正式環境" },
  staging: { en: "Staging", zhTW: "測試環境" },
  test: { en: "Test", zhTW: "測試環境" },
  local: { en: "Local / Development", zhTW: "本機開發環境" },
  unknown: { en: "Unknown Environment", zhTW: "環境未知" },
} as const satisfies Record<RuntimeEnvironmentTier, LocalizedDisplayString>;

/**
 * `unknown` is mapped to `warning`, not `neutral` — an unresolved
 * environment signal should read as "needs attention", not as a quiet,
 * healthy-looking badge. `production` is `danger` so operators stay
 * cautious about high-stakes, irreversible actions.
 */
export const RUNTIME_ENVIRONMENT_TIER_TONE = {
  production: "danger",
  staging: "warning",
  test: "info",
  local: "neutral",
  unknown: "warning",
} as const satisfies Record<RuntimeEnvironmentTier, StatusToneName>;
