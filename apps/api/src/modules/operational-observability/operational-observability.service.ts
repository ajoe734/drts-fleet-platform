import { Injectable } from "@nestjs/common";

import type {
  AdapterHealthRecord,
  CallSessionRecord,
  DispatchJobRecord,
  DriverLocationSnapshot,
  DriverRegistryRecord,
  IdentityContext,
  OperationalAdapterDetailRecord,
  OperationalAlertKey,
  OperationalAlertRecord,
  OperationalAlertState,
  OperationalAlertThresholds,
  OperationalObservabilitySnapshot,
  OwnedOrderRecord,
  PartnerEligibilityReviewQueueItem,
  ReportJobRecord,
  ForwardedOrderRecord,
  ForwarderReconciliationIssue,
} from "@drts/contracts";

import { CallcenterService } from "../callcenter/callcenter.service";
import { ForwarderService } from "../forwarder/forwarder.service";
import { OwnedMobilityService } from "../owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import { ReportingFilingService } from "../reporting-filing/reporting-filing.service";
import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";

const SYSTEM_IDENTITY: IdentityContext = {
  actorType: "system",
  actorId: "operational-observability",
  realm: "system",
  authMode: "bootstrap_headers",
  roleFamilies: [],
  roles: ["system_observability"],
  scopes: ["audit:read", "reports:read", "tenant:webhooks:read"],
  tenantId: null,
  partnerId: null,
  partnerProgramId: null,
  partnerEntrySlug: null,
  supportedExecutionModes: [
    "discussion_planning",
    "supervisor_managed_execution",
  ],
};

const ACTIVE_ORDER_STATUSES = new Set<OwnedOrderRecord["status"]>([
  "ready_for_dispatch",
  "preassigned",
  "assigned",
  "driver_accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
  "proof_pending",
  "redispatch_required",
  "dispatch_failed",
  "exception_hold",
]);

const PENDING_DISPATCH_JOB_STATUSES = new Set<DispatchJobRecord["status"]>([
  "matching",
  "reserved",
  "queued",
  "redispatch_required",
]);

const DISPATCH_LAG_THRESHOLDS: OperationalAlertThresholds = {
  warning: 10,
  critical: 20,
  unit: "minutes",
};

const RECORDING_BACKLOG_THRESHOLDS: OperationalAlertThresholds = {
  warning: 5,
  critical: 15,
  unit: "minutes",
};

const DRIVER_STATE_LAG_THRESHOLDS: OperationalAlertThresholds = {
  warning: 10,
  critical: 20,
  unit: "minutes",
};

const WEBHOOK_FAILURE_THRESHOLDS: OperationalAlertThresholds = {
  warning: 2,
  critical: 5,
  unit: "count",
};

const ELIGIBILITY_REVIEW_THRESHOLDS: OperationalAlertThresholds = {
  warning: 2,
  critical: 4,
  unit: "count",
};

const ADAPTER_DEGRADATION_THRESHOLDS: OperationalAlertThresholds = {
  warning: 1,
  critical: 2,
  unit: "count",
};

@Injectable()
export class OperationalObservabilityService {
  constructor(
    private readonly ownedMobilityService: OwnedMobilityService,
    private readonly callcenterService: CallcenterService,
    private readonly regulatoryRegistryService: RegulatoryRegistryService,
    private readonly forwarderService: ForwarderService,
    private readonly reportingFilingService: ReportingFilingService,
    private readonly tenantPartnerService: TenantPartnerService,
  ) {}

