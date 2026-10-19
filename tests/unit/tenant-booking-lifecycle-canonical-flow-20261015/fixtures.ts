import { vi } from "vitest";
import type { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import type { OwnedOrderRecord } from "@drts/contracts";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityController } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.controller";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../../apps/api/src/modules/callcenter/callcenter.service";
import { OwnedMobilityTaskEventsService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { buildOrderFixture } from "../../../apps/api/tests/integration/voice-order-fixture";

export const tenantId = "tenant-demo-001";
export const clone = <T>(value: T): T => structuredClone(value);
export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
export function order(overrides: Partial<OwnedOrderRecord> = {}) {
  return buildOrderFixture({
    orderId: "tenant-lifecycle-order",
    aggregateVersion: 1,
    bookingId: "tenant-lifecycle-booking",
    tenantId,
    orderSource: "portal",
    businessDispatchSubtype: "enterprise_dispatch",
    dispatchSemantics: "reservation",
    serviceBucket: "business_dispatch",
    reservationWindowStart: new Date(Date.now() + 3 * 3600_000).toISOString(),
    reservationWindowEnd: new Date(Date.now() + 4 * 3600_000).toISOString(),
    modifiableUntil: new Date(Date.now() + 2 * 3600_000).toISOString(),
    cancelableUntil: new Date(Date.now() + 2 * 3600_000).toISOString(),
    ...overrides,
  });
}
// Only the external SQL transport is simulated. Real repository SQL, real
// transactions, command guards, controller and all business projections run.
export class SqlTransport {
  committed: OwnedOrderRecord;
  statements: string[] = [];
  holdCommit: ReturnType<typeof deferred> | null = null;
  enteredCommit = deferred();
  enteredWrite = deferred();
  enteredRequestWrite = deferred();
  holdRequestWrite: ReturnType<typeof deferred> | null = null;
  holdWrite: ReturnType<typeof deferred> | null = null;
  failWrite = false;
  failTable: string | null = null;
  tables: Record<string, Array<Record<string, unknown>>> = {};
  private tail = Promise.resolve();
  constructor(row: OwnedOrderRecord) {
    this.committed = clone({
      ...row,
      aggregateVersion: row.aggregateVersion ?? 1,
    });
  }
  isEnabled() {
    return true;
  }
  async query(sql: string, values: unknown[] = []) {
    if (/(?:INSERT INTO|UPDATE) ops\.phase1_owned_orders/.test(sql))
      await this.tail;
    return this.execute(sql, values, null, () => this.committed, this.tables);
  }
  async connect() {
    const previous = this.tail;
    const release = deferred();
    this.tail = previous.then(() => release.promise);
    await previous;
    let pending = clone(this.committed);
    const pendingTables = clone(this.tables);
    return {
      query: async (sql: string, values: unknown[] = []) => {
        if (sql.trim() === "COMMIT") {
          this.enteredCommit.resolve();
          if (this.holdCommit) await this.holdCommit.promise;
          this.committed = clone(pending);
          this.tables = clone(pendingTables);
        }
        return this.execute(
          sql,
          values,
          (next) => {
            pending = next;
          },
          () => pending,
          pendingTables,
        );
      },
      release: () => release.resolve(),
    };
  }
  private async execute(
    sql: string,
    values: unknown[],
    write: ((row: OwnedOrderRecord) => void) | null,
    read = () => this.committed,
    tables = this.tables,
  ) {
    this.statements.push(sql);
    if (/SELECT\s+COUNT\(/i.test(sql))
      return { rows: [{ count: 0 }], rowCount: 1 };
    if (/SELECT[\s\S]*FROM ops\.phase1_owned_orders/.test(sql)) {
      const row = read();
      return {
        rows: [
          { record: clone(row), aggregate_version: row.aggregateVersion ?? 1 },
        ],
        rowCount: 1,
      };
    }
    if (/(?:INSERT INTO|UPDATE) ops\.phase1_owned_orders/.test(sql)) {
      this.enteredWrite.resolve();
      if (this.holdWrite) await this.holdWrite.promise;
      if (this.failWrite)
        throw new Error("controlled real repository order write rejected");
      const json = values.find(
        (value) =>
          typeof value === "string" &&
          value.startsWith("{") &&
          value.includes('"orderId"'),
      );
      if (json) {
        const next = JSON.parse(json as string) as OwnedOrderRecord;
        if (write) write(next);
        else this.committed = clone(next);
        return {
          rows: [{ aggregate_version: next.aggregateVersion ?? 2 }],
          rowCount: 1,
        };
      }
    }
    // Generic JSON row storage for existing Tenant repository SQL. This models
    // SQL transport ACK/rollback/row locks only; no workflow/quota decision is mocked.
    const table = sql.match(/(?:FROM|INTO)\s+(core\.phase1_tenant_\w+)/)?.[1];
    if (table) {
      const rows = (tables[table] ??= []);
      if (/INSERT INTO/.test(sql)) {
        if (table === "core.phase1_tenant_approval_requests") {
          this.enteredRequestWrite.resolve();
          if (this.holdRequestWrite) await this.holdRequestWrite.promise;
        }
        if (this.failTable === table)
          throw new Error("controlled real repository request write rejected");
        const raw = values.find(
          (value) => typeof value === "string" && value.startsWith("{"),
        );
        if (!raw) return { rows: [], rowCount: 0 };
        const record = JSON.parse(raw as string) as Record<string, unknown>;
        const key = (item: Record<string, unknown>) =>
          String(
            item.decisionId ??
              item.ledgerEntryId ??
              item.approvalRequestId ??
              [
                item.tenantId,
                item.costCenterCode,
                item.period,
                item.periodKey,
              ].join(":"),
          );
        const index = rows.findIndex((item) => key(item) === key(record));
        if (index >= 0 && sql.includes("DO NOTHING"))
          return { rows: [], rowCount: 0 };
        if (index >= 0) rows[index] = clone(record);
        else rows.push(clone(record));
        return {
          rows: sql.includes("RETURNING") ? [{ record: clone(record) }] : [],
          rowCount: 1,
        };
      }
      if (/SELECT/.test(sql)) {
        const fields = {
          tenant_id: "tenantId",
          booking_id: "bookingId",
          approval_request_id: "approvalRequestId",
          period_key: "periodKey",
        };
        const selected = rows.filter((row) =>
          Object.entries(fields).every(([column, field]) => {
            const binding = sql.match(
              new RegExp(column + "\\s*=\\s*\\$(\\d+)"),
            );
            return !binding || row[field] === values[Number(binding[1]) - 1];
          }),
        );
        return {
          rows: selected.map((record) => ({ record: clone(record) })),
          rowCount: selected.length,
        };
      }
    }
    return { rows: [], rowCount: 0 };
  }
}
export function harness(
  row = order(),
  db?: SqlTransport,
  tenant?: TenantPartnerService,
) {
  const audit = new AuditNotificationService();
  const emitter = { emit: vi.fn() } as never;
  const service = new OwnedMobilityService(
    {
      getEligibleCandidates: () => [],
      getVehicleDispatchability: () => true,
      getDriverAvailability: () => true,
    } as never,
    audit,
    new CallcenterService(audit),
    new OwnedMobilityTaskEventsService(emitter),
    new OpsDispatchEventsService(emitter),
    db ? new OwnedMobilityRepository(db as never) : undefined,
    tenant,
  );
  (service as unknown as { orders: OwnedOrderRecord[] }).orders = [clone(row)];
  const controller = new OwnedMobilityController(service, {} as never);
  return { service, controller, audit };
}
