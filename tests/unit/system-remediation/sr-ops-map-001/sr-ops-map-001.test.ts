import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type {
  AddressPayload,
  DispatchCandidate,
  DispatchJobRecord,
  OwnedOrderRecord,
} from "@drts/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  OPS_MAP_MAX_ZOOM,
  OPS_MAP_MIN_ZOOM,
  OPS_MAP_MOCK_TILE_URL_TEMPLATE,
  buildOpsMapBoardModel,
  buildOpsMapTileViewport,
  getDefaultOpsMapZoom,
  normalizeOpsMapBounds,
  projectOpsMapPointToViewport,
  resolveOpsMapTileUrlTemplate,
  shiftOpsMapCenter,
} from "../../../../apps/ops-console-web/app/dispatch/ops-map-board";
import {
  getCandidateLocationState,
  isFreshLocation,
} from "../../../../apps/ops-console-web/app/dispatch/location-state";

export type MapProviderConfig = {
  provider: "google" | "fallback";
  enabled: boolean;
  browserKey: string | null;
  mapId: string | null;
  reasonCode: string | null;
};

const GOOGLE_MAP_MODULE_PATH =
  "../../../../apps/ops-console-web/components/google-map-base-layer";
const { resolveGoogleMapBaseLayerStatus, resetGoogleMapConfigCache }: any =
  await import(GOOGLE_MAP_MODULE_PATH);

const MOCK_TILES_DIR = resolve(
  __dirname,
  "../../../../apps/ops-console-web/public/mock-map-tiles",
);
const OPS_PUBLIC_DIR = resolve(
  __dirname,
  "../../../../apps/ops-console-web/public",
);
const BUREAU_EXTERNAL_MAP_FIXTURE = resolve(
  __dirname,
  "../../../e2e/pax-bureau-acceptance/external-map-port.cjs",
);
const BUREAU_MATCHING_SPEC = resolve(
  __dirname,
  "../../../e2e/pax-bureau-acceptance/matching-timeout.spec.ts",
);

type OpsRoutingConfig = {
  rewrites?: () => Promise<
    | { source: string; destination: string }[]
    | {
        beforeFiles?: { source: string; destination: string }[];
        afterFiles?: { source: string; destination: string }[];
        fallback?: { source: string; destination: string }[];
      }
  >;
};

const { unstable_getResponseFromNextConfig, getRewrittenUrl } =
  await vi.importActual<{
    unstable_getResponseFromNextConfig: (input: {
      url: string;
      nextConfig: OpsRoutingConfig;
    }) => Promise<Response>;
    getRewrittenUrl: (response: Response) => string | undefined;
  }>("next/experimental/testing/server");
const { default: opsNextConfig } = await vi.importActual<{
  default: OpsRoutingConfig;
}>("../../../../apps/ops-console-web/next.config");

function collectMockTileRelativePaths(
  dir: string,
  prefix = "/mock-map-tiles",
): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = resolve(dir, entry.name);
    const relPath = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      results.push(...collectMockTileRelativePaths(fullPath, relPath));
    } else if (entry.isFile() && entry.name.endsWith(".svg")) {
      results.push(relPath);
    }
  }
  return results;
}

function makeOrder(
  overrides: Partial<Omit<OwnedOrderRecord, "pickup" | "dropoff">> & {
    pickup?: AddressPayload | null;
    dropoff?: AddressPayload | null;
  } = {},
): OwnedOrderRecord {
  return {
    orderId: "order-map-1",
    orderNo: "ORD-MAP-001",
    pickup: {
      address: "台北市信義區市府路 1 號",
      addressName: "台北市政府",
      lat: 25.037519,
      lng: 121.56368,
    },
    dropoff: {
      address: "台北市信義區松仁路 100 號",
      addressName: "信義辦公室",
      lat: 25.033879,
      lng: 121.568743,
    },
    ...overrides,
  } as unknown as OwnedOrderRecord;
}

function makeJob(
  overrides: Partial<DispatchJobRecord> = {},
): DispatchJobRecord {
  return {
    dispatchJobId: "job-map-1",
    orderId: "order-map-1",
    status: "reserved",
    mode: "auto",
    latestEtaMinutes: 5,
    createdAt: "2026-09-06T07:00:00.000Z",
    updatedAt: "2026-09-06T07:01:00.000Z",
    ...overrides,
  };
}

