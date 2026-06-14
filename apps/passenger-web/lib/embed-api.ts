import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  PartnerChannelEntryRecord,
} from "@drts/contracts";
import type { CreatePartnerIngressHandoffCommand } from "@drts/contracts";
import type { PartnerIngressHandoffSession } from "@drts/contracts";
import { getServerApiBaseUrl } from "./embed-runtime";

const API_URL = getServerApiBaseUrl();

type EmbedAuthorityError = Error & {
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

  return envelope.data;
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
