import { Injectable } from "@nestjs/common";
import type { AdapterHealthReason, AdapterHealthRecord } from "@drts/contracts";
import type {
  UiHealthDegradedService,
  UiHealthEnvelope,
} from "@drts/contracts";

import { ForwarderService } from "../modules/forwarder/forwarder.service";

@Injectable()
export class HealthService {
  constructor(private readonly forwarderService: ForwarderService) {}

  getHealthEnvelope(): UiHealthEnvelope {
    const adapterHealth = this.forwarderService.listAdapterHealth();
    const degradedServices = adapterHealth
      .filter(this.isDegradedAdapter)
      .sort((left, right) =>
        left.platformCode.localeCompare(right.platformCode),
      )
      .map((adapter) => this.toDegradedService(adapter));

    return {
      status: this.resolveStatus(degradedServices),
      degradedServices,
      lastCheckedAt: this.resolveLastCheckedAt(adapterHealth),
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
    adapter: DegradedAdapterHealth,
  ): UiHealthDegradedService {
    return {
      service: adapter.platformCode,
      impact: this.describeImpact(adapter.reason),
      severity: adapter.status === "down" ? "critical" : "warning",
    };
  }

  private describeImpact(reason: AdapterHealthReason): string {
    switch (reason) {
      case "auth":
        return "Forwarder authentication";
      case "credential":
        return "Forwarder credentials";
      case "platform":
        return "Forwarded order sync";
      case "rate_limit":
        return "Forwarder API rate limits";
      case "webhook":
        return "Forwarded webhook delivery";
      case "none":
      case "stub":
        return "Platform forwarding";
    }
  }

  private resolveLastCheckedAt(adapterHealth: AdapterHealthRecord[]): string {
    const timestamps = adapterHealth
      .map((adapter) => Date.parse(adapter.lastCheckedAt))
      .filter((timestamp) => Number.isFinite(timestamp));

    if (timestamps.length === 0) {
      return new Date().toISOString();
    }

    return new Date(Math.max(...timestamps)).toISOString();
  }

  private isDegradedAdapter(
    adapter: AdapterHealthRecord,
  ): adapter is DegradedAdapterHealth {
    return adapter.status !== "healthy";
  }
}

type DegradedAdapterHealth = AdapterHealthRecord & {
  status: "degraded" | "down";
};
