import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewDemoController } from "../../../apps/api/src/modules/passenger-app/review-demo/review-demo.controller";
import {
  GET,
  POST,
} from "../../../apps/passenger-app-web/app/api/passenger-app/[...path]/route";

const OWNER = "synthetic-owner";

function controller(rows: unknown[]) {
  const query = vi.fn(async () => ({ rows }));
  const database = {
    withTransaction: vi.fn(async (run: (client: unknown) => unknown) =>
      run({ query }),
    ),
  };
  return {
    query,
    review: new ReviewDemoController(
      {} as never,
      {} as never,
      { getMe: async () => ({ account: { drtsPassengerId: OWNER } }) } as never,
      {} as never,
      {} as never,
      database as never,
    ),
  };
}

describe("trial readiness", () => {
  beforeEach(() => {
    vi.stubEnv("DRTS_ENV", "test");
    vi.stubEnv("PAX_REVIEW_DEMO_ENABLED", "true");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("admits an account the booking guard admits", async () => {
    const { review, query } = controller([]);
    await expect(review.trialReadiness(null)).resolves.toMatchObject({
      data: { canBook: true },
    });
    // The booking guard's own query, for this account and purpose.
    expect(query).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("passenger.booking_histories"),
      [OWNER, "booking"],
    );
  });

  it("reports an account with an unsettled test charge as unable to book", async () => {
    // Shared dev, 2026-11-01: three synthetic accounts kept a manual_recovery
    // charge and every booking from them failed with pending_payment_block.
    const { review } = controller([{ "?column?": 1 }]);
    await expect(review.trialReadiness(null)).resolves.toMatchObject({
      data: { canBook: false },
    });
  });

  it("is absent outside the rehearsal", async () => {
    vi.stubEnv("PAX_REVIEW_DEMO_ENABLED", "false");
    const { review, query } = controller([]);
    await expect(review.trialReadiness(null)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(query).not.toHaveBeenCalled();
  });
});

describe("passenger BFF", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DRTS_API_URL", "http://upstream.local");
    vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "test-audience");
    global.fetch = vi.fn(async () =>
      Response.json({ data: { can_book: true } }),
    );
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  const path = ["review-demo", "trial", "readiness"];
  const url = "http://localhost/api/passenger-app/review-demo/trial/readiness";

  it("forwards only GET for the trial readiness check", async () => {
    const read = await GET(new NextRequest(url), {
      params: Promise.resolve({ path }),
    });
    expect(read.status).toBe(200);
    // The first call fetches the Cloud Run identity token for the upstream.
    expect(
      vi
        .mocked(global.fetch)
        .mock.calls.map(([target]) => String(target))
        .filter((target) => target.startsWith("http://upstream.local")),
    ).toEqual([
      "http://upstream.local/api/passenger-app/review-demo/trial/readiness",
    ]);
    vi.mocked(global.fetch).mockClear();
    const write = await POST(
      new NextRequest(url, {
        method: "POST",
        headers: { Origin: "http://localhost" },
      }),
      { params: Promise.resolve({ path }) },
    );
    expect(write.status).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
