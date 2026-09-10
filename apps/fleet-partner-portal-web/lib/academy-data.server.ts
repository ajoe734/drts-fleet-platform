import "server-only";

import type {
  DriverQuizAttemptDetail,
  FleetDriverRosterItem,
  FleetTrainingSummaryRow,
  FleetTrainingView,
  TrainingStatus,
} from "@drts/contracts";

import { getServerFleetPartnerClient } from "./api-client.server";

export type DataSource = "live" | "fallback";

export interface FleetTrainingSummary {
  completionPct: string;
  pendingHeadcount: string;
  overdueIncomplete: number | string;
}

export interface FleetTrainingData {
  summary: FleetTrainingSummary;
  rows: FleetTrainingSummaryRow[];
  roster: FleetDriverRosterItem[];
  source: DataSource;
  error?: string | null;
}

export function isConfigError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.includes("Missing fleet scope configuration");
}

/**
 * Server data loader for the Fleet Partner Training dashboard.
 *
 * Calls the authoritative backend routes via `@drts/api-client`:
 * - `getFleetTrainingSummary()` -> `/api/fleet-partner/training/summary`
 * - `listFleetDriverRoster()` -> `/api/fleet-partner/training/roster`
 *
 * Falls back gracefully to zero/empty data when backend is unreachable,
 * without injecting fabricated percentages or mock fixtures.
 */
export async function loadFleetTraining(): Promise<FleetTrainingData> {
  try {
    const { client } = await getServerFleetPartnerClient();
    const [summaryResult, rosterResult] = await Promise.all([
      client.getFleetTrainingSummary(),
      client.listFleetDriverRoster(),
    ]);

    const rows = summaryResult?.rows ?? [];
    const roster = rosterResult?.items ?? [];

    return {
      summary: {
        completionPct: summaryResult?.summary?.completionPct ?? "0%",
        pendingHeadcount: summaryResult?.summary?.pendingHeadcount ?? "0",
        overdueIncomplete: summaryResult?.summary?.overdueIncomplete ?? 0,
      },
      rows,
      roster,
      source: "live",
      error: null,
    };
  } catch (err) {
    if (isConfigError(err)) {
      throw err;
    }
    const message = err instanceof Error ? err.message : "READ_FAILED";
    return {
      summary: {
        completionPct: "—",
        pendingHeadcount: "—",
        overdueIncomplete: "—",
      },
      rows: [],
      roster: [],
      source: "fallback",
      error: message,
    };
  }
}

/**
 * Loads a driver's quiz attempt details for authoritative inspection.
 */
export async function loadFleetDriverQuizAttempt(
  driverId: string,
  attemptId: string,
): Promise<DriverQuizAttemptDetail | null> {
  try {
    const { client } = await getServerFleetPartnerClient();
    return await client.getFleetDriverQuizAttempt(driverId, attemptId);
  } catch (err) {
    if (isConfigError(err)) {
      throw err;
    }
    return null;
  }
}

export interface RosterTabCounts {
  all: number;
  completed: number;
  pending: number;
  overdue: number;
}

export function computeRosterTabCounts(
  roster: FleetDriverRosterItem[],
): RosterTabCounts {
  return {
    all: roster.length,
    completed: roster.filter((r) => r.status === "passed").length,
    pending: roster.filter(
      (r) =>
        r.status === "not_started" ||
        r.status === "in_progress" ||
        r.status === "failed",
    ).length,
    overdue: roster.filter((r) => r.isOverdue || r.status === "expired").length,
  };
}

export function filterRosterByTab(
  roster: FleetDriverRosterItem[],
  tab: string,
): FleetDriverRosterItem[] {
  switch (tab) {
    case "completed":
      return roster.filter((r) => r.status === "passed");
    case "pending":
      return roster.filter(
        (r) =>
          r.status === "not_started" ||
          r.status === "in_progress" ||
          r.status === "failed",
      );
    case "overdue":
      return roster.filter((r) => r.isOverdue || r.status === "expired");
    case "all":
    default:
      return roster;
  }
}

export function scopeRosterRows(
  roster: FleetDriverRosterItem[],
  params?: { q?: string | undefined; course?: string | undefined },
): FleetDriverRosterItem[] {
  let result = roster;
  if (params?.course && params.course !== "all") {
    const targetCourse = params.course.toLowerCase();
    result = result.filter(
      (r) => r.courseCode.toLowerCase() === targetCourse,
    );
  }
  if (params?.q?.trim()) {
    const q = params.q.trim().toLowerCase();
    result = result.filter(
      (r) =>
        r.driverName.toLowerCase().includes(q) ||
        r.driverId.toLowerCase().includes(q) ||
        r.courseCode.toLowerCase().includes(q) ||
        (Boolean(r.latestAttemptId) &&
          r.latestAttemptId!.toLowerCase().includes(q)),
    );
  }
  return result;
}
