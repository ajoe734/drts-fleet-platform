import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  PartnerChannelEntryRecord,
} from "@drts/contracts";
import type { CreatePartnerIngressHandoffCommand } from "@drts/contracts";
import type { PartnerIngressHandoffSession } from "@drts/contracts";
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

function deepCamelize(value: unknown): unknown {
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
