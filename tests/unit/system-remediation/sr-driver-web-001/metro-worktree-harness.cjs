/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */
const Module = require('module');
const originalLoad = Module._load;
Module._load = function(id, parent, main) {
  const value = originalLoad.apply(this, arguments);
  if ((id === '@expo/metro-config' || id === 'expo/metro-config') && !value.__srWatchFolders) {
    const original = value.getDefaultConfig;
    value.getDefaultConfig = function(...args) {
      const config = original.apply(this, args);
      config.watchFolders = [...config.watchFolders,
        '/home/lupin/workspace/drts-fleet-platform/apps/driver-app/node_modules',
        '/home/lupin/workspace/drts-fleet-platform/node_modules',
        '/home/lupin/workspace/drts-fleet-platform/packages'];
      config.resolver.nodeModulesPaths = [
        '/home/lupin/workspace/drts-fleet-platform/apps/driver-app/node_modules',
        '/home/lupin/workspace/drts-fleet-platform/node_modules'];
      if (!config.resolver.assetExts.includes('wasm')) {
        config.resolver.assetExts.push('wasm');
      }
      return config;
    };
    value.__srWatchFolders = true;
  }
  return value;
};
