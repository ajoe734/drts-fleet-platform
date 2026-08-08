import type { ApiClient } from "@drts/api-client";
import type {
  SupplySubmissionRecord,
  SupplySubmissionStatus,
  SupplySubmissionType,
} from "@drts/contracts";

export type SupplyReviewAction =
  | "start"
  | "request-revision"
  | "approve"
  | "reject";

export type SupplyReviewCommand = {
  expectedRevisionNo: number;
  reasonCode: string;
  comment?: string;
};

export type SupplyReviewFailure =
  | "forbidden"
  | "unauthenticated"
  | "not_found"
  | "revision_conflict"
  | "incomplete"
  | "request_failed";

export const SUPPLY_REVIEW_STATUSES: readonly SupplySubmissionStatus[] = [
  "submitted",
  "in_review",
  "needs_revision",
  "approved",
  "rejected",
  "withdrawn",
];

function isSupplyStatus(value: unknown): value is SupplySubmissionStatus {
  return (
    typeof value === "string" &&
    SUPPLY_REVIEW_STATUSES.includes(value as SupplySubmissionStatus)
  );
}

function isSubmissionType(value: unknown): value is SupplySubmissionType {
  return (
    typeof value === "string" &&
    [
      "driver_onboarding",
      "vehicle_onboarding",
      "insurance_update",
      "contract_update",
      "driver_affiliation",
      "vehicle_affiliation",
    ].includes(value)
  );
}

function recordOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Supply review response is not an object.");
  }
  return value as Record<string, unknown>;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function normalizeSupplySubmission(
  value: unknown,
): SupplySubmissionRecord {
  const input = recordOf(value);
  if (
    typeof input.submissionId !== "string" ||
    !isSubmissionType(input.submissionType) ||
    !isSupplyStatus(input.status) ||
    !Number.isInteger(input.revisionNo)
  ) {
    throw new Error("Supply review response has an invalid submission shape.");
  }
  return {
    submissionId: input.submissionId,
    fleetPartnerId:
      typeof input.fleetPartnerId === "string" ? input.fleetPartnerId : "",
    submissionType: input.submissionType,
    status: input.status,
    revisionNo: input.revisionNo as number,
    subjectDriverId: stringOrNull(input.subjectDriverId),
    subjectVehicleId: stringOrNull(input.subjectVehicleId),
    submittedBy: stringOrNull(input.submittedBy),
    submittedAt: stringOrNull(input.submittedAt),
    reviewStartedBy: stringOrNull(input.reviewStartedBy),
    reviewStartedAt: stringOrNull(input.reviewStartedAt),
    reviewedBy: stringOrNull(input.reviewedBy),
    reviewedAt: stringOrNull(input.reviewedAt),
    reviewReasonCode: stringOrNull(input.reviewReasonCode),
    reviewComment: stringOrNull(input.reviewComment),
    canonicalDriverId: stringOrNull(input.canonicalDriverId),
    canonicalVehicleId: stringOrNull(input.canonicalVehicleId),
    canonicalContractId: stringOrNull(input.canonicalContractId),
    canonicalPolicyId: stringOrNull(input.canonicalPolicyId),
    createdAt: typeof input.createdAt === "string" ? input.createdAt : "",
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : "",
  };
}

export async function listSupplyReviewSubmissions(client: ApiClient) {
  const data = await client.get<unknown>(
    "/api/admin/supply-review/submissions",
  );
  const records = Array.isArray(data) ? data : recordOf(data).items;
  if (!Array.isArray(records))
    throw new Error("Supply review list response has no items.");
  return records.map(normalizeSupplySubmission);
}

export async function getSupplyReviewSubmission(
  client: ApiClient,
  submissionId: string,
) {
  return normalizeSupplySubmission(
    await client.get<unknown>(
      `/api/admin/supply-review/submissions/${encodeURIComponent(submissionId)}`,
    ),
  );
}

export async function mutateSupplyReview(
  client: ApiClient,
  submissionId: string,
  action: SupplyReviewAction,
  command: SupplyReviewCommand,
) {
  return normalizeSupplySubmission(
    await client.post<unknown>(
      `/api/admin/supply-review/submissions/${encodeURIComponent(submissionId)}/${action}`,
      { body: command },
    ),
  );
}

export function classifySupplyReviewFailure(
  error: unknown,
): SupplyReviewFailure {
  const candidate = error as {
    statusCode?: unknown;
    code?: unknown;
    message?: unknown;
  };
  if (
    candidate?.code === "SUBMISSION_REVISION_CONFLICT" ||
    candidate?.statusCode === 409
  )
    return "revision_conflict";
  if (
    candidate?.code === "SUBMISSION_INCOMPLETE" ||
    candidate?.code === "DOCUMENT_REQUIRED" ||
    candidate?.code === "DOCUMENT_EXPIRED"
  )
    return "incomplete";
  if (candidate?.statusCode === 401) return "unauthenticated";
  if (candidate?.statusCode === 403) return "forbidden";
  if (candidate?.statusCode === 404) return "not_found";
  return "request_failed";
}
