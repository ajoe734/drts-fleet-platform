/**
 * Mints this worker's own Google-signed workload identity token from the
 * real GCE/Cloud Run metadata server (Codex reopen round 5/6, R4) -- the
 * same mechanism `apps/api`'s `GoogleWorkloadIdentityAdapter`
 * (common/auth/google-workload-identity.adapter.ts) already verifies on
 * the receiving side for Cloud Scheduler and any other GCP-hosted caller.
 * This is not an invented protocol: any GCP compute workload (GCE, Cloud
 * Run, GKE) can always reach this exact endpoint for its own attached
 * service account, with no extra provisioning beyond what already exists
 * for the workload to run at all.
 *
 * Fails closed (throws) whenever the metadata server is unreachable or
 * refuses the request -- true for every environment this worker currently
 * runs in (this VM, CI, any non-GCP host), and `VoiceApiClient`'s own
 * callers must never treat that failure as "trusted composition
 * unavailable, fall back to fixture success"; it must propagate.
 */
export interface WorkloadIdentityTokenSource {
  getToken(): Promise<string>;
}

const DEFAULT_METADATA_IDENTITY_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";
/** Refresh this long before actual expiry so a caller never races a token
 * that is technically still valid but expires mid-request. */
const TOKEN_REFRESH_SKEW_MS = 30_000;
const FALLBACK_TOKEN_TTL_MS = 3_600_000;

export interface GoogleMetadataTokenSourceConfig {
  /** The target audience the minted token must assert -- apps/api's own
   * base URL, matched against `allowedTokenAudiences` on the receiving
   * side's registered service-principal entry. */
  audience: string;
  /** Override for tests only; production always uses the real metadata
   * server URL above. */
  metadataIdentityUrl?: string;
  fetchImpl?: typeof fetch;
}

function decodeUnverifiedExpiryMs(token: string): number | null {
  // Google's own metadata server already signs this token; this worker
  // never verifies it (that is apps/api's job) -- decoding `exp` here is
  // only a local cache-freshness hint, not a trust decision.
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1]!, "base64url").toString("utf8"),
    ) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export class GoogleMetadataIdentityTokenSource
  implements WorkloadIdentityTokenSource
{
  private cached?: { token: string; expiresAtMs: number };

  constructor(private readonly config: GoogleMetadataTokenSourceConfig) {}

  async getToken(): Promise<string> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAtMs - TOKEN_REFRESH_SKEW_MS > now) {
      return this.cached.token;
    }

    const fetchImpl = this.config.fetchImpl ?? fetch;
    const base =
      this.config.metadataIdentityUrl ?? DEFAULT_METADATA_IDENTITY_URL;
    const url = `${base}?audience=${encodeURIComponent(this.config.audience)}&format=full`;

    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: { "Metadata-Flavor": "Google" },
      });
    } catch (err) {
      throw new Error(
        `Unable to reach the GCP metadata server for workload identity: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!response.ok) {
      throw new Error(
        `GCP metadata server rejected the workload identity token request (status ${response.status}).`,
      );
    }
    const token = (await response.text()).trim();
    if (!token) {
      throw new Error(
        "GCP metadata server returned an empty workload identity token.",
      );
    }

    const expiresAtMs =
      decodeUnverifiedExpiryMs(token) ?? now + FALLBACK_TOKEN_TTL_MS;
    this.cached = { token, expiresAtMs };
    return token;
  }
}
