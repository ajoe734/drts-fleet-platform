import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type Resolution =
  | { type: "sourceFile"; filePath: string }
  | { type: "assetFiles"; filePaths: readonly string[] }
  | { type: "empty" };
type Lookup =
  | { exists: false }
  | { exists: true; type: "f" | "d"; realPath: string };
type Platform = "ios" | "android";
type Resolver = (
  context: ResolverContext,
  specifier: string,
  platform: string | null,
) => Resolution;
interface ResolverContext {
  originModulePath: string;
  sourceExts: readonly string[];
  assetExts: ReadonlySet<string>;
  mainFields: readonly string[];
  nodeModulesPaths: readonly string[];
  preferNativePlatform: boolean;
  disableHierarchicalLookup: boolean;
  fileSystemLookup(filename: string): Lookup;
  doesFileExist(filename: string): boolean;
  getPackage(filename: string): Record<string, unknown>;
  getPackageForModule(filename: string): {
    rootPath: string;
    packageJson: Record<string, unknown>;
    packageRelativePath: string;
  } | null;
  resolveAsset(): null;
  resolveHasteModule(): null;
  resolveHastePackage(): null;
  allowHaste: boolean;
  unstable_enablePackageExports: boolean;
  unstable_conditionNames: readonly string[];
  unstable_conditionsByPlatform: Readonly<Record<string, readonly string[]>>;
  unstable_logWarning(): void;
  isESMImport: boolean;
  resolveRequest: Resolver;
}
interface MetroConfig {
  resolver: {
    sourceExts: readonly string[];
    assetExts: readonly string[];
    resolverMainFields: readonly string[];
    nodeModulesPaths?: readonly string[];
    disableHierarchicalLookup?: boolean;
    unstable_enablePackageExports?: boolean;
    unstable_conditionNames?: readonly string[];
    unstable_conditionsByPlatform?: Readonly<Record<string, readonly string[]>>;
    resolveRequest?: Resolver;
    [key: string]: unknown;
  };
}
interface MetroModule {
  resolve: Resolver;
  FailedToResolvePathError: new (...args: unknown[]) => Error;
  FailedToResolveNameError: new (...args: unknown[]) => Error;
}
type Outcome =
  | { status: "resolved"; value: Resolution }
  | { status: "failed"; error: unknown };

const APP = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const WORKSPACE = path.resolve(APP, "../..");
const SDK_INDEX = path.join(
  WORKSPACE,
  "packages/passenger-client/src/index.ts",
);
const appRequire = createRequire(path.join(APP, "package.json"));
const expoRequire = createRequire(appRequire.resolve("expo/metro-config"));
const metroConfigRequire = createRequire(
  expoRequire.resolve("@expo/metro-config"),
);
const metro = metroConfigRequire("@expo/metro/metro-resolver") as MetroModule;
const expo = appRequire("expo/metro-config") as {
  getDefaultConfig(projectRoot: string): MetroConfig;
};
const defaults = expo.getDefaultConfig(APP);
const configPath = path.join(APP, "metro.config.js");
// Baseline uses the actual existing Expo getter. A missing new config is never
// imported as an error or counted as RED. GREEN loads Expo's normal CJS entry.
const current = existsSync(configPath)
  ? (appRequire(configPath) as MetroConfig)
  : defaults;

