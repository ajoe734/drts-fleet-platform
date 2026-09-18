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
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
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

function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  if (
    value &&
    typeof value === "object" &&
    Array.isArray((value as { items?: unknown }).items)
  ) {
    return (value as { items: T[] }).items;
  }
  return [];
}

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
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
  const client = await getTenantClient();
  const locale = await getServerLocale();
  const translate = (key: string, params?: Record<string, string | number>) =>
    t(key, locale, params);
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
    costCentersResult.status === "fulfilled"
      ? toArray<TenantCostCenterRecord>(costCentersResult.value)
      : [];
  const approvalRules =
    approvalRulesResult.status === "fulfilled"
      ? toArray<TenantApprovalRuleRecord>(approvalRulesResult.value).filter(
          (rule) => rule.activeFlag,
        )
      : [];
  const users =
    usersResult.status === "fulfilled"
      ? toArray<TenantUserRoleRecord>(usersResult.value)
      : [];
  const coverageReport =
    coverageResult.status === "fulfilled" ? coverageResult.value : null;
  const reportJobs =
    reportJobsResult.status === "fulfilled"
      ? toArray<ReportJobRecord>(reportJobsResult.value)
      : [];

  if (costCentersResult.status === "rejected") {
    errors.push(
      translate("costCenters.error.costCenterDirectory", {
        message: toErrorMessage(
          costCentersResult.reason,
          translate("costCenters.error.unknown"),
        ),
      }),
    );
  }
  if (approvalRulesResult.status === "rejected") {
    errors.push(
      translate("costCenters.error.approvalRules", {
        message: toErrorMessage(
          approvalRulesResult.reason,
          translate("costCenters.error.unknown"),
        ),
      }),
    );
  }
  if (usersResult.status === "rejected") {
    errors.push(
      translate("costCenters.error.tenantUsers", {
        message: toErrorMessage(
          usersResult.reason,
          translate("costCenters.error.unknown"),
        ),
      }),
    );
  }
  if (coverageResult.status === "rejected") {
    errors.push(
      translate("costCenters.error.coverageReport", {
        message: toErrorMessage(
          coverageResult.reason,
          translate("costCenters.error.unknown"),
        ),
      }),
    );
  }
  if (reportJobsResult.status === "rejected") {
    errors.push(
      translate("costCenters.error.reportJobs", {
        message: toErrorMessage(
          reportJobsResult.reason,
          translate("costCenters.error.unknown"),
        ),
      }),
    );
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
        errors.push(
          translate("costCenters.error.quota", {
            code,
            message: toErrorMessage(
              result.reason,
              translate("costCenters.error.unknown"),
            ),
          }),
        );
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
