import { Injectable, Logger } from "@nestjs/common";
import * as jwt from "jsonwebtoken";
import {
  VoiceCapabilityTokenClaimsSchema,
  VoiceCapabilityTokenEnvelopeSchema,
  type VoiceCapabilityScope,
  type VoiceCapabilityTokenClaims,
  type VoiceCapabilityTokenEnvelope,
} from "@drts/contracts";

import { ApiRequestError } from "../api-envelope";
import {
  JwtKeyAlgorithmMismatchError,
  JwtKeyRetiredError,
  JwtUnknownKeyError,
  SigningKeyRing,
} from "./signing-key-ring";
import type { BootstrapRequestIdentity } from "./auth.types";

/**
 * SD §4.2: "既有 workload service principal＋第二階段 session capability".
 *
 * Stage 1 is ordinary workload authentication (JwtAuthService /
 * BootstrapAuthGuard) producing a `BootstrapRequestIdentity` with
 * `actorType=system`. Stage 2, implemented here, exchanges that already
 * authenticated identity for a short-lived, session- and scope-bound
 * `voice-tool-gateway` capability token. The exchange itself is gated by the
 * `voice:capability:issue` IAM scope (packages/contracts/src/
 * iam-policy-catalog.ts) so only workload principals explicitly granted that
 * scope may mint capability tokens at all.
 *
 * The minted token is a normal signed JWT (reusing the same SigningKeyRing
 * as JwtAuthService) but is never accepted by JwtAuthService.verify: its
 * audience is fixed to `voice-tool-gateway`, distinct from the control-plane
 * audience, and its claims shape (VoiceCapabilityTokenClaimsSchema, `.strict()`)
 * is intentionally incompatible with `JwtIdentityPayload`. It does not carry
 * roles/roleFamilies/scopes-of-the-workload-identity; it carries only the
 * fields a voice tool call needs to be re-checked against durable state
 * (servicePrincipalId, voiceSessionId, resourceScopeId, routeProfileVersion,
 * leaseEpoch, scopes).
 */

export const VOICE_CAPABILITY_AUDIENCE = "voice-tool-gateway" as const;
export const VOICE_CAPABILITY_ISSUE_SCOPE = "voice:capability:issue";
const DEFAULT_TTL_SECONDS = 120;
const DEFAULT_ISSUER = "drts_voice_capability_issuer";

export interface IssueVoiceCapabilityCommand {
  voiceSessionId: string;
  resourceScopeId: string;
  routeProfileVersion: number;
  leaseEpoch: number;
  scopes: readonly VoiceCapabilityScope[];
  ttlSeconds?: number;
}

function rejected(message: string, details?: Record<string, unknown>) {
  return new ApiRequestError(
    401,
    "VOICE_CAPABILITY_REJECTED",
    message,
    details,
  );
}

/**
 * Tool-level scope fencing (SD §6.3): a verified capability may still lack
 * the specific scope a given tool needs (e.g. a capability minted with only
 * `order_read_bound` must not be able to call a `cancel_bound` tool). Model
 * output never supplies scopes; only the signed token does.
 */
export function assertVoiceCapabilityScope(
  claims: VoiceCapabilityTokenClaims,
  requiredScope: VoiceCapabilityScope,
): void {
  if (!claims.scopes.includes(requiredScope)) {
    throw new ApiRequestError(
      403,
      "VOICE_UNAUTHORIZED_SCOPE",
      `Voice capability is missing required scope '${requiredScope}'.`,
    );
  }
}

@Injectable()
export class VoiceCapabilityService {
  private readonly logger = new Logger(VoiceCapabilityService.name);

  private getIssuer(): string {
    return process.env.VOICE_CAPABILITY_ISSUER?.trim() || DEFAULT_ISSUER;
  }

  private getSignKey() {
    return new SigningKeyRing().getActiveSigningKey();
  }

