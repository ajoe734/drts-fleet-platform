import React from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { tokens } from "./tokens";

interface FormFieldProps extends TextInputProps {
  label: string;
  error?: string;
  helpText?: string;
}

export function FormField({
  label,
  error,
  helpText,
  style,
  ...props
}: FormFieldProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          error ? styles.inputError : null,
          props.multiline ? styles.inputMultiline : null,
          style,
        ]}
        placeholderTextColor={tokens.colors.textMuted}
        {...props}
      />
      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : helpText ? (
        <Text style={styles.helpText}>{helpText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: tokens.spacing[16],
  },
  label: {
    ...tokens.type.label,
    color: tokens.colors.textStrong,
    marginBottom: tokens.spacing[4],
    fontWeight: "600",
  },
  input: {
    ...tokens.type.body,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.spacing[12],
    paddingVertical: tokens.spacing[10],
    color: tokens.colors.textStrong,
    minHeight: 44,
  },
  inputMultiline: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  inputError: {
    borderColor: tokens.colors.danger,
    backgroundColor: tokens.colors.surfaceDanger,
  },
  errorText: {
    ...tokens.type.micro,
    color: tokens.colors.danger,
    marginTop: tokens.spacing[4],
  },
  helpText: {
    ...tokens.type.micro,
    color: tokens.colors.textMuted,
    marginTop: tokens.spacing[4],
  },
});
