/**
 * Cross-app URL and Origin Resolution Helper.
 *
 * Ensures cross-app links (e.g. audit log, payments queue, fleet governance)
 * resolve to the authoritative platform-admin (or tenant-console) runtime origin
 * and preserve resource context (auditId, resourceType, resourceId).
 *
 * Prevents issues where cross-app links navigate to relative paths or the ops
 * console origin, causing 404 errors (R18 / C048).
 */

import type { CrossAppResourceLink } from "@drts/contracts";
import { crossAppHref as defaultCrossAppHref } from "../../lib/ops-cross-app-links";

export interface PlatformAdminAuditContext {
  auditId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  moduleName?: string | null;
  actorId?: string | null;
}

/**
 * Resolves the authoritative runtime base URL for platform-admin.
 *
 * Prioritizes environment variables, window runtime config, browser location
 * (mapping port 3000 to port 3002 in local dev), and falls back to standard dev port.
 */
export function resolvePlatformAdminOrigin(): string {
  // 1. Process environment variables (standard Next.js / DRTS runtime variables)
  const envCandidate =
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ||
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN ||
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_BASE_URL ||
    process.env.PLATFORM_ADMIN_BASE_URL ||
    process.env.DRTS_DEV_PLATFORM_ADMIN_BASE_URL ||
    process.env.DRTS_OPERATIONAL_PLATFORM_ADMIN_URL ||
    process.env.DRTS_PLATFORM_ADMIN_URL ||
    process.env.PLATFORM_ADMIN_WEB_URL ||
    process.env.STAGING_PLATFORM_ADMIN_ORIGIN ||
    process.env.PROD_PLATFORM_ADMIN_ORIGIN;

  if (
    envCandidate &&
    typeof envCandidate === "string" &&
    envCandidate.trim().length > 0
  ) {
    const trimmed = envCandidate.trim().replace(/\/+$/, "");
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
    }
    return trimmed;
  }

  // 2. Browser runtime window config
  if (typeof window !== "undefined") {
    const runtimeConfig = (
      window as unknown as {
        __DRTS_RUNTIME_CONFIG__?: {
          platformAdminUrl?: string;
          platformAdminBaseUrl?: string;
        };
      }
    ).__DRTS_RUNTIME_CONFIG__;

    const windowConfig =
      runtimeConfig?.platformAdminUrl || runtimeConfig?.platformAdminBaseUrl;
    if (windowConfig && windowConfig.trim().length > 0) {
      return windowConfig.trim().replace(/\/+$/, "");
    }

    // 3. Browser location detection
    if (window.location) {
      const { hostname, protocol, port } = window.location;
      if (hostname === "localhost" || hostname === "127.0.0.1") {
        // Standard dev port for platform-admin is 3002.
        // If ops is on 3100, platform admin is on 3102.
        const targetPort = port === "3100" ? "3102" : "3002";
        return `${protocol}//${hostname}:${targetPort}`;
      }

      // If running on custom subdomains (e.g. ops.dev.drts.example.com -> admin.dev.drts.example.com)
      // Skip on generated Cloud Run domains (*.run.app) where service hashes diverge.
      if (!hostname.endsWith(".run.app")) {
        if (hostname.startsWith("ops.")) {
          return `${protocol}//${hostname.replace(/^ops\./, "admin.")}${port ? `:${port}` : ""}`;
        }
        if (hostname.includes("ops-console")) {
          return `${protocol}//${hostname.replace("ops-console", "platform-admin")}${port ? `:${port}` : ""}`;
        }
      }
    }
  }

  // 4. Default fallback for local development
  return "http://localhost:3002";
}

/**
 * Strips ops-specific prefixes from route path.
 */
