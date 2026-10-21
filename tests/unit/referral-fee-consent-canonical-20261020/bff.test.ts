import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("../../../apps/referral-embed-web/lib/embed-partner-session", () => ({
  readActiveReferralSession: vi.fn(async () => ({ identityActive: true })),
  getReferralIdentityHeaders: vi.fn(async () => ({
    Authorization: "Bearer controlled-fee-canonical",
  })),
}));
import * as authority from "../../../apps/referral-embed-web/lib/embed-partner-session";
import {
  GET,
  POST,
} from "../../../apps/referral-embed-web/app/api/referral/fees/route";
import {
  PASSENGER_FEE_DISCLOSURE_VERSION,
  PASSENGER_FEE_CONTENT_HASH,
} from "@drts/contracts";
const status = {
  disclosure_version: PASSENGER_FEE_DISCLOSURE_VERSION,
  content_hash: PASSENGER_FEE_CONTENT_HASH,
  acknowledged_at: "2026-10-20T01:00:00Z",
};
const body = {
  disclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
  acknowledged: true,
};
beforeEach(() => {
  vi.mocked(authority.readActiveReferralSession).mockResolvedValue({
    identityActive: true,
  } as never);
  vi.stubEnv("K_SERVICE", "");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("uses the actual canonical fees GET/POST BFF transport and typed server timestamp", async () => {
  const fetch = vi.fn(async () => Response.json({ ok: true, data: status }));
  vi.stubGlobal("fetch", fetch);
  const read = await GET();
  expect(read.status).toBe(200);
  expect((await read.json()).data).toMatchObject({
    disclosureVersion: body.disclosureVersion,
    acknowledgedAt: status.acknowledged_at,
  });
  const ack = await POST(
    new Request("https://embed.example/api/referral/fees", {
      method: "POST",
      headers: {
        Origin: "https://embed.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
  expect(ack.status).toBe(200);
  const [url, raw] = fetch.mock.calls[1] as unknown as [string, RequestInit];
  expect(url).toMatch(/\/api\/partner\/referral\/passenger\/fees$/);
  expect(raw).toMatchObject({
    method: "POST",
    redirect: "manual",
    cache: "no-store",
    headers: { Authorization: "Bearer controlled-fee-canonical" },
  });
  expect(JSON.parse(String(raw.body))).toEqual(body);
  expect(JSON.stringify(await ack.json())).not.toContain(
    "controlled-fee-canonical",
  );
});
it("rejects a revoked canonical session before any fee business transport", async () => {
  vi.mocked(authority.readActiveReferralSession).mockRejectedValueOnce({
    status: 401,
    code: "REFERRAL_SESSION_EXPIRED",
  });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect((await GET()).status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects cross-origin agreement and does not call the product transport", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const result = await POST(
    new Request("https://embed.example/api/referral/fees", {
      method: "POST",
      headers: { Origin: "https://foreign.example" },
      body: JSON.stringify(body),
    }),
  );
  expect(result.status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});
it.each([403, 409, 429, 503])(
  "preserves real upstream fee denial %i instead of an acknowledgement",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            error: { code: "FEE_DISCLOSURE_REQUIRED", message: "private-body" },
          },
          { status },
        ),
      ),
    );
    const result = await GET();
    expect(result.status).toBe(status);
    expect(await result.json()).toMatchObject({
      ok: false,
      error: { code: "FEE_DISCLOSURE_REQUIRED" },
    });
  },
);
