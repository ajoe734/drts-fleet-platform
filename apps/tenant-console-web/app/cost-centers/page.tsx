import type {
  EmptyReason,
  ReportJobRecord,
  TenantApprovalRuleRecord,
  TenantCostCenterCoverageReport,
  TenantCostCenterQuotaSummary,
  TenantCostCenterRecord,
  TenantUserRoleRecord,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import { CostCentersManager } from "./cost-centers-manager";

export const dynamic = "force-dynamic";

type CostCentersPageData = {
  costCenters: TenantCostCenterRecord[];
  quotaSummariesByCode: Partial<Record<string, TenantCostCenterQuotaSummary>>;
  approvalRules: TenantApprovalRuleRecord[];
  users: TenantUserRoleRecord[];
  coverageReport: TenantCostCenterCoverageReport | null;
  reportJobs: ReportJobRecord[];
  errors: string[];
};

const EMPTY_REASONS: EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
];

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

function parseEmptyReason(
  value: string | string[] | undefined,
): EmptyReason | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return null;
  return EMPTY_REASONS.includes(candidate as EmptyReason)
    ? (candidate as EmptyReason)
    : null;
}

async function loadCostCentersData(): Promise<CostCentersPageData> {
  const client = getTenantClient();
  const errors: string[] = [];
  const [
    costCentersResult,
    approvalRulesResult,
    usersResult,
    coverageResult,
    reportJobsResult,
  ] = await Promise.allSettled([
    client.listCostCenters() as Promise<TenantCostCenterRecord[]>,
    client.listApprovalRules({
      activeOnly: true,
    }) as Promise<TenantApprovalRuleRecord[]>,
    client.listTenantUsers() as Promise<TenantUserRoleRecord[]>,
    client.getTenantCostCenterCoverageReport() as Promise<TenantCostCenterCoverageReport>,
    client.listTenantReportJobs() as Promise<ReportJobRecord[]>,
  ]);

  const costCenters =
    costCentersResult.status === "fulfilled" ? costCentersResult.value : [];
  const approvalRules =
    approvalRulesResult.status === "fulfilled"
      ? approvalRulesResult.value.filter((rule) => rule.activeFlag)
      : [];
  const users = usersResult.status === "fulfilled" ? usersResult.value : [];
  const coverageReport =
    coverageResult.status === "fulfilled" ? coverageResult.value : null;
  const reportJobs =
    reportJobsResult.status === "fulfilled" ? reportJobsResult.value : [];

  if (costCentersResult.status === "rejected") {
    errors.push(`成本中心目錄: ${toErrorMessage(costCentersResult.reason)}`);
  }
  if (approvalRulesResult.status === "rejected") {
    errors.push(`審批規則: ${toErrorMessage(approvalRulesResult.reason)}`);
  }
  if (usersResult.status === "rejected") {
    errors.push(`租戶成員: ${toErrorMessage(usersResult.reason)}`);
  }
  if (coverageResult.status === "rejected") {
    errors.push(`coverage report: ${toErrorMessage(coverageResult.reason)}`);
  }
  if (reportJobsResult.status === "rejected") {
    errors.push(`報表作業: ${toErrorMessage(reportJobsResult.reason)}`);
  }

  const quotaSummariesByCode: Partial<
    Record<string, TenantCostCenterQuotaSummary>
  > = {};

  if (costCenters.length > 0) {
    const quotaResults = await Promise.allSettled(
      costCenters.map((costCenter) =>
        client.getCostCenterQuotaSummary(costCenter.code),
      ),
    );

    quotaResults.forEach((result, index) => {
      const code = costCenters[index]?.code;
      if (!code) return;
      if (result.status === "fulfilled") {
        quotaSummariesByCode[code] = result.value;
      } else {
        errors.push(`${code} quota: ${toErrorMessage(result.reason)}`);
      }
    });
  }

  return {
    costCenters,
    quotaSummariesByCode,
    approvalRules,
    users,
    coverageReport,
    reportJobs,
    errors,
  };
}

export default async function CostCentersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const fallbackSearchParams: Record<string, string | string[] | undefined> =
    {};
  const [data, resolvedSearchParams] = await Promise.all([
    loadCostCentersData(),
    searchParams ?? Promise.resolve(fallbackSearchParams),
  ]);

  return (
    <CostCentersManager
      costCenters={data.costCenters}
      quotaSummariesByCode={data.quotaSummariesByCode}
      approvalRules={data.approvalRules}
      users={data.users}
      coverageReport={data.coverageReport}
      reportJobs={data.reportJobs}
      errors={data.errors}
      initialEmptyReason={parseEmptyReason(resolvedSearchParams.emptyReason)}
    />
  );
}
