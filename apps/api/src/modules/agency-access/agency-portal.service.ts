import { HttpStatus, Injectable } from "@nestjs/common";

import type {
  AgencyAccessLogAction,
  AgencyAccessLogResourceType,
  AgencyComplaintMonthlyStatisticsResponse,
  AgencyDailyDispatchRecordView,
  AgencyDriverQualificationView,
  AgencyExpiryStatus,
  AgencyMonthlyOperationsSummaryView,
  AgencyOperationsSummaryView,
  AgencyPage,
  AgencyQualificationQuery,
  AgencyTripExportScope,
  AgencyTripRecordQuery,
  AgencyTripRecordView,
  AgencyVehicleQualificationView,
  CreateAgencyTripExportJobCommand,
  InsurancePolicyRecord,
  MultiTaxiTripOperationalExportDownload,
  MultiTaxiTripOperationalExportJobAccepted,
  MultiTaxiTripOperationalExportJobView,
  MultiTaxiTripOperationalExportPreview,
  MultiTaxiTripOperationalRecordQuery,
} from "@drts/contracts";
import { AGENCY_EXPIRY_STATUSES } from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth/auth.types";
import type { EvidenceAccessIdentity } from "../../common/evidence-governance";
import { MultiTaxiService } from "../multi-taxi/multi-taxi.service";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import { ReportingFilingService } from "../reporting-filing/reporting-filing.service";
import { toTaipeiMonth } from "../reporting/operations-metrics";
import { ReportingService } from "../reporting/reporting.service";
import type { DailyDispatchRecordQuery } from "../reporting/reporting.repository";
import {
  AgencyAccessAuditService,
  type AgencyAccessSubject,
  type AgencyRequestMeta,
} from "./agency-access-audit.service";
import { AgencyDirectoryService } from "./agency-directory.service";
import {
  AGENCY_COMPLAINT_UNAVAILABLE_METRICS,
  driverMatchesExpiryStatus,
  filterAgencyExportRows,
  isWithinAgencyRetention,
  normalizeAgencyPage,
  normalizeExpiryWindowDays,
  paginate,
  projectAgencyComplaintMonthlyStatistics,
  projectAgencyDailyDispatchRecord,
  projectAgencyDriverQualification,
  projectAgencyMonthlyOperationsSummary,
  projectAgencyOperationsSummary,
  projectAgencyTripRecord,
  projectAgencyVehicleQualification,
  vehicleMatchesExpiryStatus,
} from "./agency-projections";

type AuditFilter = Record<string, string | number | boolean | null>;

