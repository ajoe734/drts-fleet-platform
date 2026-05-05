import React from "react";
import { StyleSheet, View, Text, ViewStyle } from "react-native";
import { Tokens } from "./tokens";

interface InfoTileProps {
  label: string;
  value: string;
  unit?: string;
  style?: ViewStyle;
}

export const InfoTile: React.FC<InfoTileProps> = ({
  label,
  value,
  unit,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueContainer}>
        <Text style={styles.value}>{value}</Text>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Tokens.colors.surface,
    padding: Tokens.spacing.md,
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    minHeight: 80,
    justifyContent: "center",
  },
  label: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
    marginBottom: Tokens.spacing.xs,
  },
  valueContainer: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  value: {
    ...Tokens.type.sectionTitle,
    color: Tokens.colors.textStrong,
  },
  unit: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
    marginLeft: 2,
  },
});
