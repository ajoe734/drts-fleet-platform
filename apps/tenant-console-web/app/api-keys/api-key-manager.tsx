"use client";

import type { CSSProperties } from "react";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
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
};

type ApiKeyState = "active" | "expiring" | "expired" | "revoked";
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

const actionCardGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
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
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginTop: 4,
};

const formNoteStyle: CSSProperties = {
  fontSize: 11,
  color: th.textMuted,
  lineHeight: 1.45,
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
  alignItems: "center",
  gap: 8,
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

const inlineDangerActionStyle: CSSProperties = {
  ...inlineActionStyle,
  color: th.danger,
};

const dividerStyle: CSSProperties = {
  color: th.textDim,
};

const scopeTextStyle: CSSProperties = {
  whiteSpace: "normal",
  lineHeight: 1.4,
};

const bannerBodyStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
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

const tableEmptyStyle: CSSProperties = {
  padding: 24,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
};

const sectionLabelStyle: CSSProperties = {
  marginTop: 14,
  marginBottom: 8,
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: th.textMuted,
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
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return dateTimeFormatter.format(parsed);
}

function isRevoked(apiKey: TenantApiKeyRecord) {
  return Boolean(apiKey.revokedAt);
}

function resolveApiKeyState(apiKey: TenantApiKeyRecord): ApiKeyState {
  if (isRevoked(apiKey)) {
    return "revoked";
  }

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

function buildRotateFormData(apiKey: TenantApiKeyRecord) {
  const formData = new FormData();
  formData.set("apiKeyId", apiKey.apiKeyId);
  formData.set("keyName", apiKey.keyName);
  if (apiKey.expiresAt) {
    formData.set("expiresAt", apiKey.expiresAt);
  }
  apiKey.scopes.forEach((scope) => formData.append("scopes", scope));
  return formData;
}

function buildRevokeFormData(apiKey: TenantApiKeyRecord) {
  const formData = new FormData();
  formData.set("apiKeyId", apiKey.apiKeyId);
  formData.set("keyName", apiKey.keyName);
  return formData;
}

export function ApiKeyManager({
  apiKeys,
  governance,
  errors,
}: ApiKeyManagerProps) {
  const router = useRouter();
  const [flash, setFlash] = useState<ApiKeyFlashPayload | null>(null);
  const [pending, startTransition] = useTransition();
  const [showCreateCard, setShowCreateCard] = useState(false);
  const [showPolicyCard, setShowPolicyCard] = useState(false);
  const allowedScopes = governance?.apiKeyPolicy.allowedScopes ?? [];
  const compatibilityAliases = Object.entries(
    governance?.apiKeyPolicy.compatibilityAliases ?? {},
  );
  const [draftName, setDraftName] = useState("");
  const [draftExpiresAt, setDraftExpiresAt] = useState("");
  const [draftScopes, setDraftScopes] = useState<string[]>(allowedScopes);

  useEffect(() => {
    setDraftScopes((current) => {
      const filtered = current.filter((scope) => allowedScopes.includes(scope));
      if (filtered.length > 0) {
        return filtered;
      }
      return [...allowedScopes];
    });
  }, [allowedScopes]);

  const sortedKeys = [...apiKeys].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );

  function resetCreateDraft() {
    setDraftName("");
    setDraftExpiresAt("");
    setDraftScopes([...allowedScopes]);
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
    },
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

  function renderPrimaryBanner() {
    if (flash?.plaintextKey) {
      return (
        <CanvasBanner
          theme={th}
          tone="info"
          icon="warn"
          title="新的完整金鑰只顯示一次"
          body={
            <div style={bannerBodyStyle}>
              <span>{flash.description}</span>
              <code style={plaintextKeyStyle}>{flash.plaintextKey}</code>
            </div>
          }
        />
      );
    }

    if (flash) {
      return (
        <CanvasBanner
          theme={th}
          tone={flash.tone === "warning" ? "warn" : "success"}
          icon="warn"
          title={flash.title}
          body={flash.description}
        />
      );
    }

    return (
      <CanvasBanner
        theme={th}
        tone="info"
        icon="warn"
        title="只在建立當下顯示完整金鑰"
        body="關閉視窗後僅顯示 mask；遺失須重新建立。請務必妥善保存。"
      />
    );
  }

  const columns: CanvasTableColumn<ApiKeyRow>[] = [
    {
      h: "NAME",
      w: 280,
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
                    disabled={pending}
                    onClick={() => {
                      setFlash(null);
                      runAction(
                        rotateTenantApiKeyAction,
                        buildRotateFormData(row),
                      );
                    }}
                    style={{
                      ...inlineActionStyle,
                      cursor: pending ? "not-allowed" : "pointer",
                      opacity: pending ? 0.55 : 1,
                    }}
                    type="button"
                  >
                    輪替
                  </button>
                  <span style={dividerStyle}>/</span>
                  <button
                    disabled={pending}
                    onClick={() => {
                      setFlash(null);
                      runAction(
                        revokeTenantApiKeyAction,
                        buildRevokeFormData(row),
                      );
                    }}
                    style={{
                      ...inlineDangerActionStyle,
                      cursor: pending ? "not-allowed" : "pointer",
                      opacity: pending ? 0.55 : 1,
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
      w: 280,
      mono: true,
      r: (row) => (
        <div style={scopeTextStyle}>
          {row.scopes.length > 0 ? row.scopes.join(" · ") : "—"}
        </div>
      ),
    },
    {
      h: "LAST",
      w: 144,
      mono: true,
      r: (row) => formatDateTime(row.lastUsedAt),
    },
    {
      h: "EXPIRES",
      w: 144,
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
        subtitle="Live 與 sandbox · scope · last seen · 撤銷後永久不可復原"
        actions={
          <>
            <CanvasBtn
              theme={th}
              icon="ext"
              onClick={() => setShowPolicyCard((current) => !current)}
              size="sm"
            >
              API 文件
            </CanvasBtn>
            <CanvasBtn
              theme={th}
              variant="primary"
              icon="plus"
              onClick={() => setShowCreateCard((current) => !current)}
              size="sm"
            >
              建立金鑰
            </CanvasBtn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {renderPrimaryBanner()}

        {errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分 API 金鑰資料無法載入"
            body={errors.join(" · ")}
          />
        ) : null}

        {showCreateCard || showPolicyCard ? (
          <div style={actionCardGridStyle}>
            {showCreateCard ? (
              <CanvasCard
                theme={th}
                title="建立金鑰"
                subtitle="Plaintext 只在成功建立或輪替時揭露一次。"
                actions={
                  <CanvasBtn
                    theme={th}
                    variant="ghost"
                    onClick={() => setShowCreateCard(false)}
                    size="xs"
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
                          resetCreateDraft();
                          setShowCreateCard(false);
                        },
                      },
                    );
                  }}
                >
                  <div style={fieldGridStyle}>
                    <CanvasField theme={th} label="名稱" required>
                      <input
                        onChange={(event) => setDraftName(event.target.value)}
                        placeholder="Operations reporting integration"
                        required
                        style={nativeInputStyle}
                        value={draftName}
                      />
                    </CanvasField>
                    <CanvasField
                      theme={th}
                      hint={
                        governance
                          ? `請填入 ISO 8601 與時區；留空則使用預設 ${governance.apiKeyPolicy.defaultLifetimeDays} 天。`
                          : "請填入 ISO 8601 與時區，例如 2026-08-09T01:52:30Z。"
                      }
                      label="到期時間"
                    >
                      <input
                        onChange={(event) =>
                          setDraftExpiresAt(event.target.value)
                        }
                        placeholder="2026-08-09T01:52:30Z"
                        spellCheck={false}
                        style={nativeMonoInputStyle}
                        value={draftExpiresAt}
                      />
                    </CanvasField>
                  </div>

                  <CanvasField
                    theme={th}
                    hint="至少選擇一個已發布 scope；輪替時會沿用該金鑰當前的 scope。"
                    label="Scopes"
                    required
                  >
                    <div style={scopeGridStyle}>
                      {allowedScopes.length > 0 ? (
                        allowedScopes.map((scope) => {
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
                          Governance policy 尚未載入，暫時無法建立新金鑰。
                        </div>
                      )}
                    </div>
                  </CanvasField>

                  <div style={formFooterStyle}>
                    <div style={formNoteStyle}>
                      {governance
                        ? `Default ${governance.apiKeyPolicy.defaultLifetimeDays} days · Max ${governance.apiKeyPolicy.maxLifetimeDays} days`
                        : "Integration governance unavailable"}
                    </div>
                    <button
                      disabled={
                        pending ||
                        draftName.trim().length === 0 ||
                        draftScopes.length === 0
                      }
                      style={{
                        ...primaryButtonStyle,
                        cursor:
                          pending ||
                          draftName.trim().length === 0 ||
                          draftScopes.length === 0
                            ? "not-allowed"
                            : "pointer",
                        opacity:
                          pending ||
                          draftName.trim().length === 0 ||
                          draftScopes.length === 0
                            ? 0.55
                            : 1,
                      }}
                      type="submit"
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
                title="API 文件"
                subtitle="Published tenant integration governance package"
                actions={
                  <CanvasBtn
                    theme={th}
                    variant="ghost"
                    onClick={() => setShowPolicyCard(false)}
                    size="xs"
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
                          k: "Default",
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
                          k: "Revoke",
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

                    <div style={sectionLabelStyle}>Allowed scopes</div>
                    <div style={scopeGridStyle}>
                      {allowedScopes.map((scope) => (
                        <CanvasPill key={scope} theme={th} tone="info">
                          {scope}
                        </CanvasPill>
                      ))}
                    </div>

                    {compatibilityAliases.length > 0 ? (
                      <>
                        <div style={sectionLabelStyle}>
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
                                {target}
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
            ) : null}
          </div>
        ) : null}

        <CanvasCard theme={th} padding={0}>
          {sortedKeys.length > 0 ? (
            <CanvasTable<ApiKeyRow>
              theme={th}
              columns={columns}
              rows={sortedKeys as ApiKeyRow[]}
            />
          ) : (
            <div style={tableEmptyStyle}>目前尚未建立任何租戶 API 金鑰。</div>
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
