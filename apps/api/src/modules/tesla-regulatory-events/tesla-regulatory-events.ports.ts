import type {
  TeslaRegulatoryCapabilityProfile,
  TeslaRegulatoryEvent,
  TeslaRegulatoryReasonCodeDictionary,
} from "@drts/contracts";

// Phase 2 scaffold: Tesla regulatory-event provider port.
//
// Interface-only. A concrete TeslaRegulatoryEventProvider (Fleet API
// regulatory feed / signed export reader) is wired by a downstream Phase 2
// execution wave. Events are regulatory-grade and feed accident investigation
// and regulatory reporting.

export const TESLA_REGULATORY_EVENT_PROVIDER = Symbol(
  "TESLA_REGULATORY_EVENT_PROVIDER",
);

export interface TeslaRegulatoryEventQuery {
  vin?: string;
  vehicleId?: string | null;
  externalVehicleRef: string;
  since: string;
  until?: string;
}

export interface TeslaRegulatoryCapabilityQuery {
  vin: string;
  vehicleId?: string | null;
  externalVehicleRef?: string | null;
}

export interface TeslaRegulatoryReasonCodeDictionaryQuery {
  vin?: string;
  providerCode?: string;
}

export interface TeslaRegulatoryEventProvider {
  readonly providerCode: string;
  fetchEvents(
    query: TeslaRegulatoryEventQuery,
  ): Promise<TeslaRegulatoryEvent[]>;
  getCapabilities(
    query: TeslaRegulatoryCapabilityQuery,
  ): Promise<TeslaRegulatoryCapabilityProfile>;
  getReasonCodeDictionary(
    query?: TeslaRegulatoryReasonCodeDictionaryQuery,
  ): Promise<TeslaRegulatoryReasonCodeDictionary>;
}
