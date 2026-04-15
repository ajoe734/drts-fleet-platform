import { Controller, Get } from "@nestjs/common";

export function buildHealthPayload() {
  return {
    service: "api",
    status: "ok",
    mode: "phase1_foundation",
    execution_mode: "supervisor_managed_execution",
    timestamp: new Date().toISOString(),
  };
}

@Controller("health")
export class HealthController {
  @Get()
  getHealth() {
    return buildHealthPayload();
  }
}
