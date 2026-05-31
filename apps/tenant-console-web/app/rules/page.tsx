import type {
  EmptyReason,
  ResourceActionDescriptor,
  TenantApprovalRuleRecord,
  TenantBookingApprovalRequestRecord,
  TenantQuotaLedgerEntry,
  TenantQuotaSummary,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import { RulesManager } from "./rules-manager";

export const dynamic = "force-dynamic";

type RulesPageData = {
  rules: TenantApprovalRuleRecord[];
  quotaSummary: TenantQuotaSummary | null;
  approvalRequests: TenantBookingApprovalRequestRecord[];
  ledgerEntries: TenantQuotaLedgerEntry[];
  errors: string[];
  emptyReason: EmptyReason | null;
  generatedAt: string;
  refreshTier: "slow";
  availableActions: ResourceActionDescriptor[];
};

type RulesPageProps = {
  searchParams?: Promise<{
    emptyReason?: string;
  }>;
};

const EMPTY_REASONS: readonly EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const;

const ROUTE_ACTIONS: readonly ResourceActionDescriptor[] = [
  {
    action: "create_rule",
    enabled: true,
    riskLevel: "medium",
  },
  {
    action: "update_rule",
    enabled: true,
    riskLevel: "medium",
  },
  {
    action: "disable_rule",
    enabled: true,
    requiresReason: true,
    riskLevel: "high",
  },
  {
    action: "reorder_precedence",
    enabled: true,
    riskLevel: "medium",
  },
  {
    action: "dry_run_evaluate",
    enabled: true,
    riskLevel: "low",
  },
] as const;

function parseEmptyReason(value: string | undefined): EmptyReason | null {
  if (!value) {
    return null;
  }

  return EMPTY_REASONS.includes(value as EmptyReason)
    ? (value as EmptyReason)
    : null;
}

function inferEmptyReason(data: {
  rules: TenantApprovalRuleRecord[];
  quotaSummary: TenantQuotaSummary | null;
  approvalRequests: TenantBookingApprovalRequestRecord[];
  ledgerEntries: TenantQuotaLedgerEntry[];
  errors: string[];
}): EmptyReason | null {
  if (data.errors.length > 0 && data.rules.length === 0) {
    return "fetch_failed";
  }

  if (
    data.rules.length === 0 &&
    data.quotaSummary === null &&
    data.approvalRequests.length === 0 &&
    data.ledgerEntries.length === 0
  ) {
    return "not_provisioned";
  }

  if (data.rules.length === 0) {
    return "no_data";
  }

  return null;
}

async function loadRulesPageData(
  emptyReasonOverride: EmptyReason | null,
): Promise<RulesPageData> {
  const client = getTenantClient();
  const errors: string[] = [];

  const [
    rulesResult,
    quotaSummaryResult,
    approvalRequestsResult,
    ledgerEntriesResult,
  ] = await Promise.allSettled([
    client.listApprovalRules() as Promise<TenantApprovalRuleRecord[]>,
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

  const sortedLedgerEntries = ledgerEntries
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 12);

  const generatedAt =
    quotaSummary?.refreshedAt ??
    sortedLedgerEntries[0]?.createdAt ??
    approvalRequests[0]?.createdAt ??
    rules[0]?.updatedAt ??
    new Date().toISOString();

  const inferredEmptyReason = inferEmptyReason({
    rules,
    quotaSummary,
    approvalRequests,
    ledgerEntries: sortedLedgerEntries,
    errors,
  });

  return {
    rules,
    quotaSummary,
    approvalRequests,
    ledgerEntries: sortedLedgerEntries,
    errors,
    emptyReason: emptyReasonOverride ?? inferredEmptyReason,
    generatedAt,
    refreshTier: "slow",
    availableActions: [...ROUTE_ACTIONS],
  };
}

export default async function RulesPage({ searchParams }: RulesPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const emptyReasonOverride = parseEmptyReason(
    resolvedSearchParams?.emptyReason,
  );
  const pageData = await loadRulesPageData(emptyReasonOverride);

  return <RulesManager {...pageData} />;
}
