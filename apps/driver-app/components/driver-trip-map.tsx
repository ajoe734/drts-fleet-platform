import React from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import type { DriverTaskRecord, OwnedOrderRecord } from "@drts/contracts";

import { driverCanvasTheme } from "@/components/canvas-primitives";
import {
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
  const systemLabel = Platform.OS === "ios" ? "Apple" : "系統";

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
      <Text style={styles.coordinateText}>{stop.coordinateLabel}</Text>
      <Text style={styles.metaText}>
        {stop.geocodeProvider ? "座標已同步" : "地圖資料同步中"}
        {stop.coordinateAccuracyM != null
          ? ` · 精度約 ${Math.round(stop.coordinateAccuracyM)} 公尺`
          : ""}
      </Text>

      {hasCoordinate ? (
        <View style={styles.navigationRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`以 Google 導航前往${stop.label}`}
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
            accessibilityLabel={`以${systemLabel}導航前往${stop.label}`}
            onPress={() => onOpenNavigation(stop, "system")}
            style={({ pressed }) => [
              styles.navButtonSecondary,
              pressed ? styles.navButtonPressed : null,
            ]}
          >
            <Text style={styles.navButtonSecondaryText}>
              {systemLabel} 導航
            </Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.degradedText}>
          無有效座標時不使用地址猜測導航；請聯絡派車台確認座標。
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
  nativeMapAvailable = false,
  now = Date.now(),
  onNavigationResult,
}: DriverTripMapProps) {
  const model = buildDriverTripNavigationModel({ task, order });
  const fixState = getDriverLocationFixState({
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
  const nativeMapEnabled =
    nativeMapAvailable && Platform.OS !== "web" && nativePoints.length > 0;
  const initialRegion = nativeMapEnabled
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
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>導航</Text>
          <Text style={styles.title}>路線與導航</Text>
          <Text style={styles.subtitle}>
            以車隊同步的上下車地點開啟導航，不用地址文字推測路線。
          </Text>
        </View>
        <View
          style={[
            styles.authorityBadge,
            model.authority.kind === "drts_owned"
              ? styles.authorityBadgeOwned
              : styles.authorityBadgeForwarded,
          ]}
        >
          <Text style={styles.authorityBadgeText}>{model.authority.badge}</Text>
        </View>
      </View>

      <View
        style={[
          styles.notice,
          model.authority.kind === "drts_owned"
            ? styles.noticeOwned
            : styles.noticeForwarded,
        ]}
      >
        <Text style={styles.noticeTitle}>{model.authority.title}</Text>
        <Text style={styles.noticeBody}>{model.authority.description}</Text>
        {model.authority.degradedHint ? (
          <Text style={styles.noticeMeta}>{model.authority.degradedHint}</Text>
        ) : null}
      </View>

      <View style={styles.previewPanel}>
        <View style={styles.previewHeader}>
          <Text style={styles.previewTitle}>
            {nativeMapAvailable ? "地圖檢視" : "座標導航"}
          </Text>
          <Text style={styles.previewStatus}>
            {nativeMapEnabled ? "地圖已載入" : "目前以簡圖顯示路線"}
          </Text>
        </View>
        {nativeMapEnabled && initialRegion ? (
          <MapView
            accessibilityLabel="行程地圖"
            initialRegion={initialRegion}
            mapType="standard"
            provider={PROVIDER_GOOGLE}
            showsMyLocationButton
            showsUserLocation={fixState.state !== "missing"}
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
        <Text style={styles.previewMeta}>
          {model.hasNavigableRoute
            ? "上下車地點已標示在圖上，可直接開啟導航。"
            : "座標資料不完整，畫面先顯示地址；導航按鈕會在座標可用時啟用。"}
        </Text>
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
        {fixState.coordinateLabel ? (
          <Text style={styles.noticeMeta}>
            目前位置 {fixState.coordinateLabel}
          </Text>
        ) : null}
      </View>

      {sourcePlatformOffline ? (
        <Text style={styles.degradedText}>
          來源平台目前離線，畫面顯示最後一次同步的座標。路線由來源平台鎖定，
          需要改道請先聯絡派車台確認。
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

      <Text style={styles.fallbackCopy}>
        離線備援：若地圖、定位或導航 App
        無法使用，請保留此頁的座標與地址，並聯絡派車台協助導航。
      </Text>
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
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  headerCopy: {
    flex: 1,
    gap: 3,
  },
  eyebrow: {
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: driverCanvasTheme.textMuted,
    fontFamily: driverCanvasTheme.monoFamily,
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    color: driverCanvasTheme.text,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 17,
    color: driverCanvasTheme.textMuted,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  authorityBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  authorityBadgeOwned: {
    borderColor: driverCanvasTheme.accentBorder,
    backgroundColor: driverCanvasTheme.accentBg,
  },
  authorityBadgeForwarded: {
    borderColor: driverCanvasTheme.warnBorder,
    backgroundColor: driverCanvasTheme.warnBg,
  },
  authorityBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    color: driverCanvasTheme.text,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  notice: {
    gap: 4,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
  },
  noticeOwned: {
    borderColor: driverCanvasTheme.accentBorder,
    backgroundColor: driverCanvasTheme.accentBg,
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
  noticeMeta: {
    fontSize: 11,
    lineHeight: 15,
    color: driverCanvasTheme.textMuted,
    fontFamily: driverCanvasTheme.monoFamily,
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
    width: 128,
    height: 2,
    borderTopWidth: 2,
    borderStyle: "dashed",
    borderColor: driverCanvasTheme.borderStrong,
  },
  previewMeta: {
    fontSize: 11.5,
    lineHeight: 16,
    color: driverCanvasTheme.textMuted,
    textAlign: "center",
    fontFamily: driverCanvasTheme.fontFamily,
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
  metaText: {
    fontSize: 10.5,
    lineHeight: 14,
    color: driverCanvasTheme.textMuted,
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
  fallbackCopy: {
    fontSize: 11.5,
    lineHeight: 16,
    color: driverCanvasTheme.textMuted,
    fontFamily: driverCanvasTheme.fontFamily,
  },
});
