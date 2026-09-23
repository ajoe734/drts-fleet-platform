import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { POST } from "../../../../apps/referral-embed-web/app/api/referral/session/route";
import { consumeReferralEmbedHandoffArtifact } from "../../../../apps/referral-embed-web/lib/embed-api";
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
});
