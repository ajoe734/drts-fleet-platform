import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AuditLogRecord,
  CreateDriverFleetAffiliationCommand,
  CreateFleetPartnerCommand,
  DriverFleetAffiliationRecord,
  DriverFleetAffiliationType,
  FleetPartnerDriverRecord,
  FleetPartnerRecord,
  FleetPartnershipType,
  UpdateFleetPartnerCommand,
} from "@drts/contracts";
import {
  DRIVER_FLEET_AFFILIATION_TYPES,
  FLEET_PARTNERSHIP_TYPES,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { maskPhone } from "../../common/sensitive-data-policy";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { DriverProfileService } from "../driver-profile/driver-profile.service";
import { FleetPartnerRepository } from "./fleet-partner.repository";

const FLEET_PARTNER_SEED: FleetPartnerRecord[] = [
  {
    fleetPartnerId: "fleet-demo-001",
    legalName: "Demo Fleet Management Co., Ltd.",
    displayName: "Demo Fleet One",
    businessRegistrationNo: "DEMO-FLEET-001",
    contactName: "Fleet Ops One",
    contactPhone: "+886-2-7700-1001",
    active: true,
    partnershipType: "fleet_management",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  },
  {
    fleetPartnerId: "fleet-demo-002",
    legalName: "Demo Recruitment Partners Inc.",
    displayName: "Recruitment Fleet Two",
    businessRegistrationNo: "DEMO-FLEET-002",
    contactName: "Fleet Ops Two",
    contactPhone: "+886-2-7700-1002",
    active: true,
    partnershipType: "driver_recruitment",
    createdAt: "2026-05-02T00:00:00.000Z",
    updatedAt: "2026-05-02T00:00:00.000Z",
  },
];

const DRIVER_FLEET_AFFILIATION_SEED: DriverFleetAffiliationRecord[] = [
  {
    affiliationId: "dfa-demo-001",
    driverId: "drv-demo-001",
    fleetPartnerId: "fleet-demo-001",
    affiliationType: "managed_by",
    effectiveFrom: "2026-05-01T00:00:00.000Z",
    effectiveUntil: null,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  },
  {
    affiliationId: "dfa-demo-002",
    driverId: "drv-demo-002",
    fleetPartnerId: "fleet-demo-002",
    affiliationType: "recruited_by",
    effectiveFrom: "2026-05-03T00:00:00.000Z",
    effectiveUntil: null,
    createdAt: "2026-05-03T00:00:00.000Z",
    updatedAt: "2026-05-03T00:00:00.000Z",
  },
];

type FleetPartnerAuditActor = Pick<
  AuditLogRecord,
  "actorId" | "actorType" | "tenantId"
>;

@Injectable()
export class FleetPartnerService implements OnModuleInit {
  private readonly seedPartners = new Map(
    FLEET_PARTNER_SEED.map((partner) => [partner.fleetPartnerId, partner]),
  );
  private readonly seedAffiliations = new Map(
    DRIVER_FLEET_AFFILIATION_SEED.map((affiliation) => [
      affiliation.affiliationId,
      affiliation,
    ]),
  );
  private readonly partners = new Map<string, FleetPartnerRecord>();
  private readonly affiliations = new Map<
    string,
    DriverFleetAffiliationRecord
  >();

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    private readonly driverProfileService: DriverProfileService,
    @Optional() private readonly repository?: FleetPartnerRepository,
  ) {}

  async onModuleInit() {
    if (!this.repository) {
      return;
    }

    try {
      const [partners, affiliations] = await Promise.all([
        this.repository.loadFleetPartners(),
        this.repository.loadDriverFleetAffiliations(),
      ]);
      for (const partner of partners) {
        this.partners.set(partner.fleetPartnerId, this.clonePartner(partner));
      }
      for (const affiliation of affiliations) {
        this.affiliations.set(
          affiliation.affiliationId,
          this.cloneAffiliation(affiliation),
        );
      }
    } catch (error) {
      this.repository.reportPersistenceFailure(error, "module init");
    }
  }

  listFleetPartners() {
    return this.getAllPartners().sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  }

  getFleetPartner(fleetPartnerId: string) {
    return this.clonePartner(this.requireFleetPartner(fleetPartnerId));
  }

  createFleetPartner(
    command: CreateFleetPartnerCommand,
    actor: FleetPartnerAuditActor = this.defaultAuditActor(),
    requestId?: string,
  ) {
    this.assertPartnershipType(command.partnershipType);
    const businessRegistrationNo = this.normalizeRegistrationNumber(
      command.businessRegistrationNo,
    );
    this.assertBusinessRegistrationAvailable(businessRegistrationNo);

    const now = new Date().toISOString();
    const created: FleetPartnerRecord = {
      fleetPartnerId: `fleet-${randomUUID().slice(0, 8)}`,
      legalName: this.requireNonBlank(command.legalName, "legalName"),
      displayName: this.requireNonBlank(command.displayName, "displayName"),
      businessRegistrationNo,
      contactName: this.requireNonBlank(command.contactName, "contactName"),
      contactPhone: this.requireNonBlank(command.contactPhone, "contactPhone"),
      active: command.active ?? true,
      partnershipType: command.partnershipType,
      createdAt: now,
      updatedAt: now,
    };

    this.partners.set(created.fleetPartnerId, this.clonePartner(created));
    this.persistFleetPartner(created, "create_fleet_partner");
    this.recordAudit(
      {
        ...actor,
        moduleName: "fleet-partner",
        actionName: "create_fleet_partner",
        resourceType: "fleet_partner",
        resourceId: created.fleetPartnerId,
        newValuesSummary: this.buildPartnerAuditSummary(created),
      },
      requestId,
    );

    return this.clonePartner(created);
  }

  updateFleetPartner(
    fleetPartnerId: string,
    command: UpdateFleetPartnerCommand,
    actor: FleetPartnerAuditActor = this.defaultAuditActor(),
    requestId?: string,
  ) {
    const current = this.requireFleetPartner(fleetPartnerId);
    const nextRegistrationNo =
      command.businessRegistrationNo === undefined
        ? current.businessRegistrationNo
        : this.normalizeRegistrationNumber(command.businessRegistrationNo);
    this.assertBusinessRegistrationAvailable(
      nextRegistrationNo,
      fleetPartnerId,
    );
    if (command.partnershipType !== undefined) {
      this.assertPartnershipType(command.partnershipType);
    }

    const updated: FleetPartnerRecord = {
      ...current,
      ...(command.legalName !== undefined && {
        legalName: this.requireNonBlank(command.legalName, "legalName"),
      }),
      ...(command.displayName !== undefined && {
        displayName: this.requireNonBlank(command.displayName, "displayName"),
      }),
      ...(command.businessRegistrationNo !== undefined && {
        businessRegistrationNo: nextRegistrationNo,
      }),
      ...(command.contactName !== undefined && {
        contactName: this.requireNonBlank(command.contactName, "contactName"),
      }),
      ...(command.contactPhone !== undefined && {
        contactPhone: this.requireNonBlank(
          command.contactPhone,
          "contactPhone",
        ),
      }),
      ...(command.active !== undefined && {
        active: command.active,
      }),
      ...(command.partnershipType !== undefined && {
        partnershipType: command.partnershipType,
      }),
      updatedAt: new Date().toISOString(),
    };

    this.partners.set(updated.fleetPartnerId, this.clonePartner(updated));
    this.persistFleetPartner(updated, "update_fleet_partner");
    this.recordAudit(
      {
        ...actor,
        moduleName: "fleet-partner",
        actionName: "update_fleet_partner",
        resourceType: "fleet_partner",
        resourceId: updated.fleetPartnerId,
        oldValuesSummary: this.buildPartnerAuditSummary(current),
        newValuesSummary: this.buildPartnerAuditSummary(updated),
      },
      requestId,
    );

    return this.clonePartner(updated);
  }

  listFleetPartnerDrivers(fleetPartnerId: string) {
    this.requireFleetPartner(fleetPartnerId);
    return this.getAllAffiliations()
      .filter((affiliation) => affiliation.fleetPartnerId === fleetPartnerId)
      .map((affiliation) => {
        const profile = this.driverProfileService.findProfileForDriver(
          affiliation.driverId,
        );
        return {
          affiliationId: affiliation.affiliationId,
          driverId: affiliation.driverId,
          driverName: profile?.name ?? affiliation.driverId,
          driverPhone: profile?.phone ?? null,
          fleetPartnerId: affiliation.fleetPartnerId,
          affiliationType: affiliation.affiliationType,
          effectiveFrom: affiliation.effectiveFrom,
          effectiveUntil: affiliation.effectiveUntil,
        } satisfies FleetPartnerDriverRecord;
      })
      .sort((left, right) => {
        if (left.effectiveUntil === null && right.effectiveUntil !== null) {
          return -1;
        }
        if (left.effectiveUntil !== null && right.effectiveUntil === null) {
          return 1;
        }
        return right.effectiveFrom.localeCompare(left.effectiveFrom);
      });
  }

  createDriverFleetAffiliation(
    driverId: string,
    command: CreateDriverFleetAffiliationCommand,
    actor: FleetPartnerAuditActor = this.defaultAuditActor(),
    requestId?: string,
  ) {
    const normalizedDriverId = this.requireNonBlank(driverId, "driverId");
    const driverProfile =
      this.driverProfileService.findProfileForDriver(normalizedDriverId);
    if (!driverProfile) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "DRIVER_NOT_FOUND",
        "The driver could not be found.",
        { driverId: normalizedDriverId },
      );
    }

    this.assertAffiliationType(command.affiliationType);
    const fleetPartner = this.requireFleetPartner(command.fleetPartnerId);
    const effectiveFrom = this.normalizeIsoDate(
      command.effectiveFrom,
      "effectiveFrom",
    );
    const effectiveUntil =
      command.effectiveUntil === undefined || command.effectiveUntil === null
        ? null
        : this.normalizeIsoDate(command.effectiveUntil, "effectiveUntil");

    if (effectiveUntil !== null && effectiveUntil <= effectiveFrom) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FLEET_AFFILIATION_RANGE_INVALID",
        "effectiveUntil must be later than effectiveFrom.",
        { effectiveFrom, effectiveUntil },
      );
    }

    this.assertAffiliationDoesNotOverlap(
      normalizedDriverId,
      command.affiliationType,
      effectiveFrom,
      effectiveUntil,
    );

    const now = new Date().toISOString();
    const created: DriverFleetAffiliationRecord = {
      affiliationId: `dfa-${randomUUID().slice(0, 8)}`,
      driverId: normalizedDriverId,
      fleetPartnerId: fleetPartner.fleetPartnerId,
      affiliationType: command.affiliationType,
      effectiveFrom,
      effectiveUntil,
      createdAt: now,
      updatedAt: now,
    };

    this.affiliations.set(
      created.affiliationId,
      this.cloneAffiliation(created),
    );
    this.persistAffiliation(created, "create_driver_fleet_affiliation");
    this.recordAudit(
      {
        ...actor,
        moduleName: "fleet-partner",
        actionName: "create_driver_fleet_affiliation",
        resourceType: "driver_fleet_affiliation",
        resourceId: created.affiliationId,
        newValuesSummary: {
          driverId: created.driverId,
          driverName: driverProfile.name,
          fleetPartnerId: created.fleetPartnerId,
          fleetPartnerDisplayName: fleetPartner.displayName,
          affiliationType: created.affiliationType,
          effectiveFrom: created.effectiveFrom,
          effectiveUntil: created.effectiveUntil,
        },
      },
      requestId,
    );

    return this.cloneAffiliation(created);
  }

  private getAllPartners() {
    const merged = new Map<string, FleetPartnerRecord>();
    for (const partner of this.seedPartners.values()) {
      merged.set(partner.fleetPartnerId, this.clonePartner(partner));
    }
    for (const partner of this.partners.values()) {
      merged.set(partner.fleetPartnerId, this.clonePartner(partner));
    }
    return [...merged.values()];
  }

  private getAllAffiliations() {
    const merged = new Map<string, DriverFleetAffiliationRecord>();
    for (const affiliation of this.seedAffiliations.values()) {
      merged.set(affiliation.affiliationId, this.cloneAffiliation(affiliation));
    }
    for (const affiliation of this.affiliations.values()) {
      merged.set(affiliation.affiliationId, this.cloneAffiliation(affiliation));
    }
    return [...merged.values()];
  }

  private requireFleetPartner(fleetPartnerId: string) {
    const normalizedFleetPartnerId = this.requireNonBlank(
      fleetPartnerId,
      "fleetPartnerId",
    );
    const existing =
      this.partners.get(normalizedFleetPartnerId) ??
      this.seedPartners.get(normalizedFleetPartnerId);
    if (!existing) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "FLEET_PARTNER_NOT_FOUND",
        "The fleet partner could not be found.",
        { fleetPartnerId: normalizedFleetPartnerId },
      );
    }
    return this.clonePartner(existing);
  }

  private assertBusinessRegistrationAvailable(
    businessRegistrationNo: string,
    excludedFleetPartnerId?: string,
  ) {
    const conflict = this.getAllPartners().find(
      (partner) =>
        partner.businessRegistrationNo === businessRegistrationNo &&
        partner.fleetPartnerId !== excludedFleetPartnerId,
    );
    if (conflict) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "FLEET_PARTNER_REGISTRATION_CONFLICT",
        "The business registration number is already assigned to another fleet partner.",
        {
          businessRegistrationNo,
          fleetPartnerId: conflict.fleetPartnerId,
        },
      );
    }
  }

  private assertAffiliationDoesNotOverlap(
    driverId: string,
    affiliationType: DriverFleetAffiliationType,
    effectiveFrom: string,
    effectiveUntil: string | null,
  ) {
    const rangeStart = Date.parse(effectiveFrom);
    const rangeEnd =
      effectiveUntil === null
        ? Number.POSITIVE_INFINITY
        : Date.parse(effectiveUntil);
    const conflict = this.getAllAffiliations().find((affiliation) => {
      if (
        affiliation.driverId !== driverId ||
        affiliation.affiliationType !== affiliationType
      ) {
        return false;
      }
      const existingStart = Date.parse(affiliation.effectiveFrom);
      const existingEnd =
        affiliation.effectiveUntil === null
          ? Number.POSITIVE_INFINITY
          : Date.parse(affiliation.effectiveUntil);
      return rangeStart < existingEnd && existingStart < rangeEnd;
    });

    if (conflict) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "FLEET_AFFILIATION_OVERLAP",
        "The driver already has an overlapping affiliation for this affiliation type.",
        {
          driverId,
          affiliationType,
          conflictAffiliationId: conflict.affiliationId,
        },
      );
    }
  }

  private assertPartnershipType(
    partnershipType: FleetPartnershipType | string,
  ): asserts partnershipType is FleetPartnershipType {
    if (
      !FLEET_PARTNERSHIP_TYPES.includes(partnershipType as FleetPartnershipType)
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FLEET_PARTNERSHIP_TYPE_INVALID",
        "The fleet partnership type is invalid.",
        { partnershipType },
      );
    }
  }

  private assertAffiliationType(
    affiliationType: DriverFleetAffiliationType | string,
  ): asserts affiliationType is DriverFleetAffiliationType {
    if (
      !DRIVER_FLEET_AFFILIATION_TYPES.includes(
        affiliationType as DriverFleetAffiliationType,
      )
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "DRIVER_FLEET_AFFILIATION_TYPE_INVALID",
        "The driver fleet affiliation type is invalid.",
        { affiliationType },
      );
    }
  }

  private buildPartnerAuditSummary(partner: FleetPartnerRecord) {
    return {
      legalName: partner.legalName,
      displayName: partner.displayName,
      businessRegistrationNo: partner.businessRegistrationNo,
      contactName: partner.contactName,
      contactPhone: maskPhone(partner.contactPhone),
      active: partner.active,
      partnershipType: partner.partnershipType,
    };
  }

  private normalizeRegistrationNumber(value: string) {
    return this.requireNonBlank(value, "businessRegistrationNo").toUpperCase();
  }

  private normalizeIsoDate(value: string, field: string) {
    const normalized = this.requireNonBlank(value, field);
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_DATE",
        `${field} must be a valid ISO-8601 date string.`,
        { field, value: normalized },
      );
    }
    return date.toISOString();
  }

  private requireNonBlank(value: string, field: string) {
    const normalized = value.trim();
    if (!normalized) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FIELD_REQUIRED",
        `${field} is required.`,
        { field },
      );
    }
    return normalized;
  }

  private persistFleetPartner(partner: FleetPartnerRecord, context: string) {
    if (!this.repository) {
      return;
    }

    void this.repository.upsertFleetPartner(partner).catch((error: unknown) => {
      this.repository!.reportPersistenceFailure(error, context);
    });
  }

  private persistAffiliation(
    affiliation: DriverFleetAffiliationRecord,
    context: string,
  ) {
    if (!this.repository) {
      return;
    }

    void this.repository
      .upsertDriverFleetAffiliation(affiliation)
      .catch((error: unknown) => {
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

  private defaultAuditActor(): FleetPartnerAuditActor {
    return {
      actorId: "platform-admin",
      actorType: "platform_admin",
      tenantId: null,
    };
  }

  private clonePartner(partner: FleetPartnerRecord): FleetPartnerRecord {
    return { ...partner };
  }

  private cloneAffiliation(
    affiliation: DriverFleetAffiliationRecord,
  ): DriverFleetAffiliationRecord {
    return { ...affiliation };
  }
}
