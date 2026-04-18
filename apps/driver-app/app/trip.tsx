import { useEffect, useState } from "react";
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

export default function TripScreen() {
  const [taskDetail, setTaskDetail] = useState<DriverTaskRecord | null>(null);
  const [orderDetail, setOrderDetail] = useState<OwnedOrderRecord | null>(null);
  const [proofPhotos, setProofPhotos] = useState<ProofPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingAction, setSubmittingAction] = useState<string | null>(null);
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

          await client.completeTask(taskDetail.taskId, {
            completedAt: now,
            actualDistanceKm: 0,
            actualDurationSec: 0,
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
        setProofPhotos([]);
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
                proofPhotos.length < proofRequirements.minPhotoCount
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
