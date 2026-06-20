import { HttpStatus, Injectable, Logger, Optional } from "@nestjs/common";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";

import type {
  DriverSupplyDraft,
  SupplyDocumentRecord,
  SupplySubmissionRecord,
  SupplySubmissionStatus,
  VehicleFleetAffiliationRecord,
  VehicleSupplyDraft,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { DatabaseService } from "../../common/db";

type SupplySubmissionRow = {
  submission_id: string;
  fleet_partner_id: string;
  submission_type: SupplySubmissionRecord["submissionType"];
  status: SupplySubmissionStatus;
  revision_no: number | string;
  subject_driver_id: string | null;
  subject_vehicle_id: string | null;
  submitted_by: string | null;
  submitted_at: string | Date | null;
  review_started_by: string | null;
  review_started_at: string | Date | null;
  reviewed_by: string | null;
  reviewed_at: string | Date | null;
  review_reason_code: string | null;
  review_comment: string | null;
  canonical_driver_id: string | null;
  canonical_vehicle_id: string | null;
  canonical_contract_id: string | null;
  canonical_policy_id: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type DriverSupplyDraftRow = {
  submission_id: string;
  name: string;
  mobile: string;
  professional_driver_license_no: string;
  professional_driver_license_expiry: string | Date;
  taxi_driver_registration_no: string;
  taxi_driver_registration_area: string;
  taxi_driver_registration_expiry: string | Date;
  supported_service_product_codes: unknown;
  preferred_vehicle_submission_id: string | null;
};

type VehicleSupplyDraftRow = {
  submission_id: string;
  plate_no: string;
  license_type: string;
  brand: string | null;
  model: string | null;
  model_year: number | string | null;
  seat_count: number | string;
  luggage_capacity: number | string;
  business_area: string;
  supported_service_product_codes: unknown;
  airport_transfer_eligible: boolean;
  fixed_fare_allowed: boolean;
  current_driver_submission_id: string | null;
};

type SupplyDocumentRow = {
  document_id: string;
  fleet_partner_id: string;
  submission_id: string;
  document_type: SupplyDocumentRecord["documentType"];
  file_object_key: string;
  original_file_name: string;
  content_type: string;
  file_size: number | string;
  checksum_sha256: string;
  effective_from: string | Date | null;
  effective_until: string | Date | null;
  review_status: SupplyDocumentRecord["reviewStatus"];
  review_comment: string | null;
  uploaded_by: string;
  uploaded_at: string | Date;
};

type SupplyReviewEventRow = {
  event_id: string;
  submission_id: string;
  revision_no: number | string;
  event_type: SupplyReviewEventRecord["eventType"];
  actor_id: string;
  reason_code: string | null;
  comment: string | null;
  created_at: string | Date;
};

type VehicleFleetAffiliationRow = {
  affiliation_id: string;
  vehicle_id: string;
  fleet_partner_id: string;
  affiliation_type: VehicleFleetAffiliationRecord["affiliationType"];
  effective_from: string | Date;
  effective_until: string | Date | null;
  status: VehicleFleetAffiliationRecord["status"];
  source_submission_id: string;
  created_at: string | Date;
  updated_at: string | Date;
};

type PlateLookupRow = {
  submission_id?: string;
  vehicle_id?: string;
};

export interface SupplyReviewEventRecord {
  eventId: string;
  submissionId: string;
  revisionNo: number;
  eventType:
    | "submitted"
    | "withdrawn"
    | "review_started"
    | "revision_requested"
    | "approved"
    | "rejected";
  actorId: string;
  reasonCode: string | null;
  comment: string | null;
  createdAt: string;
}

export type SupplySubmissionPersistenceState = {
  submissions: SupplySubmissionRecord[];
  driverDrafts: DriverSupplyDraft[];
  vehicleDrafts: VehicleSupplyDraft[];
  documents: SupplyDocumentRecord[];
  reviewEvents: SupplyReviewEventRecord[];
  vehicleAffiliations: VehicleFleetAffiliationRecord[];
};

export type PersistSupplySubmissionChanges = {
  submissions?: readonly SupplySubmissionRecord[];
  driverDrafts?: readonly DriverSupplyDraft[];
  vehicleDrafts?: readonly VehicleSupplyDraft[];
  documents?: readonly SupplyDocumentRecord[];
  reviewEvents?: readonly SupplyReviewEventRecord[];
  vehicleAffiliations?: readonly VehicleFleetAffiliationRecord[];
};

export type SupplySubmissionQueryExecutor = {
  query<T extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>;
};

export type TransitionSubmissionStatusParams = {
  submissionId: string;
  fleetPartnerId: string;
  expectedRevisionNo: number;
  nextStatus: SupplySubmissionStatus;
  allowedCurrentStatuses: readonly SupplySubmissionStatus[];
  submittedBy?: string | null;
  submittedAt?: string | null;
  reviewStartedBy?: string | null;
  reviewStartedAt?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewReasonCode?: string | null;
  reviewComment?: string | null;
  canonicalDriverId?: string | null;
  canonicalVehicleId?: string | null;
  canonicalContractId?: string | null;
  canonicalPolicyId?: string | null;
};

type MissingRelationFallback = { rows: [] };

@Injectable()
export class SupplySubmissionRepository {
  private readonly logger = new Logger(SupplySubmissionRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadState(): Promise<SupplySubmissionPersistenceState> {
    if (!this.isEnabled()) {
      return this.emptyState();
    }

    const [
      submissionsResult,
      driverDraftsResult,
      vehicleDraftsResult,
      documentsResult,
      reviewEventsResult,
      vehicleAffiliationsResult,
    ] = await Promise.all([
      this.loadQuery<SupplySubmissionRow>(
        "fleet.supply_submissions",
        `
          SELECT *
          FROM fleet.supply_submissions
          ORDER BY updated_at DESC, created_at DESC
        `,
      ),
      this.loadQuery<DriverSupplyDraftRow>(
        "fleet.driver_supply_drafts",
        `
          SELECT *
          FROM fleet.driver_supply_drafts
          ORDER BY updated_at DESC, submission_id
        `,
      ),
      this.loadQuery<VehicleSupplyDraftRow>(
        "fleet.vehicle_supply_drafts",
        `
          SELECT *
          FROM fleet.vehicle_supply_drafts
          ORDER BY updated_at DESC, submission_id
        `,
      ),
      this.loadQuery<SupplyDocumentRow>(
        "fleet.supply_documents",
        `
          SELECT *
          FROM fleet.supply_documents
          ORDER BY uploaded_at DESC, document_id
        `,
      ),
      this.loadQuery<SupplyReviewEventRow>(
        "fleet.supply_review_events",
        `
          SELECT *
          FROM fleet.supply_review_events
          ORDER BY created_at DESC, event_id
        `,
      ),
      this.loadQuery<VehicleFleetAffiliationRow>(
        "fleet.vehicle_fleet_affiliations",
        `
          SELECT *
          FROM fleet.vehicle_fleet_affiliations
          ORDER BY updated_at DESC, created_at DESC
        `,
      ),
    ]);

    return {
      submissions: submissionsResult.rows.map((row) =>
        this.mapSubmissionRow(row),
      ),
      driverDrafts: driverDraftsResult.rows.map((row) =>
        this.mapDriverDraftRow(row),
      ),
      vehicleDrafts: vehicleDraftsResult.rows.map((row) =>
        this.mapVehicleDraftRow(row),
      ),
      documents: documentsResult.rows.map((row) => this.mapDocumentRow(row)),
      reviewEvents: reviewEventsResult.rows.map((row) =>
        this.mapReviewEventRow(row),
      ),
      vehicleAffiliations: vehicleAffiliationsResult.rows.map((row) =>
        this.mapVehicleAffiliationRow(row),
      ),
    };
  }

  async persistChanges(changes: PersistSupplySubmissionChanges) {
    if (!this.isEnabled()) {
      return;
    }

    await this.persistChangesWithExecutor(this.databaseService!, changes);
  }

  async persistSubmissionWorkflow(
    executor: SupplySubmissionQueryExecutor,
    changes: PersistSupplySubmissionChanges,
  ) {
    await this.persistChangesWithExecutor(executor, changes);
  }

  async withTransaction<T>(work: (executor: PoolClient) => Promise<T>) {
    if (!this.isEnabled()) {
      throw new Error("DATABASE_URL is not configured");
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        this.logger.warn(
          `Supply submission transaction rollback failed: ${
            rollbackError instanceof Error
              ? rollbackError.message
              : String(rollbackError)
          }`,
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async lockSubmission(
    executor: SupplySubmissionQueryExecutor,
    submissionId: string,
  ) {
    const result = await executor.query<SupplySubmissionRow>(
      `
        SELECT *
        FROM fleet.supply_submissions
        WHERE submission_id = $1
        FOR UPDATE
      `,
      [submissionId],
    );

    const row = result.rows[0];
    if (!row) {
      throw this.notFound("Supply submission was not found.", { submissionId });
    }

    return this.mapSubmissionRow(row);
  }

  async loadFleetScopedSubmission(
    executor: SupplySubmissionQueryExecutor,
    submissionId: string,
    fleetPartnerId: string,
    options: { forUpdate?: boolean } = {},
  ) {
    const forUpdateClause = options.forUpdate ? "FOR UPDATE" : "";
    const result = await executor.query<SupplySubmissionRow>(
      `
        SELECT *
        FROM fleet.supply_submissions
        WHERE submission_id = $1
          AND fleet_partner_id = $2
        ${forUpdateClause}
      `,
      [submissionId, fleetPartnerId],
    );

    const row = result.rows[0];
    if (!row) {
      throw this.notFound(
        "Supply submission was not found in the fleet partner scope.",
        { submissionId, fleetPartnerId },
      );
    }

    return this.mapSubmissionRow(row);
  }

  async transitionSubmissionStatus(
    executor: SupplySubmissionQueryExecutor,
    params: TransitionSubmissionStatusParams,
  ) {
    const result = await executor.query<SupplySubmissionRow>(
      `
        UPDATE fleet.supply_submissions
        SET
          status = $4,
          revision_no = revision_no + 1,
          submitted_by = COALESCE($5, submitted_by),
          submitted_at = COALESCE($6, submitted_at),
          review_started_by = COALESCE($7, review_started_by),
          review_started_at = COALESCE($8, review_started_at),
          reviewed_by = COALESCE($9, reviewed_by),
          reviewed_at = COALESCE($10, reviewed_at),
          review_reason_code = COALESCE($11, review_reason_code),
          review_comment = COALESCE($12, review_comment),
          canonical_driver_id = COALESCE($13, canonical_driver_id),
          canonical_vehicle_id = COALESCE($14, canonical_vehicle_id),
          canonical_contract_id = COALESCE($15, canonical_contract_id),
          canonical_policy_id = COALESCE($16, canonical_policy_id),
          updated_at = now()
        WHERE submission_id = $1
          AND fleet_partner_id = $2
          AND revision_no = $3
          AND status = ANY($17::text[])
        RETURNING *
      `,
      [
        params.submissionId,
        params.fleetPartnerId,
        params.expectedRevisionNo,
        params.nextStatus,
        params.submittedBy ?? null,
        params.submittedAt ?? null,
        params.reviewStartedBy ?? null,
        params.reviewStartedAt ?? null,
        params.reviewedBy ?? null,
        params.reviewedAt ?? null,
        params.reviewReasonCode ?? null,
        params.reviewComment ?? null,
        params.canonicalDriverId ?? null,
        params.canonicalVehicleId ?? null,
        params.canonicalContractId ?? null,
        params.canonicalPolicyId ?? null,
        params.allowedCurrentStatuses,
      ],
    );

    const row = result.rows[0];
    if (row) {
      return this.mapSubmissionRow(row);
    }

    const current = await this.loadFleetScopedSubmission(
      executor,
      params.submissionId,
      params.fleetPartnerId,
      { forUpdate: true },
    );

    if (current.revisionNo !== params.expectedRevisionNo) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "REVISION_CONFLICT",
        "The supply submission revision is stale.",
        {
          submissionId: params.submissionId,
          fleetPartnerId: params.fleetPartnerId,
          expectedRevisionNo: params.expectedRevisionNo,
          actualRevisionNo: current.revisionNo,
        },
      );
    }

    throw new ApiRequestError(
      HttpStatus.CONFLICT,
      "INVALID_STATE_TRANSITION",
      "The supply submission status transition is not allowed.",
      {
        submissionId: params.submissionId,
        fleetPartnerId: params.fleetPartnerId,
        currentStatus: current.status,
        nextStatus: params.nextStatus,
        allowedCurrentStatuses: [...params.allowedCurrentStatuses],
      },
    );
  }

  async assertVehiclePlateAvailable(
    executor: SupplySubmissionQueryExecutor,
    fleetPartnerId: string,
    plateNo: string,
    excludeSubmissionId?: string,
  ) {
    const draftResult = await executor.query<PlateLookupRow>(
      `
        SELECT d.submission_id
        FROM fleet.vehicle_supply_drafts d
        INNER JOIN fleet.supply_submissions s
          ON s.submission_id = d.submission_id
        WHERE s.fleet_partner_id = $1
          AND lower(d.plate_no) = lower($2)
          AND ($3::uuid IS NULL OR d.submission_id <> $3::uuid)
        LIMIT 1
      `,
      [fleetPartnerId, plateNo, excludeSubmissionId ?? null],
    );

    if (draftResult.rows[0]?.submission_id) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "DUPLICATE_PLATE",
        "A vehicle draft with the same plate already exists for this fleet partner.",
        {
          fleetPartnerId,
          plateNo,
          existingSubmissionId: draftResult.rows[0].submission_id,
        },
      );
    }

    const registryResult = await this.loadExecutorQuery<PlateLookupRow>(
      executor,
      "reg.phase1_registry_vehicles",
      `
        SELECT vehicle_id
        FROM reg.phase1_registry_vehicles
        WHERE lower(plate_no) = lower($1)
        LIMIT 1
      `,
      [plateNo],
    );

    return {
      canonicalVehicleId: registryResult.rows[0]?.vehicle_id ?? null,
    };
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Supply submission persistence skipped during ${context}: ${detail}`,
    );
  }

  private emptyState(): SupplySubmissionPersistenceState {
    return {
      submissions: [],
      driverDrafts: [],
      vehicleDrafts: [],
      documents: [],
      reviewEvents: [],
      vehicleAffiliations: [],
    };
  }

  private async loadQuery<T extends QueryResultRow>(
    relationName: string,
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T> | MissingRelationFallback> {
    return this.loadExecutorQuery(this.databaseService!, relationName, text, values);
  }

  private async loadExecutorQuery<T extends QueryResultRow>(
    executor: SupplySubmissionQueryExecutor,
    relationName: string,
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T> | MissingRelationFallback> {
    try {
      return await executor.query<T>(text, values);
    } catch (error) {
      const code =
        error && typeof error === "object"
          ? (error as { code?: string }).code
          : undefined;
      if (code === "42P01") {
        this.logger.warn(
          `Supply submission load skipped a missing relation ${relationName}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return { rows: [] };
      }
      throw error;
    }
  }

  private async persistChangesWithExecutor(
    executor: SupplySubmissionQueryExecutor,
    changes: PersistSupplySubmissionChanges,
  ) {
    await this.persistSubmissions(executor, changes.submissions ?? []);
    await this.persistDriverDrafts(executor, changes.driverDrafts ?? []);
    await this.persistVehicleDrafts(executor, changes.vehicleDrafts ?? []);
    await this.persistDocuments(executor, changes.documents ?? []);
    await this.persistReviewEvents(executor, changes.reviewEvents ?? []);
    await this.persistVehicleAffiliations(
      executor,
      changes.vehicleAffiliations ?? [],
    );
  }

  private async persistSubmissions(
    executor: SupplySubmissionQueryExecutor,
    submissions: readonly SupplySubmissionRecord[],
  ) {
    for (const submission of submissions) {
      await executor.query(
        `
          INSERT INTO fleet.supply_submissions (
            submission_id,
            fleet_partner_id,
            submission_type,
            status,
            revision_no,
            subject_driver_id,
            subject_vehicle_id,
            submitted_by,
            submitted_at,
            review_started_by,
            review_started_at,
            reviewed_by,
            reviewed_at,
            review_reason_code,
            review_comment,
            canonical_driver_id,
            canonical_vehicle_id,
            canonical_contract_id,
            canonical_policy_id,
            created_at,
            updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
            $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
          )
          ON CONFLICT (submission_id) DO UPDATE SET
            fleet_partner_id = EXCLUDED.fleet_partner_id,
            submission_type = EXCLUDED.submission_type,
            status = EXCLUDED.status,
            revision_no = EXCLUDED.revision_no,
            subject_driver_id = EXCLUDED.subject_driver_id,
            subject_vehicle_id = EXCLUDED.subject_vehicle_id,
            submitted_by = EXCLUDED.submitted_by,
            submitted_at = EXCLUDED.submitted_at,
            review_started_by = EXCLUDED.review_started_by,
            review_started_at = EXCLUDED.review_started_at,
            reviewed_by = EXCLUDED.reviewed_by,
            reviewed_at = EXCLUDED.reviewed_at,
            review_reason_code = EXCLUDED.review_reason_code,
            review_comment = EXCLUDED.review_comment,
            canonical_driver_id = EXCLUDED.canonical_driver_id,
            canonical_vehicle_id = EXCLUDED.canonical_vehicle_id,
            canonical_contract_id = EXCLUDED.canonical_contract_id,
            canonical_policy_id = EXCLUDED.canonical_policy_id,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at
        `,
        [
          submission.submissionId,
          submission.fleetPartnerId,
          submission.submissionType,
          submission.status,
          submission.revisionNo,
          submission.subjectDriverId,
          submission.subjectVehicleId,
          submission.submittedBy,
          submission.submittedAt,
          submission.reviewStartedBy,
          submission.reviewStartedAt,
          submission.reviewedBy,
          submission.reviewedAt,
          submission.reviewReasonCode,
          submission.reviewComment,
          submission.canonicalDriverId,
          submission.canonicalVehicleId,
          submission.canonicalContractId,
          submission.canonicalPolicyId,
          submission.createdAt,
          submission.updatedAt,
        ],
      );
    }
  }

  private async persistDriverDrafts(
    executor: SupplySubmissionQueryExecutor,
    drafts: readonly DriverSupplyDraft[],
  ) {
    for (const draft of drafts) {
      await executor.query(
        `
          INSERT INTO fleet.driver_supply_drafts (
            submission_id,
            name,
            mobile,
            professional_driver_license_no,
            professional_driver_license_expiry,
            taxi_driver_registration_no,
            taxi_driver_registration_area,
            taxi_driver_registration_expiry,
            supported_service_product_codes,
            preferred_vehicle_submission_id,
            updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, now()
          )
          ON CONFLICT (submission_id) DO UPDATE SET
            name = EXCLUDED.name,
            mobile = EXCLUDED.mobile,
            professional_driver_license_no = EXCLUDED.professional_driver_license_no,
            professional_driver_license_expiry = EXCLUDED.professional_driver_license_expiry,
            taxi_driver_registration_no = EXCLUDED.taxi_driver_registration_no,
            taxi_driver_registration_area = EXCLUDED.taxi_driver_registration_area,
            taxi_driver_registration_expiry = EXCLUDED.taxi_driver_registration_expiry,
            supported_service_product_codes = EXCLUDED.supported_service_product_codes,
            preferred_vehicle_submission_id = EXCLUDED.preferred_vehicle_submission_id,
            updated_at = now()
        `,
        [
          draft.submissionId,
          draft.name,
          draft.mobile,
          draft.professionalDriverLicenseNo,
          draft.professionalDriverLicenseExpiry,
          draft.taxiDriverRegistrationNo,
          draft.taxiDriverRegistrationArea,
          draft.taxiDriverRegistrationExpiry,
          JSON.stringify(draft.supportedServiceProductCodes),
          draft.preferredVehicleSubmissionId,
        ],
      );
    }
  }

  private async persistVehicleDrafts(
    executor: SupplySubmissionQueryExecutor,
    drafts: readonly VehicleSupplyDraft[],
  ) {
    for (const draft of drafts) {
      await executor.query(
        `
          INSERT INTO fleet.vehicle_supply_drafts (
            submission_id,
            plate_no,
            license_type,
            brand,
            model,
            model_year,
            seat_count,
            luggage_capacity,
            business_area,
            supported_service_product_codes,
            airport_transfer_eligible,
            fixed_fare_allowed,
            current_driver_submission_id,
            updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, now()
          )
          ON CONFLICT (submission_id) DO UPDATE SET
            plate_no = EXCLUDED.plate_no,
            license_type = EXCLUDED.license_type,
            brand = EXCLUDED.brand,
            model = EXCLUDED.model,
            model_year = EXCLUDED.model_year,
            seat_count = EXCLUDED.seat_count,
            luggage_capacity = EXCLUDED.luggage_capacity,
            business_area = EXCLUDED.business_area,
            supported_service_product_codes = EXCLUDED.supported_service_product_codes,
            airport_transfer_eligible = EXCLUDED.airport_transfer_eligible,
            fixed_fare_allowed = EXCLUDED.fixed_fare_allowed,
            current_driver_submission_id = EXCLUDED.current_driver_submission_id,
            updated_at = now()
        `,
        [
          draft.submissionId,
          draft.plateNo,
          draft.licenseType,
          draft.brand,
          draft.model,
          draft.modelYear,
          draft.seatCount,
          draft.luggageCapacity,
          draft.businessArea,
          JSON.stringify(draft.supportedServiceProductCodes),
          draft.airportTransferEligible,
          draft.fixedFareAllowed,
          draft.currentDriverSubmissionId,
        ],
      );
    }
  }

  private async persistDocuments(
    executor: SupplySubmissionQueryExecutor,
    documents: readonly SupplyDocumentRecord[],
  ) {
    for (const document of documents) {
      await executor.query(
        `
          INSERT INTO fleet.supply_documents (
            document_id,
            fleet_partner_id,
            submission_id,
            document_type,
            file_object_key,
            original_file_name,
            content_type,
            file_size,
            checksum_sha256,
            effective_from,
            effective_until,
            review_status,
            review_comment,
            uploaded_by,
            uploaded_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
          )
          ON CONFLICT (document_id) DO UPDATE SET
            fleet_partner_id = EXCLUDED.fleet_partner_id,
            submission_id = EXCLUDED.submission_id,
            document_type = EXCLUDED.document_type,
            file_object_key = EXCLUDED.file_object_key,
            original_file_name = EXCLUDED.original_file_name,
            content_type = EXCLUDED.content_type,
            file_size = EXCLUDED.file_size,
            checksum_sha256 = EXCLUDED.checksum_sha256,
            effective_from = EXCLUDED.effective_from,
            effective_until = EXCLUDED.effective_until,
            review_status = EXCLUDED.review_status,
            review_comment = EXCLUDED.review_comment,
            uploaded_by = EXCLUDED.uploaded_by,
            uploaded_at = EXCLUDED.uploaded_at
        `,
        [
          document.documentId,
          document.fleetPartnerId,
          document.submissionId,
          document.documentType,
          document.fileObjectKey,
          document.originalFileName,
          document.contentType,
          document.fileSize,
          document.checksumSha256,
          document.effectiveFrom,
          document.effectiveUntil,
          document.reviewStatus,
          document.reviewComment,
          document.uploadedBy,
          document.uploadedAt,
        ],
      );
    }
  }

  private async persistReviewEvents(
    executor: SupplySubmissionQueryExecutor,
    events: readonly SupplyReviewEventRecord[],
  ) {
    for (const event of events) {
      await executor.query(
        `
          INSERT INTO fleet.supply_review_events (
            event_id,
            submission_id,
            revision_no,
            event_type,
            actor_id,
            reason_code,
            comment,
            created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8
          )
          ON CONFLICT (event_id) DO UPDATE SET
            submission_id = EXCLUDED.submission_id,
            revision_no = EXCLUDED.revision_no,
            event_type = EXCLUDED.event_type,
            actor_id = EXCLUDED.actor_id,
            reason_code = EXCLUDED.reason_code,
            comment = EXCLUDED.comment,
            created_at = EXCLUDED.created_at
        `,
        [
          event.eventId,
          event.submissionId,
          event.revisionNo,
          event.eventType,
          event.actorId,
          event.reasonCode,
          event.comment,
          event.createdAt,
        ],
      );
    }
  }

  private async persistVehicleAffiliations(
    executor: SupplySubmissionQueryExecutor,
    affiliations: readonly VehicleFleetAffiliationRecord[],
  ) {
    for (const affiliation of affiliations) {
      await executor.query(
        `
          INSERT INTO fleet.vehicle_fleet_affiliations (
            affiliation_id,
            vehicle_id,
            fleet_partner_id,
            affiliation_type,
            effective_from,
            effective_until,
            status,
            source_submission_id,
            created_at,
            updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
          )
          ON CONFLICT (affiliation_id) DO UPDATE SET
            vehicle_id = EXCLUDED.vehicle_id,
            fleet_partner_id = EXCLUDED.fleet_partner_id,
            affiliation_type = EXCLUDED.affiliation_type,
            effective_from = EXCLUDED.effective_from,
            effective_until = EXCLUDED.effective_until,
            status = EXCLUDED.status,
            source_submission_id = EXCLUDED.source_submission_id,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at
        `,
        [
          affiliation.affiliationId,
          affiliation.vehicleId,
          affiliation.fleetPartnerId,
          affiliation.affiliationType,
          affiliation.effectiveFrom,
          affiliation.effectiveUntil,
          affiliation.status,
          affiliation.sourceSubmissionId,
          affiliation.createdAt,
          affiliation.updatedAt,
        ],
      );
    }
  }

  private mapSubmissionRow(row: SupplySubmissionRow): SupplySubmissionRecord {
    return {
      submissionId: row.submission_id,
      fleetPartnerId: row.fleet_partner_id,
      submissionType: row.submission_type,
      status: row.status,
      revisionNo: Number(row.revision_no),
      subjectDriverId: row.subject_driver_id,
      subjectVehicleId: row.subject_vehicle_id,
      submittedBy: row.submitted_by,
      submittedAt: this.toIsoString(row.submitted_at),
      reviewStartedBy: row.review_started_by,
      reviewStartedAt: this.toIsoString(row.review_started_at),
      reviewedBy: row.reviewed_by,
      reviewedAt: this.toIsoString(row.reviewed_at),
      reviewReasonCode: row.review_reason_code,
      reviewComment: row.review_comment,
      canonicalDriverId: row.canonical_driver_id,
      canonicalVehicleId: row.canonical_vehicle_id,
      canonicalContractId: row.canonical_contract_id,
      canonicalPolicyId: row.canonical_policy_id,
      createdAt: this.requireIsoString(row.created_at),
      updatedAt: this.requireIsoString(row.updated_at),
    };
  }

  private mapDriverDraftRow(row: DriverSupplyDraftRow): DriverSupplyDraft {
    return {
      submissionId: row.submission_id,
      name: row.name,
      mobile: row.mobile,
      professionalDriverLicenseNo: row.professional_driver_license_no,
      professionalDriverLicenseExpiry: this.requireDateOnlyString(
        row.professional_driver_license_expiry,
      ),
      taxiDriverRegistrationNo: row.taxi_driver_registration_no,
      taxiDriverRegistrationArea: row.taxi_driver_registration_area,
      taxiDriverRegistrationExpiry: this.requireDateOnlyString(
        row.taxi_driver_registration_expiry,
      ),
      supportedServiceProductCodes: this.toStringArray(
        row.supported_service_product_codes,
      ),
      preferredVehicleSubmissionId: row.preferred_vehicle_submission_id,
    };
  }

  private mapVehicleDraftRow(row: VehicleSupplyDraftRow): VehicleSupplyDraft {
    return {
      submissionId: row.submission_id,
      plateNo: row.plate_no,
      licenseType: row.license_type,
      brand: row.brand,
      model: row.model,
      modelYear:
        row.model_year === null ? null : Number(row.model_year),
      seatCount: Number(row.seat_count),
      luggageCapacity: Number(row.luggage_capacity),
      businessArea: row.business_area,
      supportedServiceProductCodes: this.toStringArray(
        row.supported_service_product_codes,
      ),
      airportTransferEligible: row.airport_transfer_eligible,
      fixedFareAllowed: row.fixed_fare_allowed,
      currentDriverSubmissionId: row.current_driver_submission_id,
    };
  }

  private mapDocumentRow(row: SupplyDocumentRow): SupplyDocumentRecord {
    return {
      documentId: row.document_id,
      fleetPartnerId: row.fleet_partner_id,
      submissionId: row.submission_id,
      documentType: row.document_type,
      fileObjectKey: row.file_object_key,
      originalFileName: row.original_file_name,
      contentType: row.content_type,
      fileSize: Number(row.file_size),
      checksumSha256: row.checksum_sha256,
      effectiveFrom: this.toDateOnlyString(row.effective_from),
      effectiveUntil: this.toDateOnlyString(row.effective_until),
      reviewStatus: row.review_status,
      reviewComment: row.review_comment,
      uploadedBy: row.uploaded_by,
      uploadedAt: this.requireIsoString(row.uploaded_at),
    };
  }

  private mapReviewEventRow(row: SupplyReviewEventRow): SupplyReviewEventRecord {
    return {
      eventId: row.event_id,
      submissionId: row.submission_id,
      revisionNo: Number(row.revision_no),
      eventType: row.event_type,
      actorId: row.actor_id,
      reasonCode: row.reason_code,
      comment: row.comment,
      createdAt: this.requireIsoString(row.created_at),
    };
  }

  private mapVehicleAffiliationRow(
    row: VehicleFleetAffiliationRow,
  ): VehicleFleetAffiliationRecord {
    return {
      affiliationId: row.affiliation_id,
      vehicleId: row.vehicle_id,
      fleetPartnerId: row.fleet_partner_id,
      affiliationType: row.affiliation_type,
      effectiveFrom: this.requireIsoString(row.effective_from),
      effectiveUntil: this.toIsoString(row.effective_until),
      status: row.status,
      sourceSubmissionId: row.source_submission_id,
      createdAt: this.requireIsoString(row.created_at),
      updatedAt: this.requireIsoString(row.updated_at),
    };
  }

  private toIsoString(value: string | Date | null): string | null {
    if (!value) {
      return null;
    }

    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  private requireIsoString(value: string | Date): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  private toDateOnlyString(value: string | Date | null): string | null {
    if (!value) {
      return null;
    }

    const iso = value instanceof Date ? value.toISOString() : new Date(value).toISOString();
    return iso.slice(0, 10);
  }

  private requireDateOnlyString(value: string | Date): string {
    return this.toDateOnlyString(value) ?? "";
  }

  private toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string");
    }

    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (item): item is string => typeof item === "string",
          );
        }
      } catch {
        return [];
      }
    }

    return [];
  }

  private notFound(message: string, details?: Record<string, unknown>) {
    return new ApiRequestError(HttpStatus.NOT_FOUND, "NOT_FOUND", message, details);
  }
}
