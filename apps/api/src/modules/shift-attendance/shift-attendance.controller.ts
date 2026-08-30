import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";

import type { ClockInCommand, ClockOutCommand } from "@drts/contracts";

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
import { ShiftAttendanceService } from "./shift-attendance.service";

@Controller("shift-attendance")
export class ShiftAttendanceController {
  constructor(
    private readonly shiftAttendanceService: ShiftAttendanceService,
  ) {}

  @Post("clock-in")
  @RequireRealms("system", "driver")
  @RequireScopes("driver:write")
  clockIn(
    @Body() command: ClockInCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (
      identity?.realm === "driver" &&
      identity.actorId &&
      command.driverId &&
      !isDriverIdentityMatching(identity.actorId, command.driverId)
    ) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "DRIVER_NOT_FOUND",
        "Driver not found.",
        { driverId: command.driverId },
      );
    }

    const effectiveDriverId =
      identity?.realm === "driver" && identity.actorId
        ? normalizeDriverId(identity.actorId)!
        : command.driverId;

    const effectiveCommand: ClockInCommand = {
      ...command,
      driverId: effectiveDriverId,
    };

    return toApiSuccessEnvelope(
      this.shiftAttendanceService.clockIn(effectiveCommand, requestId),
      requestId,
    );
  }

  @Post("clock-out")
  @RequireRealms("system", "driver")
  @RequireScopes("driver:write")
  clockOut(
    @Body() command: ClockOutCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (
      identity?.realm === "driver" &&
      identity.actorId &&
      command.driverId &&
      !isDriverIdentityMatching(identity.actorId, command.driverId)
    ) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "DRIVER_NOT_FOUND",
        "Driver not found.",
        { driverId: command.driverId },
      );
    }

    const effectiveDriverId =
      identity?.realm === "driver" && identity.actorId
        ? normalizeDriverId(identity.actorId)!
        : command.driverId;

    const effectiveCommand: ClockOutCommand = {
      ...command,
      driverId: effectiveDriverId,
    };

    return toApiSuccessEnvelope(
      this.shiftAttendanceService.clockOut(effectiveCommand, requestId),
      requestId,
    );
  }

  @Get("shifts")
  @RequireRealms("system", "platform", "ops", "driver")
  @RequireScopes("driver:read")
  listShifts(
    @Query("driverId") requestedDriverId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    let targetDriverId = requestedDriverId;
    if (identity?.realm === "driver") {
      if (
        requestedDriverId &&
        !isDriverIdentityMatching(identity.actorId, requestedDriverId)
      ) {
        return toApiSuccessEnvelope({ items: [] }, requestId);
      }
      targetDriverId = normalizeDriverId(identity.actorId) ?? undefined;
    }

    return toApiSuccessEnvelope(
      { items: this.shiftAttendanceService.listShifts(targetDriverId) },
      requestId,
    );
  }

  @Get("shifts/:shiftId")
  @RequireRealms("system", "platform", "ops", "driver")
  @RequireScopes("driver:read")
  getShift(
    @Param("shiftId") shiftId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const shift = this.shiftAttendanceService.getShift(shiftId);
    if (
      identity?.realm === "driver" &&
      identity.actorId &&
      !isDriverIdentityMatching(identity.actorId, shift.driverId)
    ) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "Shift not found.",
        { shiftId },
      );
    }

    return toApiSuccessEnvelope(shift, requestId);
  }

  @Post("shifts/:shiftId/abandon")
  @RequireRealms("system", "driver")
  @RequireScopes("driver:write")
  abandonShift(
    @Param("shiftId") shiftId: string,
    @Body() body: { reason: string },
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const shift = this.shiftAttendanceService.getShift(shiftId);
    if (
      identity?.realm === "driver" &&
      identity.actorId &&
      !isDriverIdentityMatching(identity.actorId, shift.driverId)
    ) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "Shift not found.",
        { shiftId },
      );
    }

    return toApiSuccessEnvelope(
      this.shiftAttendanceService.abandonShift(shiftId, body.reason, requestId),
      requestId,
    );
  }

  @Get("attendance")
  @RequireRealms("system", "platform", "ops", "driver")
  @RequireScopes("driver:read")
  listAttendance(
    @Query("driverId") requestedDriverId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    let targetDriverId = requestedDriverId;
    if (identity?.realm === "driver") {
      if (
        requestedDriverId &&
        !isDriverIdentityMatching(identity.actorId, requestedDriverId)
      ) {
        return toApiSuccessEnvelope({ items: [] }, requestId);
      }
      targetDriverId = normalizeDriverId(identity.actorId) ?? undefined;
    }

    return toApiSuccessEnvelope(
      { items: this.shiftAttendanceService.listAttendance(targetDriverId) },
      requestId,
    );
  }
}
