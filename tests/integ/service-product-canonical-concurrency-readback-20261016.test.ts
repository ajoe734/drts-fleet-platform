import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DatabaseService } from "../../apps/api/src/common/db";
import { ServiceProductRepository } from "../../apps/api/src/modules/service-product/service-product.repository";
import {
  enterprise,
  productInstance,
} from "../unit/service-product-canonical-concurrency-readback-20261016/sql-boundary";

const require = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const { Pool } = require("pg") as typeof import("pg");
const seedUrl = process.env.DATABASE_URL;
// Existing ci-integ unit shards provide migrated PostGIS + DATABASE_URL and
// discover tests/integ. Never connect to PostgreSQL on the restricted worker VM.
describe.skipIf(!process.env.CI || !seedUrl)(
  "C107 hosted PostgreSQL canonical authority",
  () => {
    const databaseName = `c107_canonical_${process.pid}_${Date.now()}`;
    let admin: InstanceType<typeof Pool> | undefined;
    let observer: InstanceType<typeof Pool> | undefined;
    let poolA: InstanceType<typeof Pool> | undefined;
    let poolB: InstanceType<typeof Pool> | undefined;
    let dbA: DatabaseService;
    let dbB: DatabaseService;

    const wrap = (pool: InstanceType<typeof Pool>): DatabaseService =>
      ({
        isEnabled: () => true,
        query: pool.query.bind(pool),
        connect: pool.connect.bind(pool),
      }) as unknown as DatabaseService;

    beforeAll(async () => {
      const url = new URL(seedUrl!);
      url.pathname = "/postgres";
      admin = new Pool({ connectionString: url.toString() });
      await admin.query(`CREATE DATABASE "${databaseName}"`);
      url.pathname = `/${databaseName}`;
      // Official full migrations, including V0027 and V0057; no substitute schema.
      execFileSync("./operations/database/db-apply.sh", [], {
        cwd: path.resolve(__dirname, "../.."),
        env: { ...process.env, DATABASE_URL: url.toString() },
        stdio: "pipe",
      });
      observer = new Pool({ connectionString: url.toString(), max: 2 });
      poolA = new Pool({
        connectionString: url.toString(),
        max: 1,
        application_name: "c107-owner-a",
      });
      poolB = new Pool({
        connectionString: url.toString(),
        max: 1,
        application_name: "c107-owner-b",
      });
      dbA = wrap(poolA);
      dbB = wrap(poolB);
    }, 180_000);

    beforeEach(async () => {
      // Only this suite's newly-created throwaway database, never shared data.
      await observer!.query(
        "TRUNCATE ops.phase1_service_products, ops.runtime_profile_service_product_policies",
      );
    });

    afterAll(async () => {
      await Promise.all([poolA?.end(), poolB?.end(), observer?.end()]);
      if (admin) {
        await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
        await admin.end();
      }
    }, 30_000);

    const rows = async () =>
      (
        await observer!.query(
          "SELECT service_product_id, service_product_type, active, record FROM ops.phase1_service_products ORDER BY service_product_id",
        )
      ).rows;

    it.each([false, true])(
      "same-type concurrent create has exactly one canonical row, receipt and audit, cross-instance=%s",
      async (cross) => {
        const a = productInstance(dbA),
          b = cross ? productInstance(dbB) : a;
        await Promise.all([a.service.onModuleInit(), b.service.onModuleInit()]);
        const results = await Promise.allSettled([
          a.controller.createServiceProduct(enterprise("C107-A")),
          b.controller.createServiceProduct(enterprise("C107-B")),
        ]);
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        expect(results.filter((r) => r.status === "rejected")).toEqual([
          expect.objectContaining({
            reason: expect.objectContaining({ code: "CONFLICT" }),
          }),
        ]);
        expect(await rows()).toHaveLength(1);
        expect(
          a.audit
            .listAuditLogs()
            .filter((r) => r.moduleName === "service-product").length +
            (a === b
              ? 0
              : b.audit
                  .listAuditLogs()
                  .filter((r) => r.moduleName === "service-product").length),
        ).toBe(1);
        const restarted = productInstance(dbB);
        await restarted.service.onModuleInit();
        expect(
          (await restarted.controller.listServiceProducts()).data.items,
        ).toEqual((await rows()).map((r) => r.record));
      },
    );

    it("same-ID/different-type conflicts without overwrite; independent generated IDs survive warm peers and restart", async () => {
      const a = productInstance(dbA),
        b = productInstance(dbB);
      await Promise.all([a.service.onModuleInit(), b.service.onModuleInit()]);
      const sameId = await Promise.allSettled([
        a.controller.createServiceProduct(enterprise("SVP-000099")),
        b.controller.createServiceProduct({
          ...enterprise("SVP-000099"),
          serviceProductType: "taxi_realtime",
        }),
      ]);
      expect(sameId.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(sameId.filter((r) => r.status === "rejected")).toHaveLength(1);
      const original = (await rows())[0];
      const results = await Promise.all([
        a.controller.createServiceProduct({
          ...enterprise(),
          serviceProductType: "travel_agency_transfer",
        }),
        b.controller.createServiceProduct({
          ...enterprise(),
          serviceProductType: "insurance_replacement_vehicle",
        }),
      ]);
      expect(new Set(results.map((r) => r.data.resourceId))).toEqual(
        new Set(["SVP-000100", "SVP-000101"]),
      );
      expect((await rows())[0]).toEqual(original);
      expect(
        (await b.controller.listServiceProducts()).data.items,
      ).toHaveLength(3);
      const restarted = productInstance(dbB);
      await restarted.service.onModuleInit();
      expect(
        (await restarted.controller.listServiceProducts()).data.items,
      ).toHaveLength(3);
    });

    it("a warm peer name-only update preserves committed disable/license/timing/billing/proof fields, including reverse and interleaved updates", async () => {
      const a = productInstance(dbA),
        b = productInstance(dbB);
      await a.controller.createServiceProduct(enterprise("STABLE"));
      await b.service.onModuleInit();
      const patch = {
        active: false,
        timing: "external_defined" as const,
        allowedLicenseTypes: ["business_vehicle" as const],
        meterRequired: true,
        fixedFareAllowed: false,
        defaultBillingMode: "partner_settlement" as const,
        defaultProofRequirements: ["signoff"],
      };
      await a.controller.updateServiceProduct("STABLE", patch);
      await b.controller.updateServiceProduct("STABLE", {
        displayName: "Peer rename",
      });
      expect((await rows())[0]?.record).toMatchObject({
        ...patch,
        displayName: "Peer rename",
        serviceProductId: "STABLE",
      });
      await Promise.all([
        b.controller.updateServiceProduct("STABLE", {
          displayName: "Interleaved name",
        }),
        a.controller.updateServiceProduct("STABLE", {
          description: "Independent field",
          active: true,
        }),
      ]);
      await Promise.all([
        a.controller.updateServiceProduct("STABLE", { active: false }),
        b.controller.updateServiceProduct("STABLE", {
          displayName: "Final name",
        }),
      ]);
      expect(await b.service.getServiceProduct("STABLE")).toMatchObject({
        ...patch,
        displayName: "Final name",
        description: "Independent field",
      });
      await a.controller.upsertRuntimePolicy(
        "business_dispatch",
        "enterprise_dispatch",
        {
          runtimeProfileCode: "business_dispatch",
          serviceProductCode: "enterprise_dispatch",
          active: true,
          effectiveFrom: "2026-01-01T00:00:00Z",
        },
      );
      await b.service.prepareRuntimeProfileServiceProduct(
        "business_dispatch",
        "enterprise_dispatch",
      );
      expect(
        b.service.getRuntimeServiceProductByType("enterprise_dispatch"),
      ).toMatchObject({ ...patch, serviceProductId: "STABLE" });
      expect(
        b.service.assertRuntimeProfileServiceProductActive(
          "business_dispatch",
          "enterprise_dispatch",
        ).active,
      ).toBe(true);
      await a.controller.upsertRuntimePolicy(
        "business_dispatch",
        "enterprise_dispatch",
        {
          runtimeProfileCode: "business_dispatch",
          serviceProductCode: "enterprise_dispatch",
          active: false,
          effectiveFrom: "2026-01-01T00:00:00Z",
        },
      );
      expect(
        (await b.controller.listRuntimePolicies()).data.items[0]?.active,
      ).toBe(false);
      await b.service.prepareRuntimeProfileServiceProduct(
        "business_dispatch",
        "enterprise_dispatch",
      );
      expect(() =>
        b.service.assertRuntimeProfileServiceProductActive(
          "business_dispatch",
          "enterprise_dispatch",
        ),
      ).toThrow();
    });

    it("an actual competing table lock withholds create success and canonical state until durable transaction ACK", async () => {
      const lock = await observer!.connect();
      const a = productInstance(dbA);
      let settled = false;
      let creation:
        | ReturnType<typeof a.controller.createServiceProduct>
        | undefined;
      try {
        await lock.query("BEGIN");
        await lock.query(
          "LOCK TABLE ops.phase1_service_products IN SHARE ROW EXCLUSIVE MODE",
        );
        creation = a.controller
          .createServiceProduct(enterprise("LOCKED"))
          .then((result) => {
            settled = true;
            return result;
          });
        // Observe PostgreSQL's actual lock wait, not an assumed scheduling delay.
        await expect
          .poll(
            async () =>
              (
                await observer!.query(
                  "SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = 'c107-owner-a' AND wait_event_type = 'Lock'",
                )
              ).rows[0]?.n,
          )
          .toBe(1);
        expect(settled).toBe(false);
        expect(await rows()).toEqual([]);
        expect(
          a.audit
            .listAuditLogs()
            .filter((r) => r.moduleName === "service-product"),
        ).toEqual([]);
        await lock.query("COMMIT");
        expect((await creation).data.status).toBe("completed");
        expect(await rows()).toHaveLength(1);
      } finally {
        await lock.query("ROLLBACK");
        lock.release();
        await creation;
      }
    });

    it.each([false, true])(
      "lost COMMIT response is reconciled from actual PG identity without false audit or retry, committed=%s",
      async (committed) => {
        const faultDb = {
          isEnabled: () => true,
          query: poolA!.query.bind(poolA),
          connect: async () => {
            const client = await poolA!.connect();
            return {
              release: client.release.bind(client),
              query: async (sql: string, values?: unknown[]) => {
                if (sql === "COMMIT") {
                  if (committed) await client.query(sql);
                  throw new Error("lost_commit_response");
                }
                return client.query(sql, values);
              },
            };
          },
        };
        const a = productInstance(faultDb);
        await expect(
          a.controller.createServiceProduct(enterprise("UNCERTAIN")),
        ).rejects.toThrow("lost_commit_response");
        expect(
          a.audit
            .listAuditLogs()
            .filter((r) => r.moduleName === "service-product"),
        ).toEqual([]);
        expect(await rows()).toHaveLength(committed ? 1 : 0);
        const restarted = productInstance(dbB);
        await restarted.service.onModuleInit();
        expect(
          (await restarted.controller.listServiceProducts()).data.items,
        ).toHaveLength(committed ? 1 : 0);
        if (committed)
          await expect(
            restarted.controller.createServiceProduct(enterprise("UNCERTAIN")),
          ).rejects.toMatchObject({ code: "CONFLICT" });
        else
          expect(
            (
              await restarted.controller.createServiceProduct(
                enterprise("UNCERTAIN"),
              )
            ).data.status,
          ).toBe("completed");
      },
    );

    it("legacy duplicate types fail list/get/runtime/startup and preserve both original rows", async () => {
      const a = productInstance(dbA);
      const record = await a.service.createServiceProduct(
        enterprise("LEGACY-A"),
      );
      await new ServiceProductRepository(dbA).persistChanges({
        records: [{ ...record, serviceProductId: "LEGACY-B" }],
      });
      const before = await rows();
      await expect(a.controller.listServiceProducts()).rejects.toMatchObject({
        code: "CONFLICT",
      });
      await expect(
        Promise.resolve(a.service.getServiceProduct("LEGACY-A")),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(
        a.service.prepareRuntimeProfileServiceProduct(
          "business_dispatch",
          "enterprise_dispatch",
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(
        productInstance(dbB).service.onModuleInit(),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(await rows()).toEqual(before);
    });
  },
);
