import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuditLogRecord, IdentityContext } from "@drts/contracts";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { AuditController } from "../../../apps/api/src/modules/audit-notification/audit.controller";
import { AuditLogRepository } from "../../../apps/api/src/modules/audit-notification/audit-log.repository";
import { ReportingFilingService } from "../../../apps/api/src/modules/reporting-filing/reporting-filing.service";

const identity = {
  authMode: "jwt_bearer",
  roleFamilies: ["platform"],
  roles: ["platform_admin"],
  supportedExecutionModes: [],
  actorId: "admin",
  actorType: "platform_admin" as const,
  realm: "platform" as const,
  scopes: ["audit:read", "reports:read"],
  tenantId: null,
} satisfies IdentityContext;
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
function fixture(reverseTies = false) {
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
        .sort((left, right) => {
          const time = left.createdAt.localeCompare(right.createdAt);
          if (!governance) return -time;
          return (
            time ||
            (reverseTies ? stored.indexOf(right) - stored.indexOf(left) : 0)
          );
        })
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
    recover: () => {
      loadFails = false;
      recentFails = false;
    },
    failRecent: () => {
      recentFails = true;
    },
  };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

describe("C099 canonical governance ACK and unavailable authority", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });
  for (const operation of ["hold", "exception"] as const) {
    for (const clock of ["frozen", "distinct"] as const) {
      for (const reverseTies of [false, true]) {
        it(`terminal replay ${operation}: ${clock} clock, reverse ties ${reverseTies}`, async () => {
          vi.useFakeTimers({ toFake: ["Date"] });
          vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));
          const f = fixture(reverseTies);
          await f.service.onModuleInit();
          const active =
            operation === "hold"
              ? await f.controller.placeEvidenceLegalHold(holdCommand, identity)
              : await f.controller.registerEvidenceDeletionException(
                  exceptionCommand,
                  identity,
                );
          if (clock === "distinct")
            vi.setSystemTime(new Date("2026-10-15T12:00:01.000Z"));
          const terminal =
            operation === "hold"
              ? await f.controller.releaseEvidenceLegalHold(
                  (active.data as { holdId: string }).holdId,
                  { releaseReason: "closed" },
                  identity,
                )
              : await f.controller.resolveEvidenceDeletionException(
                  (active.data as { exceptionId: string }).exceptionId,
                  { resolutionNote: "closed" },
                  identity,
                );
          const expectedStatus = operation === "hold" ? "released" : "resolved";
          expect(terminal.data.status).toBe(expectedStatus);
          const events = f.stored.filter((row) =>
            row.resourceType.startsWith("evidence_"),
          );
          expect(events).toHaveLength(2);
          expect(events[0]!.createdAt === events[1]!.createdAt).toBe(
            clock === "frozen",
          );
          expect(events.map((row) => row.newValuesSummary?.status)).toEqual([
            "active",
            expectedStatus,
          ]);
          const before = f.controller.getEvidenceSubjectGovernance(
            "audit_log",
            "old-row",
          ).data;
          expect(before.deletionSuppressed).toBe(false);
          const restarted = new AuditNotificationService(f.repository);
          await restarted.onModuleInit();
          const controller = new AuditController(restarted);
          expect(
            controller.getEvidenceSubjectGovernance("audit_log", "old-row")
              .data,
          ).toEqual(before);
          expect(
            operation === "hold"
              ? restarted.listEvidenceLegalHolds()
              : restarted.listEvidenceDeletionExceptions(),
          ).toEqual([terminal.data]);
          // The acknowledged terminal state must still enforce the original repeat-command refusal.
          const repeated =
            operation === "hold"
              ? controller.releaseEvidenceLegalHold(
                  (terminal.data as { holdId: string }).holdId,
                  { releaseReason: "again" },
                  identity,
                )
              : controller.resolveEvidenceDeletionException(
                  (terminal.data as { exceptionId: string }).exceptionId,
                  { resolutionNote: "again" },
                  identity,
                );
          await expect(repeated).rejects.toMatchObject({
            code:
              operation === "hold"
                ? "EVIDENCE_LEGAL_HOLD_ALREADY_RELEASED"
                : "EVIDENCE_DELETION_EXCEPTION_NOT_ACTIVE",
          });
        });
      }
    }
  }
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

  for (const operation of ["place", "register"] as const) {
    it(`${operation} accepts UUID tenant spelling and reads the same identity after persisted replay`, async () => {
      const f = fixture();
      await f.service.onModuleInit();
      const tenant = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
      const subjectId = "11111111-1111-4111-8111-111111111111";
      const result =
        operation === "place"
          ? await f.controller.placeEvidenceLegalHold(
              { ...holdCommand, subjectId, tenantId: tenant },
              identity,
            )
          : await f.controller.registerEvidenceDeletionException(
              { ...exceptionCommand, subjectId, tenantId: tenant },
              identity,
            );
      expect(result.data).toMatchObject({
        status: "active",
        tenantId: tenant,
        subjectId,
      });
      const persisted = f.stored.find(
        (r) =>
          r.resourceType ===
          (operation === "place"
            ? "evidence_legal_hold"
            : "evidence_deletion_exception"),
      )!;
      // Observe the real repository INSERT inputs before simulating PostgreSQL's
      // canonical UUID text at the controlled query transport read boundary.
      expect(persisted.tenantId).toBe(tenant);
      expect(persisted.newValuesSummary?.tenantId).toBe(tenant);
      persisted.tenantId = tenant.toLowerCase();
      const restarted = new AuditNotificationService(f.repository);
      await restarted.onModuleInit();
      for (const service of [f.service, restarted]) {
        const controller = new AuditController(service);
        for (const tenantId of [tenant, tenant.toLowerCase()])
          expect(
            controller.getEvidenceSubjectGovernance(
              "audit_log",
              subjectId,
              tenantId,
            ).data.deletionSuppressed,
          ).toBe(true);
        expect(
          service.getEvidenceSubjectGovernance("audit_log", subjectId, {
            tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          }).deletionSuppressed,
        ).toBe(false);
      }
      for (const tenantId of [
        "Tenant-A",
        "AAAAAAAA-AAAA-7AAA-8AAA-AAAAAAAAAAAA",
      ]) {
        const opaqueSubject = `${subjectId}-${tenantId}`;
        if (operation === "place")
          await f.controller.placeEvidenceLegalHold(
            { ...holdCommand, subjectId: opaqueSubject, tenantId },
            identity,
          );
        else
          await f.controller.registerEvidenceDeletionException(
            { ...exceptionCommand, subjectId: opaqueSubject, tenantId },
            identity,
          );
        const replayed = new AuditNotificationService(f.repository);
        await replayed.onModuleInit();
        for (const service of [f.service, replayed]) {
          const controller = new AuditController(service);
          expect(
            controller.getEvidenceSubjectGovernance(
              "audit_log",
              opaqueSubject,
              tenantId,
            ).data.deletionSuppressed,
          ).toBe(true);
          expect(
            controller.getEvidenceSubjectGovernance(
              "audit_log",
              opaqueSubject,
              tenantId.toLowerCase(),
            ).data.deletionSuppressed,
          ).toBe(false);
        }
      }
    });
  }

  for (const operation of ["place", "register"] as const) {
    for (const family of ["audit_log", "report_artifact"] as const) {
      for (const subjectId of [
        "ABCDEFAB-CDEF-4ABC-8ABC-ABCDEFABCDEF",
        "ABCDEFAB-CDEF-7ABC-8ABC-ABCDEFABCDEF",
        "Opaque-Subject",
      ]) {
        it(`${operation} ${family} UUID subject identity ${subjectId} survives command ACK and persisted replay`, async () => {
          const f = fixture();
          await f.service.onModuleInit();
          const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
          const result =
            operation === "place"
              ? await f.controller.placeEvidenceLegalHold(
                  { ...holdCommand, family, subjectId, tenantId },
                  identity,
                )
              : await f.controller.registerEvidenceDeletionException(
                  { ...exceptionCommand, family, subjectId, tenantId },
                  identity,
                );
          expect(result.data).toMatchObject({ status: "active", subjectId });
          const persisted = f.stored.find(
            (r) =>
              r.resourceType ===
              (operation === "place"
                ? "evidence_legal_hold"
                : "evidence_deletion_exception"),
          )!;
          expect(persisted.newValuesSummary?.subjectId).toBe(subjectId);
          const restarted = new AuditNotificationService(f.repository);
          await restarted.onModuleInit();
          for (const service of [f.service, restarted]) {
            const controller = new AuditController(service);
            expect(
              controller.getEvidenceSubjectGovernance(
                family,
                subjectId,
                tenantId,
              ).data.deletionSuppressed,
            ).toBe(true);
            expect(
              controller.getEvidenceSubjectGovernance(
                family,
                subjectId.toLowerCase(),
                tenantId,
              ).data.deletionSuppressed,
            ).toBe(family === "audit_log" && subjectId !== "Opaque-Subject");
            expect(
              controller.getEvidenceSubjectGovernance(
                family,
                "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                tenantId,
              ).data.deletionSuppressed,
            ).toBe(false);
            expect(
              controller.getEvidenceSubjectGovernance(
                family,
                subjectId.toLowerCase(),
                "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              ).data.deletionSuppressed,
            ).toBe(false);
          }
          // Duplicate detection uses the same identity, including persisted legacy
          // payloads, while opaque/family-specific subjects remain distinct.
          const duplicate =
            operation === "place"
              ? restarted.placeEvidenceLegalHold(
                  {
                    ...holdCommand,
                    family,
                    subjectId: subjectId.toLowerCase(),
                    tenantId,
                  },
                  identity,
                )
              : restarted.registerEvidenceDeletionException(
                  {
                    ...exceptionCommand,
                    family,
                    subjectId: subjectId.toLowerCase(),
                    tenantId,
                  },
                  identity,
                );
          if (family === "audit_log" && subjectId !== "Opaque-Subject")
            await expect(duplicate).rejects.toMatchObject({
              code:
                operation === "place"
                  ? "EVIDENCE_LEGAL_HOLD_ALREADY_ACTIVE"
                  : "EVIDENCE_DELETION_EXCEPTION_ALREADY_ACTIVE",
            });
          else
            await expect(duplicate).resolves.toMatchObject({
              status: "active",
            });
        });
      }
    }
  }

  it("accepts audit-source UUID spelling through actual register ACK and preserves it in replay", async () => {
    const f = fixture();
    await f.service.onModuleInit();
    const sourceResourceId = "ABCDEFAB-CDEF-4ABC-8ABC-ABCDEFABCDEF";
    const result = await f.controller.registerEvidenceDeletionException(
      {
        ...exceptionCommand,
        subjectId: "other-subject",
        sourceResourceType: "audit_log",
        sourceResourceId,
      },
      identity,
    );
    expect(result.data).toMatchObject({ status: "active", sourceResourceId });
    expect(
      f.stored.find((r) => r.resourceType === "evidence_deletion_exception")
        ?.newValuesSummary,
    ).toMatchObject({ sourceResourceId });
    const restarted = new AuditNotificationService(f.repository);
    await restarted.onModuleInit();
    expect(restarted.listEvidenceDeletionExceptions()).toEqual([result.data]);
  });

  it("failed configured trail is unavailable in lists, controller, commands and report projection; audit feed retains fallback", async () => {
    const f = fixture();
    await f.service.onModuleInit();
    await f.controller.placeEvidenceLegalHold(holdCommand, identity);
    f.failLoad();
    f.failRecent();
    const service = new AuditNotificationService(f.repository);
    await service.onModuleInit();
    const controller = new AuditController(service);
    expect(() => controller.listEvidenceLegalHolds()).toThrowError(
      expect.objectContaining({ code: "EVIDENCE_GOVERNANCE_UNAVAILABLE" }),
    );
    expect(() => controller.listEvidenceDeletionExceptions()).toThrowError(
      expect.objectContaining({ code: "EVIDENCE_GOVERNANCE_UNAVAILABLE" }),
    );
    expect(() =>
      controller.getEvidenceSubjectGovernance("audit_log", "old-row"),
    ).toThrowError(
      expect.objectContaining({ code: "EVIDENCE_GOVERNANCE_UNAVAILABLE" }),
    );
    await expect(
      controller.placeEvidenceLegalHold(
        { ...holdCommand, caseNumber: "CASE-2" },
        identity,
      ),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "EVIDENCE_GOVERNANCE_UNAVAILABLE" }),
    );
    expect(service.listAuditLogs(identity).length).toBeGreaterThan(0);
    vi.stubEnv(
      "CONTROLLED_DOWNLOAD_SIGNING_SECRET",
      "socket-free-reporting-test-secret",
    );
    const reports = new ReportingFilingService(service);
    const job = reports.createReportJob({
      jobType: "revenue_summary",
      format: "csv",
    });
    await tick();
    expect(reports.listReportJobs()[0]?.artifact).toBeTruthy();
    expect(() =>
      reports.getReportJob(job.jobId, undefined, identity),
    ).toThrowError(
      expect.objectContaining({ code: "EVIDENCE_GOVERNANCE_UNAVAILABLE" }),
    );
    expect(
      f.stored.filter((row) => row.resourceType === "evidence_legal_hold"),
    ).toHaveLength(1);
    f.recover();
    await service.onModuleInit();
    expect(
      controller.getEvidenceSubjectGovernance("audit_log", "old-row").data
        .deletionSuppressed,
    ).toBe(true);
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
  it("serializes concurrent duplicates through ACK and continues after a rejected command", async () => {
    const f = fixture();
    await f.service.onModuleInit();
    const gate = deferred();
    f.setGate(gate);
    const first = f.controller.placeEvidenceLegalHold(holdCommand, identity);
    const duplicate = f.controller.placeEvidenceLegalHold(
      holdCommand,
      identity,
    );
    const duplicateResult = duplicate.catch((error) => error);
    await tick();
    expect(f.service.listEvidenceLegalHolds()).toEqual([]);
    gate.resolve();
    const placed = await first;
    expect(await duplicateResult).toMatchObject({
      code: "EVIDENCE_LEGAL_HOLD_ALREADY_ACTIVE",
    });
    expect(
      f.stored.filter((row) => row.resourceType === "evidence_legal_hold"),
    ).toHaveLength(1);
    const rejected = deferred();
    f.setGate(rejected);
    const release = f.controller.releaseEvidenceLegalHold(
      placed.data.holdId,
      { releaseReason: "closed" },
      identity,
    );
    const rejectedResult = release.catch((error) => error);
    await tick();
    rejected.reject(new Error("rejected release"));
    expect(await rejectedResult).toBeInstanceOf(Error);
    const retry = deferred();
    retry.resolve();
    f.setGate(retry);
    await f.controller.releaseEvidenceLegalHold(
      placed.data.holdId,
      { releaseReason: "closed" },
      identity,
    );
    expect(f.service.listEvidenceLegalHolds()[0]?.status).toBe("released");
  });

  it("preserves authenticated roles, reason/expiry rules, tenant/manifest projections and transient buffer refusal", async () => {
    const service = new AuditNotificationService();
    await expect(
      service.placeEvidenceLegalHold(holdCommand, null),
    ).rejects.toMatchObject({ code: "EVIDENCE_GOVERNANCE_IDENTITY_REQUIRED" });
    await expect(
      service.placeEvidenceLegalHold(holdCommand, {
        ...identity,
        actorType: "tenant_admin",
        realm: "tenant",
        tenantId: "tenant-a",
      }),
    ).rejects.toMatchObject({ code: "EVIDENCE_GOVERNANCE_FORBIDDEN" });
    await expect(
      service.placeEvidenceLegalHold(
        { ...holdCommand, family: "voice_live_buffer" },
        identity,
      ),
    ).rejects.toMatchObject({ code: "EVIDENCE_GOVERNANCE_FORBIDDEN" });
    await expect(
      service.placeEvidenceLegalHold(
        { ...holdCommand, reasonCode: "invalid" as never },
        identity,
      ),
    ).rejects.toMatchObject({
      code: "EVIDENCE_GOVERNANCE_INVALID_REASON_CODE",
    });
    await expect(
      service.registerEvidenceDeletionException(
        { ...exceptionCommand, expiresAt: "2020-01-01T00:00:00Z" },
        identity,
      ),
    ).rejects.toMatchObject({ code: "EVIDENCE_GOVERNANCE_INVALID_EXPIRY" });
    const placed = await service.placeEvidenceLegalHold(
      { ...holdCommand, tenantId: "tenant-a", manifestHash: "hash-a" },
      identity,
    );
    expect(
      service.getEvidenceSubjectGovernance("audit_log", "old-row", {
        tenantId: "tenant-a",
        manifestHash: "hash-a",
      }).deletionSuppressed,
    ).toBe(true);
    expect(
      service.getEvidenceSubjectGovernance("audit_log", "old-row", {
        tenantId: "tenant-b",
        manifestHash: "hash-a",
      }).deletionSuppressed,
    ).toBe(false);
    expect(
      service.getEvidenceSubjectGovernance("audit_log", "old-row", {
        tenantId: "tenant-a",
        manifestHash: "hash-b",
      }).deletionSuppressed,
    ).toBe(false);
    await expect(
      service.releaseEvidenceLegalHold(
        placed.holdId,
        { releaseReason: "closed" },
        { ...identity, actorType: "ops_user", realm: "ops" },
      ),
    ).rejects.toMatchObject({ code: "EVIDENCE_GOVERNANCE_FORBIDDEN" });
    await service.releaseEvidenceLegalHold(
      placed.holdId,
      { releaseReason: "closed" },
      identity,
    );
    await expect(
      service.releaseEvidenceLegalHold(
        placed.holdId,
        { releaseReason: "again" },
        identity,
      ),
    ).rejects.toMatchObject({ code: "EVIDENCE_LEGAL_HOLD_ALREADY_RELEASED" });
    const exception = await service.registerEvidenceDeletionException(
      exceptionCommand,
      identity,
    );
    await expect(
      service.registerEvidenceDeletionException(exceptionCommand, identity),
    ).rejects.toMatchObject({
      code: "EVIDENCE_DELETION_EXCEPTION_ALREADY_ACTIVE",
    });
    await service.resolveEvidenceDeletionException(
      exception.exceptionId,
      { resolutionNote: "closed" },
      identity,
    );
    await expect(
      service.resolveEvidenceDeletionException(
        exception.exceptionId,
        { resolutionNote: "again" },
        identity,
      ),
    ).rejects.toMatchObject({ code: "EVIDENCE_DELETION_EXCEPTION_NOT_ACTIVE" });
  });
});
