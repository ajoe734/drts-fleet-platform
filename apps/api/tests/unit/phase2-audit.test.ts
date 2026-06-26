import { describe, expect, it } from "vitest";

import {
  PHASE2_AUDIT_EVENT_CATALOG,
  type AuditLogRecord,
  type Phase2AuditContext,
} from "@drts/contracts";

import {
  emitPhase2AuditRecord,
  emitPhase2AuditedAction,
  sanitizePhase2AuditSummary,
} from "../../src/common/phase2-audit";

function createAuditSink() {
  const writes: Array<
    Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId"> & {
      requestId?: string;
    }
  > = [];

  return {
    writes,
    sink: {
      recordAuditLog(
        input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId"> & {
          requestId?: string;
        },
      ): AuditLogRecord {
        writes.push(input);

        return {
          auditId: `audit-${writes.length}`,
          createdAt: `2026-06-26T00:00:0${writes.length}.000Z`,
          requestId: input.requestId ?? `req-${writes.length}`,
          ...input,
        };
      },
    },
  };
}

function createAuditContext(
  overrides: Partial<Phase2AuditContext> = {},
): Phase2AuditContext {
  return {
    actorId: "ops-user-001",
    actorType: "ops_user",
    tenantId: "tenant-demo-001",
    moduleName: "sandbox-governance",
    eventName:
      PHASE2_AUDIT_EVENT_CATALOG.sandbox
        .providerCapabilityRequirementConfigured,
    resourceType: "provider_capability_requirement",
    resourceId: "program-1:av_dispatch",
    requestId: "req-audit-001",
    summary: {
      sandboxProgramId: "program-1",
      capability: "av_dispatch",
      required: true,
    },
    ...overrides,
  };
}

describe("phase2-audit helpers", () => {
  it("redacts sensitive fields from nested audit summaries", () => {
    const sanitized = sanitizePhase2AuditSummary({
      sandboxProgramId: "program-1",
      providerPayload: {
        shouldBeRemoved: true,
      },
      nested: {
        signedUrl: "https://example.com/signed",
        passengerName: "Sensitive Rider",
        capability: "av_dispatch",
      },
      manifestItems: [
        {
          itemId: "item-1",
          accessToken: "secret-token",
          checksum: "sha256-001",
        },
      ],
    });

    expect(sanitized).toEqual({
      sandboxProgramId: "program-1",
      nested: {
        capability: "av_dispatch",
      },
      manifestItems: [
        {
          itemId: "item-1",
          checksum: "sha256-001",
        },
      ],
    });
  });

  it("records append-only amendment metadata and returns an ActionReceipt", () => {
    const { sink, writes } = createAuditSink();

    const result = emitPhase2AuditedAction({
      sink,
      audit: createAuditContext({
        eventName:
          PHASE2_AUDIT_EVENT_CATALOG.sandbox
            .providerCapabilityRequirementAmended,
        summary: {
          sandboxProgramId: "program-1",
          capability: "av_dispatch",
          required: false,
          signedUrl: "https://example.com/should-not-leak",
        },
        previousSummary: {
          sandboxProgramId: "program-1",
          capability: "av_dispatch",
          required: true,
          passengerName: "Original Rider",
        },
        resourceVersion: "v2",
        supersedesAuditId: "audit-previous-001",
        amendsResourceVersion: "v1",
      }),
      data: {
        requirementId: "program-1:av_dispatch",
      },
      message: "Provider capability requirement amended.",
    });

    expect(writes).toHaveLength(1);
    expect(result.auditLog).toMatchObject({
      auditId: "audit-1",
      actionName:
        PHASE2_AUDIT_EVENT_CATALOG.sandbox.providerCapabilityRequirementAmended,
      resourceType: "provider_capability_requirement",
      resourceId: "program-1:av_dispatch",
      oldValuesSummary: {
        sandboxProgramId: "program-1",
        capability: "av_dispatch",
        required: true,
      },
      newValuesSummary: {
        sandboxProgramId: "program-1",
        capability: "av_dispatch",
        required: false,
        resourceVersion: "v2",
        supersedesAuditId: "audit-previous-001",
        amendsResourceVersion: "v1",
      },
    });
    expect(JSON.stringify(result.auditLog)).not.toContain("should-not-leak");
    expect(JSON.stringify(result.auditLog)).not.toContain("Original Rider");
    expect(result.receipt).toEqual({
      actionId: "req-audit-001",
      auditId: "audit-1",
      resourceType: "provider_capability_requirement",
      resourceId: "program-1:av_dispatch",
      status: "completed",
      message: "Provider capability requirement amended.",
    });
  });

  it("rejects amended event names that omit amendment links", () => {
    const { sink } = createAuditSink();

    expect(() =>
      emitPhase2AuditRecord(
        sink,
        createAuditContext({
          eventName:
            PHASE2_AUDIT_EVENT_CATALOG.sandbox
              .providerCapabilityRequirementAmended,
        }),
      ),
    ).toThrowError(
      "Phase2 amendment events require supersedesAuditId or amendsResourceVersion.",
    );
  });
});
