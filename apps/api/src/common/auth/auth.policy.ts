import type { AuthRealm, RequestAuthRealm } from "./auth.types";
import { AUTH_ROUTE_READ_METHODS } from "./auth.constants";

export interface RouteAuthPolicy {
  requiredScopes: string[];
  allowedRealms: RequestAuthRealm[];
  description: string;
}

export interface ResolvedRouteAuthPolicy extends RouteAuthPolicy {
  routeKey: string;
}

function normalizeRoutePath(url: string): string {
  const withoutQuery = url.split("?", 1)[0] ?? url;
  const trimmed = withoutQuery.replace(/^\/+/, "").replace(/^api\/+/, "");
  return trimmed.replace(/\/+$/, "");
}

function isReadMethod(method: string): boolean {
  return AUTH_ROUTE_READ_METHODS.has(method.toUpperCase());
}

function methodScope(readScope: string, writeScope: string, method: string) {
  return [isReadMethod(method) ? readScope : writeScope];
}

function baseAllowedRealms(...realms: AuthRealm[]): AuthRealm[] {
  return ["system", ...realms];
}

/**
 * BUREAU-R13 agency portal and platform-side agency administration routes.
 * Agency data routes are the only routes that name the `agency` realm (plus
 * auth/session and logout); BootstrapAuthGuard denies an agency session
 * everywhere else and on every non-allowlisted write.
 */
function resolveAgencyRouteAuthPolicy(
  upperMethod: string,
  routePath: string,
): ResolvedRouteAuthPolicy | null {
  if (routePath === "agency" || routePath.startsWith("agency/")) {
    if (
      routePath === "agency/trip-records/export-jobs" ||
      routePath.startsWith("agency/trip-records/export-jobs/")
    ) {
      return {
        routeKey: `agency:trip-records:export:${upperMethod}`,
        requiredScopes: ["agency:trip_records:export"],
        allowedRealms: baseAllowedRealms("agency"),
        description:
          "Agency controlled export of retained trip records (owner-bound jobs)",
      };
    }
    if (
      routePath === "agency/trip-records" ||
      /^agency\/trip-records\/[^/]+$/.test(routePath)
    ) {
      return {
        routeKey: `agency:trip-records:read:${upperMethod}`,
        requiredScopes: ["agency:trip_records:read"],
        allowedRealms: baseAllowedRealms("agency"),
        description: "Agency read-only retained trip records (R11)",
      };
    }
    if (routePath.startsWith("agency/reports/")) {
      return {
        routeKey: `agency:reports:read:${upperMethod}`,
        requiredScopes: ["agency:reports:read"],
        allowedRealms: baseAllowedRealms("agency"),
        description: "Agency read-only aggregate reports (R09/R10/R12)",
      };
    }
    if (routePath.startsWith("agency/qualifications/")) {
      return {
        routeKey: `agency:qualifications:read:${upperMethod}`,
        requiredScopes: ["agency:qualifications:read"],
        allowedRealms: baseAllowedRealms("agency"),
        description: "Agency read-only qualification expiry status (R14)",
      };
    }
    return null;
  }

  if (routePath === "platform-admin/agency-access-logs") {
    return {
      routeKey: `platform-admin:agency-access-logs:${upperMethod}`,
      requiredScopes: ["agency:access_audit:read"],
      allowedRealms: baseAllowedRealms("platform"),
      description: "Platform review of the append-only agency access log",
    };
  }

  if (
    routePath === "platform-admin/agencies" ||
    routePath.startsWith("platform-admin/agencies/")
  ) {
    return {
      routeKey: `platform-admin:agencies:${upperMethod}`,
      requiredScopes: methodScope(
        "agency:directory:read",
        "agency:directory:write",
        upperMethod,
      ),
      allowedRealms: baseAllowedRealms("platform"),
      description: "Platform regulatory agency directory and invitations",
    };
  }

  return null;
}

