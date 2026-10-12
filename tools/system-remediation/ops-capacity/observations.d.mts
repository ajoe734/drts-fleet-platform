type PoolLike = {
  query(
    sql: string,
    params: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
};
export function pollCapacityResources(
  pool: PoolLike,
  orderIds: string[],
  reportIds: string[],
): Promise<{ report: number; dispatchable: number }>;
export function runWithCapacityPolling<T>(
  produce: () => Promise<T>,
  poll: () => Promise<void>,
  intervalMs?: number,
): Promise<T>;
