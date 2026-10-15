import { describe, expect, it, vi } from "vitest";
import type { AuditLogRecord } from "@drts/contracts";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { AuditController } from "../../../apps/api/src/modules/audit-notification/audit.controller";
import { AuditLogRepository } from "../../../apps/api/src/modules/audit-notification/audit-log.repository";
import { ReportingFilingService } from "../../../apps/api/src/modules/reporting-filing/reporting-filing.service";

const identity = {
  actorId: "admin",
  actorType: "platform_admin" as const,
  realm: "platform" as const,
  scopes: ["audit:read", "reports:read"],
  tenantId: null,
};
const holdCommand = {
  family: "audit_log" as const,
  subjectId: "old-row",
  caseNumber: "CASE-1",
  reasonCode: "regulatory_inquiry" as const,
};
const exceptionCommand = {
  family: "audit_log" as const,
  subjectId: "old-row",
  sourceResourceType: "regulator_packet",
  sourceResourceId: "packet-1",
  reviewerActorId: "admin",
  expiresAt: "2099-01-01T00:00:00.000Z",
  reasonCode: "regulatory_request" as const,
};
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
// Only the DB transport is controlled: production repository serialization, service,
// controller envelopes and restart replay all execute normally, without sockets.
function fixture() {
  const stored: AuditLogRecord[] = [];
  let gate: ReturnType<typeof deferred> | undefined;
  let loadFails = false;
  let recentFails = false;
  const query = vi.fn(async (sql: string, args?: unknown[]) => {
    if (sql.includes("INSERT INTO")) {
      if (
        args?.[6] === "evidence_legal_hold" ||
        args?.[6] === "evidence_deletion_exception"
      )
        await gate?.promise;
      if (!stored.some((row) => row.auditId === args?.[0]))
        stored.push({
          auditId: args![0] as string,
          actorId: args![1] as string | null,
          actorType: args![2] as AuditLogRecord["actorType"],
          tenantId: args![3] as string | null,
          moduleName: args![4] as string,
          actionName: args![5] as string,
          resourceType: args![6] as string,
          resourceId: args![7] as string,
          oldValuesSummary: JSON.parse(args![8] as string) ?? undefined,
          newValuesSummary: JSON.parse(args![9] as string) ?? undefined,
          requestId: args![10] as string,
          createdAt: args![11] as string,
        });
      return { rows: [] };
    }
    const governance = sql.includes("WHERE resource_type IN");
    if ((governance && loadFails) || (!governance && recentFails))
      throw new Error("controlled load failure");
    return {
      rows: stored
        .filter(
          (row) => !governance || row.resourceType.startsWith("evidence_"),
        )
        .map((row) => ({
          audit_id: row.auditId,
          actor_id: row.actorId,
          actor_type: row.actorType,
          tenant_id: row.tenantId,
          module_name: row.moduleName,
          action_name: row.actionName,
          resource_type: row.resourceType,
          resource_id: row.resourceId,
          old_value: row.oldValuesSummary,
          new_value: row.newValuesSummary,
          request_id: row.requestId,
          created_at: row.createdAt,
        })),
    };
  });
  const repository = new AuditLogRepository({
    isEnabled: () => true,
    query,
  } as never);
  const service = new AuditNotificationService(repository);
  return {
    stored,
    service,
    controller: new AuditController(service),
    repository,
    setGate: (value: ReturnType<typeof deferred>) => {
      gate = value;
    },
    failLoad: () => {
      loadFails = true;
    },
    failRecent: () => {
      recentFails = true;
    },
  };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

describe("C099 canonical governance ACK and unavailable authority", () => {
  for (const operation of [
    "place",
    "release",
    "register",
    "resolve",
  ] as const) {
    for (const outcome of ["ack", "reject"] as const) {
      it(`${operation}: ${outcome} controls actual envelope, cache, readback and restart`, async () => {
        const f = fixture();
        await f.service.onModuleInit();
        const hold =
          operation === "release"
            ? await f.controller.placeEvidenceLegalHold(holdCommand, identity)
            : null;
        const exception =
          operation === "resolve"
            ? await f.controller.registerEvidenceDeletionException(
                exceptionCommand,
                identity,
              )
            : null;
        const before = f.service.getEvidenceSubjectGovernance(
          "audit_log",
          "old-row",
        );
        const auditBefore = f.service.getAuditLogsSnapshot();
        const gate = deferred();
        f.setGate(gate);
        let settled = false;
        const result = Promise.resolve(
          operation === "place"
            ? f.controller.placeEvidenceLegalHold(
                holdCommand,
                identity,
                "req-command",
              )
            : operation === "release"
              ? f.controller.releaseEvidenceLegalHold(
                  hold!.data.holdId,
                  { releaseReason: "closed" },
                  identity,
                  "req-command",
                )
              : operation === "register"
                ? f.controller.registerEvidenceDeletionException(
                    exceptionCommand,
                    identity,
                    "req-command",
                  )
                : f.controller.resolveEvidenceDeletionException(
                    exception!.data.exceptionId,
                    { resolutionNote: "closed" },
                    identity,
                    "req-command",
                  ),
        );
        const observed = result.then(
          (value) => {
            settled = true;
            return { value };
          },
          (error) => {
            settled = true;
            return { error };
          },
        );
        await tick();
        // Settle the gate before assertions, so the old-code failing proof cannot leave work running.
        const pending = !settled;
        const during = f.service.getEvidenceSubjectGovernance(
          "audit_log",
          "old-row",
        );
        const cacheDuring = f.service.getAuditLogsSnapshot();
        if (outcome === "ack") gate.resolve();
        else gate.reject(new Error("append rejected"));
        const final = await observed;
        await tick();
        expect(pending).toBe(true);
        expect(during).toEqual(before);
        expect(cacheDuring).toEqual(auditBefore);
        if (outcome === "reject") {
          expect(final).toHaveProperty("error");
          expect(
            f.service.getEvidenceSubjectGovernance("audit_log", "old-row"),
          ).toEqual(before);
          expect(f.service.getAuditLogsSnapshot()).toEqual(auditBefore);
        } else {
          expect(final).toHaveProperty("value.meta.requestId", "req-command");
          expect(
            f.service.getEvidenceSubjectGovernance("audit_log", "old-row")
              .deletionSuppressed,
          ).toBe(operation === "place" || operation === "register");
        }
        const restarted = new AuditNotificationService(f.repository);
        await restarted.onModuleInit();
        expect(
          restarted.getEvidenceSubjectGovernance("audit_log", "old-row"),
        ).toEqual(
          f.service.getEvidenceSubjectGovernance("audit_log", "old-row"),
        );
      });
    }
  }

  it("failed configured trail is unavailable in lists, controller, commands and report projection; audit feed retains fallback", async () => {
    const f = fixture();
    await f.service.onModuleInit();
    await f.controller.placeEvidenceLegalHold(holdCommand, identity);
    f.failLoad();
    f.failRecent();
    const service = new AuditNotificationService(f.repository);
    await service.onModuleInit();
    const controller = new AuditController(service);
    expect(() => controller.listEvidenceLegalHolds()).toThrow();
    expect(() => controller.listEvidenceDeletionExceptions()).toThrow();
    expect(() =>
      controller.getEvidenceSubjectGovernance("audit_log", "old-row"),
    ).toThrow();
    await expect(
      controller.placeEvidenceLegalHold(
        { ...holdCommand, caseNumber: "CASE-2" },
        identity,
      ),
    ).rejects.toThrow();
    expect(service.listAuditLogs(identity).length).toBeGreaterThan(0);
    const reports = new ReportingFilingService(service);
    const job = reports.listReportJobs()[0]!;
    expect(() =>
      reports.getReportJob(job.jobId, undefined, identity),
    ).toThrow();
    expect(
      f.stored.filter((row) => row.resourceType === "evidence_legal_hold"),
    ).toHaveLength(1);
  });

  it("successful empty, disabled repository and absent repository are known empty", async () => {
    for (const service of [
      fixture().service,
      new AuditNotificationService(new AuditLogRepository()),
      new AuditNotificationService(),
    ]) {
      await service.onModuleInit();
      expect(service.listEvidenceLegalHolds()).toEqual([]);
      expect(service.listEvidenceDeletionExceptions()).toEqual([]);
      expect(
        service.getEvidenceSubjectGovernance("audit_log", "none")
          .deletionSuppressed,
      ).toBe(false);
      const hold = await service.placeEvidenceLegalHold(holdCommand, identity);
      expect(
        service.getEvidenceSubjectGovernance("audit_log", "old-row")
          .deletionSuppressed,
      ).toBe(true);
      await service.releaseEvidenceLegalHold(
        hold.holdId,
        { releaseReason: "closed" },
        identity,
      );
    }
  });

  it("recent-feed failure does not discard a successfully replayed governance trail", async () => {
    const f = fixture();
    await f.service.onModuleInit();
    await f.controller.placeEvidenceLegalHold(holdCommand, identity);
    f.failRecent();
    const service = new AuditNotificationService(f.repository);
    await service.onModuleInit();
    expect(
      service.getEvidenceSubjectGovernance("audit_log", "old-row")
        .deletionSuppressed,
    ).toBe(true);
  });
});
