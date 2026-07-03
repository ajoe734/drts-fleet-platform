"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { CanvasIcon } from "./canvas-primitives";
import { buildCanvasTheme, type CanvasTheme } from "./canvas-tokens";
import {
  addressToGeoPoint,
  AddressProviderUnavailableError,
  buildServiceAreaPreviewCommand,
  candidateToAddressPayload,
  confidenceTone,
  deriveProviderState,
  derivePickerStatus,
  isDispatchReadyAddress,
  isValidLatitude,
  isValidLongitude,
  manualCoordinateToAddressPayload,
  resolveAddressPickerLabels,
  serviceabilityTone,
  type AddressMapPickerChange,
  type AddressMapPickerLabels,
  type AddressMapPickerProvider,
  type AddressPayload,
  type AddressPickerTone,
  type AddressProviderHealth,
  type AddressProviderState,
  type GeocodeCandidate,
  type GeoPoint,
  type GeoResolutionSurface,
  type ServiceAreaEvaluationResult,
} from "./address-map-picker-core";

export type {
  AddressMapPickerChange,
  AddressMapPickerLabels,
  AddressMapPickerProvider,
} from "./address-map-picker-core";

const DEFAULT_THEME = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

const DEFAULT_BOUNDS: MapBounds = {
  minLat: 24.95,
  maxLat: 25.15,
  minLng: 121.4,
  maxLng: 121.65,
};

const STAGE_W = 100;
const STAGE_H = 100;

function toneColor(theme: CanvasTheme, tone: AddressPickerTone): string {
  switch (tone) {
    case "success":
      return theme.success;
    case "warn":
      return theme.warn;
    case "danger":
      return theme.danger;
    case "info":
      return theme.info;
    case "neutral":
    default:
      return theme.accent;
  }
}

function project(point: GeoPoint, bounds: MapBounds): { x: number; y: number } {
  const lngSpan = bounds.maxLng - bounds.minLng || 1;
  const latSpan = bounds.maxLat - bounds.minLat || 1;
  const x = ((point.lng - bounds.minLng) / lngSpan) * STAGE_W;
  const y = ((bounds.maxLat - point.lat) / latSpan) * STAGE_H;
  return {
    x: Math.min(STAGE_W, Math.max(0, x)),
    y: Math.min(STAGE_H, Math.max(0, y)),
  };
}

function unproject(x: number, y: number, bounds: MapBounds): GeoPoint {
  const lngSpan = bounds.maxLng - bounds.minLng || 1;
  const latSpan = bounds.maxLat - bounds.minLat || 1;
  const clampedX = Math.min(1, Math.max(0, x));
  const clampedY = Math.min(1, Math.max(0, y));
  return {
    lng: bounds.minLng + clampedX * lngSpan,
    lat: bounds.maxLat - clampedY * latSpan,
  };
}

