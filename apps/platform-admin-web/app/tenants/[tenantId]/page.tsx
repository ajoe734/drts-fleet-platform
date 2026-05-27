"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EMPTY_ONBOARDING_FORM,
  EMPTY_TENANT_FORM,
  createTenantModuleLabels,
  parseCsv,
  parseQuota,
  tenantStageTone,
  tenantStatusTone,
  toTenantOnboardingFormState,
  toTenantSettingsFormState,
  toggleTenantModule,
  type OnboardingFormState,
  type TenantFormState,
} from "@/components/tenant-governance-shared";
import {
  formatDateTime,
  truncate,
  usePlatformAdminClient,
} from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type {
  AuditLogRecord,
  EmptyReason,
  PartnerChannelEntryRecord,
  PlatformAdminTenantRecord,
  PlatformTenantRolloutStage,
  ResourceActionDescriptor,
  SetPlatformTenantRolloutStageCommand,
  UpdatePlatformTenantOnboardingCommand,
  UpdatePlatformTenantSettingsCommand,
} from "@drts/contracts";
import {
  PLATFORM_TENANT_INTEGRATION_MODES,
  PLATFORM_TENANT_MODULES,
  PLATFORM_TENANT_ROLLOUT_STAGES,
} from "@drts/contracts";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

type TenantWorkspaceEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;

type TenantDetailRecord = PlatformAdminTenantRecord & {
  availableActions?: ResourceActionDescriptor[];
};

type TenantActionKey =
  | "updateSettings"
  | "updateTenantSettings"
  | "updateOnboarding"
  | "updateTenantOnboarding"
  | "inviteTenantRole"
  | "acknowledgeTenantRole"
  | "setRolloutStage"
  | "activateTenant"
  | "suspendTenant"
  | "enterRollbackHold"
  | "rollbackHoldTenant"
  | "openOpsConsole";

type TenantSection = "settings" | "onboarding" | "roles" | "audit";

type AuditRow = AuditLogRecord & Record<string, unknown>;
type PartnerRow = PartnerChannelEntryRecord & Record<string, unknown>;

const theme = buildCanvasTheme({
  surface: "platform",
  dark: true,
  density: "compact",
});

const REFRESH_TIER = {
  label: "T4",
  cadenceMs: 30_000,
  copy: "30s live refresh",
} as const;

const pageShellStyle = {
  minHeight: "100%",
  background: theme.bg,
  color: theme.text,
} satisfies React.CSSProperties;

const pageBodyStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies React.CSSProperties;

const heroGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.45fr) minmax(320px, 1fr)",
  gap: 16,
  alignItems: "start",
} satisfies React.CSSProperties;

const sectionGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
  alignItems: "start",
} satisfies React.CSSProperties;

const triGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16,
} satisfies React.CSSProperties;

const sideStackStyle = {
  display: "grid",
  gap: 16,
} satisfies React.CSSProperties;

const actionStackStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
} satisfies React.CSSProperties;

const pillRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
} satisfies React.CSSProperties;

const stageRailStyle = {
  display: "grid",
  gap: 10,
} satisfies React.CSSProperties;

const stageCardStyle = (tone: CanvasTone, active: boolean) =>
  ({
    display: "grid",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 10,
    border: `1px solid ${active ? theme.accent : theme.border}`,
    background:
      tone === "danger"
        ? theme.dangerBg
        : active
          ? theme.accentBg
          : theme.surface,
  }) satisfies React.CSSProperties;

const roleCardStyle = {
  display: "grid",
  gap: 10,
  padding: "12px 14px",
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
} satisfies React.CSSProperties;

const emptyStateStyle = {
  display: "grid",
  placeItems: "center",
  minHeight: 180,
  padding: "24px 20px",
  borderRadius: 10,
  border: `1px dashed ${theme.border}`,
  background: theme.surfaceLo,
  textAlign: "center",
} satisfies React.CSSProperties;

const subtleTextStyle = {
  color: theme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.5,
} satisfies React.CSSProperties;

const monoTextStyle = {
  fontFamily: theme.monoFamily,
  fontSize: 11.5,
} satisfies React.CSSProperties;

const inputStyle = {
  width: "100%",
  minHeight: 32,
  boxSizing: "border-box",
  padding: "7px 10px",
  borderRadius: 7,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontSize: 12.5,
  fontFamily: theme.fontFamily,
} satisfies React.CSSProperties;

const monoInputStyle = {
  ...inputStyle,
  fontFamily: theme.monoFamily,
} satisfies React.CSSProperties;

const textareaStyle = {
  ...inputStyle,
  minHeight: 108,
  resize: "vertical",
} satisfies React.CSSProperties;

const checkboxRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 32,
  color: theme.text,
  fontSize: 12.5,
} satisfies React.CSSProperties;

const linkStyle = {
  color: theme.accent,
  textDecoration: "none",
} satisfies React.CSSProperties;

const disabledNoteStyle = {
  marginTop: 4,
  color: theme.textDim,
  fontSize: 11,
} satisfies React.CSSProperties;

function toCanvasTone(
  tone:
    | ReturnType<typeof tenantStageTone>
    | ReturnType<typeof tenantStatusTone>,
): CanvasTone {
  if (tone === "warning") {
    return "warn";
  }
  return tone;
}

function getOpsConsoleBaseUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin.replace(":3102", ":3101");
  }
  return "http://localhost:3101";
}

function actionAliases(action: TenantActionKey): readonly string[] {
  switch (action) {
    case "updateSettings":
      return ["updateSettings", "updateTenantSettings"];
    case "updateTenantSettings":
      return ["updateTenantSettings", "updateSettings"];
    case "updateOnboarding":
      return ["updateOnboarding", "updateTenantOnboarding"];
    case "updateTenantOnboarding":
      return ["updateTenantOnboarding", "updateOnboarding"];
    case "inviteTenantRole":
      return ["inviteTenantRole"];
    case "acknowledgeTenantRole":
      return ["acknowledgeTenantRole"];
    case "setRolloutStage":
      return ["setRolloutStage"];
    case "activateTenant":
      return ["activateTenant"];
    case "suspendTenant":
      return ["suspendTenant", "suspend"];
    case "enterRollbackHold":
      return ["enterRollbackHold", "rollbackHoldTenant"];
    case "rollbackHoldTenant":
      return ["rollbackHoldTenant", "enterRollbackHold"];
    case "openOpsConsole":
      return ["openOpsConsole"];
    default:
      return [action];
  }
}

function findActionDescriptor(
  actions: readonly ResourceActionDescriptor[] | undefined,
  action: TenantActionKey,
) {
  const aliases = actionAliases(action);
  return actions?.find((descriptor) => aliases.includes(descriptor.action));
}

function isActionVisible(
  actions: readonly ResourceActionDescriptor[] | undefined,
  action: TenantActionKey,
) {
  return Boolean(findActionDescriptor(actions, action));
}

