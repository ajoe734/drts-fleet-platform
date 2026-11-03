"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  createHtmlMapMarker,
  loadGoogleMaps,
  type HtmlMapMarker,
  type LatLngLiteral,
  type MapsApiLike,
  type MapsMapLike,
} from "../../lib/map/google-maps-loader";

// Taipei City Hall: only used if neither point is known yet.
const DEFAULT_CENTER: LatLngLiteral = { lat: 25.0375, lng: 121.5637 };
// Room for the status badge (top) and the stop label (bottom) of the card.
const FRAME_PADDING = 44;

interface TripMapState {
  maps: MapsApiLike;
  map: MapsMapLike;
  driver: HtmlMapMarker;
  target: HtmlMapMarker;
  /** The passenger moved the map; stop re-framing it on every update. */
  panned: boolean;
}

function point(lat: number | null, lng: number | null): LatLngLiteral | null {
  return lat === null || lng === null ? null : { lat, lng };
}

function frame(
  state: TripMapState,
  driver: LatLngLiteral | null,
  target: LatLngLiteral | null,
) {
  if (state.panned) return;
  if (driver && target) {
    const bounds = new state.maps.LatLngBounds();
    bounds.extend(driver);
    bounds.extend(target);
    state.map.fitBounds(bounds, FRAME_PADDING);
    return;
  }
  const only = driver ?? target;
  if (only) state.map.panTo(only);
}

function markerHost(zIndex: number) {
  const element = document.createElement("div");
  element.style.zIndex = String(zIndex);
  return element;
}

/**
 * Live ride map (port of the referral embed's trip map): the assigned
 * driver's GPS position and the point the ride is heading to (pickup, or the
 * drop-off once on board), fitted to both. The map is created once per key;
 * each location update only moves the markers. The markers are the card's
 * own HTML markers, so they keep the passenger app's look and test hooks.
 */
export function PassengerTripMap({
  browserKey,
  driver,
  target,
  driverMarker,
  targetMarker,
  label,
  visible,
  onReady,
  onUnavailable,
}: {
  browserKey: string;
  driver: LatLngLiteral | null;
  target: LatLngLiteral | null;
  driverMarker: ReactNode;
  targetMarker: ReactNode;
  label: string;
  /** Hidden (but laid out) until the map is ready to replace the schematic. */
  visible: boolean;
  onReady: () => void;
  onUnavailable: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const state = useRef<TripMapState | null>(null);
  const [hosts, setHosts] = useState<{
    driver: HTMLElement;
    target: HTMLElement;
  } | null>(null);
  const driverLat = driver?.lat ?? null;
  const driverLng = driver?.lng ?? null;
  const targetLat = target?.lat ?? null;
  const targetLng = target?.lng ?? null;
  // The map is built asynchronously; it starts from the latest props, not the
  // ones present when loading began.
  const latest = useRef({ driver, target, onReady, onUnavailable });
  useEffect(() => {
    latest.current = { driver, target, onReady, onUnavailable };
  });

  useEffect(() => {
    let active = true;
    let created: TripMapState | null = null;
    loadGoogleMaps(browserKey)
      .then((maps) => {
        if (!active || !container.current) return;
        const current = latest.current;
        const map = new maps.Map(container.current, {
          center: current.driver ?? current.target ?? DEFAULT_CENTER,
          zoom: 15,
          maxZoom: 17,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          keyboardShortcuts: false,
          // The ride page scrolls; one finger keeps scrolling the page.
          gestureHandling: "cooperative",
        });
        const next: TripMapState = {
          maps,
          map,
          driver: createHtmlMapMarker(maps, markerHost(2)),
          target: createHtmlMapMarker(maps, markerHost(1)),
          panned: false,
        };
        next.target.setPosition(current.target);
        next.driver.setPosition(current.driver);
        next.target.setMap(map);
        next.driver.setMap(map);
        map.addListener("dragstart", () => {
          next.panned = true;
        });
        created = next;
        state.current = next;
        frame(next, current.driver, current.target);
        setHosts({ driver: next.driver.element, target: next.target.element });
        current.onReady();
      })
      .catch(() => {
        if (active) latest.current.onUnavailable();
      });
    return () => {
      active = false;
      created?.driver.setMap(null);
      created?.target.setMap(null);
      state.current = null;
    };
  }, [browserKey]);

  useEffect(() => {
    const current = state.current;
    if (!current) return;
    const nextDriver = point(driverLat, driverLng);
    const nextTarget = point(targetLat, targetLng);
    current.driver.setPosition(nextDriver);
    current.target.setPosition(nextTarget);
    frame(current, nextDriver, nextTarget);
  }, [driverLat, driverLng, targetLat, targetLng]);

  return (
    <>
      <div
        ref={container}
        role="region"
        aria-label={label}
        aria-hidden={visible ? undefined : true}
        style={{
          position: "absolute",
          inset: 0,
          visibility: visible ? "visible" : "hidden",
        }}
      />
      {hosts ? createPortal(driverMarker, hosts.driver) : null}
      {hosts ? createPortal(targetMarker, hosts.target) : null}
    </>
  );
}
