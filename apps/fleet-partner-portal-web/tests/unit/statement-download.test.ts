import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock next/headers used by the server-side client chain.
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

// Minimal stub for next/server used inside the BFF download route.
// The real NextResponse is not available in the node test environment, so we
// return a plain object with the same observable interface used in assertions.
vi.mock("next/server", () => {
  class MockNextResponse {
    readonly status: number;
    readonly body: string;
    readonly headers: Map<string, string>;

    constructor(
      body: string,
      init?: { status?: number; headers?: Record<string, string> },
    ) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Map(Object.entries(init?.headers ?? {}));
    }

    static json(data: unknown, init?: { status?: number }) {
      const status = init?.status ?? 200;
      return new MockNextResponse(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json" },
      });
    }
  }
  return { NextResponse: MockNextResponse };
});

import { headers } from "next/headers";

// Helper type for the assertions below.
interface RouteResponse {
  status: number;
  body: string;
  headers: Map<string, string>;
}

// Lazily import the route handler after mocks are established.
async function importRouteGet() {
  const mod = (await import(
    "../../app/api/fleet/statements/[id]/download/route"
  )) as { GET: unknown };
  // The real NextResponse type does not match our mock's RouteResponse shape
  // (mock returns plain object; real returns NextResponse with ReadableStream
  // body). The cast via unknown is intentional for test isolation.
  return mod.GET as (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<RouteResponse>;
}

const SAMPLE_STATEMENT = {
  statementId: "stmt-2026-08",
  fleetPartnerId: "fleet-demo-001",
  periodMonth: "2026-08",
  payoutStatus: "paid",
  grossEarningBasis: { currency: "TWD", amountMinor: 200000 },
  driverNetAmountBasis: { currency: "TWD", amountMinor: 140000 },
  shareAmount: { currency: "TWD", amountMinor: 60000 },
  sponsorFundedTripCount: 0,
  sponsorFundedGrossEarningBasis: { currency: "TWD", amountMinor: 0 },
  sponsorFundedShareAmount: { currency: "TWD", amountMinor: 0 },
  reimbursementAmount: { currency: "TWD", amountMinor: 0 },
  lines: [],
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
};

describe("fleet statement download BFF route", () => {
  beforeEach(() => {
    process.env.DRTS_FLEET_PARTNER_ID = "fleet-demo-001";
    vi.mocked(headers).mockResolvedValue(new Headers());
  });

  afterEach(() => {
    vi.resetModules();
    delete process.env.DRTS_FLEET_PARTNER_ID;
    vi.restoreAllMocks();
  });

  it("returns 400 when fleet partner scope is missing", async () => {
    delete process.env.DRTS_FLEET_PARTNER_ID;
    const GET = await importRouteGet();
    const res = await GET(new Request("http://localhost/"), {
      params: Promise.resolve({ id: "stmt-2026-08" }),
    });
    expect(res.status).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("error");
    expect(body.error).toMatch(/Missing fleet scope/);
  });

  it("returns 502 when upstream API fetch throws", async () => {
    // Patch global fetch to simulate an upstream failure.
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockRejectedValue(new Error("network failure"));
    const GET = await importRouteGet();
    const res = await GET(new Request("http://localhost/"), {
      params: Promise.resolve({ id: "stmt-2026-08" }),
    });
    // The api-client wraps the error; the route should surface it as 502.
    expect(res.status).toBe(502);
    fetchSpy.mockRestore();
  });

  it("returns 404 when statement ID is not found in the list", async () => {
    // Patch fetch to return a valid but empty statement list.
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "ok", data: { items: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const GET = await importRouteGet();
    const res = await GET(new Request("http://localhost/"), {
      params: Promise.resolve({ id: "stmt-missing" }),
    });
    expect(res.status).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("not_found");
    fetchSpy.mockRestore();
  });

  it("returns 200 with JSON attachment when statement exists", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ status: "ok", data: { items: [SAMPLE_STATEMENT] } }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    const GET = await importRouteGet();
    const res = await GET(new Request("http://localhost/"), {
      params: Promise.resolve({ id: "stmt-2026-08" }),
    });
    expect(res.status).toBe(200);
    const contentType = res.headers.get("content-type");
    expect(contentType).toMatch(/application\/json/);
    const disposition = res.headers.get("content-disposition");
    expect(disposition).toMatch(/attachment/);
    expect(disposition).toMatch(/stmt-2026-08/);
    expect(disposition).toMatch(/2026-08/);
    // Body is valid JSON matching the original statement.
    const parsed = JSON.parse(res.body);
    expect(parsed.statementId).toBe("stmt-2026-08");
    expect(parsed.periodMonth).toBe("2026-08");
    fetchSpy.mockRestore();
  });

  it("returns no-store cache-control to prevent browser caching of financial data", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ status: "ok", data: { items: [SAMPLE_STATEMENT] } }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    const GET = await importRouteGet();
    const res = await GET(new Request("http://localhost/"), {
      params: Promise.resolve({ id: "stmt-2026-08" }),
    });
    const cacheControl = res.headers.get("cache-control");
    expect(cacheControl).toBe("no-store");
    fetchSpy.mockRestore();
  });
});
