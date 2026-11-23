import { defineConfig, devices } from "@playwright/test";

const apiUrl = process.env.DRTS_API_URL || "http://127.0.0.1:3001";
const agencyPort =
  Number(process.env.DRTS_E2E_AGENCY_PORTAL_PORT || "3212") || 3212;
const tenantPort =
  Number(process.env.DRTS_E2E_TENANT_CONSOLE_PORT || "3213") || 3213;
const enterprisePort =
  Number(process.env.DRTS_E2E_ENTERPRISE_DISPATCH_PORT || "3214") || 3214;
const fleetPort =
  Number(process.env.DRTS_E2E_FLEET_PORTAL_PORT || "3215") || 3215;

const agencyOrigin =
  process.env.DRTS_E2E_AGENCY_PORTAL_URL || `http://localhost:${agencyPort}`;
const tenantOrigin =
  process.env.DRTS_E2E_TENANT_CONSOLE_URL || `http://localhost:${tenantPort}`;
const enterpriseOrigin =
  process.env.DRTS_E2E_ENTERPRISE_DISPATCH_URL ||
  `http://localhost:${enterprisePort}`;
const fleetOrigin =
  process.env.DRTS_E2E_FLEET_PORTAL_URL || `http://localhost:${fleetPort}`;

const oidcPort =
  Number(process.env.DRTS_E2E_AGENCY_OIDC_PORT || "4319") || 4319;
const smtpPort =
  Number(process.env.DRTS_E2E_AGENCY_SMTP_PORT || "2526") || 2526;
const jwtSecret = "ci-e2e-agency-business-jwt-secret";
const databaseUrl =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/drts_bureau_acceptance";

const passwordPepperSecretsJson = JSON.stringify({
  v1: "ci-e2e-four-portal-password-pepper-secret-v1",
});
const totpEncryptionKeysJson = JSON.stringify({
  activeKeyId: "v1",
  keys: {
    v1: Buffer.alloc(32, 0x42).toString("base64"),
  },
});
const allowedOrigins = [
  agencyOrigin,
  `http://127.0.0.1:${agencyPort}`,
  tenantOrigin,
  `http://127.0.0.1:${tenantPort}`,
  enterpriseOrigin,
  `http://127.0.0.1:${enterprisePort}`,
  fleetOrigin,
  `http://127.0.0.1:${fleetPort}`,
].join(",");

// Runs inside ui-bureau-acceptance-e2e after the normal Passenger->Ops->Driver
// suite has already migrated, seeded and completed a trip in this same PG
// database. Only the API and the portal web surfaces boot here; the test file
// starts the local SMTP listener and RSA Google OIDC provider in beforeAll.
export default defineConfig({
  testDir: "./tests/e2e/agency-portal-business",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile: ".artifacts/agency-portal-business/playwright-report.json",
      },
    ],
  ],
  outputDir: ".artifacts/agency-portal-business/test-results",
  use: {
    baseURL: agencyOrigin,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @drts/api start",
      url: `${apiUrl}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        PORT: "3001",
        NODE_ENV: "test",
        APP_ENV: "development",
        DRTS_ENV: "development",
        AUTH_MODE: "jwt_bearer",
        DATABASE_URL: databaseUrl,
        JWT_SECRET: jwtSecret,
        JWT_ISSUER: "drts-local",
        JWT_AUDIENCE: "drts-api",
        DRTS_INTERNAL_KEY: "ci-e2e-agency-business-internal-key",
        DRTS_DEV_MFA_WAIVED: "true",
        AUTH_REQUIRE_ORDINARY_LOGIN_MFA: "false",
        OIDC_MOCK_MODE: "false",
        OIDC_ISSUER: `http://127.0.0.1:${oidcPort}`,
        OIDC_CLIENT_ID: "drts-e2e-agency-google-client",
        OIDC_DISCOVERY_TIMEOUT_MS: "5000",
        AUTH_ALLOWED_ORIGINS: allowedOrigins,
        AGENCY_INVITATION_ACCEPT_URL_BASE: `${agencyOrigin}/invite`,
        TENANT_INVITATION_ACCEPT_URL_BASE: `${tenantOrigin}/invite`,
        FLEET_INVITATION_ACCEPT_URL_BASE: `${fleetOrigin}/invite`,
        PASSWORD_RESET_URL_BASE: `${tenantOrigin}/reset-password`,
        PASSWORD_PEPPER_SECRETS_JSON: passwordPepperSecretsJson,
        PASSWORD_PEPPER_CURRENT_VERSION: "v1",
        TOTP_ENCRYPTION_KEYS_JSON: totpEncryptionKeysJson,
        NOTIFICATION_EMAIL_PROVIDER: "smtp",
        NOTIFICATION_SMTP_HOST: "127.0.0.1",
        NOTIFICATION_SMTP_PORT: String(smtpPort),
        NOTIFICATION_SMTP_SECURE: "false",
        NOTIFICATION_FROM_EMAIL: "noreply@drts.example",
        AGENCY_INVITATION_FROM_EMAIL: "agency-invitations@drts.example",
        FLEET_INVITATION_FROM_EMAIL: "fleet-invitations@drts.example",
      },
    },
    {
      command: `pnpm --filter @drts/agency-portal-web dev -- --port ${agencyPort}`,
      url: `${agencyOrigin}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: "development",
        DRTS_API_URL: apiUrl,
        NEXT_PUBLIC_API_URL: apiUrl,
      },
    },
    {
      command: `pnpm --filter @drts/tenant-console-web dev -- --port ${tenantPort}`,
      url: `${tenantOrigin}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: "development",
        DRTS_API_URL: apiUrl,
        NEXT_PUBLIC_API_URL: "/control-plane-proxy",
      },
    },
    {
      command: `pnpm --filter @drts/enterprise-dispatch-web dev -- --port ${enterprisePort}`,
      url: `${enterpriseOrigin}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: "development",
        DRTS_API_URL: apiUrl,
        NEXT_PUBLIC_API_URL: "/control-plane-proxy",
        JWT_SECRET: jwtSecret,
        JWT_ISSUER: "drts-local",
        JWT_AUDIENCE: "drts-api",
      },
    },
    {
      command: `pnpm --filter @drts/fleet-partner-portal-web dev -- --port ${fleetPort}`,
      url: `${fleetOrigin}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: "development",
        DRTS_API_URL: apiUrl,
        NEXT_PUBLIC_API_URL: apiUrl,
        DRTS_FLEET_PARTNER_ID: "fleet-demo-001",
      },
    },
  ],
});
