import type {
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
};

async function loadRulesPageData(): Promise<RulesPageData> {
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

  return {
    rules,
    quotaSummary,
    approvalRequests,
    ledgerEntries: ledgerEntries
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 12),
    errors,
  };
}

export default async function RulesPage() {
  const pageData = await loadRulesPageData();
  return <RulesManager {...pageData} />;
}
