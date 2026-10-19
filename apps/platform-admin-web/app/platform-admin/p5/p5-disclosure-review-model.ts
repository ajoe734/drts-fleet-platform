import type { ApiClient } from "@drts/api-client";
import type {
  AuditLogRecord,
  DriverPublicRegistrationCredential,
  VehiclePassengerDisclosureProfile,
} from "@drts/contracts";

// App-local wire DTOs use canonical shared record contracts. Web deployments
// build independently of API app Source; runtime endpoints and fields are unchanged.
type DisclosureSubjectType = "vehicle" | "driver";
type DisclosureRecord =
  | VehiclePassengerDisclosureProfile
  | DriverPublicRegistrationCredential;
export interface DisclosureReviewCommand {
  expectedVersion: number;
  sourceSubmissionId: string | null;
  action: "approve" | "return";
  reason: string;
}
interface DisclosureReviewDecision {
  decisionId: string;
  operationKey: string;
  payloadHash: string;
  actorId: string;
  actorType: AuditLogRecord["actorType"];
  subjectType: DisclosureSubjectType;
  subjectId: string;
  action: "approve" | "return";
  reason: string;
  sourceSubmissionId: string | null;
  fromVersion: number;
  toVersion: number;
  decidedAt: string;
  record: DisclosureRecord;
  previousRecord: DisclosureRecord;
}
export interface DisclosureReviewItem {
  subjectType: DisclosureSubjectType;
  subjectId: string;
  label: string;
  sourceSubmissionId: string | null;
  version: number;
  record: DisclosureRecord;
  missingFieldCodes: string[];
  history: DisclosureReviewDecision[];
}
export const disclosureReviewKey = (item: DisclosureReviewItem) =>
  `${item.subjectType}:${item.subjectId}`;
export function listDisclosureReviews(client: Pick<ApiClient, "get">) {
  return client.get<{ items: DisclosureReviewItem[] }>(
    "/api/regulatory-registry/disclosure-reviews",
  );
}
export function getDisclosureReview(
  client: Pick<ApiClient, "get">,
  item: Pick<DisclosureReviewItem, "subjectType" | "subjectId">,
) {
  return client.get<DisclosureReviewItem>(
    `/api/regulatory-registry/disclosure-reviews/${item.subjectType}/${encodeURIComponent(item.subjectId)}`,
  );
}
export function decideDisclosureReview(
  client: Pick<ApiClient, "post">,
  item: DisclosureReviewItem,
  command: DisclosureReviewCommand,
  key: string,
) {
  return client.post<{ subject: DisclosureReviewItem }>(
    `/api/regulatory-registry/disclosure-reviews/${item.subjectType}/${encodeURIComponent(item.subjectId)}`,
    { body: command, idempotencyKey: key },
  );
}

export function disclosureReviewFailure(error: unknown): {
  kind: "denied" | "missing" | "unavailable";
  message: string;
} {
  const status =
    error && typeof error === "object" && "statusCode" in error
      ? error.statusCode
      : null;
  return {
    kind:
      status === 401 || status === 403
        ? "denied"
        : status === 404
          ? "missing"
          : "unavailable",
    message: error instanceof Error ? error.message : String(error),
  };
}
