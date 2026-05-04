import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { tokens } from "./tokens";

interface InfoTileProps {
  label: string;
  value: string;
  unit?: string;
  subtitle?: string;
}

export function InfoTile({ label, value, unit, subtitle }: InfoTileProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={styles.value}>{value}</Text>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.surface,
    padding: tokens.spacing[12],
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  label: {
    ...tokens.type.micro,
    color: tokens.colors.textMuted,
    fontWeight: "600",
    marginBottom: tokens.spacing[4],
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  value: {
    ...tokens.type.sectionTitle,
    color: tokens.colors.textStrong,
  },
  unit: {
    ...tokens.type.micro,
    color: tokens.colors.textMuted,
    marginLeft: tokens.spacing[2],
  },
  subtitle: {
    ...tokens.type.micro,
    color: tokens.colors.textMuted,
    marginTop: tokens.spacing[2],
  },
});
