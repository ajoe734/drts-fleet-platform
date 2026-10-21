import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const runner = path.join(
  process.cwd(),
  "operations/verification/run-operational-browser-acceptance.sh",
);
const sha = "a".repeat(40);
const host = "registered.partner.example.test";
const slug = "controlled-entry";
const proof = "synthetic-google-api-invocation-proof";
let directory: string;

function execute(
  options: {
    status?: string;
    body?: string;
    headers?: string;
    transportExit?: number;
    missingProof?: boolean;
  } = {},
) {
  const result = spawnSync("bash", [runner, "--resolve-referral-entry-host"], {
    encoding: "utf8",
    timeout: 5000,
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH ?? ""}`,
      DRTS_DEV_API_BASE_URL: "https://api.example.test",
      DRTS_REFERRAL_ENTRY_SLUG: slug,
      DRTS_REFERRAL_HOST_API_ID_TOKEN: options.missingProof ? "" : proof,
      DRTS_CANDIDATE_SHA: sha,
      TEST_CALLS: path.join(directory, "calls.json"),
      TEST_STATUS: options.status ?? "200",
      TEST_BODY:
        options.body ??
        JSON.stringify({ data: { entry_slug: slug, entry_host: host } }),
      TEST_HEADERS:
        options.headers ?? `HTTP/2 200\r\nx-drts-candidate-sha: ${sha}\r\n\r\n`,
      TEST_TRANSPORT_EXIT: String(options.transportExit ?? 0),
    },
  });
  expect(result.error).toBeUndefined();
  expect(`${result.stdout}${result.stderr}`).not.toContain(proof);
  return result;
}
function calledArguments(): string[] {
  return JSON.parse(
    readFileSync(path.join(directory, "calls.json"), "utf8"),
  ) as string[];
}
function denied(options: Parameters<typeof execute>[0]) {
  const result = execute(options);
  expect(result.status).not.toBe(0);
  expect(result.stdout).toBe("");
  expect(result.stderr).not.toContain("private-response-marker");
}

describe("normal operational runner canonical entry host resolver", () => {
  beforeEach(() => {
    directory = mkdtempSync(
      path.join(tmpdir(), "referral-host-resolver-unit-"),
    );
    // Only the curl transport is controlled. Execute the real normal runner,
    // including its HTTP/header/JSON/entry/host validation and early exit.
    writeFileSync(
      path.join(directory, "curl"),
      `#!/usr/bin/env python3
import json, os, pathlib, sys
args=sys.argv[1:]
pathlib.Path(os.environ['TEST_CALLS']).write_text(json.dumps(args))
if int(os.environ['TEST_TRANSPORT_EXIT']): sys.exit(int(os.environ['TEST_TRANSPORT_EXIT']))
def output(flag, value):
    pathlib.Path(args[args.index(flag)+1]).write_text(value)
output('--output', os.environ['TEST_BODY'])
output('--dump-header', os.environ['TEST_HEADERS'])
print(os.environ['TEST_STATUS'], end='')
`,
      { mode: 0o700 },
    );
    for (const command of ["npx", "pnpm", "gcloud"]) {
      writeFileSync(
        path.join(directory, command),
        "#!/bin/sh\necho 'unexpected browser/cloud execution' >&2\nexit 97\n",
        { mode: 0o700 },
      );
    }
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it("returns only the exact current host after a bounded GET with Google invocation proof and matching candidate/entry", () => {
    const result = execute();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${host}\n`);
    const args = calledArguments();
    expect(args).toContain(
      `https://api.example.test/api/partner/entries/${slug}`,
    );
    expect(args).toContain(`X-Serverless-Authorization: Bearer ${proof}`);
    expect(args).toContain("GET");
    expect(args).toContain("--max-time");
    expect(args).toContain("--max-filesize");
    expect(args).not.toContain("--retry");
    expect(args).not.toContain("--location");
    expect(args).not.toContain("-L");
    expect(args.some((a) => /^Authorization:|^x-drts-/i.test(a))).toBe(false);
    expect(args).not.toContain("--data");
    expect(result.stderr).toBe("");
  });

  it("accepts the API camel wire spelling without changing the returned host", () => {
    const result = execute({
      body: JSON.stringify({ data: { entrySlug: slug, entryHost: host } }),
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${host}\n`);
  });

  it.each(["201", "302", "403", "429", "500"])(
    "rejects HTTP %s without response-body output or retry",
    (status) => {
      denied({ status, body: "private-response-marker" });
      expect(calledArguments()).not.toContain("--retry");
    },
  );

  it.each([
    "",
    `x-drts-candidate-sha: ${"b".repeat(40)}\r\n`,
    `x-drts-candidate-sha: ${sha.slice(0, 7)}\r\n`,
    `x-drts-candidate-sha: ${sha}\r\nx-drts-candidate-sha: ${sha}\r\n`,
  ])(
    "rejects missing, foreign, abbreviated or duplicate candidate headers (%s)",
    (headers) => denied({ headers: `HTTP/2 200\r\n${headers}\r\n` }),
  );

  it("rejects a response belonging to another entry", () => {
    denied({
      body: JSON.stringify({
        data: { entry_slug: "foreign-entry", entry_host: host },
      }),
    });
  });

  it("rejects a missing entry identifier rather than trusting a host alone", () => {
    denied({ body: JSON.stringify({ data: { entry_host: host } }) });
  });

  it.each([
    undefined,
    "",
    "*.partner.example.test",
    "first.example.test second.example.test",
    "first.example.test,second.example.test",
    "user@partner.example.test",
    "https://partner.example.test",
    "partner.example.test/path",
    "partner.example.test?key=value",
    "partner.example.test\nINJECTED=value",
  ])("rejects missing or unsafe host data (%s)", (entryHost) =>
    denied({
      body: JSON.stringify({
        data: { entry_slug: slug, entry_host: entryHost },
      }),
    }),
  );

  it("rejects ambiguous snake/camel authority fields", () => {
    denied({
      body: JSON.stringify({
        data: {
          entry_slug: slug,
          entrySlug: "foreign-entry",
          entry_host: host,
        },
      }),
    });
  });

  it("rejects malformed JSON without printing it", () =>
    denied({ body: "private-response-marker" }));

  it("fails closed when Google API invocation proof is absent", () =>
    denied({ missingProof: true }));

  it("does not turn a transport failure into a fallback host", () =>
    denied({ transportExit: 28 }));
});
