import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BootstrapRequestIdentity } from "../../apps/api/src/common/auth";
import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { StepUpProofService } from "../../apps/api/src/common/auth";
import { SecurityEventsService } from "../../apps/api/src/modules/security-events/security-events.service";

function makeIdentity(
  overrides: Partial<BootstrapRequestIdentity> = {},
): BootstrapRequestIdentity {
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
    requestId: "req-identity-001",
    ...overrides,
  };
}

function makeRequest(
  path: string,
  reference?: string | null,
  body?: Record<string, unknown>,
) {
  const headers: Record<string, string> = reference
    ? { "x-drts-step-up-reference": reference }
    : {};
  const req: {
    headers: Record<string, string>;
    method: string;
    url: string;
    body?: Record<string, unknown>;
  } = {
    headers,
    method: "POST",
    url: path,
  };
  if (body !== undefined) {
    req.body = body;
  }
  return req;
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
    expect(["STEP_UP_REQUIRED", "AUTH_STEP_UP_REQUIRED"]).toContain(
      getErrorCode(thrown),
    );
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

  it("validates proof across different service instances (pods / restarts) without in-memory state", () => {
    const servicePodA = new StepUpProofService();
    const identity = makeIdentity();

    const issued = servicePodA.createProof(
      identity,
      { method: "POST", path: "/api/tenant/users" },
      "req-pod-a",
    );

    // Simulating Pod B (separate instance with clean in-memory map)
    const servicePodB = new StepUpProofService();

    expect(() =>
      servicePodB.assertRequestSatisfied(
        identity,
        makeRequest("/api/tenant/users", issued.stepUpReference),
      ),
    ).not.toThrow();

    // Verify wrong session on Pod B still fails
    expect(() =>
      servicePodB.assertRequestSatisfied(
        makeIdentity({ sessionId: "other-session" }),
        makeRequest("/api/tenant/users", issued.stepUpReference),
      ),
    ).toThrowError(ApiRequestError);

    // Verify wrong action on Pod B still fails
    expect(() =>
      servicePodB.assertRequestSatisfied(
        identity,
        makeRequest("/api/tenant/api-keys", issued.stepUpReference),
      ),
    ).toThrowError(ApiRequestError);
  });
});
