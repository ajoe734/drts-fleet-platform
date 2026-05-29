import React from "react";
import {
  StyleSheet,
  View,
  SafeAreaView,
  ScrollView,
  StatusBar,
  ViewStyle,
  type RefreshControlProps,
} from "react-native";
import { Tokens } from "./tokens";

interface AppScreenProps {
  children: React.ReactNode;
  scrollable?: boolean;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
  backgroundColor?: string;
  /**
   * Optional pull-to-refresh control. Only applies when `scrollable` (the
   * default); used by manual-refresh-tier screens per packet §3.2.
   */
  refreshControl?: React.ReactElement<RefreshControlProps>;
}

export const AppScreen: React.FC<AppScreenProps> = ({
  children,
  scrollable = true,
  style,
  contentContainerStyle,
  backgroundColor = Tokens.colors.appBg,
  refreshControl,
}) => {
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <StatusBar
        barStyle={Tokens.mode === "dark" ? "light-content" : "dark-content"}
        backgroundColor={backgroundColor}
      />
      {scrollable ? (
        <ScrollView
          style={[styles.container, style]}
          contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.container, style]}>{children}</View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Tokens.layout.pagePadding,
    paddingTop: Tokens.spacing.sm,
    paddingBottom: Tokens.spacing["3xl"],
    gap: Tokens.layout.screenGap,
  },
});
