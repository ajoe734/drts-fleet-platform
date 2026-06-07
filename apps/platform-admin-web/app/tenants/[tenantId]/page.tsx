"use client";

import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import {
  formatPlatformUiError,
  toPlatformErrorMessage,
} from "@/lib/error-copy";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type { Locale } from "@/lib/translations";
import type {
  PlatformAdminTenantRecord,
  PlatformTenantBootstrapRoleDefault,
} from "@drts/contracts";
import {
  PLATFORM_TENANT_MODULES,
  type AcknowledgeTenantRoleCommand,
  type InviteTenantRoleCommand,
} from "@drts/contracts";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

type ActionReceipt = {
  action: string;
  reason?: string;
  at: string;
};

type RoleRow = PlatformTenantBootstrapRoleDefault &
  Record<string, unknown> & {
    invitee: string;
    stateLabel: string;
  };

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const pageBodyStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies React.CSSProperties;

const bannerGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
} satisfies React.CSSProperties;

const detailGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 1fr)",
  gap: 16,
  alignItems: "start",
} satisfies React.CSSProperties;

const stackStyle = {
  display: "grid",
  gap: 16,
} satisfies React.CSSProperties;

const emptyStateStyle = {
  display: "grid",
  placeItems: "center",
  minHeight: 280,
  padding: "40px 24px",
  borderRadius: 12,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  color: theme.textMuted,
  textAlign: "center",
} satisfies React.CSSProperties;

const stepperStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
} satisfies React.CSSProperties;

const modalBackdropStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.48)",
  display: "grid",
  placeItems: "center",
  padding: 24,
  zIndex: 40,
} satisfies React.CSSProperties;

const modalCardStyle = {
  width: "min(100%, 560px)",
  borderRadius: 12,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  boxShadow: "0 20px 60px rgba(15, 23, 42, 0.22)",
} satisfies React.CSSProperties;

const modalBodyStyle = {
  display: "grid",
  gap: 14,
  padding: 18,
} satisfies React.CSSProperties;

const textareaStyle = {
  width: "100%",
  minHeight: 112,
  boxSizing: "border-box",
  padding: "9px 10px",
  borderRadius: 7,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontSize: 12.5,
  fontFamily: theme.fontFamily,
  resize: "vertical",
} satisfies React.CSSProperties;

const actionRowStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
} satisfies React.CSSProperties;

const mutedTextStyle = {
  margin: 0,
  color: theme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
} satisfies React.CSSProperties;

function formatShortDate(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString().slice(0, 10);
}

function formatList(value: string[]) {
  return value.length > 0 ? value.join(" · ") : "—";
}

function getGateTone(
  gate: PlatformAdminTenantRecord["rollout"]["sandboxStatus"],
): CanvasTone {
  if (gate === "approved") {
    return "success";
  }
  if (gate === "ready") {
    return "info";
  }
  if (gate === "blocked") {
    return "danger";
  }
  return "warn";
}

function getStatusTone(
  status: PlatformAdminTenantRecord["status"],
): CanvasTone {
  if (status === "rollback_hold") {
    return "danger";
  }
  if (status === "active") {
    return "success";
  }
  if (status === "draft") {
    return "warn";
  }
  return "neutral";
}

function getRolloutGateSummary(tenant: PlatformAdminTenantRecord) {
  if (tenant.status === "rollback_hold") {
    return "blocked";
  }

  if (tenant.rollout.stage === "production") {
    return tenant.rollout.productionStatus;
  }

  if (tenant.rollout.stage === "pilot") {
    return tenant.rollout.pilotStatus;
  }

  return tenant.rollout.sandboxStatus;
}

function buildTenantConsoleHref(tenant: PlatformAdminTenantRecord) {
  return (
    tenant.integrationPackage.productionBaseUrl ??
    tenant.integrationPackage.sandboxBaseUrl ??
    `http://localhost:3004/settings?tenant=${encodeURIComponent(tenant.code)}`
  );
}

function buildInviteeHint(
  role: PlatformTenantBootstrapRoleDefault,
  tenant: PlatformAdminTenantRecord,
  locale: Locale,
) {
  const billingEmail = tenant.bootstrapDefaults.billingBaseline.email;

  if (billingEmail && /admin/i.test(role.roleCode)) {
    return billingEmail;
  }

  if (role.acknowledgedAt) {
    return locale === "en"
      ? `${role.displayName} acknowledged`
      : `${role.displayName} 已確認`;
  }

  if (role.invitedAt) {
    return locale === "en"
      ? `${role.displayName} invited`
      : `${role.displayName} 已邀請`;
  }

  return locale === "en" ? "Pending assignment" : "待指派";
}

