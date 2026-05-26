import { Injectable } from "@nestjs/common";

import type {
  ActionReceipt,
  AdvanceTenantRolloutCommand,
  TenantRolloutStateMachineRecord,
} from "@drts/contracts";

import { TenantsService } from "../platform-admin/tenants.service";
import { buildTenantRolloutStateMachineRecord } from "./tenant-rollout-state";

@Injectable()
export class TenantRolloutService {
  constructor(private readonly tenants: TenantsService) {}

  getState(tenantId: string): TenantRolloutStateMachineRecord {
    return buildTenantRolloutStateMachineRecord(this.tenants.get(tenantId));
  }

  advance(
    tenantId: string,
    command: AdvanceTenantRolloutCommand,
    requestId?: string,
  ): ActionReceipt {
    return this.tenants.advanceRollout(tenantId, command, requestId);
  }
}
