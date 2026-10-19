// @vitest-environment jsdom
import { createRequire } from "node:module";
import { resolve } from "node:path";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLayoutEffect, useRef } from "react";
import { BookingScreen } from "../../../apps/passenger-app-web/components/booking/booking-screen";
import { CurrentLocationButton } from "../../../apps/passenger-app-web/components/booking/current-location-button";
import { bookingFixture, selection } from "./fixture";

const appRequire = createRequire(
  resolve("apps/passenger-app-web/package.json"),
);
const { AppRouterContext } = appRequire(
  "next/dist/shared/lib/app-router-context.shared-runtime",
) as typeof import("next/dist/shared/lib/app-router-context.shared-runtime");
const push = vi.fn();
const router = {
  bfcacheId: "synthetic-booking-test-route",
  push,
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};
const position = {
  coords: { latitude: 25.01255, longitude: 121.46495, accuracy: 8 },
  timestamp: Date.now(),
} as GeolocationPosition;
let f: ReturnType<typeof bookingFixture>;
let success: PositionCallback;
let failure: PositionErrorCallback | null | undefined;
let getCurrentPosition: ReturnType<typeof vi.fn>;
let originalGeo: PropertyDescriptor | undefined;

beforeEach(() => {
  push.mockClear();
  window.localStorage.clear();
  f = bookingFixture();
  originalGeo = Object.getOwnPropertyDescriptor(navigator, "geolocation");
  getCurrentPosition = vi.fn((ok, error) => {
    success = ok;
    failure = error;
  });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
});
afterEach(() => {
  cleanup();
  if (originalGeo) Object.defineProperty(navigator, "geolocation", originalGeo);
  else Reflect.deleteProperty(navigator, "geolocation");
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function open() {
  const result = render(
    <AppRouterContext.Provider value={router}>
      <BookingScreen paymentSelection={selection} />
    </AppRouterContext.Provider>,
  );
  await screen.findByLabelText("預約時間");
  return result;
}
function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}
async function selectAddress(index: number, name: string) {
  const input =
    screen.getAllByPlaceholderText("請輸入街道、地點或地標")[index]!;
  const picker = input.closest("[data-address-map-picker]") as HTMLElement;
  fireEvent.change(input, { target: { value: name } });
  fireEvent.click(within(picker).getByRole("button", { name: "搜尋" }));
  fireEvent.click(
    await within(picker).findByRole("button", { name: new RegExp(name) }),
  );
  await within(picker).findByRole("button", { name: "清除選點" });
}
const reverseCalls = () =>
  f.calls.filter((c) => c.path.endsWith("/geo/reverse"));

describe("passenger current location through the real BookingScreen, client and BFF", () => {
  it("keeps the first request active when clicked before initial passive effects", async () => {
    const reverse = vi.fn();
    function FirstPaintClick() {
      const container = useRef<HTMLDivElement>(null);
      useLayoutEffect(() => {
        container.current!.querySelector("button")!.click();
      }, []);
      return (
        <div ref={container}>
          <CurrentLocationButton
            value={null}
            disabled={false}
            reverse={reverse}
            onSelect={vi.fn()}
          />
        </div>
      );
    }
    render(<FirstPaintClick />);
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    act(() => failure?.({ code: 1 } as GeolocationPositionError));
    expect(
      (
        await screen.findByText(
          "未允許使用目前位置，您仍可搜尋或手動選擇上車地點。",
        )
      ).getAttribute("role"),
    ).toBe("alert");
    expect(reverse).not.toHaveBeenCalled();
  });

  it("requests only on click, reverses real device coordinates, then quotes and books the selected pickup", async () => {
    await open();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    click("使用目前位置");
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(
      screen
        .getByRole("button", { name: "正在取得目前位置…" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await act(async () => success(position));
    await screen.findAllByText("台北市圖釘測試位置");
    expect(reverseCalls()[0]?.body).toMatchObject({
      location: { lat: 25.01255, lng: 121.46495 },
      surface: "passenger_entry",
    });
    await selectAddress(1, "下車");
    fireEvent.change(screen.getByLabelText("預約時間"), {
      target: { value: "2099-10-11T12:00" },
    });
    click("試算車資");
    await screen.findByLabelText("我已確認費用與優惠說明");
    expect(f.calls.find((c) => c.path.endsWith("/quotes"))?.body).toMatchObject(
      { originLat: 25.01255, originLng: 121.46495 },
    );
    fireEvent.click(screen.getByLabelText("我已確認費用與優惠說明"));
    click("確認叫車");
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/ride?rideId=synthetic-owned-order"),
    );
    expect(f.calls.find((c) => c.path.endsWith("/rides"))?.body).toMatchObject({
      origin: { lat: 25.01255, lng: 121.46495, address: "台北市圖釘測試位置" },
      paymentMethodId: selection.paymentMethodId,
    });
  });

  it.each([
    [1, "未允許使用目前位置，您仍可搜尋或手動選擇上車地點。"],
    [2, "目前無法取得位置，請重試或搜尋上車地點。"],
    [3, "取得位置逾時，請重試或搜尋上車地點。"],
  ])(
    "keeps the chosen pickup after browser error %s and allows a retry",
    async (code, message) => {
      await open();
      await selectAddress(0, "原上車");
      click("使用目前位置");
      act(() => failure?.({ code } as GeolocationPositionError));
      expect((await screen.findByText(message)).getAttribute("role")).toBe(
        "alert",
      );
      expect(screen.getAllByText("台北市原上車測試路1號")).toBeTruthy();
      expect(reverseCalls()).toHaveLength(0);
      click("使用目前位置");
      await act(async () => success(position));
      await screen.findAllByText("台北市圖釘測試位置");
      expect(screen.queryByText(message)).toBeNull();
    },
  );

  it("keeps manual address selection usable when this browser has no geolocation", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: undefined,
    });
    await open();
    click("使用目前位置");
    expect(
      (
        await screen.findByText(
          "此瀏覽器無法取得目前位置，請搜尋或手動選擇上車地點。",
        )
      ).getAttribute("role"),
    ).toBe("alert");
    await selectAddress(0, "手選上車");
    expect(screen.getAllByText("台北市手選上車測試路1號")).toBeTruthy();
    expect(reverseCalls()).toHaveLength(0);
  });

  it.each([NaN, 91])(
    "does not send invalid latitude %s to the address provider",
    async (latitude) => {
      await open();
      click("使用目前位置");
      await act(async () =>
        success({ ...position, coords: { ...position.coords, latitude } }),
      );
      expect(
        (
          await screen.findByText("目前無法取得位置，請重試或搜尋上車地點。")
        ).getAttribute("role"),
      ).toBe("alert");
      expect(reverseCalls()).toHaveLength(0);
    },
  );

  it("keeps the chosen address on reverse-provider failure and retries the genuine path", async () => {
    await open();
    await selectAddress(0, "原上車");
    f.errors.set("POST /api/geo/reverse", {
      status: 503,
      code: "provider_unavailable",
    });
    click("使用目前位置");
    await act(async () => success(position));
    expect(
      (
        await screen.findByText(
          "無法解析目前位置的地址，請重試或搜尋上車地點。",
        )
      ).getAttribute("role"),
    ).toBe("alert");
    expect(screen.getAllByText("台北市原上車測試路1號")).toBeTruthy();
    f.errors.clear();
    click("使用目前位置");
    await act(async () => success(position));
    await screen.findAllByText("台北市圖釘測試位置");
    expect(reverseCalls()).toHaveLength(2);
  });

  it("retains the existing login redirect when the reverse operation loses its session", async () => {
    await open();
    f.errors.set("POST /api/geo/reverse", {
      status: 401,
      code: "unauthenticated",
    });
    click("使用目前位置");
    await act(async () => success(position));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
    expect(f.calls.filter((c) => c.path.endsWith("/quotes"))).toHaveLength(0);
  });

  it("ignores a late GPS callback after the passenger manually replaces the pickup", async () => {
    await open();
    click("使用目前位置");
    await selectAddress(0, "最後選擇");
    await act(async () => success(position));
    expect(screen.getAllByText("台北市最後選擇測試路1號")).toBeTruthy();
    expect(reverseCalls()).toHaveLength(0);
  });

  it("preserves destination and time edits made while the GPS request is pending", async () => {
    await open();
    click("使用目前位置");
    await selectAddress(1, "新下車");
    fireEvent.change(screen.getByLabelText("預約時間"), {
      target: { value: "2099-10-11T13:30" },
    });
    await act(async () => success(position));
    await screen.findAllByText("台北市圖釘測試位置");
    expect(screen.getAllByText("台北市新下車測試路1號")).toBeTruthy();
    expect((screen.getByLabelText("預約時間") as HTMLInputElement).value).toBe(
      "2099-10-11T13:30",
    );
  });

  it("does not resolve a device location after leaving the booking form", async () => {
    const view = await open();
    click("使用目前位置");
    view.unmount();
    await act(async () => success(position));
    expect(reverseCalls()).toHaveLength(0);
  });

  it("ignores a late reverse response after a manual pickup selection", async () => {
    const originalFetch = globalThis.fetch;
    let release!: () => void;
    let started = false;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
      const target = new URL(String(url), "https://ride.example.test");
      if (
        target.origin === "https://api.example.test" &&
        target.pathname === "/api/geo/reverse"
      ) {
        started = true;
        await held;
      }
      return originalFetch(url, init);
    });
    await open();
    click("使用目前位置");
    await act(async () => success(position));
    await waitFor(() => expect(started).toBe(true));
    await selectAddress(0, "手選優先");
    await act(async () => release());
    await waitFor(() => expect(reverseCalls()).toHaveLength(1));
    expect(
      screen.getAllByText("台北市手選優先測試路1號").length,
    ).toBeGreaterThan(0);
    expect(screen.queryAllByText("台北市圖釘測試位置")).toHaveLength(0);
  });

  it("does not select an unusable reverse-provider response or silently quote it", async () => {
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
      const response = await originalFetch(url, init);
      const target = new URL(String(url), "https://ride.example.test");
      if (
        target.origin === "https://api.example.test" &&
        target.pathname === "/api/geo/reverse"
      ) {
        const payload = await response.json();
        payload.data.address.lat = null;
        return Response.json(payload);
      }
      return response;
    });
    await open();
    click("使用目前位置");
    await act(async () => success(position));
    expect(
      (
        await screen.findByText(
          "無法解析目前位置的地址，請重試或搜尋上車地點。",
        )
      ).getAttribute("role"),
    ).toBe("alert");
    expect(
      screen.getByRole("button", { name: "試算車資" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(f.calls.filter((c) => c.path.endsWith("/quotes"))).toHaveLength(0);
  });
});