interface AgencyOperation<T> {
  action: AgencyAccessLogAction;
  resourceType: AgencyAccessLogResourceType;
  routeKey: string;
  resourceId?: string | null;
  filter: AuditFilter;
  execute: () => Promise<{
    result: T;
    rowCount: number;
    totalCount?: number | null;
    resourceId?: string | null;
    exportManifestHash?: string | null;
  }>;
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const OPERATIONS_WINDOW_MAX_MONTHS = 6;
const COMPLAINT_WINDOW_MAX_MONTHS = 12;
const DAILY_DISPATCH_WINDOW_MAX_DAYS = 31;

function badRequest(code: string, message: string) {
  return new ApiRequestError(HttpStatus.BAD_REQUEST, code, message);
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Logged filter values: allowlisted keys only, bounded length. */
function auditText(value: unknown): string | null {
  const text =
    typeof value === "number" ? String(value) : (optionalText(value) ?? null);
  return text ? text.slice(0, 64) : null;
}

function parseMonth(value: unknown, field: string): string | undefined {
  const text = optionalText(value);
  if (text === undefined) return undefined;
  if (!MONTH_PATTERN.test(text)) {
    throw badRequest("AGENCY_QUERY_INVALID", `${field} must use YYYY-MM.`);
  }
  return text;
}

function parseDate(value: unknown, field: string): string | undefined {
  const text = optionalText(value);
  if (text === undefined) return undefined;
  if (
    !DATE_PATTERN.test(text) ||
    !Number.isFinite(Date.parse(`${text}T00:00:00.000Z`))
  ) {
    throw badRequest("AGENCY_QUERY_INVALID", `${field} must use YYYY-MM-DD.`);
  }
  return text;
}

function parseMonthOrBoundaryDate(
  value: unknown,
  boundary: "from" | "to",
): string | undefined {
  const text = optionalText(value);
  if (text === undefined) return undefined;
  if (MONTH_PATTERN.test(text)) {
    return text;
  }
  if (
    !DATE_PATTERN.test(text) ||
    !Number.isFinite(Date.parse(`${text}T00:00:00.000Z`))
  ) {
    throw badRequest(
      "AGENCY_QUERY_INVALID",
      `${boundary} must use YYYY-MM or full calendar-month boundary YYYY-MM-DD.`,
    );
  }
  const periodMonth = text.slice(0, 7);
  const [year, month] = periodMonth.split("-").map(Number) as [number, number];
  const lastDay = String(
    new Date(Date.UTC(year, month, 0)).getUTCDate(),
  ).padStart(2, "0");
  const expectedDate =
    boundary === "from" ? `${periodMonth}-01` : `${periodMonth}-${lastDay}`;
  if (text !== expectedDate) {
    throw badRequest(
      "AGENCY_QUERY_INVALID",
      `${boundary} must be a calendar month (YYYY-MM) or the exact ${boundary === "from" ? "first" : "last"} day of that month (${expectedDate}); arbitrary day precision is not supported for monthly operations summaries.`,
    );
  }
  return periodMonth;
}

function monthSpan(from: string, to: string): number {
  const [fromYear, fromMonth] = from.split("-").map(Number) as [number, number];
  const [toYear, toMonth] = to.split("-").map(Number) as [number, number];
  return (toYear - fromYear) * 12 + (toMonth - fromMonth) + 1;
}

/** Inclusive calendar-month window between two months, newest default. */
function resolveMonthWindow(
  fromMonth: string | undefined,
  toMonth: string | undefined,
  maxMonths: number,
): { from: string; to: string } {
  const now = new Date();
  const latest =
    toTaipeiMonth(now.toISOString()) ?? now.toISOString().slice(0, 7);
  const to =
    toMonth ??
    (fromMonth && fromMonth > latest
      ? fromMonth
      : fromMonth
        ? (() => {
            const shifted = new Date(
              Date.UTC(
                Number(fromMonth.slice(0, 4)),
                Number(fromMonth.slice(5, 7)) - 1 + (maxMonths - 1),
                1,
              ),
            )
              .toISOString()
              .slice(0, 7);
            return shifted <= latest ? shifted : latest;
          })()
        : latest);
  const from =
    fromMonth ??
    new Date(
      Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - maxMonths, 1),
    )
      .toISOString()
      .slice(0, 7);
  const span = monthSpan(from, to);
  if (span < 1) {
    throw badRequest(
      "AGENCY_QUERY_INVALID",
      "The window start must not be after its end.",
    );
  }
  if (span > maxMonths) {
    throw badRequest(
      "AGENCY_REPORT_WINDOW_TOO_LARGE",
      `The report window must not exceed ${maxMonths} calendar months.`,
    );
  }
  return { from, to };
}

function rejectUnsupported(query: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (query[key] !== undefined) {
      throw badRequest(
        "AGENCY_QUERY_PARAMETER_UNSUPPORTED",
        `Query parameter '${key}' is not available to agency sessions.`,
      );
    }
  }
}

/**
 * BUREAU-R13 §4 agency portal. Each call (1) binds the request to a live
 * agency membership, (2) reads only through the existing authoritative
 * services, (3) projects §4 allowlist fields and (4) writes the access log
 * before returning. Nothing here writes operational data.
 */
@Injectable()
export class AgencyPortalService {
  constructor(
    private readonly accessAudit: AgencyAccessAuditService,
    private readonly agencyDirectoryService: AgencyDirectoryService,
    private readonly multiTaxiService: MultiTaxiService,
    private readonly reportingFilingService: ReportingFilingService,
    private readonly reportingService: ReportingService,
    private readonly regulatoryRegistryService: RegulatoryRegistryService,
  ) {}

  async listTripRecords(
    identity: BootstrapRequestIdentity | null,
    rawQuery: AgencyTripRecordQuery & Record<string, unknown>,
    meta: AgencyRequestMeta,
  ): Promise<AgencyPage<AgencyTripRecordView>> {
    const query = rawQuery ?? {};
    return this.run(identity, meta, {
      action: "list",
      resourceType: "trip_record",
      routeKey: "agency:trip-records:list",
      filter: this.tripFilter(query),
      execute: async () => {
        rejectUnsupported(query, ["q"]);
        const recordQuery = this.toRecordQuery(query, true);
        const { page, pageSize } = normalizeAgencyPage(
          query.page,
          query.pageSize,
        );
        const now = Date.now();
        const records = (
          await this.multiTaxiService.listTripOperationalRecords(recordQuery)
        )
          .filter((record) => isWithinAgencyRetention(record.retainUntil, now))
          .map(projectAgencyTripRecord);
        const result = paginate(records, page, pageSize);
        return {
          result,
          rowCount: result.items.length,
          totalCount: result.total,
        };
      },
    });
  }

