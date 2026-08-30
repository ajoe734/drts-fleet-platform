import React, { useEffect, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  type KeyboardEvent,
  Platform,
  ScrollView,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type KeyboardAvoidingBehavior = "padding" | "height" | "position" | undefined;

export interface KeyboardAvoidingContainerProps {
  children?: React.ReactNode;
  footer?: React.ReactNode;
  scrollable?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
  behavior?: KeyboardAvoidingBehavior;
  platformOS?: string;
  keyboardShouldPersistTaps?: "always" | "never" | "handled";
  extraBottomSpacing?: number;
  showsVerticalScrollIndicator?: boolean;
  testID?: string;
  scrollViewRef?: React.RefObject<ScrollView | null>;
  onKeyboardChange?: (visible: boolean, height: number) => void;
  insets?: { bottom?: number; top?: number; left?: number; right?: number };
}

const DEFAULT_BOTTOM_SPACING = 16;
const DEFAULT_MAX_BOTTOM = 32;
const DEFAULT_PAGE_PADDING = 16;
const DEFAULT_TOP_PADDING = 8;
const DEFAULT_GAP = 12;

/**
 * Resolves keyboard avoiding behavior per platform.
 * - iOS: 'padding' against the keyboard frame.
 * - Android: undefined, deferring to native windowSoftInputMode="adjustPan" from AndroidManifest.
 * - Web/other: undefined.
 */
export function resolveKeyboardAvoidingBehavior(
  platformOS?: string,
  override?: KeyboardAvoidingBehavior,
): KeyboardAvoidingBehavior {
  if (override !== undefined) {
    return override;
  }
  const os = platformOS ?? Platform.OS;
  if (os === "ios") {
    return "padding";
  }
  return undefined;
}

export function useKeyboardState() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    if (!Keyboard || typeof Keyboard.addListener !== "function") {
      return;
    }

    const isIos = Platform.OS === "ios";
    const showEvent = isIos ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = isIos ? "keyboardWillHide" : "keyboardDidHide";

    let showSub: { remove: () => void } | undefined;
    let hideSub: { remove: () => void } | undefined;

    try {
      showSub = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
        const height = e?.endCoordinates?.height ?? 0;
        setKeyboardHeight(height);
        setIsKeyboardVisible(true);
      });
    } catch {
      // Safe fallback if listener fails in mock/test environment
    }

    try {
      hideSub = Keyboard.addListener(hideEvent, () => {
        setKeyboardHeight(0);
        setIsKeyboardVisible(false);
      });
    } catch {
      // Safe fallback if listener fails in mock/test environment
    }

    return () => {
      showSub?.remove?.();
      hideSub?.remove?.();
    };
  }, []);

  return { keyboardHeight, isKeyboardVisible };
}

export function KeyboardAvoidingContainer({
  children,
  footer,
  scrollable = true,
  style,
  contentContainerStyle,
  keyboardVerticalOffset,
  behavior,
  platformOS,
  keyboardShouldPersistTaps = "handled",
  extraBottomSpacing = DEFAULT_BOTTOM_SPACING,
  showsVerticalScrollIndicator = true,
  testID = "keyboard-avoiding-container",
  scrollViewRef,
  onKeyboardChange,
  insets: insetsOverride,
}: KeyboardAvoidingContainerProps) {
  const currentPlatformOS = platformOS ?? Platform.OS;
  const resolvedBehavior = resolveKeyboardAvoidingBehavior(
    currentPlatformOS,
    behavior,
  );

  const hookInsets = useSafeAreaInsets();
  const insets = insetsOverride ?? hookInsets ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const { keyboardHeight, isKeyboardVisible } = useKeyboardState();

  useEffect(() => {
    onKeyboardChange?.(isKeyboardVisible, keyboardHeight);
  }, [isKeyboardVisible, keyboardHeight, onKeyboardChange]);

  const isIos = currentPlatformOS === "ios";
  const offset = keyboardVerticalOffset ?? 0;

  const containerContent = scrollable ? (
    <ScrollView
      ref={scrollViewRef}
      testID={`${testID}-scrollview`}
      style={styles.scrollView}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingBottom:
            Math.max(insets.bottom ?? 0, DEFAULT_MAX_BOTTOM) +
            (isKeyboardVisible ? extraBottomSpacing : 0),
        },
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode={isIos ? "interactive" : "on-drag"}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.nonScrollContent, contentContainerStyle]}>
      {children}
    </View>
  );

  return (
    <KeyboardAvoidingView
      testID={testID}
      style={[styles.container, style]}
      behavior={resolvedBehavior}
      keyboardVerticalOffset={offset}
    >
      {containerContent}
      {footer ? (
        <View testID={`${testID}-footer`} style={styles.footer}>
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: DEFAULT_PAGE_PADDING,
    paddingTop: DEFAULT_TOP_PADDING,
    gap: DEFAULT_GAP,
  },
  nonScrollContent: {
    flex: 1,
  },
  footer: {
    width: "100%",
  },
});
