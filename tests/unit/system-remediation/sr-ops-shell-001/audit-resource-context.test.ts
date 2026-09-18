import { describe, expect, it } from "vitest";
import type { AuditLogRecord } from "@drts/contracts";
import {
  parseAuditResourceContext,
  filterAuditRecordsByContext,
  type ReadonlySearchParamsLike,
} from "../../../../apps/platform-admin-web/lib/audit-resource-context";
import {
  resolvePlatformAdminBase,
  resolvePlatformAdminHref,
  platformAdminAuditLink,
  platformAdminAdapterRegistryLink,
  buildPlatformAdminAuditRoute,
} from "../../../../apps/ops-console-web/lib/ops-cross-app-links";

function mockSearchParams(
  params: Record<string, string | string[] | undefined>,
): ReadonlySearchParamsLike {
  return {
    get(name: string): string | null {
      const val = params[name];
      if (val === undefined) return null;
      if (Array.isArray(val)) return val[0] ?? null;
      return val;
    },
    getAll(name: string): string[] {
      const val = params[name];
      if (val === undefined) return [];
      if (Array.isArray(val)) return val;
      return [val];
    },
  };
}

const mockRecords: AuditLogRecord[] = [
  {
    auditId: "aud-100",
    actorId: "usr-ops-1",
    actorType: "ops_user",
    tenantId: "t-1",
    moduleName: "dispatch",
    actionName: "order.assign",
    resourceType: "order",
    resourceId: "ord-tpe-001",
    requestId: "req-1",
    createdAt: "2026-09-08T10:00:00Z",
  },
  {
    auditId: "aud-101",
    actorId: "usr-ops-1",
    actorType: "ops_user",
    tenantId: "t-1",
    moduleName: "dispatch",
    actionName: "order.cancel",
    resourceType: "order",
    resourceId: "ord-tpe-002",
    requestId: "req-2",
    createdAt: "2026-09-08T10:05:00Z",
  },
  {
    auditId: "aud-200",
    actorId: "usr-system",
    actorType: "system",
    tenantId: "t-1",
    moduleName: "forwarder",
    actionName: "forwarder.mirror",
    resourceType: "forwarded_order",
    resourceId: "fwd-tpe-880",
    requestId: "req-3",
    createdAt: "2026-09-08T10:10:00Z",
  },
  {
    auditId: "aud-300",
    actorId: "usr-admin",
    actorType: "platform_admin",
    tenantId: null,
    moduleName: "billing",
    actionName: "billing.reconcile",
    resourceType: "reconciliation",
    resourceId: "rec-999",
    requestId: "req-4",
    createdAt: "2026-09-08T10:15:00Z",
  },
];

