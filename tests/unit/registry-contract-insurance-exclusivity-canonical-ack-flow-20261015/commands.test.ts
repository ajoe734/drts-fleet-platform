import { VehicleEligibilityService } from "../../../apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.service";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryController } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.controller";
import { CommandSqlTransport, gate } from "./sql-transport";
const now = "2026-05-01T00:00:00.000Z";
function setup() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  const db = new CommandSqlTransport();
  const audit = new AuditNotificationService();
  const events = new OpsDispatchEventsService(new EventEmitter() as never);
  const published = vi.spyOn(events, "publishSupplyLifecycleUpdated");
  const repository = new RegulatoryRegistryRepository(db as never);
  const service = new RegulatoryRegistryService(
    events,
    audit,
    new DriverProfileService(audit),
    repository,
  );
  const controller = new RegulatoryRegistryController(service);
  return { db, service, controller, repository, published };
}
function enable(f: ReturnType<typeof setup>) {
  f.db.seed({
    vehicles: f.service.listVehicles(),
    drivers: f.service.listDrivers(),
    supplyPairs: f.service.listSupplyPairs(),
    contracts: f.service.listContracts(),
    policies: f.service.listPolicies(),
    exclusivities: f.service.listExclusivities(),
  });
  f.db.enabled = true;
  f.published.mockClear();
}
afterEach(() => vi.useRealTimers());
describe("actual seven-command Registry ACK composition (SQL transport SIM)", () => {
  it("keeps approval envelope, eligibility and events pending until canonical ACK", async () => {
    const f = setup();
    await f.service.submitExclusivityReview("veh-demo-001", {
      declarationFileId: "file-reviewed",
    });
    enable(f);
    expect(
      f.service.getVehicleDispatchability("veh-demo-001", "standard_taxi"),
    ).toBe(false);
    f.db.writeGate = gate();
    let settled = false;
    const request = Promise.resolve(
      f.controller.approveExclusivity("veh-demo-001", {
        reviewerId: "manager",
        reviewedAt: now,
      }),
    ).finally(() => {
      settled = true;
    });
    await f.db.writeEntered.promise;
    const observed = {
      settled,
      eligible: f.service.getVehicleDispatchability(
        "veh-demo-001",
        "standard_taxi",
      ),
      events: f.published.mock.calls.length,
    };
    f.db.writeGate.resolve();
    await request;
    expect(observed).toEqual({ settled: false, eligible: false, events: 0 });
    expect(
      f.service.getVehicleDispatchability("veh-demo-001", "standard_taxi"),
    ).toBe(true);
  });
  it("rejects real coupled-row persistence failure without publishing approval", async () => {
    const f = setup();
    await f.service.submitExclusivityReview("veh-demo-001", {
      declarationFileId: "file-reviewed",
    });
    enable(f);
    f.db.failWriteTable = "reg.phase1_registry_exclusivities";
    const result = await Promise.resolve(
      f.controller.approveExclusivity("veh-demo-001", {
        reviewerId: "manager",
        reviewedAt: now,
      }),
    ).then(
      () => "success",
      () => "rejected",
    );
    expect(result).toBe("rejected");
    expect(
      f.service.getVehicleDispatchability("veh-demo-001", "standard_taxi"),
    ).toBe(false);
    expect(f.published).not.toHaveBeenCalled();
  });
  it("does not publish an uncommitted rejection as canonical revoke", async () => {
    const f = setup();
    enable(f);
    f.db.failWriteTable = "reg.phase1_registry_exclusivities";
    const result = await Promise.resolve(
      f.controller.rejectExclusivity("veh-demo-001", {
        reviewerId: "manager",
        reviewedAt: now,
        reason: "review failure",
      }),
    ).then(
      () => "success",
      () => "rejected",
    );
    expect(result).toBe("rejected");
    expect(
      f.service.getVehicleDispatchability("veh-demo-001", "standard_taxi"),
    ).toBe(true);
    expect(f.published).not.toHaveBeenCalled();
  });
});

