import { EventEmitter } from "node:events";
import { writeFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { RegulatoryRegistryController } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.controller";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { ContractOperationalViewService } from "../../../apps/api/src/modules/regulatory-registry/contract-operational-view.service";
import {
  CommandSqlTransport,
  gate,
} from "../registry-contract-insurance-exclusivity-canonical-ack-flow-20261015/sql-transport";

function instance(db: CommandSqlTransport) {
  const audit = new AuditNotificationService();
  const repository = new RegulatoryRegistryRepository(db as never);
  const service = new RegulatoryRegistryService(
    new OpsDispatchEventsService(new EventEmitter() as never),
    audit,
    new DriverProfileService(audit),
    repository,
  );
  const views = new ContractOperationalViewService(service);
  return {
    repository,
    service,
    views,
    controller: new RegulatoryRegistryController(service, views),
  };
}
async function replicas() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime("2026-06-01T00:00:00.000Z");
  const db = new CommandSqlTransport();
  const a = instance(db);
  db.seed({
    vehicles: a.service.listVehicles(),
    drivers: a.service.listDrivers(),
    supplyPairs: a.service.listSupplyPairs(),
    contracts: a.service.listContracts(),
    policies: a.service.listPolicies(),
    exclusivities: a.service.listExclusivities(),
  });
  db.enabled = true;
  const b = instance(db);
  await a.service.onModuleInit();
  await b.service.onModuleInit();
  return { a, b, db };
}
const command = {
  vehicleId: "veh-demo-001",
  partnerId: "SIM-c134-owner",
  partnerType: "enterprise_partner",
  contractType: "service_fleet_contract",
  serviceScope: "business_dispatch",
  startAt: "2026-05-01T00:00:00.000Z",
  endAt: "2027-05-01T00:00:00.000Z",
};
async function observe<T>(read: () => T | Promise<T>) {
  try {
    return { value: await read(), error: null };
  } catch (error) {
    const e = error as { getResponse(): unknown; getStatus(): number };
    return {
      value: null,
      error: { status: e.getStatus(), body: e.getResponse() },
    };
  }
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe("C134 normal contract readback across already started instances (SQL transport SIM)", () => {
  it("reads the same newly committed contract in list, detail, operational view and terms without restarting B", async () => {
    const { a, b, db } = await replicas();
    const created = await a.controller.createContract(command);
    const id = created.data.contractId;
    const committed = db
      .records<{ contractId: string; serviceScope: string }>("contracts")
      .find((x) => x.contractId === id);
    expect(committed).toMatchObject({
      contractId: id,
      serviceScope: "business_dispatch",
    });
    const listed = await b.controller.listContracts();
    const detail = await observe(() => b.controller.getContract(id));
    const view = await observe(() =>
      b.controller.getContractOperationalView(id),
    );
    const terms = await observe(() =>
      b.controller.getContractOperationalTerms(id),
    );
    const observation = {
      id,
      committed,
      listedIds: listed.data.items.map((x) => x.contractId),
      detail,
      view,
      terms,
    };
    if (process.env.C134_OBSERVATIONS)
      writeFileSync(
        process.env.C134_OBSERVATIONS,
        JSON.stringify(observation, null, 2) + "\n",
      );
    expect({
      listed: listed.data.items.some((x) => x.contractId === id),
      detail: detail.value?.data.contractId ?? null,
      view: view.value?.data.contractId ?? null,
      terms: terms.value?.data.contractId ?? null,
    }).toEqual({ listed: true, detail: id, view: id, terms: id });
    expect(view.value?.data.waitingRule?.gracePeriodMinutes).toBe(15);
    expect(terms.value?.data.waitingRuleMinutes).toBe(15);
    expect(view.value?.data).toEqual(a.views.getOperationalView(id));
    expect(terms.value?.data).toEqual(a.views.getOperationalTerms(id));
  });
  it("shows the later normal activation in B without publishing a read into its command cache", async () => {
    const { a, b } = await replicas();
    const created = await a.controller.createContract(command);
    const id = created.data.contractId;
    expect((await b.controller.getContract(id)).data.status).toBe("draft");
    vi.setSystemTime("2026-06-01T01:00:00.000Z");
    const activated = await a.controller.activateContract(id, {
      approvedBy: "SIM-c134-manager",
      approvedAt: new Date().toISOString(),
    });
    expect(activated.data.status).toBe("active");
    expect((await b.controller.getContract(id)).data).toEqual(activated.data);
    expect(
      (await b.controller.listContracts()).data.items.find(
        (x) => x.contractId === id,
      )?.status,
    ).toBe("active");
    const view = (await b.controller.getContractOperationalView(id)).data;
    const terms = (await b.controller.getContractOperationalTerms(id)).data;
    expect(view.effectiveVersion?.effectiveFrom).toBe(activated.data.updatedAt);
    expect(terms.effectiveVersion).toBe(view.effectiveVersion?.versionTag);
    expect(b.service.listContracts().some((x) => x.contractId === id)).toBe(
      false,
    );
  });
  it("propagates canonical read failure instead of presenting the old warm snapshot as current", async () => {
    const { b, db } = await replicas();
    expect(b.service.listContracts()).not.toHaveLength(0);
    db.failRead = true;
    for (const read of [
      () => b.controller.listContracts(),
      () => b.controller.getContract("contract-demo-001"),
      () => b.controller.getContractOperationalView("contract-demo-001"),
      () => b.controller.getContractOperationalTerms("contract-demo-001"),
    ]) {
      await expect(read()).rejects.toThrow("SIM canonical read unavailable");
    }
  });
  it("does not let delayed old list or detail reads erase a newly committed local command", async () => {
    const { b, db } = await replicas();
    const entered = gate();
    const release = gate();
    let count = 0;
    let hold = true;
    const original = db.query.bind(db);
    vi.spyOn(db, "query").mockImplementation(
      async <T extends Record<string, unknown>>(
        sql: string,
        values: readonly unknown[] = [],
      ) => {
        const snapshot = await original<T>(sql, values);
        if (hold && /FROM\s+reg\.phase1_registry_contracts\b/.test(sql)) {
          count += 1;
          if (count === 2) entered.resolve();
          await release.promise;
        }
        return snapshot;
      },
    );
    const oldList = b.controller.listContracts();
    const oldDetail = b.controller.getContract("contract-demo-001");
    await entered.promise;
    hold = false;
    let id: string;
    try {
      id = (await b.controller.createContract(command)).data.contractId;
    } finally {
      release.resolve();
    }
    const [list, detail] = await Promise.all([oldList, oldDetail]);
    expect(list.data.items.some((x) => x.contractId === id)).toBe(false);
    expect(detail.data.contractId).toBe("contract-demo-001");
    expect(b.service.listContracts().some((x) => x.contractId === id)).toBe(
      true,
    );
    expect((await b.controller.getContract(id)).data.contractId).toBe(id);
  });
  it("retains disabled-database read values, original scope errors and detached contract records", async () => {
    const b = instance(new CommandSqlTransport());
    const expected = b.service.listContracts();
    expect((await b.controller.listContracts()).data.items).toEqual(expected);
    const id = "contract-demo-001";
    expect((await b.controller.getContractOperationalView(id)).data).toEqual(
      b.views.getOperationalView(id),
    );
    expect((await b.controller.getContractOperationalTerms(id)).data).toEqual(
      b.views.getOperationalTerms(id),
    );
    const detail = (await b.controller.getContract(id)).data;
    detail.partnerId = "SIM-edited-client-copy";
    expect((await b.controller.getContract(id)).data.partnerId).not.toBe(
      detail.partnerId,
    );
    const missing = await observe(() =>
      b.controller.getContract("SIM-no-such-contract"),
    );
    expect(missing.error).toMatchObject({
      status: 404,
      body: { error: { code: "CONTRACT_OPERATIONAL_VIEW_NOT_FOUND" } },
    });
    const scope = await observe(() =>
      b.controller.getContract(id, undefined, "SIM-wrong-partner"),
    );
    expect(scope.error).toMatchObject({
      status: 403,
      body: { error: { code: "CONTRACT_OPERATIONAL_SCOPE_FORBIDDEN" } },
    });
  });
});
