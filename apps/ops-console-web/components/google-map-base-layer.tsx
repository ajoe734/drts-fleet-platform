"use client";

import type { GeoPoint, ServiceAreaGeoJsonFeature } from "@drts/contracts";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { useEffect, useEffectEvent, useRef, useState } from "react";

type GoogleMapStatus = "loading" | "ready" | "fallback" | "error";

type MapProviderConfig = {
  provider: "google" | "fallback";
  enabled: boolean;
  browserKey: string | null;
  mapId: string | null;
  reasonCode: string | null;
};

export interface GoogleMapBaseLayerProps {
  center: GeoPoint;
  zoom: number;
  interactive?: boolean;
  selectedPoint?: GeoPoint | null;
  features?: ServiceAreaGeoJsonFeature[];
  onPointSelect?: (point: GeoPoint) => void;
  ariaLabel: string;
}

let loaderKey: string | null = null;
let configPromise: Promise<MapProviderConfig> | null = null;

async function loadMapConfig() {
  configPromise ??= fetch("/api/map-provider-config", {
    cache: "no-store",
    credentials: "same-origin",
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(
        `Map provider config failed with HTTP ${response.status}.`,
      );
    }
    return (await response.json()) as MapProviderConfig;
  });
  return configPromise;
}

async function loadMapsLibrary(config: MapProviderConfig) {
  if (!config.enabled || !config.browserKey) {
    return null;
  }
  if (loaderKey && loaderKey !== config.browserKey) {
    throw new Error(
      "Google Maps loader key changed during the browser session.",
    );
  }
  if (!loaderKey) {
    loaderKey = config.browserKey;
    setOptions({
      key: config.browserKey,
      v: "weekly",
      language: "zh-TW",
      region: "TW",
      authReferrerPolicy: "origin",
    });
  }
  return importLibrary("maps") as Promise<google.maps.MapsLibrary>;
}

function polygonStyle(feature: ServiceAreaGeoJsonFeature) {
  if (feature.properties.recordKind === "service_area") {
    return {
      fillColor: "#0ea5e9",
      fillOpacity: 0.13,
      strokeColor: "#38bdf8",
      strokeOpacity: 0.95,
      strokeWeight: 2,
    };
  }
  if (feature.properties.effect === "deny") {
    return {
      fillColor: "#ef4444",
      fillOpacity: 0.3,
      strokeColor: "#f87171",
      strokeOpacity: 1,
      strokeWeight: 3,
    };
  }
  if (feature.properties.effect === "manual_review") {
    return {
      fillColor: "#f59e0b",
      fillOpacity: 0.28,
      strokeColor: "#fbbf24",
      strokeOpacity: 1,
      strokeWeight: 3,
    };
  }
  return {
    fillColor: "#22c55e",
    fillOpacity: 0.18,
    strokeColor: "#4ade80",
    strokeOpacity: 1,
    strokeWeight: 2,
  };
}

export function GoogleMapBaseLayer({
  center,
  zoom,
  interactive = false,
  selectedPoint = null,
  features = [],
  onPointSelect,
  ariaLabel,
}: GoogleMapBaseLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polygonsRef = useRef<google.maps.Polygon[]>([]);
  const selectedCircleRef = useRef<google.maps.Circle | null>(null);
  const clickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const [status, setStatus] = useState<GoogleMapStatus>("loading");
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const emitPointSelect = useEffectEvent((point: GeoPoint) => {
    onPointSelect?.(point);
  });

  useEffect(() => {
    let active = true;
    void loadMapConfig()
      .then(async (config) => {
        if (!active || !config.enabled) {
          if (active) {
            setReasonCode(config.reasonCode);
            setStatus("fallback");
          }
          return;
        }
        const library = await loadMapsLibrary(config);
        if (!active || !library || !containerRef.current) {
          return;
        }
        mapRef.current = new library.Map(containerRef.current, {
          center,
          zoom,
          ...(config.mapId ? { mapId: config.mapId } : {}),
          disableDefaultUI: true,
          clickableIcons: false,
          keyboardShortcuts: interactive,
          gestureHandling: interactive ? "cooperative" : "none",
          backgroundColor: "#0f172a",
        });
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (active) {
          setReasonCode(error instanceof Error ? error.name : "load_failed");
          setStatus("error");
        }
      });

    return () => {
      active = false;
      clickListenerRef.current?.remove();
      polygonsRef.current.forEach((polygon) => polygon.setMap(null));
      selectedCircleRef.current?.setMap(null);
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (status !== "ready" || !mapRef.current) {
      return;
    }
    mapRef.current.setCenter(center);
    mapRef.current.setZoom(zoom);
  }, [center.lat, center.lng, status, zoom]);

  useEffect(() => {
    clickListenerRef.current?.remove();
    clickListenerRef.current = null;
    if (status !== "ready" || !mapRef.current || !interactive) {
      return;
    }
    clickListenerRef.current = mapRef.current.addListener(
      "click",
      (event: google.maps.MapMouseEvent) => {
        const lat = event.latLng?.lat();
        const lng = event.latLng?.lng();
        if (typeof lat === "number" && typeof lng === "number") {
          emitPointSelect({
            lat: Number(lat.toFixed(6)),
            lng: Number(lng.toFixed(6)),
          });
        }
      },
    );
    return () => clickListenerRef.current?.remove();
  }, [interactive, status]);

  useEffect(() => {
    polygonsRef.current.forEach((polygon) => polygon.setMap(null));
    polygonsRef.current = [];
    if (status !== "ready" || !mapRef.current) {
      return;
    }
    polygonsRef.current = features.flatMap((feature) =>
      feature.geometry.coordinates.map(
        (ring) =>
          new google.maps.Polygon({
            map: mapRef.current,
            paths: ring.flatMap(([lng, lat]) =>
              typeof lat === "number" && typeof lng === "number"
                ? [{ lat, lng }]
                : [],
            ),
            clickable: false,
            ...polygonStyle(feature),
          }),
      ),
    );
    return () => {
      polygonsRef.current.forEach((polygon) => polygon.setMap(null));
      polygonsRef.current = [];
    };
  }, [features, status]);

  useEffect(() => {
    selectedCircleRef.current?.setMap(null);
    selectedCircleRef.current = null;
    if (status !== "ready" || !mapRef.current || !selectedPoint) {
      return;
    }
    selectedCircleRef.current = new google.maps.Circle({
      map: mapRef.current,
      center: selectedPoint,
      radius: 24,
      fillColor: "#f8fafc",
      fillOpacity: 0.92,
      strokeColor: "#0ea5e9",
      strokeOpacity: 1,
      strokeWeight: 4,
      clickable: false,
    });
    return () => selectedCircleRef.current?.setMap(null);
  }, [selectedPoint?.lat, selectedPoint?.lng, status]);

  return (
    <div
      ref={containerRef}
      aria-label={ariaLabel}
      data-google-map-base-layer
      data-google-map-reason={reasonCode ?? ""}
      data-google-map-status={status}
      role="img"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 1,
        pointerEvents: status === "ready" && interactive ? "auto" : "none",
      }}
    />
  );
}
