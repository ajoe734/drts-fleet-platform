"use client";

/**
 * Minimal Google Maps JavaScript loader for the embed's place picker. It
 * loads the official script once per page without adding an npm dependency,
 * and reports an authorization failure (for example a browser key whose
 * referrer list does not include this origin) so the picker can fall back to
 * address search only.
 */

export interface LatLngLiteral {
  lat: number;
  lng: number;
}

interface LatLngLike {
  lat(): number;
  lng(): number;
}

export interface MapsLatLngBoundsLike {
  extend(point: LatLngLiteral): void;
}

export interface MapsMapLike {
  setCenter(point: LatLngLiteral): void;
  panTo(point: LatLngLiteral): void;
  fitBounds(bounds: MapsLatLngBoundsLike, padding?: number): void;
  addListener(
    event: "click",
    handler: (event: { latLng?: LatLngLike | null }) => void,
  ): unknown;
  addListener(event: "dragstart", handler: () => void): unknown;
}

export interface MapsMarkerLabel {
  text: string;
  color?: string;
  fontSize?: string;
  fontWeight?: string;
}

export interface MapsMarkerLike {
  setPosition(point: LatLngLiteral): void;
  setVisible(visible: boolean): void;
  setLabel(label: MapsMarkerLabel): void;
  addListener(event: "dragend", handler: () => void): unknown;
  getPosition(): LatLngLike | null | undefined;
}

export interface MapsApiLike {
  Map: new (
    element: HTMLElement,
    options: Record<string, unknown>,
  ) => MapsMapLike;
  Marker: new (options: Record<string, unknown>) => MapsMarkerLike;
  LatLngBounds: new () => MapsLatLngBoundsLike;
  SymbolPath: { CIRCLE: unknown };
}

type MapsWindow = Window & {
  google?: { maps?: MapsApiLike };
  gm_authFailure?: () => void;
  __drtsReferralMapsReady?: () => void;
};

let loading: Promise<MapsApiLike> | null = null;
let authFailed = false;
const authFailureListeners = new Set<() => void>();

export function googleMapsAuthFailed() {
  return authFailed;
}

export function onGoogleMapsAuthFailure(listener: () => void) {
  authFailureListeners.add(listener);
  return () => {
    authFailureListeners.delete(listener);
  };
}

export function loadGoogleMaps(browserKey: string): Promise<MapsApiLike> {
  if (loading) return loading;
  const target = window as MapsWindow;
  loading = new Promise<MapsApiLike>((resolve, reject) => {
    target.gm_authFailure = () => {
      authFailed = true;
      for (const listener of authFailureListeners) listener();
    };
    target.__drtsReferralMapsReady = () => {
      const maps = target.google?.maps;
      if (maps) resolve(maps);
      else reject(new Error("GOOGLE_MAPS_UNAVAILABLE"));
    };
    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: browserKey,
      v: "weekly",
      language: "zh-TW",
      region: "TW",
      callback: "__drtsReferralMapsReady",
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.onerror = () => {
      loading = null;
      reject(new Error("GOOGLE_MAPS_SCRIPT_FAILED"));
    };
    document.head.appendChild(script);
  });
  return loading;
}
