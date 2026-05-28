"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  EmptyReason,
  RefreshTier,
  ResourceActionDescriptor,
  TenantApiKeyRecord,
  TenantIntegrationGovernancePackage,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import {
  issueTenantApiKeyAction,
  revokeTenantApiKeyAction,
  rotateTenantApiKeyAction,
} from "./actions";
import type { ApiKeyFlashPayload } from "./constants";

type ApiKeyManagerProps = {
  apiKeys: TenantApiKeyRecord[];
  governance: TenantIntegrationGovernancePackage | null;
  errors: string[];
  refreshTier: RefreshTier;
  snapshotAt: string;
  emptyReasonOverride?: EmptyReason | null;
};

type ApiKeyState = "active" | "expiring" | "expired" | "revoked";
type StatusFilter = "all" | ApiKeyState;
type SupportedEmptyReason =
  | "no_data"
  | "not_provisioned"
  | "fetch_failed"
  | "permission_denied"
  | "external_unavailable"
  | "filtered_empty";
type ApiKeyResource = TenantApiKeyRecord & {
  availableActions?: ResourceActionDescriptor[];
};
type GovernanceResource = TenantIntegrationGovernancePackage & {
  availableActions?: ResourceActionDescriptor[];
};
type ApiKeyRow = ApiKeyResource & Record<string, unknown>;

type SecretRevealState = {
  title: string;
  description: string;
  plaintextKey: string;
  keyName: string;
  scopes: string[];
  expiresAt: string | null;
};

type ActionComposerState = {
  mode: "issue" | "rotate";
  title: string;
  subtitle: string;
  submitLabel: string;
  action: ResourceActionDescriptor;
  apiKeyId?: string;
  initialReason?: string;
  keyName: string;
  expiresAt: string;
  scopes: string[];
  reason: string;
};

type RevokeIntent = {
  apiKey: ApiKeyResource;
  action: ResourceActionDescriptor;
  reason: string;
};

type EmptyStateConfig = {
  tone: CanvasTone;
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref?: string;
  action?: ResourceActionDescriptor;
};

const th = buildCanvasTheme({
  surface: "tenant",
  dark: false,
  density: "compact",
});

const REFRESH_LABELS: Record<RefreshTier, string> = {
  urgent: "T1 urgent · push",
  fast: "T2 fast · 3s",
  dispatch: "T3 dispatch · 5s",
  medium: "T4 medium · 15s",
  medium_slow: "T4.5 medium-slow · 30s",
  slow: "T5 tenant slow · 30s",
  manual: "T6 manual",
};
const REFRESH_INTERVALS_MS: Partial<Record<RefreshTier, number>> = {
  fast: 3_000,
  dispatch: 5_000,
  medium: 15_000,
  medium_slow: 30_000,
  slow: 30_000,
};

const dateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "short",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const topGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.25fr) minmax(280px, 0.85fr)",
  gap: 16,
};

const metaRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginBottom: 12,
};

const copyStyle: CSSProperties = {
  margin: 0,
  fontSize: 12.5,
  lineHeight: 1.6,
  color: th.textMuted,
};

const statGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
};

const statTileStyle: CSSProperties = {
  borderRadius: 12,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const statLabelStyle: CSSProperties = {
  fontSize: 11,
  color: th.textDim,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const statValueStyle: CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  color: th.text,
};

const statSubtleStyle: CSSProperties = {
  fontSize: 11.5,
  color: th.textMuted,
};

const utilityStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const linkCardStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  borderRadius: 10,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
  color: th.text,
  padding: "10px 12px",
  textDecoration: "none",
};

const linkMetaStyle: CSSProperties = {
  display: "block",
  marginTop: 2,
  fontSize: 11.5,
  color: th.textMuted,
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 1fr) 180px auto auto",
  gap: 12,
  alignItems: "end",
};

const fieldGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const scopeGridStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const scopeChipInputStyle: CSSProperties = {
  display: "none",
};

const helperTextStyle: CSSProperties = {
  fontSize: 11,
  lineHeight: 1.5,
  color: th.textDim,
};

const nativeInputStyle: CSSProperties = {
  width: "100%",
  background: th.bgRaised,
  border: `1px solid ${th.border}`,
  borderRadius: 8,
  padding: "8px 10px",
  boxSizing: "border-box",
  fontSize: 12.5,
  color: th.text,
  outline: "none",
  fontFamily: th.fontFamily,
};

const nativeMonoInputStyle: CSSProperties = {
  ...nativeInputStyle,
  fontSize: 11.5,
  fontFamily: th.monoFamily,
};

const textareaStyle: CSSProperties = {
  ...nativeInputStyle,
  minHeight: 96,
  resize: "vertical",
};

const monoStyle: CSSProperties = {
  fontFamily: th.monoFamily,
  fontSize: 11,
};

const nameCellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const nameMainStyle: CSSProperties = {
  fontWeight: 600,
  color: th.text,
};

const nameMetaStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  fontSize: 11,
  color: th.textDim,
  fontFamily: th.monoFamily,
};

const inlineActionStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const emptyStateStyle: CSSProperties = {
  padding: 24,
};

const emptyPanelStyle: CSSProperties = {
  borderRadius: 14,
  border: `1px dashed ${th.border}`,
  background: th.surfaceLo,
  padding: 18,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const emptyTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 700,
  color: th.text,
};

const emptyBodyStyle: CSSProperties = {
  margin: 0,
  color: th.textMuted,
  fontSize: 12.5,
  lineHeight: 1.55,
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  padding: 24,
  background: "rgba(5, 9, 15, 0.72)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 60,
};

