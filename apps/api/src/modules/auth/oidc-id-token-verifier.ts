import { createPublicKey, type JsonWebKey } from "node:crypto";
import * as jwt from "jsonwebtoken";
import { ApiRequestError } from "../../common/api-envelope";
import { detectAuthEnvironment } from "../../config/auth-startup-config";

export const GOOGLE_OIDC_ISSUER = "https://accounts.google.com";
export const GOOGLE_OIDC_ENDPOINTS = {
  authorization: "https://accounts.google.com/o/oauth2/v2/auth",
  token: "https://oauth2.googleapis.com/token",
  userinfo: "https://openidconnect.googleapis.com/v1/userinfo",
  jwks: "https://www.googleapis.com/oauth2/v3/certs",
} as const;

export const LINE_OIDC_ISSUER = "https://access.line.me";
export const LINE_OIDC_ENDPOINTS = {
  authorization: "https://access.line.me/oauth2/v2.1/authorize",
  token: "https://api.line.me/oauth2/v2.1/token",
  jwks: "https://api.line.me/oauth2/v2.1/certs",
} as const;

export function isGoogleOidcIssuer(issuer: string): boolean {
  return issuer === GOOGLE_OIDC_ISSUER || issuer === "accounts.google.com";
}

/** Explicit per-caller overrides for callers outside the tenant/partner default chain
 * (e.g. passenger OAuth, which has its own client ids and, for LINE, its own HS256
 * channel-secret verification key). Any field left undefined keeps the existing
 * tenant/legacy env-var resolution chain unchanged. */
export interface OidcVerifyOverrides {
  issuer?: string;
  audience?: string;
  jwksUri?: string;
  /** HS256 verification key, valid in every environment (unlike the tenant/legacy
   * OIDC_CLIENT_SECRET fallback below, which is a local/test-only convenience). */
  hsSecret?: string;
}

interface SigningKey extends JsonWebKey {
  kid?: string;
  alg?: string;
  use?: string;
  key_ops?: string[];
}

interface CachedKeys {
  keys: SigningKey[];
  expiresAt: number;
  lastMissRefresh: number;
}

/** Shared by the code callback and the legacy ID-token exchange. Never uses
 * the DRTS session signing key as an identity-provider verification key. */
export class OidcIdTokenVerifier {
  private readonly cache = new Map<string, CachedKeys>();
  private readonly pending = new Map<string, Promise<CachedKeys>>();

