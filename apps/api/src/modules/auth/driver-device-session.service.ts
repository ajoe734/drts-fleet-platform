import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import type { PoolClient } from "pg";

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
import { normalizeDriverOnboardingMobile } from "../../common/driver-onboarding-contact";
import { DriverProfileService } from "../driver-profile/driver-profile.service";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import { SecurityEventsService } from "../security-events/security-events.service";
import { DriverDeviceSessionRepository } from "./driver-device-session.repository";

const DRIVER_ACCESS_TOKEN_EXPIRES_IN = "15m";
const DRIVER_REFRESH_TOKEN_EXPIRES_IN = "30d";
const DRIVER_INVITATION_EXPIRES_IN_HOURS = 24;
const MAX_DRIVER_ONBOARDING_CODE_ATTEMPTS = 5;
const SHORT_CODE_PATTERN = /^\d{6}$/;
const ACTIVATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

type DriverRegistrationProof =
  | { kind: "legacy"; code: string; hash: string }
  | { kind: "short_code"; code: string; hash: string }
  | { kind: "activation_link"; hash: string };

function invalidDriverRegistration() {
  return new ApiRequestError(
    403,
    "DRIVER_REGISTRATION_INVALID",
    "The device registration proof is invalid, expired, or already used.",
  );
}

function onboardingProofHash(purpose: "contact" | "code", ...parts: string[]) {
  const pepper = process.env.DRIVER_ONBOARDING_CODE_PEPPER?.trim();
  if (!pepper || Buffer.byteLength(pepper) < 32) {
    throw new ApiRequestError(
      503,
      "DRIVER_ONBOARDING_UNAVAILABLE",
      "New driver registration is temporarily unavailable.",
    );
  }
  return createHmac("sha256", pepper)
    .update(JSON.stringify([purpose, ...parts]))
    .digest("hex");
}

