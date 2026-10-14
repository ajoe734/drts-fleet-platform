import type { FetchFn, FetchOptions } from "../client.js";
import { NativePassengerSession } from "./session.js";

const GEO_ROUTES: Readonly<Record<string, string>> = {
  "GET /api/passenger-app/geo/search": "/api/geo/search",
  "POST /api/passenger-app/geo/resolve": "/api/geo/resolve",
  "POST /api/passenger-app/geo/reverse": "/api/geo/reverse",
  "POST /api/passenger-app/geo/route": "/api/geo/route",
};
function pathAtBase(url: string, baseUrl: string): string | null {
  const base = baseUrl.replace(/\/+$/, "");
  return url.startsWith(`${base}/`) ? url.slice(base.length) : null;
}
/** BFF-only booking geo prefixes map to these four existing raw API routes. */
export function rewriteNativePassengerUrl(
  url: string,
  baseUrl: string,
  method: string = "GET",
): string {
  const path = pathAtBase(url, baseUrl);
  if (path === null) return url;
  const queryAt = path.indexOf("?");
  const pathname = queryAt < 0 ? path : path.slice(0, queryAt);
  const target = GEO_ROUTES[`${method.toUpperCase()} ${pathname}`];
  return target
    ? `${baseUrl.replace(/\/+$/, "")}${target}${queryAt < 0 ? "" : path.slice(queryAt)}`
    : url;
}
function isPassengerSessionRequest(path: string, method: string): boolean {
  const pathname = path.split("?")[0] ?? "";
  if (Object.values(GEO_ROUTES).includes(pathname)) {
    return Object.entries(GEO_ROUTES).some(
      ([source, target]) =>
        target === pathname && source.startsWith(`${method.toUpperCase()} `),
    );
  }
  // Raw auth deliberately uses its own client, including explicit link purpose.
  // Legacy share-token APIs use the existing Web share entry, not this Bearer.
  return (
    pathname.startsWith("/api/passenger-app/") &&
    !pathname.startsWith("/api/passenger-app/auth/") &&
    !pathname.startsWith("/api/passenger-app/platform/")
  );
}
function withBearer(
  options: FetchOptions | undefined,
  token: string,
): FetchOptions {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(options?.headers ?? {})) {
    if (name.toLowerCase() !== "authorization") headers[name] = value;
  }
  return {
    ...options,
    headers: { ...headers, Authorization: `Bearer ${token}` },
  };
}

/** Supply this FetchFn to existing PassengerClient/BookingClient/PaymentClient. */
export function createNativePassengerFetch(options: {
  baseUrl: string;
  fetchFn: FetchFn;
  session: NativePassengerSession;
}): FetchFn {
  return async (url, requestOptions) => {
    const method = requestOptions?.method ?? "GET";
    const target = rewriteNativePassengerUrl(url, options.baseUrl, method);
    const path = pathAtBase(target, options.baseUrl);
    if (path === null || !isPassengerSessionRequest(path, method)) {
      return options.fetchFn(target, requestOptions);
    }
    const current = await options.session.snapshot();
    const response = await options.fetchFn(
      target,
      current
        ? withBearer(requestOptions, current.tokens.accessToken)
        : requestOptions,
    );
    if (response.status !== 401 || !current) return response;
    const tokens = await options.session.refresh(current);
    // One retry after the rotated pair has actually been persisted, never on 403.
    return options.fetchFn(
      target,
      withBearer(requestOptions, tokens.accessToken),
    );
  };
}
