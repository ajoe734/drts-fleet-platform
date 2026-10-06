import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it } from "vitest";

// Resolve through the actual consumers, so a separate safe copy at the root
// cannot conceal a vulnerable or incompatible transitive dependency.
const root = resolve(__dirname, "../..");
const driverRequire = createRequire(
  resolve(root, "apps/driver-app/package.json"),
);
const nativeRequire = createRequire(
  driverRequire.resolve("react-native/package.json"),
);
const jestRequire = createRequire(nativeRequire.resolve("babel-jest"));
const istanbulRequire = createRequire(
  jestRequire.resolve("babel-plugin-istanbul"),
);
const nycRequire = createRequire(
  istanbulRequire.resolve("@istanbuljs/load-nyc-config"),
);
const apiRequire = createRequire(resolve(root, "apps/api/package.json"));
const nestRequire = createRequire(
  apiRequire.resolve("@nestjs/platform-express"),
);
const express = nestRequire("express");
const webRequire = createRequire(
  resolve(root, "apps/bank-console-web/package.json"),
);
const nextRequire = createRequire(webRequire.resolve("next/package.json"));
const postcssRequire = createRequire(nextRequire.resolve("postcss"));
const { SourceMapConsumer } = postcssRequire("source-map-js");

const temporaryDirectories: string[] = [];
function fixtureDirectory() {
  const directory = mkdtempSync(
    resolve(tmpdir(), "drts-dependency-regression-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("driver coverage dependency compatibility", () => {
  it("loads YAML NYC configuration and inherited include/exclude options", async () => {
    const cwd = fixtureDirectory();
    writeFileSync(resolve(cwd, "package.json"), "{}");
    writeFileSync(
      resolve(cwd, "base.yml"),
      "exclude: '**/*.test.js'\ncheck-coverage: true\n",
    );
    writeFileSync(
      resolve(cwd, ".nycrc.yml"),
      "extends: ./base.yml\ninclude: src/**/*.js\nall: true\n",
    );
    const { loadNycConfig } = istanbulRequire("@istanbuljs/load-nyc-config");
    expect(await loadNycConfig({ cwd })).toMatchObject({
      cwd,
      include: ["src/**/*.js"],
      exclude: ["**/*.test.js"],
      checkCoverage: true,
      all: true,
    });
  });

  it("keeps the js-yaml 3 CLI working with argparse 2, including invalid input", () => {
    const bin = resolve(
      dirname(nycRequire.resolve("js-yaml/package.json")),
      "bin/js-yaml.js",
    );
    expect(
      execFileSync(process.execPath, [bin, "--help"], {
        encoding: "utf8",
        timeout: 5000,
      }),
    ).toContain("--compact");
    const output = execFileSync(process.execPath, [bin], {
      input: "include: src/**/*.js\nall: true\n",
      encoding: "utf8",
      timeout: 5000,
    });
    expect(JSON.parse(output)).toEqual({ include: "src/**/*.js", all: true });
    const invalid = spawnSync(process.execPath, [bin, "--compact"], {
      input: "include: [unterminated\n",
      encoding: "utf8",
      timeout: 5000,
    });
    expect(invalid.error).toBeUndefined();
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain("unexpected end");
  });

  it("transforms and executes instrumented code through React Native's babel-jest", () => {
    const cwd = fixtureDirectory();
    const { createTransformer } = nativeRequire("babel-jest");
    const transformed = createTransformer({
      babelrc: false,
      configFile: false,
    }).process(
      "module.exports = function increment(value) { return value + 1; };",
      resolve(cwd, "increment.js"),
      { config: { cwd, rootDir: cwd }, configString: "{}", instrument: true },
    );
    const sandbox: { __coverage__?: Record<string, unknown> } = {};
    expect(
      runInNewContext(
        `var module = { exports: {} };\n${transformed.code}\nmodule.exports(41);`,
        sandbox,
      ),
    ).toBe(42);
    expect(Object.keys(sandbox.__coverage__ ?? {})).toEqual([
      resolve(cwd, "increment.js"),
    ]);
  });
});

describe("Nest's Express client address resolution", () => {
  function request(trust: string, remoteAddress: string) {
    const app = express();
    app.set("trust proxy", trust);
    // Only the transport is synthetic; use Express's actual ip/ips getters and
    // trust compiler without binding a server socket on this VM.
    return Object.assign(Object.create(express.request), {
      app,
      socket: { remoteAddress },
      connection: { remoteAddress },
      headers: { "x-forwarded-for": "198.51.100.7" },
    });
  }

  it.each(["::ffff:10.0.0.0/8", "::/1"])(
    "does not trust an arbitrary IPv4 client via %s",
    (trust) => {
      const req = request(trust, "203.0.113.8");
      expect(req.ip).toBe("203.0.113.8");
      expect(req.ips).toEqual([]);
    },
  );

  it.each(["10.0.0.0/8", "::ffff:10.0.0.0/104"])(
    "accepts forwarded addresses from a correctly configured proxy: %s",
    (trust) => {
      const trusted = request(trust, "10.1.2.3");
      expect(trusted.ip).toBe("198.51.100.7");
      expect(trusted.ips).toEqual(["198.51.100.7"]);
      expect(request(trust, "203.0.113.8").ip).toBe("203.0.113.8");
    },
  );
});

describe("Next's PostCSS source maps", () => {
  const map = {
    version: 3,
    sources: ["input.css"],
    names: [],
    mappings: "AAAA",
    sourcesContent: ["a { color: red }"],
  };

  it("generates and consumes a CSS source map through Next's PostCSS", () => {
    const postcss = nextRequire("postcss");
    const result = postcss([]).process("a { color: red }", {
      from: "input.css",
      to: "output.css",
      map: { inline: false },
    });
    expect(result.css).toContain("color: red");
    const consumer = new SourceMapConsumer(result.map.toJSON());
    expect(consumer.originalPositionFor({ line: 1, column: 0 })).toMatchObject({
      source: "input.css",
      line: 1,
      column: 0,
    });
  });

  it("accepts normal indexed maps", () => {
    const consumer = new SourceMapConsumer({
      version: 3,
      sections: [{ offset: { line: 2, column: 0 }, map }],
    });
    expect(consumer.originalPositionFor({ line: 3, column: 1 })).toMatchObject({
      source: "input.css",
      line: 1,
    });
  });

  it.each([10_000_001, -1, 0.5, Infinity])(
    "rejects invalid indexed section offset %s before expanding mappings",
    (line) => {
      // Construction is bounded even in 1.2.1; never expand the malicious map.
      expect(
        () =>
          new SourceMapConsumer({
            version: 3,
            sections: [{ offset: { line, column: 0 }, map }],
          }),
      ).toThrow(/offset/i);
    },
  );
});
