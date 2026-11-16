const { createRequire } = module.require("node:module");
const { dirname, resolve, sep } = module.require("node:path");
const appRequire = createRequire(__filename);
const { getDefaultConfig } = appRequire("expo/metro-config");

// Resolve Metro through Expo's declared dependencies, not an app-hoisted copy.
const expoRequire = createRequire(appRequire.resolve("expo/metro-config"));
const metroConfigRequire = createRequire(
  expoRequire.resolve("@expo/metro-config"),
);
const { FailedToResolvePathError } = metroConfigRequire(
  "@expo/metro/metro-resolver",
);

const config = getDefaultConfig(__dirname);
const upstreamResolveRequest = config.resolver.resolveRequest;
const workspaceSources = ["passenger-client", "contracts", "ui-tokens"].map(
  (name) => resolve(__dirname, "../../packages", name, "src"),
);
function isWorkspaceSource(filename) {
  return workspaceSources.some((source) =>
    filename.startsWith(`${source}${sep}`),
  );
}

// Shared SDK sources retain Node-compatible .js specifiers. Metro appends its
// source/platform extensions rather than substituting the explicit .js suffix.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolveRequest = upstreamResolveRequest ?? context.resolveRequest;
  try {
    return resolveRequest(context, moduleName, platform);
  } catch (error) {
    if (
      !(error instanceof FailedToResolvePathError) ||
      !/^\.\.?\//.test(moduleName) ||
      !moduleName.endsWith(".js")
    )
      throw error;
    const origin = resolve(context.originModulePath);
    const target = resolve(dirname(origin), moduleName);
    if (!isWorkspaceSource(origin) || !isWorkspaceSource(target)) throw error;
    return resolveRequest(context, moduleName.slice(0, -3), platform);
  }
};

module.exports = config;
