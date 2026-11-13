import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { OidcPkceService } from "../../../apps/api/src/modules/auth/oidc-pkce.service";
import { buildAgencyInvitationEmailBody } from "../../../apps/api/src/modules/agency-access/agency-invitation-delivery.service";

const require = createRequire(import.meta.url);
const {
  buildPlan,
} = require("../../../operations/verification/production-release-rail/rail.cjs");
const {
  preflight,
} = require("../../../operations/verification/production-release-rail/preflight.cjs");
const {
  deploy,
  assertProbe,
} = require("../../../operations/verification/production-release-rail/run.cjs");
const {
  fixture,
  SHA,
  TAG,
  DEPLOYER,
} = require("../sr-prod-full-surface-rail-20261012/fixture.cjs");
const collector = require("../../../operations/verification/production-readonly-inventory/collector.cjs");
const {
  fixture: inventoryFixture,
  SHA: INVENTORY_SHA,
} = require("../sr-prod-readonly-inventory-20261012/fixture.cjs");
const AGENCY = "agency-portal-web";
const AGENCY_ORIGIN = "https://agency-portal-web.drts.invalid";
const AGENCY_EXPECT = {
  "data.active": true,
  "data.identity.realm": "agency",
  "data.identity.actor_type": "agency_user",
  "data.identity.agency_id": "agency-fixture",
};

function configuredFixture() {
  const f = fixture();
  Object.assign(f.vars, {
    PROD_GCP_AGENCY_PORTAL_SERVICE: "drts-prod-agency-portal-web",
    PROD_AGENCY_PORTAL_ORIGIN: AGENCY_ORIGIN,
    PROD_AGENCY_PORTAL_IAP_CLIENT_ID: "agency-portal-web-iap-client",
  });
  const origins = f.vars.PROD_AUTH_ALLOWED_ORIGINS.split(/[;,]/);
  if (!origins.includes(AGENCY_ORIGIN)) origins.push(AGENCY_ORIGIN);
  f.vars.PROD_AUTH_ALLOWED_ORIGINS = origins.join(";");
  const smoke = JSON.parse(f.vars.PROD_RELEASE_SMOKE_CONFIG_JSON);
  smoke[AGENCY] = { path: "/api/auth/session", expect: AGENCY_EXPECT };
  f.vars.PROD_RELEASE_SMOKE_CONFIG_JSON = JSON.stringify(smoke);
  f.headers[AGENCY] = { cookie: "drts_agency_session=fixture-agency-token" };
  f.values["drts-prod-release-smoke-headers"] = JSON.stringify(f.headers);
  return f;
}

afterEach(() => vi.unstubAllEnvs());