  async getTripRecord(
    identity: BootstrapRequestIdentity | null,
    recordId: string,
    meta: AgencyRequestMeta,
  ): Promise<AgencyTripRecordView> {
    return this.run(identity, meta, {
      action: "detail",
      resourceType: "trip_record",
      routeKey: "agency:trip-records:detail",
      resourceId: recordId,
      filter: {},
      execute: async () => {
        const now = Date.now();
        const candidate =
          typeof this.multiTaxiService.getTripOperationalRecord === "function"
            ? await this.multiTaxiService.getTripOperationalRecord(recordId)
            : ((
                await this.multiTaxiService.listTripOperationalRecords({
                  recordId,
                })
              ).find((item) => item.recordId === recordId) ?? null);
        const record =
          candidate &&
          candidate.recordId === recordId &&
          isWithinAgencyRetention(candidate.retainUntil, now)
            ? candidate
            : null;
        if (!record) {
          throw new ApiRequestError(
            HttpStatus.NOT_FOUND,
            "AGENCY_TRIP_RECORD_NOT_FOUND",
            "Trip record was not found.",
          );
        }
        return { result: projectAgencyTripRecord(record), rowCount: 1 };
      },
    });
  }

  async previewTripExport(
    identity: BootstrapRequestIdentity | null,
    body: { scope?: AgencyTripExportScope } & Record<string, unknown>,
    meta: AgencyRequestMeta,
  ): Promise<MultiTaxiTripOperationalExportPreview> {
    const scopeInput = (body?.scope ?? {}) as Record<string, unknown>;
    return this.run(identity, meta, {
      action: "export_preview",
      resourceType: "trip_record_export",
      routeKey: "agency:trip-records:export:preview",
      filter: this.tripFilter(scopeInput),
      execute: async () => {
        const scope = this.toExportScope(scopeInput);
        const rows = filterAgencyExportRows(
          (await this.multiTaxiService.exportTripOperationalRecords(scope))
            .rows,
          Date.now(),
        );
        const preview = this.reportingFilingService.previewMultiTaxiTripExport(
          scope,
          rows.length,
          this.evidenceIdentity(identity!),
          meta.requestId ?? undefined,
        );
        return { result: preview, rowCount: 0, totalCount: rows.length };
      },
    });
  }

  async createTripExport(
    identity: BootstrapRequestIdentity | null,
    command: CreateAgencyTripExportJobCommand,
    meta: AgencyRequestMeta,
  ): Promise<MultiTaxiTripOperationalExportJobAccepted> {
    const scopeInput = (command?.scope ?? {}) as Record<string, unknown>;
    return this.run(identity, meta, {
      action: "export_create",
      resourceType: "trip_record_export",
      routeKey: "agency:trip-records:export:create",
      filter: this.tripFilter(scopeInput),
      execute: async () => {
        const scope = this.toExportScope(scopeInput);
        const rows = filterAgencyExportRows(
          (await this.multiTaxiService.exportTripOperationalRecords(scope))
            .rows,
          Date.now(),
        );
        const accepted =
          await this.reportingFilingService.createMultiTaxiTripExportJobDurably(
            {
              scope,
              purpose: command?.purpose,
              idempotencyKey: command?.idempotencyKey,
            },
            rows,
            this.evidenceIdentity(identity!),
            meta.requestId ?? undefined,
          );
        return {
          result: accepted,
          rowCount: 0,
          totalCount: rows.length,
          resourceId: accepted.jobId,
        };
      },
    });
  }

  async getTripExportJob(
    identity: BootstrapRequestIdentity | null,
    jobId: string,
    meta: AgencyRequestMeta,
  ): Promise<MultiTaxiTripOperationalExportJobView> {
    return this.run(identity, meta, {
      action: "export_status",
      resourceType: "trip_record_export",
      routeKey: "agency:trip-records:export:status",
      resourceId: jobId,
      filter: {},
      execute: async () => {
        const view =
          await this.reportingFilingService.getMultiTaxiTripExportJobForRead(
            jobId,
            this.evidenceIdentity(identity!),
            meta.requestId ?? undefined,
          );
        return { result: view, rowCount: 0, totalCount: view.recordCount };
      },
    });
  }