  getSnapshot(referenceDate = new Date()): OperationalObservabilitySnapshot {
    const generatedAt = referenceDate.toISOString();
    const orders = this.ownedMobilityService.listOrders();
    const dispatchJobs = this.ownedMobilityService.listDispatchJobs();
    const callSessions = this.callcenterService.listCallSessions(
      undefined,
      SYSTEM_IDENTITY,
    );
    const drivers = this.regulatoryRegistryService.listDrivers();
    const latestDriverLocations =
      this.regulatoryRegistryService.listLatestDriverLocations();
    const adapterHealth = this.forwarderService.listAdapterHealth();
    const forwardedOrders = this.forwarderService.listOrders();
    const reconciliationIssues =
      this.forwarderService.listReconciliationIssues();
    const reportJobs = this.reportingFilingService.listReportJobs(
      undefined,
      SYSTEM_IDENTITY,
    );
    const eligibilityQueue =
      this.tenantPartnerService.listPartnerEligibilityReviewQueue(
        undefined,
        SYSTEM_IDENTITY,
      );
    const webhook =
      this.tenantPartnerService.summarizeWebhookDeliveryHealth(referenceDate);

    const dispatch = this.buildDispatchMetrics(
      orders,
      dispatchJobs,
      referenceDate,
    );
    const recording = this.buildRecordingMetrics(
      orders,
      callSessions,
      referenceDate,
    );
    const driverState = this.buildDriverStateMetrics(
      drivers,
      latestDriverLocations,
      referenceDate,
    );
    const eligibility = this.buildEligibilityMetrics(
      eligibilityQueue,
      referenceDate,
    );
    const reporting = this.buildReportingMetrics(reportJobs);
    const adapters = this.buildAdapterMetrics(adapterHealth);
    const forwarderOps = this.buildForwarderOpsMetrics(
      forwardedOrders,
      reconciliationIssues,
      referenceDate,
    );
    const adapterDetails = this.buildAdapterDetails(adapterHealth);
    const degradedAdapterCount = adapterHealth.filter(
      (adapter) => adapter.status !== "healthy",
    ).length;

    return {
      generatedAt,
      alerts: [
        this.buildAlert(
          "dispatch_lag",
          dispatch.oldestReadyOrderLagMinutes ?? 0,
          DISPATCH_LAG_THRESHOLDS,
          ["ops", "platform"],
          generatedAt,
        ),
        this.buildAlert(
          "recording_backlog",
          recording.oldestPendingLagMinutes ?? 0,
          RECORDING_BACKLOG_THRESHOLDS,
          ["ops"],
          generatedAt,
        ),
        this.buildAlert(
          "driver_state_lag",
          driverState.oldestLocationLagMinutes ?? 0,
          DRIVER_STATE_LAG_THRESHOLDS,
          ["ops"],
          generatedAt,
        ),
        this.buildAlert(
          "webhook_failure_burst",
          webhook.failedDeliveriesLastHour,
          WEBHOOK_FAILURE_THRESHOLDS,
          ["platform"],
          generatedAt,
        ),
        this.buildAlert(
          "eligibility_review_backlog",
          eligibility.totalReviewQueue,
          ELIGIBILITY_REVIEW_THRESHOLDS,
          ["ops", "platform"],
          generatedAt,
        ),
        this.buildAlert(
          "adapter_degradation",
          degradedAdapterCount,
          ADAPTER_DEGRADATION_THRESHOLDS,
          ["ops", "platform"],
          generatedAt,
        ),
      ],
      dispatch,
      recording,
      driverState,
      webhook,
      eligibility,
      reporting,
      adapters,
      forwarderOps,
      adapterDetails,
      roleViews: [
        {
          route: "ops",
          alertKeys: [
            "dispatch_lag",
            "recording_backlog",
            "driver_state_lag",
            "eligibility_review_backlog",
            "adapter_degradation",
          ],
          focusAreas: [
            "dispatch",
            "recording",
            "driver_state",
            "reporting",
            "adapters",
            "forwarder_ops",
          ],
        },
        {
          route: "platform",
          alertKeys: [
            "dispatch_lag",
            "webhook_failure_burst",
            "eligibility_review_backlog",
            "adapter_degradation",
          ],
          focusAreas: [
            "dispatch",
            "webhook",
            "eligibility",
            "reporting",
            "adapters",
            "forwarder_ops",
          ],
        },
      ],
    };
  }

  private buildDispatchMetrics(
    orders: OwnedOrderRecord[],
    dispatchJobs: DispatchJobRecord[],
    referenceDate: Date,
  ) {
    const readyOrders = orders.filter(
      (order) =>
        order.status === "ready_for_dispatch" ||
        order.status === "redispatch_required",
    );
    const readyOrderLagMinutes = readyOrders
      .map((order) => this.diffMinutes(referenceDate, order.createdAt))
      .filter((value): value is number => value !== null);

    return {
      activeOrders: orders.filter((order) =>
        ACTIVE_ORDER_STATUSES.has(order.status),
      ).length,
      queueDepth: dispatchJobs.filter((job) =>
        PENDING_DISPATCH_JOB_STATUSES.has(job.status),
      ).length,
      laggedOrders: readyOrderLagMinutes.filter(
        (minutes) => minutes >= DISPATCH_LAG_THRESHOLDS.warning,
      ).length,
      redispatchOrders: orders.filter(
        (order) => order.status === "redispatch_required",
      ).length,
      exceptionHoldOrders: orders.filter(
        (order) => order.status === "exception_hold",
      ).length,
      dispatchFailedOrders: orders.filter(
        (order) => order.status === "dispatch_failed",
      ).length,
      oldestReadyOrderLagMinutes: this.maxOrNull(readyOrderLagMinutes),
    };
  }

