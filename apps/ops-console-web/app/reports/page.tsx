"use client";

import { useSearchParams } from "next/navigation";
import React, { useEffect, useMemo, useState, useTransition } from "react";
import { PageHeader } from "@drts/ui-web";
import type {
  CreateReportJobCommand,
  CrossAppResourceLink,
  EmptyStateEnvelope,
  EmptyReason,
  FilingPackageDetailRecord,
  FilingPackageListRecord,
  FilingPackageType,
  ReportJobDetailRecord,
  ReportJobRecord,
  ReportJobType,
  ReportOutputFormat,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  FILING_PACKAGE_TYPES,
  REGULATORY_REPORT_JOB_TYPES,
  REPORT_JOB_TYPES,
  REPORT_OUTPUT_FORMATS,
} from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { formatOpsCodeLabel } from "@/lib/localized-labels";

type ReportAction = ResourceActionDescriptor & {
  href?: string;
  openMode?: CrossAppResourceLink["openMode"];
  label?: string;
};

type RuntimeReportJob = ReportJobRecord & {
  availableActions?: ReportAction[];
  completedAt?: string | null;
  submittedBy?: string | null;
  parametersSummary?: string | null;
  failureReason?: string | null;
  refreshMetadata?: UiRefreshMetadata;
};

type RuntimeReportJobDetail = ReportJobDetailRecord & {
  availableActions?: ReportAction[];
  completedAt?: string | null;
  submittedBy?: string | null;
  parametersSummary?: string | null;
  failureReason?: string | null;
  refreshMetadata?: UiRefreshMetadata;
};

type RuntimeFilingPackage = FilingPackageListRecord & {
  availableActions?: ReportAction[];
  scopeSummary?: string | null;
  expiresAt?: string | null;
  failureReason?: string | null;
  refreshMetadata?: UiRefreshMetadata;
};

type RuntimeFilingPackageDetail = FilingPackageDetailRecord & {
  availableActions?: ReportAction[];
  scopeSummary?: string | null;
  expiresAt?: string | null;
  failureReason?: string | null;
  refreshMetadata?: UiRefreshMetadata;
};

type ComposerMode = "report" | "package" | null;
type ActiveTab = "jobs" | "packages";
type Selection =
  | { kind: "job"; id: string }
  | { kind: "package"; id: string }
  | null;

type PendingAction =
  | {
      kind: "job";
      action: ReportAction;
      record: RuntimeReportJob | RuntimeReportJobDetail;
    }
  | {
      kind: "package";
      action: ReportAction;
      record: RuntimeFilingPackage | RuntimeFilingPackageDetail;
    };

type EmptyStateDefinition = {
  eyebrow: string;
  title: string;
  body: string;
  accent: string;
  suggestion: string;
};

type RuntimeListResponse<T> = {
  items?: T[];
  emptyState?: EmptyStateEnvelope;
  refreshMetadata?: UiRefreshMetadata;
  availableActions?: ReportAction[];
};

type PageActionKind = "create_report_job" | "generate_filing_package";

type PageActionDescriptor = {
  action: PageActionKind;
  enabled: boolean;
  disabledReasonCode?: string | undefined;
};

type JobPresetMetadata = {
  label: string;
  description: string;
};

const REGULATORY_JOB_TYPE_SET = new Set<ReportJobType>(
  REGULATORY_REPORT_JOB_TYPES,
);

const JOB_PRESET_METADATA: Record<ReportJobType, JobPresetMetadata> = {
  trip_summary: {
    label: "Trip summary",
    description: "Operational trip output for day-to-day service review.",
  },
  monthly_trip_report: {
    label: "Monthly trip report",
    description: "Month-end trip volume and service mix export.",
  },
  revenue_summary: {
    label: "Revenue summary",
    description: "Revenue, average trip, and payout-friendly export.",
  },
  incident_register: {
    label: "Incident register",
    description: "Operational incident summary for ROC review.",
  },
  maintenance_overview: {
    label: "Maintenance overview",
    description: "Vehicle maintenance backlog and completion export.",
  },
  vehicle_roster: {
    label: "Vehicle roster",
    description: "Regulatory vehicle roster with placard/version traceability.",
  },
  driver_roster: {
    label: "Driver roster",
    description: "Driver registry export for compliance submission.",
  },
  contract_roster: {
    label: "Contract roster",
    description: "Partner and dispatch contract filing extract.",
  },
  insurance_roster: {
    label: "Insurance roster",
    description: "Insurance evidence package for regulatory review.",
  },
  vehicle_monthly_delta: {
    label: "Vehicle monthly delta",
    description: "Month-over-month vehicle registry changes for filing.",
  },
  six_month_statistics: {
    label: "Six-month statistics",
    description: "Six-month compliance metrics bundle for regulators.",
  },
  fare_version_history: {
    label: "Fare version history",
    description: "Published fare and public-info version audit export.",
  },
  complaint_case_detail: {
    label: "Complaint case detail",
    description: "Detailed complaint case export for specialist review.",
  },
  dispatch_recording_index: {
    label: "Dispatch trace",
    description: "Dispatch and recording index export for audit follow-up.",
  },
};

const JOB_PRESETS = REPORT_JOB_TYPES.map((value) => ({
  value,
  ...JOB_PRESET_METADATA[value],
  category: REGULATORY_JOB_TYPE_SET.has(value) ? "Regulatory" : "Operational",
}));

function copyText(locale: "en" | "zh", en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function defaultClosedMonth() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const target = new Date(Date.UTC(year, month - 1, 1));
  return `${target.getUTCFullYear()}-${String(
    target.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleString();
}

function formatDateTimeShort(value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function formatRelativeMinutes(value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  const ms = new Date(value).getTime() - Date.now();
  if (Number.isNaN(ms)) {
    return "—";
  }
  const minutes = Math.round(ms / 60000);
  if (minutes <= 0) {
    return "expired";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

function summarizeFilters(filters: Record<string, unknown>) {
  const entries = Object.entries(filters).filter(([, value]) => {
    if (value == null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
  });

  if (entries.length === 0) {
    return "Default scope";
  }

  return entries
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${formatFilterValue(value)}`)
    .join(" · ");
}

function formatFilterValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => formatFilterValue(item)).join(", ");
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => `${key}=${formatFilterValue(nested)}`)
      .join(", ");
  }
  return "—";
}

function expiresSoon(value: string | null | undefined, hours = 12) {
  if (!value) return false;
  const expiresAt = new Date(value).getTime();
  if (Number.isNaN(expiresAt)) return false;
  return expiresAt - Date.now() <= hours * 60 * 60 * 1000;
}

function isExpired(value: string | null | undefined) {
  if (!value) return false;
  const expiresAt = new Date(value).getTime();
  if (Number.isNaN(expiresAt)) return false;
  return expiresAt <= Date.now();
}

function jobCategory(jobType: string) {
  return REGULATORY_JOB_TYPE_SET.has(jobType as ReportJobType)
    ? "Regulatory"
    : "Operational";
}

function normalizeListResponse<T>(
  payload: RuntimeListResponse<T> | T[],
): RuntimeListResponse<T> {
  if (Array.isArray(payload)) {
    return { items: payload };
  }
  return {
    items: payload.items ?? [],
    ...(payload.emptyState ? { emptyState: payload.emptyState } : {}),
    ...(payload.refreshMetadata
      ? { refreshMetadata: payload.refreshMetadata }
      : {}),
    ...(payload.availableActions
      ? { availableActions: payload.availableActions }
      : {}),
  };
}

function readNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readRecordValue(record: Record<string, unknown>, key: string) {
  return readNonEmptyString(record[key]);
}

function getSubmittedByLabel(
  record: Partial<RuntimeReportJob> | Partial<RuntimeReportJobDetail> | null,
) {
  if (!record) {
    return "system";
  }
  const rawRecord = record as Record<string, unknown>;
  const filterRecord =
    rawRecord.filters && typeof rawRecord.filters === "object"
      ? (rawRecord.filters as Record<string, unknown>)
      : null;
  const aliases = [
    record.submittedBy,
    readRecordValue(rawRecord, "submittedByDisplayName"),
    readRecordValue(rawRecord, "submittedByName"),
    readRecordValue(rawRecord, "submittedByUserName"),
    readRecordValue(rawRecord, "submittedByUserId"),
    readRecordValue(rawRecord, "requestedByDisplayName"),
    readRecordValue(rawRecord, "requestedByName"),
    readRecordValue(rawRecord, "requestedByUserName"),
    readRecordValue(rawRecord, "requestedByUserId"),
    readRecordValue(rawRecord, "requestedBy"),
    readRecordValue(rawRecord, "actorDisplayName"),
    readRecordValue(rawRecord, "actorName"),
    readRecordValue(rawRecord, "createdByDisplayName"),
    readRecordValue(rawRecord, "createdBy"),
    filterRecord
      ? readRecordValue(filterRecord, "submittedByDisplayName")
      : null,
    filterRecord ? readRecordValue(filterRecord, "submittedByName") : null,
    filterRecord ? readRecordValue(filterRecord, "submittedByUserName") : null,
    filterRecord ? readRecordValue(filterRecord, "submittedByUserId") : null,
    filterRecord
      ? readRecordValue(filterRecord, "requestedByDisplayName")
      : null,
    filterRecord ? readRecordValue(filterRecord, "requestedByName") : null,
    filterRecord ? readRecordValue(filterRecord, "requestedByUserName") : null,
    filterRecord ? readRecordValue(filterRecord, "requestedByUserId") : null,
    filterRecord ? readRecordValue(filterRecord, "requestedBy") : null,
    filterRecord ? readRecordValue(filterRecord, "actorDisplayName") : null,
    filterRecord ? readRecordValue(filterRecord, "actorName") : null,
    filterRecord ? readRecordValue(filterRecord, "createdByDisplayName") : null,
    filterRecord ? readRecordValue(filterRecord, "createdBy") : null,
  ];

  for (const candidate of aliases) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return "system";
}

