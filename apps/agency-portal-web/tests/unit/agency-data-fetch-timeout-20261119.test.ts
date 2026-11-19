import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AGENCY_DATA_FETCH_TIMEOUT_MS,
  agencyApiGet,
} from "@drts/agency-auth/agency-api";
import {
  TENANT_AUTH_FETCH_TIMEOUT_MS,
  tenantAuthFetch,
} from "@drts/tenant-auth/api-fetch";

// Shared dev measured the agency six-month/monthly report reads at 8.4-10.1 s
// on the API (2026-11-19). The shared 10 s BFF deadline turned some of those
// 200s into 503 AGENCY_API_UNAVAILABLE; agency data calls now get 30 s while
// auth calls keep the 10 s default.
describe("agency data BFF deadline", () => {
  const api = "http://api.agency-timeout.test";
  let timeout: ReturnType<typeof vi.spyOn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("DRTS_API_URL", api);
    vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
    timeout = vi.spyOn(AbortSignal, "timeout");
    fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { items: [] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    timeout.mockRestore();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("gives server-side agency report reads 30 s", async () => {
    const result = await agencyApiGet("synthetic-session", [
      "reports",
      "operations-summary",
    ]);
    expect(result.status).toBe(200);
    expect(AGENCY_DATA_FETCH_TIMEOUT_MS).toBe(30_000);
    expect(timeout).toHaveBeenCalledExactlyOnceWith(30_000);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps the 10 s default for other BFF calls", async () => {
    await tenantAuthFetch(`${api}/api/auth/session`, { cache: "no-store" });
    expect(TENANT_AUTH_FETCH_TIMEOUT_MS).toBe(10_000);
    expect(timeout).toHaveBeenCalledExactlyOnceWith(10_000);
  });
});
