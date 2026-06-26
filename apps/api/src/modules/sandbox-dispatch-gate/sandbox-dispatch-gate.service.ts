import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, Logger, Optional } from "@nestjs/common";

import type {
  AuditLogRecord,
  GeoJsonMultiLineString,
  PassengerAcknowledgementRecord,
  PassengerDisclosureChannel,
  PassengerDisclosureMessageCatalogEntry,
  PassengerDisclosurePolicy,
  PassengerDisclosureRequirementSnapshot,
  RecordPassengerAcknowledgementCommand,
  SandboxDispatchDecision,
  SandboxDispatchReasonCode,
  SandboxScheduleWindow,
  UpsertPassengerDisclosureMessageCatalogEntryCommand,
  UpsertPassengerDisclosurePolicyCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { SandboxGovernanceService } from "../sandbox-governance/sandbox-governance.service";
import { resolveTeslaTelemetryQualityGateScore } from "../tesla-telemetry/tesla-telemetry.policy";
import { VehicleEvidenceService } from "../vehicle-evidence/vehicle-evidence.service";
import {
  SandboxDispatchGateRepository,
  type SandboxDispatchGateQueryExecutor,
} from "./sandbox-dispatch-gate.repository";
import type {
  SandboxDispatchGateInput,
  SandboxDispatchManualReleaseCommand,
  SandboxDispatchStoredEvaluationRecord,
} from "./sandbox-dispatch-gate.types";
import { SANDBOX_DISPATCH_ERROR_CODE_MAP } from "./sandbox-dispatch-gate.types";

const DEFAULT_MIN_SOC_PERCENT = 20;
const DEFAULT_MAX_ODOMETER_KM = 250_000;
const REQUIRED_PROVIDER_CAPABILITIES = [
  "av_dispatch",
  "telemetry_stream",
  "regulatory_event_feed",
  "evidence_recorder",
  "odd_geofence",
  "minimal_risk_condition",
] as const;

const BASELINE_DISCLOSURE_CATALOG_VERSION = "passenger_disclosure.v1";

const BASELINE_DISCLOSURE_MESSAGE_CATALOG: PassengerDisclosureMessageCatalogEntry[] =
  [
    {
      entryId: "pdc-v1-av-en-us",
      catalogVersion: BASELINE_DISCLOSURE_CATALOG_VERSION,
      messageCode: "sandbox_passenger_disclosure.av_program_notice",
      locale: "en-US",
      bodyText:
        "This trip may be fulfilled by an autonomous vehicle operating under the sandbox program, with remote oversight and a human fallback process available if conditions change.",
      legalApproved: true,
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z",
    },
    {
      entryId: "pdc-v1-av-zh-tw",
      catalogVersion: BASELINE_DISCLOSURE_CATALOG_VERSION,
      messageCode: "sandbox_passenger_disclosure.av_program_notice",
      locale: "zh-TW",
      bodyText:
        "本趟行程可能由沙盒計畫中的自動駕駛車輛執行，並提供遠端監看與必要時切換真人駕駛的處理流程。",
      legalApproved: false,
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z",
    },
  ];

@Injectable()
export class SandboxDispatchGateService {
  private readonly logger = new Logger(SandboxDispatchGateService.name);

  private lastDecision: SandboxDispatchDecision | null = null;
  private disclosurePolicies: PassengerDisclosurePolicy[] = [];
  private acknowledgementRecords: PassengerAcknowledgementRecord[] = [];
  private messageCatalogEntries = BASELINE_DISCLOSURE_MESSAGE_CATALOG.map(
    (entry) => ({ ...entry }),
  );
  private disclosureCacheLoaded = false;

  constructor(
    @Optional()
    private readonly vehicleEvidenceService?: VehicleEvidenceService,
    @Optional()
    private readonly sandboxGovernanceService?: SandboxGovernanceService,
    @Optional()
    private readonly repository?: SandboxDispatchGateRepository,
    @Optional()
    private readonly auditNotificationService?: AuditNotificationService,
  ) {}

  async upsertPassengerDisclosurePolicy(
    command: UpsertPassengerDisclosurePolicyCommand,
  ) {
    await this.ensureDisclosureCacheLoaded();
    const now = new Date().toISOString();
    const policyId = command.policyId?.trim() || randomUUID();
    const nextPolicy: PassengerDisclosurePolicy = {
      policyId,
      policyVersion: command.policyVersion,
      tenantId: command.tenantId?.trim() || null,
      businessDispatchSubtype: command.businessDispatchSubtype?.trim() || null,
      partnerEntrySlug: command.partnerEntrySlug?.trim() || null,
      active: command.active !== false,
      channelRules: command.channelRules.map((rule) => ({ ...rule })),
      createdAt:
        this.disclosurePolicies.find((policy) => policy.policyId === policyId)
          ?.createdAt ?? now,
      updatedAt: now,
    };

    this.disclosurePolicies = [
      nextPolicy,
      ...this.disclosurePolicies.filter(
        (policy) => policy.policyId !== policyId,
      ),
    ];
    if (this.repository) {
      await this.repository.upsertPassengerDisclosurePolicy(nextPolicy);
    }
    return this.clonePassengerDisclosurePolicy(nextPolicy);
  }

  async upsertPassengerDisclosureMessageCatalogEntry(
    command: UpsertPassengerDisclosureMessageCatalogEntryCommand,
  ) {
    await this.ensureDisclosureCacheLoaded();
    const now = new Date().toISOString();
    const existingEntry = this.findMessageCatalogEntry(
      command.messageCode,
      command.locale,
    );
    const entryId =
      command.entryId?.trim() ||
      existingEntry?.entryId ||
      `${command.catalogVersion}:${command.messageCode}:${command.locale}`;
    const nextEntry: PassengerDisclosureMessageCatalogEntry = {
      entryId,
      catalogVersion: command.catalogVersion,
      messageCode: command.messageCode,
      locale: command.locale,
      bodyText: command.bodyText,
      legalApproved: command.legalApproved,
      createdAt: existingEntry?.createdAt ?? now,
      updatedAt: now,
    };

    this.messageCatalogEntries = [
      nextEntry,
      ...this.messageCatalogEntries.filter(
        (entry) =>
          entry.entryId !== existingEntry?.entryId &&
          !this.matchesCatalogEntry(entry, command.messageCode, command.locale),
      ),
    ];
    if (this.repository) {
      await this.repository.upsertPassengerDisclosureMessageCatalogEntry(
        nextEntry,
      );
    }
    return this.cloneMessageCatalogEntry(nextEntry);
  }

  async listPassengerDisclosureMessageCatalogEntries() {
    await this.ensureDisclosureCacheLoaded();
    return this.messageCatalogEntries.map((entry) =>
      this.cloneMessageCatalogEntry(entry),
    );
  }

  async getPassengerDisclosurePolicy(policyId: string) {
    await this.ensureDisclosureCacheLoaded();
    const policy = this.disclosurePolicies.find(
      (candidate) => candidate.policyId === policyId,
    );
    if (!policy) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PASSENGER_DISCLOSURE_POLICY_NOT_FOUND",
        "Passenger disclosure policy was not found.",
        { policyId },
      );
    }
    return this.clonePassengerDisclosurePolicy(policy);
  }

  async resolvePassengerDisclosureForBooking(input: {
    tenantId: string | null;
    businessDispatchSubtype: string | null;
    partnerEntrySlug: string | null;
    channel: PassengerDisclosureChannel;
  }): Promise<PassengerDisclosureRequirementSnapshot | null> {
    await this.ensureDisclosureCacheLoaded();
    const policy = this.selectPassengerDisclosurePolicy(input);
    if (!policy) {
      return null;
    }
    const channelRule = policy.channelRules.find(
      (rule) => rule.channel === input.channel,
    );
    if (!channelRule) {
      return null;
    }
    return {
      channel: input.channel,
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      messageCode: this.messageCatalogEntries.some(
        (entry) => entry.messageCode === channelRule.messageCode,
      )
        ? channelRule.messageCode
        : null,
      requiresAcknowledgement: channelRule.requiresAcknowledgement,
      acknowledgementMode: channelRule.acknowledgementMode,
      acknowledgedAt: null,
      acknowledgementRecordId: null,
    };
  }

  async recordPassengerAcknowledgement(input: {
    bookingId: string;
    orderId: string;
    disclosure: PassengerDisclosureRequirementSnapshot;
    command?: RecordPassengerAcknowledgementCommand | null;
    executor?: SandboxDispatchGateQueryExecutor | null;
  }) {
    await this.ensureDisclosureCacheLoaded();
    if (!input.disclosure.requiresAcknowledgement) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PASSENGER_DISCLOSURE_ACKNOWLEDGEMENT_NOT_REQUIRED",
        "This disclosure does not require an acknowledgement.",
        {
          bookingId: input.bookingId,
          orderId: input.orderId,
          policyId: input.disclosure.policyId,
        },
      );
    }
    if (!input.disclosure.messageCode) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PASSENGER_DISCLOSURE_MESSAGE_REQUIRED",
        "Acknowledgement cannot be recorded because the disclosure message is missing.",
        {
          bookingId: input.bookingId,
          orderId: input.orderId,
          policyId: input.disclosure.policyId,
        },
      );
    }

    const acknowledgedAt =
      input.command?.acknowledgedAt ?? new Date().toISOString();
    const record: PassengerAcknowledgementRecord = {
      acknowledgementId: randomUUID(),
      bookingId: input.bookingId,
      orderId: input.orderId,
      policyId: input.disclosure.policyId,
      messageCode: input.disclosure.messageCode,
      channel: input.disclosure.channel,
      acknowledgementMode: input.disclosure.acknowledgementMode,
      actorType: input.command?.actorType ?? "passenger",
      actorRef: input.command?.actorRef?.trim() || null,
      acknowledgedAt,
      evidenceRef: input.command?.evidenceRef?.trim() || null,
      createdAt: acknowledgedAt,
    };

    this.acknowledgementRecords = [record, ...this.acknowledgementRecords];
    if (this.repository) {
      await this.repository.insertPassengerAcknowledgement(
        record,
        input.executor,
      );
    }

    return this.cloneAcknowledgementRecord(record);
  }

  async evaluateDispatch(
    input: SandboxDispatchGateInput,
    requestId?: string,
  ): Promise<SandboxDispatchDecision> {
    const { decision: result, evaluationSnapshot: normalized } =
      this.buildEvaluationRecord(input);

    this.lastDecision = result;
    this.persistEvaluation(
      { decision: result, evaluationSnapshot: normalized },
      "evaluate_dispatch",
    );
    this.logger.debug(
      `Sandbox dispatch evaluated ${result.orderId}/${result.vehicleId}: ${result.decision}`,
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "sandbox-dispatch-gate",
        actionName: "evaluate_dispatch",
        resourceType: "sandbox_dispatch_decision",
        resourceId: result.decisionId,
        newValuesSummary: {
          orderId: result.orderId,
          dispatchJobId: result.dispatchJobId,
          vehicleId: result.vehicleId,
          sandboxProgramId: result.sandboxProgramId,
          decision: result.decision,
          hardReasonCodes: result.hardReasonCodes,
          softReasonCodes: result.softReasonCodes,
          policyVersion: result.policyVersion,
          errorCodes: result.hardReasonCodes.map(
            (code) => SANDBOX_DISPATCH_ERROR_CODE_MAP[code],
          ),
        },
      },
      requestId,
    );

    return this.cloneDecision(result);
  }

  async assertAssignmentEligible(
    input: SandboxDispatchGateInput,
    requestId?: string,
  ) {
    const decision = await this.evaluateDispatch(input, requestId);
    if (
      decision.decision === "allow" ||
      decision.decision === "allow_with_safety_operator"
    ) {
      return decision;
    }

    const primaryReason =
      decision.hardReasonCodes[0] ?? decision.softReasonCodes[0];
    throw new ApiRequestError(
      HttpStatus.CONFLICT,
      primaryReason
        ? SANDBOX_DISPATCH_ERROR_CODE_MAP[primaryReason]
        : "SANDBOX_DISPATCH_BLOCKED",
      "Sandbox dispatch gate did not approve this assignment.",
      {
        orderId: decision.orderId,
        dispatchJobId: decision.dispatchJobId,
        vehicleId: decision.vehicleId,
        sandboxProgramId: decision.sandboxProgramId,
        decision: decision.decision,
        hardReasonCodes: decision.hardReasonCodes,
        softReasonCodes: decision.softReasonCodes,
        policyVersion: decision.policyVersion,
      },
    );
  }

  async recordManualRelease(
    input: SandboxDispatchGateInput,
    command: SandboxDispatchManualReleaseCommand,
    requestId?: string,
  ) {
    const existingRecord = await this.loadManualReleaseDecision(
      input.orderId,
      command.decisionId ?? null,
    );
    const decisionRecord =
      existingRecord ?? (await this.createManualReleaseDecisionBaseline(input));
    const decision = this.cloneDecision(decisionRecord.decision);
    const releaseAudit = {
      actorId: command.actorId,
      actorType: command.actorType ?? "ops_user",
      reason: command.reason,
      decisionId: decision.decisionId,
      releasedAt: new Date().toISOString(),
    };

    this.persistManualRelease(
      decisionRecord,
      releaseAudit,
      existingRecord !== null,
    );
    this.recordAudit(
      {
        actorId: command.actorId,
        actorType: command.actorType ?? "ops_user",
        tenantId: null,
        moduleName: "sandbox-dispatch-gate",
        actionName: "manual_release",
        resourceType: "sandbox_dispatch_decision",
        resourceId: decision.decisionId,
        newValuesSummary: {
          orderId: decision.orderId,
          dispatchJobId: decision.dispatchJobId,
          vehicleId: decision.vehicleId,
          sandboxProgramId: decision.sandboxProgramId,
          reason: command.reason,
          decision: decision.decision,
        },
      },
      requestId,
    );

    return {
      decision,
      manualReleaseRecorded: true,
      releaseAudit,
    };
  }

  shouldEvaluateSandboxAssignment(vehicleId: string) {
    return vehicleId.startsWith("veh-av");
  }

  async buildAssignmentGateInput(input: {
    orderId: string;
    dispatchJobId: string;
    vehicleId: string;
    driverId?: string | null;
    sandboxProgramId?: string | null;
    policyVersion?: string | null;
    requestedAt?: string | null;
    bookingWindow?: {
      start?: string | null;
      end?: string | null;
    } | null;
    pickup?: { lat?: number | null; lng?: number | null } | null;
    dropoff?: { lat?: number | null; lng?: number | null } | null;
    candidateRoute?: GeoJsonMultiLineString | null;
    entitlement?: { active?: boolean | null } | null;
    vehicleEnrollment?: SandboxDispatchGateInput["vehicleEnrollment"];
    safetyOperator?: SandboxDispatchGateInput["safetyOperator"];
    providerCapabilities?: SandboxDispatchGateInput["providerCapabilities"];
    telemetry?: SandboxDispatchGateInput["telemetry"];
    regulatory?: SandboxDispatchGateInput["regulatory"];
    recorder?: SandboxDispatchGateInput["recorder"];
    holdState?: SandboxDispatchGateInput["holdState"];
    limits?: SandboxDispatchGateInput["limits"];
    passengerDisclosure?: SandboxDispatchGateInput["passengerDisclosure"];
  }): Promise<SandboxDispatchGateInput> {
    const recorderSignal = this.vehicleEvidenceService?.getNoNewDispatchSignal(
      input.vehicleId,
    );
    const recorderRegistration = this.vehicleEvidenceService
      ?.listRecorders()
      .find((item) => item.vehicleId === input.vehicleId);
    const pickup =
      Number.isFinite(input.pickup?.lat) && Number.isFinite(input.pickup?.lng)
        ? { lat: input.pickup!.lat as number, lng: input.pickup!.lng as number }
        : null;
    const dropoff =
      Number.isFinite(input.dropoff?.lat) && Number.isFinite(input.dropoff?.lng)
        ? {
            lat: input.dropoff!.lat as number,
            lng: input.dropoff!.lng as number,
          }
        : null;
    const requestedAt = input.requestedAt ?? new Date().toISOString();
    const sandboxProgramId =
      input.sandboxProgramId ?? "phase2-tesla-fsd-sandbox-202606";
    const preselectedEnrollment =
      input.vehicleEnrollment ??
      this.selectVehicleEnrollment(
        input.vehicleId,
        sandboxProgramId,
        requestedAt,
      );
    const candidateRoute = input.candidateRoute ?? null;
    const governanceSnapshot = await this.resolveGovernanceSnapshot({
      sandboxProgramId,
      requestedAt,
      vehicleId: input.vehicleId,
      driverId: input.driverId ?? null,
      pickup,
      dropoff,
      candidateRoute,
      bookingWindow: {
        start: input.bookingWindow?.start ?? null,
        end: input.bookingWindow?.end ?? null,
      },
    });
    const enrollment =
      preselectedEnrollment ?? governanceSnapshot.vehicleEnrollment;
    const safetyOperator =
      input.safetyOperator ?? governanceSnapshot.safetyOperator;
    return {
      orderId: input.orderId,
      dispatchJobId: input.dispatchJobId,
      vehicleId: input.vehicleId,
      driverId: input.driverId ?? null,
      sandboxProgramId,
      policyVersion: input.policyVersion ?? "sandbox-dispatch-gate.v1",
      requestedAt,
      bookingWindow: {
        start: input.bookingWindow?.start ?? null,
        end: input.bookingWindow?.end ?? null,
      },
      candidateRoute,
      pickup,
      dropoff,
      entitlement: {
        active: input.entitlement?.active ?? null,
      },
      vehicleEnrollment: enrollment,
      safetyOperator,
      providerCapabilities: input.providerCapabilities ?? null,
      telemetry: input.telemetry ?? null,
      regulatory: input.regulatory ?? null,
      recorder: {
        healthy:
          input.recorder?.healthy ??
          (recorderSignal ? false : recorderRegistration ? true : null),
      },
      holdState: input.holdState ?? null,
      limits:
        input.limits ??
        (enrollment
          ? { maxConcurrentTrips: enrollment.maxConcurrentTrips ?? null }
          : null),
      passengerDisclosure: input.passengerDisclosure ?? null,
      operatingArea: {
        inBounds: governanceSnapshot.operatingArea.inBounds,
        boundaryRisk: governanceSnapshot.operatingArea.boundaryRisk,
        matchedAreaIds: governanceSnapshot.operatingArea.matchedAreaIds,
      },
      routeContainment: {
        contained: governanceSnapshot.routeContainment.contained,
        matchedRouteIds: governanceSnapshot.routeContainment.matchedRouteIds,
      },
    };
  }

  getLastDecision() {
    return this.lastDecision ? this.cloneDecision(this.lastDecision) : null;
  }

  async findDecisionForOrder(orderId: string, decisionId?: string | null) {
    const normalizedDecisionId = decisionId?.trim() ?? null;
    if (this.repository?.isEnabled()) {
      const record = normalizedDecisionId
        ? await this.repository.loadDecisionById(normalizedDecisionId)
        : await this.repository.loadLatestDecision(orderId);
      if (record && record.decision.orderId === orderId) {
        return this.cloneDecision(record.decision);
      }
    }

    if (
      this.lastDecision?.orderId === orderId &&
      (!normalizedDecisionId ||
        this.lastDecision.decisionId === normalizedDecisionId)
    ) {
      return this.cloneDecision(this.lastDecision);
    }

    return null;
  }

  private normalizeInput(
    input: SandboxDispatchGateInput,
    evaluatedAt: string,
  ): SandboxDispatchGateInput & {
    dispatchJobId: string | null;
    operatingArea: {
      inBounds: boolean;
      boundaryRisk: boolean;
      matchedAreaIds: string[];
    };
    safetyOperator: {
      required: boolean;
      available: boolean;
      safetyOperatorId: string | null;
      qualificationStatus:
        | "pending"
        | "qualified"
        | "suspended"
        | "revoked"
        | "expired"
        | null;
      approvedAreaIds: string[];
      approvedRouteIds: string[];
    };
    telemetry: {
      stale: boolean;
      minimalRiskConditionActive: boolean;
      socPercent: number | null;
      currentTripCount: number | null;
      odometerKm: number | null;
      qualityScore: number;
      providerHealthState:
        | "healthy"
        | "delayed"
        | "gap_detected"
        | "backfill"
        | "complete"
        | "incomplete_hold"
        | "regulator_data_incident"
        | null;
      dispatchHold: boolean;
    };
    regulatory: {
      approvalFresh: boolean;
      vehicleCertified: boolean;
    };
    recorder: { healthy: boolean };
    entitlement: { active: boolean };
    vehicleEnrollment: {
      status: "pending" | "active" | "suspended" | "revoked" | "expired" | null;
      approvedAreaIds: string[];
      approvedRouteIds: string[];
      maxConcurrentTrips: number | null;
    };
    routeContainment: { contained: boolean | null; matchedRouteIds: string[] };
    holdState: {
      activeSafetyIncident: boolean;
      programSuspended: boolean;
      vehicleHold: boolean;
    };
    providerCapabilities: Record<string, boolean | null>;
    limits: {
      minSocPercent: number;
      maxConcurrentTrips: number | null;
      maxOdometerKm: number;
    };
    passengerDisclosure: {
      channel: PassengerDisclosureChannel | null;
      policyId: string | null;
      policyVersion: string | null;
      messageCode: string | null;
      requiresAcknowledgement: boolean;
      acknowledgedAt: string | null;
    };
    requestedAt: string;
  } {
    const telemetryQualityGate = resolveTeslaTelemetryQualityGateScore();
    return {
      ...input,
      dispatchJobId: input.dispatchJobId ?? null,
      requestedAt: evaluatedAt,
      operatingArea: {
        inBounds: input.operatingArea?.inBounds === true,
        boundaryRisk: input.operatingArea?.boundaryRisk === true,
        matchedAreaIds: [...(input.operatingArea?.matchedAreaIds ?? [])],
      },
      safetyOperator: {
        required: input.safetyOperator?.required !== false,
        available: input.safetyOperator?.available === true,
        safetyOperatorId: input.safetyOperator?.safetyOperatorId ?? null,
        qualificationStatus: input.safetyOperator?.qualificationStatus ?? null,
        approvedAreaIds: [...(input.safetyOperator?.approvedAreaIds ?? [])],
        approvedRouteIds: [...(input.safetyOperator?.approvedRouteIds ?? [])],
      },
      telemetry: {
        stale: input.telemetry?.stale !== false,
        minimalRiskConditionActive:
          input.telemetry?.minimalRiskConditionActive === true,
        socPercent: input.telemetry?.socPercent ?? null,
        currentTripCount: input.telemetry?.currentTripCount ?? null,
        odometerKm: input.telemetry?.odometerKm ?? null,
        qualityScore: input.telemetry?.qualityScore ?? telemetryQualityGate,
        providerHealthState: input.telemetry?.providerHealthState ?? null,
        dispatchHold: input.telemetry?.dispatchHold === true,
      },
      regulatory: {
        approvalFresh: input.regulatory?.approvalFresh === true,
        vehicleCertified: input.regulatory?.vehicleCertified === true,
      },
      recorder: {
        healthy: input.recorder?.healthy === true,
      },
      entitlement: {
        active: input.entitlement?.active === true,
      },
      vehicleEnrollment: {
        status: input.vehicleEnrollment?.status ?? null,
        approvedAreaIds: [...(input.vehicleEnrollment?.approvedAreaIds ?? [])],
        approvedRouteIds: [
          ...(input.vehicleEnrollment?.approvedRouteIds ?? []),
        ],
        maxConcurrentTrips: input.vehicleEnrollment?.maxConcurrentTrips ?? null,
      },
      routeContainment: {
        contained: input.routeContainment?.contained ?? null,
        matchedRouteIds: [...(input.routeContainment?.matchedRouteIds ?? [])],
      },
      holdState: {
        activeSafetyIncident: input.holdState?.activeSafetyIncident === true,
        programSuspended: input.holdState?.programSuspended === true,
        vehicleHold: input.holdState?.vehicleHold === true,
      },
      providerCapabilities: {
        av_dispatch: input.providerCapabilities?.av_dispatch ?? null,
        remote_command: input.providerCapabilities?.remote_command ?? null,
        telemetry_stream: input.providerCapabilities?.telemetry_stream ?? null,
        regulatory_event_feed:
          input.providerCapabilities?.regulatory_event_feed ?? null,
        evidence_recorder:
          input.providerCapabilities?.evidence_recorder ?? null,
        odd_geofence: input.providerCapabilities?.odd_geofence ?? null,
        minimal_risk_condition:
          input.providerCapabilities?.minimal_risk_condition ?? null,
      },
      limits: {
        minSocPercent: input.limits?.minSocPercent ?? DEFAULT_MIN_SOC_PERCENT,
        maxConcurrentTrips: input.limits?.maxConcurrentTrips ?? null,
        maxOdometerKm: input.limits?.maxOdometerKm ?? DEFAULT_MAX_ODOMETER_KM,
      },
      passengerDisclosure: {
        channel: input.passengerDisclosure?.channel ?? null,
        policyId: input.passengerDisclosure?.policyId ?? null,
        policyVersion: input.passengerDisclosure?.policyVersion ?? null,
        messageCode: input.passengerDisclosure?.messageCode ?? null,
        requiresAcknowledgement:
          input.passengerDisclosure?.requiresAcknowledgement === true,
        acknowledgedAt: input.passengerDisclosure?.acknowledgedAt ?? null,
      },
    };
  }

  private collectHardReasons(
    input: ReturnType<SandboxDispatchGateService["normalizeInput"]>,
  ) {
    const reasons: SandboxDispatchReasonCode[] = [];

    if (!input.entitlement.active) {
      reasons.push("REGULATORY_APPROVAL_MISSING");
    }
    if (!this.isBookingWindowEligible(input)) {
      reasons.push("ODD_OUT_OF_BOUNDS");
    }
    if (
      !input.operatingArea.inBounds ||
      input.routeContainment.contained === false
    ) {
      reasons.push("ODD_OUT_OF_BOUNDS");
    }
    if (input.holdState.programSuspended || input.holdState.vehicleHold) {
      reasons.push("SANDBOX_PROGRAM_SUSPENDED");
    }
    if (input.holdState.activeSafetyIncident) {
      reasons.push("ACTIVE_SAFETY_INCIDENT");
    }
    if (input.vehicleEnrollment.status !== "active") {
      reasons.push("REGULATORY_APPROVAL_MISSING");
    }
    if (!this.hasApprovedAreaCoverage(input)) {
      reasons.push("ODD_OUT_OF_BOUNDS");
    }
    if (!this.hasApprovedRouteCoverage(input)) {
      reasons.push("ODD_OUT_OF_BOUNDS");
    }
    if (!input.regulatory.approvalFresh) {
      reasons.push("REGULATORY_APPROVAL_MISSING");
    }
    if (!input.regulatory.vehicleCertified) {
      reasons.push("VEHICLE_NOT_CERTIFIED");
    }
    if (!input.recorder.healthy) {
      reasons.push("RECORDER_UNHEALTHY");
    }
    if (input.telemetry.stale) {
      reasons.push("TELEMETRY_STALE");
    }
    if (
      input.telemetry.dispatchHold ||
      input.telemetry.qualityScore < resolveTeslaTelemetryQualityGateScore() ||
      input.telemetry.providerHealthState === "incomplete_hold" ||
      input.telemetry.providerHealthState === "regulator_data_incident"
    ) {
      reasons.push("TELEMETRY_STALE");
    }
    if (input.telemetry.minimalRiskConditionActive) {
      reasons.push("MINIMAL_RISK_CONDITION_ACTIVE");
    }
    if (
      input.telemetry.socPercent === null ||
      input.telemetry.socPercent < input.limits.minSocPercent
    ) {
      reasons.push("TELEMETRY_STALE");
    }
    if (
      input.limits.maxConcurrentTrips !== null &&
      (input.telemetry.currentTripCount === null ||
        input.telemetry.currentTripCount >= input.limits.maxConcurrentTrips)
    ) {
      reasons.push("REGULATORY_APPROVAL_MISSING");
    }
    if (
      input.telemetry.odometerKm !== null &&
      input.telemetry.odometerKm > input.limits.maxOdometerKm
    ) {
      reasons.push("VEHICLE_NOT_CERTIFIED");
    }
    for (const capability of REQUIRED_PROVIDER_CAPABILITIES) {
      if (input.providerCapabilities[capability] !== true) {
        reasons.push("PROVIDER_CAPABILITY_MISSING");
        break;
      }
    }
    if (!input.passengerDisclosure.policyId) {
      reasons.push("PASSENGER_DISCLOSURE_POLICY_MISSING");
    }
    if (!input.passengerDisclosure.messageCode) {
      reasons.push("PASSENGER_DISCLOSURE_MESSAGE_MISSING");
    }
    if (
      input.passengerDisclosure.requiresAcknowledgement &&
      !input.passengerDisclosure.acknowledgedAt
    ) {
      reasons.push("PASSENGER_ACKNOWLEDGEMENT_REQUIRED");
    }

    return [...new Set(reasons)];
  }

  private collectSoftReasons(
    input: ReturnType<SandboxDispatchGateService["normalizeInput"]>,
  ) {
    const reasons: SandboxDispatchReasonCode[] = [];
    if (input.operatingArea.boundaryRisk) {
      reasons.push("ODD_BOUNDARY_RISK");
    }
    if (input.safetyOperator.required) {
      reasons.push(
        input.safetyOperator.available
          ? "SAFETY_OPERATOR_REQUIRED"
          : "SAFETY_OPERATOR_UNAVAILABLE",
      );
    }
    return [...new Set(reasons)];
  }

  private async resolveGovernanceSnapshot(input: {
    sandboxProgramId: string;
    requestedAt: string;
    vehicleId: string;
    driverId: string | null;
    pickup: { lat: number; lng: number } | null;
    dropoff: { lat: number; lng: number } | null;
    candidateRoute: GeoJsonMultiLineString | null;
    bookingWindow: { start: string | null; end: string | null };
  }) {
    const vehicleEnrollment = this.selectVehicleEnrollment(
      input.vehicleId,
      input.sandboxProgramId,
      input.requestedAt,
    );
    const safetyOperator = this.selectSafetyOperatorQualification(
      input.driverId,
      input.sandboxProgramId,
      input.requestedAt,
    );

    const [pickupValidation, dropoffValidation, routeValidation] =
      await Promise.all([
        input.pickup
          ? this.sandboxGovernanceService?.validatePointInApprovedArea({
              sandboxProgramId: input.sandboxProgramId,
              point: input.pickup,
              asOf: input.requestedAt,
            })
          : Promise.resolve(null),
        input.dropoff
          ? this.sandboxGovernanceService?.validatePointInApprovedArea({
              sandboxProgramId: input.sandboxProgramId,
              point: input.dropoff,
              asOf: input.requestedAt,
            })
          : Promise.resolve(null),
        input.candidateRoute
          ? this.sandboxGovernanceService?.validateRouteContainment({
              sandboxProgramId: input.sandboxProgramId,
              candidatePath: input.candidateRoute,
              asOf: input.requestedAt,
              toleranceMeters: 25,
            })
          : Promise.resolve(null),
      ]);

    const matchedAreaIds = new Set<string>();
    for (const match of pickupValidation?.matches ?? []) {
      if (match.areaKind === "operating_area") {
        matchedAreaIds.add(match.areaId);
      }
    }
    for (const match of dropoffValidation?.matches ?? []) {
      if (match.areaKind === "operating_area") {
        matchedAreaIds.add(match.areaId);
      }
    }

    const relevantSchedules = this.collectRelevantSchedules(
      input.sandboxProgramId,
      [...matchedAreaIds],
      routeValidation?.routeIds ?? [],
    );
    const scheduleEligible = this.isWithinAnySchedule(
      relevantSchedules,
      input.bookingWindow.start ?? input.requestedAt,
      input.bookingWindow.end ?? input.bookingWindow.start ?? input.requestedAt,
    );

    return {
      vehicleEnrollment: vehicleEnrollment
        ? {
            status: vehicleEnrollment.status,
            approvedAreaIds: [...vehicleEnrollment.approvedAreaIds],
            approvedRouteIds: [...vehicleEnrollment.approvedRouteIds],
            maxConcurrentTrips: vehicleEnrollment.maxConcurrentTrips,
          }
        : null,
      safetyOperator: {
        required: true,
        available: safetyOperator !== null,
        safetyOperatorId: input.driverId,
        qualificationStatus: safetyOperator?.status ?? null,
        approvedAreaIds: [...(safetyOperator?.approvedAreaIds ?? [])],
        approvedRouteIds: [...(safetyOperator?.approvedRouteIds ?? [])],
      },
      operatingArea: {
        inBounds:
          scheduleEligible &&
          (input.pickup ? pickupValidation?.inApprovedArea === true : false) &&
          (input.dropoff ? dropoffValidation?.inApprovedArea === true : false),
        boundaryRisk:
          (pickupValidation?.inApprovedArea ?? false) !==
          (dropoffValidation?.inApprovedArea ?? false),
        matchedAreaIds: [...matchedAreaIds],
      },
      routeContainment: {
        contained: input.candidateRoute
          ? (routeValidation?.contained ?? false)
          : null,
        matchedRouteIds: [...(routeValidation?.routeIds ?? [])],
      },
    };
  }

  private selectVehicleEnrollment(
    vehicleId: string,
    sandboxProgramId: string,
    asOf: string,
  ) {
    const enrollments =
      this.sandboxGovernanceService
        ?.listVehicleEnrollments()
        .filter(
          (item) =>
            item.vehicleId === vehicleId &&
            item.sandboxProgramId === sandboxProgramId &&
            this.isEffective(item.effectiveFrom, item.effectiveUntil, asOf),
        ) ?? [];
    return (
      [...enrollments].sort((left, right) => right.version - left.version)[0] ??
      null
    );
  }

  private selectSafetyOperatorQualification(
    driverId: string | null,
    sandboxProgramId: string,
    asOf: string,
  ) {
    if (!driverId) {
      return null;
    }
    const qualifications =
      this.sandboxGovernanceService
        ?.listSafetyOperatorQualifications()
        .filter(
          (item) =>
            item.safetyOperatorId === driverId &&
            item.sandboxProgramId === sandboxProgramId &&
            this.isEffective(item.effectiveFrom, item.effectiveUntil, asOf),
        ) ?? [];
    return (
      [...qualifications].sort(
        (left, right) => right.version - left.version,
      )[0] ?? null
    );
  }

  private collectRelevantSchedules(
    sandboxProgramId: string,
    areaIds: string[],
    routeIds: string[],
  ) {
    const areaSet = new Set(areaIds);
    const routeSet = new Set(routeIds);
    const areaSchedules =
      this.sandboxGovernanceService
        ?.listOperatingAreas()
        .filter(
          (item) =>
            item.sandboxProgramId === sandboxProgramId &&
            areaSet.has(item.areaId),
        )
        .flatMap((item) => item.schedules) ?? [];
    const routeSchedules =
      this.sandboxGovernanceService
        ?.listRoutes()
        .filter(
          (item) =>
            item.sandboxProgramId === sandboxProgramId &&
            routeSet.has(item.routeId),
        )
        .flatMap((item) => item.schedules) ?? [];
    return [...areaSchedules, ...routeSchedules];
  }

  private isWithinAnySchedule(
    schedules: SandboxScheduleWindow[],
    startAt: string,
    endAt: string,
  ) {
    if (schedules.length === 0) {
      return false;
    }
    return schedules.some(
      (schedule) =>
        this.scheduleContains(schedule, startAt) &&
        this.scheduleContains(schedule, endAt),
    );
  }

  private scheduleContains(schedule: SandboxScheduleWindow, at: string) {
    if (
      !schedule.active ||
      !this.isEffective(schedule.effectiveFrom, schedule.effectiveUntil, at)
    ) {
      return false;
    }
    const date = new Date(at);
    const day = date.getUTCDay();
    if (!schedule.daysOfWeek.includes(day)) {
      return false;
    }
    const time = at.slice(11, 16);
    return time >= schedule.startLocalTime && time <= schedule.endLocalTime;
  }

  private isEffective(
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

  private isBookingWindowEligible(
    input: ReturnType<SandboxDispatchGateService["normalizeInput"]>,
  ) {
    return Boolean(input.bookingWindow?.start && input.bookingWindow?.end);
  }

  private hasApprovedAreaCoverage(
    input: ReturnType<SandboxDispatchGateService["normalizeInput"]>,
  ) {
    if (input.operatingArea.matchedAreaIds.length === 0) {
      return false;
    }
    if (
      !input.operatingArea.matchedAreaIds.some((areaId) =>
        input.vehicleEnrollment.approvedAreaIds.includes(areaId),
      )
    ) {
      return false;
    }
    if (
      input.safetyOperator.required &&
      !input.operatingArea.matchedAreaIds.some((areaId) =>
        input.safetyOperator.approvedAreaIds.includes(areaId),
      )
    ) {
      return false;
    }
    return true;
  }

  private hasApprovedRouteCoverage(
    input: ReturnType<SandboxDispatchGateService["normalizeInput"]>,
  ) {
    if (input.routeContainment.contained !== true) {
      return false;
    }
    if (
      !input.routeContainment.matchedRouteIds.some((routeId) =>
        input.vehicleEnrollment.approvedRouteIds.includes(routeId),
      )
    ) {
      return false;
    }
    if (
      input.safetyOperator.required &&
      !input.routeContainment.matchedRouteIds.some((routeId) =>
        input.safetyOperator.approvedRouteIds.includes(routeId),
      )
    ) {
      return false;
    }
    return true;
  }

  private async ensureDisclosureCacheLoaded() {
    if (this.disclosureCacheLoaded || !this.repository?.isEnabled()) {
      this.disclosureCacheLoaded = true;
      return;
    }

    const [policies, catalogEntries, acknowledgements] = await Promise.all([
      this.repository.listPassengerDisclosurePolicies(),
      this.repository.listPassengerDisclosureMessageCatalogEntries(),
      this.repository.listPassengerAcknowledgements(),
    ]);

    this.disclosurePolicies = policies.map((policy) =>
      this.clonePassengerDisclosurePolicy(policy),
    );
    this.messageCatalogEntries =
      this.mergeBaselineCatalogEntries(catalogEntries);
    this.acknowledgementRecords = acknowledgements.map((record) =>
      this.cloneAcknowledgementRecord(record),
    );
    this.disclosureCacheLoaded = true;
  }

  private mergeBaselineCatalogEntries(
    entries: PassengerDisclosureMessageCatalogEntry[],
  ) {
    const deduped = new Map<string, PassengerDisclosureMessageCatalogEntry>();
    for (const entry of [...BASELINE_DISCLOSURE_MESSAGE_CATALOG, ...entries]) {
      deduped.set(
        this.messageCatalogKey(entry.messageCode, entry.locale),
        this.cloneMessageCatalogEntry(entry),
      );
    }
    return [...deduped.values()];
  }

  private findMessageCatalogEntry(messageCode: string, locale: string) {
    return this.messageCatalogEntries.find((entry) =>
      this.matchesCatalogEntry(entry, messageCode, locale),
    );
  }

  private matchesCatalogEntry(
    entry: PassengerDisclosureMessageCatalogEntry,
    messageCode: string,
    locale: string,
  ) {
    return (
      this.messageCatalogKey(entry.messageCode, entry.locale) ===
      this.messageCatalogKey(messageCode, locale)
    );
  }

  private messageCatalogKey(messageCode: string, locale: string) {
    return `${messageCode}::${locale}`;
  }

  private selectPassengerDisclosurePolicy(input: {
    tenantId: string | null;
    businessDispatchSubtype: string | null;
    partnerEntrySlug: string | null;
    channel: PassengerDisclosureChannel;
  }) {
    const candidates = this.disclosurePolicies.filter((policy) => {
      if (!policy.active) {
        return false;
      }
      if (
        policy.tenantId !== null &&
        policy.tenantId !== (input.tenantId?.trim() || null)
      ) {
        return false;
      }
      if (
        policy.businessDispatchSubtype !== null &&
        policy.businessDispatchSubtype !==
          (input.businessDispatchSubtype?.trim() || null)
      ) {
        return false;
      }
      if (
        policy.partnerEntrySlug !== null &&
        policy.partnerEntrySlug !== (input.partnerEntrySlug?.trim() || null)
      ) {
        return false;
      }
      return policy.channelRules.some((rule) => rule.channel === input.channel);
    });

    const sorted = [...candidates].sort((left, right) => {
      const specificity =
        Number(left.partnerEntrySlug !== null) +
        Number(left.businessDispatchSubtype !== null) +
        Number(left.tenantId !== null) -
        (Number(right.partnerEntrySlug !== null) +
          Number(right.businessDispatchSubtype !== null) +
          Number(right.tenantId !== null));
      if (specificity !== 0) {
        return -specificity;
      }
      return right.updatedAt.localeCompare(left.updatedAt);
    });

    return sorted[0] ?? null;
  }

  async hasPassengerDisclosureMessage(
    messageCode: string,
    locale?: string | null,
  ): Promise<boolean> {
    await this.ensureDisclosureCacheLoaded();
    const normalizedLocale = locale?.trim() || null;
    return this.messageCatalogEntries.some(
      (entry) =>
        entry.messageCode === messageCode &&
        (normalizedLocale === null || entry.locale === normalizedLocale),
    );
  }

  private clonePassengerDisclosurePolicy(
    policy: PassengerDisclosurePolicy,
  ): PassengerDisclosurePolicy {
    return {
      ...policy,
      channelRules: policy.channelRules.map((rule) => ({ ...rule })),
    };
  }

  private cloneMessageCatalogEntry(
    entry: PassengerDisclosureMessageCatalogEntry,
  ): PassengerDisclosureMessageCatalogEntry {
    return { ...entry };
  }

  private cloneAcknowledgementRecord(
    record: PassengerAcknowledgementRecord,
  ): PassengerAcknowledgementRecord {
    return { ...record };
  }

  private cloneDecision(decision: SandboxDispatchDecision) {
    return {
      ...decision,
      hardReasonCodes: [...decision.hardReasonCodes],
      softReasonCodes: [...decision.softReasonCodes],
    };
  }

  private persistEvaluation(
    record: Parameters<SandboxDispatchGateRepository["persistEvaluation"]>[0],
    context: string,
  ) {
    if (!this.repository) {
      return;
    }

    void this.repository
      .persistEvaluation(record)
      .catch((error) =>
        this.repository!.reportPersistenceFailure(error, context),
      );
  }

  private persistManualRelease(
    record: SandboxDispatchStoredEvaluationRecord,
    releaseAudit: Record<string, unknown>,
    existingRecord: boolean,
  ) {
    if (!this.repository) {
      return;
    }

    if (existingRecord) {
      void this.repository
        .updateReleaseAudit(record.decision.decisionId, releaseAudit)
        .catch((error) =>
          this.repository!.reportPersistenceFailure(error, "manual_release"),
        );
      return;
    }

    void this.repository
      .persistEvaluation({
        decision: record.decision,
        evaluationSnapshot: record.evaluationSnapshot,
        releaseAudit,
      })
      .catch((error) =>
        this.repository!.reportPersistenceFailure(error, "manual_release"),
      );
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "requestId" | "auditId" | "createdAt">,
    requestId?: string,
  ) {
    const payload = requestId ? { ...input, requestId } : input;
    this.auditNotificationService?.recordAuditLog(payload);
  }

  private async loadManualReleaseDecision(
    orderId: string,
    decisionId: string | null,
  ) {
    if (!this.repository) {
      return null;
    }

    if (decisionId) {
      const record = await this.repository.loadDecisionById(decisionId);
      if (!record || record.decision.orderId !== orderId) {
        throw new ApiRequestError(
          HttpStatus.NOT_FOUND,
          "SANDBOX_DISPATCH_DECISION_NOT_FOUND",
          "Sandbox dispatch decision not found for manual release.",
          {
            orderId,
            decisionId,
          },
        );
      }

      return record;
    }

    return this.repository.loadLatestDecision(orderId);
  }

  private async createManualReleaseDecisionBaseline(
    input: SandboxDispatchGateInput,
  ): Promise<SandboxDispatchStoredEvaluationRecord> {
    const record = this.buildEvaluationRecord(input);
    this.lastDecision = this.cloneDecision(record.decision);
    return { ...record, releaseAudit: null };
  }

  private buildEvaluationRecord(
    input: SandboxDispatchGateInput,
  ): Omit<SandboxDispatchStoredEvaluationRecord, "releaseAudit"> {
    const evaluatedAt = input.requestedAt ?? new Date().toISOString();
    const normalized = this.normalizeInput(input, evaluatedAt);
    const hardReasonCodes = this.collectHardReasons(normalized);
    const softReasonCodes = this.collectSoftReasons(normalized);

    let decision: SandboxDispatchDecision["decision"] = "allow";
    let requiredSafetyOperatorId: string | null = null;
    if (hardReasonCodes.length > 0) {
      decision = "block";
    } else if (normalized.safetyOperator.required) {
      decision =
        normalized.safetyOperator.available &&
        normalized.safetyOperator.qualificationStatus === "qualified"
          ? "allow_with_safety_operator"
          : "defer";
      requiredSafetyOperatorId =
        normalized.safetyOperator.safetyOperatorId ?? null;
    } else if (softReasonCodes.length > 0) {
      decision = "defer";
    }

    return {
      decision: {
        decisionId: randomUUID(),
        orderId: normalized.orderId,
        dispatchJobId: normalized.dispatchJobId,
        vehicleId: normalized.vehicleId,
        sandboxProgramId: normalized.sandboxProgramId,
        decision,
        fallbackRequired: decision === "block",
        oddInBounds: normalized.operatingArea.inBounds,
        hardReasonCodes,
        softReasonCodes,
        requiredSafetyOperatorId,
        policyVersion: normalized.policyVersion,
        evaluatedAt,
      },
      evaluationSnapshot: normalized,
    };
  }
}
