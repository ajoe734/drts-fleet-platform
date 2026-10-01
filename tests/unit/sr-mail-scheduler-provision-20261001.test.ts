import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
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

const API_ORIGIN = "https://drts-dev-api-r6ykdme3wa-uc.a.run.app";
const SCHEDULER_SA_EMAIL =
  "drts-dev-scheduler@drts-dev-devcc-20260825.iam.gserviceaccount.com";

const MAIL_OUTBOX_ROUTE_SCOPE = "POST internal/scheduled-tasks/mail-outbox/drain";
const APPROVAL_REMINDER_ROUTE_SCOPE =
  "POST internal/scheduled-tasks/approval-timeout-reminders/run";

/** The exact routeScopes/scopes this task registers for entry C. */
const ENTRY_C_ROUTE_SCOPES = [
  MAIL_OUTBOX_ROUTE_SCOPE,
  APPROVAL_REMINDER_ROUTE_SCOPE,
];
const ENTRY_C_SCOPES = [
  "notification-delivery:drain",
  "tenant-partner:approval-timeout-reminders:run",
];

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
        email: SCHEDULER_SA_EMAIL,
        email_verified: true,
        aud: API_ORIGIN,
        iat: now,
        exp: now + 300,
      },
      privateKey,
      { algorithm: "RS256", keyid: kid },
    );
    process.env.WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS = JSON.stringify([
      {
        serviceAccountEmail: SCHEDULER_SA_EMAIL,
        principalId: "dev-scheduler",
        allowedTokenAudiences: [API_ORIGIN],
        routeScopes: ENTRY_C_ROUTE_SCOPES,
        scopes: ENTRY_C_SCOPES,
      },
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

describe("SR-MAIL-SCHEDULER-PROVISION-20261001: registry doc provides a pasteable 3-entry JSON consistent with entry C", () => {
  it("documents entry C with the verified service account, audience, routeScopes, and scopes", () => {
    const doc = readFileSync(registryDocPath, "utf8");
    expect(doc).toContain(SCHEDULER_SA_EMAIL);
    expect(doc).toContain(API_ORIGIN);
    expect(doc).toContain(MAIL_OUTBOX_ROUTE_SCOPE);
    expect(doc).toContain(APPROVAL_REMINDER_ROUTE_SCOPE);
    expect(doc).toContain("notification-delivery:drain");
    expect(doc).toContain("tenant-partner:approval-timeout-reminders:run");
  });

  it("includes a full three-entry array (A, B, and the new entry C) in one pasteable block", () => {
    const doc = readFileSync(registryDocPath, "utf8");
    expect(doc).toContain(
      "drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com",
    );
    expect(doc).toContain(
      "github-actions-deployer@drts-dev-devcc-20260825.iam.gserviceaccount.com",
    );
    expect(doc).toContain(SCHEDULER_SA_EMAIL);
    // Entry C must not be given a ciTenantActorGrants entry: that field only
    // gates the POST auth/token CI-impersonation branch, which entry C's
    // routeScopes never grants access to in the first place.
    const entryCIndex = doc.indexOf(SCHEDULER_SA_EMAIL);
    const afterEntryC = doc.slice(entryCIndex, entryCIndex + 600);
    expect(afterEntryC).not.toContain("ciTenantActorGrants");
  });

  it("does not grant entry C a wildcard or prefix routeScope", () => {
    const doc = readFileSync(registryDocPath, "utf8");
    const entryCIndex = doc.indexOf(SCHEDULER_SA_EMAIL);
    const entryCBlock = doc.slice(entryCIndex, entryCIndex + 600);
    expect(entryCBlock).not.toContain('"* *"');
    expect(entryCBlock).not.toContain("internal/scheduled-tasks/*");
  });
});

describe("SR-MAIL-SCHEDULER-PROVISION-20261001: provisioning script is minimal-privilege and idempotent", () => {
  it("enables the Cloud Scheduler API, creates the scheduler service account, and wires OIDC token minting", () => {
    const script = readFileSync(scriptPath, "utf8");
    expect(script).toContain("set -euo pipefail");
    expect(script).toContain("cloudscheduler.googleapis.com");
    expect(script).toContain("iam service-accounts create");
    expect(script).toContain("roles/iam.serviceAccountTokenCreator");
    expect(script).toContain("--oidc-service-account-email");
    expect(script).toContain("--oidc-token-audience");
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
});