type Fixture = ReturnType<typeof setup>;
const vehicleId = "veh-demo-001";
const newContract = {
  vehicleId,
  partnerId: "partner-reviewed",
  partnerType: "enterprise_partner",
  contractType: "service_fleet_contract",
  serviceScope: "standard_taxi",
  startAt: "2026-01-01T00:00:00.000Z",
  endAt: "2027-12-31T00:00:00.000Z",
};
const newPolicy = {
  vehicleId,
  policyNo: "RENEW-001",
  insuranceType: "passenger_liability",
  insurerName: "SIM insurer",
  coverageAmount: 3000000,
  startAt: "2026-01-01T00:00:00.000Z",
  endAt: "2027-12-31T00:00:00.000Z",
};
const commands = [
  {
    name: "createContract",
    family: "contracts",
    run: (f: Fixture) => f.controller.createContract(newContract),
  },
  {
    name: "activateContract",
    family: "contracts",
    run: (f: Fixture) =>
      f.controller.activateContract("contract-demo-001", {
        approvedBy: "manager",
        approvedAt: now,
      }),
  },
  {
    name: "createInsurancePolicy",
    family: "policies",
    run: (f: Fixture) => f.controller.createInsurancePolicy(newPolicy),
  },
  {
    name: "activateInsurancePolicy",
    family: "policies",
    run: (f: Fixture) =>
      f.controller.activateInsurancePolicy("policy-demo-001", {
        activatedAt: now,
      }),
  },
  {
    name: "submitExclusivityReview",
    family: "exclusivities",
    run: (f: Fixture) =>
      f.controller.submitExclusivityReview(vehicleId, {
        declarationFileId: "file-reviewed",
        exclusiveProviderName: "SIM provider",
      }),
  },
  {
    name: "approveExclusivity",
    family: "exclusivities",
    run: (f: Fixture) =>
      f.controller.approveExclusivity(vehicleId, {
        reviewerId: "manager",
        reviewedAt: now,
      }),
  },
  {
    name: "rejectExclusivity",
    family: "exclusivities",
    run: (f: Fixture) =>
      f.controller.rejectExclusivity(vehicleId, {
        reviewerId: "manager",
        reviewedAt: now,
        reason: "original rejection",
      }),
  },
] as const;
function canonical(f: Fixture) {
  return structuredClone(
    [...f.db.tables].map(([table, rows]) => [table, [...rows]]),
  );
}
async function restore(f: Fixture) {
  const audit = new AuditNotificationService();
  const service = new RegulatoryRegistryService(
    new OpsDispatchEventsService(new EventEmitter() as never),
    audit,
    new DriverProfileService(audit),
    new RegulatoryRegistryRepository(f.db as never),
  );
  await service.onModuleInit();
  return service;
}
describe("every actual command, canonical failures and immutable IDs", () => {
  it.each(commands)(
    "$name delays its envelope and leaves committed rows/cache untouched",
    async (command) => {
      const f = setup();
      enable(f);
      const prior = canonical(f);
      const previous = f.service
        .listVehicles()
        .find((v) => v.vehicleId === vehicleId);
      f.db.writeGate = gate();
      let settled = false;
      const request = command.run(f).finally(() => {
        settled = true;
      });
      await f.db.writeEntered.promise;
      expect(settled).toBe(false);
      expect(canonical(f)).toEqual(prior);
      expect(
        f.service.listVehicles().find((v) => v.vehicleId === vehicleId),
      ).toEqual(previous);
      expect(f.published).not.toHaveBeenCalled();
      f.db.writeGate.resolve();
      const response = await request;
      expect(response.meta.requestId).toBeTypeOf("string");
      expect(response.data).toBeDefined();
      const sql = f.db.queries;
      const writeClients = new Set(
        sql
          .filter((q) => q.sql.includes("INSERT INTO reg.phase1_registry_"))
          .map((q) => q.client),
      );
      expect([...writeClients]).toHaveLength(1);
      expect([...writeClients][0]).toBeGreaterThan(0);
      const client = [...writeClients][0];
      expect(sql.filter((q) => q.client === client).map((q) => q.sql)[0]).toBe(
        "BEGIN",
      );
      expect(
        sql
          .filter((q) => q.client === client)
          .map((q) => q.sql)
          .at(-1),
      ).toBe("COMMIT");
    },
  );
  it.each(commands)(
    "$name rejects coupled-source write failure and retains canonical state",
    async (command) => {
      const f = setup();
      enable(f);
      const prior = canonical(f);
      f.db.failWriteTable = `reg.phase1_registry_${command.family}`;
      await expect(command.run(f)).rejects.toMatchObject({
        code: "REGISTRY_COMMAND_NOT_ACKNOWLEDGED",
      });
      expect(canonical(f)).toEqual(prior);
      expect(f.published).not.toHaveBeenCalled();
      expect(f.db.queries.some((q) => q.sql === "ROLLBACK")).toBe(true);
    },
  );
  it.each(commands)(
    "$name resolves an applied COMMIT with lost ACK only from exact canonical readback",
    async (command) => {
      const f = setup();
      enable(f);
      f.db.loseCommitAck = true;
      const response = await command.run(f);
      expect(response.meta.requestId).toBeTypeOf("string");
      expect(f.db.queries.filter((q) => q.sql === "BEGIN")).toHaveLength(2);
      const fresh = await restore(f);
      expect(
        fresh
          .listContracts()
          .sort((a, b) => a.contractId.localeCompare(b.contractId)),
      ).toEqual(
        f.service
          .listContracts()
          .sort((a, b) => a.contractId.localeCompare(b.contractId)),
      );
      expect(
        fresh
          .listPolicies()
          .sort((a, b) => a.policyId.localeCompare(b.policyId)),
      ).toEqual(
        f.service
          .listPolicies()
          .sort((a, b) => a.policyId.localeCompare(b.policyId)),
      );
      expect(
        fresh
          .listExclusivities()
          .sort((a, b) => a.vehicleId.localeCompare(b.vehicleId)),
      ).toEqual(
        f.service
          .listExclusivities()
          .sort((a, b) => a.vehicleId.localeCompare(b.vehicleId)),
      );
    },
  );
  it("rolls back a coupled vehicle write failure and retries the same contract ID", async () => {
    const f = setup();
    const draft = await f.service.createContract({
      ...newContract,
      vehicleId: "veh-demo-002",
    });
    enable(f);
    const prior = canonical(f);
    f.db.failWriteTable = "reg.phase1_registry_vehicles";
    await expect(
      f.controller.activateContract(draft.contractId, {
        approvedBy: "manager",
        approvedAt: now,
      }),
    ).rejects.toBeDefined();
    expect(canonical(f)).toEqual(prior);
    f.db.failWriteTable = undefined;
    const fixed = await f.controller.activateContract(draft.contractId, {
      approvedBy: "manager",
      approvedAt: now,
    });
    expect(fixed.data.contractId).toBe(draft.contractId);
    expect(fixed.data.status).toBe("active");
    expect(
      f.db
        .records<{ contractId: string }>("contracts")
        .filter((c) => c.contractId === draft.contractId),
    ).toHaveLength(1);
  });
  it("rejects a known COMMIT failure with unchanged canonical rows and lawful retry", async () => {
    const f = setup();
    await f.service.submitExclusivityReview(vehicleId, {
      declarationFileId: "file-reviewed",
    });
    enable(f);
    const prior = canonical(f);
    f.db.rejectCommit = true;
    await expect(
      f.controller.approveExclusivity(vehicleId, {
        reviewerId: "manager",
        reviewedAt: now,
      }),
    ).rejects.toBeDefined();
    expect(canonical(f)).toEqual(prior);
    expect(
      f.service.getVehicleDispatchability(vehicleId, "standard_taxi"),
    ).toBe(false);
    await f.controller.approveExclusivity(vehicleId, {
      reviewerId: "manager",
      reviewedAt: now,
    });
    expect(
      f.service.getVehicleDispatchability(vehicleId, "standard_taxi"),
    ).toBe(true);
  });
  it("keeps ordinary no-DB commands, effective windows and declaration-null behavior", async () => {
    const f = setup();
    const created = await f.controller.createContract(newContract);
    expect(created.data.status).toBe("draft");
    const active = await f.controller.activateContract(
      created.data.contractId,
      { approvedAt: now },
    );
    expect(active.data.contractId).toBe(created.data.contractId);
    const approved = await f.controller.approveExclusivity("veh-demo-003", {
      reviewedAt: now,
    });
    expect(approved.data.declarationFileId).toBeNull();
    expect(approved.data.reviewStatus).toBe("approved");
    expect(f.db.queries).toHaveLength(0);
  });
  it("keeps one declaration per vehicle and preserves lawful replacement and prior rejection", async () => {
    const f = setup();
    enable(f);
    await f.controller.rejectExclusivity(vehicleId, {
      reason: "reject first",
      reviewedAt: now,
    });
    expect(
      f.service.getVehicleDispatchability(vehicleId, "standard_taxi"),
    ).toBe(false);
    const replaced = await f.controller.submitExclusivityReview(vehicleId, {
      declarationFileId: "replacement",
      exclusiveProviderName: "replacement provider",
      effectiveStart: now,
      effectiveEnd: "2026-12-31T00:00:00.000Z",
    });
    expect(replaced.data.terminationReason).toBeNull();
    expect(replaced.data.reviewStatus).toBe("pending");
    await f.controller.approveExclusivity(vehicleId, { reviewedAt: now });
    expect(
      f.db
        .records<{ vehicleId: string }>("exclusivities")
        .filter((e) => e.vehicleId === vehicleId),
    ).toHaveLength(1);
    expect(
      f.service.getVehicleDispatchability(vehicleId, "standard_taxi"),
    ).toBe(true);
    const fresh = await restore(f);
    expect(fresh.getVehicleDispatchability(vehicleId, "standard_taxi")).toBe(
      true,
    );
  });
});

