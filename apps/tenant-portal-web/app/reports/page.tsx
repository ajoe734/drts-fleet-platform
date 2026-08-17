import Link from "next/link";
import type { ReportJobRecord } from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { ReportCreateForm } from "./report-create-form";
import {
  getReportJobSourceSummary,
  getSourceToneClassName,
} from "@/lib/source-domain";
import { describeRoleSnapshot, getTenantRoleSnapshot } from "@/lib/rbac";

export default async function ReportsPage() {
  const client = await getTenantClient();
  const roleSnapshot = await getTenantRoleSnapshot();

  let jobs: ReportJobRecord[] = [];
  let error: string | null = null;

  try {
    jobs = await client.listTenantReportJobs();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  const desc =
    "Fetched from /api/tenant/reports/jobs. " + jobs.length + " job(s) found.";

  return (
    <main className="app-grid">
      <AppShellCard
        title="Reports"
        description={
          roleSnapshot.capabilities.canWriteReports
            ? desc
            : `${desc} Viewing as ${describeRoleSnapshot(roleSnapshot)} with read-only report access.`
        }
      >
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        <ReportCreateForm
          canWriteReports={roleSnapshot.capabilities.canWriteReports}
        />

        {jobs.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>Status</th>
                  <th>Job Type</th>
                  <th>Source Domain</th>
                  <th>Format</th>
                  <th>Artifact</th>
                  <th>Expires</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const source = getReportJobSourceSummary(job);
                  return (
                    <tr key={job.jobId}>
                      <td>{job.jobId}</td>
                      <td>{job.status}</td>
                      <td>{job.jobType}</td>
                      <td>
                        <span className={getSourceToneClassName(source.tone)}>
                          {source.badge}
                        </span>
                        <div className="source-detail">{source.detail}</div>
                      </td>
                      <td>{job.format}</td>
                      <td>
                        {job.artifact ? (
                          <a
                            href={job.artifact.downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Download
                          </a>
                        ) : (
                          <em>pending</em>
                        )}
                      </td>
                      <td>
                        {job.artifact
                          ? new Date(job.artifact.expiresAt).toLocaleString()
                          : "-"}
                      </td>
                      <td>{new Date(job.createdAt).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">
            No report jobs found. Create one via POST /api/tenant/reports/jobs.
          </p>
        )}

        <Link className="route-link" href="/">
          <strong>Back to home</strong>
          Return to the tenant portal overview.
        </Link>
      </AppShellCard>
    </main>
  );
}