const modalStyle: CSSProperties = {
  width: "min(720px, 100%)",
  maxHeight: "calc(100vh - 48px)",
  overflow: "auto",
  background: th.surface,
  border: `1px solid ${th.border}`,
  borderRadius: 16,
  boxShadow: "0 32px 80px rgba(0, 0, 0, 0.35)",
  padding: 18,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const modalHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};

const modalTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
  color: th.text,
};

const modalBodyTextStyle: CSSProperties = {
  margin: "6px 0 0",
  fontSize: 12.5,
  lineHeight: 1.6,
  color: th.textMuted,
};

const modalFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  height: 30,
  padding: "5px 12px",
  borderRadius: 8,
  border: `1px solid ${th.accent}`,
  background: th.accent,
  color: "#fff",
  fontWeight: 600,
  fontFamily: th.fontFamily,
  fontSize: 12,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: th.surface,
  color: th.text,
  borderColor: th.border,
};

const plaintextKeyStyle: CSSProperties = {
  display: "block",
  padding: "12px 14px",
  borderRadius: 10,
  border: `1px solid ${th.border}`,
  background: "rgba(6, 11, 19, 0.72)",
  color: th.text,
  fontFamily: th.monoFamily,
  fontSize: 12,
  overflowX: "auto",
};

const checkboxRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  color: th.text,
};

const externalLinks = [
  {
    href: "https://admin.drts.io/tenants/yamato/integration-governance",
    label: "Platform Admin",
    description: "governance package 與 break-glass 審批",
  },
  {
    href: "https://ops.drts.io/audit?tenantId=yamato&module=tenant_api_key",
    label: "Ops Console",
    description: "跨 actor 稽核追溯",
  },
] as const;

const inAppLinks = [
  {
    href: "/integration-governance",
    label: "整合就緒度",
    description: "aggregated readiness 與 onboarding checklist",
  },
  {
    href: "/webhooks",
    label: "Webhook",
    description: "receiver health 與 downstream delivery",
  },
  {
    href: "/notifications",
    label: "通知偏好",
    description: "event × channel matrix",
  },
  {
    href: "/sla",
    label: "SLA",
    description: "tenant thresholds 與 dependency policy",
  },
  {
    href: "/reports",
    label: "報表",
    description: "manual exports 與 downstream readiness evidence",
  },
] as const;

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateTimeFormatter.format(parsed);
}

function formatFreshnessLabel(snapshotAt: string) {
  const snapshotMillis = new Date(snapshotAt).getTime();
  if (Number.isNaN(snapshotMillis)) return "unknown";
  const ageSeconds = Math.max(
    0,
    Math.round((Date.now() - snapshotMillis) / 1000),
  );
  if (ageSeconds < 60) return `${ageSeconds}s ago`;
  return `${Math.round(ageSeconds / 60)}m ago`;
}

function isRevoked(apiKey: ApiKeyResource) {
  return Boolean(apiKey.revokedAt);
}

function resolveApiKeyState(apiKey: ApiKeyResource): ApiKeyState {
  if (isRevoked(apiKey)) return "revoked";
  if (apiKey.expiresAt) {
    const expiry = new Date(apiKey.expiresAt).getTime();
    if (expiry <= Date.now()) return "expired";
    if (expiry - Date.now() <= 7 * 24 * 60 * 60 * 1000) return "expiring";
  }
  return "active";
}

function getApiKeyTone(state: ApiKeyState): CanvasTone {
  switch (state) {
    case "revoked":
      return "danger";
    case "expired":
      return "neutral";
    case "expiring":
      return "warn";
    default:
      return "success";
  }
}

function getApiKeyLabel(state: ApiKeyState) {
  switch (state) {
    case "revoked":
      return "revoked";
    case "expired":
      return "expired";
    case "expiring":
      return "expiring soon";
    default:
      return "active";
  }
}

function createActionDescriptor(
  action: string,
  enabled: boolean,
  riskLevel: ResourceActionDescriptor["riskLevel"],
  disabledReasonCode?: string,
): ResourceActionDescriptor {
  return {
    action,
    enabled,
    riskLevel,
    requiresReason: riskLevel === "high",
    ...(disabledReasonCode ? { disabledReasonCode } : {}),
  };
}

function getFallbackIssueAction(governance: GovernanceResource | null) {
  return createActionDescriptor(
    "issue",
    Boolean(governance?.apiKeyPolicy.allowedScopes.length),
    "high",
    governance ? "no_allowed_scopes" : "governance_unavailable",
  );
}

function getFallbackRotateAction(apiKey: ApiKeyResource) {
  return createActionDescriptor(
    "rotate",
    !isRevoked(apiKey),
    "high",
    isRevoked(apiKey) ? "already_revoked" : undefined,
  );
}

function getFallbackRevokeAction(apiKey: ApiKeyResource) {
  return createActionDescriptor(
    "revoke",
    !isRevoked(apiKey),
    "high",
    isRevoked(apiKey) ? "already_revoked" : undefined,
  );
}

function resolveAction(
  actions: ResourceActionDescriptor[] | undefined,
  actionName: string,
  fallback: ResourceActionDescriptor,
) {
  return actions?.find((action) => action.action === actionName) ?? fallback;
}

function buildCreateFormData(
  keyName: string,
  expiresAt: string,
  scopes: string[],
) {
  const formData = new FormData();
  formData.set("keyName", keyName);
  if (expiresAt.trim().length > 0) formData.set("expiresAt", expiresAt);
  scopes.forEach((scope) => formData.append("scopes", scope));
  return formData;
}

