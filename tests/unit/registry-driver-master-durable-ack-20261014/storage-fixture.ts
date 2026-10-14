import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";

/** Actual master repository; only the external database query is controlled. */
export function enabledRegistryRepository() {
  return new RegulatoryRegistryRepository({
    isEnabled: () => true,
    query: async () => ({ rows: [] }),
  } as never);
}

/**
 * Existing expiry cases exercise the repository's inherited disconnected
 * event store. Supply a real enabled master save boundary, then disconnect
 * immediately after the external INSERT ACK, before renewal/event callbacks.
 * This is a controlled database availability transition, not a fake saved ACK
 * or an implementation of expiry SQL. It is not PostgreSQL acceptance evidence.
 */
export function legacyExpiryRegistryStorage() {
  let enabled = false;
  const records = new Map<string, string>();
  const repository = new RegulatoryRegistryRepository({
    isEnabled: () => enabled,
    query: async (sql: string, params?: unknown[]) => {
      if (sql.includes("INSERT INTO reg.phase1_registry_drivers")) {
        records.set(params![0] as string, params![5] as string);
        enabled = false;
      }
      return { rows: [] };
    },
  } as never);
  const withMasterStorage = async <T>(save: () => Promise<T>): Promise<T> => {
    enabled = true;
    try {
      return await save();
    } finally {
      enabled = false;
    }
  };
  return { repository, withMasterStorage, records };
}
