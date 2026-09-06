import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  Optional,
} from "@nestjs/common";
import type { VoiceAgentBookingActor, VoiceCapabilityTokenClaims } from "@drts/contracts";

import { VoiceBookingRepository } from "../../modules/voice-booking/voice-booking.repository";
import { ApiRequestError } from "../api-envelope";
import { VoiceCapabilityService } from "./voice-capability.service";

export interface VoiceCapabilityRequestLike {
  headers: Record<string, string | string[] | undefined>;
  voiceCapability?: VoiceCapabilityTokenClaims;
  bookingActor?: VoiceAgentBookingActor;
}

function extractBearerToken(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  const raw = headers.authorization ?? headers.Authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1]?.trim() || null;
}

/**
 * Builds the domain `bookingActor` used for audit and ownership checks
 * *exclusively* from verified capability claims. There is deliberately no
 * code path here that reads `request.body` -- a caller cannot forge
 * `body.agentId` (or any other actor-shaped field) into authority because
 * nothing downstream of this guard ever looks at the body for identity.
 */
export function buildVoiceAgentBookingActor(
  claims: VoiceCapabilityTokenClaims,
): VoiceAgentBookingActor {
  return {
    type: "voice_agent",
    voiceSessionId: claims.voiceSessionId,
    principalId: claims.servicePrincipalId,
  };
}

/**
 * SD §4.2's "專用 verifier": checks the signed capability token (see
 * VoiceCapabilityService.verify) and then re-checks scope/epoch against
 * durable state, per "scope／epoch 仍回 DB 核對". Rejects:
 *  - a token minted for a different resourceScopeId than the session is
 *    currently bound to (cross-brand/cross-product reuse),
 *  - a token whose leaseEpoch is behind the session's current leaseEpoch
 *    (stale/superseded owner epoch),
 *  - a token for a session that no longer exists or whose resource scope
 *    has been revoked.
 */
@Injectable()
export class VoiceCapabilityGuard implements CanActivate {
  constructor(
    private readonly capabilityService: VoiceCapabilityService,
    @Optional() private readonly repository?: VoiceBookingRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<VoiceCapabilityRequestLike>();
    const claims = await this.authenticate(request.headers);
    request.voiceCapability = claims;
    request.bookingActor = buildVoiceAgentBookingActor(claims);
    return true;
  }

  async authenticate(
    headers: Record<string, string | string[] | undefined>,
  ): Promise<VoiceCapabilityTokenClaims> {
    const token = extractBearerToken(headers);
    if (!token) {
      throw new ApiRequestError(
        401,
        "VOICE_INVALID_PROOF",
        "Missing voice capability bearer token.",
      );
    }

    const claims = this.capabilityService.verify(token);

    if (this.repository) {
      await this.assertLiveScope(claims);
    }

    return claims;
  }

  private async assertLiveScope(
    claims: VoiceCapabilityTokenClaims,
  ): Promise<void> {
    const session = await this.repository!.findSessionById(
      claims.voiceSessionId,
    );
    if (!session) {
      throw new ApiRequestError(
        403,
        "VOICE_SESSION_NOT_OWNER",
        "Voice session bound to this capability no longer exists.",
      );
    }

    if (session.resourceScopeId !== claims.resourceScopeId) {
      throw new ApiRequestError(
        403,
        "VOICE_SCOPE_DENIED",
        "Capability resource scope no longer matches the bound session's scope.",
      );
    }

    if (session.routeProfileVersion !== claims.routeProfileVersion) {
      throw new ApiRequestError(
        409,
        "VOICE_CAPABILITY_REJECTED",
        "Capability route profile version is stale for this session.",
      );
    }

    if (claims.leaseEpoch < session.leaseEpoch) {
      throw new ApiRequestError(
        409,
        "VOICE_SESSION_NOT_OWNER",
        "Capability lease epoch has been superseded by a newer owner.",
      );
    }

    const resourceScope = await this.repository!.findResourceScopeById(
      claims.resourceScopeId,
    );
    if (!resourceScope || resourceScope.status !== "active") {
      throw new ApiRequestError(
        403,
        "VOICE_SCOPE_DENIED",
        "Resource scope bound to this capability is not active.",
      );
    }
  }
}

/**
 * Reads the request context populated by VoiceCapabilityGuard. Never reads
 * the request body -- see buildVoiceAgentBookingActor.
 */
export const CurrentVoiceCapability = createParamDecorator(
  (_data: unknown, context: ExecutionContext): VoiceCapabilityTokenClaims => {
    const request = context
      .switchToHttp()
      .getRequest<VoiceCapabilityRequestLike>();
    if (!request.voiceCapability) {
      throw new ApiRequestError(
        401,
        "VOICE_INVALID_PROOF",
        "Voice capability was not verified for this request.",
      );
    }
    return request.voiceCapability;
  },
);

export const CurrentBookingActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): VoiceAgentBookingActor => {
    const request = context
      .switchToHttp()
      .getRequest<VoiceCapabilityRequestLike>();
    if (!request.bookingActor) {
      throw new ApiRequestError(
        401,
        "VOICE_INVALID_ACTOR",
        "Booking actor was not resolved for this request.",
      );
    }
    return request.bookingActor;
  },
);
