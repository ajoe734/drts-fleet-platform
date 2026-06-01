import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  EmptyReason,
  RefreshTier,
  ReportJobRecord,
  ReportJobStatus,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  REPORT_JOB_STATUSES,
  REPORT_JOB_TYPES,
  REPORT_OUTPUT_FORMATS,
  REGULATORY_REPORT_JOB_TYPES,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasField,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import {
  createReportJobAction,
  refreshReportsAction,
  rerunReportJobAction,
} from "./actions";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const MANUAL_REFRESH_TIER: RefreshTier = "manual";
const EMPTY_REASONS: EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
];
const REGULATORY_JOB_TYPE_SET = new Set<string>(REGULATORY_REPORT_JOB_TYPES);

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

const contentGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.5fr) minmax(320px, 0.95fr)",
  gap: 16,
  alignItems: "start",
};

const sidebarStackStyle: CSSProperties = {
  display: "grid",
  gap: 16,
};

const fieldGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 12,
};

const cardSectionStyle: CSSProperties = {
  display: "grid",
  gap: 14,
};

const filterRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr)) auto",
  gap: 12,
  alignItems: "end",
};

const helperRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const mutedTextStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
};

const monoPrimaryStyle: CSSProperties = {
  color: th.accent,
  fontWeight: 600,
  fontFamily: th.monoFamily,
};

const badgeListStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const stateGridStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const emptyStateStyle: CSSProperties = {
  padding: 22,
  borderRadius: 16,
  border: `1px dashed ${th.border}`,
  background: "rgba(8, 17, 28, 0.7)",
  display: "grid",
  gap: 12,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const footerNoteStyle: CSSProperties = {
  ...mutedTextStyle,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const nativeInputStyle: CSSProperties = {
  width: "100%",
  borderRadius: 10,
  border: `1px solid ${th.border}`,
  background: "rgba(8, 17, 28, 0.88)",
  color: th.text,
  padding: "10px 12px",
  fontSize: 12.5,
  outline: "none",
};

const nativeMonoInputStyle: CSSProperties = {
  ...nativeInputStyle,
  fontFamily: th.monoFamily,
};

const primaryButtonStyle: CSSProperties = {
  borderRadius: 999,
  border: `1px solid ${th.accent}`,
  background: th.accent,
  color: "#041117",
  padding: "10px 16px",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  borderRadius: 999,
  border: `1px solid ${th.border}`,
  background: "transparent",
  color: th.text,
  padding: "10px 14px",
  fontSize: 12.5,
  cursor: "pointer",
};

const ghostLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  border: `1px solid ${th.border}`,
  color: th.text,
  padding: "10px 14px",
  fontSize: 12.5,
  textDecoration: "none",
};

type SearchParamValue = string | string[] | undefined;

type ReportsPageProps = {
  searchParams: Promise<Record<string, SearchParamValue>>;
};

type ReportsData = {
  jobs: ReportJobRecord[];
  errors: string[];
};

type ReportRow = {
  id: string;
  jobType: string;
  scope: string;
  period: string;
  status: ReportJobStatus;
  statusTone: CanvasTone;
  format: string;
  createdAt: string;
  completedAt: string;
  artifact: ReactNode;
  actions: ReactNode;
};

type EmptyStateModel = {
  title: string;
  description: string;
  nextAction?: ResourceActionDescriptor;
};

type DrillLink = {
  href: string;
  label: string;
};

const REPORT_TYPE_LABELS: Record<string, string> = {
  trip_summary: "Trip summary",
  monthly_trip_report: "Monthly trip",
  revenue_summary: "Revenue summary",
  incident_register: "Incident register",
  maintenance_overview: "Maintenance overview",
  vehicle_roster: "Vehicle roster",
  driver_roster: "Driver roster",
  contract_roster: "Contract roster",
  insurance_roster: "Insurance roster",
  vehicle_monthly_delta: "Vehicle monthly delta",
  six_month_statistics: "Six-month statistics",
  fare_version_history: "Fare version history",
  complaint_case_detail: "Complaint detail",
  dispatch_recording_index: "Dispatch trace",
};

const STATUS_LABELS: Record<ReportJobStatus, string> = {
  queued: "queued",
  running: "running",
  completed: "done",
  failed: "failed",
  expired: "expired",
};

const EMPTY_REASON_LABELS: Record<EmptyReason, string> = {
  no_data: "無資料",
  not_provisioned: "尚未啟用",
  fetch_failed: "讀取失敗",
  permission_denied: "權限不足",
  external_unavailable: "外部服務不可用",
  filtered_empty: "篩選後為空",
  driver_not_eligible: "不可接單",
};

function getSearchParam(params: Record<string, SearchParamValue>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function buildReturnTo(params: Record<string, SearchParamValue>) {
  const search = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(params)) {
    if (key === "flash" || key === "flashMessage" || key === "flashJobId") {
      continue;
    }
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (value) {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return query ? `/reports?${query}` : "/reports";
}

function toErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unknown tenant reports error.";
}

async function loadReportsData(): Promise<ReportsData> {
  const client = getTenantClient();

  try {
    return {
      jobs: (await client.listTenantReportJobs()) as ReportJobRecord[],
      errors: [],
    };
  } catch (error) {
    return {
      jobs: [],
      errors: [toErrorMessage(error)],
    };
  }
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-Hant", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function formatCreatedMonth(value: string | null | undefined) {
  if (!value) return "未指定";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "未指定";
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatJobType(jobType: string) {
  return REPORT_TYPE_LABELS[jobType] ?? jobType;
}

function formatStatusTone(status: ReportJobStatus): CanvasTone {
  switch (status) {
    case "completed":
      return "success";
    case "running":
      return "accent";
    case "failed":
      return "danger";
    case "expired":
      return "warn";
    case "queued":
    default:
      return "info";
  }
}

function isArtifactExpired(job: ReportJobRecord) {
  if (!job.artifact?.expiresAt) return false;
  const expiresAt = new Date(job.artifact.expiresAt).getTime();
  return !Number.isNaN(expiresAt) && expiresAt <= Date.now();
}

function getPeriodLabel(job: ReportJobRecord) {
  const rawPeriod = job.filters?.period;
  return typeof rawPeriod === "string" && rawPeriod.trim()
    ? rawPeriod.trim()
    : formatCreatedMonth(job.createdAt);
}

function getScopeLabel(job: ReportJobRecord) {
  const costCenterCode = job.filters?.costCenterCode;
  if (typeof costCenterCode === "string" && costCenterCode.trim()) {
    return `cost_center:${costCenterCode.trim()}`;
  }

  const passengerId = job.filters?.passengerId;
  if (typeof passengerId === "string" && passengerId.trim()) {
    return `passenger:${passengerId.trim()}`;
  }

  return "tenant:all";
}

function formatParametersSummary(job: ReportJobRecord) {
  const pieces = [
    `period:${getPeriodLabel(job)}`,
    `scope:${getScopeLabel(job)}`,
  ];

  return pieces.join(" · ");
}

function getJobAvailableActions(
  job: ReportJobRecord,
): ResourceActionDescriptor[] {
  return [
    {
      action: "download_artifact",
      enabled: Boolean(job.artifact?.downloadUrl) && !isArtifactExpired(job),
      disabledReasonCode: job.artifact
        ? "artifact_expired"
        : "artifact_pending",
      riskLevel: "low",
    },
    {
      action: "rerun_failed_job",
      enabled: job.status === "failed" || job.status === "expired",
      disabledReasonCode:
        job.status === "queued" || job.status === "running"
          ? "job_in_progress"
          : "rerun_not_required",
      riskLevel: "medium",
    },
  ];
}

function findAction(actions: ResourceActionDescriptor[], actionName: string) {
  return actions.find((action) => action.action === actionName);
}

function buildRefreshMetadata(
  jobs: ReportJobRecord[],
  forcedEmptyReason: EmptyReason | null,
): UiRefreshMetadata {
  const generatedAt = jobs[0]?.updatedAt ?? new Date().toISOString();
  const staleAfterMs = 15 * 60 * 1000;

  return {
    generatedAt,
    staleAfterMs,
    source: "live",
    dataFreshness:
      forcedEmptyReason === "external_unavailable"
        ? "degraded"
        : Date.now() - new Date(generatedAt).getTime() > staleAfterMs
          ? "stale"
          : "fresh",
  };
}

function resolveEmptyReason(
  forcedReason: string | undefined,
  errors: string[],
  allJobs: ReportJobRecord[],
  visibleJobs: ReportJobRecord[],
): EmptyReason | null {
  if (forcedReason && EMPTY_REASONS.includes(forcedReason as EmptyReason)) {
    return forcedReason as EmptyReason;
  }
  if (visibleJobs.length > 0) {
    return null;
  }
  if (errors.length > 0) {
    return "fetch_failed";
  }
  if (allJobs.length === 0) {
    return "no_data";
  }
  return "filtered_empty";
}

function getEmptyStateModel(
  reason: EmptyReason,
  nextAction?: ResourceActionDescriptor,
): EmptyStateModel {
  switch (reason) {
    case "not_provisioned":
      return {
        title: "報表服務尚未佈建",
        description:
          "目前租戶尚未完成報表工作流啟用，先回到整合就緒度確認 API 金鑰、Webhook 與 SLA 基線。",
        ...(nextAction ? { nextAction } : {}),
      };
    case "fetch_failed":
      return {
        title: "工作佇列讀取失敗",
        description:
          "前端沒有假裝成空資料。請先手動 refresh；若仍失敗，再從稽核或整合治理追查上游問題。",
        ...(nextAction ? { nextAction } : {}),
      };
    case "permission_denied":
      return {
        title: "目前角色只有唯讀或無報表權限",
        description:
          "依 packet §3.5，頁面不會自行推論角色。若後端不允許建立或重跑，就只保留可閱讀資訊。",
        ...(nextAction ? { nextAction } : {}),
      };
    case "external_unavailable":
      return {
        title: "外部產出管線暫時不可用",
        description:
          "工作可見，但 artifact 簽章或上游彙整服務不可達。請先檢查治理面板，再決定是否重跑。",
        ...(nextAction ? { nextAction } : {}),
      };
    case "filtered_empty":
      return {
        title: "目前篩選條件沒有命中任何工作",
        description:
          "調整 type、status、period 後再試一次，或直接建立新的報表工作。",
        ...(nextAction ? { nextAction } : {}),
      };
    case "no_data":
    default:
      return {
        title: "租戶尚未建立任何報表工作",
        description:
          "這裡只呈現真實工作佇列。建立第一個月報、收入彙總或 dispatch trace 後，artifact 與到期資訊才會出現。",
        ...(nextAction ? { nextAction } : {}),
      };
  }
}

function getActionDisabledTitle(action?: ResourceActionDescriptor) {
  if (!action || action.enabled) return undefined;
  return action.disabledReasonCode ?? "action_disabled";
}

function getScenarioHref(
  params: Record<string, SearchParamValue>,
  reason: EmptyReason | "live",
) {
  const next = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(params)) {
    if (key === "flash" || key === "flashMessage" || key === "flashJobId") {
      continue;
    }
    if (key === "emptyReason") {
      continue;
    }
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (value) {
      next.set(key, value);
    }
  }
  if (reason !== "live") {
    next.set("emptyReason", reason);
  }
  const query = next.toString();
  return query ? `/reports?${query}` : "/reports";
}

function buildDrillLinks(
  selectedPeriod: string,
  selectedType: string,
): DrillLink[] {
  return [
    {
      href: `/integration-governance${selectedType ? `?reportType=${encodeURIComponent(selectedType)}` : ""}`,
      label: "整合就緒度",
    },
    {
      href: `/audit${selectedPeriod ? `?period=${encodeURIComponent(selectedPeriod)}` : ""}`,
      label: "報表相關稽核",
    },
  ];
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const resolvedSearchParams = await searchParams;
  const data = await loadReportsData();
  const returnTo = buildReturnTo(resolvedSearchParams);

  const selectedType = getSearchParam(resolvedSearchParams, "jobType") ?? "all";
  const selectedStatus =
    getSearchParam(resolvedSearchParams, "status") ?? "all";
  const selectedPeriod =
    getSearchParam(resolvedSearchParams, "period") ?? "all";
  const forcedEmptyReason = getSearchParam(resolvedSearchParams, "emptyReason");
  const flash = getSearchParam(resolvedSearchParams, "flash");
  const flashMessage = getSearchParam(resolvedSearchParams, "flashMessage");
  const flashJobId = getSearchParam(resolvedSearchParams, "flashJobId");

  const pageActions: ResourceActionDescriptor[] = [
    {
      action: "create_report_job",
      enabled: forcedEmptyReason !== "permission_denied",
      ...(forcedEmptyReason === "permission_denied"
        ? { disabledReasonCode: "permission_denied" }
        : {}),
      riskLevel: "medium",
    },
    {
      action: "refresh_report_jobs",
      enabled: true,
      riskLevel: "low",
    },
  ];

  const sortedJobs = [...data.jobs].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  const periodOptions = Array.from(
    new Set(sortedJobs.map((job) => getPeriodLabel(job))),
  );
  const typeOptions = REPORT_JOB_TYPES.filter((jobType) =>
    sortedJobs.some((job) => job.jobType === jobType),
  );
  const typeOptionList = Array.from(
    new Set([...REPORT_JOB_TYPES, ...typeOptions]),
  );
  const filteredJobs = sortedJobs.filter((job) => {
    if (selectedType !== "all" && job.jobType !== selectedType) return false;
    if (selectedStatus !== "all" && job.status !== selectedStatus) return false;
    if (selectedPeriod !== "all" && getPeriodLabel(job) !== selectedPeriod) {
      return false;
    }
    return true;
  });

  const visibleJobs =
    forcedEmptyReason &&
    EMPTY_REASONS.includes(forcedEmptyReason as EmptyReason)
      ? []
      : filteredJobs;
  const emptyReason = resolveEmptyReason(
    forcedEmptyReason,
    data.errors,
    sortedJobs,
    visibleJobs,
  );
  const emptyState = emptyReason
    ? getEmptyStateModel(
        emptyReason,
        findAction(pageActions, "create_report_job"),
      )
    : null;
  const refreshMetadata = buildRefreshMetadata(
    sortedJobs,
    emptyReason === "external_unavailable" ? emptyReason : null,
  );

  const activeJobs = sortedJobs.filter(
    (job) => job.status === "queued" || job.status === "running",
  ).length;
  const completedJobs = sortedJobs.filter(
    (job) => job.status === "completed",
  ).length;
  const failedJobs = sortedJobs.filter(
    (job) => job.status === "failed" || job.status === "expired",
  ).length;
  const readyArtifacts = sortedJobs.filter(
    (job) => job.artifact?.downloadUrl && !isArtifactExpired(job),
  ).length;
  const drillLinks = buildDrillLinks(selectedPeriod, selectedType);

  const columns: CanvasTableColumn<ReportRow>[] = [
    {
      h: "JOB",
      w: 180,
      mono: true,
      r: (row) => <span style={monoPrimaryStyle}>{row.id}</span>,
    },
    {
      h: "TYPE",
      w: 180,
      r: (row) => row.jobType,
    },
    {
      h: "PARAMS",
      w: 216,
      mono: true,
      r: (row) => (
        <div>
          <div>{row.scope}</div>
          <div style={mutedTextStyle}>{row.period}</div>
        </div>
      ),
    },
    {
      h: "STATE",
      w: 112,
      r: (row) => (
        <CanvasPill theme={th} tone={row.statusTone} dot>
          {STATUS_LABELS[row.status]}
        </CanvasPill>
      ),
    },
    {
      h: "FORMAT",
      w: 72,
      mono: true,
      r: (row) => row.format,
    },
    {
      h: "CREATED",
      w: 148,
      mono: true,
      r: (row) => row.createdAt,
    },
    {
      h: "DONE AT",
      w: 148,
      mono: true,
      r: (row) => row.completedAt,
    },
    {
      h: "ARTIFACT",
      w: 160,
      r: (row) => row.artifact,
    },
    {
      h: "ACTIONS",
      w: 188,
      r: (row) => row.actions,
    },
  ];

  const rows: ReportRow[] = visibleJobs.map((job) => {
    const availableActions = getJobAvailableActions(job);
    const downloadAction = findAction(availableActions, "download_artifact");
    const rerunAction = findAction(availableActions, "rerun_failed_job");
    const expired = isArtifactExpired(job);
    const artifactNode = job.artifact?.downloadUrl ? (
      <div style={stateGridStyle}>
        {downloadAction?.enabled ? (
          <a
            href={job.artifact.downloadUrl}
            rel="noreferrer"
            style={ghostLinkStyle}
            target="_blank"
          >
            下載檔案
          </a>
        ) : (
          <span style={mutedTextStyle}>
            {expired ? "artifact expired" : "artifact pending"}
          </span>
        )}
        <span style={mutedTextStyle}>
          {job.artifact.expiresAt
            ? `exp ${formatDateTime(job.artifact.expiresAt)}`
            : "signed URL pending"}
        </span>
      </div>
    ) : (
      <span style={mutedTextStyle}>等待產出</span>
    );

    return {
      id: job.jobId,
      jobType: formatJobType(job.jobType),
      scope: getScopeLabel(job),
      period: getPeriodLabel(job),
      status: job.status,
      statusTone: formatStatusTone(job.status),
      format: job.format,
      createdAt: formatDateTime(job.createdAt),
      completedAt:
        job.status === "completed" ||
        job.status === "failed" ||
        job.status === "expired"
          ? formatDateTime(job.updatedAt)
          : "—",
      artifact: artifactNode,
      actions: (
        <div style={actionRowStyle}>
          {rerunAction?.enabled ? (
            <form action={rerunReportJobAction}>
              <input name="returnTo" type="hidden" value={returnTo} />
              <input name="jobType" type="hidden" value={job.jobType} />
              <input name="format" type="hidden" value={job.format} />
              <input
                name="filtersJson"
                type="hidden"
                value={JSON.stringify(job.filters ?? {})}
              />
              <button style={secondaryButtonStyle} type="submit">
                重跑
              </button>
            </form>
          ) : (
            <button
              disabled
              style={{
                ...secondaryButtonStyle,
                opacity: 0.45,
                cursor: "not-allowed",
              }}
              title={getActionDisabledTitle(rerunAction)}
              type="button"
            >
              重跑
            </button>
          )}

          <Link
            href={`/audit?resourceId=${encodeURIComponent(job.jobId)}`}
            style={ghostLinkStyle}
          >
            稽核
          </Link>
        </div>
      ),
    };
  });

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="報表"
        subtitle="T6 manual · report jobs · artifact downloads · rerun failed exports"
        actions={
          <div style={actionRowStyle}>
            <form action={refreshReportsAction}>
              <input name="returnTo" type="hidden" value={returnTo} />
              <button style={secondaryButtonStyle} type="submit">
                手動 refresh
              </button>
            </form>
            <a href="#create-report-job" style={ghostLinkStyle}>
              建立工作
            </a>
          </div>
        }
      />

      <div style={pageBodyStyle}>
        <CanvasBanner
          body={`生成時間 ${formatDateTime(refreshMetadata.generatedAt)} · freshness ${refreshMetadata.dataFreshness} · stale after ${Math.round(refreshMetadata.staleAfterMs / 60000)}m`}
          icon={refreshMetadata.dataFreshness === "degraded" ? "warn" : "clock"}
          theme={th}
          title={`Refresh tier: ${MANUAL_REFRESH_TIER}`}
          tone={refreshMetadata.dataFreshness === "degraded" ? "warn" : "info"}
        />

        {flash ? (
          <CanvasBanner
            body={
              flash === "error"
                ? (flashMessage ?? "Unable to complete report action.")
                : flash === "refreshed"
                  ? "已重新抓取報表工作清單。"
                  : `工作已送出至報表佇列${flashJobId ? ` · ${flashJobId}` : ""}`
            }
            icon={flash === "error" ? "warn" : "check"}
            theme={th}
            title={
              flash === "error"
                ? "報表動作失敗"
                : flash === "rerun"
                  ? "已送出重跑"
                  : flash === "refreshed"
                    ? "列表已更新"
                    : "已建立報表工作"
            }
            tone={flash === "error" ? "warn" : "success"}
          />
        ) : null}

        {data.errors.length > 0 ? (
          <CanvasBanner
            body={data.errors.join(" · ")}
            icon="warn"
            theme={th}
            title="部分報表資料無法載入"
            tone="warn"
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="Jobs"
            value={String(sortedJobs.length)}
            sub="tenant queue"
          />
          <CanvasKPI
            theme={th}
            label="Active"
            value={String(activeJobs)}
            sub="queued + running"
          />
          <CanvasKPI
            theme={th}
            label="Artifacts"
            value={String(readyArtifacts)}
            sub="download ready"
          />
          <CanvasKPI
            theme={th}
            label="Failures"
            value={String(failedJobs)}
            sub={
              completedJobs > 0 ? `${completedJobs} done` : "rerun when needed"
            }
          />
        </div>

        <div style={contentGridStyle}>
          <div style={sidebarStackStyle}>
            <CanvasCard
              theme={th}
              title="工作佇列"
              subtitle="依 type / status / period 篩選，狀態以 queued / running / done / failed 呈現"
            >
              <form action="/reports" style={cardSectionStyle}>
                <div style={filterRowStyle}>
                  <CanvasField theme={th} label="Type">
                    <select
                      defaultValue={selectedType}
                      name="jobType"
                      style={nativeInputStyle}
                    >
                      <option value="all">all</option>
                      {typeOptionList.map((jobType) => (
                        <option key={jobType} value={jobType}>
                          {formatJobType(jobType)}
                        </option>
                      ))}
                    </select>
                  </CanvasField>

                  <CanvasField theme={th} label="Status">
                    <select
                      defaultValue={selectedStatus}
                      name="status"
                      style={nativeInputStyle}
                    >
                      <option value="all">all</option>
                      {REPORT_JOB_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </CanvasField>

                  <CanvasField theme={th} label="Period">
                    <select
                      defaultValue={selectedPeriod}
                      name="period"
                      style={nativeInputStyle}
                    >
                      <option value="all">all</option>
                      {periodOptions.map((period) => (
                        <option key={period} value={period}>
                          {period}
                        </option>
                      ))}
                    </select>
                  </CanvasField>

                  <button style={secondaryButtonStyle} type="submit">
                    套用篩選
                  </button>
                </div>
              </form>

              {emptyState ? (
                <div style={emptyStateStyle}>
                  <div>
                    <strong>{emptyState.title}</strong>
                    <p style={{ ...mutedTextStyle, marginTop: 6 }}>
                      {emptyState.description}
                    </p>
                  </div>

                  <div style={badgeListStyle}>
                    <Link
                      href={getScenarioHref(resolvedSearchParams, "live")}
                      style={ghostLinkStyle}
                    >
                      Live
                    </Link>
                    {EMPTY_REASONS.map((reason) => (
                      <Link
                        href={getScenarioHref(resolvedSearchParams, reason)}
                        key={reason}
                        style={{
                          ...ghostLinkStyle,
                          borderColor:
                            emptyReason === reason ? th.accent : th.border,
                          color: emptyReason === reason ? th.accent : th.text,
                        }}
                      >
                        {EMPTY_REASON_LABELS[reason]}
                      </Link>
                    ))}
                  </div>

                  <div style={actionRowStyle}>
                    {emptyState.nextAction?.enabled ? (
                      <a href="#create-report-job" style={ghostLinkStyle}>
                        建立報表工作
                      </a>
                    ) : (
                      <button
                        disabled
                        style={{
                          ...secondaryButtonStyle,
                          opacity: 0.45,
                          cursor: "not-allowed",
                        }}
                        title={getActionDisabledTitle(emptyState.nextAction)}
                        type="button"
                      >
                        建立報表工作
                      </button>
                    )}
                    <Link href="/integration-governance" style={ghostLinkStyle}>
                      整合就緒度
                    </Link>
                  </div>
                </div>
              ) : (
                <CanvasCard theme={th} padding={0}>
                  <CanvasTable<ReportRow>
                    columns={columns}
                    rows={rows}
                    theme={th}
                  />
                </CanvasCard>
              )}

              <div style={footerNoteStyle}>
                <span>
                  CompletedAt contract 未獨立提供時，以 terminal `updatedAt`
                  呈現。
                </span>
                <span>
                  參數摘要:{" "}
                  {visibleJobs[0]
                    ? formatParametersSummary(visibleJobs[0])
                    : "n/a"}
                </span>
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="建立報表工作"
              subtitle="type / period / scope 由 command form 決定；建立後回到同頁觀察 queued → running → done"
            >
              <form
                action={createReportJobAction}
                id="create-report-job"
                style={cardSectionStyle}
              >
                <input name="returnTo" type="hidden" value={returnTo} />

                <div style={fieldGridStyle}>
                  <CanvasField theme={th} label="Report type" required>
                    <select
                      defaultValue={
                        selectedType !== "all"
                          ? selectedType
                          : "monthly_trip_report"
                      }
                      name="jobType"
                      style={nativeInputStyle}
                    >
                      {REPORT_JOB_TYPES.map((jobType) => (
                        <option key={jobType} value={jobType}>
                          {formatJobType(jobType)}
                        </option>
                      ))}
                    </select>
                  </CanvasField>

                  <CanvasField theme={th} label="Output format" required>
                    <select
                      defaultValue="xlsx"
                      name="format"
                      style={nativeInputStyle}
                    >
                      {REPORT_OUTPUT_FORMATS.map((format) => (
                        <option key={format} value={format}>
                          {format}
                        </option>
                      ))}
                    </select>
                  </CanvasField>

                  <CanvasField
                    theme={th}
                    hint="YYYY-MM or quarter label"
                    label="Period"
                  >
                    <input
                      defaultValue={
                        selectedPeriod !== "all" ? selectedPeriod : ""
                      }
                      name="period"
                      placeholder="2026-05"
                      style={nativeMonoInputStyle}
                    />
                  </CanvasField>
                </div>

                <div style={fieldGridStyle}>
                  <CanvasField theme={th} label="Scope">
                    <select
                      defaultValue="all"
                      name="scope"
                      style={nativeInputStyle}
                    >
                      <option value="all">tenant:all</option>
                      <option value="cost_center">cost center</option>
                      <option value="passenger">passenger</option>
                    </select>
                  </CanvasField>

                  <CanvasField
                    theme={th}
                    hint="costCenterCode or passengerId"
                    label="Scope value"
                  >
                    <input
                      name="scopeValue"
                      placeholder="CC-OPS-001 / psg_001"
                      style={nativeMonoInputStyle}
                    />
                  </CanvasField>

                  <CanvasField
                    theme={th}
                    hint={
                      REGULATORY_JOB_TYPE_SET.has(
                        selectedType !== "all"
                          ? selectedType
                          : "monthly_trip_report",
                      )
                        ? "Regulatory bundle: expect longer processing."
                        : "Operational bundle: usually completes faster."
                    }
                    label="Preset family"
                  >
                    <div
                      style={{
                        ...nativeInputStyle,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      {REGULATORY_JOB_TYPE_SET.has(
                        selectedType !== "all"
                          ? selectedType
                          : "monthly_trip_report",
                      )
                        ? "regulatory"
                        : "operational"}
                    </div>
                  </CanvasField>
                </div>

                <div style={actionRowStyle}>
                  <button
                    disabled={
                      !findAction(pageActions, "create_report_job")?.enabled
                    }
                    style={{
                      ...primaryButtonStyle,
                      opacity: findAction(pageActions, "create_report_job")
                        ?.enabled
                        ? 1
                        : 0.45,
                      cursor: findAction(pageActions, "create_report_job")
                        ?.enabled
                        ? "pointer"
                        : "not-allowed",
                    }}
                    title={getActionDisabledTitle(
                      findAction(pageActions, "create_report_job"),
                    )}
                    type="submit"
                  >
                    建立工作
                  </button>
                  <span style={mutedTextStyle}>
                    Medium risk · receipt 會透過 flash 與 audit link 回到本頁。
                  </span>
                </div>
              </form>
            </CanvasCard>
          </div>

          <div style={sidebarStackStyle}>
            <CanvasCard
              theme={th}
              title="Drill-in"
              subtitle="依 packet §5.17 由 reports 連到治理與稽核面追查問題。"
            >
              <div style={stateGridStyle}>
                {drillLinks.map((link) => (
                  <Link
                    href={link.href}
                    key={link.label}
                    style={ghostLinkStyle}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="狀態對照"
              subtitle="6 個 EmptyReason 與 report queue status 在同一屏可確認。"
            >
              <div style={stateGridStyle}>
                <div style={helperRowStyle}>
                  {REPORT_JOB_STATUSES.map((status) => (
                    <CanvasPill
                      key={status}
                      theme={th}
                      tone={formatStatusTone(status)}
                      dot
                    >
                      {STATUS_LABELS[status]}
                    </CanvasPill>
                  ))}
                </div>
                <div style={helperRowStyle}>
                  {EMPTY_REASONS.map((reason) => (
                    <CanvasPill key={reason} theme={th} tone="neutral">
                      {EMPTY_REASON_LABELS[reason]}
                    </CanvasPill>
                  ))}
                </div>
                <p style={mutedTextStyle}>
                  `filtered_empty` 由頁面篩選觸發；其餘空態可由 machine truth 或
                  `?emptyReason=` scenario 驗證 distinct rendering。
                </p>
              </div>
            </CanvasCard>
          </div>
        </div>
      </div>
    </div>
  );
}
