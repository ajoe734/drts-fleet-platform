import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { DriverStatementRecord } from "@drts/contracts";
import { Banner, Btn, Pill, driverCanvasTheme } from "../canvas-primitives";
import { formatDriverError, getDriverClient } from "../../lib/api-client";
import {
  getDriverEarningsStatement,
  resolveDriverStatementDownload,
} from "../../lib/driver-statement-actions";
import { formatMoney } from "../../lib/money";
import { formatDriverPayoutStatusLabel } from "../../lib/operational-labels";
import { driverStrings } from "../../lib/strings";

const theme = driverCanvasTheme;
const copy = driverStrings.earnings.statement;

export function DriverStatementRow({
  statement,
  last,
  onLoaded,
}: {
  statement: DriverStatementRecord;
  last: boolean;
  onLoaded: (record: DriverStatementRecord) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<DriverStatementRecord | null>(null);
  const [busy, setBusy] = useState<"detail" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );

  const current = detail ?? statement;
  const download = resolveDriverStatementDownload(current);
  const load = async (operation: "detail" | "download") => {
    if (inFlight.current) return;
    inFlight.current = true;
    const requestGeneration = generation.current;
    setExpanded(true);
    setBusy(operation);
    setError(null);
    try {
      // Re-read before opening a download so a cached monthly list URL can
      // never prevent the server from refreshing an expired artifact link.
      const record = await getDriverEarningsStatement(
        getDriverClient(),
        statement.statementId,
      );
      if (generation.current !== requestGeneration) return;
      setDetail(record);
      onLoaded(record);
      if (operation === "download") {
        const target = resolveDriverStatementDownload(record);
        if (target.state !== "ready") {
          setError(copy[target.state]);
          return;
        }
        try {
          await Linking.openURL(target.url);
        } catch (openError) {
          if (generation.current === requestGeneration) {
            setError(formatDriverError(openError, copy.downloadError));
          }
        }
      }
    } catch (readError) {
      if (generation.current === requestGeneration) {
        setDetail(null);
        setError(formatDriverError(readError, copy.errorFallback));
      }
    } finally {
      inFlight.current = false;
      if (generation.current === requestGeneration) setBusy(null);
    }
  };

  return (
    <View
      style={[
        styles.container,
        { borderBottomColor: theme.border },
        last && styles.last,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${statement.periodMonth} ${expanded ? copy.close : copy.view}`}
        accessibilityState={{ expanded, disabled: busy !== null }}
        disabled={busy !== null}
        onPress={() => (expanded ? setExpanded(false) : void load("detail"))}
        style={styles.row}
      >
        <View style={styles.statementCopy}>
          <Text
            style={[
              styles.title,
              { color: theme.text, fontFamily: theme.fontFamily },
            ]}
          >
            {current.periodMonth} 月結
          </Text>
          <Text
            style={[
              styles.subtitle,
              { color: theme.textMuted, fontFamily: theme.fontFamily },
            ]}
          >
            {current.lines.length} 趟 ·{" "}
            {formatDriverPayoutStatusLabel(current.payoutStatus)}
          </Text>
          <Text
            style={[
              styles.subtitle,
              { color: theme.textDim, fontFamily: theme.fontFamily },
            ]}
          >
            {copy.receipt}：{current.receiptNo} · {copy.feePlan}：
            {current.feePlanVersion}
          </Text>
        </View>
        <View style={styles.value}>
          <Pill
            theme={theme}
            tone={current.payoutStatus === "paid" ? "success" : "warn"}
          >
            {formatDriverPayoutStatusLabel(current.payoutStatus)}
          </Pill>
          <Text
            style={[
              styles.amount,
              { color: theme.text, fontFamily: theme.monoFamily },
            ]}
          >
            {formatMoney(current.netAmount)}
          </Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-down" : "chevron-forward"}
          size={16}
          color={theme.textDim}
        />
      </Pressable>
      <View style={styles.actions}>
        <Btn
          theme={theme}
          size="xs"
          disabled={busy !== null}
          onPress={() => (expanded ? setExpanded(false) : void load("detail"))}
        >
          {expanded ? copy.close : copy.view}
        </Btn>
        <Btn
          theme={theme}
          size="xs"
          disabled={busy !== null || download.state === "missing"}
          onPress={() => void load("download")}
        >
          {copy.download}
        </Btn>
      </View>
      {expanded && (
        <View style={[styles.details, { backgroundColor: theme.surface }]}>
          {busy ? (
            <View style={styles.loading}>
              <ActivityIndicator size="small" color={theme.accent} />
              <Text style={{ color: theme.textMuted }}>
                {busy === "download" ? copy.opening : copy.loading}
              </Text>
            </View>
          ) : null}
          {error ? (
            <Banner
              theme={theme}
              tone="danger"
              title={copy.errorTitle}
              body={error}
            />
          ) : null}
          {!busy && (error || download.state !== "ready") ? (
            <Btn theme={theme} size="sm" onPress={() => void load("detail")}>
              {copy.retry}
            </Btn>
          ) : null}
          {!busy && !error && download.state !== "ready" ? (
            <Text style={styles.note}>{copy[download.state]}</Text>
          ) : null}
          {detail ? (
            <>
              <Text style={[styles.title, { color: theme.text }]}>
                {copy.net}：{formatMoney(detail.netAmount)}
              </Text>
              <Text style={styles.note}>
                {copy.gross}：{formatMoney(detail.grossEarning)} · {copy.fee}：
                {formatMoney(detail.serviceFee)} · {copy.subsidy}：
                {formatMoney(detail.subsidy)}
              </Text>
              <Text style={[styles.title, { color: theme.text }]}>
                {copy.lineItems}
              </Text>
              {detail.lines.length === 0 ? (
                <Text style={styles.note}>{copy.noLines}</Text>
              ) : (
                detail.lines.map((line) => (
                  <View
                    key={line.lineId}
                    style={[styles.line, { borderTopColor: theme.border }]}
                  >
                    <Text
                      style={[
                        styles.subtitle,
                        { color: theme.text, fontFamily: theme.monoFamily },
                      ]}
                    >
                      {line.orderId}
                    </Text>
                    <Text style={styles.note}>
                      {copy.net}：{formatMoney(line.netAmount)}
                    </Text>
                    <Text style={styles.note}>
                      {copy.gross}：{formatMoney(line.grossEarning)} ·{" "}
                      {copy.fee}：{formatMoney(line.serviceFee)} ·{" "}
                      {copy.subsidy}：{formatMoney(line.subsidy)}
                    </Text>
                    {line.reimbursementRequired ? (
                      <Text style={styles.note}>{copy.reimbursement}</Text>
                    ) : null}
                  </View>
                ))
              )}
              <Text style={styles.note}>{copy.downloadHint}</Text>
            </>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderBottomWidth: 1 },
  last: { borderBottomWidth: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  statementCopy: { flex: 1, gap: 4, minWidth: 0 },
  title: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    fontFamily: theme.fontFamily,
  },
  subtitle: { fontSize: 11.5, lineHeight: 16, flexShrink: 1 },
  value: { alignItems: "flex-end", gap: 6 },
  amount: {
    fontSize: 15.5,
    lineHeight: 18,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  details: { gap: 10, padding: 14 },
  loading: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  note: {
    color: theme.textMuted,
    fontFamily: theme.fontFamily,
    fontSize: 12,
    lineHeight: 18,
  },
  line: { borderTopWidth: 1, paddingTop: 10, gap: 4 },
});
