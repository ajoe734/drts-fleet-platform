"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { buildEmbedTheme } from "../lib/embed-presentation";
import { useTranslation } from "../lib/i18n";
import {
  googleMapsAuthFailed,
  loadGoogleMaps,
  onGoogleMapsAuthFailure,
  type LatLngLiteral,
  type MapsMapLike,
  type MapsMarkerLike,
} from "../lib/google-maps-loader";

type Theme = ReturnType<typeof buildEmbedTheme>;

export interface ReferralMapConfig {
  enabled: boolean;
  browserKey: string | null;
}

interface Suggestion {
  id: string;
  title: string;
  address: string;
  location: LatLngLiteral | null;
}

// Taipei City Hall: where the map opens before any place is chosen.
const DEFAULT_CENTER: LatLngLiteral = { lat: 25.0375, lng: 121.5637 };
const SEARCH_DELAY_MS = 350;

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error("GEO_FAILED");
  return payload.data as T;
}

async function reverseGeocode(point: LatLngLiteral) {
  const data = await postJson<{ address?: { address?: string } }>(
    "/api/referral/geo/reverse",
    point,
  );
  const address = data.address?.address?.trim();
  if (!address) throw new Error("GEO_FAILED");
  return address;
}

/**
 * Pickup / drop-off field: type to get address suggestions, pick a point on
 * the Google map (when the map is available for this origin), or use the
 * device location. The booking still sends the address text, which the
 * quote resolves server-side as before.
 */
