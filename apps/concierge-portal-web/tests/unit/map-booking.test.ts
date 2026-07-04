import { describe, expect, it } from "vitest";

import {
  buildCallCenterMapFallbackReview,
  formatConciergeApiError,
} from "../../lib/map-booking";
import { t } from "../../lib/translations";

const testTranslate = (key: string, params?: Record<string, string | number>) =>
  t(key, "zh", params);

describe("map booking helpers", () => {
  it("builds a fallback review signal only for provider-outage manual review", () => {
    expect(
      buildCallCenterMapFallbackReview({
        mapGate: {
          blocking: false,
          code: "dispatch_manual_review_required",
        },
        providerState: {
          available: false,
          degraded: true,
          reasonCode: "request_failed",
        },
      }),
    ).toEqual({
      reasonCode: "map_provider_unavailable",
      providerAvailable: false,
      providerDegraded: true,
      providerReasonCode: "request_failed",
    });

    expect(
      buildCallCenterMapFallbackReview({
        mapGate: {
          blocking: false,
          code: "dispatch_manual_review_required",
        },
        providerState: {
          available: true,
          degraded: false,
          reasonCode: "available",
        },
      }),
    ).toBeNull();
  });

  it("maps backend manual-review and service-area errors to friendly copy", () => {
    const manualReviewError = {
      statusCode: 409,
      code: "DISPATCH_REQUIRES_MANUAL_REVIEW",
      rawBody:
        '{"error":{"code":"DISPATCH_REQUIRES_MANUAL_REVIEW","message":"Order requires manual review before dispatch."}}',
    };
    const serviceAreaError = {
      statusCode: 400,
      code: "SERVICE_AREA_NOT_SERVICEABLE",
      rawBody:
        '{"error":{"code":"SERVICE_AREA_NOT_SERVICEABLE","message":"Outside service area."}}',
    };

    expect(
      formatConciergeApiError(
        manualReviewError,
        testTranslate,
        "booking.error.submit",
      ),
    ).toBe(
      "此訂單在派車前已改送人工審查。請到訂單查詢確認路線，並從審查佇列繼續處理。",
    );
    expect(
      formatConciergeApiError(
        serviceAreaError,
        testTranslate,
        "booking.error.submit",
      ),
    ).toBe("上車或下車地點不在支援的服務範圍內。請確認路線後再試一次。");
  });
});
