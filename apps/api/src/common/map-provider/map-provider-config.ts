export type MapProviderBackend = "mock" | "google";

export type MapProviderEnvironment =
  | "local"
  | "ci"
  | "staging"
  | "production";

export type MapProviderConfigState = "configured" | "missing";

export type MapProviderHealthStatus = "healthy" | "degraded" | "down";

export type MapProviderHealthReport = {
  environment: MapProviderEnvironment;
  requestedBackend: MapProviderBackend;
  effectiveBackend: MapProviderBackend;
  status: MapProviderHealthStatus;
  failClosed: boolean;
  reason: string;
  invalidRequestedBackend: string | null;
  serverKeys: {
    geocoding: MapProviderConfigState;
    routes: MapProviderConfigState;
  };
  publicClient: {
    browserKey: MapProviderConfigState;
    allowedOrigins: string[];
  };
  mobile: {
    androidKey: MapProviderConfigState;
    androidPackage: MapProviderConfigState;
    androidSha1Certs: MapProviderConfigState;
    iosKey: MapProviderConfigState;
    iosBundleId: MapProviderConfigState;
  };
  quota: {
    monthlyBudgetUsd: number | null;
    alertThresholds: number[];
  };
  warnings: string[];
  criticalIssues: string[];
};

export type MapProviderRuntimeConfig = {
  environment: MapProviderEnvironment;
  requestedBackend: MapProviderBackend;
  effectiveBackend: MapProviderBackend;
  serverKeys: {
    geocodingConfigured: boolean;
    routesConfigured: boolean;
  };
  publicClient: {
    browserKeyConfigured: boolean;
    allowedOrigins: string[];
  };
  mobile: {
    androidKeyConfigured: boolean;
    androidPackageConfigured: boolean;
    androidSha1CertsConfigured: boolean;
    iosKeyConfigured: boolean;
    iosBundleIdConfigured: boolean;
  };
  quota: {
    monthlyBudgetUsd: number | null;
    alertThresholds: number[];
  };
};

type EnvLike = NodeJS.ProcessEnv;

const DEFAULT_BACKEND: MapProviderBackend = "mock";
const DEFAULT_ALERT_THRESHOLDS = [50, 80, 95] as const;

function normalizeString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function parseCsv(value: string | undefined): string[] {
  const normalized = normalizeString(value);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseMonthlyBudgetUsd(
  value: string | undefined,
  warnings: string[],
): number | null {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    warnings.push(
      "MAP_PROVIDER_MONTHLY_BUDGET_USD must be a positive number when provided; ignoring invalid value.",
    );
    return null;
  }

  return parsed;
}

function parseAlertThresholds(
  value: string | undefined,
  warnings: string[],
): number[] {
  const entries = parseCsv(value);
  if (entries.length === 0) {
    return [...DEFAULT_ALERT_THRESHOLDS];
  }

  const parsed = entries.map((entry) => Number(entry));
  const isValid =
    parsed.length > 0 &&
    parsed.every((entry) => Number.isFinite(entry) && entry > 0 && entry < 100);

  if (!isValid) {
    warnings.push(
      "MAP_PROVIDER_BUDGET_ALERT_PCT must be a comma- or semicolon-separated list of percentages between 0 and 100; falling back to 50,80,95.",
    );
    return [...DEFAULT_ALERT_THRESHOLDS];
  }

  return [...new Set(parsed)].sort((left, right) => left - right);
}

function detectEnvironment(env: EnvLike): MapProviderEnvironment {
  if ((env.CI ?? "").trim().toLowerCase() === "true") {
    return "ci";
  }

  const raw = (env.APP_ENV ?? env.NODE_ENV ?? "local").trim().toLowerCase();

  switch (raw) {
    case "prod":
    case "production":
      return "production";
    case "stage":
    case "staging":
      return "staging";
    case "ci":
      return "ci";
    default:
      return "local";
  }
}

function parseRequestedBackend(value: string | undefined): {
  backend: MapProviderBackend;
  invalidRequestedBackend: string | null;
} {
  const normalized = normalizeString(value)?.toLowerCase();
  if (!normalized) {
    return {
      backend: DEFAULT_BACKEND,
      invalidRequestedBackend: null,
    };
  }

  if (normalized === "mock" || normalized === "google") {
    return {
      backend: normalized,
      invalidRequestedBackend: null,
    };
  }

  return {
    backend: DEFAULT_BACKEND,
    invalidRequestedBackend: normalized,
  };
}

function toConfigState(value: string | undefined): MapProviderConfigState {
  return normalizeString(value) ? "configured" : "missing";
}

function isStrictRuntimeEnvironment(environment: MapProviderEnvironment): boolean {
  return environment === "staging" || environment === "production";
}

