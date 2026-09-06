import { describe, expect, it } from "vitest";

/**
 * SR-PUBLIC-001: 公開入口／callback／版本清單修復準備
 * 規範與不變量測試：驗證 9 個正式公開入口架構契約、防污染邊界及版本真值映射
 */

interface PublicEndpointDefinition {
  id: string;
  subdomain: string;
  cloudRunService: string;
  category: "admin" | "operations" | "partner" | "enterprise" | "bank" | "channel" | "tenant" | "passenger" | "api";
  targetPath: string;
  authRequired: boolean;
  expectedStatusCodes: number[];
}

interface RetiredDomainDefinition {
  subdomain: string;
  service: string;
  policyStatus: "retired" | "paused";
  reason: string;
}

const AUTHORITATIVE_ACTIVE_ENDPOINTS: PublicEndpointDefinition[] = [
  {
    id: "entry-fleets",
    subdomain: "fleets.smarttransport.tw",
    cloudRunService: "drts-dev-platform-admin-web",
    category: "admin",
    targetPath: "/",
    authRequired: true,
    expectedStatusCodes: [200, 307],
  },
  {
    id: "entry-ops",
    subdomain: "ops.smarttransport.tw",
    cloudRunService: "drts-dev-ops-console-web",
    category: "operations",
    targetPath: "/",
    authRequired: true,
    expectedStatusCodes: [200, 307],
  },
  {
    id: "entry-partners",
    subdomain: "partners.smarttransport.tw",
    cloudRunService: "drts-dev-fleet-partner-portal-web",
    category: "partner",
    targetPath: "/",
    authRequired: true,
    expectedStatusCodes: [200, 307],
  },
  {
    id: "entry-dispatch",
    subdomain: "dispatch.smarttransport.tw",
    cloudRunService: "drts-dev-enterprise-dispatch-web",
    category: "enterprise",
    targetPath: "/",
    authRequired: false,
    expectedStatusCodes: [200, 307],
  },
  {
    id: "entry-bank",
    subdomain: "bank.smarttransport.tw",
    cloudRunService: "drts-dev-bank-console-web",
    category: "bank",
    targetPath: "/",
    authRequired: false,
    expectedStatusCodes: [200, 307],
  },
  {
    id: "entry-channel",
    subdomain: "channel.smarttransport.tw",
    cloudRunService: "drts-channel-partner-portal-web",
    category: "channel",
    targetPath: "/",
    authRequired: true,
    expectedStatusCodes: [200, 307],
  },
  {
    id: "entry-tenant",
    subdomain: "tenant.smarttransport.tw",
    cloudRunService: "drts-dev-tenant-console-web",
    category: "tenant",
    targetPath: "/",
    authRequired: true,
    expectedStatusCodes: [200, 307],
  },
  {
    id: "entry-refer",
    subdomain: "refer.smarttransport.tw",
    cloudRunService: "drts-dev-referral-embed-web",
    category: "passenger",
    targetPath: "/embed/yuhe-residence",
    authRequired: false,
    expectedStatusCodes: [200],
  },
  {
    id: "entry-api",
    subdomain: "api.smarttransport.tw",
    cloudRunService: "drts-dev-api",
    category: "api",
    targetPath: "/api/health",
    authRequired: false,
    expectedStatusCodes: [200],
  },
];

const RETIRED_OR_PAUSED_DOMAINS: RetiredDomainDefinition[] = [
  {
    subdomain: "book.smarttransport.tw",
    service: "drts-dev-partner-booking-web",
    policyStatus: "paused",
    reason: "Partner Booking paused since 2026-08-01",
  },
  {
    subdomain: "ride.smarttransport.tw",
    service: "passenger-web",
    policyStatus: "retired",
    reason: "Standalone passenger-web retired 2026-06-16",
  },
  {
    subdomain: "concierge.smarttransport.tw",
    service: "concierge-portal-web",
    policyStatus: "retired",
    reason: "Concierge portal web retired 2026-06-16",
  },
];

const KNOWN_CLOUD_RUN_SUFFIXES = {
  active: "lyo6ra57fq-uc.a.run.app",
  staleDocumentation: "4t7rg6fmeq-uc.a.run.app",
};

const STALE_DNS_A_RECORD = "8.233.119.14";
const CANONICAL_CNAME_TARGET = "ghs.googlehosted.com.";

