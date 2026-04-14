import { useEffect, useState, useCallback, useRef } from "react";
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
  PlatformEarningsItem,
} from "@drts/contracts";
import { getDriverClient } from "@/lib/api-client";
import { EarningsByPlatform } from "@/components/earnings-by-platform";
import { formatMoney } from "@/lib/money";

type PeriodKey = "today" | "week" | "month";

function PeriodToggle({
  value,
  onChange,
}: {
  value: PeriodKey;
  onChange: (p: PeriodKey) => void;
}) {
  const tabs: { key: PeriodKey; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
  ];
  return (
    <View style={styles.tabBar}>
      {tabs.map((t) => (
        <Text
          key={t.key}
          onPress={() => onChange(t.key)}
          style={[styles.tabItem, value === t.key && styles.tabItemActive]}
        >
          {t.label}
        </Text>
      ))}
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
  const [period, setPeriod] = useState<PeriodKey>("today");
  const didInitRef = useRef(false);
  const router = useRouter();

  const loadStatements = async () => {
    const client = getDriverClient();
    try {
      const [stmts, earningsResp] = await Promise.all([
        client.listDriverStatements(),
        client.getPlatformEarningsByPlatform(period),
      ]);
      setStatements(stmts);
      setPlatformEarnings(earningsResp.items);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const reloadEarningsOnly = useCallback(async () => {
    const client = getDriverClient();
    try {
      const earningsResp = await client.getPlatformEarningsByPlatform(period);
      setPlatformEarnings(earningsResp.items);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, [period]);

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

  // refetch platform earnings when period changes
  useEffect(() => {
    // avoid double fetch on initial mount; first load already fetched earnings
    const didInit = didInitRef.current;
    if (didInit) {
      reloadEarningsOnly();
    } else {
      didInitRef.current = true;
    }
  }, [reloadEarningsOnly]);

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
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Per-Platform Earnings</Text>
                <PeriodToggle value={period} onChange={setPeriod} />
                <EarningsByPlatform items={platformEarnings} />
              </View>
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
  // card styles moved to reusable component
  stmtCard: {
    padding: 12,
    marginBottom: 8,
    backgroundColor: "#f0fff0",
    borderRadius: 8,
  },
  // moved layout rows to reusable component
  stmtId: { fontSize: 16, fontWeight: "600" },
  stmtAmount: { fontSize: 20, fontWeight: "bold", color: "#2a7", marginTop: 4 },
  stmtMeta: { fontSize: 12, color: "#444", marginTop: 4 },
  stmtPeriod: { fontSize: 12, color: "#666", marginTop: 4 },
  footer: { marginTop: 16, alignItems: "center" },
  link: { color: "#007AFF", fontSize: 16 },
  label: { marginTop: 8, color: "#666" },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#eef6ff",
    borderRadius: 8,
    padding: 4,
    marginBottom: 8,
  },
  tabItem: {
    flex: 1,
    textAlign: "center",
    paddingVertical: 8,
    color: "#0a66c2",
    fontWeight: "600",
  },
  tabItemActive: {
    backgroundColor: "#d6eaff",
    borderRadius: 6,
    color: "#084a8b",
  },
});
