import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "../../../..");
const METRO_CONFIG_PATH = resolve(
  REPO_ROOT,
  "apps/driver-app/metro.config.js",
);

describe("SR-DRIVER-WEB-001 driver-app metro.config.js (expo-sqlite web wasm asset)", () => {
  it("adds a narrow metro.config.js scoped to apps/driver-app", () => {
    expect(existsSync(METRO_CONFIG_PATH)).toBe(true);
  });

  it("extends Expo's default config instead of replacing it", () => {
    const source = readFileSync(METRO_CONFIG_PATH, "utf8");
    expect(source).toMatch(
      /require\(\s*["']expo\/metro-config["']\s*\)/,
    );
    expect(source).toMatch(/getDefaultConfig\(__dirname\)/);
    expect(source).toMatch(/module\.exports\s*=\s*config/);
  });

  it("registers the wasm asset extension expo-sqlite's web runtime (wa-sqlite) needs", () => {
    const source = readFileSync(METRO_CONFIG_PATH, "utf8");
    expect(source).toMatch(/resolver\.assetExts/);
    expect(source).toMatch(/["']wasm["']/);
  });

  it("the wasm binary that motivates this config actually ships inside the resolved expo-sqlite package", () => {
    let expoSqlitePkgPath: string;
    try {
      expoSqlitePkgPath = require.resolve("expo-sqlite/package.json", {
        paths: [resolve(REPO_ROOT, "apps/driver-app")],
      });
    } catch {
      // expo-sqlite is not installed in this checkout; nothing to assert.
      return;
    }
    const wasmPath = resolve(
      expoSqlitePkgPath,
      "..",
      "web/wa-sqlite/wa-sqlite.wasm",
    );
    expect(existsSync(wasmPath)).toBe(true);
  });
});
