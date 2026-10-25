import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupplyDocumentRecord } from "@drts/contracts";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { SupplyReadinessService } from "../../../apps/api/src/modules/fleet-partner/supply-readiness.service";
import { SupplyReviewService } from "../../../apps/api/src/modules/fleet-partner/supply-review.service";
import { SupplySubmissionRepository } from "../../../apps/api/src/modules/fleet-partner/supply-submission.repository";
import { SupplySubmissionService } from "../../../apps/api/src/modules/fleet-partner/supply-submission.service";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";

const { EventEmitter2 } = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
)("@nestjs/event-emitter");

function createRenewalTestContext() {
  const audit = new AuditNotificationService();
  const events = new OpsDispatchEventsService(new EventEmitter2());
  const driverProfile = new DriverProfileService(audit);
  const registryRepository = new RegulatoryRegistryRepository(undefined);
  const registry = new RegulatoryRegistryService(
    events,
    audit,
    driverProfile,
    registryRepository,
  );
  const submissionRepository = new SupplySubmissionRepository(undefined);
  const submissionService = new SupplySubmissionService(
    submissionRepository,
    registry,
    audit,
  );
  const reviewService = new SupplyReviewService(
    registry,
    submissionRepository,
  );
  const fleetPartnerServiceStub = {
    getFleetPartner: async (fleetPartnerId: string) => ({
      fleetPartnerId,
      active: true,
    }),
    listCanonicalFleetPartnerDrivers: async (fleetPartnerId: string) => {
      const state = await submissionRepository.loadState();
      return state.submissions
        .filter(
          (s) =>
            s.fleetPartnerId === fleetPartnerId &&
            s.status === "approved" &&
            s.canonicalDriverId,
        )
        .map((s) => ({
          affiliationId: `aff-${s.canonicalDriverId}`,
          driverId: s.canonicalDriverId!,
          fleetPartnerId,
          affiliationType: "employed_by" as const,
          effectiveFrom: "2025-01-01T00:00:00.000Z",
          effectiveUntil: null,
          status: "active" as const,
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:00:00.000Z",
        }));
    },
  };
  const vehicleEligibilityServiceStub = {
    resolveRuntimeVehicleCapability: () => ({ trainingRequired: false }),
  };
  const readinessService = new SupplyReadinessService(
    fleetPartnerServiceStub as never,
    registry,
    vehicleEligibilityServiceStub as never,
    submissionRepository,
  );

  return {
    audit,
    registry,
    registryRepository,
    submissionRepository,
    submissionService,
    reviewService,
    readinessService,
  };
}

