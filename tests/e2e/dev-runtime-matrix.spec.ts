import { expect, test, type APIResponse } from "@playwright/test";

function readPositiveIntEnv(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const TARGET_CASE_COUNT = readPositiveIntEnv(
  process.env.DRTS_DEV_RUNTIME_MATRIX_CASE_COUNT,
  3_000,
);

const skippedRuntimeSurfaces = [] as const;

type RuntimeSurfaceKey =
  | "api"
  | "bank-console-web"
  | "channel-partner-portal-web"
  | "enterprise-dispatch-web"
  | "partner-booking-web"
  | "platform-admin-web"
  | "referral-embed-web"
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

const enterpriseActors: ActorProfile[] = [
  {
    key: "enterprise-employee",
    role: "enterprise_employee",
    tenant: "hongshuo",
  },
  {
    key: "enterprise-delegate",
    role: "enterprise_delegate",
    tenant: "hongshuo",
  },
  {
    key: "enterprise-approver",
    role: "enterprise_approver",
    tenant: "hongshuo",
  },
  {
    key: "enterprise-finance-viewer",
    role: "enterprise_finance_viewer",
    tenant: "hongshuo",
  },
];

const bankActors: ActorProfile[] = [
  {
    key: "bank-program-admin",
    role: "bank_program_admin",
    tenant: "tenant-ctbc-001",
  },
];

const partnerBookingActors: ActorProfile[] = [
  { key: "partner-booking-visitor", role: "partner_booking_visitor" },
];

const channelPartnerActors: ActorProfile[] = [
  {
    key: "channel-partner-admin",
    role: "channel_partner_admin",
    tenant: "referral-demo-community",
  },
  {
    key: "channel-partner-finance",
    role: "channel_partner_finance",
    tenant: "referral-demo-community",
  },
  {
    key: "channel-partner-viewer",
    role: "channel_partner_viewer",
    tenant: "referral-demo-community",
  },
];

const referralEmbedActors: ActorProfile[] = [
  {
    key: "referral-rider",
    role: "referral_rider",
    tenant: "referral-demo-community",
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
const enterpriseMarker =
  /企業派車|鴻碩科技|建立預約|我的預約|成本中心|身分交付/i;
const channelPartnerMarker =
  /Channel Dashboard|渠道總覽|Referral Statements|分潤對帳單|Usage|用量明細/i;
const referralEmbedMarker =
  /社區叫車|Referral Embed|轉介嵌入前台|\/embed\/referral-demo-community/i;
const referralEmbedEntrySlug =
  process.env.DRTS_REFERRAL_EMBED_ENTRY_SLUG ?? "referral-demo-community";

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
    key: "bank-console-web",
    family: "issuer bank management console",
    baseUrl:
      process.env.DRTS_DEV_BANK_CONSOLE_BASE_URL ??
      "https://drts-dev-bank-console-web-waji3fer3a-uc.a.run.app",
    actors: bankActors,
    routes: [
      {
        key: "home",
        path: "/?bank=ctbc",
        operation: "issuer dashboard",
        marker: /發卡行工作面|本期訂單|禮遇配額/i,
      },
      {
        key: "bookings",
        path: "/bookings?bank=ctbc",
        operation: "issuer booking list",
        marker: /發卡行訂單工作面|卡友訂單|唯讀履約視圖/i,
      },
      {
        key: "booking-detail",
        path: "/bookings/ord_ctbc_240611_01?bank=ctbc",
        operation: "issuer booking detail",
        marker: /訂單詳情|機場履約|BK-240611-018/i,
      },
      {
        key: "users",
        path: "/users?bank=cathay",
        operation: "issuer user governance",
        marker: /人員與角色|program_admin|使用者 Email/i,
      },
      {
        key: "programs",
        path: "/programs?bank=ctbc",
        operation: "issuer benefit programs",
        marker: /方案與配額|禮遇|本月需關注/i,
      },
      {
        key: "contracts",
        path: "/contracts?bank=ctbc",
        operation: "issuer contract registry",
        marker: /合約與 SLA|服務水準|合約/i,
      },
      {
        key: "statement",
        path: "/statements/2026-06?bank=fubon",
        operation: "issuer statement detail",
        marker: /結算對帳單|對帳|STM-FUBON/i,
      },
      {
        key: "audit",
        path: "/audit?bank=ctbc",
        operation: "issuer audit trail",
        marker: /稽核|Audit|事件/i,
      },
    ],
  },
  {
    key: "partner-booking-web",
    family: "partner white-label booking surface",
    baseUrl:
      process.env.DRTS_DEV_PARTNER_BOOKING_BASE_URL ??
      "https://drts-dev-partner-booking-web-waji3fer3a-uc.a.run.app",
    actors: partnerBookingActors,
    routes: [
      {
        key: "card-site",
        path: "/ctbc/program/site",
        operation: "credit-card website booking",
        marker: /世界卡禮賓|全年 12 趟免費接送|機場接送禮遇/i,
      },
      {
        key: "card-embed",
        path: "/ctbc/program/embed",
        operation: "credit-card bank-app embed handoff",
        marker: /未偵測到銀行登入|no_embed_session|Bank sign-in not detected/i,
      },
      {
        key: "card-embed-reauth",
        path: "/ctbc/program/embed/reauth",
        operation: "credit-card bank-app embed reauth",
        marker: /issuer_session expired|token_expired|ref_token stale/i,
      },
      {
        key: "card-embed-unsupported",
        path: "/ctbc/program/embed/embed-unsupported",
        operation: "credit-card bank-app embed unsupported host",
        marker: /unknown-host\.example|unsupported host|不受支援/i,
      },
      {
        key: "insurance-review",
        path: "/fubon/program/site/review",
        operation: "insurance replacement mobility review",
        marker: /保險理賠代步|理賠額度|下單前確認/i,
      },
      {
        key: "insurance-pending",
        path: "/fubon/program/site/insurance_pending",
        operation: "insurance pending eligibility block",
        marker: /insurance_pending|理賠審核中|理賠額度/i,
      },
      {
        key: "travel-manual-review",
        path: "/lion/program/site/manual-review",
        operation: "travel group transfer manual review",
        marker: /旅行社團體接送|manual_review|團體席次/i,
      },
      {
        key: "travel-site",
        path: "/lion/program/site",
        operation: "travel group transfer website booking",
        marker: /旅行社團體接送|團體席次|雄獅旅遊/i,
      },
    ],
  },
  {
    key: "enterprise-dispatch-web",
    family: "enterprise dispatch self-service",
    baseUrl:
      process.env.DRTS_DEV_ENTERPRISE_DISPATCH_BASE_URL ??
      "https://drts-dev-enterprise-dispatch-web-waji3fer3a-uc.a.run.app",
    actors: enterpriseActors,
    routes: [
      {
        key: "home",
        path: "/",
        operation: "employee dispatch landing",
        marker: enterpriseMarker,
      },
      {
        key: "bookings",
        path: "/bookings",
        operation: "employee booking list",
        marker: enterpriseMarker,
      },
      {
        key: "booking-new",
        path: "/bookings/new",
        operation: "employee booking create",
        marker: enterpriseMarker,
      },
      {
        key: "booking-review",
        path: "/bookings/review",
        operation: "booking responsibility review",
        marker: enterpriseMarker,
      },
      {
        key: "booking-submitted",
        path: "/bookings/submitted",
        operation: "booking command accepted",
        marker: enterpriseMarker,
      },
      {
        key: "booking-detail",
        path: "/bookings/EB-7K2E1D",
        operation: "booking detail",
        marker: enterpriseMarker,
      },
      {
        key: "trip",
        path: "/trip",
        operation: "active trip status",
        marker: enterpriseMarker,
      },
      {
        key: "receipt",
        path: "/receipts/EB-7K28Z2",
        operation: "receipt view",
        marker: enterpriseMarker,
      },
      {
        key: "help",
        path: "/help",
        operation: "employee support",
        marker: enterpriseMarker,
      },
      {
        key: "auth-required",
        path: "/auth-required",
        operation: "auth gate",
        marker: enterpriseMarker,
      },
      {
        key: "quota-blocked",
        path: "/quota-blocked",
        operation: "quota gate",
        marker: enterpriseMarker,
      },
      {
        key: "embed",
        path: "/embed",
        operation: "embedded identity handoff",
        marker: enterpriseMarker,
      },
      {
        key: "embed-unsupported",
        path: "/embed/unsupported-host",
        operation: "embedded unsupported host",
        marker: enterpriseMarker,
      },
    ],
  },
  {
    key: "channel-partner-portal-web",
    family: "referral channel partner self-service",
    baseUrl:
      process.env.DRTS_DEV_CHANNEL_PARTNER_PORTAL_BASE_URL ??
      "https://drts-dev-channel-partner-portal-web-waji3fer3a-uc.a.run.app",
    actors: channelPartnerActors,
    routes: [
      {
        key: "dashboard",
        path: "/dashboard",
        operation: "channel dashboard",
        marker: channelPartnerMarker,
      },
      {
        key: "usage",
        path: "/usage",
        operation: "referral usage detail",
        marker: channelPartnerMarker,
      },
      {
        key: "statements",
        path: "/statements",
        operation: "referral statements",
        marker: channelPartnerMarker,
      },
    ],
  },
  {
    key: "referral-embed-web",
    family: "partner-scoped referral embed front",
    baseUrl:
      process.env.DRTS_DEV_REFERRAL_EMBED_BASE_URL ??
      "https://drts-dev-referral-embed-web-waji3fer3a-uc.a.run.app",
    actors: referralEmbedActors,
    routes: [
      {
        key: "root",
        path: "/",
        operation: "referral root redirects to canonical partner entry",
        marker: referralEmbedMarker,
      },
      {
        key: "entry",
        path: `/embed/${referralEmbedEntrySlug}`,
        operation: "partner-scoped referral entry",
        marker: referralEmbedMarker,
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

test.describe(`dev runtime ${TARGET_CASE_COUNT}-case end-to-end matrix`, () => {
  test.describe.configure({ mode: "parallel" });

  const matrixCases = buildCases();

  test(
    `matrix generation covers exactly ${TARGET_CASE_COUNT} non-excluded cases`,
    async () => {
    expect(matrixCases).toHaveLength(TARGET_CASE_COUNT);
    expect(
      matrixCases.some((item) =>
        skippedRuntimeSurfaces.includes(
          item.surface.key as (typeof skippedRuntimeSurfaces)[number],
        ),
      ),
    ).toBe(false);
    },
  );

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
