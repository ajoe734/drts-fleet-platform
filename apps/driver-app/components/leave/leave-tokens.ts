import {
  MAX_PAST_APPLICATION_GRACE_MS,
  type DriverLeaveRecord,
  type DriverLeaveStatus,
  type DriverLeaveType,
} from "@drts/contracts";
import { REALM_COLORS } from "@drts/ui-tokens";

export { MAX_PAST_APPLICATION_GRACE_MS };

export const DRIVER_REALM_TOKEN = REALM_COLORS.driver;

export type LeaveTypeMeta = {
  zh: string;
  tone: "info" | "warn" | "neutral" | "danger";
  code: DriverLeaveType;
};

export type LeaveStatusMeta = {
  zh: string;
  tone: "info" | "warn" | "neutral" | "danger" | "success";
  code: DriverLeaveStatus;
};

export const DRV_LEAVE_TYPE: Record<DriverLeaveType, LeaveTypeMeta> = {
  annual: { zh: "特休", tone: "info", code: "annual" },
  sick: { zh: "病假", tone: "warn", code: "sick" },
  personal: { zh: "事假", tone: "neutral", code: "personal" },
  bereavement: { zh: "喪假", tone: "neutral", code: "bereavement" },
  emergency: { zh: "緊急事假", tone: "danger", code: "emergency" },
};

export const DRV_LEAVE_STATUS: Record<DriverLeaveStatus, LeaveStatusMeta> = {
  pending: { zh: "待審核", tone: "warn", code: "pending" },
  approved: { zh: "已核准", tone: "success", code: "approved" },
  rejected: { zh: "已駁回", tone: "danger", code: "rejected" },
  withdrawn: { zh: "已撤回", tone: "neutral", code: "withdrawn" },
};

const WEEKDAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];

/**
 * Converts a UTC ISO string to Asia/Taipei (UTC+8) Date object.
 */
