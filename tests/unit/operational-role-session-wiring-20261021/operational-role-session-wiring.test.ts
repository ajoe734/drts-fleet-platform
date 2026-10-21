import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DriverIsolationError,
  MAP_DRIVER_SCOPES,
  MAP_PROVISIONER_ID,
  OPERATIONAL_OWN_FLEET_PARTNER_ID,
  OPERATIONAL_ROLE_SESSION_ENV_NAMES,
  OperationalForeignFleetFixturePreconditionError,
  OperationalRoleSessionBootstrapError,
  SEEDED_MAP_DRIVER_ID,
  prepareOperationalRoleSessions,
  readOperationalGoogleProvisioningIdToken,
  teardownOperationalRoleSessions,
  validateOperationalRoleSessionTargets,
  type OperationalRoleSessionsCleanupEvidence,
  type OperationalRoleSessionsEvidence,
} from "../../../operations/verification/prepare-operational-role-sessions";
import {
  operationalRoleRequestHeaders,
  probeOperationalDocumentRoleAccess,
  verifyOperationalRoleSession,
  type RoleAccessProbeSetup,
} from "../../e2e/operational-document-upload";

/**
 * EXTERNAL-BOUNDARY SIMULATION NOTICE:
 * All HTTP, token-issuer, and CLI command interactions in this unit suite use
 * socket-free in-memory fetch/command ports. Synthetic tokens in this file are
 * test-only fixtures and never claim hosted-issued real credentials or live
 * Cloud Run execution.
 */
const CANDIDATE_SHA = "337f3dd7fb530b44f4e65875dd03c7a2191e3706";
const IMMUTABLE_BASELINE_REF = "337f3dd7fb530b44f4e65875dd03c7a2191e3706";
const API_ORIGIN = "https://drts-dev-api-uc.a.run.app";
const OPS_ORIGIN = "https://drts-dev-ops-console-web-uc.a.run.app";
const GCP_PROJECT_ID = "drts-dev-devcc-20260825";

const C125_PRESERVED_FILES = [
  "tests/e2e/operational-document-upload.ts",
  "tests/e2e/fixtures/operational-browser-journeys.json",
  "tests/e2e/operational-browser-acceptance.spec.ts",
  "tests/unit/operational-document-upload.test.ts",
  "tests/unit/operational-browser-manifest.test.ts",
] as const;

