import { describe, it, expect } from "vitest";
import { PassengerBookingService } from "../../src/modules/passenger-app/booking/passenger-booking.service";
import { PassengerBookingController } from "../../src/modules/passenger-app/booking/passenger-booking.controller";

describe("PassengerBooking", () => {
  it("Controller and Service exist", () => {
    expect(PassengerBookingService).toBeDefined();
    expect(PassengerBookingController).toBeDefined();
  });
});
