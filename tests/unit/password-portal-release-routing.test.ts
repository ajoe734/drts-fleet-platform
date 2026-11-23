import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AgencyInvitationDeliveryService,
  buildAgencyInvitationEmailBody,
} from "../../apps/api/src/modules/agency-access/agency-invitation-delivery.service";
import {
  FleetInvitationDeliveryService,
  buildFleetInvitationEmailBody,
} from "../../apps/api/src/modules/fleet-partner/fleet-invitation-delivery.service";
import { FileMailOutbox } from "../../apps/api/src/modules/notification-delivery/file-mail-outbox";
import { NotificationDeliveryService } from "../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import type {
  MailTransport,
  PlatformTransportMessage,
  ProviderAcknowledgement,
  TransportMessage,
} from "../../apps/api/src/modules/notification-delivery/notification-delivery.types";
import * as tenantInvitationDeliveryModule from "../../apps/api/src/modules/tenant-partner/tenant-invitation-delivery.service";
import {
  TenantInvitationDeliveryService,
  type PasswordResetDeliveryRealm,
  type PasswordResetDeliveryRequest,
} from "../../apps/api/src/modules/tenant-partner/tenant-invitation-delivery.service";
import * as apiFetch from "../../packages/tenant-auth/src/api-fetch";
import * as constants from "../../packages/tenant-auth/src/constants";
import * as authHandlers from "../../packages/tenant-auth/src/route-handlers";
import * as sessionVerifier from "../../packages/tenant-auth/src/verified-tenant-session.server";
import { createUiModuleLoader } from "./system-remediation/sr-wire-001/ui-module-loader";

const require = createRequire(import.meta.url);
const {
  buildPlan,
  deployArgs,
} = require("../../operations/verification/production-release-rail/rail.cjs");
const {
  preflight,
} = require("../../operations/verification/production-release-rail/preflight.cjs");
const {
  checkRail,
} = require("../../operations/verification/production-readonly-inventory/collector.cjs");
const {
  fixture: prodFixture,
  SHA: PROD_SHA,
  TAG: PROD_TAG,
  DEPLOYER: PROD_DEPLOYER,
} = require("./sr-prod-full-surface-rail-20261012/fixture.cjs");

const repoRoot = path.resolve(__dirname, "../..");
const devWorkflow = readFileSync(
  path.join(repoRoot, ".github/workflows/deploy-dev.yml"),
  "utf8",
);

const PORTAL_INVITATION_ENV_KEYS = [
  "TENANT_INVITATION_ACCEPT_URL_BASE",
  "FLEET_INVITATION_ACCEPT_URL_BASE",
  "AGENCY_INVITATION_ACCEPT_URL_BASE",
] as const;

function callProductionPasswordResetResolver(
  realm: PasswordResetDeliveryRealm,
  env: NodeJS.ProcessEnv,
): string | null {
  const exportedResolver = (
    tenantInvitationDeliveryModule as Record<string, unknown>
  ).resolvePasswordResetBaseUrl;
  expect(typeof exportedResolver).toBe("function");
  return (
    exportedResolver as (
      r: PasswordResetDeliveryRealm,
      e: NodeJS.ProcessEnv,
    ) => string | null
  )(realm, env);
}

function extractWorkflowStepRun(workflow: string, stepName: string): string {
  const marker = `      - name: ${stepName}\n`;
  const start = workflow.indexOf(marker);
  if (start < 0) throw new Error(`Missing workflow step: ${stepName}`);
  const end = workflow.indexOf("\n      - name:", start + marker.length);
  const block = workflow.slice(start, end < 0 ? undefined : end);
  const run = block.split("        run: |\n")[1];
  if (!run) throw new Error(`Missing run scalar in step: ${stepName}`);
  return run
    .split("\n")
    .map((line) => line.replace(/^ {10}/, ""))
    .join("\n");
}

function decodeGcloudEnvVars(raw: string): Record<string, string> {
  let delimiter = ",";
  let body = raw;
  if (raw.startsWith("^")) {
    const secondCaret = raw.indexOf("^", 1);
    delimiter = raw.slice(1, secondCaret);
    body = raw.slice(secondCaret + 1);
  }
  return Object.fromEntries(
    body
      .split(delimiter)
      .filter(Boolean)
      .map((entry) => {
        const eq = entry.indexOf("=");
        return [entry.slice(0, eq), entry.slice(eq + 1)];
      }),
  );
}

