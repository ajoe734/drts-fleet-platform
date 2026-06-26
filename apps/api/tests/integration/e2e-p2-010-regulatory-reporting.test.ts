import type { AddressInfo } from "node:net";

import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { NestFactory } from "@nestjs/core";
import { afterEach, describe, expect, it } from "vitest";

import type { Phase2SourceMetadata } from "@drts/contracts";

import { BootstrapAuthGuard } from "../../src/common/auth";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { IncidentService } from "../../src/modules/incident/incident.service";
import { RegulatoryReportJobsService } from "../../src/modules/regulatory-reporting/regulatory-report-jobs.service";
import { RegulatoryReportingController } from "../../src/modules/regulatory-reporting/regulatory-reporting.controller";
import { RegulatoryReportingService } from "../../src/modules/regulatory-reporting/regulatory-reporting.service";
import { RocOperationsService } from "../../src/modules/roc-operations/roc-operations.service";
import { SafetyOperatorService } from "../../src/modules/safety-operator/safety-operator.service";
import { SandboxGovernanceService } from "../../src/modules/sandbox-governance/sandbox-governance.service";
import { TeslaIntegrationService } from "../../src/modules/tesla-integration/tesla-integration.service";

function buildSource(
  sourceSystem: Phase2SourceMetadata["sourceSystem"],
  sourceRef: string,
  recordedAt: string,
): Phase2SourceMetadata {
  return {
    sourceSystem,
    sourceRef,
    ingestedAt: recordedAt,
    recordedAt,
    signatureRef: null,
    schemaVersion: "2026-06",
  };
}

function buildHeaders(overrides: Record<string, string> = {}) {
  return {
    "content-type": "application/json",
    "x-actor-type": "ops_user",
    "x-actor-id": "ops-user-010",
    "x-realm": "ops",
    "x-role-families": "ops",
    "x-roles": "compliance_manager",
    "x-scopes": "regulatory:read,regulatory:write,audit:read",
    ...overrides,
  };
}

