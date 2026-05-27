import { Controller, Get } from "@nestjs/common";

import { PlatformAdminHealthService } from "./platform-admin-health.service";

@Controller("admin")
export class PlatformAdminHealthController {
  constructor(
    private readonly platformAdminHealthService: PlatformAdminHealthService,
  ) {}

  @Get("health/ui")
  getUiHealth() {
    return this.platformAdminHealthService.getUiHealth();
  }
}