const order = {
  serviceBucket: "standard_taxi" as const,
  businessDispatchSubtype: null,
  serviceProductCode: null,
};
function healthy(service: RegulatoryRegistryService) {
  expect(service.getDriverAvailability("drv-demo-001", "standard_taxi")).toBe(
    true,
  );
  expect(service.getVehicleDispatchability(vehicleId, "standard_taxi")).toBe(
    true,
  );
  expect(
    service
      .getEligibleCandidates("standard_taxi")
      .some((c) => c.vehicleId === vehicleId && c.driverId === "drv-demo-001"),
  ).toBe(true);
  expect(() =>
    new VehicleEligibilityService(service).assertDispatchAssignmentEligible(
      order,
      vehicleId,
      "drv-demo-001",
    ),
  ).not.toThrow();
}
function blocked(service: RegulatoryRegistryService) {
  expect(service.getDriverAvailability("drv-demo-001", "standard_taxi")).toBe(
    true,
  );
  expect(service.getVehicleDispatchability(vehicleId, "standard_taxi")).toBe(
    false,
  );
  expect(
    service
      .getEligibleCandidates("standard_taxi")
      .some((c) => c.vehicleId === vehicleId),
  ).toBe(false);
  expect(() =>
    new VehicleEligibilityService(service).assertDispatchAssignmentEligible(
      order,
      vehicleId,
      "drv-demo-001",
    ),
  ).toThrow();
}
describe("real healthy supply, restart, uncertain outcome and lawful transitions", () => {
  it.each(["contract", "policy"] as const)(
    "%s renewal keeps only committed qualification through reject/retry/fresh restore",
    async (family) => {
      const f = setup();
      enable(f);
      healthy(f.service);
      if (family === "contract")
        await f.repository.persistChanges({
          contracts: f.service
            .listContracts()
            .filter((c) => c.vehicleId === vehicleId)
            .map((c) => ({ ...c, status: "draft", lifecycleStatus: "draft" })),
        });
      else
        await f.repository.persistChanges({
          policies: f.service
            .listPolicies()
            .filter((p) => p.vehicleId === vehicleId)
            .map((p) => ({
              ...p,
              status: "pending",
              lifecycleStatus: "pending",
            })),
        });
      const service = await restore(f);
      blocked(service);
      const controller = new RegulatoryRegistryController(service);
      f.db.writeEntered = gate();
      f.db.writeGate = gate();
      f.db.failWriteTable = `reg.phase1_registry_${family === "contract" ? "contracts" : "policies"}`;
      const activate = () =>
        family === "contract"
          ? controller.activateContract("contract-demo-001", {
              approvedBy: "manager",
              approvedAt: now,
            })
          : controller.activateInsurancePolicy("policy-demo-001", {
              activatedAt: now,
            });
      const pending = activate().then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      await f.db.writeEntered.promise;
      blocked(service);
      f.db.writeGate.resolve();
      expect(await pending).toHaveProperty("error");
      blocked(service);
      blocked(await restore(f));
      f.db.failWriteTable = undefined;
      await activate();
      healthy(service);
      healthy(await restore(f));
    },
  );
  it("keeps an unconfirmed created record unpublished and exposes its original ID for canonical recovery", async () => {
    const f = setup();
    enable(f);
    const before = f.service.listContracts();
    f.db.loseCommitAck = true;
    f.db.failReadAfterLostAck = true;
    const failure = await f.controller.createContract(newContract).then(
      () => {
        throw Error("must reject unknown outcome");
      },
      (error) => error,
    );
    expect(failure.code).toBe("REGISTRY_COMMAND_NOT_ACKNOWLEDGED");
    expect(f.service.listContracts()).toEqual(before);
    const id = failure.getResponse().error.details.recordId;
    expect(id).toMatch(/^contract_/);
    expect(
      f.db
        .records<{ contractId: string }>("contracts")
        .filter((c) => c.contractId === id),
    ).toHaveLength(1);
    f.db.failRead = false;
    const service = await restore(f);
    expect(
      service.listContracts().find((c) => c.contractId === id),
    ).toMatchObject({ status: "draft" });
    await new RegulatoryRegistryController(service).activateContract(id, {
      approvedAt: now,
    });
    expect(
      f.db
        .records<{ contractId: string }>("contracts")
        .filter((c) => c.contractId === id),
    ).toHaveLength(1);
  });
  it("does not invent same-body create deduplication", async () => {
    const f = setup();
    enable(f);
    const first = await f.controller.createInsurancePolicy(newPolicy);
    const second = await f.controller.createInsurancePolicy(newPolicy);
    expect(second.data.policyId).not.toBe(first.data.policyId);
    expect(
      f.db
        .records<{ policyId: string }>("policies")
        .filter((p) =>
          [first.data.policyId, second.data.policyId].includes(p.policyId),
        ),
    ).toHaveLength(2);
  });
  it("preserves a newer competing lawful rejection when older approval COMMIT ACK is lost", async () => {
    const f = setup();
    await f.service.submitExclusivityReview(vehicleId, {
      declarationFileId: "file-reviewed",
    });
    enable(f);
    const other = await restore(f);
    f.db.writeGate = gate();
    f.db.writeEntered = gate();
    f.db.lockQueued = gate();
    f.db.loseCommitAck = true;
    const old = f.controller
      .approveExclusivity(vehicleId, {
        reviewerId: "old-manager",
        reviewedAt: now,
      })
      .then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
    await f.db.writeEntered.promise;
    const newer = new RegulatoryRegistryController(other).rejectExclusivity(
      vehicleId,
      {
        reviewerId: "new-manager",
        reviewedAt: now,
        reason: "new lawful rejection",
      },
    );
    await f.db.lockQueued.promise;
    f.db.writeGate.resolve();
    const [older, newest] = await Promise.all([old, newer]);
    expect(older).toHaveProperty("error");
    expect(newest.data.reviewStatus).toBe("rejected");
    expect(
      f.db
        .records<{
          vehicleId: string;
          reviewStatus: string;
          reviewerId: string;
        }>("exclusivities")
        .find((e) => e.vehicleId === vehicleId),
    ).toMatchObject({ reviewStatus: "rejected", reviewerId: "new-manager" });
    blocked(f.service);
    blocked(await restore(f));
  });
  it("retains explicit manual hold while legitimate canonical renewal completes", async () => {
    const f = setup();
    f.service.updateVehicleCompliance(vehicleId, { dispatchableFlag: false });
    enable(f);
    await f.controller.activateInsurancePolicy("policy-demo-001", {
      activatedAt: now,
    });
    blocked(f.service);
    expect(
      f.service.listVehicles().find((v) => v.vehicleId === vehicleId)
        ?.supplyLifecycle.dispatch.blockedReasons,
    ).toContain("manual_hold");
    blocked(await restore(f));
  });
  it.each(["contract", "policy"] as const)(
    "%s expiry cannot be waived by activation/approval",
    async (family) => {
      const f = setup();
      enable(f);
      if (family === "contract")
        await f.controller.activateContract("contract-demo-001", {
          approvedAt: "2027-02-01T00:00:00.000Z",
        });
      else
        await f.controller.activateInsurancePolicy("policy-demo-001", {
          activatedAt: "2027-02-01T00:00:00.000Z",
        });
      // The original rules evaluate against the supplied activation time and on
      // later reads against wall-clock; move that same real clock to expiry.
      vi.setSystemTime("2027-02-01T00:00:00.000Z");
      blocked(f.service);
      blocked(await restore(f));
    },
  );
});

