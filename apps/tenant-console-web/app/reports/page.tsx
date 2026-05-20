import type { CSSProperties } from "react";
import type { ReportJobRecord } from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
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
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const emptyStateStyle: CSSProperties = {
  padding: 24,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
};

const jobIdStyle: CSSProperties = {
  color: th.accent,
  fontWeight: 600,
  fontFamily: th.monoFamily,
};

const createdAtFormatter = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const expiresFormatter = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatCreated(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return createdAtFormatter.format(parsed).replace("T", " ");
}

function formatExpires(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return expiresFormatter.format(parsed);
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
      return "warn";
    case "expired":
    default:
      return "neutral";
  }
}

function getStatusLabel(status: ReportJobRecord["status"]) {
  return status === "completed" ? "ready" : status;
}

function extractPeriod(job: ReportJobRecord) {
  const filters = job.filters ?? {};
  const explicit = filters["period"];
  if (typeof explicit === "string" && explicit.length > 0) {
    return explicit;
  }

  const year = filters["period_year"];
  const month = filters["period_month"];
  if (typeof year === "number" && typeof month === "number") {
    return `${year}-${String(month).padStart(2, "0")}`;
  }
  if (typeof year === "string" && typeof month === "string") {
    return `${year}-${month.padStart(2, "0")}`;
  }

  const start = filters["period_start"];
  if (typeof start === "string" && start.length >= 7) {
    return start.slice(0, 7);
  }

  return "—";
}

function compareJobs(left: ReportJobRecord, right: ReportJobRecord) {
  return right.createdAt.localeCompare(left.createdAt);
}

type ReportsPageData = {
  jobs: ReportJobRecord[];
  errors: string[];
};

async function loadReportsData(): Promise<ReportsPageData> {
  const client = getTenantClient();
  try {
    const jobs = (await client.listTenantReportJobs()) as ReportJobRecord[];
    return { jobs: [...jobs].sort(compareJobs), errors: [] };
  } catch (error) {
    return {
      jobs: [],
      errors: [error instanceof Error ? error.message : "未知的報表錯誤"],
    };
  }
}

type ReportRow = {
  jobId: string;
  jobType: string;
  period: string;
  format: ReportJobRecord["format"];
  status: ReportJobRecord["status"];
  expires: string;
  created: string;
};

export default async function ReportsPage() {
  const { jobs, errors } = await loadReportsData();

  const rows: ReportRow[] = jobs.map((job) => ({
    jobId: job.jobId,
    jobType: job.jobType,
    period: extractPeriod(job),
    format: job.format,
    status: job.status,
    expires:
      job.status === "completed" && job.artifact?.expiresAt
        ? formatExpires(job.artifact.expiresAt)
        : "—",
    created: formatCreated(job.createdAt),
  }));

  const columns: CanvasTableColumn<ReportRow>[] = [
    {
      h: "JOB",
      w: 130,
      mono: true,
      r: (row) => <span style={jobIdStyle}>{row.jobId}</span>,
    },
    { h: "KIND", k: "jobType", w: 200, mono: true },
    { h: "PERIOD", k: "period", w: 110, mono: true },
    { h: "FORMAT", k: "format", w: 90, mono: true },
    {
      h: "STATUS",
      w: 110,
      r: (row) => (
        <CanvasPill theme={th} tone={getStatusTone(row.status)} dot>
          {getStatusLabel(row.status)}
        </CanvasPill>
      ),
    },
    { h: "EXPIRES", k: "expires", w: 130, mono: true },
    { h: "CREATED", k: "created", mono: true },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="報表"
        subtitle="月用量 · cost center 拆分 · SLA 摘要"
        actions={
          <CanvasBtn theme={th} variant="primary" icon="plus" size="sm">
            建立工作
          </CanvasBtn>
        }
      />

      <div style={pageBodyStyle}>
        {errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="報表清單暫時無法載入"
            body={errors.join(" · ")}
          />
        ) : null}

        <CanvasCard theme={th} padding={0}>
          {rows.length > 0 ? (
            <CanvasTable<ReportRow> theme={th} columns={columns} rows={rows} />
          ) : (
            <div style={emptyStateStyle}>目前沒有任何報表工作。</div>
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