function buildRotateFormData(
  apiKeyId: string,
  keyName: string,
  expiresAt: string,
  scopes: string[],
) {
  const formData = new FormData();
  formData.set("apiKeyId", apiKeyId);
  formData.set("keyName", keyName);
  if (expiresAt.trim().length > 0) formData.set("expiresAt", expiresAt);
  scopes.forEach((scope) => formData.append("scopes", scope));
  return formData;
}

function buildRevokeFormData(apiKeyId: string, keyName: string) {
  const formData = new FormData();
  formData.set("apiKeyId", apiKeyId);
  formData.set("keyName", keyName);
  return formData;
}

function getScopeChipStyle(selected: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    border: `1px solid ${selected ? th.accent : th.border}`,
    background: selected ? th.accentBg : th.surface,
    color: selected ? th.text : th.textMuted,
    cursor: "pointer",
    fontSize: 11.5,
    fontFamily: th.monoFamily,
  };
}

function renderActionButton(
  descriptor: ResourceActionDescriptor,
  label: string,
  pending: boolean,
  onClick: () => void,
) {
  const disabled = pending || !descriptor.enabled;
  return (
    <span
      title={
        descriptor.enabled
          ? label
          : (descriptor.disabledReasonCode ?? "action_disabled")
      }
    >
      <CanvasBtn
        theme={th}
        size="xs"
        variant="ghost"
        disabled={disabled}
        {...(!disabled ? { onClick } : {})}
      >
        {label}
      </CanvasBtn>
    </span>
  );
}

function getEmptyStateCatalog(
  issueAction: ResourceActionDescriptor,
): Record<SupportedEmptyReason, EmptyStateConfig> {
  return {
    no_data: {
      tone: "info" as CanvasTone,
      title: "尚未建立任何 API 金鑰",
      body: "先建立 least-privilege key；建立成功後只會在 reveal modal 顯示一次 plaintext。",
      action: issueAction,
      ctaLabel: "建立第一把金鑰",
    },
    not_provisioned: {
      tone: "warn" as CanvasTone,
      title: "租戶整合治理尚未開通",
      body: "還沒有可用的 API key policy，無法確認 scope 與效期上限，不能安全發鑰。",
      ctaLabel: "前往 Platform Admin",
      ctaHref: externalLinks[0].href,
    },
    fetch_failed: {
      tone: "danger" as CanvasTone,
      title: "API 金鑰清單讀取失敗",
      body: "後端未回傳完整快照。請重新整理，或檢查治理與跨 actor 稽核狀態。",
      ctaLabel: "立即重整",
    },
    permission_denied: {
      tone: "neutral" as CanvasTone,
      title: "目前身分只有只讀權限",
      body: "你可以查看 masked credential 與 audit context，但 issue / rotate / revoke 不可用。",
      ctaLabel: "查看 Ops 稽核",
      ctaHref: externalLinks[1].href,
    },
    external_unavailable: {
      tone: "warn" as CanvasTone,
      title: "外部整合依賴暫時不可用",
      body: "治理 package 或 trust service 異常，無法安全確認 scope / expiry policy。",
      ctaLabel: "查看整合就緒度",
      ctaHref: "/integration-governance",
    },
    filtered_empty: {
      tone: "info" as CanvasTone,
      title: "目前篩選條件沒有結果",
      body: "調整搜尋字詞或狀態篩選，即可重新顯示 active / expired / revoked 金鑰。",
      ctaLabel: "清除篩選",
    },
  } satisfies Record<SupportedEmptyReason, EmptyStateConfig>;
}

function inferEmptyReasonFromErrors(
  errors: string[],
): "permission_denied" | "external_unavailable" | null {
  const normalized = errors.join(" ").toLowerCase();
  if (
    normalized.includes("permission_denied") ||
    normalized.includes("permission denied") ||
    normalized.includes("forbidden") ||
    normalized.includes("unauthorized") ||
    normalized.includes("403")
  ) {
    return "permission_denied";
  }

  if (
    normalized.includes("external_unavailable") ||
    normalized.includes("service unavailable") ||
    normalized.includes("dependency") ||
    normalized.includes("timeout") ||
    normalized.includes("upstream") ||
    normalized.includes("trust service")
  ) {
    return "external_unavailable";
  }

  return null;
}

function getFlashKeyName(
  flash: ApiKeyFlashPayload,
  fallbackName: string,
  apiKeys: ApiKeyResource[],
) {
  return (
    apiKeys.find((apiKey) => flash.description.includes(apiKey.keyName))
      ?.keyName ?? fallbackName
  );
}