  async issueTripExportDownload(
    identity: BootstrapRequestIdentity | null,
    jobId: string,
    meta: AgencyRequestMeta,
  ): Promise<MultiTaxiTripOperationalExportDownload> {
    return this.run(identity, meta, {
      action: "export_download",
      resourceType: "trip_record_export",
      routeKey: "agency:trip-records:export:download",
      resourceId: jobId,
      filter: {},
      execute: async () => {
        const download =
          await this.reportingFilingService.issueMultiTaxiTripExportDownloadForRead(
            jobId,
            this.evidenceIdentity(identity!),
            meta.requestId ?? undefined,
          );
        return {
          result: download,
          rowCount: download.recordCount,
          totalCount: download.recordCount,
          exportManifestHash: download.manifestHash,
        };
      },
    });
  }

  async previewOperationsSummary(
    identity: BootstrapRequestIdentity | null,
    query: {
      periodMonthFrom?: string;
      periodMonthTo?: string;
      from?: string;
      to?: string;
      businessArea?: string;
      serviceProductCode?: string;
    },
    meta: AgencyRequestMeta,
  ): Promise<AgencyOperationsSummaryView[]> {
    const raw = (query ?? {}) as Record<string, unknown>;
    return this.run(identity, meta, {
      action: "report_view",
      resourceType: "operations_summary",
      routeKey: "agency:reports:operations-summary",
      filter: {
        periodMonthFrom: auditText(raw.periodMonthFrom),
        periodMonthTo: auditText(raw.periodMonthTo),
        from: auditText(raw.from),
        to: auditText(raw.to),
        businessArea: auditText(raw.businessArea),
        serviceProductCode: auditText(raw.serviceProductCode),
      },
      execute: async () => {
        const periodFrom = parseMonth(raw.periodMonthFrom, "periodMonthFrom");
        const periodTo = parseMonth(raw.periodMonthTo, "periodMonthTo");
        const fromMonth = parseMonthOrBoundaryDate(raw.from, "from");
        const toMonth = parseMonthOrBoundaryDate(raw.to, "to");
        if (periodFrom && fromMonth && periodFrom !== fromMonth) {
          throw badRequest(
            "AGENCY_QUERY_INVALID",
            "from and periodMonthFrom must refer to the same calendar month.",
          );
        }
        if (periodTo && toMonth && periodTo !== toMonth) {
          throw badRequest(
            "AGENCY_QUERY_INVALID",
            "to and periodMonthTo must refer to the same calendar month.",
          );
        }
        const window = resolveMonthWindow(
          periodFrom ?? fromMonth,
          periodTo ?? toMonth,
          OPERATIONS_WINDOW_MAX_MONTHS,
        );
        const businessArea = optionalText(raw.businessArea);
        const serviceProductCode = optionalText(raw.serviceProductCode);
        const summaries =
          await this.reportingService.previewSixMonthOperationsSummary({
            periodMonthFrom: window.from,
            periodMonthTo: window.to,
            ...(businessArea ? { businessArea } : {}),
            ...(serviceProductCode ? { serviceProductCode } : {}),
          });
        const result = summaries.map(projectAgencyOperationsSummary);
        return { result, rowCount: result.length, totalCount: result.length };
      },
    });
  }

