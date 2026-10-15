import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ServiceProductController } from "../../../apps/api/src/modules/service-product/service-product.controller";
import { ServiceProductRepository } from "../../../apps/api/src/modules/service-product/service-product.repository";
import { ServiceProductService } from "../../../apps/api/src/modules/service-product/service-product.service";

interface DeferredQuery {
  sql: string;
  params: unknown[];
  resolve: (value?: { rows: unknown[]; rowCount: number }) => void;
  reject: (error: unknown) => void;
}

function createDeferredHarness() {
  const pendingQueries: DeferredQuery[] = [];
  let nextMode: "defer" | "resolve" | { reject: Error } = "defer";

  const databaseService: Pick<DatabaseService, "isEnabled" | "query"> = {
    isEnabled: () => true,
    query: (async (sql: string, params: unknown[] = []) => {
      if (nextMode === "resolve") {
        return { rows: [], rowCount: 1 };
      }
      if (typeof nextMode === "object" && "reject" in nextMode) {
        throw nextMode.reject;
      }
      return await new Promise<{ rows: unknown[]; rowCount: number }>(
        (resolve, reject) => {
          pendingQueries.push({
            sql,
            params,
            resolve: (value = { rows: [], rowCount: 1 }) => resolve(value),
            reject,
          });
        },
      );
    }) as DatabaseService["query"],
  };

  const auditNotificationService = new AuditNotificationService();
  const repository = new ServiceProductRepository(
    databaseService as DatabaseService,
  );
  const service = new ServiceProductService(
    auditNotificationService,
    repository,
  );
  const controller = new ServiceProductController(service);

  return {
    pendingQueries,
    setMode(mode: "defer" | "resolve" | { reject: Error }) {
      nextMode = mode;
    },
    listProductAuditLogs() {
      return auditNotificationService
        .listAuditLogs()
        .filter((entry) => entry.moduleName === "service-product");
    },
    auditNotificationService,
    repository,
    service,
    controller,
  };
}

async function flushMicrotasks(turns = 4) {
  for (let i = 0; i < turns; i += 1) {
    await Promise.resolve();
  }
}