async function onboardAndApproveFleetSupply(
  ctx: ReturnType<typeof createRenewalTestContext>,
  options?: {
    fleetPartnerId?: string;
    plateNo?: string;
    driverLicenseNo?: string;
    driverRegNo?: string;
    exclusiveOperatorId?: string;
  },
) {
  const fleetPartnerId = options?.fleetPartnerId ?? "fleet-ren-001";
  const plateNo = options?.plateNo ?? "TPE-8801";
  const driverLicenseNo = options?.driverLicenseNo ?? "PDL-REN-8801";
  const driverRegNo = options?.driverRegNo ?? "REG-REN-8801";
  const exclusiveOperatorId = options?.exclusiveOperatorId ?? fleetPartnerId;

  await ctx.submissionService.onModuleInit();
  await ctx.reviewService.onModuleInit();

  // 1. Onboard driver
  const driverCreated = await ctx.submissionService.createDriverDraft(
    fleetPartnerId,
    "fleet-manager-1",
    {
      name: "陳續期",
      mobile: "0912888001",
      professionalDriverLicenseNo: driverLicenseNo,
      professionalDriverLicenseExpiry: "2028-12-31",
      taxiDriverRegistrationNo: driverRegNo,
      taxiDriverRegistrationArea: "台北市",
      taxiDriverRegistrationExpiry: "2028-12-31",
      supportedServiceProductCodes: ["taxi_realtime"],
      preferredVehicleSubmissionId: null,
    },
  );
  const driverSubId = driverCreated.submission.submissionId;

  const addVerifiedDoc = async (
    submissionId: string,
    documentType: SupplyDocumentRecord["documentType"],
    effectiveFrom: string,
    effectiveUntil: string,
  ) => {
    const sub = ctx.submissionService.requireScopedSubmission(
      submissionId,
      fleetPartnerId,
    );
    const doc: SupplyDocumentRecord = {
      documentId: randomUUID(),
      fleetPartnerId,
      submissionId,
      documentType,
      fileObjectKey: `fleet-supply/${fleetPartnerId}/${submissionId}/${documentType}.pdf`,
      originalFileName: `${documentType}.pdf`,
      contentType: "application/pdf",
      fileSize: 1024,
      checksumSha256: "a".repeat(64),
      effectiveFrom,
      effectiveUntil,
      reviewStatus: "pending",
      reviewComment: null,
      uploadedBy: "fleet-manager-1",
      uploadedAt: new Date().toISOString(),
    };
    ctx.submissionService.replaceDocument(doc);
    ctx.submissionService.bumpRevisionForSubmission(sub);
    await ctx.submissionService.persistSubmissionAndDocuments(
      sub,
      ctx.submissionService.listDocumentsForSubmission(submissionId),
      "test_upload_doc",
    );
    return doc;
  };

  await addVerifiedDoc(
    driverSubId,
    "professional_driver_license",
    "2025-01-01",
    "2028-12-31",
  );
  await addVerifiedDoc(
    driverSubId,
    "taxi_driver_registration",
    "2025-01-01",
    "2028-12-31",
  );
  const driverBeforeSubmit = await ctx.submissionService.getSupplySubmissionDetail(
    fleetPartnerId,
    driverSubId,
  );
  await ctx.submissionService.submitSupplySubmission(
    fleetPartnerId,
    driverSubId,
    "fleet-manager-1",
    { expectedRevisionNo: driverBeforeSubmit.submission.revisionNo },
  );
  const driverSubmitted = await ctx.submissionService.getSupplySubmissionDetail(
    fleetPartnerId,
    driverSubId,
  );
  const driverInReview = await ctx.reviewService.startSubmissionReview(
    driverSubId,
    {
      expectedRevisionNo: driverSubmitted.submission.revisionNo,
      reasonCode: "manual_screening",
    },
    "platform-reviewer-1",
  );
  const approvedDriverSub = await ctx.reviewService.approveSubmission(
    driverSubId,
    {
      expectedRevisionNo: driverInReview.revisionNo,
      reasonCode: "all_documents_valid",
      comment: "Initial driver onboarding approved",
    },
    "platform-reviewer-1",
  );

  // 2. Onboard vehicle paired with the approved driver
  const vehicleCreated = await ctx.submissionService.createVehicleDraft(
    fleetPartnerId,
    "fleet-manager-1",
    {
      plateNo,
      licenseType: "taxi",
      brand: "Toyota",
      model: "RAV4 Hybrid",
      modelYear: 2024,
      seatCount: 4,
      luggageCapacity: 2,
      businessArea: "台北市",
      supportedServiceProductCodes: ["taxi_realtime"],
      airportTransferEligible: true,
      fixedFareAllowed: true,
      currentDriverSubmissionId: driverSubId,
      doorCount: 4,
      color: "White",
    },
  );
  const vehicleSubId = vehicleCreated.submission.submissionId;

  await addVerifiedDoc(
    vehicleSubId,
    "vehicle_registration",
    "2025-01-01",
    "2029-12-31",
  );
  await addVerifiedDoc(
    vehicleSubId,
    "insurance_policy",
    "2025-01-01",
    "2028-12-31",
  );
  await addVerifiedDoc(
    vehicleSubId,
    "fleet_participation_contract",
    "2025-01-01",
    "2028-12-31",
  );

  const vehicleBeforeSubmit =
    await ctx.submissionService.getSupplySubmissionDetail(
      fleetPartnerId,
      vehicleSubId,
    );
  await ctx.submissionService.submitSupplySubmission(
    fleetPartnerId,
    vehicleSubId,
    "fleet-manager-1",
    { expectedRevisionNo: vehicleBeforeSubmit.submission.revisionNo },
  );
  const vehicleSubmitted =
    await ctx.submissionService.getSupplySubmissionDetail(
      fleetPartnerId,
      vehicleSubId,
    );
  const vehicleInReview = await ctx.reviewService.startSubmissionReview(
    vehicleSubId,
    {
      expectedRevisionNo: vehicleSubmitted.submission.revisionNo,
      reasonCode: "manual_screening",
    },
    "platform-reviewer-1",
  );
  const approvedVehicleSub = await ctx.reviewService.approveSubmission(
    vehicleSubId,
    {
      expectedRevisionNo: vehicleInReview.revisionNo,
      reasonCode: "all_documents_valid",
      comment: "Initial vehicle onboarding approved",
    },
    "platform-reviewer-1",
  );

  const canonicalDriverId = approvedDriverSub.canonicalDriverId!;
  const canonicalVehicleId = approvedVehicleSub.canonicalVehicleId!;
  const initialContractId = approvedVehicleSub.canonicalContractId!;
  const initialPolicyId = approvedVehicleSub.canonicalPolicyId!;

  // Bind R02 exclusive operator and GPS location so vehicle + driver are dispatchable
  await ctx.registry.submitExclusivityReview(canonicalVehicleId, {
    exclusiveProviderName: "台北續期車隊",
    exclusiveOperatorId,
    effectiveStart: "2025-01-01T00:00:00.000Z",
    effectiveEnd: "2029-12-31T23:59:59.000Z",
  });
  await ctx.registry.approveExclusivity(canonicalVehicleId, {
    reviewerId: "platform-reviewer-1",
    exclusiveOperatorId,
  });
  await ctx.registry.recordDriverLocation({
    driverId: canonicalDriverId,
    lat: 25.033,
    lng: 121.5654,
    accuracyM: 5,
    recordedAt: new Date().toISOString(),
  });

  await ctx.submissionService.syncState();

  return {
    fleetPartnerId,
    plateNo,
    driverSubId,
    vehicleSubId,
    canonicalDriverId,
    canonicalVehicleId,
    initialContractId,
    initialPolicyId,
    addVerifiedDoc,
  };
}

