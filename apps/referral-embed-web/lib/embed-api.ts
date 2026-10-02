import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  ConsumeReferralEmbedHandoffArtifactCommand,
  PartnerChannelEntryRecord,
  RecordReferralEmbedConsentCommand,
} from "@drts/contracts";
import type { CreatePartnerIngressHandoffCommand } from "@drts/contracts";
import type { PartnerIngressHandoffSession } from "@drts/contracts";
import type {
  CreateReferralEmbedHandoffArtifactCommand,
  ReferralEmbedHandoffArtifact,
  ReferralEmbedSession,
} from "@drts/contracts";
import { getServerApiBaseUrl } from "./embed-runtime";

const API_URL = getServerApiBaseUrl();

// The authority API serialises responses in snake_case, but the embed reads the
// records as the camelCase contract types (entry.displayName / entryHost /
// themeAccent, session.drtsPassengerId …). Without conversion every field is
// undefined — which surfaced as "undefined App", "unknown-host" and the wrong
// brand accent. The platform-admin client has a global interceptor for this;
// this minimal authority client needs the same normalisation.
function snakeToCamelKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_match, ch: string) => ch.toUpperCase());
}

export function deepCamelize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(deepCamelize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        snakeToCamelKey(key),
        deepCamelize(val),
      ]),
    );
  }
  return value;
}

export type EmbedAuthorityError = Error & {
  status: number;
  code: string;
  details: Record<string, unknown> | undefined;
  retryable: boolean | undefined;
};

function buildEmbedAuthorityError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
  retryable = false,
): EmbedAuthorityError {
  const error = new Error(message) as EmbedAuthorityError;
  error.name = "EmbedAuthorityError";
  error.status = status;
  error.code = code;
  error.details = details;
  error.retryable = retryable;
  return error;
}

const METADATA_IDENTITY_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";
const RUN_APP_HOST_SUFFIX = ".a.run.app";

async function mintMetadataIdentityToken(
  audience: string,
): Promise<string | null> {
  const metadataUrl = new URL(METADATA_IDENTITY_TOKEN_URL);
  metadataUrl.searchParams.set("audience", audience);
  metadataUrl.searchParams.set("format", "full");
  try {
    const response = await fetch(metadataUrl, {
      cache: "no-store",
      headers: { "Metadata-Flavor": "Google" },
    });
    return response.ok ? response.text() : null;
  } catch {
    return null;
  }
}

// SEC-INTERNAL-KEY-WIF-MIGRATION-20260930 follow-up: drop the
// x-drts-internal-key send in requestAuthority below once dev has proven
// this header end-to-end and INTERNAL_KEY_EXCP_002 is retired.
async function getGoogleWorkloadIdentityHeader(): Promise<
  Record<string, string>
> {
  // SEC-INTERNAL-KEY-EXCP-001-WIF-MIGRATION-20261002: hosted CI harnesses
  // (e.g. tenant-uat-acceptance.yml) run this BFF on a plain GitHub-hosted
  // runner, not Cloud Run/GCE, so there is no metadata server to mint a
  // token from. Those harnesses instead mint a real Google-signed ID token
  // out of band (via google-github-actions/auth, the same WIF identity
  // deploy-dev.yml uses) and inject it here directly. Production never sets
  // this var and keeps using the metadata server below.
  const staticToken = process.env.DRTS_GOOGLE_WORKLOAD_IDENTITY_TOKEN?.trim();
  if (staticToken) {
    return { "x-drts-google-id-token": staticToken };
  }

  const configuredAudience = process.env.DRTS_API_AUTH_AUDIENCE?.trim();
  const targetUrl = new URL(API_URL);
  const audience =
    configuredAudience ||
    (targetUrl.hostname.endsWith(RUN_APP_HOST_SUFFIX) ? targetUrl.origin : null);
  if (!audience) {
    return {};
  }
  const identityToken = await mintMetadataIdentityToken(audience);
  return identityToken ? { "x-drts-google-id-token": identityToken } : {};
}

