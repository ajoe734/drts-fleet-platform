import { afterEach, expect, it, vi } from "vitest";
import { ReviewDemoController } from "../../../apps/api/src/modules/passenger-app/review-demo/review-demo.controller";
import { PassengerBookingService } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.service";
import {
  renderPassengerReviewRecord,
  type PassengerReviewRecord,
} from "../../../packages/passenger-client/src/review-demo";

afterEach(() => vi.unstubAllEnvs());

it("review retry/download use the real booking ownership admission before charge or extra factual queries", async () => {
  vi.stubEnv("DRTS_ENV", "test");
  vi.stubEnv("PAX_REVIEW_DEMO_ENABLED", "true");
  const owner = "synthetic-owner";
  const repository = {
    getBookingHistoryOwner: vi.fn(async () => "other-owner"),
  };
  const multi = { getPassengerRideById: vi.fn() };
  const booking = new PassengerBookingService(
    repository as never,
    multi as never,
    {} as never,
    {} as never,
    undefined,
    {} as never,
  );
  const charge = { processOrder: vi.fn() };
  const database = { query: vi.fn() };
  const controller = new ReviewDemoController(
    {} as never,
    {} as never,
    { getMe: async () => ({ account: { drtsPassengerId: owner } }) } as never,
    booking,
    charge as never,
    database as never,
    {} as never,
  );
  const id = "b18bd875-0b10-4d89-b3d8-90f9e9d3a372";
  await expect(controller.retryPayment(null, id)).rejects.toMatchObject({
    code: "PASSENGER_RIDE_NOT_FOUND",
  });
  await expect(controller.record(null, id)).rejects.toMatchObject({
    code: "PASSENGER_RIDE_NOT_FOUND",
  });
  expect(charge.processOrder).not.toHaveBeenCalled();
  expect(database.query).not.toHaveBeenCalled();
  expect(multi.getPassengerRideById).not.toHaveBeenCalled();
  repository.getBookingHistoryOwner.mockResolvedValue(owner);
  multi.getPassengerRideById.mockResolvedValue({
    order: { orderId: id },
  } as never);
  await controller.retryPayment(null, id);
  expect(charge.processOrder).toHaveBeenCalledExactlyOnceWith(id);
  expect(multi.getPassengerRideById).toHaveBeenCalledWith(id, owner);
});

it("the separate rehearsal document preserves actual same-order fare/trip/payment facts and escapes source values", () => {
  const record = {
    notice: "模擬，不扣真款",
    ride: {
      order: {
        orderId: "same-real-order",
        status: "completed",
        pickup: { address: "新北<script>alert(1)</script>" },
        dropoff: { address: "新北市政府" },
        requestedPickupAt: "2026-10-15T06:58:00Z",
        completedAt: "2026-10-15T07:00:30Z",
        cancelledAt: null,
      },
      assignment: { vehicle: { plateNo: "SIM-1001" } },
      payment: {
        status: "captured",
        amount: { amountMinor: 8500, currency: "TWD" },
      },
      bookingQuote: {
        estimatedMin: 85,
        estimatedMax: 90,
        fareSnapshotId: "quote-from-API",
        fareVersion: "taipei-20230401",
      },
      rating: { score: 5 },
    },
    trip: {
      startedAt: "2026-10-15T07:00:00Z",
      actualDistanceKm: 0.3,
      actualDurationSec: 30,
    },
    charge: { paymentId: "same-payment", status: "captured", attemptCount: 2 },
  } as PassengerReviewRecord;
  const html = renderPassengerReviewRecord(record);
  for (const value of [
    "same-real-order",
    "quote-from-API",
    "same-payment",
    "SIM-1001",
    "taipei-20230401",
    "非正式憑證",
    "<dd>85</dd>",
    "<dd>0.3</dd>",
    "<dd>30</dd>",
  ])
    expect(html).toContain(value);
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
});
