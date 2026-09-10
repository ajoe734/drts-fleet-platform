import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
  isDriverIdentityMatching,
  normalizeDriverId,
  type BootstrapRequestIdentity,
} from "../../common/auth";
import {
  DRIVER_LEAVE_ERROR_CODES,
  type CreateDriverLeaveCommand,
  type DriverLeaveQueryFilter,
  type ReviewDriverLeaveCommand,
  type WithdrawDriverLeaveCommand,
} from "./driver-leave.constants";
import { DriverLeaveService } from "./driver-leave.service";

@Controller("driver-leave")
export class DriverLeaveController {
  constructor(private readonly service: DriverLeaveService) {}

  @Post("requests")
  @HttpCode(HttpStatus.CREATED)
  @RequireRealms("driver", "system")
  @RequireScopes("driver:write")
  async createDriverLeave(
    @Body() command: CreateDriverLeaveCommand & { driverId?: string },
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    let effectiveDriverId: string | null = null;

    if (identity?.realm === "driver" || identity?.actorType === "driver_user") {
      if (!identity.actorId) {
        throw new ApiRequestError(
          HttpStatus.UNAUTHORIZED,
          "DRIVER_IDENTITY_REQUIRED",
          "Driver identity actorId is required.",
        );
      }
      effectiveDriverId = normalizeDriverId(identity.actorId)!;
      if (
        command.driverId &&
        !isDriverIdentityMatching(identity.actorId, command.driverId)
      ) {
        throw new ApiRequestError(
          HttpStatus.FORBIDDEN,
          DRIVER_LEAVE_ERROR_CODES.LEAVE_FORBIDDEN_ACCESS,
          "Driver may only submit leave requests for themselves.",
          { actorId: identity.actorId, commandDriverId: command.driverId },
        );
      }
    } else {
      effectiveDriverId =
        command.driverId ||
        (identity?.actorId ? normalizeDriverId(identity.actorId) : null);
    }

    if (!effectiveDriverId) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        DRIVER_LEAVE_ERROR_CODES.LEAVE_MISSING_REQUIRED_FIELDS,
        "driverId is required to create a leave request.",
      );
    }

    const created = await this.service.createLeave(effectiveDriverId, command);
    return toApiSuccessEnvelope(created, requestId);
  }

  @Get("requests")
  @RequireRealms("driver", "ops", "system")
  @RequireScopes("driver:read")
  async listDriverLeaves(
    @Query() query: DriverLeaveQueryFilter,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const filter: DriverLeaveQueryFilter = { ...query };

    if (identity?.realm === "driver" || identity?.actorType === "driver_user") {
      const actorDriverId = normalizeDriverId(identity.actorId);
      if (!actorDriverId) {
        throw new ApiRequestError(
          HttpStatus.UNAUTHORIZED,
          "DRIVER_IDENTITY_REQUIRED",
          "Driver identity actorId is required.",
        );
      }

      if (
        query.driverId &&
        !isDriverIdentityMatching(identity.actorId, query.driverId)
      ) {
        throw new ApiRequestError(
          HttpStatus.FORBIDDEN,
          DRIVER_LEAVE_ERROR_CODES.LEAVE_FORBIDDEN_ACCESS,
          "Driver may only view their own leave requests.",
          { actorId: identity.actorId, queryDriverId: query.driverId },
        );
      }

      filter.driverId = actorDriverId;
    }

    const result = await this.service.listLeaves(filter);
    return toApiSuccessEnvelope(result, requestId);
  }

  @Post("requests/:leaveId/withdraw")
  @RequireRealms("driver", "system")
  @RequireScopes("driver:write")
  async withdrawDriverLeave(
    @Param("leaveId") leaveId: string,
    @Body() command?: WithdrawDriverLeaveCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (identity?.realm === "ops" && identity.actorType !== "system") {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        DRIVER_LEAVE_ERROR_CODES.LEAVE_FORBIDDEN_ACCESS,
        "Ops users cannot withdraw driver leave requests. Only the applicant driver may withdraw.",
      );
    }

    const actorDriverId = identity?.actorId
      ? normalizeDriverId(identity.actorId)!
      : "";

    if (!actorDriverId && identity?.realm === "driver") {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "DRIVER_IDENTITY_REQUIRED",
        "Driver identity actorId is required.",
      );
    }

    const withdrawn = await this.service.withdrawLeave(
      leaveId,
      actorDriverId,
      command,
    );
    return toApiSuccessEnvelope(withdrawn, requestId);
  }

  @Post("requests/:leaveId/review")
  @RequireRealms("ops", "system")
  @RequireScopes("dispatch:write")
  async reviewDriverLeave(
    @Param("leaveId") leaveId: string,
    @Body() command: ReviewDriverLeaveCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (identity?.realm === "driver" || identity?.actorType === "driver_user") {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        DRIVER_LEAVE_ERROR_CODES.LEAVE_FORBIDDEN_ACCESS,
        "Drivers cannot review or approve/reject leave requests.",
      );
    }

    const reviewerPrincipalId = identity?.actorId ?? "ops_manager";
    const reviewed = await this.service.reviewLeave(
      leaveId,
      reviewerPrincipalId,
      command,
    );
    return toApiSuccessEnvelope(reviewed, requestId);
  }
}
