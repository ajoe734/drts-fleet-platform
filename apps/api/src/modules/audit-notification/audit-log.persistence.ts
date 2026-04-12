import { randomUUID } from "node:crypto";

import type { AuditLogRecord } from "@drts/contracts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const BOOTSTRAP_AUDIT_LOG: AuditLogRecord = {
  auditId: "11111111-1111-4111-8111-111111111111",
  actorId: null,
  actorType: "system",
  tenantId: null,
  moduleName: "foundation",
  actionName: "bootstrap_seeded",
  resourceType: "foundation_manifest",
  resourceId: "phase1",
  newValuesSummary: {
    modules: [
      "identity",
      "tenant-partner",
      "regulatory-registry",
      "product-rule",
      "audit-notification",
    ],
  },
  requestId: "bootstrap-seed",
  createdAt: "2026-04-10T00:00:00.000Z",
};

export function cloneAuditLog(record: AuditLogRecord): AuditLogRecord {
  return {
    ...record,
    ...(record.oldValuesSummary
      ? {
          oldValuesSummary: structuredClone(record.oldValuesSummary),
        }
      : {}),
    ...(record.newValuesSummary
      ? {
          newValuesSummary: structuredClone(record.newValuesSummary),
        }
      : {}),
  };
}

export function isUuidLike(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function normalizeUuidOrNull(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  return isUuidLike(value) ? value : null;
}

export function createAuditLogRecord(
  input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId"> & {
    requestId?: string;
    auditId?: string;
  },
): AuditLogRecord {
  return {
    ...input,
    requestId: input.requestId ?? randomUUID(),
    auditId:
      input.auditId && isUuidLike(input.auditId) ? input.auditId : randomUUID(),
    createdAt: new Date().toISOString(),
  };
}
