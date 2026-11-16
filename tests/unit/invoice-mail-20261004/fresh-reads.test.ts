import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementController } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.controller";
import { BillingSettlementRepository } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.repository";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { financeIdentity } from "./fixtures";

describe("invoice links on a replica with a stale invoice cache", () => {
  it("reads newly issued invoices and removes deleted invoices without serving another tenant", async () => {
    const issuer = new BillingSettlementService(new AuditNotificationService());
    const invoice = await issuer.generateTenantInvoice(
      financeIdentity.tenantId!,
      {
        tenantId: financeIdentity.tenantId!,
        periodStart: "2026-03-01T00:00:00Z",
        periodEnd: "2026-03-31T23:59:59Z",
      },
    );
    let records = [invoice];
    // Database I/O only; actual controller, service, repository and view mapping run.
    const query = vi.fn(async (_sql: string, values: unknown[]) => ({
      rows: records
        .filter(
          (record) =>
            record.tenantId === values[0] &&
            (values.length === 1 || record.invoiceId === values[1]),
        )
        .map((record) => ({ record: structuredClone(record) })),
    }));
    const reader = new BillingSettlementService(
      new AuditNotificationService(),
      new BillingSettlementRepository({
        isEnabled: () => true,
        query,
      } as unknown as DatabaseService),
    );
    const controller = new BillingSettlementController(reader);
    expect(reader.listTenantInvoices(financeIdentity.tenantId!)).toEqual([]);
    const detail = await controller.getTenantInvoice(
      invoice.invoiceId,
      undefined,
      undefined,
      financeIdentity,
    );
    expect(detail.data).toMatchObject({
      invoiceId: invoice.invoiceId,
      amount: invoice.amount,
    });
    const list = await controller.listTenantInvoices(
      undefined,
      undefined,
      financeIdentity,
    );
    expect(list.data.items.map((item) => item.invoiceId)).toEqual([
      invoice.invoiceId,
    ]);
    expect(
      (
        await controller.listTenantInvoices(undefined, undefined, {
          ...financeIdentity,
          tenantId: "another-tenant",
        })
      ).data.items,
    ).toEqual([]);

    records = [];
    expect(
      (
        await controller.listTenantInvoices(
          undefined,
          undefined,
          financeIdentity,
        )
      ).data.items,
    ).toEqual([]);
    await expect(
      controller.getTenantInvoice(
        invoice.invoiceId,
        undefined,
        undefined,
        financeIdentity,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    query.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(
      controller.listTenantInvoices(undefined, undefined, financeIdentity),
    ).rejects.toThrow("database unavailable");
  });
});

describe("operational invoice register uses the same canonical invoice rows", () => {
  async function issueInvoice() {
    const issuer = new BillingSettlementService(new AuditNotificationService());
    return issuer.generateTenantInvoice(financeIdentity.tenantId!, {
      tenantId: financeIdentity.tenantId!,
      periodStart: "2026-03-01T00:00:00Z",
      periodEnd: "2026-03-31T23:59:59Z",
    });
  }

  function readerWithRows() {
    const records: Awaited<ReturnType<typeof issueInvoice>>[] = [];
    const query = vi.fn(async (sql: string, values?: unknown[]) => ({
      rows: records
        .filter(
          (invoice) =>
            !sql.includes("WHERE tenant_id = $1") ||
            invoice.tenantId === values?.[0],
        )
        .map((record) => ({ record: structuredClone(record) })),
    }));
    const service = new BillingSettlementService(
      new AuditNotificationService(),
      new BillingSettlementRepository({
        isEnabled: () => true,
        query,
      } as unknown as DatabaseService),
    );
    return {
      records,
      query,
      service,
      controller: new BillingSettlementController(service),
    };
  }

  const opsIdentity = {
    ...financeIdentity,
    actorType: "ops_user" as const,
    actorId: "SIM-ops-invoice-reader",
    realm: "ops" as const,
    tenantId: null,
    roleFamilies: ["ops" as const],
    roles: ["ops_user"],
    scopes: ["billing:read"],
  };

  it("reads an invoice issued after the reader booted, including real producer order lines and detached amounts", async () => {
    const f = readerWithRows();
    expect(
      (await f.controller.listPlatformInvoices(opsIdentity)).data.items,
    ).toEqual([]);
    const invoice = await issueInvoice();
    f.records.push(invoice);
    expect(f.service.listPlatformInvoices()).toEqual([]);
    const listed = await f.controller.listPlatformInvoices(opsIdentity);
    expect(listed.data.items).toHaveLength(1);
    expect(listed.data.items[0]).toMatchObject({
      invoiceId: invoice.invoiceId,
      tenantId: invoice.tenantId,
      amount: invoice.amount,
      lines: invoice.lines,
    });
    expect(invoice.lines.length).toBeGreaterThan(0);
    expect(f.query).toHaveBeenLastCalledWith(
      "SELECT record FROM billing.phase1_tenant_invoices ORDER BY created_at DESC",
    );
    listed.data.items[0]!.lines[0]!.amount.amountMinor = -1;
    expect(
      (await f.controller.listPlatformInvoices(opsIdentity)).data.items[0]!
        .lines,
    ).toEqual(invoice.lines);
  });

  it("keeps tenant and partner visibility on the existing tenant-scoped query and rejects a missing tenant before reading", async () => {
    const f = readerWithRows();
    const invoice = await issueInvoice();
    f.records.push(invoice, {
      ...structuredClone(invoice),
      invoiceId: "SIM-other-tenant-invoice",
      tenantId: "SIM-other-tenant",
    });
    for (const realm of ["tenant", "partner"] as const) {
      const listed = await f.controller.listPlatformInvoices({
        ...financeIdentity,
        actorType: realm === "partner" ? "partner_user" : "tenant_admin",
        roleFamilies: realm === "partner" ? ["partner"] : ["tenant"],
        scopes: ["billing:read"],
        realm,
      });
      expect(listed.data.items.map((item) => item.invoiceId)).toEqual([
        invoice.invoiceId,
      ]);
      expect(f.query).toHaveBeenLastCalledWith(
        "SELECT record FROM billing.phase1_tenant_invoices WHERE tenant_id = $1 ORDER BY created_at DESC",
        [financeIdentity.tenantId],
      );
    }
    const reads = f.query.mock.calls.length;
    await expect(
      f.controller.listPlatformInvoices({ ...financeIdentity, tenantId: null }),
    ).rejects.toMatchObject({ code: "TENANT_SCOPE_REQUIRED" });
    expect(f.query).toHaveBeenCalledTimes(reads);
  });

  it("reflects canonical deletion and propagates failed reads instead of serving stale process data or a false empty register", async () => {
    const f = readerWithRows();
    f.records.push(await issueInvoice());
    expect(
      (await f.controller.listPlatformInvoices(opsIdentity)).data.items,
    ).toHaveLength(1);
    f.records.length = 0;
    expect(
      (await f.controller.listPlatformInvoices(opsIdentity)).data.items,
    ).toEqual([]);
    f.query.mockRejectedValueOnce(new Error("invoice database unavailable"));
    await expect(
      f.controller.listPlatformInvoices(opsIdentity),
    ).rejects.toThrow("invoice database unavailable");
  });

  it("retains the original memory-backed read when canonical persistence is not enabled", async () => {
    const service = new BillingSettlementService(
      new AuditNotificationService(),
    );
    const invoice = await service.generateTenantInvoice(
      financeIdentity.tenantId!,
      {
        tenantId: financeIdentity.tenantId!,
        periodStart: "2026-03-01T00:00:00Z",
        periodEnd: "2026-03-31T23:59:59Z",
      },
    );
    const controller = new BillingSettlementController(service);
    expect(
      (await controller.listPlatformInvoices(opsIdentity)).data.items,
    ).toEqual(service.listPlatformInvoices());
    expect(
      (await controller.listPlatformInvoices(financeIdentity)).data.items[0]!
        .invoiceId,
    ).toBe(invoice.invoiceId);
  });

  it("refreshes an expired recorded invoice link over the same manifest without rendering or changing issued content", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-12T12:00:00.000Z"));
      const invoice = await issueInvoice();
      const before = structuredClone(invoice);
      const f = readerWithRows();
      f.records.push(invoice);
      const render = vi.spyOn(
        f.service as unknown as {
          renderTenantInvoiceArtifact: () => Promise<unknown>;
        },
        "renderTenantInvoiceArtifact",
      );
      vi.setSystemTime(
        new Date(Date.parse(before.artifactDownloadMetadata.expiresAt) + 1),
      );
      const listed = await f.controller.listPlatformInvoices(opsIdentity);
      const refreshed = listed.data.items[0]!;
      expect(refreshed).toMatchObject({
        invoiceId: before.invoiceId,
        tenantId: before.tenantId,
        createdAt: before.createdAt,
        updatedAt: before.updatedAt,
        periodStart: before.periodStart,
        periodEnd: before.periodEnd,
        amount: before.amount,
        lines: before.lines,
        pricingVersionSnapshot: before.pricingVersionSnapshot,
      });
      expect(refreshed.artifactUrl).not.toBe(before.artifactUrl);
      expect(refreshed.artifactDownloadMetadata.manifestHash).toBe(
        before.artifactDownloadMetadata.manifestHash,
      );
      expect(
        Date.parse(refreshed.artifactDownloadMetadata.expiresAt),
      ).toBeGreaterThan(Date.now());
      const link = new URL(refreshed.artifactUrl!, "http://invoice.invalid");
      expect(link.pathname).toBe(
        new URL(before.artifactUrl!, "http://invoice.invalid").pathname,
      );
      expect(refreshed.artifactDownloadMetadata).toMatchObject({
        kind: "tenant-invoice",
        subjectId: before.invoiceId,
      });
      expect(link.searchParams.get("manifest_hash")).toBe(
        before.artifactDownloadMetadata.manifestHash,
      );
      expect(render).not.toHaveBeenCalled();
      expect(f.records[0]).toEqual(before);
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });
});
