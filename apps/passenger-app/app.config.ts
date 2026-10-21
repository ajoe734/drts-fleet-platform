import type { ExpoConfig } from "expo/config";

/** Primary temporary identifiers; original Store/signing decision is external. */
export default function passengerAppConfig(): ExpoConfig {
  return {
    name: "智行乘客",
    slug: "drts-passenger-app",
    version: "0.1.0",
    scheme: "drtspassenger",
    orientation: "portrait",
    userInterfaceStyle: "light",
    plugins: ["expo-router", "expo-secure-store"],
    ios: {
      bundleIdentifier: "com.cctechsupport.drts.passenger",
      supportsTablet: true,
    },
    android: { package: "com.cctechsupport.drts.passenger" },
  };
}
