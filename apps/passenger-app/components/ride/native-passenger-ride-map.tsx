import React, { useEffect, useMemo, useRef, useState } from "react";
import Constants from "expo-constants";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, {
  Marker,
  PROVIDER_GOOGLE,
  type LatLng,
} from "react-native-maps";
import { PASSENGER_P5_COLORS as p5 } from "@drts/ui-tokens";
import type { NativePassengerRidePresentation } from "@drts/passenger-client";
import type { NativeP5ScreenProps } from "./native-p5-screen";

function coordinate(
  point: { lat: number; lng: number } | null | undefined,
): LatLng | null {
  return point &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180
    ? { latitude: point.lat, longitude: point.lng }
    : null;
}
function initialRegion(points: LatLng[]) {
  if (!points.length)
    return {
      latitude: 25.05,
      longitude: 121.525,
      latitudeDelta: 0.1,
      longitudeDelta: 0.125,
    };
  const lat = points.map((point) => point.latitude),
    lng = points.map((point) => point.longitude);
  const minLat = Math.min(...lat),
    maxLat = Math.max(...lat),
    minLng = Math.min(...lng),
    maxLng = Math.max(...lng);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.015, (maxLat - minLat) * 1.6),
    longitudeDelta: Math.max(0.015, (maxLng - minLng) * 1.6),
  };
}
/** Actual assigned GPS and captured endpoints; no inferred road route or passenger-device location. */
function NativePassengerRideMap({
  presentation,
  platform,
}: {
  presentation: NativePassengerRidePresentation;
  platform: "ios" | "android";
}) {
  const { fixture, location } = presentation;
  const pickup = coordinate(fixture.assignment?.routeFare?.pickup);
  const dropoff = coordinate(fixture.assignment?.routeFare?.dropoff);
  const driver =
    location.state === "missing"
      ? null
      : coordinate(fixture.tracking?.location);
  const points = useMemo(
    () =>
      [driver, pickup, dropoff].filter(
        (point): point is LatLng => point !== null,
      ),
    [
      driver?.latitude,
      driver?.longitude,
      pickup?.latitude,
      pickup?.longitude,
      dropoff?.latitude,
      dropoff?.longitude,
    ],
  );
  const region = useRef(initialRegion(points)).current;
  const view = useRef<MapView>(null);
  const mounted = useRef(true);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (ready && points.length)
      view.current?.fitToCoordinates?.(points, {
        edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
        animated: true,
      });
  }, [points, ready]);
  if (
    !presentation.showActiveTripContent ||
    ["行程已取消", "行程已完成"].includes(fixture.status)
  )
    return null;
  if (!points.length)
    return (
      <Text testID="ride-map-position-unavailable" style={styles.note}>
        尚未取得行程位置，請依最新行程狀態等候更新。
      </Text>
    );
  return (
    <View testID="native-passenger-ride-map" style={styles.container}>
      {!ready && (
        <View testID="ride-native-map-loading" style={styles.loading}>
          <ActivityIndicator />
          <Text style={styles.note}>地圖載入中；行程狀態仍會持續更新。</Text>
        </View>
      )}
      <MapView
        ref={view}
        testID="passenger-ride-map-view"
        accessibilityLabel="乘車行程與司機位置地圖"
        {...(platform === "android" ? { provider: PROVIDER_GOOGLE } : {})}
        initialRegion={region}
        mapType="standard"
        showsUserLocation={false}
        showsMyLocationButton={false}
        onMapReady={() => {
          if (mounted.current) setReady(true);
        }}
        style={styles.map}
      >
        {driver && (
          <Marker
            testID="passenger-ride-map-driver-pin"
            coordinate={driver}
            title={
              location.state === "fresh" ? "司機目前位置" : "司機最後回報位置"
            }
            pinColor={location.state === "fresh" ? p5.ink : p5.mut}
          />
        )}
        {pickup && (
          <Marker
            testID="passenger-ride-map-pickup-pin"
            coordinate={pickup}
            title="上車地點"
            description={fixture.pickupLabel}
          />
        )}
        {dropoff && (
          <Marker
            testID="passenger-ride-map-dropoff-pin"
            coordinate={dropoff}
            title="下車地點"
            {...(fixture.dropoffLabel
              ? { description: fixture.dropoffLabel }
              : {})}
          />
        )}
      </MapView>
      {!driver && (
        <Text testID="ride-map-driver-unavailable" style={styles.note}>
          尚未取得司機位置，先顯示行程地點。
        </Text>
      )}
    </View>
  );
}
/** Same installed map capability as booking: iOS MapKit or explicitly configured Android Google Maps. */
export function createNativePassengerRideMap(): NativeP5ScreenProps["renderMap"] {
  const platform = Platform.OS;
  if (platform !== "ios" && platform !== "android") return undefined;
  const metadata = Constants.expoConfig?.extra as
    | { passengerNativeMaps?: { androidApiKeyConfigured?: boolean } }
    | undefined;
  if (
    platform === "android" &&
    metadata?.passengerNativeMaps?.androidApiKeyConfigured !== true
  )
    return undefined;
  return (presentation) => (
    <NativePassengerRideMap presentation={presentation} platform={platform} />
  );
}
const styles = StyleSheet.create({
  container: { gap: 8 },
  note: { color: p5.mut, fontSize: 14 },
  loading: { flexDirection: "row", gap: 8, alignItems: "center" },
  map: { height: 300, width: "100%" },
});
