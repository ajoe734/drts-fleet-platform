import type {
  ApiSuccessEnvelope,
  DriverRatingAuthorityView,
  DriverRatingSummary,
  InvalidatePassengerTripRatingCommand,
  InvalidatePassengerTripRatingResult,
  PassengerRatingModerationAuditRecord,
  PassengerRatingModerationView,
  PassengerRatingReviewDetail,
  PassengerRatingReviewListData,
  PassengerRatingReviewListItem,
  RatingGovernanceActionDescriptor,
  RatingGovernanceRefreshState,
} from "@drts/contracts";

export const RATING_REVIEW_STATUSES = [
  "active",
  "under_review",
  "invalidated",
] as const;
export type RatingReviewStatus = (typeof RATING_REVIEW_STATUSES)[number];

export type RatingReviewFilters = {
  status: "" | RatingReviewStatus;
  score: "" | "1" | "2" | "3" | "4" | "5";
  tag: string;
  driverId: string;
  tripOrOrder: string;
  from: string;
  to: string;
};

export type RatingRefreshState = RatingGovernanceRefreshState;
export type RatingReviewRow = PassengerRatingReviewListItem;
export type RatingReviewList = PassengerRatingReviewListData;
export type RatingActionDescriptor = RatingGovernanceActionDescriptor;
export type RatingReviewDetail = PassengerRatingReviewDetail;
export type { DriverRatingAuthorityView };

export type RatingReadFailure =
  | "forbidden"
  | "unauthenticated"
  | "not_found"
  | "request_failed";

export interface RatingApiClient {
  getEnvelope<T>(
    path: string,
    options?: { signal?: AbortSignal },
  ): Promise<ApiSuccessEnvelope<T>>;
  post<T>(
    path: string,
    options?: {
      body?: unknown;
      headers?: Record<string, string>;
    },
  ): Promise<T>;
}

export class RatingReadModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RatingReadModelError";
  }
}

