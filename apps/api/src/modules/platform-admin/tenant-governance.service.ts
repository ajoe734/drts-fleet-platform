import { Injectable } from "@nestjs/common";

import type {
  PlatformAdminTenantRecord,
  PlatformTenantGovernanceSummaryQuery,
  PlatformTenantGovernanceSummaryResponse,
  PlatformTenantGovernanceSummaryRow,
  TenantApprovalRuleRecord,
  TenantCostCenterRecord,
  TenantUserRoleRecord,
} from "@drts/contracts";

import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";
import { TenantsService } from "./tenants.service";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const QUOTA_ALERT_THRESHOLD_PERCENT = 95;
const PENDING_APPROVAL_ALERT_THRESHOLD_HOURS = 48;
const HOUR_IN_MS = 60 * 60 * 1000;

@Injectable()
export class PlatformTenantGovernanceService {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly tenantPartnerService: TenantPartnerService,
  ) {}

  listSummary(
    query: PlatformTenantGovernanceSummaryQuery = {},
  ): PlatformTenantGovernanceSummaryResponse {
    const page = this.normalizePositiveInt(query.page, DEFAULT_PAGE);
    const pageSize = this.normalizePositiveInt(
      query.pageSize,
      DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );

    const nowMs = Date.now();
    const rows = this.tenantsService
      .list()
      .map((tenant) => this.buildSummaryRow(tenant, nowMs))
      .sort((left, right) => {
        if (right.alertFlags.length !== left.alertFlags.length) {
          return right.alertFlags.length - left.alertFlags.length;
        }
        if (right.pendingApprovalCount !== left.pendingApprovalCount) {
          return right.pendingApprovalCount - left.pendingApprovalCount;
        }
        if (right.monthlyQuotaPercentUsed !== left.monthlyQuotaPercentUsed) {
          return right.monthlyQuotaPercentUsed - left.monthlyQuotaPercentUsed;
        }
        return left.tenantName.localeCompare(right.tenantName);
      });

    const totalItems = rows.length;
    const totalPages = totalItems > 0 ? Math.ceil(totalItems / pageSize) : 0;
    const start = (page - 1) * pageSize;
    const items = rows.slice(start, start + pageSize);

    return {
      items,
      pageInfo: {
        page,
        pageSize,
        totalItems,
        totalPages,
      },
    };
  }

  private buildSummaryRow(
    tenant: PlatformAdminTenantRecord,
    nowMs: number,
  ): PlatformTenantGovernanceSummaryRow {
    const costCenters = this.tenantPartnerService.listCostCenters(tenant.id);
    const activeCostCenters = costCenters.filter(
      (costCenter) => costCenter.activeFlag,
    );
    const activeRules = this.tenantPartnerService.listApprovalRules(tenant.id, {
      activeOnly: true,
    });
    const quotaSummary = this.tenantPartnerService.getTenantQuotaSummary(
      tenant.id,
    );
    const pendingApprovalRequests =
      this.tenantPartnerService.listApprovalRequests(tenant.id, {
        status: "pending",
      });
    const activeUsers = this.tenantPartnerService
      .listTenantUsers(tenant.id)
      .filter((user) => user.status === "active");
    const oldestPendingApprovalAgeHours =
      this.computeOldestPendingApprovalAgeHours(
        pendingApprovalRequests.map((request) => request.createdAt),
        nowMs,
      );
    const monthlyQuotaPercentUsed = this.computeQuotaPercentUsed(
      quotaSummary.usage.remainingPercent,
    );
    const hasConfiguredApprovers = this.hasConfiguredApproverPool(
      activeRules,
      activeCostCenters,
      activeUsers,
    );
    const alertFlags = [
      !hasConfiguredApprovers ? "no_approvers_configured" : null,
      monthlyQuotaPercentUsed > QUOTA_ALERT_THRESHOLD_PERCENT
        ? "quota_above_95_percent"
        : null,
      oldestPendingApprovalAgeHours !== null &&
      oldestPendingApprovalAgeHours > PENDING_APPROVAL_ALERT_THRESHOLD_HOURS
        ? "pending_approval_over_48h"
        : null,
    ].filter(
      (
        flag,
      ): flag is PlatformTenantGovernanceSummaryRow["alertFlags"][number] =>
        flag !== null,
    );

    return {
      tenantId: tenant.id,
      tenantCode: tenant.code,
      tenantName: tenant.name,
      tenantStatus: tenant.status,
      tenantRolloutStage: tenant.rollout.stage,
      costCenterCount: costCenters.length,
      activeRuleCount: activeRules.length,
      monthlyQuotaPercentUsed,
      pendingApprovalCount: pendingApprovalRequests.length,
      oldestPendingApprovalAgeHours,
      alertFlags,
    };
  }

  private hasConfiguredApproverPool(
    activeRules: TenantApprovalRuleRecord[],
    activeCostCenters: TenantCostCenterRecord[],
    activeUsers: TenantUserRoleRecord[],
  ) {
    if (
      activeUsers.some(
        (user) =>
          user.roleCode === "tenant_admin" ||
          user.roleCode === "tenant_finance_admin",
      )
    ) {
      return true;
    }

    const activeUserIds = new Set(activeUsers.map((user) => user.userId));
    const activeRoleCounts = new Map<string, number>();
    for (const user of activeUsers) {
      activeRoleCounts.set(
        user.roleCode,
        (activeRoleCounts.get(user.roleCode) ?? 0) + 1,
      );
    }
    const activeCostCenterOwners = new Map(
      activeCostCenters.map((costCenter) => [
        costCenter.code,
        costCenter.ownerUserId,
      ]),
    );

    if (
      activeCostCenters.some(
        (costCenter) =>
          Boolean(costCenter.ownerUserId) &&
          activeUserIds.has(costCenter.ownerUserId as string),
      )
    ) {
      return true;
    }

    return activeRules
      .filter(
        (rule) =>
          rule.action === "require_approval" ||
          rule.action === "flag_manual_review",
      )
      .some((rule) =>
        rule.approvers.some((approver) => {
          switch (approver.kind) {
            case "tenant_user":
            case "user":
              return Boolean(
                approver.userId && activeUserIds.has(approver.userId),
              );
            case "tenant_role":
            case "role":
              return Boolean(
                approver.roleCode &&
                (activeRoleCounts.get(approver.roleCode) ?? 0) > 0,
              );
            case "tenant_admin":
              return (activeRoleCounts.get("tenant_admin") ?? 0) > 0;
            case "tenant_finance_admin":
              return (activeRoleCounts.get("tenant_finance_admin") ?? 0) > 0;
            case "cost_center_owner":
              if (approver.costCenterCode) {
                const ownerUserId = activeCostCenterOwners.get(
                  approver.costCenterCode,
                );
                return Boolean(ownerUserId && activeUserIds.has(ownerUserId));
              }
              return activeCostCenters.some(
                (costCenter) =>
                  Boolean(costCenter.ownerUserId) &&
                  activeUserIds.has(costCenter.ownerUserId as string),
              );
            default:
              return false;
          }
        }),
      );
  }

  private computeOldestPendingApprovalAgeHours(
    createdAtValues: string[],
    nowMs: number,
  ) {
    const createdAtMs = createdAtValues
      .map((value) => new Date(value).getTime())
      .filter((value) => Number.isFinite(value));

    if (createdAtMs.length === 0) {
      return null;
    }

    const oldestMs = Math.min(...createdAtMs);
    return this.roundToSingleDecimal((nowMs - oldestMs) / HOUR_IN_MS);
  }

  private computeQuotaPercentUsed(remainingPercent: number | null) {
    if (remainingPercent === null) {
      return 0;
    }
    return this.roundToSingleDecimal(100 - remainingPercent);
  }

  private normalizePositiveInt(
    value: number | undefined,
    fallback: number,
    max = Number.POSITIVE_INFINITY,
  ) {
    if (!Number.isFinite(value) || !value || value < 1) {
      return fallback;
    }
    return Math.min(Math.trunc(value), max);
  }

  private roundToSingleDecimal(value: number) {
    return Math.round(value * 10) / 10;
  }
}
