import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

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

describe("dependency gate effective installed patch verification", () => {
  const root = path.resolve(__dirname, "../..");
  const appRequire = createRequire(
    path.join(root, "apps/driver-app/package.json"),
  );
  const expoRequire = createRequire(appRequire.resolve("expo/package.json"));
  const cliRequire = createRequire(
    expoRequire.resolve("@expo/cli/package.json"),
  );
  const configRequire = createRequire(expoRequire.resolve("@expo/config"));
  const configDirectory = path.dirname(
    expoRequire.resolve("@expo/config/package.json"),
  );
  const mergeDirectory = path.dirname(
    configRequire.resolve("deepmerge/package.json"),
  );
  const patchHash = path
    .basename(path.dirname(path.dirname(mergeDirectory)))
    .split("patch_hash=")[1];

  function fixture(
    run: (directory: string, installed: string, config: string) => void,
  ) {
    const directory = fs.mkdtempSync(path.join(tmpdir(), "deepmerge-gate-"));
    try {
      for (const file of [
        "package.json",
        "pnpm-lock.yaml",
        "patches/deepmerge@4.3.1.patch",
      ]) {
        const target = path.join(directory, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(root, file), target);
      }
      // Only the package layout is synthetic. Use unchanged real published
      // package metadata and patched library bytes; do not mock the verifier.
      const installed = path.join(
        directory,
        `node_modules/.pnpm/deepmerge@4.3.1_patch_hash=${patchHash}/node_modules/deepmerge`,
      );
      fs.cpSync(mergeDirectory, installed, { recursive: true });
      const config = path.join(directory, "config");
      fs.cpSync(configDirectory, config, { recursive: true });
      fs.mkdirSync(path.join(config, "node_modules"), { recursive: true });
      fs.symlinkSync(installed, path.join(config, "node_modules/deepmerge"));
      for (const app of ["driver-app", "passenger-app"]) {
        const appDir = path.join(directory, "apps", app);
        fs.mkdirSync(appDir, { recursive: true });
        fs.copyFileSync(
          path.join(root, "apps", app, "package.json"),
          path.join(appDir, "package.json"),
        );
        const expo = path.join(appDir, "node_modules/expo");
        const cli = path.join(expo, "node_modules/@expo/cli");
        fs.mkdirSync(path.join(cli, "node_modules/@expo"), { recursive: true });
        fs.copyFileSync(
          expoRequire.resolve("expo/package.json"),
          path.join(expo, "package.json"),
        );
        fs.copyFileSync(
          cliRequire.resolve("@expo/cli/package.json"),
          path.join(cli, "package.json"),
        );
        fs.symlinkSync(config, path.join(expo, "node_modules/@expo/config"));
        fs.symlinkSync(config, path.join(cli, "node_modules/@expo/config"));
      }
      run(directory, installed, config);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }

  function verify(directory: string) {
    const result = spawnSync(
      "python3",
      [
        "-c",
        "import sys; from pathlib import Path; sys.path.insert(0, sys.argv[1]); " +
          "from dependency_security import verify_deepmerge_patch; verify_deepmerge_patch(Path(sys.argv[2]))",
        path.join(root, "tools/ci"),
        directory,
      ],
      { encoding: "utf8", timeout: 10000 },
    );
    expect(result.error).toBeUndefined();
    return result;
  }

  it("accepts real installed bytes bound to the manifest, lock and all consumers", () => {
    fixture((directory) => {
      const result = verify(directory);
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Verified effective deepmerge patch");
    });
  });

  it.each(["index.js", "dist/cjs.js", "dist/umd.js", "package.json"])(
    "rejects tampered installed %s even with matching patch label",
    (file) => {
      fixture((directory, installed) => {
        fs.appendFileSync(path.join(installed, file), "\n");
        const result = verify(directory);
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("installed deepmerge integrity");
      });
    },
  );

  it("rejects an unapplied installed guard even when metadata claims the patch", () => {
    fixture((directory, installed) => {
      const entry = path.join(installed, "dist/cjs.js");
      fs.writeFileSync(
        entry,
        fs
          .readFileSync(entry, "utf8")
          .replace("return key === '__proto__'", "return false"),
      );
      const result = verify(directory);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("installed deepmerge integrity");
    });
  });

  it("rejects another resolved copy even if it has identical patched bytes", () => {
    fixture((directory, installed, config) => {
      const alternate = path.join(directory, "another-deepmerge");
      fs.cpSync(installed, alternate, { recursive: true });
      const link = path.join(config, "node_modules/deepmerge");
      fs.unlinkSync(link);
      fs.symlinkSync(alternate, link);
      const result = verify(directory);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("unexpected deepmerge resolution");
    });
  });

  it("rejects missing installed bytes", () => {
    fixture((directory, installed) => {
      fs.rmSync(path.join(installed, "dist/cjs.js"));
      expect(verify(directory).status).toBe(1);
    });
  });
});
