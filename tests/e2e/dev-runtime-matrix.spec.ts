import { expect, test, type APIResponse } from "@playwright/test";

const TARGET_CASE_COUNT = 3_000;

const skippedRuntimeSurfaces = [
  "bank-console-web",
  "partner-booking-web",
] as const;

type RuntimeSurfaceKey =
  | "api"
  | "platform-admin-web"
  | "ops-console-web"
  | "fleet-partner-portal-web"
  | "tenant-console-web";

type LocaleKey = "zh-TW" | "en-US";
type DeviceKey = "desktop" | "tablet" | "mobile";

type ActorProfile = {
  key: string;
  role: string;
  tenant?: string;
};

type QueryIntent = {
  key: string;
  params: Record<string, string>;
};

type RouteSpec = {
  key: string;
  path: string;
  operation: string;
  marker: RegExp;
};

type RuntimeSurface = {
  key: RuntimeSurfaceKey;
  baseUrl: string;
  family: string;
  routes: RouteSpec[];
  actors: ActorProfile[];
};

type MatrixCase = {
  id: string;
  title: string;
  surface: RuntimeSurface;
  route: RouteSpec;
  actor: ActorProfile;
  locale: LocaleKey;
  device: DeviceKey;
  intent: QueryIntent;
};

const userAgents: Record<DeviceKey, string> = {
  desktop:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 DRTS-E2E",
  tablet:
    "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 " +
    "(KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1 DRTS-E2E",
  mobile:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 " +
    "(KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1 DRTS-E2E",
};

const locales: LocaleKey[] = ["zh-TW", "en-US"];
const devices: DeviceKey[] = ["desktop", "tablet", "mobile"];

const queryIntents: QueryIntent[] = [
  { key: "default-open", params: { intent: "default" } },
  { key: "search-demo", params: { q: "demo", intent: "search" } },
  { key: "filtered-open", params: { status: "open", intent: "filter" } },
  { key: "review-queue", params: { tab: "review", intent: "review" } },
  {
    key: "billing-period",
    params: { period: "2026-06", intent: "billing" },
  },
  { key: "export-context", params: { export: "preview", intent: "export" } },
  { key: "freshness-live", params: { freshness: "live", intent: "freshness" } },
  {
    key: "deeplink-return",
    params: { source: "dev-runtime-matrix", intent: "deeplink" },
  },
];

const platformActors: ActorProfile[] = [
  { key: "platform-admin", role: "platform_admin" },
  { key: "platform-ops", role: "platform_ops" },
  { key: "platform-finance", role: "platform_finance" },
  { key: "platform-compliance", role: "platform_compliance" },
  { key: "platform-support", role: "platform_support" },
  { key: "platform-viewer", role: "platform_viewer" },
];

const opsActors: ActorProfile[] = [
  { key: "ops-dispatcher", role: "ops_dispatcher" },
  { key: "ops-supervisor", role: "ops_supervisor" },
  { key: "ops-callcenter", role: "ops_callcenter" },
  { key: "ops-incident", role: "ops_incident_manager" },
  { key: "ops-finance", role: "ops_finance_reviewer" },
  { key: "ops-maintenance", role: "ops_maintenance" },
  { key: "ops-readonly", role: "ops_viewer" },
];

const fleetActors: ActorProfile[] = [
  { key: "fleet-owner", role: "fleet_owner", tenant: "metro-fleet" },
  { key: "fleet-dispatch", role: "fleet_dispatch", tenant: "metro-fleet" },
  { key: "fleet-finance", role: "fleet_finance", tenant: "metro-fleet" },
  { key: "fleet-compliance", role: "fleet_compliance", tenant: "metro-fleet" },
  { key: "fleet-viewer", role: "fleet_viewer", tenant: "metro-fleet" },
];

