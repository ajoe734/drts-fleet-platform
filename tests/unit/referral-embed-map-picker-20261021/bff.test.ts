import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../apps/referral-embed-web/lib/embed-partner-session", () => ({
  readActiveReferralSession: vi.fn(async () => ({ identityActive: true })),
  getReferralIdentityHeaders: vi.fn(async () => ({
    Authorization: "Bearer referral-token",
  })),
}));

import { resolveReferralMapConfig } from "../../../apps/referral-embed-web/lib/embed-map-config";
import { GET as searchGET } from "../../../apps/referral-embed-web/app/api/referral/geo/search/route";
import { POST as reversePOST } from "../../../apps/referral-embed-web/app/api/referral/geo/reverse/route";

const EMBED = "https://embed.example.test";
const OPS = "https://ops.example.test";
const saved = { ...process.env };

beforeEach(() => {
  process.env.MAP_PROVIDER_MODE = "external";
  process.env.MAP_PROVIDER_NAME = "google";
  process.env.GOOGLE_MAPS_BROWSER_KEY = "browser-key";
  process.env.MAP_PROVIDER_ALLOWED_ORIGINS = `${OPS},${EMBED}`;
  process.env.DRTS_API_URL = "https://api.example.test";
});

afterEach(() => {
  process.env = { ...saved };
  vi.unstubAllGlobals();
});

describe("referral map config", () => {
  const env = (overrides: Record<string, string> = {}) =>
    ({
      MAP_PROVIDER_MODE: "external",
      MAP_PROVIDER_NAME: "google",
      GOOGLE_MAPS_BROWSER_KEY: "browser-key",
      MAP_PROVIDER_ALLOWED_ORIGINS: `${OPS},${EMBED}`,
      ...overrides,
    }) as unknown as NodeJS.ProcessEnv;

  it("gives the browser key to a page whose own origin is allowed", () => {
    expect(resolveReferralMapConfig(env(), EMBED)).toEqual({
      enabled: true,
      browserKey: "browser-key",
    });
  });

  it("keeps address search only for other origins or without an external provider", () => {
    for (const config of [
      resolveReferralMapConfig(env(), "https://elsewhere.example.test"),
      resolveReferralMapConfig(
        env({ MAP_PROVIDER_ALLOWED_ORIGINS: "" }),
        EMBED,
      ),
      resolveReferralMapConfig(env({ MAP_PROVIDER_MODE: "mock" }), EMBED),
      resolveReferralMapConfig(env({ GOOGLE_MAPS_BROWSER_KEY: "" }), EMBED),
    ])
      expect(config).toEqual({ enabled: false, browserKey: null });
  });
});

describe("referral geo BFF", () => {
  it("searches as the referral passenger on the passenger entry surface", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        data: {
          candidates: [
            { candidate_id: "c1", address: "臺北市信義區市府路1號" },
          ],
          provider: "google",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = await searchGET(
      new Request(`${EMBED}/api/referral/geo/search?q=市府&limit=20`),
    );
    const body = await response.json();
    expect(body.data.candidates[0]).toMatchObject({
      candidateId: "c1",
      address: "臺北市信義區市府路1號",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      "https://api.example.test/api/geo/search",
    );
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      q: "市府",
      limit: "8",
      locale: "zh-TW",
      surface: "passenger_entry",
    });
    expect(init.headers).toMatchObject({
      Authorization: "Bearer referral-token",
    });
  });

  it("rejects an empty search and an out-of-range point without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(
      (await searchGET(new Request(`${EMBED}/api/referral/geo/search?q=%20`)))
        .status,
    ).toBe(400);
    expect(
      (
        await reversePOST(
          new Request(`${EMBED}/api/referral/geo/reverse`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat: 91, lng: 121.5 }),
          }),
        )
      ).status,
    ).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reverse-geocodes a picked point", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        data: { address: { address: "新北市板橋區縣民大道二段7號" } },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = await reversePOST(
      new Request(`${EMBED}/api/referral/geo/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: 25.0142, lng: 121.4636 }),
      }),
    );
    expect((await response.json()).data.address.address).toBe(
      "新北市板橋區縣民大道二段7號",
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(String(init.body))).toEqual({
      location: { lat: 25.0142, lng: 121.4636 },
      locale: "zh-TW",
      surface: "passenger_entry",
    });
  });
});
