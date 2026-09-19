import { deepToSnakeCase } from "../../common/snake-case.interceptor";

/** Stable key order survives jsonb storage; signing and hashing use these same bytes. */
export function partnerNotificationWireBytes(payload: unknown): string {
  const sort = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sort);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, sort(item)]),
      );
    }
    return value;
  };
  return JSON.stringify(sort(deepToSnakeCase(payload)));
}
