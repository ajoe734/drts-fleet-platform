import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import passengerAppConfig from "../../../apps/passenger-app/app.config.js";

type PassengerExpoConfig = ReturnType<typeof passengerAppConfig>;
type PassengerExportedConfig = PassengerExpoConfig & {
  mods?: {
    ios?: Record<string, unknown>;
    android?: Record<string, unknown>;
  };
};

interface ExpoConfigPluginsModule {
  compileModsAsync: (
    config: PassengerExportedConfig,
    props: { projectRoot: string; platforms?: ("ios" | "android")[] },
  ) => Promise<PassengerExportedConfig>;
  withStaticPlugin: (
    config: PassengerExportedConfig,
    props: { plugin: string; projectRoot: string },
  ) => PassengerExportedConfig;
}

const appRoot = fileURLToPath(
  new URL("../../../apps/passenger-app/", import.meta.url),
);
const requireApp = createRequire(
  new URL("../../../apps/passenger-app/package.json", import.meta.url),
);
const { compileModsAsync, withStaticPlugin } = requireApp(
  "expo/config-plugins",
) as ExpoConfigPluginsModule;
const firebasePlugin = requireApp("./plugins/with-passenger-firebase.cjs") as ((
  config: PassengerExpoConfig,
  props?: { iosRnfbPodfile?: boolean },
) => PassengerExportedConfig) & {
  RNFB_PODFILE_FIX_TAG: string;
  applyIosRnfbPodfileFix: (contents: string) => string;
  withPassengerIosFirebasePodfile: (
    config: PassengerExpoConfig,
  ) => PassengerExportedConfig;
};

