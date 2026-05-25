import {
  PLATFORM_CODE_REGISTRY,
  type CrossAppResourceLink,
  type SearchResultRecord,
} from "@drts/contracts";
import { Injectable } from "@nestjs/common";

import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { PlatformAdminService } from "../platform-admin/platform-admin.service";
import { TenantsService } from "../platform-admin/tenants.service";
import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";

export type PlatformSearchCategory =
  | "tenants"
  | "partners"
  | "users"
  | "adapter_registry"
  | "audit";

export type PlatformSearchResponse = Record<
  PlatformSearchCategory,
  SearchResultRecord[]
>;

@Injectable()
export class SearchService {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly platformAdminService: PlatformAdminService,
    private readonly tenantPartnerService: TenantPartnerService,
    private readonly auditNotificationService: AuditNotificationService,
  ) {}

  search(rawQuery?: string | null): PlatformSearchResponse {
    const query = rawQuery?.trim().toLowerCase();
    if (!query) {
      return this.emptyResults();
    }

    const tenants = this.tenantsService
      .list()
      .map((tenant) =>
        this.buildResult(
          "tenants",
          "platform_tenant",
          tenant.id,
          tenant.name,
          this.joinSecondaryLabel([tenant.code, tenant.status]),
          this.buildLink(
            "platform-admin",
            `/tenants/${tenant.id}`,
            "platform_tenant",
            tenant.id,
            `Open tenant ${tenant.name}`,
          ),
          query,
          {
            tenant_id: tenant.id,
            code: tenant.code,
            name: tenant.name,
            status: tenant.status,
          },
        ),
      )
      .filter((result): result is SearchResultRecord => result !== null);

    const partners = this.tenantPartnerService
      .listPlatformPartnerEntries()
      .map((entry) =>
        this.buildResult(
          "partners",
          "partner_channel_entry",
          entry.entrySlug,
          entry.displayName,
          this.joinSecondaryLabel([
            entry.partnerCode,
            entry.programCode ?? entry.programId,
            entry.tenantId,
          ]),
          this.buildLink(
            "platform-admin",
            `/partners/${entry.entrySlug}`,
            "partner_channel_entry",
            entry.entrySlug,
            `Open partner ${entry.displayName}`,
          ),
          query,
          {
            entry_slug: entry.entrySlug,
            display_name: entry.displayName,
            partner_code: entry.partnerCode,
            partner_type: entry.partnerType,
            program_id: entry.programId,
            program_code: entry.programCode,
            tenant_id: entry.tenantId,
            status: entry.status,
          },
        ),
      )
      .filter((result): result is SearchResultRecord => result !== null);

    const platformAdminUsers = this.platformAdminService
      .listPlatformAdminUsers()
      .map((user) =>
        this.buildResult(
          "users",
          "platform_admin_user",
          user.userId,
          user.displayName,
          this.joinSecondaryLabel([user.email, user.roleCode, user.status]),
          this.buildLink(
            "platform-admin",
            `/users/${user.userId}`,
            "platform_admin_user",
            user.userId,
            `Open user ${user.displayName}`,
          ),
          query,
          {
            user_id: user.userId,
            display_name: user.displayName,
            email: user.email,
            role_code: user.roleCode,
            status: user.status,
          },
        ),
      )
      .filter((result): result is SearchResultRecord => result !== null);

    const tenantUsers = this.tenantsService
      .list()
      .flatMap((tenant) =>
        this.tenantPartnerService.listTenantUsers(tenant.id).map((user) =>
          this.buildResult(
            "users",
            "tenant_user",
            user.userId,
            user.displayName,
            this.joinSecondaryLabel([
              user.email,
              user.roleCode,
              tenant.code,
              user.status,
            ]),
            this.buildLink(
              "platform-admin",
              `/tenants/${tenant.id}/users/${user.userId}`,
              "tenant_user",
              user.userId,
              `Open tenant user ${user.displayName}`,
            ),
            query,
            {
              tenant_id: tenant.id,
              tenant_code: tenant.code,
              user_id: user.userId,
              display_name: user.displayName,
              email: user.email,
              role_code: user.roleCode,
              status: user.status,
            },
          ),
        ),
      )
      .filter((result): result is SearchResultRecord => result !== null);

    const adapterRegistry = Object.values(PLATFORM_CODE_REGISTRY)
      .map((entry) =>
        this.buildResult(
          "adapter_registry",
          "platform_adapter_registry_entry",
          entry.code,
          entry.displayName,
          this.joinSecondaryLabel([entry.code, entry.status]),
          this.buildLink(
            "platform-admin",
            `/adapter-registry/${entry.code}`,
            "platform_adapter_registry_entry",
            entry.code,
            `Open adapter ${entry.displayName}`,
          ),
          query,
          {
            platform_code: entry.code,
            display_name: entry.displayName,
            status: entry.status,
            forwarder_adapter_key: entry.forwarderAdapterKey,
          },
        ),
      )
      .filter((result): result is SearchResultRecord => result !== null);

    const audit = this.auditNotificationService
      .getAuditLogsSnapshot()
      .map((auditLog) =>
        this.buildResult(
          "audit",
          "audit_log",
          auditLog.auditId,
          auditLog.actionName,
          this.joinSecondaryLabel([
            auditLog.moduleName,
            auditLog.resourceType,
            auditLog.resourceId,
          ]),
          this.buildLink(
            "platform-admin",
            `/audit?auditId=${auditLog.auditId}`,
            "audit_log",
            auditLog.auditId,
            `Open audit ${auditLog.auditId}`,
          ),
          query,
          {
            audit_id: auditLog.auditId,
            action_name: auditLog.actionName,
            module_name: auditLog.moduleName,
            resource_type: auditLog.resourceType,
            resource_id: auditLog.resourceId,
            actor_id: auditLog.actorId,
            tenant_id: auditLog.tenantId,
            request_id: auditLog.requestId,
          },
        ),
      )
      .filter((result): result is SearchResultRecord => result !== null);

    return {
      tenants,
      partners,
      users: [...platformAdminUsers, ...tenantUsers],
      adapter_registry: adapterRegistry,
      audit,
    };
  }

  private emptyResults(): PlatformSearchResponse {
    return {
      tenants: [],
      partners: [],
      users: [],
      adapter_registry: [],
      audit: [],
    };
  }

  private buildResult(
    category: PlatformSearchCategory,
    resourceType: string,
    resourceId: string,
    primaryLabel: string,
    secondaryLabel: string | undefined,
    link: CrossAppResourceLink,
    query: string,
    fields: Record<string, string | null | undefined>,
  ): SearchResultRecord | null {
    const matchedFields = Object.entries(fields)
      .filter(([, value]) => value?.toLowerCase().includes(query))
      .map(([field]) => field);

    if (matchedFields.length === 0) {
      return null;
    }

    return {
      category,
      resourceType,
      resourceId,
      primaryLabel,
      ...(secondaryLabel ? { secondaryLabel } : {}),
      link,
      matchedFields,
    };
  }

  private buildLink(
    targetApp: CrossAppResourceLink["targetApp"],
    route: string,
    resourceType: string,
    resourceId: string,
    label: string,
  ): CrossAppResourceLink {
    return {
      targetApp,
      route,
      resourceType,
      resourceId,
      openMode: "new_tab",
      label,
    };
  }

  private joinSecondaryLabel(
    parts: Array<string | null | undefined>,
  ): string | undefined {
    const values = parts.filter((part): part is string =>
      Boolean(part?.trim()),
    );
    return values.length > 0 ? values.join(" • ") : undefined;
  }
}
