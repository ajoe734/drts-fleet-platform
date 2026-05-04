import React from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  View,
  ViewProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { tokens } from "./tokens";

interface AppScreenProps extends ViewProps {
  children?: React.ReactNode;
  scrollable?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  isEmpty?: boolean;
  errorComponent?: React.ReactNode;
  emptyComponent?: React.ReactNode;
}

export function AppScreen({
  children,
  scrollable = true,
  isLoading,
  isError,
  isEmpty,
  errorComponent,
  emptyComponent,
  style,
  ...props
}: AppScreenProps) {
  const content = (
    <View style={[styles.content, style]} {...props}>
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={tokens.colors.primary} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.center}>{errorComponent}</View>
      ) : isEmpty ? (
        <View style={styles.center}>{emptyComponent}</View>
      ) : (
        children
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
      {scrollable ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.appBg,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: tokens.spacing[16],
    paddingBottom: tokens.spacing[24],
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