function getRoleStateLabel(
  role: PlatformTenantBootstrapRoleDefault,
  locale: Locale,
) {
  if (role.acknowledgedAt) {
    return locale === "en" ? "Acknowledged" : "已確認";
  }
  if (role.invitedAt) {
    return locale === "en" ? "Invited" : "邀請中";
  }
  return locale === "en" ? "Not invited" : "未邀請";
}

function getRoleTone(role: PlatformTenantBootstrapRoleDefault): CanvasTone {
  if (role.acknowledgedAt) {
    return "success";
  }
  if (role.invitedAt) {
    return "warn";
  }
  return "neutral";
}

function resolveRoleDisplayLabel(
  tenant: PlatformAdminTenantRecord | null,
  roleCode: string,
  locale: Locale,
) {
  const displayName =
    tenant?.bootstrapDefaults.roleDefaults.find(
      (role) => role.roleCode === roleCode,
    )?.displayName ?? roleCode;
  return locale === "en"
    ? `${displayName} (${roleCode})`
    : `${displayName}（${roleCode}）`;
}

function buildTabs(locale: Locale) {
  if (locale === "en") {
    return [
      "Overview",
      "Modules",
      "Onboarding",
      "Rollout",
      "Roles",
      "Webhook Baseline",
      "Billing Baseline",
      "Audit",
    ];
  }

  return [
    "總覽",
    "模組",
    "開通",
    "推進",
    "角色",
    "回呼基準",
    "帳務基準",
    "稽核",
  ];
}

