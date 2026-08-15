import type {
  EmptyReason,
  ReportJobRecord,
  ResourceActionDescriptor,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import { ReportsManager } from "./reports-manager";

export const dynamic = "force-dynamic";

type ReportsPageProps = {
  searchParams?: Promise<{
    emptyReason?: string;
  }>;
};

type ReportsPageData = {
  jobs: ReportJobRecord[];
  errors: string[];
  emptyReason: EmptyReason | null;
  generatedAt: string;
  refreshTier: "manual";
  availableActions: ResourceActionDescriptor[];
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
    action: "create_report_job",
    enabled: true,
    riskLevel: "low",
  },
  {
    action: "refresh_report_jobs",
    enabled: true,
    riskLevel: "low",
  },
  {
    action: "open_ops_reporting",
    enabled: true,
    riskLevel: "low",
  },
  {
    action: "open_platform_audit",
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
  jobs: ReportJobRecord[];
  errors: string[];
}): EmptyReason | null {
  if (data.errors.length > 0 && data.jobs.length === 0) {
    return "fetch_failed";
  }

  if (data.jobs.length === 0) {
    return "no_data";
  }

  return null;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown reporting error.";
}

async function loadReportsPageData(
  emptyReasonOverride: EmptyReason | null,
): Promise<ReportsPageData> {
  const client = await getTenantClient();
  const jobsResult = await client
    .listTenantReportJobs()
    .then((jobs) => ({ ok: true as const, jobs }))
    .catch((error) => ({ ok: false as const, error }));

  const jobs = jobsResult.ok
    ? [...jobsResult.jobs].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      )
    : [];
  const errors = jobsResult.ok ? [] : [toErrorMessage(jobsResult.error)];

  const generatedAt =
    jobs[0]?.updatedAt ?? jobs[0]?.createdAt ?? new Date().toISOString();
  const inferredEmptyReason = inferEmptyReason({
    jobs,
    errors,
  });

  return {
    jobs,
    errors,
    emptyReason: emptyReasonOverride ?? inferredEmptyReason,
    generatedAt,
    refreshTier: "manual",
    availableActions: [...ROUTE_ACTIONS],
  };
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const emptyReasonOverride = parseEmptyReason(
    resolvedSearchParams?.emptyReason,
  );
  const pageData = await loadReportsPageData(emptyReasonOverride);

  return <ReportsManager {...pageData} />;
}
