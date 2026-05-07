import React from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ViewStyle,
} from "react-native";
import { Tokens } from "./tokens";

interface SegmentedControlOption {
  label: string;
  value: string;
}

interface SegmentedControlProps {
  options: SegmentedControlOption[];
  selectedValue: string;
  onValueChange: (value: string) => void;
  style?: ViewStyle;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  options,
  selectedValue,
  onValueChange,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      {options.map((option) => {
        const isSelected = option.value === selectedValue;
        return (
          <TouchableOpacity
            key={option.value}
            style={[styles.segment, isSelected && styles.selectedSegment]}
            onPress={() => onValueChange(option.value)}
            activeOpacity={0.7}
          >
            <Text style={[styles.label, isSelected && styles.selectedLabel]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: Tokens.colors.surfaceLo,
    borderRadius: 12,
    padding: 2,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
  },
  segment: {
    flex: 1,
    paddingVertical: Tokens.spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  selectedSegment: {
    backgroundColor: Tokens.colors.surface,
    ...Tokens.shadows.sm,
  },
  label: {
    ...Tokens.type.label,
    color: Tokens.colors.textMuted,
  },
  selectedLabel: {
    color: Tokens.colors.textStrong,
    fontWeight: "600",
  },
});
