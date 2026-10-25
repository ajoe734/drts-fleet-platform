import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CreateDriverFleetAffiliationCommand,
  CreateFleetPartnerCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { FleetPartnerController } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.controller";
import { FleetPartnerRepository } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.repository";
import { FleetPartnerService } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.service";
import { SupplyReadinessService } from "../../../apps/api/src/modules/fleet-partner/supply-readiness.service";
import { SupplySubmissionRepository } from "../../../apps/api/src/modules/fleet-partner/supply-submission.repository";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { VehicleEligibilityService } from "../../../apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.service";

const { EventEmitter2 } = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
)("@nestjs/event-emitter");

const partnerId = "fleet-owned-affiliation-cross-warm";
const liveDriverId = "drv-demo-001";
const secondDriverId = "drv-demo-002";

const ownedPartnerFixture = {
  fleetPartnerId: partnerId,
  legalName: "Owned Fleet Fixture",
  displayName: "Owned Fleet Fixture",
  businessRegistrationNo: "QA-OWNED-FLEET",
  contactName: "Owned fixture",
  contactPhone: "0000000000",
  active: true,
  partnershipType: "fleet_management" as const,
  multiTaxiOperatorIds: [] as string[],
};

const createPartnerCommand: CreateFleetPartnerCommand = {
  legalName: "Cross Instance Fleet Co., Ltd.",
  displayName: "Cross Instance Fleet",
  businessRegistrationNo: "55667788",
  contactName: "Warm Ops",
  contactPhone: "+886-2-5550-0199",
  partnershipType: "fleet_management",
};

const affiliationCommand: CreateDriverFleetAffiliationCommand = {
  fleetPartnerId: partnerId,
  affiliationType: "managed_by",
  effectiveFrom: "2026-01-15T00:00:00.000Z",
  effectiveUntil: null,
  driverGroupId: "warm-cross-instance-group",
};

const activeEvents: OpsDispatchEventsService[] = [];

