import React from "react";
import {
  StyleSheet,
  TouchableOpacity,
  View,
  Text,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "./tokens";

interface ListCardProps {
  title: string;
  subtitle?: string;
  meta?: string;
  statusElement?: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}

export const ListCard: React.FC<ListCardProps> = ({
  title,
  subtitle,
  meta,
  statusElement,
  onPress,
  style,
}) => {
  const Container = onPress ? TouchableOpacity : View;

  return (
    <Container
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.container, style]}
    >
      <View style={styles.mainContent}>
        <View style={styles.headerRow}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {statusElement}
        </View>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
      {onPress && (
        <View style={styles.chevron}>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={Tokens.colors.borderStrong}
          />
        </View>
      )}
    </Container>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.lg,
    padding: Tokens.spacing.lg,
    marginBottom: Tokens.spacing.sm,
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    ...Tokens.shadows.sm,
  },
  mainContent: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  title: {
    ...Tokens.type.title,
    fontWeight: "600",
    color: Tokens.colors.text,
    flex: 1,
    marginRight: Tokens.spacing.sm,
  },
  subtitle: {
    ...Tokens.type.body,
    color: Tokens.colors.textBody,
    marginBottom: 2,
  },
  meta: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
  },
  chevron: {
    marginLeft: Tokens.spacing.sm,
  },
});
