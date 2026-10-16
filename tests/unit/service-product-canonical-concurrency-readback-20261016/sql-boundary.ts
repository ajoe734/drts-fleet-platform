import { expect } from "vitest";

import type { DatabaseService } from "../../../apps/api/src/common/db";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ServiceProductController } from "../../../apps/api/src/modules/service-product/service-product.controller";
import { ServiceProductRepository } from "../../../apps/api/src/modules/service-product/service-product.repository";
import { ServiceProductService } from "../../../apps/api/src/modules/service-product/service-product.service";
import type {
  ServiceProductRecord,
  RuntimeProfileServiceProductPolicy,
} from "../../../apps/api/src/modules/service-product/service-product.types";

type Result = { rows: { record: unknown }[]; rowCount: number };
type Pending = {
  sql: string;
  params: readonly unknown[];
  resolve: () => void;
  reject: (error: unknown) => void;
};
type Transaction = {
  products?: Map<string, ServiceProductRecord>;
  unlock?: () => void;
  released?: boolean;
};

/** Socket-free SQL transport, NOT PostgreSQL. It executes only the repository's
 * statements/parameters. It models PK/transactions/lock queues, never product
 * type uniqueness, allocation, partial-update rules or service validation. */
export class ProductSqlBoundary {
  products = new Map<string, ServiceProductRecord>();
  policies = new Map<string, RuntimeProfileServiceProductPolicy>();
  pendingQueries: Pending[] = [];
  queries: { sql: string; params: readonly unknown[]; transaction: boolean }[] =
    [];
  mode: "defer" | "resolve" | { reject: Error } = "resolve";
  commitMode: "resolve" | "defer" | "reject-before" | "reject-after" =
    "resolve";
  pendingCommits: Pending[] = [];
  readError: Error | undefined;
  private lockTail: Promise<void> = Promise.resolve();

  isEnabled() {
    return true;
  }

  async connect() {
    const tx: Transaction = {};
    return {
      query: (sql: string, params: readonly unknown[] = []) =>
        this.execute(sql, params, tx),
      release: () => {
        expect(tx.released).not.toBe(true);
        tx.released = true;
        tx.unlock?.();
      },
    };
  }

  query = (sql: string, params: readonly unknown[] = []) =>
    this.execute(sql, params);