describe("SR-PUBLIC-001: Public Endpoints Architecture Registry", () => {
  it("contains exactly 9 authoritative active entries", () => {
    expect(AUTHORITATIVE_ACTIVE_ENDPOINTS).toHaveLength(9);
    const subdomains = AUTHORITATIVE_ACTIVE_ENDPOINTS.map((e) => e.subdomain);
    expect(new Set(subdomains).size).toBe(9);
  });

  it("maps each active entry to a valid, unique Cloud Run service", () => {
    const services = AUTHORITATIVE_ACTIVE_ENDPOINTS.map((e) => e.cloudRunService);
    expect(new Set(services).size).toBe(9);
    for (const service of services) {
      expect(service).toMatch(/^(drts-dev-[a-z0-9-]+|drts-channel-partner-portal-web)$/);
    }
  });

  it("strictly separates active surface from retired and paused domains", () => {
    const activeSubdomains = new Set(AUTHORITATIVE_ACTIVE_ENDPOINTS.map((e) => e.subdomain));
    for (const retired of RETIRED_OR_PAUSED_DOMAINS) {
      expect(activeSubdomains.has(retired.subdomain)).toBe(false);
      expect(activeSubdomains).not.toContain(retired.subdomain);
    }
  });

  it("enforces referral embed formal entry path /embed/yuhe-residence", () => {
    const refer = AUTHORITATIVE_ACTIVE_ENDPOINTS.find((e) => e.id === "entry-refer");
    expect(refer).toBeDefined();
    expect(refer?.targetPath).toBe("/embed/yuhe-residence");
    expect(refer?.cloudRunService).toBe("drts-dev-referral-embed-web");
  });

  it("enforces api health check path /api/health", () => {
    const api = AUTHORITATIVE_ACTIVE_ENDPOINTS.find((e) => e.id === "entry-api");
    expect(api).toBeDefined();
    expect(api?.targetPath).toBe("/api/health");
    expect(api?.cloudRunService).toBe("drts-dev-api");
  });
});

describe("SR-PUBLIC-001: Layered Diagnostics & Defect Classification", () => {
  it("identifies DNS Layer root cause: stale A record 8.233.119.14 vs CNAME ghs.googlehosted.com.", () => {
    const staleA = STALE_DNS_A_RECORD;
    const cnameTarget = CANONICAL_CNAME_TARGET;

    expect(staleA).toBe("8.233.119.14");
    expect(cnameTarget).toBe("ghs.googlehosted.com.");

    // Evaluation helper
    const classifyDns = (observedA: string[], observedCname: string | null) => {
      if (observedA.includes(STALE_DNS_A_RECORD)) {
        return "DEFECT_STALE_A_RECORD";
      }
      if (observedCname?.includes("googlehosted.com")) {
        return "HEALTHY_CNAME";
      }
      return "UNKNOWN_CONFIG";
    };

    expect(classifyDns([STALE_DNS_A_RECORD], null)).toBe("DEFECT_STALE_A_RECORD");
    expect(classifyDns([], "ghs.googlehosted.com")).toBe("HEALTHY_CNAME");
  });

  it("classifies R01 TLS failure (curl exit code 35 / SSL syscall error)", () => {
    const classifyTlsStatus = (exitCode: number, errorMsg: string) => {
      if (exitCode === 35 || errorMsg.includes("SSL_ERROR_SYSCALL")) {
        return "R01_TLS_CONNECTION_CLOSED";
      }
      if (exitCode === 0) {
        return "TLS_HANDSHAKE_OK";
      }
      return "OTHER_ERROR";
    };

    expect(classifyTlsStatus(35, "OpenSSL SSL_connect: SSL_ERROR_SYSCALL")).toBe("R01_TLS_CONNECTION_CLOSED");
    expect(classifyTlsStatus(0, "")).toBe("TLS_HANDSHAKE_OK");
  });

  it("classifies R29 Cloud Run URL drift: 4t7rg6fmeq (stale 404) vs lyo6ra57fq (active healthy)", () => {
    expect(KNOWN_CLOUD_RUN_SUFFIXES.active).toBe("lyo6ra57fq-uc.a.run.app");
    expect(KNOWN_CLOUD_RUN_SUFFIXES.staleDocumentation).toBe("4t7rg6fmeq-uc.a.run.app");

    const classifyCloudRunUrl = (url: string, httpStatus: number) => {
      if (url.includes(KNOWN_CLOUD_RUN_SUFFIXES.staleDocumentation)) {
        return httpStatus === 404 ? "R29_STALE_DOCUMENTATION_URL_DEAD" : "UNEXPECTED_STALE_ALIVE";
      }
      if (url.includes(KNOWN_CLOUD_RUN_SUFFIXES.active)) {
        return [200, 307].includes(httpStatus) ? "ACTIVE_DEPLOYMENT_HEALTHY" : "ACTIVE_DEPLOYMENT_UNHEALTHY";
      }
      return "UNKNOWN_SUFFIX";
    };

    expect(classifyCloudRunUrl("https://drts-dev-api-4t7rg6fmeq-uc.a.run.app/api/health", 404)).toBe(
      "R29_STALE_DOCUMENTATION_URL_DEAD",
    );
    expect(classifyCloudRunUrl("https://drts-dev-api-lyo6ra57fq-uc.a.run.app/api/health", 200)).toBe(
      "ACTIVE_DEPLOYMENT_HEALTHY",
    );
  });
});