afterEach(async () => {
  while (activeEvents.length > 0) {
    const events = activeEvents.pop();
    if (events) {
      await events.onModuleDestroy();
    }
  }
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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

function createCanonicalPostgresSimulator(seedOwnedPartner = true) {
  const fleetPartners = new Map<
    string,
    { updatedAt: string; active: boolean; record: unknown }
  >();
  if (seedOwnedPartner) {
    fleetPartners.set(ownedPartnerFixture.fleetPartnerId, {
      active: ownedPartnerFixture.active,
      updatedAt: "2026-01-01T00:00:00.000Z",
      record: structuredClone(ownedPartnerFixture),
    });
  }
  const driverAffiliations = new Map<
    string,
    {
      fleetPartnerId: string;
      driverId: string;
      updatedAt: string;
      record: unknown;
    }
  >();
  const revenueShareRules = new Map<
    string,
    { updatedAt: string; record: unknown }
  >();
  const statements = new Map<string, { updatedAt: string; record: unknown }>();
  const emptyTables = new Set([
    "fleet.supply_submissions",
    "fleet.driver_supply_drafts",
    "fleet.vehicle_supply_drafts",
    "fleet.supply_documents",
    "fleet.supply_review_events",
    "fleet.vehicle_fleet_affiliations",
  ]);

  let pendingInsertGate:
    | { table: string; gate: ReturnType<typeof deferred> }
    | undefined;

  const query = vi.fn(async (sql: string, values: readonly unknown[] = []) => {
    const normalized = sql.replace(/\s+/g, " ").trim();

    if (
      normalized === "BEGIN" ||
      normalized === "COMMIT" ||
      normalized === "ROLLBACK" ||
      normalized.startsWith("SELECT pg_advisory_xact_lock(") ||
      normalized.startsWith(
        "DELETE FROM billing.phase1_fleet_partner_statements",
      )
    ) {
      return { rows: [], rowCount: 0 };
    }

    if (
      normalized.startsWith(
        "INSERT INTO billing.phase1_fleet_partner_statements",
      )
    ) {
      statements.set(String(values[0]), {
        updatedAt: String(values[12]),
        record: JSON.parse(String(values[13])),
      });
      return { rows: [], rowCount: 1 };
    }

    if (normalized.startsWith("INSERT INTO admin.phase1_fleet_partners")) {
      if (pendingInsertGate?.table === "admin.phase1_fleet_partners") {
        const gate = pendingInsertGate.gate;
        pendingInsertGate = undefined;
        await gate.promise;
      }
      fleetPartners.set(String(values[0]), {
        active: Boolean(values[1]),
        updatedAt: String(values[3]),
        record: JSON.parse(String(values[4])),
      });
      return { rows: [], rowCount: 1 };
    }

    if (
      normalized.startsWith(
        "INSERT INTO admin.phase1_driver_fleet_affiliations",
      )
    ) {
      if (
        pendingInsertGate?.table === "admin.phase1_driver_fleet_affiliations"
      ) {
        const gate = pendingInsertGate.gate;
        pendingInsertGate = undefined;
        await gate.promise;
      }
      driverAffiliations.set(String(values[0]), {
        fleetPartnerId: String(values[1]),
        driverId: String(values[2]),
        updatedAt: String(values[6]),
        record: JSON.parse(String(values[7])),
      });
      return { rows: [], rowCount: 1 };
    }

    if (
      normalized.startsWith(
        "INSERT INTO billing.phase1_fleet_partner_revenue_share_rules",
      )
    ) {
      revenueShareRules.set(String(values[0]), {
        updatedAt: String(values[6]),
        record: JSON.parse(String(values[7])),
      });
      return { rows: [], rowCount: 1 };
    }

    if (
      normalized ===
      "SELECT record FROM admin.phase1_fleet_partners WHERE fleet_partner_id = $1"
    ) {
      const hit = fleetPartners.get(String(values[0]));
      return {
        rows: hit ? [{ record: structuredClone(hit.record) }] : [],
        rowCount: hit ? 1 : 0,
      };
    }

    if (
      normalized ===
      "SELECT record FROM admin.phase1_fleet_partners WHERE fleet_partner_id = $1 AND active = true"
    ) {
      const hit = fleetPartners.get(String(values[0]));
      return {
        rows:
          hit && hit.active ? [{ record: structuredClone(hit.record) }] : [],
        rowCount: hit && hit.active ? 1 : 0,
      };
    }

    if (
      normalized ===
      "SELECT record FROM admin.phase1_fleet_partners ORDER BY updated_at DESC"
    ) {
      const rows = [...fleetPartners.values()]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map((entry) => ({ record: structuredClone(entry.record) }));
      return { rows, rowCount: rows.length };
    }

    if (
      normalized ===
      "SELECT record FROM admin.phase1_driver_fleet_affiliations ORDER BY updated_at DESC"
    ) {
      const rows = [...driverAffiliations.values()]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map((entry) => ({ record: structuredClone(entry.record) }));
      return { rows, rowCount: rows.length };
    }

    if (
      normalized ===
      "SELECT record FROM billing.phase1_fleet_partner_revenue_share_rules ORDER BY updated_at DESC"
    ) {
      const rows = [...revenueShareRules.values()]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map((entry) => ({ record: structuredClone(entry.record) }));
      return { rows, rowCount: rows.length };
    }

    if (normalized.includes("FROM billing.phase1_fleet_partner_statements")) {
      const rows = [...statements.values()]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map((entry) => ({ record: structuredClone(entry.record) }));
      return { rows, rowCount: rows.length };
    }

    const selectMatch = /^SELECT .+ FROM ([a-z_]+\.[a-z0-9_]+)(.*)$/i.exec(
      normalized,
    );
    if (selectMatch && emptyTables.has(selectMatch[1] ?? "")) {
      return { rows: [], rowCount: 0 };
    }

    throw new Error(`Unexpected SQL in canonical readback test: ${normalized}`);
  });

  return {
    fleetPartners,
    driverAffiliations,
    query,
    delayNextInsert(table: string) {
      const gate = deferred();
      pendingInsertGate = { table, gate };
      return gate;
    },
    databaseService: {
      isEnabled: () => true,
      query,
      connect: async () => ({
        query,
        release: () => {},
      }),
    } as unknown as DatabaseService,
  };
}

async function createWarmInstance(databaseService?: DatabaseService) {
  vi.stubEnv("DRTS_ENV", "test");
  const audit = new AuditNotificationService();
  const profiles = new DriverProfileService(audit);
  const events = new OpsDispatchEventsService(new EventEmitter2());
  activeEvents.push(events);
  const billing = new BillingSettlementService(audit);
  billing.publishDriverFeePlan({
    planName: "Demo Driver Fee Plan",
    version: "2026.04",
    serviceFeeBps: 1200,
    reimbursementMode: "platform_funded",
  });
  const regulatory = new RegulatoryRegistryService(events, audit, profiles);
  const vehicleEligibility = new VehicleEligibilityService(regulatory, audit);
  const ownedMobility = {
    listOrders: () => [],
    listDriverTasks: () => [],
  } as unknown as OwnedMobilityService;
  const repository = databaseService
    ? new FleetPartnerRepository(databaseService)
    : undefined;
  const report = repository
    ? vi
        .spyOn(repository, "reportPersistenceFailure")
        .mockImplementation(() => {})
    : undefined;
  const fleetService = new FleetPartnerService(
    billing,
    ownedMobility,
    regulatory,
    repository,
  );
  await fleetService.onModuleInit();

  const submissionRepository = databaseService
    ? new SupplySubmissionRepository(databaseService)
    : undefined;
  const readinessService = new SupplyReadinessService(
    fleetService,
    regulatory,
    vehicleEligibility,
    submissionRepository,
  );
  const fleetController = new FleetPartnerController(
    fleetService,
    {} as ConstructorParameters<typeof FleetPartnerController>[1],
    {} as ConstructorParameters<typeof FleetPartnerController>[2],
    {} as ConstructorParameters<typeof FleetPartnerController>[3],
    readinessService,
  );

  return {
    repository,
    report,
    regulatory,
    fleetService,
    readinessService,
    fleetController,
  };
}

describe("FLEET-DRIVER-AFFILIATION-CANONICAL-READBACK-20261021", () => {
  it("resolves all 4 Root diagnostic business surfaces on warm instance B after instance A creates a driver affiliation", async () => {
    const db = createCanonicalPostgresSimulator();
    const warmA = await createWarmInstance(db.databaseService);
    const warmB = await createWarmInstance(db.databaseService);

    // Pre-check: warm B has 0 drivers for partnerId before A creates the affiliation.
    const preAdminListB = await warmB.fleetController.listFleetPartnerDrivers(
      partnerId,
      "req-pre-b",
    );
    expect(preAdminListB.data.items).toEqual([]);

    // Instance A creates the affiliation for drv-demo-001 under fleet-owned-affiliation-cross-warm.
    const created = await warmA.fleetController.createDriverFleetAffiliation(
      ` ${liveDriverId} `,
      affiliationCommand,
      "req-create-aff",
    );
    expect(created).toMatchObject({
      data: {
        driverId: liveDriverId,
        fleetPartnerId: partnerId,
        affiliationType: "managed_by",
        driverGroupId: "warm-cross-instance-group",
      },
      meta: { requestId: "req-create-aff" },
    });

    // Control 1 & 2: Same-instance A sees drv-demo-001 across all 4 surfaces.
    const sameAAdmin =
      await warmA.fleetController.listFleetPartnerDrivers(partnerId);
    const sameAPortal =
      await warmA.fleetController.listPortalDrivers(partnerId);
    const sameAReadinessList =
      await warmA.fleetController.listPortalReadiness(partnerId);
    const sameADriverReadiness =
      await warmA.fleetController.getPortalDriverReadiness(
        partnerId,
        liveDriverId,
      );
    expect(sameAAdmin.data.items.map((d) => d.driverId)).toContain(
      liveDriverId,
    );
    expect(sameAPortal.data.items.map((d) => d.driverId)).toContain(
      liveDriverId,
    );
    expect(
      sameAReadinessList.data.items.find(
        (item) =>
          item.subjectType === "driver" && item.subjectId === liveDriverId,
      ),
    ).toMatchObject({ state: "ready", reasonCodes: [] });
    expect(sameADriverReadiness.data).toMatchObject({
      subjectType: "driver",
      subjectId: liveDriverId,
      state: "ready",
      reasonCodes: [],
    });

    // Control 3: Warm B canonical master readback works.
    const warmBMaster = await warmB.fleetController.getFleetPartner(partnerId);
    expect(warmBMaster.data.fleetPartnerId).toBe(partnerId);

    // Business Assertion 1: Warm instance B Admin Fleet driver list includes drv-demo-001.
    const warmBAdminDrivers =
      await warmB.fleetController.listFleetPartnerDrivers(
        partnerId,
        "req-warm-b-admin",
      );
    expect(warmBAdminDrivers.meta.requestId).toBe("req-warm-b-admin");
    expect(
      warmBAdminDrivers.data.items.find((d) => d.driverId === liveDriverId),
    ).toEqual(created.data);

    // Business Assertion 2: Warm instance B Fleet portal driver list includes drv-demo-001 with registry metadata.
    const warmBPortalDrivers = await warmB.fleetController.listPortalDrivers(
      partnerId,
      "req-warm-b-portal",
    );
    expect(warmBPortalDrivers.meta.requestId).toBe("req-warm-b-portal");
    expect(
      warmBPortalDrivers.data.items.find((d) => d.driverId === liveDriverId),
    ).toMatchObject({
      affiliationId: created.data.affiliationId,
      driverId: liveDriverId,
      fleetPartnerId: partnerId,
      driverGroupId: "warm-cross-instance-group",
      affiliationType: "managed_by",
      licensesValid: true,
      lifecycleStatus: "active",
      dispatchEligible: true,
    });

    // Business Assertion 3: Warm instance B Fleet readiness list includes drv-demo-001 as ready.
    const warmBReadinessList = await warmB.fleetController.listPortalReadiness(
      partnerId,
      "req-warm-b-readiness-list",
    );
    expect(warmBReadinessList.meta.requestId).toBe("req-warm-b-readiness-list");
    expect(
      warmBReadinessList.data.items.find(
        (item) =>
          item.subjectType === "driver" && item.subjectId === liveDriverId,
      ),
    ).toMatchObject({
      subjectType: "driver",
      subjectId: liveDriverId,
      state: "ready",
      reasonCodes: [],
    });

    // Business Assertion 4: Warm instance B single-driver readiness detail returns ready instead of 404.
    const warmBDriverReadiness =
      await warmB.fleetController.getPortalDriverReadiness(
        partnerId,
        liveDriverId,
        "req-warm-b-driver-readiness",
      );
    expect(warmBDriverReadiness.meta.requestId).toBe(
      "req-warm-b-driver-readiness",
    );
    expect(warmBDriverReadiness.data).toMatchObject({
      subjectType: "driver",
      subjectId: liveDriverId,
      state: "ready",
      reasonCodes: [],
    });

    // Control 4: Fresh instance C initialized after A's POST sees drv-demo-001 across all 4 surfaces.
    const freshC = await createWarmInstance(db.databaseService);
    const freshCAdmin =
      await freshC.fleetController.listFleetPartnerDrivers(partnerId);
    const freshCPortal =
      await freshC.fleetController.listPortalDrivers(partnerId);
    const freshCReadinessList =
      await freshC.fleetController.listPortalReadiness(partnerId);
    const freshCDriverReadiness =
      await freshC.fleetController.getPortalDriverReadiness(
        partnerId,
        liveDriverId,
      );
    expect(freshCAdmin.data.items.map((d) => d.driverId)).toContain(
      liveDriverId,
    );
    expect(freshCPortal.data.items.map((d) => d.driverId)).toContain(
      liveDriverId,
    );
    expect(
      freshCReadinessList.data.items.some(
        (item) =>
          item.subjectType === "driver" && item.subjectId === liveDriverId,
      ),
    ).toBe(true);
    expect(freshCDriverReadiness.data.subjectId).toBe(liveDriverId);

    // Portal dashboard and quality metrics on warm B also reflect the canonical driver.
    const dashboardB = await warmB.fleetController.getPortalDashboard(
      partnerId,
      "2026-03",
    );
    const qualityB = await warmB.fleetService.getPortalQualityMetrics(
      partnerId,
      "2026-03",
    );
    expect(dashboardB.data.activeDriverCount).toBe(1);
    expect(qualityB.activeDriverCount).toBe(1);
  });

  it("allows warm instance B to create a driver affiliation for a Fleet Partner newly created on instance A", async () => {
    const db = createCanonicalPostgresSimulator();
    const warmA = await createWarmInstance(db.databaseService);
    const warmB = await createWarmInstance(db.databaseService);

    const createdPartner =
      await warmA.fleetController.createFleetPartner(createPartnerCommand);
    const newPartnerId = createdPartner.data.fleetPartnerId;

    // Warm B has not called listFleetPartners/getFleetPartner yet, so newPartnerId is not in B's local cache.
    const createdAffiliation =
      await warmB.fleetController.createDriverFleetAffiliation(liveDriverId, {
        ...affiliationCommand,
        fleetPartnerId: newPartnerId,
      });
    expect(createdAffiliation.data).toMatchObject({
      driverId: liveDriverId,
      fleetPartnerId: newPartnerId,
    });

    // Warm A immediately sees the affiliation created on warm B and evaluates readiness.
    const warmADrivers =
      await warmA.fleetController.listFleetPartnerDrivers(newPartnerId);
    expect(warmADrivers.data.items).toEqual([createdAffiliation.data]);

    const warmADriverReadiness =
      await warmA.fleetController.getPortalDriverReadiness(
        newPartnerId,
        liveDriverId,
      );
    expect(warmADriverReadiness.data).toMatchObject({
      subjectType: "driver",
      subjectId: liveDriverId,
      state: "ready",
      reasonCodes: [],
    });

    // Soft-disabling the partner on B propagates FLEET_PARTNER_INACTIVE to A's readiness evaluation.
    await warmB.fleetController.updateFleetPartner(newPartnerId, {
      active: false,
    });
    const inactiveReadinessA =
      await warmA.fleetController.getPortalDriverReadiness(
        newPartnerId,
        liveDriverId,
      );
    expect(inactiveReadinessA.data).toMatchObject({
      subjectType: "driver",
      subjectId: liveDriverId,
      state: "suspended",
      reasonCodes: ["FLEET_PARTNER_INACTIVE"],
    });
  });

  it("enforces canonical effectiveFrom sorting, partner scoping, and active date windows in SupplyReadinessService", async () => {
    const db = createCanonicalPostgresSimulator();
    const warmA = await createWarmInstance(db.databaseService);
    const warmB = await createWarmInstance(db.databaseService);

    const futureDriverId = "drv-future-001";
    const expiredDriverId = "drv-expired-001";

    const otherPartner =
      await warmA.fleetController.createFleetPartner(createPartnerCommand);

    await warmA.fleetController.createDriverFleetAffiliation(expiredDriverId, {
      fleetPartnerId: partnerId,
      affiliationType: "managed_by",
      effectiveFrom: "2025-01-01T00:00:00.000Z",
      effectiveUntil: "2025-06-01T00:00:00.000Z",
      driverGroupId: "expired-group",
    });
    await warmA.fleetController.createDriverFleetAffiliation(liveDriverId, {
      fleetPartnerId: partnerId,
      affiliationType: "managed_by",
      effectiveFrom: "2026-02-01T00:00:00.000Z",
      effectiveUntil: null,
      driverGroupId: "active-group",
    });
    await warmA.fleetController.createDriverFleetAffiliation(futureDriverId, {
      fleetPartnerId: partnerId,
      affiliationType: "managed_by",
      effectiveFrom: "2099-01-01T00:00:00.000Z",
      effectiveUntil: null,
      driverGroupId: "future-group",
    });
    await warmA.fleetController.createDriverFleetAffiliation(secondDriverId, {
      fleetPartnerId: otherPartner.data.fleetPartnerId,
      affiliationType: "contracted_under",
      effectiveFrom: "2026-03-01T00:00:00.000Z",
      effectiveUntil: null,
    });

    const warmBAdmin =
      await warmB.fleetController.listFleetPartnerDrivers(partnerId);
    expect(warmBAdmin.data.items.map((item) => item.driverId)).toEqual([
      futureDriverId,
      liveDriverId,
      expiredDriverId,
    ]);

    const warmBReadiness =
      await warmB.fleetController.listPortalReadiness(partnerId);
    const readinessDriverIds = warmBReadiness.data.items
      .filter((item) => item.subjectType === "driver")
      .map((item) => item.subjectId);
    expect(readinessDriverIds).toContain(liveDriverId);
    expect(readinessDriverIds).not.toContain(futureDriverId);
    expect(readinessDriverIds).not.toContain(expiredDriverId);
    expect(readinessDriverIds).not.toContain(secondDriverId);

    await expect(
      warmB.fleetController.getPortalDriverReadiness(partnerId, futureDriverId),
    ).rejects.toMatchObject({
      status: 404,
      code: "READINESS_SUBJECT_NOT_FOUND",
    });
    await expect(
      warmB.fleetController.getPortalDriverReadiness(
        partnerId,
        expiredDriverId,
      ),
    ).rejects.toMatchObject({
      status: 404,
      code: "READINESS_SUBJECT_NOT_FOUND",
    });
  });

  it("never falls back to stale local cache when canonical DB has no matching master or empty affiliations", async () => {
    const db = createCanonicalPostgresSimulator(false);
    const warmA = await createWarmInstance(db.databaseService);

    // Clear canonical affiliations while warmA still holds seeded affiliations in memory.
    db.driverAffiliations.clear();

    const adminDrivers =
      await warmA.fleetController.listFleetPartnerDrivers("fleet-demo-001");
    expect(adminDrivers.data.items).toEqual([]);

    const portalDrivers =
      await warmA.fleetController.listPortalDrivers("fleet-demo-001");
    expect(portalDrivers.data.items).toEqual([]);

    await expect(
      warmA.fleetController.getPortalDriverReadiness(
        "fleet-demo-001",
        "drv-demo-001",
      ),
    ).rejects.toMatchObject({
      status: 404,
      code: "READINESS_SUBJECT_NOT_FOUND",
    });

    // Clear canonical fleet partners while warmA still holds fleet-demo-001 in memory.
    db.fleetPartners.clear();

    await expect(
      warmA.fleetController.listFleetPartnerDrivers("fleet-demo-001"),
    ).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
    await expect(
      warmA.fleetController.listPortalDrivers("fleet-demo-001"),
    ).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
    await expect(
      warmA.fleetController.listPortalReadiness("fleet-demo-001"),
    ).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
    await expect(
      warmA.fleetController.createDriverFleetAffiliation(liveDriverId, {
        ...affiliationCommand,
        fleetPartnerId: "fleet-demo-001",
      }),
    ).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("withholds uncommitted affiliation until SQL write resolves, propagates write failure without mutating cache, and validates inputs before SQL", async () => {
    const db = createCanonicalPostgresSimulator();
    const warmA = await createWarmInstance(db.databaseService);
    const warmB = await createWarmInstance(db.databaseService);

    // Validation before SQL
    db.query.mockClear();
    await expect(
      warmA.fleetController.createDriverFleetAffiliation(
        "   ",
        affiliationCommand,
      ),
    ).rejects.toBeInstanceOf(ApiRequestError);
    await expect(
      warmA.fleetController.createDriverFleetAffiliation(liveDriverId, {
        ...affiliationCommand,
        effectiveFrom: "not-a-date",
      }),
    ).rejects.toBeInstanceOf(ApiRequestError);
    await expect(
      warmA.fleetController.createDriverFleetAffiliation(liveDriverId, {
        ...affiliationCommand,
        effectiveUntil: "not-a-date",
      }),
    ).rejects.toBeInstanceOf(ApiRequestError);
    expect(db.query).not.toHaveBeenCalled();

    // Missing master checks canonical partner table and does not issue INSERT
    await expect(
      warmA.fleetController.createDriverFleetAffiliation(liveDriverId, {
        ...affiliationCommand,
        fleetPartnerId: "fleet-missing-999",
      }),
    ).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
    expect(db.query).not.toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO"),
      expect.anything(),
    );

    // Pending write isolation across warmA and warmB
    const pendingGate = db.delayNextInsert(
      "admin.phase1_driver_fleet_affiliations",
    );
    let settled = false;
    const pendingCreate = warmA.fleetController
      .createDriverFleetAffiliation(liveDriverId, affiliationCommand)
      .then((res) => {
        settled = true;
        return res;
      });

    await tick();
    expect(settled).toBe(false);
    expect(
      (
        await warmA.fleetController.listFleetPartnerDrivers(partnerId)
      ).data.items.map((d) => d.driverId),
    ).not.toContain(liveDriverId);
    expect(
      (
        await warmB.fleetController.listFleetPartnerDrivers(partnerId)
      ).data.items.map((d) => d.driverId),
    ).not.toContain(liveDriverId);

    pendingGate.resolve();
    const committed = await pendingCreate;
    expect(committed.data.driverId).toBe(liveDriverId);

    // Failed write propagation
    const failGate = db.delayNextInsert(
      "admin.phase1_driver_fleet_affiliations",
    );
    const writeError = new Error("simulated affiliation insert failure");
    const failingCreate = warmA.fleetController
      .createDriverFleetAffiliation("drv-fail-001", affiliationCommand)
      .then(
        (value) => ({ value }),
        (reason: unknown) => ({ reason }),
      );
    await tick();
    failGate.reject(writeError);
    expect(await failingCreate).toEqual({ reason: writeError });
    expect(warmA.report).toHaveBeenCalledWith(
      writeError,
      "create driver fleet affiliation",
    );
    expect(
      (
        await warmB.fleetController.listFleetPartnerDrivers(partnerId)
      ).data.items.map((d) => d.driverId),
    ).not.toContain("drv-fail-001");
  });

  it("preserves no-DB fallback when repository is absent or disabled", async () => {
    for (const mode of ["absent", "disabled"] as const) {
      const disabledDb =
        mode === "disabled"
          ? ({ isEnabled: () => false } as unknown as DatabaseService)
          : undefined;
      const instance = await createWarmInstance(disabledDb);
      const createdPartner =
        await instance.fleetController.createFleetPartner(createPartnerCommand);
      const localPartnerId = createdPartner.data.fleetPartnerId;

      const created =
        await instance.fleetController.createDriverFleetAffiliation(
          liveDriverId,
          {
            ...affiliationCommand,
            fleetPartnerId: localPartnerId,
          },
          "req-nodb",
        );
      expect(created.data.driverId).toBe(liveDriverId);

      const adminList = instance.fleetController.listFleetPartnerDrivers(
        localPartnerId,
        "req-nodb-admin",
      );
      expect("data" in adminList && adminList.data.items).toEqual([
        created.data,
      ]);

      const portalList = instance.fleetController.listPortalDrivers(
        localPartnerId,
        "req-nodb-portal",
      );
      expect(
        "data" in portalList &&
          portalList.data.items.find((d) => d.driverId === liveDriverId),
      ).toMatchObject({
        driverId: liveDriverId,
        fleetPartnerId: localPartnerId,
        licensesValid: true,
        lifecycleStatus: "active",
      });

      const readiness = await instance.fleetController.getPortalDriverReadiness(
        localPartnerId,
        liveDriverId,
      );
      expect(readiness.data).toMatchObject({
        subjectType: "driver",
        subjectId: liveDriverId,
        state: "ready",
        reasonCodes: [],
      });
    }
  });
});
