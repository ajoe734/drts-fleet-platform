import { randomUUID } from "node:crypto";

import {
  HttpStatus,
  Injectable,
  Logger,
  Optional,
} from "@nestjs/common";

import type {
  ActionReceipt,
  AssignRocAlertCommand,
  CorrelatedTakeoverCase,
  CreateIncidentCommand,
  CreateManualTakeoverCorrelationCommand,
  EvidenceDiscrepancyCase,
  ManualTakeoverCorrelationLink,
  NotifyRocAlertCommand,
  OpenRocIncidentCommand,
  ResourceActionDescriptor,
  RocAlertActionCommand,
  RocAlertReadModel,
  RocAlertSeverity,
  RocAlertStatus,
  RocAlertType,
  RocDataFreshness,
  RocOverviewReadModel,
  RocProviderHealthReadModel,
  RocProviderHealthSnapshot,
  RocTakeoverResponseRecord,
  RocTripReadModel,
  RocTripStatus,
  RocVehicleReadModel,
  SandboxDispatchReasonCode,
  SafetyOperatorTakeoverReport,
  StartRocEvidenceFreezeCommand,
  TeslaAutonomyTransitionEvent,
  TeslaVehicleStateSnapshot,
  RequestRocSafetyActionCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { IncidentService } from "../incident/incident.service";
import { SafetyOperatorService } from "../safety-operator/safety-operator.service";
import { TeslaIntegrationService } from "../tesla-integration/tesla-integration.service";
import { VehicleEvidenceService } from "../vehicle-evidence/vehicle-evidence.service";

const PRIORITY_ONE_WINDOW_MS = 5 * 60 * 1000;
const PRIORITY_TWO_WINDOW_MS = 10 * 60 * 1000;
const DISCREPANCY_WINDOW_MS = 2 * 60 * 1000;
const TELEMETRY_STALE_AFTER_MS = 30 * 1000;
const REGULATORY_STALE_AFTER_MS = 5 * 60 * 1000;

const INTERNAL_SYSTEM_IDENTITY: BootstrapRequestIdentity = {
  authMode: "bootstrap_headers",
  actorType: "system",
  actorId: "roc-operations-service",
  realm: "system",
  tenantId: null,
  roleFamilies: ["ops"],
  roles: ["system"],
  scopes: [],
  requestId: "roc-operations-service",
};

type RocVehicleRestrictionState = {
  vehicleId: string;
  orderId: string | null;
  sandboxProgramId: string | null;
  requestedAt: string;
  requestedBy: string;
  reason: string | null;
  sourceAlertId: string;
};

type RocEvidenceFreezeState = RocVehicleRestrictionState & {
  retentionHours: number | null;
};

type RocAlertNotificationRecord = {
  channel: NotifyRocAlertCommand["channel"];
  target: string;
  message: string | null;
  note: string | null;
  sentAt: string;
  sentBy: string;
};

type RocAlertWorkflowState = {
  alertId: string;
  openedAt: string;
  updatedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  assignedTo: string | null;
  assignedAt: string | null;
  linkedIncidentId: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionReason: string | null;
  notifications: RocAlertNotificationRecord[];
  safetyOperatorAssignmentId: string | null;
};

type DerivedRocAlert = {
  alertId: string;
  alertType: RocAlertType;
  severity: RocAlertSeverity;
  title: string;
  summary: string;
  vehicleId: string | null;
  orderId: string | null;
  sandboxProgramId: string | null;
  providerCode: string | null;
  sourceRecordId: string | null;
  openedAt: string;
  updatedAt: string;
  sourceActive: boolean;
  resolveBlockedWhileSourceActive: boolean;
};

type VehicleContext = {
  vehicleId: string;
  sandboxProgramId: string | null;
  currentOrderId: string | null;
  safetyOperatorId: string | null;
  telemetrySnapshot: TeslaVehicleStateSnapshot | null;
  telemetryFreshness: RocDataFreshness;
  regulatoryFreshness: RocDataFreshness;
  gateReasonCodes: SandboxDispatchReasonCode[];
  stopNewDispatchActive: boolean;
  operationalHoldActive: boolean;
  evidenceFreezeActive: boolean;
  humanFallbackActive: boolean;
};

type DispatchRestrictionSnapshot = {
  reasonCodes: SandboxDispatchReasonCode[];
  stopNewDispatchActive: boolean;
  operationalHoldActive: boolean;
  humanFallbackActive: boolean;
};

@Injectable()
export class RocOperationsService {
  private readonly logger = new Logger(RocOperationsService.name);

  private teslaTransitionEvents: TeslaAutonomyTransitionEvent[] = [];
  private takeoverResponses: RocTakeoverResponseRecord[] = [];
  private manualCorrelations: ManualTakeoverCorrelationLink[] = [];

  private readonly alertStates = new Map<string, RocAlertWorkflowState>();
  private readonly stopNewDispatchByVehicle = new Map<
    string,
    RocVehicleRestrictionState
  >();
  private readonly operationalHoldsByVehicle = new Map<
    string,
    RocVehicleRestrictionState
  >();
  private readonly evidenceFreezesByVehicle = new Map<
    string,
    RocEvidenceFreezeState
  >();
  private readonly humanFallbacksByVehicle = new Map<
    string,
    RocVehicleRestrictionState
  >();

  constructor(
    private readonly safetyOperatorService: SafetyOperatorService,
    @Optional() private readonly incidentService?: IncidentService,
    @Optional() private readonly vehicleEvidenceService?: VehicleEvidenceService,
    @Optional() private readonly teslaIntegrationService?: TeslaIntegrationService,
  ) {}

  listTeslaAutonomyTransitionEvents() {
    return this.teslaTransitionEvents.map((event) => this.cloneTeslaEvent(event));
  }

  recordTeslaAutonomyTransitionEvent(event: TeslaAutonomyTransitionEvent) {
    const existing = this.teslaTransitionEvents.find(
      (candidate) => candidate.eventId === event.eventId,
    );
    if (existing) {
      return this.cloneTeslaEvent(existing);
    }

    const stored = this.cloneTeslaEvent(event);
    this.teslaTransitionEvents = [stored, ...this.teslaTransitionEvents];
    return this.cloneTeslaEvent(stored);
  }

  listRocTakeoverResponseRecords() {
    return this.takeoverResponses.map((record) => this.cloneRocResponse(record));
  }

  recordRocTakeoverResponseRecord(record: RocTakeoverResponseRecord) {
    const existing = this.takeoverResponses.find(
      (candidate) => candidate.responseId === record.responseId,
    );
    if (existing) {
      return this.cloneRocResponse(existing);
    }

    const stored = this.cloneRocResponse(record);
    this.takeoverResponses = [stored, ...this.takeoverResponses];
    return this.cloneRocResponse(stored);
  }

  listManualTakeoverCorrelations() {
    return this.manualCorrelations.map((link) => this.cloneManualLink(link));
  }

  createManualTakeoverCorrelation(
    command: CreateManualTakeoverCorrelationCommand,
  ) {
    const existing = this.manualCorrelations.find(
      (candidate) => candidate.manualLinkId === command.manualLinkId,
    );
    if (existing) {
      return this.cloneManualLink(existing);
    }

    const stored: ManualTakeoverCorrelationLink = {
      ...command,
      note: command.note?.trim() || null,
    };
    this.manualCorrelations = [stored, ...this.manualCorrelations];
    return this.cloneManualLink(stored);
  }

  listAlerts(
    identity: BootstrapRequestIdentity | null,
  ): RocAlertReadModel[] {
    return this.collectAlerts(identity);
  }

  getOverview(
    identity: BootstrapRequestIdentity | null,
  ): RocOverviewReadModel {
    const alerts = this.collectAlerts(identity);
    const trips = this.listTrips(identity);
    const vehicles = this.listVehicles(identity);
    const providerHealth = this.getProviderHealthSnapshot();

    return {
      generatedAt: new Date().toISOString(),
      activeVehicleCount: vehicles.length,
      activeTripCount: trips.filter((trip) => trip.status !== "completed").length,
      activeTakeoverCount: this.listTakeovers().filter((candidate) =>
        this.isTakeoverActive(candidate),
      ).length,
      openAlertCount: alerts.filter((alert) => alert.status === "open").length,
      criticalAlertCount: alerts.filter((alert) => alert.severity === "critical")
        .length,
      acknowledgedAlertCount: alerts.filter(
        (alert) => alert.status === "acknowledged",
      ).length,
      stopNewDispatchVehicleCount: vehicles.filter(
        (vehicle) => vehicle.stopNewDispatchActive,
      ).length,
      operationalHoldVehicleCount: vehicles.filter(
        (vehicle) => vehicle.operationalHoldActive,
      ).length,
      evidenceFreezeVehicleCount: vehicles.filter(
        (vehicle) => vehicle.evidenceFreezeActive,
      ).length,
      humanFallbackVehicleCount: vehicles.filter(
        (vehicle) => vehicle.humanFallbackActive,
      ).length,
      providerHealth: {
        ...providerHealth.health,
        degradedServices: providerHealth.health.degradedServices.map((service) => ({
          ...service,
        })),
      },
    };
  }

  listVehicles(
    identity: BootstrapRequestIdentity | null,
  ): RocVehicleReadModel[] {
    const alerts = this.collectAlerts(identity);
    const alertIdsByVehicle = new Map<string, string[]>();

    for (const alert of alerts) {
      if (!alert.vehicleId) {
        continue;
      }
      const existing = alertIdsByVehicle.get(alert.vehicleId) ?? [];
      existing.push(alert.alertId);
      alertIdsByVehicle.set(alert.vehicleId, existing);
    }

    return this.collectVehicleContexts().map((context) => ({
      vehicleId: context.vehicleId,
      sandboxProgramId: context.sandboxProgramId,
      currentOrderId: context.currentOrderId,
      safetyOperatorId: context.safetyOperatorId,
      autonomyState: context.telemetrySnapshot?.autonomyState ?? null,
      location: context.telemetrySnapshot?.location
        ? { ...context.telemetrySnapshot.location }
        : null,
      telemetryFreshness: { ...context.telemetryFreshness },
      regulatoryFreshness: { ...context.regulatoryFreshness },
      stopNewDispatchActive: context.stopNewDispatchActive,
      operationalHoldActive: context.operationalHoldActive,
      evidenceFreezeActive: context.evidenceFreezeActive,
      humanFallbackActive: context.humanFallbackActive,
      dispatchGateStatus:
        context.gateReasonCodes.length > 0 ? "block" : "allow",
      gateReasonCodes: [...context.gateReasonCodes],
      alertIds: [...(alertIdsByVehicle.get(context.vehicleId) ?? [])],
    }));
  }

  listTrips(identity: BootstrapRequestIdentity | null): RocTripReadModel[] {
    const alerts = this.collectAlerts(identity);
    const alertIdsByTrip = new Map<string, string[]>();

    for (const alert of alerts) {
      const tripKey = this.resolveTripKey(alert.orderId, alert.vehicleId);
      if (tripKey) {
        const tripAlerts = alertIdsByTrip.get(tripKey) ?? [];
        tripAlerts.push(alert.alertId);
        alertIdsByTrip.set(tripKey, tripAlerts);
      }
    }

    const assignments = this.safetyOperatorService.listAssignments(
      {},
      INTERNAL_SYSTEM_IDENTITY,
    );
    const reports = this.safetyOperatorService.listTakeoverReports(
      {},
      INTERNAL_SYSTEM_IDENTITY,
    );
    const activeTakeovers = this.listTakeovers();
    const contexts = this.collectVehicleContexts();
    const contextByVehicle = new Map(
      contexts.map((context) => [context.vehicleId, context] as const),
    );
    const tripMap = new Map<string, RocTripReadModel>();

    for (const assignment of assignments) {
      const tripKey = this.resolveTripKey(assignment.orderId, assignment.vehicleId);
      if (!tripKey) {
        continue;
      }
      const context = contextByVehicle.get(assignment.vehicleId);
      tripMap.set(tripKey, {
        tripId: tripKey,
        orderId: assignment.orderId,
        vehicleId: assignment.vehicleId,
        sandboxProgramId: assignment.sandboxProgramId,
        safetyOperatorId: assignment.safetyOperatorId,
        status: this.resolveTripStatus(
          assignment.vehicleId,
          assignment.orderId,
          context,
          activeTakeovers,
        ),
        latestTakeoverOccurredAt: this.findLatestTakeoverTime(
          assignment.vehicleId,
          assignment.orderId,
          reports,
          activeTakeovers,
        ),
        stopNewDispatchActive: context?.stopNewDispatchActive ?? false,
        operationalHoldActive: context?.operationalHoldActive ?? false,
        humanFallbackActive: context?.humanFallbackActive ?? false,
        alertIds: [...(alertIdsByTrip.get(tripKey) ?? [])],
      });
    }

    for (const report of reports) {
      const tripKey = this.resolveTripKey(report.orderId, report.vehicleId);
      if (!tripKey || tripMap.has(tripKey)) {
        continue;
      }
      const context = contextByVehicle.get(report.vehicleId);
      tripMap.set(tripKey, {
        tripId: tripKey,
        orderId: report.orderId,
        vehicleId: report.vehicleId,
        sandboxProgramId: report.sandboxProgramId,
        safetyOperatorId: report.safetyOperatorId,
        status: this.resolveTripStatus(
          report.vehicleId,
          report.orderId,
          context,
          activeTakeovers,
        ),
        latestTakeoverOccurredAt: this.findLatestTakeoverTime(
          report.vehicleId,
          report.orderId,
          reports,
          activeTakeovers,
        ),
        stopNewDispatchActive: context?.stopNewDispatchActive ?? false,
        operationalHoldActive: context?.operationalHoldActive ?? false,
        humanFallbackActive: context?.humanFallbackActive ?? false,
        alertIds: [...(alertIdsByTrip.get(tripKey) ?? [])],
      });
    }

    return [...tripMap.values()].sort((left, right) =>
      left.tripId.localeCompare(right.tripId),
    );
  }

  listTakeovers(): CorrelatedTakeoverCase[] {
    return this.rebuildCorrelatedTakeoverCases().cases;
  }

  getProviderHealthSnapshot(): RocProviderHealthSnapshot {
    const items = this.buildProviderHealthItems();
    const degradedServices: RocProviderHealthSnapshot["health"]["degradedServices"] = items
      .filter(
        (item) => item.status === "degraded" || item.status === "down",
      )
      .map((item) => ({
        service: item.displayName,
        impact: item.message ?? `${item.displayName} requires ROC review.`,
        severity: item.status === "down" ? "critical" : "warning",
      }));

    return {
      health: {
        status:
          degradedServices.some((service) => service.severity === "critical")
            ? "down"
            : degradedServices.length > 0
              ? "degraded"
              : "healthy",
        degradedServices,
        lastCheckedAt: items.reduce(
          (latest, item) =>
            latest && latest > item.lastCheckedAt ? latest : item.lastCheckedAt,
          items[0]?.lastCheckedAt ?? new Date().toISOString(),
        ),
      },
      items,
    };
  }

  getDispatchRestrictions(vehicleId: string): DispatchRestrictionSnapshot {
    const normalizedVehicleId = vehicleId.trim();
    const stopNewDispatch = this.stopNewDispatchByVehicle.has(normalizedVehicleId);
    const operationalHold = this.operationalHoldsByVehicle.has(normalizedVehicleId);
    const humanFallback = this.humanFallbacksByVehicle.has(normalizedVehicleId);

    const reasonCodes: SandboxDispatchReasonCode[] = [];
    if (stopNewDispatch) {
      reasonCodes.push("ROC_STOP_NEW_DISPATCH");
    }
    if (operationalHold || humanFallback) {
      reasonCodes.push("ROC_OPERATIONAL_HOLD");
    }

    return {
      reasonCodes,
      stopNewDispatchActive: stopNewDispatch,
      operationalHoldActive: operationalHold,
      humanFallbackActive: humanFallback,
    };
  }

  ackAlert(
    alertId: string,
    command: RocAlertActionCommand,
    identity: BootstrapRequestIdentity | null,
  ): ActionReceipt {
    const { derivedAlert, state } = this.requireAlertContext(alertId);
    this.assertAlertActionAllowed(identity, "ack", derivedAlert, state);

    const now = new Date().toISOString();
    state.acknowledgedAt ??= now;
    state.acknowledgedBy ??= this.resolveActorId(identity, "roc-operator");
    state.updatedAt = now;

    return this.buildActionReceipt("ack", derivedAlert, "Alert acknowledged.");
  }

  assignAlert(
    alertId: string,
    command: AssignRocAlertCommand,
    identity: BootstrapRequestIdentity | null,
  ): ActionReceipt {
    const { derivedAlert, state } = this.requireAlertContext(alertId);
    this.assertAlertActionAllowed(identity, "assign", derivedAlert, state);

    const assigneeId = this.normalizeRequired(command.assigneeId, "assigneeId");
    const now = new Date().toISOString();
    state.assignedTo = assigneeId;
    state.assignedAt = now;
    state.updatedAt = now;

    return this.buildActionReceipt(
      "assign",
      derivedAlert,
      `Alert assigned to ${assigneeId}.`,
    );
  }

  stopNewDispatch(
    alertId: string,
    command: RocAlertActionCommand,
    identity: BootstrapRequestIdentity | null,
  ): ActionReceipt {
    const { derivedAlert, state } = this.requireAlertContext(alertId);
    this.assertAlertActionAllowed(identity, "stop-new-dispatch", derivedAlert, state);
    const vehicleId = this.requireVehicleContext(derivedAlert, "stop-new-dispatch");

    this.stopNewDispatchByVehicle.set(vehicleId, {
      vehicleId,
      orderId: derivedAlert.orderId,
      sandboxProgramId: derivedAlert.sandboxProgramId,
      requestedAt: new Date().toISOString(),
      requestedBy: this.resolveActorId(identity, "roc-operator"),
      reason: this.normalizeOptional(command.reason),
      sourceAlertId: derivedAlert.alertId,
    });

    return this.buildActionReceipt(
      "stop-new-dispatch",
      derivedAlert,
      `Vehicle ${vehicleId} blocked from new dispatch.`,
    );
  }

  startOperationalHold(
    alertId: string,
    command: RocAlertActionCommand,
    identity: BootstrapRequestIdentity | null,
  ): ActionReceipt {
    const { derivedAlert, state } = this.requireAlertContext(alertId);
    this.assertAlertActionAllowed(identity, "operational-hold", derivedAlert, state);
    const vehicleId = this.requireVehicleContext(derivedAlert, "operational-hold");

    this.operationalHoldsByVehicle.set(vehicleId, {
      vehicleId,
      orderId: derivedAlert.orderId,
      sandboxProgramId: derivedAlert.sandboxProgramId,
      requestedAt: new Date().toISOString(),
      requestedBy: this.resolveActorId(identity, "roc-operator"),
      reason: this.normalizeOptional(command.reason),
      sourceAlertId: derivedAlert.alertId,
    });

    return this.buildActionReceipt(
      "operational-hold",
      derivedAlert,
      `Operational hold activated for vehicle ${vehicleId}.`,
    );
  }

  async requestSafetyAction(
    alertId: string,
    command: RequestRocSafetyActionCommand,
    identity: BootstrapRequestIdentity | null,
  ): Promise<ActionReceipt> {
    const { derivedAlert, state } = this.requireAlertContext(alertId);
    this.assertAlertActionAllowed(
      identity,
      "request-safety-action",
      derivedAlert,
      state,
    );

    const vehicleId = this.requireVehicleContext(
      derivedAlert,
      "request-safety-action",
    );
    const sandboxProgramId = this.normalizeRequired(
      command.sandboxProgramId,
      "sandboxProgramId",
    );
    const assignment = await this.safetyOperatorService.createAssignment(
      {
        safetyOperatorId: this.normalizeRequired(
          command.safetyOperatorId,
          "safetyOperatorId",
        ),
        vehicleId,
        orderId:
          this.normalizeOptional(command.orderId) ?? derivedAlert.orderId ?? null,
        sandboxProgramId,
      },
      identity ?? INTERNAL_SYSTEM_IDENTITY,
    );

    state.safetyOperatorAssignmentId = assignment.assignmentId;
    state.updatedAt = new Date().toISOString();

    return this.buildActionReceipt(
      "request-safety-action",
      derivedAlert,
      `Safety operator ${assignment.safetyOperatorId} assigned to ${vehicleId}.`,
    );
  }

  openIncident(
    alertId: string,
    command: OpenRocIncidentCommand,
    identity: BootstrapRequestIdentity | null,
  ): ActionReceipt {
    const { derivedAlert, state } = this.requireAlertContext(alertId);
    this.assertAlertActionAllowed(identity, "open-incident", derivedAlert, state);

    if (!this.incidentService) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "ROC_INCIDENT_SERVICE_UNAVAILABLE",
        "Incident service is not wired for ROC actions.",
      );
    }

    if (state.linkedIncidentId) {
      return this.buildActionReceipt(
        "open-incident",
        derivedAlert,
        `Incident ${state.linkedIncidentId} already linked to alert.`,
      );
    }

    const incident = this.incidentService.createIncident(
      this.buildIncidentCommand(derivedAlert, command, identity),
      undefined,
      identity,
    );
    state.linkedIncidentId = incident.incidentId;
    state.updatedAt = new Date().toISOString();

    return this.buildActionReceipt(
      "open-incident",
      derivedAlert,
      `Incident ${incident.incidentId} opened for alert.`,
    );
  }

  startEvidenceFreeze(
    alertId: string,
    command: StartRocEvidenceFreezeCommand,
    identity: BootstrapRequestIdentity | null,
  ): ActionReceipt {
    const { derivedAlert, state } = this.requireAlertContext(alertId);
    this.assertAlertActionAllowed(
      identity,
      "start-evidence-freeze",
      derivedAlert,
      state,
    );
    const vehicleId = this.requireVehicleContext(
      derivedAlert,
      "start-evidence-freeze",
    );

    this.evidenceFreezesByVehicle.set(vehicleId, {
      vehicleId,
      orderId: derivedAlert.orderId,
      sandboxProgramId: derivedAlert.sandboxProgramId,
      requestedAt: new Date().toISOString(),
      requestedBy: this.resolveActorId(identity, "roc-operator"),
      reason: this.normalizeOptional(command.reason),
      sourceAlertId: derivedAlert.alertId,
      retentionHours: command.retentionHours ?? null,
    });

    return this.buildActionReceipt(
      "start-evidence-freeze",
      derivedAlert,
      `Evidence freeze started for vehicle ${vehicleId}.`,
    );
  }

  fallbackToHuman(
    alertId: string,
    command: RocAlertActionCommand,
    identity: BootstrapRequestIdentity | null,
  ): ActionReceipt {
    const { derivedAlert, state } = this.requireAlertContext(alertId);
    this.assertAlertActionAllowed(identity, "fallback-to-human", derivedAlert, state);
    const vehicleId = this.requireVehicleContext(derivedAlert, "fallback-to-human");
    const actorId = this.resolveActorId(identity, "roc-operator");
    const requestedAt = new Date().toISOString();
    const reason = this.normalizeOptional(command.reason);

    this.humanFallbacksByVehicle.set(vehicleId, {
      vehicleId,
      orderId: derivedAlert.orderId,
      sandboxProgramId: derivedAlert.sandboxProgramId,
      requestedAt,
      requestedBy: actorId,
      reason,
      sourceAlertId: derivedAlert.alertId,
    });
    this.stopNewDispatchByVehicle.set(vehicleId, {
      vehicleId,
      orderId: derivedAlert.orderId,
      sandboxProgramId: derivedAlert.sandboxProgramId,
      requestedAt,
      requestedBy: actorId,
      reason,
      sourceAlertId: derivedAlert.alertId,
    });
    this.operationalHoldsByVehicle.set(vehicleId, {
      vehicleId,
      orderId: derivedAlert.orderId,
      sandboxProgramId: derivedAlert.sandboxProgramId,
      requestedAt,
      requestedBy: actorId,
      reason,
      sourceAlertId: derivedAlert.alertId,
    });

    return this.buildActionReceipt(
      "fallback-to-human",
      derivedAlert,
      `Vehicle ${vehicleId} routed to human fallback.`,
    );
  }

  notify(
    alertId: string,
    command: NotifyRocAlertCommand,
    identity: BootstrapRequestIdentity | null,
  ): ActionReceipt {
    const { derivedAlert, state } = this.requireAlertContext(alertId);
    this.assertAlertActionAllowed(identity, "notify", derivedAlert, state);

    const target = this.normalizeRequired(command.target, "target");
    state.notifications = [
      {
        channel: command.channel,
        target,
        message: this.normalizeOptional(command.message),
        note: this.normalizeOptional(command.note),
        sentAt: new Date().toISOString(),
        sentBy: this.resolveActorId(identity, "roc-operator"),
      },
      ...state.notifications,
    ];
    state.updatedAt = new Date().toISOString();

    return this.buildActionReceipt(
      "notify",
      derivedAlert,
      `Notification queued to ${target} via ${command.channel}.`,
    );
  }

  resolveAlert(
    alertId: string,
    command: RocAlertActionCommand,
    identity: BootstrapRequestIdentity | null,
  ): ActionReceipt {
    const { derivedAlert, state } = this.requireAlertContext(alertId);
    this.assertAlertActionAllowed(identity, "resolve", derivedAlert, state);

    const now = new Date().toISOString();
    state.resolvedAt = now;
    state.resolvedBy = this.resolveActorId(identity, "roc-operator");
    state.resolutionReason = this.normalizeOptional(command.reason);
    state.updatedAt = now;

    if (derivedAlert.vehicleId) {
      if (derivedAlert.alertType === "dispatch_gate") {
        this.stopNewDispatchByVehicle.delete(derivedAlert.vehicleId);
      }
      if (derivedAlert.alertType === "operational_hold") {
        this.operationalHoldsByVehicle.delete(derivedAlert.vehicleId);
      }
      if (derivedAlert.alertType === "evidence_freeze") {
        this.evidenceFreezesByVehicle.delete(derivedAlert.vehicleId);
      }
      if (derivedAlert.alertType === "human_fallback") {
        this.humanFallbacksByVehicle.delete(derivedAlert.vehicleId);
      }
    }

    return this.buildActionReceipt("resolve", derivedAlert, "Alert resolved.");
  }

  rebuildCorrelatedTakeoverCases() {
    const reports = this.safetyOperatorService.listTakeoverReports(
      {},
      INTERNAL_SYSTEM_IDENTITY,
    );
    const discrepancies: EvidenceDiscrepancyCase[] = [];

    const cases = reports.map((report) => {
      const correlation = this.correlateForReport(report);
      if (correlation.discrepancy) {
        discrepancies.push(correlation.discrepancy);
      }
      return correlation.caseRecord;
    });

    return {
      cases,
      discrepancies,
    };
  }

  private requireAlertContext(alertId: string) {
    const derivedAlert = this.collectDerivedAlerts().find(
      (candidate) => candidate.alertId === alertId,
    );
    if (!derivedAlert) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "ROC_ALERT_NOT_FOUND",
        `ROC alert '${alertId}' was not found.`,
      );
    }

    return {
      derivedAlert,
      state: this.getOrCreateAlertState(derivedAlert),
    };
  }

  private collectAlerts(identity: BootstrapRequestIdentity | null) {
    return this.collectDerivedAlerts()
      .map((alert) => this.projectAlert(alert, identity))
      .sort((left, right) => {
        const severityRank =
          this.rankAlertSeverity(left.severity) - this.rankAlertSeverity(right.severity);
        if (severityRank !== 0) {
          return severityRank;
        }

        return left.updatedAt < right.updatedAt ? 1 : -1;
      });
  }

  private collectDerivedAlerts(): DerivedRocAlert[] {
    const providerHealth = this.getProviderHealthSnapshot();
    const correlationSnapshot = this.rebuildCorrelatedTakeoverCases();
    const alerts: DerivedRocAlert[] = [];

    for (const item of providerHealth.items) {
      if (item.status !== "degraded" && item.status !== "down") {
        continue;
      }
      alerts.push({
        alertId: `roc-alert-provider-${item.providerCode}`,
        alertType: "provider_health",
        severity: item.status === "down" ? "critical" : "warning",
        title: `${item.displayName} ${item.status}`,
        summary:
          item.message ??
          `${item.displayName} is ${item.status} and may affect ROC operations.`,
        vehicleId: item.affectedVehicleIds[0] ?? null,
        orderId: null,
        sandboxProgramId: null,
        providerCode: item.providerCode,
        sourceRecordId: item.providerCode,
        openedAt: item.lastCheckedAt,
        updatedAt: item.lastCheckedAt,
        sourceActive: true,
        resolveBlockedWhileSourceActive: true,
      });
    }

    const recorderAlerts = this.collectRecorderSignalAlerts();
    alerts.push(...recorderAlerts);

    for (const discrepancy of correlationSnapshot.discrepancies) {
      const caseRecord = correlationSnapshot.cases.find(
        (candidate) =>
          candidate.correlatedTakeoverCaseId === discrepancy.correlatedTakeoverCaseId,
      );
      alerts.push({
        alertId: `roc-alert-discrepancy-${discrepancy.discrepancyCaseId}`,
        alertType: "takeover_discrepancy",
        severity: "warning",
        title: "Takeover discrepancy",
        summary: discrepancy.summary,
        vehicleId: discrepancy.vehicleId,
        orderId: caseRecord?.orderId ?? null,
        sandboxProgramId:
          caseRecord?.safetyOperatorTakeoverReport.sandboxProgramId ?? null,
        providerCode: null,
        sourceRecordId: discrepancy.discrepancyCaseId,
        openedAt: discrepancy.openedAt,
        updatedAt: discrepancy.openedAt,
        sourceActive: true,
        resolveBlockedWhileSourceActive: false,
      });
    }

    for (const stop of this.stopNewDispatchByVehicle.values()) {
      alerts.push({
        alertId: `roc-alert-stop-new-dispatch-${stop.vehicleId}`,
        alertType: "dispatch_gate",
        severity: "critical",
        title: "Stop new dispatch active",
        summary: `Vehicle ${stop.vehicleId} is blocked from receiving new work.`,
        vehicleId: stop.vehicleId,
        orderId: stop.orderId,
        sandboxProgramId: stop.sandboxProgramId,
        providerCode: null,
        sourceRecordId: stop.sourceAlertId,
        openedAt: stop.requestedAt,
        updatedAt: stop.requestedAt,
        sourceActive: true,
        resolveBlockedWhileSourceActive: false,
      });
    }

    for (const hold of this.operationalHoldsByVehicle.values()) {
      alerts.push({
        alertId: `roc-alert-operational-hold-${hold.vehicleId}`,
        alertType: "operational_hold",
        severity: "critical",
        title: "Operational hold active",
        summary: `Vehicle ${hold.vehicleId} is under ROC operational hold.`,
        vehicleId: hold.vehicleId,
        orderId: hold.orderId,
        sandboxProgramId: hold.sandboxProgramId,
        providerCode: null,
        sourceRecordId: hold.sourceAlertId,
        openedAt: hold.requestedAt,
        updatedAt: hold.requestedAt,
        sourceActive: true,
        resolveBlockedWhileSourceActive: false,
      });
    }

    for (const freeze of this.evidenceFreezesByVehicle.values()) {
      alerts.push({
        alertId: `roc-alert-evidence-freeze-${freeze.vehicleId}`,
        alertType: "evidence_freeze",
        severity: "warning",
        title: "Evidence freeze active",
        summary: `Evidence freeze active for vehicle ${freeze.vehicleId}.`,
        vehicleId: freeze.vehicleId,
        orderId: freeze.orderId,
        sandboxProgramId: freeze.sandboxProgramId,
        providerCode: null,
        sourceRecordId: freeze.sourceAlertId,
        openedAt: freeze.requestedAt,
        updatedAt: freeze.requestedAt,
        sourceActive: true,
        resolveBlockedWhileSourceActive: false,
      });
    }

    for (const fallback of this.humanFallbacksByVehicle.values()) {
      alerts.push({
        alertId: `roc-alert-human-fallback-${fallback.vehicleId}`,
        alertType: "human_fallback",
        severity: "critical",
        title: "Human fallback active",
        summary: `Vehicle ${fallback.vehicleId} is operating under human fallback.`,
        vehicleId: fallback.vehicleId,
        orderId: fallback.orderId,
        sandboxProgramId: fallback.sandboxProgramId,
        providerCode: null,
        sourceRecordId: fallback.sourceAlertId,
        openedAt: fallback.requestedAt,
        updatedAt: fallback.requestedAt,
        sourceActive: true,
        resolveBlockedWhileSourceActive: false,
      });
    }

    return alerts;
  }

  private collectRecorderSignalAlerts(): DerivedRocAlert[] {
    if (!this.vehicleEvidenceService) {
      return [];
    }

    const alerts: DerivedRocAlert[] = [];
    for (const recorder of this.vehicleEvidenceService.listRecorders()) {
      const signal = this.vehicleEvidenceService.getNoNewDispatchSignal(
        recorder.vehicleId,
      );
      if (!signal?.active) {
        continue;
      }
      alerts.push({
        alertId: `roc-alert-recorder-${signal.vehicleId}`,
        alertType: "dispatch_gate",
        severity: "critical",
        title: "Recorder unhealthy",
        summary:
          signal.reasons[0] ??
          `Evidence recorder ${signal.recorderId} is unhealthy.`,
        vehicleId: signal.vehicleId,
        orderId: this.findCurrentOrderId(signal.vehicleId),
        sandboxProgramId: this.findSandboxProgramId(signal.vehicleId),
        providerCode: "onboard_recorder",
        sourceRecordId: signal.recorderId,
        openedAt: signal.observedAt,
        updatedAt: signal.observedAt,
        sourceActive: true,
        resolveBlockedWhileSourceActive: true,
      });
    }

    return alerts;
  }

  private collectVehicleContexts(): VehicleContext[] {
    const vehicleIds = new Set<string>();
    const assignments = this.safetyOperatorService.listAssignments(
      {},
      INTERNAL_SYSTEM_IDENTITY,
    );
    const reports = this.safetyOperatorService.listTakeoverReports(
      {},
      INTERNAL_SYSTEM_IDENTITY,
    );
    const bindings = this.teslaIntegrationService?.listBindings() ?? [];

    for (const assignment of assignments) {
      vehicleIds.add(assignment.vehicleId);
    }
    for (const report of reports) {
      vehicleIds.add(report.vehicleId);
    }
    for (const response of this.takeoverResponses) {
      vehicleIds.add(response.vehicleId);
    }
    for (const event of this.teslaTransitionEvents) {
      vehicleIds.add(event.vehicleId);
    }
    for (const binding of bindings) {
      vehicleIds.add(binding.vehicleId);
    }
    if (this.vehicleEvidenceService) {
      for (const recorder of this.vehicleEvidenceService.listRecorders()) {
        vehicleIds.add(recorder.vehicleId);
      }
    }
    for (const vehicleId of this.stopNewDispatchByVehicle.keys()) {
      vehicleIds.add(vehicleId);
    }
    for (const vehicleId of this.operationalHoldsByVehicle.keys()) {
      vehicleIds.add(vehicleId);
    }
    for (const vehicleId of this.evidenceFreezesByVehicle.keys()) {
      vehicleIds.add(vehicleId);
    }
    for (const vehicleId of this.humanFallbacksByVehicle.keys()) {
      vehicleIds.add(vehicleId);
    }

    return [...vehicleIds]
      .sort()
      .map((vehicleId) => {
        const activeAssignment = assignments.find(
          (assignment) =>
            assignment.vehicleId === vehicleId &&
            this.isAssignmentActive(assignment.status),
        );
        const latestReport = reports
          .filter((report) => report.vehicleId === vehicleId)
          .sort((left, right) => (left.occurredAt < right.occurredAt ? 1 : -1))[0];
        const telemetrySnapshot = this.getTelemetrySnapshot(vehicleId);
        const telemetryFreshness = this.getTelemetryFreshness(vehicleId, telemetrySnapshot);
        const regulatoryFreshness = this.getRegulatoryFreshness(vehicleId, latestReport);
        const restriction = this.getDispatchRestrictions(vehicleId);
        const recorderSignal = this.vehicleEvidenceService?.getNoNewDispatchSignal(
          vehicleId,
        );
        const gateReasonCodes = [
          ...(recorderSignal?.active ? (["RECORDER_UNHEALTHY"] as const) : []),
          ...restriction.reasonCodes,
        ];

        return {
          vehicleId,
          sandboxProgramId:
            activeAssignment?.sandboxProgramId ??
            latestReport?.sandboxProgramId ??
            this.findSandboxProgramId(vehicleId),
          currentOrderId:
            activeAssignment?.orderId ?? latestReport?.orderId ?? this.findCurrentOrderId(vehicleId),
          safetyOperatorId:
            activeAssignment?.safetyOperatorId ?? latestReport?.safetyOperatorId ?? null,
          telemetrySnapshot,
          telemetryFreshness,
          regulatoryFreshness,
          gateReasonCodes,
          stopNewDispatchActive: restriction.stopNewDispatchActive,
          operationalHoldActive: restriction.operationalHoldActive,
          evidenceFreezeActive: this.evidenceFreezesByVehicle.has(vehicleId),
          humanFallbackActive: restriction.humanFallbackActive,
        };
      });
  }

  private getTelemetrySnapshot(vehicleId: string) {
    if (!this.teslaIntegrationService) {
      return null;
    }

    try {
      return this.teslaIntegrationService.getTelemetryProjection(vehicleId);
    } catch {
      return null;
    }
  }

  private getTelemetryFreshness(
    vehicleId: string,
    snapshot: TeslaVehicleStateSnapshot | null,
  ): RocDataFreshness {
    if (snapshot) {
      return this.buildFreshness(snapshot.capturedAt, TELEMETRY_STALE_AFTER_MS);
    }

    if (!this.teslaIntegrationService) {
      return {
        dataFreshness: "unknown",
        observedAt: null,
        staleAfterMs: TELEMETRY_STALE_AFTER_MS,
      };
    }

    try {
      const status = this.teslaIntegrationService.getTelemetryStatus(vehicleId);
      const observedAt = status.lastProjectionAt ?? status.lastSyncAt ?? status.configuredAt;
      if (status.health === "disabled") {
        return {
          dataFreshness: "degraded",
          observedAt,
          staleAfterMs: TELEMETRY_STALE_AFTER_MS,
        };
      }
      return this.buildFreshness(observedAt, TELEMETRY_STALE_AFTER_MS);
    } catch {
      return {
        dataFreshness: "unknown",
        observedAt: null,
        staleAfterMs: TELEMETRY_STALE_AFTER_MS,
      };
    }
  }

  private getRegulatoryFreshness(
    vehicleId: string,
    latestReport: SafetyOperatorTakeoverReport | undefined,
  ): RocDataFreshness {
    const latestTeslaEvent = this.teslaTransitionEvents
      .filter((event) => event.vehicleId === vehicleId)
      .sort((left, right) => (left.occurredAt < right.occurredAt ? 1 : -1))[0];
    const latestRocResponse = this.takeoverResponses
      .filter((response) => response.vehicleId === vehicleId)
      .sort((left, right) => (left.requestedAt < right.requestedAt ? 1 : -1))[0];

    const observedAt =
      latestTeslaEvent?.occurredAt ??
      latestRocResponse?.requestedAt ??
      latestReport?.occurredAt ??
      null;
    return this.buildFreshness(observedAt, REGULATORY_STALE_AFTER_MS);
  }

  private buildProviderHealthItems(): RocProviderHealthReadModel[] {
    const items: RocProviderHealthReadModel[] = [];
    const now = new Date().toISOString();

    items.push(this.buildRecorderProviderHealth(now));
    items.push(this.buildTeslaFleetProviderHealth(now));
    items.push(this.buildTeslaPublicTelemetryHealth(now));
    items.push(this.buildTeslaRegulatoryHealth(now));

    return items;
  }

  private buildRecorderProviderHealth(now: string): RocProviderHealthReadModel {
    if (!this.vehicleEvidenceService) {
      return {
        providerCode: "onboard_recorder",
        displayName: "On-board recorder",
        status: "unknown",
        lastCheckedAt: now,
        message: "Recorder service is not wired.",
        affectedVehicleIds: [],
      };
    }

    const recorders = this.vehicleEvidenceService.listRecorders();
    if (recorders.length === 0) {
      return {
        providerCode: "onboard_recorder",
        displayName: "On-board recorder",
        status: "unknown",
        lastCheckedAt: now,
        message: "No recorders registered.",
        affectedVehicleIds: [],
      };
    }

    const healths = recorders.map((recorder) =>
      this.vehicleEvidenceService!.getRecorderHealth(recorder.recorderId),
    );
    const unhealthy = healths.filter(
      (health) => health.overall === "unhealthy" || health.noNewDispatch,
    );
    const degraded = healths.filter((health) => health.overall === "degraded");

    return {
      providerCode: "onboard_recorder",
      displayName: "On-board recorder",
      status:
        unhealthy.length > 0
          ? "down"
          : degraded.length > 0
            ? "degraded"
            : "healthy",
      lastCheckedAt: healths.reduce(
        (latest, health) =>
          latest > health.observedAt ? latest : health.observedAt,
        healths[0]!.observedAt,
      ),
      message:
        unhealthy[0]?.reasons[0] ??
        degraded[0]?.reasons[0] ??
        "Recorder health is nominal.",
      affectedVehicleIds: [...new Set([...unhealthy, ...degraded].map((health) => health.vehicleId))],
    };
  }

  private buildTeslaFleetProviderHealth(now: string): RocProviderHealthReadModel {
    const bindings = this.teslaIntegrationService?.listBindings() ?? [];
    if (bindings.length === 0 || !this.teslaIntegrationService) {
      return {
        providerCode: "tesla_fleet_api",
        displayName: "Tesla Fleet API",
        status: "unknown",
        lastCheckedAt: now,
        message: "No Tesla bindings configured.",
        affectedVehicleIds: [],
      };
    }

    const degradedVehicleIds: string[] = [];
    let lastCheckedAt = bindings[0]!.boundAt;
    let status: RocProviderHealthReadModel["status"] = "healthy";
    let message = "Telemetry sync is healthy.";

    for (const binding of bindings) {
      try {
        const telemetry = this.teslaIntegrationService.getTelemetryStatus(
          binding.vehicleId,
        );
        lastCheckedAt =
          lastCheckedAt > (telemetry.lastProjectionAt ?? telemetry.lastSyncAt ?? telemetry.configuredAt)
            ? lastCheckedAt
            : telemetry.lastProjectionAt ?? telemetry.lastSyncAt ?? telemetry.configuredAt;

        if (telemetry.health === "disabled") {
          status = "down";
          degradedVehicleIds.push(binding.vehicleId);
          message = `Telemetry disabled for ${binding.vehicleId}.`;
        } else if (telemetry.health === "stale" && status !== "down") {
          status = "degraded";
          degradedVehicleIds.push(binding.vehicleId);
          message = `Telemetry stale for ${binding.vehicleId}.`;
        }
      } catch {
        status = "down";
        degradedVehicleIds.push(binding.vehicleId);
        message = `Telemetry status missing for ${binding.vehicleId}.`;
      }
    }

    return {
      providerCode: "tesla_fleet_api",
      displayName: "Tesla Fleet API",
      status,
      lastCheckedAt,
      message,
      affectedVehicleIds: [...new Set(degradedVehicleIds)],
    };
  }

  private buildTeslaPublicTelemetryHealth(now: string): RocProviderHealthReadModel {
    const bindings = this.teslaIntegrationService?.listBindings() ?? [];
    if (bindings.length === 0 || !this.teslaIntegrationService) {
      return {
        providerCode: "tesla_public_telemetry",
        displayName: "Tesla public telemetry",
        status: "unknown",
        lastCheckedAt: now,
        message: "No Tesla bindings configured.",
        affectedVehicleIds: [],
      };
    }

    let anySample = false;
    let lastCheckedAt = now;
    for (const binding of bindings) {
      try {
        const sample = this.teslaIntegrationService.getPublicTelemetrySample(
          binding.vehicleId,
        );
        anySample = true;
        lastCheckedAt =
          lastCheckedAt > sample.capturedAt ? lastCheckedAt : sample.capturedAt;
      } catch {
        continue;
      }
    }

    return {
      providerCode: "tesla_public_telemetry",
      displayName: "Tesla public telemetry",
      status: anySample ? "healthy" : "unknown",
      lastCheckedAt,
      message: anySample ? "Public telemetry fallback available." : "No public telemetry samples captured.",
      affectedVehicleIds: [],
    };
  }

  private buildTeslaRegulatoryHealth(now: string): RocProviderHealthReadModel {
    if (this.teslaTransitionEvents.length === 0) {
      return {
        providerCode: "tesla_regulatory_events",
        displayName: "Tesla regulatory events",
        status: "unknown",
        lastCheckedAt: now,
        message: "No regulatory transition events received.",
        affectedVehicleIds: [],
      };
    }

    const latest = [...this.teslaTransitionEvents].sort((left, right) =>
      left.occurredAt < right.occurredAt ? 1 : -1,
    )[0]!;
    const freshness = this.buildFreshness(
      latest.occurredAt,
      REGULATORY_STALE_AFTER_MS,
    );
    return {
      providerCode: "tesla_regulatory_events",
      displayName: "Tesla regulatory events",
      status:
        freshness.dataFreshness === "stale" ? "degraded" : "healthy",
      lastCheckedAt: latest.occurredAt,
      message:
        freshness.dataFreshness === "stale"
          ? "Regulatory event stream is stale."
          : "Regulatory event stream is current.",
      affectedVehicleIds:
        freshness.dataFreshness === "stale" ? [latest.vehicleId] : [],
    };
  }

  private projectAlert(
    derivedAlert: DerivedRocAlert,
    identity: BootstrapRequestIdentity | null,
  ): RocAlertReadModel {
    const state = this.getOrCreateAlertState(derivedAlert);
    const status = this.resolveAlertStatus(derivedAlert, state);

    return {
      alertId: derivedAlert.alertId,
      alertType: derivedAlert.alertType,
      status,
      severity: derivedAlert.severity,
      title: derivedAlert.title,
      summary: derivedAlert.summary,
      vehicleId: derivedAlert.vehicleId,
      orderId: derivedAlert.orderId,
      sandboxProgramId: derivedAlert.sandboxProgramId,
      providerCode: derivedAlert.providerCode,
      sourceRecordId: derivedAlert.sourceRecordId,
      acknowledgedAt: state.acknowledgedAt,
      acknowledgedBy: state.acknowledgedBy,
      assignedTo: state.assignedTo,
      assignedAt: state.assignedAt,
      linkedIncidentId: state.linkedIncidentId,
      resolvedAt: state.resolvedAt,
      resolvedBy: state.resolvedBy,
      openedAt: state.openedAt,
      updatedAt: state.updatedAt,
      availableActions: this.buildAvailableActions(
        derivedAlert,
        state,
        status,
        identity,
      ),
    };
  }

  private buildAvailableActions(
    derivedAlert: DerivedRocAlert,
    state: RocAlertWorkflowState,
    status: RocAlertStatus,
    identity: BootstrapRequestIdentity | null,
  ): ResourceActionDescriptor[] {
    const actions: ResourceActionDescriptor[] = [];
    const actorId = identity?.actorId ?? null;
    const canCoordinate = this.canCoordinate(identity);
    const canAssign = this.canAssign(identity);
    const canStopDispatch = this.canStopDispatch(identity);
    const canHold = this.canHold(identity);
    const canRequestSafety = this.canRequestSafety(identity);
    const canOpenIncident = this.canOpenIncident(identity);
    const canFreeze = this.canFreeze(identity);
    const canFallback = this.canFallback(identity);
    const canNotify = this.canNotify(identity);
    const canResolve =
      this.canResolve(identity) ||
      (state.assignedTo != null && actorId != null && state.assignedTo === actorId);
    const hasVehicleContext = derivedAlert.vehicleId != null;
    const alreadyFrozen =
      derivedAlert.vehicleId != null &&
      this.evidenceFreezesByVehicle.has(derivedAlert.vehicleId);
    const alreadyStopped =
      derivedAlert.vehicleId != null &&
      this.stopNewDispatchByVehicle.has(derivedAlert.vehicleId);
    const alreadyHeld =
      derivedAlert.vehicleId != null &&
      this.operationalHoldsByVehicle.has(derivedAlert.vehicleId);
    const alreadyFallback =
      derivedAlert.vehicleId != null &&
      this.humanFallbacksByVehicle.has(derivedAlert.vehicleId);

    actions.push(
      this.buildActionDescriptor(
        "ack",
        canCoordinate && status === "open",
        "low",
        status !== "open"
          ? status === "resolved"
            ? "already_resolved"
            : "already_acknowledged"
          : "roc_role_required",
      ),
    );
    actions.push(
      this.buildActionDescriptor(
        "assign",
        canAssign && status !== "resolved",
        "medium",
        status === "resolved" ? "already_resolved" : "roc_role_required",
      ),
    );
    actions.push(
      this.buildActionDescriptor(
        "stop-new-dispatch",
        canStopDispatch && status !== "resolved" && hasVehicleContext && !alreadyStopped,
        "high",
        !hasVehicleContext
          ? "vehicle_context_required"
          : alreadyStopped
            ? "already_active"
            : status === "resolved"
              ? "already_resolved"
              : "roc_role_required",
        true,
      ),
    );
    actions.push(
      this.buildActionDescriptor(
        "operational-hold",
        canHold && status !== "resolved" && hasVehicleContext && !alreadyHeld,
        "high",
        !hasVehicleContext
          ? "vehicle_context_required"
          : alreadyHeld
            ? "already_active"
            : status === "resolved"
              ? "already_resolved"
              : "roc_role_required",
        true,
      ),
    );
    actions.push(
      this.buildActionDescriptor(
        "request-safety-action",
        canRequestSafety && status !== "resolved" && hasVehicleContext,
        "medium",
        !hasVehicleContext
          ? "vehicle_context_required"
          : status === "resolved"
            ? "already_resolved"
            : "roc_role_required",
      ),
    );
    actions.push(
      this.buildActionDescriptor(
        "open-incident",
        canOpenIncident && status !== "resolved" && state.linkedIncidentId == null,
        "high",
        state.linkedIncidentId ? "incident_already_open" : "roc_role_required",
      ),
    );
    actions.push(
      this.buildActionDescriptor(
        "start-evidence-freeze",
        canFreeze && status !== "resolved" && hasVehicleContext && !alreadyFrozen,
        "high",
        !hasVehicleContext
          ? "vehicle_context_required"
          : alreadyFrozen
            ? "already_active"
            : status === "resolved"
              ? "already_resolved"
              : "roc_role_required",
        true,
      ),
    );
    actions.push(
      this.buildActionDescriptor(
        "fallback-to-human",
        canFallback && status !== "resolved" && hasVehicleContext && !alreadyFallback,
        "high",
        !hasVehicleContext
          ? "vehicle_context_required"
          : alreadyFallback
            ? "already_active"
            : status === "resolved"
              ? "already_resolved"
              : "roc_role_required",
        true,
      ),
    );
    actions.push(
      this.buildActionDescriptor(
        "notify",
        canNotify && status !== "resolved",
        "low",
        status === "resolved" ? "already_resolved" : "roc_role_required",
      ),
    );
    actions.push(
      this.buildActionDescriptor(
        "resolve",
        canResolve &&
          status !== "resolved" &&
          (!derivedAlert.resolveBlockedWhileSourceActive || !derivedAlert.sourceActive),
        "medium",
        status === "resolved"
          ? "already_resolved"
          : derivedAlert.resolveBlockedWhileSourceActive && derivedAlert.sourceActive
            ? "source_still_active"
            : "roc_role_required",
        true,
      ),
    );

    return actions;
  }

  private buildActionDescriptor(
    action: string,
    enabled: boolean,
    riskLevel: ResourceActionDescriptor["riskLevel"],
    disabledReasonCode: string,
    requiresReason = false,
  ): ResourceActionDescriptor {
    return {
      action,
      enabled,
      riskLevel,
      ...(requiresReason ? { requiresReason: true } : {}),
      ...(enabled ? {} : { disabledReasonCode }),
    };
  }

  private resolveAlertStatus(
    derivedAlert: DerivedRocAlert,
    state: RocAlertWorkflowState,
  ): RocAlertStatus {
    if (state.resolvedAt && !derivedAlert.sourceActive) {
      return "resolved";
    }
    if (state.acknowledgedAt || state.resolvedAt) {
      return state.resolvedAt ? "resolved" : "acknowledged";
    }
    return "open";
  }

  private getOrCreateAlertState(derivedAlert: DerivedRocAlert) {
    const existing = this.alertStates.get(derivedAlert.alertId);
    if (existing) {
      if (derivedAlert.updatedAt > existing.updatedAt) {
        existing.updatedAt = derivedAlert.updatedAt;
      }
      if (derivedAlert.openedAt < existing.openedAt) {
        existing.openedAt = derivedAlert.openedAt;
      }
      return existing;
    }

    const created: RocAlertWorkflowState = {
      alertId: derivedAlert.alertId,
      openedAt: derivedAlert.openedAt,
      updatedAt: derivedAlert.updatedAt,
      acknowledgedAt: null,
      acknowledgedBy: null,
      assignedTo: null,
      assignedAt: null,
      linkedIncidentId: null,
      resolvedAt: null,
      resolvedBy: null,
      resolutionReason: null,
      notifications: [],
      safetyOperatorAssignmentId: null,
    };
    this.alertStates.set(created.alertId, created);
    return created;
  }

  private buildActionReceipt(
    action: string,
    alert: DerivedRocAlert,
    message: string,
  ): ActionReceipt {
    return {
      actionId: `roc-action-${randomUUID()}`,
      auditId: `roc-audit-${randomUUID()}`,
      resourceType: "roc_alert",
      resourceId: alert.alertId,
      status: "completed",
      message: `${action}: ${message}`,
    };
  }

  private buildIncidentCommand(
    alert: DerivedRocAlert,
    command: OpenRocIncidentCommand,
    identity: BootstrapRequestIdentity | null,
  ): CreateIncidentCommand {
    const severity = command.severity ?? (alert.severity === "critical" ? "high" : "medium");
    const category =
      command.category ??
      (alert.alertType === "takeover_discrepancy" ? "safety" : "operational");
    const title =
      this.normalizeOptional(command.title) ?? `[ROC] ${alert.title}`;
    const description =
      this.normalizeOptional(command.description) ??
      alert.summary;

    return {
      title,
      description,
      category,
      severity,
      reportedBy: this.resolveActorId(identity, "roc-operator"),
      ...(alert.orderId ? { relatedOrderId: alert.orderId } : {}),
      ...(alert.vehicleId ? { relatedVehicleId: alert.vehicleId } : {}),
      occurredAt: alert.updatedAt,
    };
  }

  private assertAlertActionAllowed(
    identity: BootstrapRequestIdentity | null,
    action: string,
    derivedAlert: DerivedRocAlert,
    state: RocAlertWorkflowState,
  ) {
    if (!identity) {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "AUTH_REQUIRED",
        "Authenticated ROC identity is required.",
      );
    }
    if (identity.realm !== "system" && identity.realm !== "ops") {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "ROC_REALM_DENIED",
        "Only ops or system identities may perform ROC actions.",
        {
          realm: identity.realm,
          action,
        },
      );
    }

    const descriptor = this.buildAvailableActions(
      derivedAlert,
      state,
      this.resolveAlertStatus(derivedAlert, state),
      identity,
    ).find((candidate) => candidate.action === action);
    if (!descriptor?.enabled) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "ROC_ACTION_NOT_ALLOWED",
        `ROC action '${action}' is not currently allowed.`,
        {
          action,
          disabledReasonCode: descriptor?.disabledReasonCode ?? "not_available",
          alertId: derivedAlert.alertId,
        },
      );
    }
  }

  private requireVehicleContext(derivedAlert: DerivedRocAlert, action: string) {
    if (derivedAlert.vehicleId) {
      return derivedAlert.vehicleId;
    }

    throw new ApiRequestError(
      HttpStatus.CONFLICT,
      "ROC_ALERT_VEHICLE_CONTEXT_REQUIRED",
      `ROC action '${action}' requires a vehicle-scoped alert.`,
      {
        alertId: derivedAlert.alertId,
        action,
      },
    );
  }

  private resolveTripStatus(
    vehicleId: string,
    orderId: string | null,
    context: VehicleContext | undefined,
    activeTakeovers: CorrelatedTakeoverCase[],
  ): RocTripStatus {
    if (context?.humanFallbackActive) {
      return "human_fallback";
    }
    if (context?.operationalHoldActive) {
      return "operational_hold";
    }
    if (
      activeTakeovers.some(
        (candidate) =>
          candidate.vehicleId === vehicleId &&
          candidate.orderId === orderId &&
          this.isTakeoverActive(candidate),
      )
    ) {
      return "takeover_active";
    }
    return "monitoring";
  }

  private findLatestTakeoverTime(
    vehicleId: string,
    orderId: string | null,
    reports: SafetyOperatorTakeoverReport[],
    activeTakeovers: CorrelatedTakeoverCase[],
  ) {
    const reportTime = reports
      .filter((report) => report.vehicleId === vehicleId && report.orderId === orderId)
      .sort((left, right) => (left.occurredAt < right.occurredAt ? 1 : -1))[0]
      ?.occurredAt;
    const correlatedTime = activeTakeovers
      .filter((candidate) => candidate.vehicleId === vehicleId && candidate.orderId === orderId)
      .sort((left, right) =>
        left.sourceTimestamps.safetyOccurredAt < right.sourceTimestamps.safetyOccurredAt
          ? 1
          : -1,
      )[0]?.sourceTimestamps.safetyOccurredAt;
    return reportTime ?? correlatedTime ?? null;
  }

  private isTakeoverActive(candidate: CorrelatedTakeoverCase) {
    return candidate.rocTakeoverResponse?.resolvedAt == null;
  }

  private isAssignmentActive(status: string) {
    return status === "assigned" || status === "engaged";
  }

  private findCurrentOrderId(vehicleId: string) {
    const activeAssignment = this.safetyOperatorService
      .listAssignments({}, INTERNAL_SYSTEM_IDENTITY)
      .find(
        (assignment) =>
          assignment.vehicleId === vehicleId &&
          this.isAssignmentActive(assignment.status),
      );
    if (activeAssignment?.orderId) {
      return activeAssignment.orderId;
    }
    return (
      this.safetyOperatorService
        .listTakeoverReports({}, INTERNAL_SYSTEM_IDENTITY)
        .filter((report) => report.vehicleId === vehicleId)
        .sort((left, right) => (left.occurredAt < right.occurredAt ? 1 : -1))[0]
        ?.orderId ?? null
    );
  }

  private findSandboxProgramId(vehicleId: string) {
    const activeAssignment = this.safetyOperatorService
      .listAssignments({}, INTERNAL_SYSTEM_IDENTITY)
      .find(
        (assignment) =>
          assignment.vehicleId === vehicleId &&
          this.isAssignmentActive(assignment.status),
      );
    if (activeAssignment?.sandboxProgramId) {
      return activeAssignment.sandboxProgramId;
    }
    return (
      this.safetyOperatorService
        .listTakeoverReports({}, INTERNAL_SYSTEM_IDENTITY)
        .filter((report) => report.vehicleId === vehicleId)
        .sort((left, right) => (left.occurredAt < right.occurredAt ? 1 : -1))[0]
        ?.sandboxProgramId ?? null
    );
  }

  private resolveTripKey(orderId: string | null, vehicleId: string | null) {
    if (orderId) {
      return orderId;
    }
    if (vehicleId) {
      return `vehicle:${vehicleId}`;
    }
    return null;
  }

  private buildFreshness(
    observedAt: string | null,
    staleAfterMs: number,
  ): RocDataFreshness {
    if (!observedAt) {
      return {
        dataFreshness: "unknown",
        observedAt,
        staleAfterMs,
      };
    }

    const ageMs = Date.now() - Date.parse(observedAt);
    return {
      dataFreshness: ageMs > staleAfterMs ? "stale" : "fresh",
      observedAt,
      staleAfterMs,
    };
  }

  private rankAlertSeverity(severity: RocAlertSeverity) {
    switch (severity) {
      case "critical":
        return 0;
      case "warning":
        return 1;
      case "info":
        return 2;
      default:
        return Number.MAX_SAFE_INTEGER;
    }
  }

  private canCoordinate(identity: BootstrapRequestIdentity | null) {
    return (
      identity?.realm === "system" ||
      this.hasAnyRole(identity, ["roc_operator", "ops_supervisor", "ops_manager", "dispatch_manager", "safety_officer"])
    );
  }

  private canAssign(identity: BootstrapRequestIdentity | null) {
    return (
      identity?.realm === "system" ||
      this.hasAnyRole(identity, ["ops_supervisor", "ops_manager", "dispatch_manager"])
    );
  }

  private canStopDispatch(identity: BootstrapRequestIdentity | null) {
    return (
      identity?.realm === "system" ||
      this.hasAnyRole(identity, ["roc_operator", "ops_supervisor", "ops_manager"])
    );
  }

  private canHold(identity: BootstrapRequestIdentity | null) {
    return (
      identity?.realm === "system" ||
      this.hasAnyRole(identity, ["safety_officer", "ops_supervisor", "ops_manager"])
    );
  }

  private canRequestSafety(identity: BootstrapRequestIdentity | null) {
    return (
      identity?.realm === "system" ||
      this.hasAnyRole(identity, ["roc_operator", "dispatch_manager", "ops_supervisor", "ops_manager"])
    );
  }

  private canOpenIncident(identity: BootstrapRequestIdentity | null) {
    return (
      identity?.realm === "system" ||
      this.hasAnyRole(identity, ["roc_operator", "safety_officer", "ops_supervisor", "ops_manager"])
    );
  }

  private canFreeze(identity: BootstrapRequestIdentity | null) {
    return (
      identity?.realm === "system" ||
      this.hasAnyRole(identity, ["safety_officer", "ops_supervisor", "ops_manager"])
    );
  }

  private canFallback(identity: BootstrapRequestIdentity | null) {
    return (
      identity?.realm === "system" ||
      this.hasAnyRole(identity, ["roc_operator", "ops_supervisor", "ops_manager"])
    );
  }

  private canNotify(identity: BootstrapRequestIdentity | null) {
    return this.canCoordinate(identity);
  }

  private canResolve(identity: BootstrapRequestIdentity | null) {
    return (
      identity?.realm === "system" ||
      this.hasAnyRole(identity, ["safety_officer", "ops_supervisor", "ops_manager"])
    );
  }

  private hasAnyRole(
    identity: BootstrapRequestIdentity | null,
    roles: readonly string[],
  ) {
    return roles.some((role) => identity?.roles?.includes(role));
  }

  private normalizeRequired(value: string, field: string) {
    const normalized = value.trim();
    if (!normalized) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ROC_ACTION_FIELD_REQUIRED",
        `${field} is required.`,
        {
          field,
        },
      );
    }
    return normalized;
  }

  private normalizeOptional(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private resolveActorId(
    identity: BootstrapRequestIdentity | null,
    fallback: string,
  ) {
    return identity?.actorId ?? fallback;
  }

  private correlateForReport(report: SafetyOperatorTakeoverReport) {
    const manualLink = this.manualCorrelations.find(
      (candidate) => candidate.takeoverReportId === report.reportId,
    );

    let teslaEvent: TeslaAutonomyTransitionEvent | null = null;
    let rocResponse: RocTakeoverResponseRecord | null = null;
    let correlationPriority: 1 | 2 | 3 = 2;
    let matchedBy: CorrelatedTakeoverCase["matchedBy"] = "vehicle_time_trip";

    if (manualLink) {
      correlationPriority = 3;
      matchedBy = "manual";
      teslaEvent =
        this.teslaTransitionEvents.find(
          (event) => event.eventId === manualLink.teslaEventId,
        ) ?? null;
      rocResponse =
        this.takeoverResponses.find(
          (response) => response.responseId === manualLink.rocResponseId,
        ) ?? null;
    } else {
      const priorityOneTeslaEvent = this.findPriorityOneTeslaEvent(report);
      const priorityOneRocResponse = this.findPriorityOneRocResponse(
        report,
        priorityOneTeslaEvent,
      );
      const priorityTwoTeslaEvent =
        priorityOneTeslaEvent ?? this.findPriorityTwoTeslaEvent(report);
      const priorityTwoRocResponse =
        priorityOneRocResponse ?? this.findPriorityTwoRocResponse(report);

      teslaEvent = priorityTwoTeslaEvent;
      rocResponse = priorityTwoRocResponse;

      if (priorityOneTeslaEvent || priorityOneRocResponse) {
        correlationPriority = 1;
        matchedBy = "takeover_correlation_id";
      }
    }

    const caseRecord: CorrelatedTakeoverCase = {
      correlatedTakeoverCaseId: `takeover-case-${report.reportId}`,
      vehicleId: report.vehicleId,
      orderId: report.orderId,
      takeoverCorrelationId: report.correlationId,
      correlationPriority,
      matchedBy,
      sourceRecordIds: {
        teslaEventId: teslaEvent?.eventId ?? null,
        safetyOperatorTakeoverReportId: report.reportId,
        rocTakeoverResponseId: rocResponse?.responseId ?? null,
      },
      sourceTimestamps: {
        teslaOccurredAt: teslaEvent?.occurredAt ?? null,
        safetyOccurredAt: report.occurredAt,
        safetyServerReceivedAt: report.serverReceivedAt,
        rocRequestedAt: rocResponse?.requestedAt ?? null,
        rocRespondedAt: rocResponse?.respondedAt ?? null,
        rocResolvedAt: rocResponse?.resolvedAt ?? null,
      },
      teslaEvent: teslaEvent ? this.cloneTeslaEvent(teslaEvent) : null,
      safetyOperatorTakeoverReport: this.cloneTakeoverReport(report),
      rocTakeoverResponse: rocResponse ? this.cloneRocResponse(rocResponse) : null,
      manualCorrelation: manualLink ? this.cloneManualLink(manualLink) : null,
      discrepancyCaseIds: [],
    };

    const discrepancy = this.buildDiscrepancyCase(caseRecord);
    if (discrepancy) {
      caseRecord.discrepancyCaseIds = [discrepancy.discrepancyCaseId];
    }

    return {
      caseRecord,
      discrepancy,
    };
  }

  private findPriorityOneTeslaEvent(report: SafetyOperatorTakeoverReport) {
    return this.findBestMatch(
      this.teslaTransitionEvents,
      report.occurredAt,
      PRIORITY_ONE_WINDOW_MS,
      (candidate) =>
        candidate.takeoverCorrelationId != null &&
        candidate.takeoverCorrelationId === report.correlationId &&
        candidate.vehicleId === report.vehicleId,
      (left, right) => {
        const transitionRank =
          this.rankTeslaPriorityOneTransition(left.transitionType) -
          this.rankTeslaPriorityOneTransition(right.transitionType);
        if (transitionRank !== 0) {
          return transitionRank;
        }

        return (
          this.timestampDistance(left.occurredAt, report.occurredAt) -
          this.timestampDistance(right.occurredAt, report.occurredAt)
        );
      },
      (candidate) => candidate.occurredAt,
    );
  }

  private findPriorityOneRocResponse(
    report: SafetyOperatorTakeoverReport,
    teslaEvent: TeslaAutonomyTransitionEvent | null,
  ) {
    return this.findBestMatch(
      this.takeoverResponses,
      report.occurredAt,
      PRIORITY_ONE_WINDOW_MS,
      (candidate) =>
        candidate.vehicleId === report.vehicleId &&
        ((candidate.takeoverCorrelationId != null &&
          candidate.takeoverCorrelationId === report.correlationId) ||
          (teslaEvent != null &&
            (candidate.triggeredByTeslaEventId === teslaEvent.eventId ||
              (candidate.autonomySessionId != null &&
                candidate.autonomySessionId === teslaEvent.autonomySessionId)))),
      (left, right) => {
        const relationRank =
          this.rankPriorityOneRocResponse(left, report, teslaEvent) -
          this.rankPriorityOneRocResponse(right, report, teslaEvent);
        if (relationRank !== 0) {
          return relationRank;
        }

        return (
          this.timestampDistance(left.requestedAt, report.occurredAt) -
          this.timestampDistance(right.requestedAt, report.occurredAt)
        );
      },
      (candidate) => candidate.requestedAt,
    );
  }

  private findPriorityTwoTeslaEvent(report: SafetyOperatorTakeoverReport) {
    return this.findNearestByTime(
      this.teslaTransitionEvents,
      report.occurredAt,
      PRIORITY_TWO_WINDOW_MS,
      (candidate) =>
        candidate.vehicleId === report.vehicleId &&
        candidate.orderId != null &&
        candidate.orderId === report.orderId,
      (candidate) => candidate.occurredAt,
    );
  }

  private findPriorityTwoRocResponse(report: SafetyOperatorTakeoverReport) {
    return this.findNearestByTime(
      this.takeoverResponses,
      report.occurredAt,
      PRIORITY_TWO_WINDOW_MS,
      (candidate) =>
        candidate.vehicleId === report.vehicleId &&
        candidate.orderId != null &&
        candidate.orderId === report.orderId,
      (candidate) => candidate.requestedAt,
    );
  }

  private buildDiscrepancyCase(
    caseRecord: CorrelatedTakeoverCase,
  ): EvidenceDiscrepancyCase | null {
    const discrepancyTypes = new Set<
      EvidenceDiscrepancyCase["discrepancyTypes"][number]
    >();
    const teslaEvent = caseRecord.teslaEvent;
    const safetyReport = caseRecord.safetyOperatorTakeoverReport;
    const rocResponse = caseRecord.rocTakeoverResponse;

    const eventTimes = [
      teslaEvent?.occurredAt ?? null,
      safetyReport.occurredAt,
      rocResponse?.requestedAt ?? null,
      rocResponse?.respondedAt ?? null,
    ].filter((value): value is string => value != null);

    if (eventTimes.length >= 2) {
      const millis = eventTimes.map((value) => Date.parse(value));
      const spread = Math.max(...millis) - Math.min(...millis);
      if (spread > DISCREPANCY_WINDOW_MS) {
        discrepancyTypes.add("timestamp_mismatch");
      }
    }

    const orderIds = [teslaEvent?.orderId, safetyReport.orderId, rocResponse?.orderId]
      .filter((value): value is string => value != null)
      .filter((value, index, values) => values.indexOf(value) === index);
    if (orderIds.length > 1) {
      discrepancyTypes.add("trip_mismatch");
    }

    const correlationIds = [
      teslaEvent?.takeoverCorrelationId,
      safetyReport.correlationId,
      rocResponse?.takeoverCorrelationId,
    ]
      .filter((value): value is string => value != null)
      .filter((value, index, values) => values.indexOf(value) === index);
    if (correlationIds.length > 1) {
      discrepancyTypes.add("correlation_id_mismatch");
    }

    if (discrepancyTypes.size === 0) {
      return null;
    }

    return {
      discrepancyCaseId: `takeover-discrepancy-${safetyReport.reportId}`,
      correlatedTakeoverCaseId: caseRecord.correlatedTakeoverCaseId,
      vehicleId: caseRecord.vehicleId,
      discrepancyTypes: [...discrepancyTypes],
      openedAt: new Date().toISOString(),
      summary: `Discrepancies detected across correlated takeover sources for report ${safetyReport.reportId}.`,
      sourceFacts: {
        teslaOccurredAt: teslaEvent?.occurredAt ?? null,
        safetyOccurredAt: safetyReport.occurredAt,
        rocRequestedAt: rocResponse?.requestedAt ?? null,
        rocRespondedAt: rocResponse?.respondedAt ?? null,
        teslaOrderId: teslaEvent?.orderId ?? null,
        safetyOrderId: safetyReport.orderId,
        rocOrderId: rocResponse?.orderId ?? null,
        teslaTakeoverCorrelationId: teslaEvent?.takeoverCorrelationId ?? null,
        safetyTakeoverCorrelationId: safetyReport.correlationId,
        rocTakeoverCorrelationId: rocResponse?.takeoverCorrelationId ?? null,
      },
    };
  }

  private timestampDistance(left: string, right: string) {
    return Math.abs(Date.parse(left) - Date.parse(right));
  }

  private findNearestByTime<T>(
    records: readonly T[],
    targetTime: string,
    windowMs: number,
    predicate: (record: T) => boolean,
    getTimestamp: (record: T) => string,
  ) {
    let closest: T | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const record of records) {
      if (!predicate(record)) {
        continue;
      }

      const distance = Math.abs(
        Date.parse(getTimestamp(record)) - Date.parse(targetTime),
      );
      if (distance > windowMs || distance >= closestDistance) {
        continue;
      }

      closest = record;
      closestDistance = distance;
    }

    return closest;
  }

  private findBestMatch<T>(
    records: readonly T[],
    targetTime: string,
    windowMs: number,
    predicate: (record: T) => boolean,
    compare: (left: T, right: T) => number,
    getTimestamp: (record: T) => string,
  ) {
    let best: T | null = null;

    for (const record of records) {
      if (!predicate(record)) {
        continue;
      }

      if (this.timestampDistance(getTimestamp(record), targetTime) > windowMs) {
        continue;
      }

      if (best == null || compare(record, best) < 0) {
        best = record;
      }
    }

    return best;
  }

  private rankTeslaPriorityOneTransition(
    transitionType: TeslaAutonomyTransitionEvent["transitionType"],
  ) {
    switch (transitionType) {
      case "manual_takeover":
        return 0;
      case "fsd_disengagement":
        return 1;
      case "autonomy_resumed":
        return 2;
      default:
        return Number.MAX_SAFE_INTEGER;
    }
  }

  private rankPriorityOneRocResponse(
    response: RocTakeoverResponseRecord,
    report: SafetyOperatorTakeoverReport,
    teslaEvent: TeslaAutonomyTransitionEvent | null,
  ) {
    if (teslaEvent != null && response.triggeredByTeslaEventId === teslaEvent.eventId) {
      return 0;
    }

    if (
      teslaEvent != null &&
      teslaEvent.autonomySessionId != null &&
      response.autonomySessionId != null &&
      response.autonomySessionId === teslaEvent.autonomySessionId
    ) {
      return 1;
    }

    if (
      response.takeoverCorrelationId != null &&
      response.takeoverCorrelationId === report.correlationId
    ) {
      return 2;
    }

    return 3;
  }

  private cloneTeslaEvent(event: TeslaAutonomyTransitionEvent) {
    return {
      ...event,
      source: { ...event.source },
    };
  }

  private cloneRocResponse(record: RocTakeoverResponseRecord) {
    return {
      ...record,
      source: { ...record.source },
    };
  }

  private cloneManualLink(link: ManualTakeoverCorrelationLink) {
    return { ...link };
  }

  private cloneTakeoverReport(report: SafetyOperatorTakeoverReport) {
    return {
      ...report,
      evidenceArtifactIds: [...report.evidenceArtifactIds],
    };
  }
}
