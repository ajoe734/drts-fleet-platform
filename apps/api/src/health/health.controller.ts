import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  getHealth() {
    return {
      service: "api",
      status: "ok",
      mode: "phase1_foundation",
      executionMode: "supervisor_managed_execution",
      timestamp: new Date().toISOString(),
    };
  }
}
