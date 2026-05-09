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
    return "Not available";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatShortDate(value: string | null | undefined) {
  if (!value) {
    return "No expiry";
  }

  return new Intl.DateTimeFormat("en", {
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
      label: "Revoked",
      tone: "#9f1239",
      background: "rgba(244, 63, 94, 0.12)",
      detail: `Revoked ${formatDateTime(key.revokedAt)}`,
    };
  }

  if (key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now()) {
    return {
      label: "Expired",
      tone: "#b45309",
      background: "rgba(245, 158, 11, 0.14)",
      detail: `Expired ${formatDateTime(key.expiresAt)}`,
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
      label: "Expiring soon",
      tone: "#b45309",
      background: "rgba(245, 158, 11, 0.14)",
      detail: `Expires ${formatDateTime(key.expiresAt)}`,
    };
  }

  return {
    label: "Active",
    tone: "#0f766e",
    background: "rgba(15, 118, 110, 0.12)",
    detail: key.expiresAt
      ? `Expires ${formatDateTime(key.expiresAt)}`
      : "No expiry recorded",
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
    errors.push(
      `API keys: ${apiKeysResult.reason instanceof Error ? apiKeysResult.reason.message : "Unknown error"}`,
    );
  }
  if (governanceResult.status === "rejected") {
    errors.push(
      `Integration governance: ${governanceResult.reason instanceof Error ? governanceResult.reason.message : "Unknown error"}`,
    );
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
  let expirySummary = "Authority default lifetime";

  if (preset === "custom") {
    if (!customExpiresAt) {
      if (policy.requireExpiry) {
        throw new Error(
          "Choose a custom expiry or use one of the governance presets.",
        );
      }
      return { expiresAt: null, expirySummary };
    }
    expiresAt = new Date(customExpiresAt).toISOString();
    expirySummary = `Custom expiry: ${formatDateTime(expiresAt)}`;
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
    expirySummary = `Preset expiry: ${days} day(s)`;
  }

  if (!expiresAt) {
    return { expiresAt, expirySummary };
  }

  const maxLifetimeMillis =
    (policy.maxLifetimeDays || DEFAULT_MAX_LIFETIME_DAYS) * 24 * 60 * 60 * 1000;
  const expiryMillis = new Date(expiresAt).getTime();
  if (Number.isNaN(expiryMillis)) {
    throw new Error("Invalid expiry date.");
  }
  if (expiryMillis <= Date.now()) {
    throw new Error("Expiry must be in the future.");
  }
  if (expiryMillis - Date.now() > maxLifetimeMillis) {
    throw new Error(
      `Expiry exceeds the ${policy.maxLifetimeDays}-day governance limit.`,
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

  if (oneTimeKeyFlash) {
    redirect("/api-keys/reveal");
  }

  const rotateKeyId = resolvedSearchParams.rotate;
  const issueMode = resolvedSearchParams.issue === "true";
  const rotatingKey = rotateKeyId
    ? (apiKeys.find((key) => key.apiKeyId === rotateKeyId) ?? null)
    : null;
  const activeKeyCount = apiKeys.filter((key) => !key.revokedAt).length;
  const unusedKeyCount = apiKeys.filter(
    (key) => !key.lastUsedAt && !key.revokedAt,
  ).length;

  return (
    <main className="app-grid">
      <AppShellCard
        title="API Keys"
        description={
          roleSnapshot.capabilities.canManageApiKeys
            ? "Give tenant integration owners a governed place to issue, rotate, and revoke credentials without losing scope, expiry, or last-used visibility."
            : "Backend identity resolves this tenant session as read-only for API key governance. Credential inventory remains visible for audit, but issue/rotate/revoke stays tenant-admin only."
        }
      >
        {errors.map((error) => (
          <div key={error} className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        ))}

        {resolvedSearchParams.success ? (
          <div className="success-banner">
            <strong>Success:</strong> {resolvedSearchParams.success}
          </div>
        ) : null}

        {resolvedSearchParams.error ? (
          <div className="error-banner">
            <strong>Error:</strong> {resolvedSearchParams.error}
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
            <span className="metric-label">Active keys</span>
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
              Revoked and expired credentials are kept visible for audit
              context.
            </p>
          </div>
          <div style={infoPanelStyle}>
            <span className="metric-label">Unused keys</span>
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
              Review unused secrets before they drift into long-lived risk.
            </p>
          </div>
          <div style={infoPanelStyle}>
            <span className="metric-label">Rotation window</span>
            <div
              style={{
                fontSize: "1.8rem",
                fontWeight: 700,
                marginTop: "0.5rem",
              }}
            >
              {policy.defaultLifetimeDays}d
            </div>
            <p className="muted-copy">
              Recommended lifetime. Hard maximum is {policy.maxLifetimeDays}{" "}
              days.
            </p>
          </div>
        </section>

        <section style={{ ...infoPanelStyle, marginBottom: "1rem" }}>
          <strong>Governed scope catalog</strong>
          <p className="muted-copy" style={{ marginTop: "0.45rem" }}>
            Tenant-issued keys stay inside the authority-approved scope list.
            Break-glass access is a platform-admin process, not a self-service
            checkbox.
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
                {scope}
              </span>
            ))}
          </div>
          <p className="muted-copy" style={{ marginTop: "0.85rem" }}>
            Expiry{" "}
            {policy.requireExpiry ? "is required" : "defaults at the authority"}
            . Revoke effect: {policy.revokeEffect}. Compatibility aliases:{" "}
            {Object.keys(policy.compatibilityAliases).length > 0
              ? Object.entries(policy.compatibilityAliases)
                  .map(([alias, canonical]) => `${alias} -> ${canonical}`)
                  .join(", ")
              : "none"}
            .
          </p>
        </section>

        {rotatingKey ? (
          roleSnapshot.capabilities.canManageApiKeys ? (
            <RotateKeyForm apiKey={rotatingKey} policy={policy} />
          ) : (
            <div className="error-banner">
              <strong>Access denied:</strong> Tenant admin authority is required
              to rotate API keys.
            </div>
          )
        ) : issueMode ? (
          roleSnapshot.capabilities.canManageApiKeys ? (
            <IssueKeyForm policy={policy} />
          ) : (
            <div className="error-banner">
              <strong>Access denied:</strong> Tenant admin authority is required
              to issue API keys.
            </div>
          )
        ) : (
          <>
            {roleSnapshot.capabilities.canManageApiKeys ? (
              <div className="form-actions" style={{ marginBottom: "1rem" }}>
                <Link href="/api-keys?issue=true" className="btn-primary">
                  Issue New Key
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
          <strong>Back to home</strong>
          Return to the tenant portal overview.
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
      <label>Scopes *</label>
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
            <code>{scope}</code>
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
        <label htmlFor="lifetimePreset">Expiry policy *</label>
        <select
          id="lifetimePreset"
          name="lifetimePreset"
          defaultValue="recommended"
        >
          <option value="recommended">
            Recommended ({policy.defaultLifetimeDays} days)
          </option>
          <option value="short">Short-lived (30 days)</option>
          <option value="max">Maximum ({policy.maxLifetimeDays} days)</option>
          <option value="custom">Custom datetime</option>
        </select>
      </div>
      <div className="form-row">
        <label htmlFor="expiresAt">Custom expiry</label>
        <input type="datetime-local" id="expiresAt" name="expiresAt" />
        <p className="muted-copy" style={{ marginTop: "0.35rem" }}>
          Used only when the preset is set to custom.
        </p>
      </div>
    </>
  );
}

function IssueKeyForm({ policy }: { policy: TenantApiKeyGovernancePolicy }) {
  return (
    <div className="form-section">
      <h3>Issue New API Key</h3>
      <p className="muted-copy">
        Create a tenant-scoped credential with explicit lifetime and auditable
        scope selection.
      </p>
      <form action={issueApiKey} className="form-grid">
        <div className="form-row">
          <label htmlFor="keyName">Key Name *</label>
          <input
            type="text"
            id="keyName"
            name="keyName"
            placeholder="e.g., production-booking-sync"
            required
          />
        </div>
        <ScopeChecklist allowedScopes={policy.allowedScopes} />
        <ExpiryControls policy={policy} />
        <div className="form-actions">
          <button type="submit">Issue Key</button>
          <Link href="/api-keys">Cancel</Link>
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
      <h3>Rotate API Key</h3>
      <p className="muted-copy">
        Rotating revokes the current credential immediately and issues a new
        plaintext key one time.
      </p>
      <div style={{ ...infoPanelStyle, marginBottom: "1rem" }}>
        <strong>{apiKey.keyName}</strong>
        <p className="muted-copy" style={{ marginTop: "0.45rem" }}>
          Prefix <code>{apiKey.keyPrefix}</code>, suffix{" "}
          <code>{apiKey.maskedSuffix}</code>, last used{" "}
          {formatDateTime(apiKey.lastUsedAt)}.
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
          <label htmlFor="keyName">Key Name *</label>
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
          <button type="submit">Rotate Key</button>
          <Link href="/api-keys">Cancel</Link>
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
          No API keys found. Issue a governed credential to get started.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Credential</th>
              <th>Scopes</th>
              <th>Last used</th>
              <th>Expiry</th>
              <th>Created</th>
              <th>Status</th>
              <th>Actions</th>
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
                  <td>{key.scopes.join(", ")}</td>
                  <td>
                    {key.lastUsedAt
                      ? formatDateTime(key.lastUsedAt)
                      : "Never used"}
                  </td>
                  <td>
                    <strong>{formatShortDate(key.expiresAt)}</strong>
                    <div
                      className="muted-copy"
                      style={{ marginTop: "0.35rem" }}
                    >
                      {key.expiresAt
                        ? formatDateTime(key.expiresAt)
                        : "Authority default / none"}
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
                          Rotate
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
                            confirmMessage={`Revoke API key "${key.keyName}" immediately? This cannot be undone.`}
                          >
                            Revoke
                          </ConfirmSubmitButton>
                        </form>
                      </>
                    ) : (
                      <span className="muted-copy">Audit only</span>
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
    "Tenant admin authority required to issue API keys.",
  );
  const client = await getTenantClient();
  const scopes = parseScopeValues(formData);
  let destination = "/api-keys";

  try {
    const policy = (await client.getTenantIntegrationGovernancePackage())
      .apiKeyPolicy;

    if (scopes.length === 0) {
      throw new Error("Select at least one scope.");
    }

    const invalidScopes = scopes.filter(
      (scope) => !policy.allowedScopes.includes(scope),
    );
    if (invalidScopes.length > 0) {
      throw new Error(
        `Unsupported scope selection: ${invalidScopes.join(", ")}`,
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
      throw new Error("Key name is required.");
    }

    const result = await client.issueApiKey(command);
    await writeOneTimeKeyFlash(result);
    revalidatePath("/api-keys");
    destination = `/api-keys/reveal?success=${encodeURIComponent(
      `Issued ${result.apiKey.keyName} with ${scopes.length} scope(s). ${expirySummary}.`,
    )}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    destination = `/api-keys?issue=true&error=${encodeURIComponent(message)}`;
  }

  redirect(destination);
}

async function rotateApiKey(formData: FormData) {
  "use server";

  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canManageApiKeys,
    "Tenant admin authority required to rotate API keys.",
  );
  const client = await getTenantClient();
  const apiKeyId = String(formData.get("apiKeyId") ?? "");
  const scopes = parseScopeValues(formData);
  let destination = "/api-keys";

  try {
    const policy = (await client.getTenantIntegrationGovernancePackage())
      .apiKeyPolicy;

    if (!apiKeyId) {
      throw new Error("API key ID is required.");
    }
    if (scopes.length === 0) {
      throw new Error("Select at least one scope.");
    }

    const invalidScopes = scopes.filter(
      (scope) => !policy.allowedScopes.includes(scope),
    );
    if (invalidScopes.length > 0) {
      throw new Error(
        `Unsupported scope selection: ${invalidScopes.join(", ")}`,
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
      throw new Error("Key name is required.");
    }

    const result = await client.rotateApiKey(apiKeyId, command);
    await writeOneTimeKeyFlash(result);
    revalidatePath("/api-keys");
    destination = `/api-keys/reveal?success=${encodeURIComponent(
      `Rotated ${result.apiKey.keyName}. Previous key revoked immediately. ${expirySummary}.`,
    )}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    destination = `/api-keys?rotate=${encodeURIComponent(apiKeyId)}&error=${encodeURIComponent(message)}`;
  }

  redirect(destination);
}

async function revokeApiKey(formData: FormData) {
  "use server";

  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canManageApiKeys,
    "Tenant admin authority required to revoke API keys.",
  );
  const client = await getTenantClient();
  const apiKeyId = String(formData.get("apiKeyId") ?? "");
  let destination = "/api-keys";

  try {
    if (!apiKeyId) {
      throw new Error("API key ID is required.");
    }

    await client.revokeApiKey(apiKeyId);
    revalidatePath("/api-keys");
    destination = `/api-keys?success=${encodeURIComponent("API key revoked immediately.")}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    destination = `/api-keys?error=${encodeURIComponent(message)}`;
  }

  redirect(destination);
}