  async listMonthlyOperationsSummaries(
    identity: BootstrapRequestIdentity | null,
    query: {
      periodMonthFrom?: string;
      periodMonthTo?: string;
      from?: string;
      to?: string;
      businessArea?: string;
      serviceProductCode?: string;
    },
    meta: AgencyRequestMeta,
  ): Promise<AgencyMonthlyOperationsSummaryView[]> {
    const raw = (query ?? {}) as Record<string, unknown>;
    return this.run(identity, meta, {
      action: "report_view",
      resourceType: "monthly_operations_summary",
      routeKey: "agency:reports:monthly-operations-summaries",
      filter: {
        periodMonthFrom: auditText(raw.periodMonthFrom),
        periodMonthTo: auditText(raw.periodMonthTo),
        from: auditText(raw.from),
        to: auditText(raw.to),
        businessArea: auditText(raw.businessArea),
        serviceProductCode: auditText(raw.serviceProductCode),
      },
      execute: async () => {
        const periodFrom = parseMonth(raw.periodMonthFrom, "periodMonthFrom");
        const periodTo = parseMonth(raw.periodMonthTo, "periodMonthTo");
        const fromMonth = parseMonthOrBoundaryDate(raw.from, "from");
        const toMonth = parseMonthOrBoundaryDate(raw.to, "to");
        if (periodFrom && fromMonth && periodFrom !== fromMonth) {
          throw badRequest(
            "AGENCY_QUERY_INVALID",
            "from and periodMonthFrom must refer to the same calendar month.",
          );
        }
        if (periodTo && toMonth && periodTo !== toMonth) {
          throw badRequest(
            "AGENCY_QUERY_INVALID",
            "to and periodMonthTo must refer to the same calendar month.",
          );
        }
        const window = resolveMonthWindow(
          periodFrom ?? fromMonth,
          periodTo ?? toMonth,
          OPERATIONS_WINDOW_MAX_MONTHS,
        );
        const businessArea = optionalText(raw.businessArea);
        const serviceProductCode = optionalText(raw.serviceProductCode);
        if (
          typeof this.reportingService.previewSixMonthOperationsSummary ===
          "function"
        ) {
          const summaries =
            await this.reportingService.previewSixMonthOperationsSummary({
              periodMonthFrom: window.from,
              periodMonthTo: window.to,
              ...(businessArea ? { businessArea } : {}),
              ...(serviceProductCode ? { serviceProductCode } : {}),
            });
          if (summaries.some((s) => (s.monthlySummaries?.length ?? 0) > 0)) {
            const result = summaries
              .flatMap((summary) => summary.monthlySummaries ?? [])
              .map(projectAgencyMonthlyOperationsSummary)
              .sort(
                (left, right) =>
                  right.periodMonth.localeCompare(left.periodMonth) ||
                  (left.businessArea ?? "").localeCompare(
                    right.businessArea ?? "",
                  ) ||
                  (left.serviceProductCode ?? "").localeCompare(
                    right.serviceProductCode ?? "",
                  ),
              );
            return {
              result,
              rowCount: result.length,
              totalCount: result.length,
            };
          }
        }
        const result = (
          await this.reportingService.listMonthlyOperationsSummaries({
            periodMonthFrom: window.from,
            periodMonthTo: window.to,
            ...(businessArea ? { businessArea } : {}),
            ...(serviceProductCode ? { serviceProductCode } : {}),
          })
        ).map(projectAgencyMonthlyOperationsSummary);
        return { result, rowCount: result.length, totalCount: result.length };
      },
    });
  }

  async listComplaintMonthlyStatistics(
    identity: BootstrapRequestIdentity | null,
    query: { periodMonthFrom?: string; periodMonthTo?: string },
    meta: AgencyRequestMeta,
  ): Promise<AgencyComplaintMonthlyStatisticsResponse> {
    const raw = (query ?? {}) as Record<string, unknown>;
    return this.run(identity, meta, {
      action: "report_view",
      resourceType: "complaint_monthly_statistics",
      routeKey: "agency:reports:complaint-monthly-statistics",
      filter: {
        periodMonthFrom: auditText(raw.periodMonthFrom),
        periodMonthTo: auditText(raw.periodMonthTo),
      },
      execute: async () => {
        const window = resolveMonthWindow(
          parseMonth(raw.periodMonthFrom, "periodMonthFrom"),
          parseMonth(raw.periodMonthTo, "periodMonthTo"),
          COMPLAINT_WINDOW_MAX_MONTHS,
        );
        // The accepted R09 preview is the only source of closed/overdue
        // counts and also carries the same-batch monthly read model rows.
        const previews =
          await this.reportingService.previewSixMonthOperationsSummary({
            periodMonthFrom: window.from,
            periodMonthTo: window.to,
          });
        const monthlyFromPreviews = previews.flatMap((summary) =>
          (summary.monthlySummaries ?? []).map((item) => ({
            periodMonth: item.periodMonth,
            businessArea: item.businessArea ?? "unassigned",
            serviceProductCode: item.serviceProductCode ?? "unknown",
            demandRequestCount: item.demandRequestCount,
            actualDispatchCount: item.actualDispatchCount,
            completedTripCount: item.completedTripCount,
            cancelledOrderCount: item.cancelledOrderCount,
            averageDispatchableVehicleCount:
              item.averageDispatchableVehicleCount ?? 0,
            validSnapshotCount: item.validSnapshotCount,
            expectedSnapshotCount: item.expectedSnapshotCount,
            snapshotCoverageRate: item.snapshotCoverageRate,
            complaintCount: item.complaintCount,
            complaintsByCategory: { ...item.complaintsByCategory },
            generatedAt: item.generatedAt,
          })),
        );
        const monthly =
          monthlyFromPreviews.length > 0
            ? monthlyFromPreviews
            : await this.reportingService.listMonthlyOperationsSummaries({
                periodMonthFrom: window.from,
                periodMonthTo: window.to,
              });
        const items = projectAgencyComplaintMonthlyStatistics(
          monthly,
          previews,
        );
        return {
          result: {
            items,
            statisticsAsOf: previews[0]?.complaintStatisticsAsOf ?? null,
            unavailableMetrics: [...AGENCY_COMPLAINT_UNAVAILABLE_METRICS],
          },
          rowCount: items.length,
          totalCount: items.length,
        };
      },
    });
  }

