import { describe, it, expect, vi, beforeEach } from "vitest";
import { PassengerBookingService } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.service";

describe("Passenger Booking History API - Spec requirements", () => {
  let service: PassengerBookingService;
  let repoMock: any;
  let multiTaxiMock: any;
  let fareMock: any;
  let accountMock: any;

  beforeEach(() => {
    repoMock = {
      createBookingHistory: vi.fn(),
      listBookingHistories: vi.fn(),
      getBookingHistoryOwner: vi.fn(),
    };
    multiTaxiMock = {
      createTrustedPassengerRide: vi.fn(),
      cancelTrustedPassengerRide: vi.fn(),
      getPassengerRideById: vi.fn(),
      submitTrustedPassengerRating: vi.fn(),
      getTrustedPassengerReceipt: vi.fn(),
    };
    fareMock = {
      findOwnedSnapshot: vi.fn(),
    };
    accountMock = {
      transaction: vi.fn((cb) => cb({ lockAccount: vi.fn() })),
    };

    process.env.REQUIRE_SMS_VERIFICATION = "false";

    service = new PassengerBookingService(
      repoMock,
      multiTaxiMock,
      fareMock,
      accountMock,
    );
  });

  it("pax-booking_trusted_create_and_ownership: ignores body passenger data, respects quote owner", async () => {
    accountMock.transaction = vi.fn(async (cb) => {
      return cb({
        lockAccount: vi.fn().mockResolvedValue({
          drtsPassengerId: "pax-1",
          displayName: "Real Name",
          verifiedPhone: "0912345678",
        }),
      });
    });

    fareMock.findOwnedSnapshot.mockResolvedValue({
      scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      origin: { lat: 25.04, lng: 121.51 },
      destination: { lat: 25.06, lng: 121.55 },
    });

    multiTaxiMock.createTrustedPassengerRide.mockResolvedValue({
      ride: { orderId: "order-1" },
    });

    const command = {
      scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      origin: { lat: 25.04, lng: 121.51, address: "Origin Address" },
      destination: { lat: 25.06, lng: 121.55, address: "Dest Address" },
      paymentMethodId: "pm-1",
      fareSnapshotId: "fs-1",
      passengerConfirmedAt: new Date().toISOString(),
    };

    // Call service to test body data ignored (it uses account info)
    const result = await service.createRide("pax-1", command, "req-1");
    expect(result.ride.orderId).toBe("order-1");

    expect(multiTaxiMock.createTrustedPassengerRide).toHaveBeenCalledWith(
      expect.objectContaining({
        passenger: {
          passengerId: "pax-1",
          name: "Real Name",
          phone: "0912345678",
        },
      }),
      "pax-1",
      "req-1"
    );
    
    // Check missing phone
    accountMock.transaction = vi.fn(async (cb) => {
      return cb({
        lockAccount: vi.fn().mockResolvedValue({
          drtsPassengerId: "pax-1",
          displayName: "Real Name",
          verifiedPhone: null,
          contactPhone: null,
        }),
      });
    });
    let err1: any;
    try { await service.createRide("pax-1", command, "req-1"); } catch (e) { err1 = e; }
    expect(err1.response.error.message).toMatch(/Phone number is required/);
    
    // Future confirmation
    command.passengerConfirmedAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    accountMock.transaction = vi.fn(async (cb) => {
      return cb({
        lockAccount: vi.fn().mockResolvedValue({
          drtsPassengerId: "pax-1",
          displayName: "Real Name",
          verifiedPhone: "0912345678",
        }),
      });
    });
    let err2: any;
    try { await service.createRide("pax-1", command, "req-1"); } catch (e) { err2 = e; }
    expect(err2.response.error.message).toMatch(/cannot be in the future/);
    
    // History failure -> cancellation
    command.passengerConfirmedAt = new Date().toISOString();
    repoMock.createBookingHistory.mockRejectedValueOnce(new Error("DB Error"));
    let err3: any;
    try { await service.createRide("pax-1", command, "req-1"); } catch (e) { err3 = e; }
    expect(err3.response.error.message).toMatch(/Failed to save booking history/);
    expect(multiTaxiMock.cancelTrustedPassengerRide).toHaveBeenCalledWith("order-1", "pax-1", "req-1");
  });

  it("pax-booking_history_and_ride_actions: prevents cross-account viewing, paginates properly", async () => {
    // Cross-account check
    repoMock.getBookingHistoryOwner.mockResolvedValue("pax-1");
    let err4: any;
    try { await service.getRide("pax-2", "order-1"); } catch (e) { err4 = e; }
    expect(err4.response.error.message).toMatch(/Ride not found/);
    
    repoMock.listBookingHistories.mockImplementation(async (_paxId: any, _limit: any, cursorCreatedAt: any) => {
      if (!cursorCreatedAt) {
        return [
          { orderId: "order-1", createdAt: "2026-10-10T05:00:00Z" },
          { orderId: "order-2", createdAt: "2026-10-10T04:00:00Z" }
        ];
      }
      return [];
    });
    
    multiTaxiMock.getPassengerRideById.mockImplementation(async (orderId: string) => {
      return { order: { orderId, status: "completed" } };
    });
    
    const res = await service.getRideList("pax-1", 1);
    expect(res.rides.length).toBe(1);
    expect(res.rides[0]?.order.orderId).toBe("order-1");
    expect(res.nextCursor).toBeDefined();
    
    // Check getActiveRides looping
    repoMock.listBookingHistories.mockImplementation(async (_paxId: any, _limit: any, cursorCreatedAt: any) => {
      if (!cursorCreatedAt) {
        return [
          { orderId: "order-1", createdAt: "2026-10-10T05:00:00Z" }, // completed
          { orderId: "order-2", createdAt: "2026-10-10T04:00:00Z" } // active
        ];
      }
      return [];
    });
    multiTaxiMock.getPassengerRideById.mockImplementation(async (orderId: string) => {
      if (orderId === "order-1") return { order: { orderId, status: "completed" } };
      return { order: { orderId, status: "on_trip" } };
    });
    
    const activeRes = await service.getActiveRides("pax-1");
    expect(activeRes.rides.length).toBe(1);
    expect(activeRes.rides[0]?.order.orderId).toBe("order-2");
  });
});
