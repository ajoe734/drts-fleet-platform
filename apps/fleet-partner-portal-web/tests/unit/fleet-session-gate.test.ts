import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

import { headers } from "next/headers";
import { getServerFleetPartnerClient } from "../../lib/api-client.server";
import { getServerFleetTrainingClient } from "../../lib/academy-api.server";
import { loadSupplySubmissions } from "../../lib/fleet-portal-supply.server";
import { loadDrivers } from "../../lib/fleet-portal-data.server";

// A forged or expired drts_session passes the presence-only middleware. The
// backend session authority answers 401; the visitor must land on /login
// instead of the loaders' hard-coded demo fixtures.
function visitor(pathname: string, cookie = "drts_session=forged-not-a-token") {
  vi.mocked(headers).mockResolvedValue(
    new Headers({ cookie, "x-drts-fleet-pathname": pathname }),
  );
}

function sessionAuthority(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const REJECTED = {
  status: "error",
  error: {
    code: "JWT_INVALID",
    message: "Bearer token is invalid or expired.",
    retryable: false,
    traceId: "trace-1",
  },
};

async function redirectTarget(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => {
      throw new Error("expected a redirect");
    },
    (caught: unknown) => caught,
  );
  const digest = (error as { digest?: string }).digest ?? "";
  expect(digest.startsWith("NEXT_REDIRECT;")).toBe(true);
  return digest.split(";")[2]!;
}

describe("fleet portal rejected-session gate", () => {
  beforeEach(() => {
    vi.stubEnv("DRTS_API_URL", "https://api.test");
    vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
    vi.stubEnv("DRTS_FLEET_PARTNER_ID", "fleet-demo-001");
    vi.stubEnv("DRTS_FLEET_PORTAL_AUTH_REQUIRED", "true");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("redirects a rejected session to /login with its route and an expiry notice", async () => {
    visitor("/supply/submissions");
    const fetchMock = sessionAuthority(401, REJECTED);
    expect(await redirectTarget(getServerFleetPartnerClient())).toBe(
      "/login?redirect_uri=%2Fsupply%2Fsubmissions&session=expired",
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://api.test/api/auth/session");
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer forged-not-a-token",
    );
  });

  it("loaders propagate the redirect instead of rendering demo fixtures", async () => {
    visitor("/supply/submissions");
    sessionAuthority(401, REJECTED);
    expect(await redirectTarget(loadSupplySubmissions())).toBe(
      "/login?redirect_uri=%2Fsupply%2Fsubmissions&session=expired",
    );
    visitor("/drivers");
    expect(await redirectTarget(loadDrivers())).toBe(
      "/login?redirect_uri=%2Fdrivers&session=expired",
    );
  });

  it("the training client checks the session before trusting the cookie", async () => {
    visitor("/training");
    sessionAuthority(401, REJECTED);
    expect(await redirectTarget(getServerFleetTrainingClient())).toBe(
      "/login?redirect_uri=%2Ftraining&session=expired",
    );
  });

  it("never turns the return path into an off-site redirect", async () => {
    visitor("//evil.example/x");
    sessionAuthority(401, REJECTED);
    expect(await redirectTarget(getServerFleetPartnerClient())).toBe(
      "/login?redirect_uri=%2F&session=expired",
    );
  });

  it("keeps a non-401 refusal (wrong realm) as an error, not a login redirect", async () => {
    visitor("/drivers");
    sessionAuthority(200, {
      data: {
        active: true,
        identity: {
          realm: "tenant",
          actorType: "tenant_user",
          actorId: "tenant-user-1",
          scopes: [],
        },
      },
    });
    await expect(getServerFleetPartnerClient()).rejects.toMatchObject({
      statusCode: 403,
      code: "FLEET_PARTNER_AUTHORITY_REQUIRED",
    });
  });

  it("without enforced login keeps the previous behaviour (error, demo fallback)", async () => {
    vi.stubEnv("DRTS_FLEET_PORTAL_AUTH_REQUIRED", "");
    visitor("/supply/submissions");
    sessionAuthority(401, REJECTED);
    await expect(getServerFleetPartnerClient()).rejects.toMatchObject({
      statusCode: 401,
      code: "JWT_INVALID",
    });
    expect((await loadSupplySubmissions()).source).toBe("fallback");
  });
});
