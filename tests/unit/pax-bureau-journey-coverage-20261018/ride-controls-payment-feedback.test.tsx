// @vitest-environment jsdom
// Regression for actual-Root-current-B-retry-feedback-original-finding.json:
// same-order d9c8050d... had captured NT$105 and a sent rating, but
// ReviewRideControls kept showing the stale "等待行程付款狀態更新" queued
// message because it never read the retry-payment response body.
import {
  render as renderComponent,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewRideControls } from "../../../apps/passenger-app-web/components/review-demo/ride-controls";

vi.mock(
  "../../../apps/passenger-app-web/components/review-demo/review-context",
  () => ({ useReviewDemo: () => true, useTrialMode: () => false }),
);

const orderId = "d9c8050d-bfac-49c5-b718-3bf3c066d312";

function jsonResponse(data: unknown, ok = true) {
  return {
    ok,
    json: async () => ({ data }),
  } as Response;
}

// The order-id <output> also carries an implicit "status" role, so disambiguate
// by tag rather than by role alone.
function retryMessageText(): string {
  const el = document.querySelector('p[role="status"]');
  if (!el) throw new Error("retry message element not found");
  return el.textContent ?? "";
}

describe("ReviewRideControls retry-payment feedback", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows the authoritative captured status, not a stale queued message", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonResponse({ payment: { status: "captured" } }));
    renderComponent(<ReviewRideControls orderId={orderId} />);
    fireEvent.click(screen.getByText("依既有政策重試演練付款"));
    await waitFor(() => expect(retryMessageText()).toBe("付款完成"));
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/passenger-app/review-demo/rides/${orderId}/retry-payment`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows the authorized-but-not-captured status when the policy has not captured yet", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      jsonResponse({ payment: { status: "authorized" } }),
    );
    renderComponent(<ReviewRideControls orderId={orderId} />);
    fireEvent.click(screen.getByText("依既有政策重試演練付款"));
    await waitFor(() =>
      expect(retryMessageText()).toBe("付款已授權，尚未扣款"),
    );
  });

  it("shows manual-recovery status instead of implying success", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      jsonResponse({ payment: { status: "manual_recovery" } }),
    );
    renderComponent(<ReviewRideControls orderId={orderId} />);
    fireEvent.click(screen.getByText("依既有政策重試演練付款"));
    await waitFor(() => expect(retryMessageText()).toBe("款項待客服處理"));
  });

  it("keeps the existing failure message when the retry call itself fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse(null, false));
    renderComponent(<ReviewRideControls orderId={orderId} />);
    fireEvent.click(screen.getByText("依既有政策重試演練付款"));
    await waitFor(() =>
      expect(retryMessageText()).toBe(
        "補繳未完成，請確認登入與付款配置後重試。",
      ),
    );
  });
});