function cleanRoutePath(route: string): string {
  let path = route.trim();
  if (path.startsWith("/platform-admin/")) {
    path = path.slice("/platform-admin".length);
  } else if (path === "/platform-admin") {
    path = "/";
  } else if (path.startsWith("/_apps/platform-admin/")) {
    path = path.slice("/_apps/platform-admin".length);
  } else if (path === "/_apps/platform-admin") {
    path = "/";
  }
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * Resolves a CrossAppResourceLink to a fully qualified URL.
 */
export function resolveCrossAppHref(link: CrossAppResourceLink): string {
  if (link.targetApp === "platform-admin") {
    const origin = resolvePlatformAdminOrigin();
    const rawRoute = link.route;

    if (rawRoute.startsWith("http://") || rawRoute.startsWith("https://")) {
      try {
        const parsed = new URL(rawRoute);
        const cleanPath = cleanRoutePath(parsed.pathname);
        return `${origin}${cleanPath}${parsed.search}${parsed.hash}`;
      } catch {
        return rawRoute;
      }
    }

    const cleanPath = cleanRoutePath(rawRoute);
    return `${origin}${cleanPath}`;
  }

  return defaultCrossAppHref(link);
}

/**
 * Generates an authoritative platform-admin audit URL with resource context.
 */
export function buildPlatformAdminAuditUrl(
  context?: PlatformAdminAuditContext,
): string {
  const origin = resolvePlatformAdminOrigin();
  const params = new URLSearchParams();

  if (context?.auditId && context.auditId.trim().length > 0) {
    params.set("auditId", context.auditId.trim());
  }
  if (context?.resourceType && context.resourceType.trim().length > 0) {
    params.set("resourceType", context.resourceType.trim());
  }
  if (context?.resourceId && context.resourceId.trim().length > 0) {
    params.set("resourceId", context.resourceId.trim());
  }
  if (context?.moduleName && context.moduleName.trim().length > 0) {
    params.set("module", context.moduleName.trim());
  }
  if (context?.actorId && context.actorId.trim().length > 0) {
    params.set("actorId", context.actorId.trim());
  }

  const query = params.toString();
  return query ? `${origin}/audit?${query}` : `${origin}/audit`;
}

/**
 * Sanitizes an incoming audit href (which may be relative or mistakenly pointed
 * to the ops-console domain) and attaches resource context.
 */
export function sanitizeAuditHref(
  rawHref: string | null | undefined,
  context?: PlatformAdminAuditContext,
): string {
  if (!rawHref || rawHref.trim().length === 0) {
    return buildPlatformAdminAuditUrl(context);
  }

  const origin = resolvePlatformAdminOrigin();
  const trimmed = rawHref.trim();

  // If rawHref is relative (e.g. "/audit?auditId=..." or "/platform-admin/audit?...")
  if (trimmed.startsWith("/")) {
    let cleanPath = cleanRoutePath(trimmed);
    if (!cleanPath.startsWith("/audit")) {
      cleanPath = `/audit${cleanPath}`;
    }
    const url = new URL(cleanPath, origin);
    if (context?.resourceType && !url.searchParams.has("resourceType")) {
      url.searchParams.set("resourceType", context.resourceType);
    }
    if (context?.resourceId && !url.searchParams.has("resourceId")) {
      url.searchParams.set("resourceId", context.resourceId);
    }
    if (context?.auditId && !url.searchParams.has("auditId")) {
      url.searchParams.set("auditId", context.auditId);
    }
    return url.toString();
  }

  // If rawHref is an absolute URL
  try {
    const parsed = new URL(trimmed);
    const path = cleanRoutePath(parsed.pathname);
    if (path === "/audit" || path.startsWith("/audit/")) {
      const url = new URL(path, origin);
      url.search = parsed.search;
      if (context?.resourceType && !url.searchParams.has("resourceType")) {
        url.searchParams.set("resourceType", context.resourceType);
      }
      if (context?.resourceId && !url.searchParams.has("resourceId")) {
        url.searchParams.set("resourceId", context.resourceId);
      }
      if (context?.auditId && !url.searchParams.has("auditId")) {
        url.searchParams.set("auditId", context.auditId);
      }
      return url.toString();
    }
    return trimmed;
  } catch {
    return buildPlatformAdminAuditUrl(context);
  }
}