export function toTaipeiDate(isoString: string): Date {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date string: ${isoString}`);
  }
  // Offset to UTC+8
  return new Date(d.getTime() + 8 * 3600 * 1000);
}

/**
 * Format UTC ISO string to Asia/Taipei (UTC+8) "YYYY-MM-DD HH:mm".
 */
export function fmtTaipei(isoString: string): string {
  try {
    const d = toTaipeiDate(isoString);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  } catch {
    return isoString;
  }
}

/**
 * Format date range into canonical Chinese display string,
 * e.g. "09/10（四）16:00–21:00" or "09/14（一）08:00 – 09/16（三）23:59".
 */
export function formatLeaveRangeZh(startTimeUtc: string, endTimeUtc: string): string {
  try {
    const start = toTaipeiDate(startTimeUtc);
    const end = toTaipeiDate(endTimeUtc);

    const p = (n: number) => String(n).padStart(2, "0");
    const sMonth = p(start.getUTCMonth() + 1);
    const sDate = p(start.getUTCDate());
    const sDay = WEEKDAY_ZH[start.getUTCDay()];
    const sTime = `${p(start.getUTCHours())}:${p(start.getUTCMinutes())}`;

    const eMonth = p(end.getUTCMonth() + 1);
    const eDate = p(end.getUTCDate());
    const eDay = WEEKDAY_ZH[end.getUTCDay()];
    const eTime = `${p(end.getUTCHours())}:${p(end.getUTCMinutes())}`;

    const isSameDay =
      start.getUTCFullYear() === end.getUTCFullYear() &&
      start.getUTCMonth() === end.getUTCMonth() &&
      start.getUTCDate() === end.getUTCDate();

    if (isSameDay) {
      return `${sMonth}/${sDate}（${sDay}）${sTime}–${eTime}`;
    }
    return `${sMonth}/${sDate}（${sDay}）${sTime} – ${eMonth}/${eDate}（${eDay}）${eTime}`;
  } catch {
    return `${startTimeUtc} – ${endTimeUtc}`;
  }
}

export type TimeValidationResult = {
  valid: boolean;
  field?: "start" | "end";
  code?: string;
  message?: string;
};

/**
 * Validates leave time range per contract §2.6:
 * - Date parseable
 * - Start time not earlier than now - 15min
 * - End time > start time
 */
export function validateLeaveTimeRange(
  startTimeStr: string,
  endTimeStr: string,
  referenceNow: Date = new Date(),
): TimeValidationResult {
  const startMs = Date.parse(startTimeStr);
  if (Number.isNaN(startMs)) {
    return {
      valid: false,
      field: "start",
      code: "LEAVE_INVALID_TIME_RANGE",
      message: "LEAVE_INVALID_TIME_RANGE · 日期格式無效，請重新選擇",
    };
  }

  const endMs = Date.parse(endTimeStr);
  if (Number.isNaN(endMs)) {
    return {
      valid: false,
      field: "end",
      code: "LEAVE_INVALID_TIME_RANGE",
      message: "LEAVE_INVALID_TIME_RANGE · 日期格式無效，請重新選擇",
    };
  }

  const earliestAllowed = referenceNow.getTime() - MAX_PAST_APPLICATION_GRACE_MS;
  if (startMs < earliestAllowed) {
    return {
      valid: false,
      field: "start",
      code: "LEAVE_INVALID_TIME_RANGE",
      message:
        "LEAVE_INVALID_TIME_RANGE · 起始時間不得早於現在 15 分鐘以上（MAX_PAST_APPLICATION_GRACE_MS）",
    };
  }

  if (endMs <= startMs) {
    return {
      valid: false,
      field: "end",
      code: "LEAVE_INVALID_TIME_RANGE",
      message: "LEAVE_INVALID_TIME_RANGE · 結束時間必須晚於開始時間（endTime <= startTime）",
    };
  }

  return { valid: true };
}

/**
 * Checks if a new request overlaps with existing active (pending or approved) leaves.
 */
export function checkLeaveOverlap(
  newStartUtc: string,
  newEndUtc: string,
  existingLeaves: DriverLeaveRecord[],
): { overlaps: boolean; overlappingLeave?: DriverLeaveRecord } {
  const newStartMs = Date.parse(newStartUtc);
  const newEndMs = Date.parse(newEndUtc);

  if (Number.isNaN(newStartMs) || Number.isNaN(newEndMs)) {
    return { overlaps: false };
  }

  const activeLeaves = existingLeaves.filter(
    (l) => l.status === "pending" || l.status === "approved",
  );

  for (const lv of activeLeaves) {
    const lvStartMs = Date.parse(lv.startTime);
    const lvEndMs = Date.parse(lv.endTime);

    // Overlap condition: max(start1, start2) < min(end1, end2)
    if (Math.max(newStartMs, lvStartMs) < Math.min(newEndMs, lvEndMs)) {
      return { overlaps: true, overlappingLeave: lv };
    }
  }

  return { overlaps: false };
}

/**
 * Fixture aligned with DriverLeaveRecord — mirrors driver-leave.jsx FX_DRV_LEAVE.
 * All four records belong to driverId: 'drv_0186' (吳明翰).
 */
export const FX_DRV_LEAVE: DriverLeaveRecord[] = [
  {
    leaveId: "lv_d82a1b5c",
    driverId: "drv_0186",
    leaveType: "personal",
    status: "pending",
    startTime: "2026-09-10T08:00:00.000Z",
    endTime: "2026-09-10T13:00:00.000Z",
    reason: "家中臨時事務，需請假處理。",
    impactedShiftIds: [],
    reviewedByPrincipalId: null,
    reviewedAt: null,
    reviewNotes: null,
    createdAt: "2026-09-10T07:42:00.000Z",
    updatedAt: "2026-09-10T07:42:00.000Z",
  },
  {
    leaveId: "lv_9c31a204",
    driverId: "drv_0186",
    leaveType: "annual",
    status: "approved",
    startTime: "2026-09-14T00:00:00.000Z",
    endTime: "2026-09-16T15:59:00.000Z",
    reason: "家庭旅遊，已提前排班交接。",
    impactedShiftIds: ["shift_2291", "shift_2292"],
    reviewedByPrincipalId: "王芳 · ops_manager",
    reviewedAt: "2026-09-08T02:10:00.000Z",
    reviewNotes: "已核准，對應班次已標記調離。",
    createdAt: "2026-09-05T09:00:00.000Z",
    updatedAt: "2026-09-08T02:10:00.000Z",
  },
  {
    leaveId: "lv_71e9f830",
    driverId: "drv_0186",
    leaveType: "sick",
    status: "rejected",
    startTime: "2026-09-05T01:00:00.000Z",
    endTime: "2026-09-05T10:00:00.000Z",
    reason: "身體不適。",
    impactedShiftIds: [],
    reviewedByPrincipalId: "王芳 · ops_manager",
    reviewedAt: "2026-09-05T02:00:00.000Z",
    reviewNotes: "未附診斷證明，請補件後重新申請。",
    createdAt: "2026-09-05T00:50:00.000Z",
    updatedAt: "2026-09-05T02:00:00.000Z",
  },
  {
    leaveId: "lv_5b204a11",
    driverId: "drv_0186",
    leaveType: "emergency",
    status: "withdrawn",
    startTime: "2026-09-03T13:00:00.000Z",
    endTime: "2026-09-03T17:00:00.000Z",
    reason: "臨時通知取消，已能正常排班。",
    impactedShiftIds: [],
    reviewedByPrincipalId: null,
    reviewedAt: null,
    reviewNotes: null,
    createdAt: "2026-09-03T12:50:00.000Z",
    updatedAt: "2026-09-03T12:55:00.000Z",
  },
];
