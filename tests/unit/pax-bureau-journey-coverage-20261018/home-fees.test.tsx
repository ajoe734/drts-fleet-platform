/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { PaymentBookingHome } from "../../../apps/passenger-app-web/components/payment/payment-booking-home";
import { bookingFixture } from "../pax-web-booking-ui-20261009/fixture";
import { apiWireResponse } from "../pax-web-shell-20261009/api-wire-fixtures";
const appRequire = createRequire(
  resolve("apps/passenger-app-web/package.json"),
);
const { AppRouterContext } = appRequire(
  "next/dist/shared/lib/app-router-context.shared-runtime",
) as typeof import("next/dist/shared/lib/app-router-context.shared-runtime");
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});
function mount() {
  const router = {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  };
  render(
    <AppRouterContext.Provider value={router}>
      <PaymentBookingHome />
    </AppRouterContext.Provider>,
  );
  return router;
}
function link() {
  expect(
    screen
      .getByRole("link", { name: "查看完整費用與優惠說明", exact: true })
      .getAttribute("href"),
  ).toBe("/fares");
}
it.each(["loading", "unauthorized", "ready", "payment_failure"] as const)(
  "the fixed fees link remains usable in the real %s home",
  async (state) => {
    const f = bookingFixture();
    const original = globalThis.fetch;
    if (state === "unauthorized")
      f.errors.set("GET /api/passenger-app/me", {
        status: 401,
        code: "UNAUTHORIZED",
      });
    vi.stubGlobal(
      "fetch",
      async (url: string | URL | Request, init?: RequestInit) => {
        if (state === "loading" && String(url).endsWith("/me"))
          return new Promise<Response>(() => {});
        if (String(url).endsWith("/payment-methods")) {
          if (state === "payment_failure")
            throw new TypeError("external HTTP failed");
          return apiWireResponse({ methods: [] });
        }
        return original(url, init);
      },
    );
    const router = mount();
    link();
    if (state === "ready" || state === "payment_failure")
      await screen.findByLabelText("預約時間");
    if (state === "unauthorized")
      await waitFor(() => expect(router.push).toHaveBeenCalledWith("/login"));
    link();
    expect(
      f.calls.some(
        (call) => call.method === "POST" && call.path.endsWith("/rides"),
      ),
    ).toBe(false);
  },
);
it("the ordinary link does not acknowledge a new fare version or bypass the real first-use gate", async () => {
  const f = bookingFixture();
  f.account.feeAcknowledgementVersion = undefined;
  const original = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    async (url: string | URL | Request, init?: RequestInit) =>
      String(url).endsWith("/payment-methods")
        ? apiWireResponse({ methods: [] })
        : original(url, init),
  );
  mount();
  link();
  const acknowledge = await screen.findByRole("button", {
    name: "我已閱讀並同意",
  });
  expect(screen.queryByLabelText("預約時間")).toBeNull();
  expect(f.calls.some((call) => call.method === "PATCH")).toBe(false);
  fireEvent.click(acknowledge);
  await screen.findByLabelText("預約時間");
  link();
  expect(f.calls.find((call) => call.method === "PATCH")?.body).toMatchObject({
    feeAcknowledgementVersion: f.fare.version,
  });
});
