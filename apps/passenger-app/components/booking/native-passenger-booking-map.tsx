import React, { useEffect, useMemo, useRef, useState } from "react";
import Constants from "expo-constants";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, {
  Marker,
  PROVIDER_GOOGLE,
  type LatLng,
} from "react-native-maps";
import type { NativeBookingMapAvailability } from "./native-booking-screen";
import { PASSENGER_P5_COLORS as p5 } from "@drts/ui-tokens";

type MapInput = Parameters<
  Extract<NativeBookingMapAvailability, { status: "ready" }>["render"]
>[0];
type Field = Parameters<MapInput["onPick"]>[0];
type NativePlatform = "ios" | "android";
interface MapBuildMetadata {
  passengerNativeMaps?: { androidApiKeyConfigured?: boolean };
}

function initialRegion(points: LatLng[]) {
  if (points.length === 0)
    return {
      latitude: 25.05,
      longitude: 121.525,
      latitudeDelta: 0.1,
      longitudeDelta: 0.125,
    };
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.015, (maxLat - minLat) * 1.6),
    longitudeDelta: Math.max(0.015, (maxLng - minLng) * 1.6),
  };
}

/** Map gestures select coordinates; only the existing screen/API resolves an address. */
function NativePassengerBookingMap({
  origin,
  destination,
  disabled,
  onPick,
  platform,
}: MapInput & { platform: NativePlatform }) {
  const [field, setField] = useState<Field>("origin");
  const [ready, setReady] = useState(false);
  const mounted = useRef(true);
  const view = useRef<MapView>(null);
  const points = useMemo(
    () =>
      [origin, destination].flatMap((address) =>
        address ? [{ latitude: address.lat, longitude: address.lng }] : [],
      ),
    [origin, destination],
  );
  const region = useRef(initialRegion(points)).current;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (ready && points.length > 0)
      view.current?.fitToCoordinates?.(points, {
        edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
        animated: true,
      });
  }, [points, ready]);
  async function pick(target: Field, coordinate: LatLng) {
    if (!mounted.current || disabled) return;
    await onPick(target, {
      lat: coordinate.latitude,
      lng: coordinate.longitude,
    });
  }
  return (
    <View testID="native-passenger-booking-map" style={styles.container}>
      <View style={styles.choices}>
        {(["origin", "destination"] as const).map((target) => (
          <Pressable
            key={target}
            testID={`booking-map-select-${target}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: field === target, disabled }}
            disabled={disabled}
            onPress={() => setField(target)}
            style={styles.choice}
          >
            <Text style={styles.text}>
              {field === target ? "● " : "○ "}
              {target === "origin" ? "選擇上車點" : "選擇下車點"}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.note}>
        點選地圖設定{field === "origin" ? "上車" : "下車"}
        地點，或拖曳圖釘調整；地址由查詢結果確認。
      </Text>
      {!ready && (
        <View testID="booking-native-map-loading" style={styles.loading}>
          <ActivityIndicator />
          <Text style={styles.note}>地圖載入中；仍可搜尋及選擇地址。</Text>
        </View>
      )}
      <MapView
        ref={view}
        testID="passenger-booking-map-view"
        accessibilityLabel="預約上下車地圖"
        {...(platform === "android" ? { provider: PROVIDER_GOOGLE } : {})}
        initialRegion={region}
        mapType="standard"
        scrollEnabled={!disabled}
        zoomEnabled={!disabled}
        showsUserLocation={false}
        showsMyLocationButton={false}
        onMapReady={() => {
          if (mounted.current) setReady(true);
        }}
        onPress={(event) => {
          void pick(field, event.nativeEvent.coordinate);
        }}
        style={styles.map}
      >
        {(["origin", "destination"] as const).map((target) => {
          const address = target === "origin" ? origin : destination;
          return address ? (
            <Marker
              key={target}
              testID={`passenger-booking-map-${target}-pin`}
              title={target === "origin" ? "上車地點" : "下車地點"}
              description={address.address}
              coordinate={{ latitude: address.lat, longitude: address.lng }}
              draggable={!disabled}
              stopPropagation
              onPress={() => {
                if (!disabled) setField(target);
              }}
              onDragEnd={(event) => {
                void pick(target, event.nativeEvent.coordinate);
              }}
            />
          ) : null;
        })}
      </MapView>
    </View>
  );
}

/** Build metadata records key presence, never a backend credential or a demo fallback. */
export function createNativePassengerBookingMap(): NativeBookingMapAvailability {
  const platform = Platform.OS;
  if (platform !== "ios" && platform !== "android")
    return { status: "unavailable" };
  const metadata = Constants.expoConfig?.extra as MapBuildMetadata | undefined;
  if (
    platform === "android" &&
    metadata?.passengerNativeMaps?.androidApiKeyConfigured !== true
  )
    return { status: "unavailable" };
  return {
    status: "ready",
    kind: "native",
    render: (input) => (
      <NativePassengerBookingMap {...input} platform={platform} />
    ),
  };
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  choices: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  choice: {
    minHeight: 44,
    padding: 12,
    borderWidth: 1,
    borderColor: p5.line,
    borderRadius: 8,
  },
  text: { color: p5.ink, fontSize: 16 },
  note: { color: p5.mut, fontSize: 14 },
  loading: { flexDirection: "row", gap: 8, alignItems: "center" },
  map: { height: 300, width: "100%" },
});
