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
import type { DriverStatementRecord, MoneyAmount } from "@drts/contracts";
import { getDriverClient } from "@/lib/api-client";

function formatMoney(amount: MoneyAmount | null | undefined): string {
  if (!amount) {
    return "Amount pending";
  }
  return `${amount.currency} ${(amount.amountMinor / 100).toFixed(2)}`;
}

export default function EarningsScreen() {
  const [statements, setStatements] = useState<DriverStatementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [earningsEnabled, setEarningsEnabled] = useState(true);
  const router = useRouter();

  const loadStatements = async () => {
    const client = getDriverClient();
    try {
      setStatements(await client.listDriverStatements());
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
        {statements.length} statement(s) found
      </Text>

      {error && <Text style={styles.error}>Error: {error}</Text>}

      {statements.length === 0 ? (
        <Text style={styles.empty}>No earnings data available yet.</Text>
      ) : (
        <FlatList
          data={statements}
          keyExtractor={(item, i) => item.statementId ?? String(i)}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.stmtId}>{item.statementId}</Text>
              <Text style={styles.stmtAmount}>
                Net: {formatMoney(item.netAmount)}
              </Text>
              <Text style={styles.stmtMeta}>
                Gross: {formatMoney(item.grossEarning)}
              </Text>
              <Text style={styles.stmtMeta}>Period: {item.periodMonth}</Text>
              <Text style={styles.stmtPeriod}>
                Payout status: {item.payoutStatus}
              </Text>
            </View>
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

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
  card: {
    padding: 12,
    marginBottom: 8,
    backgroundColor: "#f0fff0",
    borderRadius: 8,
  },
  stmtId: { fontSize: 16, fontWeight: "600" },
  stmtAmount: { fontSize: 20, fontWeight: "bold", color: "#2a7", marginTop: 4 },
  stmtMeta: { fontSize: 12, color: "#444", marginTop: 4 },
  stmtPeriod: { fontSize: 12, color: "#666", marginTop: 4 },
  footer: { marginTop: 16, alignItems: "center" },
  link: { color: "#007AFF", fontSize: 16 },
  label: { marginTop: 8, color: "#666" },
});
