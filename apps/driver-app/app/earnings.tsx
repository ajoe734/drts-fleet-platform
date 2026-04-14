import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import type {
  DriverStatementRecord,
  MoneyAmount,
  PlatformEarningsItem,
} from "@drts/contracts";
import { getDriverClient } from "@/lib/api-client";

function formatMoney(amount: MoneyAmount | null | undefined): string {
  if (!amount) {
    return "Amount pending";
  }
  return `${amount.currency} ${(amount.amountMinor / 100).toFixed(2)}`;
}

function PlatformEarningsSection({
  title,
  items,
}: {
  title: string;
  items: PlatformEarningsItem[];
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.length === 0 ? (
        <Text style={styles.empty}>No earnings data for this platform.</Text>
      ) : (
        items.map((item) => (
          <View key={item.platformCode} style={styles.card}>
            <Text style={styles.platformHeader}>{item.platformCode}</Text>
            <View style={styles.earningsRow}>
              <Text style={styles.earningLabel}>Gross:</Text>
              <Text style={styles.earningValue}>
                {formatMoney(item.grossEarning)}
              </Text>
            </View>
            <View style={styles.earningsRow}>
              <Text style={styles.earningLabel}>Service Fee:</Text>
              <Text style={styles.earningValue}>
                {formatMoney(item.serviceFee)}
              </Text>
            </View>
            <View style={styles.earningsRow}>
              <Text style={styles.earningLabel}>Subsidy:</Text>
              <Text style={styles.earningValue}>
                {formatMoney(item.subsidy)}
              </Text>
            </View>
            <View style={[styles.earningsRow, styles.netRow]}>
              <Text style={styles.netLabel}>Net:</Text>
              <Text style={styles.netValue}>{formatMoney(item.netAmount)}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

export default function EarningsScreen() {
  const [statements, setStatements] = useState<DriverStatementRecord[]>([]);
  const [platformEarnings, setPlatformEarnings] = useState<
    PlatformEarningsItem[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [earningsEnabled, setEarningsEnabled] = useState(true);
  const router = useRouter();

  const loadStatements = async () => {
    const client = getDriverClient();
    try {
      const [stmts, earningsResp] = await Promise.all([
        client.listDriverStatements(),
        client.getPlatformEarningsByPlatform(),
      ]);
      setStatements(stmts);
      setPlatformEarnings(earningsResp.items);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    const client = getDriverClient();

    client
      .isFeatureEnabled("driver-app.earnings")
      .then((enabled) => {
        setEarningsEnabled(enabled);
        if (enabled) {
          loadStatements();
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        loadStatements();
      })
      .finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStatements();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.label}>Loading earnings...</Text>
      </View>
    );
  }

  if (!earningsEnabled) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Earnings Unavailable</Text>
        <Text style={styles.empty}>
          The earnings read model is currently disabled.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Earnings</Text>
      <Text style={styles.subtitle}>
        {statements.length} statement(s) | {platformEarnings.length} platform(s)
      </Text>

      {error && <Text style={styles.error}>Error: {error}</Text>}

      <FlatList
        data={[{ key: "platforms" }, { key: "statements" }]}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => {
          if (item.key === "platforms") {
            return (
              <PlatformEarningsSection
                title="Per-Platform Earnings"
                items={platformEarnings}
              />
            );
          }
          // statements section
          if (statements.length === 0) {
            return (
              <Text style={styles.empty}>No earnings data available yet.</Text>
            );
          }
          return (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Statements</Text>
              {statements.map((s) => (
                <View key={s.statementId} style={styles.stmtCard}>
                  <Text style={styles.stmtId}>{s.statementId}</Text>
                  <Text style={styles.stmtAmount}>
                    Net: {formatMoney(s.netAmount)}
                  </Text>
                  <Text style={styles.stmtMeta}>
                    Gross: {formatMoney(s.grossEarning)}
                  </Text>
                  <Text style={styles.stmtMeta}>Period: {s.periodMonth}</Text>
                  <Text style={styles.stmtPeriod}>
                    Payout status: {s.payoutStatus}
                  </Text>
                </View>
              ))}
            </View>
          );
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />

      <View style={styles.footer}>
        <Text style={styles.link} onPress={() => router.push("/settings")}>
          Open Settings →
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 16 },
  error: { color: "red", marginBottom: 8 },
  empty: { textAlign: "center", color: "#999", marginTop: 32 },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#333",
  },
  card: {
    padding: 12,
    marginBottom: 8,
    backgroundColor: "#e3f2fd",
    borderRadius: 8,
  },
  stmtCard: {
    padding: 12,
    marginBottom: 8,
    backgroundColor: "#f0fff0",
    borderRadius: 8,
  },
  platformHeader: { fontSize: 16, fontWeight: "600", marginBottom: 6 },
  earningsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  earningLabel: { fontSize: 13, color: "#555" },
  earningValue: { fontSize: 13, fontWeight: "500" },
  netRow: {
    borderTopWidth: 1,
    borderTopColor: "#bbb",
    paddingTop: 6,
    marginTop: 6,
  },
  netLabel: { fontSize: 14, fontWeight: "bold" },
  netValue: { fontSize: 14, fontWeight: "bold", color: "#2a7" },
  stmtId: { fontSize: 16, fontWeight: "600" },
  stmtAmount: { fontSize: 20, fontWeight: "bold", color: "#2a7", marginTop: 4 },
  stmtMeta: { fontSize: 12, color: "#444", marginTop: 4 },
  stmtPeriod: { fontSize: 12, color: "#666", marginTop: 4 },
  footer: { marginTop: 16, alignItems: "center" },
  link: { color: "#007AFF", fontSize: 16 },
  label: { marginTop: 8, color: "#666" },
});
