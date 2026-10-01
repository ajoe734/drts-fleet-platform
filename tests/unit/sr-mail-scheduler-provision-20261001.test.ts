import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import * as jwt from "jsonwebtoken";
import { afterEach, describe, expect, it, vi } from "vitest";

import { matchesScope } from "../../apps/api/src/common/auth/internal-key-exception-registry";
import { GoogleWorkloadIdentityAdapter } from "../../apps/api/src/modules/auth/google-workload-identity.adapter";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";

const repoRoot = path.resolve(__dirname, "../..");
const registryDocPath = path.join(
  repoRoot,
  "docs/02-architecture/internal-key-exceptions.md",
);
const runbookPath = path.join(
  repoRoot,
  "docs/03-runbooks/dev-scheduled-tasks-20261001.md",
);
const scriptPath = path.join(
  repoRoot,
  "infra/gcp/dev/scheduler/provision-dev-scheduler.sh",
);
const confirmJobAttemptScriptPath = path.join(
  repoRoot,
  "infra/gcp/dev/scheduler/confirm-job-attempt.sh",
);
const fakeGcloudModulePath = path.join(
  repoRoot,
  "tests/unit/fixtures/sr-mail-scheduler-provision-20261001/fake-gcloud.mjs",
);

const API_ORIGIN = "https://drts-dev-api-r6ykdme3wa-uc.a.run.app";
const SCHEDULER_SA_EMAIL =
  "drts-dev-scheduler@drts-dev-devcc-20260825.iam.gserviceaccount.com";

const MAIL_OUTBOX_ROUTE_SCOPE = "POST internal/scheduled-tasks/mail-outbox/drain";
const APPROVAL_REMINDER_ROUTE_SCOPE =
  "POST internal/scheduled-tasks/approval-timeout-reminders/run";

/** The exact routeScopes/scopes entry C must declare -- asserted against the
 * delivered JSON below, not fed to the adapter directly. */
const ENTRY_C_ROUTE_SCOPES = [
  MAIL_OUTBOX_ROUTE_SCOPE,
  APPROVAL_REMINDER_ROUTE_SCOPE,
];
const ENTRY_C_SCOPES = [
  "notification-delivery:drain",
  "tenant-partner:approval-timeout-reminders:run",
];

type RegistryEntry = {
  serviceAccountEmail: string;
  principalId: string;
  allowedTokenAudiences: string[];
  routeScopes: string[];
  scopes?: string[];
  ciTenantActorGrants?: unknown[];
};

function isEntryC(entry: unknown): entry is RegistryEntry {
  return (
    !!entry &&
    typeof entry === "object" &&
    (entry as RegistryEntry).serviceAccountEmail === SCHEDULER_SA_EMAIL
  );
}

/** Parses every ```json fenced block in the doc, skipping blocks that don't
 * parse. Scoping to fenced code blocks (rather than scanning raw doc text)
 * is what lets this distinguish the real delivered JSON from prose that
 * merely mentions the same strings (e.g. the narrative paragraph above
 * §8.1). */
function parseJsonFences(doc: string): unknown[] {
  const fenceRe = /```json\n([\s\S]*?)```/g;
  const parsed: unknown[] = [];
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(doc)) !== null) {
    const body = match[1];
    if (body === undefined) continue;
    try {
      parsed.push(JSON.parse(body));
    } catch {
      // Malformed JSON in a fence is a real authoring defect; the lookups
      // below will report it as "entry C not found" rather than silently
      // skipping a broken block.
    }
  }
  return parsed;
}

const registryDocText = readFileSync(registryDocPath, "utf8");
const jsonFences = parseJsonFences(registryDocText);

/** §8.1's standalone single-object entry C. */
const standaloneEntryC = jsonFences.find(
  (parsed): parsed is RegistryEntry => !Array.isArray(parsed) && isEntryC(parsed),
);

/** §8.2's full three-entry array, and entry C as it appears inside it. */
const threeEntryArray = jsonFences.find(
  (parsed): parsed is RegistryEntry[] =>
    Array.isArray(parsed) && parsed.some(isEntryC),
);
const entryCFromArray = threeEntryArray?.find(isEntryC);

