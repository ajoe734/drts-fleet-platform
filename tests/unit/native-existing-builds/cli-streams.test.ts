import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const lookup = require("../../../operations/verification/native-existing-builds/lookup.cjs");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const ANDROID_ID = "cb4b7f81-90bd-481e-970a-fbb1009582c0";
const IOS_ID = "3f4d1b8b-9811-4d03-ab31-e7554de30bff";
const TOKEN = "fixture_expo_token_no_network";
const STDERR_ENVELOPE = "Error: build:view command failed.\n";

// Only the external CLI is a fixture. lookupExistingBuilds uses its default
// execFileSync runner, ephemeral project, JSON parser and error classifier.
async function runCliFixture(mode: string, stream = "stdout", diagnostic = "") {
  const temp = fs.mkdtempSync(
    path.join(os.tmpdir(), "driver-eas-stream-test-"),
  );
  const bin = path.join(temp, "bin");
  const callsFile = path.join(temp, "calls.jsonl");
  fs.mkdirSync(bin);
  fs.writeFileSync(
    path.join(bin, "npx"),
    `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify({
  args, cwd: process.cwd(), root: process.env.EAS_PROJECT_ROOT,
  noVcs: process.env.EAS_NO_VCS,
  usesFixtureIdentity: process.env.EXPO_TOKEN === ${JSON.stringify(TOKEN)}
}) + "\\n");
if (process.env.FIXTURE_MODE === "failure") {
  process.stderr.write(${JSON.stringify(STDERR_ENVELOPE)});
  process[process.env.FIXTURE_STREAM].write(process.env.FIXTURE_DIAGNOSTIC);
  process.exitCode = 1;
} else {
  if (process.env.FIXTURE_MODE === "warning") {
    process.stdout.write("Failed to get Git root path with git rev-parse --show-toplevel.\\n");
  }
  const id = args[3];
  process.stdout.write(JSON.stringify({
    id, platform: id === ${JSON.stringify(ANDROID_ID)} ? "ANDROID" : "IOS",
    status: "IN_QUEUE", project: {id: process.env.DRIVER_APP_EAS_PROJECT_ID}
  }));
}
`,
    { mode: 0o700 },
  );
  try {
    const receipt = await lookup.lookupExistingBuilds(
      {
        PATH: `${bin}${path.delimiter}${process.env.PATH || ""}`,
        WORKFLOW_MODE: "lookup-existing",
        EXPO_TOKEN: TOKEN,
        DRIVER_APP_EAS_PROJECT_ID: lookup.EXPECTED_DRIVER_PROJECT.projectId,
        LOOKUP_ANDROID_BUILD_ID: ANDROID_ID,
        LOOKUP_IOS_BUILD_ID: IOS_ID,
        LOOKUP_EXPECTED_SOURCE_SHA: "0e722795dec202e960e504a8fa67526fc567ed0f",
        SUBMIT_TO_TESTFLIGHT: "false",
        EAS_PROJECT_ROOT: "/ambient/root/must/be/overridden",
        FIXTURE_CALLS: callsFile,
        FIXTURE_MODE: mode,
        FIXTURE_STREAM: stream,
        FIXTURE_DIAGNOSTIC: diagnostic,
      },
      { repoRoot: REPO_ROOT },
    );
    const calls = fs
      .readFileSync(callsFile, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    for (const call of calls) {
      expect(call.args).toEqual([
        "--yes",
        "eas-cli@21.4.0",
        "build:view",
        call.args[3],
        "--json",
      ]);
      expect(call.noVcs).toBe("1");
      expect(call.usesFixtureIdentity).toBe(true);
      expect(fs.existsSync(call.cwd)).toBe(false);
    }
    expect(receipt.guardrails.temporaryArtifactsDeleted).toBe(true);
    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain("fixture-signature");
    expect(serialized).not.toMatch(/https?:\/\//i);
    return { receipt, calls };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

describe("default EAS build:view subprocess streams (no network)", () => {
  it.each(["json", "warning"])(
    "reads %s output outside Git with an explicit project root",
    async (mode) => {
      const { receipt, calls } = await runCliFixture(mode);
      expect(calls.map((call) => call.args[3])).toEqual([ANDROID_ID, IOS_ID]);
      expect(calls.every((call) => call.root === call.cwd)).toBe(true);
      expect(
        receipt.builds.map(
          (build: { readbackStatus: string }) => build.readbackStatus,
        ),
      ).toEqual(["observed", "observed"]);
      // Synthetic IN_QUEUE data proves parsing, not hosted terminal/signature acceptance.
      expect(receipt.status).toBe("incomplete_or_failed");
    },
  );

  it.each([
    [
      "Entity Not Authorized (action = READ)",
      "UNAUTHORIZED_PROJECT_OR_BUILD_READ",
      true,
    ],
    ["Invalid token", "AUTHENTICATION_REJECTED", true],
    [
      "Either log in with eas login or set the EXPO_TOKEN environment variable if you're using EAS CLI on CI",
      "AUTHENTICATION_REJECTED",
      true,
    ],
    ["GraphQL request failed", "GRAPHQL_REQUEST_FAILED", true],
    ["Build not found", "BUILD_NOT_FOUND", false],
    ["Unexpected command error", "EAS_CLI_VIEW_FAILED", false],
  ])(
    "classifies %s on either stream without exposing diagnostics",
    async (message, classification, stop) => {
      for (const stream of ["stdout", "stderr"]) {
        const diagnostic = `${message} ${TOKEN} https://expo.dev/fixture?Signature=fixture-signature\n`;
        const { receipt, calls } = await runCliFixture(
          "failure",
          stream,
          diagnostic,
        );
        expect(calls.map((call) => call.args[3])).toEqual(
          stop ? [ANDROID_ID] : [ANDROID_ID, IOS_ID],
        );
        expect(receipt.awaitingOperatorAction).toBe(stop);
        expect(receipt.builds[0].cliFailure.classification).toBe(
          classification,
        );
        expect(receipt.builds[0].cliFailure.stderrSha256).toBe(
          lookup.sha256Hex(
            STDERR_ENVELOPE + (stream === "stderr" ? diagnostic : ""),
          ),
        );
        expect(receipt.builds[1].readbackStatus).toBe(
          stop
            ? "skipped_after_authorization_denial"
            : "blocked_cli_view_failed",
        );
        expect(JSON.stringify(receipt)).not.toContain(message);
      }
    },
  );
});