async function createTestApp() {
  const auditNotificationService = new AuditNotificationService();
  const regulatoryNotificationService = new RegulatoryReportingService(
    auditNotificationService,
  );
  const sandboxGovernanceService = new SandboxGovernanceService(
    auditNotificationService,
  );
  const incidentService = new IncidentService(auditNotificationService);
  const safetyOperatorService = new SafetyOperatorService(
    auditNotificationService,
    undefined,
    sandboxGovernanceService,
  );
  const teslaIntegrationService = new TeslaIntegrationService(
    auditNotificationService,
    {
      listVehicles: () => [
        { vehicleId: "veh-av-demo-001" },
        { vehicleId: "veh-av-demo-002" },
      ],
    } as never,
  );
  const rocOperationsService = new RocOperationsService(
    safetyOperatorService,
    incidentService,
    undefined,
    teslaIntegrationService,
  );
  const regulatoryReportJobsService = new RegulatoryReportJobsService(
    auditNotificationService,
    {
      listDailyDispatchRecords: async () => [
        {
          serviceDate: "2026-06-20",
          orderId: "ord-reg-010-pre",
          orderNo: "ORD-REG-010-PRE",
          requestedAt: "2026-06-20T07:30:00.000Z",
          finalStatus: "completed",
          finalVehicleId: "veh-av-demo-001",
          generatedAt: "2026-06-20T07:35:00.000Z",
        },
        {
          serviceDate: "2026-06-26",
          orderId: "ord-reg-010-001",
          orderNo: "ORD-REG-010-001",
          requestedAt: "2026-06-26T08:00:00.000Z",
          finalStatus: "completed",
          finalVehicleId: "veh-av-demo-001",
          generatedAt: "2026-06-26T08:30:00.000Z",
        },
        {
          serviceDate: "2026-06-26",
          orderId: "ord-reg-010-002",
          orderNo: "ORD-REG-010-002",
          requestedAt: "2026-06-26T09:15:00.000Z",
          finalStatus: "cancelled",
          finalVehicleId: "veh-av-demo-001",
          generatedAt: "2026-06-26T09:20:00.000Z",
        },
        {
          serviceDate: "2026-07-01",
          orderId: "ord-reg-010-post",
          orderNo: "ORD-REG-010-POST",
          requestedAt: "2026-07-01T09:15:00.000Z",
          finalStatus: "completed",
          finalVehicleId: "veh-av-demo-001",
          generatedAt: "2026-07-01T09:20:00.000Z",
        },
      ],
    } as never,
    rocOperationsService,
    teslaIntegrationService,
    sandboxGovernanceService,
    incidentService,
    regulatoryNotificationService,
  );

  const jurisdiction = sandboxGovernanceService.createJurisdiction({
    jurisdictionCode: "ca-dmv",
    name: "California DMV Sandbox",
    regulatorName: "California DMV",
    effectiveFrom: "2026-06-26T00:00:00.000Z",
    actorId: "ops-user-010",
  });
  sandboxGovernanceService.publishJurisdictionVersion(
    jurisdiction.jurisdictionId,
    jurisdiction.currentVersionId as string,
    {
      effectiveFrom: "2026-06-26T00:00:00.000Z",
      actorId: "ops-user-010",
    },
  );

  const experiment = sandboxGovernanceService.createExperiment({
    programCode: "phase2-tesla-fsd-sandbox-202606",
    name: "Phase 2 Tesla FSD sandbox",
    jurisdictionIds: [jurisdiction.jurisdictionId],
    effectiveFrom: "2026-06-26T00:00:00.000Z",
    actorId: "ops-user-010",
  });
  sandboxGovernanceService.publishExperimentVersion(
    experiment.experimentId,
    experiment.currentVersionId as string,
    {
      effectiveFrom: "2026-06-26T00:00:00.000Z",
      actorId: "ops-user-010",
    },
  );
  sandboxGovernanceService.suspendExperimentAuthorizations(
    experiment.experimentId,
    {
      effectiveFrom: "2026-06-26T09:00:00.000Z",
      actorId: "ops-user-010",
      reason: "Pending regulator resume packet.",
    },
  );

  const approvalDocument = sandboxGovernanceService.createApprovalDocument({
    experimentId: experiment.experimentId,
    jurisdictionId: jurisdiction.jurisdictionId,
    documentType: "operating_plan",
    title: "Resume operating plan",
    summary: "Published regulator packet.",
    artifactFileName: "resume-operating-plan.pdf",
    artifactContentType: "application/pdf",
    artifactContentBase64: Buffer.from("resume-plan").toString("base64"),
    effectiveFrom: "2026-06-26T00:00:00.000Z",
    actorId: "ops-user-010",
  });
  sandboxGovernanceService.publishApprovalDocumentVersion(
    approvalDocument.documentId,
    approvalDocument.currentVersionId as string,
    {
      effectiveFrom: "2026-06-26T00:00:00.000Z",
      actorId: "ops-user-010",
    },
  );

  teslaIntegrationService.bindVehicle(
    {
      vehicleId: "veh-av-demo-001",
      vin: "5YJ3E1EA7JF000001",
    },
    "req-bind-010",
  );
  teslaIntegrationService.configureTelemetry(
    {
      vehicleId: "veh-av-demo-001",
      mode: "public_mock",
      sampleIntervalSec: 30,
      mockOnline: true,
      mockBatteryLevelPct: 81,
      mockLocation: {
        lat: 25.0478,
        lng: 121.5319,
      },
    },
    "req-telemetry-010",
  );

  incidentService.createIncident(
    {
      title: "Sandbox safety review",
      description: "Incident record used for regulatory reporting coverage.",
      category: "safety",
      severity: "high",
      reportedBy: "ops-user-010",
      relatedOrderId: "ord-reg-010-001",
      relatedVehicleId: "veh-av-demo-001",
      occurredAt: "2026-06-26T08:05:00.000Z",
    },
    "req-incident-010",
    {
      authMode: "bootstrap_headers",
      actorType: "ops_user",
      actorId: "ops-user-010",
      realm: "ops",
      tenantId: null,
      roleFamilies: ["ops"],
      roles: ["compliance_manager"],
      scopes: ["incident:write"],
      requestId: "req-incident-010",
    },
  );

  regulatoryNotificationService.createNotification(
    {
      eventId: "evt-reg-010",
      eventType: "manual_takeover",
      severity: "incident",
      reportVersionKind: "initial",
      jurisdiction: "ca-dmv",
      vehicleId: "veh-av-demo-001",
      eventOccurredAt: "2026-06-26T08:03:00.000Z",
      summary: "Regulatory notification remains open for compliance summary.",
    },
    {
      authMode: "bootstrap_headers",
      actorType: "ops_user",
      actorId: "ops-user-010",
      realm: "ops",
      tenantId: null,
      roleFamilies: ["ops"],
      roles: ["compliance_manager"],
      scopes: ["regulatory:write"],
      requestId: "req-reg-notif-010",
    },
    "req-reg-notif-010",
  );

  const safetyIdentity = {
    authMode: "bootstrap_headers" as const,
    actorType: "driver_user" as const,
    actorId: "safety-op-001",
    realm: "driver" as const,
    tenantId: null,
    roleFamilies: ["driver"] as const,
    roles: ["driver_user"],
    scopes: ["driver:read", "driver:write"],
    requestId: "req-safe-010",
  };
  const assignment = await safetyOperatorService.createAssignment(
    {
      safetyOperatorId: "safety-op-001",
      vehicleId: "veh-av-demo-001",
      orderId: "ord-reg-010-001",
      sandboxProgramId: "phase2-tesla-fsd-sandbox-202606",
    },
    safetyIdentity,
  );
  const shift = await safetyOperatorService.startShift(
    {
      safetyOperatorId: "safety-op-001",
      sandboxProgramId: "phase2-tesla-fsd-sandbox-202606",
      deviceId: "device-safe-010",
      vehicleId: "veh-av-demo-001",
      assignmentId: assignment.assignmentId,
      startLocation: { lat: 25.0478, lng: 121.5319 },
      notes: "E2E-P2-010 shift",
    },
    safetyIdentity,
  );
  await safetyOperatorService.submitTakeoverReport(
    {
      clientGeneratedReportId: "client-report-reg-010",
      safetyOperatorId: "safety-op-001",
      vehicleId: "veh-av-demo-001",
      orderId: "ord-reg-010-001",
      sandboxProgramId: "phase2-tesla-fsd-sandbox-202606",
      shiftId: shift.shiftId,
      assignmentId: assignment.assignmentId,
      correlationId: "corr-reg-010",
      trigger: "vehicle_alert",
      reasonCode: "sensor_fault",
      disposition: "remote_assist",
      fsdResumed: false,
      bookmarkId: null,
      incidentId: null,
      evidenceArtifactIds: ["artifact-reg-010"],
      notes: "Safety operator takeover for regulatory packet.",
      occurredAt: "2026-06-26T08:02:00.000Z",
    },
    safetyIdentity,
  );

  rocOperationsService.recordTeslaAutonomyTransitionEvent({
    eventId: "tesla-reg-010",
    takeoverCorrelationId: "corr-reg-010",
    autonomySessionId: "session-reg-010",
    vehicleId: "veh-av-demo-001",
    orderId: "ord-reg-010-001",
    transitionType: "manual_takeover",
    occurredAt: "2026-06-26T08:02:20.000Z",
    source: buildSource(
      "tesla_fleet_api",
      "tesla-reg-010",
      "2026-06-26T08:02:20.000Z",
    ),
  });
  rocOperationsService.recordTeslaAutonomyTransitionEvent({
    eventId: "tesla-reg-010-resume",
    takeoverCorrelationId: "corr-reg-010",
    autonomySessionId: "session-reg-010",
    vehicleId: "veh-av-demo-001",
    orderId: "ord-reg-010-001",
    transitionType: "autonomy_resumed",
    occurredAt: "2026-06-26T08:03:20.000Z",
    source: buildSource(
      "tesla_fleet_api",
      "tesla-reg-010-resume",
      "2026-06-26T08:03:20.000Z",
    ),
  });
  rocOperationsService.recordRocTakeoverResponseRecord({
    responseId: "roc-reg-010",
    takeoverCorrelationId: "corr-reg-010",
    autonomySessionId: "session-reg-010",
    triggeredByTeslaEventId: "tesla-reg-010",
    rocOperatorId: "roc-010",
    vehicleId: "veh-av-demo-001",
    orderId: "ord-reg-010-001",
    responseType: "remote_assist",
    requestedAt: "2026-06-26T08:02:30.000Z",
    respondedAt: "2026-06-26T08:02:50.000Z",
    resolvedAt: null,
    outcomeNote: "ROC acknowledged takeover.",
    source: buildSource(
      "roc_operator",
      "roc-reg-010",
      "2026-06-26T08:02:30.000Z",
    ),
  });

  @Module({
    controllers: [RegulatoryReportingController],
    providers: [
      {
        provide: RegulatoryReportingService,
        useValue: regulatoryNotificationService,
      },
      {
        provide: RegulatoryReportJobsService,
        useValue: regulatoryReportJobsService,
      },
      {
        provide: APP_GUARD,
        useClass: BootstrapAuthGuard,
      },
    ],
  })
  class RegulatoryReportingE2eTestModule {}

  const app = await NestFactory.create(RegulatoryReportingE2eTestModule, {
    logger: false,
  });
  app.setGlobalPrefix("api");
  await app.init();
  await app.listen(0, "127.0.0.1");

  const address = app.getHttpServer().address() as AddressInfo | null;
  if (!address) {
    throw new Error("expected test server address");
  }

  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
    experimentId: experiment.experimentId,
  };
}

