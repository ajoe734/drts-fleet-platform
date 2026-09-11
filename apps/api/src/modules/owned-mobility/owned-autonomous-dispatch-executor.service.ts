import { randomUUID } from "node:crypto";
import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
  forwardRef,
} from "@nestjs/common";
import type {
  AutonomousDispatchOfferResult,
  AutonomousDispatchTimeoutCommand,
  AutonomousDispatchTimeoutResult,
  ConsumerNotificationOutboxRecord,
  DriverAcceptTaskCommand,
  DriverRejectTaskCommand,
} from "@drts/contracts";
import { ApiRequestError } from "../../common/api-envelope";
import { OpsDispatchEventsService } from "../../common/ops-dispatch-events.service";
import { IdempotencyService } from "../../common/idempotency";
import {
  DispatchResourceReservationConflictError,
  type DispatchResourceType,
  OwnedMobilityRepository,
} from "./owned-mobility.repository";
import { OwnedMobilityService } from "./owned-mobility.service";
import { OwnedMobilityTaskEventsService } from "./owned-mobility-task-events.service";

export interface AutonomousDispatchReceipt {
  operationKey: string;
  status: "succeeded" | "failed" | "superseded";
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface InMemDispatchReservation {
  reservationId: string;
  resourceType: DispatchResourceType;
  resourceId: string;
  orderId: string;
  assignmentId: string;
  status: "held" | "occupied" | "released";
  expiresAt: string | null;
  version: number;
}

/**
 * SD §7.6: Deterministic Owned Autonomous Dispatch Executor.
 *
 * Implements automated candidate selection, capacity reservation, assignment offer,
 * driver acceptance/rejection, retry rounds, safe timeout fences, and outbox notification.
 *
 * Key guarantees:
 * 1. Generates valid offers/driver tasks without manual ops console dispatch.
 * 2. Distinct operation keys for each stage:
 *    - `order:{orderId}:request_dispatch`
 *    - `job:{jobId}:round:{round}:offer`
 *    - `assignment:{assignmentId}:notify`
 *    - `assignment:{assignmentId}:timeout`
 *    - `assignment:{assignmentId}:reject`
 *    - `assignment:{assignmentId}:accept`
 * 3. Timeout is explicitly bound to target assignmentId, version, and deadline;
 *    late or superseded timeouts are safe no-ops and never release active/new assignments.
 * 4. Two orders competing for the same vehicle/driver are arbitrated by the capacity ledger;
 *    the losing transaction rolls back and deterministically advances to the next candidate.
 */
@Injectable()
export class OwnedAutonomousDispatchExecutorService {
  private readonly logger = new Logger(
    OwnedAutonomousDispatchExecutorService.name,
  );
  private readonly receipts = new Map<string, AutonomousDispatchReceipt>();
  private readonly inMemReservations: InMemDispatchReservation[] = [];
  private readonly outboxRecords: ConsumerNotificationOutboxRecord[] = [];

  constructor(
    @Inject(forwardRef(() => OwnedMobilityService))
    private readonly ownedMobilityService: OwnedMobilityService,
    @Optional()
    private readonly ownedMobilityRepository?: OwnedMobilityRepository,
    @Optional()
    private readonly ownedMobilityTaskEventsService?: OwnedMobilityTaskEventsService,
    @Optional()
    private readonly opsDispatchEventsService?: OpsDispatchEventsService,
    @Optional()
    private readonly idempotencyService?: IdempotencyService,
  ) {}

