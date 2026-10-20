import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import type {
  ComplaintCaseRecord,
  ReferralPassengerComplaintCategory,
} from "@drts/contracts";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import { ReportingRepository } from "../../../apps/api/src/modules/reporting/reporting.repository";
import { ReportingService } from "../../../apps/api/src/modules/reporting/reporting.service";
import { ReportingController } from "../../../apps/api/src/modules/reporting/reporting.controller";
import { ReportingFilingService } from "../../../apps/api/src/modules/reporting-filing/reporting-filing.service";
import { ReportingFilingModule } from "../../../apps/api/src/modules/reporting-filing/reporting-filing.module";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { scenario } from "../referral-manual-complaints-canonical-20261020/scenario";
import { transactionalMonthlyPort } from "./transaction-port";

type Data = Record<string, unknown>;

export async function reportFixture(
  options: { orderAt?: string; caseAt?: string; duplicateRows?: boolean } = {},
) {
  // Actual existing identity + quote + booking producer and new manual intake
  // write their original shared order/CRM transaction into controlled SQL.
  const f = await scenario();
  const orderAt = options.orderAt ?? "2026-06-15T08:00:00.000Z";
  await f.change({
    status: "completed",
    createdAt: orderAt,
    reservationWindowStart: orderAt,
    reservationWindowEnd: orderAt,
    completedAt: orderAt,
  });
  const complaintTable = f.db.table("crm.phase1_complaint_cases");
  async function createCase(
    at: string,
    category: ReferralPassengerComplaintCategory = "service",
  ) {
    const submitted = await f.service.submitReferralPassengerComplaint(
      f.orderId,
      {
        orderId: f.orderId,
        category,
        content: "受控月報情境申訴",
        contactRequested: false,
        idempotencyKey: randomUUID(),
        ...(category === "lost_item"
          ? { lostItemDescription: "合成測試物品" }
          : {}),
      },
      f.identity,
    );
    const row = complaintTable.get(submitted.caseNo);
    if (!row)
      throw new Error("Real canonical intake did not persist its CRM case");
    const dated = { ...row, createdAt: at, updatedAt: at };
    complaintTable.set(submitted.caseNo, dated);
    return structuredClone(dated) as unknown as ComplaintCaseRecord;
  }
  const firstCase = await createCase(
    options.caseAt ?? "2026-08-04T08:00:00.000Z",
  );
  const monthly = new Map<string, Data>();
  const snapshotRows: Data[] = [];
  const calls: Array<{ sql: string; values: readonly unknown[] }> = [];
  // Transport/storage port only. The whole real ReportingRepository executes
  // its SQL, binds all columns and maps the readback; no aggregate is mocked.
  const runQuery = async (
    sql: string,
    values: readonly unknown[] = [],
    target = monthly,
  ) => {
    calls.push({ sql, values: structuredClone(values) });
    const insert =
      /INSERT INTO reporting\.monthly_operations_summaries\s*\(([^)]+)\)/.exec(
        sql,
      );
    if (insert) {
      const columns = insert[1]!.split(",").map((s) => s.trim());
      const row = Object.fromEntries(
        columns.map((column, i) => [
          column,
          column === "complaints_by_category"
            ? JSON.parse(String(values[i]))
            : structuredClone(values[i]),
        ]),
      );
      target.set(
        `${row.period_month}:${row.business_area}:${row.service_product_code}`,
        row,
      );
      return { rows: [], rowCount: 1 };
    }
    const table = /FROM\s+([\w.]+)/i.exec(sql)?.[1];
    if (table === "reporting.monthly_operations_summaries") {
      const predicates = [
        ...sql.matchAll(
          /(period_month|business_area|service_product_code)\s*(>=|<=|=)\s*\$(\d+)/g,
        ),
      ];
      const rows = [...target.values()].filter((row) =>
        predicates.every(([, key, operator, index]) => {
          const compared = String(row[key!]).localeCompare(
            String(values[Number(index) - 1]),
          );
          return operator === "="
            ? compared === 0
            : operator === ">="
              ? compared >= 0
              : compared <= 0;
        }),
      );
      return { rows: structuredClone(rows), rowCount: rows.length };
    }
    if (table === "reporting.dispatchable_supply_snapshots")
      return {
        rows: structuredClone(snapshotRows),
        rowCount: snapshotRows.length,
      };
    if (
      table &&
      (table.startsWith("ops.phase1_") ||
        table === "crm.phase1_complaint_cases")
    ) {
      let rows = [...f.db.table(table).values()].map((record) => ({
        record: structuredClone(record),
      }));
      if (table === "crm.phase1_complaint_cases" && options.duplicateRows)
        rows = [...rows, ...structuredClone(rows), ...structuredClone(rows)];
      return { rows, rowCount: rows.length };
    }
    throw new Error("Unexpected reporting SQL port");
  };
  const query = vi.fn((sql: string, values: readonly unknown[] = []) =>
    runQuery(sql, values, monthly),
  );
  const transactions = transactionalMonthlyPort(monthly, runQuery);
  const database = {
    isEnabled: () => true,
    query,
    connect: transactions.connect,
  } as unknown as DatabaseService;
  const vehicles = [
    {
      vehicleId: "controlled-report-vehicle",
      operatingArea: "NTP",
      plateNo: "TEST-001",
    },
  ];
  const registry = { listVehicles: () => structuredClone(vehicles) };
  const fallback = {
    listComplaintCases: () => {
      throw new Error(
        "Must read canonical persisted CRM rather than a complaint memory cache",
      );
    },
  };
  const makeService = () =>
    new ReportingService(
      f.service,
      fallback as never,
      registry as never,
      undefined,
      new ReportingRepository(database),
    );
  const service = makeService(),
    controller = new ReportingController(service);
  const audit = new AuditNotificationService(),
    filing = new ReportingFilingService(audit);
  // Invoke the actual existing module's provider registration only; no Nest
  // bootstrap, ReportingService scheduler, app/HTTP/PG/server lifecycle.
  const module = new ReportingFilingModule(
    filing,
    f.service,
    service,
    {} as never,
    registry as never,
    fallback as never,
    {} as never,
    {} as never,
  );
  module.onModuleInit();
  async function job(format: "csv" | "xlsx" | "pdf") {
    const accepted = filing.createReportJob({
      jobType: "six_month_operations_summary",
      format,
      filters: { from: "2026-05-01", to: "2026-10-31" },
    });
    await vi.waitFor(
      () => {
        if (filing.getReportJob(accepted.jobId).status !== "completed")
          throw new Error("Original asynchronous report builder still pending");
      },
      { timeout: 2000, interval: 5 },
    );
    return {
      job: filing.getReportJob(accepted.jobId),
      artifact: await filing.renderReportArtifact(accepted.jobId),
    };
  }
  return {
    ...f,
    firstCase,
    createCase,
    complaintTable,
    service,
    controller,
    makeService,
    monthly,
    database,
    registry,
    vehicles,
    transactions,
    snapshotRows,
    calls,
    filing,
    job,
  };
}