describe("SR-MAIL-SCHEDULER-PROVISION-20261001: entry C routeScopes format (matchesScope)", () => {
  it("matches both scheduled-task routes as the guard would present them (leading /api, leading slash)", () => {
    expect(
      matchesScope(
        MAIL_OUTBOX_ROUTE_SCOPE,
        "POST",
        "/api/internal/scheduled-tasks/mail-outbox/drain",
      ),
    ).toBe(true);
    expect(
      matchesScope(
        APPROVAL_REMINDER_ROUTE_SCOPE,
        "POST",
        "/api/internal/scheduled-tasks/approval-timeout-reminders/run",
      ),
    ).toBe(true);
  });

  it("denies every other route, method mismatch, and prefix/suffix variant against either pattern", () => {
    const denied: Array<[string, string]> = [
      ["GET", "/api/internal/scheduled-tasks/mail-outbox/drain"],
      ["POST", "/api/auth/token"],
      ["GET", "/api/health"],
      ["POST", "/api/tenant/passengers"],
      ["POST", "/api/internal/scheduled-tasks/mail-outbox/drain/extra"],
      ["POST", "/api/internal/scheduled-tasks"],
      ["GET", "/api/internal/scheduled-tasks/approval-timeout-reminders/run"],
    ];
    for (const [method, requestPath] of denied) {
      const anyMatch = ENTRY_C_ROUTE_SCOPES.some((pattern) =>
        matchesScope(pattern, method, requestPath),
      );
      expect(anyMatch, `expected ${method} ${requestPath} to be denied`).toBe(
        false,
      );
    }
  });
});

describe("SR-MAIL-SCHEDULER-PROVISION-20261001: entry C enforced end to end through the real adapter", () => {
  let keyCounter = 0;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Registry fed to the adapter is the *delivered* §8.2 entry C, parsed from
  // the doc above -- not a hand-built literal. A wildcard, extra-route, or
  // malformed mutation of the delivered JSON therefore changes what these
  // tests actually exercise, so the denial tests below fail if it regresses.
  if (!entryCFromArray) {
    throw new Error(
      "§8.2 entry C not found/parsable in docs/02-architecture/internal-key-exceptions.md -- cannot drive adapter tests from delivered content",
    );
  }
  const deliveredEntryC = entryCFromArray;

  function setUp() {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const jwk = publicKey.export({ format: "jwk" }) as {
      kty: string;
      n: string;
      e: string;
    };
    const kid = `sr-mail-scheduler-test-key-${++keyCounter}`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ keys: [{ kty: jwk.kty, kid, n: jwk.n, e: jwk.e }] }),
          { status: 200 },
        ),
      ),
    );
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      {
        iss: "https://accounts.google.com",
        sub: "sr-mail-scheduler-subject",
        email: deliveredEntryC.serviceAccountEmail,
        email_verified: true,
        aud: deliveredEntryC.allowedTokenAudiences[0],
        iat: now,
        exp: now + 300,
      },
      privateKey,
      { algorithm: "RS256", keyid: kid },
    );
    process.env.WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS = JSON.stringify([
      deliveredEntryC,
    ]);
    const adapter = new GoogleWorkloadIdentityAdapter(new IdentityRepository());
    return { adapter, token };
  }

  it("resolves the mail-outbox drain route and grants exactly notification-delivery:drain", async () => {
    const { adapter, token } = setUp();
    const resolved = await adapter.verifyServicePrincipal(
      { "x-drts-google-id-token": token },
      {
        requestPath: "/api/internal/scheduled-tasks/mail-outbox/drain",
        requestMethod: "POST",
      },
    );
    expect(resolved.principalId).toBe("dev-scheduler");
    expect(resolved.scopes.sort()).toEqual([...ENTRY_C_SCOPES].sort());
  });

  it("resolves the approval-timeout reminder route with a fresh token (distinct from the drain call above)", async () => {
    const { adapter, token } = setUp();
    const resolved = await adapter.verifyServicePrincipal(
      { "x-drts-google-id-token": token },
      {
        requestPath: "/api/internal/scheduled-tasks/approval-timeout-reminders/run",
        requestMethod: "POST",
      },
    );
    expect(resolved.principalId).toBe("dev-scheduler");
  });

  it("rejects a request to any other route with WORKLOAD_ROUTE_SCOPE_DENIED", async () => {
    const { adapter, token } = setUp();
    await expect(
      adapter.verifyServicePrincipal(
        { "x-drts-google-id-token": token },
        { requestPath: "/api/auth/token", requestMethod: "POST" },
      ),
    ).rejects.toMatchObject({ code: "WORKLOAD_ROUTE_SCOPE_DENIED" });
  });

  it("rejects the in-scope path with the wrong HTTP method", async () => {
    const { adapter, token } = setUp();
    await expect(
      adapter.verifyServicePrincipal(
        { "x-drts-google-id-token": token },
        {
          requestPath: "/api/internal/scheduled-tasks/mail-outbox/drain",
          requestMethod: "GET",
        },
      ),
    ).rejects.toMatchObject({ code: "WORKLOAD_ROUTE_SCOPE_DENIED" });
  });

  it("rejects a generic tenant-facing route even though the token itself verifies cleanly", async () => {
    const { adapter, token } = setUp();
    await expect(
      adapter.verifyServicePrincipal(
        { "x-drts-google-id-token": token },
        { requestPath: "/api/tenant/passengers", requestMethod: "GET" },
      ),
    ).rejects.toMatchObject({ code: "WORKLOAD_ROUTE_SCOPE_DENIED" });
  });
});

