import { Injectable } from "@nestjs/common";
import { PLATFORM_CODES, PLATFORM_CODE_REGISTRY } from "@drts/contracts";
import type {
  DriverMatchingSuppression,
  DriverOpsInstruction,
  DriverPlatformBindingState,
  DriverPlatformBindingSummary,
  DriverPlatformPresenceSummary,
  DriverWorkspaceSummary,
  PlatformCode,
  PlatformPresenceAdapterStatusRecord,
  PlatformPresenceRecord,
  UiRefreshMetadata,
  UnifiedDriverTaskView,
} from "@drts/contracts";

import { ForwarderService } from "../forwarder/forwarder.service";
import { PlatformPresenceService } from "../platform-presence/platform-presence.service";

const WORKSPACE_REFRESH_MS = 15_000;
const PLATFORM_PRESENCE_REFRESH_MS = 15_000;

@Injectable()
export class DriverAppSummaryService {
  constructor(
    private readonly forwarderService: ForwarderService,
    private readonly platformPresenceService: PlatformPresenceService,
  ) {}

  private buildRefresh(
    timestamps: Array<string | null | undefined>,
    staleAfterMs: number,
    source: UiRefreshMetadata["source"],
    degraded = false,
  ): UiRefreshMetadata {
    const generatedAt = new Date().toISOString();
    const latestSnapshotAt = timestamps
      .filter((value): value is string => Boolean(value))
      .map((value) => Date.parse(value))
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => right - left)[0];

    let dataFreshness: UiRefreshMetadata["dataFreshness"] = "fresh";
    if (degraded) {
      dataFreshness = "degraded";
    } else if (latestSnapshotAt == null) {
      dataFreshness = "unknown";
    } else if (Date.now() - latestSnapshotAt > staleAfterMs) {
      dataFreshness = "stale";
    }

