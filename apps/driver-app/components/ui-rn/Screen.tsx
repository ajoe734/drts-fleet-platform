import React from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { driverTheme } from "./theme";

interface ScreenProps {
  children: React.ReactNode;
  scrollable?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  backgroundColor?: string;
}

export function Screen({
  children,
  scrollable = true,
  style,
  contentContainerStyle,
  backgroundColor = driverTheme.colors.appBackground,
}: ScreenProps) {
  if (!scrollable) {
    return (
      <SafeAreaView style={[{ flex: 1, backgroundColor }]}>
        <View style={[{ flex: 1 }, style]}>{children}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor }]}>
      <ScrollView
        style={[{ flex: 1 }, style]}
        contentContainerStyle={[
          {
            flexGrow: 1,
            paddingHorizontal: driverTheme.layout.pagePadding,
            paddingTop: driverTheme.spacing.sm,
            paddingBottom: driverTheme.spacing["3xl"],
            gap: driverTheme.layout.contentGap,
          },
          contentContainerStyle,
        ]}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
