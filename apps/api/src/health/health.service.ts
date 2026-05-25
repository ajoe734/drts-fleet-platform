import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../common/db/database.service";
import type {
  UiHealthEnvelope,
  UiHealthDegradedService,
} from "@drts/contracts";

export function buildHealthPayload(
  degradedServices: UiHealthDegradedService[],
): UiHealthEnvelope {
  const status: "healthy" | "degraded" | "down" =
    degradedServices.length === 0
      ? "healthy"
      : degradedServices.some((d) => d.severity === "critical")
        ? "down"
        : "degraded";

  return {
    status,
    lastCheckedAt: new Date().toISOString(),
    degradedServices,
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  constructor(private readonly databaseService: DatabaseService) {}

  async getHealth(): Promise<UiHealthEnvelope> {
    const degradedServices: UiHealthDegradedService[] = [];

    // Check Database Health
    if (this.databaseService.isEnabled()) {
      try {
        await this.databaseService.query("SELECT 1");
      } catch (error) {
        this.logger.error("Database health check failed", error);
        degradedServices.push({
          service: "database",
          impact: "Database connection failed",
          severity: "critical",
        });
      }
    }

    // Check Additional Services
    degradedServices.push(...(await this.getAdditionalDegradedServices()));

    return buildHealthPayload(degradedServices);
  }

  protected async getAdditionalDegradedServices(): Promise<
    UiHealthDegradedService[]
  > {
    return [];
  }
}
