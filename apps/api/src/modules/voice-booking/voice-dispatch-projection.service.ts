import { HttpStatus, Inject, Injectable, Logger, Optional, forwardRef } from "@nestjs/common";
import type {
  DispatchAssignmentRecord,
  DispatchJobRecord,
  DriverTaskRecord,
  OwnedOrderRecord,
  VoiceDispatchProjectionView,
} from "@drts/contracts";
import { ApiRequestError } from "../../common/api-envelope";
import { OwnedMobilityRepository } from "../owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../owned-mobility/owned-mobility.service";

/**
 * SD §7.6: Voice Dispatch Projection Service.
 *
 * Provides truth projection from owned-mobility dispatch state into the canonical
 * voice presentation contract without altering underlying domain enums.
 *
 * Truth projection mapping:
 * - `matching`: dispatch job is actively searching for candidates -> "已受理，正在找車"
 * - `offered`: active assignment is assigned, task is pending_acceptance, acceptedAt is null -> "正在等候司機確認"
 * - `accepted`: latest active assignment and task are accepted, order is driver_accepted -> "司機已接單" (ETA reported faithfully if present, null if not)
 * - `arrived`: driver arrival event/status confirmed -> "車輛已到指定上車點"
 * - `retrying`: redispatch_required or delayed queue -> "仍在找車或重新安排" (cannot announce as cancelled)
 * - `manual_intervention`: exception_hold or manual_review -> "正在轉由調度協助"
 * - `terminal`: order cancelled/completed or dispatch terminated with no pending responsibility -> "已停止／本次無法供車" / "行程已完成"
 */
@Injectable()
export class VoiceDispatchProjectionService {
  private readonly logger = new Logger(VoiceDispatchProjectionService.name);

  constructor(
    @Optional()
    @Inject(forwardRef(() => OwnedMobilityService))
    private readonly ownedMobilityService?: OwnedMobilityService,
    @Optional()
    private readonly ownedMobilityRepository?: OwnedMobilityRepository,
  ) {}

  /**
   * Projects dispatch state from authoritative DB or service state for the specified orderId.
   */
  async projectDispatch(
    orderId: string,
    options?: { observedAt?: string },
  ): Promise<VoiceDispatchProjectionView> {
    const observedAt = options?.observedAt ?? new Date().toISOString();

    if (this.ownedMobilityRepository?.isEnabled()) {
      return this.ownedMobilityRepository.withTransaction(async (tx) => {
        const orderRes = await this.ownedMobilityRepository!.findOrderForUpdate(
          tx,
          orderId,
        );
        if (!orderRes) {
          throw new ApiRequestError(
            HttpStatus.NOT_FOUND,
            "ORDER_NOT_FOUND",
            `Order ${orderId} was not found.`,
            { orderId },
          );
        }

        const current =
          await this.ownedMobilityRepository!.loadOrderCancellationForUpdate(
            tx,
            orderId,
          );

        const activeJob =
          current.dispatchJobs.find((job) =>
            ["matching", "assigned", "reserved"].includes(job.status),
          ) ?? current.dispatchJobs[0] ?? null;

        return this.projectDispatchFromEntities(
          current.order,
          activeJob,
          current.assignment,
          current.task,
          { observedAt },
        );
      });
    }

    if (this.ownedMobilityService) {
      let order: OwnedOrderRecord;
      try {
        order = this.ownedMobilityService.requireOrder(orderId);
      } catch {
        throw new ApiRequestError(
          HttpStatus.NOT_FOUND,
          "ORDER_NOT_FOUND",
          `Order ${orderId} was not found.`,
          { orderId },
        );
      }

      const activeJob =
        this.ownedMobilityService.getActiveDispatchJobForOrder(orderId) ??
        this.ownedMobilityService.getLatestDispatchJobForOrder(orderId);

      const activeAssignment =
        this.ownedMobilityService.getActiveDispatchAssignmentForOrder(orderId);

      const activeTask = activeAssignment
        ? this.ownedMobilityService.getActiveDriverTaskForAssignment(
            activeAssignment.assignmentId,
          )
        : null;

      return this.projectDispatchFromEntities(
        order,
        activeJob,
        activeAssignment,
        activeTask,
        { observedAt },
      );
    }

    throw new Error(
      "Neither OwnedMobilityRepository nor OwnedMobilityService is available for projection.",
    );
  }

