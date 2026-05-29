"use client";

import Link from "next/link";
import {
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  MAINTENANCE_STATUSES,
  MAINTENANCE_TYPES,
  type ActionReceipt,
  type CreateMaintenanceRecordCommand,
  type CrossAppResourceLink,
  type EmptyReason,
  type EmptyStateEnvelope,
  type MaintenanceStatus,
  type MaintenanceType,
  type MaintenanceRuntimeRecord,
  type RefreshTier,
  type ResourceActionDescriptor,
  UI_REFRESH_INTERVAL_MS,
  type UiRefreshMetadata,
  type UpdateMaintenanceRecordCommand,
  type VehicleRegistryRecord,
} from "@drts/contracts";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasField as Field,
  CanvasIcon,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { isMaintenanceOverdue } from "@/lib/ops-analytics";

const STATUSES: MaintenanceStatus[] = [...MAINTENANCE_STATUSES];
const TYPES: MaintenanceType[] = [...MAINTENANCE_TYPES];
const REFRESH_TIER: RefreshTier = "medium";
const REFRESH_INTERVAL_MS = UI_REFRESH_INTERVAL_MS[REFRESH_TIER];
const UNKNOWN_ERROR = "Unknown error";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

type StatusFilter = "all" | MaintenanceStatus;

type SaveNotice = {
  tone: Exclude<CanvasTone, "neutral">;
  title: string;
  body?: string;
  receipt?: ActionReceipt;
};

type LoadState = {
  loading: boolean;
  refreshing: boolean;
  errorMessage: string | null;
  maintenanceIssue: EmptyReason | null;
  vehicleIssue: EmptyReason | null;
};

type EditorState =
  | { mode: "create" }
  | { mode: "edit"; record: MaintenanceRuntimeRecord }
  | null;

type ConfirmState =
  | {
      action: "complete";
      descriptor: ResourceActionDescriptor;
      record: MaintenanceRuntimeRecord;
    }
  | null;

type MaintenanceRow = Record<string, unknown> & {
  maintenanceId: string;
  workOrderCell: ReactNode;
  vehicleCell: ReactNode;
  kindCell: ReactNode;
  statusCell: ReactNode;
  scheduleCell: ReactNode;
  technicianCell: ReactNode;
  costCell: ReactNode;
  actionsCell: ReactNode;
};

