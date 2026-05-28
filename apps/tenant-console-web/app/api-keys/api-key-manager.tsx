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
  CanvasKPI,
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
type ApiKeyRow = TenantApiKeyRecord & Record<string, unknown>;
type ConfirmIntent =
  | {
      kind: "rotate";
      apiKey: TenantApiKeyRecord;
      action: ResourceActionDescriptor;
    }
  | {
      kind: "revoke";
      apiKey: TenantApiKeyRecord;
      action: ResourceActionDescriptor;
    };

type SecretRevealState = {
  title: string;
  description: string;
  plaintextKey: string;
  keyName: string;
  scopes: string[];
  expiresAt: string | null;
};

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const AUTO_REFRESH_MS = 30_000;
const REFRESH_LABELS: Record<RefreshTier, string> = {
  urgent: "T1 urgent · push",
  fast: "T2 fast · 3s",
  dispatch: "T3 dispatch · 5s",
  medium: "T4 medium · 15s",
  medium_slow: "T4.5 medium-slow · 30s",
  slow: "T5 tenant slow · 30s",
  manual: "T6 manual",
};

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const heroGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.4fr minmax(280px, 0.8fr)",
  gap: 16,
};

const heroMetaStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginBottom: 12,
};

const heroCopyStyle: CSSProperties = {
  margin: 0,
  color: th.textMuted,
  fontSize: 12.5,
  lineHeight: 1.6,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
};

const toolRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 1fr) auto auto auto",
  gap: 12,
  alignItems: "end",
};

const actionCardGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(420px, 1fr) minmax(280px, 0.8fr)",
  gap: 16,
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

const utilityGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 16,
};

const emptyReasonGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
};

const navListStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
};

const navLinkStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  borderRadius: 10,
  border: `1px solid ${th.border}`,
  padding: "10px 12px",
  textDecoration: "none",
  background: th.surfaceLo,
  color: th.text,
  fontSize: 12.5,
};

const inlineActionsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const helperTextStyle: CSSProperties = {
  fontSize: 11,
  color: th.textDim,
  lineHeight: 1.5,
};

const nativeInputStyle: CSSProperties = {
  width: "100%",
  background: th.bgRaised,
  border: `1px solid ${th.border}`,
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 12.5,
  color: th.text,
  outline: "none",
  fontFamily: th.fontFamily,
  boxSizing: "border-box",
};

const nativeMonoInputStyle: CSSProperties = {
  ...nativeInputStyle,
  fontFamily: th.monoFamily,
  fontSize: 11.5,
};

const selectStyle: CSSProperties = {
  ...nativeInputStyle,
  appearance: "none",
};

const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "5px 10px",
  fontSize: 12,
  height: 28,
  fontWeight: 600,
  background: th.accent,
  color: "#fff",
  border: `1px solid ${th.accent}`,
  borderRadius: 7,
  cursor: "pointer",
  lineHeight: 1,
  fontFamily: th.fontFamily,
};

const secondaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: th.surface,
  color: th.text,
  border: `1px solid ${th.border}`,
};

const nameCellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
};

const namePrimaryStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
};

const nameMetaRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
  fontSize: 11,
  color: th.textDim,
  fontFamily: th.monoFamily,
};

const monoCodeStyle: CSSProperties = {
  fontFamily: th.monoFamily,
  fontSize: 11,
};

const tableEmptyStyle: CSSProperties = {
  padding: 28,
};

const emptyPanelStyle: CSSProperties = {
  borderRadius: 12,
  border: `1px dashed ${th.border}`,
  background: th.surfaceLo,
  padding: 18,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const emptyPanelTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 700,
  color: th.text,
};

const emptyPanelBodyStyle: CSSProperties = {
  margin: 0,
  fontSize: 12.5,
  lineHeight: 1.55,
  color: th.textMuted,
};

const emptyBadgeRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const sectionLabelStyle: CSSProperties = {
  marginBottom: 8,
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: th.textMuted,
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(5, 9, 15, 0.72)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 60,
};

const modalStyle: CSSProperties = {
  width: "min(680px, 100%)",
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
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};

const modalTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
  color: th.text,
};

const modalBodyTextStyle: CSSProperties = {
  margin: 0,
  color: th.textMuted,
  fontSize: 12.5,
  lineHeight: 1.6,
};

const plaintextKeyStyle: CSSProperties = {
  display: "block",
  background: "rgba(6, 11, 19, 0.72)",
  border: `1px solid ${th.border}`,
  borderRadius: 10,
  padding: "12px 14px",
  color: th.text,
  fontSize: 12,
  fontFamily: th.monoFamily,
  overflowX: "auto",
};

