import type {
  TenantApprovalMode,
  TenantApprovalRuleRecord,
  TenantPrincipalRef,
  TenantQuotaLimit,
  TenantUserRoleRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../common/api-envelope";
import { AuditNotificationService } from "../modules/audit-notification/audit-notification.service";
import { TenantPartnerService } from "../modules/tenant-partner/tenant-partner.service";

export type TenantGovernanceSeedProfile = "smb" | "midmarket" | "enterprise";

export type TenantGovernanceSeedCliArgs =
  | {
      help: true;
    }
  | {
      help: false;
      tenantId: string;
      profile: TenantGovernanceSeedProfile;
    };

type SeedStatus = "created" | "skipped";

type SeedCostCenterTemplate = {
  code: string;
  name: string;
  description: string;
  preferredRoleCodes: string[];
  fallbackOwnerName: string;
};

type SeedApprovalRuleTemplate = {
  ruleName: string;
  description: string;
  priority: number;
  thresholdAmountMinor: number;
  approvalMode: TenantApprovalMode;
  approvers: TenantPrincipalRef[];
};

type SeedProfileTemplate = {
  profile: TenantGovernanceSeedProfile;
  costCenters: SeedCostCenterTemplate[];
  quotaLimit: TenantQuotaLimit;
  approvalRule: SeedApprovalRuleTemplate;
};

type SeedOwnerAssignment = {
  userId: string;
  ownerName: string;
};

export type TenantGovernanceSeedServices = {
  tenantPartnerService: Pick<
    TenantPartnerService,
    | "listApprovalRules"
    | "listCostCenters"
    | "listQuotaPolicies"
    | "listTenantUsers"
    | "upsertApprovalRule"
    | "upsertCostCenter"
    | "upsertTenantQuotaPolicy"
  >;
  auditNotificationService: Pick<AuditNotificationService, "recordAuditLog">;
};

export type SeedTenantGovernanceOptions = {
  profile?: TenantGovernanceSeedProfile;
  requestIdPrefix?: string;
  services: TenantGovernanceSeedServices;
  source?: string;
  ownerUserIdsByCostCenterCode?: Partial<Record<string, string>>;
};

export type SeedTenantGovernanceResult = {
  tenantId: string;
  profile: TenantGovernanceSeedProfile;
  costCenters: Array<{
    code: string;
    name: string;
    status: SeedStatus;
    ownerUserId: string | null;
    ownerName: string | null;
  }>;
  quotaPolicy: {
    period: "monthly";
    status: SeedStatus;
    limit: TenantQuotaLimit;
  };
  approvalRule: {
    ruleName: string;
    approvalMode: TenantApprovalMode;
    status: SeedStatus;
    thresholdAmountMinor: number;
  };
};

export const TENANT_GOVERNANCE_SEED_DEFAULT_PROFILE =
  "midmarket" satisfies TenantGovernanceSeedProfile;
export const TENANT_GOVERNANCE_SEED_CLI_USAGE =
  "Usage: pnpm --filter @drts/api seed:tenant-governance --tenantId=<id> [--profile=smb|midmarket|enterprise]";

const TWD_MINOR_PER_UNIT = 100;
const DEFAULT_APPROVAL_THRESHOLD_MINOR = 5_000 * TWD_MINOR_PER_UNIT;
const DEFAULT_RULE_PRIORITY = 10;

const SMB_PROFILE: SeedProfileTemplate = {
  profile: "smb",
  costCenters: [
    {
      code: "CC-OPS",
      name: "Operations",
      description: "Daily dispatch and rider support.",
      preferredRoleCodes: ["tenant_ops_admin", "tenant_admin"],
      fallbackOwnerName: "Operations Owner",
    },
  ],
  quotaLimit: {
    bookingCountLimit: 100,
    amountMinorLimit: 250_000 * TWD_MINOR_PER_UNIT,
    currency: "TWD",
    enforcementMode: "warn_only",
  },
  approvalRule: {
    ruleName: "Seeded SMB Amount Approval",
    description:
      "Bookings above NT$5,000 trigger a lightweight cost-center-owner approval.",
    priority: DEFAULT_RULE_PRIORITY,
    thresholdAmountMinor: DEFAULT_APPROVAL_THRESHOLD_MINOR,
    approvalMode: "any_of",
    approvers: [{ kind: "cost_center_owner" }],
  },
};

const MIDMARKET_PROFILE: SeedProfileTemplate = {
  profile: "midmarket",
  costCenters: [
    {
      code: "CC-OPS",
      name: "Operations",
      description: "Dispatch operations and field escalation.",
      preferredRoleCodes: ["tenant_ops_admin", "tenant_admin"],
      fallbackOwnerName: "Operations Owner",
    },
    {
      code: "CC-ENG",
      name: "Engineering",
      description: "Product delivery, launches, and on-call travel.",
      preferredRoleCodes: ["tenant_admin", "tenant_ops_admin"],
      fallbackOwnerName: "Engineering Owner",
    },
    {
      code: "CC-FINANCE",
      name: "Finance",
      description: "Finance approvals, billing, and audit support.",
      preferredRoleCodes: ["tenant_finance_admin", "tenant_admin"],
      fallbackOwnerName: "Finance Owner",
    },
  ],
  quotaLimit: {
    bookingCountLimit: 50,
    amountMinorLimit: 100_000 * TWD_MINOR_PER_UNIT,
    currency: "TWD",
    enforcementMode: "hard_block",
  },
  approvalRule: {
    ruleName: "Seeded Midmarket Amount Approval",
    description:
      "Bookings above NT$5,000 require the matching cost-center owner to approve.",
    priority: DEFAULT_RULE_PRIORITY,
    thresholdAmountMinor: DEFAULT_APPROVAL_THRESHOLD_MINOR,
    approvalMode: "any_of",
    approvers: [{ kind: "cost_center_owner" }],
  },
};

const ENTERPRISE_PROFILE: SeedProfileTemplate = {
  profile: "enterprise",
  costCenters: [
    {
      code: "CC-OPS",
      name: "Operations",
      description: "Dispatch operations and station-level incident handling.",
      preferredRoleCodes: ["tenant_ops_admin", "tenant_admin"],
      fallbackOwnerName: "Operations Owner",
    },
    {
      code: "CC-ENG",
      name: "Engineering",
      description: "Platform delivery, launches, and release response.",
      preferredRoleCodes: ["tenant_admin", "tenant_ops_admin"],
      fallbackOwnerName: "Engineering Owner",
    },
    {
      code: "CC-FINANCE",
      name: "Finance",
      description: "Billing operations, settlements, and financial controls.",
      preferredRoleCodes: ["tenant_finance_admin", "tenant_admin"],
      fallbackOwnerName: "Finance Owner",
    },
    {
      code: "CC-HR",
      name: "People Operations",
      description: "Recruiting, onboarding, and employee travel.",
      preferredRoleCodes: ["tenant_admin", "tenant_ops_admin"],
      fallbackOwnerName: "People Ops Owner",
    },
    {
      code: "CC-EXEC",
      name: "Executive Office",
      description: "Executive visits and board-level engagements.",
      preferredRoleCodes: ["tenant_admin"],
      fallbackOwnerName: "Executive Owner",
    },
  ],
  quotaLimit: {
    bookingCountLimit: 30,
    amountMinorLimit: 60_000 * TWD_MINOR_PER_UNIT,
    currency: "TWD",
    enforcementMode: "hard_block",
  },
  approvalRule: {
    ruleName: "Seeded Enterprise Approval Chain",
    description:
      "Bookings above NT$5,000 follow an ordered chain: cost-center owner, finance admin, then tenant admin.",
    priority: DEFAULT_RULE_PRIORITY,
    thresholdAmountMinor: DEFAULT_APPROVAL_THRESHOLD_MINOR,
    approvalMode: "ordered_chain",
    approvers: [
      { kind: "cost_center_owner" },
      { kind: "tenant_finance_admin" },
      { kind: "tenant_admin" },
    ],
  },
};

const PROFILE_TEMPLATES: Record<
  TenantGovernanceSeedProfile,
  SeedProfileTemplate
> = {
  smb: SMB_PROFILE,
  midmarket: MIDMARKET_PROFILE,
  enterprise: ENTERPRISE_PROFILE,
};

const GOVERNANCE_SEED_APPROVAL_RULE_NAMES = new Set(
  Object.values(PROFILE_TEMPLATES).map(
    (profileTemplate) => profileTemplate.approvalRule.ruleName,
  ),
);

export async function seedTenantGovernance(
  tenantId: string,
  options: SeedTenantGovernanceOptions,
): Promise<SeedTenantGovernanceResult> {
  const normalizedTenantId = tenantId.trim();
  if (!normalizedTenantId) {
    throw new Error("tenantId is required.");
  }

  const profile = normalizeProfile(options.profile);
  const template = PROFILE_TEMPLATES[profile];
  const services = options.services;
  const source = options.source?.trim() || "unspecified";
  const requestIdPrefix =
    options.requestIdPrefix?.trim() ||
    `seed:tenant-governance:${profile}:${normalizedTenantId}`;

  const existingCostCenters =
    services.tenantPartnerService.listCostCenters(normalizedTenantId);
  const existingCostCenterByCode = new Map(
    existingCostCenters.map((costCenter) => [costCenter.code, costCenter]),
  );
  const missingCostCenterTemplates = template.costCenters.filter(
    (costCenter) => !existingCostCenterByCode.has(costCenter.code),
  );
  const ownerAssignments = resolveOwnerAssignments(
    normalizedTenantId,
    missingCostCenterTemplates,
    services.tenantPartnerService.listTenantUsers(normalizedTenantId),
    options.ownerUserIdsByCostCenterCode,
  );

  const costCenters = template.costCenters.map((costCenter) => {
    const existing = existingCostCenterByCode.get(costCenter.code);
    if (existing) {
      return {
        code: existing.code,
        name: existing.name,
        status: "skipped" as const,
        ownerUserId: existing.ownerUserId,
        ownerName: existing.ownerName,
      };
    }

    const owner = ownerAssignments.get(costCenter.code);
    if (!owner) {
      throw new Error(
        `Missing owner assignment for ${costCenter.code}; this is a seed configuration error.`,
      );
    }

    const created = services.tenantPartnerService.upsertCostCenter(
      normalizedTenantId,
      {
        code: costCenter.code,
        name: costCenter.name,
        description: costCenter.description,
        ownerUserId: owner.userId,
        ownerName: owner.ownerName,
      },
      `${requestIdPrefix}:cost-center:${costCenter.code}`,
    );

    return {
      code: created.code,
      name: created.name,
      status: "created" as const,
      ownerUserId: created.ownerUserId,
      ownerName: created.ownerName,
    };
  });

  recordSeedAudit(
    services.auditNotificationService,
    `${requestIdPrefix}:audit:cost-centers`,
    {
      tenantId: normalizedTenantId,
      actionName: "tenant.governance_seed.cost_centers",
      resourceType: "tenant_governance_seed_cost_centers",
      resourceId: normalizedTenantId,
      newValuesSummary: {
        profile,
        source,
        createdCodes: costCenters
          .filter((costCenter) => costCenter.status === "created")
          .map((costCenter) => costCenter.code),
        skippedCodes: costCenters
          .filter((costCenter) => costCenter.status === "skipped")
          .map((costCenter) => costCenter.code),
      },
    },
  );

  const existingQuotaPolicy = services.tenantPartnerService
    .listQuotaPolicies(normalizedTenantId)
    .find(
      (policy) => policy.costCenterCode === null && policy.period === "monthly",
    );
  const quotaPolicyStatus: SeedStatus = existingQuotaPolicy
    ? "skipped"
    : "created";
  if (!existingQuotaPolicy) {
    services.tenantPartnerService.upsertTenantQuotaPolicy(
      normalizedTenantId,
      {
        period: "monthly",
        limit: { ...template.quotaLimit },
      },
      `${requestIdPrefix}:quota-policy:tenant`,
    );
  }

  recordSeedAudit(
    services.auditNotificationService,
    `${requestIdPrefix}:audit:quota-policy`,
    {
      tenantId: normalizedTenantId,
      actionName: "tenant.governance_seed.quota_policy",
      resourceType: "tenant_governance_seed_quota_policy",
      resourceId: normalizedTenantId,
      newValuesSummary: {
        profile,
        source,
        status: quotaPolicyStatus,
        period: "monthly",
        bookingCountLimit: template.quotaLimit.bookingCountLimit,
        amountMinorLimit: template.quotaLimit.amountMinorLimit,
        enforcementMode: template.quotaLimit.enforcementMode,
      },
    },
  );

  const existingApprovalRule = services.tenantPartnerService
    .listApprovalRules(normalizedTenantId)
    .find((rule) => isGovernanceSeedApprovalRule(rule));
  const approvalRuleStatus: SeedStatus = existingApprovalRule
    ? "skipped"
    : "created";
  const approvalRuleSummary = summarizeApprovalRule(
    existingApprovalRule,
    template.approvalRule,
  );
  if (!existingApprovalRule) {
    services.tenantPartnerService.upsertApprovalRule(
      normalizedTenantId,
      {
        ruleName: template.approvalRule.ruleName,
        description: template.approvalRule.description,
        priority: template.approvalRule.priority,
        conditions: [
          {
            field: "booking.amount_minor",
            operator: "greater_than",
            value: template.approvalRule.thresholdAmountMinor,
          },
        ],
        action: "require_approval",
        approvalMode: template.approvalRule.approvalMode,
        approvers: template.approvalRule.approvers.map((approver) => ({
          ...approver,
        })),
      },
      `${requestIdPrefix}:approval-rule:${slugify(template.approvalRule.ruleName)}`,
    );
  }

  recordSeedAudit(
    services.auditNotificationService,
    `${requestIdPrefix}:audit:approval-rule`,
    {
      tenantId: normalizedTenantId,
      actionName: "tenant.governance_seed.approval_rule",
      resourceType: "tenant_governance_seed_approval_rule",
      resourceId: approvalRuleSummary.ruleName,
      newValuesSummary: {
        profile,
        source,
        status: approvalRuleStatus,
        ruleName: approvalRuleSummary.ruleName,
        approvalMode: approvalRuleSummary.approvalMode,
        approverKinds: approvalRuleSummary.approvers.map(
          (approver) => approver.kind,
        ),
        thresholdAmountMinor: approvalRuleSummary.thresholdAmountMinor,
      },
    },
  );

  recordSeedAudit(
    services.auditNotificationService,
    `${requestIdPrefix}:audit:completed`,
    {
      tenantId: normalizedTenantId,
      actionName: "tenant.governance_seed.completed",
      resourceType: "tenant_governance_seed",
      resourceId: normalizedTenantId,
      newValuesSummary: {
        profile,
        source,
        costCentersCreated: costCenters.filter(
          (costCenter) => costCenter.status === "created",
        ).length,
        costCentersSkipped: costCenters.filter(
          (costCenter) => costCenter.status === "skipped",
        ).length,
        quotaPolicyStatus,
        approvalRuleStatus,
      },
    },
  );

  return {
    tenantId: normalizedTenantId,
    profile,
    costCenters,
    quotaPolicy: {
      period: "monthly",
      status: quotaPolicyStatus,
      limit: { ...template.quotaLimit },
    },
    approvalRule: {
      ruleName: approvalRuleSummary.ruleName,
      approvalMode: approvalRuleSummary.approvalMode,
      status: approvalRuleStatus,
      thresholdAmountMinor: approvalRuleSummary.thresholdAmountMinor,
    },
  };
}

export function parseTenantGovernanceSeedCliArgs(
  argv: readonly string[],
): TenantGovernanceSeedCliArgs {
  let tenantId: string | null = null;
  let profileCandidate: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }
    if (arg.startsWith("--tenantId=")) {
      tenantId = arg.slice("--tenantId=".length);
      continue;
    }
    if (arg === "--tenantId") {
      tenantId = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg.startsWith("--profile=")) {
      profileCandidate = arg.slice("--profile=".length);
      continue;
    }
    if (arg === "--profile") {
      profileCandidate = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    throw new Error(
      `Unknown argument: ${arg}\n${TENANT_GOVERNANCE_SEED_CLI_USAGE}`,
    );
  }

  if (!tenantId?.trim()) {
    throw new Error(
      `Missing required --tenantId argument.\n${TENANT_GOVERNANCE_SEED_CLI_USAGE}`,
    );
  }

  return {
    help: false,
    tenantId: tenantId.trim(),
    profile: normalizeProfile(profileCandidate),
  };
}

