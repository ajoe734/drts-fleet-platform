import Link from "next/link";
import type { ReportJobRecord } from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { formatPortalUiError, toPortalErrorMessage } from "@/lib/error-copy";
import { createReportJob, refreshReports } from "./actions";
import {
  getReportJobSourceSummary,
  getSourceToneClassName,
} from "@/lib/source-domain";
import { describeRoleSnapshot, getTenantRoleSnapshot } from "@/lib/rbac";
import { formatPortalCodeLabel } from "@/lib/localized-labels";

export default async function ReportsPage() {
  const client = await getTenantClient();
  const roleSnapshot = await getTenantRoleSnapshot();

  let jobs: ReportJobRecord[] = [];
  let error: string | null = null;

  try {
    jobs = await client.listTenantReportJobs();
  } catch (e) {
    error = formatPortalUiError(toPortalErrorMessage(e), "無法載入報表工作");
  }

  const desc = `目前共有 ${jobs.length} 筆報表工作可供檢視。`;

  return (
    <main className="app-grid">
      <AppShellCard
        title="報表"
        description={
          roleSnapshot.capabilities.canWriteReports
            ? desc
            : `${desc} 目前以 ${describeRoleSnapshot(roleSnapshot)} 身分檢視，僅提供唯讀報表存取。`
        }
      >
        {error && (
          <div className="error-banner">
            <strong>錯誤：</strong> {error}
          </div>
        )}

        <form
          action={createReportJob}
          method="post"
          className="form-inline"
          style={{ marginBottom: 16 }}
        >
          <label htmlFor="jobType" style={{ marginRight: 8 }}>
            工作類型
          </label>
          <select
            id="jobType"
            name="jobType"
            defaultValue="dispatch_recording_index"
            style={{ marginRight: 16 }}
          >
            <option value="dispatch_recording_index">派遣錄音索引</option>
            <option value="revenue_summary">營收摘要</option>
          </select>
          <label htmlFor="format" style={{ marginRight: 8 }}>
            格式
          </label>
          <select
            id="format"
            name="format"
            defaultValue="csv"
            style={{ marginRight: 16 }}
          >
            <option value="csv">CSV</option>
            <option value="xlsx">XLSX</option>
            <option value="pdf">PDF</option>
            <option value="zip">ZIP</option>
          </select>
          <button
            type="submit"
            disabled={!roleSnapshot.capabilities.canWriteReports}
          >
            建立工作
          </button>
          <button
            type="submit"
            formAction={refreshReports}
            style={{ marginLeft: 8 }}
          >
            重新整理
          </button>
        </form>

        {jobs.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>工作編號</th>
                  <th>狀態</th>
                  <th>工作類型</th>
                  <th>來源領域</th>
                  <th>格式</th>
                  <th>產出檔案</th>
                  <th>到期時間</th>
                  <th>建立時間</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const source = getReportJobSourceSummary(job);
                  return (
                    <tr key={job.jobId}>
                      <td>{job.jobId}</td>
                      <td>{formatPortalCodeLabel(job.status, job.status)}</td>
                      <td>{formatPortalCodeLabel(job.jobType, job.jobType)}</td>
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
                            下載
                          </a>
                        ) : (
                          <em>待產出</em>
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
            目前沒有報表工作。可透過上方功能建立新的報表工作。
          </p>
        )}

        <Link className="route-link" href="/">
          <strong>返回首頁</strong>
          回到租戶入口總覽。
        </Link>
      </AppShellCard>
    </main>
  );
}
