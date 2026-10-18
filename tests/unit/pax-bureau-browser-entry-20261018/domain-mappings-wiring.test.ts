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
});
