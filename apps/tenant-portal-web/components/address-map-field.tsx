"use client";

/**
 * Address coordinate field for the tenant portal address book. Wraps the shared
 * `AddressMapPicker` (search → pin, saved-pin confirmation, manual fallback with
 * an advanced-override reason) and mirrors the selected coordinate into hidden
 * inputs consumed by the address server actions. When no coordinate is pinned it
 * shows an advanced warning so a saved address always has coordinates *or* an
 * explicit warning.
 */
import { useState, type CSSProperties } from "react";
import {
  AddressMapPicker,
  CanvasBanner,
  buildCanvasTheme,
  isDispatchReadyAddress,
  type AddressMapPickerChange,
  type AddressPayload,
} from "@drts/ui-web";
import { createTenantPortalGeoProvider } from "@/lib/geo-map-provider";
import { TENANT_PORTAL_MAP_SURFACE } from "@/lib/tenant-address-map";

const theme = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const wrapperStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

export function AddressMapField({
  defaultValue = null,
  actorId = null,
  priorGeocodeSource = "none",
}: {
  defaultValue?: AddressPayload | null;
  actorId?: string | null;
  /** The stored record's geocodeSource, preserved when a saved pin is unchanged. */
  priorGeocodeSource?: "none" | "manual" | "provider";
}) {
  const [provider] = useState(() => createTenantPortalGeoProvider());
  const [address, setAddress] = useState<AddressPayload | null>(defaultValue);

  function handleChange(change: AddressMapPickerChange) {
    setAddress(change.address);
  }

  const dispatchReady = isDispatchReadyAddress(address);
  const lat = address?.lat;
  const lng = address?.lng;

  return (
    <div style={wrapperStyle}>
      <AddressMapPicker
        provider={provider}
        surface={TENANT_PORTAL_MAP_SURFACE}
        theme={theme}
        actorId={actorId}
        defaultValue={defaultValue}
        onChange={handleChange}
        requireManualReason
      />

      {!dispatchReady ? (
        <CanvasBanner
          theme={theme}
          tone="warn"
          icon="warn"
          title="No map coordinates yet"
          body="This address will be saved without coordinates. Dispatch will need to geocode it manually — search for the address or drop a pin above to attach coordinates now."
        />
      ) : null}

      {/* Hidden mirror consumed by the address server actions. */}
      <input
        type="hidden"
        name="lat"
        value={typeof lat === "number" ? String(lat) : ""}
      />
      <input
        type="hidden"
        name="lng"
        value={typeof lng === "number" ? String(lng) : ""}
      />
      <input
        type="hidden"
        name="coordinateSource"
        value={address?.coordinateSource ?? ""}
      />
      <input
        type="hidden"
        name="manualOverrideReason"
        value={address?.manualOverrideReason ?? ""}
      />
      <input
        type="hidden"
        name="priorGeocodeSource"
        value={priorGeocodeSource}
      />
    </div>
  );
}
