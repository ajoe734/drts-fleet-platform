import type {
  ReportJobRecord,
  ReportJobStatus,
  ReportOutputFormat,
} from "@drts/contracts";
import { REPORT_OUTPUT_FORMATS } from "@drts/contracts";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { getTenantClient } from "@/lib/api-client";
import { formatCount, formatDateTime } from "@/lib/formatters";
import { createTenantReportJobAction } from "./actions";

export const dynamic = "force-dynamic";

const REPORT_KIND_OPTIONS = [
  {
    value: "monthly_trip_report",
    label: "Monthly usage",
    description: "Tenant monthly trip volume snapshot.",
  },
  {
    value: "revenue_summary",
    label: "Cost center split",
    description: "Revenue-oriented export for finance review.",
  },
  {
    value: "trip_summary",
    label: "SLA summary",
    description: "Trip-level service and fulfillment summary.",
  },
] as const;

const REPORT_FORMAT_OPTIONS: readonly ReportOutputFormat[] =
  REPORT_OUTPUT_FORMATS;

type ReportsData = {
  jobs: ReportJobRecord[];
  errors: string[];
};

const FILTER_LABELS: Record<string, string> = {
  tenantId: "Tenant",
  from: "From",
  to: "To",
  cost_center: "Cost center",
  periodStart: "Period start",
  periodEnd: "Period end",
  costCenter: "Cost center",
};

async function loadReportsData(): Promise<ReportsData> {
  const client = getTenantClient();

  try {
    const jobs = (await client.listTenantReportJobs()) as ReportJobRecord[];
    return {
      jobs,
      errors: [],
    };
  } catch (error) {
    return {
      jobs: [],
      errors: [
        error instanceof Error
          ? error.message
          : "Unknown tenant reporting error.",
      ],
    };
  }
}

function getReportKindLabel(jobType: string) {
  return (
    REPORT_KIND_OPTIONS.find((option) => option.value === jobType)?.label ??
    jobType
  );
}

function getStatusClassName(status: ReportJobStatus) {
  switch (status) {
    case "completed":
      return "status-chip is-active";
    case "running":
      return "status-chip is-warning";
    case "failed":
      return "status-chip is-external";
    case "expired":
      return "status-chip";
    case "queued":
    default:
      return "status-chip";
  }
}

function getArtifactState(job: ReportJobRecord) {
  if (job.artifact) {
    return `Ready until ${formatDateTime(job.artifact.expiresAt)}`;
  }
  if (job.status === "failed") {
    return "No artifact generated";
  }
  if (job.status === "expired") {
    return "Expired";
  }
  return "Pending";
}

function renderArtifactCell(job: ReportJobRecord) {
  if (job.artifact) {
    return (
      <div className="table-primary">
        <a
          className="text-link"
          href={job.artifact.downloadUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          Download artifact
        </a>
        <span className="table-secondary">{getArtifactState(job)}</span>
      </div>
    );
  }

  return (
    <div className="table-primary">
      {getArtifactState(job)}
      <span className="table-secondary">No artifact URL yet</span>
    </div>
  );
}

function renderFilterValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (Array.isArray(value)) {
    return value.map((item) => renderFilterValue(item)).join(", ");
  }

  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }

  return "Not set";
}

function getCreateFilterCopy() {
  return "Each submission creates a background job. Date range and cost-center filters are forwarded through `job.filters` using the existing `from`, `to`, and `cost_center` contract keys, while artifact expiry remains published by the reporting service.";
}