function makeCandidate(
  overrides: Partial<DispatchCandidate> = {},
): DispatchCandidate {
  return {
    vehicleId: "VH-MAP-01",
    driverId: "DRV-MAP-01",
    operatingArea: "TPE-CORE",
    serviceBuckets: ["standard_taxi"],
    etaMinutes: 4,
    currentLocation: {
      driverId: "DRV-MAP-01",
      lat: 25.03688,
      lng: 121.56608,
      accuracyM: 5,
      recordedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    ...overrides,
  };
}

describe("SR-OPS-MAP-001: Mock Map Tiles 404 Remediation", () => {
  it("provides all 9 default viewport tiles for the dispatch console map with zero 404s", () => {
    const defaultBounds = {
      minLat: 25.033879,
      maxLat: 25.037519,
      minLng: 121.56368,
      maxLng: 121.568743,
      latSpan: 0.01,
      lngSpan: 0.01,
    };
    const zoom = getDefaultOpsMapZoom(defaultBounds);
    expect(zoom).toBe(8);

    const viewport = buildOpsMapTileViewport({
      bounds: defaultBounds,
      zoom,
      tileUrlTemplate: "/mock-map-tiles/{z}/{x}/{y}.svg",
    });

    expect(viewport.tiles.length).toBe(9);

    for (const tile of viewport.tiles) {
      const relPath = `${tile.z}/${tile.x}/${tile.y}.svg`;
      const filePath = resolve(MOCK_TILES_DIR, relPath);
      expect(existsSync(filePath), `Tile ${relPath} must exist on disk`).toBe(
        true,
      );

      const content = readFileSync(filePath, "utf8");
      expect(content).toContain("<svg");
      expect(content).toContain('viewBox="0 0 256 256"');
      expect(content).toContain("#0f766e");
    }
  });

  it("serves root tile 0/0/0.svg and multi-zoom tiles without 404", () => {
    const rootTile = resolve(MOCK_TILES_DIR, "0/0/0.svg");
    expect(existsSync(rootTile), "0/0/0.svg must exist").toBe(true);
    const content = readFileSync(rootTile, "utf8");
    expect(content).toContain("<svg");

    for (let z = 3; z <= 18; z++) {
      const viewport = buildOpsMapTileViewport({
        bounds: {
          minLat: 25.033879,
          maxLat: 25.037519,
          minLng: 121.56368,
          maxLng: 121.568743,
          latSpan: 0.01,
          lngSpan: 0.01,
        },
        zoom: z,
        tileUrlTemplate: "/mock-map-tiles/{z}/{x}/{y}.svg",
      });

      expect(viewport.tiles.length).toBeGreaterThan(0);
      for (const tile of viewport.tiles) {
        const filePath = resolve(
          MOCK_TILES_DIR,
          `${tile.z}/${tile.x}/${tile.y}.svg`,
        );
        expect(
          existsSync(filePath),
          `Zoom ${z} tile ${tile.z}/${tile.x}/${tile.y}.svg must exist`,
        ).toBe(true);
      }
    }
  });

  it("supports pan directions (north, south, west, east) at default zoom without missing tiles", () => {
    const bounds = {
      minLat: 25.033879,
      maxLat: 25.037519,
      minLng: 121.56368,
      maxLng: 121.568743,
      latSpan: 0.01,
      lngSpan: 0.01,
    };
    const initialViewport = buildOpsMapTileViewport({
      bounds,
      zoom: 8,
      tileUrlTemplate: "/mock-map-tiles/{z}/{x}/{y}.svg",
    });

    for (const dir of ["north", "south", "west", "east"] as const) {
      const shifted = shiftOpsMapCenter(initialViewport, dir);
      const pannedViewport = buildOpsMapTileViewport({
        bounds,
        centerLat: shifted.lat,
        centerLng: shifted.lng,
        zoom: 8,
        tileUrlTemplate: "/mock-map-tiles/{z}/{x}/{y}.svg",
      });

      expect(pannedViewport.tiles.length).toBeGreaterThan(0);
      for (const tile of pannedViewport.tiles) {
        const filePath = resolve(
          MOCK_TILES_DIR,
          `${tile.z}/${tile.x}/${tile.y}.svg`,
        );
        expect(
          existsSync(filePath),
          `Panned ${dir} tile ${tile.z}/${tile.x}/${tile.y}.svg must exist`,
        ).toBe(true);
      }
    }
  });

  it("resolves mock tile URL template strictly for local/test/mock environments and never for production", () => {
    expect(resolveOpsMapTileUrlTemplate({ MAP_PROVIDER_MODE: "mock" })).toBe(
      "/mock-map-tiles/{z}/{x}/{y}.svg",
    );
    expect(
      resolveOpsMapTileUrlTemplate({
        NODE_ENV: "development",
      }),
    ).toBe("/mock-map-tiles/{z}/{x}/{y}.svg");

    expect(
      resolveOpsMapTileUrlTemplate({
        DRTS_ENV: "production",
        MAP_PROVIDER_MODE: "external",
        NODE_ENV: "production",
      }),
    ).toBe("");
  });
});

describe("SR-OPS-MAP-001: Base-Layer Resolver & Provider Switching", () => {
  it("resolves to ready with google provider when live google provider is fully configured", () => {
    const config: MapProviderConfig = {
      provider: "google",
      enabled: true,
      browserKey: "AIzaSyMockKeyForValidation12345",
      mapId: "DEMO_MAP_ID",
      reasonCode: null,
    };

    const resolution = resolveGoogleMapBaseLayerStatus(config);
    expect(resolution.status).toBe("ready");
    expect(resolution.provider).toBe("google");
    expect(resolution.reasonCode).toBeNull();
    expect(resolution.isProductionReady).toBe(true);
    expect(resolution.requiresMockFallback).toBe(false);
  });

  it("resolves to fallback with explicit missing reason when browser key is missing", () => {
    const config: MapProviderConfig = {
      provider: "fallback",
      enabled: false,
      browserKey: null,
      mapId: null,
      reasonCode: "browser_key_missing",
    };

    const resolution = resolveGoogleMapBaseLayerStatus(config);
    expect(resolution.status).toBe("fallback");
    expect(resolution.provider).toBe("fallback");
    expect(resolution.reasonCode).toBe("browser_key_missing");
    expect(resolution.isProductionReady).toBe(false);
    expect(resolution.requiresMockFallback).toBe(true);
  });

  it("resolves to fallback when mode is not external (provider_not_external)", () => {
    const config: MapProviderConfig = {
      provider: "fallback",
      enabled: false,
      browserKey: null,
      mapId: null,
      reasonCode: "provider_not_external",
    };

    const resolution = resolveGoogleMapBaseLayerStatus(config);
    expect(resolution.status).toBe("fallback");
    expect(resolution.provider).toBe("fallback");
    expect(resolution.reasonCode).toBe("provider_not_external");
    expect(resolution.isProductionReady).toBe(false);
  });

  it("resolves to fallback when origin is disallowed (origin_not_allowed)", () => {
    const config: MapProviderConfig = {
      provider: "fallback",
      enabled: false,
      browserKey: null,
      mapId: null,
      reasonCode: "origin_not_allowed",
    };

    const resolution = resolveGoogleMapBaseLayerStatus(config);
    expect(resolution.status).toBe("fallback");
    expect(resolution.provider).toBe("fallback");
    expect(resolution.reasonCode).toBe("origin_not_allowed");
    expect(resolution.isProductionReady).toBe(false);
  });

  it("handles null or undefined config safely without crashing", () => {
    const resNull = resolveGoogleMapBaseLayerStatus(null);
    expect(resNull.status).toBe("fallback");
    expect(resNull.provider).toBe("fallback");
    expect(resNull.reasonCode).toBe("missing_config");
    expect(resNull.isProductionReady).toBe(false);

    const resUndef = resolveGoogleMapBaseLayerStatus(undefined);
    expect(resUndef.status).toBe("fallback");
    expect(resUndef.reasonCode).toBe("missing_config");
  });

  it("enforces mock/fallback can never be marked production ready (mock不可標production)", () => {
    const mockConfigs = [
      null,
      {
        provider: "fallback",
        enabled: false,
        browserKey: null,
        mapId: null,
        reasonCode: "provider_not_external",
      },
      {
        provider: "fallback",
        enabled: false,
        browserKey: "some-key",
        mapId: null,
        reasonCode: "mode_is_mock",
      },
      {
        provider: "google",
        enabled: false,
        browserKey: null,
        mapId: null,
        reasonCode: "browser_key_missing",
      },
      {
        provider: "google",
        enabled: true,
        browserKey: "",
        mapId: null,
        reasonCode: null,
      },
    ];

    for (const cfg of mockConfigs) {
      const res = resolveGoogleMapBaseLayerStatus(cfg);
      expect(res.isProductionReady).toBe(false);
      expect(res.status).toBe("fallback");
    }
  });

  it("resets loader and promise cache via resetGoogleMapConfigCache()", () => {
    expect(() => resetGoogleMapConfigCache()).not.toThrow();
  });
});

describe("SR-OPS-MAP-001: Location Freshness, Timeout & Degraded State", () => {
  it("determines location freshness correctly based on recordedAt threshold", () => {
    const now = Date.now();
    const freshIso = new Date(now - 2 * 60 * 1000).toISOString();
    const staleIso = new Date(now - 15 * 60 * 1000).toISOString();

    expect(isFreshLocation(freshIso, now)).toBe(true);
    expect(isFreshLocation(staleIso, now)).toBe(false);
    expect(isFreshLocation(null, now)).toBe(false);
    expect(isFreshLocation(undefined, now)).toBe(false);
    expect(isFreshLocation("invalid-date", now)).toBe(false);
  });

  it("classifies candidate locationState as fresh, stale, or missing", () => {
    const now = Date.now();
    const freshCandidate = makeCandidate();
    expect(getCandidateLocationState(freshCandidate, now)).toBe("fresh");

    const staleCandidate = makeCandidate({
      currentLocation: {
        driverId: "DRV-02",
        lat: 25.036,
        lng: 121.566,
        accuracyM: 5,
        recordedAt: new Date(now - 20 * 60 * 1000).toISOString(),
        updatedAt: new Date(now - 20 * 60 * 1000).toISOString(),
      },
    });
    expect(getCandidateLocationState(staleCandidate, now)).toBe("stale");

    const noLocationCandidate = makeCandidate({
      currentLocation: null,
    });
    expect(getCandidateLocationState(noLocationCandidate, now)).toBe("missing");
  });

  it("does not project candidate when location is missing (位置逾時與provider失敗不畫成可派)", () => {
    const ord = makeOrder();
    const jb = makeJob();
    const candidateWithoutLocation = makeCandidate({
      currentLocation: null,
    });

    const model = buildOpsMapBoardModel({
      orders: [ord],
      orderJobMap: { [ord.orderId]: jb },
      candidatesByJobId: {
        [jb.dispatchJobId]: [candidateWithoutLocation],
      },
    });

    const candidatePoints = model.points.filter((p) => p.kind === "candidate");
    expect(candidatePoints.length).toBe(0);
    expect(model.noLocationCandidateCount).toBe(1);
    expect(model.providerStatus).toBe("degraded_projection");
    expect(model.fallbackReason).toBe("missing_coordinates");
  });

  it("marks stale candidate locations as stale points rather than fresh dispatchable", () => {
    const ord = makeOrder();
    const jb = makeJob();
    const staleCandidate = makeCandidate({
      locationState: "stale",
    });

    const model = buildOpsMapBoardModel({
      orders: [ord],
      orderJobMap: { [ord.orderId]: jb },
      candidatesByJobId: {
        [jb.dispatchJobId]: [staleCandidate],
      },
    });

    const candidatePoints = model.points.filter((p) => p.kind === "candidate");
    expect(candidatePoints.length).toBe(1);
    expect(candidatePoints[0]?.freshness).toBe("stale");
    expect(model.staleCandidatePoints).toBe(1);
  });

  it("marks board providerStatus as degraded_projection when pickup coordinates are missing", () => {
    const ordWithoutPickup = makeOrder({
      pickup: null,
    });

    const model = buildOpsMapBoardModel({
      orders: [ordWithoutPickup],
      orderJobMap: {},
      candidatesByJobId: {},
    });

    expect(model.ordersMissingPickupCoordinates).toBe(1);
    expect(model.providerStatus).toBe("degraded_projection");
    expect(model.fallbackReason).toBe("missing_coordinates");
  });

  it("marks board providerStatus as no_spatial_data when all coordinates are missing", () => {
    const ordWithoutAnyCoords = makeOrder({
      pickup: null,
      dropoff: null,
    });

    const model = buildOpsMapBoardModel({
      orders: [ordWithoutAnyCoords],
      orderJobMap: {},
      candidatesByJobId: {},
    });

    expect(model.ordersMissingPickupCoordinates).toBe(1);
    expect(model.providerStatus).toBe("no_spatial_data");
    expect(model.fallbackReason).toBe("no_visible_points");
  });

  it("returns null bounds when points array is empty", () => {
    expect(normalizeOpsMapBounds([])).toBeNull();
  });
});

describe("BUREAU-OPS-MAP-BANQIAO-TILES-20261123: Banqiao Dispatch & Callcenter Zoom/Pan Tile Resolution", () => {
  it("resolves every Banqiao Station and New Taipei City Hall tile across zooms 3-18 and pan directions via packaged static assets or Next fallback rewrite without duplicating SVGs", async () => {
    const fixtureSource = readFileSync(BUREAU_EXTERNAL_MAP_FIXTURE, "utf8");
    const matchingSpecSource = readFileSync(BUREAU_MATCHING_SPEC, "utf8");
    const banqiaoPoints = [
      {
        key: "bureau-banqiao:pickup",
        kind: "pickup" as const,
        label: "合成板橋車站",
        lat: 25.0142,
        lng: 121.4636,
      },
      {
        key: "bureau-city-hall:dropoff",
        kind: "dropoff" as const,
        label: "合成新北市政府",
        lat: 25.012,
        lng: 121.4654,
      },
    ];
    for (const point of banqiaoPoints) {
      expect(fixtureSource).toContain(String(point.lat));
      expect(fixtureSource).toContain(String(point.lng));
      expect(matchingSpecSource).toContain(String(point.lat));
      expect(matchingSpecSource).toContain(String(point.lng));
    }

    const packagedFiles = new Set(collectMockTileRelativePaths(MOCK_TILES_DIR));
    expect(packagedFiles.size).toBe(1212);
    const fallbackAsset = "/mock-map-tiles/0/0/0.svg";
    expect(packagedFiles.has(fallbackAsset)).toBe(true);
    const rootSvgContent = readFileSync(
      resolve(OPS_PUBLIC_DIR, fallbackAsset.slice(1)),
      "utf8",
    );
    const distinctContents = new Set(
      Array.from(packagedFiles, (rel) =>
        readFileSync(resolve(OPS_PUBLIC_DIR, rel.slice(1)), "utf8"),
      ),
    );
    expect(distinctContents.size).toBe(1);
    expect(distinctContents.has(rootSvgContent)).toBe(true);

    const rewrites = await opsNextConfig.rewrites!();
    expect(Array.isArray(rewrites)).toBe(false);
    const rewriteGroups = rewrites as {
      beforeFiles?: { source: string; destination: string }[];
      afterFiles?: { source: string; destination: string }[];
      fallback?: { source: string; destination: string }[];
    };
    expect(rewriteGroups.afterFiles).toEqual(
      expect.arrayContaining([
        {
          source: "/downloads/:kind/:subjectId",
          destination: "/control-plane-proxy/downloads/:kind/:subjectId",
        },
      ]),
    );
    expect(rewriteGroups.fallback).toEqual([
      {
        source: "/mock-map-tiles/:z(\\d+)/:x(\\d+)/:y(\\d+).svg",
        destination: fallbackAsset,
      },
    ]);

    const origin = "https://ops.smarttransport.tw";
    async function resolveRewrittenPathname(relativePath: string) {
      const response = await unstable_getResponseFromNextConfig({
        url: `${origin}${relativePath}`,
        nextConfig: opsNextConfig,
      });
      const rewritten = getRewrittenUrl(response);
      return rewritten ? new URL(rewritten).pathname : null;
    }

    const bounds = normalizeOpsMapBounds(banqiaoPoints)!;
    expect(bounds).not.toBeNull();
    expect(getDefaultOpsMapZoom(bounds, 720, 360, 256)).toBe(8);

    const missingCountsByZoom = new Map<number, number>();
    const prodMockTemplate = resolveOpsMapTileUrlTemplate({
      MAP_PROVIDER_MODE: "mock",
      NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE: `${origin}${OPS_MAP_MOCK_TILE_URL_TEMPLATE}`,
    });
    expect(prodMockTemplate).toBe(
      "https://ops.smarttransport.tw/mock-map-tiles/{z}/{x}/{y}.svg",
    );

    for (let zoom = OPS_MAP_MIN_ZOOM; zoom <= OPS_MAP_MAX_ZOOM; zoom += 1) {
      const viewport = buildOpsMapTileViewport({
        bounds,
        zoom,
        tileUrlTemplate: OPS_MAP_MOCK_TILE_URL_TEMPLATE,
      });
      const missingAtZoom = viewport.tiles.filter(
        (tile) => !packagedFiles.has(tile.src),
      );
      missingCountsByZoom.set(zoom, missingAtZoom.length);

      for (const point of banqiaoPoints) {
        const projected = projectOpsMapPointToViewport(point, viewport);
        expect(projected.visible).toBe(true);
      }

      for (const tile of viewport.tiles) {
        if (packagedFiles.has(tile.src)) {
          expect(existsSync(resolve(OPS_PUBLIC_DIR, tile.src.slice(1)))).toBe(
            true,
          );
        } else {
          const rewrittenPathname = await resolveRewrittenPathname(tile.src);
          expect(rewrittenPathname).toBe(fallbackAsset);
          expect(
            existsSync(resolve(OPS_PUBLIC_DIR, rewrittenPathname!.slice(1))),
          ).toBe(true);
        }
      }

      for (const direction of ["north", "south", "west", "east"] as const) {
        const shifted = shiftOpsMapCenter(viewport, direction);
        const pannedViewport = buildOpsMapTileViewport({
          bounds,
          centerLat: shifted.lat,
          centerLng: shifted.lng,
          zoom,
          tileUrlTemplate: prodMockTemplate,
        });
        for (const tile of pannedViewport.tiles) {
          const tilePathname = new URL(tile.src).pathname;
          if (!packagedFiles.has(tilePathname)) {
            expect(await resolveRewrittenPathname(tilePathname)).toBe(
              fallbackAsset,
            );
          }
        }
      }

      for (const point of banqiaoPoints) {
        const callcenterViewport = buildOpsMapTileViewport({
          bounds: {
            minLat: point.lat - 0.01,
            maxLat: point.lat + 0.01,
            minLng: point.lng - 0.01,
            maxLng: point.lng + 0.01,
            latSpan: 0.02,
            lngSpan: 0.02,
          },
          centerLat: point.lat,
          centerLng: point.lng,
          zoom,
          width: 640,
          height: 280,
          tileUrlTemplate: prodMockTemplate,
        });
        for (const tile of callcenterViewport.tiles) {
          const tilePathname = new URL(tile.src).pathname;
          if (!packagedFiles.has(tilePathname)) {
            expect(await resolveRewrittenPathname(tilePathname)).toBe(
              fallbackAsset,
            );
          }
        }
      }
    }

    expect(missingCountsByZoom.get(15)).toBe(2);
    expect(missingCountsByZoom.get(16)).toBe(6);
    expect(missingCountsByZoom.get(17)).toBe(6);
    expect(missingCountsByZoom.get(18)).toBe(8);

    // Signed download route and query parameters remain intact.
    const downloadPath =
      "/downloads/receipt/sample-order?token=synthetic-signature&lang=zh-TW";
    const downloadResponse = await unstable_getResponseFromNextConfig({
      url: `${origin}${downloadPath}`,
      nextConfig: opsNextConfig,
    });
    expect(getRewrittenUrl(downloadResponse)).toBe(
      `${origin}/control-plane-proxy${downloadPath}`,
    );

    // Non-coordinate paths under /mock-map-tiles are not matched by the tile fallback rule.
    expect(
      await resolveRewrittenPathname("/mock-map-tiles/labels.svg"),
    ).toBeNull();
  });
});
