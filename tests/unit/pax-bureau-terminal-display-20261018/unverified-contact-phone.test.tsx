// @vitest-environment jsdom
import {
  render as renderComponent,
  screen,
  cleanup,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { ReactElement } from "react";
import { BookingScreen } from "../../../apps/passenger-app-web/components/booking/booking-screen";
import { bookingFixture } from "../pax-web-booking-ui-20261009/fixture";

// Actual public source entries, not mocked implementations or a global alias.
vi.mock(
  "@drts/passenger-client",
  async () => import("../../../packages/passenger-client/src/index"),
);
vi.mock(
  "@drts/ui-web",
  async () => import("../../../packages/ui-web/src/index"),
);
const appRequire = createRequire(
  resolve("apps/passenger-app-web/package.json"),
);
const { AppRouterContext } = appRequire(
  "next/dist/shared/lib/app-router-context.shared-runtime",
) as typeof import("next/dist/shared/lib/app-router-context.shared-runtime");
const router = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};
const render = (element: ReactElement) =>
  renderComponent(
    <AppRouterContext.Provider value={router}>
      {element}
    </AppRouterContext.Provider>,
  );
let f: ReturnType<typeof bookingFixture>;
beforeEach(() => {
  f = bookingFixture();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function form() {
  await screen.findByLabelText("預約時間");
}

describe("real contact-phone verification prompt distinguishes login OTP from contact OTP", () => {
  it("states the contact phone is unverified without duplicating the fact", async () => {
    render(<BookingScreen />);
    await form();
    const notice = await screen.findByText(/聯絡手機尚未驗證/);
    expect(notice.textContent).not.toMatch(/未驗證.*未驗證/);
    expect(notice.textContent).not.toContain("（未驗證）");
  });

  it("points the driver to account management to clear the real gap, not a fabricated one", async () => {
    render(<BookingScreen />);
    await form();
    await screen.findByText(/聯絡手機尚未驗證/);
    const link = screen.getByRole("link", { name: "前往帳號管理" });
    expect(link.getAttribute("href")).toBe("/account");
  });

  it("does not show the unverified-contact notice once the real account record is contact-verified", async () => {
    f.account = { ...f.account, contactPhoneVerified: true };
    render(<BookingScreen />);
    await form();
    expect(screen.queryByText(/聯絡手機尚未驗證/)).toBeNull();
    expect(screen.queryByRole("link", { name: "前往帳號管理" })).toBeNull();
  });

  it("a login-verified phone (verifiedPhone) does not stand in for contact-phone verification", async () => {
    f.account = {
      ...f.account,
      verifiedPhone: f.account.contactPhone,
      contactPhoneVerified: false,
    };
    render(<BookingScreen />);
    await form();
    await screen.findByText(/聯絡手機尚未驗證/);
  });
});
