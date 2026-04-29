import { Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AuditLogRecord,
  CreateDriverProfileCommand,
  DriverDeviceBindingSummary,
  DriverProfileBankAccount,
  DriverProfileEmergencyContact,
  DriverProfileRecord,
  UpdateDriverProfileCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import {
  maskEmail,
  maskName,
  maskPhone,
} from "../../common/sensitive-data-policy";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { DriverProfileRepository } from "./driver-profile.repository";

const DEMO_DRIVER_ALIASES: Record<string, string> = {
  "demo-driver": "drv-demo-001",
  "driver-demo-001": "drv-demo-001",
};

const DRIVER_PROFILE_SEED: DriverProfileRecord[] = [
  {
    driverId: "drv-demo-001",
    name: "Driver Demo One",
    phone: "+886-912-000-001",
    email: "driver.one@example.com",
    photoUrl: null,
    emergencyContact: {
      name: "Demo Contact One",
      phone: "+886-912-100-001",
      relationship: "spouse",
    },
    bankAccount: {
      bankName: "Demo Bank",
      accountName: "Driver Demo One",
      accountNumberMasked: "****0001",
    },
    deviceBindings: [],
    updatedAt: "2026-04-17T00:00:00.000Z",
  },
  {
    driverId: "drv-demo-002",
    name: "Driver Demo Two",
    phone: "+886-912-000-002",
    email: "driver.two@example.com",
    photoUrl: null,
    emergencyContact: null,
    bankAccount: null,
    deviceBindings: [],
    updatedAt: "2026-04-17T00:00:00.000Z",
  },
  {
    driverId: "drv-demo-003",
    name: "Driver Demo Three",
    phone: null,
    email: null,
    photoUrl: null,
    emergencyContact: null,
    bankAccount: null,
    deviceBindings: [],
    updatedAt: "2026-04-17T00:00:00.000Z",
  },
];

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

function cloneDeviceBindings(
  deviceBindings: readonly DriverDeviceBindingSummary[],
): DriverDeviceBindingSummary[] {
  return deviceBindings.map((binding) => ({ ...binding }));
}

@Injectable()
export class DriverProfileService implements OnModuleInit {
  private readonly seedProfiles = new Map(
    DRIVER_PROFILE_SEED.map((profile) => [
      profile.driverId,
      this.clone(profile),
    ]),
  );

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

  getProfileForDriver(driverId: string) {
    const normalizedDriverId = driverId.trim();
    this.assertDriverId(normalizedDriverId);
    return this.clone(this.resolveBaseProfile(normalizedDriverId));
  }

  findProfileForDriver(driverId: string) {
    const normalizedDriverId = driverId.trim();
    this.assertDriverId(normalizedDriverId);
    const existing =
      this.profiles.get(normalizedDriverId) ??
      this.seedProfiles.get(normalizedDriverId);
    return existing ? this.clone(existing) : null;
  }

  resolveProvisionableDriverId(
    registrationCode?: string | null,
  ): string | null {
    const candidate = registrationCode?.trim();
    if (!candidate) {
      return null;
    }

    const driverId = DEMO_DRIVER_ALIASES[candidate] ?? candidate;
    return this.profileExists(driverId) ? driverId : null;
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
        newValuesSummary: this.buildAuditSummary(created),
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
        oldValuesSummary: this.buildAuditSummary(current),
        newValuesSummary: this.buildAuditSummary(updated),
      },
      requestId,
    );

    return this.clone(updated);
  }

  upsertAdminProfile(
    driverId: string,
    command: CreateDriverProfileCommand,
    requestId?: string,
  ) {
    const normalizedDriverId = driverId.trim();
    this.assertDriverId(normalizedDriverId);
    const hadExistingProfile = this.profileExists(normalizedDriverId);
    const current = this.resolveBaseProfile(normalizedDriverId);
    const updated: DriverProfileRecord = {
      ...current,
      name: this.normalizeRequiredText("name", command.name),
      phone: this.normalizeOptionalText(command.phone) ?? null,
      email: this.normalizeOptionalText(command.email) ?? null,
      photoUrl: this.normalizeOptionalText(command.photoUrl) ?? null,
      emergencyContact:
        this.normalizeEmergencyContact(command.emergencyContact) ?? null,
      bankAccount: this.normalizeBankAccount(command.bankAccount) ?? null,
      updatedAt: new Date().toISOString(),
    };

    this.profiles.set(normalizedDriverId, this.clone(updated));
    this.persist(updated, "upsert_admin_profile");
    this.recordAudit(
      {
        actorId: "platform-admin",
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "driver-profile",
        actionName: hadExistingProfile
          ? "update_driver_profile_admin"
          : "create_driver_profile_admin",
        resourceType: "driver_profile",
        resourceId: normalizedDriverId,
        oldValuesSummary: this.buildAuditSummary(current),
        newValuesSummary: this.buildAuditSummary(updated),
      },
      requestId,
    );

    return this.clone(updated);
  }

  recordDeviceBinding(
    driverId: string,
    binding: DriverDeviceBindingSummary,
    requestId?: string,
  ) {
    const current = this.getProfileForDriver(driverId);
    const updated: DriverProfileRecord = {
      ...current,
      deviceBindings: [
        { ...binding },
        ...current.deviceBindings.filter(
          (candidate) => candidate.bindingId !== binding.bindingId,
        ),
      ],
      updatedAt: new Date().toISOString(),
    };

    this.profiles.set(updated.driverId, this.clone(updated));
    this.persist(updated, "record_device_binding");
    this.recordAudit(
      {
        actorId: updated.driverId,
        actorType: "system",
        tenantId: null,
        moduleName: "driver-profile",
        actionName: "link_driver_device_binding",
        resourceType: "driver_device_binding",
        resourceId: binding.bindingId,
        oldValuesSummary: {
          driverId: updated.driverId,
          deviceBindingCount: current.deviceBindings.length,
        },
        newValuesSummary: {
          driverId: updated.driverId,
          deviceBindingCount: updated.deviceBindings.length,
          deviceId: binding.deviceId,
          bindingStatus: binding.status,
        },
      },
      requestId,
    );

    return this.clone(updated);
  }

  recordDeviceBindingRefresh(
    driverId: string,
    bindingId: string,
    refreshedAt: string,
  ) {
    const current = this.getProfileForDriver(driverId);
    const updated: DriverProfileRecord = {
      ...current,
      deviceBindings: current.deviceBindings.map((binding) =>
        binding.bindingId === bindingId
          ? {
              ...binding,
              refreshedAt,
            }
          : { ...binding },
      ),
      updatedAt: refreshedAt,
    };

    this.profiles.set(updated.driverId, this.clone(updated));
    this.persist(updated, "record_device_binding_refresh");
  }

  recordDeviceBindingRevocation(
    driverId: string,
    bindingId: string,
    revokedAt: string,
    requestId?: string,
  ) {
    const current = this.getProfileForDriver(driverId);
    const updated: DriverProfileRecord = {
      ...current,
      deviceBindings: current.deviceBindings.map((binding) =>
        binding.bindingId === bindingId
          ? {
              ...binding,
              status: "revoked",
              refreshedAt: revokedAt,
              revokedAt,
            }
          : { ...binding },
      ),
      updatedAt: revokedAt,
    };

    this.profiles.set(updated.driverId, this.clone(updated));
    this.persist(updated, "record_device_binding_revocation");
    this.recordAudit(
      {
        actorId: updated.driverId,
        actorType: "system",
        tenantId: null,
        moduleName: "driver-profile",
        actionName: "revoke_driver_device_binding",
        resourceType: "driver_device_binding",
        resourceId: bindingId,
        newValuesSummary: {
          driverId: updated.driverId,
          bindingId,
          revokedAt,
        },
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

    const seeded = this.seedProfiles.get(driverId);
    if (seeded) {
      return this.clone(seeded);
    }

    return this.buildEmptyProfile(driverId);
  }

  private profileExists(driverId: string): boolean {
    return this.profiles.has(driverId) || this.seedProfiles.has(driverId);
  }

  private resolveDriverId(actorId?: string | null): string {
    const candidate = actorId?.trim();
    this.assertDriverId(candidate);
    return DEMO_DRIVER_ALIASES[candidate!] ?? candidate!;
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
      deviceBindings: [],
      updatedAt: new Date().toISOString(),
    };
  }

  private assertDriverId(driverId?: string | null) {
    if (!driverId) {
      throw new ApiRequestError(
        401,
        "DRIVER_IDENTITY_REQUIRED",
        "Driver profile routes require a bootstrap identity with a driver actorId.",
      );
    }
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
      deviceBindings: cloneDeviceBindings(profile.deviceBindings),
    };
  }

  private buildAuditSummary(profile: DriverProfileRecord) {
    return {
      driverId: profile.driverId,
      name: maskName(profile.name),
      phone: maskPhone(profile.phone),
      email: maskEmail(profile.email),
      photoConfigured: profile.photoUrl !== null,
      emergencyContact: profile.emergencyContact
        ? {
            name: maskName(profile.emergencyContact.name),
            phone: maskPhone(profile.emergencyContact.phone),
            relationship: profile.emergencyContact.relationship,
          }
        : null,
      bankAccount: profile.bankAccount
        ? {
            bankName: profile.bankAccount.bankName,
            accountName: maskName(profile.bankAccount.accountName),
            accountNumberMasked: profile.bankAccount.accountNumberMasked,
          }
        : null,
      deviceBindings: profile.deviceBindings.map((binding) => ({
        bindingId: binding.bindingId,
        deviceId: binding.deviceId,
        deviceLabel: binding.deviceLabel,
        status: binding.status,
        issuedAt: binding.issuedAt,
        refreshedAt: binding.refreshedAt,
        revokedAt: binding.revokedAt,
      })),
      updatedAt: profile.updatedAt,
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
