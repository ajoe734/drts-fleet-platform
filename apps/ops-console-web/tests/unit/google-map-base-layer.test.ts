// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { ServiceAreaGeoJsonFeature } from "@drts/contracts";
import * as apiLoader from "@googlemaps/js-api-loader";

vi.mock("@googlemaps/js-api-loader", () => ({
  importLibrary: vi.fn(),
  setOptions: vi.fn(),
}));

import {
  GoogleMapBaseLayer,
  buildFeaturePolygonPaths,
  polygonStyle,
  resetGoogleMapConfigCache,
} from "../../components/google-map-base-layer";

afterEach(() => {
  cleanup();
  resetGoogleMapConfigCache();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  delete (globalThis as { google?: unknown }).google;
});

const donutFeature: ServiceAreaGeoJsonFeature = {
  type: "Feature",
  id: "khh-donut-core",
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [120.25, 22.58],
        [120.35, 22.58],
        [120.35, 22.68],
        [120.25, 22.68],
        [120.25, 22.58],
      ],
      [
        [120.28, 22.65],
        [120.28, 22.61],
        [120.32, 22.61],
        [120.32, 22.65],
        [120.28, 22.65],
      ],
    ],
  },
  properties: {
    recordKind: "service_area",
    serviceAreaId: "khh-donut-core-id",
    areaCode: "KHH_DONUT_CORE",
    displayName: "Kaohsiung donut operating area",
    status: "active",
    sourceGeometry: {
      type: "polygon",
      coordinates: [
        { lat: 22.58, lng: 120.25 },
        { lat: 22.58, lng: 120.35 },
        { lat: 22.68, lng: 120.35 },
        { lat: 22.68, lng: 120.25 },
      ],
      holes: [
        [
          { lat: 22.61, lng: 120.28 },
          { lat: 22.61, lng: 120.32 },
          { lat: 22.65, lng: 120.32 },
          { lat: 22.65, lng: 120.28 },
        ],
      ],
    },
    serviceProductTypes: ["taxi_realtime"],
    effectiveFrom: "2026-06-01T00:00:00.000Z",
    effectiveUntil: null,
    version: 1,
    geometryVersionRef: "service_area:KHH_DONUT_CORE@1",
  },
};

const solidFeature: ServiceAreaGeoJsonFeature = {
  ...donutFeature,
  id: "taipei-core",
  geometry: {
    type: "Polygon",
    coordinates: [donutFeature.geometry.coordinates[0]!],
  },
  properties: {
    ...donutFeature.properties,
    areaCode: "TAIPEI_CORE",
  } as ServiceAreaGeoJsonFeature["properties"],
};

/**
 * SAH-R3: the real ready-config `useEffect` in `GoogleMapBaseLayer` that
 * constructs `google.maps.Polygon` instances is only reachable through
 * React's commit/effect phase. This mounts the actual component with
 * `@testing-library/react`, mocking only the external
 * `@googlemaps/js-api-loader` loader module and the global `google.maps.*`
 * constructors the Maps JS API would otherwise install as a script-load
 * side effect — not the component's own logic.
 */
describe("GoogleMapBaseLayer (mounted, real ready-config effect)", () => {
  it("constructs exactly one google.maps.Polygon per feature with nested outer/hole paths", async () => {
    class FakeMap {
      center: unknown;
      zoom: unknown;
      constructor(
        _container: HTMLElement,
        options: { center: unknown; zoom: unknown },
      ) {
        this.center = options.center;
        this.zoom = options.zoom;
      }
      setCenter(center: unknown) {
        this.center = center;
      }
      setZoom(zoom: unknown) {
        this.zoom = zoom;
      }
      addListener() {
        return { remove: vi.fn() };
      }
    }

    const polygonInstances: Array<{
      options: Record<string, unknown>;
      setMap: ReturnType<typeof vi.fn>;
    }> = [];
    const PolygonCtor = vi.fn().mockImplementation(function (
      options: Record<string, unknown>,
    ) {
      const instance = { options, setMap: vi.fn() };
      polygonInstances.push(instance);
      return instance;
    });
    const CircleCtor = vi.fn().mockImplementation(function (
      options: Record<string, unknown>,
    ) {
      return { options, setMap: vi.fn() };
    });

    (globalThis as { google?: unknown }).google = {
      maps: { Polygon: PolygonCtor, Circle: CircleCtor },
    };

    vi.mocked(apiLoader.importLibrary).mockResolvedValue({
      Map: FakeMap,
    } as unknown as google.maps.MapsLibrary);

    const { container } = render(
      createElement(GoogleMapBaseLayer, {
        center: { lat: 22.63, lng: 120.3 },
        zoom: 13,
        ariaLabel: "Kaohsiung operating map",
        features: [donutFeature, solidFeature],
        config: {
          provider: "google",
          enabled: true,
          browserKey: "test-browser-key",
          mapId: null,
          reasonCode: null,
        },
      }),
    );

    await waitFor(() => {
      expect(
        container.querySelector('[data-google-map-status="ready"]'),
      ).not.toBeNull();
    });

    await waitFor(() => {
      expect(PolygonCtor).toHaveBeenCalledTimes(2);
    });

    expect(polygonInstances).toHaveLength(2);
    expect(polygonInstances[0]!.options.paths).toEqual(
      buildFeaturePolygonPaths(donutFeature),
    );
    expect((polygonInstances[0]!.options.paths as unknown[]).length).toBe(2);
    expect(polygonInstances[1]!.options.paths).toEqual(
      buildFeaturePolygonPaths(solidFeature),
    );
    expect((polygonInstances[1]!.options.paths as unknown[]).length).toBe(1);
    expect(polygonInstances[0]!.options).toMatchObject(
      polygonStyle(donutFeature),
    );
    expect(polygonInstances[0]!.options.clickable).toBe(false);
  });

  it("falls back honestly (no Polygon construction) when the map provider config is disabled", async () => {
    const PolygonCtor = vi.fn();
    (globalThis as { google?: unknown }).google = {
      maps: { Polygon: PolygonCtor, Circle: vi.fn() },
    };

    const { container } = render(
      createElement(GoogleMapBaseLayer, {
        center: { lat: 22.63, lng: 120.3 },
        zoom: 13,
        ariaLabel: "Kaohsiung operating map",
        features: [donutFeature],
        config: {
          provider: "fallback",
          enabled: false,
          browserKey: null,
          mapId: null,
          reasonCode: "provider_not_configured",
        },
      }),
    );

    await waitFor(() => {
      expect(
        container.querySelector('[data-google-map-status="fallback"]'),
      ).not.toBeNull();
    });
    expect(apiLoader.importLibrary).not.toHaveBeenCalled();
    expect(PolygonCtor).not.toHaveBeenCalled();
  });
});
