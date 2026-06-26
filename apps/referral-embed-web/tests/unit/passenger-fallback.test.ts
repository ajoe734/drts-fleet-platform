import { describe, expect, it } from "vitest";
import {
  PASSENGER_HUMAN_CONTINUING_CODE,
  PASSENGER_HUMAN_FALLBACK_ACTIVE_CODE,
  PASSENGER_STATUS_UPDATE_CODE,
  buildPassengerMessageBodyKey,
  buildPassengerMessageTitleKey,
  resolvePassengerFallbackView,
} from "../../lib/passenger-fallback";

const projection = {
  messages: [] as Array<{ messageCode: string; category: "info" | "warning" }>,
  etaMinutes: 12,
};

describe("passenger fallback helpers", () => {
  it("maps vehicle-change fallback screens to the passenger status-update code", () => {
    const view = resolvePassengerFallbackView({
      screen: "fb_vehicle_change",
      projection,
    });

    expect(view.messageCode).toBe(PASSENGER_STATUS_UPDATE_CODE);
    expect(view.copyCode).toBe(PASSENGER_STATUS_UPDATE_CODE);
    expect(view.progressStage).toBe("vehicle_change_in_progress");
    expect(view.etaMinutes).toBeNull();
  });

  it("normalizes partner-facing human fallback codes to passenger-safe copy keys", () => {
    const view = resolvePassengerFallbackView({
      screen: "fb_service_continuing",
      projection: {
        messages: [
          {
            messageCode: PASSENGER_HUMAN_FALLBACK_ACTIVE_CODE,
            category: "warning",
          },
        ],
        etaMinutes: 9,
      },
    });

    expect(view.messageCode).toBe(PASSENGER_HUMAN_FALLBACK_ACTIVE_CODE);
    expect(view.copyCode).toBe(PASSENGER_HUMAN_CONTINUING_CODE);
    expect(
      buildPassengerMessageTitleKey(view.messageCode, view.screen),
    ).toContain(PASSENGER_HUMAN_CONTINUING_CODE);
  });

  it("keeps ETA-only fallback states outside the progress rail", () => {
    const view = resolvePassengerFallbackView({
      screen: "fb_eta_updated",
      projection: {
        messages: [
          {
            messageCode: PASSENGER_STATUS_UPDATE_CODE,
            category: "info",
          },
        ],
        etaMinutes: 19,
      },
    });

    expect(view.progressStage).toBeNull();
    expect(view.etaMinutes).toBe(19);
    expect(
      buildPassengerMessageBodyKey(view.messageCode, view.screen),
    ).toBe(
      "passengerMessageCode.sandbox_fulfillment.status_update_available.fb_eta_updated.body",
    );
  });
});
