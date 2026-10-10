import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { OAuthCallbackResponse, OAuthStartResponse } from "@drts/contracts";
import { ApiRequestError } from "../../../common/api-envelope";
import type { RequestIdentity } from "../../../common/auth/auth.types";
import { OidcIdTokenVerifier } from "../../auth/oidc-id-token-verifier";
import { PassengerAccountService } from "../account/passenger-account.service";
import {
  isAllowedOAuthRedirectUri,
  resolveOAuthProviderConfig,
  type OAuthProviderConfig,
} from "./oauth-provider.config";
import type {
  OAuthProvider,
  OAuthTransactionPurpose,
  OAuthTransactionRecord,
  OAuthTransactionStore,
} from "./oauth-transaction.port";
import { PassengerOAuthTransactionRepository } from "./oauth-transaction.repository";

// Matches the tenant/partner OIDC state TTL (oidc-pkce.service.ts).
const TRANSACTION_TTL_MS = 10 * 60 * 1000;
const PROVIDERS = new Set<OAuthProvider>(["google", "facebook", "line"]);
// transaction_id is a uuid PRIMARY KEY (V0111); reject malformed values here
// as invalid_grant, never let them reach the repository's SQL as a raw string.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function base64url(input: Buffer): string {
  return input.toString("base64url");
}
function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
function unsupportedProvider(): never {
  throw new ApiRequestError(
    400,
    "unsupported_provider",
    "This login provider is not enabled on this deployment.",
  );
}
function invalidGrant(): never {
  throw new ApiRequestError(
    401,
    "invalid_grant",
    "OAuth authorization grant is invalid, expired, or already used.",
  );
}
function unauthorized(): never {
  throw new ApiRequestError(
    401,
    "unauthorized",
    "An active passenger session is required to link a login identity.",
  );
}
function validation(message: string): never {
  throw new ApiRequestError(400, "validation_error", message);
}

interface StartCommand {
  provider: OAuthProvider;
  redirectUri: string;
  purpose: OAuthTransactionPurpose;
}
function parseStartCommand(raw: unknown): StartCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    validation("Invalid OAuth start command.");
  const body = raw as Record<string, unknown>;
  if (
    Object.keys(body).some(
      (key) => !["provider", "redirectUri", "purpose"].includes(key),
    )
  )
    validation("Invalid OAuth start command.");
  if (typeof body.provider !== "string" || !PROVIDERS.has(body.provider as OAuthProvider))
    validation("Unknown OAuth provider.");
  if (typeof body.redirectUri !== "string" || !body.redirectUri.trim())
    validation("redirectUri is required.");
  if (body.purpose !== "login" && body.purpose !== "link")
    validation("purpose must be 'login' or 'link'.");
  return {
    provider: body.provider as OAuthProvider,
    redirectUri: body.redirectUri.trim(),
    purpose: body.purpose,
  };
}

interface CallbackCommand {
  provider: OAuthProvider;
  code: string;
  state: string;
  transactionId: string;
}
function parseCallbackCommand(raw: unknown): CallbackCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    invalidGrant();
  const body = raw as Record<string, unknown>;
  if (
    Object.keys(body).some(
      (key) => !["provider", "code", "state", "transactionId"].includes(key),
    )
  )
    invalidGrant();
  if (typeof body.provider !== "string" || !PROVIDERS.has(body.provider as OAuthProvider))
    invalidGrant();
  if (typeof body.code !== "string" || !body.code.trim()) invalidGrant();
  if (typeof body.state !== "string" || !body.state.trim()) invalidGrant();
  if (typeof body.transactionId !== "string" || !UUID_PATTERN.test(body.transactionId))
    invalidGrant();
  return {
    provider: body.provider as OAuthProvider,
    code: body.code,
    state: body.state,
    transactionId: body.transactionId,
  };
}

function requirePassengerBearer(identity: RequestIdentity | null): string {
  if (
    !identity ||
    identity.authMode !== "jwt_bearer" ||
    identity.realm !== "passenger" ||
    !identity.drtsPassengerId
  )
    unauthorized();
  return identity.drtsPassengerId;
}

@Injectable()
export class PassengerOAuthService {
  private readonly idTokenVerifier = new OidcIdTokenVerifier();

  constructor(
    @Inject(PassengerOAuthTransactionRepository)
    private readonly transactions: OAuthTransactionStore,
    private readonly accounts: PassengerAccountService,
  ) {}

