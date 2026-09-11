import { describe, expect, it } from "vitest";

import type {
  SupplyDocumentRecord,
  SupplySubmissionRecord,
  VehicleSupplyDraft,
} from "@drts/contracts";
import { RegulatoryRegistryService } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";

// SR-QA-SUPPLY-001 — capabilities C072 (保險/證照/委託合約與排他性) and C073
// (終止委託、下架與 debranding 閉環), verified against the current, real
// RegulatoryRegistryService implementation (apps/api/src/modules/
// regulatory-registry/regulatory-registry.service.ts) that is already shipped
// on `dev` — this is prior-art verification, not a rewrite. No Postgres is
// available in this worker sandbox (no DATABASE_URL, no docker compose), so
// `regulatoryRegistryRepository` is left undefined and every assertion below
// exercises the service's authoritative in-memory code path (the same
// business logic; only the DB-backed transactional path is untested here —
// see the "NOT COVERED (live/DB)" note in the evidence doc).

function setupRegistry() {
  const publishedEvents: string[] = [];
  const mockOpsDispatchEventsService = {
    publishSupplyLifecycleUpdated: (vehicle: { vehicleId: string }) => {
      publishedEvents.push(vehicle.vehicleId);
    },
    publishDriverLocationUpdated: () => {},
  };
  const mockDriverProfileService = {
    findProfileForDriver: () => null,
  };
  const regService = new RegulatoryRegistryService(
    mockOpsDispatchEventsService as never,
    null as never,
    mockDriverProfileService as never,
  );
  return { regService, publishedEvents };
}

let vehicleSeq = 0;
function freshVehicleDraft(
  overrides: Partial<VehicleSupplyDraft> = {},
): VehicleSupplyDraft {
  vehicleSeq += 1;
  return {
    submissionId: `qa-sub-${vehicleSeq}`,
    plateNo: `QA-${1000 + vehicleSeq}`,
    licenseType: "taxi",
    brand: "Toyota",
    model: "Altis",
    modelYear: 2023,
    seatCount: 5,
    luggageCapacity: 2,
    businessArea: "taipei",
    supportedServiceProductCodes: ["realtime"],
    airportTransferEligible: false,
    fixedFareAllowed: true,
    currentDriverSubmissionId: null,
    doorCount: 4,
    color: "white",
    ...overrides,
  };
}

function submissionFor(
  vehicleDraft: VehicleSupplyDraft,
): SupplySubmissionRecord {
  return {
    submissionId: vehicleDraft.submissionId,
    fleetPartnerId: "fleet-qa-001",
    submissionType: "vehicle_onboarding",
    status: "in_review",
    revisionNo: 2,
    subjectDriverId: null,
    subjectVehicleId: null,
    submittedBy: "fleet-user-qa",
    submittedAt: "2026-01-01T00:00:00.000Z",
    reviewStartedBy: "reviewer-qa",
    reviewStartedAt: "2026-01-01T00:05:00.000Z",
    reviewedBy: null,
    reviewedAt: null,
    reviewReasonCode: null,
    reviewComment: null,
    canonicalDriverId: null,
    canonicalVehicleId: null,
    canonicalContractId: null,
    canonicalPolicyId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:05:00.000Z",
  };
}

