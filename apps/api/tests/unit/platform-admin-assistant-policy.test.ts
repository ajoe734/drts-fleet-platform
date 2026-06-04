import { describe, expect, it } from "vitest";

import type { BootstrapRequestIdentity } from "../../src/common/auth";
import {
  authorizePlatformAdminAssistantToolCall,
  listAllowedPlatformAdminAssistantToolFamilies,
  listRegisteredPlatformAdminAssistantToolsByFamily,
} from "../../src/modules/platform-admin/platform-admin-assistant.policy";
import { listPlatformAdminAssistantTools } from "../../src/modules/platform-admin/platform-admin-assistant.tools";

function createIdentity(
  overrides: Partial<BootstrapRequestIdentity> = {},
): BootstrapRequestIdentity {
  return {
    authMode: "jwt_bearer",
    actorType: "platform_admin",
    actorId: "pa-admin-123",
    realm: "platform",
    tenantId: "tenant-001",
    partnerId: null,
    partnerProgramId: null,
    partnerEntrySlug: null,
    roleFamilies: ["platform"],
    roles: ["platform_admin"],
    scopes: ["platform-admin.read", "platform-admin.write"],
    requestId: "req-policy-001",
    ...overrides,
  };
}

describe("platform-admin assistant tool registry", () => {
  it("exposes only the allowed tool families", () => {
    const families = listAllowedPlatformAdminAssistantToolFamilies();
    const tools = listPlatformAdminAssistantTools();

    expect(families).toEqual(["route", "data", "docs", "action", "audit"]);
    expect(new Set(tools.map((tool) => tool.family))).toEqual(
      new Set(families),
    );
  });

  it("groups registered tools into only allowed families", () => {
    const grouped = listRegisteredPlatformAdminAssistantToolsByFamily();

    expect(Object.keys(grouped).sort()).toEqual([
      "action",
      "audit",
      "data",
      "docs",
      "route",
    ]);
    expect(grouped.route.every((tool) => tool.family === "route")).toBe(true);
    expect(grouped.data.every((tool) => tool.family === "data")).toBe(true);
    expect(grouped.docs.every((tool) => tool.family === "docs")).toBe(true);
    expect(grouped.action.every((tool) => tool.family === "action")).toBe(true);
    expect(grouped.audit.every((tool) => tool.family === "audit")).toBe(true);
  });

  it("keeps every registered tool caller-scoped with the expected family prefix, access mode, and output type", () => {
    const tools = listPlatformAdminAssistantTools();

    expect(tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "route.list_navigation_nodes" }),
        expect.objectContaining({ name: "data.list_tenant_summaries" }),
        expect.objectContaining({ name: "docs.search_platform_admin_policy" }),
        expect.objectContaining({ name: "action.create_platform_notice" }),
        expect.objectContaining({ name: "audit.list_actor_audit_entries" }),
      ]),
    );

    for (const tool of tools) {
      expect(tool.callerScoped).toBe(true);

      switch (tool.family) {
        case "route":
          expect(tool.name.startsWith("route.")).toBe(true);
          expect(tool.accessMode).toBe("read");
          expect(tool.outputKind).toBe("route_snapshot");
          break;
        case "data":
          expect(tool.name.startsWith("data.")).toBe(true);
          expect(tool.accessMode).toBe("read");
          expect(tool.outputKind).toBe("record_set");
          break;
        case "docs":
          expect(tool.name.startsWith("docs.")).toBe(true);
          expect(tool.accessMode).toBe("read");
          expect(tool.outputKind).toBe("document_excerpt");
          break;
        case "action":
          expect(tool.name.startsWith("action.")).toBe(true);
          expect(tool.accessMode).toBe("write");
          expect(tool.outputKind).toBe("action_receipt");
          break;
        case "audit":
          expect(tool.name.startsWith("audit.")).toBe(true);
          expect(tool.accessMode).toBe("audit");
          expect(tool.outputKind).toBe("audit_entry_set");
          break;
      }
    }
  });
});

