import { Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  ActionReceipt,
  AuditLogRecord,
  ApprovedOperatingAreaRecord,
  ApprovedRouteRecord,
  ApprovedAreaMatchRecord,
  GeoJsonMultiLineString,
  GeoJsonMultiPolygon,
  GeoJsonPosition,
  IdentityContext,
  Phase2AuditContext,
  Phase2ProviderCapability,
  ProviderCapabilityRequirement,
  SafetyOperatorQualificationRecord,
  SafetyOperatorQualificationStatus,
  UpsertApprovedOperatingAreasCommand,
  UpsertApprovedRoutesCommand,
  UpsertSafetyOperatorQualificationsCommand,
  UpsertVehicleEnrollmentsCommand,
  ValidateOperatingAreaPointCommand,
  ValidateOperatingAreaPointResult,
  ValidateRouteContainmentCommand,
  ValidateRouteContainmentResult,
  VehicleEnrollmentRecord,
  VehicleEnrollmentStatus,
} from "@drts/contracts";
import {
  PHASE2_AUDIT_EVENT_CATALOG,
  PHASE2_PROVIDER_CAPABILITIES,
  SAFETY_OPERATOR_QUALIFICATION_STATUSES,
  SANDBOX_HOLIDAY_POLICIES,
  SANDBOX_OPERATING_AREA_KINDS,
  VEHICLE_ENROLLMENT_STATUSES,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { emitPhase2AuditedAction } from "../../common/phase2-audit";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { SandboxGovernanceRepository } from "./sandbox-governance.repository";

type AuditActor = Pick<IdentityContext, "actorId" | "tenantId"> & {
  actorType: AuditLogRecord["actorType"];
};

type ProviderCapabilityRequirementAuditContext = Pick<
  Phase2AuditContext,
  "actorId" | "actorType" | "tenantId" | "moduleName" | "requestId"
>;

export interface SandboxProviderCapabilityRequirementRecord
  extends ProviderCapabilityRequirement {
  requirementId: string;
  sandboxProgramId: string;
}

interface StoredProviderCapabilityRequirementRecord
  extends SandboxProviderCapabilityRequirementRecord {
  latestAuditId: string;
  resourceVersion: number;
}

export interface UpsertProviderCapabilityRequirementCommand {
  sandboxProgramId: string;
  capability: Phase2ProviderCapability;
  required: boolean;
  minSchemaVersion?: string | null;
  notes?: string | null;
  auditContext: ProviderCapabilityRequirementAuditContext;
}

export interface UpsertProviderCapabilityRequirementResult {
  requirement: SandboxProviderCapabilityRequirementRecord;
  receipt: ActionReceipt;
  auditLog: AuditLogRecord;
}

const SANDBOX_PROGRAM_ID = "phase2-tesla-fsd-sandbox-202606";
const SEED_TIMESTAMP = "2026-06-26T00:00:00.000Z";
const DEFAULT_ROUTE_TOLERANCE_METERS = 25;
const DAY_SET = new Set([0, 1, 2, 3, 4, 5, 6]);
const HOLIDAY_POLICY_SET = new Set<string>(SANDBOX_HOLIDAY_POLICIES);
const AREA_KIND_SET = new Set<string>(SANDBOX_OPERATING_AREA_KINDS);
const VEHICLE_STATUS_SET = new Set<string>(VEHICLE_ENROLLMENT_STATUSES);
const OPERATOR_STATUS_SET = new Set<string>(
  SAFETY_OPERATOR_QUALIFICATION_STATUSES,
);

const DEFAULT_SCHEDULE = [
  {
    scheduleId: "sched-odd-weekday",
    version: 1,
    active: true,
    daysOfWeek: [1, 2, 3, 4, 5],
    startLocalTime: "06:00",
    endLocalTime: "22:00",
    exceptionDates: [],
    holidayPolicy: "closed" as const,
    maxConcurrentVehicles: 4,
    effectiveFrom: SEED_TIMESTAMP,
    effectiveUntil: null,
  },
];

const DEFAULT_OPERATING_AREAS: ApprovedOperatingAreaRecord[] = [
  {
    areaId: "odd-downtown-core",
    sandboxProgramId: SANDBOX_PROGRAM_ID,
    name: "Downtown core ODD",
    areaKind: "operating_area",
    version: 1,
    active: true,
    geometry: {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [121.5205, 25.0425],
            [121.5355, 25.0425],
            [121.5355, 25.0565],
            [121.5205, 25.0565],
            [121.5205, 25.0425],
          ],
        ],
      ],
    },
    schedules: DEFAULT_SCHEDULE,
    effectiveFrom: SEED_TIMESTAMP,
    effectiveUntil: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    areaId: "pickup-zone-main-station",
    sandboxProgramId: SANDBOX_PROGRAM_ID,
    name: "Main station pickup zone",
    areaKind: "pickup_dropoff_zone",
    version: 1,
    active: true,
    geometry: {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [121.5245, 25.0465],
            [121.5265, 25.0465],
            [121.5265, 25.0485],
            [121.5245, 25.0485],
            [121.5245, 25.0465],
          ],
        ],
      ],
    },
    schedules: DEFAULT_SCHEDULE,
    effectiveFrom: SEED_TIMESTAMP,
    effectiveUntil: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
];

