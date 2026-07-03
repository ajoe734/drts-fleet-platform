import { Controller, Get, Headers } from "@nestjs/common";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { RequireRealms, RequireScopes } from "../../common/auth";
import {
  MapGeofenceObservabilityService,
  type MapGeofenceObservabilitySnapshot,
} from "./map-geofence-observability.service";

@Controller("map-geofence-observability")
export class MapGeofenceObservabilityController {
  constructor(
    private readonly observabilityService: MapGeofenceObservabilityService,
  ) {}

  @Get()
  @RequireRealms("platform", "ops")
  @RequireScopes("audit:read")
  getSnapshot(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope<MapGeofenceObservabilitySnapshot>(
      this.observabilityService.getSnapshot(),
      requestId,
    );
  }
}
