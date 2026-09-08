import {
  STATUS_TONES,
  type StatusToneName,
  type ToneRamp,
  type TokenMode,
} from "@drts/ui-tokens";
import type {
  EnvironmentResolutionInput,
  HealthResolutionInput,
  RuntimeEnvironment,
  RuntimeHealthStatus,
} from "./types";

/**
 * Resolves the authoritative runtime environment.
 *
 * Requirements:
 * 1. env must come from explicit runtime authoritative values, NEVER guessed from domain or hostname strings.
 * 2. If fixture or mock mode is active, environment is NEVER production (fixture/dev is never labeled production).
 * 3. Empty, undefined, null, or unrecognized environment strings resolve to "unknown", NEVER defaulting to production.
 */
export function resolveRuntimeEnvironment(
  input?: EnvironmentResolutionInput,
): RuntimeEnvironment {
  if (!input) {
    return "unknown";
  }

  // Rule 2: If mock or fixture data is loaded, it is NEVER production
  if (input.isFixture || input.isMock) {
    return "mock";
  }

  // Prioritize primary authoritative environment variables: appEnv or env (e.g. DRTS_ENV, APP_ENV)
  const primaryEnv = (input.appEnv || input.env || "").trim().toLowerCase();
  if (primaryEnv) {
    // Rule 1: Reject URL / domain guessing: do NOT infer production from a URL or hostname
    if (
      primaryEnv.includes("/") ||
      primaryEnv.includes("http:") ||
      primaryEnv.includes("https:") ||
      primaryEnv.includes(".com") ||
      primaryEnv.includes(".io") ||
      primaryEnv.includes(".internal")
    ) {
      return "unknown";
    }

    if (primaryEnv === "production" || primaryEnv === "prod") {
      return "production";
    }
    if (primaryEnv === "staging" || primaryEnv === "stage") {
      return "staging";
    }
    if (primaryEnv === "preview") {
      return "preview";
    }
    if (primaryEnv === "sandbox") {
      return "sandbox";
    }
    if (primaryEnv === "dev" || primaryEnv === "development" || primaryEnv === "local") {
      return "dev";
    }
    if (primaryEnv === "mock" || primaryEnv === "fixture" || primaryEnv === "test") {
      return "mock";
    }

    return "unknown";
  }

  // Fallback to nodeEnv:
  // NODE_ENV is a build mode / runtime optimization flag, NOT a deployment tier.
  // NODE_ENV=production alone does NOT establish production deployment tier; it must resolve to unknown.
  const nodeEnv = (input.nodeEnv || "").trim().toLowerCase();
  if (nodeEnv) {
    if (nodeEnv === "production" || nodeEnv === "prod") {
      return "unknown";
    }
    if (nodeEnv === "dev" || nodeEnv === "development" || nodeEnv === "local") {
      return "dev";
    }
    if (nodeEnv === "test" || nodeEnv === "testing" || nodeEnv === "mock" || nodeEnv === "fixture") {
      return "mock";
    }
  }

  return "unknown";
}

/**
 * Resolves runtime health without falsely claiming healthy for unknown/unverified data.
 *
 * Rule: prod and all environments must NOT label unverified or unknown data as healthy.
 */
export function resolveRuntimeHealth(
  input?: HealthResolutionInput,
): RuntimeHealthStatus {
  if (!input) {
    return "unknown";
  }

  if (input.responseOk === false) {
    return "down";
  }

  if (input.status === undefined || input.status === null || input.status === "") {
    return "unknown";
  }

  const normalized = String(input.status).trim().toLowerCase();
  if (normalized === "healthy" || normalized === "ok" || normalized === "up") {
    return "healthy";
  }
  if (normalized === "degraded" || normalized === "warning" || normalized === "warn") {
    return "degraded";
  }
  if (
    normalized === "down" ||
    normalized === "unhealthy" ||
    normalized === "outage" ||
    normalized === "error"
  ) {
    return "down";
  }
  if (normalized === "checking" || normalized === "pending") {
    return "checking";
  }

  return "unknown";
}

export interface EnvironmentDisplayMetadata {
  tone: StatusToneName;
  colors: ToneRamp;
  labelEn: string;
  labelZhTW: string;
}

export function getEnvironmentDisplay(
  env: RuntimeEnvironment,
  mode: TokenMode = "light",
): EnvironmentDisplayMetadata {
  switch (env) {
    case "production":
      return {
        tone: "success",
        colors: STATUS_TONES.success[mode],
        labelEn: "PRODUCTION",
        labelZhTW: "正式環境",
      };
    case "staging":
      return {
        tone: "info",
        colors: STATUS_TONES.info[mode],
        labelEn: "STAGING",
        labelZhTW: "預發環境",
      };
    case "preview":
      return {
        tone: "info",
        colors: STATUS_TONES.info[mode],
        labelEn: "PREVIEW",
        labelZhTW: "預覽環境",
      };
    case "sandbox":
      return {
        tone: "warning",
        colors: STATUS_TONES.warning[mode],
        labelEn: "SANDBOX",
        labelZhTW: "沙盒環境",
      };
    case "dev":
      return {
        tone: "warning",
        colors: STATUS_TONES.warning[mode],
        labelEn: "DEVELOPMENT",
        labelZhTW: "開發環境",
      };
    case "mock":
      return {
        tone: "neutral",
        colors: STATUS_TONES.neutral[mode],
        labelEn: "MOCK DATA",
        labelZhTW: "模擬資料",
      };
    case "unknown":
    default:
      return {
        tone: "neutral",
        colors: STATUS_TONES.neutral[mode],
        labelEn: "UNKNOWN",
        labelZhTW: "未知環境",
      };
  }
}

export function getHealthDisplay(
  health: RuntimeHealthStatus,
  mode: TokenMode = "light",
): { tone: StatusToneName; colors: ToneRamp; labelEn: string; labelZhTW: string } {
  switch (health) {
    case "healthy":
      return {
        tone: "success",
        colors: STATUS_TONES.success[mode],
        labelEn: "Healthy",
        labelZhTW: "健康",
      };
    case "degraded":
      return {
        tone: "warning",
        colors: STATUS_TONES.warning[mode],
        labelEn: "Degraded",
        labelZhTW: "降級",
      };
    case "down":
      return {
        tone: "danger",
        colors: STATUS_TONES.danger[mode],
        labelEn: "Outage",
        labelZhTW: "失聯",
      };
    case "checking":
      return {
        tone: "info",
        colors: STATUS_TONES.info[mode],
        labelEn: "Checking",
        labelZhTW: "檢查中",
      };
    case "unknown":
    default:
      return {
        tone: "neutral",
        colors: STATUS_TONES.neutral[mode],
        labelEn: "Unknown",
        labelZhTW: "未知狀態",
      };
  }
}
