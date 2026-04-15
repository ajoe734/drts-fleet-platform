"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { AppShellCard } from "@drts/ui-web";
import type {
  CreateReportJobCommand,
  ReportJobRecord,
  ReportOutputFormat,
} from "@drts/contracts";
import { REPORT_OUTPUT_FORMATS } from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";

const JOB_PRESETS: Array<{
  value: string;
  label: string;
  description: string;
}> = [
  {
    value: "revenue_summary",
    label: "Revenue summary",
    description: "Revenue, average trip, and payout-friendly export.",
  },
  {
    value: "dispatch_recording_index",
    label: "Dispatch trace",
    description: "Dispatch and recording index export for audit follow-up.",
  },
  {
    value: "incident_register",
    label: "Incident register",
    description: "Operational incident summary for ROC review.",
  },
  {
    value: "maintenance_overview",
    label: "Maintenance overview",
    description: "Vehicle maintenance backlog and completion export.",
  },
];

export default function ReportsPage() {
  const [jobs, setJobs] = useState<ReportJobRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [jobType, setJobType] = useState(JOB_PRESETS[0]!.value);
  const [format, setFormat] = useState<ReportOutputFormat>("xlsx");
  const [periodLabel, setPeriodLabel] = useState("");
  const [vehicleId, setVehicleId] = useState("");

  useEffect(() => {
    void loadJobs();
  }, []);

  async function loadJobs() {
    setLoading(true);
    try {
      const client = getOpsClient();
      setJobs(await client.listReportJobs());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(() => {
      void (async () => {
        try {
          const client = getOpsClient();
          const filters: CreateReportJobCommand["filters"] = {};
          if (periodLabel.trim()) filters.period = periodLabel.trim();
          if (vehicleId.trim()) filters.vehicleId = vehicleId.trim();
          const command: CreateReportJobCommand = {
            jobType,
            format,
            ...(Object.keys(filters).length > 0 ? { filters } : {}),
          };
          await client.createReportJob(command);
          await loadJobs();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Unknown error");
        }
      })();
    });
  }

  const queuedCount = jobs.filter((job) => job.status === "queued").length;
  const completedCount = jobs.filter(
    (job) => job.status === "completed",
  ).length;
  const artifactCount = jobs.filter((job) => job.artifact).length;

  return (
    <main className="app-grid">
      <AppShellCard
        title="Reports Center"
        description="Create revenue, dispatch, incident, and maintenance exports through background jobs with artifact download links."
      >
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        <section className="summary-grid">
          {[
            {
              label: "Queued jobs",
              value: queuedCount,
              note: "Background jobs waiting or running",
            },
            {
              label: "Completed",
              value: completedCount,
              note: "Ready for artifact download",
            },
            {
              label: "Artifacts",
              value: artifactCount,
              note: "Generated download packages",
            },
          ].map((card) => (
            <div key={card.label} className="summary-card">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.note}</small>
            </div>
          ))}
        </section>

        <form className="report-form" onSubmit={handleSubmit}>
          <div className="panel-head">
            <div>
              <p className="eyebrow">Create job</p>
              <h3>Background export request</h3>
            </div>
          </div>
          <div className="form-grid">
            <label>
              Report type
              <select
                value={jobType}
                onChange={(event) => setJobType(event.target.value)}
              >
                {JOB_PRESETS.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
              <small>
                {JOB_PRESETS.find((preset) => preset.value === jobType)
                  ?.description ?? ""}
              </small>
            </label>
            <label>
              Format
              <select
                value={format}
                onChange={(event) =>
                  setFormat(event.target.value as ReportOutputFormat)
                }
              >
                {REPORT_OUTPUT_FORMATS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Period / tag
              <input
                value={periodLabel}
                onChange={(event) => setPeriodLabel(event.target.value)}
                placeholder="2026-04 or today"
              />
            </label>
            <label>
              Vehicle ID
              <input
                value={vehicleId}
                onChange={(event) => setVehicleId(event.target.value)}
                placeholder="Optional vehicle scope"
              />
            </label>
          </div>
          <div className="form-actions">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={pending}
            >
              {pending ? "Creating..." : "Create report job"}
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => void loadJobs()}
            >
              Refresh
            </button>
          </div>
        </form>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">History</p>
              <h3>Recent jobs</h3>
            </div>
            <span className="panel-note">
              {jobs.length} total job(s) in the current listing
            </span>
          </div>
          {loading ? (
            <p>Loading report jobs...</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Status</th>
                  <th>Format</th>
                  <th>Filters</th>
                  <th>Artifact</th>
                </tr>
              </thead>
              <tbody>
                {jobs.length > 0 ? (
                  jobs.map((job) => (
                    <tr key={job.jobId}>
                      <td>
                        <div className="cell-title">{job.jobType}</div>
                        <div className="cell-subcopy">{job.jobId}</div>
                        <div className="cell-subcopy">
                          {new Date(job.createdAt).toLocaleString()}
                        </div>
                      </td>
                      <td>{job.status}</td>
                      <td>{job.format}</td>
                      <td>
                        {Object.keys(job.filters).length > 0 ? (
                          <pre className="filters-preview">
                            {JSON.stringify(job.filters, null, 2)}
                          </pre>
                        ) : (
                          <span className="cell-subcopy">No filters</span>
                        )}
                      </td>
                      <td>
                        {job.artifact ? (
                          <a
                            className="inline-link"
                            href={job.artifact.downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Download {job.artifact.artifactType}
                          </a>
                        ) : (
                          <span className="cell-subcopy">Pending artifact</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>No report jobs yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </section>

        <div className="footer-links">
          <Link className="route-link" href="/revenue">
            <strong>Revenue view</strong> Return to live revenue analysis.
          </Link>
          <Link className="route-link" href="/dashboard">
            <strong>Dashboard</strong> Return to the operations overview.
          </Link>
        </div>

        <style jsx>{`
          .summary-grid,
          .form-grid,
          .form-actions,
          .footer-links {
            display: grid;
            gap: 0.75rem;
          }
          .summary-grid {
            grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
            margin-bottom: 1rem;
          }
          .summary-card,
          .report-form,
          .panel {
            padding: 1rem;
            border-radius: 1rem;
            border: 1px solid #e2e8f0;
            background: #fff;
          }
          .summary-card {
            background: #f8fafc;
          }
          .summary-card strong {
            font-size: 1.4rem;
          }
          .panel-head {
            display: flex;
            justify-content: space-between;
            gap: 1rem;
            align-items: flex-start;
            margin-bottom: 0.75rem;
          }
          .eyebrow,
          .panel-note,
          .cell-subcopy {
            color: #64748b;
          }
          .eyebrow {
            margin: 0 0 0.25rem;
            font-size: 0.75rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          .form-grid {
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          }
          label {
            display: grid;
            gap: 0.35rem;
            color: #0f172a;
          }
          input,
          select {
            width: 100%;
            padding: 0.75rem 0.85rem;
            border-radius: 0.8rem;
            border: 1px solid #cbd5e1;
          }
          .btn {
            padding: 0.65rem 0.85rem;
            border-radius: 0.75rem;
            border: 1px solid #cbd5e1;
            background: white;
            cursor: pointer;
          }
          .btn-primary {
            background: #0f172a;
            color: white;
            border-color: #0f172a;
          }
          .table {
            width: 100%;
            border-collapse: collapse;
          }
          .table th,
          .table td {
            padding: 0.75rem 0.5rem;
            border-bottom: 1px solid #e2e8f0;
            text-align: left;
            vertical-align: top;
          }
          .cell-title {
            font-weight: 600;
            color: #0f172a;
          }
          .filters-preview {
            margin: 0;
            white-space: pre-wrap;
            font-size: 0.78rem;
            color: #334155;
          }
          .inline-link,
          .route-link {
            color: #0f172a;
            text-decoration: none;
          }
          .footer-links {
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            margin-top: 1rem;
          }
        `}</style>
      </AppShellCard>
    </main>
  );
}
