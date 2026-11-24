const { existsSync, promises } = module.require("node:fs");
const { createRequire } = module.require("node:module");
const { dirname, join } = module.require("node:path");
const requirePlugin = createRequire(__filename);

const RNFB_PODFILE_FIX_TAG = "drts-passenger-rnfb-non-modular-headers";
const RNFB_PODFILE_POST_INSTALL_SNIPPET = [
  "    installer.pods_project.build_configurations.each do |build_config|",
  "      build_config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'",
  "    end",
  "    installer.pods_project.targets.each do |target|",
  "      target.build_configurations.each do |build_config|",
  "        build_config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'",
  "        if target.name.start_with?('RNFB')",
  "          build_config.build_settings['DEFINES_MODULE'] = 'NO'",
  "        end",
  "      end",
  "    end",
].join("\n");

function configPlugins() {
  try {
    return requirePlugin("expo/config-plugins");
  } catch {
    return requirePlugin("@expo/config-plugins");
  }
}

function officialPlugin(packageName, platform) {
  const packageRoot = dirname(
    requirePlugin.resolve(`${packageName}/package.json`),
  );
  return requirePlugin(join(packageRoot, "plugin", "build", platform));
}

function applyIosRnfbPodfileFix(podfileContents) {
  const { CodeGenerator } = configPlugins();
  return CodeGenerator.mergeContents({
    tag: RNFB_PODFILE_FIX_TAG,
    src: podfileContents,
    newSrc: RNFB_PODFILE_POST_INSTALL_SNIPPET,
    anchor: /^\s*post_install\s+do\s+\|installer\|/,
    offset: 1,
    comment: "#",
  }).contents;
}

function withPassengerIosFirebasePodfile(config) {
  const { withPodfile } = configPlugins();
  return withPodfile(config, (modConfig) => {
    modConfig.modResults.contents = applyIosRnfbPodfileFix(
      modConfig.modResults.contents,
    );
    return modConfig;
  });
}

function withIosRnfbPodfileDangerousMod(config) {
  const { withDangerousMod } = configPlugins();
  return withDangerousMod(config, [
    "ios",
    async (modConfig) => {
      const podfilePath = join(
        modConfig.modRequest.platformProjectRoot,
        "Podfile",
      );
      if (existsSync(podfilePath)) {
        const current = await promises.readFile(podfilePath, "utf8");
        const updated = applyIosRnfbPodfileFix(current);
        if (updated !== current) {
          await promises.writeFile(podfilePath, updated, "utf8");
        }
      }
      return modConfig;
    },
  ]);
}

/** RNFirebase 23.8.8 helpers, applied only to the platform with a services file. */
function withPassengerFirebase(config, props) {
  if (props?.iosRnfbPodfile) {
    config = withPassengerIosFirebasePodfile(config);
  }
  if (config.ios?.googleServicesFile) {
    const ios = officialPlugin("@react-native-firebase/app", "ios");
    config = ios.withFirebaseAppDelegate(config);
    config = ios.withIosGoogleServicesFile(config);
    config = withIosRnfbPodfileDangerousMod(config);
  }
  if (config.android?.googleServicesFile) {
    const android = officialPlugin("@react-native-firebase/app", "android");
    config = android.withBuildscriptDependency(config);
    config = android.withApplyGoogleServicesPlugin(config);
    config = android.withCopyAndroidGoogleServices(config);
    const messaging = officialPlugin(
      "@react-native-firebase/messaging",
      "android",
    );
    config = messaging.withExpoPluginFirebaseNotification(config);
  }
  return config;
}

module.exports = withPassengerFirebase;
module.exports.withPassengerIosFirebasePodfile =
  withPassengerIosFirebasePodfile;
module.exports.applyIosRnfbPodfileFix = applyIosRnfbPodfileFix;
module.exports.RNFB_PODFILE_FIX_TAG = RNFB_PODFILE_FIX_TAG;