function getCompletedAtValue(
  record: Partial<RuntimeReportJob> | Partial<RuntimeReportJobDetail> | null,
) {
  if (!record) {
    return null;
  }
  const aliases = [
    record.completedAt,
    (record as Record<string, unknown>).completedAt,
  ];
  for (const candidate of aliases) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return record.status === "completed" ? (record.updatedAt ?? null) : null;
}

function getPackageScopeSummary(
  filingPackage:
    | Partial<RuntimeFilingPackage>
    | Partial<RuntimeFilingPackageDetail>
    | null,
  locale: "en" | "zh",
) {
  const rawRecord = filingPackage as Record<string, unknown> | null;
  const summary =
    filingPackage?.scopeSummary ??
    readRecordValue(rawRecord ?? {}, "scopeDisplayName") ??
    readRecordValue(rawRecord ?? {}, "scopeLabel") ??
    readRecordValue(rawRecord ?? {}, "periodSummary") ??
    null;
  if (summary && summary.trim().length > 0) {
    return summary;
  }

  const scope =
    rawRecord?.scope && typeof rawRecord.scope === "object"
      ? (rawRecord.scope as Record<string, unknown>)
      : null;
  const period =
    rawRecord?.period && typeof rawRecord.period === "object"
      ? (rawRecord.period as Record<string, unknown>)
      : null;

  const canonicalParts = [
    scope
      ? summarizeFilters(
          Object.fromEntries(
            Object.entries(scope).filter(([, value]) => value != null),
          ),
        )
      : null,
    period
      ? summarizeFilters(
          Object.fromEntries(
            Object.entries(period).filter(([, value]) => value != null),
          ),
        )
      : null,
  ].filter((candidate): candidate is string => !!candidate);

  if (canonicalParts.length > 0) {
    return canonicalParts.join(" · ");
  }

  return copyText(
    locale,
    "Scope not carried by current payload",
    "目前 payload 尚未攜帶 scope",
  );
}

function toSurfaceActionDescriptor(
  action: PageActionKind,
  descriptor?: PageActionDescriptor,
): ReportAction {
  return {
    action,
    enabled: descriptor?.enabled ?? false,
    ...(descriptor?.disabledReasonCode
      ? { disabledReasonCode: descriptor.disabledReasonCode }
      : {}),
    riskLevel: "low",
  };
}

function fallbackJobActions(
  job: RuntimeReportJob | RuntimeReportJobDetail,
): ReportAction[] {
  const actions: ReportAction[] = [];
  if (job.artifact?.downloadUrl) {
    const expired = isExpired(job.artifact.expiresAt);
    actions.push({
      action: "download_artifact",
      enabled: !expired,
      ...(expired ? { disabledReasonCode: "artifact_expired" } : {}),
      riskLevel: "low",
      href: job.artifact.downloadUrl,
      openMode: "new_tab",
    });
  }
  if (job.status === "failed") {
    actions.push({
      action: "rerun_failed_job",
      enabled: true,
      riskLevel: "medium",
    });
  }
  actions.push({
    action: "inspect_detail",
    enabled: true,
    riskLevel: "low",
  });
  return actions;
}

function fallbackPackageActions(
  filingPackage: RuntimeFilingPackage | RuntimeFilingPackageDetail,
): ReportAction[] {
  const actions: ReportAction[] = [];
  if ("downloadMetadata" in filingPackage && filingPackage.downloadMetadata) {
    const zipExpired = isExpired(filingPackage.downloadMetadata.zip.expiresAt);
    const pdfExpired = isExpired(filingPackage.downloadMetadata.pdf.expiresAt);
    actions.push({
      action: "download_zip",
      enabled: !zipExpired,
      ...(zipExpired ? { disabledReasonCode: "artifact_expired" } : {}),
      riskLevel: "low",
      href: filingPackage.downloadMetadata.zip.downloadUrl,
      openMode: "new_tab",
    });
    actions.push({
      action: "download_pdf",
      enabled: !pdfExpired,
      ...(pdfExpired ? { disabledReasonCode: "artifact_expired" } : {}),
      riskLevel: "low",
      href: filingPackage.downloadMetadata.pdf.downloadUrl,
      openMode: "new_tab",
    });
  } else if (filingPackage.artifactZipUrl) {
    actions.push({
      action: "download_zip",
      enabled: true,
      riskLevel: "low",
      href: filingPackage.artifactZipUrl,
      openMode: "new_tab",
    });
  }
  actions.push({
    action: "inspect_detail",
    enabled: true,
    riskLevel: "low",
  });
  return actions;
}

function labelForAction(action: string, locale: "en" | "zh") {
  switch (action) {
    case "create_report_job":
      return copyText(locale, "Create report job", "建立報表工作");
    case "generate_filing_package":
      return copyText(locale, "Generate filing package", "產生申報套件");
    case "download_artifact":
      return copyText(locale, "Download", "下載");
    case "download_zip":
      return copyText(locale, "ZIP", "ZIP");
    case "download_pdf":
      return copyText(locale, "PDF", "PDF");
    case "rerun_failed_job":
      return copyText(locale, "Re-run", "重跑");
    case "inspect_detail":
      return copyText(locale, "Inspect", "檢視");
    default:
      return formatOpsCodeLabel(locale, action);
  }
}

function formatDisabledReason(code: string | undefined, locale: "en" | "zh") {
  if (!code) {
    return copyText(locale, "Action unavailable", "操作不可用");
  }

  switch (code) {
    case "artifact_expired":
      return copyText(
        locale,
        "Signed artifact link expired. Issue a fresh artifact first.",
        "簽名成品連結已到期，請先重新發行成品。",
      );
    default:
      return formatOpsCodeLabel(locale, code);
  }
}

function pillToneForStatus(status: string) {
  switch (status) {
    case "completed":
      return "success";
    case "running":
      return "info";
    case "queued":
      return "pending";
    case "failed":
      return "danger";
    default:
      return "neutral";
  }
}

function getEmptyStateDefinition(
  reason: EmptyReason,
  locale: "en" | "zh",
): EmptyStateDefinition {
  const definitions: Record<EmptyReason, EmptyStateDefinition> = {
    no_data: {
      eyebrow: copyText(locale, "No work yet", "尚無工作"),
      title: copyText(
        locale,
        "Nothing has been run yet",
        "目前尚未執行任何工作",
      ),
      body: copyText(
        locale,
        "No report jobs or filing packages are available for this scope yet.",
        "此範圍尚無報表工作或申報套件。",
      ),
      accent: "#f59e0b",
      suggestion: copyText(
        locale,
        "Kick off a new report or filing package from the composer.",
        "可從上方建立新的報表工作或申報套件。",
      ),
    },
    not_provisioned: {
      eyebrow: copyText(locale, "Provisioning required", "需要先開通"),
      title: copyText(
        locale,
        "Reporting is not provisioned",
        "報表能力尚未開通",
      ),
      body: copyText(
        locale,
        "This tenant or role does not have report generation provisioned yet.",
        "此租戶或角色尚未開通報表產生能力。",
      ),
      accent: "#f97316",
      suggestion: copyText(
        locale,
        "Use the cross-app setup workflow before returning here.",
        "請先完成跨系統開通流程，再返回此頁。",
      ),
    },
    fetch_failed: {
      eyebrow: copyText(locale, "Snapshot failed", "快照失敗"),
      title: copyText(
        locale,
        "The snapshot could not be loaded",
        "快照載入失敗",
      ),
      body: copyText(
        locale,
        "The backend returned an error while loading report state.",
        "後端在載入報表狀態時回傳錯誤。",
      ),
      accent: "#ef4444",
      suggestion: copyText(
        locale,
        "Review the error banner, then retry with manual refresh.",
        "請先查看錯誤訊息，再手動重新整理。",
      ),
    },
    permission_denied: {
      eyebrow: copyText(locale, "Permission required", "需要權限"),
      title: copyText(locale, "You do not have access", "你沒有此頁資料存取權"),
      body: copyText(
        locale,
        "The current actor can open Reports but cannot read this dataset.",
        "目前身分可進入 Reports，但無法讀取這組資料。",
      ),
      accent: "#dc2626",
      suggestion: copyText(
        locale,
        "Escalate access or switch to a scope with reporting read permission.",
        "請申請權限或切換到有讀取能力的範圍。",
      ),
    },
    external_unavailable: {
      eyebrow: copyText(locale, "External dependency", "外部依賴"),
      title: copyText(
        locale,
        "An external dependency is unavailable",
        "外部依賴目前不可用",
      ),
      body: copyText(
        locale,
        "The reporting adapter is degraded or down, so artifacts cannot be issued.",
        "報表相關外部服務降級或中斷，暫時無法發行成品。",
      ),
      accent: "#b45309",
      suggestion: copyText(
        locale,
        "Wait for service recovery and refresh this page manually.",
        "請等待服務恢復後再手動刷新。",
      ),
    },
    filtered_empty: {
      eyebrow: copyText(locale, "Filter mismatch", "篩選不符"),
      title: copyText(locale, "Filters are too narrow", "篩選條件過窄"),
      body: copyText(
        locale,
        "The current tab has data, but nothing matches the active search or status filter.",
        "目前頁籤有資料，但沒有任何項目符合搜尋或狀態篩選。",
      ),
      accent: "#0f766e",
      suggestion: copyText(
        locale,
        "Clear one or more filters to recover the working set.",
        "請放寬條件以恢復工作集。",
      ),
    },
    driver_not_eligible: {
      eyebrow: copyText(locale, "Out of scope", "不適用"),
      title: copyText(
        locale,
        "Driver eligibility does not apply here",
        "此頁不使用司機資格空態",
      ),
      body: copyText(
        locale,
        "This empty reason belongs to driver-app flows and is not expected on Reports.",
        "此空態屬於 driver-app 流程，Reports 頁理論上不會使用。",
      ),
      accent: "#475569",
      suggestion: copyText(
        locale,
        "Use one of the reporting-specific empty reasons instead.",
        "請改用報表頁專屬的 empty reason。",
      ),
    },
  };
  return definitions[reason] ?? definitions.no_data;
}

