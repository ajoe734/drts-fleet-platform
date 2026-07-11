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
});
