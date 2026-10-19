// @vitest-environment jsdom
import { Suspense } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ReviewRecordPage from "../../../apps/passenger-app-web/app/review/records/[id]/page";
import { ReviewDemoProvider } from "../../../apps/passenger-app-web/components/review-demo/review-context";
import { t } from "../../../apps/passenger-app-web/components/review-demo/translations";

vi.mock("../../../apps/passenger-app-web/node_modules/next/navigation", () => ({
  usePathname: () => "/review/records/11111111-1111-4111-8111-111111111111",
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

it("the actual record page invokes live HTTP with a valid platform receiver and renders the returned record", async () => {
  const orderId = "11111111-1111-4111-8111-111111111111";
  const rejectedReceivers: string[] = [];
  // Only the platform/HTTP boundary is simulated. This tests the real page
  // and SDK invocation, not record ownership, SQL or browser execution.
  const transport = vi.fn(async function (
    this: unknown,
    url: string,
  ): Promise<Response> {
    if (this != null && this !== globalThis && this !== window) {
      rejectedReceivers.push(url);
      throw new TypeError("Illegal invocation");
    }
    if (url === "/api/passenger-app/review-demo/config")
      return Response.json({ data: { enabled: true } });
    expect(url).toBe(`/api/passenger-app/review-demo/rides/${orderId}/record`);
    return Response.json({
      data: {
        notice: "HTTP fixture: simulated record",
        ride: {
          order: {
            order_id: orderId,
            status: "cancelled",
            pickup: { address: "新北示範起點" },
            dropoff: { address: "新北示範終點" },
          },
        },
        trip: null,
        charge: null,
      },
    });
  });
  vi.stubGlobal("fetch", transport);
  await act(async () => {
    render(
      <ReviewDemoProvider>
        <Suspense>
          <ReviewRecordPage params={Promise.resolve({ id: orderId })} />
        </Suspense>
      </ReviewDemoProvider>,
    );
  });
  await waitFor(() =>
    expect(
      screen.queryByText("HTTP fixture: simulated record") ||
        screen.queryByText(t.recordFailed),
    ).toBeTruthy(),
  );
  expect(rejectedReceivers).toEqual([]);
  expect(screen.getByText("HTTP fixture: simulated record")).toBeTruthy();
  expect(screen.getByText(/新北示範起點 → 新北示範終點/)).toBeTruthy();
  expect(screen.getByRole("button", { name: t.downloadHtml })).toBeTruthy();
  expect(window.localStorage.length).toBe(0);
});
