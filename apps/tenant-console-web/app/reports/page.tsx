import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { ReportJobDetailRecord, ReportJobRecord } from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const cellStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  minWidth: 0,
};

const monoPrimaryStyle: CSSProperties = {
  color: th.accent,
  fontFamily: th.monoFamily,
  fontWeight: 600,
};

const subcopyStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  overflowWrap: "anywhere",
};

const detailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const detailBlockStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const detailLabelStyle: CSSProperties = {
  color: th.textDim,
  fontSize: 11,
  letterSpacing: 0.3,
  textTransform: "uppercase",
};

const detailValueStyle: CSSProperties = {
  color: th.text,
  fontSize: 12.5,
  lineHeight: 1.5,
  overflowWrap: "anywhere",
};

const listStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  color: th.textMuted,
  fontSize: 12.5,
  lineHeight: 1.6,
};

const linkStyle: CSSProperties = {
  color: th.accent,
  textDecoration: "none",
  fontWeight: 600,
};

const emptyStateStyle: CSSProperties = {
  padding: 24,
  color: th.textMuted,
  textAlign: "center",
  fontSize: 12.5,
};

type QueryValue = string | string[] | undefined;

type ReportsData = {
  jobs: ReportJobRecord[];
  detail: ReportJobDetailRecord | null;
  errors: string[];
};

type ReportRow = ReportJobRecord &
  Record<string, unknown> & {
    detailLink: ReactNode;
    artifactLink: ReactNode;
  };

function getQueryValue(value: QueryValue) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(parsed);
}

function formatFilters(filters: Record<string, unknown>) {
  const entries = Object.entries(filters);
  if (entries.length === 0) return "default scope";
  return entries
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
}

function getStatusTone(status: ReportJobRecord["status"]): CanvasTone {
  switch (status) {
    case "completed":
      return "success";
    case "running":
      return "info";
    case "failed":
      return "danger";
    case "queued":
    default:
      return "neutral";
  }
}

async function loadReportsData(jobId: string): Promise<ReportsData> {
  const client = getTenantClient();
  const errors: string[] = [];

  let jobs: ReportJobRecord[] = [];
  try {
    jobs = await client.listTenantReportJobs();
  } catch (error) {
    errors.push(
      error instanceof Error ? error.message : "Unknown tenant report error.",
    );
  }

  let detail: ReportJobDetailRecord | null = null;
  const selectedJobId = jobId || jobs[0]?.jobId || "";

  if (selectedJobId) {
    try {
      detail = await client.getTenantReportJob(selectedJobId);
    } catch (error) {
      errors.push(
        error instanceof Error
          ? error.message
          : "Unable to load tenant report detail.",
      );
    }
  }

  return { jobs, detail, errors };
}

