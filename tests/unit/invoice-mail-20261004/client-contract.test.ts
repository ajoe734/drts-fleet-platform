import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "../../../packages/api-client/src/index";
import { resolveRouteAuthPolicy } from "../../../apps/api/src/common/auth/auth.policy";
import { BillingSettlementModule } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.module";
import { TenantInvoiceMailController } from "../../../apps/api/src/modules/billing-settlement/tenant-invoice-mail.controller";
import { TenantInvoiceMailService } from "../../../apps/api/src/modules/billing-settlement/tenant-invoice-mail.service";

afterEach(() => vi.unstubAllGlobals());

describe("invoice mail production wiring", () => {
  it("registers controller and service in the real billing module", () => {
    expect(
      Reflect.getMetadata("controllers", BillingSettlementModule),
    ).toContain(TenantInvoiceMailController);
    expect(Reflect.getMetadata("providers", BillingSettlementModule)).toContain(
      TenantInvoiceMailService,
    );
  });

  it("uses tenant billing scopes in the canonical route resolver", () => {
    expect(
      resolveRouteAuthPolicy(
        "POST",
        "/api/tenant/invoices/invoice-a/mail-deliveries",
      ),
    ).toMatchObject({ requiredScopes: ["tenant:billing:write"] });
    expect(
      resolveRouteAuthPolicy(
        "GET",
        "/api/tenant/invoices/invoice-a/mail-deliveries",
      ),
    ).toMatchObject({ requiredScopes: ["tenant:billing:read"] });
  });

  it("client encodes invoice id and preserves explicit idempotency without a recipient/body override", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [], meta: {} }),
    });
    vi.stubGlobal("fetch", fetch);
    const client = new ApiClient({ baseUrl: "https://api.demo.tw" });
    await client.sendInvoiceMail("invoice/a", "operation-0001");
    await client.listInvoiceMailDeliveries("invoice/a");
    expect(fetch.mock.calls[0]![0]).toBe(
      "https://api.demo.tw/api/tenant/invoices/invoice%2Fa/mail-deliveries",
    );
    expect(fetch.mock.calls[0]![1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({ "Idempotency-Key": "operation-0001" }),
    });
    expect(fetch.mock.calls[0]![1].body).toBeUndefined();
    expect(fetch.mock.calls[1]![1].method).toBe("GET");
  });
});
