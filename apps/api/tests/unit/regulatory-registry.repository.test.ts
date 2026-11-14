import { describe, expect, it, vi } from "vitest";

import { RegulatoryRegistryRepository } from "../../src/modules/regulatory-registry/regulatory-registry.repository";

const VEHICLE_ID = "10000000-0000-0000-0000-000000000353";

describe("RegulatoryRegistryRepository", () => {
  it("backfills missing vehicle license types from reg.vehicles", async () => {
    const databaseService = {
      isEnabled: () => true,
      query: vi.fn(async (text: string) => {
        if (text.includes("FROM reg.phase1_registry_vehicles")) {
          return {
            rows: [
              {
                record: {
                  vehicleId: VEHICLE_ID,
                  plateNo: "BCD-7788",
                  operatingArea: "taichung-port",
                  supportedServiceBuckets: ["business_dispatch"],
                  dispatchableFlag: true,
                  exclusivityApproved: true,
                  insuranceStatus: "valid",
                  updatedAt: "2026-07-10T00:00:00.000Z",
                  supplyLifecycle: {
                    contract: {
                      contractId: null,
                      lifecycleStatus: "missing",
                      startAt: null,
                      endAt: null,
                      updatedAt: null,
                    },
                    insurance: {
                      policyId: null,
                      lifecycleStatus: "missing",
                      startAt: null,
                      endAt: null,
                      updatedAt: null,
                    },
                    exclusivity: {
                      lifecycleStatus: "missing",
                      declarationStatus: "missing",
                      declarationFileId: null,
                      reviewStatus: "draft",
                      providerName: null,
                      effectiveStart: null,
                      effectiveEnd: null,
                      reviewedAt: null,
                      updatedAt: null,
                    },
                    dispatch: {
                      eligible: true,
                      blockedReasons: [],
                      evaluatedAt: "2026-07-10T00:00:00.000Z",
                    },
                    offboarding: {
                      status: "none",
                      reason: null,
                      requestedAt: null,
                      effectiveAt: null,
                      completedAt: null,
                      requestedBy: null,
                      debrandingRequired: false,
                      debrandingStatus: "not_required",
                      debrandingDueAt: null,
                      debrandingCompletedAt: null,
                      debrandingTicketId: null,
                      notes: null,
                    },
                    lastTrace: null,
                  },
                },
              },
            ],
          };
        }

        if (text.includes("FROM reg.vehicles")) {
          return {
            rows: [{ vehicle_id: VEHICLE_ID, license_class: "rental" }],
          };
        }

        return { rows: [] };
      }),
    };

    const repository = new RegulatoryRegistryRepository(
      databaseService as never,
    );
    const state = await repository.loadState();

    expect(state.vehicles).toEqual([
      expect.objectContaining({
        vehicleId: VEHICLE_ID,
        licenseType: "rental_car",
      }),
    ]);
  });

  it("backfills driver credentials without fake registration areas and queues incomplete vehicle drafts for correction", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    const repository = new RegulatoryRegistryRepository({
      isEnabled: () => true,
      query,
    } as never);

    await repository.runIdempotentBackfill();

    expect(query).toHaveBeenCalledTimes(2);

    const credentialBackfillSql = String(query.mock.calls[0]?.[0]);
    expect(credentialBackfillSql).toContain(
      "INSERT INTO reg.driver_public_registration_credentials",
    );
    expect(credentialBackfillSql).toContain("dp.taxi_registration_no");
    expect(credentialBackfillSql).toContain("NULL,");
    expect(credentialBackfillSql).toContain("'unverified'");
    expect(credentialBackfillSql).toContain(
      "ON CONFLICT (driver_id) DO NOTHING",
    );
    expect(credentialBackfillSql).not.toContain("'TPE'");

    const correctionQueueSql = String(query.mock.calls[1]?.[0]);
    expect(correctionQueueSql).toContain("UPDATE fleet.supply_submissions s");
    expect(correctionQueueSql).toContain("SET status = 'needs_revision'");
    expect(correctionQueueSql).toContain(
      "AND (d.door_count IS NULL OR d.color IS NULL)",
    );
  });
});

describe("committed single-vehicle passenger display read", () => {
  it("reads the requested committed plate without disclosure rows or mutation locks", async () => {
    const record = { vehicleId: VEHICLE_ID, plateNo: "SIM-DURABLE-PLATE" };
    const query = vi.fn().mockResolvedValue({ rows: [{ record }] });
    const repository = new RegulatoryRegistryRepository({
      isEnabled: () => true,
      query,
    } as never);
    expect(await repository.findVehicleById(VEHICLE_ID)).toEqual(record);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[1]).toEqual([VEHICLE_ID]);
    expect(query.mock.calls[0]?.[0]).toMatch(
      /FROM reg\.phase1_registry_vehicles WHERE vehicle_id = \$1/,
    );
    expect(query.mock.calls[0]?.[0]).not.toMatch(
      /FOR UPDATE|disclosure|INSERT|UPDATE|DELETE/,
    );
  });

  it("keeps an absent durable vehicle absent instead of loading another plate", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new RegulatoryRegistryRepository({
      isEnabled: () => true,
      query,
    } as never);
    await expect(repository.findVehicleById(VEHICLE_ID)).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("propagates a real vehicle-source failure instead of calling it an absent row", async () => {
    const failure = new Error("SIM database read failure");
    const repository = new RegulatoryRegistryRepository({
      isEnabled: () => true,
      query: vi.fn().mockRejectedValue(failure),
    } as never);
    await expect(repository.findVehicleById(VEHICLE_ID)).rejects.toBe(failure);
  });
});