describe("authorizePlatformAdminAssistantToolCall", () => {
  it("allows registered read/data/audit tools only under the current caller identity", () => {
    const identity = createIdentity();

    const decision = authorizePlatformAdminAssistantToolCall(
      {
        toolName: "data.list_tenant_summaries",
        requestedActorId: "pa-admin-123",
        requestedTenantId: "tenant-001",
      },
      identity,
    );

    expect(decision.allowed).toBe(true);
    if (!decision.allowed) {
      throw new Error("expected allowed decision");
    }
    expect(decision.executionIdentity.actorId).toBe("pa-admin-123");
    expect(decision.executionIdentity.tenantId).toBe("tenant-001");
    expect(decision.executionIdentity.roles).toEqual(["platform_admin"]);
  });

  it("rejects unknown tools with an explicit policy reason", () => {
    const decision = authorizePlatformAdminAssistantToolCall(
      {
        toolName: "http.fetch_anything",
      },
      createIdentity(),
    );

    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: "unknown_tool",
    });
    if (decision.allowed) {
      throw new Error("expected rejected decision");
    }
    expect(decision.reason).toContain(
      "Allowed families: route, data, docs, action, audit",
    );
  });

  it("rejects arbitrary HTTP, SQL, DOM, and secret reveal requests with explicit reasons", () => {
    const identity = createIdentity();

    const httpDecision = authorizePlatformAdminAssistantToolCall(
      {
        toolName: "docs.search_platform_admin_policy",
        executionTarget: "arbitrary_http",
      },
      identity,
    );
    const sqlDecision = authorizePlatformAdminAssistantToolCall(
      {
        toolName: "data.list_tenant_summaries",
        rawSql: "select * from platform_admin_users",
      },
      identity,
    );
    const domDecision = authorizePlatformAdminAssistantToolCall(
      {
        toolName: "route.get_route_details",
        domSelector: "#root > div",
      },
      identity,
    );
    const secretDecision = authorizePlatformAdminAssistantToolCall(
      {
        toolName: "audit.list_actor_audit_entries",
        revealSecrets: true,
      },
      identity,
    );

    expect(httpDecision).toMatchObject({
      allowed: false,
      reasonCode: "disallowed_execution_target",
    });
    expect(sqlDecision).toMatchObject({
      allowed: false,
      reasonCode: "disallowed_execution_target",
    });
    expect(domDecision).toMatchObject({
      allowed: false,
      reasonCode: "disallowed_execution_target",
    });
    expect(secretDecision).toMatchObject({
      allowed: false,
      reasonCode: "disallowed_execution_target",
    });

    if (
      httpDecision.allowed ||
      sqlDecision.allowed ||
      domDecision.allowed ||
      secretDecision.allowed
    ) {
      throw new Error("expected all decisions to be rejected");
    }

    expect(httpDecision.reason).toContain(
      "Arbitrary HTTP access is not allowed",
    );
    expect(sqlDecision.reason).toContain(
      "Arbitrary SQL execution is not allowed",
    );
    expect(domDecision.reason).toContain(
      "DOM inspection/manipulation is not allowed",
    );
    expect(secretDecision.reason).toContain("Secret reveal is not allowed");
  });

  it("rejects attempts to widen actor or tenant scope", () => {
    const identity = createIdentity();

    const actorDecision = authorizePlatformAdminAssistantToolCall(
      {
        toolName: "audit.get_action_receipt_audit_entry",
        requestedActorId: "pa-admin-999",
      },
      identity,
    );
    const tenantDecision = authorizePlatformAdminAssistantToolCall(
      {
        toolName: "data.get_tenant_governance_summary",
        requestedTenantId: "tenant-override",
      },
      identity,
    );

    expect(actorDecision).toMatchObject({
      allowed: false,
      reasonCode: "permission_escalation",
    });
    expect(tenantDecision).toMatchObject({
      allowed: false,
      reasonCode: "permission_escalation",
    });
  });

  it("rejects execution without a caller identity", () => {
    const decision = authorizePlatformAdminAssistantToolCall(
      {
        toolName: "route.list_navigation_nodes",
      },
      null,
    );

    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: "missing_identity",
    });
  });
});
