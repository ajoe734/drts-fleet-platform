import { Injectable, Optional } from "@nestjs/common";
import type {
  DriverPlatformBindingState,
  DriverPlatformPresenceSummary,
  DriverWorkspaceSummary,
  PlatformCode,
  PlatformPresenceAdapterStatusRecord,
  PlatformPresenceRecord,
  UiHealthEnvelope,
  UiRefreshMetadata,
  UnifiedDriverTaskView,
} from "@drts/contracts";
import { PLATFORM_CODE_REGISTRY } from "@drts/contracts";
import { ForwarderService } from "../forwarder/forwarder.service";
import { OwnedMobilityService } from "../owned-mobility/owned-mobility.service";
import { PlatformPresenceService } from "../platform-presence/platform-presence.service";

const WORKSPACE_STALE_AFTER_MS = 15_000;
const PLATFORM_PRESENCE_STALE_AFTER_MS = 30_000;

function nowIso() {
  return new Date().toISOString();
}

function latestTimestamp(values: ReadonlyArray<string | null | undefined>) {
  let latest: number | null = null;
  let latestIso: string | null = null;

  values.forEach((value) => {
    if (!value) {
      return;
    }
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      return;
    }
    if (latest === null || parsed > latest) {
      latest = parsed;
      latestIso = new Date(parsed).toISOString();
    }
  });

  return latestIso;
}

function buildRefreshMetadata(params: {
  generatedAt?: string | null;
  staleAfterMs: number;
  degraded?: boolean;
  source?: UiRefreshMetadata["source"];
}): UiRefreshMetadata {
  const generatedAt = params.generatedAt ?? nowIso();
  const generatedAtMs = Date.parse(generatedAt);
  const ageMs = Number.isNaN(generatedAtMs) ? 0 : Date.now() - generatedAtMs;

  let dataFreshness: UiRefreshMetadata["dataFreshness"] = "fresh";
  if (params.degraded) {
    dataFreshness = "degraded";
  } else if (ageMs > params.staleAfterMs) {
    dataFreshness = "stale";
  }

  return {
    generatedAt,
    staleAfterMs: params.staleAfterMs,
    dataFreshness,
    source: params.source ?? "live",
  };
}

function buildFallbackTaskViews(tasks: ReturnType<OwnedMobilityService["listDriverTasks"]>) {
  return tasks.map((task): UnifiedDriverTaskView => {
    const inProgress =
      task.status === "accepted" ||
      task.status === "enroute_pickup" ||
      task.status === "arrived_pickup" ||
      task.status === "on_trip";

    return {
      taskId: task.taskId,
      orderId: task.orderId,
      orderDomain: task.sourcePlatform ? "forwarded" : "owned",
      sourcePlatform: task.sourcePlatform
        ? (task.sourcePlatform as UnifiedDriverTaskView["sourcePlatform"])
        : "drts",
      platformDisplayName:
        task.sourcePlatform == null
          ? "DRTS"
          : (PLATFORM_CODE_REGISTRY[task.sourcePlatform as PlatformCode]
              ?.displayName ?? task.sourcePlatform),
      externalOrderId: null,
      nativeStatus: null,
      localStatus: task.status,
      driverActionState:
        task.status === "pending_acceptance"
          ? "action_required"
          : inProgress
            ? "in_progress"
            : task.status === "completed"
              ? "completed"
              : task.status === "proof_pending"
                ? "blocked"
                : "read_only",
      allowedActions: [],
      routeLocked: Boolean(task.sourcePlatform),
      fareAuthority: task.sourcePlatform ? "external_platform" : "drts",
      settlementAuthority: task.sourcePlatform ? "external_platform" : "drts",
      driverPayoutAuthority: task.sourcePlatform ? "external_platform" : "drts",
      requiresManualFallback: false,
      requiresReauth: false,
      syncIssueSummary: null,
      blockingReason: null,
      pickupSummary: null,
      dropoffSummary: null,
      deadlineAt: null,
      updatedAt:
        task.completedAt ??
        task.startedAt ??
        task.arrivedPickupAt ??
        task.departedAt ??
        task.acceptedAt ??
        nowIso(),
    };
  });
}

