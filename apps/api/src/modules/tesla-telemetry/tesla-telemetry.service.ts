import { Injectable, Logger } from "@nestjs/common";

import type {
  TeslaPublicTelemetryAdapter,
  TeslaVehicleStatePort,
} from "./tesla-telemetry.ports";

/**
 * TeslaTelemetryService — Phase 2 scaffold.
 *
 * Scaffold-only: registers the Tesla telemetry ingestion surface (Fleet API
 * vehicle-state sync + public-telemetry fallback) for the
 * phase2-tesla-fsd-sandbox-202606 phase. Concrete adapters and persistence
 * against av_sandbox.tesla_vehicle_state_snapshots /
 * av_sandbox.tesla_public_telemetry_samples (V0037) land in downstream waves.
 */
@Injectable()
export class TeslaTelemetryService {
  private readonly logger = new Logger(TeslaTelemetryService.name);

  private vehicleStatePort: TeslaVehicleStatePort | null = null;
  private publicTelemetryAdapter: TeslaPublicTelemetryAdapter | null = null;
}
