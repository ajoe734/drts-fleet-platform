"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type {
  EmptyReason,
  ReportJobRecord,
  ReportJobStatus,
  ReportJobType,
  ReportOutputFormat,
  ResourceActionDescriptor,
} from "@drts/contracts";
import {
  OPERATIONAL_REPORT_JOB_TYPES,
  REPORT_OUTPUT_FORMATS,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
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

type ReportsManagerProps = {
  jobs: ReportJobRecord[];
  errors: string[];
  emptyReason: EmptyReason | null;
  generatedAt: string;
  refreshTier: "manual";
  availableActions: ResourceActionDescriptor[];
};

type ReportDraft = {
  jobType: ReportJobType;
  format: ReportOutputFormat;
  period: string;
  costCenterCode: string;
  passengerUserId: string;
};

type ReportsFlash = {
  title: string;
  description: string;
  tone: "info" | "warning" | "success";
};

type ReportStatusFilter = ReportJobStatus | "all";

type DisplayReportStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "expired";

type ReportRow = {
  id: string;
  type: string;
  parameters: string;
  status: DisplayReportStatus;
  createdAt: string;
  completedAt: string;
  format: string;
  expiresAt: string;
  artifactLabel: string;
  artifactUrl: string | null;
  rerunDescriptor: ResourceActionDescriptor | null;
  downloadDescriptor: ResourceActionDescriptor | null;
  statusReason: string | null;
};

type CrossAppLink = {
  label: string;
  href: string;
};

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const MANUAL_EMPTY_REASONS: readonly EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const;

const REPORT_TYPE_OPTIONS = OPERATIONAL_REPORT_JOB_TYPES.map(
  (jobType: ReportJobType) => ({
    value: jobType,
    label:
      jobType === "trip_summary"
        ? "行程摘要"
        : jobType === "monthly_trip_report"
          ? "月用量"
          : jobType === "revenue_summary"
            ? "成本中心拆分"
            : jobType === "incident_register"
              ? "事件登錄"
              : "維運總覽",
  }),
);

const STATUS_FILTER_OPTIONS: readonly {
  value: ReportStatusFilter;
  label: string;
}[] = [
  { value: "all", label: "所有狀態" },
  { value: "queued", label: "排隊中" },
  { value: "running", label: "執行中" },
  { value: "completed", label: "完成" },
  { value: "failed", label: "失敗" },
  { value: "expired", label: "已過期" },
] as const;

const pageBodyStyle = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
} as const;

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
} as const;

const actionRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
} as const;

const cardGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.3fr) minmax(320px, 0.9fr)",
  gap: 16,
  alignItems: "start",
} as const;

const filterGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
} as const;

const filterInputStyle = {
  width: "100%",
  minHeight: 36,
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  padding: "8px 10px",
  fontSize: 12.5,
  fontFamily: th.fontFamily,
} as const;

const monoInputStyle = {
  ...filterInputStyle,
  fontFamily: th.monoFamily,
} as const;

const buttonAnchorStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 28,
  padding: "5px 10px",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.surface,
  color: th.text,
  fontSize: 12,
  fontWeight: 500,
  lineHeight: 1,
  textDecoration: "none",
} as const;

const linkListStyle = {
  display: "grid",
  gap: 8,
} as const;

const linkItemStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
} as const;

const emptyStateStyle = {
  padding: 32,
  display: "grid",
  gap: 12,
  textAlign: "center",
} as const;

const emptyReasonRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
} as const;

const emptyReasonLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 8px",
  borderRadius: 999,
  border: `1px solid ${th.border}`,
  color: th.textMuted,
  background: th.surfaceLo,
  fontSize: 11.5,
  textDecoration: "none",
} as const;

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";

  return new Intl.DateTimeFormat("zh-Hant", {
    dateStyle: "short",
    timeStyle: "short",
  })
    .format(parsed)
    .replace(/[\u00a0\u202f\u2009]/g, " ");
}

function normalizePeriod(value: string | undefined) {
  return value && value.trim().length > 0 ? value.trim() : "";
}