describe("SR-MAIL-SCHEDULER-PROVISION-20261001: registry doc's delivered JSON is parsed and locked by tests, not prose-matched", () => {
  it("both the §8.1 standalone entry and the §8.2 array copy of entry C are present, valid JSON, and agree exactly", () => {
    expect(
      standaloneEntryC,
      "§8.1 standalone entry C JSON block not found/parsable",
    ).toBeDefined();
    expect(
      entryCFromArray,
      "§8.2 three-entry JSON array (or entry C within it) not found/parsable",
    ).toBeDefined();
    expect(standaloneEntryC).toEqual(entryCFromArray);
  });

  it("entry C declares exactly the two documented routes and scopes, the verified audience, and nothing else -- no wildcard, no extra route, no ciTenantActorGrants", () => {
    const entry = standaloneEntryC as RegistryEntry;
    expect(entry.principalId).toBe("dev-scheduler");
    expect(entry.allowedTokenAudiences).toEqual([API_ORIGIN]);
    expect([...entry.routeScopes].sort()).toEqual(
      [...ENTRY_C_ROUTE_SCOPES].sort(),
    );
    expect(entry.routeScopes).toHaveLength(ENTRY_C_ROUTE_SCOPES.length);
    expect([...(entry.scopes ?? [])].sort()).toEqual(
      [...ENTRY_C_SCOPES].sort(),
    );
    // ciTenantActorGrants only gates the POST auth/token CI-impersonation
    // branch, which entry C's routeScopes never grants access to.
    expect(Object.keys(entry).sort()).toEqual(
      [
        "allowedTokenAudiences",
        "principalId",
        "routeScopes",
        "scopes",
        "serviceAccountEmail",
      ].sort(),
    );
  });

  it("the §8.2 array has exactly three entries: A, B, and C, each a distinct service account", () => {
    expect(threeEntryArray).toHaveLength(3);
    const emails = (threeEntryArray as RegistryEntry[])
      .map((entry) => entry.serviceAccountEmail)
      .sort();
    expect(emails).toEqual(
      [
        "drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com",
        "github-actions-deployer@drts-dev-devcc-20260825.iam.gserviceaccount.com",
        SCHEDULER_SA_EMAIL,
      ].sort(),
    );
  });
});

