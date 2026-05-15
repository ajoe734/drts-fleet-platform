import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import type {
  DriverTaskRecord,
  ForwardedDriverActionOutcome,
  ForwardedDriverActionResponse,
  OwnedOrderRecord,
} from "@drts/contracts";
import type { CanvasTone } from "@drts/ui-web/canvas-tokens";

import {
  Banner,
  Btn,
  Card,
  DL,
  Field,
  Input,
  KPI,
  PageHeader,
  Pill,
  Shell,
  Table,
  driverCanvasTheme,
} from "@/components/canvas-primitives";
import { getPlatformDisplayLabel } from "@/components/platform-task-badge";
import {
  appendProofPhotos,
  buildCompletionExpenseItem,
  getCompletionProofRequirements,
  getCompletionSubmitBlocker,
  MAX_COMPLETION_PROOF_PHOTOS,
  normalizeCompletionProofText,
  parseCompletionExpenseAmountMinor,
  shouldDisableCompleteTripAction,
  shouldReloadTripAfterFailedAction,
  type ProofPhoto,
} from "@/lib/completion-proof";
import {
  acceptForwardedDriverOffer,
  getDriverClient,
  getDriverIdentityIssue,
  getPendingDriverTaskCompletion,
  rejectForwardedDriverOffer,
  replayPendingDriverTaskCompletion,
  submitDriverTaskCompletion,
} from "@/lib/api-client";
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
import { resetDriverAppToOnboarding } from "@/lib/driver-identity-routing";
import { formatMoney } from "@/lib/money";
import { formatDriverTaskStatusLabel } from "@/lib/operational-labels";
import {
  getTripExperienceState,
  getPrimaryTripAction,
  shouldShowTripCompletionProof,
  type TripExperienceState,
  type TripPrimaryActionKey,
} from "@/lib/trip-workflow";
import { driverStrings, driverTripActionSuccessLabels } from "@/lib/strings";
import { usePendingCompletionReplay } from "@/lib/use-pending-completion-replay";

function ActionButton({
  label,
  onPress,
  disabled = false,
  variant = "primary",
  loading = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
}) {
  const isDanger = variant === "danger";

  return (
    <Btn
      theme={driverCanvasTheme}
      onPress={onPress}
      disabled={disabled}
      variant={variant === "primary" ? "primary" : "secondary"}
      danger={isDanger}
      size="md"
      icon={
        loading ? (
          <ActivityIndicator
            size="small"
            color={
              isDanger || variant === "primary"
                ? "#FFFFFF"
                : driverCanvasTheme.text
            }
          />
        ) : null
      }
      style={styles.actionButton}
    >
      {label}
    </Btn>
  );
}

