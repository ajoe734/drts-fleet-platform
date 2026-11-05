/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PassengerRideAuthorityView } from "@drts/contracts";
import { RideContent } from "../../../apps/passenger-app-web/components/ride/passenger-ride-page";
import { PassengerMapConfigProvider } from "../../../apps/passenger-app-web/components/map/map-config-context";
import { mapPassengerRideAuthorityToFixture } from "../../../apps/passenger-app-web/lib/ride/passenger-live";
import { authority, tracking } from "../pax-live-tracking-20261017/fixture";

type Point = { lat: number; lng: number };

// Only the Google script boundary is synthetic: loadGoogleMaps and the key's
// authorization-failure signal. The HTML markers drawn on the map are real.
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

const calls = {
  maps: [] as { element: HTMLElement; options: Record<string, unknown> }[],
  fitBounds: [] as Point[][],
  panTo: [] as Point[],
};

class FakeMap {
  overlayLayer = document.createElement("div");
  constructor(element: HTMLElement, options: Record<string, unknown>) {
    element.appendChild(this.overlayLayer);
    calls.maps.push({ element, options });
  }
  setCenter() {}
  setZoom() {}
  panTo(point: Point) {
    calls.panTo.push(point);
  }
  fitBounds(bounds: FakeBounds) {
    calls.fitBounds.push(bounds.points);
  }
  addListener() {}
}
class FakeBounds {
  points: Point[] = [];
  extend(point: Point) {
    this.points.push(point);
  }
}
class FakeLatLng {
  constructor(
    readonly lat: number,
    readonly lng: number,
  ) {}
}
/** Like google.maps.OverlayView: onAdd + draw once attached to a map. */
class FakeOverlayView {
  private map: FakeMap | null = null;
  setMap(map: FakeMap | null) {
    const self = this as unknown as {
      onAdd?: () => void;
      draw?: () => void;
      onRemove?: () => void;
    };
    if (map && !this.map) {
      this.map = map;
      self.onAdd?.();
      self.draw?.();
    } else if (!map && this.map) {
      this.map = null;
      self.onRemove?.();
    }
  }
  getPanes() {
    return this.map ? { overlayLayer: this.map.overlayLayer } : null;
  }
  getProjection() {
    return this.map
      ? {
          fromLatLngToDivPixel: (point: FakeLatLng) => ({
            x: Math.round((point.lng - 121) * 1000),
            y: Math.round((25.2 - point.lat) * 1000),
          }),
        }
      : null;
  }
}
const fakeMaps = {
  Map: FakeMap,
  Marker: class {},
  LatLngBounds: FakeBounds,
  LatLng: FakeLatLng,
  OverlayView: FakeOverlayView,
};

const ENABLED = { enabled: true, browserKey: "test-browser-key" };
const PICKUP = { lat: 25, lng: 121 };
const DROPOFF = { lat: 25.1, lng: 121.1 };

function view(
  status: PassengerRideAuthorityView["order"]["status"] = "assigned",
  location: Point | null = { lat: 25.03, lng: 121.02 },
) {
  const next = Object.assign(authority(status), { tracking: tracking() });
  if (location) Object.assign(next.tracking.location, location);
  else
    Object.assign(next.tracking, {
      location: null,
      locationFreshness: "missing",
      pickupEta: null,
    });
  return next;
}

function mount(
  authorityView = view(),
  config: typeof ENABLED | null = ENABLED,
) {
  const content = (
    <RideContent
      fixture={mapPassengerRideAuthorityToFixture(
        authorityView as PassengerRideAuthorityView,
        "MAP-ORDER",
      )}
      token="MAP-ORDER"
    />
  );
  return render(
    config ? (
      <PassengerMapConfigProvider config={config}>
        {content}
      </PassengerMapConfigProvider>
    ) : (
      content
    ),
  );
}

const settle = () => act(async () => {});
const mapRegion = () => screen.queryByRole("region", { name: "行程地圖" });
const card = (element: HTMLElement) =>
  element.closest<HTMLElement>('div[style*="border-radius: 14px"]')!;

beforeEach(() => {
  loader.load.mockReset();
  loader.load.mockResolvedValue(fakeMaps);
  loader.failed = false;
  loader.listeners.clear();
  calls.maps = [];
  calls.fitBounds = [];
  calls.panTo = [];
});
afterEach(() => cleanup());