function roundCoord(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

// ── Preview surface ──

export interface AddressMapPin {
  id: string;
  point: GeoPoint;
  tone?: AddressPickerTone;
  label?: string;
  draggable?: boolean;
}

export interface AddressMapPreviewSurfaceProps {
  theme?: CanvasTheme;
  pins: AddressMapPin[];
  bounds?: MapBounds;
  height?: number;
  emptyLabel?: string;
  caption?: ReactNode;
  ariaLabel?: string;
  nudgeHint?: string;
  onPinMove?: (id: string, point: GeoPoint) => void;
}

/**
 * Lightweight, provider-neutral map preview. Renders pins on a projected grid
 * (no external tiles, so it is safe for CI/SSR and provider outages) and lets a
 * draggable pin be repositioned by pointer drag or keyboard arrow keys.
 */
export function AddressMapPreviewSurface({
  theme: themeProp,
  pins,
  bounds = DEFAULT_BOUNDS,
  height = 220,
  emptyLabel = "No location selected yet.",
  caption,
  ariaLabel = "Location preview map",
  nudgeHint,
  onPinMove,
}: AddressMapPreviewSurfaceProps) {
  const theme = themeProp ?? DEFAULT_THEME;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const pointFromEvent = useCallback(
    (clientX: number, clientY: number): GeoPoint | null => {
      const svg = svgRef.current;
      if (!svg) {
        return null;
      }
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return null;
      }
      const rx = (clientX - rect.left) / rect.width;
      const ry = (clientY - rect.top) / rect.height;
      const next = unproject(rx, ry, bounds);
      return { lat: roundCoord(next.lat), lng: roundCoord(next.lng) };
    },
    [bounds],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!dragId || !onPinMove) {
        return;
      }
      const next = pointFromEvent(event.clientX, event.clientY);
      if (next) {
        onPinMove(dragId, next);
      }
    },
    [dragId, onPinMove, pointFromEvent],
  );

  const endDrag = useCallback(() => setDragId(null), []);

  const nudge = useCallback(
    (pin: AddressMapPin, dLat: number, dLng: number) => {
      if (!onPinMove) {
        return;
      }
      onPinMove(pin.id, {
        lat: roundCoord(pin.point.lat + dLat),
        lng: roundCoord(pin.point.lng + dLng),
      });
    },
    [onPinMove],
  );

  const stepLat = (bounds.maxLat - bounds.minLat) / 60 || 0.001;
  const stepLng = (bounds.maxLng - bounds.minLng) / 60 || 0.001;

  const hasPins = pins.length > 0;

  return (
    <div
      style={{
        position: "relative",
        height,
        borderRadius: 10,
        overflow: "hidden",
        border: `1px solid ${theme.border}`,
        background: theme.surfaceLo,
      }}
    >
      <svg
        ref={svgRef}
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        {/* grid */}
        {[20, 40, 60, 80].map((g) => (
          <g
            key={`grid-${g}`}
            stroke={theme.border}
            strokeWidth={0.3}
            opacity={0.5}
          >
            <line x1={g} y1={0} x2={g} y2={STAGE_H} />
            <line x1={0} y1={g} x2={STAGE_W} y2={g} />
          </g>
        ))}
        {pins.map((pin) => {
          const { x, y } = project(pin.point, bounds);
          const color = toneColor(theme, pin.tone ?? "neutral");
          return (
            <g
              key={pin.id}
              transform={`translate(${x} ${y})`}
              role={pin.draggable ? "button" : undefined}
              aria-label={
                pin.draggable
                  ? `${pin.label ?? "Location pin"}. ${nudgeHint ?? "Use arrow keys to adjust."}`
                  : pin.label
              }
              tabIndex={pin.draggable ? 0 : undefined}
              style={{
                cursor: pin.draggable ? "grab" : "default",
                outline: "none",
              }}
              onPointerDown={
                pin.draggable
                  ? (event) => {
                      event.preventDefault();
                      setDragId(pin.id);
                    }
                  : undefined
              }
              onKeyDown={
                pin.draggable
                  ? (event) => {
                      const big = event.shiftKey ? 4 : 1;
                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        nudge(pin, stepLat * big, 0);
                      } else if (event.key === "ArrowDown") {
                        event.preventDefault();
                        nudge(pin, -stepLat * big, 0);
                      } else if (event.key === "ArrowLeft") {
                        event.preventDefault();
                        nudge(pin, 0, -stepLng * big);
                      } else if (event.key === "ArrowRight") {
                        event.preventDefault();
                        nudge(pin, 0, stepLng * big);
                      }
                    }
                  : undefined
              }
            >
              <circle
                r={3.4}
                fill={color}
                stroke={theme.surface}
                strokeWidth={1}
              />
              <circle r={7} fill={color} opacity={0.18} />
            </g>
          );
        })}
      </svg>
      {!hasPins ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            textAlign: "center",
            color: theme.textMuted,
            fontSize: 12,
          }}
        >
          {emptyLabel}
        </div>
      ) : null}
      {caption ? (
        <div
          style={{
            position: "absolute",
            bottom: 10,
            left: 10,
            fontSize: 10.5,
            color: theme.textMuted,
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            padding: "3px 8px",
            borderRadius: 6,
          }}
        >
          {caption}
        </div>
      ) : null}
    </div>
  );
}

// ── Small styled helpers (interactive; canvas Input/Select are display-only) ──

function fieldLabelStyle(theme: CanvasTheme): CSSProperties {
  return {
    display: "block",
    fontSize: 11.5,
    fontWeight: 600,
    color: theme.text,
    marginBottom: 5,
  };
}

function inputStyle(theme: CanvasTheme): CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    background: theme.bgRaised,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 12.5,
    color: theme.text,
    fontFamily: theme.fontFamily,
  };
}

function buttonStyle(
  theme: CanvasTheme,
  variant: "primary" | "secondary" | "ghost" = "secondary",
  disabled = false,
): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    fontFamily: theme.fontFamily,
  };
  if (variant === "primary") {
    return {
      ...base,
      background: theme.accent,
      color: theme.invert,
      border: `1px solid ${theme.accent}`,
    };
  }
  if (variant === "ghost") {
    return {
      ...base,
      background: "transparent",
      color: theme.text,
      border: "1px solid transparent",
    };
  }
  return {
    ...base,
    background: theme.surface,
    color: theme.text,
    border: `1px solid ${theme.border}`,
  };
}

