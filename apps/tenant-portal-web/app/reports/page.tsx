import Link from "next/link";
import type { ReportJobRecord } from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { createReportJob, refreshReports } from "./actions";
import {
  getReportJobSourceSummary,
  getSourceToneClassName,
} from "@/lib/source-domain";
import { describeRoleSnapshot, getTenantRoleSnapshot } from "@/lib/rbac";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export default async function ReportsPage() {
  const locale = await getServerLocale();
  const client = await getTenantClient();
  const roleSnapshot = await getTenantRoleSnapshot();

  let jobs: ReportJobRecord[] = [];
  let error: string | null = null;

  try {
    jobs = await client.listTenantReportJobs();
  } catch (e) {
    error = e instanceof Error ? e.message : t("reports.error.unknown", locale);
  }

  const desc = t("reports.description.summary", locale, { count: jobs.length });

  return (
    <main className="app-grid">
      <AppShellCard
        title={t("reports.title", locale)}
        description={
          roleSnapshot.capabilities.canWriteReports
            ? desc
            : t("reports.description.readOnly", locale, {
                summary: desc,
                role: describeRoleSnapshot(roleSnapshot, locale),
              })
        }
      >
        {error && (
          <div className="error-banner">
            <strong>{t("reports.error.label", locale)}</strong> {error}
          </div>
        )}

        <form
          action={createReportJob}
          method="post"
          className="form-inline"
          style={{ marginBottom: 16 }}
        >
          <label htmlFor="jobType" style={{ marginRight: 8 }}>
            {t("reports.field.jobType", locale)}
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
            <option value="revenue_summary">revenue_summary</option>
          </select>
          <label htmlFor="format" style={{ marginRight: 8 }}>
            {t("reports.field.format", locale)}
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
          <button
            type="submit"
            disabled={!roleSnapshot.capabilities.canWriteReports}
          >
            {t("reports.action.createJob", locale)}
          </button>
          <button
            type="submit"
            formAction={refreshReports}
            style={{ marginLeft: 8 }}
          >
            {t("reports.action.refresh", locale)}
          </button>
        </form>

        {jobs.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>{t("reports.column.jobId", locale)}</th>
                  <th>{t("reports.column.status", locale)}</th>
                  <th>{t("reports.column.jobType", locale)}</th>
                  <th>{t("reports.column.sourceDomain", locale)}</th>
                  <th>{t("reports.column.format", locale)}</th>
                  <th>{t("reports.column.artifact", locale)}</th>
                  <th>{t("reports.column.expires", locale)}</th>
                  <th>{t("reports.column.created", locale)}</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const source = getReportJobSourceSummary(job, locale);
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
                            {t("reports.action.download", locale)}
                          </a>
                        ) : (
                          <em>{t("reports.status.pending", locale)}</em>
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
          <p className="empty-state">{t("reports.empty.jobs", locale)}</p>
        )}

        <Link className="route-link" href="/">
          <strong>{t("reports.link.backHome", locale)}</strong>
          {t("reports.link.backHomeDetail", locale)}
        </Link>
      </AppShellCard>
    </main>
  );
}