const DEFAULT_ROUTES: ApprovedRouteRecord[] = [
  {
    routeId: "route-downtown-loop",
    sandboxProgramId: SANDBOX_PROGRAM_ID,
    name: "Downtown loop",
    areaId: "odd-downtown-core",
    version: 1,
    active: true,
    geometry: {
      type: "MultiLineString",
      coordinates: [
        [
          [121.522, 25.044],
          [121.526, 25.047],
          [121.529, 25.05],
          [121.533, 25.054],
        ],
      ],
    },
    schedules: DEFAULT_SCHEDULE,
    effectiveFrom: SEED_TIMESTAMP,
    effectiveUntil: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
];

const DEFAULT_VEHICLE_ENROLLMENTS: VehicleEnrollmentRecord[] = [
  {
    enrollmentId: "veh-enroll-001",
    sandboxProgramId: SANDBOX_PROGRAM_ID,
    vehicleId: "veh-av-demo-001",
    providerCode: "tesla_fleet",
    version: 1,
    status: "active",
    approvedAreaIds: ["odd-downtown-core"],
    approvedRouteIds: ["route-downtown-loop"],
    maxConcurrentTrips: 1,
    effectiveFrom: SEED_TIMESTAMP,
    effectiveUntil: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
];

const DEFAULT_OPERATOR_QUALIFICATIONS: SafetyOperatorQualificationRecord[] = [
  {
    qualificationId: "safety-op-qual-001",
    sandboxProgramId: SANDBOX_PROGRAM_ID,
    safetyOperatorId: "safety-op-001",
    providerCode: "tesla_fleet",
    version: 1,
    status: "qualified",
    approvedAreaIds: ["odd-downtown-core"],
    approvedRouteIds: ["route-downtown-loop"],
    certificationRefs: ["cert-av-001"],
    effectiveFrom: SEED_TIMESTAMP,
    effectiveUntil: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
];

const VEHICLE_STATUS_TRANSITIONS: Record<
  VehicleEnrollmentStatus,
  readonly VehicleEnrollmentStatus[]
> = {
  pending: ["pending", "active", "suspended", "revoked", "expired"],
  active: ["active", "suspended", "revoked", "expired"],
  suspended: ["suspended", "active", "revoked", "expired"],
  revoked: ["revoked"],
  expired: ["expired"],
};

const OPERATOR_STATUS_TRANSITIONS: Record<
  SafetyOperatorQualificationStatus,
  readonly SafetyOperatorQualificationStatus[]
> = {
  pending: ["pending", "qualified", "suspended", "revoked", "expired"],
  qualified: ["qualified", "suspended", "revoked", "expired"],
  suspended: ["suspended", "qualified", "revoked", "expired"],
  revoked: ["revoked"],
  expired: ["expired"],
};

@Injectable()
export class SandboxGovernanceService implements OnModuleInit {
  private operatingAreas: ApprovedOperatingAreaRecord[] = cloneList(
    DEFAULT_OPERATING_AREAS,
  );
  private routes: ApprovedRouteRecord[] = cloneList(DEFAULT_ROUTES);
  private vehicleEnrollments: VehicleEnrollmentRecord[] = cloneList(
    DEFAULT_VEHICLE_ENROLLMENTS,
  );
  private safetyOperatorQualifications: SafetyOperatorQualificationRecord[] =
    cloneList(DEFAULT_OPERATOR_QUALIFICATIONS);
  private requirements: StoredProviderCapabilityRequirementRecord[] = [];

  constructor(
    @Optional()
    private readonly auditNotificationService?: AuditNotificationService,
    @Optional()
    private readonly repository?: SandboxGovernanceRepository,
  ) {}

  async onModuleInit() {
    if (!this.repository) {
      return;
    }

    try {
      const [areas, routes, enrollments, qualifications] = await Promise.all([
        this.repository.loadOperatingAreas(),
        this.repository.loadRoutes(),
        this.repository.loadVehicleEnrollments(),
        this.repository.loadSafetyOperatorQualifications(),
      ]);

      this.operatingAreas = cloneList(areas);
      this.routes = cloneList(routes);
      this.vehicleEnrollments = cloneList(enrollments);
      this.safetyOperatorQualifications = cloneList(qualifications);
    } catch (error) {
      this.repository.reportPersistenceFailure(error, "module init");
    }
  }

  upsertProviderCapabilityRequirement(
    command: UpsertProviderCapabilityRequirementCommand,
  ): UpsertProviderCapabilityRequirementResult {
    if (!PHASE2_PROVIDER_CAPABILITIES.includes(command.capability)) {
      throw new Error(`Unsupported provider capability: ${command.capability}`);
    }
    if (!this.auditNotificationService) {
      throw new Error(
        "AuditNotificationService is required for provider capability requirement writes.",
      );
    }

    const requirementId = `${command.sandboxProgramId}:${command.capability}`;
    const existing =
      this.requirements.find(
        (candidate) => candidate.requirementId === requirementId,
      ) ?? null;
    const requirement: SandboxProviderCapabilityRequirementRecord = {
      requirementId,
      sandboxProgramId: command.sandboxProgramId,
      capability: command.capability,
      required: command.required,
      minSchemaVersion: command.minSchemaVersion ?? null,
      notes: command.notes ?? null,
    };
    const nextResourceVersion = existing ? existing.resourceVersion + 1 : 1;

    const result = emitPhase2AuditedAction({
      sink: this.auditNotificationService,
      audit: {
        ...command.auditContext,
        eventName: existing
          ? PHASE2_AUDIT_EVENT_CATALOG.sandbox
              .providerCapabilityRequirementAmended
          : PHASE2_AUDIT_EVENT_CATALOG.sandbox
              .providerCapabilityRequirementConfigured,
        resourceType: "provider_capability_requirement",
        resourceId: requirement.requirementId,
        summary: this.buildRequirementAuditSummary(requirement),
        ...(existing
          ? {
              previousSummary: this.buildRequirementAuditSummary(existing),
              supersedesAuditId: existing.latestAuditId,
              amendsResourceVersion: this.formatResourceVersion(
                existing.resourceVersion,
              ),
            }
          : {}),
        resourceVersion: this.formatResourceVersion(nextResourceVersion),
      },
      data: requirement,
      message: existing
        ? "Provider capability requirement amended."
        : "Provider capability requirement configured.",
    });

    const storedRequirement: StoredProviderCapabilityRequirementRecord = {
      ...result.data,
      latestAuditId: result.auditLog.auditId,
      resourceVersion: nextResourceVersion,
    };

    this.requirements = existing
      ? this.requirements.map((candidate) =>
          candidate.requirementId === storedRequirement.requirementId
            ? storedRequirement
            : candidate,
        )
      : [...this.requirements, storedRequirement];

    return {
      requirement: result.data,
      receipt: result.receipt,
      auditLog: result.auditLog,
    };
  }

  listOperatingAreas() {
    return cloneList(this.operatingAreas);
  }

  async updateOperatingAreas(
    command: UpsertApprovedOperatingAreasCommand,
    actor: AuditActor,
    requestId?: string,
  ) {
    if (!command || !Array.isArray(command.items)) {
      throw new ApiRequestError(
        400,
        "INVALID_APPROVED_OPERATING_AREAS",
        "Operating areas payload must provide an items array.",
      );
    }

    const next = command.items.map((item) => this.validateOperatingArea(item));
    ensureUniqueVersionedRecords(
      next,
      (item) => item.areaId,
      "DUPLICATE_OPERATING_AREA_VERSION",
    );
    assertNonOverlappingEffectiveWindows(
      next,
      (item) => item.areaId,
      "OVERLAPPING_OPERATING_AREA_EFFECTIVE_WINDOW",
    );
    next.forEach((item) => validateSchedules(item.schedules, item.areaId));
    const previous = cloneList(this.operatingAreas);
    const persisted = sortVersionedRecords(next, (item) => item.areaId);
    this.operatingAreas = persisted;
    await this.persist(
      () => this.repository?.replaceOperatingAreas(this.operatingAreas),
      () => {
        this.operatingAreas = previous;
      },
      "replace areas",
    );
    this.recordAudit(
      "sandbox_governance.operating_areas_updated",
      "approved_operating_area",
      "all",
      actor,
      requestId,
      { count: next.length },
    );
    return cloneList(this.operatingAreas);
  }

  listRoutes() {
    return cloneList(this.routes);
  }

  async updateRoutes(
    command: UpsertApprovedRoutesCommand,
    actor: AuditActor,
    requestId?: string,
  ) {
    if (!command || !Array.isArray(command.items)) {
      throw new ApiRequestError(
        400,
        "INVALID_APPROVED_ROUTES",
        "Approved routes payload must provide an items array.",
      );
    }

    const knownAreaIds = new Set(this.operatingAreas.map((item) => item.areaId));
    const next = command.items.map((item) => this.validateRoute(item, knownAreaIds));
    ensureUniqueVersionedRecords(
      next,
      (item) => item.routeId,
      "DUPLICATE_APPROVED_ROUTE_VERSION",
    );
    assertNonOverlappingEffectiveWindows(
      next,
      (item) => item.routeId,
      "OVERLAPPING_APPROVED_ROUTE_EFFECTIVE_WINDOW",
    );
    next.forEach((item) => validateSchedules(item.schedules, item.routeId));
    const previous = cloneList(this.routes);
    const persisted = sortVersionedRecords(next, (item) => item.routeId);
    this.routes = persisted;
    await this.persist(
      () => this.repository?.replaceRoutes(this.routes),
      () => {
        this.routes = previous;
      },
      "replace routes",
    );
    this.recordAudit(
      "sandbox_governance.approved_routes_updated",
      "approved_route",
      "all",
      actor,
      requestId,
      { count: next.length },
    );
    return cloneList(this.routes);
  }

  listVehicleEnrollments() {
    return cloneList(this.vehicleEnrollments);
  }

  async updateVehicleEnrollments(
    command: UpsertVehicleEnrollmentsCommand,
    actor: AuditActor,
    requestId?: string,
  ) {
    if (!command || !Array.isArray(command.items)) {
      throw new ApiRequestError(
        400,
        "INVALID_VEHICLE_ENROLLMENTS",
        "Vehicle enrollments payload must provide an items array.",
      );
    }

    const next = command.items.map((item) => this.validateVehicleEnrollment(item));
    ensureUniqueVersionedRecords(
      next,
      (item) => item.enrollmentId,
      "DUPLICATE_VEHICLE_ENROLLMENT_VERSION",
    );
    assertNonOverlappingEffectiveWindows(
      next,
      (item) => item.enrollmentId,
      "OVERLAPPING_VEHICLE_ENROLLMENT_EFFECTIVE_WINDOW",
    );
    assertVersionedStatusTransitions(
      next,
      this.vehicleEnrollments,
      (item) => item.enrollmentId,
      VEHICLE_STATUS_TRANSITIONS,
      "INVALID_VEHICLE_ENROLLMENT_TRANSITION",
    );
    const previous = cloneList(this.vehicleEnrollments);
    const persisted = sortVersionedRecords(next, (item) => item.enrollmentId);
    this.vehicleEnrollments = persisted;
    await this.persist(
      () => this.repository?.replaceVehicleEnrollments(this.vehicleEnrollments),
      () => {
        this.vehicleEnrollments = previous;
      },
      "replace vehicle enrollments",
    );
    this.recordAudit(
      "sandbox_governance.vehicle_enrollments_updated",
      "vehicle_enrollment",
      "all",
      actor,
      requestId,
      { count: next.length },
    );
    return cloneList(this.vehicleEnrollments);
  }

  listSafetyOperatorQualifications() {
    return cloneList(this.safetyOperatorQualifications);
  }

  async updateSafetyOperatorQualifications(
    command: UpsertSafetyOperatorQualificationsCommand,
    actor: AuditActor,
    requestId?: string,
  ) {
    if (!command || !Array.isArray(command.items)) {
      throw new ApiRequestError(
        400,
        "INVALID_SAFETY_OPERATOR_QUALIFICATIONS",
        "Safety operator qualifications payload must provide an items array.",
      );
    }

    const next = command.items.map((item) =>
      this.validateSafetyOperatorQualification(item),
    );
    ensureUniqueVersionedRecords(
      next,
      (item) => item.qualificationId,
      "DUPLICATE_SAFETY_OPERATOR_QUALIFICATION_VERSION",
    );
    assertNonOverlappingEffectiveWindows(
      next,
      (item) => item.qualificationId,
      "OVERLAPPING_SAFETY_OPERATOR_QUALIFICATION_EFFECTIVE_WINDOW",
    );
    assertVersionedStatusTransitions(
      next,
      this.safetyOperatorQualifications,
      (item) => item.qualificationId,
      OPERATOR_STATUS_TRANSITIONS,
      "INVALID_SAFETY_OPERATOR_QUALIFICATION_TRANSITION",
    );
    const previous = cloneList(this.safetyOperatorQualifications);
    const persisted = sortVersionedRecords(
      next,
      (item) => item.qualificationId,
    );
    this.safetyOperatorQualifications = persisted;
    await this.persist(
      () =>
        this.repository?.replaceSafetyOperatorQualifications(
          this.safetyOperatorQualifications,
        ),
      () => {
        this.safetyOperatorQualifications = previous;
      },
      "replace safety operator qualifications",
    );
    this.recordAudit(
      "sandbox_governance.safety_operator_qualifications_updated",
      "safety_operator_qualification",
      "all",
      actor,
      requestId,
      { count: next.length },
    );
    return cloneList(this.safetyOperatorQualifications);
  }

  async validatePointInApprovedArea(
    command: ValidateOperatingAreaPointCommand,
  ): Promise<ValidateOperatingAreaPointResult> {
    if (!command?.sandboxProgramId || !command.point) {
      throw new ApiRequestError(
        400,
        "INVALID_SANDBOX_POINT_VALIDATION",
        "Point validation requires sandboxProgramId and point.",
      );
    }

    validatePoint(command.point.lat, command.point.lng, "point");
    const asOf = command.asOf ?? new Date().toISOString();

    const persistedMatches = await this.repository?.findPointMatches(
      command.sandboxProgramId,
      command.point.lat,
      command.point.lng,
      asOf,
    );
    const matches =
      persistedMatches && persistedMatches.length > 0
        ? persistedMatches.map<ApprovedAreaMatchRecord>((item: {
            area_id: string;
            area_kind: "operating_area" | "pickup_dropoff_zone";
            area_name: string;
          }) => ({
            areaId: item.area_id,
            areaKind: item.area_kind,
            name: item.area_name,
          }))
        : this.findPointMatchesInMemory(command.sandboxProgramId, command.point, asOf);

    return {
      sandboxProgramId: command.sandboxProgramId,
      point: { ...command.point },
      matches,
      inApprovedArea: matches.length > 0,
      evaluatedAt: new Date().toISOString(),
    };
  }

  async validateRouteContainment(
    command: ValidateRouteContainmentCommand,
  ): Promise<ValidateRouteContainmentResult> {
    if (!command?.sandboxProgramId || !command.candidatePath) {
      throw new ApiRequestError(
        400,
        "INVALID_SANDBOX_ROUTE_VALIDATION",
        "Route validation requires sandboxProgramId and candidatePath.",
      );
    }

    validateMultiLineString(command.candidatePath, "candidatePath");
    const asOf = command.asOf ?? new Date().toISOString();
    const toleranceMeters =
      command.toleranceMeters ?? DEFAULT_ROUTE_TOLERANCE_METERS;

    const persistedMatches = await this.repository?.findContainingRoutes(
      command.sandboxProgramId,
      command.candidatePath,
      asOf,
      toleranceMeters,
    );
    const routeIds =
      persistedMatches && persistedMatches.length > 0
        ? persistedMatches.map((item: { route_id: string }) => item.route_id)
        : this.findContainingRoutesInMemory(
            command.sandboxProgramId,
            command.candidatePath,
            asOf,
            toleranceMeters,
          );

    return {
      sandboxProgramId: command.sandboxProgramId,
      routeIds,
      contained: routeIds.length > 0,
      evaluatedAt: new Date().toISOString(),
      toleranceMeters,
    };
  }

  private findPointMatchesInMemory(
    sandboxProgramId: string,
    point: { lat: number; lng: number },
    asOf: string,
  ) {
    return this.operatingAreas
      .filter(
        (item) =>
          item.sandboxProgramId === sandboxProgramId &&
          isEffective(item.effectiveFrom, item.effectiveUntil, asOf) &&
          item.active &&
          pointInMultiPolygon(point.lng, point.lat, item.geometry),
      )
      .filter(keepLatestVersionById((item) => item.areaId))
      .map<ApprovedAreaMatchRecord>((item) => ({
        areaId: item.areaId,
        areaKind: item.areaKind,
        name: item.name,
      }));
  }

  private findContainingRoutesInMemory(
    sandboxProgramId: string,
    candidatePath: GeoJsonMultiLineString,
    asOf: string,
    toleranceMeters: number,
  ) {
    return this.routes
      .filter(
        (item) =>
          item.sandboxProgramId === sandboxProgramId &&
          isEffective(item.effectiveFrom, item.effectiveUntil, asOf) &&
          item.active &&
          lineContainedInRoute(candidatePath, item.geometry, toleranceMeters),
      )
      .filter(keepLatestVersionById((item) => item.routeId))
      .map((item) => item.routeId);
  }

  private validateOperatingArea(item: ApprovedOperatingAreaRecord) {
    validateText(item.areaId, "areaId");
    validateText(item.sandboxProgramId, "sandboxProgramId");
    validateText(item.name, "name");
    if (!AREA_KIND_SET.has(item.areaKind)) {
      throw new ApiRequestError(400, "INVALID_OPERATING_AREA_KIND", "Invalid areaKind.");
    }
    validateMultiPolygon(item.geometry, `geometry for ${item.areaId}`);
    validateEffectiveDates(item.effectiveFrom, item.effectiveUntil, item.areaId);
    return clone(item);
  }

  private validateRoute(
    item: ApprovedRouteRecord,
    knownAreaIds: Set<string>,
  ) {
    validateText(item.routeId, "routeId");
    validateText(item.sandboxProgramId, "sandboxProgramId");
    validateText(item.name, "name");
    if (item.areaId && !knownAreaIds.has(item.areaId)) {
      throw new ApiRequestError(
        400,
        "UNKNOWN_OPERATING_AREA",
        `Route ${item.routeId} references unknown areaId ${item.areaId}.`,
      );
    }
    validateMultiLineString(item.geometry, `geometry for ${item.routeId}`);
    validateEffectiveDates(item.effectiveFrom, item.effectiveUntil, item.routeId);
    return clone(item);
  }

  private validateVehicleEnrollment(item: VehicleEnrollmentRecord) {
    validateText(item.enrollmentId, "enrollmentId");
    validateText(item.vehicleId, "vehicleId");
    validateText(item.providerCode, "providerCode");
    if (!VEHICLE_STATUS_SET.has(item.status)) {
      throw new ApiRequestError(
        400,
        "INVALID_VEHICLE_ENROLLMENT_STATUS",
        "Vehicle enrollment status is invalid.",
      );
    }
    validateEffectiveDates(
      item.effectiveFrom,
      item.effectiveUntil,
      item.enrollmentId,
    );
    return clone(item);
  }

  private validateSafetyOperatorQualification(
    item: SafetyOperatorQualificationRecord,
  ) {
    validateText(item.qualificationId, "qualificationId");
    validateText(item.safetyOperatorId, "safetyOperatorId");
    validateText(item.providerCode, "providerCode");
    if (!OPERATOR_STATUS_SET.has(item.status)) {
      throw new ApiRequestError(
        400,
        "INVALID_SAFETY_OPERATOR_QUALIFICATION_STATUS",
        "Safety operator qualification status is invalid.",
      );
    }
    validateEffectiveDates(
      item.effectiveFrom,
      item.effectiveUntil,
      item.qualificationId,
    );
    return clone(item);
  }

  private assertStatusTransition<T extends string>(
    previous: T | null,
    next: T,
    allowed: Record<T, readonly T[]>,
    errorCode: string,
    recordId: string,
  ) {
    if (!previous) {
      return;
    }
    if (allowed[previous].includes(next)) {
      return;
    }
    throw new ApiRequestError(
      400,
      errorCode,
      `Record ${recordId} cannot transition from ${previous} to ${next}.`,
    );
  }

  private recordAudit(
    actionName: string,
    resourceType: string,
    resourceId: string,
    actor: AuditActor,
    requestId: string | undefined,
    newValuesSummary: Record<string, unknown>,
  ) {
    this.auditNotificationService?.recordAuditLog({
      actorId: actor.actorId,
      actorType: actor.actorType,
      tenantId: actor.tenantId,
      moduleName: "sandbox-governance",
      actionName,
      resourceType,
      resourceId,
      newValuesSummary,
      ...(requestId ? { requestId } : {}),
    });
  }

  private buildRequirementAuditSummary(
    requirement: SandboxProviderCapabilityRequirementRecord,
  ) {
    return {
      sandboxProgramId: requirement.sandboxProgramId,
      capability: requirement.capability,
      required: requirement.required,
      minSchemaVersion: requirement.minSchemaVersion,
      notes: requirement.notes,
    };
  }

  private formatResourceVersion(resourceVersion: number) {
    return `v${resourceVersion}`;
  }

  private async persist(
    operation: () => Promise<void> | undefined,
    rollback: () => void,
    context: string,
  ) {
    const pending = operation();
    if (!pending) {
      return;
    }
    try {
      await pending;
    } catch (error) {
      rollback();
      this.repository?.reportPersistenceFailure(error, context);
      throw error;
    }
  }
}

function validateSchedules(
  schedules: ApprovedOperatingAreaRecord["schedules"],
  resourceId: string,
) {
  const seen = new Set<string>();
  for (const schedule of schedules) {
    validateText(schedule.scheduleId, "scheduleId");
    if (seen.has(schedule.scheduleId)) {
      throw new ApiRequestError(
        400,
        "DUPLICATE_SANDBOX_SCHEDULE_ID",
        `Duplicate scheduleId ${schedule.scheduleId} on ${resourceId}.`,
      );
    }
    seen.add(schedule.scheduleId);
    if (!Array.isArray(schedule.daysOfWeek) || schedule.daysOfWeek.length === 0) {
      throw new ApiRequestError(
        400,
        "INVALID_SANDBOX_SCHEDULE_DAYS",
        `Schedule ${schedule.scheduleId} must declare at least one day.`,
      );
    }
    for (const day of schedule.daysOfWeek) {
      if (!DAY_SET.has(day)) {
        throw new ApiRequestError(
          400,
          "INVALID_SANDBOX_SCHEDULE_DAY",
          `Schedule ${schedule.scheduleId} has invalid day ${day}.`,
        );
      }
    }
    if (!HOLIDAY_POLICY_SET.has(schedule.holidayPolicy)) {
      throw new ApiRequestError(
        400,
        "INVALID_SANDBOX_HOLIDAY_POLICY",
        `Schedule ${schedule.scheduleId} has invalid holiday policy.`,
      );
    }
    validateTime(schedule.startLocalTime, schedule.scheduleId);
    validateTime(schedule.endLocalTime, schedule.scheduleId);
    validateEffectiveDates(
      schedule.effectiveFrom,
      schedule.effectiveUntil,
      schedule.scheduleId,
    );
  }
}

function validateTime(value: string, scheduleId: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    throw new ApiRequestError(
      400,
      "INVALID_SANDBOX_SCHEDULE_TIME",
      `Schedule ${scheduleId} time must be HH:MM.`,
    );
  }
}

function validateMultiPolygon(value: GeoJsonMultiPolygon, label: string) {
  if (value?.type !== "MultiPolygon" || !Array.isArray(value.coordinates)) {
    throw new ApiRequestError(
      400,
      "INVALID_MULTIPOLYGON_GEOMETRY",
      `${label} must be a GeoJSON MultiPolygon.`,
    );
  }
  for (const polygon of value.coordinates) {
    if (!Array.isArray(polygon) || polygon.length === 0) {
      throw new ApiRequestError(
        400,
        "INVALID_MULTIPOLYGON_GEOMETRY",
        `${label} must contain at least one ring.`,
      );
    }
    for (const ring of polygon) {
      validateRing(ring, label);
    }
  }
}

function validateRing(ring: GeoJsonPosition[], label: string) {
  if (!Array.isArray(ring) || ring.length < 4) {
    throw new ApiRequestError(
      400,
      "INVALID_MULTIPOLYGON_RING",
      `${label} rings must have at least four coordinates.`,
    );
  }
  ring.forEach((point, index) => validatePosition(point, `${label}[${index}]`));
}

function validateMultiLineString(value: GeoJsonMultiLineString, label: string) {
  if (value?.type !== "MultiLineString" || !Array.isArray(value.coordinates)) {
    throw new ApiRequestError(
      400,
      "INVALID_MULTILINESTRING_GEOMETRY",
      `${label} must be a GeoJSON MultiLineString.`,
    );
  }
  for (const line of value.coordinates) {
    if (!Array.isArray(line) || line.length < 2) {
      throw new ApiRequestError(
        400,
        "INVALID_MULTILINESTRING_GEOMETRY",
        `${label} line segments must have at least two coordinates.`,
      );
    }
    line.forEach((point, index) => validatePosition(point, `${label}[${index}]`));
  }
}

function validatePosition(position: GeoJsonPosition, label: string) {
  if (!Array.isArray(position) || position.length !== 2) {
    throw new ApiRequestError(
      400,
      "INVALID_GEOJSON_POSITION",
      `${label} must be [lng, lat].`,
    );
  }
  validatePoint(position[1], position[0], label);
}

function validatePoint(lat: number, lng: number, label: string) {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    throw new ApiRequestError(
      400,
      "INVALID_GEO_POINT",
      `${label} must contain valid lat/lng coordinates.`,
    );
  }
}

function validateText(value: string, field: string) {
  if (!value || typeof value !== "string" || value.trim().length === 0) {
    throw new ApiRequestError(400, "INVALID_TEXT_FIELD", `${field} is required.`);
  }
}

function validateEffectiveDates(
  effectiveFrom: string,
  effectiveUntil: string | null,
  recordId: string,
) {
  const from = Date.parse(effectiveFrom);
  const until = effectiveUntil ? Date.parse(effectiveUntil) : null;
  if (Number.isNaN(from) || (effectiveUntil && until !== null && Number.isNaN(until))) {
    throw new ApiRequestError(
      400,
      "INVALID_EFFECTIVE_DATES",
      `Record ${recordId} has invalid effective dates.`,
    );
  }
  if (until !== null && until <= from) {
    throw new ApiRequestError(
      400,
      "INVALID_EFFECTIVE_DATES",
      `Record ${recordId} effectiveUntil must be after effectiveFrom.`,
    );
  }
}

function ensureUnique(values: string[], errorCode: string) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new ApiRequestError(400, errorCode, `Duplicate id ${value}.`);
    }
    seen.add(value);
  }
}