  async verify(
    idToken: string,
    nonce?: string,
    tenantEndpoint = false,
    overrides?: OidcVerifyOverrides,
  ): Promise<jwt.JwtPayload> {
    try {
      const issuer =
        overrides?.issuer?.trim() ||
        (tenantEndpoint ? process.env.TENANT_OIDC_ISSUER : undefined)?.trim() ||
        process.env.OIDC_ISSUER?.trim() ||
        process.env.JWT_ISSUER?.trim() ||
        "https://auth.staging.drts.internal";
      const audience =
        overrides?.audience?.trim() ||
        (tenantEndpoint
          ? process.env.TENANT_OIDC_AUDIENCE
          : undefined
        )?.trim() ||
        process.env.OIDC_CLIENT_ID?.trim() ||
        process.env.OIDC_AUDIENCE?.trim() ||
        "drts-bff-client";
      const google = isGoogleOidcIssuer(issuer);
      const decoded = jwt.decode(idToken, { complete: true });
      if (!decoded || typeof decoded.payload === "string")
        throw new Error("Malformed token");
      const { alg, kid } = decoded.header;
      const staticKey =
        tenantEndpoint && !google
          ? process.env.TENANT_OIDC_JWT_PUBLIC_KEY?.trim()
          : undefined;
      const environment = detectAuthEnvironment();
      const staticSecret = !google
        ? overrides?.hsSecret?.trim() ||
          (tenantEndpoint
            ? process.env.TENANT_OIDC_JWT_SECRET?.trim()
            : undefined) ||
          (environment === "local" || environment === "test"
            ? process.env.OIDC_CLIENT_SECRET
            : undefined)
        : undefined;
      const algorithms: jwt.Algorithm[] = google
        ? ["RS256"]
        : staticSecret
          ? ["RS256", "ES256", "HS256"]
          : ["RS256", "ES256"];
      if (!algorithms.includes(alg as jwt.Algorithm))
        throw new Error("Algorithm not allowed");
      let key: jwt.Secret | jwt.PublicKey =
        alg === "HS256" ? staticSecret || "" : staticKey || "";
      if (!key) {
        if (!kid || typeof kid !== "string") throw new Error("Missing key id");
        const uri =
          overrides?.jwksUri?.trim() ||
          process.env.OIDC_JWKS_URI?.trim() ||
          (google
            ? GOOGLE_OIDC_ENDPOINTS.jwks
            : `${issuer}/.well-known/jwks.json`);
        let keys: SigningKey[];
        // Offline keys remain a non-Google provider fixture only. Google always
        // uses its rotating endpoint, even if historical static env vars remain.
        if (!google && process.env.OIDC_JWKS_JSON) {
          keys = JSON.parse(process.env.OIDC_JWKS_JSON).keys;
        } else {
          const cached = await this.loadKeys(uri);
          keys = cached.keys;
          if (
            !keys.some((candidate) => candidate.kid === kid) &&
            Date.now() - cached.lastMissRefresh >= 5_000
          ) {
            // One refresh for a new kid; coalesce concurrent misses and bound
            // attacker-driven refetches during the cache lifetime.
            cached.lastMissRefresh = Date.now();
            keys = (await this.loadKeys(uri, true)).keys;
          }
        }
        const matches = keys.filter(
          (candidate) =>
            candidate.kid === kid &&
            (!candidate.alg || candidate.alg === alg) &&
            (!candidate.use || candidate.use === "sig") &&
            (!candidate.key_ops || candidate.key_ops.includes("verify")) &&
            candidate.kty === (alg === "ES256" ? "EC" : "RSA"),
        );
        if (matches.length !== 1) throw new Error("No unique signing key");
        key = createPublicKey({ key: matches[0]!, format: "jwk" });
      }
      const claims = jwt.verify(idToken, key, {
        algorithms,
        issuer: google ? [GOOGLE_OIDC_ISSUER, "accounts.google.com"] : issuer,
        audience,
      }) as jwt.JwtPayload;
      if (
        typeof claims.sub !== "string" ||
        !claims.sub.trim() ||
        typeof claims.exp !== "number" ||
        !Number.isFinite(claims.exp) ||
        (claims.azp !== undefined && claims.azp !== audience) ||
        (Array.isArray(claims.aud) &&
          claims.aud.length > 1 &&
          claims.azp !== audience) ||
        (nonce !== undefined && claims.nonce !== nonce)
      )
        throw new Error("Invalid required claims");
      if (
        claims.amr !== undefined &&
        (!Array.isArray(claims.amr) ||
          claims.amr.some((value: unknown) => typeof value !== "string"))
      )
        throw new Error("Invalid amr");
      if (claims.acr !== undefined && typeof claims.acr !== "string")
        throw new Error("Invalid acr");
      return { ...claims, iss: google ? GOOGLE_OIDC_ISSUER : claims.iss };
    } catch {
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "OIDC ID token signature or claims verification failed.",
      );
    }
  }

  private async loadKeys(uri: string, force = false): Promise<CachedKeys> {
    if (new URL(uri).protocol !== "https:")
      throw new Error("HTTPS JWKS required");
    const cached = this.cache.get(uri);
    if (!force && cached && cached.expiresAt > Date.now()) return cached;
    const pending = this.pending.get(uri);
    if (pending) return pending;
    const request = (async () => {
      const response = await fetch(uri, {
        redirect: "error",
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) throw new Error("JWKS unavailable");
      const body = (await response.json()) as { keys?: SigningKey[] };
      if (!Array.isArray(body.keys) || !body.keys.length)
        throw new Error("Invalid JWKS");
      const maxAge = /(?:^|,)\s*max-age=(\d+)/i.exec(
        response.headers.get("cache-control") ?? "",
      )?.[1];
      const ttl = Math.min(Number(maxAge ?? 300), 3600) * 1000;
      const entry = {
        keys: body.keys,
        expiresAt: Date.now() + ttl,
        lastMissRefresh: cached?.lastMissRefresh ?? 0,
      };
      this.cache.set(uri, entry);
      return entry;
    })();
    this.pending.set(uri, request);
    try {
      return await request;
    } finally {
      this.pending.delete(uri);
    }
  }
}
