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

  if (routePath.startsWith("accident-cases")) {
    const requiredScopes =
      upperMethod === "GET"
        ? routePath === "accident-cases/evidence-discrepancies" ||
          routePath === "accident-cases/takeover-correlations"
          ? ["sandbox.compliance.read"]
          : ["sandbox.investigation.read"]
        : ["sandbox.investigation.manage"];

    return {
      routeKey: `accident-cases:${upperMethod}`,
      requiredScopes,
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Accident investigation case management",
    };
  }

  if (
    routePath === "audit/evidence-policies" ||
    routePath.startsWith("audit/evidence-policies/")
  ) {
    return {
      routeKey: `audit:evidence-policies:${upperMethod}`,
      requiredScopes: ["audit:read"],
      allowedRealms: baseAllowedRealms("tenant", "platform", "ops", "partner"),
      description: "Evidence retention policy catalog access",
    };
  }

  if (routePath.startsWith("audit/evidence-governance/")) {
    return {
      routeKey: `audit:evidence-governance:${upperMethod}`,
      requiredScopes: ["audit:read"],
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Evidence subject governance inspection",
    };
  }

  if (
    routePath === "audit/legal-holds" ||
    routePath.startsWith("audit/legal-holds/")
  ) {
    return {
      routeKey: `audit:legal-holds:${upperMethod}`,
      requiredScopes: methodScope("audit:read", "audit:write", upperMethod),
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Evidence legal-hold administration",
    };
  }

  if (
    routePath === "audit/deletion-exceptions" ||
    routePath.startsWith("audit/deletion-exceptions/")
  ) {
    return {
      routeKey: `audit:deletion-exceptions:${upperMethod}`,
      requiredScopes: methodScope("audit:read", "audit:write", upperMethod),
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Evidence deletion exception governance",
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
      routeKey: "notifications:read:POST",
      requiredScopes: ["notifications:write"],
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Notification inbox acknowledgment",
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

  if (routePath.startsWith("assistant/")) {
    return {
      routeKey: `assistant:${upperMethod}`,
      requiredScopes: ["assistant:write"],
      allowedRealms: baseAllowedRealms("platform", "ops", "tenant"),
      description: "Assistant conversation and tool runtime access",
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

  if (routePath === "auth/token" && upperMethod === "POST") {
    return {
      routeKey: "auth:token:exchange",
      requiredScopes: [],
      allowedRealms: baseAllowedRealms(
        "platform",
        "tenant",
        "ops",
        "driver",
        "partner",
      ),
      description: "Internal token exchange",
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

  if (routePath.startsWith("admin/supply-review/submissions")) {
    return {
      routeKey: `admin:supply-review:${upperMethod}`,
      requiredScopes: [],
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Fleet partner supply review operations",
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

  if (routePath === "call-center/multi-taxi/rides" && upperMethod === "POST") {
    return {
      routeKey: "callcenter:multi-taxi-rides:create",
      requiredScopes: [],
      allowedRealms: baseAllowedRealms("ops"),
      description: "Call-center multi-taxi ride creation",
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

  if (routePath.startsWith("multi-taxi/dispatch/queue/")) {
    return {
      routeKey: `multi-taxi:dispatch-queue:${upperMethod}`,
      requiredScopes: [],
      allowedRealms: baseAllowedRealms("ops"),
      description: "Multi-taxi dispatch queue operations",
    };
  }

  if (
    routePath.startsWith("passenger/orders/") &&
    routePath.endsWith("/cancel")
  ) {
    return {
      routeKey: `passenger:orders:cancel:${upperMethod}`,
      requiredScopes: ["owned:write"],
      allowedRealms: baseAllowedRealms("platform", "ops", "tenant"),
      description: "Passenger order cancellation",
    };
  }

  if (
    routePath === "ops/dispatch-events" ||
    routePath === "driver/task-events" ||
    routePath.startsWith("driver/tasks") ||
    routePath.startsWith("driver/task-views") ||
    routePath.startsWith("driver/forwarded-orders")
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

  if (routePath.startsWith("ops/approval-requests")) {
    return {
      routeKey: `ops:approval-requests:${upperMethod}`,
      requiredScopes: [],
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Ops approval request queue management",
    };
  }

  if (routePath.startsWith("ops/partner/eligibility/reviews")) {
    return {
      routeKey: `ops:partner-eligibility-reviews:${upperMethod}`,
      requiredScopes: [],
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Ops partner eligibility review workflow",
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

  if (routePath === "driver-settings" || routePath.startsWith("driver-settings/")) {
    return {
      routeKey: `driver-settings:${upperMethod}`,
      requiredScopes: methodScope("driver:read", "driver:write", upperMethod),
      allowedRealms: baseAllowedRealms("platform", "ops", "driver"),
      description: "Driver settings access",
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

  if (
    routePath === "platform-presence" ||
    routePath.startsWith("platform-presence/")
  ) {
    return {
      routeKey: `platform-presence:${upperMethod}`,
      requiredScopes: [],
      allowedRealms: baseAllowedRealms("platform", "ops", "driver"),
      description: "Driver platform presence self-service access",
    };
  }

  if (routePath.startsWith("platform-earnings/")) {
    return {
      routeKey: `platform-earnings:${upperMethod}`,
      requiredScopes: [],
      allowedRealms: baseAllowedRealms("platform", "ops", "driver"),
      description: "Driver platform earnings summary access",
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

  if (routePath === "operational-observability") {
    return {
      routeKey: "operational-observability:GET",
      requiredScopes: ["audit:read"],
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Operational observability snapshot access",
    };
  }

  if (routePath.startsWith("safety-operator/")) {
    return {
      routeKey: `safety-operator:${upperMethod}`,
      requiredScopes: [],
      allowedRealms: baseAllowedRealms("ops", "driver"),
      description: "Safety operator shift and assignment operations",
    };
  }

  if (routePath.startsWith("security-events")) {
    return {
      routeKey: `security-events:${upperMethod}`,
      requiredScopes: [],
      allowedRealms: baseAllowedRealms("platform", "ops", "tenant"),
      description: "Security event audit feed access",
    };
  }

  if (routePath === "system/foundation/manifest") {
    return {
      routeKey: "system:foundation:manifest",
      requiredScopes: ["foundation:read"],
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Foundation execution manifest",
    };
  }

  if (routePath.startsWith("geo/")) {
    return {
      routeKey: `geo:${upperMethod}`,
      requiredScopes: [],
      allowedRealms: baseAllowedRealms(
        "platform",
        "ops",
        "tenant",
        "partner",
        "driver",
      ),
      description: "Authenticated geo provider access",
    };
  }

  if (routePath === "admin/tenant-governance/summary") {
    return {
      routeKey: "admin:tenant-governance:summary",
      requiredScopes: ["foundation:read"],
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Tenant governance summary",
    };
  }

  if (routePath === "product-rule/catalog") {
    return {
      routeKey: "product-rule:catalog",
      requiredScopes: ["foundation:read"],
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Product rule catalog read",
    };
  }

  if (routePath.startsWith("product-rule/fare-anomalies")) {
    return {
      routeKey: `product-rule:fare-anomalies:${upperMethod}`,
      requiredScopes: methodScope(
        "foundation:read",
        "foundation:write",
        upperMethod,
      ),
      allowedRealms: baseAllowedRealms("platform"),
      description: "Fare anomaly governance and recovery",
    };
  }

  if (routePath.startsWith("sandbox/dispatch/")) {
    return {
      routeKey: `sandbox-dispatch:${upperMethod}`,
      requiredScopes: methodScope(
        "dispatch:read",
        "dispatch:write",
        upperMethod,
      ),
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Sandbox dispatch gate management",
    };
  }

  if (routePath === "service-area/definitions" || routePath === "service-area/geojson") {
    return {
      routeKey: `service-area:read:${upperMethod}`,
      requiredScopes: ["dispatch:read"],
      allowedRealms: baseAllowedRealms("platform", "ops", "tenant"),
      description: "Service-area operational read access",
    };
  }

  if (routePath === "service-area/evaluate") {
    return {
      routeKey: "service-area:evaluate",
      requiredScopes: ["dispatch:write"],
      allowedRealms: baseAllowedRealms("platform", "ops", "tenant"),
      description: "Service-area evaluation",
    };
  }

  if (
    routePath === "service-area/admin/geojson" ||
    routePath.startsWith("service-area/admin/service-areas") ||
    routePath.startsWith("service-area/admin/stop-policies")
  ) {
    return {
      routeKey: `service-area:admin:${upperMethod}`,
      requiredScopes: methodScope(
        "foundation:read",
        "foundation:write",
        upperMethod,
      ),
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Service-area governance administration",
    };
  }

  if (routePath.startsWith("shift-attendance/")) {
    return {
      routeKey: `shift-attendance:${upperMethod}`,
      requiredScopes: methodScope("driver:read", "driver:write", upperMethod),
      allowedRealms: baseAllowedRealms("ops", "driver"),
      description: "Shift attendance access",
    };
  }

  if (routePath.startsWith("tesla-integration/")) {
    return {
      routeKey: `tesla-integration:${upperMethod}`,
      requiredScopes: methodScope("driver:read", "driver:write", upperMethod),
      allowedRealms: baseAllowedRealms("platform", "ops", "driver"),
      description: "Tesla integration control surfaces",
    };
  }

  if (
    routePath === "driver-fee-plans" ||
    routePath === "driver-fee-plans/publish" ||
    routePath.startsWith("driver-statements") ||
    routePath === "settlement/invoices" ||
    routePath === "settlement/matrix" ||
    routePath.startsWith("settlement/reconciliation-issues") ||
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

  if (routePath.startsWith("payment-exceptions/")) {
    const isActionRoute = routePath.includes("/actions/");
    return {
      routeKey: isActionRoute
        ? `payment-exceptions:actions:${upperMethod}`
        : `payment-exceptions:${upperMethod}`,
      requiredScopes: isActionRoute ? ["billing:write"] : ["billing:read"],
      allowedRealms: isActionRoute
        ? baseAllowedRealms("platform")
        : baseAllowedRealms("platform", "ops"),
      description: isActionRoute
        ? "Payment exception recovery operations"
        : "Payment exception read access",
    };
  }

  if (routePath.startsWith("vehicle-evidence/")) {
    let requiredScopes: string[];
    if (
      routePath === "vehicle-evidence/segments" ||
      routePath === "vehicle-evidence/bookmarks"
    ) {
      requiredScopes =
        upperMethod === "GET"
          ? ["sandbox.evidence.preview"]
          : ["sandbox.investigation.manage"];
    } else if (
      routePath === "vehicle-evidence/recorders" ||
      routePath.startsWith("vehicle-evidence/recorders/")
    ) {
      requiredScopes = upperMethod === "GET"
        ? ["sandbox.compliance.read"]
        : ["sandbox.compliance.manage"];
    } else if (routePath.startsWith("vehicle-evidence/signals/")) {
      requiredScopes = ["sandbox.compliance.read"];
    } else {
      requiredScopes = ["sandbox.investigation.manage"];
    }

    return {
      routeKey: `vehicle-evidence:${upperMethod}`,
      requiredScopes,
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Vehicle evidence governance and recorder operations",
    };
  }

  if (routePath.startsWith("admin/flags")) {
    return {
      routeKey: `admin:flags:${upperMethod}`,
      requiredScopes: methodScope(
        "foundation:read",
        "foundation:write",
        upperMethod,
      ),
      allowedRealms: baseAllowedRealms("platform", "ops"),
      description: "Feature-flag administration",
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

  return null;
}