describe("passenger ride MapCard with the real Google map", () => {
  it("keeps the schematic exactly as before when the map is not offered", async () => {
    mount(view(), null);
    await settle();
    expect(loader.load).not.toHaveBeenCalled();
    expect(mapRegion()).toBeNull();
    const marker = screen.getByTestId("passenger-live-driver-position");
    expect(marker.style.left).toMatch(/%$/);
    expect(marker.textContent).toBe("車");
    expect(card(marker).style.height).toBe("150px");
    expect(screen.getByText("上車：Test pickup")).toBeTruthy();
  });

  it("draws the driver and the pickup on the Google map, fitted to both", async () => {
    mount();
    await settle();
    expect(loader.load).toHaveBeenCalledWith("test-browser-key");
    const region = mapRegion()!;
    expect(region).not.toBeNull();
    expect(region.style.visibility).toBe("visible");
    expect(calls.maps).toHaveLength(1);
    expect(calls.maps[0]!.element).toBe(region);
    expect(calls.maps[0]!.options).toMatchObject({
      gestureHandling: "cooperative",
      disableDefaultUI: true,
    });
    expect(calls.fitBounds.at(-1)).toEqual([
      { lat: 25.03, lng: 121.02 },
      PICKUP,
    ]);
    // One driver marker: the HTML marker on the map replaced the schematic.
    const markers = screen.getAllByTestId("passenger-live-driver-position");
    expect(markers).toHaveLength(1);
    const marker = markers[0]!;
    expect(region.contains(marker)).toBe(true);
    expect(marker.textContent).toBe("車");
    expect(marker.parentElement!.style.left).toBe("20px");
    expect(marker.parentElement!.style.top).toBe("170px");
    expect(card(region).style.height).toBe("180px");
    expect(screen.getByText("上車：Test pickup")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/示意/);
  });

  it("moves only the driver marker on a location update, without a new map", async () => {
    const result = mount();
    await settle();
    const fixture = mapPassengerRideAuthorityToFixture(
      view("assigned", {
        lat: 25.01,
        lng: 121.01,
      }) as PassengerRideAuthorityView,
      "MAP-ORDER",
    );
    result.rerender(
      <PassengerMapConfigProvider config={ENABLED}>
        <RideContent fixture={fixture} token="MAP-ORDER" />
      </PassengerMapConfigProvider>,
    );
    await settle();
    expect(calls.maps).toHaveLength(1);
    const marker = screen.getByTestId("passenger-live-driver-position");
    expect(marker.parentElement!.style.left).toBe("10px");
    expect(marker.parentElement!.style.top).toBe("190px");
  });

  it("shows the pickup with 正在取得司機位置 before any driver position", async () => {
    mount(view("assigned", null));
    await settle();
    const region = mapRegion()!;
    expect(region).not.toBeNull();
    expect(screen.queryByTestId("passenger-live-driver-position")).toBeNull();
    expect(screen.getByText("正在取得司機位置")).toBeTruthy();
    expect(calls.panTo.at(-1)).toEqual(PICKUP);
    expect(screen.getByText("上車：Test pickup")).toBeTruthy();
  });

  it("heads to the drop-off once on board", async () => {
    mount(view("on_trip", { lat: 25.05, lng: 121.05 }));
    await settle();
    expect(calls.fitBounds.at(-1)).toEqual([
      { lat: 25.05, lng: 121.05 },
      DROPOFF,
    ]);
    expect(screen.getByText("下車：Test dropoff")).toBeTruthy();
    const region = mapRegion()!;
    expect(
      within(region).getByTestId("passenger-live-driver-position"),
    ).toBeTruthy();
  });

  it("falls back to the schematic when the Maps script cannot load", async () => {
    loader.load.mockRejectedValue(new Error("GOOGLE_MAPS_SCRIPT_FAILED"));
    mount();
    await settle();
    expect(mapRegion()).toBeNull();
    const marker = screen.getByTestId("passenger-live-driver-position");
    expect(marker.style.left).toMatch(/%$/);
    expect(card(marker).style.height).toBe("150px");
  });

  it("falls back to the schematic when Google rejects the browser key", async () => {
    mount();
    await settle();
    expect(mapRegion()).not.toBeNull();
    await act(async () => {
      loader.failed = true;
      for (const listener of loader.listeners) listener();
    });
    expect(mapRegion()).toBeNull();
    const markers = screen.getAllByTestId("passenger-live-driver-position");
    expect(markers).toHaveLength(1);
    expect(markers[0]!.style.left).toMatch(/%$/);
  });

  it("keeps the schematic while the script is still loading", async () => {
    loader.load.mockReturnValue(new Promise(() => {}));
    mount();
    await settle();
    expect(mapRegion()).toBeNull();
    const markers = screen.getAllByTestId("passenger-live-driver-position");
    expect(markers).toHaveLength(1);
    expect(markers[0]!.style.left).toMatch(/%$/);
  });
});
