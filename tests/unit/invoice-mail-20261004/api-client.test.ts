import { afterEach, expect, it, vi } from "vitest";
import { createTenantBearerClient } from "../../../packages/api-client/src/index";

afterEach(() => vi.unstubAllGlobals());
it("uses authenticated tenant endpoints and sends no recipient/content overrides", async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(JSON.stringify({ data: { status: "not_requested" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const client = createTenantBearerClient(
    "https://api.example.test",
    "test-token",
    "tenant-1",
  );
  await client.getInvoiceMail("invoice/1");
  await client.sendInvoiceMail("invoice/1");
  const calls = fetcher.mock.calls as unknown as [string, RequestInit][];
  expect(calls[0]![0]).toBe(
    "https://api.example.test/api/tenant/invoices/invoice%2F1/mail",
  );
  expect(calls[1]![1].method).toBe("POST");
  expect(calls[1]![1].body).toBe("{}");
  const headers = new Headers(calls[1]![1].headers);
  expect(headers.get("Authorization")).toBe("Bearer test-token");
  expect(headers.get("x-tenant-id")).toBe("tenant-1");
});
