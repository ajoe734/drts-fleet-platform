import { Injectable, Logger } from "@nestjs/common";

import type {
  CorrelatedTakeoverCase,
  CreateManualTakeoverCorrelationCommand,
  EvidenceDiscrepancyCase,
  ManualTakeoverCorrelationLink,
  RocTakeoverResponseRecord,
  SafetyOperatorTakeoverReport,
  TeslaAutonomyTransitionEvent,
  TakeoverDiscrepancyType,
} from "@drts/contracts";

import type { BootstrapRequestIdentity } from "../../common/auth";
import { SafetyOperatorService } from "../safety-operator/safety-operator.service";

const PRIORITY_ONE_WINDOW_MS = 5 * 60 * 1000;
const PRIORITY_TWO_WINDOW_MS = 10 * 60 * 1000;
const DISCREPANCY_WINDOW_MS = 2 * 60 * 1000;
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

@Injectable()
export class RocOperationsService {
  private readonly logger = new Logger(RocOperationsService.name);

  private teslaTransitionEvents: TeslaAutonomyTransitionEvent[] = [];
  private takeoverResponses: RocTakeoverResponseRecord[] = [];
  private manualCorrelations: ManualTakeoverCorrelationLink[] = [];

  constructor(
    private readonly safetyOperatorService: SafetyOperatorService,
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
      teslaEvent = this.findPriorityOneTeslaEvent(report);
      rocResponse = this.findPriorityOneRocResponse(report, teslaEvent);

      if (teslaEvent || rocResponse) {
        correlationPriority = 1;
        matchedBy = "takeover_correlation_id";
      } else {
        teslaEvent = this.findPriorityTwoTeslaEvent(report);
        rocResponse = this.findPriorityTwoRocResponse(report);
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
    return (
      this.teslaTransitionEvents.find(
        (candidate) =>
          candidate.takeoverCorrelationId != null &&
          candidate.takeoverCorrelationId === report.correlationId &&
          candidate.vehicleId === report.vehicleId &&
          this.withinWindow(
            candidate.occurredAt,
            report.occurredAt,
            PRIORITY_ONE_WINDOW_MS,
          ),
      ) ?? null
    );
  }

  private findPriorityOneRocResponse(
    report: SafetyOperatorTakeoverReport,
    teslaEvent: TeslaAutonomyTransitionEvent | null,
  ) {
    return (
      this.takeoverResponses.find(
        (candidate) =>
          candidate.vehicleId === report.vehicleId &&
          ((candidate.takeoverCorrelationId != null &&
            candidate.takeoverCorrelationId === report.correlationId) ||
            (teslaEvent != null &&
              (candidate.triggeredByTeslaEventId === teslaEvent.eventId ||
                (candidate.autonomySessionId != null &&
                  candidate.autonomySessionId ===
                    teslaEvent.autonomySessionId)))) &&
          this.withinWindow(
            candidate.requestedAt,
            report.occurredAt,
            PRIORITY_ONE_WINDOW_MS,
          ),
      ) ?? null
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
    const discrepancyTypes = new Set<TakeoverDiscrepancyType>();
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

  private withinWindow(left: string, right: string, windowMs: number) {
    return Math.abs(Date.parse(left) - Date.parse(right)) <= windowMs;
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