const EXPO_SDK54_PODFILE_FIXTURE = `require File.join(File.dirname(\`node --print "require.resolve('expo/package.json')"\`), "scripts/autolinking")
require File.join(File.dirname(\`node --print "require.resolve('react-native/package.json')"\`), "scripts/react_native_pods")

require 'json'
podfile_properties = JSON.parse(File.read(File.join(__dir__, 'Podfile.properties.json'))) rescue {}

platform :ios, podfile_properties['ios.deploymentTarget'] || '15.1'

prepare_react_native_project!

target 'drtspassengerapp' do
  use_expo_modules!
  config = use_native_modules!

  use_frameworks! :linkage => podfile_properties['ios.useFrameworks'].to_sym if podfile_properties['ios.useFrameworks']
  use_frameworks! :linkage => ENV['USE_FRAMEWORKS'].to_sym if ENV['USE_FRAMEWORKS']

  use_react_native!(
    :path => config[:reactNativePath],
    :hermes_enabled => podfile_properties['expo.jsEngine'] == nil || podfile_properties['expo.jsEngine'] == 'hermes',
    :app_path => "#{Pod::Config.instance.installation_root}/..",
    :privacy_file_aggregation_enabled => podfile_properties['apple.privacyManifestAggregationEnabled'] != 'false',
  )

  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
      :ccache_enabled => podfile_properties['apple.ccacheEnabled'] == 'true',
    )
  end
end
`;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Passenger iOS release Firebase Podfile module compilation config", () => {
  it("registers the iOS Podfile RNFB non-modular header fix plugin alongside static frameworks and existing Firebase plugin", () => {
    const config = passengerAppConfig();
    expect(config.ios?.bundleIdentifier).toBe(
      "com.cctechsupport.drts.passenger",
    );
    expect(config.android?.package).toBe("com.cctechsupport.drts.passenger");
    expect(config.version).toBe("0.1.0");
    expect(config.plugins).toEqual([
      "expo-router",
      "expo-secure-store",
      ["expo-build-properties", { ios: { useFrameworks: "static" } }],
      "./plugins/with-passenger-firebase.cjs",
      "./plugins/with-passenger-ios-firebase-podfile.cjs",
    ]);
  });

  it("patches iOS Podfile post_install via compileModsAsync even when PASSENGER_GOOGLE_SERVICES_IOS_FILE is omitted (run 44711787911 production scenario)", async () => {
    vi.stubEnv("PASSENGER_GOOGLE_SERVICES_IOS_FILE", "");
    vi.stubEnv("PASSENGER_IOS_APS_ENVIRONMENT", "production");
    vi.stubEnv(
      "PASSENGER_APP_EAS_PROJECT_ID",
      "6d044e38-3c4a-4dce-890f-db368f13b37d",
    );

    const tempProjectRoot = mkdtempSync(
      join(tmpdir(), "pax-ios-podfile-no-plist-"),
    );
    try {
      const iosDir = join(tempProjectRoot, "ios");
      mkdirSync(iosDir, { recursive: true });
      const podfilePath = join(iosDir, "Podfile");
      writeFileSync(podfilePath, EXPO_SDK54_PODFILE_FIXTURE, "utf8");

      let config: PassengerExportedConfig = passengerAppConfig();
      expect(config.ios?.googleServicesFile).toBeUndefined();
      expect(config.extra?.passengerNativeNotifications).toEqual({
        iosConfigured: false,
        androidConfigured: false,
      });

      config = withStaticPlugin(config, {
        plugin: "./plugins/with-passenger-firebase.cjs",
        projectRoot: appRoot,
      });
      config = withStaticPlugin(config, {
        plugin: "./plugins/with-passenger-ios-firebase-podfile.cjs",
        projectRoot: appRoot,
      });

      await compileModsAsync(config, {
        projectRoot: tempProjectRoot,
        platforms: ["ios"],
      });

      const patchedPodfile = readFileSync(podfilePath, "utf8");
      expect(patchedPodfile).toContain(
        `# @generated begin ${firebasePlugin.RNFB_PODFILE_FIX_TAG}`,
      );
      expect(patchedPodfile).toContain(
        "build_config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'",
      );
      expect(patchedPodfile).toContain("if target.name.start_with?('RNFB')");
      expect(patchedPodfile).toContain(
        "build_config.build_settings['DEFINES_MODULE'] = 'NO'",
      );
      expect(patchedPodfile).toContain(
        `# @generated end ${firebasePlugin.RNFB_PODFILE_FIX_TAG}`,
      );
    } finally {
      rmSync(tempProjectRoot, { recursive: true, force: true });
    }
  });

  it("is idempotent across repeated Podfile mod applications and configured iOS dangerous mod execution", async () => {
    const tempProjectRoot = mkdtempSync(
      join(tmpdir(), "pax-ios-podfile-idempotent-"),
    );
    try {
      const iosDir = join(tempProjectRoot, "ios");
      const appTargetDir = join(iosDir, "drtspassengerapp");
      mkdirSync(appTargetDir, { recursive: true });
      const podfilePath = join(iosDir, "Podfile");
      const appDelegatePath = join(appTargetDir, "AppDelegate.swift");
      const plistPath = join(tempProjectRoot, "GoogleService-Info.plist");
      writeFileSync(podfilePath, EXPO_SDK54_PODFILE_FIXTURE, "utf8");
      writeFileSync(
        appDelegatePath,
        `import Expo\n@UIApplicationMain\npublic class AppDelegate: ExpoAppDelegate {\n  public override func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {\n    self.moduleName = "main"\n    return super.application(application, didFinishLaunchingWithOptions: launchOptions)\n  }\n}\n`,
        "utf8",
      );
      writeFileSync(
        plistPath,
        `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>BUNDLE_ID</key><string>com.cctechsupport.drts.passenger</string></dict></plist>\n`,
        "utf8",
      );

      const firstPass = firebasePlugin.applyIosRnfbPodfileFix(
        EXPO_SDK54_PODFILE_FIXTURE,
      );
      const secondPass = firebasePlugin.applyIosRnfbPodfileFix(firstPass);
      expect(secondPass).toBe(firstPass);
      expect(
        secondPass.split(
          `# @generated begin ${firebasePlugin.RNFB_PODFILE_FIX_TAG}`,
        ).length - 1,
      ).toBe(1);

      let config: PassengerExportedConfig = {
        ...passengerAppConfig(),
        ios: {
          ...passengerAppConfig().ios,
          googleServicesFile: plistPath,
        },
        plugins: [],
      };
      config = firebasePlugin(config, { iosRnfbPodfile: true });
      // Remove xcodeproj mod since synthetic temp project has no .pbxproj fixture
      if (config.mods?.ios) {
        delete config.mods.ios.xcodeproj;
      }
      await compileModsAsync(config, {
        projectRoot: tempProjectRoot,
        platforms: ["ios"],
      });

      const diskPodfile = readFileSync(podfilePath, "utf8");
      expect(diskPodfile).toBe(firstPass);
      const diskAppDelegate = readFileSync(appDelegatePath, "utf8");
      expect(diskAppDelegate).toContain("import FirebaseCore");
      expect(diskAppDelegate).toContain("FirebaseApp.configure()");
      expect(resolve(appRoot, "eas.json")).toBeTruthy();
    } finally {
      rmSync(tempProjectRoot, { recursive: true, force: true });
    }
  });
});