function getReportJobPeriod(job: ReportJobRecord) {
  const period = job.filters.period;
  return typeof period === "string" ? period : "—";
}

function getDisplayStatus(job: ReportJobRecord): DisplayReportStatus {
  if (
    job.status === "failed" ||
    job.status === "queued" ||
    job.status === "running"
  ) {
    return job.status;
  }

  const expiresAt = job.artifact?.expiresAt;
  if (job.status === "expired") {
    return "expired";
  }
  if (expiresAt) {
    const parsed = new Date(expiresAt);
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() <= Date.now()) {
      return "expired";
    }
  }
  return "completed";
}

function getStatusTone(status: DisplayReportStatus): CanvasTone {
  if (status === "completed") return "success";
  if (status === "running" || status === "queued") return "info";
  if (status === "expired") return "neutral";
  return "warn";
}

function getStatusLabel(status: DisplayReportStatus) {
  switch (status) {
    case "completed":
      return "完成";
    case "queued":
      return "排隊中";
    case "running":
      return "執行中";
    case "expired":
      return "已過期";
    case "failed":
      return "失敗";
  }
}

function toParameterSummary(job: ReportJobRecord) {
  const entries: string[] = [];
  const period = getReportJobPeriod(job);
  if (period !== "—") {
    entries.push(`期別 ${period}`);
  }

  const costCenterCode =
    typeof job.filters.costCenterCode === "string"
      ? job.filters.costCenterCode
      : null;
  if (costCenterCode) {
    entries.push(`成本中心 ${costCenterCode}`);
  }

  const passengerUserId =
    typeof job.filters.passengerUserId === "string"
      ? job.filters.passengerUserId
      : null;
  if (passengerUserId) {
    entries.push(`乘客 ${passengerUserId}`);
  }

  const tenantId =
    typeof job.filters.tenantId === "string" ? job.filters.tenantId : null;
  if (tenantId) {
    entries.push(`租戶 ${tenantId}`);
  }

  return entries.length > 0 ? entries.join(" · ") : "預設租戶範圍";
}

function findAction(
  availableActions: ResourceActionDescriptor[],
  action: string,
): ResourceActionDescriptor | null {
  return availableActions.find((item) => item.action === action) ?? null;
}

function getEmptyStateTone(reason: EmptyReason | null): CanvasTone {
  switch (reason) {
    case "fetch_failed":
    case "external_unavailable":
      return "warn";
    case "permission_denied":
      return "danger";
    case "filtered_empty":
      return "neutral";
    case "not_provisioned":
      return "accent";
    case "no_data":
    default:
      return "info";
  }
}

function getEmptyStateCopy(reason: EmptyReason | null) {
  switch (reason) {
    case "not_provisioned":
      return {
        title: "此租戶尚未開通報表能力",
        description:
          "路由可以開啟，但後端尚未為此租戶開通報表能力。請透過跨應用治理連結確認權益、檔案簽章與報表就緒狀態。",
      };
    case "fetch_failed":
      return {
        title: "無法載入報表工作",
        description:
          "頁面框架可用，但報表工作清單讀取失敗。待相依服務恢復後，請重新整理一次。",
      };
    case "permission_denied":
      return {
        title: "目前身分無法操作租戶報表",
        description:
          "報表仍保留在導覽中，但目前身分沒有列出或建立此租戶報表工作的權限。",
      };
    case "external_unavailable":
      return {
        title: "報表相依服務暫時不可用",
        description:
          "後端報表服務目前降級。請等待相依服務恢復後，再手動刷新工作清單。",
      };
    case "filtered_empty":
      return {
        title: "目前篩選沒有符合的工作",
        description:
          "此租戶有報表歷史，但目前類型、狀態或期別篩選沒有命中。清除篩選即可查看完整佇列。",
      };
    case "no_data":
    default:
      return {
        title: "尚未建立任何報表工作",
        description:
          "你可以從此頁建立第一個租戶報表工作。後端會負責工作生命週期，並在檔案完成後提供短效簽名下載網址。",
      };
  }
}

