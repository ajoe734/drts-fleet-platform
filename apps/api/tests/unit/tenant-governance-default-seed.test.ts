import { describe, expect, it, vi } from "vitest";

import type { TenantUserRoleRecord } from "@drts/contracts";

import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import type {
  PersistTenantPartnerChanges,
  TenantPartnerState,
} from "../../src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";
import {
  parseTenantGovernanceSeedCliArgs,
  seedTenantGovernance,
} from "../../src/seed/tenant-governance-default";

function cloneState(state: TenantPartnerState): TenantPartnerState {
  return JSON.parse(JSON.stringify(state)) as TenantPartnerState;
}

function createEmptyRepositoryState(): TenantPartnerState {
  return {
    notificationPreferences: [],
    webhookEndpoints: [],
    webhookDeliveries: [],
    slaProfiles: [],
    partnerEntries: [],
    partnerIngressCredentials: [],
    partnerEligibilityVerifications: [],
    approvalRules: [],
    approvalRequests: [],
    approvalDecisions: [],
    passengers: [],
    addresses: [],
    costCenters: [],
    quotaPolicies: [],
    quotaLedger: [],
    quotaMonthlySnapshots: [],
    userRoles: [],
    apiKeys: [],
  };
}

function mergeByKey<T>(
  current: readonly T[],
  incoming: readonly T[] | undefined,
  keyOf: (value: T) => string,
) {
  const merged = new Map(current.map((value) => [keyOf(value), value]));
  for (const value of incoming ?? []) {
    merged.set(keyOf(value), value);
  }
  return [...merged.values()];
}

function createInMemoryTenantPartnerRepository(
  initialState: TenantPartnerState,
) {
  let state = cloneState(initialState);

  return {
    loadState: vi.fn(async () => cloneState(state)),
    persistChanges: vi.fn(async (changes: PersistTenantPartnerChanges) => {
      state = {
        notificationPreferences: mergeByKey(
          state.notificationPreferences,
          changes.notificationPreferences,
          (value) => value.tenantId,
        ),
        webhookEndpoints: mergeByKey(
          state.webhookEndpoints,
          changes.webhookEndpoints,
          (value) => value.webhookId,
        ),
        webhookDeliveries: mergeByKey(
          state.webhookDeliveries,
          changes.webhookDeliveries,
          (value) => value.deliveryId,
        ),
        slaProfiles: mergeByKey(
          state.slaProfiles,
          changes.slaProfiles,
          (value) => value.tenantId,
        ),
        partnerEntries: mergeByKey(
          state.partnerEntries,
          changes.partnerEntries,
          (value) => value.entrySlug,
        ),
        partnerIngressCredentials: mergeByKey(
          state.partnerIngressCredentials,
          changes.partnerIngressCredentials,
          (value) => value.keyId,
        ),
        partnerEligibilityVerifications: mergeByKey(
          state.partnerEligibilityVerifications,
          changes.partnerEligibilityVerifications,
          (value) => value.eligibilityVerificationId,
        ),
        approvalRules: mergeByKey(
          state.approvalRules,
          changes.approvalRules,
          (value) => value.ruleId,
        ),
        approvalRequests: mergeByKey(
          state.approvalRequests,
          changes.approvalRequests,
          (value) => value.approvalRequestId,
        ),
        approvalDecisions: mergeByKey(
          state.approvalDecisions,
          changes.approvalDecisions,
          (value) => value.decisionId,
        ),
        passengers: mergeByKey(
          state.passengers,
          changes.passengers,
          (value) => value.passengerId,
        ),
        addresses: mergeByKey(
          state.addresses,
          changes.addresses,
          (value) => value.addressId,
        ),
        costCenters: mergeByKey(
          state.costCenters,
          changes.costCenters,
          (value) => `${value.tenantId}:${value.code}`,
        ),
        quotaPolicies: mergeByKey(
          state.quotaPolicies,
          changes.quotaPolicies,
          (value) =>
            `${value.tenantId}:${value.costCenterCode ?? "~"}:${value.period}`,
        ),
        quotaLedger: mergeByKey(
          state.quotaLedger,
          changes.quotaLedger,
          (value) => value.ledgerEntryId,
        ),
        quotaMonthlySnapshots: mergeByKey(
          state.quotaMonthlySnapshots,
          changes.quotaMonthlySnapshots,
          (value) =>
            `${value.tenantId}:${value.costCenterCode ?? "~"}:${value.period}:${value.periodKey}`,
        ),
        userRoles: mergeByKey(
          state.userRoles,
          changes.userRoles,
          (value) => value.userId,
        ),
        apiKeys: mergeByKey(
          state.apiKeys,
          changes.apiKeys,
          (value) => value.apiKeyId,
        ),
      };
    }),
    reportPersistenceFailure: vi.fn(),
    getState: () => cloneState(state),
  };
}

