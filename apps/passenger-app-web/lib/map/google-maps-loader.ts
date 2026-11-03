"use client";

/**
 * Minimal Google Maps JavaScript loader for the passenger ride and booking
 * maps (ported from the referral embed). It loads the official script once
 * per page without adding an npm dependency, and reports an authorization
 * failure (for example a browser key whose referrer list does not include
 * this origin) so each map can fall back to the built-in schematic or grid.
 */

export interface LatLngLiteral {
  lat: number;
  lng: number;
}

export interface LatLngLike {
  lat(): number;
  lng(): number;
}

export interface MapsLatLngBoundsLike {
  extend(point: LatLngLiteral): void;
}

export interface MapsMapLike {
  setCenter(point: LatLngLiteral): void;
  setZoom(zoom: number): void;
  panTo(point: LatLngLiteral): void;
  fitBounds(bounds: MapsLatLngBoundsLike, padding?: number): void;
  addListener(
    event: "click",
    handler: (event: { latLng?: LatLngLike | null }) => void,
  ): unknown;
  addListener(event: "dragstart", handler: () => void): unknown;
}

export interface MapsMarkerLike {
  setPosition(point: LatLngLiteral): void;
  setVisible(visible: boolean): void;
  setMap(map: MapsMapLike | null): void;
  addListener(event: "dragend", handler: () => void): unknown;
  getPosition(): LatLngLike | null | undefined;
}

export interface MapsPanesLike {
  overlayLayer: HTMLElement;
}

export interface MapsProjectionLike {
  fromLatLngToDivPixel(
    latLng: unknown,
  ): { x: number; y: number } | null | undefined;
}

/** google.maps.OverlayView: the base for HTML markers drawn on the map. */
export interface MapsOverlayViewLike {
  setMap(map: MapsMapLike | null): void;
  getPanes(): MapsPanesLike | null | undefined;
  getProjection(): MapsProjectionLike | null | undefined;
}

export interface MapsApiLike {
  Map: new (
    element: HTMLElement,
    options: Record<string, unknown>,
  ) => MapsMapLike;
  Marker: new (options: Record<string, unknown>) => MapsMarkerLike;
  LatLngBounds: new () => MapsLatLngBoundsLike;
  LatLng: new (lat: number, lng: number) => unknown;
  OverlayView: new () => MapsOverlayViewLike;
}

type MapsWindow = Window & {
  google?: { maps?: MapsApiLike };
  gm_authFailure?: () => void;
  __drtsPassengerMapsReady?: () => void;
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
    target.__drtsPassengerMapsReady = () => {
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
      callback: "__drtsPassengerMapsReady",
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

/** One HTML element placed at a map coordinate (centered on the point). */
export interface HtmlMapMarker {
  readonly element: HTMLElement;
  setPosition(point: LatLngLiteral | null): void;
  setMap(map: MapsMapLike | null): void;
}

/**
 * HTML markers keep the passenger app's own marker look (and data-testid
 * hooks) on the real map instead of Google's default pins.
 */
export function createHtmlMapMarker(
  maps: MapsApiLike,
  element: HTMLElement,
): HtmlMapMarker {
  class HtmlMarker extends maps.OverlayView implements HtmlMapMarker {
    readonly element = element;
    private position: LatLngLiteral | null = null;

    onAdd() {
      this.getPanes()?.overlayLayer.appendChild(this.element);
    }

    draw() {
      const projection = this.getProjection();
      const pixel =
        projection && this.position
          ? projection.fromLatLngToDivPixel(
              new maps.LatLng(this.position.lat, this.position.lng),
            )
          : null;
      if (!pixel) {
        this.element.style.display = "none";
        return;
      }
      this.element.style.display = "";
      this.element.style.left = `${pixel.x}px`;
      this.element.style.top = `${pixel.y}px`;
    }

    onRemove() {
      this.element.parentNode?.removeChild(this.element);
    }

    setPosition(point: LatLngLiteral | null) {
      this.position = point;
      this.draw();
    }
  }
  element.style.position = "absolute";
  element.style.transform = "translate(-50%, -50%)";
  return new HtmlMarker();
}
