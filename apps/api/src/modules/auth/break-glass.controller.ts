import { Body, Controller, Headers, Param, Post } from "@nestjs/common";

import type {
  ApproveBreakGlassRequestCommand,
  CloseBreakGlassGrantCommand,
  CreateBreakGlassRequestCommand,
  IamBreakGlassActivationCommand,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
} from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { JwtAuthService } from "../../common/auth/jwt-auth.service";
import { BreakGlassService } from "../identity/break-glass.service";

@Controller("platform-admin/break-glass")
@RequireRealms("platform", "ops")
export class BreakGlassController {
  constructor(
    private readonly breakGlassService: BreakGlassService,
    private readonly jwtAuthService: JwtAuthService,
  ) {}

  @Post("requests")
  @RequireScopes("identity:break-glass:request")
  async request(
    @CurrentIdentity() identity: BootstrapRequestIdentity,
    @Body() command: CreateBreakGlassRequestCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.breakGlassService.request(identity, command),
      requestId,
    );
  }

  @Post("requests/:requestId/approve")
  @RequireScopes("identity:break-glass:approve")
  async approve(
    @CurrentIdentity() identity: BootstrapRequestIdentity,
    @Param("requestId") requestId: string,
    @Body() command: ApproveBreakGlassRequestCommand,
    @Headers("x-request-id") requestIdHeader?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.breakGlassService.approve(
        identity,
        requestId,
        command.mutation,
      ),
      requestIdHeader,
    );
  }

  @Post("requests/:requestId/activate")
  @RequireScopes("identity:break-glass:activate")
  async activate(
    @CurrentIdentity() identity: BootstrapRequestIdentity,
    @Param("requestId") requestId: string,
    @Body() command: IamBreakGlassActivationCommand,
    @Headers("x-request-id") requestIdHeader?: string,
  ) {
    const grant = await this.breakGlassService.activate(identity, {
      ...command,
      requestId,
    });
    const issued = await this.jwtAuthService.issueSessionToken(
      {
        ...identity,
        authMode: "jwt_bearer",
        scopes: grant.grantedScopes,
        roles: ["break_glass"],
        roleFamilies: [identity.realm === "ops" ? "ops" : "platform"],
      },
      {
        expiresIn: `${command.requestedDurationMinutes}m`,
        absoluteExpiresAt: grant.expiresAt!,
        authTime: identity.authTime ?? new Date().toISOString(),
        amr: [...(identity.amr ?? []), "break_glass"],
        acr: identity.acr ?? "aal2",
        breakGlassGrantId: grant.grantId,
      },
    );
    await this.breakGlassService.bindSession(grant.grantId, issued.sessionId);
    return toApiSuccessEnvelope(
      {
        grant: { ...grant, sessionId: issued.sessionId },
        accessToken: issued.token,
        expiresAt: issued.expiresAt,
        refreshToken: null,
        sessionBanner: "BREAK_GLASS_ACTIVE",
      },
      requestIdHeader,
    );
  }

  @Post("requests/:requestId/close")
  @RequireScopes("identity:break-glass:activate")
  async close(
    @CurrentIdentity() identity: BootstrapRequestIdentity,
    @Param("requestId") requestId: string,
    @Body() command: CloseBreakGlassGrantCommand,
    @Headers("x-request-id") requestIdHeader?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.breakGlassService.close(identity, requestId, command),
      requestIdHeader,
    );
  }
}