  /**
   * SD §7.6 Step 1: Durable order requests dispatch -> creates or retrieves matching job,
   * then immediately triggers the first offer attempt (Round 1).
   */
  async requestDispatch(
    orderId: string,
    options?: { idempotencyKey?: string; requestId?: string },
  ): Promise<AutonomousDispatchOfferResult> {
    const opKey =
      options?.idempotencyKey ?? `order:${orderId}:request_dispatch`;
    const existingReceipt = this.getReceipt(opKey);
    if (existingReceipt) {
      return existingReceipt.result as unknown as AutonomousDispatchOfferResult;
    }

    let job = this.ownedMobilityService.getActiveDispatchJobForOrder(orderId);

    if (!job) {
      const dispatchRes = await this.ownedMobilityService.dispatchOrder(
        orderId,
        { mode: "auto" },
        options?.requestId,
      );
      job = this.ownedMobilityService.requireDispatchJob(
        dispatchRes.dispatchJobId,
      );
    }

    const offerResult = await this.executeOfferRound(orderId, {
      round: 1,
      ...(options?.requestId ? { requestId: options.requestId } : {}),
    });

    this.recordReceipt(
      opKey,
      offerResult.status === "no_supply" ? "failed" : "succeeded",
      { orderId, mode: "auto" },
      offerResult as unknown as Record<string, unknown>,
    );

    return offerResult;
  }

  /**
   * SD §7.6 Step 2: Executes an offer round. Selects top candidate, acquires capacity
   * reservations (driver + vehicle in fixed order), persists assignment + driver task,
   * writes notification outbox, and returns offer result.
   * If a reservation conflict occurs, rolls back and tries the next candidate.
   */
  async executeOfferRound(
    orderId: string,
    options?: {
      round?: number;
      excludedDriverIds?: string[];
      requestId?: string;
    },
  ): Promise<AutonomousDispatchOfferResult> {
    const round = options?.round ?? 1;
    const order = this.ownedMobilityService.requireOrder(orderId);
    const job =
      this.ownedMobilityService.getActiveDispatchJobForOrder(orderId) ??
      this.ownedMobilityService.getLatestDispatchJobForOrder(orderId);

    if (!job) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "DISPATCH_JOB_NOT_FOUND",
        `Active dispatch job for order ${orderId} was not found.`,
        { orderId },
      );
    }

    const offerOpKey = `job:${job.dispatchJobId}:round:${round}:offer`;
    const existingReceipt = this.getReceipt(offerOpKey);
    if (existingReceipt) {
      return existingReceipt.result as unknown as AutonomousDispatchOfferResult;
    }

    // Check if there is already an active assignment
    const activeAssignment =
      this.ownedMobilityService.getActiveDispatchAssignmentForOrder(orderId);

    if (activeAssignment) {
      if (activeAssignment.status === "accepted") {
        const result: AutonomousDispatchOfferResult = {
          status: "already_assigned",
          orderId,
          dispatchJobId: job.dispatchJobId,
          round,
          assignmentId: activeAssignment.assignmentId,
          taskId: activeAssignment.taskId,
          driverId: activeAssignment.driverId,
          vehicleId: activeAssignment.vehicleId,
          acceptanceDeadline: activeAssignment.acceptanceDeadline ?? null,
          operationKey: offerOpKey,
        };
        return result;
      }

      if (activeAssignment.status === "assigned") {
        const task = this.ownedMobilityService.getActiveDriverTaskForAssignment(
          activeAssignment.assignmentId,
        );
        const result: AutonomousDispatchOfferResult = {
          status: "offered",
          orderId,
          dispatchJobId: job.dispatchJobId,
          round,
          assignmentId: activeAssignment.assignmentId,
          taskId: task?.taskId ?? null,
          driverId: activeAssignment.driverId,
          vehicleId: activeAssignment.vehicleId,
          acceptanceDeadline: activeAssignment.acceptanceDeadline ?? null,
          etaMinutes: job.latestEtaMinutes ?? null,
          operationKey: offerOpKey,
        };
        return result;
      }
    }

    // List and filter candidates
    const allCandidates =
      await this.ownedMobilityService.listEligibleDispatchCandidatesForOrder(
        orderId,
      );
    const excluded = new Set(options?.excludedDriverIds ?? []);
    const availableCandidates = allCandidates.filter(
      (c) => !excluded.has(c.driverId),
    );

    if (availableCandidates.length === 0) {
      // SD §7.6: Candidates exhausted -> transition to redispatch_required / no_supply policy
      job.status = "failed";
      job.updatedAt = new Date().toISOString();
      order.status = "redispatch_required";
      order.updatedAt = new Date().toISOString();
      order.lastDispatchFailureReason = "no_eligible_candidate";

      const exhaustedResult: AutonomousDispatchOfferResult = {
        status: "no_supply",
        orderId,
        dispatchJobId: job.dispatchJobId,
        round,
        candidateCount: 0,
        operationKey: offerOpKey,
      };

      this.recordReceipt(
        offerOpKey,
        "failed",
        { orderId, round, reason: "candidates_exhausted" },
        exhaustedResult as unknown as Record<string, unknown>,
      );

      return exhaustedResult;
    }