function copy(locale: "en" | "zh", en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function formatMoney(value: number | null) {
  if (value === null) {
    return "—";
  }

  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(locale: "en" | "zh", value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(value))
    .replace(",", "");
}

function effectiveStatus(record: MaintenanceRuntimeRecord): MaintenanceStatus {
  return isMaintenanceOverdue(record) ? "overdue" : record.status;
}

function createActionDescriptor(input: {
  action: string;
  enabled: boolean;
  riskLevel: ResourceActionDescriptor["riskLevel"];
  disabledReasonCode?: string;
  requiresReason?: boolean;
}): ResourceActionDescriptor {
  return {
    action: input.action,
    enabled: input.enabled,
    riskLevel: input.riskLevel,
    ...(input.disabledReasonCode
      ? { disabledReasonCode: input.disabledReasonCode }
      : {}),
    ...(input.requiresReason ? { requiresReason: input.requiresReason } : {}),
  };
}

function findAction(
  actions: readonly ResourceActionDescriptor[],
  action: string,
) {
  return actions.find((candidate) => candidate.action === action);
}

function refreshIcon(size = 14) {
  return (
    <span
      style={{
        display: "inline-flex",
        transform: "rotate(-45deg)",
      }}
    >
      <CanvasIcon name="arrow" size={size} />
    </span>
  );
}

function rowPriority(record: MaintenanceRuntimeRecord) {
  const status = effectiveStatus(record);
  switch (status) {
    case "overdue":
      return 0;
    case "in_progress":
      return 1;
    case "scheduled":
      return 2;
    case "completed":
      return 3;
    case "cancelled":
    default:
      return 4;
  }
}

function rowStatusTone(record: MaintenanceRuntimeRecord): CanvasTone {
  const status = effectiveStatus(record);
  if (status === "overdue") return "danger";
  if (status === "completed") return "success";
  if (status === "in_progress") return "info";
  if (status === "scheduled") return "warn";
  return "neutral";
}

function freshnessTone(metadata: UiRefreshMetadata | null): CanvasTone {
  if (!metadata) return "neutral";
  if (metadata.dataFreshness === "degraded") return "danger";
  if (metadata.dataFreshness === "stale") return "warn";
  if (metadata.dataFreshness === "unknown") return "neutral";
  return "success";
}

function currentFreshness(metadata: UiRefreshMetadata | null): UiRefreshMetadata["dataFreshness"] {
  if (!metadata) {
    return "unknown";
  }

  if (metadata.dataFreshness === "degraded") {
    return "degraded";
  }

  const age = Date.now() - new Date(metadata.generatedAt).getTime();
  return age > metadata.staleAfterMs ? "stale" : metadata.dataFreshness;
}

function normalizeIssue(message: string): EmptyReason {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("401") ||
    normalized.includes("403") ||
    normalized.includes("forbidden") ||
    normalized.includes("unauthorized") ||
    normalized.includes("permission")
  ) {
    return "permission_denied";
  }
  if (
    normalized.includes("502") ||
    normalized.includes("503") ||
    normalized.includes("504") ||
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("network") ||
    normalized.includes("unavailable") ||
    normalized.includes("abort")
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

function freshnessLabelCopy(
  locale: "en" | "zh",
  freshness: UiRefreshMetadata["dataFreshness"],
) {
  switch (freshness) {
    case "fresh":
      return copy(locale, "Fresh", "最新");
    case "stale":
      return copy(locale, "Stale", "過舊");
    case "degraded":
      return copy(locale, "Degraded", "降級");
    case "unknown":
    default:
      return copy(locale, "Unknown", "未知");
  }
}

function emptyReasonLabel(locale: "en" | "zh", reason: EmptyReason) {
  switch (reason) {
    case "no_data":
      return copy(locale, "No data", "無資料");
    case "not_provisioned":
      return copy(locale, "Not provisioned", "尚未開通");
    case "fetch_failed":
      return copy(locale, "Load failed", "載入失敗");
    case "permission_denied":
      return copy(locale, "Permission denied", "權限不足");
    case "external_unavailable":
      return copy(locale, "Dependency unavailable", "相依服務不可用");
    case "filtered_empty":
      return copy(locale, "Filters too narrow", "篩選過窄");
    case "driver_not_eligible":
      return copy(locale, "Not eligible", "不可用");
    default:
      return reason;
  }
}

function withFleetCreateGuard(
  action: ResourceActionDescriptor | undefined,
  canCreate: boolean,
): ResourceActionDescriptor | undefined {
  if (!action) {
    return undefined;
  }

  const disabledReasonCode = !canCreate
    ? "vehicle_registry_empty"
    : action.disabledReasonCode;

  return createActionDescriptor({
    action: action.action,
    enabled: canCreate && action.enabled,
    riskLevel: action.riskLevel,
    ...(disabledReasonCode ? { disabledReasonCode } : {}),
    ...(action.requiresReason ? { requiresReason: action.requiresReason } : {}),
  });
}

function resolveCrossAppBase(
  targetApp: CrossAppResourceLink["targetApp"],
): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const url = new URL(window.location.href);
  if (url.hostname === "localhost") {
    const port =
      targetApp === "platform-admin"
        ? "3002"
        : targetApp === "tenant-console"
          ? "3004"
          : "3003";
    return `${url.protocol}//${url.hostname}:${port}`;
  }

  if (targetApp === "platform-admin") {
    if (url.hostname.startsWith("ops.")) {
      return `${url.protocol}//${url.hostname.slice(4)}`;
    }
    return url.origin;
  }

  if (targetApp === "tenant-console") {
    if (url.hostname.startsWith("ops.")) {
      return `${url.protocol}//tenant.${url.hostname.slice(4)}`;
    }
    return `${url.protocol}//tenant.${url.hostname}`;
  }

  return url.origin;
}

function resolveCrossAppHref(link: CrossAppResourceLink) {
  const base = resolveCrossAppBase(link.targetApp);
  return base ? `${base}${link.route}` : link.route;
}

function buildAuditLink(
  locale: "en" | "zh",
  auditId: string,
): CrossAppResourceLink {
  return {
    targetApp: "platform-admin",
    route: `/audit?auditId=${encodeURIComponent(auditId)}`,
    resourceType: "audit_log",
    resourceId: auditId,
    openMode: "new_tab",
    label: copy(locale, "View audit", "查看稽核"),
  };
}

function receiptReferenceCopy(
  locale: "en" | "zh",
  receipt: ActionReceipt,
) {
  return copy(
    locale,
    `Action ${receipt.actionId} · Audit ${receipt.auditId}`,
    `動作 ${receipt.actionId} · 稽核 ${receipt.auditId}`,
  );
}

function withReceiptNotice(
  locale: "en" | "zh",
  notice: SaveNotice,
  receipt: ActionReceipt,
): SaveNotice {
  return {
    ...notice,
    body: [notice.body, receiptReferenceCopy(locale, receipt)]
      .filter(Boolean)
      .join(" "),
    receipt,
  };
}

function disabledReasonCopy(
  locale: "en" | "zh",
  code: string | undefined,
): string | undefined {
  switch (code) {
    case "vehicle_registry_empty":
      return copy(
        locale,
        "Create is disabled until fleet provisioning exposes at least one vehicle.",
        "至少要先在 fleet 建立一台車，才能開立保修工單。",
      );
    case "completed":
      return copy(
        locale,
        "Closed work orders are read-only.",
        "已結案工單目前為唯讀。",
      );
    case "not_in_progress":
      return copy(
        locale,
        "Only in-progress work orders can be completed directly.",
        "只有進行中的工單可以直接標記完成。",
      );
    default:
      return undefined;
  }
}

function filterActivityTimestamp(record: MaintenanceRuntimeRecord) {
  return record.scheduledAt ?? record.completedAt ?? record.updatedAt ?? null;
}

function dateWithinRange(
  record: MaintenanceRuntimeRecord,
  from: string,
  to: string,
): boolean {
  const source = filterActivityTimestamp(record);
  if (!source) {
    return !from && !to;
  }

  const stamp = new Date(source).getTime();
  if (Number.isNaN(stamp)) {
    return false;
  }

  if (from) {
    const fromStamp = new Date(`${from}T00:00:00`).getTime();
    if (stamp < fromStamp) {
      return false;
    }
  }

  if (to) {
    const toStamp = new Date(`${to}T23:59:59`).getTime();
    if (stamp > toStamp) {
      return false;
    }
  }

  return true;
}

function nextActionForReason(
  reason: EmptyReason,
  createAction: ResourceActionDescriptor | undefined,
): ResourceActionDescriptor | undefined {
  if (reason === "no_data") {
    return createAction;
  }

  if (reason === "fetch_failed" || reason === "external_unavailable") {
    return {
      action: "refresh",
      enabled: true,
      riskLevel: "low",
    };
  }

  if (reason === "filtered_empty") {
    return {
      action: "clear_filters",
      enabled: true,
      riskLevel: "low",
    };
  }

  if (reason === "not_provisioned") {
    return {
      action: "open_platform_fleet",
      enabled: true,
      riskLevel: "low",
    };
  }

  return undefined;
}

function createEmptyEnvelope(
  reason: EmptyReason,
  createAction: ResourceActionDescriptor | undefined,
): EmptyStateEnvelope {
  const nextAction = nextActionForReason(reason, createAction);
  return {
    reason,
    messageCode: `maintenance.empty.${reason}`,
    ...(nextAction ? { nextAction } : {}),
  };
}

function actionButtonLabel(
  locale: "en" | "zh",
  action: string,
): string {
  switch (action) {
    case "create_record":
      return copy(locale, "Create work order", "開立工單");
    case "edit_record":
      return copy(locale, "Edit", "編輯");
    case "complete_record":
      return copy(locale, "Complete", "完成");
    case "refresh":
      return copy(locale, "Refresh", "重整");
    case "clear_filters":
      return copy(locale, "Clear filters", "清除篩選");
    case "open_platform_fleet":
      return copy(locale, "Open Platform Fleet", "前往 Platform Fleet");
    default:
      return action;
  }
}

function actionButtonVariant(
  action: ResourceActionDescriptor,
): "primary" | "secondary" | "ghost" {
  if (action.action === "create_record") {
    return "primary";
  }
  return "secondary";
}

function actionButtonIcon(
  action: ResourceActionDescriptor,
): ReactNode | undefined {
  switch (action.action) {
    case "create_record":
      return <CanvasIcon name="plus" size={14} />;
    case "refresh":
      return refreshIcon();
    case "open_platform_fleet":
      return <CanvasIcon name="ext" size={14} />;
    case "complete_record":
      return <CanvasIcon name="check" size={14} />;
    default:
      return undefined;
  }
}

function buttonTitle(
  locale: "en" | "zh",
  action: ResourceActionDescriptor,
): string | undefined {
  return disabledReasonCopy(locale, action.disabledReasonCode);
}

function modalInputStyle(mono = false): CSSProperties {
  return {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 7,
    border: `1px solid ${theme.border}`,
    background: theme.bgRaised,
    color: theme.text,
    fontSize: 12.5,
    fontFamily: mono ? theme.monoFamily : theme.fontFamily,
  };
}

function MaintenanceEmptyState({
  locale,
  envelope,
  onAction,
}: {
  locale: "en" | "zh";
  envelope: EmptyStateEnvelope;
  onAction: (action: ResourceActionDescriptor) => void;
}) {
  const palette: Record<
    EmptyReason,
    {
      tone: Exclude<CanvasTone, "neutral">;
      icon: "maintenance" | "filter" | "clock" | "warn" | "ext";
      title: string;
      body: string;
    }
  > = {
    no_data: {
      tone: "info",
      icon: "maintenance",
      title: copy(locale, "No maintenance records yet", "目前沒有保修工單"),
      body: copy(
        locale,
        "The maintenance lane is healthy. Create the first work order when a vehicle enters scheduled service or workshop handling.",
        "目前沒有待追蹤的保修工單。當車輛進入排程保養或進廠處理時，再開立第一張工單。",
      ),
    },
    not_provisioned: {
      tone: "warn",
      icon: "ext",
      title: copy(
        locale,
        "Fleet provisioning is not ready",
        "Fleet provisioning 尚未就緒",
      ),
      body: copy(
        locale,
        "No vehicle registry records are available yet, so ops cannot open maintenance work orders with authoritative fleet context.",
        "目前還沒有任何車輛主檔，ops 無法在有權威 fleet context 的情況下開立保修工單。",
      ),
    },
    fetch_failed: {
      tone: "danger",
      icon: "clock",
      title: copy(
        locale,
        "Maintenance feed failed to load",
        "保修資料載入失敗",
      ),
      body: copy(
        locale,
        "The maintenance endpoint returned an unexpected failure. Retry the page or inspect the control-plane dependency health.",
        "保修端點回傳非預期錯誤。請重新整理，或先確認 control-plane 依賴健康度。",
      ),
    },
    permission_denied: {
      tone: "danger",
      icon: "warn",
      title: copy(
        locale,
        "You do not have access to this feed",
        "你沒有權限查看此保修資料",
      ),
      body: copy(
        locale,
        "This actor is missing maintenance read scope. Ask an ops manager or platform admin to grant the required authority.",
        "目前 actor 缺少 maintenance 讀取權限。請由 ops_manager 或 platform-admin 補齊授權。",
      ),
    },
    external_unavailable: {
      tone: "warn",
      icon: "warn",
      title: copy(
        locale,
        "A dependent service is unavailable",
        "相依服務目前不可用",
      ),
      body: copy(
        locale,
        "Fleet or maintenance data is temporarily unreachable. Keep dispatch decisions conservative until the source recovers.",
        "Fleet 或 maintenance 資料來源暫時無法連線。來源恢復前，請用較保守的派車判斷。",
      ),
    },
    filtered_empty: {
      tone: "info",
      icon: "filter",
      title: copy(
        locale,
        "No work orders match the current filters",
        "目前篩選條件找不到工單",
      ),
      body: copy(
        locale,
        "Broaden status, vehicle, or date-range filters to inspect the full maintenance queue again.",
        "請放寬狀態、車輛或日期區間條件，重新檢視完整保修隊列。",
      ),
    },
    driver_not_eligible: {
      tone: "info",
      icon: "warn",
      title: copy(locale, "No eligible records", "目前沒有可用資料"),
      body: copy(locale, "This state is not used on maintenance.", "此狀態不適用於 maintenance。"),
    },
  };

  const content = palette[envelope.reason];

  return (
    <div
      style={{
        padding: "32px 24px",
        display: "grid",
        placeItems: "center",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          display: "grid",
          placeItems: "center",
          background:
            content.tone === "danger"
              ? theme.dangerBg
              : content.tone === "warn"
                ? theme.warnBg
                : theme.infoBg,
          border: `1px solid ${
            content.tone === "danger"
              ? theme.dangerBorder
              : content.tone === "warn"
                ? theme.warnBorder
                : theme.infoBorder
          }`,
          marginBottom: 14,
        }}
      >
        <CanvasIcon
          name={content.icon}
          size={22}
          style={{
            color:
              content.tone === "danger"
                ? theme.danger
                : content.tone === "warn"
                  ? theme.warn
                  : theme.info,
          }}
        />
      </div>
      <Pill theme={theme} tone={content.tone} style={{ marginBottom: 12 }}>
        {emptyReasonLabel(locale, envelope.reason)}
      </Pill>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: theme.text,
          marginBottom: 8,
        }}
      >
        {content.title}
      </div>
      <div
        style={{
          maxWidth: 560,
          fontSize: 12.5,
          color: theme.textMuted,
          lineHeight: 1.6,
        }}
      >
        {content.body}
      </div>
      {envelope.nextAction ? (
        <div style={{ marginTop: 18 }}>
          <Btn
            theme={theme}
            variant={actionButtonVariant(envelope.nextAction)}
            icon={actionButtonIcon(envelope.nextAction)}
            onClick={() => onAction(envelope.nextAction!)}
          >
            {actionButtonLabel(locale, envelope.nextAction.action)}
          </Btn>
        </div>
      ) : null}
    </div>
  );
}

function ModalFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(8, 12, 20, 0.72)",
        display: "grid",
        placeItems: "center",
        padding: 24,
        zIndex: 40,
      }}
    >
      <div
        style={{
          width: "min(720px, 100%)",
          maxHeight: "min(88vh, 920px)",
          overflow: "auto",
          borderRadius: 14,
          border: `1px solid ${theme.borderStrong}`,
          background: theme.surface,
          boxShadow: theme.shadow,
        }}
      >
        <div
          style={{
            padding: "18px 20px 14px",
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: theme.text,
              lineHeight: 1.15,
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div
              style={{
                marginTop: 6,
                fontSize: 12.5,
                color: theme.textMuted,
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

function MaintenanceEditorModal({
  locale,
  state,
  vehicleIds,
  onClose,
  onSaved,
}: {
  locale: "en" | "zh";
  state: NonNullable<EditorState>;
  vehicleIds: string[];
  onClose: () => void;
  onSaved: (notice: SaveNotice) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const editingRecord = state.mode === "edit" ? state.record : null;
  const [vehicleId, setVehicleId] = useState(editingRecord?.vehicleId ?? "");
  const [type, setType] = useState<MaintenanceType>(
    editingRecord?.type ?? "scheduled_service",
  );
  const [description, setDescription] = useState(
    editingRecord?.description ?? "",
  );
  const [scheduledAt, setScheduledAt] = useState(
    editingRecord?.scheduledAt
      ? new Date(editingRecord.scheduledAt).toISOString().slice(0, 16)
      : "",
  );
  const [status, setStatus] = useState<MaintenanceStatus>(
    editingRecord?.status ?? "scheduled",
  );
  const [completedAt, setCompletedAt] = useState(
    editingRecord?.completedAt
      ? new Date(editingRecord.completedAt).toISOString().slice(0, 16)
      : "",
  );
  const [technician, setTechnician] = useState(editingRecord?.technician ?? "");
  const [cost, setCost] = useState(
    editingRecord?.cost === null || editingRecord?.cost === undefined
      ? ""
      : String(editingRecord.cost),
  );
  const [notes, setNotes] = useState(editingRecord?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  async function submitEditor() {
    setError(null);

    try {
      const client = getOpsClient();
      if (state.mode === "create") {
        const scheduledAtIso = scheduledAt
          ? new Date(scheduledAt).toISOString()
          : null;
        const technicianValue = technician.trim();
        const costValue = cost.trim();
        const notesValue = notes.trim();
        const payload: CreateMaintenanceRecordCommand = {
          vehicleId: vehicleId.trim(),
          type,
          description: description.trim(),
          ...(scheduledAtIso ? { scheduledAt: scheduledAtIso } : {}),
          ...(technicianValue ? { technician: technicianValue } : {}),
          ...(costValue ? { cost: Number(costValue) } : {}),
          ...(notesValue ? { notes: notesValue } : {}),
        };
        const result = await client.createMaintenance(payload);
        await onSaved(
          withReceiptNotice(
            locale,
            {
              tone: "success",
              title: copy(
                locale,
                "Maintenance record created",
                "保修工單已建立",
              ),
              body: copy(
                locale,
                "The new work order is now visible in the monitoring queue.",
                "新工單已加入保修監控隊列。",
              ),
            },
            result.receipt,
          ),
        );
      } else {
        const editingRecord = state.record;
        const completedAtIso = completedAt
          ? new Date(completedAt).toISOString()
          : null;
        const technicianValue = technician.trim();
        const costValue = cost.trim();
        const notesValue = notes.trim();
        const payload: UpdateMaintenanceRecordCommand = {
          status,
          ...(completedAtIso ? { completedAt: completedAtIso } : {}),
          ...(technicianValue ? { technician: technicianValue } : {}),
          ...(costValue ? { cost: Number(costValue) } : {}),
          ...(notesValue ? { notes: notesValue } : {}),
        };
        const result = await client.updateMaintenance(
          editingRecord.maintenanceId,
          payload,
        );
        await onSaved(
          withReceiptNotice(
            locale,
            {
              tone: "success",
              title: copy(
                locale,
                "Maintenance record updated",
                "保修工單已更新",
              ),
              body: copy(
                locale,
                "The revised work order will refresh into the live queue.",
                "更新後的工單會在下一輪 live queue 反映。",
              ),
            },
            result.receipt,
          ),
        );
      }
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : UNKNOWN_ERROR);
    }
  }

  return (
    <ModalFrame
      title={
        state.mode === "create"
          ? copy(locale, "Create maintenance record", "開立保修工單")
          : copy(locale, "Edit maintenance record", "編輯保修工單")
      }
      subtitle={
        state.mode === "create"
          ? copy(
              locale,
              "Medium-risk action: confirm inputs before writing the work order.",
              "中風險操作：寫入工單前請再次確認欄位內容。",
            )
          : `${editingRecord?.maintenanceId ?? ""} · ${editingRecord?.vehicleId ?? ""}`
      }
    >
      {error ? (
        <Banner theme={theme} tone="danger" icon="warn" title={error} />
      ) : null}

      {editingRecord ? (
        <Card
          theme={theme}
          title={copy(locale, "Read-only work order context", "唯讀工單上下文")}
          style={{ marginBottom: 18 }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 10.5, color: theme.textMuted }}>WO</div>
              <div style={{ fontFamily: theme.monoFamily, fontSize: 12.5 }}>
                {editingRecord.maintenanceId}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: theme.textMuted }}>
                {copy(locale, "Vehicle", "車輛")}
              </div>
              <div style={{ fontFamily: theme.monoFamily, fontSize: 12.5 }}>
                {editingRecord.vehicleId}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: theme.textMuted }}>
                {copy(locale, "Type", "類別")}
              </div>
              <div>{formatOpsCodeLabel(locale, editingRecord.type)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: theme.textMuted }}>
                {copy(locale, "Scheduled", "排定時間")}
              </div>
              <div>{formatDateTime(locale, editingRecord.scheduledAt)}</div>
            </div>
          </div>
          <div style={{ marginTop: 12, fontSize: 12.5, color: theme.textMuted }}>
            {editingRecord.description}
          </div>
        </Card>
      ) : null}

      <div>
        {state.mode === "create" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 14,
            }}
          >
            <Field
              theme={theme}
              label={copy(locale, "Vehicle", "車輛")}
              required
            >
              <input
                list="maintenance-vehicle-options"
                value={vehicleId}
                onChange={(event) => setVehicleId(event.target.value)}
                style={modalInputStyle(true)}
                placeholder={copy(locale, "Vehicle ID", "車輛編號")}
              />
              <datalist id="maintenance-vehicle-options">
                {vehicleIds.map((entry) => (
                  <option key={entry} value={entry} />
                ))}
              </datalist>
            </Field>
            <Field theme={theme} label={copy(locale, "Type", "類別")} required>
              <select
                value={type}
                onChange={(event) =>
                  setType(event.target.value as MaintenanceType)
                }
                style={modalInputStyle()}
              >
                {TYPES.map((entry) => (
                  <option key={entry} value={entry}>
                    {formatOpsCodeLabel(locale, entry)}
                  </option>
                ))}
              </select>
            </Field>
            <div style={{ gridColumn: "1 / -1" }}>
              <Field
                theme={theme}
                label={copy(locale, "Description", "說明")}
                required
              >
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  style={{ ...modalInputStyle(), minHeight: 96, resize: "vertical" }}
                  placeholder={copy(
                    locale,
                    "Scheduled service, repair scope, or workshop notes",
                    "輸入保養類別、維修範圍或進廠說明",
                  )}
                />
              </Field>
            </div>
            <Field
              theme={theme}
              label={copy(locale, "Scheduled time", "排定時間")}
            >
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
                style={modalInputStyle(true)}
              />
            </Field>
            <Field theme={theme} label={copy(locale, "Technician", "技師")}>
              <input
                value={technician}
                onChange={(event) => setTechnician(event.target.value)}
                style={modalInputStyle()}
                placeholder={copy(locale, "Workshop owner", "技師 / 維修廠")}
              />
            </Field>
            <Field theme={theme} label={copy(locale, "Cost", "費用")}>
              <input
                value={cost}
                onChange={(event) => setCost(event.target.value)}
                style={modalInputStyle(true)}
                inputMode="numeric"
                placeholder="0"
              />
            </Field>
            <div style={{ gridColumn: "1 / -1" }}>
              <Field theme={theme} label={copy(locale, "Notes", "備註")}>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  style={{ ...modalInputStyle(), minHeight: 84, resize: "vertical" }}
                  placeholder={copy(
                    locale,
                    "Dispatch impact, spare capacity plan, or workshop remarks",
                    "記錄派車影響、替代運能安排或維修廠備註",
                  )}
                />
              </Field>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 14,
            }}
          >
            <Field theme={theme} label={copy(locale, "Status", "狀態")} required>
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as MaintenanceStatus)
                }
                style={modalInputStyle()}
              >
                {STATUSES.map((entry) => (
                  <option key={entry} value={entry}>
                    {formatOpsCodeLabel(locale, entry)}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              theme={theme}
              label={copy(locale, "Completed time", "完成時間")}
            >
              <input
                type="datetime-local"
                value={completedAt}
                onChange={(event) => setCompletedAt(event.target.value)}
                style={modalInputStyle(true)}
              />
            </Field>
            <Field theme={theme} label={copy(locale, "Technician", "技師")}>
              <input
                value={technician}
                onChange={(event) => setTechnician(event.target.value)}
                style={modalInputStyle()}
              />
            </Field>
            <Field theme={theme} label={copy(locale, "Cost", "費用")}>
              <input
                value={cost}
                onChange={(event) => setCost(event.target.value)}
                style={modalInputStyle(true)}
                inputMode="numeric"
                placeholder="0"
              />
            </Field>
            <div style={{ gridColumn: "1 / -1" }}>
              <Field theme={theme} label={copy(locale, "Notes", "備註")}>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  style={{ ...modalInputStyle(), minHeight: 84, resize: "vertical" }}
                />
              </Field>
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 18,
          }}
        >
          <Btn theme={theme} onClick={onClose}>
            {copy(locale, "Cancel", "取消")}
          </Btn>
          <Btn
            theme={theme}
            variant="primary"
            disabled={pending}
            onClick={() => {
              startTransition(() => {
                void submitEditor();
              });
            }}
          >
            {pending
              ? copy(locale, "Saving…", "儲存中…")
              : state.mode === "create"
                ? copy(locale, "Create record", "建立工單")
                : copy(locale, "Save changes", "儲存變更")}
          </Btn>
        </div>
      </div>
    </ModalFrame>
  );
}

