import { describe, expect, it, vi } from "vitest";
import {
  RideListCursorCycleError,
  RideListMalformedPageError,
  RideListStatusError,
  createPlaywrightRideListFetcher,
  readAuthoritativeLinkedOrders,
  type AuthoritativeRideListItem,
  type RideListPageResult,
} from "../../e2e/pax-real-quote-linked-orders";

const SNAPSHOT = "25f30fb7-5a04-4424-ae0f-d111fdf58420";

function ride(orderId: string, fareSnapshotId?: string): AuthoritativeRideListItem {
  return {
    order: { orderId },
    ...(fareSnapshotId ? { bookingQuote: { fareSnapshotId } } : {}),
  };
}

function page(
  rides: AuthoritativeRideListItem[],
  nextCursor?: string,
): RideListPageResult {
  return { status: 200, body: { rides, ...(nextCursor ? { nextCursor } : {}) } };
}

describe("readAuthoritativeLinkedOrders", () => {
  it("reads every page, matches only the exact snapshot and issues no per-ride detail requests", async () => {
    const pages: RideListPageResult[] = [
      page(
        [
          ride("11111111-1111-1111-1111-111111111111", "other-snapshot"),
          ride("22222222-2222-2222-2222-222222222222", SNAPSHOT),
        ],
        "cursor-1",
      ),
      page([
        ride("33333333-3333-3333-3333-333333333333", "another-snapshot"),
        ride("44444444-4444-4444-4444-444444444444", SNAPSHOT),
      ]),
    ];
    const fetchPage = vi.fn(async () => pages.shift()!);

    const ids = await readAuthoritativeLinkedOrders(fetchPage, SNAPSHOT);

    expect(ids).toEqual(
      [
        "22222222-2222-2222-2222-222222222222",
        "44444444-4444-4444-4444-444444444444",
      ].sort(),
    );
    // Exactly one call per list page; the real producer's list view already
    // carries bookingQuote, so no extra per-ride detail call is ever made.
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, undefined);
    expect(fetchPage).toHaveBeenNthCalledWith(2, "cursor-1");
  });

  it("returns an empty list for an empty history page", async () => {
    const fetchPage = vi.fn(async () => page([]));

    expect(await readAuthoritativeLinkedOrders(fetchPage, SNAPSHOT)).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("returns exactly one linked order when only one ride matches", async () => {
    const fetchPage = vi.fn(async () =>
      page([
        ride("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "unrelated"),
        ride("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", SNAPSHOT),
      ]),
    );

    expect(await readAuthoritativeLinkedOrders(fetchPage, SNAPSHOT)).toEqual([
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    ]);
  });

  it("treats a ride with no bookingQuote at all as legitimately unrelated", async () => {
    const fetchPage = vi.fn(async () =>
      page([{ order: { orderId: "cccccccc-cccc-cccc-cccc-cccccccccccc" } }]),
    );

    expect(await readAuthoritativeLinkedOrders(fetchPage, SNAPSHOT)).toEqual([]);
  });

  it("throws on a repeated cursor instead of looping forever", async () => {
    const fetchPage = vi.fn(async () => page([], "repeat-cursor"));

    await expect(
      readAuthoritativeLinkedOrders(fetchPage, SNAPSHOT),
    ).rejects.toBeInstanceOf(RideListCursorCycleError);
    // The cycle is only detectable once the repeated cursor is observed a
    // second time; it must not retry indefinitely beyond that point.
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("fails immediately on a non-200 page without retrying or treating 429 as pass", async () => {
    const fetchPage = vi.fn(async (): Promise<RideListPageResult> => ({
      status: 429,
    }));

    await expect(
      readAuthoritativeLinkedOrders(fetchPage, SNAPSHOT),
    ).rejects.toMatchObject({ status: 429 });
    await expect(
      readAuthoritativeLinkedOrders(fetchPage, SNAPSHOT),
    ).rejects.toBeInstanceOf(RideListStatusError);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("fails on a 200 page with no body instead of silently proving zero orders", async () => {
    const fetchPage = vi.fn(async (): Promise<RideListPageResult> => ({
      status: 200,
    }));

    await expect(
      readAuthoritativeLinkedOrders(fetchPage, SNAPSHOT),
    ).rejects.toBeInstanceOf(RideListMalformedPageError);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("fails on a 200 body missing the rides array instead of defaulting to empty", async () => {
    const fetchPage = vi.fn(
      async (): Promise<RideListPageResult> => ({ status: 200, body: {} as any }),
    );

    await expect(
      readAuthoritativeLinkedOrders(fetchPage, SNAPSHOT),
    ).rejects.toBeInstanceOf(RideListMalformedPageError);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("fails when a matching ride has no usable order identity instead of silently dropping it", async () => {
    const fetchPage = vi.fn(async () =>
      page([{ bookingQuote: { fareSnapshotId: SNAPSHOT } }]),
    );

    await expect(
      readAuthoritativeLinkedOrders(fetchPage, SNAPSHOT),
    ).rejects.toBeInstanceOf(RideListMalformedPageError);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});

describe("createPlaywrightRideListFetcher", () => {
  function fakeResponse(status: number, body?: unknown) {
    return { status: () => status, json: async () => body };
  }

  it("requests the real paginated list URL and never a per-ride detail URL", async () => {
    const requestedUrls: string[] = [];
    const responses = [
      fakeResponse(200, {
        data: {
          rides: [{ order: { orderId: "o1" }, bookingQuote: { fareSnapshotId: SNAPSHOT } }],
          nextCursor: "cursor-1",
        },
      }),
      fakeResponse(200, { data: { rides: [] } }),
    ];
    const request = {
      get: vi.fn(async (url: string) => {
        requestedUrls.push(url);
        return responses.shift();
      }),
    } as unknown as Parameters<typeof createPlaywrightRideListFetcher>[0];
    const identity = (value: unknown) => value as any;

    const fetchPage = createPlaywrightRideListFetcher(
      request,
      "http://pax.local/api/passenger-app/rides",
      identity,
    );
    const first = await fetchPage(undefined);
    const second = await fetchPage(first.body?.nextCursor);

    expect(requestedUrls).toHaveLength(2);
    for (const requested of requestedUrls) {
      // Only the list endpoint is ever requested; a per-ride detail path
      // like /rides/<id> would not match this pathname.
      expect(new URL(requested).pathname).toBe("/api/passenger-app/rides");
    }
    expect(new URL(requestedUrls[0]).searchParams.get("limit")).toBe("50");
    expect(new URL(requestedUrls[0]).searchParams.has("cursor")).toBe(false);
    expect(new URL(requestedUrls[1]).searchParams.get("cursor")).toBe(
      "cursor-1",
    );
    expect(second.body?.rides).toEqual([]);
  });

  it("returns the bare status without a body on a non-200 response", async () => {
    const request = {
      get: vi.fn(async () => fakeResponse(429)),
    } as unknown as Parameters<typeof createPlaywrightRideListFetcher>[0];

    const fetchPage = createPlaywrightRideListFetcher(
      request,
      "http://pax.local/api/passenger-app/rides",
      (value: unknown) => value as any,
    );
    const result = await fetchPage(undefined);

    expect(result).toEqual({ status: 429 });
  });
});
