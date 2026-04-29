import { Injectable } from "@nestjs/common";

import type {
  DriverDeviceBindingSummary,
  DriverDeviceProvisioningSession,
  RefreshDriverDeviceSessionCommand,
  RegisterDriverDeviceCommand,
  RevokeDriverDeviceBindingCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { JwtAuthService } from "../../common/auth/jwt-auth.service";
import { DriverProfileService } from "../driver-profile/driver-profile.service";

type DriverDeviceBindingRecord = {
  bindingId: string;
  driverId: string;
  deviceId: string;
  deviceLabel: string | null;
  refreshToken: string;
  active: boolean;
  issuedAt: string;
  refreshedAt: string;
  revokedAt: string | null;
};

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
  private readonly bindingsById = new Map<string, DriverDeviceBindingRecord>();

  private readonly activeBindingIdsByDeviceId = new Map<string, string>();

  constructor(
    private readonly jwtAuthService: JwtAuthService,
    private readonly driverProfileService: DriverProfileService,
  ) {}

  register(
    command: RegisterDriverDeviceCommand,
  ): DriverDeviceProvisioningSession {
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

    this.revokeActiveBindingForDevice(deviceId);

    const now = new Date().toISOString();
    const binding: DriverDeviceBindingRecord = {
      bindingId: createOpaqueToken("drvbind"),
      driverId,
      deviceId,
      deviceLabel: command.deviceLabel?.trim() || null,
      refreshToken: createOpaqueToken("drvrefresh"),
      active: true,
      issuedAt: now,
      refreshedAt: now,
      revokedAt: null,
    };

    this.bindingsById.set(binding.bindingId, binding);
    this.activeBindingIdsByDeviceId.set(deviceId, binding.bindingId);
    this.driverProfileService.recordDeviceBinding(
      driverId,
      this.toBindingSummary(binding),
    );

    return this.issueSession(binding);
  }

  refresh(
    command: RefreshDriverDeviceSessionCommand,
  ): DriverDeviceProvisioningSession {
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

    const binding = this.getActiveBindingByDeviceId(deviceId);
    if (!binding || binding.refreshToken !== refreshToken) {
      throw new ApiRequestError(
        401,
        "DRIVER_DEVICE_REFRESH_INVALID",
        "The driver device refresh token is invalid, expired, or revoked.",
        { deviceId },
      );
    }

    binding.refreshToken = createOpaqueToken("drvrefresh");
    binding.refreshedAt = new Date().toISOString();
    this.bindingsById.set(binding.bindingId, binding);
    this.driverProfileService.recordDeviceBindingRefresh(
      binding.driverId,
      binding.bindingId,
      binding.refreshedAt,
    );

    return this.issueSession(binding);
  }

  revoke(
    command: RevokeDriverDeviceBindingCommand,
    actorId?: string | null,
  ): {
    bindingId: string;
    deviceId: string;
    driverId: string;
    revokedAt: string;
  } {
    const binding = this.resolveBindingForRevoke(command);
    if (!binding) {
      throw new ApiRequestError(
        404,
        "DRIVER_DEVICE_BINDING_NOT_FOUND",
        "No driver device binding was found for this revoke request.",
        { bindingId: command.bindingId ?? null, deviceId: command.deviceId },
      );
    }

    if (actorId && binding.driverId !== actorId) {
      throw new ApiRequestError(
        403,
        "DRIVER_DEVICE_BINDING_FORBIDDEN",
        "The current driver identity cannot revoke another driver's device binding.",
        { actorId, driverId: binding.driverId, bindingId: binding.bindingId },
      );
    }

    const revokedAt = new Date().toISOString();
    binding.active = false;
    binding.revokedAt = revokedAt;
    binding.refreshedAt = revokedAt;
    this.bindingsById.set(binding.bindingId, binding);
    if (
      this.activeBindingIdsByDeviceId.get(binding.deviceId) ===
      binding.bindingId
    ) {
      this.activeBindingIdsByDeviceId.delete(binding.deviceId);
    }
    this.driverProfileService.recordDeviceBindingRevocation(
      binding.driverId,
      binding.bindingId,
      revokedAt,
    );

    return {
      bindingId: binding.bindingId,
      deviceId: binding.deviceId,
      driverId: binding.driverId,
      revokedAt,
    };
  }

  isBindingActive(
    bindingId: string | null | undefined,
    deviceId: string | null | undefined,
    driverId: string | null | undefined,
  ): boolean {
    const resolvedBindingId = bindingId?.trim();
    const resolvedDeviceId = deviceId?.trim();
    const resolvedDriverId = driverId?.trim();
    if (!resolvedBindingId || !resolvedDeviceId || !resolvedDriverId) {
      return false;
    }

    const binding = this.bindingsById.get(resolvedBindingId);
    if (!binding || !binding.active) {
      return false;
    }

    return (
      binding.deviceId === resolvedDeviceId &&
      binding.driverId === resolvedDriverId &&
      this.activeBindingIdsByDeviceId.get(resolvedDeviceId) ===
        resolvedBindingId
    );
  }

  private resolveBindingForRevoke(
    command: RevokeDriverDeviceBindingCommand,
  ): DriverDeviceBindingRecord | null {
    const bindingId = command.bindingId?.trim();
    if (bindingId) {
      return this.bindingsById.get(bindingId) ?? null;
    }

    return this.getActiveBindingByDeviceId(command.deviceId?.trim() || "");
  }

  private getActiveBindingByDeviceId(
    deviceId: string,
  ): DriverDeviceBindingRecord | null {
    const bindingId = this.activeBindingIdsByDeviceId.get(deviceId);
    if (!bindingId) {
      return null;
    }

    const binding = this.bindingsById.get(bindingId);
    return binding?.active ? binding : null;
  }

  private revokeActiveBindingForDevice(deviceId: string) {
    const existing = this.getActiveBindingByDeviceId(deviceId);
    if (!existing) {
      return;
    }

    existing.active = false;
    existing.revokedAt = new Date().toISOString();
    existing.refreshedAt = existing.revokedAt;
    this.bindingsById.set(existing.bindingId, existing);
    this.activeBindingIdsByDeviceId.delete(deviceId);
    this.driverProfileService.recordDeviceBindingRevocation(
      existing.driverId,
      existing.bindingId,
      existing.revokedAt,
    );
  }

  private toBindingSummary(
    binding: DriverDeviceBindingRecord,
  ): DriverDeviceBindingSummary {
    return {
      bindingId: binding.bindingId,
      deviceId: binding.deviceId,
      deviceLabel: binding.deviceLabel,
      status: binding.active ? "active" : "revoked",
      issuedAt: binding.issuedAt,
      refreshedAt: binding.refreshedAt,
      revokedAt: binding.revokedAt,
    };
  }

  private issueSession(
    binding: DriverDeviceBindingRecord,
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
      refreshToken: binding.refreshToken,
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
}
