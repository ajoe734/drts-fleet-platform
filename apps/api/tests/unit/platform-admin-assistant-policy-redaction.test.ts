import { describe, expect, it } from "vitest";

import {
  preparePlatformAdminAssistantToolResultForPersistence,
  type PlatformAdminAssistantAuditToolResult,
  type PlatformAdminAssistantDataToolResult,
} from "../../src/modules/platform-admin/platform-admin-assistant.policy";

describe("preparePlatformAdminAssistantToolResultForPersistence", () => {
  it("preserves typed data results while redacting secret-bearing fields before persistence", () => {
    const result: PlatformAdminAssistantDataToolResult = {
      toolName: "data.list_tenant_summaries",
      family: "data",
      outputType: "record_set",
      items: [
        {
          recordId: "tenant-001",
          title: "Tenant Summary",
          summary: "Primary admin admin@example.com",
          fields: {
            adminEmail: "admin@example.com",
            contactPhone: "+886 912 345 678",
            apiKey: "sk_live_super_secret_token",
            nested: {
              authorization: "Bearer tok_live_abcdefghi123456789",
            },
          },
        },
      ],
    };

    const persisted = preparePlatformAdminAssistantToolResultForPersistence(
      result,
      "pa-admin-123",
      "2026-06-02T16:00:00.000Z",
    );

    expect(persisted.actorId).toBe("pa-admin-123");
    expect(persisted.persistedAt).toBe("2026-06-02T16:00:00.000Z");
    expect(persisted.result.family).toBe("data");
    expect(persisted.outputType).toBe("record_set");
    expect(persisted.result.outputType).toBe("record_set");
    expect(persisted.redactions).toEqual(
      expect.arrayContaining([
        "data.list_tenant_summaries.items[0].summary",
        "data.list_tenant_summaries.items[0].fields.adminEmail",
        "data.list_tenant_summaries.items[0].fields.contactPhone",
        "data.list_tenant_summaries.items[0].fields.apiKey",
        "data.list_tenant_summaries.items[0].fields.nested.authorization",
      ]),
    );

    if (persisted.result.family !== "data") {
      throw new Error("expected data result");
    }

    expect(persisted.result.items[0]?.summary).toBe(
      "Primary admin a***@example.com",
    );
    expect(persisted.result.items[0]?.fields.adminEmail).toBe(
      "a***@example.com",
    );
    expect(persisted.result.items[0]?.fields.contactPhone).toBe("********5678");
    expect(persisted.result.items[0]?.fields.apiKey).toBe("[REDACTED]");
    expect(persisted.result.items[0]?.fields.nested).toEqual({
      authorization: "[REDACTED]",
    });
  });

  it("redacts audit metadata while preserving the audit result envelope", () => {
    const result: PlatformAdminAssistantAuditToolResult = {
      toolName: "audit.list_actor_audit_entries",
      family: "audit",
      outputType: "audit_entry_set",
      items: [
        {
          auditId: "audit-001",
          action: "rotate_secret",
          actorId: "platform-admin-jwt-001",
          occurredAt: "2026-06-02T15:59:00.000Z",
          summary: "Rotated webhook secret for owner@example.com",
          metadata: {
            secretPreview: "sk_live_preview_12345678",
            cookie: "session_cookie_value",
          },
        },
      ],
    };

    const persisted = preparePlatformAdminAssistantToolResultForPersistence(
      result,
      "pa-admin-123",
    );

    expect(persisted.result.family).toBe("audit");
    expect(persisted.outputType).toBe("audit_entry_set");
    expect(persisted.redactions).toEqual(
      expect.arrayContaining([
        "audit.list_actor_audit_entries.items[0].summary",
        "audit.list_actor_audit_entries.items[0].metadata.secretPreview",
        "audit.list_actor_audit_entries.items[0].metadata.cookie",
      ]),
    );

    if (persisted.result.family !== "audit") {
      throw new Error("expected audit result");
    }

    expect(persisted.result.items[0]?.summary).toBe(
      "Rotated webhook secret for o***@example.com",
    );
    expect(persisted.result.items[0]?.metadata).toEqual({
      secretPreview: "[REDACTED]",
      cookie: "[REDACTED]",
    });
  });

  it("rejects persistence for unregistered tool outputs", () => {
    expect(() =>
      preparePlatformAdminAssistantToolResultForPersistence(
        {
          toolName: "http.fetch_anything",
          family: "docs",
          outputType: "document_excerpt",
          items: [],
        },
        "pa-admin-123",
      ),
    ).toThrow(/unregistered tool/);
  });

  it("rejects persistence when a tool output family or output type does not match the registry", () => {
    expect(() =>
      preparePlatformAdminAssistantToolResultForPersistence(
        {
          toolName: "docs.search_platform_admin_policy",
          family: "data",
          outputType: "record_set",
          items: [],
        },
        "pa-admin-123",
      ),
    ).toThrow(/registered as family "docs" but attempted to persist "data"/);

    expect(() =>
      preparePlatformAdminAssistantToolResultForPersistence(
        {
          toolName: "docs.search_platform_admin_policy",
          family: "docs",
          outputType: "record_set",
          items: [],
        },
        "pa-admin-123",
      ),
    ).toThrow(/must persist output type "document_excerpt"/);
  });
});
