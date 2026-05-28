import { Injectable, Logger, Optional } from "@nestjs/common";
import type {
  AdapterHealthRecord,
  EmptyStateEnvelope,
  PlatformEligibility,
  PlatformCode,
  PlatformPresenceAdapterStatusRecord,
  PlatformPresenceAction,
  PlatformPresenceRecord,
  PlatformPresenceSummary,
  PlatformReauthMechanism,
  RefreshTier,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";
import { PLATFORM_CODE_REGISTRY } from "@drts/contracts";
import { ForwarderService } from "../forwarder/forwarder.service";
import { PlatformPresenceRepository } from "./platform-presence.repository";

function isoNow() {
  return new Date().toISOString();
}

const PLATFORM_PRESENCE_REFRESH_TIER: RefreshTier = "medium";
const PLATFORM_PRESENCE_STALE_AFTER_MS = 15_000;
const DEFAULT_ELIGIBLE_BUCKETS = ["standard_taxi"] as const;

const REAUTH_MECHANISM_BY_PLATFORM: Record<PlatformCode, PlatformReauthMechanism> =
  {
    uber: "external_browser_oauth",
    grab: "native_app_deeplink",
    "line-taxi": "manual_credential",
    grab_taiwan: "external_browser_oauth",
    indriver: "ops_managed",
    forwarder_sandbox: "ops_managed",
  };

const DRIVER_SELF_SERVICE_BINDING_BY_PLATFORM: Record<PlatformCode, boolean> = {
  uber: true,
  grab: true,
  "line-taxi": true,
  grab_taiwan: true,
  indriver: false,
  forwarder_sandbox: false,
};

type PlatformBlockerCode =
  | "account_not_bound"
  | "platform_offline"
  | "token_expired"
  | "reauth_required"
  | "driver_not_eligible"
  | "eligibility_pending"
  | "adapter_degraded";

@Injectable()
export class PlatformPresenceService {
  private readonly logger = new Logger(PlatformPresenceService.name);

  // in-memory fallback storage: driverId -> platformCode -> record
  private memory: Map<string, Map<string, PlatformPresenceRecord>> = new Map();

  constructor(
    @Optional() private readonly repo?: PlatformPresenceRepository,
    @Optional() private readonly forwarderService?: ForwarderService,
  ) {}

  private dbEnabled(): boolean {
    return this.repo?.isEnabled() ?? false;
  }

  async listForDriver(driverId: string): Promise<PlatformPresenceRecord[]> {
    if (this.dbEnabled()) {
      return this.repo!.listByDriver(driverId);
    }
    const map = this.memory.get(driverId);
    return map ? Array.from(map.values()) : [];
  }

  private getMemoryBucket(
    driverId: string,
  ): Map<string, PlatformPresenceRecord> {
    let bucket = this.memory.get(driverId);
    if (!bucket) {
      bucket = new Map<string, PlatformPresenceRecord>();
      this.memory.set(driverId, bucket);
    }
    return bucket;
  }

  private computeReauthRequired(tokenExpiresAt?: string | null): boolean {
    if (!tokenExpiresAt) return false;
    const now = Date.now();
    const expires = new Date(tokenExpiresAt).getTime();
    const thresholdMs = 72 * 60 * 60 * 1000; // 72h re-auth warning window
    return expires <= now + thresholdMs;
  }

  private isTokenExpired(tokenExpiresAt?: string | null): boolean {
    if (!tokenExpiresAt) {
      return false;
    }

    const expires = new Date(tokenExpiresAt).getTime();
    return !Number.isNaN(expires) && expires <= Date.now();
  }

  private getReauthMechanism(
    platformCode: PlatformCode,
  ): PlatformReauthMechanism {
    return REAUTH_MECHANISM_BY_PLATFORM[platformCode];
  }

  private getReauthTarget(
    driverId: string,
    platformCode: PlatformCode,
    mechanism: PlatformReauthMechanism,
  ): string | null {
    switch (mechanism) {
      case "external_browser_oauth":
        return `https://driver-auth.drts.example/platforms/${platformCode}?driverId=${encodeURIComponent(
          driverId,
        )}`;
      case "native_app_deeplink":
        return `drts-${platformCode}://reauth?driverId=${encodeURIComponent(driverId)}`;
      case "manual_credential":
      case "ops_managed":
      default:
        return null;
    }
  }

  private getBaseBuckets(platformCode: PlatformCode): string[] {
    if (platformCode === "grab_taiwan") {
      return ["standard_taxi", "business_dispatch"];
    }
    return [...DEFAULT_ELIGIBLE_BUCKETS];
  }

  private getBlockingCode(
    record: PlatformPresenceRecord,
    adapterStatus?: PlatformPresenceAdapterStatusRecord,
  ): PlatformBlockerCode | null {
    if (!record.accountId) {
      return "account_not_bound";
    }
    if (this.isTokenExpired(record.tokenExpiresAt)) {
      return "token_expired";
    }
    if (record.reauthRequired) {
      return "reauth_required";
    }
    if (record.eligibility === "pending") {
      return "eligibility_pending";
    }
    if (record.eligibility === "ineligible") {
      return "driver_not_eligible";
    }
    if (
      adapterStatus?.status === "degraded" ||
      adapterStatus?.status === "down"
    ) {
      return "adapter_degraded";
    }
    if (record.status !== "online") {
      return "platform_offline";
    }
    return null;
  }

  private getBlockingReason(
    blockerCode: PlatformBlockerCode | null,
    adapterStatus?: PlatformPresenceAdapterStatusRecord,
  ): string | null {
    switch (blockerCode) {
      case "account_not_bound":
        return "尚未綁定平台帳號";
      case "platform_offline":
        return "平台目前為離線狀態";
      case "token_expired":
        return "平台憑證已過期";
      case "reauth_required":
        return "平台需要重新授權";
      case "driver_not_eligible":
        return "司機目前不符合此平台資格";
      case "eligibility_pending":
        return "平台資格仍在審核中";
      case "adapter_degraded":
        return (
          adapterStatus?.blockingReason ?? "平台轉接器降級，暫時無法穩定接單"
        );
      default:
        return null;
    }
  }

  private buildAvailableActions(
    record: PlatformPresenceRecord,
    adapterStatus?: PlatformPresenceAdapterStatusRecord,
  ): ResourceActionDescriptor[] {
    const actions: ResourceActionDescriptor[] = [];
    const blockerCode = this.getBlockingCode(record, adapterStatus);

    if (record.status === "online") {
      actions.push({
        action: "go_offline" satisfies PlatformPresenceAction,
        enabled: true,
        riskLevel: "medium",
      });
    } else {
      actions.push({
        action: "go_online" satisfies PlatformPresenceAction,
        enabled: blockerCode === null || blockerCode === "platform_offline",
        disabledReasonCode: blockerCode ?? undefined,
        riskLevel: "medium",
      });
    }

    if (
      blockerCode === "token_expired" ||
      blockerCode === "reauth_required"
    ) {
      actions.push({
        action: "reauthenticate" satisfies PlatformPresenceAction,
        enabled: true,
        riskLevel: "medium",
      });
    }

    actions.push({
      action: "view_binding_details" satisfies PlatformPresenceAction,
      enabled: true,
      riskLevel: "low",
    });

    return actions;
  }

  private buildRefreshMetadata(): UiRefreshMetadata {
    return {
      generatedAt: isoNow(),
      staleAfterMs: PLATFORM_PRESENCE_STALE_AFTER_MS,
      dataFreshness: "fresh",
      source: this.dbEnabled() ? "live" : "sandbox",
    };
  }

  private enrichRecord(
    record: PlatformPresenceRecord,
    adapterStatus?: PlatformPresenceAdapterStatusRecord,
  ): PlatformPresenceRecord {
    const blockerCode = this.getBlockingCode(record, adapterStatus);
    const baseBuckets = this.getBaseBuckets(record.platformCode);
    const canReceiveOrders = blockerCode === null;
    const reauthMechanism = this.getReauthMechanism(record.platformCode);

    return {
      ...record,
      platformDisplayName:
        PLATFORM_CODE_REGISTRY[record.platformCode]?.displayName ??
        record.platformCode,
      canReceiveOrders,
      adapterStatus: adapterStatus?.status ?? "unknown",
      lastSyncAt:
        adapterStatus?.lastSyncAt ??
        (record.status === "online"
          ? record.lastOnlineAt
          : record.lastOfflineAt) ??
        record.updatedAt,
      blockingReason: this.getBlockingReason(blockerCode, adapterStatus),
      eligibleServiceBuckets: canReceiveOrders ? baseBuckets : [],
      ineligibleReasons: canReceiveOrders
        ? []
        : baseBuckets.map((bucket) => ({
            bucket,
            reasonCode: blockerCode ?? "driver_not_eligible",
          })),
      reauthMechanism,
      reauthTarget: this.getReauthTarget(
        record.driverId,
        record.platformCode,
        reauthMechanism,
      ),
      driverSelfServiceBinding:
        DRIVER_SELF_SERVICE_BINDING_BY_PLATFORM[record.platformCode],
      availableActions: this.buildAvailableActions(record, adapterStatus),
    };
  }

  private deriveEmptyState(
    presences: PlatformPresenceRecord[],
  ): EmptyStateEnvelope | null {
    if (presences.length === 0 || presences.every((presence) => !presence.accountId)) {
      return {
        reason: "not_provisioned",
        messageCode: "platform_presence.not_provisioned",
        nextAction: {
          action: "view_binding_details" satisfies PlatformPresenceAction,
          enabled: true,
          riskLevel: "low",
        },
      };
    }

    if (
      presences.every(
        (presence) =>
          presence.adapterStatus === "degraded" ||
          presence.adapterStatus === "down",
      )
    ) {
      return {
        reason: "external_unavailable",
        messageCode: "platform_presence.external_unavailable",
      };
    }

    if (presences.every((presence) => presence.eligibility === "ineligible")) {
      return {
        reason: "driver_not_eligible",
        messageCode: "platform_presence.driver_not_eligible",
      };
    }

    if (presences.every((presence) => presence.status === "offline")) {
      return {
        reason: "no_data",
        messageCode: "platform_presence.no_data",
      };
    }

    return null;
  }

  async setOnline(
    driverId: string,
    platformCode: PlatformCode,
    tokenExpiresAt?: string | null,
  ): Promise<PlatformPresenceRecord> {
    const existing = (await this.listForDriver(driverId)).find(
      (r) => r.platformCode === platformCode,
    );

    const record: PlatformPresenceRecord = {
      driverId,
      platformCode,
      accountId: existing?.accountId ?? `${driverId}:${platformCode}`,
      status: "online",
      eligibility: existing?.eligibility ?? ("eligible" as PlatformEligibility),
      tokenExpiresAt: tokenExpiresAt ?? existing?.tokenExpiresAt ?? null,
      reauthRequired: this.computeReauthRequired(
        tokenExpiresAt ?? existing?.tokenExpiresAt ?? null,
      ),
      lastOnlineAt: isoNow(),
      lastOfflineAt: existing?.lastOfflineAt ?? null,
      updatedAt: isoNow(),
    };

    if (this.dbEnabled()) {
      return this.repo!.upsert(record);
    }
    const bucket = this.getMemoryBucket(driverId);
    bucket.set(platformCode, record);
    return record;
  }

  async setOffline(
    driverId: string,
    platformCode: PlatformCode,
  ): Promise<PlatformPresenceRecord> {
    const existing = (await this.listForDriver(driverId)).find(
      (r) => r.platformCode === platformCode,
    );

    const record: PlatformPresenceRecord = {
      driverId,
      platformCode,
      accountId: existing?.accountId ?? null,
      status: "offline",
      eligibility: existing?.eligibility ?? ("eligible" as PlatformEligibility),
      tokenExpiresAt: existing?.tokenExpiresAt ?? null,
      reauthRequired: this.computeReauthRequired(
        existing?.tokenExpiresAt ?? null,
      ),
      lastOnlineAt: existing?.lastOnlineAt ?? null,
      lastOfflineAt: isoNow(),
      updatedAt: isoNow(),
    };

    if (this.dbEnabled()) {
      return this.repo!.upsert(record);
    }
    const bucket = this.getMemoryBucket(driverId);
    bucket.set(platformCode, record);
    return record;
  }

  private listAdapterHealthSafely(): AdapterHealthRecord[] {
    try {
      return this.forwarderService?.listAdapterHealth() ?? [];
    } catch (error) {
      this.logger.warn(
        `Failed to read forwarder adapter health for platform presence summary: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  private mapAdapterStatus(
    platformCode: PlatformCode,
    adapterHealth: AdapterHealthRecord[],
  ): PlatformPresenceAdapterStatusRecord {
    const adapterKey =
      PLATFORM_CODE_REGISTRY[platformCode]?.forwarderAdapterKey;
    if (!adapterKey) {
      return {
        platformCode,
        status: "unknown",
        blockingReason: null,
        lastSyncAt: null,
      };
    }

    const adapter = adapterHealth.find(
      (record) => record.platformCode === adapterKey,
    );

    if (!adapter) {
      return {
        platformCode,
        status: "unknown",
        blockingReason: null,
        lastSyncAt: null,
      };
    }

    return {
      platformCode,
      status: adapter.status,
      blockingReason:
        adapter.status === "healthy"
          ? null
          : adapter.status === "degraded"
            ? "平台連線異常，接單可能延遲"
            : "平台轉接服務中斷，暫時無法接單",
      lastSyncAt: adapter.lastCheckedAt,
    };
  }

  async summary(driverId: string): Promise<PlatformPresenceSummary> {
    const presences = await this.listForDriver(driverId);
    const adapterHealth = this.listAdapterHealthSafely();
    const adapterStatuses = presences.map((presence) =>
      this.mapAdapterStatus(presence.platformCode, adapterHealth),
    );
    const adapterStatusMap = new Map(
      adapterStatuses.map((status) => [status.platformCode, status]),
    );
    const enrichedPresences = presences.map((presence) =>
      this.enrichRecord(
        presence,
        adapterStatusMap.get(presence.platformCode) ?? undefined,
      ),
    );

    return {
      driverId,
      presences: enrichedPresences,
      adapterStatuses,
      notes: [
        "平台連線頁以 T3（15 秒）輪詢，平台重新授權或同步異常事件應以 push 立即打斷刷新節奏。",
        "平台狀態會優先使用資料庫同步；若目前環境未啟用資料庫，會改用目前執行個體的暫存資料。",
        "可使用 POST /api/platform-presence/online 或 /api/platform-presence/offline 更新單一平台的綁定、上下線與重新驗證狀態；重新授權 CTA 由平台機制決定。",
      ],
      emptyState: this.deriveEmptyState(enrichedPresences),
      refreshMetadata: this.buildRefreshMetadata(),
      refreshTier: PLATFORM_PRESENCE_REFRESH_TIER,
      availableActions: [
        {
          action: "refresh" satisfies PlatformPresenceAction,
          enabled: true,
          riskLevel: "low",
        },
        {
          action: "view_binding_details" satisfies PlatformPresenceAction,
          enabled: true,
          riskLevel: "low",
        },
      ],
    };
  }
}