  /**
   * Deterministic projection pure function directly from entity snapshots.
   */
  projectDispatchFromEntities(
    order: OwnedOrderRecord,
    job?: DispatchJobRecord | null,
    assignment?: DispatchAssignmentRecord | null,
    task?: DriverTaskRecord | null,
    options?: { observedAt?: string },
  ): VoiceDispatchProjectionView {
    const observedAt = options?.observedAt ?? new Date().toISOString();
    const orderVersion = (order as unknown as { aggregateVersion?: number })
      ?.aggregateVersion;
    const assignmentVersion = (
      assignment as unknown as { assignmentVersion?: number }
    )?.assignmentVersion;

    // 1. Arrived state
    if (
      (task &&
        (task.status === "arrived_pickup" ||
          task.arrivedPickupAt != null ||
          task.status === "on_trip" ||
          task.status === "proof_pending" ||
          task.status === "completed")) ||
      order.status === "arrived_pickup" ||
      order.status === "on_trip"
    ) {
      return {
        projection: "arrived",
        announcement: "車輛已到指定上車點",
        orderId: order.orderId,
        orderStatus: order.status,
        orderVersion,
        assignmentId: assignment?.assignmentId ?? null,
        assignmentVersion: assignmentVersion ?? null,
        driverTaskId: task?.taskId ?? null,
        driverTaskStatus: task?.status ?? null,
        observedAt,
        acceptedAt: task?.acceptedAt ?? assignment?.acceptedAt ?? null,
        etaMinutes: 0,
        etaSource: "arrived",
        driverId: assignment?.driverId ?? task?.driverId ?? null,
        vehicleId: assignment?.vehicleId ?? task?.vehicleId ?? null,
        reasonCode: null,
        reasonNote: null,
      };
    }

    // 2. Driver Accepted state
    // SD §7.6: "最新有效 assignment 的 driver task 已 accepted，order=driver_accepted 或後續合理狀態；只有 driver acceptance 才說已接單，ETA 不存在如實回覆。"
    const isDriverAccepted =
      task?.status === "accepted" &&
      assignment?.status === "accepted" &&
      (order.status === "driver_accepted" || order.status === "assigned");

    if (isDriverAccepted) {
      const etaMinutes =
        job?.latestEtaMinutes ?? order.etaSnapshot?.etaMinutes ?? null;
      const etaSource =
        etaMinutes !== null
          ? job?.latestEtaMinutes !== null && job?.latestEtaMinutes !== undefined
            ? "dispatch_job"
            : "order_snapshot"
          : null;

      const announcement =
        etaMinutes !== null && etaMinutes !== undefined
          ? `司機已接單，預計 ${etaMinutes} 分鐘到達`
          : "司機已接單";

      return {
        projection: "accepted",
        announcement,
        orderId: order.orderId,
        orderStatus: order.status,
        orderVersion,
        assignmentId: assignment?.assignmentId ?? null,
        assignmentVersion: assignmentVersion ?? null,
        driverTaskId: task?.taskId ?? null,
        driverTaskStatus: task?.status ?? null,
        observedAt,
        acceptedAt: task?.acceptedAt ?? assignment?.acceptedAt ?? null,
        etaMinutes: etaMinutes ?? null,
        etaSource,
        driverId: assignment?.driverId ?? task?.driverId ?? null,
        vehicleId: assignment?.vehicleId ?? task?.vehicleId ?? null,
        reasonCode: null,
        reasonNote: null,
      };
    }

    // 3. Offered state
    // SD §7.6: "有效 assignment=assigned，task=pending_acceptance、acceptedAt 空 -> 正在等候司機確認"
    const isOffered =
      assignment?.status === "assigned" &&
      task?.status === "pending_acceptance" &&
      !assignment.acceptedAt &&
      !task.acceptedAt;

    if (isOffered) {
      return {
        projection: "offered",
        announcement: "正在等候司機確認",
        orderId: order.orderId,
        orderStatus: order.status,
        orderVersion,
        assignmentId: assignment?.assignmentId ?? null,
        assignmentVersion: assignmentVersion ?? null,
        driverTaskId: task?.taskId ?? null,
        driverTaskStatus: task?.status ?? null,
        observedAt,
        acceptedAt: null,
        etaMinutes: null, // ETA not exposed before driver accepts
        etaSource: null,
        driverId: null, // Driver personal identity not confirmed before driver acceptance
        vehicleId: null,
        reasonCode: null,
        reasonNote: null,
      };
    }

    // 4. Manual Intervention state
    // SD §7.6: "manual_review／no_supply 的人工隊列仍持有責任 -> 正在轉由調度協助"
    if (
      order.status === "exception_hold" ||
      order.exceptionHold != null ||
      (order.status === "no_supply" && order.noSupplyEscalation != null)
    ) {
      return {
        projection: "manual_intervention",
        announcement: "正在轉由調度協助",
        orderId: order.orderId,
        orderStatus: order.status,
        orderVersion,
        assignmentId: null,
        assignmentVersion: null,
        driverTaskId: null,
        driverTaskStatus: null,
        observedAt,
        acceptedAt: null,
        etaMinutes: null,
        etaSource: null,
        driverId: null,
        vehicleId: null,
        reasonCode: order.exceptionHold?.reasonCode ?? "manual_intervention",
        reasonNote: null,
      };
    }

    // 5. Retrying state
    // SD §7.6: "delayed_queue／redispatch 或仍有有效待辦 -> 仍在找車或重新安排，不能說已取消"
    if (
      order.status === "redispatch_required" ||
      order.reservationHoldStatus === "redispatch_queue" ||
      job?.status === "redispatch_required"
    ) {
      return {
        projection: "retrying",
        announcement: "仍在找車或重新安排",
        orderId: order.orderId,
        orderStatus: order.status,
        orderVersion,
        assignmentId: null,
        assignmentVersion: null,
        driverTaskId: null,
        driverTaskStatus: null,
        observedAt,
        acceptedAt: null,
        etaMinutes: null,
        etaSource: null,
        driverId: null,
        vehicleId: null,
        reasonCode: order.lastDispatchFailureReason ?? null,
        reasonNote: null,
      };
    }

    // 6. Matching state
    // SD §7.6: "有效 dispatch job 正在找候選 -> 已受理，正在找車"
    if (
      job?.status === "matching" ||
      order.status === "ready_for_dispatch" ||
      order.status === "created"
    ) {
      return {
        projection: "matching",
        announcement: "已受理，正在找車",
        orderId: order.orderId,
        orderStatus: order.status,
        orderVersion,
        assignmentId: null,
        assignmentVersion: null,
        driverTaskId: null,
        driverTaskStatus: null,
        observedAt,
        acceptedAt: null,
        etaMinutes: null,
        etaSource: null,
        driverId: null,
        vehicleId: null,
        reasonCode: null,
        reasonNote: null,
      };
    }

    // 7. Terminal state
    // SD §7.6: "域內正式取消／終止，而且無有效 assignment／重試／queue 責任 -> 已停止／本次無法供車，依實際結果說明"
    let announcement = "已停止／本次無法供車";
    if (order.status === "completed") {
      announcement = "行程已完成";
    } else if (order.status === "cancelled") {
      announcement = "訂單已取消";
    }

    return {
      projection: "terminal",
      announcement,
      orderId: order.orderId,
      orderStatus: order.status,
      orderVersion,
      assignmentId: assignment?.assignmentId ?? null,
      assignmentVersion: assignmentVersion ?? null,
      driverTaskId: task?.taskId ?? null,
      driverTaskStatus: task?.status ?? null,
      observedAt,
      acceptedAt: task?.acceptedAt ?? assignment?.acceptedAt ?? null,
      etaMinutes: null,
      etaSource: null,
      driverId: null,
      vehicleId: null,
      reasonCode: order.cancelReason ?? assignment?.rejectReasonCode ?? null,
      reasonNote: null,
    };
  }
}