describe("SR-MAIL-SCHEDULER-PROVISION-20261001: provisioning script is minimal-privilege and idempotent", () => {
  it("enables the Cloud Scheduler API, creates the scheduler service account, and wires OIDC token minting", () => {
    const script = readFileSync(scriptPath, "utf8");
    expect(script).toContain("set -euo pipefail");
    expect(script).toContain("cloudscheduler.googleapis.com");
    expect(script).toContain("iam service-accounts create");
    expect(script).toContain("--oidc-service-account-email");
    expect(script).toContain("--oidc-token-audience");
  });

  it("grants only the OIDC-token-minting role, not the broader token-creator role", () => {
    const script = readFileSync(scriptPath, "utf8");
    expect(script).toContain("roles/iam.serviceAccountOpenIdTokenCreator");
    expect(script).not.toContain("roles/iam.serviceAccountTokenCreator");
  });

  it("points operators at the bounded completion check, not just job-describe's top-level fields", () => {
    const script = readFileSync(scriptPath, "utf8");
    expect(script).toContain("confirm-job-attempt.sh");
    expect(script).not.toMatch(/status\.lastAttemptTime/);
    expect(script).not.toMatch(/status\.state/);
  });

  it("creates or updates exactly the two documented HTTP jobs", () => {
    const script = readFileSync(scriptPath, "utf8");
    expect(script).toContain("mail-outbox-drain");
    expect(script).toContain("approval-timeout-reminders-run");
    expect(script).toContain("internal/scheduled-tasks/mail-outbox/drain");
    expect(script).toContain(
      "internal/scheduled-tasks/approval-timeout-reminders/run",
    );
    expect(script).toContain("scheduler jobs create http");
    expect(script).toContain("scheduler jobs update http");
  });

  it("never grants a project-level IAM role", () => {
    const script = readFileSync(scriptPath, "utf8");
    expect(script).not.toContain("projects add-iam-policy-binding");
  });

  it("never reads or writes the WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS registry secret", () => {
    const script = readFileSync(scriptPath, "utf8");
    expect(script).not.toMatch(/secrets (create|versions)/);
  });

  it("checks for existing resources before creating them (idempotent)", () => {
    const script = readFileSync(scriptPath, "utf8");
    expect(script).toContain("iam service-accounts describe");
    expect(script).toContain("scheduler jobs describe");
  });
});

describe("SR-MAIL-SCHEDULER-PROVISION-20261001: runbook sequences deploy, registry, then script", () => {
  it("orders the two prerequisite deploys before the registry update and the provisioning script", () => {
    const runbook = readFileSync(runbookPath, "utf8");
    const deployStep = runbook.indexOf("SR-MAIL-RETRY-SCHEDULE-20261001");
    const registryStep = runbook.indexOf(
      "WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS` registry secret",
    );
    const scriptStep = runbook.indexOf("provision-dev-scheduler.sh");
    expect(deployStep).toBeGreaterThan(-1);
    expect(registryStep).toBeGreaterThan(-1);
    expect(scriptStep).toBeGreaterThan(-1);
    expect(deployStep).toBeLessThan(registryStep);
    expect(registryStep).toBeLessThan(scriptStep);
  });

  it("documents how to confirm a scheduled trigger actually fires, not just that the job exists", () => {
    const runbook = readFileSync(runbookPath, "utf8");
    expect(runbook).toContain("scheduler jobs run");
    expect(runbook).toContain("AUTH_GOOGLE_WORKLOAD_IDENTITY_USED");
    expect(runbook).toContain("principalId=dev-scheduler");
  });

  it("uses the real top-level Job fields and textPayload, not status.* or jsonPayload", () => {
    const runbook = readFileSync(runbookPath, "utf8");
    expect(runbook).toContain("lastAttemptTime,state,status.code");
    expect(runbook).not.toMatch(/status\.lastAttemptTime/);
    expect(runbook).toContain("textPayload");
    expect(runbook).not.toMatch(/jsonPayload\.message/);
  });

  it("documents that BootstrapAuthGuard swallows adapter errors to JWT_INVALID, so only route-scope denial is log-visible", () => {
    const runbook = readFileSync(runbookPath, "utf8");
    expect(runbook).toContain("JWT_INVALID");
    expect(runbook).toContain("AUTH_GOOGLE_WORKLOAD_IDENTITY_ROUTE_SCOPE_DENIED");
  });

  it("points at the bounded completion check for actual job-run confirmation", () => {
    const runbook = readFileSync(runbookPath, "utf8");
    expect(runbook).toContain("confirm-job-attempt.sh");
    expect(runbook).toContain("AttemptFinished");
  });
});