function StatusBanner({
  theme,
  tone,
  icon,
  title,
  body,
  action,
}: {
  theme: CanvasTheme;
  tone: AddressPickerTone;
  icon: Parameters<typeof CanvasIcon>[0]["name"];
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
}) {
  const color = toneColor(theme, tone);
  const bg =
    tone === "danger"
      ? theme.dangerBg
      : tone === "warn"
        ? theme.warnBg
        : tone === "success"
          ? theme.successBg
          : tone === "info"
            ? theme.infoBg
            : theme.neutralBg;
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "10px 12px",
        background: bg,
        border: `1px solid ${color}`,
        borderRadius: 8,
      }}
    >
      <CanvasIcon name={icon} size={16} style={{ color, marginTop: 1 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: theme.text }}>
          {title}
        </div>
        {body ? (
          <div
            style={{
              fontSize: 11.5,
              color: theme.textMuted,
              marginTop: 2,
              lineHeight: 1.4,
            }}
          >
            {body}
          </div>
        ) : null}
        {action ? <div style={{ marginTop: 8 }}>{action}</div> : null}
      </div>
    </div>
  );
}

function TonePill({
  theme,
  tone,
  children,
}: {
  theme: CanvasTheme;
  tone: AddressPickerTone;
  children: ReactNode;
}) {
  const color = toneColor(theme, tone);
  const bg =
    tone === "danger"
      ? theme.dangerBg
      : tone === "warn"
        ? theme.warnBg
        : tone === "success"
          ? theme.successBg
          : tone === "info"
            ? theme.infoBg
            : theme.neutralBg;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 9px",
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 600,
        color,
        background: bg,
        border: `1px solid ${color}`,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: color,
          display: "inline-block",
        }}
      />
      {children}
    </span>
  );
}

// ── AddressMapPicker ──

export interface AddressMapPickerProps<
  TServiceProduct extends string = string,
> {
  /** Provider seam; inject the mock provider in CI/tests. */
  provider: AddressMapPickerProvider;
  /** Surface tag written into coordinate provenance. */
  surface: GeoResolutionSurface;
  theme?: CanvasTheme;
  labels?: Partial<AddressMapPickerLabels>;
  /** Controlled selected address; omit for uncontrolled use. */
  value?: AddressPayload | null;
  defaultValue?: AddressPayload | null;
  onChange?: (change: AddressMapPickerChange) => void;
  actorId?: string | null;
  locale?: string;
  searchLimit?: number;
  bounds?: MapBounds;
  title?: ReactNode;
  /** Enable the service-area preview under the map. */
  serviceProductType?: TServiceProduct;
  enableServiceabilityPreview?: boolean;
  /** Optionally provide a pre-fetched health snapshot instead of calling getHealth. */
  providerHealth?: AddressProviderHealth | null;
  /** Require a manual-override reason before a manual pin is accepted (default true). */
  requireManualReason?: boolean;
  id?: string;
}

interface SelectionState {
  address: AddressPayload;
  manualReason: string;
}