// Same actual-filesystem context as the independently executed Root witness.
// This invokes the real installed Metro resolver; it never runs Metro's server,
// bundler, exporter, watcher, transformer or application modules.
function lookup(filename: string): Lookup {
  try {
    const info = statSync(filename);
    return {
      exists: true,
      type: info.isDirectory() ? "d" : "f",
      realPath: realpathSync(filename),
    };
  } catch {
    return { exists: false };
  }
}
function packageFor(filename: string) {
  let dir =
    lookup(filename).exists && statSync(filename).isDirectory()
      ? filename
      : path.dirname(filename);
  for (;;) {
    const packagePath = path.join(dir, "package.json");
    if (existsSync(packagePath))
      return {
        rootPath: dir,
        packageJson: JSON.parse(readFileSync(packagePath, "utf8")) as Record<
          string,
          unknown
        >,
        packageRelativePath: path.relative(dir, filename),
      };
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
function context(
  config: MetroConfig,
  originModulePath: string,
): ResolverContext {
  return {
    originModulePath,
    sourceExts: config.resolver.sourceExts,
    assetExts: new Set(config.resolver.assetExts),
    mainFields: config.resolver.resolverMainFields,
    nodeModulesPaths: config.resolver.nodeModulesPaths ?? [],
    preferNativePlatform: true,
    disableHierarchicalLookup:
      config.resolver.disableHierarchicalLookup ?? false,
    fileSystemLookup: lookup,
    doesFileExist: (filename) => {
      const value = lookup(filename);
      return value.exists && value.type === "f";
    },
    getPackage: (filename) =>
      JSON.parse(readFileSync(filename, "utf8")) as Record<string, unknown>,
    getPackageForModule: packageFor,
    resolveAsset: () => null,
    resolveHasteModule: () => null,
    resolveHastePackage: () => null,
    allowHaste: false,
    unstable_enablePackageExports:
      config.resolver.unstable_enablePackageExports ?? true,
    unstable_conditionNames: config.resolver.unstable_conditionNames ?? [],
    unstable_conditionsByPlatform:
      config.resolver.unstable_conditionsByPlatform ?? {},
    unstable_logWarning: () => {},
    isESMImport: true,
    resolveRequest: metro.resolve,
  };
}
function resolveConfigured(
  config: MetroConfig,
  requestContext: ResolverContext,
  specifier: string,
  platform: Platform,
) {
  return (config.resolver.resolveRequest ?? requestContext.resolveRequest)(
    requestContext,
    specifier,
    platform,
  );
}
function capture(work: () => Resolution): Outcome {
  try {
    return { status: "resolved", value: work() };
  } catch (error) {
    return { status: "failed", error };
  }
}
function traced(config: MetroConfig, originModulePath: string) {
  const calls: Array<{
    specifier: string;
    platform: string | null;
    origin: string;
  }> = [];
  const errors: unknown[] = [];
  const requestContext = context(config, originModulePath);
  // Recording delegate only: every result/error comes from actual Metro.
  requestContext.resolveRequest = (next, specifier, platform) => {
    calls.push({ specifier, platform, origin: next.originModulePath });
    try {
      return metro.resolve(
        { ...next, resolveRequest: metro.resolve },
        specifier,
        platform,
      );
    } catch (error) {
      errors.push(error);
      throw error;
    }
  };
  return { requestContext, calls, errors };
}

describe("Native Passenger Metro workspace ESM source resolution with the actual installed resolver", () => {
  it("resolves all nineteen actual SDK relative JavaScript exports to source TypeScript on iOS and Android", () => {
    const specifiers = [
      ...new Set(
        [
          ...readFileSync(SDK_INDEX, "utf8").matchAll(/from\s+"([^"]+\.js)"/g),
        ].map((match) => match[1]!),
      ),
    ];
    expect(specifiers).toHaveLength(19);
    const rows: Array<{
      platform: Platform;
      specifier: string;
      expected: string;
      actual: Outcome;
    }> = [];
    for (const platform of ["ios", "android"] as const) {
      for (const specifier of specifiers) {
        const expected = realpathSync(
          path.resolve(path.dirname(SDK_INDEX), `${specifier.slice(0, -3)}.ts`),
        );
        expect(
          existsSync(path.resolve(path.dirname(SDK_INDEX), specifier)),
        ).toBe(false);
        // Actual extensionless control establishes that the real TS file and
        // default platform resolution are available, before testing app wiring.
        expect(
          metro.resolve(
            context(defaults, SDK_INDEX),
            specifier.slice(0, -3),
            platform,
          ),
        ).toEqual({ type: "sourceFile", filePath: expected });
        rows.push({
          platform,
          specifier,
          expected,
          actual: capture(() =>
            resolveConfigured(
              current,
              context(current, SDK_INDEX),
              specifier,
              platform,
            ),
          ),
        });
      }
    }
    expect(rows).toHaveLength(38);
    const failures = rows
      .filter((row) => row.actual.status === "failed")
      .map((row) => ({
        platform: row.platform,
        specifier: row.specifier,
        errorClass:
          row.actual.status === "failed" && row.actual.error instanceof Error
            ? row.actual.error.constructor.name
            : "non-Error",
      }));
    expect(
      failures,
      "actual Expo app configuration must resolve all 38 existing SDK source edges",
    ).toEqual([]);
    for (const row of rows)
      expect(row.actual).toEqual({
        status: "resolved",
        value: { type: "sourceFile", filePath: row.expected },
      });
  });

  it("delegates existing tracked JavaScript, package JSON and a normal dependency to actual default resolution", () => {
    const controls = [
      "../../../apps/driver-app/metro.config.js",
      "../package.json",
      "zod",
    ];
    const expectedTrackedJS = realpathSync(
      path.join(WORKSPACE, "apps/driver-app/metro.config.js"),
    );
    for (const platform of ["ios", "android"] as const) {
      for (const specifier of controls) {
        const baseline = metro.resolve(
          context(defaults, SDK_INDEX),
          specifier,
          platform,
        );
        expect(baseline.type).toBe("sourceFile");
        const delegate = traced(current, SDK_INDEX);
        expect(
          resolveConfigured(
            current,
            delegate.requestContext,
            specifier,
            platform,
          ),
        ).toEqual(baseline);
        expect(delegate.calls).toEqual([
          { specifier, platform, origin: SDK_INDEX },
        ]);
        if (specifier === controls[0])
          expect(baseline).toEqual({
            type: "sourceFile",
            filePath: expectedTrackedJS,
          });
      }
    }
    // Extending Expo must retain its platform/source/asset/package defaults.
    expect({ ...current.resolver, resolveRequest: undefined }).toEqual({
      ...defaults.resolver,
      resolveRequest: undefined,
    });
    // This control deliberately makes no same-named SDK JS/TS preference claim;
    // no untracked SDK dist output is needed by a clean CI checkout.
  });

  it("preserves unrelated path and package failures and never swallows an unexpected filesystem error", () => {
    const appOrigin = path.join(APP, "lib/bootstrap.tsx");
    for (const platform of ["ios", "android"] as const) {
      for (const [origin, specifier, ErrorClass] of [
        [
          appOrigin,
          "./__metro_contract_missing__.js",
          metro.FailedToResolvePathError,
        ],
        [
          SDK_INDEX,
          "../../../apps/passenger-app/lib/__metro_contract_missing__.js",
          metro.FailedToResolvePathError,
        ],
        [
          SDK_INDEX,
          "@drts/__metro_contract_missing_package__",
          metro.FailedToResolveNameError,
        ],
      ] as const) {
        const baseline = capture(() =>
          metro.resolve(context(defaults, origin), specifier, platform),
        );
        expect(baseline.status).toBe("failed");
        const delegate = traced(current, origin);
        const result = capture(() =>
          resolveConfigured(
            current,
            delegate.requestContext,
            specifier,
            platform,
          ),
        );
        expect(result.status).toBe("failed");
        if (baseline.status !== "failed" || result.status !== "failed")
          throw new Error("expected actual Metro refusal");
        expect(result.error).toBeInstanceOf(ErrorClass);
        expect((result.error as Error).message).toBe(
          (baseline.error as Error).message,
        );
        expect(result.error).toBe(delegate.errors[0]);
        expect(delegate.calls).toEqual([{ specifier, platform, origin }]);
      }
      // Only this external filesystem failure is injected. The resolver itself
      // remains actual Metro, and all other lookups still read the real files.
      const failure = new Error(
        "SIM filesystem EIO while looking up SDK source",
      );
      const target = path.join(path.dirname(SDK_INDEX), "types.js");
      const delegate = traced(current, SDK_INDEX);
      delegate.requestContext.fileSystemLookup = (filename) => {
        if (filename === target) throw failure;
        return lookup(filename);
      };
      const result = capture(() =>
        resolveConfigured(
          current,
          delegate.requestContext,
          "./types.js",
          platform,
        ),
      );
      expect(result).toEqual({ status: "failed", error: failure });
      if (result.status !== "failed")
        throw new Error("expected injected filesystem refusal");
      expect(result.error).toBe(failure);
      expect(delegate.errors[0]).toBe(failure);
      expect(delegate.calls).toEqual([
        { specifier: "./types.js", platform, origin: SDK_INDEX },
      ]);
    }
  });
});