function RolloutStep({
  label,
  subtitle,
  tone,
  active,
}: {
  label: string;
  subtitle: string;
  tone: CanvasTone;
  active: boolean;
}) {
  const accent =
    tone === "success"
      ? theme.success
      : tone === "info"
        ? theme.info
        : tone === "danger"
          ? theme.danger
          : tone === "warn"
            ? theme.warn
            : theme.border;

  return (
    <div
      style={{
        border: `1px solid ${active ? accent : theme.border}`,
        borderRadius: 10,
        padding: "12px 12px 10px",
        background: active ? theme.surface : theme.bgRaised,
        boxShadow: active ? "0 0 0 1px rgba(15, 23, 42, 0.04)" : "none",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: accent,
            display: "inline-block",
          }}
        />
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: theme.text,
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: 11.5,
          color: theme.textMuted,
          lineHeight: 1.45,
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}

export default function TenantDetailPage() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = Array.isArray(params?.tenantId)
    ? params.tenantId[0]
    : params?.tenantId;
  const client = usePlatformAdminClient();
  const { locale } = useTranslation();
  const [tenant, setTenant] = useState<PlatformAdminTenantRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRollbackModal, setShowRollbackModal] = useState(false);
  const [rollbackReason, setRollbackReason] = useState("");
  const [rollbackSubmitting, setRollbackSubmitting] = useState(false);
  const [roleActionKey, setRoleActionKey] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ActionReceipt | null>(null);
  const copy =
    locale === "en"
      ? {
          missingTenantId: "Missing tenant ID.",
          loading: "Loading tenant lifecycle workspace…",
          detailTitle: "Tenant detail",
          detailSubtitle: (tenantId?: string) =>
            tenantId ? `tenant ID: ${tenantId}` : "Tenant detail",
          backToTenants: "Back to tenants",
          loadErrorTitle: "Unable to load tenant detail",
          notFoundTitle: "Tenant not found",
          notFoundBody:
            "The assigned route now resolves with a page body and no longer falls through to a 404. Pick another tenant from the lifecycle table.",
          openTenantConsole: "Open in Tenant Console",
          enterRollbackHold: "Enter rollback hold",
          actionFailed: "Tenant detail action failed",
          receiptTitle: (action: string) => `Audit receipt · ${action}`,
          receiptBody: (reason: string | undefined, at: string) =>
            reason
              ? `Reason captured: ${reason} · ${formatDateTime(at)}`
              : formatDateTime(at),
          rolloutTitle: "Rollout progress · state machine",
          rolloutSubtitle: (
            cutoverOwner: string | null,
            rollbackOwner: string | null,
          ) =>
            `Cutover owner: ${cutoverOwner ?? "unassigned"} · Rollback owner: ${rollbackOwner ?? "unassigned"} · linked user records`,
          rollbackPreparedTitle: (prepared: boolean) =>
            `Rollback prepared: ${prepared ? "Yes" : "No"}`,
          rollbackPreparedReady: "Tenant is ready for a production rollback.",
          rollbackPreparedGap:
            "Complete the rollback plan before promoting to production.",
          roleAcknowledgements: "Role acknowledgements",
          roleAcknowledgementsBody: (acknowledged: number, total: number) =>
            `${acknowledged}/${total} roles have been invited and acknowledged.`,
          currentGateTitle: (gate: string | null) =>
            `Current gate = ${gate ?? "—"}`,
          cutoverNotesEmpty:
            "No additional cutover notes have been recorded yet.",
          onboardingTitle: "Onboarding package",
          rolesTitle: (acknowledged: number, total: number) =>
            `Roles & invites · ${acknowledged}/${total} acknowledged`,
          baselineTitle: "Tenant baseline",
          recentTitle: "Recent activity",
          recentSubtitle:
            "Audit subset for rollout, onboarding, and role-invite decisions",
          tenantRecordUpdated: "Tenant record updated",
          tenantCreated: "Tenant created",
          tenantCreatedBody: (createdAt: string) =>
            `${formatDateTime(createdAt)} · bootstrap package recorded`,
          rollbackHoldActive: "Tenant is currently in rollback hold",
          noRollbackHold: "No active rollback hold",
          lastPromotion: (value: string) =>
            `Last promotion: ${formatDateTime(value)}`,
          promotionMissing: "Promotion history not yet recorded.",
          rollbackModalTitle: "Enter rollback hold",
          rollbackModalSubtitle:
            "High-risk action. Reason is required before the command is sent.",
          rollbackModalBannerTitle: (tenantName: string) =>
            `${tenantName} will be blocked from further promotion.`,
          rollbackModalBannerBody:
            "Use this when rollout risk or incident state requires an explicit governance hold.",
          rollbackReason: "Reason",
          rollbackReasonPlaceholder:
            "Describe the incident, rollout risk, or operator decision that requires rollback hold.",
          close: "Close",
          cancel: "Cancel",
          submitting: "Submitting…",
          confirmRollbackHold: "Confirm rollback hold",
          invite: "Invite",
          inviting: "Inviting…",
          acknowledge: "Acknowledge",
          saving: "Saving…",
          requiredRole: "Required role",
          optionalRole: "Optional role",
          roleTable: {
            invitee: "Invitee",
            role: "Role",
            state: "State",
            updated: "Updated",
            action: "Action",
          },
          onboardingLabels: {
            integrationMode: "Integration mode",
            bootstrapAdmin: "Bootstrap admin",
            sandboxBaseUrl: "Sandbox base URL",
            productionBaseUrl: "Production base URL",
            billingBaseline: "Billing baseline",
            webhookBaseline: "Webhook baseline",
            quotaPerMonth: "Quota / month",
            modules: "Modules",
          },
          baselineLabels: {
            stage: "Stage",
            currentGate: "Current gate",
            updated: "Updated",
            lastPromoted: "Last promoted",
          },
          bookingsUnit: "bookings",
          stepSubtitle: (gate: string) => `Gate ${gate}`,
          rollbackReady: "Rollback ready",
          ownerAssigned: (owner: string) => `Owner: ${owner}`,
          ownerUnassigned: "Owner not assigned",
        }
      : {
          missingTenantId: "缺少租戶編號。",
          loading: "載入租戶生命週期工作區中…",
          detailTitle: "租戶詳情",
          detailSubtitle: (tenantId?: string) =>
            tenantId ? `租戶編號：${tenantId}` : "租戶詳情",
          backToTenants: "返回租戶列表",
          loadErrorTitle: "無法載入租戶詳情",
          notFoundTitle: "找不到租戶",
          notFoundBody:
            "目前此路由已改為顯示頁面內容，不會再導回找不到頁面。請從生命週期列表選擇其他租戶。",
          openTenantConsole: "在租戶主控台開啟",
          enterRollbackHold: "進入回滾保留",
          actionFailed: "租戶詳情操作失敗",
          receiptTitle: (action: string) => `稽核收據：${action}`,
          receiptBody: (reason: string | undefined, at: string) =>
            reason
              ? `已記錄原因：${reason} · ${formatDateTime(at)}`
              : formatDateTime(at),
          rolloutTitle: "推進進度與狀態流程",
          rolloutSubtitle: (
            cutoverOwner: string | null,
            rollbackOwner: string | null,
          ) =>
            `切換負責人：${cutoverOwner ?? "未指派"} · 回滾負責人：${rollbackOwner ?? "未指派"}（已連結使用者紀錄）`,
          rollbackPreparedTitle: (prepared: boolean) =>
            `回滾準備：${prepared ? "完成" : "未完成"}`,
          rollbackPreparedReady: "此租戶已具備正式環境回滾條件。",
          rollbackPreparedGap: "推進到正式環境前，需先補齊回滾計畫。",
          roleAcknowledgements: "角色確認進度",
          roleAcknowledgementsBody: (acknowledged: number, total: number) =>
            `${acknowledged}/${total} 個角色已完成邀請與確認。`,
          currentGateTitle: (gate: string | null) => `目前閘門：${gate ?? "—"}`,
          cutoverNotesEmpty: "尚未記錄額外切換備註。",
          onboardingTitle: "開通套件",
          rolesTitle: (acknowledged: number, total: number) =>
            `角色與邀請 · 已確認 ${acknowledged}/${total}`,
          baselineTitle: "租戶基準",
          recentTitle: "近期活動",
          recentSubtitle: "推進、開通與角色邀請決策相關的稽核子集",
          tenantRecordUpdated: "租戶紀錄已更新",
          tenantCreated: "租戶已建立",
          tenantCreatedBody: (createdAt: string) =>
            `${formatDateTime(createdAt)} · 已記錄開通套件`,
          rollbackHoldActive: "租戶目前處於回滾保留狀態",
          noRollbackHold: "目前沒有啟用中的回滾保留",
          lastPromotion: (value: string) =>
            `最近推進：${formatDateTime(value)}`,
          promotionMissing: "尚未記錄推進歷史。",
          rollbackModalTitle: "進入回滾保留",
          rollbackModalSubtitle: "高風險動作，送出指令前必須填寫原因。",
          rollbackModalBannerTitle: (tenantName: string) =>
            `${tenantName} 將被阻擋後續推進。`,
          rollbackModalBannerBody:
            "當推進風險或事件狀態需要明確治理保留時，請使用此動作。",
          rollbackReason: "原因",
          rollbackReasonPlaceholder:
            "請說明需要進入回滾保留的事件、推進風險或操作判斷。",
          close: "關閉",
          cancel: "取消",
          submitting: "送出中…",
          confirmRollbackHold: "確認進入回滾保留",
          invite: "邀請",
          inviting: "邀請中…",
          acknowledge: "確認",
          saving: "儲存中…",
          requiredRole: "必要角色",
          optionalRole: "選填角色",
          roleTable: {
            invitee: "邀請對象",
            role: "角色",
            state: "狀態",
            updated: "更新時間",
            action: "操作",
          },
          onboardingLabels: {
            integrationMode: "整合模式",
            bootstrapAdmin: "初始管理員",
            sandboxBaseUrl: "沙箱基底網址",
            productionBaseUrl: "正式基底網址",
            billingBaseline: "帳務基準",
            webhookBaseline: "回呼基準",
            quotaPerMonth: "每月額度",
            modules: "模組",
          },
          baselineLabels: {
            stage: "階段",
            currentGate: "目前閘門",
            updated: "更新時間",
            lastPromoted: "最近推進",
          },
          bookingsUnit: "筆預約",
          stepSubtitle: (gate: string) => `閘門：${gate}`,
          rollbackReady: "回滾就緒",
          ownerAssigned: (owner: string) => `負責人：${owner}`,
          ownerUnassigned: "尚未指派負責人",
        };

  const loadTenant = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      setError(copy.missingTenantId);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await client.getPlatformTenant(tenantId);
      setTenant(result);
    } catch (cause: unknown) {
      setError(
        formatPlatformUiError(
          locale,
          toPlatformErrorMessage(cause),
          copy.loadErrorTitle,
        ),
      );
      setTenant(null);
    } finally {
      setLoading(false);
    }
  }, [client, copy.loadErrorTitle, copy.missingTenantId, locale, tenantId]);

  useEffect(() => {
    void loadTenant();
  }, [loadTenant]);

  const tabs = useMemo(() => buildTabs(locale), [locale]);
  const activeTab = tabs[3];

  const acknowledgedRoles =
    tenant?.bootstrapDefaults.roleDefaults.filter((role) =>
      Boolean(role.acknowledgedAt),
    ).length ?? 0;
  const totalRoles = tenant?.bootstrapDefaults.roleDefaults.length ?? 0;
  const rolloutGate = tenant ? getRolloutGateSummary(tenant) : null;

  const roleRows = useMemo<RoleRow[]>(
    () =>
      tenant
        ? tenant.bootstrapDefaults.roleDefaults.map((role) => ({
            ...role,
            invitee: buildInviteeHint(role, tenant, locale),
            stateLabel: getRoleStateLabel(role, locale),
          }))
        : [],
    [locale, tenant],
  );

  const handleInviteRole = useCallback(
    async (roleCode: string) => {
      if (!tenant) {
        return;
      }

      const command: InviteTenantRoleCommand = { roleCode };
      const actionKey = `invite:${roleCode}`;
      setRoleActionKey(actionKey);
      setError(null);

      try {
        const updated = await client.inviteTenantRole(tenant.id, command);
        const roleLabel = resolveRoleDisplayLabel(tenant, roleCode, locale);
        setTenant(updated);
        setReceipt({
          action:
            locale === "en"
              ? `Invited ${roleLabel}`
              : `已邀請角色：${roleLabel}`,
          at: new Date().toISOString(),
        });
      } catch (cause: unknown) {
        setError(
          formatPlatformUiError(
            locale,
            toPlatformErrorMessage(cause),
            locale === "en"
              ? "Unable to invite tenant role"
              : "無法邀請租戶角色",
          ),
        );
      } finally {
        setRoleActionKey(null);
      }
    },
    [client, locale, tenant],
  );

  const handleAcknowledgeRole = useCallback(
    async (roleCode: string) => {
      if (!tenant) {
        return;
      }

      const command: AcknowledgeTenantRoleCommand = { roleCode };
      const actionKey = `ack:${roleCode}`;
      setRoleActionKey(actionKey);
      setError(null);

      try {
        const updated = await client.acknowledgeTenantRole(tenant.id, command);
        const roleLabel = resolveRoleDisplayLabel(tenant, roleCode, locale);
        setTenant(updated);
        setReceipt({
          action:
            locale === "en"
              ? `Acknowledged ${roleLabel}`
              : `已確認角色：${roleLabel}`,
          at: new Date().toISOString(),
        });
      } catch (cause: unknown) {
        setError(
          formatPlatformUiError(
            locale,
            toPlatformErrorMessage(cause),
            locale === "en"
              ? "Unable to acknowledge tenant role"
              : "無法確認租戶角色",
          ),
        );
      } finally {
        setRoleActionKey(null);
      }
    },
    [client, locale, tenant],
  );

  const handleOpenTenantConsole = useCallback(() => {
    if (!tenant) {
      return;
    }

    window.open(
      buildTenantConsoleHref(tenant),
      "_blank",
      "noopener,noreferrer",
    );
  }, [tenant]);

  const handleConfirmRollbackHold = useCallback(async () => {
    if (!tenant || !rollbackReason.trim()) {
      return;
    }

    setRollbackSubmitting(true);
    setError(null);

    try {
      const updated = await client.rollbackHoldTenant(tenant.id);
      setTenant(updated);
      setReceipt({
        action: locale === "en" ? "Entered rollback hold" : "已進入回滾保留",
        reason: rollbackReason.trim(),
        at: new Date().toISOString(),
      });
      setShowRollbackModal(false);
      setRollbackReason("");
    } catch (cause: unknown) {
      setError(
        formatPlatformUiError(
          locale,
          toPlatformErrorMessage(cause),
          copy.actionFailed,
        ),
      );
    } finally {
      setRollbackSubmitting(false);
    }
  }, [client, copy.actionFailed, locale, rollbackReason, tenant]);

  const roleColumns = useMemo<CanvasTableColumn<RoleRow>[]>(
    () => [
      {
        h: copy.roleTable.invitee,
        w: 220,
        r: (row) => (
          <div style={{ display: "grid", gap: 2 }}>
            <span style={{ color: theme.text }}>{row.invitee}</span>
            <span
              style={{
                color: theme.textMuted,
                fontSize: 11,
                fontFamily: theme.monoFamily,
              }}
            >
              {row.required ? copy.requiredRole : copy.optionalRole}
            </span>
          </div>
        ),
      },
      {
        h: copy.roleTable.role,
        w: 180,
        r: (row) => (
          <div style={{ display: "grid", gap: 2 }}>
            <span style={{ color: theme.text, fontWeight: 600 }}>
              {row.displayName}
            </span>
            <span
              style={{
                color: theme.textMuted,
                fontSize: 11,
                fontFamily: theme.monoFamily,
              }}
            >
              {locale === "en"
                ? `Role code ${row.roleCode}`
                : `角色代碼 ${row.roleCode}`}
            </span>
          </div>
        ),
      },
      {
        h: copy.roleTable.state,
        w: 112,
        r: (row) => (
          <Pill theme={theme} tone={getRoleTone(row)} dot>
            {row.stateLabel}
          </Pill>
        ),
      },
      {
        h: copy.roleTable.updated,
        w: 112,
        mono: true,
        r: (row) =>
          formatShortDate(row.acknowledgedAt ?? row.invitedAt ?? undefined),
      },
      {
        h: copy.roleTable.action,
        w: 140,
        r: (row) => {
          const inviteKey = `invite:${row.roleCode}`;
          const ackKey = `ack:${row.roleCode}`;

          if (!row.invitedAt) {
            return (
              <Btn
                theme={theme}
                variant="secondary"
                size="xs"
                disabled={roleActionKey !== null}
                onClick={() => void handleInviteRole(row.roleCode)}
              >
                {roleActionKey === inviteKey ? copy.inviting : copy.invite}
              </Btn>
            );
          }

          if (!row.acknowledgedAt) {
            return (
              <Btn
                theme={theme}
                variant="secondary"
                size="xs"
                disabled={roleActionKey !== null}
                onClick={() => void handleAcknowledgeRole(row.roleCode)}
              >
                {roleActionKey === ackKey ? copy.saving : copy.acknowledge}
              </Btn>
            );
          }

          return (
            <span style={{ color: theme.textMuted, fontSize: 11.5 }}>—</span>
          );
        },
      },
    ],
    [
      copy.acknowledge,
      copy.invite,
      copy.inviting,
      copy.optionalRole,
      copy.requiredRole,
      copy.roleTable.action,
      copy.roleTable.invitee,
      copy.roleTable.role,
      copy.roleTable.state,
      copy.roleTable.updated,
      copy.saving,
      handleAcknowledgeRole,
      handleInviteRole,
      roleActionKey,
    ],
  );

  const onboardingItems = useMemo(
    () =>
      tenant
        ? [
            {
              k: copy.onboardingLabels.integrationMode,
              v: formatPlatformCodeLabel(
                locale,
                tenant.integrationPackage.mode,
              ),
              mono: true,
            },
            {
              k: copy.onboardingLabels.bootstrapAdmin,
              v: tenant.bootstrapDefaults.billingBaseline.email || "—",
              mono: true,
            },
            {
              k: copy.onboardingLabels.sandboxBaseUrl,
              v: tenant.integrationPackage.sandboxBaseUrl || "—",
              mono: true,
            },
            {
              k: copy.onboardingLabels.productionBaseUrl,
              v: tenant.integrationPackage.productionBaseUrl || "—",
              mono: true,
            },
            {
              k: copy.onboardingLabels.billingBaseline,
              v: `${tenant.bootstrapDefaults.billingBaseline.invoiceTitle || "—"} · ${tenant.bootstrapDefaults.billingBaseline.contactName || "—"}`,
            },
            {
              k: copy.onboardingLabels.webhookBaseline,
              v: formatList(tenant.bootstrapDefaults.webhookEvents),
              mono: true,
            },
            {
              k: copy.onboardingLabels.quotaPerMonth,
              v: `${tenant.quotas.monthlyBookings.toLocaleString(locale === "en" ? "en-US" : "zh-TW")} ${copy.bookingsUnit}`,
              mono: true,
            },
            {
              k: copy.onboardingLabels.modules,
              v: `${tenant.enabledModules.length}/${PLATFORM_TENANT_MODULES.length}`,
              mono: true,
            },
          ]
        : [],
    [copy.bookingsUnit, copy.onboardingLabels, locale, tenant],
  );

  const stepDefinitions = useMemo<
    Array<{
      label: string;
      subtitle: string;
      tone: CanvasTone;
      active: boolean;
    }>
  >(() => {
    if (!tenant) {
      return [];
    }

    return [
      {
        label: formatPlatformCodeLabel(locale, "sandbox"),
        subtitle: copy.stepSubtitle(
          formatPlatformCodeLabel(locale, tenant.rollout.sandboxStatus),
        ),
        tone: getGateTone(tenant.rollout.sandboxStatus),
        active:
          tenant.rollout.stage === "sandbox" &&
          tenant.status !== "rollback_hold",
      },
      {
        label: formatPlatformCodeLabel(locale, "pilot"),
        subtitle: copy.stepSubtitle(
          formatPlatformCodeLabel(locale, tenant.rollout.pilotStatus),
        ),
        tone: getGateTone(tenant.rollout.pilotStatus),
        active:
          tenant.rollout.stage === "pilot" && tenant.status !== "rollback_hold",
      },
      {
        label: formatPlatformCodeLabel(locale, "production"),
        subtitle: copy.stepSubtitle(
          formatPlatformCodeLabel(locale, tenant.rollout.productionStatus),
        ),
        tone: getGateTone(tenant.rollout.productionStatus),
        active:
          tenant.rollout.stage === "production" &&
          tenant.status !== "rollback_hold",
      },
      {
        label: copy.rollbackReady,
        subtitle: tenant.rollout.rollbackOwner
          ? copy.ownerAssigned(tenant.rollout.rollbackOwner)
          : copy.ownerUnassigned,
        tone: tenant.status === "rollback_hold" ? "danger" : "neutral",
        active: tenant.status === "rollback_hold",
      },
    ];
  }, [copy, locale, tenant]);

  if (loading) {
    return (
      <div style={pageBodyStyle}>
        <div style={emptyStateStyle}>{copy.loading}</div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <>
        <PageHeader
          theme={theme}
          title={copy.detailTitle}
          subtitle={copy.detailSubtitle(tenantId)}
          actions={
            <Btn
              theme={theme}
              variant="secondary"
              onClick={() => window.location.assign("/tenants")}
            >
              {copy.backToTenants}
            </Btn>
          }
        />
        <div style={pageBodyStyle}>
          {error ? (
            <Banner
              theme={theme}
              tone="danger"
              icon="warn"
              title={copy.loadErrorTitle}
              body={error}
            />
          ) : null}
          <div style={emptyStateStyle}>
            <div>
              <div
                style={{ color: theme.text, fontWeight: 600, marginBottom: 8 }}
              >
                {copy.notFoundTitle}
              </div>
              <p style={mutedTextStyle}>{copy.notFoundBody}</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        theme={theme}
        title={
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
          >
            {tenant.name}
            <Pill theme={theme} tone={getStatusTone(tenant.status)} dot>
              {tenant.status === "rollback_hold"
                ? formatPlatformCodeLabel(locale, "rollback_hold")
                : formatPlatformCodeLabel(locale, tenant.rollout.stage)}
            </Pill>
          </span>
        }
        subtitle={
          locale === "zh"
            ? `租戶代碼 ${tenant.code} · 租戶編號 ${tenant.id}`
            : `${tenant.code} · ${tenant.id}`
        }
        tabs={tabs}
        activeTab={activeTab}
        actions={
          <>
            <Btn
              theme={theme}
              variant="secondary"
              icon="ext"
              onClick={handleOpenTenantConsole}
            >
              {copy.openTenantConsole}
            </Btn>
            <Btn
              theme={theme}
              danger
              icon="warn"
              disabled={tenant.status === "rollback_hold"}
              onClick={() => setShowRollbackModal(true)}
            >
              {copy.enterRollbackHold}
            </Btn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {error ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={copy.actionFailed}
            body={error}
          />
        ) : null}

        {receipt ? (
          <Banner
            theme={theme}
            tone="success"
            icon="ok"
            title={copy.receiptTitle(receipt.action)}
            body={copy.receiptBody(receipt.reason, receipt.at)}
          />
        ) : null}

        <Card
          theme={theme}
          title={copy.rolloutTitle}
          subtitle={copy.rolloutSubtitle(
            tenant.rollout.cutoverOwner,
            tenant.rollout.rollbackOwner,
          )}
        >
          <div style={stepperStyle}>
            {stepDefinitions.map((step) => (
              <RolloutStep
                key={step.label}
                label={step.label}
                subtitle={step.subtitle}
                tone={step.tone}
                active={step.active}
              />
            ))}
          </div>
          <div style={{ ...bannerGridStyle, marginTop: 14 }}>
            <Banner
              theme={theme}
              tone={tenant.rollout.rollbackPrepared ? "success" : "warn"}
              icon={tenant.rollout.rollbackPrepared ? "ok" : "warn"}
              title={copy.rollbackPreparedTitle(
                tenant.rollout.rollbackPrepared,
              )}
              body={
                tenant.rollout.rollbackPrepared
                  ? copy.rollbackPreparedReady
                  : copy.rollbackPreparedGap
              }
            />
            <Banner
              theme={theme}
              tone={
                acknowledgedRoles === totalRoles && totalRoles > 0
                  ? "success"
                  : "warn"
              }
              icon={
                acknowledgedRoles === totalRoles && totalRoles > 0
                  ? "ok"
                  : "warn"
              }
              title={copy.roleAcknowledgements}
              body={copy.roleAcknowledgementsBody(
                acknowledgedRoles ?? 0,
                totalRoles,
              )}
            />
            <Banner
              theme={theme}
              tone={rolloutGate === "blocked" ? "danger" : "info"}
              icon={rolloutGate === "blocked" ? "warn" : "clock"}
              title={copy.currentGateTitle(
                rolloutGate
                  ? formatPlatformCodeLabel(locale, rolloutGate)
                  : null,
              )}
              body={
                tenant.rollout.notes?.trim()
                  ? tenant.rollout.notes
                  : copy.cutoverNotesEmpty
              }
            />
          </div>
        </Card>

        <div style={detailGridStyle}>
          <Card theme={theme} title={copy.onboardingTitle}>
            <DL theme={theme} cols={2} items={onboardingItems} />
          </Card>

          <div style={stackStyle}>
            <Card
              theme={theme}
              title={copy.rolesTitle(acknowledgedRoles ?? 0, totalRoles)}
            >
              <Table
                theme={theme}
                dense
                columns={roleColumns}
                rows={roleRows}
              />
            </Card>

            <Card theme={theme} title={copy.baselineTitle}>
              <DL
                theme={theme}
                cols={1}
                items={[
                  {
                    k: copy.baselineLabels.stage,
                    v: formatPlatformCodeLabel(locale, tenant.rollout.stage),
                    mono: true,
                  },
                  {
                    k: copy.baselineLabels.currentGate,
                    v: rolloutGate
                      ? formatPlatformCodeLabel(locale, rolloutGate)
                      : "—",
                    mono: true,
                  },
                  {
                    k: copy.baselineLabels.updated,
                    v: formatDateTime(tenant.updatedAt),
                    mono: true,
                  },
                  {
                    k: copy.baselineLabels.lastPromoted,
                    v: formatDateTime(tenant.rollout.lastPromotedAt ?? ""),
                    mono: true,
                  },
                ]}
              />
            </Card>
          </div>
        </div>

        <Card
          theme={theme}
          title={copy.recentTitle}
          subtitle={copy.recentSubtitle}
        >
          <div style={bannerGridStyle}>
            <Banner
              theme={theme}
              tone="info"
              icon="clock"
              title={copy.tenantRecordUpdated}
              body={
                locale === "zh"
                  ? `${formatDateTime(tenant.updatedAt)} · 租戶代碼 ${tenant.code}`
                  : `${formatDateTime(tenant.updatedAt)} · ${tenant.code}`
              }
            />
            <Banner
              theme={theme}
              tone="info"
              icon="clock"
              title={copy.tenantCreated}
              body={copy.tenantCreatedBody(tenant.createdAt)}
            />
            <Banner
              theme={theme}
              tone={tenant.status === "rollback_hold" ? "danger" : "success"}
              icon={tenant.status === "rollback_hold" ? "warn" : "ok"}
              title={
                tenant.status === "rollback_hold"
                  ? copy.rollbackHoldActive
                  : copy.noRollbackHold
              }
              body={
                tenant.rollout.lastPromotedAt
                  ? copy.lastPromotion(tenant.rollout.lastPromotedAt)
                  : copy.promotionMissing
              }
            />
          </div>
        </Card>
      </div>

      {showRollbackModal ? (
        <div
          style={modalBackdropStyle}
          role="dialog"
          aria-modal="true"
          aria-labelledby="rollback-hold-title"
        >
          <div style={modalCardStyle}>
            <div
              style={{
                padding: "14px 18px",
                borderBottom: `1px solid ${theme.border}`,
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div>
                <div
                  id="rollback-hold-title"
                  style={{ color: theme.text, fontSize: 14, fontWeight: 600 }}
                >
                  {copy.rollbackModalTitle}
                </div>
                <div
                  style={{
                    color: theme.textMuted,
                    fontSize: 11.5,
                    marginTop: 2,
                  }}
                >
                  {copy.rollbackModalSubtitle}
                </div>
              </div>
              <Btn
                theme={theme}
                variant="ghost"
                icon="x"
                onClick={() => {
                  if (!rollbackSubmitting) {
                    setShowRollbackModal(false);
                  }
                }}
              >
                {copy.close}
              </Btn>
            </div>
            <div style={modalBodyStyle}>
              <Banner
                theme={theme}
                tone="danger"
                icon="warn"
                title={copy.rollbackModalBannerTitle(tenant.name)}
                body={copy.rollbackModalBannerBody}
              />
              <Field theme={theme} label={copy.rollbackReason} required>
                <textarea
                  value={rollbackReason}
                  onChange={(event) => setRollbackReason(event.target.value)}
                  placeholder={copy.rollbackReasonPlaceholder}
                  style={textareaStyle}
                />
              </Field>
              <div style={actionRowStyle}>
                <Btn
                  theme={theme}
                  variant="secondary"
                  onClick={() => setShowRollbackModal(false)}
                  disabled={rollbackSubmitting}
                >
                  {copy.cancel}
                </Btn>
                <Btn
                  theme={theme}
                  danger
                  disabled={
                    rollbackSubmitting || rollbackReason.trim().length === 0
                  }
                  onClick={() => void handleConfirmRollbackHold()}
                >
                  {rollbackSubmitting
                    ? copy.submitting
                    : copy.confirmRollbackHold}
                </Btn>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
