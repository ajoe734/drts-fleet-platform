import {
  AdapterType,
  CredentialStatus,
  Environment,
  FinanceAuthorityMode,
  type PlatformAdapter,
  RolloutStatus,
  type UpdatePlatformAdapterCommand,
} from "@drts/contracts";
import { PlatformAdapterRegistry } from "./PlatformAdapterRegistry";

const now = "2026-05-08T00:00:00.000Z";

function buildAdapter(
  adapter: Pick<
    PlatformAdapter,
    | "id"
    | "platformCode"
    | "name"
    | "description"
    | "adapterType"
    | "isForwarded"
    | "credentialStatus"
    | "supportedActions"
  >,
): PlatformAdapter {
  return {
    ...adapter,
    version: "1.0.0",
    environment: Environment.PRODUCTION,
    rolloutStage: Environment.SANDBOX,
    config: { isEnabled: true },
    rolloutStatus: RolloutStatus.IN_PROGRESS,
    webhookStatus: null,
    healthStatus: {
      lastCheckTimestamp: null,
      status: "HEALTHY",
      message: null,
    },
    policies: {
      serviceBuckets: ["standard", "accessible"],
      maxCandidates: 3,
      acceptTimeoutSeconds: 25,
      manualFallbackThresholdSeconds: 90,
      financeAuthorityMode: adapter.isForwarded
        ? FinanceAuthorityMode.EXTERNAL
        : FinanceAuthorityMode.OWNED,
    },
    featureFlags: {
      driverSafeActions: true,
      proofRequired: adapter.isForwarded,
      manualFallback: true,
    },
    createdAt: now,
    updatedAt: now,
  };
}

export class AdapterManager {
  private readonly registry = new PlatformAdapterRegistry();

  constructor(seedAdapters: PlatformAdapter[] = defaultAdapters()) {
    seedAdapters.forEach((adapter) => this.registry.register(adapter));
  }

  listAdapters(): PlatformAdapter[] {
    return this.registry.list();
  }

  getAdapter(adapterId: string): PlatformAdapter | undefined {
    return this.registry.get(adapterId);
  }

  updateAdapter(
    adapterId: string,
    command: UpdatePlatformAdapterCommand,
  ): PlatformAdapter | undefined {
    return this.registry.update(adapterId, command);
  }
}

export function defaultAdapters(): PlatformAdapter[] {
  return [
    buildAdapter({
      id: "owned-dispatch",
      platformCode: "DRTS",
      name: "DRTS Native Dispatch",
      description: "Fleet-owned booking and dispatch pipeline.",
      adapterType: AdapterType.NATIVE,
      isForwarded: false,
      credentialStatus: CredentialStatus.VALID,
      supportedActions: [
        { name: "accept", description: "Driver accepts a native task." },
        { name: "complete", description: "Driver closes owned trip workflow." },
        { name: "incident", description: "Driver raises safety incident." },
      ],
    }),
    buildAdapter({
      id: "cityride-forwarder",
      platformCode: "CITY",
      name: "CityRide Forwarded Orders",
      description:
        "External forwarded-order source with platform-owned fare authority.",
      adapterType: AdapterType.EXTERNAL_COMBINED,
      isForwarded: true,
      credentialStatus: CredentialStatus.PENDING,
      supportedActions: [
        { name: "accept", description: "Forward acceptance to CityRide." },
        {
          name: "reject",
          description: "Forward rejection reason to CityRide.",
        },
        {
          name: "proof_upload",
          description: "Upload completion proof for reconciliation.",
        },
      ],
    }),
  ];
}

export const adapterManager = new AdapterManager();
