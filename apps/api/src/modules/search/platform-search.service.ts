import { HttpStatus, Injectable } from "@nestjs/common";
import type {
  AdapterHealthRecord,
  AuditLogRecord,
  CrossAppResourceLink,
  PartnerChannelEntryRecord,
  PlatformAdminTenantRecord,
  PlatformAdminUserRecord,
  SearchResultRecord,
  TenantUserRoleRecord,
} from "@drts/contracts";
import { PLATFORM_CODE_REGISTRY } from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { ForwarderService } from "../forwarder/forwarder.service";
import { PlatformAdminService } from "../platform-admin/platform-admin.service";
import { TenantsService } from "../platform-admin/tenants.service";
import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";
import {
  PLATFORM_SEARCH_CATEGORY_ORDER,
  type PlatformSearchCategory,
  type PlatformSearchResultGroup,
} from "./platform-search.types";

type SearchFieldValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly (string | number | boolean | null | undefined)[];

type SearchPrimitiveValue = string | number | boolean | null | undefined;

type SearchCandidate = {
  category: PlatformSearchCategory;
  resourceType: string;
  resourceId: string;
  primaryLabel: string;
  secondaryLabel?: string;
  link: CrossAppResourceLink;
  fields: Record<string, SearchFieldValue>;
};

type SearchMatch = {
  result: SearchResultRecord;
  score: number;
};

const PLATFORM_SEARCH_TYPE_ALIASES: Record<string, PlatformSearchCategory> = {
  tenant: "tenants",
  tenants: "tenants",
  partner: "partners",
  partners: "partners",
  user: "users",
  users: "users",
  adapter: "adapter_registry",
  adapters: "adapter_registry",
  "adapter-registry": "adapter_registry",
  adapter_registry: "adapter_registry",
  audit: "audit",
  "audit-event": "audit",
  "audit-events": "audit",
  audit_event: "audit",
  audit_events: "audit",
};

const PLATFORM_SEARCH_ALLOWED_TYPES = [
  "tenants",
  "partners",
  "users",
  "adapter-registry",
  "audit",
];