function createTenantUsers(tenantId: string): TenantUserRoleRecord[] {
  return [
    {
      userId: `${tenantId}-admin`,
      tenantId,
      email: `${tenantId}.admin@example.com`,
      displayName: "Tenant Admin",
      roleCode: "tenant_admin",
      status: "active",
      invitedAt: "2026-05-13T00:00:00.000Z",
      updatedAt: "2026-05-13T00:00:00.000Z",
    },
    {
      userId: `${tenantId}-ops`,
      tenantId,
      email: `${tenantId}.ops@example.com`,
      displayName: "Operations Lead",
      roleCode: "tenant_ops_admin",
      status: "active",
      invitedAt: "2026-05-13T00:05:00.000Z",
      updatedAt: "2026-05-13T00:05:00.000Z",
    },
    {
      userId: `${tenantId}-finance`,
      tenantId,
      email: `${tenantId}.finance@example.com`,
      displayName: "Finance Lead",
      roleCode: "tenant_finance_admin",
      status: "active",
      invitedAt: "2026-05-13T00:10:00.000Z",
      updatedAt: "2026-05-13T00:10:00.000Z",
    },
  ];
}

async function createHarness(tenantId: string) {
  const auditNotificationService = new AuditNotificationService();
  const repository = createInMemoryTenantPartnerRepository({
    ...createEmptyRepositoryState(),
    userRoles: createTenantUsers(tenantId),
  });
  const tenantPartnerService = new TenantPartnerService(
    auditNotificationService,
    repository as never,
  );

  await tenantPartnerService.onModuleInit();

  return {
    auditNotificationService,
    repository,
    tenantPartnerService,
  };
}

