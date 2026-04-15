import Link from "next/link";
import type { ReportJobRecord } from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { createReportJob, refreshReports } from "./actions";

export default async function ReportsPage() {
  const client = getTenantClient();

  let jobs: ReportJobRecord[] = [];
  let error: string | null = null;

  try {
    jobs = await client.listReportJobs();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  const desc =
    "Fetched from /api/reports/jobs. " + jobs.length + " job(s) found.";

  return (
    <main className="app-grid">
      <AppShellCard title="Reports" description={desc}>
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        <form
          action={createReportJob}
          method="post"
          className="form-inline"
          style={{ marginBottom: 16 }}
        >
          <label htmlFor="jobType" style={{ marginRight: 8 }}>
            Job Type
          </label>
          <select
            id="jobType"
            name="jobType"
            defaultValue="dispatch_recording_index"
            style={{ marginRight: 16 }}
          >
            <option value="dispatch_recording_index">
              dispatch_recording_index
            </option>
          </select>
          <label htmlFor="format" style={{ marginRight: 8 }}>
            Format
          </label>
          <select
            id="format"
            name="format"
            defaultValue="csv"
            style={{ marginRight: 16 }}
          >
            <option value="csv">csv</option>
            <option value="xlsx">xlsx</option>
            <option value="pdf">pdf</option>
            <option value="zip">zip</option>
          </select>
          <button type="submit">Create Job</button>
          <button
            type="submit"
            formAction={refreshReports}
            style={{ marginLeft: 8 }}
          >
            Refresh
          </button>
        </form>

        {jobs.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>Status</th>
                  <th>Job Type</th>
                  <th>Format</th>
                  <th>Artifact</th>
                  <th>Expires</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.jobId}>
                    <td>{job.jobId}</td>
                    <td>{job.status}</td>
                    <td>{job.jobType}</td>
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
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">
            No report jobs found. Create one via POST /api/reports/jobs.
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