function buildRows(jobs: ReportJobRecord[]): ReportRow[] {
  return jobs.map((job) => ({
    ...job,
    detailLink: (
      <Link
        href={`/reports?jobId=${encodeURIComponent(job.jobId)}`}
        style={linkStyle}
      >
        Open detail
      </Link>
    ),
    artifactLink: job.artifact ? (
      <a
        href={job.artifact.downloadUrl}
        rel="noreferrer"
        style={linkStyle}
        target="_blank"
      >
        Download
      </a>
    ) : (
      <span style={subcopyStyle}>pending</span>
    ),
  }));
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, QueryValue>>;
}) {
  const resolvedSearchParams = await searchParams;
  const selectedJobId = getQueryValue(resolvedSearchParams.jobId).trim();
  const data = await loadReportsData(selectedJobId);
  const jobs = [...data.jobs].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  const detail =
    data.detail && jobs.some((job) => job.jobId === data.detail?.jobId)
      ? data.detail
      : null;
  const rows = buildRows(jobs);
  const completedJobs = jobs.filter((job) => job.status === "completed").length;
  const failedJobs = jobs.filter((job) => job.status === "failed").length;

  const columns: CanvasTableColumn<ReportRow>[] = [
    {
      h: "JOB",
      w: 220,
      r: (row) => (
        <div style={cellStackStyle}>
          <span style={monoPrimaryStyle}>{row.jobId}</span>
          <span style={subcopyStyle}>{row.jobType}</span>
        </div>
      ),
    },
    {
      h: "STATUS",
      w: 110,
      r: (row) => (
        <CanvasPill theme={th} tone={getStatusTone(row.status)} dot>
          {row.status}
        </CanvasPill>
      ),
    },
    {
      h: "FORMAT",
      w: 90,
      mono: true,
      r: (row) => row.format,
    },
    {
      h: "FILTERS",
      w: 220,
      r: (row) => (
        <span style={subcopyStyle}>{formatFilters(row.filters)}</span>
      ),
    },
    {
      h: "CREATED",
      w: 170,
      mono: true,
      r: (row) => formatDateTime(row.createdAt),
    },
    {
      h: "UPDATED",
      w: 170,
      mono: true,
      r: (row) => formatDateTime(row.updatedAt),
    },
    {
      h: "ARTIFACT",
      w: 120,
      r: (row) => row.artifactLink,
    },
    {
      h: "DETAIL",
      w: 120,
      r: (row) => row.detailLink,
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="報表"
        subtitle="tenant reports · manual refresh tier · signed artifacts"
        actions={
          <>
            <Link href="/reports" style={{ textDecoration: "none" }}>
              <CanvasBtn theme={th} icon="refresh" size="sm">
                Refresh
              </CanvasBtn>
            </Link>
            <CanvasBtn theme={th} icon="plus" size="sm" disabled>
              Create job
            </CanvasBtn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {data.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="報表資料尚未完整"
            body={data.errors.join(" / ")}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="總 job 數"
            value={String(jobs.length)}
            delta="T6 manual"
            deltaTone="neutral"
          />
          <CanvasKPI
            theme={th}
            label="已完成"
            value={String(completedJobs)}
            delta="signed artifact"
            deltaTone="up"
          />
          <CanvasKPI
            theme={th}
            label="失敗"
            value={String(failedJobs)}
            delta={failedJobs > 0 ? "needs rerun" : "none"}
            deltaTone={failedJobs > 0 ? "down" : "neutral"}
          />
        </div>

        <CanvasCard theme={th} title="報表工作佇列">
          {rows.length > 0 ? (
            <CanvasTable<ReportRow> theme={th} columns={columns} rows={rows} />
          ) : (
            <div style={emptyStateStyle}>
              尚無 report job。當 audit trail 指向 `report_job` 時，將會回到這個
              tenant-owned surface。
            </div>
          )}
        </CanvasCard>

        <div id="job-detail">
          <CanvasCard
            theme={th}
            title="工作明細"
            subtitle={
              detail
                ? `${detail.jobType} · ${detail.jobId}`
                : "從上方選一筆 job 以檢視 artifact 與 evidence 資訊"
            }
          >
            {detail ? (
              <>
                <div style={detailGridStyle}>
                  <div style={detailBlockStyle}>
                    <span style={detailLabelStyle}>Status</span>
                    <span style={detailValueStyle}>{detail.status}</span>
                  </div>
                  <div style={detailBlockStyle}>
                    <span style={detailLabelStyle}>Format</span>
                    <span style={detailValueStyle}>{detail.format}</span>
                  </div>
                  <div style={detailBlockStyle}>
                    <span style={detailLabelStyle}>Created</span>
                    <span style={detailValueStyle}>
                      {formatDateTime(detail.createdAt)}
                    </span>
                  </div>
                  <div style={detailBlockStyle}>
                    <span style={detailLabelStyle}>Updated</span>
                    <span style={detailValueStyle}>
                      {formatDateTime(detail.updatedAt)}
                    </span>
                  </div>
                </div>

                <div style={{ ...detailBlockStyle, marginTop: 16 }}>
                  <span style={detailLabelStyle}>Filters</span>
                  <span style={detailValueStyle}>
                    {formatFilters(detail.filters)}
                  </span>
                </div>

                <div style={{ ...detailBlockStyle, marginTop: 16 }}>
                  <span style={detailLabelStyle}>Artifact</span>
                  {detail.artifact ? (
                    <a
                      href={detail.artifact.downloadUrl}
                      rel="noreferrer"
                      style={linkStyle}
                      target="_blank"
                    >
                      Download signed artifact
                    </a>
                  ) : (
                    <span style={detailValueStyle}>Artifact 尚未就緒。</span>
                  )}
                </div>

                {detail.rows && detail.rows.length > 0 ? (
                  <div style={{ ...detailBlockStyle, marginTop: 16 }}>
                    <span style={detailLabelStyle}>Evidence rows</span>
                    <ul style={listStyle}>
                      {detail.rows.slice(0, 5).map((row) => (
                        <li key={row.orderId}>
                          {row.orderNo} · call {row.callId ?? "—"} · recording{" "}
                          {row.recordingId ?? "missing"}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : (
              <div style={emptyStateStyle}>
                選取一筆 report job 以檢視明細。
              </div>
            )}
          </CanvasCard>
        </div>
      </div>
    </div>
  );
}
