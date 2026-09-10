import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  OnModuleDestroy,
  Optional,
  forwardRef,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { OwnedMobilityRepository } from "./owned-mobility.repository";
import { OwnedMobilityService } from "./owned-mobility.service";

export interface SchedulerSweepResult {
  skipped: boolean;
  reason?: string;
  timeouts?: {
    sweptAcceptanceTimeouts: number;
    sweptMatchingTimeouts: number;
  };
  holds?: {
    sweptExceptionHolds: number;
    sweptExpiredOverrides: number;
  };
  durationMs?: number;
  error?: string;
}

export interface SchedulerStatus {
  running: boolean;
  sweepInProgress: boolean;
  sweepIntervalMs: number;
  totalSweeps: number;
  totalTimeoutsSwept: number;
  totalHoldsSwept: number;
  lastSweepAt: string | null;
  lastSweepDurationMs: number;
  lastError: string | null;
  errorCount: number;
}

interface LeaseRecord {
  token: string;
  expiresAt: number;
  holderId: string;
}

// Static lease coordinator for multi-instance in-memory deduplication across mock/real service instances
const SHARED_LEASES = new Map<string, LeaseRecord>();

export const DEFAULT_DISPATCH_SCHEDULER_INTERVAL_MS = 5000;
export const DEFAULT_DISPATCH_SCHEDULER_LEASE_MS = 15000;