function ensureUniqueVersionedRecords<T extends { version: number }>(
  values: readonly T[],
  idOf: (value: T) => string,
  errorCode: string,
) {
  ensureUnique(
    values.map((value) => `${idOf(value)}::${value.version}`),
    errorCode,
  );
}

function assertNonOverlappingEffectiveWindows<
  T extends { effectiveFrom: string; effectiveUntil: string | null; version: number },
>(values: readonly T[], idOf: (value: T) => string, errorCode: string) {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const recordId = idOf(value);
    const existing = groups.get(recordId);
    if (existing) {
      existing.push(value);
    } else {
      groups.set(recordId, [value]);
    }
  }

  for (const [recordId, records] of groups) {
    const sorted = [...records].sort(
      (left, right) =>
        Date.parse(left.effectiveFrom) - Date.parse(right.effectiveFrom) ||
        left.version - right.version,
    );
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const current = sorted[index]!;
      const next = sorted[index + 1]!;
      if (
        current.effectiveUntil === null ||
        Date.parse(current.effectiveUntil) > Date.parse(next.effectiveFrom)
      ) {
        throw new ApiRequestError(
          400,
          errorCode,
          `Record ${recordId} has overlapping effective windows.`,
        );
      }
    }
  }
}

function assertVersionedStatusTransitions<
  T extends { version: number; status: string; effectiveFrom: string },
