"use client";

import { useParams, useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  PlatformTenantBootstrapRoleDefault,
  PlatformTenantRolloutStage,
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
  Stepper,
  buildCanvasTheme,
  type CanvasTheme,
  type CanvasTone,
  type StepState,
  type StepperItem,
} from "@drts/ui-web";

const BODY_CLASS = "canvas-tenant-detail-route";

const CANVAS_THEME = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const STAGE_INDEX: Record<PlatformTenantRolloutStage, number> = {
  sandbox: 0,
  pilot: 1,
  production: 2,
};

const sectionStackStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
} satisfies React.CSSProperties;

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
    STAGE_INDEX[tenant.rollout.stage] > STAGE_INDEX[stage]
  ) {
    return "complete";
  }
  if (tenant.rollout.stage === stage) {
    return "current";
  }
  return "upcoming";
}

function toCanvasTone(
  tone: "neutral" | "success" | "warning" | "danger" | "info",
): CanvasTone {
  if (tone === "warning") {
    return "warn";
  }
  return tone;
}

function buttonStyle(
  theme: CanvasTheme,
  variant: "primary" | "secondary" = "secondary",
  disabled = false,
): React.CSSProperties {
  const palette =
    variant === "primary"
      ? {
          background: theme.accent,
          color: "#ffffff",
          border: theme.accent,
        }
      : {
          background: theme.surface,
          color: theme.text,
          border: theme.border,
        };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 28,
    padding: "5px 10px",
    borderRadius: 7,
    border: `1px solid ${palette.border}`,
    background: palette.background,
    color: palette.color,
    fontFamily: theme.fontFamily,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
  };
}

function inputStyle(theme: CanvasTheme): React.CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 10px",
    borderRadius: 7,
    border: `1px solid ${theme.border}`,
    background: theme.bgRaised,
    color: theme.text,
    fontFamily: theme.fontFamily,
    fontSize: 12.5,
    lineHeight: 1.4,
  };
}

function textareaStyle(theme: CanvasTheme): React.CSSProperties {
  return {
    ...inputStyle(theme),
    minHeight: 96,
    resize: "vertical",
  };
}

function roleStateTone(role: PlatformTenantBootstrapRoleDefault): CanvasTone {
  if (role.acknowledgedAt) {
    return "success";
  }
  if (role.invitedAt) {
    return "warn";
  }
  return role.required ? "warn" : "neutral";
}

function roleStateLabel(
  locale: string,
  t: (key: string, params?: Record<string, string | number>) => string,
  role: PlatformTenantBootstrapRoleDefault,
) {
  if (role.acknowledgedAt) {
    return t("tenants.role.acknowledged");
  }
  if (role.invitedAt) {
    return t("tenants.role.invited");
  }
  return locale === "en" ? "Pending" : "待處理";
}

function listText(values: readonly string[], emptyText = "—") {
  return values.length > 0 ? values.join(" · ") : emptyText;
}

function getCanvasNav(locale: string) {
  if (locale === "en") {
    return [
      { divider: "Workspace" },
      { key: "home", href: "/", icon: "home", label: "Governance Home" },
      {
        key: "health",
        href: "/health",
        icon: "health",
        label: "Platform Health",
      },
      { divider: "Tenant Governance" },
      { key: "tenants", href: "/tenants", icon: "tenants", label: "Tenants" },
      {
        key: "partners",
        href: "/partners",
        icon: "partners",
        label: "Partner Entry",
      },
      { key: "users", href: "/users", icon: "users", label: "Platform Staff" },
      { divider: "Fleet & Compliance" },
      {
        key: "fleet",
        href: "/fleet",
        icon: "fleet",
        label: "Fleet & Compliance",
      },
      {
        key: "switchboard",
        href: "/switchboard",
        icon: "switchboard",
        label: "Public Info & Placards",
      },
      { divider: "Pricing & Settlement" },
      {
        key: "pricing",
        href: "/pricing",
        icon: "pricing",
        label: "Pricing",
      },
      {
        key: "payments",
        href: "/payments",
        icon: "payments",
        label: "Settlement Governance",
      },
      { divider: "Platform Layer" },
      {
        key: "notices",
        href: "/notices",
        icon: "notices",
        label: "Notices & Maintenance",
      },
      {
        key: "audit",
        href: "/audit",
        icon: "audit",
        label: "Audit & Evidence",
      },
      {
        key: "flags",
        href: "/feature-flags",
        icon: "flags",
        label: "Feature Flags",
      },
      {
        key: "adapters",
        href: "/adapter-registry",
        icon: "adapters",
        label: "Adapter Registry",
      },
    ];
  }

  return [
    { divider: "工作面" },
    { key: "home", href: "/", icon: "home", label: "工作首頁" },
    { key: "health", href: "/health", icon: "health", label: "平台健康" },
    { divider: "租戶治理" },
    { key: "tenants", href: "/tenants", icon: "tenants", label: "租戶" },
    {
      key: "partners",
      href: "/partners",
      icon: "partners",
      label: "合作夥伴 entry",
    },
    { key: "users", href: "/users", icon: "users", label: "平台人員" },
    { divider: "車隊與法遵" },
    { key: "fleet", href: "/fleet", icon: "fleet", label: "車隊與合規" },
    {
      key: "switchboard",
      href: "/switchboard",
      icon: "switchboard",
      label: "法定資訊與牌貼",
    },
    { divider: "計價與結算" },
    { key: "pricing", href: "/pricing", icon: "pricing", label: "計價" },
    { key: "payments", href: "/payments", icon: "payments", label: "結算治理" },
    { divider: "平台層" },
    {
      key: "notices",
      href: "/notices",
      icon: "notices",
      label: "公告與維護",
    },
    { key: "audit", href: "/audit", icon: "audit", label: "稽核與證據" },
    {
      key: "flags",
      href: "/feature-flags",
      icon: "flags",
      label: "功能旗標",
    },
    {
      key: "adapters",
      href: "/adapter-registry",
      icon: "adapters",
      label: "介接登錄",
    },
  ];
}

type RoleRow = {
  roleCode: string;
  displayName: string;
  required: boolean;
  invitedAt: string | null;
  acknowledgedAt: string | null;
};

type AuditRow = {
  auditId: string;
  createdAt: string;
  moduleLabel: string;
  actionLabel: string;
  resourceType: string;
  resourceId: string;
  requestId: string;
};

