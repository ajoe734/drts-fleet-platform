import { createHash } from "node:crypto";

import { Injectable, Logger, OnModuleInit, Optional } from "@nestjs/common";

import type {
  DriverDeviceBindingRecord,
  DriverDeviceBindingSummary,
  DriverDeviceInvitationRecord,
  DriverDeviceProvisioningSession,
  DriverRefreshFamilyRecord,
  IssueDriverDeviceInvitationCommand,
  RefreshDriverDeviceSessionCommand,
  RegisterDriverDeviceCommand,
  RevokeDriverDeviceBindingCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { JwtAuthService } from "../../common/auth/jwt-auth.service";
import { DriverProfileService } from "../driver-profile/driver-profile.service";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import { SecurityEventsService } from "../security-events/security-events.service";
import { DriverDeviceSessionRepository } from "./driver-device-session.repository";

const DRIVER_ACCESS_TOKEN_EXPIRES_IN = "15m";
const DRIVER_REFRESH_TOKEN_EXPIRES_IN = "30d";
const DRIVER_INVITATION_EXPIRES_IN_HOURS = 24;

const DEMO_DRIVER_ALIASES: Record<string, string> = {
  "demo-driver": "drv-demo-001",
  "driver-demo-001": "drv-demo-001",
};

function createOpaqueToken(prefix: string): string {
  const value =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `${prefix}_${value.replace(/-/g, "")}`;
}

@Injectable()
export class DriverDeviceSessionService implements OnModuleInit {
  private readonly logger = new Logger(DriverDeviceSessionService.name);

  private readonly bindingsById = new Map<string, DriverDeviceBindingRecord>();

  private readonly activeBindingIdsByDeviceId = new Map<string, string>();

  private readonly refreshFamiliesByBindingId = new Map<
    string,
    DriverRefreshFamilyRecord
  >();

  private readonly refreshFamiliesByTokenHash = new Map<
    string,
    DriverRefreshFamilyRecord
  >();

  private readonly invitationsByHash = new Map<
    string,
    DriverDeviceInvitationRecord
  >();

  constructor(
    private readonly jwtAuthService: JwtAuthService,
    private readonly driverProfileService: DriverProfileService,
    @Optional()
    private readonly repository?: DriverDeviceSessionRepository,
    @Optional()
    private readonly regulatoryRegistryService?: RegulatoryRegistryService,
    @Optional()
    private readonly securityEventsService?: SecurityEventsService,
  ) {}

  async onModuleInit() {
    await this.loadPersistedState();
    this.seedDemoInvitations();
  }

  async issueRegistrationInvitation(
    command: IssueDriverDeviceInvitationCommand,
  ): Promise<{
    invitation: DriverDeviceInvitationRecord;
    registrationCode: string;
  }> {
    const driverId = command.driverId.trim();
    const registrationCode =
      command.registrationCode?.trim() || createOpaqueToken("regcode");
    const registrationCodeHash = this.hashToken(registrationCode);
    const expiresInHours =
      command.expiresInHours ?? DRIVER_INVITATION_EXPIRES_IN_HOURS;

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + expiresInHours * 60 * 60 * 1000,
    ).toISOString();

    const invitation: DriverDeviceInvitationRecord = {
      invitationId: createOpaqueToken("drvinv"),
      driverId,
      registrationCodeHash,
      status: "pending",
      expiresAt,
      acceptedAt: null,
      revokedAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const saved = this.repository
      ? await this.repository.saveInvitation(invitation)
      : invitation;

    this.invitationsByHash.set(saved.registrationCodeHash, saved);

    return {
      invitation: saved,
      registrationCode,
    };
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
        { field: "deviceId" },
      );
    }

    const regCodeHash = this.hashToken(registrationCode);
    let invitation =
      (await this.repository?.findInvitationByCodeHash?.(regCodeHash)) ??
      this.invitationsByHash.get(regCodeHash) ??
      null;

    if (!invitation) {
      const resolvedDriverId =
        this.driverProfileService.resolveProvisionableDriverId(
          registrationCode,
        );
      if (resolvedDriverId) {
        const issued = await this.issueRegistrationInvitation({
          driverId: resolvedDriverId,
          registrationCode,
        });
        invitation = issued.invitation;
      }
    }

    const nowIso = new Date().toISOString();

    if (
      !invitation ||
      invitation.status !== "pending" ||
      invitation.acceptedAt !== null ||
      invitation.revokedAt !== null ||
      new Date(invitation.expiresAt).getTime() <= new Date(nowIso).getTime()
    ) {
      this.securityEventsService?.recordEvent?.({
        actorId: invitation?.driverId ?? registrationCode,
        actorType: "driver_user",
        subjectId: invitation?.driverId ?? registrationCode,
        realm: "driver",
        tenantId: null,
        partnerId: null,
        eventType: "driver_device_session.registration_failed",
        eventFamily: "session",
        outcome: "denied",
        severity: "medium",
        targetType: "driver_device_invitation",
        targetId: invitation?.invitationId ?? null,
        sessionId: null,
        tokenId: null,
        authMethods: ["driver_device_registration"],
        sourceIp: null,
        userAgent: null,
        requestId: requestId ?? null,
        traceId: null,
        reasonCode: "DRIVER_REGISTRATION_INVALID",
        approvalId: null,
        beforeSummary: null,
        afterSummary: null,
        maskedContext: {
          deviceId,
          registrationCodeHash: regCodeHash,
        },
      });

      throw new ApiRequestError(
        403,
        "DRIVER_REGISTRATION_INVALID",
        "The device registration code is invalid, expired, or already used.",
        { registrationCode },
      );
    }

    const driverId = invitation.driverId;
    this.assertDriverAuthEligible(driverId);

    // Single-use: Mark invitation as used
    invitation.status = "used";
    invitation.acceptedAt = nowIso;
    invitation.updatedAt = nowIso;
    if (this.repository) {
      await this.repository.saveInvitation(invitation);
    }
    this.invitationsByHash.set(invitation.registrationCodeHash, invitation);

    const oldBindingId = await this.revokeActiveBindingForDevice(
      deviceId,
      requestId,
      "DEVICE_REBOUND",
    );

    const binding: DriverDeviceBindingRecord = {
      bindingId: createOpaqueToken("drvbind"),
      driverId,
      deviceId,
      deviceLabel: command.deviceLabel?.trim() || null,
      status: "active",
      issuedAt: nowIso,
      refreshedAt: nowIso,
      revokedAt: null,
      reboundFromBindingId: oldBindingId ?? null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const savedBinding = this.repository
      ? await this.repository.saveBinding(binding)
      : binding;

    this.bindingsById.set(savedBinding.bindingId, savedBinding);
    this.activeBindingIdsByDeviceId.set(deviceId, savedBinding.bindingId);

    const plaintextRefreshToken = createOpaqueToken("drvrefresh");
    const refreshExpiresAt = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const refreshFamily: DriverRefreshFamilyRecord = {
      familyId: createOpaqueToken("drvfam"),
      bindingId: savedBinding.bindingId,
      driverId,
      currentTokenHash: this.hashToken(plaintextRefreshToken),
      previousTokenHashes: [],
      rotationCounter: 0,
      status: "active",
      expiresAt: refreshExpiresAt,
      revokedAt: null,
      compromisedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const savedFamily = this.repository
      ? await this.repository.saveRefreshFamily(refreshFamily)
      : refreshFamily;

    this.refreshFamiliesByBindingId.set(savedBinding.bindingId, savedFamily);
    this.refreshFamiliesByTokenHash.set(
      savedFamily.currentTokenHash,
      savedFamily,
    );

    this.driverProfileService.recordDeviceBinding(
      driverId,
      this.toBindingSummary(savedBinding),
      requestId,
    );

    const session = this.issueSession(savedBinding, plaintextRefreshToken);

    this.securityEventsService?.recordEvent?.({
      actorId: savedBinding.driverId,
      actorType: "driver_user",
      subjectId: savedBinding.driverId,
      realm: "driver",
      tenantId: null,
      partnerId: null,
      eventType: "driver_device_session.registered",
      eventFamily: "session",
      outcome: "success",
      severity: "low",
      targetType: "driver_device_binding",
      targetId: savedBinding.bindingId,
      sessionId: savedBinding.bindingId,
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
        bindingId: savedBinding.bindingId,
        driverId: savedBinding.driverId,
        status: "active",
      },
      maskedContext: {
        deviceId: savedBinding.deviceId,
        deviceLabel: savedBinding.deviceLabel,
        refreshTokenHash: savedFamily.currentTokenHash,
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
        { field: "deviceId" },
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

    const tokenHash = this.hashToken(refreshToken);
    const familyResult =
      (await this.repository?.findRefreshFamilyByTokenHash?.(tokenHash)) ??
      this.resolveInMemoryRefreshFamilyByHash(tokenHash);

    if (
      familyResult?.isReused ||
      familyResult?.family.status === "compromised"
    ) {
      const family = familyResult.family;
      const nowIso = new Date().toISOString();

      family.status = "compromised";
      family.compromisedAt = nowIso;
      family.updatedAt = nowIso;
      if (this.repository) {
        await this.repository.saveRefreshFamily(family);
      }

      await this.revokeBindingAndFamily(
        family.bindingId,
        nowIso,
        "REFRESH_TOKEN_REUSE_DETECTED",
      );

      this.securityEventsService?.recordEvent?.({
        actorId: family.driverId,
        actorType: "driver_user",
        subjectId: family.driverId,
        realm: "driver",
        tenantId: null,
        partnerId: null,
        eventType: "driver_device_session.refresh_reuse_detected",
        eventFamily: "session",
        outcome: "denied",
        severity: "high",
        targetType: "driver_refresh_family",
        targetId: family.familyId,
        sessionId: family.bindingId,
        tokenId: null,
        authMethods: ["driver_refresh_token"],
        sourceIp: null,
        userAgent: null,
        requestId: null,
        traceId: null,
        reasonCode: "REFRESH_TOKEN_REUSE_DETECTED",
        approvalId: null,
        beforeSummary: {
          familyId: family.familyId,
          status: "active",
        },
        afterSummary: {
          familyId: family.familyId,
          status: "compromised",
          compromisedAt: nowIso,
        },
        maskedContext: {
          deviceId,
          tokenHash,
        },
      });

      throw new ApiRequestError(
        401,
        "DRIVER_DEVICE_REFRESH_INVALID",
        "The driver device refresh token is invalid, expired, or revoked.",
        { deviceId },
      );
    }

    const family = familyResult?.family ?? null;
    const nowIso = new Date().toISOString();

    if (
      !family ||
      family.status !== "active" ||
      new Date(family.expiresAt).getTime() <= new Date(nowIso).getTime()
    ) {
      throw new ApiRequestError(
        401,
        "DRIVER_DEVICE_REFRESH_INVALID",
        "The driver device refresh token is invalid, expired, or revoked.",
        { deviceId },
      );
    }

    const binding =
      (await this.repository?.findBindingById?.(family.bindingId)) ??
      this.bindingsById.get(family.bindingId) ??
      null;

    if (
      !binding ||
      !binding.status ||
      binding.status !== "active" ||
      binding.deviceId !== deviceId
    ) {
      throw new ApiRequestError(
        401,
        "DRIVER_DEVICE_REFRESH_INVALID",
        "The driver device refresh token is invalid, expired, or revoked.",
        { deviceId },
      );
    }

    try {
      this.assertDriverAuthEligible(binding.driverId);
    } catch (authError) {
      await this.revokeBindingAndFamily(
        binding.bindingId,
        nowIso,
        "DRIVER_SUSPENDED",
      );
      throw authError;
    }

    const newPlaintextRefreshToken = createOpaqueToken("drvrefresh");
    const newTokenHash = this.hashToken(newPlaintextRefreshToken);

    // Rotation
    family.previousTokenHashes = [
      ...family.previousTokenHashes,
      family.currentTokenHash,
    ];
    this.refreshFamiliesByTokenHash.delete(family.currentTokenHash);
    family.currentTokenHash = newTokenHash;
    family.rotationCounter += 1;
    family.updatedAt = nowIso;

    if (this.repository) {
      await this.repository.saveRefreshFamily(family);
    }
    this.refreshFamiliesByBindingId.set(binding.bindingId, family);
    this.refreshFamiliesByTokenHash.set(newTokenHash, family);

    binding.refreshedAt = nowIso;
    binding.updatedAt = nowIso;
    if (this.repository) {
      await this.repository.saveBinding(binding);
    }
    this.bindingsById.set(binding.bindingId, binding);

    this.driverProfileService.recordDeviceBindingRefresh(
      binding.driverId,
      binding.bindingId,
      nowIso,
    );

    const session = this.issueSession(binding, newPlaintextRefreshToken);

    this.securityEventsService?.recordEvent?.({
      actorId: binding.driverId,
      actorType: "driver_user",
      subjectId: binding.driverId,
      realm: "driver",
      tenantId: null,
      partnerId: null,
      eventType: "driver_device_session.refreshed",
      eventFamily: "session",
      outcome: "success",
      severity: "low",
      targetType: "driver_device_binding",
      targetId: binding.bindingId,
      sessionId: binding.bindingId,
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
        bindingId: binding.bindingId,
        refreshedAt: binding.refreshedAt,
        rotationCounter: family.rotationCounter,
        status: "active",
      },
      maskedContext: {
        deviceId: binding.deviceId,
        refreshTokenHash: newTokenHash,
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
    const binding = await this.resolveBindingForRevoke(command);
    if (!binding) {
      throw new ApiRequestError(
        404,
        "DRIVER_DEVICE_BINDING_NOT_FOUND",
        "No driver device binding was found for this revoke request.",
        { bindingId: command.bindingId ?? null, deviceId: command.deviceId },
      );
    }

    this.assertIdentityCanRevokeBinding(binding, identity);

    const revokedAt = new Date().toISOString();
    await this.revokeBindingAndFamily(
      binding.bindingId,
      revokedAt,
      "MANUAL_REVOKE",
    );

    this.driverProfileService.recordDeviceBindingRevocation(
      binding.driverId,
      binding.bindingId,
      revokedAt,
      this.resolveRevocationAuditActor(binding, identity),
      requestId,
    );

    this.securityEventsService?.recordEvent?.({
      actorId: identity?.actorId ?? binding.driverId,
      actorType: identity?.actorType ?? "system",
      subjectId: binding.driverId,
      realm: identity?.realm ?? "driver",
      tenantId: identity?.tenantId ?? null,
      partnerId: identity?.partnerId ?? null,
      eventType: "driver_device_session.revoked",
      eventFamily: "device",
      outcome: "revoked",
      severity: "medium",
      targetType: "driver_device_binding",
      targetId: binding.bindingId,
      sessionId: binding.bindingId,
      tokenId: null,
      authMethods: ["driver_device_registration"],
      sourceIp: null,
      userAgent: null,
      requestId: requestId ?? null,
      traceId: null,
      reasonCode: "MANUAL_REVOKE",
      approvalId: null,
      beforeSummary: {
        bindingId: binding.bindingId,
        status: "active",
      },
      afterSummary: {
        bindingId: binding.bindingId,
        status: "revoked",
        revokedAt,
      },
      maskedContext: {
        deviceId: binding.deviceId,
      },
    });

    return {
      bindingId: binding.bindingId,
      deviceId: binding.deviceId,
      driverId: binding.driverId,
      revokedAt,
    };
  }

  async isBindingActive(
    bindingId: string | null | undefined,
    deviceId: string | null | undefined,
    driverId: string | null | undefined,
  ): Promise<boolean> {
    const resolvedDeviceId = deviceId?.trim();
    const rawDriverId = driverId?.trim();
    const resolvedDriverId = rawDriverId
      ? DEMO_DRIVER_ALIASES[rawDriverId] || rawDriverId
      : undefined;

    if (!resolvedDeviceId || !resolvedDriverId) {
      return false;
    }

    const binding = bindingId
      ? ((await this.repository?.findBindingById?.(bindingId)) ??
        this.bindingsById.get(bindingId))
      : ((await this.repository?.findActiveBindingByDeviceId?.(
          resolvedDeviceId,
        )) ?? this.getActiveBindingByDeviceIdInMemory(resolvedDeviceId));

    if (!binding || binding.status !== "active") {
      return false;
    }

    return (
      binding.deviceId === resolvedDeviceId &&
      binding.driverId === resolvedDriverId
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

  hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private async loadPersistedState() {
    if (!this.repository?.isEnabled()) {
      return;
    }

    const bindings = await this.repository.loadAllBindings();
    for (const binding of bindings) {
      this.bindingsById.set(binding.bindingId, binding);
      if (binding.status === "active") {
        this.activeBindingIdsByDeviceId.set(
          binding.deviceId,
          binding.bindingId,
        );
      }
      const family = await this.repository.findActiveRefreshFamilyByBindingId(
        binding.bindingId,
      );
      if (family) {
        this.refreshFamiliesByBindingId.set(binding.bindingId, family);
        this.refreshFamiliesByTokenHash.set(family.currentTokenHash, family);
      }
    }
  }

  private seedDemoInvitations() {
    const defaultExpiry = new Date(
      Date.now() + 365 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const seeds = [
      { driverId: "drv-demo-001", code: "demo-driver-code" },
      { driverId: "drv-demo-001", code: "driver-demo-001" },
    ];

    for (const seed of seeds) {
      const codeHash = this.hashToken(seed.code);
      if (!this.invitationsByHash.has(codeHash)) {
        const inv: DriverDeviceInvitationRecord = {
          invitationId: createOpaqueToken("drvinv"),
          driverId: seed.driverId,
          registrationCodeHash: codeHash,
          status: "pending",
          expiresAt: defaultExpiry,
          acceptedAt: null,
          revokedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        this.invitationsByHash.set(codeHash, inv);
      }
    }
  }

  private async revokeBindingAndFamily(
    bindingId: string,
    revokedAt: string,
    reasonCode: string,
  ) {
    this.logger.debug(
      `Revoking binding ${bindingId} for reason: ${reasonCode}`,
    );
    const binding =
      (await this.repository?.findBindingById?.(bindingId)) ??
      this.bindingsById.get(bindingId);

    if (binding) {
      binding.status = "revoked";
      binding.revokedAt = revokedAt;
      binding.updatedAt = revokedAt;
      if (this.repository?.saveBinding) {
        await this.repository.saveBinding(binding);
      }
      this.bindingsById.set(bindingId, binding);
      if (this.activeBindingIdsByDeviceId.get(binding.deviceId) === bindingId) {
        this.activeBindingIdsByDeviceId.delete(binding.deviceId);
      }
    }

    const family =
      (await this.repository?.findActiveRefreshFamilyByBindingId?.(
        bindingId,
      )) ?? this.refreshFamiliesByBindingId.get(bindingId);

    if (family) {
      if (family.status !== "compromised") {
        family.status = "revoked";
      }
      family.revokedAt = revokedAt;
      family.updatedAt = revokedAt;
      if (this.repository) {
        await this.repository.saveRefreshFamily(family);
      }
      this.refreshFamiliesByBindingId.set(bindingId, family);
    }
  }

  private async resolveBindingForRevoke(
    command: RevokeDriverDeviceBindingCommand,
  ): Promise<DriverDeviceBindingRecord | null> {
    const bindingId = command.bindingId?.trim();
    if (bindingId) {
      return (
        (await this.repository?.findBindingById?.(bindingId)) ??
        this.bindingsById.get(bindingId) ??
        null
      );
    }

    const deviceId = command.deviceId?.trim() || "";
    return (
      (await this.repository?.findActiveBindingByDeviceId?.(deviceId)) ??
      this.getActiveBindingByDeviceIdInMemory(deviceId)
    );
  }

  private getActiveBindingByDeviceIdInMemory(
    deviceId: string,
  ): DriverDeviceBindingRecord | null {
    const bindingId = this.activeBindingIdsByDeviceId.get(deviceId);
    if (!bindingId) {
      return null;
    }

    const binding = this.bindingsById.get(bindingId);
    return binding?.status === "active" ? binding : null;
  }

  private async revokeActiveBindingForDevice(
    deviceId: string,
    requestId?: string,
    reasonCode = "DEVICE_REBOUND",
  ): Promise<string | null> {
    const existing =
      (await this.repository?.findActiveBindingByDeviceId?.(deviceId)) ??
      this.getActiveBindingByDeviceIdInMemory(deviceId);

    if (!existing) {
      return null;
    }

    const revokedAt = new Date().toISOString();
    await this.revokeBindingAndFamily(
      existing.bindingId,
      revokedAt,
      reasonCode,
    );

    this.driverProfileService.recordDeviceBindingRevocation(
      existing.driverId,
      existing.bindingId,
      revokedAt,
      {
        actorId: existing.driverId,
        actorType: "system",
        tenantId: null,
      },
      requestId,
    );

    this.securityEventsService?.recordEvent?.({
      actorId: existing.driverId,
      actorType: "system",
      subjectId: existing.driverId,
      realm: "driver",
      tenantId: null,
      partnerId: null,
      eventType: "driver_device_session.revoked",
      eventFamily: "device",
      outcome: "revoked",
      severity: "medium",
      targetType: "driver_device_binding",
      targetId: existing.bindingId,
      sessionId: existing.bindingId,
      tokenId: null,
      authMethods: ["driver_device_registration"],
      sourceIp: null,
      userAgent: null,
      requestId: requestId ?? null,
      traceId: null,
      reasonCode,
      approvalId: null,
      beforeSummary: {
        bindingId: existing.bindingId,
        status: "active",
      },
      afterSummary: {
        bindingId: existing.bindingId,
        status: "revoked",
        revokedAt,
      },
      maskedContext: {
        deviceId: existing.deviceId,
      },
    });

    return existing.bindingId;
  }

  private resolveInMemoryRefreshFamilyByHash(
    tokenHash: string,
  ): { family: DriverRefreshFamilyRecord; isReused: boolean } | null {
    for (const fam of this.refreshFamiliesByTokenHash.values()) {
      if (fam.currentTokenHash === tokenHash) {
        return { family: fam, isReused: false };
      }
      if (fam.previousTokenHashes?.includes(tokenHash)) {
        return { family: fam, isReused: true };
      }
    }
    return null;
  }

  private toBindingSummary(
    binding: DriverDeviceBindingRecord,
  ): DriverDeviceBindingSummary {
    return {
      bindingId: binding.bindingId,
      deviceId: binding.deviceId,
      deviceLabel: binding.deviceLabel,
      status: binding.status,
      issuedAt: binding.issuedAt,
      refreshedAt: binding.refreshedAt,
      revokedAt: binding.revokedAt,
    };
  }

  private issueSession(
    binding: DriverDeviceBindingRecord,
    plaintextRefreshToken: string,
  ): DriverDeviceProvisioningSession {
    const issuedAt = new Date().toISOString();
    const accessToken = this.jwtAuthService.sign(
      {
        authMode: "jwt_bearer",
        actorType: "driver_user",
        actorId: binding.driverId,
        realm: "driver",
        tenantId: null,
        roleFamilies: ["driver"],
        roles: ["driver_user"],
        scopes: ["driver:read", "driver:write", "dispatch:read"],
        requestId: null,
        driverBindingId: binding.bindingId,
        driverDeviceId: binding.deviceId,
      },
      { expiresIn: DRIVER_ACCESS_TOKEN_EXPIRES_IN },
    );

    return {
      accessToken,
      refreshToken: plaintextRefreshToken,
      tokenType: "Bearer",
      expiresIn: DRIVER_ACCESS_TOKEN_EXPIRES_IN,
      refreshExpiresIn: DRIVER_REFRESH_TOKEN_EXPIRES_IN,
      driverId: binding.driverId,
      deviceId: binding.deviceId,
      bindingId: binding.bindingId,
      issuedAt,
      identity: {
        actorType: "driver_user",
        actorId: binding.driverId,
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
    binding: DriverDeviceBindingRecord,
    identity?: BootstrapRequestIdentity | null,
  ) {
    if (!identity) {
      throw new ApiRequestError(
        403,
        "DRIVER_DEVICE_BINDING_FORBIDDEN",
        "Only the bound driver or an authorized control-plane actor can revoke this driver device binding.",
        {
          bindingId: binding.bindingId,
          deviceId: binding.deviceId,
        },
      );
    }

    if (identity.realm === "driver") {
      if (
        identity.actorId === binding.driverId &&
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
          driverId: binding.driverId,
          bindingId: binding.bindingId,
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
        bindingId: binding.bindingId,
      },
    );
  }

  private resolveRevocationAuditActor(
    binding: DriverDeviceBindingRecord,
    identity?: BootstrapRequestIdentity | null,
  ) {
    if (!identity) {
      return {
        actorId: binding.driverId,
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
      actorId: binding.driverId,
      actorType: "system" as const,
      tenantId: identity.tenantId,
    };
  }
}
