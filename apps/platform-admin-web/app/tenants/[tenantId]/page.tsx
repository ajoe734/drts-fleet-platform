"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  formatDateTime,
  truncate,
  usePlatformAdminClient,
} from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import {
  EMPTY_ONBOARDING_FORM,
  EMPTY_TENANT_FORM,
  ModuleFields,
  QuotaFields,
  TenantIdentityFields,
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
import type {
  AuditLogRecord,
  PlatformAdminTenantRecord,
  PlatformTenantRolloutStage,
  SetPlatformTenantRolloutStageCommand,
  UpdatePlatformTenantOnboardingCommand,
  UpdatePlatformTenantSettingsCommand,
} from "@drts/contracts";
import {
  PLATFORM_TENANT_MODULES,
  PLATFORM_TENANT_ROLLOUT_STAGES,
} from "@drts/contracts";
import { Stepper, type StepState, type StepperItem } from "@drts/ui-web";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  CanvasTable,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

const STAGE_INDEX: Record<PlatformTenantRolloutStage, number> = {
  sandbox: 0,
  pilot: 1,
  production: 2,
};

const th = buildCanvasTheme({
  surface: "platform",
  dark: true,
  density: "compact",
});

const pageRootStyle: CSSProperties = {
  minHeight: "100%",
  background: th.bg,
  color: th.text,
  fontFamily: th.fontFamily,
};

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const pillRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const pillButtonStyle: CSSProperties = {
  border: 0,
  padding: 0,
  background: "transparent",
  cursor: "pointer",
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};

const splitGridStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.35fr) minmax(280px, 1fr)",
};

const twoColumnGridStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
};

const bannerGridStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};

const moduleGridStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
};

const moduleCardStyle = (enabled: boolean): CSSProperties => ({
  display: "grid",
  gap: 8,
  padding: "14px 16px",
  borderRadius: 10,
  border: `1px solid ${enabled ? th.accent : th.border}`,
  background: enabled ? th.accentBg : th.surfaceLo,
});

const formGridStyle: CSSProperties = {
  display: "grid",
  gap: 14,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};

const fullSpanStyle: CSSProperties = {
  gridColumn: "1 / -1",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontSize: 12.5,
  fontFamily: th.fontFamily,
};

const monoInputStyle: CSSProperties = {
  ...inputStyle,
  fontFamily: th.monoFamily,
};

const textAreaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 96,
  resize: "vertical",
};

const checkboxRowStyle: CSSProperties = {
  ...fullSpanStyle,
  display: "flex",
  alignItems: "center",
  gap: 10,
  color: th.text,
  fontSize: 12.5,
};

const sectionStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  scrollMarginTop: 120,
};

const loadingStateStyle: CSSProperties = {
  padding: 24,
  color: th.textMuted,
  background: th.bg,
  borderRadius: 12,
  fontFamily: th.fontFamily,
};

function toCanvasTone(tone: ReturnType<typeof tenantStageTone>): CanvasTone {
  return tone === "warning" ? "warn" : tone;
}

function formatLocaleNumber(locale: string, value: number) {
  return value.toLocaleString(locale === "en" ? "en-US" : "zh-TW");
}

function buildPlatformNav(locale: string): CanvasShellNavItem[] {
  const labels =
    locale === "en"
      ? {
          workspace: "Workspace",
          home: "Governance Home",
          health: "Platform Health",
          tenantGov: "Tenant Governance",
          tenants: "Tenants",
          partners: "Partner entry",
          users: "Platform staff",
          fleetGov: "Fleet & Compliance",
          fleet: "Fleet & compliance",
          switchboard: "Public info & placards",
          pricingGov: "Pricing & Settlement",
          pricing: "Pricing",
          payments: "Settlement governance",
          platformLayer: "Platform Layer",
          notices: "Notices & maintenance",
          audit: "Audit & evidence",
          flags: "Feature flags",
          adapters: "Adapter registry",
        }
      : {
          workspace: "工作面",
          home: "工作首頁",
          health: "平台健康",
          tenantGov: "租戶治理",
          tenants: "租戶",
          partners: "合作夥伴 entry",
          users: "平台人員",
          fleetGov: "車隊與法遵",
          fleet: "車隊與合規",
          switchboard: "法定資訊與牌貼",
          pricingGov: "計價與結算",
          pricing: "計價",
          payments: "結算治理",
          platformLayer: "平台層",
          notices: "公告與維護",
          audit: "稽核與證據",
          flags: "功能旗標",
          adapters: "介接登錄",
        };

  return [
    { divider: labels.workspace },
    { key: "home", href: "/", icon: "home", label: labels.home },
    {
      key: "health",
      href: "/health",
      icon: "health",
      label: labels.health,
      badge: "2",
      badgeTone: "warn",
    },
    { divider: labels.tenantGov },
    {
      key: "tenants",
      href: "/tenants",
      icon: "tenants",
      label: labels.tenants,
    },
    {
      key: "partners",
      href: "/partners",
      icon: "partners",
      label: labels.partners,
    },
    { key: "users", href: "/users", icon: "users", label: labels.users },
    { divider: labels.fleetGov },
    { key: "fleet", href: "/fleet", icon: "fleet", label: labels.fleet },
    {
      key: "switchboard",
      href: "/switchboard",
      icon: "switchboard",
      label: labels.switchboard,
    },
    { divider: labels.pricingGov },
    {
      key: "pricing",
      href: "/pricing",
      icon: "pricing",
      label: labels.pricing,
    },
    {
      key: "payments",
      href: "/payments",
      icon: "payments",
      label: labels.payments,
      badge: "3",
      badgeTone: "danger",
    },
    { divider: labels.platformLayer },
    {
      key: "notices",
      href: "/notices",
      icon: "notices",
      label: labels.notices,
    },
    { key: "audit", href: "/audit", icon: "audit", label: labels.audit },
    {
      key: "flags",
      href: "/feature-flags",
      icon: "flags",
      label: labels.flags,
    },
    {
      key: "adapters",
      href: "/adapter-registry",
      icon: "adapters",
      label: labels.adapters,
    },
  ];
}

function rolloutStepState(
  tenant: PlatformAdminTenantRecord,
  stage: PlatformTenantRolloutStage,
): StepState {
  const gateStatus = tenant.rollout[`${stage}Status`];
  if (gateStatus === "blocked") {
    return "blocked";
  }
  if (
    gateStatus === "approved" ||
    (STAGE_INDEX[tenant.rollout.stage] ?? -1) > (STAGE_INDEX[stage] ?? -1)
  ) {
    return "complete";
  }
  if (tenant.rollout.stage === stage) {
    return "current";
  }
  return "upcoming";
}

function statusChipCopy(locale: string, value: boolean) {
  if (locale === "en") {
    return value ? "Enabled" : "Disabled";
  }
  return value ? "已啟用" : "未啟用";
}

