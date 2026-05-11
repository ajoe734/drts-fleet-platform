import type { CSSProperties } from "react";
import type { ManagementTone, StepState } from "./index";

type StoryNotice = {
  title: string;
  description: string;
  tone: ManagementTone;
  footer: string;
};

type StoryActivityItem = {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  tone?: ManagementTone;
  meta?: string;
};

type StoryLifecycleItem = {
  id: string;
  title: string;
  description: string;
  state: StepState;
  stateLabel?: string;
  tone?: ManagementTone;
};

export const tenantStoryBookings = [
  {
    bookingId: "BK-240508-001",
    orderId: "ORD-902144",
    subtype: "airport_pickup",
    bookingType: "reservation",
    pickup: "台北市信義區松仁路 100 號",
    dropoff: "桃園機場 第二航廈 出境大廳",
    windowStart: "2026-05-08 17:30",
    windowEnd: "2026-05-08 18:00",
    passenger: "林士群",
    phone: "0912-345-678",
    costCenter: "CC-FIN-04",
    state: "assigned",
    bookingState: "confirmed",
    source: "DRTS operated",
    sourceTone: "tenant" as const,
  },
  {
    bookingId: "BK-240508-002",
    orderId: "ORD-902145",
    subtype: "high_speed_rail",
    bookingType: "reservation",
    pickup: "南港高鐵站",
    dropoff: "新竹科學園區 管理局",
    windowStart: "2026-05-08 18:20",
    windowEnd: "2026-05-08 19:00",
    passenger: "王思穎",
    phone: "0900-555-122",
    costCenter: "CC-RD-12",
    state: "ready_for_dispatch",
    bookingState: "confirmed",
    source: "Forwarded authority",
    sourceTone: "warning" as const,
  },
  {
    bookingId: "BK-240508-003",
    orderId: "ORD-902146",
    subtype: "business_dispatch",
    bookingType: "instant",
    pickup: "內湖總部 A 棟",
    dropoff: "松山機場 國內線",
    windowStart: "2026-05-08 14:10",
    windowEnd: "2026-05-08 14:40",
    passenger: "黃怡安",
    phone: "0922-111-009",
    costCenter: "CC-BD-09",
    state: "on_trip",
    bookingState: "confirmed",
    source: "DRTS operated",
    sourceTone: "tenant" as const,
  },
  {
    bookingId: "BK-240508-004",
    orderId: "ORD-902147",
    subtype: "airport_dropoff",
    bookingType: "reservation",
    pickup: "台北市中山區南京東路三段",
    dropoff: "桃園機場 第一航廈",
    windowStart: "2026-05-09 05:20",
    windowEnd: "2026-05-09 06:00",
    passenger: "張俐萱",
    phone: "0933-800-456",
    costCenter: "CC-EXEC-01",
    state: "proof_pending",
    bookingState: "confirmed",
    source: "DRTS operated",
    sourceTone: "tenant" as const,
  },
  {
    bookingId: "BK-240508-005",
    orderId: "ORD-902148",
    subtype: "cross_city",
    bookingType: "reservation",
    pickup: "板橋高鐵站",
    dropoff: "台中歌劇院",
    windowStart: "2026-05-09 08:30",
    windowEnd: "2026-05-09 10:30",
    passenger: "林哲民",
    phone: "0918-400-222",
    costCenter: "CC-OPS-02",
    state: "completed",
    bookingState: "completed",
    source: "DRTS operated",
    sourceTone: "tenant" as const,
  },
] as const;

export const tenantStoryNotices: StoryNotice[] = [
  {
    title: "Webhook wh_03 paused for 2 days",
    description:
      "Sandbox endpoint is still under validation, so production event delivery remains suspended.",
    tone: "warning" as const,
    footer: "ops_notice · 2026-05-08 09:10",
  },
  {
    title: "Platform maintenance window",
    description:
      "2026-05-15 02:00-04:00 UTC. Dispatch services pause during the scheduled upgrade.",
    tone: "info" as const,
    footer: "ops_notice · 2026-05-08 07:20",
  },
  {
    title: "SLA this month is 99.4%",
    description:
      "Above the contractual 99.0% baseline across owned and forwarded lanes.",
    tone: "success" as const,
    footer: "tenant_sla · 2026-05-08 06:10",
  },
] as const;