  async start(
    provider: OAuthProvider,
    rawCommand: unknown,
    identity: RequestIdentity | null,
  ): Promise<OAuthStartResponse> {
    const config = resolveOAuthProviderConfig(provider);
    if (!config) unsupportedProvider();
    const command = parseStartCommand(rawCommand);
    if (command.provider !== provider)
      validation("Provider path and body must match.");
    if (!isAllowedOAuthRedirectUri(command.redirectUri))
      validation("Redirect URI is not in the configured allowlist.");

    // Session-bound transaction: a link transaction is permanently tied to the
    // account the caller was authenticated as at /start time, never to
    // whatever Bearer happens to be presented again at /callback.
    const drtsPassengerId =
      command.purpose === "link" ? requirePassengerBearer(identity) : null;

    const state = base64url(randomBytes(24));
    const nonce = base64url(randomBytes(24));
    const codeVerifier = base64url(randomBytes(32));
    const codeChallenge = base64url(
      createHash("sha256").update(codeVerifier).digest(),
    );
    const now = Date.now();
    const expiresAt = new Date(now + TRANSACTION_TTL_MS).toISOString();
    const transactionId = randomUUID();

    await this.transactions.insert({
      transactionId,
      provider,
      purpose: command.purpose,
      stateHash: sha256Hex(state),
      nonce,
      codeVerifier,
      codeChallenge,
      redirectUri: command.redirectUri,
      drtsPassengerId,
      createdAt: new Date(now).toISOString(),
      expiresAt,
      consumedAt: null,
    });

    const authUrl = new URL(config.authorizationEndpoint);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", config.clientId);
    authUrl.searchParams.set("scope", "openid profile email");
    authUrl.searchParams.set("redirect_uri", command.redirectUri);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("nonce", nonce);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    return {
      authUrl: authUrl.toString(),
      transactionId,
      expiresAt,
      state,
    };
  }

  async callback(
    provider: OAuthProvider,
    rawCommand: unknown,
    identity: RequestIdentity | null,
  ): Promise<OAuthCallbackResponse> {
    const config = resolveOAuthProviderConfig(provider);
    if (!config) unsupportedProvider();
    const command = parseCallbackCommand(rawCommand);
    if (command.provider !== provider) invalidGrant();

    const now = new Date().toISOString();
    const transaction = await this.transactions.claim(command.transactionId, now);
    if (!transaction) invalidGrant();
    if (
      transaction.provider !== provider ||
      transaction.stateHash !== sha256Hex(command.state)
    )
      invalidGrant();

    if (transaction.purpose === "link") {
      const callerId = requirePassengerBearer(identity);
      if (callerId !== transaction.drtsPassengerId) unauthorized();
    }

    const claims = await this.exchangeCode(config, command.code, transaction);
    const verifiedAttributes: { displayName?: string; verifiedEmail?: string } =
      {};
    if (typeof claims.name === "string" && claims.name.trim())
      verifiedAttributes.displayName = claims.name.trim().slice(0, 100);
    if (
      claims.email_verified === true &&
      typeof claims.email === "string" &&
      claims.email.trim()
    )
      verifiedAttributes.verifiedEmail = claims.email.trim();

    if (transaction.purpose === "link") {
      await this.accounts.linkIdentity(
        identity,
        provider,
        claims.sub,
        verifiedAttributes,
      );
      return { result: "linked" };
    }

    const account = await this.accounts.findOrCreateByIdentity(
      provider,
      claims.sub,
      verifiedAttributes,
    );
    const session = await this.accounts.issueSession(account.drtsPassengerId);
    return {
      result: "logged_in",
      drtsPassengerId: account.drtsPassengerId,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    };
  }

  private async exchangeCode(
    config: OAuthProviderConfig,
    code: string,
    transaction: OAuthTransactionRecord,
  ): Promise<{ sub: string; name?: unknown; email?: unknown; email_verified?: unknown }> {
    const params = new URLSearchParams();
    params.set("grant_type", "authorization_code");
    params.set("code", code);
    params.set("redirect_uri", transaction.redirectUri);
    params.set("client_id", config.clientId);
    params.set("client_secret", config.clientSecret);
    params.set("code_verifier", transaction.codeVerifier);

    let response: Response;
    try {
      response = await fetch(config.tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: params.toString(),
      });
    } catch {
      invalidGrant();
    }
    if (!response.ok) invalidGrant();
    const body = (await response.json()) as { id_token?: unknown };
    if (typeof body.id_token !== "string" || !body.id_token.trim())
      invalidGrant();

    const claims = await this.idTokenVerifier
      .verify(body.id_token, transaction.nonce, false, config.verifyOverrides)
      .catch(() => invalidGrant());
    // OidcIdTokenVerifier.verify already rejects a missing/empty sub claim.
    return claims as { sub: string; name?: unknown; email?: unknown; email_verified?: unknown };
  }
}