function recordOf(value: unknown, context: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RatingReadModelError(`${context} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function stringOf(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RatingReadModelError(`${field} must be a non-empty string.`);
  }
  return value;
}

function nullableStringOf(value: unknown, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new RatingReadModelError(`${field} must be a string or null.`);
  }
  return value.trim().length > 0 ? value : null;
}

function integerOf(value: unknown, field: string, minimum = 0): number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw new RatingReadModelError(
      `${field} must be an integer greater than or equal to ${minimum}.`,
    );
  }
  return value as number;
}

function isoOf(value: unknown, field: string): string {
  const input = stringOf(value, field);
  if (!Number.isFinite(Date.parse(input))) {
    throw new RatingReadModelError(`${field} must be an ISO timestamp.`);
  }
  return input;
}

function statusOf(value: unknown, field: string): RatingReviewStatus {
  if (
    typeof value !== "string" ||
    !RATING_REVIEW_STATUSES.includes(value as RatingReviewStatus)
  ) {
    throw new RatingReadModelError(`${field} is not a rating review status.`);
  }
  return value as RatingReviewStatus;
}

function scoreOf(value: unknown, field: string): 1 | 2 | 3 | 4 | 5 {
  if (
    !Number.isInteger(value) ||
    (value as number) < 1 ||
    (value as number) > 5
  ) {
    throw new RatingReadModelError(`${field} must be an integer from 1 to 5.`);
  }
  return value as 1 | 2 | 3 | 4 | 5;
}

function stringsOf(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new RatingReadModelError(`${field} must be a string array.`);
  }
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

function parseRefresh(
  value: unknown,
  envelopeTimestamp: string,
): RatingRefreshState {
  const record =
    value === undefined || value === null
      ? {}
      : recordOf(value, "rating refresh");
  const generatedAt =
    record.generatedAt === undefined
      ? isoOf(envelopeTimestamp, "meta.timestamp")
      : isoOf(record.generatedAt, "refresh.generatedAt");
  const staleAfterMs =
    record.staleAfterMs === undefined
      ? 300_000
      : integerOf(record.staleAfterMs, "refresh.staleAfterMs", 1);
  const staleByAge = Date.now() - Date.parse(generatedAt) > staleAfterMs;
  return {
    generatedAt,
    staleAfterMs,
    stale: record.stale === true || staleByAge,
  };
}

function parseSummary(value: unknown): DriverRatingSummary {
  const record = recordOf(value, "driver rating summary");
  const displayState = record.displayState;
  if (
    displayState !== "rated" &&
    displayState !== "new_driver" &&
    displayState !== "unavailable"
  ) {
    throw new RatingReadModelError(
      "driverRatingSummary.displayState is invalid.",
    );
  }
  const ratingCount = integerOf(
    record.ratingCount,
    "driverRatingSummary.ratingCount",
  );
  const averageRating =
    record.averageRating === null
      ? null
      : typeof record.averageRating === "number" &&
          record.averageRating >= 1 &&
          record.averageRating <= 5
        ? record.averageRating
        : (() => {
            throw new RatingReadModelError(
              "driverRatingSummary.averageRating is invalid.",
            );
          })();
  if (
    (displayState === "rated" &&
      (averageRating === null || ratingCount === 0)) ||
    (displayState === "new_driver" &&
      (averageRating !== null || ratingCount !== 0)) ||
    (displayState === "unavailable" && averageRating !== null)
  ) {
    throw new RatingReadModelError(
      "driverRatingSummary contains a non-canonical state.",
    );
  }
  return {
    driverId: stringOf(record.driverId, "driverRatingSummary.driverId"),
    displayState,
    averageRating,
    ratingCount,
    lastRatedAt:
      record.lastRatedAt === null
        ? null
        : isoOf(record.lastRatedAt, "driverRatingSummary.lastRatedAt"),
    aggregateVersion: integerOf(
      record.aggregateVersion,
      "driverRatingSummary.aggregateVersion",
      1,
    ),
    calculatedAt: isoOf(
      record.calculatedAt,
      "driverRatingSummary.calculatedAt",
    ),
  };
}

function parseRating(value: unknown): PassengerRatingModerationView {
  const record = recordOf(value, "rating");
  return {
    ratingId: stringOf(record.ratingId, "rating.ratingId"),
    orderId: stringOf(record.orderId, "rating.orderId"),
    tripId: stringOf(record.tripId, "rating.tripId"),
    driverId: stringOf(record.driverId, "rating.driverId"),
    score: scoreOf(record.score, "rating.score"),
    tags: stringsOf(record.tags, "rating.tags"),
    comment: nullableStringOf(record.comment, "rating.comment"),
    status: statusOf(record.status, "rating.status"),
    submittedAt: isoOf(record.submittedAt, "rating.submittedAt"),
    updatedAt: isoOf(record.updatedAt, "rating.updatedAt"),
  };
}

function parseAudit(value: unknown): PassengerRatingModerationAuditRecord {
  const record = recordOf(value, "moderation audit");
  if (
    record.action !== "invalidate" ||
    record.resultingStatus !== "invalidated"
  ) {
    throw new RatingReadModelError("moderation audit action is invalid.");
  }
  return {
    auditId: stringOf(record.auditId, "audit.auditId"),
    ratingId: stringOf(record.ratingId, "audit.ratingId"),
    action: "invalidate",
    reason: stringOf(record.reason, "audit.reason"),
    actorId: stringOf(record.actorId, "audit.actorId"),
    idempotencyKey: stringOf(record.idempotencyKey, "audit.idempotencyKey"),
    previousStatus: statusOf(record.previousStatus, "audit.previousStatus"),
    resultingStatus: "invalidated",
    aggregateVersion: integerOf(
      record.aggregateVersion,
      "audit.aggregateVersion",
      1,
    ),
    requestId: nullableStringOf(record.requestId, "audit.requestId"),
    createdAt: isoOf(record.createdAt, "audit.createdAt"),
  };
}

function parseReviewRow(value: unknown): RatingReviewRow {
  const record = recordOf(value, "rating review row");
  return {
    ratingId: stringOf(record.ratingId, "row.ratingId"),
    orderId: stringOf(record.orderId, "row.orderId"),
    tripId: stringOf(record.tripId, "row.tripId"),
    driverId: stringOf(record.driverId, "row.driverId"),
    driverDisplayName: nullableStringOf(
      record.driverDisplayName,
      "row.driverDisplayName",
    ),
    score: scoreOf(record.score, "row.score"),
    tags: stringsOf(record.tags, "row.tags"),
    commentExcerpt: nullableStringOf(
      record.commentExcerpt,
      "row.commentExcerpt",
    ),
    status: statusOf(record.status, "row.status"),
    submittedAt: isoOf(record.submittedAt, "row.submittedAt"),
    updatedAt: isoOf(record.updatedAt, "row.updatedAt"),
  };
}

function maskedSubjectOf(value: unknown): string | null {
  const subject = nullableStringOf(value, "passengerSubjectMasked");
  if (!subject) {
    return null;
  }
  return /[*•…]/u.test(subject) || subject.includes("...") ? subject : null;
}

function actionOf(value: unknown): RatingActionDescriptor {
  if (value === undefined || value === null) {
    return {
      enabled: false,
      disabledReason: "command_not_advertised",
    };
  }
  const record = recordOf(value, "invalidate action");
  return {
    enabled: record.enabled === true,
    disabledReason: nullableStringOf(
      record.disabledReason,
      "invalidate.disabledReason",
    ),
  };
}

export function buildRatingReviewQuery(filters: RatingReviewFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.score) params.set("score", filters.score);
  if (filters.tag.trim()) params.set("tag", filters.tag.trim());
  if (filters.driverId.trim()) params.set("driverId", filters.driverId.trim());
  if (filters.tripOrOrder.trim()) {
    params.set("tripOrOrder", filters.tripOrOrder.trim());
  }
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const query = params.toString();
  return `/api/platform-admin/multi-taxi-ratings${query ? `?${query}` : ""}`;
}

export async function listRatingReviews(
  client: RatingApiClient,
  filters: RatingReviewFilters,
  signal?: AbortSignal,
): Promise<RatingReviewList> {
  const envelope = await client.getEnvelope<unknown>(
    buildRatingReviewQuery(filters),
    signal ? { signal } : undefined,
  );
  const data = recordOf(envelope.data, "rating review list");
  if (!Array.isArray(data.items)) {
    throw new RatingReadModelError(
      "rating review list items must be an array.",
    );
  }
  const pageInfo = recordOf(data.pageInfo, "rating review pageInfo");
  return {
    items: data.items.map(parseReviewRow),
    pageInfo: {
      page: integerOf(pageInfo.page, "pageInfo.page", 1),
      pageSize: integerOf(pageInfo.pageSize, "pageInfo.pageSize", 0),
      totalItems: integerOf(pageInfo.totalItems, "pageInfo.totalItems", 0),
      totalPages: integerOf(pageInfo.totalPages, "pageInfo.totalPages", 0),
    },
    refresh: parseRefresh(data.refresh, envelope.meta.timestamp),
  };
}

export async function getRatingReview(
  client: RatingApiClient,
  ratingId: string,
  signal?: AbortSignal,
): Promise<RatingReviewDetail> {
  const envelope = await client.getEnvelope<unknown>(
    `/api/platform-admin/multi-taxi-ratings/${encodeURIComponent(ratingId)}`,
    signal ? { signal } : undefined,
  );
  const data = recordOf(envelope.data, "rating review detail");
  const actions =
    data.availableActions === undefined
      ? {}
      : recordOf(data.availableActions, "availableActions");
  const history = data.moderationHistory;
  if (!Array.isArray(history)) {
    throw new RatingReadModelError("moderationHistory must be an array.");
  }
  return {
    rating: parseRating(data.rating),
    orderNo: nullableStringOf(data.orderNo, "orderNo"),
    driverDisplayName: nullableStringOf(
      data.driverDisplayName,
      "driverDisplayName",
    ),
    passengerSubjectMasked: maskedSubjectOf(data.passengerSubjectMasked),
    driverRatingSummary: parseSummary(data.driverRatingSummary),
    moderationHistory: history.map(parseAudit),
    availableActions: {
      invalidate: actionOf(actions.invalidate),
    },
    refresh: parseRefresh(data.refresh, envelope.meta.timestamp),
  };
}

export async function getDriverRatingAuthority(
  client: RatingApiClient,
  driverId: string,
  signal?: AbortSignal,
): Promise<DriverRatingAuthorityView> {
  const envelope = await client.getEnvelope<unknown>(
    `/api/platform-admin/multi-taxi-rating-authorities/${encodeURIComponent(driverId)}`,
    signal ? { signal } : undefined,
  );
  const data = recordOf(envelope.data, "driver rating authority");
  return {
    summary: parseSummary(data.summary),
    refresh: parseRefresh(data.refresh, envelope.meta.timestamp),
    unavailableReason: nullableStringOf(
      data.unavailableReason,
      "unavailableReason",
    ),
  };
}

export async function invalidateRating(
  client: RatingApiClient,
  ratingId: string,
  reason: string,
  idempotencyKey: string,
): Promise<InvalidatePassengerTripRatingResult> {
  const command: InvalidatePassengerTripRatingCommand = {
    reason,
    idempotencyKey,
    confirmation: {
      action: "invalidate_rating",
      ratingId,
    },
  };
  return client.post<InvalidatePassengerTripRatingResult>(
    `/api/platform-admin/multi-taxi-ratings/${encodeURIComponent(ratingId)}/invalidate`,
    {
      body: command,
      headers: {
        "Idempotency-Key": idempotencyKey,
      },
    },
  );
}

export function classifyRatingReadFailure(error: unknown): RatingReadFailure {
  const statusCode =
    error !== null &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
      ? error.statusCode
      : null;
  if (statusCode === 401) return "unauthenticated";
  if (statusCode === 403) return "forbidden";
  if (statusCode === 404) return "not_found";
  return "request_failed";
}