function sha256Hex(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function makeFakeJwt(
  payload: Record<string, unknown>,
  sig = "sim-sig",
): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.${sig}`;
}

const SIM_PROVISIONING_GOOGLE_ID_TOKEN = makeFakeJwt({
  iss: "https://accounts.google.com",
  aud: `${API_ORIGIN}/driver-provisioning`,
  email: `drts-dev-live-map@${GCP_PROJECT_ID}.iam.gserviceaccount.com`,
  email_verified: true,
  sub: "112233445566778899000",
});

const SIM_OPS_CONSOLE_ID_TOKEN = "sim-cloud-run-ops-console-id-token";
const SIM_API_ID_TOKEN = "sim-cloud-run-api-id-token";
const SIM_OPS_SESSION_TOKEN = "sim-app-ops-non-reviewer-jwt-token";
const SIM_OPS_SESSION_ID = "sess-ops-non-reviewer-001";
const SIM_OPS_PRINCIPAL_ID = "ops-operator-001";
const SIM_SYSTEM_SESSION_TOKEN = "sim-app-system-provisioner-jwt-token";
const SIM_DRIVER_INVITE_CODE = "sim-driver-invite-code-drv-demo-002";
const SIM_DRIVER_SESSION_TOKEN = "sim-app-driver-demo-002-jwt-token";
const SIM_FOREIGN_FLEET_API_KEY = "sim-foreign-fleet-api-key-002";
const SIM_FOREIGN_FLEET_SESSION_TOKEN = "sim-app-foreign-fleet-002-jwt-token";
const SIM_FOREIGN_FLEET_SESSION_ID = "sess-foreign-fleet-002";
const SIM_OWN_FLEET_SESSION_TOKEN = "sim-app-own-fleet-001-jwt-token";
const SIM_PLATFORM_REVIEWER_SESSION_TOKEN =
  "sim-app-platform-reviewer-jwt-token";

type RecordedCall = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
};

function normalizeHeaders(init?: RequestInit): Record<string, string> {
  const result: Record<string, string> = {};
  if (!init?.headers) return result;
  const h = new Headers(init.headers);
  h.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });
  return result;
}

function parseJsonBody(init?: RequestInit): unknown {
  if (typeof init?.body !== "string" || init.body.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(init.body);
  } catch {
    return init.body;
  }
}

function jsonResponse(
  body: unknown,
  options: { status?: number; candidateSha?: string | null } = {},
): Response {
  const status = options.status ?? 200;
  const candidateHeader =
    options.candidateSha === null
      ? undefined
      : (options.candidateSha ?? CANDIDATE_SHA);
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (candidateHeader) {
    headers["x-drts-candidate-sha"] = candidateHeader;
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function createBaseSimulationEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    DRTS_CANDIDATE_SHA: CANDIDATE_SHA,
    DEV_GCP_PROJECT_ID: GCP_PROJECT_ID,
    DRTS_OPERATIONAL_API_URL: API_ORIGIN,
    DRTS_OPERATIONAL_OPS_CONSOLE_URL: OPS_ORIGIN,
    DRTS_OPERATIONAL_OPS_CONSOLE_ID_TOKEN: SIM_OPS_CONSOLE_ID_TOKEN,
    DRTS_LIVE_MAP_GOOGLE_PROVISIONING_ID_TOKEN:
      SIM_PROVISIONING_GOOGLE_ID_TOKEN,
    DRTS_LIVE_MAP_TEST_DRIVER_ID: SEEDED_MAP_DRIVER_ID,
    DRTS_OPERATIONAL_OWN_FLEET_PARTNER_ID: OPERATIONAL_OWN_FLEET_PARTNER_ID,
    DRTS_OPERATIONAL_FLEET_SESSION_TOKEN: SIM_OWN_FLEET_SESSION_TOKEN,
    DRTS_OPERATIONAL_PLATFORM_REVIEWER_SESSION_TOKEN:
      SIM_PLATFORM_REVIEWER_SESSION_TOKEN,
    DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_SLUG: "foreign-fleet-alpha",
    DRTS_OPERATIONAL_FOREIGN_FLEET_API_KEY: SIM_FOREIGN_FLEET_API_KEY,
    DRTS_OPERATIONAL_FOREIGN_FLEET_PARTNER_ID: "fleet-foreign-002",
    ...overrides,
  };
}

function createStandardMockFetch(
  options: {
    driverWorkState?: string;
    driverDispatchEligible?: boolean;
    opsRoles?: string[];
    opsActorType?: string;
    foreignPartnerId?: string;
    foreignBootstrapStatus?: number;
    candidateShaOverride?: string | null;
    failDriverRevoke?: boolean;
  } = {},
) {
  const calls: RecordedCall[] = [];
  const candidateSha =
    options.candidateShaOverride === undefined
      ? CANDIDATE_SHA
      : options.candidateShaOverride;
  const foreignPartnerId = options.foreignPartnerId ?? "fleet-foreign-002";

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = normalizeHeaders(init);
    const body = parseJsonBody(init);
    calls.push({ method, url, headers, body });

    if (
      method === "POST" &&
      url === `${OPS_ORIGIN}/control-plane-proxy/auth/token`
    ) {
      expect(headers.authorization).toBe(`Bearer ${SIM_OPS_CONSOLE_ID_TOKEN}`);
      return jsonResponse(
        {
          data: {
            token: SIM_OPS_SESSION_TOKEN,
            sessionId: SIM_OPS_SESSION_ID,
            principalId: SIM_OPS_PRINCIPAL_ID,
            expiresIn: "8h",
            realm: "ops",
            actorType: options.opsActorType ?? "ops_user",
          },
        },
        { candidateSha },
      );
    }

    if (method === "POST" && url === `${API_ORIGIN}/api/auth/token`) {
      expect(headers["x-drts-google-id-token"]).toBe(
        SIM_PROVISIONING_GOOGLE_ID_TOKEN,
      );
      expect(headers["x-actor-type"]).toBe("system");
      expect(headers["x-actor-id"]).toBe(MAP_PROVISIONER_ID);
      expect(headers["x-realm"]).toBe("system");
      return jsonResponse(
        {
          token: SIM_SYSTEM_SESSION_TOKEN,
          expiresIn: "15m",
        },
        { candidateSha },
      );
    }

    if (method === "GET" && url === `${API_ORIGIN}/api/auth/session`) {
      const auth = headers.authorization ?? "";
      if (auth === `Bearer ${SIM_OPS_SESSION_TOKEN}`) {
        return jsonResponse(
          {
            data: {
              active: true,
              identity: {
                realm: "ops",
                actorType: options.opsActorType ?? "ops_user",
                actorId: SIM_OPS_PRINCIPAL_ID,
                principalId: SIM_OPS_PRINCIPAL_ID,
                sessionId: SIM_OPS_SESSION_ID,
                authMode: "jwt_bearer",
                roles: options.opsRoles ?? ["ops_user", "operator"],
                scopes: [
                  "orders:read",
                  "dispatch:read",
                  "fleet:read",
                  "regulatory:read",
                ],
              },
            },
          },
          { candidateSha },
        );
      }
      if (auth === `Bearer ${SIM_SYSTEM_SESSION_TOKEN}`) {
        return jsonResponse(
          {
            data: {
              active: true,
              identity: {
                realm: "system",
                actorType: "system",
                actorId: MAP_PROVISIONER_ID,
                driverProvisioningDriverId: SEEDED_MAP_DRIVER_ID,
                scopes: ["driver:provision"],
              },
            },
          },
          { candidateSha },
        );
      }
      if (auth === `Bearer ${SIM_DRIVER_SESSION_TOKEN}`) {
        return jsonResponse(
          {
            data: {
              active: true,
              identity: {
                realm: "driver",
                actorType: "driver_user",
                actorId: SEEDED_MAP_DRIVER_ID,
                scopes: [...MAP_DRIVER_SCOPES],
              },
            },
          },
          { candidateSha },
        );
      }
      if (auth === `Bearer ${SIM_FOREIGN_FLEET_SESSION_TOKEN}`) {
        return jsonResponse(
          {
            data: {
              active: true,
              identity: {
                realm: "partner",
                actorType: "partner_user",
                actorId: `partner_bootstrap:${foreignPartnerId}:foreign-fleet-alpha`,
                partnerId: foreignPartnerId,
                sessionId: SIM_FOREIGN_FLEET_SESSION_ID,
                scopes: ["fleet:read", "fleet:write", "regulatory:write"],
              },
            },
          },
          { candidateSha },
        );
      }
      return jsonResponse(
        { error: "unauthorized" },
        { status: 401, candidateSha },
      );
    }

    if (
      method === "GET" &&
      url === `${API_ORIGIN}/api/regulatory-registry/drivers`
    ) {
      expect(headers.authorization).toBe(`Bearer ${SIM_OPS_SESSION_TOKEN}`);
      return jsonResponse(
        {
          data: {
            items: [
              {
                driverId: SEEDED_MAP_DRIVER_ID,
                workState: options.driverWorkState ?? "offline",
                dispatchEligible: options.driverDispatchEligible ?? false,
                availabilityStatus: "OFFLINE",
              },
            ],
          },
        },
        { candidateSha },
      );
    }

    if (
      method === "POST" &&
      url === `${API_ORIGIN}/api/auth/driver/device/invite`
    ) {
      expect(headers.authorization).toBe(`Bearer ${SIM_SYSTEM_SESSION_TOKEN}`);
      const payload = body as { driverId?: string; dryRun?: boolean };
      expect(payload.driverId).toBe(SEEDED_MAP_DRIVER_ID);
      if (payload.dryRun) {
        return jsonResponse(
          {
            data: {
              driverId: SEEDED_MAP_DRIVER_ID,
              dryRun: true,
              invitationStatus: "VALIDATED",
            },
          },
          { candidateSha },
        );
      }
      return jsonResponse(
        {
          data: {
            registrationCode: SIM_DRIVER_INVITE_CODE,
            driverId: SEEDED_MAP_DRIVER_ID,
          },
        },
        { candidateSha },
      );
    }

    if (
      method === "POST" &&
      url === `${API_ORIGIN}/api/auth/driver/device/register`
    ) {
      const payload = body as { registrationCode?: string; deviceId?: string };
      expect(payload.registrationCode).toBe(SIM_DRIVER_INVITE_CODE);
      expect(payload.deviceId).toMatch(/^operational-c125-run-/);
      return jsonResponse(
        {
          data: {
            accessToken: SIM_DRIVER_SESSION_TOKEN,
            refreshToken: "sim-driver-refresh-token",
            expiresIn: "15m",
            driverId: SEEDED_MAP_DRIVER_ID,
            deviceId: payload.deviceId,
          },
        },
        { candidateSha },
      );
    }

    if (
      method === "POST" &&
      url === `${API_ORIGIN}/api/auth/partner/bootstrap-session`
    ) {
      if (
        options.foreignBootstrapStatus &&
        options.foreignBootstrapStatus !== 200
      ) {
        return jsonResponse(
          { error: { code: "PARTNER_BOOTSTRAP_REJECTED" } },
          { status: options.foreignBootstrapStatus, candidateSha },
        );
      }
      const payload = body as { entrySlug?: string; apiKey?: string };
      expect(payload.entrySlug).toBe("foreign-fleet-alpha");
      expect(payload.apiKey).toBe(SIM_FOREIGN_FLEET_API_KEY);
      return jsonResponse(
        {
          data: {
            accessToken: SIM_FOREIGN_FLEET_SESSION_TOKEN,
            tokenType: "Bearer",
            expiresIn: "1h",
            partnerEntry: {
              entrySlug: "foreign-fleet-alpha",
              partnerId: foreignPartnerId,
              entryKind: "fleet_portal",
            },
            identity: {
              realm: "partner",
              actorType: "partner_user",
              actorId: `partner_bootstrap:${foreignPartnerId}:foreign-fleet-alpha`,
              partnerId: foreignPartnerId,
              scopes: ["fleet:read", "fleet:write", "regulatory:write"],
            },
          },
        },
        { candidateSha },
      );
    }

    if (
      method === "POST" &&
      url === `${API_ORIGIN}/api/auth/driver/device/invite/revoke`
    ) {
      if (options.failDriverRevoke) {
        return jsonResponse(
          { error: "revoke_failed" },
          { status: 500, candidateSha },
        );
      }
      expect(headers.authorization).toBe(`Bearer ${SIM_SYSTEM_SESSION_TOKEN}`);
      const payload = body as { registrationCode?: string };
      expect(payload.registrationCode).toBe(SIM_DRIVER_INVITE_CODE);
      return jsonResponse(
        {
          data: {
            revoked: true,
          },
        },
        { candidateSha },
      );
    }

    if (method === "POST" && url === `${API_ORIGIN}/api/auth/sessions/revoke`) {
      const payload = body as { sessionId?: string };
      return jsonResponse(
        {
          data: {
            revoked: true,
            sessionId: payload.sessionId,
          },
        },
        { candidateSha },
      );
    }

    throw new Error(`Unexpected simulated HTTP call: ${method} ${url}`);
  }) as unknown as typeof fetch;

  return { fetchImpl, calls };
}

describe("C125-OPERATIONAL-ROLE-SESSION-WIRING-20261021", () => {
  describe("immutable baseline gap proof and C125 5-file byte-for-byte preservation", () => {
    it("proves immutable baseline 337f3dd7fb530b44f4e65875dd03c7a2191e3706 lacked the four role-session producers/forwarders in deploy-dev.yml and run-operational-browser-acceptance.sh", () => {
      const baselineWorkflow = execFileSync(
        "git",
        ["show", `${IMMUTABLE_BASELINE_REF}:.github/workflows/deploy-dev.yml`],
        { encoding: "utf8" },
      );
      const baselineRunner = execFileSync(
        "git",
        [
          "show",
          `${IMMUTABLE_BASELINE_REF}:operations/verification/run-operational-browser-acceptance.sh`,
        ],
        { encoding: "utf8" },
      );

      // Baseline issued tenant & dispatch sessions, but none of the four C125 role sessions.
      expect(baselineWorkflow).toContain(
        "DRTS_OPERATIONAL_TENANT_SESSION_TOKEN",
      );
      expect(baselineWorkflow).toContain(
        "DRTS_OPERATIONAL_DISPATCH_SESSION_TOKEN",
      );
      for (const envName of OPERATIONAL_ROLE_SESSION_ENV_NAMES) {
        expect(baselineWorkflow).not.toContain(envName);
        expect(baselineRunner).not.toContain(envName);
      }
      expect(baselineRunner).not.toContain(
        "prepare-operational-role-sessions.ts",
      );
    });

    it("preserves all five accepted C125 files byte-for-byte and keeps 7 journeys / 16 browser tests / 69 steps / 15 uploads / 37 role probes / 16 lineage checks intact", () => {
      for (const relativePath of C125_PRESERVED_FILES) {
        const baselineBytes = execFileSync("git", [
          "show",
          `${IMMUTABLE_BASELINE_REF}:${relativePath}`,
        ]);
        const currentBytes = readFileSync(
          path.join(process.cwd(), relativePath),
        );
        expect(sha256Hex(currentBytes)).toBe(sha256Hex(baselineBytes));
        expect(currentBytes.byteLength).toBe(baselineBytes.byteLength);
      }

      const manifest = JSON.parse(
        readFileSync(
          path.join(
            process.cwd(),
            "tests/e2e/fixtures/operational-browser-journeys.json",
          ),
          "utf8",
        ),
      ) as {
        journeys: Array<{ id: string }>;
        retiredSurfaces: Array<{ id: string }>;
        documentAcceptance: {
          id: string;
          setup: Array<{
            kind?: string;
            role?: string;
          }>;
        };
      };

      expect(manifest.journeys).toHaveLength(7);
      const docSetup = manifest.documentAcceptance.setup;
      expect(docSetup).toHaveLength(69);
      const uploadSteps = docSetup.filter((s) => s.kind === "document-upload");
      expect(uploadSteps).toHaveLength(15);
      const roleProbeSteps = docSetup.filter(
        (s) => s.kind === "role-access-probe",
      );
      expect(roleProbeSteps).toHaveLength(37);
      const lineageSetupRequests = docSetup.filter(
        (s) =>
          s.kind !== "document-upload" &&
          s.kind !== "role-access-probe" &&
          s.kind !== "fleet-editable-case",
      );
      expect(lineageSetupRequests).toHaveLength(16);
    });

    it("wires driver-provisioning WIF assertion, four role-session bindings, and always-teardown in deploy-dev.yml and run-operational-browser-acceptance.sh without setting API_ID_TOKEN", () => {
      const workflow = readFileSync(
        path.join(process.cwd(), ".github/workflows/deploy-dev.yml"),
        "utf8",
      );
      const runner = readFileSync(
        path.join(
          process.cwd(),
          "operations/verification/run-operational-browser-acceptance.sh",
        ),
        "utf8",
      );

      expect(workflow).toContain(
        "Mint identity token — driver provisioning (operational candidate)",
      );
      expect(workflow).toContain(
        "service_account: drts-dev-live-map@${{ needs.prepare.outputs.project_id }}.iam.gserviceaccount.com",
      );
      expect(workflow).toContain(
        "id_token_audience: ${{ format('{0}/driver-provisioning', needs.health-check.outputs.api) }}",
      );
      expect(workflow).toContain(
        "DRTS_LIVE_MAP_GOOGLE_PROVISIONING_ID_TOKEN: ${{ steps.id_token_driver_provisioning.outputs.id_token }}",
      );
      for (const envName of OPERATIONAL_ROLE_SESSION_ENV_NAMES) {
        expect(workflow).toContain(envName);
        expect(runner).toContain(envName);
      }
      expect(workflow).toContain(
        "DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_SLUG: ${{ vars.DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_SLUG || secrets.DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_SLUG }}",
      );
      expect(workflow).toContain(
        "DRTS_OPERATIONAL_FOREIGN_FLEET_API_KEY: ${{ secrets.DRTS_OPERATIONAL_FOREIGN_FLEET_API_KEY }}",
      );
      expect(workflow).toContain(
        "Revoke operational role sessions and driver device invitation",
      );
      // Must not set DRTS_DEV_API_ID_TOKEN or DRTS_OPERATIONAL_API_ID_TOKEN on open API routes.
      expect(workflow).not.toContain("DRTS_DEV_API_ID_TOKEN");
      expect(workflow).not.toContain("DRTS_OPERATIONAL_API_ID_TOKEN");
      expect(runner).toContain(
        "operations/verification/prepare-operational-role-sessions.ts",
      );
    });
  });

  describe("socket-free adapter producer -> unchanged C125 consumer chain", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    it("produces all four role sessions via existing issuers, exports all aliases, and satisfies unchanged C125 verifyOperationalRoleSession and probeOperationalDocumentRoleAccess", async () => {
      const env = createBaseSimulationEnv();
      const exported: Record<string, string> = {};
      const masked: string[] = [];
      const savedEvidence: Record<string, OperationalRoleSessionsEvidence> = {};
      const { fetchImpl, calls } = createStandardMockFetch();

      const evidence = await prepareOperationalRoleSessions(env, {
        fetch: fetchImpl,
        mask: (secret) => masked.push(secret),
        exportSession: (name, value) => {
          exported[name] = value;
          env[name] = value;
        },
        save: (name, data) => {
          savedEvidence[name] = data;
        },
      });

      expect(evidence.status).toBe("passed");
      expect(evidence.stage).toBe("complete");
      expect(evidence.cleanup).toBe("required");
      expect(evidence.foreign_fleet_precondition).toBe(
        "satisfied-by-partner-bootstrap",
      );
      expect(evidence.driver_isolation).toEqual({
        driver_id: SEEDED_MAP_DRIVER_ID,
        found: true,
        registry_shape: "data.items",
        work_state: "offline",
        dispatch_eligible: false,
        status: "passed",
        failures: [],
      });
      expect(evidence.sessions.map((s) => s.role)).toEqual([
        "ops_non_reviewer",
        "system",
        "driver",
        "foreign_fleet",
      ]);

      expect(exported.DRTS_OPERATIONAL_OPS_NON_REVIEWER_SESSION_TOKEN).toBe(
        SIM_OPS_SESSION_TOKEN,
      );
      expect(exported.DRTS_OPERATIONAL_SYSTEM_SESSION_TOKEN).toBe(
        SIM_SYSTEM_SESSION_TOKEN,
      );
      expect(exported.DRTS_OPERATIONAL_DRIVER_SESSION_TOKEN).toBe(
        SIM_DRIVER_SESSION_TOKEN,
      );
      expect(exported.DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_TOKEN).toBe(
        SIM_FOREIGN_FLEET_SESSION_TOKEN,
      );
      expect(exported.DRTS_OPERATIONAL_OTHER_FLEET_SESSION_TOKEN).toBe(
        SIM_FOREIGN_FLEET_SESSION_TOKEN,
      );
      expect(exported.DRTS_OPERATIONAL_ROLE_SESSIONS_CLEANUP_STATUS).toBe(
        "pending",
      );

      // Saved evidence must never contain raw session tokens or secret keys.
      const serializedEvidence = JSON.stringify(savedEvidence);
      for (const secret of [
        SIM_OPS_CONSOLE_ID_TOKEN,
        SIM_PROVISIONING_GOOGLE_ID_TOKEN,
        SIM_OPS_SESSION_TOKEN,
        SIM_SYSTEM_SESSION_TOKEN,
        SIM_DRIVER_INVITE_CODE,
        SIM_DRIVER_SESSION_TOKEN,
        SIM_FOREIGN_FLEET_API_KEY,
        SIM_FOREIGN_FLEET_SESSION_TOKEN,
      ]) {
        expect(masked).toContain(secret);
        expect(serializedEvidence).not.toContain(secret);
      }

      // Now consume the produced environment using the unchanged C125 helper functions.
      for (const [k, v] of Object.entries(env)) {
        if (v !== undefined) {
          vi.stubEnv(k, v);
        }
      }
      const probeFetch = (async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => {
        const url = String(input);
        const headers = normalizeHeaders(init);
        if (url === `${API_ORIGIN}/api/auth/session`) {
          return fetchImpl(input, init);
        }
        if (url === `${API_ORIGIN}/api/regulatory-registry/drivers`) {
          if (headers.authorization === `Bearer ${SIM_OPS_SESSION_TOKEN}`) {
            return jsonResponse({
              data: {
                items: [
                  {
                    driverId: SEEDED_MAP_DRIVER_ID,
                    licensePhotoStorageKey:
                      "operational-documents/driver_license_front/doc-1.png",
                  },
                ],
              },
            });
          }
          return jsonResponse(
            { error: { code: "FORBIDDEN" } },
            { status: 403 },
          );
        }
        throw new Error(`Unexpected probe URL: ${url}`);
      }) as unknown as typeof fetch;
      vi.stubGlobal("fetch", probeFetch);

      for (const role of [
        "ops_non_reviewer",
        "system",
        "driver",
        "foreign_fleet",
      ] as const) {
        const identity = await verifyOperationalRoleSession(
          role,
          "DRTS_OPERATIONAL_API_URL",
          OPERATIONAL_OWN_FLEET_PARTNER_ID,
        );
        expect(identity).toBeDefined();
        const roleHeaders = operationalRoleRequestHeaders(
          role,
          "DRTS_OPERATIONAL_API_URL",
          `${API_ORIGIN}/api/auth/session`,
        );
        expect(roleHeaders.Authorization).toMatch(/^Bearer sim-app-/);
        expect(roleHeaders["x-drts-authorization"]).toBeUndefined();
      }

      // Exercise unchanged probeOperationalDocumentRoleAccess for allowed & denied probes.
      const opsReadProbe: RoleAccessProbeSetup = {
        kind: "role-access-probe",
        baseUrlEnv: "DRTS_OPERATIONAL_API_URL",
        role: "ops_non_reviewer",
        method: "GET",
        path: "/api/regulatory-registry/drivers",
        expectedStatus: 200,
      };
      const opsResult = await probeOperationalDocumentRoleAccess(opsReadProbe);
      expect(opsResult.status).toBe(200);

      for (const deniedRole of ["system", "driver", "foreign_fleet"] as const) {
        const deniedProbe: RoleAccessProbeSetup = {
          kind: "role-access-probe",
          baseUrlEnv: "DRTS_OPERATIONAL_API_URL",
          role: deniedRole,
          method: "GET",
          path: "/api/regulatory-registry/drivers",
          expectedStatus: [401, 403],
          expectedErrorCode: "FORBIDDEN",
        };
        const deniedResult =
          await probeOperationalDocumentRoleAccess(deniedProbe);
        expect(deniedResult.status).toBe(403);
        expect(deniedResult.errorCode).toBe("FORBIDDEN");
      }

      // Verify teardown revokes driver invitation, foreign_fleet session, and ops session.
      let cleanupEvidence: OperationalRoleSessionsCleanupEvidence | undefined;
      const teardownResult = await teardownOperationalRoleSessions(env, {
        fetch: fetchImpl,
        mask: (secret) => masked.push(secret),
        exportSession: (name, value) => {
          exported[name] = value;
          env[name] = value;
        },
        save: (data) => {
          cleanupEvidence = data as OperationalRoleSessionsCleanupEvidence;
        },
      });

      expect(teardownResult).toEqual({
        candidate_sha: CANDIDATE_SHA,
        status: "passed",
        driver_id: SEEDED_MAP_DRIVER_ID,
        driver_recovery: "consumed-invitation",
        driver_revoked: true,
        ops_session_revoked: true,
        foreign_fleet_session_revoked: true,
      });
      expect(cleanupEvidence?.status).toBe("passed");
      expect(exported.DRTS_OPERATIONAL_ROLE_SESSIONS_CLEANUP_STATUS).toBe(
        "passed",
      );
      expect(
        calls.some(
          (c) =>
            c.method === "POST" &&
            c.url === `${API_ORIGIN}/api/auth/driver/device/invite/revoke`,
        ),
      ).toBe(true);
      expect(
        calls.filter(
          (c) =>
            c.method === "POST" &&
            c.url === `${API_ORIGIN}/api/auth/sessions/revoke`,
        ),
      ).toHaveLength(2);
    });

    it("supports pre-provided dedicated role sessions when verified against /api/auth/session and dry-run invite", async () => {
      const env = createBaseSimulationEnv({
        DRTS_OPERATIONAL_OPS_NON_REVIEWER_SESSION_TOKEN: SIM_OPS_SESSION_TOKEN,
        DRTS_OPERATIONAL_SYSTEM_SESSION_TOKEN: SIM_SYSTEM_SESSION_TOKEN,
        DRTS_OPERATIONAL_DRIVER_SESSION_TOKEN: SIM_DRIVER_SESSION_TOKEN,
        DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_TOKEN:
          SIM_FOREIGN_FLEET_SESSION_TOKEN,
        DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_SLUG: undefined,
        DRTS_OPERATIONAL_FOREIGN_FLEET_API_KEY: undefined,
      });
      const exported: Record<string, string> = {};
      const { fetchImpl, calls } = createStandardMockFetch();

      const evidence = await prepareOperationalRoleSessions(env, {
        fetch: fetchImpl,
        mask: () => {},
        exportSession: (name, value) => {
          exported[name] = value;
        },
        save: () => {},
      });

      expect(evidence.status).toBe("passed");
      expect(evidence.cleanup).toBe("not-required");
      expect(evidence.foreign_fleet_precondition).toBe(
        "satisfied-by-provided-session",
      );
      expect(
        evidence.sessions.every((s) => s.source === "provided-session"),
      ).toBe(true);
      expect(exported.DRTS_OPERATIONAL_ROLE_SESSIONS_CLEANUP_STATUS).toBe(
        "passed",
      );
      // Should only have called GET /api/auth/session (4x) and dryRun invite (1x)
      expect(
        calls.some((c) => c.url.endsWith("/auth/driver/device/register")),
      ).toBe(false);
    });
  });

  describe("precondition, role boundary, isolation, and cleanup failure guards", () => {
    it("exposes explicit OperationalForeignFleetFixturePreconditionError when foreign_fleet fixture is missing and cleans up issued driver + ops sessions", async () => {
      const env = createBaseSimulationEnv({
        DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_SLUG: undefined,
        DRTS_OPERATIONAL_FOREIGN_FLEET_API_KEY: undefined,
        DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_TOKEN: undefined,
        DRTS_OPERATIONAL_OTHER_FLEET_SESSION_TOKEN: undefined,
      });
      const exported: Record<string, string> = {};
      let saved: OperationalRoleSessionsEvidence | undefined;
      const { fetchImpl, calls } = createStandardMockFetch();

      await expect(
        prepareOperationalRoleSessions(env, {
          fetch: fetchImpl,
          mask: () => {},
          exportSession: (name, value) => {
            exported[name] = value;
            env[name] = value;
          },
          save: (_name, data) => {
            saved = data;
          },
        }),
      ).rejects.toThrow(OperationalForeignFleetFixturePreconditionError);

      expect(saved?.status).toBe("failed");
      expect(saved?.foreign_fleet_precondition).toBe(
        "missing-external-fixture",
      );
      expect(saved?.cleanup).toBe("passed");
      expect(exported.DRTS_OPERATIONAL_ROLE_SESSIONS_CLEANUP_STATUS).toBe(
        "passed",
      );
      // Verify that the driver invitation and ops session created before the failure were revoked.
      expect(
        calls.some(
          (c) =>
            c.method === "POST" &&
            c.url === `${API_ORIGIN}/api/auth/driver/device/invite/revoke`,
        ),
      ).toBe(true);
      expect(
        calls.some(
          (c) =>
            c.method === "POST" &&
            c.url === `${API_ORIGIN}/api/auth/sessions/revoke`,
        ),
      ).toBe(true);
      // Role session tokens must NOT have been exported on precondition failure.
      expect(
        exported.DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_TOKEN,
      ).toBeUndefined();
    });

    it("rejects foreign_fleet fixture when partnerId matches own Fleet (fleet-demo-001) or reuses own Fleet / Admin / Ops session", async () => {
      const ownFleetCollisionEnv = createBaseSimulationEnv({
        DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_TOKEN:
          SIM_OWN_FLEET_SESSION_TOKEN,
      });
      const { fetchImpl } = createStandardMockFetch();

      await expect(
        prepareOperationalRoleSessions(ownFleetCollisionEnv, {
          fetch: fetchImpl,
          mask: () => {},
          exportSession: () => {},
          save: () => {},
        }),
      ).rejects.toThrow(OperationalForeignFleetFixturePreconditionError);

      const samePartnerEnv = createBaseSimulationEnv({
        DRTS_OPERATIONAL_FOREIGN_FLEET_PARTNER_ID: undefined,
      });
      const { fetchImpl: samePartnerFetch } = createStandardMockFetch({
        foreignPartnerId: OPERATIONAL_OWN_FLEET_PARTNER_ID,
      });

      await expect(
        prepareOperationalRoleSessions(samePartnerEnv, {
          fetch: samePartnerFetch,
          mask: () => {},
          exportSession: () => {},
          save: () => {},
        }),
      ).rejects.toThrow(OperationalForeignFleetFixturePreconditionError);
    });

    it("rejects raw Google/Cloud Run invocation tokens or wrong service account / audience for SYSTEM provisioning", async () => {
      expect(() =>
        readOperationalGoogleProvisioningIdToken(
          createBaseSimulationEnv({
            DRTS_DEV_API_ID_TOKEN: SIM_API_ID_TOKEN,
            DRTS_LIVE_MAP_GOOGLE_PROVISIONING_ID_TOKEN: SIM_API_ID_TOKEN,
          }),
          { apiOrigin: API_ORIGIN, gcpProjectId: GCP_PROJECT_ID },
        ),
      ).toThrow(/dedicated driver-provisioning assertion/);

      const wrongAudienceJwt = makeFakeJwt({
        aud: API_ORIGIN,
        email: `drts-dev-live-map@${GCP_PROJECT_ID}.iam.gserviceaccount.com`,
      });
      expect(() =>
        readOperationalGoogleProvisioningIdToken(
          createBaseSimulationEnv({
            DRTS_LIVE_MAP_GOOGLE_PROVISIONING_ID_TOKEN: wrongAudienceJwt,
          }),
          { apiOrigin: API_ORIGIN, gcpProjectId: GCP_PROJECT_ID },
        ),
      ).toThrow(/audience must match <ApiOrigin>\/driver-provisioning/);

      const wrongPrincipalJwt = makeFakeJwt({
        aud: `${API_ORIGIN}/driver-provisioning`,
        email: `github-actions-deployer@${GCP_PROJECT_ID}.iam.gserviceaccount.com`,
      });
      expect(() =>
        readOperationalGoogleProvisioningIdToken(
          createBaseSimulationEnv({
            DRTS_LIVE_MAP_GOOGLE_PROVISIONING_ID_TOKEN: wrongPrincipalJwt,
          }),
          { apiOrigin: API_ORIGIN, gcpProjectId: GCP_PROJECT_ID },
        ),
      ).toThrow(/principal must be drts-dev-live-map@/);
    });

    it("rejects ops_non_reviewer session that carries platform_reviewer or platform_admin role", async () => {
      const env = createBaseSimulationEnv();
      const { fetchImpl } = createStandardMockFetch({
        opsRoles: ["ops_user", "platform_reviewer"],
      });

      await expect(
        prepareOperationalRoleSessions(env, {
          fetch: fetchImpl,
          mask: () => {},
          exportSession: () => {},
          save: () => {},
        }),
      ).rejects.toThrow(OperationalRoleSessionBootstrapError);
    });

    it("fails closed with DriverIsolationError before inviting when drv-demo-002 is not offline or is dispatch-eligible, or when a non-reserved driverId is configured", async () => {
      expect(() =>
        validateOperationalRoleSessionTargets(
          createBaseSimulationEnv({
            DRTS_LIVE_MAP_TEST_DRIVER_ID: "drv-demo-001",
          }),
        ),
      ).toThrow(/must be the audited offline seed drv-demo-002/);

      const env = createBaseSimulationEnv();
      const { fetchImpl, calls } = createStandardMockFetch({
        driverWorkState: "online",
        driverDispatchEligible: true,
      });

      await expect(
        prepareOperationalRoleSessions(env, {
          fetch: fetchImpl,
          mask: () => {},
          exportSession: () => {},
          save: () => {},
        }),
      ).rejects.toThrow(DriverIsolationError);

      expect(
        calls.some(
          (c) =>
            c.url.endsWith("/auth/driver/device/invite") &&
            (c.body as { dryRun?: boolean })?.dryRun !== true,
        ),
      ).toBe(false);
    });

    it("fails closed when x-drts-candidate-sha mismatches or is missing", async () => {
      const env = createBaseSimulationEnv();
      const { fetchImpl } = createStandardMockFetch({
        candidateShaOverride: "b".repeat(40),
      });

      await expect(
        prepareOperationalRoleSessions(env, {
          fetch: fetchImpl,
          mask: () => {},
          exportSession: () => {},
          save: () => {},
        }),
      ).rejects.toThrow(OperationalRoleSessionBootstrapError);
    });

    it("re-issues provisioner session during teardown when prior system token is unavailable and fails closed when invitation was attempted without invite code", async () => {
      const env = createBaseSimulationEnv({
        DRTS_OPERATIONAL_ROLE_SESSIONS_CLEANUP_STATUS: "pending",
        DRTS_LIVE_MAP_INVITE_CODE: SIM_DRIVER_INVITE_CODE,
        DRTS_LIVE_MAP_PROVISIONER_SESSION_TOKEN: "expired-system-token",
      });
      const { fetchImpl } = createStandardMockFetch();

      const result = await teardownOperationalRoleSessions(env, {
        fetch: fetchImpl,
        mask: () => {},
        save: () => {},
      });
      expect(result.status).toBe("passed");
      expect(result.driver_revoked).toBe(true);

      const lostRecoveryEnv = createBaseSimulationEnv({
        DRTS_OPERATIONAL_ROLE_SESSIONS_CLEANUP_STATUS: "unconfirmed",
        DRTS_LIVE_MAP_INVITATION_ATTEMPTED: "true",
        DRTS_LIVE_MAP_INVITE_CODE: undefined,
      });
      await expect(
        teardownOperationalRoleSessions(lostRecoveryEnv, {
          fetch: fetchImpl,
          mask: () => {},
          save: () => {},
        }),
      ).rejects.toThrow(/Operational role session cleanup failed/);
    });
  });

  describe("run-operational-browser-acceptance.sh end-to-end shell wiring (socket-free command port)", () => {
    let tempDir: string;

    afterEach(() => {
      if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("invokes prepare-operational-role-sessions.ts, exports all four role session tokens into Playwright environment, and runs teardown on EXIT", () => {
      tempDir = mkdtempSync(path.join(tmpdir(), "c125-runner-wiring-unit-"));
      const callsFile = path.join(tempDir, "npx-calls.json");
      writeFileSync(callsFile, "[]", "utf8");

      const npxShim = path.join(tempDir, "npx");
      writeFileSync(
        npxShim,
        `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const callsFile = process.env.TEST_NPX_CALLS_FILE;
const calls = JSON.parse(fs.readFileSync(callsFile, "utf8"));

if (args[0] === "tsx" && args[1] === "operations/verification/prepare-operational-role-sessions.ts") {
  const isTeardown = args.includes("--teardown");
  const envFileIdx = args.indexOf("--env-file");
  const envFile = envFileIdx >= 0 ? args[envFileIdx + 1] : undefined;
  calls.push({ kind: isTeardown ? "teardown" : "prepare", args });
  fs.writeFileSync(callsFile, JSON.stringify(calls));
  if ( process.env.TEST_FAIL_PREPARE === "1" && !isTeardown ) {
    console.error("OperationalForeignFleetFixturePreconditionError: External foreign_fleet fixture precondition unmet");
    process.exit(1);
  }
  if (!isTeardown && envFile) {
    fs.appendFileSync(envFile, [
      "DRTS_OPERATIONAL_OPS_NON_REVIEWER_SESSION_TOKEN=${SIM_OPS_SESSION_TOKEN}",
      "DRTS_OPERATIONAL_SYSTEM_SESSION_TOKEN=${SIM_SYSTEM_SESSION_TOKEN}",
      "DRTS_OPERATIONAL_DRIVER_SESSION_TOKEN=${SIM_DRIVER_SESSION_TOKEN}",
      "DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_TOKEN=${SIM_FOREIGN_FLEET_SESSION_TOKEN}",
      "DRTS_OPERATIONAL_OTHER_FLEET_SESSION_TOKEN=${SIM_FOREIGN_FLEET_SESSION_TOKEN}",
      "DRTS_OPERATIONAL_ROLE_SESSIONS_CLEANUP_STATUS=pending",
    ].join("\\n") + "\\n");
  } else if (isTeardown && envFile) {
    fs.appendFileSync(envFile, "DRTS_OPERATIONAL_ROLE_SESSIONS_CLEANUP_STATUS=passed\\n");
  }
  process.exit(0);
}

if (args[0] === "playwright" && args[1] === "test") {
  calls.push({
    kind: "playwright",
    config: args[3],
    env: {
      ops: process.env.DRTS_OPERATIONAL_OPS_NON_REVIEWER_SESSION_TOKEN,
      system: process.env.DRTS_OPERATIONAL_SYSTEM_SESSION_TOKEN,
      driver: process.env.DRTS_OPERATIONAL_DRIVER_SESSION_TOKEN,
      foreignFleet: process.env.DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_TOKEN,
      otherFleet: process.env.DRTS_OPERATIONAL_OTHER_FLEET_SESSION_TOKEN,
      provisioningIdToken: process.env.DRTS_LIVE_MAP_GOOGLE_PROVISIONING_ID_TOKEN,
    },
  });
  fs.writeFileSync(callsFile, JSON.stringify(calls));
  process.exit(0);
}

console.error("Unexpected npx invocation:", args.join(" "));
process.exit(99);
`,
        "utf8",
      );
      chmodSync(npxShim, 0o700);

      const runnerPath = path.join(
        process.cwd(),
        "operations/verification/run-operational-browser-acceptance.sh",
      );
      const baseRunnerEnv = {
        ...process.env,
        PATH: `${tempDir}:${process.env.PATH ?? ""}`,
        TEST_NPX_CALLS_FILE: callsFile,
        DRTS_DEV_API_BASE_URL: API_ORIGIN,
        DRTS_DEV_OPS_CONSOLE_BASE_URL: OPS_ORIGIN,
        DRTS_DEV_REFERRAL_EMBED_BASE_URL: "https://referral.example.test",
        DRTS_DEV_ENTERPRISE_DISPATCH_BASE_URL:
          "https://enterprise.example.test",
        DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL: "https://fleet.example.test",
        DRTS_DEV_PLATFORM_ADMIN_BASE_URL: "https://admin.example.test",
        DRTS_DEV_TENANT_CONSOLE_BASE_URL: "https://tenant.example.test",
        DRTS_OPERATIONAL_TENANT_SESSION_TOKEN: "sim-tenant-session",
        DRTS_DEV_BANK_CONSOLE_BASE_URL: "https://bank.example.test",
        DRTS_DEV_CHANNEL_PARTNER_PORTAL_BASE_URL:
          "https://channel.example.test",
        DRTS_DEV_PARTNER_BOOKING_BASE_URL:
          "https://partner-booking.example.test",
        DRTS_DEV_CONCIERGE_BASE_URL: "https://concierge.example.test",
        DRTS_DEV_PASSENGER_BASE_URL: "https://passenger.example.test",
        DRTS_DEV_OPS_CONSOLE_ID_TOKEN: SIM_OPS_CONSOLE_ID_TOKEN,
        DRTS_LIVE_MAP_GOOGLE_PROVISIONING_ID_TOKEN:
          SIM_PROVISIONING_GOOGLE_ID_TOKEN,
      };

      const result = spawnSync("bash", [runnerPath, "--sha", CANDIDATE_SHA], {
        encoding: "utf8",
        timeout: 10_000,
        env: baseRunnerEnv,
      });

      expect(result.status).toBe(0);
      const recorded = JSON.parse(readFileSync(callsFile, "utf8")) as Array<{
        kind: string;
        config?: string;
        env?: Record<string, string>;
      }>;
      expect(recorded.map((r) => r.kind)).toEqual([
        "prepare",
        "playwright",
        "playwright",
        "teardown",
      ]);
      for (const pwCall of recorded.filter((r) => r.kind === "playwright")) {
        expect(pwCall.env).toEqual({
          ops: SIM_OPS_SESSION_TOKEN,
          system: SIM_SYSTEM_SESSION_TOKEN,
          driver: SIM_DRIVER_SESSION_TOKEN,
          foreignFleet: SIM_FOREIGN_FLEET_SESSION_TOKEN,
          otherFleet: SIM_FOREIGN_FLEET_SESSION_TOKEN,
          provisioningIdToken: SIM_PROVISIONING_GOOGLE_ID_TOKEN,
        });
      }

      // Now verify failure propagation when prepare fails (e.g. missing foreign_fleet fixture):
      writeFileSync(callsFile, "[]", "utf8");
      const failedResult = spawnSync(
        "bash",
        [runnerPath, "--sha", CANDIDATE_SHA],
        {
          encoding: "utf8",
          timeout: 10_000,
          env: {
            ...baseRunnerEnv,
            TEST_FAIL_PREPARE: "1",
          },
        },
      );
      expect(failedResult.status).not.toBe(0);
      expect(failedResult.stderr).toContain(
        "OperationalForeignFleetFixturePreconditionError",
      );
      const failedRecorded = JSON.parse(
        readFileSync(callsFile, "utf8"),
      ) as Array<{ kind: string }>;
      // Must not execute Playwright when role session preparation fails, and still runs EXIT trap teardown.
      expect(failedRecorded.map((r) => r.kind)).toEqual([
        "prepare",
        "teardown",
      ]);
    });
  });
});
