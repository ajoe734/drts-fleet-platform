import { fleetStorageFixture } from "../helpers/fleet-document-fixture";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const { EventEmitter2 } = createRequire(
  resolve(process.cwd(), "apps/api/package.json"),
)("@nestjs/event-emitter");

import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { CallcenterService } from "../../../apps/api/src/modules/callcenter/callcenter.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { FleetPartnerController } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.controller";
import { FleetPartnerService } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.service";
import { SupplyDocumentService } from "../../../apps/api/src/modules/fleet-partner/supply-document.service";
import { SupplyReadinessService } from "../../../apps/api/src/modules/fleet-partner/supply-readiness.service";
import { SupplyReviewService } from "../../../apps/api/src/modules/fleet-partner/supply-review.service";
import { SupplySubmissionRepository } from "../../../apps/api/src/modules/fleet-partner/supply-submission.repository";
import { SupplySubmissionService } from "../../../apps/api/src/modules/fleet-partner/supply-submission.service";
import { OwnedMobilityTaskEventsService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { VehicleEligibilityService } from "../../../apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.service";

import { FleetPartnerCaseService } from "../../../apps/api/src/modules/fleet-partner/fleet-partner-case.service";
function buildSharedServices() {
  const auditNotificationService = new AuditNotificationService();
  const driverProfileService = new DriverProfileService(
    auditNotificationService,
  );
  const opsDispatchEventsService = new OpsDispatchEventsService(
    new EventEmitter2(),
  );
  const regulatoryRegistryService = new RegulatoryRegistryService(
    opsDispatchEventsService,
    auditNotificationService,
    driverProfileService,
  );
  const billingSettlementService = new BillingSettlementService(
    auditNotificationService,
  );
  billingSettlementService.publishDriverFeePlan({
    planName: "Demo Driver Fee Plan",
    version: "2026.04",
    serviceFeeBps: 1200,
    reimbursementMode: "platform_funded",
  });
  const callcenterService = new CallcenterService(auditNotificationService);
  const ownedMobilityTaskEventsService = new OwnedMobilityTaskEventsService(
    new EventEmitter2(),
  );
  const ownedMobilityService = new OwnedMobilityService(
    regulatoryRegistryService,
    auditNotificationService,
    callcenterService,
    ownedMobilityTaskEventsService,
    opsDispatchEventsService,
  );
  const fleetPartnerService = new FleetPartnerService(
    billingSettlementService,
    ownedMobilityService,
    regulatoryRegistryService,
  );
  const supplySubmissionRepository = new SupplySubmissionRepository();
  const supplySubmissionService = new SupplySubmissionService(
    supplySubmissionRepository,
    regulatoryRegistryService,
    auditNotificationService,
  );
  const { storage, store } = fleetStorageFixture();
  const supplyDocumentService = new SupplyDocumentService(
    supplySubmissionService,
    supplySubmissionRepository,
    storage,
  );
  const vehicleEligibilityService = new VehicleEligibilityService(
    regulatoryRegistryService,
  );
  const supplyReadinessService = new SupplyReadinessService(
    fleetPartnerService,
    regulatoryRegistryService,
    vehicleEligibilityService,
    supplySubmissionRepository,
  );

  return {
    store,
    storage,
    auditNotificationService,
    fleetPartnerService,
    regulatoryRegistryService,
    supplySubmissionRepository,
    supplySubmissionService,
    supplyDocumentService,
    supplyReadinessService,
  };
}

export function createFixture() {
  const services = buildSharedServices();
  const supplyReviewService = new SupplyReviewService(
    services.regulatoryRegistryService,
    services.supplySubmissionRepository,
  );

  return {
    ...services,
    controller: new FleetPartnerController(
      services.fleetPartnerService,
      services.supplySubmissionService,
      services.supplyDocumentService,
      supplyReviewService,
      services.supplyReadinessService,
      new FleetPartnerCaseService(
        undefined,
        services.fleetPartnerService,
        services.auditNotificationService,
        services.storage,
      ),
    ),
    supplyReviewService,
  };
}
