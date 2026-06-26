import { Injectable } from "@nestjs/common";

import type {
  TeslaRegulatoryCapabilityProfile,
  TeslaRegulatoryReasonCodeDictionary,
  TeslaRegulatoryEvent,
} from "@drts/contracts";

import {
  buildTeslaRegulatoryMockCapabilityProfile,
  buildTeslaRegulatoryMockEvents,
  buildTeslaRegulatoryMockReasonCodeDictionary,
} from "./tesla-regulatory-events.fixtures";
import type {
  TeslaRegulatoryCapabilityQuery,
  TeslaRegulatoryEventProvider,
  TeslaRegulatoryEventQuery,
  TeslaRegulatoryReasonCodeDictionaryQuery,
} from "./tesla-regulatory-events.ports";

@Injectable()
export class TeslaRegulatoryMockAdapter implements TeslaRegulatoryEventProvider {
  readonly providerCode = "tesla_regulatory_mock";

  async getCapabilities(
    query: TeslaRegulatoryCapabilityQuery,
  ): Promise<TeslaRegulatoryCapabilityProfile> {
    return buildTeslaRegulatoryMockCapabilityProfile({
      vin: query.vin,
      externalVehicleRef: query.externalVehicleRef ?? query.vin,
      vehicleId: query.vehicleId ?? "vehicle-tesla-demo-001",
      providerCode: this.providerCode,
    });
  }

  async getReasonCodeDictionary(
    query?: TeslaRegulatoryReasonCodeDictionaryQuery,
  ): Promise<TeslaRegulatoryReasonCodeDictionary> {
    void query;
    return buildTeslaRegulatoryMockReasonCodeDictionary({
      providerCode: this.providerCode,
    });
  }

  async fetchEvents(
    query: TeslaRegulatoryEventQuery,
  ): Promise<TeslaRegulatoryEvent[]> {
    const overrides: {
      vin?: string;
      vehicleId?: string;
      externalVehicleRef?: string;
    } = {
      externalVehicleRef: query.externalVehicleRef,
    };
    if (query.vin) {
      overrides.vin = query.vin;
    }
    if (query.vehicleId) {
      overrides.vehicleId = query.vehicleId;
    }

    return buildTeslaRegulatoryMockEvents(overrides);
  }
}
