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
import {
  formatTenantCodeLabel,
  formatTenantCodeList,
} from "@/lib/localized-labels";
import { formatStableDateTime } from "@/lib/formatters";
import {
  issueTenantApiKeyAction,
  revokeTenantApiKeyAction,
  rotateTenantApiKeyAction,
} from "./actions";
import type { ApiKeyActionKind, ApiKeyFlashPayload } from "./constants";

type ApiKeyManagerProps = {
  apiKeys: TenantApiKeyRecord[];
  governance: TenantIntegrationGovernancePackage | null;
  identity: IdentityContext | null;
  availableActions: ResourceActionDescriptor[];
  initialEmptyReason: EmptyReason | null;
  loadedAt: string;
  errors: string[];
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

const EMPTY_ALLOWED_SCOPES: string[] = [];

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

const relativeTimeFormatter = new Intl.RelativeTimeFormat("zh-Hant", {
  numeric: "auto",
});

function formatDateTime(value: string | null | undefined) {
  return formatStableDateTime(value, "—");
}

function isRevoked(apiKey: TenantApiKeyRecord) {
  return Boolean(apiKey.revokedAt);
}

function resolveApiKeyState(
  apiKey: TenantApiKeyRecord,
  nowMs: number,
): ApiKeyState {
  if (isRevoked(apiKey)) return "revoked";

  if (apiKey.expiresAt && new Date(apiKey.expiresAt).getTime() <= nowMs) {
    return "expired";
  }

  if (apiKey.expiresAt) {
    const millisUntilExpiry = new Date(apiKey.expiresAt).getTime() - nowMs;
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

function getApiKeyStateLabel(state: ApiKeyState) {
  switch (state) {
    case "revoked":
      return "已撤銷";
    case "expired":
      return "已過期";
    case "expiring":
      return "即將到期";
    default:
      return "啟用中";
  }
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

function getRiskLabel(action: ResourceActionDescriptor["riskLevel"]) {
  if (action === "high") return "高風險";
  if (action === "medium") return "中風險";
  return "低風險";
}

function getActionLabel(action: ApiKeyActionKind) {
  switch (action) {
    case "issue":
      return "建立金鑰";
    case "rotate":
      return "輪替金鑰";
    case "revoke":
      return "撤銷金鑰";
  }
}

function getActionDescription(action: ApiKeyActionKind) {
  switch (action) {
    case "issue":
      return "完整明文只會在彈窗顯示一次；權限範圍與到期時間由治理策略限制。";
    case "rotate":
      return "立即使舊憑證失效，並重新發出只顯示一次的新明文。";
    case "revoke":
      return "高風險操作，必須先記錄撤銷原因後才可送出。";
  }
}

function getActionByKind(
  availableActions: ResourceActionDescriptor[],
  kind: ApiKeyActionKind,
) {
  return availableActions.find((entry) => entry.action === kind) ?? null;
}

function formatRelativeAge(fromIso: string, nowMs: number) {
  const timestamp = new Date(fromIso).getTime();
  if (Number.isNaN(timestamp)) return "時間未知";
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

function buildEmptyStateCopy(reason: EmptyReason | null): EmptyStateConfig {
  switch (reason) {
    case "filtered_empty":
      return {
        title: "目前篩選條件沒有符合的金鑰",
        body: "請清除搜尋字詞或切回其他狀態篩選；已撤銷與已過期金鑰仍會保留在清單中供稽核檢視。",
        tone: "neutral",
        badge: "篩選後無結果",
      };
    case "fetch_failed":
      return {
        title: "整合金鑰清單暫時無法讀取",
        body: "畫面沒有收到金鑰清單。請重新整理，若持續失敗再檢查租戶端服務與稽核紀錄。",
        tone: "warn",
        badge: "讀取失敗",
      };
    case "permission_denied":
      return {
        title: "目前身分沒有管理整合金鑰的權限",
        body: "此租戶會話缺少管理整合金鑰所需權限。你仍可透過其他模組追蹤整合狀態，但建立、輪替與撤銷都會保持停用。",
        tone: "danger",
        badge: "權限",
      };
    case "external_unavailable":
      return {
        title: "治理策略暫時不可用",
        body: "整合治理套件沒有成功載入，因此無法安全判斷權限範圍目錄與期限策略。",
        tone: "warn",
        badge: "降級",
      };
    case "not_provisioned":
      return {
        title: "此租戶尚未完成整合金鑰開通",
        body: "目前沒有既有金鑰，且治理摘要仍顯示整合金鑰就緒度未完成。請先完成第一組整合憑證與相依模組設定。",
        tone: "info",
        badge: "待設定",
      };
    case "no_data":
    default:
      return {
        title: "目前沒有任何租戶整合金鑰",
        body: "清單保持空白直到第一組憑證發出。建立後只會在當下顯示完整明文，後續僅保留前綴與遮罩尾碼。",
        tone: "info",
        badge: "空白",
      };
  }
}

function downloadPlaintextKey(keyName: string, plaintextKey: string) {
  const blob = new Blob(
    [`${keyName}\n${plaintextKey}\nissued_at=${new Date().toISOString()}\n`],
    { type: "text/plain;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${keyName.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase() || "tenant-api-key"}.txt`;
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
  const loadedAtMs = new Date(loadedAt).getTime();
  const stableInitialNowMs = Number.isFinite(loadedAtMs)
    ? loadedAtMs
    : Date.now();
  const [flash, setFlash] = useState<ApiKeyFlashPayload | null>(null);
  const [pending, startTransition] = useTransition();
  const [nowMs, setNowMs] = useState(stableInitialNowMs);
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

  const allowedScopes: string[] =
    governance?.apiKeyPolicy.allowedScopes ?? EMPTY_ALLOWED_SCOPES;
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
      const state = resolveApiKeyState(key, nowMs);
      if (state === "active") active += 1;
      if (state === "expiring") expiring += 1;
      if (state === "expired") expired += 1;
      if (state === "revoked") revoked += 1;
    }
    return { active, expiring, expired, revoked };
  }, [apiKeys, nowMs]);

  const filteredKeys = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return sortedKeys.filter((key) => {
      const state = resolveApiKeyState(key, nowMs);
      if (statusFilter !== "all" && state !== statusFilter) {
        return false;
      }
      if (!keyword) return true;
      return toSearchableRow(key).includes(keyword);
    });
  }, [nowMs, searchTerm, sortedKeys, statusFilter]);

  const effectiveEmptyReason =
    filteredKeys.length > 0
      ? null
      : searchTerm.trim().length > 0 || statusFilter !== "all"
        ? "filtered_empty"
        : initialEmptyReason;

  const issueAction = getActionByKind(availableActions, "issue");
  const rotateAction = getActionByKind(availableActions, "rotate");
  const revokeAction = getActionByKind(availableActions, "revoke");
  const refreshAgeMs = Number.isFinite(loadedAtMs)
    ? Math.max(0, nowMs - loadedAtMs)
    : 0;
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
                <strong>{getActionLabel(actionKind)}</strong>
                <CanvasPill theme={th} tone={getActionTone(actionKind)}>
                  {getRiskLabel(action.riskLevel)}
                </CanvasPill>
              </div>
              <div style={formNoteStyle}>
                {getActionDescription(actionKind)}
              </div>
              {action.enabled === false ? (
                <div style={formNoteStyle}>
                  停用原因：
                  {formatTenantCodeLabel(
                    action.disabledReasonCode ?? "action_disabled",
                  )}
                </div>
              ) : (
                <div style={formNoteStyle}>目前可執行。</div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function renderEmptyState() {
    const copy = buildEmptyStateCopy(effectiveEmptyReason);
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
                清除篩選
              </CanvasBtn>
            ) : null}
            {effectiveEmptyReason === "fetch_failed" ||
            effectiveEmptyReason === "external_unavailable" ? (
              <CanvasBtn theme={th} size="sm" onClick={() => router.refresh()}>
                重新整理
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
                {getActionLabel("issue")}
              </CanvasBtn>
            ) : null}
            {effectiveEmptyReason === "permission_denied" ? (
              <Link href="/users" style={textLinkStyle}>
                檢查角色與租戶權限
              </Link>
            ) : null}
            {effectiveEmptyReason === "not_provisioned" ? (
              <>
                <Link href="/integration-governance" style={textLinkStyle}>
                  前往整合治理
                </Link>
                <Link href="/webhooks" style={textLinkStyle}>
                  前往回呼管理
                </Link>
              </>
            ) : null}
            <Link href="/audit" style={textLinkStyle}>
              查看稽核紀錄
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const columns: CanvasTableColumn<ApiKeyRow>[] = [
    {
      h: "名稱",
      w: 290,
      r: (row) => {
        const state = resolveApiKeyState(row, nowMs);
        return (
          <div style={nameCellStyle}>
            <span style={namePrimaryStyle}>{row.keyName}</span>
            <div style={nameMetaRowStyle}>
              <span>{row.apiKeyId}</span>
              {state === "revoked" ? (
                <span>已撤銷 {formatDateTime(row.revokedAt)}</span>
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
                    輪替
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
                    撤銷
                  </button>
                </>
              )}
            </div>
          </div>
        );
      },
    },
    {
      h: "前綴",
      k: "keyPrefix",
      w: 110,
      mono: true,
    },
    {
      h: "遮罩尾碼",
      w: 120,
      mono: true,
      r: (row) => `••••${row.maskedSuffix}`,
    },
    {
      h: "權限範圍",
      w: 270,
      mono: true,
      r: (row) => (
        <div style={scopeTextStyle}>
          {row.scopes.length > 0 ? formatTenantCodeList(row.scopes) : "—"}
        </div>
      ),
    },
    {
      h: "最近使用",
      w: 142,
      mono: true,
      r: (row) => formatDateTime(row.lastUsedAt),
    },
    {
      h: "到期時間",
      w: 142,
      mono: true,
      r: (row) => formatDateTime(row.expiresAt),
    },
    {
      h: "撤銷時間",
      w: 142,
      mono: true,
      r: (row) => formatDateTime(row.revokedAt),
    },
    {
      h: "狀態",
      w: 108,
      r: (row) => {
        const state = resolveApiKeyState(row, nowMs);
        return (
          <CanvasPill theme={th} tone={getApiKeyStateTone(state)} dot>
            {getApiKeyStateLabel(state)}
          </CanvasPill>
        );
      },
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="API 金鑰"
        subtitle="正式 / 沙箱 · 權限範圍 · 最近使用 · 撤銷後永久不可復原"
        tabs={["金鑰清單", "建立 / 輪替", "治理"]}
        activeTab="金鑰清單"
        actions={
          <>
            <CanvasBtn theme={th} icon="ext" size="sm">
              API 文件
            </CanvasBtn>
            <CanvasBtn theme={th} size="sm" onClick={() => router.refresh()}>
              重新整理
            </CanvasBtn>
            <CanvasBtn
              theme={th}
              variant="primary"
              icon="plus"
              size="sm"
              disabled={!issueAction?.enabled}
              onClick={() => openIssueEditor()}
            >
              建立金鑰
            </CanvasBtn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        <CanvasBanner
          theme={th}
          tone="info"
          icon="warn"
          title="治理規範：完整明文只顯示一次"
          body="建立與輪替成功後都只會在彈窗內揭露一次完整金鑰。關閉後僅保留金鑰前綴與遮罩尾碼，遺失請重新輪替。"
        />

        <CanvasBanner
          theme={th}
          tone={refreshStateTone}
          icon="clock"
          title={`刷新層級 · 每 30 秒輪詢一次${refreshAgeMs >= REFRESH_INTERVAL_MS ? " · 建議立即刷新" : ""}`}
          body={`目前快照建立於 ${formatDateTime(loadedAt)}（${formatRelativeAge(loadedAt, nowMs)}）。頁面可見時會自動刷新；你也可以手動刷新以取得最新狀態。`}
        />

        {flash && !flash.plaintextKey ? (
          <CanvasBanner
            theme={th}
            tone={flash.tone === "warning" ? "warn" : "success"}
            icon="warn"
            title={flash.title}
            body={flash.description}
          />
        ) : null}

        {errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分整合金鑰資料無法載入"
            body={errors.join(" · ")}
          />
        ) : null}

        <section style={overviewGridStyle}>
          <CanvasKPI
            theme={th}
            label="啟用中"
            value={String(kpis.active)}
            sub="可使用"
          />
          <CanvasKPI
            theme={th}
            label="即將到期"
            value={String(kpis.expiring)}
            sub="7 天內"
          />
          <CanvasKPI
            theme={th}
            label="已撤銷"
            value={String(kpis.revoked)}
            sub="稽核可見"
          />
          <CanvasKPI
            theme={th}
            label="刷新層級"
            value="30 秒"
            sub="自動刷新目標"
          />
        </section>

        <section style={actionLaneStyle}>
          <CanvasCard
            theme={th}
            title={
              editorMode === "rotate" && selectedKey
                ? `輪替 ${selectedKey.keyName}`
                : "建立整合金鑰"
            }
            subtitle="可用操作由後端回傳的操作清單決定；高風險動作不再依角色名稱硬編碼。"
            actions={
              editorMode ? (
                <CanvasBtn
                  theme={th}
                  variant="ghost"
                  size="xs"
                  onClick={closeEditor}
                >
                  收合
                </CanvasBtn>
              ) : (
                <CanvasBtn
                  theme={th}
                  size="xs"
                  disabled={!issueAction?.enabled}
                  onClick={() => openIssueEditor()}
                >
                  開啟表單
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
                  <CanvasField theme={th} label="名稱" required>
                    <input
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      placeholder="營運報表整合"
                      style={nativeInputStyle}
                    />
                  </CanvasField>
                  <CanvasField
                    theme={th}
                    label="到期時間"
                    hint={
                      governance
                        ? `請使用含時區的日期時間格式；留空則遵循預設 ${governance.apiKeyPolicy.defaultLifetimeDays} 天。`
                        : "例如 2026-08-09T01:52:30Z（含時區）"
                    }
                  >
                    <input
                      value={draftExpiresAt}
                      onChange={(event) =>
                        setDraftExpiresAt(event.target.value)
                      }
                      placeholder="例如：2026-08-09T01:52:30Z"
                      style={nativeMonoInputStyle}
                    />
                  </CanvasField>
                </div>

                <CanvasField
                  theme={th}
                  label="權限範圍"
                  required
                  hint="至少選擇一個已發佈的權限範圍。輪替預設沿用原範圍，但可在送出前微調。"
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
                            <span>{formatTenantCodeLabel(scope, scope)}</span>
                          </label>
                        );
                      })
                    ) : (
                      <div style={formNoteStyle}>
                        治理策略尚未載入，或未提供允許的權限範圍，暫時無法送出。
                      </div>
                    )}
                  </div>
                </CanvasField>

                <div style={formFooterStyle}>
                  <div style={formNoteStyle}>
                    {governance
                      ? `預設 ${governance.apiKeyPolicy.defaultLifetimeDays} 天 · 最長 ${governance.apiKeyPolicy.maxLifetimeDays} 天 · 撤銷效果 ${formatTenantCodeLabel(governance.apiKeyPolicy.revokeEffect, governance.apiKeyPolicy.revokeEffect)}`
                      : "治理策略暫時不可用"}
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
                      ? "送出中..."
                      : editorMode === "rotate"
                        ? "確認輪替"
                        : "建立金鑰"}
                  </button>
                </div>
              </form>
            ) : (
              <div style={formNoteStyle}>
                從上方操作按鈕或清單列操作開啟建立 / 輪替表單。
              </div>
            )}
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="可用操作"
            subtitle="風險層級與停用原因會直接映射後端回傳的操作清單；空清單與無權限時不再假裝可操作。"
          >
            {renderActionCatalog()}
          </CanvasCard>
        </section>

        <section style={secondaryCardGridStyle}>
          <CanvasCard
            theme={th}
            title="金鑰清單"
            subtitle="搜尋金鑰名稱、編號、權限範圍；並保留已撤銷 / 已過期視圖供稽核追蹤。"
          >
            <div style={compactFieldGridStyle}>
              <CanvasField theme={th} label="搜尋">
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="搜尋金鑰名稱、編號、權限範圍"
                  style={nativeInputStyle}
                />
              </CanvasField>
              <CanvasField theme={th} label="狀態">
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as ApiKeyStatusFilter)
                  }
                  style={nativeInputStyle}
                >
                  <option value="all">全部</option>
                  <option value="active">啟用中</option>
                  <option value="expiring">即將到期</option>
                  <option value="expired">已過期</option>
                  <option value="revoked">已撤銷</option>
                </select>
              </CanvasField>
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="治理套件"
            subtitle="這個租戶整合介面的已發佈策略快照。"
          >
            {governance ? (
              <>
                <CanvasDL
                  theme={th}
                  cols={2}
                  items={[
                    {
                      k: "身分",
                      v:
                        (identity?.roles && identity.roles.length > 0
                          ? formatTenantCodeList(identity.roles)
                          : formatTenantCodeLabel(identity?.actorType)) ||
                        "目前無法取得",
                    },
                    {
                      k: "產生時間",
                      v: formatDateTime(governance.generatedAt),
                      mono: true,
                    },
                    {
                      k: "預設效期",
                      v: `${governance.apiKeyPolicy.defaultLifetimeDays} 天`,
                      mono: true,
                    },
                    {
                      k: "最大效期",
                      v: `${governance.apiKeyPolicy.maxLifetimeDays} 天`,
                      mono: true,
                    },
                    {
                      k: "到期要求",
                      v: governance.apiKeyPolicy.requireExpiry
                        ? "必填"
                        : "選填",
                      mono: true,
                    },
                    {
                      k: "緊急通行",
                      v: governance.apiKeyPolicy
                        .breakGlassRequiresPlatformApproval
                        ? "需平台核准"
                        : "尚未發布",
                      mono: true,
                    },
                  ]}
                />

                <div style={sectionLabelStyle}>允許的權限範圍</div>
                <div style={scopeGridStyle}>
                  {allowedScopes.map((scope: string) => (
                    <CanvasPill key={scope} theme={th} tone="info">
                      {formatTenantCodeLabel(scope, scope)}
                    </CanvasPill>
                  ))}
                </div>

                {compatibilityAliases.length > 0 ? (
                  <>
                    <div style={{ ...sectionLabelStyle, marginTop: 14 }}>
                      相容別名
                    </div>
                    <ul style={aliasListStyle}>
                      {compatibilityAliases.map(([alias, target]) => (
                        <li key={`${alias}-${target}`}>
                          <code style={{ fontFamily: th.monoFamily }}>
                            {formatTenantCodeLabel(alias, alias)}
                          </code>{" "}
                          {"->"}{" "}
                          <code style={{ fontFamily: th.monoFamily }}>
                            {formatTenantCodeLabel(
                              String(target),
                              String(target),
                            )}
                          </code>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}

                {governance.onboardingChecklist.length > 0 ? (
                  <>
                    <div style={{ ...sectionLabelStyle, marginTop: 14 }}>
                      開通檢查清單
                    </div>
                    <ul style={aliasListStyle}>
                      {governance.onboardingChecklist.map((item, index) => (
                        <li key={`${item}-${index}`}>
                          {formatTenantCodeLabel(item, item)}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </>
            ) : (
              <div style={formNoteStyle}>
                目前無法載入此租戶的整合治理資料。
              </div>
            )}
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="深連結"
            subtitle="可從這裡前往整合治理、通知、服務水準、報表與稽核模組。"
          >
            <div style={deepLinkListStyle}>
              <div style={deepLinkItemStyle}>
                <div style={deepLinkMetaStyle}>
                  <strong>整合治理</strong>
                  <div style={formNoteStyle}>
                    對照整體就緒度、已發佈權限範圍與開通檢查清單。
                  </div>
                </div>
                <Link href="/integration-governance" style={textLinkStyle}>
                  前往整合治理
                </Link>
              </div>
              <div style={deepLinkItemStyle}>
                <div style={deepLinkMetaStyle}>
                  <strong>回呼管理</strong>
                  <div style={formNoteStyle}>
                    檢查金鑰對應的回呼接收端是否已就緒。
                  </div>
                </div>
                <Link href="/webhooks" style={textLinkStyle}>
                  前往回呼管理
                </Link>
              </div>
              <div style={deepLinkItemStyle}>
                <div style={deepLinkMetaStyle}>
                  <strong>通知偏好</strong>
                  <div style={formNoteStyle}>
                    確認投遞失敗與開通通知是否已開通。
                  </div>
                </div>
                <Link href="/notifications" style={textLinkStyle}>
                  前往通知偏好
                </Link>
              </div>
              <div style={deepLinkItemStyle}>
                <div style={deepLinkMetaStyle}>
                  <strong>服務時限設定</strong>
                  <div style={formNoteStyle}>
                    檢視整合異常的通知節點與租戶回應時限。
                  </div>
                </div>
                <Link href="/sla" style={textLinkStyle}>
                  前往服務時限設定
                </Link>
              </div>
              <div style={deepLinkItemStyle}>
                <div style={deepLinkMetaStyle}>
                  <strong>報表工作台</strong>
                  <div style={formNoteStyle}>
                    檢查 API 金鑰
                    對應的報表工作是否已具備可執行與可下載的就緒度。
                  </div>
                </div>
                <Link href="/reports" style={textLinkStyle}>
                  前往報表工作台
                </Link>
              </div>
              <div style={deepLinkItemStyle}>
                <div style={deepLinkMetaStyle}>
                  <strong>稽核紀錄</strong>
                  <div style={formNoteStyle}>
                    建立 / 輪替 / 撤銷後可回到稽核頁追蹤動作。
                  </div>
                </div>
                <Link href="/audit" style={textLinkStyle}>
                  前往稽核紀錄
                </Link>
              </div>
            </div>
          </CanvasCard>
        </section>

        <CanvasCard theme={th} title="API 金鑰清單表" padding={0}>
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
                    ? "新的金鑰已輪替"
                    : "新的金鑰已建立"}
                </strong>
                <div style={{ ...formNoteStyle, marginTop: 6 }}>
                  完整明文只會顯示這一次。關閉後請改用遮罩尾碼與稽核軌跡追蹤。
                </div>
              </div>
              <CanvasPill theme={th} tone="warn">
                僅此一次
              </CanvasPill>
            </div>
            <div style={modalBodyStyle}>
              <CanvasBanner
                theme={th}
                tone="info"
                icon="warn"
                title={flash.title}
                body={
                  <div style={secretBodyStyle}>
                    <span>{flash.description}</span>
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
                  {copyState === "copied" ? "已複製" : "複製明文"}
                </CanvasBtn>
                <CanvasBtn
                  theme={th}
                  size="sm"
                  onClick={() =>
                    downloadPlaintextKey(
                      flash.keyName ?? "tenant-api-key",
                      flash.plaintextKey ?? "",
                    )
                  }
                >
                  下載 .txt
                </CanvasBtn>
                <Link href="/audit" style={textLinkStyle}>
                  前往稽核紀錄
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
                  我已安全保存這組整合金鑰，了解關閉後只能再看到遮罩尾碼，
                  若遺失必須重新建立或輪替。
                </span>
              </label>
            </div>
            <div style={modalFooterStyle}>
              <div style={formNoteStyle}>
                {flash.keyName
                  ? `${flash.keyName} · ${flash.action === "rotate" ? "已輪替" : "已建立"}`
                  : "關閉前請先在介面外安全保存此金鑰。"}
              </div>
              <CanvasBtn
                theme={th}
                variant="primary"
                size="sm"
                disabled={!keyStoredConfirmed}
                onClick={() => setFlash(null)}
              >
                我已保存，關閉視窗
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
                <strong id="api-key-revoke-modal-title">撤銷 API 金鑰</strong>
                <div style={{ ...formNoteStyle, marginTop: 6 }}>
                  高風險操作。撤銷後此金鑰不可再次用於認證，且必須先填寫原因。
                </div>
              </div>
              <CanvasPill theme={th} tone="danger">
                高風險
              </CanvasPill>
            </div>
            <div style={modalBodyStyle}>
              <CanvasDL
                theme={th}
                cols={2}
                items={[
                  { k: "金鑰", v: revokeTarget.keyName },
                  { k: "編號", v: revokeTarget.apiKeyId, mono: true },
                  {
                    k: "遮罩",
                    v: `${revokeTarget.keyPrefix}••••${revokeTarget.maskedSuffix}`,
                    mono: true,
                  },
                  {
                    k: "最後使用",
                    v: formatDateTime(revokeTarget.lastUsedAt),
                    mono: true,
                  },
                ]}
              />
              <CanvasField
                theme={th}
                label="撤銷原因"
                required
                hint="例如憑證外洩、整合下線或權限範圍縮減。"
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
                取消
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
                確認撤銷
              </CanvasBtn>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
