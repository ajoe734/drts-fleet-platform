import { describe, expect, it, vi } from "vitest";

import type {
  DriverSupplyDraft,
  SupplyDocumentRecord,
  SupplySubmissionRecord,
  VehicleFleetAffiliationRecord,
  VehicleSupplyDraft,
} from "@drts/contracts";

import {
  SupplySubmissionRepository,
  type SupplyDocumentUploadIntentRecord,
} from "../../src/modules/fleet-partner/supply-submission.repository";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createSubmission(
  overrides: Partial<SupplySubmissionRecord> = {},
): SupplySubmissionRecord {
  return {
    submissionId: "a40ec48e-9ed0-4b6a-a5db-0bdb9ca859f3",
    fleetPartnerId: "fleet-demo-001",
    submissionType: "vehicle_onboarding",
    status: "draft",
    revisionNo: 2,
    subjectDriverId: null,
    subjectVehicleId: null,
    submittedBy: null,
    submittedAt: null,
    reviewStartedBy: null,
    reviewStartedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    reviewReasonCode: null,
    reviewComment: null,
    canonicalDriverId: null,
    canonicalVehicleId: null,
    canonicalContractId: null,
    canonicalPolicyId: null,
    createdAt: "2026-06-20T01:00:00.000Z",
    updatedAt: "2026-06-20T01:05:00.000Z",
    ...overrides,
  };
}

function createDriverDraft(
  overrides: Partial<DriverSupplyDraft> = {},
): DriverSupplyDraft {
  return {
    submissionId: "a40ec48e-9ed0-4b6a-a5db-0bdb9ca859f3",
    name: "Driver Demo",
    mobile: "+886900100200",
    professionalDriverLicenseNo: "PDL-7788",
    professionalDriverLicenseExpiry: "2027-12-31",
    taxiDriverRegistrationNo: "TX-0099",
    taxiDriverRegistrationArea: "TPE",
    taxiDriverRegistrationExpiry: "2027-12-31",
    supportedServiceProductCodes: ["taxi_realtime"],
    preferredVehicleSubmissionId: null,
    ...overrides,
  };
}

function createVehicleDraft(
  overrides: Partial<VehicleSupplyDraft> = {},
): VehicleSupplyDraft {
  return {
    submissionId: "a40ec48e-9ed0-4b6a-a5db-0bdb9ca859f3",
    plateNo: "ABC-1234",
    licenseType: "taxi",
    brand: "Toyota",
    model: "Sienta",
    modelYear: 2024,
    seatCount: 5,
    luggageCapacity: 3,
    businessArea: "TPE",
    supportedServiceProductCodes: ["taxi_realtime"],
    airportTransferEligible: false,
    fixedFareAllowed: true,
    currentDriverSubmissionId: null,
    ...overrides,
  };
}

function createDocument(
  overrides: Partial<SupplyDocumentRecord> = {},
): SupplyDocumentRecord {
  return {
    documentId: "01dcf7ee-f3a4-46c1-ad85-0c8db77139e0",
    fleetPartnerId: "fleet-demo-001",
    submissionId: "a40ec48e-9ed0-4b6a-a5db-0bdb9ca859f3",
    documentType: "vehicle_registration",
    fileObjectKey: "fleet/demo/vehicle-registration.pdf",
    originalFileName: "vehicle-registration.pdf",
    contentType: "application/pdf",
    fileSize: 10_240,
    checksumSha256: "abc123",
    effectiveFrom: "2026-06-01",
    effectiveUntil: "2027-05-31",
    reviewStatus: "pending",
    reviewComment: null,
    uploadedBy: "fleet-user-1",
    uploadedAt: "2026-06-20T01:10:00.000Z",
    ...overrides,
  };
}

function createVehicleAffiliation(
  overrides: Partial<VehicleFleetAffiliationRecord> = {},
): VehicleFleetAffiliationRecord {
  return {
    affiliationId: "72ef4c2a-67bc-415a-9c22-0ef758dcb025",
    vehicleId: "veh-demo-001",
    fleetPartnerId: "fleet-demo-001",
    affiliationType: "managed_by",
    effectiveFrom: "2026-06-20T02:00:00.000Z",
    effectiveUntil: null,
    status: "active",
    sourceSubmissionId: "a40ec48e-9ed0-4b6a-a5db-0bdb9ca859f3",
    createdAt: "2026-06-20T02:00:00.000Z",
    updatedAt: "2026-06-20T02:05:00.000Z",
    ...overrides,
  };
}