export function ReferralPlaceField({
  theme,
  label,
  name,
  icon,
  value,
  onChange,
  disabled = false,
  allowCurrentLocation = false,
  mapConfig,
}: {
  theme: Theme;
  label: string;
  name: string;
  icon: ReactNode;
  value: string;
  onChange: (address: string) => void;
  disabled?: boolean;
  allowCurrentLocation?: boolean;
  mapConfig: ReferralMapConfig | null;
}) {
  const { t } = useTranslation();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [typing, setTyping] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [point, setPoint] = useState<LatLngLiteral | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [mapFailed, setMapFailed] = useState(googleMapsAuthFailed());
  const selectionSequence = useRef(0);
  const mapAvailable = Boolean(
    mapConfig?.enabled && mapConfig.browserKey && !mapFailed,
  );

  useEffect(() => onGoogleMapsAuthFailure(() => setMapFailed(true)), []);

  useEffect(() => {
    if (disabled) {
      selectionSequence.current += 1;
      setBusy(false);
    }
    return () => {
      selectionSequence.current += 1;
    };
  }, [disabled]);

  // Suggestions only while the rider is typing, never for programmatic fills.
  useEffect(() => {
    if (!typing || value.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: value.trim(), limit: "5" });
      fetch(`/api/referral/geo/search?${params.toString()}`, {
        cache: "no-store",
      })
        .then((response) => response.json())
        .then((payload) => {
          if (!active || !payload?.ok) return;
          const candidates = Array.isArray(payload.data?.candidates)
            ? payload.data.candidates
            : [];
          setSuggestions(
            candidates
              .filter(
                (c: { address?: unknown }) => typeof c.address === "string",
              )
              .slice(0, 5)
              .map(
                (
                  c: {
                    candidateId?: string;
                    displayName?: string;
                    address: string;
                    location?: LatLngLiteral | null;
                  },
                  index: number,
                ) => ({
                  id: c.candidateId ?? `${index}`,
                  title: c.displayName || c.address,
                  address: c.address,
                  location:
                    c.location &&
                    Number.isFinite(c.location.lat) &&
                    Number.isFinite(c.location.lng)
                      ? { lat: c.location.lat, lng: c.location.lng }
                      : null,
                }),
              ),
          );
        })
        .catch(() => {
          if (active) setSuggestions([]);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [typing, value]);

  async function resolvePoint(next: LatLngLiteral, selection: number) {
    setPoint(next);
    setBusy(true);
    setNotice(null);
    try {
      const address = await reverseGeocode(next);
      if (selection !== selectionSequence.current) return;
      setTyping(false);
      onChange(address);
    } catch {
      if (selection === selectionSequence.current)
        setNotice(t("place.noAddress"));
    } finally {
      if (selection === selectionSequence.current) setBusy(false);
    }
  }

  function choosePoint(next: LatLngLiteral) {
    if (disabled) return;
    return resolvePoint(next, ++selectionSequence.current);
  }

  function useCurrentLocation() {
    if (disabled) return;
    const selection = ++selectionSequence.current;
    if (!("geolocation" in navigator)) {
      setNotice(t("place.noGeolocation"));
      return;
    }
    setBusy(true);
    setNotice(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (selection !== selectionSequence.current) return;
        void resolvePoint(
          {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          selection,
        );
      },
      () => {
        if (selection !== selectionSequence.current) return;
        setBusy(false);
        setNotice(t("place.locationDenied"));
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  const buttonStyle = {
    border: `1px solid ${theme.line}`,
    background: theme.surface,
    color: theme.primary,
    borderRadius: 999,
    padding: "5px 11px",
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled || busy ? "default" : "pointer",
  } as const;

  return (
    <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
      <label style={{ display: "grid", gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: 11.5, color: theme.muted, fontWeight: 600 }}>
          {label}
        </span>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            minWidth: 0,
            minHeight: 42,
            borderRadius: 12,
            padding: "0 12px",
            background: theme.surface,
            border: `1px solid ${theme.line}`,
            color: theme.ink2,
          }}
        >
          {icon}
          <input
            aria-label={label}
            name={name}
            value={value}
            onChange={(event) => {
              selectionSequence.current += 1;
              setBusy(false);
              setNotice(null);
              setTyping(true);
              onChange(event.currentTarget.value);
            }}
            disabled={disabled}
            autoComplete="off"
            placeholder={t("place.placeholder")}
            style={{
              flex: 1,
              minWidth: 0,
              border: "none",
              outline: "none",
              background: "transparent",
              color: theme.ink,
              fontFamily: theme.sans,
              fontSize: 14,
              padding: "11px 0",
            }}
          />
        </span>
      </label>
      {suggestions.length > 0 && !disabled ? (
        <ul
          role="listbox"
          aria-label={t("place.suggestions", { label })}
          style={{
            listStyle: "none",
            margin: 0,
            padding: 4,
            borderRadius: 12,
            border: `1px solid ${theme.line}`,
            background: theme.surface,
          }}
        >
          {suggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  selectionSequence.current += 1;
                  setBusy(false);
                  setNotice(null);
                  setTyping(false);
                  setSuggestions([]);
                  if (suggestion.location) setPoint(suggestion.location);
                  onChange(suggestion.address);
                }}
                style={{
                  display: "grid",
                  gap: 2,
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  background: "transparent",
                  padding: "8px 10px",
                  borderRadius: 9,
                  cursor: "pointer",
                }}
              >
                <span
                  style={{ fontSize: 13, fontWeight: 600, color: theme.ink }}
                >
                  {suggestion.title}
                </span>
                {suggestion.title !== suggestion.address ? (
                  <span style={{ fontSize: 11.5, color: theme.muted }}>
                    {suggestion.address}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        {mapAvailable ? (
          <button
            type="button"
            style={buttonStyle}
            disabled={disabled}
            aria-expanded={mapOpen}
            onClick={() => setMapOpen((open) => !open)}
          >
            {mapOpen ? t("place.mapClose") : t("place.mapOpen")}
          </button>
        ) : null}
        {allowCurrentLocation ? (
          <button
            type="button"
            style={buttonStyle}
            disabled={disabled || busy}
            onClick={useCurrentLocation}
          >
            {t("place.currentLocation")}
          </button>
        ) : null}
        {busy ? (
          <span
            style={{ fontSize: 12, color: theme.muted, alignSelf: "center" }}
          >
            {t("place.resolving")}
          </span>
        ) : null}
      </div>
      {mapAvailable && mapOpen && mapConfig?.browserKey ? (
        <PlacePickerMap
          browserKey={mapConfig.browserKey}
          point={point}
          label={t("place.mapLabel", { label })}
          onSelect={(next) => void choosePoint(next)}
          onUnavailable={() => setMapFailed(true)}
        />
      ) : null}
      {notice ? (
        <span role="status" style={{ fontSize: 12, color: theme.dangerFg }}>
          {notice}
        </span>
      ) : null}
    </div>
  );
}

function PlacePickerMap({
  browserKey,
  point,
  label,
  onSelect,
  onUnavailable,
}: {
  browserKey: string;
  point: LatLngLiteral | null;
  label: string;
  onSelect: (point: LatLngLiteral) => void;
  onUnavailable: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapsMapLike | null>(null);
  const marker = useRef<MapsMarkerLike | null>(null);
  // Callbacks change identity on every parent render; keep the latest in refs
  // so the map is created once per key, not once per render.
  const onSelectRef = useRef(onSelect);
  const onUnavailableRef = useRef(onUnavailable);
  const initialPoint = useRef(point);
  useEffect(() => {
    onSelectRef.current = onSelect;
    onUnavailableRef.current = onUnavailable;
  }, [onSelect, onUnavailable]);

  useEffect(() => {
    let active = true;
    loadGoogleMaps(browserKey)
      .then((maps) => {
        if (!active || !container.current) return;
        const center = initialPoint.current ?? DEFAULT_CENTER;
        const created = new maps.Map(container.current, {
          center,
          zoom: 16,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: "greedy",
        });
        const pin = new maps.Marker({
          position: center,
          map: created,
          draggable: true,
        });
        map.current = created;
        marker.current = pin;
        created.addListener("click", (event) => {
          if (!event.latLng) return;
          const next = { lat: event.latLng.lat(), lng: event.latLng.lng() };
          pin.setPosition(next);
          onSelectRef.current(next);
        });
        pin.addListener("dragend", () => {
          const position = pin.getPosition();
          if (position)
            onSelectRef.current({ lat: position.lat(), lng: position.lng() });
        });
      })
      .catch(() => {
        if (active) onUnavailableRef.current();
      });
    return () => {
      active = false;
      map.current = null;
      marker.current = null;
    };
  }, [browserKey]);

  useEffect(() => {
    if (!point) return;
    marker.current?.setPosition(point);
    map.current?.panTo(point);
  }, [point]);

  return (
    <div
      ref={container}
      role="application"
      aria-label={label}
      style={{
        width: "100%",
        height: 220,
        borderRadius: 12,
        overflow: "hidden",
        background: "#E5E9F1",
      }}
    />
  );
}
