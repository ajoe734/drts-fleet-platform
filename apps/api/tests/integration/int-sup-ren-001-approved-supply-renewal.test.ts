import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  DriverRegistryRecord,
  InsurancePolicyRecord,
  SupplyDocumentRecord,
  VehicleContractRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";
import { DatabaseService } from "../../src/common/db";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";
import { FleetPartnerController } from "../../src/modules/fleet-partner/fleet-partner.controller";
import { SupplyReadinessService } from "../../src/modules/fleet-partner/supply-readiness.service";
import { SupplyReviewService } from "../../src/modules/fleet-partner/supply-review.service";
import { SupplySubmissionRepository } from "../../src/modules/fleet-partner/supply-submission.repository";
import { SupplySubmissionService } from "../../src/modules/fleet-partner/supply-submission.service";
import { RegulatoryRegistryRepository } from "../../src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";

const DATABASE_URL = process.env.DATABASE_URL;

function buildServices(db?: DatabaseService) {
  const audit = new AuditNotificationService();
  const events = {
    publishDriverLocationUpdated: vi.fn(),
    publishSupplyLifecycleUpdated: vi.fn(),
  } as unknown as OpsDispatchEventsService;
  const driverProfile = new DriverProfileService(audit);
  const registryRepo = new RegulatoryRegistryRepository(db);
  const registry = new RegulatoryRegistryService(
    events,
    audit,
    driverProfile,
    registryRepo,
  );
  const submissionRepo = new SupplySubmissionRepository(db);
  const submissionService = new SupplySubmissionService(
    submissionRepo,
    registry,
    audit,
  );
  const reviewService = new SupplyReviewService(registry, submissionRepo, audit);
  const fleetPartnerServiceStub = {
    getFleetPartner: async (fleetPartnerId: string) => ({
      fleetPartnerId,
      active: true,
    }),
    listCanonicalFleetPartnerDrivers: async () => [],
  };
  const vehicleEligibilityServiceStub = {
    resolveRuntimeVehicleCapability: () => ({ trainingRequired: false }),
  };
  const readinessService = new SupplyReadinessService(
    fleetPartnerServiceStub as never,
    registry,
    vehicleEligibilityServiceStub as never,
    submissionRepo,
  );
  const controller = new FleetPartnerController(
    {} as never,
    submissionService,
    undefined,
    readinessService,
    undefined,
  );

  return {
    audit,
    events,
    registryRepo,
    registry,
    submissionRepo,
    submissionService,
    reviewService,
    readinessService,
    controller,
  };
}