  private buildRecordingMetrics(
    orders: OwnedOrderRecord[],
    callSessions: CallSessionRecord[],
    referenceDate: Date,
  ) {
    const phoneOrders = orders.filter((order) => order.orderSource === "phone");
    const missingOrderRecordingLinks = phoneOrders.filter(
      (order) => !order.recordingId,
    );
    const pendingCallSessions = callSessions.filter(
      (session) => !session.recordingId,
    );
    const pendingLagMinutes = [
      ...orders
        .filter((order) => order.status === "recording_pending")
        .map((order) => this.diffMinutes(referenceDate, order.createdAt)),
      ...pendingCallSessions.map((session) =>
        this.diffMinutes(referenceDate, session.startedAt),
      ),
    ].filter((value): value is number => value !== null);
    const linkedOrders = phoneOrders.filter(
      (order) => Boolean(order.callId) && Boolean(order.recordingId),
    ).length;

    return {
      phoneOrders: phoneOrders.length,
      linkedOrders,
      pendingOrders: orders.filter(
        (order) => order.status === "recording_pending",
      ).length,
      pendingCallSessions: pendingCallSessions.length,
      missingRecordingLinks: missingOrderRecordingLinks.length,
      oldestPendingLagMinutes: this.maxOrNull(pendingLagMinutes),
      linkedRatioPercent:
        phoneOrders.length > 0
          ? Math.round((linkedOrders / phoneOrders.length) * 100)
          : 100,
    };
  }

  private buildDriverStateMetrics(
    drivers: DriverRegistryRecord[],
    latestDriverLocations: DriverLocationSnapshot[],
    referenceDate: Date,
  ) {
    const latestLocationsByDriverId = new Map(
      latestDriverLocations.map((location) => [location.driverId, location]),
    );
    const activeDrivers = drivers.filter(
      (driver) => driver.dispatchEligible || driver.workState === "available",
    );
    const locationLagMinutes = activeDrivers
      .map((driver) =>
        this.diffMinutes(
          referenceDate,
          latestLocationsByDriverId.get(driver.driverId)?.recordedAt,
        ),
      )
      .filter((value): value is number => value !== null);

    return {
      totalDrivers: drivers.length,
      availableDrivers: drivers.filter(
        (driver) => driver.workState === "available",
      ).length,
      dispatchEligibleDrivers: drivers.filter(
        (driver) => driver.dispatchEligible,
      ).length,
      offlineDrivers: drivers.filter((driver) => driver.workState === "offline")
        .length,
      staleLocationDrivers: activeDrivers.filter((driver) => {
        const lag = this.diffMinutes(
          referenceDate,
          latestLocationsByDriverId.get(driver.driverId)?.recordedAt,
        );
        return lag !== null && lag >= DRIVER_STATE_LAG_THRESHOLDS.warning;
      }).length,
      missingLocationDrivers: activeDrivers.filter(
        (driver) => !latestLocationsByDriverId.has(driver.driverId),
      ).length,
      oldestLocationLagMinutes: this.maxOrNull(locationLagMinutes),
    };
  }

  private buildEligibilityMetrics(
    queue: PartnerEligibilityReviewQueueItem[],
    referenceDate: Date,
  ) {
    const thresholdTimestamp = referenceDate.getTime() - 24 * 60 * 60 * 1000;
    const recentFailureCount24h = queue.filter(
      (item) => new Date(item.updatedAt).getTime() >= thresholdTimestamp,
    ).length;

    return {
      totalReviewQueue: queue.length,
      manualReviewQueue: queue.filter(
        (item) => item.verificationStatus === "manual_review",
      ).length,
      manualFallbackQueue: queue.filter((item) => item.manualFallback.required)
        .length,
      ineligibleQueue: queue.filter(
        (item) => item.verificationStatus === "ineligible",
      ).length,
      recentFailureCount24h,
    };
  }

  private buildReportingMetrics(reportJobs: ReportJobRecord[]) {
    return {
      queuedJobs: reportJobs.filter(
        (job) => job.status === "queued" || job.status === "running",
      ).length,
      failedJobs: reportJobs.filter((job) => job.status === "failed").length,
      dispatchRecordingIndexQueuedJobs: reportJobs.filter(
        (job) =>
          job.jobType === "dispatch_recording_index" &&
          (job.status === "queued" || job.status === "running"),
      ).length,
    };
  }

  private buildAdapterMetrics(adapterHealth: AdapterHealthRecord[]) {
    return {
      totalAdapters: adapterHealth.length,
      healthyAdapters: adapterHealth.filter(
        (adapter) => adapter.status === "healthy",
      ).length,
      degradedAdapters: adapterHealth.filter(
        (adapter) => adapter.status === "degraded",
      ).length,
      downAdapters: adapterHealth.filter((adapter) => adapter.status === "down")
        .length,
    };
  }

