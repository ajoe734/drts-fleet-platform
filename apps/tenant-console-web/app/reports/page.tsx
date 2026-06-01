import type { ReportJobRecord, ReportJobStatus } from "@drts/contracts";
import {
  REPORT_JOB_STATUSES,
  REPORT_JOB_TYPES,
  REPORT_OUTPUT_FORMATS,
} from "@drts/contracts";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { getTenantClient } from "@/lib/api-client";
import { formatCount, formatDateTime } from "@/lib/formatters";

export const dynamic = "force-dynamic";

function normalizeQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const typeFilter = normalizeQueryValue(params.type) ?? "";
  const statusFilter = normalizeQueryValue(params.status) ?? "";
  const client = getTenantClient();
  const jobs = (await client.listTenantReportJobs()) as ReportJobRecord[];

  const filteredJobs = [...jobs]
    .filter((job) => (typeFilter ? job.jobType === typeFilter : true))
    .filter((job) => (statusFilter ? job.status === statusFilter : true))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  const completedJobs = filteredJobs.filter(
    (job) => job.status === "completed",
  ).length;
  const failedJobs = filteredJobs.filter(
    (job) => job.status === "failed",
  ).length;

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Reports"
        title="Tenant report jobs now have a dedicated rebuild route."
        description="The route surfaces the canonical tenant report-job feed from `/api/tenant/reports/jobs`, including status, artifact availability, and filters by type or lifecycle state."
      />

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">Visible jobs</span>
          <strong>{formatCount(filteredJobs.length)}</strong>
          <p>{formatCount(jobs.length)} total report job(s) returned.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Completed</span>
          <strong>{formatCount(completedJobs)}</strong>
          <p>Artifact-ready jobs in the current filter scope.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Failed</span>
          <strong>{formatCount(failedJobs)}</strong>
          <p>Jobs that currently require rerun or backend follow-up.</p>
        </article>
      </section>

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="Filters"
          title="Filter report jobs"
          description="Manual refresh and job creation remain backend-supported; this route first ships the status and artifact visibility needed for smoke and closeout."
        >
          <form action="/reports" className="query-form">
            <div className="form-grid">
              <label className="field-stack">
                <span>Job type</span>
                <select defaultValue={typeFilter} name="type">
                  <option value="">All</option>
                  {REPORT_JOB_TYPES.map((jobType) => (
                    <option key={jobType} value={jobType}>
                      {jobType}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-stack">
                <span>Status</span>
                <select defaultValue={statusFilter} name="status">
                  <option value="">All</option>
                  {REPORT_JOB_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-actions">
              <button
                className="action-button action-button-primary"
                type="submit"
              >
                Apply filters
              </button>
              <a
                className="action-button action-button-secondary"
                href="/reports"
              >
                Reset
              </a>
            </div>
          </form>
        </SurfaceCard>

        <SurfaceCard
          kicker="Formats"
          title="Artifact output contract"
          description="Report jobs still map to the shared reporting contract and its canonical output formats."
        >
          <div className="chip-row">
            {REPORT_OUTPUT_FORMATS.map((format) => (
              <span className="status-chip" key={format}>
                {format}
              </span>
            ))}
          </div>
        </SurfaceCard>
      </section>

      <SurfaceCard
        kicker="Jobs"
        title={`Report job queue (${formatCount(filteredJobs.length)})`}
        description="Artifacts, expiry, and parameter summaries remain readable without leaving the tenant console route."
      >
        {filteredJobs.length > 0 ? (
          <div className="table-wrap">
            <table className="data-grid">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Status</th>
                  <th>Type</th>
                  <th>Filters</th>
                  <th>Artifact</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((job) => (
                  <tr key={job.jobId}>
                    <td>
                      <div className="table-primary">
                        <span>{job.jobId}</span>
                        <span className="table-secondary">
                          Created {formatDateTime(job.createdAt)}
                        </span>
                      </div>
                    </td>
                    <td>{renderStatus(job.status)}</td>
                    <td>{job.jobType}</td>
                    <td>
                      {Object.keys(job.filters).length > 0
                        ? JSON.stringify(job.filters)
                        : "—"}
                    </td>
                    <td>
                      {job.artifact ? (
                        <div className="table-primary">
                          <span>{job.format}</span>
                          <span className="table-secondary">
                            Expires {formatDateTime(job.artifact.expiresAt)}
                          </span>
                        </div>
                      ) : (
                        "Pending"
                      )}
                    </td>
                    <td>{formatDateTime(job.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-panel">
            No report jobs matched the current filter scope.
          </div>
        )}
      </SurfaceCard>

      <CalloutPanel
        title="Next step for full productization"
        description="This route ships the reporting read model needed for umbrella closeout. If the team later wants in-console job creation, the backend contract is already available via `createTenantReportJob`."
      />
    </div>
  );
}

function renderStatus(status: ReportJobStatus) {
  if (status === "completed") {
    return <span className="status-chip is-active">completed</span>;
  }

  if (status === "failed" || status === "expired") {
    return <span className="status-badge">{status}</span>;
  }

  return <span className="status-chip">{status}</span>;
}
