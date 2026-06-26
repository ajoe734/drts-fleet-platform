import { describe, expect, it, vi } from "vitest";

import { buildTeslaRegulatoryCapabilityProfile } from "../../../../packages/shared-test-fixtures/src";

import { TeslaRegulatoryEventsController } from "../../src/modules/tesla-regulatory-events/tesla-regulatory-events.controller";
import { TeslaRegulatoryMockAdapter } from "../../src/modules/tesla-regulatory-events/tesla-regulatory-mock.adapter";
import { TeslaRegulatoryEventsService } from "../../src/modules/tesla-regulatory-events/tesla-regulatory-events.service";

function createRepositoryStub() {
  return {
    loadState: vi.fn(async () => ({
      capabilityProfiles: [],
      reasonCodeDictionaries: [],
    })),
    upsertCapabilityProfile: vi.fn(async () => undefined),
    upsertReasonCodeDictionary: vi.fn(async () => undefined),
    appendRegulatoryEvents: vi.fn(async () => undefined),
    reportPersistenceFailure: vi.fn(),
  };
}

describe("int-tesla-001 capability profile query", () => {
  it("returns the VIN capability profile through the controller and reuses the stored copy on repeat query", async () => {
    const repository = createRepositoryStub();
    const mockAdapter = new TeslaRegulatoryMockAdapter();
    const getCapabilitiesSpy = vi.spyOn(mockAdapter, "getCapabilities");
    const expectedProfile = buildTeslaRegulatoryCapabilityProfile();
    const service = new TeslaRegulatoryEventsService(
      repository as never,
      mockAdapter,
    );
    const controller = new TeslaRegulatoryEventsController(service);

    const first = await controller.getVehicleCapabilities(
      expectedProfile.vin,
      undefined,
      "req-tesla-capabilities-001",
    );
    const second = await controller.getVehicleCapabilities(
      expectedProfile.vin.toLowerCase(),
      undefined,
      "req-tesla-capabilities-002",
    );

    expect(first.data).toMatchObject({
      vin: expectedProfile.vin,
      passengerServiceStatus: "eligible",
      reasonCodeDictionaryVersion: expectedProfile.reasonCodeDictionaryVersion,
    });
    expect(second.data).toEqual(first.data);
    expect(first.meta.requestId).toBe("req-tesla-capabilities-001");
    expect(second.meta.requestId).toBe("req-tesla-capabilities-002");
    expect(getCapabilitiesSpy).toHaveBeenCalledTimes(1);
    expect(repository.upsertCapabilityProfile).toHaveBeenCalledTimes(1);
    expect(repository.upsertReasonCodeDictionary).toHaveBeenCalledTimes(1);
  });
});