function runDevApiEnvSteps(options: {
  oidcEnabled: boolean;
  tenantConfiguredOrigin?: string;
  tenantCloudRunOrigin?: string;
  dispatchConfiguredOrigin?: string;
  dispatchCloudRunOrigin?: string;
  agencyConfiguredOrigin?: string;
  agencyCloudRunOrigin?: string;
  fleetConfiguredOrigin?: string;
  scriptOverride?: string;
}) {
  const dir = mkdtempSync(path.join(tmpdir(), "drts-portal-dev-env-"));
  try {
    const fleetOutput = path.join(dir, "fleet-output");
    const fleetScript = extractWorkflowStepRun(
      devWorkflow,
      "Resolve Fleet invitation accept URL",
    );
    const fleetOrigin =
      options.fleetConfiguredOrigin ?? "https://fleet.dev.drts.invalid";
    const fleetRes = spawnSync(
      "bash",
      ["--noprofile", "--norc", "-euo", "pipefail", "-c", fleetScript],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_OUTPUT: fleetOutput,
          DEV_FLEET_PARTNER_PORTAL_ORIGIN: fleetOrigin,
        },
      },
    );
    expect(fleetRes.status, fleetRes.stderr).toBe(0);
    const fleetInviteBase = readFileSync(fleetOutput, "utf8")
      .trim()
      .replace(/^base=/, "");

    const expressions: Record<string, string> = {
      "needs.prepare.outputs.tenant_console_service":
        "drts-dev-tenant-console-web",
      "needs.prepare.outputs.enterprise_dispatch_service":
        "drts-dev-enterprise-dispatch-web",
      "needs.prepare.outputs.passenger_app_service":
        "drts-dev-passenger-app-web",
      "needs.prepare.outputs.region": "us-central1",
      "needs.prepare.outputs.project_id": "drts-dev-synthetic",
      "needs.prepare.outputs.tenant_console_origin":
        options.tenantConfiguredOrigin ?? "",
      "needs.prepare.outputs.enterprise_dispatch_origin":
        options.dispatchConfiguredOrigin ?? "",
      "needs.prepare.outputs.ops_console_origin":
        "https://ops.dev.drts.invalid",
      "needs.build-push.outputs.candidate_sha": PROD_SHA,
      "steps.api_secrets.outputs.jwt_issuer":
        "https://auth.local.drts.internal",
      "steps.api_secrets.outputs.jwt_audience":
        "https://api.local.drts.internal",
      "steps.api_secrets.outputs.llm_provider": "mock",
      "steps.api_secrets.outputs.llm_chat_model": "mock-chat-v1",
      "steps.api_secrets.outputs.llm_summarizer_model": "mock-summary-v1",
      "steps.api_secrets.outputs.map_provider_mode": "mock",
      "steps.api_secrets.outputs.map_provider_mode == 'external' && 'google' || 'mock'":
        "mock",
      "steps.api_secrets.outputs.oidc_enabled": String(options.oidcEnabled),
      "steps.api_secrets.outputs.notification_outbox_type": "postgres",
      "steps.api_secrets.outputs.llm_base_url": "",
      "steps.api_secrets.outputs.openclaw_auth_provider": "",
      "steps.api_secrets.outputs.openclaw_home": "",
      "steps.passenger_secrets.outputs.otp_mounts_complete": "false",
      "steps.passenger_secrets.outputs.payment_mounts_complete": "false",
      "steps.passenger_secrets.outputs.api": "",
    };

    const rawApiEnvScript =
      options.scriptOverride ??
      extractWorkflowStepRun(devWorkflow, "Build API env vars");
    const renderedApiEnvScript = rawApiEnvScript.replace(
      /\$\{\{\s*(.*?)\s*\}\}/g,
      (_, expr: string) => {
        if (!(expr in expressions)) {
          throw new Error(`Unmapped workflow expression: ${expr}`);
        }
        return expressions[expr]!;
      },
    );

    const apiOutput = path.join(dir, "api-output");
    const wrapped = `
set -euo pipefail
gcloud() {
  case "$*" in
    *drts-dev-tenant-console-web*) printf '%s' "\${MOCK_TENANT_RUN_ORIGIN:-}" ;;
    *drts-dev-enterprise-dispatch-web*) printf '%s' "\${MOCK_DISPATCH_RUN_ORIGIN:-}" ;;
    *drts-dev-passenger-app-web*) printf '%s' "https://passenger-run.dev.drts.invalid" ;;
    *drts-dev-agency-portal-web*)
      if [[ -n "\${MOCK_AGENCY_RUN_ORIGIN:-}" ]]; then
        printf '%s' "$MOCK_AGENCY_RUN_ORIGIN"
      else
        echo "ERROR: (gcloud.run.services.describe) Service [drts-dev-agency-portal-web] could not be found." >&2
        return 1
      fi
      ;;
    *) return 99 ;;
  esac
}
${renderedApiEnvScript}
`;
    const apiRes = spawnSync(
      "bash",
      ["--noprofile", "--norc", "-euo", "pipefail", "-c", wrapped],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_OUTPUT: apiOutput,
          DEV_WORKLOAD_IDENTITY_ISSUER: "https://wif.dev.drts.invalid",
          DEV_WORKLOAD_IDENTITY_AUDIENCE: "https://api.dev.drts.invalid",
          DEV_OIDC_CLIENT_ID: "1234567890-synthetic.apps.googleusercontent.com",
          DEV_FLEET_PARTNER_PORTAL_ORIGIN: fleetOrigin,
          DEV_PAX_REVIEW_DEMO_ENABLED: "false",
          PASSWORD_LOGIN_SECRETS_PRESENT: "true",
          DEV_PASSWORD_LOGIN_ENABLED: "true",
          DEV_PASSWORD_PEPPER_CURRENT_VERSION: "v1",
          ARTIFACT_PROVIDER_ENV_SUFFIX:
            "@REMITTANCE_PROOF_STORAGE_PROVIDER=unprovisioned@DOCUMENT_ARTIFACT_STORAGE_PROVIDER=unprovisioned",
          REGULATORY_ALERT_RECIPIENT_SECRET_MOUNTED: "true",
          AGENCY_PORTAL_SERVICE: "drts-dev-agency-portal-web",
          AGENCY_PORTAL_ORIGIN: options.agencyConfiguredOrigin ?? "",
          FLEET_INVITATION_ACCEPT_URL_BASE: fleetInviteBase,
          MOCK_TENANT_RUN_ORIGIN: options.tenantCloudRunOrigin ?? "",
          MOCK_DISPATCH_RUN_ORIGIN: options.dispatchCloudRunOrigin ?? "",
          MOCK_AGENCY_RUN_ORIGIN: options.agencyCloudRunOrigin ?? "",
        },
      },
    );
    expect(apiRes.status, apiRes.stderr).toBe(0);
    const rawVars = readFileSync(apiOutput, "utf8")
      .trim()
      .replace(/^vars=/, "");
    return decodeGcloudEnvVars(rawVars);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function collectElements(
  node: unknown,
  predicate: (el: { type: unknown; props: Record<string, unknown> }) => boolean,
  acc: Array<{ type: unknown; props: Record<string, unknown> }> = [],
): Array<{ type: unknown; props: Record<string, unknown> }> {
  if (!node || typeof node !== "object") return acc;
  if (Array.isArray(node)) {
    for (const child of node) collectElements(child, predicate, acc);
    return acc;
  }
  const candidate = node as {
    type?: unknown;
    props?: Record<string, unknown>;
  };
  if (candidate.props && typeof candidate.props === "object") {
    if (predicate({ type: candidate.type, props: candidate.props })) {
      acc.push({ type: candidate.type, props: candidate.props });
    }
    if ("children" in candidate.props) {
      collectElements(candidate.props.children, predicate, acc);
    }
  }
  return acc;
}

