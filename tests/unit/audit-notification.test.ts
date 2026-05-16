import { describe, expect, it, vi } from "vitest";

import type { AuditLogRecord } from "@drts/contracts";

import { AuditLogRepository } from "../../apps/api/src/modules/audit-notification/audit-log.repository";
import { BOOTSTRAP_AUDIT_LOG } from "../../apps/api/src/modules/audit-notification/audit-log.persistence";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";

function makeStoredAuditLog(index: number): AuditLogRecord {
  return {
    auditId: `audit-${index}`,
    actorId: null,
    actorType: "system",
    tenantId: null,
    moduleName: "audit-notification",
    actionName: `loaded-${index}`,
    resourceType: "retention_test",
    resourceId: `resource-${index}`,
    requestId: `request-${index}`,
    createdAt: `2026-04-11T00:00:${String(index % 60).padStart(2, "0")}.000Z`,
    newValuesSummary: {
      index,
    },
  };
}

describe("audit notification persistence baseline", () => {
  it("writes audit logs through to the repository and keeps UUID ids", async () => {
    const appended: AuditLogRecord[] = [];
    const repository = {
      append: vi.fn(async (record: AuditLogRecord) => {
        appended.push(record);
      }),
    } as unknown as AuditLogRepository;

    const service = new AuditNotificationService(repository);

    const log = service.recordAuditLog({
      actorId: null,
      actorType: "system",
      tenantId: null,
      moduleName: "owned-mobility",
      actionName: "dispatch_assigned",
      resourceType: "dispatch_assignment",
      resourceId: "assignment-001",
      newValuesSummary: {
        assignmentStatus: "assigned",
      },
    });

    await Promise.resolve();

    expect(log.auditId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(appended[0]?.auditId).toBe(log.auditId);
    expect(appended[0]?.requestId).toBe(log.requestId);
  });

  it("normalizes non-uuid actor and tenant ids before insert", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const repository = new AuditLogRepository({
      isEnabled: () => true,
      query,
    } as never);

    await repository.append({
      auditId: "22222222-2222-4222-8222-222222222222",
      actorId: "ops-user-001",
      actorType: "ops_user",
      tenantId: "tenant-demo-001",
      moduleName: "complaint",
      actionName: "create_complaint_case",
      resourceType: "complaint_case",
      resourceId: "complaint-001",
      requestId: "request-001",
      createdAt: "2026-04-11T00:00:00.000Z",
      newValuesSummary: {
        severity: "medium",
      },
    });

    expect(query).toHaveBeenCalledTimes(1);
    const firstCall = query.mock.calls[0] as [string, unknown[]] | undefined;
    expect(firstCall?.[1]?.[1]).toBeNull();
    expect(firstCall?.[1]?.[3]).toBeNull();
    expect(firstCall?.[1]?.[7]).toBe("complaint-001");
  });

  it("falls back to the bootstrap seed when repository loading fails", async () => {
    const reportPersistenceFailure = vi.fn();
    const repository = {
      loadRecent: vi.fn(async () => {
        throw new Error("db unavailable");
      }),
      loadEvidenceGovernanceTrail: vi.fn(async () => []),
      reportPersistenceFailure,
      append: vi.fn(async () => {}),
    } as unknown as AuditLogRepository;

    const service = new AuditNotificationService(repository);

    await service.onModuleInit();

    expect(service.listAuditLogs()).toEqual([BOOTSTRAP_AUDIT_LOG]);
    expect(reportPersistenceFailure).toHaveBeenCalledTimes(1);
  });

  it("keeps only the 1000 newest audit logs in memory while preserving write-through", async () => {
    const appended: AuditLogRecord[] = [];
    const repository = {
      append: vi.fn(async (record: AuditLogRecord) => {
        appended.push(record);
      }),
    } as unknown as AuditLogRepository;

    const service = new AuditNotificationService(repository);

    for (let index = 0; index < 1005; index += 1) {
      service.recordAuditLog({
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "audit-notification",
        actionName: `recorded-${index}`,
        resourceType: "retention_test",
        resourceId: `resource-${index}`,
        newValuesSummary: {
          index,
        },
      });
    }

    await Promise.resolve();

    const auditLogs = service.listAuditLogs();
    expect(auditLogs).toHaveLength(1000);
    expect(auditLogs[0]?.actionName).toBe("recorded-1004");
    expect(auditLogs.at(-1)?.actionName).toBe("recorded-5");
    expect(auditLogs.some((record) => record.actionName === "recorded-4")).toBe(
      false,
    );
    expect(
      auditLogs.some(
        (record) => record.auditId === BOOTSTRAP_AUDIT_LOG.auditId,
      ),
    ).toBe(false);
    // 1005 explicit records + 1 self-audit emitted by listAuditLogs() above.
    expect(appended).toHaveLength(1006);
  });

  it("trims repository-loaded audit logs down to the 1000 newest records on module init", async () => {
    const repository = {
      loadRecent: vi.fn(async () =>
        Array.from({ length: 1002 }, (_, index) => makeStoredAuditLog(index)),
      ),
      loadEvidenceGovernanceTrail: vi.fn(async () => []),
      reportPersistenceFailure: vi.fn(),
      append: vi.fn(async () => {}),
    } as unknown as AuditLogRepository;

    const service = new AuditNotificationService(repository);

    await service.onModuleInit();

    const auditLogs = service.listAuditLogs();
    expect(repository.loadRecent).toHaveBeenCalledWith(1000);
    expect(auditLogs).toHaveLength(1000);
    expect(auditLogs[0]?.actionName).toBe("loaded-0");
    expect(auditLogs.at(-1)?.actionName).toBe("loaded-999");
  });
});
