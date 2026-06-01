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

const queueHeroStyle: CSSProperties = {
  padding: 18,
  borderRadius: 18,
  border: `1px solid ${th.border}`,
  background:
    "linear-gradient(135deg, rgba(12, 31, 43, 0.96), rgba(7, 18, 29, 0.92))",
  display: "grid",
  gap: 14,
};

const queueHeroTopStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  flexWrap: "wrap",
};

const queueHeroMetaStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const queueHeroTextStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const contentGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.6fr) minmax(320px, 0.95fr)",
  gap: 16,
  alignItems: "start",
};

const sidebarStackStyle: CSSProperties = {
  display: "grid",
  gap: 16,
};

const cardSectionStyle: CSSProperties = {
  display: "grid",
  gap: 14,
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr)) auto",
  gap: 10,
  alignItems: "end",
};

const fieldGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const helperRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const queueTableWrapStyle: CSSProperties = {
  borderRadius: 18,
  overflow: "hidden",
  border: `1px solid ${th.border}`,
};

const emptyStateStyle: CSSProperties = {
  padding: 20,
  borderRadius: 18,
  border: `1px dashed ${th.border}`,
  background:
    "linear-gradient(180deg, rgba(7, 18, 29, 0.95), rgba(6, 11, 19, 0.98))",
  display: "grid",
  gap: 14,
};

const footerNoteStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
};

const stateGridStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const badgeListStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const mutedTextStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
};

const subtleTextStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 12.5,
  lineHeight: 1.5,
};

const monoPrimaryStyle: CSSProperties = {
  color: th.accent,
  fontWeight: 600,
  fontFamily: th.monoFamily,
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
  kind: ReactNode;
  period: string;
  format: string;
  status: ReactNode;
  expires: string;
  created: ReactNode;
  actions: ReactNode;
};

type EmptyStateModel = {
  title: string;
  description: string;
  detail: string;
  tone: CanvasTone;
  badge: string;
  nextAction?: ResourceActionDescriptor;
};

type DrillLink = {
  href: string;
  label: string;
  note: string;
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
  external_unavailable: "外部不可用",
  filtered_empty: "篩選為空",
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

const dateTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateTimeFormatter.format(parsed);
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
  return `period:${getPeriodLabel(job)} · scope:${getScopeLabel(job)}`;
}

function getPageAvailableActions(
  forcedEmptyReason: string | undefined,
): ResourceActionDescriptor[] {
  return [
    {
      action: "create_report_job",
      enabled: forcedEmptyReason !== "permission_denied",
      ...(forcedEmptyReason === "permission_denied"
        ? { disabledReasonCode: "permission_denied" }
        : {}),
      riskLevel: "low",
    },
    {
      action: "refresh_report_jobs",
      enabled: true,
      riskLevel: "low",
    },
  ];
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
          "租戶端沒有可執行的 report workflow，先確認整合治理、簽章設定與上游彙整管線。",
        detail:
          "對應 EmptyReason.not_provisioned，CTA 只由 nextAction / availableActions 決定。",
        tone: "accent",
        badge: "provisioning required",
        ...(nextAction ? { nextAction } : {}),
      };
    case "fetch_failed":
      return {
        title: "工作佇列讀取失敗",
        description:
          "前端不把錯誤偽裝成空資料。請先手動 refresh，若仍失敗再從稽核與治理頁追查。",
        detail: "對應 EmptyReason.fetch_failed，保留可見錯誤與手動 refresh。",
        tone: "warn",
        badge: "fetch failure",
        ...(nextAction ? { nextAction } : {}),
      };
    case "permission_denied":
      return {
        title: "目前角色沒有報表建立權限",
        description:
          "頁面不從角色碼推論授權；若後端只給讀取，建立與重跑 CTA 仍需以 disabled affordance 顯示。",
        detail:
          "對應 EmptyReason.permission_denied，create CTA disabled with reason.",
        tone: "danger",
        badge: "read-only access",
        ...(nextAction ? { nextAction } : {}),
      };
    case "external_unavailable":
      return {
        title: "外部產出管線暫時不可用",
        description:
          "工作存在，但簽名 artifact 或上游彙整服務暫時不可達，需先確認治理狀態再決定是否重跑。",
        detail:
          "對應 EmptyReason.external_unavailable，freshness 需降級為 degraded。",
        tone: "warn",
        badge: "degraded pipeline",
        ...(nextAction ? { nextAction } : {}),
      };
    case "filtered_empty":
      return {
        title: "目前篩選條件沒有命中任何工作",
        description:
          "可調整 type、status、period，或建立新的報表工作回來觀察 queue 狀態。",
        detail:
          "對應 EmptyReason.filtered_empty，與真正 no_data 視覺與說明分開。",
        tone: "neutral",
        badge: "filter mismatch",
        ...(nextAction ? { nextAction } : {}),
      };
    case "no_data":
    default:
      return {
        title: "租戶尚未建立任何報表工作",
        description:
          "這裡只呈現真實工作佇列。建立第一個月報、收入彙總或 dispatch trace 後，artifact 與到期資訊才會出現。",
        detail:
          "對應 EmptyReason.no_data，表達 queue 尚未被使用，而不是讀取失敗。",
        tone: "info",
        badge: "queue empty",
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
      href: `/integration-governance${selectedType !== "all" ? `?reportType=${encodeURIComponent(selectedType)}` : ""}`,
      label: "整合就緒度",
      note: "檢查 reports adapter、簽章與 freshness 來源",
    },
    {
      href: `/audit${selectedPeriod !== "all" ? `?period=${encodeURIComponent(selectedPeriod)}` : ""}`,
      label: "報表相關稽核",
      note: "追查 create / rerun / artifact 下載動作對應的 audit",
    },
  ];
}

