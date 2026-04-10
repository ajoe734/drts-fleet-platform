import { Link } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface PlaceholderScreenProps {
  title: string;
  description: string;
  nextHref?: string;
  nextLabel?: string;
  children?: ReactNode;
}

export function PlaceholderScreen({
  title,
  description,
  nextHref,
  nextLabel,
  children,
}: PlaceholderScreenProps) {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Driver app bootstrap</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        {children}
        {nextHref && nextLabel ? (
          <Link href={nextHref} asChild>
            <Pressable style={styles.button}>
              <Text style={styles.buttonText}>{nextLabel}</Text>
            </Pressable>
          </Link>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    backgroundColor: "#f4f7fb",
  },
  card: {
    borderRadius: 24,
    padding: 24,
    backgroundColor: "#ffffff",
    gap: 16,
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 3,
  },
  eyebrow: {
    color: "#0f766e",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0f172a",
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: "#475569",
  },
  button: {
    marginTop: 8,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 18,
    backgroundColor: "#0f766e",
    alignItems: "center",
  },
  buttonText: {
    color: "#f8fafc",
    fontWeight: "700",
    fontSize: 16,
  },
});