  private buildForwarderOpsMetrics(
    forwardedOrders: ForwardedOrderRecord[],
    reconciliationIssues: ForwarderReconciliationIssue[],
    referenceDate: Date,
  ) {
    const syncFailedLagMinutes = forwardedOrders
      .filter((order) => order.status === "sync_failed")
      .map((order) =>
        this.diffMinutes(
          referenceDate,
          order.lastSyncError?.failedAt ?? order.updatedAt,
        ),
      )
      .filter((value): value is number => value !== null);
    const acceptPendingLagMinutes = forwardedOrders
      .filter((order) => order.status === "accept_pending")
      .map((order) => this.diffMinutes(referenceDate, order.updatedAt))
      .filter((value): value is number => value !== null);
    const manualFallbackLagMinutes = forwardedOrders
      .filter((order) => order.manualFallback.required)
      .map((order) =>
        this.diffMinutes(
          referenceDate,
          order.manualFallback.requestedAt ?? order.updatedAt,
        ),
      )
      .filter((value): value is number => value !== null);
    const reconciliationLagMinutes = reconciliationIssues
      .map((issue) =>
        this.diffMinutes(referenceDate, issue.reconciliationJob.createdAt),
      )
      .filter((value): value is number => value !== null);

    return {
      totalForwardedOrders: forwardedOrders.length,
      syncFailedOrders: forwardedOrders.filter(
        (order) => order.status === "sync_failed",
      ).length,
      acceptPendingOrders: forwardedOrders.filter(
        (order) => order.status === "accept_pending",
      ).length,
      manualFallbackQueue: forwardedOrders.filter(
        (order) => order.manualFallback.required,
      ).length,
      reconciliationQueue: reconciliationIssues.length,
      oldestSyncFailedLagMinutes: this.maxOrNull(syncFailedLagMinutes),
      oldestAcceptPendingLagMinutes: this.maxOrNull(acceptPendingLagMinutes),
      oldestManualFallbackLagMinutes: this.maxOrNull(manualFallbackLagMinutes),
      oldestReconciliationLagMinutes: this.maxOrNull(reconciliationLagMinutes),
    };
  }

  private buildAdapterDetails(
    adapterHealth: AdapterHealthRecord[],
  ): OperationalAdapterDetailRecord[] {
    const severityRank = {
      down: 0,
      degraded: 1,
      healthy: 2,
    } as const;

    return [...adapterHealth]
      .sort((left, right) => {
        const severityDelta =
          severityRank[left.status] - severityRank[right.status];
        return severityDelta !== 0
          ? severityDelta
          : left.platformCode.localeCompare(right.platformCode);
      })
      .map((adapter) => ({
        platformCode: adapter.platformCode,
        status: adapter.status,
        reason: adapter.reason,
        credentialStatus: adapter.credentialStatus,
        authStatus: adapter.authStatus,
        webhookStatus: adapter.webhookStatus,
        rateLimitStatus: adapter.rateLimitStatus,
        capabilitySummary: {
          ...adapter.capabilitySummary,
          supportedWebhookEvents: [
            ...adapter.capabilitySummary.supportedWebhookEvents,
          ],
          notes: [...adapter.capabilitySummary.notes],
        },
        lastCheckedAt: adapter.lastCheckedAt,
        lastError: adapter.lastError,
        lastWebhookReceivedAt: adapter.lastWebhookReceivedAt,
        lastRateLimitAt: adapter.lastRateLimitAt,
        lastAuthFailureAt: adapter.lastAuthFailureAt,
      }));
  }

  private buildAlert(
    key: OperationalAlertKey,
    measuredValue: number,
    thresholds: OperationalAlertThresholds,
    routes: OperationalAlertRecord["routes"],
    observedAt: string,
  ): OperationalAlertRecord {
    return {
      key,
      state: this.resolveAlertState(measuredValue, thresholds),
      measuredValue,
      thresholds,
      routes,
      observedAt,
    };
  }

  private resolveAlertState(
    measuredValue: number,
    thresholds: OperationalAlertThresholds,
  ): OperationalAlertState {
    if (measuredValue >= thresholds.critical) {
      return "critical";
    }
    if (measuredValue >= thresholds.warning) {
      return "warning";
    }
    return "healthy";
  }

  private diffMinutes(
    referenceDate: Date,
    timestamp: string | null | undefined,
  ): number | null {
    if (!timestamp) {
      return null;
    }

    const diffMs = referenceDate.getTime() - new Date(timestamp).getTime();
    if (!Number.isFinite(diffMs)) {
      return null;
    }

    return Math.max(0, Math.floor(diffMs / 60_000));
  }

  private maxOrNull(values: number[]): number | null {
    return values.length > 0 ? Math.max(...values) : null;
  }
}