export default function TenantDetailPage() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = Array.isArray(params?.tenantId)
    ? params.tenantId[0]
    : (params?.tenantId ?? "");
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [tenant, setTenant] = useState<PlatformAdminTenantRecord | null>(null);
  const [auditRecords, setAuditRecords] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TenantFormState>(EMPTY_TENANT_FORM);
  const [onboardingForm, setOnboardingForm] = useState<OnboardingFormState>(
    EMPTY_ONBOARDING_FORM,
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingOnboarding, setSavingOnboarding] = useState(false);
  const [promotingStage, setPromotingStage] =
    useState<PlatformTenantRolloutStage | null>(null);
  const [lifecycleAction, setLifecycleAction] = useState<string | null>(null);
  const [roleAction, setRoleAction] = useState<string | null>(null);

  const copy =
    locale === "en"
      ? {
          back: "Back to tenants",
          title: "Tenant detail",
          subtitle:
            "Govern rollout, onboarding defaults, quota posture, role acknowledgements, and tenant-scoped audit evidence.",
          overviewTitle: "Overview",
          overviewSubtitle:
            "Core identity, lifecycle timestamps, and current governance posture for this tenant.",
          modulesTitle: "Modules and quotas",
          modulesSubtitle:
            "Enabled product scope and monthly quota baselines remain platform-owned settings.",
          onboardingTitle: "Onboarding package",
          onboardingSubtitle:
            "Integration package, billing baseline, and rollout ownership fields used before each formal promotion.",
          defaultsTitle: "Edit onboarding defaults",
          defaultsSubtitle:
            "Update the bootstrap package before the next rollout promotion command is issued.",
          rolloutTitle: "Rollout workflow",
          rolloutSubtitle:
            "Progression remains backend-owned. This page exposes current gate evidence and only sends formal stage commands.",
          rolesTitle: "Roles and acknowledgements",
          rolesSubtitle:
            "Bootstrap roles stay visible here so invite and acknowledgement gaps are explicit before production rollout.",
          billingTitle: "Billing baseline",
          billingSubtitle:
            "Invoice title, contact path, and notification posture used as tenant bootstrap defaults.",
          webhooksTitle: "Webhook baseline",
          webhooksSubtitle:
            "Govern webhook event scope and notification channels without blurring this page into delivery operations.",
          auditTitle: "Audit surface",
          auditSubtitle:
            "Tenant-scoped recent governance events with request and resource context.",
          lifecycleTitle: "Lifecycle controls",
          lifecycleSubtitle:
            "These actions change control-plane availability and should follow the rollout evidence shown above.",
          navigationTitle: "Deep-page sections",
          navigationSubtitle:
            "Use anchored sections to move between overview, modules, onboarding, rollout, roles, billing, webhooks, and audit.",
          notFound: "Tenant not found or no longer available.",
          noRolloutNotes: "No rollout note recorded.",
          noAudit: "No tenant-scoped audit records found yet.",
          noWebhookEvents: "No webhook events configured.",
          noSubscriptions: "No notification subscriptions configured.",
          noScopes: "No API scopes configured.",
          noCutoverOwner: "No cutover owner recorded.",
          noRollbackOwner: "No rollback owner recorded.",
          promote: "Promote to",
          activate: "Activate",
          suspend: "Suspend",
          rollback: "Rollback hold",
          saveSettings: "Save settings",
          saveOnboarding: "Save onboarding",
          invite: "Invite",
          acknowledge: "Acknowledge",
          refreshAudit: "Refresh detail",
          nav: {
            overview: "Overview",
            modules: "Modules",
            onboarding: "Onboarding",
            rollout: "Rollout",
            roles: "Roles",
            billing: "Billing",
            webhooks: "Webhooks",
            audit: "Audit",
          },
          auditColumns: {
            time: "Time",
            module: "Module",
            action: "Action",
            resource: "Resource",
            request: "Request",
          },
        }
      : {
          back: "返回租戶列表",
          title: "租戶詳情",
          subtitle:
            "治理這個 tenant 的 rollout、onboarding defaults、配額、角色確認與 tenant-scoped audit 證據。",
          overviewTitle: "概況",
          overviewSubtitle:
            "此 tenant 的核心識別、生命週期時間點與目前治理姿態。",
          modulesTitle: "模組與配額",
          modulesSubtitle: "產品模組啟用範圍與每月配額基線仍由平台端維護。",
          onboardingTitle: "Onboarding package",
          onboardingSubtitle:
            "在每次正式 promotion 前，用來檢視 integration package、billing baseline 與 rollout owner。",
          defaultsTitle: "編輯 onboarding defaults",
          defaultsSubtitle:
            "在下一次 rollout promotion command 前先更新 bootstrap package。",
          rolloutTitle: "Rollout workflow",
          rolloutSubtitle:
            "Progression 仍由後端掌控；此頁只呈現 gate 證據並發出正式 stage command。",
          rolesTitle: "角色與確認",
          rolesSubtitle:
            "把 bootstrap roles 的 invite 與 acknowledgement 缺口留在同一個治理面上。",
          billingTitle: "Billing baseline",
          billingSubtitle:
            "Tenant bootstrap defaults 使用的 invoice title、聯絡窗口與通知姿態。",
          webhooksTitle: "Webhook baseline",
          webhooksSubtitle:
            "治理 webhook event scope 與 notification channel，但不把這頁混成 delivery operations。",
          auditTitle: "Audit 面",
          auditSubtitle:
            "顯示此 tenant 最近的治理事件、request 與 resource 脈絡。",
          lifecycleTitle: "Lifecycle controls",
          lifecycleSubtitle:
            "這些動作會直接改變 control-plane availability，應依照上方 rollout 證據操作。",
          navigationTitle: "深頁區段",
          navigationSubtitle:
            "用 anchor sections 在 overview、modules、onboarding、rollout、roles、billing、webhooks、audit 之間切換。",
          notFound: "找不到此租戶，或目前已無法讀取。",
          noRolloutNotes: "尚未留下 rollout 備註。",
          noAudit: "目前沒有此 tenant 的 audit 紀錄。",
          noWebhookEvents: "尚未設定 webhook events。",
          noSubscriptions: "尚未設定 notification subscriptions。",
          noScopes: "尚未設定 API scopes。",
          noCutoverOwner: "尚未記錄 cutover owner。",
          noRollbackOwner: "尚未記錄 rollback owner。",
          promote: "推進到",
          activate: "啟用",
          suspend: "暫停",
          rollback: "Rollback hold",
          saveSettings: "儲存設定",
          saveOnboarding: "儲存 onboarding",
          invite: "邀請",
          acknowledge: "確認",
          refreshAudit: "重新整理詳情",
          nav: {
            overview: "概況",
            modules: "模組",
            onboarding: "Onboarding",
            rollout: "Rollout",
            roles: "角色",
            billing: "Billing",
            webhooks: "Webhooks",
            audit: "Audit",
          },
          auditColumns: {
            time: "時間",
            module: "模組",
            action: "動作",
            resource: "資源",
            request: "Request",
          },
        };

  const moduleLabels = useMemo(() => createTenantModuleLabels(t), [t]);

  const loadTenant = useCallback(async () => {
    if (!tenantId) {
      setTenant(null);
      setAuditRecords([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [record, audit] = await Promise.all([
        client.getPlatformTenant(tenantId),
        client.listAuditLogs() as Promise<AuditLogRecord[]>,
      ]);
      setTenant(record);
      setEditForm(toTenantSettingsFormState(record));
      setOnboardingForm(toTenantOnboardingFormState(record));
      setAuditRecords(
        (audit ?? [])
          .filter((entry: AuditLogRecord) => entry.tenantId === record.id)
          .sort(
            (left: AuditLogRecord, right: AuditLogRecord) =>
              new Date(right.createdAt).getTime() -
              new Date(left.createdAt).getTime(),
          ),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setTenant(null);
      setAuditRecords([]);
      setEditForm(EMPTY_TENANT_FORM);
      setOnboardingForm(EMPTY_ONBOARDING_FORM);
    } finally {
      setLoading(false);
    }
  }, [client, tenantId]);

  useEffect(() => {
    void loadTenant();
  }, [loadTenant]);

  const handleSaveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tenant) return;
    setSavingSettings(true);
    setError(null);
    try {
      const command: UpdatePlatformTenantSettingsCommand = {
        name: editForm.name,
        enabledModules: editForm.enabledModules,
        quotas: {
          activeDrivers: parseQuota(editForm.activeDrivers),
          monthlyBookings: parseQuota(editForm.monthlyBookings),
          monthlyApiCalls: parseQuota(editForm.monthlyApiCalls),
        },
      };
      await client.updatePlatformTenantSettings(tenant.id, command);
      await loadTenant();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveOnboarding = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tenant) return;
    setSavingOnboarding(true);
    setError(null);
    try {
      const command: UpdatePlatformTenantOnboardingCommand = {
        billingBaseline: {
          invoiceTitle: onboardingForm.invoiceTitle,
          contactName: onboardingForm.billingContactName,
          email: onboardingForm.billingContactEmail,
        },
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingOnboarding(false);
    }
  };

  const promoteStage = useCallback(
    async (stage: PlatformTenantRolloutStage) => {
      if (!tenant) return;
      setPromotingStage(stage);
      setError(null);
      try {
        const command: SetPlatformTenantRolloutStageCommand = { stage };
        await client.setPlatformTenantRolloutStage(tenant.id, command);
        await loadTenant();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setPromotingStage(null);
      }
    },
    [client, loadTenant, tenant],
  );

  const runLifecycle = useCallback(
    async (action: "activate" | "suspend" | "rollback_hold") => {
      if (!tenant) return;
      setLifecycleAction(action);
      setError(null);
      try {
        if (action === "activate") {
          await client.activateTenant(tenant.id);
        } else if (action === "rollback_hold") {
          await client.rollbackHoldTenant(tenant.id);
        } else {
          await client.suspendTenant(tenant.id);
        }
        await loadTenant();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLifecycleAction(null);
      }
    },
    [client, loadTenant, tenant],
  );

  const inviteRole = useCallback(
    async (roleCode: string) => {
      if (!tenant) return;
      setRoleAction(`invite:${roleCode}`);
      setError(null);
      try {
        await client.inviteTenantRole(tenant.id, { roleCode });
        await loadTenant();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRoleAction(null);
      }
    },
    [client, loadTenant, tenant],
  );

  const acknowledgeRole = useCallback(
    async (roleCode: string) => {
      if (!tenant) return;
      setRoleAction(`ack:${roleCode}`);
      setError(null);
      try {
        await client.acknowledgeTenantRole(tenant.id, { roleCode });
        await loadTenant();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRoleAction(null);
      }
    },
    [client, loadTenant, tenant],
  );

  const rolloutSteps = useMemo<StepperItem[]>(() => {
    if (!tenant) {
      return [];
    }

    const sharedTimestamp = tenant.rollout.lastPromotedAt
      ? formatDateTime(tenant.rollout.lastPromotedAt)
      : undefined;

    return [
      {
        id: "created",
        title: locale === "en" ? "Tenant created" : "租戶已建立",
        description: tenant.createdAt
          ? formatDateTime(tenant.createdAt)
          : undefined,
        state: "complete",
        tone: "success",
      },
      ...PLATFORM_TENANT_ROLLOUT_STAGES.map((stage) => ({
        id: stage,
        title: formatPlatformCodeLabel(locale, stage),
        description: `${locale === "en" ? "Gate" : "Gate"}: ${tenant.rollout[`${stage}Status`]}`,
        state: rolloutStepState(tenant, stage),
        tone: tenantStageTone(tenant.rollout[`${stage}Status`]),
        timestamp: sharedTimestamp,
      })),
      {
        id: "rollback",
        title: locale === "en" ? "Rollback ready" : "Rollback ready",
        description:
          tenant.rollout.rollbackOwner ??
          (locale === "en"
            ? "No rollback owner recorded"
            : "尚未記錄 rollback owner"),
        state: tenant.rollout.rollbackPrepared ? "complete" : "upcoming",
        tone: tenant.rollout.rollbackPrepared ? "success" : "neutral",
      },
    ];
  }, [locale, tenant]);

  const acknowledgedRoles = tenant?.bootstrapDefaults.roleDefaults.filter(
    (role) => role.acknowledgedAt,
  ).length;
  const requiredRoles = tenant?.bootstrapDefaults.roleDefaults.filter(
    (role) => role.required,
  ).length;
  const invitedRoles = tenant?.bootstrapDefaults.roleDefaults.filter(
    (role) => role.invitedAt,
  ).length;
  const readyGateCount = tenant
    ? PLATFORM_TENANT_ROLLOUT_STAGES.filter(
        (stage) => tenant.rollout[`${stage}Status`] === "approved",
      ).length
    : 0;
  const disabledModules = tenant
    ? PLATFORM_TENANT_MODULES.filter(
        (moduleCode) => !tenant.enabledModules.includes(moduleCode),
      )
    : [];
  const recentAudit = auditRecords.slice(0, 6);

  const onboardingItems = useMemo(() => {
    if (!tenant) {
      return [];
    }
    return [
      {
        label: locale === "en" ? "Integration mode" : "整合模式",
        value: formatPlatformCodeLabel(locale, tenant.integrationPackage.mode),
      },
      {
        label: "Sandbox URL",
        value: tenant.integrationPackage.sandboxBaseUrl ?? "—",
        mono: true,
      },
      {
        label: "Production URL",
        value: tenant.integrationPackage.productionBaseUrl ?? "—",
        mono: true,
      },
      {
        label: locale === "en" ? "Billing baseline" : "帳務基線",
        value: `${tenant.bootstrapDefaults.billingBaseline.invoiceTitle} · ${tenant.bootstrapDefaults.billingBaseline.contactName} · ${tenant.bootstrapDefaults.billingBaseline.email}`,
      },
      {
        label: "API scopes",
        value:
          tenant.integrationPackage.apiKeyScopes.length > 0
            ? tenant.integrationPackage.apiKeyScopes.join(", ")
            : "—",
        mono: true,
      },
      {
        label: locale === "en" ? "Rollout note" : "Rollout 備註",
        value: tenant.rollout.notes ?? copy.noRolloutNotes,
      },
      {
        label: locale === "en" ? "Webhook baseline" : "Webhook baseline",
        value:
          tenant.bootstrapDefaults.webhookEvents.length > 0
            ? tenant.bootstrapDefaults.webhookEvents.join(", ")
            : copy.noWebhookEvents,
        mono: true,
      },
      {
        label: locale === "en" ? "Quota / month" : "配額 / 月",
        value: `${formatLocaleNumber(locale, tenant.quotas.monthlyBookings)} bookings`,
        mono: true,
      },
    ];
  }, [copy.noRolloutNotes, copy.noWebhookEvents, locale, tenant]);

  const overviewItems = useMemo(() => {
    if (!tenant) {
      return [];
    }
    return [
      {
        label: "Tenant ID",
        value: tenant.id,
        mono: true,
      },
      {
        label: locale === "en" ? "Tenant code" : "租戶代碼",
        value: tenant.code,
        mono: true,
      },
      {
        label: locale === "en" ? "Created at" : "建立時間",
        value: formatDateTime(tenant.createdAt),
        mono: true,
      },
      {
        label: locale === "en" ? "Last updated" : "最近更新",
        value: formatDateTime(tenant.updatedAt),
        mono: true,
      },
      {
        label: locale === "en" ? "Integration mode" : "整合模式",
        value: formatPlatformCodeLabel(locale, tenant.integrationPackage.mode),
      },
      {
        label: locale === "en" ? "Current rollout" : "目前 rollout",
        value: formatPlatformCodeLabel(locale, tenant.rollout.stage),
      },
      {
        label: locale === "en" ? "Cutover owner" : "Cutover owner",
        value: tenant.rollout.cutoverOwner ?? copy.noCutoverOwner,
      },
      {
        label: locale === "en" ? "Rollback owner" : "Rollback owner",
        value: tenant.rollout.rollbackOwner ?? copy.noRollbackOwner,
      },
    ];
  }, [copy.noCutoverOwner, copy.noRollbackOwner, locale, tenant]);

  const billingItems = useMemo(() => {
    if (!tenant) {
      return [];
    }
    return [
      {
        label: locale === "en" ? "Invoice title" : "Invoice title",
        value: tenant.bootstrapDefaults.billingBaseline.invoiceTitle,
      },
      {
        label: locale === "en" ? "Billing contact" : "帳務聯絡人",
        value: tenant.bootstrapDefaults.billingBaseline.contactName,
      },
      {
        label: locale === "en" ? "Billing email" : "帳務 Email",
        value: tenant.bootstrapDefaults.billingBaseline.email,
      },
      {
        label: locale === "en" ? "Notification subscriptions" : "通知訂閱設定",
        value: `${tenant.bootstrapDefaults.notificationSubscriptions.length}`,
        mono: true,
      },
    ];
  }, [locale, tenant]);

  const webhookItems = useMemo(() => {
    if (!tenant) {
      return [];
    }
    return [
      {
        label: locale === "en" ? "Event scope" : "事件範圍",
        value:
          tenant.bootstrapDefaults.webhookEvents.length > 0
            ? tenant.bootstrapDefaults.webhookEvents.join(", ")
            : copy.noWebhookEvents,
        mono: true,
      },
      {
        label: locale === "en" ? "API key scopes" : "API 金鑰 scopes",
        value:
          tenant.integrationPackage.apiKeyScopes.length > 0
            ? tenant.integrationPackage.apiKeyScopes.join(", ")
            : copy.noScopes,
        mono: true,
      },
    ];
  }, [copy.noScopes, copy.noWebhookEvents, locale, tenant]);

  if (loading) {
    return <div style={loadingStateStyle}>{t("tenants.loading")}</div>;
  }

  const shellNav = buildPlatformNav(locale);
  const tabs = [
    copy.nav.overview,
    copy.nav.modules,
    copy.nav.onboarding,
    copy.nav.rollout,
    copy.nav.roles,
    copy.nav.webhooks,
    copy.nav.billing,
    copy.nav.audit,
  ];

  if (!tenant) {
    return (
      <CanvasShell
        theme={th}
        nav={shellNav}
        active="tenants"
        currentPath={tenantId ? `/tenants/${tenantId}` : "/tenants"}
        breadcrumb={[copy.title]}
      >
        <div style={pageRootStyle}>
          <CanvasPageHeader
            theme={th}
            title={copy.title}
            subtitle={copy.subtitle}
            actions={
              <Link href="/tenants">
                <CanvasBtn theme={th} variant="secondary">
                  {copy.back}
                </CanvasBtn>
              </Link>
            }
          />
          <div style={pageBodyStyle}>
            <CanvasBanner
              theme={th}
              tone="danger"
              title={locale === "en" ? "Tenant unavailable" : "租戶目前不可用"}
              body={error ?? copy.notFound}
            />
          </div>
        </div>
      </CanvasShell>
    );
  }

  const roleRows = tenant.bootstrapDefaults.roleDefaults.map((role) => ({
    roleCode: role.roleCode,
    displayName: role.displayName,
    required: role.required,
    invitedAt: role.invitedAt,
    acknowledgedAt: role.acknowledgedAt,
  }));

  const roleColumns: CanvasTableColumn<(typeof roleRows)[number]>[] = [
    {
      h: locale === "en" ? "ROLE" : "角色",
      w: 140,
      mono: true,
      r: (row) => formatPlatformCodeLabel(locale, row.roleCode),
    },
    {
      h: locale === "en" ? "DISPLAY" : "名稱",
      w: 180,
      r: (row) => row.displayName,
    },
    {
      h: locale === "en" ? "STATE" : "狀態",
      w: 120,
      r: (row) => (
        <CanvasPill
          theme={th}
          tone={
            row.acknowledgedAt ? "success" : row.invitedAt ? "warn" : "neutral"
          }
          dot
        >
          {row.acknowledgedAt
            ? t("tenants.role.acknowledged")
            : row.invitedAt
              ? t("tenants.role.invited")
              : locale === "en"
                ? "Pending"
                : "待處理"}
        </CanvasPill>
      ),
    },
    {
      h: locale === "en" ? "REQUIRED" : "必要",
      w: 100,
      r: (row) => (
        <CanvasPill theme={th} tone={row.required ? "warn" : "neutral"}>
          {row.required
            ? locale === "en"
              ? "Required"
              : "必要"
            : locale === "en"
              ? "Optional"
              : "選填"}
        </CanvasPill>
      ),
    },
    {
      h: locale === "en" ? "UPDATED" : "更新",
      w: 180,
      mono: true,
      r: (row) =>
        row.acknowledgedAt
          ? formatDateTime(row.acknowledgedAt)
          : row.invitedAt
            ? formatDateTime(row.invitedAt)
            : "—",
    },
    {
      h: locale === "en" ? "ACTION" : "動作",
      w: 120,
      r: (row) => {
        const actionId =
          row.acknowledgedAt || row.invitedAt
            ? `ack:${row.roleCode}`
            : `invite:${row.roleCode}`;
        if (row.acknowledgedAt) {
          return "—";
        }
        return row.invitedAt ? (
          <CanvasBtn
            theme={th}
            variant="secondary"
            size="xs"
            disabled={roleAction === actionId}
            onClick={() => void acknowledgeRole(row.roleCode)}
          >
            {copy.acknowledge}
          </CanvasBtn>
        ) : (
          <CanvasBtn
            theme={th}
            variant="secondary"
            size="xs"
            disabled={roleAction === actionId}
            onClick={() => void inviteRole(row.roleCode)}
          >
            {copy.invite}
          </CanvasBtn>
        );
      },
    },
  ];

  const auditRows = recentAudit.map((record) => ({
    auditId: record.auditId,
    createdAt: formatDateTime(record.createdAt),
    module: record.moduleName
      ? formatPlatformCodeLabel(locale, record.moduleName)
      : "—",
    action: record.actionName
      ? formatPlatformCodeLabel(locale, record.actionName)
      : "—",
    resource:
      record.resourceType && record.resourceId
        ? `${record.resourceType} · ${record.resourceId}`
        : record.resourceType || record.resourceId || "—",
    request: truncate(record.requestId || "—", 14),
  }));

  const auditColumns: CanvasTableColumn<(typeof auditRows)[number]>[] = [
    { h: copy.auditColumns.time, k: "createdAt", w: 180, mono: true },
    { h: copy.auditColumns.module, k: "module", w: 150 },
    { h: copy.auditColumns.action, k: "action", w: 180 },
    { h: copy.auditColumns.resource, k: "resource", w: 240 },
    { h: copy.auditColumns.request, k: "request", w: 150, mono: true },
  ];

  return (
    <CanvasShell
      theme={th}
      nav={shellNav}
      active="tenants"
      currentPath={`/tenants/${tenant.id}`}
      breadcrumb={[
        locale === "en" ? "Tenant Governance" : "租戶治理",
        copy.title,
        tenant.name,
      ]}
    >
      <div style={pageRootStyle}>
        <CanvasPageHeader
          theme={th}
          title={tenant.name}
          subtitle={`${tenant.code} · ${tenant.id}`}
          tabs={tabs}
          activeTab={copy.nav.rollout}
          actions={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link href="/tenants">
                <CanvasBtn theme={th} variant="secondary">
                  {copy.back}
                </CanvasBtn>
              </Link>
              <CanvasBtn
                theme={th}
                variant="secondary"
                onClick={() => void loadTenant()}
              >
                {copy.refreshAudit}
              </CanvasBtn>
              <CanvasBtn
                theme={th}
                variant="primary"
                disabled={promotingStage === "production"}
                onClick={() => void promoteStage("production")}
              >
                {promotingStage === "production"
                  ? t("common.saving")
                  : `${copy.promote} ${formatPlatformCodeLabel(locale, "production")}`}
              </CanvasBtn>
            </div>
          }
        />

        <div style={pageBodyStyle}>
          <div style={pillRowStyle}>
            {[
              {
                href: "#overview",
                label: copy.nav.overview,
                tone: "neutral" as const,
              },
              {
                href: "#modules",
                label: copy.nav.modules,
                tone: "neutral" as const,
              },
              {
                href: "#onboarding",
                label: copy.nav.onboarding,
                tone: "warn" as const,
              },
              {
                href: "#rollout",
                label: copy.nav.rollout,
                tone: "accent" as const,
              },
              { href: "#roles", label: copy.nav.roles, tone: "warn" as const },
              {
                href: "#webhooks",
                label: copy.nav.webhooks,
                tone: "info" as const,
              },
              {
                href: "#billing",
                label: copy.nav.billing,
                tone: "neutral" as const,
              },
              {
                href: "#audit",
                label: copy.nav.audit,
                tone:
                  recentAudit.length > 0
                    ? ("success" as const)
                    : ("neutral" as const),
              },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                style={{ textDecoration: "none" }}
              >
                <button type="button" style={pillButtonStyle}>
                  <CanvasPill theme={th} tone={item.tone}>
                    {item.label}
                  </CanvasPill>
                </button>
              </a>
            ))}
          </div>

          {error ? (
            <CanvasBanner
              theme={th}
              tone="danger"
              title={
                locale === "en" ? "Unable to update tenant" : "租戶更新失敗"
              }
              body={error}
            />
          ) : null}

          <div style={kpiGridStyle}>
            <CanvasKPI
              theme={th}
              label={locale === "en" ? "Enabled modules" : "啟用模組"}
              value={tenant.enabledModules.length}
              sub={tenant.enabledModules
                .map((module) => moduleLabels[module])
                .join(" · ")}
            />
            <CanvasKPI
              theme={th}
              label={locale === "en" ? "Monthly quotas" : "每月配額"}
              value={formatLocaleNumber(locale, tenant.quotas.monthlyBookings)}
              sub={`${formatLocaleNumber(locale, tenant.quotas.activeDrivers)} drivers · ${formatLocaleNumber(locale, tenant.quotas.monthlyApiCalls)} API`}
            />
            <CanvasKPI
              theme={th}
              label={locale === "en" ? "Role acknowledgements" : "角色確認"}
              value={`${acknowledgedRoles ?? 0}/${tenant.bootstrapDefaults.roleDefaults.length}`}
              delta={
                acknowledgedRoles ===
                tenant.bootstrapDefaults.roleDefaults.length
                  ? locale === "en"
                    ? "ready"
                    : "已齊備"
                  : undefined
              }
              deltaTone={
                acknowledgedRoles ===
                tenant.bootstrapDefaults.roleDefaults.length
                  ? "up"
                  : "neutral"
              }
              sub={
                locale === "en"
                  ? `${requiredRoles ?? 0} required · ${invitedRoles ?? 0} invited`
                  : `${requiredRoles ?? 0} 個必要 · ${invitedRoles ?? 0} 個已邀請`
              }
            />
            <CanvasKPI
              theme={th}
              label={
                locale === "en"
                  ? "Approved rollout gates"
                  : "已通過的 rollout gate"
              }
              value={`${readyGateCount}/${PLATFORM_TENANT_ROLLOUT_STAGES.length}`}
              sub={
                tenant.rollout.lastPromotedAt
                  ? formatDateTime(tenant.rollout.lastPromotedAt)
                  : "—"
              }
            />
          </div>

          <section id="rollout" style={sectionStyle}>
            <CanvasCard
              theme={th}
              title={copy.rolloutTitle}
              subtitle={`${copy.rolloutSubtitle} · ${locale === "en" ? "Cutover owner" : "Cutover owner"}: ${tenant.rollout.cutoverOwner ?? copy.noCutoverOwner} · ${locale === "en" ? "Rollback owner" : "Rollback owner"}: ${tenant.rollout.rollbackOwner ?? copy.noRollbackOwner}`}
              actions={
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <CanvasPill
                    theme={th}
                    tone={toCanvasTone(tenantStageTone(tenant.rollout.stage))}
                    dot
                  >
                    {formatPlatformCodeLabel(locale, tenant.rollout.stage)}
                  </CanvasPill>
                  <CanvasPill
                    theme={th}
                    tone={toCanvasTone(tenantStatusTone(tenant.status))}
                    dot
                  >
                    {formatPlatformCodeLabel(locale, tenant.status)}
                  </CanvasPill>
                </div>
              }
            >
              <div style={{ display: "grid", gap: 16 }}>
                <div style={{ paddingBottom: 6 }}>
                  <Stepper items={rolloutSteps} />
                </div>
                <div style={bannerGridStyle}>
                  <CanvasBanner
                    theme={th}
                    tone={tenant.rollout.rollbackPrepared ? "success" : "warn"}
                    title={
                      locale === "en" ? "rollbackPrepared" : "rollbackPrepared"
                    }
                    body={
                      tenant.rollout.rollbackPrepared
                        ? locale === "en"
                          ? "Tenant meets the rollback readiness checkpoint."
                          : "租戶已滿足 rollback readiness checkpoint。"
                        : locale === "en"
                          ? "Rollback owner or recovery notes still need confirmation."
                          : "仍需補齊 rollback owner 或 recovery notes。"
                    }
                  />
                  <CanvasBanner
                    theme={th}
                    tone={
                      acknowledgedRoles ===
                      tenant.bootstrapDefaults.roleDefaults.length
                        ? "success"
                        : "warn"
                    }
                    title={
                      locale === "en"
                        ? "role acknowledgements"
                        : "role acknowledgements"
                    }
                    body={
                      locale === "en"
                        ? `${acknowledgedRoles ?? 0}/${tenant.bootstrapDefaults.roleDefaults.length} bootstrap roles acknowledged.`
                        : `${acknowledgedRoles ?? 0}/${tenant.bootstrapDefaults.roleDefaults.length} 個 bootstrap roles 已完成確認。`
                    }
                  />
                  <CanvasBanner
                    theme={th}
                    tone={tenant.status === "rollback_hold" ? "warn" : "info"}
                    title={locale === "en" ? "cutover note" : "cutover note"}
                    body={tenant.rollout.notes ?? copy.noRolloutNotes}
                  />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {PLATFORM_TENANT_ROLLOUT_STAGES.map((stage) => (
                    <CanvasBtn
                      key={stage}
                      theme={th}
                      variant="secondary"
                      size="xs"
                      disabled={promotingStage === stage}
                      onClick={() => void promoteStage(stage)}
                    >
                      {promotingStage === stage
                        ? t("common.saving")
                        : `${copy.promote} ${formatPlatformCodeLabel(locale, stage)}`}
                    </CanvasBtn>
                  ))}
                </div>
              </div>
            </CanvasCard>
          </section>

          <div style={twoColumnGridStyle}>
            <section id="onboarding" style={sectionStyle}>
              <CanvasCard
                theme={th}
                title={copy.onboardingTitle}
                subtitle={copy.onboardingSubtitle}
              >
                <CanvasDL theme={th} cols={2} items={onboardingItems} />
              </CanvasCard>
            </section>

            <section id="roles" style={sectionStyle}>
              <CanvasCard
                theme={th}
                title={locale === "en" ? "Roles & invites" : "Roles & invites"}
                subtitle={copy.rolesSubtitle}
              >
                <CanvasTable theme={th} columns={roleColumns} rows={roleRows} />
              </CanvasCard>
            </section>
          </div>

          <div style={splitGridStyle}>
            <section id="overview" style={sectionStyle}>
              <CanvasCard
                theme={th}
                title={copy.overviewTitle}
                subtitle={copy.overviewSubtitle}
              >
                <CanvasDL theme={th} cols={2} items={overviewItems} />
              </CanvasCard>
            </section>

            <section id="modules" style={sectionStyle}>
              <CanvasCard
                theme={th}
                title={copy.modulesTitle}
                subtitle={copy.modulesSubtitle}
              >
                <div style={moduleGridStyle}>
                  {PLATFORM_TENANT_MODULES.map((moduleCode) => {
                    const enabled = tenant.enabledModules.includes(moduleCode);
                    return (
                      <div key={moduleCode} style={moduleCardStyle(enabled)}>
                        <strong style={{ color: th.text }}>
                          {moduleLabels[moduleCode]}
                        </strong>
                        <CanvasPill
                          theme={th}
                          tone={enabled ? "success" : "neutral"}
                          dot
                        >
                          {statusChipCopy(locale, enabled)}
                        </CanvasPill>
                        <span
                          style={{
                            color: th.textMuted,
                            fontSize: 11.5,
                            fontFamily: th.monoFamily,
                          }}
                        >
                          {formatPlatformCodeLabel(locale, moduleCode)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 16 }}>
                  <CanvasDL
                    theme={th}
                    cols={2}
                    items={[
                      {
                        label:
                          locale === "en" ? "Disabled scope" : "未啟用範圍",
                        value:
                          disabledModules.length > 0
                            ? disabledModules
                                .map((moduleCode) => moduleLabels[moduleCode])
                                .join(" · ")
                            : "—",
                      },
                      {
                        label: locale === "en" ? "Driver quota" : "司機配額",
                        value: formatLocaleNumber(
                          locale,
                          tenant.quotas.activeDrivers,
                        ),
                        mono: true,
                      },
                      {
                        label:
                          locale === "en" ? "Bookings / month" : "每月預約量",
                        value: formatLocaleNumber(
                          locale,
                          tenant.quotas.monthlyBookings,
                        ),
                        mono: true,
                      },
                      {
                        label:
                          locale === "en"
                            ? "API calls / month"
                            : "每月 API 呼叫",
                        value: formatLocaleNumber(
                          locale,
                          tenant.quotas.monthlyApiCalls,
                        ),
                        mono: true,
                      },
                    ]}
                  />
                </div>
              </CanvasCard>
            </section>
          </div>

          <div style={twoColumnGridStyle}>
            <CanvasCard
              theme={th}
              title={locale === "en" ? "Tenant settings" : "租戶設定"}
              subtitle={
                locale === "en"
                  ? "Identity, enabled modules, and quota allocations remain control-plane truth."
                  : "租戶身分、啟用模組與配額配置仍以 control-plane truth 為準。"
              }
            >
              <form onSubmit={handleSaveSettings}>
                <TenantIdentityFields
                  form={editForm}
                  setForm={(value) => {
                    setEditForm((current) => {
                      if (!current) {
                        return current;
                      }
                      return typeof value === "function"
                        ? value(current)
                        : value;
                    });
                  }}
                  t={t}
                  hideCode
                  hideStatus
                />
                <QuotaFields
                  form={editForm}
                  setForm={(value) => {
                    setEditForm((current) => {
                      if (!current) {
                        return current;
                      }
                      return typeof value === "function"
                        ? value(current)
                        : value;
                    });
                  }}
                  t={t}
                />
                <ModuleFields
                  form={editForm}
                  onToggle={(moduleCode) =>
                    setEditForm((current) =>
                      current
                        ? toggleTenantModule(current, moduleCode)
                        : current,
                    )
                  }
                  moduleLabels={moduleLabels}
                  t={t}
                />
                <CanvasBtn
                  theme={th}
                  variant="primary"
                  disabled={savingSettings || !editForm.name.trim()}
                >
                  {savingSettings ? t("common.saving") : copy.saveSettings}
                </CanvasBtn>
              </form>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title={copy.defaultsTitle}
              subtitle={copy.defaultsSubtitle}
            >
              <form onSubmit={handleSaveOnboarding}>
                <div style={formGridStyle}>
                  <CanvasField
                    theme={th}
                    label={t("tenants.form.invoiceTitle")}
                  >
                    <input
                      value={onboardingForm.invoiceTitle}
                      onChange={(event) =>
                        setOnboardingForm((current) =>
                          current
                            ? { ...current, invoiceTitle: event.target.value }
                            : current,
                        )
                      }
                      style={inputStyle}
                    />
                  </CanvasField>
                  <CanvasField
                    theme={th}
                    label={t("tenants.form.billingContactName")}
                  >
                    <input
                      value={onboardingForm.billingContactName}
                      onChange={(event) =>
                        setOnboardingForm((current) =>
                          current
                            ? {
                                ...current,
                                billingContactName: event.target.value,
                              }
                            : current,
                        )
                      }
                      style={inputStyle}
                    />
                  </CanvasField>
                  <CanvasField
                    theme={th}
                    label={t("tenants.form.billingContactEmail")}
                  >
                    <input
                      value={onboardingForm.billingContactEmail}
                      onChange={(event) =>
                        setOnboardingForm((current) =>
                          current
                            ? {
                                ...current,
                                billingContactEmail: event.target.value,
                              }
                            : current,
                        )
                      }
                      style={inputStyle}
                    />
                  </CanvasField>
                  <CanvasField
                    theme={th}
                    label={t("tenants.form.integrationMode")}
                  >
                    <select
                      value={onboardingForm.integrationMode}
                      onChange={(event) =>
                        setOnboardingForm((current) =>
                          current
                            ? {
                                ...current,
                                integrationMode: event.target
                                  .value as OnboardingFormState["integrationMode"],
                              }
                            : current,
                        )
                      }
                      style={inputStyle}
                    >
                      {[
                        "none",
                        "api_key",
                        "api_key_and_webhook",
                        "partner_managed",
                      ].map((mode) => (
                        <option key={mode} value={mode}>
                          {mode}
                        </option>
                      ))}
                    </select>
                  </CanvasField>
                  <CanvasField
                    theme={th}
                    label={t("tenants.form.sandboxBaseUrl")}
                  >
                    <input
                      value={onboardingForm.sandboxBaseUrl}
                      onChange={(event) =>
                        setOnboardingForm((current) =>
                          current
                            ? { ...current, sandboxBaseUrl: event.target.value }
                            : current,
                        )
                      }
                      style={monoInputStyle}
                    />
                  </CanvasField>
                  <CanvasField
                    theme={th}
                    label={t("tenants.form.productionBaseUrl")}
                  >
                    <input
                      value={onboardingForm.productionBaseUrl}
                      onChange={(event) =>
                        setOnboardingForm((current) =>
                          current
                            ? {
                                ...current,
                                productionBaseUrl: event.target.value,
                              }
                            : current,
                        )
                      }
                      style={monoInputStyle}
                    />
                  </CanvasField>
                  <div style={fullSpanStyle}>
                    <CanvasField
                      theme={th}
                      label={t("tenants.form.apiKeyScopes")}
                    >
                      <input
                        value={onboardingForm.apiKeyScopes}
                        onChange={(event) =>
                          setOnboardingForm((current) =>
                            current
                              ? { ...current, apiKeyScopes: event.target.value }
                              : current,
                          )
                        }
                        style={monoInputStyle}
                      />
                    </CanvasField>
                  </div>
                  <div style={fullSpanStyle}>
                    <CanvasField
                      theme={th}
                      label={t("tenants.form.webhookEvents")}
                    >
                      <input
                        value={onboardingForm.webhookEvents}
                        onChange={(event) =>
                          setOnboardingForm((current) =>
                            current
                              ? {
                                  ...current,
                                  webhookEvents: event.target.value,
                                }
                              : current,
                          )
                        }
                        style={monoInputStyle}
                      />
                    </CanvasField>
                  </div>
                  <CanvasField
                    theme={th}
                    label={t("tenants.form.cutoverOwner")}
                  >
                    <input
                      value={onboardingForm.cutoverOwner}
                      onChange={(event) =>
                        setOnboardingForm((current) =>
                          current
                            ? { ...current, cutoverOwner: event.target.value }
                            : current,
                        )
                      }
                      style={inputStyle}
                    />
                  </CanvasField>
                  <CanvasField
                    theme={th}
                    label={t("tenants.form.rollbackOwner")}
                  >
                    <input
                      value={onboardingForm.rollbackOwner}
                      onChange={(event) =>
                        setOnboardingForm((current) =>
                          current
                            ? { ...current, rollbackOwner: event.target.value }
                            : current,
                        )
                      }
                      style={inputStyle}
                    />
                  </CanvasField>
                  <div style={fullSpanStyle}>
                    <CanvasField
                      theme={th}
                      label={t("tenants.form.rolloutNotes")}
                    >
                      <textarea
                        value={onboardingForm.notes}
                        onChange={(event) =>
                          setOnboardingForm((current) =>
                            current
                              ? { ...current, notes: event.target.value }
                              : current,
                          )
                        }
                        rows={4}
                        style={textAreaStyle}
                      />
                    </CanvasField>
                  </div>
                  <label style={checkboxRowStyle}>
                    <input
                      type="checkbox"
                      checked={onboardingForm.rollbackPrepared}
                      onChange={(event) =>
                        setOnboardingForm((current) =>
                          current
                            ? {
                                ...current,
                                rollbackPrepared: event.target.checked,
                              }
                            : current,
                        )
                      }
                    />
                    <span>{t("tenants.form.rollbackPrepared")}</span>
                  </label>
                </div>
                <CanvasBtn
                  theme={th}
                  variant="primary"
                  disabled={savingOnboarding}
                >
                  {savingOnboarding ? t("common.saving") : copy.saveOnboarding}
                </CanvasBtn>
              </form>
            </CanvasCard>
          </div>

          <div style={twoColumnGridStyle}>
            <section id="webhooks" style={sectionStyle}>
              <CanvasCard
                theme={th}
                title={copy.webhooksTitle}
                subtitle={copy.webhooksSubtitle}
              >
                <CanvasDL theme={th} cols={2} items={webhookItems} />
                <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
                  {tenant.bootstrapDefaults.notificationSubscriptions.length >
                  0 ? (
                    tenant.bootstrapDefaults.notificationSubscriptions.map(
                      (subscription, index) => (
                        <div
                          key={`${subscription.channel}-${subscription.eventType}-${index}`}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                            padding: "12px 14px",
                            borderRadius: 10,
                            border: `1px solid ${th.border}`,
                            background: th.surfaceLo,
                          }}
                        >
                          <div style={{ display: "grid", gap: 4 }}>
                            <span style={{ color: th.text, fontWeight: 600 }}>
                              {subscription.channel}
                            </span>
                            <span
                              style={{
                                color: th.textMuted,
                                fontSize: 11.5,
                                fontFamily: th.monoFamily,
                              }}
                            >
                              {subscription.eventType}
                            </span>
                          </div>
                          <CanvasPill
                            theme={th}
                            tone={subscription.enabled ? "success" : "neutral"}
                            dot
                          >
                            {statusChipCopy(locale, subscription.enabled)}
                          </CanvasPill>
                        </div>
                      ),
                    )
                  ) : (
                    <CanvasBanner
                      theme={th}
                      tone="warn"
                      title={
                        locale === "en"
                          ? "Webhook baseline is incomplete"
                          : "Webhook baseline 尚未補齊"
                      }
                      body={copy.noSubscriptions}
                    />
                  )}
                </div>
              </CanvasCard>
            </section>

            <section id="billing" style={sectionStyle}>
              <CanvasCard
                theme={th}
                title={copy.billingTitle}
                subtitle={copy.billingSubtitle}
              >
                <CanvasDL theme={th} cols={2} items={billingItems} />
                <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
                  {tenant.bootstrapDefaults.notificationSubscriptions.length >
                  0 ? (
                    tenant.bootstrapDefaults.notificationSubscriptions.map(
                      (subscription, index) => (
                        <CanvasBanner
                          key={`${subscription.eventType}-${subscription.channel}-${index}`}
                          theme={th}
                          tone={subscription.enabled ? "info" : "warn"}
                          title={subscription.eventType}
                          body={`${subscription.channel} · ${statusChipCopy(locale, subscription.enabled)}`}
                        />
                      ),
                    )
                  ) : (
                    <CanvasBanner
                      theme={th}
                      tone="warn"
                      title={
                        locale === "en"
                          ? "No notification subscriptions"
                          : "沒有通知訂閱設定"
                      }
                      body={copy.noSubscriptions}
                    />
                  )}
                </div>
              </CanvasCard>
            </section>
          </div>

          <div style={splitGridStyle}>
            <section id="audit" style={sectionStyle}>
              <CanvasCard
                theme={th}
                title={copy.auditTitle}
                subtitle={copy.auditSubtitle}
                actions={
                  <Link href="/audit">
                    <CanvasBtn theme={th} variant="secondary" size="xs">
                      Audit ledger
                    </CanvasBtn>
                  </Link>
                }
              >
                {auditRows.length > 0 ? (
                  <CanvasTable
                    theme={th}
                    columns={auditColumns}
                    rows={auditRows}
                  />
                ) : (
                  <CanvasBanner
                    theme={th}
                    tone="info"
                    title={
                      locale === "en"
                        ? "No tenant audit yet"
                        : "此 tenant 尚無 audit 紀錄"
                    }
                    body={copy.noAudit}
                  />
                )}
              </CanvasCard>
            </section>

            <CanvasCard
              theme={th}
              title={copy.lifecycleTitle}
              subtitle={copy.lifecycleSubtitle}
            >
              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <CanvasPill
                    theme={th}
                    tone={toCanvasTone(tenantStatusTone(tenant.status))}
                    dot
                  >
                    {formatPlatformCodeLabel(locale, tenant.status)}
                  </CanvasPill>
                  <CanvasPill
                    theme={th}
                    tone={tenant.rollout.rollbackPrepared ? "success" : "warn"}
                    dot
                  >
                    {tenant.rollout.rollbackPrepared
                      ? locale === "en"
                        ? "Rollback prepared"
                        : "Rollback 已備妥"
                      : locale === "en"
                        ? "Rollback pending"
                        : "Rollback 待補"}
                  </CanvasPill>
                </div>
                {tenant.status === "rollback_hold" ? (
                  <CanvasBanner
                    theme={th}
                    tone="warn"
                    title={
                      locale === "en"
                        ? "Rollback hold is active"
                        : "Rollback hold 已啟用"
                    }
                    body={
                      locale === "en"
                        ? "Review the rollout note, owners, and recent audit evidence before restoring promotion flow."
                        : "恢復 promotion flow 前，請先確認 rollout 備註、owner 與最近 audit 證據。"
                    }
                  />
                ) : null}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {tenant.status === "active" ? (
                    <CanvasBtn
                      theme={th}
                      variant="secondary"
                      disabled={lifecycleAction === "suspend"}
                      onClick={() => void runLifecycle("suspend")}
                    >
                      {copy.suspend}
                    </CanvasBtn>
                  ) : (
                    <CanvasBtn
                      theme={th}
                      variant="secondary"
                      disabled={lifecycleAction === "activate"}
                      onClick={() => void runLifecycle("activate")}
                    >
                      {copy.activate}
                    </CanvasBtn>
                  )}
                  <CanvasBtn
                    theme={th}
                    variant="secondary"
                    disabled={lifecycleAction === "rollback_hold"}
                    onClick={() => void runLifecycle("rollback_hold")}
                  >
                    {copy.rollback}
                  </CanvasBtn>
                </div>
              </div>
            </CanvasCard>
          </div>
        </div>
      </div>
    </CanvasShell>
  );
}
