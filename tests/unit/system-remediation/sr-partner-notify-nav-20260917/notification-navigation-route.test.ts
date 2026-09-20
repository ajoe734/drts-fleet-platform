import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../../apps/referral-embed-web/lib/embed-api", () => ({
  consumeReferralEmbedHandoffArtifact: vi.fn(),
  getPartnerEntry: vi.fn(),
}));

vi.mock("../../../../apps/referral-embed-web/lib/embed-partner-session", () => ({
  clearReferralEmbedSession: vi.fn(),
  getReferralEmbedSession: vi.fn(),
  writeReferralEmbedSession: vi.fn(),
}));

import { GET } from "../../../../apps/referral-embed-web/app/api/referral/notification-navigation/route";
import { consumeReferralEmbedHandoffArtifact, getPartnerEntry } from "../../../../apps/referral-embed-web/lib/embed-api";
import { clearReferralEmbedSession, getReferralEmbedSession, writeReferralEmbedSession } from "../../../../apps/referral-embed-web/lib/embed-partner-session";
import { NextResponse } from "next/server";

describe("Notification Navigation Route (GET)", () => {
  beforeEach(() => {
    vi.mocked(getPartnerEntry).mockResolvedValue({ entryHost: "https://test.com" } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createRequest = (url: string) => {
    return { url } as Request;
  };

  it("fails if parameters are missing", async () => {
    const res = await GET(createRequest("http://localhost"));
    expect(res.status).toBe(400);
  });

  it("handles valid fresh artifact", async () => {
    vi.mocked(consumeReferralEmbedHandoffArtifact).mockResolvedValue({
      drtsPassengerId: "p1",
      partnerEntrySlug: "e1",
      navigationContext: { orderId: "o1", screen: "trip" }
    } as any);
    vi.mocked(getReferralEmbedSession).mockResolvedValue(null);

    const res = await GET(createRequest("http://localhost?artifact=123&entrySlug=e1"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("screen=trip");
    expect(res.headers.get("location")).toContain("orderId=o1");
    expect(writeReferralEmbedSession).toHaveBeenCalled();
  });

  it("fails if account switched (A to logout to B)", async () => {
    vi.mocked(consumeReferralEmbedHandoffArtifact).mockResolvedValue({
      drtsPassengerId: "p1",
      partnerEntrySlug: "e1",
    } as any);
    // User B is currently logged in!
    vi.mocked(getReferralEmbedSession).mockResolvedValue({
      drtsPassengerId: "p2",
      partnerEntrySlug: "e1",
    } as any);

    const res = await GET(createRequest("http://localhost?artifact=123&entrySlug=e1"));
    expect(res.status).toBe(403);
    expect(clearReferralEmbedSession).toHaveBeenCalled();
  });

  it("fails if entry switched", async () => {
    vi.mocked(consumeReferralEmbedHandoffArtifact).mockResolvedValue({
      drtsPassengerId: "p1",
      partnerEntrySlug: "e1",
    } as any);
    // User is logged into entry 2
    vi.mocked(getReferralEmbedSession).mockResolvedValue({
      drtsPassengerId: "p1",
      partnerEntrySlug: "e2",
    } as any);

    const res = await GET(createRequest("http://localhost?artifact=123&entrySlug=e1"));
    expect(res.status).toBe(403);
    expect(clearReferralEmbedSession).toHaveBeenCalled();
  });

  it("fails if artifact consumption fails (replayed/expired)", async () => {
    vi.mocked(consumeReferralEmbedHandoffArtifact).mockRejectedValue(new Error("Expired"));

    const res = await GET(createRequest("http://localhost?artifact=123&entrySlug=e1"));
    expect(res.status).toBe(403);
    expect(clearReferralEmbedSession).toHaveBeenCalled();
  });
});
