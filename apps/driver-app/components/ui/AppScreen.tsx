import React from "react";
import {
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ViewStyle,
  StyleProp,
} from "react-native";
import { Tokens } from "./tokens";
import {
  KeyboardAvoidingContainer,
  type KeyboardAvoidingBehavior,
} from "./KeyboardAvoidingContainer";

export interface AppScreenProps {
  children?: React.ReactNode;
  footer?: React.ReactNode;
  scrollable?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  backgroundColor?: string;
  keyboardVerticalOffset?: number;
  behavior?: KeyboardAvoidingBehavior;
  keyboardShouldPersistTaps?: "always" | "never" | "handled";
  extraBottomSpacing?: number;
  testID?: string;
}

export const AppScreen: React.FC<AppScreenProps> = ({
  children,
  footer,
  scrollable = true,
  style,
  contentContainerStyle,
  backgroundColor = Tokens.colors.appBg,
  keyboardVerticalOffset,
  behavior,
  keyboardShouldPersistTaps = "handled",
  extraBottomSpacing,
  testID,
}) => {
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <StatusBar
        barStyle={Tokens.mode === "dark" ? "light-content" : "dark-content"}
        backgroundColor={backgroundColor}
      />
      <KeyboardAvoidingContainer
        scrollable={scrollable}
        style={style}
        contentContainerStyle={contentContainerStyle}
        keyboardVerticalOffset={keyboardVerticalOffset}
        behavior={behavior}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        extraBottomSpacing={extraBottomSpacing}
        footer={footer}
        testID={testID}
      >
        {children}
      </KeyboardAvoidingContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
});
