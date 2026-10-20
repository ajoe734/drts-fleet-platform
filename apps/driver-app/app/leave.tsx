import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { createIdempotencyKey } from "@drts/api-client";
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

type CreateIntentState = {
  driverId: string;
  payloadSignature: string;
  idempotencyKey: string;
  inFlightCount: number;
  completed: boolean;
};

function readCurrentDriverId(): string | null {
  try {
    return getDriverId();
  } catch {
    return null;
  }
}

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
  const createIntentRef = useRef<CreateIntentState | null>(null);

  const resetCreateIntent = useCallback(() => {
    createIntentRef.current = null;
    setIsSubmitting(false);
    setError(null);
  }, []);

  // Fetch leaves from API
  const fetchLeaves = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    let requestDriverId: string | null = null;
    try {
      const client = getDriverClient();
      const driverId = getDriverId();
      requestDriverId = driverId;
      const res = await client.listDriverLeaves({ driverId });
      if (readCurrentDriverId() !== driverId) {
        return;
      }
      if (!res || !Array.isArray(res.items)) {
        throw new Error("Invalid leave response");
      }
      setLeaves(res.items);
    } catch (err) {
      if (
        requestDriverId !== null &&
        readCurrentDriverId() !== requestDriverId
      ) {
        return;
      }
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
    let attemptIntent: CreateIntentState | null = null;
    let attemptDriverId: string | null = null;
    try {
      const client = getDriverClient();
      const driverId = getDriverId();
      attemptDriverId = driverId;
      const payloadSignature = JSON.stringify({
        leaveType: command.leaveType,
        startTime: command.startTime,
        endTime: command.endTime,
        reason: command.reason,
      });
      const currentIntent = createIntentRef.current;
      const intent: CreateIntentState =
        currentIntent &&
        !currentIntent.completed &&
        currentIntent.driverId === driverId &&
        currentIntent.payloadSignature === payloadSignature
          ? currentIntent
          : {
              driverId,
              payloadSignature,
              idempotencyKey: createIdempotencyKey("driver-leave-create"),
              inFlightCount: 0,
              completed: false,
            };
      intent.inFlightCount += 1;
      createIntentRef.current = intent;
      attemptIntent = intent;

      const newLeave = await client.createDriverLeave(command, {
        idempotencyKey: intent.idempotencyKey,
      });

      const activeDriverId = readCurrentDriverId();
      if (activeDriverId !== driverId) {
        if (createIntentRef.current === intent) {
          createIntentRef.current = null;
        }
        return;
      }
      if (createIntentRef.current !== intent || intent.completed) {
        return;
      }

      intent.completed = true;
      createIntentRef.current = null;
      setError(null);
      setLeaves((prev) => [
        newLeave,
        ...prev.filter((item) => item.leaveId !== newLeave.leaveId),
      ]);
      setSelectedLeave(newLeave);
      setActiveView("detail");
    } catch (err) {
      const activeDriverId = readCurrentDriverId();
      if (attemptIntent !== null) {
        if (activeDriverId !== attemptDriverId) {
          if (createIntentRef.current === attemptIntent) {
            createIntentRef.current = null;
          }
          return;
        }
        if (
          createIntentRef.current !== attemptIntent ||
          attemptIntent.completed ||
          attemptIntent.inFlightCount > 1
        ) {
          return;
        }
      } else if (
        createIntentRef.current !== null &&
        createIntentRef.current.inFlightCount > 0 &&
        activeDriverId === createIntentRef.current.driverId
      ) {
        return;
      }

      const errStr = String(err);
      if (errStr.includes("LEAVE_OVERLAPPING_REQUEST")) {
        setError("409 · LEAVE_OVERLAPPING_REQUEST");
      } else if (errStr.includes("LEAVE_INVALID_TIME_RANGE")) {
        setError("400 · LEAVE_INVALID_TIME_RANGE");
      } else {
        setError(formatDriverError(err, "申請請假失敗"));
      }
    } finally {
      if (attemptIntent !== null) {
        attemptIntent.inFlightCount = Math.max(
          0,
          attemptIntent.inFlightCount - 1,
        );
      }
      const activeIntent = createIntentRef.current;
      const activeDriverId = readCurrentDriverId();
      const hasActiveInFlightForCurrentDriver =
        activeIntent !== null &&
        !activeIntent.completed &&
        activeIntent.inFlightCount > 0 &&
        activeDriverId !== null &&
        activeIntent.driverId === activeDriverId;
      if (!hasActiveInFlightForCurrentDriver) {
        setIsSubmitting(false);
      }
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
                    resetCreateIntent();
                    setActiveView("list");
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
          onCreatePress={() => {
            resetCreateIntent();
            setActiveView("create");
          }}
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
          onCancel={() => {
            resetCreateIntent();
            setActiveView("list");
          }}
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