@Injectable()
export class DriverAppSummaryService {
  constructor(
    private readonly platformPresenceService: PlatformPresenceService,
    @Optional() private readonly forwarderService?: ForwarderService,
    @Optional() private readonly ownedMobilityService?: OwnedMobilityService,
  ) {}

  private listWorkspaceTaskViews(driverId: string): UnifiedDriverTaskView[] {
    if (this.forwarderService) {
      return this.forwarderService.listDriverTaskViews(driverId);
    }

    const ownedTasks =
      this.ownedMobilityService?.listDriverTasks().filter(
        (task) => task.driverId === driverId,
      ) ?? [];
    return buildFallbackTaskViews(ownedTasks);
  }

  private computeWorkspaceInstructionCount(
    tasks: readonly UnifiedDriverTaskView[],
    presences: readonly PlatformPresenceRecord[],
    adapterStatuses: readonly PlatformPresenceAdapterStatusRecord[],
  ) {
    const taskInstructions = tasks.filter(
      (task) =>
        task.driverActionState === "blocked" ||
        task.requiresManualFallback ||
        task.requiresReauth ||
        Boolean(task.syncIssueSummary),
    ).length;
    const platformInstructionKeys = new Set<string>();

    presences.forEach((presence) => {
      if (presence.reauthRequired || presence.eligibility !== "eligible") {
        platformInstructionKeys.add(presence.platformCode);
      }
    });
    adapterStatuses.forEach((status) => {
      if (status.status === "degraded" || status.status === "down") {
        platformInstructionKeys.add(status.platformCode);
      }
    });

    return taskInstructions + platformInstructionKeys.size;
  }

  async getWorkspaceSummary(driverId: string): Promise<DriverWorkspaceSummary> {
    const tasks = this.listWorkspaceTaskViews(driverId);
    const presences = await this.platformPresenceService.listForDriver(driverId);
    const adapterStatuses = this.platformPresenceService.listAdapterStatuses(
      presences.map((presence) => presence.platformCode),
    );
    const generatedAt = latestTimestamp([
      ...tasks.map((task) => task.updatedAt),
      ...presences.map((presence) => presence.updatedAt),
      ...adapterStatuses.map((status) => status.lastSyncAt),
    ]);
    const degraded =
      tasks.some(
        (task) =>
          task.requiresManualFallback ||
          task.requiresReauth ||
          Boolean(task.syncIssueSummary),
      ) ||
      adapterStatuses.some(
        (status) => status.status === "degraded" || status.status === "down",
      );
    const activeTrip =
      tasks.find((task) => task.driverActionState === "in_progress") ?? null;

    return {
      driverId,
      counts: {
        actionRequired: tasks.filter(
          (task) => task.driverActionState === "action_required",
        ).length,
        awaitingPlatform: tasks.filter(
          (task) => task.driverActionState === "awaiting_platform",
        ).length,
        inProgress: tasks.filter(
          (task) => task.driverActionState === "in_progress",
        ).length,
        blocked: tasks.filter((task) => task.driverActionState === "blocked")
          .length,
        completed: tasks.filter(
          (task) => task.driverActionState === "completed",
        ).length,
        readOnly: tasks.filter((task) => task.driverActionState === "read_only")
          .length,
        total: tasks.length,
      },
      activeTrip:
        activeTrip == null
          ? null
          : {
              taskId: activeTrip.taskId,
              orderId: activeTrip.orderId,
              orderDomain: activeTrip.orderDomain,
              sourcePlatform: activeTrip.sourcePlatform,
              platformDisplayName: activeTrip.platformDisplayName,
              localStatus: activeTrip.localStatus,
              updatedAt: activeTrip.updatedAt,
            },
      outstandingInstructionCount: this.computeWorkspaceInstructionCount(
        tasks,
        presences,
        adapterStatuses,
      ),
      refresh: buildRefreshMetadata({
        generatedAt,
        staleAfterMs: WORKSPACE_STALE_AFTER_MS,
        degraded,
      }),
    };
  }

