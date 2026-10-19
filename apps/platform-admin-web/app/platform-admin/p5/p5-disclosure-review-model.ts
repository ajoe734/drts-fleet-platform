import type { ApiClient } from "@drts/api-client";
export type {
  DisclosureReviewItem,
  DisclosureReviewCommand,
} from "../../../../api/src/modules/regulatory-registry/disclosure-review.types";
import type {
  DisclosureReviewItem,
  DisclosureReviewCommand,
} from "../../../../api/src/modules/regulatory-registry/disclosure-review.types";
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
