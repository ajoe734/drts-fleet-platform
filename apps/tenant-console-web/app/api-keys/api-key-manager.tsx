"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  EmptyReason,
  IdentityContext,
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
import { useTranslation } from "@/lib/i18n";
import type { Locale } from "@/lib/translations";
import {
  issueTenantApiKeyAction,
  revokeTenantApiKeyAction,
  rotateTenantApiKeyAction,
} from "./actions";
import type {
  ApiKeyActionKind,
  ApiKeyFlashPayload,
  ApiKeyPageErrorCode,
} from "./constants";

type ApiKeyManagerProps = {
  apiKeys: TenantApiKeyRecord[];
  governance: TenantIntegrationGovernancePackage | null;
  identity: IdentityContext | null;
  availableActions: ResourceActionDescriptor[];
  initialEmptyReason: EmptyReason | null;
  loadedAt: string;
  errors: ApiKeyPageErrorCode[];
};

type ApiKeyState = "active" | "expiring" | "expired" | "revoked";
type ApiKeyStatusFilter = "all" | ApiKeyState;
type EditorMode = "issue" | "rotate";
type ApiKeyRow = TenantApiKeyRecord & Record<string, unknown>;
type EmptyStateConfig = {
  title: string;
  body: string;
  tone: CanvasTone;
  badge: string;
};

const th = buildCanvasTheme({
  surface: "tenant",
  dark: false,
  density: "compact",
});

const REFRESH_INTERVAL_MS = 30_000;

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const overviewGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const actionLaneStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.6fr) minmax(300px, 1fr)",
  gap: 16,
};

const secondaryCardGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
};

const fieldGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const compactFieldGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  alignItems: "end",
};

const scopeGridStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const nativeInputStyle: CSSProperties = {
  width: "100%",
  background: th.bgRaised,
  border: `1px solid ${th.border}`,
  borderRadius: 7,
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

const formFooterStyle: CSSProperties = {
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
  padding: "5px 10px",
  fontSize: 12,
  height: 28,
  fontWeight: 500,
  background: th.accent,
  color: "#fff",
  border: `1px solid ${th.accent}`,
  borderRadius: 7,
  cursor: "pointer",
  lineHeight: 1,
  fontFamily: th.fontFamily,
};

const formNoteStyle: CSSProperties = {
  fontSize: 11,
  color: th.textMuted,
  lineHeight: 1.5,
};

const sectionLabelStyle: CSSProperties = {
  marginBottom: 8,
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: th.textMuted,
};

const actionCatalogStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const actionDescriptorStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: 12,
  borderRadius: 10,
  border: `1px solid ${th.border}`,
  background: th.surface,
};

const descriptorTitleRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "center",
};

const inlineActionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const textLinkStyle: CSSProperties = {
  color: th.accent,
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 500,
};

const nameCellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  minWidth: 0,
};

const namePrimaryStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
};

const nameMetaRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
  fontSize: 11,
  color: th.textDim,
  fontFamily: th.monoFamily,
};

const inlineActionStyle: CSSProperties = {
  padding: 0,
  border: 0,
  background: "transparent",
  color: th.accent,
  fontSize: 11,
  fontFamily: th.fontFamily,
  cursor: "pointer",
};

const dividerStyle: CSSProperties = {
  color: th.textDim,
};

const scopeTextStyle: CSSProperties = {
  whiteSpace: "normal",
  lineHeight: 1.45,
};

const emptyStateStyle: CSSProperties = {
  padding: "28px 24px",
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
};

const emptyStateBodyStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
  maxWidth: 520,
  margin: "0 auto",
};

const secretBodyStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const plaintextKeyStyle: CSSProperties = {
  display: "block",
  background: "rgba(6, 11, 19, 0.72)",
  border: `1px solid ${th.border}`,
  borderRadius: 7,
  padding: "10px 12px",
  color: th.text,
  fontSize: 12,
  fontFamily: th.monoFamily,
  overflowX: "auto",
};

const checkboxRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  fontSize: 12,
  color: th.text,
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(7, 12, 20, 0.74)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  zIndex: 60,
};

const modalPanelStyle: CSSProperties = {
  width: "min(680px, 100%)",
  maxHeight: "calc(100vh - 40px)",
  overflowY: "auto",
  borderRadius: 14,
  border: `1px solid ${th.border}`,
  background: th.bg,
  boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
};

const modalHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  padding: "18px 20px 12px",
  borderBottom: `1px solid ${th.border}`,
};

const modalBodyStyle: CSSProperties = {
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const modalFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
  padding: "0 20px 20px",
};

const deepLinkListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const deepLinkItemStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${th.border}`,
  background: th.surface,
};

const deepLinkMetaStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  minWidth: 0,
};

const aliasListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 16,
  color: th.text,
  fontSize: 12,
  lineHeight: 1.5,
};

function getIntlLocale(locale: Locale) {
  return locale === "zh" ? "zh-Hant" : "en-US";
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
    if (millisUntilExpiry <= 7 * 24 * 60 * 60 * 1000) {
      return "expiring";
    }
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

function getApiKeyStateLabel(
  state: ApiKeyState,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  return t(`apiKeys.state.${state}`);
}

function getScopeChipStyle(selected: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    border: `1px solid ${selected ? th.accent : th.border}`,
    background: selected ? "rgba(34, 197, 94, 0.14)" : th.surface,
    color: selected ? th.text : th.textMuted,
    cursor: "pointer",
    fontSize: 11.5,
    fontFamily: th.monoFamily,
  };
}

function getActionTone(action: ApiKeyActionKind): CanvasTone {
  return action === "revoke" ? "danger" : action === "rotate" ? "warn" : "info";
}

function getRiskLabel(
  action: ResourceActionDescriptor["riskLevel"],
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  if (action === "high") return t("apiKeys.risk.high");
  if (action === "medium") return t("apiKeys.risk.medium");
  return t("apiKeys.risk.low");
}

function getActionLabel(
  action: ApiKeyActionKind,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  switch (action) {
    case "issue":
      return t("apiKeys.action.issue");
    case "rotate":
      return t("apiKeys.action.rotate");
    case "revoke":
      return t("apiKeys.action.revoke");
  }
}

function getActionDescription(
  action: ApiKeyActionKind,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  switch (action) {
    case "issue":
      return t("apiKeys.action.issueDescription");
    case "rotate":
      return t("apiKeys.action.rotateDescription");
    case "revoke":
      return t("apiKeys.action.revokeDescription");
  }
}

function getActionByKind(
  availableActions: ResourceActionDescriptor[],
  kind: ApiKeyActionKind,
) {
  return availableActions.find((entry) => entry.action === kind) ?? null;
}

function formatRelativeAge(
  fromIso: string,
  nowMs: number,
  relativeTimeFormatter: Intl.RelativeTimeFormat,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  const timestamp = new Date(fromIso).getTime();
  if (Number.isNaN(timestamp)) return t("apiKeys.time.unknown");
  const diffSeconds = Math.round((timestamp - nowMs) / 1000);
  if (Math.abs(diffSeconds) < 60) {
    return relativeTimeFormatter.format(diffSeconds, "second");
  }
  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) {
    return relativeTimeFormatter.format(diffMinutes, "minute");
  }
  const diffHours = Math.round(diffMinutes / 60);
  return relativeTimeFormatter.format(diffHours, "hour");
}

function buildCreateFormData(
  keyName: string,
  expiresAt: string,
  scopes: string[],
) {
  const formData = new FormData();
  formData.set("keyName", keyName);
  if (expiresAt.trim().length > 0) {
    formData.set("expiresAt", expiresAt);
  }
  scopes.forEach((scope) => formData.append("scopes", scope));
  return formData;
}

function buildRotateFormData(
  apiKey: TenantApiKeyRecord,
  keyName: string,
  expiresAt: string,
  scopes: string[],
) {
  const formData = new FormData();
  formData.set("apiKeyId", apiKey.apiKeyId);
  formData.set("keyName", keyName);
  if (expiresAt.trim().length > 0) {
    formData.set("expiresAt", expiresAt);
  }
  scopes.forEach((scope) => formData.append("scopes", scope));
  return formData;
}

function buildRevokeFormData(apiKey: TenantApiKeyRecord, reason: string) {
  const formData = new FormData();
  formData.set("apiKeyId", apiKey.apiKeyId);
  formData.set("keyName", apiKey.keyName);
  formData.set("reason", reason);
  return formData;
}

function toSearchableRow(row: TenantApiKeyRecord) {
  return [
    row.keyName,
    row.apiKeyId,
    row.keyPrefix,
    row.maskedSuffix,
    row.scopes.join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

function buildEmptyStateCopy(
  reason: EmptyReason | null,
  t: (key: string, params?: Record<string, string | number>) => string,
): EmptyStateConfig {
  switch (reason) {
    case "filtered_empty":
      return {
        title: t("apiKeys.empty.filtered.title"),
        body: t("apiKeys.empty.filtered.body"),
        tone: "neutral",
        badge: t("apiKeys.empty.filtered.badge"),
      };
    case "fetch_failed":
      return {
        title: t("apiKeys.empty.fetchFailed.title"),
        body: t("apiKeys.empty.fetchFailed.body"),
        tone: "warn",
        badge: t("apiKeys.empty.fetchFailed.badge"),
      };
    case "permission_denied":
      return {
        title: t("apiKeys.empty.permissionDenied.title"),
        body: t("apiKeys.empty.permissionDenied.body"),
        tone: "danger",
        badge: t("apiKeys.empty.permissionDenied.badge"),
      };
    case "external_unavailable":
      return {
        title: t("apiKeys.empty.externalUnavailable.title"),
        body: t("apiKeys.empty.externalUnavailable.body"),
        tone: "warn",
        badge: t("apiKeys.empty.externalUnavailable.badge"),
      };
    case "not_provisioned":
      return {
        title: t("apiKeys.empty.notProvisioned.title"),
        body: t("apiKeys.empty.notProvisioned.body"),
        tone: "info",
        badge: t("apiKeys.empty.notProvisioned.badge"),
      };
    case "no_data":
    default:
      return {
        title: t("apiKeys.empty.noData.title"),
        body: t("apiKeys.empty.noData.body"),
        tone: "info",
        badge: t("apiKeys.empty.noData.badge"),
      };
  }
}

function getActionDisabledReasonLabel(
  code: string | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  if (!code) {
    return t("apiKeys.action.disabledReason.unknown");
  }
  const key = `apiKeys.action.disabledReason.${code}`;
  const translated = t(key);
  return translated === key
    ? t("apiKeys.action.disabledReason.unknown")
    : translated;
}

function getPageErrorLabel(
  code: ApiKeyPageErrorCode,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  switch (code) {
    case "apiKeysLoadFailed":
      return t("apiKeys.error.apiKeysLoadFailed");
    case "governanceLoadFailed":
      return t("apiKeys.error.governanceLoadFailed");
    case "identityLoadFailed":
      return t("apiKeys.error.identityLoadFailed");
  }
}

function downloadPlaintextKey(
  keyName: string,
  plaintextKey: string,
  fallbackName: string,
  issuedAtLabel: string,
) {
  const blob = new Blob(
    [`${keyName}\n${plaintextKey}\n${issuedAtLabel}: ${new Date().toISOString()}\n`],
    { type: "text/plain;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${keyName.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase() || fallbackName}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ApiKeyManager({
  apiKeys,
  governance,
  identity,
  availableActions,
  initialEmptyReason,
  loadedAt,
  errors,
}: ApiKeyManagerProps) {
  const router = useRouter();
  const { locale, t } = useTranslation();
  const [flash, setFlash] = useState<ApiKeyFlashPayload | null>(null);
  const [pending, startTransition] = useTransition();
  const [nowMs, setNowMs] = useState(() => {
    const loadedAtMs = new Date(loadedAt).getTime();
    return Number.isFinite(loadedAtMs) ? loadedAtMs : 0;
  });
  const [statusFilter, setStatusFilter] = useState<ApiKeyStatusFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode | null>(null);
  const [selectedKey, setSelectedKey] = useState<TenantApiKeyRecord | null>(
    null,
  );
  const [draftName, setDraftName] = useState("");
  const [draftExpiresAt, setDraftExpiresAt] = useState("");
  const [draftScopes, setDraftScopes] = useState<string[]>(
    governance?.apiKeyPolicy.allowedScopes ?? [],
  );
  const [keyStoredConfirmed, setKeyStoredConfirmed] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [revokeTarget, setRevokeTarget] = useState<TenantApiKeyRecord | null>(
    null,
  );
  const [revokeReason, setRevokeReason] = useState("");
  const intlLocale = useMemo(() => getIntlLocale(locale), [locale]);
  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(intlLocale, {
        dateStyle: "short",
        timeStyle: "short",
      }),
    [intlLocale],
  );
  const relativeTimeFormatter = useMemo(
    () =>
      new Intl.RelativeTimeFormat(intlLocale, {
        numeric: "auto",
      }),
    [intlLocale],
  );

  function formatDateTime(value: string | null | undefined) {
    if (!value) return t("apiKeys.table.notAvailable");
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return t("apiKeys.table.notAvailable");
    return dateTimeFormatter
      .format(parsed)
      .replace(/[\u00a0\u202f\u2009]/g, " ");
  }

  const allowedScopeSignature = (
    governance?.apiKeyPolicy.allowedScopes ?? []
  ).join("\u0000");
  const allowedScopes = useMemo(
    () =>
      allowedScopeSignature.length > 0
        ? allowedScopeSignature.split("\u0000")
        : [],
    [allowedScopeSignature],
  );
  const compatibilityAliases: Array<[string, string]> = Object.entries(
    governance?.apiKeyPolicy.compatibilityAliases ?? {},
  );
  const sortedKeys = useMemo(
    () =>
      [...apiKeys].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      ),
    [apiKeys],
  );

  const kpis = useMemo(() => {
    let active = 0;
    let expiring = 0;
    let expired = 0;
    let revoked = 0;
    for (const key of apiKeys) {
      const state = resolveApiKeyState(key);
      if (state === "active") active += 1;
      if (state === "expiring") expiring += 1;
      if (state === "expired") expired += 1;
      if (state === "revoked") revoked += 1;
    }
    return { active, expiring, expired, revoked };
  }, [apiKeys]);

  const filteredKeys = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return sortedKeys.filter((key) => {
      const state = resolveApiKeyState(key);
      if (statusFilter !== "all" && state !== statusFilter) {
        return false;
      }
      if (!keyword) return true;
      return toSearchableRow(key).includes(keyword);
    });
  }, [searchTerm, sortedKeys, statusFilter]);

  const effectiveEmptyReason =
    filteredKeys.length > 0
      ? null
      : searchTerm.trim().length > 0 || statusFilter !== "all"
        ? "filtered_empty"
        : initialEmptyReason;

  const issueAction = getActionByKind(availableActions, "issue");
  const rotateAction = getActionByKind(availableActions, "rotate");
  const revokeAction = getActionByKind(availableActions, "revoke");
  const refreshAgeMs = Math.max(0, nowMs - new Date(loadedAt).getTime());
  const refreshStateTone: CanvasTone =
    refreshAgeMs >= REFRESH_INTERVAL_MS ? "warn" : "success";

  useEffect(() => {
    setEditorMode(issueAction?.enabled ? "issue" : null);
  }, [issueAction?.enabled]);

  useEffect(() => {
    const nextScopes = selectedKey?.scopes?.length
      ? selectedKey.scopes.filter((scope: string) =>
          allowedScopes.includes(scope),
        )
      : allowedScopes;
    setDraftScopes(
      nextScopes.length > 0 ? [...nextScopes] : [...allowedScopes],
    );
    setDraftName(selectedKey?.keyName ?? "");
    setDraftExpiresAt(selectedKey?.expiresAt ?? "");
  }, [allowedScopes, selectedKey]);

  useEffect(() => {
    if (!flash?.plaintextKey) {
      setKeyStoredConfirmed(false);
      setCopyState("idle");
    }
  }, [flash]);

  useEffect(() => {
    setNowMs(Date.now());
    const ageTicker = window.setInterval(() => setNowMs(Date.now()), 5_000);
    const refreshTicker = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }
      router.refresh();
    }, REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(ageTicker);
      window.clearInterval(refreshTicker);
    };
  }, [router]);

  function toggleScope(scope: string) {
    setDraftScopes((current) =>
      current.includes(scope)
        ? current.filter((value) => value !== scope)
        : [...current, scope],
    );
  }

  function openIssueEditor() {
    setSelectedKey(null);
    setEditorMode("issue");
    setFlash(null);
  }

  function openRotateEditor(apiKey: TenantApiKeyRecord) {
    setSelectedKey(apiKey);
    setEditorMode("rotate");
    setFlash(null);
  }

  function closeEditor() {
    setEditorMode(null);
    setSelectedKey(null);
  }

  function runAction(
    action: (formData: FormData) => Promise<ApiKeyFlashPayload>,
    formData: FormData,
    options?: { onSuccess?: () => void },
  ) {
    startTransition(async () => {
      const result = await action(formData);
      setFlash(result);
      if (result.tone === "default") {
        options?.onSuccess?.();
        router.refresh();
      }
    });
  }

  function submitEditor() {
    if (editorMode === "rotate" && selectedKey) {
      runAction(
        rotateTenantApiKeyAction,
        buildRotateFormData(
          selectedKey,
          draftName,
          draftExpiresAt,
          draftScopes,
        ),
        {
          onSuccess: () => {
            closeEditor();
          },
        },
      );
      return;
    }

    runAction(
      issueTenantApiKeyAction,
      buildCreateFormData(draftName, draftExpiresAt, draftScopes),
      {
        onSuccess: () => {
          closeEditor();
          setDraftName("");
          setDraftExpiresAt("");
          setDraftScopes([...allowedScopes]);
        },
      },
    );
  }

  async function handleCopyPlaintextKey() {
    if (!flash?.plaintextKey) return;
    await navigator.clipboard.writeText(flash.plaintextKey);
    setCopyState("copied");
  }

  function renderActionCatalog() {
    const supportedActions = [...availableActions].sort((left, right) => {
      const order: ApiKeyActionKind[] = ["issue", "rotate", "revoke"];
      return (
        order.indexOf(left.action as ApiKeyActionKind) -
        order.indexOf(right.action as ApiKeyActionKind)
      );
    });
    return (
      <div style={actionCatalogStyle}>
        {supportedActions.map((action) => {
          const actionKind = action.action as ApiKeyActionKind;
          return (
            <div key={actionKind} style={actionDescriptorStyle}>
              <div style={descriptorTitleRowStyle}>
                <strong>{getActionLabel(actionKind, t)}</strong>
                <CanvasPill theme={th} tone={getActionTone(actionKind)}>
                  {getRiskLabel(action.riskLevel, t)}
                </CanvasPill>
              </div>
              <div style={formNoteStyle}>
                {getActionDescription(actionKind, t)}
              </div>
              {action.enabled === false ? (
                <div style={formNoteStyle}>
                  {t("apiKeys.action.disabledReason.label")}:{" "}
                  {getActionDisabledReasonLabel(action.disabledReasonCode, t)}
                </div>
              ) : (
                <div style={formNoteStyle}>
                  {t("apiKeys.action.available")}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function renderEmptyState() {
    const copy = buildEmptyStateCopy(effectiveEmptyReason, t);
    return (
      <div style={emptyStateStyle}>
        <div style={emptyStateBodyStyle}>
          <CanvasPill theme={th} tone={copy.tone}>
            {copy.badge}
          </CanvasPill>
          <strong style={{ color: th.text }}>{copy.title}</strong>
          <span>{copy.body}</span>
          <div style={inlineActionRowStyle}>
            {effectiveEmptyReason === "filtered_empty" ? (
              <CanvasBtn
                theme={th}
                size="sm"
                onClick={() => {
                  setSearchTerm("");
                  setStatusFilter("all");
                }}
              >
                {t("apiKeys.empty.action.clearFilters")}
              </CanvasBtn>
            ) : null}
            {effectiveEmptyReason === "fetch_failed" ||
            effectiveEmptyReason === "external_unavailable" ? (
              <CanvasBtn theme={th} size="sm" onClick={() => router.refresh()}>
                {t("apiKeys.empty.action.refresh")}
              </CanvasBtn>
            ) : null}
            {(effectiveEmptyReason === "no_data" ||
              effectiveEmptyReason === "not_provisioned") &&
            issueAction ? (
              <CanvasBtn
                theme={th}
                size="sm"
                variant="primary"
                disabled={!issueAction.enabled}
                onClick={() => openIssueEditor()}
              >
                {getActionLabel("issue", t)}
              </CanvasBtn>
            ) : null}
            {effectiveEmptyReason === "permission_denied" ? (
              <Link href="/users" style={textLinkStyle}>
                {t("apiKeys.empty.action.checkAccess")}
              </Link>
            ) : null}
            {effectiveEmptyReason === "not_provisioned" ? (
              <>
                <Link href="/integration-governance" style={textLinkStyle}>
                  {t("apiKeys.empty.action.integrationGovernance")}
                </Link>
                <Link href="/webhooks" style={textLinkStyle}>
                  {t("apiKeys.empty.action.webhooks")}
                </Link>
              </>
            ) : null}
            <Link href="/audit" style={textLinkStyle}>
              {t("apiKeys.empty.action.audit")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const columns: CanvasTableColumn<ApiKeyRow>[] = [
    {
      h: t("apiKeys.table.column.name"),
      w: 290,
      r: (row) => {
        const state = resolveApiKeyState(row);
        return (
          <div style={nameCellStyle}>
            <span style={namePrimaryStyle}>{row.keyName}</span>
            <div style={nameMetaRowStyle}>
              <span>{row.apiKeyId}</span>
              {state === "revoked" ? (
                <span>
                  {t("apiKeys.table.revokedAt", {
                    timestamp: formatDateTime(row.revokedAt),
                  })}
                </span>
              ) : (
                <>
                  <button
                    disabled={pending || !rotateAction?.enabled}
                    onClick={() => openRotateEditor(row)}
                    style={{
                      ...inlineActionStyle,
                      cursor:
                        pending || !rotateAction?.enabled
                          ? "not-allowed"
                          : "pointer",
                      opacity: pending || !rotateAction?.enabled ? 0.55 : 1,
                    }}
                    type="button"
                  >
                    {t("apiKeys.table.action.rotate")}
                  </button>
                  <span style={dividerStyle}>/</span>
                  <button
                    disabled={pending || !revokeAction?.enabled}
                    onClick={() => {
                      setRevokeTarget(row);
                      setRevokeReason("");
                    }}
                    style={{
                      ...inlineActionStyle,
                      color: th.danger,
                      cursor:
                        pending || !revokeAction?.enabled
                          ? "not-allowed"
                          : "pointer",
                      opacity: pending || !revokeAction?.enabled ? 0.55 : 1,
                    }}
                    type="button"
                  >
                    {t("apiKeys.table.action.revoke")}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      },
    },
    {
      h: t("apiKeys.table.column.prefix"),
      k: "keyPrefix",
      w: 110,
      mono: true,
    },
    {
      h: t("apiKeys.table.column.mask"),
      w: 120,
      mono: true,
      r: (row) => `••••${row.maskedSuffix}`,
    },
    {
      h: t("apiKeys.table.column.scope"),
      w: 270,
      mono: true,
      r: (row) => (
        <div style={scopeTextStyle}>
          {row.scopes.length > 0
            ? row.scopes.join(" · ")
            : t("apiKeys.table.notAvailable")}
        </div>
      ),
    },
    {
      h: t("apiKeys.table.column.lastUsed"),
      w: 142,
      mono: true,
      r: (row) => formatDateTime(row.lastUsedAt),
    },
    {
      h: t("apiKeys.table.column.expiresAt"),
      w: 142,
      mono: true,
      r: (row) => formatDateTime(row.expiresAt),
    },
    {
      h: t("apiKeys.table.column.revokedAt"),
      w: 142,
      mono: true,
      r: (row) => formatDateTime(row.revokedAt),
    },
    {
      h: t("apiKeys.table.column.state"),
      w: 108,
      r: (row) => {
        const state = resolveApiKeyState(row);
        return (
          <CanvasPill theme={th} tone={getApiKeyStateTone(state)} dot>
            {getApiKeyStateLabel(state, t)}
          </CanvasPill>
        );
      },
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title={t("apiKeys.page.title")}
        subtitle={t("apiKeys.page.subtitle")}
        tabs={[
          t("apiKeys.tab.list"),
          t("apiKeys.tab.editor"),
          t("apiKeys.tab.governance"),
        ]}
        activeTab={t("apiKeys.tab.list")}
        actions={
          <>
            <CanvasBtn theme={th} icon="ext" size="sm">
              {t("apiKeys.page.docs")}
            </CanvasBtn>
            <CanvasBtn theme={th} size="sm" onClick={() => router.refresh()}>
              {t("apiKeys.page.refresh")}
            </CanvasBtn>
            <CanvasBtn
              theme={th}
              variant="primary"
              icon="plus"
              size="sm"
              disabled={!issueAction?.enabled}
              onClick={() => openIssueEditor()}
            >
              {t("apiKeys.page.issue")}
            </CanvasBtn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        <CanvasBanner
          theme={th}
          tone="info"
          icon="warn"
          title={t("apiKeys.banner.plaintextOnce.title")}
          body={t("apiKeys.banner.plaintextOnce.body")}
        />

        <CanvasBanner
          theme={th}
          tone={refreshStateTone}
          icon="clock"
          title={t("apiKeys.banner.refresh.title", {
            recommendation:
              refreshAgeMs >= REFRESH_INTERVAL_MS
                ? ` · ${t("apiKeys.banner.refresh.recommendation")}`
                : "",
          })}
          body={t("apiKeys.banner.refresh.body", {
            timestamp: formatDateTime(loadedAt),
            relative: formatRelativeAge(
              loadedAt,
              nowMs,
              relativeTimeFormatter,
              t,
            ),
          })}
        />

        {flash && !flash.plaintextKey ? (
          <CanvasBanner
            theme={th}
            tone={flash.tone === "warning" ? "warn" : "success"}
            icon="warn"
            title={t(flash.titleKey, flash.titleParams)}
            body={t(flash.descriptionKey, flash.descriptionParams)}
          />
        ) : null}

        {errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title={t("apiKeys.error.bannerTitle")}
            body={errors.map((code) => getPageErrorLabel(code, t)).join(" · ")}
          />
        ) : null}

        <section style={overviewGridStyle}>
          <CanvasKPI
            theme={th}
            label={t("apiKeys.kpi.active.label")}
            value={String(kpis.active)}
            sub={t("apiKeys.kpi.active.sub")}
          />
          <CanvasKPI
            theme={th}
            label={t("apiKeys.kpi.expiring.label")}
            value={String(kpis.expiring)}
            sub={t("apiKeys.kpi.expiring.sub")}
          />
          <CanvasKPI
            theme={th}
            label={t("apiKeys.kpi.revoked.label")}
            value={String(kpis.revoked)}
            sub={t("apiKeys.kpi.revoked.sub")}
          />
          <CanvasKPI
            theme={th}
            label={t("apiKeys.kpi.refreshTier.label")}
            value={t("apiKeys.kpi.refreshTier.value")}
            sub={t("apiKeys.kpi.refreshTier.sub")}
          />
        </section>

        <section style={actionLaneStyle}>
          <CanvasCard
            theme={th}
            title={
              editorMode === "rotate" && selectedKey
                ? t("apiKeys.editor.rotateTitle", {
                    keyName: selectedKey.keyName,
                  })
                : t("apiKeys.editor.issueTitle")
            }
            subtitle={t("apiKeys.editor.subtitle")}
            actions={
              editorMode ? (
                <CanvasBtn
                  theme={th}
                  variant="ghost"
                  size="xs"
                  onClick={closeEditor}
                >
                  {t("apiKeys.editor.collapse")}
                </CanvasBtn>
              ) : (
                <CanvasBtn
                  theme={th}
                  size="xs"
                  disabled={!issueAction?.enabled}
                  onClick={() => openIssueEditor()}
                >
                  {t("apiKeys.editor.openForm")}
                </CanvasBtn>
              )
            }
          >
            {editorMode ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  submitEditor();
                }}
              >
                <div style={fieldGridStyle}>
                  <CanvasField theme={th} label={t("apiKeys.editor.name")} required>
                    <input
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      placeholder={t("apiKeys.editor.namePlaceholder")}
                      style={nativeInputStyle}
                    />
                  </CanvasField>
                  <CanvasField
                    theme={th}
                    label={t("apiKeys.editor.expiresAt")}
                    hint={
                      governance
                        ? t("apiKeys.editor.expiresAtHint", {
                            days: governance.apiKeyPolicy.defaultLifetimeDays,
                          })
                        : t("apiKeys.editor.expiresAtFallbackHint")
                    }
                  >
                    <input
                      value={draftExpiresAt}
                      onChange={(event) =>
                        setDraftExpiresAt(event.target.value)
                      }
                      placeholder={t("apiKeys.editor.expiresAtPlaceholder")}
                      style={nativeMonoInputStyle}
                    />
                  </CanvasField>
                </div>

                <CanvasField
                  theme={th}
                  label={t("apiKeys.editor.scope")}
                  required
                  hint={t("apiKeys.editor.scopeHint")}
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
                              checked={selected}
                              onChange={() => toggleScope(scope)}
                              style={{ display: "none" }}
                              type="checkbox"
                            />
                            <span>{scope}</span>
                          </label>
                        );
                      })
                    ) : (
                      <div style={formNoteStyle}>
                        {t("apiKeys.editor.scopeUnavailable")}
                      </div>
                    )}
                  </div>
                </CanvasField>

                <div style={formFooterStyle}>
                  <div style={formNoteStyle}>
                    {governance
                      ? t("apiKeys.editor.policySummary", {
                          defaultDays:
                            governance.apiKeyPolicy.defaultLifetimeDays,
                          maxDays: governance.apiKeyPolicy.maxLifetimeDays,
                          revokeEffect: governance.apiKeyPolicy.revokeEffect,
                        })
                      : t("apiKeys.editor.policyUnavailable")}
                  </div>
                  <button
                    type="submit"
                    disabled={
                      pending ||
                      draftName.trim().length === 0 ||
                      draftScopes.length === 0 ||
                      !allowedScopes.length ||
                      (editorMode === "issue"
                        ? !issueAction?.enabled
                        : !rotateAction?.enabled)
                    }
                    style={{
                      ...primaryButtonStyle,
                      cursor:
                        pending ||
                        draftName.trim().length === 0 ||
                        draftScopes.length === 0 ||
                        !allowedScopes.length ||
                        (editorMode === "issue"
                          ? !issueAction?.enabled
                          : !rotateAction?.enabled)
                          ? "not-allowed"
                          : "pointer",
                      opacity:
                        pending ||
                        draftName.trim().length === 0 ||
                        draftScopes.length === 0 ||
                        !allowedScopes.length ||
                        (editorMode === "issue"
                          ? !issueAction?.enabled
                          : !rotateAction?.enabled)
                          ? 0.55
                          : 1,
                    }}
                  >
                    {pending
                      ? t("apiKeys.editor.submitting")
                      : editorMode === "rotate"
                        ? t("apiKeys.editor.confirmRotate")
                        : t("apiKeys.editor.confirmIssue")}
                  </button>
                </div>
              </form>
            ) : (
              <div style={formNoteStyle}>
                {t("apiKeys.editor.closedHint")}
              </div>
            )}
          </CanvasCard>

          <CanvasCard
            theme={th}
            title={t("apiKeys.availableActions.title")}
            subtitle={t("apiKeys.availableActions.subtitle")}
          >
            {renderActionCatalog()}
          </CanvasCard>
        </section>

        <section style={secondaryCardGridStyle}>
          <CanvasCard
            theme={th}
            title={t("apiKeys.filters.title")}
            subtitle={t("apiKeys.filters.subtitle")}
          >
            <div style={compactFieldGridStyle}>
              <CanvasField theme={th} label={t("apiKeys.filters.search")}>
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={t("apiKeys.filters.searchPlaceholder")}
                  style={nativeInputStyle}
                />
              </CanvasField>
              <CanvasField theme={th} label={t("apiKeys.filters.state")}>
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as ApiKeyStatusFilter)
                  }
                  style={nativeInputStyle}
                >
                  <option value="all">{t("apiKeys.filterState.all")}</option>
                  <option value="active">{t("apiKeys.filterState.active")}</option>
                  <option value="expiring">{t("apiKeys.filterState.expiring")}</option>
                  <option value="expired">{t("apiKeys.filterState.expired")}</option>
                  <option value="revoked">{t("apiKeys.filterState.revoked")}</option>
                </select>
              </CanvasField>
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title={t("apiKeys.governance.title")}
            subtitle={t("apiKeys.governance.subtitle")}
          >
            {governance ? (
              <>
                <CanvasDL
                  theme={th}
                  cols={2}
                  items={[
                    {
                      k: t("apiKeys.governance.identity"),
                      v:
                        identity?.roles.join(", ") ||
                        identity?.actorType ||
                        t("apiKeys.table.notAvailable"),
                    },
                    {
                      k: t("apiKeys.governance.generatedAt"),
                      v: formatDateTime(governance.generatedAt),
                      mono: true,
                    },
                    {
                      k: t("apiKeys.governance.defaultLifetime"),
                      v: t("apiKeys.governance.days", {
                        count: governance.apiKeyPolicy.defaultLifetimeDays,
                      }),
                      mono: true,
                    },
                    {
                      k: t("apiKeys.governance.maxLifetime"),
                      v: t("apiKeys.governance.days", {
                        count: governance.apiKeyPolicy.maxLifetimeDays,
                      }),
                      mono: true,
                    },
                    {
                      k: t("apiKeys.governance.expiryMode"),
                      v: governance.apiKeyPolicy.requireExpiry
                        ? t("apiKeys.governance.expiryRequired")
                        : t("apiKeys.governance.expiryOptional"),
                      mono: true,
                    },
                    {
                      k: t("apiKeys.governance.breakGlass"),
                      v: governance.apiKeyPolicy
                        .breakGlassRequiresPlatformApproval
                        ? t("apiKeys.governance.breakGlassApproval")
                        : t("apiKeys.governance.breakGlassUnavailable"),
                      mono: true,
                    },
                  ]}
                />

                <div style={sectionLabelStyle}>{t("apiKeys.governance.allowedScopes")}</div>
                <div style={scopeGridStyle}>
                  {allowedScopes.map((scope: string) => (
                    <CanvasPill key={scope} theme={th} tone="info">
                      {scope}
                    </CanvasPill>
                  ))}
                </div>

                {compatibilityAliases.length > 0 ? (
                  <>
                    <div style={{ ...sectionLabelStyle, marginTop: 14 }}>
                      {t("apiKeys.governance.compatibilityAliases")}
                    </div>
                    <ul style={aliasListStyle}>
                      {compatibilityAliases.map(([alias, target]) => (
                        <li key={`${alias}-${target}`}>
                          <code style={{ fontFamily: th.monoFamily }}>
                            {alias}
                          </code>{" "}
                          {"->"}{" "}
                          <code style={{ fontFamily: th.monoFamily }}>
                            {String(target)}
                          </code>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}

                {governance.onboardingChecklist.length > 0 ? (
                  <>
                    <div style={{ ...sectionLabelStyle, marginTop: 14 }}>
                      {t("apiKeys.governance.onboardingChecklist")}
                    </div>
                    <ul style={aliasListStyle}>
                      {governance.onboardingChecklist.map((item: string) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </>
            ) : (
              <div style={formNoteStyle}>
                {t("apiKeys.governance.unavailable")}
              </div>
            )}
          </CanvasCard>

          <CanvasCard
            theme={th}
            title={t("apiKeys.deepLinks.title")}
            subtitle={t("apiKeys.deepLinks.subtitle")}
          >
            <div style={deepLinkListStyle}>
              <div style={deepLinkItemStyle}>
                <div style={deepLinkMetaStyle}>
                  <strong>{t("apiKeys.deepLinks.governance.title")}</strong>
                  <div style={formNoteStyle}>
                    {t("apiKeys.deepLinks.governance.body")}
                  </div>
                </div>
                <Link href="/integration-governance" style={textLinkStyle}>
                  {t("apiKeys.deepLinks.governance.path")}
                </Link>
              </div>
              <div style={deepLinkItemStyle}>
                <div style={deepLinkMetaStyle}>
                  <strong>{t("apiKeys.deepLinks.webhooks.title")}</strong>
                  <div style={formNoteStyle}>
                    {t("apiKeys.deepLinks.webhooks.body")}
                  </div>
                </div>
                <Link href="/webhooks" style={textLinkStyle}>
                  {t("apiKeys.deepLinks.webhooks.path")}
                </Link>
              </div>
              <div style={deepLinkItemStyle}>
                <div style={deepLinkMetaStyle}>
                  <strong>{t("apiKeys.deepLinks.notifications.title")}</strong>
                  <div style={formNoteStyle}>
                    {t("apiKeys.deepLinks.notifications.body")}
                  </div>
                </div>
                <Link href="/notifications" style={textLinkStyle}>
                  {t("apiKeys.deepLinks.notifications.path")}
                </Link>
              </div>
              <div style={deepLinkItemStyle}>
                <div style={deepLinkMetaStyle}>
                  <strong>{t("apiKeys.deepLinks.sla.title")}</strong>
                  <div style={formNoteStyle}>
                    {t("apiKeys.deepLinks.sla.body")}
                  </div>
                </div>
                <Link href="/sla" style={textLinkStyle}>
                  {t("apiKeys.deepLinks.sla.path")}
                </Link>
              </div>
              <div style={deepLinkItemStyle}>
                <div style={deepLinkMetaStyle}>
                  <strong>{t("apiKeys.deepLinks.reports.title")}</strong>
                  <div style={formNoteStyle}>
                    {t("apiKeys.deepLinks.reports.body")}
                  </div>
                </div>
                <Link href="/reports" style={textLinkStyle}>
                  {t("apiKeys.deepLinks.reports.path")}
                </Link>
              </div>
              <div style={deepLinkItemStyle}>
                <div style={deepLinkMetaStyle}>
                  <strong>{t("apiKeys.deepLinks.audit.title")}</strong>
                  <div style={formNoteStyle}>
                    {t("apiKeys.deepLinks.audit.body")}
                  </div>
                </div>
                <Link href="/audit" style={textLinkStyle}>
                  {t("apiKeys.deepLinks.audit.path")}
                </Link>
              </div>
            </div>
          </CanvasCard>
        </section>

        <CanvasCard theme={th} title={t("apiKeys.table.title")} padding={0}>
          {filteredKeys.length > 0 ? (
            <CanvasTable<ApiKeyRow>
              theme={th}
              columns={columns}
              rows={filteredKeys as ApiKeyRow[]}
            />
          ) : (
            renderEmptyState()
          )}
        </CanvasCard>
      </div>

      {flash?.plaintextKey ? (
        <div style={modalOverlayStyle}>
          <div
            style={modalPanelStyle}
            aria-modal="true"
            role="dialog"
            aria-labelledby="api-key-secret-modal-title"
          >
            <div style={modalHeaderStyle}>
              <div>
                <strong id="api-key-secret-modal-title">
                  {flash.action === "rotate"
                    ? t("apiKeys.secretModal.rotateTitle")
                    : t("apiKeys.secretModal.issueTitle")}
                </strong>
                <div style={{ ...formNoteStyle, marginTop: 6 }}>
                  {t("apiKeys.secretModal.subtitle")}
                </div>
              </div>
              <CanvasPill theme={th} tone="warn">
                {t("apiKeys.secretModal.badge")}
              </CanvasPill>
            </div>
            <div style={modalBodyStyle}>
              <CanvasBanner
                theme={th}
                tone="info"
                icon="warn"
                title={t(flash.titleKey, flash.titleParams)}
                body={
                  <div style={secretBodyStyle}>
                    <span>{t(flash.descriptionKey, flash.descriptionParams)}</span>
                    <code style={plaintextKeyStyle}>{flash.plaintextKey}</code>
                  </div>
                }
              />

              <div style={inlineActionRowStyle}>
                <CanvasBtn
                  theme={th}
                  size="sm"
                  onClick={() => void handleCopyPlaintextKey()}
                >
                  {copyState === "copied"
                    ? t("apiKeys.secretModal.copied")
                    : t("apiKeys.secretModal.copy")}
                </CanvasBtn>
                <CanvasBtn
                  theme={th}
                  size="sm"
                  onClick={() =>
                    downloadPlaintextKey(
                      flash.keyName ?? t("apiKeys.download.filenameFallback"),
                      flash.plaintextKey ?? "",
                      t("apiKeys.download.filenameFallback"),
                      t("apiKeys.download.issuedAtLabel"),
                    )
                  }
                >
                  {t("apiKeys.secretModal.download")}
                </CanvasBtn>
                <Link href="/audit" style={textLinkStyle}>
                  {t("apiKeys.secretModal.audit")}
                </Link>
              </div>

              <label style={checkboxRowStyle}>
                <input
                  checked={keyStoredConfirmed}
                  onChange={(event) =>
                    setKeyStoredConfirmed(event.target.checked)
                  }
                  type="checkbox"
                />
                <span>
                  {t("apiKeys.secretModal.confirmation")}
                </span>
              </label>
            </div>
            <div style={modalFooterStyle}>
              <div style={formNoteStyle}>
                {flash.keyName
                  ? t("apiKeys.secretModal.footerNamed", {
                      keyName: flash.keyName,
                      status:
                        flash.action === "rotate"
                          ? t("apiKeys.secretModal.statusRotated")
                          : t("apiKeys.secretModal.statusIssued"),
                    })
                  : t("apiKeys.secretModal.footerFallback")}
              </div>
              <CanvasBtn
                theme={th}
                variant="primary"
                size="sm"
                disabled={!keyStoredConfirmed}
                onClick={() => setFlash(null)}
              >
                {t("apiKeys.secretModal.close")}
              </CanvasBtn>
            </div>
          </div>
        </div>
      ) : null}

      {revokeTarget ? (
        <div style={modalOverlayStyle}>
          <div
            style={modalPanelStyle}
            aria-modal="true"
            role="dialog"
            aria-labelledby="api-key-revoke-modal-title"
          >
            <div style={modalHeaderStyle}>
              <div>
                <strong id="api-key-revoke-modal-title">
                  {t("apiKeys.revokeModal.title")}
                </strong>
                <div style={{ ...formNoteStyle, marginTop: 6 }}>
                  {t("apiKeys.revokeModal.subtitle")}
                </div>
              </div>
              <CanvasPill theme={th} tone="danger">
                {t("apiKeys.risk.high")}
              </CanvasPill>
            </div>
            <div style={modalBodyStyle}>
              <CanvasDL
                theme={th}
                cols={2}
                items={[
                  { k: t("apiKeys.revokeModal.keyName"), v: revokeTarget.keyName },
                  { k: t("apiKeys.revokeModal.id"), v: revokeTarget.apiKeyId, mono: true },
                  {
                    k: t("apiKeys.revokeModal.mask"),
                    v: `${revokeTarget.keyPrefix}••••${revokeTarget.maskedSuffix}`,
                    mono: true,
                  },
                  {
                    k: t("apiKeys.revokeModal.lastUsed"),
                    v: formatDateTime(revokeTarget.lastUsedAt),
                    mono: true,
                  },
                ]}
              />
              <CanvasField
                theme={th}
                label={t("apiKeys.revokeModal.reason")}
                required
                hint={t("apiKeys.revokeModal.reasonHint")}
              >
                <textarea
                  value={revokeReason}
                  onChange={(event) => setRevokeReason(event.target.value)}
                  rows={4}
                  style={{
                    width: "100%",
                    resize: "vertical",
                    minHeight: 96,
                    background: th.bgRaised,
                    border: `1px solid ${th.border}`,
                    borderRadius: 7,
                    padding: "10px 12px",
                    fontSize: 12.5,
                    color: th.text,
                    outline: "none",
                    boxSizing: "border-box",
                    fontFamily: th.fontFamily,
                  }}
                />
              </CanvasField>
            </div>
            <div style={modalFooterStyle}>
              <CanvasBtn
                theme={th}
                size="sm"
                onClick={() => {
                  setRevokeTarget(null);
                  setRevokeReason("");
                }}
              >
                {t("apiKeys.revokeModal.cancel")}
              </CanvasBtn>
              <CanvasBtn
                theme={th}
                danger
                size="sm"
                disabled={pending || revokeReason.trim().length === 0}
                onClick={() => {
                  if (!revokeTarget) return;
                  runAction(
                    revokeTenantApiKeyAction,
                    buildRevokeFormData(revokeTarget, revokeReason),
                    {
                      onSuccess: () => {
                        setRevokeTarget(null);
                        setRevokeReason("");
                      },
                    },
                  );
                }}
              >
                {t("apiKeys.revokeModal.confirm")}
              </CanvasBtn>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
