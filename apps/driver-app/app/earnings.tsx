import { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import type {
  DriverStatementRecord,
  PlatformEarningsItem,
} from "@drts/contracts";
import { getDriverClient } from "@/lib/api-client";
import { EarningsByPlatform } from "@/components/earnings-by-platform";
import { formatMoney } from "@/lib/money";
import { formatDriverPayoutStatusLabel } from "@/lib/operational-labels";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Tokens } from "@/components/ui/tokens";
import { AppScreen } from "@/components/ui/AppScreen";
import { PageHeader } from "@/components/ui/PageHeader";

type PeriodKey = "today" | "week" | "month";

export default function EarningsScreen() {
  const [statements, setStatements] = useState<DriverStatementRecord[]>([]);
  const [platformEarnings, setPlatformEarnings] = useState<
    PlatformEarningsItem[]
  >([]);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const onRefresh = async () => {
    setRefreshing(true);
    await loadStatements();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <AppScreen scrollable={false}>
        <PageHeader title="收入與對帳" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Tokens.colors.primary} />
          <Text style={styles.label}>載入收入資料中…</Text>
        </View>
      </AppScreen>
    );
  }

  if (!earningsEnabled) {
    return (
      <AppScreen scrollable={false}>
        <PageHeader title="收入與對帳" />
        <View style={styles.center}>
          <Text style={styles.title}>收入檢視暫停提供</Text>
          <Text style={styles.empty}>此功能目前未啟用。</Text>
        </View>
      </AppScreen>
    );
  }

  const segmentedOptions = [
    { label: "今日", value: "today" },
    { label: "本週", value: "week" },
    { label: "本月", value: "month" },
  ];

  const totalRevenue = platformEarnings.reduce(
    (sum, item) => sum + (item.grossEarning?.amountMinor || 0),
    0,
  );
  const totalPayouts = platformEarnings.reduce(
    (sum, item) => sum + (item.netAmount?.amountMinor || 0),
    0,
  );

  return (
    <View style={{ flex: 1 }}>
      <AppScreen>
        <PageHeader title="收入與對帳" />

        <View style={styles.kpiContainer}>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>總收入</Text>
            <Text style={styles.kpiValue}>
              {formatMoney({ currency: "USD", amountMinor: totalRevenue })}
            </Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>總撥款</Text>
            <Text style={styles.kpiValue}>
              {formatMoney({ currency: "USD", amountMinor: totalPayouts })}
            </Text>
          </View>
        </View>

        {error && <Text style={styles.error}>錯誤：{error}</Text>}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>各平台收入</Text>
          <SegmentedControl
            options={segmentedOptions}
            selectedValue={period}
            onValueChange={(val) => setPeriod(val as PeriodKey)}
            style={styles.segmentedControl}
          />
          <EarningsByPlatform items={platformEarnings} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>最近對帳單</Text>
          {statements.length === 0 ? (
            <Text style={styles.empty}>目前尚無對帳單資料。</Text>
          ) : (
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableCell, styles.headerId]}>ID</Text>
                <Text style={[styles.tableCell, styles.headerPeriod]}>
                  期間
                </Text>
                <Text style={[styles.tableCell, styles.headerAmount]}>
                  實拿
                </Text>
                <Text style={[styles.tableCell, styles.headerStatus]}>
                  狀態
                </Text>
              </View>
              {statements.map((s) => (
                <View key={s.statementId} style={styles.tableRow}>
                  <Text
                    style={[styles.tableCell, styles.cellId]}
                    numberOfLines={1}
                  >
                    {s.statementId.slice(-6)}
                  </Text>
                  <Text style={[styles.tableCell, styles.cellPeriod]}>
                    {s.periodMonth}
                  </Text>
                  <Text style={[styles.tableCell, styles.cellAmount]}>
                    {formatMoney(s.netAmount)}
                  </Text>
                  <Text style={[styles.tableCell, styles.cellStatus]}>
                    {formatDriverPayoutStatusLabel(s.payoutStatus)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.link} onPress={() => router.push("/settings")}>
            開啟設定 →
          </Text>
        </View>
      </AppScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Tokens.spacing.xl,
  },
  title: { ...Tokens.type.sectionTitle, marginBottom: 4 },
  empty: {
    textAlign: "center",
    color: Tokens.colors.textMuted,
    marginTop: 32,
    ...Tokens.type.body,
  },
  error: { color: Tokens.colors.danger, marginBottom: 16 },
  section: { marginBottom: Tokens.spacing.xl },
  sectionTitle: {
    ...Tokens.type.label,
    fontWeight: "bold",
    marginBottom: Tokens.spacing.md,
    color: Tokens.colors.textStrong,
  },
  kpiContainer: {
    flexDirection: "row",
    backgroundColor: Tokens.colors.surfaceMuted,
    borderRadius: Tokens.radius.md,
    padding: Tokens.spacing.lg,
    marginBottom: Tokens.spacing.xl,
  },
  kpiBox: {
    flex: 1,
    alignItems: "center",
  },
  kpiLabel: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
    marginBottom: 4,
  },
  kpiValue: {
    ...Tokens.type.sectionTitle,
    color: Tokens.colors.primary,
  },
  segmentedControl: {
    marginBottom: Tokens.spacing.lg,
  },
  table: {
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    borderRadius: Tokens.radius.md,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: Tokens.colors.surfaceMuted,
    paddingVertical: Tokens.spacing.sm,
    paddingHorizontal: Tokens.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Tokens.colors.border,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: Tokens.spacing.md,
    paddingHorizontal: Tokens.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Tokens.colors.border,
    backgroundColor: Tokens.colors.surface,
  },
  tableCell: {
    ...Tokens.type.micro,
    color: Tokens.colors.textBody,
  },
  headerId: { flex: 1 },
  headerPeriod: { flex: 2 },
  headerAmount: { flex: 2, textAlign: "right" },
  headerStatus: { flex: 2, textAlign: "right" },
  cellId: { flex: 1, color: Tokens.colors.textMuted },
  cellPeriod: { flex: 2 },
  cellAmount: {
    flex: 2,
    textAlign: "right",
    fontWeight: "bold",
    color: Tokens.colors.success,
  },
  cellStatus: { flex: 2, textAlign: "right" },
  footer: {
    marginTop: Tokens.spacing.xl,
    paddingBottom: Tokens.spacing.xl,
    alignItems: "center",
  },
  link: { ...Tokens.type.body, color: Tokens.colors.primary },
  label: { marginTop: 8, color: Tokens.colors.textMuted },
});
