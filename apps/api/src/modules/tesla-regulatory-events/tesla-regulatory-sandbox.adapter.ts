import { Injectable } from "@nestjs/common";

import type {
  TeslaRegulatoryCapabilityProfile,
  TeslaRegulatoryReasonCodeDictionary,
  TeslaRegulatoryEvent,
} from "@drts/contracts";

import {
  buildTeslaRegulatoryMockCapabilityProfile,
  buildTeslaRegulatoryMockReasonCodeDictionary,
} from "./tesla-regulatory-events.fixtures";
import type {
  TeslaRegulatoryCapabilityQuery,
  TeslaRegulatoryEventProvider,
  TeslaRegulatoryEventQuery,
  TeslaRegulatoryReasonCodeDictionaryQuery,
} from "./tesla-regulatory-events.ports";

@Injectable()
export class TeslaRegulatorySandboxAdapter implements TeslaRegulatoryEventProvider {
  readonly providerCode = "tesla_regulatory_sandbox";

  async getCapabilities(
    query: TeslaRegulatoryCapabilityQuery,
  ): Promise<TeslaRegulatoryCapabilityProfile> {
    return buildTeslaRegulatoryMockCapabilityProfile({
      vin: query.vin,
      externalVehicleRef: query.externalVehicleRef ?? query.vin,
      vehicleId: query.vehicleId ?? null,
      providerCode: this.providerCode,
      providerSchemaVersion: "sandbox-placeholder",
      missingRequiredCapabilities: [
        "regulatory_event_feed",
        "evidence_recorder",
        "odd_geofence",
      ],
      source: {
        sourceSystem: "manual_entry",
        sourceRef: "sandbox-placeholder",
        ingestedAt: "2026-06-26T00:00:00.000Z",
        recordedAt: null,
        signatureRef: null,
        schemaVersion: "sandbox-placeholder",
      },
    });
  }

  async getReasonCodeDictionary(
    query?: TeslaRegulatoryReasonCodeDictionaryQuery,
  ): Promise<TeslaRegulatoryReasonCodeDictionary> {
    void query;
    return buildTeslaRegulatoryMockReasonCodeDictionary({
      providerCode: this.providerCode,
      dictionaryVersion: "sandbox-placeholder",
      entries: [],
      source: {
        sourceSystem: "manual_entry",
        sourceRef: "sandbox-placeholder",
        ingestedAt: "2026-06-26T00:00:00.000Z",
        recordedAt: null,
        signatureRef: null,
        schemaVersion: "sandbox-placeholder",
      },
    });
  }

  async fetchEvents(
    query: TeslaRegulatoryEventQuery,
  ): Promise<TeslaRegulatoryEvent[]> {
    void query;
    return [];
  }
}