const textareaStyle: CSSProperties = {
  ...nativeInputStyle,
  minHeight: 110,
  resize: "vertical",
};

const modalFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
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
    description: "break-glass 與治理審批",
  },
  {
    href: "https://ops.drts.io/audit?tenantId=yamato&module=tenant_api_key",
    label: "Ops Console",
    description: "跨 actor 稽核追溯",
  },
] as const;

const integrationLinks = [
  {
    href: "/integration-governance",
    label: "整合就緒度",
    note: "aggregated readiness",
  },
  { href: "/webhooks", label: "Webhook", note: "receiver health" },
  { href: "/notifications", label: "通知偏好", note: "event × channel" },
  { href: "/sla", label: "SLA", note: "tenant thresholds" },
] as const;

const supportedEmptyReasons = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const satisfies readonly EmptyReason[];

const dateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateTimeFormatter.format(parsed);
}

function formatDurationLabel(snapshotAt: string) {
  const snapshotMillis = new Date(snapshotAt).getTime();
  if (Number.isNaN(snapshotMillis)) return "unknown";
  const ageSeconds = Math.max(
    0,
    Math.round((Date.now() - snapshotMillis) / 1000),
  );
  if (ageSeconds < 60) return `${ageSeconds}s ago`;
  const ageMinutes = Math.round(ageSeconds / 60);
  return `${ageMinutes}m ago`;
}

function isRevoked(apiKey: TenantApiKeyRecord) {
  return Boolean(apiKey.revokedAt);
}

function resolveApiKeyState(apiKey: TenantApiKeyRecord): ApiKeyState {
  if (isRevoked(apiKey)) return "revoked";
  if (apiKey.expiresAt && new Date(apiKey.expiresAt).getTime() <= Date.now()) {
    return "expired";
  }
  if (apiKey.expiresAt) {
    const millisUntilExpiry = new Date(apiKey.expiresAt).getTime() - Date.now();
    if (millisUntilExpiry <= 7 * 24 * 60 * 60 * 1000) return "expiring";
  }
  return "active";
}