export function resolveRouteAuthPolicy(
  method: string,
  url: string,
): ResolvedRouteAuthPolicy | null {
  const routePath = normalizeRoutePath(url);
  const upperMethod = method.toUpperCase();

  // Append the passenger realm only to address/routing utilities. Existing realm
  // decorators are unioned by BootstrapAuthGuard; health/admin routes stay unchanged.
  if (
    (routePath === "geo/search" && upperMethod === "GET") ||
    (["geo/resolve", "geo/reverse", "geo/route"].includes(routePath) &&
      upperMethod === "POST")
  ) {
    return {
      routeKey: `passenger-app:geo:${routePath.slice(4)}:${upperMethod}`,
      requiredScopes: [],
      allowedRealms: ["passenger"],
      description:
        "First-party passenger address and route utilities; existing decorators preserve other realms",
    };
  }

  if (
    (upperMethod === "POST" &&
      [
        "passenger-app/auth/otp/request",
        "passenger-app/auth/otp/verify",
      ].includes(routePath)) ||
    (upperMethod === "GET" && routePath === "passenger-app/auth/providers")
  ) {
    return {
      routeKey: "passenger-app:otp",
      requiredScopes: [],
      allowedRealms: ["passenger"],
      description:
        "OpenRoute BFF login; link/contact-phone require a live passenger session bound to the challenge",
    };
  }

  if (routePath === "passenger-app" || routePath.startsWith("passenger-app/")) {
    if (
      (upperMethod === "POST" &&
        routePath === "passenger-app/auth/facebook/data-deletion") ||
      (upperMethod === "GET" &&
        /^passenger-app\/auth\/facebook\/data-deletion\/status\/[^/]+$/.test(
          routePath,
        ))
    ) {
      return {
        routeKey: "passenger-app:facebook:data-deletion",
        requiredScopes: [],
        allowedRealms: [],
        description:
          "Meta signed_request deletion webhook and signed anonymous completion receipt",
      };
    }
    if (
      upperMethod === "POST" &&
      /^passenger-app\/platform\/rides\/[^/]+\/refund$/.test(routePath)
    ) {
      return {
        routeKey: "passenger-app:platform:refund",
        requiredScopes: ["billing:write"],
        allowedRealms: ["platform"],
        description: "Platform full passenger ride refund",
      };
    }
    if (routePath.startsWith("passenger-app/platform/")) {
      return {
        routeKey: "passenger-app:platform",
        requiredScopes: [],
        allowedRealms: ["platform"],
        description: "Passenger platform administration",
      };
    }
    if (
      routePath === "passenger-app/auth/providers" ||
      /^passenger-app\/auth\/oauth\/[^/]+\/(start|callback)$/.test(routePath)
    ) {
      // Pre-login traffic carries a BFF metadata identity, not a passenger
      // Bearer; the guard's activatePassenger() open-route branch (not this
      // table) is what actually admits these two requests. A `purpose: "link"`
      // call additionally requires a live passenger Bearer, enforced inside
      // PassengerOAuthService, not by this route-level realm/scope gate.
      return {
        routeKey: `passenger-app:oauth:${routePath}`,
        requiredScopes: [],
        allowedRealms: ["passenger"],
        description:
          "Passenger OAuth/OIDC login provider discovery, start, and callback",
      };
    }
    return {
      routeKey: "passenger-app:self",
      requiredScopes: [],
      allowedRealms: ["passenger"],
      description: "First-party passenger account and owned resources",
    };
  }

  const agencyPolicy = resolveAgencyRouteAuthPolicy(upperMethod, routePath);
  if (agencyPolicy) {
    return agencyPolicy;
  }

  if (routePath === "audit" && upperMethod === "GET") {
    return {
      routeKey: "audit:list",
      requiredScopes: ["audit:read"],
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Audit log listing",
    };
  }

  if (routePath === "auth/session" && upperMethod === "GET") {
    return {
      routeKey: "auth:session:read",
      requiredScopes: [],
      allowedRealms: baseAllowedRealms(
        "platform",
        "tenant",
        "ops",
        "driver",
        "partner",
        "agency",
      ),
      description:
        "Caller reads its own session; the route returns 401 when there is no identity and discloses nothing about any other",
    };
  }

  if (routePath === "auth/token" && upperMethod === "POST") {
    return {
      routeKey: "auth:token:exchange",
      requiredScopes: [],
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Private token exchange for verified control-plane callers",
    };
  }

  if (routePath === "auth/logout" && upperMethod === "POST") {
    return {
      routeKey: "auth:logout",
      requiredScopes: [],
      allowedRealms: baseAllowedRealms(
        "platform",
        "ops",
        "tenant",
        "partner",
        "driver",
        "agency",
      ),
      description: "Authenticated self session logout",
    };
  }

  if (routePath === "auth/logout-all" && upperMethod === "POST") {
    return {
      routeKey: "auth:logout-all",
      requiredScopes: [],
      allowedRealms: baseAllowedRealms(
        "platform",
        "ops",
        "tenant",
        "partner",
        "driver",
        "agency",
      ),
      description: "Authenticated self session logout-all",
    };
  }

  if (routePath === "auth/sessions" && upperMethod === "GET") {
    return {
      routeKey: "auth:sessions:list",
      requiredScopes: [],
      allowedRealms: baseAllowedRealms(
        "platform",
        "ops",
        "tenant",
        "partner",
        "driver",
      ),
      description: "Authenticated self session inventory listing",
    };
  }

  if (
    upperMethod === "POST" &&
    routePath.startsWith("auth/sessions/") &&
    routePath.endsWith("/revoke")
  ) {
    return {
      routeKey: "auth:sessions:revoke",
      requiredScopes: [],
      allowedRealms: baseAllowedRealms(
        "platform",
        "ops",
        "tenant",
        "partner",
        "driver",
      ),
      description: "Authenticated self session revocation",
    };
  }

  if (routePath === "identity/sessions" && upperMethod === "GET") {
    return {
      routeKey: "identity:sessions:list",
      requiredScopes: methodScope(
        "identity:sessions:read",
        "identity:sessions:write",
        upperMethod,
      ),
      allowedRealms: baseAllowedRealms("platform", "ops", "tenant"),
      description: "Administrative session inventory query",
    };
  }

  if (
    upperMethod === "POST" &&
    routePath.startsWith("identity/sessions/") &&
    routePath.endsWith("/revoke")
  ) {
    return {
      routeKey: "identity:sessions:revoke",
      requiredScopes: ["identity:sessions:write"],
      allowedRealms: baseAllowedRealms("platform", "ops", "tenant"),
      description: "Administrative session revocation",
    };
  }

  if (routePath === "notifications") {
    return {
      routeKey: `notifications:${upperMethod}`,
      requiredScopes: methodScope(
        "notifications:read",
        "notifications:write",
        upperMethod,
      ),
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Notification inbox management",
    };
  }

  if (routePath === "notifications/read" && upperMethod === "POST") {
    return {
      routeKey: "notifications:read:post",
      requiredScopes: ["notifications:write"],
      allowedRealms: baseAllowedRealms("platform", "ops", "driver"),
      description: "Mark notifications as read",
    };
  }

  if (routePath === "tenant-partner/summary") {
    return {
      routeKey: "tenant-partner:summary",
      requiredScopes: ["tenant:read"],
      allowedRealms: baseAllowedRealms("platform", "tenant", "ops"),
      description: "Tenant / partner summary",
    };
  }

  if (routePath === "partner/eligibility/verify") {
    return {
      routeKey: "partner:eligibility:verify",
      requiredScopes: ["partner:eligibility:write"],
      allowedRealms: baseAllowedRealms("partner"),
      description: "Partner eligibility verification",
    };
  }

  if (routePath === "partner/bookings" && upperMethod === "POST") {
    return {
      routeKey: "partner:bookings:create",
      requiredScopes: ["partner:book"],
      allowedRealms: baseAllowedRealms("partner"),
      description: "Partner-scoped booking creation",
    };
  }

  if (
    upperMethod === "GET" &&
    (/^partner\/bookings\/[^/]+$/.test(routePath) ||
      /^partner\/orders\/[^/]+$/.test(routePath))
  ) {
    return {
      routeKey: routePath.startsWith("partner/bookings/")
        ? "partner:bookings:get"
        : "partner:orders:get",
      requiredScopes: ["partner:book"],
      allowedRealms: baseAllowedRealms("partner"),
      description: "Partner-scoped booking confirmation and receipt access",
    };
  }

  if (routePath === "auth/driver/device/revoke") {
    return {
      routeKey: "auth:driver-device:revoke",
      requiredScopes: [],
      allowedRealms: baseAllowedRealms("platform", "ops", "driver"),
      description: "Authenticated driver-device revoke access",
    };
  }

  if (routePath === "auth/logout" && upperMethod === "POST") {
    return {
      routeKey: "auth:logout",
      requiredScopes: [],
      allowedRealms: baseAllowedRealms(
        "platform",
        "tenant",
        "ops",
        "driver",
        "partner",
      ),
      description: "Authenticated session logout for current device",
    };
  }

  if (routePath === "auth/logout-all" && upperMethod === "POST") {
    return {
      routeKey: "auth:logout-all",
      requiredScopes: [],
      allowedRealms: baseAllowedRealms(
        "platform",
        "tenant",
        "ops",
        "driver",
        "partner",
      ),
      description: "Authenticated session logout for all active devices",
    };
  }

  if (routePath === "auth/sessions/revoke" && upperMethod === "POST") {
    return {
      routeKey: "auth:sessions:revoke",
      requiredScopes: [],
      allowedRealms: baseAllowedRealms(
        "platform",
        "tenant",
        "ops",
        "driver",
        "partner",
      ),
      description: "Self-service session revocation endpoint",
    };
  }

  if (routePath.startsWith("partner/eligibility/")) {
    return {
      routeKey: "partner:eligibility:get",
      requiredScopes: ["partner:eligibility:read"],
      allowedRealms: baseAllowedRealms("partner"),
      description: "Partner eligibility verification lookup",
    };
  }

  if (routePath.startsWith("partner/referral/passenger/")) {
    const routeSuffix =
      routePath.slice("partner/referral/passenger/".length) || "root";
    return {
      routeKey: `partner:referral-passenger:${routeSuffix}:${upperMethod}`,
      requiredScopes: ["partner:book"],
      allowedRealms: baseAllowedRealms("partner"),
      description: "Referral passenger self-service access",
    };
  }

  if (routePath.startsWith("partner/referral/")) {
    const routeSuffix = routePath.slice("partner/referral/".length) || "root";
    return {
      routeKey: `partner:referral:${routeSuffix}:${upperMethod}`,
      requiredScopes: ["billing:read"],
      allowedRealms: baseAllowedRealms("partner"),
      description: "Referral partner self-service access",
    };
  }

  if (
    routePath === "platform-admin/multi-taxi-trip-records/export-jobs" ||
    routePath.startsWith("platform-admin/multi-taxi-trip-records/export-jobs/")
  ) {
    return {
      routeKey: `multi-taxi-records:export:${upperMethod}`,
      requiredScopes: ["multi_taxi_records:export"],
      allowedRealms: baseAllowedRealms("platform"),
      description: "Controlled multi-taxi operational-record export",
    };
  }

  // Break-glass request/grant reads are visible to the requester, the
  // assigned/eligible approver, or a platform/ops admin -- a decision made
  // inside BreakGlassService.canView/listForViewer, not by a route scope.
  // An activated break-glass session only carries BREAK_GLASS_ALLOWED_SCOPES
  // (e.g. identity:read), never foundation:read, so these two GET routes
  // must not fall through to the generic platform-admin/ foundation:read
  // requirement below or the legitimate activated requester is locked out.
  if (
    upperMethod === "GET" &&
    (routePath === "platform-admin/break-glass/requests" ||
      /^platform-admin\/break-glass\/requests\/[^/]+$/.test(routePath))
  ) {
    return {
      routeKey: `platform-admin:break-glass:read:${upperMethod}`,
      requiredScopes: [],
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description:
        "Break-glass request/grant read (requester/eligible-approver/admin visibility enforced in service)",
    };
  }

  if (routePath.startsWith("platform-admin/")) {
    return {
      routeKey: `platform-admin:${upperMethod}`,
      requiredScopes: methodScope(
        "foundation:read",
        "foundation:write",
        upperMethod,
      ),
      allowedRealms: baseAllowedRealms("platform"),
      description: "Platform admin master-data management",
    };
  }

  if (routePath === "admin/fleet-partners") {
    return {
      routeKey: `admin:fleet-partners:${upperMethod}`,
      requiredScopes: methodScope(
        "foundation:read",
        "foundation:write",
        upperMethod,
      ),
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Fleet partner administration",
    };
  }

  if (routePath.startsWith("admin/fleet-partners/")) {
    const isBillingRoute =
      routePath.includes("/revenue-share-rules") ||
      routePath.endsWith("/statements");

    return {
      routeKey: isBillingRoute
        ? `admin:fleet-partners:billing:${upperMethod}`
        : `admin:fleet-partners:${upperMethod}`,
      requiredScopes: isBillingRoute
        ? methodScope("billing:read", "billing:write", upperMethod)
        : methodScope("foundation:read", "foundation:write", upperMethod),
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: isBillingRoute
        ? "Fleet partner billing administration"
        : "Fleet partner administration",
    };
  }

  if (
    routePath.startsWith("admin/drivers/") &&
    routePath.endsWith("/fleet-affiliations")
  ) {
    return {
      routeKey: `admin:driver-fleet-affiliations:${upperMethod}`,
      requiredScopes: methodScope(
        "foundation:read",
        "foundation:write",
        upperMethod,
      ),
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Driver fleet affiliation management",
    };
  }

  if (routePath.startsWith("fleet-partner/")) {
    const routeSuffix = routePath.slice("fleet-partner/".length) || "root";
    const finance =
      routeSuffix === "statements" ||
      routeSuffix.startsWith("statements/") ||
      routeSuffix === "revenue" ||
      routeSuffix.startsWith("revenue/");
    // These views include statement counts, share and trip earnings even though
    // their names suggest operational summaries. Ops must not see money, and
    // finance needs no general driver/vehicle/supply read authority.
    const financialSummary =
      routeSuffix === "dashboard" || routeSuffix === "trips";
    const quality = routeSuffix === "quality-metrics";
    // Academy has its own @RequireScopes(reports:read) and independent
    // tenant/ops selector. Preserve those existing callers while Fleet human
    // training access is evaluated through that endpoint's own guard.
    const training = routeSuffix.startsWith("training/");
    return {
      routeKey: `fleet-partner:${routeSuffix}:${upperMethod}`,
      requiredScopes: training
        ? ["billing:read"]
        : finance
          ? methodScope(
              "fleet:finance:read",
              "fleet:finance:write",
              upperMethod,
            )
          : quality
            ? ["fleet:read", "fleet:finance:read"]
            : financialSummary
              ? ["fleet:finance:read"]
              : methodScope("fleet:read", "fleet:supply:write", upperMethod),
      allowedRealms: baseAllowedRealms("partner"),
      description: "Fleet partner self-service access",
    };
  }

  if (routePath.startsWith("tenant/")) {
    const readRoute = isReadMethod(upperMethod);
    if (routePath.startsWith("tenant/webhooks")) {
      return {
        routeKey: `tenant:webhooks:${upperMethod}`,
        requiredScopes: methodScope(
          "tenant:webhooks:read",
          "tenant:webhooks:write",
          upperMethod,
        ),
        allowedRealms: baseAllowedRealms("platform", "tenant"),
        description: "Tenant webhook administration",
      };
    }
    if (routePath.startsWith("tenant/sla")) {
      return {
        routeKey: `tenant:sla:${upperMethod}`,
        requiredScopes: methodScope(
          "tenant:sla:read",
          "tenant:sla:write",
          upperMethod,
        ),
        allowedRealms: baseAllowedRealms("platform", "tenant"),
        description: "Tenant SLA profile management",
      };
    }
    if (
      routePath.startsWith("tenant/billing") ||
      routePath.startsWith("tenant/invoices") ||
      routePath.startsWith("tenant/settlement-statements")
    ) {
      return {
        routeKey: `tenant:billing:${upperMethod}`,
        requiredScopes: methodScope(
          "tenant:billing:read",
          "tenant:billing:write",
          upperMethod,
        ),
        allowedRealms: baseAllowedRealms("platform", "tenant"),
        description: "Tenant billing, invoices, and settlement statements",
      };
    }
    if (
      routePath === "tenant/reports/jobs" ||
      routePath.startsWith("tenant/reports/")
    ) {
      return {
        routeKey: `tenant:reports:${upperMethod}`,
        requiredScopes: methodScope(
          "reports:read",
          "reports:write",
          upperMethod,
        ),
        allowedRealms: baseAllowedRealms("platform", "tenant"),
        description: "Tenant reporting and artifact access",
      };
    }
    if (routePath === "tenant/audit") {
      return {
        routeKey: "tenant:audit",
        requiredScopes: ["audit:read"],
        allowedRealms: baseAllowedRealms("platform", "tenant"),
        description: "Tenant audit feed",
      };
    }

    if (routePath.startsWith("tenant/mail-deliveries")) {
      return {
        routeKey: `tenant:mail-deliveries:${upperMethod}`,
        requiredScopes: ["audit:read"],
        allowedRealms: baseAllowedRealms("platform", "tenant", "ops"),
        description:
          "Mail delivery receipt lookup. `audit:read` is held by platform_admin, ops_user, and tenant_admin alike; the tenant-vs-cross-tenant boundary is enforced by the mail_delivery evidence-governance scope at the service layer, not by this route gate.",
      };
    }

    return {
      routeKey: `tenant:${upperMethod}`,
      requiredScopes: methodScope("tenant:read", "tenant:write", upperMethod),
      allowedRealms: baseAllowedRealms("platform", "tenant"),
      description: readRoute ? "Tenant read access" : "Tenant write access",
    };
  }

  if (routePath.startsWith("call-center/orders")) {
    return {
      routeKey: `callcenter:orders:${upperMethod}`,
      requiredScopes: methodScope(
        "callcenter:read",
        "callcenter:write",
        upperMethod,
      ),
      allowedRealms: baseAllowedRealms("ops"),
      description: "Callcenter phone-order management",
    };
  }

  if (
    upperMethod === "GET" &&
    (routePath === "dispatch/queue" ||
      /^dispatch\/queue\/[^/]+$/.test(routePath))
  ) {
    return {
      routeKey: `dispatch:queue:read:${routePath}`,
      requiredScopes: ["dispatch:read"],
      allowedRealms: baseAllowedRealms("ops"),
      description: "Ops dispatch queue read access",
    };
  }

  if (routePath.startsWith("orders") || routePath.startsWith("dispatch/")) {
    const readRoute = isReadMethod(upperMethod);
    const scope = routePath.startsWith("dispatch/")
      ? methodScope("dispatch:read", "dispatch:write", upperMethod)
      : methodScope("owned:read", "owned:write", upperMethod);

    return {
      routeKey: `owned:${routePath}:${upperMethod}`,
      requiredScopes: scope,
      allowedRealms: baseAllowedRealms("platform", "ops", "tenant"),
      description: readRoute ? "Owned mobility read" : "Owned mobility write",
    };
  }

  if (
    routePath === "passenger/orders/:orderId/cancel" &&
    upperMethod === "POST"
  ) {
    return {
      routeKey: "passenger:orders:cancel",
      requiredScopes: [],
      allowedRealms: baseAllowedRealms(),
      description: "Passenger order cancellation bridge",
    };
  }

  if (
    routePath === "ops/dispatch-events" ||
    routePath === "driver/task-events" ||
    routePath.startsWith("driver/tasks")
  ) {
    const isOpsDispatchEvents = routePath === "ops/dispatch-events";
    return {
      routeKey: isOpsDispatchEvents
        ? `ops:dispatch-events:${upperMethod}`
        : `driver:tasks:${upperMethod}`,
      requiredScopes: isOpsDispatchEvents
        ? methodScope("dispatch:read", "dispatch:write", upperMethod)
        : methodScope("driver:read", "driver:write", upperMethod),
      allowedRealms: isOpsDispatchEvents
        ? baseAllowedRealms("ops")
        : baseAllowedRealms("ops", "driver"),
      description: isOpsDispatchEvents
        ? "Ops dispatch event access"
        : "Driver task access",
    };
  }

  if (
    routePath === "admin/vehicle-eligibility-matrix" ||
    routePath === "admin/service-products" ||
    routePath.startsWith("admin/service-products/") ||
    routePath.startsWith("admin/sandbox-governance")
  ) {
    // Admin eligibility / service-product configuration (read + write). These
    // were missing from the route-auth table and were served ANONYMOUSLY,
    // allowing unauthenticated GET (config disclosure) and PUT/POST (e.g. making
    // an airport-ineligible vehicle eligible). Restrict to platform/ops/system.
    return {
      routeKey: `admin:eligibility-config:${upperMethod}`,
      requiredScopes: [],
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description:
        "Admin vehicle-eligibility matrix + sandbox governance + service product configuration",
    };
  }

  if (
    routePath === "driver/location-heartbeats/batch" ||
    routePath === "driver/tracking-status" ||
    (routePath.startsWith("ops/drivers/") &&
      routePath.endsWith("/tracking-status"))
  ) {
    const isOpsView =
      routePath.startsWith("ops/drivers/") &&
      routePath.endsWith("/tracking-status");
    return {
      routeKey: isOpsView
        ? `ops:driver-tracking:${upperMethod}`
        : `driver:location-tracking:${upperMethod}`,
      // Auth-required + realm-restricted (no specific scope) so the driver app
      // (driver realm), ops console (ops realm), and platform/system callers can
      // post/read location telemetry while anonymous access is rejected.
      requiredScopes: [],
      allowedRealms: isOpsView
        ? baseAllowedRealms("platform", "ops")
        : baseAllowedRealms("platform", "ops", "driver"),
      description: isOpsView
        ? "Ops driver location tracking status access"
        : "Driver location heartbeat ingest + self tracking status",
    };
  }

  if (
    routePath === "driver-settings" ||
    routePath.startsWith("driver-settings/")
  ) {
    const isPatch = upperMethod === "PATCH";
    return {
      routeKey: `driver-settings:${upperMethod}`,
      requiredScopes: isPatch ? ["driver:write"] : ["driver:read"],
      allowedRealms: isPatch
        ? baseAllowedRealms("driver")
        : baseAllowedRealms("platform", "ops", "driver"),
      description: isPatch
        ? "Driver settings mutation"
        : "Driver settings read access",
    };
  }

  if (
    routePath.startsWith("shift-attendance/") ||
    routePath === "shift-attendance"
  ) {
    const isWrite = upperMethod === "POST";
    return {
      routeKey: `shift-attendance:${upperMethod}`,
      requiredScopes: isWrite ? ["driver:write"] : ["driver:read"],
      allowedRealms: isWrite
        ? baseAllowedRealms("driver")
        : baseAllowedRealms("platform", "ops", "driver"),
      description: isWrite
        ? "Shift attendance clock-in/out and mutation"
        : "Shift attendance read access",
    };
  }

  if (
    routePath === "platform-presence" ||
    routePath.startsWith("platform-presence/")
  ) {
    const isWrite = upperMethod === "POST";
    return {
      routeKey: `platform-presence:${upperMethod}`,
      requiredScopes: isWrite ? ["driver:write"] : ["driver:read"],
      allowedRealms: baseAllowedRealms("platform", "ops", "driver"),
      description: isWrite
        ? "Platform presence status mutation"
        : "Platform presence summary access",
    };
  }

  if (
    routePath === "platform-earnings" ||
    routePath.startsWith("platform-earnings/")
  ) {
    return {
      routeKey: `platform-earnings:${upperMethod}`,
      requiredScopes: ["driver:read"],
      allowedRealms: baseAllowedRealms("platform", "ops", "driver"),
      description: "Driver platform earnings read access",
    };
  }

  if (
    routePath === "safety-operator" ||
    routePath.startsWith("safety-operator/")
  ) {
    const isWrite = !isReadMethod(upperMethod);
    return {
      routeKey: `safety-operator:${upperMethod}`,
      requiredScopes: isWrite ? ["driver:write"] : ["driver:read"],
      allowedRealms: baseAllowedRealms("ops", "driver"),
      description: isWrite
        ? "Safety operator assignment and shift management"
        : "Safety operator read access",
    };
  }

  if (
    routePath === "driver/task-views" ||
    routePath.startsWith("driver/task-views/")
  ) {
    return {
      routeKey: `driver:task-views:${upperMethod}`,
      requiredScopes: ["dispatch:read"],
      allowedRealms: baseAllowedRealms("driver"),
      description: "Driver forwarded task view read access",
    };
  }

  if (routePath.startsWith("driver/forwarded-orders/")) {
    return {
      routeKey: `driver:forwarded-orders:${upperMethod}`,
      requiredScopes: ["driver:write"],
      allowedRealms: baseAllowedRealms("driver"),
      description: "Driver forwarded order acceptance/rejection",
    };
  }

  if (
    routePath === "driver/profile" ||
    routePath.startsWith("driver/profile/")
  ) {
    return {
      routeKey: `driver:profile:${upperMethod}`,
      requiredScopes: methodScope("driver:read", "driver:write", upperMethod),
      allowedRealms: baseAllowedRealms("driver"),
      description: "Driver self-service profile access",
    };
  }

  if (routePath === "driver/sos-events" && upperMethod === "POST") {
    return {
      routeKey: "driver:sos-events:create",
      requiredScopes: ["incident:write"],
      allowedRealms: baseAllowedRealms("driver"),
      description: "Driver SOS event submission",
    };
  }

  if (/^driver\/sos-events\/[^/]+$/.test(routePath) && upperMethod === "GET") {
    return {
      routeKey: "driver:sos-events:get",
      requiredScopes: ["incident:write"],
      allowedRealms: baseAllowedRealms("driver"),
      description:
        "Driver own SOS event canonical readback (incident:write per IAM catalogue: driver realm has no incident:read grant)",
    };
  }

  if (routePath.startsWith("driver/sos-events/")) {
    return {
      routeKey: `driver:sos-attachments:${upperMethod}`,
      requiredScopes: ["incident:write"],
      allowedRealms: baseAllowedRealms("driver"),
      description: "Driver SOS attachment upload and scan status",
    };
  }

  if (
    routePath === "ops/driver-sos/alerts/rendered" &&
    upperMethod === "POST"
  ) {
    return {
      routeKey: "ops:driver-sos-alerts:rendered",
      requiredScopes: ["incident:write"],
      allowedRealms: baseAllowedRealms("ops"),
      description: "Ops driver SOS alert render receipt",
    };
  }

  if (
    /^ops\/driver-sos\/[^/]+\/duty-ack$/.test(routePath) &&
    upperMethod === "POST"
  ) {
    return {
      routeKey: "ops:driver-sos:duty-ack",
      requiredScopes: ["incident:write"],
      allowedRealms: baseAllowedRealms("ops"),
      description: "Ops canonical SOS duty acknowledgment (first-writer-wins)",
    };
  }

  if (
    /^ops\/driver-sos\/by-incident\/[^/]+$/.test(routePath) &&
    upperMethod === "GET"
  ) {
    return {
      routeKey: "ops:driver-sos:get-by-incident",
      requiredScopes: ["incident:read"],
      allowedRealms: baseAllowedRealms("ops"),
      description: "Ops canonical SOS event readback by incident id",
    };
  }

  if (
    routePath === "ops/driver-sos/metrics/alert-latency" &&
    upperMethod === "GET"
  ) {
    return {
      routeKey: "ops:driver-sos-alerts:latency-metrics",
      requiredScopes: ["incident:read"],
      allowedRealms: baseAllowedRealms("ops"),
      description: "Ops driver SOS alert latency metrics",
    };
  }

  if (/^ops\/driver-sos\/[^/]+$/.test(routePath) && upperMethod === "GET") {
    return {
      routeKey: "ops:driver-sos:get",
      requiredScopes: ["incident:read"],
      allowedRealms: baseAllowedRealms("ops"),
      description: "Ops canonical SOS event readback",
    };
  }

  if (routePath.startsWith("callcenter/")) {
    return {
      routeKey: `callcenter:${upperMethod}`,
      requiredScopes: methodScope(
        "callcenter:read",
        "callcenter:write",
        upperMethod,
      ),
      allowedRealms: baseAllowedRealms("ops"),
      description: "Callcenter operations",
    };
  }

  if (routePath.startsWith("complaints")) {
    return {
      routeKey: `complaints:${upperMethod}`,
      requiredScopes: methodScope(
        "complaints:read",
        "complaints:write",
        upperMethod,
      ),
      allowedRealms: baseAllowedRealms("ops"),
      description: "Complaint case management",
    };
  }

  if (routePath === "incidents" && upperMethod === "POST") {
    return {
      routeKey: "incidents:create",
      requiredScopes: ["incident:write"],
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Incident creation",
    };
  }

  if (routePath.startsWith("incidents")) {
    return {
      routeKey: `incidents:${upperMethod}`,
      requiredScopes: methodScope(
        "incident:read",
        "incident:write",
        upperMethod,
      ),
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Incident management",
    };
  }

  if (routePath.startsWith("maintenance")) {
    return {
      routeKey: `maintenance:${upperMethod}`,
      requiredScopes: methodScope(
        "maintenance:read",
        "maintenance:write",
        upperMethod,
      ),
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Maintenance management",
    };
  }

  if (routePath.startsWith("roc")) {
    return {
      routeKey: `roc:${upperMethod}`,
      requiredScopes: [],
      allowedRealms: baseAllowedRealms("ops"),
      description: "ROC operational read models and human-only actions",
    };
  }

  if (routePath.startsWith("regulatory/") || routePath === "regulatory") {
    return {
      routeKey: `regulatory-reporting:${upperMethod}`,
      requiredScopes: methodScope(
        "regulatory:read",
        "regulatory:write",
        upperMethod,
      ),
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Regulatory notification reporting",
    };
  }

  if (
    routePath.startsWith("regulatory-registry/") ||
    routePath === "regulatory-registry"
  ) {
    return {
      routeKey: `regulatory:${upperMethod}`,
      requiredScopes: methodScope(
        "regulatory:read",
        "regulatory:write",
        upperMethod,
      ),
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Regulatory registry management",
    };
  }

  // Only driver proof creation uses driver authority. Keep all payment,
  // readback and scan routes under the billing policy below.
  if (
    upperMethod === "POST" &&
    (routePath === "reimbursements/proofs/staged-content" ||
      routePath === "reimbursements/proofs")
  ) {
    return {
      routeKey: "billing:driver:proof:create",
      requiredScopes: ["driver:write"],
      allowedRealms: ["driver"],
      description:
        "Driver proof staging and upload; batch ownership enforced by service",
    };
  }

  if (
    routePath === "driver-fee-plans" ||
    routePath.startsWith("driver-statements") ||
    routePath === "reimbursements" ||
    routePath.startsWith("reimbursements/")
  ) {
    return {
      routeKey: `billing:ops:${upperMethod}`,
      requiredScopes: methodScope("billing:read", "billing:write", upperMethod),
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Billing and settlement operational access",
    };
  }

  if (
    routePath.startsWith("reports/") ||
    routePath === "reports/jobs" ||
    routePath === "filing-packages" ||
    routePath === "filing-packages/generate" ||
    routePath.startsWith("filing-packages/")
  ) {
    return {
      routeKey: `reports:${upperMethod}`,
      requiredScopes: methodScope("reports:read", "reports:write", upperMethod),
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Reporting and filing",
    };
  }

  if (routePath === "forwarder/adapters/health" && isReadMethod(upperMethod)) {
    return {
      routeKey: `forwarder:adapters:health:${upperMethod}`,
      requiredScopes: ["forwarder:read"],
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Forwarder adapter health",
    };
  }

  if (routePath.startsWith("forwarder/")) {
    return {
      routeKey: `forwarder:${upperMethod}`,
      requiredScopes: methodScope(
        "forwarder:read",
        "forwarder:write",
        upperMethod,
      ),
      allowedRealms: baseAllowedRealms("ops"),
      description: "Forwarder relay access",
    };
  }

  if (
    routePath === "identity/privileged-role-grants/process-expiries" &&
    upperMethod === "POST"
  ) {
    return {
      routeKey: "identity:privileged-role-grants:process-expiries",
      requiredScopes: ["identity:write"],
      allowedRealms: ["system"],
      description: "Internal scheduler execution of privileged role expiries",
    };
  }

  // SR-MAIL-RETRY-SCHEDULE-20261001: scale-to-zero-safe triggers for the
  // retryable mail outbox and the approval-timeout reminder sweep. Both must
  // stay "system"-only -- no tenant/ops/platform JWT may call them -- because
  // they are meant for an external scheduler, not an interactive session.
  if (
    routePath === "internal/scheduled-tasks/mail-outbox/drain" &&
    upperMethod === "POST"
  ) {
    return {
      routeKey: "internal:scheduled-tasks:mail-outbox:drain",
      requiredScopes: ["notification-delivery:drain"],
      allowedRealms: ["system"],
      description:
        "Internal scheduler execution of retryable mail outbox drain",
    };
  }

  if (
    routePath === "internal/scheduled-tasks/approval-timeout-reminders/run" &&
    upperMethod === "POST"
  ) {
    return {
      routeKey: "internal:scheduled-tasks:approval-timeout-reminders:run",
      requiredScopes: ["tenant-partner:approval-timeout-reminders:run"],
      allowedRealms: ["system"],
      description:
        "Internal scheduler execution of the approval-timeout reminder sweep",
    };
  }

  if (
    routePath === "internal/scheduled-tasks/billing-monthly/run" &&
    upperMethod === "POST"
  ) {
    return {
      routeKey: "internal:scheduled-tasks:billing-monthly:run",
      requiredScopes: ["billing:monthly:run"],
      allowedRealms: ["system"],
      description:
        "Internal scheduler execution of resumable closed-month driver billing",
    };
  }

  if (
    routePath === "internal/scheduled-tasks/regulatory-expiry/run" &&
    upperMethod === "POST"
  ) {
    return {
      routeKey: "internal:scheduled-tasks:regulatory-expiry:run",
      requiredScopes: ["regulatory:write"],
      allowedRealms: ["system"],
      description:
        "Internal scheduler execution of regulatory expiry and pre-expiry reconciliation",
    };
  }

  if (routePath === "identity/step-up-proofs" && upperMethod === "POST") {
    return {
      routeKey: "identity:step-up-proofs:create",
      requiredScopes: [],
      allowedRealms: baseAllowedRealms(
        "platform",
        "tenant",
        "ops",
        "partner",
        "driver",
      ),
      description: "Creation of step-up proof for privileged action",
    };
  }

  if (routePath.startsWith("identity/") || routePath === "identity") {
    return {
      routeKey: `identity:${upperMethod}`,
      requiredScopes: methodScope(
        "identity:read",
        "identity:write",
        upperMethod,
      ),
      allowedRealms: baseAllowedRealms("platform", "tenant", "ops"),
      description: "Identity and privileged role governance access",
    };
  }

  if (
    routePath.startsWith("partner/entries/") &&
    routePath.endsWith("/notification-navigation/resolve") &&
    upperMethod === "POST"
  ) {
    return {
      routeKey: "partner:notification-navigation:resolve",
      requiredScopes: [],
      allowedRealms: baseAllowedRealms("partner"),
      description: "Partner notification navigation resolution",
    };
  }

  return null;
}