function getFailureDetail(job: ReportJobRecord) {
  if (job.status === "failed") {
    return "pipeline retry required";
  }
  if (job.status === "expired") {
    return "artifact expired";
  }
  if (job.status === "running") {
    return "artifact pending";
  }
  if (job.status === "queued") {
    return "waiting for worker";
  }
  return "artifact ready";
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

  const pageActions = getPageAvailableActions(forcedEmptyReason);
  const createAction = findAction(pageActions, "create_report_job");

  const sortedJobs = [...data.jobs].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  const periodOptions = Array.from(
    new Set(sortedJobs.map((job) => getPeriodLabel(job))),
  );
  const typeOptionList = Array.from(
    new Set([...REPORT_JOB_TYPES, ...sortedJobs.map((job) => job.jobType)]),
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
    ? getEmptyStateModel(emptyReason, createAction)
    : null;
  const refreshMetadata = buildRefreshMetadata(
    sortedJobs,
    emptyReason === "external_unavailable" ? emptyReason : null,
  );

  const activeJobs = sortedJobs.filter(
    (job) => job.status === "queued" || job.status === "running",
  ).length;
  const readyArtifacts = sortedJobs.filter(
    (job) => job.artifact?.downloadUrl && !isArtifactExpired(job),
  ).length;
  const failedJobs = sortedJobs.filter(
    (job) => job.status === "failed" || job.status === "expired",
  ).length;
  const queueHealthLabel =
    refreshMetadata.dataFreshness === "degraded"
      ? "degraded"
      : failedJobs > 0
        ? "attention"
        : "stable";
  const drillLinks = buildDrillLinks(selectedPeriod, selectedType);

  const columns: CanvasTableColumn<ReportRow>[] = [
    {
      h: "JOB",
      w: 120,
      mono: true,
      r: (row) => <span style={monoPrimaryStyle}>{row.id}</span>,
    },
    {
      h: "KIND",
      w: 220,
      r: (row) => row.kind,
    },
    {
      h: "PERIOD",
      w: 110,
      mono: true,
      r: (row) => row.period,
    },
    {
      h: "FORMAT",
      w: 88,
      mono: true,
      r: (row) => row.format,
    },
    {
      h: "STATUS",
      w: 128,
      r: (row) => row.status,
    },
    {
      h: "EXPIRES",
      w: 138,
      mono: true,
      r: (row) => row.expires,
    },
    {
      h: "CREATED",
      w: 170,
      r: (row) => row.created,
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

    return {
      id: job.jobId,
      kind: (
        <div style={stateGridStyle}>
          <span>{formatJobType(job.jobType)}</span>
          <span style={mutedTextStyle}>{formatParametersSummary(job)}</span>
        </div>
      ),
      period: getPeriodLabel(job),
      format: job.format,
      status: (
        <div style={stateGridStyle}>
          <CanvasPill theme={th} tone={formatStatusTone(job.status)} dot>
            {STATUS_LABELS[job.status]}
          </CanvasPill>
          <span style={mutedTextStyle}>{getFailureDetail(job)}</span>
        </div>
      ),
      expires: job.artifact?.expiresAt
        ? formatDateTime(job.artifact.expiresAt)
        : job.status === "completed"
          ? "signed URL pending"
          : "—",
      created: (
        <div style={stateGridStyle}>
          <span style={{ ...mutedTextStyle, color: th.text }}>
            {formatDateTime(job.createdAt)}
          </span>
          <span style={mutedTextStyle}>
            done{" "}
            {job.status === "completed" ||
            job.status === "failed" ||
            job.status === "expired"
              ? formatDateTime(job.updatedAt)
              : "—"}
          </span>
        </div>
      ),
      actions: (
        <div style={stateGridStyle}>
          <div style={actionRowStyle}>
            {downloadAction?.enabled && job.artifact?.downloadUrl ? (
              <a
                href={job.artifact.downloadUrl}
                rel="noreferrer"
                style={ghostLinkStyle}
                target="_blank"
              >
                下載
              </a>
            ) : (
              <button
                disabled
                style={{
                  ...secondaryButtonStyle,
                  opacity: 0.45,
                  cursor: "not-allowed",
                }}
                title={getActionDisabledTitle(downloadAction)}
                type="button"
              >
                下載
              </button>
            )}

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
          </div>

          <Link
            href={`/audit?resourceId=${encodeURIComponent(job.jobId)}`}
            style={{
              ...mutedTextStyle,
              textDecoration: "none",
              color: th.accent,
            }}
          >
            view audit trail
          </Link>
          <span style={mutedTextStyle}>
            {expired
              ? "artifact expired"
              : job.artifact?.downloadUrl
                ? "signed artifact available"
                : "artifact pending"}
          </span>
        </div>
      ),
    };
  });

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="報表 · Reports"
        subtitle="月用量 · cost center 拆分 · SLA 摘要 · 簽名 artifact 短效"
        actions={
          createAction?.enabled ? (
            <a href="#create-report-job" style={ghostLinkStyle}>
              建立工作
            </a>
          ) : (
            <button
              disabled
              style={{
                ...secondaryButtonStyle,
                opacity: 0.45,
                cursor: "not-allowed",
              }}
              title={getActionDisabledTitle(createAction)}
              type="button"
            >
              建立工作
            </button>
          )
        }
      />

      <div style={pageBodyStyle}>
        <div style={queueHeroStyle}>
          <div style={queueHeroTopStyle}>
            <div style={queueHeroTextStyle}>
              <strong>Tenant report queue</strong>
              <span style={subtleTextStyle}>
                §5.17 / T6 manual. Filter by type, status, period; create jobs,
                download signed artifacts, and rerun failed exports.
              </span>
            </div>

            <div style={queueHeroMetaStyle}>
              <CanvasPill theme={th} tone="neutral">
                refresh {MANUAL_REFRESH_TIER}
              </CanvasPill>
              <CanvasPill
                theme={th}
                tone={
                  refreshMetadata.dataFreshness === "degraded"
                    ? "warn"
                    : refreshMetadata.dataFreshness === "stale"
                      ? "neutral"
                      : "success"
                }
                dot
              >
                {refreshMetadata.dataFreshness}
              </CanvasPill>
              <CanvasPill
                theme={th}
                tone={queueHealthLabel === "stable" ? "success" : "warn"}
              >
                queue {queueHealthLabel}
              </CanvasPill>
            </div>
          </div>

          <div style={actionRowStyle}>
            <form action={refreshReportsAction}>
              <input name="returnTo" type="hidden" value={returnTo} />
              <button style={secondaryButtonStyle} type="submit">
                手動 refresh
              </button>
            </form>
            <Link href="/integration-governance" style={ghostLinkStyle}>
              檢查整合治理
            </Link>
            <span style={mutedTextStyle}>
              generated {formatDateTime(refreshMetadata.generatedAt)} · stale
              after {Math.round(refreshMetadata.staleAfterMs / 60000)}m
            </span>
          </div>
        </div>

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
            sub="failed + expired"
          />
        </div>

        <div style={contentGridStyle}>
          <div style={sidebarStackStyle}>
            <CanvasCard
              theme={th}
              title="工作佇列"
              subtitle="JOB / KIND / PERIOD / FORMAT / STATUS / EXPIRES / CREATED / ACTIONS"
            >
              <form action="/reports" style={cardSectionStyle}>
                <div style={filterGridStyle}>
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
                  <div style={helperRowStyle}>
                    <CanvasPill theme={th} tone={emptyState.tone}>
                      {emptyState.badge}
                    </CanvasPill>
                    <CanvasPill theme={th} tone="neutral">
                      {EMPTY_REASON_LABELS[emptyReason!]}
                    </CanvasPill>
                  </div>

                  <div style={stateGridStyle}>
                    <strong>{emptyState.title}</strong>
                    <p style={{ ...subtleTextStyle, margin: 0 }}>
                      {emptyState.description}
                    </p>
                    <span style={mutedTextStyle}>{emptyState.detail}</span>
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
                    <Link href="/audit" style={ghostLinkStyle}>
                      稽核
                    </Link>
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
                </div>
              ) : (
                <div style={queueTableWrapStyle}>
                  <CanvasTable<ReportRow>
                    columns={columns}
                    rows={rows}
                    theme={th}
                  />
                </div>
              )}

              <div style={footerNoteStyle}>
                <span>
                  `done at` 以 terminal `updatedAt` 呈現，直到 contract 提供獨立
                  `completedAt`。
                </span>
                <span>
                  目前畫面 CTA 由 page / row action descriptors
                  驅動，不從角色碼硬判。
                </span>
              </div>
            </CanvasCard>
          </div>

          <div style={sidebarStackStyle}>
            <CanvasCard
              theme={th}
              title="建立報表工作"
              subtitle="type / period / scope params 對應 §5.17 create report job"
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
                    hint="Regulatory bundle jobs usually take longer."
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
                    disabled={!createAction?.enabled}
                    style={{
                      ...primaryButtonStyle,
                      opacity: createAction?.enabled ? 1 : 0.45,
                      cursor: createAction?.enabled ? "pointer" : "not-allowed",
                    }}
                    title={getActionDisabledTitle(createAction)}
                    type="submit"
                  >
                    建立工作
                  </button>
                  <span style={mutedTextStyle}>
                    availableActions drive the CTA; receipt returns via flash
                    and audit link.
                  </span>
                </div>
              </form>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="Drill-in"
              subtitle="依 packet §5.17 由 reports 連到治理與稽核面追查問題"
            >
              <div style={stateGridStyle}>
                {drillLinks.map((link) => (
                  <div key={link.label} style={stateGridStyle}>
                    <Link href={link.href} style={ghostLinkStyle}>
                      {link.label}
                    </Link>
                    <span style={mutedTextStyle}>{link.note}</span>
                  </div>
                ))}
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="狀態對照"
              subtitle="6 個 EmptyReason、queue status、artifact expiry 在同屏可驗證"
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
                <p style={{ ...mutedTextStyle, margin: 0 }}>
                  `filtered_empty` 由頁面篩選觸發；其餘空態可用 `?emptyReason=`
                  驗證 distinct rendering。expired artifact 由 signed URL 過期與
                  disabled download affordance 呈現。
                </p>
              </div>
            </CanvasCard>
          </div>
        </div>
      </div>
    </div>
  );
}
