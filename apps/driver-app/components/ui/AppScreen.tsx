import React from "react";
import {
  StyleSheet,
  View,
  SafeAreaView,
  ScrollView,
  StatusBar,
  ViewStyle,
} from "react-native";
import { Tokens } from "./tokens";

interface AppScreenProps {
  children: React.ReactNode;
  scrollable?: boolean;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
  backgroundColor?: string;
}

export const AppScreen: React.FC<AppScreenProps> = ({
  children,
  scrollable = true,
  style,
  contentContainerStyle,
  backgroundColor = Tokens.colors.appBg,
}) => {
  const Container = scrollable ? ScrollView : View;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <StatusBar
        barStyle={Tokens.mode === "dark" ? "light-content" : "dark-content"}
        backgroundColor={backgroundColor}
      />
      <Container
        style={[styles.container, style]}
        contentContainerStyle={
          scrollable ? [styles.scrollContent, contentContainerStyle] : undefined
        }
      >
        {children}
      </Container>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Tokens.layout.pagePadding,
    paddingTop: Tokens.spacing.sm,
    paddingBottom: Tokens.spacing["3xl"],
    gap: Tokens.layout.screenGap,
  },
});