describe("PORTAL-INVITATION-AND-RESET-RELEASE-CONFIG-20261123: shared-dev and production release wiring", () => {
  let outboxDir: string | null = null;

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    if (outboxDir) {
      await rm(outboxDir, { recursive: true, force: true });
      outboxDir = null;
    }
  });

  it("wires tenant, fleet, and agency invitation accept URLs and realm /reset-password origins in production buildPlan, preflight, and deployArgs", async () => {
    expect(() => checkRail()).not.toThrow();
    const f = prodFixture();
    const built = buildPlan(f.vars, PROD_SHA, PROD_TAG, PROD_DEPLOYER);
    const plan = preflight(f.vars, PROD_SHA, PROD_TAG, PROD_DEPLOYER, f.cloud);
    const api = plan.services.find((s: { id: string }) => s.id === "api");

    // Verify seamless integration with #3375 opt-in driver onboarding release config:
    const onboardingFixture = prodFixture();
    Object.assign(onboardingFixture.vars, {
      PROD_DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED: "true",
      PROD_DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS: Array(32)
        .fill("AB")
        .join(":"),
      PROD_DRIVER_ONBOARDING_IOS_APP_ID:
        "A1B2C3D4E5.com.cctechsupport.drts.driver",
      PROD_REMOTE_SMTP_HOST: "smtp.drts.invalid",
      PROD_REMOTE_SMTP_PORT: "587",
      PROD_REMOTE_SMTP_FROM_EMAIL: "drivers@drts.invalid",
      PROD_NOTIFICATION_FROM_EMAIL: "drivers@drts.invalid",
      PROD_REMOTE_SMTP_USERNAME_SECRET: "drts-prod-smtp-user",
      PROD_REMOTE_SMTP_PASSWORD_SECRET: "drts-prod-smtp-password",
    });
    Object.assign(onboardingFixture.values, {
      "drts-prod-twilio-account-sid": `AC${"a".repeat(32)}`,
      "drts-prod-twilio-api-key-sid": `SK${"b".repeat(32)}`,
      "drts-prod-twilio-from-number": "+15005550006",
    });
    const combinedPlan = preflight(
      onboardingFixture.vars,
      PROD_SHA,
      PROD_TAG,
      PROD_DEPLOYER,
      onboardingFixture.cloud,
    );
    expect(combinedPlan.services[0].env).toMatchObject({
      DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED: "true",
      DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS:
        onboardingFixture.vars.PROD_DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS,
      DRIVER_ONBOARDING_IOS_APP_ID:
        onboardingFixture.vars.PROD_DRIVER_ONBOARDING_IOS_APP_ID,
      TENANT_INVITATION_ACCEPT_URL_BASE: `${onboardingFixture.vars.PROD_TENANT_CONSOLE_ORIGIN}/invite`,
      FLEET_INVITATION_ACCEPT_URL_BASE: `${onboardingFixture.vars.PROD_FLEET_PARTNER_PORTAL_ORIGIN}/invite`,
      AGENCY_INVITATION_ACCEPT_URL_BASE: `${onboardingFixture.vars.PROD_AGENCY_PORTAL_ORIGIN}/invite`,
    });
    expect(combinedPlan.services[0].secrets).toMatchObject({
      DRIVER_ONBOARDING_CODE_PEPPER:
        "drts-prod-driver-onboarding-code-pepper:7",
      DRIVER_ONBOARDING_DELIVERY_KEY:
        "drts-prod-driver-onboarding-delivery-key:7",
    });

    expect(built.services[0].env).toMatchObject({
      TENANT_INVITATION_ACCEPT_URL_BASE: `${f.vars.PROD_TENANT_CONSOLE_ORIGIN}/invite`,
      FLEET_INVITATION_ACCEPT_URL_BASE: `${f.vars.PROD_FLEET_PARTNER_PORTAL_ORIGIN}/invite`,
      AGENCY_INVITATION_ACCEPT_URL_BASE: `${f.vars.PROD_AGENCY_PORTAL_ORIGIN}/invite`,
    });
    expect(api.env).toMatchObject({
      TENANT_INVITATION_ACCEPT_URL_BASE: `${f.vars.PROD_TENANT_CONSOLE_ORIGIN}/invite`,
      FLEET_INVITATION_ACCEPT_URL_BASE: `${f.vars.PROD_FLEET_PARTNER_PORTAL_ORIGIN}/invite`,
      AGENCY_INVITATION_ACCEPT_URL_BASE: `${f.vars.PROD_AGENCY_PORTAL_ORIGIN}/invite`,
    });

    for (const service of plan.services.filter(
      (s: { id: string }) => s.id !== "api",
    )) {
      for (const key of PORTAL_INVITATION_ENV_KEYS) {
        expect(service.env).not.toHaveProperty(key);
      }
    }

    const apiImage = `${plan.registry}/api@sha256:${"a".repeat(64)}`;
    const args = deployArgs(plan, api, apiImage);
    const envArg = args[args.indexOf("--set-env-vars") + 1] as string;
    const deployedEnv = decodeGcloudEnvVars(envArg);

    expect(deployedEnv).toMatchObject({
      TENANT_INVITATION_ACCEPT_URL_BASE: `${f.vars.PROD_TENANT_CONSOLE_ORIGIN}/invite`,
      FLEET_INVITATION_ACCEPT_URL_BASE: `${f.vars.PROD_FLEET_PARTNER_PORTAL_ORIGIN}/invite`,
      AGENCY_INVITATION_ACCEPT_URL_BASE: `${f.vars.PROD_AGENCY_PORTAL_ORIGIN}/invite`,
    });
    expect(deployedEnv).not.toHaveProperty("PASSWORD_RESET_URL_BASE");

    // Deliver invitations and password-reset emails through the controlled
    // test mailbox using ONLY the exact env vars emitted by deployArgs.
    vi.stubEnv("PASSWORD_RESET_URL_BASE", "");
    delete process.env.PASSWORD_RESET_URL_BASE;
    for (const key of PORTAL_INVITATION_ENV_KEYS) {
      vi.stubEnv(key, deployedEnv[key]!);
    }

    outboxDir = await mkdtemp(
      path.join(tmpdir(), "portal-release-prod-outbox-"),
    );
    const inbox: Array<TransportMessage | PlatformTransportMessage> = [];
    const ack = (id: string): ProviderAcknowledgement => ({
      provider: "controlled-test-receiver",
      response: `250 Accepted as ${id}`,
      providerMessageId: id,
      acceptedAt: "2026-11-23T03:00:00.000Z",
    });
    const transport: MailTransport = {
      provider: "controlled-test-receiver",
      send: vi.fn(async (msg: TransportMessage) => {
        inbox.push(msg);
        return ack(`outbox-${inbox.length}`);
      }),
      sendPlatform: vi.fn(async (msg: PlatformTransportMessage) => {
        inbox.push(msg);
        return ack(`platform-${inbox.length}`);
      }),
    };
    const delivery = new NotificationDeliveryService(
      new FileMailOutbox(outboxDir),
      transport,
      {
        now: () => new Date("2026-11-23T03:00:00.000Z"),
        maxAttempts: 3,
        retryDelayMs: 1000,
        leaseMs: 1000,
      },
    );

    const tenantDelivery = new TenantInvitationDeliveryService(delivery);
    const fleetDelivery = new FleetInvitationDeliveryService(delivery);
    const agencyDelivery = new AgencyInvitationDeliveryService(delivery);

    const tenantInvite = await tenantDelivery.send({
      invitationId: "inv-prod-tenant-001",
      tenantId: "tenant-prod-001",
      recipientEmail: "tenant-invitee@controlled-receiver.test",
      displayName: "Prod Tenant User",
      expiresAt: "2026-11-24T03:00:00.000Z",
      rawToken: "ti_prod_tenant_token_001",
    });
    const fleetInvite = await fleetDelivery.send({
      invitationId: "inv-prod-fleet-001",
      fleetPartnerId: "fleet-prod-001",
      entrySlug: "fleet-prod",
      recipientEmail: "fleet-invitee@controlled-receiver.test",
      expiresAt: "2026-11-24T03:00:00.000Z",
      rawToken: "fi_prod_fleet_token_001",
    });
    const agencyInvite = await agencyDelivery.send({
      invitationId: "inv-prod-agency-001",
      agencyId: "agency-prod-001",
      agencyDisplayName: "Prod Agency",
      recipientEmail: "agency-invitee@controlled-receiver.test",
      expiresAt: "2026-11-24T03:00:00.000Z",
      accessValidTo: "2026-12-31T00:00:00.000Z",
      rawToken: "ai_prod_agency_token_001",
    });

    expect(tenantInvite.status).toBe("sent");
    expect(fleetInvite.status).toBe("sent");
    expect(agencyInvite.status).toBe("sent");
    expect(inbox[0]?.body).toContain(
      `Accept your invitation: ${f.vars.PROD_TENANT_CONSOLE_ORIGIN}/invite?token=ti_prod_tenant_token_001`,
    );
    expect(inbox[1]?.body).toContain(
      `Accept your invitation: ${f.vars.PROD_FLEET_PARTNER_PORTAL_ORIGIN}/invite?token=fi_prod_fleet_token_001`,
    );
    expect(inbox[2]?.body).toContain(
      `Accept your invitation: ${f.vars.PROD_AGENCY_PORTAL_ORIGIN}/invite?token=ai_prod_agency_token_001`,
    );

    const resetCases: Array<{
      request: PasswordResetDeliveryRequest;
      expectedOrigin: string;
    }> = [
      {
        request: {
          dedupeKey: "prod-reset-tenant-001",
          realm: "tenant",
          tenantId: "tenant-prod-001",
          recipientEmail: "tenant-reset@controlled-receiver.test",
          expiresAt: "2026-11-23T04:00:00.000Z",
          rawToken: "pwr_prod_tenant_001",
        },
        expectedOrigin: f.vars.PROD_TENANT_CONSOLE_ORIGIN,
      },
      {
        request: {
          dedupeKey: "prod-reset-partner-001",
          realm: "partner",
          tenantId: null,
          recipientEmail: "fleet-reset@controlled-receiver.test",
          expiresAt: "2026-11-23T04:00:00.000Z",
          rawToken: "pwr_prod_partner_001",
        },
        expectedOrigin: f.vars.PROD_FLEET_PARTNER_PORTAL_ORIGIN,
      },
      {
        request: {
          dedupeKey: "prod-reset-agency-001",
          realm: "agency",
          tenantId: null,
          recipientEmail: "agency-reset@controlled-receiver.test",
          expiresAt: "2026-11-23T04:00:00.000Z",
          rawToken: "pwr_prod_agency_001",
        },
        expectedOrigin: f.vars.PROD_AGENCY_PORTAL_ORIGIN,
      },
    ];

    for (const { request, expectedOrigin } of resetCases) {
      const outcome = await tenantDelivery.sendPasswordReset(request);
      expect(outcome.status).toBe("sent");
      expect(inbox.at(-1)?.body).toContain(
        `Reset your password: ${expectedOrigin}/reset-password?token=${request.rawToken}`,
      );
      expect(
        callProductionPasswordResetResolver(request.realm, deployedEnv),
      ).toBe(`${expectedOrigin}/reset-password`);
    }
  });

  it("routes shared-dev tenant invitations to /invite whether Google OIDC is enabled or disabled, while preserving OIDC and Enterprise Dispatch shared tenant realm origins", async () => {
    const currentScript = extractWorkflowStepRun(
      devWorkflow,
      "Build API env vars",
    );
    // Reproduce the pre-fix workflow behavior where TENANT_INVITATION_ACCEPT_URL_BASE
    // was coupled to oidc_enabled=true and pointed directly to /api/auth/tenant/login.
    const oldScript = currentScript
      .replace(
        'if [[ -n "$tenant_login_origin" ]]; then\n  env_vars="${env_vars}@TENANT_INVITATION_ACCEPT_URL_BASE=${tenant_login_origin}/invite"\nfi\n',
        "",
      )
      .replace(
        "@OIDC_MOCK_MODE=false",
        "@OIDC_MOCK_MODE=false@TENANT_INVITATION_ACCEPT_URL_BASE=${tenant_login_origin}/api/auth/tenant/login",
      );

    const oldOidcEnabledEnv = runDevApiEnvSteps({
      oidcEnabled: true,
      tenantConfiguredOrigin: "https://tenant.dev.drts.invalid",
      dispatchConfiguredOrigin: "https://dispatch.dev.drts.invalid",
      agencyConfiguredOrigin: "https://agency.dev.drts.invalid",
      fleetConfiguredOrigin: "https://fleet.dev.drts.invalid",
      scriptOverride: oldScript,
    });
    expect(oldOidcEnabledEnv.TENANT_INVITATION_ACCEPT_URL_BASE).toBe(
      "https://tenant.dev.drts.invalid/api/auth/tenant/login",
    );

    const oldOidcDisabledEnv = runDevApiEnvSteps({
      oidcEnabled: false,
      tenantConfiguredOrigin: "https://tenant.dev.drts.invalid",
      dispatchConfiguredOrigin: "https://dispatch.dev.drts.invalid",
      agencyConfiguredOrigin: "https://agency.dev.drts.invalid",
      fleetConfiguredOrigin: "https://fleet.dev.drts.invalid",
      scriptOverride: oldScript,
    });
    expect(
      oldOidcDisabledEnv.TENANT_INVITATION_ACCEPT_URL_BASE,
    ).toBeUndefined();

    // Fixed workflow with Google OIDC enabled:
    const fixedOidcEnabledEnv = runDevApiEnvSteps({
      oidcEnabled: true,
      tenantConfiguredOrigin: "https://tenant.dev.drts.invalid",
      dispatchConfiguredOrigin: "https://dispatch.dev.drts.invalid",
      agencyConfiguredOrigin: "https://agency.dev.drts.invalid",
      fleetConfiguredOrigin: "https://fleet.dev.drts.invalid",
    });
    expect(fixedOidcEnabledEnv).toMatchObject({
      OIDC_ENABLED: "true",
      OIDC_ISSUER: "https://accounts.google.com",
      OIDC_CLIENT_ID: "1234567890-synthetic.apps.googleusercontent.com",
      PASSWORD_LOGIN_ENABLED: "true",
      TENANT_INVITATION_ACCEPT_URL_BASE:
        "https://tenant.dev.drts.invalid/invite",
      AGENCY_INVITATION_ACCEPT_URL_BASE:
        "https://agency.dev.drts.invalid/invite",
      FLEET_INVITATION_ACCEPT_URL_BASE: "https://fleet.dev.drts.invalid/invite",
    });
    expect(fixedOidcEnabledEnv.AUTH_ALLOWED_ORIGINS?.split(",")).toEqual(
      expect.arrayContaining([
        "https://tenant.dev.drts.invalid",
        "https://dispatch.dev.drts.invalid",
        "https://agency.dev.drts.invalid",
        "https://fleet.dev.drts.invalid",
      ]),
    );

    // Fixed workflow with Google OIDC disabled (password-only / trusted tenant origin present):
    const fixedOidcDisabledEnv = runDevApiEnvSteps({
      oidcEnabled: false,
      tenantConfiguredOrigin: "",
      tenantCloudRunOrigin: "https://tenant-run.dev.drts.invalid",
      dispatchConfiguredOrigin: "https://dispatch.dev.drts.invalid",
      agencyConfiguredOrigin: "",
      agencyCloudRunOrigin: "https://agency-run.dev.drts.invalid",
      fleetConfiguredOrigin: "https://fleet.dev.drts.invalid",
    });
    expect(fixedOidcDisabledEnv).toMatchObject({
      OIDC_ENABLED: "false",
      PASSWORD_LOGIN_ENABLED: "true",
      TENANT_INVITATION_ACCEPT_URL_BASE:
        "https://tenant-run.dev.drts.invalid/invite",
      AGENCY_INVITATION_ACCEPT_URL_BASE:
        "https://agency-run.dev.drts.invalid/invite",
      FLEET_INVITATION_ACCEPT_URL_BASE: "https://fleet.dev.drts.invalid/invite",
    });
    expect(fixedOidcDisabledEnv).not.toHaveProperty("PASSWORD_RESET_URL_BASE");
    expect(
      buildFleetInvitationEmailBody(
        {
          invitationId: "inv-dev-fleet-1",
          fleetPartnerId: "fleet-demo-001",
          entrySlug: "fleet-demo",
          recipientEmail: "fleet@controlled-receiver.test",
          expiresAt: "2026-11-24T00:00:00.000Z",
          rawToken: "fi_dev_token",
        },
        fixedOidcDisabledEnv.FLEET_INVITATION_ACCEPT_URL_BASE,
      ),
    ).toContain(
      "Accept your invitation: https://fleet.dev.drts.invalid/invite?token=fi_dev_token",
    );
    expect(
      buildAgencyInvitationEmailBody(
        {
          invitationId: "inv-dev-agency-1",
          agencyId: "agency-demo-001",
          agencyDisplayName: "Demo Agency",
          recipientEmail: "agency@controlled-receiver.test",
          expiresAt: "2026-11-24T00:00:00.000Z",
          accessValidTo: "2026-12-31T00:00:00.000Z",
          rawToken: "ai_dev_token",
        },
        fixedOidcDisabledEnv.AGENCY_INVITATION_ACCEPT_URL_BASE,
      ),
    ).toContain(
      "Accept your invitation: https://agency-run.dev.drts.invalid/invite?token=ai_dev_token",
    );

    // Invoke actual TenantInvitationDeliveryService.send and sendPasswordReset
    // under the exact OIDC-disabled shared-dev deployment settings without
    // PASSWORD_RESET_URL_BASE injection.
    vi.stubEnv("PASSWORD_RESET_URL_BASE", "");
    delete process.env.PASSWORD_RESET_URL_BASE;
    for (const key of PORTAL_INVITATION_ENV_KEYS) {
      vi.stubEnv(key, fixedOidcDisabledEnv[key]!);
    }

    outboxDir = await mkdtemp(
      path.join(tmpdir(), "portal-release-dev-outbox-"),
    );
    const devInbox: Array<TransportMessage | PlatformTransportMessage> = [];
    const devAck = (id: string): ProviderAcknowledgement => ({
      provider: "controlled-test-receiver",
      response: `250 Accepted as ${id}`,
      providerMessageId: id,
      acceptedAt: "2026-11-23T03:30:00.000Z",
    });
    const devTransport: MailTransport = {
      provider: "controlled-test-receiver",
      send: vi.fn(async (msg: TransportMessage) => {
        devInbox.push(msg);
        return devAck(`dev-outbox-${devInbox.length}`);
      }),
      sendPlatform: vi.fn(async (msg: PlatformTransportMessage) => {
        devInbox.push(msg);
        return devAck(`dev-platform-${devInbox.length}`);
      }),
    };
    const devDelivery = new NotificationDeliveryService(
      new FileMailOutbox(outboxDir),
      devTransport,
      {
        now: () => new Date("2026-11-23T03:30:00.000Z"),
        maxAttempts: 3,
        retryDelayMs: 1000,
        leaseMs: 1000,
      },
    );
    const devTenantDelivery = new TenantInvitationDeliveryService(devDelivery);

    const devTenantInvite = await devTenantDelivery.send({
      invitationId: "inv-dev-tenant-oidc-disabled-001",
      tenantId: "tenant-dev-001",
      recipientEmail: "tenant-dev@controlled-receiver.test",
      displayName: "Dev Tenant User",
      expiresAt: "2026-11-24T03:30:00.000Z",
      rawToken: "ti_dev_oidc_disabled_token_001",
    });
    expect(devTenantInvite.status).toBe("sent");
    expect(devInbox.at(-1)?.body).toContain(
      "Accept your invitation: https://tenant-run.dev.drts.invalid/invite?token=ti_dev_oidc_disabled_token_001",
    );

    const devResetCases: Array<{
      request: PasswordResetDeliveryRequest;
      expectedOrigin: string;
    }> = [
      {
        request: {
          dedupeKey: "dev-reset-tenant-001",
          realm: "tenant",
          tenantId: "tenant-dev-001",
          recipientEmail: "tenant-dev-reset@controlled-receiver.test",
          expiresAt: "2026-11-23T04:30:00.000Z",
          rawToken: "pwr_dev_tenant_001",
        },
        expectedOrigin: "https://tenant-run.dev.drts.invalid",
      },
      {
        request: {
          dedupeKey: "dev-reset-partner-001",
          realm: "partner",
          tenantId: null,
          recipientEmail: "fleet-dev-reset@controlled-receiver.test",
          expiresAt: "2026-11-23T04:30:00.000Z",
          rawToken: "pwr_dev_partner_001",
        },
        expectedOrigin: "https://fleet.dev.drts.invalid",
      },
      {
        request: {
          dedupeKey: "dev-reset-agency-001",
          realm: "agency",
          tenantId: null,
          recipientEmail: "agency-dev-reset@controlled-receiver.test",
          expiresAt: "2026-11-23T04:30:00.000Z",
          rawToken: "pwr_dev_agency_001",
        },
        expectedOrigin: "https://agency-run.dev.drts.invalid",
      },
    ];

    for (const { request, expectedOrigin } of devResetCases) {
      const outcome = await devTenantDelivery.sendPasswordReset(request);
      expect(outcome.status).toBe("sent");
      expect(devInbox.at(-1)?.body).toContain(
        `Reset your password: ${expectedOrigin}/reset-password?token=${request.rawToken}`,
      );
      expect(
        callProductionPasswordResetResolver(
          request.realm,
          fixedOidcDisabledEnv,
        ),
      ).toBe(`${expectedOrigin}/reset-password`);
    }
  });

  it("verifies /invite dual-entry (Google OIDC and password acceptance with the same token) and realm /reset-password pages across Tenant, Enterprise Dispatch, Agency, and Fleet portals", async () => {
    const PortalInvitationPasswordForm =
      function PortalInvitationPasswordForm() {
        return null;
      };
    const PortalResetPasswordForm = function PortalResetPasswordForm() {
      return null;
    };
    const uiWebStub = {
      CanvasCard: ({ children }: { children?: unknown }) => children,
      CanvasPageHeader: () => null,
      Card: ({ children }: { children?: unknown }) => children,
      CardHeader: ({ children }: { children?: unknown }) => children,
      CardBody: ({ children }: { children?: unknown }) => children,
      buildCanvasTheme: () => ({
        bg: "#000",
        text: "#fff",
        border: "#333",
      }),
    };
    const uiWebClientStub = {
      PortalInvitationPasswordForm,
      PortalResetPasswordForm,
    };

    const loadPortalModule = <T>(portalDir: string, relFile: string): T => {
      const appRoot = path.join(repoRoot, portalDir);
      const load = createUiModuleLoader(appRoot, {
        "server-only": {},
        "next/server": { NextRequest, NextResponse },
        "next/headers": { cookies: async () => ({ get: () => undefined }) },
        "next/navigation": { redirect: () => undefined },
        "@drts/ui-web": uiWebStub,
        "@drts/ui-web/client": uiWebClientStub,
        "@drts/tenant-auth": authHandlers,
        "@drts/tenant-auth/api-fetch": apiFetch,
        "@drts/tenant-auth/constants": constants,
        "@drts/tenant-auth/verified-tenant-session.server": sessionVerifier,
        "@drts/agency-auth": { decodeAgencyProfile: () => null },
        "@drts/agency-auth/constants": {
          AGENCY_PROFILE_COOKIE_NAME: "drts_agency_profile",
          AGENCY_SESSION_COOKIE_NAME: "drts_agency_session",
        },
        "@drts/agency-auth/agency-api": { agencyApiGet: async () => ({}) },
      });
      return load<T>(path.join(appRoot, relFile));
    };

    const token = "ti_dual_entry_same_token_20261123";
    const tenantInvitePage = loadPortalModule<{
      default: (props: {
        searchParams: Promise<Record<string, string>>;
      }) => Promise<unknown>;
    }>("apps/tenant-console-web", "app/invite/page.tsx");

    const renderedInvite = await tenantInvitePage.default({
      searchParams: Promise.resolve({ token }),
    });

    const googleLinks = collectElements(
      renderedInvite,
      (el) => el.type === "a" && typeof el.props.href === "string",
    );
    expect(googleLinks).toHaveLength(1);
    expect(googleLinks[0]?.props.href).toBe(
      `/api/auth/tenant/login?token=${encodeURIComponent(token)}`,
    );

    const passwordForms = collectElements(
      renderedInvite,
      (el) => el.type === PortalInvitationPasswordForm,
    );
    expect(passwordForms).toHaveLength(1);
    expect(passwordForms[0]?.props).toMatchObject({
      endpoint: "/api/auth/tenant/invitation/accept-with-password",
      loginEndpoint: "/api/auth/tenant/password-login",
      token,
      successHref: "/",
    });

    // Verify all four portals' /reset-password pages bind the reset token to their realm endpoint:
    const resetPages = [
      {
        portal: "apps/tenant-console-web",
        expectedEndpoint: "/api/auth/tenant/password-reset/confirm",
      },
      {
        portal: "apps/enterprise-dispatch-web",
        expectedEndpoint: "/api/auth/tenant/password-reset/confirm",
      },
      {
        portal: "apps/agency-portal-web",
        expectedEndpoint: "/api/auth/agency/password-reset/confirm",
      },
      {
        portal: "apps/fleet-partner-portal-web",
        expectedEndpoint: "/api/auth/password-reset/confirm",
      },
    ] as const;

    for (const { portal, expectedEndpoint } of resetPages) {
      const pageMod = loadPortalModule<{
        default: (props: {
          searchParams: Promise<Record<string, string>>;
        }) => Promise<unknown>;
      }>(portal, "app/reset-password/page.tsx");
      const tree = await pageMod.default({
        searchParams: Promise.resolve({ token: `reset_${portal}` }),
      });
      const forms = collectElements(
        tree,
        (el) => el.type === PortalResetPasswordForm,
      );
      expect(forms).toHaveLength(1);
      expect(forms[0]?.props).toMatchObject({
        endpoint: expectedEndpoint,
        token: `reset_${portal}`,
        successHref: "/login",
      });
    }

    // Verify both Tenant Console and Enterprise Dispatch route handlers preserve:
    // 1) Google OIDC invitation login with the same token
    // 2) Password invitation acceptance with the same token
    // 3) Shared tenant realm password-reset confirm and password-login
    vi.stubEnv("BFF_STATE_SECRET", "portal-release-routing-state-secret");
    vi.stubEnv("DRTS_API_URL", "https://api.drts.invalid");
    vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");

    const upstreamCalls: Array<{
      url: string;
      method: string;
      body: unknown;
    }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const parsed = new URL(url);
        const method = init?.method ?? "GET";
        const body =
          typeof init?.body === "string" ? JSON.parse(init.body) : null;
        upstreamCalls.push({ url: parsed.pathname, method, body });

        if (parsed.pathname === "/api/auth/tenant/invitation-login") {
          return Response.json({
            authorization_url:
              "https://accounts.google.com/o/oauth2/v2/auth?state=invite-state",
            state_token: "issued-state-token",
            state: "invite-state",
          });
        }
        if (
          parsed.pathname === "/api/tenant/invitations/accept-with-password"
        ) {
          return Response.json({ accepted: true }, { status: 200 });
        }
        if (parsed.pathname === "/api/auth/tenant/password-reset/confirm") {
          return Response.json({ reset: true }, { status: 200 });
        }
        if (parsed.pathname === "/api/auth/tenant/password-login") {
          return Response.json(
            { data: { access_token: "shared-tenant-realm-jwt" } },
            { status: 200 },
          );
        }
        throw new Error(`Unexpected upstream call: ${method} ${url}`);
      }),
    );

    const tenantRoute = loadPortalModule<
      ReturnType<typeof authHandlers.createTenantAuthHandlers>
    >("apps/tenant-console-web", "app/api/auth/[...auth]/route.ts");
    const dispatchRoute = loadPortalModule<
      ReturnType<typeof authHandlers.createTenantAuthHandlers>
    >("apps/enterprise-dispatch-web", "app/api/auth/[...auth]/route.ts");

    // 1. Google choice on /invite carries the same token to /api/auth/tenant/invitation-login
    const oidcInviteRes = await tenantRoute.GET(
      new NextRequest(
        `https://tenant.drts.invalid${String(googleLinks[0]?.props.href)}`,
      ),
      { params: Promise.resolve({ auth: ["tenant", "login"] }) },
    );
    expect(oidcInviteRes.status).toBe(307);
    expect(oidcInviteRes.headers.get("location")).toContain(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(upstreamCalls[0]).toEqual({
      url: "/api/auth/tenant/invitation-login",
      method: "POST",
      body: {
        invitationToken: token,
        redirectUri: "https://tenant.drts.invalid/api/auth/tenant/callback",
      },
    });

    // 2. Password choice on /invite submits the same token to /api/tenant/invitations/accept-with-password
    const passwordInviteRes = await tenantRoute.POST(
      new NextRequest(
        "https://tenant.drts.invalid/api/auth/tenant/invitation/accept-with-password",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            invitationToken: token,
            password: "ValidPassword#2026",
          }),
        },
      ),
      {
        params: Promise.resolve({
          auth: ["tenant", "invitation", "accept-with-password"],
        }),
      },
    );
    expect(passwordInviteRes.status).toBe(200);
    expect(upstreamCalls[1]).toEqual({
      url: "/api/tenant/invitations/accept-with-password",
      method: "POST",
      body: {
        invitationToken: token,
        password: "ValidPassword#2026",
      },
    });

    // 3. Shared tenant realm password-reset confirm and password-login work for Enterprise Dispatch user
    const resetConfirmRes = await tenantRoute.POST(
      new NextRequest(
        "https://tenant.drts.invalid/api/auth/tenant/password-reset/confirm",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            token: "pwr_shared_tenant_dispatch_token",
            password: "ResetPassword#2026",
          }),
        },
      ),
      {
        params: Promise.resolve({
          auth: ["tenant", "password-reset", "confirm"],
        }),
      },
    );
    expect(resetConfirmRes.status).toBe(200);

    const dispatchLoginRes = await dispatchRoute.POST(
      new NextRequest(
        "https://dispatch.drts.invalid/api/auth/tenant/password-login",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: "dispatcher@tenant.drts.invalid",
            password: "ResetPassword#2026",
          }),
        },
      ),
      {
        params: Promise.resolve({ auth: ["tenant", "password-login"] }),
      },
    );
    expect(dispatchLoginRes.status).toBe(200);
    expect(upstreamCalls.slice(2)).toEqual([
      {
        url: "/api/auth/tenant/password-reset/confirm",
        method: "POST",
        body: {
          token: "pwr_shared_tenant_dispatch_token",
          password: "ResetPassword#2026",
        },
      },
      {
        url: "/api/auth/tenant/password-login",
        method: "POST",
        body: {
          email: "dispatcher@tenant.drts.invalid",
          password: "ResetPassword#2026",
        },
      },
    ]);
  });
});