  /**
   * Stage 2 of SD §4.2. `identity` must already be an authenticated
   * `actorType=system` workload principal (stage 1); this method never
   * accepts a client-declared actor. Throws 403 if the identity is missing
   * the `voice:capability:issue` scope -- the exchange itself is scope
   * gated, not just the resulting capability's own scopes.
   */
  issue(
    identity: BootstrapRequestIdentity | null | undefined,
    command: IssueVoiceCapabilityCommand,
  ): VoiceCapabilityTokenEnvelope {
    if (!identity || identity.actorType !== "system") {
      throw new ApiRequestError(
        403,
        "VOICE_INVALID_ACTOR",
        "Voice capability tokens may only be issued to an authenticated workload service principal (actorType=system).",
      );
    }

    if (!identity.scopes?.includes(VOICE_CAPABILITY_ISSUE_SCOPE)) {
      throw new ApiRequestError(
        403,
        "VOICE_CAPABILITY_REJECTED",
        `Workload principal is missing the '${VOICE_CAPABILITY_ISSUE_SCOPE}' scope required to mint voice capability tokens.`,
      );
    }

    const servicePrincipalId = identity.principalId ?? identity.actorId;
    if (!servicePrincipalId) {
      throw new ApiRequestError(
        403,
        "VOICE_INVALID_ACTOR",
        "Workload principal has no resolvable principalId/actorId to bind the capability to.",
      );
    }

    const ttlSeconds = command.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    const issuedAtSeconds = Math.floor(Date.now() / 1000);

    const claims: VoiceCapabilityTokenClaims =
      VoiceCapabilityTokenClaimsSchema.parse({
        iss: this.getIssuer(),
        aud: VOICE_CAPABILITY_AUDIENCE,
        exp: issuedAtSeconds + ttlSeconds,
        iat: issuedAtSeconds,
        servicePrincipalId,
        voiceSessionId: command.voiceSessionId,
        resourceScopeId: command.resourceScopeId,
        routeProfileVersion: command.routeProfileVersion,
        leaseEpoch: command.leaseEpoch,
        scopes: [...command.scopes],
      });

    const activeKey = this.getSignKey();
    const token = jwt.sign(claims, activeKey.signKey, {
      algorithm: activeKey.algorithm,
      keyid: activeKey.kid,
    });

    return VoiceCapabilityTokenEnvelopeSchema.parse({
      token,
      tokenType: "Bearer",
      expiresIn: ttlSeconds,
      claims,
    });
  }

  /**
   * The "專用 verifier" SD §4.2 requires: checks signature, issuer, `aud`,
   * and expiry, then re-parses the payload against the strict capability
   * claims schema so any additional/forged field (e.g. an injected
   * `agentId`) fails closed instead of being silently carried through. Scope
   * and lease-epoch re-checks against durable session state happen
   * separately (VoiceCapabilityGuard), since that requires a DB round trip
   * this pure verifier does not perform.
   */
  verify(token: string): VoiceCapabilityTokenClaims {
    if (!token || typeof token !== "string") {
      throw rejected("Missing voice capability bearer token.");
    }

    let decoded: { header?: { alg?: string; kid?: string } } | null;
    try {
      decoded = jwt.decode(token, { complete: true }) as {
        header?: { alg?: string; kid?: string };
      } | null;
    } catch {
      throw rejected("Voice capability token is malformed.");
    }

    const algorithm = decoded?.header?.alg?.toUpperCase();
    if (!algorithm || algorithm === "NONE") {
      throw rejected("Voice capability token has an unacceptable algorithm.");
    }

    let verifyKeyInfo;
    try {
      verifyKeyInfo = new SigningKeyRing().resolveVerifyKey(
        decoded?.header?.kid,
        algorithm,
      );
    } catch (err) {
      if (
        err instanceof JwtKeyRetiredError ||
        err instanceof JwtUnknownKeyError ||
        err instanceof JwtKeyAlgorithmMismatchError
      ) {
        throw rejected("Voice capability token signing key is not valid.", {
          reason: err.name,
        });
      }
      throw rejected("Voice capability token signing key could not be resolved.");
    }

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, verifyKeyInfo.verifyKey, {
        algorithms: [verifyKeyInfo.algorithm],
        audience: VOICE_CAPABILITY_AUDIENCE,
        issuer: this.getIssuer(),
      }) as jwt.JwtPayload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new ApiRequestError(
          401,
          "VOICE_PROOF_EXPIRED",
          "Voice capability token has expired.",
        );
      }
      throw rejected("Voice capability token signature/claims are invalid.");
    }

    const parsed = VoiceCapabilityTokenClaimsSchema.safeParse(payload);
    if (!parsed.success) {
      this.logger.warn(
        `Voice capability token failed strict claims validation: ${parsed.error.message}`,
      );
      throw rejected(
        "Voice capability token payload does not match the expected shape.",
      );
    }

    return parsed.data;
  }
}
