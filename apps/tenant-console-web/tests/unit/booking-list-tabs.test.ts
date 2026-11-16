import type { BookingRecord } from "@drts/contracts";
import { describe, expect, it } from "vitest";
import {
  applyBookingListQuery,
  buildBookingListQueryString,
  countBookingTabs,
  hasActiveBookingFilters,
  parseBookingListQuery,
} from "../../lib/booking-list";

// The booking list header tabs used to be plain text with the first tab
// always highlighted, so clicking "進行中" or "已取消" did nothing.

const NOW = Date.parse("2026-11-16T12:00:00Z");

function booking(
  id: string,
  overrides: Partial<BookingRecord> = {},
): BookingRecord {
  return {
    bookingId: id,
    orderId: `order-${id}`,
    orderStatus: "ready_for_dispatch",
    approvalState: "not_required",
    reservationWindowStart: "2026-11-10T08:00:00Z",
    createdAt: "2026-11-01T08:00:00Z",
    passenger: { name: `Passenger ${id}`, phone: "0900000000" },
    pickup: { address: "Pickup" },
    dropoff: { address: "Dropoff" },
    serviceBucket: "taxi_realtime",
    businessDispatchSubtype: null,
    costCenter: null,
    notes: null,
    ...overrides,
  } as unknown as BookingRecord;
}

const bookings = [
  booking("live-1"),
  booking("future-1", { reservationWindowStart: "2026-11-20T08:00:00Z" }),
  booking("approval-1", { approvalState: "pending" } as Partial<BookingRecord>),
  booking("done-1", { orderStatus: "completed" }),
  booking("cancel-1", { orderStatus: "cancelled" }),
  booking("cancel-2", { orderStatus: "cancelled" }),
];

const ids = (items: BookingRecord[]) => items.map((item) => item.bookingId);

describe("booking list header tabs", () => {
  it("parses the tab from the URL and rejects unknown values", () => {
    expect(parseBookingListQuery({ tab: "cancel" }).tab).toBe("cancel");
    expect(parseBookingListQuery({ tab: "bogus" }).tab).toBe("all");
    expect(parseBookingListQuery({}).tab).toBe("all");
  });

  it("filters the rows to the selected tab", () => {
    const run = (tab: string) =>
      ids(
        applyBookingListQuery(bookings, parseBookingListQuery({ tab }), NOW)
          .items,
      );

    expect(run("all")).toHaveLength(6);
    expect(run("cancel").sort()).toEqual(["cancel-1", "cancel-2"]);
    expect(run("done")).toEqual(["done-1"]);
    expect(run("approval")).toEqual(["approval-1"]);
    expect(run("reserve")).toEqual(["future-1"]);
    expect(run("live").sort()).toEqual(["approval-1", "future-1", "live-1"]);
  });

  it("counts each tab with the same rule it filters by", () => {
    const counts = countBookingTabs(bookings, NOW);
    expect(counts).toEqual({
      all: 6,
      live: 3,
      reserve: 1,
      approval: 1,
      done: 1,
      cancel: 2,
    });
    for (const [tab, count] of Object.entries(counts)) {
      const query = parseBookingListQuery({ tab, pageSize: "50" });
      expect(applyBookingListQuery(bookings, query, NOW).total).toBe(count);
    }
  });

  it("keeps the tab in links and treats it as an active filter", () => {
    const query = parseBookingListQuery({ tab: "live", q: "Passenger" });
    expect(buildBookingListQueryString(query)).toBe("tab=live&q=Passenger");
    expect(buildBookingListQueryString(query, { tab: "all", page: 1 })).toBe(
      "q=Passenger",
    );
    expect(
      hasActiveBookingFilters(parseBookingListQuery({ tab: "done" })),
    ).toBe(true);
    expect(hasActiveBookingFilters(parseBookingListQuery({}))).toBe(false);
  });

  it("combines the tab with the status chips", () => {
    const query = parseBookingListQuery({
      tab: "live",
      status: "ready_for_dispatch,cancelled",
    });
    expect(
      ids(applyBookingListQuery(bookings, query, NOW).items).sort(),
    ).toEqual(["approval-1", "future-1", "live-1"]);
  });
});
