import { Injectable, Optional } from "@nestjs/common";

import type {
  CanonicalIdentitySessionRecord,
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
import {
  hashIdentitySecret,
  IdentityRepository,
} from "../identity/identity.repository";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import { SecurityEventsService } from "../security-events/security-events.service";

const DRIVER_ACCESS_TOKEN_EXPIRES_IN = "15m";
const DRIVER_REFRESH_TOKEN_EXPIRES_IN = "30d";
const DRIVER_REFRESH_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function createOpaqueToken(prefix: string): string {
  const value =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `${prefix}_${value.replace(/-/g, "")}`;
}

function addDuration(isoTimestamp: string, durationMs: number): string {
  return new Date(Date.parse(isoTimestamp) + durationMs).toISOString();
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

    const issuedAt = new Date().toISOString();
    const sessionId = createOpaqueToken("drvbind");
    const refreshToken = createOpaqueToken("drvrefresh");
    const familyId = createOpaqueToken("drvfam");
    const absoluteExpiresAt = addDuration(
      issuedAt,
      DRIVER_REFRESH_ABSOLUTE_TTL_MS,
    );
    const tokenVersion = Date.parse(issuedAt);

    const issued = await this.jwtAuthService.issueSessionToken(
      {
        authMode: "jwt_bearer",
        actorType: "driver_user",
        actorId: driverId,
        principalId: driverId,
        realm: "driver",
        tenantId: null,
        roleFamilies: ["driver"],
        roles: ["driver_user"],
        scopes: ["driver:read", "driver:write", "dispatch:read"],
        requestId: null,
        driverBindingId: sessionId,
        driverDeviceId: deviceId,
      },
      {
        expiresIn: DRIVER_ACCESS_TOKEN_EXPIRES_IN,
        sessionId,
        principalId: driverId,
        subject: `driver:${driverId}`,
        ensurePrincipal: true,
        authTime: issuedAt,
        amr: ["driver_device_registration"],
        acr: "aal1",
        tokenVersion,
        absoluteExpiresAt,
      },
    );

    await this.identityRepo.createRefreshFamily({
      familyId,
      sourceRef: `driver_refresh_family:${familyId}`,
      sessionId,
      currentTokenHash: hashIdentitySecret(refreshToken),
      counter: 0,
      status: "active",
      expiresAt: absoluteExpiresAt,
      compromisedAt: null,
      createdAt: issuedAt,
      updatedAt: issuedAt,
    });

    this.driverProfileService.recordDeviceBinding(
      driverId,
      {
        bindingId: sessionId,
        deviceId,
        deviceLabel: command.deviceLabel?.trim() || null,
        status: "active",
        issuedAt,
        refreshedAt: issuedAt,
        revokedAt: null,
      },
      requestId,
    );

    const session = this.buildProvisioningSession({
      accessToken: issued.token,
      refreshToken,
      bindingId: sessionId,
      driverId,
      deviceId,
      issuedAt,
      tokenVersion,
    });

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
      targetId: sessionId,
      sessionId,
      tokenId: issued.tokenId,
      authMethods: issued.amr,
      sourceIp: null,
      userAgent: null,
      requestId: requestId ?? null,
      traceId: null,
      reasonCode: null,
      approvalId: null,
      beforeSummary: null,
      afterSummary: {
        bindingId: sessionId,
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

    const now = new Date().toISOString();
    const nextRefreshToken = createOpaqueToken("drvrefresh");
    const tokenId = createOpaqueToken("jti");
    const tokenVersion = Date.parse(now);
    const rotated = await this.identityRepo.consumeAndRotateRefreshToken({
      oldTokenRaw: refreshToken,
      newTokenRaw: nextRefreshToken,
      newSessionTokenId: tokenId,
      newSessionTokenVersion: tokenVersion,
      newExpiresAt: addDuration(now, DRIVER_REFRESH_ABSOLUTE_TTL_MS),
      updatedAt: now,
    });

    if (!rotated.success || !rotated.session || !rotated.family) {
      throw new ApiRequestError(
        401,
        "DRIVER_DEVICE_REFRESH_INVALID",
        "The driver device refresh token is invalid, expired, or revoked.",
        { deviceId },
      );
    }

    const sessionRecord = rotated.session;
    const sessionDeviceId =
      (sessionRecord.deviceSummary as { deviceId?: string | null } | undefined)
        ?.deviceId ?? null;
    if (sessionDeviceId !== deviceId || sessionRecord.status !== "active") {
      throw new ApiRequestError(
        401,
        "DRIVER_DEVICE_REFRESH_INVALID",
        "The driver device refresh token is invalid, expired, or revoked.",
        { deviceId },
      );
    }

    const driverId =
      sessionRecord.actorId?.trim() || sessionRecord.principalId.trim();
    this.assertDriverAuthEligible(driverId);

    const reissued = await this.jwtAuthService.issueSessionToken(
      {
        authMode: "jwt_bearer",
        actorType: "driver_user",
        actorId: driverId,
        principalId: sessionRecord.principalId,
        realm: "driver",
        tenantId: null,
        roleFamilies: ["driver"],
        roles: ["driver_user"],
        scopes: ["driver:read", "driver:write", "dispatch:read"],
        requestId: null,
        tokenId,
        driverBindingId: sessionRecord.sessionId,
        driverDeviceId: deviceId,
      },
      {
        expiresIn: DRIVER_ACCESS_TOKEN_EXPIRES_IN,
        sessionId: sessionRecord.sessionId,
        principalId: sessionRecord.principalId,
        subject: sessionRecord.subject ?? `driver:${driverId}`,
        ensurePrincipal: false,
        authTime: sessionRecord.authTime,
        amr: sessionRecord.authMethods,
        acr: sessionRecord.acr ?? "aal1",
        ...(sessionRecord.policyVersion
          ? { policyVersion: sessionRecord.policyVersion }
          : {}),
        tokenVersion,
        absoluteExpiresAt: sessionRecord.absoluteExpiresAt,
      },
    );

    this.driverProfileService.recordDeviceBindingRefresh(
      driverId,
      sessionRecord.sessionId,
      now,
    );

    const session = this.buildProvisioningSession({
      accessToken: reissued.token,
      refreshToken: nextRefreshToken,
      bindingId: sessionRecord.sessionId,
      driverId,
      deviceId,
      issuedAt: now,
      tokenVersion,
    });

    this.securityEventsService?.recordEvent({
      actorId: driverId,
      actorType: "driver_user",
      subjectId: driverId,
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
      tokenId: reissued.tokenId,
      authMethods: reissued.amr,
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

    this.assertIdentityCanRevokeBinding(session, identity);

    const revoked = await this.identityRepo.revokeSession(
      session.sessionId,
      "MANUAL_REVOCATION",
      identity?.principalId ?? identity?.actorId ?? undefined,
    );
    if (!revoked) {
      throw new ApiRequestError(
        404,
        "DRIVER_DEVICE_BINDING_NOT_FOUND",
        "No driver device binding was found for this revoke request.",
        { bindingId: command.bindingId ?? null, deviceId: command.deviceId },
      );
    }

    const deviceId =
      (revoked.deviceSummary as { deviceId?: string | null } | undefined)
        ?.deviceId ?? command.deviceId;
    const driverId = revoked.actorId?.trim() || revoked.principalId.trim();
    const revokedAt = revoked.revokedAt ?? new Date().toISOString();

    this.driverProfileService.recordDeviceBindingRevocation(
      driverId,
      revoked.sessionId,
      revokedAt,
      this.resolveRevocationAuditActor(revoked, identity),
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
      targetId: revoked.sessionId,
      sessionId: revoked.sessionId,
      tokenId: null,
      authMethods: identity?.amr ?? ["driver_device_revoke"],
      sourceIp: null,
      userAgent: null,
      requestId: requestId ?? null,
      traceId: null,
      reasonCode: null,
      approvalId: null,
      beforeSummary: {
        bindingId: revoked.sessionId,
        status: "active",
      },
      afterSummary: {
        bindingId: revoked.sessionId,
        status: "revoked",
        revokedAt,
      },
      maskedContext: {
        deviceId,
      },
    });

    return {
      bindingId: revoked.sessionId,
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

    const sessionDeviceId =
      (session.deviceSummary as { deviceId?: string | null } | undefined)
        ?.deviceId ?? null;
    const sessionDriverId =
      session.actorId?.trim() || session.principalId.trim();

    return (
      sessionDeviceId === resolvedDeviceId &&
      sessionDriverId === resolvedDriverId
    );
  }

  async assertSessionAccessAllowed(
    bindingId: string | null | undefined,
    deviceId: string | null | undefined,
    driverId: string | null | undefined,
    route: string,
  ) {
    if (!(await this.isBindingActive(bindingId, deviceId, driverId))) {
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

  private buildProvisioningSession(input: {
    accessToken: string;
    refreshToken: string;
    bindingId: string;
    driverId: string;
    deviceId: string;
    issuedAt: string;
    tokenVersion: number;
  }): DriverDeviceProvisioningSession {
    return {
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      tokenType: "Bearer",
      expiresIn: DRIVER_ACCESS_TOKEN_EXPIRES_IN,
      refreshExpiresIn: DRIVER_REFRESH_TOKEN_EXPIRES_IN,
      driverId: input.driverId,
      deviceId: input.deviceId,
      bindingId: input.bindingId,
      issuedAt: input.issuedAt,
      identity: {
        actorType: "driver_user",
        actorId: input.driverId,
        principalId: input.driverId,
        realm: "driver",
        authMode: "jwt_bearer",
        roleFamilies: ["driver"],
        roles: ["driver_user"],
        scopes: ["driver:read", "driver:write", "dispatch:read"],
        tenantId: null,
        sessionId: input.bindingId,
        tokenVersion: input.tokenVersion,
        authTime: input.issuedAt,
        amr: ["driver_device"],
        acr: "aal1",
        supportedExecutionModes: [
          "discussion_planning",
          "supervisor_managed_execution",
        ],
      },
    };
  }

  private async resolveSessionForRevoke(
    command: RevokeDriverDeviceBindingCommand,
  ): Promise<CanonicalIdentitySessionRecord | null> {
    const bindingId = command.bindingId?.trim();
    if (bindingId) {
      return this.identityRepo.getSession(bindingId);
    }

    return this.identityRepo.findActiveSessionByDevice(
      command.deviceId?.trim() || "",
    );
  }

  private async revokeActiveBindingForDevice(
    deviceId: string,
    requestId?: string,
  ): Promise<void> {
    const existing =
      await this.identityRepo.findActiveSessionByDevice(deviceId);
    if (!existing) {
      return;
    }

    const revoked = await this.identityRepo.revokeSession(
      existing.sessionId,
      "DEVICE_REBOUND",
      existing.principalId,
    );
    if (!revoked) {
      return;
    }

    const driverId = revoked.actorId?.trim() || revoked.principalId.trim();
    const revokedAt = revoked.revokedAt ?? new Date().toISOString();
    this.driverProfileService.recordDeviceBindingRevocation(
      driverId,
      revoked.sessionId,
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
      targetId: revoked.sessionId,
      sessionId: revoked.sessionId,
      tokenId: null,
      authMethods: ["driver_device_registration"],
      sourceIp: null,
      userAgent: null,
      requestId: requestId ?? null,
      traceId: null,
      reasonCode: "DEVICE_REBOUND",
      approvalId: null,
      beforeSummary: {
        bindingId: revoked.sessionId,
        status: "active",
      },
      afterSummary: {
        bindingId: revoked.sessionId,
        status: "revoked",
        revokedAt,
      },
      maskedContext: {
        deviceId,
      },
    });
  }

  private assertDriverAuthEligible(driverId: string) {
    this.regulatoryRegistryService?.assertDriverAuthEligible(driverId);
  }

  private assertIdentityCanRevokeBinding(
    session: CanonicalIdentitySessionRecord,
    identity?: BootstrapRequestIdentity | null,
  ) {
    const driverId = session.actorId?.trim() || session.principalId.trim();
    const deviceId =
      (session.deviceSummary as { deviceId?: string | null } | undefined)
        ?.deviceId ?? null;

    if (!identity) {
      throw new ApiRequestError(
        403,
        "DRIVER_DEVICE_BINDING_FORBIDDEN",
        "Only the bound driver or an authorized control-plane actor can revoke this driver device binding.",
        {
          bindingId: session.sessionId,
          deviceId,
        },
      );
    }

    if (identity.realm === "driver") {
      if (
        identity.actorId === driverId &&
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
          driverId,
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
    const driverId = session.actorId?.trim() || session.principalId.trim();

    if (!identity) {
      return {
        actorId: driverId,
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
      actorId: driverId,
      actorType: "system" as const,
      tenantId: identity.tenantId,
    };
  }

  private toBindingSummary(
    session: CanonicalIdentitySessionRecord,
  ): DriverDeviceBindingSummary {
    const deviceSummary =
      (session.deviceSummary as {
        deviceId?: string;
        deviceLabel?: string | null;
      }) ?? {};
    return {
      bindingId: session.sessionId,
      deviceId: deviceSummary.deviceId ?? "",
      deviceLabel: deviceSummary.deviceLabel ?? null,
      status: session.status === "active" ? "active" : "revoked",
      issuedAt: session.createdAt,
      refreshedAt: session.updatedAt,
      revokedAt: session.revokedAt,
    };
  }
}