export default function ReportsPage() {
  const { t, locale } = useTranslation();
  const searchParams = useSearchParams();
  const [jobs, setJobs] = useState<RuntimeReportJob[]>([]);
  const [packages, setPackages] = useState<RuntimeFilingPackage[]>([]);
  const [jobDetail, setJobDetail] = useState<RuntimeReportJobDetail | null>(
    null,
  );
  const [packageDetail, setPackageDetail] =
    useState<RuntimeFilingPackageDetail | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("jobs");
  const [composerMode, setComposerMode] = useState<ComposerMode>(null);
  const [detailLoadingKey, setDetailLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [jobType, setJobType] = useState<ReportJobType>(REPORT_JOB_TYPES[0]!);
  const [format, setFormat] = useState<ReportOutputFormat>("xlsx");
  const [periodLabel, setPeriodLabel] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [packageType, setPackageType] =
    useState<FilingPackageType>("monthly_report");
  const [packageMonth, setPackageMonth] = useState(defaultClosedMonth());
  const [packageScope, setPackageScope] = useState("ops-console");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [reasonText, setReasonText] = useState("");
  const [jobEmptyState, setJobEmptyState] = useState<EmptyStateEnvelope | null>(
    null,
  );
  const [packageEmptyState, setPackageEmptyState] =
    useState<EmptyStateEnvelope | null>(null);
  const [jobListRefreshMetadata, setJobListRefreshMetadata] =
    useState<UiRefreshMetadata | null>(null);
  const [packageListRefreshMetadata, setPackageListRefreshMetadata] =
    useState<UiRefreshMetadata | null>(null);
  const [pageAvailableActions, setPageAvailableActions] = useState<
    ReportAction[]
  >([]);

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (selection) {
      return;
    }
    if (jobs.length > 0) {
      setSelection({ kind: "job", id: jobs[0]!.jobId });
      setActiveTab("jobs");
      void inspectReportJob(jobs[0]!.jobId);
      return;
    }
    if (packages.length > 0) {
      setSelection({ kind: "package", id: packages[0]!.packageId });
      setActiveTab("packages");
      void inspectFilingPackage(packages[0]!.packageId);
    }
  }, [jobs, packages, selection]);

  async function loadData() {
    setLoading(true);
    try {
      const client = getOpsClient();
      const [reportJobsPayload, filingPackagesPayload] = await Promise.all([
        client.get<RuntimeListResponse<RuntimeReportJob> | RuntimeReportJob[]>(
          "/api/reports/jobs",
        ),
        client.get<
          RuntimeListResponse<RuntimeFilingPackage> | RuntimeFilingPackage[]
        >("/api/filing-packages"),
      ]);
      const reportJobs = normalizeListResponse(reportJobsPayload);
      const filingPackages = normalizeListResponse(filingPackagesPayload);
      setJobs(reportJobs.items ?? []);
      setPackages(filingPackages.items ?? []);
      setJobEmptyState(reportJobs.emptyState ?? null);
      setPackageEmptyState(filingPackages.emptyState ?? null);
      setJobListRefreshMetadata(reportJobs.refreshMetadata ?? null);
      setPackageListRefreshMetadata(filingPackages.refreshMetadata ?? null);
      setPageAvailableActions([
        ...(reportJobs.availableActions ?? []),
        ...(filingPackages.availableActions ?? []),
      ]);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("common.unknown"));
    } finally {
      setLoading(false);
    }
  }

  async function inspectReportJob(jobId: string) {
    setSelection({ kind: "job", id: jobId });
    setActiveTab("jobs");
    setDetailLoadingKey(`job:${jobId}`);
    setError(null);
    try {
      const detail = await getOpsClient().getReportJob(jobId);
      setJobDetail(detail as RuntimeReportJobDetail);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("common.unknown"));
    } finally {
      setDetailLoadingKey(null);
    }
  }

  async function inspectFilingPackage(packageId: string) {
    setSelection({ kind: "package", id: packageId });
    setActiveTab("packages");
    setDetailLoadingKey(`package:${packageId}`);
    setError(null);
    try {
      const detail = await getOpsClient().getFilingPackage(packageId);
      setPackageDetail(detail as RuntimeFilingPackageDetail);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("common.unknown"));
    } finally {
      setDetailLoadingKey(null);
    }
  }

  function handleReportSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(() => {
      void (async () => {
        try {
          const client = getOpsClient();
          const filters: CreateReportJobCommand["filters"] = {};
          if (periodLabel.trim()) {
            filters.period = periodLabel.trim();
          }
          if (vehicleId.trim()) {
            filters.vehicleId = vehicleId.trim();
          }
          const accepted = await client.createReportJob({
            jobType,
            format,
            ...(Object.keys(filters).length > 0 ? { filters } : {}),
          });
          setNotice(
            copyText(
              locale,
              `Report job ${accepted.jobId} queued.`,
              `報表工作 ${accepted.jobId} 已排入佇列。`,
            ),
          );
          setComposerMode(null);
          await loadData();
          await inspectReportJob(accepted.jobId);
        } catch (cause) {
          setError(
            cause instanceof Error ? cause.message : t("common.unknown"),
          );
        }
      })();
    });
  }

  function handlePackageSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(() => {
      void (async () => {
        try {
          const client = getOpsClient();
          const accepted = await client.generateFilingPackage({
            packageType,
            period: packageMonth.trim() ? { month: packageMonth.trim() } : {},
            scope: packageScope.trim() ? { channel: packageScope.trim() } : {},
          });
          setNotice(
            copyText(
              locale,
              `Filing package ${accepted.packageId} queued.`,
              `申報套件 ${accepted.packageId} 已排入佇列。`,
            ),
          );
          setComposerMode(null);
          await loadData();
          await inspectFilingPackage(accepted.packageId);
        } catch (cause) {
          setError(
            cause instanceof Error ? cause.message : t("common.unknown"),
          );
        }
      })();
    });
  }

  async function executePendingAction() {
    if (!pendingAction) {
      return;
    }
    const action = pendingAction.action;
    if (action.requiresReason && !reasonText.trim()) {
      return;
    }

    setPendingAction(null);
    setReasonText("");

    if (action.href) {
      window.open(
        action.href,
        action.openMode === "same_tab" ? "_self" : "_blank",
        "noopener,noreferrer",
      );
      return;
    }

    if (
      pendingAction.kind === "job" &&
      action.action === "rerun_failed_job" &&
      "jobType" in pendingAction.record
    ) {
      startTransition(() => {
        void (async () => {
          try {
            const record = pendingAction.record;
            const accepted = await getOpsClient().createReportJob({
              jobType: record.jobType as ReportJobType,
              format: record.format,
              filters: record.filters,
            });
            setNotice(
              copyText(
                locale,
                `Replacement job ${accepted.jobId} queued.`,
                `替代工作 ${accepted.jobId} 已排入佇列。`,
              ),
            );
            await loadData();
            await inspectReportJob(accepted.jobId);
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : t("common.unknown"),
            );
          }
        })();
      });
      return;
    }

    setNotice(
      copyText(
        locale,
        `No handler is wired for ${action.action} yet.`,
        `${action.action} 目前尚未接上處理器。`,
      ),
    );
  }

  function requestAction(
    kind: PendingAction["kind"],
    action: ReportAction,
    record:
      | RuntimeReportJob
      | RuntimeReportJobDetail
      | RuntimeFilingPackage
      | RuntimeFilingPackageDetail,
  ) {
    if (!action.enabled) {
      setNotice(
        copyText(
          locale,
          `Action unavailable: ${action.disabledReasonCode ?? action.action}`,
          `操作不可用：${action.disabledReasonCode ?? action.action}`,
        ),
      );
      return;
    }

    if (action.riskLevel === "low" && !action.requiresReason) {
      void executeActionImmediately(kind, action, record);
      return;
    }

    setPendingAction({
      kind,
      action,
      record: record as never,
    });
  }

  function handleSurfaceAction(action: ReportAction) {
    if (!action.enabled) {
      setNotice(
        copyText(
          locale,
          `Action unavailable: ${action.disabledReasonCode ?? action.action}`,
          `操作不可用：${action.disabledReasonCode ?? action.action}`,
        ),
      );
      return;
    }

    if (action.action === "create_report_job") {
      setComposerMode((current) => (current === "report" ? null : "report"));
      return;
    }

    if (action.action === "generate_filing_package") {
      setComposerMode((current) => (current === "package" ? null : "package"));
      return;
    }

    if (action.href) {
      window.open(
        action.href,
        action.openMode === "same_tab" ? "_self" : "_blank",
        "noopener,noreferrer",
      );
      return;
    }

    setNotice(
      copyText(
        locale,
        `No handler is wired for ${action.action} yet.`,
        `${action.action} 目前尚未接上處理器。`,
      ),
    );
  }

  async function executeActionImmediately(
    kind: PendingAction["kind"],
    action: ReportAction,
    record:
      | RuntimeReportJob
      | RuntimeReportJobDetail
      | RuntimeFilingPackage
      | RuntimeFilingPackageDetail,
  ) {
    if (action.href) {
      window.open(
        action.href,
        action.openMode === "same_tab" ? "_self" : "_blank",
        "noopener,noreferrer",
      );
      return;
    }

    if (kind === "job" && action.action === "inspect_detail") {
      await inspectReportJob((record as RuntimeReportJob).jobId);
      return;
    }

    if (kind === "package" && action.action === "inspect_detail") {
      await inspectFilingPackage((record as RuntimeFilingPackage).packageId);
      return;
    }

    if (kind === "job" && action.action === "rerun_failed_job") {
      setPendingAction({
        kind,
        action,
        record: record as RuntimeReportJob,
      });
      return;
    }

    setNotice(
      copyText(
        locale,
        `No handler is wired for ${action.action} yet.`,
        `${action.action} 目前尚未接上處理器。`,
      ),
    );
  }

  const activePresetCategory = jobCategory(jobType);
  const activeRefreshMetadata =
    selection?.kind === "job"
      ? (jobDetail?.refreshMetadata ?? jobListRefreshMetadata)
      : selection?.kind === "package"
        ? (packageDetail?.refreshMetadata ?? packageListRefreshMetadata)
        : activeTab === "jobs"
          ? jobListRefreshMetadata
          : packageListRefreshMetadata;
  const effectiveGeneratedAt = activeRefreshMetadata?.generatedAt ?? null;
  const freshnessAgeMs = effectiveGeneratedAt
    ? Date.now() - new Date(activeRefreshMetadata?.generatedAt ?? "").getTime()
    : 0;
  const effectiveFreshness =
    activeRefreshMetadata && freshnessAgeMs > activeRefreshMetadata.staleAfterMs
      ? "stale"
      : (activeRefreshMetadata?.dataFreshness ?? "unknown");

  const normalizedSearch = search.trim().toLowerCase();
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchesStatus =
        statusFilter === "all" ? true : job.status === statusFilter;
      const matchesSearch =
        normalizedSearch.length === 0
          ? true
          : [
              job.jobId,
              job.jobType,
              summarizeFilters(job.filters),
              getSubmittedByLabel(job),
            ]
              .join(" ")
              .toLowerCase()
              .includes(normalizedSearch);
      return matchesStatus && matchesSearch;
    });
  }, [jobs, normalizedSearch, statusFilter]);

  const filteredPackages = useMemo(() => {
    return packages.filter((filingPackage) => {
      const matchesStatus =
        statusFilter === "all" ? true : filingPackage.status === statusFilter;
      const matchesSearch =
        normalizedSearch.length === 0
          ? true
          : [
              filingPackage.packageId,
              filingPackage.packageType,
              getPackageScopeSummary(filingPackage, locale),
            ]
              .join(" ")
              .toLowerCase()
              .includes(normalizedSearch);
      return matchesStatus && matchesSearch;
    });
  }, [locale, packages, normalizedSearch, statusFilter]);

  const urlEmptyReason = searchParams.get("emptyReason") as EmptyReason | null;
  const activeEmptyReason = (() => {
    const backendEmptyReason =
      activeTab === "jobs" ? jobEmptyState?.reason : packageEmptyState?.reason;
    if (backendEmptyReason) {
      return backendEmptyReason;
    }
    if (error) {
      if (/403|permission|forbidden/i.test(error)) {
        return "permission_denied";
      }
      if (/adapter|external|unavailable|timeout|degraded|down/i.test(error)) {
        return "external_unavailable";
      }
      return "fetch_failed";
    }
    if (activeTab === "jobs" && jobs.length > 0 && filteredJobs.length === 0) {
      return "filtered_empty";
    }
    if (
      activeTab === "packages" &&
      packages.length > 0 &&
      filteredPackages.length === 0
    ) {
      return "filtered_empty";
    }
    if (urlEmptyReason) {
      return urlEmptyReason;
    }
    return "no_data";
  })();

  const emptyStateDefinition = getEmptyStateDefinition(
    activeEmptyReason,
    locale,
  );

  const selectedJob =
    selection?.kind === "job"
      ? (jobs.find((job) => job.jobId === selection.id) ?? null)
      : null;
  const selectedPackage =
    selection?.kind === "package"
      ? (packages.find(
          (filingPackage) => filingPackage.packageId === selection.id,
        ) ?? null)
      : null;

  const selectedJobActions = jobDetail
    ? (jobDetail.availableActions ?? fallbackJobActions(jobDetail))
    : selectedJob
      ? (selectedJob.availableActions ?? fallbackJobActions(selectedJob))
      : [];

  const selectedPackageActions = packageDetail
    ? (packageDetail.availableActions ?? fallbackPackageActions(packageDetail))
    : selectedPackage
      ? (selectedPackage.availableActions ??
        fallbackPackageActions(selectedPackage))
      : [];

  const pageActions = useMemo(() => {
    const inventory = new Map<PageActionKind, PageActionDescriptor>();
    const knownActions: PageActionKind[] = [
      "create_report_job",
      "generate_filing_package",
    ];
    const records = [
      ...jobs,
      ...packages,
      ...(jobDetail ? [jobDetail] : []),
      ...(packageDetail ? [packageDetail] : []),
    ];

    for (const actionName of knownActions) {
      const match =
        pageAvailableActions.find((action) => action.action === actionName) ??
        records
          .flatMap((record) => record.availableActions ?? [])
          .find((action) => action.action === actionName);
      inventory.set(actionName, {
        action: actionName,
        enabled: match?.enabled ?? false,
        ...(match?.disabledReasonCode
          ? { disabledReasonCode: match.disabledReasonCode }
          : {}),
      });
    }

    return inventory;
  }, [jobDetail, jobs, packageDetail, packages, pageAvailableActions]);

  const metrics = [
    {
      label: copyText(locale, "Queued / running", "排隊 / 執行中"),
      value: jobs.filter(
        (job) => job.status !== "completed" && job.status !== "failed",
      ).length,
      note: copyText(
        locale,
        "Background work still consuming capacity",
        "仍在背景消耗處理容量",
      ),
    },
    {
      label: copyText(locale, "Ready artifacts", "可下載成品"),
      value:
        jobs.filter((job) => job.artifact).length +
        packages.filter((filingPackage) => filingPackage.artifactZipUrl).length,
      note: copyText(
        locale,
        "Signed outputs issued and ready for handoff",
        "已發行簽名成品，可交付下載",
      ),
    },
    {
      label: copyText(locale, "Expiring soon", "即將到期"),
      value:
        jobs.filter((job) => expiresSoon(job.artifact?.expiresAt)).length +
        packages.filter((filingPackage) => expiresSoon(filingPackage.expiresAt))
          .length,
      note: copyText(
        locale,
        "Links within the next 12 hours need operator attention",
        "12 小時內到期的連結需要操作員處理",
      ),
    },
    {
      label: copyText(locale, "Filing packages", "申報套件"),
      value: packages.length,
      note: copyText(
        locale,
        "Immutable bundles for compliance and audit exchange",
        "面向合規與稽核交換的不可變套件",
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={copyText(locale, "Reports", "報表")}
        subtitle={copyText(
          locale,
          "report jobs · filing packages · signed artifact short-lived URLs",
          "report jobs · filing packages · signed artifact 短效 URL",
        )}
      />
      <div className="reports-page">
        <section className="hero-shell">
          <div className="hero-top">
            <div>
              <p className="hero-brow">
                {copyText(locale, "Monitoring", "營運監控")}
              </p>
              <h1>{copyText(locale, "Reporting workspace", "報表工作台")}</h1>
              <p className="hero-copy">
                {copyText(
                  locale,
                  "Kick off report jobs, issue filing packages, watch signed artifact expiry, and only refresh when you need a new snapshot.",
                  "在同一工作台建立報表、發行申報套件、追蹤簽名成品到期時間，並以手動 refresh 控制快照更新。",
                )}
              </p>
            </div>
            <div className="hero-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => void loadData()}
                disabled={loading || pending}
              >
                {copyText(locale, "Refresh snapshot", "刷新快照")}
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() =>
                  handleSurfaceAction(
                    toSurfaceActionDescriptor(
                      "create_report_job",
                      pageActions.get("create_report_job"),
                    ),
                  )
                }
                disabled={!pageActions.get("create_report_job")?.enabled}
                title={formatDisabledReason(
                  pageActions.get("create_report_job")?.disabledReasonCode,
                  locale,
                )}
              >
                {labelForAction("create_report_job", locale)}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  handleSurfaceAction(
                    toSurfaceActionDescriptor(
                      "generate_filing_package",
                      pageActions.get("generate_filing_package"),
                    ),
                  )
                }
                disabled={!pageActions.get("generate_filing_package")?.enabled}
                title={formatDisabledReason(
                  pageActions.get("generate_filing_package")
                    ?.disabledReasonCode,
                  locale,
                )}
              >
                {labelForAction("generate_filing_package", locale)}
              </button>
            </div>
          </div>

          <div className="hero-meta">
            <div className={`freshness-banner freshness-${effectiveFreshness}`}>
              <div>
                <span className="meta-label">T6</span>
                <strong>
                  {copyText(locale, "Manual refresh", "手動刷新")}
                </strong>
              </div>
              <div className="freshness-copy">
                {activeRefreshMetadata ? (
                  <>
                    <span>
                      {copyText(locale, "Generated", "產生時間")}{" "}
                      {formatDateTimeShort(effectiveGeneratedAt)}
                    </span>
                    <span>
                      {copyText(locale, "Source", "來源")}{" "}
                      {activeRefreshMetadata.source}
                    </span>
                    <span>
                      {effectiveFreshness === "stale"
                        ? copyText(
                            locale,
                            "Snapshot may be stale. Refresh before download handoff.",
                            "快照可能已過時。交付下載前請先刷新。",
                          )
                        : copyText(
                            locale,
                            "Snapshot still within the manual freshness window.",
                            "快照仍在手動刷新可接受的新鮮度範圍內。",
                          )}
                    </span>
                  </>
                ) : (
                  <span>
                    {copyText(
                      locale,
                      "Backend freshness metadata is unavailable for this snapshot.",
                      "此快照尚未提供後端 freshness metadata。",
                    )}
                  </span>
                )}
              </div>
            </div>

            <div className="tab-strip">
              <button
                type="button"
                className={activeTab === "jobs" ? "tab active" : "tab"}
                onClick={() => setActiveTab("jobs")}
              >
                Report jobs
                <span>{jobs.length}</span>
              </button>
              <button
                type="button"
                className={activeTab === "packages" ? "tab active" : "tab"}
                onClick={() => setActiveTab("packages")}
              >
                Filing packages
                <span>{packages.length}</span>
              </button>
            </div>
          </div>
        </section>

        {(error || notice) && (
          <section className="message-stack">
            {error && (
              <div className="error-banner">
                <strong>
                  {copyText(locale, "Backend message", "後端訊息")}
                </strong>
                <span>{error}</span>
              </div>
            )}
            {notice && (
              <div className="notice-banner">
                <strong>
                  {copyText(locale, "Operator receipt", "操作回執")}
                </strong>
                <span>{notice}</span>
              </div>
            )}
          </section>
        )}

        {composerMode && (
          <section className="composer-panel">
            {composerMode === "report" ? (
              <form className="composer-form" onSubmit={handleReportSubmit}>
                <div className="composer-head">
                  <div>
                    <p>{copyText(locale, "Create report", "建立報表")}</p>
                    <h2>
                      {copyText(
                        locale,
                        "Background export job",
                        "背景匯出工作",
                      )}
                    </h2>
                  </div>
                  <span className="composer-chip">
                    {t(
                      `reports.category.${activePresetCategory.toLowerCase()}`,
                    )}
                  </span>
                </div>
                <div className="composer-grid">
                  <label>
                    {copyText(locale, "Report type", "報表類型")}
                    <select
                      value={jobType}
                      onChange={(event) =>
                        setJobType(event.target.value as ReportJobType)
                      }
                    >
                      {JOB_PRESETS.map((preset) => (
                        <option key={preset.value} value={preset.value}>
                          {formatOpsCodeLabel(locale, preset.value)}
                        </option>
                      ))}
                    </select>
                    <small>{t(`reports.type.${jobType}.desc`)}</small>
                  </label>
                  <label>
                    {copyText(locale, "Format", "格式")}
                    <select
                      value={format}
                      onChange={(event) =>
                        setFormat(event.target.value as ReportOutputFormat)
                      }
                    >
                      {REPORT_OUTPUT_FORMATS.map((outputFormat) => (
                        <option key={outputFormat} value={outputFormat}>
                          {outputFormat.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {copyText(locale, "Period or tag", "期間 / 標籤")}
                    <input
                      value={periodLabel}
                      onChange={(event) => setPeriodLabel(event.target.value)}
                      placeholder={copyText(
                        locale,
                        "2026-04 or mtd",
                        "2026-04 或 mtd",
                      )}
                    />
                  </label>
                  <label>
                    {copyText(locale, "Vehicle id", "車輛編號")}
                    <input
                      value={vehicleId}
                      onChange={(event) => setVehicleId(event.target.value)}
                      placeholder={copyText(locale, "Optional", "選填")}
                    />
                  </label>
                </div>
                <div className="composer-submit">
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={pending}
                  >
                    {pending
                      ? copyText(locale, "Submitting…", "提交中…")
                      : copyText(locale, "Queue report job", "送出報表工作")}
                  </button>
                </div>
              </form>
            ) : (
              <form className="composer-form" onSubmit={handlePackageSubmit}>
                <div className="composer-head">
                  <div>
                    <p>{copyText(locale, "Create filing", "建立申報")}</p>
                    <h2>
                      {copyText(
                        locale,
                        "Immutable filing package",
                        "不可變申報套件",
                      )}
                    </h2>
                  </div>
                  <span className="composer-chip">
                    {copyText(locale, "Low-risk action", "低風險操作")}
                  </span>
                </div>
                <div className="composer-grid">
                  <label>
                    {copyText(locale, "Package type", "套件類型")}
                    <select
                      value={packageType}
                      onChange={(event) =>
                        setPackageType(event.target.value as FilingPackageType)
                      }
                    >
                      {FILING_PACKAGE_TYPES.map((value) => (
                        <option key={value} value={value}>
                          {formatOpsCodeLabel(locale, value)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {copyText(locale, "Closed month", "結帳月份")}
                    <input
                      value={packageMonth}
                      onChange={(event) => setPackageMonth(event.target.value)}
                      placeholder="2026-04"
                    />
                  </label>
                  <label>
                    {copyText(locale, "Scope channel", "範圍頻道")}
                    <input
                      value={packageScope}
                      onChange={(event) => setPackageScope(event.target.value)}
                      placeholder="ops-console"
                    />
                  </label>
                </div>
                <div className="composer-submit">
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={pending}
                  >
                    {pending
                      ? copyText(locale, "Submitting…", "提交中…")
                      : copyText(
                          locale,
                          "Queue filing package",
                          "送出申報套件",
                        )}
                  </button>
                </div>
              </form>
            )}
          </section>
        )}

        <section className="metric-grid">
          {metrics.map((metric) => (
            <article key={metric.label} className="metric-card">
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.note}</small>
            </article>
          ))}
        </section>

        <section className="workspace-grid">
          <article className="surface-card">
            <div className="surface-head">
              <div>
                <p>{copyText(locale, "Snapshot list", "快照列表")}</p>
                <h2>
                  {activeTab === "jobs"
                    ? copyText(locale, "Report job queue", "報表工作佇列")
                    : copyText(locale, "Filing package queue", "申報套件佇列")}
                </h2>
              </div>
              <div className="surface-controls">
                <input
                  className="search-input"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={copyText(
                    locale,
                    "Search id, type, scope",
                    "搜尋編號、類型、範圍",
                  )}
                />
                <select
                  className="status-select"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="all">
                    {copyText(locale, "All status", "全部狀態")}
                  </option>
                  <option value="queued">queued</option>
                  <option value="running">running</option>
                  <option value="completed">completed</option>
                  <option value="failed">failed</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="loading-card">
                {copyText(
                  locale,
                  "Loading report snapshot…",
                  "正在載入報表快照…",
                )}
              </div>
            ) : activeTab === "jobs" ? (
              filteredJobs.length === 0 ? (
                <EmptyStatePanel
                  definition={emptyStateDefinition}
                  action={
                    filteredJobs.length === 0 &&
                    jobs.length === 0 &&
                    jobEmptyState?.nextAction
                      ? (jobEmptyState.nextAction as ReportAction)
                      : null
                  }
                  onAction={handleSurfaceAction}
                  locale={locale}
                />
              ) : (
                <div className="table-shell">
                  <div className="table-head table-head-jobs">
                    <span>JOB</span>
                    <span>KIND</span>
                    <span>PARAMETERS</span>
                    <span>STATUS</span>
                    <span>SUBMITTED BY</span>
                    <span>SUBMITTED</span>
                    <span>COMPLETED</span>
                    <span>EXPIRES</span>
                    <span>ACTIONS</span>
                  </div>
                  {filteredJobs.map((job) => {
                    const actions =
                      job.availableActions ?? fallbackJobActions(job);
                    return (
                      <button
                        key={job.jobId}
                        type="button"
                        className={
                          selection?.kind === "job" &&
                          selection.id === job.jobId
                            ? "table-row table-row-job active"
                            : "table-row table-row-job"
                        }
                        onClick={() => void inspectReportJob(job.jobId)}
                      >
                        <span className="mono">{job.jobId}</span>
                        <span>
                          <strong>
                            {formatOpsCodeLabel(locale, job.jobType)}
                          </strong>
                          <small>{jobCategory(job.jobType)}</small>
                        </span>
                        <span>
                          {job.parametersSummary ??
                            summarizeFilters(job.filters)}
                        </span>
                        <span>
                          <StatusPill
                            status={job.status}
                            locale={locale}
                            tone={pillToneForStatus(job.status)}
                          />
                        </span>
                        <span>{getSubmittedByLabel(job)}</span>
                        <span className="mono">
                          {formatDateTimeShort(job.createdAt)}
                        </span>
                        <span className="mono">
                          {formatDateTimeShort(getCompletedAtValue(job))}
                        </span>
                        <span className="mono">
                          {job.artifact?.expiresAt ? (
                            <span
                              className={
                                isExpired(job.artifact.expiresAt)
                                  ? "ttl-badge expired"
                                  : expiresSoon(job.artifact.expiresAt)
                                    ? "ttl-badge warning"
                                    : "ttl-badge"
                              }
                            >
                              {formatRelativeMinutes(job.artifact.expiresAt)}
                            </span>
                          ) : (
                            copyText(locale, "pending", "待發行")
                          )}
                        </span>
                        <span className="action-cell">
                          {actions.map((action) => (
                            <button
                              key={`${job.jobId}-${action.action}`}
                              type="button"
                              className="action-pill"
                              disabled={!action.enabled}
                              title={
                                action.enabled
                                  ? undefined
                                  : formatDisabledReason(
                                      action.disabledReasonCode,
                                      locale,
                                    )
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                requestAction("job", action, job);
                              }}
                            >
                              {action.label ??
                                labelForAction(action.action, locale)}
                              {action.openMode === "new_tab"
                                ? copyText(locale, " (new tab)", "（新分頁）")
                                : null}
                            </button>
                          ))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )
            ) : filteredPackages.length === 0 ? (
              <EmptyStatePanel
                definition={emptyStateDefinition}
                action={
                  filteredPackages.length === 0 &&
                  packages.length === 0 &&
                  packageEmptyState?.nextAction
                    ? (packageEmptyState.nextAction as ReportAction)
                    : null
                }
                onAction={handleSurfaceAction}
                locale={locale}
              />
            ) : (
              <div className="table-shell">
                <div className="table-head table-head-packages">
                  <span>PACKAGE</span>
                  <span>TYPE</span>
                  <span>SCOPE / PERIOD</span>
                  <span>STATUS</span>
                  <span>EXPIRES</span>
                  <span>GENERATED</span>
                  <span>ACTIONS</span>
                </div>
                {filteredPackages.map((filingPackage) => {
                  const actions =
                    filingPackage.availableActions ??
                    fallbackPackageActions(filingPackage);
                  return (
                    <button
                      key={filingPackage.packageId}
                      type="button"
                      className={
                        selection?.kind === "package" &&
                        selection.id === filingPackage.packageId
                          ? "table-row table-row-package active"
                          : "table-row table-row-package"
                      }
                      onClick={() =>
                        void inspectFilingPackage(filingPackage.packageId)
                      }
                    >
                      <span className="mono">{filingPackage.packageId}</span>
                      <span>
                        <strong>
                          {formatOpsCodeLabel(
                            locale,
                            filingPackage.packageType,
                          )}
                        </strong>
                        <small>
                          {(filingPackage.immutable ?? true)
                            ? copyText(locale, "Immutable", "不可變")
                            : copyText(locale, "Mutable", "可變")}
                        </small>
                      </span>
                      <span>
                        {getPackageScopeSummary(filingPackage, locale)}
                      </span>
                      <span>
                        <StatusPill
                          status={filingPackage.status}
                          locale={locale}
                          tone={pillToneForStatus(filingPackage.status)}
                        />
                      </span>
                      <span className="mono">
                        {filingPackage.expiresAt ? (
                          <span
                            className={
                              isExpired(filingPackage.expiresAt)
                                ? "ttl-badge expired"
                                : expiresSoon(filingPackage.expiresAt)
                                  ? "ttl-badge warning"
                                  : "ttl-badge"
                            }
                          >
                            {formatRelativeMinutes(filingPackage.expiresAt)}
                          </span>
                        ) : (
                          copyText(locale, "issue on detail", "詳情發行")
                        )}
                      </span>
                      <span className="mono">
                        {formatDateTimeShort(
                          filingPackage.generatedAt ?? filingPackage.createdAt,
                        )}
                      </span>
                      <span className="action-cell">
                        {actions.map((action) => (
                          <button
                            key={`${filingPackage.packageId}-${action.action}`}
                            type="button"
                            className="action-pill"
                            disabled={!action.enabled}
                            title={
                              action.enabled
                                ? undefined
                                : formatDisabledReason(
                                    action.disabledReasonCode,
                                    locale,
                                  )
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              requestAction("package", action, filingPackage);
                            }}
                          >
                            {action.label ??
                              labelForAction(action.action, locale)}
                            {action.openMode === "new_tab"
                              ? copyText(locale, " (new tab)", "（新分頁）")
                              : null}
                          </button>
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </article>

          <aside className="detail-card">
            <div className="surface-head">
              <div>
                <p>{copyText(locale, "Selection detail", "選取詳情")}</p>
                <h2>
                  {selection?.kind === "package"
                    ? copyText(locale, "Filing package detail", "申報套件詳情")
                    : copyText(locale, "Report job detail", "報表工作詳情")}
                </h2>
              </div>
            </div>

            {detailLoadingKey ? (
              <div className="loading-card">
                {copyText(locale, "Loading detail…", "正在載入詳情…")}
              </div>
            ) : selection?.kind === "job" ? (
              selectedJob ? (
                <>
                  <div className="detail-block">
                    <div className="detail-id-row">
                      <div>
                        <strong>{selectedJob.jobId}</strong>
                        <p>{formatOpsCodeLabel(locale, selectedJob.jobType)}</p>
                      </div>
                      <StatusPill
                        status={selectedJob.status}
                        locale={locale}
                        tone={pillToneForStatus(selectedJob.status)}
                      />
                    </div>
                    <dl className="detail-list">
                      <DetailItem
                        label={copyText(locale, "Submitted by", "提交者")}
                        value={getSubmittedByLabel(jobDetail ?? selectedJob)}
                      />
                      <DetailItem
                        label={copyText(locale, "Submitted at", "提交時間")}
                        value={formatDateTime(
                          jobDetail?.createdAt ?? selectedJob.createdAt,
                        )}
                      />
                      <DetailItem
                        label={copyText(locale, "Completed at", "完成時間")}
                        value={formatDateTime(
                          getCompletedAtValue(jobDetail ?? selectedJob),
                        )}
                      />
                      <DetailItem
                        label={copyText(locale, "Parameters", "參數")}
                        value={
                          jobDetail?.parametersSummary ??
                          summarizeFilters(selectedJob.filters)
                        }
                      />
                    </dl>
                  </div>

                  <div className="detail-block">
                    <div className="mini-banner">
                      <strong>
                        {copyText(locale, "Artifact handling", "成品處理")}
                      </strong>
                      <span>
                        {jobDetail?.artifact?.downloadMetadata
                          ? copyText(
                              locale,
                              `Signed URL TTL ${jobDetail.artifact.downloadMetadata.ttlMinutes} minutes`,
                              `簽名網址 TTL ${jobDetail.artifact.downloadMetadata.ttlMinutes} 分鐘`,
                            )
                          : selectedJob.artifact
                            ? copyText(
                                locale,
                                `Link expires ${formatRelativeMinutes(selectedJob.artifact.expiresAt)}`,
                                `連結將於 ${formatRelativeMinutes(selectedJob.artifact.expiresAt)} 後到期`,
                              )
                            : copyText(
                                locale,
                                "Artifact not issued yet",
                                "成品尚未發行",
                              )}
                      </span>
                    </div>
                    {selectedJob.status === "failed" && (
                      <div className="failure-card">
                        <strong>
                          {copyText(locale, "Failure", "失敗原因")}
                        </strong>
                        <span>
                          {jobDetail?.failureReason ??
                            selectedJob.failureReason ??
                            copyText(
                              locale,
                              "Backend did not provide a failure reason.",
                              "後端尚未提供失敗原因。",
                            )}
                        </span>
                      </div>
                    )}
                    <div className="detail-actions">
                      {selectedJobActions.map((action) => (
                        <button
                          key={`detail-${action.action}`}
                          type="button"
                          className={
                            action.action.startsWith("download")
                              ? "primary-button"
                              : "ghost-button"
                          }
                          disabled={!action.enabled}
                          title={
                            action.enabled
                              ? undefined
                              : formatDisabledReason(
                                  action.disabledReasonCode,
                                  locale,
                                )
                          }
                          onClick={() =>
                            requestAction("job", action, selectedJob)
                          }
                        >
                          {action.label ??
                            labelForAction(action.action, locale)}
                          {action.openMode === "new_tab"
                            ? copyText(locale, " (new tab)", "（新分頁）")
                            : null}
                        </button>
                      ))}
                    </div>
                  </div>

                  {jobDetail?.rows?.length ? (
                    <div className="detail-block">
                      <h3>
                        {copyText(locale, "Dispatch trace rows", "派車追蹤列")}
                      </h3>
                      <div className="detail-table">
                        {jobDetail.rows.slice(0, 4).map((row) => (
                          <div key={row.orderId} className="detail-table-row">
                            <span className="mono">{row.orderNo}</span>
                            <span>{row.callId ?? "—"}</span>
                            <span>{row.recordingId ?? "—"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <EmptyStatePanel
                  definition={emptyStateDefinition}
                  compact
                  locale={locale}
                />
              )
            ) : selectedPackage ? (
              <>
                <div className="detail-block">
                  <div className="detail-id-row">
                    <div>
                      <strong>{selectedPackage.packageId}</strong>
                      <p>
                        {formatOpsCodeLabel(
                          locale,
                          selectedPackage.packageType,
                        )}
                      </p>
                    </div>
                    <StatusPill
                      status={selectedPackage.status}
                      locale={locale}
                      tone={pillToneForStatus(selectedPackage.status)}
                    />
                  </div>
                  <dl className="detail-list">
                    <DetailItem
                      label={copyText(locale, "Generated", "產生時間")}
                      value={formatDateTime(
                        packageDetail?.generatedAt ??
                          selectedPackage.generatedAt ??
                          selectedPackage.createdAt,
                      )}
                    />
                    <DetailItem
                      label={copyText(locale, "Manifest hash", "Manifest 雜湊")}
                      value={
                        packageDetail?.manifestHash ??
                        selectedPackage.manifestHash ??
                        "—"
                      }
                    />
                    <DetailItem
                      label={copyText(locale, "Scope", "範圍")}
                      value={getPackageScopeSummary(
                        packageDetail ?? selectedPackage,
                        locale,
                      )}
                    />
                    <DetailItem
                      label={copyText(locale, "Items", "項目數")}
                      value={String(
                        packageDetail?.manifest?.entryCount ??
                          selectedPackage.items.length,
                      )}
                    />
                  </dl>
                </div>

                <div className="detail-block">
                  <div className="mini-banner">
                    <strong>
                      {copyText(locale, "Signed downloads", "簽名下載")}
                    </strong>
                    <span>
                      {packageDetail?.downloadMetadata
                        ? copyText(
                            locale,
                            `ZIP expires ${formatRelativeMinutes(packageDetail.downloadMetadata.zip.expiresAt)} · PDF expires ${formatRelativeMinutes(packageDetail.downloadMetadata.pdf.expiresAt)}`,
                            `ZIP ${formatRelativeMinutes(packageDetail.downloadMetadata.zip.expiresAt)} 後到期 · PDF ${formatRelativeMinutes(packageDetail.downloadMetadata.pdf.expiresAt)} 後到期`,
                          )
                        : copyText(
                            locale,
                            "Open detail to issue signed artifact metadata.",
                            "開啟詳情後才會取得簽名成品 metadata。",
                          )}
                    </span>
                  </div>
                  <div className="detail-actions">
                    {selectedPackageActions.map((action) => (
                      <button
                        key={`detail-${action.action}`}
                        type="button"
                        className={
                          action.action.startsWith("download")
                            ? "primary-button"
                            : "ghost-button"
                        }
                        disabled={!action.enabled}
                        title={
                          action.enabled
                            ? undefined
                            : formatDisabledReason(
                                action.disabledReasonCode,
                                locale,
                              )
                        }
                        onClick={() =>
                          requestAction("package", action, selectedPackage)
                        }
                      >
                        {action.label ?? labelForAction(action.action, locale)}
                        {action.openMode === "new_tab"
                          ? copyText(locale, " (new tab)", "（新分頁）")
                          : null}
                      </button>
                    ))}
                  </div>
                </div>

                {packageDetail?.manifest?.entries?.length ? (
                  <div className="detail-block">
                    <h3>
                      {copyText(locale, "Manifest entries", "Manifest 項目")}
                    </h3>
                    <div className="detail-table">
                      {packageDetail.manifest.entries
                        .slice(0, 4)
                        .map((entry) => (
                          <div key={entry.itemId} className="detail-table-row">
                            <span className="mono">{entry.itemId}</span>
                            <span>{entry.itemType}</span>
                            <span className="mono">
                              {entry.manifestHash.slice(0, 12)}…
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyStatePanel
                definition={emptyStateDefinition}
                compact
                locale={locale}
              />
            )}
          </aside>
        </section>
      </div>

      {pendingAction && (
        <div className="modal-backdrop">
          <div className="confirm-modal">
            <p className="hero-brow">
              {pendingAction.action.riskLevel === "high"
                ? copyText(locale, "High-risk action", "高風險操作")
                : copyText(locale, "Confirm action", "確認操作")}
            </p>
            <h2>{labelForAction(pendingAction.action.action, locale)}</h2>
            <p className="modal-copy">
              {copyText(
                locale,
                "This action is driven by availableActions and requires an explicit operator confirmation before execution.",
                "此操作由 availableActions 驅動，執行前需要操作員明確確認。",
              )}
            </p>
            {pendingAction.action.requiresReason && (
              <label className="reason-field">
                {copyText(locale, "Reason", "原因")}
                <textarea
                  value={reasonText}
                  onChange={(event) => setReasonText(event.target.value)}
                  rows={4}
                />
              </label>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setPendingAction(null);
                  setReasonText("");
                }}
              >
                {copyText(locale, "Cancel", "取消")}
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void executePendingAction()}
              >
                {copyText(locale, "Confirm", "確認")}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .reports-page {
          display: flex;
          flex-direction: column;
          gap: 24px;
          padding-bottom: 40px;
        }

        .hero-shell,
        .composer-panel,
        .surface-card,
        .detail-card,
        .metric-card,
        .notice-banner,
        .error-banner {
          border: 1px solid #f3d4d4;
          border-radius: 28px;
          background:
            radial-gradient(
              circle at top right,
              rgba(251, 191, 188, 0.2),
              transparent 30%
            ),
            linear-gradient(
              180deg,
              rgba(255, 250, 250, 0.98),
              rgba(255, 245, 244, 0.96)
            );
          box-shadow: 0 20px 50px rgba(127, 29, 29, 0.08);
        }

        .hero-shell {
          padding: 28px;
        }

        .hero-top {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: flex-start;
        }

        .hero-brow {
          margin: 0 0 8px;
          font-size: 0.74rem;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #b45309;
        }

        h1 {
          margin: 0;
          font-size: clamp(2rem, 4vw, 3rem);
          line-height: 1;
          color: #1f2937;
        }

        .hero-copy,
        .modal-copy {
          max-width: 64ch;
          margin: 12px 0 0;
          color: #6b7280;
          line-height: 1.6;
        }

        .hero-actions,
        .detail-actions,
        .composer-submit,
        .modal-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .hero-actions {
          justify-content: flex-end;
        }

        .primary-button,
        .secondary-button,
        .ghost-button,
        .action-pill,
        .tab,
        .table-row {
          transition:
            transform 140ms ease,
            box-shadow 140ms ease,
            background 140ms ease,
            border-color 140ms ease;
        }

        .primary-button,
        .secondary-button,
        .ghost-button {
          border-radius: 999px;
          padding: 0.85rem 1.2rem;
          border: 1px solid transparent;
          font: inherit;
          cursor: pointer;
        }

        .primary-button {
          background: linear-gradient(135deg, #111827, #7f1d1d);
          color: white;
        }

        .secondary-button {
          background: #fee2e2;
          color: #7f1d1d;
          border-color: #fecaca;
        }

        .ghost-button {
          background: rgba(255, 255, 255, 0.88);
          color: #374151;
          border-color: #e5e7eb;
        }

        .primary-button:hover,
        .secondary-button:hover,
        .ghost-button:hover,
        .action-pill:hover,
        .tab:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 18px rgba(31, 41, 55, 0.08);
        }

        .primary-button:disabled,
        .secondary-button:disabled,
        .ghost-button:disabled,
        .action-pill:disabled {
          cursor: not-allowed;
          opacity: 0.55;
          box-shadow: none;
          transform: none;
        }

        .hero-meta {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-end;
          margin-top: 28px;
        }

        .freshness-banner {
          display: flex;
          gap: 18px;
          align-items: center;
          padding: 16px 18px;
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.65);
          min-width: min(100%, 720px);
        }

        .freshness-fresh {
          background: rgba(255, 255, 255, 0.78);
        }

        .freshness-stale {
          background: rgba(254, 240, 138, 0.22);
          border-color: rgba(202, 138, 4, 0.32);
        }

        .freshness-copy {
          display: flex;
          gap: 18px;
          flex-wrap: wrap;
          color: #6b7280;
          font-size: 0.92rem;
        }

        .meta-label {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 42px;
          height: 42px;
          border-radius: 999px;
          background: #111827;
          color: white;
          font-weight: 700;
          margin-right: 12px;
        }

        .tab-strip {
          display: flex;
          gap: 10px;
        }

        .tab {
          border: 1px solid #f3d4d4;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.8);
          padding: 0.78rem 1rem;
          cursor: pointer;
          color: #6b7280;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font: inherit;
        }

        .tab span {
          display: inline-flex;
          min-width: 1.6rem;
          height: 1.6rem;
          border-radius: 999px;
          background: #fee2e2;
          align-items: center;
          justify-content: center;
          color: #7f1d1d;
          font-size: 0.86rem;
        }

        .tab.active {
          background: #111827;
          color: white;
          border-color: #111827;
        }

        .tab.active span {
          background: rgba(255, 255, 255, 0.18);
          color: white;
        }

        .message-stack {
          display: grid;
          gap: 12px;
        }

        .notice-banner,
        .error-banner {
          padding: 16px 18px;
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }

        .notice-banner {
          border-color: #cbd5e1;
          background:
            radial-gradient(
              circle at top right,
              rgba(148, 163, 184, 0.14),
              transparent 28%
            ),
            linear-gradient(
              180deg,
              rgba(248, 250, 252, 0.98),
              rgba(241, 245, 249, 0.96)
            );
        }

        .error-banner {
          border-color: #fecaca;
          color: #991b1b;
        }

        .composer-panel {
          padding: 22px;
        }

        .composer-form {
          display: grid;
          gap: 20px;
        }

        .composer-head {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
        }

        .composer-head p,
        .surface-head p,
        .detail-id-row p {
          margin: 0;
          color: #9a3412;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-size: 0.74rem;
        }

        .composer-head h2,
        .surface-head h2 {
          margin: 6px 0 0;
          font-size: 1.28rem;
          color: #1f2937;
        }

        .composer-chip,
        .status-pill {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 0.45rem 0.78rem;
          font-size: 0.85rem;
          font-weight: 600;
        }

        .composer-chip {
          background: #111827;
          color: white;
        }

        .composer-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        label {
          display: grid;
          gap: 8px;
          font-weight: 600;
          color: #374151;
        }

        input,
        select,
        textarea {
          width: 100%;
          border-radius: 16px;
          border: 1px solid #e5e7eb;
          background: rgba(255, 255, 255, 0.92);
          padding: 0.85rem 1rem;
          font: inherit;
          color: #111827;
        }

        small {
          color: #6b7280;
          font-weight: 500;
        }

        .metric-grid,
        .workspace-grid {
          display: grid;
          gap: 18px;
        }

        .metric-grid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .metric-card {
          padding: 20px;
          display: grid;
          gap: 10px;
        }

        .metric-card span {
          color: #6b7280;
        }

        .metric-card strong {
          font-size: clamp(1.8rem, 3vw, 2.4rem);
          color: #111827;
        }

        .workspace-grid {
          grid-template-columns: minmax(0, 1.55fr) minmax(320px, 0.95fr);
          align-items: start;
        }

        .surface-card,
        .detail-card {
          padding: 22px;
        }

        .surface-head {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          margin-bottom: 16px;
        }

        .surface-controls {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .search-input {
          min-width: 240px;
        }

        .status-select {
          min-width: 140px;
        }

        .loading-card,
        .empty-state {
          border-radius: 24px;
          border: 1px dashed #f3d4d4;
          padding: 32px 24px;
          background: rgba(255, 255, 255, 0.64);
          color: #6b7280;
        }

        .table-shell {
          display: grid;
        }

        .table-head,
        .table-row {
          display: grid;
          gap: 12px;
          align-items: center;
        }

        .table-head {
          padding: 0 14px 10px;
          color: #9ca3af;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .table-head-jobs,
        .table-row-job {
          grid-template-columns:
            1.05fr
            1fr
            1.45fr
            0.8fr
            1fr
            0.95fr
            0.95fr
            0.9fr
            1.1fr;
        }

        .table-head-packages,
        .table-row-package {
          grid-template-columns: 1.1fr 1.1fr 1.4fr 0.9fr 0.8fr 1fr 1.1fr;
        }

        .table-row {
          width: 100%;
          text-align: left;
          padding: 16px 14px;
          border: 1px solid transparent;
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.76);
          cursor: pointer;
          margin-bottom: 8px;
          color: #374151;
          font: inherit;
        }

        .table-row strong {
          display: block;
          color: #111827;
        }

        .table-row small {
          display: block;
          margin-top: 4px;
        }

        .table-row.active {
          border-color: #fca5a5;
          background:
            linear-gradient(
              135deg,
              rgba(255, 255, 255, 0.98),
              rgba(254, 242, 242, 0.96)
            ),
            #fff;
          box-shadow: inset 0 0 0 1px rgba(252, 165, 165, 0.24);
        }

        .table-row:hover {
          transform: translateY(-1px);
        }

        .empty-state-action {
          margin-top: 6px;
        }

        .mono {
          font-family: var(
            --font-geist-mono,
            "SFMono-Regular",
            Consolas,
            monospace
          );
          font-size: 0.9rem;
        }

        .action-cell {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .action-pill {
          border-radius: 999px;
          border: 1px solid #e5e7eb;
          background: rgba(255, 255, 255, 0.9);
          color: #374151;
          padding: 0.45rem 0.78rem;
          cursor: pointer;
          font: inherit;
          font-size: 0.82rem;
        }

        .ttl-badge {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 0.28rem 0.6rem;
          background: #e0f2fe;
          color: #075985;
        }

        .ttl-badge.warning {
          background: #fef3c7;
          color: #b45309;
        }

        .ttl-badge.expired {
          background: #fee2e2;
          color: #b91c1c;
        }

        .detail-card {
          position: sticky;
          top: 20px;
          display: grid;
          gap: 16px;
        }

        .detail-block {
          border: 1px solid #f3e8e8;
          border-radius: 24px;
          padding: 18px;
          background: rgba(255, 255, 255, 0.82);
          display: grid;
          gap: 16px;
        }

        .detail-id-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }

        .detail-id-row strong {
          display: block;
          font-size: 1.08rem;
          color: #111827;
        }

        .detail-list {
          display: grid;
          gap: 12px;
          margin: 0;
        }

        .detail-list div {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: baseline;
        }

        .detail-list dt {
          color: #6b7280;
        }

        .detail-list dd {
          margin: 0;
          text-align: right;
          color: #111827;
          max-width: 65%;
        }

        .mini-banner,
        .failure-card {
          border-radius: 20px;
          padding: 14px 16px;
          display: grid;
          gap: 6px;
        }

        .mini-banner {
          background: #fff7ed;
          color: #9a3412;
        }

        .failure-card {
          background: #fef2f2;
          color: #991b1b;
        }

        .detail-table {
          display: grid;
          gap: 8px;
        }

        .detail-table-row {
          display: grid;
          grid-template-columns: 1.15fr 1fr 1fr;
          gap: 10px;
          border-radius: 16px;
          padding: 12px 14px;
          background: #f8fafc;
          color: #334155;
        }

        .status-pill {
          gap: 8px;
        }

        .status-pill::before {
          content: "";
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: currentColor;
        }

        .tone-success {
          background: #dcfce7;
          color: #166534;
        }

        .tone-info {
          background: #dbeafe;
          color: #1d4ed8;
        }

        .tone-pending {
          background: #fef3c7;
          color: #b45309;
        }

        .tone-danger {
          background: #fee2e2;
          color: #b91c1c;
        }

        .tone-neutral {
          background: #e5e7eb;
          color: #4b5563;
        }

        .empty-state.compact {
          padding: 24px 18px;
        }

        .empty-accent {
          width: 54px;
          height: 54px;
          border-radius: 18px;
          margin-bottom: 14px;
        }

        .empty-eyebrow {
          margin: 0 0 8px;
          color: #9a3412 !important;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-size: 0.72rem;
          font-weight: 700;
        }

        .empty-state h3 {
          margin: 0 0 8px;
          color: #111827;
        }

        .empty-state p {
          margin: 0;
          color: #6b7280;
          line-height: 1.6;
        }

        .reason-field {
          font-weight: 600;
        }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(17, 24, 39, 0.42);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          z-index: 80;
        }

        .confirm-modal {
          width: min(100%, 520px);
          border-radius: 28px;
          border: 1px solid #f3d4d4;
          background:
            radial-gradient(
              circle at top right,
              rgba(251, 191, 188, 0.2),
              transparent 30%
            ),
            linear-gradient(
              180deg,
              rgba(255, 250, 250, 0.99),
              rgba(255, 245, 244, 0.97)
            );
          padding: 24px;
          box-shadow: 0 30px 70px rgba(17, 24, 39, 0.18);
        }

        .confirm-modal h2 {
          margin: 0;
          color: #111827;
        }

        @media (max-width: 1180px) {
          .metric-grid,
          .workspace-grid,
          .composer-grid {
            grid-template-columns: 1fr 1fr;
          }

          .hero-meta,
          .hero-top {
            flex-direction: column;
            align-items: stretch;
          }

          .detail-card {
            position: static;
          }
        }

        @media (max-width: 900px) {
          .metric-grid,
          .workspace-grid,
          .composer-grid {
            grid-template-columns: 1fr;
          }

          .table-head {
            display: none;
          }

          .table-row,
          .table-head-jobs,
          .table-head-packages {
            grid-template-columns: 1fr;
          }

          .search-input {
            min-width: 0;
          }

          .detail-list div {
            display: grid;
          }

          .detail-list dd {
            text-align: left;
            max-width: none;
          }
        }
      `}</style>
    </>
  );
}

function EmptyStatePanel({
  definition,
  compact = false,
  action = null,
  onAction,
  locale,
}: {
  definition: EmptyStateDefinition;
  compact?: boolean;
  action?: ReportAction | null;
  onAction?: (action: ReportAction) => void;
  locale: "en" | "zh";
}) {
  return (
    <div className={compact ? "empty-state compact" : "empty-state"}>
      <div
        className="empty-accent"
        style={{
          background: `linear-gradient(135deg, ${definition.accent}, rgba(255,255,255,0.92))`,
        }}
      />
      <p className="empty-eyebrow">{definition.eyebrow}</p>
      <h3>{definition.title}</h3>
      <p>{definition.body}</p>
      <p>{definition.suggestion}</p>
      {action ? (
        <button
          type="button"
          className="ghost-button empty-state-action"
          disabled={!action.enabled}
          title={
            action.enabled
              ? undefined
              : formatDisabledReason(action.disabledReasonCode, locale)
          }
          onClick={() => onAction?.(action)}
        >
          {action.label ?? labelForAction(action.action, locale)}
        </button>
      ) : null}
    </div>
  );
}

function StatusPill({
  status,
  locale,
  tone,
}: {
  status: string;
  locale: "en" | "zh";
  tone: string;
}) {
  const localizedStatus =
    status === "completed"
      ? copyText(locale, "completed", "已完成")
      : status === "queued"
        ? copyText(locale, "queued", "排隊中")
        : status === "running"
          ? copyText(locale, "running", "執行中")
          : status === "failed"
            ? copyText(locale, "failed", "失敗")
            : status;

  return <span className={`status-pill tone-${tone}`}>{localizedStatus}</span>;
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
