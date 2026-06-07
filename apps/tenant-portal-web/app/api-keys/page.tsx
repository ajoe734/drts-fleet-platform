import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type {
  IssueTenantApiKeyCommand,
  RotateTenantApiKeyCommand,
  TenantApiKeyGovernancePolicy,
  TenantApiKeyIssued,
  TenantApiKeyRecord,
  TenantIntegrationGovernancePackage,
} from "@drts/contracts";
import { TENANT_API_KEY_ALLOWED_SCOPES } from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { getTenantRoleSnapshot, requireCapability } from "@/lib/rbac";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import {
  formatPortalSectionError,
  formatPortalUiError,
  toPortalErrorMessage,
} from "@/lib/error-copy";
import { formatPortalCodeLabel } from "@/lib/localized-labels";

export const dynamic = "force-dynamic";

const ONE_TIME_KEY_COOKIE = "tenant-api-key-flash";
const DEFAULT_MAX_LIFETIME_DAYS = 90;
const DEFAULT_RECOMMENDED_LIFETIME_DAYS = 60;

const infoPanelStyle = {
  borderRadius: "18px",
  border: "1px solid rgba(15, 23, 42, 0.08)",
  background: "rgba(255, 255, 255, 0.78)",
  padding: "1rem 1.1rem",
} as const;

const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  padding: "0.3rem 0.65rem",
  background: "rgba(15, 118, 110, 0.12)",
  color: "#0f766e",
  fontSize: "0.82rem",
  fontWeight: 700,
} as const;

type OneTimeKeyFlash = {
  keyId: string;
  keyName: string;
  plaintextKey: string;
  revokedApiKeyId: string | null;
};

type PageData = {
  apiKeys: TenantApiKeyRecord[];
  governance: TenantIntegrationGovernancePackage | null;
  errors: string[];
};