// Real release builders, OIDC validation and inventory collector execute.
// Only cloud/Secret Manager/HTTP metadata ports use the existing SIM fixtures.
describe("Agency existing production end-to-end release wiring", () => {
  it("builds and deploys the Agency image at its actual port while retaining all original services", () => {
    for (const allowUnauthenticated of [false, true]) {
      const f = configuredFixture();
      if (allowUnauthenticated) {
        f.vars.PROD_AGENCY_PORTAL_ALLOW_UNAUTHENTICATED = "true";
      } else {
        delete f.vars.PROD_AGENCY_PORTAL_ALLOW_UNAUTHENTICATED;
      }
      const plan = preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud);
      const agency = plan.services.find(
        (service: { id: string }) => service.id === AGENCY,
      );
      expect(agency).toBeDefined();
      expect(agency).toMatchObject({
        id: AGENCY,
        name: "drts-prod-agency-portal-web",
        port: 3012,
        origin: AGENCY_ORIGIN,
        probe: { path: "/api/auth/session", expect: AGENCY_EXPECT },
      });
      expect(plan.services).toHaveLength(11);
      expect(plan.builds).toContainEqual({
        id: AGENCY,
        dockerfile: "apps/agency-portal-web/Dockerfile",
      });
      expect(plan.builds).toHaveLength(12);
      const images = Object.fromEntries(
        plan.builds.map((build: { id: string }) => [
          build.id,
          `${plan.registry}/${build.id}@sha256:${"a".repeat(64)}`,
        ]),
      );
      const commands: string[][] = [];
      deploy(plan, images, (args: string[]) => {
        commands.push(args);
        return "[]";
      });
      const deployments = commands.filter((args) => args[1] === "deploy");
      expect(deployments).toHaveLength(11);
      const command = deployments.find((args) => args[2] === agency.name)!;
      expect(command[command.indexOf("--port") + 1]).toBe("3012");
      expect(command[command.indexOf("--image") + 1]).toBe(images[AGENCY]);
      if (allowUnauthenticated) {
        expect(command).toContain("--allow-unauthenticated");
        expect(command).not.toContain("--no-allow-unauthenticated");
      } else {
        expect(command).toContain("--no-allow-unauthenticated");
        expect(command).not.toContain("--allow-unauthenticated");
      }
    }
  });

  it("delivers the Agency BFF state mount and a real invitation link to the configured Agency host", () => {
    const f = configuredFixture();
    const plan = preflight(f.vars, SHA, TAG, DEPLOYER, f.cloud);
    const agency = plan.services.find(
      (service: { id: string }) => service.id === AGENCY,
    );
    expect(agency).toBeDefined();
    expect(agency.secrets.BFF_STATE_SECRET).toBe(
      "drts-prod-bff-state-secret:7",
    );
    const api = plan.services.find(
      (service: { id: string }) => service.id === "api",
    );
    expect(api.env.AGENCY_INVITATION_ACCEPT_URL_BASE).toBe(
      `${AGENCY_ORIGIN}/invite`,
    );
    const body = buildAgencyInvitationEmailBody(
      {
        invitationId: "fixture-invitation",
        agencyId: "agency-fixture",
        agencyDisplayName: "Agency fixture",
        recipientEmail: "reviewer@agency.invalid",
        expiresAt: "2026-11-30T00:00:00Z",
        accessValidTo: "2026-12-31T00:00:00Z",
        rawToken: "fixture-token/one",
      },
      api.env.AGENCY_INVITATION_ACCEPT_URL_BASE,
    );
    expect(body).toContain(`${AGENCY_ORIGIN}/invite?token=fixture-token%2Fone`);
    assertProbe(
      agency,
      { status: 200 },
      JSON.stringify({
        data: {
          active: true,
          identity: {
            realm: "agency",
            actor_type: "agency_user",
            agency_id: "agency-fixture",
          },
        },
      }),
    );
    expect(() =>
      assertProbe(
        agency,
        { status: 200 },
        JSON.stringify({
          data: {
            active: true,
            identity: {
              realm: "tenant",
              actor_type: "agency_user",
              agency_id: "agency-fixture",
            },
          },
        }),
      ),
    ).toThrow(/protected smoke response contract/);
  });

  it("passes every configured callback origin to the actual OIDC validator without changing the allowed hosts", () => {
    const f = configuredFixture();
    const plan = buildPlan(f.vars, SHA, TAG, DEPLOYER);
    const api = plan.services.find(
      (service: { id: string }) => service.id === "api",
    );
    vi.stubEnv("AUTH_ALLOWED_ORIGINS", api.env.AUTH_ALLOWED_ORIGINS);
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("DRTS_ENV", "production");
    for (const origin of f.vars.PROD_AUTH_ALLOWED_ORIGINS.split(/[;,]/)) {
      const callback = `${origin}/api/auth/agency/callback`;
      expect(OidcPkceService.prototype.validateRedirectUri(callback)).toBe(
        callback,
      );
    }
    let rejection: unknown;
    try {
      OidcPkceService.prototype.validateRedirectUri(
        "https://unconfigured.agency.invalid/api/auth/agency/callback",
      );
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toBeInstanceOf(ApiRequestError);
    if (!(rejection instanceof ApiRequestError))
      throw new Error("Expected the existing OIDC rejection.");
    expect(rejection.getStatus()).toBe(400);
    expect(rejection.getResponse()).toMatchObject({
      error: {
        code: "AUTH_SESSION_EXCHANGE_DENIED",
        message: expect.stringContaining("not allowed"),
      },
    });
  });

  it("collects and serializes the Agency service, revision, policy and image through the original inventory flow", async () => {
    const f = inventoryFixture(
      { PROD_GCP_AGENCY_PORTAL_SERVICE: "prod-agency-portal-web" },
      collector,
    );
    const report = await collector.collect(f.env, INVENTORY_SHA, f.transport);
    expect(report.collection).toBe("complete");
    for (const [kind, id] of [
      ["service", AGENCY],
      ["revision", `${AGENCY}:prod-${AGENCY}-00001`],
      ["policy", `${AGENCY}-policy`],
    ]) {
      if (kind === "revision") {
        expect(
          report.records.some(
            (record: { kind: string; id: string; status: string }) =>
              record.kind === kind &&
              record.id.startsWith(`${AGENCY}:`) &&
              record.status === "observed",
          ),
        ).toBe(true);
      } else {
        expect(report.records).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ kind, id, status: "observed" }),
          ]),
        );
      }
    }
    expect(
      report.records.filter(
        (record: { kind: string }) => record.kind === "service",
      ),
    ).toHaveLength(11);
    const image = `${f.plan.registry}/agency-portal-web@sha256:${"c".repeat(64)}`;
    expect(
      report.records.find(
        (record: { kind: string }) => record.kind === "images",
      ).data.items,
    ).toContainEqual({ uri: image });
    expect(collector.serialize(report)).toContain(image);
    expect(
      f.calls.every((call: { method: string }) => call.method === "GET"),
    ).toBe(true);
  });
});
