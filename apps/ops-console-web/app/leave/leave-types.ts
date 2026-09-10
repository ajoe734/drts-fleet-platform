import type {
  DriverLeaveRecord,
  DriverLeaveStatus,
  DriverLeaveType,
} from "@drts/contracts";
import { REALM_COLORS } from "@drts/ui-tokens";

export const OPS_REALM_TOKEN = REALM_COLORS.ops;
export const DRIVER_REALM_TOKEN = REALM_COLORS.driver;

export type OpsLeaveTypeMeta = {
  zh: string;
  tone: "info" | "warn" | "neutral" | "danger";
  code: DriverLeaveType;
};

export type OpsLeaveStatusMeta = {
  zh: string;
  tone: "info" | "warn" | "neutral" | "danger" | "success";
  code: DriverLeaveStatus;
};

export const OPS_LEAVE_TYPE: Record<DriverLeaveType, OpsLeaveTypeMeta> = {
  annual: { zh: "特休", tone: "info", code: "annual" },
  sick: { zh: "病假", tone: "warn", code: "sick" },
  personal: { zh: "事假", tone: "neutral", code: "personal" },
  bereavement: { zh: "喪假", tone: "neutral", code: "bereavement" },
  emergency: { zh: "緊急事假", tone: "danger", code: "emergency" },
};

export const OPS_LEAVE_STATUS: Record<DriverLeaveStatus, OpsLeaveStatusMeta> = {
  pending: { zh: "待審核", tone: "warn", code: "pending" },
  approved: { zh: "已核准", tone: "success", code: "approved" },
  rejected: { zh: "已駁回", tone: "danger", code: "rejected" },
  withdrawn: { zh: "已撤回", tone: "neutral", code: "withdrawn" },
};

const WEEKDAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];

/**
 * Converts a UTC ISO string to Asia/Taipei (UTC+8) Date object.
 */
export function toTaipeiDate(iso: string): Date {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date string: ${iso}`);
  }
  return new Date(d.getTime() + 8 * 3600 * 1000);
}

/**
 * Converts a DriverLeaveRecord UTC ISO timestamp to an Asia/Taipei (UTC+8)
 * "YYYY-MM-DD HH:mm" display string.
 */
export function fmtTaipei(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = toTaipeiDate(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  } catch {
    return iso;
  }
}

/**
 * Formats leave start and end into Asia/Taipei range string.
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

export type OpsLeaveRow = DriverLeaveRecord & {
  driver: string;
  zhRange: string;
  previewShiftIds?: string[];
};

export const FX_OPS_LEAVE: OpsLeaveRow[] = [
  {
    leaveId: "lv_d82a1b5c",
    driverId: "drv_0186",
    driver: "吳明翰 · drv_0186",
    leaveType: "personal",
    status: "pending",
    zhRange: "09/10（四）16:00–21:00",
    startTime: "2026-09-10T08:00:00.000Z",
    endTime: "2026-09-10T13:00:00.000Z",
    reason: "家中臨時事務，需請假處理。",
    impactedShiftIds: [],
    previewShiftIds: ["shift_2305"],
    reviewedByPrincipalId: null,
    reviewedAt: null,
    reviewNotes: null,
    createdAt: "2026-09-10T07:42:00.000Z",
    updatedAt: "2026-09-10T07:42:00.000Z",
  },
  {
    leaveId: "lv_c47b9012",
    driverId: "drv_0201",
    driver: "林建成 · drv_0201",
    leaveType: "sick",
    status: "pending",
    zhRange: "09/11（五）09:00–18:00",
    startTime: "2026-09-11T01:00:00.000Z",
    endTime: "2026-09-11T10:00:00.000Z",
    reason: "就醫回診，附掛號證明。",
    impactedShiftIds: [],
    previewShiftIds: ["shift_2306"],
    reviewedByPrincipalId: null,
    reviewedAt: null,
    reviewNotes: null,
    createdAt: "2026-09-10T06:15:00.000Z",
    updatedAt: "2026-09-10T06:15:00.000Z",
  },
  {
    leaveId: "lv_9c31a204",
    driverId: "drv_0186",
    driver: "吳明翰 · drv_0186",
    leaveType: "annual",
    status: "approved",
    zhRange: "09/14（一）08:00 – 09/16（三）23:59",
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
    driver: "吳明翰 · drv_0186",
    leaveType: "sick",
    status: "rejected",
    zhRange: "09/05（六）09:00–18:00",
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
    driver: "吳明翰 · drv_0186",
    leaveType: "emergency",
    status: "withdrawn",
    zhRange: "09/03（四）21:00 – 09/04（五）01:00",
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

export type OpsShiftBoardRow = {
  shift: string;
  driver: string;
  zh: string;
  tagged: boolean;
  elig: "eligible" | "ineligible";
  pendingReview?: boolean;
};

export const FX_OPS_SHIFT_BOARD: OpsShiftBoardRow[] = [
  {
    shift: "shift_2291",
    driver: "吳明翰 · drv_0186",
    zh: "09/14（一）08:00–20:00",
    tagged: true,
    elig: "ineligible",
  },
  {
    shift: "shift_2292",
    driver: "吳明翰 · drv_0186",
    zh: "09/15（二）08:00–20:00",
    tagged: true,
    elig: "ineligible",
  },
  {
    shift: "shift_2305",
    driver: "吳明翰 · drv_0186",
    zh: "09/10（四）16:00–24:00",
    tagged: false,
    elig: "eligible",
    pendingReview: true,
  },
  {
    shift: "shift_2306",
    driver: "林建成 · drv_0201",
    zh: "09/11（五）08:00–20:00",
    tagged: false,
    elig: "eligible",
    pendingReview: true,
  },
];