@Injectable()
export class OwnedDispatchSchedulerService
  implements OnApplicationBootstrap, OnModuleDestroy, OnApplicationShutdown
{
  private readonly logger = new Logger(OwnedDispatchSchedulerService.name);
  private readonly instanceId = randomUUID();

  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private stopping = false;
  private sweepInProgress = false;

  private sweepIntervalMs = DEFAULT_DISPATCH_SCHEDULER_INTERVAL_MS;
  private leaseDurationMs = DEFAULT_DISPATCH_SCHEDULER_LEASE_MS;

  private totalSweeps = 0;
  private totalTimeoutsSwept = 0;
  private totalHoldsSwept = 0;
  private lastSweepAt: string | null = null;
  private lastSweepDurationMs = 0;
  private lastError: string | null = null;
  private errorCount = 0;

  constructor(
    @Inject(forwardRef(() => OwnedMobilityService))
    private readonly ownedMobilityService: OwnedMobilityService,
    @Optional()
    private readonly auditNotificationService?: AuditNotificationService,
    @Optional()
    private readonly ownedMobilityRepository?: OwnedMobilityRepository,
  ) {}

  onApplicationBootstrap() {
    this.startScheduler();
  }

  onModuleDestroy() {
    this.stopScheduler();
  }

  onApplicationShutdown() {
    this.stopScheduler();
  }

  startScheduler(intervalMs?: number) {
    if (intervalMs && intervalMs > 0) {
      this.sweepIntervalMs = intervalMs;
    }

    // Restart safety: clear any previous timer cleanly before launching new schedule
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.stopping = false;
    this.running = true;

    this.timer = setInterval(() => {
      void this.triggerSweep();
    }, this.sweepIntervalMs);

    this.timer.unref?.();
    this.logger.log(
      `OwnedDispatchSchedulerService started with interval ${this.sweepIntervalMs}ms (instance ${this.instanceId})`,
    );
  }

  stopScheduler() {
    this.stopping = true;
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.releaseLease("owned_mobility:dispatch_scheduler", this.instanceId);
    this.logger.log(
      `OwnedDispatchSchedulerService stopped (instance ${this.instanceId})`,
    );
  }

  setSweepIntervalMs(intervalMs: number) {
    this.sweepIntervalMs = Math.max(100, intervalMs);
    if (this.running) {
      this.startScheduler(this.sweepIntervalMs);
    }
  }

  setLeaseDurationMs(durationMs: number) {
    this.leaseDurationMs = Math.max(500, durationMs);
  }

  async acquireLease(
    leaseKey: string,
    leaseDurationMs: number,
  ): Promise<{ acquired: boolean; leaseToken: string }> {
    const now = Date.now();
    const existing = SHARED_LEASES.get(leaseKey);

    if (
      existing &&
      existing.expiresAt > now &&
      existing.holderId !== this.instanceId
    ) {
      return { acquired: false, leaseToken: "" };
    }

    const leaseToken = randomUUID();
    SHARED_LEASES.set(leaseKey, {
      token: leaseToken,
      expiresAt: now + leaseDurationMs,
      holderId: this.instanceId,
    });

    return { acquired: true, leaseToken };
  }

  releaseLease(leaseKey: string, holderOrToken: string) {
    const existing = SHARED_LEASES.get(leaseKey);
    if (
      existing &&
      (existing.token === holderOrToken ||
        existing.holderId === holderOrToken ||
        existing.holderId === this.instanceId)
    ) {
      SHARED_LEASES.delete(leaseKey);
    }
  }

  async triggerSweep(): Promise<SchedulerSweepResult> {
    if (this.stopping) {
      return { skipped: true, reason: "stopping" };
    }

    if (this.sweepInProgress) {
      return { skipped: true, reason: "sweep_already_in_progress" };
    }

    const { acquired, leaseToken } = await this.acquireLease(
      "owned_mobility:dispatch_scheduler",
      this.leaseDurationMs,
    );

    if (!acquired) {
      return { skipped: true, reason: "leased_by_other_instance" };
    }

    this.sweepInProgress = true;
    const startTime = Date.now();
    const now = new Date().toISOString();

    try {
      const timeouts =
        await this.ownedMobilityService.sweepDispatchTimeouts(now);
      const holds = await this.ownedMobilityService.sweepReservationHolds(now);

      const durationMs = Date.now() - startTime;
      this.totalSweeps += 1;
      this.totalTimeoutsSwept +=
        timeouts.sweptAcceptanceTimeouts + timeouts.sweptMatchingTimeouts;
      this.totalHoldsSwept +=
        holds.sweptExceptionHolds + holds.sweptExpiredOverrides;
      this.lastSweepAt = now;
      this.lastSweepDurationMs = durationMs;

      return {
        skipped: false,
        timeouts,
        holds,
        durationMs,
      };
    } catch (error) {
      this.errorCount += 1;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.lastError = errorMsg;

      this.logger.error(
        `[DISPATCH_SCHEDULER_ALARM] Background sweep execution failed: ${errorMsg}`,
        error instanceof Error ? error.stack : undefined,
      );

      try {
        await this.auditNotificationService?.recordAuditLog({
          action: "dispatch_scheduler_sweep_failure",
          actorId: `system:dispatch-scheduler:${this.instanceId}`,
          resourceType: "dispatch_scheduler",
          resourceId: "owned-mobility-scheduler",
          details: {
            errorMessage: errorMsg,
            errorCount: this.errorCount,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (auditError) {
        this.logger.warn(
          `Failed to record audit notification for scheduler alarm: ${auditError}`,
        );
      }

      return {
        skipped: false,
        error: errorMsg,
      };
    } finally {
      this.sweepInProgress = false;
      this.releaseLease("owned_mobility:dispatch_scheduler", leaseToken);
    }
  }

  getSchedulerStatus(): SchedulerStatus {
    return {
      running: this.running,
      sweepInProgress: this.sweepInProgress,
      sweepIntervalMs: this.sweepIntervalMs,
      totalSweeps: this.totalSweeps,
      totalTimeoutsSwept: this.totalTimeoutsSwept,
      totalHoldsSwept: this.totalHoldsSwept,
      lastSweepAt: this.lastSweepAt,
      lastSweepDurationMs: this.lastSweepDurationMs,
      lastError: this.lastError,
      errorCount: this.errorCount,
    };
  }

  static resetSharedLeases() {
    SHARED_LEASES.clear();
  }
}
