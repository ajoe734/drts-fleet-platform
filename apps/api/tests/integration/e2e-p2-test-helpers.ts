import { EventEmitter2 } from "@nestjs/event-emitter";

import type { Phase2SourceMetadata } from "@drts/contracts";

import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import type { BootstrapRequestIdentity } from "../../src/common/auth";
import { AccidentInvestigationService } from "../../src/modules/accident-investigation/accident-investigation.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";
import { RocOperationsService } from "../../src/modules/roc-operations/roc-operations.service";
import { SafetyOperatorService } from "../../src/modules/safety-operator/safety-operator.service";
import { SandboxDispatchGateService } from "../../src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.service";
import { SandboxGovernanceService } from "../../src/modules/sandbox-governance/sandbox-governance.service";
import { TeslaIntegrationService } from "../../src/modules/tesla-integration/tesla-integration.service";
import { VehicleEvidenceService } from "../../src/modules/vehicle-evidence/vehicle-evidence.service";

export const DEFAULT_SANDBOX_PROGRAM_ID = "phase2-tesla-fsd-sandbox-202606";
export const DEFAULT_SAFETY_OPERATOR_ID = "safe-op-001";

export function buildSource(
  sourceSystem: Phase2SourceMetadata["sourceSystem"],
  sourceRef: string,
  recordedAt: string,
  signatureRef: string | null = null,
): Phase2SourceMetadata {
  return {
    sourceSystem,
    sourceRef,
    ingestedAt: recordedAt,
    recordedAt,
    signatureRef,
    schemaVersion: "2026-06",
  };
}

export function buildDriverIdentity(
  safetyOperatorId: string = DEFAULT_SAFETY_OPERATOR_ID,
  requestId = `req-${safetyOperatorId}`,
): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "driver_user",
    actorId: safetyOperatorId,
    realm: "driver",
    tenantId: null,
    roleFamilies: ["driver"],
    roles: ["driver_user"],
    scopes: ["driver:read", "driver:write"],
    requestId,
  };
}

export function buildGovernanceServiceStub(
  sandboxProgramId: string = DEFAULT_SANDBOX_PROGRAM_ID,
  safetyOperatorId: string = DEFAULT_SAFETY_OPERATOR_ID,
) {
  return {
    listSafetyOperatorQualifications: () => [
      {
        qualificationId: `qual-${safetyOperatorId}`,
        sandboxProgramId,
        safetyOperatorId,
        providerCode: "tesla",
        version: 1,
        status: "qualified",
        approvedAreaIds: ["odd-downtown-core"],
        approvedRouteIds: ["route-downtown-loop"],
        certificationRefs: ["cert-001"],
        effectiveFrom: "2026-06-01T00:00:00.000Z",
        effectiveUntil: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ],
  };
}

export function createPublicFleetHarness(options?: {
  sandboxProgramId?: string;
  safetyOperatorId?: string;
}) {
  const sandboxProgramId =
    options?.sandboxProgramId ?? DEFAULT_SANDBOX_PROGRAM_ID;
  const safetyOperatorId =
    options?.safetyOperatorId ?? DEFAULT_SAFETY_OPERATOR_ID;

  const auditNotificationService = new AuditNotificationService();
  const opsDispatchEventsService = new OpsDispatchEventsService(
    new EventEmitter2(),
  );
  const driverProfileService = new DriverProfileService(
    auditNotificationService,
  );
  const regulatoryRegistryService = new RegulatoryRegistryService(
    opsDispatchEventsService,
    auditNotificationService,
    driverProfileService,
  );
  const teslaIntegrationService = new TeslaIntegrationService(
    auditNotificationService,
    regulatoryRegistryService,
  );
  const vehicleEvidenceService = new VehicleEvidenceService();
  const safetyOperatorService = new SafetyOperatorService(
    auditNotificationService,
    undefined,
    buildGovernanceServiceStub(
      sandboxProgramId,
      safetyOperatorId,
    ) as never,
  );
  const rocOperationsService = new RocOperationsService(
    safetyOperatorService,
    undefined,
    vehicleEvidenceService,
    teslaIntegrationService,
  );
  const sandboxDispatchGateService = new SandboxDispatchGateService(
    vehicleEvidenceService,
    rocOperationsService,
  );

  return {
    auditNotificationService,
    opsDispatchEventsService,
    driverProfileService,
    regulatoryRegistryService,
    teslaIntegrationService,
    vehicleEvidenceService,
    safetyOperatorService,
    rocOperationsService,
    sandboxDispatchGateService,
    sandboxProgramId,
    safetyOperatorId,
  };
}

export function createAccidentInvestigationHarness(options?: {
  sandboxProgramId?: string;
  safetyOperatorId?: string;
  teslaIntegrationService?: TeslaIntegrationService;
  vehicleEvidenceService?: VehicleEvidenceService;
  sandboxGovernanceService?: SandboxGovernanceService;
}) {
  const publicHarness = createPublicFleetHarness(options);
  const teslaIntegrationService =
    options?.teslaIntegrationService ?? publicHarness.teslaIntegrationService;
  const vehicleEvidenceService =
    options?.vehicleEvidenceService ?? publicHarness.vehicleEvidenceService;
  const sandboxGovernanceService = options?.sandboxGovernanceService;

  const accidentInvestigationService = new AccidentInvestigationService(
    publicHarness.rocOperationsService,
    publicHarness.auditNotificationService,
    {
      getOrder: () => ({
        orderId: "ord-e2e-p2",
        orderNo: "ORD-E2E-P2",
        pickup: { lat: 25.0478, lng: 121.5319 },
        dropoff: { lat: 25.052, lng: 121.5436 },
      }),
      listDispatchTrace: () => [{ traceId: "dispatch-trace-e2e-p2" }],
    } as never,
    publicHarness.safetyOperatorService,
    sandboxGovernanceService,
    teslaIntegrationService as never,
    vehicleEvidenceService as never,
  );

  return {
    ...publicHarness,
    accidentInvestigationService,
  };
}
