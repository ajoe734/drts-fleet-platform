import type {
  AuditLogRecord,
  ListOpsPendingApprovalRequestsQuery,
  OpsPendingApprovalRequestRecord,
  TenantBookingApprovalRequestStatus,
} from "@drts/contracts";

export type ApprovalQueueFilters = {
  tenantId: string;
  status: TenantBookingApprovalRequestStatus | "all";
  expiresWithinHours: number | null;
};

function normalizeTenantId(value: string) {
  return value.trim();
}

function expiresBeforeMs(hours: number | null, now: Date) {
  if (hours === null) {
    return null;
  }

  return now.getTime() + hours * 60 * 60 * 1000;
}

export function buildOpsApprovalQueueQuery(
  filters: ApprovalQueueFilters,
  now = new Date(),
): ListOpsPendingApprovalRequestsQuery {
  const tenantId = normalizeTenantId(filters.tenantId);
  const query: ListOpsPendingApprovalRequestsQuery = {};

  if (tenantId) {
    query.tenantId = tenantId;
  }

  if (filters.status !== "all") {
    query.status = filters.status;
  }

  const expiresAt = expiresBeforeMs(filters.expiresWithinHours, now);
  if (expiresAt !== null) {
    query.expiresBefore = new Date(expiresAt).toISOString();
  }

  return query;
}

export function compareOpsApprovalRequests(
  left: OpsPendingApprovalRequestRecord,
  right: OpsPendingApprovalRequestRecord,
) {
  if (left.slaBreached !== right.slaBreached) {
    return left.slaBreached ? -1 : 1;
  }

  const leftAcknowledged = Boolean(left.opsSlaAcknowledgedAt);
  const rightAcknowledged = Boolean(right.opsSlaAcknowledgedAt);
  if (leftAcknowledged !== rightAcknowledged) {
    return leftAcknowledged ? 1 : -1;
  }

  const timeoutDiff = Date.parse(left.timeoutAt) - Date.parse(right.timeoutAt);
  if (timeoutDiff !== 0) {
    return timeoutDiff;
  }

  return Date.parse(right.createdAt) - Date.parse(left.createdAt);
}

export function filterAndSortOpsApprovalRequests(
  records: readonly OpsPendingApprovalRequestRecord[],
  filters: ApprovalQueueFilters,
  now = new Date(),
) {
  const tenantId = normalizeTenantId(filters.tenantId);
  const expiresAt = expiresBeforeMs(filters.expiresWithinHours, now);

  return records
    .filter((record) => (tenantId ? record.tenantId === tenantId : true))
    .filter((record) =>
      filters.status === "all" ? true : record.status === filters.status,
    )
    .filter((record) =>
      expiresAt === null ? true : Date.parse(record.timeoutAt) <= expiresAt,
    )
    .slice()
    .sort(compareOpsApprovalRequests);
}

export function resolveSelectedApprovalRequestId(
  records: readonly OpsPendingApprovalRequestRecord[],
  preferredApprovalRequestId: string | null,
) {
  if (
    preferredApprovalRequestId &&
    records.some(
      (record) => record.approvalRequestId === preferredApprovalRequestId,
    )
  ) {
    return preferredApprovalRequestId;
  }

  return records[0]?.approvalRequestId ?? null;
}

function summaryHasReference(
  summary:
    | AuditLogRecord["newValuesSummary"]
    | AuditLogRecord["oldValuesSummary"],
  references: Set<string>,
) {
  if (!summary) {
    return false;
  }

  return Object.values(summary).some(
    (value) => typeof value === "string" && references.has(value),
  );
}

export function filterRelevantTenantAuditRecords(
  records: readonly AuditLogRecord[],
  request: OpsPendingApprovalRequestRecord,
) {
  const references = new Set<string>([
    request.approvalRequestId,
    request.bookingId,
    request.orderId,
    request.evaluationId,
  ]);

  return records
    .filter((record) =>
      record.resourceId ? references.has(record.resourceId) : false,
    )
    .concat(
      records.filter(
        (record) =>
          summaryHasReference(record.newValuesSummary, references) ||
          summaryHasReference(record.oldValuesSummary, references),
      ),
    )
    .filter(
      (record, index, items) =>
        items.findIndex((candidate) => candidate.auditId === record.auditId) ===
        index,
    )
    .sort(
      (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
    );
}
