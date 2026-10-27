import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiRequire = createRequire(
  path.join(process.cwd(), "apps/api/package.json"),
);
const { HttpException } = apiRequire("@nestjs/common") as {
  HttpException: new (
    response: string | Record<string, unknown>,
    status: number,
  ) => {
    getStatus(): number;
    getResponse(): string | Record<string, unknown>;
  };
};
const { Reflector } = apiRequire("@nestjs/core") as {
  Reflector: new () => ConstructorParameters<typeof BootstrapAuthGuard>[0];
};
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
import { EventEmitter } from "node:events";
import type {
  CreateFleetPartnerCommand,
  CreatePartnerBootstrapSessionCommand,
  CreatePartnerChannelEntryCommand,
  IssuePartnerIngressCredentialCommand,
  RevokePartnerIngressCredentialCommand,
  UpdateFleetPartnerCommand,
} from "@drts/contracts";
import {
  BootstrapAuthGuard,
  JwtAuthService,
  StepUpProofService,
  type BootstrapRequestIdentity,
} from "../../../apps/api/src/common/auth";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { AuthController } from "../../../apps/api/src/modules/auth/auth.controller";
import { DriverDeviceSessionService } from "../../../apps/api/src/modules/auth/driver-device-session.service";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { CallcenterService } from "../../../apps/api/src/modules/callcenter/callcenter.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { FleetPartnerController } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.controller";
import { FleetPartnerRepository } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.repository";
import { FleetPartnerService } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.service";
import { IdentityController } from "../../../apps/api/src/modules/identity/identity.controller";
import { IdentityRepository } from "../../../apps/api/src/modules/identity/identity.repository";
import { OwnedMobilityTaskEventsService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { PlatformAdminService } from "../../../apps/api/src/modules/platform-admin/platform-admin.service";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { TenantPartnerController } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { TenantPartnerRepository } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { issueControlPlaneRequestAuth } from "../../../packages/control-plane-auth/src/index";

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
const ADMIN_ORIGIN = "https://drts-dev-platform-admin-web-uc.a.run.app";
const GCP_PROJECT_ID = "drts-dev-devcc-20260825";

// All five C125 files have since received authorized functional corrections. The runner
// gained first-visit consent/readback coverage in REFERRAL-FIRST-VISIT-CONSENT-READBACK-COVERAGE-20261026;
// the other four gained the own_fleet upload-probe correction in
// C125-EXISTING-UPLOAD-PROBE-CONTRACT-20261023. Keep each original 348b7d3c
// blob/bytes/sha256 as immutable historical evidence when its blob is locally reachable,
// never as an assertion that the corrected working tree still has those bytes.
const C125_HISTORICALLY_CORRECTED_FILES = [
  {
    path: "tests/e2e/operational-browser-acceptance.spec.ts",
    bytes: 23626,
    blob: "83926082888a8140246a96a9de080429f7685200",
    sha256: "6ad1b38cfd921a36866eca9844a504b552676d530afb30dddfca7dc38d1c46b2",
  },
  {
    path: "tests/e2e/operational-document-upload.ts",
    bytes: 111023,
    blob: "da67f731d2538f9559d51f18a0d21e62cb4047c4",
    sha256: "2064b7f32e65aa7b6cb44c560bb3dc493550563513632747c2444dd191e88ec9",
  },
  {
    path: "tests/e2e/fixtures/operational-browser-journeys.json",
    bytes: 49995,
    blob: "d8be0523a7fe38834e3b398bbead2ffa5ead289e",
    sha256: "0bd7312b43629bd6b0b0be5dfc81ad87934c3ae7420c94114cfc29edf129d6ad",
  },
  {
    path: "tests/unit/operational-document-upload.test.ts",
    bytes: 127833,
    blob: "049566a9fbac4c2bf38c0bdd5aa34e27e8c8ba35",
    sha256: "d00824df6b63ac5b9a88c4266c0329fd8a0facf20390433dec6a886f6d39c2a8",
  },
  {
    path: "tests/unit/operational-browser-manifest.test.ts",
    bytes: 28303,
    blob: "fe056d5045e3d0d193c7fdab088d11e6202d37bf",
    sha256: "6f2ae5870576e93287159c92b3cfc0734f638cde316700b222fe423a9c36a4e1",
  },
] as const;

const IMMUTABLE_337_WORKFLOW_FIXTURE_PATH =
  "tests/unit/operational-role-session-wiring-20261021/fixtures/deploy-dev-337f3dd7fb530b44f4e65875dd03c7a2191e3706.yml";

const IMMUTABLE_337_CALLER_BASELINES = {
  workflow: {
    path: ".github/workflows/deploy-dev.yml",
    bytes: 156378,
    blob: "45f3ae0f3388750c93cf5c3b9d72354b7f5c0f60",
    sha256: "1daf71f8bb8304c758e23181369ca4ac5e8dc41fc3b639ecaffba436ae3f1cb5",
  },
  runner: {
    path: "operations/verification/run-operational-browser-acceptance.sh",
    bytes: 8799,
    blob: "4e2fd9fc1c5d9c4746651482ca42a5080daf0a78",
    sha256: "6853cd60277a718b24cf34f754628c74cd0923f4b51920bad6e29b04c989b70a",
  },
} as const;

function sha256Hex(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function gitBlobSha1Hex(content: Buffer | string): string {
  const buf = typeof content === "string" ? Buffer.from(content) : content;
  return createHash("sha1")
    .update(`blob ${buf.byteLength}\0`)
    .update(buf)
    .digest("hex");
}

function hasLocalBaselineCommit(commitSha: string): boolean {
  const probe = spawnSync("git", ["cat-file", "-e", `${commitSha}^{commit}`], {
    encoding: "utf8",
  });
  return probe.status === 0;
}

function hasLocalBlob(blobSha: string): boolean {
  const probe = spawnSync("git", ["cat-file", "-e", blobSha], {
    encoding: "utf8",
  });
  return probe.status === 0;
}

function reconstructImmutable337CallerSources(): {
  baselineWorkflow: string;
  baselineRunner: string;
} {
  const currentWorkflow = readFileSync(
    path.join(process.cwd(), IMMUTABLE_337_CALLER_BASELINES.workflow.path),
    "utf8",
  );
  const currentRunner = readFileSync(
    path.join(process.cwd(), IMMUTABLE_337_CALLER_BASELINES.runner.path),
    "utf8",
  );

  const workflowAddedBlocks = [
    [
      "      - name: Mint identity token — driver provisioning (operational candidate)",
      "        id: id_token_driver_provisioning",
      "        uses: google-github-actions/auth@v2",
      "        with:",
      "          workload_identity_provider: ${{ env.DEV_WIF_PROVIDER || env.WIF_PROVIDER }}",
      "          service_account: drts-dev-live-map@${{ needs.prepare.outputs.project_id }}.iam.gserviceaccount.com",
      "          project_id: ${{ needs.prepare.outputs.project_id }}",
      "          token_format: id_token",
      "          id_token_audience: ${{ format('{0}/driver-provisioning', needs.health-check.outputs.api) }}",
      "          id_token_include_email: true",
      "          create_credentials_file: false",
      "          export_environment_variables: false",
      "",
      "",
    ].join("\n"),
    [
      "          DEV_GCP_PROJECT_ID: ${{ needs.prepare.outputs.project_id }}",
      "          DRTS_LIVE_MAP_GOOGLE_PROVISIONING_ID_TOKEN: ${{ steps.id_token_driver_provisioning.outputs.id_token }}",
      "          DRTS_OPERATIONAL_GOOGLE_PROVISIONING_ID_TOKEN: ${{ steps.id_token_driver_provisioning.outputs.id_token }}",
      "          DRTS_LIVE_MAP_TEST_DRIVER_ID: drv-demo-002",
      "          DRTS_OPERATIONAL_OWN_FLEET_PARTNER_ID: fleet-demo-001",
      "          DRTS_OPERATIONAL_OPS_NON_REVIEWER_SESSION_TOKEN: ${{ secrets.DRTS_OPERATIONAL_OPS_NON_REVIEWER_SESSION_TOKEN }}",
      "          DRTS_OPERATIONAL_SYSTEM_SESSION_TOKEN: ${{ secrets.DRTS_OPERATIONAL_SYSTEM_SESSION_TOKEN }}",
      "          DRTS_OPERATIONAL_DRIVER_SESSION_TOKEN: ${{ secrets.DRTS_OPERATIONAL_DRIVER_SESSION_TOKEN }}",
      "          DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_TOKEN: ${{ secrets.DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_TOKEN }}",
      "          DRTS_OPERATIONAL_OTHER_FLEET_SESSION_TOKEN: ${{ secrets.DRTS_OPERATIONAL_OTHER_FLEET_SESSION_TOKEN }}",
      "          DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_SLUG: ${{ vars.DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_SLUG || secrets.DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_SLUG }}",
      "          DRTS_OPERATIONAL_FOREIGN_FLEET_API_KEY: ${{ secrets.DRTS_OPERATIONAL_FOREIGN_FLEET_API_KEY }}",
      "          DRTS_OPERATIONAL_FOREIGN_FLEET_PARTNER_ID: ${{ vars.DRTS_OPERATIONAL_FOREIGN_FLEET_PARTNER_ID || secrets.DRTS_OPERATIONAL_FOREIGN_FLEET_PARTNER_ID }}",
      "",
    ].join("\n"),
    [
      "      - name: Refresh identity token — driver provisioning cleanup (operational candidate)",
      "        if: always() && env.DRTS_OPERATIONAL_ROLE_SESSIONS_CLEANUP_STATUS != 'passed'",
      "        id: id_token_driver_provisioning_cleanup",
      "        uses: google-github-actions/auth@v2",
      "        with:",
      "          workload_identity_provider: ${{ env.DEV_WIF_PROVIDER || env.WIF_PROVIDER }}",
      "          service_account: drts-dev-live-map@${{ needs.prepare.outputs.project_id }}.iam.gserviceaccount.com",
      "          project_id: ${{ needs.prepare.outputs.project_id }}",
      "          token_format: id_token",
      "          id_token_audience: ${{ format('{0}/driver-provisioning', needs.health-check.outputs.api) }}",
      "          id_token_include_email: true",
      "          create_credentials_file: false",
      "          export_environment_variables: false",
      "      - name: Revoke operational role sessions and driver device invitation",
      "        if: always() && env.DRTS_OPERATIONAL_ROLE_SESSIONS_CLEANUP_STATUS != 'passed'",
      "        env:",
      "          DRTS_CANDIDATE_SHA: ${{ needs.build-push.outputs.candidate_sha }}",
      "          DEV_GCP_PROJECT_ID: ${{ needs.prepare.outputs.project_id }}",
      "          DRTS_OPERATIONAL_API_URL: ${{ needs.health-check.outputs.api }}",
      "          DRTS_OPERATIONAL_OPS_CONSOLE_URL: ${{ needs.health-check.outputs.ops_console }}",
      "          DRTS_LIVE_MAP_GOOGLE_PROVISIONING_ID_TOKEN: ${{ steps.id_token_driver_provisioning_cleanup.outputs.id_token }}",
      "          DRTS_OPERATIONAL_GOOGLE_PROVISIONING_ID_TOKEN: ${{ steps.id_token_driver_provisioning_cleanup.outputs.id_token }}",
      "          DRTS_LIVE_MAP_TEST_DRIVER_ID: drv-demo-002",
      "          DRTS_OPERATIONAL_OWN_FLEET_PARTNER_ID: fleet-demo-001",
      "        run: npx tsx operations/verification/prepare-operational-role-sessions.ts --teardown",
      "",
    ].join("\n"),
  ];

  for (const block of workflowAddedBlocks) {
    expect(currentWorkflow).toContain(block);
  }

  const fixtureWorkflow = readFileSync(
    path.join(process.cwd(), IMMUTABLE_337_WORKFLOW_FIXTURE_PATH),
    "utf8",
  );
  const baselineWorkflow = hasLocalBaselineCommit(IMMUTABLE_BASELINE_REF)
    ? execFileSync(
        "git",
        [
          "show",
          `${IMMUTABLE_BASELINE_REF}:${IMMUTABLE_337_CALLER_BASELINES.workflow.path}`,
        ],
        { encoding: "utf8" },
      )
    : hasLocalBlob(IMMUTABLE_337_CALLER_BASELINES.workflow.blob)
      ? execFileSync(
          "git",
          ["cat-file", "blob", IMMUTABLE_337_CALLER_BASELINES.workflow.blob],
          { encoding: "utf8" },
        )
      : fixtureWorkflow;

  expect(fixtureWorkflow).toBe(baselineWorkflow);
  for (const block of workflowAddedBlocks) {
    expect(baselineWorkflow).not.toContain(block);
  }

  const baselineRunner = currentRunner
    .replace("\numask 077\n", "\n")
    .replace(
      [
        'ROLE_SESSIONS_ENV_FILE="$(mktemp "${TMPDIR:-/tmp}/drts-operational-role-sessions.XXXXXX.env")"',
        "ROLE_SESSIONS_BOOTSTRAP_INVOKED=0",
        "",
        "load_operational_role_session_exports() {",
        '  [[ -f "$ROLE_SESSIONS_ENV_FILE" ]] || return 0',
        "  local env_key env_value",
        "  while IFS='=' read -r env_key env_value || [[ -n \"$env_key\" ]]; do",
        '    [[ -n "$env_key" ]] || continue',
        '    case "$env_key" in',
        "      DRTS_OPERATIONAL_*|DRTS_LIVE_MAP_*)",
        '        if [[ "$env_key" =~ ^(DRTS_OPERATIONAL_|DRTS_LIVE_MAP_)[A-Z0-9_]+$ ]]; then',
        '          export "${env_key}=${env_value}"',
        "        fi",
        "        ;;",
        "    esac",
        '  done < "$ROLE_SESSIONS_ENV_FILE"',
        "}",
        "",
        "cleanup_operational_acceptance() {",
        "  local exit_code=$?",
        "  set +e",
        "  load_operational_role_session_exports",
        '  if [[ "$ROLE_SESSIONS_BOOTSTRAP_INVOKED" -eq 1 && "${DRTS_OPERATIONAL_ROLE_SESSIONS_CLEANUP_STATUS:-}" != "passed" ]]; then',
        "    npx tsx operations/verification/prepare-operational-role-sessions.ts \\",
        '      --teardown --env-file "$ROLE_SESSIONS_ENV_FILE"',
        "    local teardown_code=$?",
        "    load_operational_role_session_exports",
        '    if [[ "$teardown_code" -ne 0 && "$exit_code" -eq 0 ]]; then',
        '      exit_code="$teardown_code"',
        "    fi",
        "  fi",
        '  rm -f "$MATERIALIZED_MANIFEST" "$MATERIALIZED_SURFACE_MANIFEST" "$ROLE_SESSIONS_ENV_FILE"',
        '  exit "$exit_code"',
        "}",
        "trap cleanup_operational_acceptance EXIT",
      ].join("\n"),
      'trap \'rm -f "$MATERIALIZED_MANIFEST" "$MATERIALIZED_SURFACE_MANIFEST"\' EXIT',
    )
    .replace(
      [
        'export DRTS_LIVE_MAP_GOOGLE_PROVISIONING_ID_TOKEN="${DRTS_LIVE_MAP_GOOGLE_PROVISIONING_ID_TOKEN:-${DRTS_OPERATIONAL_GOOGLE_PROVISIONING_ID_TOKEN:-}}"',
        'export DRTS_OPERATIONAL_GOOGLE_PROVISIONING_ID_TOKEN="${DRTS_LIVE_MAP_GOOGLE_PROVISIONING_ID_TOKEN}"',
        "",
        "ROLE_SESSIONS_BOOTSTRAP_INVOKED=1",
        "npx tsx operations/verification/prepare-operational-role-sessions.ts \\",
        '  --env-file "$ROLE_SESSIONS_ENV_FILE"',
        "load_operational_role_session_exports",
        "",
        ': "${DRTS_OPERATIONAL_OPS_NON_REVIEWER_SESSION_TOKEN:?missing ops_non_reviewer operational session token}"',
        ': "${DRTS_OPERATIONAL_SYSTEM_SESSION_TOKEN:?missing system operational session token}"',
        ': "${DRTS_OPERATIONAL_DRIVER_SESSION_TOKEN:?missing driver operational session token}"',
        ': "${DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_TOKEN:?missing foreign_fleet operational session token}"',
        'export DRTS_OPERATIONAL_OTHER_FLEET_SESSION_TOKEN="${DRTS_OPERATIONAL_OTHER_FLEET_SESSION_TOKEN:-${DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_TOKEN}}"',
        "",
      ].join("\n"),
      "",
    );

  return { baselineWorkflow, baselineRunner };
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
  aud: `${API_ORIGIN}/driver-provisioning`,
  email: `drts-dev-live-map@${GCP_PROJECT_ID}.iam.gserviceaccount.com`,
});

const SIM_OPS_CONSOLE_ID_TOKEN = "sim-cloud-run-ops-console-id-token";
const SIM_PLATFORM_ADMIN_ID_TOKEN = "sim-cloud-run-platform-admin-id-token";
const SIM_API_ID_TOKEN = "sim-cloud-run-api-id-token";
const SIM_OPS_SESSION_TOKEN = "sim-app-ops-non-reviewer-jwt-token";
const SIM_OPS_SESSION_ID = "sess-ops-non-reviewer-001";
const SIM_OPS_PRINCIPAL_ID = "ops-operator-001";
const SIM_SYSTEM_SESSION_TOKEN = "sim-app-system-provisioner-jwt-token";
const SIM_DRIVER_INVITE_CODE = "sim-driver-invite-code-drv-demo-002";
const SIM_DRIVER_SESSION_TOKEN = "sim-app-driver-demo-002-jwt-token";
const SIM_FOREIGN_FLEET_API_KEY = "sim-foreign-fleet-api-key-002";
const SIM_FOREIGN_FLEET_SESSION_ID = "sess-foreign-fleet-002";
const SIM_FOREIGN_FLEET_SESSION_TOKEN = makeFakeJwt(
  {
    sub: "partner_bootstrap:fleet-foreign-002:foreign-fleet-alpha",
    realm: "partner",
    actorType: "partner_api_key",
    sid: SIM_FOREIGN_FLEET_SESSION_ID,
    partnerId: "fleet-foreign-002",
    roles: ["partner_ingress"],
    scopes: ["fleet:read", "fleet:write", "regulatory:write"],
  },
  "sim-app-foreign-fleet-sig",
);
const SIM_OWN_FLEET_SESSION_TOKEN = "sim-app-own-fleet-001-jwt-token";
const SIM_PLATFORM_REVIEWER_SESSION_TOKEN =
  "sim-app-platform-reviewer-jwt-token";
const SIM_PLATFORM_ADMIN_SESSION_ID = "sess-platform-admin-001";
const SIM_PLATFORM_ADMIN_PRINCIPAL_ID = "platform-admin-001";

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
    DRTS_OPERATIONAL_PLATFORM_ADMIN_URL: ADMIN_ORIGIN,
    DRTS_OPERATIONAL_PLATFORM_ADMIN_ID_TOKEN: SIM_PLATFORM_ADMIN_ID_TOKEN,
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
    foreignEntrySlug?: string;
    foreignPartnerType?: string | null;
    foreignPartnerStatus?: string;
    foreignPartnerActiveFlag?: boolean;
    foreignSessionStatus?: number;
    omitForeignSessionIdInSessionLookup?: boolean;
    foreignBootstrapStatus?: number;
    canonicalFleetPartnerIds?: string[];
    candidateShaOverride?: string | null;
    failDriverRevoke?: boolean;
    failForeignSessionRevokeOnce?: boolean;
  } = {},
) {
  const calls: RecordedCall[] = [];
  const candidateSha =
    options.candidateShaOverride === undefined
      ? CANDIDATE_SHA
      : options.candidateShaOverride;
  const foreignPartnerId = options.foreignPartnerId ?? "fleet-foreign-002";
  const foreignEntrySlug = options.foreignEntrySlug ?? "foreign-fleet-alpha";
  const canonicalFleetPartnerIds = new Set(
    options.canonicalFleetPartnerIds ?? [
      OPERATIONAL_OWN_FLEET_PARTNER_ID,
      "fleet-foreign-002",
    ],
  );
  let failedForeignRevokeOnce = false;

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

    if (
      method === "POST" &&
      url === `${ADMIN_ORIGIN}/control-plane-proxy/auth/token`
    ) {
      expect(headers.authorization).toBe(
        `Bearer ${SIM_PLATFORM_ADMIN_ID_TOKEN}`,
      );
      return jsonResponse(
        {
          data: {
            token: SIM_PLATFORM_REVIEWER_SESSION_TOKEN,
            sessionId: SIM_PLATFORM_ADMIN_SESSION_ID,
            principalId: SIM_PLATFORM_ADMIN_PRINCIPAL_ID,
            expiresIn: "8h",
            realm: "platform",
            actorType: "platform_admin",
          },
        },
        { candidateSha },
      );
    }

    if (
      method === "GET" &&
      url === `${ADMIN_ORIGIN}/control-plane-proxy/auth/session`
    ) {
      expect(headers.authorization).toBe(
        `Bearer ${SIM_PLATFORM_ADMIN_ID_TOKEN}`,
      );
      expect(headers["x-drts-authorization"]).toBe(
        `Bearer ${SIM_PLATFORM_REVIEWER_SESSION_TOKEN}`,
      );
      return jsonResponse(
        {
          data: {
            active: true,
            identity: {
              realm: "platform",
              actorType: "platform_admin",
              actorId: SIM_PLATFORM_ADMIN_PRINCIPAL_ID,
              principalId: SIM_PLATFORM_ADMIN_PRINCIPAL_ID,
              sessionId: SIM_PLATFORM_ADMIN_SESSION_ID,
              authMode: "jwt_bearer",
              roles: ["platform_admin"],
              scopes: ["foundation:read"],
            },
          },
        },
        { candidateSha },
      );
    }

    if (
      method === "GET" &&
      url.startsWith(
        `${ADMIN_ORIGIN}/control-plane-proxy/admin/fleet-partners/`,
      )
    ) {
      expect(headers.authorization).toBe(
        `Bearer ${SIM_PLATFORM_ADMIN_ID_TOKEN}`,
      );
      expect(headers["x-drts-authorization"]).toBe(
        `Bearer ${SIM_PLATFORM_REVIEWER_SESSION_TOKEN}`,
      );
      const requestedPartnerId = decodeURIComponent(
        url.slice(
          `${ADMIN_ORIGIN}/control-plane-proxy/admin/fleet-partners/`.length,
        ),
      );
      if (!canonicalFleetPartnerIds.has(requestedPartnerId)) {
        return jsonResponse(
          { error: { code: "RESOURCE_NOT_FOUND" } },
          { status: 404, candidateSha },
        );
      }
      return jsonResponse(
        {
          fleetPartnerId: requestedPartnerId,
          active: true,
          legalName: "Simulated Canonical Foreign Fleet",
          displayName: "Simulated Canonical Foreign Fleet",
          businessRegistrationNo: "sim-reg-002",
          contactName: "Sim Contact",
          contactPhone: "0900000000",
          partnershipType: "fleet_management",
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
        if (
          options.foreignSessionStatus &&
          options.foreignSessionStatus !== 200
        ) {
          return jsonResponse(
            { error: "session_lookup_unavailable" },
            { status: options.foreignSessionStatus, candidateSha },
          );
        }
        return jsonResponse(
          {
            data: {
              active: true,
              identity: {
                realm: "partner",
                actorType: "partner_api_key",
                actorId: `partner_bootstrap:${foreignPartnerId}:${foreignEntrySlug}`,
                partnerId: foreignPartnerId,
                ...(options.omitForeignSessionIdInSessionLookup
                  ? {}
                  : { sessionId: SIM_FOREIGN_FLEET_SESSION_ID }),
                roles: ["partner_ingress"],
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
      expect(payload.entrySlug).toBe(foreignEntrySlug);
      expect(payload.apiKey).toBe(SIM_FOREIGN_FLEET_API_KEY);
      return jsonResponse(
        {
          data: {
            accessToken: SIM_FOREIGN_FLEET_SESSION_TOKEN,
            tokenType: "Bearer",
            expiresIn: "1h",
            partnerEntry: {
              entryId: `entry-${foreignPartnerId}`,
              entrySlug: foreignEntrySlug,
              partnerId: foreignPartnerId,
              ...(options.foreignPartnerType === null
                ? {}
                : {
                    partnerType: options.foreignPartnerType ?? "fleet_partner",
                  }),
              status: options.foreignPartnerStatus ?? "active",
              activeFlag: options.foreignPartnerActiveFlag ?? true,
            },
            // Real AuthController.issuePartnerBootstrapSession / TenantPartnerService
            // returns identity without sessionId (sessionId is carried in JWT sid claim).
            identity: {
              realm: "partner",
              actorType: "partner_api_key",
              actorId: `partner_bootstrap:${foreignPartnerId}:${foreignEntrySlug}`,
              partnerId: foreignPartnerId,
              roles: ["partner_ingress"],
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
      if (
        options.failForeignSessionRevokeOnce &&
        !failedForeignRevokeOnce &&
        payload.sessionId === SIM_FOREIGN_FLEET_SESSION_ID
      ) {
        failedForeignRevokeOnce = true;
        return jsonResponse(
          { error: "temporary_revoke_failure" },
          { status: 503, candidateSha },
        );
      }
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
  describe("immutable baseline gap proof and C125 five-file historical preservation", () => {
    it("proves immutable baseline 337f3dd7fb530b44f4e65875dd03c7a2191e3706 lacked the four role-session producers/forwarders in deploy-dev.yml and run-operational-browser-acceptance.sh", () => {
      const { baselineWorkflow, baselineRunner } =
        reconstructImmutable337CallerSources();

      expect(Buffer.byteLength(baselineWorkflow, "utf8")).toBe(
        IMMUTABLE_337_CALLER_BASELINES.workflow.bytes,
      );
      expect(gitBlobSha1Hex(baselineWorkflow)).toBe(
        IMMUTABLE_337_CALLER_BASELINES.workflow.blob,
      );
      expect(sha256Hex(baselineWorkflow)).toBe(
        IMMUTABLE_337_CALLER_BASELINES.workflow.sha256,
      );

      expect(Buffer.byteLength(baselineRunner, "utf8")).toBe(
        IMMUTABLE_337_CALLER_BASELINES.runner.bytes,
      );
      expect(gitBlobSha1Hex(baselineRunner)).toBe(
        IMMUTABLE_337_CALLER_BASELINES.runner.blob,
      );
      expect(sha256Hex(baselineRunner)).toBe(
        IMMUTABLE_337_CALLER_BASELINES.runner.sha256,
      );

      if (hasLocalBaselineCommit(IMMUTABLE_BASELINE_REF)) {
        const gitWorkflow = execFileSync(
          "git",
          [
            "show",
            `${IMMUTABLE_BASELINE_REF}:.github/workflows/deploy-dev.yml`,
          ],
          { encoding: "utf8" },
        );
        const gitRunner = execFileSync(
          "git",
          [
            "show",
            `${IMMUTABLE_BASELINE_REF}:operations/verification/run-operational-browser-acceptance.sh`,
          ],
          { encoding: "utf8" },
        );
        expect(baselineWorkflow).toBe(gitWorkflow);
        expect(baselineRunner).toBe(gitRunner);
      }

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

    it("keeps all five corrected C125 files' pre-correction evidence reachable when available without reverting to it, and keeps 7 journeys / 16 browser tests / 69 steps / 15 uploads / 37 role probes / 16 lineage checks intact", () => {
      for (const spec of C125_HISTORICALLY_CORRECTED_FILES) {
        // The pre-correction blob is only guaranteed reachable when full history is present:
        // a changed file's pre-correction blob is no longer referenced by HEAD's tree, so a
        // shallow fetch-depth: 1 checkout (the CI default) never fetches it. Verify it as
        // immutable gap-proof evidence when available, without failing the shallow-checkout case.
        if (hasLocalBlob(spec.blob)) {
          const historicalBlobBytes = execFileSync("git", [
            "cat-file",
            "blob",
            spec.blob,
          ]);
          expect(historicalBlobBytes.byteLength).toBe(spec.bytes);
          expect(sha256Hex(historicalBlobBytes)).toBe(spec.sha256);
        }

        // The authorized correction must not have been silently reverted back to the
        // diagnosed pre-correction contents. This only reads the current working tree, so
        // it holds regardless of shallow vs. full checkout.
        const currentBytes = readFileSync(path.join(process.cwd(), spec.path));
        expect(sha256Hex(currentBytes)).not.toBe(spec.sha256);
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

    it("wires driver-provisioning WIF assertion, four role-session bindings, and always-teardown with API WIF limited to the original operational browser step", () => {
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
      // The former global API-token prohibition gains only this authorized
      // first-visit browser consumer; no other job or runner gets a new binding.
      const browserStep = workflow
        .split("      - name: Execute candidate-bound operational journeys")[1]!
        .split("      - name:")[0]!;
      expect(browserStep).toContain(
        "DRTS_OPERATIONAL_API_ID_TOKEN: ${{ steps.id_token_api_referral_first_visit.outputs.id_token }}",
      );
      expect(browserStep).toContain(
        "DRTS_DEV_API_BASE_URL: ${{ needs.health-check.outputs.api }}",
      );
      expect(workflow.match(/DRTS_OPERATIONAL_API_ID_TOKEN:/g)).toHaveLength(1);
      expect(workflow).not.toContain("DRTS_DEV_API_ID_TOKEN");
      expect(runner).not.toContain("DRTS_OPERATIONAL_API_ID_TOKEN");
      const mintStep = workflow
        .split(
          "      - name: Mint identity token — referral first-visit evidence (operational candidate)",
        )[1]!
        .split("      - name:")[0]!;
      expect(mintStep).toContain(
        "id_token_audience: ${{ needs.health-check.outputs.api }}",
      );
      expect(mintStep).toContain(
        "service_account: ${{ env.DEV_WIF_SERVICE_ACCOUNT || env.WIF_SERVICE_ACCOUNT }}",
      );
      expect(mintStep).toContain("create_credentials_file: false");
      expect(mintStep).toContain("export_environment_variables: false");
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
      const { fetchImpl, calls } = createStandardMockFetch({
        omitForeignSessionIdInSessionLookup: true,
      });

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
      expect(exported.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_SESSION_ID).toBe(
        SIM_FOREIGN_FLEET_SESSION_ID,
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
        expect(roleHeaders.Authorization).toMatch(/^Bearer \S+$/);
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

    it("rejects non-Fleet partner entries from partnerEntry.partnerType and verifies foreign_fleet partnerId against canonical Fleet read API via Platform Admin BFF while revoking owned sessions (AFB-FOREIGN-KIND)", async () => {
      // 1. Bootstrap receipt with partnerEntry.partnerType !== "fleet_partner" is rejected and revokes owned session.
      const referralBootstrapEnv = createBaseSimulationEnv({
        DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_SLUG: "partner-referral-entry",
        DRTS_OPERATIONAL_FOREIGN_FLEET_PARTNER_ID: undefined,
      });
      const exported: Record<string, string> = {};
      let saved: OperationalRoleSessionsEvidence | undefined;
      const { fetchImpl, calls } = createStandardMockFetch({
        foreignEntrySlug: "partner-referral-entry",
        foreignPartnerId: "partner-referral-extra",
        foreignPartnerType: "referral_channel",
        omitForeignSessionIdInSessionLookup: true,
      });

      await expect(
        prepareOperationalRoleSessions(referralBootstrapEnv, {
          fetch: fetchImpl,
          mask: () => {},
          exportSession: (name, value) => {
            exported[name] = value;
            referralBootstrapEnv[name] = value;
          },
          save: (_name, data) => {
            saved = data;
          },
        }),
      ).rejects.toThrow(OperationalForeignFleetFixturePreconditionError);

      expect(saved?.status).toBe("failed");
      expect(saved?.foreign_fleet_precondition).toBe(
        "invalid-external-fixture",
      );
      expect(saved?.cleanup).toBe("passed");
      expect(
        exported.DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_TOKEN,
      ).toBeUndefined();
      // Both the Ops session AND the newly issued referral partner session must be revoked via JWT sid.
      const revokedSessionIds = calls
        .filter(
          (c) =>
            c.method === "POST" &&
            c.url === `${API_ORIGIN}/api/auth/sessions/revoke`,
        )
        .map((c) => (c.body as { sessionId?: string })?.sessionId);
      expect(revokedSessionIds).toContain(SIM_FOREIGN_FLEET_SESSION_ID);
      expect(revokedSessionIds).toContain(SIM_OPS_SESSION_ID);

      // 2. Also reject pre-provided session tokens (which have no partnerType on /api/auth/session or JWT)
      // when Admin BFF GET /control-plane-proxy/admin/fleet-partners/:partnerId returns 404.
      const providedNonFleetEnv = createBaseSimulationEnv({
        DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_TOKEN:
          SIM_FOREIGN_FLEET_SESSION_TOKEN,
        DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_SLUG: undefined,
        DRTS_OPERATIONAL_FOREIGN_FLEET_API_KEY: undefined,
        DRTS_OPERATIONAL_FOREIGN_FLEET_PARTNER_ID: undefined,
      });
      const { fetchImpl: providedNonFleetFetch, calls: providedNonFleetCalls } =
        createStandardMockFetch({
          foreignPartnerId: "partner-referral-hotel",
        });
      await expect(
        prepareOperationalRoleSessions(providedNonFleetEnv, {
          fetch: providedNonFleetFetch,
          mask: () => {},
          exportSession: () => {},
          save: () => {},
        }),
      ).rejects.toThrow(OperationalForeignFleetFixturePreconditionError);
      expect(
        providedNonFleetCalls.some(
          (c) =>
            c.method === "GET" &&
            c.url ===
              `${ADMIN_ORIGIN}/control-plane-proxy/admin/fleet-partners/partner-referral-hotel`,
        ),
      ).toBe(true);
      expect(
        providedNonFleetCalls.some(
          (c) =>
            c.method === "POST" &&
            c.url === `${API_ORIGIN}/api/auth/sessions/revoke` &&
            (c.body as { sessionId?: string })?.sessionId ===
              SIM_FOREIGN_FLEET_SESSION_ID,
        ),
      ).toBe(false);

      // 3. Fail closed with missing-external-fixture when Platform Admin BFF URL or invocation token is absent.
      const missingAdminOriginEnv = createBaseSimulationEnv({
        DRTS_OPERATIONAL_PLATFORM_ADMIN_URL: undefined,
        DRTS_DEV_PLATFORM_ADMIN_BASE_URL: undefined,
      });
      let missingAdminSaved: OperationalRoleSessionsEvidence | undefined;
      const { fetchImpl: missingAdminFetch } = createStandardMockFetch();
      await expect(
        prepareOperationalRoleSessions(missingAdminOriginEnv, {
          fetch: missingAdminFetch,
          mask: () => {},
          exportSession: () => {},
          save: (_name, data) => {
            missingAdminSaved = data;
          },
        }),
      ).rejects.toThrow(OperationalForeignFleetFixturePreconditionError);
      expect(missingAdminSaved?.foreign_fleet_precondition).toBe(
        "missing-external-fixture",
      );

      // 4. Accept pre-provided session tokens when Admin BFF confirms an active canonical Fleet record,
      // and revoke any newly exchanged owned Admin session immediately while keeping cleanup: "not-required".
      const providedCanonicalFleetEnv = createBaseSimulationEnv({
        DRTS_OPERATIONAL_PLATFORM_REVIEWER_SESSION_TOKEN: undefined,
        DRTS_OPERATIONAL_OPS_NON_REVIEWER_SESSION_TOKEN: SIM_OPS_SESSION_TOKEN,
        DRTS_OPERATIONAL_SYSTEM_SESSION_TOKEN: SIM_SYSTEM_SESSION_TOKEN,
        DRTS_OPERATIONAL_DRIVER_SESSION_TOKEN: SIM_DRIVER_SESSION_TOKEN,
        DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_TOKEN:
          SIM_FOREIGN_FLEET_SESSION_TOKEN,
        DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_SLUG: undefined,
        DRTS_OPERATIONAL_FOREIGN_FLEET_API_KEY: undefined,
      });
      const {
        fetchImpl: providedCanonicalFetch,
        calls: providedCanonicalCalls,
      } = createStandardMockFetch();
      const canonicalEvidence = await prepareOperationalRoleSessions(
        providedCanonicalFleetEnv,
        {
          fetch: providedCanonicalFetch,
          mask: () => {},
          exportSession: () => {},
          save: () => {},
        },
      );
      expect(canonicalEvidence.status).toBe("passed");
      expect(canonicalEvidence.cleanup).toBe("not-required");
      expect(canonicalEvidence.foreign_fleet_precondition).toBe(
        "satisfied-by-provided-session",
      );
      expect(
        providedCanonicalCalls.some(
          (c) =>
            c.method === "POST" &&
            c.url === `${API_ORIGIN}/api/auth/sessions/revoke` &&
            (c.body as { sessionId?: string })?.sessionId ===
              SIM_PLATFORM_ADMIN_SESSION_ID,
        ),
      ).toBe(true);
    });

    it("records and revokes owned foreign_fleet session via JWT sid claim even when /api/auth/session fails with 503 after bootstrap-session (AFB-FOREIGN-OWNED-RECOVERY)", async () => {
      const env = createBaseSimulationEnv();
      const exported: Record<string, string> = {};
      let saved: OperationalRoleSessionsEvidence | undefined;
      const { fetchImpl, calls } = createStandardMockFetch({
        foreignSessionStatus: 503,
        omitForeignSessionIdInSessionLookup: true,
      });

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
      ).rejects.toThrow(OperationalRoleSessionBootstrapError);

      expect(saved?.status).toBe("failed");
      expect(saved?.stage).toBe("foreign_fleet:verify-session");
      expect(saved?.cleanup).toBe("passed");
      expect(exported.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_SESSION_ID).toBe(
        SIM_FOREIGN_FLEET_SESSION_ID,
      );
      expect(exported.DRTS_OPERATIONAL_FOREIGN_FLEET_RECOVERY_TOKEN).toBe(
        SIM_FOREIGN_FLEET_SESSION_TOKEN,
      );
      expect(
        exported.DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_TOKEN,
      ).toBeUndefined();

      const revokedSessionIds = calls
        .filter(
          (c) =>
            c.method === "POST" &&
            c.url === `${API_ORIGIN}/api/auth/sessions/revoke`,
        )
        .map((c) => (c.body as { sessionId?: string })?.sessionId);
      expect(revokedSessionIds).toContain(SIM_FOREIGN_FLEET_SESSION_ID);
      expect(revokedSessionIds).toContain(SIM_OPS_SESSION_ID);

      // If in-process revocation of the owned foreign session also fails transiently,
      // cleanup status must be "failed" and subsequent teardownOperationalRoleSessions
      // must revoke the owned foreign session using the exported recovery metadata
      // without replaying already-revoked Ops/Driver resources.
      const retryEnv = createBaseSimulationEnv();
      const retryExported: Record<string, string> = {};
      let retrySaved: OperationalRoleSessionsEvidence | undefined;
      const { fetchImpl: retryFetch, calls: retryCalls } =
        createStandardMockFetch({
          foreignSessionStatus: 503,
          omitForeignSessionIdInSessionLookup: true,
          failForeignSessionRevokeOnce: true,
        });

      await expect(
        prepareOperationalRoleSessions(retryEnv, {
          fetch: retryFetch,
          mask: () => {},
          exportSession: (name, value) => {
            retryExported[name] = value;
            retryEnv[name] = value;
          },
          save: (_name, data) => {
            retrySaved = data;
          },
        }),
      ).rejects.toThrow(OperationalRoleSessionBootstrapError);

      expect(retrySaved?.cleanup).toBe("failed");
      expect(retryExported.DRTS_OPERATIONAL_ROLE_SESSIONS_CLEANUP_STATUS).toBe(
        "failed",
      );

      const teardownEvidence = await teardownOperationalRoleSessions(retryEnv, {
        fetch: retryFetch,
        mask: () => {},
        exportSession: (name, value) => {
          retryExported[name] = value;
          retryEnv[name] = value;
        },
        save: () => {},
      });
      expect(teardownEvidence.status).toBe("passed");
      expect(teardownEvidence.ops_session_revoked).toBe(true);
      expect(teardownEvidence.foreign_fleet_session_revoked).toBe(true);
      expect(
        retryCalls.filter(
          (c) =>
            c.method === "POST" &&
            c.url === `${API_ORIGIN}/api/auth/sessions/revoke` &&
            (c.body as { sessionId?: string })?.sessionId ===
              SIM_FOREIGN_FLEET_SESSION_ID,
        ),
      ).toHaveLength(2);
      expect(
        retryCalls.filter(
          (c) =>
            c.method === "POST" &&
            c.url === `${API_ORIGIN}/api/auth/sessions/revoke` &&
            (c.body as { sessionId?: string })?.sessionId ===
              SIM_OPS_SESSION_ID,
        ),
      ).toHaveLength(1);
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

  describe("C125-OWNED-FOREIGN-FLEET-FIXTURE-20261021 caller-owned canonical foreign Fleet creation, recovery, and teardown", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "test");
      vi.stubEnv("APP_ENV", "test");
      vi.stubEnv("DRTS_ENV", "development");
      vi.stubEnv("DRTS_E2E_PROVISIONING", "false");
      vi.stubEnv("DRTS_DEV_MFA_WAIVED", "true");
      vi.stubEnv("STRICT_IAP_MODE", "false");
      vi.stubEnv("CONTROL_PLANE_IAP_ENABLED", "false");
      vi.stubEnv("ALLOW_DEV_TOKEN_FALLBACK", "true");
      vi.stubEnv(
        "JWT_SECRET",
        "test-only-socket-free-jwt-secret-c125-owned-foreign-fleet-20261021",
      );
      vi.stubEnv(
        "DRTS_INTERNAL_AUTH_SHARED_SECRET",
        "test-only-socket-free-internal-auth-shared-secret-20261021",
      );
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    function createNoProvidedForeignFleetEnv(
      overrides: Record<string, string | undefined> = {},
    ): Record<string, string | undefined> {
      return createBaseSimulationEnv({
        DRTS_OPERATIONAL_FOREIGN_FLEET_SESSION_TOKEN: undefined,
        DRTS_OPERATIONAL_OTHER_FLEET_SESSION_TOKEN: undefined,
        DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_SLUG: undefined,
        DRTS_OPERATIONAL_OTHER_FLEET_ENTRY_SLUG: undefined,
        DRTS_OPERATIONAL_FOREIGN_FLEET_API_KEY: undefined,
        DRTS_OPERATIONAL_OTHER_FLEET_API_KEY: undefined,
        DRTS_OPERATIONAL_FOREIGN_FLEET_PARTNER_ID: undefined,
        DRTS_OPERATIONAL_OTHER_FLEET_PARTNER_ID: undefined,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_TOKEN: undefined,
        DRTS_OPERATIONAL_PLATFORM_REVIEWER_SESSION_TOKEN: undefined,
        ...overrides,
      });
    }

    function createOwnedForeignFleetRealServiceHarness(
      options: {
        partnerEntriesOverride?: Array<Record<string, unknown>>;
        overrideCreatedFleetId?: string;
        overrideCreatedFleetActive?: boolean;
        dropFleetCreateResponseAfterPersist?: boolean;
        dropFleetCreateWithoutPersist?: boolean;
        duplicateFleetOnLostResponse?: boolean;
        dropEntryCreateResponseAfterPersist?: boolean;
        dropEntryCreateWithoutPersist?: boolean;
        injectUnrelatedEntryCollisionOnLostResponse?: boolean;
        failEntryCreateStatus?: number;
        dropKeyIssueResponseAfterPersist?: boolean;
        dropKeyIssueWithoutPersist?: boolean;
        failKeyIssueStatus?: number;
        dropBootstrapResponseAfterPersist?: boolean;
        dropBootstrapWithoutPersist?: boolean;
        failCanonicalFleetVerifyStatus?: number;
        failFleetDeactivateOnce?: boolean;
        expireFirstAdminSessionBeforeTeardown?: boolean;
        failAdminSessionVerifyWithTransientErrorOnTeardownOnce?: boolean;
        strictNoDevStepUpWaiver?: boolean;
        crossInstanceStepUpMismatch?: boolean;
      } = {},
    ) {
      const auditNotificationService = new AuditNotificationService();
      const stepUpProofService = new StepUpProofService();
      const stepUpProofServiceInstanceB = new StepUpProofService();
      const driverProfileService = new DriverProfileService(
        auditNotificationService,
      );
      const opsDispatchEventsService = new OpsDispatchEventsService(
        new EventEmitter() as unknown as ConstructorParameters<
          typeof OpsDispatchEventsService
        >[0],
      );
      const regulatoryRegistryService = new RegulatoryRegistryService(
        opsDispatchEventsService,
        auditNotificationService,
        driverProfileService,
      );
      const billingSettlementService = new BillingSettlementService(
        auditNotificationService,
      );
      billingSettlementService.publishDriverFeePlan({
        planName: "Demo Driver Fee Plan",
        version: "2026.04",
        serviceFeeBps: 1200,
        reimbursementMode: "platform_funded",
      });
      const callcenterService = new CallcenterService(auditNotificationService);
      const ownedMobilityTaskEventsService = new OwnedMobilityTaskEventsService(
        new EventEmitter() as unknown as ConstructorParameters<
          typeof OwnedMobilityTaskEventsService
        >[0],
      );
      const ownedMobilityService = new OwnedMobilityService(
        regulatoryRegistryService,
        auditNotificationService,
        callcenterService,
        ownedMobilityTaskEventsService,
        opsDispatchEventsService,
      );

      const sqlSpecs: Record<string, string> = {
        "admin.phase1_fleet_partners": "fleet_partner_id",
        "admin.phase1_partner_channel_entries": "entry_slug",
        "admin.phase1_partner_ingress_credentials": "key_id",
      };
      const sqlTables = new Map(
        Object.keys(sqlSpecs).map((t) => [
          t,
          new Map<string, Record<string, unknown>>(),
        ]),
      );
      const sqlEvents: Array<Record<string, unknown>> = [];
      const sqlQuery = async (sqlText: string, values: unknown[] = []) => {
        const s = sqlText.trim().replace(/\s+/g, " ");
        let match: RegExpMatchArray | null;
        if (/^(BEGIN|COMMIT|ROLLBACK)\b/i.test(s)) {
          sqlEvents.push({ verb: s.split(" ")[0] });
          return { rows: [], rowCount: 0 };
        }
        if (
          (match = s.match(/^INSERT INTO ([a-z0-9_.]+) \(([^)]+)\)/i)) !== null
        ) {
          const table = match[1]!;
          const rows = sqlTables.get(table);
          if (!rows) {
            throw new Error(`HARNESS_ERROR: unbound INSERT table ${table}`);
          }
          const columns = match[2]!.split(",").map((x) => x.trim());
          const recordAt = columns.indexOf("record");
          const keyAt = columns.indexOf(sqlSpecs[table]!);
          if (
            recordAt < 0 ||
            keyAt < 0 ||
            typeof values[recordAt] !== "string"
          ) {
            throw new Error(`HARNESS_ERROR: unbound INSERT shape ${table}`);
          }
          const record = JSON.parse(values[recordAt] as string) as Record<
            string,
            unknown
          >;
          const key = String(values[keyAt]);
          const prior = rows.get(key) as
            | { record?: Record<string, unknown> }
            | undefined;
          if (
            table === "admin.phase1_partner_channel_entries" &&
            prior?.record?.referralRevenueShareRules &&
            s.includes("referralRevenueShareRules")
          ) {
            record.referralRevenueShareRules = structuredClone(
              prior.record.referralRevenueShareRules,
            );
          }
          const row = Object.fromEntries(
            columns.map((c, i) => [c, c === "record" ? record : values[i]]),
          );
          rows.set(key, structuredClone(row));
          sqlEvents.push({ verb: "INSERT_UPSERT", table, id: key });
          return { rows: [], rowCount: 1 };
        }
        if ((match = s.match(/^SELECT\b.*?\bFROM ([a-z0-9_.]+)/i)) !== null) {
          const table = match[1]!;
          const rows = sqlTables.get(table);
          if (!rows) {
            throw new Error(`HARNESS_ERROR: unbound SELECT table ${table}`);
          }
          let selected = [...rows.values()];
          for (const m of s.matchAll(/\b([a-z_]+) = \$(\d+)/g)) {
            const col = m[1]!;
            const idx = Number(m[2]) - 1;
            if (col === "record") {
              throw new Error("HARNESS_ERROR: unbound JSON predicate");
            }
            selected = selected.filter((row) => row[col] === values[idx]);
          }
          if (/\bactive = true\b/i.test(s)) {
            selected = selected.filter((row) => row.active === true);
          }
          sqlEvents.push({ verb: "SELECT", table, count: selected.length });
          return { rows: structuredClone(selected), rowCount: selected.length };
        }
        throw new Error(`HARNESS_ERROR: unbound SQL ${s.slice(0, 180)}`);
      };
      const sqlDb = {
        isEnabled: () => true,
        query: sqlQuery,
        withTransaction: async <T>(
          work: (client: { query: typeof sqlQuery }) => Promise<T>,
        ) => {
          const before: Array<
            [string, Array<[string, Record<string, unknown>]>]
          > = structuredClone(
            [...sqlTables.entries()].map(
              ([k, v]): [string, Array<[string, Record<string, unknown>]>] => [
                k,
                [...v.entries()],
              ],
            ),
          );
          try {
            const result = await work({ query: sqlQuery });
            sqlEvents.push({ verb: "COMMIT" });
            return result;
          } catch (e) {
            sqlTables.clear();
            for (const [k, v] of before) {
              sqlTables.set(k, new Map(v));
            }
            sqlEvents.push({ verb: "ROLLBACK" });
            throw e;
          }
        },
      };

      const fleetPartnerRepository = new FleetPartnerRepository(sqlDb as never);
      const fleetPartnerService = new FleetPartnerService(
        billingSettlementService,
        ownedMobilityService,
        regulatoryRegistryService,
        fleetPartnerRepository,
      );
      const fleetPartnerController = new FleetPartnerController(
        fleetPartnerService,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
      // With a repository the service reads Fleet masters from the table being
      // seeded here, so take the default seed from a repository-less instance.
      const seedFleetPartners = new FleetPartnerService(
        billingSettlementService,
        ownedMobilityService,
        regulatoryRegistryService,
      ).listFleetPartners() as Awaited<
        ReturnType<FleetPartnerService["listFleetPartners"]>
      >;
      for (const seeded of seedFleetPartners) {
        sqlTables
          .get("admin.phase1_fleet_partners")!
          .set(seeded.fleetPartnerId, {
            fleet_partner_id: seeded.fleetPartnerId,
            active: seeded.active,
            record: structuredClone(seeded),
          });
      }

      const tenantPartnerRepository = new TenantPartnerRepository(
        sqlDb as never,
      );

      const backingIdentityRepository = new IdentityRepository();
      const identityRepository = new Proxy(backingIdentityRepository, {
        get(target, key) {
          if (key === "isEnabled") return () => true;
          const value = Reflect.get(target, key, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const platformAdminService = new PlatformAdminService(
        auditNotificationService,
        undefined,
        backingIdentityRepository,
      );
      const tenantPartnerService = new TenantPartnerService(
        auditNotificationService,
        tenantPartnerRepository,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        identityRepository,
        undefined,
        null,
        fleetPartnerRepository,
      );
      tenantPartnerService.onModuleDestroy();
      for (const seededEntry of tenantPartnerService.listPlatformPartnerEntries()) {
        sqlTables
          .get("admin.phase1_partner_channel_entries")!
          .set(seededEntry.entrySlug, {
            entry_slug: seededEntry.entrySlug,
            tenant_id: seededEntry.tenantId,
            partner_id: seededEntry.partnerId,
            program_id: seededEntry.programId,
            status: seededEntry.status,
            record: structuredClone(seededEntry),
          });
      }
      const jwtAuthService = new JwtAuthService(
        identityRepository,
        tenantPartnerService,
        regulatoryRegistryService,
      );
      const tenantPartnerController = new TenantPartnerController(
        tenantPartnerService,
        billingSettlementService,
        {} as never,
        jwtAuthService,
        {} as never,
        identityRepository,
        auditNotificationService,
      );
      const driverDeviceSessionService = new DriverDeviceSessionService(
        jwtAuthService,
        driverProfileService,
        undefined,
        regulatoryRegistryService,
      );
      const authController = new AuthController(
        jwtAuthService,
        tenantPartnerService,
        driverDeviceSessionService,
        undefined,
        undefined,
        undefined,
        identityRepository,
      );
      const identityController = new IdentityController(
        identityRepository,
        undefined,
        stepUpProofService,
      );
      const guard = new BootstrapAuthGuard(
        new Reflector(),
        jwtAuthService,
        undefined,
        undefined,
        undefined,
        undefined,
        stepUpProofService,
      );
      const guardInstanceB = new BootstrapAuthGuard(
        new Reflector(),
        jwtAuthService,
        undefined,
        undefined,
        undefined,
        undefined,
        stepUpProofServiceInstanceB,
      );

      const calls: RecordedCall[] = [];
      const issuedAdminSessionIds: string[] = [];
      let preIssuedReviewerAdminJwt = "";
      let initialized = false;
      let opsSessionRevoked = false;
      let driverInviteRevoked = false;
      let droppedFleetCreateOnce = false;
      let droppedEntryCreateOnce = false;
      let droppedKeyIssueOnce = false;
      let droppedBootstrapOnce = false;
      let failedFleetDeactivateOnce = false;
      let readyToFailAdminSessionVerifyOnTeardown = false;
      let failedAdminSessionVerifyOnTeardownOnce = false;

      const guardRequest = async (
        controllerClass: Record<string, unknown>,
        handlerName: string,
        reqInput: {
          method: string;
          path: string;
          url?: string;
          originalUrl?: string;
          headers?: Record<string, string | undefined>;
          body?: unknown;
          ip?: string;
        },
        activeGuard: BootstrapAuthGuard = guard,
      ) => {
        const req = {
          ...reqInput,
          url: reqInput.url ?? reqInput.path,
          originalUrl: reqInput.originalUrl ?? reqInput.url ?? reqInput.path,
          headers: Object.fromEntries(
            Object.entries(reqInput.headers ?? {}).map(([k, v]) => [
              k.toLowerCase(),
              v,
            ]),
          ),
          ip: reqInput.ip ?? "127.0.0.1",
          identity: undefined as unknown as BootstrapRequestIdentity,
        };
        const handler = (controllerClass.prototype as Record<string, unknown>)[
          handlerName
        ];
        const ctx = {
          switchToHttp: () => ({
            getRequest: () => req,
            getResponse: () => ({}),
          }),
          getHandler: () => handler,
          getClass: () => controllerClass,
        };
        await activeGuard.canActivate(ctx as never);
        return req;
      };

      const mintRealAdminSessionViaBff = async (optionsOverride?: {
        omitStepUpWaiver?: boolean;
        trackAsHelperIssued?: boolean;
      }) => {
        const prevMfaWaived = process.env.DRTS_DEV_MFA_WAIVED;
        if (optionsOverride?.omitStepUpWaiver) {
          process.env.DRTS_DEV_MFA_WAIVED = "false";
        }
        try {
          const proxy = await issueControlPlaneRequestAuth({
            actorType: "platform_admin",
            headers: new Headers(),
            defaultEmail: "admin@platform.drts",
            devCanonicalPrincipalId: "principal_platform_admin_default",
            strictIapMode: false,
            iapEnabled: false,
            jwtSecret: process.env.JWT_SECRET,
          });
          const req = await guardRequest(
            AuthController as unknown as Record<string, unknown>,
            "issueToken",
            {
              method: "POST",
              path: "/api/auth/token",
              url: "/api/auth/token",
              originalUrl: "/api/auth/token",
              headers: {
                authorization:
                  "Bearer external-BFF-upstream-Google-invocation-fixture",
                ...proxy.headers,
              },
              body: {},
            },
          );
          const issued = await authController.issueToken(req as never);
          const data =
            issued && typeof issued === "object" && "data" in issued
              ? (issued as { data?: { token?: string; sessionId?: string } })
                  .data
              : (issued as { token?: string; sessionId?: string });
          if (optionsOverride?.trackAsHelperIssued && data?.sessionId) {
            issuedAdminSessionIds.push(data.sessionId);
          }
          return {
            envelope: issued,
            token: String(data?.token ?? ""),
            sessionId: String(data?.sessionId ?? ""),
          };
        } finally {
          process.env.DRTS_DEV_MFA_WAIVED = prevMfaWaived;
        }
      };

      const ensureInitialized = async () => {
        if (initialized) return;
        initialized = true;
        await backingIdentityRepository.onModuleInit();
        await platformAdminService.onModuleInit();
        const preIssued = await mintRealAdminSessionViaBff({
          omitStepUpWaiver: false,
          trackAsHelperIssued: false,
        });
        preIssuedReviewerAdminJwt = preIssued.token;
      };

      const mapAdminBearerHeader = (rawHeader: string | undefined): string => {
        const trimmed = (rawHeader ?? "").trim();
        if (
          trimmed === `Bearer ${SIM_PLATFORM_REVIEWER_SESSION_TOKEN}` &&
          preIssuedReviewerAdminJwt
        ) {
          return `Bearer ${preIssuedReviewerAdminJwt}`;
        }
        return trimmed;
      };

      const fetchImpl = (async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => {
        await ensureInitialized();
        const url = String(input);
        const parsedUrl = new URL(url);
        const method = (init?.method ?? "GET").toUpperCase();
        const headers = normalizeHeaders(init);
        const body = parseJsonBody(init);
        calls.push({ method, url, headers, body });

        try {
          // 1. Ops BFF token exchange
          if (
            method === "POST" &&
            url === `${OPS_ORIGIN}/control-plane-proxy/auth/token`
          ) {
            expect(headers.authorization).toBe(
              `Bearer ${SIM_OPS_CONSOLE_ID_TOKEN}`,
            );
            return jsonResponse({
              data: {
                token: SIM_OPS_SESSION_TOKEN,
                sessionId: SIM_OPS_SESSION_ID,
                principalId: SIM_OPS_PRINCIPAL_ID,
                expiresIn: "8h",
                realm: "ops",
                actorType: "ops_user",
              },
            });
          }

          // 2. Platform Admin BFF token exchange -> real issueControlPlaneRequestAuth + BootstrapAuthGuard + AuthController.issueToken
          if (
            method === "POST" &&
            url === `${ADMIN_ORIGIN}/control-plane-proxy/auth/token`
          ) {
            expect(headers.authorization).toBe(
              `Bearer ${SIM_PLATFORM_ADMIN_ID_TOKEN}`,
            );
            const minted = await mintRealAdminSessionViaBff({
              omitStepUpWaiver: false,
              trackAsHelperIssued: true,
            });
            return jsonResponse(deepToSnakeCase(minted.envelope));
          }

          // 3. Platform Admin BFF session verification -> real BootstrapAuthGuard + AuthController.getAuthSession
          if (
            method === "GET" &&
            url === `${ADMIN_ORIGIN}/control-plane-proxy/auth/session`
          ) {
            expect(headers.authorization).toBe(
              `Bearer ${SIM_PLATFORM_ADMIN_ID_TOKEN}`,
            );
            if (
              options.failAdminSessionVerifyWithTransientErrorOnTeardownOnce &&
              readyToFailAdminSessionVerifyOnTeardown &&
              !failedAdminSessionVerifyOnTeardownOnce
            ) {
              failedAdminSessionVerifyOnTeardownOnce = true;
              throw new TypeError(
                "transient transport failure during Admin session verification; original session remains active",
              );
            }
            const req = await guardRequest(
              AuthController as unknown as Record<string, unknown>,
              "getAuthSession",
              {
                method: "GET",
                path: "/api/auth/session",
                url: "/api/auth/session",
                headers: {
                  authorization: mapAdminBearerHeader(
                    headers["x-drts-authorization"],
                  ),
                },
              },
            );
            return jsonResponse(
              deepToSnakeCase(
                await authController.getAuthSession(req.identity),
              ),
            );
          }

          // 3B. Platform Admin BFF step-up proof issuance -> real BootstrapAuthGuard + IdentityController.createStepUpProof
          if (
            method === "POST" &&
            url ===
              `${ADMIN_ORIGIN}/control-plane-proxy/identity/step-up-proofs`
          ) {
            expect(headers.authorization).toBe(
              `Bearer ${SIM_PLATFORM_ADMIN_ID_TOKEN}`,
            );
            const req = await guardRequest(
              IdentityController as unknown as Record<string, unknown>,
              "createStepUpProof",
              {
                method: "POST",
                path: "/api/identity/step-up-proofs",
                url: "/api/identity/step-up-proofs",
                headers: {
                  authorization: mapAdminBearerHeader(
                    headers["x-drts-authorization"],
                  ),
                },
                body,
              },
            );
            const prevWaived = process.env.DRTS_DEV_MFA_WAIVED;
            if (options.strictNoDevStepUpWaiver) {
              process.env.DRTS_DEV_MFA_WAIVED = "false";
            }
            try {
              return jsonResponse(
                deepToSnakeCase(
                  await identityController.createStepUpProof(
                    (body ?? {}) as Parameters<
                      IdentityController["createStepUpProof"]
                    >[0],
                    req.identity,
                  ),
                ),
              );
            } finally {
              process.env.DRTS_DEV_MFA_WAIVED = prevWaived;
            }
          }

          // 4. Platform Admin BFF Fleet Partner endpoints -> real BootstrapAuthGuard + FleetPartnerController
          if (
            url === `${ADMIN_ORIGIN}/control-plane-proxy/admin/fleet-partners`
          ) {
            expect(headers.authorization).toBe(
              `Bearer ${SIM_PLATFORM_ADMIN_ID_TOKEN}`,
            );
            const adminHeaders = {
              authorization: mapAdminBearerHeader(
                headers["x-drts-authorization"],
              ),
              ...(headers["x-drts-step-up-reference"]
                ? {
                    "x-drts-step-up-reference":
                      headers["x-drts-step-up-reference"],
                  }
                : {}),
            };
            if (method === "GET") {
              await guardRequest(
                FleetPartnerController as unknown as Record<string, unknown>,
                "listFleetPartners",
                {
                  method: "GET",
                  path: "/api/admin/fleet-partners",
                  url: "/api/admin/fleet-partners",
                  headers: adminHeaders,
                },
              );
              return jsonResponse(
                deepToSnakeCase(
                  await fleetPartnerController.listFleetPartners(),
                ),
              );
            }
            if (method === "POST") {
              await guardRequest(
                FleetPartnerController as unknown as Record<string, unknown>,
                "createFleetPartner",
                {
                  method: "POST",
                  path: "/api/admin/fleet-partners",
                  url: "/api/admin/fleet-partners",
                  headers: adminHeaders,
                  body,
                },
              );
              if (
                options.dropFleetCreateWithoutPersist &&
                !droppedFleetCreateOnce
              ) {
                droppedFleetCreateOnce = true;
                return jsonResponse(
                  { error: "gateway_timeout_before_write" },
                  { status: 504 },
                );
              }
              const created = await fleetPartnerController.createFleetPartner(
                body as CreateFleetPartnerCommand,
              );
              if (options.duplicateFleetOnLostResponse) {
                await fleetPartnerController.createFleetPartner(
                  body as CreateFleetPartnerCommand,
                );
              }
              if (
                options.dropFleetCreateResponseAfterPersist &&
                !droppedFleetCreateOnce
              ) {
                droppedFleetCreateOnce = true;
                return jsonResponse(
                  { error: "gateway_timeout_after_write" },
                  { status: 504 },
                );
              }
              const createdRecord =
                created && typeof created === "object" && "data" in created
                  ? (created as unknown as { data: Record<string, unknown> })
                      .data
                  : (created as unknown as Record<string, unknown>);
              return jsonResponse(
                deepToSnakeCase({
                  ...created,
                  data: {
                    ...createdRecord,
                    ...(options.overrideCreatedFleetId
                      ? { fleetPartnerId: options.overrideCreatedFleetId }
                      : {}),
                    ...(options.overrideCreatedFleetActive !== undefined
                      ? { active: options.overrideCreatedFleetActive }
                      : {}),
                  },
                }),
              );
            }
          }

          if (
            url.startsWith(
              `${ADMIN_ORIGIN}/control-plane-proxy/admin/fleet-partners/`,
            )
          ) {
            expect(headers.authorization).toBe(
              `Bearer ${SIM_PLATFORM_ADMIN_ID_TOKEN}`,
            );
            const fleetPartnerId = decodeURIComponent(
              url.slice(
                `${ADMIN_ORIGIN}/control-plane-proxy/admin/fleet-partners/`
                  .length,
              ),
            );
            const apiPath = `/api/admin/fleet-partners/${encodeURIComponent(fleetPartnerId)}`;
            const adminHeaders = {
              authorization: mapAdminBearerHeader(
                headers["x-drts-authorization"],
              ),
              ...(headers["x-drts-step-up-reference"]
                ? {
                    "x-drts-step-up-reference":
                      headers["x-drts-step-up-reference"],
                  }
                : {}),
            };
            if (method === "GET") {
              await guardRequest(
                FleetPartnerController as unknown as Record<string, unknown>,
                "getFleetPartner",
                {
                  method: "GET",
                  path: apiPath,
                  url: apiPath,
                  headers: adminHeaders,
                },
              );
              if (options.failCanonicalFleetVerifyStatus) {
                return jsonResponse(
                  { error: "canonical_fleet_readback_unavailable" },
                  { status: options.failCanonicalFleetVerifyStatus },
                );
              }
              const found =
                await fleetPartnerController.getFleetPartner(fleetPartnerId);
              return jsonResponse(deepToSnakeCase(found));
            }
            if (method === "PUT") {
              await guardRequest(
                FleetPartnerController as unknown as Record<string, unknown>,
                "updateFleetPartner",
                {
                  method: "PUT",
                  path: apiPath,
                  url: apiPath,
                  headers: adminHeaders,
                  body,
                },
              );
              if (
                options.failFleetDeactivateOnce &&
                !failedFleetDeactivateOnce
              ) {
                failedFleetDeactivateOnce = true;
                readyToFailAdminSessionVerifyOnTeardown = true;
                if (options.expireFirstAdminSessionBeforeTeardown) {
                  for (const sid of issuedAdminSessionIds) {
                    await identityRepository.revokeSession(
                      sid,
                      "expired_in_test",
                      "system",
                    );
                  }
                }
                return jsonResponse(
                  { error: "transient_fleet_deactivate_error" },
                  { status: 503 },
                );
              }
              const updated = await fleetPartnerController.updateFleetPartner(
                fleetPartnerId,
                body as UpdateFleetPartnerCommand,
              );
              return jsonResponse(deepToSnakeCase(updated));
            }
          }

          // 5. Platform Admin BFF Partner Entries & Credentials endpoints -> real BootstrapAuthGuard (with StepUpProofService) + TenantPartnerController
          if (
            url ===
            `${ADMIN_ORIGIN}/control-plane-proxy/platform-admin/partner-entries`
          ) {
            expect(headers.authorization).toBe(
              `Bearer ${SIM_PLATFORM_ADMIN_ID_TOKEN}`,
            );
            const adminHeaders = {
              authorization: mapAdminBearerHeader(
                headers["x-drts-authorization"],
              ),
              ...(headers["x-drts-step-up-reference"]
                ? {
                    "x-drts-step-up-reference":
                      headers["x-drts-step-up-reference"],
                  }
                : {}),
            };
            if (method === "GET") {
              await guardRequest(
                TenantPartnerController as unknown as Record<string, unknown>,
                "listPlatformPartnerEntries",
                {
                  method: "GET",
                  path: "/api/platform-admin/partner-entries",
                  url: "/api/platform-admin/partner-entries",
                  headers: adminHeaders,
                },
              );
              if (options.partnerEntriesOverride) {
                return jsonResponse(
                  deepToSnakeCase({
                    data: { items: options.partnerEntriesOverride },
                  }),
                );
              }
              return jsonResponse(
                deepToSnakeCase(
                  tenantPartnerController.listPlatformPartnerEntries(),
                ),
              );
            }
            if (method === "POST") {
              await guardRequest(
                TenantPartnerController as unknown as Record<string, unknown>,
                "createPlatformPartnerEntry",
                {
                  method: "POST",
                  path: "/api/platform-admin/partner-entries",
                  url: "/api/platform-admin/partner-entries",
                  headers: adminHeaders,
                  body,
                },
                options.crossInstanceStepUpMismatch ? guardInstanceB : guard,
              );
              if (options.failEntryCreateStatus) {
                return jsonResponse(
                  { error: { code: "FLEET_PARTNER_REFERENCE_UNAVAILABLE" } },
                  { status: options.failEntryCreateStatus },
                );
              }
              if (
                options.dropEntryCreateWithoutPersist &&
                !droppedEntryCreateOnce
              ) {
                droppedEntryCreateOnce = true;
                if (options.injectUnrelatedEntryCollisionOnLostResponse) {
                  const collisionCmd: CreatePartnerChannelEntryCommand = {
                    ...(body as CreatePartnerChannelEntryCommand),
                    partnerType: "referral_channel",
                    partnerCode: "UNRELATED_COLLISION_CODE",
                  };
                  delete collisionCmd.fleetPartnerId;
                  await tenantPartnerService.createPlatformPartnerEntry(
                    collisionCmd,
                  );
                }
                return jsonResponse(
                  { error: "gateway_timeout_before_entry_write" },
                  { status: 504 },
                );
              }
              const createdEntry =
                await tenantPartnerController.createPlatformPartnerEntry(
                  body as CreatePartnerChannelEntryCommand,
                );
              if (
                options.dropEntryCreateResponseAfterPersist &&
                !droppedEntryCreateOnce
              ) {
                droppedEntryCreateOnce = true;
                return jsonResponse(
                  { error: "gateway_timeout_after_entry_write" },
                  { status: 504 },
                );
              }
              return jsonResponse(deepToSnakeCase(createdEntry));
            }
          }

          const entryDeactivateMatch = url.match(
            new RegExp(
              `^${ADMIN_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/control-plane-proxy/platform-admin/partner-entries/([^/]+)/deactivate$`,
            ),
          );
          if (method === "POST" && entryDeactivateMatch) {
            expect(headers.authorization).toBe(
              `Bearer ${SIM_PLATFORM_ADMIN_ID_TOKEN}`,
            );
            const entrySlug = decodeURIComponent(entryDeactivateMatch[1]!);
            const apiPath = `/api/platform-admin/partner-entries/${encodeURIComponent(entrySlug)}/deactivate`;
            await guardRequest(
              TenantPartnerController as unknown as Record<string, unknown>,
              "deactivatePlatformPartnerEntry",
              {
                method: "POST",
                path: apiPath,
                url: apiPath,
                headers: {
                  authorization: mapAdminBearerHeader(
                    headers["x-drts-authorization"],
                  ),
                  ...(headers["x-drts-step-up-reference"]
                    ? {
                        "x-drts-step-up-reference":
                          headers["x-drts-step-up-reference"],
                      }
                    : {}),
                },
                body,
              },
              options.crossInstanceStepUpMismatch ? guardInstanceB : guard,
            );
            const deactivatedEntry =
              await tenantPartnerController.deactivatePlatformPartnerEntry(
                entrySlug,
              );
            return jsonResponse(deepToSnakeCase(deactivatedEntry));
          }

          const entryRevokeMatch = url.match(
            new RegExp(
              `^${ADMIN_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/control-plane-proxy/platform-admin/partner-entries/([^/]+)/revoke$`,
            ),
          );
          if (method === "POST" && entryRevokeMatch) {
            expect(headers.authorization).toBe(
              `Bearer ${SIM_PLATFORM_ADMIN_ID_TOKEN}`,
            );
            const entrySlug = decodeURIComponent(entryRevokeMatch[1]!);
            const apiPath = `/api/platform-admin/partner-entries/${encodeURIComponent(entrySlug)}/revoke`;
            await guardRequest(
              TenantPartnerController as unknown as Record<string, unknown>,
              "revokePlatformPartnerEntry",
              {
                method: "POST",
                path: apiPath,
                url: apiPath,
                headers: {
                  authorization: mapAdminBearerHeader(
                    headers["x-drts-authorization"],
                  ),
                  ...(headers["x-drts-step-up-reference"]
                    ? {
                        "x-drts-step-up-reference":
                          headers["x-drts-step-up-reference"],
                      }
                    : {}),
                },
                body,
              },
              options.crossInstanceStepUpMismatch ? guardInstanceB : guard,
            );
            const revokedEntry =
              await tenantPartnerController.revokePlatformPartnerEntry(
                entrySlug,
              );
            return jsonResponse(deepToSnakeCase(revokedEntry));
          }

          const credentialsListMatch = url.match(
            new RegExp(
              `^${ADMIN_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/control-plane-proxy/platform-admin/partner-entries/([^/]+)/credentials$`,
            ),
          );
          if (method === "GET" && credentialsListMatch) {
            expect(headers.authorization).toBe(
              `Bearer ${SIM_PLATFORM_ADMIN_ID_TOKEN}`,
            );
            const entrySlug = decodeURIComponent(credentialsListMatch[1]!);
            const apiPath = `/api/platform-admin/partner-entries/${encodeURIComponent(entrySlug)}/credentials`;
            await guardRequest(
              TenantPartnerController as unknown as Record<string, unknown>,
              "listPlatformPartnerIngressCredentials",
              {
                method: "GET",
                path: apiPath,
                url: apiPath,
                headers: {
                  authorization: mapAdminBearerHeader(
                    headers["x-drts-authorization"],
                  ),
                },
              },
            );
            return jsonResponse(
              deepToSnakeCase(
                tenantPartnerController.listPlatformPartnerIngressCredentials(
                  entrySlug,
                ),
              ),
            );
          }

          const credentialsIssueMatch = url.match(
            new RegExp(
              `^${ADMIN_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/control-plane-proxy/platform-admin/partner-entries/([^/]+)/credentials/issue$`,
            ),
          );
          if (method === "POST" && credentialsIssueMatch) {
            expect(headers.authorization).toBe(
              `Bearer ${SIM_PLATFORM_ADMIN_ID_TOKEN}`,
            );
            const entrySlug = decodeURIComponent(credentialsIssueMatch[1]!);
            const apiPath = `/api/platform-admin/partner-entries/${encodeURIComponent(entrySlug)}/credentials/issue`;
            await guardRequest(
              TenantPartnerController as unknown as Record<string, unknown>,
              "issuePlatformPartnerIngressCredential",
              {
                method: "POST",
                path: apiPath,
                url: apiPath,
                headers: {
                  authorization: mapAdminBearerHeader(
                    headers["x-drts-authorization"],
                  ),
                  ...(headers["x-drts-step-up-reference"]
                    ? {
                        "x-drts-step-up-reference":
                          headers["x-drts-step-up-reference"],
                      }
                    : {}),
                },
                body,
              },
              options.crossInstanceStepUpMismatch ? guardInstanceB : guard,
            );
            if (options.failKeyIssueStatus) {
              return jsonResponse(
                { error: { code: "CREDENTIAL_ISSUE_FAILED" } },
                { status: options.failKeyIssueStatus },
              );
            }
            if (options.dropKeyIssueWithoutPersist && !droppedKeyIssueOnce) {
              droppedKeyIssueOnce = true;
              return jsonResponse(
                { error: "gateway_timeout_before_key_issue" },
                { status: 504 },
              );
            }
            const issued =
              await tenantPartnerController.issuePlatformPartnerIngressCredential(
                entrySlug,
                body as IssuePartnerIngressCredentialCommand,
              );
            if (
              options.dropKeyIssueResponseAfterPersist &&
              !droppedKeyIssueOnce
            ) {
              droppedKeyIssueOnce = true;
              return jsonResponse(
                { error: "gateway_timeout_after_key_issue" },
                { status: 504 },
              );
            }
            return jsonResponse(deepToSnakeCase(issued));
          }

          const credentialsRevokeMatch = url.match(
            new RegExp(
              `^${ADMIN_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/control-plane-proxy/platform-admin/partner-entries/([^/]+)/credentials/([^/]+)/revoke$`,
            ),
          );
          if (method === "POST" && credentialsRevokeMatch) {
            expect(headers.authorization).toBe(
              `Bearer ${SIM_PLATFORM_ADMIN_ID_TOKEN}`,
            );
            const entrySlug = decodeURIComponent(credentialsRevokeMatch[1]!);
            const keyId = decodeURIComponent(credentialsRevokeMatch[2]!);
            const apiPath = `/api/platform-admin/partner-entries/${encodeURIComponent(entrySlug)}/credentials/${encodeURIComponent(keyId)}/revoke`;
            await guardRequest(
              TenantPartnerController as unknown as Record<string, unknown>,
              "revokePlatformPartnerIngressCredential",
              {
                method: "POST",
                path: apiPath,
                url: apiPath,
                headers: {
                  authorization: mapAdminBearerHeader(
                    headers["x-drts-authorization"],
                  ),
                  ...(headers["x-drts-step-up-reference"]
                    ? {
                        "x-drts-step-up-reference":
                          headers["x-drts-step-up-reference"],
                      }
                    : {}),
                },
                body,
              },
              options.crossInstanceStepUpMismatch ? guardInstanceB : guard,
            );
            const revoked =
              await tenantPartnerController.revokePlatformPartnerIngressCredential(
                entrySlug,
                keyId,
                body as RevokePartnerIngressCredentialCommand,
              );
            return jsonResponse(deepToSnakeCase(revoked));
          }

          // 6. Direct API endpoints (system token, driver invite/register, partner bootstrap, sessions, identity inventory)
          if (method === "POST" && url === `${API_ORIGIN}/api/auth/token`) {
            expect(headers["x-drts-google-id-token"]).toBe(
              SIM_PROVISIONING_GOOGLE_ID_TOKEN,
            );
            return jsonResponse({
              token: SIM_SYSTEM_SESSION_TOKEN,
              expiresIn: "15m",
            });
          }

          if (
            method === "GET" &&
            url === `${API_ORIGIN}/api/regulatory-registry/drivers`
          ) {
            if (headers.authorization !== `Bearer ${SIM_OPS_SESSION_TOKEN}`) {
              return jsonResponse(
                { error: { code: "FORBIDDEN" } },
                { status: 403 },
              );
            }
            return jsonResponse({
              data: {
                items: [
                  {
                    driverId: SEEDED_MAP_DRIVER_ID,
                    workState: "offline",
                    dispatchEligible: false,
                    availabilityStatus: "OFFLINE",
                    licensePhotoStorageKey:
                      "operational-documents/driver_license_front/doc-1.png",
                  },
                ],
              },
            });
          }

          if (
            method === "POST" &&
            url === `${API_ORIGIN}/api/auth/driver/device/invite`
          ) {
            expect(headers.authorization).toBe(
              `Bearer ${SIM_SYSTEM_SESSION_TOKEN}`,
            );
            return jsonResponse({
              data: {
                registrationCode: SIM_DRIVER_INVITE_CODE,
                driverId: SEEDED_MAP_DRIVER_ID,
              },
            });
          }

          if (
            method === "POST" &&
            url === `${API_ORIGIN}/api/auth/driver/device/register`
          ) {
            const payload = body as {
              registrationCode?: string;
              deviceId?: string;
            };
            expect(payload.registrationCode).toBe(SIM_DRIVER_INVITE_CODE);
            return jsonResponse({
              data: {
                accessToken: SIM_DRIVER_SESSION_TOKEN,
                refreshToken: "sim-driver-refresh-token",
                expiresIn: "15m",
                driverId: SEEDED_MAP_DRIVER_ID,
                deviceId: payload.deviceId,
              },
            });
          }

          if (
            method === "POST" &&
            url === `${API_ORIGIN}/api/auth/driver/device/invite/revoke`
          ) {
            expect(headers.authorization).toBe(
              `Bearer ${SIM_SYSTEM_SESSION_TOKEN}`,
            );
            driverInviteRevoked = true;
            return jsonResponse({ data: { revoked: true } });
          }

          if (
            method === "POST" &&
            url === `${API_ORIGIN}/api/auth/partner/bootstrap-session`
          ) {
            await guardRequest(
              AuthController as unknown as Record<string, unknown>,
              "issuePartnerBootstrapSession",
              {
                method: "POST",
                path: "/api/auth/partner/bootstrap-session",
                url: "/api/auth/partner/bootstrap-session",
                headers,
                body,
              },
            );
            if (options.dropBootstrapWithoutPersist && !droppedBootstrapOnce) {
              droppedBootstrapOnce = true;
              return jsonResponse(
                { error: "gateway_timeout_before_bootstrap" },
                { status: 504 },
              );
            }
            const envelope = await authController.issuePartnerBootstrapSession(
              body as CreatePartnerBootstrapSessionCommand,
            );
            if (
              options.dropBootstrapResponseAfterPersist &&
              !droppedBootstrapOnce
            ) {
              droppedBootstrapOnce = true;
              return jsonResponse(
                { error: "gateway_timeout_after_bootstrap" },
                { status: 504 },
              );
            }
            return jsonResponse(deepToSnakeCase(envelope));
          }

          if (method === "GET" && url === `${API_ORIGIN}/api/auth/session`) {
            const auth = headers.authorization ?? "";
            if (auth === `Bearer ${SIM_OPS_SESSION_TOKEN}`) {
              return jsonResponse({
                data: {
                  active: !opsSessionRevoked,
                  identity: {
                    realm: "ops",
                    actorType: "ops_user",
                    actorId: SIM_OPS_PRINCIPAL_ID,
                    principalId: SIM_OPS_PRINCIPAL_ID,
                    sessionId: SIM_OPS_SESSION_ID,
                    authMode: "jwt_bearer",
                    roles: ["ops_user", "operator"],
                    scopes: [
                      "orders:read",
                      "dispatch:read",
                      "fleet:read",
                      "regulatory:read",
                    ],
                  },
                },
              });
            }
            if (auth === `Bearer ${SIM_SYSTEM_SESSION_TOKEN}`) {
              return jsonResponse({
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
              });
            }
            if (auth === `Bearer ${SIM_DRIVER_SESSION_TOKEN}`) {
              return jsonResponse({
                data: {
                  active: true,
                  identity: {
                    realm: "driver",
                    actorType: "driver_user",
                    actorId: SEEDED_MAP_DRIVER_ID,
                    scopes: [...MAP_DRIVER_SCOPES],
                  },
                },
              });
            }
            const req = await guardRequest(
              AuthController as unknown as Record<string, unknown>,
              "getAuthSession",
              {
                method: "GET",
                path: "/api/auth/session",
                url: "/api/auth/session",
                headers: {
                  authorization: mapAdminBearerHeader(headers.authorization),
                },
              },
            );
            return jsonResponse(
              deepToSnakeCase(
                await authController.getAuthSession(req.identity),
              ),
            );
          }

          if (
            method === "POST" &&
            url === `${API_ORIGIN}/api/auth/sessions/revoke`
          ) {
            const payload = body as { sessionId?: string };
            const sessionId = String(payload.sessionId ?? "");
            const rawBearer = (headers.authorization ?? "")
              .replace(/^Bearer\s+/i, "")
              .trim();
            if (sessionId === SIM_OPS_SESSION_ID) {
              expect(rawBearer).toBe(SIM_OPS_SESSION_TOKEN);
              opsSessionRevoked = true;
              return jsonResponse({
                data: { revoked: true, sessionId },
              });
            }
            const req = await guardRequest(
              AuthController as unknown as Record<string, unknown>,
              "revokeSessionSelf",
              {
                method: "POST",
                path: "/api/auth/sessions/revoke",
                url: "/api/auth/sessions/revoke",
                headers: {
                  authorization: mapAdminBearerHeader(headers.authorization),
                },
                body,
              },
            );
            const result = await authController.revokeSessionSelf(
              req.identity,
              (body ?? {}) as { sessionId?: string; reason?: string },
            );
            return jsonResponse(deepToSnakeCase(result));
          }

          if (
            method === "GET" &&
            parsedUrl.origin === API_ORIGIN &&
            parsedUrl.pathname === "/api/identity/sessions"
          ) {
            const req = await guardRequest(
              IdentityController as unknown as Record<string, unknown>,
              "listAdminSessions",
              {
                method: "GET",
                path: "/api/identity/sessions",
                url: `${parsedUrl.pathname}${parsedUrl.search}`,
                headers: {
                  authorization: mapAdminBearerHeader(headers.authorization),
                },
              },
            );
            const principalIdParam = parsedUrl.searchParams.get("principalId");
            const realmParam = parsedUrl.searchParams.get("realm") as
              | "partner"
              | null;
            const tenantIdParam = parsedUrl.searchParams.get("tenantId");
            const result = await identityController.listAdminSessions(
              req.identity,
              {
                ...(principalIdParam !== null
                  ? { principalId: principalIdParam }
                  : {}),
                ...(realmParam !== null ? { realm: realmParam } : {}),
                ...(tenantIdParam !== null ? { tenantId: tenantIdParam } : {}),
              },
            );
            return jsonResponse(deepToSnakeCase(result));
          }

          const identitySessionRevokeMatch = parsedUrl.pathname.match(
            /^\/api\/identity\/sessions\/([^/]+)\/revoke$/,
          );
          if (
            method === "POST" &&
            parsedUrl.origin === API_ORIGIN &&
            identitySessionRevokeMatch
          ) {
            const sid = decodeURIComponent(identitySessionRevokeMatch[1]!);
            const req = await guardRequest(
              IdentityController as unknown as Record<string, unknown>,
              "revokeAdminSession",
              {
                method: "POST",
                path: parsedUrl.pathname,
                url: parsedUrl.pathname,
                headers: {
                  authorization: mapAdminBearerHeader(headers.authorization),
                  ...(headers["x-csrf-token"]
                    ? { "x-csrf-token": headers["x-csrf-token"] }
                    : {}),
                },
                body,
              },
            );
            const result = await identityController.revokeAdminSession(
              req.identity,
              sid,
              (body ?? {}) as { reason?: string },
              req as never,
            );
            return jsonResponse(deepToSnakeCase(result));
          }

          throw new Error(`Unexpected harness HTTP call: ${method} ${url}`);
        } catch (err) {
          if (err instanceof HttpException) {
            const status = err.getStatus();
            const raw = err.getResponse();
            const errBody =
              raw && typeof raw === "object"
                ? deepToSnakeCase(raw)
                : { error: { code: "HTTP_ERROR", message: String(raw) } };
            return jsonResponse(errBody, { status });
          }
          throw err;
        }
      }) as unknown as typeof fetch;

      return {
        fetchImpl,
        calls,
        fleetPartnerService,
        tenantPartnerService,
        identityRepository,
        stepUpProofService,
        issuedAdminSessionIds,
        getOpsSessionRevoked: () => opsSessionRevoked,
        getDriverInviteRevoked: () => driverInviteRevoked,
      };
    }

    it("creates caller-owned canonical foreign Fleet, partner entry, API key, and durable partner session via real services when no external fixture is provided, satisfies C125 consumers, and tears down in reverse order while preserving pre-existing data", async () => {
      const env = createNoProvidedForeignFleetEnv();
      const exported: Record<string, string> = {};
      const masked: string[] = [];
      const savedEvidence: Record<string, OperationalRoleSessionsEvidence> = {};
      const harness = createOwnedForeignFleetRealServiceHarness();

      const preExistingFleetIds = (
        await harness.fleetPartnerService.listFleetPartners()
      ).map((f) => f.fleetPartnerId);
      const preExistingEntrySlugs = harness.tenantPartnerService
        .listPlatformPartnerEntries()
        .map((e) => e.entrySlug);
      expect(preExistingFleetIds).toContain(OPERATIONAL_OWN_FLEET_PARTNER_ID);
      expect(preExistingEntrySlugs).toContain("yuhe-residence");

      const evidence = await prepareOperationalRoleSessions(env, {
        fetch: harness.fetchImpl,
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
        "satisfied-by-owned-canonical-fleet",
      );

      const foreignSummary = evidence.sessions.find(
        (s) => s.role === "foreign_fleet",
      );
      expect(foreignSummary).toBeDefined();
      expect(foreignSummary?.source).toBe(
        "owned-canonical-fleet-bootstrap-exchange",
      );
      expect(foreignSummary?.realm).toBe("partner");
      expect(foreignSummary?.actor_type).toBe("partner_api_key");

      const createdFleetId =
        exported.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_PARTNER_ID!;
      const createdEntrySlug =
        exported.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_ENTRY_SLUG!;
      const createdKeyId =
        exported.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_KEY_ID!;
      const createdSessionId =
        exported.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_SESSION_ID!;
      expect(createdFleetId).toMatch(/^fleet-[0-9a-f-]{36}$/);
      expect(createdFleetId).not.toBe(OPERATIONAL_OWN_FLEET_PARTNER_ID);
      expect(foreignSummary?.partner_id).toBe(createdFleetId);
      expect(foreignSummary?.actor_id).toBe(createdKeyId);
      expect(createdEntrySlug).toMatch(/^c125-owned-foreign-fleet-/);
      expect(createdSessionId).toBeTruthy();

      // Plaintext key must be masked in memory and never written to evidence or exported env
      const serializedEvidence = JSON.stringify(savedEvidence);
      const serializedExports = JSON.stringify(exported);
      expect(serializedEvidence).not.toContain("pk_");
      expect(serializedExports).not.toContain("pk_");
      expect(masked.some((m) => m.startsWith("pk_"))).toBe(true);
      expect(masked).toContain(createdKeyId);

      // Admin session must only be minted ONCE and retained alive until teardown
      const adminTokenCalls = harness.calls.filter(
        (c) =>
          c.method === "POST" &&
          c.url === `${ADMIN_ORIGIN}/control-plane-proxy/auth/token`,
      );
      expect(adminTokenCalls).toHaveLength(1);
      expect(exported.DRTS_OPERATIONAL_PLATFORM_ADMIN_CLEANUP_STATUS).toBe(
        "pending",
      );

      // Exercise unchanged C125 consumers against the real issued foreign Fleet session
      for (const [k, v] of Object.entries(env)) {
        if (v !== undefined) {
          vi.stubEnv(k, v);
        }
      }
      vi.stubGlobal("fetch", harness.fetchImpl);

      for (const role of [
        "ops_non_reviewer",
        "system",
        "driver",
        "foreign_fleet",
      ] as const) {
        const verified = await verifyOperationalRoleSession(
          role,
          "DRTS_OPERATIONAL_API_URL",
          OPERATIONAL_OWN_FLEET_PARTNER_ID,
        );
        expect(verified).toBeDefined();
      }

      const foreignDeniedProbe: RoleAccessProbeSetup = {
        kind: "role-access-probe",
        baseUrlEnv: "DRTS_OPERATIONAL_API_URL",
        role: "foreign_fleet",
        method: "GET",
        path: "/api/regulatory-registry/drivers",
        expectedStatus: [401, 403],
        expectedErrorCode: "FORBIDDEN",
      };
      const foreignProbeResult =
        await probeOperationalDocumentRoleAccess(foreignDeniedProbe);
      expect(foreignProbeResult.status).toBe(403);

      // Now run teardown and verify reverse-order cleanup and preservation of pre-existing records
      const callCountBeforeTeardown = harness.calls.length;
      let savedCleanup: OperationalRoleSessionsCleanupEvidence | undefined;
      const teardownResult = await teardownOperationalRoleSessions(env, {
        fetch: harness.fetchImpl,
        mask: (secret) => masked.push(secret),
        exportSession: (name, value) => {
          exported[name] = value;
          env[name] = value;
        },
        save: (data) => {
          savedCleanup = data;
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
        foreign_fleet_key_revoked: true,
        foreign_fleet_entry_revoked: true,
        foreign_fleet_master_deactivated: true,
        admin_session_revoked: true,
      });
      expect(savedCleanup?.status).toBe("passed");

      const teardownCalls = harness.calls.slice(callCountBeforeTeardown);
      const teardownOrder = teardownCalls.map((c) => {
        if (c.url.endsWith("/api/auth/driver/device/invite/revoke")) {
          return "driver_invite_revoke";
        }
        if (c.url.endsWith("/api/auth/sessions/revoke")) {
          const sid = (c.body as { sessionId?: string })?.sessionId;
          if (sid === createdSessionId) return "foreign_session_revoke";
          if (sid === SIM_OPS_SESSION_ID) return "ops_session_revoke";
          return "admin_session_revoke";
        }
        if (c.url.endsWith("/control-plane-proxy/identity/step-up-proofs")) {
          return `step_up:${String((c.body as { actionId?: string })?.actionId ?? "")}`;
        }
        if (c.url.includes("/credentials/") && c.url.endsWith("/revoke")) {
          expect(c.headers["x-drts-step-up-reference"]).toMatch(/^stepup_/);
          return "foreign_key_revoke";
        }
        if (
          c.url.includes("/partner-entries/") &&
          c.url.endsWith("/deactivate")
        ) {
          expect(c.headers["x-drts-step-up-reference"]).toMatch(/^stepup_/);
          return "foreign_entry_deactivate";
        }
        if (c.url.includes("/partner-entries/") && c.url.endsWith("/revoke")) {
          expect(c.headers["x-drts-step-up-reference"]).toMatch(/^stepup_/);
          return "foreign_entry_revoke";
        }
        if (
          c.method === "PUT" &&
          c.url.includes(`/admin/fleet-partners/${createdFleetId}`)
        ) {
          return "foreign_fleet_deactivate";
        }
        return `${c.method}:${c.url}`;
      });
      expect(
        teardownOrder.filter(
          (step) => !step.startsWith("GET:") && !step.startsWith("step_up:"),
        ),
      ).toEqual([
        "driver_invite_revoke",
        "foreign_session_revoke",
        "foreign_key_revoke",
        "foreign_entry_deactivate",
        "foreign_entry_revoke",
        "foreign_fleet_deactivate",
        "ops_session_revoke",
        "admin_session_revoke",
      ]);

      // All 5 existing Platform Admin step-up proof actions must be issued and masked across prepare + teardown
      const stepUpActions = harness.calls
        .filter(
          (c) =>
            c.method === "POST" &&
            c.url ===
              `${ADMIN_ORIGIN}/control-plane-proxy/identity/step-up-proofs`,
        )
        .map((c) => (c.body as { actionId?: string })?.actionId);
      expect(stepUpActions).toEqual([
        "platform:partner-entries:create",
        "platform:partner-credentials:issue",
        "platform:partner-credentials:revoke",
        "platform:partner-entries:deactivate",
        "platform:partner-entries:revoke",
      ]);
      expect(
        masked.filter((m) => m.startsWith("stepup_")).length,
      ).toBeGreaterThanOrEqual(5);

      // Owned Fleet is now inactive, owned entry and key are revoked, while pre-existing Fleet and entries remain active
      expect(
        (await harness.fleetPartnerService.getFleetPartner(createdFleetId))
          .active,
      ).toBe(false);
      expect(
        (
          await harness.fleetPartnerService.getFleetPartner(
            OPERATIONAL_OWN_FLEET_PARTNER_ID,
          )
        ).active,
      ).toBe(true);
      const revokedEntry = harness.tenantPartnerService
        .listPlatformPartnerEntries()
        .find((e) => e.entrySlug === createdEntrySlug);
      expect(revokedEntry?.status).toBe("revoked");
      expect(revokedEntry?.activeFlag).toBe(false);
      const preExistingEntry = harness.tenantPartnerService
        .listPlatformPartnerEntries()
        .find((e) => e.entrySlug === "yuhe-residence");
      expect(preExistingEntry?.status).toBe("active");
      expect(preExistingEntry?.activeFlag).toBe(true);
    });

    it("preserves provided-first precedence and never creates, mutates, or revokes borrowed external Fleet/entry/key/Admin fixtures", async () => {
      const harness = createOwnedForeignFleetRealServiceHarness();
      // Seed an external foreign Fleet + entry + key in the real services
      const externalFleet =
        await harness.fleetPartnerService.createFleetPartner({
          legalName: "External Provided Foreign Fleet",
          displayName: "External Foreign Fleet",
          businessRegistrationNo: "EXT-FF-002",
          contactName: "External Contact",
          contactPhone: "+886-2-5550-0002",
          partnershipType: "fleet_management",
          active: true,
        });
      await harness.tenantPartnerService.createPlatformPartnerEntry({
        tenantId: "tenant-demo-001",
        fleetPartnerId: externalFleet.fleetPartnerId,
        partnerCode: "EXT_FF_002",
        partnerType: "fleet_partner",
        programId: "program-referral-community",
        entrySlug: "external-foreign-fleet-002",
        displayName: "External Foreign Fleet Entry",
        businessDispatchSubtype: "enterprise_dispatch",
        authMode: "partner_api_key",
        eligibilityMode: "none",
        status: "active",
        activeFlag: true,
      });
      const externalIssuedKey =
        await harness.tenantPartnerService.issuePlatformPartnerIngressCredential(
          "external-foreign-fleet-002",
          {
            ownerRef: "external-owner",
            ownerName: "External Owner",
            ownerType: "service",
            purpose: "external_provided_fixture",
          },
        );
      harness.calls.length = 0;

      const env = createNoProvidedForeignFleetEnv({
        DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_SLUG: "external-foreign-fleet-002",
        DRTS_OPERATIONAL_FOREIGN_FLEET_API_KEY: externalIssuedKey.plaintextKey,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_TOKEN:
          SIM_PLATFORM_REVIEWER_SESSION_TOKEN,
      });
      const exported: Record<string, string> = {};
      const evidence = await prepareOperationalRoleSessions(env, {
        fetch: harness.fetchImpl,
        mask: () => {},
        exportSession: (name, value) => {
          exported[name] = value;
          env[name] = value;
        },
        save: () => {},
      });

      expect(evidence.status).toBe("passed");
      expect(evidence.foreign_fleet_precondition).toBe(
        "satisfied-by-partner-bootstrap",
      );
      expect(
        harness.calls.some(
          (c) =>
            c.method === "POST" &&
            c.url.endsWith("/control-plane-proxy/admin/fleet-partners"),
        ),
      ).toBe(false);
      expect(
        harness.calls.some(
          (c) =>
            c.method === "POST" &&
            c.url.endsWith(
              "/control-plane-proxy/platform-admin/partner-entries",
            ),
        ),
      ).toBe(false);

      await teardownOperationalRoleSessions(env, {
        fetch: harness.fetchImpl,
        mask: () => {},
        exportSession: (name, value) => {
          exported[name] = value;
          env[name] = value;
        },
        save: () => {},
      });

      // External Fleet, entry, and key must remain active and untouched; provided Admin token is never revoked
      expect(
        (
          await harness.fleetPartnerService.getFleetPartner(
            externalFleet.fleetPartnerId,
          )
        ).active,
      ).toBe(true);
      const externalEntryAfter = harness.tenantPartnerService
        .listPlatformPartnerEntries()
        .find((e) => e.entrySlug === "external-foreign-fleet-002");
      expect(externalEntryAfter?.status).toBe("active");
      const externalCredsAfter =
        harness.tenantPartnerService.listPlatformPartnerIngressCredentials(
          "external-foreign-fleet-002",
        );
      expect(externalCredsAfter[0]?.status).toBe("active");
      expect(
        harness.calls.some(
          (c) =>
            c.url.endsWith("/api/auth/sessions/revoke") &&
            (c.body as { sessionId?: string })?.sessionId ===
              SIM_PLATFORM_ADMIN_SESSION_ID,
        ),
      ).toBe(false);
    });

    it("rejects tenant/program readback mismatches (manifest UUID 201 mixed with demo seed or conflicting tenantId bindings) and same-ownFleet returns without deactivating fleet-demo-001", async () => {
      // 1. Manifest UUID 10000000-0000-0000-0000-000000000201 mixed with demo seed program-referral-community
      const mixedHarness = createOwnedForeignFleetRealServiceHarness({
        partnerEntriesOverride: [
          {
            partnerId: OPERATIONAL_OWN_FLEET_PARTNER_ID,
            partnerCode: "MIXED_SEED",
            partnerType: "fleet_partner",
            tenantId: "10000000-0000-0000-0000-000000000201",
            programId: "program-referral-community",
            entrySlug: "mixed-entry",
            status: "active",
            activeFlag: true,
          },
        ],
      });
      let mixedSaved: OperationalRoleSessionsEvidence | undefined;
      await expect(
        prepareOperationalRoleSessions(createNoProvidedForeignFleetEnv(), {
          fetch: mixedHarness.fetchImpl,
          mask: () => {},
          exportSession: () => {},
          save: (_name, data) => {
            mixedSaved = data;
          },
        }),
      ).rejects.toThrow(OperationalForeignFleetFixturePreconditionError);
      expect(mixedSaved?.foreign_fleet_precondition).toBe(
        "invalid-external-fixture",
      );
      expect(mixedSaved?.cleanup).toBe("passed");

      // 2. Conflicting tenantId bindings for the same programId
      const conflictHarness = createOwnedForeignFleetRealServiceHarness({
        partnerEntriesOverride: [
          {
            partnerId: OPERATIONAL_OWN_FLEET_PARTNER_ID,
            partnerCode: "TENANT_A",
            partnerType: "fleet_partner",
            tenantId: "tenant-demo-001",
            programId: "program-referral-community",
            entrySlug: "entry-a",
            status: "active",
            activeFlag: true,
          },
          {
            partnerId: "partner-b",
            partnerCode: "TENANT_B",
            partnerType: "referral_channel",
            tenantId: "tenant-other-999",
            programId: "program-referral-community",
            entrySlug: "entry-b",
            status: "active",
            activeFlag: true,
          },
        ],
      });
      let conflictSaved: OperationalRoleSessionsEvidence | undefined;
      await expect(
        prepareOperationalRoleSessions(createNoProvidedForeignFleetEnv(), {
          fetch: conflictHarness.fetchImpl,
          mask: () => {},
          exportSession: () => {},
          save: (_name, data) => {
            conflictSaved = data;
          },
        }),
      ).rejects.toThrow(OperationalForeignFleetFixturePreconditionError);
      expect(conflictSaved?.foreign_fleet_precondition).toBe(
        "invalid-external-fixture",
      );

      // 3. Same-ownFleet returned by Fleet creation: must reject and NEVER deactivate fleet-demo-001
      const sameOwnFleetHarness = createOwnedForeignFleetRealServiceHarness({
        overrideCreatedFleetId: OPERATIONAL_OWN_FLEET_PARTNER_ID,
      });
      const sameOwnEnv = createNoProvidedForeignFleetEnv();
      let sameOwnSaved: OperationalRoleSessionsEvidence | undefined;
      await expect(
        prepareOperationalRoleSessions(sameOwnEnv, {
          fetch: sameOwnFleetHarness.fetchImpl,
          mask: () => {},
          exportSession: (name, value) => {
            sameOwnEnv[name] = value;
          },
          save: (_name, data) => {
            sameOwnSaved = data;
          },
        }),
      ).rejects.toThrow(OperationalForeignFleetFixturePreconditionError);
      expect(sameOwnSaved?.foreign_fleet_precondition).toBe(
        "invalid-external-fixture",
      );
      expect(
        sameOwnFleetHarness.calls.some(
          (c) =>
            c.method === "PUT" &&
            c.url.includes(
              `/admin/fleet-partners/${OPERATIONAL_OWN_FLEET_PARTNER_ID}`,
            ),
        ),
      ).toBe(false);
      expect(
        (
          await sameOwnFleetHarness.fleetPartnerService.getFleetPartner(
            OPERATIONAL_OWN_FLEET_PARTNER_ID,
          )
        ).active,
      ).toBe(true);
    });

    it("cleans up already-created owned Fleet and entry in reverse order when a partial creation failure occurs at entry create or key issue", async () => {
      // Partial failure at entry create (503) after Fleet was created
      const entryFailHarness = createOwnedForeignFleetRealServiceHarness({
        failEntryCreateStatus: 503,
      });
      const entryFailEnv = createNoProvidedForeignFleetEnv();
      let entryFailSaved: OperationalRoleSessionsEvidence | undefined;
      await expect(
        prepareOperationalRoleSessions(entryFailEnv, {
          fetch: entryFailHarness.fetchImpl,
          mask: () => {},
          exportSession: (name, value) => {
            entryFailEnv[name] = value;
          },
          save: (_name, data) => {
            entryFailSaved = data;
          },
        }),
      ).rejects.toThrow(OperationalRoleSessionBootstrapError);

      const createdFleetId1 =
        entryFailEnv.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_PARTNER_ID!;
      expect(createdFleetId1).toMatch(/^fleet-/);
      expect(
        (
          await entryFailHarness.fleetPartnerService.getFleetPartner(
            createdFleetId1,
          )
        ).active,
      ).toBe(false);
      expect(
        entryFailEnv.DRTS_OPERATIONAL_FOREIGN_FLEET_MASTER_CLEANUP_STATUS,
      ).toBe("passed");
      expect(
        entryFailEnv.DRTS_OPERATIONAL_FOREIGN_FLEET_MASTER_DEACTIVATED,
      ).toBe("true");
      expect(entryFailSaved?.cleanup).toBe("unconfirmed");

      // Partial failure at key issue (500) after Fleet and entry were created
      const keyFailHarness = createOwnedForeignFleetRealServiceHarness({
        failKeyIssueStatus: 500,
      });
      const keyFailEnv = createNoProvidedForeignFleetEnv();
      let keyFailSaved: OperationalRoleSessionsEvidence | undefined;
      await expect(
        prepareOperationalRoleSessions(keyFailEnv, {
          fetch: keyFailHarness.fetchImpl,
          mask: () => {},
          exportSession: (name, value) => {
            keyFailEnv[name] = value;
          },
          save: (_name, data) => {
            keyFailSaved = data;
          },
        }),
      ).rejects.toThrow(OperationalRoleSessionBootstrapError);

      const createdFleetId2 =
        keyFailEnv.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_PARTNER_ID!;
      const createdEntrySlug2 =
        keyFailEnv.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_ENTRY_SLUG!;
      expect(
        (
          await keyFailHarness.fleetPartnerService.getFleetPartner(
            createdFleetId2,
          )
        ).active,
      ).toBe(false);
      const entryAfterKeyFail = keyFailHarness.tenantPartnerService
        .listPlatformPartnerEntries()
        .find((e) => e.entrySlug === createdEntrySlug2);
      expect(entryAfterKeyFail?.status).toBe("revoked");
      expect(
        keyFailEnv.DRTS_OPERATIONAL_FOREIGN_FLEET_MASTER_CLEANUP_STATUS,
      ).toBe("passed");
      expect(
        keyFailEnv.DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_CLEANUP_STATUS,
      ).toBe("passed");
      expect(keyFailSaved?.cleanup).toBe("unconfirmed");

      // Failure after all owned foreign_fleet resources succeed (at canonical Fleet readback verification) -> full reverse-order cleanup with cleanup="passed"
      const postFleetFailHarness = createOwnedForeignFleetRealServiceHarness({
        failCanonicalFleetVerifyStatus: 503,
      });
      const postFleetFailEnv = createNoProvidedForeignFleetEnv();
      let postFleetFailSaved: OperationalRoleSessionsEvidence | undefined;
      await expect(
        prepareOperationalRoleSessions(postFleetFailEnv, {
          fetch: postFleetFailHarness.fetchImpl,
          mask: () => {},
          exportSession: (name, value) => {
            postFleetFailEnv[name] = value;
          },
          save: (_name, data) => {
            postFleetFailSaved = data;
          },
        }),
      ).rejects.toThrow(OperationalRoleSessionBootstrapError);
      expect(postFleetFailSaved?.cleanup).toBe("passed");
      expect(
        postFleetFailEnv.DRTS_OPERATIONAL_FOREIGN_FLEET_CLEANUP_STATUS,
      ).toBe("passed");
      expect(
        postFleetFailEnv.DRTS_OPERATIONAL_FOREIGN_FLEET_KEY_CLEANUP_STATUS,
      ).toBe("passed");
      expect(
        postFleetFailEnv.DRTS_OPERATIONAL_FOREIGN_FLEET_ENTRY_CLEANUP_STATUS,
      ).toBe("passed");
      expect(
        postFleetFailEnv.DRTS_OPERATIONAL_FOREIGN_FLEET_MASTER_CLEANUP_STATUS,
      ).toBe("passed");
    });

    it("recovers from lost Fleet/entry/key/bootstrap responses via readback without blind retry or key rotation, and records explicit unconfirmed cleanup when readback cannot confirm", async () => {
      // 1. Recoverable lost responses on Fleet create and Entry create -> full success without blind retry
      const recoverableHarness = createOwnedForeignFleetRealServiceHarness({
        dropFleetCreateResponseAfterPersist: true,
        dropEntryCreateResponseAfterPersist: true,
      });
      const recoverableEnv = createNoProvidedForeignFleetEnv();
      const evidence = await prepareOperationalRoleSessions(recoverableEnv, {
        fetch: recoverableHarness.fetchImpl,
        mask: () => {},
        exportSession: (name, value) => {
          recoverableEnv[name] = value;
        },
        save: () => {},
      });
      expect(evidence.status).toBe("passed");
      expect(evidence.foreign_fleet_precondition).toBe(
        "satisfied-by-owned-canonical-fleet",
      );
      // Verify POST /admin/fleet-partners and POST /platform-admin/partner-entries were each called only ONCE (no blind retry)
      expect(
        recoverableHarness.calls.filter(
          (c) =>
            c.method === "POST" &&
            c.url ===
              `${ADMIN_ORIGIN}/control-plane-proxy/admin/fleet-partners`,
        ),
      ).toHaveLength(1);
      expect(
        recoverableHarness.calls.filter(
          (c) =>
            c.method === "POST" &&
            c.url ===
              `${ADMIN_ORIGIN}/control-plane-proxy/platform-admin/partner-entries`,
        ),
      ).toHaveLength(1);

      const teardownRes = await teardownOperationalRoleSessions(
        recoverableEnv,
        {
          fetch: recoverableHarness.fetchImpl,
          mask: () => {},
          exportSession: (name, value) => {
            recoverableEnv[name] = value;
          },
          save: () => {},
        },
      );
      expect(teardownRes.status).toBe("passed");

      // 2. Lost key issue response after persist: never retries credentials/issue (no rotation), recovers keyId via GET .../credentials, revokes key/entry/Fleet, and fails prepare
      const lostKeyHarness = createOwnedForeignFleetRealServiceHarness({
        dropKeyIssueResponseAfterPersist: true,
      });
      const lostKeyEnv = createNoProvidedForeignFleetEnv();
      let lostKeySaved: OperationalRoleSessionsEvidence | undefined;
      await expect(
        prepareOperationalRoleSessions(lostKeyEnv, {
          fetch: lostKeyHarness.fetchImpl,
          mask: () => {},
          exportSession: (name, value) => {
            lostKeyEnv[name] = value;
          },
          save: (_name, data) => {
            lostKeySaved = data;
          },
        }),
      ).rejects.toThrow(OperationalRoleSessionBootstrapError);
      expect(
        lostKeyHarness.calls.filter(
          (c) => c.method === "POST" && c.url.endsWith("/credentials/issue"),
        ),
      ).toHaveLength(1);
      expect(lostKeySaved?.cleanup).toBe("passed");
      const recoveredKeyId =
        lostKeyEnv.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_KEY_ID!;
      expect(recoveredKeyId).toBeTruthy();

      // 3. Lost bootstrap-session response after persist: recovers durable session via Admin GET /api/identity/sessions?principalId=<keyId>&realm=partner&tenantId=<tenantId> and revokes via POST /api/identity/sessions/:sid/revoke with CSRF
      const lostBootstrapHarness = createOwnedForeignFleetRealServiceHarness({
        dropBootstrapResponseAfterPersist: true,
      });
      const lostBootstrapEnv = createNoProvidedForeignFleetEnv();
      let lostBootstrapSaved: OperationalRoleSessionsEvidence | undefined;
      await expect(
        prepareOperationalRoleSessions(lostBootstrapEnv, {
          fetch: lostBootstrapHarness.fetchImpl,
          mask: () => {},
          exportSession: (name, value) => {
            lostBootstrapEnv[name] = value;
          },
          save: (_name, data) => {
            lostBootstrapSaved = data;
          },
        }),
      ).rejects.toThrow(OperationalRoleSessionBootstrapError);
      expect(lostBootstrapSaved?.cleanup).toBe("passed");
      expect(
        lostBootstrapHarness.calls.some(
          (c) =>
            c.method === "GET" &&
            c.url.startsWith(`${API_ORIGIN}/api/identity/sessions?`),
        ),
      ).toBe(true);
      expect(
        lostBootstrapHarness.calls.some(
          (c) =>
            c.method === "POST" &&
            /^https:\/\/[^/]+\/api\/identity\/sessions\/[^/]+\/revoke$/.test(
              c.url,
            ) &&
            Boolean(c.headers["x-csrf-token"]),
        ),
      ).toBe(true);

      // 4. Unrecoverable lost bootstrap-session response (0 matching sessions in identity inventory): must record cleanup="unconfirmed" and fail teardown closed
      const unconfirmedBootstrapHarness =
        createOwnedForeignFleetRealServiceHarness({
          dropBootstrapWithoutPersist: true,
        });
      const unconfirmedBootstrapEnv = createNoProvidedForeignFleetEnv();
      let unconfirmedSaved: OperationalRoleSessionsEvidence | undefined;
      await expect(
        prepareOperationalRoleSessions(unconfirmedBootstrapEnv, {
          fetch: unconfirmedBootstrapHarness.fetchImpl,
          mask: () => {},
          exportSession: (name, value) => {
            unconfirmedBootstrapEnv[name] = value;
          },
          save: (_name, data) => {
            unconfirmedSaved = data;
          },
        }),
      ).rejects.toThrow(OperationalRoleSessionBootstrapError);
      expect(unconfirmedSaved?.cleanup).toBe("unconfirmed");
      expect(
        unconfirmedBootstrapEnv.DRTS_OPERATIONAL_ROLE_SESSIONS_CLEANUP_STATUS,
      ).toBe("unconfirmed");
      await expect(
        teardownOperationalRoleSessions(unconfirmedBootstrapEnv, {
          fetch: unconfirmedBootstrapHarness.fetchImpl,
          mask: () => {},
          exportSession: (name, value) => {
            unconfirmedBootstrapEnv[name] = value;
          },
          save: () => {},
        }),
      ).rejects.toThrow(/Operational role session cleanup failed/);

      // 5. Unrelated entry slug collision on lost entry response: never claims or revokes the colliding entry
      const collisionHarness = createOwnedForeignFleetRealServiceHarness({
        dropEntryCreateWithoutPersist: true,
        injectUnrelatedEntryCollisionOnLostResponse: true,
      });
      const collisionEnv = createNoProvidedForeignFleetEnv();
      await expect(
        prepareOperationalRoleSessions(collisionEnv, {
          fetch: collisionHarness.fetchImpl,
          mask: () => {},
          exportSession: (name, value) => {
            collisionEnv[name] = value;
          },
          save: () => {},
        }),
      ).rejects.toThrow(OperationalRoleSessionBootstrapError);
      const collidingSlug =
        collisionEnv.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_ENTRY_SLUG!;
      const collidingEntry = collisionHarness.tenantPartnerService
        .listPlatformPartnerEntries()
        .find((e) => e.entrySlug === collidingSlug);
      expect(collidingEntry?.status).toBe("active");
    });

    it("completes teardown across retries when Fleet deactivation fails transiently and re-mints Admin session if prior recovery token expired", async () => {
      const retryHarness = createOwnedForeignFleetRealServiceHarness({
        failFleetDeactivateOnce: true,
        expireFirstAdminSessionBeforeTeardown: true,
      });
      const env = createNoProvidedForeignFleetEnv();
      const evidence = await prepareOperationalRoleSessions(env, {
        fetch: retryHarness.fetchImpl,
        mask: () => {},
        exportSession: (name, value) => {
          env[name] = value;
        },
        save: () => {},
      });
      expect(evidence.status).toBe("passed");
      const createdFleetId =
        env.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_PARTNER_ID!;

      // First teardown attempt fails when PUT /admin/fleet-partners/:id returns 503
      let firstCleanupSaved: OperationalRoleSessionsCleanupEvidence | undefined;
      await expect(
        teardownOperationalRoleSessions(env, {
          fetch: retryHarness.fetchImpl,
          mask: () => {},
          exportSession: (name, value) => {
            env[name] = value;
          },
          save: (data) => {
            firstCleanupSaved = data;
          },
        }),
      ).rejects.toThrow(/Operational role session cleanup failed/);
      expect(firstCleanupSaved?.status).toBe("failed");
      expect(firstCleanupSaved?.foreign_fleet_session_revoked).toBe(true);
      expect(firstCleanupSaved?.foreign_fleet_key_revoked).toBe(true);
      expect(firstCleanupSaved?.foreign_fleet_entry_revoked).toBe(true);
      expect(firstCleanupSaved?.foreign_fleet_master_deactivated).toBe(false);

      // Second teardown retry re-issues Admin session (since first expired), finishes deactivating Fleet, and revokes new Admin session last
      let secondCleanupSaved:
        | OperationalRoleSessionsCleanupEvidence
        | undefined;
      const retryResult = await teardownOperationalRoleSessions(env, {
        fetch: retryHarness.fetchImpl,
        mask: () => {},
        exportSession: (name, value) => {
          env[name] = value;
        },
        save: (data) => {
          secondCleanupSaved = data;
        },
      });
      expect(retryResult.status).toBe("passed");
      expect(retryResult.foreign_fleet_master_deactivated).toBe(true);
      expect(retryResult.admin_session_revoked).toBe(true);
      expect(secondCleanupSaved?.status).toBe("passed");
      expect(
        (await retryHarness.fleetPartnerService.getFleetPartner(createdFleetId))
          .active,
      ).toBe(false);
    });

    it("preserves and revokes all issued owned Admin sessions when GET /control-plane-proxy/auth/session fails transiently or returns an unknown response while the initial owned Admin session remains active", async () => {
      // 1. Exact 4-call boundary probe: initial owned Admin session remains active when GET /control-plane-proxy/auth/session throws transient TypeError
      const oldId = "synthetic-original-owned-admin";
      const newId = "synthetic-replacement-owned-admin";
      const oldToken = "synthetic-original-token";
      const newToken = "synthetic-replacement-token";
      const fleetId = "synthetic-owned-foreign-fleet";
      const probeEnv: Record<string, string | undefined> = {
        DRTS_CANDIDATE_SHA: CANDIDATE_SHA,
        DRTS_OPERATIONAL_API_URL: API_ORIGIN,
        DRTS_OPERATIONAL_OPS_CONSOLE_URL: OPS_ORIGIN,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_URL: ADMIN_ORIGIN,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_ID_TOKEN: SIM_PLATFORM_ADMIN_ID_TOKEN,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_OWNED_SESSION_ID: oldId,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_RECOVERY_TOKEN: oldToken,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_ISSUED_ATTEMPTED: "true",
        DRTS_OPERATIONAL_PLATFORM_ADMIN_CLEANUP_STATUS: "pending",
        DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_PARTNER_ID: fleetId,
        DRTS_OPERATIONAL_FOREIGN_FLEET_MASTER_CLEANUP_STATUS: "pending",
      };
      const active = new Map<string, boolean>([[oldId, true]]);
      const probeCalls: Array<{
        method: string;
        path: string;
        sessionId?: string;
      }> = [];
      let probeSaved: OperationalRoleSessionsCleanupEvidence | undefined;
      const probeFetch = (async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const path = new URL(url).pathname;
        const h = new Headers(init?.headers);
        if (
          url === `${ADMIN_ORIGIN}/control-plane-proxy/auth/session` &&
          method === "GET"
        ) {
          probeCalls.push({ method, path });
          expect(h.get("x-drts-authorization")).toBe(`Bearer ${oldToken}`);
          expect(active.get(oldId)).toBe(true);
          throw new TypeError(
            "synthetic transient transport failure; original session remains active",
          );
        }
        if (
          url === `${ADMIN_ORIGIN}/control-plane-proxy/auth/token` &&
          method === "POST"
        ) {
          probeCalls.push({ method, path });
          active.set(newId, true);
          return jsonResponse({ data: { token: newToken, sessionId: newId } });
        }
        if (
          url ===
            `${ADMIN_ORIGIN}/control-plane-proxy/admin/fleet-partners/${fleetId}` &&
          method === "PUT"
        ) {
          probeCalls.push({ method, path });
          expect(h.get("x-drts-authorization")).toBe(`Bearer ${newToken}`);
          return jsonResponse({
            data: { fleetPartnerId: fleetId, active: false },
          });
        }
        if (
          url === `${API_ORIGIN}/api/auth/sessions/revoke` &&
          method === "POST"
        ) {
          const { sessionId } = JSON.parse(String(init?.body)) as {
            sessionId: string;
          };
          probeCalls.push({ method, path, sessionId });
          expect(h.get("authorization")).toBe(`Bearer ${newToken}`);
          expect(active.has(sessionId)).toBe(true);
          active.set(sessionId, false);
          return jsonResponse({ data: { sessionId, revoked: true } });
        }
        throw new Error(`Unexpected probe HTTP call: ${method} ${path}`);
      }) as typeof fetch;

      const probeResult = await teardownOperationalRoleSessions(probeEnv, {
        fetch: probeFetch,
        mask: () => {},
        exportSession: (name, value) => {
          probeEnv[name] = value;
        },
        save: (data) => {
          probeSaved = data;
        },
      });
      const revokedIds = probeCalls
        .filter((c) => c.path === "/api/auth/sessions/revoke")
        .map((c) => c.sessionId);
      expect(probeResult.status).toBe("passed");
      expect(probeResult.admin_session_revoked).toBe(true);
      expect(probeEnv.DRTS_OPERATIONAL_ROLE_SESSIONS_CLEANUP_STATUS).toBe(
        "passed",
      );
      expect(probeEnv.DRTS_OPERATIONAL_PLATFORM_ADMIN_OWNED_SESSION_ID).toBe(
        `${oldId},${newId}`,
      );
      expect(revokedIds).toEqual([oldId, newId]);
      expect(active.get(oldId)).toBe(false);
      expect(active.get(newId)).toBe(false);
      expect(probeSaved).toEqual(probeResult);

      // 2. Fail-closed guard when GET /control-plane-proxy/auth/session returns an unknown payload and revoking the original session fails once
      const failClosedEnv: Record<string, string | undefined> = {
        DRTS_CANDIDATE_SHA: CANDIDATE_SHA,
        DRTS_OPERATIONAL_API_URL: API_ORIGIN,
        DRTS_OPERATIONAL_OPS_CONSOLE_URL: OPS_ORIGIN,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_URL: ADMIN_ORIGIN,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_ID_TOKEN: SIM_PLATFORM_ADMIN_ID_TOKEN,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_OWNED_SESSION_ID: oldId,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_RECOVERY_TOKEN: oldToken,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_ISSUED_ATTEMPTED: "true",
        DRTS_OPERATIONAL_PLATFORM_ADMIN_CLEANUP_STATUS: "pending",
        DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_PARTNER_ID: fleetId,
        DRTS_OPERATIONAL_FOREIGN_FLEET_MASTER_CLEANUP_STATUS: "pending",
      };
      const failClosedActive = new Map<string, boolean>([[oldId, true]]);
      let failOldRevokeOnce = true;
      let failClosedSaved: OperationalRoleSessionsCleanupEvidence | undefined;
      const failClosedFetch = (async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (
          url === `${ADMIN_ORIGIN}/control-plane-proxy/auth/session` &&
          method === "GET"
        ) {
          return jsonResponse({ data: { status: "unknown" } });
        }
        if (
          url === `${ADMIN_ORIGIN}/control-plane-proxy/auth/token` &&
          method === "POST"
        ) {
          failClosedActive.set(newId, true);
          return jsonResponse({ data: { token: newToken, sessionId: newId } });
        }
        if (
          url ===
            `${ADMIN_ORIGIN}/control-plane-proxy/admin/fleet-partners/${fleetId}` &&
          method === "PUT"
        ) {
          return jsonResponse({
            data: { fleetPartnerId: fleetId, active: false },
          });
        }
        if (
          url === `${API_ORIGIN}/api/auth/sessions/revoke` &&
          method === "POST"
        ) {
          const { sessionId } = JSON.parse(String(init?.body)) as {
            sessionId: string;
          };
          if (sessionId === oldId && failOldRevokeOnce) {
            failOldRevokeOnce = false;
            return jsonResponse(
              { error: "transient_revoke_error" },
              { status: 503 },
            );
          }
          failClosedActive.set(sessionId, false);
          return jsonResponse({ data: { sessionId, revoked: true } });
        }
        throw new Error(
          `Unexpected failClosedFetch HTTP call: ${method} ${url}`,
        );
      }) as typeof fetch;

      await expect(
        teardownOperationalRoleSessions(failClosedEnv, {
          fetch: failClosedFetch,
          mask: () => {},
          exportSession: (name, value) => {
            failClosedEnv[name] = value;
          },
          save: (data) => {
            failClosedSaved = data;
          },
        }),
      ).rejects.toThrow(/Operational role session cleanup failed/);
      expect(failClosedSaved?.status).toBe("failed");
      expect(failClosedSaved?.admin_session_revoked).toBe(false);
      expect(failClosedEnv.DRTS_OPERATIONAL_ROLE_SESSIONS_CLEANUP_STATUS).toBe(
        "failed",
      );
      expect(failClosedEnv.DRTS_OPERATIONAL_PLATFORM_ADMIN_CLEANUP_STATUS).toBe(
        "pending",
      );
      expect(
        failClosedEnv.DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_REVOKED,
      ).toBe("false");
      expect(
        failClosedEnv.DRTS_OPERATIONAL_PLATFORM_ADMIN_OWNED_SESSION_ID,
      ).toBe(oldId);
      expect(failClosedActive.get(oldId)).toBe(true);
      expect(failClosedActive.get(newId)).toBe(false);

      const retriedFailClosed = await teardownOperationalRoleSessions(
        failClosedEnv,
        {
          fetch: failClosedFetch,
          mask: () => {},
          exportSession: (name, value) => {
            failClosedEnv[name] = value;
          },
          save: (data) => {
            failClosedSaved = data;
          },
        },
      );
      expect(retriedFailClosed.status).toBe("passed");
      expect(retriedFailClosed.admin_session_revoked).toBe(true);
      expect(failClosedActive.get(oldId)).toBe(false);

      // 3. Real-service harness: initial owned Admin session stays active across transient GET /control-plane-proxy/auth/session failure, replacement Admin session is minted, and both Admin sessions are revoked in IdentityRepository
      const transientAdminHarness = createOwnedForeignFleetRealServiceHarness({
        failFleetDeactivateOnce: true,
        failAdminSessionVerifyWithTransientErrorOnTeardownOnce: true,
      });
      const env = createNoProvidedForeignFleetEnv();
      const evidence = await prepareOperationalRoleSessions(env, {
        fetch: transientAdminHarness.fetchImpl,
        mask: () => {},
        exportSession: (name, value) => {
          env[name] = value;
        },
        save: () => {},
      });
      expect(evidence.status).toBe("passed");
      const initialAdminSid =
        env.DRTS_OPERATIONAL_PLATFORM_ADMIN_OWNED_SESSION_ID!;
      expect(initialAdminSid).toBeTruthy();

      await expect(
        teardownOperationalRoleSessions(env, {
          fetch: transientAdminHarness.fetchImpl,
          mask: () => {},
          exportSession: (name, value) => {
            env[name] = value;
          },
          save: () => {},
        }),
      ).rejects.toThrow(/Operational role session cleanup failed/);
      expect(
        (
          await transientAdminHarness.identityRepository.getSession(
            initialAdminSid,
          )
        )?.status,
      ).toBe("active");

      const retryResult = await teardownOperationalRoleSessions(env, {
        fetch: transientAdminHarness.fetchImpl,
        mask: () => {},
        exportSession: (name, value) => {
          env[name] = value;
        },
        save: () => {},
      });
      expect(retryResult.status).toBe("passed");
      expect(retryResult.admin_session_revoked).toBe(true);
      expect(transientAdminHarness.issuedAdminSessionIds.length).toBe(2);
      const [firstIssuedSid, secondIssuedSid] =
        transientAdminHarness.issuedAdminSessionIds;
      expect(firstIssuedSid).toBe(initialAdminSid);
      expect(secondIssuedSid).not.toBe(initialAdminSid);
      expect(env.DRTS_OPERATIONAL_PLATFORM_ADMIN_OWNED_SESSION_ID).toBe(
        `${firstIssuedSid},${secondIssuedSid}`,
      );
      expect(
        (
          await transientAdminHarness.identityRepository.getSession(
            firstIssuedSid!,
          )
        )?.status,
      ).toBe("revoked");
      expect(
        (
          await transientAdminHarness.identityRepository.getSession(
            secondIssuedSid!,
          )
        )?.status,
      ).toBe("revoked");

      // 4. R1 regression: when known oldId exists, GET /control-plane-proxy/auth/session transiently fails, and POST /control-plane-proxy/auth/token persists replacement newId on the server but loses its ACK before returning, retry must NOT report passed after revoking only oldId while newId remains active (and must not blindly remint).
      const lostAckEnv: Record<string, string | undefined> = {
        DRTS_CANDIDATE_SHA: CANDIDATE_SHA,
        DRTS_OPERATIONAL_API_URL: API_ORIGIN,
        DRTS_OPERATIONAL_OPS_CONSOLE_URL: OPS_ORIGIN,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_URL: ADMIN_ORIGIN,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_ID_TOKEN: SIM_PLATFORM_ADMIN_ID_TOKEN,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_OWNED_SESSION_ID: oldId,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_RECOVERY_TOKEN: oldToken,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_ISSUED_ATTEMPTED: "true",
        DRTS_OPERATIONAL_PLATFORM_ADMIN_CLEANUP_STATUS: "pending",
        DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_PARTNER_ID: fleetId,
        DRTS_OPERATIONAL_FOREIGN_FLEET_MASTER_CLEANUP_STATUS: "pending",
      };
      const lostAckActive = new Map<string, boolean>([[oldId, true]]);
      let lostAckGetCount = 0;
      let lostAckMintCount = 0;
      const lostAckRevokedIds: string[] = [];
      let lostAckSaved: OperationalRoleSessionsCleanupEvidence | undefined;
      const lostAckFetch = (async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (
          url === `${ADMIN_ORIGIN}/control-plane-proxy/auth/session` &&
          method === "GET"
        ) {
          lostAckGetCount += 1;
          if (lostAckGetCount === 1) {
            throw new TypeError("fetch failed: transient ECONNRESET");
          }
          return jsonResponse({
            data: { active: true, identity: { sessionId: oldId } },
          });
        }
        if (
          url === `${ADMIN_ORIGIN}/control-plane-proxy/auth/token` &&
          method === "POST"
        ) {
          lostAckMintCount += 1;
          lostAckActive.set(newId, true);
          throw new TypeError(
            "socket hang up after server persisted replacement admin session",
          );
        }
        if (
          url ===
            `${ADMIN_ORIGIN}/control-plane-proxy/admin/fleet-partners/${fleetId}` &&
          method === "PUT"
        ) {
          return jsonResponse({
            data: { fleetPartnerId: fleetId, active: false },
          });
        }
        if (
          url === `${API_ORIGIN}/api/auth/sessions/revoke` &&
          method === "POST"
        ) {
          const { sessionId } = JSON.parse(String(init?.body)) as {
            sessionId: string;
          };
          lostAckRevokedIds.push(sessionId);
          lostAckActive.set(sessionId, false);
          return jsonResponse({ data: { sessionId, revoked: true } });
        }
        throw new Error(`Unexpected lostAckFetch HTTP call: ${method} ${url}`);
      }) as typeof fetch;

      await expect(
        teardownOperationalRoleSessions(lostAckEnv, {
          fetch: lostAckFetch,
          mask: () => {},
          exportSession: (name, value) => {
            lostAckEnv[name] = value;
          },
          save: (data) => {
            lostAckSaved = data;
          },
        }),
      ).rejects.toThrow(/Operational role session cleanup failed/);
      expect(lostAckSaved?.status).toBe("failed");
      expect(lostAckSaved?.admin_session_revoked).toBe(false);
      expect(
        lostAckEnv.DRTS_OPERATIONAL_PLATFORM_ADMIN_UNCONFIRMED_ISSUANCE,
      ).toBe("true");
      expect(lostAckEnv.DRTS_OPERATIONAL_PLATFORM_ADMIN_OWNED_SESSION_ID).toBe(
        oldId,
      );
      expect(lostAckActive.get(oldId)).toBe(true);
      expect(lostAckActive.get(newId)).toBe(true);

      await expect(
        teardownOperationalRoleSessions(lostAckEnv, {
          fetch: lostAckFetch,
          mask: () => {},
          exportSession: (name, value) => {
            lostAckEnv[name] = value;
          },
          save: (data) => {
            lostAckSaved = data;
          },
        }),
      ).rejects.toThrow(/Operational role session cleanup failed/);
      expect(lostAckSaved?.status).toBe("failed");
      expect(lostAckSaved?.admin_session_revoked).toBe(false);
      expect(lostAckEnv.DRTS_OPERATIONAL_ROLE_SESSIONS_CLEANUP_STATUS).toBe(
        "failed",
      );
      expect(lostAckEnv.DRTS_OPERATIONAL_PLATFORM_ADMIN_CLEANUP_STATUS).toBe(
        "pending",
      );
      expect(lostAckEnv.DRTS_OPERATIONAL_PLATFORM_ADMIN_SESSION_REVOKED).toBe(
        "false",
      );
      expect(
        lostAckEnv.DRTS_OPERATIONAL_PLATFORM_ADMIN_UNCONFIRMED_ISSUANCE,
      ).toBe("true");
      expect(lostAckMintCount).toBe(1);
      expect(lostAckRevokedIds).toEqual([oldId]);
      expect(lostAckActive.get(oldId)).toBe(false);
      expect(lostAckActive.get(newId)).toBe(true);

      // 5. R2 regression: candidate-SHA-matched HTTP 401 JWT_INVALID on GET /control-plane-proxy/auth/session is NOT authoritative session-ID inactivity; oldId must remain pending and be explicitly revoked via replacement authority, whereas ID-correlated 200 { active: false, identity: { sessionId: oldId } } is authoritative inactivity.
      const jwtInvalidEnv: Record<string, string | undefined> = {
        DRTS_CANDIDATE_SHA: CANDIDATE_SHA,
        DRTS_OPERATIONAL_API_URL: API_ORIGIN,
        DRTS_OPERATIONAL_OPS_CONSOLE_URL: OPS_ORIGIN,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_URL: ADMIN_ORIGIN,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_ID_TOKEN: SIM_PLATFORM_ADMIN_ID_TOKEN,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_OWNED_SESSION_ID: oldId,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_RECOVERY_TOKEN: oldToken,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_ISSUED_ATTEMPTED: "true",
        DRTS_OPERATIONAL_PLATFORM_ADMIN_CLEANUP_STATUS: "pending",
        DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_PARTNER_ID: fleetId,
        DRTS_OPERATIONAL_FOREIGN_FLEET_MASTER_CLEANUP_STATUS: "pending",
      };
      const jwtInvalidActive = new Map<string, boolean>([[oldId, true]]);
      const jwtInvalidRevokedIds: string[] = [];
      let jwtInvalidSaved: OperationalRoleSessionsCleanupEvidence | undefined;
      const jwtInvalidFetch = (async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (
          url === `${ADMIN_ORIGIN}/control-plane-proxy/auth/session` &&
          method === "GET"
        ) {
          return jsonResponse(
            {
              code: "JWT_INVALID",
              message:
                "Access token rejected while durable session row remains active",
            },
            { status: 401 },
          );
        }
        if (
          url === `${ADMIN_ORIGIN}/control-plane-proxy/auth/token` &&
          method === "POST"
        ) {
          jwtInvalidActive.set(newId, true);
          return jsonResponse({ data: { token: newToken, sessionId: newId } });
        }
        if (
          url ===
            `${ADMIN_ORIGIN}/control-plane-proxy/admin/fleet-partners/${fleetId}` &&
          method === "PUT"
        ) {
          return jsonResponse({
            data: { fleetPartnerId: fleetId, active: false },
          });
        }
        if (
          url === `${API_ORIGIN}/api/auth/sessions/revoke` &&
          method === "POST"
        ) {
          const authHeader =
            init?.headers instanceof Headers
              ? init.headers.get("authorization")
              : ((init?.headers as Record<string, string> | undefined)
                  ?.authorization ??
                (init?.headers as Record<string, string> | undefined)
                  ?.Authorization);
          if (authHeader !== `Bearer ${newToken}`) {
            return jsonResponse(
              { code: "JWT_INVALID", message: "Invalid bearer token" },
              { status: 401 },
            );
          }
          const { sessionId } = JSON.parse(String(init?.body)) as {
            sessionId: string;
          };
          jwtInvalidRevokedIds.push(sessionId);
          jwtInvalidActive.set(sessionId, false);
          return jsonResponse({ data: { sessionId, revoked: true } });
        }
        throw new Error(
          `Unexpected jwtInvalidFetch HTTP call: ${method} ${url}`,
        );
      }) as typeof fetch;

      const jwtInvalidResult = await teardownOperationalRoleSessions(
        jwtInvalidEnv,
        {
          fetch: jwtInvalidFetch,
          mask: () => {},
          exportSession: (name, value) => {
            jwtInvalidEnv[name] = value;
          },
          save: (data) => {
            jwtInvalidSaved = data;
          },
        },
      );
      expect(jwtInvalidResult.status).toBe("passed");
      expect(jwtInvalidResult.admin_session_revoked).toBe(true);
      expect(jwtInvalidSaved).toEqual(jwtInvalidResult);
      expect(jwtInvalidRevokedIds).toEqual([oldId, newId]);
      expect(jwtInvalidActive.get(oldId)).toBe(false);
      expect(jwtInvalidActive.get(newId)).toBe(false);

      const correlatedInactiveEnv: Record<string, string | undefined> = {
        DRTS_CANDIDATE_SHA: CANDIDATE_SHA,
        DRTS_OPERATIONAL_API_URL: API_ORIGIN,
        DRTS_OPERATIONAL_OPS_CONSOLE_URL: OPS_ORIGIN,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_URL: ADMIN_ORIGIN,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_ID_TOKEN: SIM_PLATFORM_ADMIN_ID_TOKEN,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_OWNED_SESSION_ID: oldId,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_RECOVERY_TOKEN: oldToken,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_ISSUED_ATTEMPTED: "true",
        DRTS_OPERATIONAL_PLATFORM_ADMIN_CLEANUP_STATUS: "pending",
        DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_PARTNER_ID: fleetId,
        DRTS_OPERATIONAL_FOREIGN_FLEET_MASTER_CLEANUP_STATUS: "pending",
      };
      const correlatedInactive = new Map<string, boolean>([[oldId, false]]);
      const correlatedRevokedIds: string[] = [];
      const correlatedInactiveFetch = (async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (
          url === `${ADMIN_ORIGIN}/control-plane-proxy/auth/session` &&
          method === "GET"
        ) {
          return jsonResponse({
            data: { active: false, identity: { sessionId: oldId } },
          });
        }
        if (
          url === `${ADMIN_ORIGIN}/control-plane-proxy/auth/token` &&
          method === "POST"
        ) {
          correlatedInactive.set(newId, true);
          return jsonResponse({ data: { token: newToken, sessionId: newId } });
        }
        if (
          url ===
            `${ADMIN_ORIGIN}/control-plane-proxy/admin/fleet-partners/${fleetId}` &&
          method === "PUT"
        ) {
          return jsonResponse({
            data: { fleetPartnerId: fleetId, active: false },
          });
        }
        if (
          url === `${API_ORIGIN}/api/auth/sessions/revoke` &&
          method === "POST"
        ) {
          const { sessionId } = JSON.parse(String(init?.body)) as {
            sessionId: string;
          };
          correlatedRevokedIds.push(sessionId);
          correlatedInactive.set(sessionId, false);
          return jsonResponse({ data: { sessionId, revoked: true } });
        }
        throw new Error(
          `Unexpected correlatedInactiveFetch HTTP call: ${method} ${url}`,
        );
      }) as typeof fetch;

      const correlatedInactiveResult = await teardownOperationalRoleSessions(
        correlatedInactiveEnv,
        {
          fetch: correlatedInactiveFetch,
          mask: () => {},
          exportSession: (name, value) => {
            correlatedInactiveEnv[name] = value;
          },
          save: () => {},
        },
      );
      expect(correlatedInactiveResult.status).toBe("passed");
      expect(correlatedInactiveResult.admin_session_revoked).toBe(true);
      expect(correlatedRevokedIds).toEqual([newId]);
      expect(correlatedInactive.get(oldId)).toBe(false);
      expect(correlatedInactive.get(newId)).toBe(false);

      // 6. R3 regression: when foreign resources are already cleaned (passed/deactivated) and only owned Admin session cleanup remains pending with a recovery token that can no longer authorize revoke, teardown checks Admin session and mints replacement Admin authority to revoke [oldId, newId].
      const adminOnlyEnv: Record<string, string | undefined> = {
        DRTS_CANDIDATE_SHA: CANDIDATE_SHA,
        DRTS_OPERATIONAL_API_URL: API_ORIGIN,
        DRTS_OPERATIONAL_OPS_CONSOLE_URL: OPS_ORIGIN,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_URL: ADMIN_ORIGIN,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_ID_TOKEN: SIM_PLATFORM_ADMIN_ID_TOKEN,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_OWNED_SESSION_ID: oldId,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_RECOVERY_TOKEN: oldToken,
        DRTS_OPERATIONAL_PLATFORM_ADMIN_ISSUED_ATTEMPTED: "true",
        DRTS_OPERATIONAL_PLATFORM_ADMIN_CLEANUP_STATUS: "pending",
        DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_PARTNER_ID: fleetId,
        DRTS_OPERATIONAL_FOREIGN_FLEET_MASTER_CLEANUP_STATUS: "passed",
        DRTS_OPERATIONAL_FOREIGN_FLEET_MASTER_DEACTIVATED: "true",
      };
      const adminOnlyActive = new Map<string, boolean>([[oldId, true]]);
      let adminOnlyGetCount = 0;
      let adminOnlyMintCount = 0;
      const adminOnlyRevokedIds: string[] = [];
      const adminOnlyFetch = (async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (
          url === `${ADMIN_ORIGIN}/control-plane-proxy/auth/session` &&
          method === "GET"
        ) {
          adminOnlyGetCount += 1;
          return jsonResponse({
            data: { active: true, identity: { sessionId: oldId } },
          });
        }
        if (
          url === `${ADMIN_ORIGIN}/control-plane-proxy/auth/token` &&
          method === "POST"
        ) {
          adminOnlyMintCount += 1;
          adminOnlyActive.set(newId, true);
          return jsonResponse({ data: { token: newToken, sessionId: newId } });
        }
        if (
          url === `${API_ORIGIN}/api/auth/sessions/revoke` &&
          method === "POST"
        ) {
          const authHeader =
            init?.headers instanceof Headers
              ? init.headers.get("authorization")
              : ((init?.headers as Record<string, string> | undefined)
                  ?.authorization ??
                (init?.headers as Record<string, string> | undefined)
                  ?.Authorization);
          if (authHeader !== `Bearer ${newToken}`) {
            return jsonResponse(
              {
                code: "SESSION_EXPIRED",
                message: "Prior recovery token expired",
              },
              { status: 401 },
            );
          }
          const { sessionId } = JSON.parse(String(init?.body)) as {
            sessionId: string;
          };
          adminOnlyRevokedIds.push(sessionId);
          adminOnlyActive.set(sessionId, false);
          return jsonResponse({ data: { sessionId, revoked: true } });
        }
        throw new Error(
          `Unexpected adminOnlyFetch HTTP call: ${method} ${url}`,
        );
      }) as typeof fetch;

      const adminOnlyResult = await teardownOperationalRoleSessions(
        adminOnlyEnv,
        {
          fetch: adminOnlyFetch,
          mask: () => {},
          exportSession: (name, value) => {
            adminOnlyEnv[name] = value;
          },
          save: () => {},
        },
      );
      expect(adminOnlyResult.status).toBe("passed");
      expect(adminOnlyResult.admin_session_revoked).toBe(true);
      expect(adminOnlyGetCount).toBe(1);
      expect(adminOnlyMintCount).toBe(1);
      expect(adminOnlyRevokedIds).toEqual([oldId, newId]);
      expect(adminOnlyActive.get(oldId)).toBe(false);
      expect(adminOnlyActive.get(newId)).toBe(false);
    });

    it("enforces ACTUAL-ADMIN-PRECONDITION (403 MFA_REQUIRED without dev step-up waiver) and CROSS-INSTANCE-REFERENCE-OBSERVATION (403 STEP_UP_REQUIRED across process-local StepUpProofService Maps) while cleaning up already-created resources", async () => {
      // 1. ACTUAL-ADMIN-PRECONDITION: Admin session minted without dev_token_fallback waiver or recent MFA is rejected by real StepUpProofService with 403 MFA_REQUIRED before any partner entry write is executed.
      const strictHarness = createOwnedForeignFleetRealServiceHarness({
        strictNoDevStepUpWaiver: true,
      });
      const strictEnv = createNoProvidedForeignFleetEnv();
      let strictSaved: OperationalRoleSessionsEvidence | undefined;
      await expect(
        prepareOperationalRoleSessions(strictEnv, {
          fetch: strictHarness.fetchImpl,
          mask: () => {},
          exportSession: (name, value) => {
            strictEnv[name] = value;
          },
          save: (_name, data) => {
            strictSaved = data;
          },
        }),
      ).rejects.toThrow(/MFA_REQUIRED/);

      expect(strictSaved?.status).toBe("failed");
      expect(strictSaved?.foreign_fleet_precondition).toBe(
        "missing-external-fixture",
      );
      expect(strictSaved?.cleanup).toBe("passed");
      // No POST /platform-admin/partner-entries write was executed
      expect(
        strictHarness.calls.some(
          (c) =>
            c.method === "POST" &&
            c.url ===
              `${ADMIN_ORIGIN}/control-plane-proxy/platform-admin/partner-entries`,
        ),
      ).toBe(false);
      const strictCreatedFleetId =
        strictEnv.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_PARTNER_ID!;
      expect(
        (
          await strictHarness.fleetPartnerService.getFleetPartner(
            strictCreatedFleetId,
          )
        ).active,
      ).toBe(false);

      // 2. CROSS-INSTANCE-REFERENCE-OBSERVATION: step-up proof issued on instance A's StepUpProofService Map, write delivered to instance B's BootstrapAuthGuard (separate StepUpProofService Map) -> 403 STEP_UP_REQUIRED, helper fails closed and cleans up already-created Fleet/Driver/Ops/Admin resources.
      const crossInstanceHarness = createOwnedForeignFleetRealServiceHarness({
        crossInstanceStepUpMismatch: true,
      });
      const crossEnv = createNoProvidedForeignFleetEnv();
      let crossSaved: OperationalRoleSessionsEvidence | undefined;
      await expect(
        prepareOperationalRoleSessions(crossEnv, {
          fetch: crossInstanceHarness.fetchImpl,
          mask: () => {},
          exportSession: (name, value) => {
            crossEnv[name] = value;
          },
          save: (_name, data) => {
            crossSaved = data;
          },
        }),
      ).rejects.toThrow(/STEP_UP_REQUIRED/);

      expect(crossSaved?.status).toBe("failed");
      expect(crossSaved?.stage).toBe("foreign_fleet:create-partner-entry");
      expect(crossSaved?.cleanup).toBe("passed");
      const crossCreatedFleetId =
        crossEnv.DRTS_OPERATIONAL_FOREIGN_FLEET_OWNED_PARTNER_ID!;
      expect(
        (
          await crossInstanceHarness.fleetPartnerService.getFleetPartner(
            crossCreatedFleetId,
          )
        ).active,
      ).toBe(false);
    });
  });
});