function resolveAppOrigin(targetApp: "ops-console" | "platform-admin") {
  const envCandidates =
    targetApp === "platform-admin"
      ? [
          process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN,
          process.env.PLATFORM_ADMIN_ORIGIN,
          process.env.DEV_PLATFORM_ADMIN_ORIGIN,
          process.env.STAGING_PLATFORM_ADMIN_ORIGIN,
          process.env.PROD_PLATFORM_ADMIN_ORIGIN,
        ]
      : [
          process.env.NEXT_PUBLIC_OPS_CONSOLE_ORIGIN,
          process.env.OPS_CONSOLE_ORIGIN,
          process.env.DEV_OPS_CONSOLE_ORIGIN,
          process.env.STAGING_OPS_CONSOLE_ORIGIN,
          process.env.PROD_OPS_CONSOLE_ORIGIN,
        ];
  const resolved = envCandidates.find(
    (candidate) => typeof candidate === "string" && candidate.trim().length > 0,
  );

  if (resolved) {
    return resolved.replace(/\/$/, "");
  }

  return targetApp === "platform-admin"
    ? "http://localhost:3002"
    : "http://localhost:3003";
}

function buildCrossAppHref(
  targetApp: "ops-console" | "platform-admin",
  route: string,
) {
  return `${resolveAppOrigin(targetApp)}${route.startsWith("/") ? route : `/${route}`}`;
}

function ActionButton({
  descriptor,
  label,
  icon,
  onClick,
  variant = "secondary",
  size = "sm",
}: {
  descriptor: ResourceActionDescriptor | null;
  label: string;
  icon?: "plus" | "arrow" | "ext";
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  size?: "xs" | "sm" | "md";
}) {
  if (!descriptor) {
    return null;
  }

  return (
    <CanvasBtn
      theme={th}
      variant={variant}
      size={size}
      disabled={!descriptor.enabled}
      {...(icon ? { icon } : {})}
      {...(!descriptor.enabled
        ? { style: { cursor: "not-allowed" as const } }
        : {})}
      {...(descriptor.enabled && onClick ? { onClick } : {})}
    >
      {label}
    </CanvasBtn>
  );
}

