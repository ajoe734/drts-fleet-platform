import {
  type PlatformAdapter,
  type SupportedAction,
  type UpdatePlatformAdapterCommand,
} from "@drts/contracts";

export class PlatformAdapterRegistry {
  private readonly adapters = new Map<string, PlatformAdapter>();

  register(adapter: PlatformAdapter): PlatformAdapter {
    this.adapters.set(adapter.id, adapter);
    return adapter;
  }

  list(): PlatformAdapter[] {
    return Array.from(this.adapters.values()).sort((a, b) =>
      a.platformCode.localeCompare(b.platformCode),
    );
  }

  get(adapterId: string): PlatformAdapter | undefined {
    return this.adapters.get(adapterId);
  }

  update(
    adapterId: string,
    command: UpdatePlatformAdapterCommand,
  ): PlatformAdapter | undefined {
    const current = this.adapters.get(adapterId);
    if (!current) {
      return undefined;
    }

    const updated: PlatformAdapter = {
      ...current,
      config: {
        ...current.config,
        ...command.config,
      },
      rolloutStatus: command.rolloutStatus ?? current.rolloutStatus,
      rolloutStage: command.rolloutStage ?? current.rolloutStage,
      policies: {
        ...current.policies,
        ...command.policies,
      },
      featureFlags: {
        ...current.featureFlags,
        ...command.featureFlags,
      },
      webhookStatus:
        current.webhookStatus || command.webhookStatus
          ? {
              url: null,
              isEnabled: false,
              lastEventTimestamp: null,
              lastStatus: "UNKNOWN",
              ...current.webhookStatus,
              ...command.webhookStatus,
            }
          : null,
      updatedAt: new Date().toISOString(),
    };

    this.adapters.set(adapterId, updated);
    return updated;
  }

  setSupportedActions(
    adapterId: string,
    supportedActions: SupportedAction[],
  ): PlatformAdapter | undefined {
    const current = this.adapters.get(adapterId);
    if (!current) {
      return undefined;
    }

    const updated = {
      ...current,
      supportedActions,
      updatedAt: new Date().toISOString(),
    };
    this.adapters.set(adapterId, updated);
    return updated;
  }
}
