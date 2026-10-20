import { describe, expect, it } from "vitest";
import { approvalRecords, services } from "./fixture";
import { createFixture } from "../fleet-portal-verified-principal-canonical-caller-flow-20261015/services";

// Existing canonical registry seed is a unit eligibility control, not new
// onboarding data or evidence of a real qualified driver/provider deployment.
function eligibleControl() {
  const { registry } = services();
  const pair = registry
    .listSupplyPairs()
    .find((p) => p.vehicleId === "veh-av-demo-001")!;
  expect(registry.getEligibleCandidates("business_dispatch")).toEqual(
    expect.arrayContaining([expect.objectContaining(pair)]),
  );
  return { registry, pair };
}

describe("unknown structural pair ETA keeps existing estimates and eligibility", () => {
  it("does not erase an existing numeric pair on provisioning/readback", async () => {
    const { registry, pair } = eligibleControl();
    const records = approvalRecords(registry);
    const result = await registry.provisionFromSubmission(null, {
      submission: { ...records.vehicle, canonicalVehicleId: pair.vehicleId },
      referencedDriverSubmission: {
        ...records.driver,
        canonicalDriverId: pair.driverId,
      },
      driverDraft: null,
      vehicleDraft: records.draft,
      documents: [],
      approvedAt: new Date().toISOString(),
      reviewerId: "unit-reviewer",
    });
    expect(result.supplyPair).toEqual(pair);
    registry.publishCommittedSupplyPair(result.supplyPair);
    expect(
      registry
        .listSupplyPairs()
        .filter(
          (p) => p.vehicleId === pair.vehicleId && p.driverId === pair.driverId,
        ),
    ).toEqual([pair]);
  });

  it("never treats a null unknown estimate as zero or falls back to legacy ETA without observation", () => {
    const { registry, pair } = eligibleControl();
    registry.publishCommittedSupplyPair({ ...pair, etaMinutes: null });
    for (const destination of [null, { lat: 25.04, lng: 121.53 }]) {
      expect(
        registry
          .getEligibleCandidates("business_dispatch", destination)
          .some(
            (p) =>
              p.vehicleId === pair.vehicleId && p.driverId === pair.driverId,
          ),
      ).toBe(false);
    }
  });

  it("uses the original live observation/destination estimate and still rejects offline work state", async () => {
    const { registry, pair } = eligibleControl();
    registry.publishCommittedSupplyPair({ ...pair, etaMinutes: null });
    await registry.recordDriverLocation({
      driverId: pair.driverId,
      lat: 25.03,
      lng: 121.52,
      accuracyM: 5,
      recordedAt: new Date().toISOString(),
    });
    const current = registry
      .getEligibleCandidates("business_dispatch", { lat: 25.04, lng: 121.53 })
      .find(
        (p) => p.vehicleId === pair.vehicleId && p.driverId === pair.driverId,
      )!;
    expect(current).toBeDefined();
    expect(Number.isFinite(current.etaMinutes)).toBe(true);
    expect(current.etaMinutes).toBeGreaterThan(0);
    registry.updateDriverWorkState(pair.driverId, { workState: "offline" });
    expect(
      registry
        .getEligibleCandidates("business_dispatch", { lat: 25.04, lng: 121.53 })
        .some(
          (p) => p.vehicleId === pair.vehicleId && p.driverId === pair.driverId,
        ),
    ).toBe(false);
  });

  it.each([
    [null, null, null],
    [null, 7, 7],
    [7, null, 7],
    [7, 3, 3],
  ] as const)(
    "keeps portal ETA honest for paired estimates %s and %s",
    (firstEta, secondEta, expectedEta) => {
      const { fleetPartnerService, regulatoryRegistryService: registry } =
        createFixture();
      const vehicleId = registry.listVehicles()[0]!.vehicleId;
      registry.publishCommittedSupplyPair({
        vehicleId,
        driverId: "drv-demo-001",
        etaMinutes: firstEta,
      });
      registry.publishCommittedSupplyPair({
        vehicleId,
        driverId: "drv-demo-002",
        etaMinutes: secondEta,
      });
      const row = fleetPartnerService
        .listPortalVehicles("fleet-demo-001")
        .find((vehicle) => vehicle.vehicleId === vehicleId)!;
      expect(row.currentEtaMinutes).toBe(expectedEta);
      expect(row.activeDriverIds).toEqual(
        expect.arrayContaining(["drv-demo-001", "drv-demo-002"]),
      );
    },
  );
});
