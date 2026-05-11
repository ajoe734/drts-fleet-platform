"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  TenantApiKeyRecord,
  TenantIntegrationGovernancePackage,
} from "@drts/contracts";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { formatCount, formatDateTime } from "@/lib/formatters";
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

function isRevoked(apiKey: TenantApiKeyRecord) {
  return Boolean(apiKey.revokedAt);
}

function resolveApiKeyStatus(apiKey: TenantApiKeyRecord) {
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

function isApiKeyUsable(apiKey: TenantApiKeyRecord) {
  const status = resolveApiKeyStatus(apiKey);
  return status !== "revoked" && status !== "expired";
}

function getApiKeyStateClassName(apiKey: TenantApiKeyRecord) {
  const status = resolveApiKeyStatus(apiKey);
  return status === "active" || status === "expiring"
    ? "status-chip is-active"
    : "status-chip";
}

function getApiKeyStateLabel(apiKey: TenantApiKeyRecord) {
  switch (resolveApiKeyStatus(apiKey)) {
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

function renderScopeInput(scope: string, defaultChecked = true) {
  return (
    <label className="scope-option" key={scope}>
      <input
        defaultChecked={defaultChecked}
        name="scopes"
        type="checkbox"
        value={scope}
      />
      <span>{scope}</span>
    </label>
  );
}

function renderHiddenScopeInputs(scopes: string[]) {
  return scopes.map((scope) => (
    <input key={scope} name="scopes" type="hidden" value={scope} />
  ));
}

export function ApiKeyManager({
  apiKeys,
  governance,
  errors,
}: ApiKeyManagerProps) {
  const router = useRouter();
  const issueFormRef = useRef<HTMLFormElement>(null);
  const [flash, setFlash] = useState<ApiKeyFlashPayload | null>(null);
  const [pending, startTransition] = useTransition();

  const sortedKeys = [...apiKeys].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  const activeKeys = sortedKeys.filter((apiKey) => isApiKeyUsable(apiKey));
  const revokedKeys = sortedKeys.filter((apiKey) => isRevoked(apiKey));
  const expiringKeys = activeKeys.filter(
    (apiKey) => resolveApiKeyStatus(apiKey) === "expiring",
  );
  const allowedScopes = governance?.apiKeyPolicy.allowedScopes ?? [];
  const compatibilityAliases = Object.entries(
    governance?.apiKeyPolicy.compatibilityAliases ?? {},
  );

  function runAction(
    action: (formData: FormData) => Promise<ApiKeyFlashPayload>,
    formData: FormData,
    options?: {
      resetIssueForm?: boolean;
    },
  ) {
    startTransition(async () => {
      const result = await action(formData);
      setFlash(result);

      if (result.tone === "default") {
        if (options?.resetIssueForm) {
          issueFormRef.current?.reset();
        }
        router.refresh();
      }
    });
  }

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="API keys"
        title="Tenant API credential lifecycle is now a first-class management surface."
        description="This route issues, rotates, and revokes tenant API keys against the published tenant contracts, while keeping plaintext key material one-time visible only and leaving authority with the backend."
      />

      {flash ? (
        <CalloutPanel
          title={flash.title}
          description={flash.description}
          tone={flash.tone}
        >
          {flash.plaintextKey ? (
            <div className="action-copy">
              <p className="surface-kicker">Shown once</p>
              <code className="plaintext-key">{flash.plaintextKey}</code>
            </div>
          ) : null}
        </CalloutPanel>
      ) : null}

      {errors.length > 0 ? (
        <CalloutPanel
          title="API key data could not be fully loaded"
          description="The management surface stays visible, but one or more tenant integration reads failed."
          tone="warning"
        >
          <ul className="panel-list">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </CalloutPanel>
      ) : null}

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">Active keys</span>
          <strong>{formatCount(activeKeys.length)}</strong>
          <p>Tenant credentials currently able to authenticate.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Revoked</span>
          <strong>{formatCount(revokedKeys.length)}</strong>
          <p>
            Keys permanently invalidated and retained only as governance rows.
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Scoped</span>
          <strong>{formatCount(allowedScopes.length)}</strong>
          <p>
            Published tenant API scopes currently allowed by governance policy.
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Expiry</span>
          <strong>{formatCount(expiringKeys.length)}</strong>
          <p>Active keys with a published expiration timestamp.</p>
        </article>
      </section>

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="Issue"
          title="Create a tenant API key"
          description="The confirmation surface returns the plaintext key once, then future list reads fall back to prefix and masked suffix only."
        >
          <form
            action="#"
            className="query-form"
            onSubmit={(event) => {
              event.preventDefault();
              setFlash(null);
              runAction(
                issueTenantApiKeyAction,
                new FormData(event.currentTarget),
                { resetIssueForm: true },
              );
            }}
            ref={issueFormRef}
          >
            <div className="form-grid">
              <label className="field-stack">
                <span>Label</span>
                <input
                  name="keyName"
                  placeholder="Operations reporting integration"
                  required
                />
              </label>
              <label className="field-stack">
                <span>Expires at</span>
                <input
                  name="expiresAt"
                  placeholder="2026-08-09T01:52:30Z"
                  spellCheck={false}
                  type="text"
                />
                <span className="field-hint">
                  Enter an ISO 8601 timestamp with timezone, or leave blank to
                  use the backend default of{" "}
                  {governance?.apiKeyPolicy.defaultLifetimeDays ??
                    "the published"}{" "}
                  days from issue time.
                </span>
              </label>
            </div>
            <div className="field-stack">
              <span>Scopes</span>
              <div className="scope-grid">
                {allowedScopes.length > 0 ? (
                  allowedScopes.map((scope) => renderScopeInput(scope))
                ) : (
                  <div className="empty-panel">
                    Scope policy is unavailable until integration governance
                    loads.
                  </div>
                )}
              </div>
            </div>
            <div className="form-actions">
              <p className="action-note">
                Plaintext keys are displayed once at issue time only. Reloading
                this route clears the reveal.
              </p>
              <button
                className="action-button action-button-primary"
                disabled={allowedScopes.length === 0 || pending}
                type="submit"
              >
                Create key
              </button>
            </div>
          </form>
        </SurfaceCard>

        <SurfaceCard
          kicker="Governance"
          title="Contract-backed credential policy"
          description="The UI surfaces only the published tenant integration governance package instead of inventing local expiry or break-glass semantics."
        >
          {governance ? (
            <>
              <dl className="definition-grid">
                <div>
                  <dt>Default lifetime</dt>
                  <dd>{governance.apiKeyPolicy.defaultLifetimeDays} days</dd>
                </div>
                <div>
                  <dt>Maximum lifetime</dt>
                  <dd>{governance.apiKeyPolicy.maxLifetimeDays} days</dd>
                </div>
                <div>
                  <dt>Expiry required</dt>
                  <dd>
                    {governance.apiKeyPolicy.requireExpiry
                      ? "Required"
                      : "Optional"}
                  </dd>
                </div>
                <div>
                  <dt>Revoke effect</dt>
                  <dd>{governance.apiKeyPolicy.revokeEffect}</dd>
                </div>
                <div>
                  <dt>Break-glass</dt>
                  <dd>
                    {governance.apiKeyPolicy.breakGlassRequiresPlatformApproval
                      ? "Platform approval required"
                      : "No extra approval published"}
                  </dd>
                </div>
                <div>
                  <dt>Generated</dt>
                  <dd>{formatDateTime(governance.generatedAt)}</dd>
                </div>
              </dl>
              {compatibilityAliases.length > 0 ? (
                <ul className="panel-list">
                  {compatibilityAliases.map(([alias, target]) => (
                    <li key={`${alias}-${target}`}>
                      <strong>{alias}</strong>
                      <span className="list-note">maps to {target}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <div className="empty-panel">
              Integration governance could not be loaded for this tenant.
            </div>
          )}
        </SurfaceCard>
      </section>

      <SurfaceCard
        kicker="Register"
        title="API key register and lifecycle commands"
        description="Active and revoked rows stay together for auditability. Rotation reissues a one-time plaintext key and revocation is immediate."
      >
        <div className="table-wrap">
          <table className="data-grid">
            <thead>
              <tr>
                <th>Name</th>
                <th>Prefix</th>
                <th>Mask</th>
                <th>Scopes</th>
                <th>Last used</th>
                <th>Expires</th>
                <th>State</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedKeys.length > 0 ? (
                sortedKeys.map((apiKey) => {
                  const revoked = isRevoked(apiKey);

                  return (
                    <tr key={apiKey.apiKeyId}>
                      <td>
                        <div className="table-primary">
                          <strong>{apiKey.keyName}</strong>
                          <span className="table-secondary">
                            {apiKey.apiKeyId}
                          </span>
                        </div>
                      </td>
                      <td>
                        <code>{apiKey.keyPrefix}</code>
                      </td>
                      <td>
                        <code>••••{apiKey.maskedSuffix}</code>
                      </td>
                      <td>
                        <div className="chip-row">
                          {apiKey.scopes.map((scope) => (
                            <span className="status-chip" key={scope}>
                              {scope}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>{formatDateTime(apiKey.lastUsedAt)}</td>
                      <td>{formatDateTime(apiKey.expiresAt)}</td>
                      <td>
                        <span className={getApiKeyStateClassName(apiKey)}>
                          {getApiKeyStateLabel(apiKey)}
                        </span>
                      </td>
                      <td>{formatDateTime(apiKey.createdAt)}</td>
                      <td>
                        {revoked ? (
                          <span className="table-secondary">
                            Revoked {formatDateTime(apiKey.revokedAt)}
                          </span>
                        ) : (
                          <div className="row-actions">
                            <form
                              action="#"
                              onSubmit={(event) => {
                                event.preventDefault();
                                setFlash(null);
                                runAction(
                                  rotateTenantApiKeyAction,
                                  new FormData(event.currentTarget),
                                );
                              }}
                            >
                              <input
                                name="apiKeyId"
                                type="hidden"
                                value={apiKey.apiKeyId}
                              />
                              <input
                                name="keyName"
                                type="hidden"
                                value={apiKey.keyName}
                              />
                              <input
                                name="expiresAt"
                                type="hidden"
                                value={apiKey.expiresAt ?? ""}
                              />
                              {renderHiddenScopeInputs(apiKey.scopes)}
                              <button
                                className="action-button action-button-secondary"
                                disabled={pending}
                                type="submit"
                              >
                                Rotate
                              </button>
                            </form>
                            <form
                              action="#"
                              onSubmit={(event) => {
                                event.preventDefault();
                                setFlash(null);
                                runAction(
                                  revokeTenantApiKeyAction,
                                  new FormData(event.currentTarget),
                                );
                              }}
                            >
                              <input
                                name="apiKeyId"
                                type="hidden"
                                value={apiKey.apiKeyId}
                              />
                              <input
                                name="keyName"
                                type="hidden"
                                value={apiKey.keyName}
                              />
                              <button
                                className="action-button action-button-danger"
                                disabled={pending}
                                type="submit"
                              >
                                Revoke
                              </button>
                            </form>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-panel">
                      No tenant API key has been issued yet.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SurfaceCard>

      <CalloutPanel
        title="Shared integration band"
        description="API keys and webhooks stay adjacent in tenant navigation because both are tenant-managed integrations, but they keep separate command vocabularies and secret-handling rules."
      />
    </div>
  );
}
