import { Injectable } from "@nestjs/common";
import type { UiHealthDegradedService, UiHealthEnvelope } from "@drts/contracts";

import { ForwarderService } from "../modules/forwarder/forwarder.service";

@Injectable()
export class HealthService {
  constructor(private readonly forwarderService: ForwarderService) {}

  getHealthEnvelope(): UiHealthEnvelope {
    const degradedServices = this.forwarderService
      .listAdapterHealth()
      .filter((adapter) => adapter.status !== "healthy")
      .map((adapter) => this.toDegradedService(adapter));

    return {
      status: this.resolveStatus(degradedServices),
      degradedServices,
      lastCheckedAt: new Date().toISOString(),
    };
  }

  private resolveStatus(
    degradedServices: UiHealthDegradedService[],
  ): UiHealthEnvelope["status"] {
    if (degradedServices.some((service) => service.severity === "critical")) {
      return "down";
    }

    if (degradedServices.length > 0) {
      return "degraded";
    }

    return "healthy";
  }

  private toDegradedService(
    adapter: ReturnType<ForwarderService["listAdapterHealth"]>[number],
  ): UiHealthDegradedService {
    return {
      service: adapter.platformCode,
      impact: this.describeImpact(adapter.status),
      severity: adapter.status === "down" ? "critical" : "warning",
    };
  }

  private describeImpact(status: "degraded" | "down"): string {
    switch (status) {
      case "down":
        return "Platform forwarding unavailable";
      case "degraded":
        return "Platform forwarding delayed";
    }
  }
}
