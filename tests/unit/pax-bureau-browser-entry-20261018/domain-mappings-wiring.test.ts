import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const domainMappingsWorkflow = path.join(
  repoRoot,
  ".github/workflows/domain-mappings-dev.yml",
);

describe("PAX-BUREAU-BROWSER-ENTRY-20261018: domain-mappings-dev.yml wiring", () => {
  it("exposes DEV_PAX_BUREAU_ENTRY_HOST and calls setup-passenger-public-entry.sh only when it is set", () => {
    const source = readFileSync(domainMappingsWorkflow, "utf8");

    expect(source).toContain(
      "DEV_PAX_BUREAU_ENTRY_HOST: ${{ vars.DEV_PAX_BUREAU_ENTRY_HOST }}",
    );
    expect(source).toContain(
      "./operations/deployment/passenger-bureau-entry/setup-passenger-public-entry.sh",
    );

    const callIndex = source.indexOf(
      "./operations/deployment/passenger-bureau-entry/setup-passenger-public-entry.sh",
    );
    const guardIndex = source.lastIndexOf(
      'if [[ -n "${DEV_PAX_BUREAU_ENTRY_HOST:-}" ]]',
      callIndex,
    );
    expect(guardIndex).toBeGreaterThan(-1);

    // Must run after the existing ride.smarttransport.tw domain mapping, not
    // instead of it: the direct Cloud Run domain mapping stays in place for
    // any caller that already uses an identity token.
    const rideMappingIndex = source.indexOf(
      "ride.smarttransport.tw",
    );
    expect(rideMappingIndex).toBeGreaterThan(-1);
    expect(callIndex).toBeGreaterThan(rideMappingIndex);

    // Passes the same service/region/project the rest of the job already
    // resolved, plus the new host — never a hardcoded project.
    const callLineStart = source.lastIndexOf("\n", callIndex);
    const callLineEnd = source.indexOf("\n", source.indexOf('"', callIndex) + 1);
    const callBlock = source.slice(callLineStart, callLineEnd + 1);
    expect(callBlock).toContain("$passenger_app_service");
    expect(callBlock).toContain("$REGION");
    expect(callBlock).toContain("$PROJECT");
    expect(callBlock).toContain("$DEV_PAX_BUREAU_ENTRY_HOST");
  });

  // ENTRY-R9-UNRELATED-DOMAIN-MAINTENANCE-GATE: the full legacy-inventory
  // job's `set -euo pipefail` run block aborts on the first failing legacy
  // domain mapping, before ever reaching the passenger public-entry call.
  // A reviewer/operator must be able to provision only the passenger
  // front door on an immutable ref, independent of the other ten unrelated
  // legacy domain mappings' verification/mapping outcomes.
  it("ENTRY-R9-UNRELATED-DOMAIN-MAINTENANCE-GATE: offers a passenger-entry-only path independent of the legacy domain inventory", () => {
    const source = readFileSync(domainMappingsWorkflow, "utf8");

    // Default behavior (target=all) is unchanged: full legacy job still
    // gated only on confirm=apply plus the default target.
    expect(source).toContain("default: all");
    expect(source).toMatch(
      /if:\s*\$\{\{\s*inputs\.confirm == 'apply' && inputs\.target == 'all'\s*\}\}/,
    );

    // A genuinely independent job exists, gated on the explicit opt-in
    // target value, that is not reachable through the legacy job's
    // set -euo pipefail run block.
    expect(source).toMatch(
      /if:\s*\$\{\{\s*inputs\.confirm == 'apply' && inputs\.target == 'passenger-entry-only'\s*\}\}/,
    );

    const independentJobIndex = source.indexOf("passenger-public-entry:");
    expect(independentJobIndex).toBeGreaterThan(-1);
    const independentJobBlock = source.slice(independentJobIndex);

    // None of the ten unrelated legacy domain mappings are invoked by the
    // independent job.
    const legacyDomains = [
      "fleets.smarttransport.tw",
      "ops.smarttransport.tw",
      "partners.smarttransport.tw",
      "dispatch.smarttransport.tw",
      "bank.smarttransport.tw",
      "channel.smarttransport.tw",
      "tenant.smarttransport.tw",
      "refer.smarttransport.tw",
      "api.smarttransport.tw",
      "ride.smarttransport.tw",
    ];
    for (const domain of legacyDomains) {
      expect(independentJobBlock).not.toContain(domain);
    }
    expect(independentJobBlock).not.toContain("map-domain-service.sh");

    // It still calls the same reviewed setup script with the same
    // resolved service/region/project/host, not a hardcoded value.
    expect(independentJobBlock).toContain(
      "./operations/deployment/passenger-bureau-entry/setup-passenger-public-entry.sh",
    );
    expect(independentJobBlock).toContain("$passenger_app_service");
    expect(independentJobBlock).toContain("$REGION");
    expect(independentJobBlock).toContain("$PROJECT");
    expect(independentJobBlock).toContain("$DEV_PAX_BUREAU_ENTRY_HOST");

    // Retains the same reviewed active-inventory guard as the legacy job,
    // not a weakened/duplicate check.
    expect(independentJobBlock).toContain(
      "Passenger domain target is outside the reviewed active dev inventory.",
    );
  });
});
