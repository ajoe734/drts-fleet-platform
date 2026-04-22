import { Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AuditLogRecord,
  CreateDriverProfileCommand,
  DriverProfileBankAccount,
  DriverProfileEmergencyContact,
  DriverProfileRecord,
  UpdateDriverProfileCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { DriverProfileRepository } from "./driver-profile.repository";

const DEMO_DRIVER_ALIASES: Record<string, string> = {
  "demo-driver": "drv-demo-001",
  "driver-demo-001": "drv-demo-001",
};

function cloneEmergencyContact(
  contact: DriverProfileEmergencyContact | null,
): DriverProfileEmergencyContact | null {
  return contact ? { ...contact } : null;
}

function cloneBankAccount(
  bankAccount: DriverProfileBankAccount | null,
): DriverProfileBankAccount | null {
  return bankAccount ? { ...bankAccount } : null;
}

@Injectable()
export class DriverProfileService implements OnModuleInit {
  private readonly profiles = new Map<string, DriverProfileRecord>();

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    @Optional() private readonly repository?: DriverProfileRepository,
  ) {}

  async onModuleInit() {
    if (!this.repository) return;

    try {
      const data = await this.repository.loadAll();
      for (const profile of data) {
        this.profiles.set(profile.driverId, this.clone(profile));
      }
    } catch (error) {
      this.repository.reportPersistenceFailure(error, "module init");
    }
  }

  getProfile(actorId?: string | null) {
    return this.clone(this.resolveBaseProfile(actorId));
  }

  createProfile(
    actorId: string | null | undefined,
    command: CreateDriverProfileCommand,
    requestId?: string,
  ) {
    const driverId = this.resolveDriverId(actorId);
    if (this.profileExists(driverId)) {
      throw new ApiRequestError(
        409,
        "DRIVER_PROFILE_EXISTS",
        "Driver profile already exists for this driver.",
        { driverId },
      );
    }

    const base = this.resolveBaseProfile(driverId);
    const created: DriverProfileRecord = {
      ...base,
      name: this.normalizeRequiredText("name", command.name),
      phone: this.normalizeOptionalText(command.phone) ?? null,
      email: this.normalizeOptionalText(command.email) ?? null,
      photoUrl: this.normalizeOptionalText(command.photoUrl) ?? null,
      emergencyContact:
        this.normalizeEmergencyContact(command.emergencyContact) ?? null,
      bankAccount: this.normalizeBankAccount(command.bankAccount) ?? null,
      updatedAt: new Date().toISOString(),
    };

    this.profiles.set(driverId, this.clone(created));
    this.persist(created, "create_profile");
    this.recordAudit(
      {
        actorId: driverId,
        actorType: "system",
        tenantId: null,
        moduleName: "driver-profile",
        actionName: "create_driver_profile",
        resourceType: "driver_profile",
        resourceId: driverId,
        newValuesSummary: created as unknown as Record<string, unknown>,
      },
      requestId,
    );

    return this.clone(created);
  }

  updateProfile(
    actorId: string | null | undefined,
    command: UpdateDriverProfileCommand,
    requestId?: string,
  ) {
    const driverId = this.resolveDriverId(actorId);
    const current = this.resolveBaseProfile(driverId);
    const updated: DriverProfileRecord = {
      ...current,
      ...(command.name !== undefined && {
        name: this.normalizeRequiredText("name", command.name),
      }),
      ...(command.phone !== undefined && {
        phone: this.normalizeOptionalText(command.phone) ?? null,
      }),
      ...(command.email !== undefined && {
        email: this.normalizeOptionalText(command.email) ?? null,
      }),
      ...(command.photoUrl !== undefined && {
        photoUrl: this.normalizeOptionalText(command.photoUrl) ?? null,
      }),
      ...(command.emergencyContact !== undefined && {
        emergencyContact:
          this.normalizeEmergencyContact(command.emergencyContact) ?? null,
      }),
      ...(command.bankAccount !== undefined && {
        bankAccount: this.normalizeBankAccount(command.bankAccount) ?? null,
      }),
      updatedAt: new Date().toISOString(),
    };

    this.profiles.set(driverId, this.clone(updated));
    this.persist(updated, "update_profile");
    this.recordAudit(
      {
        actorId: driverId,
        actorType: "system",
        tenantId: null,
        moduleName: "driver-profile",
        actionName: "update_driver_profile",
        resourceType: "driver_profile",
        resourceId: driverId,
        oldValuesSummary: current as unknown as Record<string, unknown>,
        newValuesSummary: updated as unknown as Record<string, unknown>,
      },
      requestId,
    );

    return this.clone(updated);
  }

  private resolveBaseProfile(actorId?: string | null): DriverProfileRecord {
    const driverId = this.resolveDriverId(actorId);
    const existing = this.profiles.get(driverId);
    if (existing) {
      return this.clone(existing);
    }

    return this.buildEmptyProfile(driverId);
  }

  private profileExists(driverId: string): boolean {
    return this.profiles.has(driverId);
  }

  private resolveDriverId(actorId?: string | null): string {
    const candidate = actorId?.trim();
    if (!candidate) {
      throw new ApiRequestError(
        401,
        "DRIVER_IDENTITY_REQUIRED",
        "Driver profile routes require a bootstrap identity with a driver actorId.",
      );
    }

    return DEMO_DRIVER_ALIASES[candidate] ?? candidate;
  }

  private buildEmptyProfile(driverId: string): DriverProfileRecord {
    return {
      driverId,
      name: "",
      phone: null,
      email: null,
      photoUrl: null,
      emergencyContact: null,
      bankAccount: null,
      updatedAt: new Date().toISOString(),
    };
  }

  private normalizeRequiredText(field: string, value: string) {
    const normalized = value.trim();
    if (!normalized) {
      throw new ApiRequestError(
        400,
        "INVALID_DRIVER_PROFILE",
        `${field} is required for driver profile.`,
        { field },
      );
    }

    return normalized;
  }

  private normalizeOptionalText(value: string | null | undefined) {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }

    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  private normalizeEmergencyContact(
    contact: DriverProfileEmergencyContact | null | undefined,
  ) {
    if (contact === undefined) {
      return undefined;
    }
    if (contact === null) {
      return null;
    }

    return {
      name: this.normalizeRequiredText("emergencyContact.name", contact.name),
      phone: this.normalizeRequiredText(
        "emergencyContact.phone",
        contact.phone,
      ),
      relationship: this.normalizeOptionalText(contact.relationship) ?? null,
    };
  }

  private normalizeBankAccount(
    bankAccount: DriverProfileBankAccount | null | undefined,
  ) {
    if (bankAccount === undefined) {
      return undefined;
    }
    if (bankAccount === null) {
      return null;
    }

    return {
      bankName: this.normalizeRequiredText(
        "bankAccount.bankName",
        bankAccount.bankName,
      ),
      accountName: this.normalizeRequiredText(
        "bankAccount.accountName",
        bankAccount.accountName,
      ),
      accountNumberMasked: this.normalizeRequiredText(
        "bankAccount.accountNumberMasked",
        bankAccount.accountNumberMasked,
      ),
    };
  }

  private clone(profile: DriverProfileRecord): DriverProfileRecord {
    return {
      ...profile,
      emergencyContact: cloneEmergencyContact(profile.emergencyContact),
      bankAccount: cloneBankAccount(profile.bankAccount),
    };
  }

  private persist(profile: DriverProfileRecord, context: string) {
    if (!this.repository) return;

    void this.repository.upsert(profile).catch((error: unknown) => {
      this.repository!.reportPersistenceFailure(error, context);
    });
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
  ) {
    const log = { ...input };
    if (requestId) {
      (log as { requestId?: string }).requestId = requestId;
    }
    this.auditNotificationService.recordAuditLog(log);
  }
}
