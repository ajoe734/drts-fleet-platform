import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PassengerAuthClient } from "../../../apps/passenger-app-web/lib/auth/client";
import {
  POST,
  DELETE,
} from "../../../apps/passenger-app-web/app/api/passenger-app/[...path]/route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Adjacent review repair probes (no server)", () => {
  it("F2 sends the required provider in the actual start command", async () => {
    vi.stubEnv("DRTS_API_URL", "https://upstream.invalid");
    vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
    const upstream = vi.fn(async (_url: string, init?: RequestInit) => {
      const wire = JSON.parse(
        new TextDecoder().decode(init?.body as ArrayBuffer),
      );
      expect(wire).toEqual({
        provider: "google",
        redirectUri: "https://ride.smarttransport.tw/auth/callback/google",
        purpose: "login",
      });
      return Response.json({
        data: {
          auth_url: "https://provider.invalid/authorize?state=s",
          transaction_id: "11111111-1111-4111-8111-111111111111",
          state: "s",
          expires_at: new Date(Date.now() + 300000).toISOString(),
        },
      });
    });
    vi.stubGlobal("fetch", upstream);
    const transport = async (url: string, init?: RequestInit) =>
      POST(
        new NextRequest(`https://ride.smarttransport.tw${url}`, {
          ...init,
          headers: { Origin: "https://ride.smarttransport.tw" },
        }),
        {
          params: Promise.resolve({
            path: url.split("/api/passenger-app/")[1]!.split("/"),
          }),
        },
      );
    const client = new PassengerAuthClient({ baseUrl: "", fetchFn: transport });
    await expect(
      client.oauthStart({
        provider: "google",
        redirectUri: "https://ride.smarttransport.tw/auth/callback/google",
        purpose: "login",
      }),
    ).resolves.toMatchObject({ authUrl: expect.any(String) });
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("F2 rejects callback without transaction cookie, even with query/body transaction", async () => {
    vi.stubEnv("DRTS_API_URL", "https://upstream.invalid");
    vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
    const upstream = vi.fn(async () => Response.json({ result: "linked" }));
    vi.stubGlobal("fetch", upstream);
    const res = await POST(
      new NextRequest(
        "https://ride.smarttransport.tw/api/passenger-app/auth/oauth/google/callback",
        {
          method: "POST",
          headers: { Origin: "https://ride.smarttransport.tw" },
          body: JSON.stringify({
            provider: "google",
            code: "c",
            state: "s",
            transactionId: "11111111-1111-4111-8111-111111111111",
          }),
        },
      ),
      {
        params: Promise.resolve({
          path: ["auth", "oauth", "google", "callback"],
        }),
      },
    );
    expect(res.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("F3 restricts identity segment to actual UUID contract", async () => {
    vi.stubEnv("DRTS_API_URL", "https://upstream.invalid");
    vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
    const upstream = vi.fn(async () => Response.json({ success: true }));
    vi.stubGlobal("fetch", upstream);
    const res = await DELETE(
      new NextRequest(
        "https://ride.smarttransport.tw/api/passenger-app/me/identities/not-a-uuid",
        {
          method: "DELETE",
          headers: { Origin: "https://ride.smarttransport.tw" },
        },
      ),
      { params: Promise.resolve({ path: ["me", "identities", "not-a-uuid"] }) },
    );
    expect(res.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
});
