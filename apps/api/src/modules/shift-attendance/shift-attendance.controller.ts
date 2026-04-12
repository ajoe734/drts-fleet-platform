import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";

import type { ClockInCommand, ClockOutCommand } from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { ShiftAttendanceService } from "./shift-attendance.service";

@Controller("shift-attendance")
export class ShiftAttendanceController {
  constructor(
    private readonly shiftAttendanceService: ShiftAttendanceService,
  ) {}

  @Post("clock-in")
  clockIn(
    @Body() command: ClockInCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.shiftAttendanceService.clockIn(command, requestId),
      requestId,
    );
  }

  @Post("clock-out")
  clockOut(
    @Body() command: ClockOutCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.shiftAttendanceService.clockOut(command, requestId),
      requestId,
    );
  }

  @Get("shifts")
  listShifts(
    @Query("driverId") driverId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      { items: this.shiftAttendanceService.listShifts(driverId) },
      requestId,
    );
  }

  @Get("shifts/:shiftId")
  getShift(
    @Param("shiftId") shiftId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.shiftAttendanceService.getShift(shiftId),
      requestId,
    );
  }

  @Post("shifts/:shiftId/abandon")
  abandonShift(
    @Param("shiftId") shiftId: string,
    @Body() body: { reason: string },
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.shiftAttendanceService.abandonShift(shiftId, body.reason, requestId),
      requestId,
    );
  }

  @Get("attendance")
  listAttendance(
    @Query("driverId") driverId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      { items: this.shiftAttendanceService.listAttendance(driverId) },
      requestId,
    );
  }
}
