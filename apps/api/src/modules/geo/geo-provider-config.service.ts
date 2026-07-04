import { Inject, Injectable, Optional } from "@nestjs/common";

import type { GeoProviderHealthResponse } from "@drts/contracts";

const PRODUCTION_ENVIRONMENTS = new Set([
  "production",
  "prod",
  "staging",
  "stage",
]);
const SUPPORTED_PROVIDER_MODES = new Set(["mock", "external", "disabled"]);
const SUPPORTED_EXTERNAL_PROVIDER_NAMES = new Set(["google"]);
const DEFAULT_WARNING_THRESHOLD = 80;
const DEFAULT_CRITICAL_THRESHOLD = 95;

type Env = Record<string, string | undefined>;
const GEO_PROVIDER_CONFIG_ENV = "GEO_PROVIDER_CONFIG_ENV";

@Injectable()
export class GeoProviderConfigService {
  constructor(
    @Optional()
    @Inject(GEO_PROVIDER_CONFIG_ENV)
    private readonly env: Env = process.env,
  ) {}

  getHealth(): GeoProviderHealthResponse {
    const environment = this.environment();
    const rawMode = this.rawProviderMode();
    const providerName = this.providerName();
    const mode: GeoProviderHealthResponse["mode"] =
      SUPPORTED_PROVIDER_MODES.has(rawMode)
        ? (rawMode as GeoProviderHealthResponse["mode"])
        : "disabled";
    const productionLike = PRODUCTION_ENVIRONMENTS.has(environment);
    const allowMockInProduction =
      this.booleanValue("MAP_PROVIDER_ALLOW_MOCK_IN_PROD") === true;
    const serverKeyConfigured = this.hasValue("MAP_PROVIDER_SERVER_KEY");
    const browserKeyConfigured = this.hasValue("MAP_PROVIDER_BROWSER_KEY");
    const requiredSecretNames =
      mode === "external"
        ? ["MAP_PROVIDER_SERVER_KEY", "MAP_PROVIDER_BROWSER_KEY"]
        : [];
    const missingSecretNames = requiredSecretNames.filter(
      (name) => !this.hasValue(name),
    );
    const dailyLimit = this.positiveInteger("MAP_PROVIDER_DAILY_QUOTA");
    const minuteLimit = this.positiveInteger("MAP_PROVIDER_MINUTE_QUOTA");
    const dailyUsed = this.nonNegativeInteger("MAP_PROVIDER_DAILY_QUOTA_USED");
    const minuteUsed = this.nonNegativeInteger(
      "MAP_PROVIDER_MINUTE_QUOTA_USED",
    );
    const warningThresholdPercent = this.percent(
      "MAP_PROVIDER_QUOTA_WARNING_PERCENT",
      DEFAULT_WARNING_THRESHOLD,
    );
    const criticalThresholdPercent = this.percent(
      "MAP_PROVIDER_QUOTA_CRITICAL_PERCENT",
      DEFAULT_CRITICAL_THRESHOLD,
    );
    const usagePercent = this.quotaUsagePercent({
      dailyLimit,
      minuteLimit,
      dailyUsed,
      minuteUsed,
    });
    const checks: GeoProviderHealthResponse["checks"] = [];

    if (!SUPPORTED_PROVIDER_MODES.has(rawMode)) {
      checks.push({
        name: "provider_mode",
        status: "fail",
        message:
          "MAP_PROVIDER_MODE must be one of mock, external, or disabled.",
      });
    } else {
      checks.push({
        name: "provider_mode",
        status: "pass",
        message: `MAP_PROVIDER_MODE=${rawMode}.`,
      });
    }

    if (mode === "disabled") {
      checks.push({
        name: "provider_enabled",
        status: "fail",
        message:
          "Map/geocode provider is disabled; geo operations fail closed.",
      });
    }

    if (mode === "mock" && productionLike && !allowMockInProduction) {
      checks.push({
        name: "mock_provider_production_guard",
        status: "fail",
        message:
          "Production-like environments cannot use mock geo provider unless MAP_PROVIDER_ALLOW_MOCK_IN_PROD=true.",
      });
    }

    if (mode === "external" && missingSecretNames.length > 0) {
      checks.push({
        name: "server_secret",
        status: "fail",
        message: `Missing required provider secret(s): ${missingSecretNames.join(
          ", ",
        )}.`,
      });
    } else if (mode === "external") {
      checks.push({
        name: "server_secret",
        status: "pass",
        message: "Required provider server/browser secrets are configured.",
      });
    }

    if (mode === "external") {
      if (!SUPPORTED_EXTERNAL_PROVIDER_NAMES.has(providerName)) {
        checks.push({
          name: "provider_name",
          status: "fail",
          message: `MAP_PROVIDER_NAME=${providerName} is not supported; runtime currently supports only google in external mode.`,
        });
      } else {
        checks.push({
          name: "provider_name",
          status: "pass",
          message: `MAP_PROVIDER_NAME=${providerName}.`,
        });
        checks.push({
          name: "external_adapter",
          status: "pass",
          message: `External geo provider adapter is configured for ${providerName}.`,
        });
      }
    }

    const allowedOrigins = this.csv("MAP_PROVIDER_ALLOWED_ORIGINS");
    if (mode === "external" && productionLike && allowedOrigins.length === 0) {
      checks.push({
        name: "browser_key_restrictions",
        status: "warn",
        message:
          "MAP_PROVIDER_ALLOWED_ORIGINS is empty; browser key origin restrictions must be configured before exposing map UI.",
      });
    }

    const hasFailure = checks.some((check) => check.status === "fail");
    const hasWarning = checks.some((check) => check.status === "warn");
    const status = hasFailure
      ? "unhealthy"
      : hasWarning
        ? "degraded"
        : "healthy";

    return {
      provider: mode === "mock" ? "mock" : providerName,
      mode,
      status,
      environment,
      generatedAt: new Date().toISOString(),
      failClosed: status === "unhealthy",
      mockAllowed:
        mode === "mock" && (!productionLike || allowMockInProduction),
      requiredSecretNames,
      missingSecretNames,
      quota: {
        dailyLimit,
        minuteLimit,
        dailyUsed,
        minuteUsed,
        usagePercent,
        status: this.quotaStatus(
          mode,
          usagePercent,
          warningThresholdPercent,
          criticalThresholdPercent,
        ),
        warningThresholdPercent,
        criticalThresholdPercent,
        policy: mode === "mock" ? "mock_unlimited" : "provider_enforced",
      },
      keyRestrictions: {
        browserAllowedOrigins: allowedOrigins,
        mobileBundleIds: this.csv("MAP_PROVIDER_MOBILE_BUNDLE_IDS"),
        mobilePackageNames: this.csv("MAP_PROVIDER_MOBILE_PACKAGE_NAMES"),
        serverKeyConfigured,
        browserKeyConfigured,
      },
      checks,
    };
  }