function formatNumber(locale: string, value: number) {
  return value.toLocaleString(locale === "en" ? "en-US" : "zh-TW");
}

function buildEmptyStateCopy(
  locale: string,
  reason: TenantWorkspaceEmptyReason,
): { title: string; body: string; tone: CanvasTone } {
  const en = locale === "en";
  switch (reason) {
    case "not_provisioned":
      return {
        title: en ? "Not provisioned yet" : "尚未完成配置",
        body: en
          ? "This workspace is waiting on prerequisite setup before data can appear."
          : "這個工作區還在等待前置設定完成，資料尚未能顯示。",
        tone: "warn",
      };
    case "fetch_failed":
      return {
        title: en ? "Fetch failed" : "讀取失敗",
        body: en
          ? "The service did not return data. Refresh after the upstream issue is resolved."
          : "服務沒有回傳資料。請在上游問題排除後重新整理。",
        tone: "danger",
      };
    case "permission_denied":
      return {
        title: en ? "Read only for this actor" : "目前角色無權檢視",
        body: en
          ? "The current actor can access the tenant shell but not this section's records."
          : "目前角色可進入租戶工作區，但無法讀取這個區塊的資料。",
        tone: "neutral",
      };
    case "external_unavailable":
      return {
        title: en ? "External dependency unavailable" : "外部相依服務不可用",
        body: en
          ? "This section depends on an external system that is currently degraded."
          : "這個區塊依賴的外部系統目前降級或不可用。",
        tone: "warn",
      };
    case "filtered_empty":
      return {
        title: en
          ? "No matches for the current filter"
          : "目前篩選條件沒有結果",
        body: en
          ? "Clear the filter or open the full dataset to continue triage."
          : "請清除篩選條件，或開啟完整資料集後再繼續檢視。",
        tone: "info",
      };
    case "no_data":
    default:
      return {
        title: en ? "No records yet" : "目前沒有資料",
        body: en
          ? "The section is healthy, but no records have been created for this tenant yet."
          : "這個區塊本身正常，只是此 tenant 目前尚未產生資料。",
        tone: "neutral",
      };
  }
}

