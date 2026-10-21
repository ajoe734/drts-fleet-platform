import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CreateFleetPartnerCommand,
  DriverRegistryRecord,
  FleetPartnerRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { FleetPartnerController } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.controller";
import { FleetPartnerRepository } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.repository";
import { FleetPartnerService } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.service";
import { SupplyReadinessService } from "../../../apps/api/src/modules/fleet-partner/supply-readiness.service";
import type { SupplySubmissionRepository } from "../../../apps/api/src/modules/fleet-partner/supply-submission.repository";
import type { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import type { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import type { VehicleEligibilityService } from "../../../apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.service";

afterEach(() => {
  vi.restoreAllMocks();
});

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function createInstance(
  repository?: FleetPartnerRepository,
  registryOverrides?: Partial<RegulatoryRegistryService>,
) {
  const audit = new AuditNotificationService();
  const billing = new BillingSettlementService(audit);
  const ownedMobility = {} as unknown as OwnedMobilityService;
  const regulatoryRegistry = {
    listDrivers: () => [],
    listVehicles: () => [],
    listSupplyPairs: () => [],
    ...registryOverrides,
  } as unknown as RegulatoryRegistryService;

  const service = new FleetPartnerService(
    billing,
    ownedMobility,
    regulatoryRegistry,
    repository,
  );
  const supplyReadiness = new SupplyReadinessService(
    service,
    regulatoryRegistry,
    {
      resolveRuntimeVehicleCapability: () => undefined,
    } as unknown as VehicleEligibilityService,
    {
      loadState: async () => ({
        submissions: [],
        driverDrafts: [],
        vehicleDrafts: [],
        documents: [],
        reviewEvents: [],
        vehicleAffiliations: [],
      }),
    } as unknown as SupplySubmissionRepository,
  );
  const controller = new FleetPartnerController(
    service,
    {} as ConstructorParameters<typeof FleetPartnerController>[1],
    {} as ConstructorParameters<typeof FleetPartnerController>[2],
    {} as ConstructorParameters<typeof FleetPartnerController>[3],
    supplyReadiness,
  );

  return { service, controller, supplyReadiness, audit };
}

function createSharedDbCluster() {
  const tables = new Map<
    string,
    Map<string, { record: unknown; active?: boolean; updatedAt: string }>
  >();
  let pendingWrite: ReturnType<typeof deferred> | undefined;

  const query = vi.fn(async (sql: string, values: readonly unknown[] = []) => {
    const insertTable = /INSERT INTO\s+(\S+)/.exec(sql)?.[1];
    if (insertTable) {
      const gate = pendingWrite;
      pendingWrite = undefined;
      if (gate) await gate.promise;
      const rows = tables.get(insertTable) ?? new Map();
      const id = String(values[0]);
      const record = JSON.parse(String(values.at(-1)));
      const active =
        insertTable === "admin.phase1_fleet_partners"
          ? Boolean(values[1])
          : undefined;
      const updatedAt =
        insertTable === "admin.phase1_fleet_partners"
          ? String(values[3])
          : new Date().toISOString();
      rows.set(id, { record: structuredClone(record), active, updatedAt });
      tables.set(insertTable, rows);
      return { rows: [], rowCount: 1 };
    }

    const selectTable = /FROM\s+(\S+)/.exec(sql)?.[1];
    const tableRows = tables.get(selectTable ?? "") ?? new Map();

    if (
      selectTable === "admin.phase1_fleet_partners" &&
      sql.includes("WHERE fleet_partner_id = $1 AND active = true")
    ) {
      const entry = tableRows.get(String(values[0]));
      const rows =
        entry && entry.active === true
          ? [{ record: structuredClone(entry.record) }]
          : [];
      return { rows, rowCount: rows.length };
    }

    if (
      selectTable === "admin.phase1_fleet_partners" &&
      sql.includes("WHERE fleet_partner_id = $1")
    ) {
      const entry = tableRows.get(String(values[0]));
      const rows = entry ? [{ record: structuredClone(entry.record) }] : [];
      return { rows, rowCount: rows.length };
    }

    if (
      selectTable === "admin.phase1_fleet_partners" &&
      sql.includes("multiTaxiOperatorIds")
    ) {
      const operatorIds = JSON.parse(String(values[0])) as string[];
      const rows = [...tableRows.values()]
        .map((entry) => entry.record as FleetPartnerRecord)
        .filter((partner) =>
          operatorIds.some((id) => partner.multiTaxiOperatorIds?.includes(id)),
        )
        .slice(0, 2)
        .map((record) => ({ record: structuredClone(record) }));
      return { rows, rowCount: rows.length };
    }

    const ordered = [...tableRows.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((entry) => ({ record: structuredClone(entry.record) }));
    return { rows: ordered, rowCount: ordered.length };
  });

  const makeNode = (
    registryOverrides?: Partial<RegulatoryRegistryService>,
  ) => {
    const repository = new FleetPartnerRepository({
      isEnabled: () => true,
      query,
    } as unknown as DatabaseService);
    const report = vi
      .spyOn(repository, "reportPersistenceFailure")
      .mockImplementation(() => {});
    const instance = createInstance(repository, registryOverrides);
    return { ...instance, repository, report };
  };

  return {
    tables,
    query,
    makeNode,
    delayNextWrite() {
      pendingWrite = deferred();
      return pendingWrite;
    },
    persistedFleetPartners(): FleetPartnerRecord[] {
      const rows = tables.get("admin.phase1_fleet_partners") ?? new Map();
      return [...rows.values()].map((entry) =>
        structuredClone(entry.record as FleetPartnerRecord),
      );
    },
  };
}

const createCommand: CreateFleetPartnerCommand = {
  legalName: " Canonical Fleet Co., Ltd. ",
  displayName: " Created on A ",
  businessRegistrationNo: " 88997766 ",
  contactName: " Warm A Contact ",
  contactPhone: " +886-2-5550-0199 ",
  active: true,
  partnershipType: "fleet_management",
  multiTaxiOperatorIds: ["op-canonical-001"],
};

describe("FLEET-MASTER-CANONICAL-READBACK-20261021: cross-instance canonical Fleet master CRUD", () => {
  it("resolves all 5 Root warm cross-instance business paths and 2 controls across Service and Controller envelopes", async () => {
    const cluster = createSharedDbCluster();
    const a = cluster.makeNode();
    const b = cluster.makeNode();
    await a.service.onModuleInit();
    await b.service.onModuleInit();

    // Control 1: A create ACK follows durable persistence
    const createdEnvelope = await a.controller.createFleetPartner(
      createCommand,
      "req-a-create",
    );
    const created = createdEnvelope.data;
    expect(created).toMatchObject({
      legalName: "Canonical Fleet Co., Ltd.",
      displayName: "Created on A",
      businessRegistrationNo: "88997766",
      contactName: "Warm A Contact",
      contactPhone: "+886-2-5550-0199",
      active: true,
      partnershipType: "fleet_management",
      multiTaxiOperatorIds: ["op-canonical-001"],
    });
    expect(
      cluster
        .persistedFleetPartners()
        .some((row) => row.fleetPartnerId === created.fleetPartnerId),
    ).toBe(true);

    // Root Failure 1 fixed: Warm B GET after A create
    const bGetCreated = await b.service.getFleetPartner(created.fleetPartnerId);
    expect(bGetCreated).toEqual(created);
    const bControllerGetCreated = await b.controller.getFleetPartner(
      created.fleetPartnerId,
      "req-b-get",
    );
    expect(bControllerGetCreated).toMatchObject({
      data: created,
      meta: { requestId: "req-b-get" },
    });

    // Root Failure 2 fixed: Warm B list after A create (including awaited controller list envelope)
    const bWarmForList = cluster.makeNode();
    await bWarmForList.service.onModuleInit();
    const bAnotherCreated = await a.service.createFleetPartner({
      ...createCommand,
      displayName: "Second Created on A",
      businessRegistrationNo: "88997767",
    });
    const bListed = await bWarmForList.service.listFleetPartners();
    expect(
      bListed.some(
        (row) => row.fleetPartnerId === bAnotherCreated.fleetPartnerId,
      ),
    ).toBe(true);
    const bListEnvelope = await bWarmForList.controller.listFleetPartners(
      "req-b-list",
    );
    expect(Array.isArray(bListEnvelope.data.items)).toBe(true);
    expect(
      bListEnvelope.data.items.some(
        (row) => row.fleetPartnerId === bAnotherCreated.fleetPartnerId,
      ),
    ).toBe(true);
    expect(bListEnvelope.data.pageInfo.totalItems).toBe(bListed.length);

    // Root Failure 3 fixed: Warm B update after A create (without B having read or listed first)
    const bWarmForUpdate = cluster.makeNode();
    await bWarmForUpdate.service.onModuleInit();
    const thirdCreatedOnA = await a.service.createFleetPartner({
      ...createCommand,
      displayName: "Third Created on A",
      businessRegistrationNo: "88997768",
    });
    const bUpdatedNew = await bWarmForUpdate.controller.updateFleetPartner(
      thirdCreatedOnA.fleetPartnerId,
      { displayName: " B edit " },
      "req-b-update-new",
    );
    expect(bUpdatedNew.data).toMatchObject({
      fleetPartnerId: thirdCreatedOnA.fleetPartnerId,
      legalName: "Canonical Fleet Co., Ltd.",
      displayName: "B edit",
      businessRegistrationNo: "88997768",
      contactName: "Warm A Contact",
      active: true,
    });

    // Root Failure 4 fixed: Warm B GET after A updates existing name and disables active=false
    await a.service.updateFleetPartner("fleet-demo-001", {
      displayName: "A canonical name",
      active: false,
    });
    const bReadDisabled = await b.service.getFleetPartner("fleet-demo-001");
    expect(bReadDisabled).toMatchObject({
      fleetPartnerId: "fleet-demo-001",
      displayName: "A canonical name",
      active: false,
    });
    const bControllerReadDisabled = await b.controller.getFleetPartner(
      "fleet-demo-001",
      "req-b-get-disabled",
    );
    expect(bControllerReadDisabled.data).toMatchObject({
      fleetPartnerId: "fleet-demo-001",
      displayName: "A canonical name",
      active: false,
    });

    // Root Failure 5 fixed: Stale Warm B contact-only partial update preserves A's canonical name and active=false
    const staleB = cluster.makeNode();
    await staleB.service.onModuleInit();
    await a.service.updateFleetPartner("fleet-demo-001", {
      displayName: "A latest canonical name",
      active: false,
    });
    // staleB has NOT called getFleetPartner or listFleetPartners since onModuleInit
    const staleBPatched = await staleB.service.updateFleetPartner(
      "fleet-demo-001",
      {
        contactName: "B contact-only edit",
      },
    );
    expect(staleBPatched).toMatchObject({
      fleetPartnerId: "fleet-demo-001",
      displayName: "A latest canonical name",
      active: false,
      contactName: "B contact-only edit",
    });
    const canonicalDemo = cluster
      .persistedFleetPartners()
      .find((row) => row.fleetPartnerId === "fleet-demo-001");
    expect(canonicalDemo).toMatchObject({
      fleetPartnerId: "fleet-demo-001",
      displayName: "A latest canonical name",
      active: false,
      contactName: "B contact-only edit",
    });

    // Control 2: New C init reads persisted new Fleet and latest canonical updates
    const c = cluster.makeNode();
    await c.service.onModuleInit();
    expect(
      (await c.service.getFleetPartner(created.fleetPartnerId)).fleetPartnerId,
    ).toBe(created.fleetPartnerId);
    expect(await c.service.getFleetPartner("fleet-demo-001")).toMatchObject({
      displayName: "A latest canonical name",
      active: false,
      contactName: "B contact-only edit",
    });
  });

  it("preserves sequential partial updates across multiple warm instances and returns 404 NOT_FOUND for unknown masters", async () => {
    const cluster = createSharedDbCluster();
    const a = cluster.makeNode();
    const b = cluster.makeNode();
    await a.service.onModuleInit();
    await b.service.onModuleInit();

    await a.service.updateFleetPartner("fleet-demo-001", {
      legalName: "Step 1 Legal Name",
      partnershipType: "business_dispatch_fleet",
    });
    await b.service.updateFleetPartner("fleet-demo-001", {
      contactPhone: "+886-2-7777-8888",
      multiTaxiOperatorIds: ["op-seq-1", "op-seq-2"],
    });
    await a.service.updateFleetPartner("fleet-demo-001", {
      active: false,
      displayName: "Step 3 Display Name",
    });
    const finalUpdated = await b.controller.updateFleetPartner(
      "fleet-demo-001",
      { businessRegistrationNo: "99887766" },
      "req-seq-4",
    );

    expect(finalUpdated.data).toEqual({
      fleetPartnerId: "fleet-demo-001",
      legalName: "Step 1 Legal Name",
      displayName: "Step 3 Display Name",
      businessRegistrationNo: "99887766",
      contactName: "Fleet Ops Lead",
      contactPhone: "+886-2-7777-8888",
      active: false,
      partnershipType: "business_dispatch_fleet",
      multiTaxiOperatorIds: ["op-seq-1", "op-seq-2"],
    });

    await expect(
      b.controller.getFleetPartner("fleet-missing-999"),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      response: {
        error: {
          code: "NOT_FOUND",
          details: { fleetPartnerId: "fleet-missing-999" },
        },
      },
    });
    await expect(
      b.controller.updateFleetPartner("fleet-missing-999", {
        displayName: "Cannot update missing",
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      response: {
        error: {
          code: "NOT_FOUND",
          details: { fleetPartnerId: "fleet-missing-999" },
        },
      },
    });
  });

  it("retains pending-write isolation, write-failure propagation without cache mutation, validation before SQL, and no-DB fallback", async () => {
    const cluster = createSharedDbCluster();
    const a = cluster.makeNode();
    const b = cluster.makeNode();
    await a.service.onModuleInit();
    await b.service.onModuleInit();

    // Pending create on A is not visible on warm B or A before SQL write resolves
    const createGate = cluster.delayNextWrite();
    let createSettled = false;
    const pendingCreate = a.service
      .createFleetPartner(createCommand)
      .then((res) => {
        createSettled = true;
        return res;
      });
    await tick();
    expect(createSettled).toBe(false);
    expect(await b.service.listFleetPartners()).toHaveLength(1);
    createGate.resolve();
    const created = await pendingCreate;
    expect((await b.service.getFleetPartner(created.fleetPartnerId)).displayName).toBe(
      "Created on A",
    );

    // Rejected update on A does not mutate A cache, B readback, or canonical store
    const updateGate = cluster.delayNextWrite();
    const writeError = new Error("simulated DB write failure");
    const failingUpdate = a.service
      .updateFleetPartner(created.fleetPartnerId, {
        displayName: "Uncommitted Name",
        active: false,
      })
      .then(
        (value) => ({ value }),
        (reason: unknown) => ({ reason }),
      );
    await tick();
    expect(
      await b.service.getFleetPartner(created.fleetPartnerId),
    ).toMatchObject({
      displayName: "Created on A",
      active: true,
    });
    updateGate.reject(writeError);
    expect(await failingUpdate).toEqual({ reason: writeError });
    expect(a.report).toHaveBeenCalledWith(writeError, "update fleet partner");
    expect(
      await a.service.getFleetPartner(created.fleetPartnerId),
    ).toMatchObject({
      displayName: "Created on A",
      active: true,
    });

    // Blank field validation rejects before any SQL query
    cluster.query.mockClear();
    await expect(
      b.service.updateFleetPartner(created.fleetPartnerId, {
        contactName: "   ",
      }),
    ).rejects.toBeInstanceOf(ApiRequestError);
    expect(cluster.query).not.toHaveBeenCalled();

    // Supported no-DB / disabled repository fallback
    const noDb = createInstance(new FleetPartnerRepository());
    await noDb.service.onModuleInit();
    const localCreated = await noDb.controller.createFleetPartner(
      createCommand,
      "req-local",
    );
    await noDb.controller.updateFleetPartner(
      localCreated.data.fleetPartnerId,
      { active: false, displayName: "Local Disabled" },
      "req-local-update",
    );
    expect(
      (await noDb.controller.getFleetPartner(localCreated.data.fleetPartnerId))
        .data,
    ).toMatchObject({
      displayName: "Local Disabled",
      active: false,
    });
  });

  it("propagates canonical master state to SupplyReadinessService and multi-taxi receipt operator consumers across warm instances", async () => {
    const cluster = createSharedDbCluster();
    const drivers: DriverRegistryRecord[] = [
      {
        driverId: "drv-demo-001",
        name: "Demo Driver 1",
        supportedServiceBuckets: ["standard_taxi"],
        workState: "available",
        licensesValid: true,
        lifecycleStatus: "active",
        eligibilityBlockedReasons: [],
        dispatchEligible: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        activatedAt: "2026-01-01T00:00:00.000Z",
        suspendedAt: null,
        retiredAt: null,
        profileUpdatedAt: "2026-01-01T00:00:00.000Z",
        deviceBindings: [],
      },
    ];
    const a = cluster.makeNode({ listDrivers: () => drivers });
    const b = cluster.makeNode({ listDrivers: () => drivers });
    await a.service.onModuleInit();
    await b.service.onModuleInit();

    // Warm B readiness initially sees active partner
    const readyBefore = await b.supplyReadiness.listFleetPartnerReadiness(
      "fleet-demo-001",
    );
    expect(readyBefore[0]?.reasonCodes).not.toContain("FLEET_PARTNER_INACTIVE");

    // Instance A soft-disables fleet-demo-001 and creates a new operator-mapped fleet
    await a.service.updateFleetPartner("fleet-demo-001", { active: false });
    const createdOperatorFleet = await a.service.createFleetPartner({
      ...createCommand,
      legalName: "Initial Receipt Legal Name",
      multiTaxiOperatorIds: ["op-receipt-777"],
    });

    // Warm B SupplyReadinessService immediately sees FLEET_PARTNER_INACTIVE without restart
    const readyAfterDisable = await b.supplyReadiness.listFleetPartnerReadiness(
      "fleet-demo-001",
    );
    expect(readyAfterDisable[0]?.reasonCodes).toContain(
      "FLEET_PARTNER_INACTIVE",
    );
    expect(readyAfterDisable[0]?.state).toBe("suspended");

    // Warm B SupplyReadinessService can also evaluate readiness for A's newly created fleet
    await expect(
      b.supplyReadiness.listFleetPartnerReadiness(
        createdOperatorFleet.fleetPartnerId,
      ),
    ).resolves.toEqual([]);

    // Warm B partial contact edit preserves A's multiTaxiOperatorIds and legalName for receipt lookup
    await b.service.updateFleetPartner(createdOperatorFleet.fleetPartnerId, {
      contactName: "Updated Receipt Contact",
    });
    const resolvedByOperator =
      await b.service.findFleetPartnerForMultiTaxiOperator("op-receipt-777");
    expect(resolvedByOperator).toMatchObject({
      fleetPartnerId: createdOperatorFleet.fleetPartnerId,
      legalName: "Initial Receipt Legal Name",
      contactName: "Updated Receipt Contact",
      multiTaxiOperatorIds: ["op-receipt-777"],
    });
    expect(await b.repository.findReceiptOperatorName("op-receipt-777")).toBe(
      "Initial Receipt Legal Name",
    );

    // Repository findFleetPartnerById returns inactive rows while findActiveFleetPartnerById filters active=true
    expect(
      await b.repository.findFleetPartnerById("fleet-demo-001"),
    ).toMatchObject({
      fleetPartnerId: "fleet-demo-001",
      active: false,
    });
    expect(
      await b.repository.findActiveFleetPartnerById("fleet-demo-001"),
    ).toBeNull();
  });

  it("also passes the exact duck-typed loadState/persistChanges repository port contract from Root reproduction", async () => {
    const seedService = new FleetPartnerService(
      {} as never,
      {} as never,
      {} as never,
    );
    const seedPartners = await seedService.listFleetPartners();
    const store = {
      fleetPartners: structuredClone(seedPartners),
      driverAffiliations: [],
      revenueShareRules: [],
      statements: [],
    };
    const repo = {
      isEnabled: () => true,
      loadState: async () => structuredClone(store),
      persistChanges: async (changes: Record<string, unknown[]>) => {
        for (const [key, rows] of Object.entries(changes)) {
          const idKey = {
            fleetPartners: "fleetPartnerId",
            driverAffiliations: "affiliationId",
            revenueShareRules: "ruleId",
            statements: "statementId",
          }[key];
          if (!idKey) continue;
          const bucket = store[key as keyof typeof store] as Record<
            string,
            unknown
          >[];
          for (const row of (rows ?? []) as Record<string, unknown>[]) {
            const index = bucket.findIndex(
              (candidate) => candidate[idKey] === row[idKey],
            );
            if (index < 0) bucket.push(structuredClone(row));
            else bucket[index] = structuredClone(row);
          }
        }
      },
      reportPersistenceFailure: (error: unknown) => {
        throw error;
      },
    } as unknown as FleetPartnerRepository;

    const fresh = () =>
      new FleetPartnerService({} as never, {} as never, {} as never, repo);
    const a = fresh();
    const b = fresh();
    await a.onModuleInit();
    await b.onModuleInit();

    const created = await a.createFleetPartner(createCommand);
    expect(
      store.fleetPartners.some(
        (r) => r.fleetPartnerId === created.fleetPartnerId,
      ),
    ).toBe(true);
    expect(
      (await b.getFleetPartner(created.fleetPartnerId)).fleetPartnerId,
    ).toBe(created.fleetPartnerId);
    expect(
      (await b.listFleetPartners()).some(
        (r) => r.fleetPartnerId === created.fleetPartnerId,
      ),
    ).toBe(true);
    expect(
      (
        await b.updateFleetPartner(created.fleetPartnerId, {
          displayName: "B edit",
        })
      ).displayName,
    ).toBe("B edit");

    await a.updateFleetPartner("fleet-demo-001", {
      displayName: "A canonical name",
      active: false,
    });
    expect(await b.getFleetPartner("fleet-demo-001")).toMatchObject({
      displayName: "A canonical name",
      active: false,
    });

    await b.updateFleetPartner("fleet-demo-001", {
      contactName: "B contact-only edit",
    });
    const canonical = store.fleetPartners.find(
      (r) => r.fleetPartnerId === "fleet-demo-001",
    );
    expect(canonical).toMatchObject({
      displayName: "A canonical name",
      active: false,
      contactName: "B contact-only edit",
    });

    const c = fresh();
    await c.onModuleInit();
    expect(
      (await c.getFleetPartner(created.fleetPartnerId)).fleetPartnerId,
    ).toBe(created.fleetPartnerId);
  });
});
