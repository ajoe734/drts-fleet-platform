"use client";

import { useEffect, useRef } from "react";
import type { AddressMapRendererProps, CanvasTheme } from "@drts/ui-web";
import {
  loadGoogleMaps,
  type LatLngLiteral,
  type MapsMapLike,
  type MapsMarkerLike,
} from "../../lib/map/google-maps-loader";

// The address picker's own default area, used before any point is chosen.
const DEFAULT_CENTER: LatLngLiteral = { lat: 25.05, lng: 121.525 };
const OVERVIEW_ZOOM = 12;
const POINT_ZOOM = 16;

/**
 * Google map for the shared address picker's map slot (ported from the
 * referral embed's place picker): it shows the chosen point, and a tap on the
 * map or dragging the pin hands the new point back to the picker, which keeps
 * its own selection, reverse-geocoding and validation rules.
 */
export function BookingPlaceMap({
  id,
  point,
  label,
  onPointSelect,
  browserKey,
  theme,
  onUnavailable,
}: AddressMapRendererProps & {
  browserKey: string;
  theme: CanvasTheme;
  onUnavailable: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapsMapLike | null>(null);
  const marker = useRef<MapsMarkerLike | null>(null);
  const zoomedIn = useRef(false);
  const lat = point?.lat ?? null;
  const lng = point?.lng ?? null;
  // Callbacks change identity on every parent render; keep the latest in refs
  // so the map is created once per key, not once per render.
  const latest = useRef({ lat, lng, onPointSelect, onUnavailable });
  useEffect(() => {
    latest.current = { lat, lng, onPointSelect, onUnavailable };
  });

  useEffect(() => {
    let active = true;
    let pin: MapsMarkerLike | null = null;
    loadGoogleMaps(browserKey)
      .then((maps) => {
        if (!active || !container.current) return;
        const current = latest.current;
        const initial =
          current.lat === null || current.lng === null
            ? null
            : { lat: current.lat, lng: current.lng };
        const created = new maps.Map(container.current, {
          center: initial ?? DEFAULT_CENTER,
          zoom: initial ? POINT_ZOOM : OVERVIEW_ZOOM,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          // The booking form scrolls; one finger keeps scrolling the page.
          gestureHandling: "cooperative",
        });
        pin = new maps.Marker({
          map: created,
          position: initial ?? DEFAULT_CENTER,
          visible: Boolean(initial),
          draggable: true,
        });
        const placed = pin;
        zoomedIn.current = Boolean(initial);
        map.current = created;
        marker.current = placed;
        created.addListener("click", (event) => {
          if (!event.latLng) return;
          const next = { lat: event.latLng.lat(), lng: event.latLng.lng() };
          placed.setPosition(next);
          placed.setVisible(true);
          latest.current.onPointSelect(next);
        });
        placed.addListener("dragend", () => {
          const position = placed.getPosition();
          if (position)
            latest.current.onPointSelect({
              lat: position.lat(),
              lng: position.lng(),
            });
        });
      })
      .catch(() => {
        if (active) latest.current.onUnavailable();
      });
    return () => {
      active = false;
      pin?.setMap(null);
      map.current = null;
      marker.current = null;
    };
  }, [browserKey]);

  useEffect(() => {
    const current = map.current;
    const pin = marker.current;
    if (!current || !pin) return;
    if (lat === null || lng === null) {
      pin.setVisible(false);
      return;
    }
    const next = { lat, lng };
    pin.setPosition(next);
    pin.setVisible(true);
    current.panTo(next);
    if (!zoomedIn.current) {
      current.setZoom(POINT_ZOOM);
      zoomedIn.current = true;
    }
  }, [lat, lng]);

  return (
    <div
      style={{
        position: "relative",
        height: 220,
        borderRadius: 10,
        overflow: "hidden",
        border: `1px solid ${theme.border}`,
        background: theme.surfaceLo,
      }}
    >
      <div
        id={id}
        ref={container}
        role="application"
        aria-label={label}
        style={{ position: "absolute", inset: 0 }}
      />
      {point ? null : (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: "50%",
            transform: "translateX(-50%)",
            maxWidth: "calc(100% - 24px)",
            padding: "4px 10px",
            borderRadius: 999,
            background: theme.surface,
            color: theme.textMuted,
            fontSize: 12,
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}
