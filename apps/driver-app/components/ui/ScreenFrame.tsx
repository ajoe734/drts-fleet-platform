import React from "react";
import { View, StyleSheet } from "react-native";
import { tokens } from "./tokens";

interface ScreenFrameProps {
  children: React.ReactNode;
}

export const ScreenFrame: React.FC<ScreenFrameProps> = ({ children }) => {
  return <View style={styles.container}>{children}</View>;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.appBg,
    paddingHorizontal: tokens.spacing[16], // Example padding, adjust as needed
    paddingTop: tokens.spacing[16], // Example padding, adjust as needed
    // Potentially add bottom padding if BottomActionBar is always present
  },
});
