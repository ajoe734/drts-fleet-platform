// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// expo-sqlite's web runtime (wa-sqlite) loads a bundled WebAssembly binary.
// Metro's default asset extensions do not include `.wasm`, so without this
// the web bundle fails to resolve `expo-sqlite/web` and every route that
// pulls in the offline location queue (/, /onboarding, /sos) fails to build.
config.resolver.assetExts = [...config.resolver.assetExts, "wasm"];

module.exports = config;