type ExpirySelection = {
  expiresAt: string | null;
  expirySummary: string;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "未提供";
  }

  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatShortDate(value: string | null | undefined) {
  if (!value) {
    return "未設定到期";
  }

  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function getFallbackPolicy(): TenantApiKeyGovernancePolicy {
  return {
    allowedScopes: [...TENANT_API_KEY_ALLOWED_SCOPES],
    compatibilityAliases: {},
    defaultLifetimeDays: DEFAULT_RECOMMENDED_LIFETIME_DAYS,
    maxLifetimeDays: DEFAULT_MAX_LIFETIME_DAYS,
    requireExpiry: false,
    breakGlassRequiresPlatformApproval: true,
    revokeEffect: "immediate",
  };
}

function resolveApiKeyStatus(key: TenantApiKeyRecord) {
  if (key.revokedAt) {
    return {
      kind: "revoked" as const,
      label: "已撤銷",
      tone: "#9f1239",
      background: "rgba(244, 63, 94, 0.12)",
      detail: `撤銷時間：${formatDateTime(key.revokedAt)}`,
    };
  }

  if (key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now()) {
    return {
      kind: "expired" as const,
      label: "已過期",
      tone: "#b45309",
      background: "rgba(245, 158, 11, 0.14)",
      detail: `過期時間：${formatDateTime(key.expiresAt)}`,
    };
  }

  const millisUntilExpiry = key.expiresAt
    ? new Date(key.expiresAt).getTime() - Date.now()
    : null;
  if (
    millisUntilExpiry !== null &&
    millisUntilExpiry <= 7 * 24 * 60 * 60 * 1000
  ) {
    return {
      kind: "expiring" as const,
      label: "即將到期",
      tone: "#b45309",
      background: "rgba(245, 158, 11, 0.14)",
      detail: `到期時間：${formatDateTime(key.expiresAt)}`,
    };
  }

  return {
    kind: "active" as const,
    label: "啟用中",
    tone: "#0f766e",
    background: "rgba(15, 118, 110, 0.12)",
    detail: key.expiresAt
      ? `到期時間：${formatDateTime(key.expiresAt)}`
      : "未設定到期時間",
  };
}

async function loadPageData(): Promise<PageData> {
  const client = await getTenantClient();
  const [apiKeysResult, governanceResult] = await Promise.allSettled([
    client.listApiKeys(),
    client.getTenantIntegrationGovernancePackage(),
  ]);

  const errors: string[] = [];
  if (apiKeysResult.status === "rejected") {
    errors.push(formatPortalSectionError("整合金鑰", apiKeysResult.reason));
  }
  if (governanceResult.status === "rejected") {
    errors.push(formatPortalSectionError("整合治理", governanceResult.reason));
  }

  return {
    apiKeys: apiKeysResult.status === "fulfilled" ? apiKeysResult.value : [],
    governance:
      governanceResult.status === "fulfilled" ? governanceResult.value : null,
    errors,
  };
}

function parseScopeValues(formData: FormData) {
  return formData
    .getAll("scopes")
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function resolveExpirySelection(
  formData: FormData,
  policy: TenantApiKeyGovernancePolicy,
): ExpirySelection {
  const preset = String(formData.get("lifetimePreset") ?? "recommended");
  const customExpiresAt = String(formData.get("expiresAt") ?? "").trim();
  let expiresAt: string | null = null;
  let expirySummary = "採用治理預設效期";

  if (preset === "custom") {
    if (!customExpiresAt) {
      if (policy.requireExpiry) {
        throw new Error("請選擇自訂到期時間，或改用治理預設的效期方案。");
      }
      return { expiresAt: null, expirySummary };
    }
    expiresAt = new Date(customExpiresAt).toISOString();
    expirySummary = `自訂到期：${formatDateTime(expiresAt)}`;
  } else {
    const days =
      preset === "short"
        ? 30
        : preset === "max"
          ? policy.maxLifetimeDays
          : policy.defaultLifetimeDays;
    const target = new Date();
    target.setUTCDate(target.getUTCDate() + days);
    expiresAt = target.toISOString();
    expirySummary = `預設效期：${days} 天`;
  }

  if (!expiresAt) {
    return { expiresAt, expirySummary };
  }

  const maxLifetimeMillis =
    (policy.maxLifetimeDays || DEFAULT_MAX_LIFETIME_DAYS) * 24 * 60 * 60 * 1000;
  const expiryMillis = new Date(expiresAt).getTime();
  if (Number.isNaN(expiryMillis)) {
    throw new Error("到期時間格式無效。");
  }
  if (expiryMillis <= Date.now()) {
    throw new Error("到期時間必須晚於現在。");
  }
  if (expiryMillis - Date.now() > maxLifetimeMillis) {
    throw new Error(
      `到期時間不可超過治理規定的 ${policy.maxLifetimeDays} 天上限。`,
    );
  }

  return { expiresAt, expirySummary };
}

async function writeOneTimeKeyFlash(result: TenantApiKeyIssued) {
  const cookieStore = await cookies();
  const payload: OneTimeKeyFlash = {
    keyId: result.apiKey.apiKeyId,
    keyName: result.apiKey.keyName,
    plaintextKey: result.plaintextKey,
    revokedApiKeyId: result.revokedApiKeyId,
  };

  cookieStore.set(
    ONE_TIME_KEY_COOKIE,
    Buffer.from(JSON.stringify(payload), "utf8").toString("base64url"),
    {
      httpOnly: true,
      maxAge: 120,
      path: "/api-keys",
      sameSite: "lax",
    },
  );
}

export default async function ApiKeysPage({
  searchParams,
}: {
  searchParams?: Promise<{
    rotate?: string;
    issue?: string;
    error?: string;
    success?: string;
  }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const cookieStore = await cookies();
  const roleSnapshot = await getTenantRoleSnapshot();
  const { apiKeys, governance, errors } = await loadPageData();
  const policy = governance?.apiKeyPolicy ?? getFallbackPolicy();
  const oneTimeKeyFlash = cookieStore.get(ONE_TIME_KEY_COOKIE)?.value;
  const actionError = resolvedSearchParams.error
    ? formatPortalUiError(resolvedSearchParams.error, "整合金鑰作業失敗")
    : null;

  if (oneTimeKeyFlash) {
    redirect("/api-keys/reveal");
  }

  const rotateKeyId = resolvedSearchParams.rotate;
  const issueMode = resolvedSearchParams.issue === "true";
  const rotatingKey = rotateKeyId
    ? (apiKeys.find((key) => key.apiKeyId === rotateKeyId) ?? null)
    : null;
  const isApiKeyUsable = (key: TenantApiKeyRecord) => {
    const status = resolveApiKeyStatus(key);
    return status.kind !== "revoked" && status.kind !== "expired";
  };
  const activeKeyCount = apiKeys.filter(isApiKeyUsable).length;
  const unusedKeyCount = apiKeys.filter(
    (key) => !key.lastUsedAt && isApiKeyUsable(key),
  ).length;

  return (
    <main className="app-grid">
      <AppShellCard
        title="整合金鑰"
        description={
          roleSnapshot.capabilities.canManageApiKeys
            ? "提供租戶整合管理者可治理的整合金鑰簽發、輪替與撤銷介面，同時保留權限範圍、效期與最後使用時間。"
            : "目前此租戶工作階段僅具整合金鑰治理唯讀權限。你仍可查看憑證清單供稽核使用，但簽發、輪替與撤銷仍限租戶管理員執行。"
        }
      >
        {errors.map((error, index) => (
          <div key={`${error}-${index}`} className="error-banner">
            <strong>錯誤：</strong> {error}
          </div>
        ))}

        {resolvedSearchParams.success ? (
          <div className="success-banner">
            <strong>成功：</strong> {resolvedSearchParams.success}
          </div>
        ) : null}

        {actionError ? (
          <div className="error-banner">
            <strong>錯誤：</strong> {actionError}
          </div>
        ) : null}

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "0.9rem",
            marginBottom: "1rem",
          }}
        >
          <div style={infoPanelStyle}>
            <span className="metric-label">可用金鑰</span>
            <div
              style={{
                fontSize: "1.8rem",
                fontWeight: 700,
                marginTop: "0.5rem",
              }}
            >
              {activeKeyCount}
            </div>
            <p className="muted-copy">
              已撤銷與已過期的憑證仍會保留在畫面上，方便追蹤稽核脈絡。
            </p>
          </div>
          <div style={infoPanelStyle}>
            <span className="metric-label">未曾使用</span>
            <div
              style={{
                fontSize: "1.8rem",
                fontWeight: 700,
                marginTop: "0.5rem",
              }}
            >
              {unusedKeyCount}
            </div>
            <p className="muted-copy">
              建議優先檢查長期未使用的金鑰，避免變成持續暴露的風險。
            </p>
          </div>
          <div style={infoPanelStyle}>
            <span className="metric-label">建議輪替窗</span>
            <div
              style={{
                fontSize: "1.8rem",
                fontWeight: 700,
                marginTop: "0.5rem",
              }}
            >
              {policy.defaultLifetimeDays} 天
            </div>
            <p className="muted-copy">
              建議效期。最長不得超過 {policy.maxLifetimeDays} 天。
            </p>
          </div>
        </section>

        <section style={{ ...infoPanelStyle, marginBottom: "1rem" }}>
          <strong>治理核准的權限範圍目錄</strong>
          <p className="muted-copy" style={{ marginTop: "0.45rem" }}>
            租戶自行簽發的金鑰只能使用已核准的權限範圍。緊急升權類型的例外
            仍屬平台管理流程，不是這個頁面的自助選項。
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.5rem",
              marginTop: "0.85rem",
            }}
          >
            {policy.allowedScopes.map((scope) => (
              <span key={scope} style={badgeStyle}>
                {formatPortalCodeLabel(scope, scope)}
              </span>
            ))}
          </div>
          <p className="muted-copy" style={{ marginTop: "0.85rem" }}>
            到期時間
            {policy.requireExpiry ? "為必填" : "可採治理預設"}
            。撤銷效果：{formatPortalCodeLabel(policy.revokeEffect)}。相容別名：
            {Object.keys(policy.compatibilityAliases).length > 0
              ? Object.entries(policy.compatibilityAliases)
                  .map(
                    ([alias, canonical]) =>
                      `${formatPortalCodeLabel(alias, alias)} 對應 ${formatPortalCodeLabel(canonical, canonical)}`,
                  )
                  .join("、")
              : "無"}
            。
          </p>
        </section>

        {rotatingKey ? (
          roleSnapshot.capabilities.canManageApiKeys ? (
            <RotateKeyForm apiKey={rotatingKey} policy={policy} />
          ) : (
            <div className="error-banner">
              <strong>權限不足：</strong> 輪替整合金鑰需要租戶管理員權限。
            </div>
          )
        ) : issueMode ? (
          roleSnapshot.capabilities.canManageApiKeys ? (
            <IssueKeyForm policy={policy} />
          ) : (
            <div className="error-banner">
              <strong>權限不足：</strong> 簽發整合金鑰需要租戶管理員權限。
            </div>
          )
        ) : (
          <>
            {roleSnapshot.capabilities.canManageApiKeys ? (
              <div className="form-actions" style={{ marginBottom: "1rem" }}>
                <Link href="/api-keys?issue=true" className="btn-primary">
                  簽發新金鑰
                </Link>
              </div>
            ) : null}
            <ApiKeyList
              apiKeys={apiKeys}
              canManage={roleSnapshot.capabilities.canManageApiKeys}
            />
          </>
        )}

        <Link className="route-link" href="/">
          <strong>返回首頁</strong>
          回到租戶入口總覽。
        </Link>
      </AppShellCard>
    </main>
  );
}

