import { createHash, randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  ApprovalDocumentRecord,
  ApprovalDocumentVersionRecord,
  AuditLogRecord,
  ApprovedOperatingAreaRecord,
  ApprovedRouteRecord,
  ApprovedAreaMatchRecord,
  CreateApprovalDocumentVersionCommand,
  CreateSandboxExperimentProgramCommand,
  CreateSandboxJurisdictionProfileCommand,
  GenerateSandboxComplianceSnapshotCommand,
  GeoJsonMultiLineString,
  GeoJsonMultiPolygon,
  GeoJsonPosition,
  IdentityContext,
  ProviderCapabilityRequirement,
  PublishSandboxGovernanceVersionCommand,
  ResumeSandboxExperimentAuthorizationsCommand,
  RollbackSandboxGovernanceVersionCommand,
  SafetyOperatorQualificationRecord,
  SafetyOperatorQualificationStatus,
  SandboxAuthorizationStatus,
  SandboxComplianceSnapshotRecord,
  SandboxExperimentProgramRecord,
  SandboxExperimentProgramVersionRecord,
  SandboxGovernanceNotificationMatrixEntry,
  SandboxGovernancePolicyVersionRefs,
  SandboxJurisdictionProfileRecord,
  SandboxJurisdictionProfileVersionRecord,
  SandboxVersionLifecycleStatus,
  SuspendSandboxExperimentAuthorizationsCommand,
  UpsertApprovedOperatingAreasCommand,
  UpsertApprovedRoutesCommand,
  UpsertSafetyOperatorQualificationsCommand,
  UpdateApprovalDocumentVersionCommand,
  UpdateSandboxExperimentProgramCommand,
  UpdateSandboxJurisdictionProfileCommand,
  UpsertVehicleEnrollmentsCommand,
  ValidateOperatingAreaPointCommand,
  ValidateOperatingAreaPointResult,
  ValidateRouteContainmentCommand,
  ValidateRouteContainmentResult,
  VehicleEnrollmentRecord,
  VehicleEnrollmentStatus,
} from "@drts/contracts";
import {
  SAFETY_OPERATOR_QUALIFICATION_STATUSES,
  SANDBOX_HOLIDAY_POLICIES,
  SANDBOX_OPERATING_AREA_KINDS,
  VEHICLE_ENROLLMENT_STATUSES,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { SandboxGovernanceRepository } from "./sandbox-governance.repository";

type AuditActor = Pick<IdentityContext, "actorId" | "tenantId"> & {
  actorType: AuditLogRecord["actorType"];
};

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
const DEFAULT_POLICY_VERSIONS: SandboxGovernancePolicyVersionRefs = {
  routePolicyVersion: null,
  schedulePolicyVersion: null,
  enrollmentPolicyVersion: null,
  capabilityPolicyVersion: null,
  compliancePolicyVersion: null,
};

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

type ExperimentAction = "suspend" | "resume";

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
  private readonly experiments = new Map<string, SandboxExperimentProgramRecord>();
  private readonly jurisdictions = new Map<
    string,
    SandboxJurisdictionProfileRecord
  >();
  private readonly approvalDocuments = new Map<string, ApprovalDocumentRecord>();

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

  listExperiments(asOf?: string) {
    return [...this.experiments.values()]
      .map((record) => this.projectExperiment(record, asOf))
      .sort((left, right) => left.programCode.localeCompare(right.programCode));
  }

  createExperiment(command: CreateSandboxExperimentProgramCommand) {
    this.assertNonBlank(command.programCode, "programCode");
    this.assertNonBlank(command.name, "name");
    this.assertEffectiveRange(command.effectiveFrom, command.effectiveUntil);

    const experimentId = `sandbox_exp_${randomUUID()}`;
    const now = new Date().toISOString();
    const version = this.createExperimentVersion({
      experimentId,
      versionNo: 1,
      programCode: command.programCode.trim(),
      name: command.name.trim(),
      description: this.normalizeNullableText(command.description),
      jurisdictionIds: this.normalizeStringArray(command.jurisdictionIds),
      requiredCapabilities: this.cloneRequirements(
        command.requiredCapabilities ?? [],
      ),
      notificationMatrix: this.cloneNotificationMatrix(
        command.notificationMatrix ?? [],
      ),
      policyVersions: this.mergePolicyVersions(command.policyVersions),
      lifecycleStatus: "draft",
      authorizationStatus: "pending",
      effectiveFrom: this.normalizeTimestamp(
        command.effectiveFrom,
        now,
        "effectiveFrom",
      ),
      effectiveUntil: this.normalizeNullableTimestamp(
        command.effectiveUntil,
        "effectiveUntil",
      ),
      publishedAt: null,
      publishedBy: null,
      rollbackFromVersionId: null,
      createdAt: now,
      createdBy: this.normalizeNullableText(command.actorId),
      updatedAt: now,
      updatedBy: this.normalizeNullableText(command.actorId),
    });

    const record: SandboxExperimentProgramRecord = {
      experimentId,
      programCode: version.programCode,
      currentVersionId: version.versionId,
      versions: [version],
      archivedAt: null,
    };
    this.experiments.set(experimentId, record);
    return this.projectExperiment(record);
  }

  getExperiment(experimentId: string, asOf?: string) {
    return this.projectExperiment(this.requireExperiment(experimentId), asOf);
  }

  updateExperiment(
    experimentId: string,
    command: UpdateSandboxExperimentProgramCommand,
  ) {
    const record = this.requireExperiment(experimentId);
    this.assertNotArchived(record.archivedAt, "experiment", experimentId);
    const source = this.requireLatestExperimentVersion(record);
    this.assertEffectiveRange(command.effectiveFrom, command.effectiveUntil);

    const now = new Date().toISOString();
    const version = this.createExperimentVersion({
      ...source,
      versionId: `sandbox_exp_ver_${randomUUID()}`,
      versionNo: source.versionNo + 1,
      name:
        command.name !== undefined
          ? this.requireTrimmed(command.name, "name")
          : source.name,
      description:
        command.description !== undefined
          ? this.normalizeNullableText(command.description)
          : source.description,
      jurisdictionIds:
        command.jurisdictionIds !== undefined
          ? this.normalizeStringArray(command.jurisdictionIds)
          : [...source.jurisdictionIds],
      requiredCapabilities:
        command.requiredCapabilities !== undefined
          ? this.cloneRequirements(command.requiredCapabilities)
          : this.cloneRequirements(source.requiredCapabilities),
      notificationMatrix:
        command.notificationMatrix !== undefined
          ? this.cloneNotificationMatrix(command.notificationMatrix)
          : this.cloneNotificationMatrix(source.notificationMatrix),
      policyVersions:
        command.policyVersions !== undefined
          ? this.mergePolicyVersions(command.policyVersions, source.policyVersions)
          : this.mergePolicyVersions(source.policyVersions),
      lifecycleStatus: "draft",
      authorizationStatus: "pending",
      effectiveFrom: this.normalizeTimestamp(
        command.effectiveFrom,
        source.effectiveFrom,
        "effectiveFrom",
      ),
      effectiveUntil:
        command.effectiveUntil !== undefined
          ? this.normalizeNullableTimestamp(
              command.effectiveUntil,
              "effectiveUntil",
            )
          : source.effectiveUntil,
      publishedAt: null,
      publishedBy: null,
      rollbackFromVersionId: null,
      createdAt: now,
      createdBy: this.normalizeNullableText(command.actorId),
      updatedAt: now,
      updatedBy: this.normalizeNullableText(command.actorId),
    });

    record.versions.push(version);
    record.currentVersionId = version.versionId;
    return this.projectExperiment(record);
  }

  archiveExperiment(experimentId: string) {
    const record = this.requireExperiment(experimentId);
    record.archivedAt = new Date().toISOString();
    const latest = this.requireLatestExperimentVersion(record);
    latest.lifecycleStatus = "archived";
    latest.updatedAt = record.archivedAt;
    return this.projectExperiment(record);
  }

  publishExperimentVersion(
    experimentId: string,
    versionId: string,
    command: PublishSandboxGovernanceVersionCommand,
  ) {
    const record = this.requireExperiment(experimentId);
    const version = this.requireExperimentVersion(record, versionId);
    if (version.lifecycleStatus !== "draft") {
      throw this.invalidState(
        "Experiment version must be draft before publish.",
        { experimentId, versionId, lifecycleStatus: version.lifecycleStatus },
      );
    }

    this.assertEffectiveRange(command.effectiveFrom, command.effectiveUntil);
    const now = new Date().toISOString();
    version.lifecycleStatus = "published";
    version.authorizationStatus = "active";
    version.effectiveFrom = this.normalizeTimestamp(
      command.effectiveFrom,
      version.effectiveFrom,
      "effectiveFrom",
    );
    version.effectiveUntil =
      command.effectiveUntil !== undefined
        ? this.normalizeNullableTimestamp(command.effectiveUntil, "effectiveUntil")
        : version.effectiveUntil;
    version.publishedAt = now;
    version.publishedBy = this.normalizeNullableText(command.actorId);
    version.updatedAt = now;
    version.updatedBy = this.normalizeNullableText(command.actorId);
    this.endPreviousPublishedExperimentVersion(record, version);
    record.currentVersionId = version.versionId;
    return this.projectExperiment(record);
  }

  suspendExperimentAuthorizations(
    experimentId: string,
    command: SuspendSandboxExperimentAuthorizationsCommand,
  ) {
    return this.transitionExperimentAuthorizationState(
      experimentId,
      "suspend",
      "suspended",
      command,
    );
  }

  resumeExperimentAuthorizations(
    experimentId: string,
    command: ResumeSandboxExperimentAuthorizationsCommand,
  ) {
    return this.transitionExperimentAuthorizationState(
      experimentId,
      "resume",
      "active",
      command,
    );
  }

  rollbackExperimentVersion(
    experimentId: string,
    versionId: string,
    command: RollbackSandboxGovernanceVersionCommand,
  ) {
    const record = this.requireExperiment(experimentId);
    const target = this.requireExperimentVersion(record, versionId);
    this.assertEffectiveRange(command.effectiveFrom, command.effectiveUntil);
    const now = new Date().toISOString();
    const version = this.createExperimentVersion({
      ...target,
      versionId: `sandbox_exp_ver_${randomUUID()}`,
      versionNo: this.requireLatestExperimentVersion(record).versionNo + 1,
      lifecycleStatus: command.publish ? "published" : "draft",
      authorizationStatus: command.publish ? target.authorizationStatus : "pending",
      effectiveFrom: this.normalizeTimestamp(
        command.effectiveFrom,
        now,
        "effectiveFrom",
      ),
      effectiveUntil: this.normalizeNullableTimestamp(
        command.effectiveUntil,
        "effectiveUntil",
      ),
      publishedAt: command.publish ? now : null,
      publishedBy: command.publish
        ? this.normalizeNullableText(command.actorId)
        : null,
      rollbackFromVersionId: target.versionId,
      createdAt: now,
      createdBy: this.normalizeNullableText(command.actorId),
      updatedAt: now,
      updatedBy: this.normalizeNullableText(command.actorId),
    });

    record.versions.push(version);
    if (command.publish) {
      this.endPreviousPublishedExperimentVersion(record, version);
    }
    record.currentVersionId = version.versionId;
    return this.projectExperiment(record);
  }

  listJurisdictions(asOf?: string) {
    return [...this.jurisdictions.values()]
      .map((record) => this.projectJurisdiction(record, asOf))
      .sort((left, right) =>
        left.jurisdictionCode.localeCompare(right.jurisdictionCode),
      );
  }

  createJurisdiction(command: CreateSandboxJurisdictionProfileCommand) {
    this.assertNonBlank(command.jurisdictionCode, "jurisdictionCode");
    this.assertNonBlank(command.name, "name");
    this.assertNonBlank(command.regulatorName, "regulatorName");
    this.assertEffectiveRange(command.effectiveFrom, command.effectiveUntil);

    const jurisdictionId = `sandbox_jur_${randomUUID()}`;
    const now = new Date().toISOString();
    const version = this.createJurisdictionVersion({
      jurisdictionId,
      versionNo: 1,
      jurisdictionCode: command.jurisdictionCode.trim(),
      name: command.name.trim(),
      regulatorName: command.regulatorName.trim(),
      approvalLeadTimeDays: this.normalizeNullableNumber(
        command.approvalLeadTimeDays,
      ),
      retentionDays: this.normalizeNullableNumber(command.retentionDays),
      notificationMatrix: this.cloneNotificationMatrix(
        command.notificationMatrix ?? [],
      ),
      policyVersions: this.mergePolicyVersions(command.policyVersions),
      lifecycleStatus: "draft",
      effectiveFrom: this.normalizeTimestamp(
        command.effectiveFrom,
        now,
        "effectiveFrom",
      ),
      effectiveUntil: this.normalizeNullableTimestamp(
        command.effectiveUntil,
        "effectiveUntil",
      ),
      publishedAt: null,
      publishedBy: null,
      rollbackFromVersionId: null,
      createdAt: now,
      createdBy: this.normalizeNullableText(command.actorId),
      updatedAt: now,
      updatedBy: this.normalizeNullableText(command.actorId),
    });

    const record: SandboxJurisdictionProfileRecord = {
      jurisdictionId,
      jurisdictionCode: version.jurisdictionCode,
      currentVersionId: version.versionId,
      versions: [version],
      archivedAt: null,
    };
    this.jurisdictions.set(jurisdictionId, record);
    return this.projectJurisdiction(record);
  }

  getJurisdiction(jurisdictionId: string, asOf?: string) {
    return this.projectJurisdiction(this.requireJurisdiction(jurisdictionId), asOf);
  }

  updateJurisdiction(
    jurisdictionId: string,
    command: UpdateSandboxJurisdictionProfileCommand,
  ) {
    const record = this.requireJurisdiction(jurisdictionId);
    this.assertNotArchived(record.archivedAt, "jurisdiction", jurisdictionId);
    const source = this.requireLatestJurisdictionVersion(record);
    this.assertEffectiveRange(command.effectiveFrom, command.effectiveUntil);

    const now = new Date().toISOString();
    const version = this.createJurisdictionVersion({
      ...source,
      versionId: `sandbox_jur_ver_${randomUUID()}`,
      versionNo: source.versionNo + 1,
      name:
        command.name !== undefined
          ? this.requireTrimmed(command.name, "name")
          : source.name,
      regulatorName:
        command.regulatorName !== undefined
          ? this.requireTrimmed(command.regulatorName, "regulatorName")
          : source.regulatorName,
      approvalLeadTimeDays:
        command.approvalLeadTimeDays !== undefined
          ? this.normalizeNullableNumber(command.approvalLeadTimeDays)
          : source.approvalLeadTimeDays,
      retentionDays:
        command.retentionDays !== undefined
          ? this.normalizeNullableNumber(command.retentionDays)
          : source.retentionDays,
      notificationMatrix:
        command.notificationMatrix !== undefined
          ? this.cloneNotificationMatrix(command.notificationMatrix)
          : this.cloneNotificationMatrix(source.notificationMatrix),
      policyVersions:
        command.policyVersions !== undefined
          ? this.mergePolicyVersions(command.policyVersions, source.policyVersions)
          : this.mergePolicyVersions(source.policyVersions),
      lifecycleStatus: "draft",
      effectiveFrom: this.normalizeTimestamp(
        command.effectiveFrom,
        source.effectiveFrom,
        "effectiveFrom",
      ),
      effectiveUntil:
        command.effectiveUntil !== undefined
          ? this.normalizeNullableTimestamp(
              command.effectiveUntil,
              "effectiveUntil",
            )
          : source.effectiveUntil,
      publishedAt: null,
      publishedBy: null,
      rollbackFromVersionId: null,
      createdAt: now,
      createdBy: this.normalizeNullableText(command.actorId),
      updatedAt: now,
      updatedBy: this.normalizeNullableText(command.actorId),
    });

    record.versions.push(version);
    record.currentVersionId = version.versionId;
    return this.projectJurisdiction(record);
  }

  archiveJurisdiction(jurisdictionId: string) {
    const record = this.requireJurisdiction(jurisdictionId);
    record.archivedAt = new Date().toISOString();
    const latest = this.requireLatestJurisdictionVersion(record);
    latest.lifecycleStatus = "archived";
    latest.updatedAt = record.archivedAt;
    return this.projectJurisdiction(record);
  }

  publishJurisdictionVersion(
    jurisdictionId: string,
    versionId: string,
    command: PublishSandboxGovernanceVersionCommand,
  ) {
    const record = this.requireJurisdiction(jurisdictionId);
    const version = this.requireJurisdictionVersion(record, versionId);
    if (version.lifecycleStatus !== "draft") {
      throw this.invalidState(
        "Jurisdiction version must be draft before publish.",
        { jurisdictionId, versionId, lifecycleStatus: version.lifecycleStatus },
      );
    }

    this.assertEffectiveRange(command.effectiveFrom, command.effectiveUntil);
    const now = new Date().toISOString();
    version.lifecycleStatus = "published";
    version.effectiveFrom = this.normalizeTimestamp(
      command.effectiveFrom,
      version.effectiveFrom,
      "effectiveFrom",
    );
    version.effectiveUntil =
      command.effectiveUntil !== undefined
        ? this.normalizeNullableTimestamp(command.effectiveUntil, "effectiveUntil")
        : version.effectiveUntil;
    version.publishedAt = now;
    version.publishedBy = this.normalizeNullableText(command.actorId);
    version.updatedAt = now;
    version.updatedBy = this.normalizeNullableText(command.actorId);
    this.endPreviousPublishedJurisdictionVersion(record, version);
    record.currentVersionId = version.versionId;
    return this.projectJurisdiction(record);
  }

  rollbackJurisdictionVersion(
    jurisdictionId: string,
    versionId: string,
    command: RollbackSandboxGovernanceVersionCommand,
  ) {
    const record = this.requireJurisdiction(jurisdictionId);
    const target = this.requireJurisdictionVersion(record, versionId);
    this.assertEffectiveRange(command.effectiveFrom, command.effectiveUntil);
    const now = new Date().toISOString();
    const version = this.createJurisdictionVersion({
      ...target,
      versionId: `sandbox_jur_ver_${randomUUID()}`,
      versionNo: this.requireLatestJurisdictionVersion(record).versionNo + 1,
      lifecycleStatus: command.publish ? "published" : "draft",
      effectiveFrom: this.normalizeTimestamp(
        command.effectiveFrom,
        now,
        "effectiveFrom",
      ),
      effectiveUntil: this.normalizeNullableTimestamp(
        command.effectiveUntil,
        "effectiveUntil",
      ),
      publishedAt: command.publish ? now : null,
      publishedBy: command.publish
        ? this.normalizeNullableText(command.actorId)
        : null,
      rollbackFromVersionId: target.versionId,
      createdAt: now,
      createdBy: this.normalizeNullableText(command.actorId),
      updatedAt: now,
      updatedBy: this.normalizeNullableText(command.actorId),
    });

    record.versions.push(version);
    if (command.publish) {
      this.endPreviousPublishedJurisdictionVersion(record, version);
    }
    record.currentVersionId = version.versionId;
    return this.projectJurisdiction(record);
  }

  listApprovalDocuments(asOf?: string) {
    return [...this.approvalDocuments.values()]
      .map((record) => this.projectApprovalDocument(record, asOf))
      .sort((left, right) => left.title.localeCompare(right.title));
  }

  createApprovalDocument(command: CreateApprovalDocumentVersionCommand) {
    this.requireExperiment(command.experimentId);
    this.requireJurisdiction(command.jurisdictionId);
    this.assertNonBlank(command.title, "title");
    this.assertArtifact(command.artifactFileName, command.artifactContentType);
    this.assertEffectiveRange(command.effectiveFrom, command.effectiveUntil);

    const documentId = `sandbox_doc_${randomUUID()}`;
    const now = new Date().toISOString();
    const artifact = this.createArtifactDigest(command.artifactContentBase64);
    const version = this.createApprovalDocumentVersionRecord({
      documentId,
      versionNo: 1,
      experimentId: command.experimentId,
      jurisdictionId: command.jurisdictionId,
      documentType: command.documentType,
      title: command.title.trim(),
      summary: this.normalizeNullableText(command.summary),
      artifactFileName: command.artifactFileName.trim(),
      artifactContentType: command.artifactContentType.trim(),
      artifactByteSize: artifact.byteSize,
      artifactSha256: artifact.sha256,
      artifactUploadedAt: now,
      artifactUploadedBy: this.normalizeNullableText(command.actorId),
      supersedesVersionId: null,
      lifecycleStatus: "draft",
      effectiveFrom: this.normalizeTimestamp(
        command.effectiveFrom,
        now,
        "effectiveFrom",
      ),
      effectiveUntil: this.normalizeNullableTimestamp(
        command.effectiveUntil,
        "effectiveUntil",
      ),
      publishedAt: null,
      publishedBy: null,
      rollbackFromVersionId: null,
      createdAt: now,
      createdBy: this.normalizeNullableText(command.actorId),
      updatedAt: now,
      updatedBy: this.normalizeNullableText(command.actorId),
    });

    const record: ApprovalDocumentRecord = {
      documentId,
      experimentId: command.experimentId,
      jurisdictionId: command.jurisdictionId,
      documentType: command.documentType,
      title: version.title,
      currentVersionId: version.versionId,
      versions: [version],
      archivedAt: null,
    };
    this.approvalDocuments.set(documentId, record);
    return this.projectApprovalDocument(record);
  }

  getApprovalDocument(documentId: string, asOf?: string) {
    return this.projectApprovalDocument(
      this.requireApprovalDocument(documentId),
      asOf,
    );
  }

  uploadApprovalDocumentVersion(
    documentId: string,
    command: UpdateApprovalDocumentVersionCommand,
  ) {
    const record = this.requireApprovalDocument(documentId);
    this.assertNotArchived(record.archivedAt, "approval document", documentId);
    this.assertArtifact(command.artifactFileName, command.artifactContentType);
    this.assertEffectiveRange(command.effectiveFrom, command.effectiveUntil);

    const source = this.requireLatestApprovalDocumentVersion(record);
    const artifact = this.createArtifactDigest(command.artifactContentBase64);
    const now = new Date().toISOString();
    const version = this.createApprovalDocumentVersionRecord({
      ...source,
      versionId: `sandbox_doc_ver_${randomUUID()}`,
      versionNo: source.versionNo + 1,
      title:
        command.title !== undefined
          ? this.requireTrimmed(command.title, "title")
          : source.title,
      summary:
        command.summary !== undefined
          ? this.normalizeNullableText(command.summary)
          : source.summary,
      artifactFileName: command.artifactFileName.trim(),
      artifactContentType: command.artifactContentType.trim(),
      artifactByteSize: artifact.byteSize,
      artifactSha256: artifact.sha256,
      artifactUploadedAt: now,
      artifactUploadedBy: this.normalizeNullableText(command.actorId),
      supersedesVersionId: source.versionId,
      lifecycleStatus: "draft",
      effectiveFrom: this.normalizeTimestamp(
        command.effectiveFrom,
        source.effectiveFrom,
        "effectiveFrom",
      ),
      effectiveUntil:
        command.effectiveUntil !== undefined
          ? this.normalizeNullableTimestamp(
              command.effectiveUntil,
              "effectiveUntil",
            )
          : source.effectiveUntil,
      publishedAt: null,
      publishedBy: null,
      rollbackFromVersionId: null,
      createdAt: now,
      createdBy: this.normalizeNullableText(command.actorId),
      updatedAt: now,
      updatedBy: this.normalizeNullableText(command.actorId),
    });

    record.versions.push(version);
    record.currentVersionId = version.versionId;
    record.title = version.title;
    return this.projectApprovalDocument(record);
  }

  archiveApprovalDocument(documentId: string) {
    const record = this.requireApprovalDocument(documentId);
    record.archivedAt = new Date().toISOString();
    const latest = this.requireLatestApprovalDocumentVersion(record);
    latest.lifecycleStatus = "archived";
    latest.updatedAt = record.archivedAt;
    return this.projectApprovalDocument(record);
  }

  publishApprovalDocumentVersion(
    documentId: string,
    versionId: string,
    command: PublishSandboxGovernanceVersionCommand,
  ) {
    const record = this.requireApprovalDocument(documentId);
    const version = this.requireApprovalDocumentVersion(record, versionId);
    if (version.lifecycleStatus !== "draft") {
      throw this.invalidState(
        "Approval document version must be draft before publish.",
        { documentId, versionId, lifecycleStatus: version.lifecycleStatus },
      );
    }

    this.assertEffectiveRange(command.effectiveFrom, command.effectiveUntil);
    const now = new Date().toISOString();
    version.lifecycleStatus = "published";
    version.effectiveFrom = this.normalizeTimestamp(
      command.effectiveFrom,
      version.effectiveFrom,
      "effectiveFrom",
    );
    version.effectiveUntil =
      command.effectiveUntil !== undefined
        ? this.normalizeNullableTimestamp(command.effectiveUntil, "effectiveUntil")
        : version.effectiveUntil;
    version.publishedAt = now;
    version.publishedBy = this.normalizeNullableText(command.actorId);
    version.updatedAt = now;
    version.updatedBy = this.normalizeNullableText(command.actorId);
    this.endPreviousPublishedApprovalDocumentVersion(record, version);
    record.currentVersionId = version.versionId;
    record.title = version.title;
    return this.projectApprovalDocument(record);
  }

  rollbackApprovalDocumentVersion(
    documentId: string,
    versionId: string,
    command: RollbackSandboxGovernanceVersionCommand,
  ) {
    const record = this.requireApprovalDocument(documentId);
    const target = this.requireApprovalDocumentVersion(record, versionId);
    this.assertEffectiveRange(command.effectiveFrom, command.effectiveUntil);
    const now = new Date().toISOString();
    const version = this.createApprovalDocumentVersionRecord({
      ...target,
      versionId: `sandbox_doc_ver_${randomUUID()}`,
      versionNo: this.requireLatestApprovalDocumentVersion(record).versionNo + 1,
      supersedesVersionId: this.requireLatestApprovalDocumentVersion(record).versionId,
      lifecycleStatus: command.publish ? "published" : "draft",
      effectiveFrom: this.normalizeTimestamp(
        command.effectiveFrom,
        now,
        "effectiveFrom",
      ),
      effectiveUntil: this.normalizeNullableTimestamp(
        command.effectiveUntil,
        "effectiveUntil",
      ),
      publishedAt: command.publish ? now : null,
      publishedBy: command.publish
        ? this.normalizeNullableText(command.actorId)
        : null,
      rollbackFromVersionId: target.versionId,
      createdAt: now,
      createdBy: this.normalizeNullableText(command.actorId),
      updatedAt: now,
      updatedBy: this.normalizeNullableText(command.actorId),
    });

    record.versions.push(version);
    if (command.publish) {
      this.endPreviousPublishedApprovalDocumentVersion(record, version);
    }
    record.currentVersionId = version.versionId;
    record.title = version.title;
    return this.projectApprovalDocument(record);
  }

  generateComplianceSnapshot(
    experimentId: string,
    command: GenerateSandboxComplianceSnapshotCommand,
  ): SandboxComplianceSnapshotRecord {
    const record = this.requireExperiment(experimentId);
    const asOf = this.normalizeTimestamp(
      command.asOf,
      new Date().toISOString(),
      "asOf",
    );
    const experimentVersion = this.selectExperimentVersion(record, asOf);
    if (!experimentVersion) {
      throw this.notFound("No published experiment version is effective at asOf.", {
        experimentId,
        asOf,
      });
    }

    const jurisdictions = experimentVersion.jurisdictionIds
      .map((jurisdictionId) => this.requireJurisdiction(jurisdictionId))
      .map((jurisdiction) => this.selectJurisdictionVersion(jurisdiction, asOf))
      .filter(
        (
          version,
        ): version is SandboxJurisdictionProfileVersionRecord => version !== null,
      );

    const approvalDocuments = [...this.approvalDocuments.values()]
      .filter(
        (document) =>
          document.experimentId === experimentId &&
          experimentVersion.jurisdictionIds.includes(document.jurisdictionId),
      )
      .map((document) => this.selectApprovalDocumentVersion(document, asOf))
      .filter((version): version is ApprovalDocumentVersionRecord => version !== null)
      .sort((left, right) => left.versionId.localeCompare(right.versionId));

    const operatingAreas = this.operatingAreas
      .filter(
        (item) =>
          item.sandboxProgramId === experimentVersion.programCode &&
          isEffective(item.effectiveFrom, item.effectiveUntil, asOf),
      )
      .sort(
        (left, right) =>
          left.areaId.localeCompare(right.areaId) || left.version - right.version,
      );

    const routes = this.routes
      .filter(
        (item) =>
          item.sandboxProgramId === experimentVersion.programCode &&
          isEffective(item.effectiveFrom, item.effectiveUntil, asOf),
      )
      .sort(
        (left, right) =>
          left.routeId.localeCompare(right.routeId) || left.version - right.version,
      );

    const vehicleEnrollments = this.vehicleEnrollments
      .filter(
        (item) =>
          item.sandboxProgramId === experimentVersion.programCode &&
          isEffective(item.effectiveFrom, item.effectiveUntil, asOf),
      )
      .sort(
        (left, right) =>
          left.enrollmentId.localeCompare(right.enrollmentId) ||
          left.version - right.version,
      );

    const snapshotBase = {
      experimentId,
      experimentVersionId: experimentVersion.versionId,
      asOf,
      policyVersions: this.mergePolicyVersions(experimentVersion.policyVersions),
      authorizationStatus: experimentVersion.authorizationStatus,
      requiredCapabilities: this.cloneRequirements(
        experimentVersion.requiredCapabilities,
      ),
      jurisdictions: jurisdictions.map((version) => this.cloneJson(version)),
      approvalDocuments: approvalDocuments.map((version) => this.cloneJson(version)),
      operatingAreas: operatingAreas.map((item) => this.cloneJson(item)),
      routes: routes.map((item) => this.cloneJson(item)),
      vehicleEnrollments: vehicleEnrollments.map((item) => this.cloneJson(item)),
    };

    return {
      snapshotId: `sandbox_snapshot_${randomUUID()}`,
      generatedAt: new Date().toISOString(),
      generatedBy: this.normalizeNullableText(command.actorId),
      snapshotHashSha256: this.computeStableHash(snapshotBase),
      ...snapshotBase,
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

  private transitionExperimentAuthorizationState(
    experimentId: string,
    action: ExperimentAction,
    nextStatus: SandboxAuthorizationStatus,
    command:
      | SuspendSandboxExperimentAuthorizationsCommand
      | ResumeSandboxExperimentAuthorizationsCommand,
  ) {
    const record = this.requireExperiment(experimentId);
    const active = this.requireCurrentPublishedExperimentVersion(record);
    if (action === "suspend" && active.authorizationStatus === "suspended") {
      throw this.conflict("Experiment authorizations are already suspended.", {
        experimentId,
      });
    }
    if (action === "resume" && active.authorizationStatus !== "suspended") {
      throw this.conflict(
        "Experiment authorizations must be suspended before they can be resumed.",
        {
          experimentId,
          authorizationStatus: active.authorizationStatus,
        },
      );
    }

    const now = new Date().toISOString();
    const version = this.createExperimentVersion({
      ...active,
      versionId: `sandbox_exp_ver_${randomUUID()}`,
      versionNo: active.versionNo + 1,
      lifecycleStatus: "published",
      authorizationStatus: nextStatus,
      effectiveFrom: this.normalizeTimestamp(
        command.effectiveFrom,
        now,
        "effectiveFrom",
      ),
      effectiveUntil: this.normalizeNullableTimestamp(
        command.effectiveUntil,
        "effectiveUntil",
      ),
      publishedAt: now,
      publishedBy: this.normalizeNullableText(command.actorId),
      rollbackFromVersionId: null,
      createdAt: now,
      createdBy: this.normalizeNullableText(command.actorId),
      updatedAt: now,
      updatedBy: this.normalizeNullableText(command.actorId),
    });

    record.versions.push(version);
    this.endPreviousPublishedExperimentVersion(record, version);
    record.currentVersionId = version.versionId;
    return this.projectExperiment(record);
  }

  private endPreviousPublishedExperimentVersion(
    record: SandboxExperimentProgramRecord,
    newVersion: SandboxExperimentProgramVersionRecord,
  ) {
    for (const candidate of record.versions) {
      if (
        candidate.versionId !== newVersion.versionId &&
        candidate.lifecycleStatus === "published" &&
        (!candidate.effectiveUntil ||
          new Date(candidate.effectiveUntil).getTime() >
            new Date(newVersion.effectiveFrom).getTime())
      ) {
        candidate.effectiveUntil = newVersion.effectiveFrom;
        candidate.updatedAt = newVersion.updatedAt;
        candidate.updatedBy = newVersion.updatedBy;
      }
    }
  }

  private endPreviousPublishedJurisdictionVersion(
    record: SandboxJurisdictionProfileRecord,
    newVersion: SandboxJurisdictionProfileVersionRecord,
  ) {
    for (const candidate of record.versions) {
      if (
        candidate.versionId !== newVersion.versionId &&
        candidate.lifecycleStatus === "published" &&
        (!candidate.effectiveUntil ||
          new Date(candidate.effectiveUntil).getTime() >
            new Date(newVersion.effectiveFrom).getTime())
      ) {
        candidate.effectiveUntil = newVersion.effectiveFrom;
        candidate.updatedAt = newVersion.updatedAt;
        candidate.updatedBy = newVersion.updatedBy;
      }
    }
  }

  private endPreviousPublishedApprovalDocumentVersion(
    record: ApprovalDocumentRecord,
    newVersion: ApprovalDocumentVersionRecord,
  ) {
    for (const candidate of record.versions) {
      if (
        candidate.versionId !== newVersion.versionId &&
        candidate.lifecycleStatus === "published" &&
        (!candidate.effectiveUntil ||
          new Date(candidate.effectiveUntil).getTime() >
            new Date(newVersion.effectiveFrom).getTime())
      ) {
        candidate.effectiveUntil = newVersion.effectiveFrom;
        candidate.updatedAt = newVersion.updatedAt;
        candidate.updatedBy = newVersion.updatedBy;
      }
    }
  }

  private projectExperiment(
    record: SandboxExperimentProgramRecord,
    asOf?: string,
  ) {
    return {
      ...this.cloneJson(record),
      effectiveVersion: this.selectExperimentVersion(record, asOf),
    };
  }

  private projectJurisdiction(
    record: SandboxJurisdictionProfileRecord,
    asOf?: string,
  ) {
    return {
      ...this.cloneJson(record),
      effectiveVersion: this.selectJurisdictionVersion(record, asOf),
    };
  }

  private projectApprovalDocument(
    record: ApprovalDocumentRecord,
    asOf?: string,
  ) {
    return {
      ...this.cloneJson(record),
      effectiveVersion: this.selectApprovalDocumentVersion(record, asOf),
    };
  }

  private selectExperimentVersion(
    record: SandboxExperimentProgramRecord,
    asOf?: string,
  ) {
    return this.selectEffectiveVersion(record.versions, asOf, (version) => version.versionNo);
  }

  private selectJurisdictionVersion(
    record: SandboxJurisdictionProfileRecord,
    asOf?: string,
  ) {
    return this.selectEffectiveVersion(record.versions, asOf, (version) => version.versionNo);
  }

  private selectApprovalDocumentVersion(
    record: ApprovalDocumentRecord,
    asOf?: string,
  ) {
    return this.selectEffectiveVersion(record.versions, asOf, (version) => version.versionNo);
  }

  private selectEffectiveVersion<
    T extends {
      lifecycleStatus: SandboxVersionLifecycleStatus;
      effectiveFrom: string;
      effectiveUntil: string | null;
      versionNo: number;
    },
  >(versions: T[], asOf: string | undefined, rank: (value: T) => number) {
    const timestamp = asOf ? new Date(asOf).getTime() : Date.now();
    return (
      versions
        .filter((version) => version.lifecycleStatus === "published")
        .filter((version) => {
          const start = new Date(version.effectiveFrom).getTime();
          const end = version.effectiveUntil
            ? new Date(version.effectiveUntil).getTime()
            : Number.POSITIVE_INFINITY;
          return start <= timestamp && timestamp <= end;
        })
        .sort((left, right) => rank(right) - rank(left))[0] ?? null
    );
  }

  private createExperimentVersion(
    version: Omit<SandboxExperimentProgramVersionRecord, "versionId"> & {
      versionId?: string;
    },
  ): SandboxExperimentProgramVersionRecord {
    return {
      ...this.cloneJson(version),
      versionId: version.versionId ?? `sandbox_exp_ver_${randomUUID()}`,
    };
  }

  private createJurisdictionVersion(
    version: Omit<SandboxJurisdictionProfileVersionRecord, "versionId"> & {
      versionId?: string;
    },
  ): SandboxJurisdictionProfileVersionRecord {
    return {
      ...this.cloneJson(version),
      versionId: version.versionId ?? `sandbox_jur_ver_${randomUUID()}`,
    };
  }

  private createApprovalDocumentVersionRecord(
    version: Omit<ApprovalDocumentVersionRecord, "versionId"> & {
      versionId?: string;
    },
  ): ApprovalDocumentVersionRecord {
    return {
      ...this.cloneJson(version),
      versionId: version.versionId ?? `sandbox_doc_ver_${randomUUID()}`,
    };
  }

  private requireExperiment(experimentId: string) {
    const record = this.experiments.get(experimentId);
    if (!record) {
      throw this.notFound("Sandbox experiment not found.", { experimentId });
    }
    return record;
  }

  private requireExperimentVersion(
    record: SandboxExperimentProgramRecord,
    versionId: string,
  ) {
    const version = record.versions.find((candidate) => candidate.versionId === versionId);
    if (!version) {
      throw this.notFound("Sandbox experiment version not found.", {
        experimentId: record.experimentId,
        versionId,
      });
    }
    return version;
  }

  private requireLatestExperimentVersion(record: SandboxExperimentProgramRecord) {
    const latest = [...record.versions].sort(
      (left, right) => right.versionNo - left.versionNo,
    )[0];
    if (!latest) {
      throw this.invalidState("Experiment has no versions.", {
        experimentId: record.experimentId,
      });
    }
    return latest;
  }

  private requireCurrentPublishedExperimentVersion(
    record: SandboxExperimentProgramRecord,
  ) {
    const version = this.selectExperimentVersion(record);
    if (!version) {
      throw this.invalidState(
        "Experiment does not have an effective published version.",
        { experimentId: record.experimentId },
      );
    }
    return version;
  }

  private requireJurisdiction(jurisdictionId: string) {
    const record = this.jurisdictions.get(jurisdictionId);
    if (!record) {
      throw this.notFound("Sandbox jurisdiction profile not found.", {
        jurisdictionId,
      });
    }
    return record;
  }

  private requireJurisdictionVersion(
    record: SandboxJurisdictionProfileRecord,
    versionId: string,
  ) {
    const version = record.versions.find((candidate) => candidate.versionId === versionId);
    if (!version) {
      throw this.notFound("Sandbox jurisdiction version not found.", {
        jurisdictionId: record.jurisdictionId,
        versionId,
      });
    }
    return version;
  }

  private requireLatestJurisdictionVersion(
    record: SandboxJurisdictionProfileRecord,
  ) {
    const latest = [...record.versions].sort(
      (left, right) => right.versionNo - left.versionNo,
    )[0];
    if (!latest) {
      throw this.invalidState("Jurisdiction has no versions.", {
        jurisdictionId: record.jurisdictionId,
      });
    }
    return latest;
  }

  private requireApprovalDocument(documentId: string) {
    const record = this.approvalDocuments.get(documentId);
    if (!record) {
      throw this.notFound("Sandbox approval document not found.", { documentId });
    }
    return record;
  }

  private requireApprovalDocumentVersion(
    record: ApprovalDocumentRecord,
    versionId: string,
  ) {
    const version = record.versions.find((candidate) => candidate.versionId === versionId);
    if (!version) {
      throw this.notFound("Sandbox approval document version not found.", {
        documentId: record.documentId,
        versionId,
      });
    }
    return version;
  }

  private requireLatestApprovalDocumentVersion(record: ApprovalDocumentRecord) {
    const latest = [...record.versions].sort(
      (left, right) => right.versionNo - left.versionNo,
    )[0];
    if (!latest) {
      throw this.invalidState("Approval document has no versions.", {
        documentId: record.documentId,
      });
    }
    return latest;
  }

  private assertNotArchived(
    archivedAt: string | null,
    resourceType: string,
    resourceId: string,
  ) {
    if (archivedAt) {
      throw this.conflict(`${resourceType} is archived.`, {
        resourceId,
        archivedAt,
      });
    }
  }

  private assertEffectiveRange(
    effectiveFrom?: string | null,
    effectiveUntil?: string | null,
  ) {
    if (!effectiveFrom || !effectiveUntil) {
      return;
    }
    const start = new Date(effectiveFrom).getTime();
    const end = new Date(effectiveUntil).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PHASE2_SANDBOX_GOVERNANCE_INVALID_EFFECTIVE_RANGE",
        "effectiveUntil must be greater than or equal to effectiveFrom.",
        { effectiveFrom, effectiveUntil },
      );
    }
  }

  private assertArtifact(fileName: string, contentType: string) {
    this.assertNonBlank(fileName, "artifactFileName");
    this.assertNonBlank(contentType, "artifactContentType");
  }

  private assertNonBlank(value: string | null | undefined, fieldName: string) {
    if (!value?.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PHASE2_SANDBOX_GOVERNANCE_CONFLICT",
        `${fieldName} is required.`,
        { fieldName },
      );
    }
  }

  private requireTrimmed(value: string, fieldName: string) {
    this.assertNonBlank(value, fieldName);
    return value.trim();
  }

  private normalizeNullableText(value?: string | null) {
    if (value === undefined || value === null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeNullableNumber(value?: number | null) {
    if (value === undefined || value === null) {
      return null;
    }
    if (!Number.isFinite(value) || value < 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PHASE2_SANDBOX_GOVERNANCE_CONFLICT",
        "Numeric governance values must be non-negative numbers.",
        { value },
      );
    }
    return value;
  }

  private normalizeTimestamp(
    value: string | null | undefined,
    fallback: string,
    fieldName: string,
  ) {
    const candidate = value?.trim() ? value : fallback;
    const timestamp = new Date(candidate).toISOString();
    if (timestamp === "Invalid Date") {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PHASE2_SANDBOX_GOVERNANCE_CONFLICT",
        `${fieldName} must be an ISO-8601 timestamp.`,
        { fieldName, value },
      );
    }
    return timestamp;
  }

  private normalizeNullableTimestamp(
    value: string | null | undefined,
    fieldName: string,
  ) {
    if (value === undefined || value === null || value.trim().length === 0) {
      return null;
    }
    return this.normalizeTimestamp(value, value, fieldName);
  }

  private normalizeStringArray(values?: string[]) {
    if (!values) {
      return [];
    }
    const normalized = values
      .map((value) => this.requireTrimmed(value, "array item"))
      .sort((left, right) => left.localeCompare(right));
    const unique = [...new Set(normalized)];
    if (unique.length !== normalized.length) {
      throw this.conflict("Duplicate identifiers are not allowed.", { values });
    }
    return unique;
  }

  private cloneRequirements(values: ProviderCapabilityRequirement[]) {
    return values.map((value) => ({
      capability: value.capability,
      required: Boolean(value.required),
      minSchemaVersion: this.normalizeNullableText(value.minSchemaVersion),
      notes: this.normalizeNullableText(value.notes),
    }));
  }

  private cloneNotificationMatrix(
    values: SandboxGovernanceNotificationMatrixEntry[],
  ) {
    return values.map((entry) => ({
      trigger: entry.trigger,
      recipients: entry.recipients.map((recipient) => ({
        recipientId: recipient.recipientId,
        kind: recipient.kind,
        target: recipient.target,
        channels: [...recipient.channels].sort(),
      })),
      escalationWithinMinutes: this.normalizeNullableNumber(
        entry.escalationWithinMinutes,
      ),
      retentionDays: this.normalizeNullableNumber(entry.retentionDays),
    }));
  }

  private mergePolicyVersions(
    patch?: Partial<SandboxGovernancePolicyVersionRefs>,
    base: SandboxGovernancePolicyVersionRefs = DEFAULT_POLICY_VERSIONS,
  ): SandboxGovernancePolicyVersionRefs {
    return {
      routePolicyVersion:
        patch?.routePolicyVersion !== undefined
          ? this.normalizeNullableText(patch.routePolicyVersion)
          : base.routePolicyVersion,
      schedulePolicyVersion:
        patch?.schedulePolicyVersion !== undefined
          ? this.normalizeNullableText(patch.schedulePolicyVersion)
          : base.schedulePolicyVersion,
      enrollmentPolicyVersion:
        patch?.enrollmentPolicyVersion !== undefined
          ? this.normalizeNullableText(patch.enrollmentPolicyVersion)
          : base.enrollmentPolicyVersion,
      capabilityPolicyVersion:
        patch?.capabilityPolicyVersion !== undefined
          ? this.normalizeNullableText(patch.capabilityPolicyVersion)
          : base.capabilityPolicyVersion,
      compliancePolicyVersion:
        patch?.compliancePolicyVersion !== undefined
          ? this.normalizeNullableText(patch.compliancePolicyVersion)
          : base.compliancePolicyVersion,
    };
  }

  private createArtifactDigest(contentBase64: string) {
    const payload = Buffer.from(contentBase64, "base64");
    return {
      byteSize: payload.byteLength,
      sha256: createHash("sha256").update(payload).digest("hex"),
    };
  }

  private computeStableHash(value: unknown) {
    return createHash("sha256").update(stableStringify(value)).digest("hex");
  }

  private cloneJson<T>(value: T): T {
    return structuredClone(value);
  }

  private notFound(message: string, details: Record<string, unknown>) {
    return new ApiRequestError(
      HttpStatus.NOT_FOUND,
      "PHASE2_SANDBOX_GOVERNANCE_NOT_FOUND",
      message,
      details,
    );
  }

  private conflict(message: string, details: Record<string, unknown>) {
    return new ApiRequestError(
      HttpStatus.CONFLICT,
      "PHASE2_SANDBOX_GOVERNANCE_CONFLICT",
      message,
      details,
    );
  }

  private invalidState(message: string, details: Record<string, unknown>) {
    return this.conflict(message, details);
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

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