  async listDailyDispatchRecords(
    identity: BootstrapRequestIdentity | null,
    query: Record<string, unknown>,
    meta: AgencyRequestMeta,
  ): Promise<AgencyPage<AgencyDailyDispatchRecordView>> {
    const raw = query ?? {};
    return this.run(identity, meta, {
      action: "list",
      resourceType: "daily_dispatch_record",
      routeKey: "agency:reports:daily-dispatch-records",
      filter: {
        serviceDate: auditText(raw.serviceDate),
        serviceDateFrom: auditText(raw.serviceDateFrom),
        serviceDateTo: auditText(raw.serviceDateTo),
        serviceProductCode: auditText(raw.serviceProductCode),
        finalStatus: auditText(raw.finalStatus),
      },
      execute: async () => {
        rejectUnsupported(raw, ["orderId", "tenantId", "partnerId"]);
        const reportQuery = this.toDailyDispatchQuery(raw);
        const { page, pageSize } = normalizeAgencyPage(raw.page, raw.pageSize);
        const records = (
          await this.reportingService.listDailyDispatchRecords(reportQuery)
        ).map(projectAgencyDailyDispatchRecord);
        const result = paginate(records, page, pageSize);
        return {
          result,
          rowCount: result.items.length,
          totalCount: result.total,
        };
      },
    });
  }

  async listVehicleQualifications(
    identity: BootstrapRequestIdentity | null,
    query: AgencyQualificationQuery & Record<string, unknown>,
    meta: AgencyRequestMeta,
  ): Promise<AgencyPage<AgencyVehicleQualificationView>> {
    const raw = (query ?? {}) as Record<string, unknown>;
    return this.run(identity, meta, {
      action: "list",
      resourceType: "vehicle_qualification",
      routeKey: "agency:qualifications:vehicles",
      filter: this.qualificationFilter(raw),
      execute: async () => {
        const { status, windowDays } = this.toQualificationQuery(raw);
        const { page, pageSize } = normalizeAgencyPage(raw.page, raw.pageSize);
        const now = Date.now();
        const policiesById = new Map<string, InsurancePolicyRecord>(
          this.regulatoryRegistryService
            .listPolicies()
            .map((policy) => [policy.policyId, policy] as const),
        );
        const views = this.regulatoryRegistryService
          .listVehicles()
          .map((vehicle) =>
            projectAgencyVehicleQualification(
              vehicle,
              policiesById,
              now,
              windowDays,
            ),
          )
          .filter((view) =>
            status ? vehicleMatchesExpiryStatus(view, status) : true,
          );
        const result = paginate(views, page, pageSize);
        return {
          result,
          rowCount: result.items.length,
          totalCount: result.total,
        };
      },
    });
  }

  async listDriverQualifications(
    identity: BootstrapRequestIdentity | null,
    query: AgencyQualificationQuery & Record<string, unknown>,
    meta: AgencyRequestMeta,
  ): Promise<AgencyPage<AgencyDriverQualificationView>> {
    const raw = (query ?? {}) as Record<string, unknown>;
    return this.run(identity, meta, {
      action: "list",
      resourceType: "driver_qualification",
      routeKey: "agency:qualifications:drivers",
      filter: this.qualificationFilter(raw),
      execute: async () => {
        const { status, windowDays } = this.toQualificationQuery(raw);
        const { page, pageSize } = normalizeAgencyPage(raw.page, raw.pageSize);
        // Same order as the existing drivers route: suppressions first.
        await this.regulatoryRegistryService.prepareMatchingSuppressions();
        const now = Date.now();
        const views = this.regulatoryRegistryService
          .listDrivers()
          .map((driver) =>
            projectAgencyDriverQualification(driver, now, windowDays),
          )
          .filter((view) =>
            status ? driverMatchesExpiryStatus(view, status) : true,
          );
        const result = paginate(views, page, pageSize);
        return {
          result,
          rowCount: result.items.length,
          totalCount: result.total,
        };
      },
    });
  }

