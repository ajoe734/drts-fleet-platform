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
  errors: string[];
};

type ApiKeyState = "active" | "expiring" | "expired" | "revoked";
type ApiKeyStatusFilter = "all" | ApiKeyState;
type EditorMode = "issue" | "rotate";
type ApiKeyRow = TenantApiKeyRecord & Record<string, unknown>;

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

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

const aliasListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 16,
  color: th.text,
  fontSize: 12,
  lineHeight: 1.5,
};

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

function getApiKeyStateLabel(state: ApiKeyState) {
  switch (state) {
    case "revoked":
      return "revoked";
    case "expired":
      return "expired";
    case "expiring":
      return "expiring";
    default:
      return "active";
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
  if (action === "high") return "High";
  if (action === "medium") return "Medium";
  return "Low";
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
      return "Q-TEN09 plaintext-once modal；scope 與到期時間由治理策略限制。";
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

function buildEmptyStateCopy(reason: EmptyReason | null) {
  switch (reason) {
    case "filtered_empty":
      return {
        title: "目前篩選條件沒有符合的金鑰",
        body: "請清除搜尋字詞或切回其他狀態篩選，revoked 與 expired 仍會保留在清單中供稽核檢視。",
      };
    case "fetch_failed":
      return {
        title: "API 金鑰清單暫時無法讀取",
        body: "畫面沒有收到 key inventory。請重新整理，若持續失敗再檢查 tenant API 與審核紀錄。",
      };
    case "permission_denied":
      return {
        title: "目前身分沒有管理 API 金鑰的權限",
        body: "此租戶會話不是 `tc_admin` 或 `tc_integration_mgr`。你仍可透過其他模組追蹤整合狀態，但建立、輪替、撤銷都會保持停用。",
      };
    case "external_unavailable":
      return {
        title: "治理策略暫時不可用",
        body: "Integration governance package 沒有成功載入，因此無法安全判斷 scope catalogue 與期限策略。",
      };
    case "not_provisioned":
      return {
        title: "此租戶尚未完成 API key onboarding",
        body: "沒有既有金鑰，而且治理摘要仍顯示 API key readiness 未完成。請先完成第一組整合憑證與相依模組設定。",
      };
    case "no_data":
    default:
      return {
        title: "目前沒有任何租戶 API 金鑰",
        body: "清單保持空白直到第一組憑證發出。建立後只會在當下顯示完整明文，後續僅保留 prefix 與 masked suffix。",
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
  errors,
}: ApiKeyManagerProps) {
  const router = useRouter();
  const [flash, setFlash] = useState<ApiKeyFlashPayload | null>(null);
  const [pending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState<ApiKeyStatusFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode | null>("issue");
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

  const allowedScopes: string[] = governance?.apiKeyPolicy.allowedScopes ?? [];
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
    const supportedActions: ApiKeyActionKind[] = ["issue", "rotate", "revoke"];
    return (
      <div style={actionCatalogStyle}>
        {supportedActions.map((actionKind) => {
          const action = getActionByKind(availableActions, actionKind);
          return (
            <div key={actionKind} style={actionDescriptorStyle}>
              <div style={descriptorTitleRowStyle}>
                <strong>{getActionLabel(actionKind)}</strong>
                <CanvasPill theme={th} tone={getActionTone(actionKind)}>
                  {action ? getRiskLabel(action.riskLevel) : "Unavailable"}
                </CanvasPill>
              </div>
              <div style={formNoteStyle}>
                {getActionDescription(actionKind)}
              </div>
              {action?.enabled === false ? (
                <div style={formNoteStyle}>
                  停用原因: {action.disabledReasonCode ?? "action_disabled"}
                </div>
              ) : null}
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
      h: "NAME",
      w: 290,
      r: (row) => {
        const state = resolveApiKeyState(row);
        return (
          <div style={nameCellStyle}>
            <span style={namePrimaryStyle}>{row.keyName}</span>
            <div style={nameMetaRowStyle}>
              <span>{row.apiKeyId}</span>
              {state === "revoked" ? (
                <span>revoked {formatDateTime(row.revokedAt)}</span>
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
      h: "PREFIX",
      k: "keyPrefix",
      w: 110,
      mono: true,
    },
    {
      h: "MASK",
      w: 120,
      mono: true,
      r: (row) => `••••${row.maskedSuffix}`,
    },
    {
      h: "SCOPE",
      w: 270,
      mono: true,
      r: (row) => (
        <div style={scopeTextStyle}>
          {row.scopes.length > 0 ? row.scopes.join(" · ") : "—"}
        </div>
      ),
    },
    {
      h: "LAST",
      w: 142,
      mono: true,
      r: (row) => formatDateTime(row.lastUsedAt),
    },
    {
      h: "EXPIRES",
      w: 142,
      mono: true,
      r: (row) => formatDateTime(row.expiresAt),
    },
    {
      h: "STATE",
      w: 108,
      r: (row) => {
        const state = resolveApiKeyState(row);
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
        subtitle="plaintext-once issuance · least privilege scopes · T5 refresh tier"
        tabs={["Inventory", "Issue / Rotate", "Governance"]}
        activeTab="Inventory"
        actions={
          <>
            <CanvasBtn theme={th} size="sm" onClick={() => router.refresh()}>
              Refresh T5
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
          title="Q-TEN09: 完整明文只顯示一次"
          body="Issue 與 rotate 成功後都只會在 modal 內揭露一次完整 key。關閉後僅保留 key prefix 與 masked suffix，遺失請重新輪替。"
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
            title="部分 API key 資料無法載入"
            body={errors.join(" · ")}
          />
        ) : null}

        <section style={overviewGridStyle}>
          <CanvasKPI
            theme={th}
            label="Active"
            value={String(kpis.active)}
            sub="usable"
          />
          <CanvasKPI
            theme={th}
            label="Expiring"
            value={String(kpis.expiring)}
            sub="<= 7 days"
          />
          <CanvasKPI
            theme={th}
            label="Revoked"
            value={String(kpis.revoked)}
            sub="audit visible"
          />
          <CanvasKPI
            theme={th}
            label="Refresh tier"
            value="T5"
            sub="30s target"
          />
        </section>

        <section style={actionLaneStyle}>
          <CanvasCard
            theme={th}
            title={
              editorMode === "rotate" && selectedKey
                ? `輪替 ${selectedKey.keyName}`
                : "建立 API 金鑰"
            }
            subtitle="可用操作由 availableActions 決定；高風險動作不再依角色名稱硬編碼。"
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
                      placeholder="Operations reporting integration"
                      style={nativeInputStyle}
                    />
                  </CanvasField>
                  <CanvasField
                    theme={th}
                    label="到期時間"
                    hint={
                      governance
                        ? `ISO 8601 with timezone；留空則遵循預設 ${governance.apiKeyPolicy.defaultLifetimeDays} 天。`
                        : "例如 2026-08-09T01:52:30Z"
                    }
                  >
                    <input
                      value={draftExpiresAt}
                      onChange={(event) =>
                        setDraftExpiresAt(event.target.value)
                      }
                      placeholder="2026-08-09T01:52:30Z"
                      style={nativeMonoInputStyle}
                    />
                  </CanvasField>
                </div>

                <CanvasField
                  theme={th}
                  label="Scopes"
                  required
                  hint="至少選擇一個 published scope。Rotate 預設沿用原 scope，但可在送出前微調。"
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
                        Governance policy 尚未載入或未提供 allowed
                        scope，暫時無法送出。
                      </div>
                    )}
                  </div>
                </CanvasField>

                <div style={formFooterStyle}>
                  <div style={formNoteStyle}>
                    {governance
                      ? `Default ${governance.apiKeyPolicy.defaultLifetimeDays} days · Max ${governance.apiKeyPolicy.maxLifetimeDays} days · Revoke effect ${governance.apiKeyPolicy.revokeEffect}`
                      : "Governance policy unavailable"}
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
                從上方 CTA 或清單列操作開啟 issue / rotate 表單。
              </div>
            )}
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="可用操作"
            subtitle="Risk tier 與 disabled reason 直接映射 availableActions。"
          >
            {renderActionCatalog()}
          </CanvasCard>
        </section>

        <section style={secondaryCardGridStyle}>
          <CanvasCard
            theme={th}
            title="Inventory"
            subtitle="搜尋 key name、ID、scope；並保留 revoked / expired 視圖供稽核追蹤。"
          >
            <div style={compactFieldGridStyle}>
              <CanvasField theme={th} label="搜尋">
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="搜尋 key name、ID、scope"
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
                  <option value="active">active</option>
                  <option value="expiring">expiring</option>
                  <option value="expired">expired</option>
                  <option value="revoked">revoked</option>
                </select>
              </CanvasField>
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="Governance package"
            subtitle="Published policy snapshot for this tenant integration surface."
          >
            {governance ? (
              <>
                <CanvasDL
                  theme={th}
                  cols={2}
                  items={[
                    {
                      k: "Identity",
                      v:
                        identity?.roles.join(", ") ||
                        identity?.actorType ||
                        "unavailable",
                    },
                    {
                      k: "Generated",
                      v: formatDateTime(governance.generatedAt),
                      mono: true,
                    },
                    {
                      k: "Default life",
                      v: `${governance.apiKeyPolicy.defaultLifetimeDays} days`,
                      mono: true,
                    },
                    {
                      k: "Maximum",
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
                      k: "Break-glass",
                      v: governance.apiKeyPolicy
                        .breakGlassRequiresPlatformApproval
                        ? "platform approval"
                        : "not published",
                      mono: true,
                    },
                  ]}
                />

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
                    <div style={{ ...sectionLabelStyle, marginTop: 14 }}>
                      Compatibility aliases
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
              </>
            ) : (
              <div style={formNoteStyle}>
                Integration governance could not be loaded for this tenant.
              </div>
            )}
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="Deep links"
            subtitle="從 API key inventory 直接跳往相依模組與稽核視角。"
          >
            <div style={deepLinkListStyle}>
              <div style={deepLinkItemStyle}>
                <div>
                  <strong>Webhook 管理</strong>
                  <div style={formNoteStyle}>
                    檢查 key 對應的 webhook receiver 是否已就緒。
                  </div>
                </div>
                <Link href="/webhooks" style={textLinkStyle}>
                  /webhooks
                </Link>
              </div>
              <div style={deepLinkItemStyle}>
                <div>
                  <strong>租戶設定</strong>
                  <div style={formNoteStyle}>
                    對照通知、SLA 與 billing 等整體整合設定。
                  </div>
                </div>
                <Link href="/settings" style={textLinkStyle}>
                  /settings
                </Link>
              </div>
              <div style={deepLinkItemStyle}>
                <div>
                  <strong>Partner entry</strong>
                  <div style={formNoteStyle}>
                    驗證 partner bootstrap surface 對新 key 的操作說明。
                  </div>
                </div>
                <Link href="/partner" style={textLinkStyle}>
                  /partner
                </Link>
              </div>
              <div style={deepLinkItemStyle}>
                <div>
                  <strong>稽核紀錄</strong>
                  <div style={formNoteStyle}>
                    Issue / rotate / revoke 後可回到 audit lane 追蹤動作。
                  </div>
                </div>
                <Link href="/audit" style={textLinkStyle}>
                  /audit
                </Link>
              </div>
            </div>
          </CanvasCard>
        </section>

        <CanvasCard theme={th} title="API key inventory" padding={0}>
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
                  完整 plaintext 只會顯示這一次。關閉後請改用 masked suffix 與
                  audit trail 追蹤。
                </div>
              </div>
              <CanvasPill theme={th} tone="warn">
                Once only
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
                  前往 /audit
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
                  我已安全保存這組 API key，了解關閉後只能再看到 masked suffix，
                  若遺失必須重新 issue / rotate。
                </span>
              </label>
            </div>
            <div style={modalFooterStyle}>
              <div style={formNoteStyle}>
                {flash.keyName
                  ? `${flash.keyName} · ${flash.action === "rotate" ? "rotated" : "issued"}`
                  : "Persist this key outside the UI before closing."}
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
                  高風險操作。撤銷後此 key 不可再次用於認證，且必須先填寫原因。
                </div>
              </div>
              <CanvasPill theme={th} tone="danger">
                High risk
              </CanvasPill>
            </div>
            <div style={modalBodyStyle}>
              <CanvasDL
                theme={th}
                cols={2}
                items={[
                  { k: "Key", v: revokeTarget.keyName },
                  { k: "ID", v: revokeTarget.apiKeyId, mono: true },
                  {
                    k: "Mask",
                    v: `${revokeTarget.keyPrefix}••••${revokeTarget.maskedSuffix}`,
                    mono: true,
                  },
                  {
                    k: "Last used",
                    v: formatDateTime(revokeTarget.lastUsedAt),
                    mono: true,
                  },
                ]}
              />
              <CanvasField
                theme={th}
                label="撤銷原因"
                required
                hint="例如 credential exposure、integration sunset、scope reduction。"
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
