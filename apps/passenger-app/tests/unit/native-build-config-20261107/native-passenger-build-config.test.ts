import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExpoConfig } from "expo/config";
import type {
  ExportedConfig,
  ExportedConfigWithProps,
} from "expo/config-plugins";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// GREEN-only: these modules are new configuration wiring, not causal RED inputs.
// Only stat metadata is simulated. The repo plugin and the installed RNFirebase
// helpers really register mods; no mod is invoked and no prebuild/native build runs.
const external = vi.hoisted(() => ({
  regularFiles: new Set<string>(),
  directories: new Set<string>(),
  statCalls: [] as string[],
}));
vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs")>()),
  statSync(path: import("node:fs").PathLike) {
    const filename = String(path);
    external.statCalls.push(filename);
    if (external.regularFiles.has(filename)) return { isFile: () => true };
    if (external.directories.has(filename)) return { isFile: () => false };
    throw new Error("SIM stat: file absent or inaccessible");
  },
}));

import passengerAppConfig from "../../../app.config";
import { readNativePassengerBootstrapConfig } from "../../../lib/config";

const appRoot = fileURLToPath(new URL("../../../", import.meta.url));
const requireApp = createRequire(
  new URL("../../../package.json", import.meta.url),
);
const { withStaticPlugin } = requireApp("expo/config-plugins") as Pick<
  typeof import("expo/config-plugins"),
  "withStaticPlugin"
>;
const plugin = "./plugins/with-passenger-firebase.cjs";
const ANDROID_FILE = "/sim-native-build/google-services.json";
const IOS_FILE = "/sim-native-build/GoogleService-Info.plist";
const envKeys = [
  "PASSENGER_GOOGLE_SERVICES_ANDROID_FILE",
  "PASSENGER_GOOGLE_SERVICES_IOS_FILE",
  "PASSENGER_IOS_APS_ENVIRONMENT",
  "GOOGLE_MAPS_ANDROID_KEY",
  "EXPO_PUBLIC_PASSENGER_MODE",
  "EXPO_PUBLIC_PASSENGER_API_BASE_URL",
  "EXPO_PUBLIC_PASSENGER_OAUTH_CALLBACK_URI",
  "EXPO_PUBLIC_PASSENGER_NOTIFICATION_CONSENT_VERSION",
];

function register(config: ExpoConfig): ExportedConfig {
  // Expo's actual loader resolves the repo-owned CJS plugin from the app root.
  // RNFirebase package/plugin modules are not mocked or replaced by fake helpers.
  return withStaticPlugin(config, { plugin, projectRoot: appRoot });
}
function originalIdentity(config: ExpoConfig) {
  expect(config).toMatchObject({
    name: "智行乘客",
    slug: "drts-passenger-app",
    version: "0.1.0",
    scheme: "drtspassenger",
    orientation: "portrait",
    userInterfaceStyle: "light",
    ios: {
      bundleIdentifier: "com.cctechsupport.drts.passenger",
      supportsTablet: true,
    },
    android: { package: "com.cctechsupport.drts.passenger" },
  });
  expect(config.plugins?.slice(0, 2)).toEqual([
    "expo-router",
    "expo-secure-store",
  ]);
  expect(config.plugins).toContainEqual([
    "expo-build-properties",
    { ios: { useFrameworks: "static" } },
  ]);
  expect(config.plugins).toContain(plugin);
}
function notificationMetadata(config: ExpoConfig) {
  return config.extra?.passengerNativeNotifications;
}
function keys(config: ExportedConfig, platform: "ios" | "android") {
  return Object.keys(config.mods?.[platform] ?? {}).sort();
}
function expectRegistered(config: ExportedConfig, platform: "ios" | "android") {
  for (const mod of Object.values(config.mods?.[platform] ?? {}))
    expect(typeof mod).toBe("function");
}

