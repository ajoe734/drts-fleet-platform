import type { AuthRealm } from "./auth.types";
import { AUTH_ROUTE_READ_METHODS } from "./auth.constants";

export interface RouteAuthPolicy {
  requiredScopes: string[];
  allowedRealms: AuthRealm[];
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

export function resolveRouteAuthPolicy(
  method: string,
  url: string,
): ResolvedRouteAuthPolicy | null {
  const routePath = normalizeRoutePath(url);
  const upperMethod = method.toUpperCase();

  if (routePath === "audit" && upperMethod === "GET") {
    return {
      routeKey: "audit:list",
      requiredScopes: ["audit:read"],
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Audit log listing",
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
    return {
      routeKey: `fleet-partner:${routeSuffix}:${upperMethod}`,
      requiredScopes: ["billing:read"],
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
      routePath.startsWith("tenant/invoices")
    ) {
      return {
        routeKey: `tenant:billing:${upperMethod}`,
        requiredScopes: methodScope(
          "tenant:billing:read",
          "tenant:billing:write",
          upperMethod,
        ),
        allowedRealms: baseAllowedRealms("platform", "tenant"),
        description: "Tenant billing and invoices",
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
    /^passenger\/orders\/[^/]+\/cancel$/.test(routePath) &&
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
    routePath.startsWith("admin/sandbox-governance") ||
    routePath.startsWith("admin/tenant-governance")
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
        "Admin vehicle-eligibility matrix + sandbox governance + service product configuration + tenant governance",
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

  // ── Routes discovered by the dynamic route-inventory audit (IAM-UAT-001) ──
  // These controllers exist on disk but were not previously registered in this
  // policy table, meaning any route without an inline @OpenRoute / @RequireRealms
  // / @RequireScopes decorator would silently fall through to no policy.

  // Health probe — public, no authentication required.
  if (routePath === "health" || routePath.startsWith("health/")) {
    return {
      routeKey: `health:${upperMethod}`,
      requiredScopes: [],
      allowedRealms: ["system", "platform", "ops", "tenant", "driver", "partner"],
      description: "Health probe — public liveness endpoint, no auth required",
    };
  }

  // Notification read receipt
  if (routePath === "notifications/read" && upperMethod === "POST") {
    return {
      routeKey: "notifications:read-receipt",
      requiredScopes: ["notifications:write"],
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Mark notifications as read",
    };
  }

  // Billing / settlement operational routes not already matched above
  if (
    routePath === "driver-fee-plans/publish" ||
    routePath.startsWith("settlement/")
  ) {
    return {
      routeKey: `billing:settlement:${upperMethod}`,
      requiredScopes: methodScope("billing:read", "billing:write", upperMethod),
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Billing and settlement operational access (settlement + publish)",
    };
  }

  // Driver settings (self-service and ops read)
  if (routePath === "driver-settings" || routePath.startsWith("driver-settings/")) {
    return {
      routeKey: `driver-settings:${upperMethod}`,
      requiredScopes: methodScope("driver:read", "driver:write", upperMethod),
      allowedRealms: baseAllowedRealms("platform", "ops", "driver"),
      description: "Driver settings management",
    };
  }

  // Feature flags admin
  if (routePath === "admin/flags" || routePath.startsWith("admin/flags/")) {
    return {
      routeKey: `admin:feature-flags:${upperMethod}`,
      requiredScopes: methodScope("foundation:read", "foundation:write", upperMethod),
      allowedRealms: baseAllowedRealms("platform"),
      description: "Feature flag administration",
    };
  }

  // Forwarder driver task views (not covered by the forwarder/ prefix branch above)
  if (routePath === "driver/task-views" || routePath.startsWith("driver/task-views/")) {
    return {
      routeKey: `driver:task-views:${upperMethod}`,
      requiredScopes: methodScope("driver:read", "driver:write", upperMethod),
      allowedRealms: baseAllowedRealms("ops", "driver"),
      description: "Driver forwarded-order task views",
    };
  }

  if (
    routePath.startsWith("driver/forwarded-orders/")
  ) {
    return {
      routeKey: `driver:forwarded-orders:${upperMethod}`,
      requiredScopes: methodScope("driver:read", "driver:write", upperMethod),
      allowedRealms: baseAllowedRealms("ops", "driver"),
      description: "Driver forwarded-order accept / reject",
    };
  }

  // System foundation manifest — internal platform probing only
  if (routePath.startsWith("system/foundation")) {
    return {
      routeKey: `system:foundation:${upperMethod}`,
      requiredScopes: ["foundation:read"],
      allowedRealms: baseAllowedRealms("platform"),
      description: "System foundation manifest — platform internal",
    };
  }

  // Geo / geocoding services — restricted to platform and ops callers
  if (routePath === "geo/health" || routePath.startsWith("geo/")) {
    return {
      routeKey: `geo:${upperMethod}`,
      requiredScopes: [],
      allowedRealms: baseAllowedRealms("platform", "ops", "driver"),
      description: "Geo / geocoding service access",
    };
  }

  // Product-rule catalog
  if (routePath === "product-rule/catalog" || routePath.startsWith("product-rule/")) {
    return {
      routeKey: `product-rule:${upperMethod}`,
      requiredScopes: methodScope("foundation:read", "foundation:write", upperMethod),
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Product rule catalog management",
    };
  }

  // Sandbox dispatch gate — controlled preview dispatch evaluation
  if (routePath.startsWith("sandbox/dispatch")) {
    return {
      routeKey: `sandbox:dispatch:${upperMethod}`,
      requiredScopes: methodScope("foundation:read", "foundation:write", upperMethod),
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Sandbox dispatch gate evaluation and policy management",
    };
  }

  // Service area definitions and admin management
  if (routePath === "service-area/definitions" || routePath === "service-area/geojson" || routePath === "service-area/evaluate") {
    return {
      routeKey: `service-area:public:${upperMethod}`,
      requiredScopes: [],
      allowedRealms: baseAllowedRealms("platform", "ops", "driver"),
      description: "Service area public read and evaluation",
    };
  }

  if (routePath.startsWith("service-area/admin")) {
    return {
      routeKey: `service-area:admin:${upperMethod}`,
      requiredScopes: methodScope("foundation:read", "foundation:write", upperMethod),
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Service area admin management (create / publish / retire)",
    };
  }

  // Shift attendance (driver self-service with ops oversight)
  if (routePath.startsWith("shift-attendance")) {
    return {
      routeKey: `shift-attendance:${upperMethod}`,
      requiredScopes: methodScope("driver:read", "driver:write", upperMethod),
      allowedRealms: baseAllowedRealms("platform", "ops", "driver"),
      description: "Driver shift attendance management",
    };
  }

  // Tesla vehicle integration — driver + platform
  if (routePath.startsWith("tesla-integration/")) {
    return {
      routeKey: `tesla-integration:${upperMethod}`,
      requiredScopes: methodScope("driver:read", "driver:write", upperMethod),
      allowedRealms: baseAllowedRealms("platform", "ops", "driver"),
      description: "Tesla vehicle integration — OAuth, telemetry, and commands",
    };
  }

  return null;
}
