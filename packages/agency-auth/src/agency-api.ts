import { NextRequest, NextResponse } from "next/server";
import {
  tenantAuthFetch as agencyAuthFetch,
  resolveTenantApiUrl as resolveApiUrl,
} from "@drts/tenant-auth/api-fetch";
import { verifyCsrfToken, verifySameOrigin } from "@drts/tenant-auth/session";

import {
  AGENCY_CSRF_COOKIE_NAME,
  AGENCY_CSRF_HEADER_NAME,
  AGENCY_SESSION_COOKIE_NAME,
} from "./constants";

const SAFE_SEGMENT = /^[A-Za-z0-9_.:-]{1,200}$/;

/** Only `agency/*` API paths are reachable through the agency host. */
export function buildAgencyApiPath(segments: readonly string[]): string | null {
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        !SAFE_SEGMENT.test(segment) || segment === "." || segment === "..",
    )
  ) {
    return null;
  }
  return `/api/agency/${segments.map(encodeURIComponent).join("/")}`;
}

/** Map-valued fields whose own keys are data (e.g. category codes), not names. */
const PRESERVED_MAP_KEYS = new Set(["complaints_by_category", "filter"]);

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_match, letter: string) =>
    letter.toUpperCase(),
  );
}

/**
 * The API serializes snake_case (SnakeCaseInterceptor); pages use the
 * camelCase contract types. Map-valued fields keep their data keys verbatim.
 */
export function deepToCamelCase(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(deepToCamelCase);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        snakeToCamel(key),
        PRESERVED_MAP_KEYS.has(key) && entry && typeof entry === "object"
          ? { ...(entry as Record<string, unknown>) }
          : deepToCamelCase(entry),
      ]),
    );
  }
  return value;
}

export interface AgencyApiResult<T> {
  status: number;
  data: T | null;
  error: { code: string | null; message: string | null } | null;
}

/** Server-side read of an agency API route with the session bearer. */
export async function agencyApiGet<T>(
  accessToken: string,
  segments: readonly string[],
  query: Record<string, string | undefined> = {},
): Promise<AgencyApiResult<T>> {
  const apiPath = buildAgencyApiPath(segments);
  if (!apiPath) {
    return {
      status: 400,
      data: null,
      error: { code: "AGENCY_PATH_INVALID", message: null },
    };
  }
  const url = new URL(`${resolveApiUrl()}${apiPath}`);
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string" && value.trim()) {
      url.searchParams.set(key, value.trim());
    }
  }
  const response = await agencyAuthFetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { code?: string; message?: string };
  } | null;
  return {
    status: response.status,
    data: response.ok
      ? ((deepToCamelCase(body?.data ?? null) as T | null) ?? null)
      : null,
    error: response.ok
      ? null
      : {
          code: body?.error?.code ?? null,
          message: body?.error?.message ?? null,
        },
  };
}

type ProxyContext = { params: Promise<{ path: string[] }> };

async function proxy(
  request: NextRequest,
  context: ProxyContext,
  method: "GET" | "POST",
) {
  const { path = [] } = await context.params;
  const apiPath = buildAgencyApiPath(path);
  if (!apiPath) {
    return NextResponse.json({ error: "AGENCY_PATH_INVALID" }, { status: 400 });
  }
  const token = request.cookies.get(AGENCY_SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json(
      { error: "AUTHENTICATION_REQUIRED" },
      { status: 401 },
    );
  }
  if (method === "POST") {
    if (
      !verifySameOrigin(request) ||
      !verifyCsrfToken(
        request.cookies.get(AGENCY_CSRF_COOKIE_NAME)?.value,
        request.headers.get(AGENCY_CSRF_HEADER_NAME),
      )
    ) {
      return NextResponse.json(
        { error: "CSRF_TOKEN_INVALID" },
        { status: 403 },
      );
    }
  }
  const target = new URL(`${resolveApiUrl()}${apiPath}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });
  try {
    const upstream = await agencyAuthFetch(target.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      ...(method === "POST" ? { body: await request.text() } : {}),
      cache: "no-store",
    });
    const body = await upstream.json().catch(() => null);
    return NextResponse.json(body, {
      status: upstream.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "AGENCY_API_UNAVAILABLE" },
      { status: 503 },
    );
  }
}

/** BFF passthrough for client components (export preview/create/status/download). */
export function createAgencyApiProxyHandlers() {
  return {
    GET: (request: NextRequest, context: ProxyContext) =>
      proxy(request, context, "GET"),
    POST: (request: NextRequest, context: ProxyContext) =>
      proxy(request, context, "POST"),
  };
}
