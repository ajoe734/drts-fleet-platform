import type {
  TeslaPublicTelemetrySample,
  TeslaVehicleStateSnapshot,
} from "@drts/contracts";

// Phase 2 scaffold: Tesla telemetry ingestion ports.
//
// Interface-only. TeslaPublicTelemetryAdapter is the lower-trust public feed
// used where Fleet API access is unavailable; TeslaVehicleStatePort is the
// authoritative Fleet API vehicle-state sync. Concrete adapters are wired by a
// downstream Phase 2 execution wave.

export interface TeslaPublicTelemetryAdapter {
  fetchLatestSample(
    externalVehicleRef: string,
  ): Promise<TeslaPublicTelemetrySample | null>;
}

export interface TeslaVehicleStatePort {
  fetchVehicleState(
    externalVehicleRef: string,
  ): Promise<TeslaVehicleStateSnapshot | null>;
}
