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
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import type { Locale } from "@/lib/translations";

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

function formatDateTime(value: string | null | undefined, locale: Locale) {
  if (!value) {
    return t("apiKeys.date.notAvailable", locale);
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatShortDate(value: string | null | undefined, locale: Locale) {
  if (!value) {
    return t("apiKeys.date.noExpiry", locale);
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en", {
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

function resolveApiKeyStatus(key: TenantApiKeyRecord, locale: Locale) {
  if (key.revokedAt) {
    return {
      code: "revoked" as const,
      label: t("apiKeys.status.revoked", locale),
      tone: "#9f1239",
      background: "rgba(244, 63, 94, 0.12)",
      detail: t("apiKeys.status.detail.revoked", locale, {
        date: formatDateTime(key.revokedAt, locale),
      }),
    };
  }

  if (key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now()) {
    return {
      code: "expired" as const,
      label: t("apiKeys.status.expired", locale),
      tone: "#b45309",
      background: "rgba(245, 158, 11, 0.14)",
      detail: t("apiKeys.status.detail.expired", locale, {
        date: formatDateTime(key.expiresAt, locale),
      }),
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
      code: "expiringSoon" as const,
      label: t("apiKeys.status.expiringSoon", locale),
      tone: "#b45309",
      background: "rgba(245, 158, 11, 0.14)",
      detail: t("apiKeys.status.detail.expires", locale, {
        date: formatDateTime(key.expiresAt, locale),
      }),
    };
  }

  return {
    code: "active" as const,
    label: t("apiKeys.status.active", locale),
    tone: "#0f766e",
    background: "rgba(15, 118, 110, 0.12)",
    detail: key.expiresAt
      ? t("apiKeys.status.detail.expires", locale, {
          date: formatDateTime(key.expiresAt, locale),
        })
      : t("apiKeys.status.detail.noExpiry", locale),
  };
}

async function loadPageData(locale: Locale): Promise<PageData> {
  const client = await getTenantClient();
  const [apiKeysResult, governanceResult] = await Promise.allSettled([
    client.listApiKeys(),
    client.getTenantIntegrationGovernancePackage(),
  ]);

  const errors: string[] = [];
  if (apiKeysResult.status === "rejected") {
    errors.push(
      t("apiKeys.error.loadApiKeys", locale, {
        message:
          apiKeysResult.reason instanceof Error
            ? apiKeysResult.reason.message
            : t("apiKeys.error.unknown", locale),
      }),
    );
  }
  if (governanceResult.status === "rejected") {
    errors.push(
      t("apiKeys.error.loadGovernance", locale, {
        message:
          governanceResult.reason instanceof Error
            ? governanceResult.reason.message
            : t("apiKeys.error.unknown", locale),
      }),
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
  locale: Locale,
): ExpirySelection {
  const preset = String(formData.get("lifetimePreset") ?? "recommended");
  const customExpiresAt = String(formData.get("expiresAt") ?? "").trim();
  let expiresAt: string | null = null;
  let expirySummary = t("apiKeys.expiry.summary.authorityDefault", locale);

  if (preset === "custom") {
    if (!customExpiresAt) {
      if (policy.requireExpiry) {
        throw new Error(t("apiKeys.error.expiryRequired", locale));
      }
      return { expiresAt: null, expirySummary };
    }
    expiresAt = new Date(customExpiresAt).toISOString();
    expirySummary = t("apiKeys.expiry.summary.custom", locale, {
      date: formatDateTime(expiresAt, locale),
    });
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
    expirySummary = t("apiKeys.expiry.summary.preset", locale, { days });
  }

  if (!expiresAt) {
    return { expiresAt, expirySummary };
  }

  const maxLifetimeMillis =
    (policy.maxLifetimeDays || DEFAULT_MAX_LIFETIME_DAYS) * 24 * 60 * 60 * 1000;
  const expiryMillis = new Date(expiresAt).getTime();
  if (Number.isNaN(expiryMillis)) {
    throw new Error(t("apiKeys.error.invalidExpiry", locale));
  }
  if (expiryMillis <= Date.now()) {
    throw new Error(t("apiKeys.error.expiryFuture", locale));
  }
  if (expiryMillis - Date.now() > maxLifetimeMillis) {
    throw new Error(
      t("apiKeys.error.expiryExceedsLimit", locale, {
        days: policy.maxLifetimeDays,
      }),
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
  const locale = await getServerLocale();
  const resolvedSearchParams = (await searchParams) ?? {};
  const cookieStore = await cookies();
  const roleSnapshot = await getTenantRoleSnapshot();
  const { apiKeys, governance, errors } = await loadPageData(locale);
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
  const isApiKeyUsable = (key: TenantApiKeyRecord) => {
    const status = resolveApiKeyStatus(key, locale);
    return status.code !== "revoked" && status.code !== "expired";
  };
  const activeKeyCount = apiKeys.filter(isApiKeyUsable).length;
  const unusedKeyCount = apiKeys.filter(
    (key) => !key.lastUsedAt && isApiKeyUsable(key),
  ).length;

  return (
    <main className="app-grid">
      <AppShellCard
        title={t("apiKeys.title", locale)}
        description={
          roleSnapshot.capabilities.canManageApiKeys
            ? t("apiKeys.description.manage", locale)
            : t("apiKeys.description.readOnly", locale)
        }
      >
        {errors.map((error) => (
          <div key={error} className="error-banner">
            <strong>{t("apiKeys.banner.error", locale)}</strong> {error}
          </div>
        ))}

        {resolvedSearchParams.success ? (
          <div className="success-banner">
            <strong>{t("apiKeys.banner.success", locale)}</strong>{" "}
            {resolvedSearchParams.success}
          </div>
        ) : null}

        {resolvedSearchParams.error ? (
          <div className="error-banner">
            <strong>{t("apiKeys.banner.error", locale)}</strong>{" "}
            {resolvedSearchParams.error}
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
            <span className="metric-label">
              {t("apiKeys.metric.activeKeys", locale)}
            </span>
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
              {t("apiKeys.metric.activeKeys.help", locale)}
            </p>
          </div>
          <div style={infoPanelStyle}>
            <span className="metric-label">
              {t("apiKeys.metric.unusedKeys", locale)}
            </span>
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
              {t("apiKeys.metric.unusedKeys.help", locale)}
            </p>
          </div>
          <div style={infoPanelStyle}>
            <span className="metric-label">
              {t("apiKeys.metric.rotationWindow", locale)}
            </span>
            <div
              style={{
                fontSize: "1.8rem",
                fontWeight: 700,
                marginTop: "0.5rem",
              }}
            >
              {t("apiKeys.metric.rotationWindow.value", locale, {
                days: policy.defaultLifetimeDays,
              })}
            </div>
            <p className="muted-copy">
              {t("apiKeys.metric.rotationWindow.help", locale, {
                days: policy.maxLifetimeDays,
              })}
            </p>
          </div>
        </section>

        <section style={{ ...infoPanelStyle, marginBottom: "1rem" }}>
          <strong>{t("apiKeys.scopeCatalog.title", locale)}</strong>
          <p className="muted-copy" style={{ marginTop: "0.45rem" }}>
            {t("apiKeys.scopeCatalog.description", locale)}
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
            {t("apiKeys.scopeCatalog.policySummary", locale, {
              expiry: policy.requireExpiry
                ? t("apiKeys.scopeCatalog.expiryRequired", locale)
                : t("apiKeys.scopeCatalog.expiryDefault", locale),
              revokeEffect: policy.revokeEffect,
              aliases:
                Object.keys(policy.compatibilityAliases).length > 0
                  ? Object.entries(policy.compatibilityAliases)
                      .map(([alias, canonical]) => `${alias} -> ${canonical}`)
                      .join(", ")
                  : t("apiKeys.scopeCatalog.aliasesNone", locale),
            })}
          </p>
        </section>

        {rotatingKey ? (
          roleSnapshot.capabilities.canManageApiKeys ? (
            <RotateKeyForm
              apiKey={rotatingKey}
              policy={policy}
              locale={locale}
            />
          ) : (
            <div className="error-banner">
              <strong>{t("apiKeys.accessDenied", locale)}</strong>{" "}
              {t("apiKeys.accessDenied.rotate", locale)}
            </div>
          )
        ) : issueMode ? (
          roleSnapshot.capabilities.canManageApiKeys ? (
            <IssueKeyForm policy={policy} locale={locale} />
          ) : (
            <div className="error-banner">
              <strong>{t("apiKeys.accessDenied", locale)}</strong>{" "}
              {t("apiKeys.accessDenied.issue", locale)}
            </div>
          )
        ) : (
          <>
            {roleSnapshot.capabilities.canManageApiKeys ? (
              <div className="form-actions" style={{ marginBottom: "1rem" }}>
                <Link href="/api-keys?issue=true" className="btn-primary">
                  {t("apiKeys.action.issueNewKey", locale)}
                </Link>
              </div>
            ) : null}
            <ApiKeyList
              apiKeys={apiKeys}
              canManage={roleSnapshot.capabilities.canManageApiKeys}
              locale={locale}
            />
          </>
        )}

        <Link className="route-link" href="/">
          <strong>{t("apiKeys.backHome.title", locale)}</strong>
          {t("apiKeys.backHome.subtitle", locale)}
        </Link>
      </AppShellCard>
    </main>
  );
}

function ScopeChecklist({
  allowedScopes,
  defaultScopes,
  locale,
}: {
  allowedScopes: string[];
  defaultScopes?: string[];
  locale: Locale;
}) {
  const selected = new Set(defaultScopes ?? []);

  return (
    <div className="form-row">
      <label>{t("apiKeys.form.scopes.label", locale)}</label>
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

function ExpiryControls({
  policy,
  locale,
}: {
  policy: TenantApiKeyGovernancePolicy;
  locale: Locale;
}) {
  return (
    <>
      <div className="form-row">
        <label htmlFor="lifetimePreset">
          {t("apiKeys.form.expiryPolicy.label", locale)}
        </label>
        <select
          id="lifetimePreset"
          name="lifetimePreset"
          defaultValue="recommended"
        >
          <option value="recommended">
            {t("apiKeys.form.expiry.recommended", locale, {
              days: policy.defaultLifetimeDays,
            })}
          </option>
          <option value="short">
            {t("apiKeys.form.expiry.short", locale)}
          </option>
          <option value="max">
            {t("apiKeys.form.expiry.max", locale, {
              days: policy.maxLifetimeDays,
            })}
          </option>
          <option value="custom">
            {t("apiKeys.form.expiry.custom", locale)}
          </option>
        </select>
      </div>
      <div className="form-row">
        <label htmlFor="expiresAt">
          {t("apiKeys.form.customExpiry.label", locale)}
        </label>
        <input type="datetime-local" id="expiresAt" name="expiresAt" />
        <p className="muted-copy" style={{ marginTop: "0.35rem" }}>
          {t("apiKeys.form.customExpiry.help", locale)}
        </p>
      </div>
    </>
  );
}

function IssueKeyForm({
  policy,
  locale,
}: {
  policy: TenantApiKeyGovernancePolicy;
  locale: Locale;
}) {
  return (
    <div className="form-section">
      <h3>{t("apiKeys.issueForm.title", locale)}</h3>
      <p className="muted-copy">{t("apiKeys.issueForm.description", locale)}</p>
      <form action={issueApiKey} className="form-grid">
        <div className="form-row">
          <label htmlFor="keyName">
            {t("apiKeys.form.keyName.label", locale)}
          </label>
          <input
            type="text"
            id="keyName"
            name="keyName"
            placeholder={t("apiKeys.form.keyName.placeholder", locale)}
            required
          />
        </div>
        <ScopeChecklist allowedScopes={policy.allowedScopes} locale={locale} />
        <ExpiryControls policy={policy} locale={locale} />
        <div className="form-actions">
          <button type="submit">{t("apiKeys.action.issueKey", locale)}</button>
          <Link href="/api-keys">{t("apiKeys.action.cancel", locale)}</Link>
        </div>
      </form>
    </div>
  );
}

function RotateKeyForm({
  apiKey,
  policy,
  locale,
}: {
  apiKey: TenantApiKeyRecord;
  policy: TenantApiKeyGovernancePolicy;
  locale: Locale;
}) {
  const status = resolveApiKeyStatus(apiKey, locale);

  return (
    <div className="form-section">
      <h3>{t("apiKeys.rotateForm.title", locale)}</h3>
      <p className="muted-copy">{t("apiKeys.rotateForm.description", locale)}</p>
      <div style={{ ...infoPanelStyle, marginBottom: "1rem" }}>
        <strong>{apiKey.keyName}</strong>
        <p className="muted-copy" style={{ marginTop: "0.45rem" }}>
          {t("apiKeys.rotateForm.prefixLabel", locale)}{" "}
          <code>{apiKey.keyPrefix}</code>
          {t("apiKeys.rotateForm.suffixLabel", locale)}{" "}
          <code>{apiKey.maskedSuffix}</code>
          {t("apiKeys.rotateForm.lastUsedLabel", locale)}{" "}
          {formatDateTime(apiKey.lastUsedAt, locale)}
          {t("apiKeys.rotateForm.metaEnd", locale)}
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
          <label htmlFor="keyName">
            {t("apiKeys.form.keyName.label", locale)}
          </label>
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
          locale={locale}
        />
        <ExpiryControls policy={policy} locale={locale} />
        <div className="form-actions">
          <button type="submit">{t("apiKeys.action.rotateKey", locale)}</button>
          <Link href="/api-keys">{t("apiKeys.action.cancel", locale)}</Link>
        </div>
      </form>
    </div>
  );
}

function ApiKeyList({
  apiKeys,
  canManage,
  locale,
}: {
  apiKeys: TenantApiKeyRecord[];
  canManage: boolean;
  locale: Locale;
}) {
  return (
    <div className="data-table">
      {apiKeys.length === 0 ? (
        <p className="empty-state">{t("apiKeys.list.empty", locale)}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t("apiKeys.table.credential", locale)}</th>
              <th>{t("apiKeys.table.scopes", locale)}</th>
              <th>{t("apiKeys.table.lastUsed", locale)}</th>
              <th>{t("apiKeys.table.expiry", locale)}</th>
              <th>{t("apiKeys.table.created", locale)}</th>
              <th>{t("apiKeys.table.status", locale)}</th>
              <th>{t("apiKeys.table.actions", locale)}</th>
            </tr>
          </thead>
          <tbody>
            {apiKeys.map((key) => {
              const status = resolveApiKeyStatus(key, locale);

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
                      ? formatDateTime(key.lastUsedAt, locale)
                      : t("apiKeys.list.neverUsed", locale)}
                  </td>
                  <td>
                    <strong>{formatShortDate(key.expiresAt, locale)}</strong>
                    <div
                      className="muted-copy"
                      style={{ marginTop: "0.35rem" }}
                    >
                      {key.expiresAt
                        ? formatDateTime(key.expiresAt, locale)
                        : t("apiKeys.list.authorityDefaultOrNone", locale)}
                    </div>
                  </td>
                  <td>{formatDateTime(key.createdAt, locale)}</td>
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
                          {t("apiKeys.action.rotate", locale)}
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
                            confirmMessage={t(
                              "apiKeys.action.revoke.confirm",
                              locale,
                              { name: key.keyName },
                            )}
                          >
                            {t("apiKeys.action.revoke", locale)}
                          </ConfirmSubmitButton>
                        </form>
                      </>
                    ) : (
                      <span className="muted-copy">
                        {t("apiKeys.list.auditOnly", locale)}
                      </span>
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

  const locale = await getServerLocale();
  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canManageApiKeys,
    t("apiKeys.error.requireIssue", locale),
  );
  const client = await getTenantClient();
  const scopes = parseScopeValues(formData);
  let destination = "/api-keys";

  try {
    const policy = (await client.getTenantIntegrationGovernancePackage())
      .apiKeyPolicy;

    if (scopes.length === 0) {
      throw new Error(t("apiKeys.error.selectScope", locale));
    }

    const invalidScopes = scopes.filter(
      (scope) => !policy.allowedScopes.includes(scope),
    );
    if (invalidScopes.length > 0) {
      throw new Error(
        t("apiKeys.error.unsupportedScopes", locale, {
          scopes: invalidScopes.join(", "),
        }),
      );
    }

    const { expiresAt, expirySummary } = resolveExpirySelection(
      formData,
      policy,
      locale,
    );
    const command: IssueTenantApiKeyCommand = {
      keyName: String(formData.get("keyName") ?? "").trim(),
      scopes,
      expiresAt,
    };

    if (!command.keyName) {
      throw new Error(t("apiKeys.error.keyNameRequired", locale));
    }

    const result = await client.issueApiKey(command);
    await writeOneTimeKeyFlash(result);
    revalidatePath("/api-keys");
    destination = `/api-keys/reveal?success=${encodeURIComponent(
      t("apiKeys.success.issued", locale, {
        name: result.apiKey.keyName,
        count: scopes.length,
        summary: expirySummary,
      }),
    )}`;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : t("apiKeys.error.unknown", locale);
    destination = `/api-keys?issue=true&error=${encodeURIComponent(message)}`;
  }

  redirect(destination);
}

async function rotateApiKey(formData: FormData) {
  "use server";

  const locale = await getServerLocale();
  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canManageApiKeys,
    t("apiKeys.error.requireRotate", locale),
  );
  const client = await getTenantClient();
  const apiKeyId = String(formData.get("apiKeyId") ?? "");
  const scopes = parseScopeValues(formData);
  let destination = "/api-keys";

  try {
    const policy = (await client.getTenantIntegrationGovernancePackage())
      .apiKeyPolicy;

    if (!apiKeyId) {
      throw new Error(t("apiKeys.error.apiKeyIdRequired", locale));
    }
    if (scopes.length === 0) {
      throw new Error(t("apiKeys.error.selectScope", locale));
    }

    const invalidScopes = scopes.filter(
      (scope) => !policy.allowedScopes.includes(scope),
    );
    if (invalidScopes.length > 0) {
      throw new Error(
        t("apiKeys.error.unsupportedScopes", locale, {
          scopes: invalidScopes.join(", "),
        }),
      );
    }

    const { expiresAt, expirySummary } = resolveExpirySelection(
      formData,
      policy,
      locale,
    );
    const command: RotateTenantApiKeyCommand = {
      keyName: String(formData.get("keyName") ?? "").trim(),
      scopes,
      expiresAt,
    };

    if (!command.keyName) {
      throw new Error(t("apiKeys.error.keyNameRequired", locale));
    }

    const result = await client.rotateApiKey(apiKeyId, command);
    await writeOneTimeKeyFlash(result);
    revalidatePath("/api-keys");
    destination = `/api-keys/reveal?success=${encodeURIComponent(
      t("apiKeys.success.rotated", locale, {
        name: result.apiKey.keyName,
        summary: expirySummary,
      }),
    )}`;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : t("apiKeys.error.unknown", locale);
    destination = `/api-keys?rotate=${encodeURIComponent(apiKeyId)}&error=${encodeURIComponent(message)}`;
  }

  redirect(destination);
}

async function revokeApiKey(formData: FormData) {
  "use server";

  const locale = await getServerLocale();
  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canManageApiKeys,
    t("apiKeys.error.requireRevoke", locale),
  );
  const client = await getTenantClient();
  const apiKeyId = String(formData.get("apiKeyId") ?? "");
  let destination = "/api-keys";

  try {
    if (!apiKeyId) {
      throw new Error(t("apiKeys.error.apiKeyIdRequired", locale));
    }

    await client.revokeApiKey(apiKeyId);
    revalidatePath("/api-keys");
    destination = `/api-keys?success=${encodeURIComponent(
      t("apiKeys.success.revoked", locale),
    )}`;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : t("apiKeys.error.unknown", locale);
    destination = `/api-keys?error=${encodeURIComponent(message)}`;
  }

  redirect(destination);
}
