"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { actionButtonStyle, emptyStateStyle } from "@/components/platform-ui";
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
import {
  CalloutBanner,
  DataCellStack,
  DataTable,
  DataViewCard,
  DetailMetadataGrid,
  FilterPill,
  FilterPillRow,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Stepper,
  Td,
  Tr,
  WorkflowPanel,
  WorkflowSplitLayout,
  type DetailListItem,
  type StepState,
  type StepperItem,
} from "@drts/ui-web";

const STAGE_INDEX: Record<PlatformTenantRolloutStage, number> = {
  sandbox: 0,
  pilot: 1,
  production: 2,
};

const anchorSectionStyle = {
  display: "grid",
  gap: 12,
  scrollMarginTop: 96,
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

  const onboardingItems = useMemo<DetailListItem[]>(() => {
    if (!tenant) {
      return [];
    }
    return [
      {
        id: "integration",
        label: locale === "en" ? "Integration mode" : "整合模式",
        value: formatPlatformCodeLabel(locale, tenant.integrationPackage.mode),
      },
      {
        id: "sandbox",
        label: "Sandbox URL",
        value: tenant.integrationPackage.sandboxBaseUrl ?? "—",
      },
      {
        id: "production",
        label: "Production URL",
        value: tenant.integrationPackage.productionBaseUrl ?? "—",
      },
      {
        id: "billing",
        label: locale === "en" ? "Billing baseline" : "帳務基線",
        value: tenant.bootstrapDefaults.billingBaseline.invoiceTitle,
        hint: `${tenant.bootstrapDefaults.billingBaseline.contactName} · ${tenant.bootstrapDefaults.billingBaseline.email}`,
      },
      {
        id: "scopes",
        label: "API scopes",
        value:
          tenant.integrationPackage.apiKeyScopes.length > 0
            ? tenant.integrationPackage.apiKeyScopes.join(", ")
            : "—",
        columnSpan: 2,
      },
      {
        id: "notes",
        label: locale === "en" ? "Rollout note" : "Rollout 備註",
        value: tenant.rollout.notes ?? copy.noRolloutNotes,
        columnSpan: 2,
      },
    ];
  }, [copy.noRolloutNotes, locale, tenant]);

  const overviewItems = useMemo<DetailListItem[]>(() => {
    if (!tenant) {
      return [];
    }
    return [
      {
        id: "tenant-id",
        label: "Tenant ID",
        value: tenant.id,
      },
      {
        id: "tenant-code",
        label: locale === "en" ? "Tenant code" : "租戶代碼",
        value: tenant.code,
      },
      {
        id: "created-at",
        label: locale === "en" ? "Created at" : "建立時間",
        value: formatDateTime(tenant.createdAt),
      },
      {
        id: "updated-at",
        label: locale === "en" ? "Last updated" : "最近更新",
        value: formatDateTime(tenant.updatedAt),
      },
      {
        id: "integration-mode",
        label: locale === "en" ? "Integration mode" : "整合模式",
        value: formatPlatformCodeLabel(locale, tenant.integrationPackage.mode),
      },
      {
        id: "current-stage",
        label: locale === "en" ? "Current rollout" : "目前 rollout",
        value: formatPlatformCodeLabel(locale, tenant.rollout.stage),
      },
      {
        id: "cutover-owner",
        label: locale === "en" ? "Cutover owner" : "Cutover owner",
        value: tenant.rollout.cutoverOwner ?? copy.noCutoverOwner,
      },
      {
        id: "rollback-owner",
        label: locale === "en" ? "Rollback owner" : "Rollback owner",
        value: tenant.rollout.rollbackOwner ?? copy.noRollbackOwner,
      },
    ];
  }, [copy.noCutoverOwner, copy.noRollbackOwner, locale, tenant]);

  const billingItems = useMemo<DetailListItem[]>(() => {
    if (!tenant) {
      return [];
    }
    return [
      {
        id: "invoice-title",
        label: locale === "en" ? "Invoice title" : "Invoice title",
        value: tenant.bootstrapDefaults.billingBaseline.invoiceTitle,
      },
      {
        id: "billing-contact",
        label: locale === "en" ? "Billing contact" : "帳務聯絡人",
        value: tenant.bootstrapDefaults.billingBaseline.contactName,
      },
      {
        id: "billing-email",
        label: locale === "en" ? "Billing email" : "帳務 Email",
        value: tenant.bootstrapDefaults.billingBaseline.email,
      },
      {
        id: "subscription-count",
        label: locale === "en" ? "Notification subscriptions" : "通知訂閱設定",
        value: tenant.bootstrapDefaults.notificationSubscriptions.length,
      },
    ];
  }, [locale, tenant]);

  const webhookItems = useMemo<DetailListItem[]>(() => {
    if (!tenant) {
      return [];
    }
    return [
      {
        id: "events",
        label: locale === "en" ? "Event scope" : "事件範圍",
        value:
          tenant.bootstrapDefaults.webhookEvents.length > 0
            ? tenant.bootstrapDefaults.webhookEvents.join(", ")
            : copy.noWebhookEvents,
        columnSpan: 2,
      },
      {
        id: "scopes",
        label: locale === "en" ? "API key scopes" : "API 金鑰 scopes",
        value:
          tenant.integrationPackage.apiKeyScopes.length > 0
            ? tenant.integrationPackage.apiKeyScopes.join(", ")
            : copy.noScopes,
        columnSpan: 2,
      },
    ];
  }, [copy.noScopes, copy.noWebhookEvents, locale, tenant]);

  if (loading) {
    return <div style={emptyStateStyle}>{t("tenants.loading")}</div>;
  }

  if (!tenant) {
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <PageHeader
          eyebrow={copy.title}
          title={copy.title}
          subtitle={copy.subtitle}
          actions={
            <Link
              href="/tenants"
              style={actionButtonStyle({ tone: "secondary" })}
            >
              {copy.back}
            </Link>
          }
        />
        <CalloutBanner
          tone="danger"
          title={locale === "en" ? "Tenant unavailable" : "租戶目前不可用"}
          description={error ?? copy.notFound}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <PageHeader
        eyebrow={copy.title}
        title={tenant.name}
        subtitle={`${tenant.code} · ${tenant.id}`}
        meta={[
          {
            label: locale === "en" ? "Status" : "狀態",
            value: formatPlatformCodeLabel(locale, tenant.status),
            tone: tenantStatusTone(tenant.status),
          },
          {
            label: locale === "en" ? "Rollout" : "Rollout",
            value: formatPlatformCodeLabel(locale, tenant.rollout.stage),
            tone: tenantStageTone(tenant.rollout.stage),
          },
          {
            label: locale === "en" ? "Updated" : "更新",
            value: formatDateTime(tenant.updatedAt),
            tone: "neutral",
          },
        ]}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link
              href="/tenants"
              style={actionButtonStyle({ tone: "secondary" })}
            >
              {copy.back}
            </Link>
            <button
              type="button"
              style={actionButtonStyle({ tone: "secondary" })}
              onClick={() => void loadTenant()}
            >
              {copy.refreshAudit}
            </button>
          </div>
        }
      />

      {error ? (
        <CalloutBanner
          tone="danger"
          title={locale === "en" ? "Unable to update tenant" : "租戶更新失敗"}
          description={error}
        />
      ) : null}

      {tenant.status === "rollback_hold" ? (
        <CalloutBanner
          tone="warning"
          title={
            locale === "en" ? "Rollback hold is active" : "Rollback hold 已啟用"
          }
          description={
            locale === "en"
              ? "Review the rollout note, cutover owner, rollback owner, and recent audit trail before restoring promotion flow."
              : "恢復 promotion flow 前，請先確認 rollout 備註、cutover owner、rollback owner 與最近 audit trail。"
          }
        />
      ) : null}

      <KpiRow minWidth="220px">
        <KpiCard
          label={locale === "en" ? "Enabled modules" : "啟用模組"}
          value={tenant.enabledModules.length}
          detail={tenant.enabledModules
            .map((module) => moduleLabels[module])
            .join(" · ")}
          tone="info"
        />
        <KpiCard
          label={locale === "en" ? "Monthly quotas" : "每月配額"}
          value={tenant.quotas.monthlyBookings.toLocaleString()}
          detail={`${tenant.quotas.activeDrivers.toLocaleString()} drivers · ${tenant.quotas.monthlyApiCalls.toLocaleString()} API`}
          tone="neutral"
        />
        <KpiCard
          label={locale === "en" ? "Role acknowledgements" : "角色確認"}
          value={`${acknowledgedRoles ?? 0}/${tenant.bootstrapDefaults.roleDefaults.length}`}
          detail={
            locale === "en"
              ? `${requiredRoles ?? 0} required roles · ${invitedRoles ?? 0} invited`
              : `${requiredRoles ?? 0} 個必要角色 · ${invitedRoles ?? 0} 個已邀請`
          }
          tone={
            acknowledgedRoles === tenant.bootstrapDefaults.roleDefaults.length
              ? "success"
              : "warning"
          }
        />
        <KpiCard
          label={
            locale === "en" ? "Approved rollout gates" : "已通過的 rollout gate"
          }
          value={`${readyGateCount}/${PLATFORM_TENANT_ROLLOUT_STAGES.length}`}
          detail={
            tenant.rollout.lastPromotedAt
              ? formatDateTime(tenant.rollout.lastPromotedAt)
              : "—"
          }
          tone={readyGateCount > 1 ? "success" : "accent"}
        />
      </KpiRow>

      <WorkflowPanel
        title={copy.navigationTitle}
        description={copy.navigationSubtitle}
      >
        <FilterPillRow>
          <a href="#overview" style={{ textDecoration: "none" }}>
            <FilterPill label={copy.nav.overview} tone="neutral" active />
          </a>
          <a href="#modules" style={{ textDecoration: "none" }}>
            <FilterPill label={copy.nav.modules} tone="info" />
          </a>
          <a href="#onboarding" style={{ textDecoration: "none" }}>
            <FilterPill label={copy.nav.onboarding} tone="warning" />
          </a>
          <a href="#rollout" style={{ textDecoration: "none" }}>
            <FilterPill label={copy.nav.rollout} tone="success" />
          </a>
          <a href="#roles" style={{ textDecoration: "none" }}>
            <FilterPill label={copy.nav.roles} tone="warning" />
          </a>
          <a href="#billing" style={{ textDecoration: "none" }}>
            <FilterPill label={copy.nav.billing} tone="neutral" />
          </a>
          <a href="#webhooks" style={{ textDecoration: "none" }}>
            <FilterPill label={copy.nav.webhooks} tone="info" />
          </a>
          <a href="#audit" style={{ textDecoration: "none" }}>
            <FilterPill
              label={copy.nav.audit}
              tone={recentAudit.length > 0 ? "neutral" : "warning"}
              count={recentAudit.length}
            />
          </a>
        </FilterPillRow>
      </WorkflowPanel>

      <WorkflowSplitLayout
        main={
          <>
            <div id="overview" style={anchorSectionStyle}>
              <WorkflowPanel
                title={copy.overviewTitle}
                description={copy.overviewSubtitle}
              >
                <DetailMetadataGrid
                  items={overviewItems}
                  minColumnWidth="220px"
                />
              </WorkflowPanel>
            </div>

            <div id="modules" style={anchorSectionStyle}>
              <WorkflowPanel
                title={copy.modulesTitle}
                description={copy.modulesSubtitle}
              >
                <KpiRow minWidth="180px">
                  <KpiCard
                    label={locale === "en" ? "Enabled scope" : "已啟用範圍"}
                    value={tenant.enabledModules.length}
                    detail={
                      tenant.enabledModules.length > 0
                        ? tenant.enabledModules
                            .map((moduleCode) => moduleLabels[moduleCode])
                            .join(" · ")
                        : "—"
                    }
                    tone="info"
                  />
                  <KpiCard
                    label={locale === "en" ? "Disabled scope" : "未啟用範圍"}
                    value={disabledModules.length}
                    detail={
                      disabledModules.length > 0
                        ? disabledModules
                            .map((moduleCode) => moduleLabels[moduleCode])
                            .join(" · ")
                        : "—"
                    }
                    tone="neutral"
                  />
                  <KpiCard
                    label={locale === "en" ? "Driver quota" : "司機配額"}
                    value={tenant.quotas.activeDrivers.toLocaleString()}
                    detail={`${tenant.quotas.monthlyBookings.toLocaleString()} bookings`}
                    tone="warning"
                  />
                </KpiRow>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 12,
                  }}
                >
                  {PLATFORM_TENANT_MODULES.map((moduleCode) => {
                    const enabled = tenant.enabledModules.includes(moduleCode);
                    return (
                      <div
                        key={moduleCode}
                        style={{
                          display: "grid",
                          gap: 8,
                          padding: "14px 16px",
                          borderRadius: 14,
                          border: "1px solid #dbe4ee",
                          background: enabled ? "#eff6ff" : "#f8fafc",
                        }}
                      >
                        <strong style={{ color: "#0f172a" }}>
                          {moduleLabels[moduleCode]}
                        </strong>
                        <StatusChip
                          label={statusChipCopy(locale, enabled)}
                          tone={enabled ? "success" : "neutral"}
                        />
                        <span style={{ color: "#64748b", fontSize: 12.5 }}>
                          {formatPlatformCodeLabel(locale, moduleCode)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </WorkflowPanel>
            </div>

            <div id="onboarding" style={anchorSectionStyle}>
              <WorkflowPanel
                title={copy.onboardingTitle}
                description={copy.onboardingSubtitle}
              >
                <DetailMetadataGrid
                  items={onboardingItems}
                  minColumnWidth="220px"
                />
              </WorkflowPanel>
            </div>

            <form onSubmit={handleSaveSettings}>
              <WorkflowPanel
                title={locale === "en" ? "Tenant settings" : "租戶設定"}
                description={
                  locale === "en"
                    ? "Identity, enabled modules, and quota allocations remain control-plane truth."
                    : "租戶身分、啟用模組與配額配置仍以 control-plane truth 為準。"
                }
              >
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
                <button
                  type="submit"
                  style={actionButtonStyle({ tone: "primary" })}
                  disabled={savingSettings || !editForm.name.trim()}
                >
                  {savingSettings ? t("common.saving") : copy.saveSettings}
                </button>
              </WorkflowPanel>
            </form>

            <form onSubmit={handleSaveOnboarding}>
              <WorkflowPanel
                title={copy.defaultsTitle}
                description={copy.defaultsSubtitle}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 12,
                  }}
                >
                  <label>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      {t("tenants.form.invoiceTitle")}
                    </div>
                    <input
                      value={onboardingForm.invoiceTitle}
                      onChange={(event) =>
                        setOnboardingForm((current) =>
                          current
                            ? { ...current, invoiceTitle: event.target.value }
                            : current,
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </label>
                  <label>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      {t("tenants.form.billingContactName")}
                    </div>
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
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </label>
                  <label>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      {t("tenants.form.billingContactEmail")}
                    </div>
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
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </label>
                  <label>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      {t("tenants.form.integrationMode")}
                    </div>
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
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                      }}
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
                  </label>
                  <label>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      {t("tenants.form.sandboxBaseUrl")}
                    </div>
                    <input
                      value={onboardingForm.sandboxBaseUrl}
                      onChange={(event) =>
                        setOnboardingForm((current) =>
                          current
                            ? { ...current, sandboxBaseUrl: event.target.value }
                            : current,
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </label>
                  <label>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      {t("tenants.form.productionBaseUrl")}
                    </div>
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
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </label>
                  <label style={{ gridColumn: "1 / -1" }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      {t("tenants.form.apiKeyScopes")}
                    </div>
                    <input
                      value={onboardingForm.apiKeyScopes}
                      onChange={(event) =>
                        setOnboardingForm((current) =>
                          current
                            ? { ...current, apiKeyScopes: event.target.value }
                            : current,
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </label>
                  <label style={{ gridColumn: "1 / -1" }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      {t("tenants.form.webhookEvents")}
                    </div>
                    <input
                      value={onboardingForm.webhookEvents}
                      onChange={(event) =>
                        setOnboardingForm((current) =>
                          current
                            ? { ...current, webhookEvents: event.target.value }
                            : current,
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </label>
                  <label>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      {t("tenants.form.cutoverOwner")}
                    </div>
                    <input
                      value={onboardingForm.cutoverOwner}
                      onChange={(event) =>
                        setOnboardingForm((current) =>
                          current
                            ? { ...current, cutoverOwner: event.target.value }
                            : current,
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </label>
                  <label>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      {t("tenants.form.rollbackOwner")}
                    </div>
                    <input
                      value={onboardingForm.rollbackOwner}
                      onChange={(event) =>
                        setOnboardingForm((current) =>
                          current
                            ? { ...current, rollbackOwner: event.target.value }
                            : current,
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </label>
                  <label style={{ gridColumn: "1 / -1" }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      {t("tenants.form.rolloutNotes")}
                    </div>
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
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #cbd5e1",
                        resize: "vertical",
                      }}
                    />
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      gridColumn: "1 / -1",
                    }}
                  >
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
                <button
                  type="submit"
                  style={actionButtonStyle({ tone: "primary" })}
                  disabled={savingOnboarding}
                >
                  {savingOnboarding ? t("common.saving") : copy.saveOnboarding}
                </button>
              </WorkflowPanel>
            </form>

            <div id="billing" style={anchorSectionStyle}>
              <DataViewCard
                title={copy.billingTitle}
                subtitle={copy.billingSubtitle}
                summary={
                  locale === "en"
                    ? "Billing defaults and notification posture remain reviewable here even though downstream invoice workflows live elsewhere."
                    : "Billing defaults 與通知姿態可在此治理檢視，但下游 invoice workflow 仍位於其他頁面。"
                }
              >
                <DetailMetadataGrid
                  items={billingItems}
                  minColumnWidth="220px"
                />
                <div style={{ display: "grid", gap: 10 }}>
                  {tenant.bootstrapDefaults.notificationSubscriptions.length >
                  0 ? (
                    tenant.bootstrapDefaults.notificationSubscriptions.map(
                      (subscription, index) => (
                        <div
                          key={`${subscription.eventType}-${subscription.channel}-${index}`}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                            padding: "12px 14px",
                            borderRadius: 14,
                            border: "1px solid #e2e8f0",
                            background: "#f8fafc",
                          }}
                        >
                          <DataCellStack
                            primary={subscription.eventType}
                            secondary={subscription.channel}
                          />
                          <StatusChip
                            label={statusChipCopy(locale, subscription.enabled)}
                            tone={subscription.enabled ? "success" : "neutral"}
                          />
                        </div>
                      ),
                    )
                  ) : (
                    <CalloutBanner
                      tone="warning"
                      title={
                        locale === "en"
                          ? "No notification subscriptions"
                          : "沒有通知訂閱設定"
                      }
                      description={copy.noSubscriptions}
                    />
                  )}
                </div>
              </DataViewCard>
            </div>

            <div id="webhooks" style={anchorSectionStyle}>
              <DataViewCard
                title={copy.webhooksTitle}
                subtitle={copy.webhooksSubtitle}
                summary={
                  locale === "en"
                    ? "This baseline expresses what the tenant is allowed to emit or receive before any downstream webhook-delivery tooling takes over."
                    : "這個 baseline 用來表達 tenant 在進入下游 webhook-delivery tooling 前，允許送出或接收哪些事件。"
                }
              >
                <DetailMetadataGrid
                  items={webhookItems}
                  minColumnWidth="220px"
                />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 12,
                  }}
                >
                  {tenant.bootstrapDefaults.notificationSubscriptions.length >
                  0 ? (
                    tenant.bootstrapDefaults.notificationSubscriptions.map(
                      (subscription, index) => (
                        <div
                          key={`${subscription.channel}-${subscription.eventType}-${index}`}
                          style={{
                            display: "grid",
                            gap: 8,
                            padding: "14px 16px",
                            borderRadius: 14,
                            border: "1px solid #dbe4ee",
                            background: "#f8fafc",
                          }}
                        >
                          <strong style={{ color: "#0f172a" }}>
                            {subscription.channel}
                          </strong>
                          <span style={{ color: "#64748b", fontSize: 12.5 }}>
                            {subscription.eventType}
                          </span>
                          <StatusChip
                            label={statusChipCopy(locale, subscription.enabled)}
                            tone={subscription.enabled ? "info" : "neutral"}
                          />
                        </div>
                      ),
                    )
                  ) : (
                    <CalloutBanner
                      tone="warning"
                      title={
                        locale === "en"
                          ? "Webhook baseline is incomplete"
                          : "Webhook baseline 尚未補齊"
                      }
                      description={copy.noSubscriptions}
                    />
                  )}
                </div>
              </DataViewCard>
            </div>

            <div id="audit" style={anchorSectionStyle}>
              <DataViewCard
                title={copy.auditTitle}
                subtitle={copy.auditSubtitle}
                summary={
                  locale === "en"
                    ? "Showing the latest tenant-scoped audit evidence only. Full append-only history remains on the dedicated audit page."
                    : "這裡只顯示最新的 tenant-scoped audit 證據；完整 append-only history 仍在獨立 audit 頁。"
                }
                actions={
                  <Link
                    href="/audit"
                    style={actionButtonStyle({ tone: "secondary", size: "sm" })}
                  >
                    Audit ledger
                  </Link>
                }
              >
                {recentAudit.length > 0 ? (
                  <DataTable
                    columns={[
                      { label: copy.auditColumns.time, width: "180px" },
                      { label: copy.auditColumns.module, width: "160px" },
                      { label: copy.auditColumns.action, width: "180px" },
                      { label: copy.auditColumns.resource, width: "200px" },
                      { label: copy.auditColumns.request, width: "160px" },
                    ]}
                    empty={copy.noAudit}
                  >
                    {recentAudit.map((record) => (
                      <Tr key={record.auditId}>
                        <Td>{formatDateTime(record.createdAt)}</Td>
                        <Td>
                          {record.moduleName
                            ? formatPlatformCodeLabel(locale, record.moduleName)
                            : "—"}
                        </Td>
                        <Td>
                          {record.actionName
                            ? formatPlatformCodeLabel(locale, record.actionName)
                            : "—"}
                        </Td>
                        <Td>
                          <DataCellStack
                            primary={record.resourceType || "—"}
                            secondary={record.resourceId ?? "—"}
                          />
                        </Td>
                        <Td>{truncate(record.requestId || "—", 14)}</Td>
                      </Tr>
                    ))}
                  </DataTable>
                ) : (
                  <CalloutBanner
                    tone="neutral"
                    title={
                      locale === "en"
                        ? "No tenant audit yet"
                        : "此 tenant 尚無 audit 紀錄"
                    }
                    description={copy.noAudit}
                  />
                )}
              </DataViewCard>
            </div>
          </>
        }
        side={
          <>
            <div id="rollout" style={anchorSectionStyle}>
              <WorkflowPanel
                title={copy.rolloutTitle}
                description={copy.rolloutSubtitle}
                meta={
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <StatusChip
                      label={`${locale === "en" ? "Stage" : "階段"}: ${formatPlatformCodeLabel(locale, tenant.rollout.stage)}`}
                      tone={tenantStageTone(tenant.rollout.stage)}
                    />
                    <StatusChip
                      label={`Sandbox: ${tenant.rollout.sandboxStatus}`}
                      tone={tenantStageTone(tenant.rollout.sandboxStatus)}
                    />
                    <StatusChip
                      label={`Pilot: ${tenant.rollout.pilotStatus}`}
                      tone={tenantStageTone(tenant.rollout.pilotStatus)}
                    />
                    <StatusChip
                      label={`Production: ${tenant.rollout.productionStatus}`}
                      tone={tenantStageTone(tenant.rollout.productionStatus)}
                    />
                  </div>
                }
              >
                <Stepper items={rolloutSteps} />
                <DetailMetadataGrid
                  minColumnWidth="180px"
                  items={[
                    {
                      id: "cutover",
                      label:
                        locale === "en" ? "Cutover owner" : "Cutover owner",
                      value: tenant.rollout.cutoverOwner ?? copy.noCutoverOwner,
                    },
                    {
                      id: "rollback-owner",
                      label:
                        locale === "en" ? "Rollback owner" : "Rollback owner",
                      value:
                        tenant.rollout.rollbackOwner ?? copy.noRollbackOwner,
                    },
                    {
                      id: "rollback-prepared",
                      label:
                        locale === "en"
                          ? "Rollback prepared"
                          : "Rollback 已備妥",
                      value:
                        locale === "en"
                          ? tenant.rollout.rollbackPrepared
                            ? "Yes"
                            : "No"
                          : tenant.rollout.rollbackPrepared
                            ? "是"
                            : "否",
                    },
                    {
                      id: "last-promoted",
                      label: locale === "en" ? "Last promoted" : "最近推進時間",
                      value: tenant.rollout.lastPromotedAt
                        ? formatDateTime(tenant.rollout.lastPromotedAt)
                        : "—",
                    },
                  ]}
                />
                <CalloutBanner
                  tone={tenant.rollout.rollbackPrepared ? "info" : "warning"}
                  title={
                    locale === "en"
                      ? "Rollout note and rollback readiness"
                      : "Rollout 備註與 rollback readiness"
                  }
                  description={tenant.rollout.notes ?? copy.noRolloutNotes}
                />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {PLATFORM_TENANT_ROLLOUT_STAGES.map((stage) => (
                    <button
                      key={stage}
                      type="button"
                      style={actionButtonStyle({
                        tone: "secondary",
                        size: "sm",
                      })}
                      disabled={promotingStage === stage}
                      onClick={() => void promoteStage(stage)}
                    >
                      {promotingStage === stage
                        ? t("common.saving")
                        : `${copy.promote} ${formatPlatformCodeLabel(locale, stage)}`}
                    </button>
                  ))}
                </div>
              </WorkflowPanel>
            </div>

            <div id="roles" style={anchorSectionStyle}>
              <WorkflowPanel
                title={copy.rolesTitle}
                description={copy.rolesSubtitle}
              >
                <KpiRow minWidth="150px">
                  <KpiCard
                    label={locale === "en" ? "Required roles" : "必要角色"}
                    value={requiredRoles ?? 0}
                    tone="warning"
                  />
                  <KpiCard
                    label={locale === "en" ? "Invited" : "已邀請"}
                    value={invitedRoles ?? 0}
                    tone="info"
                  />
                  <KpiCard
                    label={locale === "en" ? "Acknowledged" : "已確認"}
                    value={acknowledgedRoles ?? 0}
                    tone="success"
                  />
                </KpiRow>
                <div style={{ display: "grid", gap: 10 }}>
                  {tenant.bootstrapDefaults.roleDefaults.map((role) => {
                    const actionId =
                      role.acknowledgedAt || role.invitedAt
                        ? `ack:${role.roleCode}`
                        : `invite:${role.roleCode}`;
                    return (
                      <div
                        key={role.roleCode}
                        style={{
                          display: "grid",
                          gap: 6,
                          padding: "12px 14px",
                          borderRadius: 14,
                          border: "1px solid #e2e8f0",
                          background: "#f8fafc",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <strong style={{ color: "#0f172a", fontSize: 13.5 }}>
                            {role.displayName}
                          </strong>
                          <StatusChip
                            label={
                              role.acknowledgedAt
                                ? t("tenants.role.acknowledged")
                                : role.invitedAt
                                  ? t("tenants.role.invited")
                                  : locale === "en"
                                    ? "Pending"
                                    : "待處理"
                            }
                            tone={
                              role.acknowledgedAt
                                ? "success"
                                : role.invitedAt
                                  ? "info"
                                  : role.required
                                    ? "warning"
                                    : "neutral"
                            }
                          />
                        </div>
                        <div style={{ color: "#64748b", fontSize: 12.5 }}>
                          {formatPlatformCodeLabel(locale, role.roleCode)}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                            alignItems: "center",
                          }}
                        >
                          <StatusChip
                            label={
                              role.required
                                ? locale === "en"
                                  ? "Required"
                                  : "必要"
                                : locale === "en"
                                  ? "Optional"
                                  : "選填"
                            }
                            tone={role.required ? "warning" : "neutral"}
                          />
                          {role.acknowledgedAt ? (
                            <span style={{ fontSize: 12.5, color: "#64748b" }}>
                              {formatDateTime(role.acknowledgedAt)}
                            </span>
                          ) : role.invitedAt ? (
                            <button
                              type="button"
                              style={actionButtonStyle({
                                tone: "secondary",
                                size: "sm",
                              })}
                              disabled={roleAction === actionId}
                              onClick={() =>
                                void acknowledgeRole(role.roleCode)
                              }
                            >
                              {copy.acknowledge}
                            </button>
                          ) : (
                            <button
                              type="button"
                              style={actionButtonStyle({
                                tone: "secondary",
                                size: "sm",
                              })}
                              disabled={roleAction === actionId}
                              onClick={() => void inviteRole(role.roleCode)}
                            >
                              {copy.invite}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </WorkflowPanel>
            </div>

            <WorkflowPanel
              title={copy.lifecycleTitle}
              description={copy.lifecycleSubtitle}
            >
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <StatusChip
                  label={formatPlatformCodeLabel(locale, tenant.status)}
                  tone={tenantStatusTone(tenant.status)}
                />
                <StatusChip
                  label={
                    tenant.rollout.rollbackPrepared
                      ? locale === "en"
                        ? "Rollback prepared"
                        : "Rollback 已備妥"
                      : locale === "en"
                        ? "Rollback pending"
                        : "Rollback 待補"
                  }
                  tone={tenant.rollout.rollbackPrepared ? "success" : "warning"}
                />
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {tenant.status === "active" ? (
                  <button
                    type="button"
                    style={actionButtonStyle({ tone: "secondary" })}
                    disabled={lifecycleAction === "suspend"}
                    onClick={() => void runLifecycle("suspend")}
                  >
                    {copy.suspend}
                  </button>
                ) : (
                  <button
                    type="button"
                    style={actionButtonStyle({ tone: "secondary" })}
                    disabled={lifecycleAction === "activate"}
                    onClick={() => void runLifecycle("activate")}
                  >
                    {copy.activate}
                  </button>
                )}
                <button
                  type="button"
                  style={actionButtonStyle({ tone: "secondary" })}
                  disabled={lifecycleAction === "rollback_hold"}
                  onClick={() => void runLifecycle("rollback_hold")}
                >
                  {copy.rollback}
                </button>
              </div>
            </WorkflowPanel>
          </>
        }
      />
    </div>
  );
}