function EmptyReasonState({
  locale,
  reason,
  action,
}: {
  locale: string;
  reason: TenantWorkspaceEmptyReason;
  action?: React.ReactNode;
}) {
  const copy = buildEmptyStateCopy(locale, reason);
  return (
    <div style={emptyStateStyle}>
      <div style={{ display: "grid", gap: 8, maxWidth: 360 }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Pill theme={theme} tone={copy.tone}>
            {reason}
          </Pill>
        </div>
        <strong style={{ color: theme.text }}>{copy.title}</strong>
        <div style={subtleTextStyle}>{copy.body}</div>
        {action ? (
          <div style={{ display: "flex", justifyContent: "center" }}>
            {action}
          </div>
        ) : null}
      </div>
    </div>
  );
}

async function requestActionReason(
  descriptor: ResourceActionDescriptor | undefined,
  label: string,
) {
  const needsReason =
    descriptor?.requiresReason || descriptor?.riskLevel === "high";
  if (!needsReason) {
    const confirmed = window.confirm(label);
    return confirmed ? "" : null;
  }

  const reason = window.prompt(`${label}\n\nReason`);
  if (reason === null) {
    return null;
  }
  const trimmed = reason.trim();
  if (!trimmed) {
    window.alert("Reason is required.");
    return null;
  }
  return trimmed;
}

export default function TenantDetailPage() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = Array.isArray(params?.tenantId)
    ? params.tenantId[0]
    : (params?.tenantId ?? "");
  const client = usePlatformAdminClient();
  const { locale } = useTranslation();
  const moduleLabels = useMemo(
    () =>
      createTenantModuleLabels((key: string) => {
        if (locale === "en") {
          const enMap: Record<string, string> = {
            "tenants.module.enterpriseDispatch": "Enterprise dispatch",
            "tenants.module.billing": "Billing",
            "tenants.module.reporting": "Reporting",
            "tenants.module.webhooks": "Webhooks",
          };
          return enMap[key] ?? key;
        }
        const zhMap: Record<string, string> = {
          "tenants.module.enterpriseDispatch": "企業派遣",
          "tenants.module.billing": "帳務",
          "tenants.module.reporting": "報表",
          "tenants.module.webhooks": "Webhooks",
        };
        return zhMap[key] ?? key;
      }),
    [locale],
  );

  const copy =
    locale === "en"
      ? {
          title: "Tenant detail / rollout workspace",
          subtitle:
            "Run sandbox to production promotion, role acknowledgements, readiness checks, and rollback controls from one control-plane workspace.",
          back: "Back to tenants",
          refresh: "Refresh",
          unavailableTitle: "Tenant unavailable",
          unavailableBody:
            "The tenant could not be loaded or no longer exists.",
          rollbackTitle: "Rollback hold is active",
          rollbackBody:
            "Review ops impact, cutover ownership, rollback preparation, and recent audit evidence before restoring rollout flow.",
          readOnlyTitle: "Action scope is read-only",
          readOnlyBody:
            "This actor can inspect the tenant workspace, but write CTAs are controlled by backend availableActions.",
          refreshLabel: "Refresh tier",
          refreshValue: `${REFRESH_TIER.label} · ${REFRESH_TIER.copy}`,
          opsLink: "Open ops-console",
          linkedPartners: "Linked partner entries",
          linkedPartnersHint:
            "Cross-app and cross-domain dependencies attached to this tenant's lifecycle.",
          auditTitle: "Recent governance activity",
          auditHint:
            "Audit subset for this tenant only. Filters stay local to this page.",
          filters: "Filter activity",
          noRoleAction: "Role action unavailable for the current actor.",
          saveSettings: "Save settings",
          saveOnboarding: "Save onboarding package",
          promote: "Promote",
          activate: "Activate",
          suspend: "Suspend",
          rollback: "Enter rollback hold",
          invite: "Invite",
          acknowledge: "Acknowledge",
          roleRequired: "Required",
          roleOptional: "Optional",
          stageReady: "ready for promotion",
          stageBlocked: "blocked",
        }
      : {
          title: "Tenant 詳情 / rollout 工作區",
          subtitle:
            "在同一個 control-plane 工作區內處理 sandbox 到 production promotion、角色確認、readiness 檢查與 rollback 控制。",
          back: "返回租戶列表",
          refresh: "重新整理",
          unavailableTitle: "租戶目前不可用",
          unavailableBody: "無法載入此租戶，或租戶已不存在。",
          rollbackTitle: "Rollback hold 已啟用",
          rollbackBody:
            "恢復 rollout flow 前，先檢查 ops 影響、cutover owner、rollback 準備度與最近 audit 證據。",
          readOnlyTitle: "目前只有唯讀權限",
          readOnlyBody:
            "這個 actor 可以查看 tenant 工作區，但所有寫入 CTA 都由 backend `availableActions` 控制。",
          refreshLabel: "Refresh tier",
          refreshValue: `${REFRESH_TIER.label} · ${REFRESH_TIER.copy}`,
          opsLink: "開啟 ops-console",
          linkedPartners: "已連結的 partner entries",
          linkedPartnersHint:
            "此 tenant lifecycle 綁定的跨系統與跨 partner 相依項。",
          auditTitle: "最近治理活動",
          auditHint: "只顯示此 tenant 的 audit subset。篩選只影響本頁。",
          filters: "篩選活動",
          noRoleAction: "目前角色沒有這個 role action。",
          saveSettings: "儲存設定",
          saveOnboarding: "儲存 onboarding package",
          promote: "推進 stage",
          activate: "啟用",
          suspend: "暫停",
          rollback: "進入 rollback hold",
          invite: "邀請",
          acknowledge: "確認",
          roleRequired: "必要",
          roleOptional: "選填",
          stageReady: "可推進",
          stageBlocked: "已阻擋",
        };

  const [tenant, setTenant] = useState<TenantDetailRecord | null>(null);
  const [auditRecords, setAuditRecords] = useState<AuditLogRecord[]>([]);
  const [partnerEntries, setPartnerEntries] = useState<
    PartnerChannelEntryRecord[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [partnerError, setPartnerError] = useState<string | null>(null);
  const [settingsForm, setSettingsForm] =
    useState<TenantFormState>(EMPTY_TENANT_FORM);
  const [onboardingForm, setOnboardingForm] = useState<OnboardingFormState>(
    EMPTY_ONBOARDING_FORM,
  );
  const [savingSection, setSavingSection] = useState<TenantSection | null>(
    null,
  );
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [activityFilter, setActivityFilter] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const loadTenant = useCallback(async () => {
    if (!tenantId) {
      setTenant(null);
      setAuditRecords([]);
      setPartnerEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const tenantResult = await client
      .getPlatformTenant(tenantId)
      .then((record) => ({
        ok: true as const,
        record: record as TenantDetailRecord,
      }))
      .catch((err: unknown) => ({
        ok: false as const,
        message: err instanceof Error ? err.message : String(err),
      }));

    if (!tenantResult.ok) {
      setTenant(null);
      setAuditRecords([]);
      setPartnerEntries([]);
      setError(tenantResult.message);
      setLoading(false);
      return;
    }

    const record = tenantResult.record;
    setTenant(record);
    setSettingsForm(toTenantSettingsFormState(record));
    setOnboardingForm(toTenantOnboardingFormState(record));

    const [auditResult, partnerResult] = await Promise.allSettled([
      client.listAuditLogs() as Promise<AuditLogRecord[]>,
      client.listPlatformPartnerEntries(),
    ]);

    if (auditResult.status === "fulfilled") {
      setAuditError(null);
      setAuditRecords(
        auditResult.value
          .filter((entry) => entry.tenantId === record.id)
          .sort(
            (left, right) =>
              new Date(right.createdAt).getTime() -
              new Date(left.createdAt).getTime(),
          ),
      );
    } else {
      setAuditError(
        auditResult.reason instanceof Error
          ? auditResult.reason.message
          : String(auditResult.reason),
      );
      setAuditRecords([]);
    }

    if (partnerResult.status === "fulfilled") {
      setPartnerError(null);
      setPartnerEntries(
        partnerResult.value.filter((entry) => entry.tenantId === record.id),
      );
    } else {
      setPartnerError(
        partnerResult.reason instanceof Error
          ? partnerResult.reason.message
          : String(partnerResult.reason),
      );
      setPartnerEntries([]);
    }

    setLastRefreshedAt(new Date().toISOString());
    setLoading(false);
  }, [client, tenantId]);

  useEffect(() => {
    void loadTenant();
  }, [loadTenant]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadTenant();
    }, REFRESH_TIER.cadenceMs);
    return () => window.clearInterval(timer);
  }, [loadTenant]);

  const availableActions = tenant?.availableActions ?? [];
  const settingsAction = findActionDescriptor(
    availableActions,
    "updateSettings",
  );
  const onboardingAction = findActionDescriptor(
    availableActions,
    "updateOnboarding",
  );
  const stageAction = findActionDescriptor(availableActions, "setRolloutStage");
  const activateAction = findActionDescriptor(
    availableActions,
    "activateTenant",
  );
  const suspendAction = findActionDescriptor(availableActions, "suspendTenant");
  const rollbackAction = findActionDescriptor(
    availableActions,
    "enterRollbackHold",
  );
  const inviteAction = findActionDescriptor(
    availableActions,
    "inviteTenantRole",
  );
  const acknowledgeAction = findActionDescriptor(
    availableActions,
    "acknowledgeTenantRole",
  );

  const roleCounts = useMemo(() => {
    if (!tenant) {
      return { required: 0, invited: 0, acknowledged: 0 };
    }
    return {
      required: tenant.bootstrapDefaults.roleDefaults.filter(
        (role) => role.required,
      ).length,
      invited: tenant.bootstrapDefaults.roleDefaults.filter(
        (role) => role.invitedAt,
      ).length,
      acknowledged: tenant.bootstrapDefaults.roleDefaults.filter(
        (role) => role.acknowledgedAt,
      ).length,
    };
  }, [tenant]);

  const auditRows = useMemo(() => {
    const filtered = auditRecords.filter((entry) => {
      if (!activityFilter.trim()) {
        return true;
      }
      const haystack = [
        entry.moduleName,
        entry.actionName,
        entry.resourceType,
        entry.resourceId,
        entry.requestId ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(activityFilter.trim().toLowerCase());
    });
    return filtered.slice(0, 8);
  }, [activityFilter, auditRecords]);

  const auditColumns = useMemo<CanvasTableColumn<AuditRow>[]>(
    () => [
      {
        h: locale === "en" ? "Time" : "時間",
        w: 170,
        r: (row) => formatDateTime(row.createdAt),
      },
      {
        h: locale === "en" ? "Module" : "模組",
        w: 140,
        r: (row) => row.moduleName,
      },
      {
        h: locale === "en" ? "Action" : "動作",
        w: 200,
        r: (row) => row.actionName,
      },
      {
        h: locale === "en" ? "Resource" : "資源",
        r: (row) => (
          <div style={{ display: "grid", gap: 2 }}>
            <span>{row.resourceType}</span>
            <span style={monoTextStyle}>
              {truncate(row.resourceId ?? "", 28)}
            </span>
          </div>
        ),
      },
      {
        h: "Request",
        w: 170,
        mono: true,
        r: (row) => row.requestId ?? "—",
      },
    ],
    [locale],
  );

  const partnerColumns = useMemo<CanvasTableColumn<PartnerRow>[]>(
    () => [
      {
        h: locale === "en" ? "Entry" : "入口",
        r: (row) => (
          <div style={{ display: "grid", gap: 2 }}>
            <Link href={`/partners/${row.entrySlug}`} style={linkStyle}>
              {row.displayName}
            </Link>
            <span style={monoTextStyle}>{row.entrySlug}</span>
          </div>
        ),
      },
      {
        h: locale === "en" ? "Partner" : "夥伴",
        w: 180,
        r: (row) => `${row.partnerCode} · ${row.partnerType}`,
      },
      {
        h: locale === "en" ? "Subtype" : "類型",
        w: 170,
        r: (row) =>
          formatPlatformCodeLabel(locale, row.businessDispatchSubtype),
      },
      {
        h: locale === "en" ? "Status" : "狀態",
        w: 130,
        r: (row) => (
          <Pill
            theme={theme}
            tone={
              row.activeFlag ? "success" : row.revokedAt ? "danger" : "warn"
            }
          >
            {formatPlatformCodeLabel(locale, row.status)}
          </Pill>
        ),
      },
    ],
    [locale],
  );

  const opsConsoleHref = tenant
    ? `${getOpsConsoleBaseUrl()}/dispatch?tenantId=${encodeURIComponent(tenant.id)}`
    : "#";

  const handleSaveSettings = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!tenant || !settingsAction?.enabled) {
        return;
      }

      setSavingSection("settings");
      setError(null);
      try {
        const command: UpdatePlatformTenantSettingsCommand = {
          name: settingsForm.name,
          enabledModules: settingsForm.enabledModules,
          quotas: {
            activeDrivers: parseQuota(settingsForm.activeDrivers),
            monthlyBookings: parseQuota(settingsForm.monthlyBookings),
            monthlyApiCalls: parseQuota(settingsForm.monthlyApiCalls),
          },
        };
        await client.updatePlatformTenantSettings(tenant.id, command);
        await loadTenant();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSavingSection(null);
      }
    },
    [client, loadTenant, settingsAction?.enabled, settingsForm, tenant],
  );

  const handleSaveOnboarding = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!tenant || !onboardingAction?.enabled) {
        return;
      }

      setSavingSection("onboarding");
      setError(null);
      try {
        const command: UpdatePlatformTenantOnboardingCommand = {
          billingBaseline: {
            invoiceTitle: onboardingForm.invoiceTitle,
            contactName: onboardingForm.billingContactName,
            email: onboardingForm.billingContactEmail,
          },
          roleDefaults: tenant.bootstrapDefaults.roleDefaults,
          notificationSubscriptions:
            tenant.bootstrapDefaults.notificationSubscriptions,
          webhookEvents: parseCsv(onboardingForm.webhookEvents),
          integrationPackage: {
            mode: onboardingForm.integrationMode,
            apiKeyScopes: parseCsv(onboardingForm.apiKeyScopes),
            sandboxBaseUrl: onboardingForm.sandboxBaseUrl || null,
            productionBaseUrl: onboardingForm.productionBaseUrl || null,
          },
          rollout: {
            cutoverOwner: onboardingForm.cutoverOwner || null,
            rollbackOwner: onboardingForm.rollbackOwner || null,
            notes: onboardingForm.notes || null,
            rollbackPrepared: onboardingForm.rollbackPrepared,
          },
        };
        await client.updatePlatformTenantOnboarding(tenant.id, command);
        await loadTenant();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSavingSection(null);
      }
    },
    [client, loadTenant, onboardingAction?.enabled, onboardingForm, tenant],
  );

  const promoteStage = useCallback(
    async (stage: PlatformTenantRolloutStage) => {
      if (!tenant || !stageAction?.enabled) {
        return;
      }
      const reason = await requestActionReason(
        stageAction,
        locale === "en"
          ? `Promote tenant to ${stage}?`
          : `確定要把 tenant 推進到 ${stage} 嗎？`,
      );
      if (reason === null) {
        return;
      }

      setBusyAction(`stage:${stage}`);
      setError(null);
      try {
        const command: SetPlatformTenantRolloutStageCommand = {
          stage,
          notes: reason || null,
        };
        await client.setPlatformTenantRolloutStage(tenant.id, command);
        await loadTenant();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyAction(null);
      }
    },
    [client, loadTenant, locale, stageAction, tenant],
  );

  const runLifecycleAction = useCallback(
    async (action: "activate" | "suspend" | "rollback_hold") => {
      if (!tenant) {
        return;
      }

      const descriptor =
        action === "activate"
          ? activateAction
          : action === "suspend"
            ? suspendAction
            : rollbackAction;
      if (!descriptor?.enabled) {
        return;
      }

      const reason = await requestActionReason(
        descriptor,
        locale === "en"
          ? `Run ${action.replace("_", " ")} on this tenant?`
          : `確定要對此 tenant 執行 ${action.replace("_", " ")} 嗎？`,
      );
      if (reason === null) {
        return;
      }

      setBusyAction(action);
      setError(null);
      try {
        if (action === "activate") {
          await client.activateTenant(
            tenant.id,
            reason ? { reason } : undefined,
          );
        } else if (action === "suspend") {
          await client.suspendTenant(
            tenant.id,
            reason ? { reason } : undefined,
          );
        } else {
          await client.rollbackHoldTenant(
            tenant.id,
            reason ? { reason } : undefined,
          );
        }
        await loadTenant();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyAction(null);
      }
    },
    [
      activateAction,
      client,
      loadTenant,
      locale,
      rollbackAction,
      suspendAction,
      tenant,
    ],
  );

  const runRoleAction = useCallback(
    async (roleCode: string, kind: "invite" | "acknowledge") => {
      if (!tenant) {
        return;
      }
      const descriptor = kind === "invite" ? inviteAction : acknowledgeAction;
      if (!descriptor?.enabled) {
        return;
      }

      const reason = await requestActionReason(
        descriptor,
        locale === "en"
          ? `${kind === "invite" ? "Invite" : "Acknowledge"} ${roleCode}?`
          : `${kind === "invite" ? "邀請" : "確認"} ${roleCode}？`,
      );
      if (reason === null) {
        return;
      }

      setBusyAction(`${kind}:${roleCode}`);
      setError(null);
      try {
        if (kind === "invite") {
          await client.inviteTenantRole(tenant.id, { roleCode });
        } else {
          await client.acknowledgeTenantRole(tenant.id, { roleCode });
        }
        await loadTenant();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyAction(null);
      }
    },
    [acknowledgeAction, client, inviteAction, loadTenant, locale, tenant],
  );

  if (loading) {
    return (
      <div style={{ ...pageShellStyle, padding: 24 }}>{copy.refresh}…</div>
    );
  }

  if (!tenant) {
    return (
      <div style={pageShellStyle}>
        <PageHeader
          theme={theme}
          title={copy.title}
          subtitle={copy.subtitle}
          sticky={false}
          actions={
            <Link href="/tenants" style={linkStyle}>
              {copy.back}
            </Link>
          }
        />
        <div style={pageBodyStyle}>
          <Banner
            theme={theme}
            tone="danger"
            title={copy.unavailableTitle}
            body={error ?? copy.unavailableBody}
          />
        </div>
      </div>
    );
  }

  const auditEmptyReason: TenantWorkspaceEmptyReason = auditError
    ? "fetch_failed"
    : activityFilter.trim() && auditRows.length === 0
      ? "filtered_empty"
      : auditRecords.length === 0
        ? "no_data"
        : "no_data";

  const partnersEmptyReason: TenantWorkspaceEmptyReason = partnerError
    ? "external_unavailable"
    : partnerEntries.length === 0 &&
        !tenant.enabledModules.includes("enterprise_dispatch")
      ? "not_provisioned"
      : partnerEntries.length === 0
        ? "no_data"
        : "no_data";

  const opsDeepLinkReason: TenantWorkspaceEmptyReason = isActionVisible(
    availableActions,
    "openOpsConsole",
  )
    ? "no_data"
    : "permission_denied";

  const summaryItems = [
    { k: "Tenant ID", v: tenant.id, mono: true },
    {
      k: locale === "en" ? "Tenant code" : "租戶代碼",
      v: tenant.code,
      mono: true,
    },
    {
      k: locale === "en" ? "Status" : "狀態",
      v: (
        <Pill
          theme={theme}
          tone={toCanvasTone(tenantStatusTone(tenant.status))}
        >
          {formatPlatformCodeLabel(locale, tenant.status)}
        </Pill>
      ),
    },
    {
      k: locale === "en" ? "Rollout stage" : "Rollout stage",
      v: (
        <Pill
          theme={theme}
          tone={toCanvasTone(tenantStageTone(tenant.rollout.stage))}
        >
          {formatPlatformCodeLabel(locale, tenant.rollout.stage)}
        </Pill>
      ),
    },
    {
      k: locale === "en" ? "Created at" : "建立時間",
      v: formatDateTime(tenant.createdAt),
    },
    {
      k: locale === "en" ? "Last updated" : "最近更新",
      v: formatDateTime(tenant.updatedAt),
    },
    {
      k: locale === "en" ? "Bootstrap admin" : "Bootstrap admin",
      v: tenant.bootstrapDefaults.billingBaseline.email,
      mono: true,
    },
    {
      k: copy.refreshLabel,
      v: lastRefreshedAt
        ? `${copy.refreshValue} · ${formatDateTime(lastRefreshedAt)}`
        : copy.refreshValue,
    },
  ];

  const integrationItems = [
    {
      k: locale === "en" ? "Integration mode" : "整合模式",
      v: formatPlatformCodeLabel(locale, tenant.integrationPackage.mode),
    },
    {
      k: "Sandbox URL",
      v: tenant.integrationPackage.sandboxBaseUrl ?? "—",
      mono: true,
    },
    {
      k: "Production URL",
      v: tenant.integrationPackage.productionBaseUrl ?? "—",
      mono: true,
    },
    {
      k: locale === "en" ? "API scopes" : "API scopes",
      v:
        tenant.integrationPackage.apiKeyScopes.length > 0
          ? tenant.integrationPackage.apiKeyScopes.join(", ")
          : "—",
      mono: true,
    },
    {
      k: locale === "en" ? "Cutover owner" : "Cutover owner",
      v: tenant.rollout.cutoverOwner ?? "—",
    },
    {
      k: locale === "en" ? "Rollback owner" : "Rollback owner",
      v: tenant.rollout.rollbackOwner ?? "—",
    },
  ];

  const billingItems = [
    {
      k: locale === "en" ? "Invoice title" : "Invoice title",
      v: tenant.bootstrapDefaults.billingBaseline.invoiceTitle,
    },
    {
      k: locale === "en" ? "Billing contact" : "帳務聯絡人",
      v: tenant.bootstrapDefaults.billingBaseline.contactName,
    },
    {
      k: locale === "en" ? "Billing email" : "帳務 Email",
      v: tenant.bootstrapDefaults.billingBaseline.email,
      mono: true,
    },
    {
      k: locale === "en" ? "Webhook events" : "Webhook events",
      v:
        tenant.bootstrapDefaults.webhookEvents.length > 0
          ? tenant.bootstrapDefaults.webhookEvents.join(", ")
          : "—",
    },
  ];

  return (
    <div style={pageShellStyle}>
      <PageHeader
        theme={theme}
        title={tenant.name}
        subtitle={`${tenant.code} · ${tenant.id}`}
        sticky={false}
        actions={
          <>
            <Link href="/tenants" style={linkStyle}>
              {copy.back}
            </Link>
            <Btn
              theme={theme}
              variant="secondary"
              onClick={() => void loadTenant()}
            >
              {copy.refresh}
            </Btn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {error ? (
          <Banner
            theme={theme}
            tone="danger"
            title={copy.unavailableTitle}
            body={error}
          />
        ) : null}
        {tenant.status === "rollback_hold" ? (
          <Banner
            theme={theme}
            tone="warn"
            title={copy.rollbackTitle}
            body={copy.rollbackBody}
          />
        ) : null}
        {availableActions.length === 0 ? (
          <Banner
            theme={theme}
            tone="info"
            title={copy.readOnlyTitle}
            body={copy.readOnlyBody}
          />
        ) : null}

        <div style={triGridStyle}>
          <KPI
            theme={theme}
            label={locale === "en" ? "Enabled modules" : "啟用模組"}
            value={String(tenant.enabledModules.length)}
            delta={tenant.enabledModules
              .map((moduleCode) => moduleLabels[moduleCode])
              .join(" · ")}
            deltaTone="neutral"
          />
          <KPI
            theme={theme}
            label={locale === "en" ? "Quota posture" : "配額姿態"}
            value={formatNumber(locale, tenant.quotas.monthlyBookings)}
            delta={`${formatNumber(locale, tenant.quotas.activeDrivers)} drivers · ${formatNumber(locale, tenant.quotas.monthlyApiCalls)} API`}
            deltaTone="neutral"
          />
          <KPI
            theme={theme}
            label={locale === "en" ? "Role acknowledgements" : "角色確認"}
            value={`${roleCounts.acknowledged}/${tenant.bootstrapDefaults.roleDefaults.length}`}
            delta={`${roleCounts.required} ${copy.roleRequired.toLowerCase()} · ${roleCounts.invited} invited`}
            deltaTone={
              roleCounts.acknowledged ===
              tenant.bootstrapDefaults.roleDefaults.length
                ? "up"
                : "neutral"
            }
          />
          <KPI
            theme={theme}
            label={locale === "en" ? "Refresh tier" : "Refresh tier"}
            value={REFRESH_TIER.label}
            delta={copy.refreshValue}
            deltaTone="neutral"
          />
        </div>

        <div style={heroGridStyle}>
          <Card theme={theme} title={copy.title} subtitle={copy.subtitle}>
            <div style={pillRowStyle}>
              <Pill
                theme={theme}
                tone={toCanvasTone(tenantStatusTone(tenant.status))}
              >
                {formatPlatformCodeLabel(locale, tenant.status)}
              </Pill>
              <Pill
                theme={theme}
                tone={toCanvasTone(tenantStageTone(tenant.rollout.stage))}
              >
                {formatPlatformCodeLabel(locale, tenant.rollout.stage)}
              </Pill>
              <Pill
                theme={theme}
                tone={tenant.rollout.rollbackPrepared ? "success" : "warn"}
              >
                {tenant.rollout.rollbackPrepared
                  ? locale === "en"
                    ? "Rollback prepared"
                    : "Rollback 已備妥"
                  : locale === "en"
                    ? "Rollback pending"
                    : "Rollback 待補"}
              </Pill>
              <Pill
                theme={theme}
                tone={
                  tenant.rollout[`${tenant.rollout.stage}Status`] === "blocked"
                    ? "danger"
                    : tenant.rollout[`${tenant.rollout.stage}Status`] ===
                        "ready"
                      ? "info"
                      : tenant.rollout[`${tenant.rollout.stage}Status`] ===
                          "approved"
                        ? "success"
                        : "warn"
                }
              >
                {formatPlatformCodeLabel(
                  locale,
                  tenant.rollout[`${tenant.rollout.stage}Status`],
                )}
              </Pill>
            </div>
            <div style={{ marginTop: 16 }}>
              <DL theme={theme} items={summaryItems} cols={2} />
            </div>
          </Card>

          <Card
            theme={theme}
            title={
              locale === "en" ? "Cross-app deep links" : "跨應用 deep links"
            }
            subtitle={
              locale === "en"
                ? "Platform-admin owns the mutation surface; operational impact opens in a new tab."
                : "寫入動作由 platform-admin 擁有；營運面影響以新分頁開啟。"
            }
          >
            <div style={sideStackStyle}>
              {opsDeepLinkReason === "permission_denied" ? (
                <EmptyReasonState locale={locale} reason="permission_denied" />
              ) : (
                <div style={roleCardStyle}>
                  <div style={{ display: "grid", gap: 4 }}>
                    <strong style={{ color: theme.text }}>
                      {locale === "en"
                        ? "Operational view in ops-console"
                        : "ops-console 營運視角"}
                    </strong>
                    <div style={subtleTextStyle}>
                      {locale === "en"
                        ? "Open the dispatch-board context for this tenant in a new tab before acting on rollout or rollback."
                        : "在處理 rollout 或 rollback 前，先用新分頁打開此 tenant 的 dispatch-board context。"}
                    </div>
                  </div>
                  <div style={actionStackStyle}>
                    <a
                      href={opsConsoleHref}
                      target="_blank"
                      rel="noreferrer"
                      style={linkStyle}
                    >
                      {copy.opsLink}
                    </a>
                  </div>
                </div>
              )}
              <div style={roleCardStyle}>
                <strong style={{ color: theme.text }}>
                  {copy.linkedPartners}
                </strong>
                <div style={subtleTextStyle}>{copy.linkedPartnersHint}</div>
                {partnerEntries.length > 0 ? (
                  <Table
                    theme={theme}
                    columns={partnerColumns}
                    rows={partnerEntries.map((entry) => ({ ...entry }))}
                  />
                ) : (
                  <EmptyReasonState
                    locale={locale}
                    reason={partnersEmptyReason}
                  />
                )}
              </div>
            </div>
          </Card>
        </div>

        <div style={sectionGridStyle}>
          <Card
            theme={theme}
            title={
              locale === "en" ? "Identity + readiness" : "識別與 readiness"
            }
            subtitle={
              locale === "en"
                ? "Billing baseline, integration endpoints, and live readiness owners."
                : "帳務基線、整合端點與 rollout owner。"
            }
          >
            <div style={{ display: "grid", gap: 16 }}>
              <DL theme={theme} items={integrationItems} cols={2} />
              <DL theme={theme} items={billingItems} cols={2} />
            </div>
          </Card>

          <Card
            theme={theme}
            title={locale === "en" ? "Rollout workspace" : "Rollout 工作區"}
            subtitle={
              locale === "en"
                ? "Gate status is the single source of truth for promotion flow."
                : "Gate status 是 promotion flow 的單一真相來源。"
            }
          >
            <div style={stageRailStyle}>
              {PLATFORM_TENANT_ROLLOUT_STAGES.map((stage) => {
                const gateStatus = tenant.rollout[`${stage}Status`];
                const isCurrent = tenant.rollout.stage === stage;
                const tone = toCanvasTone(tenantStageTone(gateStatus));
                return (
                  <div key={stage} style={stageCardStyle(tone, isCurrent)}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ display: "grid", gap: 4 }}>
                        <strong style={{ color: theme.text }}>
                          {formatPlatformCodeLabel(locale, stage)}
                        </strong>
                        <div style={subtleTextStyle}>
                          {gateStatus === "blocked"
                            ? copy.stageBlocked
                            : gateStatus === "ready"
                              ? copy.stageReady
                              : formatPlatformCodeLabel(locale, gateStatus)}
                        </div>
                      </div>
                      <Pill theme={theme} tone={tone}>
                        {formatPlatformCodeLabel(locale, gateStatus)}
                      </Pill>
                    </div>
                    {isActionVisible(availableActions, "setRolloutStage") ? (
                      <div style={actionStackStyle}>
                        <Btn
                          theme={theme}
                          variant="secondary"
                          disabled={
                            !stageAction?.enabled ||
                            busyAction === `stage:${stage}`
                          }
                          onClick={() => void promoteStage(stage)}
                        >
                          {busyAction === `stage:${stage}`
                            ? `${copy.promote}…`
                            : `${copy.promote} ${formatPlatformCodeLabel(locale, stage)}`}
                        </Btn>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              <div style={actionStackStyle}>
                {activateAction ? (
                  <Btn
                    theme={theme}
                    variant="secondary"
                    disabled={
                      !activateAction.enabled || busyAction === "activate"
                    }
                    onClick={() => void runLifecycleAction("activate")}
                  >
                    {copy.activate}
                  </Btn>
                ) : null}
                {suspendAction ? (
                  <Btn
                    theme={theme}
                    variant="secondary"
                    danger
                    disabled={
                      !suspendAction.enabled || busyAction === "suspend"
                    }
                    onClick={() => void runLifecycleAction("suspend")}
                  >
                    {copy.suspend}
                  </Btn>
                ) : null}
                {rollbackAction ? (
                  <Btn
                    theme={theme}
                    variant="secondary"
                    danger
                    disabled={
                      !rollbackAction.enabled || busyAction === "rollback_hold"
                    }
                    onClick={() => void runLifecycleAction("rollback_hold")}
                  >
                    {copy.rollback}
                  </Btn>
                ) : null}
              </div>
            </div>
          </Card>
        </div>

        <div style={sectionGridStyle}>
          <form onSubmit={handleSaveSettings}>
            <Card
              theme={theme}
              title={locale === "en" ? "Tenant settings" : "Tenant 設定"}
              subtitle={
                locale === "en"
                  ? "Identity, module scope, and quota baselines. CTA is backend-driven."
                  : "身份、模組範圍與配額基線。CTA 由 backend 控制。"
              }
            >
              <Field
                theme={theme}
                label={locale === "en" ? "Name" : "名稱"}
                required
              >
                <input
                  style={inputStyle}
                  value={settingsForm.name}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field theme={theme} label={locale === "en" ? "Code" : "代碼"}>
                <input
                  style={monoInputStyle}
                  value={settingsForm.code}
                  disabled
                />
              </Field>
              <Field
                theme={theme}
                label={locale === "en" ? "Enabled modules" : "啟用模組"}
                hint={
                  locale === "en"
                    ? "AvailableActions controls whether the save CTA is actionable."
                    : "是否可儲存由 availableActions 決定。"
                }
              >
                <div style={triGridStyle}>
                  {PLATFORM_TENANT_MODULES.map((moduleCode) => {
                    const checked =
                      settingsForm.enabledModules.includes(moduleCode);
                    return (
                      <label key={moduleCode} style={checkboxRowStyle}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSettingsForm((current) =>
                              toggleTenantModule(current, moduleCode),
                            )
                          }
                        />
                        <span>{moduleLabels[moduleCode]}</span>
                      </label>
                    );
                  })}
                </div>
              </Field>
              <div style={triGridStyle}>
                <Field
                  theme={theme}
                  label={locale === "en" ? "Active drivers" : "司機配額"}
                >
                  <input
                    style={monoInputStyle}
                    value={settingsForm.activeDrivers}
                    onChange={(event) =>
                      setSettingsForm((current) => ({
                        ...current,
                        activeDrivers: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field
                  theme={theme}
                  label={locale === "en" ? "Monthly bookings" : "每月 bookings"}
                >
                  <input
                    style={monoInputStyle}
                    value={settingsForm.monthlyBookings}
                    onChange={(event) =>
                      setSettingsForm((current) => ({
                        ...current,
                        monthlyBookings: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field
                  theme={theme}
                  label={
                    locale === "en" ? "Monthly API calls" : "每月 API calls"
                  }
                >
                  <input
                    style={monoInputStyle}
                    value={settingsForm.monthlyApiCalls}
                    onChange={(event) =>
                      setSettingsForm((current) => ({
                        ...current,
                        monthlyApiCalls: event.target.value,
                      }))
                    }
                  />
                </Field>
              </div>
              <div style={actionStackStyle}>
                <button
                  type="submit"
                  disabled={
                    !settingsAction?.enabled || savingSection === "settings"
                  }
                  style={{
                    ...inputStyle,
                    width: "auto",
                    minWidth: 136,
                    cursor:
                      !settingsAction?.enabled || savingSection === "settings"
                        ? "not-allowed"
                        : "pointer",
                    background: theme.accent,
                    color: "#ffffff",
                    borderColor: theme.accent,
                    fontWeight: 600,
                    opacity:
                      !settingsAction?.enabled || savingSection === "settings"
                        ? 0.55
                        : 1,
                  }}
                >
                  {savingSection === "settings"
                    ? `${copy.saveSettings}…`
                    : copy.saveSettings}
                </button>
              </div>
              {!settingsAction?.enabled &&
              settingsAction?.disabledReasonCode ? (
                <div style={disabledNoteStyle}>
                  {settingsAction.disabledReasonCode}
                </div>
              ) : null}
            </Card>
          </form>

          <form onSubmit={handleSaveOnboarding}>
            <Card
              theme={theme}
              title={
                locale === "en" ? "Onboarding package" : "Onboarding package"
              }
              subtitle={
                locale === "en"
                  ? "Billing baseline, integration package, rollout notes, and rollback readiness."
                  : "帳務基線、整合 package、rollout notes 與 rollback readiness。"
              }
            >
              <div style={triGridStyle}>
                <Field
                  theme={theme}
                  label={locale === "en" ? "Invoice title" : "Invoice title"}
                >
                  <input
                    style={inputStyle}
                    value={onboardingForm.invoiceTitle}
                    onChange={(event) =>
                      setOnboardingForm((current) => ({
                        ...current,
                        invoiceTitle: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field
                  theme={theme}
                  label={locale === "en" ? "Billing contact" : "帳務聯絡人"}
                >
                  <input
                    style={inputStyle}
                    value={onboardingForm.billingContactName}
                    onChange={(event) =>
                      setOnboardingForm((current) => ({
                        ...current,
                        billingContactName: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field
                  theme={theme}
                  label={locale === "en" ? "Billing email" : "帳務 Email"}
                >
                  <input
                    style={monoInputStyle}
                    value={onboardingForm.billingContactEmail}
                    onChange={(event) =>
                      setOnboardingForm((current) => ({
                        ...current,
                        billingContactEmail: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field
                  theme={theme}
                  label={locale === "en" ? "Integration mode" : "整合模式"}
                >
                  <select
                    style={inputStyle}
                    value={onboardingForm.integrationMode}
                    onChange={(event) =>
                      setOnboardingForm((current) => ({
                        ...current,
                        integrationMode: event.target
                          .value as OnboardingFormState["integrationMode"],
                      }))
                    }
                  >
                    {PLATFORM_TENANT_INTEGRATION_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {formatPlatformCodeLabel(locale, mode)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field theme={theme} label="Sandbox URL">
                  <input
                    style={monoInputStyle}
                    value={onboardingForm.sandboxBaseUrl}
                    onChange={(event) =>
                      setOnboardingForm((current) => ({
                        ...current,
                        sandboxBaseUrl: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field theme={theme} label="Production URL">
                  <input
                    style={monoInputStyle}
                    value={onboardingForm.productionBaseUrl}
                    onChange={(event) =>
                      setOnboardingForm((current) => ({
                        ...current,
                        productionBaseUrl: event.target.value,
                      }))
                    }
                  />
                </Field>
              </div>
              <Field
                theme={theme}
                label={locale === "en" ? "API scopes" : "API scopes"}
              >
                <input
                  style={monoInputStyle}
                  value={onboardingForm.apiKeyScopes}
                  onChange={(event) =>
                    setOnboardingForm((current) => ({
                      ...current,
                      apiKeyScopes: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field
                theme={theme}
                label={locale === "en" ? "Webhook events" : "Webhook events"}
              >
                <input
                  style={monoInputStyle}
                  value={onboardingForm.webhookEvents}
                  onChange={(event) =>
                    setOnboardingForm((current) => ({
                      ...current,
                      webhookEvents: event.target.value,
                    }))
                  }
                />
              </Field>
              <div style={triGridStyle}>
                <Field
                  theme={theme}
                  label={locale === "en" ? "Cutover owner" : "Cutover owner"}
                >
                  <input
                    style={inputStyle}
                    value={onboardingForm.cutoverOwner}
                    onChange={(event) =>
                      setOnboardingForm((current) => ({
                        ...current,
                        cutoverOwner: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field
                  theme={theme}
                  label={locale === "en" ? "Rollback owner" : "Rollback owner"}
                >
                  <input
                    style={inputStyle}
                    value={onboardingForm.rollbackOwner}
                    onChange={(event) =>
                      setOnboardingForm((current) => ({
                        ...current,
                        rollbackOwner: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field
                  theme={theme}
                  label={
                    locale === "en" ? "Rollback prepared" : "Rollback prepared"
                  }
                >
                  <label style={checkboxRowStyle}>
                    <input
                      type="checkbox"
                      checked={onboardingForm.rollbackPrepared}
                      onChange={(event) =>
                        setOnboardingForm((current) => ({
                          ...current,
                          rollbackPrepared: event.target.checked,
                        }))
                      }
                    />
                    <span>
                      {locale === "en"
                        ? "Ready for production rollback"
                        : "已具備 production rollback 條件"}
                    </span>
                  </label>
                </Field>
              </div>
              <Field
                theme={theme}
                label={locale === "en" ? "Rollout notes" : "Rollout notes"}
              >
                <textarea
                  style={textareaStyle}
                  value={onboardingForm.notes}
                  onChange={(event) =>
                    setOnboardingForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </Field>
              <div style={actionStackStyle}>
                <button
                  type="submit"
                  disabled={
                    !onboardingAction?.enabled || savingSection === "onboarding"
                  }
                  style={{
                    ...inputStyle,
                    width: "auto",
                    minWidth: 196,
                    cursor:
                      !onboardingAction?.enabled ||
                      savingSection === "onboarding"
                        ? "not-allowed"
                        : "pointer",
                    background: theme.accent,
                    color: "#ffffff",
                    borderColor: theme.accent,
                    fontWeight: 600,
                    opacity:
                      !onboardingAction?.enabled ||
                      savingSection === "onboarding"
                        ? 0.55
                        : 1,
                  }}
                >
                  {savingSection === "onboarding"
                    ? `${copy.saveOnboarding}…`
                    : copy.saveOnboarding}
                </button>
              </div>
              {!onboardingAction?.enabled &&
              onboardingAction?.disabledReasonCode ? (
                <div style={disabledNoteStyle}>
                  {onboardingAction.disabledReasonCode}
                </div>
              ) : null}
            </Card>
          </form>
        </div>

        <div style={sectionGridStyle}>
          <Card
            theme={theme}
            title={
              locale === "en"
                ? "Role invitations + acknowledgement"
                : "角色邀請與確認"
            }
            subtitle={
              locale === "en"
                ? "Role-row CTAs only appear when backend availableActions exposes them."
                : "只有 backend `availableActions` 開放時，role-row CTA 才會出現。"
            }
          >
            <div style={sideStackStyle}>
              {tenant.bootstrapDefaults.roleDefaults.map((role) => {
                const actionKind = role.acknowledgedAt
                  ? null
                  : role.invitedAt
                    ? "acknowledge"
                    : "invite";
                const descriptor =
                  actionKind === "invite"
                    ? inviteAction
                    : actionKind === "acknowledge"
                      ? acknowledgeAction
                      : null;
                return (
                  <div key={role.roleCode} style={roleCardStyle}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ display: "grid", gap: 3 }}>
                        <strong style={{ color: theme.text }}>
                          {role.displayName}
                        </strong>
                        <span style={monoTextStyle}>{role.roleCode}</span>
                      </div>
                      <div style={pillRowStyle}>
                        <Pill
                          theme={theme}
                          tone={role.required ? "warn" : "neutral"}
                        >
                          {role.required
                            ? copy.roleRequired
                            : copy.roleOptional}
                        </Pill>
                        <Pill
                          theme={theme}
                          tone={
                            role.acknowledgedAt
                              ? "success"
                              : role.invitedAt
                                ? "info"
                                : "warn"
                          }
                        >
                          {role.acknowledgedAt
                            ? locale === "en"
                              ? "Acknowledged"
                              : "已確認"
                            : role.invitedAt
                              ? locale === "en"
                                ? "Invited"
                                : "已邀請"
                              : locale === "en"
                                ? "Pending"
                                : "待處理"}
                        </Pill>
                      </div>
                    </div>
                    <div style={subtleTextStyle}>
                      {role.acknowledgedAt
                        ? `${locale === "en" ? "Acknowledged" : "已確認"} · ${formatDateTime(role.acknowledgedAt)}`
                        : role.invitedAt
                          ? `${locale === "en" ? "Invited" : "已邀請"} · ${formatDateTime(role.invitedAt)}`
                          : locale === "en"
                            ? "Invite required before rollout can continue."
                            : "需要先完成邀請，rollout 才能繼續。"}
                    </div>
                    {actionKind ? (
                      descriptor ? (
                        <div style={actionStackStyle}>
                          <Btn
                            theme={theme}
                            variant="secondary"
                            disabled={
                              !descriptor.enabled ||
                              busyAction === `${actionKind}:${role.roleCode}`
                            }
                            onClick={() =>
                              void runRoleAction(
                                role.roleCode,
                                actionKind as "invite" | "acknowledge",
                              )
                            }
                          >
                            {actionKind === "invite"
                              ? copy.invite
                              : copy.acknowledge}
                          </Btn>
                        </div>
                      ) : (
                        <div style={disabledNoteStyle}>{copy.noRoleAction}</div>
                      )
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card theme={theme} title={copy.auditTitle} subtitle={copy.auditHint}>
            <Field theme={theme} label={copy.filters}>
              <input
                style={inputStyle}
                value={activityFilter}
                onChange={(event) => setActivityFilter(event.target.value)}
                placeholder={
                  locale === "en"
                    ? "module, action, request…"
                    : "module、action、request…"
                }
              />
            </Field>
            {auditRows.length > 0 ? (
              <Table
                theme={theme}
                columns={auditColumns}
                rows={auditRows.map((entry) => ({ ...entry }))}
              />
            ) : (
              <EmptyReasonState locale={locale} reason={auditEmptyReason} />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
