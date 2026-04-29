import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import type { DriverTaskRecord, OwnedOrderRecord } from "@drts/contracts";

import RouteDisplay from "@/components/route-display";
import {
  appendProofPhotos,
  getCompletionProofRequirements,
  getUnsupportedProofRequirementMessages,
  MAX_COMPLETION_PROOF_PHOTOS,
  type ProofPhoto,
} from "@/lib/completion-proof";
import { getDriverClient } from "@/lib/api-client";
import {
  accumulateTripDistanceKm,
  calculateTripDurationSec,
  formatTripDistance,
  formatTripDuration,
  roundTripDistanceKm,
  type TripCoordinate,
} from "@/lib/trip-metrics";
import {
  getLatestDriverLocationUpdate,
  stopDriverLocationHeartbeat,
  subscribeToDriverLocationUpdates,
  syncDriverLocationHeartbeat,
} from "@/lib/driver-location-heartbeat";

function PlatformBadge({ platform }: { platform: string | null }) {
  const label = platform ?? "direct";
  const bgColor = platform ? "#e0f7fa" : "#e8f5e9";
  const textColor = platform ? "#006064" : "#1b5e20";
  return (
    <View style={[styles.badge, { backgroundColor: bgColor }]}>
      <Text style={[styles.badgeText, { color: textColor }]}>{label}</Text>
    </View>
  );
}

