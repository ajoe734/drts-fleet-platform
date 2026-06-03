import { describe, expect, it } from "vitest";

import type { BootstrapRequestIdentity } from "../../src/common/auth";
import {
  PLATFORM_ADMIN_ASSISTANT_ALLOWED_TOOL_FAMILIES,
  buildAssistantExecutionScope,
  evaluatePlatformAdminAssistantToolRequest,
  redactAssistantToolOutput,
} from "../../src/modules/platform-admin/platform-admin-assistant.policy";
import {
  PLATFORM_ADMIN_ASSISTANT_TOOL_REGISTRY,
  serializePlatformAdminAssistantToolOutput,
} from "../../src/modules/platform-admin/platform-admin-assistant.tools";

function createIdentity(
  overrides: Partial<BootstrapRequestIdentity> = {},
): BootstrapRequestIdentity {
  return {
    authMode: "jwt_bearer",
    actorType: "platform_admin",
    actorId: "platform-admin-007",
    realm: "platform",
    tenantId: null,
    partnerId: null,
    partnerProgramId: null,
    partnerEntrySlug: null,
    roleFamilies: ["platform"],
    roles: ["platform_admin"],
    scopes: [
      "foundation:read",
      "tenant:read",
      "notifications:write",
      "audit:read",
    ],
    requestId: "req-assistant-policy-001",
    ...overrides,
  };
}

describe("platform-admin assistant tool registry", () => {
  it("exposes only allowed tool families", () => {
    expect(PLATFORM_ADMIN_ASSISTANT_TOOL_REGISTRY.length).toBeGreaterThan(0);

    for (const tool of PLATFORM_ADMIN_ASSISTANT_TOOL_REGISTRY) {
      expect(PLATFORM_ADMIN_ASSISTANT_ALLOWED_TOOL_FAMILIES).toContain(
        tool.family,
      );
    }
  });
});

describe("evaluatePlatformAdminAssistantToolRequest", () => {
  it("rejects disallowed tool families with an explicit policy reason", () => {
    const decision = evaluatePlatformAdminAssistantToolRequest(
      createIdentity(),
      {
        toolId: "http.fetch_anything",
        family: "http",
        capability: "arbitrary_http",
      },
    );

    expect(decision).toEqual({
      allowed: false,
      reason: "tool_family_not_allowed",
      policyMessage:
        "Assistant policy allows only route, data, docs, action, and audit tools.",
    });
  });

  it.each([
    "arbitrary_http",
    "arbitrary_sql",
    "arbitrary_dom",
    "secret_reveal",
  ])("rejects blocked capability %s", (capability) => {
    const decision = evaluatePlatformAdminAssistantToolRequest(
      createIdentity(),
      {
        toolId: `blocked.${capability}`,
        family: "docs",
        capability,
      },
    );

    expect(decision).toEqual({
      allowed: false,
      reason: "tool_capability_blocked",
      policyMessage:
        "Assistant policy forbids arbitrary HTTP, arbitrary SQL, arbitrary DOM, and secret reveal capabilities.",
    });
  });

  it("runs read/data/audit tools under caller identity without widening permissions", () => {
    const identity = createIdentity();

    for (const toolId of [
      "route.list_platform_admin_routes",
      "data.list_tenants",
      "audit.list_logs",
    ]) {
      const tool = PLATFORM_ADMIN_ASSISTANT_TOOL_REGISTRY.find(
        (entry) => entry.id === toolId,
      );
      expect(tool).toBeDefined();

      const decision = evaluatePlatformAdminAssistantToolRequest(identity, {
        toolId,
        family: tool!.family,
        requiredScopes: tool!.requiredScopes,
      });

      expect(decision.allowed).toBe(true);
      if (!decision.allowed) {
        throw new Error("expected allowed decision");
      }
      expect(decision.effectiveScope).toEqual(
        buildAssistantExecutionScope(identity),
      );
    }
  });

  it("rejects attempts to widen actor scope", () => {
    const decision = evaluatePlatformAdminAssistantToolRequest(
      createIdentity(),
      {
        toolId: "data.list_tenants",
        family: "data",
        requestedScope: {
          actorId: "platform-admin-999",
          scopes: ["tenant:read", "tenant:write"],
        },
      },
    );

    expect(decision).toEqual({
      allowed: false,
      reason: "scope_escalation_forbidden",
      policyMessage:
        "Assistant tools must execute under the current actor identity and cannot widen permissions.",
    });
  });

  it("rejects tools that ask for scopes the caller does not have", () => {
    const decision = evaluatePlatformAdminAssistantToolRequest(
      createIdentity(),
      {
        toolId: "action.create_notice",
        family: "action",
        requiredScopes: [
          "notifications:write",
          "notifications:read",
          "tenant:write",
        ],
      },
    );

    expect(decision).toEqual({
      allowed: false,
      reason: "scope_escalation_forbidden",
      policyMessage:
        "Assistant tools cannot request scopes the current actor does not already hold.",
    });
  });
});

describe("assistant tool output redaction", () => {
  it("produces typed transcript payloads with redacted sensitive fields", () => {
    const result = serializePlatformAdminAssistantToolOutput(
      "audit.list_logs",
      {
        actorName: "Alice Chen",
        actorEmail: "alice@example.com",
        supportPhone: "02-2345-6789",
        apiKey: "super-secret-key-value",
        nested: {
          homeAddress: "123 Main Street, Suite 4",
          authorization: "Bearer abcdefghijklmnop",
        },
      },
    );

    expect(result.outputType).toBe("audit_log_list");
    expect(result.redacted).toBe(true);
    expect(result.content).toEqual({
      actorName: "A********n",
      actorEmail: "a***@example.com",
      supportPhone: "******6789",
      apiKey: "supe...ue",
      nested: {
        homeAddress: "123 Ma...",
        authorization: "Bear...op",
      },
    });
  });

  it("redacts direct payloads before transcript persistence", () => {
    expect(
      redactAssistantToolOutput("document_excerpt", {
        secretToken: "token-1234567890",
      }),
    ).toEqual({
      outputType: "document_excerpt",
      redacted: true,
      content: {
        secretToken: "toke...90",
      },
    });
  });
});