export function AddressMapPicker<TServiceProduct extends string = string>(
  props: AddressMapPickerProps<TServiceProduct>,
) {
  const {
    provider,
    surface,
    theme: themeProp,
    value,
    defaultValue = null,
    onChange,
    actorId = null,
    locale,
    searchLimit = 6,
    bounds,
    title,
    serviceProductType,
    enableServiceabilityPreview = true,
    providerHealth,
    requireManualReason = true,
  } = props;

  const theme = themeProp ?? DEFAULT_THEME;
  const labels = useMemo(
    () => resolveAddressPickerLabels(props.labels),
    [props.labels],
  );
  const reactId = useId();
  const domId = props.id ?? reactId;

  const controlled = value !== undefined;
  const [selection, setSelection] = useState<SelectionState | null>(() =>
    (controlled ? value : defaultValue)
      ? {
          address: (controlled ? value : defaultValue) as AddressPayload,
          manualReason: "",
        }
      : null,
  );
  const selectedAddress = controlled
    ? (value ?? null)
    : (selection?.address ?? null);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchAttempted, setSearchAttempted] = useState(false);
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [manualMode, setManualMode] = useState(false);
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  const [providerState, setProviderState] = useState<AddressProviderState>(() =>
    deriveProviderState(providerHealth ?? null),
  );
  const [serviceability, setServiceability] =
    useState<ServiceAreaEvaluationResult | null>(null);
  const [serviceabilityPending, setServiceabilityPending] = useState(false);

  // Provider health probe (only when no snapshot was supplied).
  useEffect(() => {
    if (providerHealth !== undefined && providerHealth !== null) {
      setProviderState(deriveProviderState(providerHealth));
      return;
    }
    if (!provider.getHealth) {
      return;
    }
    let cancelled = false;
    provider
      .getHealth()
      .then((health) => {
        if (!cancelled) {
          setProviderState(deriveProviderState(health));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProviderState({
            available: false,
            degraded: true,
            reasonCode: "request_failed",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [provider, providerHealth]);

  const applySelection = useCallback(
    (address: AddressPayload | null, reason: string) => {
      if (!controlled) {
        setSelection(address ? { address, manualReason: reason } : null);
      }
    },
    [controlled],
  );

  const runServiceability = useCallback(
    (address: AddressPayload | null) => {
      const pickup = addressToGeoPoint(address);
      if (
        !enableServiceabilityPreview ||
        !serviceProductType ||
        !provider.evaluateServiceArea ||
        !pickup
      ) {
        setServiceability(null);
        setServiceabilityPending(false);
        return;
      }
      const command = buildServiceAreaPreviewCommand({
        serviceProductType,
        pickup,
      });
      if (!command) {
        setServiceability(null);
        return;
      }
      setServiceabilityPending(true);
      provider
        .evaluateServiceArea(command)
        .then((result) => {
          setServiceability(result);
          setServiceabilityPending(false);
        })
        .catch(() => {
          setServiceability(null);
          setServiceabilityPending(false);
        });
    },
    [enableServiceabilityPreview, provider, serviceProductType],
  );

  const handleSearch = useCallback(async () => {
    if (!query.trim()) {
      return;
    }
    setSearching(true);
    setSearchError(null);
    setSearchAttempted(true);
    try {
      const response = await provider.search({
        q: query.trim(),
        limit: searchLimit,
        surface,
        ...(locale ? { locale } : {}),
        requestedByActorId: actorId,
      });
      setCandidates(response.candidates);
      setProviderState((prev) =>
        response.degraded ? { ...prev, degraded: true } : prev,
      );
    } catch (error) {
      setCandidates([]);
      if (error instanceof AddressProviderUnavailableError) {
        setProviderState({
          available: false,
          degraded: true,
          reasonCode: "provider_unhealthy",
        });
        setManualMode(true);
      } else {
        setSearchError(
          error instanceof Error ? error.message : "Address search failed.",
        );
        setProviderState((prev) => ({ ...prev, reasonCode: "request_failed" }));
      }
    } finally {
      setSearching(false);
    }
  }, [actorId, locale, provider, query, searchLimit, surface]);

  const handleSelectCandidate = useCallback(
    (candidate: GeocodeCandidate) => {
      const address = candidateToAddressPayload(candidate, {
        surface,
        selectedByActorId: actorId,
      });
      if (!address) {
        // No coordinates on this candidate — steer the user to manual entry.
        setManualMode(true);
        setManualError(labels.manualInvalid);
        return;
      }
      applySelection(address, "");
      runServiceability(address);
    },
    [actorId, applySelection, labels.manualInvalid, runServiceability, surface],
  );

  const handleManualApply = useCallback(() => {
    const lat = Number.parseFloat(manualLat);
    const lng = Number.parseFloat(manualLng);
    if (!isValidLatitude(lat) || !isValidLongitude(lng)) {
      setManualError(labels.manualInvalid);
      return;
    }
    if (requireManualReason && manualReason.trim().length === 0) {
      setManualError(labels.manualReasonLabel);
      return;
    }
    const reason = manualReason.trim() || labels.pinAdjustHint;
    const address = manualCoordinateToAddressPayload({
      lat,
      lng,
      addressText:
        query.trim() ||
        selectedAddress?.address ||
        `Manual location (${roundCoord(lat)}, ${roundCoord(lng)})`,
      baseAddress: selectedAddress,
      addressName: selectedAddress?.addressName ?? null,
      surface,
      manualOverrideReason: reason,
      pinnedByActorId: actorId,
      ...(selectedAddress?.geocodeConfidence
        ? { geocodeConfidence: selectedAddress.geocodeConfidence }
        : {}),
    });
    if (!address) {
      setManualError(labels.manualInvalid);
      return;
    }
    setManualError(null);
    applySelection(address, reason);
    runServiceability(address);
  }, [
    actorId,
    applySelection,
    labels.manualInvalid,
    labels.manualReasonLabel,
    labels.pinAdjustHint,
    manualLat,
    manualLng,
    manualReason,
    query,
    requireManualReason,
    runServiceability,
    selectedAddress?.address,
    surface,
  ]);

  const handlePinMove = useCallback(
    (_id: string, point: GeoPoint) => {
      const reason =
        selection?.manualReason?.trim() ||
        selectedAddress?.manualOverrideReason ||
        labels.pinAdjustHint;
      const address = manualCoordinateToAddressPayload({
        lat: point.lat,
        lng: point.lng,
        addressText: selectedAddress?.address ?? labels.manualTitle,
        baseAddress: selectedAddress,
        addressName: selectedAddress?.addressName ?? null,
        surface,
        manualOverrideReason: reason,
        pinnedByActorId: actorId,
        ...(selectedAddress?.geocodeConfidence
          ? { geocodeConfidence: selectedAddress.geocodeConfidence }
          : {}),
      });
      if (!address) {
        return;
      }
      applySelection(address, reason);
      runServiceability(address);
    },
    [
      actorId,
      applySelection,
      labels.manualTitle,
      labels.pinAdjustHint,
      runServiceability,
      selectedAddress,
      selection?.manualReason,
      surface,
    ],
  );

  const handleClear = useCallback(() => {
    applySelection(null, "");
    setServiceability(null);
    setManualError(null);
  }, [applySelection]);

  const providerAvailable = providerState.available;
  const status = derivePickerStatus({
    providerAvailable,
    isSearching: searching,
    manualMode,
    searchAttempted,
    candidateCount: candidates.length,
    hasSelection: Boolean(selectedAddress),
  });

  const dispatchReady = isDispatchReadyAddress(selectedAddress);

  // Emit change snapshot.
  const lastChangeRef = useRef<string>("");
  useEffect(() => {
    if (!onChange) {
      return;
    }
    const change: AddressMapPickerChange = {
      status,
      address: selectedAddress,
      dispatchReady,
      serviceability,
      providerState,
    };
    const signature = JSON.stringify({
      status,
      address: selectedAddress,
      serviceability: serviceability?.decision ?? null,
      provider: providerState.reasonCode,
    });
    if (signature !== lastChangeRef.current) {
      lastChangeRef.current = signature;
      onChange(change);
    }
  }, [
    dispatchReady,
    onChange,
    providerState,
    selectedAddress,
    serviceability,
    status,
  ]);

  const pinPoint = addressToGeoPoint(selectedAddress);
  const decision = serviceability?.decision ?? null;
  const pinTone: AddressPickerTone = decision
    ? serviceabilityTone(decision)
    : selectedAddress
      ? confidenceTone(selectedAddress.geocodeConfidence ?? null)
      : "neutral";

  const liveMessage = buildLiveMessage(
    status,
    candidates.length,
    decision,
    labels,
  );

  return (
    <div
      id={domId}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        fontFamily: theme.fontFamily,
        color: theme.text,
      }}
    >
      {title ? (
        <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
      ) : null}

      <div aria-live="polite" style={visuallyHidden}>
        {liveMessage}
      </div>

      {/* Provider outage */}
      {status === "provider_unavailable" ||
      (!providerAvailable && !manualMode) ? (
        <StatusBanner
          theme={theme}
          tone="danger"
          icon="warn"
          title={labels.providerOutageTitle}
          body={labels.providerOutageBody}
          action={
            <button
              type="button"
              style={buttonStyle(theme, "secondary")}
              onClick={() => setManualMode(true)}
            >
              {labels.manualToggle}
            </button>
          }
        />
      ) : null}

      {providerState.degraded && providerAvailable ? (
        <StatusBanner
          theme={theme}
          tone="warn"
          icon="warn"
          title={labels.degradedNote}
        />
      ) : null}

      {/* Search */}
      <div>
        <label htmlFor={`${domId}-search`} style={fieldLabelStyle(theme)}>
          {labels.searchLabel}
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            id={`${domId}-search`}
            type="text"
            value={query}
            placeholder={labels.searchPlaceholder}
            aria-label={labels.searchLabel}
            style={inputStyle(theme)}
            disabled={!providerAvailable}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleSearch();
              }
            }}
          />
          <button
            type="button"
            style={buttonStyle(
              theme,
              "primary",
              !providerAvailable || searching,
            )}
            disabled={!providerAvailable || searching}
            onClick={() => void handleSearch()}
          >
            <CanvasIcon name="search" size={14} />
            {searching ? labels.searching : labels.searchButton}
          </button>
        </div>
        {searchError ? (
          <div style={{ marginTop: 6, fontSize: 11.5, color: theme.danger }}>
            {searchError}
          </div>
        ) : null}
      </div>

      {/* Candidates */}
      {status === "candidates" && candidates.length > 0 ? (
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: theme.textMuted,
              marginBottom: 6,
            }}
          >
            {labels.candidatesTitle}
          </div>
          <ul
            role="listbox"
            aria-label={labels.candidatesTitle}
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {candidates.map((candidate) => {
              const isSelected =
                selectedAddress?.providerCandidateId ===
                (candidate.providerCandidateId ?? candidate.candidateId);
              return (
                <li
                  key={candidate.candidateId}
                  role="option"
                  aria-selected={isSelected}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectCandidate(candidate)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "center",
                      background: isSelected ? theme.rowSelect : theme.surface,
                      border: `1px solid ${isSelected ? theme.accent : theme.border}`,
                      borderRadius: 8,
                      padding: "8px 10px",
                      cursor: "pointer",
                      color: theme.text,
                      fontFamily: theme.fontFamily,
                    }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span
                        style={{
                          display: "block",
                          fontSize: 12.5,
                          fontWeight: 600,
                        }}
                      >
                        {candidate.displayName}
                      </span>
                      <span
                        style={{
                          display: "block",
                          fontSize: 11,
                          color: theme.textMuted,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {candidate.address}
                      </span>
                    </span>
                    <TonePill
                      theme={theme}
                      tone={confidenceTone(candidate.confidence)}
                    >
                      {candidate.confidence}
                    </TonePill>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* No match */}
      {status === "no_match" ? (
        <StatusBanner
          theme={theme}
          tone="warn"
          icon="warn"
          title={labels.noMatchTitle}
          body={labels.noMatchBody}
          action={
            <button
              type="button"
              style={buttonStyle(theme, "secondary")}
              onClick={() => setManualMode(true)}
            >
              {labels.manualToggle}
            </button>
          }
        />
      ) : null}

      {/* Map preview */}
      <AddressMapPreviewSurface
        theme={theme}
        {...(bounds ? { bounds } : {})}
        emptyLabel={labels.mapEmpty}
        nudgeHint={labels.mapHint}
        caption={
          pinPoint
            ? `${roundCoord(pinPoint.lat)}, ${roundCoord(pinPoint.lng)}`
            : undefined
        }
        onPinMove={handlePinMove}
        pins={
          pinPoint
            ? [
                {
                  id: "primary",
                  point: pinPoint,
                  tone: pinTone,
                  label: selectedAddress?.address ?? "Selected location",
                  draggable: true,
                },
              ]
            : []
        }
      />

      {/* Selection detail */}
      {selectedAddress ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            padding: 12,
            background: theme.surfaceLo,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                {selectedAddress.addressName ?? selectedAddress.address}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: theme.textMuted,
                  overflowWrap: "anywhere",
                }}
              >
                {selectedAddress.address}
              </div>
            </div>
            <button
              type="button"
              style={buttonStyle(theme, "ghost")}
              onClick={handleClear}
            >
              {labels.clearSelection}
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <TonePill
              theme={theme}
              tone={confidenceTone(selectedAddress.geocodeConfidence ?? null)}
            >
              {labels.confidenceLabel}:{" "}
              {selectedAddress.geocodeConfidence ?? "unknown"}
            </TonePill>
            <TonePill theme={theme} tone="neutral">
              {labels.provenanceLabel}:{" "}
              {selectedAddress.coordinateSource ?? "unknown"}
            </TonePill>
            {pinPoint ? (
              <span
                style={{
                  fontSize: 11,
                  color: theme.textMuted,
                  fontFamily: theme.monoFamily,
                }}
              >
                {labels.coordinatesLabel}: {roundCoord(pinPoint.lat)},{" "}
                {roundCoord(pinPoint.lng)}
              </span>
            ) : null}
          </div>
          <div style={{ fontSize: 10.5, color: theme.textMuted }}>
            {labels.mapHint}
          </div>
        </div>
      ) : null}

      {/* Serviceability preview */}
      {enableServiceabilityPreview && serviceProductType && selectedAddress ? (
        serviceabilityPending ? (
          <StatusBanner
            theme={theme}
            tone="info"
            icon="clock"
            title={labels.serviceabilityPending}
          />
        ) : decision ? (
          <StatusBanner
            theme={theme}
            tone={serviceabilityTone(decision)}
            icon={decision === "serviceable" ? "ok" : "warn"}
            title={
              decision === "serviceable"
                ? labels.serviceableTitle
                : decision === "manual_review"
                  ? labels.manualReviewTitle
                  : labels.notServiceableTitle
            }
            body={serviceability?.reasonMessages?.join(" ") || undefined}
          />
        ) : null
      ) : null}

      {/* Manual entry */}
      {manualMode || status === "manual_entry" ? (
        <div
          style={{
            border: `1px dashed ${theme.border}`,
            borderRadius: 8,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            background: theme.surface,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700 }}>
            {labels.manualTitle}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label style={{ flex: "1 1 120px" }}>
              <span style={fieldLabelStyle(theme)}>
                {labels.manualLatLabel}
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={manualLat}
                aria-label={labels.manualLatLabel}
                style={inputStyle(theme)}
                onChange={(event) => setManualLat(event.target.value)}
              />
            </label>
            <label style={{ flex: "1 1 120px" }}>
              <span style={fieldLabelStyle(theme)}>
                {labels.manualLngLabel}
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={manualLng}
                aria-label={labels.manualLngLabel}
                style={inputStyle(theme)}
                onChange={(event) => setManualLng(event.target.value)}
              />
            </label>
          </div>
          {requireManualReason ? (
            <label style={{ display: "block" }}>
              <span style={fieldLabelStyle(theme)}>
                {labels.manualReasonLabel}
              </span>
              <input
                type="text"
                value={manualReason}
                placeholder={labels.manualReasonPlaceholder}
                aria-label={labels.manualReasonLabel}
                style={inputStyle(theme)}
                onChange={(event) => setManualReason(event.target.value)}
              />
            </label>
          ) : null}
          {manualError ? (
            <div style={{ fontSize: 11.5, color: theme.danger }}>
              {manualError}
            </div>
          ) : null}
          <div>
            <button
              type="button"
              style={buttonStyle(theme, "primary")}
              onClick={handleManualApply}
            >
              <CanvasIcon name="pin" size={14} />
              {labels.manualApply}
            </button>
          </div>
        </div>
      ) : !manualMode &&
        providerAvailable &&
        status !== "provider_unavailable" ? (
        <div>
          <button
            type="button"
            style={buttonStyle(theme, "ghost")}
            onClick={() => setManualMode(true)}
          >
            <CanvasIcon name="pin" size={14} />
            {labels.manualToggle}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function buildLiveMessage(
  status: string,
  count: number,
  decision: string | null,
  labels: AddressMapPickerLabels,
): string {
  if (status === "provider_unavailable") {
    return labels.providerOutageTitle;
  }
  if (status === "searching") {
    return labels.searching;
  }
  if (status === "candidates") {
    return `${count} ${labels.candidatesTitle}`;
  }
  if (status === "no_match") {
    return labels.noMatchTitle;
  }
  if (status === "selected" && decision) {
    return decision === "serviceable"
      ? labels.serviceableTitle
      : decision === "manual_review"
        ? labels.manualReviewTitle
        : labels.notServiceableTitle;
  }
  return "";
}

const visuallyHidden: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

// ── AddressMapPairPicker (pickup + dropoff) ──

export interface AddressMapPairChange {
  pickup: AddressPayload | null;
  dropoff: AddressPayload | null;
  serviceability: ServiceAreaEvaluationResult | null;
  providerState: AddressProviderState;
  bothDispatchReady: boolean;
}

function buildPairChangeSignature(change: AddressMapPairChange): string {
  return JSON.stringify({
    pickup: change.pickup,
    dropoff: change.dropoff,
    serviceability: change.serviceability,
    providerState: change.providerState,
    bothDispatchReady: change.bothDispatchReady,
  });
}

function mergeProviderStates(
  ...states: AddressProviderState[]
): AddressProviderState {
  const unavailableState = states.find((state) => !state.available);
  if (unavailableState) {
    return unavailableState;
  }

  const degradedState = states.find((state) => state.degraded);
  if (degradedState) {
    return degradedState;
  }

  return (
    states[0] ?? { available: true, degraded: false, reasonCode: "available" }
  );
}

export interface AddressMapPairPickerProps<
  TServiceProduct extends string = string,
> {
  provider: AddressMapPickerProvider;
  surface: GeoResolutionSurface;
  theme?: CanvasTheme;
  labels?: Partial<AddressMapPickerLabels>;
  pickupValue?: AddressPayload | null;
  dropoffValue?: AddressPayload | null;
  onChange?: (change: AddressMapPairChange) => void;
  actorId?: string | null;
  serviceProductType?: TServiceProduct;
  bounds?: MapBounds;
  pickupTitle?: ReactNode;
  dropoffTitle?: ReactNode;
  providerHealth?: AddressProviderHealth | null;
}

/**
 * Pickup + dropoff variant. Each leg is an {@link AddressMapPicker}; a combined
 * service-area preview is evaluated across both stops once they are pinned.
 */
export function AddressMapPairPicker<TServiceProduct extends string = string>(
  props: AddressMapPairPickerProps<TServiceProduct>,
) {
  const {
    provider,
    surface,
    theme: themeProp,
    labels,
    onChange,
    actorId = null,
    serviceProductType,
    bounds,
    pickupTitle = "Pickup",
    dropoffTitle = "Dropoff",
    providerHealth,
  } = props;

  const theme = themeProp ?? DEFAULT_THEME;
  const resolvedLabels = useMemo(
    () => resolveAddressPickerLabels(labels),
    [labels],
  );
  const [pickup, setPickup] = useState<AddressPayload | null>(
    props.pickupValue ?? null,
  );
  const [dropoff, setDropoff] = useState<AddressPayload | null>(
    props.dropoffValue ?? null,
  );
  const [serviceability, setServiceability] =
    useState<ServiceAreaEvaluationResult | null>(null);
  const [pickupProviderState, setPickupProviderState] =
    useState<AddressProviderState>(() =>
      deriveProviderState(providerHealth ?? null),
    );
  const [dropoffProviderState, setDropoffProviderState] =
    useState<AddressProviderState>(() =>
      deriveProviderState(providerHealth ?? null),
    );
  const [serviceabilityProviderState, setServiceabilityProviderState] =
    useState<AddressProviderState>(() =>
      deriveProviderState(providerHealth ?? null),
    );
  const lastChangeSignatureRef = useRef<string | null>(null);

  const pickupPoint = addressToGeoPoint(pickup);
  const dropoffPoint = addressToGeoPoint(dropoff);
  const providerState = useMemo(
    () =>
      mergeProviderStates(
        pickupProviderState,
        dropoffProviderState,
        serviceabilityProviderState,
      ),
    [dropoffProviderState, pickupProviderState, serviceabilityProviderState],
  );

  useEffect(() => {
    const nextProviderState = deriveProviderState(providerHealth ?? null);
    setPickupProviderState(nextProviderState);
    setDropoffProviderState(nextProviderState);
    setServiceabilityProviderState(nextProviderState);
  }, [providerHealth]);

  useEffect(() => {
    if (!serviceProductType || !provider.evaluateServiceArea || !pickupPoint) {
      setServiceability(null);
      setServiceabilityProviderState(
        deriveProviderState(providerHealth ?? null),
      );
      return;
    }
    const command = buildServiceAreaPreviewCommand({
      serviceProductType,
      pickup: pickupPoint,
      dropoff: dropoffPoint,
    });
    if (!command) {
      setServiceability(null);
      return;
    }
    let cancelled = false;
    provider
      .evaluateServiceArea(command)
      .then((result) => {
        if (!cancelled) {
          setServiceability(result);
          setServiceabilityProviderState(
            deriveProviderState(providerHealth ?? null),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setServiceability(null);
          setServiceabilityProviderState({
            available: false,
            degraded: true,
            reasonCode: "request_failed",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    dropoffPoint?.lat,
    dropoffPoint?.lng,
    pickupPoint?.lat,
    pickupPoint?.lng,
    provider,
    serviceProductType,
  ]);

  const bothDispatchReady =
    isDispatchReadyAddress(pickup) && isDispatchReadyAddress(dropoff);

  useEffect(() => {
    const nextChange = {
      pickup,
      dropoff,
      serviceability,
      providerState,
      bothDispatchReady,
    } satisfies AddressMapPairChange;
    const nextSignature = buildPairChangeSignature(nextChange);
    if (lastChangeSignatureRef.current === nextSignature) {
      return;
    }
    lastChangeSignatureRef.current = nextSignature;
    onChange?.(nextChange);
  }, [
    bothDispatchReady,
    dropoff,
    onChange,
    pickup,
    providerState,
    serviceability,
  ]);

  const decision = serviceability?.decision ?? null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        fontFamily: theme.fontFamily,
      }}
    >
      <AddressMapPicker
        provider={provider}
        surface={surface}
        theme={theme}
        {...(labels ? { labels } : {})}
        {...(bounds ? { bounds } : {})}
        value={pickup}
        onChange={(change) => {
          setPickup(change.address);
          setPickupProviderState(change.providerState);
        }}
        actorId={actorId}
        title={pickupTitle}
        enableServiceabilityPreview={false}
        {...(providerHealth !== undefined ? { providerHealth } : {})}
      />
      <AddressMapPicker
        provider={provider}
        surface={surface}
        theme={theme}
        {...(labels ? { labels } : {})}
        {...(bounds ? { bounds } : {})}
        value={dropoff}
        onChange={(change) => {
          setDropoff(change.address);
          setDropoffProviderState(change.providerState);
        }}
        actorId={actorId}
        title={dropoffTitle}
        enableServiceabilityPreview={false}
        {...(providerHealth !== undefined ? { providerHealth } : {})}
      />
      {serviceProductType && (pickup || dropoff) ? (
        decision ? (
          <StatusBanner
            theme={theme}
            tone={serviceabilityTone(decision)}
            icon={decision === "serviceable" ? "ok" : "warn"}
            title={
              decision === "serviceable"
                ? resolvedLabels.serviceableTitle
                : decision === "manual_review"
                  ? resolvedLabels.manualReviewTitle
                  : resolvedLabels.notServiceableTitle
            }
            body={serviceability?.reasonMessages?.join(" ") || undefined}
          />
        ) : (
          <StatusBanner
            theme={theme}
            tone="info"
            icon="clock"
            title={resolvedLabels.serviceabilityPending}
          />
        )
      ) : null}
    </div>
  );
}
