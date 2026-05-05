import React from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  ViewStyle,
  TextInputProps,
} from "react-native";
import { Tokens } from "./tokens";

interface FormFieldProps extends TextInputProps {
  label: string;
  error?: string;
  helpText?: string;
  containerStyle?: ViewStyle;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  helpText,
  containerStyle,
  style,
  ...props
}) => {
  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, error ? styles.inputError : null, style]}
        placeholderTextColor={Tokens.colors.textMuted}
        {...props}
      />
      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : helpText ? (
        <Text style={styles.helpText}>{helpText}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Tokens.spacing.lg,
  },
  label: {
    ...Tokens.type.label,
    color: Tokens.colors.textStrong,
    marginBottom: Tokens.spacing.xs,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    borderRadius: Tokens.radius.md,
    paddingHorizontal: Tokens.spacing.md,
    backgroundColor: Tokens.colors.surface,
    color: Tokens.colors.textStrong,
    ...Tokens.type.body,
  },
  inputError: {
    borderColor: Tokens.colors.danger,
  },
  errorText: {
    ...Tokens.type.micro,
    color: Tokens.colors.danger,
    marginTop: 4,
  },
  helpText: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
    marginTop: 4,
  },
});