    return {
      generatedAt,
      staleAfterMs,
      dataFreshness,
      source,
    };
  }

  private buildPresenceInstruction(
    record: PlatformPresenceRecord,
    kind: string,
    message: string,
  ): DriverOpsInstruction {
    return {
      instructionId: `${record.platformCode}:${kind}:${record.updatedAt}`,
      taskId: `presence:${record.platformCode}`,
      message,
      issuedBy: "system:platform-presence",
      issuedAt: record.updatedAt,
      expiresAt: null,
    };
  }

  private buildTaskInstruction(
    task: UnifiedDriverTaskView,
    kind: string,
    message: string,
  ): DriverOpsInstruction {
    return {
      instructionId: `${task.taskId}:${kind}:${task.updatedAt}`,
      taskId: task.taskId,
      message,
      issuedBy: "system:driver-workspace",
      issuedAt: task.updatedAt,
      expiresAt: null,
    };
  }

  private derivePresenceInstructions(
    records: PlatformPresenceRecord[],
    adapterStatuses: PlatformPresenceAdapterStatusRecord[],
  ): DriverOpsInstruction[] {
    const instructions: DriverOpsInstruction[] = [];

    for (const record of records) {
      if (record.reauthRequired) {
        instructions.push(
          this.buildPresenceInstruction(
            record,
            "reauth_required",
            `${PLATFORM_CODE_REGISTRY[record.platformCode].displayName} 需要重新授權後才能恢復正常接單。`,
          ),
        );
      }

      if (record.eligibility === "ineligible") {
        instructions.push(
          this.buildPresenceInstruction(
            record,
            "ineligible",
            `${PLATFORM_CODE_REGISTRY[record.platformCode].displayName} 目前不允許接單，請聯繫營運確認資格。`,
          ),
        );
      }
    }

    for (const status of adapterStatuses) {
      if (status.status === "healthy" || status.status === "unknown") {
        continue;
      }

      const presence = records.find(
        (record) => record.platformCode === status.platformCode,
      );
      if (!presence) {
        continue;
      }

      instructions.push(
        this.buildPresenceInstruction(
          presence,
          status.status,
          status.blockingReason ??
            `${PLATFORM_CODE_REGISTRY[status.platformCode].displayName} 狀態同步異常，請稍後重試。`,
        ),
      );
    }

    return instructions;
  }

  private deriveTaskInstructions(
    taskViews: UnifiedDriverTaskView[],
  ): DriverOpsInstruction[] {
    const instructions: DriverOpsInstruction[] = [];

    for (const task of taskViews) {
      if (task.requiresReauth) {
        instructions.push(
          this.buildTaskInstruction(
            task,
            "reauth_required",
            task.syncIssueSummary ?? "需要完成平台重新授權後才能繼續。",
          ),
        );
      }

      if (task.requiresManualFallback) {
        instructions.push(
          this.buildTaskInstruction(
            task,
            "manual_fallback",
            task.syncIssueSummary ?? "平台任務已轉入人工協助流程。",
          ),
        );
      }

      if (task.localStatus === "proof_pending") {
        instructions.push(
          this.buildTaskInstruction(
            task,
            "proof_pending",
            "請先完成 proof bundle，之後才能結束本次任務。",
          ),
        );
      }
    }

    return instructions;
  }

  private deriveSuppressions(
    records: PlatformPresenceRecord[],
  ): DriverMatchingSuppression[] {
    const suppressions: DriverMatchingSuppression[] = [];

    for (const record of records) {
      if (record.eligibility === "ineligible") {
        suppressions.push({
          active: true,
          reasonCode: "compliance_hold",
          sourceIncidentId: null,
          expiresAt: new Date(
            Date.parse(record.updatedAt) + 24 * 60 * 60 * 1000,
          ).toISOString(),
          liftedAt: null,
        });
        continue;
      }

      if (record.reauthRequired) {
        suppressions.push({
          active: true,
          reasonCode: "manual_ops_hold",
          sourceIncidentId: null,
          expiresAt: new Date(
            Date.parse(record.updatedAt) + 24 * 60 * 60 * 1000,
          ).toISOString(),
          liftedAt: null,
        });
      }
    }

    return suppressions;
  }

  private countPresenceIssues(
    record: PlatformPresenceRecord | null,
    adapterStatus: PlatformPresenceAdapterStatusRecord,
  ): number {
    let count = 0;

    if (record?.reauthRequired) {
      count += 1;
    }
    if (record?.eligibility === "ineligible") {
      count += 1;
    }
    if (
      adapterStatus.status === "degraded" ||
      adapterStatus.status === "down"
    ) {
      count += 1;
    }

    return count;
  }

  private toBindingState(
    record: PlatformPresenceRecord | null,
    adapterStatus: PlatformPresenceAdapterStatusRecord,
  ): DriverPlatformBindingState {
    if (!record) {
      return "not_bound";
    }
    if (record.eligibility === "ineligible") {
      return "suspended";
    }
    if (record.reauthRequired) {
      return "reauth_required";
    }
    if (
      adapterStatus.status === "degraded" ||
      adapterStatus.status === "down"
    ) {
      return "degraded";
    }
    return record.status === "online" ? "bound_online" : "bound_offline";
  }

  private buildBindingRows(
    records: PlatformPresenceRecord[],
    adapterStatuses: PlatformPresenceAdapterStatusRecord[],
  ): DriverPlatformBindingSummary[] {
    return PLATFORM_CODES.map((platformCode) => {
      const record =
        records.find((presence) => presence.platformCode === platformCode) ??
        null;
      const adapterStatus = adapterStatuses.find(
        (status) => status.platformCode === platformCode,
      ) ?? {
        platformCode,
        status: "unknown",
        blockingReason: null,
        lastSyncAt: null,
      };

      return {
        platformCode,
        displayName: PLATFORM_CODE_REGISTRY[platformCode].displayName,
        bindingState: this.toBindingState(record, adapterStatus),
        presence: record,
        adapterStatus,
        outstandingInstructionCount: this.countPresenceIssues(
          record,
          adapterStatus,
        ),
      };
    });
  }

  private buildTaskCounts(taskViews: UnifiedDriverTaskView[]) {
    const counts = {
      total: taskViews.length,
      actionRequired: 0,
      awaitingPlatform: 0,
      inProgress: 0,
      blocked: 0,
      completed: 0,
      readOnly: 0,
    };

    for (const task of taskViews) {
      switch (task.driverActionState) {
        case "action_required":
          counts.actionRequired += 1;
          break;
        case "awaiting_platform":
          counts.awaitingPlatform += 1;
          break;
        case "in_progress":
          counts.inProgress += 1;
          break;
        case "blocked":
          counts.blocked += 1;
          break;
        case "completed":
          counts.completed += 1;
          break;
        case "read_only":
          counts.readOnly += 1;
          break;
      }
    }

    return counts;
  }

  async getWorkspaceSummary(driverId: string): Promise<DriverWorkspaceSummary> {
    const taskViews = this.forwarderService.listDriverTaskViews(driverId);
    const presences =
      await this.platformPresenceService.listForDriver(driverId);
    const adapterStatuses = this.platformPresenceService.listAdapterStatuses(
      presences.map((presence) => presence.platformCode),
    );
    const instructions = [
      ...this.derivePresenceInstructions(presences, adapterStatuses),
      ...this.deriveTaskInstructions(taskViews),
    ];
    const counts = this.buildTaskCounts(taskViews);
    const activeTripTask =
      taskViews.find((task) => task.driverActionState === "in_progress") ??
      null;
    const refresh = this.buildRefresh(
      [
        ...taskViews.map((task) => task.updatedAt),
        ...presences.map((presence) => presence.updatedAt),
        ...adapterStatuses.map((status) => status.lastSyncAt),
      ],
      WORKSPACE_REFRESH_MS,
      "sandbox",
      false,
    );

    return {
      driverId,
      taskCounts: counts,
      taskCountsByState: [
        { state: "action_required", count: counts.actionRequired },
        { state: "awaiting_platform", count: counts.awaitingPlatform },
        { state: "in_progress", count: counts.inProgress },
        { state: "blocked", count: counts.blocked },
        { state: "completed", count: counts.completed },
        { state: "read_only", count: counts.readOnly },
      ],
      activeTrip: activeTripTask
        ? {
            taskId: activeTripTask.taskId,
            orderId: activeTripTask.orderId,
            sourcePlatform: activeTripTask.sourcePlatform,
            platformDisplayName: activeTripTask.platformDisplayName,
          }
        : null,
      outstandingInstructionCount: instructions.length,
      instructions,
      refresh,
    };
  }

  async getPlatformPresenceSummary(
    driverId: string,
  ): Promise<DriverPlatformPresenceSummary> {
    const records = await this.platformPresenceService.listForDriver(driverId);
    const adapterStatuses = this.platformPresenceService.listAdapterStatuses(
      PLATFORM_CODES as unknown as PlatformCode[],
    );
    const instructions = this.derivePresenceInstructions(
      records,
      adapterStatuses,
    );
    const suppressions = this.deriveSuppressions(records);
    const health = this.platformPresenceService.buildUiHealth(adapterStatuses);
    const refresh = this.buildRefresh(
      [
        ...records.map((record) => record.updatedAt),
        ...adapterStatuses.map((status) => status.lastSyncAt),
      ],
      PLATFORM_PRESENCE_REFRESH_MS,
      "sandbox",
      health.status !== "healthy",
    );

    return {
      driverId,
      bindings: this.buildBindingRows(records, adapterStatuses),
      instructions,
      suppressions,
      health,
      refresh,
    };
  }
}
