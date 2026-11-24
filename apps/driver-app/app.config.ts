import type { ConfigContext, ExpoConfig } from "expo/config";

import staticApp from "./app.json";

const staticConfig = staticApp.expo as ExpoConfig;
const DEFAULT_PRODUCTION_API_URL = "https://api.smarttransport.tw";
const LEGACY_DIRECT_API_URL = "https://drts-api-kdhu6wzufa-uc.a.run.app";

function resolveConfiguredApiBaseUrl(
  ...candidates: Array<string | undefined>
): string {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim().replace(/\/+$/, "");
    if (trimmed && trimmed !== LEGACY_DIRECT_API_URL) {
      return trimmed;
    }
  }
  return DEFAULT_PRODUCTION_API_URL;
}

export default (context?: Partial<ConfigContext>): ExpoConfig => {
  const androidKey = process.env.GOOGLE_MAPS_ANDROID_KEY?.trim();
  const iosKey = process.env.GOOGLE_MAPS_IOS_KEY?.trim();
  const requireLiveMap =
    process.env.DRTS_REQUIRE_LIVE_MAP?.trim().toLowerCase() === "true";
  const reviewBaseUrl =
    process.env.EXPO_PUBLIC_REVIEW_BASE_PATH === "/review-driver"
      ? "/review-driver"
      : "";

  if (requireLiveMap && (!androidKey || !iosKey)) {
    throw new Error(
      "GOOGLE_MAPS_ANDROID_KEY and GOOGLE_MAPS_IOS_KEY are required for live driver map builds.",
    );
  }

  const baseConfig: ExpoConfig = {
    ...staticConfig,
    ...(context?.config ?? {}),
    extra: {
      ...(staticConfig.extra as Record<string, unknown> | undefined),
      ...((context?.config?.extra as Record<string, unknown> | undefined) ??
        {}),
    },
  };
  const configuredExtra = (baseConfig.extra ?? {}) as {
    apiBaseUrl?: string;
    [key: string]: unknown;
  };
  const apiBaseUrl = resolveConfiguredApiBaseUrl(
    process.env.EXPO_PUBLIC_API_URL,
    typeof configuredExtra.apiBaseUrl === "string"
      ? configuredExtra.apiBaseUrl
      : undefined,
    (staticConfig.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl,
  );

  return {
    ...baseConfig,
    ...(reviewBaseUrl
      ? { experiments: { ...baseConfig.experiments, baseUrl: reviewBaseUrl } }
      : {}),
    extra: {
      ...configuredExtra,
      apiBaseUrl,
    },
    android: {
      ...baseConfig.android,
      ...(androidKey
        ? {
            config: {
              ...baseConfig.android?.config,
              googleMaps: { apiKey: androidKey },
            },
          }
        : {}),
    },
    ios: {
      ...baseConfig.ios,
      ...(iosKey
        ? {
            config: {
              ...baseConfig.ios?.config,
              googleMapsApiKey: iosKey,
            },
          }
        : {}),
    },
  };
};
