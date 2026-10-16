import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import {
  ProductSqlBoundary,
  enterprise,
  flushProductMicrotasks,
  productInstance,
} from "./sql-boundary";

describe("C107 canonical controller/service/repository (controlled SQL, not PG)", () => {
  it.each([false, true])(
    "F2a/F2b: duplicate type is rejected before a second persisted row; cross-instance=%s",
    async (crossInstance) => {
      const db = new ProductSqlBoundary();
      const a = productInstance(db),
        b = crossInstance ? productInstance(db) : a;
      await Promise.all([a.service.onModuleInit(), b.service.onModuleInit()]);
      const outcomes = await Promise.allSettled([
        a.controller.createServiceProduct(
          enterprise("C107-CONCURRENT-1"),
          "req-first",
        ),
        b.controller.createServiceProduct(
          enterprise("C107-CONCURRENT-2"),
          "req-second",
        ),
      ]);
      expect(outcomes.map((o) => o.status).sort()).toEqual([
        "fulfilled",
        "rejected",
      ]);
      const failure = outcomes.find((o) => o.status === "rejected")!;
      expect(failure.reason).toBeInstanceOf(ApiRequestError);
      expect(failure.reason.getStatus()).toBe(409);
      expect(db.products.size).toBe(1);
      expect(
        db.queries.filter((q) =>
          q.sql.startsWith("INSERT INTO ops.phase1_service_products"),
        ),
      ).toHaveLength(1);
      expect(
        a.audit
          .listAuditLogs()
          .filter((r) => r.moduleName === "service-product").length +
          (b === a
            ? 0
            : b.audit
                .listAuditLogs()
                .filter((r) => r.moduleName === "service-product").length),
      ).toBe(1);
      const restarted = productInstance(db);
      await restarted.service.onModuleInit();
      expect(
        (await restarted.controller.listServiceProducts()).data.items,
      ).toEqual([...db.products.values()]);
      expect(
        (await a.controller.listServiceProducts()).data.items,
      ).toHaveLength(1);
    },
  );

  it.each([false, true])(
    "same-ID/different-type creates cannot overwrite an ACK, cross-instance=%s",
    async (cross) => {
      const db = new ProductSqlBoundary();
      const a = productInstance(db),
        b = cross ? productInstance(db) : a;
      const results = await Promise.allSettled([
        a.controller.createServiceProduct(enterprise("EXPLICIT-ID")),
        b.controller.createServiceProduct({
          ...enterprise("EXPLICIT-ID"),
          serviceProductType: "taxi_realtime",
        }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toEqual([
        expect.objectContaining({
          reason: expect.objectContaining({ code: "CONFLICT" }),
        }),
      ]);
      expect(db.products.size).toBe(1);
      expect(db.products.get("EXPLICIT-ID")?.serviceProductType).toBe(
        "enterprise_dispatch",
      );
      const restart = productInstance(db);
      await restart.service.onModuleInit();
      expect(await restart.service.getServiceProduct("EXPLICIT-ID")).toEqual(
        db.products.get("EXPLICIT-ID"),
      );
    },
  );

  it.each([false, true])(
    "F2c: simultaneous generated IDs preserve both acknowledged types and existing numeric/explicit IDs, cross-instance=%s",
    async (cross) => {
      const db = new ProductSqlBoundary();
      const a = productInstance(db),
        b = cross ? productInstance(db) : a;
      await Promise.all([a.service.onModuleInit(), b.service.onModuleInit()]);
      const receipts = await Promise.all([
        a.controller.createServiceProduct(
          enterprise(),
          "req-generated-enterprise",
        ),
        b.controller.createServiceProduct(
          {
            ...enterprise(),
            serviceProductType: "taxi_realtime",
            timing: "realtime",
            allowedLicenseTypes: ["taxi"],
            defaultBillingMode: "meter",
          },
          "req-generated-taxi",
        ),
      ]);
      expect(receipts.map((r) => r.data.resourceId)).toEqual([
        "SVP-000001",
        "SVP-000002",
      ]);
      expect(db.products.size).toBe(2);
      await expect(
        b.controller.createServiceProduct({
          ...enterprise("SVP-000001"),
          serviceProductType: "travel_agency_transfer",
        }),
      ).rejects.toMatchObject({
        response: { error: { message: "Service product ID already exists." } },
      });
      expect(db.products.get("SVP-000001")?.serviceProductType).toBe(
        "enterprise_dispatch",
      );
      await a.controller.createServiceProduct({
        ...enterprise("SVP-000099"),
        serviceProductType: "travel_agency_transfer",
      });
      const next = await b.controller.createServiceProduct({
        ...enterprise(),
        serviceProductType: "insurance_replacement_vehicle",
      });
      expect(next.data.resourceId).toBe("SVP-000100");
      const restarted = productInstance(db);
      await restarted.service.onModuleInit();
      expect(
        (await restarted.controller.listServiceProducts()).data.items,
      ).toHaveLength(4);
    },
  );

  it("F3: a stale name-only update preserves every committed unsupplied policy field and stable identity", async () => {
    const db = new ProductSqlBoundary();
    const seed = productInstance(db);
    await seed.controller.createServiceProduct(enterprise("C107-STABLE-ID"));
    const a = productInstance(db),
      b = productInstance(db);
    await Promise.all([a.service.onModuleInit(), b.service.onModuleInit()]);
    const patch = {
      active: false,
      timing: "external_defined" as const,
      allowedLicenseTypes: ["business_vehicle" as const],
      meterRequired: true,
      fixedFareAllowed: false,
      defaultBillingMode: "partner_settlement" as const,
      defaultProofRequirements: ["signoff", "voucher"],
    };
    await a.controller.updateServiceProduct(
      "C107-STABLE-ID",
      patch,
      "req-disable",
    );
    const previous = structuredClone(db.products.get("C107-STABLE-ID"));
    await b.controller.updateServiceProduct(
      "C107-STABLE-ID",
      { displayName: "Only a renamed label" },
      "req-rename",
    );
    expect(db.products.get("C107-STABLE-ID")).toMatchObject({
      ...previous,
      ...patch,
      displayName: "Only a renamed label",
      updatedAt: expect.any(String),
    });
    const fresh = productInstance(db);
    await fresh.service.onModuleInit();
    await fresh.service.prepareRuntimeProfileServiceProduct(
      "business_dispatch",
      "enterprise_dispatch",
    );
    expect(
      fresh.service.getRuntimeServiceProductByType("enterprise_dispatch"),
    ).toMatchObject({ serviceProductId: "C107-STABLE-ID", ...patch });
    // Reverse order and overlapping independent updates both use the locked row.
    await Promise.all([
      b.controller.updateServiceProduct("C107-STABLE-ID", {
        displayName: "Independent name",
      }),
      a.controller.updateServiceProduct("C107-STABLE-ID", {
        description: "Independent description",
        active: true,
      }),
    ]);
    expect(await b.service.getServiceProduct("C107-STABLE-ID")).toMatchObject({
      ...patch,
      displayName: "Independent name",
      description: "Independent description",
      active: true,
    });
    await Promise.all([
      a.controller.updateServiceProduct("C107-STABLE-ID", { active: false }),
      b.controller.updateServiceProduct("C107-STABLE-ID", {
        displayName: "Final name",
      }),
    ]);
    expect(await a.service.getServiceProduct("C107-STABLE-ID")).toMatchObject({
      ...patch,
      displayName: "Final name",
      description: "Independent description",
    });
  });

  it("F4: warmed empty peer lists/gets current canonical rows and runtime policies, with detached envelopes", async () => {
    const db = new ProductSqlBoundary();
    const a = productInstance(db),
      b = productInstance(db);
    await Promise.all([a.service.onModuleInit(), b.service.onModuleInit()]);
    expect((await b.controller.listServiceProducts()).data.items).toEqual([]);
    await a.controller.createServiceProduct(enterprise("C107-NEW-ID"));
    const result = await b.controller.listServiceProducts("req-other-list");
    expect(result.meta.requestId).toBe("req-other-list");
    expect(result.data.items).toEqual([...db.products.values()]);
    result.data.items[0]!.allowedLicenseTypes.length = 0;
    expect(
      (await b.service.getServiceProduct("C107-NEW-ID")).allowedLicenseTypes,
    ).toEqual(["taxi", "business_vehicle"]);
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
    const policies = await b.controller.listRuntimePolicies("req-policies");
    expect(policies.meta.requestId).toBe("req-policies");
    expect(policies.data.items).toHaveLength(1);
    await a.controller.upsertRuntimePolicy(
      "business_dispatch",
      "enterprise_dispatch",
      { ...policies.data.items[0]!, active: false },
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
    ).toThrow(ApiRequestError);
  });

  it.each(["reject-before", "reject-after"] as const)(
    "uncertain COMMIT %s rejects without audit or invented ACK; canonical ID read determines retry/conflict",
    async (mode) => {
      const db = new ProductSqlBoundary();
      const a = productInstance(db);
      db.commitMode = mode;
      await expect(
        a.controller.createServiceProduct(enterprise(), "req-ambiguous"),
      ).rejects.toThrow("commit_ack_lost");
      expect(
        a.audit
          .listAuditLogs()
          .filter((r) => r.moduleName === "service-product"),
      ).toEqual([]);
      expect(a.service.listServiceProducts()).toEqual([]);
      expect(
        db.queries.some(
          (q) =>
            q.sql.includes("WHERE service_product_id = $1") &&
            q.params[0] === "SVP-000001" &&
            !q.transaction,
        ),
      ).toBe(true);
      expect(db.products.size).toBe(mode === "reject-after" ? 1 : 0);
      db.commitMode = "resolve";
      const restarted = productInstance(db);
      await restarted.service.onModuleInit();
      expect(
        (await restarted.controller.listServiceProducts()).data.items,
      ).toHaveLength(db.products.size);
      if (mode === "reject-after")
        await expect(
          a.controller.createServiceProduct(enterprise()),
        ).rejects.toMatchObject({
          response: {
            error: { message: "Service product type already exists." },
          },
        });
      else
        expect(
          (await a.controller.createServiceProduct(enterprise())).data.status,
        ).toBe("completed");
    },
  );

  it("withholds state/audit/receipt through pending COMMIT and preserves a durable ambiguous disable against a stale rename", async () => {
    const db = new ProductSqlBoundary();
    const a = productInstance(db),
      b = productInstance(db);
    db.commitMode = "defer";
    let settled = false;
    const creation = a.controller
      .createServiceProduct(enterprise("C107-COMMIT"))
      .then((r) => {
        settled = true;
        return r;
      });
    await flushProductMicrotasks();
    expect(db.pendingCommits).toHaveLength(1);
    expect(settled).toBe(false);
    expect(a.service.listServiceProducts()).toEqual([]);
    expect((await b.controller.listServiceProducts()).data.items).toEqual([]);
    expect(
      a.audit.listAuditLogs().filter((r) => r.moduleName === "service-product"),
    ).toEqual([]);
    db.pendingCommits[0]!.resolve();
    await creation;
    await b.service.onModuleInit();
    db.commitMode = "reject-after";
    await expect(
      a.controller.updateServiceProduct("C107-COMMIT", {
        active: false,
        allowedLicenseTypes: ["business_vehicle"],
      }),
    ).rejects.toThrow("commit_ack_lost");
    expect(
      a.audit.listAuditLogs().filter((r) => r.moduleName === "service-product"),
    ).toHaveLength(1);
    db.commitMode = "resolve";
    await b.controller.updateServiceProduct("C107-COMMIT", {
      displayName: "Later label",
    });
    expect(await a.service.getServiceProduct("C107-COMMIT")).toMatchObject({
      active: false,
      allowedLicenseTypes: ["business_vehicle"],
      displayName: "Later label",
    });
  });

  it("canonical errors fail closed and legacy duplicate types are surfaced without deleting/winning rows", async () => {
    const db = new ProductSqlBoundary();
    const a = productInstance(db);
    await a.controller.createServiceProduct(enterprise("LEGACY-A"));
    db.products.set("LEGACY-B", {
      ...db.products.get("LEGACY-A")!,
      serviceProductId: "LEGACY-B",
    });
    const original = structuredClone([...db.products.values()]);
    await expect(a.controller.listServiceProducts()).rejects.toMatchObject({
      response: { error: { message: "Ambiguous canonical service products." } },
    });
    await expect(
      Promise.resolve(a.service.getServiceProduct("LEGACY-A")),
    ).rejects.toMatchObject({
      response: { error: { message: "Ambiguous canonical service products." } },
    });
    await expect(
      a.service.prepareRuntimeProfileServiceProduct(
        "business_dispatch",
        "enterprise_dispatch",
      ),
    ).rejects.toMatchObject({
      response: { error: { message: "Ambiguous canonical service products." } },
    });
    await expect(
      productInstance(db).service.onModuleInit(),
    ).rejects.toMatchObject({
      response: { error: { message: "Ambiguous canonical service products." } },
    });
    await expect(
      a.controller.updateServiceProduct("LEGACY-A", { active: false }),
    ).rejects.toMatchObject({
      response: { error: { message: "Ambiguous canonical service products." } },
    });
    expect([...db.products.values()]).toEqual(original);
    db.readError = new Error("canonical_read_failed");
    await expect(a.controller.listServiceProducts()).rejects.toThrow(
      "canonical_read_failed",
    );
    await expect(a.controller.listRuntimePolicies()).rejects.toThrow(
      "canonical_read_failed",
    );
    await expect(
      a.service.prepareRuntimeProfileServiceProduct(
        "business_dispatch",
        "enterprise_dispatch",
      ),
    ).rejects.toThrow("canonical_read_failed");
    await expect(
      Promise.resolve(a.service.getServiceProduct("LEGACY-A")),
    ).rejects.toThrow("canonical_read_failed");
    await expect(
      a.controller.createServiceProduct({
        ...enterprise(),
        serviceProductType: "taxi_realtime",
      }),
    ).rejects.toThrow("canonical_read_failed");
    db.readError = undefined;
    db.products.delete("LEGACY-B"); // Test-only fixture restoration; production never cleans up.
    await expect(
      Promise.resolve(a.service.getServiceProduct("missing")),
    ).rejects.toMatchObject({
      response: { error: { message: "Service product not found." } },
    });
    await expect(
      a.controller.updateServiceProduct("missing", { active: false }),
    ).rejects.toMatchObject({
      response: { error: { message: "Service product not found." } },
    });
    expect(() => a.service.getServiceProduct(" ")).toThrow(ApiRequestError);
  });
});
