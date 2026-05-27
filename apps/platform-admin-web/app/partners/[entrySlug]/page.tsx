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
  EMPTY_ENTRY_FORM,
  buildPartnerReadinessItems,
  partnerStatusTone,
  toPartnerFormState,
  toPartnerUpdateCommand,
  type EntryFormState,
} from "@/components/partner-governance-shared";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import {
  BUSINESS_DISPATCH_SUBTYPES,
  PARTNER_ENTRY_AUTH_MODES,
  PARTNER_ELIGIBILITY_MODES,
  type BusinessDispatchSubtype,
  type CrossAppResourceLink,
  type EmptyReason,
  type PartnerChannelEntryRecord,
  type PartnerEntryAuthMode,
  type PartnerEntryStatus,
  type PartnerEligibilityMode,
  type PartnerIngressCredentialIssued,
  type PartnerIngressCredentialRecord,
  type RefreshTier,
  type ResourceActionDescriptor,
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
  CanvasShell,
  CanvasTable as Table,
  WorkflowEmptyState,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
} from "@drts/ui-web";

type PartnerDetailRecord = PartnerChannelEntryRecord & {
  availableActions?: ResourceActionDescriptor[];
  crossAppLinks?: CrossAppResourceLink[];
  adapterLink?: CrossAppResourceLink | null;
  tenantLink?: CrossAppResourceLink | null;
  webhookLink?: CrossAppResourceLink | null;
  refreshTier?: RefreshTier;
};

type CredentialRow = Record<string, unknown> & {
  keyId: string;
  masked: string;
  source: string;
  createdAt: string;
  lastUsedAt: string;
  revokedAt: string | null;
};

type CredentialLifecycleFilter = "active" | "revoked" | "all";

type DetailSectionId =
  | "overview"
  | "branding"
  | "auth"
  | "eligibility"
  | "readiness"
  | "credentials"
  | "audit";

type ActionIntent =
  | "edit"
  | "activate"
  | "deactivate"
  | "issue_credential"
  | "rotate_credential"
  | "revoke_credential";

type PendingAction =
  | {
      intent: Exclude<ActionIntent, "revoke_credential">;
      descriptor: ResourceActionDescriptor;
    }
  | {
      intent: "revoke_credential";
      descriptor: ResourceActionDescriptor;
      keyId: string;
      label: string;
    };

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const T4_REFRESH_MS = 30_000;

const shellStyle = {
  margin: "-32px",
  minHeight: "calc(100vh - 64px)",
} satisfies CSSProperties;

const pageStackStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const heroGridStyle = (compact: boolean): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: compact
    ? "minmax(0, 1fr)"
    : "minmax(0, 1.3fr) minmax(320px, 0.9fr)",
  gap: 16,
  alignItems: "start",
});

const splitGridStyle = (compact: boolean): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: compact
    ? "minmax(0, 1fr)"
    : "minmax(0, 1.3fr) minmax(320px, 0.9fr)",
  gap: 16,
  alignItems: "start",
});

const sectionStackStyle = {
  display: "grid",
  gap: 16,
} satisfies CSSProperties;

const sectionAnchorStyle = {
  scrollMarginTop: 92,
} satisfies CSSProperties;

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const fieldGridStyle = (compact: boolean): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: compact ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))",
  gap: 12,
});

const shellBadgeRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
} satisfies CSSProperties;

const mutedTextStyle = {
  fontSize: 11.5,
  lineHeight: 1.5,
  color: theme.textMuted,
} satisfies CSSProperties;

const buttonRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
} satisfies CSSProperties;

const actionNoteStyle = {
  fontSize: 11.5,
  color: theme.textMuted,
  lineHeight: 1.45,
} satisfies CSSProperties;

const saveBarStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  padding: "12px 14px",
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
} satisfies CSSProperties;

const modalScrimStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 60,
  display: "grid",
  placeItems: "center",
  padding: 24,
  background: "rgba(15, 23, 42, 0.45)",
  backdropFilter: "blur(4px)",
} satisfies CSSProperties;

const modalCardStyle = {
  width: "min(720px, 100%)",
  maxHeight: "calc(100vh - 48px)",
  overflow: "auto",
  borderRadius: 18,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  boxShadow: "0 28px 80px rgba(15, 23, 42, 0.25)",
  padding: 20,
  display: "grid",
  gap: 16,
} satisfies CSSProperties;

const secretBoxStyle = {
  display: "grid",
  gap: 10,
  padding: 14,
  borderRadius: 12,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
} satisfies CSSProperties;

const monospaceBlockStyle = {
  margin: 0,
  padding: 12,
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: theme.bg,
  color: theme.text,
  fontFamily: theme.monoFamily,
  fontSize: 12,
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
} satisfies CSSProperties;

const overlayActionsStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
} satisfies CSSProperties;

const statusSummaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const filterRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
} satisfies CSSProperties;

const sectionTabRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
} satisfies CSSProperties;

function sectionTabButtonStyle(active: boolean): CSSProperties {
  return {
    appearance: "none",
    border: `1px solid ${active ? theme.accent : theme.border}`,
    background: active ? theme.accentBg : theme.surface,
    color: active ? theme.accent : theme.textMuted,
    borderRadius: 999,
    padding: "7px 12px",
    fontSize: 11.5,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 120ms ease",
  };
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
      key: "tenant-governance",
      href: "/tenant-governance",
      icon: "governance",
      label: labels.tenantGov,
    },
    { divider: labels.partners },
    {
      key: "partners",
      href: "/partners",
      icon: "partners",
      label: labels.partners,
    },
    { key: "users", href: "/users", icon: "users", label: labels.users },
    { divider: labels.fleetGov },
    { key: "fleet", href: "/fleet", icon: "fleet", label: labels.fleet },
    { divider: labels.pricingGov },
    {
      key: "switchboard",
      href: "/switchboard",
      icon: "switchboard",
      label: labels.switchboard,
    },
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
      badgeTone: "warn",
    },
    {
      key: "adapters",
      href: "/adapter-registry",
      icon: "adapters",
      label: labels.adapters,
      badge: "!",
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
  ];
}

function controlStyle({
  mono = false,
  disabled = false,
}: {
  mono?: boolean;
  disabled?: boolean;
} = {}): CSSProperties {
  return {
    width: "100%",
    minHeight: 34,
    boxSizing: "border-box",
    padding: "7px 10px",
    borderRadius: 7,
    border: `1px solid ${theme.border}`,
    background: disabled ? theme.surfaceLo : theme.bgRaised,
    color: disabled ? theme.textDim : theme.text,
    fontSize: 12.5,
    lineHeight: 1.4,
    fontFamily: mono ? theme.monoFamily : theme.fontFamily,
    outline: "none",
    opacity: disabled ? 0.72 : 1,
  };
}

function TextField({
  label,
  value,
  onChange,
  hint,
  placeholder,
  mono = false,
  required = false,
  disabled = false,
}: {
  label: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  hint?: React.ReactNode;
  placeholder?: string;
  mono?: boolean;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <Field theme={theme} label={label} hint={hint} required={required}>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={controlStyle({ mono, disabled })}
      />
    </Field>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  formatOption,
  hint,
  disabled = false,
}: {
  label: React.ReactNode;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  formatOption: (value: string) => string;
  hint?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Field theme={theme} label={label} hint={hint}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        style={controlStyle({ disabled })}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {formatOption(option)}
          </option>
        ))}
      </select>
    </Field>
  );
}

function toCanvasTone(
  tone: ReturnType<typeof partnerStatusTone>,
): "neutral" | "success" | "warn" | "danger" {
  return tone === "warning" ? "warn" : tone;
}

function fallbackActions(
  entry: PartnerDetailRecord,
): ResourceActionDescriptor[] {
  const activateDisabledReason =
    entry.status !== "inactive" ? "entry_not_inactive" : null;
  const deactivateDisabledReason =
    entry.status !== "active" ? "entry_not_active" : null;
  const credentialDisabledReason =
    entry.authMode !== "partner_api_key"
      ? "auth_mode_does_not_use_partner_credentials"
      : entry.status === "revoked"
        ? "entry_revoked"
        : null;

  const withOptionalDisabledReason = (
    action: string,
    enabled: boolean,
    riskLevel: "medium" | "high",
    options?: { disabledReasonCode?: string; requiresReason?: true },
  ): ResourceActionDescriptor => ({
    action,
    enabled,
    riskLevel,
    ...(options?.disabledReasonCode
      ? { disabledReasonCode: options.disabledReasonCode }
      : {}),
    ...(options?.requiresReason ? { requiresReason: true } : {}),
  });

  return [
    withOptionalDisabledReason("edit", entry.status !== "revoked", "medium"),
    withOptionalDisabledReason(
      "activate",
      entry.status === "inactive",
      "medium",
      activateDisabledReason
        ? { disabledReasonCode: activateDisabledReason }
        : undefined,
    ),
    withOptionalDisabledReason(
      "deactivate",
      entry.status === "active",
      "medium",
      deactivateDisabledReason
        ? { disabledReasonCode: deactivateDisabledReason }
        : undefined,
    ),
    withOptionalDisabledReason(
      "issue_credential",
      entry.status !== "revoked" && entry.authMode === "partner_api_key",
      "high",
      credentialDisabledReason
        ? {
            disabledReasonCode: credentialDisabledReason,
            requiresReason: true,
          }
        : { requiresReason: true },
    ),
    withOptionalDisabledReason(
      "rotate_credential",
      entry.status !== "revoked" && entry.authMode === "partner_api_key",
      "high",
      credentialDisabledReason
        ? {
            disabledReasonCode: credentialDisabledReason,
            requiresReason: true,
          }
        : { requiresReason: true },
    ),
  ];
}

function findAction(
  actions: ResourceActionDescriptor[],
  aliases: readonly string[],
): ResourceActionDescriptor | null {
  return actions.find((action) => aliases.includes(action.action)) ?? null;
}

