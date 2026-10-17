import { describe, expect, it } from "vitest";
import { mapPassengerRideAuthorityToFixture } from "../../../apps/passenger-app-web/lib/ride/passenger-live";
import { mapNativePassengerRideAuthorityToFixture } from "../../../packages/passenger-client/src/ride/native-presentation";
import { authority } from "../pax-live-tracking-20261017/fixture";

for (const [platform, project] of [
  ["Web", mapPassengerRideAuthorityToFixture],
  ["Native", mapNativePassengerRideAuthorityToFixture],
] as const) {
  describe(`${platform} actual reservation acceptance timeout`, () => {
    it.each([false, true])(
      "explains the expired offer without presenting a retained assignment as active (%s)",
      (retainedAssignment) => {
        const view = authority("dispatch_timeout");
        view.actions = {
          canCancel: true,
          canContact: false,
          canRate: false,
          canReadReceipt: false,
        };
        if (!retainedAssignment) view.assignment = null;
        const original = structuredClone(view);
        const fixture = project(view, view.order.orderId);
        expect(fixture.status).toBe("派車逾時");
        expect(fixture.statusSubline).toBe(
          "尚未有司機完成接單，請等待調度重新安排車輛，或取消行程。",
        );
        expect(fixture.screenId).toBe("P5-01");
        expect(fixture.token).toBe(view.order.orderId);
        expect(fixture.orderNo).toBe(view.order.orderNo);
        expect(fixture.canCancel).toBe(true);
        expect(fixture.canContact).toBe(false);
        expect(fixture.etaMain).toBeUndefined();
        expect(fixture.etaSub).toBeUndefined();
        expect(fixture.mapState).toBe("missing");
        expect(fixture.driver.name).toBe("");
        expect(fixture.driver.plateNo).toBe("");
        expect(fixture.assignment).toBeNull();
        expect(view).toEqual(original);
      },
    );

    it("reads the replacement assignment on the original order after redispatch", () => {
      const view = authority("driver_accepted");
      view.assignment!.assignmentVersion = 2;
      view.assignment!.vehicle.plateNo = "TEST-NEW";
      const fixture = project(view, view.order.orderId);
      expect(fixture.screenId).toBe("P5-05");
      expect(fixture.status).toBe("司機已接受行程");
      expect(fixture.statusSubline).toBeUndefined();
      expect(fixture.driver.plateNo).toBe("TEST-NEW");
      expect(fixture.token).toBe(view.order.orderId);
    });
  });
}