function MetricPill({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const resolvedTone =
    tone === "warning"
      ? "warn"
      : tone === "danger"
        ? "danger"
        : tone === "success"
          ? "success"
          : "neutral";
  const colorSet = getCanvasToneSet(resolvedTone);

  return (
    <View
      style={[
        styles.metricPill,
        {
          backgroundColor: colorSet.bg,
          borderColor: colorSet.bd,
        },
      ]}
    >
      <Ionicons name={icon} size={13} color={colorSet.fg} />
      <View style={styles.metricPillCopy}>
        <Text
          style={[
            styles.metricPillLabel,
            {
              color: driverCanvasTheme.textMuted,
              fontFamily: driverCanvasTheme.fontFamily,
            },
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.metricPillValue,
            {
              color: driverCanvasTheme.text,
              fontFamily: driverCanvasTheme.monoFamily,
            },
          ]}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

function RouteLockedBadge() {
  return (
    <Pill theme={driverCanvasTheme} tone="warn" dot>
      {driverStrings.trip.routeLocked}
    </Pill>
  );
}

function isForwardedTask(task: DriverTaskRecord | null): boolean {
  return task?.sourcePlatform != null;
}

function formatTripActionSuccessLabel(action: TripPrimaryActionKey): string {
  return driverTripActionSuccessLabels[action];
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const apiMatch = /^API error \d+:\s*(.*)$/s.exec(error.message);
    if (apiMatch) {
      try {
        const payload = JSON.parse(apiMatch[1]) as {
          error?: { message?: string };
        };
        return payload.error?.message?.trim() || error.message;
      } catch {
        return error.message;
      }
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

function getCanvasToneSet(tone: CanvasTone) {
  switch (tone) {
    case "success":
      return {
        fg: driverCanvasTheme.success,
        bg: driverCanvasTheme.successBg,
        bd: driverCanvasTheme.successBorder,
      };
    case "warn":
      return {
        fg: driverCanvasTheme.warn,
        bg: driverCanvasTheme.warnBg,
        bd: driverCanvasTheme.warnBorder,
      };
    case "danger":
      return {
        fg: driverCanvasTheme.danger,
        bg: driverCanvasTheme.dangerBg,
        bd: driverCanvasTheme.dangerBorder,
      };
    case "info":
      return {
        fg: driverCanvasTheme.info,
        bg: driverCanvasTheme.infoBg,
        bd: driverCanvasTheme.infoBorder,
      };
    case "accent":
      return {
        fg: driverCanvasTheme.accent,
        bg: driverCanvasTheme.accentBg,
        bd: driverCanvasTheme.accentBorder,
      };
    case "neutral":
    default:
      return {
        fg: driverCanvasTheme.textMuted,
        bg: driverCanvasTheme.neutralBg,
        bd: driverCanvasTheme.neutralBorder,
      };
  }
}

function toCanvasTone(tone: StatusTone): CanvasTone {
  switch (tone) {
    case "warning":
      return "warn";
    case "danger":
      return "danger";
    case "neutral":
      return "neutral";
    case "success":
    default:
      return "success";
  }
}

function toBannerTone(
  tone: StatusTone | CanvasTone,
): Exclude<CanvasTone, "neutral"> {
  if (tone === "warning" || tone === "warn") {
    return "warn";
  }
  if (tone === "danger") {
    return "danger";
  }
  if (tone === "success") {
    return "success";
  }
  if (tone === "accent") {
    return "accent";
  }
  return "info";
}

function formatShortTime(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDateTime(value: string | null | undefined): string {
  if (!value) {
    return "尚無更新";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatReservationWindow(order: OwnedOrderRecord | null): string {
  const start = formatShortTime(order?.reservationWindowStart);
  const end = formatShortTime(order?.reservationWindowEnd);

  if (start && end) {
    return `${start} - ${end}`;
  }
  if (start) {
    return `自 ${start}`;
  }
  if (end) {
    return `截至 ${end}`;
  }
  return "時間待同步";
}

function formatPickupStopTime(order: OwnedOrderRecord | null): string {
  const start = formatShortTime(order?.reservationWindowStart);
  return start ? `預計 ${start}` : "時間待同步";
}

function formatDropoffStopTime(order: OwnedOrderRecord | null): string {
  const end = formatShortTime(order?.reservationWindowEnd);
  if (end) {
    return `預計 ${end}`;
  }
  if (order?.etaSnapshot?.etaMinutes != null) {
    return `約 ${order.etaSnapshot.etaMinutes} 分後`;
  }
  return "時間待同步";
}

function getTrackingDescriptor(
  isForwardedTrip: boolean,
  locationTrackingState: LocationTrackingState,
  locationTrackingMessage: string | null,
  recordingActive: boolean,
) {
  if (isForwardedTrip) {
    return {
      label: "未啟用",
      tone: "neutral" as const,
      detail: "來源平台任務不在此端啟用本地距離/時長追蹤。",
    };
  }

  if (recordingActive) {
    return {
      label: "錄製中",
      tone: "danger" as const,
      detail: locationTrackingMessage ?? "里程與時長正在即時更新。",
    };
  }

  if (locationTrackingState === "requesting_permission") {
    return {
      label: "等待授權",
      tone: "warning" as const,
      detail: "定位權限確認後，才會開始記錄實際里程與時長。",
    };
  }

  if (
    locationTrackingState === "permission_denied" ||
    locationTrackingState === "error"
  ) {
    return {
      label: "需處理",
      tone: "warning" as const,
      detail:
        locationTrackingMessage ??
        "定位追蹤暫時不可用，恢復後才能完整寫入行程資料。",
    };
  }

  return {
    label: "待開始",
    tone: "neutral" as const,
    detail: "開始行程後會切換為錄製中並持續更新度量。",
  };
}

function getComplianceTone(state: string): CanvasTone {
  switch (state) {
    case "clear":
      return "success";
    case "blocked":
      return "danger";
    case "review_required":
      return "warn";
    default:
      return "neutral";
  }
}

type LocationTrackingState =
  | "idle"
  | "requesting_permission"
  | "active"
  | "permission_denied"
  | "error";

type WorkflowRow = {
  code: string;
  item: string;
  tone: CanvasTone;
  state: string;
  note: string;
};

type ComplianceRow = {
  code: string;
  title: string;
  state: string;
  nextAction: string;
  tone: CanvasTone;
  note: string;
};

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

type StatusTone = "success" | "warning" | "danger" | "neutral";

function applyForwardedActionExperienceState(
  baseState: TripExperienceState | null,
  forwardedActionResult: ForwardedDriverActionResponse | null,
): TripExperienceState | null {
  if (!forwardedActionResult || baseState === "owned_active" || !baseState) {
    return baseState;
  }

  switch (forwardedActionResult.outcome) {
    case "accept_pending":
      return "forwarded_pending";
    case "confirmed_by_platform":
      return "forwarded_confirmed";
    case "lost_race":
      return "forwarded_lost";
    case "cancelled_by_platform":
      return "forwarded_cancelled";
    case "sync_failed":
      return "sync_failed";
    case "rejected":
      return "forwarded_cancelled";
  }
}

function describeForwardedActionOutcome(
  outcome: ForwardedDriverActionOutcome,
  action: ForwardedDriverActionResponse["action"],
): { title: string; tone: StatusTone } {
  switch (outcome) {
    case "accept_pending":
      return { title: "已送出接單，等待平台確認", tone: "warning" };
    case "confirmed_by_platform":
      return { title: "平台已確認接單", tone: "success" };
    case "lost_race":
      return { title: "其他司機已被平台確認", tone: "neutral" };
    case "cancelled_by_platform":
      return { title: "來源平台已取消此訂單", tone: "neutral" };
    case "sync_failed":
      return { title: "平台同步異常，需派車台處理", tone: "danger" };
    case "rejected":
      return {
        title: action === "reject" ? "已婉拒此平台訂單" : "此訂單已不再可接單",
        tone: "neutral",
      };
  }
}

function getForwardedActionCardCopy(state: TripExperienceState | null): {
  title: string;
  note: string;
} {
  switch (state) {
    case "forwarded_offered":
      return {
        title: "回覆來源平台派單",
        note: "接受後仍需等待平台完成確認，本地不會直接變更任務狀態。",
      };
    case "forwarded_pending":
      return {
        title: "等待來源平台同步",
        note: "平台確認前請暫勿開始行程，本地只會顯示最新同步結果。",
      };
    case "forwarded_confirmed":
      return {
        title: "來源平台已確認",
        note: "平台已確認此單，本地可依目前任務階段繼續後續流程。",
      };
    default:
      return {
        title: "平台同步結果",
        note: "本地只顯示同步結果與路線資訊，不會直接改寫平台任務。",
      };
  }
}

function getTripStatusPresentation(
  state: TripExperienceState | null,
  task: DriverTaskRecord | null,
  locationTrackingState: LocationTrackingState,
  locationTrackingMessage: string | null,
): {
  label: string;
  tone: StatusTone;
  detail: string;
} {
  switch (state) {
    case "forwarded_offered":
      return {
        label: "平台訂單可接單",
        tone: "warning",
        detail: "接受後將送交平台確認，可能被其他司機搶走。",
      };
    case "forwarded_pending":
      return {
        label: "等待平台確認",
        tone: "warning",
        detail: "已送出接單，請暫勿開始行程。",
      };
    case "forwarded_confirmed":
      return {
        label: "平台已確認",
        tone: "success",
        detail: "可依平台規則繼續本地行程流程。",
      };
    case "forwarded_lost":
      return {
        label: "其他司機已接",
        tone: "neutral",
        detail: "此筆平台訂單已結束，不需本地後續操作。",
      };
    case "forwarded_cancelled":
      return {
        label: "平台取消",
        tone: "neutral",
        detail: "來源平台已取消訂單，請等待下一筆任務。",
      };
    case "sync_failed":
      return {
        label: "同步異常",
        tone: "danger",
        detail: "需派車台處理，請等待指示。",
      };
    case "owned_active":
    default:
      switch (task?.status) {
        case "pending_acceptance":
          return {
            label: "待確認接單",
            tone: "warning",
            detail: "請先確認任務，接著前往取貨點。",
          };
        case "accepted":
        case "enroute_pickup":
          return {
            label: "前往取貨點",
            tone: "success",
            detail: "請依路線前往乘客或指定接送地點。",
          };
        case "arrived_pickup":
          return {
            label: "已抵達取貨點",
            tone: "success",
            detail: "確認乘客上車後即可開始行程。",
          };
        case "on_trip":
          if (locationTrackingState === "active") {
            return {
              label: "行程錄製中",
              tone: "success",
              detail: locationTrackingMessage ?? "里程與時長正在即時更新。",
            };
          }
          return {
            label: "行程進行中",
            tone: "success",
            detail: "定位追蹤啟用後，會持續寫入里程與時長。",
          };
        case "proof_pending":
          return {
            label: "待補完單佐證",
            tone: "warning",
            detail: "完單前需補齊照片、簽收或費用佐證。",
          };
        case "completed":
          return {
            label: "行程已完成",
            tone: "neutral",
            detail: "任務已完成，等待同步最新結果。",
          };
        default:
          return {
            label: formatDriverTaskStatusLabel(
              task?.status ?? "pending_acceptance",
            ),
            tone:
              String(task?.status ?? "") === "pending_acceptance"
                ? "warning"
                : "success",
            detail: "請依行程階段完成本地操作與完單佐證。",
          };
      }
  }
}

function getTripLockBody(state: TripExperienceState | null): {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
} | null {
  switch (state) {
    case "forwarded_pending":
      return {
        icon: "time-outline",
        title: "正在等待平台確認…",
        detail: "平台回應前，請勿開始行程或手動變更狀態。",
      };
    case "forwarded_lost":
      return {
        icon: "close-circle-outline",
        title: "未取得此訂單",
        detail: "平台已將訂單分配給其他司機，此頁僅保留同步結果。",
      };
    case "forwarded_cancelled":
      return {
        icon: "ban-outline",
        title: "平台已取消",
        detail: "此訂單不再有效，若資訊異常請聯繫派車台。",
      };
    case "sync_failed":
      return {
        icon: "alert-circle-outline",
        title: "同步異常",
        detail: "派車台正在處理平台同步，請等待進一步指示。",
      };
    default:
      return null;
  }
}

function getTripAuthorityDescription(
  task: DriverTaskRecord | null,
  state: TripExperienceState | null,
): string {
  if (!task || !isForwardedTask(task)) {
    return "DRTS 在此頁負責行程狀態、定位追蹤與完單佐證；請依目前階段完成單一步驟。";
  }

  switch (state) {
    case "forwarded_offered":
      return "此任務仍由來源平台主導；目前僅可回覆是否承接平台派單，本地不直接切換行程狀態。";
    case "forwarded_pending":
      return "已送出接單要求，等待來源平台確認前，本地所有行程操作維持鎖定。";
    case "forwarded_confirmed":
      return "來源平台已確認任務，但平台仍掌管最終行程規則；此頁只保留鏡像狀態與路線資訊。";
    case "forwarded_lost":
      return "來源平台已將此訂單交給其他司機，本地僅保留結果供查閱。";
    case "forwarded_cancelled":
      return "來源平台已取消此訂單，本地不再提供任何行程操作。";
    case "sync_failed":
      return "平台同步異常時，派車台會接手處理；司機端只顯示安全可讀的同步摘要。";
    default:
      return "來源平台仍是此任務的操作權限來源，本地不直接處理平台生命周期。";
  }
}

function getTripCapabilityItems(
  task: DriverTaskRecord | null,
  state: TripExperienceState | null,
): string[] {
  if (!task || !isForwardedTask(task)) {
    return [
      "可在此頁依序執行接單、前往接送點、抵達、開始行程與完成行程。",
      "行程進行中會記錄本地定位追蹤、距離與時長。",
      "完單前需補齊照片、簽收或費用佐證需求。",
    ];
  }

  switch (state) {
    case "forwarded_offered":
      return [
        "可送出：接受平台訂單。",
        "可送出：婉拒平台訂單。",
        "不可用：前往、抵達、開始、完成等本地生命周期操作。",
      ];
    case "forwarded_pending":
      return ["目前沒有可用本地操作。", "系統正在等待來源平台確認接單結果。"];
    case "forwarded_confirmed":
      return [
        "此頁提供平台狀態、鏡像狀態與路線資訊。",
        "如需後續人工協調，請依派車台或來源平台指示處理。",
      ];
    case "forwarded_lost":
    case "forwarded_cancelled":
      return ["此任務已進入終態，本地不再提供操作。"];
    case "sync_failed":
      return [
        "平台同步異常時，本地會鎖定操作，避免司機端誤改狀態。",
        "派車台正在處理同步，請等待進一步指示。",
      ];
    default:
      return ["來源平台仍掌管此任務，本地僅顯示安全同步資訊。"];
  }
}

function getTripSurfacePalette(
  task: DriverTaskRecord | null,
  state: TripExperienceState | null,
) {
  switch (state) {
    case "sync_failed":
      return {
        backgroundColor: driverCanvasTheme.dangerBg,
        borderColor: driverCanvasTheme.dangerBorder,
        accentColor: driverCanvasTheme.danger,
      };
    case "forwarded_pending":
      return {
        backgroundColor: driverCanvasTheme.warnBg,
        borderColor: driverCanvasTheme.warnBorder,
        accentColor: driverCanvasTheme.warn,
      };
    case "forwarded_confirmed":
      return {
        backgroundColor: driverCanvasTheme.successBg,
        borderColor: driverCanvasTheme.successBorder,
        accentColor: driverCanvasTheme.success,
      };
    case "forwarded_lost":
    case "forwarded_cancelled":
      return {
        backgroundColor: driverCanvasTheme.surfaceLo,
        borderColor: driverCanvasTheme.borderStrong,
        accentColor: driverCanvasTheme.textMuted,
      };
    case "forwarded_offered":
      return {
        backgroundColor: driverCanvasTheme.infoBg,
        borderColor: driverCanvasTheme.infoBorder,
        accentColor: driverCanvasTheme.info,
      };
    default:
      if (task?.sourcePlatform) {
        return {
          backgroundColor: driverCanvasTheme.infoBg,
          borderColor: driverCanvasTheme.infoBorder,
          accentColor: driverCanvasTheme.info,
        };
      }

      return {
        backgroundColor: driverCanvasTheme.accentBg,
        borderColor: driverCanvasTheme.accentBorder,
        accentColor: driverCanvasTheme.accent,
      };
  }
}

function getTripStateEyebrow(
  task: DriverTaskRecord | null,
  state: TripExperienceState | null,
) {
  if (state === "sync_failed") {
    return "平台同步異常";
  }

  if (task?.sourcePlatform) {
    switch (state) {
      case "forwarded_offered":
        return "來源平台派單";
      case "forwarded_pending":
        return "等待來源平台";
      case "forwarded_confirmed":
        return "來源平台已確認";
      case "forwarded_lost":
        return "平台已分配給他人";
      case "forwarded_cancelled":
        return "來源平台已取消";
      default:
        return "平台鏡像任務";
    }
  }

  return "本地行程流程";
}

function getIdleBottomActionLabel(state: TripExperienceState | null) {
  switch (state) {
    case "forwarded_pending":
      return "等待平台確認";
    case "forwarded_confirmed":
      return "來源平台已確認";
    case "forwarded_lost":
      return "平台已交給其他司機";
    case "forwarded_cancelled":
      return "來源平台已取消";
    case "sync_failed":
      return "等待派車台處理";
    default:
      return "目前沒有可執行動作";
  }
}

type TripAuthorityBannerDescriptor = {
  title: string;
  authorityLabel: string;
  description: string;
  tone: Exclude<CanvasTone, "neutral">;
  icon: keyof typeof Ionicons.glyphMap;
};

function getTripAuthorityBannerProps(
  task: DriverTaskRecord | null,
  state: TripExperienceState | null,
): TripAuthorityBannerDescriptor {
  if (!task || !isForwardedTask(task)) {
    return {
      title: "自營派單",
      authorityLabel: "DRTS 行程主控",
      description:
        "完整本機操作權限。請依行程節點完成接單、接送、追蹤與完單佐證。",
      tone: "accent",
      icon: "shield-checkmark",
    };
  }

  switch (state) {
    case "forwarded_offered":
      return {
        title: "來源平台派單",
        authorityLabel: `平台 ${getPlatformDisplayLabel(task.sourcePlatform)}`,
        description:
          "此訂單由來源平台主導。接受後只會送出平台請求，仍可能被其他司機搶先確認。",
        tone: "info",
        icon: "swap-horizontal-outline",
      };
    case "forwarded_pending":
      return {
        title: "等待來源平台確認",
        authorityLabel: `平台 ${getPlatformDisplayLabel(task.sourcePlatform)}`,
        description:
          "已送出接單要求。平台回應前，司機端所有本地生命周期操作維持鎖定。",
        tone: "warn",
        icon: "time-outline",
      };
    case "forwarded_confirmed":
      return {
        title: "來源平台已確認",
        authorityLabel: `平台 ${getPlatformDisplayLabel(task.sourcePlatform)}`,
        description:
          "平台已確認此單。本地畫面會保留可讀的行程鏡像與後續節點，但仍需遵守平台規則。",
        tone: "success",
        icon: "checkmark-circle-outline",
      };
    case "forwarded_lost":
      return {
        title: "平台已分配給其他司機",
        authorityLabel: `平台 ${getPlatformDisplayLabel(task.sourcePlatform)}`,
        description: "此筆平台訂單已結束，本地僅保留同步結果供查閱與追蹤。",
        tone: "warn",
        icon: "close-circle-outline",
      };
    case "forwarded_cancelled":
      return {
        title: "來源平台已取消",
        authorityLabel: `平台 ${getPlatformDisplayLabel(task.sourcePlatform)}`,
        description: "來源平台已取消訂單。本地不再提供任何後續行程操作。",
        tone: "warn",
        icon: "ban-outline",
      };
    case "sync_failed":
      return {
        title: "平台同步異常",
        authorityLabel: `平台 ${getPlatformDisplayLabel(task.sourcePlatform)}`,
        description:
          "既有 sync_failed guardrail 保持鎖定；派車台接手處理前，司機端不開放本地狀態變更。",
        tone: "danger",
        icon: "alert-circle-outline",
      };
    default:
      return {
        title: "平台鏡像任務",
        authorityLabel: `平台 ${getPlatformDisplayLabel(task.sourcePlatform)}`,
        description: "來源平台仍是此任務的權限來源，本地只顯示安全同步資訊。",
        tone: "info",
        icon: "swap-horizontal-outline",
      };
  }
}

export default function TripScreen() {
  const [taskDetail, setTaskDetail] = useState<DriverTaskRecord | null>(null);
  const [orderDetail, setOrderDetail] = useState<OwnedOrderRecord | null>(null);
  const [proofPhotos, setProofPhotos] = useState<ProofPhoto[]>([]);
  const [signoffReference, setSignoffReference] = useState("");
  const [expenseType, setExpenseType] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseAttachmentRef, setExpenseAttachmentRef] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingAction, setSubmittingAction] = useState<string | null>(null);
  const [forwardedActionResult, setForwardedActionResult] =
    useState<ForwardedDriverActionResponse | null>(null);
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
  const proofRequirementsUnavailable = Boolean(
    taskDetail?.orderId && !orderDetail,
  );
  const remainingSlots = MAX_COMPLETION_PROOF_PHOTOS - proofPhotos.length;
  const missingRequiredPhotos = Math.max(
    proofRequirements.minPhotoCount - proofPhotos.length,
    0,
  );
  const isForwardedTrip = isForwardedTask(taskDetail);
  const isTripInProgress = !isForwardedTrip && taskDetail?.status === "on_trip";
  const showTripMetrics = !isForwardedTrip && shouldShowTripMetrics(taskDetail);
  const completionBlockedByTracking =
    isTripInProgress && locationTrackingState !== "active";
  const complianceGates = orderDetail?.complianceGates ?? [];
  const signoffRequirementMissing =
    proofRequirements.signoffRequired &&
    !normalizeCompletionProofText(signoffReference);
  const parsedExpenseAmountMinor =
    parseCompletionExpenseAmountMinor(expenseAmount);
  const expenseAttachmentId =
    normalizeCompletionProofText(expenseAttachmentRef);
  const expenseItem = buildCompletionExpenseItem({
    type: expenseType,
    amountText: expenseAmount,
    attachmentId: expenseAttachmentRef,
  });
  const expenseAmountInvalid =
    proofRequirements.expenseProofRequired &&
    expenseAmount.trim().length > 0 &&
    parsedExpenseAmountMinor == null;
  const expenseRequirementMissing =
    proofRequirements.expenseProofRequired && expenseItem == null;
  const proofBundleHasEvidence =
    proofPhotos.length > 0 ||
    Boolean(normalizeCompletionProofText(signoffReference)) ||
    Boolean(expenseItem);
  const baseTripExperienceState = getTripExperienceState(taskDetail);
  const tripExperienceState = applyForwardedActionExperienceState(
    baseTripExperienceState,
    forwardedActionResult,
  );
  const primaryTripAction = getPrimaryTripAction(
    taskDetail,
    tripExperienceState,
  );
  const tripStatusPresentation = getTripStatusPresentation(
    tripExperienceState,
    taskDetail,
    locationTrackingState,
    locationTrackingMessage,
  );
  const tripLockBody = getTripLockBody(tripExperienceState);
  const tripAuthorityDescription = getTripAuthorityDescription(
    taskDetail,
    tripExperienceState,
  );
  const tripCapabilityItems = getTripCapabilityItems(
    taskDetail,
    tripExperienceState,
  );
  const showCompletionProofCard = shouldShowTripCompletionProof(
    taskDetail,
    tripExperienceState,
  );
  const forwardedActionCardCopy =
    getForwardedActionCardCopy(tripExperienceState);
  const completionSubmitBlocker = getCompletionSubmitBlocker({
    proofRequirementsUnavailable,
    missingRequiredPhotos,
    signoffRequirementMissing,
    expenseRequirementMissing,
    expenseAmountInvalid,
    completionBlockedByTracking,
  });
  const tripSurfacePalette = getTripSurfacePalette(
    taskDetail,
    tripExperienceState,
  );
  const tripStateEyebrow = getTripStateEyebrow(taskDetail, tripExperienceState);
  const tripAuthorityBanner = getTripAuthorityBannerProps(
    taskDetail,
    tripExperienceState,
  );
  const headerSubtitle = taskDetail
    ? taskDetail.orderId
      ? `${taskDetail.taskId} · ${taskDetail.orderId}`
      : taskDetail.taskId
    : "查看目前指派的行程與下一步操作";
  const forwardedOutcomeSummary = forwardedActionResult
    ? describeForwardedActionOutcome(
        forwardedActionResult.outcome,
        forwardedActionResult.action,
      )
    : null;
  const forwardedOutcomeTone = forwardedOutcomeSummary
    ? toBannerTone(forwardedOutcomeSummary.tone)
    : null;
  const pickupAddress = orderDetail?.pickup.address ?? "待確認上車點";
  const dropoffAddress = orderDetail?.dropoff.address ?? "待確認下車點";
  const pickupTimeLabel = formatPickupStopTime(orderDetail);
  const dropoffTimeLabel = formatDropoffStopTime(orderDetail);
  const platformLabel = getPlatformDisplayLabel(taskDetail?.sourcePlatform);
  const recordingActive =
    Boolean(orderDetail?.recordingId) ||
    (!isForwardedTrip && locationTrackingState === "active");
  const trackingDescriptor = getTrackingDescriptor(
    isForwardedTrip,
    locationTrackingState,
    locationTrackingMessage,
    recordingActive,
  );
  const routeMetricDistance = showTripMetrics
    ? formatTripDistance(liveDistanceKm)
    : taskDetail?.actualDistanceKm != null
      ? formatTripDistance(taskDetail.actualDistanceKm)
      : "待同步";
  const routeMetricDuration = showTripMetrics
    ? formatTripDuration(liveDurationSec)
    : orderDetail?.etaSnapshot?.etaMinutes != null
      ? `${orderDetail.etaSnapshot.etaMinutes} 分`
      : isForwardedTrip
        ? "平台決定"
        : "開始行程後更新";
  const routeMetricFare = taskDetail?.fare
    ? formatMoney(taskDetail.fare)
    : orderDetail?.quotedFare
      ? formatMoney(orderDetail.quotedFare)
      : orderDetail?.fixedPrice
        ? "固定車資"
        : "金額待確認";
  const routeOverlayLabel =
    routeMetricDistance !== "待同步"
      ? `${routeMetricDistance} · ${routeMetricDuration}`
      : orderDetail?.etaSnapshot?.etaMinutes != null
        ? `ETA ${orderDetail.etaSnapshot.etaMinutes} 分`
        : routeMetricDuration;
  const bottomNotice =
    completionSubmitBlocker === "proof_requirements_unavailable"
      ? "完單前需先載入訂單佐證需求，請重新整理後再送出。"
      : completionSubmitBlocker === "expense_amount_invalid"
        ? "費用金額格式無效，請輸入有效的正數後再完成行程。"
        : completionSubmitBlocker === "tracking_unavailable"
          ? (locationTrackingMessage ??
            "請先恢復定位追蹤，再完成行程並寫入距離與時長。")
          : proofRequirements.minPhotoCount > 0 && missingRequiredPhotos > 0
            ? `完單前仍需補上 ${missingRequiredPhotos} 張佐證照片。`
            : signoffRequirementMissing
              ? "此行程仍缺少簽收識別資料。"
              : expenseRequirementMissing
                ? "此行程仍缺少完整費用佐證。"
                : forwardedOutcomeSummary
                  ? (forwardedActionResult?.driverMessage ??
                    forwardedOutcomeSummary.title)
                  : tripExperienceState === "forwarded_offered"
                    ? forwardedActionCardCopy.note
                    : primaryTripAction
                      ? primaryTripAction.helperText
                      : tripStatusPresentation.detail;
  const completeActionDisabled =
    primaryTripAction?.action === "complete"
      ? shouldDisableCompleteTripAction({
          submittingAction,
          proofRequirementsUnavailable,
          missingRequiredPhotos,
          signoffRequirementMissing,
          expenseRequirementMissing,
          expenseAmountInvalid,
          completionBlockedByTracking,
        })
      : false;
  const bottomPrimaryAction = primaryTripAction
    ? {
        title:
          submittingAction === primaryTripAction.action &&
          primaryTripAction.action === "complete"
            ? "完成中…"
            : primaryTripAction.label,
        onPress: () => void handleAction(primaryTripAction.action),
        loading:
          submittingAction === primaryTripAction.action &&
          primaryTripAction.action !== "complete",
        disabled:
          primaryTripAction.action === "complete"
            ? completeActionDisabled
            : submittingAction !== null,
      }
    : tripExperienceState === "forwarded_offered" &&
        forwardedActionResult === null
      ? {
          title: "接受平台訂單",
          onPress: () => void handleForwardedAccept(),
          loading: submittingAction === "forwarded_accept",
          disabled: submittingAction !== null,
        }
      : undefined;
  const bottomSecondaryAction =
    tripExperienceState === "forwarded_offered" &&
    forwardedActionResult === null
      ? {
          title: "婉拒平台訂單",
          onPress: () => void handleForwardedReject(),
          variant: "secondary" as const,
          loading: submittingAction === "forwarded_reject",
          disabled: submittingAction !== null,
        }
      : undefined;
  const tripSummaryItems = [
    {
      label: "任務代碼",
      value: taskDetail?.taskId ?? "未指派",
      mono: true,
    },
    {
      label: "平台來源",
      value: isForwardedTrip ? platformLabel : "DRTS 自營",
    },
    {
      label: "預約時窗",
      value: formatReservationWindow(orderDetail),
      mono: true,
    },
    {
      label: "錄製 / 追蹤",
      value: recordingActive
        ? `${trackingDescriptor.label} · ${orderDetail?.recordingId ?? "local"}`
        : trackingDescriptor.label,
      mono: recordingActive,
    },
    {
      label: "乘客 / 現場聯絡",
      value:
        orderDetail?.onsiteContact?.name ??
        orderDetail?.passenger.name ??
        "待同步",
    },
    {
      label: "最後同步",
      value: formatShortDateTime(
        taskDetail?.completedAt ??
          taskDetail?.startedAt ??
          taskDetail?.acceptedAt ??
          taskDetail?.arrivedPickupAt,
      ),
      mono: true,
    },
  ];
  const workflowRows: WorkflowRow[] = [
    {
      code: isForwardedTrip ? "AUTH" : "OWND",
      item: "操作權限",
      tone: isForwardedTrip ? "info" : "success",
      state: isForwardedTrip ? `平台 ${platformLabel}` : "DRTS 本地主控",
      note: tripAuthorityDescription,
    },
    {
      code: "STEP",
      item: "下一步",
      tone: primaryTripAction
        ? "accent"
        : toCanvasTone(tripStatusPresentation.tone),
      state:
        bottomPrimaryAction?.title ??
        getIdleBottomActionLabel(tripExperienceState),
      note: bottomNotice,
    },
    {
      code: "TRCK",
      item: "追蹤 / 錄製",
      tone: toCanvasTone(trackingDescriptor.tone),
      state: trackingDescriptor.label,
      note: trackingDescriptor.detail,
    },
    {
      code: "SOS",
      item: "安全求援",
      tone: "danger" as const,
      state: "可立即啟動",
      note: "送出後會同步通知安全官與派車台，並附上當前訂單上下文。",
    },
  ];
  const complianceRows: ComplianceRow[] = complianceGates.map((gate) => ({
    code: gate.gateType,
    title: gate.title,
    state: gate.state,
    nextAction: gate.nextAction,
    tone: getComplianceTone(gate.state),
    note:
      gate.missingItems.length > 0
        ? `缺少：${gate.missingItems.join("、")}`
        : "目前沒有缺少項目。",
  }));
  const proofSummaryItems = [
    {
      label: "照片需求",
      value: `${proofPhotos.length}/${Math.max(proofRequirements.minPhotoCount, 1)} 張`,
      mono: true,
    },
    {
      label: "簽收識別",
      value: proofRequirements.signoffRequired ? "需要" : "免附",
    },
    {
      label: "費用佐證",
      value: proofRequirements.expenseProofRequired ? "需要" : "免附",
    },
    {
      label: "送出狀態",
      value: completionSubmitBlocker ? "仍有缺口" : "可完成行程",
    },
  ];

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

  function resetCompletionDraft() {
    setProofPhotos([]);
    setSignoffReference("");
    setExpenseType("");
    setExpenseAmount("");
    setExpenseAttachmentRef("");
  }

  async function routeToOnboardingAfterSessionFailure() {
    await stopDriverLocationHeartbeat();
    clearDurationTicker();
    setLocationTrackingState("idle");
    setLocationTrackingMessage(null);
    lastTrackedCoordinateRef.current = null;
    resetDriverAppToOnboarding(router);
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
    resetCompletionDraft();
    setForwardedActionResult(null);
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

  usePendingCompletionReplay({
    activeTaskId: taskDetail?.taskId ?? null,
    submittingAction,
    setSubmittingAction,
    getPendingCompletion: getPendingDriverTaskCompletion,
    replayPendingCompletion: replayPendingDriverTaskCompletion,
    getIdentityIssue: getDriverIdentityIssue,
    onReplayCompleted: async (replayedTask) => {
      if (replayedTask.status === "completed") {
        await stopDriverLocationHeartbeat();
        clearDurationTicker();
        setLocationTrackingState("idle");
        setLocationTrackingMessage(null);
        resetCompletionDraft();
        lastTrackedCoordinateRef.current = null;
      }

      await loadTrip(false);
    },
    onIdentityFailure: routeToOnboardingAfterSessionFailure,
    onReplayError: (error) => {
      setError(getErrorMessage(error));
    },
  });

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
      "需要權限",
      source === "camera"
        ? "需要相機權限才能拍攝行程佐證照片。"
        : "需要相簿權限才能附加行程佐證照片。",
    );
    return false;
  }

  async function pickProofPhotos(source: "camera" | "library") {
    if (remainingSlots <= 0) {
      Alert.alert(
        "已達照片上限",
        `最多只能附加 ${MAX_COMPLETION_PROOF_PHOTOS} 張佐證照片。`,
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
      Alert.alert("部分照片已略過", rejected.join("\n"));
    }
  }

  function removeProofPhoto(index: number) {
    setProofPhotos((current) =>
      current.filter((_, currentIndex) => currentIndex !== index),
    );
  }

  async function handleAction(action: TripPrimaryActionKey) {
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
          if (completionSubmitBlocker === "proof_requirements_unavailable") {
            Alert.alert(
              "行程資料暫時無法使用",
              "目前無法載入行程佐證需求，請先重新整理行程，再完成任務。",
            );
            return;
          }

          if (completionSubmitBlocker === "expense_amount_invalid") {
            Alert.alert(
              "費用金額無效",
              "請先輸入有效的正數費用金額，再完成此行程。",
            );
            return;
          }

          if (completionSubmitBlocker === "tracking_unavailable") {
            Alert.alert(
              "行程度量暫時無法使用",
              locationTrackingMessage ??
                (locationTrackingState === "requesting_permission"
                  ? "定位追蹤仍在啟動中，請稍候再試。"
                  : "請先啟用定位追蹤，再完成行程，才能記錄距離與時長。"),
            );
            return;
          }

          await submitDriverTaskCompletion(taskDetail.taskId, {
            completedAt: now,
            actualDistanceKm: roundTripDistanceKm(liveDistanceKm),
            actualDurationSec: calculateTripDurationSec(
              tripStartTimeRef.current,
            ),
            proof: proofBundleHasEvidence
              ? {
                  photos: proofPhotos.map((photo) => photo.base64),
                  signatureId:
                    normalizeCompletionProofText(signoffReference) ?? undefined,
                  expenseItems: expenseItem ? [expenseItem] : undefined,
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
        resetCompletionDraft();
        lastTrackedCoordinateRef.current = null;
      }

      Alert.alert(
        "成功",
        `已完成操作：${formatTripActionSuccessLabel(action)}`,
      );
      await loadTrip(false);
    } catch (actionError) {
      const actionErrorMessage = getErrorMessage(actionError);

      if (getDriverIdentityIssue()) {
        await routeToOnboardingAfterSessionFailure();
        return;
      }

      if (shouldReloadTripAfterFailedAction(action)) {
        try {
          await loadTrip(false);
        } catch (reloadError) {
          console.warn(
            "Failed to refresh trip after a completion error.",
            reloadError,
          );
        }
      }

      Alert.alert("錯誤", actionErrorMessage);
    } finally {
      setSubmittingAction(null);
    }
  }

  async function handleForwardedAccept() {
    if (!taskDetail?.taskId) {
      return;
    }

    try {
      setSubmittingAction("forwarded_accept");
      const result = await acceptForwardedDriverOffer(taskDetail.taskId);
      setForwardedActionResult(result);
      const summary = describeForwardedActionOutcome(result.outcome, "accept");
      Alert.alert(summary.title, result.driverMessage);
      await loadTrip(false);
    } catch (acceptError) {
      if (getDriverIdentityIssue()) {
        await routeToOnboardingAfterSessionFailure();
        return;
      }

      Alert.alert("錯誤", getErrorMessage(acceptError));
    } finally {
      setSubmittingAction(null);
    }
  }

  async function handleForwardedReject() {
    if (!taskDetail?.taskId) {
      return;
    }

    try {
      setSubmittingAction("forwarded_reject");
      const result = await rejectForwardedDriverOffer(
        taskDetail.taskId,
        "driver_declined_forwarded_offer",
      );
      setForwardedActionResult(result);
      const summary = describeForwardedActionOutcome(result.outcome, "reject");
      Alert.alert(summary.title, result.driverMessage);
      await loadTrip(false);
    } catch (rejectError) {
      if (getDriverIdentityIssue()) {
        await routeToOnboardingAfterSessionFailure();
        return;
      }

      Alert.alert("錯誤", getErrorMessage(rejectError));
    } finally {
      setSubmittingAction(null);
    }
  }

  if (loading) {
    return (
      <Shell
        theme={driverCanvasTheme}
        contentContainerStyle={styles.shellContent}
      >
        <PageHeader title="進行中行程" subtitle="載入目前任務與路線狀態" />
        <Card theme={driverCanvasTheme}>
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={driverCanvasTheme.accent} />
            <Text style={styles.loadingLabel}>載入行程中…</Text>
          </View>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell
      theme={driverCanvasTheme}
      contentContainerStyle={styles.shellContent}
    >
      <View style={styles.heroPane}>
        <View style={styles.heroPaneTop}>
          <PageHeader
            title="進行中行程"
            subtitle={headerSubtitle}
            actions={
              <View style={styles.headerActionRow}>
                <Btn
                  theme={driverCanvasTheme}
                  variant="ghost"
                  size="sm"
                  onPress={() => void loadTrip(true)}
                  disabled={submittingAction !== null}
                  icon={
                    <Ionicons
                      name="refresh-outline"
                      size={14}
                      color={driverCanvasTheme.textMuted}
                    />
                  }
                >
                  重新整理
                </Btn>
                <Btn
                  theme={driverCanvasTheme}
                  variant="primary"
                  size="sm"
                  danger
                  onPress={() => router.push("/incident")}
                  icon={
                    <Ionicons
                      name="warning-outline"
                      size={14}
                      color="#FFFFFF"
                    />
                  }
                >
                  SOS
                </Btn>
              </View>
            }
          />

          {error ? (
            <Banner
              theme={driverCanvasTheme}
              tone="danger"
              icon={
                <Ionicons
                  name="alert-circle-outline"
                  size={16}
                  color={driverCanvasTheme.danger}
                />
              }
              title="資料同步異常"
              body={error}
            />
          ) : null}

          {taskDetail ? (
            <>
              <Banner
                theme={driverCanvasTheme}
                tone={tripAuthorityBanner.tone}
                icon={
                  <Ionicons
                    name={tripAuthorityBanner.icon}
                    size={16}
                    color={getCanvasToneSet(tripAuthorityBanner.tone).fg}
                  />
                }
                title={
                  <View style={styles.bannerTitleRow}>
                    <Text style={styles.bannerTitleText}>
                      {tripAuthorityBanner.title}
                    </Text>
                    <Pill theme={driverCanvasTheme} tone="neutral">
                      {tripAuthorityBanner.authorityLabel}
                    </Pill>
                  </View>
                }
                body={tripAuthorityBanner.description}
              />

              <Card
                theme={driverCanvasTheme}
                padding={14}
                style={styles.routeCard}
              >
                <View
                  style={[
                    styles.mapSurface,
                    {
                      backgroundColor: tripSurfacePalette.backgroundColor,
                      borderColor: tripSurfacePalette.borderColor,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.mapGlow,
                      {
                        backgroundColor: `${tripSurfacePalette.accentColor}22`,
                      },
                    ]}
                  />
                  <View style={styles.mapGrid} />
                  <View style={styles.mapBadge}>
                    <Ionicons
                      name="navigate-outline"
                      size={12}
                      color={tripSurfacePalette.accentColor}
                    />
                    <Text
                      style={[
                        styles.mapBadgeText,
                        { color: tripSurfacePalette.accentColor },
                      ]}
                    >
                      {routeOverlayLabel}
                    </Text>
                  </View>
                  <View style={styles.routeRow}>
                    <View style={styles.routeRail}>
                      <View
                        style={[
                          styles.routeDot,
                          { backgroundColor: driverCanvasTheme.success },
                        ]}
                      />
                      <View style={styles.routeConnector} />
                      <View
                        style={[
                          styles.routeDot,
                          { backgroundColor: driverCanvasTheme.danger },
                        ]}
                      />
                    </View>
                    <View style={styles.routeStopsColumn}>
                      <View style={styles.routeStopBlock}>
                        <Text style={styles.routeStopLabel}>取貨點</Text>
                        <Text style={styles.routeStopAddress}>
                          {pickupAddress}
                        </Text>
                        <Text style={styles.routeStopTime}>
                          {pickupTimeLabel}
                        </Text>
                      </View>
                      <View style={styles.routeStopBlock}>
                        <Text style={styles.routeStopLabel}>送達點</Text>
                        <Text style={styles.routeStopAddress}>
                          {dropoffAddress}
                        </Text>
                        <Text style={styles.routeStopTime}>
                          {dropoffTimeLabel}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                <View style={styles.metricRow}>
                  <MetricPill
                    icon="map-outline"
                    label="距離"
                    value={routeMetricDistance}
                    tone={
                      tripExperienceState === "sync_failed"
                        ? "danger"
                        : tripStatusPresentation.tone === "warning"
                          ? "warning"
                          : "success"
                    }
                  />
                  <MetricPill
                    icon="time-outline"
                    label="時長"
                    value={routeMetricDuration}
                    tone={trackingDescriptor.tone}
                  />
                  <MetricPill
                    icon="pricetag-outline"
                    label="車資"
                    value={routeMetricFare}
                  />
                </View>
              </Card>

              <Card
                theme={driverCanvasTheme}
                padding={14}
                style={styles.statusCard}
              >
                <View style={styles.statusPillRow}>
                  <Pill
                    theme={driverCanvasTheme}
                    tone={toCanvasTone(tripStatusPresentation.tone)}
                    dot
                  >
                    {tripStatusPresentation.label}
                  </Pill>
                  <Pill theme={driverCanvasTheme} tone="neutral">
                    {taskDetail.taskId}
                  </Pill>
                  {isForwardedTrip ? <RouteLockedBadge /> : null}
                  {recordingActive ? (
                    <Pill theme={driverCanvasTheme} tone="danger" dot>
                      錄製中
                    </Pill>
                  ) : null}
                </View>
                <Text style={styles.statusDetailText}>
                  {tripStatusPresentation.detail}
                </Text>
                <View style={styles.statusPillRow}>
                  <Pill
                    theme={driverCanvasTheme}
                    tone={toCanvasTone(trackingDescriptor.tone)}
                    dot
                  >
                    {`追蹤 · ${trackingDescriptor.label}`}
                  </Pill>
                  <Pill
                    theme={driverCanvasTheme}
                    tone={isForwardedTrip ? "info" : "accent"}
                  >
                    {isForwardedTrip ? `平台 ${platformLabel}` : "自營派單"}
                  </Pill>
                  <Pill theme={driverCanvasTheme} tone="neutral">
                    {formatDriverTaskStatusLabel(taskDetail.status)}
                  </Pill>
                </View>
                <Text style={styles.statusMetaText}>
                  {tripAuthorityDescription}
                </Text>
              </Card>

              {tripLockBody ? (
                <Card
                  theme={driverCanvasTheme}
                  padding={18}
                  style={styles.lockCard}
                >
                  <Ionicons
                    name={tripLockBody.icon}
                    size={28}
                    color={tripSurfacePalette.accentColor}
                  />
                  <Text style={styles.lockCardTitle}>{tripLockBody.title}</Text>
                  <Text style={styles.lockCardDetail}>
                    {tripLockBody.detail}
                  </Text>
                </Card>
              ) : null}

              {forwardedOutcomeSummary && forwardedOutcomeTone ? (
                <Banner
                  theme={driverCanvasTheme}
                  tone={forwardedOutcomeTone}
                  icon={
                    <Ionicons
                      name="checkmark-done-outline"
                      size={16}
                      color={getCanvasToneSet(forwardedOutcomeTone).fg}
                    />
                  }
                  title={forwardedOutcomeSummary.title}
                  body={
                    <View style={styles.bannerBodyStack}>
                      <Text style={styles.bannerBodyText}>
                        {forwardedActionResult?.driverMessage}
                      </Text>
                      <Text style={styles.bannerMetaText}>
                        平台訂單編號：
                        {
                          forwardedActionResult?.managementCorrelationIds
                            .mirrorOrderId
                        }
                        {forwardedActionResult?.managementCorrelationIds
                          .reconciliationJobId
                          ? `／對帳工單 ${forwardedActionResult.managementCorrelationIds.reconciliationJobId}`
                          : ""}
                      </Text>
                    </View>
                  }
                />
              ) : null}
            </>
          ) : (
            <Card theme={driverCanvasTheme} padding={18}>
              <Text style={styles.emptyTitle}>目前沒有進行中的行程</Text>
              <Text style={styles.emptyBody}>
                重新整理後可再次檢查是否有新任務同步進來。
              </Text>
              <View style={styles.inlineActionRow}>
                <ActionButton
                  label="重新整理"
                  onPress={() => void loadTrip(true)}
                  disabled={submittingAction !== null}
                />
              </View>
            </Card>
          )}
        </View>

        {taskDetail ? (
          <View style={styles.bottomActionBar}>
            <Text style={styles.bottomActionNotice}>
              {bottomPrimaryAction || bottomSecondaryAction
                ? bottomNotice
                : getIdleBottomActionLabel(tripExperienceState)}
            </Text>
            <View style={styles.bottomActionButtons}>
              {bottomSecondaryAction ? (
                <ActionButton
                  label={bottomSecondaryAction.title}
                  onPress={bottomSecondaryAction.onPress}
                  disabled={bottomSecondaryAction.disabled}
                  loading={bottomSecondaryAction.loading}
                  variant="secondary"
                />
              ) : null}
              {bottomPrimaryAction ? (
                <ActionButton
                  label={bottomPrimaryAction.title}
                  onPress={bottomPrimaryAction.onPress}
                  disabled={bottomPrimaryAction.disabled}
                  loading={bottomPrimaryAction.loading}
                  variant="primary"
                />
              ) : (
                <ActionButton
                  label={getIdleBottomActionLabel(tripExperienceState)}
                  onPress={() => undefined}
                  disabled
                  variant="secondary"
                />
              )}
            </View>
          </View>
        ) : null}
      </View>

      {taskDetail ? (
        <>
          <View style={styles.kpiRow}>
            <KPI
              theme={driverCanvasTheme}
              label="距離"
              value={routeMetricDistance}
              sub={tripStateEyebrow}
              hint={taskDetail.taskId}
            />
            <KPI
              theme={driverCanvasTheme}
              label="追蹤"
              value={trackingDescriptor.label}
              sub={trackingDescriptor.detail}
              hint={
                recordingActive
                  ? (orderDetail?.recordingId ?? "local")
                  : "standby"
              }
            />
            <KPI
              theme={driverCanvasTheme}
              label="車資"
              value={routeMetricFare}
              sub={formatReservationWindow(orderDetail)}
              hint={orderDetail?.quotedFareSource ?? "route"}
            />
          </View>

          <Card
            theme={driverCanvasTheme}
            title="行程摘要"
            subtitle="訂單、平台與預約上下文"
          >
            <DL theme={driverCanvasTheme} cols={2} items={tripSummaryItems} />
          </Card>

          <Card
            theme={driverCanvasTheme}
            title={driverStrings.trip.sections.availableActions}
            subtitle={forwardedActionCardCopy.title}
          >
            <Table
              theme={driverCanvasTheme}
              dense
              columns={[
                {
                  h: "Code",
                  w: 76,
                  mono: true,
                  r: (row: (typeof workflowRows)[number]) => (
                    <Text style={styles.tableCodeText}>{row.code}</Text>
                  ),
                },
                { h: "項目", w: 92, k: "item" },
                {
                  h: "狀態",
                  w: 122,
                  r: (row: (typeof workflowRows)[number]) => (
                    <Pill theme={driverCanvasTheme} tone={row.tone} dot>
                      {row.state}
                    </Pill>
                  ),
                },
                { h: "說明", k: "note" },
              ]}
              rows={workflowRows}
            />
            <View style={styles.bulletList}>
              {tripCapabilityItems.map((item) => (
                <View key={item} style={styles.bulletRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.bulletText}>{item}</Text>
                </View>
              ))}
            </View>
          </Card>

          <Card
            theme={driverCanvasTheme}
            title={driverStrings.trip.sections.statusMetrics}
            subtitle="追蹤、錄製與定位摘要"
          >
            <DL
              theme={driverCanvasTheme}
              cols={2}
              items={[
                {
                  label: "錄製識別",
                  value: orderDetail?.recordingId ?? "未啟用",
                  mono: true,
                },
                {
                  label: "ETA",
                  value:
                    orderDetail?.etaSnapshot?.etaMinutes != null
                      ? `${orderDetail.etaSnapshot.etaMinutes} 分`
                      : "待同步",
                  mono: true,
                },
                {
                  label: "現場聯絡",
                  value:
                    orderDetail?.onsiteContact?.phone ??
                    orderDetail?.passenger.phone ??
                    "待同步",
                  mono: true,
                },
                {
                  label: "最後更新",
                  value: formatShortDateTime(
                    taskDetail.completedAt ??
                      taskDetail.startedAt ??
                      taskDetail.arrivedPickupAt ??
                      taskDetail.acceptedAt,
                  ),
                  mono: true,
                },
              ]}
            />
            {!isForwardedTrip &&
            isTripInProgress &&
            (locationTrackingState === "permission_denied" ||
              locationTrackingState === "error") ? (
              <View style={styles.inlineActionRow}>
                <ActionButton
                  label="重試追蹤"
                  onPress={() => setTrackingRetryKey((current) => current + 1)}
                  disabled={submittingAction !== null}
                  variant="secondary"
                />
              </View>
            ) : null}
          </Card>

          {complianceRows.length > 0 ? (
            <Card
              theme={driverCanvasTheme}
              title={driverStrings.trip.sections.compliance}
              subtitle="完成行程前需確認的 gate"
            >
              <Table
                theme={driverCanvasTheme}
                dense
                columns={[
                  {
                    h: "Code",
                    w: 92,
                    mono: true,
                    r: (row: (typeof complianceRows)[number]) => (
                      <Text style={styles.tableCodeText}>{row.code}</Text>
                    ),
                  },
                  { h: "項目", w: 112, k: "title" },
                  {
                    h: "狀態",
                    w: 112,
                    r: (row: (typeof complianceRows)[number]) => (
                      <Pill theme={driverCanvasTheme} tone={row.tone} dot>
                        {row.state}
                      </Pill>
                    ),
                  },
                  { h: "處理", k: "nextAction" },
                ]}
                rows={complianceRows}
              />
            </Card>
          ) : null}

          {!isForwardedTrip && showCompletionProofCard ? (
            <Card
              theme={driverCanvasTheme}
              title={driverStrings.trip.sections.completionProof}
              subtitle="照片、簽收與費用佐證"
            >
              {proofRequirementsUnavailable ? (
                <Banner
                  theme={driverCanvasTheme}
                  tone="danger"
                  title="需先載入訂單詳情"
                  body="確認完單 requirements 前，請先重新整理行程。"
                />
              ) : null}

              <DL
                theme={driverCanvasTheme}
                cols={2}
                items={proofSummaryItems}
              />

              {proofRequirements.minPhotoCount > 0 ? (
                <Banner
                  theme={driverCanvasTheme}
                  tone={missingRequiredPhotos > 0 ? "warn" : "success"}
                  title={`至少需要 ${proofRequirements.minPhotoCount} 張照片`}
                  body={
                    missingRequiredPhotos > 0
                      ? `完成前仍需補上 ${missingRequiredPhotos} 張佐證照片。`
                      : "已達照片需求。"
                  }
                />
              ) : null}

              {proofRequirements.signoffRequired ? (
                <View style={styles.fieldStack}>
                  <Field
                    theme={driverCanvasTheme}
                    label="簽收識別"
                    hint="乘客簽收或簽收單號"
                    required
                  >
                    <Input
                      theme={driverCanvasTheme}
                      value={signoffReference}
                      onChangeText={setSignoffReference}
                      editable={submittingAction === null}
                      ph="乘客簽收或簽收單號"
                      mono
                      autoCapitalize="characters"
                      autoCorrect={false}
                    />
                  </Field>
                  <Text style={styles.fieldFeedbackText}>
                    {signoffRequirementMissing
                      ? "尚未填寫簽收識別資料。"
                      : "簽收需求已完成。"}
                  </Text>
                </View>
              ) : null}

              {proofRequirements.expenseProofRequired ? (
                <View style={styles.fieldStack}>
                  <Field
                    theme={driverCanvasTheme}
                    label="費用類型"
                    hint="例如過路費或停車費"
                    required
                  >
                    <Input
                      theme={driverCanvasTheme}
                      value={expenseType}
                      onChangeText={setExpenseType}
                      editable={submittingAction === null}
                      ph="例如過路費或停車費"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </Field>
                  <Field
                    theme={driverCanvasTheme}
                    label="金額"
                    hint="例如 40 或 40.50"
                    required
                  >
                    <Input
                      theme={driverCanvasTheme}
                      value={expenseAmount}
                      onChangeText={setExpenseAmount}
                      editable={submittingAction === null}
                      ph="例如 40 或 40.50"
                      mono
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </Field>
                  <Field
                    theme={driverCanvasTheme}
                    label="單據識別"
                    hint="單據或附件識別"
                    required
                  >
                    <Input
                      theme={driverCanvasTheme}
                      value={expenseAttachmentRef}
                      onChangeText={setExpenseAttachmentRef}
                      editable={submittingAction === null}
                      ph="單據或附件識別"
                      mono
                      autoCapitalize="characters"
                      autoCorrect={false}
                    />
                  </Field>
                  <Text style={styles.fieldFeedbackText}>
                    {expenseAmountInvalid
                      ? "請輸入有效的正數金額。"
                      : expenseRequirementMissing
                        ? "費用佐證資料尚未填完整。"
                        : expenseAttachmentId
                          ? `費用佐證已完成：${expenseAttachmentId}`
                          : "費用佐證已完成。"}
                  </Text>
                </View>
              ) : null}

              <View style={styles.inlineActionRow}>
                <ActionButton
                  label="拍照上傳"
                  onPress={() => void pickProofPhotos("camera")}
                  disabled={
                    submittingAction !== null ||
                    remainingSlots <= 0 ||
                    proofRequirementsUnavailable
                  }
                  variant="secondary"
                />
                <ActionButton
                  label="從相簿選取"
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
                    <View
                      key={`${photo.uri}-${index}`}
                      style={styles.photoCard}
                    >
                      <Image
                        source={{ uri: photo.uri }}
                        style={styles.photoPreview}
                      />
                      <Text numberOfLines={1} style={styles.photoMeta}>
                        {Math.round(photo.estimatedBytes / 1024)} KB
                      </Text>
                      <ActionButton
                        label="移除"
                        onPress={() => removeProofPhoto(index)}
                        disabled={submittingAction !== null}
                        variant="secondary"
                      />
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyPhotoState}>
                  <Ionicons
                    name="images-outline"
                    size={20}
                    color={driverCanvasTheme.textDim}
                  />
                  <Text style={styles.emptyPhotoTitle}>尚未選取佐證照片</Text>
                  <Text style={styles.emptyPhotoBody}>
                    可從相機或相簿新增完單照片。
                  </Text>
                </View>
              )}
            </Card>
          ) : null}

          <Banner
            theme={driverCanvasTheme}
            tone="danger"
            icon={
              <Ionicons
                name="warning-outline"
                size={16}
                color={driverCanvasTheme.danger}
              />
            }
            title="需要立即通報重大安全事件？"
            body="開啟 SOS 緊急通報後，送出前仍需再確認一次。"
            actions={
              <Btn
                theme={driverCanvasTheme}
                variant="primary"
                size="sm"
                danger
                onPress={() => router.push("/incident")}
              >
                開啟 SOS 緊急通報
              </Btn>
            }
          />
        </>
      ) : null}
    </Shell>
  );
}

const styles = StyleSheet.create({
  shellContent: {
    gap: 14,
    paddingBottom: 28,
  },
  actionButton: {
    flex: 1,
  },
  loadingState: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 220,
    gap: 12,
  },
  loadingLabel: {
    fontSize: 13,
    lineHeight: 18,
    color: driverCanvasTheme.textMuted,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  heroPane: {
    minHeight: 722,
    justifyContent: "space-between",
    gap: 14,
  },
  heroPaneTop: {
    gap: 14,
  },
  headerActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  bannerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  bannerTitleText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: driverCanvasTheme.text,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  bannerBodyStack: {
    gap: 4,
  },
  bannerBodyText: {
    fontSize: 12.5,
    lineHeight: 18,
    color: driverCanvasTheme.text,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  bannerMetaText: {
    fontSize: 11,
    lineHeight: 16,
    color: driverCanvasTheme.textMuted,
    fontFamily: driverCanvasTheme.monoFamily,
  },
  routeCard: {
    borderRadius: 14,
  },
  mapSurface: {
    position: "relative",
    minHeight: 188,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  mapGlow: {
    position: "absolute",
    top: -72,
    right: -28,
    width: 216,
    height: 216,
    borderRadius: 999,
  },
  mapGrid: {
    ...StyleSheet.absoluteFillObject,
    margin: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.05)",
  },
  mapBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: driverCanvasTheme.surface,
    borderWidth: 1,
    borderColor: driverCanvasTheme.border,
  },
  mapBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    fontFamily: driverCanvasTheme.monoFamily,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
  },
  routeRail: {
    width: 12,
    alignItems: "center",
    paddingTop: 5,
    paddingBottom: 4,
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  routeConnector: {
    width: 1.5,
    flex: 1,
    marginVertical: 6,
    backgroundColor: driverCanvasTheme.border,
  },
  routeStopsColumn: {
    flex: 1,
    gap: 16,
  },
  routeStopBlock: {
    gap: 3,
  },
  routeStopLabel: {
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "700",
    color: driverCanvasTheme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontFamily: driverCanvasTheme.fontFamily,
  },
  routeStopAddress: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: driverCanvasTheme.text,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  routeStopTime: {
    fontSize: 11.5,
    lineHeight: 15,
    color: driverCanvasTheme.textDim,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  metricRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  metricPill: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderWidth: 1,
    borderRadius: 8,
  },
  metricPillCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  metricPillLabel: {
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  metricPillValue: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "700",
  },
  statusCard: {
    borderRadius: 14,
  },
  statusPillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  statusDetailText: {
    fontSize: 13,
    lineHeight: 18,
    color: driverCanvasTheme.text,
    fontFamily: driverCanvasTheme.fontFamily,
    marginTop: 10,
  },
  statusMetaText: {
    fontSize: 12.5,
    lineHeight: 18,
    color: driverCanvasTheme.textMuted,
    fontFamily: driverCanvasTheme.fontFamily,
    marginTop: 10,
  },
  lockCard: {
    borderRadius: 14,
  },
  lockCardTitle: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "700",
    color: driverCanvasTheme.text,
    textAlign: "center",
    fontFamily: driverCanvasTheme.fontFamily,
    marginTop: 10,
  },
  lockCardDetail: {
    fontSize: 12.5,
    lineHeight: 18,
    color: driverCanvasTheme.textMuted,
    textAlign: "center",
    fontFamily: driverCanvasTheme.fontFamily,
    marginTop: 4,
  },
  bottomActionBar: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: driverCanvasTheme.border,
    backgroundColor: driverCanvasTheme.bgRaised,
    gap: 10,
  },
  bottomActionNotice: {
    fontSize: 12,
    lineHeight: 17,
    color: driverCanvasTheme.textMuted,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  bottomActionButtons: {
    flexDirection: "row",
    gap: 8,
    alignItems: "stretch",
  },
  kpiRow: {
    flexDirection: "row",
    gap: 10,
  },
  tableCodeText: {
    color: driverCanvasTheme.accent,
    fontFamily: driverCanvasTheme.monoFamily,
    fontSize: 11.5,
    lineHeight: 18,
    fontWeight: "700",
  },
  bulletList: {
    marginTop: 12,
    gap: 8,
  },
  bulletRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    backgroundColor: driverCanvasTheme.accent,
  },
  bulletText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    color: driverCanvasTheme.text,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  inlineActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  fieldStack: {
    gap: 10,
    marginTop: 12,
  },
  fieldFeedbackText: {
    fontSize: 11.5,
    lineHeight: 16,
    color: driverCanvasTheme.textMuted,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 12,
  },
  photoCard: {
    width: "47%",
    backgroundColor: driverCanvasTheme.surfaceLo,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: driverCanvasTheme.border,
    gap: 10,
  },
  photoPreview: {
    width: "100%",
    aspectRatio: 1.2,
    borderRadius: 8,
    backgroundColor: driverCanvasTheme.bgRaised,
  },
  photoMeta: {
    fontSize: 11.5,
    lineHeight: 16,
    color: driverCanvasTheme.textMuted,
    textAlign: "center",
    fontFamily: driverCanvasTheme.monoFamily,
  },
  emptyPhotoState: {
    marginTop: 12,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: driverCanvasTheme.border,
    alignItems: "center",
    gap: 8,
  },
  emptyPhotoTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: driverCanvasTheme.text,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  emptyPhotoBody: {
    fontSize: 12,
    lineHeight: 17,
    color: driverCanvasTheme.textMuted,
    textAlign: "center",
    fontFamily: driverCanvasTheme.fontFamily,
  },
  emptyTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
    color: driverCanvasTheme.text,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  emptyBody: {
    marginTop: 6,
    fontSize: 12.5,
    lineHeight: 18,
    color: driverCanvasTheme.textMuted,
    fontFamily: driverCanvasTheme.fontFamily,
  },
});