function ConfirmCompleteModal({
  locale,
  state,
  onClose,
  onConfirmed,
}: {
  locale: "en" | "zh";
  state: NonNullable<ConfirmState>;
  onClose: () => void;
  onConfirmed: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <ModalFrame
      title={copy(locale, "Complete maintenance record", "完成保修工單")}
      subtitle={`${state.record.maintenanceId} · ${state.record.vehicleId}`}
    >
      <div style={{ display: "grid", gap: 16 }}>
        <Banner
          theme={theme}
          tone="warn"
          icon="check"
          title={copy(
            locale,
            "This medium-risk action closes the live work order.",
            "這是中風險操作，會直接結束目前工單。",
          )}
          body={copy(
            locale,
            "Use Edit instead if technician, cost, or notes still need adjustment before completion.",
            "如果還要補技師、費用或備註，請改用編輯再完成。",
          )}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 10.5, color: theme.textMuted }}>WO</div>
            <div style={{ fontFamily: theme.monoFamily }}>
              {state.record.maintenanceId}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10.5, color: theme.textMuted }}>
              {copy(locale, "Vehicle", "車輛")}
            </div>
            <div style={{ fontFamily: theme.monoFamily }}>
              {state.record.vehicleId}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10.5, color: theme.textMuted }}>
              {copy(locale, "Scheduled", "排定")}
            </div>
            <div>{formatDateTime(locale, state.record.scheduledAt)}</div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <Btn theme={theme} onClick={onClose}>
            {copy(locale, "Cancel", "取消")}
          </Btn>
          <Btn
            theme={theme}
            variant="primary"
            icon="check"
            disabled={pending}
            onClick={() => {
              startTransition(() => {
                void onConfirmed();
              });
            }}
          >
            {pending
              ? copy(locale, "Completing…", "完成中…")
              : copy(locale, "Confirm complete", "確認完成")}
          </Btn>
        </div>
      </div>
    </ModalFrame>
  );
}

