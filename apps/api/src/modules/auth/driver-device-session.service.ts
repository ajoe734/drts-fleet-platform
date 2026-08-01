import { randomUUID } from "node:crypto";

import { Injectable, Optional } from "@nestjs/common";

import type {
  DriverDeviceBindingSummary,
  DriverDeviceProvisioningSession,
  RefreshDriverDeviceSessionCommand,
  RegisterDriverDeviceCommand,
  RevokeDriverDeviceBindingCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { JwtAuthService } from "../../common/auth/jwt-auth.service";
import { DriverProfileService } from "../driver-profile/driver-profile.service";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import { DriverDeviceSessionRepository } from "./driver-device-session.repository";

const DRIVER_ACCESS_TOKEN_EXPIRES_IN = "15m";
const DRIVER_REFRESH_TOKEN_EXPIRES_IN = "30d";
const DRIVER_REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function createOpaqueToken(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

function addDuration(isoTimestamp: string, durationMs: number) {
  return new Date(Date.parse(isoTimestamp) + durationMs).toISOString();
}

@Injectable()
export class DriverDeviceSessionService {
  constructor(
    private readonly jwtAuthService: JwtAuthService,
    private readonly driverProfileService: DriverProfileService,
    private readonly repository: DriverDeviceSessionRepository,
    @Optional()
    private readonly regulatoryRegistryService?: RegulatoryRegistryService,
  ) {}

  async register(
    command: RegisterDriverDeviceCommand,
    requestId?: string,
  ): Promise<DriverDeviceProvisioningSession> {
    const registrationCode = command.registrationCode?.trim();
    const deviceId = command.deviceId?.trim();
    if (!registrationCode) {
      throw new ApiRequestError(
        400,
        "FIELD_REQUIRED",
        "registrationCode is required.",
        { field: "registrationCode" },
      );
    }
    if (!deviceId) {
      throw new ApiRequestError(
        400,
        "FIELD_REQUIRED",
        "deviceId is required.",
        {
          field: "deviceId",
        },
      );
    }

    const driverId =
      this.driverProfileService.resolveProvisionableDriverId(registrationCode);
    if (!driverId) {
      throw new ApiRequestError(
        403,
        "DRIVER_REGISTRATION_INVALID",
        "The device registration code is invalid or not provisionable.",
        { registrationCode },
      );
    }

    this.assertDriverAuthEligible(driverId);

    const now = new Date().toISOString();
    await this.repository.revokeDriverSession(
      { deviceId },
      now,
      "device_rebound",
    );

    const refreshToken = createOpaqueToken("drvrefresh");
    const persisted = await this.repository.issueDriverDeviceSession({
      driverId,
      deviceId,
      deviceLabel: command.deviceLabel?.trim() || null,
      riskSummary: {
        riskLevel: "low",
        signals: ["device_registration"],
      },
      issuedAt: now,
      expiresAt: addDuration(now, DRIVER_REFRESH_TOKEN_TTL_MS),
      refreshToken,
    });

    this.driverProfileService.recordDeviceBinding(
      driverId,
      this.toBindingSummary(persisted.session),
      requestId,
    );

    return this.issueSession(persisted.session, refreshToken);
  }

  async refresh(
    command: RefreshDriverDeviceSessionCommand,
  ): Promise<DriverDeviceProvisioningSession> {
    const deviceId = command.deviceId?.trim();
    const refreshToken = command.refreshToken?.trim();
    if (!deviceId) {
      throw new ApiRequestError(
        400,
        "FIELD_REQUIRED",
        "deviceId is required.",
        {
          field: "deviceId",
        },
      );
    }
    if (!refreshToken) {
      throw new ApiRequestError(
        400,
        "FIELD_REQUIRED",
        "refreshToken is required.",
        { field: "refreshToken" },
      );
    }

    const rotatedAt = new Date().toISOString();
    const nextRefreshToken = createOpaqueToken("drvrefresh");
    const rotated = await this.repository.rotateDriverRefreshToken({
      deviceId,
      refreshToken,
      nextRefreshToken,
      rotatedAt,
      expiresAt: addDuration(rotatedAt, DRIVER_REFRESH_TOKEN_TTL_MS),
      riskSummary: {
        riskLevel: "low",
        signals: ["refresh_rotation"],
      },
    });

    if (rotated.outcome !== "rotated") {
      throw new ApiRequestError(
        401,
        "DRIVER_DEVICE_REFRESH_INVALID",
        "The driver device refresh token is invalid, expired, or revoked.",
        { deviceId },
      );
    }

    this.assertDriverAuthEligible(rotated.session.actorId);
    this.driverProfileService.recordDeviceBindingRefresh(
      rotated.session.actorId,
      rotated.session.sessionId,
      rotated.session.lastRefreshedAt,
    );

    return this.issueSession(rotated.session, nextRefreshToken);
  }

  async revoke(
    command: RevokeDriverDeviceBindingCommand,
    identity?: BootstrapRequestIdentity | null,
    requestId?: string,
  ): Promise<{
    bindingId: string;
    deviceId: string;
    driverId: string;
    revokedAt: string;
  }> {
    const session = await this.resolveSessionForRevoke(command);
    if (!session) {
      throw new ApiRequestError(
        404,
        "DRIVER_DEVICE_BINDING_NOT_FOUND",
        "No driver device binding was found for this revoke request.",
        { bindingId: command.bindingId ?? null, deviceId: command.deviceId },
      );
    }

    this.assertIdentityCanRevokeBinding(session, identity);

    const revokedAt = new Date().toISOString();
    const revokedSession = await this.repository.revokeDriverSession(
      { bindingId: session.sessionId },
      revokedAt,
      "binding_revoked",
    );
    if (!revokedSession) {
      throw new ApiRequestError(
        404,
        "DRIVER_DEVICE_BINDING_NOT_FOUND",
        "No driver device binding was found for this revoke request.",
        { bindingId: command.bindingId ?? null, deviceId: command.deviceId },
      );
    }

    this.driverProfileService.recordDeviceBindingRevocation(
      revokedSession.actorId,
      revokedSession.sessionId,
      revokedAt,
      this.resolveRevocationAuditActor(revokedSession, identity),
      requestId,
    );

    return {
      bindingId: revokedSession.sessionId,
      deviceId: revokedSession.deviceId ?? command.deviceId,
      driverId: revokedSession.actorId,
      revokedAt,
    };
  }

  async isBindingActive(
    bindingId: string | null | undefined,
    deviceId: string | null | undefined,
    driverId: string | null | undefined,
  ): Promise<boolean> {
    const resolvedBindingId = bindingId?.trim();
    const resolvedDeviceId = deviceId?.trim();
    const resolvedDriverId = driverId?.trim();
    if (!resolvedBindingId || !resolvedDeviceId || !resolvedDriverId) {
      return false;
    }

    return this.repository.isDriverSessionActive(
      resolvedBindingId,
      resolvedDeviceId,
      resolvedDriverId,
      new Date().toISOString(),
    );
  }

  async assertSessionAccessAllowed(
    bindingId: string | null | undefined,
    deviceId: string | null | undefined,
    driverId: string | null | undefined,
    route: string,
  ) {
    const active = await this.isBindingActive(bindingId, deviceId, driverId);
    if (!active) {
      throw new ApiRequestError(
        401,
        "DRIVER_DEVICE_SESSION_INVALID",
        "Driver device session is invalid, revoked, or no longer bound to this device.",
        {
          route,
          bindingId: bindingId ?? null,
          deviceId: deviceId ?? null,
          actorId: driverId ?? null,
        },
      );
    }

    if (driverId) {
      this.assertDriverAuthEligible(driverId);
    }
  }

  private async resolveSessionForRevoke(
    command: RevokeDriverDeviceBindingCommand,
  ) {
    const bindingId = command.bindingId?.trim();
    if (bindingId) {
      return this.repository.loadSession(bindingId);
    }

    const deviceId = command.deviceId?.trim();
    if (!deviceId) {
      return null;
    }

    return this.repository.loadActiveSessionByDeviceId(deviceId);
  }

  private toBindingSummary(session: {
    sessionId: string;
    deviceId: string | null;
    deviceLabel: string | null;
    status: "active" | "revoked" | "expired";
    startedAt: string;
    lastRefreshedAt: string;
    revokedAt: string | null;
  }): DriverDeviceBindingSummary {
    return {
      bindingId: session.sessionId,
      deviceId: session.deviceId ?? "",
      deviceLabel: session.deviceLabel,
      status: session.status === "active" ? "active" : "revoked",
      issuedAt: session.startedAt,
      refreshedAt: session.lastRefreshedAt,
      revokedAt: session.revokedAt,
    };
  }

  private issueSession(
    session: {
      sessionId: string;
      actorId: string;
      deviceId: string | null;
    },
    refreshToken: string,
  ): DriverDeviceProvisioningSession {
    const issuedAt = new Date().toISOString();
    const accessToken = this.jwtAuthService.sign(
      {
        authMode: "jwt_bearer",
        actorType: "driver_user",
        actorId: session.actorId,
        realm: "driver",
        tenantId: null,
        roleFamilies: ["driver"],
        roles: ["driver_user"],
        scopes: ["driver:read", "driver:write", "dispatch:read"],
        requestId: null,
        driverBindingId: session.sessionId,
        driverDeviceId: session.deviceId,
      },
      { expiresIn: DRIVER_ACCESS_TOKEN_EXPIRES_IN },
    );

    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      expiresIn: DRIVER_ACCESS_TOKEN_EXPIRES_IN,
      refreshExpiresIn: DRIVER_REFRESH_TOKEN_EXPIRES_IN,
      driverId: session.actorId,
      deviceId: session.deviceId ?? "",
      bindingId: session.sessionId,
      issuedAt,
      identity: {
        actorType: "driver_user",
        actorId: session.actorId,
        realm: "driver",
        authMode: "jwt_bearer",
        roleFamilies: ["driver"],
        roles: ["driver_user"],
        scopes: ["driver:read", "driver:write", "dispatch:read"],
        tenantId: null,
        supportedExecutionModes: [
          "discussion_planning",
          "supervisor_managed_execution",
        ],
      },
    };
  }

  private assertDriverAuthEligible(driverId: string) {
    this.regulatoryRegistryService?.assertDriverAuthEligible(driverId);
  }

  private assertIdentityCanRevokeBinding(
    session: {
      sessionId: string;
      deviceId: string | null;
      actorId: string;
    },
    identity?: BootstrapRequestIdentity | null,
  ) {
    if (!identity) {
      throw new ApiRequestError(
        403,
        "DRIVER_DEVICE_BINDING_FORBIDDEN",
        "Only the bound driver or an authorized control-plane actor can revoke this driver device binding.",
        {
          bindingId: session.sessionId,
          deviceId: session.deviceId,
        },
      );
    }

    if (identity.realm === "driver") {
      if (
        identity.actorId === session.actorId &&
        identity.scopes.includes("driver:write")
      ) {
        return;
      }

      throw new ApiRequestError(
        403,
        "DRIVER_DEVICE_BINDING_FORBIDDEN",
        "The current driver identity cannot revoke another driver's device binding.",
        {
          actorId: identity.actorId,
          driverId: session.actorId,
          bindingId: session.sessionId,
        },
      );
    }

    if (
      (identity.realm === "platform" ||
        identity.realm === "ops" ||
        identity.realm === "system") &&
      identity.scopes.some(
        (scope) =>
          scope === "foundation:write" ||
          scope === "regulatory:write" ||
          scope === "driver:write",
      )
    ) {
      return;
    }

    throw new ApiRequestError(
      403,
      "DRIVER_DEVICE_BINDING_FORBIDDEN",
      "Only the bound driver or an authorized control-plane actor can revoke this driver device binding.",
      {
        bindingId: session.sessionId,
        deviceId: session.deviceId,
        realm: identity.realm,
      },
    );
  }

  private resolveRevocationAuditActor(
    session: {
      actorId: string;
    },
    identity?: BootstrapRequestIdentity | null,
  ) {
    if (!identity) {
      return {
        actorId: session.actorId,
        actorType: "system" as const,
        tenantId: null,
      };
    }

    return {
      actorId: identity.actorId ?? session.actorId,
      actorType:
        identity.actorType === "driver_user" ? "system" : identity.actorType,
      tenantId: identity.tenantId,
    };
  }
}
