import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";

describe("Dependency Security Exceptions", () => {
  it("should be valid JSON with correct fields", () => {
    const exceptionsPath = path.resolve(
      __dirname,
      "../../tools/ci/dependency-security-exceptions.json",
    );
    const exceptions = JSON.parse(fs.readFileSync(exceptionsPath, "utf8"));
    expect(Array.isArray(exceptions)).toBe(true);
    for (const exc of exceptions) {
      expect(exc.module_name).toBeDefined();
      expect(typeof exc.module_name).toBe("string");
      expect(exc.expires_at).toBeDefined();
      expect(typeof exc.expires_at).toBe("string");
      // Should be a valid date
      expect(!isNaN(Date.parse(exc.expires_at))).toBe(true);
    }
  });
});

for (const app of ["driver-app", "passenger-app"]) {
  const appRequire = createRequire(
    path.resolve(__dirname, `../../apps/${app}/package.json`),
  );
  const expoRequire = createRequire(appRequire.resolve("expo/package.json"));
  const configRequire = createRequire(expoRequire.resolve("@expo/config"));
  const cliRequire = createRequire(
    expoRequire.resolve("@expo/cli/package.json"),
  );
  const cliConfigRequire = createRequire(cliRequire.resolve("@expo/config"));

  for (const [consumer, require] of [
    ["expo config", configRequire],
    ["expo cli config", cliConfigRequire],
  ] as const) {
    describe(`${app} ${consumer} installed deepmerge`, () => {
      const merge = require("deepmerge");
      const attack = () =>
        JSON.parse('{"__proto__":{"injectedAdmin":true},"safe":42}');
      const safe = (result: Record<string, unknown>) => {
        expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
        expect(result.injectedAdmin).toBeUndefined();
        expect(Object.hasOwn(result, "__proto__")).toBe(false);
        expect(({} as Record<string, unknown>).injectedAdmin).toBeUndefined();
      };

      it("rejects a source own __proto__ for null-prototype and own-key targets", () => {
        for (const target of [Object.create(null), attack()]) {
          const result = merge(target, attack());
          safe(result);
          expect(result.safe).toBe(42);
        }
      });

      it("rejects target own __proto__ while copying legitimate fields", () => {
        const result = merge(attack(), { enabled: false });
        safe(result);
        expect(result).toEqual({ safe: 42, enabled: false });
      });

      it.each([null, undefined, false, 0, "placeholder"])(
        "rejects nested source poisoning over placeholder %s",
        (placeholder) => {
          const result = merge({ session: placeholder }, { session: attack() });
          safe(result.session);
          expect(result.session.safe).toBe(42);
        },
      );

      it("clones new nested objects and array elements safely", () => {
        const result = merge(
          { items: [attack()] },
          { session: attack(), items: [attack()] },
        );
        safe(result.session);
        for (const item of result.items) safe(item);
        expect(result.items).toHaveLength(2);
      });

      it("preserves deep/array merge, symbols, options and input ownership", () => {
        const symbol = Symbol("ordinary");
        const target = {
          nested: { first: 1 },
          items: [{ first: 1 }],
          [symbol]: 1,
        };
        const source = {
          nested: { second: 2 },
          items: [{ second: 2 }],
          [symbol]: 2,
        };
        const result = merge(target, source);
        expect(result).toEqual({
          nested: { first: 1, second: 2 },
          items: [{ first: 1 }, { second: 2 }],
          [symbol]: 2,
        });
        expect(result.items[0]).not.toBe(target.items[0]);
        expect(target.nested).toEqual({ first: 1 });
        expect(source.nested).toEqual({ second: 2 });
        expect(
          merge(target, source, { arrayMerge: (_: unknown, b: unknown) => b })
            .items,
        ).toBe(source.items);
        expect(merge({}, target, { clone: false }).nested).toBe(target.nested);
        expect(merge.all([{ a: 1 }, { b: 2 }])).toEqual({ a: 1, b: 2 });
        const ordinaryKeys = merge(Object.create(null), {
          constructor: { normal: true },
          prototype: { normal: true },
        });
        expect(Object.hasOwn(ordinaryKeys, "constructor")).toBe(true);
        expect(Object.hasOwn(ordinaryKeys, "prototype")).toBe(true);
        safe(ordinaryKeys);
      });
    });
  }

  it(`${app} preserves Expo modifyConfigAsync including plugin props`, async () => {
    const { modifyConfigAsync } = expoRequire("@expo/config");
    const rootConfig = {
      expo: {
        name: "dependency regression",
        slug: "dependency-regression",
        ios: { supportsTablet: true },
        plugins: [["example-plugin", { nested: { first: 1 }, values: [1] }]],
      },
    };
    const directory = fs.mkdtempSync(path.join(tmpdir(), "deepmerge-expo-"));
    try {
      fs.writeFileSync(path.join(directory, "package.json"), "{}");
      fs.writeFileSync(
        path.join(directory, "app.json"),
        JSON.stringify(rootConfig),
      );
      const result = await modifyConfigAsync(
        directory,
        {
          ios: { bundleIdentifier: "invalid.example.regression" },
          plugins: [["example-plugin", { nested: { second: 2 }, values: [2] }]],
        },
        { skipPlugins: true, skipSDKVersionRequirement: true },
        { dryRun: true },
      );
      expect(result.type).toBe("success");
      expect(result.config.ios).toEqual({
        supportsTablet: true,
        bundleIdentifier: "invalid.example.regression",
      });
      expect(result.config.plugins).toEqual([
        ["example-plugin", { nested: { first: 1, second: 2 }, values: [1, 2] }],
      ]);
      expect(
        JSON.parse(fs.readFileSync(path.join(directory, "app.json"), "utf8")),
      ).toEqual(rootConfig);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}
