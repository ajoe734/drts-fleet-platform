// @vitest-environment jsdom
import { createRequire } from "node:module";
import { resolve } from "node:path";
import React, { useEffect, useState } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PassengerBookingSettingsResponse } from "@drts/contracts";
import type { PassengerBookingClient } from "@drts/passenger-client";
import type { AddressPayload } from "@drts/ui-web";
import {
  BookingForm,
  type BookingDraft,
} from "../../../apps/passenger-app-web/components/booking/booking-form";
import { PassengerMapConfigProvider } from "../../../apps/passenger-app-web/components/map/map-config-context";

type Point = { lat: number; lng: number };

// Only the Google script boundary is synthetic (see ride-map-card.test.tsx).
const loader = vi.hoisted(() => ({
  load: vi.fn(),
  failed: false,
  listeners: new Set<() => void>(),
}));
vi.mock(
  "../../../apps/passenger-app-web/lib/map/google-maps-loader",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../apps/passenger-app-web/lib/map/google-maps-loader")
      >();
    return {
      ...actual,
      loadGoogleMaps: (key: string) => loader.load(key),
      googleMapsAuthFailed: () => loader.failed,
      onGoogleMapsAuthFailure: (listener: () => void) => {
        loader.listeners.add(listener);
        return () => loader.listeners.delete(listener);
      },
    };
  },
);

const maps: FakeMap[] = [];
const markers: FakeMarker[] = [];
class FakeMap {
  click?: (event: { latLng: { lat(): number; lng(): number } }) => void;
  panned: Point[] = [];
  constructor(
    readonly element: HTMLElement,
    readonly options: Record<string, unknown>,
  ) {
    maps.push(this);
  }
  setCenter() {}
  setZoom() {}
  panTo(point: Point) {
    this.panned.push(point);
  }
  fitBounds() {}
  addListener(event: string, handler: never) {
    if (event === "click") this.click = handler;
  }
}
class FakeMarker {
  position: Point;
  visible: boolean;
  constructor(options: { position: Point; visible: boolean }) {
    this.position = options.position;
    this.visible = options.visible;
    markers.push(this);
  }
  setPosition(point: Point) {
    this.position = point;
  }
  setVisible(visible: boolean) {
    this.visible = visible;
  }
  setMap() {}
  addListener() {}
  getPosition() {
    return null;
  }
}
const fakeMaps = {
  Map: FakeMap,
  Marker: FakeMarker,
  LatLngBounds: class {},
  LatLng: class {},
  OverlayView: class {},
};

