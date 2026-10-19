import { Body, Controller, Headers, HttpStatus, Post } from "@nestjs/common";
import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
  type BootstrapRequestIdentity,
} from "../../common/auth";
import {
  BillingMonthlyBatchService,
  type BillingMonthlyBatchCommand,
} from "./billing-monthly-batch.service";

@Controller()
export class BillingMonthlyBatchController {
  constructor(private readonly monthly: BillingMonthlyBatchService) {}

  @Post("internal/scheduled-tasks/billing-monthly/run")
  @RequireRealms("system")
  @RequireScopes("billing:monthly:run")
  async run(
    @Body() command: BillingMonthlyBatchCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    if (
      !identity ||
      identity.realm !== "system" ||
      identity.actorType !== "system" ||
      !identity.scopes.includes("billing:monthly:run")
    ) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "AUTHZ_SCOPE_DENIED",
        "Only the authorized system billing workload can run this batch.",
      );
    }
    const result = await this.monthly.run(command, requestId, idempotencyKey);
    if (result.status === "partial_failure") {
      // Non-2xx makes Scheduler retry; receipts still expose committed targets.
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "BILLING_MONTHLY_PARTIAL_FAILURE",
        "Monthly billing has retryable target failures.",
        result,
        true,
      );
    }
    return toApiSuccessEnvelope(result, result.requestId);
  }
}