function resolveCredentialEmptyReason(
  entry: PartnerDetailRecord,
  credentials: PartnerIngressCredentialRecord[],
  visibleCredentialCount: number,
  error: string | null,
): EmptyReason | null {
  if (credentials.length > 0) {
    if (visibleCredentialCount === 0) {
      return "filtered_empty";
    }
    return null;
  }
  if (error) {
    return "fetch_failed";
  }
  if (entry.status === "revoked") {
    return "permission_denied";
  }
  if (entry.authMode !== "partner_api_key") {
    return "no_data";
  }
  if (!entry.eligibilityContract) {
    return "external_unavailable";
  }
  return "not_provisioned";
}

function emptyStateTone(
  reason: EmptyReason,
): "neutral" | "accent" | "danger" | "warning" {
  switch (reason) {
    case "not_provisioned":
      return "accent";
    case "permission_denied":
    case "fetch_failed":
      return "danger";
    case "external_unavailable":
      return "warning";
    case "filtered_empty":
      return "accent";
    case "no_data":
    default:
      return "neutral";
  }
}

function emptyStateCopy(
  reason: EmptyReason,
  locale: string,
): { title: string; body: string } {
  if (locale === "en") {
    switch (reason) {
      case "not_provisioned":
        return {
          title: "Credential lane is not provisioned",
          body: "This entry expects partner-managed ingress secrets, but no credential has been issued yet.",
        };
      case "fetch_failed":
        return {
          title: "Credential data could not be loaded",
          body: "The latest credential snapshot failed to load. Retry before making rollout decisions.",
        };
      case "permission_denied":
        return {
          title: "Credential actions are locked",
          body: "This entry is revoked or read-only for the current actor. Review audit lineage before proceeding.",
        };
      case "external_unavailable":
        return {
          title: "Upstream linkage is not ready",
          body: "Adapter or contract linkage is incomplete, so credential posture cannot be treated as production-ready yet.",
        };
      case "filtered_empty":
        return {
          title: "No credentials match the current filter",
          body: "Clear filters or switch lifecycle scope to inspect hidden credential records.",
        };
      case "no_data":
      default:
        return {
          title: "No credential history yet",
          body: "This entry does not currently expose any ingress credential records.",
        };
    }
  }

  switch (reason) {
    case "not_provisioned":
      return {
        title: "憑證流程尚未 provision",
        body: "此 entry 需要 partner-managed ingress secret，但目前尚未核發任何 credential。",
      };
    case "fetch_failed":
      return {
        title: "無法載入 credential 資料",
        body: "最新 credential snapshot 讀取失敗，請先重新整理再做 rollout 判斷。",
      };
    case "permission_denied":
      return {
        title: "Credential 動作目前被鎖定",
        body: "此 entry 已撤銷或對當前角色為 read-only，應先檢查 audit lineage。",
      };
    case "external_unavailable":
      return {
        title: "上游 linkage 尚未就緒",
        body: "Adapter 或 contract linkage 尚未完整，因此目前不能把 credential posture 視為 production-ready。",
      };
    case "filtered_empty":
      return {
        title: "目前篩選下沒有符合的 credential",
        body: "請清除篩選條件或切換 lifecycle scope 以檢視被隱藏的紀錄。",
      };
    case "no_data":
    default:
      return {
        title: "目前沒有 credential 歷史",
        body: "此 entry 目前沒有可顯示的 ingress credential 紀錄。",
      };
  }
}

function emptyStateAccentLabel(reason: EmptyReason, locale: string): string {
  if (locale === "en") {
    switch (reason) {
      case "not_provisioned":
        return "Provision required";
      case "fetch_failed":
        return "Retry needed";
      case "permission_denied":
        return "Read-only";
      case "external_unavailable":
        return "Upstream blocked";
      case "filtered_empty":
        return "Filter mismatch";
      case "no_data":
      default:
        return "No history";
    }
  }

  switch (reason) {
    case "not_provisioned":
      return "待 provision";
    case "fetch_failed":
      return "需重試";
    case "permission_denied":
      return "唯讀";
    case "external_unavailable":
      return "上游阻塞";
    case "filtered_empty":
      return "篩選不符";
    case "no_data":
    default:
      return "尚無紀錄";
  }
}

function actionLabel(
  intent: ActionIntent,
  locale: string,
): { title: string; confirm: string } {
  if (locale === "en") {
    switch (intent) {
      case "edit":
        return { title: "Save entry changes", confirm: "Save changes" };
      case "activate":
        return { title: "Activate partner entry", confirm: "Activate" };
      case "deactivate":
        return { title: "Deactivate partner entry", confirm: "Deactivate" };
      case "issue_credential":
        return {
          title: "Issue ingress credential",
          confirm: "Issue credential",
        };
      case "rotate_credential":
        return {
          title: "Rotate ingress credential",
          confirm: "Rotate credential",
        };
      case "revoke_credential":
        return { title: "Revoke credential", confirm: "Revoke credential" };
    }
  }

  switch (intent) {
    case "edit":
      return { title: "儲存 entry 變更", confirm: "儲存變更" };
    case "activate":
      return { title: "啟用 partner entry", confirm: "啟用" };
    case "deactivate":
      return { title: "停用 partner entry", confirm: "停用" };
    case "issue_credential":
      return { title: "核發 ingress credential", confirm: "核發 credential" };
    case "rotate_credential":
      return { title: "輪替 ingress credential", confirm: "輪替 credential" };
    case "revoke_credential":
      return { title: "撤銷 credential", confirm: "撤銷 credential" };
  }
}

function actionHelpText(
  descriptor: ResourceActionDescriptor,
  locale: string,
): string {
  const reasonText = descriptor.requiresReason
    ? locale === "en"
      ? "A reason is required."
      : "需要填寫原因。"
    : locale === "en"
      ? "No reason required."
      : "不需要填寫原因。";
  const riskText =
    locale === "en"
      ? `Risk: ${descriptor.riskLevel}.`
      : `風險等級：${descriptor.riskLevel}。`;

  return `${riskText} ${reasonText}`;
}

function disabledReasonLabel(code: string | undefined, locale: string): string {
  if (!code) {
    return locale === "en" ? "Action unavailable" : "此動作目前不可用";
  }
  const dict =
    locale === "en"
      ? {
          entry_not_inactive: "The entry must be inactive before activation.",
          entry_not_active: "The entry must be active before deactivation.",
          auth_mode_does_not_use_partner_credentials:
            "This auth mode does not rely on partner-managed ingress credentials.",
          entry_revoked: "Revoked entries cannot issue or rotate credentials.",
        }
      : {
          entry_not_inactive: "僅 inactive entry 可執行啟用。",
          entry_not_active: "僅 active entry 可執行停用。",
          auth_mode_does_not_use_partner_credentials:
            "此 auth mode 不使用 partner-managed ingress credential。",
          entry_revoked: "已撤銷的 entry 不可再核發或輪替 credential。",
        };

  return dict[code as keyof typeof dict] ?? code;
}

function deriveDeepLinks(
  entry: PartnerDetailRecord,
  locale: string,
): Array<{
  key: string;
  label: string;
  href: string;
  openInNewTab: boolean;
  helper: string;
}> {
  const links: Array<{
    key: string;
    label: string;
    href: string;
    openInNewTab: boolean;
    helper: string;
  }> = [];
  const seen = new Set<string>();

  const pushLink = (link: {
    key: string;
    label: string;
    href: string;
    openInNewTab: boolean;
    helper: string;
  }) => {
    const dedupeKey = `${link.label}::${link.href}`;
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);
    links.push(link);
  };

  pushLink({
    key: "tenant-detail",
    label: locale === "en" ? "Tenant detail" : "Tenant 詳情",
    href: `/tenants/${encodeURIComponent(entry.tenantId)}`,
    openInNewTab: false,
    helper:
      locale === "en"
        ? "Review rollout state, onboarding, and governance posture in Platform Admin."
        : "回到 Platform Admin 的 tenant 詳情，檢查 rollout、onboarding 與治理狀態。",
  });

  pushLink({
    key: "tenant-ops",
    label: locale === "en" ? "Ops tenant view" : "Ops tenant 視圖",
    href: `https://ops.drts.io/tenants/${encodeURIComponent(entry.tenantId)}`,
    openInNewTab: true,
    helper:
      locale === "en"
        ? "Open the operational dispatch context for this tenant in Ops Console."
        : "在 Ops Console 以新分頁開啟此 tenant 的 operational dispatch context。",
  });

  pushLink({
    key: "adapter-registry",
    label: locale === "en" ? "Adapter registry" : "Adapter registry",
    href: `/adapter-registry?entrySlug=${encodeURIComponent(entry.entrySlug)}`,
    openInNewTab: false,
    helper:
      locale === "en"
        ? "Inspect adapter linkage, health posture, and credential dependencies."
        : "檢查 adapter linkage、健康狀態與 credential 依賴。",
  });

  pushLink({
    key: "audit",
    label: locale === "en" ? "Audit trail" : "Audit trail",
    href: `/audit?resourceType=partner_entry&resourceId=${encodeURIComponent(entry.entrySlug)}`,
    openInNewTab: false,
    helper:
      locale === "en"
        ? "Filter audit evidence to this partner entry and its state-changing actions."
        : "將 audit evidence 篩到此 partner entry 與其所有狀態變更。",
  });

  const explicitLinks = [
    {
      key: "tenant-link",
      link: entry.tenantLink,
      fallbackHelper:
        locale === "en"
          ? "Backend-provided tenant governance link for this entry."
          : "後端提供的 tenant governance 連結。",
    },
    {
      key: "adapter-link",
      link: entry.adapterLink,
      fallbackHelper:
        locale === "en"
          ? "Backend-provided adapter linkage for this entry."
          : "後端提供的 adapter linkage。",
    },
    {
      key: "webhook-link",
      link: entry.webhookLink,
      fallbackHelper:
        locale === "en"
          ? "Backend-provided webhook configuration linkage for this entry."
          : "後端提供的 webhook configuration linkage。",
    },
  ];

  explicitLinks.forEach(({ key, link, fallbackHelper }) => {
    if (!link) {
      return;
    }
    pushLink({
      key,
      label: String(link.label),
      href: link.route.startsWith("http")
        ? link.route
        : link.targetApp === "ops-console"
          ? `https://ops.drts.io${link.route}`
          : link.route,
      openInNewTab: link.openMode === "new_tab",
      helper: fallbackHelper,
    });
  });

  const upstream: CrossAppResourceLink[] = entry.crossAppLinks ?? [];
  upstream.forEach((link) => {
    pushLink({
      key: `${link.targetApp}:${link.resourceType}:${link.resourceId}`,
      label: String(link.label),
      href: link.route.startsWith("http")
        ? link.route
        : link.targetApp === "ops-console"
          ? `https://ops.drts.io${link.route}`
          : link.route,
      openInNewTab: link.openMode === "new_tab",
      helper:
        locale === "en"
          ? `${link.targetApp} · ${link.resourceType}`
          : `${link.targetApp} · ${link.resourceType}`,
    });
  });

  return links;
}