const tenantActors: ActorProfile[] = [
  { key: "tenant-admin", role: "tenant_admin", tenant: "tenant-demo-001" },
  {
    key: "tenant-operator",
    role: "tenant_operator",
    tenant: "tenant-demo-001",
  },
  { key: "tenant-finance", role: "tenant_finance", tenant: "tenant-demo-001" },
  {
    key: "tenant-approver",
    role: "tenant_approver",
    tenant: "tenant-demo-001",
  },
  { key: "tenant-viewer", role: "tenant_viewer", tenant: "tenant-demo-001" },
  {
    key: "tenant-api-owner",
    role: "tenant_api_owner",
    tenant: "tenant-demo-001",
  },
];

const apiActors: ActorProfile[] = [
  { key: "api-smoke", role: "runtime_smoke" },
  { key: "api-observer", role: "runtime_observer" },
];

const platformMarker = /DRTS 平台管理|Platform|平台管理|租戶|稽核|健康/i;
const opsMarker = /Operations Console|營運控制台|派車調度|營運總覽|客服中心/i;
const fleetMarker = /Fleet Partner Portal|車行夥伴入口|車行營運總覽|分潤/i;
const tenantMarker = /租戶後台|Tenant|訂單|工作面|帳務概覽/i;

const surfaces: RuntimeSurface[] = [
  {
    key: "api",
    family: "runtime-api-health",
    baseUrl:
      process.env.DRTS_DEV_API_BASE_URL ??
      "https://drts-dev-api-waji3fer3a-uc.a.run.app",
    actors: apiActors,
    routes: [
      {
        key: "health",
        path: "/health",
        operation: "service health contract",
        marker: /"status"\s*:\s*"ok"/i,
      },
    ],
  },
  {
    key: "platform-admin-web",
    family: "platform governance",
    baseUrl:
      process.env.DRTS_DEV_PLATFORM_ADMIN_BASE_URL ??
      "https://drts-dev-platform-admin-web-waji3fer3a-uc.a.run.app",
    actors: platformActors,
    routes: [
      {
        key: "home",
        path: "/",
        operation: "governance landing",
        marker: platformMarker,
      },
      {
        key: "tenants",
        path: "/tenants",
        operation: "tenant lifecycle",
        marker: platformMarker,
      },
      {
        key: "tenant-governance",
        path: "/tenant-governance",
        operation: "tenant governance rules",
        marker: platformMarker,
      },
      {
        key: "partners",
        path: "/partners",
        operation: "partner governance",
        marker: platformMarker,
      },
      {
        key: "fleet-partners",
        path: "/fleet-partners",
        operation: "fleet partner registry",
        marker: platformMarker,
      },
      {
        key: "fleet",
        path: "/fleet",
        operation: "fleet compliance",
        marker: platformMarker,
      },
      {
        key: "vehicle-eligibility",
        path: "/vehicle-eligibility",
        operation: "vehicle eligibility matrix",
        marker: platformMarker,
      },
      {
        key: "service-products",
        path: "/service-products",
        operation: "service product catalog",
        marker: platformMarker,
      },
      {
        key: "pricing",
        path: "/pricing",
        operation: "pricing governance",
        marker: platformMarker,
      },
      {
        key: "payments",
        path: "/payments",
        operation: "settlement control",
        marker: platformMarker,
      },
      {
        key: "reimbursements",
        path: "/payments/reimbursements",
        operation: "reimbursement batch review",
        marker: platformMarker,
      },
      {
        key: "adapter-registry",
        path: "/adapter-registry",
        operation: "adapter readiness",
        marker: platformMarker,
      },
      {
        key: "health",
        path: "/health",
        operation: "platform health",
        marker: platformMarker,
      },
      {
        key: "notices",
        path: "/notices",
        operation: "maintenance notices",
        marker: platformMarker,
      },
      {
        key: "audit",
        path: "/audit",
        operation: "audit evidence",
        marker: platformMarker,
      },
      {
        key: "feature-flags",
        path: "/feature-flags",
        operation: "feature flag governance",
        marker: platformMarker,
      },
      {
        key: "users",
        path: "/users",
        operation: "platform user governance",
        marker: platformMarker,
      },
      {
        key: "switchboard",
        path: "/switchboard",
        operation: "cross-app switchboard",
        marker: platformMarker,
      },
    ],
  },
  {
    key: "ops-console-web",
    family: "operations control",
    baseUrl:
      process.env.DRTS_DEV_OPS_CONSOLE_BASE_URL ??
      "https://drts-dev-ops-console-web-waji3fer3a-uc.a.run.app",
    actors: opsActors,
    routes: [
      {
        key: "home",
        path: "/",
        operation: "ops landing redirect",
        marker: opsMarker,
      },
      {
        key: "dashboard",
        path: "/dashboard",
        operation: "ops dashboard",
        marker: opsMarker,
      },
      {
        key: "dispatch",
        path: "/dispatch",
        operation: "dispatch queue",
        marker: opsMarker,
      },
      {
        key: "dispatch-detail",
        path: "/dispatch/OPS-SMOKE-DISPATCH",
        operation: "dispatch detail",
        marker: opsMarker,
      },
      {
        key: "callcenter",
        path: "/callcenter",
        operation: "call center session",
        marker: opsMarker,
      },
      {
        key: "complaints",
        path: "/complaints",
        operation: "complaint queue",
        marker: opsMarker,
      },
      {
        key: "complaint-detail",
        path: "/complaints/CMP-0908",
        operation: "complaint detail",
        marker: opsMarker,
      },
      {
        key: "incidents",
        path: "/incidents",
        operation: "incident queue",
        marker: opsMarker,
      },
      {
        key: "incident-detail",
        path: "/incidents/OPS-SMOKE-INCIDENT",
        operation: "incident detail",
        marker: opsMarker,
      },
      {
        key: "approval-requests",
        path: "/approval-requests",
        operation: "approval override queue",
        marker: opsMarker,
      },
      {
        key: "reports",
        path: "/reports",
        operation: "reporting and filing",
        marker: opsMarker,
      },
      {
        key: "revenue",
        path: "/revenue",
        operation: "revenue mirror",
        marker: opsMarker,
      },
      {
        key: "attendance",
        path: "/attendance",
        operation: "shift attendance",
        marker: opsMarker,
      },
      {
        key: "maintenance",
        path: "/maintenance",
        operation: "maintenance queue",
        marker: opsMarker,
      },
      {
        key: "drivers",
        path: "/drivers",
        operation: "driver registry",
        marker: opsMarker,
      },
      {
        key: "driver-detail",
        path: "/drivers/DRV-001",
        operation: "driver detail",
        marker: opsMarker,
      },
      {
        key: "vehicles",
        path: "/vehicles",
        operation: "vehicle registry",
        marker: opsMarker,
      },
      {
        key: "vehicle-detail",
        path: "/vehicles/VEH-001",
        operation: "vehicle detail",
        marker: opsMarker,
      },
      {
        key: "contracts",
        path: "/contracts",
        operation: "contract registry mirror",
        marker: opsMarker,
      },
      {
        key: "contract-detail",
        path: "/contracts/CTR-310",
        operation: "contract detail mirror",
        marker: opsMarker,
      },
      {
        key: "feature-flags",
        path: "/feature-flags",
        operation: "feature flag mirror",
        marker: opsMarker,
      },
    ],
  },
  {
    key: "fleet-partner-portal-web",
    family: "fleet partner operations",
    baseUrl:
      process.env.DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL ??
      "https://drts-dev-fleet-partner-portal-web-waji3fer3a-uc.a.run.app",
    actors: fleetActors,
    routes: [
      {
        key: "home",
        path: "/",
        operation: "fleet landing redirect",
        marker: fleetMarker,
      },
      {
        key: "dashboard",
        path: "/dashboard",
        operation: "fleet dashboard",
        marker: fleetMarker,
      },
      {
        key: "drivers",
        path: "/drivers",
        operation: "driver supply",
        marker: fleetMarker,
      },
      {
        key: "vehicles",
        path: "/vehicles",
        operation: "vehicle supply",
        marker: fleetMarker,
      },
      {
        key: "trips",
        path: "/trips",
        operation: "trip ledger",
        marker: fleetMarker,
      },
      {
        key: "revenue",
        path: "/revenue",
        operation: "revenue share",
        marker: fleetMarker,
      },
      {
        key: "statements",
        path: "/statements",
        operation: "statement review",
        marker: fleetMarker,
      },
      {
        key: "documents",
        path: "/documents",
        operation: "document compliance",
        marker: fleetMarker,
      },
      {
        key: "training",
        path: "/training",
        operation: "training compliance",
        marker: fleetMarker,
      },
      {
        key: "cases",
        path: "/cases",
        operation: "incident complaint cases",
        marker: fleetMarker,
      },
      {
        key: "quality",
        path: "/quality",
        operation: "quality scorecard",
        marker: fleetMarker,
      },
    ],
  },
  {
    key: "tenant-console-web",
    family: "enterprise dispatch tenant operations",
    baseUrl:
      process.env.DRTS_DEV_TENANT_CONSOLE_BASE_URL ??
      "https://drts-dev-tenant-console-web-waji3fer3a-uc.a.run.app",
    actors: tenantActors,
    routes: [
      {
        key: "home",
        path: "/",
        operation: "tenant dashboard",
        marker: tenantMarker,
      },
      {
        key: "bookings",
        path: "/bookings",
        operation: "booking list",
        marker: tenantMarker,
      },
      {
        key: "booking-new",
        path: "/bookings/new",
        operation: "create booking",
        marker: tenantMarker,
      },
      {
        key: "passengers",
        path: "/passengers",
        operation: "passenger directory",
        marker: tenantMarker,
      },
      {
        key: "addresses",
        path: "/addresses",
        operation: "address book",
        marker: tenantMarker,
      },
      {
        key: "cost-centers",
        path: "/cost-centers",
        operation: "cost center governance",
        marker: tenantMarker,
      },
      {
        key: "rules",
        path: "/rules",
        operation: "approval and quota rules",
        marker: tenantMarker,
      },
      {
        key: "users",
        path: "/users",
        operation: "tenant user management",
        marker: tenantMarker,
      },
      {
        key: "notifications",
        path: "/notifications",
        operation: "notification preferences",
        marker: tenantMarker,
      },
      {
        key: "sla",
        path: "/sla",
        operation: "SLA profile",
        marker: tenantMarker,
      },
      {
        key: "billing",
        path: "/billing",
        operation: "billing overview",
        marker: tenantMarker,
      },
      {
        key: "invoices",
        path: "/invoices",
        operation: "invoice history",
        marker: tenantMarker,
      },
      {
        key: "reports",
        path: "/reports",
        operation: "tenant reporting",
        marker: tenantMarker,
      },
      {
        key: "api-keys",
        path: "/api-keys",
        operation: "API key management",
        marker: tenantMarker,
      },
      {
        key: "webhooks",
        path: "/webhooks",
        operation: "webhook management",
        marker: tenantMarker,
      },
      {
        key: "integration-governance",
        path: "/integration-governance",
        operation: "integration governance",
        marker: tenantMarker,
      },
      {
        key: "feature-flags",
        path: "/feature-flags",
        operation: "tenant feature flags",
        marker: tenantMarker,
      },
      {
        key: "settings",
        path: "/settings",
        operation: "tenant settings",
        marker: tenantMarker,
      },
      {
        key: "audit",
        path: "/audit",
        operation: "tenant audit",
        marker: tenantMarker,
      },
    ],
  },
];

