"use client";
import { useEffect, useRef, useState } from "react";
import type {
  GeoReverseResponse,
  ReverseGeocodeCommand,
} from "@drts/contracts";
import { isDispatchReadyAddress, type AddressPayload } from "@drts/ui-web";
import { P5Btn } from "../auth/ui";
import { BOOK_T as T } from "../../lib/booking/translations";

export function CurrentLocationButton({
  value,
  reverse,
  onSelect,
  disabled,
}: {
  value: AddressPayload | null;
  reverse: (command: ReverseGeocodeCommand) => Promise<GeoReverseResponse>;
  onSelect: (address: AddressPayload) => void;
  disabled: boolean;
}) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const boundary = useRef({ value, disabled });
  const select = useRef(onSelect);
  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    if (
      boundary.current.value === value &&
      boundary.current.disabled === disabled
    )
      return;
    boundary.current = { value, disabled };
    request.current += 1;
    setLocating(false);
    setError("");
  }, [value, disabled]);
  useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );

  async function locate() {
    if (locating || disabled) return;
    const current = ++request.current;
    const active = () => request.current === current;
    setError("");
    if (!navigator.geolocation) {
      setError(T.locationUnsupported);
      return;
    }
    setLocating(true);
    let position: GeolocationPosition;
    try {
      position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 10_000,
        }),
      );
    } catch (reason) {
      if (!active()) return;
      const code = (reason as GeolocationPositionError | undefined)?.code;
      setError(
        code === 1
          ? T.locationDenied
          : code === 3
            ? T.locationTimeout
            : T.locationUnavailable,
      );
      setLocating(false);
      return;
    }
    if (!active()) return;
    const { latitude: lat, longitude: lng, accuracy } = position.coords;
    if (
      !isDispatchReadyAddress({
        address: "",
        lat,
        lng,
        coordinateSource: "reverse_geocode",
      })
    ) {
      setError(T.locationUnavailable);
      setLocating(false);
      return;
    }
    try {
      const result = await reverse({
        location: { lat, lng },
        surface: "passenger_entry",
      });
      if (!active()) return;
      const address = result.address;
      if (
        !isDispatchReadyAddress(address) ||
        typeof address.address !== "string" ||
        !address.address.trim()
      )
        throw new Error("location_address_unavailable");
      const coordinateAccuracyM =
        Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null;
      select.current({
        ...address,
        lat,
        lng,
        coordinateAccuracyM,
        coordinateProvenance: {
          ...address.coordinateProvenance,
          coordinateSource: address.coordinateSource!,
          coordinateAccuracyM,
        },
      });
    } catch {
      if (active()) setError(T.locationAddressError);
    } finally {
      if (active()) setLocating(false);
    }
  }

  return (
    <>
      <P5Btn disabled={disabled || locating} onClick={() => void locate()}>
        {locating ? T.locating : T.currentLocation}
      </P5Btn>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
