import React from "react";
import { StyleSheet, View, ViewStyle, SafeAreaView } from "react-native";
import { Tokens } from "./tokens";

interface BottomActionBarProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export const BottomActionBar: React.FC<BottomActionBarProps> = ({
  children,
  style,
}) => {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.container, style]}>{children}</View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: Tokens.colors.surface,
    borderTopWidth: 1,
    borderTopColor: Tokens.colors.border,
  },
  container: {
    padding: Tokens.spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
});