async function flushJobs() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("E2E-P2-010 regulatory reporting", () => {
  afterEach(() => {
    // placeholder for consistency with existing integration style
  });

  it("generates all regulatory report jobs, serves compliance summary, and assembles a resume dossier with evidence traceability", async () => {
    const { app, baseUrl, experimentId } = await createTestApp();

    try {
      const reportTypes = [
        "daily_ops_report",
        "trip_report",
        "takeover_report",
        "fsd_session_report",
        "telemetry_completeness_report",
        "incident_report",
      ];
      const jobIds = new Map<string, string>();

      for (const reportType of reportTypes) {
        const response = await fetch(`${baseUrl}/api/regulatory/reports/jobs`, {
          method: "POST",
          headers: buildHeaders(),
          body: JSON.stringify({
            reportType,
            format: "pdf",
            filters: {
              experimentId,
              asOf: "2026-06-26T10:00:00.000Z",
            },
          }),
        });
        expect(response.ok).toBe(true);
        const body = await response.json();
        jobIds.set(reportType, body.data.jobId as string);
      }

      await flushJobs();

      const listResponse = await fetch(
        `${baseUrl}/api/regulatory/reports/jobs`,
        {
          method: "GET",
          headers: buildHeaders({
            "x-scopes": "regulatory:read",
          }),
        },
      );
      expect(listResponse.ok).toBe(true);
      const listBody = await listResponse.json();
      expect(listBody.data.items).toEqual(
        expect.arrayContaining(
          reportTypes.map((reportType) =>
            expect.objectContaining({
              reportType,
              status: "completed",
              artifact: expect.objectContaining({
                immutable: true,
              }),
            }),
          ),
        ),
      );

      const takeoverJobId = jobIds.get("takeover_report") as string;
      const jobResponse = await fetch(
        `${baseUrl}/api/regulatory/reports/jobs/${takeoverJobId}`,
        {
          method: "GET",
          headers: buildHeaders({
            "x-scopes": "regulatory:read",
          }),
        },
      );
      expect(jobResponse.ok).toBe(true);
      const jobBody = await jobResponse.json();
      expect(jobBody.data).toMatchObject({
        jobId: takeoverJobId,
        reportType: "takeover_report",
        status: "completed",
        evidenceTrace: expect.arrayContaining([
          expect.objectContaining({
            sourceType: "correlated_takeover_case",
          }),
          expect.objectContaining({
            sourceType: "takeover_report",
          }),
        ]),
      });

      const summaryResponse = await fetch(
        `${baseUrl}/api/regulatory/experiments/${experimentId}/compliance-summary?asOf=${encodeURIComponent(
          "2026-06-26T10:00:00.000Z",
        )}`,
        {
          method: "GET",
          headers: buildHeaders({
            "x-scopes": "regulatory:read",
          }),
        },
      );
      expect(summaryResponse.ok).toBe(true);
      const summaryBody = await summaryResponse.json();
      expect(summaryBody.data).toMatchObject({
        experimentId,
        authorizationStatus: "suspended",
        vehicleEnrollmentCount: 1,
        approvalDocumentCount: 1,
      });
      expect(summaryBody.data.openNotificationCount).toBeGreaterThanOrEqual(1);
      expect(summaryBody.data.reportCoverage).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            reportType: "daily_ops_report",
            status: "completed",
          }),
          expect.objectContaining({
            reportType: "telemetry_completeness_report",
            status: "completed",
          }),
        ]),
      );

      const kpiDashboardResponse = await fetch(
        `${baseUrl}/api/regulatory/experiments/${experimentId}/kpi-dashboard?asOf=${encodeURIComponent(
          "2026-06-26T10:00:00.000Z",
        )}&baselineWindowDays=14&baselineWindowTrips=12`,
        {
          method: "GET",
          headers: buildHeaders({
            "x-scopes": "regulatory:read",
          }),
        },
      );
      expect(kpiDashboardResponse.ok).toBe(true);
      const kpiDashboardBody = await kpiDashboardResponse.json();
      expect(kpiDashboardBody.data.baselineWindow).toMatchObject({
        targetStatus: "baseline_collecting",
        configuredDays: 14,
        configuredTrips: 12,
        tripsCollected: 2,
      });
      expect(kpiDashboardBody.data.targets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: "readiness",
            targetStatus: "baseline_collecting",
          }),
          expect.objectContaining({
            key: "telemetry_freshness",
            targetStatus: "baseline_collecting",
          }),
          expect.objectContaining({
            key: "notification_timeliness",
            targetStatus: "baseline_collecting",
          }),
          expect.objectContaining({
            key: "fallback_success",
            numerator: 2,
            denominator: 2,
          }),
        ]),
      );
      expect(kpiDashboardBody.data.safetyGates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: "telemetry_stale",
            hardAlert: true,
            failClosed: true,
          }),
          expect.objectContaining({
            key: "notification_overdue",
            hardAlert: true,
            failClosed: true,
          }),
        ]),
      );

      const dossierResponse = await fetch(
        `${baseUrl}/api/regulatory/experiments/${experimentId}/resume-dossiers`,
        {
          method: "POST",
          headers: buildHeaders(),
          body: JSON.stringify({
            asOf: "2026-06-26T10:00:00.000Z",
            note: "Resume dossier for regulator handoff.",
          }),
        },
      );
      expect(dossierResponse.ok).toBe(true);
      const dossierBody = await dossierResponse.json();
      expect(dossierBody.data).toMatchObject({
        experimentId,
        authorizationStatus: "suspended",
        immutable: true,
        artifact: expect.objectContaining({
          artifactType: "filing",
          immutable: true,
        }),
        sections: expect.arrayContaining([
          expect.objectContaining({
            sectionId: "report_artifacts",
          }),
        ]),
        sourceRefs: expect.arrayContaining([
          expect.objectContaining({
            sourceType: "sandbox_compliance_snapshot",
          }),
          expect.objectContaining({
            sourceType: "regulatory_report_job",
          }),
        ]),
      });

      const dossierId = dossierBody.data.dossierId as string;
      const dossierGetResponse = await fetch(
        `${baseUrl}/api/regulatory/resume-dossiers/${dossierId}`,
        {
          method: "GET",
          headers: buildHeaders({
            "x-scopes": "regulatory:read",
          }),
        },
      );
      expect(dossierGetResponse.ok).toBe(true);
      const dossierGetBody = await dossierGetResponse.json();
      expect(dossierGetBody.data.dossierId).toBe(dossierId);
      expect(dossierGetBody.data.reportJobs).toHaveLength(6);
      expect(dossierGetBody.data.complianceSummary.reportCoverage).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            reportType: "incident_report",
            status: "completed",
          }),
        ]),
      );
    } finally {
      await app.close();
    }
  });
});