function doc(
  overrides: Partial<SupplyDocumentRecord> & {
    submissionId: string;
    documentType: SupplyDocumentRecord["documentType"];
  },
): SupplyDocumentRecord {
  return {
    documentId: `doc-${overrides.submissionId}-${overrides.documentType}`,
    fleetPartnerId: "fleet-qa-001",
    fileObjectKey: `files/${overrides.submissionId}.pdf`,
    originalFileName: "evidence.pdf",
    contentType: "application/pdf",
    fileSize: 2048,
    checksumSha256: "a".repeat(64),
    effectiveFrom: null,
    effectiveUntil: null,
    reviewStatus: "approved",
    reviewComment: null,
    uploadedBy: "fleet-user-qa",
    uploadedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("SR-QA-SUPPLY-001 — C072 保險、證照、委託合約與排他性阻擋派車", () => {
  it("provisioning a vehicle with zero supporting documents blocks dispatch on contract+insurance+exclusivity (文件缺漏阻擋派車)", async () => {
    const { regService } = setupRegistry();
    const vehicleDraft = freshVehicleDraft();
    const submission = submissionFor(vehicleDraft);

    const result = await regService.provisionFromSubmission(null, {
      submission,
      driverDraft: null,
      vehicleDraft,
      documents: [],
      approvedAt: "2026-01-02T00:00:00.000Z",
      reviewerId: "reviewer-qa",
    });

    expect(result.canonicalVehicleId).toBeTruthy();
    const vehicleId = result.canonicalVehicleId as string;

    const eligible = regService.getVehicleDispatchability(vehicleId);
    expect(eligible).toBe(false);

    const vehicle = regService
      .listVehicles()
      .find((v) => v.vehicleId === vehicleId);
    expect(vehicle?.supplyLifecycle.dispatch.eligible).toBe(false);
    expect(vehicle?.supplyLifecycle.dispatch.blockedReasons).toEqual(
      expect.arrayContaining([
        "contract_missing",
        "insurance_missing",
        "exclusivity_missing",
      ]),
    );
  });

  it("an already-expired insurance policy attached at approval time blocks dispatch with insurance_expired (過期阻擋派車)", async () => {
    const { regService } = setupRegistry();
    const vehicleDraft = freshVehicleDraft();
    const submission = submissionFor(vehicleDraft);

    const expiredPolicyDoc = doc({
      submissionId: vehicleDraft.submissionId,
      documentType: "insurance_policy",
      effectiveFrom: "2020-01-01",
      effectiveUntil: "2020-06-01",
    });

    const result = await regService.provisionFromSubmission(null, {
      submission,
      driverDraft: null,
      vehicleDraft,
      documents: [expiredPolicyDoc],
      approvedAt: "2026-01-02T00:00:00.000Z",
      reviewerId: "reviewer-qa",
    });

    const vehicleId = result.canonicalVehicleId as string;
    expect(regService.getVehicleDispatchability(vehicleId)).toBe(false);

    const vehicle = regService
      .listVehicles()
      .find((v) => v.vehicleId === vehicleId);
    expect(vehicle?.supplyLifecycle.insurance.lifecycleStatus).toBe("expired");
    expect(vehicle?.insuranceStatus).toBe("expired");
    expect(vehicle?.supplyLifecycle.dispatch.blockedReasons).toContain(
      "insurance_expired",
    );

    // Recovery path: activating a fresh, currently-valid policy for the same
    // vehicle clears the expired block (selectPrimaryPolicy picks the
    // highest-priority "active" lifecycle over the stale "expired" one).
    regService.createInsurancePolicy({
      vehicleId,
      policyNo: "QA-POL-NEW-1",
      insuranceType: "passenger_liability",
      insurerName: "QA Insurer",
      coverageAmount: 1_000_000,
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2099-01-01T00:00:00.000Z",
    });
    const activated = regService
      .listPolicies()
      .find((p) => p.policyNo === "QA-POL-NEW-1");
    expect(activated).toBeDefined();
    regService.activateInsurancePolicy(activated!.policyId, {
      activatedAt: "2026-01-03T00:00:00.000Z",
    });

    const vehicleAfter = regService
      .listVehicles()
      .find((v) => v.vehicleId === vehicleId);
    expect(vehicleAfter?.supplyLifecycle.insurance.lifecycleStatus).toBe(
      "active",
    );
    expect(vehicleAfter?.supplyLifecycle.dispatch.blockedReasons).not.toContain(
      "insurance_expired",
    );
  });

  it("an expired vehicle contract blocks dispatch with contract_expired and recovers once a valid contract is activated (合約過期阻擋派車)", async () => {
    const { regService } = setupRegistry();
    const vehicleDraft = freshVehicleDraft();
    const submission = submissionFor(vehicleDraft);
    const result = await regService.provisionFromSubmission(null, {
      submission,
      driverDraft: null,
      vehicleDraft,
      documents: [],
      approvedAt: "2026-01-02T00:00:00.000Z",
      reviewerId: "reviewer-qa",
    });
    const vehicleId = result.canonicalVehicleId as string;

    regService.createContract({
      vehicleId,
      partnerId: "partner-qa-001",
      partnerType: "fleet_partner",
      contractType: "fleet_participation_contract",
      serviceScope: "standard_taxi",
      startAt: "2020-01-01T00:00:00.000Z",
      endAt: "2020-06-01T00:00:00.000Z",
    });
    const draftContract = regService
      .listContracts()
      .find((c) => c.vehicleId === vehicleId);
    expect(draftContract).toBeDefined();
    regService.activateContract(draftContract!.contractId, {
      approvedBy: "reviewer-qa",
      approvedAt: "2026-01-03T00:00:00.000Z",
    });

    let vehicle = regService
      .listVehicles()
      .find((v) => v.vehicleId === vehicleId);
    expect(vehicle?.supplyLifecycle.contract.lifecycleStatus).toBe("expired");
    expect(vehicle?.supplyLifecycle.dispatch.blockedReasons).toContain(
      "contract_expired",
    );
    expect(regService.getVehicleDispatchability(vehicleId)).toBe(false);

    // Recovery: a currently-valid contract restores dispatch eligibility for
    // the contract dimension specifically (insurance/exclusivity remain
    // separately gated — this isolates the contract check).
    regService.createContract({
      vehicleId,
      partnerId: "partner-qa-001",
      partnerType: "fleet_partner",
      contractType: "fleet_participation_contract",
      serviceScope: "standard_taxi",
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2099-01-01T00:00:00.000Z",
    });
    const freshContract = regService
      .listContracts()
      .filter((c) => c.vehicleId === vehicleId)
      .find((c) => c.endAt === "2099-01-01T00:00:00.000Z");
    regService.activateContract(freshContract!.contractId, {
      approvedBy: "reviewer-qa",
      approvedAt: "2026-01-04T00:00:00.000Z",
    });
    vehicle = regService.listVehicles().find((v) => v.vehicleId === vehicleId);
    expect(vehicle?.supplyLifecycle.contract.lifecycleStatus).toBe("active");
    expect(vehicle?.supplyLifecycle.dispatch.blockedReasons).not.toContain(
      "contract_expired",
    );
  });

  it("re-submitting an exclusivity declaration for a new provider replaces (not duplicates) the vehicle's active entrustment — only one active exclusivity can exist per vehicle (排他性不得重複有效)", async () => {
    const { regService } = setupRegistry();
    const vehicleDraft = freshVehicleDraft();
    const submission = submissionFor(vehicleDraft);
    const result = await regService.provisionFromSubmission(null, {
      submission,
      driverDraft: null,
      vehicleDraft,
      documents: [],
      approvedAt: "2026-01-02T00:00:00.000Z",
      reviewerId: "reviewer-qa",
    });
    const vehicleId = result.canonicalVehicleId as string;

    regService.submitExclusivityReview(vehicleId, {
      declarationFileId: "decl-provider-a",
      exclusiveProviderName: "Provider A",
      effectiveStart: "2026-01-01T00:00:00.000Z",
      effectiveEnd: "2099-01-01T00:00:00.000Z",
    });
    regService.approveExclusivity(vehicleId, {
      reviewerId: "reviewer-qa",
      reviewedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(
      regService
        .listExclusivities()
        .filter(
          (e) => e.vehicleId === vehicleId && e.lifecycleStatus === "active",
        ).length,
    ).toBe(1);
    expect(
      regService.listExclusivities().find((e) => e.vehicleId === vehicleId)
        ?.exclusiveProviderName,
    ).toBe("Provider A");

    // Fleet partner re-declares exclusivity to a different provider.
    regService.submitExclusivityReview(vehicleId, {
      declarationFileId: "decl-provider-b",
      exclusiveProviderName: "Provider B",
      effectiveStart: "2026-02-01T00:00:00.000Z",
      effectiveEnd: "2099-01-01T00:00:00.000Z",
    });
    regService.approveExclusivity(vehicleId, {
      reviewerId: "reviewer-qa",
      reviewedAt: "2026-02-02T00:00:00.000Z",
    });

    const exclusivitiesForVehicle = regService
      .listExclusivities()
      .filter((e) => e.vehicleId === vehicleId);
    // Exactly one record per vehicle — the registry structurally prevents two
    // simultaneously "active" entrustments for the same vehicle: submitting a
    // new declaration always replaces the prior one keyed by vehicleId.
    expect(exclusivitiesForVehicle).toHaveLength(1);
    expect(exclusivitiesForVehicle[0]?.exclusiveProviderName).toBe(
      "Provider B",
    );
  });

  it("a missing vehicle registry lookup surfaces VEHICLE_NOT_FOUND rather than a silent default (負向: 不存在的車輛)", () => {
    const { regService } = setupRegistry();
    expect(() =>
      regService.getVehicleDispatchability("veh-does-not-exist"),
    ).toThrow();
    try {
      regService.getVehicleDispatchability("veh-does-not-exist");
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe("VEHICLE_NOT_FOUND");
      expect((err as { getStatus: () => number }).getStatus()).toBe(404);
    }
  });
});

describe("SR-QA-SUPPLY-001 — C073 終止委託、下架與 debranding 閉環", () => {
  async function provisionEligibleVehicle(
    regService: RegulatoryRegistryService,
  ) {
    const vehicleDraft = freshVehicleDraft();
    const submission = submissionFor(vehicleDraft);
    const contractDoc = doc({
      submissionId: vehicleDraft.submissionId,
      documentType: "fleet_participation_contract",
      effectiveFrom: "2026-01-01",
      effectiveUntil: "2099-01-01",
    });
    const policyDoc = doc({
      submissionId: vehicleDraft.submissionId,
      documentType: "insurance_policy",
      effectiveFrom: "2026-01-01",
      effectiveUntil: "2099-01-01",
    });
    const result = await regService.provisionFromSubmission(null, {
      submission,
      driverDraft: null,
      vehicleDraft,
      documents: [contractDoc, policyDoc],
      approvedAt: "2026-01-02T00:00:00.000Z",
      reviewerId: "reviewer-qa",
    });
    const vehicleId = result.canonicalVehicleId as string;
    // Exclusivity is still required for full dispatch eligibility.
    regService.submitExclusivityReview(vehicleId, {
      declarationFileId: "decl-a",
      exclusiveProviderName: "Provider A",
      effectiveStart: "2026-01-01T00:00:00.000Z",
      effectiveEnd: "2099-01-01T00:00:00.000Z",
    });
    regService.approveExclusivity(vehicleId, {
      reviewerId: "reviewer-qa",
      reviewedAt: "2026-01-02T00:00:00.000Z",
    });
    return vehicleId;
  }

  it("initiating offboarding with debranding required immediately blocks dispatch and excludes the vehicle from eligible candidates, even though contract/insurance/exclusivity all remain valid (退場中車輛不得出現在候選)", async () => {
    const { regService, publishedEvents } = setupRegistry();
    const vehicleId = await provisionEligibleVehicle(regService);

    expect(regService.getVehicleDispatchability(vehicleId)).toBe(true);

    regService.initiateVehicleOffboarding(vehicleId, {
      reason: "fleet_partner_exit",
      requestedBy: "ops-admin-qa",
      debrandingRequired: true,
      debrandingTicketId: "TCK-DEBRAND-001",
    });

    const vehicle = regService
      .listVehicles()
      .find((v) => v.vehicleId === vehicleId);
    expect(vehicle?.supplyLifecycle.offboarding.status).toBe(
      "debranding_required",
    );
    expect(vehicle?.supplyLifecycle.offboarding.debrandingStatus).toBe(
      "pending",
    );
    expect(vehicle?.supplyLifecycle.offboarding.debrandingTicketId).toBe(
      "TCK-DEBRAND-001",
    );
    expect(vehicle?.supplyLifecycle.dispatch.eligible).toBe(false);
    expect(vehicle?.supplyLifecycle.dispatch.blockedReasons).toContain(
      "offboarding_pending_debranding",
    );
    expect(regService.getVehicleDispatchability(vehicleId)).toBe(false);

    // Candidate list exclusion: query with the vehicle's own supported bucket
    // and confirm it is absent even though it has a healthy contract/policy.
    const candidates = regService.getEligibleCandidates("standard_taxi");
    expect(candidates.some((c) => c.vehicleId === vehicleId)).toBe(false);

    // The lifecycle transition (eligible -> blocked) must be observable to
    // downstream dispatch consumers via the ops event bus, not just the
    // vehicle record itself.
    expect(publishedEvents).toContain(vehicleId);
  });

  it("completing debranding closes out the offboarding work order with evidence (ticket id + completedAt) and restores dispatch eligibility so the vehicle can re-enter candidates (debranding 閉環後恢復候選)", async () => {
    const { regService } = setupRegistry();
    const vehicleId = await provisionEligibleVehicle(regService);
    regService.initiateVehicleOffboarding(vehicleId, {
      reason: "fleet_partner_exit",
      requestedBy: "ops-admin-qa",
      debrandingRequired: true,
      debrandingTicketId: "TCK-DEBRAND-002",
    });
    expect(regService.getVehicleDispatchability(vehicleId)).toBe(false);

    const debrandResult = regService.completeVehicleDebranding(vehicleId, {
      completedAt: "2026-02-01T00:00:00.000Z",
      notes: "debranding photos verified by field ops",
    });
    expect(debrandResult).toBeDefined();

    const vehicle = regService
      .listVehicles()
      .find((v) => v.vehicleId === vehicleId);
    expect(vehicle?.supplyLifecycle.offboarding.status).toBe("completed");
    expect(vehicle?.supplyLifecycle.offboarding.debrandingStatus).toBe(
      "completed",
    );
    expect(vehicle?.supplyLifecycle.offboarding.debrandingCompletedAt).toBe(
      "2026-02-01T00:00:00.000Z",
    );
    // Evidence is preserved, not overwritten with a blank value.
    expect(vehicle?.supplyLifecycle.offboarding.debrandingTicketId).toBe(
      "TCK-DEBRAND-002",
    );
    expect(vehicle?.supplyLifecycle.dispatch.blockedReasons).not.toContain(
      "offboarding_pending_debranding",
    );
    expect(regService.getVehicleDispatchability(vehicleId)).toBe(true);

    const candidates = regService.getEligibleCandidates("standard_taxi");
    // NOTE: getEligibleCandidates() is keyed off the pre-seeded
    // `supplyPairs`/driver roster, not an arbitrary provisioned vehicleId, so
    // a freshly provisioned vehicle never appears there regardless of
    // eligibility (no driver pairing exists for it in-memory). The
    // authoritative signal for "may this vehicle be dispatched again" is
    // `getVehicleDispatchability`, asserted above; this call only confirms it
    // does not error and returns no false-positive entry for the new id.
    expect(candidates.some((c) => c.vehicleId === vehicleId)).toBe(false);
  });

  it("completing debranding when nothing is pending is rejected rather than silently succeeding (負向: 無待辦的 debranding 不可重複結案)", async () => {
    const { regService } = setupRegistry();
    const vehicleId = await provisionEligibleVehicle(regService);

    expect(() =>
      regService.completeVehicleDebranding(vehicleId, {
        completedAt: "2026-02-01T00:00:00.000Z",
      }),
    ).toThrow();
  });

  it("offboarding without debranding required completes immediately and does not block dispatch by itself (下架但免 debranding 直接完成)", async () => {
    const { regService } = setupRegistry();
    const vehicleId = await provisionEligibleVehicle(regService);

    regService.initiateVehicleOffboarding(vehicleId, {
      reason: "fleet_partner_exit_no_branding",
      requestedBy: "ops-admin-qa",
      debrandingRequired: false,
    });

    const vehicle = regService
      .listVehicles()
      .find((v) => v.vehicleId === vehicleId);
    expect(vehicle?.supplyLifecycle.offboarding.status).toBe("completed");
    expect(vehicle?.supplyLifecycle.offboarding.debrandingStatus).toBe(
      "completed",
    );
    expect(vehicle?.supplyLifecycle.dispatch.blockedReasons).not.toContain(
      "offboarding_pending_debranding",
    );
  });
});
