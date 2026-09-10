import { HttpStatus, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { ApiPageInfo } from "../../common/api-envelope";
import { ApiRequestError } from "../../common/api-envelope";
import { normalizeDriverId } from "../../common/auth";
import {
  DRIVER_LEAVE_ERROR_CODES,
  DRIVER_LEAVE_TYPES,
  MAX_PAST_APPLICATION_GRACE_MS,
  type CreateDriverLeaveCommand,
  type DriverLeaveQueryFilter,
  type DriverLeaveRecord,
  type ReviewDriverLeaveCommand,
  type WithdrawDriverLeaveCommand,
} from "./driver-leave.constants";
import { DriverLeaveRepository } from "./driver-leave.repository";

@Injectable()
export class DriverLeaveService {
  constructor(private readonly repository: DriverLeaveRepository) {}

  async createLeave(
    driverId: string,
    command: CreateDriverLeaveCommand,
    now?: Date,
  ): Promise<DriverLeaveRecord> {
    const normalizedDriverId = normalizeDriverId(driverId);
    if (!normalizedDriverId) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        DRIVER_LEAVE_ERROR_CODES.LEAVE_MISSING_REQUIRED_FIELDS,
        "Driver ID is required.",
      );
    }

    if (
      !command ||
      !command.leaveType ||
      !command.startTime ||
      !command.endTime ||
      !command.reason ||
      typeof command.reason !== "string" ||
      command.reason.trim() === ""
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        DRIVER_LEAVE_ERROR_CODES.LEAVE_MISSING_REQUIRED_FIELDS,
        "Required fields missing: leaveType, startTime, endTime, and reason must be provided.",
      );
    }

    if (!DRIVER_LEAVE_TYPES.includes(command.leaveType)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        DRIVER_LEAVE_ERROR_CODES.LEAVE_MISSING_REQUIRED_FIELDS,
        `Invalid leaveType: ${command.leaveType}. Must be one of ${DRIVER_LEAVE_TYPES.join(", ")}.`,
      );
    }

    const startDate = new Date(command.startTime);
    const endDate = new Date(command.endTime);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        DRIVER_LEAVE_ERROR_CODES.LEAVE_INVALID_TIME_RANGE,
        "Invalid date format for startTime or endTime. Must be valid ISO 8601 strings.",
      );
    }

    if (endDate.getTime() <= startDate.getTime()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        DRIVER_LEAVE_ERROR_CODES.LEAVE_INVALID_TIME_RANGE,
        "endTime must be strictly greater than startTime.",
      );
    }

    const current = now ?? new Date();
    if (startDate.getTime() < current.getTime() - MAX_PAST_APPLICATION_GRACE_MS) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        DRIVER_LEAVE_ERROR_CODES.LEAVE_INVALID_TIME_RANGE,
        "startTime cannot be more than 15 minutes in the past.",
        {
          startTime: command.startTime,
          currentTime: current.toISOString(),
          maxGraceMinutes: 15,
        },
      );
    }

    // Overlap prevention with pending or approved leaves
    const overlapping = await this.repository.findOverlapping(
      normalizedDriverId,
      startDate.toISOString(),
      endDate.toISOString(),
    );

    if (overlapping.length > 0) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        DRIVER_LEAVE_ERROR_CODES.LEAVE_OVERLAPPING_REQUEST,
        "Requested leave time range overlaps with an existing pending or approved leave.",
        {
          overlappingLeaves: overlapping.map((l) => ({
            leaveId: l.leaveId,
            status: l.status,
            startTime: l.startTime,
            endTime: l.endTime,
          })),
        },
      );
    }

    const leaveId = `lv_${randomUUID()}`;
    const nowIso = current.toISOString();

    const record: DriverLeaveRecord = {
      leaveId,
      driverId: normalizedDriverId,
      leaveType: command.leaveType,
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
      reason: command.reason.trim(),
      status: "pending",
      reviewedByPrincipalId: null,
      reviewedAt: null,
      reviewNotes: null,
      impactedShiftIds: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    return this.repository.save(record);
  }

  async getLeaveById(leaveId: string): Promise<DriverLeaveRecord> {
    const record = await this.repository.findById(leaveId);
    if (!record) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        DRIVER_LEAVE_ERROR_CODES.LEAVE_NOT_FOUND,
        `Leave request ${leaveId} not found.`,
        { leaveId },
      );
    }
    return record;
  }

  async listLeaves(filter: DriverLeaveQueryFilter): Promise<{
    items: DriverLeaveRecord[];
    pageInfo: ApiPageInfo;
  }> {
    const { items, total } = await this.repository.query(filter);
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, filter.pageSize ?? 20));
    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;

    return {
      items,
      pageInfo: {
        page,
        pageSize,
        totalItems: total,
        totalPages,
      },
    };
  }

  async withdrawLeave(
    leaveId: string,
    actorDriverId: string,
    command?: WithdrawDriverLeaveCommand,
    now?: Date,
  ): Promise<DriverLeaveRecord> {
    return this.repository.withdrawLeave(leaveId, actorDriverId, command, now);
  }

  async reviewLeave(
    leaveId: string,
    reviewerPrincipalId: string,
    command: ReviewDriverLeaveCommand,
    now?: Date,
  ): Promise<DriverLeaveRecord> {
    return this.repository.reviewLeave(
      leaveId,
      reviewerPrincipalId,
      command,
      now,
    );
  }

  async getActiveLeaveForDriver(
    driverId: string,
    asOf?: Date | string,
  ): Promise<DriverLeaveRecord | null> {
    const normalized = normalizeDriverId(driverId);
    if (!normalized) return null;

    const targetDate = asOf ? new Date(asOf) : new Date();
    const targetMs = targetDate.getTime();

    const leaves = await this.repository.findByDriver(normalized);
    for (const leave of leaves) {
      if (leave.status === "approved") {
        const startMs = new Date(leave.startTime).getTime();
        const endMs = new Date(leave.endTime).getTime();
        if (targetMs >= startMs && targetMs <= endMs) {
          return leave;
        }
      }
    }

    return null;
  }

  async isDriverOnLeave(
    driverId: string,
    asOf?: Date | string,
  ): Promise<boolean> {
    const active = await this.getActiveLeaveForDriver(driverId, asOf);
    return active !== null;
  }

  async assertDriverCanClockIn(
    driverId: string,
    asOf?: Date | string,
  ): Promise<void> {
    const activeLeave = await this.getActiveLeaveForDriver(driverId, asOf);
    if (activeLeave) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        DRIVER_LEAVE_ERROR_CODES.DRIVER_ON_LEAVE,
        "Driver is currently on approved leave and cannot clock in.",
        {
          driverId,
          leaveId: activeLeave.leaveId,
          startTime: activeLeave.startTime,
          endTime: activeLeave.endTime,
        },
      );
    }
  }

  async assertDriverCanGoOnline(
    driverId: string,
    asOf?: Date | string,
  ): Promise<void> {
    const activeLeave = await this.getActiveLeaveForDriver(driverId, asOf);
    if (activeLeave) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        DRIVER_LEAVE_ERROR_CODES.DRIVER_ON_LEAVE,
        "Driver is currently on approved leave and cannot go online.",
        {
          driverId,
          leaveId: activeLeave.leaveId,
          startTime: activeLeave.startTime,
          endTime: activeLeave.endTime,
        },
      );
    }
  }

  async getDriverPresenceEligibility(
    driverId: string,
    asOf?: Date | string,
  ): Promise<{
    eligibility: "eligible" | "ineligible";
    onLeave: boolean;
    activeLeave: DriverLeaveRecord | null;
  }> {
    const activeLeave = await this.getActiveLeaveForDriver(driverId, asOf);
    if (activeLeave) {
      return {
        eligibility: "ineligible",
        onLeave: true,
        activeLeave,
      };
    }
    return {
      eligibility: "eligible",
      onLeave: false,
      activeLeave: null,
    };
  }
}
