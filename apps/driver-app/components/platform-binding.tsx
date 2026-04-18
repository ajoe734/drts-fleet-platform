import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import {
  PLATFORM_CODES,
  type PlatformCode,
  type PlatformPresenceRecord,
} from "@drts/contracts";
import { getDriverClient } from "@/lib/api-client";

type BindForm =
  | {
      mode: "bind";
      platformCode: string;
      tokenExpiresAt: string;
    }
  | {
      mode: "reauth";
      platformCode: PlatformCode;
      tokenExpiresAt: string;
    };

function isPlatformCode(value: string): value is PlatformCode {
  return PLATFORM_CODES.includes(value as PlatformCode);
}

function PlatformCard({
  record,
  onUnbind,
  onReauth,
}: {
  record: PlatformPresenceRecord;
  onUnbind: (platformCode: PlatformCode) => void;
  onReauth: (platformCode: PlatformCode) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.platformInfo}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor:
                  record.status === "online" ? "#4caf50" : "#9e9e9e",
              },
            ]}
          />
          <Text style={styles.platformCode}>{record.platformCode}</Text>
        </View>
        <View style={styles.cardActions}>
          {record.reauthRequired && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.reauthBtn]}
              onPress={() => onReauth(record.platformCode)}
            >
              <Text style={styles.actionBtnText}>Re-auth</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.actionBtn, styles.unbindBtn]}
            onPress={() => onUnbind(record.platformCode)}
          >
            <Text style={styles.actionBtnText}>Unbind</Text>
          </TouchableOpacity>
        </View>
      </View>

      {record.reauthRequired && (
        <Text style={styles.reauthWarning}>Re-authentication required</Text>
      )}

      {record.tokenExpiresAt && (
        <Text style={styles.meta}>
          Token expires: {new Date(record.tokenExpiresAt).toLocaleString()}
        </Text>
      )}

      {record.accountId && (
        <Text style={styles.meta}>Account: {record.accountId}</Text>
      )}
    </View>
  );
}

export function PlatformBinding() {
  const [presences, setPresences] = useState<PlatformPresenceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<BindForm | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadPresences = async () => {
    try {
      const client = getDriverClient();
      const summary = await client.getPlatformPresence();
      setPresences(summary.presences);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPresences();
  }, []);

  const handleSubmitForm = async () => {
    if (!form) return;
    if (form.mode === "bind" && !form.platformCode.trim()) {
      Alert.alert("Validation", "Platform code is required.");
      return;
    }
    let platformCode: PlatformCode;
    if (form.mode === "bind") {
      if (!isPlatformCode(form.platformCode)) {
        Alert.alert(
          "Validation",
          `Platform code must be one of: ${PLATFORM_CODES.join(", ")}.`,
        );
        return;
      }
      platformCode = form.platformCode;
    } else {
      platformCode = form.platformCode;
    }
    setSubmitting(true);
    try {
      const client = getDriverClient();
      await client.setPlatformOnline({
        platformCode,
        tokenExpiresAt: form.tokenExpiresAt.trim() || null,
      });
      setForm(null);
      await loadPresences();
      Alert.alert(
        "Success",
        form.mode === "reauth"
          ? `Re-authentication successful for "${form.platformCode}".`
          : `Platform "${form.platformCode}" bound successfully.`,
      );
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnbind = (platformCode: PlatformCode) => {
    Alert.alert(
      "Unbind Platform",
      `Remove account binding for "${platformCode}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unbind",
          style: "destructive",
          onPress: async () => {
            try {
              const client = getDriverClient();
              await client.setPlatformOffline({ platformCode });
              await loadPresences();
            } catch (e: any) {
              Alert.alert("Error", e.message);
            }
          },
        },
      ],
    );
  };

  const handleOpenReauth = (platformCode: PlatformCode) => {
    setForm({ mode: "reauth", platformCode, tokenExpiresAt: "" });
  };

  const handleOpenBind = () => {
    setForm({ mode: "bind", platformCode: "", tokenExpiresAt: "" });
  };

  if (loading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" />
        <Text style={styles.loadingText}>Loading platform accounts...</Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.sectionTitle}>Platform Accounts</Text>

      {presences.length === 0 ? (
        <Text style={styles.empty}>No platforms bound yet.</Text>
      ) : (
        presences.map((p) => (
          <PlatformCard
            key={p.platformCode}
            record={p}
            onUnbind={handleUnbind}
            onReauth={handleOpenReauth}
          />
        ))
      )}

      {form === null ? (
        <TouchableOpacity
          style={[styles.actionBtn, styles.bindBtn]}
          onPress={handleOpenBind}
        >
          <Text style={styles.actionBtnText}>+ Bind New Platform</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.form}>
          <Text style={styles.formTitle}>
            {form.mode === "reauth"
              ? `Re-authenticate: ${form.platformCode}`
              : "Bind Platform Account"}
          </Text>

          {form.mode === "bind" && (
            <TextInput
              style={styles.input}
              placeholder="Platform code (e.g. grab, gojek)"
              value={form.platformCode}
              onChangeText={(v) => setForm({ ...form, platformCode: v })}
              autoCapitalize="none"
              autoCorrect={false}
            />
          )}

          <TextInput
            style={styles.input}
            placeholder="Token expiry — ISO date (optional)"
            value={form.tokenExpiresAt}
            onChangeText={(v) => setForm({ ...form, tokenExpiresAt: v })}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.formActions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.cancelBtn]}
              onPress={() => setForm(null)}
              disabled={submitting}
            >
              <Text style={styles.actionBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                styles.bindBtn,
                submitting && styles.btnDisabled,
              ]}
              onPress={handleSubmitForm}
              disabled={submitting}
            >
              <Text style={styles.actionBtnText}>
                {submitting
                  ? "..."
                  : form.mode === "reauth"
                    ? "Update Token"
                    : "Bind"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
    color: "#333",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  loadingText: { marginLeft: 8, color: "#666", fontSize: 14 },
  empty: { color: "#999", fontSize: 14, marginBottom: 12 },
  card: {
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#fafafa",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  platformInfo: { flexDirection: "row", alignItems: "center" },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  platformCode: { fontSize: 15, fontWeight: "600" },
  cardActions: { flexDirection: "row", gap: 6 },
  reauthWarning: { color: "#f44336", fontSize: 12, marginBottom: 4 },
  meta: { color: "#666", fontSize: 12, marginTop: 2 },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  actionBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  reauthBtn: { backgroundColor: "#ff9800" },
  unbindBtn: { backgroundColor: "#f44336" },
  bindBtn: { backgroundColor: "#1976d2", marginTop: 8 },
  cancelBtn: { backgroundColor: "#757575" },
  btnDisabled: { opacity: 0.5 },
  form: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  formTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 10,
    color: "#333",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
    backgroundColor: "#fff",
    marginBottom: 8,
  },
  formActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
  },
});
