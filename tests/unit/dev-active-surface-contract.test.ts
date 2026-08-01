import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../..");

const expectedServices = {
  api: "drts-dev-api",
  "platform-admin-web": "drts-dev-platform-admin-web",
  "ops-console-web": "drts-dev-ops-console-web",
  "fleet-partner-portal-web": "drts-dev-fleet-partner-portal-web",
  "tenant-console-web": "drts-dev-tenant-console-web",
  "bank-console-web": "drts-dev-bank-console-web",
  "enterprise-dispatch-web": "drts-dev-enterprise-dispatch-web",
  "referral-embed-web": "drts-dev-referral-embed-web",
  "channel-partner-portal-web": "drts-channel-partner-portal-web",
} as const;

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function expectServiceDefaults(
  source: string,
  variableNames: Record<keyof typeof expectedServices, string>,
) {
  for (const [surface, service] of Object.entries(expectedServices)) {
    const variableName =
      variableNames[surface as keyof typeof expectedServices];
    expect(source).toContain(`\${${variableName}:-${service}}`);
  }
}

describe("dev active surface contract", () => {
  it("keeps deploy-dev fallback services aligned to the authoritative dev inventory", () => {
    const source = readRepoFile(".github/workflows/deploy-dev.yml");

    const workflowVariables = {
      api: "DEV_GCP_API_SERVICE",
      "platform-admin-web": "DEV_GCP_PLATFORM_ADMIN_SERVICE",
      "ops-console-web": "DEV_GCP_OPS_CONSOLE_SERVICE",
      "fleet-partner-portal-web": "DEV_GCP_FLEET_PARTNER_PORTAL_SERVICE",
      "tenant-console-web": "DEV_GCP_TENANT_CONSOLE_SERVICE",
      "bank-console-web": "DEV_GCP_BANK_CONSOLE_SERVICE",
      "enterprise-dispatch-web": "DEV_GCP_ENTERPRISE_DISPATCH_SERVICE",
      "referral-embed-web": "DEV_GCP_REFERRAL_EMBED_SERVICE",
      "channel-partner-portal-web": "DEV_GCP_CHANNEL_PARTNER_PORTAL_SERVICE",
    } as const;

    for (const [surface, service] of Object.entries(expectedServices)) {
      const variableName =
        workflowVariables[surface as keyof typeof workflowVariables];
      expect(source).toContain(`"${service}")`);
      expect(source).toContain(`\${${variableName}:-}`);
    }

    expect(source).not.toContain("drts-referral-embed-web");
    expect(source).not.toContain('"" "drts-api")');
    expect(source).not.toContain("concierge-portal-web");
    expect(
      source
        .split("\n")
        .filter((line) => line.includes("passenger-web"))
        .map((line) => line.trim()),
    ).toEqual([
      'description: "Fail-closed cleanup for the retired passenger service. Delete is allowed only when the regional Cloud Run inventory is exactly the intended 9 active services plus drts-passenger-web."',
      '- "delete-drts-passenger-web"',
    ]);
    expect(source).not.toMatch(/Deploy — .*passenger/i);
    expect(source).not.toMatch(/Build & push — .*passenger/i);
    expect(source).not.toContain("DEV_GCP_PASSENGER");
    expect(source).not.toContain("passenger_service");
    expect(source).toContain('DEV_PARTNER_BOOKING_STATE: "paused"');
    expect(source).toContain(
      'DEV_PAUSED_PARTNER_BOOKING_SERVICE: "drts-dev-partner-booking-web"',
    );
    expect(source).toContain(
      "./scripts/cleanup-paused-partner-booking-service.sh",
    );
    expect(source).not.toContain("DEV_GCP_PARTNER_BOOKING_SERVICE");
    expect(source).not.toContain("Deploy — partner-booking-web");
    expect(source).not.toContain("Build & push — partner-booking-web");
    expect(source).not.toContain(
      "playwright.partner-booking-surfaces.config.ts",
    );
    expect(source).toContain(
      'referral_embed_entry_slug="$(pick "${DEV_REFERRAL_EMBED_ENTRY_SLUG:-}" "" "yuhe-residence")"',
    );
    expect(source).not.toContain(
      '"${DEV_REFERRAL_EMBED_ENTRY_SLUG:-}" "" "referral-demo-community"',
    );
  });

  it("keeps domain mapping defaults and fail-closed wording aligned", () => {
    const source = readRepoFile(".github/workflows/domain-mappings-dev.yml");
    const helperSource = readRepoFile("scripts/map-domain-service.sh");

    expectServiceDefaults(source, {
      api: "DEV_GCP_API_SERVICE",
      "platform-admin-web": "DEV_GCP_PLATFORM_ADMIN_SERVICE",
      "ops-console-web": "DEV_GCP_OPS_CONSOLE_SERVICE",
      "fleet-partner-portal-web": "DEV_GCP_FLEET_PARTNER_PORTAL_SERVICE",
      "tenant-console-web": "DEV_GCP_TENANT_CONSOLE_SERVICE",
      "bank-console-web": "DEV_GCP_BANK_CONSOLE_SERVICE",
      "enterprise-dispatch-web": "DEV_GCP_ENTERPRISE_DISPATCH_SERVICE",
      "referral-embed-web": "DEV_GCP_REFERRAL_EMBED_SERVICE",
      "channel-partner-portal-web": "DEV_GCP_CHANNEL_PARTNER_PORTAL_SERVICE",
    });

    expect(source).toContain("uses: actions/checkout@v4");
    expect(source).toContain("./scripts/map-domain-service.sh");
    expect(helperSource).toContain(
      "fail closed and hand off to the single deploy cleanup task.",
    );
    expect(helperSource).toContain(
      "Refusing to mutate a live mapping in this domain-maintenance workflow",
    );
    expect(helperSource).toContain("describe_status=$?");
    expect(helperSource).toContain("grep -Eiq");
    expect(source).not.toContain("concierge.smarttransport.tw");
    expect(source).not.toContain("ride.smarttransport.tw");
    expect(source).toContain('DEV_PARTNER_BOOKING_STATE: "paused"');
    expect(source).not.toContain(
      "./scripts/map-domain-service.sh book.smarttransport.tw",
    );
    expect(source).not.toContain("DEV_GCP_PARTNER_BOOKING_SERVICE");
  });

  it("keeps the runtime matrix on the same nine-service inventory", () => {
    const source = readRepoFile("tests/e2e/dev-runtime-matrix.spec.ts");

    for (const service of Object.values(expectedServices)) {
      expect(source).toContain(`"${service}"`);
    }

    expect(source).not.toContain('"drts-referral-embed-web"');
    expect(source).not.toContain('"drts-dev-partner-booking-web"');
    expect(source).not.toContain('"partner-booking-web"');
  });

  it("keeps the app entry index and smarttransport runbook on the same inventory", () => {
    const appEntryIndex = readRepoFile(
      "docs/02-architecture/app-entry-url-index-20260616.md",
    );
    const runbook = readRepoFile(
      "docs/03-runbooks/smarttransport-tw-custom-domains.md",
    );

    expect(appEntryIndex).toContain(
      "https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app/embed/yuhe-residence",
    );
    expect(appEntryIndex).toContain(
      "https://drts-channel-partner-portal-web-4t7rg6fmeq-uc.a.run.app",
    );
    expect(appEntryIndex).toContain("Partner Booking — PAUSED");
    expect(appEntryIndex).not.toContain(
      "https://drts-dev-partner-booking-web-4t7rg6fmeq-uc.a.run.app",
    );

    for (const service of Object.values(expectedServices)) {
      expect(runbook).toContain(service);
    }

    expect(runbook).toContain(
      "fail closed and hand off to the single deploy cleanup task.",
    );
    expect(runbook).toContain("domain-maintenance");
    expect(runbook).toContain("drts-dev-ray-tw-20260730");
    expect(runbook).toContain("us-central1");
    expect(runbook).toContain("Partner Booking — PAUSED");
    expect(runbook).not.toContain(
      "./scripts/map-domain-service.sh book.smarttransport.tw",
    );
    expect(runbook).not.toContain("drts-referral-embed-web");
  });
});