>(
  nextItems: readonly T[],
  currentItems: readonly T[],
  idOf: (value: T) => string,
  allowed: Record<string, readonly string[]>,
  errorCode: string,
) {
  const currentGroups = groupVersionedRecords(currentItems, idOf);
  const nextGroups = groupVersionedRecords(nextItems, idOf);

  for (const [recordId, records] of nextGroups) {
    const currentGroup = currentGroups.get(recordId) ?? [];
    const sorted = [...records].sort(
      (left, right) =>
        left.version - right.version ||
        Date.parse(left.effectiveFrom) - Date.parse(right.effectiveFrom),
    );

    for (let index = 0; index < sorted.length; index += 1) {
      const item = sorted[index]!;
      const exactCurrent = currentGroup.find(
        (current) => current.version === item.version,
      );
      const previousInNext = index > 0 ? sorted[index - 1]!.status : null;
      const previousInCurrent = [...currentGroup]
        .filter((current) => current.version < item.version)
        .sort((left, right) => right.version - left.version)[0]?.status;
      const previousStatus =
        exactCurrent?.status ?? previousInNext ?? previousInCurrent ?? null;

      if (!previousStatus) {
        continue;
      }
      if ((allowed[previousStatus] ?? []).includes(item.status)) {
        continue;
      }
      throw new ApiRequestError(
        400,
        errorCode,
        `Record ${recordId} cannot transition from ${previousStatus} to ${item.status}.`,
      );
    }
  }
}