describe("BUREAU-APPROVED-SUPPLY-RENEWAL-WORKFLOW-20261025: approved supply renewal workflow", () => {
  it("routes duplicate canonical plate on vehicle onboarding to renewal and blocks cross-fleet renewal targets", async () => {
    const ctx = createRenewalTestContext();
    const seeded = await onboardAndApproveFleetSupply(ctx);

    // Same fleet attempting vehicle_onboarding with existing plate gets 409 PLATE_ALREADY_EXISTS + renewal routing metadata
    let plateCollisionErr: any;
    try {
      await ctx.submissionService.createVehicleDraft(
        seeded.fleetPartnerId,
        "fleet-manager-1",
        {
          plateNo: seeded.plateNo,
          licenseType: "taxi",
          brand: "Toyota",
          model: "RAV4 Hybrid",
          modelYear: 2024,
          seatCount: 4,
          luggageCapacity: 2,
          businessArea: "台北市",
          supportedServiceProductCodes: ["taxi_realtime"],
          airportTransferEligible: true,
          fixedFareAllowed: true,
          currentDriverSubmissionId: null,
          doorCount: 4,
          color: "White",
        },
      );
    } catch (err) {
      plateCollisionErr = err;
    }
    expect(plateCollisionErr?.code).toBe("PLATE_ALREADY_EXISTS");
    expect(plateCollisionErr?.getResponse()).toMatchObject({
      error: {
        code: "PLATE_ALREADY_EXISTS",
        details: expect.objectContaining({
          plateNo: seeded.plateNo,
          existingCanonicalVehicleId: seeded.canonicalVehicleId,
          fleetPartnerOwned: true,
          suggestedAction: "create_renewal",
          renewalPath: `/supply/renewals/new?targetVehicleId=${encodeURIComponent(seeded.canonicalVehicleId)}`,
        }),
      },
    });

    // Another fleet attempting to create a renewal draft for this fleet's vehicle or driver is denied
    await expect(
      ctx.submissionService.createRenewalDraft(
        "fleet-other-999",
        "other-fleet-actor",
        {
          submissionType: "insurance_update",
          subjectVehicleId: seeded.canonicalVehicleId,
        },
      ),
    ).rejects.toMatchObject({
      code: "FLEET_SCOPE_DENIED",
    });

    await expect(
      ctx.submissionService.createRenewalDraft(
        "fleet-other-999",
        "other-fleet-actor",
        {
          submissionType: "profile_correction",
          subjectDriverId: seeded.canonicalDriverId,
        },
      ),
    ).rejects.toMatchObject({
      code: "FLEET_SCOPE_DENIED",
    });

    // Unknown canonical target is rejected with NOT_FOUND
    await expect(
      ctx.submissionService.createRenewalDraft(
        seeded.fleetPartnerId,
        "fleet-manager-1",
        {
          submissionType: "insurance_update",
          subjectVehicleId: "veh_non_existent",
        },
      ),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("completes insurance_update for an expired canonical vehicle, preserves canonicalVehicleId and policy history, aggregates prior registration/contract documents, and restores readiness and R02-scoped dispatchability", async () => {
    const ctx = createRenewalTestContext();
    const seeded = await onboardAndApproveFleetSupply(ctx);

    // Baseline check: vehicle is initially dispatchable and ready
    expect(
      ctx.registry.getVehicleDispatchability(
        seeded.canonicalVehicleId,
        "standard_taxi",
        { requestingOperatorId: seeded.fleetPartnerId },
      ),
    ).toBe(true);
    expect(
      ctx.registry
        .getEligibleCandidates(
          "standard_taxi",
          { lat: 25.04, lng: 121.56 },
          { requestingOperatorId: seeded.fleetPartnerId },
        )
        .some(
          (c) =>
            c.vehicleId === seeded.canonicalVehicleId &&
            c.driverId === seeded.canonicalDriverId,
        ),
    ).toBe(true);
    const initialReadiness =
      await ctx.readinessService.listFleetPartnerReadiness(
        seeded.fleetPartnerId,
      );
    const initialVehicleReadiness = initialReadiness.find(
      (r) =>
        r.subjectType === "vehicle" && r.subjectId === seeded.canonicalVehicleId,
    );
    expect(initialVehicleReadiness?.state).toBe("ready");

    // Simulate insurance policy expiration on the canonical vehicle
    await ctx.registry.activateInsurancePolicy(seeded.initialPolicyId, {
      startAt: "2019-01-01T00:00:00.000Z",
      endAt: "2020-01-01T23:59:59.000Z",
    } as any);

    expect(
      ctx.registry.getVehicleDispatchability(
        seeded.canonicalVehicleId,
        "standard_taxi",
        { requestingOperatorId: seeded.fleetPartnerId },
      ),
    ).toBe(false);
    expect(
      ctx.registry
        .getEligibleCandidates(
          "standard_taxi",
          { lat: 25.04, lng: 121.56 },
          {
            requestingOperatorId: seeded.fleetPartnerId,
          },
        )
        .some((c) => c.vehicleId === seeded.canonicalVehicleId),
    ).toBe(false);

    const expiredReadiness =
      await ctx.readinessService.listFleetPartnerReadiness(
        seeded.fleetPartnerId,
      );
    const expiredVehicleReadiness = expiredReadiness.find(
      (r) =>
        r.subjectType === "vehicle" && r.subjectId === seeded.canonicalVehicleId,
    )!;
    expect(expiredVehicleReadiness.state).toBe("not_ready");
    expect(expiredVehicleReadiness.reasonCodes).toContain("INSURANCE_EXPIRED");

    // List renewal targets in Fleet Portal
    const targets = await ctx.submissionService.listRenewalTargets(
      seeded.fleetPartnerId,
      expiredReadiness,
    );
    const targetVehicle = targets.vehicles.find(
      (v) => v.vehicleId === seeded.canonicalVehicleId,
    );
    expect(targetVehicle).toBeDefined();
    expect(targetVehicle?.plateNo).toBe(seeded.plateNo);
    expect(targetVehicle?.reasonCodes).toContain("INSURANCE_EXPIRED");

    // Create insurance_update renewal draft
    const renewalDraft = await ctx.submissionService.createRenewalDraft(
      seeded.fleetPartnerId,
      "fleet-manager-1",
      {
        submissionType: "insurance_update",
        subjectVehicleId: seeded.canonicalVehicleId,
      },
    );
    const renewalSubId = renewalDraft.submission.submissionId;
    expect(renewalDraft.submission.submissionType).toBe("insurance_update");
    expect(renewalDraft.submission.subjectVehicleId).toBe(
      seeded.canonicalVehicleId,
    );
    expect(renewalDraft.submission.canonicalVehicleId).toBe(
      seeded.canonicalVehicleId,
    );
    expect(renewalDraft.vehicleDraft?.plateNo).toBe(seeded.plateNo);

    // Duplicate active renewal submission for the same vehicle + type is rejected
    await expect(
      ctx.submissionService.createRenewalDraft(
        seeded.fleetPartnerId,
        "fleet-manager-1",
        {
          submissionType: "insurance_update",
          subjectVehicleId: seeded.canonicalVehicleId,
        },
      ),
    ).rejects.toMatchObject({
      code: "ACTIVE_RENEWAL_SUBMISSION_EXISTS",
    });

    // Attempting to mutate plateNo on renewal draft is rejected
    await expect(
      ctx.submissionService.updateRenewalDraft(
        seeded.fleetPartnerId,
        renewalSubId,
        "fleet-manager-1",
        {
          expectedRevisionNo: renewalDraft.submission.revisionNo,
          vehicleDraft: { plateNo: "CHANGED-999" },
        },
      ),
    ).rejects.toMatchObject({
      code: "PLATE_IMMUTABLE_ON_RENEWAL",
    });

    // Submitting without uploading insurance_policy document is rejected
    await expect(
      ctx.submissionService.submitSupplySubmission(
        seeded.fleetPartnerId,
        renewalSubId,
        "fleet-manager-1",
        { expectedRevisionNo: renewalDraft.submission.revisionNo },
      ),
    ).rejects.toMatchObject({
      code: "DOCUMENT_REQUIRED",
    });

    // Upload only the renewed insurance_policy document (partial update — no new registration or contract uploaded)
    await seeded.addVerifiedDoc(
      renewalSubId,
      "insurance_policy",
      "2026-01-01",
      "2030-12-31",
    );

    const beforeSubmit = await ctx.submissionService.getSupplySubmissionDetail(
      seeded.fleetPartnerId,
      renewalSubId,
    );
    await ctx.submissionService.submitSupplySubmission(
      seeded.fleetPartnerId,
      renewalSubId,
      "fleet-manager-1",
      { expectedRevisionNo: beforeSubmit.submission.revisionNo },
    );

    // Platform Admin starts review, requests revision, Fleet resubmits, then Platform Admin approves
    const submittedDetail =
      await ctx.submissionService.getSupplySubmissionDetail(
        seeded.fleetPartnerId,
        renewalSubId,
      );
    const inReview = await ctx.reviewService.startSubmissionReview(
      renewalSubId,
      {
        expectedRevisionNo: submittedDetail.submission.revisionNo,
        reasonCode: "manual_screening",
      },
      "platform-reviewer-2",
    );
    const needsRevision = await ctx.reviewService.requestRevision(
      renewalSubId,
      {
        expectedRevisionNo: inReview.revisionNo,
        reasonCode: "blurry_scan",
        comment: "Please re-verify effective dates on insurance policy.",
      },
      "platform-reviewer-2",
    );
    expect(needsRevision.status).toBe("needs_revision");

    // While in needs_revision, vehicle remains non-dispatchable
    expect(
      ctx.registry.getVehicleDispatchability(
        seeded.canonicalVehicleId,
        "standard_taxi",
        { requestingOperatorId: seeded.fleetPartnerId },
      ),
    ).toBe(false);

    // Fleet updates draft and resubmits
    await ctx.submissionService.syncState();
    const updatedAfterRevision = await ctx.submissionService.updateRenewalDraft(
      seeded.fleetPartnerId,
      renewalSubId,
      "fleet-manager-1",
      {
        expectedRevisionNo: needsRevision.revisionNo,
        vehicleDraft: { luggageCapacity: 3 },
      },
    );
    const resubmitted = await ctx.submissionService.submitSupplySubmission(
      seeded.fleetPartnerId,
      renewalSubId,
      "fleet-manager-1",
      { expectedRevisionNo: updatedAfterRevision.submission.revisionNo },
    );
    const inReviewAgain = await ctx.reviewService.startSubmissionReview(
      renewalSubId,
      {
        expectedRevisionNo: resubmitted.submission.revisionNo,
        reasonCode: "manual_screening",
      },
      "platform-reviewer-2",
    );
    const approvedRenewal = await ctx.reviewService.approveSubmission(
      renewalSubId,
      {
        expectedRevisionNo: inReviewAgain.revisionNo,
        reasonCode: "all_documents_valid",
        comment: "Renewed insurance policy verified and approved.",
      },
      "platform-reviewer-2",
    );

    expect(approvedRenewal.status).toBe("approved");
    // Same canonicalVehicleId preserved!
    expect(approvedRenewal.canonicalVehicleId).toBe(seeded.canonicalVehicleId);
    // New canonicalPolicyId created and linked!
    expect(approvedRenewal.canonicalPolicyId).toBeTruthy();
    expect(approvedRenewal.canonicalPolicyId).not.toBe(seeded.initialPolicyId);
    // Existing canonicalContractId retained!
    expect(approvedRenewal.canonicalContractId).toBe(seeded.initialContractId);

    // Historical onboarding submission remains immutable and retains its original policyId
    await ctx.submissionService.syncState();
    const originalOnboarding =
      await ctx.submissionService.getSupplySubmissionDetail(
        seeded.fleetPartnerId,
        seeded.vehicleSubId,
      );
    expect(originalOnboarding.submission.status).toBe("approved");
    expect(originalOnboarding.submission.canonicalPolicyId).toBe(
      seeded.initialPolicyId,
    );

    // Policy history in RegulatoryRegistryService retains both old (superseded) and new (active) policies
    const vehiclePolicies = ctx.registry
      .listPolicies()
      .filter((p) => p.vehicleId === seeded.canonicalVehicleId);
    expect(vehiclePolicies).toHaveLength(2);
    const oldPolicy = vehiclePolicies.find(
      (p) => p.policyId === seeded.initialPolicyId,
    )!;
    const newPolicy = vehiclePolicies.find(
      (p) => p.policyId === approvedRenewal.canonicalPolicyId,
    )!;
    expect(oldPolicy.status).toBe("expired");
    expect(oldPolicy.supersededByPolicyId).toBe(newPolicy.policyId);
    expect(oldPolicy.supersededAt).toBeTruthy();
    expect(newPolicy.status).toBe("active");
    expect(newPolicy.lifecycleStatus).toBe("active");
    expect(newPolicy.endAt).toBe("2030-12-31T23:59:59.000Z");
    expect(newPolicy.sourceSubmissionId).toBe(renewalSubId);

    // Readiness aggregates unchanged registration + contract from onboarding with new insurance_policy from renewal
    const restoredReadiness =
      await ctx.readinessService.listFleetPartnerReadiness(
        seeded.fleetPartnerId,
      );
    const restoredVehicleReadiness = restoredReadiness.find(
      (r) =>
        r.subjectType === "vehicle" && r.subjectId === seeded.canonicalVehicleId,
    )!;
    expect(restoredVehicleReadiness.state).toBe("ready");
    expect(restoredVehicleReadiness.reasonCodes).toEqual([]);

    // Dispatchability and eligible candidate selection are restored for the bound R02 operator
    expect(
      ctx.registry.getVehicleDispatchability(
        seeded.canonicalVehicleId,
        "standard_taxi",
        { requestingOperatorId: seeded.fleetPartnerId },
      ),
    ).toBe(true);
    expect(
      ctx.registry
        .getEligibleCandidates(
          "standard_taxi",
          { lat: 25.04, lng: 121.56 },
          {
            requestingOperatorId: seeded.fleetPartnerId,
          },
        )
        .some(
          (c) =>
            c.vehicleId === seeded.canonicalVehicleId &&
            c.driverId === seeded.canonicalDriverId,
        ),
    ).toBe(true);

    // R02 exclusive operator binding is preserved: cross-operator dispatch is still refused
    expect(
      ctx.registry.getVehicleDispatchability(
        seeded.canonicalVehicleId,
        "standard_taxi",
        { requestingOperatorId: "operator-foreign-999" },
      ),
    ).toBe(false);
  });

  it("completes contract_update and profile_correction renewals, preserving canonical IDs, contract history, and driver credential versions", async () => {
    const ctx = createRenewalTestContext();
    const seeded = await onboardAndApproveFleetSupply(ctx);

    // 1. Expire contract and driver license/registration
    await ctx.registry.activateContract(seeded.initialContractId, {
      approvedBy: "platform-reviewer-1",
      startAt: "2019-01-01T00:00:00.000Z",
      endAt: "2020-01-01T23:59:59.000Z",
    } as any);
    const rawDriver = (ctx.registry as any).drivers.find(
      (d: any) => d.driverId === seeded.canonicalDriverId,
    )!;
    rawDriver.professionalDriverLicenseExpiry = "2020-05-01";
    rawDriver.licenseExpiry = "2020-05-01";
    rawDriver.taxiDriverRegistrationExpiry = "2020-05-01";
    rawDriver.licensesValid = false;

    expect(
      ctx.registry.getVehicleDispatchability(
        seeded.canonicalVehicleId,
        "standard_taxi",
      ),
    ).toBe(false);
    expect(
      ctx.registry.getDriverAvailability(
        seeded.canonicalDriverId,
        "standard_taxi",
      ),
    ).toBe(false);

    // 2. Submit and approve contract_update
    const contractDraft = await ctx.submissionService.createRenewalDraft(
      seeded.fleetPartnerId,
      "fleet-manager-1",
      {
        submissionType: "contract_update",
        subjectVehicleId: seeded.canonicalVehicleId,
      },
    );
    const contractSubId = contractDraft.submission.submissionId;
    await seeded.addVerifiedDoc(
      contractSubId,
      "fleet_participation_contract",
      "2026-01-01",
      "2031-12-31",
    );
    const contractDetail =
      await ctx.submissionService.getSupplySubmissionDetail(
        seeded.fleetPartnerId,
        contractSubId,
      );
    await ctx.submissionService.submitSupplySubmission(
      seeded.fleetPartnerId,
      contractSubId,
      "fleet-manager-1",
      { expectedRevisionNo: contractDetail.submission.revisionNo },
    );
    const contractSub = await ctx.submissionService.getSupplySubmissionDetail(
      seeded.fleetPartnerId,
      contractSubId,
    );
    const contractInReview = await ctx.reviewService.startSubmissionReview(
      contractSubId,
      {
        expectedRevisionNo: contractSub.submission.revisionNo,
        reasonCode: "manual_screening",
      },
      "platform-reviewer-3",
    );
    const approvedContractSub = await ctx.reviewService.approveSubmission(
      contractSubId,
      {
        expectedRevisionNo: contractInReview.revisionNo,
        reasonCode: "all_documents_valid",
      },
      "platform-reviewer-3",
    );

    expect(approvedContractSub.canonicalVehicleId).toBe(
      seeded.canonicalVehicleId,
    );
    expect(approvedContractSub.canonicalContractId).toBeTruthy();
    expect(approvedContractSub.canonicalContractId).not.toBe(
      seeded.initialContractId,
    );
    expect(
      ctx.registry.getVehicleDispatchability(
        seeded.canonicalVehicleId,
        "standard_taxi",
      ),
    ).toBe(true);

    // Verify contract history
    const contracts = ctx.registry
      .listContracts()
      .filter((c) => c.vehicleId === seeded.canonicalVehicleId);
    expect(contracts).toHaveLength(2);
    const oldContract = contracts.find(
      (c) => c.contractId === seeded.initialContractId,
    )!;
    expect(oldContract.supersededByContractId).toBe(
      approvedContractSub.canonicalContractId,
    );

    // 3. Submit and approve profile_correction for the expired driver
    const driverRenewalDraft = await ctx.submissionService.createRenewalDraft(
      seeded.fleetPartnerId,
      "fleet-manager-1",
      {
        submissionType: "profile_correction",
        subjectDriverId: seeded.canonicalDriverId,
        driverDraft: {
          professionalDriverLicenseExpiry: "2031-06-30",
          taxiDriverRegistrationExpiry: "2031-06-30",
        },
      },
    );
    const driverRenewalSubId = driverRenewalDraft.submission.submissionId;
    await seeded.addVerifiedDoc(
      driverRenewalSubId,
      "professional_driver_license",
      "2026-01-01",
      "2031-06-30",
    );
    await seeded.addVerifiedDoc(
      driverRenewalSubId,
      "taxi_driver_registration",
      "2026-01-01",
      "2031-06-30",
    );
    const driverRenewalDetail =
      await ctx.submissionService.getSupplySubmissionDetail(
        seeded.fleetPartnerId,
        driverRenewalSubId,
      );
    await ctx.submissionService.submitSupplySubmission(
      seeded.fleetPartnerId,
      driverRenewalSubId,
      "fleet-manager-1",
      { expectedRevisionNo: driverRenewalDetail.submission.revisionNo },
    );
    const driverRenewalSubmitted =
      await ctx.submissionService.getSupplySubmissionDetail(
        seeded.fleetPartnerId,
        driverRenewalSubId,
      );
    const driverRenewalInReview = await ctx.reviewService.startSubmissionReview(
      driverRenewalSubId,
      {
        expectedRevisionNo: driverRenewalSubmitted.submission.revisionNo,
        reasonCode: "manual_screening",
      },
      "platform-reviewer-3",
    );
    const approvedDriverRenewal = await ctx.reviewService.approveSubmission(
      driverRenewalSubId,
      {
        expectedRevisionNo: driverRenewalInReview.revisionNo,
        reasonCode: "all_documents_valid",
      },
      "platform-reviewer-3",
    );

    expect(approvedDriverRenewal.canonicalDriverId).toBe(
      seeded.canonicalDriverId,
    );
    const updatedDriver = ctx.registry
      .listDrivers()
      .find((d) => d.driverId === seeded.canonicalDriverId)!;
    expect(updatedDriver.licensesValid).toBe(true);
    expect(updatedDriver.professionalDriverLicenseExpiry).toBe("2031-06-30");
    expect(updatedDriver.taxiDriverRegistrationExpiry).toBe("2031-06-30");
    expect(
      ctx.registry.getDriverAvailability(
        seeded.canonicalDriverId,
        "standard_taxi",
      ),
    ).toBe(true);

    await ctx.submissionService.syncState();
    const readiness = await ctx.readinessService.listFleetPartnerReadiness(
      seeded.fleetPartnerId,
    );
    const driverReadiness = readiness.find(
      (r) =>
        r.subjectType === "driver" && r.subjectId === seeded.canonicalDriverId,
    )!;
    expect(driverReadiness.state).toBe("ready");
    expect(driverReadiness.reasonCodes).toEqual([]);
  });

  it("does not restore dispatchability on rejected renewal or when an unrelated hold (manual_hold or suspended driver) remains active", async () => {
    const ctx = createRenewalTestContext();
    const seeded = await onboardAndApproveFleetSupply(ctx);

    // Expire insurance AND place an explicit operator manual_hold on the vehicle
    await ctx.registry.activateInsurancePolicy(seeded.initialPolicyId, {
      startAt: "2019-01-01T00:00:00.000Z",
      endAt: "2020-01-01T23:59:59.000Z",
    } as any);
    ctx.registry.updateVehicleCompliance(seeded.canonicalVehicleId, {
      dispatchableFlag: false,
    });

    // 1. Rejected renewal submission never restores insurance or readiness
    const rejectedDraft = await ctx.submissionService.createRenewalDraft(
      seeded.fleetPartnerId,
      "fleet-manager-1",
      {
        submissionType: "insurance_update",
        subjectVehicleId: seeded.canonicalVehicleId,
      },
    );
    await seeded.addVerifiedDoc(
      rejectedDraft.submission.submissionId,
      "insurance_policy",
      "2026-01-01",
      "2030-12-31",
    );
    const beforeRejectSubmit =
      await ctx.submissionService.getSupplySubmissionDetail(
        seeded.fleetPartnerId,
        rejectedDraft.submission.submissionId,
      );
    await ctx.submissionService.submitSupplySubmission(
      seeded.fleetPartnerId,
      rejectedDraft.submission.submissionId,
      "fleet-manager-1",
      { expectedRevisionNo: beforeRejectSubmit.submission.revisionNo },
    );
    const rejectSubmitted =
      await ctx.submissionService.getSupplySubmissionDetail(
        seeded.fleetPartnerId,
        rejectedDraft.submission.submissionId,
      );
    const rejectInReview = await ctx.reviewService.startSubmissionReview(
      rejectedDraft.submission.submissionId,
      {
        expectedRevisionNo: rejectSubmitted.submission.revisionNo,
        reasonCode: "manual_screening",
      },
      "platform-reviewer-4",
    );
    const rejected = await ctx.reviewService.rejectSubmission(
      rejectedDraft.submission.submissionId,
      {
        expectedRevisionNo: rejectInReview.revisionNo,
        reasonCode: "forged_document",
        comment: "Policy number could not be verified with insurer.",
      },
      "platform-reviewer-4",
    );
    expect(rejected.status).toBe("rejected");
    expect(
      ctx.registry
        .listVehicles()
        .find((v) => v.vehicleId === seeded.canonicalVehicleId)!
        .insuranceStatus,
    ).toBe("expired");
    expect(
      ctx.registry.getVehicleDispatchability(
        seeded.canonicalVehicleId,
        "standard_taxi",
      ),
    ).toBe(false);

    // 2. Approved insurance renewal updates insurance to valid, but preserves manual_hold!
    await ctx.submissionService.syncState();
    const validDraft = await ctx.submissionService.createRenewalDraft(
      seeded.fleetPartnerId,
      "fleet-manager-1",
      {
        submissionType: "insurance_update",
        subjectVehicleId: seeded.canonicalVehicleId,
      },
    );
    await seeded.addVerifiedDoc(
      validDraft.submission.submissionId,
      "insurance_policy",
      "2026-01-01",
      "2030-12-31",
    );
    const beforeValidSubmit =
      await ctx.submissionService.getSupplySubmissionDetail(
        seeded.fleetPartnerId,
        validDraft.submission.submissionId,
      );
    await ctx.submissionService.submitSupplySubmission(
      seeded.fleetPartnerId,
      validDraft.submission.submissionId,
      "fleet-manager-1",
      { expectedRevisionNo: beforeValidSubmit.submission.revisionNo },
    );
    const validSubmitted =
      await ctx.submissionService.getSupplySubmissionDetail(
        seeded.fleetPartnerId,
        validDraft.submission.submissionId,
      );
    const validInReview = await ctx.reviewService.startSubmissionReview(
      validDraft.submission.submissionId,
      {
        expectedRevisionNo: validSubmitted.submission.revisionNo,
        reasonCode: "manual_screening",
      },
      "platform-reviewer-4",
    );
    await ctx.reviewService.approveSubmission(
      validDraft.submission.submissionId,
      {
        expectedRevisionNo: validInReview.revisionNo,
        reasonCode: "all_documents_valid",
      },
      "platform-reviewer-4",
    );

    const vehicleAfterInsuranceRenewal = ctx.registry
      .listVehicles()
      .find((v) => v.vehicleId === seeded.canonicalVehicleId)!;
    expect(vehicleAfterInsuranceRenewal.insuranceStatus).toBe("valid");
    expect(
      vehicleAfterInsuranceRenewal.supplyLifecycle.dispatch.blockedReasons,
    ).toContain("manual_hold");
    expect(vehicleAfterInsuranceRenewal.dispatchableFlag).toBe(false);
    expect(
      ctx.registry.getVehicleDispatchability(
        seeded.canonicalVehicleId,
        "standard_taxi",
      ),
    ).toBe(false);
  });

  it("verifies V0134 migration DDL and rolls back canonical renewal + R14 supersession + submission approval atomically on DB transaction or volatile write failure", async () => {
    const v0134Sql = readFileSync(
      resolve(
        process.cwd(),
        "infra/migrations/V0134__approved_supply_renewal.sql",
      ),
      "utf8",
    );
    expect(v0134Sql).toContain(
      "DROP INDEX IF EXISTS fleet.idx_vehicle_draft_partner_plate_active",
    );
    expect(v0134Sql).toContain(
      "CREATE INDEX IF NOT EXISTS idx_vehicle_supply_drafts_plate_no",
    );
    expect(v0134Sql).toContain(
      "CREATE INDEX IF NOT EXISTS idx_supply_submissions_partner_subject_vehicle",
    );
    expect(v0134Sql).toContain(
      "CREATE INDEX IF NOT EXISTS idx_supply_submissions_canonical_vehicle_status",
    );
    expect(v0134Sql).toContain(
      "CHECK (entity_type IN ('driver', 'policy', 'contract'))",
    );

    const ctx = createRenewalTestContext();
    const seeded = await onboardAndApproveFleetSupply(ctx);

    // Expire policy and create an in_review insurance_update submission
    await ctx.registry.activateInsurancePolicy(seeded.initialPolicyId, {
      startAt: "2019-01-01T00:00:00.000Z",
      endAt: "2020-01-01T23:59:59.000Z",
    } as any);
    const draft = await ctx.submissionService.createRenewalDraft(
      seeded.fleetPartnerId,
      "fleet-manager-1",
      {
        submissionType: "insurance_update",
        subjectVehicleId: seeded.canonicalVehicleId,
      },
    );
    const renewalSubId = draft.submission.submissionId;
    await seeded.addVerifiedDoc(
      renewalSubId,
      "insurance_policy",
      "2026-01-01",
      "2030-12-31",
    );
    const detail = await ctx.submissionService.getSupplySubmissionDetail(
      seeded.fleetPartnerId,
      renewalSubId,
    );
    await ctx.submissionService.submitSupplySubmission(
      seeded.fleetPartnerId,
      renewalSubId,
      "fleet-manager-1",
      { expectedRevisionNo: detail.submission.revisionNo },
    );
    const submitted = await ctx.submissionService.getSupplySubmissionDetail(
      seeded.fleetPartnerId,
      renewalSubId,
    );
    const inReview = await ctx.reviewService.startSubmissionReview(
      renewalSubId,
      {
        expectedRevisionNo: submitted.submission.revisionNo,
        reasonCode: "manual_screening",
      },
      "platform-reviewer-tx",
    );

    // 1. Volatile no-DB mode: if submissionRepository.persistChanges throws on writing status=approved,
    // canonical policy history, vehicle lifecycle, and R14 pending events remain untouched!
    await ctx.registryRepository.insertExpiryEvent({
      eventId: randomUUID(),
      scope: "global",
      entityType: "policy",
      entityId: seeded.initialPolicyId,
      credentialType: "preexpiry:insurance_policy:30",
      sourceFingerprint: `volatile-tx-policy-30-${seeded.initialPolicyId}`,
      sourceExpiryAt: "2020-01-01T23:59:59.000Z",
    });
    const origPersistChanges = ctx.submissionRepository.persistChanges.bind(
      ctx.submissionRepository,
    );
    const volatilePersistSpy = vi
      .spyOn(ctx.submissionRepository, "persistChanges")
      .mockImplementation(async (changes) => {
        if (changes.submissions?.some((s) => s.status === "approved")) {
          throw new Error("CONTROLLED_SUBMISSION_APPROVAL_WRITE_FAILURE");
        }
        return origPersistChanges(changes);
      });

    await expect(
      ctx.reviewService.approveSubmission(
        renewalSubId,
        {
          expectedRevisionNo: inReview.revisionNo,
          reasonCode: "all_documents_valid",
        },
        "platform-reviewer-tx",
      ),
    ).rejects.toThrow("CONTROLLED_SUBMISSION_APPROVAL_WRITE_FAILURE");
    volatilePersistSpy.mockRestore();

    const policiesAfterVolatileFail = ctx.registry
      .listPolicies()
      .filter((p) => p.vehicleId === seeded.canonicalVehicleId);
    expect(policiesAfterVolatileFail).toHaveLength(1);
    expect(policiesAfterVolatileFail[0]?.supersededByPolicyId ?? null).toBeNull();
    const activeVolatileEvents =
      await ctx.registryRepository.findActiveExpiryEventsForEntity(
        "policy",
        seeded.initialPolicyId,
        "preexpiry:insurance_policy:30",
      );
    expect(activeVolatileEvents).toHaveLength(1);
    expect(activeVolatileEvents[0]?.status).toBe("pending");

    // 2. Simulate a DB transaction where persistChangesWithExecutor + R14 supersession run on the shared executor,
    // and transitionSubmissionStatusWithExecutor throws before COMMIT:
    const executedSteps: string[] = [];
    const fakeExecutor = { query: vi.fn() } as any;
    vi.spyOn(ctx.submissionRepository, "isEnabled").mockReturnValue(true);
    vi.spyOn(ctx.registryRepository, "isEnabled").mockReturnValue(true);
    vi.spyOn(ctx.submissionRepository, "withTransaction").mockImplementation(
      async (fn) => {
        executedSteps.push("BEGIN");
        try {
          const res = await fn(fakeExecutor);
          executedSteps.push("COMMIT");
          return res;
        } catch (err) {
          executedSteps.push("ROLLBACK");
          throw err;
        }
      },
    );
    vi.spyOn(
      ctx.submissionRepository,
      "lockSubmission",
    ).mockResolvedValue({ ...inReview });
    vi.spyOn(
      ctx.submissionRepository,
      "loadApprovalArtifacts",
    ).mockResolvedValue({
      driverDraft: null,
      vehicleDraft: draft.vehicleDraft,
      documents: ctx.submissionService.listDocumentsForSubmission(renewalSubId),
    });
    vi.spyOn(
      ctx.registryRepository,
      "readVehicleCommandState",
    ).mockResolvedValue({
      vehicle: ctx.registry
        .listVehicles()
        .find((v) => v.vehicleId === seeded.canonicalVehicleId)!,
      contracts: ctx.registry
        .listContracts()
        .filter((c) => c.vehicleId === seeded.canonicalVehicleId),
      policies: ctx.registry
        .listPolicies()
        .filter((p) => p.vehicleId === seeded.canonicalVehicleId),
      exclusivities: ctx.registry
        .listExclusivities()
        .filter((e) => e.vehicleId === seeded.canonicalVehicleId),
    });
    vi.spyOn(
      ctx.registryRepository,
      "persistChangesWithExecutor",
    ).mockImplementation(async (exec) => {
      expect(exec).toBe(fakeExecutor);
      executedSteps.push("PERSIST_CANONICAL_RENEWAL");
    });
    vi.spyOn(
      ctx.registryRepository,
      "supersedeActiveExpiryEventsForEntity",
    ).mockImplementation(async (_type, _id, _cred, _reason, exec) => {
      expect(exec).toBe(fakeExecutor);
      executedSteps.push("SUPERSEDE_R14_EXPIRY_EVENTS");
      return 1;
    });
    vi.spyOn(
      ctx.registryRepository,
      "findActiveExpiryEventsForEntity",
    ).mockResolvedValue([]);
    vi.spyOn(
      ctx.submissionRepository,
      "transitionSubmissionStatus",
    ).mockImplementation(async () => {
      executedSteps.push("TRANSITION_SUBMISSION_FAILED");
      throw new Error("SIMULATED_DB_TRANSITION_ERROR");
    });

    await expect(
      ctx.reviewService.approveSubmission(
        renewalSubId,
        {
          expectedRevisionNo: inReview.revisionNo,
          reasonCode: "all_documents_valid",
        },
        "platform-reviewer-tx",
      ),
    ).rejects.toThrow("SIMULATED_DB_TRANSITION_ERROR");

    // Verify all steps ran on the shared executor and rolled back without publishing to in-memory registry
    expect(executedSteps).toEqual([
      "BEGIN",
      "PERSIST_CANONICAL_RENEWAL",
      "SUPERSEDE_R14_EXPIRY_EVENTS",
      "SUPERSEDE_R14_EXPIRY_EVENTS",
      "TRANSITION_SUBMISSION_FAILED",
      "ROLLBACK",
    ]);
    expect(
      ctx.registry
        .listPolicies()
        .filter((p) => p.vehicleId === seeded.canonicalVehicleId),
    ).toHaveLength(1);
    expect(
      ctx.registry
        .listVehicles()
        .find((v) => v.vehicleId === seeded.canonicalVehicleId)!
        .insuranceStatus,
    ).toBe("expired");
  });
});
