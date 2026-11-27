import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  PLATFORM_CODE_REGISTRY,
  type PlatformPresenceRecord,
  type PlatformPresenceSummary,
} from "@drts/contracts";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { StatusChip } from "@/components/ui/StatusChip";
import { Tokens } from "@/components/ui/tokens";
import { formatDriverError, getDriverClient } from "@/lib/api-client";
import {
  canReceiveOrders,
  deriveBlockingReasons,
  isRealPlatformPresence,
} from "@/lib/platform-presence-view";
import { driverStrings } from "@/lib/strings";

interface PlatformBindingProps {
  showSectionTitle?: boolean;
}

function getPlatformDisplayName(record: PlatformPresenceRecord): string {
  return (
    PLATFORM_CODE_REGISTRY[record.platformCode]?.displayName ??
    record.platformCode
  );
}

// Read-only on purpose; nothing in the product binds an external platform
// account yet. The old driver-side bind only marked the platform online
// without an account, and the app sends no platform heartbeats, so that
// status went stale and then blocked the driver's own fleet dispatch. Those
// unbound leftovers are not listed.
export function PlatformBinding({
  showSectionTitle = true,
}: PlatformBindingProps) {
  const [presences, setPresences] = useState<PlatformPresenceRecord[]>([]);
  const [adapterStatuses, setAdapterStatuses] = useState<
    PlatformPresenceSummary["adapterStatuses"]
  >([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const summary = await getDriverClient().getPlatformPresence();
        if (!active) return;
        setPresences((summary.presences ?? []).filter(isRealPlatformPresence));
        setAdapterStatuses(summary.adapterStatuses ?? []);
        setLoadError(null);
      } catch (error) {
        if (!active) return;
        setLoadError(
          `平台綁定資料暫時無法載入：${formatDriverError(error, "要求失敗")}`,
        );
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" />
        <Text style={styles.loadingText}>載入平台綁定中…</Text>
      </View>
    );
  }

  const adapterStatusMap = new Map(
    (adapterStatuses ?? []).map((item) => [item.platformCode, item]),
  );
  const rows = [...presences]
    .map((record) => {
      const adapterStatus = adapterStatusMap.get(record.platformCode);
      const canReceive = canReceiveOrders(record, adapterStatus);
      return {
        record,
        displayName: getPlatformDisplayName(record),
        canReceive,
        reasons: canReceive ? [] : deriveBlockingReasons(record, adapterStatus),
      };
    })
    .sort((left, right) =>
      left.displayName.localeCompare(right.displayName, "zh-TW"),
    );

  return (
    <View>
      {showSectionTitle ? (
        <Text style={styles.sectionTitle}>平台帳號綁定</Text>
      ) : null}

      {loadError ? (
        <ErrorBanner message={loadError} style={styles.errorBanner} />
      ) : null}

      {rows.length === 0 && !loadError ? (
        <Text style={styles.emptyText}>目前沒有綁定外部平台。</Text>
      ) : null}

      {rows.map(({ record, displayName, canReceive, reasons }) => (
        <View key={record.platformCode} style={styles.bindingRow}>
          <View style={styles.bindingHeader}>
            <Text style={styles.bindingName}>{displayName}</Text>
            <StatusChip
              label={canReceive ? "可接單" : "暫停接單"}
              variant={canReceive ? "success" : "warning"}
            />
          </View>
          {reasons.length > 0 ? (
            <Text style={styles.bindingReasons}>{reasons.join("、")}</Text>
          ) : null}
        </View>
      ))}

      <Text style={styles.contactNote}>
        {driverStrings.platformPresence.noInAppBinding}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    ...Tokens.type.sectionTitle,
    color: Tokens.colors.textStrong,
    marginBottom: Tokens.spacing.xs,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Tokens.spacing.sm,
  },
  loadingText: {
    ...Tokens.type.body,
    color: Tokens.colors.textMuted,
    marginLeft: Tokens.spacing.sm,
  },
  errorBanner: {
    marginBottom: Tokens.spacing.md,
  },
  emptyText: {
    ...Tokens.type.body,
    color: Tokens.colors.textMuted,
    marginBottom: Tokens.spacing.sm,
  },
  bindingRow: {
    paddingVertical: Tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Tokens.colors.border,
    gap: Tokens.spacing.xs,
  },
  bindingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Tokens.spacing.sm,
  },
  bindingName: {
    ...Tokens.type.label,
    color: Tokens.colors.textStrong,
    fontWeight: "600",
    flex: 1,
  },
  bindingReasons: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
  },
  contactNote: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
    marginTop: Tokens.spacing.sm,
  },
});
