import { defineConfig } from "@playwright/test";

function readSelectedProjects() {
  const selectedProjects = new Set<string>();
  const argv = process.argv;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value) {
      continue;
    }
    if (value.startsWith("--project=")) {
      selectedProjects.add(value.slice("--project=".length));
      continue;
    }
    const nextValue = argv[index + 1];
    if (
      value === "--project" &&
      typeof nextValue === "string" &&
      nextValue.length > 0
    ) {
      selectedProjects.add(nextValue);
    }
  }

  return selectedProjects;
}

const selectedProjects = readSelectedProjects();
const conciergeOnly =
  selectedProjects.size > 0 &&
  [...selectedProjects].every((project) => project === "concierge-portal");
const partnerOnly =
  selectedProjects.size > 0 &&
  [...selectedProjects].every((project) => project === "partner-booking-web");
const mapBookingOnly =
  selectedProjects.size > 0 &&
  [...selectedProjects].every((project) =>
    ["concierge-portal", "partner-booking-web"].includes(project),
  );

const conciergeWebServer = {
  command:
    "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && cd apps/concierge-portal-web && pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3006",
  url: "http://127.0.0.1:3006",
  reuseExistingServer: !process.env.CI,
  timeout: 300_000,
};

const partnerWebServer = {
  command:
    "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && cd apps/partner-booking-web && DRTS_API_URL=http://127.0.0.1:3901 pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3407",
  url: "http://127.0.0.1:3407",
  reuseExistingServer: !process.env.CI,
  timeout: 300_000,
};

const partnerAuthorityMockServer = {
  command:
    "MAP_BOOKING_AUTHORITY_PORT=3901 node tests/e2e/mock-map-booking-authority-server.mjs",
  url: "http://127.0.0.1:3901/api/partner/entries/ctbc",
  reuseExistingServer: !process.env.CI,
  timeout: 60_000,
};

const defaultWebServers = [
  {
    command:
      "CONTROLLED_DOWNLOAD_SIGNING_SECRET=local-e2e-controlled-download-secret pnpm --filter @drts/api dev",
    url: "http://127.0.0.1:3001/health",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  {
    command:
      "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && cd apps/ops-console-web && NEXT_PUBLIC_OPS_ASSISTANT_ENABLED=true pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3202",
    url: "http://127.0.0.1:3202",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
  {
    command:
      "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && NEXT_DIST_DIR=.next-assistant-on NEXT_PUBLIC_PLATFORM_ADMIN_ASSISTANT_ENABLED=true pnpm --filter @drts/platform-admin-web build --webpack && mkdir -p apps/platform-admin-web/.next-assistant-on/standalone/apps/platform-admin-web/.next-assistant-on && rm -rf apps/platform-admin-web/.next-assistant-on/standalone/apps/platform-admin-web/.next-assistant-on/static && cp -R apps/platform-admin-web/.next-assistant-on/static apps/platform-admin-web/.next-assistant-on/standalone/apps/platform-admin-web/.next-assistant-on/static && cd apps/platform-admin-web && HOSTNAME=127.0.0.1 PORT=3102 node .next-assistant-on/standalone/apps/platform-admin-web/server.js",
    url: "http://127.0.0.1:3102",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
  {
    command:
      "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && NEXT_DIST_DIR=.next-assistant-off NEXT_PUBLIC_PLATFORM_ADMIN_ASSISTANT_ENABLED=false pnpm --filter @drts/platform-admin-web build --webpack && mkdir -p apps/platform-admin-web/.next-assistant-off/standalone/apps/platform-admin-web/.next-assistant-off && rm -rf apps/platform-admin-web/.next-assistant-off/standalone/apps/platform-admin-web/.next-assistant-off/static && cp -R apps/platform-admin-web/.next-assistant-off/static apps/platform-admin-web/.next-assistant-off/standalone/apps/platform-admin-web/.next-assistant-off/static && cd apps/platform-admin-web && HOSTNAME=127.0.0.1 PORT=3103 node .next-assistant-off/standalone/apps/platform-admin-web/server.js",
    url: "http://127.0.0.1:3103",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
  {
    command:
      "pnpm --filter @drts/contracts build && pnpm --filter @drts/control-plane-auth build && pnpm --filter @drts/ui-tokens build && cd apps/fleet-partner-portal-web && pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3307",
    url: "http://127.0.0.1:3307",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
  conciergeWebServer,
  partnerAuthorityMockServer,
  partnerWebServer,
];

const webServers = conciergeOnly
  ? [conciergeWebServer]
  : partnerOnly
    ? [partnerAuthorityMockServer, partnerWebServer]
    : mapBookingOnly
      ? [conciergeWebServer, partnerAuthorityMockServer, partnerWebServer]
      : defaultWebServers;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  use: {
    viewport: {
      width: 1440,
      height: 960,
    },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "ops-assistant-on",
      testIgnore:
        /(fleet-partner-portal-.*|tenant-map-booking-ui|concierge-map-booking-ui|partner-map-booking-ui)\.spec\.ts/,
      use: {
        baseURL: "http://127.0.0.1:3202",
      },
    },
    {
      name: "ops-assistant-off",
      testIgnore:
        /(fleet-partner-portal-.*|tenant-map-booking-ui|concierge-map-booking-ui|partner-map-booking-ui)\.spec\.ts/,
      use: {
        baseURL: "http://127.0.0.1:3202",
      },
    },
    {
      name: "platform-admin-assistant-on",
      testIgnore:
        /(fleet-partner-portal-.*|tenant-map-booking-ui|concierge-map-booking-ui|partner-map-booking-ui)\.spec\.ts/,
      use: {
        baseURL: "http://127.0.0.1:3102",
      },
    },
    {
      name: "platform-admin-assistant-off",
      testIgnore:
        /(fleet-partner-portal-.*|tenant-map-booking-ui|concierge-map-booking-ui|partner-map-booking-ui)\.spec\.ts/,
      use: {
        baseURL: "http://127.0.0.1:3103",
      },
    },
    {
      name: "fleet-partner-portal",
      testMatch: /fleet-partner-portal-.*\.spec\.ts/,
      use: {
        baseURL: "http://127.0.0.1:3307",
      },
    },
    {
      name: "concierge-portal",
      testMatch: /concierge-map-booking-ui\.spec\.ts/,
      use: {
        baseURL: "http://127.0.0.1:3006",
      },
    },
    {
      name: "partner-booking-web",
      testMatch: /partner-map-booking-ui\.spec\.ts/,
      use: {
        baseURL: "http://127.0.0.1:3407",
      },
    },
  ],
  webServer: webServers,
});
