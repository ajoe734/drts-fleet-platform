import "server-only";

import type { ApiListData, ApiSuccessEnvelope } from "@drts/contracts";

const DEFAULT_API_BASE_URL = "http://localhost:3001";
const METADATA_IDENTITY_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";

function resolveServerApiBaseUrl(): string {
  return process.env.DRTS_API_URL || DEFAULT_API_BASE_URL;
}

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
    if (!response.ok) {
      return null;
    }
    return response.text();
  } catch {
    return null;
  }
}

async function buildDefaultHeaders(tenantId: string, actorId: string) {
  const headers: Record<string, string> = {
    "x-actor-type": "tenant_admin",
    "x-actor-id": actorId,
    "x-realm": "tenant",
    "x-tenant-id": tenantId,
  };
  const apiUrl = resolveServerApiBaseUrl();
  const protectedAudience = process.env.DRTS_API_AUTH_AUDIENCE?.trim();

  if (protectedAudience) {
    const token = await mintMetadataIdentityToken(protectedAudience);
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }
  } else if (apiUrl.includes(".a.run.app")) {
    const token = await mintMetadataIdentityToken(apiUrl);
    if (token) {
      headers["x-serverless-authorization"] = `Bearer ${token}`;
    }
  }

  return headers;
}

const DEFAULT_API_TIMEOUT_MS = 5000;

async function unwrap<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(
      `Bank API ${response.status} ${response.statusText}: ${message.slice(0, 240)}`,
    );
  }

  try {
    const envelope = (await response.json()) as ApiSuccessEnvelope<T>;
    return envelope?.data;
  } catch (error) {
    throw new Error(
      `Bank API returned invalid JSON: ${error instanceof Error ? error.message : "parse error"}`,
    );
  }
}

export async function bankApiGet<T>(
  path: string,
  tenantId: string,
  actorId: string,
): Promise<T> {
  const timeoutMs =
    Number(process.env.BANK_API_TIMEOUT_MS) || DEFAULT_API_TIMEOUT_MS;
  const headers = await buildDefaultHeaders(tenantId, actorId);
  const response = await fetch(new URL(path, `${resolveServerApiBaseUrl()}/`), {
    cache: "no-store",
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  return unwrap<T>(response);
}

export async function bankApiGetList<T>(
  path: string,
  tenantId: string,
  actorId: string,
): Promise<T[]> {
  const data = await bankApiGet<ApiListData<T> | T[]>(path, tenantId, actorId);
  if (Array.isArray(data)) {
    return data;
  }
  if (data && Array.isArray(data.items)) {
    return data.items;
  }
  return [];
}