export function ApiKeyManager({
  apiKeys,
  governance,
  errors,
  refreshTier,
  snapshotAt,
  emptyReasonOverride = null,
}: ApiKeyManagerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<ApiKeyFlashPayload | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(snapshotAt);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [composer, setComposer] = useState<ActionComposerState | null>(null);
  const [revokeIntent, setRevokeIntent] = useState<RevokeIntent | null>(null);
  const [secretReveal, setSecretReveal] = useState<SecretRevealState | null>(
    null,
  );
  const [secretAcknowledged, setSecretAcknowledged] = useState(false);

  const apiKeyResources = apiKeys as ApiKeyResource[];
  const governanceResource = governance as GovernanceResource | null;
  const allowedScopes = governanceResource?.apiKeyPolicy.allowedScopes ?? [];
  const compatibilityAliases = Object.entries(
    (governanceResource?.apiKeyPolicy.compatibilityAliases ?? {}) as Record<
      string,
      string
    >,
  );

  useEffect(() => {
    setLastRefreshedAt(snapshotAt);
  }, [snapshotAt]);

  useEffect(() => {
    const intervalMs = REFRESH_INTERVALS_MS[refreshTier];
    if (!intervalMs) return;
    const timer = window.setInterval(() => {
      startTransition(() => {
        router.refresh();
        setLastRefreshedAt(new Date().toISOString());
      });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [refreshTier, router]);

  const issueAction = resolveAction(
    governanceResource?.availableActions,
    "issue",
    getFallbackIssueAction(governanceResource),
  );

  const sortedKeys = useMemo(
    () =>
      [...apiKeyResources].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      ),
    [apiKeyResources],
  );

  const filteredKeys = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return sortedKeys.filter((apiKey) => {
      const state = resolveApiKeyState(apiKey);
      if (statusFilter !== "all" && state !== statusFilter) return false;
      if (!normalizedQuery) return true;
      return (
        apiKey.keyName.toLowerCase().includes(normalizedQuery) ||
        apiKey.apiKeyId.toLowerCase().includes(normalizedQuery) ||
        apiKey.keyPrefix.toLowerCase().includes(normalizedQuery) ||
        apiKey.scopes.some((scope) =>
          scope.toLowerCase().includes(normalizedQuery),
        )
      );
    });
  }, [query, sortedKeys, statusFilter]);

  const stateCounts = useMemo(
    () => ({
      active: sortedKeys.filter((item) => resolveApiKeyState(item) === "active")
        .length,
      expiring: sortedKeys.filter(
        (item) => resolveApiKeyState(item) === "expiring",
      ).length,
      revoked: sortedKeys.filter(
        (item) => resolveApiKeyState(item) === "revoked",
      ).length,
    }),
    [sortedKeys],
  );

  const emptyCatalog = getEmptyStateCatalog(issueAction);
  const effectiveEmptyReason = useMemo<SupportedEmptyReason | null>(() => {
    if (emptyReasonOverride) {
      return emptyReasonOverride as SupportedEmptyReason;
    }
    if (errors.length > 0 && sortedKeys.length === 0) {
      return inferEmptyReasonFromErrors(errors) ?? "fetch_failed";
    }
    if (!governanceResource && sortedKeys.length === 0)
      return "not_provisioned";
    if (sortedKeys.length === 0) return "no_data";
    if (filteredKeys.length === 0) return "filtered_empty";
    return null;
  }, [
    emptyReasonOverride,
    errors.length,
    filteredKeys.length,
    governanceResource,
    sortedKeys.length,
  ]);

  const emptyState = effectiveEmptyReason
    ? emptyCatalog[effectiveEmptyReason]
    : null;

  function resetFilters() {
    setQuery("");
    setStatusFilter("all");
  }

  function toggleComposerScope(scope: string) {
    setComposer((current) => {
      if (!current) return current;
      return {
        ...current,
        scopes: current.scopes.includes(scope)
          ? current.scopes.filter((value) => value !== scope)
          : [...current.scopes, scope],
      };
    });
  }

  function openIssueComposer() {
    setFlash(null);
    setComposer({
      mode: "issue",
      title: "建立金鑰",
      subtitle: "成功後會開啟 plaintext-once reveal modal。",
      submitLabel: "建立金鑰",
      action: issueAction,
      keyName: "",
      expiresAt: "",
      scopes: [...allowedScopes],
      reason: "",
    });
  }

  function openRotateComposer(apiKey: ApiKeyResource) {
    const rotateAction = resolveAction(
      apiKey.availableActions,
      "rotate",
      getFallbackRotateAction(apiKey),
    );
    setFlash(null);
    setComposer({
      mode: "rotate",
      title: `輪替 ${apiKey.keyName}`,
      subtitle: "輪替後舊憑證立即失效，新的 plaintext 僅會顯示一次。",
      submitLabel: "確認輪替",
      action: rotateAction,
      apiKeyId: apiKey.apiKeyId,
      keyName: apiKey.keyName,
      expiresAt: apiKey.expiresAt ?? "",
      scopes: [...apiKey.scopes],
      reason: "",
    });
  }

  function openRevokeModal(apiKey: ApiKeyResource) {
    setFlash(null);
    setRevokeIntent({
      apiKey,
      action: resolveAction(
        apiKey.availableActions,
        "revoke",
        getFallbackRevokeAction(apiKey),
      ),
      reason: "",
    });
  }

  function runAction(
    action: (formData: FormData) => Promise<ApiKeyFlashPayload>,
    formData: FormData,
    options: {
      draftName: string;
      draftScopes: string[];
      draftExpiresAt: string;
      reason: string;
    },
  ) {
    startTransition(async () => {
      const result = await action(formData);
      const resolvedResult =
        result.tone === "default" && options.reason.trim().length > 0
          ? {
              ...result,
              description: `${result.description} Reason: ${options.reason.trim()}`,
            }
          : result;

      setFlash(resolvedResult);

      if (resolvedResult.tone === "default" && resolvedResult.plaintextKey) {
        setSecretReveal({
          title: resolvedResult.title,
          description: resolvedResult.description,
          plaintextKey: resolvedResult.plaintextKey,
          keyName: getFlashKeyName(
            resolvedResult,
            options.draftName,
            apiKeyResources,
          ),
          scopes: options.draftScopes,
          expiresAt: options.draftExpiresAt || null,
        });
        setSecretAcknowledged(false);
      }

      if (resolvedResult.tone === "default") {
        setComposer(null);
        router.refresh();
        setLastRefreshedAt(new Date().toISOString());
      }
    });
  }

  function downloadSecretFile() {
    if (!secretReveal) return;
    const content = [
      `key_name=${secretReveal.keyName}`,
      `plaintext_key=${secretReveal.plaintextKey}`,
      `scopes=${secretReveal.scopes.join(",") || "none"}`,
      `expires_at=${secretReveal.expiresAt ?? "none"}`,
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${secretReveal.keyName.replace(/\s+/g, "-").toLowerCase() || "tenant-api-key"}.txt`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  async function copySecretToClipboard() {
    if (!secretReveal) return;
    await navigator.clipboard.writeText(secretReveal.plaintextKey);
  }

  function dismissSecretModal() {
    if (!secretAcknowledged) return;
    setSecretReveal(null);
  }

  function renderBanner() {
    if (flash?.tone === "warning") {
      return (
        <CanvasBanner
          theme={th}
          tone="warn"
          icon="warn"
          title={flash.title}
          body={flash.description}
        />
      );
    }

    if (effectiveEmptyReason === "fetch_failed" && errors.length > 0) {
      return (
        <CanvasBanner
          theme={th}
          tone="danger"
          icon="warn"
          title="API 金鑰資料不完整"
          body={errors.join(" · ")}
        />
      );
    }

    return (
      <CanvasBanner
        theme={th}
        tone={stateCounts.expiring > 0 ? "warn" : "info"}
        icon={stateCounts.expiring > 0 ? "warn" : "info"}
        title="只在建立或輪替當下顯示完整金鑰"
        body={
          stateCounts.expiring > 0
            ? `目前有 ${stateCounts.expiring} 把金鑰已進入到期前 7 天視窗，請安排輪替。`
            : "關閉 reveal modal 後只保留 prefix 與 masked suffix；若遺失 plaintext，必須重新輪替或重新建立。"
        }
      />
    );
  }

  const columns: CanvasTableColumn<ApiKeyRow>[] = [
    {
      h: "NAME",
      w: 240,
      r: (row) => (
        <div style={nameCellStyle}>
          <span style={nameMainStyle}>{row.keyName}</span>
          <div style={nameMetaStyle}>
            <span>{row.apiKeyId}</span>
            {row.revokedAt ? (
              <span>revoked {formatDateTime(row.revokedAt)}</span>
            ) : null}
          </div>
        </div>
      ),
    },
    { h: "PREFIX", k: "keyPrefix", w: 92, mono: true },
    {
      h: "MASK",
      w: 112,
      mono: true,
      r: (row) => `••••${row.maskedSuffix}`,
    },
    {
      h: "SCOPES",
      w: 220,
      mono: true,
      r: (row) => (
        <div style={{ whiteSpace: "normal", lineHeight: 1.45 }}>
          {row.scopes.join(" · ") || "—"}
        </div>
      ),
    },
    {
      h: "LAST USED",
      w: 126,
      mono: true,
      r: (row) => formatDateTime(row.lastUsedAt),
    },
    {
      h: "EXPIRES",
      w: 126,
      mono: true,
      r: (row) => formatDateTime(row.expiresAt),
    },
    {
      h: "STATE",
      w: 120,
      r: (row) => {
        const state = resolveApiKeyState(row);
        return (
          <CanvasPill theme={th} tone={getApiKeyTone(state)} dot>
            {getApiKeyLabel(state)}
          </CanvasPill>
        );
      },
    },
    {
      h: "ACTIONS",
      w: 176,
      r: (row) => (
        <div style={inlineActionStyle}>
          {renderActionButton(
            resolveAction(
              row.availableActions,
              "rotate",
              getFallbackRotateAction(row),
            ),
            "輪替",
            pending,
            () => openRotateComposer(row),
          )}
          {renderActionButton(
            resolveAction(
              row.availableActions,
              "revoke",
              getFallbackRevokeAction(row),
            ),
            "撤銷",
            pending,
            () => openRevokeModal(row),
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="API 金鑰"
        subtitle="Live / sandbox · scope · last used · plaintext-once reveal · revoke 後永久不可復原"
        actions={
          <>
            <CanvasBtn
              theme={th}
              size="sm"
              icon="refresh"
              onClick={() => {
                startTransition(() => {
                  router.refresh();
                  setLastRefreshedAt(new Date().toISOString());
                });
              }}
            >
              重新整理
            </CanvasBtn>
            <CanvasBtn
              theme={th}
              size="sm"
              icon="ext"
              onClick={() => window.open(externalLinks[0].href, "_blank")}
            >
              Platform Admin
            </CanvasBtn>
            <span
              title={
                issueAction.enabled
                  ? "建立金鑰"
                  : (issueAction.disabledReasonCode ?? "issue_disabled")
              }
            >
              <CanvasBtn
                theme={th}
                variant="primary"
                size="sm"
                icon="key"
                disabled={pending || !issueAction.enabled}
                onClick={openIssueComposer}
              >
                建立金鑰
              </CanvasBtn>
            </span>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {renderBanner()}

        <div style={topGridStyle}>
          <CanvasCard
            theme={th}
            title="治理與操作"
            subtitle="§5.11 API key management"
          >
            <div style={metaRowStyle}>
              <CanvasPill theme={th} tone="info">
                {REFRESH_LABELS[refreshTier]}
              </CanvasPill>
              <CanvasPill
                theme={th}
                tone={errors.length > 0 ? "warn" : "success"}
              >
                {errors.length > 0 ? "degraded snapshot" : "fresh snapshot"}
              </CanvasPill>
              <CanvasPill theme={th} tone="neutral">
                refreshed {formatFreshnessLabel(lastRefreshedAt)}
              </CanvasPill>
            </div>
            <p style={copyStyle}>
              scope 與 expiry 受 tenant integration governance package 約束。 UI
              會優先依 `availableActions` 顯示可執行 CTA；若後端尚未回傳，
              才使用目前的安全 fallback。
            </p>
            <div style={{ height: 16 }} />
            <div style={statGridStyle}>
              <div style={statTileStyle}>
                <span style={statLabelStyle}>active</span>
                <span style={statValueStyle}>{stateCounts.active}</span>
                <span style={statSubtleStyle}>可用憑證</span>
              </div>
              <div style={statTileStyle}>
                <span style={statLabelStyle}>expiring</span>
                <span style={statValueStyle}>{stateCounts.expiring}</span>
                <span style={statSubtleStyle}>7 天內到期</span>
              </div>
              <div style={statTileStyle}>
                <span style={statLabelStyle}>revoked</span>
                <span style={statValueStyle}>{stateCounts.revoked}</span>
                <span style={statSubtleStyle}>保留稽核可視</span>
              </div>
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="治理與 deep links"
            subtitle="cross-app targets open in new tab"
          >
            <div style={utilityStackStyle}>
              {externalLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  style={linkCardStyle}
                >
                  <span>
                    <strong>{link.label}</strong>
                    <span style={linkMetaStyle}>{link.description}</span>
                  </span>
                  <span style={monoStyle}>new tab</span>
                </a>
              ))}
            </div>
          </CanvasCard>
        </div>

        <CanvasCard
          theme={th}
          title="Governance package"
          subtitle="published integration policy snapshot"
        >
          {governanceResource ? (
            <>
              <CanvasDL
                theme={th}
                cols={3}
                items={[
                  {
                    k: "Default lifetime",
                    v: `${governanceResource.apiKeyPolicy.defaultLifetimeDays} days`,
                    mono: true,
                  },
                  {
                    k: "Maximum lifetime",
                    v: `${governanceResource.apiKeyPolicy.maxLifetimeDays} days`,
                    mono: true,
                  },
                  {
                    k: "Expiry",
                    v: governanceResource.apiKeyPolicy.requireExpiry
                      ? "required"
                      : "optional",
                    mono: true,
                  },
                  {
                    k: "Break-glass",
                    v: governanceResource.apiKeyPolicy
                      .breakGlassRequiresPlatformApproval
                      ? "platform approval"
                      : "not published",
                    mono: true,
                  },
                  {
                    k: "Revoke effect",
                    v: governanceResource.apiKeyPolicy.revokeEffect,
                    mono: true,
                  },
                  {
                    k: "Generated",
                    v: formatDateTime(governanceResource.generatedAt),
                    mono: true,
                  },
                ]}
              />
              <div style={{ height: 14 }} />
              <div style={scopeGridStyle}>
                {allowedScopes.map((scope) => (
                  <CanvasPill key={scope} theme={th} tone="info">
                    {scope}
                  </CanvasPill>
                ))}
              </div>
              {compatibilityAliases.length > 0 ? (
                <>
                  <div style={{ height: 14 }} />
                  <CanvasDL
                    theme={th}
                    cols={2}
                    items={compatibilityAliases.map(([alias, target]) => ({
                      k: alias,
                      v: target,
                      mono: true,
                    }))}
                  />
                </>
              ) : null}
            </>
          ) : (
            <CanvasBanner
              theme={th}
              tone="warn"
              icon="warn"
              title="Governance package unavailable"
              body="沒有治理封包時無法安全確認 scope 與 lifetime 上限，因此建立金鑰會受限。"
            />
          )}
        </CanvasCard>

        <CanvasCard
          theme={th}
          title="搜尋與篩選"
          subtitle="must-show data: search by name, filter by status"
        >
          <div style={filterGridStyle}>
            <CanvasField theme={th} label="搜尋">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="名稱、apiKeyId、scope"
                style={nativeInputStyle}
              />
            </CanvasField>
            <CanvasField theme={th} label="狀態">
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as StatusFilter)
                }
                style={nativeInputStyle}
              >
                <option value="all">all</option>
                <option value="active">active</option>
                <option value="expiring">expiring</option>
                <option value="expired">expired</option>
                <option value="revoked">revoked</option>
              </select>
            </CanvasField>
            <CanvasBtn
              theme={th}
              size="sm"
              variant="ghost"
              onClick={resetFilters}
            >
              清除篩選
            </CanvasBtn>
            <CanvasPill theme={th} tone="neutral">
              {filteredKeys.length} result{filteredKeys.length === 1 ? "" : "s"}
            </CanvasPill>
          </div>
        </CanvasCard>

        <CanvasCard theme={th} title="金鑰清單" padding={0}>
          {emptyState ? (
            <div style={emptyStateStyle}>
              <div style={emptyPanelStyle}>
                <CanvasPill theme={th} tone={emptyState.tone}>
                  {effectiveEmptyReason}
                </CanvasPill>
                <h3 style={emptyTitleStyle}>{emptyState.title}</h3>
                <p style={emptyBodyStyle}>{emptyState.body}</p>
                <div style={inlineActionStyle}>
                  {emptyState.action ? (
                    <CanvasBtn
                      theme={th}
                      variant="primary"
                      size="sm"
                      disabled={!emptyState.action.enabled}
                      onClick={openIssueComposer}
                    >
                      {emptyState.ctaLabel}
                    </CanvasBtn>
                  ) : emptyState.ctaLabel === "立即重整" ? (
                    <CanvasBtn
                      theme={th}
                      variant="primary"
                      size="sm"
                      onClick={() => router.refresh()}
                    >
                      {emptyState.ctaLabel}
                    </CanvasBtn>
                  ) : emptyState.ctaHref?.startsWith("http") ? (
                    <a
                      href={emptyState.ctaHref}
                      target="_blank"
                      rel="noreferrer"
                      style={linkCardStyle}
                    >
                      {emptyState.ctaLabel}
                    </a>
                  ) : emptyState.ctaHref ? (
                    <Link href={emptyState.ctaHref} style={linkCardStyle}>
                      {emptyState.ctaLabel}
                    </Link>
                  ) : (
                    <CanvasBtn
                      theme={th}
                      variant="primary"
                      size="sm"
                      onClick={resetFilters}
                    >
                      {emptyState.ctaLabel}
                    </CanvasBtn>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <CanvasTable<ApiKeyRow>
              theme={th}
              columns={columns}
              rows={filteredKeys as ApiKeyRow[]}
            />
          )}
        </CanvasCard>

        <CanvasCard
          theme={th}
          title="關聯頁面"
          subtitle="entry / exits from spec"
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 10,
            }}
          >
            {inAppLinks.map((link) => (
              <Link key={link.href} href={link.href} style={linkCardStyle}>
                <span>
                  <strong>{link.label}</strong>
                  <span style={linkMetaStyle}>{link.description}</span>
                </span>
                <span style={monoStyle}>{link.href}</span>
              </Link>
            ))}
          </div>
        </CanvasCard>
      </div>

      {composer ? (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={modalHeaderStyle}>
              <div>
                <h2 style={modalTitleStyle}>{composer.title}</h2>
                <p style={modalBodyTextStyle}>{composer.subtitle}</p>
              </div>
              <CanvasBtn
                theme={th}
                size="xs"
                variant="ghost"
                onClick={() => setComposer(null)}
              >
                關閉
              </CanvasBtn>
            </div>

            <div style={fieldGridStyle}>
              <CanvasField theme={th} label="名稱" required>
                <input
                  value={composer.keyName}
                  onChange={(event) =>
                    setComposer((current) =>
                      current
                        ? { ...current, keyName: event.target.value }
                        : current,
                    )
                  }
                  style={nativeInputStyle}
                  placeholder="production-booking-sync"
                />
              </CanvasField>
              <CanvasField
                theme={th}
                label="到期時間"
                hint={
                  governanceResource
                    ? `需帶時區。預設 ${governanceResource.apiKeyPolicy.defaultLifetimeDays} 天，最長 ${governanceResource.apiKeyPolicy.maxLifetimeDays} 天。`
                    : "Governance package 未載入，無法驗證有效期上限。"
                }
              >
                <input
                  value={composer.expiresAt}
                  onChange={(event) =>
                    setComposer((current) =>
                      current
                        ? { ...current, expiresAt: event.target.value }
                        : current,
                    )
                  }
                  style={nativeMonoInputStyle}
                  spellCheck={false}
                  placeholder="2026-08-09T01:52:30Z"
                />
              </CanvasField>
            </div>

            <CanvasField
              theme={th}
              label="Scopes"
              required
              hint="依 least-privilege 選擇；rotate 時也可同步調整 scope。"
            >
              <div style={scopeGridStyle}>
                {allowedScopes.length > 0 ? (
                  allowedScopes.map((scope) => {
                    const selected = composer.scopes.includes(scope);
                    return (
                      <label key={scope} style={getScopeChipStyle(selected)}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleComposerScope(scope)}
                          style={scopeChipInputStyle}
                        />
                        <span>{scope}</span>
                      </label>
                    );
                  })
                ) : (
                  <span style={helperTextStyle}>
                    Governance package 不可用，沒有可發布的 scope。
                  </span>
                )}
              </div>
            </CanvasField>

            <CanvasField
              theme={th}
              label="操作原因"
              required
              hint="High-risk action 需要輸入 reason，符合 Q-X09 / Q-X13。"
            >
              <textarea
                value={composer.reason}
                onChange={(event) =>
                  setComposer((current) =>
                    current
                      ? { ...current, reason: event.target.value }
                      : current,
                  )
                }
                style={textareaStyle}
                placeholder={
                  composer.mode === "issue"
                    ? "例如：new production integration for booking partner"
                    : "例如：existing key exposed in CI log，立即輪替"
                }
              />
            </CanvasField>

            <div style={modalFooterStyle}>
              <span style={helperTextStyle}>
                建立或輪替成功後會進入 once-only secret reveal
                modal，可複製或下載 `.txt`。
              </span>
              <div style={inlineActionStyle}>
                <button
                  type="button"
                  style={secondaryButtonStyle}
                  onClick={() => setComposer(null)}
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={
                    pending ||
                    !composer.action.enabled ||
                    composer.keyName.trim().length === 0 ||
                    composer.reason.trim().length === 0 ||
                    composer.scopes.length === 0
                  }
                  style={{
                    ...primaryButtonStyle,
                    opacity:
                      pending ||
                      !composer.action.enabled ||
                      composer.keyName.trim().length === 0 ||
                      composer.reason.trim().length === 0 ||
                      composer.scopes.length === 0
                        ? 0.55
                        : 1,
                    cursor:
                      pending ||
                      !composer.action.enabled ||
                      composer.keyName.trim().length === 0 ||
                      composer.reason.trim().length === 0 ||
                      composer.scopes.length === 0
                        ? "not-allowed"
                        : "pointer",
                  }}
                  onClick={() => {
                    const currentComposer = composer;
                    runAction(
                      currentComposer.mode === "issue"
                        ? issueTenantApiKeyAction
                        : rotateTenantApiKeyAction,
                      currentComposer.mode === "issue"
                        ? buildCreateFormData(
                            currentComposer.keyName,
                            currentComposer.expiresAt,
                            currentComposer.scopes,
                          )
                        : buildRotateFormData(
                            currentComposer.apiKeyId ?? "",
                            currentComposer.keyName,
                            currentComposer.expiresAt,
                            currentComposer.scopes,
                          ),
                      {
                        draftName: currentComposer.keyName,
                        draftScopes: currentComposer.scopes,
                        draftExpiresAt: currentComposer.expiresAt,
                        reason: currentComposer.reason,
                      },
                    );
                  }}
                >
                  {pending ? "處理中..." : composer.submitLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {revokeIntent ? (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={modalHeaderStyle}>
              <div>
                <h2 style={modalTitleStyle}>撤銷 API 金鑰</h2>
                <p style={modalBodyTextStyle}>
                  撤銷後不可回復，所有使用此憑證的整合會立即失敗。
                </p>
              </div>
              <CanvasBtn
                theme={th}
                size="xs"
                variant="ghost"
                onClick={() => setRevokeIntent(null)}
              >
                關閉
              </CanvasBtn>
            </div>

            <CanvasDL
              theme={th}
              cols={2}
              items={[
                { k: "Name", v: revokeIntent.apiKey.keyName },
                {
                  k: "ApiKeyId",
                  v: revokeIntent.apiKey.apiKeyId,
                  mono: true,
                },
                {
                  k: "Scopes",
                  v: revokeIntent.apiKey.scopes.join(" · "),
                  mono: true,
                },
                {
                  k: "Expires",
                  v: formatDateTime(revokeIntent.apiKey.expiresAt),
                  mono: true,
                },
              ]}
            />

            <CanvasField
              theme={th}
              label="操作原因"
              required
              hint="High-risk action requires a reason."
            >
              <textarea
                value={revokeIntent.reason}
                onChange={(event) =>
                  setRevokeIntent((current) =>
                    current
                      ? { ...current, reason: event.target.value }
                      : current,
                  )
                }
                style={textareaStyle}
                placeholder="例如：partner integration retired，撤銷 production key"
              />
            </CanvasField>

            <div style={modalFooterStyle}>
              <span style={helperTextStyle}>
                UI 已收集 high-risk reason；後端 receipt 目前尚未承載此欄位。
              </span>
              <div style={inlineActionStyle}>
                <button
                  type="button"
                  style={secondaryButtonStyle}
                  onClick={() => setRevokeIntent(null)}
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={
                    pending ||
                    !revokeIntent.action.enabled ||
                    revokeIntent.reason.trim().length === 0
                  }
                  style={{
                    ...primaryButtonStyle,
                    background: th.danger,
                    borderColor: th.danger,
                    opacity:
                      pending ||
                      !revokeIntent.action.enabled ||
                      revokeIntent.reason.trim().length === 0
                        ? 0.55
                        : 1,
                    cursor:
                      pending ||
                      !revokeIntent.action.enabled ||
                      revokeIntent.reason.trim().length === 0
                        ? "not-allowed"
                        : "pointer",
                  }}
                  onClick={() => {
                    const currentIntent = revokeIntent;
                    setRevokeIntent(null);
                    startTransition(async () => {
                      const result = await revokeTenantApiKeyAction(
                        buildRevokeFormData(
                          currentIntent.apiKey.apiKeyId,
                          currentIntent.apiKey.keyName,
                        ),
                      );
                      const resolvedResult =
                        result.tone === "default"
                          ? {
                              ...result,
                              description: `${result.description} Reason: ${currentIntent.reason.trim()}`,
                            }
                          : result;
                      setFlash(resolvedResult);
                      if (resolvedResult.tone === "default") {
                        router.refresh();
                        setLastRefreshedAt(new Date().toISOString());
                      }
                    });
                  }}
                >
                  {pending ? "處理中..." : "確認撤銷"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {secretReveal ? (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={modalHeaderStyle}>
              <div>
                <h2 style={modalTitleStyle}>{secretReveal.title}</h2>
                <p style={modalBodyTextStyle}>{secretReveal.description}</p>
              </div>
              <CanvasPill theme={th} tone="warn">
                plaintext once
              </CanvasPill>
            </div>

            <CanvasBanner
              theme={th}
              tone="warn"
              icon="warn"
              title="離開此視窗後只保留 masked suffix"
              body="請立即 copy 或下載 .txt。若未保存，只能重新輪替或重新建立。"
            />

            <CanvasDL
              theme={th}
              cols={2}
              items={[
                { k: "Name", v: secretReveal.keyName },
                {
                  k: "Expires",
                  v: formatDateTime(secretReveal.expiresAt),
                  mono: true,
                },
                {
                  k: "Scopes",
                  v: secretReveal.scopes.join(" · "),
                  mono: true,
                },
                {
                  k: "Refresh tier",
                  v: REFRESH_LABELS[refreshTier],
                  mono: true,
                },
              ]}
            />

            <code style={plaintextKeyStyle}>{secretReveal.plaintextKey}</code>

            <div style={inlineActionStyle}>
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={copySecretToClipboard}
              >
                複製金鑰
              </button>
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={downloadSecretFile}
              >
                下載 .txt
              </button>
            </div>

            <label style={checkboxRowStyle}>
              <input
                type="checkbox"
                checked={secretAcknowledged}
                onChange={(event) =>
                  setSecretAcknowledged(event.target.checked)
                }
              />
              <span>我已儲存這把金鑰，知道關閉後不會再顯示 plaintext。</span>
            </label>

            <div style={modalFooterStyle}>
              <span style={helperTextStyle}>
                後續列表只會顯示 `{secretReveal.keyName}` 的 prefix 與 masked
                suffix。
              </span>
              <button
                type="button"
                style={{
                  ...primaryButtonStyle,
                  opacity: secretAcknowledged ? 1 : 0.55,
                  cursor: secretAcknowledged ? "pointer" : "not-allowed",
                }}
                disabled={!secretAcknowledged}
                onClick={dismissSecretModal}
              >
                我已保存，關閉視窗
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