function isPendingInvitation(
  invitation: DriverDeviceInvitationRecord,
  now: number,
) {
  return (
    invitation.status === "pending" &&
    invitation.acceptedAt === null &&
    invitation.revokedAt === null &&
    Date.parse(invitation.expiresAt) > now
  );
}

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

  private readonly activeBindingIdsByDriverId = new Map<string, string>();

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

  private inMemoryLockChain: Promise<void> = Promise.resolve();

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

  async issueOnboardingInvitation(
    command: { driverId: string; mobile: string },
    executor?: Pick<PoolClient, "query">,
  ): Promise<{
    invitation: DriverDeviceInvitationRecord;
    registrationCode: string;
    activationToken: string;
  }> {
    const driverId = command.driverId.trim();
    const mobile = normalizeDriverOnboardingMobile(command.mobile);
    if (!driverId || !mobile) {
      throw new ApiRequestError(
        400,
        "DRIVER_ONBOARDING_CONTACT_INVALID",
        "A valid driver and mobile number are required for registration.",
      );
    }
    if (!this.repository) {
      throw new ApiRequestError(
        503,
        "DRIVER_ONBOARDING_UNAVAILABLE",
        "New driver registration is temporarily unavailable.",
      );
    }
    const registrationCode = String(randomInt(1_000_000)).padStart(6, "0");
    const activationToken = randomBytes(32).toString("base64url");
    const invitationId = `drvinv_${randomBytes(16).toString("hex")}`;
    const now = Date.now();
    const timestamp = new Date(now).toISOString();
    const invitation = await this.repository.saveOnboardingInvitation(
      {
        invitationId,
        driverId,
        registrationCodeHash: onboardingProofHash(
          "code",
          invitationId,
          registrationCode,
        ),
        onboardingContactHash: onboardingProofHash("contact", mobile),
        activationTokenHash: this.hashToken(activationToken),
        status: "pending",
        expiresAt: new Date(
          now + DRIVER_INVITATION_EXPIRES_IN_HOURS * 60 * 60 * 1000,
        ).toISOString(),
        acceptedAt: null,
        revokedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      executor,
    );
    return { invitation, registrationCode, activationToken };
  }

  async canDeliverOnboardingInvitation(invitationId: string): Promise<boolean> {
    const invitation = await this.repository?.findOnboardingInvitation({
      invitationId,
    });
    if (!invitation || !isPendingInvitation(invitation, Date.now()))
      return false;
    try {
      await this.assertDriverAuthEligible(invitation.driverId);
      return true;
    } catch (error) {
      if (
        error instanceof ApiRequestError &&
        [403, 404].includes(error.getStatus())
      )
        return false;
      throw error;
    }
  }

  private resolveRegistrationProof(
    command: RegisterDriverDeviceCommand,
  ): DriverRegistrationProof {
    const activationToken =
      typeof command.activationToken === "string"
        ? command.activationToken.trim()
        : "";
    const code =
      typeof command.registrationCode === "string"
        ? command.registrationCode.trim()
        : "";
    if (command.activationToken !== undefined) {
      if (
        !ACTIVATION_TOKEN_PATTERN.test(activationToken) ||
        code ||
        command.registrationContact !== undefined
      ) {
        throw invalidDriverRegistration();
      }
      return { kind: "activation_link", hash: this.hashToken(activationToken) };
    }
    if (!code) {
      throw new ApiRequestError(
        400,
        "FIELD_REQUIRED",
        "registrationCode is required.",
        { field: "registrationCode" },
      );
    }
    if (command.registrationContact !== undefined) {
      const mobile = normalizeDriverOnboardingMobile(
        command.registrationContact,
      );
      if (!SHORT_CODE_PATTERN.test(code) || !mobile)
        throw invalidDriverRegistration();
      return {
        kind: "short_code",
        code,
        hash: onboardingProofHash("contact", mobile),
      };
    }
    return { kind: "legacy", code, hash: this.hashToken(code) };
  }

  private async findRegistrationInvitation(proof: DriverRegistrationProof) {
    if (proof.kind === "activation_link") {
      return this.repository?.findOnboardingInvitation({
        activationTokenHash: proof.hash,
      });
    }
    if (proof.kind === "short_code") {
      return this.repository?.findOnboardingInvitation({
        contactHash: proof.hash,
      });
    }
    const stored =
      (await this.repository?.findInvitationByCodeHash?.(proof.hash)) ??
      this.invitationsByHash.get(proof.hash);
    if (stored) return stored.activationTokenHash ? null : stored;
    const driverId = this.driverProfileService.resolveProvisionableDriverId(
      proof.code,
    );
    if (!driverId) return null;
    const issued = await this.issueRegistrationInvitation({
      driverId,
      registrationCode: proof.code,
    });
    return issued.invitation;
  }

  private async verifyShortCode(
    invitation: DriverDeviceInvitationRecord,
    code: string,
    nowIso: string,
  ): Promise<boolean> {
    const attempts = invitation.failedCodeAttempts ?? 0;
    if (attempts >= MAX_DRIVER_ONBOARDING_CODE_ATTEMPTS) return false;
    const candidate = Buffer.from(
      onboardingProofHash("code", invitation.invitationId, code),
      "hex",
    );
    const stored = Buffer.from(invitation.registrationCodeHash, "hex");
    if (
      candidate.length === stored.length &&
      timingSafeEqual(candidate, stored)
    )
      return true;
    await this.repository?.saveInvitation({
      ...invitation,
      failedCodeAttempts: attempts + 1,
      updatedAt: nowIso,
    });
    return false;
  }

  async revokeInvitation(
    command: { registrationCode: string },
    allowedDriverId?: string,
  ): Promise<{ revoked: boolean }> {
    const code = command.registrationCode.trim();
    if (!code) return { revoked: false };

    const hash = this.hashToken(code);
    const invitation =
      (await this.repository?.findInvitationByCodeHash?.(hash)) ??
      this.invitationsByHash.get(hash) ??
      undefined;

    if (
      allowedDriverId &&
      invitation &&
      invitation.driverId !== allowedDriverId
    ) {
      throw new ApiRequestError(
        403,
        "WORKLOAD_DRIVER_TARGET_DENIED",
        "Driver provisioning grant does not allow this invitation.",
      );
    }

    if (
      !invitation ||
      (invitation.status !== "pending" &&
        invitation.status !== "used" &&
        invitation.status !== "revoked")
    ) {
      return { revoked: false };
    }

    let newlyRevoked = false;
    if (invitation.status !== "revoked") {
      invitation.status = "revoked";
      invitation.revokedAt = new Date().toISOString();
      invitation.updatedAt = invitation.revokedAt;

      if (this.repository) {
        await this.repository.saveInvitation(invitation);
      }
      this.invitationsByHash.set(hash, invitation);
      newlyRevoked = true;
    }

    if (invitation.boundBindingId) {
      const binding =
        (await this.repository?.findBindingById?.(invitation.boundBindingId)) ??
        this.bindingsById.get(invitation.boundBindingId);
      if (binding) {
        const revokedAt = invitation.revokedAt ?? new Date().toISOString();
        await this.revokeBindingAndFamily(
          invitation.boundBindingId,
          revokedAt,
          "INVITATION_REVOKED",
        );
        // Keep the driver profile's embedded binding summary in sync; it is
        // read independently (e.g. isolation checks) from the IAM table, and
        // was previously left stale by this path. Called unconditionally,
        // same as the manual revoke() path: binding.status can already read
        // "revoked" here from an earlier attempt that failed after mutating
        // it but before this profile sync ran, so that flag cannot gate it.
        await this.driverProfileService.prepareProfileAuthority?.(
          binding.driverId,
        );
        this.driverProfileService.recordDeviceBindingRevocation(
          binding.driverId,
          invitation.boundBindingId,
          revokedAt,
          { actorId: binding.driverId, actorType: "system", tenantId: null },
        );
      }
    }

    return { revoked: newlyRevoked || invitation.status === "revoked" };
  }

  async register(
    command: RegisterDriverDeviceCommand,
    requestId?: string,
  ): Promise<DriverDeviceProvisioningSession> {
    const proof = this.resolveRegistrationProof(command);
    const deviceId =
      typeof command.deviceId === "string" ? command.deviceId.trim() : "";
    if (!deviceId) {
      throw new ApiRequestError(
        400,
        "FIELD_REQUIRED",
        "deviceId is required.",
        { field: "deviceId" },
      );
    }

    const scope = { regCodeHash: proof.hash, deviceId };
    const result = await this.runWithRegistrationLock(scope, async () => {
      const invitation = await this.findRegistrationInvitation(proof);
      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      if (
        !invitation ||
        !isPendingInvitation(invitation, now) ||
        (proof.kind === "short_code" &&
          !(await this.verifyShortCode(invitation, proof.code, nowIso)))
      ) {
        this.securityEventsService?.recordEvent?.({
          actorId: invitation?.driverId ?? "unknown",
          actorType: "driver_user",
          subjectId: invitation?.driverId ?? null,
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
            proofKind: proof.kind,
          },
        });

        // Commit the short-code attempt counter before reporting a refusal.
        return null;
      }

      const driverId = invitation.driverId;
      await this.repository?.lockDriverRegistrationScope?.(driverId);
      await this.assertDriverAuthEligible(driverId);
      await this.driverProfileService.prepareProfileAuthority?.(driverId);

      const oldBindingId = await this.revokePriorActiveBindingsForRegistration(
        driverId,
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

      // Single-use: Mark invitation as used
      invitation.status = "used";
      invitation.acceptedAt = nowIso;
      invitation.updatedAt = nowIso;
      invitation.boundBindingId = savedBinding.bindingId;
      if (this.repository) {
        await this.repository.saveInvitation(invitation);
      }
      this.invitationsByHash.set(invitation.registrationCodeHash, invitation);

      this.bindingsById.set(savedBinding.bindingId, savedBinding);
      this.activeBindingIdsByDeviceId.set(deviceId, savedBinding.bindingId);
      this.activeBindingIdsByDriverId.set(driverId, savedBinding.bindingId);

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

      const session = await this.issueSession(
        savedBinding,
        plaintextRefreshToken,
        "driver_device_registration",
      );

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
        tokenId: null,
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
    });
    if (!result) throw invalidDriverRegistration();
    return result;
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
      await this.assertDriverAuthEligible(binding.driverId);
    } catch (authError) {
      await this.revokeBindingAndFamily(
        binding.bindingId,
        nowIso,
        "DRIVER_SUSPENDED",
      );
      throw authError;
    }

    return this.runWithDeviceDriverLock(
      { deviceId, driverId: binding.driverId },
      async () => {
        const latestFamilyResult =
          (await this.repository?.findRefreshFamilyByTokenHash?.(tokenHash)) ??
          this.resolveInMemoryRefreshFamilyByHash(tokenHash);
        const activeFamily = latestFamilyResult?.family ?? null;
        const latestBinding =
          (await this.repository?.findBindingById?.(binding.bindingId)) ??
          this.bindingsById.get(binding.bindingId) ??
          null;

        if (
          !activeFamily ||
          latestFamilyResult?.isReused ||
          activeFamily.status !== "active" ||
          activeFamily.currentTokenHash !== tokenHash ||
          new Date(activeFamily.expiresAt).getTime() <=
            new Date(nowIso).getTime() ||
          !latestBinding ||
          latestBinding.status !== "active" ||
          latestBinding.deviceId !== deviceId
        ) {
          throw new ApiRequestError(
            401,
            "DRIVER_DEVICE_REFRESH_INVALID",
            "The driver device refresh token is invalid, expired, or revoked.",
            { deviceId },
          );
        }

        const newPlaintextRefreshToken = createOpaqueToken("drvrefresh");
        const newTokenHash = this.hashToken(newPlaintextRefreshToken);

        // Rotation
        activeFamily.previousTokenHashes = [
          ...activeFamily.previousTokenHashes,
          activeFamily.currentTokenHash,
        ];
        this.refreshFamiliesByTokenHash.delete(activeFamily.currentTokenHash);
        activeFamily.currentTokenHash = newTokenHash;
        activeFamily.rotationCounter += 1;
        activeFamily.updatedAt = nowIso;

        if (this.repository) {
          await this.repository.saveRefreshFamily(activeFamily);
        }
        this.refreshFamiliesByBindingId.set(
          latestBinding.bindingId,
          activeFamily,
        );
        this.refreshFamiliesByTokenHash.set(newTokenHash, activeFamily);

        latestBinding.refreshedAt = nowIso;
        latestBinding.updatedAt = nowIso;
        if (this.repository) {
          await this.repository.saveBinding(latestBinding);
        }
        this.bindingsById.set(latestBinding.bindingId, latestBinding);

        await this.driverProfileService.prepareProfileAuthority?.(
          latestBinding.driverId,
        );
        this.driverProfileService.recordDeviceBindingRefresh(
          latestBinding.driverId,
          latestBinding.bindingId,
          nowIso,
        );

        const session = await this.issueSession(
          latestBinding,
          newPlaintextRefreshToken,
          "driver_refresh_token",
        );

        this.securityEventsService?.recordEvent?.({
          actorId: latestBinding.driverId,
          actorType: "driver_user",
          subjectId: latestBinding.driverId,
          realm: "driver",
          tenantId: null,
          partnerId: null,
          eventType: "driver_device_session.refreshed",
          eventFamily: "session",
          outcome: "success",
          severity: "low",
          targetType: "driver_device_binding",
          targetId: latestBinding.bindingId,
          sessionId: latestBinding.bindingId,
          tokenId: null,
          authMethods: ["driver_refresh_token"],
          sourceIp: null,
          userAgent: null,
          requestId: null,
          traceId: null,
          reasonCode: null,
          approvalId: null,
          beforeSummary: null,
          afterSummary: {
            bindingId: latestBinding.bindingId,
            refreshedAt: latestBinding.refreshedAt,
            rotationCounter: activeFamily.rotationCounter,
            status: "active",
          },
          maskedContext: {
            deviceId: latestBinding.deviceId,
            refreshTokenHash: newTokenHash,
          },
        });

        return session;
      },
    );
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

    await this.driverProfileService.prepareProfileAuthority?.(binding.driverId);
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
      await this.assertDriverAuthEligible(driverId);
    }
  }

  hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private async runWithLocalLock<T>(callback: () => Promise<T>): Promise<T> {
    const previous = this.inMemoryLockChain;
    let release!: () => void;
    this.inMemoryLockChain = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await callback();
    } finally {
      release();
    }
  }

  private async runWithInMemoryRollbackGuard<T>(
    callback: () => Promise<T>,
  ): Promise<T> {
    const invitationsSnapshot = new Map(
      Array.from(this.invitationsByHash.entries(), ([key, value]) => [
        key,
        { ...value },
      ]),
    );
    const bindingsSnapshot = new Map(
      Array.from(this.bindingsById.entries(), ([key, value]) => [
        key,
        { ...value },
      ]),
    );
    const activeByDeviceSnapshot = new Map(this.activeBindingIdsByDeviceId);
    const activeByDriverSnapshot = new Map(this.activeBindingIdsByDriverId);
    const familiesByBindingSnapshot = new Map(
      Array.from(this.refreshFamiliesByBindingId.entries(), ([key, value]) => [
        key,
        {
          ...value,
          previousTokenHashes: [...value.previousTokenHashes],
        },
      ]),
    );
    const familiesByHashSnapshot = new Map(
      Array.from(this.refreshFamiliesByTokenHash.entries(), ([key, value]) => [
        key,
        {
          ...value,
          previousTokenHashes: [...value.previousTokenHashes],
        },
      ]),
    );

    try {
      return await callback();
    } catch (error) {
      this.invitationsByHash.clear();
      for (const [key, value] of invitationsSnapshot.entries()) {
        this.invitationsByHash.set(key, value);
      }
      this.bindingsById.clear();
      for (const [key, value] of bindingsSnapshot.entries()) {
        this.bindingsById.set(key, value);
      }
      this.activeBindingIdsByDeviceId.clear();
      for (const [key, value] of activeByDeviceSnapshot.entries()) {
        this.activeBindingIdsByDeviceId.set(key, value);
      }
      this.activeBindingIdsByDriverId.clear();
      for (const [key, value] of activeByDriverSnapshot.entries()) {
        this.activeBindingIdsByDriverId.set(key, value);
      }
      this.refreshFamiliesByBindingId.clear();
      for (const [key, value] of familiesByBindingSnapshot.entries()) {
        this.refreshFamiliesByBindingId.set(key, value);
      }
      this.refreshFamiliesByTokenHash.clear();
      for (const [key, value] of familiesByHashSnapshot.entries()) {
        this.refreshFamiliesByTokenHash.set(key, value);
      }
      throw error;
    }
  }

  private async runWithRegistrationLock<T>(
    scope: { regCodeHash: string; deviceId: string },
    callback: () => Promise<T>,
  ): Promise<T> {
    const guardedCallback = () => this.runWithInMemoryRollbackGuard(callback);
    if (this.repository?.withRegistrationLock) {
      return this.repository.withRegistrationLock(scope, guardedCallback);
    }
    return this.runWithLocalLock(guardedCallback);
  }

  private async runWithDeviceDriverLock<T>(
    scope: { deviceId: string; driverId: string },
    callback: () => Promise<T>,
  ): Promise<T> {
    const guardedCallback = () => this.runWithInMemoryRollbackGuard(callback);
    if (this.repository?.withDeviceDriverLock) {
      return this.repository.withDeviceDriverLock(scope, guardedCallback);
    }
    return this.runWithLocalLock(guardedCallback);
  }

  private async loadPersistedState() {
    if (!this.repository?.loadAllBindings) {
      return;
    }

    const bindings = await this.repository.loadAllBindings();
    for (const binding of bindings) {
      this.bindingsById.set(binding.bindingId, binding);
      if (binding.status === "active") {
        if (!this.activeBindingIdsByDeviceId.has(binding.deviceId)) {
          this.activeBindingIdsByDeviceId.set(
            binding.deviceId,
            binding.bindingId,
          );
        }
        if (!this.activeBindingIdsByDriverId.has(binding.driverId)) {
          this.activeBindingIdsByDriverId.set(
            binding.driverId,
            binding.bindingId,
          );
        }
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
      if (binding.status !== "revoked") {
        binding.status = "revoked";
        binding.revokedAt = revokedAt;
        binding.updatedAt = revokedAt;
        if (this.repository?.saveBinding) {
          await this.repository.saveBinding(binding);
        }
      }
      this.bindingsById.set(bindingId, binding);
      if (this.activeBindingIdsByDeviceId.get(binding.deviceId) === bindingId) {
        this.activeBindingIdsByDeviceId.delete(binding.deviceId);
      }
      if (this.activeBindingIdsByDriverId.get(binding.driverId) === bindingId) {
        this.activeBindingIdsByDriverId.delete(binding.driverId);
      }
    }

    const familiesById = new Map<string, DriverRefreshFamilyRecord>();
    if (this.repository?.findActiveRefreshFamiliesByBindingId) {
      const repoFamilies =
        await this.repository.findActiveRefreshFamiliesByBindingId(bindingId);
      for (const fam of repoFamilies) {
        familiesById.set(fam.familyId, fam);
      }
    } else if (this.repository?.findActiveRefreshFamilyByBindingId) {
      const single =
        await this.repository.findActiveRefreshFamilyByBindingId(bindingId);
      if (single) {
        familiesById.set(single.familyId, single);
      }
    }

    const inMemoryFamily = this.refreshFamiliesByBindingId.get(bindingId);
    if (inMemoryFamily && !familiesById.has(inMemoryFamily.familyId)) {
      familiesById.set(inMemoryFamily.familyId, inMemoryFamily);
    }

    for (const family of familiesById.values()) {
      if (family.status !== "compromised") {
        family.status = "revoked";
      }
      family.revokedAt = revokedAt;
      family.updatedAt = revokedAt;
      if (this.repository) {
        await this.repository.saveRefreshFamily(family);
      }
      this.refreshFamiliesByBindingId.set(bindingId, family);
      this.refreshFamiliesByTokenHash.set(family.currentTokenHash, family);
    }

    if (this.jwtAuthService?.revokeCurrentSession) {
      await this.jwtAuthService.revokeCurrentSession(bindingId, reasonCode);
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

  private getActiveBindingsForDeviceOrDriverInMemory(
    deviceId: string,
    driverId: string,
  ): DriverDeviceBindingRecord[] {
    const results: DriverDeviceBindingRecord[] = [];
    const seen = new Set<string>();

    const deviceBindingId = this.activeBindingIdsByDeviceId.get(deviceId);
    if (deviceBindingId) {
      const candidate = this.bindingsById.get(deviceBindingId);
      if (candidate?.status === "active") {
        results.push(candidate);
        seen.add(candidate.bindingId);
      }
    }

    const driverBindingId = this.activeBindingIdsByDriverId.get(driverId);
    if (driverBindingId && !seen.has(driverBindingId)) {
      const candidate = this.bindingsById.get(driverBindingId);
      if (candidate?.status === "active") {
        results.push(candidate);
        seen.add(candidate.bindingId);
      }
    }

    for (const candidate of this.bindingsById.values()) {
      if (
        candidate.status === "active" &&
        !seen.has(candidate.bindingId) &&
        (candidate.deviceId === deviceId || candidate.driverId === driverId)
      ) {
        results.push(candidate);
        seen.add(candidate.bindingId);
      }
    }

    return results;
  }

  private async collectPriorActiveBindingsForRegistration(
    driverId: string,
    deviceId: string,
  ): Promise<DriverDeviceBindingRecord[]> {
    const orderedBindings = new Map<string, DriverDeviceBindingRecord>();

    if (this.repository?.findActiveBindingsByDeviceId) {
      const deviceBindings =
        await this.repository.findActiveBindingsByDeviceId(deviceId);
      for (const binding of deviceBindings) {
        if (binding.status === "active") {
          orderedBindings.set(binding.bindingId, binding);
        }
      }
    } else if (this.repository?.findActiveBindingByDeviceId) {
      const deviceBinding =
        await this.repository.findActiveBindingByDeviceId(deviceId);
      if (deviceBinding?.status === "active") {
        orderedBindings.set(deviceBinding.bindingId, deviceBinding);
      }
    }

    if (this.repository?.findActiveBindingsByDriverId) {
      const driverBindings =
        await this.repository.findActiveBindingsByDriverId(driverId);
      for (const binding of driverBindings) {
        if (
          binding.status === "active" &&
          !orderedBindings.has(binding.bindingId)
        ) {
          orderedBindings.set(binding.bindingId, binding);
        }
      }
    } else if (this.repository?.findBindingsForDriver) {
      const driverBindings =
        await this.repository.findBindingsForDriver(driverId);
      for (const binding of driverBindings) {
        if (
          binding.status === "active" &&
          !orderedBindings.has(binding.bindingId)
        ) {
          orderedBindings.set(binding.bindingId, binding);
        }
      }
    }

    for (const inMemoryBinding of this.getActiveBindingsForDeviceOrDriverInMemory(
      deviceId,
      driverId,
    )) {
      if (!orderedBindings.has(inMemoryBinding.bindingId)) {
        orderedBindings.set(inMemoryBinding.bindingId, inMemoryBinding);
      }
    }

    return Array.from(orderedBindings.values());
  }

  private async revokePriorActiveBindingsForRegistration(
    driverId: string,
    deviceId: string,
    requestId?: string,
    reasonCode = "DEVICE_REBOUND",
  ): Promise<string | null> {
    const priorActiveBindings =
      await this.collectPriorActiveBindingsForRegistration(driverId, deviceId);

    if (priorActiveBindings.length === 0) {
      return null;
    }

    const revokedAt = new Date().toISOString();
    let reboundFromBindingId: string | null = null;

    for (const existing of priorActiveBindings) {
      if (!reboundFromBindingId || existing.deviceId === deviceId) {
        if (!reboundFromBindingId) {
          reboundFromBindingId = existing.bindingId;
        }
      }

      await this.revokeBindingAndFamily(
        existing.bindingId,
        revokedAt,
        reasonCode,
      );

      if (existing.driverId !== driverId) {
        await this.driverProfileService.prepareProfileAuthority?.(
          existing.driverId,
        );
      }
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
    }

    return reboundFromBindingId;
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

  private async issueSession(
    binding: DriverDeviceBindingRecord,
    plaintextRefreshToken: string,
    amrMethod: string = "driver_device_registration",
  ): Promise<DriverDeviceProvisioningSession> {
    const issuedAt = new Date().toISOString();
    let accessToken: string;

    if (this.jwtAuthService?.issueSessionToken) {
      const sessionToken = await this.jwtAuthService.issueSessionToken(
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
          subject: binding.driverId,
          principalId: binding.driverId,
          amr: [amrMethod],
        },
        {
          sessionId: binding.bindingId,
          expiresIn: DRIVER_ACCESS_TOKEN_EXPIRES_IN,
        },
      );
      accessToken = sessionToken.token;
    } else {
      accessToken = this.jwtAuthService.sign(
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
    }

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

  private async assertDriverAuthEligible(driverId: string) {
    await this.regulatoryRegistryService?.prepareDriverAuthority?.(driverId);
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