const crashMarkers = [
  /Application error/i,
  /Internal Server Error/i,
  /This page could not be found/i,
  /404: This page could not be found/i,
  /NEXT_NOT_FOUND/i,
  /Unhandled Runtime Error/i,
];

function buildCases(): MatrixCase[] {
  const perSurfaceCases = surfaces.map((surface) => {
    const items: MatrixCase[] = [];
    for (const route of surface.routes) {
      for (const actor of surface.actors) {
        for (const locale of locales) {
          for (const device of devices) {
            for (const intent of queryIntents) {
              const sequence = String(items.length + 1).padStart(4, "0");
              items.push({
                id: `${surface.key}-${route.key}-${actor.key}-${locale}-${device}-${intent.key}-${sequence}`,
                title: `${surface.key} ${route.key} ${actor.key} ${locale} ${device} ${intent.key}`,
                surface,
                route,
                actor,
                locale,
                device,
                intent,
              });
            }
          }
        }
      }
    }
    return items;
  });

  const selected: MatrixCase[] = [];
  let cursor = 0;
  while (selected.length < TARGET_CASE_COUNT) {
    let appended = false;
    for (const cases of perSurfaceCases) {
      const item = cases[cursor];
      if (item) {
        selected.push(item);
        appended = true;
        if (selected.length === TARGET_CASE_COUNT) {
          break;
        }
      }
    }
    if (!appended) {
      throw new Error(
        `Only generated ${selected.length} cases; expected ${TARGET_CASE_COUNT}.`,
      );
    }
    cursor += 1;
  }

  const ids = new Set(selected.map((item) => item.id));
  if (ids.size !== selected.length) {
    throw new Error(
      "Generated dev runtime matrix contains duplicate case IDs.",
    );
  }

  const selectedSurfaceKeys = new Set<string>(
    selected.map((item) => item.surface.key),
  );
  for (const skippedSurface of skippedRuntimeSurfaces) {
    if (selectedSurfaceKeys.has(skippedSurface)) {
      throw new Error(`Excluded surface leaked into matrix: ${skippedSurface}`);
    }
  }

  return selected;
}