function resolveOwnerAssignments(
  tenantId: string,
  costCenters: readonly SeedCostCenterTemplate[],
  users: readonly TenantUserRoleRecord[],
  ownerUserIdsByCostCenterCode: Partial<Record<string, string>> | undefined,
) {
  const assignments = new Map<string, SeedOwnerAssignment>();
  if (costCenters.length === 0) {
    return assignments;
  }

  const activeUsers = users.filter((user) => user.status === "active");
  const candidateUsers = activeUsers.length > 0 ? activeUsers : [...users];
  if (candidateUsers.length === 0) {
    throw new ApiRequestError(
      409,
      "TENANT_GOVERNANCE_SEED_REQUIRES_TENANT_USER",
      "At least one tenant user is required before seeding governance defaults.",
      {
        tenantId,
      },
    );
  }

  const usedUserIds = new Set<string>();
  for (const costCenter of costCenters) {
    const overrideUserId = ownerUserIdsByCostCenterCode?.[costCenter.code];
    if (overrideUserId) {
      const overrideUser = candidateUsers.find(
        (user) => user.userId === overrideUserId,
      );
      if (!overrideUser) {
        throw new ApiRequestError(
          404,
          "TENANT_GOVERNANCE_SEED_OWNER_NOT_FOUND",
          "ownerUserIdsByCostCenterCode references an unknown tenant user.",
          {
            tenantId,
            costCenterCode: costCenter.code,
            userId: overrideUserId,
          },
        );
      }
      assignments.set(costCenter.code, {
        userId: overrideUser.userId,
        ownerName: overrideUser.displayName,
      });
      usedUserIds.add(overrideUser.userId);
      continue;
    }

    const preferredUnused = costCenter.preferredRoleCodes
      .flatMap((roleCode) =>
        candidateUsers.filter((user) => user.roleCode === roleCode),
      )
      .find((user) => !usedUserIds.has(user.userId));
    const preferred = costCenter.preferredRoleCodes.flatMap((roleCode) =>
      candidateUsers.filter((user) => user.roleCode === roleCode),
    );
    const fallbackUnused = candidateUsers.find(
      (user) => !usedUserIds.has(user.userId),
    );
    const selected =
      preferredUnused ?? preferred[0] ?? fallbackUnused ?? candidateUsers[0];
    if (!selected) {
      throw new Error(
        `Missing owner selection for ${costCenter.code}; this is a seed configuration error.`,
      );
    }

    assignments.set(costCenter.code, {
      userId: selected.userId,
      ownerName: selected.displayName || costCenter.fallbackOwnerName,
    });
    usedUserIds.add(selected.userId);
  }

  return assignments;
}

