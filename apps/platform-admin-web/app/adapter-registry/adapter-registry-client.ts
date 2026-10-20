import type {
  PlatformAdapter,
  UpdatePlatformAdapterCommand,
} from "@drts/contracts";

/**
 * Original Q-X01 / Q-X02 adapter-registry freshness tier (T4 / medium_slow = 30s)
 * from docs/03-runbooks/admin-and-platform-web-live-data-and-ia.md §3.3.
 */
export const ADAPTER_REGISTRY_REFRESH_TIER = "medium_slow" as const;
export const ADAPTER_REGISTRY_REFRESH_INTERVAL_MS = 30_000;

export interface AdapterRegistryClientLike {
  listPlatformAdapters(): Promise<
    PlatformAdapter[] | { items: PlatformAdapter[] }
  >;
  updatePlatformAdapter(
    id: string,
    command: UpdatePlatformAdapterCommand,
  ): Promise<PlatformAdapter>;
  post<T>(
    path: string,
    options?: {
      body?: unknown;
      idempotencyKey?: string;
      headers?: Record<string, string>;
      signal?: AbortSignal;
    },
  ): Promise<T>;
}

function createLocalIdempotencyKey(prefix: string): string {
  const token =
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${token}`;
}

export async function fetchPlatformAdapters(
  client: AdapterRegistryClientLike,
): Promise<PlatformAdapter[]> {
  const result = await client.listPlatformAdapters();
  if (Array.isArray(result)) {
    return result;
  }
  return result?.items ?? [];
}

export async function registerPlatformAdapterCommand(
  client: AdapterRegistryClientLike,
  adapter: PlatformAdapter,
  options?: { idempotencyKey?: string },
): Promise<PlatformAdapter> {
  return client.post<PlatformAdapter>("/api/platform-admin/adapters", {
    body: adapter,
    idempotencyKey:
      options?.idempotencyKey ?? createLocalIdempotencyKey("adapter-register"),
  });
}

export async function updatePlatformAdapterCommand(
  client: AdapterRegistryClientLike,
  adapterId: string,
  command: UpdatePlatformAdapterCommand,
): Promise<PlatformAdapter> {
  return client.updatePlatformAdapter(adapterId, command);
}
