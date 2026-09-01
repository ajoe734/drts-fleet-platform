import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { driverTheme } from "@/lib/theme";
import { driverTabLabels } from "@/lib/strings";

export default function DriverTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: driverTheme.colors.primary,
        tabBarInactiveTintColor: driverTheme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: driverTheme.colors.bgRaised,
          borderTopColor: driverTheme.colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: driverTabLabels.workspace,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: driverTabLabels.jobs,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="clipboard-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="trip"
        options={{
          title: driverTabLabels.trip,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="navigate-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="platform-presence"
        options={{
          title: driverTabLabels.platform,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="layers-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: driverTabLabels.settings,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