function recordSeedAudit(
  auditNotificationService: Pick<AuditNotificationService, "recordAuditLog">,
  requestId: string,
  input: {
    tenantId: string;
    actionName: string;
    resourceType: string;
    resourceId: string;
    newValuesSummary: Record<string, unknown>;
  },
) {
  auditNotificationService.recordAuditLog({
    actorId: null,
    actorType: "system",
    tenantId: input.tenantId,
    moduleName: "tenant-governance-seed",
    actionName: input.actionName,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    newValuesSummary: input.newValuesSummary,
    requestId,
  });
}

function normalizeProfile(
  value: string | TenantGovernanceSeedProfile | null | undefined,
): TenantGovernanceSeedProfile {
  const normalized = (value ?? TENANT_GOVERNANCE_SEED_DEFAULT_PROFILE).trim();
  if (
    normalized === "smb" ||
    normalized === "midmarket" ||
    normalized === "enterprise"
  ) {
    return normalized;
  }
  throw new Error(
    `Unsupported profile: ${normalized}\n${TENANT_GOVERNANCE_SEED_CLI_USAGE}`,
  );
}

function normalizeRuleName(rule: TenantApprovalRuleRecord | undefined) {
  return rule?.ruleName ?? rule?.name ?? "";
}

function isGovernanceSeedApprovalRule(rule: TenantApprovalRuleRecord) {
  return GOVERNANCE_SEED_APPROVAL_RULE_NAMES.has(normalizeRuleName(rule));
}

function summarizeApprovalRule(
  existingRule: TenantApprovalRuleRecord | undefined,
  templateRule: SeedApprovalRuleTemplate,
) {
  return {
    ruleName: normalizeRuleName(existingRule) || templateRule.ruleName,
    approvalMode: existingRule?.approvalMode ?? templateRule.approvalMode,
    approvers: existingRule?.approvers ?? templateRule.approvers,
    thresholdAmountMinor:
      resolveRuleThresholdAmountMinor(existingRule) ??
      templateRule.thresholdAmountMinor,
  };
}

function resolveRuleThresholdAmountMinor(
  rule: TenantApprovalRuleRecord | undefined,
) {
  const condition = rule?.conditions.find(
    (candidate) =>
      candidate.field === "booking.amount_minor" &&
      normalizeConditionOperator(candidate) === "greater_than",
  );
  return typeof condition?.value === "number" ? condition.value : null;
}

function normalizeConditionOperator(
  condition: TenantApprovalRuleRecord["conditions"][number],
) {
  const operator = condition.operator ?? condition.op ?? null;
  if (operator === "gt") {
    return "greater_than";
  }
  if (operator === "gte") {
    return "greater_than_or_equal";
  }
  return operator;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