export default function MaintenancePage() {
  const { locale } = useTranslation();
  const searchParams = useSearchParams();
  const forcedEmptyReason = searchParams.get("emptyReason");
  const seededVehicleId = searchParams.get("vehicleId")?.trim() ?? "";

  const [records, setRecords] = useState<MaintenanceRuntimeRecord[]>([]);
  const [listActions, setListActions] = useState<ResourceActionDescriptor[]>([]);
  const [serverEmptyState, setServerEmptyState] =
    useState<EmptyStateEnvelope | null>(null);
  const [vehicles, setVehicles] = useState<VehicleRegistryRecord[]>([]);
  const [refreshMeta, setRefreshMeta] = useState<UiRefreshMetadata | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({
    loading: true,
    refreshing: false,
    errorMessage: null,
    maintenanceIssue: null,
    vehicleIssue: null,
  });
  const [notice, setNotice] = useState<SaveNotice | null>(null);
  const [editorState, setEditorState] = useState<EditorState>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showFilters, setShowFilters] = useState(seededVehicleId.length > 0);
  const [search, setSearch] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState(
    seededVehicleId.length > 0 ? seededVehicleId : "all",
  );
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const hasVehicleProvisioning =
    [...new Set([
      ...vehicles.map((entry) => entry.vehicleId),
      ...records.map((entry) => entry.vehicleId),
    ])].length > 0;
  const createAction = withFleetCreateGuard(
    findAction(listActions, "create_record"),
    hasVehicleProvisioning,
  );
  const refreshAction = findAction(listActions, "refresh");
  const searchAction = findAction(listActions, "search");
  const filterAction = findAction(listActions, "filter");

  const hasStructuredFilters =
    vehicleFilter !== "all" || fromDate !== "" || toDate !== "";
  const hasAnyFilters =
    statusFilter !== "all" || deferredSearch.length > 0 || hasStructuredFilters;
  const freshness = currentFreshness(refreshMeta);
  const refreshTone = freshnessTone(
    refreshMeta ? { ...refreshMeta, dataFreshness: freshness } : null,
  );
  const vehicleOptions = [...new Set([
    ...vehicles.map((entry) => entry.vehicleId),
    ...records.map((entry) => entry.vehicleId),
  ])].sort((left, right) => left.localeCompare(right));

  const loadSnapshot = useEffectEvent(async (mode: "initial" | "manual" | "poll") => {
    setLoadState((current) => ({
      ...current,
      loading: mode === "initial",
      refreshing: mode !== "initial",
      errorMessage: mode === "initial" ? null : current.errorMessage,
      maintenanceIssue: mode === "initial" ? null : current.maintenanceIssue,
      vehicleIssue: mode === "initial" ? null : current.vehicleIssue,
    }));

    const client = getOpsClient();
    const [maintenanceResult, vehicleResult] = await Promise.allSettled([
      client.getMaintenanceView(),
      client.listVehicles(),
    ]);

    const nextRecords =
      maintenanceResult.status === "fulfilled"
        ? maintenanceResult.value.items
        : records;
    const nextListActions =
      maintenanceResult.status === "fulfilled"
        ? maintenanceResult.value.availableActions
        : listActions;
    const nextServerEmptyState =
      maintenanceResult.status === "fulfilled"
        ? maintenanceResult.value.emptyState ?? null
        : serverEmptyState;
    const nextVehicles =
      vehicleResult.status === "fulfilled" ? vehicleResult.value : vehicles;

    setRecords(nextRecords);
    setListActions(nextListActions);
    setServerEmptyState(nextServerEmptyState);
    setVehicles(nextVehicles);

    const maintenanceIssue =
      maintenanceResult.status === "rejected"
        ? normalizeIssue(
            maintenanceResult.reason instanceof Error
              ? maintenanceResult.reason.message
              : String(maintenanceResult.reason ?? UNKNOWN_ERROR),
          )
        : null;
    const vehicleIssue =
      vehicleResult.status === "rejected"
        ? normalizeIssue(
            vehicleResult.reason instanceof Error
              ? vehicleResult.reason.message
              : String(vehicleResult.reason ?? UNKNOWN_ERROR),
          )
        : null;

    const errorMessage =
      maintenanceResult.status === "rejected"
        ? maintenanceResult.reason instanceof Error
          ? maintenanceResult.reason.message
          : String(maintenanceResult.reason ?? UNKNOWN_ERROR)
        : vehicleResult.status === "rejected"
          ? copy(
              locale,
              "Vehicle registry is temporarily unavailable. Filters fall back to IDs already present on maintenance rows.",
              "車輛主檔暫時無法讀取，篩選會退回 maintenance 列表中已出現的車輛編號。",
            )
          : null;

    setLoadState({
      loading: false,
      refreshing: false,
      errorMessage,
      maintenanceIssue,
      vehicleIssue,
    });

    if (maintenanceResult.status === "fulfilled") {
      setRefreshMeta(maintenanceResult.value.refresh);
      return;
    }

    setRefreshMeta(
      refreshMeta
        ? { ...refreshMeta, dataFreshness: "degraded" }
        : {
            generatedAt: new Date().toISOString(),
            staleAfterMs: REFRESH_INTERVAL_MS,
            dataFreshness: "degraded",
            source: "live",
          },
    );
  });

  useEffect(() => {
    void loadSnapshot("initial");
  }, [loadSnapshot]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadSnapshot("poll");
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadSnapshot]);

  const sortedRecords = [...records].sort((left, right) => {
    const priorityDelta = rowPriority(left) - rowPriority(right);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return (
      new Date(filterActivityTimestamp(left) ?? left.updatedAt).getTime() -
      new Date(filterActivityTimestamp(right) ?? right.updatedAt).getTime()
    );
  });

  const filteredRecords = sortedRecords.filter((record) => {
    if (statusFilter !== "all" && effectiveStatus(record) !== statusFilter) {
      return false;
    }
    if (vehicleFilter !== "all" && record.vehicleId !== vehicleFilter) {
      return false;
    }
    if (!dateWithinRange(record, fromDate, toDate)) {
      return false;
    }
    if (!deferredSearch) {
      return true;
    }
    const haystack = [
      record.maintenanceId,
      record.vehicleId,
      record.type,
      record.status,
      record.description,
      record.technician ?? "",
      record.notes ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(deferredSearch);
  });

  const counts = records.reduce<Record<MaintenanceStatus, number>>(
    (accumulator, record) => {
      accumulator[effectiveStatus(record)] += 1;
      return accumulator;
    },
    {
      scheduled: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
      overdue: 0,
    },
  );

  const overdueRecords = records.filter((record) => effectiveStatus(record) === "overdue");
  const freshnessLabel = refreshMeta
    ? copy(
        locale,
        `T3 · ${freshnessLabelCopy(locale, freshness)} · ${formatDateTime(locale, refreshMeta.generatedAt)}`,
        `T3 · ${freshnessLabelCopy(locale, freshness)} · ${formatDateTime(locale, refreshMeta.generatedAt)}`,
      )
    : copy(
        locale,
        `T3 · ${freshnessLabelCopy(locale, "unknown")}`,
        `T3 · ${freshnessLabelCopy(locale, "unknown")}`,
      );

  const statusTabDefs: Array<{
    id: StatusFilter;
    label: string;
    count: number;
    tone?: CanvasTone;
  }> = [
    { id: "all", label: copy(locale, "All", "全部"), count: records.length },
    {
      id: "scheduled",
      label: copy(locale, "Scheduled", "排程中"),
      count: counts.scheduled,
      tone: "warn",
    },
    {
      id: "in_progress",
      label: copy(locale, "In Progress", "進行中"),
      count: counts.in_progress,
      tone: "info",
    },
    {
      id: "overdue",
      label: copy(locale, "Overdue", "逾期"),
      count: counts.overdue,
      tone: "danger",
    },
  ];

  const statusTabs = statusTabDefs.map((tab) => (
    <button
      key={tab.id}
      type="button"
      onClick={() => setStatusFilter(tab.id)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        border: 0,
        background: "transparent",
        color: statusFilter === tab.id ? theme.text : theme.textMuted,
        padding: 0,
        font: "inherit",
        cursor: "pointer",
      }}
    >
      <span>{tab.label}</span>
      <Pill theme={theme} tone={tab.tone ?? "neutral"}>
        {tab.count}
      </Pill>
    </button>
  ));
  const activeTabNode =
    statusTabs[statusTabDefs.findIndex((tab) => tab.id === statusFilter)] ??
    statusTabs[0];

  const forcedReasonIsValid =
    forcedEmptyReason === "no_data" ||
    forcedEmptyReason === "not_provisioned" ||
    forcedEmptyReason === "fetch_failed" ||
    forcedEmptyReason === "permission_denied" ||
    forcedEmptyReason === "external_unavailable" ||
    forcedEmptyReason === "filtered_empty";

  let emptyEnvelope: EmptyStateEnvelope | null = null;
  if (forcedReasonIsValid) {
    emptyEnvelope = createEmptyEnvelope(
      forcedEmptyReason as EmptyReason,
      createAction,
    );
  } else if (!loadState.loading && filteredRecords.length === 0) {
    if (hasAnyFilters) {
      emptyEnvelope = createEmptyEnvelope("filtered_empty", createAction);
    } else if (loadState.maintenanceIssue) {
      emptyEnvelope = createEmptyEnvelope(
        loadState.maintenanceIssue,
        createAction,
      );
    } else if (loadState.vehicleIssue && records.length === 0) {
      emptyEnvelope = createEmptyEnvelope(loadState.vehicleIssue, createAction);
    } else if (records.length === 0 && vehicleOptions.length === 0) {
      emptyEnvelope = createEmptyEnvelope("not_provisioned", createAction);
    } else if (records.length === 0 && serverEmptyState) {
      emptyEnvelope = serverEmptyState;
    } else if (records.length === 0) {
      emptyEnvelope = createEmptyEnvelope("no_data", createAction);
    }
  }

  const tableRows: MaintenanceRow[] = filteredRecords.map((record) => {
    const editAction = findAction(record.availableActions, "edit_record");
    const completeAction = findAction(record.availableActions, "complete_record");
    const vehicleLink = `/vehicles/${encodeURIComponent(record.vehicleId)}`;
    const platformFleetLink: CrossAppResourceLink = {
      targetApp: "platform-admin",
      route: `/fleet?vehicleId=${encodeURIComponent(record.vehicleId)}`,
      resourceType: "vehicle",
      resourceId: record.vehicleId,
      openMode: "new_tab",
      label: copy(locale, "Open in Platform Fleet", "前往 Platform Fleet"),
    };

    return {
      maintenanceId: record.maintenanceId,
      workOrderCell: (
        <div style={{ display: "grid", gap: 3 }}>
          <span
            style={{
              color: theme.accent,
              fontWeight: 700,
              fontFamily: theme.monoFamily,
            }}
          >
            {record.maintenanceId}
          </span>
          <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
            {record.description}
          </span>
        </div>
      ),
      vehicleCell: (
        <div style={{ display: "grid", gap: 4 }}>
          <Link
            href={vehicleLink}
            style={{
              color: theme.text,
              textDecoration: "none",
              fontFamily: theme.monoFamily,
              fontWeight: 600,
            }}
          >
            {record.vehicleId}
          </Link>
          <a
            href={resolveCrossAppHref(platformFleetLink)}
            target="_blank"
            rel="noreferrer"
            style={{
              color: theme.accent,
              textDecoration: "none",
              fontSize: 11.5,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <CanvasIcon name="ext" size={12} />
            {copy(locale, "Fleet", "Fleet")}
          </a>
        </div>
      ),
      kindCell: (
        <div style={{ display: "grid", gap: 4 }}>
          <span>{formatOpsCodeLabel(locale, record.type)}</span>
          {effectiveStatus(record) === "overdue" ? (
            <Pill theme={theme} tone="danger">
              {copy(locale, "Dispatch impact", "影響派遣")}
            </Pill>
          ) : null}
        </div>
      ),
      statusCell: (
        <Pill theme={theme} tone={rowStatusTone(record)} dot>
          {formatOpsCodeLabel(locale, effectiveStatus(record))}
        </Pill>
      ),
      scheduleCell: (
        <div style={{ display: "grid", gap: 3 }}>
          <span style={{ fontFamily: theme.monoFamily }}>
            {formatDateTime(locale, record.scheduledAt)}
          </span>
          <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
            {copy(locale, "Completed", "完成")} ·{" "}
            {formatDateTime(locale, record.completedAt)}
          </span>
        </div>
      ),
      technicianCell: (
        <div style={{ display: "grid", gap: 3 }}>
          <span>{record.technician ?? "—"}</span>
          <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
            {copy(locale, "Updated", "更新")} ·{" "}
            {formatDateTime(locale, record.updatedAt)}
          </span>
        </div>
      ),
      costCell: (
        <span style={{ fontFamily: theme.monoFamily }}>
          {formatMoney(record.cost)}
        </span>
      ),
      actionsCell: (
        editAction || completeAction ? (
          <div style={{ display: "flex", gap: 6 }}>
            {editAction ? (
              <span title={buttonTitle(locale, editAction)}>
                <Btn
                  theme={theme}
                  size="xs"
                  disabled={!editAction.enabled}
                  onClick={() => {
                    if (editAction.enabled) {
                      setEditorState({ mode: "edit", record });
                    }
                  }}
                  style={{ minWidth: 58 }}
                >
                  {actionButtonLabel(locale, editAction.action)}
                </Btn>
              </span>
            ) : null}
            {completeAction ? (
              <span title={buttonTitle(locale, completeAction)}>
                <Btn
                  theme={theme}
                  size="xs"
                  disabled={!completeAction.enabled}
                  icon="check"
                  onClick={() => {
                    if (completeAction.enabled) {
                      setConfirmState({
                        action: "complete",
                        descriptor: completeAction,
                        record,
                      });
                    }
                  }}
                  style={{ minWidth: 68 }}
                >
                  {actionButtonLabel(locale, completeAction.action)}
                </Btn>
              </span>
            ) : null}
          </div>
        ) : (
          <span style={{ color: theme.textMuted }}>—</span>
        )
      ),
    };
  });

  const tableColumns: CanvasTableColumn<MaintenanceRow>[] = [
    { h: "WO", w: 112, mono: true, r: (row) => row.workOrderCell },
    {
      h: copy(locale, "Vehicle", "車輛"),
      w: 130,
      mono: true,
      r: (row) => row.vehicleCell,
    },
    { h: copy(locale, "Category", "類別"), w: 180, r: (row) => row.kindCell },
    { h: "STATUS", w: 128, r: (row) => row.statusCell },
    { h: copy(locale, "Scheduled", "排定"), w: 168, mono: true, r: (row) => row.scheduleCell },
    { h: copy(locale, "Technician", "技師"), w: 142, r: (row) => row.technicianCell },
    {
      h: copy(locale, "Cost", "費用"),
      w: 118,
      mono: true,
      align: "right",
      r: (row) => row.costCell,
    },
    { h: "ACTIONS", w: 152, r: (row) => row.actionsCell },
  ];

  async function refreshNow() {
    setNotice(null);
    await loadSnapshot("manual");
  }

  async function handleComplete(record: MaintenanceRuntimeRecord) {
    try {
      const client = getOpsClient();
      const result = await client.updateMaintenance(record.maintenanceId, {
        status: "completed",
      });
      setConfirmState(null);
      setNotice(
        withReceiptNotice(
          locale,
          {
            tone: "success",
            title: copy(locale, "Work order completed", "工單已標記完成"),
            body: copy(
              locale,
              "The maintenance queue will refresh with the updated dispatch state.",
              "保修隊列會以新的派車狀態重新整理。",
            ),
          },
          result.receipt,
        ),
      );
      await loadSnapshot("manual");
    } catch (caught) {
      setConfirmState(null);
      setNotice({
        tone: "danger",
        title:
          caught instanceof Error ? caught.message : UNKNOWN_ERROR,
      });
    }
  }

  function clearFilters() {
    setStatusFilter("all");
    setSearch("");
    setVehicleFilter("all");
    setFromDate("");
    setToDate("");
    setShowFilters(false);
  }

  function handleEmptyStateAction(action: ResourceActionDescriptor) {
    switch (action.action) {
      case "create_record":
        if (action.enabled) {
          setEditorState({ mode: "create" });
        }
        return;
      case "refresh":
        void refreshNow();
        return;
      case "clear_filters":
        clearFilters();
        return;
      case "open_platform_fleet":
        window.open(
          resolveCrossAppHref({
            targetApp: "platform-admin",
            route: "/fleet",
            resourceType: "vehicle",
            resourceId: "fleet",
            openMode: "new_tab",
            label: "fleet",
          }),
          "_blank",
          "noopener,noreferrer",
        );
        return;
      default:
        return;
    }
  }

  const platformFleetLink: CrossAppResourceLink = {
    targetApp: "platform-admin",
    route: "/fleet",
    resourceType: "vehicle",
    resourceId: "fleet",
    openMode: "new_tab",
    label: copy(locale, "Platform Fleet", "Platform Fleet"),
  };

  return (
    <>
      <PageHeader
        theme={theme}
        title={copy(locale, "Vehicle Maintenance", "車輛保修")}
        subtitle={copy(
          locale,
          "Work orders · schedules · technicians · dispatch impact",
          "工單 · 排程 · 技師 · 影響派遣",
        )}
        tabs={statusTabs}
        activeTab={activeTabNode}
        actions={
          <>
            <Pill theme={theme} tone={refreshTone}>
              {freshnessLabel}
            </Pill>
            {refreshAction ? (
              <Btn
                theme={theme}
                icon={refreshIcon()}
                disabled={!refreshAction.enabled || loadState.refreshing}
                onClick={() => void refreshNow()}
              >
                {loadState.refreshing
                  ? copy(locale, "Refreshing…", "重整中…")
                  : copy(locale, "Refresh", "重整")}
              </Btn>
            ) : null}
            {createAction ? (
              <span title={buttonTitle(locale, createAction)}>
                <Btn
                  theme={theme}
                  variant="primary"
                  icon="plus"
                  disabled={!createAction.enabled}
                  onClick={() => {
                    if (createAction.enabled) {
                      setEditorState({ mode: "create" });
                    }
                  }}
                >
                  {copy(locale, "Create work order", "開立工單")}
                </Btn>
              </span>
            ) : null}
          </>
        }
      />

      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {notice ? (
          <Banner
            theme={theme}
            tone={notice.tone}
            icon={notice.tone === "danger" ? "warn" : "check"}
            title={notice.title}
            body={notice.body}
            actions={
              notice.receipt ? (
                <a
                  href={resolveCrossAppHref(
                    buildAuditLink(locale, notice.receipt.auditId),
                  )}
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: "none" }}
                >
                  <Btn theme={theme} icon="ext">
                    {copy(locale, "View audit", "查看稽核")}
                  </Btn>
                </a>
              ) : undefined
            }
          />
        ) : null}

        {freshness === "stale" || freshness === "degraded" ? (
          <Banner
            theme={theme}
            tone={freshness === "degraded" ? "danger" : "warn"}
            icon={refreshIcon(15)}
            title={copy(
              locale,
              freshness === "degraded"
                ? "Live maintenance data is degraded"
                : "Maintenance snapshot is stale",
              freshness === "degraded"
                ? "目前保修 live 資料處於 degraded 狀態"
                : "目前保修快照已過舊",
            )}
            body={
              loadState.errorMessage ??
              copy(
                locale,
                "Retry the T3 feed before using this page to decide dispatchable supply.",
                "在用這頁做派車供給判斷前，請先重整 T3 feed。",
              )
            }
            actions={
              <Btn theme={theme} variant="primary" onClick={() => void refreshNow()}>
                {copy(locale, "Retry now", "立即重試")}
              </Btn>
            }
          />
        ) : null}

        {overdueRecords.length > 0 ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={copy(
              locale,
              `${overdueRecords.length} overdue maintenance record(s) are affecting dispatch supply`,
              `${overdueRecords.length} 筆逾期保修工單正在影響派車供給`,
            )}
            body={copy(
              locale,
              "Use the overdue tab to isolate vehicles that should stay out of the dispatchable pool until workshop handling is complete.",
              "請切到逾期分頁，優先隔離應該暫時退出 dispatchable pool 的車輛。",
            )}
            actions={
              <>
                <Btn
                  theme={theme}
                  variant="primary"
                  onClick={() => setStatusFilter("overdue")}
                >
                  {copy(locale, "Show overdue", "只看逾期")}
                </Btn>
                <a
                  href={resolveCrossAppHref(platformFleetLink)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: "none" }}
                >
                  <Btn theme={theme} icon="ext">
                    {copy(locale, "Open Platform Fleet", "前往 Platform Fleet")}
                  </Btn>
                </a>
              </>
            }
          />
        ) : null}

        <Card theme={theme} title={copy(locale, "Search & filters", "搜尋與篩選")}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.6fr) auto auto",
              gap: 10,
              alignItems: "center",
            }}
          >
            {searchAction ? (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 10px",
                  borderRadius: 7,
                  border: `1px solid ${theme.border}`,
                  background: theme.bgRaised,
                }}
              >
                <CanvasIcon
                  name="search"
                  size={14}
                  style={{ color: theme.textDim }}
                />
                <input
                  value={search}
                  onChange={(event) => {
                    if (searchAction.enabled) {
                      setSearch(event.target.value);
                    }
                  }}
                  disabled={!searchAction.enabled}
                  placeholder={copy(
                    locale,
                    "Search work order, vehicle, technician, or notes",
                    "搜尋工單、車輛、技師或備註",
                  )}
                  style={{
                    flex: 1,
                    border: 0,
                    outline: "none",
                    background: "transparent",
                    color: theme.text,
                    fontSize: 12.5,
                  }}
                />
              </label>
            ) : (
              <div style={{ color: theme.textMuted, fontSize: 12 }}>
                {copy(
                  locale,
                  "Search is not available for this maintenance view.",
                  "此 maintenance 視圖目前不提供搜尋。",
                )}
              </div>
            )}
            {filterAction ? (
              <Btn
                theme={theme}
                icon="filter"
                disabled={!filterAction.enabled}
                onClick={() => setShowFilters((current) => !current)}
              >
                {showFilters
                  ? copy(locale, "Hide filters", "收合篩選")
                  : copy(locale, "Filter", "篩選")}
              </Btn>
            ) : null}
            <a
              href={resolveCrossAppHref(platformFleetLink)}
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: "none" }}
            >
              <Btn theme={theme} icon="ext">
                {copy(locale, "Platform Fleet", "Platform Fleet")}
              </Btn>
            </a>
          </div>

          {filterAction && showFilters ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: 12,
                marginTop: 14,
              }}
            >
              <div>
                <div
                  style={{
                    marginBottom: 5,
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: theme.text,
                  }}
                >
                  {copy(locale, "Vehicle", "車輛")}
                </div>
                <select
                  value={vehicleFilter}
                  onChange={(event) => setVehicleFilter(event.target.value)}
                  style={modalInputStyle(true)}
                >
                  <option value="all">{copy(locale, "All vehicles", "全部車輛")}</option>
                  {vehicleOptions.map((vehicleId) => (
                    <option key={vehicleId} value={vehicleId}>
                      {vehicleId}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div
                  style={{
                    marginBottom: 5,
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: theme.text,
                  }}
                >
                  {copy(locale, "From", "開始日期")}
                </div>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  style={modalInputStyle(true)}
                />
              </div>
              <div>
                <div
                  style={{
                    marginBottom: 5,
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: theme.text,
                  }}
                >
                  {copy(locale, "To", "結束日期")}
                </div>
                <input
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  style={modalInputStyle(true)}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "flex-end",
                }}
              >
                <Btn theme={theme} onClick={clearFilters}>
                  {copy(locale, "Clear filters", "清除篩選")}
                </Btn>
              </div>
            </div>
          ) : null}
        </Card>

        <Card
          theme={theme}
          title={copy(locale, "Maintenance work orders", "保修工單")}
          subtitle={copy(
            locale,
            `${filteredRecords.length} visible of ${records.length} total · T3 · 15s`,
            `顯示 ${filteredRecords.length} / ${records.length} 筆 · T3 · 15 秒`,
          )}
          padding={0}
        >
          {loadState.loading ? (
            <div
              style={{
                padding: "26px 24px",
                color: theme.textMuted,
                fontSize: 12.5,
              }}
            >
              {copy(locale, "Loading maintenance queue…", "保修隊列載入中…")}
            </div>
          ) : emptyEnvelope ? (
            <MaintenanceEmptyState
              locale={locale}
              envelope={emptyEnvelope}
              onAction={handleEmptyStateAction}
            />
          ) : (
            <Table theme={theme} columns={tableColumns} rows={tableRows} />
          )}
        </Card>
      </div>

      {editorState ? (
        <MaintenanceEditorModal
          locale={locale}
          state={editorState}
          vehicleIds={vehicleOptions}
          onClose={() => setEditorState(null)}
          onSaved={async (nextNotice) => {
            setNotice(nextNotice);
            await loadSnapshot("manual");
          }}
        />
      ) : null}

      {confirmState ? (
        <ConfirmCompleteModal
          locale={locale}
          state={confirmState}
          onClose={() => setConfirmState(null)}
          onConfirmed={() => handleComplete(confirmState.record)}
        />
      ) : null}
    </>
  );
}
