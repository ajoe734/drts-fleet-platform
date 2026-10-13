import { isDemoMode } from "./demo/store";
import { demoFetch } from "./demo/transport";

/** The explicitly selected demo shares the same clients and forms as live trips. */
export function passengerFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  return isDemoMode() ? demoFetch(url, init) : fetch(url, init);
}