export function ReportsManager({
  jobs,
  errors,
  emptyReason,
  generatedAt,
  refreshTier,
  availableActions,
}: ReportsManagerProps) {
  const router = useRouter();
  const client = getTenantClient();
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<ReportsFlash | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReportStatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState("");
  const [draft, setDraft] = useState<ReportDraft>({
    jobType: "monthly_trip_report",
    format: "xlsx",
    period: "2026-05",
    costCenterCode: "",
    passengerUserId: "",
  });

  const createAction = findAction(availableActions, "create_report_job");
  const refreshAction = findAction(availableActions, "refresh_report_jobs");
  const opsReportingAction = findAction(availableActions, "open_ops_reporting");
  const platformAuditAction = findAction(
    availableActions,
    "open_platform_audit",
  );
  const normalizedPeriodFilter = normalizePeriod(periodFilter);

  const rows: ReportRow[] = jobs.map((job) => {
    const displayStatus = getDisplayStatus(job);
    const downloadDisabledReasonCode =
      displayStatus === "running" || displayStatus === "queued"
        ? "still_running"
        : displayStatus === "expired"
          ? "artifact_expired"
          : displayStatus === "failed"
            ? "job_failed"
            : null;

    return {
      id: job.jobId,
      type: job.jobType,
      parameters: toParameterSummary(job),
      status: displayStatus,
      createdAt: formatDateTime(job.createdAt),
      completedAt:
        displayStatus === "queued" || displayStatus === "running"
          ? "—"
          : formatDateTime(job.updatedAt),
      format: job.format,
      expiresAt: formatDateTime(job.artifact?.expiresAt),
      artifactLabel:
        displayStatus === "completed"
          ? "已簽名檔案"
          : displayStatus === "expired"
            ? "檔案已過期"
            : "尚未就緒",
      artifactUrl:
        displayStatus === "completed"
          ? (job.artifact?.downloadUrl ?? null)
          : null,
      rerunDescriptor:
        displayStatus === "failed"
          ? {
              action: "rerun_failed_job",
              enabled: true,
              riskLevel: "medium",
            }
          : null,
      downloadDescriptor: {
        action: "download_artifact",
        enabled:
          displayStatus === "completed" && Boolean(job.artifact?.downloadUrl),
        riskLevel: "low",
        ...(downloadDisabledReasonCode
          ? { disabledReasonCode: downloadDisabledReasonCode }
          : {}),
      },
      statusReason:
        displayStatus === "failed"
          ? "後端紀錄此工作失敗，可用相同參數重新執行。"
          : displayStatus === "expired"
            ? "簽名網址已過期，請建立新工作產生新的檔案。"
            : null,
    };
  });

  const filteredRows = rows.filter((row) => {
    if (statusFilter !== "all" && row.status !== statusFilter) {
      return false;
    }
    if (typeFilter !== "all" && row.type !== typeFilter) {
      return false;
    }
    if (
      normalizedPeriodFilter &&
      !row.parameters
        .toLowerCase()
        .includes(normalizedPeriodFilter.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const effectiveEmptyReason =
    emptyReason ??
    (rows.length > 0 && filteredRows.length === 0 ? "filtered_empty" : null);
  const emptyStateCopy = getEmptyStateCopy(effectiveEmptyReason);

  const opsReportingLink: CrossAppLink = {
    label: "開啟 ops-console 報表以追溯申報／營收",
    href: buildCrossAppHref("ops-console", "/reports"),
  };
  const platformAuditLink: CrossAppLink = {
    label: "開啟 platform-admin audit 以治理產出檔案",
    href: buildCrossAppHref("platform-admin", "/audit?module=reporting-filing"),
  };
  const crossAppLinks: CrossAppLink[] = [opsReportingLink, platformAuditLink];

  const totalJobs = rows.length;
  const activeJobs = rows.filter(
    (row) => row.status === "queued" || row.status === "running",
  ).length;
  const readyJobs = rows.filter((row) => row.status === "completed").length;
  const failedJobs = rows.filter((row) => row.status === "failed").length;
  const expiredJobs = rows.filter((row) => row.status === "expired").length;

  function setDraftField<K extends keyof ReportDraft>(
    field: K,
    value: ReportDraft[K],
  ) {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function runTransition(work: () => Promise<void>) {
    startTransition(async () => {
      try {
        await work();
      } catch (error) {
        setFlash({
          title: "報表操作失敗",
          description:
            error instanceof Error ? error.message : "未知報表錯誤。",
          tone: "warning",
        });
      }
    });
  }

  function handleRefresh() {
    runTransition(async () => {
      router.refresh();
      setFlash({
        title: "已送出報表清單刷新",
        description:
          "此路由屬於 T6 手動更新；頁面會重新載入最新的報表作業快照。",
        tone: "info",
      });
    });
  }

  function handleCreateJob() {
    if (!createAction?.enabled) {
      return;
    }

    runTransition(async () => {
      const filters: Record<string, string> = {};
      const period = normalizePeriod(draft.period);
      const costCenterCode = normalizePeriod(draft.costCenterCode);
      const passengerUserId = normalizePeriod(draft.passengerUserId);

      if (period) filters.period = period;
      if (costCenterCode) filters.costCenterCode = costCenterCode;
      if (passengerUserId) filters.passengerUserId = passengerUserId;

      const result = await client.createTenantReportJob({
        jobType: draft.jobType,
        format: draft.format,
        filters,
      });

      setFlash({
        title: "報表工作已排入佇列",
        description: `工作 ${result.jobId} 已受理。請刷新或等待後端產生簽名檔案。`,
        tone: "success",
      });
      router.refresh();
    });
  }

  function handleRerun(jobId: string) {
    const job = jobs.find((item) => item.jobId === jobId);
    if (!job) {
      return;
    }

    if (!window.confirm(`要用相同參數重跑報表工作 ${job.jobId} 嗎？`)) {
      return;
    }

    runTransition(async () => {
      const result = await client.createTenantReportJob({
        jobType: job.jobType,
        format: job.format,
        filters: job.filters,
      });

      setFlash({
        title: "失敗報表已重新排入佇列",
        description: `替代工作 ${result.jobId} 已用原本類型與範圍受理。`,
        tone: "success",
      });
      router.refresh();
    });
  }

  function handleDownload(url: string | null) {
    if (!url) {
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }

  const columns: CanvasTableColumn<ReportRow>[] = [
    { h: "工作", k: "id", w: 180, mono: true },
    { h: "類型", k: "type", w: 170, mono: true },
    { h: "參數", k: "parameters", w: 220, mono: true },
    {
      h: "狀態",
      w: 118,
      r: (row) => (
        <CanvasPill theme={th} tone={getStatusTone(row.status)} dot>
          {getStatusLabel(row.status)}
        </CanvasPill>
      ),
    },
    { h: "建立", k: "createdAt", w: 150, mono: true },
    { h: "完成", k: "completedAt", w: 150, mono: true },
    { h: "格式", k: "format", w: 82, mono: true },
    { h: "到期", k: "expiresAt", w: 150, mono: true },
    {
      h: "檔案",
      w: 150,
      r: (row) => (
        <div style={{ display: "grid", gap: 4 }}>
          <span style={{ color: th.text, fontSize: 12 }}>
            {row.artifactLabel}
          </span>
          {row.statusReason ? (
            <span style={{ color: th.textMuted, fontSize: 11.5 }}>
              {row.statusReason}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      h: "操作",
      w: 180,
      r: (row) => (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <ActionButton
            descriptor={row.downloadDescriptor}
            label="下載"
            icon="ext"
            size="xs"
            onClick={() => handleDownload(row.artifactUrl)}
          />
          <ActionButton
            descriptor={row.rerunDescriptor}
            label="重跑"
            icon="arrow"
            size="xs"
            onClick={() => handleRerun(row.id)}
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="報表"
        subtitle="月用量 · 成本中心拆分 · SLA 摘要 · 短效簽名檔案"
        actions={
          <div style={actionRowStyle}>
            <ActionButton
              descriptor={refreshAction}
              label="重新整理"
              icon="arrow"
              onClick={handleRefresh}
            />
            <ActionButton
              descriptor={createAction}
              label="建立工作"
              icon="plus"
              variant="primary"
              onClick={handleCreateJob}
            />
          </div>
        }
      />

      <div style={pageBodyStyle}>
        {flash ? (
          <CanvasBanner
            theme={th}
            tone={
              flash.tone === "warning"
                ? "warn"
                : flash.tone === "success"
                  ? "success"
                  : "info"
            }
            title={flash.title}
            body={flash.description}
          />
        ) : null}

        {errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            title="報表資料無法完整載入"
            body="路由仍可使用，但一個或多個報表讀取來源失敗。"
            actions={
              <div style={{ color: th.text, fontSize: 11.5 }}>
                {errors.length} 個問題
              </div>
            }
          />
        ) : null}

        <CanvasBanner
          theme={th}
          tone="info"
          title="更新層級 T6：手動"
          body={`此路由不自動輪詢。快照載入於 ${formatDateTime(generatedAt)}，更新層級維持 ${refreshTier}。`}
        />

        <CanvasBanner
          theme={th}
          tone="accent"
          title="跨應用報表追溯保持明確"
          body="租戶報表可銜接營運報表或平台治理；依 Q-X03，跨應用深連結會在新分頁開啟。"
          actions={
            <>
              {opsReportingAction ? (
                <a
                  href={opsReportingLink.href}
                  target="_blank"
                  rel="noreferrer"
                  style={buttonAnchorStyle}
                >
                  開啟 Ops 報表
                </a>
              ) : null}
              {platformAuditAction ? (
                <a
                  href={platformAuditLink.href}
                  target="_blank"
                  rel="noreferrer"
                  style={buttonAnchorStyle}
                >
                  開啟平台 audit
                </a>
              ) : null}
              <Link href="/audit" style={buttonAnchorStyle}>
                租戶 audit
              </Link>
            </>
          }
        />

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="工作"
            value={String(totalJobs)}
            sub="報表工作歷史"
          />
          <CanvasKPI
            theme={th}
            label="排隊／執行中"
            value={String(activeJobs)}
            sub="後端正在產出檔案"
          />
          <CanvasKPI
            theme={th}
            label="就緒"
            value={String(readyJobs)}
            sub="簽名下載仍有效"
          />
          <CanvasKPI
            theme={th}
            label="失敗／過期"
            value={`${failedJobs} / ${expiredJobs}`}
            sub="需要重跑或重新產檔"
          />
        </div>

        <div style={cardGridStyle}>
          <CanvasCard
            theme={th}
            title="報表佇列"
            subtitle="類型、狀態、期別、檔案 TTL 與手動重試都以契約為依據。"
            padding={16}
          >
            <div style={filterGridStyle}>
              <CanvasField theme={th} label="類型篩選">
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                  style={filterInputStyle}
                >
                  <option value="all">所有類型</option>
                  {REPORT_TYPE_OPTIONS.map(
                    (option: (typeof REPORT_TYPE_OPTIONS)[number]) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ),
                  )}
                </select>
              </CanvasField>

              <CanvasField theme={th} label="狀態篩選">
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as ReportStatusFilter)
                  }
                  style={filterInputStyle}
                >
                  {STATUS_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </CanvasField>

              <CanvasField
                theme={th}
                label="期別篩選"
                hint="對應工作參數中內嵌的期別。"
              >
                <input
                  value={periodFilter}
                  onChange={(event) => setPeriodFilter(event.target.value)}
                  placeholder="2026-05"
                  style={monoInputStyle}
                />
              </CanvasField>
            </div>

            <div style={{ ...actionRowStyle, marginBottom: 14 }}>
              <CanvasBtn
                theme={th}
                size="xs"
                variant="ghost"
                onClick={() => {
                  setTypeFilter("all");
                  setStatusFilter("all");
                  setPeriodFilter("");
                }}
              >
                清除篩選
              </CanvasBtn>
            </div>

            {effectiveEmptyReason ? (
              <div style={emptyStateStyle}>
                <CanvasPill
                  theme={th}
                  tone={getEmptyStateTone(effectiveEmptyReason)}
                >
                  {effectiveEmptyReason}
                </CanvasPill>
                <div>
                  <div
                    style={{ color: th.text, fontWeight: 600, marginBottom: 6 }}
                  >
                    {emptyStateCopy.title}
                  </div>
                  <div style={{ color: th.textMuted, fontSize: 12.5 }}>
                    {emptyStateCopy.description}
                  </div>
                </div>
                <div style={actionRowStyle}>
                  {effectiveEmptyReason === "filtered_empty" ? (
                    <CanvasBtn
                      theme={th}
                      size="sm"
                      onClick={() => {
                        setTypeFilter("all");
                        setStatusFilter("all");
                        setPeriodFilter("");
                      }}
                    >
                      清除篩選
                    </CanvasBtn>
                  ) : (
                    <ActionButton
                      descriptor={createAction}
                      label="建立工作"
                      icon="plus"
                      variant="primary"
                      onClick={handleCreateJob}
                    />
                  )}
                  <ActionButton
                    descriptor={refreshAction}
                    label="重新整理"
                    icon="arrow"
                    onClick={handleRefresh}
                  />
                </div>
              </div>
            ) : (
              <CanvasTable<ReportRow>
                theme={th}
                columns={columns}
                rows={filteredRows}
              />
            )}
          </CanvasCard>

          <div style={{ display: "grid", gap: 16 }}>
            <CanvasCard
              theme={th}
              title="建立報表工作"
              subtitle="類型、期別與範圍參數直接送入後端佇列。"
              padding={16}
            >
              <CanvasField theme={th} label="工作類型" required>
                <select
                  value={draft.jobType}
                  onChange={(event) =>
                    setDraftField(
                      "jobType",
                      event.target.value as ReportJobType,
                    )
                  }
                  style={filterInputStyle}
                >
                  {REPORT_TYPE_OPTIONS.map(
                    (option: (typeof REPORT_TYPE_OPTIONS)[number]) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ),
                  )}
                </select>
              </CanvasField>

              <CanvasField theme={th} label="格式" required>
                <select
                  value={draft.format}
                  onChange={(event) =>
                    setDraftField(
                      "format",
                      event.target.value as ReportOutputFormat,
                    )
                  }
                  style={filterInputStyle}
                >
                  {REPORT_OUTPUT_FORMATS.map((format: ReportOutputFormat) => (
                    <option key={format} value={format}>
                      {format}
                    </option>
                  ))}
                </select>
              </CanvasField>

              <CanvasField
                theme={th}
                label="期別"
                hint="月報通常使用 YYYY-MM。"
              >
                <input
                  value={draft.period}
                  onChange={(event) =>
                    setDraftField("period", event.target.value)
                  }
                  placeholder="2026-05"
                  style={monoInputStyle}
                />
              </CanvasField>

              <CanvasField
                theme={th}
                label="成本中心"
                hint="選填的範圍細化，例如 CC-FIN-001。"
              >
                <input
                  value={draft.costCenterCode}
                  onChange={(event) =>
                    setDraftField("costCenterCode", event.target.value)
                  }
                  placeholder="CC-FIN-001"
                  style={monoInputStyle}
                />
              </CanvasField>

              <CanvasField
                theme={th}
                label="乘客"
                hint="選填的乘客下鑽，用於範圍匯出。"
              >
                <input
                  value={draft.passengerUserId}
                  onChange={(event) =>
                    setDraftField("passengerUserId", event.target.value)
                  }
                  placeholder="usr_passenger_102"
                  style={monoInputStyle}
                />
              </CanvasField>

              <div style={actionRowStyle}>
                <ActionButton
                  descriptor={createAction}
                  label={pending ? "送出中..." : "排入報表佇列"}
                  icon="plus"
                  variant="primary"
                  onClick={handleCreateJob}
                />
                <ActionButton
                  descriptor={refreshAction}
                  label="重新整理清單"
                  icon="arrow"
                  onClick={handleRefresh}
                />
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="狀態覆蓋"
              subtitle="六種共用 EmptyReason 變體的手動 QA 捷徑。"
              padding={16}
            >
              <div style={emptyReasonRowStyle}>
                <Link href="/reports" style={emptyReasonLinkStyle}>
                  即時資料
                </Link>
                {MANUAL_EMPTY_REASONS.map((reason) => (
                  <Link
                    key={reason}
                    href={`/reports?emptyReason=${reason}`}
                    style={emptyReasonLinkStyle}
                  >
                    {reason}
                  </Link>
                ))}
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="跨應用深層連結"
              subtitle="報表可導向檔案下載、租戶 audit 或外部營運後續。"
              padding={16}
            >
              <div style={linkListStyle}>
                {crossAppLinks.map((link) => (
                  <div key={link.label} style={linkItemStyle}>
                    <span style={{ color: th.text, fontSize: 12.5 }}>
                      {link.label}
                    </span>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      style={buttonAnchorStyle}
                    >
                      開啟
                    </a>
                  </div>
                ))}
                <div style={linkItemStyle}>
                  <span style={{ color: th.text, fontSize: 12.5 }}>
                    查看租戶端報表操作的 audit 收據
                  </span>
                  <Link href="/audit" style={buttonAnchorStyle}>
                    開啟
                  </Link>
                </div>
              </div>
            </CanvasCard>
          </div>
        </div>
      </div>
    </div>
  );
}
