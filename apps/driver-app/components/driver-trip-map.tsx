import React from "react";
import {
  Alert,
  Linking,
  NativeModules,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import type { DriverTaskRecord, OwnedOrderRecord } from "@drts/contracts";

import { driverCanvasTheme } from "@/components/canvas-primitives";
import {
  DRIVER_MISSING_COORDINATE_COPY,
  buildDriverTripNavigationModel,
  getDriverLocationFixState,
  openDriverNavigation,
  type DriverLocationFixInput,
  type DriverNavigationCoordinate,
  type DriverNavigationOpenResult,
  type DriverNavigationProvider,
  type DriverNavigationStop,
} from "@/lib/driver-navigation";

export type DriverTripMapLocation = NonNullable<DriverLocationFixInput>;

function hasMapAndMarkers(name: string) {
  return (
    UIManager.hasViewManagerConfig(name) &&
    UIManager.hasViewManagerConfig(name + "Marker")
  );
}

function getNativeMapProvider(): "google" | "apple" | null {
  if (
    (Platform.OS !== "android" && Platform.OS !== "ios") ||
    typeof UIManager?.hasViewManagerConfig !== "function"
  ) {
    return null;
  }
  const googleConfigured =
    NativeModules?.DRTSDriverMapConfig?.googleMapsConfigured === true;
  if (Platform.OS === "android") {
    return googleConfigured && hasMapAndMarkers("AIRMap") ? "google" : null;
  }
  if (Platform.OS === "ios") {
    if (googleConfigured && hasMapAndMarkers("AIRGoogleMap")) return "google";
    if (hasMapAndMarkers("AIRMap")) return "apple";
  }
  return null;
}

function buildNativeMapRegion(
  stops: DriverNavigationCoordinate[],
  driverLocation: DriverTripMapLocation | null,
) {
  const points = [
    ...stops,
    ...(driverLocation
      ? [
          {
            latitude: driverLocation.latitude,
            longitude: driverLocation.longitude,
          },
        ]
      : []),
  ];
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

type DriverTripMapProps = {
  task: DriverTaskRecord;
  order: OwnedOrderRecord | null;
  driverLocation: DriverTripMapLocation | null;
  sourcePlatformOffline?: boolean;
  nativeMapAvailable?: boolean;
  now?: number;
  onNavigationResult?: (result: DriverNavigationOpenResult) => void;
};

function toneStyle(tone: "success" | "warning" | "danger" | "info") {
  switch (tone) {
    case "success":
      return {
        color: driverCanvasTheme.success,
        backgroundColor: driverCanvasTheme.successBg,
        borderColor: driverCanvasTheme.successBorder,
      };
    case "warning":
      return {
        color: driverCanvasTheme.warn,
        backgroundColor: driverCanvasTheme.warnBg,
        borderColor: driverCanvasTheme.warnBorder,
      };
    case "danger":
      return {
        color: driverCanvasTheme.danger,
        backgroundColor: driverCanvasTheme.dangerBg,
        borderColor: driverCanvasTheme.dangerBorder,
      };
    case "info":
    default:
      return {
        color: driverCanvasTheme.info,
        backgroundColor: driverCanvasTheme.infoBg,
        borderColor: driverCanvasTheme.infoBorder,
      };
  }
}

function StopCoordinateCard({
  stop,
  onOpenNavigation,
}: {
  stop: DriverNavigationStop;
  onOpenNavigation: (
    stop: DriverNavigationStop,
    provider: DriverNavigationProvider,
  ) => void;
}) {
  const hasCoordinate = stop.coordinate !== null;
  const coordinateTone = toneStyle(hasCoordinate ? "success" : "danger");
  // "Apple 導航" keeps a space after the Latin name; "系統導航" has none.
  const isIos = Platform.OS === "ios";
  const systemNavLabel = isIos ? "Apple 導航" : "系統導航";

  return (
    <View style={styles.stopCard}>
      <View style={styles.stopHeader}>
        <Text style={styles.stopLabel}>{stop.label}</Text>
        <View
          style={[
            styles.coordinateBadge,
            {
              backgroundColor: coordinateTone.backgroundColor,
              borderColor: coordinateTone.borderColor,
            },
          ]}
        >
          <Text
            style={[
              styles.coordinateBadgeText,
              { color: coordinateTone.color },
            ]}
          >
            {hasCoordinate ? "座標可導航" : "缺少座標"}
          </Text>
        </View>
      </View>
      <Text style={styles.addressText}>{stop.address}</Text>
      {hasCoordinate ? (
        <Text selectable style={styles.coordinateText}>
          {stop.coordinateLabel}
        </Text>
      ) : null}

      {hasCoordinate ? (
        <View style={styles.navigationRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`用 Google 導航到${stop.label}`}
            onPress={() => onOpenNavigation(stop, "google")}
            style={({ pressed }) => [
              styles.navButton,
              pressed ? styles.navButtonPressed : null,
            ]}
          >
            <Text style={styles.navButtonText}>Google 導航</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`用${isIos ? " Apple " : "系統"}導航到${stop.label}`}
            onPress={() => onOpenNavigation(stop, "system")}
            style={({ pressed }) => [
              styles.navButtonSecondary,
              pressed ? styles.navButtonPressed : null,
            ]}
          >
            <Text style={styles.navButtonSecondaryText}>{systemNavLabel}</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.degradedText}>
          {DRIVER_MISSING_COORDINATE_COPY}
        </Text>
      )}
    </View>
  );
}