/** Synthetic log record consumed by the offline `gcloud` stand-in at
 * tests/unit/fixtures/sr-mail-scheduler-provision-20261001/fake-gcloud.cjs.
 * Mirrors just the fields confirm-job-attempt.sh's `gcloud logging read`
 * filters key off (job_id/timestamp for the Scheduler query, requestUrl/
 * timestamp for the Cloud Run query). */
type FakeGcloudRecord =
  | { type: "scheduler"; jobId: string; timestamp: string; statusCode?: string }
  | { type: "run"; requestUrl: string; timestamp: string; httpStatus: string };

/** Runs the real infra/gcp/dev/scheduler/confirm-job-attempt.sh against a
 * synthetic `gcloud` on PATH, entirely offline: no network call, no live
 * Scheduler job, no live Cloud Run request. The fake only answers with
 * whatever `records` this test supplies, filtered the same way the real
 * `gcloud logging read` filters embedded in the script would filter them
 * (job_id/route match, timestamp at-or-after invocation) -- so a record
 * that predates the script's own invocation or names a different job is
 * excluded exactly as it would be against live Cloud Logging. */
function runConfirmJobAttempt(
  records: FakeGcloudRecord[],
  options: { jobName?: string; routeSubstring?: string; timeoutSeconds?: number } = {},
): { exitCode: number | null; output: string } {
  const jobName = options.jobName ?? "drts-dev-mail-outbox-drain";
  const routeSubstring =
    options.routeSubstring ?? "internal/scheduled-tasks/mail-outbox/drain";
  const timeoutSeconds = options.timeoutSeconds ?? 0;

  const dir = mkdtempSync(path.join(tmpdir(), "confirm-job-attempt-"));
  const fixturePath = path.join(dir, "fixture.json");
  writeFileSync(fixturePath, JSON.stringify({ records }));

  // bash wrapper named exactly `gcloud`, resolved via a PATH entry that is
  // prepended ahead of any real `gcloud` -- the script under test is never
  // told it is talking to anything but `gcloud`.
  const gcloudWrapperPath = path.join(dir, "gcloud");
  writeFileSync(
    gcloudWrapperPath,
    `#!/usr/bin/env bash\nexec node "${fakeGcloudModulePath}" "$@"\n`,
  );
  chmodSync(gcloudWrapperPath, 0o755);

  try {
    const stdout = execFileSync(
      "bash",
      [confirmJobAttemptScriptPath, jobName, routeSubstring, String(timeoutSeconds)],
      {
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH ?? ""}`,
          FAKE_GCLOUD_FIXTURE: fixturePath,
        },
        encoding: "utf8",
      },
    );
    return { exitCode: 0, output: stdout };
  } catch (error: unknown) {
    const execError = error as {
      status?: number | null;
      stdout?: string;
      stderr?: string;
    };
    return {
      exitCode: execError.status ?? null,
      output: `${execError.stdout ?? ""}${execError.stderr ?? ""}`,
    };
  }
}

describe("SR-MAIL-SCHEDULER-PROVISION-20261001: confirm-job-attempt.sh's completion check is bounded, not just lastAttemptTime/state", () => {
  it("rejects when there is no completion evidence at all (pending/in-flight)", () => {
    const result = runConfirmJobAttempt([]);
    expect(result.exitCode).toBe(2);
  });

  it("rejects a completion record that predates this invocation (stale evidence)", () => {
    const result = runConfirmJobAttempt([
      {
        type: "scheduler",
        jobId: "drts-dev-mail-outbox-drain",
        timestamp: "2020-01-01T00:00:00Z",
        statusCode: "0",
      },
    ]);
    expect(result.exitCode).toBe(2);
  });

  it("rejects a fresh completion record for a different job (wrong-job evidence)", () => {
    const result = runConfirmJobAttempt(
      [
        {
          type: "scheduler",
          jobId: "drts-dev-approval-timeout-reminders-run",
          timestamp: "2099-01-01T00:00:00Z",
          statusCode: "0",
        },
      ],
      { jobName: "drts-dev-mail-outbox-drain" },
    );
    expect(result.exitCode).toBe(2);
  });

  it("accepts a matching, fresh Scheduler AttemptFinished success record", () => {
    const result = runConfirmJobAttempt([
      {
        type: "scheduler",
        jobId: "drts-dev-mail-outbox-drain",
        timestamp: "2099-01-01T00:00:00Z",
      },
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("CONFIRMED COMPLETED (success");
  });

  it("reports a matching, fresh Scheduler AttemptFinished failure record instead of claiming success", () => {
    const result = runConfirmJobAttempt([
      {
        type: "scheduler",
        jobId: "drts-dev-mail-outbox-drain",
        timestamp: "2099-01-01T00:00:00Z",
        statusCode: "7",
      },
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("FAILED");
    expect(result.output).toContain("status.code=7");
  });

  it("falls back to a matching Cloud Run 2xx record when no Scheduler record exists", () => {
    const result = runConfirmJobAttempt([
      {
        type: "run",
        requestUrl: "/api/internal/scheduled-tasks/mail-outbox/drain",
        timestamp: "2099-01-01T00:00:00Z",
        httpStatus: "200",
      },
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Cloud Run HTTP 200");
  });

  it("reports a matching Cloud Run non-2xx record as failure, not success", () => {
    const result = runConfirmJobAttempt([
      {
        type: "run",
        requestUrl: "/api/internal/scheduled-tasks/mail-outbox/drain",
        timestamp: "2099-01-01T00:00:00Z",
        httpStatus: "503",
      },
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Cloud Run HTTP 503");
  });
});

describe("SR-MAIL-SCHEDULER-PROVISION-20261001: documented diagnostic query finds both success and denial log lines", () => {
  const combinedLogQueryPattern = (() => {
    const runbook = readFileSync(runbookPath, "utf8");
    const match = runbook.match(
      /textPayload=~"(AUTH_GOOGLE_WORKLOAD_IDENTITY_[^"]+)"/,
    );
    const captured = match?.[1];
    if (!captured) {
      throw new Error(
        "combined AUTH_GOOGLE_WORKLOAD_IDENTITY textPayload query not found in docs/03-runbooks/dev-scheduled-tasks-20261001.md",
      );
    }
    return captured;
  })();

  it("matches both the real adapter's success and route-scope-denial log templates for the scheduler principal/route", () => {
    const regex = new RegExp(combinedLogQueryPattern);
    const successLine =
      "[AUTH_GOOGLE_WORKLOAD_IDENTITY_USED] principalId=dev-scheduler email=drts-dev-scheduler@drts-dev-devcc-20260825.iam.gserviceaccount.com route=POST /api/internal/scheduled-tasks/mail-outbox/drain";
    const denialLine =
      "[AUTH_GOOGLE_WORKLOAD_IDENTITY_ROUTE_SCOPE_DENIED] principalId=dev-scheduler email=drts-dev-scheduler@drts-dev-devcc-20260825.iam.gserviceaccount.com route=POST /api/internal/scheduled-tasks/mail-outbox/drain";
    expect(regex.test(successLine)).toBe(true);
    expect(regex.test(denialLine)).toBe(true);
  });

  it("does not match a log line for a different principal or route", () => {
    const regex = new RegExp(combinedLogQueryPattern);
    const otherPrincipalLine =
      "[AUTH_GOOGLE_WORKLOAD_IDENTITY_USED] principalId=dev-web-runtime email=drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com route=POST /api/tenant/passengers";
    expect(regex.test(otherPrincipalLine)).toBe(false);
  });
});
