import { EventEmitter } from "node:events";
import { writeFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { TenantPartnerController } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryController } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.controller";
import { ContractOperationalViewService } from "../../../apps/api/src/modules/regulatory-registry/contract-operational-view.service";
import { persistenceHarness } from "../tenant-rules-sla-webhook-durable-flow-20261015/persistence-harness";
import {
  CommandSqlTransport,
  gate,
} from "../registry-contract-insurance-exclusivity-canonical-ack-flow-20261015/sql-transport";
const services: TenantPartnerService[] = [];
afterEach(() => {
  for (const s of services.splice(0)) s.onModuleDestroy();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function registry(db: CommandSqlTransport, tenant: TenantPartnerService) {
  const audit = new AuditNotificationService();
  const service = new RegulatoryRegistryService(
    new OpsDispatchEventsService(new EventEmitter() as never),
    audit,
    new DriverProfileService(audit),
    new RegulatoryRegistryRepository(db as never),
  );
  const view = new ContractOperationalViewService(service, tenant);
  return {
    service,
    view,
    controller: new RegulatoryRegistryController(service, view),
  };
}
async function replicas(withSla = true) {
  vi.useFakeTimers();
  vi.setSystemTime("2026-06-01T00:00:00.000Z");
  // Original immutable SQL boundary helper, actual original repository statements.
  // Repository has no cache; independent A/B services share this SQL authority.
  const sql = persistenceHarness();
  const aTenant = new TenantPartnerService(
    new AuditNotificationService(),
    sql.repository,
  );
  services.push(aTenant);
  const entry = await aTenant.createPlatformPartnerEntry({
    tenantId: "SIM-tenant-c134",
    partnerCode: "SIM_C134",
    partnerType: "enterprise_partner",
    programId: "SIM-program-before",
    entrySlug: "sim-c134-tenant-warm",
    displayName: "SIM C134",
    businessDispatchSubtype: "credit_card_airport_transfer",
    authMode: "tenant_portal_bearer",
    eligibilityMode: "none",
  });
  if (withSla)
    await aTenant.updateSlaProfile(entry.tenantId, {
      waitThresholdMin: 10,
      arrivalThresholdMin: 15,
      completionThresholdMin: 90,
    });
  const bTenant = new TenantPartnerService(
    new AuditNotificationService(),
    sql.repository,
  );
  services.push(bTenant);
  await aTenant.onModuleInit();
  await bTenant.onModuleInit();
  const db = new CommandSqlTransport();
  const a = registry(db, aTenant);
  db.seed({
    vehicles: a.service.listVehicles(),
    drivers: a.service.listDrivers(),
    supplyPairs: a.service.listSupplyPairs(),
    contracts: a.service.listContracts(),
    policies: a.service.listPolicies(),
    exclusivities: a.service.listExclusivities(),
  });
  db.enabled = true;
  const b = registry(db, bTenant);
  await a.service.onModuleInit();
  await b.service.onModuleInit();
  const id = (
    await a.controller.createContract({
      vehicleId: "veh-demo-001",
      partnerId: entry.partnerId,
      partnerType: "enterprise_partner",
      contractType: "service_fleet_contract",
      serviceScope: "business_dispatch",
      startAt: "2026-05-01T00:00:00.000Z",
      endAt: "2027-05-01T00:00:00.000Z",
    })
  ).data.contractId;
  return {
    a,
    b,
    aTenant,
    bTenant,
    sql,
    entry,
    id,
    aTenantController: new TenantPartnerController(
      aTenant,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ),
  };
}
describe("C134 actual TenantPartner changes to already started contract reader; SQL SIM", () => {
  it("B normal operational view reads A committed SLA thresholds without restart", async () => {
    const x = await replicas();
    expect(
      (await x.b.controller.getContractOperationalView(x.id)).data.slaProfile
        ?.targetResponseMinutes,
    ).toBe(10);
    await x.aTenantController.updateSlaProfile(
      { waitThresholdMin: 17, arrivalThresholdMin: 29 },
      null,
      x.entry.tenantId,
      "SIM-tenant-admin",
      "SIM-sla-request",
    );
    const committed = (await x.sql.repository.loadState()).slaProfiles.find(
      (p) => p.tenantId === x.entry.tenantId,
    );
    expect(committed).toMatchObject({
      waitThresholdMin: 17,
      arrivalThresholdMin: 29,
    });
    const a = (await x.a.controller.getContractOperationalView(x.id)).data;
    const b = (await x.b.controller.getContractOperationalView(x.id)).data;
    if (process.env.C134_OBSERVATION)
      writeFileSync(
        process.env.C134_OBSERVATION,
        JSON.stringify({ kind: "SLA", id: x.id, committed, a, b }, null, 2) +
          "\n",
      );
    expect(b.slaProfile).toEqual(a.slaProfile);
    expect(b.slaProfile).toMatchObject({
      targetResponseMinutes: 17,
      pickupWindowMinutes: 29,
    });
  });
  it("B original view and terms read the same normally updated partner-entry program and mode", async () => {
    const x = await replicas();
    const before = (await x.b.controller.getContractOperationalTerms(x.id))
      .data;
    expect(before.slaProfileCode).toBe("sla_SIM-program-before");
    const committed = await x.aTenant.updatePlatformPartnerEntry(
      x.entry.entrySlug,
      {
        programId: "SIM-program-after",
        authMode: "tenant_portal_bearer",
        eligibilityMode: "reference_required",
      },
    );
    expect(
      (await x.sql.repository.listPartnerEntries(x.entry.entrySlug))[0],
    ).toEqual(committed);
    const a = (await x.a.controller.getContractOperationalTerms(x.id)).data;
    const b = (await x.b.controller.getContractOperationalTerms(x.id)).data;
    if (process.env.C134_ENTRY_OBSERVATION)
      writeFileSync(
        process.env.C134_ENTRY_OBSERVATION,
        JSON.stringify({ id: x.id, committed, a, b }, null, 2) + "\n",
      );
    expect(b).toEqual(a);
    expect(b).toMatchObject({
      slaProfileCode: "sla_SIM-program-after",
      authMode: "tenant_portal_bearer",
    });
    expect(
      (await x.b.controller.getContractOperationalView(x.id)).data.authMode,
    ).toEqual({
      mode: "tenant_portal_bearer",
      eligibilityMode: "reference_required",
    });
  });
  it("does not fall back to warm entry or SLA values after canonical read failures", async () => {
    const x = await replicas();
    expect(
      x.bTenant
        .listPlatformPartnerEntries()
        .some((e) => e.entrySlug === x.entry.entrySlug),
    ).toBe(true);
    const entries = vi
      .spyOn(x.sql.repository, "listPartnerEntries")
      .mockRejectedValue(new Error("SIM canonical entries unavailable"));
    for (const read of [
      () => x.b.controller.getContractOperationalView(x.id),
      () => x.b.controller.getContractOperationalTerms(x.id),
      () => x.b.controller.getContract(x.id),
    ])
      await expect(read()).rejects.toThrow("SIM canonical entries unavailable");
    entries.mockRestore();
    const profile = vi
      .spyOn(x.sql.repository, "findSlaProfile")
      .mockRejectedValue(new Error("SIM canonical SLA unavailable"));
    for (const read of [
      () => x.b.controller.getContractOperationalView(x.id),
      () => x.b.controller.getContractOperationalTerms(x.id),
    ])
      await expect(read()).rejects.toThrow("SIM canonical SLA unavailable");
    profile.mockRestore();
    expect(x.bTenant.getSlaProfile(x.entry.tenantId).waitThresholdMin).toBe(10);
  });
  it("an empty canonical entry set does not resurrect the old local partner entry", async () => {
    const x = await replicas();
    // External canonical cleanup is SQL-boundary SIM, not a claimed new endpoint.
    for (const entry of await x.sql.repository.listPartnerEntries())
      await x.sql.query(
        "DELETE FROM admin.phase1_partner_channel_entries WHERE entry_slug = $1",
        [entry.entrySlug],
      );
    expect(await x.sql.repository.listPartnerEntries()).toEqual([]);
    expect(
      x.bTenant
        .listPlatformPartnerEntries()
        .some((e) => e.entrySlug === x.entry.entrySlug),
    ).toBe(true);
    const view = (await x.b.controller.getContractOperationalView(x.id)).data;
    const terms = (await x.b.controller.getContractOperationalTerms(x.id)).data;
    expect(view.authMode).toBeNull();
    expect(view.dataStatus.authMode).toBe("missing_data");
    expect(terms.authMode).toBeNull();
    expect(terms.slaProfileCode).not.toBe("sla_SIM-program-before");
    expect(view.slaProfile?.profileId).toBe("sla_enterprise_default");
  });
  it("an absent exact-tenant SLA is missing_data instead of another tenant profile or a fabricated default", async () => {
    const x = await replicas(false);
    await x.aTenant.updateSlaProfile("SIM-other-tenant", {
      waitThresholdMin: 88,
      arrivalThresholdMin: 99,
    });
    expect(
      (await x.sql.repository.loadState()).slaProfiles.some(
        (p) => p.tenantId === x.entry.tenantId,
      ),
    ).toBe(false);
    // The legacy sync default remains supported, but is not a canonical DB row.
    expect(x.bTenant.getSlaProfile(x.entry.tenantId).waitThresholdMin).toBe(10);
    const view = (await x.b.controller.getContractOperationalView(x.id)).data;
    expect(view.slaProfile).toBeNull();
    expect(view.dataStatus.slaProfile).toBe("missing_data");
    expect(
      (await x.b.controller.getContractOperationalTerms(x.id)).data
        .slaProfileCode,
    ).toBeNull();
  });
  it("a delayed entry read cannot overwrite a normal new local entry command", async () => {
    const x = await replicas();
    const entered = gate(),
      release = gate();
    const original = x.sql.repository.listPartnerEntries.bind(x.sql.repository);
    let hold = true;
    vi.spyOn(x.sql.repository, "listPartnerEntries").mockImplementation(
      async (slug) => {
        const snapshot = await original(slug);
        if (hold) {
          hold = false;
          entered.resolve();
          await release.promise;
        }
        return snapshot;
      },
    );
    const old = x.b.controller.getContractOperationalTerms(x.id);
    await entered.promise;
    try {
      await x.bTenant.updatePlatformPartnerEntry(x.entry.entrySlug, {
        programId: "SIM-concurrent-new",
      });
    } finally {
      release.resolve();
    }
    expect((await old).data.slaProfileCode).toBe("sla_SIM-program-before");
    expect(
      x.bTenant
        .listPlatformPartnerEntries()
        .find((e) => e.entrySlug === x.entry.entrySlug)?.programId,
    ).toBe("SIM-concurrent-new");
    expect(
      (await x.b.controller.getContractOperationalTerms(x.id)).data
        .slaProfileCode,
    ).toBe("sla_SIM-concurrent-new");
  });
  it("a delayed SLA read cannot overwrite a normal new local SLA command", async () => {
    const x = await replicas();
    const entered = gate(),
      release = gate();
    const original = x.sql.repository.findSlaProfile.bind(x.sql.repository);
    let hold = true;
    vi.spyOn(x.sql.repository, "findSlaProfile").mockImplementation(
      async (tenant) => {
        const snapshot = await original(tenant);
        if (hold) {
          hold = false;
          entered.resolve();
          await release.promise;
        }
        return snapshot;
      },
    );
    const old = x.b.controller.getContractOperationalView(x.id);
    await entered.promise;
    try {
      await x.bTenant.updateSlaProfile(x.entry.tenantId, {
        waitThresholdMin: 23,
        arrivalThresholdMin: 31,
      });
    } finally {
      release.resolve();
    }
    expect((await old).data.slaProfile?.targetResponseMinutes).toBe(10);
    expect(x.bTenant.getSlaProfile(x.entry.tenantId)).toMatchObject({
      waitThresholdMin: 23,
      arrivalThresholdMin: 31,
    });
    expect(
      (await x.b.controller.getContractOperationalView(x.id)).data.slaProfile,
    ).toMatchObject({ targetResponseMinutes: 23, pickupWindowMinutes: 31 });
  });
  it("uses one committed entry snapshot for the original scope check and projection", async () => {
    const x = await replicas();
    await x.aTenant.updatePlatformPartnerEntry(x.entry.entrySlug, {
      tenantId: "SIM-tenant-moved",
      programId: "SIM-moved-program",
    });
    await x.aTenant.updateSlaProfile("SIM-tenant-moved", {
      waitThresholdMin: 41,
      arrivalThresholdMin: 43,
    });
    const entries = vi.spyOn(x.sql.repository, "listPartnerEntries");
    const view = await x.b.controller.getContractOperationalView(
      x.id,
      "SIM-tenant-moved",
    );
    expect(entries).toHaveBeenCalledTimes(1);
    expect(view.data.slaProfile).toMatchObject({
      profileId: "sla_SIM-moved-program",
      targetResponseMinutes: 41,
    });
    entries.mockClear();
    await expect(
      x.b.controller.getContractOperationalView(x.id, x.entry.tenantId),
    ).rejects.toMatchObject({ status: 403 });
    expect(entries).toHaveBeenCalledTimes(1);
    await expect(
      x.b.controller.getContract(x.id, x.entry.tenantId),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("keeps disabled-DB synchronous rules, scope errors and detached read results", async () => {
    const tenant = new TenantPartnerService(new AuditNotificationService());
    services.push(tenant);
    const x = registry(new CommandSqlTransport(), tenant);
    const id = "contract-demo-001";
    const before = x.view.getOperationalView(id);
    expect((await x.controller.getContractOperationalView(id)).data).toEqual(
      before,
    );
    expect((await x.controller.getContractOperationalTerms(id)).data).toEqual(
      x.view.getOperationalTerms(id),
    );
    await expect(
      x.controller.getContractOperationalView(
        id,
        undefined,
        "SIM-wrong-partner",
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      x.controller.getContractOperationalView("SIM-no-contract"),
    ).rejects.toMatchObject({ status: 404 });
    const entries = await tenant.listPlatformPartnerEntriesFromPersistence();
    if (entries[0]) entries[0].programId = "SIM-client-change";
    expect(
      tenant
        .listPlatformPartnerEntries()
        .some((e) => e.programId === "SIM-client-change"),
    ).toBe(false);
  });
});