  private async execute(
    sql: string,
    params: readonly unknown[],
    tx?: Transaction,
  ): Promise<Result> {
    const q = sql.replace(/\s+/g, " ").trim();
    this.queries.push({
      sql: q,
      params: structuredClone(params),
      transaction: !!tx,
    });
    const empty = { rows: [], rowCount: 0 };
    if (q === "BEGIN ISOLATION LEVEL READ COMMITTED") {
      expect(tx).toBeDefined();
      return empty;
    }
    if (
      q === "LOCK TABLE ops.phase1_service_products IN SHARE ROW EXCLUSIVE MODE"
    ) {
      if (!tx) throw new Error("lock without transaction");
      const previous = this.lockTail;
      this.lockTail = new Promise<void>((resolve) => {
        tx.unlock = resolve;
      });
      await previous;
      tx.products = structuredClone(this.products);
      return empty;
    }
    if (q === "COMMIT") {
      if (!tx) throw new Error("commit without transaction");
      const apply = () => {
        if (tx.products) this.products = tx.products;
        tx.unlock?.();
        return empty;
      };
      if (this.commitMode === "reject-before")
        throw new Error("commit_ack_lost");
      if (this.commitMode === "reject-after") {
        apply();
        throw new Error("commit_ack_lost");
      }
      if (this.commitMode === "defer")
        return this.defer(this.pendingCommits, sql, params, apply);
      return apply();
    }
    if (q === "ROLLBACK") {
      if (!tx) throw new Error("rollback without transaction");
      delete tx.products;
      tx.unlock?.();
      return empty;
    }

    const products = tx?.products ?? this.products;
    if (
      /^SELECT record FROM ops\.phase1_service_products(?: WHERE service_product_(?:id|type) = \$1)?(?: ORDER BY created_at DESC)?(?: FOR UPDATE)?$/.test(
        q,
      )
    ) {
      if (this.readError) throw this.readError;
      let records = [...products.values()];
      if (q.includes("WHERE service_product_id"))
        records = records.filter((r) => r.serviceProductId === params[0]);
      if (q.includes("WHERE service_product_type"))
        records = records.filter((r) => r.serviceProductType === params[0]);
      if (q.includes("ORDER BY"))
        records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return {
        rows: records.map((record) => ({ record: structuredClone(record) })),
        rowCount: records.length,
      };
    }
    if (
      /^SELECT record FROM ops\.runtime_profile_service_product_policies(?: WHERE runtime_profile_code = \$1 AND service_product_code = \$2| ORDER BY runtime_profile_code, service_product_code)$/.test(
        q,
      )
    ) {
      if (this.readError) throw this.readError;
      let records = [...this.policies.values()];
      if (q.includes("WHERE"))
        records = records.filter(
          (r) =>
            r.runtimeProfileCode === params[0] &&
            r.serviceProductCode === params[1],
        );
      records.sort(
        (a, b) =>
          a.runtimeProfileCode.localeCompare(b.runtimeProfileCode) ||
          a.serviceProductCode.localeCompare(b.serviceProductCode),
      );
      return {
        rows: records.map((record) => ({ record: structuredClone(record) })),
        rowCount: records.length,
      };
    }
    if (
      q ===
        "INSERT INTO ops.phase1_service_products ( service_product_id, service_product_type, display_name, active, timing, allowed_license_types, meter_required, fixed_fare_allowed, default_billing_mode, created_at, updated_at, record ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12::jsonb)" ||
      q ===
        "UPDATE ops.phase1_service_products SET service_product_type = $2, display_name = $3, active = $4, timing = $5, allowed_license_types = $6::jsonb, meter_required = $7, fixed_fare_allowed = $8, default_billing_mode = $9, created_at = $10, updated_at = $11, record = $12::jsonb WHERE service_product_id = $1"
    ) {
      expect(tx?.products).toBeDefined();
      expect(params).toHaveLength(12);
      expect(q).not.toContain("ON CONFLICT");
      const record = JSON.parse(params[11] as string) as ServiceProductRecord;
      expect(params.slice(0, 11)).toEqual([
        record.serviceProductId,
        record.serviceProductType,
        record.displayName,
        record.active,
        record.timing,
        JSON.stringify(record.allowedLicenseTypes),
        record.meterRequired,
        record.fixedFareAllowed,
        record.defaultBillingMode,
        record.createdAt,
        record.updatedAt,
      ]);
      return this.write(sql, params, () => {
        if (q.startsWith("INSERT") && products.has(record.serviceProductId))
          throw new Error("duplicate primary key");
        if (q.startsWith("UPDATE") && !products.has(record.serviceProductId))
          return empty;
        products.set(record.serviceProductId, structuredClone(record));
        return { rows: [], rowCount: 1 };
      });
    }
    if (
      q ===
      "INSERT INTO ops.runtime_profile_service_product_policies ( runtime_profile_code, service_product_code, active, effective_from, effective_until, created_at, updated_at, record ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb) ON CONFLICT (runtime_profile_code, service_product_code) DO UPDATE SET active = EXCLUDED.active, effective_from = EXCLUDED.effective_from, effective_until = EXCLUDED.effective_until, updated_at = EXCLUDED.updated_at, record = EXCLUDED.record"
    ) {
      expect(params).toHaveLength(8);
      const record = JSON.parse(
        params[7] as string,
      ) as RuntimeProfileServiceProductPolicy;
      expect(params.slice(0, 7)).toEqual([
        record.runtimeProfileCode,
        record.serviceProductCode,
        record.active,
        record.effectiveFrom,
        record.effectiveUntil,
        record.createdAt,
        record.updatedAt,
      ]);
      return this.write(sql, params, () => {
        this.policies.set(`${params[0]}:${params[1]}`, structuredClone(record));
        return { rows: [], rowCount: 1 };
      });
    }
    throw new Error(`Unexpected production SQL: ${q}`);
  }

  private write(sql: string, params: readonly unknown[], apply: () => Result) {
    if (typeof this.mode === "object") throw this.mode.reject;
    if (this.mode === "defer")
      return this.defer(this.pendingQueries, sql, params, apply);
    return apply();
  }

  private defer(
    queue: Pending[],
    sql: string,
    params: readonly unknown[],
    apply: () => Result,
  ) {
    return new Promise<Result>((resolve, reject) => {
      queue.push({
        sql,
        params,
        resolve: () => {
          try {
            resolve(apply());
          } catch (e) {
            reject(e);
          }
        },
        reject,
      });
    });
  }
}

export function productInstance(
  database: Pick<DatabaseService, "isEnabled"> & object,
) {
  const audit = new AuditNotificationService();
  const repository = new ServiceProductRepository(database as DatabaseService);
  const service = new ServiceProductService(audit, repository);
  return {
    audit,
    repository,
    service,
    controller: new ServiceProductController(service),
  };
}

export const enterprise = (serviceProductId?: string) => ({
  ...(serviceProductId !== undefined ? { serviceProductId } : {}),
  serviceProductType: "enterprise_dispatch" as const,
  displayName: "Enterprise",
  timing: "reservation" as const,
  allowedLicenseTypes: ["taxi", "business_vehicle"] as (
    | "taxi"
    | "business_vehicle"
  )[],
  defaultBillingMode: "tenant_invoice" as const,
  defaultProofRequirements: ["photo"],
});

export async function flushProductMicrotasks(turns = 40) {
  for (let i = 0; i < turns; i++) await Promise.resolve();
}
