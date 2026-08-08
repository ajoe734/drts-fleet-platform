import { describe, expect, it, vi } from "vitest";
import { createEnterpriseDispatchTenantClient } from "@/lib/api-client";
import {
  buildEnterpriseBookingUpdateCommand,
  createEnterpriseBookingDraftFromRecord,
} from "@/lib/enterprise-booking-draft";
import { enterpriseDispatchBookingRecord } from "../fixtures/dispatch-booking-fixture";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify({ data: body, meta: {} }), {
    headers: { "Content-Type": "application/json" },
  });
}

describe("enterprise booking lifecycle API wiring", () => {
  it("reads, updates, and cancels the same booking id through tenant commands", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([enterpriseDispatchBookingRecord]))
      .mockResolvedValueOnce(jsonResponse(enterpriseDispatchBookingRecord))
      .mockResolvedValueOnce(jsonResponse(enterpriseDispatchBookingRecord))
      .mockResolvedValueOnce(jsonResponse({ ...enterpriseDispatchBookingRecord, status: "cancelled" }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createEnterpriseDispatchTenantClient("http://api.test", "tenant-001");
    const listed = (await client.listBookings())[0]!;
    const read = await client.getBooking(listed.bookingId);
    const draft = createEnterpriseBookingDraftFromRecord(read);
    const update = buildEnterpriseBookingUpdateCommand({ ...draft, notes: "Updated at browser review" });
    await client.updateBooking(listed.bookingId, update);
    await client.cancelBooking(listed.bookingId, { reason: "Cancelled from browser" });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "http://api.test/api/tenant/bookings",
      "http://api.test/api/tenant/bookings/booking-001",
      "http://api.test/api/tenant/bookings/booking-001",
      "http://api.test/api/tenant/bookings/booking-001/cancel",
    ]);
    const updateCall = fetchMock.mock.calls[2]!;
    expect(updateCall[1]).toMatchObject({ method: "PUT" });
    expect(JSON.parse(String((updateCall[1] as RequestInit).body))).toMatchObject({
      notes: "Updated at browser review",
      passenger: { name: enterpriseDispatchBookingRecord.passenger.name },
      costCenter: enterpriseDispatchBookingRecord.costCenter,
    });
    expect(fetchMock.mock.calls[3]![1]).toMatchObject({ method: "POST" });
  });
});
