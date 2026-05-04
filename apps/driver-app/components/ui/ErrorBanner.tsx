import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { tokens } from "./tokens";

interface ErrorBannerProps {
  message: string;
}

export function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <View style={styles.container}>
      <Ionicons
        name="alert-circle"
        size={20}
        color={tokens.colors.danger}
        style={styles.icon}
      />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tokens.colors.surfaceDanger,
    padding: tokens.spacing[12],
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.colors.danger,
    marginVertical: tokens.spacing[8],
  },
  icon: {
    marginRight: tokens.spacing[8],
  },
  text: {
    ...tokens.type.label,
    color: tokens.colors.danger,
    flex: 1,
  },
});