it("does not turn a rejected write into ACK just because an identical same-ID state already exists", async () => {
  const f = setup();
  enable(f);
  const command = { approvedBy: "manager", approvedAt: now };
  await f.controller.activateContract("contract-demo-001", command);
  const prior = canonical(f);
  f.db.failWriteTable = "reg.phase1_registry_contracts";
  await expect(
    f.controller.activateContract("contract-demo-001", command),
  ).rejects.toMatchObject({ code: "REGISTRY_COMMAND_NOT_ACKNOWLEDGED" });
  expect(canonical(f)).toEqual(prior);
  f.db.failWriteTable = undefined;
  expect(
    (await f.controller.activateContract("contract-demo-001", command)).data
      .contractId,
  ).toBe("contract-demo-001");
});
it.each([
  "begin",
  "rollback",
  "release",
  "known-commit-rejection",
  "known-constraint-commit-rejection",
] as const)(
  "propagates an actual %s failure instead of treating matching canonical state as command ACK",
  async (phase) => {
    const f = setup();
    enable(f);
    const command = { approvedBy: "manager", approvedAt: now };
    await f.controller.activateContract("contract-demo-001", command);
    f.published.mockClear();
    if (phase === "begin") f.db.failBegin = true;
    if (phase === "rollback") {
      f.db.failRollback = true;
      f.db.rejectCommit = true;
    }
    if (phase === "release") f.db.failRelease = true;
    if (phase === "known-commit-rejection") f.db.rejectCommit = true;
    if (phase === "known-constraint-commit-rejection") {
      f.db.rejectCommit = true;
      f.db.commitRejectCode = "23503";
    }
    await expect(
      f.controller.activateContract("contract-demo-001", command),
    ).rejects.toBeDefined();
    expect(f.published).not.toHaveBeenCalled();
  },
);
it("uses the existing hydration convention for canonical rows predating lifecycle metadata", async () => {
  const f = setup();
  enable(f);
  const table = f.db.tables.get("reg.phase1_registry_vehicles")!;
  const original = table.get(vehicleId) as Record<string, unknown>;
  const legacy = { ...original };
  delete legacy.supplyLifecycle;
  delete legacy.createdAt;
  table.set(vehicleId, legacy);
  await f.controller.activateContract("contract-demo-001", {
    approvedBy: "manager",
    approvedAt: now,
  });
  healthy(f.service);
  healthy(await restore(f));
  expect(
    f.db
      .records<{ vehicleId: string; createdAt: string }>("vehicles")
      .find((v) => v.vehicleId === vehicleId)?.createdAt,
  ).toBe(original.updatedAt);
});