function RouteLockedBadge() {
  return (
    <View style={[styles.badge, { backgroundColor: "#fff3e0" }]}>
      <Text style={[styles.badgeText, { color: "#e65100" }]}>route-locked</Text>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  disabled = false,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        variant === "secondary"
          ? styles.actionButtonSecondary
          : styles.actionButtonPrimary,
        disabled && styles.actionButtonDisabled,
        pressed && !disabled && styles.actionButtonPressed,
      ]}
    >
      <Text
        style={[
          styles.actionButtonText,
          variant === "secondary"
            ? styles.actionButtonTextSecondary
            : styles.actionButtonTextPrimary,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function isForwardedTask(task: DriverTaskRecord | null): boolean {
  return task?.sourcePlatform != null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

function getComplianceTone(state: string) {
  switch (state) {
    case "clear":
      return { bg: "#ecfdf5", border: "#86efac", text: "#166534" };
    case "blocked":
      return { bg: "#fff1f2", border: "#fda4af", text: "#9f1239" };
    case "review_required":
      return { bg: "#fffbeb", border: "#fcd34d", text: "#92400e" };
    default:
      return { bg: "#f8fafc", border: "#cbd5e1", text: "#334155" };
  }
}

type LocationTrackingState =
  | "idle"
  | "requesting_permission"
  | "active"
  | "permission_denied"
  | "error";

function parseStartedAtMs(task: DriverTaskRecord | null): number | null {
  if (!task?.startedAt) {
    return null;
  }

  const parsed = Date.parse(task.startedAt);
  return Number.isNaN(parsed) ? null : parsed;
}

function shouldShowTripMetrics(task: DriverTaskRecord | null): boolean {
  return Boolean(
    task?.status === "on_trip" ||
    task?.startedAt ||
    task?.actualDistanceKm != null ||
    task?.actualDurationSec != null,
  );
}

export default function TripScreen() {
  const [taskDetail, setTaskDetail] = useState<DriverTaskRecord | null>(null);
  const [orderDetail, setOrderDetail] = useState<OwnedOrderRecord | null>(null);
  const [proofPhotos, setProofPhotos] = useState<ProofPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingAction, setSubmittingAction] = useState<string | null>(null);
  const [liveDistanceKm, setLiveDistanceKm] = useState(0);
  const [liveDurationSec, setLiveDurationSec] = useState(0);
  const [locationTrackingState, setLocationTrackingState] =
    useState<LocationTrackingState>("idle");
  const [locationTrackingMessage, setLocationTrackingMessage] = useState<
    string | null
  >(null);
  const [trackingRetryKey, setTrackingRetryKey] = useState(0);
  const lastTrackedCoordinateRef = useRef<TripCoordinate | null>(null);
  const tripStartTimeRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const router = useRouter();

  const proofRequirements = getCompletionProofRequirements(orderDetail);
  const unsupportedProofMessages =
    getUnsupportedProofRequirementMessages(orderDetail);
  const proofRequirementsUnavailable = Boolean(
    taskDetail?.orderId && !orderDetail,
  );
  const remainingSlots = MAX_COMPLETION_PROOF_PHOTOS - proofPhotos.length;
  const missingRequiredPhotos = Math.max(
    proofRequirements.minPhotoCount - proofPhotos.length,
    0,
  );
  const isTripInProgress = taskDetail?.status === "on_trip";
  const showTripMetrics = shouldShowTripMetrics(taskDetail);
  const completionBlockedByTracking =
    isTripInProgress && locationTrackingState !== "active";
  const complianceGates = orderDetail?.complianceGates ?? [];

  function clearDurationTicker() {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }

  function syncTripMetricsFromTask(task: DriverTaskRecord | null) {
    tripStartTimeRef.current = parseStartedAtMs(task);
    setLiveDistanceKm(task?.actualDistanceKm ?? 0);
    setLiveDurationSec(
      task?.actualDurationSec ??
        calculateTripDurationSec(tripStartTimeRef.current),
    );
  }

  async function loadTrip(showSpinner: boolean) {
    if (showSpinner) {
      setLoading(true);
    }

    const client = getDriverClient();

    try {
      setError(null);
      const tasks = await client.listDriverTasks();
      const firstTask = tasks[0] ?? null;
      setTaskDetail(firstTask);

      if (!firstTask?.orderId) {
        setOrderDetail(null);
        return;
      }

      try {
        const order = (await client.getOrder(
          firstTask.orderId,
        )) as OwnedOrderRecord;
        setOrderDetail(order);
      } catch {
        setOrderDetail(null);
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError));
      setTaskDetail(null);
      setOrderDetail(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTrip(true);
  }, []);

  useEffect(() => {
    setProofPhotos([]);
  }, [taskDetail?.taskId]);

  useEffect(() => {
    syncTripMetricsFromTask(taskDetail);
  }, [
    taskDetail?.taskId,
    taskDetail?.actualDistanceKm,
    taskDetail?.actualDurationSec,
    taskDetail?.startedAt,
  ]);

  useEffect(() => {
    clearDurationTicker();

    if (!isTripInProgress) {
      return;
    }

    setLiveDurationSec(calculateTripDurationSec(tripStartTimeRef.current));
    durationIntervalRef.current = setInterval(() => {
      setLiveDurationSec(calculateTripDurationSec(tripStartTimeRef.current));
    }, 1000);

    return () => {
      clearDurationTicker();
    };
  }, [isTripInProgress, taskDetail?.taskId, taskDetail?.startedAt]);

  useEffect(() => {
    if (!isTripInProgress) {
      lastTrackedCoordinateRef.current = null;
      setLocationTrackingState("idle");
      setLocationTrackingMessage(null);
      void stopDriverLocationHeartbeat();
      return;
    }

    let cancelled = false;

    const beginLocationTracking = async () => {
      setLocationTrackingState("requesting_permission");
      setLocationTrackingMessage(null);

      try {
        const result = await syncDriverLocationHeartbeat(
          taskDetail
            ? {
                taskId: taskDetail.taskId,
                driverId: taskDetail.driverId,
              }
            : null,
        );

        if (cancelled) {
          return;
        }

        if (result.latestUpdate) {
          lastTrackedCoordinateRef.current = {
            latitude: result.latestUpdate.latitude,
            longitude: result.latestUpdate.longitude,
          };
        }

        setLocationTrackingState(result.status);
        setLocationTrackingMessage(result.message);
      } catch (trackingError) {
        if (cancelled) {
          return;
        }

        setLocationTrackingState("error");
        setLocationTrackingMessage(getErrorMessage(trackingError));
      }
    };

    void beginLocationTracking();

    return () => {
      cancelled = true;
    };
  }, [isTripInProgress, taskDetail?.taskId, trackingRetryKey]);

  useEffect(() => {
    if (!isTripInProgress) {
      lastTrackedCoordinateRef.current = null;
      return;
    }

    const seededUpdate = getLatestDriverLocationUpdate();
    if (seededUpdate) {
      lastTrackedCoordinateRef.current = {
        latitude: seededUpdate.latitude,
        longitude: seededUpdate.longitude,
      };
    }

    return subscribeToDriverLocationUpdates((update) => {
      const nextCoordinate = {
        latitude: update.latitude,
        longitude: update.longitude,
      };

      setLiveDistanceKm((currentDistanceKm) => {
        const updatedDistanceKm = accumulateTripDistanceKm(
          currentDistanceKm,
          lastTrackedCoordinateRef.current,
          nextCoordinate,
        );
        lastTrackedCoordinateRef.current = nextCoordinate;
        return updatedDistanceKm;
      });
    });
  }, [isTripInProgress, taskDetail?.taskId]);

  async function requestPhotoPermission(
    source: "camera" | "library",
  ): Promise<boolean> {
    const response =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (response.granted) {
      return true;
    }

    Alert.alert(
      "Permission required",
      source === "camera"
        ? "Camera access is required to capture trip proof photos."
        : "Photo library access is required to attach trip proof photos.",
    );
    return false;
  }

  async function pickProofPhotos(source: "camera" | "library") {
    if (remainingSlots <= 0) {
      Alert.alert(
        "Photo limit reached",
        `You can attach up to ${MAX_COMPLETION_PROOF_PHOTOS} proof photos.`,
      );
      return;
    }

    const hasPermission = await requestPhotoPermission(source);
    if (!hasPermission) {
      return;
    }

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 0.4,
            base64: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.4,
            base64: true,
            allowsMultipleSelection: true,
            selectionLimit: remainingSlots,
          });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    const { photos, rejected } = appendProofPhotos(proofPhotos, result.assets);
    setProofPhotos(photos);

    if (rejected.length > 0) {
      Alert.alert("Some photos were skipped", rejected.join("\n"));
    }
  }

  function removeProofPhoto(index: number) {
    setProofPhotos((current) =>
      current.filter((_, currentIndex) => currentIndex !== index),
    );
  }

  async function handleAction(action: string) {
    if (!taskDetail?.taskId) {
      return;
    }

    const client = getDriverClient();
    const now = new Date().toISOString();

    try {
      setSubmittingAction(action);

      switch (action) {
        case "accept":
          await client.acceptTask(taskDetail.taskId, { acceptedAt: now });
          break;
        case "depart":
          await client.departTask(taskDetail.taskId, { departedAt: now });
          break;
        case "arrived":
          await client.arrivedPickupTask(taskDetail.taskId, { arrivedAt: now });
          break;
        case "start":
          await client.startTask(taskDetail.taskId, { startedAt: now });
          break;
        case "complete":
          if (proofRequirementsUnavailable) {
            Alert.alert(
              "Trip details unavailable",
              "Trip proof requirements could not be loaded. Refresh the trip before completing it.",
            );
            return;
          }

          if (unsupportedProofMessages.length > 0) {
            Alert.alert(
              "Proof requirements unsupported",
              unsupportedProofMessages.join("\n"),
            );
            return;
          }

          if (proofPhotos.length < proofRequirements.minPhotoCount) {
            const photoLabel =
              proofRequirements.minPhotoCount === 1 ? "photo" : "photos";
            Alert.alert(
              "Proof photos required",
              `Add at least ${proofRequirements.minPhotoCount} ${photoLabel} before completing this trip.`,
            );
            return;
          }

          if (completionBlockedByTracking) {
            Alert.alert(
              "Trip metrics unavailable",
              locationTrackingMessage ??
                (locationTrackingState === "requesting_permission"
                  ? "Location tracking is still starting. Wait a moment, then try again."
                  : "Enable location tracking before completing the trip so distance and duration can be recorded."),
            );
            return;
          }

          await client.completeTask(taskDetail.taskId, {
            completedAt: now,
            actualDistanceKm: roundTripDistanceKm(liveDistanceKm),
            actualDurationSec: calculateTripDurationSec(
              tripStartTimeRef.current,
            ),
            proof:
              proofPhotos.length > 0
                ? {
                    photos: proofPhotos.map((photo) => photo.base64),
                  }
                : undefined,
          });
          break;
        default:
          return;
      }

      if (action === "complete") {
        await stopDriverLocationHeartbeat();
        clearDurationTicker();
        setLocationTrackingState("idle");
        setLocationTrackingMessage(null);
        setProofPhotos([]);
        lastTrackedCoordinateRef.current = null;
      }

      Alert.alert("Success", `Task ${action} successful`);
      await loadTrip(false);
    } catch (actionError) {
      Alert.alert("Error", getErrorMessage(actionError));
    } finally {
      setSubmittingAction(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.label}>Loading trip...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Trip Detail</Text>

      {error && <Text style={styles.error}>Error: {error}</Text>}

      {taskDetail ? (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.taskId}>Task: {taskDetail.taskId}</Text>
            <View style={styles.badgeRow}>
              {isForwardedTask(taskDetail) && <RouteLockedBadge />}
              <PlatformBadge platform={taskDetail.sourcePlatform} />
            </View>
          </View>
          <Text style={styles.taskStatus}>
            Status: {taskDetail.status ?? "unknown"}
          </Text>
          <Text style={styles.taskInfo}>
            {taskDetail.orderId
              ? `Order: ${taskDetail.orderId}`
              : "No order linked"}
          </Text>
          <RouteDisplay task={taskDetail} order={orderDetail} />
          {showTripMetrics && (
            <View style={styles.metricsCard}>
              <View style={styles.metricsHeader}>
                <Text style={styles.metricsTitle}>Trip Metrics</Text>
                {isTripInProgress && (
                  <Text style={styles.metricsStatusPill}>
                    {locationTrackingState === "active"
                      ? "live"
                      : "needs attention"}
                  </Text>
                )}
              </View>
              <View style={styles.metricsGrid}>
                <View style={styles.metricTile}>
                  <Text style={styles.metricLabel}>Distance</Text>
                  <Text style={styles.metricValue}>
                    {formatTripDistance(liveDistanceKm)}
                  </Text>
                </View>
                <View style={styles.metricTile}>
                  <Text style={styles.metricLabel}>Duration</Text>
                  <Text style={styles.metricValue}>
                    {formatTripDuration(liveDurationSec)}
                  </Text>
                </View>
              </View>
              {isTripInProgress && locationTrackingState === "active" && (
                <Text style={styles.metricHint}>
                  {locationTrackingMessage ??
                    "Live location tracking is active for this trip."}
                </Text>
              )}
              {isTripInProgress &&
                locationTrackingState === "requesting_permission" && (
                  <Text style={styles.metricWarning}>
                    Allow location access to start live trip tracking.
                  </Text>
                )}
              {isTripInProgress &&
                (locationTrackingState === "permission_denied" ||
                  locationTrackingState === "error") && (
                  <>
                    <Text style={styles.metricWarning}>
                      {locationTrackingMessage ??
                        "Trip metrics could not start. Retry location tracking. You can still complete the trip once foreground tracking is available."}
                    </Text>
                    <ActionButton
                      label="Retry Tracking"
                      onPress={() =>
                        setTrackingRetryKey((current) => current + 1)
                      }
                      disabled={submittingAction !== null}
                      variant="secondary"
                    />
                  </>
                )}
            </View>
          )}
          {complianceGates.length > 0 && (
            <View style={styles.complianceCard}>
              <Text style={styles.complianceTitle}>Compliance Gates</Text>
              {complianceGates.map((gate) => {
                const tone = getComplianceTone(gate.state);
                return (
                  <View
                    key={gate.gateType}
                    style={[
                      styles.complianceGate,
                      {
                        backgroundColor: tone.bg,
                        borderColor: tone.border,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.complianceGateTitle, { color: tone.text }]}
                    >
                      {gate.title}
                    </Text>
                    <Text
                      style={[styles.complianceGateState, { color: tone.text }]}
                    >
                      {gate.state}
                    </Text>
                    <Text style={styles.complianceGateAction}>
                      {gate.nextAction}
                    </Text>
                    {gate.missingItems.length > 0 && (
                      <Text style={styles.complianceGateMeta}>
                        Missing: {gate.missingItems.join(", ")}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}
          {isForwardedTask(taskDetail) && (
            <Text style={styles.forwardedNote}>
              Dispatched by {taskDetail.sourcePlatform}. Dispatch rules are
              managed by the source platform.
            </Text>
          )}
        </View>
      ) : (
        <Text style={styles.empty}>No active trip.</Text>
      )}

      {!isForwardedTask(taskDetail) && taskDetail && (
        <>
          <View style={styles.proofCard}>
            <View style={styles.proofHeader}>
              <Text style={styles.proofTitle}>Completion Proof</Text>
              <Text style={styles.proofCounter}>
                {proofPhotos.length}/{MAX_COMPLETION_PROOF_PHOTOS} attached
              </Text>
            </View>

            <Text style={styles.proofHint}>
              Attach up to 5 photos. Each proof photo must stay below 600KB
              after compression.
            </Text>

            {proofRequirementsUnavailable && (
              <Text style={styles.unsupportedNote}>
                Trip proof requirements are unavailable until order details
                load. Refresh the trip before completing it.
              </Text>
            )}

            {proofRequirements.minPhotoCount > 0 && (
              <Text style={styles.requirementNote}>
                This trip requires at least {proofRequirements.minPhotoCount}{" "}
                proof photo
                {proofRequirements.minPhotoCount === 1 ? "" : "s"}.
                {missingRequiredPhotos > 0
                  ? ` Add ${missingRequiredPhotos} more before completion.`
                  : " Photo requirement met."}
              </Text>
            )}

            {unsupportedProofMessages.map((message) => (
              <Text key={message} style={styles.unsupportedNote}>
                {message}
              </Text>
            ))}

            <View style={styles.proofActions}>
              <ActionButton
                label="Use Camera"
                onPress={() => void pickProofPhotos("camera")}
                disabled={
                  submittingAction !== null ||
                  remainingSlots <= 0 ||
                  proofRequirementsUnavailable
                }
                variant="secondary"
              />
              <ActionButton
                label="From Library"
                onPress={() => void pickProofPhotos("library")}
                disabled={
                  submittingAction !== null ||
                  remainingSlots <= 0 ||
                  proofRequirementsUnavailable
                }
                variant="secondary"
              />
            </View>

            {proofPhotos.length > 0 ? (
              <View style={styles.photoGrid}>
                {proofPhotos.map((photo, index) => (
                  <View key={`${photo.uri}-${index}`} style={styles.photoCard}>
                    <Image
                      source={{ uri: photo.uri }}
                      style={styles.photoPreview}
                    />
                    <Text numberOfLines={1} style={styles.photoMeta}>
                      {Math.round(photo.estimatedBytes / 1024)} KB
                    </Text>
                    <ActionButton
                      label="Remove"
                      onPress={() => removeProofPhoto(index)}
                      disabled={submittingAction !== null}
                      variant="secondary"
                    />
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyProofState}>
                No proof photos selected yet.
              </Text>
            )}
          </View>

          <View style={styles.actions}>
            <ActionButton
              label="Accept"
              onPress={() => void handleAction("accept")}
              disabled={submittingAction !== null}
            />
            <ActionButton
              label="Depart"
              onPress={() => void handleAction("depart")}
              disabled={submittingAction !== null}
            />
            <ActionButton
              label="Arrived"
              onPress={() => void handleAction("arrived")}
              disabled={submittingAction !== null}
            />
            <ActionButton
              label="Start Trip"
              onPress={() => void handleAction("start")}
              disabled={submittingAction !== null}
            />
            <ActionButton
              label={
                submittingAction === "complete" ? "Completing..." : "Complete"
              }
              onPress={() => void handleAction("complete")}
              disabled={
                submittingAction !== null ||
                proofRequirementsUnavailable ||
                unsupportedProofMessages.length > 0 ||
                proofPhotos.length < proofRequirements.minPhotoCount ||
                completionBlockedByTracking
              }
            />
          </View>
        </>
      )}

      {taskDetail && isForwardedTask(taskDetail) && (
        <View style={styles.actions}>
          <Text style={styles.forwardedActionNote}>
            Actions are managed by {taskDetail.sourcePlatform}.
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.link} onPress={() => router.push("/incident")}>
          SOS Emergency →
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 12 },
  error: { color: "red", marginBottom: 8 },
  empty: { textAlign: "center", color: "#999", marginTop: 32 },
  card: {
    padding: 16,
    backgroundColor: "#f0f7ff",
    borderRadius: 8,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  badgeRow: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 4,
  },
  badgeText: { fontSize: 11, fontWeight: "600" },
  taskId: { fontSize: 18, fontWeight: "600", flex: 1 },
  taskStatus: { fontSize: 14, color: "#666", marginTop: 4 },
  taskInfo: { fontSize: 14, color: "#333", marginTop: 8 },
  forwardedNote: {
    fontSize: 11,
    color: "#666",
    marginTop: 8,
    fontStyle: "italic",
  },
  metricsCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d9e7f5",
    gap: 10,
  },
  metricsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  metricsTitle: { fontSize: 16, fontWeight: "600", color: "#0f3554" },
  metricsStatusPill: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0f6cbd",
    backgroundColor: "#e8f3fc",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 12,
  },
  metricTile: {
    flex: 1,
    backgroundColor: "#f7fbff",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#d9e7f5",
  },
  metricLabel: { fontSize: 12, color: "#4f6b85", marginBottom: 4 },
  metricValue: { fontSize: 20, fontWeight: "700", color: "#0f3554" },
  metricHint: { fontSize: 12, color: "#0f6cbd" },
  metricWarning: { fontSize: 12, color: "#b42318" },
  complianceCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d9e7f5",
    gap: 10,
  },
  complianceTitle: { fontSize: 16, fontWeight: "600", color: "#0f3554" },
  complianceGate: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  complianceGateTitle: { fontSize: 14, fontWeight: "600" },
  complianceGateState: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  complianceGateAction: { fontSize: 12, color: "#334155" },
  complianceGateMeta: { fontSize: 12, color: "#64748b" },
  proofCard: {
    backgroundColor: "#faf7ef",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#f0dcc0",
  },
  proofHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  proofTitle: { fontSize: 18, fontWeight: "600", color: "#5a420c" },
  proofCounter: { fontSize: 12, color: "#7d6842" },
  proofHint: { fontSize: 12, color: "#7d6842", marginBottom: 8 },
  requirementNote: {
    fontSize: 12,
    color: "#8a5b00",
    marginBottom: 8,
  },
  unsupportedNote: {
    fontSize: 12,
    color: "#b42318",
    marginBottom: 8,
  },
  proofActions: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  photoCard: {
    width: "47%",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: "#e8d7bb",
    gap: 8,
  },
  photoPreview: {
    width: "100%",
    aspectRatio: 1.2,
    borderRadius: 6,
    backgroundColor: "#f1f1f1",
  },
  photoMeta: { fontSize: 12, color: "#666", textAlign: "center" },
  emptyProofState: {
    fontSize: 13,
    color: "#666",
    fontStyle: "italic",
  },
  actions: { marginBottom: 16, gap: 8 },
  actionButton: {
    minHeight: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionButtonPrimary: {
    backgroundColor: "#0f6cbd",
  },
  actionButtonSecondary: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#c7d7ea",
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  actionButtonPressed: {
    opacity: 0.85,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  actionButtonTextPrimary: {
    color: "#fff",
  },
  actionButtonTextSecondary: {
    color: "#0f6cbd",
  },
  forwardedActionNote: {
    fontSize: 13,
    color: "#666",
    textAlign: "center",
    fontStyle: "italic",
  },
  footer: { alignItems: "center" },
  link: { color: "#007AFF", fontSize: 16 },
  label: { marginTop: 8, color: "#666" },
});
