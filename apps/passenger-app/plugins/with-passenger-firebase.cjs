const { createRequire } = module.require("node:module");
const { dirname, join } = module.require("node:path");
const requirePlugin = createRequire(__filename);

function officialPlugin(packageName, platform) {
  const packageRoot = dirname(
    requirePlugin.resolve(`${packageName}/package.json`),
  );
  return requirePlugin(join(packageRoot, "plugin", "build", platform));
}

/** RNFirebase 23.8.8 helpers, applied only to the platform with a services file. */
module.exports = function withPassengerFirebase(config) {
  if (config.ios?.googleServicesFile) {
    const ios = officialPlugin("@react-native-firebase/app", "ios");
    config = ios.withFirebaseAppDelegate(config);
    config = ios.withIosGoogleServicesFile(config);
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
};
