import React from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  DRIVER_TABS,
  resolveActiveDriverTab,
  type DriverTabDefinition,
  type DriverTabKey,
} from "@/lib/driver-navigation";
import { driverTheme } from "@/lib/theme";

export type BottomTabBarRoute = {
  key: string;
  name: string;
  params?: any;
};

export type BottomTabBarNavigationState = {
  index: number;
  routes: any[];
};

export type BottomTabBarNavigation = {
  emit: (event: any) => any;
  navigate: (...args: any[]) => void;
};

export type BottomTabBarInsets = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

export interface DriverBottomTabBarProps {
  state?: BottomTabBarNavigationState | any;
  descriptors?: any;
  navigation?: BottomTabBarNavigation | any;
  insets?: BottomTabBarInsets | any;
  currentRouteName?: string;
  activeTabOverride?: DriverTabKey;
  onTabPress?: (tabKey: DriverTabKey, tab: DriverTabDefinition) => void;
  style?: StyleProp<ViewStyle>;
}

export function DriverBottomTabBar(props: DriverBottomTabBarProps) {
  const insetsFallback = useSafeAreaInsets();
  const bottomInset = props.insets?.bottom ?? insetsFallback.bottom ?? 0;

  const currentRouteName =
    props.state?.routes[props.state.index]?.name ??
    props.currentRouteName ??
    "index";

  const routeParams = props.state?.routes[props.state.index]?.params as
    | Record<string, unknown>
    | undefined;

  const tabOverride =
    (routeParams?.tab as DriverTabKey | undefined) ??
    (routeParams?.activeTab as DriverTabKey | undefined) ??
    props.activeTabOverride;

  const activeTabKey = resolveActiveDriverTab(currentRouteName, tabOverride);

  const handlePress = (tab: DriverTabDefinition) => {
    if (props.navigation) {
      const targetRoute = props.state?.routes.find(
        (r: { name: string; key?: string }) => r.name === tab.routeName,
      );
      const isFocused =
        props.state?.routes[props.state.index]?.name === tab.routeName;

      const event = props.navigation.emit({
        type: "tabPress",
        target: targetRoute?.key ?? tab.routeName,
        canPreventDefault: true,
      });

      if (!isFocused && !event.defaultPrevented) {
        props.navigation.navigate(tab.routeName);
      }
    }

    props.onTabPress?.(tab.key, tab);
  };

  return (
    <View
      accessibilityRole="tablist"
      testID="driver-bottom-tab-bar"
      style={[
        styles.container,
        {
          paddingBottom: Math.max(bottomInset, 8),
        },
        props.style,
      ]}
    >
      {DRIVER_TABS.map((tab) => {
        const isActive = tab.key === activeTabKey;
        const color = isActive
          ? driverTheme.colors.primary
          : driverTheme.colors.textMuted;
        const iconName = (
          isActive ? tab.activeIcon : tab.icon
        ) as keyof typeof Ionicons.glyphMap;

        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.accessibilityLabel}
            testID={tab.testID}
            onPress={() => handlePress(tab)}
            style={({ pressed }) => [
              styles.tabItem,
              pressed && styles.tabItemPressed,
            ]}
          >
            <Ionicons name={iconName} size={22} color={color} />
            <Text style={[styles.tabLabel, { color }]}>{tab.title}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: driverTheme.colors.bgRaised,
    borderTopWidth: 1,
    borderTopColor: driverTheme.colors.border,
    paddingTop: 8,
    alignItems: "center",
    justifyContent: "space-around",
    minHeight: 56,
    ...Platform.select({
      web: {
        position: "relative" as const,
        zIndex: 50,
      },
      default: {},
    }),
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingVertical: 2,
  },
  tabItemPressed: {
    opacity: 0.7,
  },
  tabLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    marginTop: 3,
    letterSpacing: 0.2,
  },
});
