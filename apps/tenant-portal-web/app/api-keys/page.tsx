import Link from "next/link";
import { revalidatePath } from "next/cache";
import type {
  TenantApiKeyRecord,
  IssueTenantApiKeyCommand,
  RotateTenantApiKeyCommand,
  TenantApiKeyIssued,
} from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

export default async function ApiKeysPage({
  searchParams,
}: {
  searchParams?: {
    rotate?: string;
    issue?: string;
    error?: string;
    success?: string;
  };
}) {
  const client = getTenantClient();

  let apiKeys: TenantApiKeyRecord[] = [];
  let error: string | null = null;

  try {
    apiKeys = await client.listApiKeys();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  const rotateKeyId = searchParams?.rotate;
  const issueMode = searchParams?.issue === "true";
  const successMsg = searchParams?.success ?? null;
  const formError = searchParams?.error ?? null;

  const rotatingKey = rotateKeyId
    ? apiKeys.find((k) => k.apiKeyId === rotateKeyId)
    : null;

  return (
    <main className="app-grid">
      <AppShellCard
        title="API Keys"
        description={`Manage API keys for tenant integration. ${apiKeys.length} key(s) found.`}
      >
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        {successMsg && (
          <div className="success-banner">
            <strong>Success:</strong> {successMsg}
          </div>
        )}

        {rotatingKey ? (
          <RotateKeyForm apiKey={rotatingKey} />
        ) : issueMode ? (
          <IssueKeyForm formError={formError} />
        ) : (
          <>
            <div className="form-actions" style={{ marginBottom: "1rem" }}>
              <Link href="/api-keys?issue=true" className="btn-primary">
                Issue New Key
              </Link>
            </div>
            <ApiKeyList apiKeys={apiKeys} />
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

function IssueKeyForm({ formError }: { formError: string | null }) {
  return (
    <div className="form-section">
      <h3>Issue New API Key</h3>
      {formError && (
        <div className="error-banner">
          <strong>Error:</strong> {formError}
        </div>
      )}
      <form action={issueApiKey} className="form-grid">
        <div className="form-row">
          <label htmlFor="keyName">Key Name *</label>
          <input
            type="text"
            id="keyName"
            name="keyName"
            placeholder="e.g., production-integration"
            required
          />
        </div>
        <div className="form-row">
          <label htmlFor="scopes">Scopes (comma-separated) *</label>
          <input
            type="text"
            id="scopes"
            name="scopes"
            placeholder="e.g., bookings:read,webhooks:write"
            required
          />
        </div>
        <div className="form-row">
          <label htmlFor="expiresAt">Expires At (optional)</label>
          <input type="datetime-local" id="expiresAt" name="expiresAt" />
        </div>
        <div className="form-actions">
          <button type="submit">Issue Key</button>
          <Link href="/api-keys">Cancel</Link>
        </div>
      </form>
    </div>
  );
}

function RotateKeyForm({ apiKey }: { apiKey: TenantApiKeyRecord }) {
  return (
    <div className="form-section">
      <h3>Rotate API Key: {apiKey.keyName}</h3>
      <p>
        This will revoke the current key (prefix: {apiKey.keyPrefix}) and issue
        a new one with the same name and scopes.
      </p>
      <form action={rotateApiKey} className="form-grid">
        <input type="hidden" name="apiKeyId" value={apiKey.apiKeyId} />
        <div className="form-row">
          <label htmlFor="keyName">Key Name (optional change)</label>
          <input
            type="text"
            id="keyName"
            name="keyName"
            defaultValue={apiKey.keyName}
          />
        </div>
        <div className="form-row">
          <label htmlFor="scopes">
            Scopes (comma-separated, optional change)
          </label>
          <input
            type="text"
            id="scopes"
            name="scopes"
            defaultValue={apiKey.scopes.join(", ")}
          />
        </div>
        <div className="form-row">
          <label htmlFor="expiresAt">New Expiry (optional)</label>
          <input type="datetime-local" id="expiresAt" name="expiresAt" />
        </div>
        <div className="form-actions">
          <button type="submit">Rotate Key</button>
          <Link href="/api-keys">Cancel</Link>
        </div>
      </form>
    </div>
  );
}

function ApiKeyList({ apiKeys }: { apiKeys: TenantApiKeyRecord[] }) {
  return (
    <div className="data-table">
      {apiKeys.length === 0 ? (
        <p className="empty-state">
          No API keys found. Issue a new key to get started.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Key ID</th>
              <th>Name</th>
              <th>Prefix</th>
              <th>Suffix</th>
              <th>Scopes</th>
              <th>Last Used</th>
              <th>Expires</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {apiKeys.map((key) => (
              <tr key={key.apiKeyId}>
                <td>
                  <code>{key.apiKeyId}</code>
                </td>
                <td>{key.keyName}</td>
                <td>
                  <code>{key.keyPrefix}</code>
                </td>
                <td>
                  <code>{key.maskedSuffix}</code>
                </td>
                <td>{key.scopes.join(", ")}</td>
                <td>
                  {key.lastUsedAt
                    ? new Date(key.lastUsedAt).toLocaleString()
                    : "Never"}
                </td>
                <td>
                  {key.expiresAt
                    ? new Date(key.expiresAt).toLocaleDateString()
                    : "No expiry"}
                </td>
                <td>{key.revokedAt ? "❌ Revoked" : "✅ Active"}</td>
                <td>
                  {!key.revokedAt && (
                    <>
                      <Link href={`/api-keys?rotate=${key.apiKeyId}`}>
                        Rotate
                      </Link>
                      {" | "}
                      <form action={revokeApiKey} style={{ display: "inline" }}>
                        <input
                          type="hidden"
                          name="apiKeyId"
                          value={key.apiKeyId}
                        />
                        <ConfirmSubmitButton
                          type="submit"
                          confirmMessage={`Revoke API key "${key.keyName}"? This action cannot be undone.`}
                        >
                          Revoke
                        </ConfirmSubmitButton>
                      </form>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

async function issueApiKey(formData: FormData) {
  "use server";
  const client = getTenantClient();

  const scopesStr = formData.get("scopes") as string;
  const scopes = scopesStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const expiresAt = (formData.get("expiresAt") as string) || null;

  const command: IssueTenantApiKeyCommand = {
    keyName: formData.get("keyName") as string,
    scopes,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
  };

  try {
    const result = (await client.issueApiKey(command)) as TenantApiKeyIssued;
    const newKeyId = result.apiKey.apiKeyId;
    revalidatePath("/api-keys");
    redirect(
      `/api-keys?success=${encodeURIComponent(
        `Key issued: ${result.apiKey.keyPrefix}**** (ID: ${newKeyId}). Save the plaintext key now, it won't be shown again.`,
      )}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    redirect(`/api-keys?issue=true&error=${encodeURIComponent(msg)}`);
  }
}

async function rotateApiKey(formData: FormData) {
  "use server";
  const client = getTenantClient();

  const apiKeyId = formData.get("apiKeyId") as string;
  const keyName = formData.get("keyName") as string;
  const scopesStr = formData.get("scopes") as string;
  const scopes = scopesStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const expiresAt = (formData.get("expiresAt") as string) || null;

  const command: RotateTenantApiKeyCommand = {};
  if (keyName) command.keyName = keyName;
  if (scopes.length > 0) command.scopes = scopes;
  if (expiresAt) command.expiresAt = new Date(expiresAt).toISOString();

  try {
    await client.rotateApiKey(apiKeyId, command);
    revalidatePath("/api-keys");
    redirect(
      `/api-keys?success=${encodeURIComponent(
        `Key rotated successfully. Old key has been revoked.`,
      )}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    redirect(
      `/api-keys?rotate=${encodeURIComponent(apiKeyId)}&error=${encodeURIComponent(msg)}`,
    );
  }
}

async function revokeApiKey(formData: FormData) {
  "use server";
  const client = getTenantClient();

  const apiKeyId = formData.get("apiKeyId") as string;

  try {
    await client.revokeApiKey(apiKeyId);
    revalidatePath("/api-keys");
    redirect(
      `/api-keys?success=${encodeURIComponent(
        `API key revoked successfully.`,
      )}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    redirect(`/api-keys?error=${encodeURIComponent(msg)}`);
  }
}

function redirect(path: string) {
  import("next/navigation").then(({ redirect }) => redirect(path));
}