function createUploadIntent(
  overrides: Partial<SupplyDocumentUploadIntentRecord> = {},
): SupplyDocumentUploadIntentRecord {
  return {
    objectKey:
      "fleet-partner/fleet-demo-001/supply-submissions/a40ec48e-9ed0-4b6a-a5db-0bdb9ca859f3/license.pdf",
    submissionId: "a40ec48e-9ed0-4b6a-a5db-0bdb9ca859f3",
    fleetPartnerId: "fleet-demo-001",
    documentType: "vehicle_registration",
    originalFileName: "vehicle-registration.pdf",
    contentType: "application/pdf",
    createdAt: "2026-06-20T01:10:00.000Z",
    expiresAt: "2026-06-20T01:25:00.000Z",
    ...overrides,
  };
}

describe("supply submission repository", () => {
  it("degrades missing relations per table while still hydrating the remaining supply state", async () => {
    const query = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("missing submissions"), { code: "42P01" }),
      )
      .mockResolvedValueOnce({
        rows: [
          {
            submission_id: createDriverDraft().submissionId,
            name: "Driver Demo",
            mobile: "+886900100200",
            professional_driver_license_no: "PDL-7788",
            professional_driver_license_expiry: "2027-12-31",
            taxi_driver_registration_no: "TX-0099",
            taxi_driver_registration_area: "TPE",
            taxi_driver_registration_expiry: "2027-12-31",
            supported_service_product_codes: ["taxi_realtime"],
            preferred_vehicle_submission_id: null,
          },
        ],
      })
      .mockRejectedValueOnce(
        Object.assign(new Error("missing vehicle drafts"), { code: "42P01" }),
      )
      .mockResolvedValueOnce({
        rows: [
          {
            document_id: createDocument().documentId,
            fleet_partner_id: "fleet-demo-001",
            submission_id: createDocument().submissionId,
            document_type: "vehicle_registration",
            file_object_key: "fleet/demo/vehicle-registration.pdf",
            original_file_name: "vehicle-registration.pdf",
            content_type: "application/pdf",
            file_size: "10240",
            checksum_sha256: "abc123",
            effective_from: "2026-06-01",
            effective_until: "2027-05-31",
            review_status: "pending",
            review_comment: null,
            uploaded_by: "fleet-user-1",
            uploaded_at: "2026-06-20T01:10:00.000Z",
          },
        ],
      })
      .mockRejectedValueOnce(
        Object.assign(new Error("missing review events"), { code: "42P01" }),
      )
      .mockResolvedValueOnce({
        rows: [
          {
            affiliation_id: createVehicleAffiliation().affiliationId,
            vehicle_id: "veh-demo-001",
            fleet_partner_id: "fleet-demo-001",
            affiliation_type: "managed_by",
            effective_from: "2026-06-20T02:00:00.000Z",
            effective_until: null,
            status: "active",
            source_submission_id: createVehicleAffiliation().sourceSubmissionId,
            created_at: "2026-06-20T02:00:00.000Z",
            updated_at: "2026-06-20T02:05:00.000Z",
          },
        ],
      });
    const repository = new SupplySubmissionRepository({
      isEnabled: () => true,
      query,
    } as never);

    const state = await repository.loadState();

    expect(state.submissions).toEqual([]);
    expect(state.driverDrafts).toHaveLength(1);
    expect(state.vehicleDrafts).toEqual([]);
    expect(state.documents).toHaveLength(1);
    expect(state.reviewEvents).toEqual([]);
    expect(state.vehicleAffiliations).toHaveLength(1);
  });

  it("persists all fleet supply tables", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new SupplySubmissionRepository({
      isEnabled: () => true,
      query,
    } as never);

    await repository.persistChanges({
      submissions: [createSubmission()],
      driverDrafts: [createDriverDraft()],
      vehicleDrafts: [createVehicleDraft()],
      documents: [createDocument()],
      reviewEvents: [
        {
          eventId: "c20b7f3b-a835-47cd-a091-a8d7cfa60c24",
          submissionId: "a40ec48e-9ed0-4b6a-a5db-0bdb9ca859f3",
          revisionNo: 2,
          eventType: "submitted",
          actorId: "fleet-user-1",
          reasonCode: null,
          comment: null,
          createdAt: "2026-06-20T01:15:00.000Z",
        },
      ],
      vehicleAffiliations: [createVehicleAffiliation()],
    });

    const sqlTexts = query.mock.calls.map(([sql]) => String(sql));
    expect(
      sqlTexts.some((sql) => sql.includes("INSERT INTO fleet.supply_submissions")),
    ).toBe(true);
    expect(
      sqlTexts.some((sql) => sql.includes("INSERT INTO fleet.driver_supply_drafts")),
    ).toBe(true);
    expect(
      sqlTexts.some((sql) => sql.includes("INSERT INTO fleet.vehicle_supply_drafts")),
    ).toBe(true);
    expect(
      sqlTexts.some((sql) => sql.includes("INSERT INTO fleet.supply_documents")),
    ).toBe(true);
    expect(
      sqlTexts.some((sql) => sql.includes("INSERT INTO fleet.supply_review_events")),
    ).toBe(true);
    expect(
      sqlTexts.some(
        (sql) => sql.includes("INSERT INTO fleet.vehicle_fleet_affiliations"),
      ),
    ).toBe(true);
  });

  it("stores and deletes durable document upload intents", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new SupplySubmissionRepository({
      isEnabled: () => true,
      query,
    } as never);

    await repository.saveDocumentUploadIntent(createUploadIntent());
    await repository.deleteDocumentUploadIntent(createUploadIntent().objectKey);

    const sqlTexts = query.mock.calls.map(([sql]) => String(sql));
    expect(
      sqlTexts.some(
        (sql) =>
          sql.includes("INSERT INTO fleet.supply_document_upload_intents"),
      ),
    ).toBe(true);
    expect(
      sqlTexts.some(
        (sql) =>
          sql.includes("DELETE FROM fleet.supply_document_upload_intents"),
      ),
    ).toBe(true);
  });

  it("loads a durable document upload intent by object key", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          object_key: createUploadIntent().objectKey,
          submission_id: createUploadIntent().submissionId,
          fleet_partner_id: createUploadIntent().fleetPartnerId,
          document_type: createUploadIntent().documentType,
          original_file_name: createUploadIntent().originalFileName,
          content_type: createUploadIntent().contentType,
          created_at: createUploadIntent().createdAt,
          expires_at: createUploadIntent().expiresAt,
        },
      ],
    });
    const repository = new SupplySubmissionRepository({
      isEnabled: () => true,
      query,
    } as never);

    await expect(
      repository.findDocumentUploadIntent(createUploadIntent().objectKey),
    ).resolves.toEqual(createUploadIntent());
  });

  it("persists dependent supply tables only after supply_submissions completes", async () => {
    const submissionInsert = createDeferred<{ rows: [] }>();
    const seenSql: string[] = [];
    const query = vi.fn().mockImplementation((sql: string) => {
      const text = String(sql);
      seenSql.push(text);
      if (text.includes("INSERT INTO fleet.supply_submissions")) {
        return submissionInsert.promise;
      }
      return Promise.resolve({ rows: [] });
    });
    const repository = new SupplySubmissionRepository({
      isEnabled: () => true,
      query,
    } as never);

    const persistPromise = repository.persistChanges({
      submissions: [createSubmission()],
      documents: [createDocument()],
      reviewEvents: [
        {
          eventId: "c20b7f3b-a835-47cd-a091-a8d7cfa60c24",
          submissionId: createSubmission().submissionId,
          revisionNo: 2,
          eventType: "submitted",
          actorId: "fleet-user-1",
          reasonCode: null,
          comment: null,
          createdAt: "2026-06-20T01:15:00.000Z",
        },
      ],
      vehicleAffiliations: [createVehicleAffiliation()],
    });

    await Promise.resolve();

    expect(seenSql).toHaveLength(1);
    expect(seenSql[0]).toContain("INSERT INTO fleet.supply_submissions");

    submissionInsert.resolve({ rows: [] });
    await persistPromise;

    expect(
      seenSql.some((sql) => sql.includes("INSERT INTO fleet.supply_documents")),
    ).toBe(true);
    expect(
      seenSql.some((sql) =>
        sql.includes("INSERT INTO fleet.supply_review_events"),
      ),
    ).toBe(true);
    expect(
      seenSql.some((sql) =>
        sql.includes("INSERT INTO fleet.vehicle_fleet_affiliations"),
      ),
    ).toBe(true);
  });

  it("persists submission workflow against a transaction executor", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new SupplySubmissionRepository();

    await repository.persistSubmissionWorkflow({ query } as never, {
      submissions: [createSubmission()],
      driverDrafts: [createDriverDraft()],
      vehicleDrafts: [createVehicleDraft()],
    });

    expect(query).toHaveBeenCalledTimes(3);
    expect(String(query.mock.calls[0]?.[0])).toContain(
      "INSERT INTO fleet.supply_submissions",
    );
    expect(String(query.mock.calls[1]?.[0])).toContain(
      "INSERT INTO fleet.driver_supply_drafts",
    );
    expect(String(query.mock.calls[2]?.[0])).toContain(
      "INSERT INTO fleet.vehicle_supply_drafts",
    );
  });

  it("applies state transitions with optimistic revision advancement", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          submission_id: "a40ec48e-9ed0-4b6a-a5db-0bdb9ca859f3",
          fleet_partner_id: "fleet-demo-001",
          submission_type: "vehicle_onboarding",
          status: "submitted",
          revision_no: 3,
          subject_driver_id: null,
          subject_vehicle_id: null,
          submitted_by: "fleet-user-1",
          submitted_at: "2026-06-20T01:20:00.000Z",
          review_started_by: null,
          review_started_at: null,
          reviewed_by: null,
          reviewed_at: null,
          review_reason_code: null,
          review_comment: null,
          canonical_driver_id: null,
          canonical_vehicle_id: null,
          canonical_contract_id: null,
          canonical_policy_id: null,
          created_at: "2026-06-20T01:00:00.000Z",
          updated_at: "2026-06-20T01:20:00.000Z",
        },
      ],
    });
    const repository = new SupplySubmissionRepository();

    const updated = await repository.transitionSubmissionStatus(
      { query } as never,
      {
        submissionId: "a40ec48e-9ed0-4b6a-a5db-0bdb9ca859f3",
        fleetPartnerId: "fleet-demo-001",
        expectedRevisionNo: 2,
        nextStatus: "submitted",
        allowedCurrentStatuses: ["draft", "needs_revision"],
        submittedBy: "fleet-user-1",
        submittedAt: "2026-06-20T01:20:00.000Z",
      },
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("revision_no = revision_no + 1"),
      expect.arrayContaining([
        "a40ec48e-9ed0-4b6a-a5db-0bdb9ca859f3",
        "fleet-demo-001",
        2,
        "submitted",
      ]),
    );
    expect(updated.status).toBe("submitted");
    expect(updated.revisionNo).toBe(3);
  });

  it("raises a revision conflict when the scoped submission revision is stale", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            submission_id: "a40ec48e-9ed0-4b6a-a5db-0bdb9ca859f3",
            fleet_partner_id: "fleet-demo-001",
            submission_type: "vehicle_onboarding",
            status: "draft",
            revision_no: 4,
            subject_driver_id: null,
            subject_vehicle_id: null,
            submitted_by: null,
            submitted_at: null,
            review_started_by: null,
            review_started_at: null,
            reviewed_by: null,
            reviewed_at: null,
            review_reason_code: null,
            review_comment: null,
            canonical_driver_id: null,
            canonical_vehicle_id: null,
            canonical_contract_id: null,
            canonical_policy_id: null,
            created_at: "2026-06-20T01:00:00.000Z",
            updated_at: "2026-06-20T01:05:00.000Z",
          },
        ],
      });
    const repository = new SupplySubmissionRepository();

    await expect(
      repository.transitionSubmissionStatus({ query } as never, {
        submissionId: "a40ec48e-9ed0-4b6a-a5db-0bdb9ca859f3",
        fleetPartnerId: "fleet-demo-001",
        expectedRevisionNo: 2,
        nextStatus: "submitted",
        allowedCurrentStatuses: ["draft"],
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "REVISION_CONFLICT",
        },
      },
    });
  });

  it("enforces fleet scope when loading a submission", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new SupplySubmissionRepository();

    await expect(
      repository.loadFleetScopedSubmission(
        { query } as never,
        "a40ec48e-9ed0-4b6a-a5db-0bdb9ca859f3",
        "fleet-other-002",
      ),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "NOT_FOUND",
        },
      },
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("fleet_partner_id = $2"),
      ["a40ec48e-9ed0-4b6a-a5db-0bdb9ca859f3", "fleet-other-002"],
    );
  });

  it("blocks duplicate partner-scoped vehicle plates before draft persistence", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ submission_id: "b7e09128-4572-454b-8663-95f1a00fa9ec" }],
    });
    const repository = new SupplySubmissionRepository();

    await expect(
      repository.assertVehiclePlateAvailable(
        { query } as never,
        "fleet-demo-001",
        "ABC-1234",
      ),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "DUPLICATE_PLATE",
        },
      },
    });
  });

  it("returns the canonical vehicle target when the plate already exists in registry", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ vehicle_id: "veh-demo-001" }] });
    const repository = new SupplySubmissionRepository({
      isEnabled: () => true,
      query,
    } as never);

    const result = await repository.assertVehiclePlateAvailable(
      { query } as never,
      "fleet-demo-001",
      "ABC-1234",
    );

    expect(result).toEqual({ canonicalVehicleId: "veh-demo-001" });
  });
});
