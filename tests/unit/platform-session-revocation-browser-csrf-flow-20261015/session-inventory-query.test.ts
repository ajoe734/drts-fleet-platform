import { expect, it } from "vitest";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth/auth.types";
import { IdentityController } from "../../../apps/api/src/modules/identity/identity.controller";
import { IdentityRepository } from "../../../apps/api/src/modules/identity/identity.repository";

const identity: BootstrapRequestIdentity = {
  authMode: "jwt_bearer",
  actorType: "platform_admin",
  actorId: "inventory-admin",
  principalId: "inventory-admin",
  realm: "platform",
  tenantId: null,
  roleFamilies: ["platform"],
  roles: [],
  scopes: ["identity:sessions:read"],
  requestId: "inventory-query-reproduction",
};

it.each([
  { label: "HTTP true", wireValue: "true", expectedRevoked: true },
  { label: "HTTP false", wireValue: "false", expectedRevoked: false },
  { label: "omitted", wireValue: undefined, expectedRevoked: false },
  { label: "direct boolean true", wireValue: true, expectedRevoked: true },
  { label: "direct boolean false", wireValue: false, expectedRevoked: false },
  { label: "empty string", wireValue: "", expectedRevoked: false },
  { label: "uppercase true", wireValue: "TRUE", expectedRevoked: false },
  { label: "padded true", wireValue: " true ", expectedRevoked: false },
  { label: "invalid string", wireValue: "yes", expectedRevoked: false },
  { label: "number", wireValue: 1, expectedRevoked: false },
  { label: "null", wireValue: null, expectedRevoked: false },
  {
    label: "repeated true",
    wireValue: ["true", "true"],
    expectedRevoked: false,
  },
  {
    label: "mixed repeated",
    wireValue: ["false", "true"],
    expectedRevoked: false,
  },
  {
    label: "nested query",
    wireValue: { value: "true" },
    expectedRevoked: false,
  },
])(
  "canonical inventory readback with $label",
  async ({ wireValue, expectedRevoked }) => {
    const repository = new IdentityRepository();
    const now = new Date().toISOString();
    for (const sessionId of ["selected-session", "unselected-session"]) {
      await repository.createSession({
        sessionId,
        sourceRef: `test:${sessionId}`,
        principalId: "inventory-admin",
        actorId: "inventory-admin",
        membershipId: null,
        realm: "platform",
        status: "active",
        authTime: now,
        authMethods: ["mfa"],
        tokenVersion: 1,
        idleExpiresAt: null,
        absoluteExpiresAt: "2099-01-01T00:00:00Z",
        revokedAt: null,
        revokedByPrincipalId: null,
        revokeReason: null,
        deviceSummary: {},
        riskSummary: {},
        createdAt: now,
        updatedAt: now,
      });
    }
    await repository.revokeSession("selected-session", "controlled-test");

    // Preserve the HTTP string exactly. The shared contract describes normalized
    // data, but Nest @Query() has no runtime conversion for this interface.
    const query = {
      actorId: "inventory-admin",
      includeRevoked: wireValue,
    };
    const response = await new IdentityController(repository).listAdminSessions(
      identity,
      query,
      identity.requestId ?? undefined,
    );

    expect(
      response.data.find((row) => row.sessionId === "unselected-session")
        ?.status,
    ).toBe("active");
    const selected = response.data.find(
      (row) => row.sessionId === "selected-session",
    );
    if (expectedRevoked) {
      expect(selected?.status).toBe("revoked");
    } else {
      expect(selected).toBeUndefined();
    }
  },
);
