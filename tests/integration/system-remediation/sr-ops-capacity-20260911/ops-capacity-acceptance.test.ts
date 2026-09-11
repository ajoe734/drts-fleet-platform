import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// SR-OPS-CAPACITY-RUNNER-20260911 (C123): real, GitHub-hosted-only capacity
// acceptance. This VM never hosts Postgres, so DATABASE_URL is unset locally
// and this test skips; the dedicated ops-capacity-acceptance.yml workflow
// supplies a real, migrated, disposable loopback Postgres and executes this
// test for real:
//
//   - boots the real, compiled `AppModule` (not a stripped test module) with
//     a real Postgres-backed `DatabaseService`
//   - mints a real tenant JWT through the real HTTP
//     `POST /api/auth/tenant/bootstrap-session` endpoint, and a real
//     platform JWT via the SAME running app's own `JwtAuthService`, signed
//     against the automatically-provisioned default platform admin identity
//     (`IdentityRepository.ensureDefaultPlatformAccount`, real Postgres rows)
//   - pre-provisions real dispatchable orders over real HTTP
//   - reuses the accepted SR-OPS-PROOF-001 (C122) load generator
//     (`tools/system-remediation/ops-proof/capacity.mjs`) to run the full,
//     accepted 900-second (15 minute) booking/dispatch/report baseline
//     burst against the real listening server
//   - independently reads back every resource ID the HTTP layer claimed to
//     have created directly from Postgres, so a fabricated "success"
//     response cannot pass this gate

const require = createRequire(
  new URL("../../../../apps/api/package.json", import.meta.url),
);
const { Pool } = require("pg") as {
  Pool: new (options?: { connectionString?: string | undefined }) => {
    query: <R = Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ) => Promise<{ rows: R[] }>;
    end: () => Promise<void>;
  };
};

// Manually typed instead of `typeof import("@nestjs/core")`: that type-only
// form resolves relative to *this file's* location under `tests/`, where
// "@nestjs/core" isn't installed (it's a dependency of apps/api, hoisted
// only into apps/api/node_modules) -- so it fails the repo-root `tsc`
// typecheck even though the `require(...)` value resolution above works.
type NestApplication = {
  setGlobalPrefix: (prefix: string, options?: { exclude?: string[] }) => void;
  init: () => Promise<unknown>;
  listen: (port: number, host: string) => Promise<unknown>;
  getHttpServer: () => { address: () => unknown };
  get: <T>(token: new (...args: never[]) => T) => T;
  close: () => Promise<unknown>;
};

const DATABASE_URL = process.env.DATABASE_URL;
// Gated on a dedicated marker, not just DATABASE_URL: the repo's generic
// "unit"/"Product smoke acceptance" CI jobs also export a (deliberately
// unmigrated) DATABASE_URL for *their own* unrelated tests, so gating on
// DATABASE_URL alone would make this real-AppModule/real-Postgres run get
// swept into those jobs too and fail on missing schema there. Only the
// dedicated ops-capacity-acceptance.yml workflow sets
// DRTS_OPS_CAPACITY_ACCEPTANCE, after it has actually migrated its own
// disposable database -- same pattern as sr-ops-proof-001's dedicated
// DRTS_OPS_PROOF_*_DATABASE_URL gates.
const isConfigured =
  Boolean(DATABASE_URL) && process.env.DRTS_OPS_CAPACITY_ACCEPTANCE === "1";

const DURATION_SECONDS = 900;
const MAX_IN_FLIGHT = 500;
const TENANT_ID = "tenant-demo-001";
// tenant_ops_admin is the seeded demo role that carries both `tenant:write`
// (tenant/bookings) and `owned:write` (orders/:orderId/dispatch); the seeded
// tenant_admin role only carries the former, so it cannot dispatch.
const TENANT_DISPATCH_EMAIL = "ops@acme.example";

