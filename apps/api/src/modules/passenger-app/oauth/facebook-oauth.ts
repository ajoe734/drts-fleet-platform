import { createHash, createHmac } from "node:crypto";
import { ApiRequestError } from "../../../common/api-envelope";
import type { OAuthProviderConfig } from "./oauth-provider.config";
import type { OAuthTransactionRecord } from "./oauth-transaction.port";

// Explicit version, never an environment-controlled host. Real Meta App
// provisioning and provider validation remain an external gate.
export const FACEBOOK_GRAPH_ORIGIN = "https://graph.facebook.com/v24.0";
export const FACEBOOK_AUTHORIZATION_ENDPOINT =
  "https://www.facebook.com/v24.0/dialog/oauth";

function invalidGrant(): never {
  throw new ApiRequestError(401, "invalid_grant", "Invalid Facebook grant.");
}

async function json(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) invalidGrant();
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) invalidGrant();
    return body as Record<string, unknown>;
  } catch {
    // Never echo provider bodies, codes, tokens, or secrets to the client.
    invalidGrant();
  }
}

function subject(value: unknown): value is string {
  return typeof value === "string" && /^[0-9]{1,128}$/.test(value);
}

export async function exchangeFacebookCode(
  config: OAuthProviderConfig,
  code: string,
  transaction: OAuthTransactionRecord,
): Promise<{ sub: string; name?: string }> {
  // Preserve the server-held transaction/PKCE binding. Never take a verifier
  // from callback input. Provider-side PKCE support still needs hosted UAT.
  if (
    !/^[A-Za-z0-9_-]{43,128}$/.test(transaction.codeVerifier) ||
    createHash("sha256").update(transaction.codeVerifier).digest("base64url") !==
      transaction.codeChallenge
  ) invalidGrant();

  const token = await json(config.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: transaction.redirectUri,
      code_verifier: transaction.codeVerifier,
    }).toString(),
  });
  if (typeof token.access_token !== "string" || !token.access_token.trim()) invalidGrant();
  const accessToken = token.access_token;
  const debugUrl = new URL(`${FACEBOOK_GRAPH_ORIGIN}/debug_token`);
  debugUrl.searchParams.set("input_token", accessToken);
  const debug = await json(debugUrl.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${config.clientId}|${config.clientSecret}`, Accept: "application/json" },
  });
  const data = debug.data as Record<string, unknown> | undefined;
  if (!data || data.is_valid !== true || data.app_id !== config.clientId || !subject(data.user_id)) invalidGrant();
  const now = Date.now() / 1000;
  for (const key of ["expires_at", "data_access_expires_at"] as const) {
    const expiry = data[key];
    if (expiry !== undefined &&
      (typeof expiry !== "number" || !Number.isFinite(expiry) || expiry < 0 || (expiry !== 0 && expiry <= now))) invalidGrant();
  }

  const meUrl = new URL(`${FACEBOOK_GRAPH_ORIGIN}/me`);
  meUrl.searchParams.set("fields", "id,name,email");
  meUrl.searchParams.set("appsecret_proof", createHmac("sha256", config.clientSecret).update(accessToken).digest("hex"));
  const me = await json(meUrl.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!subject(me.id) || me.id !== data.user_id) invalidGrant();
  // Facebook email has no verified-email assertion: do not persist it as a
  // verified contact, and never use it for identity lookup/account merging.
  const name = typeof me.name === "string" ? me.name.trim().slice(0, 100) : "";
  return { sub: me.id, ...(name && ![...name].some((c) => c.charCodeAt(0) < 32) ? { name } : {}) };
}
