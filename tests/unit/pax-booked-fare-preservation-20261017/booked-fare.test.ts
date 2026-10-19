import { describe, expect, it } from "vitest";
import { mapPassengerRideAuthorityToFixture } from "../../../apps/passenger-app-web/lib/ride/passenger-live";
import { mapNativePassengerRideAuthorityToFixture } from "../../../packages/passenger-client/src/ride/native-presentation";
import { authority } from "../pax-live-tracking-20261017/fixture";
import { bookedQuote } from "./fixture";

for (const [platform, project] of [
  ["Web", mapPassengerRideAuthorityToFixture],
  ["Native", mapNativePassengerRideAuthorityToFixture],
] as const) {
  describe(`${platform} accepted order booking estimate`, () => {
    it.each(["created", "preassigned", "dispatch_timeout"] as const)(
      "preserves the accepted quote and route while %s without an active assignment",
      (status) => {
        const view = authority(status);
        if (status !== "dispatch_timeout") view.assignment = null;
        view.bookingQuote = structuredClone(bookedQuote);
        const original = structuredClone(view);
        const fixture = project(view, view.order.orderId);
        expect(fixture.routeFareText).toBe("預估 NT$ 85–NT$ 125");
        expect(fixture.routeDistanceKm).toBe("約 4.2 公里");
        expect(fixture.routeDurationMinutes).toBe("約 14 分鐘");
        expect(fixture.token).toBe(view.order.orderId);
        expect(fixture.assignment).toBeNull();
        expect(fixture.driver.plateNo).toBe("");
        expect(view).toEqual(original);
      },
    );

    it("shows a single accepted estimate without treating whole NTD as minor units", () => {
      const view = authority("dispatch_timeout");
      view.bookingQuote = {
        ...bookedQuote,
        estimatedMin: 1250,
        estimatedMax: 1250,
      };
      expect(project(view, view.order.orderId).routeFareText).toBe(
        "預估 NT$ 1,250",
      );
    });

    it("retains the current assignment fare and route when those are available", () => {
      const view = authority("driver_accepted");
      view.bookingQuote = bookedQuote;
      const fixture = project(view, view.order.orderId);
      expect(fixture.routeFareText).toBe("應付 NT$ 300");
      expect(fixture.routeDistanceKm).toBe("約 4.0 公里");
      expect(fixture.driver.plateNo).toBe("TEST-ETA");
    });

    it("keeps the existing fallback when no accepted estimate exists", () => {
      const view = authority("dispatch_timeout");
      const fixture = project(view, view.order.orderId);
      expect(fixture.routeFareText).toBe("依計費表實際金額收費");
      expect(fixture.routeDistanceKm).toBeUndefined();
    });

    it("does not expose a new fare on a cancelled order", () => {
      const view = authority("cancelled");
      view.bookingQuote = bookedQuote;
      expect(project(view, view.order.orderId).routeFareText).toBeUndefined();
    });

    it("preserves an actual quote anomaly instead of hiding it behind the booked estimate", () => {
      const view = authority("preassigned");
      view.assignment = null;
      view.bookingQuote = bookedQuote;
      const fixture = project(
        view,
        view.order.orderId,
        "ride",
        "quote_provider_unavailable",
      );
      expect(fixture.screenId).toBe("A04");
      expect(fixture.routeFareText).toBe("目前無法取得正式報價");
    });
  });
}