function renderFiltersCell(job: ReportJobRecord) {
  const entries = Object.entries(job.filters ?? {});
  if (entries.length === 0) {
    return (
      <div className="table-primary">
        No explicit filters
        <span className="table-secondary">
          Backend-owned defaults determined the export scope.
        </span>
      </div>
    );
  }

  return (
    <div className="table-primary">
      {entries.map(([key, value]) => (
        <span key={key} className="table-secondary">
          <strong>{FILTER_LABELS[key] ?? key}</strong>:{" "}
          {renderFilterValue(value)}
        </span>
      ))}
    </div>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await loadReportsData();
  const resolvedSearchParams = await searchParams;
  const createdJobId = Array.isArray(resolvedSearchParams.created)
    ? resolvedSearchParams.created[0]
    : resolvedSearchParams.created;
  const errorMessage = Array.isArray(resolvedSearchParams.error)
    ? resolvedSearchParams.error[0]
    : resolvedSearchParams.error;

  const jobs = [...data.jobs].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  const completedCount = jobs.filter(
    (job) => job.status === "completed",
  ).length;
  const queuedCount = jobs.filter(
    (job) => job.status === "queued" || job.status === "running",
  ).length;
  const readyCount = jobs.filter((job) => Boolean(job.artifact)).length;
  const failedCount = jobs.filter((job) => job.status === "failed").length;

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Reports"
        title="Tenant reporting now runs through contract-backed report jobs."
        description="This route stays within `/api/tenant/reports/jobs` and `/api/tenant/reports/:jobId`, showing tenant-scoped export jobs, artifact readiness, and background execution state without inventing a separate reporting pipeline."
      />

      {createdJobId ? (
        <CalloutPanel
          title="Report job queued"
          description={`Job ${createdJobId} was accepted by the tenant reporting contract and will appear below as execution state advances.`}
        />
      ) : null}

      {errorMessage ? (
        <CalloutPanel
          title="Report job could not be created"
          description={errorMessage}
          tone="warning"
        />
      ) : null}

      {data.errors.length > 0 ? (
        <CalloutPanel
          title="Reporting data could not be loaded"
          description="The route keeps the create surface visible, but job history remains unavailable until tenant reporting transport recovers."
          tone="warning"
        >
          <ul className="panel-list">
            {data.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </CalloutPanel>
      ) : null}

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">Jobs</span>
          <strong>{formatCount(jobs.length)}</strong>
          <p>Tenant-scoped report jobs currently visible in history.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Running / queued</span>
          <strong>{formatCount(queuedCount)}</strong>
          <p>Background jobs that have not yet produced a terminal result.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Artifacts ready</span>
          <strong>{formatCount(readyCount)}</strong>
          <p>Jobs with a published short-lived artifact download.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Completed</span>
          <strong>{formatCount(completedCount)}</strong>
          <p>
            {failedCount > 0
              ? `${formatCount(failedCount)} job(s) ended in failure and need regeneration.`
              : "No failed tenant report job is currently visible."}
          </p>
        </article>
      </section>

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="Create"
          title="Queue a tenant export job"
          description="The UI submits report kind, output format, and optional contract-backed `from` / `to` / `cost_center` filters. Delivery policy and any deeper backend semantics remain reporting-service owned."
        >
          <form action={createTenantReportJobAction} className="query-form">
            <div className="form-grid">
              <label className="field-stack">
                <span>Report kind</span>
                <select name="jobType" defaultValue="monthly_trip_report">
                  {REPORT_KIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-stack">
                <span>Format</span>
                <select name="format" defaultValue="xlsx">
                  {REPORT_FORMAT_OPTIONS.map((format) => (
                    <option key={format} value={format}>
                      {format.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-stack">
                <span>From</span>
                <input name="from" type="date" />
              </label>
              <label className="field-stack">
                <span>To</span>
                <input name="to" type="date" />
              </label>
              <label className="field-stack">
                <span>Cost center</span>
                <input
                  name="cost_center"
                  placeholder="Optional billing / finance slice"
                />
              </label>
            </div>
            <ul className="panel-list">
              {REPORT_KIND_OPTIONS.map((option) => (
                <li key={option.value}>
                  <strong>{option.label}</strong>
                  <span className="list-note">{option.value}</span>
                  <p className="muted-copy">{option.description}</p>
                </li>
              ))}
            </ul>
            <div className="form-actions">
              <p className="action-note">{getCreateFilterCopy()}</p>
              <button
                className="action-button action-button-primary"
                type="submit"
              >
                Create job
              </button>
            </div>
          </form>
        </SurfaceCard>

        <SurfaceCard
          kicker="Scope"
          title="Contract-safe tenant reporting lane"
          description="The artboard implies monthly usage, cost-center framing, and SLA summaries. The shipped route maps that intent to the existing report job contract and its published filter bag instead of inventing tenant-only tables or a separate export scheduler."
        >
          <ul className="panel-list">
            <li>Monthly usage maps to `monthly_trip_report`.</li>
            <li>Cost center framing maps to `revenue_summary` exports.</li>
            <li>SLA summary maps to `trip_summary` job history.</li>
            <li>
              Date range filters map to `job.filters.from` / `job.filters.to`.
            </li>
            <li>Finance slicing maps to `job.filters.cost_center`.</li>
            <li>
              Artifact expiry is displayed from the published report artifact,
              not a UI-local retention timer.
            </li>
            <li>
              Signed downloads use the published `downloadUrl` only and do not
              invent a local proxy or retention workflow.
            </li>
          </ul>
        </SurfaceCard>
      </section>

      <SurfaceCard
        kicker="History"
        title="Tenant report job register"
        description="Job history remains append-only from the reporting pipeline. Download availability is shown only when the backend has issued an artifact."
      >
        <div className="table-wrap">
          <table className="data-grid">
            <thead>
              <tr>
                <th>Job</th>
                <th>Kind</th>
                <th>Filters</th>
                <th>Format</th>
                <th>Status</th>
                <th>Artifact</th>
                <th>Created</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length > 0 ? (
                jobs.map((job) => (
                  <tr key={job.jobId}>
                    <td>
                      <div className="table-primary">
                        <strong>{job.jobId}</strong>
                        <span className="table-secondary">
                          Tenant-scoped reporting job
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="table-primary">
                        {getReportKindLabel(job.jobType)}
                        <span className="table-secondary">{job.jobType}</span>
                      </div>
                    </td>
                    <td>{renderFiltersCell(job)}</td>
                    <td>{job.format.toUpperCase()}</td>
                    <td>
                      <span className={getStatusClassName(job.status)}>
                        {job.status}
                      </span>
                    </td>
                    <td>{renderArtifactCell(job)}</td>
                    <td>{formatDateTime(job.createdAt)}</td>
                    <td>{formatDateTime(job.updatedAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-panel">
                      No tenant report job has been queued yet.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SurfaceCard>
    </div>
  );
}
