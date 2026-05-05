import React from "react";
import { StyleSheet, View, Text, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "./tokens";

interface ErrorBannerProps {
  message: string;
  style?: ViewStyle;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message, style }) => {
  return (
    <View style={[styles.container, style]}>
      <Ionicons name="alert-circle" size={20} color={Tokens.colors.danger} />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Tokens.colors.surfaceDanger,
    padding: Tokens.spacing.md,
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
    borderColor: Tokens.colors.danger,
    marginBottom: Tokens.spacing.md,
  },
  message: {
    ...Tokens.type.label,
    color: Tokens.colors.danger,
    marginLeft: Tokens.spacing.sm,
    flex: 1,
  },
});
