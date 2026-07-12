/**
 * Driver pre-online permission gate (SD §6.4 "Permission Gate" / SA §6.3).
 *
 * Before a driver may go online the app verifies four pre-conditions:
 *
 * 1. bound device
 * 2. valid identity
 * 3. foreground location permission
 * 4. background location permission
 *
 * A failing condition blocks going online and surfaces a denial reason plus a
 * resolution path: an OS settings deep-link for location permissions, or device
 * onboarding for an unbound device / invalid identity. Per SA §6.3 a missing
 * foreground permission reports `LOCATION_PERMISSION_DENIED`, and a missing
 * background permission (foreground granted) reports
 * `BACKGROUND_LOCATION_REQUIRED` — the driver may browse but may not enter
 * `online_available`.
 *
 * The evaluator is a pure function over a snapshot so the gate decision is unit
 * testable without device permission APIs; `readDriverOnlineGateSnapshot`
 * captures the live snapshot from expo-location and the driver identity store.
 */
import * as Location from "expo-location";
import { Linking } from "react-native";

import {
  getDriverIdentityIssue,
  isDriverIdentityProvisioned,
} from "@/lib/api-client";

export type DriverOnlineGateReasonCode =
  | "DEVICE_NOT_BOUND"
  | "IDENTITY_INVALID"
  | "LOCATION_PERMISSION_DENIED"
  | "BACKGROUND_LOCATION_REQUIRED";

export type DriverOnlineGateCheckKey =
  | "device"
  | "identity"
  | "foregroundLocation"
  | "backgroundLocation";

/** How a blocking reason is resolved by the driver. */
export type DriverOnlineGateResolution = "settings" | "onboarding";

export type DriverOnlineGateSnapshot = {
  /** A device binding (or dev override) is provisioned. */
  deviceBound: boolean;
  /**
   * Non-null when the stored driver identity was invalidated (suspended,
   * revoked, cert invalid, …); the message is human-readable copy.
   */
  identityIssueMessage: string | null;
  foregroundGranted: boolean;
  backgroundGranted: boolean;
};

export type DriverOnlineGateReason = {
  code: DriverOnlineGateReasonCode;
  check: DriverOnlineGateCheckKey;
  title: string;
  description: string;
  resolution: DriverOnlineGateResolution;
  actionLabel: string;
};

export type DriverOnlineGateCheck = {
  key: DriverOnlineGateCheckKey;
  label: string;
  satisfied: boolean;
  detail: string;
};

export type DriverOnlineGateResult = {
  /** True only when every pre-condition is satisfied. */
  canGoOnline: boolean;
  /** All four checks, in display order, with their satisfied state. */
  checks: DriverOnlineGateCheck[];
  /** Unmet pre-conditions, in priority order. */
  reasons: DriverOnlineGateReason[];
  /** Highest-priority unmet reason, or null when the gate passes. */
  blockingReason: DriverOnlineGateReason | null;
};

const CHECK_LABELS: Record<DriverOnlineGateCheckKey, string> = {
  device: "裝置綁定",
  identity: "司機身分",
  foregroundLocation: "前景定位",
  backgroundLocation: "背景定位",
};

function buildReason(
  code: DriverOnlineGateReasonCode,
  identityIssueMessage: string | null,
): DriverOnlineGateReason {
  switch (code) {
    case "IDENTITY_INVALID":
      return {
        code,
        check: "identity",
        title: "司機身分需重新驗證",
        description:
          identityIssueMessage ??
          "司機身分已失效，請重新綁定裝置或聯絡平台管理員。",
        resolution: "onboarding",
        actionLabel: "重新綁定裝置",
      };
    case "DEVICE_NOT_BOUND":
      return {
        code,
        check: "device",
        title: "尚未綁定裝置",
        description: "此裝置尚未完成車隊綁定，請先完成裝置配置才能上線。",
        resolution: "onboarding",
        actionLabel: "前往配置裝置",
      };
    case "LOCATION_PERMISSION_DENIED":
      return {
        code,
        check: "foregroundLocation",
        title: "需要定位權限",
        description:
          "上線需要前景定位權限。請於系統設定開啟此 App 的定位權限後再試。",
        resolution: "settings",
        actionLabel: "前往設定",
      };
    case "BACKGROUND_LOCATION_REQUIRED":
      return {
        code,
        check: "backgroundLocation",
        title: "需要背景定位",
        description:
          "只允許前景定位時，App 進入背景後位置會中斷，無法穩定派遣。請於系統設定將定位改為「永遠允許」後才能上線。",
        resolution: "settings",
        actionLabel: "前往設定",
      };
  }
}

