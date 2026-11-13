import { statSync } from "node:fs";
import { resolve } from "node:path";
import type { ExpoConfig } from "expo/config";

function configuredGoogleServicesFile(value: string | undefined) {
  const file = value?.trim();
  if (!file) return undefined;
  try {
    return statSync(resolve(__dirname, file)).isFile() ? file : undefined;
  } catch {
    return undefined;
  }
}

/** Primary temporary identifiers; original Store/signing decision is external. */
export default function passengerAppConfig(): ExpoConfig {
  const androidGoogleServicesFile = configuredGoogleServicesFile(
    process.env.PASSENGER_GOOGLE_SERVICES_ANDROID_FILE,
  );
  const iosGoogleServicesFile = configuredGoogleServicesFile(
    process.env.PASSENGER_GOOGLE_SERVICES_IOS_FILE,
  );
  const androidApiKey = process.env.GOOGLE_MAPS_ANDROID_KEY?.trim();
  const easProjectId = process.env.PASSENGER_APP_EAS_PROJECT_ID?.trim();
  const iosApsEnvironment =
    process.env.PASSENGER_IOS_APS_ENVIRONMENT?.trim() || "development";

  return {
    name: "智行乘客",
    slug: "drts-passenger-app",
    version: "0.1.0",
    scheme: "drtspassenger",
    orientation: "portrait",
    userInterfaceStyle: "light",
    plugins: [
      "expo-router",
      "expo-secure-store",
      ["expo-build-properties", { ios: { useFrameworks: "static" } }],
      "./plugins/with-passenger-firebase.cjs",
    ],
    ios: {
      bundleIdentifier: "com.cctechsupport.drts.passenger",
      supportsTablet: true,
      ...(iosGoogleServicesFile
        ? {
            googleServicesFile: iosGoogleServicesFile,
            entitlements: { "aps-environment": iosApsEnvironment },
            infoPlist: { UIBackgroundModes: ["remote-notification"] },
          }
        : {}),
    },
    android: {
      package: "com.cctechsupport.drts.passenger",
      ...(androidGoogleServicesFile
        ? { googleServicesFile: androidGoogleServicesFile }
        : {}),
      ...(androidApiKey
        ? { config: { googleMaps: { apiKey: androidApiKey } } }
        : {}),
    },
    extra: {
      ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
      passengerNativeNotifications: {
        iosConfigured: Boolean(iosGoogleServicesFile),
        androidConfigured: Boolean(androidGoogleServicesFile),
      },
      passengerNativeMaps: {
        androidApiKeyConfigured: Boolean(androidApiKey),
      },
    },
  };
}
