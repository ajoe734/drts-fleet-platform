import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PassengerClient } from "../../../packages/passenger-client/src/index";
import { PassengerAuthClient } from "../../../apps/passenger-app-web/lib/auth/client";
import * as bff from "../../../apps/passenger-app-web/app/api/passenger-app/[...path]/route";

const origin = "https://ride.smarttransport.tw";
const txn = "12345678-1234-4234-8234-123456789abc";
const account = {
  drtsPassengerId: "pax-1",
  contactPhoneVerified: false,
  status: "active",
  createdAt: "2026-10-01T00:00:00Z",
};

export function browserTransport() {
  const jar = new Map<string, string>();
  const responses: Awaited<ReturnType<typeof bff.POST>>[] = [];
  const fetchFn = async (
    url: string,
    options?: import("../../../packages/passenger-client/src/index").FetchOptions,
  ) => {
    const request = new NextRequest(new URL(url, origin), {
      method: options?.method ?? "GET",
      headers: {
        ...options?.headers,
        origin,
        cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "),
      },
      ...(options?.body ? { body: options.body } : {}),
    });
    const path = request.nextUrl.pathname
      .slice("/api/passenger-app/".length)
      .split("/");
    const handler = {
      GET: bff.GET,
      POST: bff.POST,
      PATCH: bff.PATCH,
      DELETE: bff.DELETE,
    }[request.method];
    if (!handler) throw new Error("Unsupported method");
    const response = await handler(request, {
      params: Promise.resolve({ path }),
    });
    for (const cookie of response.cookies.getAll()) {
      if (cookie.maxAge === 0) jar.delete(cookie.name);
      else jar.set(cookie.name, cookie.value);
    }
    responses.push(response);
    return response;
  };
  return {
    jar,
    responses,
    fetchFn,
    client: new PassengerAuthClient(
      new PassengerClient({ baseUrl: origin, fetchFn }),
    ),
  };
}

describe("F2/F3 real client to Next BFF transport", () => {
  let calls: { path: string; body: any; headers: Headers }[];
  beforeEach(() => {
    vi.stubEnv("DRTS_API_URL", "https://upstream.example.invalid");
    vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = new URL(url).pathname;
        const body = init?.body
          ? JSON.parse(
              typeof init.body === "string"
                ? init.body
                : new TextDecoder().decode(init.body as ArrayBuffer),
            )
          : undefined;
        calls.push({ path, body, headers: new Headers(init?.headers) });
        if (path.endsWith("/start"))
          return Response.json({
            data: {
              transactionId: txn,
              state: "state-1",
              expiresAt: new Date(Date.now() + 600000).toISOString(),
              authUrl: "https://provider.example.invalid/?state=state-1",
            },
          });
        if (path.endsWith("/identities"))
          return Response.json({ data: { identities: [] } });
        return Response.json({ data: { account } });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each(["google", "facebook", "line"] as const)(
    "%s start sends the formal provider + camelCase command",
    async (provider) => {
      const { client } = browserTransport();
      await client.oauthStart({
        provider,
        redirectUri: `${origin}/auth/callback/${provider}`,
        purpose: "login",
      });
      expect(calls[0]?.body).toEqual({
        provider,
        redirectUri: `${origin}/auth/callback/${provider}`,
        purpose: "login",
      });
    },
  );

  it("rejects callback with mismatched state before upstream", async () => {
    const { client } = browserTransport();
    await client.oauthStart({
      provider: "google",
      redirectUri: `${origin}/auth/callback/google`,
      purpose: "login",
    });
    await expect(
      client.oauthCallback("google", {
        code: "code",
        state: "wrong",
      }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  it("rejects anonymous linking instead of degrading to metadata login", async () => {
    const { client } = browserTransport();
    await expect(
      client.oauthStart({
        provider: "line",
        redirectUri: `${origin}/auth/callback/line`,
        purpose: "link",
      }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("rejects malformed identity IDs before upstream", async () => {
    const { client, jar } = browserTransport();
    jar.set("pax_session", "session");
    await expect(
      client.unlinkIdentity({ identityId: "bad:id" }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});
