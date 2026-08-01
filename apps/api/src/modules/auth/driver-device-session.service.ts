import { Injectable, Optional } from "@nestjs/common";

import type {
  DriverDeviceProvisioningSession,
  RefreshDriverDeviceSessionCommand,
  RegisterDriverDeviceCommand,
  RevokeDriverDeviceBindingCommand,
  CanonicalIdentitySessionRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { JwtAuthService } from "../../common/auth/jwt-auth.service";
import { SecurityEventsService } from "../security-events/security-events.service";
import { DriverProfileService } from "../driver-profile/driver-profile.service";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import {
  hashIdentitySecret,
  IdentityRepository,
} from "../identity/identity.repository";

const DRIVER_ACCESS_TOKEN_EXPIRES_IN = "15m";
const DRIVER_REFRESH_TOKEN_EXPIRES_IN = "30d";

function createOpaqueToken(prefix: string): string {
  const value =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `${prefix}_${value.replace(/-/g, "")}`;
}

@Injectable()
export class DriverDeviceSessionService {
  private readonly identityRepo: IdentityRepository;

  constructor(
    private readonly jwtAuthService: JwtAuthService,
    private readonly driverProfileService: DriverProfileService,
    @Optional()
    private readonly regulatoryRegistryService?: RegulatoryRegistryService,
    @Optional()
    private readonly securityEventsService?: SecurityEventsService,
    @Optional()
    identityRepository?: IdentityRepository,
  ) {
    this.identityRepo = identityRepository ?? new IdentityRepository();
  }

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
    await this.revokeActiveBindingForDevice(deviceId, requestId);

    const now = new Date().toISOString();
    const absoluteExpiresAt = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const bindingId = createOpaqueToken("drvbind");
    const refreshTokenRaw = createOpaqueToken("drvrefresh");
    const refreshTokenHash = hashIdentitySecret(refreshTokenRaw);
    const familyId = createOpaqueToken("fam");

    await this.identityRepo.createSession({
      sessionId: bindingId,
      sourceRef: `driver_device:${bindingId}`,
      principalId: driverId,
      membershipId: null,
      realm: "driver",
      status: "active",
      authTime: now,
      authMethods: ["driver_device_registration"],
      tokenVersion: 1,
      idleExpiresAt: null,
      absoluteExpiresAt,
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: {
        deviceId,
        deviceLabel: command.deviceLabel?.trim() || null,
      },
      riskSummary: {},
      createdAt: now,
      updatedAt: now,
    });

    await this.identityRepo.createRefreshFamily({
      familyId,
      sourceRef: `driver_device_family:${familyId}`,
      sessionId: bindingId,
      currentTokenHash: refreshTokenHash,
      counter: 0,
      status: "active",
      expiresAt: absoluteExpiresAt,
      compromisedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    this.driverProfileService.recordDeviceBinding(
      driverId,
      {
        bindingId,
        deviceId,
        deviceLabel: command.deviceLabel?.trim() || null,
        status: "active",
        issuedAt: now,
        refreshedAt: now,
        revokedAt: null,
      },
      requestId,
    );

    const session = this.issueSession(
      bindingId,
      driverId,
      deviceId,
      refreshTokenRaw,
      now,
    );

    this.securityEventsService?.recordEvent({
      actorId: driverId,
      actorType: "driver_user",
      subjectId: driverId,
      realm: "driver",
      tenantId: null,
      partnerId: null,
      eventType: "driver_device_session.registered",
      eventFamily: "session",
      outcome: "success",
      severity: "low",
      targetType: "driver_device_binding",
      targetId: bindingId,
      sessionId: bindingId,
      tokenId: session.accessToken,
      authMethods: ["driver_device_registration"],
      sourceIp: null,
      userAgent: null,
      requestId: requestId ?? null,
      traceId: null,
      reasonCode: null,
      approvalId: null,
      beforeSummary: null,
      afterSummary: {
        bindingId,
        driverId,
        status: "active",
      },
      maskedContext: {
        deviceId,
        deviceLabel: command.deviceLabel?.trim() || null,
      },
    });

    return session;
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

    const oldHash = hashIdentitySecret(refreshToken);
    const existingFamily =
      await this.identityRepo.getRefreshFamilyByTokenHash(oldHash);
    if (existingFamily) {
      const existingSession = await this.identityRepo.getSession(
        existingFamily.sessionId,
      );
      if (existingSession?.principalId) {
        this.assertDriverAuthEligible(existingSession.principalId);
      }
    }

    const newRefreshToken = createOpaqueToken("drvrefresh");
    const newExpiresAt = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const now = new Date().toISOString();

    const rotateResult = await this.identityRepo.consumeAndRotateRefreshToken({
      oldTokenRaw: refreshToken,
      newTokenRaw: newRefreshToken,
      newExpiresAt,
      updatedAt: now,
    });

    if (!rotateResult.success || !rotateResult.session) {
      throw new ApiRequestError(
        401,
        "DRIVER_DEVICE_REFRESH_INVALID",
        "The driver device refresh token is invalid, expired, or revoked.",
        { deviceId },
      );
    }

    const sessionRecord = rotateResult.session;
    const sessionDeviceId = (
      sessionRecord.deviceSummary as { deviceId?: string }
    )?.deviceId;
    if (sessionDeviceId !== deviceId || sessionRecord.status !== "active") {
      throw new ApiRequestError(
        401,
        "DRIVER_DEVICE_REFRESH_INVALID",
        "The driver device refresh token is invalid, expired, or revoked.",
        { deviceId },
      );
    }

    this.assertDriverAuthEligible(sessionRecord.principalId);

    this.driverProfileService.recordDeviceBindingRefresh(
      sessionRecord.principalId,
      sessionRecord.sessionId,
      now,
    );

    const session = this.issueSession(
      sessionRecord.sessionId,
      sessionRecord.principalId,
      deviceId,
      newRefreshToken,
      now,
    );

    this.securityEventsService?.recordEvent({
      actorId: sessionRecord.principalId,
      actorType: "driver_user",
      subjectId: sessionRecord.principalId,
      realm: "driver",
      tenantId: null,
      partnerId: null,
      eventType: "driver_device_session.refreshed",
      eventFamily: "session",
      outcome: "success",
      severity: "low",
      targetType: "driver_device_binding",
      targetId: sessionRecord.sessionId,
      sessionId: sessionRecord.sessionId,
      tokenId: session.accessToken,
      authMethods: ["driver_refresh_token"],
      sourceIp: null,
      userAgent: null,
      requestId: null,
      traceId: null,
      reasonCode: null,
      approvalId: null,
      beforeSummary: null,
      afterSummary: {
        bindingId: sessionRecord.sessionId,
        refreshedAt: now,
        status: "active",
      },
      maskedContext: {
        deviceId,
      },
    });

    return session;
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

    const deviceId =
      (session.deviceSummary as { deviceId?: string })?.deviceId ??
      command.deviceId ??
      "";
    const driverId = session.principalId;

    this.assertIdentityCanRevokeBinding(session, identity);

    const revokedSession = await this.identityRepo.revokeSession(
      session.sessionId,
      "MANUAL_REVOCATION",
      identity?.actorId,
    );

    const revokedAt = revokedSession?.revokedAt ?? new Date().toISOString();

    this.driverProfileService.recordDeviceBindingRevocation(
      driverId,
      session.sessionId,
      revokedAt,
      this.resolveRevocationAuditActor(session, identity),
      requestId,
    );

    this.securityEventsService?.recordEvent({
      actorId: identity?.actorId ?? driverId,
      actorType: identity?.actorType ?? "system",
      subjectId: driverId,
      realm: identity?.realm ?? "driver",
      tenantId: identity?.tenantId ?? null,
      partnerId: identity?.partnerId ?? null,
      eventType: "driver_device_session.revoked",
      eventFamily: "device",
      outcome: "revoked",
      severity: "medium",
      targetType: "driver_device_binding",
      targetId: session.sessionId,
      sessionId: session.sessionId,
      tokenId: null,
      authMethods: ["driver_device_revoke"],
      sourceIp: null,
      userAgent: null,
      requestId: requestId ?? null,
      traceId: null,
      reasonCode: null,
      approvalId: null,
      beforeSummary: {
        bindingId: session.sessionId,
        status: "active",
      },
      afterSummary: {
        bindingId: session.sessionId,
        status: "revoked",
        revokedAt,
      },
      maskedContext: {
        deviceId,
      },
    });

    return {
      bindingId: session.sessionId,
      deviceId,
      driverId,
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

    const session = await this.identityRepo.getSession(resolvedBindingId);
    if (!session || session.status !== "active") {
      return false;
    }

    if (new Date(session.absoluteExpiresAt).getTime() <= Date.now()) {
      return false;
    }

    const sessionDeviceId = (
      session.deviceSummary as { deviceId?: string }
    )?.deviceId;

    return (
      session.principalId === resolvedDriverId &&
      sessionDeviceId === resolvedDeviceId
    );
  }

  async assertSessionAccessAllowed(
    bindingId: string | null | undefined,
    deviceId: string | null | undefined,
    driverId: string | null | undefined,
    route: string,
  ): Promise<void> {
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
  ): Promise<CanonicalIdentitySessionRecord | null> {
    const bindingId = command.bindingId?.trim();
    if (bindingId) {
      return this.identityRepo.getSession(bindingId);
    }

    const deviceId = command.deviceId?.trim();
    if (deviceId) {
      return this.identityRepo.findActiveSessionByDevice(deviceId);
    }

    return null;
  }

  private async revokeActiveBindingForDevice(
    deviceId: string,
    requestId?: string,
  ): Promise<void> {
    const existingSessions = await this.identityRepo.revokeSessionsForDevice(
      deviceId,
      "DEVICE_REBOUND",
    );

    for (const session of existingSessions) {
      const driverId = session.principalId;
      const revokedAt = session.revokedAt ?? new Date().toISOString();
      this.driverProfileService.recordDeviceBindingRevocation(
        driverId,
        session.sessionId,
        revokedAt,
        {
          actorId: driverId,
          actorType: "system",
          tenantId: null,
        },
        requestId,
      );
      this.securityEventsService?.recordEvent({
        actorId: driverId,
        actorType: "system",
        subjectId: driverId,
        realm: "driver",
        tenantId: null,
        partnerId: null,
        eventType: "driver_device_session.revoked",
        eventFamily: "device",
        outcome: "revoked",
        severity: "medium",
        targetType: "driver_device_binding",
        targetId: session.sessionId,
        sessionId: session.sessionId,
        tokenId: null,
        authMethods: ["driver_device_registration"],
        sourceIp: null,
        userAgent: null,
        requestId: requestId ?? null,
        traceId: null,
        reasonCode: "DEVICE_REBOUND",
        approvalId: null,
        beforeSummary: {
          bindingId: session.sessionId,
          status: "active",
        },
        afterSummary: {
          bindingId: session.sessionId,
          status: "revoked",
          revokedAt,
        },
        maskedContext: {
          deviceId,
        },
      });
    }
  }

  private issueSession(
    bindingId: string,
    driverId: string,
    deviceId: string,
    refreshTokenRaw: string,
    issuedAt: string,
  ): DriverDeviceProvisioningSession {
    const accessToken = this.jwtAuthService.sign(
      {
        authMode: "jwt_bearer",
        actorType: "driver_user",
        actorId: driverId,
        realm: "driver",
        tenantId: null,
        roleFamilies: ["driver"],
        roles: ["driver_user"],
        scopes: ["driver:read", "driver:write", "dispatch:read"],
        requestId: null,
        driverBindingId: bindingId,
        driverDeviceId: deviceId,
      },
      { expiresIn: DRIVER_ACCESS_TOKEN_EXPIRES_IN },
    );

    return {
      accessToken,
      refreshToken: refreshTokenRaw,
      tokenType: "Bearer",
      expiresIn: DRIVER_ACCESS_TOKEN_EXPIRES_IN,
      refreshExpiresIn: DRIVER_REFRESH_TOKEN_EXPIRES_IN,
      driverId,
      deviceId,
      bindingId,
      issuedAt,
      identity: {
        actorType: "driver_user",
        actorId: driverId,
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
    session: CanonicalIdentitySessionRecord,
    identity?: BootstrapRequestIdentity | null,
  ) {
    if (!identity) {
      throw new ApiRequestError(
        403,
        "DRIVER_DEVICE_BINDING_FORBIDDEN",
        "Only the bound driver or an authorized control-plane actor can revoke this driver device binding.",
        {
          bindingId: session.sessionId,
          deviceId:
            (session.deviceSummary as { deviceId?: string })?.deviceId ?? null,
        },
      );
    }

    if (identity.realm === "driver") {
      if (
        identity.actorId === session.principalId &&
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
          driverId: session.principalId,
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
        actorType: identity.actorType,
        actorId: identity.actorId,
        realm: identity.realm,
        bindingId: session.sessionId,
      },
    );
  }

  private resolveRevocationAuditActor(
    session: CanonicalIdentitySessionRecord,
    identity?: BootstrapRequestIdentity | null,
  ) {
    if (!identity) {
      return {
        actorId: session.principalId,
        actorType: "system" as const,
        tenantId: null,
      };
    }

    if (identity.actorType === "driver_user") {
      return {
        actorId: identity.actorId,
        actorType: "system" as const,
        tenantId: identity.tenantId,
      };
    }

    if (
      identity.actorType === "system" ||
      identity.actorType === "platform_admin" ||
      identity.actorType === "ops_user" ||
      identity.actorType === "tenant_admin" ||
      identity.actorType === "partner_api_key"
    ) {
      return {
        actorId: identity.actorId,
        actorType: identity.actorType,
        tenantId: identity.tenantId,
      };
    }

    return {
      actorId: session.principalId,
      actorType: "system" as const,
      tenantId: identity.tenantId,
    };
  }
}