beforeEach(() => {
  external.regularFiles.clear();
  external.directories.clear();
  external.statCalls.length = 0;
  for (const key of envKeys) vi.stubEnv(key, undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("GREEN-only native passenger build config and actual Firebase mod registration", () => {
  it("keeps ordinary no-file configuration valid and preserves identifiers, plugins and existing platform mods", () => {
    const config = passengerAppConfig();
    originalIdentity(config);
    expect(notificationMetadata(config)).toEqual({
      iosConfigured: false,
      androidConfigured: false,
    });
    expect(config.extra?.passengerNativeMaps).toEqual({
      androidApiKeyConfigured: false,
    });
    expect(config.ios?.googleServicesFile).toBeUndefined();
    expect(config.android?.googleServicesFile).toBeUndefined();
    expect(config.ios?.entitlements).toBeUndefined();
    expect(config.ios?.infoPlist).toBeUndefined();
    expect(config.android?.config).toBeUndefined();
    expect(external.statCalls).toEqual([]);
    const iosExisting = vi.fn((value: ExportedConfigWithProps) => value);
    const androidExisting = vi.fn((value: ExportedConfigWithProps) => value);
    const input: ExportedConfig = {
      ...config,
      mods: {
        ios: { infoPlist: iosExisting },
        android: { strings: androidExisting },
      },
    };
    const registered = register(input);
    expect(keys(registered, "ios")).toEqual(["infoPlist"]);
    expect(keys(registered, "android")).toEqual(["strings"]);
    expect(registered.mods?.ios?.infoPlist).toBe(iosExisting);
    expect(registered.mods?.android?.strings).toBe(androidExisting);
    expect(iosExisting).not.toHaveBeenCalled();
    expect(androidExisting).not.toHaveBeenCalled();
  });

  it("configures only iOS official init and plist mods, with APS environment and no Android or GPS configuration", () => {
    external.regularFiles.add(IOS_FILE);
    vi.stubEnv("PASSENGER_GOOGLE_SERVICES_IOS_FILE", `  ${IOS_FILE}  `);
    const config = passengerAppConfig();
    originalIdentity(config);
    expect(notificationMetadata(config)).toEqual({
      iosConfigured: true,
      androidConfigured: false,
    });
    expect(config.ios?.googleServicesFile).toBe(IOS_FILE);
    expect(config.ios?.entitlements).toEqual({
      "aps-environment": "development",
    });
    expect(config.ios?.infoPlist).toEqual({
      UIBackgroundModes: ["remote-notification"],
    });
    expect(config.ios?.config).toBeUndefined();
    expect(config.android?.googleServicesFile).toBeUndefined();
    expect(config.android?.permissions).toBeUndefined();
    expect(external.statCalls).toEqual([IOS_FILE]);
    const androidExisting = vi.fn((value: ExportedConfigWithProps) => value);
    const registered = register({
      ...config,
      mods: { android: { strings: androidExisting } },
    } as ExportedConfig);
    expect(keys(registered, "ios")).toEqual(["dangerous", "xcodeproj"]);
    expect(keys(registered, "android")).toEqual(["strings"]);
    expect(registered.mods?.android?.strings).toBe(androidExisting);
    expectRegistered(registered, "ios");
    expect(androidExisting).not.toHaveBeenCalled();
    vi.stubEnv("PASSENGER_IOS_APS_ENVIRONMENT", " production ");
    expect(passengerAppConfig().ios?.entitlements).toEqual({
      "aps-environment": "production",
    });
  });

  it("configures only Android official Google and messaging mods and forwards the trimmed existing Maps key", () => {
    external.regularFiles.add(ANDROID_FILE);
    vi.stubEnv("PASSENGER_GOOGLE_SERVICES_ANDROID_FILE", ` ${ANDROID_FILE} `);
    vi.stubEnv("GOOGLE_MAPS_ANDROID_KEY", " sim-android-map-key ");
    const config = passengerAppConfig();
    originalIdentity(config);
    expect(notificationMetadata(config)).toEqual({
      iosConfigured: false,
      androidConfigured: true,
    });
    expect(config.android?.googleServicesFile).toBe(ANDROID_FILE);
    expect(config.android?.config?.googleMaps?.apiKey).toBe(
      "sim-android-map-key",
    );
    expect(config.extra?.passengerNativeMaps).toEqual({
      androidApiKeyConfigured: true,
    });
    expect(config.ios?.googleServicesFile).toBeUndefined();
    expect(config.ios?.entitlements).toBeUndefined();
    expect(config.ios?.infoPlist).toBeUndefined();
    expect(external.statCalls).toEqual([ANDROID_FILE]);
    const iosExisting = vi.fn((value: ExportedConfigWithProps) => value);
    const registered = register({
      ...config,
      mods: { ios: { infoPlist: iosExisting } },
    } as ExportedConfig);
    expect(keys(registered, "ios")).toEqual(["infoPlist"]);
    expect(keys(registered, "android")).toEqual([
      "appBuildGradle",
      "dangerous",
      "manifest",
      "projectBuildGradle",
    ]);
    expect(registered.mods?.ios?.infoPlist).toBe(iosExisting);
    expectRegistered(registered, "android");
    expect(iosExisting).not.toHaveBeenCalled();
  });

  it("keeps missing, inaccessible, directory and blank inputs unavailable instead of advertising configured SDKs", () => {
    vi.stubEnv("PASSENGER_GOOGLE_SERVICES_ANDROID_FILE", ANDROID_FILE);
    vi.stubEnv("PASSENGER_GOOGLE_SERVICES_IOS_FILE", IOS_FILE);
    vi.stubEnv("GOOGLE_MAPS_ANDROID_KEY", "   ");
    for (const directory of [false, true]) {
      if (directory) {
        external.directories.add(ANDROID_FILE);
        external.directories.add(IOS_FILE);
      }
      const config = passengerAppConfig();
      expect(notificationMetadata(config)).toEqual({
        iosConfigured: false,
        androidConfigured: false,
      });
      expect(config.android?.googleServicesFile).toBeUndefined();
      expect(config.ios?.googleServicesFile).toBeUndefined();
      expect(config.android?.config).toBeUndefined();
      expect(config.extra?.passengerNativeMaps).toEqual({
        androidApiKeyConfigured: false,
      });
      const registered = register(config);
      expect(keys(registered, "ios")).toEqual([]);
      expect(keys(registered, "android")).toEqual([]);
    }
    external.statCalls.length = 0;
    vi.stubEnv("PASSENGER_GOOGLE_SERVICES_ANDROID_FILE", "   ");
    vi.stubEnv("PASSENGER_GOOGLE_SERVICES_IOS_FILE", "");
    expect(notificationMetadata(passengerAppConfig())).toEqual({
      iosConfigured: false,
      androidConfigured: false,
    });
    expect(external.statCalls).toEqual([]);
  });

  it("composes both platforms from app-relative paths and forwards only an explicitly provided public consent version", () => {
    const androidRelative = "./sim-build/google-services.json";
    const iosRelative = "./sim-build/GoogleService-Info.plist";
    external.regularFiles.add(resolve(appRoot, androidRelative));
    external.regularFiles.add(resolve(appRoot, iosRelative));
    vi.stubEnv("PASSENGER_GOOGLE_SERVICES_ANDROID_FILE", androidRelative);
    vi.stubEnv("PASSENGER_GOOGLE_SERVICES_IOS_FILE", iosRelative);
    const config = passengerAppConfig();
    expect(notificationMetadata(config)).toEqual({
      iosConfigured: true,
      androidConfigured: true,
    });
    expect(config.android?.googleServicesFile).toBe(androidRelative);
    expect(config.ios?.googleServicesFile).toBe(iosRelative);
    expect(external.statCalls).toEqual([
      resolve(appRoot, androidRelative),
      resolve(appRoot, iosRelative),
    ]);
    const registered = register(config);
    expect(keys(registered, "ios")).toEqual(["dangerous", "xcodeproj"]);
    expect(keys(registered, "android")).toEqual([
      "appBuildGradle",
      "dangerous",
      "manifest",
      "projectBuildGradle",
    ]);
    expectRegistered(registered, "ios");
    expectRegistered(registered, "android");
    vi.stubEnv("EXPO_PUBLIC_PASSENGER_MODE", "configured");
    vi.stubEnv(
      "EXPO_PUBLIC_PASSENGER_API_BASE_URL",
      " https://sim-config.example.invalid ",
    );
    vi.stubEnv(
      "EXPO_PUBLIC_PASSENGER_OAUTH_CALLBACK_URI",
      " drtspassenger://auth/callback ",
    );
    vi.stubEnv(
      "EXPO_PUBLIC_PASSENGER_NOTIFICATION_CONSENT_VERSION",
      " sim-consent-v1 ",
    );
    expect(readNativePassengerBootstrapConfig()).toEqual({
      mode: "configured",
      baseUrl: "https://sim-config.example.invalid",
      callbackUri: "drtspassenger://auth/callback",
      notificationConsentVersion: "sim-consent-v1",
    });
    vi.stubEnv("EXPO_PUBLIC_PASSENGER_NOTIFICATION_CONSENT_VERSION", "   ");
    expect(readNativePassengerBootstrapConfig()).toEqual({
      mode: "configured",
      baseUrl: "https://sim-config.example.invalid",
      callbackUri: "drtspassenger://auth/callback",
    });
    expect(
      readNativePassengerBootstrapConfig({
        mode: "demo",
        apiBaseUrl: undefined,
        callbackUri: undefined,
      }),
    ).toEqual({ mode: "demo" });
  });
});