const appRequire = createRequire(
  resolve("apps/passenger-app-web/package.json"),
);
const { AppRouterContext } = appRequire(
  "next/dist/shared/lib/app-router-context.shared-runtime",
) as typeof import("next/dist/shared/lib/app-router-context.shared-runtime");
const router = {
  bfcacheId: "synthetic-booking-map-route",
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

const ORIGIN = {
  addressId: "map-origin",
  address: "新北市板橋區 板橋車站",
  lat: 25.0142,
  lng: 121.4636,
  coordinateSource: "provider_candidate",
  geocodeConfidence: "high",
} as AddressPayload;
const reverse = vi.fn(async () => {
  throw new Error("synthetic reverse outage");
});
const client = {
  search: vi.fn(async () => ({ candidates: [] })),
  resolve: vi.fn(),
  reverse,
} as unknown as PassengerBookingClient;
const settings = {
  minLeadTimeMinutes: 30,
  requireSmsVerification: false,
} as unknown as PassengerBookingSettingsResponse;

let latestDraft: BookingDraft;
function Harness() {
  const [draft, setDraft] = useState<BookingDraft>({
    origin: ORIGIN,
    destination: null,
    localTime: "",
  });
  useEffect(() => {
    latestDraft = draft;
  }, [draft]);
  return (
    <BookingForm
      client={client}
      settings={settings}
      draft={draft}
      onChange={setDraft}
      onQuote={() => undefined}
      busy={false}
    />
  );
}

async function mount(config: { enabled: boolean; browserKey: string | null }) {
  render(
    <AppRouterContext.Provider value={router}>
      <PassengerMapConfigProvider config={config}>
        <Harness />
      </PassengerMapConfigProvider>
    </AppRouterContext.Provider>,
  );
  await screen.findAllByPlaceholderText("請輸入街道、地點或地標");
  await act(async () => {});
}

const googleMaps = () =>
  ["booking-origin", "booking-destination"].map((id) =>
    document.getElementById(`${id}-interactive-map`),
  );
const grids = () =>
  screen.queryAllByRole("img", { name: "Location preview map" });

beforeEach(() => {
  loader.load.mockReset();
  loader.load.mockResolvedValue(fakeMaps);
  loader.failed = false;
  loader.listeners.clear();
  maps.length = 0;
  markers.length = 0;
  reverse.mockClear();
  window.localStorage.clear();
});
afterEach(() => cleanup());

describe("booking address pickers with the Google map slot", () => {
  it("keeps the shared picker's grid when the map is not offered", async () => {
    await mount({ enabled: false, browserKey: null });
    expect(loader.load).not.toHaveBeenCalled();
    expect(googleMaps()).toEqual([null, null]);
    expect(grids()).toHaveLength(2);
  });

  it("passes a Google map into both pickers' map slot", async () => {
    await mount({ enabled: true, browserKey: "test-browser-key" });
    expect(loader.load).toHaveBeenCalledWith("test-browser-key");
    const [origin, destination] = googleMaps();
    expect(origin?.getAttribute("role")).toBe("application");
    expect(destination?.getAttribute("role")).toBe("application");
    expect(grids()).toHaveLength(0);
    expect(maps.map((map) => map.element)).toEqual([origin, destination]);
    expect(maps[0]!.options).toMatchObject({
      center: { lat: 25.0142, lng: 121.4636 },
      gestureHandling: "cooperative",
    });
    // The chosen pickup is shown; the empty drop-off map waits for a point.
    expect(markers[0]!.visible).toBe(true);
    expect(markers[0]!.position).toEqual({ lat: 25.0142, lng: 121.4636 });
    expect(markers[1]!.visible).toBe(false);
    expect(destination!.getAttribute("aria-label")).toBe(
      "選擇地址後可在此調整位置。",
    );
    expect(screen.getByText("選擇地址後可在此調整位置。")).toBeTruthy();
  });

  it("hands a tapped point back to the picker, which updates the booking draft", async () => {
    await mount({ enabled: true, browserKey: "test-browser-key" });
    await act(async () => {
      maps[0]!.click!({
        latLng: { lat: () => 25.02, lng: () => 121.47 },
      });
    });
    expect(latestDraft.origin).toMatchObject({ lat: 25.02, lng: 121.47 });
    expect(reverse).toHaveBeenCalledWith(
      expect.objectContaining({ location: { lat: 25.02, lng: 121.47 } }),
    );
    expect(markers[0]!.position).toEqual({ lat: 25.02, lng: 121.47 });
    expect(maps[0]!.panned.at(-1)).toEqual({ lat: 25.02, lng: 121.47 });
  });

  it("returns to the grid when Google rejects the browser key", async () => {
    await mount({ enabled: true, browserKey: "test-browser-key" });
    expect(grids()).toHaveLength(0);
    await act(async () => {
      loader.failed = true;
      for (const listener of loader.listeners) listener();
    });
    expect(googleMaps()).toEqual([null, null]);
    expect(grids()).toHaveLength(2);
  });

  it("returns to the grid when the Maps script cannot load", async () => {
    loader.load.mockRejectedValue(new Error("GOOGLE_MAPS_SCRIPT_FAILED"));
    await mount({ enabled: true, browserKey: "test-browser-key" });
    expect(googleMaps()).toEqual([null, null]);
    expect(grids()).toHaveLength(2);
  });
});
