import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import type { PlatformEarningsItem } from "@drts/contracts";
import { formatMoney } from "@/lib/money";

if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

function EarningRow({
  label,
  value,
  net,
}: {
  label: string;
  value: string;
  net?: boolean;
}) {
  return (
    <View style={[styles.row, net && styles.netRow]}>
      <Text style={[styles.rowLabel, net && styles.netLabel]}>{label}:</Text>
      <Text style={[styles.rowValue, net && styles.netValue]}>{value}</Text>
    </View>
  );
}

function PlatformCard({ item }: { item: PlatformEarningsItem }) {
  const [expanded, setExpanded] = useState(false);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  return (
    <TouchableOpacity onPress={toggle} style={styles.card} activeOpacity={0.8}>
      <View style={styles.cardHeader}>
        <Text style={styles.platformCode}>{item.platformCode}</Text>
        <Text style={styles.netSummary}>
          Net: {formatMoney(item.netAmount)}
        </Text>
        <Text style={styles.chevron}>{expanded ? "▲" : "▼"}</Text>
      </View>
      {expanded && (
        <View style={styles.detail}>
          <EarningRow label="Gross" value={formatMoney(item.grossEarning)} />
          <EarningRow
            label="Service Fee"
            value={formatMoney(item.serviceFee)}
          />
          <EarningRow label="Subsidy" value={formatMoney(item.subsidy)} />
          <EarningRow label="Net" value={formatMoney(item.netAmount)} net />
        </View>
      )}
    </TouchableOpacity>
  );
}

export function EarningsByPlatform({
  items,
}: {
  items: PlatformEarningsItem[];
}) {
  if (items.length === 0) {
    return <Text style={styles.empty}>No earnings data for this period.</Text>;
  }
  return (
    <View>
      {items.map((item) => (
        <PlatformCard key={item.platformCode} item={item} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#e3f2fd",
    borderRadius: 8,
    marginBottom: 8,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  platformCode: {
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
  },
  netSummary: {
    fontSize: 14,
    fontWeight: "500",
    marginRight: 8,
    color: "#2a7",
  },
  chevron: {
    fontSize: 12,
    color: "#555",
  },
  detail: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: "#b3d9f8",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  netRow: {
    borderTopWidth: 1,
    borderTopColor: "#bbb",
    paddingTop: 6,
    marginTop: 8,
  },
  rowLabel: { fontSize: 13, color: "#555" },
  rowValue: { fontSize: 13, fontWeight: "500" },
  netLabel: { fontSize: 14, fontWeight: "bold" },
  netValue: { fontSize: 14, fontWeight: "bold", color: "#2a7" },
  empty: { textAlign: "center", color: "#999", marginTop: 16 },
});