export function buildMapProviderHealthReport(
  env: EnvLike = process.env,
): MapProviderHealthReport {
  const warnings: string[] = [];
  const criticalIssues: string[] = [];
  const environment = detectEnvironment(env);
  const { backend: requestedBackend, invalidRequestedBackend } =
    parseRequestedBackend(env.MAP_PROVIDER_BACKEND);
  const geocodingState = toConfigState(env.GOOGLE_MAPS_GEOCODING_API_KEY);
  const routesState = toConfigState(env.GOOGLE_MAPS_ROUTES_API_KEY);
  const hasLiveServerKeys =
    geocodingState === "configured" && routesState === "configured";
  const strictRuntime = isStrictRuntimeEnvironment(environment);
  const quota = {
    monthlyBudgetUsd: parseMonthlyBudgetUsd(
      env.MAP_PROVIDER_MONTHLY_BUDGET_USD,
      warnings,
    ),
    alertThresholds: parseAlertThresholds(
      env.MAP_PROVIDER_BUDGET_ALERT_PCT,
      warnings,
    ),
  };
  const publicClient = {
    browserKey: toConfigState(env.GOOGLE_MAPS_BROWSER_KEY),
    allowedOrigins: parseCsv(env.MAP_PROVIDER_ALLOWED_ORIGINS),
  };
  const mobile = {
    androidKey: toConfigState(env.GOOGLE_MAPS_ANDROID_KEY),
    androidPackage: toConfigState(env.GOOGLE_MAPS_ANDROID_PACKAGE),
    androidSha1Certs: toConfigState(env.GOOGLE_MAPS_ANDROID_SHA1_CERTS),
    iosKey: toConfigState(env.GOOGLE_MAPS_IOS_KEY),
    iosBundleId: toConfigState(env.GOOGLE_MAPS_IOS_BUNDLE_ID),
  };

  if (invalidRequestedBackend) {
    criticalIssues.push(
      `MAP_PROVIDER_BACKEND must be one of: mock, google (received "${invalidRequestedBackend}").`,
    );
  }

  let effectiveBackend = requestedBackend;
  let status: MapProviderHealthStatus = "healthy";
  let failClosed = false;
  let reason = "Mock provider active.";

  if (requestedBackend === "google") {
    if (hasLiveServerKeys) {
      reason = "Google Maps backend credentials are configured.";
      if (publicClient.allowedOrigins.length === 0) {
        warnings.push(
          "MAP_PROVIDER_ALLOWED_ORIGINS is empty; document and provision browser-key referrer restrictions before enabling browser surfaces.",
        );
      }
      if (quota.monthlyBudgetUsd === null) {
        warnings.push(
          "MAP_PROVIDER_MONTHLY_BUDGET_USD is unset; quota alert thresholds are defined but no environment budget is recorded.",
        );
      }
    } else if (strictRuntime) {
      failClosed = true;
      status = "down";
      reason =
        "Google Maps live backend requested without both server-side API keys.";
      criticalIssues.push(
        "GOOGLE_MAPS_GEOCODING_API_KEY and GOOGLE_MAPS_ROUTES_API_KEY are required when MAP_PROVIDER_BACKEND=google in staging/production.",
      );
    } else {
      effectiveBackend = "mock";
      reason =
        "Mock fallback active because Google Maps server-side API keys are absent in local/CI.";
      warnings.push(
        "GOOGLE_MAPS_GEOCODING_API_KEY and GOOGLE_MAPS_ROUTES_API_KEY are absent; local/CI stays on the deterministic mock provider.",
      );
    }
  }

  if (criticalIssues.length > 0) {
    status = failClosed ? "down" : "degraded";
  }

  return {
    environment,
    requestedBackend,
    effectiveBackend,
    status,
    failClosed,
    reason,
    invalidRequestedBackend,
    serverKeys: {
      geocoding: geocodingState,
      routes: routesState,
    },
    publicClient,
    mobile,
    quota,
    warnings,
    criticalIssues,
  };
}

export function resolveMapProviderRuntimeConfig(
  env: EnvLike = process.env,
): MapProviderRuntimeConfig {
  const report = buildMapProviderHealthReport(env);

  if (report.invalidRequestedBackend) {
    throw new Error(report.criticalIssues[0] ?? "Invalid MAP_PROVIDER_BACKEND.");
  }

  if (report.failClosed) {
    throw new Error(
      report.criticalIssues[0] ??
        "Map provider runtime is configured to fail closed.",
    );
  }

  return {
    environment: report.environment,
    requestedBackend: report.requestedBackend,
    effectiveBackend: report.effectiveBackend,
    serverKeys: {
      geocodingConfigured: report.serverKeys.geocoding === "configured",
      routesConfigured: report.serverKeys.routes === "configured",
    },
    publicClient: {
      browserKeyConfigured: report.publicClient.browserKey === "configured",
      allowedOrigins: [...report.publicClient.allowedOrigins],
    },
    mobile: {
      androidKeyConfigured: report.mobile.androidKey === "configured",
      androidPackageConfigured: report.mobile.androidPackage === "configured",
      androidSha1CertsConfigured:
        report.mobile.androidSha1Certs === "configured",
      iosKeyConfigured: report.mobile.iosKey === "configured",
      iosBundleIdConfigured: report.mobile.iosBundleId === "configured",
    },
    quota: {
      monthlyBudgetUsd: report.quota.monthlyBudgetUsd,
      alertThresholds: [...report.quota.alertThresholds],
    },
  };
}
