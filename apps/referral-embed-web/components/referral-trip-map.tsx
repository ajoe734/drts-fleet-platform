"use client";

import { useEffect, useRef } from "react";
import {
  loadGoogleMaps,
  type LatLngLiteral,
  type MapsApiLike,
  type MapsMapLike,
  type MapsMarkerLabel,
  type MapsMarkerLike,
} from "../lib/google-maps-loader";

// Taipei City Hall: only used if neither point is known yet.
const DEFAULT_CENTER: LatLngLiteral = { lat: 25.0375, lng: 121.5637 };

interface TripMapState {
  maps: MapsApiLike;
  map: MapsMapLike;
  vehicle: MapsMarkerLike;
  target: MapsMarkerLike;
  /** The rider moved the map; stop re-framing it on every poll. */
  panned: boolean;
}

function markerLabel(text: string): MapsMarkerLabel {
  return { text, color: "#FFFFFF", fontSize: "11px", fontWeight: "700" };
}

function frame(
  state: TripMapState,
  vehicle: LatLngLiteral | null,
  target: LatLngLiteral | null,
) {
  if (state.panned) return;
  if (vehicle && target) {
    const bounds = new state.maps.LatLngBounds();
    bounds.extend(vehicle);
    bounds.extend(target);
    state.map.fitBounds(bounds, 48);
    return;
  }
  const only = vehicle ?? target;
  if (only) state.map.panTo(only);
}

/**
 * Live trip map: the assigned vehicle and the point it is heading to (the
 * pickup, or the destination once on board). The map is created once per key;
 * each poll only moves the markers.
 */
export function ReferralTripMap({
  browserKey,
  vehicle,
  target,
  vehicleLabel,
  targetLabel,
  vehicleColor,
  label,
  onUnavailable,
}: {
  browserKey: string;
  vehicle: LatLngLiteral | null;
  target: LatLngLiteral | null;
  vehicleLabel: string;
  targetLabel: string;
  vehicleColor: string;
  label: string;
  onUnavailable: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const state = useRef<TripMapState | null>(null);
  // The map is built asynchronously; it starts from the latest props, not the
  // ones present when loading began.
  const latest = useRef({
    vehicle,
    target,
    vehicleLabel,
    targetLabel,
    vehicleColor,
    onUnavailable,
  });
  useEffect(() => {
    latest.current = {
      vehicle,
      target,
      vehicleLabel,
      targetLabel,
      vehicleColor,
      onUnavailable,
    };
  });

  useEffect(() => {
    let active = true;
    loadGoogleMaps(browserKey)
      .then((maps) => {
        if (!active || !container.current) return;
        const current = latest.current;
        const center = current.vehicle ?? current.target ?? DEFAULT_CENTER;
        const map = new maps.Map(container.current, {
          center,
          zoom: 15,
          maxZoom: 17,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          // The embed page scrolls; one finger keeps scrolling the page.
          gestureHandling: "cooperative",
        });
        const created: TripMapState = {
          maps,
          map,
          vehicle: new maps.Marker({
            map,
            position: current.vehicle ?? center,
            visible: Boolean(current.vehicle),
            zIndex: 2,
            label: markerLabel(current.vehicleLabel),
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: 13,
              fillColor: current.vehicleColor,
              fillOpacity: 1,
              strokeColor: "#FFFFFF",
              strokeWeight: 3,
            },
          }),
          target: new maps.Marker({
            map,
            position: current.target ?? center,
            visible: Boolean(current.target),
            zIndex: 1,
            label: markerLabel(current.targetLabel),
          }),
          panned: false,
        };
        map.addListener("dragstart", () => {
          created.panned = true;
        });
        state.current = created;
        frame(created, current.vehicle, current.target);
      })
      .catch(() => {
        if (active) latest.current.onUnavailable();
      });
    return () => {
      active = false;
      state.current = null;
    };
  }, [browserKey]);

  useEffect(() => {
    const current = state.current;
    if (!current) return;
    if (vehicle) current.vehicle.setPosition(vehicle);
    current.vehicle.setVisible(Boolean(vehicle));
    if (target) current.target.setPosition(target);
    current.target.setVisible(Boolean(target));
    current.target.setLabel(markerLabel(targetLabel));
    frame(current, vehicle, target);
  }, [vehicle, target, targetLabel]);

  return (
    <div
      ref={container}
      role="region"
      aria-label={label}
      style={{
        width: "100%",
        height: 210,
        borderRadius: 12,
        overflow: "hidden",
        background: "#E5E9F1",
      }}
    />
  );
}
