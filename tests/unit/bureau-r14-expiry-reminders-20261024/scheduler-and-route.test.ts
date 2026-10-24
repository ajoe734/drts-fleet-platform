import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { EventEmitter } from "node:events";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ExecutionContext } from "@nestjs/common";
import * as jwt from "jsonwebtoken";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BootstrapAuthGuard,
  JwtAuthService,
} from "../../../apps/api/src/common/auth";
import { matchesScope } from "../../../apps/api/src/common/auth/internal-key-exception-registry";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { GoogleWorkloadIdentityAdapter } from "../../../apps/api/src/modules/auth/google-workload-identity.adapter";
import { DriverProfileRepository } from "../../../apps/api/src/modules/driver-profile/driver-profile.repository";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { IdentityRepository } from "../../../apps/api/src/modules/identity/identity.repository";
import { NotificationDeliveryService } from "../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import { MemoryMailOutbox } from "../system-remediation/sr-credential-expiry-20260913/test-helpers";

const apiRequire = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
const { Reflector } = apiRequire("@nestjs/core");
import { RegulatoryExpiryScheduledController } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.controller";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";

const repoRoot = path.resolve(__dirname, "../../..");
const devSchedulerScriptPath = path.join(
  repoRoot,
  "infra/gcp/dev/scheduler/provision-dev-scheduler.sh",
);
const opsSchedulerScriptPath = path.join(
  repoRoot,
  "operations/deployment/provision-regulatory-expiry-scheduler.sh",
);

const API_ORIGIN = "https://drts-dev-api-r6ykdme3wa-uc.a.run.app";
const SCHEDULER_SA =
  "drts-dev-scheduler@drts-dev-devcc-20260825.iam.gserviceaccount.com";
const REGULATORY_EXPIRY_ROUTE_SCOPE =
  "POST internal/scheduled-tasks/regulatory-expiry/run";

function runOpsProvisionScript(
  env: Record<string, string | undefined>,
  describeExit = 1,
) {
  const dir = mkdtempSync(path.join(tmpdir(), "r14-scheduler-"));
  const log = path.join(dir, "gcloud.log");
  const gcloud = path.join(dir, "gcloud");
  writeFileSync(
    gcloud,
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${log}"\nif [ "$3" = "describe" ]; then exit ${describeExit}; fi\n`,
  );
  chmodSync(gcloud, 0o755);
  try {
    execFileSync("bash", [opsSchedulerScriptPath], {
      env: {
        PATH: `${dir}:${process.env.PATH ?? ""}`,
        ...env,
      },
      encoding: "utf8",
      stdio: "pipe",
    });
    return {
      ok: true,
      calls: readFileSync(log, "utf8").trim().split("\n").filter(Boolean),
    };
  } catch (error) {
    const err = error as { stderr?: string; stdout?: string };
    return {
      ok: false,
      stderr: `${err.stdout ?? ""}${err.stderr ?? ""}`,
      calls: (() => {
        try {
          return readFileSync(log, "utf8").trim().split("\n").filter(Boolean);
        } catch {
          return [];
        }
      })(),
    };
  }
}