  private async run<T>(
    identity: BootstrapRequestIdentity | null,
    meta: AgencyRequestMeta,
    operation: AgencyOperation<T>,
  ): Promise<T> {
    const subject = this.accessAudit.requireSubject(identity);
    this.accessAudit.assertAvailable();
    const access =
      await this.agencyDirectoryService.resolveActiveAccess(subject);
    if (!access) {
      await this.recordFailure(subject, meta, operation, "denied", {
        code: "AGENCY_ACCESS_INACTIVE",
      });
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "AGENCY_ACCESS_INACTIVE",
        "Agency membership, agency or access period is not active.",
      );
    }

    let outcome: Awaited<ReturnType<AgencyOperation<T>["execute"]>>;
    try {
      outcome = await operation.execute();
    } catch (error) {
      const code =
        error instanceof ApiRequestError ? error.code : "AGENCY_ACCESS_ERROR";
      const denied =
        error instanceof ApiRequestError &&
        (error.getStatus() === HttpStatus.FORBIDDEN ||
          error.getStatus() === HttpStatus.NOT_FOUND);
      await this.recordFailure(
        subject,
        meta,
        operation,
        denied ? "denied" : "error",
        {
          code,
        },
      );
      throw error;
    }

    // Recorded after projection and before the response; a failed write
    // throws 503 and the projected data is discarded.
    await this.accessAudit.recordOrDeny(subject, meta, {
      action: operation.action,
      resourceType: operation.resourceType,
      routeKey: operation.routeKey,
      resourceId: outcome.resourceId ?? operation.resourceId ?? null,
      filter: operation.filter,
      rowCount: outcome.rowCount,
      totalCount: outcome.totalCount ?? null,
      outcome: "success",
      exportManifestHash: outcome.exportManifestHash ?? null,
    });
    return outcome.result;
  }

  private async recordFailure<T>(
    subject: AgencyAccessSubject,
    meta: AgencyRequestMeta,
    operation: AgencyOperation<T>,
    outcome: "denied" | "error",
    reason: { code: string },
  ) {
    await this.accessAudit.recordOrDeny(subject, meta, {
      action: operation.action,
      resourceType: operation.resourceType,
      routeKey: operation.routeKey,
      resourceId: operation.resourceId ?? null,
      filter: operation.filter,
      outcome,
      reasonCode: reason.code,
    });
  }

  private evidenceIdentity(
    identity: BootstrapRequestIdentity,
  ): EvidenceAccessIdentity {
    return {
      actorType: identity.actorType,
      actorId: identity.principalId ?? identity.actorId,
      realm: identity.realm,
      scopes: identity.scopes,
      tenantId: null,
      agencyId: identity.agencyId ?? null,
    };
  }

  /** Only allowlisted, non-identifying filter values are logged. */
  private tripFilter(query: Record<string, unknown>): AuditFilter {
    return {
      month: auditText(query.month),
      reservedFrom: auditText(query.reservedFrom),
      reservedTo: auditText(query.reservedTo),
      plateNo: auditText(query.plateNo),
      orderNo: auditText(query.orderNo),
      orderId: auditText(query.orderId),
      tripId: auditText(query.tripId),
      recordId: auditText(query.recordId),
      legalHold: auditText(query.legalHold),
      page: auditText(query.page),
      pageSize: auditText(query.pageSize),
    };
  }

  private qualificationFilter(query: Record<string, unknown>): AuditFilter {
    return {
      status: auditText(query.status),
      windowDays: auditText(query.windowDays),
      page: auditText(query.page),
    };
  }

  private toRecordQuery(
    query: Record<string, unknown>,
    allowLegalHold: boolean,
  ): MultiTaxiTripOperationalRecordQuery {
    const month = parseMonth(query.month, "month");
    const reservedFrom = parseDate(query.reservedFrom, "reservedFrom");
    const reservedTo = parseDate(query.reservedTo, "reservedTo");
    if (reservedFrom && reservedTo && reservedFrom > reservedTo) {
      throw badRequest(
        "AGENCY_QUERY_INVALID",
        "reservedFrom must not be after reservedTo.",
      );
    }
    const exactFields = [
      "plateNo",
      "orderNo",
      "orderId",
      "tripId",
      "recordId",
    ] as const;
    const exactFilters: Partial<
      Pick<
        MultiTaxiTripOperationalRecordQuery,
        "plateNo" | "orderNo" | "orderId" | "tripId" | "recordId"
      >
    > = {};
    for (const field of exactFields) {
      const value = optionalText(query[field]);
      if (value !== undefined) {
        if (value.length > 120) {
          throw badRequest(
            "AGENCY_QUERY_INVALID",
            `${field} must not exceed 120 characters.`,
          );
        }
        exactFilters[field] = value;
      }
    }
    const legalHold = optionalText(query.legalHold);
    if (
      legalHold !== undefined &&
      (!allowLegalHold || !["all", "active", "none"].includes(legalHold))
    ) {
      throw badRequest(
        "AGENCY_QUERY_INVALID",
        "legalHold must be all, active or none.",
      );
    }
    return {
      ...(month ? { month } : {}),
      ...(reservedFrom ? { reservedFrom } : {}),
      ...(reservedTo ? { reservedTo } : {}),
      ...exactFilters,
      ...(legalHold
        ? {
            legalHold: legalHold as NonNullable<
              MultiTaxiTripOperationalRecordQuery["legalHold"]
            >,
          }
        : {}),
    };
  }

  /** Export scope: month/reservedFrom/reservedTo + exact plate/order/trip identifiers (no q, no legalHold). */
  private toExportScope(
    scope: Record<string, unknown>,
  ): MultiTaxiTripOperationalRecordQuery {
    rejectUnsupported(scope, ["q", "legalHold"]);
    return this.toRecordQuery(scope, false);
  }

  private toDailyDispatchQuery(
    query: Record<string, unknown>,
  ): DailyDispatchRecordQuery {
    const serviceDate = parseDate(query.serviceDate, "serviceDate");
    const serviceDateFrom = parseDate(query.serviceDateFrom, "serviceDateFrom");
    const serviceDateTo = parseDate(query.serviceDateTo, "serviceDateTo");
    const result: DailyDispatchRecordQuery = {};
    if (serviceDate) {
      if (serviceDateFrom || serviceDateTo) {
        throw badRequest(
          "AGENCY_QUERY_INVALID",
          "Use either serviceDate or serviceDateFrom/serviceDateTo.",
        );
      }
      result.serviceDate = serviceDate;
    } else {
      if (!serviceDateFrom || !serviceDateTo) {
        throw badRequest(
          "AGENCY_QUERY_INVALID",
          "serviceDate or both serviceDateFrom and serviceDateTo are required.",
        );
      }
      const days =
        (Date.parse(`${serviceDateTo}T00:00:00.000Z`) -
          Date.parse(`${serviceDateFrom}T00:00:00.000Z`)) /
          86_400_000 +
        1;
      if (days < 1) {
        throw badRequest(
          "AGENCY_QUERY_INVALID",
          "serviceDateFrom must not be after serviceDateTo.",
        );
      }
      if (days > DAILY_DISPATCH_WINDOW_MAX_DAYS) {
        throw badRequest(
          "AGENCY_REPORT_WINDOW_TOO_LARGE",
          `The daily dispatch window must not exceed ${DAILY_DISPATCH_WINDOW_MAX_DAYS} days.`,
        );
      }
      result.serviceDateFrom = serviceDateFrom;
      result.serviceDateTo = serviceDateTo;
    }
    const serviceProductCode = optionalText(query.serviceProductCode);
    const finalStatus = optionalText(query.finalStatus);
    if (serviceProductCode) result.serviceProductCode = serviceProductCode;
    if (finalStatus) result.finalStatus = finalStatus;
    return result;
  }

  private toQualificationQuery(query: Record<string, unknown>): {
    status: AgencyExpiryStatus | null;
    windowDays: number;
  } {
    const status = optionalText(query.status);
    if (
      status !== undefined &&
      !AGENCY_EXPIRY_STATUSES.includes(status as AgencyExpiryStatus)
    ) {
      throw badRequest(
        "AGENCY_QUERY_INVALID",
        "status must be expired, expiring, valid or unavailable.",
      );
    }
    const windowDays = normalizeExpiryWindowDays(query.windowDays);
    if (windowDays === null) {
      throw badRequest(
        "AGENCY_QUERY_INVALID",
        "windowDays must be an integer between 0 and 365.",
      );
    }
    return {
      status: (status as AgencyExpiryStatus | undefined) ?? null,
      windowDays,
    };
  }
}
