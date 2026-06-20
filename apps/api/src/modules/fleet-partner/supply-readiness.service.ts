import { Injectable } from "@nestjs/common";

import type {
  SupplyDocumentRecord,
  SupplyReadinessReasonCode,
  SupplyReadinessRecord,
  SupplySubmissionRecord,
} from "@drts/contracts";

import { FleetPartnerService } from "./fleet-partner.service";
import { SupplySubmissionService } from "./supply-submission.service";

@Injectable()
export class SupplyReadinessService {
  constructor(
    private readonly supplySubmissionService: SupplySubmissionService,
    private readonly fleetPartnerService: FleetPartnerService,
  ) {}

  listReadiness(fleetPartnerId: string) {
    const submissions = this.supplySubmissionService
      .listSubmissionsSnapshot()
      .filter((submission) => submission.fleetPartnerId === fleetPartnerId)
      .filter(
        (submission) =>
          submission.submissionType === "driver_onboarding" ||
          submission.submissionType === "vehicle_onboarding",
      );

    return submissions.map((submission) => this.evaluateSubmission(submission));
  }

  getDriverReadiness(fleetPartnerId: string, driverId: string) {
    const submission = this.supplySubmissionService
      .listSubmissionsSnapshot()
      .find(
        (candidate) =>
          candidate.fleetPartnerId === fleetPartnerId &&
          candidate.submissionType === "driver_onboarding" &&
          candidate.subjectDriverId === driverId,
      );
    if (!submission) {
      return null;
    }
    return this.evaluateSubmission(submission);
  }

  getVehicleReadiness(fleetPartnerId: string, vehicleId: string) {
    const submission = this.supplySubmissionService
      .listSubmissionsSnapshot()
      .find(
        (candidate) =>
          candidate.fleetPartnerId === fleetPartnerId &&
          candidate.submissionType === "vehicle_onboarding" &&
          candidate.subjectVehicleId === vehicleId,
      );
    if (!submission) {
      return null;
    }
    return this.evaluateSubmission(submission);
  }

  private evaluateSubmission(
    submission: SupplySubmissionRecord,
  ): SupplyReadinessRecord {
    const partner = this.fleetPartnerService.getFleetPartner(
      submission.fleetPartnerId,
    );
    const documents = this.supplySubmissionService.listDocumentsForSubmission(
      submission.submissionId,
    );
    const reasonCodes: SupplyReadinessReasonCode[] = partner.active
      ? submission.submissionType === "driver_onboarding"
        ? this.evaluateDriverReasons(documents)
        : this.evaluateVehicleReasons(documents)
      : ["FLEET_PARTNER_INACTIVE"];

    return {
      subjectType:
        submission.submissionType === "driver_onboarding" ? "driver" : "vehicle",
      subjectId:
        submission.submissionType === "driver_onboarding"
          ? submission.subjectDriverId ?? submission.submissionId
          : submission.subjectVehicleId ?? submission.submissionId,
      state: reasonCodes.length === 0 ? "ready" : "not_ready",
      reasonCodes,
      evaluatedAt: new Date().toISOString(),
      policyVersion: "phase1-delta-supply-eligibility-20260619",
    };
  }

  private evaluateDriverReasons(
    documents: readonly SupplyDocumentRecord[],
  ): SupplyReadinessReasonCode[] {
    const reasons: SupplyReadinessReasonCode[] = [];
    const license = documents.find(
      (document) => document.documentType === "professional_driver_license",
    );
    const registration = documents.find(
      (document) => document.documentType === "taxi_driver_registration",
    );
    const today = new Date().toISOString().slice(0, 10);

    if (!license) {
      reasons.push("DRIVER_LICENSE_MISSING");
    } else if (license.effectiveUntil && license.effectiveUntil < today) {
      reasons.push("DRIVER_LICENSE_EXPIRED");
    }

    if (!registration) {
      reasons.push("DRIVER_REGISTRATION_MISSING");
    } else if (registration.effectiveUntil && registration.effectiveUntil < today) {
      reasons.push("DRIVER_REGISTRATION_EXPIRED");
    }

    return reasons;
  }

  private evaluateVehicleReasons(
    documents: readonly SupplyDocumentRecord[],
  ): SupplyReadinessReasonCode[] {
    const reasons: SupplyReadinessReasonCode[] = [];
    const registration = documents.find(
      (document) => document.documentType === "vehicle_registration",
    );
    const insurance = documents.find(
      (document) => document.documentType === "insurance_policy",
    );
    const contract = documents.find(
      (document) =>
        document.documentType === "fleet_participation_contract" ||
        document.documentType === "vehicle_management_contract",
    );
    const today = new Date().toISOString().slice(0, 10);

    if (!registration) {
      reasons.push("VEHICLE_DOCUMENT_MISSING");
    }
    if (!insurance) {
      reasons.push("INSURANCE_MISSING");
    } else if (insurance.effectiveUntil && insurance.effectiveUntil < today) {
      reasons.push("INSURANCE_EXPIRED");
    }
    if (!contract) {
      reasons.push("CONTRACT_MISSING");
    } else if (contract.effectiveUntil && contract.effectiveUntil < today) {
      reasons.push("CONTRACT_INACTIVE");
    }

    return reasons;
  }
}
