import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, Logger } from "@nestjs/common";

import type {
  AuditLogRecord,
  CreatePlatformTenantCommand,
  PlatformAdminTenantRecord,
  PlatformTenantModule,
  PlatformTenantQuotaSummary,
  UpdatePlatformTenantSettingsCommand,
} from "@drts/contracts";
import { PLATFORM_TENANT_MODULES } from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";

export type TenantSummary = PlatformAdminTenantRecord;

const DEFAULT_QUOTAS: PlatformTenantQuotaSummary = {
  activeDrivers: 25,
  monthlyBookings: 500,
  monthlyApiCalls: 10000,
};

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);
  private readonly tenants: Map<string, PlatformAdminTenantRecord> = new Map();

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
  ) {
    const now = "2026-04-01T00:00:00.000Z";
    const seed: PlatformAdminTenantRecord = {
      id: "t_demo",
      code: "demo",
      name: "Demo Tenant",
      status: "active",
      enabledModules: ["enterprise_dispatch", "billing", "reporting"],
      quotas: {
        activeDrivers: 50,
        monthlyBookings: 1200,
        monthlyApiCalls: 80000,
      },
      createdAt: now,
      updatedAt: now,
    };
    this.tenants.set(seed.id, seed);
  }

  list(): TenantSummary[] {
    return Array.from(this.tenants.values()).map((tenant) =>
      this.cloneTenant(tenant),
    );
  }

  create(
    input: CreatePlatformTenantCommand,
    requestId?: string,
  ): TenantSummary {
    const name = this.requireNonBlank(input.name, "name");
    const code = this.normalizeCode(input.code);
    this.assertCodeAvailable(code);

    const now = new Date().toISOString();
    const created: PlatformAdminTenantRecord = {
      id: `t_${randomUUID().slice(0, 8)}`,
      code,
      name,
      status: input.status === "inactive" ? "paused" : "active",
      enabledModules: this.normalizeModules(input.enabledModules),
      quotas: this.mergeQuotas(DEFAULT_QUOTAS, input.quotas),
      createdAt: now,
      updatedAt: now,
    };

    this.tenants.set(created.id, created);
    this.logger.log(`Created tenant ${created.id} (${created.code})`);
    this.recordAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "create_platform_tenant",
        resourceType: "platform_tenant",
        resourceId: created.id,
        newValuesSummary: {
          code: created.code,
          status: created.status,
          enabledModules: [...created.enabledModules],
          quotas: { ...created.quotas },
        },
      },
      requestId,
    );
    return this.cloneTenant(created);
  }

  updateSettings(
    tenantId: string,
    command: UpdatePlatformTenantSettingsCommand,
    requestId?: string,
  ): TenantSummary {
    const tenant = this.requireTenant(tenantId);
    const before = this.cloneTenant(tenant);

    if (typeof command.name === "string") {
      tenant.name = this.requireNonBlank(command.name, "name");
    }
    if (command.enabledModules) {
      tenant.enabledModules = this.normalizeModules(command.enabledModules);
    }
    if (command.quotas) {
      tenant.quotas = this.mergeQuotas(tenant.quotas, command.quotas);
    }
    tenant.updatedAt = new Date().toISOString();

    this.recordAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "update_platform_tenant_settings",
        resourceType: "platform_tenant",
        resourceId: tenant.id,
        oldValuesSummary: {
          name: before.name,
          enabledModules: [...before.enabledModules],
          quotas: { ...before.quotas },
        },
        newValuesSummary: {
          name: tenant.name,
          enabledModules: [...tenant.enabledModules],
          quotas: { ...tenant.quotas },
        },
      },
      requestId,
    );

    return this.cloneTenant(tenant);
  }

  setStatus(
    tenantId: string,
    newStatus: "active" | "paused",
    requestId?: string,
  ): TenantSummary {
    const tenant = this.requireTenant(tenantId);
    const oldStatus = tenant.status;
    tenant.status = newStatus;
    tenant.updatedAt = new Date().toISOString();
    this.logger.log(`Tenant ${tenantId} status set to ${newStatus}`);
    this.recordAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "update_platform_tenant_status",
        resourceType: "platform_tenant",
        resourceId: tenant.id,
        oldValuesSummary: { status: oldStatus },
        newValuesSummary: { status: newStatus },
      },
      requestId,
    );
    return this.cloneTenant(tenant);
  }

  private requireTenant(tenantId: string): PlatformAdminTenantRecord {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "TENANT_NOT_FOUND",
        "Tenant not found.",
        { tenantId },
      );
    }
    return tenant;
  }

  private assertCodeAvailable(code: string) {
    const duplicate = Array.from(this.tenants.values()).some(
      (tenant) => tenant.code === code,
    );
    if (duplicate) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "TENANT_CODE_CONFLICT",
        "Tenant code already exists.",
        { code },
      );
    }
  }

  private normalizeCode(value: string) {
    const trimmed = this.requireNonBlank(value, "code").toLowerCase();
    const normalized = trimmed
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!normalized) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "TENANT_CODE_INVALID",
        "Tenant code must contain letters or numbers.",
        { code: value },
      );
    }
    return normalized;
  }

  private normalizeModules(
    modules?: readonly PlatformTenantModule[],
  ): PlatformTenantModule[] {
    if (!modules || modules.length === 0) {
      return ["enterprise_dispatch"];
    }
    const unique = new Set<PlatformTenantModule>();
    for (const moduleCode of modules) {
      if (!PLATFORM_TENANT_MODULES.includes(moduleCode)) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "TENANT_MODULE_INVALID",
          "Unknown tenant module.",
          { moduleCode },
        );
      }
      unique.add(moduleCode);
    }
    return Array.from(unique);
  }

  private mergeQuotas(
    base: PlatformTenantQuotaSummary,
    incoming?: Partial<PlatformTenantQuotaSummary>,
  ): PlatformTenantQuotaSummary {
    return {
      activeDrivers: this.normalizeQuota(
        incoming?.activeDrivers ?? base.activeDrivers,
        "activeDrivers",
      ),
      monthlyBookings: this.normalizeQuota(
        incoming?.monthlyBookings ?? base.monthlyBookings,
        "monthlyBookings",
      ),
      monthlyApiCalls: this.normalizeQuota(
        incoming?.monthlyApiCalls ?? base.monthlyApiCalls,
        "monthlyApiCalls",
      ),
    };
  }

  private normalizeQuota(value: number, field: string): number {
    if (!Number.isFinite(value) || value < 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "TENANT_QUOTA_INVALID",
        `Invalid quota value for ${field}.`,
        { field, value },
      );
    }
    return Math.floor(value);
  }

  private requireNonBlank(value: string, field: string): string {
    const normalized = value.trim();
    if (!normalized) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FIELD_REQUIRED",
        `${field} is required.`,
        { field },
      );
    }
    return normalized;
  }

  private cloneTenant(
    tenant: PlatformAdminTenantRecord,
  ): PlatformAdminTenantRecord {
    return {
      ...tenant,
      enabledModules: [...tenant.enabledModules],
      quotas: { ...tenant.quotas },
    };
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
  ) {
    this.auditNotificationService.recordAuditLog({
      ...input,
      ...(requestId ? { requestId } : {}),
    });
  }
}
