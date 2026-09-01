import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";

interface KeyboardAvoidingScreenProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
}

// The one shared keyboard-avoiding container for every driver-app input
// screen. iOS has no native window resize on keyboard show, so it needs the
// "padding" behavior to push sibling content (e.g. a bottom action bar) above
// the keyboard. Android relies on `softwareKeyboardLayoutMode: "resize"`
// (app.json) to resize the window natively, so this stays a plain View there
// -- stacking KeyboardAvoidingView's own "height"/"padding" adjustment on top
// of a native resize double-compensates and jitters the layout.
export const KeyboardAvoidingScreen: React.FC<KeyboardAvoidingScreenProps> = ({
  children,
  style,
  keyboardVerticalOffset = 0,
}) => {
  return (
    <KeyboardAvoidingView
      style={[styles.container, style]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {children}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
