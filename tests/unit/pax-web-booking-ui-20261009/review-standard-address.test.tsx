// @vitest-environment jsdom
import { createRequire } from "node:module";
import { resolve } from "node:path";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BookingScreen } from "../../../apps/passenger-app-web/components/booking/booking-screen";
import { ReviewDemoProvider } from "../../../apps/passenger-app-web/components/review-demo/review-context";
import { bookingFixture, selection } from "./fixture";

const appRequire = createRequire(
  resolve("apps/passenger-app-web/package.json"),
);
const { AppRouterContext } = appRequire(
  "next/dist/shared/lib/app-router-context.shared-runtime",
) as typeof import("next/dist/shared/lib/app-router-context.shared-runtime");
const { PathnameContext } = appRequire(
  "next/dist/shared/lib/hooks-client-context.shared-runtime",
) as typeof import("next/dist/shared/lib/hooks-client-context.shared-runtime");
const router = {
  bfcacheId: "synthetic-booking-test-route",
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};
let fixture: ReturnType<typeof bookingFixture>;
let originalGeo: PropertyDescriptor | undefined;
let success: PositionCallback;
let failure: PositionErrorCallback | null | undefined;
let getCurrentPosition: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.localStorage.clear();
  fixture = bookingFixture();
  const originalFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (url: string | URL, init?: RequestInit) => {
    if (
      new URL(String(url), "https://ride.example.test").pathname ===
      "/api/passenger-app/review-demo/config"
    )
      return Promise.resolve(Response.json({ data: { enabled: true } }));
    return originalFetch(url, init);
  });
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
  render(
    <AppRouterContext.Provider value={router}>
      <PathnameContext.Provider value="/">
        <ReviewDemoProvider>
          <BookingScreen paymentSelection={selection} />
        </ReviewDemoProvider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>,
  );
  await screen.findByLabelText("演練選址方式");
}
function changeMode(value: "fixed" | "standard") {
  fireEvent.change(screen.getByLabelText("演練選址方式"), {
    target: { value },
  });
}
function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}
async function selectDestination(query = "下車") {
  const input = screen.getAllByPlaceholderText("請輸入街道、地點或地標")[1]!;
  const picker = input.closest("[data-address-map-picker]") as HTMLElement;
  fireEvent.change(input, { target: { value: query } });
  fireEvent.click(within(picker).getByRole("button", { name: "搜尋" }));
  fireEvent.click(await within(picker).findByRole("button", { name: /下車/ }));
  await within(picker).findByRole("button", { name: "清除選點" });
}

it("clears a controlled destination before showing replacement search results and requoting", async () => {
  await open();
  changeMode("standard");
  click("使用目前位置");
  await act(async () =>
    success({
      coords: { latitude: 25.0142, longitude: 121.4636, accuracy: 8 },
      timestamp: Date.now(),
    } as GeolocationPosition),
  );
  await screen.findAllByText("台北市圖釘測試位置");
  await selectDestination();
  fireEvent.change(screen.getByLabelText("預約時間"), {
    target: { value: "2099-10-11T12:00" },
  });
  const input = screen.getAllByPlaceholderText("請輸入街道、地點或地標")[1]!;
  const picker = input.closest("[data-address-map-picker]") as HTMLElement;
  fireEvent.click(within(picker).getByRole("button", { name: "清除選點" }));
  expect(within(picker).queryByRole("button", { name: "清除選點" })).toBeNull();
  expect(
    (screen.getByRole("button", { name: "試算車資" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    fixture.calls.some(
      (c) => c.path.endsWith("/quotes") || c.path.endsWith("/rides"),
    ),
  ).toBe(false);
  await selectDestination("新的下車");
  await within(picker).findByText("台北市新的下車測試路1號");
  click("試算車資");
  await screen.findByLabelText("我已確認費用與優惠說明");
  expect(fixture.calls.filter((c) => c.path.endsWith("/quotes"))).toHaveLength(
    1,
  );
  expect(fixture.calls.some((c) => c.path.endsWith("/rides"))).toBe(false);
});

it("keeps fixed points as the review default and clears both selected addresses when changing mode", async () => {
  await open();
  expect(
    (screen.getByLabelText("演練選址方式") as HTMLSelectElement).value,
  ).toBe("fixed");
  fireEvent.change(screen.getByLabelText("示範上車地點"), {
    target: { value: "review-banqiao" },
  });
  fireEvent.change(screen.getByLabelText("示範下車地點"), {
    target: { value: "review-city-hall" },
  });
  expect(
    (screen.getByRole("button", { name: "試算車資" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  changeMode("standard");
  expect(screen.queryByLabelText("示範上車地點")).toBeNull();
  expect(screen.getAllByPlaceholderText("請輸入街道、地點或地標")).toHaveLength(
    2,
  );
  expect(
    (screen.getByRole("button", { name: "試算車資" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(getCurrentPosition).not.toHaveBeenCalled();
  changeMode("fixed");
  expect(
    (screen.getByLabelText("示範上車地點") as HTMLSelectElement).value,
  ).toBe("");
  expect(
    (screen.getByLabelText("示範下車地點") as HTMLSelectElement).value,
  ).toBe("");
  expect(
    fixture.calls.some(
      (c) => c.path.endsWith("/quotes") || c.path.endsWith("/rides"),
    ),
  ).toBe(false);
});

it("handles a browser denial in review standard mode, then uses the original reverse/quote path and preserves mode after modifying confirmation", async () => {
  await open();
  changeMode("standard");
  click("使用目前位置");
  act(() => failure?.({ code: 1 } as GeolocationPositionError));
  await screen.findByText("未允許使用目前位置，您仍可搜尋或手動選擇上車地點。");
  expect(
    fixture.calls.filter((c) => c.path.endsWith("/geo/reverse")),
  ).toHaveLength(0);
  click("使用目前位置");
  await act(async () =>
    success({
      coords: { latitude: 25.0142, longitude: 121.4636, accuracy: 8 },
      timestamp: Date.now(),
    } as GeolocationPosition),
  );
  await screen.findAllByText("台北市圖釘測試位置");
  await selectDestination();
  fireEvent.change(screen.getByLabelText("預約時間"), {
    target: { value: "2099-10-11T12:00" },
  });
  click("試算車資");
  await screen.findByLabelText("我已確認費用與優惠說明");
  expect(
    fixture.calls.find((c) => c.path.endsWith("/geo/reverse"))?.body,
  ).toMatchObject({
    location: { lat: 25.0142, lng: 121.4636 },
    surface: "passenger_entry",
  });
  expect(
    fixture.calls.find((c) => c.path.endsWith("/quotes"))?.body,
  ).toMatchObject({ originLat: 25.0142, originLng: 121.4636 });
  click("返回修改");
  expect(
    ((await screen.findByLabelText("演練選址方式")) as HTMLSelectElement).value,
  ).toBe("standard");
  expect(screen.getByRole("button", { name: "使用目前位置" })).toBeTruthy();
  expect(screen.getAllByText("台北市圖釘測試位置")).toBeTruthy();
  changeMode("fixed");
  expect(
    (screen.getByLabelText("示範上車地點") as HTMLSelectElement).value,
  ).toBe("");
  expect(
    (screen.getByRole("button", { name: "試算車資" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(fixture.calls.some((c) => c.path.endsWith("/rides"))).toBe(false);
});
