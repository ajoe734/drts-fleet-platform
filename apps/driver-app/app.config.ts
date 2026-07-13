import type { ExpoConfig } from "expo/config";

import staticApp from "./app.json";

const staticConfig = staticApp.expo as ExpoConfig;

export default (): ExpoConfig => {
  const androidKey = process.env.GOOGLE_MAPS_ANDROID_KEY?.trim();
  const iosKey = process.env.GOOGLE_MAPS_IOS_KEY?.trim();
  const requireLiveMap =
    process.env.DRTS_REQUIRE_LIVE_MAP?.trim().toLowerCase() === "true";

  if (requireLiveMap && (!androidKey || !iosKey)) {
    throw new Error(
      "GOOGLE_MAPS_ANDROID_KEY and GOOGLE_MAPS_IOS_KEY are required for live driver map builds.",
    );
  }

  return {
    ...staticConfig,
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