function buildUrl(testCase: MatrixCase): string {
  const url = new URL(testCase.route.path, testCase.surface.baseUrl);
  url.searchParams.set("locale", testCase.locale);
  url.searchParams.set("actor", testCase.actor.key);
  url.searchParams.set("role", testCase.actor.role);
  url.searchParams.set("device", testCase.device);
  url.searchParams.set("e2eCase", testCase.id);
  if (testCase.actor.tenant) {
    url.searchParams.set("tenant", testCase.actor.tenant);
  }
  for (const [key, value] of Object.entries(testCase.intent.params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function responseKind(response: APIResponse): "json" | "html" | "other" {
  const contentType = response.headers()["content-type"] ?? "";
  if (contentType.includes("application/json")) {
    return "json";
  }
  if (contentType.includes("text/html")) {
    return "html";
  }
  return "other";
}

function visibleTextFromHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[^;]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

test.describe("dev runtime 3000-case end-to-end matrix", () => {
  test.describe.configure({ mode: "parallel" });

  const matrixCases = buildCases();

  test("matrix generation covers exactly 3000 non-excluded cases", async () => {
    expect(matrixCases).toHaveLength(TARGET_CASE_COUNT);
    expect(
      matrixCases.some((item) =>
        skippedRuntimeSurfaces.includes(
          item.surface.key as (typeof skippedRuntimeSurfaces)[number],
        ),
      ),
    ).toBe(false);
  });

  for (const [index, testCase] of matrixCases.entries()) {
    test(`${String(index + 1).padStart(4, "0")} ${testCase.title}`, async ({
      request,
    }) => {
      const response = await request.get(buildUrl(testCase), {
        headers: {
          "Accept-Language": testCase.locale,
          "User-Agent": userAgents[testCase.device],
          "X-DRTS-E2E-Actor": testCase.actor.key,
          "X-DRTS-E2E-Role": testCase.actor.role,
          "X-DRTS-E2E-Surface": testCase.surface.key,
          "X-DRTS-E2E-Operation": testCase.route.operation,
        },
        maxRedirects: 3,
      });

      expect(
        response.status(),
        `${testCase.id} ${testCase.surface.family} ${testCase.route.path}`,
      ).toBe(200);

      const kind = responseKind(response);
      const body = await response.text();

      if (testCase.surface.key === "api") {
        expect(kind).toBe("json");
        expect(body).toMatch(testCase.route.marker);
        return;
      }

      expect(kind).toBe("html");
      const visibleText = visibleTextFromHtml(body);
      for (const marker of crashMarkers) {
        expect(visibleText).not.toMatch(marker);
      }
      expect(visibleText).toMatch(testCase.route.marker);
    });
  }
});
