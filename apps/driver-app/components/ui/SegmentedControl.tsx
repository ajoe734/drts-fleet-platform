import React from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { tokens } from "./tokens";

interface SegmentedControlProps<T> {
  options: { label: string; value: T }[];
  selectedValue?: T;
  onValueChange?: (value: T) => void;
  value?: T;
  onChange?: (value: T) => void;
  variant?: "primary" | "secondary";
}

export function SegmentedControl<T>({
  options,
  selectedValue,
  onValueChange,
  value,
  onChange,
  variant = "primary",
}: SegmentedControlProps<T>) {
  const currentValue = selectedValue ?? value;
  const handleValueChange = onValueChange ?? onChange;

  return (
    <View style={styles.container}>
      {options.map((option) => {
        const isSelected = Object.is(currentValue, option.value);
        return (
          <Pressable
            disabled={!handleValueChange}
            key={String(option.value)}
            onPress={() => handleValueChange?.(option.value)}
            style={({ pressed }) => [
              styles.optionBase,
              variantStyles[variant],
              isSelected ? selectedStyles[variant] : unselectedStyles[variant],
              pressed && pressedStyles[variant],
            ]}
          >
            <Text
              style={[
                styles.optionText,
                isSelected
                  ? selectedTextStyles[variant]
                  : unselectedTextStyles[variant],
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderRadius: tokens.radius.md,
    overflow: "hidden", // Ensures children respect the border radius
    borderWidth: 1,
    borderColor: tokens.colors.border, // Default border color
  },
  optionBase: {
    flex: 1,
    paddingVertical: tokens.spacing[12],
    paddingHorizontal: tokens.spacing[16],
    alignItems: "center",
    justifyContent: "center",
  },
  optionText: {
    ...tokens.type.bodyBold,
  },

  // Primary Variant
  primary: {
    backgroundColor: tokens.colors.surface,
  },
  primarySelected: {
    backgroundColor: tokens.colors.primary,
  },
  primaryUnselected: {
    backgroundColor: tokens.colors.surface,
  },
  primaryPressed: {
    backgroundColor: tokens.colors.surfaceMuted,
  },
  primarySelectedText: {
    color: tokens.colors.textInverse,
  },
  primaryUnselectedText: {
    color: tokens.colors.textStrong,
  },

  // Secondary Variant
  secondary: {
    backgroundColor: tokens.colors.surfaceMuted,
  },
  secondarySelected: {
    backgroundColor: tokens.colors.surface,
    borderLeftWidth: 1,
    borderLeftColor: tokens.colors.border, // Add a separator for secondary selected
  },
  secondaryUnselected: {
    backgroundColor: tokens.colors.surfaceMuted,
  },
  secondaryPressed: {
    backgroundColor: tokens.colors.border,
  },
  secondarySelectedText: {
    color: tokens.colors.textStrong,
  },
  secondaryUnselectedText: {
    color: tokens.colors.textMuted,
  },
});

const variantStyles = {
  primary: styles.primary,
  secondary: styles.secondary,
};

const selectedStyles = {
  primary: styles.primarySelected,
  secondary: styles.secondarySelected,
};

const unselectedStyles = {
  primary: styles.primaryUnselected,
  secondary: styles.secondaryUnselected,
};

const pressedStyles = {
  primary: styles.primaryPressed,
  secondary: styles.secondaryPressed,
};

const selectedTextStyles = {
  primary: styles.primarySelectedText,
  secondary: styles.secondarySelectedText,
};

const unselectedTextStyles = {
  primary: styles.primaryUnselectedText,
  secondary: styles.secondaryUnselectedText,
};
