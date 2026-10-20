// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { BookingScreen } from "../../../apps/passenger-app-web/components/booking/booking-screen";
import { BOOKING_RECOVERY_KEY } from "../../../apps/passenger-app-web/components/booking/booking-draft-recovery";
import {
  bookingFixture,
  selection,
} from "../pax-web-booking-ui-20261009/fixture";

const appRequire = createRequire(
  resolve("apps/passenger-app-web/package.json"),
);
const { AppRouterContext } = appRequire(
  "next/dist/shared/lib/app-router-context.shared-runtime",
) as typeof import("next/dist/shared/lib/app-router-context.shared-runtime");
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function mountLostAckScreen() {
  const fixture = bookingFixture();
  const push = vi.fn();
  const router = {
    push,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  };
  const component = () => (
    <AppRouterContext.Provider value={router}>
      <BookingScreen paymentSelection={selection} />
    </AppRouterContext.Provider>
  );
  const first = render(component());
  await screen.findByLabelText("預約時間");
  for (const [index, name] of ["上車", "下車"].entries()) {
    const input =
      screen.getAllByPlaceholderText("請輸入街道、地點或地標")[index]!;
    const picker = input.closest("[data-address-map-picker]") as HTMLElement;
    fireEvent.change(input, { target: { value: name } });
    fireEvent.click(within(picker).getByRole("button", { name: "搜尋" }));
    fireEvent.click(
      await within(picker).findByRole("button", { name: new RegExp(name) }),
    );
    await waitFor(() =>
      expect(
        within(picker).getByRole("button", { name: "清除選點" }),
      ).toBeTruthy(),
    );
  }
  fireEvent.change(screen.getByLabelText("預約時間"), {
    target: { value: "2099-10-11T12:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "試算車資" }));
  fireEvent.click(await screen.findByLabelText("我已確認費用與優惠說明"));
  fixture.createResponder = async () => {
    throw new TypeError("synthetic lost HTTP acknowledgement");
  };
  fireEvent.click(
    screen.getByRole("button", { name: "確認叫車", exact: true }),
  );
  await screen.findByRole("button", { name: "重試同一筆叫車請求" });
  const original = fixture.calls.find((call) => call.path.endsWith("/rides"))!;
  expect(original.headers.get("x-request-id")).toBeTruthy();
  return { fixture, push, first, component, original };
}

it("the actual BookingScreen replays the immutable command/key after lost HTTP acknowledgement and unmount", async () => {
  const { fixture, push, first, component, original } =
    await mountLostAckScreen();
  first.unmount();
  fixture.createResponder = undefined;
  render(component());
  fireEvent.click(
    await screen.findByRole("button", { name: "重試同一筆叫車請求" }),
  );
  await waitFor(() => expect(push).toHaveBeenCalled());
  const sends = fixture.calls.filter((call) => call.path.endsWith("/rides"));
  expect(sends).toHaveLength(2);
  expect(sends[1]!.body).toEqual(original.body);
  expect(sends[1]!.headers.get("x-request-id")).toBe(
    original.headers.get("x-request-id"),
  );
  expect(sessionStorage.getItem(BOOKING_RECOVERY_KEY)).toBeNull();
  expect(push).toHaveBeenCalledWith("/ride?rideId=synthetic-owned-order");
});

it.each(["same", "different"])(
  "an expired session preserves an unknown ACK only for the %s reauthenticated account",
  async (identity) => {
    const { fixture, push, first, component, original } =
      await mountLostAckScreen();
    const saved = sessionStorage.getItem(BOOKING_RECOVERY_KEY);
    expect(saved).toContain(original.headers.get("x-request-id"));
    fixture.errors.set("GET /api/passenger-app/me", {
      status: 401,
      code: "UNAUTHORIZED",
    });
    fireEvent.click(screen.getByRole("button", { name: "重試同一筆叫車請求" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
    expect(sessionStorage.getItem(BOOKING_RECOVERY_KEY)).toBe(saved);
    expect(
      screen.queryByRole("button", { name: "重試同一筆叫車請求" }),
    ).toBeNull();
    first.unmount();
    fixture.errors.clear();
    fixture.createResponder = undefined;
    if (identity === "different")
      fixture.account.drtsPassengerId = "different-real-account";
    render(component());
    if (identity === "same") {
      fireEvent.click(
        await screen.findByRole("button", { name: "重試同一筆叫車請求" }),
      );
      await waitFor(() =>
        expect(push).toHaveBeenCalledWith("/ride?rideId=synthetic-owned-order"),
      );
      const sends = fixture.calls.filter((call) =>
        call.path.endsWith("/rides"),
      );
      expect(sends).toHaveLength(2);
      expect(sends[1]!.body).toEqual(original.body);
      expect(sends[1]!.headers.get("x-request-id")).toBe(
        original.headers.get("x-request-id"),
      );
      expect(sessionStorage.getItem(BOOKING_RECOVERY_KEY)).toBeNull();
    } else {
      await screen.findByLabelText("預約時間");
      expect(
        screen.queryByRole("button", { name: "重試同一筆叫車請求" }),
      ).toBeNull();
      expect(
        fixture.calls.filter((call) => call.path.endsWith("/rides")),
      ).toHaveLength(1);
      expect(sessionStorage.getItem(BOOKING_RECOVERY_KEY)).not.toContain(
        original.headers.get("x-request-id"),
      );
    }
  },
);
