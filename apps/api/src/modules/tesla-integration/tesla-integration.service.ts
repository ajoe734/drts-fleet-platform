import { Injectable, Logger } from "@nestjs/common";

import type { TeslaRemoteCommandPort } from "./tesla-integration.ports";

/**
 * TeslaIntegrationService — Phase 2 scaffold.
 *
 * Scaffold-only: registers the Tesla Fleet API integration surface (remote
 * command bridge, vehicle state sync) for the phase2-tesla-fsd-sandbox-202606
 * phase. The concrete TeslaRemoteCommandPort adapter and persistence against
 * av_sandbox.command_receipts (V0037) are implemented by downstream waves.
 */
@Injectable()
export class TeslaIntegrationService {
  private readonly logger = new Logger(TeslaIntegrationService.name);

  // Populated once a concrete Tesla Fleet API adapter is wired downstream.
  private commandPort: TeslaRemoteCommandPort | null = null;
}
