import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { Tabs, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider } from "@react-navigation/native";
import "react-native-reanimated";

import {
  initializeDriverLocationHeartbeat,
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
  getDriverClient,
  getDriverIdentityIssue,
  initializeDriverIdentity,
  isDriverIdentityProvisioned,
} from "@/lib/api-client";

import { driverNavigationTheme, driverTheme } from "@/lib/theme";
import { driverRouteTitles } from "@/lib/strings";
import { DriverBottomTabBar } from "@/components/driver-bottom-tab-bar";

const DRIVER_SESSION_REVALIDATE_INTERVAL_MS = 10 * 60 * 1000;

export const unstable_settings = {
  initialRouteName: "onboarding",
};

function DriverHeartbeatBootstrap() {
  const router = useRouter();
  const segments = useSegments();
  const segmentsRef = useRef<string[]>(segments);

  useEffect(() => {
    segmentsRef.current = [...segments];
  }, [segments]);

  useEffect(() => {
    initializeDriverLocationHeartbeat();

    let cancelled = false;

    const syncWithActiveTrip = async () => {
      await syncDriverIdentityBootstrap({
        allowUnprovisionedRoute: allowUnprovisionedDriverRoute(
          segmentsRef.current,
        ),
        cancelled: () => cancelled,
        getDriverIdentityIssue,
        initializeDriverIdentity,
        isDriverIdentityProvisioned,
        listDriverTasks: () => getDriverClient().listDriverTasks(),
        onWarning: (error) => {
          console.warn(
            "Driver heartbeat bootstrap sync failed",
            formatDriverError(error, "裝置同步失敗"),
          );
        },
        resetDriverAppToOnboarding,
        router,
        syncDriverLocationHeartbeat,
        evaluateTrackingRecovery,
      });
    };

    void syncWithActiveTrip();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        void syncWithActiveTrip();
      }
    });
    const refreshInterval = setInterval(() => {
      void syncWithActiveTrip();
    }, DRIVER_SESSION_REVALIDATE_INTERVAL_MS);

    return () => {
      cancelled = true;
      subscription.remove();
      clearInterval(refreshInterval);
    };
  }, [router]);

  return null;
}

export default function RootLayout() {
  return (
    <ThemeProvider value={driverNavigationTheme}>
      <DriverHeartbeatBootstrap />
      <StatusBar style={driverTheme.mode === "dark" ? "light" : "dark"} />
      <Tabs
        tabBar={(props) => <DriverBottomTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: driverTheme.colors.bgRaised,
            borderTopColor: driverTheme.colors.border,
          },
          tabBarActiveTintColor: driverTheme.colors.primary,
          tabBarInactiveTintColor: driverTheme.colors.textMuted,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "工作台",
          }}
        />
        <Tabs.Screen
          name="jobs"
          options={{
            title: "任務",
          }}
        />
        <Tabs.Screen
          name="trip"
          options={{
            title: "行程",
          }}
        />
        <Tabs.Screen
          name="platform-presence"
          options={{
            title: "平台",
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "設定",
          }}
        />
        <Tabs.Screen
          name="onboarding"
          options={{
            title: driverRouteTitles.onboarding,
            href: null,
          }}
        />
        <Tabs.Screen
          name="earnings"
          options={{
            title: driverRouteTitles.earnings,
            href: null,
          }}
        />
        <Tabs.Screen
          name="shift"
          options={{
            title: driverRouteTitles.shift,
            href: null,
          }}
        />
        <Tabs.Screen
          name="sos"
          options={{
            title: driverRouteTitles.sos,
            href: null,
          }}
        />
        <Tabs.Screen
          name="incident"
          options={{
            title: driverRouteTitles.incident,
            href: null,
          }}
        />
        <Tabs.Screen
          name="safety-operator"
          options={{
            title: driverRouteTitles.safetyOperator,
            href: null,
          }}
        />
      </Tabs>
    </ThemeProvider>
  );
}

