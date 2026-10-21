import { Injectable } from "@nestjs/common";
import type {
  ReferralMonthlyRatingQuery,
  ReferralMonthlyRatingReport,
  ReferralMonthlyRatingRow,
} from "@drts/contracts";
import { ApiRequestError } from "../../common/api-envelope";
import { ReportingRepository } from "./reporting.repository";

@Injectable()
export class ReferralMonthlyRatingService {
  constructor(private readonly repository: ReportingRepository) {}

  async read(
    query: ReferralMonthlyRatingQuery,
  ): Promise<ReferralMonthlyRatingReport> {
    if (
      !query ||
      typeof query.periodMonth !== "string" ||
      !/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(query.periodMonth)
    ) {
      throw new ApiRequestError(
        400,
        "VALIDATION_ERROR",
        "periodMonth must be YYYY-MM.",
      );
    }
    for (const key of [
      "driverId",
      "tenantId",
      "partnerId",
      "partnerProgramId",
      "entrySlug",
    ] as const) {
      if (
        query[key] !== undefined &&
        (typeof query[key] !== "string" || !query[key]!.trim())
      ) {
        throw new ApiRequestError(
          400,
          "VALIDATION_ERROR",
          `${key} must be non-empty.`,
        );
      }
    }
    if (!this.repository.isEnabled()) {
      throw new ApiRequestError(
        503,
        "REPORT_SOURCE_UNAVAILABLE",
        "Canonical Referral ratings are unavailable.",
      );
    }
    // Taiwan rating reviews already use submittedAt in the Asia/Taipei calendar.
    const year = Number(query.periodMonth.slice(0, 4));
    const month = Number(query.periodMonth.slice(5, 7));
    const from = `${query.periodMonth}-01`;
    const nextMonth =
      month === 12
        ? `${String(year + 1).padStart(4, "0")}-01`
        : `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}`;
    const source = await this.repository.loadReferralMonthlyRatingSource(
      query,
      from,
      `${nextMonth}-01`,
    );
    const calendar = new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
    });
    const rows: ReferralMonthlyRatingRow[] = [];
    for (const order of source.orders) {
      const rating = order.referralPassengerLifecycle?.rating;
      if (!rating || order.status !== "completed") continue;
      if (
        rating.orderId !== order.orderId ||
        !Number.isInteger(rating.score) ||
        rating.score < 1 ||
        rating.score > 5 ||
        !Array.isArray(rating.tags) ||
        rating.tags.some((tag) => typeof tag !== "string")
      ) {
        throw new Error("Invalid canonical Referral rating record.");
      }
      const submitted = Date.parse(rating.submittedAt);
      if (!Number.isFinite(submitted))
        throw new Error("Invalid canonical rating submittedAt.");
      const parts = calendar.formatToParts(new Date(submitted));
      const ratingMonth = `${parts.find((part) => part.type === "year")!.value.padStart(4, "0")}-${parts.find((part) => part.type === "month")!.value}`;
      if (ratingMonth !== query.periodMonth) continue;
      if (
        (query.tenantId !== undefined && order.tenantId !== query.tenantId) ||
        (query.partnerId !== undefined &&
          order.partnerId !== query.partnerId) ||
        (query.partnerProgramId !== undefined &&
          order.partnerProgramId !== query.partnerProgramId) ||
        (query.entrySlug !== undefined &&
          order.partnerEntrySlug !== query.entrySlug)
      )
        continue;
      const completed = source.driverTasks.filter(
        (task) =>
          task.orderId === order.orderId &&
          task.status === "completed" &&
          task.completedAt &&
          source.dispatchAssignments.some(
            (assignment) =>
              assignment.assignmentId === task.assignmentId &&
              assignment.taskId === task.taskId &&
              assignment.orderId === order.orderId &&
              assignment.dispatchJobId === task.dispatchJobId &&
              assignment.driverId === task.driverId &&
              assignment.vehicleId === task.vehicleId &&
              assignment.status === "completed",
          ),
      );
      const task = completed.length === 1 ? completed[0] : undefined;
      if (query.driverId !== undefined && task?.driverId !== query.driverId)
        continue;
      rows.push({
        orderId: order.orderId,
        orderNo: order.orderNo,
        tenantId: order.tenantId,
        partnerId: order.partnerId,
        partnerProgramId: order.partnerProgramId,
        entrySlug: order.partnerEntrySlug,
        score: rating.score,
        tags: [...rating.tags],
        comment: rating.comment ?? null,
        submittedAt: rating.submittedAt,
        contactRequested: rating.contactRequested ?? null,
        complaintCaseNo: rating.complaintCaseNo ?? null,
        driverId: task?.driverId ?? null,
        taskId: task?.taskId ?? null,
        assignmentId: task?.assignmentId ?? null,
        completedAt: task?.completedAt ?? null,
        attribution: task ? "completed_task" : "unavailable",
      });
    }
    rows.sort(
      (a, b) =>
        Date.parse(b.submittedAt) - Date.parse(a.submittedAt) ||
        a.orderId.localeCompare(b.orderId),
    );
    const groups = new Map<
      string,
      [ReferralMonthlyRatingRow, ...ReferralMonthlyRatingRow[]]
    >();
    for (const row of rows) {
      if (row.driverId === null) continue;
      const group = groups.get(row.driverId);
      if (group) group.push(row);
      else groups.set(row.driverId, [row]);
    }
    const average = (items: ReferralMonthlyRatingRow[]) =>
      Math.round(
        (items.reduce((sum, row) => sum + row.score, 0) / items.length) * 100,
      ) / 100;
    return {
      periodMonth: query.periodMonth,
      timeZone: "Asia/Taipei",
      ratingCount: rows.length,
      averageRating: rows.length ? average(rows) : null,
      unattributedRatingCount: rows.filter((row) => row.driverId === null)
        .length,
      drivers: [...groups]
        .map(([driverId, items]) => ({
          driverId,
          ratingCount: items.length,
          averageRating: average(items),
          lastRatedAt: items[0].submittedAt,
        }))
        .sort((a, b) => a.driverId.localeCompare(b.driverId)),
      rows,
    };
  }
}