/**
 * Pure gate decision over a captured snapshot. Reason priority (highest first):
 * identity → device → foreground location → background location. A present
 * identity issue is reported instead of `DEVICE_NOT_BOUND` because an
 * invalidated binding also clears the device session. Background location is
 * only flagged once foreground is granted, mirroring the OS permission ladder
 * and the heartbeat module's check order.
 */
export function evaluateDriverOnlineGate(
  snapshot: DriverOnlineGateSnapshot,
): DriverOnlineGateResult {
  const identityValid = snapshot.identityIssueMessage === null;

  const checks: DriverOnlineGateCheck[] = [
    {
      key: "device",
      label: CHECK_LABELS.device,
      satisfied: snapshot.deviceBound,
      detail: snapshot.deviceBound ? "已綁定" : "未綁定",
    },
    {
      key: "identity",
      label: CHECK_LABELS.identity,
      satisfied: identityValid,
      detail: identityValid ? "正常" : "需重新驗證",
    },
    {
      key: "foregroundLocation",
      label: CHECK_LABELS.foregroundLocation,
      satisfied: snapshot.foregroundGranted,
      detail: snapshot.foregroundGranted ? "已允許" : "未允許",
    },
    {
      key: "backgroundLocation",
      label: CHECK_LABELS.backgroundLocation,
      satisfied: snapshot.backgroundGranted,
      detail: snapshot.backgroundGranted ? "永遠允許" : "未允許",
    },
  ];

  const reasons: DriverOnlineGateReason[] = [];

  if (!identityValid) {
    reasons.push(buildReason("IDENTITY_INVALID", snapshot.identityIssueMessage));
  } else if (!snapshot.deviceBound) {
    reasons.push(buildReason("DEVICE_NOT_BOUND", null));
  }

  if (!snapshot.foregroundGranted) {
    reasons.push(buildReason("LOCATION_PERMISSION_DENIED", null));
  } else if (!snapshot.backgroundGranted) {
    reasons.push(buildReason("BACKGROUND_LOCATION_REQUIRED", null));
  }

  return {
    canGoOnline: reasons.length === 0,
    checks,
    reasons,
    blockingReason: reasons[0] ?? null,
  };
}

/** Capture the live gate snapshot from device permissions + identity store. */
export async function readDriverOnlineGateSnapshot(): Promise<DriverOnlineGateSnapshot> {
  const [foreground, background] = await Promise.all([
    Location.getForegroundPermissionsAsync().catch(() => null),
    Location.getBackgroundPermissionsAsync().catch(() => null),
  ]);

  return {
    deviceBound: isDriverIdentityProvisioned(),
    identityIssueMessage: getDriverIdentityIssue(),
    foregroundGranted: Boolean(foreground?.granted),
    backgroundGranted: Boolean(background?.granted),
  };
}

/** Evaluate the gate against the current live state. */
export async function evaluateDriverOnlineGateNow(): Promise<DriverOnlineGateResult> {
  return evaluateDriverOnlineGate(await readDriverOnlineGateSnapshot());
}

/** Open the OS settings deep-link so the driver can grant location access. */
export async function openDriverPermissionSettings(): Promise<void> {
  await Linking.openSettings();
}
