import type { ExpoConfig } from "expo/config";

import staticApp from "./app.json";

const staticConfig = staticApp.expo as ExpoConfig;

export default (): ExpoConfig => {
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

  return {
    ...staticConfig,
    ...(reviewBaseUrl
      ? { experiments: { ...staticConfig.experiments, baseUrl: reviewBaseUrl } }
      : {}),
    android: {
      ...staticConfig.android,
      ...(androidKey
        ? {
            config: {
              ...staticConfig.android?.config,
              googleMaps: { apiKey: androidKey },
            },
          }
        : {}),
    },
    ios: {
      ...staticConfig.ios,
      ...(iosKey
        ? {
            config: {
              ...staticConfig.ios?.config,
              googleMapsApiKey: iosKey,
            },
          }
        : {}),
    },
  };
};