async function requestAuthority<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      cache: "no-store",
      ...init,
      headers: {
        "Content-Type": "application/json",
        // Server-to-server authority calls (/api/partner/*) require the shared
        // internal key in environments that enforce it. requestAuthority only
        // ever runs server-side, so reading the secret here is safe.
        ...(process.env.DRTS_INTERNAL_KEY
          ? { "x-drts-internal-key": process.env.DRTS_INTERNAL_KEY }
          : {}),
        ...(await getGoogleWorkloadIdentityHeader()),
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    throw buildEmbedAuthorityError(
      503,
      "EMBED_AUTHORITY_UNAVAILABLE",
      error instanceof Error
        ? error.message
        : "Embed authority is unavailable.",
      undefined,
      true,
    );
  }

  let payload: ApiSuccessEnvelope<T> | ApiErrorEnvelope | null = null;
  try {
    payload = (await response.json()) as
      | ApiSuccessEnvelope<T>
      | ApiErrorEnvelope;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const envelope = payload as ApiErrorEnvelope | null;
    throw buildEmbedAuthorityError(
      response.status,
      envelope?.error?.code ?? "EMBED_AUTHORITY_REQUEST_FAILED",
      envelope?.error?.message ??
        `Embed authority request failed with ${response.status}.`,
      envelope?.error?.details,
      envelope?.error?.retryable ?? false,
    );
  }

  const envelope = payload as ApiSuccessEnvelope<T> | null;
  if (!envelope?.data) {
    throw buildEmbedAuthorityError(
      502,
      "EMBED_AUTHORITY_EMPTY_RESPONSE",
      "Embed authority returned an empty response.",
    );
  }

  return deepCamelize(envelope.data) as T;
}

export async function getPartnerEntry(entrySlug: string) {
  return requestAuthority<PartnerChannelEntryRecord>(
    `/api/partner/entries/${encodeURIComponent(entrySlug)}`,
  );
}

export async function issuePartnerIngressHandoff(
  command: CreatePartnerIngressHandoffCommand,
) {
  return requestAuthority<PartnerIngressHandoffSession>(
    "/api/partner/ingress/handoff",
    {
      method: "POST",
      body: JSON.stringify(command),
    },
  );
}

export async function issueReferralEmbedHandoffArtifact(
  command: CreateReferralEmbedHandoffArtifactCommand,
) {
  return requestAuthority<ReferralEmbedHandoffArtifact>(
    "/api/partner/ingress/referral-embed-handoff",
    {
      method: "POST",
      body: JSON.stringify(command),
    },
  );
}

export async function consumeReferralEmbedHandoffArtifact(
  command: ConsumeReferralEmbedHandoffArtifactCommand,
) {
  return requestAuthority<ReferralEmbedSession>(
    "/api/partner/ingress/referral-embed-handoff/consume",
    {
      method: "POST",
      body: JSON.stringify(command),
    },
  );
}

export async function recordReferralEmbedConsent(
  command: RecordReferralEmbedConsentCommand,
) {
  return requestAuthority<ReferralEmbedSession>(
    "/api/partner/ingress/referral-embed-handoff/consent",
    {
      method: "POST",
      body: JSON.stringify(command),
    },
  );
}

export function isEmbedAuthorityError(
  error: unknown,
): error is EmbedAuthorityError {
  return (
    error instanceof Error &&
    "status" in error &&
    "code" in error &&
    typeof (error as EmbedAuthorityError).status === "number" &&
    typeof (error as EmbedAuthorityError).code === "string"
  );
}

const PUBLIC_PARTNER_ENTRY_NOT_FOUND_CODES = new Set([
  "PARTNER_ENTRY_NOT_FOUND",
  "PARTNER_ENTRY_REVOKED",
  "PARTNER_ENTRY_INACTIVE",
]);

/**
 * The public authority deliberately hides missing, revoked, and inactive
 * partner entries behind 404 responses. Other 404s (for example, a gateway or
 * route misconfiguration) and all 5xx responses are service failures and must
 * reach the route error boundary instead of masquerading as a missing entry.
 */
export function isPublicPartnerEntryNotFoundError(error: unknown) {
  return (
    isEmbedAuthorityError(error) &&
    error.status === 404 &&
    PUBLIC_PARTNER_ENTRY_NOT_FOUND_CODES.has(error.code)
  );
}