describe("BUREAU-R14: Scheduled Reconciliation Route & Provisioning Scripts", () => {
  let keyCounter = 0;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("matches POST /api/internal/scheduled-tasks/regulatory-expiry/run via matchesScope and denies other methods/paths", () => {
    expect(
      matchesScope(
        REGULATORY_EXPIRY_ROUTE_SCOPE,
        "POST",
        "/api/internal/scheduled-tasks/regulatory-expiry/run",
      ),
    ).toBe(true);
    expect(
      matchesScope(
        REGULATORY_EXPIRY_ROUTE_SCOPE,
        "GET",
        "/api/internal/scheduled-tasks/regulatory-expiry/run",
      ),
    ).toBe(false);
    expect(
      matchesScope(
        REGULATORY_EXPIRY_ROUTE_SCOPE,
        "POST",
        "/api/regulatory-registry/credentials/reconcile-expiry",
      ),
    ).toBe(false);
  });

  it("authenticates Cloud Scheduler OIDC tokens through BootstrapAuthGuard + GoogleWorkloadIdentityAdapter and runs RegulatoryExpiryScheduledController", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const jwk = publicKey.export({ format: "jwk" }) as {
      kty: string;
      n: string;
      e: string;
    };
    const kid = `r14-scheduler-key-${++keyCounter}`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ keys: [{ kty: jwk.kty, kid, n: jwk.n, e: jwk.e }] }),
          { status: 200 },
        ),
      ),
    );
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      {
        iss: "https://accounts.google.com",
        sub: "r14-scheduler-subject",
        email: SCHEDULER_SA,
        email_verified: true,
        aud: API_ORIGIN,
        iat: now,
        exp: now + 300,
      },
      privateKey,
      { algorithm: "RS256", keyid: kid },
    );

    vi.stubEnv(
      "WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS",
      JSON.stringify([
        {
          serviceAccountEmail: SCHEDULER_SA,
          principalId: "dev-scheduler",
          allowedTokenAudiences: [API_ORIGIN],
          routeScopes: [REGULATORY_EXPIRY_ROUTE_SCOPE],
          scopes: ["regulatory-registry:expiry-reconcile:run"],
        },
      ]),
    );
    vi.stubEnv("REGULATORY_ALERT_RECIPIENT_EMAIL", "reg-alerts@platform.tw");

    const adapter = new GoogleWorkloadIdentityAdapter(new IdentityRepository());
    const guard = new BootstrapAuthGuard(
      new Reflector(),
      new JwtAuthService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      adapter,
    );

    const outbox = new MemoryMailOutbox();
    const notification = new NotificationDeliveryService(outbox);
    const repository = new RegulatoryRegistryRepository();
    const service = new RegulatoryRegistryService(
      new OpsDispatchEventsService(new EventEmitter() as never),
      new AuditNotificationService(),
      new DriverProfileService(
        new AuditNotificationService(),
        new DriverProfileRepository(),
      ),
      repository,
      notification,
    );
    service.registerFleetPartnerContacts("partner-demo-001", [
      "partner1@fleet.tw",
    ]);
    const scheduledController = new RegulatoryExpiryScheduledController(
      service,
    );

    const req: Record<string, unknown> = {
      method: "POST",
      originalUrl: "/api/internal/scheduled-tasks/regulatory-expiry/run",
      url: "/api/internal/scheduled-tasks/regulatory-expiry/run",
      headers: {
        authorization: `Bearer ${token}`,
      },
    };
    const context = {
      getHandler: () => RegulatoryExpiryScheduledController.prototype.run,
      getClass: () => RegulatoryExpiryScheduledController,
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as unknown as ExecutionContext;

    const allowed = await guard.canActivate(context);
    expect(allowed).toBe(true);
    expect(req.identity).toMatchObject({
      actorId: "dev-scheduler",
      actorType: "system",
      realm: "system",
      scopes: ["regulatory-registry:expiry-reconcile:run"],
    });

    const response = await scheduledController.run(
      { asOf: "2026-12-10T00:00:00.000Z" },
      req.identity as never,
      "req-r14-sched-001",
    );
    expect(response.meta.requestId).toBe("req-r14-sched-001");
    expect(response.data.preexpiry?.eventsCreated).toBeGreaterThan(0);
    expect(response.data.preexpiry?.intentsCreated).toBeGreaterThan(0);
  });

  it("rejects non-system or wrong-scope identities in RegulatoryExpiryScheduledController", async () => {
    const service = new RegulatoryRegistryService(
      new OpsDispatchEventsService(new EventEmitter() as never),
      new AuditNotificationService(),
      new DriverProfileService(
        new AuditNotificationService(),
        new DriverProfileRepository(),
      ),
      new RegulatoryRegistryRepository(),
    );
    const controller = new RegulatoryExpiryScheduledController(service);

    await expect(
      controller.run(
        {},
        {
          actorId: "ops-user-1",
          actorType: "ops_user",
          realm: "ops",
          scopes: ["regulatory-registry:expiry-reconcile:run"],
        } as never,
      ),
    ).rejects.toMatchObject({
      status: 403,
      code: "AUTHZ_SCOPE_DENIED",
    });

    await expect(
      controller.run(
        {},
        {
          actorId: "dev-scheduler",
          actorType: "system",
          realm: "system",
          scopes: ["notification-delivery:drain"],
        } as never,
      ),
    ).rejects.toMatchObject({
      status: 403,
      code: "AUTHZ_SCOPE_DENIED",
    });
  });

  it("wires regulatory-expiry/run into infra/gcp/dev/scheduler/provision-dev-scheduler.sh", () => {
    const devScript = readFileSync(devSchedulerScriptPath, "utf8");
    expect(devScript).toContain("drts-dev-regulatory-expiry-run");
    expect(devScript).toContain(
      "internal/scheduled-tasks/regulatory-expiry/run",
    );
    expect(devScript).toContain(
      'create_or_update_job "$REGULATORY_EXPIRY_JOB" "$REGULATORY_EXPIRY_SCHEDULE" "$REGULATORY_EXPIRY_URI"',
    );
  });

  it("provisions and updates drts-regulatory-expiry via operations/deployment/provision-regulatory-expiry-scheduler.sh and validates parameters", () => {
    const baseEnv = {
      PROJECT_ID: "drts-dev-devcc-20260825",
      REGION: "us-central1",
      API_ORIGIN: API_ORIGIN,
      SCHEDULER_SERVICE_ACCOUNT: SCHEDULER_SA,
      REGULATORY_EXPIRY_SCHEDULE: "*/15 * * * *",
      TIME_ZONE: "Asia/Taipei",
    };

    const created = runOpsProvisionScript(baseEnv, 1);
    expect(created.ok).toBe(true);
    expect(created.calls).toEqual([
      "scheduler jobs describe drts-regulatory-expiry --project drts-dev-devcc-20260825 --location us-central1",
      `scheduler jobs create http drts-regulatory-expiry --project drts-dev-devcc-20260825 --location us-central1 --schedule */15 * * * * --time-zone Asia/Taipei --uri ${API_ORIGIN}/api/internal/scheduled-tasks/regulatory-expiry/run --http-method POST --headers Content-Type=application/json --message-body {} --oidc-service-account-email ${SCHEDULER_SA} --oidc-token-audience ${API_ORIGIN}`,
    ]);

    const updated = runOpsProvisionScript(baseEnv, 0);
    expect(updated.ok).toBe(true);
    expect(updated.calls[1]).toContain(
      "scheduler jobs update http drts-regulatory-expiry",
    );

    const invalidOrigin = runOpsProvisionScript({
      ...baseEnv,
      API_ORIGIN: "http://insecure.example.com/",
    });
    expect(invalidOrigin.ok).toBe(false);
    expect(invalidOrigin.calls).toEqual([]);
  });
});