    // Try candidates in order
    for (const candidate of availableCandidates) {
      let provisionalReservation: { reservationId: string } | null = null;
      let createdAssignmentId: string | null = null;
      const previousOrderSnapshot = { ...order };
      const previousJobSnapshot = job ? { ...job } : undefined;

      try {
        // SD §7.6: In non-DB mode, pre-reserve driver and vehicle capacity before creating assignment
        // so that (1) capacity conflict is caught before any mutating side effects, and
        // (2) concurrent requests cannot race to pick the same candidate.
        if (!this.ownedMobilityRepository?.isEnabled()) {
          provisionalReservation = this.preReserveInMem(
            order.orderId,
            candidate.driverId,
            candidate.vehicleId,
          );
        }

        const assignmentResult =
          await this.ownedMobilityService.createDispatchAssignment(
            job,
            order,
            candidate.vehicleId,
            candidate.driverId,
            null,
            options?.requestId,
            { dispatchAttemptSequence: round },
          );

        createdAssignmentId = assignmentResult.assignmentId;

        const assignment = this.ownedMobilityService.requireAssignment(
          assignmentResult.assignmentId,
        );
        const task = this.ownedMobilityService.requireTask(
          assignmentResult.taskId,
        );

        // Track assignmentVersion as round
        (
          assignment as unknown as { assignmentVersion?: number }
        ).assignmentVersion = round;

        // In-memory reservation ledger: bind provisional reservation to actual assignment
        if (
          !this.ownedMobilityRepository?.isEnabled() &&
          provisionalReservation
        ) {
          this.bindProvisionalInMem(
            provisionalReservation.reservationId,
            assignment.assignmentId,
            assignment.acceptanceDeadline,
          );
        }

        // SD §7.6: Outbox record with dedicated notify operation key
        const outboxId = randomUUID();
        const notifyOpKey = `assignment:${assignment.assignmentId}:notify`;
        const outboxRecord: ConsumerNotificationOutboxRecord = {
          outboxId,
          orderId: order.orderId,
          passengerSubjectRef: `driver:${candidate.driverId}`,
          eventType: "assignment_disclosure_ready",
          assignmentVersion: round,
          payload: {
            operationKey: notifyOpKey,
            assignmentId: assignment.assignmentId,
            taskId: task.taskId,
            driverId: candidate.driverId,
            vehicleId: candidate.vehicleId,
            acceptanceDeadline: assignment.acceptanceDeadline ?? null,
            round,
          },
          status: "pending",
          attemptCount: 0,
          nextAttemptAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          deliveredAt: null,
        };

        this.recordOutbox(outboxRecord);
        this.recordReceipt(
          notifyOpKey,
          "succeeded",
          { assignmentId: assignment.assignmentId },
          { outboxId, status: "queued" },
        );

        const offerResult: AutonomousDispatchOfferResult = {
          status: "offered",
          orderId: order.orderId,
          dispatchJobId: job.dispatchJobId,
          round,
          assignmentId: assignment.assignmentId,
          taskId: task.taskId,
          driverId: candidate.driverId,
          vehicleId: candidate.vehicleId,
          acceptanceDeadline: assignment.acceptanceDeadline ?? null,
          etaMinutes: candidate.etaMinutes ?? null,
          candidateCount: availableCandidates.length,
          operationKey: offerOpKey,
          outboxId,
        };

        this.recordReceipt(
          offerOpKey,
          "succeeded",
          {
            round,
            driverId: candidate.driverId,
            vehicleId: candidate.vehicleId,
          },
          offerResult as unknown as Record<string, unknown>,
        );

        return offerResult;
      } catch (error) {
        if (provisionalReservation) {
          this.releaseProvisionalInMem(provisionalReservation.reservationId);
        }
        if (createdAssignmentId) {
          this.ownedMobilityService.rollbackDispatchAssignmentInMem?.(
            createdAssignmentId,
            previousOrderSnapshot,
            previousJobSnapshot,
          );
        }
        if (
          error instanceof DispatchResourceReservationConflictError ||
          (error as { name?: string })?.name ===
            "DispatchResourceReservationConflictError" ||
          (error as { code?: string })?.code ===
            "DISPATCH_RESOURCE_RESERVATION_CONFLICT"
        ) {
          this.logger.warn(
            `Resource reservation conflict on driver ${candidate.driverId} / vehicle ${candidate.vehicleId}; rolling back and trying next candidate`,
          );
          excluded.add(candidate.driverId);
          continue;
        }
        throw error;
      }
    }