function getApiKeyStateTone(state: ApiKeyState): CanvasTone {
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

function getApiKeyStateLabel(state: ApiKeyState) {
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

function getIssueAction(canIssue: boolean) {
  return createActionDescriptor(
    "issue",
    canIssue,
    "high",
    canIssue ? undefined : "governance_unavailable",
  );
}

function getRotateAction(apiKey: TenantApiKeyRecord) {
  const state = resolveApiKeyState(apiKey);
  return createActionDescriptor(
    "rotate",
    state !== "revoked",
    "high",
    state === "revoked" ? "already_revoked" : undefined,
  );
}

function getRevokeAction(apiKey: TenantApiKeyRecord) {
  const state = resolveApiKeyState(apiKey);
  return createActionDescriptor(
    "revoke",
    state !== "revoked",
    "high",
    state === "revoked" ? "already_revoked" : undefined,
  );
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

function buildRotateFormData(apiKey: TenantApiKeyRecord) {
  const formData = new FormData();
  formData.set("apiKeyId", apiKey.apiKeyId);
  formData.set("keyName", apiKey.keyName);
  if (apiKey.expiresAt) formData.set("expiresAt", apiKey.expiresAt);
  apiKey.scopes.forEach((scope: string) => formData.append("scopes", scope));
  return formData;
}

function buildRevokeFormData(apiKey: TenantApiKeyRecord) {
  const formData = new FormData();
  formData.set("apiKeyId", apiKey.apiKeyId);
  formData.set("keyName", apiKey.keyName);
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

function getFlashKeyName(
  flash: ApiKeyFlashPayload,
  fallbackName: string,
  apiKeys: TenantApiKeyRecord[],
) {
  const matchedName = apiKeys.find((apiKey) => {
    return flash.description.includes(apiKey.keyName);
  })?.keyName;
  return matchedName ?? fallbackName;
}

function renderActionDescriptor(
  descriptor: ResourceActionDescriptor,
  label: string,
  onClick: () => void,
  pending: boolean,
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
        variant={descriptor.riskLevel === "high" ? "ghost" : "ghost"}
        disabled={disabled}
        {...(!disabled ? { onClick } : {})}
      >
        {label}
      </CanvasBtn>
    </span>
  );
}

function buildEmptyReasonCatalog(issueAction: ResourceActionDescriptor) {
  const catalog: Record<
    (typeof supportedEmptyReasons)[number],
    {
      title: string;
      body: string;
      tone: CanvasTone;
      ctaLabel: string;
      ctaHref?: string;
      action?: ResourceActionDescriptor;
    }
  > = {
    no_data: {
      title: "尚未建立任何 API 金鑰",
      body: "租戶還沒有發出任何整合憑證。先建立 least-privilege key，之後系統只會顯示 mask 與 suffix。",
      tone: "info",
      ctaLabel: "建立第一把金鑰",
      action: issueAction,
    },
    not_provisioned: {
      title: "租戶整合治理尚未開通",
      body: "此租戶還沒有發布 API key policy，不能自助發鑰。需先完成 platform-admin 治理與 baseline package。",
      tone: "warn",
      ctaLabel: "前往 Platform Admin",
      ctaHref: externalLinks[0].href,
    },
    fetch_failed: {
      title: "API 金鑰清單讀取失敗",
      body: "後端回傳失敗，清單未能完成載入。可重新整理後再試，或查看跨 app 稽核與治理狀態。",
      tone: "danger",
      ctaLabel: "立即重整",
    },
    permission_denied: {
      title: "目前身分只有只讀權限",
      body: "你可以查看現有憑證與 audit context，但 issue / rotate / revoke 需要 tenant admin 或 integration manager authority。",
      tone: "neutral",
      ctaLabel: "查看稽核追溯",
      ctaHref: externalLinks[1].href,
    },
    external_unavailable: {
      title: "外部整合依賴暫時不可用",
      body: "治理 package 或 downstream trust service 異常，暫時不能確認 scope / expiry policy。請等外部依賴恢復後再操作。",
      tone: "warn",
      ctaLabel: "查看整合就緒度",
      ctaHref: "/integration-governance",
    },
    filtered_empty: {
      title: "目前篩選條件沒有結果",
      body: "調整搜尋字詞或狀態篩選，即可重新顯示 active / expired / revoked 金鑰。",
      tone: "info",
      ctaLabel: "清除篩選",
    },
  };

  return catalog;
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
  const [flash, setFlash] = useState<ApiKeyFlashPayload | null>(null);
  const [secretReveal, setSecretReveal] = useState<SecretRevealState | null>(
    null,
  );
  const [secretAcknowledged, setSecretAcknowledged] = useState(false);
  const [pending, startTransition] = useTransition();
  const [showCreateCard, setShowCreateCard] = useState(false);
  const [showPolicyCard, setShowPolicyCard] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [confirmIntent, setConfirmIntent] = useState<ConfirmIntent | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState(snapshotAt);
  const allowedScopes = governance?.apiKeyPolicy.allowedScopes ?? [];
  const compatibilityAliases = Object.entries(
    (governance?.apiKeyPolicy.compatibilityAliases ?? {}) as Record<
      string,
      string
    >,
  );
  const [draftName, setDraftName] = useState("");
  const [draftExpiresAt, setDraftExpiresAt] = useState("");
  const [draftScopes, setDraftScopes] = useState<string[]>(allowedScopes);
  const [draftReason, setDraftReason] = useState("");

  useEffect(() => {
    setDraftScopes((current) => {
      const filtered = current.filter((scope) => allowedScopes.includes(scope));
      if (filtered.length > 0) return filtered;
      return [...allowedScopes];
    });
  }, [allowedScopes]);

  useEffect(() => {
    setLastRefreshedAt(snapshotAt);
  }, [snapshotAt]);

  useEffect(() => {
    if (refreshTier === "manual") return;
    const interval = window.setInterval(() => {
      startTransition(() => {
        router.refresh();
        setLastRefreshedAt(new Date().toISOString());
      });
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [refreshTier, router]);

  const sortedKeys = useMemo(
    () =>
      [...apiKeys].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      ),
    [apiKeys],
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
        apiKey.scopes.some((scope: string) =>
          scope.toLowerCase().includes(normalizedQuery),
        )
      );
    });
  }, [query, sortedKeys, statusFilter]);

  const activeCount = sortedKeys.filter(
    (apiKey) => resolveApiKeyState(apiKey) === "active",
  ).length;
  const expiringCount = sortedKeys.filter(
    (apiKey) => resolveApiKeyState(apiKey) === "expiring",
  ).length;
  const revokedCount = sortedKeys.filter(
    (apiKey) => resolveApiKeyState(apiKey) === "revoked",
  ).length;
  const issueAction = getIssueAction(
    Boolean(governance) && allowedScopes.length > 0,
  );
  const emptyCatalog = buildEmptyReasonCatalog(issueAction);

  const effectiveEmptyReason = useMemo<
    (typeof supportedEmptyReasons)[number] | null
  >(() => {
    if (emptyReasonOverride) {
      return emptyReasonOverride as (typeof supportedEmptyReasons)[number];
    }
    if (errors.length > 0 && sortedKeys.length === 0) return "fetch_failed";
    if (!governance && sortedKeys.length === 0) return "not_provisioned";
    if (sortedKeys.length === 0) return "no_data";
    if (filteredKeys.length === 0) return "filtered_empty";
    return null;
  }, [
    emptyReasonOverride,
    errors.length,
    filteredKeys.length,
    governance,
    sortedKeys.length,
  ]);

  function resetCreateDraft() {
    setDraftName("");
    setDraftExpiresAt("");
    setDraftScopes([...allowedScopes]);
    setDraftReason("");
  }

  function toggleScope(scope: string) {
    setDraftScopes((current) =>
      current.includes(scope)
        ? current.filter((value) => value !== scope)
        : [...current, scope],
    );
  }

  function runAction(
    action: (formData: FormData) => Promise<ApiKeyFlashPayload>,
    formData: FormData,
    options?: {
      onSuccess?: () => void;
      secretSource?: TenantApiKeyRecord;
      reason?: string;
    },
  ) {
    startTransition(async () => {
      const result = await action(formData);
      const trimmedReason = options?.reason?.trim();
      const resolvedResult =
        result.tone === "default" && trimmedReason
          ? {
              ...result,
              description: `${result.description} Reason: ${trimmedReason}`,
            }
          : result;
      setFlash(resolvedResult);

      if (resolvedResult.tone === "default") {
        if (resolvedResult.plaintextKey) {
          const source = options?.secretSource;
          setSecretReveal({
            title: resolvedResult.title,
            description: resolvedResult.description,
            plaintextKey: resolvedResult.plaintextKey,
            keyName:
              source?.keyName ?? getFlashKeyName(result, draftName, sortedKeys),
            scopes: source?.scopes ?? draftScopes,
            expiresAt: source?.expiresAt ?? (draftExpiresAt || null),
          });
          setSecretAcknowledged(false);
        }
        options?.onSuccess?.();
        router.refresh();
        setLastRefreshedAt(new Date().toISOString());
      }
    });
  }

  function downloadSecretFile() {
    if (!secretReveal) return;
    const lines = [
      `key_name=${secretReveal.keyName}`,
      `plaintext_key=${secretReveal.plaintextKey}`,
      `scopes=${secretReveal.scopes.join(",") || "none"}`,
      `expires_at=${secretReveal.expiresAt ?? "none"}`,
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/plain;charset=utf-8",
    });
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
    setFlash(null);
  }

  function renderPrimaryBanner() {
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
        tone={expiringCount > 0 ? "warn" : "info"}
        icon={expiringCount > 0 ? "warn" : "info"}
        title="只在建立或輪替當下顯示完整金鑰"
        body={
          expiringCount > 0
            ? `有 ${expiringCount} 把金鑰已進入到期前 7 天視窗；請依 least-privilege 原則安排輪替。`
            : "關閉 reveal modal 後只顯示 prefix 與 masked suffix；若遺失 plaintext，必須重新輪替。"
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
          <span style={namePrimaryStyle}>{row.keyName}</span>
          <div style={nameMetaRowStyle}>
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
      w: 104,
      mono: true,
      r: (row) => `••••${row.maskedSuffix}`,
    },
    {
      h: "SCOPES",
      w: 230,
      mono: true,
      r: (row) => (
        <div style={{ whiteSpace: "normal", lineHeight: 1.45 }}>
          {row.scopes.join(" · ") || "—"}
        </div>
      ),
    },
    {
      h: "LAST USED",
      w: 132,
      mono: true,
      r: (row) => formatDateTime(row.lastUsedAt),
    },
    {
      h: "EXPIRES",
      w: 132,
      mono: true,
      r: (row) => formatDateTime(row.expiresAt),
    },
    {
      h: "STATE",
      w: 120,
      r: (row) => {
        const state = resolveApiKeyState(row);
        return (
          <CanvasPill theme={th} tone={getApiKeyStateTone(state)} dot>
            {getApiKeyStateLabel(state)}
          </CanvasPill>
        );
      },
    },
    {
      h: "ACTIONS",
      w: 176,
      r: (row) => {
        const rotateAction = getRotateAction(row);
        const revokeAction = getRevokeAction(row);
        return (
          <div style={inlineActionsStyle}>
            {renderActionDescriptor(
              rotateAction,
              "輪替",
              () => {
                setReason("");
                setConfirmIntent({
                  kind: "rotate",
                  apiKey: row,
                  action: rotateAction,
                });
              },
              pending,
            )}
            {renderActionDescriptor(
              revokeAction,
              "撤銷",
              () => {
                setReason("");
                setConfirmIntent({
                  kind: "revoke",
                  apiKey: row,
                  action: revokeAction,
                });
              },
              pending,
            )}
          </div>
        );
      },
    },
  ];

  const emptyState = effectiveEmptyReason
    ? emptyCatalog[effectiveEmptyReason]
    : null;

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="API 金鑰"
        subtitle="Live / sandbox · search / status filter · plaintext-once reveal · revoke 後永久不可復原"
        actions={
          <>
            <CanvasBtn
              theme={th}
              icon="refresh"
              size="sm"
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
              icon="ext"
              size="sm"
              onClick={() => setShowPolicyCard((current) => !current)}
            >
              API 文件
            </CanvasBtn>
            <span title={issueAction.disabledReasonCode ?? "issue"}>
              <CanvasBtn
                theme={th}
                variant="primary"
                icon="key"
                size="sm"
                disabled={!issueAction.enabled}
                onClick={() => setShowCreateCard((current) => !current)}
              >
                建立金鑰
              </CanvasBtn>
            </span>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {renderPrimaryBanner()}

        <div style={heroGridStyle}>
          <CanvasCard
            theme={th}
            title="治理與操作"
            subtitle="§5.11 API key management"
          >
            <div style={heroMetaStyle}>
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
                refreshed {formatDurationLabel(lastRefreshedAt)}
              </CanvasPill>
            </div>
            <p style={heroCopyStyle}>
              API 金鑰頁面必須同時支援 issue / rotate / revoke，並且後續只保留
              mask。 scope 與 expiry 受 tenant integration governance package
              約束，不能在前端自行發明權限模型。
            </p>
            <div style={{ height: 16 }} />
            <div style={kpiGridStyle}>
              <CanvasKPI
                theme={th}
                label="active"
                value={String(activeCount)}
                delta="healthy"
                deltaTone="up"
                sub="可用憑證"
              />
              <CanvasKPI
                theme={th}
                label="expiring"
                value={String(expiringCount)}
                delta="watch"
                sub="7 天內到期"
              />
              <CanvasKPI
                theme={th}
                label="revoked"
                value={String(revokedCount)}
                delta="audit"
                deltaTone="down"
                sub="保留稽核可視"
              />
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="Cross-app deep links"
            subtitle="open in new tab"
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {externalLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  style={navLinkStyle}
                >
                  <span>
                    <strong>{link.label}</strong>
                    <span
                      style={{
                        display: "block",
                        color: th.textMuted,
                        marginTop: 2,
                      }}
                    >
                      {link.description}
                    </span>
                  </span>
                  <span style={monoCodeStyle}>new tab</span>
                </a>
              ))}
            </div>
          </CanvasCard>
        </div>

        {(showCreateCard || showPolicyCard) && (
          <div style={actionCardGridStyle}>
            {showCreateCard ? (
              <CanvasCard
                theme={th}
                title="建立金鑰"
                subtitle="成功後會開啟 plaintext-once reveal modal"
                actions={
                  <CanvasBtn
                    theme={th}
                    size="xs"
                    variant="ghost"
                    onClick={() => setShowCreateCard(false)}
                  >
                    收合
                  </CanvasBtn>
                }
              >
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    setFlash(null);
                    runAction(
                      issueTenantApiKeyAction,
                      buildCreateFormData(
                        draftName,
                        draftExpiresAt,
                        draftScopes,
                      ),
                      {
                        onSuccess: () => {
                          setShowCreateCard(false);
                          resetCreateDraft();
                        },
                        reason: draftReason,
                        secretSource: {
                          apiKeyId: "pending",
                          tenantId: governance?.tenantId ?? "tenant-demo-001",
                          keyName: draftName,
                          keyPrefix: "",
                          maskedSuffix: "",
                          scopes: draftScopes,
                          lastUsedAt: null,
                          expiresAt: draftExpiresAt || null,
                          revokedAt: null,
                          createdAt: new Date().toISOString(),
                        },
                      },
                    );
                  }}
                >
                  <div style={fieldGridStyle}>
                    <CanvasField theme={th} label="名稱" required>
                      <input
                        value={draftName}
                        onChange={(event) => setDraftName(event.target.value)}
                        placeholder="production-booking-sync"
                        required
                        style={nativeInputStyle}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={th}
                      label="到期時間"
                      hint={
                        governance
                          ? `需帶時區。預設 ${governance.apiKeyPolicy.defaultLifetimeDays} 天，最長 ${governance.apiKeyPolicy.maxLifetimeDays} 天。`
                          : "Governance package 未載入，無法確認預設有效期。"
                      }
                    >
                      <input
                        value={draftExpiresAt}
                        onChange={(event) =>
                          setDraftExpiresAt(event.target.value)
                        }
                        placeholder="2026-08-09T01:52:30Z"
                        spellCheck={false}
                        style={nativeMonoInputStyle}
                      />
                    </CanvasField>
                  </div>

                  <div style={{ height: 12 }} />

                  <CanvasField
                    theme={th}
                    label="Scopes"
                    required
                    hint="依 least-privilege 選擇；至少一個 scope。"
                  >
                    <div style={scopeGridStyle}>
                      {allowedScopes.length > 0 ? (
                        allowedScopes.map((scope: string) => {
                          const selected = draftScopes.includes(scope);
                          return (
                            <label
                              key={scope}
                              style={getScopeChipStyle(selected)}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleScope(scope)}
                                style={{ display: "none" }}
                              />
                              <span>{scope}</span>
                            </label>
                          );
                        })
                      ) : (
                        <span style={helperTextStyle}>
                          Governance package 尚未可用，暫時不能建立金鑰。
                        </span>
                      )}
                    </div>
                  </CanvasField>

                  <div style={{ height: 12 }} />

                  <CanvasField
                    theme={th}
                    label="建立原因"
                    hint="High-risk action 需留下 operator reason；目前會附在成功 receipt 描述中。"
                    required
                  >
                    <textarea
                      value={draftReason}
                      onChange={(event) => setDraftReason(event.target.value)}
                      style={textareaStyle}
                      placeholder="例如：new production integration for booking partner"
                    />
                  </CanvasField>

                  <div style={{ height: 14 }} />

                  <div style={modalFooterStyle}>
                    <span style={helperTextStyle}>
                      full key 只會顯示一次；請在 reveal modal 內 copy 或下載。
                    </span>
                    <button
                      type="submit"
                      disabled={
                        pending ||
                        draftName.trim().length === 0 ||
                        draftReason.trim().length === 0 ||
                        draftScopes.length === 0 ||
                        !governance
                      }
                      style={{
                        ...primaryButtonStyle,
                        opacity:
                          pending ||
                          draftName.trim().length === 0 ||
                          draftReason.trim().length === 0 ||
                          draftScopes.length === 0 ||
                          !governance
                            ? 0.55
                            : 1,
                        cursor:
                          pending ||
                          draftName.trim().length === 0 ||
                          draftReason.trim().length === 0 ||
                          draftScopes.length === 0 ||
                          !governance
                            ? "not-allowed"
                            : "pointer",
                      }}
                    >
                      {pending ? "建立中..." : "建立金鑰"}
                    </button>
                  </div>
                </form>
              </CanvasCard>
            ) : null}

            {showPolicyCard ? (
              <CanvasCard
                theme={th}
                title="Governance package"
                subtitle="Published integration policy snapshot"
                actions={
                  <CanvasBtn
                    theme={th}
                    size="xs"
                    variant="ghost"
                    onClick={() => setShowPolicyCard(false)}
                  >
                    收合
                  </CanvasBtn>
                }
              >
                {governance ? (
                  <>
                    <CanvasDL
                      theme={th}
                      cols={2}
                      items={[
                        {
                          k: "Default lifetime",
                          v: `${governance.apiKeyPolicy.defaultLifetimeDays} days`,
                          mono: true,
                        },
                        {
                          k: "Maximum lifetime",
                          v: `${governance.apiKeyPolicy.maxLifetimeDays} days`,
                          mono: true,
                        },
                        {
                          k: "Expiry",
                          v: governance.apiKeyPolicy.requireExpiry
                            ? "required"
                            : "optional",
                          mono: true,
                        },
                        {
                          k: "Revoke effect",
                          v: governance.apiKeyPolicy.revokeEffect,
                          mono: true,
                        },
                        {
                          k: "Break-glass",
                          v: governance.apiKeyPolicy
                            .breakGlassRequiresPlatformApproval
                            ? "platform approval"
                            : "not published",
                          mono: true,
                        },
                        {
                          k: "Generated",
                          v: formatDateTime(governance.generatedAt),
                          mono: true,
                        },
                      ]}
                    />
                    <div style={{ height: 14 }} />
                    <div style={sectionLabelStyle}>Allowed scopes</div>
                    <div style={scopeGridStyle}>
                      {allowedScopes.map((scope: string) => (
                        <CanvasPill key={scope} theme={th} tone="info">
                          {scope}
                        </CanvasPill>
                      ))}
                    </div>
                    {compatibilityAliases.length > 0 ? (
                      <>
                        <div style={{ height: 14 }} />
                        <div style={sectionLabelStyle}>
                          Compatibility aliases
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          {compatibilityAliases.map(([alias, target]) => (
                            <div
                              key={`${alias}-${target}`}
                              style={monoCodeStyle}
                            >
                              {alias} {"->"} {target}
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </>
                ) : (
                  <CanvasBanner
                    theme={th}
                    tone="warn"
                    icon="warn"
                    title="Governance package unavailable"
                    body="沒有治理封包時不能安全 issue 新金鑰，因為 scope 與 lifetime 上限不可驗證。"
                  />
                )}
              </CanvasCard>
            ) : null}
          </div>
        )}

        <CanvasCard
          theme={th}
          title="搜尋與篩選"
          subtitle="must-show data: search by name, filter by status"
        >
          <div style={toolRowStyle}>
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
                style={selectStyle}
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
              onClick={() => {
                setQuery("");
                setStatusFilter("all");
              }}
            >
              清除篩選
            </CanvasBtn>
            <CanvasPill theme={th} tone="neutral">
              {filteredKeys.length} result{filteredKeys.length === 1 ? "" : "s"}
            </CanvasPill>
          </div>
        </CanvasCard>

        <CanvasCard theme={th} padding={0} title="金鑰清單">
          {emptyState ? (
            <div style={tableEmptyStyle}>
              <div style={emptyPanelStyle}>
                <div style={emptyBadgeRowStyle}>
                  <CanvasPill theme={th} tone={emptyState.tone}>
                    {effectiveEmptyReason}
                  </CanvasPill>
                  {emptyReasonOverride ? (
                    <CanvasPill theme={th} tone="accent">
                      override active
                    </CanvasPill>
                  ) : null}
                </div>
                <h3 style={emptyPanelTitleStyle}>{emptyState.title}</h3>
                <p style={emptyPanelBodyStyle}>{emptyState.body}</p>
                <div style={inlineActionsStyle}>
                  {emptyState.action ? (
                    <CanvasBtn
                      theme={th}
                      size="sm"
                      variant="primary"
                      disabled={!emptyState.action.enabled}
                      onClick={() => setShowCreateCard(true)}
                    >
                      {emptyState.ctaLabel}
                    </CanvasBtn>
                  ) : emptyState.ctaLabel === "立即重整" ? (
                    <CanvasBtn
                      theme={th}
                      size="sm"
                      variant="primary"
                      onClick={() => router.refresh()}
                    >
                      {emptyState.ctaLabel}
                    </CanvasBtn>
                  ) : emptyState.ctaHref ? (
                    emptyState.ctaHref.startsWith("http") ? (
                      <a
                        href={emptyState.ctaHref}
                        target="_blank"
                        rel="noreferrer"
                        style={{ ...navLinkStyle, justifyContent: "center" }}
                      >
                        {emptyState.ctaLabel}
                      </a>
                    ) : (
                      <Link
                        href={emptyState.ctaHref}
                        style={{ ...navLinkStyle, justifyContent: "center" }}
                      >
                        {emptyState.ctaLabel}
                      </Link>
                    )
                  ) : (
                    <CanvasBtn
                      theme={th}
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        setQuery("");
                        setStatusFilter("all");
                      }}
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

        <div style={utilityGridStyle}>
          <CanvasCard
            theme={th}
            title="整合 sitemap"
            subtitle="entry / exits from spec"
          >
            <div style={navListStyle}>
              {integrationLinks.map((item) => (
                <Link key={item.href} href={item.href} style={navLinkStyle}>
                  <span>
                    <strong>{item.label}</strong>
                    <span
                      style={{
                        display: "block",
                        color: th.textMuted,
                        marginTop: 2,
                      }}
                    >
                      {item.note}
                    </span>
                  </span>
                  <span style={monoCodeStyle}>{item.href}</span>
                </Link>
              ))}
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="EmptyReason coverage"
            subtitle="6 states rendered distinctly via query override"
          >
            <div style={emptyReasonGridStyle}>
              {supportedEmptyReasons.map((reasonCode) => (
                <Link
                  key={reasonCode}
                  href={`/api-keys?emptyReason=${reasonCode}`}
                  style={{
                    ...navLinkStyle,
                    flexDirection: "column",
                    alignItems: "flex-start",
                  }}
                >
                  <CanvasPill
                    theme={th}
                    tone={
                      reasonCode === effectiveEmptyReason ? "accent" : "neutral"
                    }
                  >
                    {reasonCode}
                  </CanvasPill>
                  <span style={{ color: th.textMuted, fontSize: 11.5 }}>
                    {emptyCatalog[reasonCode]?.title ?? reasonCode}
                  </span>
                </Link>
              ))}
            </div>
            {emptyReasonOverride ? (
              <div style={{ marginTop: 12 }}>
                <Link
                  href="/api-keys"
                  style={{ ...navLinkStyle, justifyContent: "center" }}
                >
                  清除 emptyReason override
                </Link>
              </div>
            ) : null}
          </CanvasCard>
        </div>
      </div>

      {confirmIntent ? (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={modalHeaderStyle}>
              <div>
                <h2 style={modalTitleStyle}>
                  {confirmIntent.kind === "rotate"
                    ? "輪替 API 金鑰"
                    : "撤銷 API 金鑰"}
                </h2>
                <p style={modalBodyTextStyle}>
                  {confirmIntent.kind === "rotate"
                    ? "輪替會立即作廢當前憑證，並在成功後只顯示一次新的 plaintext。"
                    : "撤銷後不可回復，所有使用此憑證的整合會立即失敗。"}
                </p>
              </div>
              <CanvasBtn
                theme={th}
                size="xs"
                variant="ghost"
                onClick={() => setConfirmIntent(null)}
              >
                關閉
              </CanvasBtn>
            </div>

            <CanvasDL
              theme={th}
              cols={2}
              items={[
                { k: "Name", v: confirmIntent.apiKey.keyName },
                { k: "ApiKeyId", v: confirmIntent.apiKey.apiKeyId, mono: true },
                {
                  k: "Scopes",
                  v: confirmIntent.apiKey.scopes.join(" · "),
                  mono: true,
                },
                {
                  k: "Expires",
                  v: formatDateTime(confirmIntent.apiKey.expiresAt),
                  mono: true,
                },
              ]}
            />

            <CanvasField
              theme={th}
              label="操作原因"
              hint="High-risk action requires a reason for operator context and receipt copy."
              required
            >
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                style={textareaStyle}
                placeholder="例如：production key exposed in CI log，立即輪替"
              />
            </CanvasField>

            <div style={modalFooterStyle}>
              <span style={helperTextStyle}>
                availableActions 要求高風險操作收集
                reason；目前會寫入操作流程但後端 receipt 尚未承載該欄位。
              </span>
              <div style={inlineActionsStyle}>
                <button
                  type="button"
                  style={secondaryButtonStyle}
                  onClick={() => setConfirmIntent(null)}
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={pending || reason.trim().length === 0}
                  style={{
                    ...primaryButtonStyle,
                    background:
                      confirmIntent.kind === "revoke" ? th.danger : th.accent,
                    borderColor:
                      confirmIntent.kind === "revoke" ? th.danger : th.accent,
                    opacity: pending || reason.trim().length === 0 ? 0.55 : 1,
                    cursor:
                      pending || reason.trim().length === 0
                        ? "not-allowed"
                        : "pointer",
                  }}
                  onClick={() => {
                    const currentIntent = confirmIntent;
                    const currentReason = reason.trim();
                    setConfirmIntent(null);
                    if (currentIntent.kind === "rotate") {
                      runAction(
                        rotateTenantApiKeyAction,
                        buildRotateFormData(currentIntent.apiKey),
                        {
                          reason: currentReason,
                          secretSource: currentIntent.apiKey,
                        },
                      );
                    } else {
                      runAction(
                        revokeTenantApiKeyAction,
                        buildRevokeFormData(currentIntent.apiKey),
                        { reason: currentReason },
                      );
                    }
                    setReason("");
                  }}
                >
                  {pending
                    ? "處理中..."
                    : confirmIntent.kind === "rotate"
                      ? "確認輪替"
                      : "確認撤銷"}
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
                { k: "Scopes", v: secretReveal.scopes.join(" · "), mono: true },
                {
                  k: "Refresh tier",
                  v: REFRESH_LABELS[refreshTier],
                  mono: true,
                },
              ]}
            />

            <code style={plaintextKeyStyle}>{secretReveal.plaintextKey}</code>

            <div style={inlineActionsStyle}>
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
