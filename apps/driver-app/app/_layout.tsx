import React, { useEffect, useRef } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider } from "@react-navigation/native";
import "react-native-reanimated";

import {
  initializeDriverLocationHeartbeat,
  stopDriverLocationHeartbeat,
  syncDriverLocationHeartbeat,
} from "@/lib/driver-location-heartbeat";
import { syncDriverIdentityBootstrap } from "@/lib/driver-identity-bootstrap";
import { evaluateTrackingRecovery } from "@/lib/driver-tracking-recovery";
import {
  allowUnprovisionedDriverRoute,
  resetDriverAppToOnboarding,
} from "@/lib/driver-identity-routing";
import {
  formatDriverError,
  getDriverClientOrNull,
  getDriverIdentityIssue,
  initializeDriverIdentity,
  isDriverIdentityProvisioned,
} from "@/lib/api-client";
import {
  subscribeDriverSession,
  useDriverSessionEpoch,
} from "@/lib/driver-session-lifecycle";

import { driverNavigationTheme, driverTheme } from "@/lib/theme";

const DRIVER_SESSION_REVALIDATE_INTERVAL_MS = 10 * 60 * 1000;

function DriverHeartbeatBootstrap() {
  const router = useRouter();
  const segments = useSegments();
  const segmentsRef = useRef<string[]>(segments);
  // Re-arms the whole bootstrap whenever the driver signs in or out, so the
  // interval and the AppState listener below never outlive their session.
  const sessionEpoch = useDriverSessionEpoch();

  useEffect(() => {
    segmentsRef.current = [...segments];
  }, [segments]);

  useEffect(() => {
    initializeDriverLocationHeartbeat();

    let cancelled = false;

    const warn = (error: unknown) => {
      // console.warn (never console.error): LogBox turns console.error into a
      // full-screen red overlay for the driver.
      console.warn(
        "Driver heartbeat bootstrap sync failed",
        formatDriverError(error, "裝置同步失敗"),
      );
    };

    const syncWithActiveTrip = async () => {
      await syncDriverIdentityBootstrap({
        allowUnprovisionedRoute: allowUnprovisionedDriverRoute(
          segmentsRef.current,
        ),
        cancelled: () => cancelled,
        getDriverIdentityIssue,
        initializeDriverIdentity,
        isDriverIdentityProvisioned,
        listDriverTasks: async () => {
          const client = getDriverClientOrNull();
          if (!client) {
            return [];
          }
          return client.listDriverTasks();
        },
        onWarning: warn,
        resetDriverAppToOnboarding,
        router,
        syncDriverLocationHeartbeat,
        evaluateTrackingRecovery,
      });
    };

    const runSync = () => {
      syncWithActiveTrip().catch(warn);
    };

    runSync();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        runSync();
      }
    });
    const refreshInterval = setInterval(
      runSync,
      DRIVER_SESSION_REVALIDATE_INTERVAL_MS,
    );

    // Stop location tracking the moment the session ends, before this effect is
    // re-created for the next session.
    const unsubscribeSession = subscribeDriverSession((snapshot) => {
      if (snapshot.state === "signed_out") {
        stopDriverLocationHeartbeat().catch(warn);
      }
    });

    return () => {
      cancelled = true;
      unsubscribeSession();
      subscription.remove();
      clearInterval(refreshInterval);
    };
  }, [router, sessionEpoch]);

  return null;
}

type DriverErrorBoundaryProps = { children: React.ReactNode };
type DriverErrorBoundaryState = { failed: boolean };

/**
 * Last line of defence for render-time exceptions. Shows a plain Traditional
 * Chinese message: never a stack trace, file name, environment variable or
 * error code.
 */
class DriverErrorBoundary extends React.Component<
  DriverErrorBoundaryProps,
  DriverErrorBoundaryState
> {
  state: DriverErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): DriverErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn(
      "Driver app render failure",
      formatDriverError(error, "畫面載入失敗"),
    );
  }

  render() {
    if (this.state.failed) {
      return (
        <View style={styles.errorScreen}>
          <Text style={styles.errorTitle}>畫面暫時無法顯示</Text>
          <Text style={styles.errorBody}>
            請關閉後重新開啟 App。若仍無法使用，請聯絡車隊值班人員。
          </Text>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  errorScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  errorBody: {
    fontSize: 14,
    textAlign: "center",
  },
});

export default function RootLayout() {
  return (
    <ThemeProvider value={driverNavigationTheme}>
      <DriverErrorBoundary>
        <DriverHeartbeatBootstrap />
        <StatusBar style={driverTheme.mode === "dark" ? "light" : "dark"} />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
      </DriverErrorBoundary>
    </ThemeProvider>
  );
}
