import type {
  PlatformPresenceAdapterStatusRecord,
  PlatformPresenceRecord,
} from "@drts/contracts";

// Platform health helpers used by the shift and onboarding screens.

type TokenExpiryInfo = {
  label: string;
  urgency: "expired" | "urgent" | "warning" | "safe";
};

export interface PlatformHealthAssessment {
  canReceiveOrders: boolean;
  blockers: string[];
  statusLabel: string;
  statusTone: "healthy" | "warning" | "danger" | "neutral";
  adapterLabel: string;
  adapterTone: "healthy" | "warning" | "danger" | "neutral";
  readinessLabel: string;
  tokenInfo: TokenExpiryInfo;
}

function getTokenExpiryInfo(tokenExpiresAt: string | null): TokenExpiryInfo {
  if (!tokenExpiresAt) {
    return { label: "未設定到期時間", urgency: "safe" };
  }

  const now = new Date().getTime();
  const expiresAt = new Date(tokenExpiresAt).getTime();
  const remainingMs = expiresAt - now;

  if (remainingMs <= 0) {
    return { label: "已到期", urgency: "expired" };
  }

  const remainingMinutes = Math.max(0, Math.floor(remainingMs / 60000));
  const remainingHours = Math.floor(remainingMinutes / 60);

  if (remainingHours < 1) {
    return { label: `剩餘 ${remainingMinutes} 分鐘`, urgency: "urgent" };
  }

  if (remainingHours < 24) {
    return {
      label: `剩餘 ${remainingHours} 小時 ${remainingMinutes % 60} 分鐘`,
      urgency: "warning",
    };
  }

  const remainingDays = Math.floor(remainingHours / 24);
  return {
    label: `剩餘 ${remainingDays} 天 ${remainingHours % 24} 小時`,
    urgency: "safe",
  };
}

function getAdapterLabel(
  adapterStatus?: PlatformPresenceAdapterStatusRecord | null,
) {
  if (!adapterStatus || adapterStatus.status === "unknown") {
    return "尚未取得健康狀態";
  }

  switch (adapterStatus.status) {
    case "healthy":
      return "連線正常";
    case "degraded":
      return adapterStatus.blockingReason ?? "平台連線異常";
    default:
      return adapterStatus.blockingReason ?? "平台轉接服務中斷";
  }
}

function getAdapterTone(
  adapterStatus?: PlatformPresenceAdapterStatusRecord | null,
): "healthy" | "warning" | "danger" | "neutral" {
  if (!adapterStatus || adapterStatus.status === "unknown") {
    return "neutral";
  }

  switch (adapterStatus.status) {
    case "healthy":
      return "healthy";
    case "degraded":
      return "warning";
    default:
      return "danger";
  }
}

export function assessPlatformHealth(
  record: PlatformPresenceRecord,
  adapterStatus?: PlatformPresenceAdapterStatusRecord | null,
): PlatformHealthAssessment {
  const tokenInfo = getTokenExpiryInfo(record.tokenExpiresAt);
  const blockers: string[] = [];

  if (!record.accountId) {
    blockers.push("尚未綁定帳號");
  }
  if (record.status !== "online") {
    blockers.push("目前為離線狀態");
  }
  if (tokenInfo.urgency === "expired") {
    blockers.push("平台憑證已到期");
  }
  if (record.reauthRequired) {
    blockers.push("需要重新驗證");
  }
  if (record.eligibility === "pending") {
    blockers.push("資格仍在審核");
  }
  if (record.eligibility === "ineligible") {
    blockers.push("資格已被限制");
  }
  if (adapterStatus?.status === "degraded") {
    blockers.push("平台轉接器降級");
  }
  if (adapterStatus?.status === "down") {
    blockers.push("平台轉接器中斷");
  }

  const canReceiveOrders = blockers.length === 0;
  const attentionOnly =
    !canReceiveOrders &&
    blockers.every((reason) =>
      ["需要重新驗證", "資格仍在審核", "平台轉接器降級"].includes(reason),
    );

  const statusTone = canReceiveOrders
    ? tokenInfo.urgency === "warning" || tokenInfo.urgency === "urgent"
      ? "warning"
      : "healthy"
    : attentionOnly
      ? "warning"
      : "danger";

  return {
    canReceiveOrders,
    blockers,
    statusLabel: canReceiveOrders
      ? "可接單"
      : attentionOnly
        ? "需要處理"
        : "不可接單",
    statusTone,
    adapterLabel: getAdapterLabel(adapterStatus),
    adapterTone: getAdapterTone(adapterStatus),
    readinessLabel: canReceiveOrders
      ? "目前可以接收該平台訂單"
      : `目前無法接單：${blockers.join("、")}`,
    tokenInfo,
  };
}

export function getPlatformHealthSeverity(
  assessment: PlatformHealthAssessment,
): number {
  switch (assessment.statusTone) {
    case "danger":
      return 3;
    case "warning":
      return 2;
    case "healthy":
      return 1;
    default:
      return 0;
  }
}