describe("SERVICE-PRODUCT-PERSISTENCE-ACK-20261015: canonical write ACK and error propagation", () => {
  it("withholds createServiceProduct registry state, audit log, and controller receipt until repository write ACK", async () => {
    const { pendingQueries, listProductAuditLogs, service, controller } =
      createDeferredHarness();

    let settled = false;
    const createPromise = Promise.resolve(
      controller.createServiceProduct(
        {
          serviceProductId: "SVP-ACK-CREATE-01",
          serviceProductType: "travel_agency_transfer",
          displayName: "Travel Agency Charter",
          description: " Airport charter ",
          timing: "reservation",
          active: true,
          defaultBillingMode: "partner_settlement",
          defaultProofRequirements: ["voucher", "photo", "voucher"],
        },
        "req-ack-create-01",
      ),
    ).then((res) => {
      settled = true;
      return res;
    });

    await flushMicrotasks();

    expect(pendingQueries).toHaveLength(1);
    expect(pendingQueries[0]?.sql).toContain(
      "INSERT INTO ops.phase1_service_products",
    );
    expect(settled).toBe(false);
    expect(service.listServiceProducts()).toEqual([]);
    expect(
      controller.listServiceProducts("req-list-while-pending").data.items,
    ).toEqual([]);
    expect(listProductAuditLogs()).toEqual([]);

    pendingQueries[0]!.resolve();
    const receipt = await createPromise;

    expect(settled).toBe(true);
    expect(receipt.data.message).toBe("Service product created.");
    expect(receipt.data.status).toBe("completed");
    expect(receipt.data.resourceType).toBe("service_product");
    expect(receipt.data.resourceId).toBe("SVP-ACK-CREATE-01");
    expect(receipt.meta.requestId).toBe("req-ack-create-01");

    const listed =
      controller.listServiceProducts("req-list-after-ack").data.items;
    expect(listed).toHaveLength(1);
    expect(listed[0]?.serviceProductId).toBe("SVP-ACK-CREATE-01");
    expect(listed[0]?.description).toBe("Airport charter");
    expect(listed[0]?.defaultProofRequirements).toEqual(["voucher", "photo"]);
    expect(listProductAuditLogs()).toHaveLength(1);
    expect(listProductAuditLogs()[0]?.actionName).toBe(
      "create_service_product",
    );
  });

  it("withholds updateServiceProduct registry mutation, audit log, and controller receipt until repository write ACK", async () => {
    const {
      pendingQueries,
      setMode,
      listProductAuditLogs,
      service,
      controller,
    } = createDeferredHarness();

    setMode("resolve");
    await controller.createServiceProduct(
      {
        serviceProductId: "SVP-ACK-UPDATE-01",
        serviceProductType: "enterprise_dispatch",
        displayName: "Initial Enterprise Dispatch",
        timing: "reservation",
        active: true,
        defaultBillingMode: "tenant_invoice",
        defaultProofRequirements: ["signoff"],
      },
      "req-seed-for-update",
    );

    setMode("defer");
    let updateSettled = false;
    const updatePromise = Promise.resolve(
      controller.updateServiceProduct(
        "SVP-ACK-UPDATE-01",
        {
          displayName: "Updated Enterprise Dispatch",
          active: false,
          timing: "realtime",
          defaultBillingMode: "fixed_fare",
          defaultProofRequirements: ["signoff", "photo", "signoff"],
        },
        "req-ack-update-01",
      ),
    ).then((res) => {
      updateSettled = true;
      return res;
    });

    await flushMicrotasks();

    expect(pendingQueries).toHaveLength(1);
    expect(updateSettled).toBe(false);
    expect(service.getServiceProduct("SVP-ACK-UPDATE-01").displayName).toBe(
      "Initial Enterprise Dispatch",
    );
    expect(service.getServiceProduct("SVP-ACK-UPDATE-01").active).toBe(true);
    expect(
      listProductAuditLogs().filter(
        (entry) => entry.actionName === "update_service_product",
      ),
    ).toEqual([]);

    pendingQueries[0]!.resolve();
    const receipt = await updatePromise;

    expect(updateSettled).toBe(true);
    expect(receipt.data.message).toBe("Service product updated.");
    expect(receipt.data.status).toBe("completed");
    expect(receipt.data.resourceId).toBe("SVP-ACK-UPDATE-01");
    expect(
      listProductAuditLogs().some(
        (entry) => entry.actionName === "update_service_product",
      ),
    ).toBe(true);
    const updated = service.getServiceProduct("SVP-ACK-UPDATE-01");
    expect(updated.displayName).toBe("Updated Enterprise Dispatch");
    expect(updated.active).toBe(false);
    expect(updated.timing).toBe("realtime");
    expect(updated.defaultBillingMode).toBe("fixed_fare");
    expect(updated.defaultProofRequirements).toEqual(["signoff", "photo"]);
  });

  it("withholds upsertRuntimeProfilePolicy state and controller envelope until repository write ACK", async () => {
    const { pendingQueries, service, controller } = createDeferredHarness();

    let policySettled = false;
    const policyPromise = Promise.resolve(
      controller.upsertRuntimePolicy(
        "multi_taxi_direct",
        "taxi_reservation",
        {
          runtimeProfileCode: "multi_taxi_direct",
          serviceProductCode: "taxi_reservation",
          active: true,
          effectiveFrom: "2026-01-01T00:00:00.000Z",
          effectiveUntil: "2027-01-01T00:00:00.000Z",
        },
        "req-ack-policy-01",
      ),
    ).then((res) => {
      policySettled = true;
      return res;
    });

    await flushMicrotasks();

    expect(pendingQueries).toHaveLength(1);
    expect(pendingQueries[0]?.sql).toContain(
      "INSERT INTO ops.runtime_profile_service_product_policies",
    );
    expect(policySettled).toBe(false);
    expect(service.listRuntimeProfilePolicies()).toEqual([]);
    expect(
      controller.listRuntimePolicies("req-policy-list-pending").data.items,
    ).toEqual([]);
    expect(() =>
      service.assertRuntimeProfileServiceProductActive(
        "multi_taxi_direct",
        "taxi_reservation",
      ),
    ).toThrow(ApiRequestError);

    pendingQueries[0]!.resolve();
    const envelope = await policyPromise;

    expect(policySettled).toBe(true);
    expect(envelope.data.runtimeProfileCode).toBe("multi_taxi_direct");
    expect(envelope.data.serviceProductCode).toBe("taxi_reservation");
    expect(envelope.data.active).toBe(true);
    expect(
      controller.listRuntimePolicies("req-policy-list-ack").data.items,
    ).toEqual([envelope.data]);
    expect(
      service.assertRuntimeProfileServiceProductActive(
        "multi_taxi_direct",
        "taxi_reservation",
      ),
    ).toEqual(envelope.data);
  });

  it("propagates repository rejections across create, update, and runtime-policy without poisoning registry or blocking retry", async () => {
    const { setMode, listProductAuditLogs, service, controller } =
      createDeferredHarness();

    // 1. Failed create followed by ordinary retry
    setMode({ reject: new Error("pg_create_write_failed") });
    await expect(
      Promise.resolve().then(() =>
        controller.createServiceProduct(
          {
            serviceProductId: "SVP-RETRY-01",
            serviceProductType: "credit_card_airport_transfer",
            displayName: "Airport Transfer VIP",
            timing: "reservation",
            active: true,
            defaultBillingMode: "fixed_fare",
          },
          "req-create-fail",
        ),
      ),
    ).rejects.toThrow("pg_create_write_failed");

    expect(service.listServiceProducts()).toEqual([]);
    expect(listProductAuditLogs()).toEqual([]);

    setMode("resolve");
    const retryCreateReceipt = await controller.createServiceProduct(
      {
        serviceProductId: "SVP-RETRY-01",
        serviceProductType: "credit_card_airport_transfer",
        displayName: "Airport Transfer VIP",
        timing: "reservation",
        active: true,
        defaultBillingMode: "fixed_fare",
      },
      "req-create-retry-ok",
    );
    expect(retryCreateReceipt.data.message).toBe("Service product created.");
    expect(service.listServiceProducts()).toHaveLength(1);
    expect(listProductAuditLogs()).toHaveLength(1);

    // 2. Failed update followed by ordinary retry
    setMode({ reject: new Error("pg_update_write_failed") });
    await expect(
      Promise.resolve().then(() =>
        controller.updateServiceProduct(
          "SVP-RETRY-01",
          {
            displayName: "Poisoned Name That Must Not Stick",
            active: false,
          },
          "req-update-fail",
        ),
      ),
    ).rejects.toThrow("pg_update_write_failed");

    expect(service.getServiceProduct("SVP-RETRY-01").displayName).toBe(
      "Airport Transfer VIP",
    );
    expect(service.getServiceProduct("SVP-RETRY-01").active).toBe(true);
    expect(listProductAuditLogs()).toHaveLength(1);

    setMode("resolve");
    const retryUpdateReceipt = await controller.updateServiceProduct(
      "SVP-RETRY-01",
      {
        displayName: "Airport Transfer Executive",
        active: false,
      },
      "req-update-retry-ok",
    );
    expect(retryUpdateReceipt.data.message).toBe("Service product updated.");
    expect(service.getServiceProduct("SVP-RETRY-01").displayName).toBe(
      "Airport Transfer Executive",
    );
    expect(service.getServiceProduct("SVP-RETRY-01").active).toBe(false);
    expect(listProductAuditLogs()).toHaveLength(2);

    // 3. Failed runtime-policy upsert followed by ordinary retry
    setMode({ reject: new Error("pg_policy_write_failed") });
    await expect(
      Promise.resolve().then(() =>
        controller.upsertRuntimePolicy(
          "business_dispatch",
          "credit_card_airport_transfer",
          {
            runtimeProfileCode: "business_dispatch",
            serviceProductCode: "credit_card_airport_transfer",
            active: true,
            effectiveFrom: "2026-01-01T00:00:00.000Z",
            effectiveUntil: "2027-01-01T00:00:00.000Z",
          },
          "req-policy-fail",
        ),
      ),
    ).rejects.toThrow("pg_policy_write_failed");

    expect(service.listRuntimeProfilePolicies()).toEqual([]);

    setMode("resolve");
    const retryPolicyEnvelope = await controller.upsertRuntimePolicy(
      "business_dispatch",
      "credit_card_airport_transfer",
      {
        runtimeProfileCode: "business_dispatch",
        serviceProductCode: "credit_card_airport_transfer",
        active: true,
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveUntil: "2027-01-01T00:00:00.000Z",
      },
      "req-policy-retry-ok",
    );
    expect(retryPolicyEnvelope.data.active).toBe(true);
    expect(service.listRuntimeProfilePolicies()).toHaveLength(1);
  });

  it("handles concurrent pending/rejected mutations and preserves duplicate/conflict rules without state corruption", async () => {
    const { pendingQueries, listProductAuditLogs, service, controller } =
      createDeferredHarness();

    // Two concurrent creates of distinct products: first rejects, second resolves
    const p1 = Promise.resolve().then(() =>
      controller.createServiceProduct(
        {
          serviceProductId: "SVP-CONC-A",
          serviceProductType: "insurance_replacement_vehicle",
          displayName: "Insurance Replacement",
          timing: "reservation",
          defaultBillingMode: "partner_settlement",
        },
        "req-conc-a",
      ),
    );
    const p2 = Promise.resolve().then(() =>
      controller.createServiceProduct(
        {
          serviceProductId: "SVP-CONC-B",
          serviceProductType: "third_party_forwarded_order",
          displayName: "Forwarded Order",
          timing: "external_defined",
          defaultBillingMode: "external_platform_settlement",
        },
        "req-conc-b",
      ),
    );

    await flushMicrotasks();
    expect(pendingQueries).toHaveLength(2);
    expect(service.listServiceProducts()).toEqual([]);

    pendingQueries[0]!.reject(new Error("concurrent_write_a_failed"));
    pendingQueries[1]!.resolve();

    await expect(p1).rejects.toThrow("concurrent_write_a_failed");
    const receiptB = await p2;
    expect(receiptB.data.resourceId).toBe("SVP-CONC-B");

    expect(
      service.listServiceProducts().map((r) => r.serviceProductId),
    ).toEqual(["SVP-CONC-B"]);
    expect(listProductAuditLogs()).toHaveLength(1);

    // Duplicate ID or duplicate type against committed SVP-CONC-B must reject with 409 CONFLICT
    pendingQueries.length = 0;
    await expect(
      Promise.resolve().then(() =>
        service.createServiceProduct({
          serviceProductId: "SVP-CONC-B",
          serviceProductType: "taxi_realtime",
          displayName: "Duplicate ID",
          timing: "realtime",
          defaultBillingMode: "meter",
        }),
      ),
    ).rejects.toThrow(ApiRequestError);
    await expect(
      Promise.resolve().then(() =>
        service.createServiceProduct({
          serviceProductId: "SVP-CONC-C",
          serviceProductType: "third_party_forwarded_order",
          displayName: "Duplicate Type",
          timing: "external_defined",
          defaultBillingMode: "external_platform_settlement",
        }),
      ),
    ).rejects.toThrow(ApiRequestError);
    expect(pendingQueries).toHaveLength(0);

    // Two concurrent creates with same serviceProductType while both pending: at most one may commit
    const dup1 = Promise.resolve().then(() =>
      service.createServiceProduct({
        serviceProductType: "taxi_realtime",
        displayName: "Taxi Realtime 1",
        timing: "realtime",
        defaultBillingMode: "meter",
      }),
    );
    const dup2 = Promise.resolve().then(() =>
      service.createServiceProduct({
        serviceProductType: "taxi_realtime",
        displayName: "Taxi Realtime 2",
        timing: "realtime",
        defaultBillingMode: "meter",
      }),
    );

    await flushMicrotasks();
    expect(pendingQueries).toHaveLength(2);
    pendingQueries[0]!.resolve();
    pendingQueries[1]!.resolve();

    const settledDups = await Promise.allSettled([dup1, dup2]);
    const fulfilledDups = settledDups.filter((r) => r.status === "fulfilled");
    const rejectedDups = settledDups.filter((r) => r.status === "rejected");
    expect(fulfilledDups).toHaveLength(1);
    expect(rejectedDups).toHaveLength(1);
    expect(
      service
        .listServiceProducts()
        .filter((r) => r.serviceProductType === "taxi_realtime"),
    ).toHaveLength(1);
  });

  it("preserves cold-start empty registry, no-database in-memory mode, and validation/denial boundaries", async () => {
    const auditService = new AuditNotificationService();
    const disabledRepo = new ServiceProductRepository();
    const memoryService = new ServiceProductService(auditService, disabledRepo);
    const memoryController = new ServiceProductController(memoryService);

    expect(disabledRepo.isEnabled()).toBe(false);
    expect(memoryService.listServiceProducts()).toEqual([]);
    expect(memoryService.listRuntimeProfilePolicies()).toEqual([]);
    expect(memoryService.listRuntimeServiceProducts()).toHaveLength(7);

    const createdReceipt = await memoryController.createServiceProduct(
      {
        serviceProductId: "SVP-MEM-01",
        serviceProductType: "taxi_realtime",
        displayName: "In-Memory Taxi Realtime",
        timing: "realtime",
        defaultBillingMode: "meter",
        allowedLicenseTypes: ["taxi", "multi_purpose_taxi", "taxi"],
        defaultProofRequirements: ["receipt", "receipt"],
      },
      "req-mem-create",
    );
    expect(createdReceipt.data.message).toBe("Service product created.");
    const memProduct = memoryService.getServiceProduct("SVP-MEM-01");
    expect(memProduct.allowedLicenseTypes).toEqual([
      "taxi",
      "multi_purpose_taxi",
    ]);
    expect(memProduct.defaultProofRequirements).toEqual(["receipt"]);

    const updatedReceipt = await memoryController.updateServiceProduct(
      "SVP-MEM-01",
      {
        displayName: "In-Memory Taxi Realtime Updated",
        fixedFareAllowed: true,
      },
      "req-mem-update",
    );
    expect(updatedReceipt.data.message).toBe("Service product updated.");
    expect(memoryService.getServiceProduct("SVP-MEM-01").displayName).toBe(
      "In-Memory Taxi Realtime Updated",
    );

    const policyEnvelope = await memoryController.upsertRuntimePolicy(
      "ordinary_taxi",
      "taxi_realtime",
      {
        runtimeProfileCode: "ordinary_taxi",
        serviceProductCode: "taxi_realtime",
        active: true,
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveUntil: "2027-01-01T00:00:00.000Z",
      },
      "req-mem-policy",
    );
    expect(policyEnvelope.data.active).toBe(true);

    // Direct synchronous no-DB service mutations return synchronously and mutate memory/audit immediately
    const syncCreated = memoryService.createServiceProduct(
      {
        serviceProductId: "SVP-MEM-SYNC-01",
        serviceProductType: "insurance_replacement_vehicle",
        displayName: "Sync In-Memory Replacement",
        timing: "reservation",
        defaultBillingMode: "partner_settlement",
      },
      "req-mem-sync-create",
      { captureAudit: true },
    );
    expect(syncCreated).not.toBeInstanceOf(Promise);
    expect(syncCreated.data.serviceProductId).toBe("SVP-MEM-SYNC-01");
    expect(memoryService.getServiceProduct("SVP-MEM-SYNC-01").active).toBe(
      true,
    );

    const syncUpdated = memoryService.updateServiceProduct(
      "SVP-MEM-SYNC-01",
      { active: false },
      "req-mem-sync-update",
    );
    expect(syncUpdated).not.toBeInstanceOf(Promise);
    expect(syncUpdated.active).toBe(false);

    const syncPolicy = memoryService.upsertRuntimeProfilePolicy({
      runtimeProfileCode: "business_dispatch",
      serviceProductCode: "insurance_replacement_vehicle",
      active: true,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveUntil: "2027-01-01T00:00:00.000Z",
    });
    expect(syncPolicy).not.toBeInstanceOf(Promise);
    expect(syncPolicy.active).toBe(true);

    // Synchronous validation errors throw synchronously on invalid runtime profile window and unsupported license
    expect(() =>
      memoryService.upsertRuntimeProfilePolicy({
        runtimeProfileCode: "ordinary_taxi",
        serviceProductCode: "taxi_realtime",
        active: true,
        effectiveFrom: "2027-01-01T00:00:00.000Z",
        effectiveUntil: "2026-01-01T00:00:00.000Z",
      }),
    ).toThrow(ApiRequestError);

    expect(() =>
      memoryService.createServiceProduct({
        serviceProductType: "taxi_reservation",
        displayName: "Invalid License Product",
        timing: "reservation",
        defaultBillingMode: "meter",
        allowedLicenseTypes: ["helicopter" as never],
      }),
    ).toThrow(ApiRequestError);
  });
});
