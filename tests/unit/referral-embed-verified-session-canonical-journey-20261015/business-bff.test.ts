import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../../apps/referral-embed-web/lib/embed-partner-session", () => ({
  readActiveReferralSession: vi.fn(async () => ({ identityActive: true })),
  getReferralIdentityHeaders: vi.fn(async () => ({
    Authorization: "Bearer controlled-canonical-enduser",
  })),
}));
import * as authority from "../../../apps/referral-embed-web/lib/embed-partner-session";
import * as client from "../../../apps/referral-embed-web/lib/embed-booking-api";
import { POST as create } from "../../../apps/referral-embed-web/app/api/referral/booking/route";
import { POST as cancel } from "../../../apps/referral-embed-web/app/api/referral/cancel/[orderId]/route";
import { POST as rate } from "../../../apps/referral-embed-web/app/api/referral/rating/[orderId]/route";
import { GET as active } from "../../../apps/referral-embed-web/app/api/referral/active/route";
import { GET as selected } from "../../../apps/referral-embed-web/app/api/referral/history/[orderId]/route";
import { GET as download } from "../../../apps/referral-embed-web/app/api/referral/receipt/[orderId]/download/route";

beforeEach(() => {
  vi.mocked(authority.readActiveReferralSession).mockResolvedValue({
    identityActive: true,
  } as never);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const command = {
  entrySlug: "entry",
  quoteId: "owned-quote",
  pickupAddress: "Origin",
  dropoffAddress: "Destination",
  idempotencyKey: "body-key",
};
const params = { params: Promise.resolve({ orderId: "url-owned-order" }) };
function request(body: unknown, key?: string) {
  return new Request("https://embed.example/api/referral/booking", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("actual referral BFF handlers and canonical business transport", () => {
  it("retains header-over-body intent key, canonical bearer and no-store without bootstrap identity selectors", async () => {
    const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () =>
        Response.json({
          data: {
            order_id: "url-owned-order",
            quote: { quote_id: "owned-quote" },
            confirmed_at: "2026-10-20T02:00:00Z",
          },
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const response = await create(request(command, "header-key"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const init = fetch.mock.calls[0]![1] as RequestInit;
    expect(init).toMatchObject({
      redirect: "manual",
      cache: "no-store",
      headers: {
        Authorization: "Bearer controlled-canonical-enduser",
        "Idempotency-Key": "header-key",
      },
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      idempotencyKey: "header-key",
      quoteId: "owned-quote",
    });
    for (const name of [
      "x-actor-type",
      "x-tenant-id",
      "x-drts-passenger-id",
      "x-internal-key",
    ])
      expect(new Headers(init.headers).has(name)).toBe(false);
    expect(JSON.stringify(await response.json())).not.toContain(
      "controlled-canonical-enduser",
    );
  });
  it.each([401, 403, 409, 429, 503])(
    "preserves actual upstream status %i/code without exposing message or converting failure to empty active",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
          Response.json(
            {
              error: {
                code: "FARE_QUOTE_UNAVAILABLE",
                message: "private-token-must-not-render",
              },
            },
            { status },
          ),
        ),
      );
      const response = await active();
      expect(response.status).toBe(status);
      const body = await response.json();
      expect(body.error.code).toBe("FARE_QUOTE_UNAVAILABLE");
      expect(JSON.stringify(body)).not.toContain("private-token");
      expect(body).not.toHaveProperty("data");
    },
  );
  it("fails a revoked canonical session before any business fetch", async () => {
    vi.mocked(authority.readActiveReferralSession).mockRejectedValueOnce({
      status: 401,
      code: "REFERRAL_SESSION_EXPIRED",
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await active();
    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([null, [], "primitive"])(
    "rejects invalid JSON object %j at the real booking handler",
    async (body) => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const response = await create(request(body));
      expect(response.status).toBe(400);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it.each([cancel, rate])(
    "keeps URL order authority over a forged body order in actual mutation handler",
    async (handler) => {
      const fetch = vi.fn<
        (url: string, init: RequestInit) => Promise<Response>
      >(async () =>
        Response.json({
          data: {
            order_id: "url-owned-order",
            status: "cancelled",
            score: 2,
            contact_requested: false,
            complaint_case_no: "PAX-owned",
          },
        }),
      );
      vi.stubGlobal("fetch", fetch);
      const response = await handler(
        request({
          orderId: "foreign-order",
          reason: "Unit cancellation",
          score: 2,
          contactRequested: false,
        }),
        params,
      );
      expect(response.status).toBe(200);
      expect(String(fetch.mock.calls[0]![0])).toContain(
        "/orders/url-owned-order/",
      );
      expect(JSON.parse(fetch.mock.calls[0]![1].body).orderId).toBe(
        "url-owned-order",
      );
    },
  );
  it("does not turn a missing owned selected order into a fabricated completed order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
        Response.json({
          data: {
            items: [{ order_id: "other-own-order", status: "completed" }],
          },
        }),
      ),
    );
    const response = await selected(
      new Request("https://embed.example/?status=completed"),
      params,
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("downloads only actual nullable fare fields and identifies a trip record rather than a formal tax receipt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
        Response.json({
          data: {
            order_id: "url-owned-order",
            order_no: "OWNED-1",
            status: "completed",
            completed_at: null,
            passenger_name_masked: "測*",
            passenger_phone_masked: "0912-***-678",
            fare_base: null,
            fare_distance: null,
            fare_time: null,
            total_fare: 286.5,
            formatted_total: "NT$ 286.5",
            payment_channel: "付款及結算狀態未提供",
            vehicle_type: "standard",
            pickup_address: "Owned origin",
            dropoff_address: "Owned destination",
            driver_name: null,
            plate_number: null,
          },
        }),
      ),
    );
    const response = await download(
        new Request("https://embed.example/"),
        params,
      ),
      text = await response.text();
    expect(response.status).toBe(200);
    expect(text).toContain("NT$ 286.5");
    expect(text).toContain("非正式稅務憑證");
    expect(text).toContain("not provided by actual fare authority");
    expect(text).toContain("02-2944-0985");
    expect(text).toContain("1999");
    expect(text).not.toContain("undefined");
  });
  it("rejects malformed successful envelopes instead of returning false no-trip success", async () => {
    for (const value of [null, "string", [], { notData: true }]) {
      vi.stubGlobal(
        "fetch",
        vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
          Response.json(value),
        ),
      );
      await expect(client.getReferralActiveTripServer()).rejects.toMatchObject({
        status: 502,
        code: "REFERRAL_UPSTREAM_INVALID_RESPONSE",
      });
    }
  });
});
