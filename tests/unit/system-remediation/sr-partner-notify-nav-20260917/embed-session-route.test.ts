import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "../../../../apps/referral-embed-web/app/api/referral/session/route";
import {
  consumeReferralEmbedHandoffArtifact,
  recordReferralEmbedConsent,
} from "../../../../apps/referral-embed-web/lib/embed-api";
import {
  getReferralEmbedSession,
  writeReferralEmbedSession,
} from "../../../../apps/referral-embed-web/lib/embed-partner-session";

vi.mock("../../../../apps/referral-embed-web/lib/embed-api");
vi.mock("../../../../apps/referral-embed-web/lib/embed-partner-session");
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: any, init: any) => new Response(JSON.stringify(body), init),
    redirect: (url: URL) => {
      const res = new Response(null, { status: 307 });
      res.headers.set("Location", url.toString());
      return res;
    },
  },
}));

describe("POST /api/referral/session", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("passes current session context to consume artifact on exchange", async () => {
    const mockSession = { drtsPassengerId: "p1", partnerEntrySlug: "slug1" };
    vi.mocked(getReferralEmbedSession).mockResolvedValue(mockSession as any);
    vi.mocked(consumeReferralEmbedHandoffArtifact).mockResolvedValue({} as any);

    const formData = new FormData();
    formData.append("action", "exchange");
    formData.append("artifact", "art1");
    formData.append("entrySlug", "slug1");
    formData.append("entryHost", "host1");

    const req = new Request("https://test.com/api/referral/session", {
      method: "POST",
      body: formData,
    });

    await POST(req);

    expect(consumeReferralEmbedHandoffArtifact).toHaveBeenCalledWith({
      artifact: "art1",
      entrySlug: "slug1",
      entryHost: "host1",
      currentDrtsPassengerId: "p1",
      currentPartnerEntrySlug: "slug1",
    });
  });

  it("redirectResponse correctly guards against TAB in URL (open redirect fix)", async () => {
    vi.mocked(getReferralEmbedSession).mockResolvedValue(null);
    vi.mocked(consumeReferralEmbedHandoffArtifact).mockResolvedValue({} as any);

    const formData = new FormData();
    formData.append("action", "exchange");
    formData.append("artifact", "art1");
    formData.append("entrySlug", "slug1");
    formData.append("entryHost", "host1");
    formData.append("returnTo", "/\t/review-redirect.invalid");

    const req = new Request("https://test.com/api/referral/session", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toBe("https://test.com/");
  });

  it("rejects grant-consent replay when no session cookie exists (cleared cookie / expired-clock repro)", async () => {
    // Regression for the P1 finding: a caller with no existing session
    // cookie must not be able to bootstrap or replay a handoffId's consent
    // via grant-consent. This is the exact minimal repro: cookie empty,
    // POST grant-consent with a bare handoffId.
    vi.mocked(getReferralEmbedSession).mockResolvedValue(null);

    const req = new Request("https://test.com/api/referral/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "grant-consent",
        handoffId: "ref_handoff_stolen",
        entrySlug: "slug1",
        entryHost: "host1",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(recordReferralEmbedConsent).not.toHaveBeenCalled();
    expect(writeReferralEmbedSession).not.toHaveBeenCalled();
  });

  it("rejects grant-consent when the session cookie's handoffId does not match the requested one", async () => {
    // A caller holding a valid session for handoff B must not be able to
    // grant consent for a different handoffId A merely by naming it.
    vi.mocked(getReferralEmbedSession).mockResolvedValue({
      handoffId: "ref_handoff_B",
      drtsPassengerId: "pass-b",
      partnerEntrySlug: "slug1",
    } as any);

    const req = new Request("https://test.com/api/referral/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "grant-consent",
        handoffId: "ref_handoff_A",
        entrySlug: "slug1",
        entryHost: "host1",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(recordReferralEmbedConsent).not.toHaveBeenCalled();
    expect(writeReferralEmbedSession).not.toHaveBeenCalled();
  });
});