@Injectable()
export class PlatformSearchService {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly platformAdminService: PlatformAdminService,
    private readonly tenantPartnerService: TenantPartnerService,
    private readonly forwarderService: ForwarderService,
    private readonly auditNotificationService: AuditNotificationService,
  ) {}

  searchPlatform(
    query: string | undefined,
    requestedTypes?: string | string[],
  ): PlatformSearchResultGroup[] {
    const categories = this.resolveCategories(requestedTypes);
    const normalizedQuery = this.normalizeQuery(query);

    if (!normalizedQuery) {
      return [];
    }

    const resultsByCategory = new Map<
      PlatformSearchCategory,
      SearchResultRecord[]
    >();

    for (const category of categories) {
      const items = this.searchCategory(category, normalizedQuery);
      if (items.length > 0) {
        resultsByCategory.set(category, items);
      }
    }

    return PLATFORM_SEARCH_CATEGORY_ORDER.filter((category) =>
      resultsByCategory.has(category),
    ).map((category) => ({
      category,
      items: resultsByCategory.get(category)!,
    }));
  }

  private resolveCategories(
    requestedTypes?: string | string[],
  ): PlatformSearchCategory[] {
    if (requestedTypes === undefined) {
      return [...PLATFORM_SEARCH_CATEGORY_ORDER];
    }

    const rawValues = (
      Array.isArray(requestedTypes) ? requestedTypes : [requestedTypes]
    )
      .flatMap((value) => value.split(","))
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    if (rawValues.length === 0) {
      return [...PLATFORM_SEARCH_CATEGORY_ORDER];
    }

    const categories = new Set<PlatformSearchCategory>();
    const invalidValues: string[] = [];

    for (const rawValue of rawValues) {
      const normalized = PLATFORM_SEARCH_TYPE_ALIASES[rawValue];
      if (!normalized) {
        invalidValues.push(rawValue);
        continue;
      }
      categories.add(normalized);
    }

    if (invalidValues.length > 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PLATFORM_SEARCH_TYPE_INVALID",
        "One or more platform search types are invalid.",
        {
          invalidTypes: invalidValues,
          allowedTypes: PLATFORM_SEARCH_ALLOWED_TYPES,
        },
      );
    }

    return PLATFORM_SEARCH_CATEGORY_ORDER.filter((category) =>
      categories.has(category),
    );
  }

  private normalizeQuery(query: string | undefined) {
    return query?.trim().toLowerCase() ?? "";
  }

  private searchCategory(
    category: PlatformSearchCategory,
    normalizedQuery: string,
  ) {
    switch (category) {
      case "tenants":
        return this.searchCandidates(
          normalizedQuery,
          this.buildTenantCandidates(),
        );
      case "partners":
        return this.searchCandidates(
          normalizedQuery,
          this.buildPartnerCandidates(),
        );
      case "users":
        return this.searchCandidates(
          normalizedQuery,
          this.buildUserCandidates(),
        );
      case "adapter_registry":
        return this.searchCandidates(
          normalizedQuery,
          this.buildAdapterCandidates(),
        );
      case "audit":
        return this.searchCandidates(
          normalizedQuery,
          this.buildAuditCandidates(),
        );
    }
  }

  private buildTenantCandidates(): SearchCandidate[] {
    return this.tenantsService
      .list()
      .map((tenant) => this.buildTenantCandidate(tenant));
  }

  private buildPartnerCandidates(): SearchCandidate[] {
    return this.tenantPartnerService
      .listPlatformPartnerEntries()
      .map((entry) => this.buildPartnerCandidate(entry));
  }

  private buildUserCandidates(): SearchCandidate[] {
    const platformUsers = this.platformAdminService
      .listPlatformAdminUsers()
      .map((user) => this.buildPlatformUserCandidate(user));

    const tenantUsers = this.tenantsService
      .list()
      .flatMap((tenant) =>
        this.tenantPartnerService
          .listTenantUsers(tenant.id)
          .map((user) => this.buildTenantUserCandidate(tenant, user)),
      );

    return [...platformUsers, ...tenantUsers];
  }

  private buildAdapterCandidates(): SearchCandidate[] {
    return this.forwarderService
      .listAdapterHealth()
      .map((adapter) => this.buildAdapterCandidate(adapter));
  }

  private buildAuditCandidates(): SearchCandidate[] {
    return this.auditNotificationService
      .getAuditLogsSnapshot()
      .map((auditLog) => this.buildAuditCandidate(auditLog));
  }

  private buildTenantCandidate(
    tenant: PlatformAdminTenantRecord,
  ): SearchCandidate {
    return {
      category: "tenants",
      resourceType: "platform_tenant",
      resourceId: tenant.id,
      primaryLabel: tenant.name,
      secondaryLabel: `${tenant.code} · ${tenant.status} · ${tenant.integrationPackage.mode}`,
      link: this.buildLink(
        `/tenants/${encodeURIComponent(tenant.id)}`,
        "platform_tenant",
        tenant.id,
        "View tenant",
      ),
      fields: {
        id: tenant.id,
        code: tenant.code,
        name: tenant.name,
        status: tenant.status,
        integrationMode: tenant.integrationPackage.mode,
        enabledModules: tenant.enabledModules,
      },
    };
  }

  private buildPartnerCandidate(
    entry: PartnerChannelEntryRecord,
  ): SearchCandidate {
    return {
      category: "partners",
      resourceType: "partner_entry",
      resourceId: entry.entrySlug,
      primaryLabel: entry.displayName,
      secondaryLabel: `${entry.partnerCode} · ${entry.programId} · ${entry.status}`,
      link: this.buildLink(
        `/partners/${encodeURIComponent(entry.entrySlug)}`,
        "partner_entry",
        entry.entrySlug,
        "View partner",
      ),
      fields: {
        displayName: entry.displayName,
        entrySlug: entry.entrySlug,
        partnerCode: entry.partnerCode,
        partnerType: entry.partnerType,
        programId: entry.programId,
        programCode: entry.programCode,
        bankCode: entry.bankCode,
        tenantId: entry.tenantId,
        status: entry.status,
      },
    };
  }

  private buildPlatformUserCandidate(
    user: PlatformAdminUserRecord,
  ): SearchCandidate {
    return {
      category: "users",
      resourceType: "platform_admin_user",
      resourceId: user.userId,
      primaryLabel: user.displayName,
      secondaryLabel: `${user.email} · ${user.roleCode} · platform`,
      link: this.buildLink(
        `/users?userId=${encodeURIComponent(user.userId)}`,
        "platform_admin_user",
        user.userId,
        "View platform user",
      ),
      fields: {
        userId: user.userId,
        displayName: user.displayName,
        email: user.email,
        roleCode: user.roleCode,
        status: user.status,
        realm: "platform",
      },
    };
  }

  private buildTenantUserCandidate(
    tenant: PlatformAdminTenantRecord,
    user: TenantUserRoleRecord,
  ): SearchCandidate {
    return {
      category: "users",
      resourceType: "tenant_user",
      resourceId: user.userId,
      primaryLabel: user.displayName,
      secondaryLabel: `${user.email} · ${user.roleCode} · ${tenant.code}`,
      link: this.buildLink(
        `/tenants/${encodeURIComponent(tenant.id)}?tab=users&userId=${encodeURIComponent(user.userId)}`,
        "tenant_user",
        user.userId,
        "View tenant user",
      ),
      fields: {
        userId: user.userId,
        tenantId: user.tenantId,
        tenantCode: tenant.code,
        tenantName: tenant.name,
        displayName: user.displayName,
        email: user.email,
        roleCode: user.roleCode,
        status: user.status,
        realm: "tenant",
      },
    };
  }

  private buildAdapterCandidate(adapter: AdapterHealthRecord): SearchCandidate {
    const registryEntry = PLATFORM_CODE_REGISTRY[adapter.platformCode];
    const primaryLabel = registryEntry?.displayName ?? adapter.platformCode;
    return {
      category: "adapter_registry",
      resourceType: "adapter_health",
      resourceId: adapter.platformCode,
      primaryLabel,
      secondaryLabel: `${adapter.platformCode} · ${adapter.status} · ${adapter.credentialStatus}`,
      link: this.buildLink(
        `/adapter-registry?platformCode=${encodeURIComponent(adapter.platformCode)}`,
        "adapter_health",
        adapter.platformCode,
        "View adapter",
      ),
      fields: {
        platformCode: adapter.platformCode,
        displayName: primaryLabel,
        status: adapter.status,
        reason: adapter.reason,
        credentialStatus: adapter.credentialStatus,
        authStatus: adapter.authStatus,
        webhookStatus: adapter.webhookStatus,
        rateLimitStatus: adapter.rateLimitStatus,
      },
    };
  }

  private buildAuditCandidate(auditLog: AuditLogRecord): SearchCandidate {
    return {
      category: "audit",
      resourceType: "audit_log",
      resourceId: auditLog.auditId,
      primaryLabel: auditLog.actionName,
      secondaryLabel: `${auditLog.moduleName} · ${auditLog.resourceType} · ${auditLog.actorId ?? "system"}`,
      link: this.buildLink(
        `/audit?auditId=${encodeURIComponent(auditLog.auditId)}`,
        "audit_log",
        auditLog.auditId,
        "View audit log",
      ),
      fields: {
        auditId: auditLog.auditId,
        actorId: auditLog.actorId,
        actorType: auditLog.actorType,
        moduleName: auditLog.moduleName,
        actionName: auditLog.actionName,
        resourceType: auditLog.resourceType,
        resourceId: auditLog.resourceId,
        requestId: auditLog.requestId,
      },
    };
  }

  private buildLink(
    route: string,
    resourceType: string,
    resourceId: string,
    label: string,
  ): CrossAppResourceLink {
    return {
      targetApp: "platform-admin",
      route,
      resourceType,
      resourceId,
      openMode: "same_tab",
      label,
    };
  }

  private searchCandidates(
    normalizedQuery: string,
    candidates: SearchCandidate[],
  ): SearchResultRecord[] {
    return candidates
      .map((candidate) => this.matchCandidate(candidate, normalizedQuery))
      .filter((candidate): candidate is SearchMatch => candidate !== null)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return left.result.primaryLabel.localeCompare(
          right.result.primaryLabel,
        );
      })
      .map(({ result }) => result);
  }

  private matchCandidate(
    candidate: SearchCandidate,
    normalizedQuery: string,
  ): SearchMatch | null {
    const matchedFields: string[] = [];
    let score = 0;

    for (const [fieldName, rawValue] of Object.entries(candidate.fields)) {
      const normalizedValue = this.normalizeValue(rawValue);
      if (!normalizedValue || !normalizedValue.includes(normalizedQuery)) {
        continue;
      }

      matchedFields.push(fieldName);
      score += this.scoreFieldMatch(
        normalizedValue,
        normalizedQuery,
        matchedFields.length,
      );
    }

    if (matchedFields.length === 0) {
      return null;
    }

    return {
      score,
      result: {
        category: candidate.category,
        resourceType: candidate.resourceType,
        resourceId: candidate.resourceId,
        primaryLabel: candidate.primaryLabel,
        ...(candidate.secondaryLabel
          ? { secondaryLabel: candidate.secondaryLabel }
          : {}),
        link: candidate.link,
        matchedFields,
      },
    };
  }

  private normalizeValue(value: SearchFieldValue) {
    if (Array.isArray(value)) {
      return value
        .map((entry) => this.normalizePrimitive(entry))
        .filter(Boolean)
        .join(" ");
    }
    return this.normalizePrimitive(value as SearchPrimitiveValue);
  }

  private normalizePrimitive(value: SearchPrimitiveValue) {
    if (value === null || value === undefined) {
      return "";
    }
    return String(value).trim().toLowerCase();
  }

  private scoreFieldMatch(
    normalizedValue: string,
    normalizedQuery: string,
    matchedFieldCount: number,
  ) {
    const priorityPenalty = matchedFieldCount - 1;
    if (normalizedValue === normalizedQuery) {
      return 100 - priorityPenalty;
    }
    if (normalizedValue.startsWith(normalizedQuery)) {
      return 50 - priorityPenalty;
    }
    return 25 - priorityPenalty;
  }
}