function ScopeChecklist({
  allowedScopes,
  defaultScopes,
}: {
  allowedScopes: string[];
  defaultScopes?: string[];
}) {
  const selected = new Set(defaultScopes ?? []);

  return (
    <div className="form-row">
      <label>權限範圍 *</label>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "0.55rem 0.9rem",
        }}
      >
        {allowedScopes.map((scope) => (
          <label
            key={scope}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.55rem",
              borderRadius: "12px",
              border: "1px solid rgba(15, 23, 42, 0.08)",
              padding: "0.7rem 0.8rem",
              background: "rgba(255, 255, 255, 0.72)",
            }}
          >
            <input
              type="checkbox"
              name="scopes"
              value={scope}
              defaultChecked={selected.has(scope)}
            />
            <span>{formatPortalCodeLabel(scope, scope)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function ExpiryControls({ policy }: { policy: TenantApiKeyGovernancePolicy }) {
  return (
    <>
      <div className="form-row">
        <label htmlFor="lifetimePreset">效期策略 *</label>
        <select
          id="lifetimePreset"
          name="lifetimePreset"
          defaultValue="recommended"
        >
          <option value="recommended">
            建議效期（{policy.defaultLifetimeDays} 天）
          </option>
          <option value="short">短效期（30 天）</option>
          <option value="max">最長效期（{policy.maxLifetimeDays} 天）</option>
          <option value="custom">自訂日期時間</option>
        </select>
      </div>
      <div className="form-row">
        <label htmlFor="expiresAt">自訂到期時間</label>
        <input type="datetime-local" id="expiresAt" name="expiresAt" />
        <p className="muted-copy" style={{ marginTop: "0.35rem" }}>
          只有在上方選擇「自訂日期時間」時才會使用這個欄位。
        </p>
      </div>
    </>
  );
}

function IssueKeyForm({ policy }: { policy: TenantApiKeyGovernancePolicy }) {
  return (
    <div className="form-section">
      <h3>簽發新整合金鑰</h3>
      <p className="muted-copy">
        建立具備明確效期與可稽核權限範圍選擇的租戶憑證。
      </p>
      <form action={issueApiKey} className="form-grid">
        <div className="form-row">
          <label htmlFor="keyName">金鑰名稱 *</label>
          <input
            type="text"
            id="keyName"
            name="keyName"
            placeholder="例如：正式環境訂單同步"
            required
          />
        </div>
        <ScopeChecklist allowedScopes={policy.allowedScopes} />
        <ExpiryControls policy={policy} />
        <div className="form-actions">
          <button type="submit">簽發金鑰</button>
          <Link href="/api-keys">取消</Link>
        </div>
      </form>
    </div>
  );
}

function RotateKeyForm({
  apiKey,
  policy,
}: {
  apiKey: TenantApiKeyRecord;
  policy: TenantApiKeyGovernancePolicy;
}) {
  const status = resolveApiKeyStatus(apiKey);

  return (
    <div className="form-section">
      <h3>輪替整合金鑰</h3>
      <p className="muted-copy">
        輪替會立即撤銷目前憑證，並只顯示一次新的明文金鑰。
      </p>
      <div style={{ ...infoPanelStyle, marginBottom: "1rem" }}>
        <strong>{apiKey.keyName}</strong>
        <p className="muted-copy" style={{ marginTop: "0.45rem" }}>
          前綴 <code>{apiKey.keyPrefix}</code>、尾碼{" "}
          <code>{apiKey.maskedSuffix}</code>，最後使用時間為{" "}
          {formatDateTime(apiKey.lastUsedAt)}。
        </p>
        <span
          style={{
            ...badgeStyle,
            marginTop: "0.75rem",
            background: status.background,
            color: status.tone,
          }}
        >
          {status.label}
        </span>
      </div>
      <form action={rotateApiKey} className="form-grid">
        <input type="hidden" name="apiKeyId" value={apiKey.apiKeyId} />
        <div className="form-row">
          <label htmlFor="keyName">金鑰名稱 *</label>
          <input
            type="text"
            id="keyName"
            name="keyName"
            defaultValue={apiKey.keyName}
            required
          />
        </div>
        <ScopeChecklist
          allowedScopes={policy.allowedScopes}
          defaultScopes={apiKey.scopes}
        />
        <ExpiryControls policy={policy} />
        <div className="form-actions">
          <button type="submit">確認輪替</button>
          <Link href="/api-keys">取消</Link>
        </div>
      </form>
    </div>
  );
}

function ApiKeyList({
  apiKeys,
  canManage,
}: {
  apiKeys: TenantApiKeyRecord[];
  canManage: boolean;
}) {
  return (
    <div className="data-table">
      {apiKeys.length === 0 ? (
        <p className="empty-state">
          目前沒有整合金鑰。簽發第一把治理憑證後即可開始使用。
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>憑證</th>
              <th>權限範圍</th>
              <th>最後使用</th>
              <th>到期</th>
              <th>建立時間</th>
              <th>狀態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {apiKeys.map((key) => {
              const status = resolveApiKeyStatus(key);

              return (
                <tr key={key.apiKeyId}>
                  <td>
                    <strong>{key.keyName}</strong>
                    <div
                      className="muted-copy"
                      style={{ marginTop: "0.35rem" }}
                    >
                      <code>{key.apiKeyId}</code>
                    </div>
                    <div
                      className="muted-copy"
                      style={{ marginTop: "0.35rem" }}
                    >
                      <code>
                        {key.keyPrefix}...{key.maskedSuffix}
                      </code>
                    </div>
                  </td>
                  <td>
                    {key.scopes
                      .map((scope) => formatPortalCodeLabel(scope, scope))
                      .join("、")}
                  </td>
                  <td>
                    {key.lastUsedAt
                      ? formatDateTime(key.lastUsedAt)
                      : "從未使用"}
                  </td>
                  <td>
                    <strong>{formatShortDate(key.expiresAt)}</strong>
                    <div
                      className="muted-copy"
                      style={{ marginTop: "0.35rem" }}
                    >
                      {key.expiresAt
                        ? formatDateTime(key.expiresAt)
                        : "依治理預設，不另設期限"}
                    </div>
                  </td>
                  <td>{formatDateTime(key.createdAt)}</td>
                  <td>
                    <span
                      style={{
                        ...badgeStyle,
                        background: status.background,
                        color: status.tone,
                      }}
                    >
                      {status.label}
                    </span>
                    <div
                      className="muted-copy"
                      style={{ marginTop: "0.35rem" }}
                    >
                      {status.detail}
                    </div>
                  </td>
                  <td>
                    {!key.revokedAt && canManage ? (
                      <>
                        <Link href={`/api-keys?rotate=${key.apiKeyId}`}>
                          輪替
                        </Link>
                        {" | "}
                        <form
                          action={revokeApiKey}
                          style={{ display: "inline" }}
                        >
                          <input
                            type="hidden"
                            name="apiKeyId"
                            value={key.apiKeyId}
                          />
                          <ConfirmSubmitButton
                            type="submit"
                            confirmMessage={`確定要立即撤銷整合金鑰「${key.keyName}」嗎？此操作無法復原。`}
                          >
                            撤銷
                          </ConfirmSubmitButton>
                        </form>
                      </>
                    ) : (
                      <span className="muted-copy">僅供稽核</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

async function issueApiKey(formData: FormData) {
  "use server";

  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canManageApiKeys,
    "簽發整合金鑰需要租戶管理員權限。",
  );
  const client = await getTenantClient();
  const scopes = parseScopeValues(formData);
  let destination = "/api-keys";

  try {
    const policy = (await client.getTenantIntegrationGovernancePackage())
      .apiKeyPolicy;

    if (scopes.length === 0) {
      throw new Error("請至少選擇一個權限範圍。");
    }

    const invalidScopes = scopes.filter(
      (scope) => !policy.allowedScopes.includes(scope),
    );
    if (invalidScopes.length > 0) {
      throw new Error(
        `所選權限範圍不受支援：${invalidScopes
          .map((scope) => formatPortalCodeLabel(scope, scope))
          .join("、")}`,
      );
    }

    const { expiresAt, expirySummary } = resolveExpirySelection(
      formData,
      policy,
    );
    const command: IssueTenantApiKeyCommand = {
      keyName: String(formData.get("keyName") ?? "").trim(),
      scopes,
      expiresAt,
    };

    if (!command.keyName) {
      throw new Error("金鑰名稱為必填。");
    }

    const result = await client.issueApiKey(command);
    await writeOneTimeKeyFlash(result);
    revalidatePath("/api-keys");
    destination = `/api-keys/reveal?success=${encodeURIComponent(
      `已簽發 ${result.apiKey.keyName}，共 ${scopes.length} 個權限範圍。${expirySummary}。`,
    )}`;
  } catch (error) {
    const message = formatPortalUiError(
      toPortalErrorMessage(error),
      "無法簽發整合金鑰",
    );
    destination = `/api-keys?issue=true&error=${encodeURIComponent(message)}`;
  }

  redirect(destination);
}

async function rotateApiKey(formData: FormData) {
  "use server";

  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canManageApiKeys,
    "輪替整合金鑰需要租戶管理員權限。",
  );
  const client = await getTenantClient();
  const apiKeyId = String(formData.get("apiKeyId") ?? "");
  const scopes = parseScopeValues(formData);
  let destination = "/api-keys";

  try {
    const policy = (await client.getTenantIntegrationGovernancePackage())
      .apiKeyPolicy;

    if (!apiKeyId) {
      throw new Error("整合金鑰編號為必填。");
    }
    if (scopes.length === 0) {
      throw new Error("請至少選擇一個權限範圍。");
    }

    const invalidScopes = scopes.filter(
      (scope) => !policy.allowedScopes.includes(scope),
    );
    if (invalidScopes.length > 0) {
      throw new Error(
        `所選權限範圍不受支援：${invalidScopes
          .map((scope) => formatPortalCodeLabel(scope, scope))
          .join("、")}`,
      );
    }

    const { expiresAt, expirySummary } = resolveExpirySelection(
      formData,
      policy,
    );
    const command: RotateTenantApiKeyCommand = {
      keyName: String(formData.get("keyName") ?? "").trim(),
      scopes,
      expiresAt,
    };

    if (!command.keyName) {
      throw new Error("金鑰名稱為必填。");
    }

    const result = await client.rotateApiKey(apiKeyId, command);
    await writeOneTimeKeyFlash(result);
    revalidatePath("/api-keys");
    destination = `/api-keys/reveal?success=${encodeURIComponent(
      `已輪替 ${result.apiKey.keyName}，前一把金鑰已立即撤銷。${expirySummary}。`,
    )}`;
  } catch (error) {
    const message = formatPortalUiError(
      toPortalErrorMessage(error),
      "無法輪替整合金鑰",
    );
    destination = `/api-keys?rotate=${encodeURIComponent(apiKeyId)}&error=${encodeURIComponent(message)}`;
  }

  redirect(destination);
}

async function revokeApiKey(formData: FormData) {
  "use server";

  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canManageApiKeys,
    "撤銷整合金鑰需要租戶管理員權限。",
  );
  const client = await getTenantClient();
  const apiKeyId = String(formData.get("apiKeyId") ?? "");
  let destination = "/api-keys";

  try {
    if (!apiKeyId) {
      throw new Error("整合金鑰編號為必填。");
    }

    await client.revokeApiKey(apiKeyId);
    revalidatePath("/api-keys");
    destination = `/api-keys?success=${encodeURIComponent("整合金鑰已立即撤銷。")}`;
  } catch (error) {
    const message = formatPortalUiError(
      toPortalErrorMessage(error),
      "無法撤銷整合金鑰",
    );
    destination = `/api-keys?error=${encodeURIComponent(message)}`;
  }

  redirect(destination);
}
