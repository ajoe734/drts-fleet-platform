// @vitest-environment jsdom
import { createRequire } from "node:module";
import { resolve } from "node:path";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  AddressMapPickerChange,
  AddressMapPickerProps,
} from "../../../packages/ui-web/src/address-map-picker";
import { BookingScreen } from "../../../apps/passenger-app-web/components/booking/booking-screen";
import { ReviewDemoProvider } from "../../../apps/passenger-app-web/components/review-demo/review-context";
import { bookingFixture, selection } from "./fixture";

// Deliver two independently completed picker operations in one React batch.
// The real screen, form, client and BFF remain mounted; only picker timing is
// controlled here. Hosted browser acceptance still uses the actual pickers.
const pickers = vi.hoisted(
  () => new Map<string, (change: AddressMapPickerChange) => void>(),
);
vi.mock("@drts/ui-web", async (importActual) => ({
  ...(await importActual<typeof import("@drts/ui-web")>()),
  AddressMapPicker: ({
    id,
    value,
    onChange,
  }: Pick<AddressMapPickerProps, "id" | "value" | "onChange">) => {
    if (id && onChange) pickers.set(id, onChange);
    return <p data-testid={id}>{value?.address ?? "尚未選點"}</p>;
  },
}));

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

beforeEach(() => {
  window.localStorage.clear();
  pickers.clear();
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
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("keeps both picker results and an overlapping time edit for the actual quote", async () => {
  render(
    <AppRouterContext.Provider value={router}>
      <PathnameContext.Provider value="/">
        <ReviewDemoProvider>
          <BookingScreen paymentSelection={selection} />
        </ReviewDemoProvider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>,
  );
  fireEvent.change(await screen.findByLabelText("演練選址方式"), {
    target: { value: "standard" },
  });
  const origin = pickers.get("booking-origin")!;
  const destination = pickers.get("booking-destination")!;
  const change = (
    address: string,
    lat: number,
    lng: number,
  ): AddressMapPickerChange => ({
    status: "selected",
    address: { address, lat, lng, coordinateSource: "provider_candidate" },
    dispatchReady: true,
    serviceability: null,
    providerState: {
      available: true,
      degraded: false,
      reasonCode: "available",
    },
  });
  act(() => {
    origin(change("同時完成的上車點", 25.0142, 121.4636));
    destination(change("同時完成的下車點", 25.0478, 121.5171));
    fireEvent.change(screen.getByLabelText("預約時間"), {
      target: { value: "2099-10-11T12:00" },
    });
  });
  expect(screen.getByTestId("booking-origin").textContent).toBe(
    "同時完成的上車點",
  );
  expect(screen.getByTestId("booking-destination").textContent).toBe(
    "同時完成的下車點",
  );
  expect((screen.getByLabelText("預約時間") as HTMLInputElement).value).toBe(
    "2099-10-11T12:00",
  );
  const quote = screen.getByRole("button", { name: "試算車資" });
  expect((quote as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(quote);
  await screen.findByLabelText("我已確認費用與優惠說明");
  expect(
    fixture.calls.find((c) => c.path.endsWith("/quotes"))?.body,
  ).toMatchObject({
    originLat: 25.0142,
    originLng: 121.4636,
    destinationLat: 25.0478,
    destinationLng: 121.5171,
  });
});
