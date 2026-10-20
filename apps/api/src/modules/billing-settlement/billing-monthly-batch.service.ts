import { HttpStatus, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ApiRequestError } from "../../common/api-envelope";
import { BillingSettlementService } from "./billing-settlement.service";

export type BillingMonthlyBatchCommand = {
  periodMonth?: string;
  operationId?: string;
};
export type BillingMonthlyTargetReceipt = {
  driverId: string;
  status: "completed" | "failed";
  statementIds: string[];
  reimbursementBatchIds: string[];
  errorCode?: string;
};

/** External scheduler entry, with durable per-target continuation in Billing.
 * No timer, in-memory fixture target roster, or privileged caller is created.
 */
@Injectable()
export class BillingMonthlyBatchService {
  constructor(private readonly billing: BillingSettlementService) {}

  async run(
    command: BillingMonthlyBatchCommand = {},
    requestId?: string,
    idempotencyKey?: string,
  ) {
    if (!command || typeof command !== "object" || Array.isArray(command)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "Monthly billing command must be an object.",
      );
    }
    const now = new Date();
    const previous = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );
    const periodMonth =
      command.periodMonth ??
      `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
    if (
      typeof periodMonth !== "string" ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodMonth)
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "periodMonth must be YYYY-MM.",
      );
    }
    const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    if (periodMonth >= currentMonth) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "BILLING_PERIOD_NOT_CLOSED",
        "Scheduled billing requires a closed UTC month.",
        { periodMonth },
      );
    }
    // The actual HTTP command key uses the same durable operation/target rails.
    // A failed partial run must resume targets rather than cache its response.
    const operationId =
      idempotencyKey?.trim() ||
      (command.operationId ?? `billing-monthly:${periodMonth}`);
    if (typeof operationId !== "string" || !operationId.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "operationId must not be blank.",
      );
    }
    const correlationId = requestId?.trim() || randomUUID();
    // Failure here is unavailable, never an empty seed-only successful batch.
    const eligibleDriverIds =
      await this.billing.listScheduledDriverStatementTargets(periodMonth);
    await this.billing.bindScheduledBillingOperation(operationId, periodMonth);
    const targets: BillingMonthlyTargetReceipt[] = [];
    for (const driverId of eligibleDriverIds) {
      try {
        const result = await this.billing.generateDriverStatements(
          { periodMonth, driverId },
          correlationId,
          { authoritativeSource: true },
        );
        targets.push({
          driverId,
          status: "completed",
          statementIds: result.items.map((item) => item.statementId),
          reimbursementBatchIds: result.reimbursementBatchIds,
        });
      } catch (error) {
        targets.push({
          driverId,
          status: "failed",
          statementIds: [],
          reimbursementBatchIds: [],
          errorCode:
            error instanceof ApiRequestError
              ? error.code
              : "BILLING_TARGET_PERSISTENCE_UNAVAILABLE",
        });
      }
    }
    return {
      periodMonth,
      operationId,
      requestId: correlationId,
      status: targets.some((target) => target.status === "failed")
        ? ("partial_failure" as const)
        : ("completed" as const),
      eligibleDriverIds,
      targets,
    };
  }
}