describe("SR-OPS-SHELL-001: Receiver Audit Resource Context", () => {
  describe("parseAuditResourceContext", () => {
    it("returns kind 'none' when search params are empty or null", () => {
      expect(parseAuditResourceContext(null)).toEqual({ kind: "none" });
      expect(parseAuditResourceContext(mockSearchParams({}))).toEqual({
        kind: "none",
      });
    });

    it("parses valid auditId query parameter", () => {
      const evalResult = parseAuditResourceContext(
        mockSearchParams({ auditId: "aud-100" }),
      );
      expect(evalResult).toEqual({
        kind: "valid",
        filter: { auditId: "aud-100" },
        summary: "auditId: aud-100",
      });
    });

    it("parses valid complete resourceType and resourceId pair", () => {
      const evalResult = parseAuditResourceContext(
        mockSearchParams({
          resourceType: "order",
          resourceId: "ord-tpe-001",
        }),
      );
      expect(evalResult).toEqual({
        kind: "valid",
        filter: {
          resourceType: "order",
          resourceId: "ord-tpe-001",
        },
        summary: "resource: order#ord-tpe-001",
      });
    });

    it("parses valid intersection of auditId and resource pair", () => {
      const evalResult = parseAuditResourceContext(
        mockSearchParams({
          auditId: "aud-100",
          resourceType: "order",
          resourceId: "ord-tpe-001",
        }),
      );
      expect(evalResult).toEqual({
        kind: "valid",
        filter: {
          auditId: "aud-100",
          resourceType: "order",
          resourceId: "ord-tpe-001",
        },
        summary: "auditId: aud-100 ∩ resource: order#ord-tpe-001",
      });
    });

    it("flags incomplete context when resourceType is present without resourceId", () => {
      const evalResult = parseAuditResourceContext(
        mockSearchParams({ resourceType: "order" }),
      );
      expect(evalResult.kind).toBe("invalid");
      if (evalResult.kind === "invalid") {
        expect(evalResult.error).toContain("Incomplete resource context");
      }
    });

    it("flags incomplete context when resourceId is present without resourceType", () => {
      const evalResult = parseAuditResourceContext(
        mockSearchParams({ resourceId: "ord-123" }),
      );
      expect(evalResult.kind).toBe("invalid");
      if (evalResult.kind === "invalid") {
        expect(evalResult.error).toContain("Incomplete resource context");
      }
    });

    it("flags duplicate parameter values as invalid conflicting state", () => {
      const evalResult = parseAuditResourceContext(
        mockSearchParams({ auditId: ["aud-1", "aud-2"] }),
      );
      expect(evalResult.kind).toBe("invalid");
      if (evalResult.kind === "invalid") {
        expect(evalResult.error).toContain("Conflicting duplicate 'auditId'");
      }
    });

    it("flags empty string auditId parameter as malformed", () => {
      const evalResult = parseAuditResourceContext(
        mockSearchParams({ auditId: "   " }),
      );
      expect(evalResult.kind).toBe("invalid");
      if (evalResult.kind === "invalid") {
        expect(evalResult.error).toContain("Malformed URL query");
      }
    });
  });

  describe("filterAuditRecordsByContext", () => {
    it("preserves general audit records when evaluation is kind 'none'", () => {
      const result = filterAuditRecordsByContext(mockRecords, { kind: "none" });
      expect(result.rows).toHaveLength(mockRecords.length);
      expect(result.isContextActive).toBe(false);
      expect(result.isInvalid).toBe(false);
      expect(result.isNoMatch).toBe(false);
    });

    it("filters records by auditId exact equality", () => {
      const evaluation = parseAuditResourceContext(
        mockSearchParams({ auditId: "aud-101" }),
      );
      const result = filterAuditRecordsByContext(mockRecords, evaluation);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.auditId).toBe("aud-101");
      expect(result.isContextActive).toBe(true);
      expect(result.isNoMatch).toBe(false);
    });

    it("filters records by complete resourceType and resourceId pair", () => {
      const evaluation = parseAuditResourceContext(
        mockSearchParams({
          resourceType: "forwarded_order",
          resourceId: "fwd-tpe-880",
        }),
      );
      const result = filterAuditRecordsByContext(mockRecords, evaluation);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.resourceType).toBe("forwarded_order");
      expect(result.rows[0]?.resourceId).toBe("fwd-tpe-880");
    });

    it("intersects exact equality when both auditId and resource pair are provided", () => {
      const evaluation = parseAuditResourceContext(
        mockSearchParams({
          auditId: "aud-100",
          resourceType: "order",
          resourceId: "ord-tpe-001",
        }),
      );
      const result = filterAuditRecordsByContext(mockRecords, evaluation);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.auditId).toBe("aud-100");
    });

    it("returns contextual empty state (never silently unfiltered) when no match exists", () => {
      const evaluation = parseAuditResourceContext(
        mockSearchParams({
          resourceType: "order",
          resourceId: "non-existent-order",
        }),
      );
      const result = filterAuditRecordsByContext(mockRecords, evaluation);
      expect(result.rows).toHaveLength(0);
      expect(result.isContextActive).toBe(true);
      expect(result.isNoMatch).toBe(true);
      expect(result.isInvalid).toBe(false);
    });

    it("returns invalid error state when context evaluation is invalid", () => {
      const evaluation = parseAuditResourceContext(
        mockSearchParams({ resourceType: "order" }),
      );
      const result = filterAuditRecordsByContext(mockRecords, evaluation);
      expect(result.rows).toHaveLength(0);
      expect(result.isInvalid).toBe(true);
      expect(result.errorMessage).toBeDefined();
    });

    it("composes module filter with resource context", () => {
      const evaluation = parseAuditResourceContext(
        mockSearchParams({
          resourceType: "order",
          resourceId: "ord-tpe-001",
        }),
      );
      // Matching module
      const matched = filterAuditRecordsByContext(
        mockRecords,
        evaluation,
        "dispatch",
      );
      expect(matched.rows).toHaveLength(1);

      // Non-matching module within the resource match
      const unMatched = filterAuditRecordsByContext(
        mockRecords,
        evaluation,
        "billing",
      );
      expect(unMatched.rows).toHaveLength(0);
    });
  });

  describe("ops-cross-app-links helpers", () => {
    it("resolves default fallback prefix /_apps/platform-admin when env unset", () => {
      const prev = process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL;
      delete process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL;
      delete process.env.DRTS_PLATFORM_ADMIN_URL;
      try {
        expect(resolvePlatformAdminBase()).toBe("/_apps/platform-admin");
        expect(resolvePlatformAdminHref("/audit")).toBe(
          "/_apps/platform-admin/audit",
        );
      } finally {
        if (prev) process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL = prev;
      }
    });

    it("resolves configured NEXT_PUBLIC_PLATFORM_ADMIN_URL origin", () => {
      const prev = process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL;
      process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL = "http://localhost:3002";
      try {
        expect(resolvePlatformAdminBase()).toBe("http://localhost:3002");
        expect(resolvePlatformAdminHref("/adapter-registry")).toBe(
          "http://localhost:3002/adapter-registry",
        );
      } finally {
        if (prev) process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL = prev;
      }
    });

    it("builds platform admin audit link with new_tab openMode", () => {
      const link = platformAdminAuditLink({
        resourceType: "order",
        resourceId: "ord-99",
      });
      expect(link.targetApp).toBe("platform-admin");
      expect(link.openMode).toBe("new_tab");
      expect(link.route).toBe("/audit?resourceType=order&resourceId=ord-99");
    });

    it("builds platform admin adapter registry link with new_tab openMode", () => {
      const link = platformAdminAdapterRegistryLink();
      expect(link.targetApp).toBe("platform-admin");
      expect(link.openMode).toBe("new_tab");
      expect(link.route).toBe("/adapter-registry");
    });

    it("builds audit route with encoded query parameters", () => {
      const route = buildPlatformAdminAuditRoute({
        resourceType: "forwarded_order",
        resourceId: "fwd/ord 1",
      });
      expect(route).toBe(
        "/audit?resourceType=forwarded_order&resourceId=fwd%2Ford+1",
      );
    });
  });
});
