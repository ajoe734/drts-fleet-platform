import { describe, it, expect, vi, beforeEach } from "vitest";
import { PassengerBookingService } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.service";
import { randomUUID } from "crypto";

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
      compensateFailedTrustedPassengerRide: vi.fn(),
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

  it("pax-booking_trusted_create_and_ownership: ignores forged body passenger data, respects quote owner", async () => {
    accountMock.transaction = vi.fn(async (cb) => {
      return cb({
        lockAccount: vi.fn().mockResolvedValue({
          drtsPassengerId: "pax-1",
          displayName: "Real Name",
          verifiedPhone: "0912345678",
        }),
      });
    });

    const mockNow = Date.now();
    const scheduledAtStr = new Date(mockNow + 2 * 60 * 60 * 1000).toISOString();
    const expiresAtStr = new Date(mockNow + 10 * 60 * 1000).toISOString();

    fareMock.findOwnedSnapshot.mockResolvedValue({
      scheduledAt: scheduledAtStr,
      expiresAt: expiresAtStr,
      origin: { lat: 25.04, lng: 121.51 },
      destination: { lat: 25.06, lng: 121.55 },
      passengerSubjectRef: "drts_passenger:pax-1", // owner matches
    });

    const orderId = randomUUID();
    multiTaxiMock.createTrustedPassengerRide.mockResolvedValue({
      ride: { orderId },
    });
    multiTaxiMock.getPassengerRideById.mockResolvedValue({
      order: { orderId }
    });

    const command = {
      scheduledAt: scheduledAtStr,
      origin: { lat: 25.04, lng: 121.51, address: "Origin Address" },
      destination: { lat: 25.06, lng: 121.55, address: "Dest Address" },
      paymentMethodId: "pm-1",
      fareSnapshotId: "fs-1",
      passengerConfirmedAt: new Date().toISOString(),
      // Forged body data
      passenger: { name: "Fake Name", phone: "0999999999", passengerId: "hacker-1" },
    };

    const result = await service.createRide("pax-1", command as any, "req-1");
    expect(result.ride.order.orderId).toBe(orderId);

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
  });

  it("pax-booking_trusted_create_and_ownership: falls back to contactPhone if SMS verification is disabled", async () => {
    process.env.REQUIRE_SMS_VERIFICATION = "false";
    accountMock.transaction = vi.fn(async (cb) => {
      return cb({
        lockAccount: vi.fn().mockResolvedValue({
          drtsPassengerId: "pax-1",
          displayName: "Real Name",
          verifiedPhone: null,
          contactPhone: "0911111111", // fallback
        }),
      });
    });

    const mockNow = Date.now();
    const scheduledAtStr = new Date(mockNow + 2 * 60 * 60 * 1000).toISOString();
    const expiresAtStr = new Date(mockNow + 10 * 60 * 1000).toISOString();

    fareMock.findOwnedSnapshot.mockResolvedValue({
      scheduledAt: scheduledAtStr,
      expiresAt: expiresAtStr,
      origin: { lat: 25.04, lng: 121.51 },
      destination: { lat: 25.06, lng: 121.55 },
      passengerSubjectRef: "drts_passenger:pax-1",
    });

    const orderId = randomUUID();
    multiTaxiMock.createTrustedPassengerRide.mockResolvedValue({
      ride: { orderId },
    });
    multiTaxiMock.getPassengerRideById.mockResolvedValue({
      order: { orderId }
    });

    const command = {
      scheduledAt: scheduledAtStr,
      origin: { lat: 25.04, lng: 121.51, address: "Origin Address" },
      destination: { lat: 25.06, lng: 121.55, address: "Dest Address" },
      paymentMethodId: "pm-1",
      fareSnapshotId: "fs-1",
      passengerConfirmedAt: new Date().toISOString(),
    };

    const result = await service.createRide("pax-1", command as any, "req-1");
    expect(multiTaxiMock.createTrustedPassengerRide).toHaveBeenCalledWith(
      expect.objectContaining({
        passenger: {
          passengerId: "pax-1",
          name: "Real Name",
          phone: "0911111111", // Used contactPhone
        },
      }),
      "pax-1",
      "req-1"
    );
  });
  
  it("pax-booking_trusted_create_and_ownership: rejects foreign quotes", async () => {
    accountMock.transaction = vi.fn(async (cb) => {
      return cb({
        lockAccount: vi.fn().mockResolvedValue({
          drtsPassengerId: "pax-1",
          displayName: "Real Name",
          verifiedPhone: "0912345678",
        }),
      });
    });

    const mockNow = Date.now();
    const scheduledAtStr = new Date(mockNow + 2 * 60 * 60 * 1000).toISOString();
    const expiresAtStr = new Date(mockNow + 10 * 60 * 1000).toISOString();

    fareMock.findOwnedSnapshot.mockResolvedValue({
      scheduledAt: scheduledAtStr,
      expiresAt: expiresAtStr,
      origin: { lat: 25.04, lng: 121.51 },
      destination: { lat: 25.06, lng: 121.55 },
      passengerSubjectRef: "drts_passenger:pax-other", // FOREIGN QUOTE
    });

    const command = {
      scheduledAt: scheduledAtStr,
      origin: { lat: 25.04, lng: 121.51, address: "Origin Address" },
      destination: { lat: 25.06, lng: 121.55, address: "Dest Address" },
      paymentMethodId: "pm-1",
      fareSnapshotId: "fs-1",
      passengerConfirmedAt: new Date().toISOString(),
    };

    let err: any;
    try { await service.createRide("pax-1", command as any, "req-1"); } catch (e) { err = e; }
    expect(err.response.error.message).toMatch(/belongs to another passenger/);
  });

  it("pax-booking_history_and_ride_actions: prevents cross-account viewing, paginates properly", async () => {
    repoMock.getBookingHistoryOwner.mockResolvedValue("pax-1");
    let err4: any;
    try { await service.getRide("pax-2", randomUUID()); } catch (e) { err4 = e; }
    expect(err4.response.error.message).toMatch(/Ride not found/);
    
    const id1 = randomUUID();
    const id2 = randomUUID();
    const id3 = randomUUID();

    repoMock.listBookingHistories.mockImplementation(async (_paxId: any, limit: any, cursorCreatedAt: any, cursorOrderId: any) => {
      if (!cursorCreatedAt) {
        return [
          { orderId: id1, createdAt: "2026-10-10T05:00:00.123456Z" },
          { orderId: id2, createdAt: "2026-10-10T04:00:00.654321Z" }
        ];
      }
      if (cursorCreatedAt === "2026-10-10T04:00:00.654321Z" && cursorOrderId === id2) {
        return [
          { orderId: id3, createdAt: "2026-10-10T03:00:00.000000Z" }
        ];
      }
      return [];
    });
    
    multiTaxiMock.getPassengerRideById.mockImplementation(async (orderId: string) => {
      return { order: { orderId, status: "completed" } };
    });
    
    const res = await service.getRideList("pax-1", 2);
    expect(res.rides.length).toBe(2);
    expect(res.rides[0]?.order.orderId).toBe(id1);
    expect(res.nextCursor).toBeDefined();
    
    // consume next cursor
    const [cursorCreatedAt, cursorOrderId] = res.nextCursor!.split(",");
    const res2 = await service.getRideList("pax-1", 2, res.nextCursor);
    expect(res2.rides.length).toBe(1);
    expect(res2.rides[0]?.order.orderId).toBe(id3);
    
    // Check getActiveRides traversing multiple pages
    repoMock.listBookingHistories.mockImplementation(async (_paxId: any, limit: any, cursorCreatedAt: any) => {
      if (!cursorCreatedAt) {
        return Array.from({ length: 50 }).map((_, i) => ({ orderId: `completed-${i}`, createdAt: "2026-10-10T05:00:00Z" }));
      }
      if (cursorCreatedAt === "2026-10-10T05:00:00Z") {
        return [
          { orderId: "active-1", createdAt: "2026-10-10T04:00:00Z" }
        ];
      }
      return [];
    });
    multiTaxiMock.getPassengerRideById.mockImplementation(async (orderId: string) => {
      if (orderId.startsWith("completed-")) return { order: { orderId, status: "completed" } };
      return { order: { orderId, status: "on_trip" } };
    });
    
    const activeRes = await service.getActiveRides("pax-1");
    expect(activeRes.rides.length).toBe(1);
    expect(activeRes.rides[0]?.order.orderId).toBe("active-1");
  });
});
