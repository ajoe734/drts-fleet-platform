// @vitest-environment jsdom
// Regression for Gemini2 2026-10-25 finding: same-order
// pax-payment:a7285101-412f-46fd-a7d8-a2a96cb17eac first failed, then the
// authoritative charge became captured (retry_at=null, last_error_code=null)
// and the inner PassengerRidePage showed 付款完成, while the outer
// ReviewRideControls role="status" kept the stale 扣款失敗 from the last
// retry-button response because it never re-read the same-order authority.
import {
  act,
  cleanup,
  fireEvent,
  render as renderComponent,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REVIEW_PAYMENT_SYNC_INTERVAL_MS,
  ReviewRideControls,
} from "../../../apps/passenger-app-web/components/review-demo/ride-controls";

vi.mock(
  "../../../apps/passenger-app-web/components/review-demo/review-context",
  () => ({ useReviewDemo: () => true }),
);

const orderA = "a7285101-412f-46fd-a7d8-a2a96cb17eac";
const orderB = "0b6f3c2e-6a51-4d0e-9b55-4a8f2f3c9d10";

type Payment = { status: string } | null;

function jsonResponse(data: unknown, ok = true) {
  return { ok, json: async () => ({ data }) } as Response;
}

function recordUrl(id: string) {
  return `/api/passenger-app/review-demo/rides/${id}/record`;
}

function retryUrl(id: string) {
  return `/api/passenger-app/review-demo/rides/${id}/retry-payment`;
}

// The order-id <output> also carries an implicit "status" role, so select the
// retry message paragraph by tag.
function statusText(): string {
  const el = document.querySelector('p[role="status"]');
  if (!el) throw new Error("status element not found");
  return el.textContent ?? "";
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("ReviewRideControls same-order payment authority sync", () => {
  // Mutable server-side charge state per order, as the record endpoint reads.
  let authority: Record<string, Payment>;
  let retryPayment: Payment;
  let fetchMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    authority = {};
    retryPayment = null;
    fetchMock = vi
      .spyOn(global, "fetch")
      .mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        for (const id of [orderA, orderB]) {
          if (url === recordUrl(id))
            return jsonResponse({
              ride: { order: { orderId: id }, payment: authority[id] ?? null },
              charge: null,
            });
          if (url === retryUrl(id))
            return jsonResponse({ payment: retryPayment });
        }
        throw new Error(`unexpected fetch ${url}`);
      });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("updates the outer status from failed to captured when the same-order authority captures later", async () => {
    authority[orderA] = { status: "failed" };
    renderComponent(<ReviewRideControls orderId={orderA} />);
    await flush();
    expect(statusText()).toBe("扣款失敗");

    // Retry inside cooldown: the executor leaves it failed for now.
    retryPayment = { status: "failed" };
    fireEvent.click(screen.getByText("依既有政策重試演練付款"));
    await flush();
    expect(statusText()).toBe("扣款失敗");

    // Second attempt succeeds asynchronously (scheduled retry / PSP callback).
    authority[orderA] = { status: "captured" };
    await flush(REVIEW_PAYMENT_SYNC_INTERVAL_MS);
    expect(statusText()).toBe("付款完成");
    expect(fetchMock).toHaveBeenCalledWith(
      recordUrl(orderA),
      expect.objectContaining({ cache: "no-store" }),
    );

    // Settled: no further authority polling.
    const calls = fetchMock.mock.calls.length;
    await flush(REVIEW_PAYMENT_SYNC_INTERVAL_MS * 3);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("re-reads the authority when the tab becomes visible again", async () => {
    authority[orderA] = { status: "failed" };
    renderComponent(<ReviewRideControls orderId={orderA} />);
    await flush();
    expect(statusText()).toBe("扣款失敗");
    authority[orderA] = { status: "captured" };
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(statusText()).toBe("付款完成");
  });

  it("keeps non-success states as-is and never fakes captured", async () => {
    for (const [status, label] of [
      ["authorized", "付款已授權，尚未扣款"],
      ["manual_recovery", "款項待客服處理"],
      ["refunded", "已退款"],
      ["mystery", "目前無法確認付款狀態"],
    ] as const) {
      authority[orderA] = { status };
      renderComponent(<ReviewRideControls orderId={orderA} />);
      await flush();
      expect(statusText()).toBe(label);
      await flush(REVIEW_PAYMENT_SYNC_INTERVAL_MS);
      expect(statusText()).toBe(label);
      cleanup();
    }
  });

  it("keeps the last authoritative message when a background read fails", async () => {
    authority[orderA] = { status: "failed" };
    renderComponent(<ReviewRideControls orderId={orderA} />);
    await flush();
    expect(statusText()).toBe("扣款失敗");
    fetchMock.mockResolvedValue(jsonResponse(null, false));
    await flush(REVIEW_PAYMENT_SYNC_INTERVAL_MS);
    expect(statusText()).toBe("扣款失敗");
  });

  it("does not carry order A's message onto order B, even from a late A read", async () => {
    authority[orderA] = { status: "failed" };
    const view = renderComponent(<ReviewRideControls orderId={orderA} />);
    await flush();
    expect(statusText()).toBe("扣款失敗");

    // Hold A's next read open, switch to B, then let A's read resolve.
    let releaseA: (() => void) | undefined;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === recordUrl(orderA)) {
        await new Promise<void>((resolve) => (releaseA = resolve));
        return jsonResponse({ ride: { payment: { status: "captured" } } });
      }
      if (url === recordUrl(orderB))
        return jsonResponse({ ride: { payment: null } });
      throw new Error(`unexpected fetch ${url}`);
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    view.rerender(<ReviewRideControls orderId={orderB} />);
    await flush();
    expect(statusText()).toBe("");
    releaseA?.();
    await flush();
    expect(statusText()).toBe("");
  });
});
