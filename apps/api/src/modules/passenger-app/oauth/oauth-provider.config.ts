import type { AuthProvider } from "@drts/contracts";
import {
  GOOGLE_OIDC_ENDPOINTS,
  GOOGLE_OIDC_ISSUER,
  LINE_OIDC_ENDPOINTS,
  LINE_OIDC_ISSUER,
  type OidcVerifyOverrides,
} from "../../auth/oidc-id-token-verifier";
import type { OAuthProvider } from "./oauth-transaction.port";

export interface OAuthProviderConfig {
  provider: OAuthProvider;
  clientId: string;
  clientSecret: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  verifyOverrides: OidcVerifyOverrides;
}

/** Every provider is all-or-nothing: a partially configured provider is
 * treated as absent rather than started with a missing secret. */
function configured(
  provider: OAuthProvider,
  clientId: string | undefined,
  clientSecret: string | undefined,
): OAuthProviderConfig | null {
  const id = clientId?.trim();
  const secret = clientSecret?.trim();
  if (!id || !secret) return null;
  if (provider === "google")
    return {
      provider,
      clientId: id,
      clientSecret: secret,
      authorizationEndpoint: GOOGLE_OIDC_ENDPOINTS.authorization,
      tokenEndpoint: GOOGLE_OIDC_ENDPOINTS.token,
      verifyOverrides: { issuer: GOOGLE_OIDC_ISSUER, audience: id },
    };
  if (provider === "line")
    return {
      provider,
      clientId: id,
      clientSecret: secret,
      authorizationEndpoint: LINE_OIDC_ENDPOINTS.authorization,
      tokenEndpoint: LINE_OIDC_ENDPOINTS.token,
      verifyOverrides: {
        issuer: LINE_OIDC_ISSUER,
        audience: id,
        jwksUri: LINE_OIDC_ENDPOINTS.jwks,
        // LINE Login v2.1 ID tokens default to HS256-with-channel-secret; a
        // channel can also be switched to RS256, verified via LINE's JWKS.
        hsSecret: secret,
      },
    };
  return null; // facebook: table/flow reserved, OAuth2 (not OIDC) exchange not implemented yet.
}

export function resolveOAuthProviderConfig(
  provider: OAuthProvider,
): OAuthProviderConfig | null {
  if (provider === "google")
    return configured(
      provider,
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    );
  if (provider === "line")
    return configured(
      provider,
      process.env.LINE_CHANNEL_ID,
      process.env.LINE_CHANNEL_SECRET,
    );
  return null;
}

export function listConfiguredAuthProviders(): AuthProvider[] {
  const providers: AuthProvider[] = [];
  if (
    process.env.SMS_PROVIDER_API_KEY?.trim() &&
    process.env.SMS_PROVIDER_SENDER_ID?.trim()
  )
    providers.push("phone");
  providers.push("email");
  if (resolveOAuthProviderConfig("google")) providers.push("google");
  // Facebook's OAuth2 (not OIDC) exchange is not implemented by this task,
  // regardless of env config, so it is never reported as available here.
  if (resolveOAuthProviderConfig("line")) providers.push("line");
  return providers;
}

/** Exact-match allowlist: the SD's open-redirect guard. Each entry is a full
 * callback URL (e.g. `https://ride.smarttransport.tw/auth/callback/google`),
 * not an origin, so one provider's entry can never authorize another's path. */
export function isAllowedOAuthRedirectUri(redirectUri: string): boolean {
  const allowlist = (process.env.OAUTH_REDIRECT_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return allowlist.includes(redirectUri);
}