  private resolveBindingState(
    presence: PlatformPresenceRecord | null,
    adapterStatus: PlatformPresenceAdapterStatusRecord,
  ): DriverPlatformBindingState {
    if (!presence) {
      return "not_bound";
    }
    if (presence.reauthRequired) {
      return "reauth_required";
    }
    if (adapterStatus.status === "degraded" || adapterStatus.status === "down") {
      return "degraded";
    }
    if (presence.eligibility === "ineligible") {
      return "suspended";
    }
    return presence.status === "online" ? "bound_online" : "bound_offline";
  }

  private buildHealthSummary(
    bindings: DriverPlatformPresenceSummary["bindings"],
    generatedAt: string,
  ): UiHealthEnvelope {
    const degradedServices = bindings
      .filter(
        (binding) =>
          binding.bindingState === "degraded" ||
          binding.bindingState === "reauth_required" ||
          binding.bindingState === "suspended",
      )
      .map((binding) => ({
        service: binding.platformDisplayName,
        impact:
          binding.bindingState === "reauth_required"
            ? "Driver re-auth is required before this platform can resume."
            : binding.bindingState === "suspended"
              ? "Platform eligibility is blocking new work."
              : "Platform adapter health is degraded.",
        severity:
          binding.adapterStatus.status === "down" ||
          binding.bindingState === "suspended"
            ? ("critical" as const)
            : ("warning" as const),
      }));

    return {
      status:
        degradedServices.length === 0
          ? "healthy"
          : degradedServices.some((service) => service.severity === "critical")
            ? "down"
            : "degraded",
      degradedServices,
      lastCheckedAt: generatedAt,
    };
  }

  async getPlatformPresenceSummary(
    driverId: string,
  ): Promise<DriverPlatformPresenceSummary> {
    const presences = await this.platformPresenceService.listForDriver(driverId);
    const presenceByPlatform = new Map(
      presences.map((presence) => [presence.platformCode, presence] as const),
    );
    const platformCodes = Object.keys(
      PLATFORM_CODE_REGISTRY,
    ) as Array<PlatformCode>;
    const adapterStatuses = this.platformPresenceService.listAdapterStatuses(
      platformCodes,
    );
    const generatedAt =
      latestTimestamp([
        ...presences.map((presence) => presence.updatedAt),
        ...presences.map((presence) => presence.lastOnlineAt),
        ...presences.map((presence) => presence.lastOfflineAt),
        ...adapterStatuses.map((status) => status.lastSyncAt),
      ]) ?? nowIso();
    const adapterStatusByPlatform = new Map(
      adapterStatuses.map((status) => [status.platformCode, status] as const),
    );
    const bindings = platformCodes.map((platformCode) => {
      const presence =
        presenceByPlatform.get(platformCode) ??
        ({
          driverId,
          platformCode,
          accountId: null,
          status: "offline",
          eligibility: "pending",
          tokenExpiresAt: null,
          reauthRequired: false,
          lastOnlineAt: null,
          lastOfflineAt: null,
          updatedAt: nowIso(),
        } satisfies PlatformPresenceRecord);
      const adapterStatus =
        adapterStatusByPlatform.get(platformCode) ??
        ({
          platformCode,
          status: "unknown",
          blockingReason: null,
          lastSyncAt: null,
        } satisfies PlatformPresenceAdapterStatusRecord);
      const bindingState = this.resolveBindingState(presence, adapterStatus);

      return {
        platformCode,
        platformDisplayName: PLATFORM_CODE_REGISTRY[platformCode].displayName,
        bindingState,
        presence,
        adapterStatus,
        outstandingInstructionCount:
          bindingState === "reauth_required" ||
          bindingState === "degraded" ||
          bindingState === "suspended"
            ? 1
            : 0,
        eligibility: presence.eligibility,
        updatedAt:
          latestTimestamp([
            presence.updatedAt,
            presence.lastOnlineAt,
            presence.lastOfflineAt,
            adapterStatus.lastSyncAt,
          ]) ?? generatedAt,
      };
    });
    const health = this.buildHealthSummary(bindings, generatedAt);

    return {
      driverId,
      bindings,
      notes: this.platformPresenceService.getSummaryNotes(),
      health,
      refresh: buildRefreshMetadata({
        generatedAt,
        staleAfterMs: PLATFORM_PRESENCE_STALE_AFTER_MS,
        degraded: health.status !== "healthy",
      }),
    };
  }
}
