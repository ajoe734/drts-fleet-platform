import { describe, expect, it, vi } from "vitest";

import {
  buildTeslaRegulatoryCapabilityProfile,
  buildTeslaRegulatoryEvents,
  buildTeslaRegulatoryReasonCodeDictionary,
} from "../../../../packages/shared-test-fixtures/src";

import { ApiRequestError } from "../../src/common/api-envelope";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { TeslaRegulatoryEventsService } from "../../src/modules/tesla-regulatory-events/tesla-regulatory-events.service";

function createRepositoryStub() {
  const state = {
    capabilityProfiles: [],
    reasonCodeDictionaries: [],
    regulatoryEvents: [],
  };

  return {
    loadState: vi.fn(async () => ({
      capabilityProfiles: [...state.capabilityProfiles],
      reasonCodeDictionaries: [...state.reasonCodeDictionaries],
    })),
    upsertCapabilityProfile: vi.fn(async (profile) => {
      state.capabilityProfiles = [
        ...state.capabilityProfiles.filter((item) => item.vin !== profile.vin),
        profile,
      ];
    }),
    upsertReasonCodeDictionary: vi.fn(async (dictionary) => {
      state.reasonCodeDictionaries = [
        ...state.reasonCodeDictionaries.filter(
          (item) =>
            !(
              item.providerCode === dictionary.providerCode &&
              item.dictionaryVersion === dictionary.dictionaryVersion
            ),
        ),
        dictionary,
      ];
    }),
    appendRegulatoryEvents: vi.fn(async (events) => {
      state.regulatoryEvents.push(...events);
    }),
    reportPersistenceFailure: vi.fn(),
    getState: () => state,
  };
}

function createPassengerOrderHarness(
  teslaRegulatoryEventsService: TeslaRegulatoryEventsService,
) {
  const regulatoryRegistryService = {
    getEligibleCandidates: vi.fn(() => []),
    getVehicleDispatchability: vi.fn(() => true),
    getDriverAvailability: vi.fn(() => true),
  };
  const callcenterService = {
    registerRecordingAttachmentListener: vi.fn(),
    registerRecordingStateChangeListener: vi.fn(),
    linkOrderToCallSession: vi.fn(),
  };
  const taskEventsService = {
    publishTaskAssigned: vi.fn(),
    publishTaskUpdated: vi.fn(),
    publishTaskCancelled: vi.fn(),
  };

  return new OwnedMobilityService(
    regulatoryRegistryService as never,
    new AuditNotificationService(),
    callcenterService as never,
    taskEventsService as never,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    teslaRegulatoryEventsService,
  );
}

describe("TeslaRegulatoryEventsService", () => {
  it("stores a capability profile, versioned reason-code dictionary, and signed sample events", async () => {
    const repository = createRepositoryStub();
    const capabilityProfile = buildTeslaRegulatoryCapabilityProfile();
    const reasonCodeDictionary = buildTeslaRegulatoryReasonCodeDictionary();
    const events = buildTeslaRegulatoryEvents();
    const provider = {
      providerCode: "tesla_regulatory_mock",
      getCapabilities: vi.fn(async () => capabilityProfile),
      getReasonCodeDictionary: vi.fn(async () => reasonCodeDictionary),
      fetchEvents: vi.fn(async () => events),
    };

    const service = new TeslaRegulatoryEventsService(
      repository as never,
      provider as never,
    );

    await service.onModuleInit();
    const result = await service.getVehicleCapabilities(capabilityProfile.vin);

    expect(result).toMatchObject({
      vin: capabilityProfile.vin,
      passengerServiceStatus: "eligible",
      reasonCodeDictionaryVersion: reasonCodeDictionary.dictionaryVersion,
    });
    expect(repository.upsertCapabilityProfile).toHaveBeenCalledTimes(1);
    expect(repository.upsertReasonCodeDictionary).toHaveBeenCalledTimes(1);
    expect(repository.appendRegulatoryEvents).toHaveBeenCalledWith(events);
    expect(service.listStoredEvents(capabilityProfile.vin)).toEqual(events);
    expect(
      service
        .listStoredEvents(capabilityProfile.vin)
        .every((event) => event.source.signatureRef !== null),
    ).toBe(true);
  });

  it("gates passenger orders when a stored capability profile is missing required capabilities", async () => {
    const repository = createRepositoryStub();
    const capabilityProfile = buildTeslaRegulatoryCapabilityProfile({
      missingRequiredCapabilities: ["regulatory_event_feed"],
    });
    const provider = {
      providerCode: "tesla_regulatory_mock",
      getCapabilities: vi.fn(async () => capabilityProfile),
      getReasonCodeDictionary: vi.fn(async () =>
        buildTeslaRegulatoryReasonCodeDictionary(),
      ),
      fetchEvents: vi.fn(async () => buildTeslaRegulatoryEvents()),
    };

    const teslaRegulatoryEventsService = new TeslaRegulatoryEventsService(
      repository as never,
      provider as never,
    );
    await teslaRegulatoryEventsService.getVehicleCapabilities(
      capabilityProfile.vin,
    );

    const ownedMobilityService = createPassengerOrderHarness(
      teslaRegulatoryEventsService,
    );

    try {
      ownedMobilityService.createPassengerOrder({
        pickup: { address: "Taipei Main Station" },
        dropoff: { address: "Songshan Airport" },
        passenger: { name: "Tesla Rider", phone: "0912000000" },
        requestedVehicleVin: capabilityProfile.vin,
      });
      throw new Error("Expected passenger order to be gated.");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "PHASE2_PROVIDER_CAPABILITY_MISSING",
          details: {
            reasonCode: "required-capability-missing",
            missingRequiredCapabilities: ["regulatory_event_feed"],
          },
        },
      });
    }
  });
});
