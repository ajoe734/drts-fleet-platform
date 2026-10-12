import { afterEach, describe, expect, it, vi } from "vitest";
import type { MultiTaxiTripOperationalExportRow } from "@drts/contracts";
import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth";
import { MultiTaxiController } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.controller";
import type { MultiTaxiService } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import type { DatabaseService } from "../../../../apps/api/src/common/db";
import { ReportingFilingRepository } from "../../../../apps/api/src/modules/reporting-filing/reporting-filing.repository";
import { ReportingFilingService } from "../../../../apps/api/src/modules/reporting-filing/reporting-filing.service";
import { queueFixture } from "./reporting-queue-fixture";

const identity: BootstrapRequestIdentity = {
  authMode: "jwt_bearer",
  actorType: "platform_admin",
  actorId: "capacity-export-admin",
  realm: "platform",
  tenantId: null,
  roleFamilies: ["platform"],
  roles: ["records_exporter"],
  scopes: ["multi_taxi_records:export"],
  requestId: "capacity-export-identity",
};
const command = {
  scope: { month: "2026-10" },
  purpose: "Durable operations export verification",
  idempotencyKey: "capacity-export-commit",
};
const rows: MultiTaxiTripOperationalExportRow[] = [
  {
    orderNoMasked: "CAP...01",
    plateNoMasked: "TEST...01",
    reservedAt: "2026-10-12T01:00:00.000Z",
    pickupAt: null,
    dropoffAt: null,
    payableFareMinor: 35000,
    actualFareMinor: 35000,
    tollMinor: 0,
    currency: "NTD",
    farePolicyVersion: "fare-test",
    chargingMode: "platform_quote",
    generatedAt: "2026-10-12T01:31:00.000Z",
    retainUntil: "2028-10-12T01:31:00.000Z",
  },
];
function controllerFor(f: ReturnType<typeof queueFixture>) {
  const source = {
    exportTripOperationalRecords: vi.fn().mockResolvedValue({ rows }),
  };
  return new MultiTaxiController(
    source as unknown as MultiTaxiService,
    f.service,
  );
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("multi-taxi export durable acknowledgement", () => {
  it.each(["INSERT INTO admin.phase1_report_jobs", "COMMIT"])(
    "does not acknowledge or publish a job before its actual repository %s finishes",
    async (boundary) => {
      const f = queueFixture();
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      let entered = false;
      f.control.before = async (sql) => {
        if (sql.includes(boundary)) {
          entered = true;
          await barrier;
        }
      };
      let returned = false;
      const response = controllerFor(f)
        .createTripOperationalExportJob(
          command,
          identity,
          "capacity-export-ack",
        )
        .then((value) => {
          returned = true;
          return value;
        });
      try {
        await vi.waitFor(() => expect(entered).toBe(true));
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(returned).toBe(false);
        expect(f.stored.size).toBe(0);
        expect(
          f.audit
            .listAuditLogs()
            .some(
              (log) => log.actionName === "create_multi_taxi_trip_export_job",
            ),
        ).toBe(false);
      } finally {
        release();
        const accepted = await response;
        expect(accepted.data).toMatchObject({
          status: "pending",
          idempotentReplay: false,
        });
        expect(f.stored.get(accepted.data.jobId)).toMatchObject({
          status: "queued",
          rows,
          filters: command.scope,
          multiTaxiTripExport: {
            ...command,
            requestedByActorId: identity.actorId,
            recordCount: rows.length,
          },
        });
        await f.service.onModuleDestroy();
      }
    },
  );

  it.each(["INSERT INTO admin.phase1_report_jobs", "COMMIT"])(
    "rejects %s failure without accepted audit, publication or worker processing and permits retry",
    async (boundary) => {
      const f = queueFixture();
      let proposedId: string | undefined;
      f.control.before = async (sql, params) => {
        if (sql.includes("INSERT INTO admin.phase1_report_jobs"))
          proposedId = String(params[0]);
        if (sql.includes(boundary)) throw new Error("queue write failed");
      };
      f.service.onApplicationBootstrap();
      try {
        await expect(
          controllerFor(f).createTripOperationalExportJob(command, identity),
        ).rejects.toThrow("queue write failed");
        expect(f.stored.size).toBe(0);
        expect(f.writes).toHaveLength(0);
        expect(
          f.audit
            .listAuditLogs()
            .some(
              (log) => log.actionName === "create_multi_taxi_trip_export_job",
            ),
        ).toBe(false);
        expect(() =>
          f.service.getMultiTaxiTripExportJob(proposedId!, identity),
        ).toThrow();
        delete f.control.before;
        const retried = await controllerFor(f).createTripOperationalExportJob(
          command,
          identity,
        );
        expect(retried.data.idempotentReplay).toBe(false);
        expect(f.stored.size).toBe(1);
      } finally {
        await f.service.onModuleDestroy();
      }
    },
  );

  it("serializes the same actor/key across actual producers and rejects changed scope or purpose without replacing rows", async () => {
    const f = queueFixture();
    const other = new ReportingFilingService(
      new AuditNotificationService(),
      new ReportingFilingRepository(f.database as unknown as DatabaseService),
    );
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    let inserts = 0;
    let locksRequested = 0;
    f.control.before = async (sql) => {
      if (sql.includes("pg_advisory_xact_lock")) locksRequested++;
      if (
        sql.includes("INSERT INTO admin.phase1_report_jobs") &&
        ++inserts === 1
      )
        await barrier;
    };
    const first = f.service.createMultiTaxiTripExportJobDurably(
      command,
      rows,
      identity,
    );
    await vi.waitFor(() => expect(inserts).toBe(1));
    const replay = other.createMultiTaxiTripExportJobDurably(
      command,
      [],
      identity,
    );
    try {
      await vi.waitFor(() => expect(locksRequested).toBe(2));
      expect(inserts).toBe(1);
    } finally {
      release();
    }
    try {
      const [created, repeated] = await Promise.all([first, replay]);
      expect(repeated).toEqual({ ...created, idempotentReplay: true });
      expect(f.stored.size).toBe(1);
      expect(f.stored.get(created.jobId)?.rows).toEqual(rows);
      for (const change of [
        { purpose: "different purpose" },
        { scope: { month: "2026-09" } },
      ]) {
        await expect(
          other.createMultiTaxiTripExportJobDurably(
            { ...command, ...change },
            [],
            identity,
          ),
        ).rejects.toMatchObject({
          code: "MULTI_TAXI_EXPORT_IDEMPOTENCY_CONFLICT",
        });
      }
      const independent = await other.createMultiTaxiTripExportJobDurably(
        command,
        rows,
        { ...identity, actorId: "another-export-admin" },
      );
      expect(independent.jobId).not.toBe(created.jobId);
      expect(independent.idempotentReplay).toBe(false);
      expect(inserts).toBe(2);
    } finally {
      await Promise.all([f.service.onModuleDestroy(), other.onModuleDestroy()]);
    }
  });

  it("recovers the canonical payload, first start and artifact with the actual bounded worker then replays completed state", async () => {
    const f = queueFixture();
    const accepted = await f.service.createMultiTaxiTripExportJobDurably(
      command,
      rows,
      identity,
    );
    await f.service.onModuleDestroy();
    const recovered = new ReportingFilingService(
      new AuditNotificationService(),
      new ReportingFilingRepository(f.database as unknown as DatabaseService),
    );
    await recovered.onModuleInit();
    recovered.onApplicationBootstrap();
    try {
      await vi.waitFor(() =>
        expect(f.stored.get(accepted.jobId)?.status).toBe("completed"),
      );
      const committed = f.stored.get(accepted.jobId)!;
      expect(committed.rows).toEqual(rows);
      expect(committed.multiTaxiTripExport).toEqual({
        ...command,
        requestedByActorId: identity.actorId,
        recordCount: rows.length,
      });
      expect(committed.startedAt).toEqual(expect.any(String));
      expect(committed.artifact?.manifestHash).toEqual(expect.any(String));
      expect(f.writes.map((job) => job.status)).toEqual([
        "queued",
        "running",
        "completed",
      ]);
      const view = recovered.getMultiTaxiTripExportJob(
        accepted.jobId,
        identity,
      );
      expect(view).toMatchObject({
        status: "completed",
        downloadAvailable: true,
        recordCount: rows.length,
      });
      expect(view).not.toHaveProperty("rows");
      expect(
        recovered.issueMultiTaxiTripExportDownload(accepted.jobId, identity)
          .download.downloadUrl,
      ).toContain("sig=");
      const unseen = new ReportingFilingService(
        new AuditNotificationService(),
        new ReportingFilingRepository(f.database as unknown as DatabaseService),
      );
      try {
        const replay = await unseen.createMultiTaxiTripExportJobDurably(
          command,
          [],
          identity,
        );
        expect(replay).toEqual({
          jobId: accepted.jobId,
          status: "completed",
          idempotentReplay: true,
        });
        expect(f.stored.get(accepted.jobId)?.startedAt).toBe(
          committed.startedAt,
        );
        expect(() => unseen.getReportJob(accepted.jobId)).toThrow();
        expect(() =>
          unseen.getMultiTaxiTripExportJob(accepted.jobId, {
            ...identity,
            scopes: [],
          }),
        ).toThrow();
      } finally {
        await unseen.onModuleDestroy();
      }
    } finally {
      await recovered.onModuleDestroy();
    }
  });

  it.each([
    null,
    { ...identity, actorId: "" },
    { ...identity, scopes: ["reports:read"] },
    {
      ...identity,
      realm: "tenant" as const,
      actorType: "tenant_admin" as const,
      tenantId: "tenant-other",
    },
  ])(
    "rejects unauthorized identities before durable enqueue: %j",
    async (actor) => {
      const f = queueFixture();
      try {
        await expect(
          f.service.createMultiTaxiTripExportJobDurably(command, rows, actor),
        ).rejects.toMatchObject({ code: "MULTI_TAXI_EXPORT_FORBIDDEN" });
        expect(f.stored.size).toBe(0);
        expect(f.database.query).not.toHaveBeenCalled();
      } finally {
        await f.service.onModuleDestroy();
      }
    },
  );

  it("rejects invalid purpose and actor-key conflict and prevents the synchronous durable acknowledgement bypass", async () => {
    const f = queueFixture();
    try {
      await expect(
        f.service.createMultiTaxiTripExportJobDurably(
          { ...command, purpose: " " },
          rows,
          identity,
        ),
      ).rejects.toMatchObject({ code: "MULTI_TAXI_EXPORT_FIELD_REQUIRED" });
      await expect(
        f.service.createMultiTaxiTripExportJobDurably(
          { ...command, idempotencyKey: " " },
          rows,
          identity,
        ),
      ).rejects.toMatchObject({ code: "MULTI_TAXI_EXPORT_FIELD_REQUIRED" });
      expect(() =>
        f.service.createMultiTaxiTripExportJob(command, rows, identity),
      ).toThrow("requires createMultiTaxiTripExportJobDurably");
      expect(f.stored.size).toBe(0);
    } finally {
      await f.service.onModuleDestroy();
    }
  });

  it("drains an admitted commit during shutdown and rejects subsequent durable requests", async () => {
    const f = queueFixture();
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered = false;
    f.control.before = async (sql) => {
      if (sql === "COMMIT") {
        entered = true;
        await barrier;
      }
    };
    const request = f.service.createMultiTaxiTripExportJobDurably(
      command,
      rows,
      identity,
    );
    await vi.waitFor(() => expect(entered).toBe(true));
    let stopped = false;
    const shutdown = f.service.onModuleDestroy().then(() => {
      stopped = true;
    });
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(stopped).toBe(false);
      await expect(
        f.service.createMultiTaxiTripExportJobDurably(command, rows, identity),
      ).rejects.toThrow("stopping");
    } finally {
      release();
      await request;
      await shutdown;
    }
    expect(f.stored.size).toBe(1);
    expect([...f.stored.values()][0]?.status).toBe("queued");
  });
});