describe("seedTenantGovernance", () => {
  it("seeds the midmarket default payload with the expected limits and rule", async () => {
    const tenantId = "tenant-seed-midmarket";
    const { auditNotificationService, tenantPartnerService } =
      await createHarness(tenantId);

    const result = await seedTenantGovernance(tenantId, {
      services: {
        tenantPartnerService,
        auditNotificationService,
      },
    });

    expect(result.profile).toBe("midmarket");
    expect(
      [...result.costCenters].sort((left, right) =>
        left.code.localeCompare(right.code),
      ),
    ).toEqual([
      {
        code: "CC-ENG",
        name: "Engineering",
        ownerName: "Tenant Admin",
        ownerUserId: `${tenantId}-admin`,
        status: "created",
      },
      {
        code: "CC-FINANCE",
        name: "Finance",
        ownerName: "Finance Lead",
        ownerUserId: `${tenantId}-finance`,
        status: "created",
      },
      {
        code: "CC-OPS",
        name: "Operations",
        ownerName: "Operations Lead",
        ownerUserId: `${tenantId}-ops`,
        status: "created",
      },
    ]);
    expect(result.quotaPolicy).toMatchObject({
      period: "monthly",
      status: "created",
      limit: {
        bookingCountLimit: 50,
        amountMinorLimit: 10_000_000,
        currency: "TWD",
        enforcementMode: "hard_block",
      },
    });
    expect(result.approvalRule).toEqual({
      ruleName: "Seeded Midmarket Amount Approval",
      approvalMode: "any_of",
      status: "created",
      thresholdAmountMinor: 500_000,
    });

    const quotaPolicies = tenantPartnerService.listQuotaPolicies(tenantId);
    expect(quotaPolicies).toHaveLength(1);
    expect(quotaPolicies[0]!).toMatchObject({
      tenantId,
      costCenterCode: null,
      period: "monthly",
      limit: {
        bookingCountLimit: 50,
        amountMinorLimit: 10_000_000,
        currency: "TWD",
        enforcementMode: "hard_block",
      },
    });

    const rules = tenantPartnerService.listApprovalRules(tenantId);
    expect(rules).toHaveLength(1);
    expect(rules[0]!).toMatchObject({
      ruleName: "Seeded Midmarket Amount Approval",
      approvalMode: "any_of",
      action: "require_approval",
      approvers: [{ kind: "cost_center_owner" }],
      conditions: [
        {
          field: "booking.amount_minor",
          operator: "greater_than",
          value: 500_000,
        },
      ],
    });

    const seedAudits = auditNotificationService
      .listAuditLogs(null)
      .filter((auditLog) =>
        auditLog.actionName.startsWith("tenant.governance_seed."),
      )
      .map((auditLog) => auditLog.actionName);
    expect(seedAudits).toEqual(
      expect.arrayContaining([
        "tenant.governance_seed.cost_centers",
        "tenant.governance_seed.quota_policy",
        "tenant.governance_seed.approval_rule",
        "tenant.governance_seed.completed",
      ]),
    );
  });

  it("supports the smb profile with a single cost center and warn-only quota", async () => {
    const tenantId = "tenant-seed-smb";
    const { auditNotificationService, tenantPartnerService } =
      await createHarness(tenantId);

    const result = await seedTenantGovernance(tenantId, {
      profile: "smb",
      services: {
        tenantPartnerService,
        auditNotificationService,
      },
    });

    expect(result).toMatchObject({
      tenantId,
      profile: "smb",
      costCenters: [
        {
          code: "CC-OPS",
          status: "created",
          ownerUserId: `${tenantId}-ops`,
          ownerName: "Operations Lead",
        },
      ],
      quotaPolicy: {
        period: "monthly",
        status: "created",
        limit: {
          bookingCountLimit: 100,
          amountMinorLimit: 25_000_000,
          currency: "TWD",
          enforcementMode: "warn_only",
        },
      },
      approvalRule: {
        ruleName: "Seeded SMB Amount Approval",
        approvalMode: "any_of",
        status: "created",
        thresholdAmountMinor: 500_000,
      },
    });
  });

  it("supports the enterprise profile with five cost centers and an ordered approval chain", async () => {
    const tenantId = "tenant-seed-enterprise";
    const { auditNotificationService, tenantPartnerService } =
      await createHarness(tenantId);

    const result = await seedTenantGovernance(tenantId, {
      profile: "enterprise",
      services: {
        tenantPartnerService,
        auditNotificationService,
      },
    });

    expect(result.costCenters).toHaveLength(5);
    expect(result.quotaPolicy).toMatchObject({
      period: "monthly",
      status: "created",
      limit: {
        bookingCountLimit: 30,
        amountMinorLimit: 6_000_000,
        currency: "TWD",
        enforcementMode: "hard_block",
      },
    });
    expect(result.approvalRule).toEqual({
      ruleName: "Seeded Enterprise Approval Chain",
      approvalMode: "ordered_chain",
      status: "created",
      thresholdAmountMinor: 500_000,
    });

    const rule = tenantPartnerService.listApprovalRules(tenantId)[0]!;
    expect(rule.approvers).toEqual([
      { kind: "cost_center_owner" },
      { kind: "tenant_finance_admin" },
      { kind: "tenant_admin" },
    ]);
  });

  it("is idempotent for repeated runs on the same tenant and still emits step audits", async () => {
    const tenantId = "tenant-seed-idempotent";
    const { auditNotificationService, tenantPartnerService } =
      await createHarness(tenantId);

    const first = await seedTenantGovernance(tenantId, {
      services: {
        tenantPartnerService,
        auditNotificationService,
      },
    });
    const second = await seedTenantGovernance(tenantId, {
      services: {
        tenantPartnerService,
        auditNotificationService,
      },
    });

    expect(
      first.costCenters.every((costCenter) => costCenter.status === "created"),
    ).toBe(true);
    expect(
      second.costCenters.every((costCenter) => costCenter.status === "skipped"),
    ).toBe(true);
    expect(second.quotaPolicy.status).toBe("skipped");
    expect(second.approvalRule.status).toBe("skipped");
    expect(tenantPartnerService.listCostCenters(tenantId)).toHaveLength(3);
    expect(tenantPartnerService.listQuotaPolicies(tenantId)).toHaveLength(1);
    expect(tenantPartnerService.listApprovalRules(tenantId)).toHaveLength(1);

    const seedAudits = auditNotificationService
      .listAuditLogs(null)
      .filter((auditLog) =>
        auditLog.actionName.startsWith("tenant.governance_seed."),
      );
    expect(seedAudits).toHaveLength(8);
  });

  it("skips creating a second seeded approval rule when rerun with a different profile", async () => {
    const tenantId = "tenant-seed-cross-profile";
    const { auditNotificationService, tenantPartnerService } =
      await createHarness(tenantId);

    await seedTenantGovernance(tenantId, {
      profile: "midmarket",
      services: {
        tenantPartnerService,
        auditNotificationService,
      },
    });
    const second = await seedTenantGovernance(tenantId, {
      profile: "enterprise",
      services: {
        tenantPartnerService,
        auditNotificationService,
      },
    });

    expect(second.approvalRule).toEqual({
      ruleName: "Seeded Midmarket Amount Approval",
      approvalMode: "any_of",
      status: "skipped",
      thresholdAmountMinor: 500_000,
    });
    expect(tenantPartnerService.listApprovalRules(tenantId)).toHaveLength(1);
    expect(tenantPartnerService.listApprovalRules(tenantId)[0]).toMatchObject({
      ruleName: "Seeded Midmarket Amount Approval",
      approvalMode: "any_of",
      approvers: [{ kind: "cost_center_owner" }],
      conditions: [
        {
          field: "booking.amount_minor",
          operator: "greater_than",
          value: 500_000,
        },
      ],
    });
  });
});

describe("parseTenantGovernanceSeedCliArgs", () => {
  it("accepts both --tenantId=<id> and --profile=<profile>", () => {
    expect(
      parseTenantGovernanceSeedCliArgs([
        "--tenantId=tenant-cli-001",
        "--profile=enterprise",
      ]),
    ).toEqual({
      help: false,
      tenantId: "tenant-cli-001",
      profile: "enterprise",
    });
  });
});
