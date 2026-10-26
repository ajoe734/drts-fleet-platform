import { createHash } from "node:crypto";

import { HttpStatus, Injectable, Logger, Optional } from "@nestjs/common";

import type {
  AgencyAccessLogAction,
  AgencyAccessLogQuery,
  AgencyAccessLogRecord,
  AgencyAccessLogResourceType,
  AgencyPage,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import type { RequestIdentity } from "../../common/auth/auth.types";
import { detectAuthEnvironment } from "../../config/auth-startup-config";
import { AgencyAccessLogRepository } from "./agency-access-log.repository";

export interface AgencyRequestMeta {
  requestId?: string | null;
  sourceIp?: string | null;
  userAgent?: string | null;
}

export interface AgencyAccessEntry {
  action: AgencyAccessLogAction;
  resourceType: AgencyAccessLogResourceType;
  routeKey: string;
  resourceId?: string | null;
  filter?: Record<string, string | number | boolean | null>;
  rowCount?: number | null;
  totalCount?: number | null;
  outcome: AgencyAccessLogRecord["outcome"];
  reasonCode?: string | null;
  exportManifestHash?: string | null;
}

/** Bound agency subject of one request; every field is required for a log row. */
export interface AgencyAccessSubject {
  agencyId: string;
  principalId: string;
  membershipId: string;
  sessionId: string | null;
}

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function hashValue(value: string | null | undefined) {
  const normalized = normalizeText(value);
  return normalized
    ? `sha256:${createHash("sha256").update(normalized).digest("hex")}`
    : null;
}

/** Same prefix rule as admin.security_events: never the full address. */
export function toSourceIpPrefix(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const first = normalized.split(",")[0]?.trim() ?? normalized;
  if (first.includes(".")) {
    const segments = first.split(".");
    if (segments.length === 4) {
      return `${segments[0]}.${segments[1]}.${segments[2]}.0/24`;
    }
  }
  if (first.includes(":")) {
    const segments = first.split(":").filter(Boolean).slice(0, 4);
    return segments.length > 0 ? `${segments.join(":")}::/64` : "::/64";
  }
  return hashValue(first);
}

export function resolveAgencyAccessSubject(
  identity: RequestIdentity | null | undefined,
): AgencyAccessSubject | null {
  if (!identity || identity.realm !== "agency") return null;
  const agencyId = normalizeText(identity.agencyId ?? null);
  const principalId = normalizeText(
    identity.principalId ?? identity.actorId ?? null,
  );
  const membershipId = normalizeText(identity.membershipId ?? null);
  if (!agencyId || !principalId || !membershipId) return null;
  return {
    agencyId,
    principalId,
    membershipId,
    sessionId: normalizeText(identity.sessionId ?? null),
  };
}

/** Maps an agency data route to its access-log action/resource, if any. */
export function classifyAgencyRoute(
  method: string,
  url: string,
): {
  action: AgencyAccessLogAction;
  resourceType: AgencyAccessLogResourceType;
} | null {
  const path = (url.split("?", 1)[0] ?? "")
    .replace(/^\/+/, "")
    .replace(/^api\/+/, "")
    .replace(/\/+$/, "");
  const upper = method.toUpperCase();
  if (path === "agency/trip-records/export-jobs/preview") {
    return { action: "export_preview", resourceType: "trip_record_export" };
  }
  if (path === "agency/trip-records/export-jobs") {
    return { action: "export_create", resourceType: "trip_record_export" };
  }
  if (/^agency\/trip-records\/export-jobs\/[^/]+\/download$/.test(path)) {
    return { action: "export_download", resourceType: "trip_record_export" };
  }
  if (/^agency\/trip-records\/export-jobs\/[^/]+$/.test(path)) {
    return { action: "export_status", resourceType: "trip_record_export" };
  }
  if (path === "agency/trip-records") {
    return { action: "list", resourceType: "trip_record" };
  }
  if (/^agency\/trip-records\/[^/]+$/.test(path)) {
    return { action: "detail", resourceType: "trip_record" };
  }
  const reports: Record<
    string,
    { action: AgencyAccessLogAction; resourceType: AgencyAccessLogResourceType }
  > = {
    "agency/reports/operations-summary": {
      action: "report_view",
      resourceType: "operations_summary",
    },
    "agency/reports/monthly-operations-summaries": {
      action: "report_view",
      resourceType: "monthly_operations_summary",
    },
    "agency/reports/daily-dispatch-records": {
      action: "list",
      resourceType: "daily_dispatch_record",
    },
    "agency/reports/complaint-monthly-statistics": {
      action: "report_view",
      resourceType: "complaint_monthly_statistics",
    },
    "agency/qualifications/vehicles": {
      action: "list",
      resourceType: "vehicle_qualification",
    },
    "agency/qualifications/drivers": {
      action: "list",
      resourceType: "driver_qualification",
    },
  };
  return upper === "GET" || upper === "HEAD" ? (reports[path] ?? null) : null;
}

/**
 * BUREAU-R13 §5.3: every agency read/export is recorded synchronously in
 * `admin.agency_access_logs` after projection and before the response. A
 * failed write fails closed (503, no data). Strict environments without a
 * database refuse agency requests rather than keep logs in memory.
 */
@Injectable()
export class AgencyAccessAuditService {
  private readonly logger = new Logger(AgencyAccessAuditService.name);

  constructor(
    @Optional()
    private readonly accessLogRepository: AgencyAccessLogRepository = new AgencyAccessLogRepository(),
  ) {}

  requireSubject(identity: RequestIdentity | null | undefined) {
    const subject = resolveAgencyAccessSubject(identity);
    if (!subject) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "AGENCY_IDENTITY_INVALID",
        "An agency session bound to one agency membership is required.",
      );
    }
    return subject;
  }

  /** Throws 503 before any data is read when the log cannot be durable. */
  assertAvailable() {
    const environment = detectAuthEnvironment(process.env);
    if (
      (environment === "production" || environment === "staging") &&
      !this.accessLogRepository.isEnabled()
    ) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "AGENCY_ACCESS_AUDIT_UNAVAILABLE",
        "Agency access logging is unavailable.",
      );
    }
  }

  async recordOrDeny(
    subject: AgencyAccessSubject,
    meta: AgencyRequestMeta,
    entry: AgencyAccessEntry,
  ): Promise<AgencyAccessLogRecord> {
    this.assertAvailable();
    try {
      return await this.accessLogRepository.append({
        agencyId: subject.agencyId,
        principalId: subject.principalId,
        membershipId: subject.membershipId,
        sessionId: subject.sessionId,
        action: entry.action,
        resourceType: entry.resourceType,
        routeKey: entry.routeKey,
        resourceId: entry.resourceId ?? null,
        filter: { ...(entry.filter ?? {}) },
        rowCount: entry.outcome === "success" ? (entry.rowCount ?? null) : null,
        totalCount: entry.totalCount ?? null,
        outcome: entry.outcome,
        reasonCode: entry.reasonCode ?? null,
        exportManifestHash: entry.exportManifestHash ?? null,
        requestId: normalizeText(meta.requestId ?? null),
        sourceIpPrefix: toSourceIpPrefix(meta.sourceIp ?? null),
        userAgentHash: hashValue(meta.userAgent ?? null),
      });
    } catch (error) {
      this.logger.warn(
        `Agency access log write failed (${entry.routeKey}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "AGENCY_ACCESS_AUDIT_UNAVAILABLE",
        "Agency access could not be recorded; no data was returned.",
      );
    }
  }

  /** Called by BootstrapAuthGuard for realm/scope denials on agency data routes. */
  async recordGuardDenial(
    identity: RequestIdentity,
    request: {
      method: string;
      url: string;
      routeKey: string;
      headers: Record<string, string | string[] | undefined>;
    },
    reasonCode: string,
  ): Promise<void> {
    const subject = resolveAgencyAccessSubject(identity);
    const classification = classifyAgencyRoute(request.method, request.url);
    if (!subject || !classification) return;
    const header = (name: string) => {
      const value = request.headers[name];
      return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
    };
    await this.recordOrDeny(
      subject,
      {
        requestId: header("x-request-id"),
        sourceIp: header("x-forwarded-for") ?? header("x-real-ip"),
        userAgent: header("user-agent"),
      },
      {
        ...classification,
        routeKey: request.routeKey,
        outcome: "denied",
        reasonCode,
      },
    );
  }

  list(
    query: AgencyAccessLogQuery,
  ): Promise<AgencyPage<AgencyAccessLogRecord>> {
    return this.accessLogRepository.list(query);
  }
}
