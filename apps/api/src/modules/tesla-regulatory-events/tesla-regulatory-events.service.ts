import { Injectable, Logger } from "@nestjs/common";

import type { TeslaRegulatoryEventProvider } from "./tesla-regulatory-events.ports";

/**
 * TeslaRegulatoryEventsService — Phase 2 scaffold.
 *
 * Scaffold-only: registers the regulatory autonomy-event ingestion surface
 * (FSD engagement/disengagement, safety interventions, collisions) for the
 * phase2-tesla-fsd-sandbox-202606 phase. The concrete
 * TeslaRegulatoryEventProvider and persistence against
 * av_sandbox.tesla_regulatory_events (V0037) land in downstream waves.
 */
@Injectable()
export class TeslaRegulatoryEventsService {
  private readonly logger = new Logger(TeslaRegulatoryEventsService.name);

  private eventProvider: TeslaRegulatoryEventProvider | null = null;
}