export default function DriverTripMap({
  task,
  order,
  driverLocation,
  sourcePlatformOffline = false,
  nativeMapAvailable = true,
  now = Date.now(),
  onNavigationResult,
}: DriverTripMapProps) {
  const model = buildDriverTripNavigationModel({ task, order });
  const fixState = getDriverLocationFixState({
    task,
    location: driverLocation,
    now,
  });
  const fixTone = toneStyle(
    fixState.state === "fresh"
      ? "success"
      : fixState.state === "stale"
        ? "warning"
        : "info",
  );
  const nativePoints = [
    model.stops.pickup.coordinate,
    model.stops.dropoff.coordinate,
  ].filter((point): point is DriverNavigationCoordinate => point !== null);
  const provider =
    nativeMapAvailable && nativePoints.length > 0
      ? getNativeMapProvider()
      : null;
  const initialRegion = provider
    ? buildNativeMapRegion(nativePoints, driverLocation)
    : null;

  const handleOpenNavigation = async (
    stop: DriverNavigationStop,
    provider: DriverNavigationProvider,
  ) => {
    const result = await openDriverNavigation({
      stop,
      provider,
      platform: Platform.OS,
      linking: Linking,
    });
    onNavigationResult?.(result);

    if (result.status === "missing_coordinates") {
      Alert.alert("缺少導航座標", result.message);
      return;
    }

    if (result.status === "unavailable") {
      Alert.alert("無法開啟導航", result.message);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>導航</Text>

      {model.authority.notice ? (
        <View style={[styles.notice, styles.noticeForwarded]}>
          <Text style={styles.noticeBody}>{model.authority.notice}</Text>
        </View>
      ) : null}

      <View style={styles.previewPanel}>
        <View style={styles.previewHeader}>
          <Text style={styles.previewTitle}>行程地圖</Text>
          <Text style={styles.previewStatus}>
            {provider === "google"
              ? "Google 地圖"
              : provider === "apple"
                ? "Apple 地圖"
                : nativePoints.length > 0
                  ? "請用下方按鈕開啟導航"
                  : "上下車點還沒有座標"}
          </Text>
        </View>
        {initialRegion ? (
          <MapView
            accessibilityLabel="上下車點地圖"
            initialRegion={initialRegion}
            mapType="standard"
            provider={provider === "google" ? PROVIDER_GOOGLE : undefined}
            showsMyLocationButton={fixState.state !== "stopped"}
            showsUserLocation={
              fixState.state === "fresh" || fixState.state === "stale"
            }
            style={styles.nativeMap}
          >
            {model.stops.pickup.coordinate ? (
              <Marker
                coordinate={model.stops.pickup.coordinate}
                description={model.stops.pickup.address}
                pinColor={driverCanvasTheme.success}
                title={model.stops.pickup.label}
              />
            ) : null}
            {model.stops.dropoff.coordinate ? (
              <Marker
                coordinate={model.stops.dropoff.coordinate}
                description={model.stops.dropoff.address}
                pinColor={driverCanvasTheme.danger}
                title={model.stops.dropoff.label}
              />
            ) : null}
          </MapView>
        ) : (
          <View style={styles.pinRow}>
            <View style={[styles.pin, styles.pickupPin]} />
            <View style={styles.pinConnector} />
            <View style={[styles.pin, styles.dropoffPin]} />
          </View>
        )}
      </View>

      <View
        style={[
          styles.notice,
          {
            backgroundColor: fixTone.backgroundColor,
            borderColor: fixTone.borderColor,
          },
        ]}
      >
        <Text style={[styles.noticeTitle, { color: fixTone.color }]}>
          {fixState.label}
        </Text>
        <Text style={styles.noticeBody}>{fixState.detail}</Text>
      </View>

      {sourcePlatformOffline ? (
        <Text style={styles.degradedText}>
          平台目前離線，地點是最後一次同步的資料。要改路線請先聯絡派車台。
        </Text>
      ) : null}

      <StopCoordinateCard
        stop={model.stops.pickup}
        onOpenNavigation={(stop, provider) =>
          void handleOpenNavigation(stop, provider)
        }
      />
      <StopCoordinateCard
        stop={model.stops.dropoff}
        onOpenNavigation={(stop, provider) =>
          void handleOpenNavigation(stop, provider)
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: driverCanvasTheme.border,
    backgroundColor: driverCanvasTheme.surface,
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    color: driverCanvasTheme.text,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  notice: {
    gap: 4,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
  },
  noticeForwarded: {
    borderColor: driverCanvasTheme.infoBorder,
    backgroundColor: driverCanvasTheme.infoBg,
  },
  noticeTitle: {
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "800",
    color: driverCanvasTheme.text,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  noticeBody: {
    fontSize: 12,
    lineHeight: 17,
    color: driverCanvasTheme.text,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  previewPanel: {
    gap: 10,
    minHeight: 128,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: driverCanvasTheme.borderStrong,
    padding: 12,
    backgroundColor: driverCanvasTheme.surfaceLo,
  },
  nativeMap: {
    width: "100%",
    height: 240,
    borderRadius: 12,
  },
  previewHeader: {
    gap: 2,
  },
  previewTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    color: driverCanvasTheme.text,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  previewStatus: {
    fontSize: 11.5,
    lineHeight: 16,
    color: driverCanvasTheme.textMuted,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  pinRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
  },
  pin: {
    width: 18,
    height: 18,
    borderRadius: 9,
    shadowOpacity: 0.32,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  pickupPin: {
    backgroundColor: driverCanvasTheme.success,
    shadowColor: driverCanvasTheme.success,
  },
  dropoffPin: {
    backgroundColor: driverCanvasTheme.danger,
    shadowColor: driverCanvasTheme.danger,
  },
  pinConnector: {
    flex: 1,
    maxWidth: 128,
    height: 2,
    borderTopWidth: 2,
    borderStyle: "dashed",
    borderColor: driverCanvasTheme.borderStrong,
  },
  stopCard: {
    gap: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: driverCanvasTheme.border,
    padding: 12,
    backgroundColor: driverCanvasTheme.surfaceLo,
  },
  stopHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  stopLabel: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
    color: driverCanvasTheme.text,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  coordinateBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  coordinateBadgeText: {
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "800",
    fontFamily: driverCanvasTheme.fontFamily,
  },
  addressText: {
    fontSize: 12.5,
    lineHeight: 18,
    color: driverCanvasTheme.text,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  coordinateText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    color: driverCanvasTheme.accentHi,
    fontFamily: driverCanvasTheme.monoFamily,
  },
  navigationRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  navButton: {
    minHeight: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: driverCanvasTheme.accent,
  },
  navButtonSecondary: {
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: driverCanvasTheme.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: driverCanvasTheme.surface,
  },
  navButtonPressed: {
    opacity: 0.82,
  },
  navButtonText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: "#05111F",
    fontFamily: driverCanvasTheme.fontFamily,
  },
  navButtonSecondaryText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: driverCanvasTheme.text,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  degradedText: {
    fontSize: 12,
    lineHeight: 17,
    color: driverCanvasTheme.warn,
    fontFamily: driverCanvasTheme.fontFamily,
  },
});