export default function TenantDetailPage() {
  const params = useParams<{ tenantId: string }>();
  const router = useRouter();
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

  useEffect(() => {
    document.body.classList.add(BODY_CLASS);
    return () => {
      document.body.classList.remove(BODY_CLASS);
    };
  }, []);

  const copy = useMemo(
    () =>
      locale === "en"
        ? {
            back: "Back to tenants",
            refresh: "Refresh detail",
            title: "Tenant detail",
            subtitle:
              "Govern rollout, onboarding defaults, quota posture, role acknowledgements, and tenant-scoped audit evidence.",
            overviewTitle: "Overview",
            overviewSubtitle:
              "Core identity, lifecycle timestamps, and current governance posture for this tenant.",
            modulesTitle: "Modules",
            modulesSubtitle:
              "Enabled product scope and monthly quota baselines remain platform-owned settings.",
            onboardingTitle: "Onboarding package",
            onboardingSubtitle:
              "Bootstrap package, webhook baseline, and billing defaults used before each formal promotion.",
            defaultsTitle: "Edit onboarding defaults",
            defaultsSubtitle:
              "Update the bootstrap package before the next rollout promotion command is issued.",
            rolloutTitle: "Rollout progress",
            rolesTitle: "Roles & invites",
            rolesSubtitle:
              "Bootstrap role invite and acknowledgement gaps stay explicit before production rollout.",
            webhooksTitle: "Webhook baseline",
            webhooksSubtitle:
              "Govern webhook event scope and notification channels without turning this page into delivery operations.",
            billingTitle: "Billing baseline",
            billingSubtitle:
              "Invoice title, contact path, and notification posture used as tenant bootstrap defaults.",
            auditTitle: "Audit",
            auditSubtitle:
              "Latest tenant-scoped governance events with request and resource context.",
            lifecycleTitle: "Lifecycle controls",
            lifecycleSubtitle:
              "These actions change control-plane availability and should follow the rollout evidence shown above.",
            unavailableTitle: "Tenant unavailable",
            unavailableBody: "Tenant not found or no longer available.",
            updateFailedTitle: "Unable to update tenant",
            rollbackHoldTitle: "Rollback hold is active",
            rollbackHoldBody:
              "Review the rollout note, cutover owner, rollback owner, and recent audit trail before restoring promotion flow.",
            noRolloutNotes: "No rollout note recorded.",
            noAudit: "No tenant-scoped audit records found yet.",
            noWebhookEvents: "No webhook events configured.",
            noSubscriptions: "No notification subscriptions configured.",
            noScopes: "No API scopes configured.",
            noCutoverOwner: "No cutover owner recorded.",
            noRollbackOwner: "No rollback owner recorded.",
            loading: t("tenants.loading"),
            saveSettings: "Save settings",
            saveOnboarding: "Save onboarding",
            promote: "Promote to",
            required: "Required",
            optional: "Optional",
            auditLedger: "Audit ledger",
            pending: "Pending",
            rolloutPath: "sandbox -> pilot -> production",
            tabs: [
              "Overview",
              "Modules",
              "Onboarding",
              "Rollout",
              "Roles",
              "Webhook baseline",
              "Billing baseline",
              "Audit",
            ],
          }
        : {
            back: "返回租戶列表",
            refresh: "重新整理詳情",
            title: "租戶詳情",
            subtitle:
              "治理 tenant 的 rollout、onboarding defaults、配額、角色確認與 tenant-scoped audit 證據。",
            overviewTitle: "Overview",
            overviewSubtitle:
              "此 tenant 的核心識別、生命週期時間點與目前治理姿態。",
            modulesTitle: "Modules",
            modulesSubtitle: "產品模組啟用範圍與每月配額基線仍由平台端維護。",
            onboardingTitle: "Onboarding package",
            onboardingSubtitle:
              "在每次正式 promotion 前，用來檢視 bootstrap package、webhook baseline 與 billing defaults。",
            defaultsTitle: "編輯 onboarding defaults",
            defaultsSubtitle:
              "在下一次 rollout promotion command 前先更新 bootstrap package。",
            rolloutTitle: "Rollout 進度",
            rolesTitle: "Roles & invites",
            rolesSubtitle:
              "把 bootstrap role 的 invite 與 acknowledgement 缺口留在同一個治理面上。",
            webhooksTitle: "Webhook baseline",
            webhooksSubtitle:
              "治理 webhook event scope 與 notification channel，但不把這頁混成 delivery operations。",
            billingTitle: "Billing baseline",
            billingSubtitle:
              "Tenant bootstrap defaults 使用的 invoice title、聯絡窗口與通知姿態。",
            auditTitle: "Audit",
            auditSubtitle:
              "顯示此 tenant 最近的治理事件、request 與 resource 脈絡。",
            lifecycleTitle: "Lifecycle controls",
            lifecycleSubtitle:
              "這些動作會直接改變 control-plane availability，應依照上方 rollout 證據操作。",
            unavailableTitle: "租戶目前不可用",
            unavailableBody: "找不到此租戶，或目前已無法讀取。",
            updateFailedTitle: "租戶更新失敗",
            rollbackHoldTitle: "Rollback hold 已啟用",
            rollbackHoldBody:
              "恢復 promotion flow 前，請先確認 rollout 備註、cutover owner、rollback owner 與最近 audit trail。",
            noRolloutNotes: "尚未留下 rollout 備註。",
            noAudit: "目前沒有此 tenant 的 audit 紀錄。",
            noWebhookEvents: "尚未設定 webhook events。",
            noSubscriptions: "尚未設定 notification subscriptions。",
            noScopes: "尚未設定 API scopes。",
            noCutoverOwner: "尚未記錄 cutover owner。",
            noRollbackOwner: "尚未記錄 rollback owner。",
            loading: t("tenants.loading"),
            saveSettings: "儲存設定",
            saveOnboarding: "儲存 onboarding",
            promote: "推進到",
            required: "必要",
            optional: "選填",
            auditLedger: "Audit ledger",
            pending: "待處理",
            rolloutPath: "sandbox -> pilot -> production",
            tabs: [
              "Overview",
              "Modules",
              "Onboarding",
              "Rollout",
              "Roles",
              "Webhook baseline",
              "Billing baseline",
              "Audit",
            ],
          },
    [locale, t],
  );

  const moduleLabels = useMemo(() => createTenantModuleLabels(t), [t]);
  const navItems = useMemo(() => getCanvasNav(locale), [locale]);

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
          .filter((entry) => entry.tenantId === record.id)
          .sort(
            (left, right) =>
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

  const shellProps = {
    theme: CANVAS_THEME,
    nav: navItems,
    active: "tenants",
    brandLabel: t("app.name"),
    brandSubLabel: t("app.sub"),
    env: "staging",
    currentPath: "/tenants",
    style: { height: "100vh" },
  } as const;

  if (loading) {
    return (
      <>
        <style jsx global>{`
          body.${BODY_CLASS} {
            margin: 0;
            overflow: hidden;
            background: ${CANVAS_THEME.bg};
          }
          body.${BODY_CLASS} > aside {
            display: none !important;
          }
          body.${BODY_CLASS} > main {
            padding: 0 !important;
            min-height: 100vh !important;
            background: ${CANVAS_THEME.bg} !important;
          }
        `}</style>
        <CanvasShell {...shellProps}>
          <CanvasPageHeader
            theme={CANVAS_THEME}
            title={copy.title}
            subtitle={copy.subtitle}
            tabs={copy.tabs}
            activeTab="Rollout"
            actions={
              <CanvasBtn
                theme={CANVAS_THEME}
                variant="secondary"
                onClick={() => router.push("/tenants")}
              >
                {copy.back}
              </CanvasBtn>
            }
          />
          <div style={{ padding: 24 }}>
            <CanvasBanner
              theme={CANVAS_THEME}
              tone="info"
              icon="clock"
              title={copy.loading}
              body={copy.subtitle}
            />
          </div>
        </CanvasShell>
      </>
    );
  }

  if (!tenant) {
    return (
      <>
        <style jsx global>{`
          body.${BODY_CLASS} {
            margin: 0;
            overflow: hidden;
            background: ${CANVAS_THEME.bg};
          }
          body.${BODY_CLASS} > aside {
            display: none !important;
          }
          body.${BODY_CLASS} > main {
            padding: 0 !important;
            min-height: 100vh !important;
            background: ${CANVAS_THEME.bg} !important;
          }
        `}</style>
        <CanvasShell {...shellProps}>
          <CanvasPageHeader
            theme={CANVAS_THEME}
            title={copy.title}
            subtitle={copy.subtitle}
            tabs={copy.tabs}
            activeTab="Rollout"
            actions={
              <CanvasBtn
                theme={CANVAS_THEME}
                variant="secondary"
                onClick={() => router.push("/tenants")}
              >
                {copy.back}
              </CanvasBtn>
            }
          />
          <div style={{ padding: 24 }}>
            <CanvasBanner
              theme={CANVAS_THEME}
              tone="danger"
              icon="warn"
              title={copy.unavailableTitle}
              body={error ?? copy.unavailableBody}
            />
          </div>
        </CanvasShell>
      </>
    );
  }

  const rolloutSteps: StepperItem[] = [
    {
      id: "created",
      title: locale === "en" ? "Created" : "建立",
      description: formatDateTime(tenant.createdAt),
      state: "complete",
      tone: "success",
    },
    ...PLATFORM_TENANT_ROLLOUT_STAGES.map((stage) => ({
      id: stage,
      title: formatPlatformCodeLabel(locale, stage),
      description: `gate · ${tenant.rollout[`${stage}Status`]}`,
      state: rolloutStepState(tenant, stage),
      tone: tenantStageTone(tenant.rollout[`${stage}Status`]),
      timestamp: tenant.rollout.lastPromotedAt
        ? formatDateTime(tenant.rollout.lastPromotedAt)
        : undefined,
    })),
    {
      id: "rollback",
      title: locale === "en" ? "Rollback ready" : "Rollback ready",
      description: tenant.rollout.rollbackOwner ?? copy.noRollbackOwner,
      state: tenant.rollout.rollbackPrepared ? "complete" : "upcoming",
      tone: tenant.rollout.rollbackPrepared ? "success" : "warning",
    },
  ];

  const acknowledgedRoles = tenant.bootstrapDefaults.roleDefaults.filter(
    (role) => role.acknowledgedAt,
  ).length;
  const requiredRoles = tenant.bootstrapDefaults.roleDefaults.filter(
    (role) => role.required,
  ).length;
  const invitedRoles = tenant.bootstrapDefaults.roleDefaults.filter(
    (role) => role.invitedAt,
  ).length;
  const approvedGateCount = PLATFORM_TENANT_ROLLOUT_STAGES.filter(
    (stage) => tenant.rollout[`${stage}Status`] === "approved",
  ).length;
  const disabledModules = PLATFORM_TENANT_MODULES.filter(
    (moduleCode) => !tenant.enabledModules.includes(moduleCode),
  );
  const recentAudit = auditRecords.slice(0, 6);
  const nextRolloutStage =
    PLATFORM_TENANT_ROLLOUT_STAGES.find(
      (stage) => STAGE_INDEX[stage] > STAGE_INDEX[tenant.rollout.stage],
    ) ?? null;
  const headerPromotionStage = nextRolloutStage ?? tenant.rollout.stage;

  const overviewItems = [
    { k: "TENANT ID", v: tenant.id, mono: true },
    { k: "TENANT CODE", v: tenant.code, mono: true },
    {
      k: locale === "en" ? "STATUS" : "STATUS",
      v: formatPlatformCodeLabel(locale, tenant.status),
    },
    {
      k: locale === "en" ? "ROLLOUT STAGE" : "ROLLOUT STAGE",
      v: formatPlatformCodeLabel(locale, tenant.rollout.stage),
    },
    {
      k: locale === "en" ? "CREATED AT" : "CREATED AT",
      v: formatDateTime(tenant.createdAt),
      mono: true,
    },
    {
      k: locale === "en" ? "UPDATED AT" : "UPDATED AT",
      v: formatDateTime(tenant.updatedAt),
      mono: true,
    },
    {
      k: locale === "en" ? "CUTOVER OWNER" : "CUTOVER OWNER",
      v: tenant.rollout.cutoverOwner ?? copy.noCutoverOwner,
    },
    {
      k: locale === "en" ? "ROLLBACK OWNER" : "ROLLBACK OWNER",
      v: tenant.rollout.rollbackOwner ?? copy.noRollbackOwner,
    },
  ];

  const moduleItems = [
    {
      k: locale === "en" ? "ENABLED MODULES" : "ENABLED MODULES",
      v: listText(
        tenant.enabledModules.map((moduleCode) => moduleLabels[moduleCode]),
      ),
    },
    {
      k: locale === "en" ? "DISABLED MODULES" : "DISABLED MODULES",
      v: listText(
        disabledModules.map((moduleCode) => moduleLabels[moduleCode]),
      ),
    },
    {
      k: locale === "en" ? "ACTIVE DRIVERS" : "ACTIVE DRIVERS",
      v: tenant.quotas.activeDrivers.toLocaleString(),
      mono: true,
    },
    {
      k: locale === "en" ? "MONTHLY BOOKINGS" : "MONTHLY BOOKINGS",
      v: tenant.quotas.monthlyBookings.toLocaleString(),
      mono: true,
    },
    {
      k: locale === "en" ? "MONTHLY API CALLS" : "MONTHLY API CALLS",
      v: tenant.quotas.monthlyApiCalls.toLocaleString(),
      mono: true,
    },
    {
      k: locale === "en" ? "INTEGRATION" : "INTEGRATION",
      v: formatPlatformCodeLabel(locale, tenant.integrationPackage.mode),
    },
  ];

  const onboardingItems = [
    {
      k: "INTEGRATION MODE",
      v: formatPlatformCodeLabel(locale, tenant.integrationPackage.mode),
      mono: true,
    },
    {
      k: "BILLING BASELINE",
      v: tenant.bootstrapDefaults.billingBaseline.invoiceTitle,
    },
    {
      k: "SANDBOX BASE URL",
      v: tenant.integrationPackage.sandboxBaseUrl ?? "—",
      mono: true,
    },
    {
      k: "PRODUCTION BASE URL",
      v: tenant.integrationPackage.productionBaseUrl ?? "—",
      mono: true,
    },
    {
      k: "WEBHOOK BASELINE",
      v:
        tenant.bootstrapDefaults.webhookEvents.length > 0
          ? tenant.bootstrapDefaults.webhookEvents.join(" · ")
          : copy.noWebhookEvents,
      mono: true,
    },
    {
      k: "API KEY SCOPES",
      v:
        tenant.integrationPackage.apiKeyScopes.length > 0
          ? tenant.integrationPackage.apiKeyScopes.join(" · ")
          : copy.noScopes,
      mono: true,
    },
    {
      k: locale === "en" ? "QUOTA / MONTH" : "QUOTA / MONTH",
      v: `${tenant.quotas.monthlyBookings.toLocaleString()} bookings`,
      mono: true,
    },
    {
      k: locale === "en" ? "BILLING CONTACT" : "BILLING CONTACT",
      v: tenant.bootstrapDefaults.billingBaseline.email,
      mono: true,
    },
  ];

  const webhookItems = [
    {
      k: locale === "en" ? "EVENT SCOPE" : "EVENT SCOPE",
      v:
        tenant.bootstrapDefaults.webhookEvents.length > 0
          ? tenant.bootstrapDefaults.webhookEvents.join(" · ")
          : copy.noWebhookEvents,
      mono: true,
    },
    {
      k: locale === "en" ? "API KEY SCOPES" : "API KEY SCOPES",
      v:
        tenant.integrationPackage.apiKeyScopes.length > 0
          ? tenant.integrationPackage.apiKeyScopes.join(" · ")
          : copy.noScopes,
      mono: true,
    },
  ];

  const billingItems = [
    {
      k: locale === "en" ? "INVOICE TITLE" : "INVOICE TITLE",
      v: tenant.bootstrapDefaults.billingBaseline.invoiceTitle,
    },
    {
      k: locale === "en" ? "CONTACT NAME" : "CONTACT NAME",
      v: tenant.bootstrapDefaults.billingBaseline.contactName,
    },
    {
      k: locale === "en" ? "BILLING EMAIL" : "BILLING EMAIL",
      v: tenant.bootstrapDefaults.billingBaseline.email,
      mono: true,
    },
    {
      k: locale === "en" ? "NOTIFICATION COUNT" : "NOTIFICATION COUNT",
      v: tenant.bootstrapDefaults.notificationSubscriptions.length.toString(),
      mono: true,
    },
  ];

  const roleRows: RoleRow[] = tenant.bootstrapDefaults.roleDefaults.map(
    (role) => ({
      roleCode: role.roleCode,
      displayName: role.displayName,
      required: role.required,
      invitedAt: role.invitedAt,
      acknowledgedAt: role.acknowledgedAt,
    }),
  );

  const auditRows: AuditRow[] = recentAudit.map((record) => ({
    auditId: record.auditId,
    createdAt: formatDateTime(record.createdAt),
    moduleLabel: record.moduleName
      ? formatPlatformCodeLabel(locale, record.moduleName)
      : "—",
    actionLabel: record.actionName
      ? formatPlatformCodeLabel(locale, record.actionName)
      : "—",
    resourceType: record.resourceType || "—",
    resourceId: record.resourceId ?? "—",
    requestId: truncate(record.requestId || "—", 14),
  }));

  const rolloutSubtitle = `${copy.rolloutPath} · ${
    locale === "en" ? "cutover owner" : "cutover owner"
  }: ${tenant.rollout.cutoverOwner ?? copy.noCutoverOwner} · ${
    locale === "en" ? "rollback owner" : "rollback owner"
  }: ${tenant.rollout.rollbackOwner ?? copy.noRollbackOwner}`;

  const breadcrumb =
    locale === "en"
      ? ["Tenant Governance", "Tenants", tenant.name]
      : ["租戶治理", "租戶", tenant.name];

  return (
    <>
      <style jsx global>{`
        body.${BODY_CLASS} {
          margin: 0;
          overflow: hidden;
          background: ${CANVAS_THEME.bg};
        }
        body.${BODY_CLASS} > aside {
          display: none !important;
        }
        body.${BODY_CLASS} > main {
          padding: 0 !important;
          min-height: 100vh !important;
          background: ${CANVAS_THEME.bg} !important;
        }
      `}</style>
      <CanvasShell {...shellProps} breadcrumb={breadcrumb}>
        <CanvasPageHeader
          theme={CANVAS_THEME}
          title={tenant.name}
          subtitle={`${tenant.code} · ${tenant.id}`}
          tabs={copy.tabs}
          activeTab="Rollout"
          actions={
            <>
              <CanvasBtn
                theme={CANVAS_THEME}
                variant="secondary"
                onClick={() => {
                  void loadTenant();
                }}
              >
                {copy.refresh}
              </CanvasBtn>
              <CanvasBtn
                theme={CANVAS_THEME}
                variant="primary"
                icon="check"
                disabled={
                  !nextRolloutStage || promotingStage === headerPromotionStage
                }
                onClick={() => {
                  if (nextRolloutStage) {
                    void promoteStage(nextRolloutStage);
                  }
                }}
              >
                {promotingStage === headerPromotionStage
                  ? t("common.saving")
                  : `${copy.promote} ${formatPlatformCodeLabel(locale, headerPromotionStage)}`}
              </CanvasBtn>
            </>
          }
        />

        <div
          style={{
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {error ? (
            <CanvasBanner
              theme={CANVAS_THEME}
              tone="danger"
              icon="warn"
              title={copy.updateFailedTitle}
              body={error}
            />
          ) : null}

          {tenant.status === "rollback_hold" ? (
            <CanvasBanner
              theme={CANVAS_THEME}
              tone="warn"
              icon="warn"
              title={copy.rollbackHoldTitle}
              body={copy.rollbackHoldBody}
            />
          ) : null}

          <CanvasCard
            theme={CANVAS_THEME}
            title={copy.rolloutTitle}
            subtitle={rolloutSubtitle}
          >
            <div style={{ padding: "6px 0 16px" }}>
              <Stepper
                items={rolloutSteps}
                orientation="horizontal"
                density="compact"
              />
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <CanvasBanner
                theme={CANVAS_THEME}
                tone={tenant.rollout.rollbackPrepared ? "success" : "warn"}
                icon={tenant.rollout.rollbackPrepared ? "ok" : "warn"}
                title="rollbackPrepared"
                body={
                  tenant.rollout.rollbackPrepared
                    ? locale === "en"
                      ? "Tenant satisfies the current rollback readiness gate."
                      : "租戶已滿足目前 rollback readiness gate。"
                    : locale === "en"
                      ? "Rollback readiness is incomplete and should be reviewed before the next promotion."
                      : "Rollback readiness 尚未補齊，下一次 promotion 前應先完成檢視。"
                }
              />
              <CanvasBanner
                theme={CANVAS_THEME}
                tone={
                  acknowledgedRoles ===
                  tenant.bootstrapDefaults.roleDefaults.length
                    ? "success"
                    : "warn"
                }
                icon={
                  acknowledgedRoles ===
                  tenant.bootstrapDefaults.roleDefaults.length
                    ? "ok"
                    : "warn"
                }
                title="role acknowledgements"
                body={
                  locale === "en"
                    ? `${acknowledgedRoles}/${tenant.bootstrapDefaults.roleDefaults.length} roles have been invited and acknowledged.`
                    : `${acknowledgedRoles}/${tenant.bootstrapDefaults.roleDefaults.length} 個角色已邀請並確認。`
                }
              />
              <CanvasBanner
                theme={CANVAS_THEME}
                tone="info"
                icon="warn"
                title="cutover note"
                body={tenant.rollout.notes ?? copy.noRolloutNotes}
              />
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginTop: 16,
              }}
            >
              {PLATFORM_TENANT_ROLLOUT_STAGES.map((stage) => (
                <CanvasBtn
                  key={stage}
                  theme={CANVAS_THEME}
                  variant="secondary"
                  disabled={promotingStage === stage}
                  onClick={() => {
                    void promoteStage(stage);
                  }}
                >
                  {promotingStage === stage
                    ? t("common.saving")
                    : `${copy.promote} ${formatPlatformCodeLabel(locale, stage)}`}
                </CanvasBtn>
              ))}
            </div>
          </CanvasCard>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 1fr)",
              gap: 16,
              alignItems: "start",
            }}
          >
            <div style={sectionStackStyle}>
              <CanvasCard
                theme={CANVAS_THEME}
                title={copy.overviewTitle}
                subtitle={copy.overviewSubtitle}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 12,
                    marginBottom: 16,
                  }}
                >
                  <CanvasKPI
                    theme={CANVAS_THEME}
                    label={locale === "en" ? "Enabled modules" : "啟用模組"}
                    value={tenant.enabledModules.length}
                    sub={listText(
                      tenant.enabledModules.map(
                        (moduleCode) => moduleLabels[moduleCode],
                      ),
                    )}
                  />
                  <CanvasKPI
                    theme={CANVAS_THEME}
                    label={
                      locale === "en" ? "Monthly bookings" : "每月 bookings"
                    }
                    value={tenant.quotas.monthlyBookings.toLocaleString()}
                    sub={`${tenant.quotas.activeDrivers.toLocaleString()} drivers · ${tenant.quotas.monthlyApiCalls.toLocaleString()} API`}
                  />
                  <CanvasKPI
                    theme={CANVAS_THEME}
                    label={
                      locale === "en" ? "Role acknowledgements" : "角色確認"
                    }
                    value={`${acknowledgedRoles}/${tenant.bootstrapDefaults.roleDefaults.length}`}
                    delta={`${requiredRoles} ${locale === "en" ? "required" : "必要"}`}
                    deltaTone="neutral"
                    sub={`${invitedRoles} ${locale === "en" ? "invited" : "已邀請"}`}
                  />
                  <CanvasKPI
                    theme={CANVAS_THEME}
                    label={locale === "en" ? "Approved gates" : "已通過 gate"}
                    value={`${approvedGateCount}/${PLATFORM_TENANT_ROLLOUT_STAGES.length}`}
                    delta={
                      tenant.rollout.rollbackPrepared
                        ? locale === "en"
                          ? "rollback ready"
                          : "rollback ready"
                        : locale === "en"
                          ? "rollback pending"
                          : "rollback 待補"
                    }
                    deltaTone={tenant.rollout.rollbackPrepared ? "up" : "down"}
                    hint={
                      tenant.rollout.lastPromotedAt
                        ? formatDateTime(tenant.rollout.lastPromotedAt)
                        : undefined
                    }
                  />
                </div>
                <CanvasDL theme={CANVAS_THEME} cols={2} items={overviewItems} />
              </CanvasCard>

              <CanvasCard
                theme={CANVAS_THEME}
                title={copy.modulesTitle}
                subtitle={copy.modulesSubtitle}
              >
                <CanvasDL theme={CANVAS_THEME} cols={2} items={moduleItems} />
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    marginTop: 16,
                  }}
                >
                  {PLATFORM_TENANT_MODULES.map((moduleCode) => {
                    const enabled = tenant.enabledModules.includes(moduleCode);
                    return (
                      <CanvasPill
                        key={moduleCode}
                        theme={CANVAS_THEME}
                        tone={enabled ? "success" : "neutral"}
                        dot={enabled}
                      >
                        {moduleLabels[moduleCode]}
                      </CanvasPill>
                    );
                  })}
                </div>
              </CanvasCard>

              <CanvasCard
                theme={CANVAS_THEME}
                title={copy.onboardingTitle}
                subtitle={copy.onboardingSubtitle}
                style={{ order: -1 }}
              >
                <CanvasDL
                  theme={CANVAS_THEME}
                  cols={2}
                  items={onboardingItems}
                />
              </CanvasCard>

              <CanvasCard
                theme={CANVAS_THEME}
                title={copy.webhooksTitle}
                subtitle={copy.webhooksSubtitle}
              >
                <CanvasDL theme={CANVAS_THEME} cols={2} items={webhookItems} />
                <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
                  {tenant.bootstrapDefaults.notificationSubscriptions.length >
                  0 ? (
                    tenant.bootstrapDefaults.notificationSubscriptions.map(
                      (subscription, index) => (
                        <div
                          key={`${subscription.channel}-${subscription.eventType}-${index}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            padding: "10px 12px",
                            borderRadius: 8,
                            background: CANVAS_THEME.surfaceLo,
                            border: `1px solid ${CANVAS_THEME.border}`,
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 12.5,
                                color: CANVAS_THEME.text,
                                fontWeight: 600,
                              }}
                            >
                              {subscription.channel}
                            </div>
                            <div
                              style={{
                                fontSize: 11.5,
                                color: CANVAS_THEME.textDim,
                                fontFamily: CANVAS_THEME.monoFamily,
                              }}
                            >
                              {subscription.eventType}
                            </div>
                          </div>
                          <CanvasPill
                            theme={CANVAS_THEME}
                            tone={subscription.enabled ? "info" : "neutral"}
                            dot={subscription.enabled}
                          >
                            {subscription.enabled
                              ? t("common.enabled")
                              : t("common.disabled")}
                          </CanvasPill>
                        </div>
                      ),
                    )
                  ) : (
                    <CanvasBanner
                      theme={CANVAS_THEME}
                      tone="warn"
                      icon="warn"
                      title={copy.webhooksTitle}
                      body={copy.noSubscriptions}
                    />
                  )}
                </div>
              </CanvasCard>

              <CanvasCard
                theme={CANVAS_THEME}
                title={copy.billingTitle}
                subtitle={copy.billingSubtitle}
              >
                <CanvasDL theme={CANVAS_THEME} cols={2} items={billingItems} />
                <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
                  {tenant.bootstrapDefaults.notificationSubscriptions.length >
                  0 ? (
                    tenant.bootstrapDefaults.notificationSubscriptions.map(
                      (subscription, index) => (
                        <div
                          key={`${subscription.eventType}-${subscription.channel}-${index}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            padding: "10px 12px",
                            borderRadius: 8,
                            background: CANVAS_THEME.surfaceLo,
                            border: `1px solid ${CANVAS_THEME.border}`,
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 12.5,
                                color: CANVAS_THEME.text,
                                fontWeight: 600,
                              }}
                            >
                              {subscription.eventType}
                            </div>
                            <div
                              style={{
                                fontSize: 11.5,
                                color: CANVAS_THEME.textDim,
                              }}
                            >
                              {subscription.channel}
                            </div>
                          </div>
                          <CanvasPill
                            theme={CANVAS_THEME}
                            tone={subscription.enabled ? "success" : "neutral"}
                            dot={subscription.enabled}
                          >
                            {subscription.enabled
                              ? t("common.enabled")
                              : t("common.disabled")}
                          </CanvasPill>
                        </div>
                      ),
                    )
                  ) : (
                    <CanvasBanner
                      theme={CANVAS_THEME}
                      tone="warn"
                      icon="warn"
                      title={copy.billingTitle}
                      body={copy.noSubscriptions}
                    />
                  )}
                </div>
              </CanvasCard>

              <CanvasCard
                theme={CANVAS_THEME}
                title={copy.auditTitle}
                subtitle={copy.auditSubtitle}
                padding={0}
                actions={
                  <CanvasBtn
                    theme={CANVAS_THEME}
                    variant="secondary"
                    onClick={() => router.push("/audit")}
                  >
                    {copy.auditLedger}
                  </CanvasBtn>
                }
              >
                {auditRows.length > 0 ? (
                  <CanvasTable
                    theme={CANVAS_THEME}
                    dense
                    columns={[
                      {
                        h: locale === "en" ? "Time" : "時間",
                        k: "createdAt",
                        w: 156,
                        mono: true,
                      },
                      {
                        h: locale === "en" ? "Module" : "模組",
                        k: "moduleLabel",
                        w: 150,
                      },
                      {
                        h: locale === "en" ? "Action" : "動作",
                        k: "actionLabel",
                        w: 180,
                      },
                      {
                        h: locale === "en" ? "Resource" : "資源",
                        w: 220,
                        r: (row: AuditRow) => (
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 12.5,
                                color: CANVAS_THEME.text,
                              }}
                            >
                              {row.resourceType}
                            </div>
                            <div
                              style={{
                                fontSize: 11.5,
                                color: CANVAS_THEME.textDim,
                                fontFamily: CANVAS_THEME.monoFamily,
                              }}
                            >
                              {row.resourceId}
                            </div>
                          </div>
                        ),
                      },
                      {
                        h: "REQUEST",
                        k: "requestId",
                        mono: true,
                        w: 120,
                      },
                    ]}
                    rows={auditRows}
                  />
                ) : (
                  <div style={{ padding: 16 }}>
                    <CanvasBanner
                      theme={CANVAS_THEME}
                      tone="info"
                      icon="warn"
                      title={copy.auditTitle}
                      body={copy.noAudit}
                    />
                  </div>
                )}
              </CanvasCard>
            </div>

            <div style={sectionStackStyle}>
              <CanvasCard
                theme={CANVAS_THEME}
                title={copy.rolesTitle}
                subtitle={copy.rolesSubtitle}
                padding={0}
              >
                <CanvasTable
                  theme={CANVAS_THEME}
                  dense
                  columns={[
                    {
                      h: locale === "en" ? "Role" : "角色",
                      w: 210,
                      r: (row: RoleRow) => (
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 12.5,
                              color: CANVAS_THEME.text,
                              fontWeight: 600,
                            }}
                          >
                            {row.displayName}
                          </div>
                          <div
                            style={{
                              fontSize: 11.5,
                              color: CANVAS_THEME.textDim,
                              fontFamily: CANVAS_THEME.monoFamily,
                            }}
                          >
                            {row.roleCode}
                          </div>
                        </div>
                      ),
                    },
                    {
                      h: locale === "en" ? "Required" : "必要",
                      w: 92,
                      r: (row: RoleRow) => (
                        <CanvasPill
                          theme={CANVAS_THEME}
                          tone={row.required ? "warn" : "neutral"}
                        >
                          {row.required ? copy.required : copy.optional}
                        </CanvasPill>
                      ),
                    },
                    {
                      h: locale === "en" ? "State" : "狀態",
                      w: 110,
                      r: (row: RoleRow) => (
                        <CanvasPill
                          theme={CANVAS_THEME}
                          tone={roleStateTone(row)}
                          dot={Boolean(row.invitedAt || row.acknowledgedAt)}
                        >
                          {roleStateLabel(locale, t, row)}
                        </CanvasPill>
                      ),
                    },
                    {
                      h: locale === "en" ? "Invited" : "邀請",
                      w: 110,
                      mono: true,
                      r: (row: RoleRow) =>
                        row.invitedAt ? formatDateTime(row.invitedAt) : "—",
                    },
                    {
                      h: locale === "en" ? "Acknowledged" : "確認",
                      w: 128,
                      mono: true,
                      r: (row: RoleRow) =>
                        row.acknowledgedAt
                          ? formatDateTime(row.acknowledgedAt)
                          : "—",
                    },
                    {
                      h: locale === "en" ? "Action" : "操作",
                      w: 120,
                      r: (row: RoleRow) => {
                        if (row.acknowledgedAt) {
                          return (
                            <span
                              style={{
                                fontSize: 11.5,
                                color: CANVAS_THEME.textDim,
                              }}
                            >
                              {t("tenants.role.acknowledged")}
                            </span>
                          );
                        }

                        const actionId = row.invitedAt
                          ? `ack:${row.roleCode}`
                          : `invite:${row.roleCode}`;

                        return row.invitedAt ? (
                          <CanvasBtn
                            theme={CANVAS_THEME}
                            variant="secondary"
                            size="xs"
                            disabled={roleAction === actionId}
                            onClick={() => {
                              void acknowledgeRole(row.roleCode);
                            }}
                          >
                            {roleAction === actionId
                              ? t("common.saving")
                              : t("tenants.role.acknowledge")}
                          </CanvasBtn>
                        ) : (
                          <CanvasBtn
                            theme={CANVAS_THEME}
                            variant="secondary"
                            size="xs"
                            disabled={roleAction === actionId}
                            onClick={() => {
                              void inviteRole(row.roleCode);
                            }}
                          >
                            {roleAction === actionId
                              ? t("common.saving")
                              : t("tenants.role.invite")}
                          </CanvasBtn>
                        );
                      },
                    },
                  ]}
                  rows={roleRows}
                />
              </CanvasCard>

              <form onSubmit={handleSaveSettings}>
                <CanvasCard
                  theme={CANVAS_THEME}
                  title={locale === "en" ? "Tenant settings" : "租戶設定"}
                  subtitle={
                    locale === "en"
                      ? "Identity, enabled modules, and quota allocations remain control-plane truth."
                      : "租戶身分、啟用模組與配額配置仍以 control-plane truth 為準。"
                  }
                  actions={
                    <button
                      type="submit"
                      style={buttonStyle(
                        CANVAS_THEME,
                        "primary",
                        savingSettings,
                      )}
                      disabled={savingSettings || !editForm.name.trim()}
                    >
                      {savingSettings ? t("common.saving") : copy.saveSettings}
                    </button>
                  }
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <CanvasField
                      theme={CANVAS_THEME}
                      label={t("tenants.form.name")}
                      required
                    >
                      <input
                        value={editForm.name}
                        onChange={(event) =>
                          setEditForm((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        style={inputStyle(CANVAS_THEME)}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={CANVAS_THEME}
                      label={t("tenants.form.activeDrivers")}
                    >
                      <input
                        value={editForm.activeDrivers}
                        onChange={(event) =>
                          setEditForm((current) => ({
                            ...current,
                            activeDrivers: event.target.value,
                          }))
                        }
                        style={inputStyle(CANVAS_THEME)}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={CANVAS_THEME}
                      label={t("tenants.form.monthlyBookings")}
                    >
                      <input
                        value={editForm.monthlyBookings}
                        onChange={(event) =>
                          setEditForm((current) => ({
                            ...current,
                            monthlyBookings: event.target.value,
                          }))
                        }
                        style={inputStyle(CANVAS_THEME)}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={CANVAS_THEME}
                      label={t("tenants.form.monthlyApiCalls")}
                    >
                      <input
                        value={editForm.monthlyApiCalls}
                        onChange={(event) =>
                          setEditForm((current) => ({
                            ...current,
                            monthlyApiCalls: event.target.value,
                          }))
                        }
                        style={inputStyle(CANVAS_THEME)}
                      />
                    </CanvasField>
                  </div>

                  <CanvasField
                    theme={CANVAS_THEME}
                    label={t("tenants.form.modules")}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(160px, 1fr))",
                        gap: 10,
                      }}
                    >
                      {PLATFORM_TENANT_MODULES.map((moduleCode) => {
                        const enabled =
                          editForm.enabledModules.includes(moduleCode);
                        return (
                          <label
                            key={moduleCode}
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 8,
                              padding: "10px 12px",
                              borderRadius: 8,
                              border: `1px solid ${
                                enabled
                                  ? CANVAS_THEME.accentBorder
                                  : CANVAS_THEME.border
                              }`,
                              background: enabled
                                ? CANVAS_THEME.accentBg
                                : CANVAS_THEME.surfaceLo,
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={() =>
                                setEditForm((current) =>
                                  toggleTenantModule(current, moduleCode),
                                )
                              }
                            />
                            <span style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: 12.5,
                                  color: CANVAS_THEME.text,
                                  fontWeight: 600,
                                }}
                              >
                                {moduleLabels[moduleCode]}
                              </div>
                              <div
                                style={{
                                  fontSize: 11.5,
                                  color: CANVAS_THEME.textDim,
                                  fontFamily: CANVAS_THEME.monoFamily,
                                }}
                              >
                                {formatPlatformCodeLabel(locale, moduleCode)}
                              </div>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </CanvasField>
                </CanvasCard>
              </form>

              <form onSubmit={handleSaveOnboarding}>
                <CanvasCard
                  theme={CANVAS_THEME}
                  title={copy.defaultsTitle}
                  subtitle={copy.defaultsSubtitle}
                  actions={
                    <button
                      type="submit"
                      style={buttonStyle(
                        CANVAS_THEME,
                        "primary",
                        savingOnboarding,
                      )}
                      disabled={savingOnboarding}
                    >
                      {savingOnboarding
                        ? t("common.saving")
                        : copy.saveOnboarding}
                    </button>
                  }
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <CanvasField
                      theme={CANVAS_THEME}
                      label={t("tenants.form.invoiceTitle")}
                    >
                      <input
                        value={onboardingForm.invoiceTitle}
                        onChange={(event) =>
                          setOnboardingForm((current) => ({
                            ...current,
                            invoiceTitle: event.target.value,
                          }))
                        }
                        style={inputStyle(CANVAS_THEME)}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={CANVAS_THEME}
                      label={t("tenants.form.billingContactName")}
                    >
                      <input
                        value={onboardingForm.billingContactName}
                        onChange={(event) =>
                          setOnboardingForm((current) => ({
                            ...current,
                            billingContactName: event.target.value,
                          }))
                        }
                        style={inputStyle(CANVAS_THEME)}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={CANVAS_THEME}
                      label={t("tenants.form.billingContactEmail")}
                    >
                      <input
                        value={onboardingForm.billingContactEmail}
                        onChange={(event) =>
                          setOnboardingForm((current) => ({
                            ...current,
                            billingContactEmail: event.target.value,
                          }))
                        }
                        style={inputStyle(CANVAS_THEME)}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={CANVAS_THEME}
                      label={t("tenants.form.integrationMode")}
                    >
                      <select
                        value={onboardingForm.integrationMode}
                        onChange={(event) =>
                          setOnboardingForm((current) => ({
                            ...current,
                            integrationMode: event.target
                              .value as OnboardingFormState["integrationMode"],
                          }))
                        }
                        style={inputStyle(CANVAS_THEME)}
                      >
                        {PLATFORM_TENANT_INTEGRATION_MODES.map((mode) => (
                          <option key={mode} value={mode}>
                            {mode}
                          </option>
                        ))}
                      </select>
                    </CanvasField>
                    <CanvasField
                      theme={CANVAS_THEME}
                      label={t("tenants.form.sandboxBaseUrl")}
                    >
                      <input
                        value={onboardingForm.sandboxBaseUrl}
                        onChange={(event) =>
                          setOnboardingForm((current) => ({
                            ...current,
                            sandboxBaseUrl: event.target.value,
                          }))
                        }
                        style={inputStyle(CANVAS_THEME)}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={CANVAS_THEME}
                      label={t("tenants.form.productionBaseUrl")}
                    >
                      <input
                        value={onboardingForm.productionBaseUrl}
                        onChange={(event) =>
                          setOnboardingForm((current) => ({
                            ...current,
                            productionBaseUrl: event.target.value,
                          }))
                        }
                        style={inputStyle(CANVAS_THEME)}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={CANVAS_THEME}
                      label={t("tenants.form.cutoverOwner")}
                    >
                      <input
                        value={onboardingForm.cutoverOwner}
                        onChange={(event) =>
                          setOnboardingForm((current) => ({
                            ...current,
                            cutoverOwner: event.target.value,
                          }))
                        }
                        style={inputStyle(CANVAS_THEME)}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={CANVAS_THEME}
                      label={t("tenants.form.rollbackOwner")}
                    >
                      <input
                        value={onboardingForm.rollbackOwner}
                        onChange={(event) =>
                          setOnboardingForm((current) => ({
                            ...current,
                            rollbackOwner: event.target.value,
                          }))
                        }
                        style={inputStyle(CANVAS_THEME)}
                      />
                    </CanvasField>
                  </div>

                  <CanvasField
                    theme={CANVAS_THEME}
                    label={t("tenants.form.apiKeyScopes")}
                  >
                    <input
                      value={onboardingForm.apiKeyScopes}
                      onChange={(event) =>
                        setOnboardingForm((current) => ({
                          ...current,
                          apiKeyScopes: event.target.value,
                        }))
                      }
                      style={inputStyle(CANVAS_THEME)}
                    />
                  </CanvasField>

                  <CanvasField
                    theme={CANVAS_THEME}
                    label={t("tenants.form.webhookEvents")}
                  >
                    <input
                      value={onboardingForm.webhookEvents}
                      onChange={(event) =>
                        setOnboardingForm((current) => ({
                          ...current,
                          webhookEvents: event.target.value,
                        }))
                      }
                      style={inputStyle(CANVAS_THEME)}
                    />
                  </CanvasField>

                  <CanvasField
                    theme={CANVAS_THEME}
                    label={t("tenants.form.rolloutNotes")}
                  >
                    <textarea
                      value={onboardingForm.notes}
                      onChange={(event) =>
                        setOnboardingForm((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                      rows={4}
                      style={textareaStyle(CANVAS_THEME)}
                    />
                  </CanvasField>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 12.5,
                      color: CANVAS_THEME.text,
                    }}
                  >
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
                    <span>{t("tenants.form.rollbackPrepared")}</span>
                  </label>
                </CanvasCard>
              </form>

              <CanvasCard
                theme={CANVAS_THEME}
                title={copy.lifecycleTitle}
                subtitle={copy.lifecycleSubtitle}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    marginBottom: 12,
                  }}
                >
                  <CanvasPill
                    theme={CANVAS_THEME}
                    tone={toCanvasTone(tenantStatusTone(tenant.status))}
                    dot
                  >
                    {formatPlatformCodeLabel(locale, tenant.status)}
                  </CanvasPill>
                  <CanvasPill
                    theme={CANVAS_THEME}
                    tone={tenant.rollout.rollbackPrepared ? "success" : "warn"}
                    dot={tenant.rollout.rollbackPrepared}
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
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {tenant.status === "active" ? (
                    <CanvasBtn
                      theme={CANVAS_THEME}
                      variant="secondary"
                      disabled={lifecycleAction === "suspend"}
                      onClick={() => {
                        void runLifecycle("suspend");
                      }}
                    >
                      {lifecycleAction === "suspend"
                        ? t("common.saving")
                        : t("tenants.suspend")}
                    </CanvasBtn>
                  ) : (
                    <CanvasBtn
                      theme={CANVAS_THEME}
                      variant="secondary"
                      disabled={lifecycleAction === "activate"}
                      onClick={() => {
                        void runLifecycle("activate");
                      }}
                    >
                      {lifecycleAction === "activate"
                        ? t("common.saving")
                        : t("tenants.activate")}
                    </CanvasBtn>
                  )}
                  <CanvasBtn
                    theme={CANVAS_THEME}
                    variant="secondary"
                    disabled={lifecycleAction === "rollback_hold"}
                    onClick={() => {
                      void runLifecycle("rollback_hold");
                    }}
                  >
                    {lifecycleAction === "rollback_hold"
                      ? t("common.saving")
                      : t("tenants.rollbackHold")}
                  </CanvasBtn>
                </div>
              </CanvasCard>
            </div>
          </div>
        </div>
      </CanvasShell>
    </>
  );
}