describe("SR-OPS-CAPACITY-RUNNER-20260911 real capacity + durable readback acceptance", () => {
  it.skipIf(!isConfigured)(
    "executes the real full 900s booking/dispatch/report baseline against the real AppModule/JWT/Postgres and independently reads back every claimed resource",
    async () => {
      process.env.AUTH_MODE = process.env.AUTH_MODE ?? "test";
      process.env.DRTS_TENANT_BOOTSTRAP_MODE = "fixture";

      // "@nestjs/core" is a dependency of the apps/api package, not this
      // repo-root package; a bare-specifier `import("@nestjs/core")` from
      // this file resolves relative to *this* file's location and fails.
      // Route it through the same apps/api-rooted `require` used for `pg`
      // above so Node resolves it from apps/api/node_modules instead.
      const { NestFactory } = require("@nestjs/core") as {
        NestFactory: {
          create: (
            module: unknown,
            options?: { logger?: boolean },
          ) => Promise<NestApplication>;
        };
      };
      const { AppModule } = await import("../../../../apps/api/src/app.module");
      const { JwtAuthService } = await import(
        "../../../../apps/api/src/common/auth/jwt-auth.service"
      );
      const { IdentityRepository } = await import(
        "../../../../apps/api/src/modules/identity/identity.repository"
      );
      const { AUTH_SCOPE_PRESETS } = await import(
        "../../../../apps/api/src/common/auth/auth.constants"
      );
      const { SecurityEventsService } = await import(
        "../../../../apps/api/src/modules/security-events/security-events.service"
      );
      const { TenantPartnerService } = await import(
        "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service"
      );
      const { detectAuthEnvironment } = await import(
        "../../../../apps/api/src/config/auth-startup-config"
      );
      const { buildCapacityPlan, countsForDuration } = await import(
        "../../../../tools/system-remediation/ops-capacity/plan-builder.mjs"
      );
      // capacity.mjs belongs to the already-accepted SR-OPS-PROOF-001 (C122)
      // task and is out of this task's write scope, so it has no .d.mts
      // declaration file; suppress the resulting no-declaration error here
      // rather than adding one outside this task's owned paths.
      // @ts-expect-error -- TS7016: no declaration file for capacity.mjs
      const { runPlan } = await import("../../../../tools/system-remediation/ops-proof/capacity.mjs");
      const { readBackOwnedOrders, readBackReportJobs, summarizeReadback, summarizeLag } =
        await import("../../../../tools/system-remediation/ops-capacity/durable-readback.mjs");

      const evidenceDir = resolve(
        __dirname,
        "../../../../.artifacts/ops-capacity-acceptance",
      );
      mkdirSync(evidenceDir, { recursive: true });
      const runTag = `sr-ops-capacity-${Date.now()}`;

      const pool = new Pool({ connectionString: DATABASE_URL });
      const app = await NestFactory.create(AppModule, { logger: false });
      app.setGlobalPrefix("api", { exclude: ["health", "metrics"] });
      await app.init();
      await app.listen(0, "127.0.0.1");

      try {
        const address = app.getHttpServer().address() as AddressInfo;
        const baseUrl = `http://127.0.0.1:${address.port}`;

        // --- Setup phase (not part of the measured burst): pre-provision
        // real dispatchable orders over real HTTP, using a legitimate
        // ops_user bootstrap identity (non-strict test environment). Each
        // seed request carries its own distinct actor-id: the real
        // `BootstrapThrottlerGuard` (apps/api/src/common/throttling) tracks
        // the global 60-req/min limit per actor-id, and a single shared
        // seed identity across dozens of concurrent workers would collapse
        // onto one throttle bucket and trip the app's own real rate limiter
        // before the (unrelated, unmeasured) seed phase even finishes --
        // that's a false negative from the harness, not a signal about the
        // measured booking/dispatch/report burst.
        const dispatchCount = countsForDuration(DURATION_SECONDS).dispatch;
        const orderIds: string[] = new Array(dispatchCount);
        let nextIndex = 0;
        async function seedWorker() {
          for (;;) {
            const index = nextIndex;
            nextIndex += 1;
            if (index >= dispatchCount) {
              return;
            }
            const response = await fetch(`${baseUrl}/api/orders`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-actor-type": "ops_user",
                "x-actor-id": `sr-ops-capacity-seed-${index}`,
                "x-request-id": `${runTag}-seed-req-${index}`,
                "idempotency-key": `${runTag}-seed-${index}`,
              },
              body: JSON.stringify({
                pickup: { address: `SR-OPS-CAPACITY seed pickup ${index}` },
                dropoff: { address: `SR-OPS-CAPACITY seed dropoff ${index}` },
                passenger: {
                  name: `SR-OPS-CAPACITY seed passenger ${index}`,
                  phone: `08${String(index % 100000000).padStart(8, "0")}`,
                },
              }),
            });
            if (!response.ok) {
              throw new Error(
                `Dispatchable order seed #${index} failed: HTTP ${response.status} ${await response.text()}`,
              );
            }
            const rawBody = await response.text();
            // The API's global snake-case interceptor
            // (apps/api/src/common/snake-case.interceptor.ts) rewrites every
            // response body key from camelCase to snake_case, so the wire
            // field is `order_id`, not the controller's in-code `orderId`.
            let body: { data?: { order_id?: unknown } };
            try {
              body = JSON.parse(rawBody) as { data?: { order_id?: unknown } };
            } catch (parseError) {
              throw new Error(
                `Dispatchable order seed #${index} returned HTTP ${response.status} with unparseable JSON body: ${rawBody.slice(0, 500)} (${
                  parseError instanceof Error ? parseError.message : String(parseError)
                })`,
              );
            }
            const orderId = body?.data?.order_id;
            if (typeof orderId !== "string" || orderId.length === 0) {
              throw new Error(
                `Dispatchable order seed #${index} returned HTTP ${response.status} but no valid orderId in body: ${rawBody.slice(0, 500)}`,
              );
            }
            orderIds[index] = orderId;
          }
        }
        await Promise.all(
          Array.from({ length: Math.min(40, dispatchCount) }, seedWorker),
        );
        expect(orderIds).toHaveLength(dispatchCount);
        expect(orderIds.every((id) => typeof id === "string" && id.length > 0)).toBe(true);

        // --- Mint a real tenant JWT via the real HTTP bootstrap-session route.
        const tenantSessionResponse = await fetch(
          `${baseUrl}/api/auth/tenant/bootstrap-session`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: TENANT_DISPATCH_EMAIL, tenantId: TENANT_ID }),
          },
        );
        if (!tenantSessionResponse.ok) {
          // The controller deliberately collapses every internal failure
          // reason into the same public AUTH_SESSION_EXCHANGE_DENIED 403 for
          // this open, unauthenticated route (see
          // apps/api/src/common/iam-error-codes.ts toPublicTenantAuthError),
          // AND both of the controller's own denial branches (fixture mode
          // disabled vs. tenant user not found/ineligible, see
          // apps/api/src/modules/auth/auth.controller.ts
          // assertTenantBootstrapFixtureModeEnabled /
          // buildTenantBootstrapDeniedError) construct the exact same
          // "AUTH_SESSION_EXCHANGE_DENIED" code, so the unmasked security
          // event reasonCode alone cannot distinguish which branch fired.
          // Inspect the same running app instance's own state directly to
          // tell them apart instead of guessing.
          const securityEventsService = app.get(SecurityEventsService);
          const recentDenials = await securityEventsService.listEvents(null, {
            eventType: "tenant_bootstrap_session.denied",
            limit: 5,
          });
          const tenantPartnerService = app.get(TenantPartnerService);
          const tenantUsers = tenantPartnerService.listTenantUsers(TENANT_ID);
          const matchingUser = tenantUsers.find(
            (user: { email: string }) => user.email === TENANT_DISPATCH_EMAIL,
          );
          throw new Error(
            `tenant bootstrap-session failed: HTTP ${tenantSessionResponse.status} ${await tenantSessionResponse.text()} | unmasked reasonCode(s): ${JSON.stringify(
              recentDenials.map((event) => ({
                reasonCode: event.reasonCode,
                occurredAt: event.occurredAt,
              })),
            )} | authEnvironment=${detectAuthEnvironment(process.env)} DRTS_TENANT_BOOTSTRAP_MODE=${JSON.stringify(process.env.DRTS_TENANT_BOOTSTRAP_MODE)} CI=${JSON.stringify(process.env.CI)} NODE_ENV=${JSON.stringify(process.env.NODE_ENV)} | tenantUserCount=${tenantUsers.length} matchingUser=${JSON.stringify(matchingUser ?? null)}`,
          );
        }
        // Same global snake-case interceptor as above: the wire field is
        // `access_token`, not the service layer's in-code `accessToken`.
        const tenantSessionBody = (await tenantSessionResponse.json()) as {
          data: { access_token: string };
        };
        const tenantJwt = tenantSessionBody.data.access_token;

        // --- Mint a real platform JWT in-process, via the SAME running
        // AppModule's own JwtAuthService, against the durable default
        // platform admin account IdentityRepository provisions at boot.
        const jwtAuthService = app.get(JwtAuthService);
        const identityRepository = app.get(IdentityRepository);
        const platformPrincipal = await identityRepository.findPrincipalById(
          "principal_platform_admin_default",
        );
        const platformMemberships = await identityRepository.findMembershipsByPrincipalId(
          "principal_platform_admin_default",
        );
        const platformMembership = platformMemberships.find(
          (membership: { membershipId: string }) =>
            membership.membershipId === "membership_platform_admin_default",
        );
        if (!platformPrincipal || !platformMembership) {
          throw new Error(
            "Default platform admin account was not durably provisioned by IdentityRepository.onModuleInit; cannot mint a real platform-realm JWT.",
          );
        }
        const platformRoleBindings = await identityRepository.findRoleBindingsByMembershipId(
          platformMembership.membershipId,
        );
        const platformTokenVersion = Math.max(
          Date.parse(platformPrincipal.updatedAt),
          Date.parse(platformMembership.updatedAt),
          ...platformRoleBindings.map((binding: { updatedAt: string }) =>
            Date.parse(binding.updatedAt),
          ),
        );
        const issuedPlatformSession = await jwtAuthService.issueSessionToken(
          {
            authMode: "jwt_bearer",
            actorType: "platform_admin",
            actorId: platformPrincipal.principalId,
            principalId: platformPrincipal.principalId,
            membershipId: platformMembership.membershipId,
            subject: platformPrincipal.subject,
            realm: "platform",
            tenantId: null,
            roleFamilies: ["platform"],
            roles: platformRoleBindings.map(
              (binding: { roleCode: string }) => binding.roleCode,
            ),
            scopes: [...AUTH_SCOPE_PRESETS.platform_admin],
            requestId: null,
          },
          {
            tokenVersion: platformTokenVersion,
            ensurePrincipal: false,
            principalId: platformPrincipal.principalId,
            membershipId: platformMembership.membershipId,
            subject: platformPrincipal.subject,
          },
        );
        const platformJwt = issuedPlatformSession.token;

        // --- Build and execute the real, full 900-second accepted baseline.
        const plan = buildCapacityPlan({
          origin: `${baseUrl}/`,
          durationSeconds: DURATION_SECONDS,
          maxInFlight: MAX_IN_FLIGHT,
          isolatedResourceId: runTag,
          tenantId: TENANT_ID,
          tenantJwt,
          dispatchJwt: tenantJwt,
          reportJwt: platformJwt,
          orderIds,
          runTag,
        });

        const recordsPath = resolve(evidenceDir, `${runTag}.jsonl`);
        const summary = await runPlan(plan, recordsPath, {
          baseSha: process.env.WORKFLOW_SHA ?? "local",
          candidateSha: process.env.CANDIDATE_SHA ?? "local",
        });

        // The run must be the full accepted 15-minute baseline burst, never
        // a short/mock/skipped stand-in.
        expect(summary.durationSeconds).toBe(DURATION_SECONDS);
        expect(summary.fullBurstSchedule).toBe(true);
        expect(summary.workflows.booking.requests).toBe(plan.workloads.booking.length);
        expect(summary.workflows.dispatch.requests).toBe(plan.workloads.dispatch.length);
        expect(summary.workflows.report.requests).toBe(plan.workloads.report.length);
        expect(plan.workloads.booking).toHaveLength(900);
        expect(plan.workloads.dispatch).toHaveLength(4500);
        expect(plan.workloads.report).toHaveLength(450);

        type CapacityRecord = {
          workload: "booking" | "dispatch" | "report";
          path: string;
          error: string | null;
          resourceIds?: Record<string, string>;
        };
        const records: CapacityRecord[] = readFileSync(recordsPath, "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line));

        // --- Independent, direct-SQL durable readback: every resource ID
        // the HTTP layer's success response claimed to have created must
        // exist as a real row. A response the load generator itself marked
        // as `error` never enters this claim -- an honestly reported
        // failure is not a fabricated success.
        const claimedBookingOrderIds = records
          .filter((row) => row.workload === "booking" && !row.error && row.resourceIds?.orderId)
          .map((row) => row.resourceIds!.orderId!);
        const claimedDispatchOrderIds = records
          .filter((row) => row.workload === "dispatch" && !row.error)
          .map((row) => row.path.split("/")[3]!);
        const claimedReportJobIds = records
          .filter((row) => row.workload === "report" && !row.error && row.resourceIds?.jobId)
          .map((row) => row.resourceIds!.jobId!);

        const bookingReadback = await readBackOwnedOrders(pool, claimedBookingOrderIds);
        const dispatchReadback = await readBackOwnedOrders(pool, claimedDispatchOrderIds);
        const reportReadback = await readBackReportJobs(pool, claimedReportJobIds);

        const bookingSummary = summarizeReadback(
          claimedBookingOrderIds,
          bookingReadback,
          (row: { orderId: string }) => row.orderId,
        );
        const dispatchSummary = summarizeReadback(
          claimedDispatchOrderIds,
          dispatchReadback,
          (row: { orderId: string }) => row.orderId,
        );
        const reportSummary = summarizeReadback(
          claimedReportJobIds,
          reportReadback,
          (row: { jobId: string }) => row.jobId,
        );

        const acceptance = {
          taskId: "SR-OPS-CAPACITY-RUNNER-20260911",
          capability: "C123",
          runTag,
          candidateSha: process.env.CANDIDATE_SHA ?? "local",
          workflowSha: process.env.WORKFLOW_SHA ?? "local",
          summary,
          readback: {
            booking: bookingSummary,
            dispatch: dispatchSummary,
            report: reportSummary,
          },
          queueLag: {
            report: summarizeLag(reportReadback, "queueLagMs"),
            dispatchOrderWriteLag: summarizeLag(dispatchReadback, "lagMs"),
          },
          dispatchOrderStatusDistribution: dispatchReadback.reduce(
            (acc: Record<string, number>, row: { status: string }) => {
              acc[row.status] = (acc[row.status] ?? 0) + 1;
              return acc;
            },
            {} as Record<string, number>,
          ),
        };
        writeFileSync(
          resolve(evidenceDir, `${runTag}.acceptance.json`),
          `${JSON.stringify(acceptance, null, 2)}\n`,
        );

        // The core acceptance gate: no claimed success without a durable row.
        expect(bookingSummary.missing).toEqual([]);
        expect(dispatchSummary.missing).toEqual([]);
        expect(reportSummary.missing).toEqual([]);
        expect(bookingSummary.matched).toBe(true);
        expect(dispatchSummary.matched).toBe(true);
        expect(reportSummary.matched).toBe(true);
      } finally {
        await app.close();
        await pool.end();
      }
    },
    22 * 60 * 1000,
  );
});
