import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..", "..");
const workflow = fs.readFileSync(
  path.join(ROOT, ".github", "workflows", "build-passenger-native.yml"),
  "utf8",
);

function stepRun(name: string): string {
  const match = new RegExp(
    `- name: ${name}\\n(?:[ ]{8}[^\\n]+\\n)*?[ ]{8}run: \\|\\n((?:[ ]{10}.*\\n|[ ]*\\n)+)`,
  ).exec(workflow);
  if (!match?.[1]) throw new Error(`No step "${name}"`);
  return match[1].replace(/^ {10}/gm, "");
}

const BUILD_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const BUILD_PAGE = `https://expo.dev/accounts/a/projects/p/builds/${BUILD_ID}`;
const ARTIFACT = "https://expo.dev/artifacts/eas/secret-token.ipa";
const DEVICE = "00008030-001A2B3C4D5E6F70";
const MAP_KEY = `AIza${"k".repeat(35)}`;
const build = "Complete hosted native build without publishing the build page";
const config = "Resolve selected native build configuration";

describe("passenger native build", () => {
  let dir = "";
  let bin = "";
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "passenger-native-build-"));
    bin = path.join(dir, "bin");
    fs.mkdirSync(bin);
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  function run(step: string, stub: string, artifact = "PK-app") {
    const write = (name: string, body: string) =>
      fs.writeFileSync(path.join(bin, name), `#!/usr/bin/env bash\n${body}\n`, {
        mode: 0o755,
      });
    write("npx", stub);
    write(
      "curl",
      artifact
        ? `while [[ $# -gt 0 ]]; do [[ $1 == --output ]] && printf '${artifact}' > "$2"; shift; done; true`
        : "echo curl failed >&2; exit 22",
    );
    const outcome = spawnSync("bash", ["-c", stepRun(step)], {
      cwd: dir,
      encoding: "utf8",
      timeout: 10_000,
      env: {
        PATH: `${bin}:${process.env.PATH ?? "/usr/bin:/bin"}`,
        RUNNER_TEMP: dir,
        BUILD_PLATFORM: "ios",
        BUILD_PROFILE: "production",
      },
    });
    const uploaded = [
      "passenger-eas-config.log",
      "passenger-eas-build-receipt.json",
    ]
      .map((name) => path.join(dir, name))
      .filter((file) => fs.existsSync(file))
      .map((file) => fs.readFileSync(file, "utf8"))
      .join("\n");
    const output = `${outcome.stdout}${outcome.stderr}`;
    for (const secret of [
      BUILD_ID,
      "expo.dev",
      "secret-token",
      MAP_KEY,
      "Example Company",
      DEVICE,
    ])
      expect(`${output}\n${uploaded}`).not.toContain(secret);
    return { status: outcome.status, output };
  }

  function runBuild(result: unknown, exitCode = 0, artifact?: string) {
    fs.writeFileSync(path.join(dir, "result.json"), JSON.stringify(result));
    return run(
      build,
      `printf '%s\\n' "Build details: ${BUILD_PAGE}" "Apple Team ABCDE12345 (Example Company)" "- ${DEVICE} iPhone" "Error: ${BUILD_PAGE} key ${MAP_KEY} device ${DEVICE}" >&2; cat "${dir}/result.json"; exit ${exitCode}`,
      artifact,
    );
  }
  const receipt = () =>
    JSON.parse(
      fs.readFileSync(
        path.join(dir, "passenger-eas-build-receipt.json"),
        "utf8",
      ),
    );
  const built = (fields: Record<string, unknown> = {}) => [
    {
      id: BUILD_ID,
      platform: "IOS",
      status: "FINISHED",
      buildProfile: "production",
      distribution: "STORE",
      sdkVersion: "54.0.0",
      appVersion: "1.0.0",
      appBuildVersion: "7",
      gitCommitHash: "a".repeat(40),
      initiatingActor: { displayName: "someone" },
      logFiles: [`${BUILD_PAGE}/log`],
      artifacts: {
        buildUrl: ARTIFACT,
        applicationArchiveUrl: ARTIFACT,
        xcodeBuildLogsUrl:
          "https://storage.googleapis.com/log?X-Goog-Signature=1",
      },
      ...fields,
    },
  ];

  it("keeps a finished build's identity and hash, without its id or any URL", () => {
    const { status } = runBuild(built());
    expect(status).toBe(0);
    expect(receipt()).toMatchObject({
      exitCode: 0,
      platform: "IOS",
      status: "FINISHED",
      buildProfile: "production",
      appBuildVersion: "7",
      gitCommitHash: "a".repeat(40),
      error: null,
      artifact: { bytes: 6, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) },
    });
    for (const key of ["id", "artifacts", "logFiles", "initiatingActor"])
      expect(receipt()).not.toHaveProperty(key);
  });

  it("fails on an errored build and keeps a redacted reason", () => {
    const { status } = runBuild(
      built({
        status: "ERRORED",
        artifacts: {},
        error: {
          errorCode: "UNKNOWN_ERROR",
          message: `See "${BUILD_PAGE}" or expo.dev/b/1 build ${BUILD_ID} ${MAP_KEY}`,
        },
      }),
      1,
    );
    expect(status).not.toBe(0);
    expect(receipt()).toMatchObject({
      exitCode: 1,
      status: "ERRORED",
      error: {
        errorCode: "UNKNOWN_ERROR",
        message: 'See "[URL]" or [URL] build [ID] [REDACTED_MAP_KEY]',
      },
    });
  });

  it("fails on a cancelled build, a build without an artifact, and no build", () => {
    expect(runBuild(built({ status: "CANCELED" })).status).not.toBe(0);
    expect(runBuild(built({ artifacts: {} })).status).not.toBe(0);
    const none = runBuild([], 1);
    expect(none.status).not.toBe(0);
    expect(none.output).toContain(
      "Error: [URL] key [REDACTED_MAP_KEY] device [DEVICE]",
    );
    fs.writeFileSync(path.join(dir, "result.json"), "");
  });

  it.each(["", "not json", "null", "[] []"])(
    "fails on output that is not one build (%j)",
    (raw) => {
      fs.writeFileSync(path.join(dir, "result.json"), raw);
      expect(run(build, `cat "${dir}/result.json"`).status).not.toBe(0);
    },
  );

  it("fails with the CLI's own code even when it reports a finished build", () => {
    expect(runBuild(built(), 7).status).toBe(7);
    expect(receipt()).toMatchObject({ exitCode: 7, status: "FINISHED" });
  });

  it.each(["<html>sign in</html>", ""])(
    "does not hash a sign-in page or a refused download (%j)",
    (artifact) => {
      const { status, output } = runBuild(built(), 0, artifact);
      expect(status).toBe(0);
      expect(output).toContain("::warning::The build finished");
      expect(receipt().artifact).toBeUndefined();
    },
  );

  it("redacts the resolved configuration and fails when it cannot be resolved", () => {
    expect(
      run(config, `echo "page ${BUILD_PAGE} key ${MAP_KEY}"`).output,
    ).toContain("page [URL] key [REDACTED_MAP_KEY]");
    expect(run(config, "exit 3").status).not.toBe(0);
  });

  it("uploads only redacted files", () => {
    const upload = workflow.slice(workflow.indexOf("actions/upload-artifact"));
    expect(
      [...upload.matchAll(/runner\.temp \}\}\/(\S+)/g)].map((m) => m[1]),
    ).toEqual(["passenger-eas-config.log", "passenger-eas-build-receipt.json"]);
  });
});