export const tenantStoryActivity: StoryActivityItem[] = [
  {
    id: "created",
    title: "Booking created",
    detail: "Created by 張俐萱 for 林士群 through the tenant web console.",
    timestamp: "2026-05-08 14:24",
    tone: "tenant" as const,
    meta: "BK-240508-001 · ORD-902144",
  },
  {
    id: "window",
    title: "Reservation window",
    detail: "台北市信義區松仁路 100 號 -> 桃園機場 第二航廈 出境大廳",
    timestamp: "2026-05-08 17:30",
    tone: "info" as const,
    meta: "window closes 2026-05-08 18:00",
  },
  {
    id: "compliance",
    title: "Compliance posture",
    detail: "2 compliance gates are on file with no current blockers.",
    timestamp: "2026-05-08 14:26",
    tone: "success" as const,
    meta: "DRTS operated",
  },
  {
    id: "status",
    title: "Current workflow status",
    detail: "Order status is assigned and booking status is confirmed.",
    timestamp: "2026-05-08 14:30",
    tone: "success" as const,
    meta: "DRTS dispatch and fulfillment",
  },
  {
    id: "invoice",
    title: "Invoice linkage visible",
    detail: "1 invoice record currently references this order.",
    timestamp: "2026-05-08 15:42",
    tone: "success" as const,
    meta: "INV-2026-05-001",
  },
] as const;

export const tenantStoryLifecycle: StoryLifecycleItem[] = [
  {
    id: "created",
    title: "Created",
    description: "Tenant intake accepted into the booking ledger.",
    state: "complete" as const,
    stateLabel: "created",
    tone: "success" as const,
  },
  {
    id: "queued",
    title: "Queued",
    description: "Booking is waiting for policy and dispatch entry checks.",
    state: "complete" as const,
    stateLabel: "queued",
    tone: "success" as const,
  },
  {
    id: "broadcast",
    title: "Broadcast",
    description: "Dispatch is matching or recovering the trip supply lane.",
    state: "complete" as const,
    stateLabel: "broadcast",
    tone: "success" as const,
  },
  {
    id: "assigned",
    title: "Assigned",
    description: "A fulfillment path has been attached to the booking.",
    state: "current" as const,
    stateLabel: "assigned",
    tone: "success" as const,
  },
  {
    id: "on_trip",
    title: "On trip",
    description: "The ride has moved into execution or proof collection.",
    state: "upcoming" as const,
  },
  {
    id: "completed",
    title: "Completed",
    description: "Execution is closed and finance artifacts can follow.",
    state: "upcoming" as const,
  },
] as const;

export function storyActionStyle(primary = false): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "40px",
    padding: "0 16px",
    borderRadius: "999px",
    border: primary ? "1px solid transparent" : "1px solid #99f6e4",
    background: primary ? "#0f766e" : "#f0fdfa",
    color: primary ? "#ffffff" : "#115e59",
    fontSize: "13px",
    fontWeight: 700,
  };
}

export const storyTableStyle: CSSProperties = {
  width: "100%",
  minWidth: "680px",
  borderCollapse: "collapse",
  fontSize: "13px",
};

export const storyTableHeaderStyle: CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  fontSize: "11.5px",
  fontWeight: 600,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  borderBottom: "1px solid #dbe5ef",
  background: "#f0fdfa",
  whiteSpace: "nowrap",
};

export const storyTableCellStyle: CSSProperties = {
  padding: "11px 12px",
  verticalAlign: "top",
  borderBottom: "1px solid #eef2f7",
};

export const storyFieldGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "12px",
};

export const storyFieldStyle: CSSProperties = {
  display: "grid",
  gap: "6px",
};

export const storyFieldLabelStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 700,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

export const storyInputStyle: CSSProperties = {
  width: "100%",
  minHeight: "42px",
  borderRadius: "14px",
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#0f172a",
  padding: "0 12px",
  fontSize: "13px",
};

export const storyCompactGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "16px",
};
