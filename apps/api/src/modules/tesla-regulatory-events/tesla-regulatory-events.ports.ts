import type { TeslaRegulatoryEvent } from "@drts/contracts";

// Phase 2 scaffold: Tesla regulatory-event provider port.
//
// Interface-only. A concrete TeslaRegulatoryEventProvider (Fleet API
// regulatory feed / signed export reader) is wired by a downstream Phase 2
// execution wave. Events are regulatory-grade and feed accident investigation
// and regulatory reporting.

export interface TeslaRegulatoryEventQuery {
  externalVehicleRef: string;
  since: string;
  until?: string;
}

export interface TeslaRegulatoryEventProvider {
  fetchEvents(query: TeslaRegulatoryEventQuery): Promise<TeslaRegulatoryEvent[]>;
}
