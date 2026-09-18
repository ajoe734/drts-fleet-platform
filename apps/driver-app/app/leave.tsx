import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import type {
  CreateDriverLeaveCommand,
  DriverLeaveRecord,
} from "@drts/contracts";
import {
  formatDriverError,
  getDriverClient,
  getDriverId,
} from "@/lib/api-client";
import {
  DriverLeaveConflict,
  DriverLeaveDetail,
  DriverLeaveForm,
  DriverLeaveList,
  DriverLeaveShiftImpact,
  type DriverConflictVariant,
} from "@/components/leave";
import { PageHeader, driverCanvasTheme } from "@/components/canvas-primitives";

type ActiveView = "list" | "create" | "detail" | "shift_impact" | "conflict";

export default function DriverLeaveScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    view?: ActiveView;
    variant?: string;
    leaveId?: string;
  }>();

  const [activeView, setActiveView] = useState<ActiveView>(
    params.view ?? "list",
  );
  const [leaves, setLeaves] = useState<DriverLeaveRecord[]>([]);
  const [selectedLeave, setSelectedLeave] = useState<DriverLeaveRecord | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictVariant, setConflictVariant] =
    useState<DriverConflictVariant>("withdraw_conflict");

  // Fetch leaves from API
  const fetchLeaves = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const client = getDriverClient();
      const driverId = getDriverId();
      const res = await client.listDriverLeaves({ driverId });
      if (!res || !Array.isArray(res.items)) {
        throw new Error("Invalid leave response");
      }
      setLeaves(res.items);
    } catch (err) {
      setLeaves([]);
      const message = formatDriverError(err, "無法取得請假資料");
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLeaves();
  }, [fetchLeaves]);

  // If params specify a leaveId or variant on mount
  useEffect(() => {
    if (params.leaveId) {
      const found = leaves.find((l) => l.leaveId === params.leaveId);
      if (found) {
        setSelectedLeave(found);
        setActiveView("detail");
      }
    }
    if (params.view) {
      setActiveView(params.view);
    }
    if (params.variant) {
      if (
        params.variant === "withdraw_conflict" ||
        params.variant === "missing_fields" ||
        params.variant === "forbidden" ||
        params.variant === "not_found" ||
        params.variant === "clock_in_blocked" ||
        params.variant === "presence_ineligible"
      ) {
        setConflictVariant(params.variant);
        setActiveView("conflict");
      }
    }
  }, [params.leaveId, params.view, params.variant, leaves]);

  // Handle create leave submission
  const handleCreateSubmit = async (command: CreateDriverLeaveCommand) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const client = getDriverClient();
      const newLeave = await client.createDriverLeave(command);
      setLeaves((prev) => [newLeave, ...prev]);
      setSelectedLeave(newLeave);
      setActiveView("detail");
    } catch (err) {
      const errStr = String(err);
      if (errStr.includes("LEAVE_OVERLAPPING_REQUEST")) {
        setError("409 · LEAVE_OVERLAPPING_REQUEST");
      } else if (errStr.includes("LEAVE_INVALID_TIME_RANGE")) {
        setError("400 · LEAVE_INVALID_TIME_RANGE");
      } else {
        setError(formatDriverError(err, "申請請假失敗"));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle withdraw leave
  const handleWithdraw = async (leaveId: string) => {
    setIsSubmitting(true);
    try {
      const client = getDriverClient();
      const updated = await client.withdrawDriverLeave(leaveId, {
        reason: "司機主動撤回",
      });
      setLeaves((prev) =>
        prev.map((l) => (l.leaveId === leaveId ? updated : l)),
      );
      setSelectedLeave(updated);
    } catch (err) {
      const errStr = String(err);
      if (errStr.includes("LEAVE_INVALID_STATE_TRANSITION")) {
        setConflictVariant("withdraw_conflict");
        setActiveView("conflict");
      } else {
        setError(formatDriverError(err, "撤回假單失敗"));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <PageHeader
        actions={
          <Pressable
            accessibilityRole="button"
            onPress={
              activeView !== "list"
                ? () => {
                    setActiveView("list");
                    setError(null);
                  }
                : () => router.back()
            }
            style={styles.backButton}
          >
            <Ionicons
              color={driverCanvasTheme.text}
              name="chevron-back"
              size={20}
            />
          </Pressable>
        }
        subtitle="N01 / C052 · 司機請假操作"
        theme={driverCanvasTheme}
        title="司機請假 · Driver Leave"
      />

      {activeView === "list" && (
        <DriverLeaveList
          error={error}
          isLoading={isLoading}
          leaves={leaves}
          onCreatePress={() => setActiveView("create")}
          onRefresh={fetchLeaves}
          onSelectLeave={(lv) => {
            setSelectedLeave(lv);
            setActiveView("detail");
          }}
          theme={driverCanvasTheme}
        />
      )}

      {activeView === "create" && (
        <DriverLeaveForm
          existingLeaves={leaves}
          isSubmitting={isSubmitting}
          onCancel={() => setActiveView("list")}
          onSubmit={handleCreateSubmit}
          serverError={error}
          theme={driverCanvasTheme}
          variant={(params.variant as any) ?? "default"}
        />
      )}

      {activeView === "detail" && selectedLeave && (
        <DriverLeaveDetail
          isWithdrawing={isSubmitting}
          leave={selectedLeave}
          onBack={() => setActiveView("list")}
          onNavigateShiftImpact={() => setActiveView("shift_impact")}
          onWithdraw={handleWithdraw}
          theme={driverCanvasTheme}
        />
      )}

      {activeView === "shift_impact" && (
        <DriverLeaveShiftImpact
          shifts={(selectedLeave?.impactedShiftIds ?? []).map((id) => ({
            id,
            zh: selectedLeave
              ? `${new Date(selectedLeave.startTime).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })} – ${new Date(selectedLeave.endTime).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}`
              : "",
            tagged: selectedLeave?.status === "approved",
          }))}
          onBack={() => setActiveView("detail")}
          theme={driverCanvasTheme}
        />
      )}

      {activeView === "conflict" && (
        <DriverLeaveConflict
          onAction={() => {
            void fetchLeaves();
            setActiveView("list");
          }}
          theme={driverCanvasTheme}
          variant={conflictVariant}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: driverCanvasTheme.bg,
  },
  backButton: {
    padding: 6,
    borderRadius: 6,
  },
});