function isEffective(
  effectiveFrom: string,
  effectiveUntil: string | null,
  asOf: string,
) {
  const at = Date.parse(asOf);
  return (
    Date.parse(effectiveFrom) <= at &&
    (effectiveUntil === null || Date.parse(effectiveUntil) > at)
  );
}

function keepLatestVersionById<T extends { version: number }>(
  idOf: (value: T) => string,
) {
  const seen = new Set<string>();
  return (value: T) => {
    const recordId = idOf(value);
    if (seen.has(recordId)) {
      return false;
    }
    seen.add(recordId);
    return true;
  };
}

function groupVersionedRecords<T extends { version: number }>(
  values: readonly T[],
  idOf: (value: T) => string,
) {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const recordId = idOf(value);
    const existing = groups.get(recordId);
    if (existing) {
      existing.push(value);
    } else {
      groups.set(recordId, [value]);
    }
  }
  return groups;
}

function pointInMultiPolygon(
  lng: number,
  lat: number,
  geometry: GeoJsonMultiPolygon,
) {
  return geometry.coordinates.some((polygon) => pointInPolygon(lng, lat, polygon));
}

function pointInPolygon(lng: number, lat: number, polygon: GeoJsonPosition[][]) {
  const [outer, ...holes] = polygon;
  if (!outer || !rayCastContains(lng, lat, outer)) {
    return false;
  }
  return !holes.some((hole) => rayCastContains(lng, lat, hole));
}

