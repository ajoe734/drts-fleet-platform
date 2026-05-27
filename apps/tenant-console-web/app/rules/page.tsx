import type {
  EmptyReason,
  ResourceActionDescriptor,
  TenantApprovalRuleAction,
  TenantApprovalRuleRecord,
  TenantBookingApprovalRequestRecord,
  TenantQuotaLedgerEntry,
  TenantQuotaSummary,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import { RulesManager } from "./rules-manager";

export const dynamic = "force-dynamic";

type RulesFilters = {
  search: string;
  action: TenantApprovalRuleAction | "all";
};

type RulesPageData = {
  rules: TenantApprovalRuleRecord[];
  quotaSummary: TenantQuotaSummary | null;
  approvalRequests: TenantBookingApprovalRequestRecord[];
  ledgerEntries: TenantQuotaLedgerEntry[];
  errors: string[];
  availableActions: ResourceActionDescriptor[];
  emptyReason: EmptyReason | null;
  filters: RulesFilters;
  refreshedAt: string;
};

function normalizeFilters(
  searchParams:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>
    | undefined,
): Promise<RulesFilters> {
  return Promise.resolve(searchParams).then((resolved) => {
    const searchRaw = resolved?.search;
    const actionRaw = resolved?.action;
    const searchValue = Array.isArray(searchRaw)
      ? (searchRaw[0] ?? "")
      : (searchRaw ?? "");
    const action = Array.isArray(actionRaw) ? actionRaw[0] : actionRaw;

    return {
      search: searchValue.trim(),
      action:
        action === "allow" ||
        action === "warn" ||
        action === "flag_manual_review" ||
        action === "require_approval" ||
        action === "block"
          ? action
          : "all",
    };
  });
}

function classifyEmptyReason(
  rules: TenantApprovalRuleRecord[],
  errors: string[],
  filters: RulesFilters,
  quotaSummary: TenantQuotaSummary | null,
  approvalRequests: TenantBookingApprovalRequestRecord[],
  ledgerEntries: TenantQuotaLedgerEntry[],
): EmptyReason | null {
  if (rules.length > 0) {
    return null;
  }

  if (filters.search.length > 0 || filters.action !== "all") {
    return "filtered_empty";
  }

  const primaryError = errors[0]?.toLowerCase() ?? "";
  if (primaryError.includes("403") || primaryError.includes("forbidden")) {
    return "permission_denied";
  }
  if (
    primaryError.includes("timeout") ||
    primaryError.includes("unavailable") ||
    primaryError.includes("upstream")
  ) {
    return "external_unavailable";
  }
  if (errors.length > 0) {
    return "fetch_failed";
  }

  if (
    !quotaSummary &&
    approvalRequests.length === 0 &&
    ledgerEntries.length === 0
  ) {
    return "not_provisioned";
  }

  return "no_data";
}

function buildAvailableActions(
  rules: TenantApprovalRuleRecord[],
  errors: string[],
): ResourceActionDescriptor[] {
  const loadingBlocked = errors.some((error) =>
    /403|forbidden|unauthorized/i.test(error),
  );

  return [
    {
      action: "create_rule",
      enabled: !loadingBlocked,
      ...(loadingBlocked ? { disabledReasonCode: "permission_denied" } : {}),
      riskLevel: "medium",
    },
    {
      action: "update_rule",
      enabled: !loadingBlocked && rules.length > 0,
      disabledReasonCode: loadingBlocked
        ? "permission_denied"
        : "no_rule_selected",
      riskLevel: "medium",
    },
    {
      action: "disable_rule",
      enabled: !loadingBlocked && rules.some((rule) => rule.activeFlag),
      disabledReasonCode: loadingBlocked
        ? "permission_denied"
        : "no_active_rule",
      requiresReason: true,
      riskLevel: "high",
    },
    {
      action: "reorder_rule",
      enabled: !loadingBlocked && rules.length > 1,
      disabledReasonCode: loadingBlocked
        ? "permission_denied"
        : "insufficient_rule_count",
      riskLevel: "medium",
    },
    {
      action: "dry_run_rule",
      enabled: !loadingBlocked,
      ...(loadingBlocked ? { disabledReasonCode: "permission_denied" } : {}),
      riskLevel: "low",
    },
  ];
}

async function loadRulesPageData(
  filters: RulesFilters,
): Promise<RulesPageData> {
  const client = getTenantClient();
  const errors: string[] = [];

  const [
    rulesResult,
    quotaSummaryResult,
    approvalRequestsResult,
    ledgerEntriesResult,
  ] = await Promise.allSettled([
    client.listApprovalRules({
      ...(filters.search ? { search: filters.search } : {}),
      ...(filters.action !== "all" ? { action: filters.action } : {}),
    }) as Promise<TenantApprovalRuleRecord[]>,
    client.getTenantQuotaSummary() as Promise<TenantQuotaSummary>,
    client.listApprovalRequests({
      status: "pending",
    }) as Promise<TenantBookingApprovalRequestRecord[]>,
    client.listTenantQuotaLedger() as Promise<TenantQuotaLedgerEntry[]>,
  ]);

  const rules = rulesResult.status === "fulfilled" ? rulesResult.value : [];
  const quotaSummary =
    quotaSummaryResult.status === "fulfilled" ? quotaSummaryResult.value : null;
  const approvalRequests =
    approvalRequestsResult.status === "fulfilled"
      ? approvalRequestsResult.value
      : [];
  const ledgerEntries =
    ledgerEntriesResult.status === "fulfilled" ? ledgerEntriesResult.value : [];

  if (rulesResult.status === "rejected") {
    errors.push(
      rulesResult.reason instanceof Error
        ? rulesResult.reason.message
        : "Unable to load tenant approval rules.",
    );
  }

  if (quotaSummaryResult.status === "rejected") {
    errors.push(
      quotaSummaryResult.reason instanceof Error
        ? quotaSummaryResult.reason.message
        : "Unable to load tenant quota summary.",
    );
  }

  if (approvalRequestsResult.status === "rejected") {
    errors.push(
      approvalRequestsResult.reason instanceof Error
        ? approvalRequestsResult.reason.message
        : "Unable to load pending approval requests.",
    );
  }

  if (ledgerEntriesResult.status === "rejected") {
    errors.push(
      ledgerEntriesResult.reason instanceof Error
        ? ledgerEntriesResult.reason.message
        : "Unable to load tenant quota ledger entries.",
    );
  }

  return {
    rules,
    quotaSummary,
    approvalRequests,
    ledgerEntries: ledgerEntries
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 12),
    errors,
    availableActions: buildAvailableActions(rules, errors),
    emptyReason: classifyEmptyReason(
      rules,
      errors,
      filters,
      quotaSummary,
      approvalRequests,
      ledgerEntries,
    ),
    filters,
    refreshedAt: new Date().toISOString(),
  };
}

export default async function RulesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = await normalizeFilters(searchParams);
  const pageData = await loadRulesPageData(filters);

  return <RulesManager {...pageData} />;
}
