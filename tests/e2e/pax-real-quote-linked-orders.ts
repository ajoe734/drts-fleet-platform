import type { APIRequestContext } from "@playwright/test";

// The producer's GET rides page already returns the complete authoritative
// PassengerRideAuthorityView per ride (apps/api .../passenger-booking.service.ts
// getRideList -> getPassengerRideById), so a list reader only needs to match
// bookingQuote.fareSnapshotId on each page; it must never issue an extra
// per-ride detail GET.
export interface AuthoritativeRideListItem {
  order?: { orderId?: string };
  bookingQuote?: { fareSnapshotId?: string };
}

export interface AuthoritativeRideListPageBody {
  rides: AuthoritativeRideListItem[];
  nextCursor?: string;
}

export interface RideListPageResult {
  status: number;
  body?: AuthoritativeRideListPageBody;
}

export type FetchRideListPage = (
  cursor?: string,
) => Promise<RideListPageResult>;

export class RideListStatusError extends Error {
  constructor(readonly status: number) {
    super(`Authoritative ride list page returned status ${status}`);
    this.name = "RideListStatusError";
  }
}

export class RideListCursorCycleError extends Error {
  constructor(readonly cursor: string) {
    super(`Authoritative ride list repeated cursor ${cursor}`);
    this.name = "RideListCursorCycleError";
  }
}

export class RideListMalformedPageError extends Error {
  constructor(readonly reason: string) {
    super(`Authoritative ride list page is malformed: ${reason}`);
    this.name = "RideListMalformedPageError";
  }
}

export async function readAuthoritativeLinkedOrders(
  fetchPage: FetchRideListPage,
  snapshotId: string,
): Promise<string[]> {
  const ids: string[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    if (page.status !== 200) throw new RideListStatusError(page.status);
    if (!Array.isArray(page.body?.rides)) {
      throw new RideListMalformedPageError(
        "200 response body is missing a rides array",
      );
    }
    for (const ride of page.body.rides) {
      // Absent/null bookingQuote legitimately means this ride has no quote
      // at all (unrelated order); only a page that is itself structurally
      // broken, or a ride that matches but carries no order identity, is a
      // producer defect worth failing on.
      const fareSnapshotId = ride.bookingQuote?.fareSnapshotId;
      if (fareSnapshotId == null || fareSnapshotId !== snapshotId) continue;
      if (!ride.order?.orderId) {
        throw new RideListMalformedPageError(
          "a ride matched bookingQuote.fareSnapshotId but is missing order.orderId",
        );
      }
      ids.push(ride.order.orderId);
    }
    cursor = page.body.nextCursor;
    if (cursor) {
      if (seenCursors.has(cursor)) throw new RideListCursorCycleError(cursor);
      seenCursors.add(cursor);
    }
  } while (cursor);
  return ids.sort();
}

export function createPlaywrightRideListFetcher(
  request: APIRequestContext,
  listUrl: string,
  camel: (value: unknown) => any,
): FetchRideListPage {
  return async (cursor) => {
    const url = new URL(listUrl);
    url.searchParams.set("limit", "50");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await request.get(url.toString());
    const status = response.status();
    if (status !== 200) return { status };
    return { status, body: camel(await response.json()).data };
  };
}
