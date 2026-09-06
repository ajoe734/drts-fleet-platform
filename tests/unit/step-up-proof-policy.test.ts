import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IdentityContext } from "@drts/contracts";
import type { BootstrapRequestIdentity } from "../../apps/api/src/common/auth";
import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { StepUpProofService } from "../../apps/api/src/common/auth";
import { SecurityEventsService } from "../../apps/api/src/modules/security-events/security-events.service";

type StepUpTestIdentity = BootstrapRequestIdentity & IdentityContext;

function makeIdentity(
  overrides: Partial<BootstrapRequestIdentity> = {},
): StepUpTestIdentity {
  return {
    authMode: "jwt_bearer",
    actorType: "tenant_admin",
    actorId: "tenant-admin-001",
    principalId: "tenant-admin-001",
    membershipId: "membership-001",
    subject: "tenant-admin-001",
    realm: "tenant",
    tenantId: "tenant-demo-001",
    sessionId: "session-001",
    tokenId: "token-001",
    tokenVersion: 1,
    authTime: "2026-08-02T12:00:00.000Z",
    amr: ["tenant_bootstrap_fixture"],
    acr: "aal1",
    roleFamilies: ["tenant"],
    roles: ["tenant_admin"],
    scopes: ["tenant:write", "identity:read"],
    supportedExecutionModes: ["supervisor_managed_execution"],
    requestId: "req-identity-001",
    ...overrides,
  } as StepUpTestIdentity;
}

function makeRequest(
  path: string,
  reference?: string | null,
  body?: Record<string, unknown>,
) {
  return {
    headers: reference ? { "x-drts-step-up-reference": reference } : {},
    method: "POST",
    url: path,
    body,
  };
}

function getErrorCode(error: unknown) {
  return (
    (
      error as {
        getResponse?: () => {
          error?: {
            code?: string;
          };
        };
      }
    ).getResponse?.().error?.code ?? null
  );
}

describe("step-up proof policy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("ignores client MFA booleans and still requires a server-owned proof", () => {
    const service = new StepUpProofService();

    let thrown: unknown;
    try {
      service.assertRequestSatisfied(
        makeIdentity(),
        makeRequest("/api/tenant/users", null, { mfaVerified: true }),
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ApiRequestError);
    expect(getErrorCode(thrown)).toBe("STEP_UP_REQUIRED");
  });

  it("rejects stale, wrong-session, and wrong-action proofs, but accepts a fresh matching proof", async () => {
    const securityEventsService = new SecurityEventsService();
    const service = new StepUpProofService(securityEventsService);
    const identity = makeIdentity();

    const issued = service.createProof(
      identity,
      { method: "POST", path: "/api/tenant/users" },
      "req-step-up-issue",
    );

    expect(issued).toMatchObject({
      required: true,
      actionId: "tenant:users:create",
      stepUpReference: expect.any(String),
    });

    expect(() =>
      service.assertRequestSatisfied(
        identity,
        makeRequest("/api/tenant/users", issued.stepUpReference),
      ),
    ).not.toThrow();

    expect(() =>
      service.assertRequestSatisfied(
        identity,
        makeRequest("/api/tenant/api-keys", issued.stepUpReference),
      ),
    ).toThrowError(ApiRequestError);

    expect(() =>
      service.assertRequestSatisfied(
        makeIdentity({
          sessionId: "session-002",
          requestId: "req-other-session",
        }),
        makeRequest("/api/tenant/users", issued.stepUpReference),
      ),
    ).toThrowError(ApiRequestError);

    vi.advanceTimersByTime(15 * 60_000 + 1);

    expect(() =>
      service.assertRequestSatisfied(
        identity,
        makeRequest("/api/tenant/users", issued.stepUpReference),
      ),
    ).toThrowError(ApiRequestError);

    const events = await securityEventsService.listEvents(identity, {
      eventFamily: "policy",
      limit: 10,
    });
    expect(events.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        "step_up.proof_issued",
        "step_up.satisfied",
        "step_up.denied",
      ]),
    );
  });

  it("enforces fresh step-up proof for ops break-glass request/approve/activate, rejecting forged, missing, and stale references", () => {
    const service = new StepUpProofService();
    const opsIdentity = makeIdentity({
      actorType: "ops_user",
      actorId: "ops-001",
      principalId: "ops-001",
      realm: "ops",
      tenantId: null,
      roleFamilies: ["ops"],
      roles: ["ops_user"],
      scopes: ["identity:break-glass:request"],
    });

    // Missing reference is denied.
    expect(() =>
      service.assertRequestSatisfied(
        opsIdentity,
        makeRequest("/api/platform-admin/break-glass/requests", null),
      ),
    ).toThrowError(ApiRequestError);

    // A forged/unknown reference is denied.
    expect(() =>
      service.assertRequestSatisfied(
        opsIdentity,
        makeRequest(
          "/api/platform-admin/break-glass/requests",
          "forged-vault-reference",
        ),
      ),
    ).toThrowError(ApiRequestError);

    const issued = service.createProof(
      opsIdentity,
      { method: "POST", path: "/api/platform-admin/break-glass/requests" },
      "req-ops-break-glass-request",
    );
    expect(issued).toMatchObject({
      required: true,
      actionId: "platform:break-glass:request",
      stepUpReference: expect.any(String),
    });

    const activateIssued = service.createProof(
      opsIdentity,
      {
        method: "POST",
        path: "/api/platform-admin/break-glass/requests/req-1/activate",
      },
      "req-ops-break-glass-activate",
    );
    expect(activateIssued).toMatchObject({
      actionId: "platform:break-glass:activate",
      stepUpReference: expect.any(String),
    });

    // Fresh, correctly-scoped proofs are accepted for both request and
    // activate actions.
    expect(() =>
      service.assertRequestSatisfied(
        opsIdentity,
        makeRequest(
          "/api/platform-admin/break-glass/requests",
          issued.stepUpReference,
        ),
      ),
    ).not.toThrow();
    expect(() =>
      service.assertRequestSatisfied(
        opsIdentity,
        makeRequest(
          "/api/platform-admin/break-glass/requests/req-1/activate",
          activateIssued.stepUpReference,
        ),
      ),
    ).not.toThrow();

    // A stale proof (past the freshness window) is denied for both actions.
    vi.advanceTimersByTime(10 * 60_000 + 1);
    expect(() =>
      service.assertRequestSatisfied(
        opsIdentity,
        makeRequest(
          "/api/platform-admin/break-glass/requests",
          issued.stepUpReference,
        ),
      ),
    ).toThrowError(ApiRequestError);
    expect(() =>
      service.assertRequestSatisfied(
        opsIdentity,
        makeRequest(
          "/api/platform-admin/break-glass/requests/req-1/activate",
          activateIssued.stepUpReference,
        ),
      ),
    ).toThrowError(ApiRequestError);
  });

  it("returns MFA_REQUIRED when the current session lacks trusted MFA evidence", () => {
    const service = new StepUpProofService();

    let thrown: unknown;
    try {
      service.createProof(
        makeIdentity({
          authTime: null,
          amr: ["password"],
          acr: "aal1",
        }),
        { method: "POST", path: "/api/tenant/users" },
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ApiRequestError);
    expect(getErrorCode(thrown)).toBe("MFA_REQUIRED");
  });
});
