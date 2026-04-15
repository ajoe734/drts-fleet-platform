import { HttpStatus, Injectable, Logger } from "@nestjs/common";

import { ApiRequestError } from "../../common/api-envelope";

export interface TenantSummary {
  id: string;
  name: string;
  status: "draft" | "active" | "paused";
}

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);
  private tenants: Map<string, TenantSummary> = new Map();

  constructor() {
    // Seed a demo tenant for bootstrap UX
    const seed: TenantSummary = {
      id: "t_demo",
      name: "Demo Tenant",
      status: "active",
    };
    this.tenants.set(seed.id, seed);
  }

  list(): TenantSummary[] {
    return Array.from(this.tenants.values());
  }

  create(input: {
    name: string;
    status?: "active" | "inactive";
  }): TenantSummary {
    const id = `t_${Math.random().toString(36).slice(2, 8)}`;
    const status = input.status === "inactive" ? "paused" : "active";
    const created: TenantSummary = { id, name: input.name, status };
    this.tenants.set(id, created);
    this.logger.log(`Created tenant ${id} (${created.name})`);
    return created;
  }

  setStatus(tenantId: string, newStatus: "active" | "paused"): TenantSummary {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "TENANT_NOT_FOUND",
        "Tenant not found.",
        { tenantId },
      );
    }
    tenant.status = newStatus;
    this.logger.log(`Tenant ${tenantId} status set to ${newStatus}`);
    return { ...tenant };
  }
}