describe("INT-SUP-REN-001 approved supply renewal integration", () => {
  it("executes FleetPartnerController + SupplySubmissionService + SupplyReviewService + SupplyReadinessService end-to-end renewal recovery", async () => {
    const s = buildServices();
    await s.submissionService.onModuleInit();
    await s.reviewService.onModuleInit();

    const fleetPartnerId = "fleet-demo-001";
    const partnerIdentity = {
      authMode: "jwt_bearer" as const,
      actorType: "partner_user" as const,
      actorId: "fleet-operator-001",
      realm: "partner" as const,
      tenantId: null,
      partnerId: fleetPartnerId,
      roles: ["partner"],
      roleFamilies: ["partner" as const],
      scopes: ["partner:read", "partner:write"],
      requestId: "req-ren-001",
    };

    // 1.Onboard and approve initial vehicle submission via SupplySubmissionService + SupplyReviewService
    const initialCreated = await s.submissionService.createVehicleDraft(
      fleetPartnerId,
      partnerIdentity.actorId,
      {
        plateNo: "TPE-INT-8801",
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
    const initialSubId = initialCreated.submission.submissionId;
    const initialSubRec = s.submissionService.requireScopedSubmission(
      initialSubId,
      fleetPartnerId,
    );
    for (const [docType, until] of [
      ["vehicle_registration", "2030-12-31"],
      ["insurance_policy", "2028-12-31"],
      ["fleet_participation_contract", "2029-12-31"],
    ] as const) {
      s.submissionService.replaceDocument({
        documentId: randomUUID(),
        fleetPartnerId,
        submissionId: initialSubId,
        documentType: docType,
        fileObjectKey: `fleet-supply/${fleetPartnerId}/${initialSubId}/${docType}.pdf`,
        originalFileName: `${docType}.pdf`,
        contentType: "application/pdf",
        fileSize: 1024,
        checksumSha256: "e".repeat(64),
        effectiveFrom: "2025-01-01",
        effectiveUntil: until,
        reviewStatus: "pending",
        reviewComment: null,
        uploadedBy: partnerIdentity.actorId,
        uploadedAt: new Date().toISOString(),
      });
    }
    s.submissionService.bumpRevisionForSubmission(initialSubRec);
    await s.submissionService.persistSubmissionAndDocuments(
      initialSubRec,
      s.submissionService.listDocumentsForSubmission(initialSubId),
      "attach_initial_docs",
    );
    const initialDetail = await s.submissionService.getSupplySubmissionDetail(
      fleetPartnerId,
      initialSubId,
    );
    await s.submissionService.submitSupplySubmission(
      fleetPartnerId,
      initialSubId,
      partnerIdentity.actorId,
      { expectedRevisionNo: initialDetail.submission.revisionNo },
    );
    const initialSubmitted = await s.submissionService.getSupplySubmissionDetail(
      fleetPartnerId,
      initialSubId,
    );
    const initialInReview = await s.reviewService.startSubmissionReview(
      initialSubId,
      {
        expectedRevisionNo: initialSubmitted.submission.revisionNo,
        reasonCode: "manual_screening",
      },
      "platform-reviewer-001",
    );
    const initialApproved = await s.reviewService.approveSubmission(
      initialSubId,
      {
        expectedRevisionNo: initialInReview.revisionNo,
        reasonCode: "all_documents_valid",
        comment: "Initial vehicle onboarding approved.",
      },
      "platform-reviewer-001",
    );
    const canonicalVehicleId = initialApproved.canonicalVehicleId!;
    const initialPolicyId = initialApproved.canonicalPolicyId!;
    const initialContractId = initialApproved.canonicalContractId!;
    expect(canonicalVehicleId).toBeTruthy();

    await s.submissionService.syncState();

    // 2. Expire the vehicle's insurance policy and verify readiness becomes not_ready
    await s.registry.activateInsurancePolicy(initialPolicyId, {
      startAt: "2019-01-01T00:00:00.000Z",
      endAt: "2020-01-01T23:59:59.000Z",
    } as any);
    const targetsEnvelope = await s.controller.listSupplyRenewalTargets(
      fleetPartnerId,
      "req-targets-1",
    );
    const targetVehicle = targetsEnvelope.data.vehicles.find(
      (v) => v.vehicleId === canonicalVehicleId,
    )!;
    expect(targetVehicle).toBeDefined();
    expect(targetVehicle.ready).toBe(false);
    expect(targetVehicle.reasonCodes).toContain("INSURANCE_EXPIRED");

    // 3. Create insurance_update draft through FleetPartnerController
    const createdEnvelope =
      await s.controller.createSupplyRenewalSubmission(
        fleetPartnerId,
        undefined,
        {
          submissionType: "insurance_update",
          subjectVehicleId: canonicalVehicleId,
        },
        "req-create-ren-1",
        partnerIdentity,
      );
    const renewalSubId = createdEnvelope.data.submission.submissionId;
    expect(createdEnvelope.data.submission.submissionType).toBe(
      "insurance_update",
    );
    expect(createdEnvelope.data.submission.canonicalVehicleId).toBe(
      canonicalVehicleId,
    );

    // 4. Attach renewed insurance_policy document and submit
    const subRecord = s.submissionService.requireScopedSubmission(
      renewalSubId,
      fleetPartnerId,
    );
    const renewedPolicyDoc: SupplyDocumentRecord = {
      documentId: randomUUID(),
      fleetPartnerId,
      submissionId: renewalSubId,
      documentType: "insurance_policy",
      fileObjectKey: `fleet-supply/${fleetPartnerId}/${renewalSubId}/policy-renewed.pdf`,
      originalFileName: "policy-renewed.pdf",
      contentType: "application/pdf",
      fileSize: 2048,
      checksumSha256: "f".repeat(64),
      effectiveFrom: "2026-01-01",
      effectiveUntil: "2031-12-31",
      reviewStatus: "pending",
      reviewComment: null,
      uploadedBy: partnerIdentity.actorId,
      uploadedAt: new Date().toISOString(),
    };
    s.submissionService.replaceDocument(renewedPolicyDoc);
    s.submissionService.bumpRevisionForSubmission(subRecord);
    await s.submissionService.persistSubmissionAndDocuments(
      subRecord,
      s.submissionService.listDocumentsForSubmission(renewalSubId),
      "attach_renewed_policy",
    );

    const detailBeforeSubmit =
      await s.submissionService.getSupplySubmissionDetail(
        fleetPartnerId,
        renewalSubId,
      );
    await s.submissionService.submitSupplySubmission(
      fleetPartnerId,
      renewalSubId,
      partnerIdentity.actorId,
      { expectedRevisionNo: detailBeforeSubmit.submission.revisionNo },
    );

    // 5. Platform Reviewer starts review and approves
    const detailSubmitted =
      await s.submissionService.getSupplySubmissionDetail(
        fleetPartnerId,
        renewalSubId,
      );
    const inReview = await s.reviewService.startSubmissionReview(
      renewalSubId,
      {
        expectedRevisionNo: detailSubmitted.submission.revisionNo,
        reasonCode: "manual_screening",
      },
      "platform-reviewer-002",
    );
    const approvedRenewal = await s.reviewService.approveSubmission(
      renewalSubId,
      {
        expectedRevisionNo: inReview.revisionNo,
        reasonCode: "all_documents_valid",
        comment: "Renewed policy verified.",
      },
      "platform-reviewer-002",
    );

    expect(approvedRenewal.status).toBe("approved");
    expect(approvedRenewal.canonicalVehicleId).toBe(canonicalVehicleId);
    expect(approvedRenewal.canonicalPolicyId).toBeTruthy();
    expect(approvedRenewal.canonicalPolicyId).not.toBe(initialPolicyId);
    expect(approvedRenewal.canonicalContractId).toBe(initialContractId);

    // 6. Verify readiness aggregates prior registration + contract with renewed insurance
    await s.submissionService.syncState();
    const readinessAfter =
      await s.readinessService.listFleetPartnerReadiness(fleetPartnerId);
    const vehicleReadinessAfter = readinessAfter.find(
      (r) => r.subjectType === "vehicle" && r.subjectId === canonicalVehicleId,
    )!;
    expect(vehicleReadinessAfter.state).toBe("ready");
    expect(vehicleReadinessAfter.reasonCodes).toEqual([]);
  });

  describe.runIf(Boolean(DATABASE_URL))(
    "against migrated PostgreSQL (V0134 + production repositories)",
    () => {
      const databases: DatabaseService[] = [];
      const createdSubmissionIds = new Set<string>();
      const createdVehicleIds = new Set<string>();
      const createdDriverIds = new Set<string>();
      const createdFleetPartnerIds = new Set<string>();

      function createDb() {
        const instance = new DatabaseService();
        databases.push(instance);
        return instance;
      }

      afterEach(async () => {
        try {
          if (DATABASE_URL) {
            const cleanup = createDb();
            if (createdFleetPartnerIds.size > 0) {
              await cleanup.query(
                "DELETE FROM fleet.vehicle_fleet_affiliations WHERE fleet_partner_id = ANY($1::text[])",
                [[...createdFleetPartnerIds]],
              );
            }
            if (createdSubmissionIds.size > 0) {
              const subIds = [...createdSubmissionIds];
              await cleanup.query(
                "DELETE FROM fleet.vehicle_fleet_affiliations WHERE source_submission_id = ANY($1::uuid[])",
                [subIds],
              );
              await cleanup.query(
                "DELETE FROM fleet.supply_review_events WHERE submission_id = ANY($1::uuid[])",
                [subIds],
              );
              await cleanup.query(
                "DELETE FROM fleet.supply_documents WHERE submission_id = ANY($1::uuid[])",
                [subIds],
              );
              await cleanup.query(
                "DELETE FROM fleet.vehicle_supply_drafts WHERE submission_id = ANY($1::uuid[])",
                [subIds],
              );
              await cleanup.query(
                "DELETE FROM fleet.driver_supply_drafts WHERE submission_id = ANY($1::uuid[])",
                [subIds],
              );
              await cleanup.query(
                "DELETE FROM fleet.supply_submissions WHERE submission_id = ANY($1::uuid[])",
                [subIds],
              );
            }
            if (createdVehicleIds.size > 0) {
              const vehIds = [...createdVehicleIds];
              await cleanup.query(
                `DELETE FROM reg.phase1_registry_expiry_events
                 WHERE entity_id IN (
                   SELECT policy_id FROM reg.phase1_registry_policies WHERE vehicle_id = ANY($1::text[])
                   UNION
                   SELECT contract_id FROM reg.phase1_registry_contracts WHERE vehicle_id = ANY($1::text[])
                 )`,
                [vehIds],
              );
              await cleanup.query(
                "DELETE FROM reg.phase1_registry_supply_pairs WHERE vehicle_id = ANY($1::text[])",
                [vehIds],
              );
              await cleanup.query(
                "UPDATE reg.phase1_registry_policies SET superseded_by_policy_id = NULL WHERE vehicle_id = ANY($1::text[])",
                [vehIds],
              );
              await cleanup.query(
                "DELETE FROM reg.phase1_registry_policies WHERE vehicle_id = ANY($1::text[])",
                [vehIds],
              );
              await cleanup.query(
                "UPDATE reg.phase1_registry_contracts SET superseded_by_contract_id = NULL WHERE vehicle_id = ANY($1::text[])",
                [vehIds],
              );
              await cleanup.query(
                "DELETE FROM reg.phase1_registry_contracts WHERE vehicle_id = ANY($1::text[])",
                [vehIds],
              );
              await cleanup.query(
                "DELETE FROM reg.phase1_registry_exclusivities WHERE vehicle_id = ANY($1::text[])",
                [vehIds],
              );
              await cleanup.query(
                "DELETE FROM reg.vehicle_passenger_disclosure_profiles WHERE vehicle_id = ANY($1::text[])",
                [vehIds],
              );
              await cleanup.query(
                "DELETE FROM reg.phase1_registry_vehicles WHERE vehicle_id = ANY($1::text[])",
                [vehIds],
              );
            }
            if (createdDriverIds.size > 0) {
              const drvIds = [...createdDriverIds];
              await cleanup.query(
                "DELETE FROM reg.phase1_registry_expiry_events WHERE entity_id = ANY($1::text[])",
                [drvIds],
              );
              await cleanup.query(
                "DELETE FROM reg.driver_public_registration_credentials WHERE driver_id = ANY($1::text[])",
                [drvIds],
              );
              await cleanup.query(
                "DELETE FROM reg.phase1_registry_drivers WHERE driver_id = ANY($1::text[])",
                [drvIds],
              );
            }
          }
        } finally {
          createdSubmissionIds.clear();
          createdVehicleIds.clear();
          createdDriverIds.clear();
          createdFleetPartnerIds.clear();
          await Promise.all(
            databases.splice(0).map((db) => db.onModuleDestroy()),
          );
          vi.restoreAllMocks();
        }
      });

      it("applies V0134 indexes and constraint, commits same-plate renewal + policy/contract history + R14 event supersession atomically, and rolls back on failure", async () => {
        const db = createDb();
        const s = buildServices(db);

        // Verify V0134 indexes exist in PostgreSQL
        const indexCheck = await db.query<{ indexname: string }>(
          `SELECT indexname
           FROM pg_indexes
           WHERE schemaname = 'fleet'
             AND indexname IN (
               'idx_vehicle_supply_drafts_plate_no',
               'idx_supply_submissions_partner_subject_vehicle',
               'idx_supply_submissions_canonical_vehicle_status'
             )
           ORDER BY indexname`,
        );
        expect(indexCheck.rows.map((r) => r.indexname)).toEqual([
          "idx_supply_submissions_canonical_vehicle_status",
          "idx_supply_submissions_partner_subject_vehicle",
          "idx_vehicle_supply_drafts_plate_no",
        ]);

        const fleetPartnerId = `fleet-pg-ren-${randomUUID().slice(0, 8)}`;
        createdFleetPartnerIds.add(fleetPartnerId);
        const plateNo = `PG-${randomUUID().slice(0, 6).toUpperCase()}`;

        await s.submissionService.onModuleInit();
        await s.reviewService.onModuleInit();

        // 1. Create and approve initial vehicle_onboarding in PostgreSQL
        const onboardingCreated = await s.submissionService.createVehicleDraft(
          fleetPartnerId,
          "fleet-actor-pg",
          {
            plateNo,
            licenseType: "taxi",
            brand: "Toyota",
            model: "Corolla Cross",
            modelYear: 2025,
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
        const onboardingSubId = onboardingCreated.submission.submissionId;
        createdSubmissionIds.add(onboardingSubId);

        const attachDocs = async (
          submissionId: string,
          docs: Array<{
            documentType: SupplyDocumentRecord["documentType"];
            effectiveFrom: string;
            effectiveUntil: string;
          }>,
        ) => {
          const sub = s.submissionService.requireScopedSubmission(
            submissionId,
            fleetPartnerId,
          );
          for (const d of docs) {
            s.submissionService.replaceDocument({
              documentId: randomUUID(),
              fleetPartnerId,
              submissionId,
              documentType: d.documentType,
              fileObjectKey: `fleet-supply/${fleetPartnerId}/${submissionId}/${d.documentType}.pdf`,
              originalFileName: `${d.documentType}.pdf`,
              contentType: "application/pdf",
              fileSize: 1024,
              checksumSha256: "d".repeat(64),
              effectiveFrom: d.effectiveFrom,
              effectiveUntil: d.effectiveUntil,
              reviewStatus: "pending",
              reviewComment: null,
              uploadedBy: "fleet-actor-pg",
              uploadedAt: new Date().toISOString(),
            });
          }
          s.submissionService.bumpRevisionForSubmission(sub);
          await s.submissionService.persistSubmissionAndDocuments(
            sub,
            s.submissionService.listDocumentsForSubmission(submissionId),
            "pg_attach_docs",
          );
        };

        await attachDocs(onboardingSubId, [
          {
            documentType: "vehicle_registration",
            effectiveFrom: "2025-01-01",
            effectiveUntil: "2030-12-31",
          },
          {
            documentType: "insurance_policy",
            effectiveFrom: "2025-01-01",
            effectiveUntil: "2027-12-31",
          },
          {
            documentType: "fleet_participation_contract",
            effectiveFrom: "2025-01-01",
            effectiveUntil: "2029-12-31",
          },
        ]);

        const onbDetail = await s.submissionService.getSupplySubmissionDetail(
          fleetPartnerId,
          onboardingSubId,
        );
        await s.submissionService.submitSupplySubmission(
          fleetPartnerId,
          onboardingSubId,
          "fleet-actor-pg",
          { expectedRevisionNo: onbDetail.submission.revisionNo },
        );
        const onbSubmitted =
          await s.submissionService.getSupplySubmissionDetail(
            fleetPartnerId,
            onboardingSubId,
          );
        const onbInReview = await s.reviewService.startSubmissionReview(
          onboardingSubId,
          {
            expectedRevisionNo: onbSubmitted.submission.revisionNo,
            reasonCode: "manual_screening",
          },
          "reviewer-pg-1",
        );
        const onbApproved = await s.reviewService.approveSubmission(
          onboardingSubId,
          {
            expectedRevisionNo: onbInReview.revisionNo,
            reasonCode: "all_documents_valid",
          },
          "reviewer-pg-1",
        );

        const canonicalVehicleId = onbApproved.canonicalVehicleId!;
        const initialPolicyId = onbApproved.canonicalPolicyId!;
        createdVehicleIds.add(canonicalVehicleId);

        // Seed an active R14 pre-expiry event for the initial policy in PostgreSQL
        const preexpiryEventId = randomUUID();
        const fingerprint = createHash("sha256")
          .update(
            JSON.stringify([
              "credential-preexpiry/v1",
              "regulatory-registry",
              "policy",
              initialPolicyId,
              preexpiryEventId,
            ]),
          )
          .digest("hex");
        await db.query(
          `INSERT INTO reg.phase1_registry_expiry_events (
             event_id, scope, entity_type, entity_id, credential_type,
             source_fingerprint, source_expiry_at, status
           ) VALUES ($1, 'regulatory-registry', 'policy', $2, 'preexpiry:insurance_policy:30', $3, '2027-12-31T23:59:59.000Z', 'pending')`,
          [preexpiryEventId, initialPolicyId, fingerprint],
        );

        // 2. Create a second vehicle_supply_drafts row with the SAME plate via createRenewalDraft (permitted by V0134!)
        await s.submissionService.syncState();
        const renewalCreated = await s.submissionService.createRenewalDraft(
          fleetPartnerId,
          "fleet-actor-pg",
          {
            submissionType: "insurance_update",
            subjectVehicleId: canonicalVehicleId,
          },
        );
        const renewalSubId = renewalCreated.submission.submissionId;
        createdSubmissionIds.add(renewalSubId);

        await attachDocs(renewalSubId, [
          {
            documentType: "insurance_policy",
            effectiveFrom: "2026-01-01",
            effectiveUntil: "2031-12-31",
          },
        ]);
        const renDetail = await s.submissionService.getSupplySubmissionDetail(
          fleetPartnerId,
          renewalSubId,
        );
        await s.submissionService.submitSupplySubmission(
          fleetPartnerId,
          renewalSubId,
          "fleet-actor-pg",
          { expectedRevisionNo: renDetail.submission.revisionNo },
        );
        const renSubmitted =
          await s.submissionService.getSupplySubmissionDetail(
            fleetPartnerId,
            renewalSubId,
          );
        const renInReview = await s.reviewService.startSubmissionReview(
          renewalSubId,
          {
            expectedRevisionNo: renSubmitted.submission.revisionNo,
            reasonCode: "manual_screening",
          },
          "reviewer-pg-2",
        );

        // 3. Inject a downstream failure on INSERT INTO fleet.supply_review_events during approveSubmission to prove atomic rollback
        const origConnect = db.connect.bind(db);
        let failOnce = true;
        const connectSpy = vi
          .spyOn(db, "connect")
          .mockImplementation(async () => {
            const client = await origConnect();
            const origQuery = client.query.bind(client);
            client.query = (async (...args: unknown[]) => {
              if (
                failOnce &&
                String(args[0]).includes("INSERT INTO fleet.supply_review_events")
              ) {
                failOnce = false;
                throw new Error("INJECTED_REVIEW_EVENT_WRITE_FAILURE");
              }
              return (origQuery as (...a: unknown[]) => unknown)(...args);
            }) as typeof client.query;
            return client;
          });

        await expect(
          s.reviewService.approveSubmission(
            renewalSubId,
            {
              expectedRevisionNo: renInReview.revisionNo,
              reasonCode: "all_documents_valid",
            },
            "reviewer-pg-2",
          ),
        ).rejects.toThrow("INJECTED_REVIEW_EVENT_WRITE_FAILURE");
        connectSpy.mockRestore();

        // Verify PostgreSQL rolled back the submission status, policy creation, and R14 event supersession!
        const afterRollback = await db.query<{
          sub_status: string;
          policy_count: number;
          event_status: string;
        }>(
          `SELECT
             (SELECT status FROM fleet.supply_submissions WHERE submission_id = $1) AS sub_status,
             (SELECT count(*)::int FROM reg.phase1_registry_policies WHERE vehicle_id = $2) AS policy_count,
             (SELECT status FROM reg.phase1_registry_expiry_events WHERE event_id = $3) AS event_status`,
          [renewalSubId, canonicalVehicleId, preexpiryEventId],
        );
        expect(afterRollback.rows[0]).toEqual({
          sub_status: "in_review",
          policy_count: 1,
          event_status: "pending",
        });

        // 4. Now approve normally and verify atomic commit of submission, new policy, superseded old policy, and superseded R14 event
        const approvedRenewal = await s.reviewService.approveSubmission(
          renewalSubId,
          {
            expectedRevisionNo: renInReview.revisionNo,
            reasonCode: "all_documents_valid",
          },
          "reviewer-pg-2",
        );
        expect(approvedRenewal.status).toBe("approved");
        expect(approvedRenewal.canonicalVehicleId).toBe(canonicalVehicleId);
        expect(approvedRenewal.canonicalPolicyId).not.toBe(initialPolicyId);

        const afterCommit = await db.query<{
          sub_status: string;
          policy_count: number;
          event_status: string;
        }>(
          `SELECT
             (SELECT status FROM fleet.supply_submissions WHERE submission_id = $1) AS sub_status,
             (SELECT count(*)::int FROM reg.phase1_registry_policies WHERE vehicle_id = $2) AS policy_count,
             (SELECT status FROM reg.phase1_registry_expiry_events WHERE event_id = $3) AS event_status`,
          [renewalSubId, canonicalVehicleId, preexpiryEventId],
        );
        expect(afterCommit.rows[0]).toEqual({
          sub_status: "approved",
          policy_count: 2,
          event_status: "superseded",
        });

        await db.query(
          "DELETE FROM reg.phase1_registry_expiry_events WHERE event_id = $1",
          [preexpiryEventId],
        );
      });
    },
  );
});