function rayCastContains(lng: number, lat: number, ring: GeoJsonPosition[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function lineContainedInRoute(
  candidatePath: GeoJsonMultiLineString,
  approvedRoute: GeoJsonMultiLineString,
  toleranceMeters: number,
) {
  return candidatePath.coordinates.every((candidateLine) =>
    candidateLine.every((point, index) => {
      const samples: GeoJsonPosition[] = [point];
      if (index < candidateLine.length - 1) {
        samples.push(midpoint(point, candidateLine[index + 1]!));
      }
      return samples.every((sample) =>
        approvedRoute.coordinates.some(
          (approvedLine) =>
            distanceToPolylineMeters(sample, approvedLine) <= toleranceMeters,
        ),
      );
    }),
  );
}

function midpoint(a: GeoJsonPosition, b: GeoJsonPosition): GeoJsonPosition {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function distanceToPolylineMeters(
  point: GeoJsonPosition,
  polyline: GeoJsonPosition[],
) {
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polyline.length - 1; i += 1) {
    min = Math.min(min, distancePointToSegmentMeters(point, polyline[i]!, polyline[i + 1]!));
  }
  return min;
}

function distancePointToSegmentMeters(
  point: GeoJsonPosition,
  start: GeoJsonPosition,
  end: GeoJsonPosition,
) {
  const originLat = ((start[1] + end[1]) / 2) * (Math.PI / 180);
  const px = lngToMeters(point[0], originLat);
  const py = latToMeters(point[1]);
  const ax = lngToMeters(start[0], originLat);
  const ay = latToMeters(start[1]);
  const bx = lngToMeters(end[0], originLat);
  const by = latToMeters(end[1]);
  const abx = bx - ax;
  const aby = by - ay;
  const denom = abx * abx + aby * aby;
  const t =
    denom === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / denom));
  const closestX = ax + abx * t;
  const closestY = ay + aby * t;
  return Math.hypot(px - closestX, py - closestY);
}

function lngToMeters(lng: number, latRadians: number) {
  return lng * 111_320 * Math.cos(latRadians);
}

function latToMeters(lat: number) {
  return lat * 110_540;
}

function sortVersionedRecords<T extends { updatedAt: string; version: number }>(
  items: T[],
  idOf: (value: T) => string,
) {
  return [...items].sort(
    (left, right) =>
      idOf(left).localeCompare(idOf(right)) ||
      right.version - left.version ||
      right.updatedAt.localeCompare(left.updatedAt),
  );
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function cloneList<T>(values: readonly T[]) {
  return values.map((value) => clone(value));
}