function PlaintextCredentialModal({
  issuedCredential,
  locale,
  onClose,
}: {
  issuedCredential: PartnerIngressCredentialIssued;
  locale: string;
  onClose: () => void;
}) {
  const [stored, setStored] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const title =
    locale === "en"
      ? "Plaintext credential shown once"
      : "Plaintext credential 僅顯示一次";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(issuedCredential.plaintextKey);
    setCopied(true);
  };

  const handleDownload = () => {
    const blob = new Blob([`${issuedCredential.plaintextKey}\n`], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${issuedCredential.credential.entrySlug}-credential.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  };

  return (
    <div style={modalScrimStyle} role="dialog" aria-modal="true">
      <div style={modalCardStyle}>
        <div style={{ display: "grid", gap: 6 }}>
          <div
            style={{ ...shellBadgeRowStyle, justifyContent: "space-between" }}
          >
            <Pill theme={theme} tone="danger">
              Q-ADM07
            </Pill>
            <Pill theme={theme} tone="accent">
              {locale === "en"
                ? "plaintext-once modal"
                : "plaintext-once modal"}
            </Pill>
          </div>
          <h2 style={{ margin: 0, fontSize: 20, color: theme.text }}>
            {title}
          </h2>
          <div style={mutedTextStyle}>
            {locale === "en"
              ? "Copy or download the secret now. It will not be shown again after this modal closes."
              : "請現在複製或下載這把 secret。關閉此 modal 後，系統不會再次明文顯示。"}
          </div>
        </div>

        <div style={secretBoxStyle}>
          <DL
            theme={theme}
            cols={2}
            items={[
              {
                k: locale === "en" ? "Entry slug" : "Entry slug",
                v: issuedCredential.credential.entrySlug,
                mono: true,
              },
              {
                k: locale === "en" ? "Key ID" : "Key ID",
                v: issuedCredential.credential.keyId,
                mono: true,
              },
              {
                k: locale === "en" ? "Issued at" : "核發時間",
                v: formatDateTime(issuedCredential.credential.createdAt),
                mono: true,
              },
              {
                k: locale === "en" ? "Revoked credential" : "被取代憑證",
                v: issuedCredential.revokedCredentialId ?? "—",
                mono: true,
              },
            ]}
          />
          <pre style={monospaceBlockStyle}>{issuedCredential.plaintextKey}</pre>
        </div>

        <div style={buttonRowStyle}>
          <Btn
            theme={theme}
            variant="secondary"
            onClick={() => void handleCopy()}
          >
            {copied
              ? locale === "en"
                ? "Copied"
                : "已複製"
              : locale === "en"
                ? "Copy"
                : "複製"}
          </Btn>
          <Btn theme={theme} variant="secondary" onClick={handleDownload}>
            {downloaded
              ? locale === "en"
                ? "Downloaded"
                : "已下載"
              : locale === "en"
                ? "Download .txt"
                : "下載 .txt"}
          </Btn>
        </div>

        <label style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <input
            type="checkbox"
            checked={stored}
            onChange={(event) => setStored(event.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span style={mutedTextStyle}>
            {locale === "en"
              ? "I stored this key securely and understand that the plaintext value will not be shown again."
              : "我已安全保存此 key，並理解關閉後系統不會再顯示明文值。"}
          </span>
        </label>

        <div style={overlayActionsStyle}>
          <div style={mutedTextStyle}>
            {locale === "en"
              ? "Keep audit lineage and rotation notes in sync with any handoff outside this app."
              : "若此 secret 需要交接到其他系統，請同步維護 audit lineage 與 rotation note。"}
          </div>
          <Btn
            theme={theme}
            variant="primary"
            disabled={!stored}
            onClick={onClose}
          >
            {locale === "en" ? "I stored this key" : "我已保存此 key"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function ActionModal({
  pendingAction,
  locale,
  working,
  onClose,
  onSubmit,
}: {
  pendingAction: PendingAction;
  locale: string;
  working: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const labels = actionLabel(pendingAction.intent, locale);
  const requiresReason = Boolean(pendingAction.descriptor.requiresReason);
  const revokeLabel =
    pendingAction.intent === "revoke_credential" ? pendingAction.label : null;

  return (
    <div style={modalScrimStyle} role="dialog" aria-modal="true">
      <div style={modalCardStyle}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={shellBadgeRowStyle}>
            <Pill
              theme={theme}
              tone={
                pendingAction.descriptor.riskLevel === "high"
                  ? "danger"
                  : pendingAction.descriptor.riskLevel === "medium"
                    ? "warn"
                    : "neutral"
              }
            >
              {pendingAction.descriptor.riskLevel}
            </Pill>
            {requiresReason ? (
              <Pill theme={theme} tone="accent">
                {locale === "en" ? "reason required" : "需填原因"}
              </Pill>
            ) : null}
          </div>
          <h2 style={{ margin: 0, fontSize: 20, color: theme.text }}>
            {labels.title}
          </h2>
          <div style={mutedTextStyle}>
            {revokeLabel
              ? locale === "en"
                ? `This will revoke ${revokeLabel}. The operation is audit-logged.`
                : `這會撤銷 ${revokeLabel}，且操作會寫入 audit。`
              : actionHelpText(pendingAction.descriptor, locale)}
          </div>
        </div>

        <Field
          theme={theme}
          label={locale === "en" ? "Reason" : "原因"}
          hint={
            requiresReason
              ? locale === "en"
                ? "Required for high-risk partner governance actions."
                : "高風險 partner governance 動作必填。"
              : locale === "en"
                ? "Optional audit context."
                : "可選填的 audit context。"
          }
          required={requiresReason}
        >
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            style={{ ...controlStyle(), resize: "vertical" }}
          />
        </Field>

        <div style={overlayActionsStyle}>
          <Btn
            theme={theme}
            variant="secondary"
            onClick={onClose}
            disabled={working}
          >
            {locale === "en" ? "Cancel" : "取消"}
          </Btn>
          <Btn
            theme={theme}
            variant="primary"
            disabled={working || (requiresReason && !reason.trim())}
            onClick={() => void onSubmit(reason.trim())}
          >
            {working
              ? locale === "en"
                ? "Working..."
                : "處理中..."
              : labels.confirm}
          </Btn>
        </div>
      </div>
    </div>
  );
}

export default function PartnerDetailPage() {
  const params = useParams<{ entrySlug: string }>();
  const entrySlug = Array.isArray(params?.entrySlug)
    ? params.entrySlug[0]
    : (params?.entrySlug ?? "");
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [entry, setEntry] = useState<PartnerDetailRecord | null>(null);
  const [editForm, setEditForm] = useState<EntryFormState>(EMPTY_ENTRY_FORM);
  const [credentials, setCredentials] = useState<
    PartnerIngressCredentialRecord[]
  >([]);
  const [issuedCredential, setIssuedCredential] =
    useState<PartnerIngressCredentialIssued | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [changingStatus, setChangingStatus] = useState<ActionIntent | null>(
    null,
  );
  const [revokingCredentialId, setRevokingCredentialId] = useState<
    string | null
  >(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [credentialFilter, setCredentialFilter] =
    useState<CredentialLifecycleFilter>("active");
  const [activeSection, setActiveSection] =
    useState<DetailSectionId>("overview");

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(max-width: 1120px)");
    const syncViewport = () => setIsCompactViewport(mediaQuery.matches);
    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  const loadEntry = useCallback(
    async (options?: { preserveIssuedCredential?: boolean }) => {
      if (!entrySlug) {
        setEntry(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const entries =
          (await client.listPlatformPartnerEntries()) as PartnerDetailRecord[];
        const selected =
          entries.find((candidate) => candidate.entrySlug === entrySlug) ??
          null;
        setEntry(selected);
        setEditForm(selected ? toPartnerFormState(selected) : EMPTY_ENTRY_FORM);

        if (!options?.preserveIssuedCredential) {
          setIssuedCredential(null);
        }

        if (selected) {
          const nextCredentials =
            await client.listPlatformPartnerIngressCredentials(
              selected.entrySlug,
            );
          setCredentials(nextCredentials ?? []);
        } else {
          setCredentials([]);
        }
        setLastLoadedAt(new Date().toISOString());
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setEntry(null);
        setEditForm(EMPTY_ENTRY_FORM);
        setCredentials([]);
      } finally {
        setLoading(false);
      }
    },
    [client, entrySlug],
  );

  useEffect(() => {
    void loadEntry();
  }, [loadEntry]);

  useEffect(() => {
    if (!entrySlug) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      void loadEntry({ preserveIssuedCredential: true });
    }, T4_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [entrySlug, loadEntry]);

  const updateFormField = <Key extends keyof EntryFormState>(
    key: Key,
    value: EntryFormState[Key],
  ) => {
    setEditForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const availableActions = useMemo(() => {
    if (!entry) {
      return [];
    }
    return entry.availableActions?.length
      ? entry.availableActions
      : fallbackActions(entry);
  }, [entry]);

  const editAction = useMemo(
    () => findAction(availableActions, ["edit", "update"]),
    [availableActions],
  );
  const activateAction = useMemo(
    () => findAction(availableActions, ["activate"]),
    [availableActions],
  );
  const deactivateAction = useMemo(
    () => findAction(availableActions, ["deactivate"]),
    [availableActions],
  );
  const issueAction = useMemo(
    () =>
      findAction(availableActions, [
        "issue_credential",
        "issue_cred",
        "issueCredential",
      ]),
    [availableActions],
  );
  const rotateAction = useMemo(
    () =>
      findAction(availableActions, [
        "rotate_credential",
        "rotate",
        "rotateCredential",
      ]),
    [availableActions],
  );
  const revokeCredentialAction = useMemo(
    () =>
      findAction(availableActions, [
        "revoke_credential",
        "revokeCredential",
        "revoke",
      ]),
    [availableActions],
  );

  const activeCredentialCount = useMemo(
    () => credentials.filter((credential) => !credential.revokedAt).length,
    [credentials],
  );
  const latestCredential = credentials[0] ?? null;
  const latestActiveCredential =
    credentials.find((credential) => !credential.revokedAt) ?? null;

  const readinessItems = useMemo(
    () =>
      entry
        ? buildPartnerReadinessItems(entry, t, {
            activeCredentialCount,
          })
        : [],
    [activeCredentialCount, entry, t],
  );

  const readinessReadyCount = readinessItems.filter(
    (item) => item.ready,
  ).length;
  const readinessMissingCount = readinessItems.length - readinessReadyCount;
  const readinessComplete =
    readinessItems.length > 0 && readinessItems.every((item) => item.ready);

  const previewUrl =
    entry?.entryHost && entry?.entryPath
      ? `https://${entry.entryHost}${entry.entryPath}`
      : null;

  const supportValue = useMemo(() => {
    if (!entry) {
      return "—";
    }
    return (
      [
        entry.brandingMetadata?.supportEmail,
        entry.brandingMetadata?.supportPhone,
      ]
        .filter(Boolean)
        .join(" · ") || "—"
    );
  }, [entry]);

  const overviewItems = useMemo(() => {
    if (!entry) {
      return [];
    }

    return [
      {
        k: "DISPLAY NAME",
        v: entry.displayName,
      },
      {
        k: "TENANT",
        v: `${entry.partnerType} · ${entry.tenantId}`,
        mono: true,
      },
      { k: "BANK CODE", v: entry.bankCode ?? "—", mono: true },
      {
        k: "PROGRAM",
        v: `${entry.partnerCode} · ${entry.programId}`,
        mono: true,
      },
      {
        k: "BUSINESS SUBTYPE",
        v: formatPlatformCodeLabel(locale, entry.businessDispatchSubtype),
        mono: true,
      },
      {
        k: "AUTH MODE",
        v: formatPlatformCodeLabel(locale, entry.authMode),
        mono: true,
      },
      {
        k: "ELIGIBILITY",
        v: formatPlatformCodeLabel(locale, entry.eligibilityMode),
        mono: true,
      },
      { k: "ENTRY HOST", v: entry.entryHost ?? "—", mono: true },
      { k: "ENTRY PATH", v: entry.entryPath ?? "—", mono: true },
      {
        k: "THEME ACCENT",
        v: entry.themeAccent ? (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: entry.themeAccent,
                border: `1px solid ${theme.border}`,
              }}
            />
            <span style={{ fontFamily: theme.monoFamily, fontSize: 11.5 }}>
              {entry.themeAccent}
            </span>
          </span>
        ) : (
          "—"
        ),
      },
      { k: "SUPPORT CONTACT", v: supportValue },
    ];
  }, [entry, locale, supportValue]);

  const eligibilitySnapshotItems = useMemo(() => {
    if (!entry) {
      return [];
    }
    const contract = entry.eligibilityContract;
    return [
      {
        k: locale === "en" ? "Contract ID" : "契約 ID",
        v: contract?.contractId ?? "—",
        mono: true,
      },
      {
        k: locale === "en" ? "Adapter" : "Adapter",
        v: contract
          ? `${contract.adapterCode} · ${contract.adapterVersion}`
          : "—",
        mono: true,
      },
      {
        k: locale === "en" ? "Adapter posture" : "Adapter posture",
        v: contract?.adapterKind ?? "—",
      },
      {
        k: locale === "en" ? "Fallback" : "Fallback",
        v: contract?.manualFallbackPolicy?.requiredOnTimeout
          ? locale === "en"
            ? "Ops queue required"
            : "需進 ops queue"
          : locale === "en"
            ? "No timeout fallback"
            : "無 timeout fallback",
      },
    ];
  }, [entry, locale]);

  const auditItems = useMemo(() => {
    if (!entry) {
      return [];
    }
    return [
      {
        k: locale === "en" ? "Audit source" : "Audit 來源",
        v: entry.auditMetadata.source ?? "—",
      },
      {
        k: locale === "en" ? "Request ID" : "Request ID",
        v: entry.auditMetadata.requestId ?? "—",
        mono: true,
      },
      {
        k: locale === "en" ? "Created by" : "建立者",
        v: entry.auditMetadata.createdBy ?? "—",
      },
      {
        k: locale === "en" ? "Created at" : "建立時間",
        v: formatDateTime(entry.createdAt),
        mono: true,
      },
      {
        k: locale === "en" ? "Updated by" : "更新者",
        v: entry.auditMetadata.updatedBy ?? "—",
      },
      {
        k: locale === "en" ? "Updated at" : "更新時間",
        v: formatDateTime(entry.updatedAt),
        mono: true,
      },
      {
        k: locale === "en" ? "Revoked at" : "撤銷時間",
        v: entry.revokedAt ? formatDateTime(entry.revokedAt) : "—",
        mono: true,
      },
      {
        k: locale === "en" ? "Revoke reason" : "撤銷原因",
        v: entry.revokeReason ?? "—",
      },
    ];
  }, [entry, locale]);

  const filteredCredentials = useMemo(
    () =>
      credentials.filter((credential) => {
        if (credentialFilter === "all") {
          return true;
        }
        if (credentialFilter === "revoked") {
          return Boolean(credential.revokedAt);
        }
        return !credential.revokedAt;
      }),
    [credentialFilter, credentials],
  );

  const credentialRows = useMemo<CredentialRow[]>(
    () =>
      [...filteredCredentials]
        .sort((left, right) => {
          if (Boolean(left.revokedAt) !== Boolean(right.revokedAt)) {
            return left.revokedAt ? 1 : -1;
          }
          return (
            new Date(right.createdAt).getTime() -
            new Date(left.createdAt).getTime()
          );
        })
        .map((credential) => ({
          keyId: credential.keyId,
          masked: `${credential.keyPrefix}${credential.maskedSuffix}`,
          source: credential.source,
          createdAt: formatDateTime(credential.createdAt),
          lastUsedAt: credential.lastUsedAt
            ? formatDateTime(credential.lastUsedAt)
            : "—",
          revokedAt: credential.revokedAt,
        })),
    [filteredCredentials],
  );

  const credentialColumns = useMemo<CanvasTableColumn<CredentialRow>[]>(
    () => [
      {
        h: locale === "en" ? "masked" : "憑證",
        k: "masked",
        mono: true,
        w: 170,
      },
      {
        h: locale === "en" ? "source" : "來源",
        k: "source",
        mono: true,
        w: 150,
      },
      {
        h: locale === "en" ? "created" : "建立",
        k: "createdAt",
        mono: true,
        w: 160,
      },
      {
        h: locale === "en" ? "last used" : "最後使用",
        k: "lastUsedAt",
        mono: true,
        w: 160,
      },
      {
        h: locale === "en" ? "status" : "狀態",
        w: 110,
        r: (row) => (
          <Pill
            theme={theme}
            tone={row.revokedAt ? "danger" : "success"}
            dot={!row.revokedAt}
          >
            {row.revokedAt
              ? t("partners.credentialStatus.revoked")
              : t("partners.credentialStatus.active")}
          </Pill>
        ),
      },
      {
        h: "",
        w: 120,
        r: (row) =>
          row.revokedAt || !revokeCredentialAction ? (
            <span style={mutedTextStyle}>—</span>
          ) : (
            <Btn
              theme={theme}
              variant="secondary"
              size="xs"
              disabled={
                !revokeCredentialAction.enabled ||
                revokingCredentialId === row.keyId
              }
              onClick={() =>
                setPendingAction({
                  intent: "revoke_credential",
                  descriptor: revokeCredentialAction,
                  keyId: row.keyId,
                  label: row.masked,
                })
              }
            >
              {revokingCredentialId === row.keyId
                ? t("partners.revokingCredential")
                : t("partners.revokeCredential")}
            </Btn>
          ),
      },
    ],
    [locale, revokeCredentialAction, revokingCredentialId, t],
  );

  const credentialEmptyReason = useMemo(
    () =>
      entry
        ? resolveCredentialEmptyReason(
            entry,
            credentials,
            filteredCredentials.length,
            error,
          )
        : null,
    [credentials, entry, error, filteredCredentials.length],
  );

  const deepLinks = useMemo(
    () => (entry ? deriveDeepLinks(entry, locale) : []),
    [entry, locale],
  );

  const detailSections = useMemo<
    Array<{ id: DetailSectionId; label: string; badge?: string }>
  >(
    () => [
      { id: "overview", label: locale === "en" ? "Overview" : "Overview" },
      { id: "branding", label: locale === "en" ? "Branding" : "Branding" },
      { id: "auth", label: locale === "en" ? "Auth" : "Auth" },
      {
        id: "eligibility",
        label: locale === "en" ? "Eligibility" : "Eligibility",
      },
      {
        id: "readiness",
        label: locale === "en" ? "Readiness" : "Readiness",
        ...(readinessMissingCount > 0
          ? { badge: String(readinessMissingCount) }
          : {}),
      },
      {
        id: "credentials",
        label: locale === "en" ? "Credentials" : "Credentials",
        ...(credentials.length > 0
          ? { badge: String(credentials.length) }
          : {}),
      },
      { id: "audit", label: locale === "en" ? "Audit" : "Audit" },
    ],
    [credentials.length, locale, readinessMissingCount],
  );

  const refreshTier =
    entry?.refreshTier ?? ("medium_slow" satisfies RefreshTier);
  const isStaleData = Boolean(
    lastLoadedAt &&
    Date.now() - new Date(lastLoadedAt).getTime() > T4_REFRESH_MS,
  );
  const freshnessTone = error ? "danger" : isStaleData ? "warn" : "success";

  const linkageItems = useMemo(
    () => [
      {
        k: locale === "en" ? "Webhook linkage" : "Webhook linkage",
        v: entry?.webhookLink ? (
          <span style={shellBadgeRowStyle}>
            <Pill theme={theme} tone="accent">
              {locale === "en" ? "linked" : "已連結"}
            </Pill>
            <span style={mutedTextStyle}>{entry.webhookLink.label}</span>
          </span>
        ) : locale === "en" ? (
          "Not linked"
        ) : (
          "尚未連結"
        ),
      },
      {
        k: locale === "en" ? "Adapter linkage" : "Adapter linkage",
        v: entry?.adapterLink ? (
          <span style={shellBadgeRowStyle}>
            <Pill theme={theme} tone="accent">
              {locale === "en" ? "linked" : "已連結"}
            </Pill>
            <span style={mutedTextStyle}>{entry.adapterLink.label}</span>
          </span>
        ) : locale === "en" ? (
          "Not linked"
        ) : (
          "尚未連結"
        ),
      },
      {
        k: locale === "en" ? "Cross-app links" : "Cross-app links",
        v: `${deepLinks.length}`,
        mono: true,
      },
      {
        k: locale === "en" ? "Refresh tier" : "Refresh tier",
        v: `${refreshTier} · 30s`,
        mono: true,
      },
    ],
    [
      deepLinks.length,
      entry?.adapterLink,
      entry?.webhookLink,
      locale,
      refreshTier,
    ],
  );

  const promotionSnapshotItems = useMemo(
    () => [
      {
        k: locale === "en" ? "Entry route" : "Entry route",
        v: previewUrl ?? "—",
        mono: true,
      },
      {
        k: locale === "en" ? "Support contact" : "Support contact",
        v: supportValue,
      },
      {
        k: locale === "en" ? "Credential coverage" : "Credential coverage",
        v: `${activeCredentialCount} ${locale === "en" ? "active" : "有效"}`,
        mono: true,
      },
      {
        k: locale === "en" ? "Refresh target" : "Refresh target",
        v: `${refreshTier} · 30s`,
        mono: true,
      },
    ],
    [activeCredentialCount, locale, previewUrl, refreshTier, supportValue],
  );

  const credentialSummaryItems = useMemo(
    () => [
      {
        k: locale === "en" ? "Latest active key" : "最新有效 key",
        v: latestActiveCredential
          ? `${latestActiveCredential.keyPrefix}${latestActiveCredential.maskedSuffix}`
          : "—",
        mono: true,
      },
      {
        k: locale === "en" ? "Last rotation" : "最近輪替",
        v: latestCredential ? formatDateTime(latestCredential.createdAt) : "—",
        mono: true,
      },
      {
        k: locale === "en" ? "Last used" : "最後使用",
        v: latestActiveCredential?.lastUsedAt
          ? formatDateTime(latestActiveCredential.lastUsedAt)
          : "—",
        mono: true,
      },
      {
        k: locale === "en" ? "Actions exposed" : "已暴露動作",
        v: availableActions.length,
        mono: true,
      },
    ],
    [availableActions.length, latestActiveCredential, latestCredential, locale],
  );

  const jumpToSection = useCallback((sectionId: DetailSectionId) => {
    setActiveSection(sectionId);
    if (typeof document === "undefined") {
      return;
    }
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const executePendingAction = useCallback(
    async (reason: string) => {
      if (!entry || !pendingAction) {
        return;
      }

      try {
        if (pendingAction.intent === "activate") {
          setChangingStatus("activate");
          await client.activatePlatformPartnerEntry(entry.entrySlug);
        } else if (pendingAction.intent === "deactivate") {
          setChangingStatus("deactivate");
          await client.deactivatePlatformPartnerEntry(entry.entrySlug);
        } else if (pendingAction.intent === "issue_credential") {
          setChangingStatus("issue_credential");
          const issued = await client.issuePlatformPartnerIngressCredential(
            entry.entrySlug,
            { rotationReason: reason || null },
          );
          setIssuedCredential(issued);
        } else if (pendingAction.intent === "rotate_credential") {
          setChangingStatus("rotate_credential");
          const issued = await client.issuePlatformPartnerIngressCredential(
            entry.entrySlug,
            { rotationReason: reason || null },
          );
          setIssuedCredential(issued);
        } else if (pendingAction.intent === "revoke_credential") {
          setRevokingCredentialId(pendingAction.keyId);
          await client.revokePlatformPartnerIngressCredential(
            entry.entrySlug,
            pendingAction.keyId,
            { revokeReason: reason || null },
          );
        }

        setPendingAction(null);
        await loadEntry({ preserveIssuedCredential: true });
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setChangingStatus(null);
        setRevokingCredentialId(null);
      }
    },
    [client, entry, loadEntry, pendingAction],
  );

  const saveEntry = useCallback(async () => {
    if (!entry || !editAction?.enabled) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await client.updatePlatformPartnerEntry(
        entry.entrySlug,
        toPartnerUpdateCommand(editForm),
      );
      await loadEntry();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }, [client, editAction?.enabled, editForm, entry, loadEntry]);

  const handleSave = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await saveEntry();
    },
    [saveEntry],
  );

  if (loading) {
    return (
      <div
        style={{
          ...pageStackStyle,
          minHeight: "100vh",
          placeContent: "center",
        }}
      >
        <WorkflowEmptyState
          title={t("partners.loading")}
          description={
            locale === "en"
              ? "Loading partner entry detail, credentials, and governance posture."
              : "正在載入 partner entry 詳情、憑證與治理狀態。"
          }
          tone="accent"
        />
      </div>
    );
  }

  if (!entry) {
    return (
      <CanvasShell
        theme={theme}
        nav={buildPlatformNav(locale)}
        active="partners"
        currentPath="/partners"
        title="Platform Admin"
        brandLabel="DRTS"
        env="production"
        style={shellStyle}
      >
        <div style={pageStackStyle}>
          <PageHeader
            theme={theme}
            title={
              locale === "en"
                ? "Partner entry unavailable"
                : "Partner entry 無法使用"
            }
            subtitle={
              error ??
              (locale === "en" ? "Entry not found." : "找不到此 entry。")
            }
            actions={
              <Link href="/partners" style={{ textDecoration: "none" }}>
                <Btn theme={theme} variant="secondary">
                  {locale === "en" ? "Back to entries" : "返回 partner entries"}
                </Btn>
              </Link>
            }
          />
          <Banner
            theme={theme}
            tone="danger"
            title={locale === "en" ? "Entry not found" : "找不到 entry"}
            body={
              error ??
              (locale === "en"
                ? "The partner entry could not be resolved from the current dataset."
                : "目前資料集中找不到這筆 partner entry。")
            }
          />
        </div>
      </CanvasShell>
    );
  }

  const statusTone = toCanvasTone(
    partnerStatusTone(entry.status as PartnerEntryStatus),
  );

  return (
    <>
      <CanvasShell
        theme={theme}
        nav={buildPlatformNav(locale)}
        active="partners"
        currentPath={`/partners/${entry.entrySlug}`}
        title="Platform Admin"
        brandLabel="DRTS"
        env="production"
        style={shellStyle}
      >
        <div style={pageStackStyle}>
          <PageHeader
            theme={theme}
            title={entry.displayName}
            subtitle={`/${entry.entrySlug} · ${entry.partnerCode} · ${entry.programId}`}
            actions={
              <div style={buttonRowStyle}>
                <Link href="/partners" style={{ textDecoration: "none" }}>
                  <Btn theme={theme} variant="secondary">
                    {locale === "en"
                      ? "Back to entries"
                      : "返回 partner entries"}
                  </Btn>
                </Link>
                <Btn
                  theme={theme}
                  variant="secondary"
                  onClick={() =>
                    void loadEntry({ preserveIssuedCredential: true })
                  }
                >
                  {locale === "en" ? "Refresh" : "重新整理"}
                </Btn>
                {previewUrl ? (
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ textDecoration: "none" }}
                  >
                    <Btn theme={theme} variant="secondary">
                      {locale === "en" ? "Preview entry" : "預覽 entry"}
                    </Btn>
                  </a>
                ) : null}
                {issueAction ? (
                  <Btn
                    theme={theme}
                    variant="primary"
                    disabled={
                      !issueAction.enabled ||
                      changingStatus === "issue_credential"
                    }
                    onClick={() =>
                      setPendingAction({
                        intent: "issue_credential",
                        descriptor: issueAction,
                      })
                    }
                  >
                    {locale === "en" ? "Issue credential" : "核發 credential"}
                  </Btn>
                ) : null}
                {rotateAction ? (
                  <Btn
                    theme={theme}
                    variant="secondary"
                    disabled={
                      !rotateAction.enabled ||
                      changingStatus === "rotate_credential"
                    }
                    onClick={() =>
                      setPendingAction({
                        intent: "rotate_credential",
                        descriptor: rotateAction,
                      })
                    }
                  >
                    {locale === "en" ? "Rotate credential" : "輪替 credential"}
                  </Btn>
                ) : null}
              </div>
            }
          />

          {error ? (
            <Banner
              theme={theme}
              tone="danger"
              title={
                locale === "en"
                  ? "Unable to update partner entry"
                  : "Partner entry 更新失敗"
              }
              body={error}
            />
          ) : null}

          {isStaleData ? (
            <Banner
              theme={theme}
              tone="warn"
              title={locale === "en" ? "Data is stale" : "資料已變舊"}
              body={
                locale === "en"
                  ? `This snapshot is older than the T4 30-second target. Refresh before making activation or credential decisions.`
                  : "目前畫面超過 T4 的 30 秒更新目標。請先重新整理，再做啟用或 credential 決策。"
              }
            />
          ) : null}

          <Card
            theme={theme}
            title={
              locale === "en"
                ? "Partner entry sitemap"
                : "Partner entry sitemap"
            }
            subtitle={
              locale === "en"
                ? "Canvas-aligned route map for overview, branding, auth, eligibility, credential governance, readiness, and audit."
                : "依 canvas 對齊 partner detail 路徑地圖：overview、branding、auth、eligibility、credential governance、readiness 與 audit。"
            }
            actions={
              <div style={shellBadgeRowStyle}>
                <Pill theme={theme} tone={statusTone} dot>
                  {formatPlatformCodeLabel(locale, entry.status)}
                </Pill>
                <Pill theme={theme} tone={freshnessTone}>
                  {refreshTier}
                </Pill>
                <Pill theme={theme} tone="accent">
                  {locale === "en"
                    ? `${availableActions.length} action(s)`
                    : `${availableActions.length} 個動作`}
                </Pill>
              </div>
            }
          >
            <div style={sectionTabRowStyle}>
              {detailSections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  style={sectionTabButtonStyle(activeSection === section.id)}
                  onClick={() => jumpToSection(section.id)}
                >
                  {section.label}
                  {section.badge ? ` · ${section.badge}` : ""}
                </button>
              ))}
            </div>
          </Card>

          <div style={kpiGridStyle}>
            <KPI
              theme={theme}
              label={locale === "en" ? "Lifecycle" : "Lifecycle"}
              value={formatPlatformCodeLabel(locale, entry.status)}
              sub={entry.activeFlag ? "active flag on" : "active flag off"}
              hint={formatDateTime(entry.updatedAt)}
            />
            <KPI
              theme={theme}
              label={locale === "en" ? "Readiness" : "Readiness"}
              value={`${readinessReadyCount}/${readinessItems.length}`}
              sub={
                readinessComplete
                  ? locale === "en"
                    ? "Promotion clear"
                    : "可推進上線"
                  : locale === "en"
                    ? `${readinessMissingCount} gap(s)`
                    : `${readinessMissingCount} 項缺口`
              }
              hint={
                locale === "en"
                  ? "View readiness gaps below"
                  : "請見下方 readiness gaps"
              }
            />
            <KPI
              theme={theme}
              label={locale === "en" ? "Credentials" : "Credentials"}
              value={activeCredentialCount}
              sub={
                credentials[0]?.lastUsedAt
                  ? `${locale === "en" ? "Last used" : "最後使用"} ${formatDateTime(
                      credentials[0].lastUsedAt,
                    )}`
                  : locale === "en"
                    ? "No last-used telemetry yet"
                    : "目前尚無 last-used telemetry"
              }
              hint={`${credentials.length} ${locale === "en" ? "issued total" : "筆已核發"}`}
            />
            <KPI
              theme={theme}
              label={locale === "en" ? "Refresh tier" : "Refresh tier"}
              value="T4"
              sub={locale === "en" ? "30s cadence" : "30 秒 cadence"}
              hint={
                lastLoadedAt
                  ? `${locale === "en" ? "Last refresh" : "最近更新"} ${formatDateTime(
                      lastLoadedAt,
                    )}`
                  : "—"
              }
            />
          </div>

          <div style={heroGridStyle(isCompactViewport)} id="overview">
            <div style={sectionStackStyle}>
              <Card
                theme={theme}
                title={locale === "en" ? "Entry overview" : "Entry overview"}
                subtitle={
                  locale === "en"
                    ? "Core identity, routing, readiness inputs, and support metadata stay visible before any credential or activation decision."
                    : "在任何 credential 或啟用決策前，先固定呈現核心識別、routing、readiness 來源與 support metadata。"
                }
                actions={
                  <div style={shellBadgeRowStyle}>
                    <Pill theme={theme} tone={statusTone} dot>
                      {formatPlatformCodeLabel(locale, entry.status)}
                    </Pill>
                    <Pill theme={theme} tone="info">
                      {formatPlatformCodeLabel(locale, entry.authMode)}
                    </Pill>
                    <Pill theme={theme} tone="accent">
                      {formatPlatformCodeLabel(locale, entry.eligibilityMode)}
                    </Pill>
                  </div>
                }
              >
                <DL
                  theme={theme}
                  items={overviewItems}
                  cols={isCompactViewport ? 1 : 2}
                />
              </Card>
            </div>

            <div style={sectionStackStyle}>
              <Card
                theme={theme}
                title={
                  locale === "en" ? "Promotion posture" : "Promotion posture"
                }
                subtitle={
                  locale === "en"
                    ? "Keep lifecycle authority, readiness posture, and activation controls in one decision lane before partner-facing traffic is opened."
                    : "在打開 partner-facing traffic 前，把 lifecycle authority、readiness posture 與啟用控制留在同一個決策視角。"
                }
                actions={
                  <div style={shellBadgeRowStyle}>
                    <Pill theme={theme} tone={freshnessTone}>
                      {refreshTier}
                    </Pill>
                    <span style={mutedTextStyle}>
                      {lastLoadedAt
                        ? `${locale === "en" ? "loaded" : "載入於"} ${formatDateTime(lastLoadedAt)}`
                        : "—"}
                    </span>
                  </div>
                }
              >
                <div style={sectionStackStyle}>
                  <div style={shellBadgeRowStyle}>
                    <Pill theme={theme} tone={statusTone} dot>
                      {formatPlatformCodeLabel(locale, entry.status)}
                    </Pill>
                    <Pill theme={theme} tone="info">
                      {formatPlatformCodeLabel(locale, entry.authMode)}
                    </Pill>
                    <Pill theme={theme} tone="accent">
                      {formatPlatformCodeLabel(locale, entry.eligibilityMode)}
                    </Pill>
                  </div>
                  <Banner
                    theme={theme}
                    tone={
                      readinessComplete
                        ? "success"
                        : entry.status === "active"
                          ? "danger"
                          : "warn"
                    }
                    title={
                      readinessComplete
                        ? locale === "en"
                          ? "Ready to promote"
                          : "可推進上線"
                        : locale === "en"
                          ? "Readiness gaps remain"
                          : "仍有 readiness 缺口"
                    }
                    body={
                      readinessComplete
                        ? locale === "en"
                          ? "Checklist is clear. This entry can be promoted without hiding platform governance boundaries."
                          : "Checklist 已補齊，可在不模糊平台治理邊界的前提下推進流量啟用。"
                        : locale === "en"
                          ? "Do not activate external traffic until the remaining routing, support, and credential gaps are resolved."
                          : "在 routing、support 與 credential 缺口補齊前，不應直接啟用外部流量。"
                    }
                  />
                  <div style={buttonRowStyle}>
                    {activateAction ? (
                      <Btn
                        theme={theme}
                        variant="primary"
                        disabled={
                          !activateAction.enabled ||
                          changingStatus === "activate"
                        }
                        onClick={() =>
                          setPendingAction({
                            intent: "activate",
                            descriptor: activateAction,
                          })
                        }
                      >
                        {locale === "en" ? "Activate" : "啟用"}
                      </Btn>
                    ) : null}
                    {deactivateAction ? (
                      <Btn
                        theme={theme}
                        variant="secondary"
                        disabled={
                          !deactivateAction.enabled ||
                          changingStatus === "deactivate"
                        }
                        onClick={() =>
                          setPendingAction({
                            intent: "deactivate",
                            descriptor: deactivateAction,
                          })
                        }
                      >
                        {locale === "en" ? "Deactivate" : "停用"}
                      </Btn>
                    ) : null}
                  </div>
                  {activateAction && !activateAction.enabled ? (
                    <div style={mutedTextStyle}>
                      {disabledReasonLabel(
                        activateAction.disabledReasonCode,
                        locale,
                      )}
                    </div>
                  ) : null}
                  {deactivateAction && !deactivateAction.enabled ? (
                    <div style={mutedTextStyle}>
                      {disabledReasonLabel(
                        deactivateAction.disabledReasonCode,
                        locale,
                      )}
                    </div>
                  ) : null}
                  <DL
                    theme={theme}
                    cols={isCompactViewport ? 1 : 2}
                    items={promotionSnapshotItems}
                  />
                </div>
              </Card>

              <Card
                theme={theme}
                title={locale === "en" ? "Credential lane" : "Credential lane"}
                subtitle={
                  locale === "en"
                    ? "Keep the plaintext-once rule visible while preserving a masked-only summary for ongoing governance."
                    : "在維持 plaintext-once 規則的同時，也保留後續治理需要的 masked-only 摘要。"
                }
              >
                {activeCredentialCount > 0 ? (
                  <div style={sectionStackStyle}>
                    <Banner
                      theme={theme}
                      tone="info"
                      title={
                        locale === "en"
                          ? "Plaintext material is shown once"
                          : "Plaintext material 僅顯示一次"
                      }
                      body={
                        locale === "en"
                          ? "Issue and rotate actions can open the Q-ADM07 modal. After dismissal, only masked metadata remains on this route."
                          : "核發與輪替動作會開啟 Q-ADM07 modal；關閉後，此路由只保留 masked metadata。"
                      }
                    />
                    <DL theme={theme} items={credentialSummaryItems} cols={1} />
                  </div>
                ) : credentialEmptyReason ? (
                  <WorkflowEmptyState
                    title={emptyStateCopy(credentialEmptyReason, locale).title}
                    description={
                      emptyStateCopy(credentialEmptyReason, locale).body
                    }
                    tone={emptyStateTone(credentialEmptyReason)}
                  />
                ) : null}
              </Card>

              <Card
                theme={theme}
                title={locale === "en" ? "Companion links" : "Companion links"}
                subtitle={
                  locale === "en"
                    ? "Webhook linkage, adapter linkage, and cross-app context stay in-frame so high-risk actions are not taken blind."
                    : "把 webhook linkage、adapter linkage 與 cross-app context 固定在同一視角，避免高風險動作在資訊不足時發生。"
                }
              >
                <div style={sectionStackStyle}>
                  <DL theme={theme} items={linkageItems} cols={1} />
                  <div style={statusSummaryGridStyle}>
                    {deepLinks.map((link) => (
                      <Card
                        key={link.key}
                        theme={theme}
                        title={link.label}
                        subtitle={link.helper}
                        actions={
                          <a
                            href={link.href}
                            target={link.openInNewTab ? "_blank" : undefined}
                            rel={link.openInNewTab ? "noreferrer" : undefined}
                            style={{ textDecoration: "none" }}
                          >
                            <Btn theme={theme} variant="secondary" size="xs">
                              {link.openInNewTab
                                ? locale === "en"
                                  ? "Open"
                                  : "開啟"
                                : locale === "en"
                                  ? "View"
                                  : "查看"}
                            </Btn>
                          </a>
                        }
                      >
                        <div style={mutedTextStyle}>
                          {link.openInNewTab
                            ? locale === "en"
                              ? "Opens in a new tab for cross-app operational context."
                              : "會以新分頁開啟 cross-app operational context。"
                            : locale === "en"
                              ? "Companion route inside Platform Admin."
                              : "Platform Admin 內的 companion route。"}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          </div>

          <form onSubmit={handleSave} style={splitGridStyle(isCompactViewport)}>
            <div style={sectionStackStyle}>
              <div id="branding" style={sectionAnchorStyle}>
                <Card
                  theme={theme}
                  title={locale === "en" ? "Branding" : "Branding"}
                  subtitle={
                    locale === "en"
                      ? "Display name, theme accent, support contact, and route preview stay editable from the same governance surface."
                      : "將 display name、theme accent、support contact 與 route preview 集中在同一治理畫面編輯。"
                  }
                >
                  <div style={sectionStackStyle}>
                    <div style={fieldGridStyle(isCompactViewport)}>
                      <TextField
                        label={locale === "en" ? "Display name" : "顯示名稱"}
                        value={editForm.displayName}
                        onChange={(value) =>
                          updateFormField("displayName", value)
                        }
                        disabled={!editAction?.enabled}
                      />
                      <TextField
                        label={
                          locale === "en" ? "Theme accent" : "Theme accent"
                        }
                        value={editForm.themeAccent}
                        onChange={(value) =>
                          updateFormField("themeAccent", value)
                        }
                        mono
                        disabled={!editAction?.enabled}
                      />
                      <TextField
                        label={locale === "en" ? "Entry host" : "Entry host"}
                        value={editForm.entryHost}
                        onChange={(value) =>
                          updateFormField("entryHost", value)
                        }
                        mono
                        disabled={!editAction?.enabled}
                      />
                      <TextField
                        label={locale === "en" ? "Entry path" : "Entry path"}
                        value={editForm.entryPath}
                        onChange={(value) =>
                          updateFormField("entryPath", value)
                        }
                        mono
                        disabled={!editAction?.enabled}
                      />
                      <TextField
                        label={
                          locale === "en" ? "Support email" : "Support email"
                        }
                        value={editForm.supportEmail}
                        onChange={(value) =>
                          updateFormField("supportEmail", value)
                        }
                        mono
                        disabled={!editAction?.enabled}
                      />
                      <TextField
                        label={
                          locale === "en" ? "Support phone" : "Support phone"
                        }
                        value={editForm.supportPhone}
                        onChange={(value) =>
                          updateFormField("supportPhone", value)
                        }
                        mono
                        disabled={!editAction?.enabled}
                      />
                    </div>
                    <DL
                      theme={theme}
                      cols={isCompactViewport ? 1 : 2}
                      items={[
                        {
                          k: locale === "en" ? "Preview URL" : "Preview URL",
                          v: previewUrl ?? "—",
                          mono: true,
                        },
                        {
                          k:
                            locale === "en"
                              ? "Readiness impact"
                              : "Readiness impact",
                          v: readinessComplete
                            ? locale === "en"
                              ? "Branding lane is launch-ready"
                              : "Branding 已可上線"
                            : locale === "en"
                              ? "Branding gaps still affect readiness"
                              : "Branding 缺口仍影響 readiness",
                        },
                      ]}
                    />
                  </div>
                </Card>
              </div>

              <div id="auth" style={sectionAnchorStyle}>
                <Card
                  theme={theme}
                  title={locale === "en" ? "Auth authority" : "Auth authority"}
                  subtitle={
                    locale === "en"
                      ? "Auth mode, partner identity, and ingress gating remain explicit platform-owned controls."
                      : "auth mode、partner identity 與 ingress gate 皆維持明確的 platform-owned controls。"
                  }
                >
                  <div style={sectionStackStyle}>
                    <Banner
                      theme={theme}
                      tone={
                        entry.authMode === "partner_api_key"
                          ? activeCredentialCount > 0
                            ? "success"
                            : "warn"
                          : "info"
                      }
                      title={
                        locale === "en" ? "Credential posture" : "憑證姿態"
                      }
                      body={
                        entry.authMode === "partner_api_key"
                          ? activeCredentialCount > 0
                            ? locale === "en"
                              ? `${activeCredentialCount} active credential(s) can gate ingress traffic.`
                              : `${activeCredentialCount} 筆有效憑證可作為 ingress traffic gate。`
                            : locale === "en"
                              ? "Partner API key mode is active, but no usable ingress credential is available."
                              : "partner API key 模式已啟用，但目前沒有可用的 ingress credential。"
                          : locale === "en"
                            ? "This entry does not require partner-managed ingress credentials."
                            : "此 entry 不需要 partner-managed ingress credential。"
                      }
                    />
                    <div style={fieldGridStyle(isCompactViewport)}>
                      <TextField
                        label={t("partners.form.tenantId")}
                        value={editForm.tenantId}
                        onChange={(value) => updateFormField("tenantId", value)}
                        mono
                        disabled={!editAction?.enabled}
                      />
                      <TextField
                        label={t("partners.form.partnerType")}
                        value={editForm.partnerType}
                        onChange={(value) =>
                          updateFormField("partnerType", value)
                        }
                        mono
                        disabled={!editAction?.enabled}
                      />
                      <TextField
                        label={t("partners.form.partnerCode")}
                        value={editForm.partnerCode}
                        onChange={(value) =>
                          updateFormField("partnerCode", value)
                        }
                        mono
                        disabled={!editAction?.enabled}
                      />
                      <TextField
                        label={t("partners.form.programId")}
                        value={editForm.programId}
                        onChange={(value) =>
                          updateFormField("programId", value)
                        }
                        mono
                        disabled={!editAction?.enabled}
                      />
                      <TextField
                        label={t("partners.form.programCode")}
                        value={editForm.programCode}
                        onChange={(value) =>
                          updateFormField("programCode", value)
                        }
                        mono
                        disabled={!editAction?.enabled}
                      />
                      <TextField
                        label={t("partners.form.bankCode")}
                        value={editForm.bankCode}
                        onChange={(value) => updateFormField("bankCode", value)}
                        mono
                        disabled={!editAction?.enabled}
                      />
                      <TextField
                        label={t("partners.form.entrySlug")}
                        value={editForm.entrySlug}
                        onChange={(value) =>
                          updateFormField("entrySlug", value)
                        }
                        mono
                        disabled
                      />
                      <SelectField
                        label={t("partners.form.dispatchSubtype")}
                        value={editForm.businessDispatchSubtype}
                        options={BUSINESS_DISPATCH_SUBTYPES}
                        onChange={(value) =>
                          updateFormField(
                            "businessDispatchSubtype",
                            value as BusinessDispatchSubtype,
                          )
                        }
                        formatOption={(value) =>
                          formatPlatformCodeLabel(locale, value)
                        }
                        disabled={!editAction?.enabled}
                      />
                      <SelectField
                        label={t("partners.form.authMode")}
                        value={editForm.authMode}
                        options={PARTNER_ENTRY_AUTH_MODES}
                        onChange={(value) =>
                          updateFormField(
                            "authMode",
                            value as PartnerEntryAuthMode,
                          )
                        }
                        formatOption={(value) =>
                          formatPlatformCodeLabel(locale, value)
                        }
                        disabled={!editAction?.enabled}
                      />
                    </div>
                  </div>
                </Card>
              </div>

              <div id="eligibility" style={sectionAnchorStyle}>
                <Card
                  theme={theme}
                  title={
                    locale === "en"
                      ? "Eligibility contract"
                      : "Eligibility contract"
                  }
                  subtitle={
                    locale === "en"
                      ? "Contract snapshot, fallback policy, and adapter posture define the platform-owned eligibility gate."
                      : "contract snapshot、fallback policy 與 adapter posture 共同定義此平台治理的 eligibility gate。"
                  }
                >
                  <div style={sectionStackStyle}>
                    <Banner
                      theme={theme}
                      tone={
                        entry.eligibilityMode === "none"
                          ? "info"
                          : entry.eligibilityContract?.contractId
                            ? "accent"
                            : "warn"
                      }
                      title={locale === "en" ? "Contract posture" : "契約姿態"}
                      body={
                        entry.eligibilityMode === "none"
                          ? locale === "en"
                            ? "No partner-side eligibility verification is required before fulfillment."
                            : "此流程在 fulfill 前不要求 partner-side eligibility verification。"
                          : entry.eligibilityContract?.contractId
                            ? locale === "en"
                              ? "Eligibility remains platform-governed and is backed by the linked contract snapshot."
                              : "Eligibility 仍由平台治理，且已有對應 contract snapshot。"
                            : locale === "en"
                              ? "No eligibility contract snapshot is linked to this entry yet."
                              : "此 entry 尚未綁定 eligibility contract snapshot。"
                      }
                    />
                    <SelectField
                      label={t("partners.form.eligibilityMode")}
                      value={editForm.eligibilityMode}
                      options={PARTNER_ELIGIBILITY_MODES}
                      onChange={(value) =>
                        updateFormField(
                          "eligibilityMode",
                          value as PartnerEligibilityMode,
                        )
                      }
                      formatOption={(value) =>
                        formatPlatformCodeLabel(locale, value)
                      }
                      disabled={!editAction?.enabled}
                    />
                    <DL
                      theme={theme}
                      items={eligibilitySnapshotItems}
                      cols={isCompactViewport ? 1 : 2}
                    />
                    {entry.eligibilityContract?.notes?.[0] ? (
                      <div style={mutedTextStyle}>
                        {entry.eligibilityContract.notes[0]}
                      </div>
                    ) : null}
                  </div>
                </Card>
              </div>

              <div style={saveBarStyle}>
                <div style={actionNoteStyle}>
                  {editAction
                    ? editAction.enabled
                      ? actionHelpText(editAction, locale)
                      : disabledReasonLabel(
                          editAction.disabledReasonCode,
                          locale,
                        )
                    : locale === "en"
                      ? "No edit action is currently available for this resource."
                      : "目前此 resource 沒有可用的 edit action。"}
                  <br />
                  {locale === "en" ? "Last updated" : "最近更新"}:{" "}
                  {formatDateTime(entry.updatedAt)}
                </div>
                <Btn
                  theme={theme}
                  variant="primary"
                  disabled={
                    saving ||
                    !editAction?.enabled ||
                    !editForm.displayName.trim()
                  }
                  onClick={() => void saveEntry()}
                >
                  {saving
                    ? locale === "en"
                      ? "Saving..."
                      : "儲存中..."
                    : locale === "en"
                      ? "Save changes"
                      : "儲存變更"}
                </Btn>
                <button type="submit" style={{ display: "none" }} />
              </div>
            </div>

            <div style={sectionStackStyle}>
              <div id="credentials" style={sectionAnchorStyle}>
                <Card
                  theme={theme}
                  title={locale === "en" ? "Credentials" : "Credentials"}
                  subtitle={
                    locale === "en"
                      ? "Ingress material is shown once at issue time, then stays masked and platform-governed."
                      : "Ingress material 只會在 issue 當下明文顯示一次，之後持續 masked 且由平台治理。"
                  }
                  actions={
                    <div style={buttonRowStyle}>
                      {issueAction ? (
                        <Btn
                          theme={theme}
                          variant="secondary"
                          disabled={
                            !issueAction.enabled ||
                            changingStatus === "issue_credential"
                          }
                          onClick={() =>
                            setPendingAction({
                              intent: "issue_credential",
                              descriptor: issueAction,
                            })
                          }
                        >
                          {locale === "en"
                            ? "Issue credential"
                            : "核發 credential"}
                        </Btn>
                      ) : null}
                      {rotateAction ? (
                        <Btn
                          theme={theme}
                          variant="secondary"
                          disabled={
                            !rotateAction.enabled ||
                            changingStatus === "rotate_credential"
                          }
                          onClick={() =>
                            setPendingAction({
                              intent: "rotate_credential",
                              descriptor: rotateAction,
                            })
                          }
                        >
                          {locale === "en"
                            ? "Rotate credential"
                            : "輪替 credential"}
                        </Btn>
                      ) : null}
                    </div>
                  }
                >
                  <div style={sectionStackStyle}>
                    <div style={mutedTextStyle}>
                      {issueAction && !issueAction.enabled
                        ? disabledReasonLabel(
                            issueAction.disabledReasonCode,
                            locale,
                          )
                        : rotateAction && !rotateAction.enabled
                          ? disabledReasonLabel(
                              rotateAction.disabledReasonCode,
                              locale,
                            )
                          : locale === "en"
                            ? "Issue, rotate, and revoke controls are driven by availableActions and remain audit-logged."
                            : "核發、輪替與撤銷控制皆由 availableActions 驅動，且會寫入 audit。"}
                    </div>
                    <div style={filterRowStyle}>
                      {(["active", "revoked", "all"] as const).map(
                        (filterValue) => (
                          <Btn
                            key={filterValue}
                            theme={theme}
                            variant={
                              credentialFilter === filterValue
                                ? "primary"
                                : "secondary"
                            }
                            size="xs"
                            onClick={() => setCredentialFilter(filterValue)}
                          >
                            {filterValue === "active"
                              ? locale === "en"
                                ? "Active"
                                : "有效"
                              : filterValue === "revoked"
                                ? locale === "en"
                                  ? "Revoked"
                                  : "已撤銷"
                                : locale === "en"
                                  ? "All"
                                  : "全部"}
                          </Btn>
                        ),
                      )}
                      <span style={mutedTextStyle}>
                        {locale === "en"
                          ? `${credentialRows.length} visible / ${credentials.length} total`
                          : `顯示 ${credentialRows.length} / 共 ${credentials.length} 筆`}
                      </span>
                    </div>
                    {credentialRows.length > 0 ? (
                      <Table<CredentialRow>
                        theme={theme}
                        dense
                        columns={credentialColumns}
                        rows={credentialRows}
                      />
                    ) : credentialEmptyReason ? (
                      <div style={sectionStackStyle}>
                        <div style={shellBadgeRowStyle}>
                          <Pill
                            theme={theme}
                            tone={
                              credentialEmptyReason === "fetch_failed"
                                ? "danger"
                                : credentialEmptyReason ===
                                      "external_unavailable" ||
                                    credentialEmptyReason === "filtered_empty"
                                  ? "warn"
                                  : "accent"
                            }
                          >
                            {emptyStateAccentLabel(
                              credentialEmptyReason,
                              locale,
                            )}
                          </Pill>
                        </div>
                        <WorkflowEmptyState
                          title={
                            emptyStateCopy(credentialEmptyReason, locale).title
                          }
                          description={
                            emptyStateCopy(credentialEmptyReason, locale).body
                          }
                          tone={emptyStateTone(credentialEmptyReason)}
                          actions={
                            credentialEmptyReason === "fetch_failed" ? (
                              <Btn
                                theme={theme}
                                variant="secondary"
                                onClick={() =>
                                  void loadEntry({
                                    preserveIssuedCredential: true,
                                  })
                                }
                              >
                                {locale === "en" ? "Retry load" : "重新載入"}
                              </Btn>
                            ) : credentialEmptyReason === "filtered_empty" ? (
                              <Btn
                                theme={theme}
                                variant="secondary"
                                onClick={() => setCredentialFilter("all")}
                              >
                                {locale === "en"
                                  ? "Show all credentials"
                                  : "顯示全部 credential"}
                              </Btn>
                            ) : credentialEmptyReason ===
                              "external_unavailable" ? (
                              <a
                                href={`/adapter-registry?entrySlug=${encodeURIComponent(
                                  entry.entrySlug,
                                )}`}
                                style={{ textDecoration: "none" }}
                              >
                                <Btn theme={theme} variant="secondary">
                                  {locale === "en"
                                    ? "Inspect adapter linkage"
                                    : "檢查 adapter linkage"}
                                </Btn>
                              </a>
                            ) : issueAction?.enabled ? (
                              <Btn
                                theme={theme}
                                variant="secondary"
                                onClick={() =>
                                  setPendingAction({
                                    intent: "issue_credential",
                                    descriptor: issueAction,
                                  })
                                }
                              >
                                {locale === "en"
                                  ? "Issue credential"
                                  : "核發 credential"}
                              </Btn>
                            ) : undefined
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                </Card>
              </div>

              <div id="readiness" style={sectionAnchorStyle}>
                <Card
                  theme={theme}
                  title={locale === "en" ? "Readiness gaps" : "Readiness gaps"}
                  subtitle={
                    locale === "en"
                      ? "Six-section review lane for launch posture, credentials, and support coverage."
                      : "以六段檢查視角核對 launch posture、憑證與 support coverage。"
                  }
                >
                  <div style={sectionStackStyle}>
                    {readinessItems.map((item) => (
                      <div
                        key={`${item.label}-${item.value}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          alignItems: "flex-start",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: `1px solid ${theme.border}`,
                          background: theme.bgRaised,
                        }}
                      >
                        <div style={{ display: "grid", gap: 4 }}>
                          <strong style={{ fontSize: 13, color: theme.text }}>
                            {item.label}
                          </strong>
                          <span style={mutedTextStyle}>{item.value}</span>
                        </div>
                        <Pill
                          theme={theme}
                          tone={item.ready ? "success" : "warn"}
                        >
                          {item.ready
                            ? locale === "en"
                              ? "Ready"
                              : "已就緒"
                            : locale === "en"
                              ? "Missing"
                              : "缺漏"}
                        </Pill>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              <div id="audit" style={sectionAnchorStyle}>
                <Card
                  theme={theme}
                  title={locale === "en" ? "Audit lineage" : "Audit lineage"}
                  subtitle={
                    locale === "en"
                      ? "Creation, update, revoke, and credential actions remain visible for platform review."
                      : "建立、更新、撤銷與 credential 動作都需保留給平台審查。"
                  }
                  actions={
                    <Pill theme={theme} tone={statusTone}>
                      {formatPlatformCodeLabel(locale, entry.status)}
                    </Pill>
                  }
                >
                  <div style={sectionStackStyle}>
                    {entry.revokedAt ? (
                      <Banner
                        theme={theme}
                        tone="danger"
                        title={
                          locale === "en" ? "Entry revoked" : "Entry 已撤銷"
                        }
                        body={
                          entry.revokeReason ??
                          (locale === "en"
                            ? "Traffic should remain blocked for this entry."
                            : "此 entry 應持續維持流量封鎖。")
                        }
                      />
                    ) : null}
                    <DL
                      theme={theme}
                      items={auditItems}
                      cols={isCompactViewport ? 1 : 2}
                    />
                  </div>
                </Card>
              </div>
            </div>
          </form>
        </div>
      </CanvasShell>

      {pendingAction ? (
        <ActionModal
          pendingAction={pendingAction}
          locale={locale}
          working={
            changingStatus === pendingAction.intent ||
            (pendingAction.intent === "revoke_credential" &&
              revokingCredentialId === pendingAction.keyId)
          }
          onClose={() => setPendingAction(null)}
          onSubmit={executePendingAction}
        />
      ) : null}

      {issuedCredential ? (
        <PlaintextCredentialModal
          issuedCredential={issuedCredential}
          locale={locale}
          onClose={() => setIssuedCredential(null)}
        />
      ) : null}
    </>
  );
}