    // All available candidates collided
    job.status = "failed";
    job.updatedAt = new Date().toISOString();
    order.status = "redispatch_required";
    order.updatedAt = new Date().toISOString();
    order.lastDispatchFailureReason = "reservation_conflicts_exhausted";

    const noSupplyResult: AutonomousDispatchOfferResult = {
      status: "no_supply",
      orderId,
      dispatchJobId: job.dispatchJobId,
      round,
      candidateCount: 0,
      operationKey: offerOpKey,
    };

    this.recordReceipt(
      offerOpKey,
      "failed",
      { orderId, round, reason: "reservation_conflicts_exhausted" },
      noSupplyResult as unknown as Record<string, unknown>,
    );

    return noSupplyResult;
  }

  /**
   * SD §7.6 Step 3: Driver accepts task.
   * Atomic transition: task accepted, assignment accepted, order driver_accepted,
   * reservation transitions from held -> occupied.
   */
  async handleDriverAccept(
    taskId: string,
    command: DriverAcceptTaskCommand,
    options?: { requestId?: string },
  ): Promise<{
    status: "accepted";
    assignmentId: string;
    taskId: string;
    acceptedAt: string;
  }> {
    const task = this.ownedMobilityService.getDriverTask(taskId);
    const assignment = this.ownedMobilityService.requireAssignment(
      task.assignmentId,
    );
    const acceptOpKey = `assignment:${assignment.assignmentId}:accept`;

    const existingReceipt = this.getReceipt(acceptOpKey);
    if (existingReceipt) {
      return existingReceipt.result as unknown as {
        status: "accepted";
        assignmentId: string;
        taskId: string;
        acceptedAt: string;
      };
    }

    await this.ownedMobilityService.acceptDriverTask(
      taskId,
      command,
      options?.requestId,
    );

    if (!this.ownedMobilityRepository?.isEnabled()) {
      this.occupyInMem(assignment.assignmentId);
    }

    const result = {
      status: "accepted" as const,
      assignmentId: assignment.assignmentId,
      taskId,
      acceptedAt: command.acceptedAt,
    };

    this.recordReceipt(
      acceptOpKey,
      "succeeded",
      { taskId, acceptedAt: command.acceptedAt },
      result,
    );

    return result;
  }

  /**
   * SD §7.6 Step 4: Driver rejects task.
   * Atomically releases reservation, records reject, and automatically retries next offer round.
   */
  async handleDriverReject(
    taskId: string,
    command: DriverRejectTaskCommand,
    options?: { requestId?: string },
  ): Promise<{
    status: "rejected";
    assignmentId: string;
    taskId: string;
    nextRound: number;
    nextOffer: AutonomousDispatchOfferResult;
  }> {
    const task = this.ownedMobilityService.getDriverTask(taskId);
    const assignment = this.ownedMobilityService.requireAssignment(
      task.assignmentId,
    );
    const rejectOpKey = `assignment:${assignment.assignmentId}:reject`;

    const existingReceipt = this.getReceipt(rejectOpKey);
    if (existingReceipt) {
      return existingReceipt.result as unknown as {
        status: "rejected";
        assignmentId: string;
        taskId: string;
        nextRound: number;
        nextOffer: AutonomousDispatchOfferResult;
      };
    }

    await this.ownedMobilityService.rejectDriverTask(
      taskId,
      command,
      options?.requestId,
    );

    if (!this.ownedMobilityRepository?.isEnabled()) {
      this.releaseInMem(assignment.assignmentId);
    }

    const currentRound =
      (assignment as unknown as { assignmentVersion?: number })
        ?.assignmentVersion ?? 1;
    const nextRound = currentRound + 1;

    // SD §7.6: Accumulate all rejected/cancelled drivers for this job across rounds
    const priorAssignments =
      this.ownedMobilityService.getDispatchAssignmentsForOrder(task.orderId);
    const excludedDriverIds = [
      ...new Set([
        task.driverId,
        ...priorAssignments
          .filter((a) => ["rejected", "cancelled"].includes(a.status))
          .map((a) => a.driverId),
      ]),
    ];

    // Trigger next round with rejected drivers excluded
    const nextOffer = await this.executeOfferRound(task.orderId, {
      round: nextRound,
      excludedDriverIds,
      ...(options?.requestId ? { requestId: options.requestId } : {}),
    });

    const result = {
      status: "rejected" as const,
      assignmentId: assignment.assignmentId,
      taskId,
      nextRound,
      nextOffer,
    };

    this.recordReceipt(
      rejectOpKey,
      "succeeded",
      { taskId, reasonCode: command.reasonCode },
      result as unknown as Record<string, unknown>,
    );

    return result;
  }

  /**
   * SD §7.6 Timeout Fence:
   * "Timeout 必須是具體 offer 的 command，攜 targetJobId、round、assignmentId、assignmentVersion、acceptanceDeadline。
   *  交易內重驗該 offer 仍是目前有效且 pending_acceptance、期限已到；已 accepted／替代／終態則回原 receipt 或 superseded/no_op。
   *  不能直接沿用 handleDispatchTimeout(orderId) 再尋找最新 assignment 取消，因為那會讓 A 的舊 timer 取消 B 或已接單的 A。"
   */
  async handleOfferTimeout(
    command: AutonomousDispatchTimeoutCommand,
  ): Promise<AutonomousDispatchTimeoutResult> {
    const timeoutOpKey = `assignment:${command.targetAssignmentId}:timeout`;
    const existingReceipt = this.getReceipt(timeoutOpKey);
    if (existingReceipt) {
      return existingReceipt.result as unknown as AutonomousDispatchTimeoutResult;
    }

    const currentAssignment =
      this.ownedMobilityService.getActiveDispatchAssignmentForOrder(
        command.orderId,
      );

    // 1. Check if the target assignment was already superseded by another assignment
    if (
      !currentAssignment ||
      currentAssignment.assignmentId !== command.targetAssignmentId
    ) {
      const result: AutonomousDispatchTimeoutResult = {
        outcome: "superseded_or_no_op",
        reason: "superseded_by_newer_assignment",
        orderId: command.orderId,
        targetAssignmentId: command.targetAssignmentId,
      };
      this.recordReceipt(
        timeoutOpKey,
        "superseded",
        command as unknown as Record<string, unknown>,
        result as unknown as Record<string, unknown>,
      );
      return result;
    }

    // 2. Check if the target assignment was already accepted by the driver
    if (currentAssignment.status === "accepted") {
      const result: AutonomousDispatchTimeoutResult = {
        outcome: "superseded_or_no_op",
        reason: "offer_already_accepted",
        orderId: command.orderId,
        targetAssignmentId: command.targetAssignmentId,
      };
      this.recordReceipt(
        timeoutOpKey,
        "superseded",
        command as unknown as Record<string, unknown>,
        result as unknown as Record<string, unknown>,
      );
      return result;
    }

    // 3. Check if target assignment is no longer in pending 'assigned' state
    if (currentAssignment.status !== "assigned") {
      const result: AutonomousDispatchTimeoutResult = {
        outcome: "superseded_or_no_op",
        reason: "offer_already_closed",
        orderId: command.orderId,
        targetAssignmentId: command.targetAssignmentId,
      };
      this.recordReceipt(
        timeoutOpKey,
        "superseded",
        command as unknown as Record<string, unknown>,
        result as unknown as Record<string, unknown>,
      );
      return result;
    }

    // 4. Verify deadline
    const deadlineMs = Date.parse(command.acceptanceDeadline);
    if (Number.isFinite(deadlineMs) && Date.now() < deadlineMs) {
      return {
        outcome: "not_expired",
        orderId: command.orderId,
        targetAssignmentId: command.targetAssignmentId,
      };
    }

    // 5. Verified expired! Close offer and release reservation.
    // When DB-backed, `handleDispatchTimeout` re-verifies the target
    // assignment under a real DB row lock (`closeSupersededDispatchAssignment`)
    // before touching anything, precisely because steps 1-3 above only
    // checked *this* process's in-memory cache, which can be stale if
    // another instance accepted or replaced the offer after this cache was
    // hydrated but before this timeout fired. When that fresh, authoritative
    // check finds the offer already left "assigned", it reports
    // `escalationAction: "superseded"` and leaves all state untouched --
    // this must be treated as the same safe no-op as steps 1-3, not silently
    // ignored: falling through here would still mark this stale instance's
    // cached order `redispatch_required` and start a spurious extra offer
    // round for an order another instance already resolved. Scoped to the
    // DB-backed path specifically: the in-memory-only fallback inside
    // `applyDispatchTimeout` re-derives "already expired" from the stored
    // assignment's own deadline rather than re-verifying supersession under a
    // lock, which is a different (and, without a shared DB, unfenceable)
    // check that existing in-memory-mode callers already account for.
    const timeoutOutcome =
      await this.ownedMobilityService.handleDispatchTimeout(
        command.orderId,
        "acceptance_timeout",
        command.requestId,
        { targetAssignmentId: command.targetAssignmentId },
      );

    if (
      this.ownedMobilityRepository?.isEnabled() &&
      timeoutOutcome.escalationAction === "superseded"
    ) {
      const result: AutonomousDispatchTimeoutResult = {
        outcome: "superseded_or_no_op",
        reason: "offer_already_closed",
        orderId: command.orderId,
        targetAssignmentId: command.targetAssignmentId,
      };
      this.recordReceipt(
        timeoutOpKey,
        "superseded",
        command as unknown as Record<string, unknown>,
        result as unknown as Record<string, unknown>,
      );
      return result;
    }

    if (!this.ownedMobilityRepository?.isEnabled()) {
      this.releaseInMem(command.targetAssignmentId);
    }

    // Allow order to be redispatched in next round
    const order = this.ownedMobilityService.requireOrder(command.orderId);
    order.status = "redispatch_required";
    order.updatedAt = new Date().toISOString();

    const nextRound = (command.assignmentVersion ?? command.round) + 1;
    const priorAssignments =
      this.ownedMobilityService.getDispatchAssignmentsForOrder(command.orderId);
    const excludedDriverIds = [
      ...new Set([
        currentAssignment.driverId,
        ...priorAssignments
          .filter((a) => ["rejected", "cancelled"].includes(a.status))
          .map((a) => a.driverId),
      ]),
    ];

    const nextOffer = await this.executeOfferRound(command.orderId, {
      round: nextRound,
      excludedDriverIds,
      ...(command.requestId ? { requestId: command.requestId } : {}),
    });

    const result: AutonomousDispatchTimeoutResult = {
      outcome: "timed_out_and_retried",
      orderId: command.orderId,
      targetAssignmentId: command.targetAssignmentId,
      nextRound,
      nextOffer,
    };

    this.recordReceipt(
      timeoutOpKey,
      "succeeded",
      command as unknown as Record<string, unknown>,
      result as unknown as Record<string, unknown>,
    );

    return result;
  }

  // --- Receipts & Operation Keys ---

  getReceipt(operationKey: string): AutonomousDispatchReceipt | null {
    return this.receipts.get(operationKey) ?? null;
  }

  recordReceipt(
    operationKey: string,
    status: "succeeded" | "failed" | "superseded",
    payload: Record<string, unknown>,
    result: Record<string, unknown>,
  ) {
    const now = new Date().toISOString();
    const receipt: AutonomousDispatchReceipt = {
      operationKey,
      status,
      payload,
      result,
      createdAt: now,
      updatedAt: now,
    };
    this.receipts.set(operationKey, receipt);
    return receipt;
  }

  // --- Outbox Management ---

  recordOutbox(record: ConsumerNotificationOutboxRecord) {
    this.outboxRecords.push(record);
  }

  getOutboxRecords(): ConsumerNotificationOutboxRecord[] {
    return [...this.outboxRecords];
  }

  getOutboxRecordByOperationKey(
    operationKey: string,
  ): ConsumerNotificationOutboxRecord | null {
    return (
      this.outboxRecords.find(
        (r) =>
          (r.payload as Record<string, unknown>)?.operationKey === operationKey,
      ) ?? null
    );
  }

  // --- In-Memory Capacity Reservation Ledger (for non-DB/unit modes) ---

  private preReserveInMem(
    orderId: string,
    driverId: string,
    vehicleId: string,
    excludeAssignmentId?: string,
  ): { reservationId: string } {
    const driverConflict = this.inMemReservations.find(
      (r) =>
        r.resourceType === "driver" &&
        r.resourceId === driverId &&
        ["held", "occupied"].includes(r.status) &&
        (!excludeAssignmentId || r.assignmentId !== excludeAssignmentId),
    );
    if (driverConflict) {
      throw new DispatchResourceReservationConflictError("driver", driverId);
    }

    const vehicleConflict = this.inMemReservations.find(
      (r) =>
        r.resourceType === "vehicle" &&
        r.resourceId === vehicleId &&
        ["held", "occupied"].includes(r.status) &&
        (!excludeAssignmentId || r.assignmentId !== excludeAssignmentId),
    );
    if (vehicleConflict) {
      throw new DispatchResourceReservationConflictError("vehicle", vehicleId);
    }

    const reservationGroupId = randomUUID();
    this.inMemReservations.push({
      reservationId: randomUUID(),
      resourceType: "driver",
      resourceId: driverId,
      orderId,
      assignmentId: `provisional:${reservationGroupId}`,
      status: "held",
      expiresAt: null,
      version: 1,
    });
    this.inMemReservations.push({
      reservationId: randomUUID(),
      resourceType: "vehicle",
      resourceId: vehicleId,
      orderId,
      assignmentId: `provisional:${reservationGroupId}`,
      status: "held",
      expiresAt: null,
      version: 1,
    });

    return { reservationId: reservationGroupId };
  }

  private bindProvisionalInMem(
    provisionalId: string,
    assignmentId: string,
    expiresAt?: string | null,
  ) {
    const provisionalKey = `provisional:${provisionalId}`;
    for (const r of this.inMemReservations) {
      if (r.assignmentId === provisionalKey) {
        r.assignmentId = assignmentId;
        r.expiresAt = expiresAt ?? null;
      }
    }
  }

  private releaseProvisionalInMem(provisionalId: string) {
    const provisionalKey = `provisional:${provisionalId}`;
    for (let i = this.inMemReservations.length - 1; i >= 0; i--) {
      if (this.inMemReservations[i]?.assignmentId === provisionalKey) {
        this.inMemReservations.splice(i, 1);
      }
    }
  }

  private reserveInMem(
    orderId: string,
    assignmentId: string,
    driverId: string,
    vehicleId: string,
    expiresAt?: string | null,
  ) {
    const provisional = this.preReserveInMem(
      orderId,
      driverId,
      vehicleId,
      assignmentId,
    );
    this.bindProvisionalInMem(
      provisional.reservationId,
      assignmentId,
      expiresAt,
    );
  }

  private occupyInMem(assignmentId: string) {
    for (const r of this.inMemReservations) {
      if (r.assignmentId === assignmentId && r.status === "held") {
        r.status = "occupied";
        r.version += 1;
      }
    }
  }

  private releaseInMem(assignmentId: string) {
    for (const r of this.inMemReservations) {
      if (
        r.assignmentId === assignmentId &&
        ["held", "occupied"].includes(r.status)
      ) {
        r.status = "released";
        r.version += 1;
      }
    }
  }

  getInMemReservations(): InMemDispatchReservation[] {
    return [...this.inMemReservations];
  }
}