  private environment() {
    return this.text("DRTS_ENV", this.text("NODE_ENV", "development"))
      .trim()
      .toLowerCase();
  }

  private rawProviderMode() {
    return this.text("MAP_PROVIDER_MODE", "mock").trim().toLowerCase();
  }

  private providerName() {
    return this.text("MAP_PROVIDER_NAME", "google").trim().toLowerCase();
  }

  private hasValue(name: string) {
    return this.text(name, "").trim().length > 0;
  }

  private text(name: string, fallback: string) {
    const value = this.env[name];
    return value === undefined || value === null || value.trim().length === 0
      ? fallback
      : value;
  }

  private booleanValue(name: string) {
    const value = this.text(name, "").trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(value)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(value)) {
      return false;
    }
    return null;
  }

  private csv(name: string) {
    return this.text(name, "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }

  private positiveInteger(name: string) {
    const raw = this.text(name, "");
    if (!raw) {
      return null;
    }
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  private nonNegativeInteger(name: string) {
    const raw = this.text(name, "");
    if (!raw) {
      return null;
    }
    const value = Number(raw);
    return Number.isInteger(value) && value >= 0 ? value : null;
  }

  private percent(name: string, fallback: number) {
    const raw = this.text(name, "");
    if (!raw) {
      return fallback;
    }
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 && value <= 100
      ? value
      : fallback;
  }

  private quotaUsagePercent(input: {
    dailyLimit: number | null;
    minuteLimit: number | null;
    dailyUsed: number | null;
    minuteUsed: number | null;
  }) {
    const explicit = this.nonNegativeNumber("MAP_PROVIDER_QUOTA_USAGE_PERCENT");
    if (explicit !== null) {
      return this.roundPercent(explicit);
    }

    const candidates: number[] = [];
    if (input.dailyLimit && input.dailyUsed !== null) {
      candidates.push((input.dailyUsed / input.dailyLimit) * 100);
    }
    if (input.minuteLimit && input.minuteUsed !== null) {
      candidates.push((input.minuteUsed / input.minuteLimit) * 100);
    }
    if (candidates.length === 0) {
      return null;
    }
    return this.roundPercent(Math.max(...candidates));
  }

  private quotaStatus(
    mode: GeoProviderHealthResponse["mode"],
    usagePercent: number | null,
    warningThresholdPercent: number,
    criticalThresholdPercent: number,
  ): GeoProviderHealthResponse["quota"]["status"] {
    if (usagePercent !== null && usagePercent >= criticalThresholdPercent) {
      return "critical";
    }
    if (usagePercent !== null && usagePercent >= warningThresholdPercent) {
      return "warning";
    }
    if (mode === "mock") {
      return "healthy";
    }
    if (usagePercent === null) {
      return "unknown";
    }
    return "healthy";
  }

  private nonNegativeNumber(name: string) {
    const raw = this.text(name, "");
    if (!raw) {
      return null;
    }
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  private roundPercent(value: number) {
    return Math.round(value * 10) / 10;
  }
}
