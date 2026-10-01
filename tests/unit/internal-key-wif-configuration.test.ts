import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../..");

const workflowPath = path.join(repoRoot, ".github/workflows/deploy-dev.yml");
const registryDocPath = path.join(
  repoRoot,
  "docs/02-architecture/internal-key-exceptions.md",
);

describe("SEC-INTERNAL-KEY-WIF-OPS-READINESS-20261001: deploy-dev WIF assertion reuse", () => {
  it("mints a separate Google identity token for each of the two operational POST /api/auth/token calls", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    const mintSteps = workflow.match(
      /id: id_token_api_operational(_ops)?\n/g,
    );
    expect(mintSteps).not.toBeNull();
    expect(mintSteps).toHaveLength(2);

    expect(workflow).toContain(
      "GOOGLE_ID_TOKEN_TENANT_ADMIN: ${{ steps.id_token_api_operational.outputs.id_token }}",
    );
    expect(workflow).toContain(
      "GOOGLE_ID_TOKEN_TENANT_OPS: ${{ steps.id_token_api_operational_ops.outputs.id_token }}",
    );

    // Neither curl call may fall back to a bare, shared `GOOGLE_ID_TOKEN`
    // variable -- that was the reuse bug (GoogleWorkloadIdentityAdapter
    // rejects a replayed assertion hash with WORKLOAD_ASSERTION_REPLAYED).
    expect(workflow).not.toMatch(/\$\{GOOGLE_ID_TOKEN\}/);

    const headerAssertions = workflow.match(
      /x-drts-google-id-token: \$\{GOOGLE_ID_TOKEN_TENANT_(ADMIN|OPS)\}/g,
    );
    expect(headerAssertions).not.toBeNull();
    expect(headerAssertions).toContain(
      "x-drts-google-id-token: ${GOOGLE_ID_TOKEN_TENANT_ADMIN}",
    );
    expect(headerAssertions).toContain(
      "x-drts-google-id-token: ${GOOGLE_ID_TOKEN_TENANT_OPS}",
    );
    // The two live POST /api/auth/token calls must not send the same
    // assertion variable twice.
    expect(new Set(headerAssertions).size).toBe(2);
  });

  it("still dual-sends the legacy x-drts-internal-key alongside the WIF assertion for caller #9", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    const internalKeyHeaders = workflow.match(
      /x-drts-internal-key: \$\{internal_key\}/g,
    );
    expect(internalKeyHeaders).not.toBeNull();
    expect(internalKeyHeaders!.length).toBeGreaterThanOrEqual(2);
  });
});

describe("SEC-INTERNAL-KEY-WIF-OPS-READINESS-20261001: WIF registry operator doc audience accuracy", () => {
  it("no longer tells ops to register the token-exchange audience for the Google-assertion callers", () => {
    const doc = readFileSync(registryDocPath, "utf8");

    // The old (wrong) instruction set both entries' audience directly
    // beneath the "Both entries need `principalId`" line. That adjacency
    // must be gone -- the string itself may still appear elsewhere as
    // quoted history of the bug (e.g. in this task's own before/after
    // evidence row), which is fine.
    expect(doc).not.toMatch(
      /Both entries need `principalId`[^\n]*\n[^\n]*\nallowedTokenAudiences: \["https:\/\/auth\.dev\.drts\.internal\/token-exchange"\]/,
    );
    expect(doc).toContain(
      "**Audience correction (`SEC-INTERNAL-KEY-WIF-OPS-READINESS-20261001`):**",
    );
    expect(doc).toMatch(
      /line above previously said both entries need\n`allowedTokenAudiences: \["https:\/\/auth\.dev\.drts\.internal\/token-exchange"\]`/,
    );
  });

  it("documents the actual minted audience (API Cloud Run origin) for both registry entries", () => {
    const doc = readFileSync(registryDocPath, "utf8");

    expect(doc).toContain("Audience correction");
    expect(doc).toContain("WORKLOAD_AUDIENCE_MISMATCH");
    expect(doc).toContain(
      "apps/partner-booking-web/lib/api-client.ts:100-104",
    );
    expect(doc).toContain(
      "needs.health-check.outputs.api",
    );
    expect(doc).toContain("DEV_IAP_CLIENT_ID");
  });

  it("does not remove INTERNAL_KEY_EXCP_002 or the legacy internal-key fallback", () => {
    const doc = readFileSync(registryDocPath, "utf8");
    const workflow = readFileSync(workflowPath, "utf8");

    expect(doc).toContain("INTERNAL_KEY_EXCP_002");
    expect(doc).toContain("INTERNAL_KEY_EXCP_002` and the dual-send legacy-key fallback are untouched");
    expect(workflow).toContain("x-drts-internal-key");
  });
});

describe("SEC-INTERNAL-KEY-WIF-PROXY-REPLAY-20261001: deploy-dev CI authorization actorType matches the documented registry grant", () => {
  it("both operational-acceptance POST /api/auth/token calls send the literal x-actor-type header actually documented for their ciTenantActorGrants entry", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    // Both calls (Tenant Admin actor ...901 and the Tenant Ops dispatch actor
    // ...902) send the same literal x-actor-type header; only x-actor-id
    // differs. The resulting *session role* for ...902 comes out as
    // tenant_ops_admin from the durable tenant-user fixture lookup, not from
    // this header -- so the registry's ciTenantActorGrants entry for ...902
    // must match the header's actual actorType (tenant_admin), not the
    // session's eventual role.
    const actorTypeHeaders = workflow.match(/x-actor-type: (tenant_admin|tenant_ops_admin)'/g);
    expect(actorTypeHeaders).not.toBeNull();
    expect(actorTypeHeaders).toHaveLength(2);
    for (const header of actorTypeHeaders!) {
      expect(header).toBe("x-actor-type: tenant_admin'");
    }
  });

  it("documents both ciTenantActorGrants entries (actorId ...901 and ...902) with actorType tenant_admin, matching the workflow header", () => {
    const doc = readFileSync(registryDocPath, "utf8");

    expect(doc).toContain(
      '{tenantId: "10000000-0000-0000-0000-000000000201", actorType: "tenant_admin", actorId: "10000000-0000-0000-0000-000000000901"}',
    );
    expect(doc).toContain(
      '{tenantId: "10000000-0000-0000-0000-000000000201", actorType: "tenant_admin", actorId: "10000000-0000-0000-0000-000000000902"}',
    );
    // The old, wrong recommendation (a tenant_ops_admin *grant*, as opposed
    // to the still-correct tenant_ops_admin *resulting session role*) must
    // be gone from both places that previously stated it.
    expect(doc).not.toMatch(/\.\.\.000902` \/ `tenant_ops_admin` pair\) and sets/);
    expect(doc).not.toMatch(
      /the `\.\.\.000902` \/ `tenant_ops_admin` pair, exactly as §7\.2 item 1 already specified\./,
    );
  });
});

describe("SEC-INTERNAL-KEY-WIF-PROXY-REPLAY-20261001: registry doc documents a pasteable two-entry registry JSON", () => {
  it("provides a directly pasteable WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS JSON array with the verified service accounts", () => {
    const doc = readFileSync(registryDocPath, "utf8");

    expect(doc).toContain(
      "drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com",
    );
    expect(doc).toContain(
      "github-actions-deployer@drts-dev-devcc-20260825.iam.gserviceaccount.com",
    );
    expect(doc).toContain("WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS=");
    expect(doc).toMatch(/```json\n\[\s*\n\s*\{/);
  });
});
