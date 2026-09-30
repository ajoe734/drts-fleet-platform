import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "../../../../apps/referral-embed-web/app/api/referral/history/[orderId]/route";
import { getReferralEmbedSession } from "../../../../apps/referral-embed-web/lib/embed-partner-session";

vi.mock("../../../../apps/referral-embed-web/lib/embed-partner-session");
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: any, init: any) => new Response(JSON.stringify(body), init),
  },
}));

const globalFetchMock = vi.fn();
global.fetch = globalFetchMock;

describe("GET /api/referral/history/[orderId]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    globalFetchMock.mockReset();
  });

  it("returns own history when authorized and found", async () => {
    vi.mocked(getReferralEmbedSession).mockResolvedValue({
      identityActive: true,
      identity: {
        actorType: "referral_passenger",
        drtsPassengerId: "pass-1",
        tenantId: "tenant-A",
        partnerEntrySlug: "entry-1",
      },
    } as any);

    globalFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { items: [{ orderId: "order-123", status: "CONFIRMED" }] },
      }),
    });

    const req = new Request("https://test.com/api/referral/history/order-123");
    const res = await GET(req, { params: Promise.resolve({ orderId: "order-123" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.orderId).toBe("order-123");
  });

  it("returns 404 for unknown order (not in authorized list)", async () => {
    vi.mocked(getReferralEmbedSession).mockResolvedValue({
      identityActive: true,
      identity: {
        drtsPassengerId: "pass-1",
      },
    } as any);

    globalFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { items: [{ orderId: "order-123", status: "CONFIRMED" }] },
      }),
    });

    const req = new Request("https://test.com/api/referral/history/order-unknown");
    const res = await GET(req, { params: Promise.resolve({ orderId: "order-unknown" }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.message).toBe("Trip not found or access denied");
  });

  it("returns 404 for wrong subject (backend filtered)", async () => {
    vi.mocked(getReferralEmbedSession).mockResolvedValue({
      identityActive: true,
      identity: {
        drtsPassengerId: "pass-wrong",
      },
    } as any);

    globalFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { items: [] },
      }),
    });

    const req = new Request("https://test.com/api/referral/history/order-123");
    const res = await GET(req, { params: Promise.resolve({ orderId: "order-123" }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.message).toBe("Trip not found or access denied");
  });

  it("returns 404 for same tenant different entry (backend filtered)", async () => {
    vi.mocked(getReferralEmbedSession).mockResolvedValue({
      identityActive: true,
      identity: {
        tenantId: "tenant-A",
        partnerEntrySlug: "entry-other",
      },
    } as any);

    globalFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { items: [] },
      }),
    });

    const req = new Request("https://test.com/api/referral/history/order-123");
    const res = await GET(req, { params: Promise.resolve({ orderId: "order-123" }) });

    expect(res.status).toBe(404);
  });

  it("returns 404 for cross tenant (backend filtered)", async () => {
    vi.mocked(getReferralEmbedSession).mockResolvedValue({
      identityActive: true,
      identity: {
        tenantId: "tenant-B",
      },
    } as any);

    globalFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { items: [] },
      }),
    });

    const req = new Request("https://test.com/api/referral/history/order-123");
    const res = await GET(req, { params: Promise.resolve({ orderId: "order-123" }) });

    expect(res.status).toBe(404);
  });

  it("returns 400 when no session exists", async () => {
    vi.mocked(getReferralEmbedSession).mockResolvedValue(null);

    const req = new Request("https://test.com/api/referral/history/order-123");
    const res = await GET(req, { params: Promise.resolve({ orderId: "order-123" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.message).toMatch(/UNAUTHORIZED/);
    expect(globalFetchMock).not.toHaveBeenCalled();
  });
});
